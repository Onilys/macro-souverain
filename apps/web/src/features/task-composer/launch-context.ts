import { globalSplitManager } from '@app/signal/splitLayout';
import {
  enableCrmActivity,
  isFeatureEnabled,
} from '@core/constant/featureFlags';
import {
  CRM_TASK_COMPOSER_RECORD_KEY,
  type CrmTaskRecord,
  crmTaskComposerContext,
  readCrmTaskComposerRecord,
} from '../crm/task-composer';
import type { TaskComposerContext } from './core/context';

/** Snapshot the originating view before the composer acquires focus. */
export async function focusedTaskComposerContext(): Promise<
  TaskComposerContext | undefined
> {
  if (!isFeatureEnabled(enableCrmActivity)) return;
  const split = globalSplitManager()?.activeSplit();
  if (!split) return;
  const content = split.content();
  const { type, id } = content;
  let record: CrmTaskRecord | undefined;
  if (type === 'component' && id === 'companies') {
    split.captureEntryState();
    record = readCrmTaskComposerRecord(
      split.currentEntryState()?.[CRM_TASK_COMPOSER_RECORD_KEY]
    );
  } else if (type === 'company' || type === 'contact') {
    record = { type, id };
  } else {
    return;
  }
  if (record?.type === 'contact') {
    const { contactTaskComposerContext } = await import('../crm/crm-adapter');
    return contactTaskComposerContext(record.id);
  }
  return crmTaskComposerContext(record);
}
