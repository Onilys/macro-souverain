import { useCalendarAccounts } from '@app/features/calendar/hooks/use-calendar-accounts';
import { CALENDAR_ACCOUNTS_PROMOTION as COPY } from '@app/features/sidebar-promotion/core/promotions';
import { SidebarPromotion } from '@app/features/sidebar-promotion/sidebar-promotion';
import { useFeatureFlag } from '@app/lib/analytics/posthog';
import {
  enableMultiInbox,
  enableSidebarPromotions,
} from '@core/constant/featureFlags';
import { useAddInboxFlow } from '@core/email-link';
import { Show, Suspense } from 'solid-js';

/** Accounts with calendar access at which the prompt has done its job. */
const ENOUGH_CALENDAR_ACCOUNTS = 2;

/**
 * The Calendar sidebar's prompt to connect another Google account. Adding
 * accounts follows the multi-inbox flag, like "Connect another account" in
 * the calendar settings menu.
 */
export function ConnectCalendarsPromotion(props: { class?: string }) {
  const promotions = useFeatureFlag(enableSidebarPromotions);
  const multiInbox = useFeatureFlag(enableMultiInbox);
  return (
    <Show when={promotions().enabled && multiInbox().enabled}>
      <Suspense>
        <ConnectCalendarsCard class={props.class} />
      </Suspense>
    </Show>
  );
}

function ConnectCalendarsCard(props: { class?: string }) {
  const accounts = useCalendarAccounts();
  const startAddInbox = useAddInboxFlow();
  const calendarAccounts = () =>
    accounts().filter((account) => account.action === 'turnOff').length;
  return (
    <SidebarPromotion
      id={COPY.id}
      logos={COPY.logos}
      headline={COPY.headline}
      pitch={COPY.pitch}
      satisfied={calendarAccounts() >= ENOUGH_CALENDAR_ACCOUNTS}
      class={props.class}
      action={{
        label: COPY.action,
        // A brand-new account needs the mailbox scopes alongside calendar.
        onClick: () => void startAddInbox({ scopes: 'gmail_and_calendar' }),
      }}
    />
  );
}
