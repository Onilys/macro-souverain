import { throwOnErr } from '@core/util/result';
import { Telemetry } from '@macro-inc/observability';
import { invalidateAllSoup, refetchSoupEntity } from '@queries/soup/cache';
import { emailClient } from '@service-email/client';
import type {
  ApiDraftInput,
  CreateDraftResponse,
} from '@service-email/generated/schemas';
import { useMutation } from '@tanstack/solid-query';
import { queryClient } from '../client';
import { type MutationCallbacks, withCallbacks } from '../utils';
import { refreshEmailThreadCache } from './cache-cleanup';
import { emailKeys } from './keys';

type CreateDraftParams = {
  draft: ApiDraftInput;
  /** Target inbox for a non-primary inbox; sent as the X-Email-Link-Id header. */
  linkId?: string;
  /** Skip updating soup when the thread will immediately be marked done. */
  skipSoupRefetch?: boolean;
};

/**
 * Mutation to save a new email draft.
 */
export function useSaveDraftMutation(
  callbacks?: MutationCallbacks<CreateDraftResponse, Error, CreateDraftParams>
) {
  return useMutation(() => ({
    mutationFn: async (vars: CreateDraftParams) => {
      return await throwOnErr(
        async () =>
          await emailClient.createDraft({ draft: vars.draft }, vars.linkId)
      );
    },
    ...withCallbacks<CreateDraftResponse, Error, CreateDraftParams>(
      {
        onError(error) {
          console.error('Failed to save draft', error);
        },
        onSuccess(data, vars) {
          try {
            const settleInvalidateQueriesHandler0 = Telemetry.error;
            const settleInvalidateQueries = async () => {
              try {
                return await queryClient.invalidateQueries({
                  queryKey: emailKeys.previews._def,
                });
              } catch (settleInvalidateQueriesError) {
                return await settleInvalidateQueriesHandler0(
                  settleInvalidateQueriesError
                );
              }
            };
            void settleInvalidateQueries();
            const threadId = data.draft.thread_db_id;
            if (!threadId) return;
            if (!vars.skipSoupRefetch) {
              const settleRefetchSoupEntityHandler0 = Telemetry.error;
              const settleRefetchSoupEntity = async () => {
                try {
                  return await refetchSoupEntity(threadId, 'emailThread');
                } catch (settleRefetchSoupEntityError) {
                  return await settleRefetchSoupEntityHandler0(
                    settleRefetchSoupEntityError
                  );
                }
              };
              void settleRefetchSoupEntity();
            }
            // Reopening the thread reads the messages cache; drop it so the
            // saved draft body isn't served stale.
            const settleInvalidateQueriesResultHandler0 = Telemetry.error;
            const settleInvalidateQueriesResult = async () => {
              try {
                return await queryClient.invalidateQueries({
                  queryKey: emailKeys.threadMessages(threadId).queryKey,
                });
              } catch (settleInvalidateQueriesResultError) {
                return await settleInvalidateQueriesResultHandler0(
                  settleInvalidateQueriesResultError
                );
              }
            };
            void settleInvalidateQueriesResult();
          } catch (error) {
            Telemetry.error(error);
          }
        },
      },
      callbacks
    ),
  }));
}

type DeleteDraftParams = {
  draftId: string;
  /** Thread the draft belonged to, refetched so it leaves the drafts tab. */
  threadId?: string;
  /** Target inbox for a non-primary inbox; sent as the X-Email-Link-Id header. */
  linkId?: string;
  /** Skip updating soup when the thread will immediately be marked done. */
  skipSoupRefetch?: boolean;
};

/**
 * Mutation to delete an email draft.
 */
export function useDeleteDraftMutation(
  callbacks?: MutationCallbacks<void, Error, DeleteDraftParams>
) {
  return useMutation(() => ({
    mutationFn: async (vars: DeleteDraftParams) => {
      await throwOnErr(
        async () =>
          await emailClient.deleteDraft({ id: vars.draftId }, vars.linkId)
      );
    },
    ...withCallbacks<void, Error, DeleteDraftParams>(
      {
        onError(error) {
          console.error('Failed to delete draft', error);
        },
        async onSuccess(_data, vars) {
          try {
            if (vars.threadId) {
              await refreshEmailThreadCache(vars.threadId);
            }
            const settleInvalidateQueriesResultResultHandler0 = Telemetry.error;
            const settleInvalidateQueriesResultResult = async () => {
              try {
                return await queryClient.invalidateQueries({
                  queryKey: emailKeys.previews._def,
                });
              } catch (settleInvalidateQueriesResultResultError) {
                return await settleInvalidateQueriesResultResultHandler0(
                  settleInvalidateQueriesResultResultError
                );
              }
            };
            void settleInvalidateQueriesResultResult();
            if (vars.skipSoupRefetch) return;
            // Refetch the thread (not the deleted draft) so its draft-derived
            // fields settle. No-op for compose drafts, whose thread is deleted
            // along with the draft, so the refetch finds nothing to update.
            if (vars.threadId) {
              const threadId = vars.threadId;
              const settleRefetchSoupEntityResultHandler0 = Telemetry.error;
              const settleRefetchSoupEntityResult = async () => {
                try {
                  return await refetchSoupEntity(threadId, 'emailThread');
                } catch (settleRefetchSoupEntityResultError) {
                  return await settleRefetchSoupEntityResultHandler0(
                    settleRefetchSoupEntityResultError
                  );
                }
              };
              void settleRefetchSoupEntityResult();
            }
            // Discarding a draft changes view membership — the thread leaves
            // Signal/Drafts and a noise thread re-enters Noise — which a
            // single-entity patch can't express, so the soup list queries must
            // refetch. Mirrors the archive flow in EmailContext.
            invalidateAllSoup();
          } catch (error) {
            Telemetry.error(error);
          }
        },
      },
      callbacks
    ),
  }));
}
