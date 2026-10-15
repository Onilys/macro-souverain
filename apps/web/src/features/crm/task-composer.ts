import { SYSTEM_PROPERTY_IDS } from '@property/identifiers';
import type { PropertyApiValues } from '@property/types';
import type { TaskComposerContext } from '../task-composer/core/context';
import type { CrmRecordTarget } from './core/record';

export const CRM_TASK_COMPOSER_RECORD_KEY = 'crm.task-composer-record';

/** Read only a record identity from captured workspace state. */
export function readCrmTaskComposerRecord(
  value: unknown
): CrmRecordTarget | undefined {
  if (typeof value !== 'object' || value === null) return;
  if (!('type' in value) || !('id' in value)) return;
  if (value.type !== 'company' && value.type !== 'contact') return;
  if (typeof value.id !== 'string' || !value.id) return;
  return { type: value.type, id: value.id };
}

export type CrmTaskRecord =
  | { type: 'company'; id: string }
  | { type: 'contact'; id: string; companyId?: string };

const reference = (
  entityId: string,
  entityType: 'COMPANY' | 'CONTACT'
): PropertyApiValues => ({
  valueType: 'ENTITY',
  refs: [{ entity_id: entityId, entity_type: entityType }],
});

/** CRM owns its composer preset; the shared composer has no CRM-specific behavior. */
export function crmTaskComposerContext(
  record?: CrmTaskRecord
): TaskComposerContext {
  const initialPropertyValues: Record<string, PropertyApiValues> = {};
  if (record?.type === 'company') {
    initialPropertyValues[SYSTEM_PROPERTY_IDS.COMPANIES] = reference(
      record.id,
      'COMPANY'
    );
  } else if (record?.type === 'contact') {
    initialPropertyValues[SYSTEM_PROPERTY_IDS.CONTACTS] = reference(
      record.id,
      'CONTACT'
    );
    if (record.companyId) {
      initialPropertyValues[SYSTEM_PROPERTY_IDS.COMPANIES] = reference(
        record.companyId,
        'COMPANY'
      );
    }
  }
  return {
    key: record ? `crm:${record.type}:${record.id}` : 'crm',
    visiblePropertyIds: [
      SYSTEM_PROPERTY_IDS.COMPANIES,
      SYSTEM_PROPERTY_IDS.CONTACTS,
      SYSTEM_PROPERTY_IDS.ASSIGNEES,
      SYSTEM_PROPERTY_IDS.DUE_DATE,
      SYSTEM_PROPERTY_IDS.PRIORITY,
    ],
    initialPropertyValues,
  };
}
