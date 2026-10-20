import { createRoutesManifest, type SplitRoutes } from '@app/lib/split-router';
import { decodePane } from '@app/lib/split-router/routes/manifest';
import { firstChangedDepth } from '@app/lib/split-router/routes/queries';
import type { Entry } from '@app/lib/split-router/routes/types';
import { describe, expect, it } from 'vitest';
import {
  appRoute,
  homeDocumentRoute,
  homePreviewRoute,
  homeSplitRoute,
} from './routes';

const routes = createRoutesManifest({
  definitions: [
    {
      ...appRoute,
      children: [
        {
          ...homeSplitRoute,
          children: [homeDocumentRoute, homePreviewRoute],
        },
      ],
    },
  ],
  defaultRoute: () => ({ matches: [{ id: 'view-home', params: {} }] }),
} satisfies SplitRoutes);

const entry = (path: string): Entry => ({
  id: path,
  location: { route: decodePane(routes, path.split('/').filter(Boolean))! },
});

describe('document remount', () => {
  // The markdown block fixes its kind at mount, so a document converted to a
  // task must remount to show the task view.
  it('remounts when the same document reopens as a task', () => {
    expect(
      firstChangedDepth(routes, entry('/home/md/doc-1'), entry('/home/task/doc-1'))
    ).toBeDefined();
  });

  it('keeps the view mounted when the same document reopens unchanged', () => {
    const from = entry('/home/md/doc-1');
    expect(
      firstChangedDepth(routes, from, { ...from, id: 'next' })
    ).toBeUndefined();
  });
});
