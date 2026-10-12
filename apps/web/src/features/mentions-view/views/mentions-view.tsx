import { ViewShell } from '@app/components/view-shell';
import { SplitPanel } from '@components/app/split-panel';
import { isTouchDevice } from '@core/mobile/isTouchDevice';
import type { JSX } from 'solid-js';
import { Show, Suspense } from 'solid-js';
import { MentionsHeader } from '../components/mentions-header';
import { MentionsSidebar } from '../components/mentions-sidebar';

/**
 * Mentions list. Shows items where the current user was @-mentioned across
 * documents, channels, comments, and PRs. Desktop navigates and filters from a
 * sidebar; touch keeps a simplified header.
 */
export function MentionsView() {
  const content = (_header?: JSX.Element) => (
    <div class="flex flex-1 flex-col items-center justify-center text-ink-muted">
      <p class="text-lg">Mentions</p>
      <p class="text-sm">Coming soon — see where you were @-mentioned.</p>
    </div>
  );

  return (
    <Show when={!isTouchDevice()} fallback={content()}>
      <SplitPanel.Root>
        <SplitPanel.Body>
          <ViewShell.Root
            asidePreferenceKey="mentions"
            resizable
            aside={{ preserveDuringResize: false }}
          >
            <ViewShell.Aside>
              <Suspense>
                <MentionsSidebar />
              </Suspense>
            </ViewShell.Aside>
            <ViewShell.Main>
              {content(
                <Suspense>
                  <MentionsHeader />
                </Suspense>
              )}
            </ViewShell.Main>
          </ViewShell.Root>
        </SplitPanel.Body>
      </SplitPanel.Root>
    </Show>
  );
}
