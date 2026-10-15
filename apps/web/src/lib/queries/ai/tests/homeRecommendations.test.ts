import { describe, expect, it } from 'vitest';
import {
  deriveRecommendedView,
  type HomeRecommendations,
  MAX_RECOMMENDATIONS,
  pickRecommendations,
  type RecommendedItem,
  type RecommendedView,
  recommendationSchema,
} from '../homeRecommendations';

function item(
  title: string,
  refs: Pick<RecommendedItem, 'entityType' | 'entityId'> = {
    entityType: 'email_thread',
    entityId: 'email-thread-1',
  }
): RecommendedItem {
  return {
    ...refs,
    title,
    source: 'source',
    action: 'review',
    reason: 'reason',
    prompt: 'prompt',
  };
}

function recommendations(...titles: string[]): HomeRecommendations {
  return { items: titles.map((title) => item(title)) };
}

describe('pickRecommendations', () => {
  function check(
    name: string,
    primary: HomeRecommendations | string | undefined,
    fallback: HomeRecommendations | string | undefined,
    expectedTitles: string[] | undefined
  ) {
    it(name, () => {
      expect(
        pickRecommendations(primary, fallback)?.map((i) => i.title)
      ).toEqual(expectedTitles);
    });
  }

  check(
    'prefers the primary result',
    recommendations('smart'),
    recommendations('fast'),
    ['smart']
  );
  check(
    'falls back when the primary is missing',
    undefined,
    recommendations('fast'),
    ['fast']
  );
  check(
    'ignores schema-less string results',
    'raw text',
    recommendations('fast'),
    ['fast']
  );
  check(
    'returns undefined when nothing has landed',
    undefined,
    undefined,
    undefined
  );

  it('treats an explicit empty primary result as authoritative', () => {
    expect(pickRecommendations({ items: [] }, recommendations('fast'))).toEqual(
      []
    );
  });
});

describe('recommendationSchema', () => {
  it('accepts three recommendations', () => {
    expect(
      recommendationSchema.safeParse(recommendations('a', 'b', 'c')).success
    ).toBe(true);
  });

  it(`rejects more than ${MAX_RECOMMENDATIONS} recommendations`, () => {
    expect(
      recommendationSchema.safeParse(recommendations('a', 'b', 'c', 'd'))
        .success
    ).toBe(false);
  });

  it('rejects the removed delegate action', () => {
    const delegated = {
      items: [{ ...item('delegate'), action: 'delegate' }],
    };
    expect(recommendationSchema.safeParse(delegated).success).toBe(false);
  });
});

describe('deriveRecommendedView', () => {
  function check(
    name: string,
    input: Parameters<typeof deriveRecommendedView>[0],
    expected: RecommendedView
  ) {
    it(name, () => {
      expect(deriveRecommendedView(input)).toEqual(expected);
    });
  }

  const base = {
    loading: false,
    failed: false,
    items: undefined,
    emailLinked: true,
  };

  check(
    'shows an explicit loading state',
    { ...base, loading: true },
    { kind: 'loading' }
  );
  check(
    'items win over everything else',
    { ...base, loading: false, failed: true, items: [item('a')] },
    { kind: 'items', items: [item('a')] }
  );
  check(
    'shows an explicit error — never claims caught-up on failure',
    { ...base, failed: true },
    { kind: 'error' }
  );
  check(
    'connect CTA when no inbox is linked',
    { ...base, emailLinked: false },
    { kind: 'connect-inbox' }
  );
  check('caught up when there is nothing to do', base, { kind: 'caught-up' });
  check(
    'an empty model result is caught-up, not items',
    { ...base, items: [] },
    { kind: 'caught-up' }
  );
});
