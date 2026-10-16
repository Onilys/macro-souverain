import {
  createEffect,
  createMemo,
  createSignal,
  on,
  onCleanup,
  Show,
} from 'solid-js';
import { AgentMascotAdapter } from '../../mascot/core/agent-policy';
import type { StateMachinePlayer } from '../../mascot/runtime/player.js';
import { MascotPlayer } from '../../mascot/views/mascot-player';
import { useAgentSession } from '../context/AgentSessionContext';
import { mascotSnapshot } from '../state/mascot-snapshot';

function SessionMascot(props: { sessionId: string }) {
  const session = useAgentSession();
  const [player, setPlayer] = createSignal<StateMachinePlayer>();
  const snapshot = createMemo(
    () =>
      mascotSnapshot({
        sessionId: props.sessionId,
        ready: session.metadata() !== undefined && !session.loadFailed(),
        turn: session.turn(),
        needsInput: session.interactions.pending().length > 0,
        messages: session.messages(),
      }),
    undefined,
    { equals: (a, b) => JSON.stringify(a) === JSON.stringify(b) }
  );
  createEffect(
    on(player, (player) => {
      if (!player) return;
      const adapter = new AgentMascotAdapter(player);
      createEffect(on(snapshot, (value) => adapter.update(value)));
      onCleanup(() => adapter.destroy());
    })
  );
  return <MascotPlayer target="idle" size={32} onReady={setPlayer} />;
}
/** The keyed owner discards completion history and timers on session changes. */
export default function AgentSessionMascot() {
  const session = useAgentSession();
  return (
    <Show when={session.sessionId()} keyed>
      {(id) => <SessionMascot sessionId={id} />}
    </Show>
  );
}
