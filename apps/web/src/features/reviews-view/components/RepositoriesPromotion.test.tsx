import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RepositoriesPromotion } from './RepositoriesPromotion';

const host = vi.hoisted(() => ({
  status: 'linked' as string,
  authorize: vi.fn(async () => false),
}));
vi.mock('@core/context/user', () => ({ useUserId: () => () => 'user' }));
vi.mock('@queries/prompt-dismissals', () => ({
  usePromptDismissalsQuery: () => ({
    isSuccess: true,
    isError: false,
    data: { dismissed: [] },
  }),
  dismissPromptEverywhere: vi.fn(),
}));
vi.mock('@app/lib/analytics/posthog', () => ({
  useFeatureFlag: () => () => ({ enabled: true }),
}));
vi.mock('@core/auth/authorize-github', () => ({
  authorizeGithub: host.authorize,
}));
vi.mock('@queries/auth', () => ({
  useGithubLinkStatusQuery: () => ({
    isSuccess: true,
    get data() {
      return { status: host.status };
    },
  }),
  useInitGithubLinkMutation: () => ({ mutateAsync: vi.fn() }),
  useReauthenticateGithubMutation: () => ({ mutateAsync: vi.fn() }),
}));

beforeEach(() => {
  host.authorize.mockClear();
  vi.stubGlobal('open', vi.fn());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('RepositoriesPromotion', () => {
  it('opens the GitHub App install page once GitHub is linked', () => {
    render(() => <RepositoriesPromotion />);
    fireEvent.click(screen.getByRole('button', { name: 'Add repositories' }));
    expect(window.open).toHaveBeenCalledWith(
      expect.stringContaining('/github/install-sync'),
      '_blank',
      'noopener'
    );
  });

  it('links the GitHub account first when none is connected', () => {
    host.status = 'unlinked';
    render(() => <RepositoriesPromotion />);
    fireEvent.click(screen.getByRole('button', { name: 'Connect GitHub' }));
    expect(host.authorize).toHaveBeenCalled();
    expect(window.open).not.toHaveBeenCalled();
    host.status = 'linked';
  });

  it('reconnects an expired GitHub link instead of opening the install page', () => {
    host.status = 'reauthentication_required';
    render(() => <RepositoriesPromotion />);
    fireEvent.click(screen.getByRole('button', { name: 'Reconnect GitHub' }));
    expect(host.authorize).toHaveBeenCalledWith(
      expect.any(Function),
      'Failed to reconnect GitHub'
    );
    expect(window.open).not.toHaveBeenCalled();
    host.status = 'linked';
  });
});
