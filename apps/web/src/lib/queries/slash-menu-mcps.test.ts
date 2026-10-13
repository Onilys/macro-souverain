import { createRoot } from 'solid-js';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSlashMenuMcps } from './slash-menu-mcps';

const data = vi.hoisted(() => ({
  pipedream: [] as {
    app_slug: string;
    server_name: string;
    enabled: boolean;
  }[],
  native: [] as {
    url: string;
    server_name: string;
    enabled: boolean;
    authenticated: boolean;
  }[],
}));

vi.mock('@queries/pipedream-connectors', () => ({
  usePipedreamConnectionsQuery: () => ({
    get data() {
      return data.pipedream;
    },
    isPlaceholderData: false,
  }),
}));
vi.mock('@queries/mcp-servers', () => ({
  useMcpServersQuery: () => ({
    get data() {
      return data.native;
    },
    isPlaceholderData: false,
  }),
}));

function listMcps() {
  return createRoot((dispose) => {
    const result = useSlashMenuMcps(() => true).mcps();
    dispose();
    return result;
  });
}

beforeEach(() => {
  data.pipedream = [];
  data.native = [
    {
      url: 'https://mcp.sentry.dev/mcp',
      server_name: 'Sentry',
      enabled: true,
      authenticated: true,
    },
    {
      url: 'https://mcp.example.com/mcp',
      server_name: 'Unauthed',
      enabled: true,
      authenticated: false,
    },
    {
      url: 'https://off.example.com/mcp',
      server_name: 'Off',
      enabled: false,
      authenticated: true,
    },
  ];
});

describe('useSlashMenuMcps', () => {
  it('lists enabled, authenticated native servers when there are no Pipedream connections', () => {
    expect(listMcps()).toEqual([
      { id: 'mcp:https://mcp.sentry.dev/mcp', name: 'Sentry', appSlug: null },
    ]);
  });

  it('lists only enabled Pipedream connectors once any exist, ignoring native servers', () => {
    data.pipedream = [
      { app_slug: 'linear', server_name: 'Linear', enabled: true },
      { app_slug: 'asana', server_name: 'Asana', enabled: false },
    ];
    expect(listMcps()).toEqual([
      { id: 'pipedream:linear', name: 'Linear', appSlug: 'linear' },
    ]);
  });

  it('stays on the Pipedream stack when every connector is disabled', () => {
    data.pipedream = [
      { app_slug: 'asana', server_name: 'Asana', enabled: false },
    ];
    expect(listMcps()).toEqual([]);
  });
});
