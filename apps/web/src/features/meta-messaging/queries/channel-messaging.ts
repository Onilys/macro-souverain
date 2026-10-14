import type { MessageData } from '@core/messages/types';
import { queryReadyGate } from '@queries/gate';
import { useMetaConversation, useMetaDelivery } from '@queries/meta-messaging';
import type { MetaSendProgress } from '@service-storage/generated/schemas/metaSendProgress';
import {
  type Accessor,
  createEffect,
  createMemo,
  createSignal,
  on,
} from 'solid-js';
import {
  deliveryTimelineKeys,
  sendRowKey,
  visibleDeliveryIds,
} from '../core/timeline';

/** Own the external send feed and its handoff to the native message timeline. */
export function createChannelMessaging(options: {
  channelId: Accessor<string>;
  messages: Accessor<readonly MessageData[]>;
  entries: Accessor<readonly { id: string; created_at: string }[]>;
  includesLatest: Accessor<boolean>;
  visibleRange: Accessor<{ first: string; last: string } | undefined>;
}) {
  const messagingQuery = useMetaConversation(() => options.channelId());
  const messaging = () =>
    queryReadyGate(messagingQuery) &&
    messagingQuery.data?.conversation.channel_id === options.channelId()
      ? messagingQuery.data
      : undefined;
  const latestCustomerMessage = createMemo(() => {
    if (!options.includesLatest()) return undefined;
    let latest: MessageData | undefined;
    for (const message of options.messages()) {
      if (!message.sender_id.startsWith('external|')) continue;
      if (
        !latest ||
        Date.parse(message.created_at) > Date.parse(latest.created_at)
      )
        latest = message;
    }
    return latest?.id;
  });
  // Native messages arrive over the channel socket. Refresh server-owned reply
  // eligibility immediately instead of waiting for the idle recovery poll.
  createEffect(
    on(
      latestCustomerMessage,
      (id) => {
        if (id && messaging()) void messagingQuery.refetch();
      },
      { defer: true }
    )
  );
  const [recoverExternalReply, setRecoverExternalReply] =
    createSignal<(send: MetaSendProgress) => void>();
  const recentDelivery = createMemo(
    () =>
      new Map(
        (messaging()?.sends ?? [])
          .filter((send) => send.message_id)
          .map((send) => [send.message_id, send])
      )
  );
  const nativeIds = createMemo(
    () => new Set(options.messages().map((message) => message.id))
  );
  const attemptsByKey = createMemo(
    () =>
      new Map(
        (messaging()?.sends ?? [])
          .filter(
            (send) => !send.message_id || !nativeIds().has(send.message_id)
          )
          .map((send) => [sendRowKey(send.id), send])
      )
  );
  const timelineKeys = createMemo(() =>
    deliveryTimelineKeys(
      options.channelId(),
      options.entries(),
      messaging()?.sends ?? [],
      options.includesLatest()
    )
  );
  const historyMessageIds = createMemo(() =>
    messaging()
      ? visibleDeliveryIds(
          timelineKeys(),
          new Set(
            options
              .messages()
              .filter(
                (message) =>
                  message.imported_author &&
                  !message.sender_id.startsWith('external|')
              )
              .map((message) => message.id)
          ),
          new Set(
            [...recentDelivery().keys()].filter((id): id is string => !!id)
          ),
          options.visibleRange()
        )
      : []
  );
  const historyDelivery = useMetaDelivery(
    () => options.channelId(),
    historyMessageIds
  );
  const deliveryByMessage = createMemo(() => {
    if (!messaging()) return new Map<string, MetaSendProgress>();
    const history = queryReadyGate(historyDelivery) ? historyDelivery.data : [];
    return new Map([
      ...(history ?? [])
        .filter(
          (send) => send.channel_id === options.channelId() && send.message_id
        )
        .map((send) => [send.message_id, send] as const),
      ...recentDelivery(),
    ]);
  });
  const canRecoverReply = () =>
    !!messaging()?.can_reply && !!recoverExternalReply();
  const recoverReply = (send: MetaSendProgress) => {
    if (send.channel_id === options.channelId()) recoverExternalReply()?.(send);
  };

  return {
    account: messaging,
    unavailable: () => messagingQuery.isError,
    loading: () => messagingQuery.isPending,
    refresh: () => void messagingQuery.refetch(),
    timelineKeys,
    attemptsByKey,
    deliveryByMessage,
    canRecoverReply,
    recoverReply,
    registerRecovery: (recover: (send: MetaSendProgress) => void) => {
      setRecoverExternalReply(() => recover);
      return () => {
        if (recoverExternalReply() === recover)
          setRecoverExternalReply(undefined);
      };
    },
  };
}
