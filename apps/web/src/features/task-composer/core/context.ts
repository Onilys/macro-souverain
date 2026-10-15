import type { PropertyApiValues } from '@property/types';

/** Host-specific draft identity and starting task properties. */
export type TaskComposerContext = {
  key: string;
  visiblePropertyIds?: string[];
  initialPropertyValues?: Record<string, PropertyApiValues>;
};
