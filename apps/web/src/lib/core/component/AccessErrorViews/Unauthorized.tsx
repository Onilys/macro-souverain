import { useIsAuthenticated } from '@core/auth';
import { useEmail } from '@core/context/user';
import NoAccessGraphic from '@design/empty-state-no-access.svg';
import { EmptyStatePanel } from '@ui';
import { onMount, type ParentProps, Show } from 'solid-js';
import { openLoginModal } from '../TopBar/LoginButton';

/**
 * @description This is the view for when a user tries to access an item that returns a 401 indicating they do not have permission to access it.
 */
export default function Unauthorized(
  props: ParentProps<{
    /** Name of the item, so a shared link says what it points at. */
    itemName?: string;
  }>
) {
  const currentUserEmail = useEmail();

  const isAuthenticated = useIsAuthenticated();
  onMount(() => {
    if (!isAuthenticated()) {
      openLoginModal();
    }
  });

  // Keep the description absent entirely when there is nothing to say, so the
  // panel does not reserve its spacing for an empty paragraph.
  const description = () =>
    props.itemName || currentUserEmail() ? (
      <>
        <Show when={props.itemName}>
          {(name) => (
            <span class="line-clamp-3 block break-words font-medium text-ink">
              {name()}
            </span>
          )}
        </Show>
        <Show when={currentUserEmail()}>
          {(email) => <span class="block">Signed in as {email()}</span>}
        </Show>
      </>
    ) : undefined;

  return (
    <EmptyStatePanel
      centered
      graphic={NoAccessGraphic}
      graphicClass="mb-6"
      title="You don't have access to this file"
      description={description()}
    >
      {props.children}
    </EmptyStatePanel>
  );
}
