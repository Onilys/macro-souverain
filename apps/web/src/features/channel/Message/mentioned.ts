const HERE_GROUP_ALIAS = 'here';

function mentionPayloads(content: string, tag: string): unknown[] {
  const pattern = new RegExp(`<${tag}>(.*?)</${tag}>`, 'g');
  const payloads: unknown[] = [];
  for (const match of content.matchAll(pattern)) {
    try {
      payloads.push(JSON.parse(match[1]));
    } catch {
      // A malformed mention cannot name the viewer or @here.
    }
  }
  return payloads;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringField(
  record: Record<string, unknown>,
  key: string
): string | undefined {
  const value = record[key];
  return typeof value === 'string' ? value : undefined;
}

function hasHereMention(content: string): boolean {
  for (const payload of mentionPayloads(content, 'm-group-mention')) {
    if (!isRecord(payload)) continue;
    const alias = stringField(payload, 'groupAlias')?.trim().toLowerCase();
    if (alias === HERE_GROUP_ALIAS) return true;
  }
  return false;
}

function userMentionMatchesViewer(
  payload: Record<string, unknown>,
  viewer: string
): boolean {
  const userId = stringField(payload, 'userId')?.trim().toLowerCase();
  if (userId && userId === viewer) return true;

  const email = stringField(payload, 'email')?.trim().toLowerCase();
  if (!email) return false;
  return viewer === email || viewer === `macro|${email}`;
}

/**
 * A channel message is golden when it @-mentions the viewer or contains
 * @here. @here counts for every viewer, including the sender.
 */
export function messageMentionsViewer(
  content: string,
  viewerId: string | undefined
): boolean {
  if (hasHereMention(content)) return true;

  const viewer = viewerId?.trim().toLowerCase();
  if (!viewer) return false;

  for (const payload of mentionPayloads(content, 'm-user-mention')) {
    if (!isRecord(payload)) continue;
    if (userMentionMatchesViewer(payload, viewer)) return true;
  }
  return false;
}
