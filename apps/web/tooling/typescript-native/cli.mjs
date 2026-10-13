#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';

// A normal, nested dependency keeps TypeScript 7's `tsc` binary from replacing
// the workspace's TypeScript 5.9 binary, unlike an npm alias of TypeScript 7.
const require = createRequire(import.meta.url);
const manifest = require('typescript/package.json');
if (manifest.version !== '7.0.2') {
  throw new Error(`Expected native TypeScript 7.0.2, got ${manifest.version}`);
}
const packageDirectory = dirname(require.resolve('typescript/package.json'));
const compiler = resolve(packageDirectory, manifest.bin.tsc);
const child = spawnSync(
  process.execPath,
  [compiler, ...process.argv.slice(2)],
  {
    stdio: 'inherit',
  }
);
if (child.error) throw child.error;
if (child.signal) process.kill(process.pid, child.signal);
else process.exitCode = child.status ?? 1;
