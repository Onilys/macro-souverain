import { MentionTooltip } from '@core/component/LexicalMarkdown/component/decorator/MentionTooltip';
import type {
  TaskMentionPreviewProps,
  TaskMentionStaticProps,
  TaskMentionTriggerProps,
} from '@core/component/LexicalMarkdown/context/taskMentionExperience';
import { autoRegister } from '@core/component/LexicalMarkdown/plugins';
import { matches } from '@core/util/match';
import { useNativeSplitNavigationHandler } from '@core/util/useSplitNavigationHandler';
import EyeSlashDuo from '@phosphor/eye-slash.svg';
import TrashSimple from '@phosphor/trash-simple.svg';
import { isAccessiblePreviewItem, type PreviewItemNoAccess } from '@queries/preview';
import {
  COMMAND_PRIORITY_CRITICAL,
  COMMAND_PRIORITY_HIGH,
  KEY_ARROW_LEFT_COMMAND,
  KEY_ARROW_RIGHT_COMMAND,
  KEY_ENTER_COMMAND,
} from 'lexical';
import { createMemo, type JSX, Match, Show, Suspense, Switch } from 'solid-js';
import { TaskMentionContent } from '../components/task-mention-content';
import { focusAdjacentTask, isPlainArrow } from '../primitives/task-navigation';
import { InlineTaskProperties } from './task-properties';
import { InlineTaskStatus, InlineTaskStatusFallback } from './task-status';
import { InlineTaskTitle } from './task-title';

function FallbackTaskTitle(props: {
  documentId: string;
  documentName?: string;
  accessories: JSX.Element;
  dimmed?: boolean;
}) {
  return (
    <span
      data-document-mention="true"
      data-document-id={props.documentId}
      data-block-name="task"
      data-document-name={props.documentName}
      classList={{ 'opacity-50': props.dimmed }}
    >
      {props.documentName?.trim()
        ? props.documentName.replaceAll('\n', ' ').trim()
        : 'Task name…'}
      {props.accessories}
    </span>
  );
}

/** Preview state comes from the shared shell; only the inline UI mounts here. */
export function InlineTaskMentionPreview(props: TaskMentionPreviewProps) {
  const { item, documentProperties } = props.previewData;
  const showRecentFallback = createMemo(() => {
    const current = item();
    return !current.loading && current.access === 'does_not_exist' &&
      props.isRecentMention() && !!props.documentName;
  });

  return (
    <Switch>
      <Match when={item().loading}>
        <TaskMentionContent
          icon={<InlineTaskStatusFallback />}
          collapsed={props.collapsed}
          text={
            <FallbackTaskTitle
              documentId={props.documentId}
              documentName={props.documentName}
              accessories={props.accessories}
              dimmed
            />
          }
        />
      </Match>
      <Match when={showRecentFallback()}>
        <TaskMentionContent
          icon={<InlineTaskStatusFallback />}
          collapsed={props.collapsed}
          text={
            <FallbackTaskTitle
              documentId={props.documentId}
              documentName={props.documentName}
              accessories={props.accessories}
            />
          }
        />
      </Match>
      <Match when={matches(item(), isAccessiblePreviewItem)}>
        {(accessibleItem) => (
          <TaskMentionContent
            icon={
              <InlineTaskStatus
                taskId={accessibleItem().id}
                previewProperties={documentProperties()}
              />
            }
            collapsed={props.collapsed}
            text={
              <>
                <InlineTaskTitle
                  taskId={accessibleItem().id}
                  name={accessibleItem().name}
                  previewProperties={documentProperties()}
                  editor={props.editor}
                  nodeKey={props.nodeKey}
                />
                {props.accessories}
                <Suspense>
                  <InlineTaskProperties
                    taskId={accessibleItem().id}
                    previewProperties={documentProperties()}
                  />
                </Suspense>
              </>
            }
          />
        )}
      </Match>
      <Match when={(item() as PreviewItemNoAccess).access === 'no_access'}>
        <TaskMentionContent icon={<EyeSlashDuo />} text="No Access" />
      </Match>
      <Match when={(item() as PreviewItemNoAccess).access === 'does_not_exist'}>
        <TaskMentionContent icon={<TrashSimple />} text="Deleted" />
      </Match>
    </Switch>
  );
}

/** Static fallback never initializes task queries or edit controls. */
export function InlineTaskMentionStatic(props: TaskMentionStaticProps) {
  return (
    <TaskMentionContent
      icon={<InlineTaskStatusFallback />}
      collapsed={props.collapsed}
      text={
        <FallbackTaskTitle
          documentId={props.documentId}
          documentName={props.documentName}
          accessories={props.accessories}
        />
      }
    />
  );
}

/** Mouse and task-specific keyboard behavior live with the inline renderer. */
export function InlineTaskMentionTrigger(props: TaskMentionTriggerProps) {
  const editor = props.editor;
  if (editor) {
    for (const [command, direction] of [
      [KEY_ARROW_LEFT_COMMAND, 'previous'],
      [KEY_ARROW_RIGHT_COMMAND, 'next'],
    ] as const) {
      autoRegister(editor.registerCommand(command, (event) => {
        if (!event || !isPlainArrow(event) ||
            !focusAdjacentTask(editor, direction, props.nodeKey)) return false;
        event.preventDefault();
        return true;
      }, COMMAND_PRIORITY_CRITICAL));
    }
    autoRegister(editor.registerCommand(KEY_ENTER_COMMAND, (event) => {
      if (!props.selected()) return false;
      const title = editor.getElementByKey(props.nodeKey)?.querySelector<HTMLElement>(
        '[data-inline-task-title][tabindex="0"]'
      );
      if (title) {
        event?.preventDefault();
        title.focus();
      } else {
        props.onOpen(event);
      }
      return true;
    }, COMMAND_PRIORITY_HIGH));
  }

  const isTitleTarget = (target: EventTarget | null) =>
    target instanceof Element && !!target.closest('[data-inline-task-title]');
  const navigation = useNativeSplitNavigationHandler<HTMLSpanElement>((event) => {
    if (isTitleTarget(event.target)) event.stopPropagation();
    // Task navigation stays in the shared hover card, not on title click.
  });
  const onMouseDown: JSX.EventHandler<HTMLSpanElement, MouseEvent> = (event) => {
    if (isTitleTarget(event.target)) navigation['on:mousedown'](event);
  };

  return (
    <span class="relative inline">
      <span
        class="inline cursor-default rounded-xs"
        classList={{ 'bg-active text-ink': props.selected() }}
        style={{ 'user-select': 'inherit' }}
        on:mousedown={onMouseDown}
        on:click={navigation['on:click']}
      >
        {props.children}
      </span>
      <MentionTooltip show={props.selected()} text="Open" />
    </span>
  );
}
