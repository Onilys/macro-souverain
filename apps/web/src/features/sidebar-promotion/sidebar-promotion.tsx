import { useUserId } from '@core/context/user';
import { cn } from '@ui';
import { type JSX, Show } from 'solid-js';
import type { PromotionLogo } from './components/logo-stack';
import { type PromoAction, PromoCard } from './components/promo-card';
import { hidePromotion, isPromotionHidden } from './primitives/promotion';

export type { PromotionLogo } from './components/logo-stack';
export type { PromoAction } from './components/promo-card';

/**
 * A view sidebar's dismissible prompt card. Dismissal is remembered per user
 * in this browser under `id`; hosts gate rollout and supply the actions.
 */
export function SidebarPromotion(props: {
  id: string;
  logos: readonly PromotionLogo[];
  headline: string;
  pitch: string;
  action: PromoAction;
  secondaryAction?: PromoAction;
  /** Defaults to "Dismiss <action label>". */
  dismissLabel?: string;
  /** Hides the card without dismissing it, e.g. once its goal is met. */
  satisfied?: boolean;
  class?: string;
}): JSX.Element {
  const userId = useUserId();
  return (
    <Show when={!props.satisfied && !isPromotionHidden(userId(), props.id)}>
      <div class={cn('shrink-0', props.class)}>
        <PromoCard
          logos={props.logos}
          headline={props.headline}
          pitch={props.pitch}
          action={props.action}
          secondaryAction={props.secondaryAction}
          dismissLabel={
            props.dismissLabel ?? `Dismiss ${props.action.label.toLowerCase()}`
          }
          onDismiss={() => hidePromotion(userId(), props.id)}
        />
      </div>
    </Show>
  );
}
