import type {
  FoldedMessage,
  TurnState,
} from '@service-agent-fold/generated/types';
import type { AgentVisualSnapshot } from '../../mascot/core/agent-policy';
import { lastTurnMessage } from './control-message';

/** Read the existing fold only; content, tokens and transport loss are not outcomes. */
export function mascotSnapshot(input: {
  sessionId: string;
  ready: boolean;
  turn: TurnState;
  needsInput: boolean;
  messages: readonly FoldedMessage[];
}): AgentVisualSnapshot {
  const last = lastTurnMessage(input.messages);
  const current = last?.agentSessionId === input.sessionId ? last : undefined;
  const settled =
    input.turn !== 'starting' &&
    input.turn !== 'running' &&
    input.turn !== 'stopping';
  const terminal =
    settled && current?.author.kind === 'agent' && !current.pending
      ? current
      : undefined;
  return {
    sessionId: input.sessionId,
    ready: input.ready && (!last || !!current),
    turn: input.turn,
    needsInput: input.needsInput,
    error: terminal?.stop?.kind === 'failed',
    completedTurnId:
      terminal?.stop?.kind === 'end_turn' ? String(terminal.turn) : undefined,
  };
}
