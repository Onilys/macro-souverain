import { useViewTabHotkeys } from '@app/components/view-shell';
import { EMAIL_INBOX_TAB_IDS } from './constants';
import type { EmailTab } from './types';

/** Cycle the primary mail views without stealing editing or overlay focus. */
export function useEmailInboxHotkeys(options: {
  scopeId: string;
  enabled: () => boolean;
  activeId: () => EmailTab;
  setActiveId: (tab: EmailTab) => void;
}) {
  useViewTabHotkeys({
    ...options,
    ids: () => EMAIL_INBOX_TAB_IDS,
    shouldHandleSequentialKeyEvent: (event) => {
      if (!event) return true;
      const target = event.target;
      return (
        target instanceof Element &&
        !!target.closest('[role="grid"][aria-label="Email"]') &&
        !target.closest(
          'button, a[href], [role="button"], input, textarea, select, [contenteditable="true"], [role="dialog"], [role="menu"], [data-view-sidebar]'
        )
      );
    },
  });
}
