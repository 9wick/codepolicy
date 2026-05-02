import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { injectable } from '@needle-di/core';
import { ResultAsync, okAsync } from 'neverthrow';
import Parser from 'tree-sitter';
import TypeScript from 'tree-sitter-typescript';

import type { CodepolicyError } from '../../shared/errors';
import { codepolicyError } from '../../shared/errors';
import type { ChangedFile, ResolvedRule, RuleScope, ScopeUnit } from '../../shared/types';

import { findEnclosingNamedFunction } from './ts-function-finder.lib';
import { findEnclosingNamedTypeScope } from './ts-type-finder.lib';

function createParser(): Parser {
  const parser = new Parser();
  // @ts-expect-error tree-sitter-typescript type mismatch with tree-sitter's Language type
  parser.setLanguage(TypeScript.typescript);
  return parser;
}

function buildFileScopeUnit(filePath: string, sourceCode: string): ScopeUnit {
  const lines = sourceCode.split('\n');
  return {
    filePath,
    scopeType: 'file',
    name: path.basename(filePath),
    code: sourceCode,
    startLine: 1,
    endLine: lines.length,
  };
}

function extractUniqueScopes(rules: ResolvedRule[]): Set<RuleScope> {
  return new Set(rules.flatMap((r) => (Array.isArray(r.scope) ? r.scope : [r.scope])));
}

function addIfUnseen(seen: Set<string>, key: string, add: () => void): void {
  if (!seen.has(key)) {
    seen.add(key);
    add();
  }
}

function expandLineRanges(lineRanges: { start: number; end: number }[]): number[] {
  const lines: number[] = [];
  for (const range of lineRanges) {
    for (let i = range.start; i <= range.end; i++) {
      lines.push(i);
    }
  }
  return lines;
}

function isRequestedTypeScope(
  scopeUnit: ScopeUnit,
  needsType: boolean,
  needsInterface: boolean,
): boolean {
  return (
    (scopeUnit.scopeType === 'type' && needsType) ||
    (scopeUnit.scopeType === 'interface' && needsInterface)
  );
}

function addScopeUnit(results: ScopeUnit[], seen: Set<string>, scopeUnit: ScopeUnit): void {
  const key = `${scopeUnit.scopeType}:${scopeUnit.filePath}:${scopeUnit.startLine}`;
  addIfUnseen(seen, key, () => results.push(scopeUnit));
}

@injectable()
export class ScopeExtractor {
  extract(
    changedFiles: ChangedFile[],
    rules: ResolvedRule[],
  ): ResultAsync<ScopeUnit[], CodepolicyError> {
    const scopes = extractUniqueScopes(rules);
    const needsFunction =
      scopes.has('function') || scopes.has('exported-function') || scopes.has('test-case');
    const needsFile = scopes.has('file');
    const needsType = scopes.has('type');
    const needsInterface = scopes.has('interface');

    return this.extractAll(changedFiles, needsFunction, needsFile, needsType, needsInterface);
  }

  private extractAll(
    changedFiles: ChangedFile[],
    needsFunction: boolean,
    needsFile: boolean,
    needsType: boolean,
    needsInterface: boolean,
  ): ResultAsync<ScopeUnit[], CodepolicyError> {
    const parser = createParser();
    const results: ScopeUnit[] = [];
    const seen = new Set<string>();

    let chain: ResultAsync<void, CodepolicyError> = okAsync(undefined);

    for (const file of changedFiles) {
      chain = chain.andThen(() =>
        ResultAsync.fromPromise(readFile(file.filePath, 'utf-8'), (error) =>
          codepolicyError(
            'FILE_READ_ERROR',
            `Failed to read source file: ${error instanceof Error ? error.message : String(error)}`,
            error,
          ),
        ).map((sourceCode) => {
          this.extractFromFile(
            file,
            sourceCode,
            parser,
            needsFunction,
            needsFile,
            needsType,
            needsInterface,
            results,
            seen,
          );
        }),
      );
    }

    return chain.map(() => results);
  }

  private extractFromFile(
    file: ChangedFile,
    sourceCode: string,
    parser: Parser,
    needsFunction: boolean,
    needsFile: boolean,
    needsType: boolean,
    needsInterface: boolean,
    results: ScopeUnit[],
    seen: Set<string>,
  ): void {
    if (needsFile) {
      addIfUnseen(seen, `file:${file.filePath}`, () =>
        results.push(buildFileScopeUnit(file.filePath, sourceCode)),
      );
    }

    if (!needsFunction && !needsType && !needsInterface) {
      return;
    }

    const tree = parser.parse(sourceCode);
    const diffLines = expandLineRanges(file.lineRanges);

    if (needsFunction) {
      this.extractFunctionRelatedScopes(
        file,
        sourceCode,
        tree,
        diffLines,
        needsType,
        needsInterface,
        results,
        seen,
      );
      return;
    }

    this.extractTypeRelatedScopes(
      file,
      sourceCode,
      tree,
      diffLines,
      needsType,
      needsInterface,
      results,
      seen,
    );
  }

  private extractFunctionRelatedScopes(
    file: ChangedFile,
    sourceCode: string,
    tree: Parser.Tree,
    diffLines: number[],
    needsType: boolean,
    needsInterface: boolean,
    results: ScopeUnit[],
    seen: Set<string>,
  ): void {
    for (const line of diffLines) {
      const functionScope = findEnclosingNamedFunction(tree, sourceCode, file.filePath, line);
      const typeScope =
        needsType || needsInterface ? findEnclosingNamedTypeScope(tree, file.filePath, line) : null;

      if (functionScope) {
        addScopeUnit(results, seen, functionScope);
      }
      if (typeScope && isRequestedTypeScope(typeScope, needsType, needsInterface)) {
        addScopeUnit(results, seen, typeScope);
      }
      if (!functionScope && !typeScope) {
        addIfUnseen(seen, `file:${file.filePath}`, () =>
          results.push(buildFileScopeUnit(file.filePath, sourceCode)),
        );
      }
    }
  }

  private extractTypeRelatedScopes(
    file: ChangedFile,
    sourceCode: string,
    tree: Parser.Tree,
    diffLines: number[],
    needsType: boolean,
    needsInterface: boolean,
    results: ScopeUnit[],
    seen: Set<string>,
  ): void {
    for (const line of diffLines) {
      const typeScope = findEnclosingNamedTypeScope(tree, file.filePath, line);
      if (typeScope && isRequestedTypeScope(typeScope, needsType, needsInterface)) {
        addScopeUnit(results, seen, typeScope);
        continue;
      }
      addIfUnseen(seen, `file:${file.filePath}`, () =>
        results.push(buildFileScopeUnit(file.filePath, sourceCode)),
      );
    }
  }
}
