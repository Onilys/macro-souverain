import { describe, expect, it } from 'vitest';
import {
  coverageRows,
  DOC_ENTRIES,
  filterEntries,
  groupEntries,
  loadTypeSource,
} from './registry';
import { extractDemoSource, extractGuidelines } from './source';

describe('doc registry', () => {
  it('discovers pages from the co-located .docs.tsx files', () => {
    expect(DOC_ENTRIES.length).toBeGreaterThan(0);
  });

  it('gives every page a unique slug', () => {
    const slugs = DOC_ENTRIES.map((entry) => entry.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('groups only into known categories', () => {
    const grouped = groupEntries(DOC_ENTRIES).flatMap((group) => group.entries);
    expect(grouped.length).toBe(DOC_ENTRIES.length);
  });

  it('filters on name, category, and exports', () => {
    const byName = filterEntries(DOC_ENTRIES, 'button');
    expect(byName.some((entry) => entry.doc.name === 'Button')).toBe(true);
    expect(filterEntries(DOC_ENTRIES, '').length).toBe(DOC_ENTRIES.length);
    expect(filterEntries(DOC_ENTRIES, 'zzzznope')).toHaveLength(0);
  });

  it('reports coverage for every ui component file', () => {
    const rows = coverageRows();
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((row) => row.name === 'Button' && row.entry)).toBe(true);
  });
});

describe.each(DOC_ENTRIES.map((entry) => [entry.doc.name, entry] as const))(
  '%s docs',
  (_name, entry) => {
    it('has at least one demo with a unique id', () => {
      expect(entry.doc.demos.length).toBeGreaterThan(0);
      const ids = entry.doc.demos.map((demo) => demo.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    // The whole point of the region markers is that the code shown is the code
    // that ran. A typo'd or missing marker silently degrades a page to "no
    // source found", so it fails here instead.
    it('wraps every demo in a matching #region marker', async () => {
      const source = await entry.loadSource();
      for (const demo of entry.doc.demos) {
        expect(
          extractDemoSource(source, demo.id),
          `${entry.path} is missing "// #region demo:${demo.id}"`
        ).toBeTruthy();
      }
    });

    // Guidance now lives as @do/@dont JSDoc on the component. A page that
    // silently resolves none would render an empty Guidelines section.
    it('resolves guidance from the component or declares its own', async () => {
      const source = await entry.loadComponentSource?.();
      const fromCode = source
        ? extractGuidelines(source)
        : { do: [], dont: [] };
      const inline = entry.doc.guidelines;
      const total =
        fromCode.do.length +
        fromCode.dont.length +
        (inline?.do?.length ?? 0) +
        (inline?.dont?.length ?? 0);
      expect(total, `${entry.path} has no guidance`).toBeGreaterThan(0);
    });

    // A page whose default `<Name>Props` guess misses (Select's root is
    // generic, Panel's is a bare alias) must name the real type instead.
    it('resolves the prop types it points at', async () => {
      const names = entry.doc.propTypes ?? [
        `${entry.doc.name.replace(/\s+/g, '')}Props`,
      ];
      if (!entry.loadComponentSource) return;
      const found = await Promise.all(names.map((n) => loadTypeSource(n)));
      expect(found.filter(Boolean).length, `${entry.doc.name}: ${names}`).toBe(
        names.length
      );
    });
  }
);
