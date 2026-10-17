import { publishRefreshOutcome } from '@core/auth/refresh-outcome';
import { sessionStatus } from '@core/auth/session';
import { cleanup, render, waitFor } from '@solidjs/testing-library';
import { QueryClientProvider, useQuery } from '@tanstack/solid-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { authKeys } from './auth/keys';
import { queryClient } from './client';
import { establishesSession } from './session-gate';

afterEach(() => {
  cleanup();
  publishRefreshOutcome('reset');
  queryClient.clear();
});

describe('app queryClient session binding', () => {
  it('derives the session from the user-info query', () => {
    expect(sessionStatus()).toBe('signed-out');

    queryClient.setQueryData(authKeys.userInfo.queryKey, {
      authenticated: true,
      id: 'macro|user@example.com',
    });
    expect(sessionStatus()).toBe('signed-in');

    queryClient.setQueryData(authKeys.userInfo.queryKey, {
      authenticated: false,
    });
    expect(sessionStatus()).toBe('signed-out');
  });

  it('expires on a rejected refresh even while user-info holds the old identity', () => {
    queryClient.setQueryData(authKeys.userInfo.queryKey, {
      authenticated: true,
      id: 'macro|user@example.com',
    });
    publishRefreshOutcome('rejected');
    expect(sessionStatus()).toBe('expired');
  });

  it('recovers when a fresh user-info fetch confirms the session', async () => {
    queryClient.setQueryData(authKeys.userInfo.queryKey, {
      authenticated: true,
      id: 'macro|user@example.com',
    });
    publishRefreshOutcome('rejected');

    await queryClient.fetchQuery({
      queryKey: authKeys.userInfo.queryKey,
      queryFn: async () => ({
        authenticated: true,
        id: 'macro|user@example.com',
      }),
      staleTime: 0,
    });
    expect(sessionStatus()).toBe('signed-in');
  });

  it('settles when user-info fails with other queries mounted', async () => {
    const userInfo = vi.fn(async (): Promise<{ authenticated: boolean }> => {
      throw new Error('400');
    });
    const other = vi.fn(async () => 'public');
    let renders = 0;
    function View() {
      useQuery(() => ({
        queryKey: authKeys.userInfo.queryKey,
        queryFn: userInfo,
        retry: false,
        meta: establishesSession,
      }));
      const doc = useQuery(() => ({
        queryKey: ['public-doc'],
        queryFn: other,
      }));
      return <>{(renders++, doc.status)}</>;
    }
    render(() => (
      <QueryClientProvider client={queryClient}>
        <View />
        <View />
      </QueryClientProvider>
    ));

    await waitFor(() => expect(userInfo).toHaveBeenCalledOnce());
    await waitFor(() => expect(other).toHaveBeenCalledOnce());
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(renders).toBeLessThan(10);
  });
});
