import { createUserScopedStorage } from '@core/util/userScopedStorage';
import { createSignal } from 'solid-js';

// Keep every mounted card in sync, including when local storage is unavailable.
const [hiddenScopes, setHiddenScopes] = createSignal<ReadonlySet<string>>(
  new Set()
);

function storage(id: string) {
  return createUserScopedStorage(
    `sidebar-promotion:v1:${encodeURIComponent(id)}`
  );
}

function scope(userId: string, id: string): string {
  return JSON.stringify([userId, id]);
}

export function isPromotionHidden(
  userId: string | undefined,
  id: string
): boolean {
  if (!userId) return false;
  return (
    hiddenScopes().has(scope(userId, id)) ||
    storage(id).read(userId) === 'hidden'
  );
}

/** Used by explicit dismissal and by hosts once the prompt is fulfilled. */
export function hidePromotion(userId: string | undefined, id: string): void {
  if (!userId || isPromotionHidden(userId, id)) return;
  storage(id).write(userId, 'hidden');
  setHiddenScopes((previous) => new Set(previous).add(scope(userId, id)));
}
