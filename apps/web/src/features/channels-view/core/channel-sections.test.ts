import type { ChannelEntity } from '@entity';
import { describe, expect, it } from 'vitest';
import {
  channelListSection,
  channelsSortGroupForSection,
  isChannelsListSection,
  isExternalChannel,
  teamRosterOf,
} from './channel-sections';

const roster = teamRosterOf(['macro|ana@acme.com', 'macro|Bo@acme.com']);

const channel = (
  channelType: ChannelEntity['channelType'],
  participantIds?: string[]
) => ({ channelType, participantIds });

describe('channelListSection', () => {
  it('sends every DM to the DM section, whoever is in it', () => {
    expect(
      channelListSection(
        channel('direct_message', [
          'macro|ana@acme.com',
          'macro|zoe@other.com',
        ]),
        roster
      )
    ).toBe('direct_messages');
  });

  it('sends team channels to the team section even with a guest in them', () => {
    expect(
      channelListSection(channel('team', ['macro|zoe@other.com']), roster)
    ).toBe('team_channels');
  });

  it.each(['private', 'public'] as const)(
    'splits a %s channel on whether anyone in it is outside the team',
    (channelType) => {
      expect(
        channelListSection(
          channel(channelType, ['macro|ana@acme.com', 'macro|bo@acme.com']),
          roster
        )
      ).toBe('private_channels');
      expect(
        channelListSection(
          channel(channelType, ['macro|ana@acme.com', 'macro|zoe@other.com']),
          roster
        )
      ).toBe('external_channels');
    }
  );

  it('matches roster members regardless of case', () => {
    expect(
      channelListSection(channel('private', ['macro|BO@acme.com']), roster)
    ).toBe('private_channels');
  });

  it('ignores bots and other non-user participants', () => {
    expect(
      channelListSection(
        channel('private', ['macro|ana@acme.com', 'bot_01234']),
        roster
      )
    ).toBe('private_channels');
  });

  it('calls nothing external until the roster is known', () => {
    expect(
      channelListSection(channel('private', ['macro|zoe@other.com']), undefined)
    ).toBe('private_channels');
    expect(
      channelListSection(
        channel('private', ['macro|zoe@other.com']),
        teamRosterOf([])
      )
    ).toBe('private_channels');
  });

  it('treats a channel with no participant list as internal', () => {
    expect(channelListSection(channel('private'), roster)).toBe(
      'private_channels'
    );
    expect(isExternalChannel(channel('private', []), roster)).toBe(false);
  });
});

describe('section helpers', () => {
  it('shares one sort preference across the three channel sections', () => {
    expect(channelsSortGroupForSection('team_channels')).toBe('channels');
    expect(channelsSortGroupForSection('private_channels')).toBe('channels');
    expect(channelsSortGroupForSection('external_channels')).toBe('channels');
    expect(channelsSortGroupForSection('direct_messages')).toBe(
      'direct_messages'
    );
  });

  it('tells section lists apart from the other rail lists', () => {
    expect(isChannelsListSection('external_channels')).toBe(true);
    expect(isChannelsListSection('direct_messages')).toBe(true);
    expect(isChannelsListSection('recents')).toBe(false);
    expect(isChannelsListSection('search')).toBe(false);
    expect(isChannelsListSection('threads')).toBe(false);
  });
});
