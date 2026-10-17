import { publishRefreshOutcome } from '@core/auth/refresh-outcome';
import { sessionStatus } from '@core/auth/session';
import { afterEach, describe, expect, it } from 'vitest';
import { authKeys } from './auth/keys';
import { queryClient } from './client';

afterEach(() => {
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
});
