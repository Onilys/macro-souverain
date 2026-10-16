import { isResponseFreeNetworkError } from '@core/util/request-error';
/** Reactive group directory; entity pages are activated independently on demand. */

import { createLiveQuery } from '@app/lib/graphql-cache/solid/create-live-query';
import { Telemetry } from '@macro-inc/observability';
import { makeGroupComparator } from '@queries/soup/grouped/api';
import type { GroupByField, GroupMeta } from '@queries/soup/grouped/types';
import {
  GroupSoupDirectoryDocument,
  type GroupSoupDirectoryQuery,
  type GroupSoupDirectoryQueryVariables,
} from '@service-storage/graphql/generated/graphql';
import { getGraphqlSoupClient } from '@service-storage/graphql-soup';
import type { CombinedError } from '@urql/core';
import {
  type Accessor,
  createComputed,
  createMemo,
  on,
  onCleanup,
} from 'solid-js';
import type { SoupAstBody, SoupAstItemsData, SoupAstParams } from '../items';
import { registerGraphqlSoupRevalidations } from './active-queries';
import { makeGraphqlGroupedSoupInput } from './ast';
import type { GraphqlSoupAstItemsQuery } from './items';
export type GraphqlGroupedSoupAstItemsQueryArgs = {
  params: SoupAstParams;
  body: SoupAstBody;
  groupBy: GroupByField | undefined;
};

export type GraphqlGroupedSoupAstItemsQueryOptions = {
  enabled: boolean;
  networkPaused?: boolean;
  keepPreviousData?: boolean;
  showSupportedForeignEntities?: boolean;
};

function mapGraphqlGroupedSoupData(
  data: GroupSoupDirectoryQuery,
  groupBy: GroupByField
): SoupAstItemsData {
  const groups: GroupMeta[] = data.user.groupSoupDirectory.map((group) => ({
    ...group,
    itemIds: [],
    nextCursor: null,
  }));
  groups.sort(makeGroupComparator(groupBy));
  return { entities: [], groups, itemsById: {} };
}

/** Creates the live urql parent query for a grouped Soup AST request. */
export function createGraphqlSoupGroupDirectoryQuery(
  args: Accessor<GraphqlGroupedSoupAstItemsQueryArgs>,
  options: Accessor<GraphqlGroupedSoupAstItemsQueryOptions>
): GraphqlSoupAstItemsQuery {
  const input = createMemo(() => {
    const { params, body, groupBy } = args();
    if (!groupBy) return;
    try {
      const input = makeGraphqlGroupedSoupInput({
        params,
        body,
        groupBy,
      }).initial;
      if (!input) return;
      return {
        groupBy: input.groupBy,
        filters: input.filters,
        sortMethod: input.sortMethod,
      };
    } catch {
      // Unsupported GraphQL Soup AST — the public facade falls back to REST.
      return undefined;
    }
  });
  const isSupported = () => input() !== undefined;

  const query = createLiveQuery<
    GroupSoupDirectoryQuery,
    GroupSoupDirectoryQueryVariables,
    SoupAstItemsData & { inputKey: string }
  >(
    GroupSoupDirectoryDocument,
    () => {
      const value = input();
      return options().enabled && value ? { input: value } : undefined;
    },
    () => {
      const inputKey = JSON.stringify(input());
      const groupBy = args().groupBy;
      return {
        client: getGraphqlSoupClient(),
        requestPolicy: options().networkPaused
          ? 'cache-only'
          : 'cache-and-network',
        keepPreviousData: options().keepPreviousData ?? false,
        select: (data) => ({
          ...mapGraphqlGroupedSoupData(data, groupBy!),
          inputKey,
        }),
      };
    }
  );

  onCleanup(
    registerGraphqlSoupRevalidations(() => {
      const queryInput = input();
      return query.isEnabled && !options().networkPaused && queryInput
        ? [
            {
              document: GroupSoupDirectoryDocument,
              variables: { input: queryInput },
            },
          ]
        : [];
    }, getGraphqlSoupClient)
  );

  const error = (): CombinedError | undefined => {
    if (
      isResponseFreeNetworkError(query.error) &&
      query.data?.inputKey === JSON.stringify(input())
    )
      return undefined;
    return query.error ?? undefined;
  };
  createComputed(
    on(error, (queryError) => {
      if (queryError) {
        Telemetry.error(queryError, { graphqlOperation: 'GroupSoupDirectory' });
      }
    })
  );

  return {
    data: () => (query.isFetched ? query.data : undefined),
    error,
    isSupported,
    isEnabled: () => query.isEnabled,
    isLoading: () => query.isLoading,
    isFetching: () => query.isFetching,
    isFetchingNextPage: () => false,
    isFetchNextPageError: () => false,
    isPlaceholderData: () =>
      query.data !== undefined &&
      query.data.inputKey !== JSON.stringify(input()),
    hasNextPage: () => false,
    fetchNextPage: async () => undefined,
    resetToInitialPage: () => undefined,
    refresh: async () => {
      if (input() === undefined) return;
      await query.refetch({
        requestPolicy: 'network-only',
        throwOnError: true,
      });
    },
  };
}
