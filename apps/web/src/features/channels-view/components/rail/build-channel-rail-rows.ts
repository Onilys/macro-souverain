import type { ChannelEntity } from '@entity';
import type { ChannelLabel } from '@service-storage/generated/schemas/channelLabel';
import type { Favorite } from '@service-storage/generated/schemas/favorite';
import { CHANNELS_LIST_SECTIONS } from '../../constants';
import { canLabelChannel } from '../../core/channel-label-eligibility';
import type {
  ChannelsListSection,
  ChannelsRailSection,
  ChannelsTab,
} from '../../types';
import {
  ALL_THREADS_ROW_ID,
  type ChannelRailRow,
  type ChannelSectionRow,
  rowKeyForChannel,
  rowKeyForFavorite,
  rowKeyForLabel,
  rowKeyForSection,
} from './ChannelsRailContext';

/**
 * The conversations each rendered list holds. The team-channels section is
 * absent: it renders `channelSectionRows`, which interleaves label headings.
 */
export type ChannelRailItemsByScope = Record<
  'private_channels' | 'external_channels' | 'direct_messages' | 'recents',
  readonly ChannelEntity[]
> & {
  threads: readonly ChannelEntity[];
  favorites: readonly Favorite[];
};

const compareChannelName = (left: ChannelEntity, right: ChannelEntity) =>
  left.name.localeCompare(right.name, undefined, { sensitivity: 'base' }) ||
  left.id.localeCompare(right.id);

/**
 * Lay out the Team channels section: each label in saved order with the
 * channels the user can see in it (A→Z, the same for everyone), then the
 * channels in no label in the section's own sort. Empty labels stay visible as drop targets; a collapsed label hides its channels.
 *
 * Labelled channels come from `channelsById` because the paginated source
 * may not have reached them yet; anything unlabelled comes from `channels`
 * in source order.
 */
export function buildChannelSectionRows(options: {
  labels: readonly ChannelLabel[];
  channels: readonly ChannelEntity[];
  channelsById: ReadonlyMap<string, ChannelEntity>;
  isLabelOpen: (labelId: string) => boolean;
}): ChannelSectionRow[] {
  const rows: ChannelSectionRow[] = [];
  const labelled = new Set<string>();

  for (const label of options.labels) {
    const visible = label.channelIds
      .map((id) => options.channelsById.get(id))
      .filter(
        (channel): channel is ChannelEntity =>
          channel !== undefined && canLabelChannel(channel)
      )
      .sort(compareChannelName);

    for (const channel of visible) labelled.add(channel.id);
    rows.push({ kind: 'label', label });
    if (!options.isLabelOpen(label.id)) continue;
    for (const channel of visible) {
      rows.push({ kind: 'conversation', channel, labelId: label.id });
    }
  }

  for (const channel of options.channels) {
    if (labelled.has(channel.id)) continue;
    rows.push({ kind: 'conversation', channel });
  }

  return rows;
}

/** The rows one conversation section contributes, heading first. */
function sectionRows(
  section: ChannelsListSection,
  expanded: boolean,
  items: ChannelRailItemsByScope,
  channelSectionRows: readonly ChannelSectionRow[]
): ChannelRailRow[] {
  const rows: ChannelRailRow[] = [
    { kind: 'section', id: rowKeyForSection(section), group: section },
  ];
  if (!expanded) return rows;

  if (section === 'team_channels') {
    rows.push(
      ...channelSectionRows.map(
        (row, localIndex): ChannelRailRow =>
          row.kind === 'label'
            ? {
                kind: 'label',
                id: rowKeyForLabel(row.label.id),
                group: 'team_channels',
                localIndex,
                label: row.label,
              }
            : {
                kind: 'conversation',
                id: rowKeyForChannel(row.channel.id, row.labelId),
                group: 'team_channels',
                scope: 'team_channels',
                localIndex,
                channel: row.channel,
                labelId: row.labelId,
              }
      )
    );
    return rows;
  }

  rows.push(
    ...items[section].map(
      (channel, localIndex): ChannelRailRow => ({
        kind: 'conversation',
        id: rowKeyForChannel(channel.id),
        group: section,
        scope: section,
        localIndex,
        channel,
      })
    )
  );
  return rows;
}

/**
 * The keyboard-navigable rows of the All tab (or the flat Recent list), in
 * visual order. Collapsed sections contribute only their heading, and
 * `sections` leaves out the ones the rail is not rendering.
 */
export function buildChannelRailRows(
  tab: ChannelsTab,
  expandedGroups: Record<ChannelsRailSection, boolean>,
  items: ChannelRailItemsByScope,
  channelSectionRows: readonly ChannelSectionRow[],
  sections: readonly ChannelsListSection[] = CHANNELS_LIST_SECTIONS
): ChannelRailRow[] {
  if (tab === 'threads') {
    return [
      { kind: 'all-threads', id: ALL_THREADS_ROW_ID },
      ...items.threads.map(
        (channel, localIndex): ChannelRailRow => ({
          kind: 'conversation',
          id: rowKeyForChannel(channel.id),
          scope: 'threads',
          localIndex,
          channel,
        })
      ),
    ];
  }

  if (tab === 'recents') {
    return items.recents.map((channel, localIndex) => ({
      kind: 'conversation',
      id: rowKeyForChannel(channel.id),
      scope: 'recents',
      localIndex,
      channel,
    }));
  }

  const rows: ChannelRailRow[] = [];
  if (items.favorites.length > 0) {
    rows.push({
      kind: 'section',
      id: rowKeyForSection('favorites'),
      group: 'favorites',
    });
    if (expandedGroups.favorites) {
      rows.push(
        ...items.favorites.map(
          (favorite): ChannelRailRow => ({
            kind: 'favorite',
            id: rowKeyForFavorite(favorite),
            group: 'favorites',
            favorite,
          })
        )
      );
    }
  }

  for (const section of sections) {
    rows.push(
      ...sectionRows(
        section,
        expandedGroups[section],
        items,
        channelSectionRows
      )
    );
  }

  return rows;
}
