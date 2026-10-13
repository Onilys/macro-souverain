import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const web = resolve(import.meta.dirname, '..');
const root = resolve(web, '../..');
const launcher = resolve(import.meta.dirname, 'typescript.ts');
const require = createRequire(import.meta.url);

function version(compiler: 'native' | 'legacy', cwd = web) {
  return spawnSync('bun', [launcher, compiler, '--version'], {
    cwd,
    encoding: 'utf8',
  });
}

describe('web TypeScript selection', () => {
  it('runs the native compiler from either working directory', () => {
    for (const cwd of [web, root]) {
      const result = version('native', cwd);
      expect(result.status).toBe(0);
      expect(result.stdout.trim()).toBe('Version 7.0.2');
    }
  });

  it('retains the legacy compiler API and explicit CLI', () => {
    const result = version('legacy');
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('Version 5.9.3');
    const ts = require('typescript');
    expect(ts.version).toBe('5.9.3');
    expect(typeof ts.createSourceFile).toBe('function');
  });

  it('keeps the workspace tsc binary on the legacy compiler', () => {
    const result = spawnSync(
      'node',
      [resolve(root, 'node_modules/.bin/tsc'), '--version'],
      {
        encoding: 'utf8',
      }
    );
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('Version 5.9.3');
  });

  it('propagates native compiler errors', () => {
    const result = spawnSync(
      'bun',
      [launcher, 'native', '--not-a-typescript-option'],
      {
        cwd: web,
        encoding: 'utf8',
      }
    );
    expect(result.status).not.toBe(0);
    expect(result.stdout).toContain('Unknown compiler option');
  });

  it('resolves native TypeScript relative to its own workspace', () => {
    const nativeRequire = createRequire(
      require.resolve('@macro-inc/typescript-native/cli.mjs')
    );
    const native = nativeRequire('typescript/package.json');
    expect(native.version).toBe('7.0.2');
    expect(dirname(nativeRequire.resolve('typescript/package.json'))).not.toBe(
      dirname(require.resolve('typescript/package.json'))
    );
  });
});
