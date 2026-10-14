import { describe, expect, it } from 'vitest';
import { modeAllowed, type ReplyEligibility } from './conversation';

describe('server reply eligibility', () => {
  const expiry = Date.parse('2026-10-14T20:00:00Z');
  const decision: ReplyEligibility = {
    evaluated_at: '2026-10-14T19:00:00Z',
    modes: [
      {
        mode: 'free_form',
        allowed: true,
        expires_at: new Date(expiry).toISOString(),
      },
    ],
  };
  it('expires at the server deadline and never grants an absent mode', () => {
    expect(modeAllowed(decision, 'free_form', expiry - 1)).toBe(true);
    expect(modeAllowed(decision, 'free_form', expiry)).toBe(false);
    expect(modeAllowed(decision, 'human_support', expiry - 1)).toBe(false);
    expect(modeAllowed(decision, 'free_form', Number.NaN)).toBe(false);
  });
  it('never turns a server denial into permission through local time', () => {
    const denied = {
      ...decision,
      modes: [{ ...decision.modes[0], allowed: false }],
    };
    expect(modeAllowed(denied, 'free_form', expiry - 3600000)).toBe(false);
    expect(modeAllowed(denied, 'free_form', expiry + 3600000)).toBe(false);
  });
});
