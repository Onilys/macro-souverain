import { createRoot } from 'solid-js';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useQueuedEmailSends } from './queued-sends';
import type { EmailSendIntent } from './send-queue';

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  recover: vi.fn(async () => {}),
  status: vi.fn(async () => null),
}));
vi.mock('./send-queue', async (original) => ({
  ...(await original<typeof import('./send-queue')>()),
  readEmailSendIntents: mocks.read,
  recoverEmailSendIntent: mocks.recover,
  fetchEmailSendStatus: mocks.status,
  retireEmailSendIntent: async () => false,
  watchEmailSends: () => () => {},
}));
vi.mock('./send-draft-lifecycle', () => ({
  supersededSendRestoration: async () => false,
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('navigator', { onLine: true });
  vi.stubGlobal('window', { addEventListener() {}, removeEventListener() {} });
});
afterEach(() => vi.unstubAllGlobals());

it.each([false, true])(
  'resumes an interrupted durable decision with a surviving catalog, restoring: %s',
  async (restoring) => {
    const intent: EmailSendIntent = {
      uuid: 'attempt',
      phase: 'pending',
      locallyCancelled: false,
      cancellationRequested: true,
      recoveryRequired: true,
      metadata: {
        kind: 'email-send-v1',
        payload: {
          restoring,
          input: {
            attempt: { attemptId: 'attempt', linkId: 'inbox' },
            message: { draftId: 'draft', subject: 'Recovered decision' },
            attachmentIds: [],
            forwardedAttachmentIds: [],
          },
          draft: {
            draftId: 'draft',
            threadDbId: 'thread',
            senderLinkId: 'inbox',
            senderEmail: 'sender@example.invalid',
            subject: 'Recovered decision',
            optimisticBodyHtml: null,
          },
        },
      },
    };
    mocks.read.mockResolvedValue([intent]);
    let dispose = () => {};
    const queue = createRoot((cleanup) => {
      dispose = cleanup;
      return useQueuedEmailSends();
    });
    try {
      await queue.refresh(true);
      expect(mocks.recover).toHaveBeenCalledWith(intent);
      expect(mocks.status).not.toHaveBeenCalled();
      // Recording the new request stops recovery while normal polling continues.
      mocks.recover.mockClear();
      mocks.read.mockResolvedValue([{ ...intent, recoveryRequired: false }]);
      await queue.refresh(true);
      expect(mocks.recover).not.toHaveBeenCalled();
    } finally {
      dispose();
    }
  }
);
