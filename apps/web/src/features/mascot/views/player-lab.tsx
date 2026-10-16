import { Button } from '@ui/components/Button';
import { createSignal, For, onCleanup } from 'solid-js';
import { Compass } from '../components/compass';
import {
  AgentMascotAdapter,
  type AgentVisualSnapshot,
} from '../core/agent-policy';
import type { LookIndex, Snapshot, Target } from '../core/types';
import type { StateMachinePlayer } from '../runtime/player.js';
import { MascotPlayer } from './mascot-player';

export default function PlayerLab() {
  const [target, setTarget] = createSignal<Target>('idle');
  const [snapshot, setSnapshot] = createSignal<Snapshot>();
  const [events, setEvents] = createSignal<string[]>([]);
  const [size, setSize] = createSignal(128);
  const [paused, setPaused] = createSignal(false);
  let player: StateMachinePlayer | undefined;
  let turn = 0;
  const log = (message: string) =>
    setEvents((events) =>
      [`${new Date().toLocaleTimeString()} ${message}`, ...events].slice(0, 40)
    );
  const request = (value: Target) => {
    setTarget(value);
    log(`Request ${value}`);
  };
  const adapter = new AgentMascotAdapter({ request });
  const simulate = (state: Partial<AgentVisualSnapshot>) => {
    log(`Agent ${JSON.stringify(state)}`);
    adapter.update({ sessionId: 'lab', turn: 'idle', ...state });
  };
  simulate({});
  const timers = new Set<ReturnType<typeof setTimeout>>();
  onCleanup(() => {
    adapter.destroy();
    for (const timer of timers) clearTimeout(timer);
  });
  const burst = () => {
    (['thinking', 'failure', 'smile'] as const).forEach((value, i) => {
      const timer = setTimeout(() => {
        timers.delete(timer);
        request(value);
      }, i * 140);
      timers.add(timer);
    });
  };
  return (
    <main class="h-full overflow-auto bg-surface p-6 text-ink">
      <h1 class="text-xl font-semibold">Mascot player lab</h1>
      <p class="my-3 text-ink-muted">
        Canvas 2D playback. This simulator never sends prompts or session
        commands.
      </p>
      <div class="grid gap-6 md:grid-cols-2">
        <section class="space-y-4 rounded-xl border border-edge-muted p-4">
          <div class="flex h-48 items-center justify-center">
            <MascotPlayer
              size={size()}
              target={target()}
              onError={(message) => log(`Asset error: ${message}`)}
              onReady={(value) => {
                player = value;
              }}
              onChange={(value) => {
                setSnapshot(value);
                log(`${value.kind} → ${value.target}`);
              }}
            />
          </div>
          <div class="flex flex-wrap gap-2">
            <For
              each={
                [
                  'logo',
                  'idle',
                  'smile',
                  'failure',
                  'confused',
                  'thinking',
                ] as const
              }
            >
              {(value) => (
                <Button
                  variant="outline"
                  aria-pressed={target() === value}
                  onClick={() => request(value)}
                >
                  {value}
                </Button>
              )}
            </For>
          </div>
          <Compass
            value={
              target().startsWith('look:')
                ? (Number(target().slice(5)) as LookIndex)
                : null
            }
            onChange={(index) =>
              request(index === null ? 'idle' : `look:${index}`)
            }
          />
          <div class="flex gap-2">
            <Button
              variant="outline"
              onClick={() => {
                player?.blink();
                log('Blink requested');
              }}
            >
              Blink
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                if (paused()) player?.resume();
                else player?.pause();
                setPaused(!paused());
              }}
            >
              {paused() ? 'Resume' : 'Pause'}
            </Button>
            <Button variant="outline" onClick={burst}>
              Rapid interruptions
            </Button>
          </div>
          <div class="flex gap-2">
            <For each={[32, 48, 64, 128]}>
              {(value) => (
                <Button
                  aria-pressed={size() === value}
                  onClick={() => setSize(value)}
                >
                  {value}px
                </Button>
              )}
            </For>
          </div>
          <pre class="overflow-auto text-xs" aria-label="Player state">
            {JSON.stringify(snapshot(), null, 2)}
          </pre>
        </section>
        <section class="space-y-4">
          <h2 class="font-semibold">Agent simulator</h2>
          <div class="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => simulate({ turn: 'running' })}
            >
              Start turn
            </Button>
            <Button
              variant="outline"
              onClick={() => simulate({ turn: 'blocked' })}
            >
              Needs input
            </Button>
            <Button variant="outline" onClick={() => simulate({ error: true })}>
              Fail
            </Button>
            <Button
              variant="outline"
              onClick={() => simulate({ completedTurnId: String(++turn) })}
            >
              Complete
            </Button>
            <Button variant="outline" onClick={() => simulate({})}>
              Cancel
            </Button>
            <Button
              variant="outline"
              onClick={() => simulate({ turn: 'disconnected' })}
            >
              Disconnect
            </Button>
          </div>
          <p class="text-sm text-ink-muted">
            Success requires a confirmed new turn after at least 350 ms of
            observed work. Reduced motion follows your system preference.
            Expressions exit through neutral; looks are static whole-body
            frames.
          </p>
          <h2 class="font-semibold">Event history</h2>
          <ol class="max-h-96 overflow-auto font-mono text-xs">
            <For each={events()}>
              {(event) => (
                <li class="border-b border-edge-muted py-2">{event}</li>
              )}
            </For>
          </ol>
        </section>
      </div>
    </main>
  );
}
