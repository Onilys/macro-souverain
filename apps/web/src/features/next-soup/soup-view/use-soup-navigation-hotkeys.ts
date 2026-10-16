import { listOwnedSlotName } from '@app/components/list';
import { isListViewID } from '@app/constants/list-views';
import { openEntityInSplitFromUnifiedList } from '@app/features/next-soup/utils';
import {
  ListNavigationCancelled,
  registerListNavigationSource,
} from '@app/features/soup/collection/list-navigation-source';
import { useGlobalNotificationSource } from '@components/app/GlobalAppState';
import type { SplitHandle } from '@components/app/split-layout/layoutManager';
import { withSplitPanelOwner } from '@components/app/split-layout/layoutUtils';
import { entityIdSelector } from '@core/dom-selectors';
import { createHotkeyGroup, registerHotkey } from '@core/hotkey/hotkeys';
import { TOKENS } from '@core/hotkey/tokens';
import { type EntityData, isTaskEntity } from '@entity/types/entity';
import { type Accessor, createMemo, onCleanup } from 'solid-js';
import type { VirtualizerHandle } from 'virtua/solid';
import type { SoupState } from '../create-soup-state';
import { resolveGroupedNeighbor } from '../primitives/resolve-grouped-neighbor';

type UseSoupNavigationHotkeysOptions = {
  scopeId: string;
  soup: SoupState;
  splitHandle: SplitHandle;
  virtualizerHandle: Accessor<VirtualizerHandle | undefined>;
  hasNextPage?: Accessor<boolean>;
  isFetching?: Accessor<boolean>;
  isFetchingNextPage?: Accessor<boolean>;
  fetchNextPage?: () => Promise<void>;
  error?: Accessor<Error | null>;
  orderedGroups?: Accessor<boolean>;
  groupNavigationIdentity?: Accessor<string>;
  loadOrderedGroup?: (key: string) => Promise<void>;
  groupPageError?: (key: string) => Error | null;
};

export const useSoupNavigationHotkeys = (
  options: UseSoupNavigationHotkeysOptions
) => {
  const { scopeId, soup, splitHandle, virtualizerHandle } = options;
  const notificationSource = useGlobalNotificationSource();

  const scrollTo = (index: number) => {
    const handle = virtualizerHandle();

    if (!handle) return;

    virtualizerHandle()?.scrollToIndex(index, {
      align: 'nearest',
    });
  };

  const navigationReferredFrom = createMemo(() => {
    const content = splitHandle.content();

    if (content.type === 'component' && isListViewID(content.id)) {
      return content.id;
    }

    const referredFrom = splitHandle.referredFrom();
    return isListViewID(referredFrom) ? referredFrom : undefined;
  });

  let disposed = false;
  let pendingNavigation: Promise<void> | undefined;
  const resolveAdjacent = async (
    currentId: string,
    direction: -1 | 1,
    moveFocus = true,
    accept?: (entity: EntityData) => boolean
  ) => {
    const focused = soup.focus.row();
    const anchor =
      (!currentId && focused) || focused?.original?.id === currentId
        ? focused
        : soup.rows().find((row) => row.original?.id === currentId);
    const focusedKey = soup.focus.row()?.identityKey;
    const identity = options.groupNavigationIdentity?.();
    const isCurrent = () =>
      !disposed &&
      options.orderedGroups?.() === true &&
      soup.focus.row()?.identityKey === focusedKey &&
      options.groupNavigationIdentity?.() === identity;
    const row = await resolveGroupedNeighbor({
      rows: soup.rows,
      accept: (row) => accept?.(row.original) ?? true,
      currentKey: anchor?.identityKey,
      direction,
      isCurrent,
      load: async (key) => {
        await options.loadOrderedGroup?.(key);
      },
      error: (key) => options.groupPageError?.(key) ?? null,
    });
    if (!isCurrent()) throw new ListNavigationCancelled();
    if (row && moveFocus) soup.focus.setIndex(row.index);
    return row?.original;
  };

  const viewId = navigationReferredFrom();
  if (viewId) {
    // Keep navigation available when the list view leaves the split's content.
    withSplitPanelOwner(listOwnedSlotName('navigation-source'), () => {
      onCleanup(() => {
        disposed = true;
      });
      return registerListNavigationSource(splitHandle, {
        viewId,
        entities: () =>
          soup
            .rows()
            .flatMap((row) =>
              row.kind === 'entity' && (!row.group || row.group.isExpanded())
                ? [row.original]
                : []
            ),
        resolveAdjacent: async (currentId, direction, accept) => {
          if (options.orderedGroups?.())
            return resolveAdjacent(currentId, direction, true, accept);
          return undefined;
        },
        hasOrderedGroups: options.orderedGroups,
        hasMore: () =>
          options.orderedGroups?.()
            ? soup
                .rows()
                .some(
                  (row) =>
                    row.kind === 'group-status' && row.group?.isExpanded()
                )
            : (options.hasNextPage?.() ?? false),
        loadMore: async () => {
          await options.fetchNextPage?.();
          const error = options.error?.();
          if (error) throw error;
        },
      });
    });
  } else {
    onCleanup(() => {
      disposed = true;
    });
  }

  const openEntity = (entity: EntityData) => {
    const handleContent = splitHandle.content().type;

    if (handleContent === 'component' || handleContent === 'project') return;

    openEntityInSplitFromUnifiedList(entity, {
      splitHandle,
      mergeHistory: true,
      referredFrom: navigationReferredFrom(),
      notificationSource,
    });
  };

  const navigateToOpenableEntity = (offset: -1 | 1) =>
    soup.navigate.by(offset, { skipGroupHeaders: true });

  const navigateAndSelectEntity = (offset: number) => {
    const nextRow = soup.navigate.by(offset, { skipGroupHeaders: true });
    if (!nextRow) return true;
    if (nextRow.row.kind === 'entity')
      soup.selection.select(nextRow.row.original);
    scrollTo(nextRow.index);
    return true;
  };

  const handleNavigationSelection = (offset: -1 | 1, ready = false) => {
    if (options.orderedGroups?.() && !ready) {
      if (pendingNavigation) return true;
      const select = async () => {
        try {
          const next = await resolveAdjacent(
            soup.focus.item()?.id ?? '',
            offset,
            false
          );
          if (next) handleNavigationSelection(offset, true);
        } catch {
          /* The group boundary exposes Retry. */
        } finally {
          pendingNavigation = undefined;
        }
      };
      pendingNavigation = select();
      return true;
    }
    const focusedEntity = soup.focus.item();
    const next = soup.navigate.peekOffset(offset, { skipGroupHeaders: true });

    const selection = soup.selection;

    const nextEntity = next?.row.original;
    if (!nextEntity) return true;

    // At the boundary (top/bottom), peekOffset clamps and returns the
    // same item we're already focused on. No-op to avoid toggling.
    if (focusedEntity && nextEntity.id === focusedEntity.id) return true;

    if (!focusedEntity) {
      navigateAndSelectEntity(offset);
      return true;
    }

    if (selection.count() === 0) {
      selection.toggle(focusedEntity);
      return true;
    }

    if (
      !selection.isSelected(focusedEntity.id) &&
      !selection.isSelected(nextEntity.id)
    ) {
      selection.toggle(focusedEntity);
      navigateAndSelectEntity(offset);
      return true;
    }

    if (selection.isSelected(nextEntity.id)) {
      selection.toggle(focusedEntity);
      soup.navigate.by(offset, { skipGroupHeaders: true });
      scrollTo(next.index);
      return true;
    }

    navigateAndSelectEntity(offset);

    return true;
  };

  const group = createHotkeyGroup();

  const { fetchNextPage, isFetching, isFetchingNextPage, hasNextPage } =
    options;

  const LOAD_MORE_DISTANCE_FROM_END = 3;

  const fetchNextPageIfNeeded = () => {
    if (!hasNextPage?.() || isFetching?.() || isFetchingNextPage?.()) return;
    fetchNextPage?.();
  };

  const navigateOrdered = (direction: -1 | 1) => {
    if (pendingNavigation) return true;
    const action = async () => {
      try {
        const entity = await resolveAdjacent(
          soup.focus.item()?.id ?? '',
          direction
        );
        if (entity) {
          scrollTo(soup.focus.index());
          openEntity(entity);
        }
      } catch {
        // The boundary renders the error and exposes a keyboard-accessible Retry.
      } finally {
        pendingNavigation = undefined;
      }
    };
    pendingNavigation = action();
    return true;
  };

  const navigateDown = () => {
    if (options.orderedGroups?.()) return navigateOrdered(1);
    const rowCount = soup.rows().length;
    const next = navigateToOpenableEntity(1);

    if (!next) {
      fetchNextPageIfNeeded();
      return true;
    }

    scrollTo(next.index);
    if (next.row.kind === 'entity') openEntity(next.row.original);

    if (next.index >= rowCount - 1 - LOAD_MORE_DISTANCE_FROM_END) {
      fetchNextPageIfNeeded();
    }

    return true;
  };

  const navigateUp = () => {
    if (options.orderedGroups?.()) return navigateOrdered(-1);
    const next = navigateToOpenableEntity(-1);

    if (!next) return true;

    scrollTo(next.index);
    if (next.row.kind === 'entity') openEntity(next.row.original);

    return true;
  };

  const canRunListNavigation = () => {
    const contentType = splitHandle.content().type;
    const referredFrom = navigationReferredFrom();
    return (
      contentType === 'component' ||
      contentType === 'project' ||
      referredFrom === 'home' ||
      referredFrom === 'mail'
    );
  };

  // Keep j/k registered on the split scope after the list unmounts. When an
  // entity is opened from a list into the same split, this lets j/k continue
  // navigating the originating soup list and update the split content.
  registerHotkey({
    hotkey: ['j'],
    scopeId,
    description: 'Down',
    hotkeyToken: TOKENS.entity.step.end,
    condition: canRunListNavigation,
    keyDownHandler: navigateDown,
    hide: true,
    disposeWithOwner: false,
  });

  registerHotkey({
    hotkey: ['arrowdown'],
    scopeId,
    description: 'Down',
    keyDownHandler: navigateDown,
    hide: true,
  }).withGroup(group);

  // Keep j/k registered on the split scope after the list unmounts. When an
  // entity is opened from a list into the same split, this lets j/k continue
  // navigating the originating soup list and update the split content.
  registerHotkey({
    hotkey: ['k'],
    scopeId,
    hotkeyToken: TOKENS.entity.step.start,
    description: 'Up',
    condition: canRunListNavigation,
    keyDownHandler: navigateUp,
    hide: true,
    disposeWithOwner: false,
  });

  registerHotkey({
    hotkey: ['arrowup'],
    scopeId,
    description: 'Up',
    keyDownHandler: navigateUp,
    hide: true,
  }).withGroup(group);

  // Select up - 'shift+arrowup', 'shift+k'
  registerHotkey({
    hotkey: ['shift+arrowup', 'shift+k'],
    scopeId,
    description: 'Select up',
    hotkeyToken: TOKENS.entity.select.start,
    keyDownHandler: () => {
      return handleNavigationSelection(-1);
    },
    hide: true,
  }).withGroup(group);

  // Select down - 'shift+arrowdown', 'shift+j'
  registerHotkey({
    hotkey: ['shift+arrowdown', 'shift+j'],
    scopeId,
    description: 'Select down',
    hotkeyToken: TOKENS.entity.select.end,
    keyDownHandler: () => {
      return handleNavigationSelection(1);
    },
    hide: true,
  }).withGroup(group);

  const getCollapsibleToggle = () => {
    const focusedId = soup.focus.id();
    if (!focusedId) return undefined;
    const splitEl = document.querySelector(
      `[data-split-id="${splitHandle.id}"]`
    );
    if (!splitEl) return undefined;
    const entityEl = splitEl.querySelector(entityIdSelector(focusedId));
    if (!entityEl) return undefined;
    return entityEl.querySelector(
      'button[data-collapsible-toggle]'
    ) as HTMLButtonElement | null;
  };

  // When the focused row is a group header, drive it toward `targetExpanded`.
  // Returns true if it toggled, false if already in that state, or undefined
  // when the focused row isn't a group header so the caller can fall through.
  const toggleFocusedGroupHeader = (
    targetExpanded: boolean
  ): boolean | undefined => {
    const focusedRow = soup.focus.row();
    if (!focusedRow?.getIsGrouped() || !focusedRow.group) return undefined;
    if (focusedRow.group.isExpanded() === targetExpanded) return false;
    focusedRow.group.toggle();
    return true;
  };

  registerHotkey({
    hotkey: ['h'],
    scopeId,
    description: 'Collapse group',
    hotkeyToken: TOKENS.unifiedList.navigation.collapseGroup,
    // Consume H on headers even when already collapsed; selected entities
    // elsewhere must not turn this into a reminder action.
    keyDownHandler: () => toggleFocusedGroupHeader(false) !== undefined,
    registrationType: 'add',
    handlerPriority: 4,
    hide: true,
  }).withGroup(group);

  registerHotkey({
    hotkey: ['arrowleft', 'h'],
    scopeId,
    description: 'Collapse item',
    hotkeyToken: TOKENS.unifiedList.navigation.parent,
    keyDownHandler: (event) => {
      const focusedEntity = soup.focus.item();
      if (
        event?.key.toLowerCase() === 'h' &&
        (!focusedEntity || !isTaskEntity(focusedEntity))
      )
        return false;
      const groupHandled = toggleFocusedGroupHeader(false);
      if (groupHandled !== undefined) return groupHandled;

      const toggle = getCollapsibleToggle();
      if (toggle?.dataset.collapsibleState === 'expanded') {
        toggle.click();
        return true;
      }

      // From a child row, collapse its parent group and focus the header.
      const focusedGroup = soup.focus.row()?.group;
      if (focusedGroup?.isExpanded()) {
        focusedGroup.toggle();
        const header = soup.navigate.toId(`header:${focusedGroup.key}`);
        if (header) scrollTo(header.index);
        return true;
      }

      return false;
    },
    registrationType: 'add',
    handlerPriority: 4,
    hide: true,
  }).withGroup(group);

  registerHotkey({
    hotkey: ['l', 'arrowright'],
    scopeId,
    description: 'Expand item',
    hotkeyToken: TOKENS.unifiedList.navigation.child,
    keyDownHandler: () => {
      const groupHandled = toggleFocusedGroupHeader(true);
      if (groupHandled !== undefined) return groupHandled;

      const toggle = getCollapsibleToggle();
      if (toggle?.dataset.collapsibleState === 'collapsed') {
        toggle.click();
        return true;
      }

      return false;
    },
    registrationType: 'add',
    handlerPriority: 4,
    hide: true,
  }).withGroup(group);

  onCleanup(() => group.dispose());
};
