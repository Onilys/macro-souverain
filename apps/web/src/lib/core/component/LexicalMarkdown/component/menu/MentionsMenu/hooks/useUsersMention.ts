import { type UserItem, useQuickAccess } from '@core/context/quickAccess';
import { useEmail } from '@core/context/user';
import type { IUser } from '@core/user';
import { createFreshSearch, FreshSearchPresets } from '@core/util/freshSort';
import { createLazyMemo } from '@solid-primitives/memo';
import type { Accessor } from 'solid-js';
import type { GroupMentionItem } from '../../../../utils/mentionsUtils';
import { isBotMentionUser } from '../utils/botMention';

/**
 * Extended UserItem that includes channel membership status.
 * When `notInChannel` is true, the user is not a member of the current channel.
 */
export type UserItemWithChannelStatus = UserItem & {
  notInChannel?: boolean;
};

type UseUsersMentionOptions = {
  /** Custom users list if necessary */
  users?: Accessor<IUser[]>;
  searchTerm: Accessor<string>;
  /**
   * Whether the composer posts to a channel. Group mentions are an editor
   * configuration, not a block-context lookup: the channels view hosts a
   * conversation outside the block system, where `useMaybeBlockId()` is
   * undefined, and `@here` must still be offered there.
   */
  isChannelBlock?: boolean;
  /**
   * IDs of users who are members of the current channel. When provided,
   * all workspace users are shown but non-members are marked and deprioritized.
   */
  channelParticipantIds?: Accessor<string[]>;
};

type UseUsersMentionResult = {
  availableUsers: Accessor<UserItemWithChannelStatus[]>;
  users: Accessor<UserItemWithChannelStatus[]>;
  currentUserDomain: Accessor<string | undefined>;
  groups: Accessor<GroupMentionItem[]>;
  usersAndGroups: Accessor<(UserItemWithChannelStatus | GroupMentionItem)[]>;
};

/** Available group aliases and their match functions */
const GROUPS = [
  {
    alias: 'here',
    match: (term: string) => term === '' || 'here'.startsWith(term),
  },
] as const;

const BOT_MENTION_BOOST = 10;
const CHANNEL_MEMBER_BOOST = 5;

/**
 * Hook for managing user mentions in the mentions menu.
 * Handles user list retrieval, search, filtering, and special groups.
 */
export function useUsersMention(
  options: UseUsersMentionOptions
): UseUsersMentionResult {
  const {
    users: customUsers,
    searchTerm,
    isChannelBlock,
    channelParticipantIds,
  } = options;
  const quickAccess = useQuickAccess();
  const workspaceUsers = quickAccess.useList('person').items;
  const currentUserEmail = useEmail();

  const currentUserDomain = () => {
    const email = currentUserEmail();
    return email ? email.split('@')[1] : undefined;
  };

  const usersList = createLazyMemo((): UserItemWithChannelStatus[] => {
    const participantIds = channelParticipantIds?.();
    const participantIdSet = participantIds
      ? new Set(participantIds)
      : undefined;

    if (!customUsers) {
      if (!participantIdSet) return workspaceUsers();

      return workspaceUsers().map((item) => ({
        ...item,
        notInChannel: !participantIdSet.has(item.id),
      }));
    }

    // Custom lists scope who can be mentioned, but should retain the same
    // interaction ranking as the document body's workspace list.
    const workspaceUsersById = new Map(
      workspaceUsers().map((item) => [item.id, item])
    );

    // If we have channel participants, show ALL workspace users but mark non-members
    if (participantIdSet) {
      return workspaceUsers().map((item) => ({
        ...item,
        notInChannel: !participantIdSet.has(item.id),
      }));
    }

    return customUsers().map((user) => ({
      id: user.id,
      data: user,
      kind: 'user' as const,
      bucket: 'person' as const,
      sortTimestamp: workspaceUsersById.get(user.id)?.sortTimestamp ?? 0,
      timestamps: {
        lastInteraction:
          workspaceUsersById.get(user.id)?.timestamps.lastInteraction ??
          user.lastInteraction,
      },
      searchText: `${user.name || user.email} | ${user.email}`,
    }));
  });

  const userSearch = () => {
    const baseConfig =
      FreshSearchPresets.baseUserSearch<UserItemWithChannelStatus>(
        currentUserDomain,
        (item) => item.data.email
      );

    return createFreshSearch<UserItemWithChannelStatus>({
      config: {
        ...baseConfig,
        boostFn: (item) =>
          (baseConfig.boostFn?.(item) ?? 0) +
          (isBotMentionUser(item) ? BOT_MENTION_BOOST : 0) +
          (item.notInChannel ? 0 : CHANNEL_MEMBER_BOOST),
      },
      getName: (item) => item.searchText,
      getTimestamp: (item) => ({
        lastInteraction: item.timestamps.lastInteraction,
      }),
    });
  };

  const users = createLazyMemo(() => {
    const term = searchTerm();
    const list = usersList();
    return userSearch()(list, term).map(({ item }) => item);
  });

  /**
   * Special groups like @here that are only available in channel composers.
   * These are filtered based on the current search term.
   */
  const groups = (): GroupMentionItem[] => {
    if (!isChannelBlock) return [];

    const term = searchTerm().toLowerCase();

    return GROUPS.filter((g) => g.match(term)).map(
      (g): GroupMentionItem => ({
        kind: 'group',
        id: g.alias,
        data: { id: g.alias, groupAlias: g.alias },
      })
    );
  };

  const usersAndGroups = createLazyMemo(
    (): (UserItemWithChannelStatus | GroupMentionItem)[] => {
      return [...groups(), ...users()];
    }
  );

  return {
    availableUsers: usersList,
    users,
    currentUserDomain,
    groups,
    usersAndGroups,
  };
}
