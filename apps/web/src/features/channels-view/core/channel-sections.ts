import { isMacroId } from '@core/user/macroId';
import type { ChannelEntity } from '@entity';
import { CHANNELS_LIST_SECTIONS } from '../constants';
import type {
  ChannelsListSection,
  ChannelsRailList,
  ChannelsSortGroup,
} from '../types';

/**
 * Who counts as "us" when deciding whether a channel reaches outside the team:
 * the current team's member ids, lowercased. `undefined` means the roster is
 * unknown (no team, or the query has not settled), and nobody reads as outside.
 */
export type TeamRoster = ReadonlySet<string> | undefined;

export function teamRosterOf(
  memberIds: readonly string[] | undefined
): TeamRoster {
  if (memberIds === undefined || memberIds.length === 0) return undefined;
  return new Set(memberIds.map((id) => id.toLocaleLowerCase()));
}

/**
 * Whether a participant is a person from outside the team. Only user ids
 * (`macro|email`) are judged — bots and other machine participants join
 * channels too and never belong to the roster, so counting them would make
 * every channel with a bot read as external.
 */
function isExternalParticipant(
  participantId: string,
  roster: TeamRoster
): boolean {
  if (roster === undefined) return false;
  if (!isMacroId(participantId)) return false;
  return !roster.has(participantId.toLocaleLowerCase());
}

/**
 * A channel shared with people outside the team: not a team channel (those
 * belong to the team by construction), not a DM (DMs have their own section),
 * and holding at least one participant who is not a teammate.
 */
export function isExternalChannel(
  channel: Pick<ChannelEntity, 'channelType' | 'participantIds'>,
  roster: TeamRoster
): boolean {
  if (
    channel.channelType === 'team' ||
    channel.channelType === 'direct_message'
  )
    return false;
  return Boolean(
    channel.participantIds?.some((id) => isExternalParticipant(id, roster))
  );
}

/** The section a channel is listed in on the All tab. */
export function channelListSection(
  channel: Pick<ChannelEntity, 'channelType' | 'participantIds'>,
  roster: TeamRoster
): ChannelsListSection {
  if (channel.channelType === 'direct_message') return 'direct_messages';
  if (channel.channelType === 'team') return 'team_channels';
  return isExternalChannel(channel, roster)
    ? 'external_channels'
    : 'private_channels';
}

/**
 * The sort preference a section follows — the query it is rendered from. The
 * three channel sections slice one query, so one sort choice orders them all.
 */
export function channelsSortGroupForSection(
  section: ChannelsListSection
): ChannelsSortGroup {
  return section === 'direct_messages' ? 'direct_messages' : 'channels';
}

export function isChannelsListSection(
  list: ChannelsRailList
): list is ChannelsListSection {
  return (CHANNELS_LIST_SECTIONS as readonly string[]).includes(list);
}
