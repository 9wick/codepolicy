import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';
import { expect, it } from 'vitest';

import { createLlmHelper } from '../application/rule-execution/create-llm-helper';
import { extractSignature } from '../application/rule-execution/ast-extract';

import type { RuleDefinition, ScopeContext } from './rule-types';

declare const CODEPOLICY_TEST_AGENT: string | undefined;

type TestCase = {
  name: string;
  code: string;
  filePath?: string;
  scopeName?: string;
  scopeType?: ScopeContext['scopeType'];
  fileTree?: string;
  options?: Record<string, unknown>;
  testFiles?: Record<string, string>;
};

type RuleTesterOptions = {
  rule: RuleDefinition;
  valid: TestCase[];
  invalid: TestCase[];
};

const LLM_TEST_TIMEOUT = 120_000;

function pickScope(scope: RuleDefinition['meta']['scope']): ScopeContext['scopeType'] {
  if (Array.isArray(scope)) {
    const first = scope[0];
    if (!first) {
      return 'function';
    }
    return first;
  }
  return scope;
}

function extractSignatureFromCode(code: string): string | undefined {
  const parser = new Parser();
  // @ts-expect-error tree-sitter-typescript type mismatch with tree-sitter's Language type
  parser.setLanguage(TypeScript.typescript);
  const node = findFirstFunction(parser.parse(code).rootNode);
  if (!node) return undefined;
  return extractSignature(node, code);
}

function findFirstFunction(node: Parser.SyntaxNode): Parser.SyntaxNode | null {
  const funcTypes = new Set([
    'function_declaration',
    'method_definition',
    'arrow_function',
    'function_expression',
  ]);
  if (funcTypes.has(node.type)) return node;
  for (const child of node.children) {
    const found = findFirstFunction(child);
    if (found) return found;
  }
  return null;
}

function makeScopeContext(testCase: TestCase, rule: RuleDefinition): ScopeContext {
  const scopeType = testCase.scopeType ?? pickScope(rule.meta.scope);
  return {
    source: testCase.code,
    filePath: testCase.filePath ?? 'test.ts',
    scopeType,
    name: testCase.scopeName ?? 'testTarget',
    signature: extractSignatureFromCode(testCase.code),
    fileTree: testCase.fileTree,
    startLine: 1,
    endLine: testCase.code.split('\n').length,
  };
}

async function setupTestDir(testFiles: Record<string, string>): Promise<string> {
  const tmpDir = path.join(tmpdir(), `codepolicy-test-${Date.now()}`);
  for (const [filePath, source] of Object.entries(testFiles)) {
    const fullPath = path.join(tmpDir, filePath);
    await mkdir(path.dirname(fullPath), { recursive: true });
    await writeFile(fullPath, source);
  }
  return tmpDir;
}

async function runTestCase(
  rule: RuleDefinition,
  testCase: TestCase,
): Promise<{ score: number; reason: string }> {
  const workingDir = testCase.testFiles ? await setupTestDir(testCase.testFiles) : '.';
  const evaluatorResult = await rule.create(workingDir, testCase.options);
  if (evaluatorResult.isErr()) {
    expect.fail(`Rule init failed: ${evaluatorResult.error.message}`);
  }

  const scopeCtx = makeScopeContext(testCase, rule);
  if (typeof CODEPOLICY_TEST_AGENT !== 'string') {
    expect.fail('CODEPOLICY_TEST_AGENT must be defined in vitest.config.ts');
  }
  const helper = createLlmHelper(scopeCtx, CODEPOLICY_TEST_AGENT, workingDir);
  const ctx = { ...scopeCtx, llm: helper };

  const result = await evaluatorResult.value(ctx);
  if (result.isErr()) {
    expect.fail(`Rule execution failed: ${result.error.message}`);
  }
  return result.value;
}

export function ruleTester(options: RuleTesterOptions): void {
  const { rule, valid, invalid } = options;

  for (const testCase of valid) {
    it(
      testCase.name,
      async () => {
        const { score, reason } = await runTestCase(rule, testCase);
        expect(score, `[valid] score=${score} reason=${reason}`).toBeGreaterThanOrEqual(
          rule.meta.threshold,
        );
      },
      LLM_TEST_TIMEOUT,
    );
  }

  for (const testCase of invalid) {
    it(
      testCase.name,
      async () => {
        const { score, reason } = await runTestCase(rule, testCase);
        expect(score, `[invalid] score=${score} reason=${reason}`).toBeLessThan(
          rule.meta.threshold,
        );
      },
      LLM_TEST_TIMEOUT,
    );
  }
}
