import { createRoot, createSignal } from 'solid-js';
import { expect, it, vi } from 'vitest';
import type { EmailMessage } from '../../email-message/core/email-message';
import { createReplyTargetMessage } from './reply-target-message';

const message = (id: string) => ({ db_id: id }) as EmailMessage;

function setup(pages: string[][], fetchOlder?: () => Promise<void>) {
  const [loaded, setLoaded] = createSignal(1);
  const [fetching, setFetching] = createSignal(false);
  const reportError = vi.fn();
  const older = vi.fn(
    fetchOlder ??
      (async () => {
        setFetching(true);
        await Promise.resolve();
        setLoaded((count) => count + 1);
        setFetching(false);
      })
  );
  return createRoot((dispose) => ({
    target: createReplyTargetMessage({
      messageId: () => 'old',
      messages: () => pages.slice(0, loaded()).flat().map(message),
      source: {
        thread: () => ({}) as never,
        isError: () => false,
        hasMore: () => loaded() < pages.length,
        isFetchingOlder: fetching,
        fetchOlder: older,
      },
      reportError,
    }),
    older,
    reportError,
    dispose,
  }));
}

it('loads older pages until the replied-to message appears', async () => {
  const { target, older, dispose } = setup([['new'], ['mid'], ['old']]);
  await vi.waitFor(() => expect(target.message()?.db_id).toBe('old'));
  expect(older).toHaveBeenCalledTimes(2);
  expect(target.missing()).toBe(false);
  dispose();
});

it('reports the message missing once the whole thread loaded without it', async () => {
  const { target, dispose } = setup([['new'], ['mid']]);
  await vi.waitFor(() => expect(target.missing()).toBe(true));
  expect(target.message()).toBeUndefined();
  dispose();
});

it('stops and reports a page that fails to load', async () => {
  const failure = new Error('offline');
  const { target, older, reportError, dispose } = setup(
    [['new'], ['old']],
    async () => {
      throw failure;
    }
  );
  await vi.waitFor(() => expect(target.missing()).toBe(true));
  expect(reportError).toHaveBeenCalledWith(failure);
  expect(older).toHaveBeenCalledOnce();
  dispose();
});
