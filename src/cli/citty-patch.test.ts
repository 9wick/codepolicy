import { describe, expect, it } from 'vitest';
import { defineCommand, runCommand } from 'citty';

/**
 * citty@0.2.1 patch test
 * @see https://github.com/unjs/citty/issues/133
 *
 * citty has a bug where option values (e.g. `-c foo`) are misinterpreted
 * as subcommand names. This test ensures our patch keeps working,
 * even if citty is upgraded.
 */
describe('citty patch: option values must not be treated as subcommands', () => {
  const makeCmd = (onRun: (args: Record<string, unknown>) => void) =>
    defineCommand({
      args: {
        config: { type: 'string', alias: 'c' },
      },
      subCommands: {
        sub: () =>
          defineCommand({
            run: () => {
              throw new Error('subcommand should not run');
            },
          }),
      },
      run: ({ args }) => onRun(args),
    });

  it('-c value (space-separated) parses as option, not subcommand', async () => {
    let captured: Record<string, unknown> = {};
    const cmd = makeCmd((args) => {
      captured = args;
    });
    await runCommand(cmd, { rawArgs: ['-c', 'my-config.yml'] });
    expect(captured.config).toBe('my-config.yml');
  });

  it('--config value (space-separated) parses as option, not subcommand', async () => {
    let captured: Record<string, unknown> = {};
    const cmd = makeCmd((args) => {
      captured = args;
    });
    await runCommand(cmd, { rawArgs: ['--config', 'my-config.yml'] });
    expect(captured.config).toBe('my-config.yml');
  });

  it('--config=value (equals syntax) still works', async () => {
    let captured: Record<string, unknown> = {};
    const cmd = makeCmd((args) => {
      captured = args;
    });
    await runCommand(cmd, { rawArgs: ['--config=my-config.yml'] });
    expect(captured.config).toBe('my-config.yml');
  });

  it('subcommand still resolves when no conflicting option value', async () => {
    let subRan = false;
    const cmd = defineCommand({
      args: {
        config: { type: 'string', alias: 'c' },
      },
      subCommands: {
        sub: () =>
          defineCommand({
            run: () => {
              subRan = true;
            },
          }),
      },
      run: () => {},
    });
    await runCommand(cmd, { rawArgs: ['sub'] });
    expect(subRan).toBe(true);
  });

  it('option + subcommand together works', async () => {
    let subRan = false;
    let captured: Record<string, unknown> = {};
    const cmd = defineCommand({
      args: {
        config: { type: 'string', alias: 'c' },
      },
      subCommands: {
        sub: () =>
          defineCommand({
            run: () => {
              subRan = true;
            },
          }),
      },
      run: ({ args }) => {
        captured = args;
      },
    });
    await runCommand(cmd, { rawArgs: ['-c', 'my-config.yml', 'sub'] });
    expect(captured.config).toBe('my-config.yml');
    expect(subRan).toBe(true);
  });
});
