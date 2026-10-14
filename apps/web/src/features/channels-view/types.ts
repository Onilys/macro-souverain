export type ChannelsTab = 'browse' | 'recents' | 'threads';

/** The two paginated conversation queries the view runs. */
export type ChannelsGroup = 'channels' | 'direct_messages';

export type ChannelListSort = 'viewed_at' | 'updated_at' | 'created_at';

/** Lists with their own sort preference: the All tab groups and the Threads rail. */
export type ChannelsSortGroup = ChannelsGroup | 'threads';

/**
 * The All tab's slices of the `channels` query. All three read one paginated
 * source — externality depends on who is in a channel, which no server filter
 * expresses — so they share its sort and its pagination.
 */
export type ChannelsChannelSection =
  | 'team_channels'
  | 'private_channels'
  | 'external_channels';

/** Collapsible sections that list conversations, in rendered order. */
export type ChannelsListSection = ChannelsChannelSection | 'direct_messages';

/** Collapsible sections of the All tab. */
export type ChannelsRailSection = 'favorites' | ChannelsListSection;

/** A rendered, separately virtualized list in the rail. */
export type ChannelsRailList =
  | ChannelsListSection
  | 'recents'
  | 'search'
  | 'threads';

export type ChannelsQueryScope = ChannelsGroup | 'recents';

export type ChannelsViewState = {
  tab: ChannelsTab;
  mobileTab: ChannelsQueryScope;
  expandedGroups: Record<ChannelsRailSection, boolean>;
  /**
   * Channel labels this user has collapsed. Labels themselves are team data;
   * only the open/closed state is personal, so it is stored by label id.
   */
  collapsedLabels: string[];
  /**
   * Threads tab filter: the conversation whose threads are shown, or all.
   * Kept in view state rather than the URL: a search-param change replaces the
   * split's history entry, which is too costly for a per-click filter.
   */
  threadsChannelId: string | undefined;
  sortBy: Record<ChannelsSortGroup, ChannelListSort>;
  asideWidth: number;
};

export type ChannelsViewStateOptions = Partial<
  Omit<ChannelsViewState, 'expandedGroups' | 'sortBy'>
> & {
  expandedGroups?: Partial<ChannelsViewState['expandedGroups']>;
  sortBy?: Partial<ChannelsViewState['sortBy']>;
};
