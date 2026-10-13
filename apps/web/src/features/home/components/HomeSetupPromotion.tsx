import { HOME_SETUP_PROMOTION as COPY } from '@app/features/sidebar-promotion/core/promotions';
import { SidebarPromotion } from '@app/features/sidebar-promotion/sidebar-promotion';
import { useFeatureFlag } from '@app/lib/analytics/posthog';
import { enableSidebarPromotions } from '@core/constant/featureFlags';
import { useSettingsState } from '@core/constant/SettingsState';
import { queryReadyGate } from '@queries/gate';
import { useCurrentTeamQuery, useIsTeamAdmin } from '@queries/team/teams';
import { Show } from 'solid-js';

/** Home's prompt to connect tools (Settings → Connections) and invite teammates (Settings → Team). */
export function HomeSetupPromotion(props: { class?: string }) {
  const promotions = useFeatureFlag(enableSidebarPromotions);
  const { openSettings } = useSettingsState();
  const team = useCurrentTeamQuery(() => promotions().enabled);
  const isAdmin = useIsTeamAdmin();
  // Settings → Team can invite (or create a team with invites) unless the
  // user is a member of a team that limits invites to admins.
  const canInvite = () => {
    if (!queryReadyGate(team)) return false;
    const current = team.data?.team;
    return !current || isAdmin() || current.allow_non_admin_invites !== false;
  };
  return (
    <Show when={promotions().enabled}>
      <SidebarPromotion
        id={COPY.id}
        logos={COPY.logos}
        headline={COPY.headline}
        pitch={COPY.pitch}
        class={props.class}
        dismissLabel="Dismiss workspace setup"
        action={{
          label: COPY.action,
          onClick: () => openSettings('Connections'),
        }}
        secondaryAction={
          canInvite()
            ? {
                label: COPY.secondaryAction,
                onClick: () => openSettings('Team'),
              }
            : undefined
        }
      />
    </Show>
  );
}
