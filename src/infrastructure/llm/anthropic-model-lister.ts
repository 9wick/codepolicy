import { spawn } from 'node:child_process';

import { Result, ResultAsync, err, ok } from 'neverthrow';

export type AnthropicModel = {
  id: string;
  displayName: string;
  description: string;
};

const SCRIPT = `
import { query } from '@anthropic-ai/claude-agent-sdk';
const q = query({
  prompt: '',
  options: { model: 'sonnet', permissionMode: 'bypassPermissions', maxTurns: 0 },
});
for await (const msg of q) {
  if (msg.type === 'system') {
    const models = await q.supportedModels();
    process.stdout.write(JSON.stringify(models));
    q.close();
    break;
  }
  if (msg.type === 'result') { q.close(); break; }
}
process.exit(0);
`;

const TIMEOUT_MS = 15_000;

function spawnAndCollect(parentEnv: NodeJS.ProcessEnv) {
  return new Promise<Result<string, Error>>((resolve) => {
    const env = { ...parentEnv };
    delete env['CLAUDECODE'];

    const child = spawn('bun', ['-e', SCRIPT], { env, stdio: ['ignore', 'pipe', 'ignore'] });
    let stdout = '';

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    const timer = setTimeout(() => {
      child.kill();
      resolve(err(new Error('Timeout waiting for Claude Code model list')));
    }, TIMEOUT_MS);

    child.on('close', () => {
      clearTimeout(timer);
      if (stdout.length > 0) {
        resolve(ok(stdout));
      } else {
        resolve(err(new Error('Claude Code returned no model data')));
      }
    });

    child.on('error', (e) => {
      clearTimeout(timer);
      resolve(err(new Error(`Failed to list Anthropic models: ${e.message}`)));
    });
  });
}

const safeJsonParse = Result.fromThrowable(
  (text: string): unknown => JSON.parse(text),
  () => new Error('Failed to parse model list JSON'),
);

function parseModels(raw: string): Result<AnthropicModel[], Error> {
  return safeJsonParse(raw).andThen((parsed) => {
    if (!Array.isArray(parsed)) return err(new Error('Expected array'));
    return ok(
      parsed.map((m: Record<string, unknown>) => ({
        id: typeof m['value'] === 'string' ? m['value'] : '',
        displayName: typeof m['displayName'] === 'string' ? m['displayName'] : '',
        description: typeof m['description'] === 'string' ? m['description'] : '',
      })),
    );
  });
}

export function listAnthropicModels(env: NodeJS.ProcessEnv): ResultAsync<AnthropicModel[], Error> {
  return new ResultAsync(spawnAndCollect(env)).andThen(parseModels);
}
