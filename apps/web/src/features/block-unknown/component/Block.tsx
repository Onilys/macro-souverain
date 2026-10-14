import type { UnknownDetailContext } from '@app/features/drive-view/views/UnknownDetail';
import { UnknownDetail } from '@app/features/drive-view/views/UnknownDetail';
import { useBlockEntityCommands } from '@app/features/next-soup/actions';
import { SidePanel } from '@components/app/side-panel';
import { getPermissions } from '@core/component/SharePermissions';
import { useShareModal } from '@core/component/TopBar/shareModal';
import { HotkeyScope, useHotkeyScopeOrCreate } from '@core/hotkey/HotkeyScope';
import { TopBar } from './TopBar';

function UnknownHeader(props: {
  documentId: string;
  context: UnknownDetailContext;
}) {
  const openShare = useShareModal(() => ({
    id: props.documentId,
    blockAlias: 'unknown',
    itemType: 'document',
    name: props.context.documentMetadata.documentName,
    userPermissions: getPermissions(props.context.userAccessLevel),
    owner: props.context.documentMetadata.owner,
  }));
  return (
    <TopBar
      documentId={props.documentId}
      context={props.context}
      onShare={openShare}
    />
  );
}

/** Standalone chrome around the same file detail used by Drive. */
export default function BlockUnknown(props: { documentId: string }) {
  const [attachHotkeyScope, hotkeyScope] = useHotkeyScopeOrCreate('unknown');
  useBlockEntityCommands({
    id: () => props.documentId,
    scopeId: () => hotkeyScope,
  });
  return (
    <HotkeyScope scope={hotkeyScope}>
      <div ref={attachHotkeyScope} class="size-full">
        <SidePanel.Root floating persistKey={`unknown:${props.documentId}`}>
          <UnknownDetail documentId={props.documentId}>
            {(context) => (
              <UnknownHeader documentId={props.documentId} context={context} />
            )}
          </UnknownDetail>
        </SidePanel.Root>
      </div>
    </HotkeyScope>
  );
}
