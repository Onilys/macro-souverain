import { firstPartyBotMark } from '@core/component/firstPartyBotMark';
import { UserIcon } from '@core/component/UserIcon';
import { useBotProfile } from '@queries/bots/profiles';
import { senderFromStorageId } from '@queries/messages/message-sender';
import type { MessageSender } from '@service-storage/messages';
import { cn } from '@ui';
import { Show } from 'solid-js';
import { BotIcon } from './BotIcon';
import { useMessage } from './context';

type SenderIconProps = {
  class?: string;
  hidden?: boolean;
};

function BotSenderIcon(props: { sender: MessageSender }) {
  const profile = useBotProfile(() =>
    props.sender.avatar_url ? '' : props.sender.id
  );
  // Older cached messages can predate the agent's uploaded picture. Resolve
  // missing metadata without suspending the message while the lookup runs.
  const resolvedProfile = () => (profile.isSuccess ? profile.data : undefined);

  return (
    <BotIcon
      name={props.sender.name ?? resolvedProfile()?.name}
      avatarUrl={props.sender.avatar_url || resolvedProfile()?.avatarUrl}
      size="fill"
    />
  );
}

export function SenderIcon(props: SenderIconProps) {
  const message = useMessage();

  // Team bots render their uploaded avatar; first-party bots have none and
  // keep their brand mark, which UserIcon draws the same way the mention menu
  // does.
  const botSender = (): MessageSender | undefined => {
    const sender = message().sender ?? senderFromStorageId(message().sender_id);
    if (sender.type !== 'bot' || firstPartyBotMark(sender.id)) return undefined;
    return sender;
  };

  return (
    <div
      class={cn('shrink-0 size-(--user-icon-width)', props.class, {
        invisible: props.hidden,
      })}
      aria-hidden={props.hidden ? 'true' : undefined}
    >
      {!props.hidden && (
        <Show
          when={botSender()}
          fallback={<UserIcon id={message().sender_id} size="fill" />}
        >
          {(bot) => <BotSenderIcon sender={bot()} />}
        </Show>
      )}
    </div>
  );
}
