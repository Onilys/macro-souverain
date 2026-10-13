import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const [compiler, ...args] = process.argv.slice(2);
if (compiler !== 'native' && compiler !== 'legacy') {
  throw new Error('Select a TypeScript compiler: native or legacy');
}

// Resolve each compiler explicitly; workspace dependencies can be hoisted.
const require = createRequire(import.meta.url);
const entry =
  compiler === 'native'
    ? require.resolve('@macro-inc/typescript-native/cli.mjs')
    : join(dirname(require.resolve('typescript/package.json')), 'bin/tsc');
const child = Bun.spawn(['node', entry, ...args], {
  stdin: 'inherit',
  stdout: 'inherit',
  stderr: 'inherit',
});
process.exit(await child.exited);
