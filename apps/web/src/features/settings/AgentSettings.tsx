import { useSearchParams } from '@solidjs/router';
import { createSignal, Match, onMount, Switch } from 'solid-js';
import { Agents } from './Agents';
import { CursorConnectPage } from './CursorConnectPage';
import { Harness } from './Harness';
import { RuntimePairingPage } from './RuntimePairingPage';

type AgentSettingsPage = 'agents' | 'cursor' | 'pairing' | 'harness';

/** One management surface, mounted by both Settings and the Agents workspace. */
export function AgentSettings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const pairingCode =
    typeof searchParams.pair === 'string' && searchParams.pair.length > 0
      ? searchParams.pair
      : undefined;
  const [page, setPage] = createSignal<AgentSettingsPage>(
    pairingCode ? 'pairing' : 'agents'
  );
  const [draft, setDraft] = createSignal<{
    harnessId: string;
    modelId: string;
  }>();
  const showAgents = () => {
    setDraft(undefined);
    setPage('agents');
  };

  onMount(() => {
    if (pairingCode) {
      setSearchParams({ pair: undefined }, { replace: true });
    }
  });

  return (
    <Switch>
      <Match when={page() === 'agents'}>
        <Agents
          startWith={draft()}
          onCursor={() => setPage('cursor')}
          onSetUpRuntime={() => setPage('pairing')}
          onManageRuntimes={() => setPage('harness')}
        />
      </Match>
      <Match when={page() === 'cursor'}>
        <CursorConnectPage onClose={showAgents} />
      </Match>
      <Match when={page() === 'pairing'}>
        <RuntimePairingPage initialCode={pairingCode} onClose={showAgents} />
      </Match>
      <Match when={page() === 'harness'}>
        <Harness
          onBack={showAgents}
          onChooseModel={(harness) => {
            setDraft({ harnessId: harness.id, modelId: harness.modelId });
            setPage('agents');
          }}
        />
      </Match>
    </Switch>
  );
}
