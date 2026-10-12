/** @vitest-environment jsdom */

import { AppConnectionContext } from '@core/pipedream/connection-context';
import { cleanup, render } from '@solidjs/testing-library';
import { useContext } from 'solid-js';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  connect: vi.fn(),
  send: vi.fn(),
  alert: vi.fn(),
}));

vi.mock('@queries/pipedream-connectors', () => ({
  connectPipedreamApp: mocks.connect,
}));
vi.mock('@queries/messages/mutations', () => ({
  newMessageId: () => 'message-1',
  useSendMessageMutation: () => ({ mutateAsync: mocks.send }),
}));
vi.mock('@core/context/user', () => ({
  useUserId: () => () => 'macro|ana@example.com',
}));
vi.mock('@core/component/Toast/Toast', () => ({
  toast: { alert: mocks.alert },
}));

import { AgentDmConnections, connectedMessage } from './agent-dm-connections';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function Probe(props: { onContext: (value: unknown) => void }) {
  props.onContext(useContext(AppConnectionContext));
  return null;
}

function mount(agentDm: boolean) {
  let context:
    | {
        connect: (app: { appSlug: string; name: string }) => Promise<void>;
        enabled?: () => boolean;
      }
    | undefined;
  render(() => (
    <AgentDmConnections channelId="channel-1" agentDm={agentDm}>
      <Probe onContext={(value) => (context = value as typeof context)} />
    </AgentDmConnections>
  ));
  if (!context) throw new Error('no context');
  return context;
}

describe('connecting an app in an agent DM', () => {
  it('connects in place, then tells the agent in the conversation', async () => {
    mocks.connect.mockResolvedValue('connected');
    const context = mount(true);
    expect(context.enabled?.()).toBe(true);
    await context.connect({ appSlug: 'linear', name: 'Linear' });
    expect(mocks.connect).toHaveBeenCalledWith({
      appSlug: 'linear',
      serverName: 'Linear',
    });
    expect(mocks.send).toHaveBeenCalledWith({
      parent: { type: 'channel', id: 'channel-1' },
      senderId: 'macro|ana@example.com',
      optimisticId: 'message-1',
      message: { content: connectedMessage('Linear') },
    });
  });

  it('says nothing when the person closed the connection window', async () => {
    mocks.connect.mockResolvedValue('closed');
    await mount(true).connect({ appSlug: 'linear', name: 'Linear' });
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('leaves other channels to the connection settings', () => {
    expect(mount(false).enabled?.()).toBe(false);
  });
});
