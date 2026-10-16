import { LOCAL_ONLY } from '@core/constant/featureFlags';
import { isMacroAgentId } from '@core/constant/macroAgent';
import { isMacroCoderId } from '@core/constant/macroCoder';
import MacroLogo from '@icon/macro-logo.svg';
import { lazy, Show, Suspense } from 'solid-js';
import { useAgentSession } from '../context/AgentSessionContext';

const AgentSessionMascot = lazy(() => import('./AgentSessionMascot'));

/** Host rollout/identity policy stays outside the reusable mascot feature. */
export function AgentMascotSlot(props: { active: boolean }) {
  const { session, bot } = useAgentSession();
  const eligible = () =>
    LOCAL_ONLY &&
    !session()?.external &&
    !bot()?.avatarUrl &&
    (isMacroAgentId(session()?.botId) || isMacroCoderId(session()?.botId));
  return (
    <Show when={eligible()}>
      <span
        class="inline-flex size-8 shrink-0 items-center justify-center"
        aria-hidden="true"
      >
        <Show
          when={props.active}
          fallback={<MacroLogo class="size-4 text-ink-muted" />}
        >
          <Suspense fallback={<MacroLogo class="size-4 text-ink-muted" />}>
            <AgentSessionMascot />
          </Suspense>
        </Show>
      </span>
    </Show>
  );
}
