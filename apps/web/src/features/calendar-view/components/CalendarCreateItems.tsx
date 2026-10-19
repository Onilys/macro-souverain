import { CreateMenuItem } from '@app/components/view-shell/CreateMenuItem';
import { useQuickCallsFlag } from '@app/features/meetings/use-quick-calls-flag';
import { ShowFeatureFlag } from '@app/lib/analytics/posthog';
import { enableCalendarScheduling } from '@core/constant/featureFlags';
import CalendarIcon from '@icon/system/regular/calendar-blank.svg';
import LinkIcon from '@icon/system/regular/link.svg';
import PhoneIcon from '@icon/system/regular/phone.svg';
import { useNavigate } from '@solidjs/router';
import { Show } from 'solid-js';
import { useOpenEventComposer } from './use-open-event-composer';

type CreateItemProps = { onSelect?: () => void };

export function CalendarCreateEventItem(props: CreateItemProps) {
  const openEventComposer = useOpenEventComposer();

  return (
    <CreateMenuItem
      icon={CalendarIcon}
      title="Event"
      description="Schedule a meeting or block time on your calendar."
      closeOnSelect
      onSelect={() => {
        props.onSelect?.();
        void openEventComposer();
      }}
    />
  );
}

export function CalendarCreateCallItem(props: CreateItemProps) {
  const quickCalls = useQuickCallsFlag();
  const navigate = useNavigate();

  return (
    <Show when={quickCalls().enabled}>
      <CreateMenuItem
        icon={PhoneIcon}
        title="Call"
        description="Start a live call now and invite others to join."
        closeOnSelect
        onSelect={() => {
          props.onSelect?.();
          navigate('/meet/new');
        }}
      />
    </Show>
  );
}

export function CalendarCreateBookingLinkItem(props: CreateItemProps) {
  const navigate = useNavigate();

  return (
    <ShowFeatureFlag flag={enableCalendarScheduling}>
      <CreateMenuItem
        icon={LinkIcon}
        title="Booking link"
        description="Share your availability so others can book a time with you."
        closeOnSelect
        onSelect={() => {
          props.onSelect?.();
          navigate('/app/scheduling?s0.scheduling.createBookingLink=true');
        }}
      />
    </ShowFeatureFlag>
  );
}
