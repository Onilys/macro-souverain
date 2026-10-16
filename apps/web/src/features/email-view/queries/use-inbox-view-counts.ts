import { createTagFacetContext } from '@app/features/soup';
import { useUserId } from '@core/context/user';
import { useSoupAstItemsQuery } from '@queries/soup/items';
import { EMAIL_INBOX_TAB_IDS } from '../constants';
import type { EmailViewState } from '../types';
import { buildEmailQuery } from './email-query';

/** Server totals for each mailbox slice, scoped to the selected account/alias. */
export function useInboxViewCounts(
  state: Pick<EmailViewState, 'inboxIds' | 'aliasFilter'>
) {
  const userId = useUserId();
  const queries = EMAIL_INBOX_TAB_IDS.map((tab) =>
    useSoupAstItemsQuery(
      () => {
        const args = buildEmailQuery({
          tab,
          inboxIds:
            state.inboxIds === undefined ? undefined : [...state.inboxIds],
          aliasFilter: state.aliasFilter,
          facets: {},
          facetContext: createTagFacetContext([]),
        });
        return {
          ...args,
          params: { ...args.params, limit: 1, expand: false },
          groupBy: { type: 'entity_type' },
        };
      },
      () => ({ enabled: !!userId(), staleTime: 30_000 })
    )
  );
  const total = (query: ReturnType<typeof useSoupAstItemsQuery>) => {
    if (query.isPending || query.isPlaceholderData || query.error) return;
    const data = query.data;
    if (!data || data.cachedMail) return;
    return data.groups?.reduce((sum, group) => sum + group.totalCount, 0);
  };
  return () => ({
    important: total(queries[0]),
    noise: total(queries[1]),
    calendar: total(queries[2]),
  });
}
