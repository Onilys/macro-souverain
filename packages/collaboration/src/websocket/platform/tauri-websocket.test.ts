// @vitest-environment jsdom
import { invoke } from '@tauri-apps/api/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type ReplayEnvelope = { seq: number; message: unknown };
type ConnectArgs = {
  url: string;
  onMessage: { onmessage?: (envelope: ReplayEnvelope) => void };
  config?: { headers: [string, string][] };
};

const plugin = vi.hoisted(() => ({
  connects: [] as Array<{
    args: ConnectArgs;
    resolve: (id: number) => void;
    reject: (error: unknown) => void;
  }>,
  sent: [] as Array<{ id: number; message: unknown }>,
}));

const telemetry = vi.hoisted(() => ({
  start: vi.fn(),
  setAttr: vi.fn(),
  error: vi.fn(),
  end: vi.fn(),
}));
vi.mock('@macro-inc/observability', () => ({
  Telemetry: {
    span: (name: string) => {
      telemetry.start(name);
      return telemetry;
    },
  },
}));

vi.mock('@tauri-apps/api/core', () => ({
  Channel: class {
    onmessage?: (envelope: ReplayEnvelope) => void;
  },
  invoke: vi.fn((command: string, args: unknown) => {
    if (command === 'plugin:websocket|connect') {
      return new Promise((resolve, reject) =>
        plugin.connects.push({ args: args as ConnectArgs, resolve, reject })
      );
    }
    if (command === 'plugin:websocket|send') {
      plugin.sent.push(args as { id: number; message: unknown });
    }
    return Promise.resolve();
  }),
}));

import { TauriWebSocketWrapper } from './tauri-websocket';

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function track(socket: TauriWebSocketWrapper) {
  const events: string[] = [];
  socket.onopen = () => events.push('open');
  socket.onerror = () => events.push('error');
  socket.onclose = (event) => events.push(`close:${event.code}`);
  return events;
}

beforeEach(() => {
  vi.clearAllMocks();
  plugin.connects.length = 0;
  plugin.sent.length = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('TauriWebSocketWrapper', () => {
  it.each(['receive', 'send'] as const)(
    'records one %s failure without recording URLs, payloads, or provider errors',
    async (operation) => {
      vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const socket = new TauriWebSocketWrapper(
        'wss://dss.test/ws?token=private-token'
      );
      const events = track(socket);
      plugin.connects[0].resolve(7);
      await Promise.resolve();
      const closed = new Promise<void>((resolve) =>
        socket.addEventListener('close', () => resolve())
      );
      if (operation === 'receive') {
        plugin.connects[0].args.onMessage.onmessage?.({
          seq: 1,
          message: 'private provider error',
        });
      } else {
        vi.mocked(invoke).mockRejectedValueOnce(
          new Error('private provider error')
        );
        socket.send('private payload');
      }
      await closed;
      plugin.connects[0].args.onMessage.onmessage?.({
        seq: 2,
        message: 'duplicate error',
      });

      expect(events).toEqual(['open', 'error', 'close:1006']);
      expect(telemetry.start.mock.calls).toEqual([
        ['websocket.transport.failure'],
      ]);
      expect(telemetry.setAttr.mock.calls).toEqual([
        ['websocket.transport', 'tauri'],
        ['websocket.socket_id', 7],
        ['websocket.operation', operation],
        ['websocket.outcome', 'closed'],
      ]);
      expect(telemetry.error.mock.calls).toEqual([
        [operation === 'send' ? 'Send failed' : 'Receive failed'],
      ]);
      expect(telemetry.end).toHaveBeenCalledOnce();
    }
  );

  it('handles a disconnect replayed after the WebView resumes', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
    const listen = vi.spyOn(document, 'addEventListener');
    const socket = new TauriWebSocketWrapper('wss://dss.test/ws');
    const events = track(socket);
    plugin.connects[0].resolve(7);
    await Promise.resolve();
    const resume = listen.mock.calls.find(
      ([event]) => event === 'visibilitychange'
    )?.[1];
    if (typeof resume !== 'function')
      throw new Error('Missing resume listener');
    vi.mocked(invoke).mockResolvedValueOnce({
      messages: [
        { seq: 1, message: 'IO error: Socket is not connected (os error 57)' },
        { seq: 2, message: { type: 'Text', data: 'stale message' } },
      ],
      gap: false,
    });
    const onMessage = vi.fn();
    socket.onmessage = onMessage;
    resume.call(document, new Event('visibilitychange'));
    await Promise.resolve();

    expect(events).toEqual(['open', 'error', 'close:1006']);
    expect(onMessage).not.toHaveBeenCalled();
    expect(socket.readyState).toBe(socket.CLOSED);
  });

  it('reports native read errors as an abnormal closure so callers can reconnect', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const socket = new TauriWebSocketWrapper('wss://dss.test/ws');
    const events = track(socket);
    const onMessage = plugin.connects[0].args.onMessage;
    plugin.connects[0].resolve(7);
    await Promise.resolve();

    expect(() =>
      onMessage.onmessage?.({
        seq: 1,
        message: 'IO error: Socket is not connected (os error 57)',
      })
    ).not.toThrow();
    expect(socket.readyState).toBe(socket.CLOSED);
    expect(events).toEqual(['open', 'error', 'close:1006']);
    onMessage.onmessage?.({
      seq: 2,
      message:
        'WebSocket protocol error: Connection reset without closing handshake',
    });
    expect(events).toEqual(['open', 'error', 'close:1006']);
  });

  it('does not open a socket when a native read error arrives before connect resolves', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const socket = new TauriWebSocketWrapper('wss://dss.test/ws');
    const events = track(socket);
    expect(() =>
      plugin.connects[0].args.onMessage.onmessage?.({
        seq: 1,
        message: 'IO error: Socket is not connected (os error 57)',
      })
    ).not.toThrow();
    plugin.connects[0].resolve(7);
    await Promise.resolve();

    expect(events).toEqual(['error', 'close:1006']);
    expect(socket.readyState).toBe(socket.CLOSED);
    expect(plugin.sent).toEqual([
      {
        id: 7,
        message: {
          type: 'Close',
          data: { code: 1000, reason: 'Disconnected by client' },
        },
      },
    ]);
  });

  it('can stand in for the WebSocket constructor', () => {
    expect(TauriWebSocketWrapper.CONNECTING).toBe(0);
    expect(TauriWebSocketWrapper.OPEN).toBe(1);
    expect(TauriWebSocketWrapper.CLOSING).toBe(2);
    expect(TauriWebSocketWrapper.CLOSED).toBe(3);
  });

  it('negotiates a single subprotocol through the handshake headers', async () => {
    const socket = new TauriWebSocketWrapper(
      'wss://dss.test/ws',
      'graphql-transport-ws'
    );
    const events = track(socket);
    expect(plugin.connects[0]?.args.config).toEqual({
      headers: [['Sec-WebSocket-Protocol', 'graphql-transport-ws']],
    });
    expect(socket.protocol).toBe('');

    plugin.connects[0]?.resolve(7);
    await settle();

    expect(events).toEqual(['open']);
    expect(socket.protocol).toBe('graphql-transport-ws');
  });

  it('sends no handshake config without a subprotocol', () => {
    new TauriWebSocketWrapper('wss://dss.test/ws');
    expect(plugin.connects[0]?.args).not.toHaveProperty('config');
  });

  it('rejects several subprotocols it cannot tell apart', () => {
    expect(
      () => new TauriWebSocketWrapper('wss://dss.test/ws', ['one', 'two'])
    ).toThrow(SyntaxError);
    expect(plugin.connects).toHaveLength(0);
  });

  it('drops a connection that completes after close()', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const socket = new TauriWebSocketWrapper('wss://dss.test/ws');
    const events = track(socket);

    socket.close();
    expect(socket.readyState).toBe(socket.CLOSING);
    await settle();
    expect(events).toEqual(['close:1006']);
    expect(socket.readyState).toBe(socket.CLOSED);

    plugin.connects[0]?.resolve(7);
    await settle();

    expect(events).toEqual(['close:1006']);
    expect(socket.readyState).toBe(socket.CLOSED);
    expect(plugin.sent).toEqual([
      {
        id: 7,
        message: {
          type: 'Close',
          data: { code: 1000, reason: 'Disconnected by client' },
        },
      },
    ]);
  });

  it('reports one closure when a connect fails after close()', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const socket = new TauriWebSocketWrapper('wss://dss.test/ws');
    const events = track(socket);

    socket.close();
    plugin.connects[0]?.reject(new Error('unreachable'));
    await settle();

    expect(events).toEqual(['close:1006']);
  });

  it('closes with the requested code and reports it exactly once', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const socket = new TauriWebSocketWrapper('wss://dss.test/ws');
    const events = track(socket);
    plugin.connects[0]?.resolve(7);
    await settle();

    socket.close(4499, 'Terminated');
    expect(socket.readyState).toBe(socket.CLOSING);
    await settle();

    expect(plugin.sent).toEqual([
      {
        id: 7,
        message: { type: 'Close', data: { code: 4499, reason: 'Terminated' } },
      },
    ]);
    expect(events).toEqual(['open', 'close:4499']);
    expect(socket.readyState).toBe(socket.CLOSED);
  });

  it('does not report the echo of a local close a second time', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const socket = new TauriWebSocketWrapper('wss://dss.test/ws');
    const events = track(socket);
    plugin.connects[0]?.resolve(7);
    await settle();

    socket.close(1000, 'Normal Closure');
    const echo = {
      type: 'Close',
      data: { code: 1000, reason: 'Normal Closure' },
    };
    plugin.connects[0]?.args.onMessage.onmessage?.({ seq: 1, message: echo });
    await settle();
    plugin.connects[0]?.args.onMessage.onmessage?.({ seq: 2, message: echo });

    expect(events).toEqual(['open', 'close:1000']);
  });

  it('reports a server-initiated closure once', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const socket = new TauriWebSocketWrapper('wss://dss.test/ws');
    const events = track(socket);
    plugin.connects[0]?.resolve(7);
    await settle();

    const onMessage = plugin.connects[0]?.args.onMessage;
    onMessage?.onmessage?.({
      seq: 1,
      message: { type: 'Close', data: { code: 1012, reason: 'restart' } },
    });
    socket.close();
    await settle();

    expect(events).toEqual(['open', 'close:1012']);
    expect(plugin.sent).toEqual([]);
  });
});
