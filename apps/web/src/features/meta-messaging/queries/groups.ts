import { throwOnErr } from '@core/util/result';
import { invalidateListChannels } from '@queries/channel/channels';
import { useMetaBinding } from '@queries/meta-messaging';
import { metaMessagingKeys } from '@queries/meta-messaging/keys';
import { storageServiceClient } from '@service-storage/client';
import type { MetaCreateGroup as CreateGroup } from '@service-storage/generated/schemas/metaCreateGroup';
import { metaMessagingClient } from '@service-storage/meta-messaging';
import { useMutation, useQueryClient } from '@tanstack/solid-query';
import type { Accessor } from 'solid-js';

export function useCreateWhatsappGroup() {
  return useMutation(() => ({
    retry: false,
    mutationFn: (args: { connectionId: string; request: CreateGroup }) =>
      throwOnErr(() =>
        metaMessagingClient.createGroup(args.connectionId, args.request)
      ),
    onSettled: () => {
      void invalidateListChannels();
    },
  }));
}

export function useWhatsappGroup(channelId: Accessor<string>) {
  const client = useQueryClient();
  const binding = useMetaBinding(channelId);
  const refresh = () => {
    void client.invalidateQueries({
      queryKey: metaMessagingKeys.conversation(channelId()).queryKey,
    });
  };
  const retry = useMutation(() => ({
    retry: false,
    mutationFn: () =>
      throwOnErr(() => metaMessagingClient.retryGroup(channelId())),
    onSettled: refresh,
  }));
  const copy = useMutation(() => ({
    gcTime: 0,
    mutationFn: async () => {
      const { invite_link } = await throwOnErr(() =>
        metaMessagingClient.groupLink(channelId())
      );
      await navigator.clipboard.writeText(invite_link);
    },
  }));
  const remove = useMutation(() => ({
    retry: false,
    mutationFn: (participant: string) =>
      throwOnErr(() =>
        metaMessagingClient.removeGroupParticipant(channelId(), participant)
      ),
    onSettled: refresh,
  }));
  const destroy = useMutation(() => ({
    retry: false,
    mutationFn: async (discard: boolean) => {
      if (discard)
        await throwOnErr(() => metaMessagingClient.discardGroup(channelId()));
      else
        await throwOnErr(() =>
          storageServiceClient.deleteChannel({ channel_id: channelId() })
        );
    },
    onSuccess: () => {
      void invalidateListChannels();
    },
  }));
  return {
    binding,
    group: () => binding.data?.group,
    retry,
    copy,
    remove,
    destroy,
  };
}
