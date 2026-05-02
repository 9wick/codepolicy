import type Parser from 'tree-sitter';

import type { ScopeUnit } from '../../shared/types';

export type AstFingerprint = Map<string, number>;

export type ScopeFingerprint = {
  scope: ScopeUnit;
  fingerprint: AstFingerprint;
};

export type SimilarCandidate = {
  scope: ScopeUnit;
  similarity: number;
};

export function computeFingerprint(rootNode: Parser.SyntaxNode): AstFingerprint {
  const counts: AstFingerprint = new Map();

  function walk(node: Parser.SyntaxNode): void {
    counts.set(node.type, (counts.get(node.type) ?? 0) + 1);
    for (const child of node.children) {
      walk(child);
    }
  }

  walk(rootNode);
  return counts;
}

export function cosineSimilarity(a: AstFingerprint, b: AstFingerprint): number {
  if (a.size === 0 || b.size === 0) return 0;

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (const [key, valA] of a) {
    normA += valA * valA;
    const valB = b.get(key);
    if (valB !== undefined) {
      dot += valA * valB;
    }
  }

  for (const valB of b.values()) {
    normB += valB * valB;
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dot / denominator;
}

function isNested(a: ScopeFingerprint, b: ScopeFingerprint): boolean {
  return (
    (a.scope.startLine <= b.scope.startLine && b.scope.endLine <= a.scope.endLine) ||
    (b.scope.startLine <= a.scope.startLine && a.scope.endLine <= b.scope.endLine)
  );
}

export function findSimilarScopes(
  target: ScopeFingerprint,
  candidates: ScopeFingerprint[],
  threshold: number,
): SimilarCandidate[] {
  const results: SimilarCandidate[] = [];

  for (const candidate of candidates) {
    if (candidate.scope.filePath === target.scope.filePath) {
      if (candidate.scope.startLine === target.scope.startLine) continue;
      if (isNested(target, candidate)) continue;
    }

    const similarity = cosineSimilarity(target.fingerprint, candidate.fingerprint);
    if (similarity >= threshold) {
      results.push({ scope: candidate.scope, similarity });
    }
  }

  results.sort((a, b) => b.similarity - a.similarity);
  return results;
}
