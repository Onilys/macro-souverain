import { defineDoc } from '@app/features/ui-gallery/types';
import { fireAndForget } from '@core/util/fireAndForget';
import { createSignal, For } from 'solid-js';
import { Button } from '../Button';
import { createPager, Pager, PagerSwipeGestures } from './index';

// #region demo:swipe
function SwipeDemo() {
  const [activePage, setActivePage] = createSignal(1);
  const pages = [0, 1, 2];
  const pager = createPager({
    pageOrder: () => pages,
    activePage,
    onPageChange: setActivePage,
  });
  return (
    <Pager.Root controller={pager}>
      <div class="w-full max-w-lg space-y-3">
        <div class="flex items-center justify-between gap-3">
          <Button
            disabled={activePage() === 0}
            onClick={() => fireAndForget(pager.previous(), 'pager')}
          >
            Previous
          </Button>
          <output aria-live="polite">Page {activePage() + 1}</output>
          <Button
            disabled={activePage() === 2}
            onClick={() => fireAndForget(pager.next(), 'pager')}
          >
            Next
          </Button>
        </div>
        <Pager.Viewport class="h-64 rounded-xl border border-edge-muted bg-panel">
          <For each={pages}>
            {(id) => (
              <Pager.Page id={id}>
                <div class="flex size-full items-center justify-center text-2xl text-ink">
                  Page {id + 1}
                </div>
              </Pager.Page>
            )}
          </For>
        </Pager.Viewport>
        <PagerSwipeGestures edgeInset={40} />
        <p class="text-sm text-ink-muted">
          Swipe from the middle of the page. Short drags return; flicks change
          pages. Buttons retain their quicker slide.
        </p>
      </div>
    </Pager.Root>
  );
}
// #endregion

export default defineDoc({
  name: 'Pager',
  category: 'Navigation',
  description:
    'A controlled page rail with direct touch tracking and speed-based swipe settling. Programmatic navigation defaults to 140ms; swipe settling takes 150–300ms. Reduced motion skips transitions.',
  import:
    "import { createPager, Pager, PagerSwipeGestures } from '@ui/components/Pager';",
  propTypes: ['PagerRootProps', 'PagerViewportProps', 'PagerPageProps'],
  demos: [
    {
      id: 'swipe',
      title: 'Touch and button navigation',
      render: SwipeDemo,
      fill: true,
    },
  ],
});
