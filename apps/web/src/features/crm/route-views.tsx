import { createSearchParams } from '@app/lib/split-router';
import {
  RedirectSplit,
  usePageViewTracking,
  withAuth,
} from '@components/app/split-layout/split-router/app-route-shell';
import { enableCrm, isFeatureEnabled } from '@core/constant/featureFlags';
import { lazy, untrack } from 'solid-js';
import { pipelineTab } from './core/navigation';
import { crmSearch } from './crm-route';
import {
  CRM_VIEW_URL_PARAM,
  decodeCrmViewParam,
} from './queries/saved-view-codec';

const Crm = lazy(async () => ({
  default: (await import('./crm')).Crm,
}));

export const CompaniesRouteView = withAuth(() => {
  if (!isFeatureEnabled(enableCrm))
    return <RedirectSplit to={{ type: 'component', id: 'home' }} />;
  usePageViewTracking('companies');
  const [search, setSearch] = createSearchParams(crmSearch);
  const pipelineRequest = () =>
    search.pipeline
      ? { pipelineId: search.pipeline, seek: search.seek }
      : undefined;
  const requested = untrack(pipelineRequest);
  const crmView = new URLSearchParams(window.location.search).get(
    CRM_VIEW_URL_PARAM
  );
  return (
    <Crm
      initialView={
        requested
          ? { kind: 'crm', activeTab: pipelineTab(requested.pipelineId) }
          : crmView
            ? decodeCrmViewParam(crmView)
            : undefined
      }
      pipelineRequest={{
        current: pipelineRequest,
        release: () => setSearch({}, { mode: 'replace', history: 'replace' }),
      }}
    />
  );
});
