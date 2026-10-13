import { useUserId } from '@core/context/user';
import { usePromptDismissalsQuery } from '@queries/prompt-dismissals';
import { cn } from '@ui';
import { type JSX, Show } from 'solid-js';
import type { PromotionLogo } from './components/logo-stack';
import { type PromoAction, PromoCard } from './components/promo-card';
import {
  hidePromotion,
  isPromotionHiddenLocally,
} from './primitives/promotion';

export type { PromotionLogo } from './components/logo-stack';
export type { PromoAction } from './components/promo-card';

/**
 * A view sidebar's dismissible prompt card. Dismissal is stored on the
 * server under `id`, so it holds on every device; hosts gate rollout and
 * supply the actions.
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
  const dismissals = usePromptDismissalsQuery();
  // Wait for the server's answer so a card dismissed elsewhere never flashes.
  // If it is unreachable, fall back to what this browser remembers.
  const hidden = () => {
    if (isPromotionHiddenLocally(userId(), props.id)) return true;
    if (dismissals.isError) return false;
    if (!dismissals.isSuccess) return true;
    return dismissals.data.dismissed.includes(props.id);
  };
  return (
    <Show when={!props.satisfied && !hidden()}>
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
