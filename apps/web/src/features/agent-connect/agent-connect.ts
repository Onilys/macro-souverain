import { connectSlugForPipedreamApp } from '@core/pipedream/slugs';

/**
 * A connect link handed out by Macro's `SetupConnect` MCP tool:
 * `/app/connect/:app?account=<email>&expires=<unix seconds>`.
 *
 * The person's own AI agent sets up their workspace and sends them here to do
 * the one thing only they can: approve access to a tool. The page runs the
 * same connection flow as settings, signed in, so the connection is recorded
 * against the right account.
 */
export type AgentConnectTarget =
  | { kind: 'inbox'; app: 'gmail'; name: 'Gmail' }
  | { kind: 'connector'; app: string; name: string; connectSlug: string };

const KNOWN_NAMES: Record<string, string> = {
  notion: 'Notion',
  linear: 'Linear',
  slack: 'Slack',
  slack_v2: 'Slack',
  github: 'GitHub',
  hubspot: 'HubSpot',
};

function displayName(app: string): string {
  return (
    KNOWN_NAMES[app] ??
    app
      .split('_')
      .filter(Boolean)
      .map((word) => word[0]!.toUpperCase() + word.slice(1))
      .join(' ')
  );
}

/** The tool a connect link is for, or `undefined` for a malformed one. */
export function agentConnectTarget(
  app: string | undefined
): AgentConnectTarget | undefined {
  const slug = app?.trim().toLowerCase();
  if (!slug || !/^[a-z0-9_]+$/.test(slug)) return undefined;
  if (slug === 'gmail') return { kind: 'inbox', app: 'gmail', name: 'Gmail' };
  return {
    kind: 'connector',
    app: slug,
    name: displayName(slug),
    connectSlug: connectSlugForPipedreamApp(slug),
  };
}

/** Whether the link's `expires` (unix seconds) has passed. */
export function isExpired(
  expires: string | undefined,
  nowMs: number = Date.now()
): boolean {
  if (!expires) return false;
  const seconds = Number(expires);
  if (!Number.isFinite(seconds)) return false;
  return seconds * 1000 < nowMs;
}

/**
 * Whether the signed-in account is the one the agent set up. A link without
 * an `account` matches anyone signed in.
 */
export function isSameAccount(
  linkAccount: string | undefined,
  signedInEmail: string | undefined
): boolean {
  if (!linkAccount) return true;
  if (!signedInEmail) return false;
  return (
    linkAccount.trim().toLowerCase() === signedInEmail.trim().toLowerCase()
  );
}
