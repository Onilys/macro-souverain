import { ConnectorImportPromotion } from '@app/features/connector-import/connector-import';
import { useFeatureFlag } from '@app/lib/analytics/posthog';
import { enableSlackArchiveImport } from '@core/constant/featureFlags';
import FileZipIcon from '@phosphor/file-zip.svg';
import { useCurrentTeamQuery, useIsTeamAdmin } from '@queries/team/teams';
import { Show } from 'solid-js';
import { SlackImport } from './slack-import';

/**
 * The Channels rail's Slack card: the shared connector-import card, whose
 * dialog picks channels through the Slack connector and hands history
 * imports to the archive dialog.
 */
export function SlackImportSidebar() {
  const flag = useFeatureFlag(enableSlackArchiveImport);
  const team = useCurrentTeamQuery(() => flag().enabled);
  const isAdmin = useIsTeamAdmin();
  const teamId = () => (team.isSuccess ? team.data?.team.id : undefined);

  return (
    <Show when={flag().enabled && isAdmin() && teamId()}>
      {(id) => {
        let openHistory: ((opener: HTMLButtonElement) => void) | undefined;
        return (
          <>
            <SlackImport
              teamId={id()}
              isAdmin={isAdmin()}
              historyOnly
              trigger={(open) => {
                // The archive dialog has no button of its own here; the
                // card's "Import with history" option opens it.
                openHistory = open;
                return null;
              }}
            />
            <ConnectorImportPromotion
              category="channels"
              class="px-(--sidebar-gutter) py-2"
              alternatives={[
                {
                  icon: FileZipIcon,
                  label: 'Import with history',
                  description:
                    'Upload a Slack export from a workspace owner or admin.',
                  onSelect: (opener) => {
                    if (opener) openHistory?.(opener);
                  },
                },
              ]}
            />
          </>
        );
      }}
    </Show>
  );
}
