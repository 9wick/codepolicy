import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

import Ajv from 'ajv';
import { Result, ResultAsync, err, ok } from 'neverthrow';

export type CodexModel = {
  id: string;
  displayName: string;
  description: string;
};

type JsonRpcResponse = {
  id: number;
  result?: { data: CodexModel[] };
  error?: { code: number; message: string };
};

const ajv = new Ajv({ strict: false });
const validateJsonRpc = ajv.compile<JsonRpcResponse>({
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'number' } },
});

const safeJsonParse = Result.fromThrowable(
  (line: string): unknown => JSON.parse(line),
  () => new Error('Invalid JSON'),
);

function parseJsonRpc(line: string): Result<JsonRpcResponse, Error> {
  return safeJsonParse(line).andThen((value) =>
    validateJsonRpc(value) ? ok(value) : err(new Error('Invalid JSON-RPC response')),
  );
}

function sendJsonRpc(
  stdin: NodeJS.WritableStream,
  id: number,
  method: string,
  params: Record<string, unknown>,
): void {
  stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
}

function runCodexAppServer() {
  return new Promise<Result<CodexModel[], Error>>((resolve) => {
    const proc = spawn('codex', ['app-server'], {
      stdio: ['pipe', 'pipe', 'ignore'],
    });

    const timer = setTimeout(() => {
      proc.kill();
      resolve(err(new Error('codex app-server timed out')));
    }, 15_000);

    const rl = createInterface({ input: proc.stdout });
    let phase: 'init' | 'list' = 'init';

    rl.on('line', (line) => {
      const parsed = parseJsonRpc(line);
      if (parsed.isErr()) return;
      const msg = parsed.value;

      if (msg.error) {
        clearTimeout(timer);
        proc.kill();
        resolve(err(new Error(`codex app-server error: ${msg.error.message}`)));
        return;
      }

      if (phase === 'init') {
        phase = 'list';
        sendJsonRpc(proc.stdin, 2, 'model/list', {
          limit: 100,
          cursor: null,
          include_hidden: false,
        });
        return;
      }

      clearTimeout(timer);
      proc.kill();
      const models = (msg.result?.data ?? []).map((m) => ({
        id: m.id,
        displayName: m.displayName,
        description: m.description,
      }));
      resolve(ok(models));
    });

    proc.on('error', (e) => {
      clearTimeout(timer);
      resolve(err(new Error(`Failed to spawn codex: ${e.message}`)));
    });

    sendJsonRpc(proc.stdin, 1, 'initialize', {
      clientInfo: { name: 'codepolicy', version: '0.0.1' },
    });
  });
}

export function listCodexModels(): ResultAsync<CodexModel[], Error> {
  return new ResultAsync(runCodexAppServer());
}
