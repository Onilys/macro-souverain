import type { PreviewRouteOwner } from '@components/app/preview-panel-context';
import { cleanup, render, screen } from '@solidjs/testing-library';
import { createSignal, type JSX, onMount, Suspense } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';
import { EntityDetail } from './EntityDetail';

const mocks = vi.hoisted(() => ({ detailMounts: vi.fn(), commands: vi.fn() }));

function FileDetailMock(props: {
  kind: string;
  documentId: string;
  children?: (context: {
    documentMetadata: { documentName: string };
    userAccessLevel: 'view';
  }) => JSX.Element;
}) {
  onMount(() => mocks.detailMounts(props.kind, props.documentId));
  return (
    <section data-testid={`shared-${props.kind}`}>
      {props.children?.({
        documentMetadata: { documentName: props.documentId },
        userAccessLevel: 'view',
      })}
    </section>
  );
}

vi.mock('@core/constant/featureFlags', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@core/constant/featureFlags')>()),
  ENABLE_VIDEO_BLOCK: true,
}));
vi.mock('@app/features/next-soup/actions', () => ({
  useBlockEntityCommands: mocks.commands,
}));
vi.mock('@core/hotkey/HotkeyScope', () => ({
  useHotkeyScopeOrCreate: () => [() => {}, 'file-modal'],
  HotkeyScope: (props: { children: JSX.Element }) => props.children,
}));
vi.mock('@components/app/side-panel', () => ({
  SidePanel: { Root: (props: { children: JSX.Element }) => props.children },
}));
vi.mock('@core/component/TopBar/shareModal', () => ({
  useShareModal: () => () => {},
}));
vi.mock('@core/component/SharePermissions', () => ({
  getPermissions: () => ({}),
}));
vi.mock('@app/features/block-video/component/TopBar', () => ({
  TopBar: (props: { documentId: string }) => (
    <header data-testid="file-header">{props.documentId}</header>
  ),
}));
vi.mock('@app/features/block-unknown/component/TopBar', () => ({
  TopBar: (props: { documentId: string }) => (
    <header data-testid="file-header">{props.documentId}</header>
  ),
}));

vi.mock('@app/features/block-image/ImageBlock', () => ({
  ImageBlock: () => null,
}));
vi.mock('@app/features/drive-view/views/CanvasDetail', () => ({
  CanvasDetail: () => null,
}));
vi.mock('@app/features/drive-view/views/CodeDetail', () => ({
  CodeDetail: () => null,
}));
vi.mock('@app/features/drive-view/views/MarkdownDetail', () => ({
  MarkdownDetail: () => null,
}));
vi.mock('@app/features/drive-view/views/PdfDetail', () => ({
  PdfDetail: () => null,
}));
vi.mock('@app/features/drive-view/views/UnknownDetail', () => ({
  UnknownDetail: (props: Parameters<typeof FileDetailMock>[0]) => (
    <FileDetailMock {...props} kind="unknown" />
  ),
}));
vi.mock('@app/features/drive-view/views/VideoDetail', () => ({
  VideoDetail: (props: Parameters<typeof FileDetailMock>[0]) => (
    <FileDetailMock {...props} kind="video" />
  ),
}));
vi.mock('@channel/Channel/ChannelDetail', () => ({
  ChannelDetail: () => null,
  ChannelDetailTopBar: () => null,
}));
vi.mock('./FileEntityDetail', () => ({ FileEntityDetail: () => null }));
vi.mock('@app/features/next-soup/utils', () => ({
  getChannelEntityTarget: () => undefined,
  getDocumentCommentTarget: () => undefined,
  calendarViewTargetForEntity: () => undefined,
}));
vi.mock('@components/app/GlobalAppState', () => ({
  useGlobalBlockOrchestrator: () => ({}),
}));
vi.mock('@components/app/split-layout/layoutUtils', () => ({
  useSplitPanelOrThrow: () => ({}),
}));
vi.mock('@components/app/PreviewPanel', () => ({
  PreviewPanel: (props: {
    routeOwner?: PreviewRouteOwner;
    navigationRequest?: number | string;
  }) => (
    <output data-testid="preview-capabilities">
      {JSON.stringify({
        owner: props.routeOwner ?? null,
        request: props.navigationRequest ?? null,
      })}
    </output>
  ),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const target = {
  type: 'document' as const,
  id: 'sheet-1',
  fileType: 'spreadsheet',
};
const capabilities = () =>
  JSON.parse(screen.getByTestId('preview-capabilities').textContent!);

it('does not grant route ownership to an ordinary local fallback', () => {
  render(() => <EntityDetail target={target} />);
  expect(capabilities()).toEqual({ owner: null, request: null });
});

it('forwards and clears explicit route ownership and repeat requests reactively', () => {
  const owner: PreviewRouteOwner = {
    blockType: 'spreadsheet',
    blockId: 'sheet-1',
  };
  const [routeOwner, setRouteOwner] = createSignal<
    PreviewRouteOwner | undefined
  >(owner);
  const [request, setRequest] = createSignal<number | string | undefined>(
    'first'
  );
  render(() => (
    <EntityDetail
      target={target}
      routeOwner={routeOwner()}
      navigationRequest={request()}
    />
  ));
  expect(capabilities()).toEqual({ owner, request: 'first' });
  setRequest('repeat');
  expect(capabilities()).toEqual({ owner, request: 'repeat' });
  setRouteOwner(undefined);
  setRequest(undefined);
  expect(capabilities()).toEqual({ owner: null, request: null });
});

it.each(['video', 'unknown'] as const)(
  'uses the shared %s detail exactly once with standalone chrome in non-route hosts',
  async (fileType) => {
    render(() => (
      <Suspense>
        <EntityDetail target={{ type: 'document', id: 'file', fileType }} />
      </Suspense>
    ));
    expect((await screen.findByTestId('file-header')).textContent).toBe('file');
    expect(screen.getAllByTestId(`shared-${fileType}`)).toHaveLength(1);
    expect(mocks.detailMounts).toHaveBeenCalledExactlyOnceWith(
      fileType,
      'file'
    );
    expect(mocks.commands).toHaveBeenCalledOnce();
    expect(mocks.commands.mock.calls[0][0].id()).toBe('file');
  }
);

it.each(['video', 'unknown'] as const)(
  'keeps route-supplied %s chrome without mounting a second file host',
  async (fileType) => {
    render(() => (
      <EntityDetail target={{ type: 'document', id: 'file', fileType }}>
        {() => <header data-testid="drive-header">Drive breadcrumb</header>}
      </EntityDetail>
    ));
    expect(await screen.findByTestId('drive-header')).toBeTruthy();
    expect(screen.queryByTestId('file-header')).toBeNull();
    expect(screen.getAllByTestId(`shared-${fileType}`)).toHaveLength(1);
    expect(mocks.detailMounts).toHaveBeenCalledExactlyOnceWith(
      fileType,
      'file'
    );
    expect(mocks.commands).not.toHaveBeenCalled();
  }
);
