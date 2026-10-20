import { createRoot } from 'solid-js';
import { expect, it } from 'vitest';
import { createConnectionsViewState } from './view-state';

it('opens a selected provider and returns to its connection overview', () => {
  createRoot((dispose) => {
    const view = createConnectionsViewState({ provider: 'github' });
    expect(view.provider()).toBe('github');
    view.showOverview();
    expect(view.provider()).toBeNull();
    expect(view.mode()).toBe('connected');
    dispose();
  });
});
it('starts in discovery and preserves that mode when closing a provider', () => {
  createRoot((dispose) => {
    const view = createConnectionsViewState({ mode: 'discover' });
    expect(view.mode()).toBe('discover');
    view.openProvider('github');
    view.closeProvider();
    expect(view.provider()).toBeNull();
    expect(view.mode()).toBe('discover');
    dispose();
  });
});
