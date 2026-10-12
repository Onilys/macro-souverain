import { SearchBar, ViewSidebar } from '@app/components/view-shell';
import { useSplitLayout } from '@components/app/split-layout/layout';
import NotePencilIcon from '@phosphor/note-pencil.svg';
import { tourTarget } from '@ui/components/Tour';
import { createSignal, type JSX, Show } from 'solid-js';
import { composeEmail } from '../compose-email';
import { useEmailView } from '../email-view-context';
import { EMAIL_TOUR } from '../tour';
import { EmailControls } from './EmailControls';
import { EmailFolderMenu } from './EmailFolderMenu';
import { useEmailControlHotkeys } from './EmailHeader';
import { EmailLayoutToggle } from './EmailLayoutToggle';
import { useEmailTabHotkeys } from './EmailSidebar';

/**
 * The Preview layout's sidebar: search and the layout toggle, the folder menu,
 * then the email list itself. The chosen thread reads in the main area.
 */
export function EmailPreviewSidebar(props: {
  list: JSX.Element;
  /** Restores list focus when Escape leaves the search field. */
  onSearchEscape?: () => void;
}) {
  const { openWithSplit } = useSplitLayout();
  const { state, setState } = useEmailView();
  const [filterOpen, setFilterOpen] = createSignal(false);
  let searchInput: HTMLInputElement | undefined;
  const searchTarget = tourTarget(EMAIL_TOUR.search);
  const searchable = () =>
    state.tab !== 'scheduled' && state.tab !== 'reminders';

  useEmailTabHotkeys();
  useEmailControlHotkeys({
    focusSearch: () => {
      searchInput?.focus();
      searchInput?.select();
    },
    openFilter: () => setFilterOpen(true),
  });

  return (
    <ViewSidebar.Root aria-label="Email navigation">
      <ViewSidebar.Header>
        <div class="flex min-w-0 items-center gap-1">
          <ViewSidebar.CloseButton class="shrink-0" />
          <ViewSidebar.Title>Email</ViewSidebar.Title>
        </div>
      </ViewSidebar.Header>
      <ViewSidebar.Primary class="flex flex-col gap-2">
        <SearchBar
          ref={(element) => {
            searchInput = element;
            searchTarget(element);
          }}
          label="Search email"
          placeholder="Search email"
          autocomplete="off"
          hotkey="cmd+f"
          disabled={!searchable()}
          value={state.search}
          onValueChange={(search) => setState('search', search)}
          onEscape={props.onSearchEscape}
          class="border-0 bg-ink/5 shadow-none"
        />
        <EmailLayoutToggle />
        <div class="flex min-w-0 items-center gap-1">
          <EmailFolderMenu class="flex-1" />
          <Show when={state.tab !== 'scheduled'}>
            <EmailControls
              filterOpen={filterOpen()}
              onFilterOpenChange={setFilterOpen}
            />
          </Show>
          <ViewSidebar.Control
            label="New email"
            onClick={() => composeEmail(openWithSplit, state.inboxIds)}
          >
            <NotePencilIcon class="size-4" />
          </ViewSidebar.Control>
        </div>
      </ViewSidebar.Primary>
      <div class="mt-1 min-h-0 min-w-0 flex-1 border-t border-edge-divider">
        {props.list}
      </div>
    </ViewSidebar.Root>
  );
}
