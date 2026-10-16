import { MACRO_AGENT_BOT_ID } from '@core/constant/macroAgent';
import { cleanup, render, waitFor } from '@solidjs/testing-library';
import { createSignal, onCleanup } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';
import { AgentMascotSlot } from './AgentMascotSlot';

const mocks = vi.hoisted(() => ({
  session: (): { botId: string; external?: boolean } | undefined => undefined,
  bot: (): { avatarUrl?: string } | undefined => undefined,
  dispose: vi.fn(),
}));
vi.mock('@core/constant/featureFlags', () => ({ LOCAL_ONLY: true }));
vi.mock('../context/AgentSessionContext', () => ({
  useAgentSession: () => ({ session: mocks.session, bot: mocks.bot }),
}));
vi.mock('./AgentSessionMascot', () => ({
  default: () => {
    onCleanup(mocks.dispose);
    return <canvas aria-label="test mascot" />;
  },
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it('reserves the slot while inactive and disposes its player when focus moves', async () => {
  mocks.session = () => ({ botId: MACRO_AGENT_BOT_ID });
  mocks.bot = () => undefined;
  const [active, setActive] = createSignal(false);
  const view = render(() => <AgentMascotSlot active={active()} />);
  const slot = view.container.firstElementChild;
  expect(slot?.classList.contains('size-8')).toBe(true);
  expect(view.container.querySelector('canvas')).toBeNull();
  setActive(true);
  await waitFor(() =>
    expect(view.container.querySelector('canvas')).not.toBeNull()
  );
  setActive(false);
  expect(view.container.firstElementChild).toBe(slot);
  expect(view.container.querySelector('canvas')).toBeNull();
  expect(mocks.dispose).toHaveBeenCalledTimes(1);
});

it('preserves custom avatars and third-party identities', async () => {
  const [session, setSession] = createSignal({
    botId: 'third-party',
    external: false,
  });
  const [bot, setBot] = createSignal<{ avatarUrl?: string }>({});
  mocks.session = session;
  mocks.bot = bot;
  const view = render(() => <AgentMascotSlot active />);
  expect(view.container.children.length).toBe(0);
  setSession({ botId: MACRO_AGENT_BOT_ID, external: true });
  expect(view.container.children.length).toBe(0);
  setBot({ avatarUrl: '/custom-avatar.png' });
  setSession({ botId: MACRO_AGENT_BOT_ID, external: false });
  expect(view.container.children.length).toBe(0);
  setBot({});
  await waitFor(() =>
    expect(view.container.querySelector('canvas')).not.toBeNull()
  );
});
