import { defineCommand } from 'citty';

import { listAnthropicModels } from '../../infrastructure/llm/anthropic-model-lister';
import { listCodexModels } from '../../infrastructure/llm/codex-model-lister';
import { OpenCodeModelLister } from '../../infrastructure/llm/opencode-model-lister';
import { getAppContainer } from '../../shared/container';

type Row = { provider: string; id: string; description: string };

function printTable(rows: Row[]): void {
  if (rows.length === 0) return;
  const pW = Math.max('PROVIDER'.length, ...rows.map((r) => r.provider.length));
  const iW = Math.max('MODEL'.length, ...rows.map((r) => r.id.length));
  const header = `${'PROVIDER'.padEnd(pW)}  ${'MODEL'.padEnd(iW)}  DESCRIPTION`;
  console.log(header);
  console.log('-'.repeat(header.length));
  for (const r of rows) {
    console.log(`${r.provider.padEnd(pW)}  ${r.id.padEnd(iW)}  ${r.description}`);
  }
}

export default defineCommand({
  meta: {
    name: 'list',
    description: 'List available LLM models',
  },
  args: {
    provider: {
      type: 'string',
      description: 'Filter by provider (anthropic, codex, or opencode)',
    },
  },
  async run({ args }) {
    const providers = args.provider ? [args.provider] : ['codex', 'anthropic', 'opencode'];
    const rows: Row[] = [];

    for (const provider of providers) {
      if (provider === 'codex') {
        const result = await listCodexModels();
        result.match(
          (models) => {
            for (const m of models)
              rows.push({ provider: 'codex', id: m.id, description: m.description });
          },
          (e) => console.error(`[codex] Error: ${e.message}`),
        );
      } else if (provider === 'anthropic') {
        const result = await listAnthropicModels(process.env);
        result.match(
          (models) => {
            for (const m of models)
              rows.push({ provider: 'anthropic', id: m.id, description: m.description });
          },
          (e) => console.error(`[anthropic] Error: ${e.message}`),
        );
      } else if (provider === 'opencode') {
        const result = await getAppContainer().get(OpenCodeModelLister).listModels();
        result.match(
          (models) => {
            for (const m of models)
              rows.push({ provider: 'opencode', id: m.id, description: m.displayName });
          },
          (e) => console.error(`[opencode] Error: ${e.message}`),
        );
      } else {
        console.error(`Unknown provider: ${provider}`);
      }
    }

    printTable(rows);
  },
});
