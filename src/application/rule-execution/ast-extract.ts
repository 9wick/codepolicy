import type Parser from 'tree-sitter';

export function getNameFromDeclaration(node: Parser.SyntaxNode): string | null {
  return node.childForFieldName('name')?.text ?? null;
}

export function extractSignature(node: Parser.SyntaxNode, sourceCode: string): string {
  const body = node.childForFieldName('body');
  if (!body) return node.text;
  return sourceCode.slice(node.startIndex, body.startIndex).trimEnd();
}
