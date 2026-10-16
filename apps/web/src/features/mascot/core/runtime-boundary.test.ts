// @vitest-environment node
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

it('keeps the chat entry free of authoring, source fixtures, ZIP and WebGL imports', () => {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const pending = [resolve(root, 'views/mascot-player.tsx')],
    seen = new Set<string>();
  while (pending.length) {
    const file = pending.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const source = readFileSync(file, 'utf8');
    expect(source).not.toMatch(/authoring\/|fixtures\/|zip\.js|model\.js/);
    for (const match of source.matchAll(
      /(?:from\s*|import\s*)['"](\.[^'"]+)['"]/g
    )) {
      const base = resolve(dirname(file), match[1]);
      for (const suffix of ['', '.ts', '.tsx', '.js']) {
        try {
          readFileSync(base + suffix);
          pending.push(base + suffix);
          break;
        } catch {
          /* Try the next supported source extension. */
        }
      }
    }
  }
  expect([...seen].some((file) => file.endsWith('runtime/player.js'))).toBe(
    true
  );
});
