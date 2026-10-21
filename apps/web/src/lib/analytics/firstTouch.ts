/**
 * First-touch acquisition source, kept in the browser until signup.
 *
 * The PostHog `sign_up` event is captured server-side (create-user webhook)
 * before the browser identifies, so it carries no campaign or referrer
 * properties. The browser records the first visit that had a source and
 * reports it once the new account loads (see signupCompletion.ts).
 */

const FIRST_TOUCH_STORAGE_KEY = 'macro_first_touch';
/** Campaign parameters the website keeps for the tab (apps/marketing utilBaseUrl.ts). */
const WEBSITE_ATTRIBUTION_STORAGE_KEY = 'macro_attribution_params';
const UTM_PARAMS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
] as const;

export type FirstTouch = Partial<
  Record<(typeof UTM_PARAMS)[number] | 'referrer' | 'landing_page', string>
>;

function externalReferrer(): string | undefined {
  try {
    if (!document.referrer) return undefined;
    const referrer = new URL(document.referrer);
    return referrer.origin === window.location.origin
      ? undefined
      : document.referrer;
  } catch {
    return undefined;
  }
}

/**
 * Records this page load as the first touch when it has a source (campaign
 * parameters or an external referrer) and none is stored yet. Loads without a
 * source never claim the slot, so a later campaign visit still can.
 */
export function recordFirstTouch() {
  try {
    if (localStorage.getItem(FIRST_TOUCH_STORAGE_KEY) != null) return;

    const search = new URLSearchParams(window.location.search);
    // The website is same-origin and keeps the landing's campaign parameters
    // for the tab; its signup links do not always forward them.
    const website = new URLSearchParams(
      sessionStorage.getItem(WEBSITE_ATTRIBUTION_STORAGE_KEY) ?? ''
    );
    const touch: FirstTouch = {};
    for (const param of UTM_PARAMS) {
      const value = search.get(param) || website.get(param);
      if (value) touch[param] = value;
    }
    const referrer = externalReferrer();
    if (referrer) touch.referrer = referrer;
    if (Object.keys(touch).length === 0) return;

    touch.landing_page = window.location.pathname;
    localStorage.setItem(FIRST_TOUCH_STORAGE_KEY, JSON.stringify(touch));
  } catch {
    // Storage unavailable: attribution is best-effort.
  }
}

/** The stored first touch, as `first_touch_*` event properties. */
export function firstTouchProperties(): Record<string, string> {
  try {
    const stored = localStorage.getItem(FIRST_TOUCH_STORAGE_KEY);
    if (!stored) return {};
    const touch: unknown = JSON.parse(stored);
    if (typeof touch !== 'object' || touch === null) return {};
    const properties: Record<string, string> = {};
    for (const [key, value] of Object.entries(touch)) {
      if (typeof value === 'string') properties[`first_touch_${key}`] = value;
    }
    return properties;
  } catch {
    return {};
  }
}
