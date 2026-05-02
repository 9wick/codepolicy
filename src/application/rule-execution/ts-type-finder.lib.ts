import type Parser from 'tree-sitter';

import type { RuleScope, ScopeUnit } from '../../shared/types';

import { getNameFromDeclaration } from './ast-extract';

const TYPE_SCOPE_TYPES = new Map<string, RuleScope>([
  ['type_alias_declaration', 'type'],
  ['interface_declaration', 'interface'],
]);

export function findEnclosingNamedTypeScope(
  tree: Parser.Tree,
  filePath: string,
  lineNumber: number,
): ScopeUnit | null {
  const targetRow = lineNumber - 1;
  let current: Parser.SyntaxNode | null = tree.rootNode.descendantForPosition({
    row: targetRow,
    column: 0,
  });

  while (current) {
    const scopeType = TYPE_SCOPE_TYPES.get(current.type);
    if (scopeType) {
      const name = getNameFromDeclaration(current);
      if (name) {
        return {
          filePath,
          scopeType,
          name,
          code: current.text,
          startLine: current.startPosition.row + 1,
          endLine: current.endPosition.row + 1,
        };
      }
    }
    current = current.parent;
  }

  return null;
}
