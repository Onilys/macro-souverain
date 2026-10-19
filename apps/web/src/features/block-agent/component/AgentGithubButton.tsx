import { openExternalUrl } from '@core/util/url';
import ArrowSquareOut from '@phosphor/arrow-square-out.svg';
import { Button } from '@ui';

/** Header link to the session's pull request on GitHub. */
export function AgentGithubButton(props: { url: string }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      tooltip="Open the pull request on GitHub"
      class="h-7 gap-1.5"
      onClick={() => openExternalUrl(props.url)}
    >
      <ArrowSquareOut class="size-3.5" />
      <span>GitHub</span>
    </Button>
  );
}
