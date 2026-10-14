import { HotkeyScope, useHotkeyScope } from '@core/hotkey/HotkeyScope';
import { cleanup, fireEvent, render } from '@solidjs/testing-library';
import { createSignal, type JSX, onCleanup, onMount } from 'solid-js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PreviewPanel,
  type PreviewPanelProps,
  useMaybePreviewPanel,
} from './PreviewPanel';
import { previewOwnsRoute } from './preview-panel-context';
import {
  type PreviewBlockTarget,
  type PreviewPanelSelection,
  previewBlockTarget,
  previewSelectionFromTarget,
} from './previewTarget';

vi.mock('@components/app/GlobalAppState', () => ({
  useGlobalBlockOrchestrator: () => undefined,
}));
vi.mock('@app/features/next-soup/utils', () => ({
  getChannelEntityTarget: () => undefined,
  getDocumentCommentTarget: () => undefined,
  calendarViewTargetForEntity: () => undefined,
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
vi.mock('@app/features/drive-view/views/VideoDetail', () => ({
  VideoDetail: () => null,
}));
vi.mock('@app/features/drive-view/views/UnknownDetail', () => ({
  UnknownDetail: () => null,
}));
vi.mock('@channel/Channel/ChannelDetail', () => ({
  ChannelDetail: () => null,
  ChannelDetailTopBar: () => null,
}));
const mocks = vi.hoisted(() => ({
  mounts: vi.fn(),
  unmounts: vi.fn(),
  imageMounts: vi.fn(),
  imageUnmounts: vi.fn(),
  featureMounts: vi.fn(),
  featureUnmounts: vi.fn(),
  videoEnabled: true,
  prSummaryEnabled: true,
}));

vi.mock('@core/constant/featureFlags', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@core/constant/featureFlags')>()),
  get ENABLE_VIDEO_BLOCK() {
    return mocks.videoEnabled;
  },
  get USE_MACRO_PR_SUMMARY_BLOCK() {
    return mocks.prSummaryEnabled;
  },
}));
vi.mock('@core/hotkey/hotkeys', () => ({
  useHotkeyDOMScope: () => [() => {}, 'preview-scope'],
}));
vi.mock('./split-layout/components/PriorityCollapseOverflowSensor', () => ({
  createPriorityCollapseController: () => ({
    setRow: () => {},
    collapser: {},
  }),
  PriorityCollapseOverflowSensor: () => null,
}));
vi.mock('@app/features/block-image/ImageBlock', () => ({
  ImageBlock: (props: {
    documentId: string;
    children?: (context: unknown, content: JSX.Element) => JSX.Element;
  }) => {
    onMount(mocks.imageMounts);
    onCleanup(mocks.imageUnmounts);
    const preview = useMaybePreviewPanel();
    const content = (
      <div>
        <span data-testid="image">{props.documentId}</span>
        <span data-testid="selection">{preview?.previewEntity()?.id}</span>
        <span data-testid="hotkey-scope">{useHotkeyScope()}</span>
        <input aria-label="Image preview focus" />
      </div>
    );
    return (
      props.children?.(
        {
          documentId: props.documentId,
          data: {},
          documentMetadata: { documentId: props.documentId },
          userAccessLevel: 'view',
          download: () => {},
        },
        content
      ) ?? content
    );
  },
}));
vi.mock('@app/components/entity-detail/FileEntityDetail', () => ({
  FileEntityDetail: (props: {
    content: JSX.Element;
    children?: (context: unknown) => JSX.Element;
  }) => (
    <>
      {props.children?.({})}
      {props.content}
    </>
  ),
}));
vi.mock('@app/features/block-image/ImageBlockTopBar', () => ({
  ImageBlockTopBar: () => null,
}));
vi.mock('./side-panel', () => ({
  SidePanel: { Root: (props: { children: unknown }) => props.children },
}));

function FeaturePreviewMock(props: { kind: string; id: string }) {
  const preview = useMaybePreviewPanel();
  const kind = props.kind;
  const id = props.id;
  onMount(() => mocks.featureMounts(kind, id));
  onCleanup(() => mocks.featureUnmounts(kind, id));
  return (
    <div>
      <span data-testid="feature">
        {props.kind}:{props.id}
      </span>
      <span data-testid="feature-request">{preview?.navigationRequest()}</span>
      <span data-testid="feature-scope">{useHotkeyScope()}</span>
      <input aria-label="Feature draft" />
    </div>
  );
}
vi.mock('@block-pr/component/Block', () => ({
  default: (props: { foreignEntityId: string }) => (
    <FeaturePreviewMock kind="pr" id={props.foreignEntityId} />
  ),
}));
vi.mock('@app/features/routines/routine-detail', () => ({
  Routine: (props: { scheduleId: string }) => (
    <FeaturePreviewMock kind="routine" id={props.scheduleId} />
  ),
}));
vi.mock('@block-video/component/Block', () => ({
  default: (props: { documentId: string }) => (
    <FeaturePreviewMock kind="video" id={props.documentId} />
  ),
}));
vi.mock('@block-unknown/component/Block', () => ({
  default: (props: { documentId: string }) => (
    <FeaturePreviewMock kind="unknown" id={props.documentId} />
  ),
}));
afterEach(() => {
  mocks.videoEnabled = true;
  mocks.prSummaryEnabled = true;
  cleanup();
  vi.clearAllMocks();
});

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

it('does not infer a document host for unsupported direct preview types', () => {
  expect(
    previewSelectionFromTarget({
      blockType: 'chat',
      blockId: 'chat-id',
      aliasContext: undefined,
    })
  ).toBeUndefined();
  expect(
    previewSelectionFromTarget({
      blockType: 'spreadsheet',
      blockId: 'sheet-id',
      aliasContext: undefined,
    })
  ).toBeUndefined();
});

function setup(
  initial: PreviewBlockTarget,
  entity?: PreviewPanelSelection,
  routeOwner?: PreviewPanelProps['routeOwner'],
  withoutOrchestrator = false
) {
  const [target, setTarget] = createSignal(initial);
  const [selectedEntity, setSelectedEntity] = createSignal(entity);
  const [navigationRequest, setNavigationRequest] = createSignal(0);
  let preview: ReturnType<typeof useMaybePreviewPanel>;
  const createBlockInstance = vi.fn((type: string, id: string) => ({
    type,
    id,
    element: () => {
      onMount(mocks.mounts);
      onCleanup(mocks.unmounts);
      preview = useMaybePreviewPanel();
      return (
        <div>
          <span data-testid="block">{id}</span>
          <span data-testid="selection">{preview?.previewEntity()?.id}</span>
          <span data-testid="hotkey-scope">{useHotkeyScope()}</span>
          <input aria-label="Message draft" />
        </div>
      );
    },
  }));
  const getBlockHandle = vi.fn();
  const orchestrator = {
    isBlockMounted: () => false,
    createBlockInstance,
    getBlockHandle,
  } as unknown as PreviewPanelProps['orchestrator'];
  const onFocusOut = vi.fn();
  const view = render(() => (
    <HotkeyScope scope="outer-split-scope">
      <PreviewPanel
        target={target()}
        selectedEntity={selectedEntity()}
        routeOwner={routeOwner}
        navigationRequest={navigationRequest()}
        orchestrator={withoutOrchestrator ? undefined : orchestrator}
        splitPanelContext={{} as PreviewPanelProps['splitPanelContext']}
        onFocusOut={onFocusOut}
      />
    </HotkeyScope>
  ));
  return {
    ...view,
    setTarget,
    setSelectedEntity,
    requestNavigation: () => setNavigationRequest((count) => count + 1),
    previewEntity: () => preview?.previewEntity(),
    previewTarget: () => preview?.previewTarget(),
    previewRequest: () => preview?.navigationRequest(),
    ownsRoute: (type: PreviewBlockTarget['blockType'], id: string) =>
      previewOwnsRoute(preview, type, id),
    createBlockInstance,
    getBlockHandle,
    onFocusOut,
  };
}

const channel = (
  id: string,
  params?: Record<string, string>
): PreviewBlockTarget => ({
  blockType: 'channel',
  blockId: id,
  aliasContext: undefined,
  params,
});

describe('preview block navigation', () => {
  it('keeps local previews unowned and requires matching feature and entity', () => {
    const local = setup(channel('channel-1'));
    expect(local.ownsRoute('channel', 'channel-1')).toBe(false);
    local.unmount();
    const route = setup(channel('channel-1'), undefined, {
      blockType: 'channel',
      blockId: 'channel-1',
    });
    expect(route.ownsRoute('channel', 'channel-1')).toBe(true);
    expect(route.ownsRoute('chat', 'channel-1')).toBe(false);
    expect(route.ownsRoute('channel', 'channel-2')).toBe(false);
  });

  it('does not relocate or remount when the same target arrives as a fresh object', async () => {
    const view = setup(channel('channel-1', { channel_message_id: 'm-1' }));
    await flush();
    expect(view.getByTestId('hotkey-scope').textContent).toBe('preview-scope');
    const draft = view.getByLabelText('Message draft');
    fireEvent.input(draft, { target: { value: 'Unsent draft' } });
    expect(view.getBlockHandle).not.toHaveBeenCalled();
    expect(view.previewTarget()?.params).toEqual({ channel_message_id: 'm-1' });

    // Hosts recompute targets from cache revisions unrelated to this block.
    view.setTarget(channel('channel-1', { channel_message_id: 'm-1' }));
    view.setTarget(channel('channel-1', { channel_message_id: 'm-1' }));
    await flush();

    expect(view.getBlockHandle).not.toHaveBeenCalled();
    expect(view.createBlockInstance).toHaveBeenCalledTimes(1);
    expect(mocks.mounts).toHaveBeenCalledTimes(1);
    expect(mocks.unmounts).not.toHaveBeenCalled();
    expect(view.getByLabelText('Message draft')).toBe(draft);
    expect((draft as HTMLInputElement).value).toBe('Unsent draft');
  });

  it('preserves focus ownership after interacting with a refreshed preview', () => {
    const view = setup(channel('channel-1'));
    const draft = view.getByLabelText('Message draft');
    fireEvent.pointerDown(draft);
    view.setTarget(channel('channel-1'));
    fireEvent.focusIn(draft);
    expect(view.onFocusOut).not.toHaveBeenCalled();
  });

  it('exposes an untargeted local preview without requesting a handle', () => {
    const view = setup(channel('channel-1'));
    expect(view.previewTarget()?.params).toBeUndefined();
    expect(view.getBlockHandle).not.toHaveBeenCalled();
  });

  it('creates a new block when selecting another channel', async () => {
    const view = setup(channel('channel-1'));
    view.setTarget(channel('channel-2'));
    await flush();
    expect(view.createBlockInstance).toHaveBeenCalledTimes(2);
    expect(view.getBlockHandle).not.toHaveBeenCalled();
    expect(view.getByTestId('block').textContent).toBe('channel-2');
  });

  it('relocates within the same block without remounting it', async () => {
    const view = setup(
      channel('channel-1', {
        channel_message_id: 't-1',
        channel_thread_id: 't-1',
      })
    );
    view.setTarget(
      channel('channel-1', {
        channel_message_id: 't-2',
        channel_thread_id: 't-2',
      })
    );
    await flush();
    expect(view.previewTarget()?.params).toEqual({
      channel_message_id: 't-2',
      channel_thread_id: 't-2',
    });
    expect(view.createBlockInstance).toHaveBeenCalledTimes(1);
    expect(mocks.mounts).toHaveBeenCalledTimes(1);
  });

  it('re-aims the same block on an explicit request without remounting', async () => {
    const view = setup(channel('channel-1', { channel_message_id: 'm-1' }));
    await flush();
    expect(view.previewRequest()).toBe(0);

    view.requestNavigation();
    await flush();
    expect(view.previewRequest()).toBe(1);
    expect(view.createBlockInstance).toHaveBeenCalledTimes(1);
    expect(mocks.mounts).toHaveBeenCalledTimes(1);
  });

  it('keeps live selection metadata in its preview context', () => {
    const view = setup(channel('channel-1'), {
      type: 'channel',
      id: 'channel-1',
    });
    const refreshed = { type: 'channel' as const, id: 'channel-1' };
    view.setSelectedEntity(refreshed);
    expect(view.previewEntity()).toBe(refreshed);
    expect(view.getByTestId('selection').textContent).toBe('channel-1');
  });
});

const image = (id: string): PreviewBlockTarget => ({
  blockType: 'image',
  blockId: id,
  aliasContext: undefined,
});

describe('direct image previews', () => {
  it('does not require an orchestrator for an image preview', async () => {
    const view = render(() => (
      <PreviewPanel
        target={image('image-1')}
        splitPanelContext={{} as PreviewPanelProps['splitPanelContext']}
      />
    ));
    await flush();
    expect(view.getByTestId('image').textContent).toBe('image-1');
  });
  it('renders without creating a legacy instance or requesting a handle', async () => {
    const view = setup(image('image-1'));
    await flush();

    expect(view.getByTestId('image').textContent).toBe('image-1');
    expect(view.createBlockInstance).not.toHaveBeenCalled();
    expect(view.getBlockHandle).not.toHaveBeenCalled();
  });

  it('keeps the image mounted for repeated selections and navigation requests', async () => {
    const view = setup(image('image-1'));
    await flush();
    const focus = view.getByLabelText('Image preview focus');
    fireEvent.pointerDown(focus);
    view.setTarget(image('image-1'));
    view.requestNavigation();
    await flush();

    expect(view.getByLabelText('Image preview focus')).toBe(focus);
    expect(mocks.imageMounts).toHaveBeenCalledTimes(1);
    expect(mocks.imageUnmounts).not.toHaveBeenCalled();
    expect(view.createBlockInstance).not.toHaveBeenCalled();
    expect(view.getBlockHandle).not.toHaveBeenCalled();
  });

  it('passes live selection metadata to the direct image host', async () => {
    const selection: PreviewPanelSelection = {
      type: 'document',
      id: 'image-1',
      fileType: 'png',
    };
    const view = setup(image('image-1'), selection);
    await flush();

    expect(view.getByTestId('selection').textContent).toBe('image-1');
    view.setSelectedEntity({ ...selection, id: 'selected-image' });
    expect(view.getByTestId('selection').textContent).toBe('selected-image');
  });

  it('disposes the image host when selecting a remaining legacy feature', async () => {
    const view = setup(image('image-1'));
    await flush();
    view.setTarget(channel('channel-1'));
    await flush();

    expect(mocks.imageUnmounts).toHaveBeenCalledTimes(1);
    expect(view.queryByTestId('image')).toBeNull();
    expect(view.createBlockInstance).toHaveBeenCalledTimes(1);
    expect(view.createBlockInstance).toHaveBeenCalledWith(
      'channel',
      'channel-1',
      expect.any(Object)
    );
  });
});

describe('feature-owned previews', () => {
  it('disposes the previous host when switching between direct and legacy features', async () => {
    const target = {
      blockType: 'pr' as const,
      blockId: 'shared',
      aliasContext: undefined,
    };
    const view = setup(target);
    await flush();
    const draft = await view.findByLabelText('Feature draft');

    view.setTarget({ ...target, blockType: 'video' });
    await flush();
    expect((await view.findByTestId('feature')).textContent).toBe(
      'video:shared'
    );
    expect(view.getByLabelText('Feature draft')).not.toBe(draft);
    expect(mocks.featureUnmounts).toHaveBeenCalledWith('pr', 'shared');

    view.setTarget(channel('shared'));
    await flush();
    expect(view.getByTestId('block').textContent).toBe('shared');
    expect(mocks.featureUnmounts).toHaveBeenCalledWith('video', 'shared');
    expect(view.createBlockInstance).toHaveBeenCalledTimes(1);

    view.setTarget({ ...target, blockType: 'unknown' });
    await flush();
    expect((await view.findByTestId('feature')).textContent).toBe(
      'unknown:shared'
    );
    expect(view.queryByTestId('block')).toBeNull();
    expect(mocks.unmounts).toHaveBeenCalledOnce();
    expect(view.createBlockInstance).toHaveBeenCalledTimes(1);
  });
  it('keeps the unknown-file fallback for PR previews when summaries are disabled', async () => {
    mocks.prSummaryEnabled = false;
    const selection: PreviewPanelSelection = {
      type: 'foreign',
      id: 'disabled-pr',
      foreignSource: 'github_pull_request',
    };
    const view = setup(
      previewBlockTarget(selection),
      selection,
      undefined,
      true
    );
    expect((await view.findByTestId('feature')).textContent).toBe(
      'unknown:disabled-pr'
    );
    expect(view.createBlockInstance).not.toHaveBeenCalled();
  });
  it('uses the unknown-file host when video playback is disabled', async () => {
    mocks.videoEnabled = false;
    const view = setup(
      {
        blockType: 'video',
        blockId: 'disabled-video',
        aliasContext: undefined,
      },
      undefined,
      undefined,
      true
    );
    await flush();
    expect((await view.findByTestId('feature')).textContent).toBe(
      'unknown:disabled-video'
    );
    expect(view.createBlockInstance).not.toHaveBeenCalled();
  });
  it.each(['routine', 'pr', 'video', 'unknown'] as const)(
    'keeps %s drafts for repeated navigation and disposes the previous entity',
    async (blockType) => {
      const target: PreviewBlockTarget = {
        blockType,
        blockId: 'first',
        aliasContext: undefined,
      };
      const view = setup(target, undefined, undefined, true);
      await flush();
      expect((await view.findByTestId('feature')).textContent).toBe(
        `${blockType}:first`
      );
      expect(view.getByTestId('feature-scope').textContent).toBe(
        'preview-scope'
      );
      const draft = view.getByLabelText('Feature draft') as HTMLInputElement;
      fireEvent.input(draft, { target: { value: 'Keep my draft' } });

      view.setTarget({ ...target });
      view.requestNavigation();
      await flush();
      expect(view.getByLabelText('Feature draft')).toBe(draft);
      expect(draft.value).toBe('Keep my draft');
      expect(view.getByTestId('feature-request').textContent).toBe('1');
      expect(mocks.featureMounts).toHaveBeenCalledTimes(1);
      expect(mocks.featureUnmounts).not.toHaveBeenCalled();
      expect(view.createBlockInstance).not.toHaveBeenCalled();

      view.setTarget({ ...target, blockId: 'second' });
      await flush();
      expect((await view.findByTestId('feature')).textContent).toBe(
        `${blockType}:second`
      );
      expect(view.getByLabelText('Feature draft')).not.toBe(draft);
      expect(mocks.featureUnmounts).toHaveBeenCalledWith(blockType, 'first');
      expect(mocks.featureMounts).toHaveBeenCalledTimes(2);
      view.unmount();
      expect(mocks.featureUnmounts).toHaveBeenCalledWith(blockType, 'second');
    }
  );
});
