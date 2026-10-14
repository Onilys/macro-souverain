import { describe, expect, it } from 'vitest';
import { CHANNELS_DEFAULT_EXPANDED_GROUPS } from './constants';
import { parseChannelsExpandedGroups } from './persistence';

describe('parseChannelsExpandedGroups', () => {
  it('opens every section when nothing is stored', () => {
    expect(parseChannelsExpandedGroups(undefined)).toEqual(
      CHANNELS_DEFAULT_EXPANDED_GROUPS
    );
    expect(parseChannelsExpandedGroups('not an object')).toEqual(
      CHANNELS_DEFAULT_EXPANDED_GROUPS
    );
  });

  it('round-trips a collapsed section', () => {
    expect(
      parseChannelsExpandedGroups({
        ...CHANNELS_DEFAULT_EXPANDED_GROUPS,
        external_channels: false,
      })
    ).toMatchObject({ external_channels: false, team_channels: true });
  });

  it('carries the old single Channels section into the three that replaced it', () => {
    expect(
      parseChannelsExpandedGroups({
        favorites: true,
        channels: false,
        direct_messages: true,
      })
    ).toEqual({
      favorites: true,
      team_channels: false,
      private_channels: false,
      external_channels: false,
      direct_messages: true,
    });
  });

  it('keeps the older hyphenated DM key working', () => {
    expect(
      parseChannelsExpandedGroups({
        favorites: true,
        channels: true,
        'direct-messages': false,
      })
    ).toMatchObject({ direct_messages: false });
  });

  it('prefers a stored section over the migrated fallback', () => {
    expect(
      parseChannelsExpandedGroups({
        channels: false,
        private_channels: true,
      })
    ).toMatchObject({ team_channels: false, private_channels: true });
  });
});
