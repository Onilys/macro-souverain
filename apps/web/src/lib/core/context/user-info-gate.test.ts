import { expect, it, vi } from 'vitest';

const hasLoginCookie = vi.hoisted(() => vi.fn(() => false));
vi.mock('@core/util/cookies', () => ({ hasLoginCookie }));

import { shouldQueryUserInfo } from './user-info-gate';

it('wakes an anonymous identity observer when another tab publishes a login marker', () => {
  expect(shouldQueryUserInfo()).toBe(false);
  window.dispatchEvent(new StorageEvent('storage', { key: 'unrelated' }));
  expect(shouldQueryUserInfo()).toBe(false);

  hasLoginCookie.mockReturnValue(true);
  window.dispatchEvent(
    new StorageEvent('storage', {
      key: 'macro:login',
      newValue: 'true',
    })
  );
  expect(shouldQueryUserInfo()).toBe(true);
});
