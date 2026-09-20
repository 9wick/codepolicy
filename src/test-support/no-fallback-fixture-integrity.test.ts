import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { cases } from './jev-fixtures/no-implicit-fallback';
import { semanticCases } from './jev-fixtures/no-implicit-fallback-semantics';

const legacyHashes: readonly (readonly [string, string])[] = [
  [
    'no-implicit-fallback/development/additional-1',
    'c7ebe2ce67fb4244ffaa7f950877751cbde2302a76632c18bfce251e76042127',
  ],
  [
    'no-implicit-fallback/development/additional-2',
    '95d73abd3eb580f23d6c0e159a3921bfcdd761eb5f4811533dd52781cb32383b',
  ],
  [
    'no-implicit-fallback/development/additional-3',
    '67d5d9e8823df942f4a6345a374e3a0a2ac625f6421c721f175f164ef2e2a5fb',
  ],
  [
    'no-implicit-fallback/development/boundary-default-with-swallowed-failure',
    '38c2f4588c4371ef4faa97bceebb2d1dc91c46a91d68f7252b906209ba7643f4',
  ],
  [
    'no-implicit-fallback/development/legacy-invalid-1',
    '2bd6928cfb07d5d21b32354b82871f70237301cdb1293db297a6fe0a02cf7784',
  ],
  [
    'no-implicit-fallback/development/legacy-invalid-2',
    'bb2cd6bfba2a7775ff5dedeab15ebd9a0c19c59993bc855c0a04759711c08b0f',
  ],
  [
    'no-implicit-fallback/development/legacy-valid-1',
    '9f5f4e30790e3260a512e8463e190a462b493e56461cee75800e522ae6066e6a',
  ],
  [
    'no-implicit-fallback/development/technical-default',
    '806c90f3a94649afc082aca88ae97f6f62b60c0d0c0679e94bb950ab2ec49972',
  ],
  [
    'no-implicit-fallback/evaluation/additional-4',
    '3b233390351e30d9766f265ff2dd7b9067102609130f15edcfb449e5bf65e6b0',
  ],
  [
    'no-implicit-fallback/evaluation/additional-5',
    '3f207849774a1d6a1cd3706c4681e9e8d0b70725e9bb0af6a33c3a1b368f37b8',
  ],
  [
    'no-implicit-fallback/evaluation/additional-6',
    '718261158c217600e7db83270a87cb7fd5ddeea3d15cceb398e236bf93851d8c',
  ],
  [
    'no-implicit-fallback/evaluation/additional-7',
    'e4c8f5a240667157fa08a6bc1cbb95c6604a3807cabc2f1cb550861e02372af1',
  ],
];
const semanticHashes: readonly (readonly [string, string])[] = [
  [
    'no-implicit-fallback/semantics/development/both-losses',
    '3ee7df1df675dca229c3cde192b6c957506cad711cba7c1cde0b2b482b1e530a',
  ],
  [
    'no-implicit-fallback/semantics/development/failure-status',
    '38d51a24180b7696fde0325ea1d24cd2acb09468a9b5a25d66a894a0c645c6d3',
  ],
  [
    'no-implicit-fallback/semantics/development/local-counter',
    '3521b62a94bb649caa78246fdb27835a9ba8f3f0016728affdd26bdb5141864b',
  ],
  [
    'no-implicit-fallback/semantics/development/mixed-input-paths',
    '9d9ed567388589db21fe010e53b812c19fd26701377c920b8e59851a3dcb7925',
  ],
  [
    'no-implicit-fallback/semantics/development/preserved-error',
    '33701908c19ab83d9fe4ce073c9a18d354d3c5142af64d949baad6c640a9babd',
  ],
  [
    'no-implicit-fallback/semantics/development/raw-input',
    '556ce936ad14a98ca7cb2a62fb8a7d3a91c7e714928aeea15f994a0a4ed50715',
  ],
  [
    'no-implicit-fallback/semantics/development/technical-radix',
    '3d9edc3ab259dcaeff63eaf4bad5c4bc8cf4437812e785bb7d49926079600778',
  ],
  [
    'no-implicit-fallback/semantics/development/unknown-usage',
    '7c32d912cdb0c492e02ef145fbcd81161f3b28f4b4fabc13890a5e15598eda5d',
  ],
  [
    'no-implicit-fallback/semantics/evaluation/measurement-map',
    'c6cb760f44b43a876b3f7426f32ced1c1a5c1ed97789a48d78a567ac8ccf436f',
  ],
  [
    'no-implicit-fallback/semantics/evaluation/missing-contract',
    '288f913c5562095e19cbb11c604e0aeee56d12e74de8d1d52b9af298cb108fec',
  ],
  [
    'no-implicit-fallback/semantics/evaluation/mixed-failure-paths',
    'db3357f3f77aa96c65e0050d39a4b05a1527688232f47bfd2866179d80399480',
  ],
  [
    'no-implicit-fallback/semantics/evaluation/preserved-update',
    'cc42f783408e37fddbead4e5becaea54a427d77d5419fa66e115ba4a55987974',
  ],
];

function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}
function ordered(entries: readonly (readonly [string, string])[]) {
  return [...entries].sort(([left], [right]) => left.localeCompare(right));
}

describe('no-fallback cumulative regression fixtures', () => {
  it('preserves all historical cases, including their source, context and original expectations', () => {
    expect(ordered(cases.map((item) => [item.id, digest(item)]))).toEqual(legacyHashes);
  });

  it('retains all twelve semantic cases and both expected observations without replacement', () => {
    expect(ordered(semanticCases.map((item) => [item.testCase.id, digest(item)]))).toEqual(
      semanticHashes,
    );
    const ids = [...cases.map((item) => item.id), ...semanticCases.map((item) => item.testCase.id)];
    expect(ids).toHaveLength(24);
    expect(new Set(ids).size).toBe(24);
  });

  it('registers all historical Jev/baseline cases and all semantic cases without executing APIs', () => {
    const output = execFileSync(
      process.execPath,
      [
        'node_modules/vitest/vitest.mjs',
        'list',
        '--config',
        'vitest.rules.config.ts',
        'src/rules/jev-no-implicit-fallback/rule.test.ts',
        '--json',
      ],
      { encoding: 'utf8' },
    );
    expect(output.match(/"name":/g)).toHaveLength(36);
    for (const [id] of legacyHashes) {
      expect(output).toContain(`> Jev: ${id}"`);
      expect(output).toContain(`> baseline: ${id}"`);
    }
    for (const [id] of semanticHashes) {
      expect(output).toContain(`> Jev semantics: ${id}"`);
    }
  }, 30_000);
});
