import { existsSync } from 'node:fs';
import { delimiter, isAbsolute, relative, resolve } from 'node:path';

const web = resolve(import.meta.dirname, '..');
const root = resolve(web, '../..');
const [mode, ...arguments_] = process.argv.slice(2);

async function git(args: string[]) {
  const child = Bun.spawn(['git', ...args], {
    cwd: root,
    stdout: 'pipe',
    stderr: 'inherit',
  });
  const output = await new Response(child.stdout).text();
  if ((await child.exited) !== 0) {
    throw new Error(`git ${args.join(' ')} failed`);
  }
  return output;
}

let files: string[];
if (mode === '--changed' || mode === '--staged') {
  const revision =
    mode === '--staged'
      ? ['--cached']
      : [
          (
            await git([
              'merge-base',
              'HEAD',
              process.env.CHECK_BASE ?? 'origin/main',
            ])
          ).trim(),
        ];
  files = (
    await git([
      'diff',
      ...revision,
      '--name-only',
      '-z',
      '--diff-filter=ACMR',
      '--',
      'apps/web',
    ])
  )
    .split('\0')
    .filter(Boolean)
    .map((file) => resolve(root, file));
} else if (mode === '--files') {
  files = arguments_.map((file) => resolve(file));
} else {
  throw new Error('Select a tooling scope: --changed, --staged, or --files');
}
files = files.filter((file) => {
  const name = relative(web, file).replaceAll('\\', '/');
  return (
    !name.startsWith('../') &&
    !isAbsolute(name) &&
    /\.(?:ts|tsx|js|jsx)$|\/openapi\.json$/.test(name) &&
    existsSync(file)
  );
});
if (files.length === 0) {
  console.log('No matching web files to check.');
  process.exit(0);
}

// New Oxlint warnings remain advisory. Existing Biome warnings keep the same
// strict CI policy while rule parity is completed.
const env = {
  ...process.env,
  PATH: [
    resolve(web, 'node_modules/.bin'),
    resolve(root, 'node_modules/.bin'),
    process.env.PATH ?? '',
  ].join(delimiter),
};
const commands = [
  ['oxfmt', '--check', '--no-error-on-unmatched-pattern', ...files],
  [
    'biome',
    'ci',
    '--formatter-enabled=false',
    '--linter-enabled=false',
    '--no-errors-on-unmatched',
    '--error-on-warnings',
    ...files,
  ],
  ['oxlint', ...files],
  [
    'biome',
    'lint',
    '--skip=suspicious/noImportCycles',
    '--no-errors-on-unmatched',
    '--error-on-warnings',
    ...files,
  ],
];
let exitCode = 0;
for (const command of commands) {
  console.log(`── ${command[0]}`);
  const child = Bun.spawn(command, {
    cwd: web,
    env,
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  });
  if ((await child.exited) !== 0) exitCode = 1;
}
process.exit(exitCode);
