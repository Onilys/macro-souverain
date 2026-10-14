import { DocumentTitleHoverCard } from '@app/components/entity-detail/DocumentTitleHoverCard';
import type { FileDetailContext } from '@app/components/entity-detail/file-detail-context';
import { getFileDocumentBlob } from '@app/features/drive-view/queries/file-document';
import { documentDownloadName } from '@app/features/drive-view/util/document-download-name';
import { SidePanel } from '@components/app/side-panel';
import {
  type FileOperation,
  SplitFileMenu,
} from '@components/app/split-layout/components/SplitFileMenu';
import {
  SplitHeaderLeft,
  SplitHeaderRight,
} from '@components/app/split-layout/components/SplitHeader';
import {
  SplitHeaderBadge,
  SplitTitleFileMenu,
  StaticSplitLabel,
} from '@components/app/split-layout/components/SplitLabel';
import {
  getPermissions,
  hasPermissions,
  Permissions,
} from '@core/component/SharePermissions';
import { toast } from '@core/component/Toast/Toast';
import {
  getShareDrawerRecipientInput,
  ShareTrigger,
} from '@core/component/TopBar/ShareButton';
import { useShareModal } from '@core/component/TopBar/shareModal';
import { downloadFile } from '@filesystem/download';
import IconShared from '@icon/share.svg';
import Download from '@phosphor/download.svg';
import Spinner from '@phosphor/spinner.svg';
import { createCallback } from '@solid-primitives/rootless';
import { createSignal, Show } from 'solid-js';

export function TopBar(props: {
  documentId: string;
  context: FileDetailContext<unknown>;
}) {
  const metadata = () => props.context.documentMetadata;
  const name = () => metadata().documentName || 'Untitled';
  const permissions = () => getPermissions(props.context.userAccessLevel);
  const canEdit = () => hasPermissions(permissions(), Permissions.CAN_EDIT);
  const canComment = () =>
    hasPermissions(permissions(), Permissions.CAN_COMMENT);
  const openShare = useShareModal(() => ({
    id: props.documentId,
    blockAlias: 'video',
    permissionOptions: { edit: false },
    itemType: 'document',
    name: name(),
    userPermissions: permissions(),
    owner: metadata().owner,
  }));
  const downloadDocument = createCallback(async () => {
    const fileName = documentDownloadName(metadata());
    const [progress, setProgress] = createSignal({ loaded: 0, total: 0 });
    const toastId = toast.custom(
      {
        title: `Downloading ${fileName}`,
        icon: () => <Spinner class="text-accent size-5 animate-spin" />,
        color: 'var(--color-accent)',
        content: () => <DownloadProgressBar progress={progress()} />,
      },
      { persistent: true }
    );
    try {
      const blob = await getFileDocumentBlob(
        {
          documentId: props.documentId,
          documentVersionId: metadata().documentVersionId,
        },
        { onProgress: setProgress }
      );
      toast.dismiss(toastId);
      const { saved } = await downloadFile(blob, fileName);
      if (saved) toast.success(`Downloaded ${fileName}`);
    } catch (error) {
      toast.dismiss(toastId);
      console.error('error downloading file', error);
      toast.failure('Error downloading file');
    }
  });
  const ops: FileOperation[] = [
    { op: 'rename' },
    { op: 'copy' },
    { op: 'moveToProject' },
    {
      group: 'file',
      label: 'Download',
      icon: Download,
      action: downloadDocument,
    },
    { op: 'delete' },
  ];
  const tools = [
    {
      group: 'sharing' as const,
      label: 'Share',
      icon: IconShared,
      action: openShare,
      focusTarget: getShareDrawerRecipientInput,
    },
  ];
  return (
    <>
      <SplitHeaderLeft>
        <DocumentTitleHoverCard
          documentId={props.documentId}
          name={name()}
          ownerId={metadata().owner}
          createdAt={metadata().createdAt}
          updatedAt={metadata().updatedAt}
        >
          <StaticSplitLabel label={name()} iconType="video" colorIcon />
        </DocumentTitleHoverCard>
      </SplitHeaderLeft>
      <SplitHeaderRight>
        <Show when={!canEdit()}>
          <SplitHeaderBadge
            text={canComment() ? 'comment only' : 'viewer'}
            tooltip={canComment() ? 'Comment Only' : 'View Only'}
          />
        </Show>
        <SidePanel.HeaderActionsOutlet />
        <ShareTrigger
          id={props.documentId}
          blockType="video"
          onClick={openShare}
        />
        <SidePanel.Toggle />
      </SplitHeaderRight>
      <SplitTitleFileMenu>
        <SplitFileMenu
          id={props.documentId}
          name={name()}
          itemType="document"
          entityKind="video"
          permissions={permissions()}
          ops={ops}
          tools={tools}
        />
      </SplitTitleFileMenu>
    </>
  );
}

const SIZE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

function formatBytes(bytes: number): string {
  if (bytes <= 0) return '0 B';
  const exp = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    SIZE_UNITS.length - 1
  );
  const value = bytes / 1024 ** exp;
  const decimals = exp === 0 || value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(decimals)} ${SIZE_UNITS[exp]}`;
}

function DownloadProgressBar(props: {
  progress: { loaded: number; total: number };
}) {
  const hasTotal = () => props.progress.total > 0;
  const percent = () =>
    hasTotal()
      ? Math.min(
          100,
          Math.round((props.progress.loaded / props.progress.total) * 100)
        )
      : 0;

  return (
    <div class="space-y-1">
      <div class="h-1 w-full bg-edge rounded-full overflow-hidden">
        <div
          class="h-full bg-accent transition-[width] duration-150 ease-linear"
          classList={{ 'animate-pulse w-full': !hasTotal() }}
          style={hasTotal() ? { width: `${percent()}%` } : undefined}
        />
      </div>
      <div class="text-xs text-ink-extra-muted">
        {hasTotal() ? `${percent()}% — ` : ''}
        {formatBytes(props.progress.loaded)}
        {hasTotal() ? ` of ${formatBytes(props.progress.total)}` : ''}
      </div>
    </div>
  );
}
