import { createUserScopedStorage } from '@core/util/userScopedStorage';
import { createSignal } from 'solid-js';
import type { ImportCategory } from '../core/providers';

// Keep every mounted card in sync, including when local storage is unavailable.
const [hiddenScopes, setHiddenScopes] = createSignal<ReadonlySet<string>>(
  new Set()
);

function storage(category: ImportCategory) {
  return createUserScopedStorage(`connector-import-promotion:v1:${category}`);
}

function scope(userId: string, category: ImportCategory): string {
  return JSON.stringify([userId, category]);
}

export function isImportPromotionHidden(
  userId: string | undefined,
  category: ImportCategory
): boolean {
  if (!userId) return false;
  return (
    hiddenScopes().has(scope(userId, category)) ||
    storage(category).read(userId) === 'hidden'
  );
}

/** Used by both explicit dismissal and a confirmed native import. */
export function hideImportPromotion(
  userId: string | undefined,
  category: ImportCategory
): void {
  if (!userId || isImportPromotionHidden(userId, category)) return;
  storage(category).write(userId, 'hidden');
  setHiddenScopes((previous) => new Set(previous).add(scope(userId, category)));
}
