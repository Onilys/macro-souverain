import {
  Card,
  CardSingle,
} from '@app/features/agent-cards/components/kit/card';
import { Tile } from '@app/features/agent-cards/components/kit/parts';
import { openAgentsPage } from '@app/features/agents-view/primitives/open-page';
import { useSplitLayout } from '@components/app/split-layout/layout';
import { HarnessIcon } from '@core/component/HarnessIcon';
import { useSettingsState } from '@core/constant/SettingsState';
import { useUserId } from '@core/context/user';
import { PipedreamConnectorIcon } from '@core/pipedream/ConnectorIcon';
import { AppConnectionContext } from '@core/pipedream/connection-context';
import { requestConnectApp } from '@core/pipedream/pendingConnect';
import type { ConnectAppDecoratorProps } from '@macro-inc/lexical-core';
import ArrowUpRightIcon from '@phosphor/arrow-up-right.svg';
import CheckIcon from '@phosphor/check.svg';
import { useHarnessConnectionStatus } from '@queries/harnesses/connections';
import { usePipedreamConnectedSlugs } from '@queries/pipedream-connectors';
import { Button } from '@ui';
import { cn } from '@ui/utils/classname';
import {
  $getNodeByKey,
  $isLineBreakNode,
  $isParagraphNode,
  $isTextNode,
} from 'lexical';
import { type Accessor, type JSX, Show, useContext } from 'solid-js';
import { match } from 'ts-pattern';
import { LexicalWrapperContext } from '../../context/LexicalWrapperContext';

/**
 * The button a reply renders when the reader has to connect something
 * before the agent can continue: a Pipedream app or an agent harness
 * account. Inside a sentence it is a chip; on a line of its own - the agent
 * blocked on it - it is a card. Clicking it connects in place where the
 * surface can (an agent session, a DM with an agent), and otherwise opens
 * the settings surface that connects it. Once the reader has connected it,
 * it reads as connected rather than nagging.
 */
export function ConnectApp(props: ConnectAppDecoratorProps) {
  return match(props.target)
    .with('connections', () => <ConnectPipedreamApp {...props} />)
    .with('harness', () => <ConnectHarness {...props} />)
    .exhaustive();
}

function ConnectPipedreamApp(props: ConnectAppDecoratorProps) {
  const context = useContext(AppConnectionContext);
  const inChat = () => (context?.enabled?.() === false ? undefined : context);
  const layout = useSplitLayout();
  const connections = usePipedreamConnectedSlugs();
  return (
    <ConnectChip
      {...props}
      connected={() =>
        connections.ready() && connections.slugs().has(props.appSlug)
      }
      icon={(size) => (
        <PipedreamConnectorIcon appSlug={props.appSlug} class={size} />
      )}
      disabled={() => inChat()?.disabled() ?? false}
      onConnect={() => {
        const inPlace = inChat();
        if (inPlace) {
          void inPlace.connect({ appSlug: props.appSlug, name: props.name });
          return;
        }
        // Connections picks this up and starts the Connect flow.
        requestConnectApp(props.appSlug);
        openAgentsPage(layout, 'connections');
      }}
    />
  );
}

function ConnectHarness(props: ConnectAppDecoratorProps) {
  const { openSettings } = useSettingsState();
  const connected = useHarnessConnectionStatus(
    () => props.appSlug,
    useUserId()
  );
  return (
    <ConnectChip
      {...props}
      connected={connected}
      icon={(size) => <HarnessIcon harness={props.appSlug} class={size} />}
      onConnect={() => openSettings('Harness')}
    />
  );
}

type ConnectButtonProps = ConnectAppDecoratorProps & {
  connected: Accessor<boolean>;
  /** The app's icon at a size class: small in a chip, larger on a card. */
  icon: (size: string) => JSX.Element;
  onConnect: () => void;
  disabled?: Accessor<boolean>;
};

/**
 * The connect button on a line of its own, as a card: what to connect and
 * why, and Connect - or, once it is, that it is connected.
 */
export function ConnectCard(
  props: Pick<ConnectButtonProps, 'appSlug' | 'name' | 'connected' | 'icon'> &
    Partial<Pick<ConnectButtonProps, 'disabled'>> & { onConnect: () => void }
) {
  return (
    <span class="my-1 flex w-full max-w-md" data-connect-app={props.appSlug}>
      <Card width="compact" data-agent-card="connect" muted={props.connected()}>
        <CardSingle
          tile={<Tile>{props.icon('size-5')}</Tile>}
          title={
            props.connected()
              ? `${props.name} connected`
              : `Connect ${props.name}`
          }
          meta={
            props.connected()
              ? 'The agent can use it now'
              : 'Needed to continue'
          }
          trailing={
            <Show
              when={!props.connected()}
              fallback={
                <CheckIcon
                  class="size-4 flex-none text-success-ink"
                  aria-hidden="true"
                />
              }
            >
              <Button
                size="sm"
                variant="cta"
                disabled={props.disabled?.()}
                onMouseDown={(event: MouseEvent) => event.preventDefault()}
                onClick={() => props.onConnect()}
              >
                Connect
              </Button>
            </Show>
          }
        />
      </Card>
    </span>
  );
}

function ConnectChip(props: ConnectButtonProps) {
  const lexicalWrapper = useContext(LexicalWrapperContext);
  const selection = () => lexicalWrapper?.selection;
  // On a line of its own, the button is what the reply is waiting on.
  const alone = (() => {
    const editor = lexicalWrapper?.editor;
    if (!editor) return false;
    return editor.getEditorState().read(() => {
      const node = $getNodeByKey(props.key);
      const parent = node?.getParent();
      if (!node || !parent || !$isParagraphNode(parent)) return false;
      return parent
        .getChildren()
        .every(
          (child) =>
            child.is(node) ||
            $isLineBreakNode(child) ||
            ($isTextNode(child) && !child.getTextContent().trim())
        );
    });
  })();
  if (alone) return <ConnectCard {...props} />;

  const isSelectedAsNode = () => {
    const sel = selection();
    if (!sel) return false;
    return sel.type === 'node' && sel.nodeKeys.has(props.key);
  };

  const handleClick = () => {
    if (props.connected()) return;
    props.onConnect();
  };

  return (
    <button
      type="button"
      disabled={props.disabled?.()}
      data-connect-app={props.appSlug}
      data-connect-target={props.target}
      aria-label={
        props.connected() ? `${props.name} connected` : `Connect ${props.name}`
      }
      class={cn(
        'pointer-events-auto inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 align-middle text-xs font-medium',
        'cursor-default outline-none transition-colors',
        props.connected()
          ? 'border-edge-muted text-ink-muted'
          : 'border-accent/40 text-accent hover:bg-accent/10 focus-visible:bg-accent/10',
        isSelectedAsNode() && 'bg-active'
      )}
      // Keep the editor's selection where it was: this is an action, not a
      // caret target.
      onMouseDown={(event) => event.preventDefault()}
      onClick={handleClick}
    >
      {props.icon('size-3.5')}
      <Show when={props.connected()} fallback={<>Connect {props.name}</>}>
        {props.name} connected
      </Show>
      <Show when={!props.connected()}>
        <ArrowUpRightIcon class="size-3 opacity-70" />
      </Show>
    </button>
  );
}
