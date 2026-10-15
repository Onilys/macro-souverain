import { describe, expect, it } from 'vitest';
import { settingsSlugToTab, settingsTabToSlug } from './settingsTabsConfig';

describe('settings Usage tab', () => {
  it('routes Usage', () => {
    expect(settingsSlugToTab('usage')).toBe('Usage');
    expect(settingsTabToSlug('Usage')).toBe('usage');
  });
});

describe('settings navigation', () => {
  it('gives calendar connections and booking links separate routes', () => {
    expect(settingsSlugToTab('calendar')).toBe('Calendar');
    expect(settingsSlugToTab('booking-links')).toBe('Booking links');
    expect(settingsTabToSlug('Booking links')).toBe('booking-links');
  });
  it('routes agent-connections to the Connections tab', () => {
    expect(settingsSlugToTab('agent-connections')).toBe('Connections');
    expect(settingsTabToSlug('Connections')).toBe('agent-connections');
  });

  it('keeps the connections slug on Integrations', () => {
    expect(settingsSlugToTab('connections')).toBe('Connected');
  });
});
