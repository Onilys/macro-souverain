import { hasLoginCookie } from '@core/util/cookies';
import { createSignal } from 'solid-js';

const [shouldQueryUserInfo, setShouldQueryUserInfo] = createSignal(
  hasLoginCookie()
);

export { shouldQueryUserInfo };

export function enableUserInfoQuery() {
  setShouldQueryUserInfo(true);
}

// A login popup or sibling tab updates the shared login marker. It is only a
// hint to check identity, never proof that account services may start.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', () => {
    if (hasLoginCookie()) enableUserInfoQuery();
  });
}
