import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AnalyticsInterface } from './analytics';
import { firstTouchProperties, recordFirstTouch } from './firstTouch';
import { trackSignupCompletion } from './signupCompletion';

function visit(url: string, referrer = '') {
  window.history.replaceState(null, '', url);
  Object.defineProperty(document, 'referrer', {
    value: referrer,
    configurable: true,
  });
}

afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  visit('/');
});

describe('first touch', () => {
  it('keeps the first visit with a source and ignores later ones', () => {
    visit('/app/login');
    recordFirstTouch();
    expect(firstTouchProperties()).toEqual({});

    visit(
      '/app/signup?utm_source=google&utm_medium=cpc&utm_campaign=launch',
      'https://www.google.com/'
    );
    recordFirstTouch();
    visit('/app?utm_source=newsletter', 'https://news.example.com/');
    recordFirstTouch();

    expect(firstTouchProperties()).toEqual({
      first_touch_utm_source: 'google',
      first_touch_utm_medium: 'cpc',
      first_touch_utm_campaign: 'launch',
      first_touch_referrer: 'https://www.google.com/',
      first_touch_landing_page: '/app/signup',
    });
  });

  it('uses the website landing campaign and skips same-origin referrers', () => {
    sessionStorage.setItem(
      'macro_attribution_params',
      'utm_source=linkedin&utm_campaign=q4'
    );
    visit('/app/signup', `${window.location.origin}/pricing`);
    recordFirstTouch();

    expect(firstTouchProperties()).toEqual({
      first_touch_utm_source: 'linkedin',
      first_touch_utm_campaign: 'q4',
      first_touch_landing_page: '/app/signup',
    });
  });

  it('reports the first touch once when a new account loads', () => {
    visit('/app?utm_source=reddit', 'https://www.reddit.com/');
    recordFirstTouch();
    visit('/app?signed_up=true');
    const track = vi.fn();
    const analytics = {
      track,
      trackMeta: vi.fn(),
      trackGoogleConversion: vi.fn(),
    } as unknown as AnalyticsInterface;

    trackSignupCompletion(analytics, { id: 'macro|ada@acme.com' });
    trackSignupCompletion(analytics, { id: 'macro|ada@acme.com' });

    const firstTouch = {
      first_touch_utm_source: 'reddit',
      first_touch_referrer: 'https://www.reddit.com/',
      first_touch_landing_page: '/app',
    };
    expect(
      track.mock.calls.filter(([event]) => event === 'sign_up_attribution')
    ).toEqual([
      [
        'sign_up_attribution',
        firstTouch,
        ['posthog'],
        { posthog: { $set_once: firstTouch } },
      ],
    ]);
  });
});
