type TimelineMessage = { id: string; created_at: string };
type SendIntent = TimelineMessage & {
  channel_id: string;
  message_id?: string | null;
};

export const sendRowKey = (id: string) => `external-send:${id}`;

/** Stable bounded request, including a small overscan around the viewport. */
export function visibleDeliveryIds(
  keys: readonly string[],
  eligible: ReadonlySet<string>,
  known: ReadonlySet<string>,
  range?: { first: string; last: string }
): string[] {
  const first = range ? keys.indexOf(range.first) : -1;
  const last = range ? keys.indexOf(range.last) : -1;
  const start =
    first < 0 ? Math.max(0, keys.length - 50) : Math.max(0, first - 6);
  const end = last < 0 ? keys.length : last + 7;
  return keys
    .slice(start, end)
    .filter((key) => eligible.has(key) && !known.has(key))
    .slice(0, 100)
    .sort();
}

/** Keep the durable attempt until its native message actually reaches the view. */
export function deliveryTimelineKeys(
  channelId: string,
  messages: readonly TimelineMessage[],
  sends: readonly SendIntent[],
  includesLatest: boolean
): string[] {
  const times = messages.map((message) => Date.parse(message.created_at));
  const nativeIds = new Set(messages.map((message) => message.id));
  const start = times.length ? Math.min(...times) : -Infinity;
  const end = includesLatest ? Infinity : Math.max(...times);
  const attempts = sends.filter((send) => {
    const time = Date.parse(send.created_at);
    return (
      send.channel_id === channelId &&
      (!send.message_id || !nativeIds.has(send.message_id)) &&
      time >= start &&
      time <= end
    );
  });
  if (!attempts.length) return messages.map((message) => message.id);
  return [
    ...messages.map((message) => ({
      key: message.id,
      time: Date.parse(message.created_at),
    })),
    ...attempts.map((send) => ({
      key: sendRowKey(send.id),
      time: Date.parse(send.created_at),
    })),
  ]
    .sort((a, b) => a.time - b.time || a.key.localeCompare(b.key))
    .map((row) => row.key);
}
