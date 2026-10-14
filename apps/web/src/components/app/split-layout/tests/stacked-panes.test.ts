import {
  createMemoryHistory,
  createMemoryPaneStore,
  createSplitRouter,
  type Entry,
  type SplitRoutes,
} from '@app/lib/split-router';
import { paneRoute } from '@app/routes/app-route';
import {
  appRoute,
  calendarSplitRoute,
  driveSplitRoute,
  homeSplitRoute,
  notFoundRoute,
  settingsRoute,
} from '@app/routes/routes';
import type { BlockOrchestrator } from '@core/orchestrator';
import { createRoot, onCleanup } from 'solid-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSplitLayout, type SplitContent } from '../layoutManager';
import { createMobilePaneStack } from '../mobile/createMobilePaneStack';
import { createAppPanePolicy } from '../split-router/app-pane-policy';
import {
  resolveContentLocation,
  splitContentFromLocation,
} from '../split-router/legacy-route';
import { createRoutedDetailLayout, routeFor } from './fixtures';

vi.mock('../componentRegistry', () => ({
  resolveComponent: vi.fn((id: string, params: Record<string, string>) => ({
    type: 'mock-component',
    id,
    params,
  })),
}));

vi.mock('@core/constant/allBlocks', () => ({
  isBlockAlias: vi.fn(() => false),
  resolveBlockAlias: vi.fn((type: string) => type),
}));

vi.mock('@service-storage/websocket', () => ({
  storageWS: { reconnectIfDisconnected: vi.fn() },
  createWebSocketJob: vi.fn(),
}));
vi.mock('@service-connection/websocket', () => ({
  ws: { addEventListener: vi.fn(), send: vi.fn() },
  state: () => 'closed',
  createConnectionBlockWebsocketEffect: vi.fn(),
  createConnectionWebsocketEffect: vi.fn(),
}));

const home: SplitContent = { type: 'component', id: 'home' };
const settings: SplitContent = { type: 'component', id: 'settings' };
const documents: SplitContent = { type: 'component', id: 'documents' };

const routes: SplitRoutes = {
  definitions: [
    {
      ...appRoute,
      children: [
        homeSplitRoute,
        settingsRoute,
        driveSplitRoute,
        calendarSplitRoute,
        notFoundRoute,
      ],
    },
  ],
  defaultRoute: () => paneRoute({ id: 'view-home', params: {} }),
};

function createMockOrchestrator(): BlockOrchestrator {
  return {
    isBlockMounted: vi.fn(() => false),
    createBlockInstance: vi.fn((_type, id) => ({
      node: { type: 'mock-node', id },
      detach: vi.fn(),
      dispose: vi.fn(),
    })),
  } as unknown as BlockOrchestrator;
}

let dispose: (() => void) | undefined;

function setup(url: string) {
  const history = createMemoryHistory(url);

  return createRoot((disposeRoot) => {
    dispose = disposeRoot;
    let manager: ReturnType<typeof createSplitLayout> | undefined;
    const router = createSplitRouter({
      routes,
      history,
      paneStore: createMemoryPaneStore<Entry>(),
      policy: createAppPanePolicy({
        manager: () => manager,
        toContent: splitContentFromLocation,
        defaultLocation: () => ({
          route: paneRoute({ id: 'view-home', params: {} }),
        }),
        stacked: () => true,
      }),
    });
    manager = createSplitLayout(createMockOrchestrator(), {
      router,
      toLocation: (content) => resolveContentLocation(router.routes, content),
      toContent: splitContentFromLocation,
      stacked: () => true,
    });
    const stack = createMobilePaneStack(manager);
    const shown = () =>
      manager!.splits().map((split) => split.content.id as string);
    const active = () => manager!.activeSplit()?.content().id;

    return { history, router, manager, stack, shown, active };
  });
}

afterEach(() => {
  dispose?.();
  dispose = undefined;
});

describe('stacked panes', () => {
  it('opens content in a new pane in front, and going back closes it', () => {
    const { manager, stack, shown, active } = setup('/home');
    const forward = vi.fn();
    stack.setForwardTrigger(forward);

    manager.openWithSplit(settings);
    expect(shown()).toEqual(['home', 'settings']);
    expect(active()).toBe('settings');
    expect(manager.getVisibleSplits().map((split) => split.content.id)).toEqual(
      ['settings']
    );
    expect(forward).toHaveBeenCalledOnce();

    expect(stack.canGoBack()).toBe(true);
    stack.completeGoBack();
    expect(shown()).toEqual(['home']);
    expect(active()).toBe('home');
    expect(stack.canGoBack()).toBe(false);
    expect(forward).toHaveBeenCalledOnce();
  });

  it('replaces the front pane in place when the open merges history', () => {
    const { manager, shown } = setup('/home');
    manager.openWithSplit(settings, { mergeHistory: true });
    expect(shown()).toEqual(['settings']);
  });

  it('moves a pane behind that already shows the content to the front, in one history entry', () => {
    const { history, manager, stack, shown, active } = setup('/home');
    manager.openWithSplit(settings);
    manager.openWithSplit(documents);
    expect(shown()).toEqual(['home', 'settings', 'documents']);
    const entries = history.entries().length;
    const forward = vi.fn();
    stack.setForwardTrigger(forward);

    manager.openWithSplit(home);
    expect(shown()).toEqual(['settings', 'documents', 'home']);
    expect(active()).toBe('home');
    expect(history.entries()).toHaveLength(entries + 1);
    expect(forward).toHaveBeenCalledOnce();

    stack.completeGoBack();
    expect(shown()).toEqual(['settings', 'documents']);
    expect(active()).toBe('documents');
  });

  it('resets the stack to one view in one history entry, keeping a pane that already shows it', () => {
    const { history, manager, shown, active } = setup('/home');
    manager.openWithSplit(settings);
    const entries = history.entries().length;

    manager.replaceAllSplits(documents);
    expect(shown()).toEqual(['documents']);
    expect(active()).toBe('documents');
    expect(history.entries()).toHaveLength(entries + 1);

    manager.openWithSplit(home);
    manager.openWithSplit(settings);
    expect(shown()).toEqual(['documents', 'home', 'settings']);
    const homePane = manager.splits()[1]!.id;

    manager.replaceAllSplits(home);
    expect(shown()).toEqual(['home']);
    expect(manager.splits()[0]!.id).toBe(homePane);
    expect(active()).toBe('home');
  });

  it('moves the pane holding a claim to the front when a router open lands on it', () => {
    const { router, manager, shown, active } = setup('/home');
    manager.openWithSplit(settings);
    manager.openWithSplit(documents);

    router.open('/settings', { newPane: true });
    expect(shown()).toEqual(['home', 'documents', 'settings']);
    expect(active()).toBe('settings');
  });
  it('keeps explicit Settings tab destinations for search-bearing opens', async () => {
    const { manager, router } = setup('/settings');
    await router.settled();
    manager.openWithSplit(
      {
        ...settings,
        entryMetadata: {
          location: {
            route: paneRoute({ id: 'settings', params: { tab: 'email' } }),
          },
        },
      },
      { search: {}, mergeHistory: true }
    );
    await router.settled();
    expect(
      routeFor(router, manager.splits()[0]!.id)?.matches.at(-1)?.params.tab
    ).toBe('email');
  });

  it('preserves Calendar event targets from compatibility content', () => {
    const { router } = setup('/home');
    const location = resolveContentLocation(router.routes, {
      type: 'component',
      id: 'calendar',
      params: { eventId: 'event', occurrenceKey: 'occurrence' },
    });
    expect(location.search?.calendar).toMatchObject({
      eventId: ['event'],
      occurrenceKey: ['occurrence'],
    });
  });
});

it('creates legacy fallbacks on render and retains adopted identity after remounting', () => {
  const orchestrator = {
    createBlockInstance: vi.fn((type: string, id: string) => ({
      type,
      id,
      element: () => null,
    })),
    rekeyBlockInstance: vi.fn(),
  };
  createRoot((disposeRoot) => {
    dispose = disposeRoot;
    const { manager } = createRoutedDetailLayout(
      orchestrator as unknown as BlockOrchestrator,
      '/md/placeholder'
    );
    const split = manager.splits()[0]!;
    expect(orchestrator.createBlockInstance).not.toHaveBeenCalled();
    let closeFallback = () => {};
    onCleanup(() => closeFallback());
    const renderFallback = () =>
      createRoot((disposeFallback) => {
        split.mount.element();
        return disposeFallback;
      });
    closeFallback = renderFallback();
    expect(orchestrator.createBlockInstance).toHaveBeenCalledOnce();
    manager
      .getSplit(split.id)!
      .adoptContentId({ type: 'md', nextId: 'document' });
    expect(manager.splits()[0]!.mount).toBe(split.mount);
    expect(orchestrator.rekeyBlockInstance).toHaveBeenCalledExactlyOnceWith(
      'md',
      'placeholder',
      'document'
    );
    closeFallback();
    expect(
      split.mount.kind === 'block' ? split.mount.handle : undefined
    ).toBeUndefined();
    closeFallback = renderFallback();
    expect(orchestrator.createBlockInstance).toHaveBeenLastCalledWith(
      'md',
      'document',
      {
        aliasContext: undefined,
        params: undefined,
      }
    );
    expect(orchestrator.createBlockInstance).toHaveBeenCalledTimes(2);
  });
});

it.each([true, false])(
  'sends latest requests only to registered handles without legacy instances (registered: %s)',
  async (registered) => {
    const goToLatest = vi.fn();
    const orchestrator = {
      isBlockMounted: vi.fn(() => false),
      hasBlockHandle: vi.fn(() => registered),
      getBlockHandle: vi.fn(async () => ({ goToLatest })),
      createBlockInstance: vi.fn(),
    };
    const { manager, router } = createRoot((disposeRoot) => {
      dispose = disposeRoot;
      return createRoutedDetailLayout(
        orchestrator as unknown as BlockOrchestrator,
        '/channels/channel'
      );
    });
    await router.settled();

    manager.openWithSplit(
      { type: 'channel', id: 'channel' },
      { reopen: 'latest' }
    );
    await router.settled();

    expect(goToLatest).toHaveBeenCalledTimes(registered ? 1 : 0);
    expect(orchestrator.getBlockHandle).toHaveBeenCalledTimes(
      registered ? 1 : 0
    );
    expect(orchestrator.createBlockInstance).not.toHaveBeenCalled();
  }
);
