import { DocumentTitleHoverCard } from '@app/components/entity-detail/DocumentTitleHoverCard';
import type { FileDetailContext } from '@app/components/entity-detail/file-detail-context';
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
import {
  getShareDrawerRecipientInput,
  ShareTrigger,
} from '@core/component/TopBar/ShareButton';
import IconShared from '@icon/share.svg';
import { Show } from 'solid-js';

export function TopBar(props: {
  documentId: string;
  context: FileDetailContext<unknown>;
  onShare: () => void;
}) {
  const metadata = () => props.context.documentMetadata;
  const name = () => metadata().documentName || 'Untitled';
  const permissions = () => getPermissions(props.context.userAccessLevel);
  const canEdit = () => hasPermissions(permissions(), Permissions.CAN_EDIT);
  const canComment = () =>
    hasPermissions(permissions(), Permissions.CAN_COMMENT);
  const ops: FileOperation[] = [
    { op: 'rename' },
    { op: 'copy' },
    { op: 'moveToProject' },
    ...(props.context.operations ?? []),
    { op: 'delete' },
  ];
  const tools = [
    {
      group: 'sharing' as const,
      label: 'Share',
      icon: IconShared,
      action: props.onShare,
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
          <StaticSplitLabel
            label={name()}
            iconType="unknown"
            badges={
              <span class="text-xxs text-ink-muted uppercase">
                {metadata().fileType}
              </span>
            }
          />
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
          blockType="unknown"
          onClick={props.onShare}
        />
        <SidePanel.Toggle />
      </SplitHeaderRight>
      <SplitTitleFileMenu>
        <SplitFileMenu
          id={props.documentId}
          name={name()}
          itemType="document"
          entityKind="unknown"
          permissions={permissions()}
          ops={ops}
          tools={tools}
        />
      </SplitTitleFileMenu>
    </>
  );
}
