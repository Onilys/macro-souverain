import { useMcpServersQuery } from '@queries/mcp-servers';
import { usePipedreamConnectionsQuery } from '@queries/pipedream-connectors';
import { createMemo } from 'solid-js';

/** An MCP connection the AI can currently use, as the `/` menu lists it. */
export type SlashMenuMcp = {
  id: string;
  name: string;
  /** Pipedream app slug, for the connector icon; null for native servers. */
  appSlug: string | null;
};

/**
 * The MCP connections the AI's toolset is built from, mirroring the
 * backend's `mcp_select` rule: any Pipedream connection (even a disabled
 * one) puts the user on the Pipedream stack and native servers are ignored.
 * Only enabled connections, and authenticated native servers, are listed.
 */
export function useSlashMenuMcps(enabled: () => boolean) {
  const pipedream = usePipedreamConnectionsQuery({
    neverSuspend: true,
    enabled,
  });
  const native = useMcpServersQuery({ neverSuspend: true, enabled });

  const mcps = createMemo((): SlashMenuMcp[] => {
    const connections = pipedream.data ?? [];
    if (connections.length > 0) {
      return connections
        .filter((connection) => connection.enabled)
        .map((connection) => ({
          id: `pipedream:${connection.app_slug}`,
          name: connection.server_name,
          appSlug: connection.app_slug,
        }));
    }
    return (native.data ?? [])
      .filter((server) => server.enabled && server.authenticated)
      .map((server) => ({
        id: `mcp:${server.url}`,
        name: server.server_name,
        appSlug: null,
      }));
  });

  const loading = () => pipedream.isPlaceholderData || native.isPlaceholderData;

  return { mcps, loading };
}
