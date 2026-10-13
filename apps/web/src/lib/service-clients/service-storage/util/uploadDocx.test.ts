import type { MinimalWebSocket } from '@macro-inc/collaboration/websocket/platform/minimal-websocket';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { uploadDocx } from './uploadDocx';

vi.mock('@core/constant/featureFlags', () => ({ ENABLE_DOCX_TO_PDF: true }));

afterEach(() => vi.useRealTimers());

describe('uploadDocx', () => {
  it('accepts a minimal socket and resolves the upload and conversion responses', async () => {
    vi.useFakeTimers();
    const listeners = new Map<string, (event: Event) => void>();
    const sent: string[] = [];
    const ws: MinimalWebSocket = {
      binaryType: 'blob',
      bufferedAmount: 0,
      extensions: '',
      protocol: '',
      readyState: WebSocket.OPEN,
      url: 'ws://test',
      onclose: null,
      onerror: null,
      onmessage: null,
      onopen: null,
      CONNECTING: 0,
      OPEN: 1,
      CLOSING: 2,
      CLOSED: 3,
      addEventListener(type, listener) {
        listeners.set(type, (event) => Reflect.apply(listener, ws, [event]));
      },
      removeEventListener(type) {
        listeners.delete(type);
      },
      dispatchEvent(event) {
        listeners.get(event.type)?.(event);
        return true;
      },
      close() {},
      send(data) {
        if (typeof data === 'string') sent.push(data);
      },
    };

    const [jobPromise, conversionPromise] = uploadDocx(ws);
    await Promise.resolve();
    expect(JSON.parse(sent[0])).toMatchObject({ action: 'docx_upload' });
    const { requestId } = JSON.parse(sent[0]);
    const emit = (data: object) =>
      ws.dispatchEvent(
        new MessageEvent('message', {
          data: JSON.stringify({
            macroRequestId: requestId,
            status: 'Success',
            jobId: 'job-1',
            data: { data },
          }),
        })
      );
    emit({ success: true });
    emit({ converted: true });

    await expect(Promise.all([jobPromise, conversionPromise])).resolves.toEqual(
      ['job-1', true]
    );
    expect(listeners.size).toBe(0);
  });
});
