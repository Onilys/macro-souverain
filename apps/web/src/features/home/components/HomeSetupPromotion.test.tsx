import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HomeSetupPromotion } from './HomeSetupPromotion';

const host = vi.hoisted(() => ({
  team: null as null | { team: { allow_non_admin_invites?: boolean } },
  admin: false,
  openSettings: vi.fn(),
}));
vi.mock('@core/context/user', () => ({ useUserId: () => () => 'user' }));
vi.mock('@app/lib/analytics/posthog', () => ({
  useFeatureFlag: () => () => ({ enabled: true }),
}));
vi.mock('@queries/prompt-dismissals', () => ({
  usePromptDismissalsQuery: () => ({
    isSuccess: true,
    isError: false,
    data: { dismissed: [] },
  }),
  dismissPromptEverywhere: vi.fn(),
}));
vi.mock('@core/constant/SettingsState', () => ({
  useSettingsState: () => ({ openSettings: host.openSettings }),
}));
vi.mock('@queries/gate', () => ({ queryReadyGate: () => true }));
vi.mock('@queries/team/teams', () => ({
  useCurrentTeamQuery: () => ({
    isSuccess: true,
    get data() {
      return host.team;
    },
  }),
  useIsTeamAdmin: () => () => host.admin,
}));

afterEach(() => {
  cleanup();
  host.team = null;
  host.admin = false;
  host.openSettings.mockReset();
});

describe('HomeSetupPromotion', () => {
  it('opens Connections and Team settings', () => {
    render(() => <HomeSetupPromotion />);
    fireEvent.click(screen.getByRole('button', { name: 'Connect tools' }));
    fireEvent.click(screen.getByRole('button', { name: 'Invite team' }));
    expect(host.openSettings.mock.calls).toEqual([['Connections'], ['Team']]);
  });

  it('hides invites from members of a team that limits them to admins', () => {
    host.team = { team: { allow_non_admin_invites: false } };
    render(() => <HomeSetupPromotion />);
    expect(screen.getByRole('button', { name: 'Connect tools' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Invite team' })).toBeNull();
  });

  it('keeps invites for admins of such a team', () => {
    host.team = { team: { allow_non_admin_invites: false } };
    host.admin = true;
    render(() => <HomeSetupPromotion />);
    expect(screen.getByRole('button', { name: 'Invite team' })).toBeTruthy();
  });
});
