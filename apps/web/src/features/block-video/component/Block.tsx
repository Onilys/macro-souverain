import { VideoDetail } from '@app/features/drive-view/views/VideoDetail';
import { useBlockEntityCommands } from '@app/features/next-soup/actions';
import { SidePanel } from '@components/app/side-panel';
import { HotkeyScope, useHotkeyScopeOrCreate } from '@core/hotkey/HotkeyScope';
import { TopBar } from './TopBar';

/** Standalone chrome around the same file detail used by Drive. */
export default function BlockVideo(props: { documentId: string }) {
  const [attachHotkeyScope, hotkeyScope] = useHotkeyScopeOrCreate('video');
  useBlockEntityCommands({
    id: () => props.documentId,
    scopeId: () => hotkeyScope,
  });
  return (
    <HotkeyScope scope={hotkeyScope}>
      <div ref={attachHotkeyScope} class="size-full">
        <SidePanel.Root
          defaultOpen={false}
          persistKey={`video:${props.documentId}`}
          floating
        >
          <VideoDetail documentId={props.documentId}>
            {(context) => (
              <TopBar documentId={props.documentId} context={context} />
            )}
          </VideoDetail>
        </SidePanel.Root>
      </div>
    </HotkeyScope>
  );
}
