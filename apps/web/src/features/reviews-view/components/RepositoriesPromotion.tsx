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
  useReauthenticateGithubMutation,
} from '@queries/auth';
import { Show } from 'solid-js';
import { match } from 'ts-pattern';

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
  const reauthenticateGithub = useReauthenticateGithubMutation();
  // Gate the status read so a pending query never suspends the sidebar.
  const status = () =>
    githubLink.isSuccess ? (githubLink.data?.status ?? 'unlinked') : 'unlinked';

  // Settings → GitHub runs the same two grants; an expired link must be
  // reauthenticated rather than linked again.
  const authorize = async (reconnect: boolean) => {
    try {
      await authorizeGithub(
        (callbackUrl) =>
          reconnect
            ? reauthenticateGithub.mutateAsync(callbackUrl)
            : initGithubLink.mutateAsync(callbackUrl),
        reconnect ? 'Failed to reconnect GitHub' : 'Failed to connect GitHub'
      );
    } catch {
      toast.failure(
        reconnect
          ? 'Failed to start GitHub reconnect flow'
          : 'Failed to start GitHub connect flow'
      );
    }
  };

  const action = () =>
    match(status())
      .with('linked', () => ({
        label: COPY.action,
        onClick: () =>
          window.open(GITHUB_APP_INSTALL_URL, '_blank', 'noopener'),
      }))
      .with('reauthentication_required', () => ({
        label: COPY.reconnectAction,
        onClick: () => void authorize(true),
      }))
      .otherwise(() => ({
        label: COPY.connectAction,
        onClick: () => void authorize(false),
      }));

  return (
    <Show when={promotions().enabled && githubLink.isSuccess}>
      <SidebarPromotion
        id={COPY.id}
        logos={COPY.logos}
        headline={COPY.headline}
        pitch={COPY.pitch}
        class={props.class}
        dismissLabel={`Dismiss ${COPY.headline.toLowerCase()}`}
        action={action()}
      />
    </Show>
  );
}
