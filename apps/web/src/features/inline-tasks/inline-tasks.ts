import { useFeatureFlag } from '@app/lib/analytics/posthog';
import type { TaskMentionExperience } from '@core/component/LexicalMarkdown/context/taskMentionExperience';
import { ActionCategory, type Action } from '@core/component/LexicalMarkdown/plugins/actions/types';
import { enableInlineTasks } from '@core/constant/featureFlags';
import CheckSquare from '@phosphor/check-square.svg';
import { SKIP_DOM_SELECTION_TAG } from 'lexical';
import { type Component, type ComponentProps, untrack } from 'solid-js';
import { INSERT_INLINE_TASK_DRAFT_COMMAND } from './primitives/task-draft-plugin';
import { InlineTaskDraft } from './views/task-drafts';
import {
  InlineTaskMentionPreview,
  InlineTaskMentionStatic,
  InlineTaskMentionTrigger,
} from './views/task-mention';

type TaskEditorExperience =
  | {
      readonly kind: 'standard';
      readonly mention?: never;
      readonly additionalActions: [];
      readonly Extensions?: never;
    }
  | {
      readonly kind: 'inline';
      readonly mention: TaskMentionExperience;
      readonly additionalActions: Action[];
      readonly Extensions: Component<ComponentProps<typeof InlineTaskDraft>>;
    };

const standardTaskExperience: TaskEditorExperience = {
  kind: 'standard',
  additionalActions: [],
};

const inlineTaskExperience: TaskEditorExperience = {
  kind: 'inline',
  mention: {
    Preview: InlineTaskMentionPreview,
    Static: InlineTaskMentionStatic,
    Trigger: InlineTaskMentionTrigger,
    triggerClass: 'inline-block w-fit max-w-full align-baseline',
    triggerTabIndex: -1,
    nameUpdateTag: SKIP_DOM_SELECTION_TAG,
  },
  additionalActions: [{
    id: 'task',
    name: 'Task',
    keywords: ['task', 'todo', 'create'],
    category: ActionCategory.ELEMENT,
    icon: CheckSquare,
    action: (editor) => {
      editor.dispatchCommand(INSERT_INLINE_TASK_DRAFT_COMMAND, undefined);
    },
  }],
  Extensions: InlineTaskDraft,
};

/**
 * Select once under the editor's Solid owner.
 * Pending flags use standard behavior for this editor. Fresh flags apply to the
 * next editor, never by unmounting a live draft or pending task creation.
 */
export function createTaskEditorExperience(eligible: boolean): TaskEditorExperience {
  if (!eligible) return standardTaskExperience;
  const flag = useFeatureFlag(enableInlineTasks);
  const snapshot = untrack(flag);
  return !snapshot.loading && snapshot.enabled
    ? inlineTaskExperience
    : standardTaskExperience;
}
