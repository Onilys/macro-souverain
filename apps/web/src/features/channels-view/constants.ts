import { DEFAULT_ASIDE_LAYOUT } from '@app/components/view-shell/view-shell-layout';
import type {
  ChannelListSort,
  ChannelsListSection,
  ChannelsRailSection,
  ChannelsSortGroup,
} from './types';

export const CHANNELS_DEFAULT_RAIL_WIDTH = DEFAULT_ASIDE_LAYOUT.width;
export const CHANNELS_MIN_RAIL_WIDTH = DEFAULT_ASIDE_LAYOUT.min;
export const CHANNELS_MAX_RAIL_WIDTH = DEFAULT_ASIDE_LAYOUT.max;

/** The All tab's conversation sections, top to bottom. */
export const CHANNELS_LIST_SECTIONS = [
  'team_channels',
  'private_channels',
  'external_channels',
  'direct_messages',
] as const satisfies readonly ChannelsListSection[];

/** Sections start open; collapsing one is remembered per user. */
export const CHANNELS_DEFAULT_EXPANDED_GROUPS: Record<
  ChannelsRailSection,
  boolean
> = {
  favorites: true,
  team_channels: true,
  private_channels: true,
  external_channels: true,
  direct_messages: true,
};

export const CHANNELS_DEFAULT_SORT_BY = {
  channels: 'updated_at',
  direct_messages: 'updated_at',
  threads: 'updated_at',
} satisfies Record<ChannelsSortGroup, ChannelListSort>;

export function clampChannelsRailWidth(width: number): number {
  if (!Number.isFinite(width)) return CHANNELS_DEFAULT_RAIL_WIDTH;

  return Math.min(
    CHANNELS_MAX_RAIL_WIDTH,
    Math.max(CHANNELS_MIN_RAIL_WIDTH, width)
  );
}
