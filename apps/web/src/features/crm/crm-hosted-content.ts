import { paneRoute } from '@app/routes/app-route';
import type { SplitContent } from '@components/app/split-layout/layoutManager';

/** Customers showing `pipelineId`, without mounting a legacy pipeline block. */
export function crmPipelineContent(pipelineId: string): SplitContent {
  return {
    type: 'component',
    id: 'companies',
    entryMetadata: {
      route: paneRoute(
        { id: 'view-companies', params: {} },
        { id: 'companies-pipeline', params: { pipelineId } }
      ),
    },
  };
}
