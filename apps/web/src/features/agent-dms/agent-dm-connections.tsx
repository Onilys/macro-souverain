import { createConnectorContinuation } from '@app/features/block-agent/primitives/create-connector-continuation';
import { toast } from '@core/component/Toast/Toast';
import { useUserId } from '@core/context/user';
import { AppConnectionContext } from '@core/pipedream/connection-context';
import {
  newMessageId,
  useSendMessageMutation,
} from '@queries/messages/mutations';
import { connectPipedreamApp } from '@queries/pipedream-connectors';
import type { ParentProps } from 'solid-js';

/** What the person tells the agent once the app is connected. */
export function connectedMessage(name: string): string {
  return `I connected ${name}. Continue my previous request using the newly available tools.`;
}

/**
 * In a DM with an agent, a button to connect an app connects it in place
 * and then tells the agent, in the conversation, the way the person would
 * have - so the agent carries on where it stopped without them leaving the
 * DM. Anywhere else the button opens the connection settings as before.
 *
 * Always mounted: whether the channel is an agent DM is known only once it
 * loads, and switching a provider in then would remount the conversation.
 */
export function AgentDmConnections(
  props: ParentProps<{ channelId: string; agentDm: boolean }>
) {
  const userId = useUserId();
  const send = useSendMessageMutation();
  const continuation = createConnectorContinuation({
    disabled: () => !props.agentDm || !userId(),
    // A DM has one conversation: whatever was said meanwhile, the agent is
    // still waiting on the connection it asked for.
    revision: () => props.channelId,
    connect: connectPipedreamApp,
    resume: async (name) => {
      const senderId = userId();
      if (!senderId) throw new Error('Signed out');
      await send.mutateAsync({
        parent: { type: 'channel', id: props.channelId },
        senderId,
        optimisticId: newMessageId(),
        message: { content: connectedMessage(name) },
      });
    },
    notify: (message) => toast.alert(message),
  });
  return (
    <AppConnectionContext.Provider
      value={{ ...continuation, enabled: () => props.agentDm }}
    >
      {props.children}
    </AppConnectionContext.Provider>
  );
}
