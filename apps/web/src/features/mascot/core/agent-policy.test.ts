import { afterEach, expect, it, vi } from 'vitest';
import { AgentMascotAdapter, agentTarget } from './agent-policy';

afterEach(() => vi.useRealTimers());
it('suppresses hydration, deduplicates completion, cancels success on work/input/error and disposes', () => {
  vi.useFakeTimers();
  const request = vi.fn();
  const adapter = new AgentMascotAdapter({ request });
  adapter.update({ sessionId: 'a', ready: false });
  adapter.update({ sessionId: 'a', completedTurnId: 'old' });
  expect(request).toHaveBeenLastCalledWith('idle');
  adapter.update({ sessionId: 'a', turn: 'running' });
  vi.advanceTimersByTime(500);
  adapter.update({ sessionId: 'a', completedTurnId: 'new' });
  expect(request).toHaveBeenLastCalledWith('smile');
  adapter.update({ sessionId: 'a', completedTurnId: 'new' });
  expect(vi.getTimerCount()).toBe(1);
  adapter.update({ sessionId: 'a', turn: 'blocked' });
  expect(request).toHaveBeenLastCalledWith('confused');
  expect(vi.getTimerCount()).toBe(0);
  adapter.update({ sessionId: 'b', completedTurnId: 'new' });
  expect(request).toHaveBeenLastCalledWith('idle');
  adapter.destroy();
  const count = request.mock.calls.length;
  adapter.update({ sessionId: 'b', error: true });
  expect(request).toHaveBeenCalledTimes(count);
  expect(
    agentTarget({
      sessionId: 'a',
      turn: 'running',
      error: true,
      needsInput: true,
    })
  ).toBe('failure');
  expect(agentTarget({ sessionId: 'a', turn: 'disconnected' })).toBe('idle');
});
it('does not celebrate short work, cancellation, replacement or reconnect', () => {
  vi.useFakeTimers();
  const request = vi.fn();
  const adapter = new AgentMascotAdapter({ request });
  adapter.update({ sessionId: 'a' });
  adapter.update({ sessionId: 'a', turn: 'running' });
  vi.advanceTimersByTime(100);
  adapter.update({ sessionId: 'a', completedTurnId: 'short' });
  expect(request).toHaveBeenLastCalledWith('idle');
  adapter.update({ sessionId: 'a', turn: 'running' });
  vi.advanceTimersByTime(500);
  adapter.update({ sessionId: 'a', turn: 'disconnected' });
  adapter.update({ sessionId: 'a', completedTurnId: 'reconnected' });
  expect(request).not.toHaveBeenCalledWith('smile');
  adapter.destroy();
});
