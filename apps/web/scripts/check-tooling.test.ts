import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const web = resolve(import.meta.dirname, '..');
const root = resolve(web, '../..');
const script = resolve(import.meta.dirname, 'check-tooling.ts');
const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function fixture(content: string) {
  const directory = mkdtempSync(resolve(web, '.tooling-test-'));
  directories.push(directory);
  const file = resolve(directory, 'file with spaces.ts');
  writeFileSync(file, content);
  return file;
}

function check(args: string[], cwd = web) {
  return spawnSync('bun', [script, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, CHECK_BASE: 'HEAD' },
  });
}

describe('changed web tooling checks', () => {
  it('checks a quoted filename with project-local binaries from the repository root', () => {
    const file = fixture('export const value = 1;\n');
    const result = check(['--files', file], root);
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain('── oxfmt');
    expect(result.stdout).toContain('── oxlint');
  });

  it('fails when a matching file needs formatting', () => {
    const file = fixture('export const value=1\n');
    const result = check(['--files', file]);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('Format issues found');
  });

  it('ignores files outside apps/web', () => {
    const result = check([
      '--files',
      resolve(root, 'packages/observability/src/index.ts'),
    ]);
    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('No matching web files to check.');
  });

  it('rejects an unknown scope instead of silently skipping checks', () => {
    expect(check(['--unknown-scope']).status).not.toBe(0);
  });
});
