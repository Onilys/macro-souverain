import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { version } from '../package.json';
import { bundleProblems } from './verify-tauri-bundle';
import { wasmPackages } from './wasm-packages';

const directories: string[] = [];
afterEach(() => {
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true });
});

function dist(options: { commit: string; omit?: string; inlined?: string }) {
  const dir = mkdtempSync(join(tmpdir(), 'macro-tauri-bundle-'));
  directories.push(dir);
  mkdirSync(join(dir, 'assets'));
  for (const { name } of wasmPackages) {
    if (name === options.omit) continue;
    writeFileSync(join(dir, 'assets', `${name}-Dx1a2b3c.js`), '');
    writeFileSync(join(dir, 'assets', `${name}_bg-Ab4c5d6e.wasm`), '');
  }
  writeFileSync(join(dir, 'semver.txt'), `${version}+${options.commit}\n`);
  writeFileSync(
    join(dir, 'bundle-manifest.json'),
    JSON.stringify({ gitSha: options.commit, appVersion: version })
  );
  writeFileSync(
    join(dir, 'index-Q1w2e3r4.js'),
    `console.log("App Version ","${version}+${options.inlined ?? options.commit}");`
  );
  return dir;
}

it('accepts a bundle with every WASM package and the commit', () => {
  expect(bundleProblems(dist({ commit: '170584f' }))).toEqual([]);
});

it('rejects a bundle missing the agent fold WASM, as Nix built it', () => {
  expect(bundleProblems(dist({ commit: '170584f', omit: 'agent_fold' }))).toEqual([
    'missing agent_fold.js: build the WASM packages first (just build-wasm)',
    'missing agent_fold_bg.wasm: build the WASM packages first (just build-wasm)',
  ]);
});

it('rejects a version that does not name a commit', () => {
  expect(bundleProblems(dist({ commit: 'unknown' }))).toEqual([
    `semver.txt is "${version}+unknown", expected ${version}+<commit>; set MACRO_GIT_SHA where the build has no git checkout`,
  ]);
});

it('rejects a bundle whose scripts inline a different version', () => {
  expect(
    bundleProblems(dist({ commit: '170584f', inlined: 'unknown' }))
  ).toEqual([`no script inlines the app version ${version}+170584f`]);
});
