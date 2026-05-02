import fs from 'node:fs/promises';
import path from 'node:path';

import { codepolicyConfigFileSchema } from '../src/shared/schema-definitions';

const schemaDir = path.join(import.meta.dirname, '..', 'schemas');

function addMetaSchema(schema: object): object {
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    ...schema,
  };
}

async function writeSchema(fileName: string, schema: object): Promise<void> {
  const filePath = path.join(schemaDir, fileName);
  const content = `${JSON.stringify(schema, null, 2)}\n`;
  await fs.writeFile(filePath, content, 'utf-8');
}

async function main(): Promise<void> {
  await fs.mkdir(schemaDir, { recursive: true });

  await writeSchema('codepolicy-config.schema.json', addMetaSchema(codepolicyConfigFileSchema));
}

await main();
