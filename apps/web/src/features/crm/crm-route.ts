import {
  createSearchParamsCodec,
  type SplitReference,
  type SplitSearchState,
} from '@app/lib/split-router';
import { uuidRouteReference } from '@components/app/split-layout/split-router/mention-links';
import { z } from 'zod';
import { pipelineIdOfTab } from './core/navigation';
import {
  CRM_VIEW_URL_PARAM,
  decodeCrmViewParam,
} from './queries/saved-view-codec';

/** A pipeline another view asked Customers to show; a new `seek` repeats the request. */
export const crmSearch = {
  namespace: 'crm',
  schema: z.object({ pipeline: z.string(), seek: z.string() }),
  defaults: { pipeline: '', seek: '' },
};

const crmSearchCodec = createSearchParamsCodec(crmSearch);

/** The Customers pane search that opens it on `pipelineId`. */
export function crmPipelineSearch(pipelineId: string): SplitSearchState {
  return {
    [crmSearch.namespace]:
      crmSearchCodec.serialize({
        pipeline: pipelineId,
        seek: crypto.randomUUID(),
      }) ?? {},
  };
}

/** A shared Customers link that shows a pipeline references the pipeline. */
export function crmViewReference(
  query: URLSearchParams
): SplitReference | undefined {
  const view = query.get(CRM_VIEW_URL_PARAM);
  const tab = view ? decodeCrmViewParam(view)?.activeTab : undefined;
  const reference = uuidRouteReference(pipelineIdOfTab(tab), 'pipeline');
  // The rest of the shared view state is no place within the pipeline.
  return reference && { ...reference, params: {} };
}
