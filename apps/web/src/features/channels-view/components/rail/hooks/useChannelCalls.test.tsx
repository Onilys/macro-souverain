import { cleanup, render, screen } from '@solidjs/testing-library';
import { Suspense } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';

const pending = Promise.withResolvers<never>();
vi.mock('@app/features/block-call/sidebar/incoming-calls', () => ({
  useVisibleIncomingCalls: () => () => [],
}));
vi.mock('@queries/call/call', () => ({
  useActiveCallsQuery: () => ({
    isPending: true,
    get data() {
      throw pending.promise;
    },
  }),
}));

import { useChannelCalls } from './useChannelCalls';

afterEach(cleanup);

it('does not suspend the caller while active calls are pending', () => {
  function View() {
    const calls = useChannelCalls();
    return <div data-testid="calls">{String(calls.callActivity().length)}</div>;
  }

  render(() => (
    <Suspense fallback={<div data-testid="suspended" />}>
      <View />
    </Suspense>
  ));

  expect(screen.queryByTestId('suspended')).toBeNull();
  expect(screen.getByTestId('calls').textContent).toBe('0');
});
