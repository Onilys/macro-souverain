import type {
  FoldedMessage,
  StopReason,
} from '@service-agent-fold/generated/types';
import { expect, it } from 'vitest';
import { mascotSnapshot } from './mascot-snapshot';

const message = (stop: StopReason | null, turn = 3): FoldedMessage => ({
  agentSessionId: 'a',
  turn,
  author: { kind: 'agent' },
  requestId: null,
  parts: [{ kind: 'text', text: 'Reply' }] as FoldedMessage['parts'],
  stop,
  pending: false,
});
it('uses confirmed stop and turn identity, not idle or historical unfinished tails', () => {
  const snapshot = (messages: FoldedMessage[]) =>
    mascotSnapshot({
      sessionId: 'a',
      ready: true,
      turn: 'idle',
      needsInput: false,
      messages,
    });
  expect(snapshot([message(null)]).completedTurnId).toBeUndefined();
  expect(
    snapshot([message({ kind: 'cancelled' })]).completedTurnId
  ).toBeUndefined();
  expect(snapshot([message({ kind: 'end_turn' })]).completedTurnId).toBe('3');
  expect(snapshot([message({ kind: 'failed', message: 'Failed' })]).error).toBe(
    true
  );
  expect(
    snapshot([{ ...message({ kind: 'end_turn' }), pending: true }])
      .completedTurnId
  ).toBeUndefined();
  expect(
    snapshot([message({ kind: 'end_turn' }), message(null, 4)]).completedTurnId
  ).toBeUndefined();
  expect(
    snapshot([{ ...message({ kind: 'end_turn' }), agentSessionId: 'b' }]).ready
  ).toBe(false);
});
