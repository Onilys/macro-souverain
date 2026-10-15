import { queryReadyGate } from '@queries/gate';
import type { useSoupAstItemsQuery } from '@queries/soup/items';
import { soupKeys } from '@queries/soup/keys';
import { fetchCrmContacts } from '@service-storage/crm-contacts';
import { queryOptions, useQuery } from '@tanstack/solid-query';
import { type Accessor, createMemo } from 'solid-js';
import type { CrmActivityTab } from '../core/navigation';
import { crmActivityBody, NO_CRM_ACTIVITY } from './activity-filter';
import { loadCrmActivityScope } from './activity-scope';
import type { CrmRecordDependencies } from './dependencies';
import { fetchCrmExportCompanies } from './export';
import { crmKeys } from './keys';

function activityScopeOptions(
  deps: CrmRecordDependencies,
  userId: string | undefined
) {
  return queryOptions({
    // Company/contact mutations invalidate Soup, so rebuild this scope with it.
    queryKey: [...soupKeys._def, ...crmKeys.activityScope(userId).queryKey],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: ({ signal }) =>
      loadCrmActivityScope(
        {
          companies: () =>
            fetchCrmExportCompanies(deps.storage, signal, () => {}),
          contacts: (cursor) =>
            fetchCrmContacts({ cursor, limit: 500, signal }),
        },
        signal
      ),
  });
}

/** Load the complete authorized CRM scope, not the capped Quick Access cache. */
export function useCrmActivityQuery(
  deps: CrmRecordDependencies,
  createQuery: typeof useSoupAstItemsQuery,
  tab: Accessor<CrmActivityTab>,
  userId: Accessor<string | undefined>
) {
  const scope = useQuery(
    () => activityScopeOptions(deps, userId()),
    () => deps.client
  );
  // The scope can contain thousands of records. Build the AST once per scope
  // or tab change, not on every read by the Soup transport and query observers.
  const body = createMemo(() =>
    queryReadyGate(scope) ? crmActivityBody(tab(), scope.data) : NO_CRM_ACTIVITY
  );
  const query = createQuery(
    () => ({
      params: { limit: 100, sort_method: 'updated_at' },
      body: body(),
    }),
    () => ({ enabled: scope.isSuccess })
  );
  return {
    get isPending() {
      return scope.isPending || query.isPending;
    },
    get isEnabled() {
      return !!userId();
    },
    get isLoading() {
      return scope.isLoading || query.isLoading;
    },
    get isError() {
      return scope.isError || !!query.error;
    },
    get data() {
      return queryReadyGate(query) ? query.data : undefined;
    },
    get hasNextPage() {
      return query.hasNextPage;
    },
    get isFetchingNextPage() {
      return query.isFetchingNextPage;
    },
    fetchNextPage: () => query.fetchNextPage(),
    async refetch() {
      await scope.refetch({ throwOnError: true });
      await query.refetch();
    },
  };
}
