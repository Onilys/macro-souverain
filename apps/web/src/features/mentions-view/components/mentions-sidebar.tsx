import { ViewSidebar } from '@app/components/view-shell';

/** Navigation sidebar for the Mentions list. */
export function MentionsSidebar() {
  return (
    <ViewSidebar.Root aria-label="Mentions navigation">
      <ViewSidebar.Header>
        <div class="flex min-w-0 items-center gap-1">
          <ViewSidebar.CloseButton class="shrink-0" />
          <ViewSidebar.Title>Mentions</ViewSidebar.Title>
        </div>
      </ViewSidebar.Header>
      <ViewSidebar.Primary>
        <ViewSidebar.Content>
          <p class="px-3 py-2 text-sm text-ink-muted">
            Filter and navigate your mentions here.
          </p>
        </ViewSidebar.Content>
      </ViewSidebar.Primary>
    </ViewSidebar.Root>
  );
}
