import type Parser from 'tree-sitter';

import type { ScopeUnit } from '../../shared/types';

import { extractSignature, getNameFromDeclaration } from './ast-extract';

const NAMED_FUNCTION_TYPES = new Set([
  'function_declaration',
  'method_definition',
  'arrow_function',
  'function_expression',
]);

function getNameFromVariableParent(node: Parser.SyntaxNode): string | null {
  const parent = node.parent;
  if (parent?.type === 'variable_declarator') {
    return parent.childForFieldName('name')?.text ?? null;
  }
  return null;
}

function getCalleeIdentifier(callExpr: Parser.SyntaxNode): string | null {
  const callee = callExpr.children[0];
  if (callee?.type === 'identifier') return callee.text;
  return null;
}

function getFirstStringArg(callExpr: Parser.SyntaxNode): string | null {
  const args = callExpr.children.find((c) => c.type === 'arguments');
  if (!args) return null;
  const firstChild = args.namedChildren[0];
  if (firstChild?.type === 'string') {
    return firstChild.text.slice(1, -1);
  }
  return null;
}

function collectDescribeChain(callExpr: Parser.SyntaxNode): string[] {
  const chain: string[] = [];
  let current: Parser.SyntaxNode | null = callExpr.parent;
  while (current) {
    if (current.type === 'call_expression' && getCalleeIdentifier(current) === 'describe') {
      const desc = getFirstStringArg(current);
      if (desc) chain.unshift(desc);
    }
    current = current.parent;
  }
  return chain;
}

const TEST_CALLEE_NAMES = new Set(['it', 'test']);

function findEnclosingTestCall(node: Parser.SyntaxNode): Parser.SyntaxNode | null {
  const args = node.parent;
  if (args?.type !== 'arguments') return null;
  const callExpr = args.parent;
  if (callExpr?.type !== 'call_expression') return null;
  const callee = getCalleeIdentifier(callExpr);
  if (!callee || !TEST_CALLEE_NAMES.has(callee)) return null;
  return callExpr;
}

function getNameFromTestCall(node: Parser.SyntaxNode): string | null {
  const callExpr = findEnclosingTestCall(node);
  if (!callExpr) return null;
  const testDesc = getFirstStringArg(callExpr);
  if (!testDesc) return null;
  const chain = collectDescribeChain(callExpr);
  chain.push(testDesc);
  return chain.join(' > ');
}

function isTestCaseNode(node: Parser.SyntaxNode): boolean {
  return findEnclosingTestCall(node) !== null;
}

function isExportedNode(node: Parser.SyntaxNode): boolean {
  let current: Parser.SyntaxNode | null = node;
  while (current) {
    if (current.type === 'export_statement') return true;
    current = current.parent;
  }
  return false;
}

function extractFunctionName(node: Parser.SyntaxNode): string | null {
  if (node.type === 'function_declaration' || node.type === 'method_definition') {
    return getNameFromDeclaration(node);
  }

  if (node.type === 'arrow_function' || node.type === 'function_expression') {
    return getNameFromVariableParent(node) ?? getNameFromTestCall(node);
  }

  return null;
}

function extractScopeType(node: Parser.SyntaxNode): 'function' | 'test-case' {
  return isTestCaseNode(node) ? 'test-case' : 'function';
}

export function findEnclosingNamedFunction(
  tree: Parser.Tree,
  sourceCode: string,
  filePath: string,
  lineNumber: number,
): ScopeUnit | null {
  const targetRow = lineNumber - 1;
  let current: Parser.SyntaxNode | null = tree.rootNode.descendantForPosition({
    row: targetRow,
    column: 0,
  });

  while (current) {
    if (NAMED_FUNCTION_TYPES.has(current.type)) {
      const name = extractFunctionName(current);
      if (name) {
        return {
          filePath,
          scopeType: extractScopeType(current),
          name,
          code: current.text,
          signature: extractSignature(current, sourceCode),
          isExported: isExportedNode(current),
          startLine: current.startPosition.row + 1,
          endLine: current.endPosition.row + 1,
        };
      }
    }
    current = current.parent;
  }

  return null;
}
