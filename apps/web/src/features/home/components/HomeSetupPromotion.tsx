import { HOME_SETUP_PROMOTION as COPY } from '@app/features/sidebar-promotion/core/promotions';
import { SidebarPromotion } from '@app/features/sidebar-promotion/sidebar-promotion';
import { useFeatureFlag } from '@app/lib/analytics/posthog';
import { enableSidebarPromotions } from '@core/constant/featureFlags';
import { useSettingsState } from '@core/constant/SettingsState';
import { Show } from 'solid-js';

/** Home's prompt to connect tools (Settings → Connections) and invite teammates (Settings → Team). */
export function HomeSetupPromotion(props: { class?: string }) {
  const promotions = useFeatureFlag(enableSidebarPromotions);
  const { openSettings } = useSettingsState();
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
        secondaryAction={{
          label: COPY.secondaryAction,
          onClick: () => openSettings('Team'),
        }}
      />
    </Show>
  );
}
