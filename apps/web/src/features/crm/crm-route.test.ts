import {
  createRoutesManifest,
  decodePane,
  type Entry,
  type NavigationCause,
  type SerializedSearchParams,
  type SplitRoutes,
  type SplitSearchState,
} from '@app/lib/split-router';
import { paneRoute } from '@app/routes/app-route';
import {
  appRoute,
  companiesRoute,
  crmPipelineRecordRoute,
  crmPipelineRoute,
  crmRecordRoute,
  legacyContentRoute,
  notFoundRoute,
} from '@app/routes/routes';
import { createAppSplitRouterMiddleware } from '@components/app/split-layout/split-router/app-middleware';
import { createMacroMentionLinkResolver } from '@components/app/split-layout/split-router/mention-links';
import { describe, expect, it, vi } from 'vitest';
import { pipelineTab } from './core/navigation';
import type { CrmViewConfig } from './core/saved-view';
import { crmSearchCodec } from './crm-route';
import { encodeCrmViewParam } from './queries/saved-view-codec';

vi.mock('@components/app/split-layout/componentRegistry', () => ({
  resolveComponent: vi.fn(() => ({ type: 'mock-component' })),
}));
vi.mock('@service-storage/websocket', () => ({
  storageWS: { reconnectIfDisconnected: vi.fn() },
  createWebSocketJob: vi.fn(),
}));
vi.mock('@service-connection/websocket', () => ({
  ws: { addEventListener: vi.fn(), send: vi.fn() },
  state: () => 'closed',
  createConnectionBlockWebsocketEffect: vi.fn(),
  createConnectionWebsocketEffect: vi.fn(),
}));

const pipelineId = '01a1212c-74e5-79bd-8767-0d4943d55b15';
const companyId = '01a1212c-74e5-79bd-8767-0d4943d55b16';
const contactId = '01a1212c-74e5-79bd-8767-0d4943d55b17';
const routes = createRoutesManifest({
  definitions: [
    {
      ...appRoute,
      children: [
        {
          ...companiesRoute,
          children: [
            { ...crmPipelineRoute, children: [crmPipelineRecordRoute] },
            crmRecordRoute,
          ],
        },
        legacyContentRoute,
        notFoundRoute,
      ],
    },
  ],
  defaultRoute: () => paneRoute({ id: companiesRoute.id, params: {} }),
} satisfies SplitRoutes);
const resolveMention = createMacroMentionLinkResolver(routes);

const appUrl = (path: string) => `${window.location.origin}/app${path}`;
const crmViewLink = (view: CrmViewConfig) =>
  appUrl(`/companies?crmView=${encodeCrmViewParam(view)}`);

const leafOf = (path: string) => {
  const route = decodePane(routes, path.split('/').filter(Boolean));
  const leaf = route?.matches.at(-1);
  return leaf && { id: leaf.id, params: leaf.params };
};

describe('crm tab search params', () => {
  it.each(['active', 'people', 'hidden', 'list:favorites'])(
    'keeps the %s tab through the URL',
    (tab) => {
      const params = crmSearchCodec.serialize({ tab });
      if (tab === 'active') {
        expect(params).toBeUndefined();
      } else {
        expect(params).toEqual({ tab: [tab] });
      }
      expect(crmSearchCodec.parse(params)).toEqual({
        value: { tab },
        valid: true,
      });
    }
  );
});

describe('record and pipeline URLs', () => {
  it('matches a record opened from a Customers list', () => {
    expect(leafOf(`companies/company/${companyId}`)).toEqual({
      id: crmRecordRoute.id,
      params: { recordType: 'company', recordId: companyId },
    });
    expect(leafOf(`companies/contact/${contactId}/emails`)).toEqual({
      id: crmRecordRoute.id,
      params: {
        recordType: 'contact',
        recordId: contactId,
        section: 'emails',
      },
    });
  });

  it('matches a pipeline and a record opened from it', () => {
    expect(leafOf(`companies/pipeline/${pipelineId}`)).toEqual({
      id: crmPipelineRoute.id,
      params: { pipelineId },
    });
    expect(
      leafOf(`companies/pipeline/${pipelineId}/company/${companyId}/team`)
    ).toEqual({
      id: crmPipelineRecordRoute.id,
      params: {
        recordType: 'company',
        recordId: companyId,
        section: 'team',
      },
    });
  });

  it.each([
    `companies/deal/${companyId}`,
    `companies/company/${companyId}/garbage`,
  ])('does not match %s as a record', (path) => {
    const leaf = leafOf(path);
    expect(leaf?.id).not.toBe(crmRecordRoute.id);
  });

  it.each([
    [`/companies/company/${companyId}`, 'company', companyId],
    [`/companies/contact/${contactId}/emails`, 'contact', contactId],
    [
      `/companies/pipeline/${pipelineId}/company/${companyId}`,
      'company',
      companyId,
    ],
  ])('pastes %s as a mention of the record', (path, block, id) => {
    expect(resolveMention(appUrl(path))).toEqual({ id, block, params: {} });
  });

  it('pastes a pipeline URL as a mention of the pipeline', () => {
    expect(resolveMention(appUrl(`/companies/pipeline/${pipelineId}`))).toEqual(
      { id: pipelineId, block: 'pipeline', params: {} }
    );
  });
});

describe('pipeline links', () => {
  it('pastes a copied pipeline link as a mention of the pipeline', () => {
    expect(
      resolveMention(
        crmViewLink({ kind: 'crm', activeTab: pipelineTab(pipelineId) })
      )
    ).toEqual({ id: pipelineId, block: 'pipeline', params: {} });
  });

  it.each(['s0.crm.tab', 'crm.tab'])(
    'pastes a Customers link with %s as a mention of the pipeline',
    (key) => {
      expect(
        resolveMention(appUrl(`/companies?${key}=${pipelineTab(pipelineId)}`))
      ).toEqual({ id: pipelineId, block: 'pipeline', params: {} });
    }
  );

  it.each([
    crmViewLink({ kind: 'crm', activeTab: 'active' }),
    crmViewLink({ kind: 'crm', activeTab: 'list:favorites' }),
    crmViewLink({ kind: 'crm', activeTab: pipelineTab('not-a-uuid') }),
    appUrl('/companies?crmView=garbage'),
    appUrl('/companies'),
    appUrl('/companies?s0.crm.tab=people'),
    appUrl(`/companies?s0.crm.tab=${pipelineTab('not-a-uuid')}`),
    appUrl(
      `/companies?crmView=${encodeCrmViewParam({ kind: 'crm', activeTab: 'active' })}&s0.crm.tab=${pipelineTab(pipelineId)}`
    ),
  ])('leaves other Customers links as links: %s', (url) => {
    expect(resolveMention(url)).toBeUndefined();
  });
});

describe('legacy pipeline URLs', () => {
  const run = (
    to: Entry,
    options: {
      touch?: boolean;
      cause?: NavigationCause;
      externalSearch?: string;
    } = {}
  ) => {
    const middleware = createAppSplitRouterMiddleware({
      isTouchDevice: () => options.touch ?? false,
    });
    for (const handler of middleware) {
      const result = handler({
        routes,
        from: undefined,
        to,
        path: '',
        cause: options.cause ?? 'navigate',
        externalSearch: options.externalSearch,
        signal: new AbortController().signal,
        redirect: (path) => ({ type: 'redirect', to: path }),
        cancel: () => ({ type: 'cancel' }),
      });
      if (result instanceof Promise) throw new Error('Unexpected async');
      if (result) return result;
    }
    return undefined;
  };
  const customers = (search?: SplitSearchState): Entry => ({
    id: 'entry',
    location: {
      route: paneRoute({ id: companiesRoute.id, params: {} }),
      search,
    },
  });
  const pipelinePath = `/companies/pipeline/${pipelineId}`;

  it.each([false, true])(
    'opens a pipeline block in Customers, on that pipeline (touch: %s)',
    (touch) => {
      const to: Entry = {
        id: 'entry',
        location: {
          route: paneRoute({
            id: legacyContentRoute.id,
            params: { type: 'pipeline', id: pipelineId },
          }),
        },
      };
      expect(run(to, { touch })).toEqual({
        type: 'redirect',
        to: pipelinePath,
      });
    }
  );

  it.each<SerializedSearchParams>([
    { tab: [pipelineTab(pipelineId)] },
    { tab: [pipelineTab(pipelineId)], pipeline: [pipelineId], seek: ['x'] },
    { pipeline: [pipelineId], seek: ['x'] },
  ])('moves the Customers pipeline search %o to its route', (crm) => {
    expect(run(customers({ crm }))).toEqual({
      type: 'redirect',
      to: pipelinePath,
    });
  });

  it('moves a shared pipeline view link to its route on entry', () => {
    const externalSearch = `crmView=${encodeCrmViewParam({
      kind: 'crm',
      activeTab: pipelineTab(pipelineId),
    })}`;
    expect(run(customers(), { cause: 'external', externalSearch })).toEqual({
      type: 'redirect',
      to: pipelinePath,
    });
    // Later navigation inside Customers keeps its own tab.
    expect(run(customers(), { externalSearch })).toBeUndefined();
  });

  it('leaves other Customers lists and records in place', () => {
    expect(run(customers({ crm: { tab: ['people'] } }))).toBeUndefined();
    expect(
      run({
        id: 'entry',
        location: {
          route: paneRoute(
            { id: companiesRoute.id, params: {} },
            {
              id: crmRecordRoute.id,
              params: { recordType: 'company', recordId: companyId },
            }
          ),
          search: { crm: { tab: ['people'] } },
        },
      })
    ).toBeUndefined();
  });
});
