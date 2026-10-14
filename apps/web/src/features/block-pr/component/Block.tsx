import { useAnalytics } from '@app/lib/analytics/analytics-context';
import { SidePanel } from '@components/app/side-panel';
import { useQueryClient } from '@queries/client';
import { track } from '@queries/history/track-block-opened';
import { onMount, Show } from 'solid-js';
import { PrDetailBody, usePrDetail } from '../views/PrDetail';
import { PrSplitHeader } from './PrSplitHeader';
import { PrSidePanelSections } from './sidepanel/PrSidePanelSections';

/** PR previews and popovers compose the feature without a legacy block owner. */
export default function PrBlock(props: { foreignEntityId: string }) {
  const detail = usePrDetail(() => props.foreignEntityId);
  const analytics = useAnalytics();
  const client = useQueryClient();
  onMount(() => {
    track({
      itemId: props.foreignEntityId,
      blockName: 'pr',
      client: () => client,
    });
    analytics.pageView('pr');
    analytics.track('open_entity', {
      entityType: 'pr',
      entityId: props.foreignEntityId,
    });
  });
  return (
    <SidePanel.Root floating persistKey={`pr:${props.foreignEntityId}`}>
      <div class="size-full overflow-hidden flex flex-col relative">
        <SidePanel.Layout floating>
          <PrSidePanelSections
            enrichment={detail.data()?.pullRequest}
            status={detail.query.status}
          />
          <div class="flex flex-col size-full min-w-0">
            <Show when={detail.data()}>
              {(data) => (
                <PrSplitHeader
                  foreignEntityId={props.foreignEntityId}
                  prRef={data().prRef}
                  enrichment={data().pullRequest}
                />
              )}
            </Show>
            <PrDetailBody
              foreignEntityId={props.foreignEntityId}
              data={detail.data()}
              status={detail.query.status}
              discussionSource={detail.discussionSource}
              onRetry={() => void detail.query.refetch()}
            />
          </div>
        </SidePanel.Layout>
      </div>
    </SidePanel.Root>
  );
}
