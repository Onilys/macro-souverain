#!/usr/bin/env bun
/**
 * Rejects a built Tauri frontend that would break at runtime. Every package
 * in wasm-packages.json must be in dist: the loaders import them with
 * `@vite-ignore`, so a missing one builds cleanly and fails only in the app.
 * The version must name the commit the bundle was built from, not `unknown`.
 *
 * usage: bun scripts/verify-tauri-bundle.ts --dist <directory>
 */
import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import packageJson from '../package.json' with { type: 'json' };
import { wasmPackages } from './wasm-packages';

function walkFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? walkFiles(path) : [path];
  });
}

/** Everything wrong with the bundle in `distPath`; empty when it can ship. */
export function bundleProblems(distPath: string): string[] {
  const files = walkFiles(distPath);
  const names = files.map((path) => basename(path));
  const problems: string[] = [];

  for (const { name } of wasmPackages) {
    for (const [stem, extension] of [
      [name, 'js'],
      [`${name}_bg`, 'wasm'],
    ]) {
      const emitted = new RegExp(`^${stem}(?:-[\\w-]+)?\\.${extension}$`);
      if (!names.some((file) => emitted.test(file))) {
        problems.push(
          `missing ${stem}.${extension}: build the WASM packages first (just build-wasm)`
        );
      }
    }
  }

  const version = packageJson.version;
  const semver = readFileSync(join(distPath, 'semver.txt'), 'utf8').trim();
  const commit = new RegExp(
    `^${version.replaceAll('.', '\\.')}\\+([0-9a-f]{7,40}(?:-dirty)?)$`
  ).exec(semver)?.[1];
  if (!commit) {
    problems.push(
      `semver.txt is ${JSON.stringify(semver)}, expected ${version}+<commit>; set MACRO_GIT_SHA where the build has no git checkout`
    );
    return problems;
  }

  const manifest = JSON.parse(
    readFileSync(join(distPath, 'bundle-manifest.json'), 'utf8')
  );
  if (manifest.gitSha !== commit) {
    problems.push(
      `bundle-manifest.json gitSha is ${JSON.stringify(manifest.gitSha)}, expected ${JSON.stringify(commit)}`
    );
  }

  const appVersion = `${version}+${commit}`;
  const literal = new RegExp(
    `["'\`]${appVersion.replace(/[.+]/g, '\\$&')}["'\`]`
  );
  const inlined = files.some(
    (path) => path.endsWith('.js') && literal.test(readFileSync(path, 'utf8'))
  );
  if (!inlined) {
    problems.push(`no script inlines the app version ${appVersion}`);
  }
  return problems;
}

if (import.meta.main) {
  const index = process.argv.indexOf('--dist');
  const distPath = index >= 0 ? process.argv[index + 1] : undefined;
  if (!distPath) throw new Error('usage: verify-tauri-bundle.ts --dist <dir>');
  const problems = bundleProblems(distPath);
  if (problems.length > 0) {
    for (const problem of problems) console.error(`${distPath}: ${problem}`);
    process.exit(1);
  }
  console.log(`${distPath}: every WASM package and the app version are in place`);
}
