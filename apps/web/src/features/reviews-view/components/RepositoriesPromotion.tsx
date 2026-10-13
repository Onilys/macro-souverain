import { PULL_REQUEST_REPOSITORIES_PROMOTION as COPY } from '@app/features/sidebar-promotion/core/promotions';
import { SidebarPromotion } from '@app/features/sidebar-promotion/sidebar-promotion';
import { useFeatureFlag } from '@app/lib/analytics/posthog';
import { authorizeGithub } from '@core/auth/authorize-github';
import { toast } from '@core/component/Toast/Toast';
import { enableSidebarPromotions } from '@core/constant/featureFlags';
import { SERVER_HOSTS } from '@core/constant/servers';
import {
  useGithubLinkStatusQuery,
  useInitGithubLinkMutation,
} from '@queries/auth';
import { Show } from 'solid-js';

/** The GitHub App install page, where orgs and repositories are chosen. */
const GITHUB_APP_INSTALL_URL = `${SERVER_HOSTS['document-storage-service']}/github/install-sync`;

/**
 * The Pull requests sidebar's prompt to sync more GitHub orgs and
 * repositories. The app install callback needs a linked account, so until
 * one exists the card links the account first, like Settings → GitHub.
 */
export function RepositoriesPromotion(props: { class?: string }) {
  const promotions = useFeatureFlag(enableSidebarPromotions);
  const githubLink = useGithubLinkStatusQuery({
    enabled: () => promotions().enabled,
  });
  const initGithubLink = useInitGithubLinkMutation();
  // Gate the status read so a pending query never suspends the sidebar.
  const linked = () =>
    githubLink.isSuccess && githubLink.data?.status === 'linked';

  const connectGithub = async () => {
    try {
      await authorizeGithub(
        (callbackUrl) => initGithubLink.mutateAsync(callbackUrl),
        'Failed to connect GitHub'
      );
    } catch {
      toast.failure('Failed to start GitHub connect flow');
    }
  };

  return (
    <Show when={promotions().enabled && githubLink.isSuccess}>
      <SidebarPromotion
        id={COPY.id}
        logos={COPY.logos}
        headline={COPY.headline}
        pitch={COPY.pitch}
        class={props.class}
        dismissLabel={`Dismiss ${COPY.headline.toLowerCase()}`}
        action={{
          label: linked() ? COPY.action : COPY.connectAction,
          onClick: () => {
            if (linked())
              window.open(GITHUB_APP_INSTALL_URL, '_blank', 'noopener');
            else void connectGithub();
          },
        }}
      />
    </Show>
  );
}
