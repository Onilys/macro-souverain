import { cleanup, render, screen, waitFor } from '@solidjs/testing-library';
import { createSignal, type ParentProps, Show, useContext } from 'solid-js';
import { Portal } from 'solid-js/web';
import { afterEach, expect, it } from 'vitest';
import {
  createLayoutRefs,
  SplitPanelContext,
  type SplitPanelContextType,
} from './context';

afterEach(cleanup);

function HeaderLeft(props: ParentProps) {
  const ctx = useContext(SplitPanelContext);
  if (!ctx) throw new Error('missing panel');
  return (
    <Show when={ctx.layoutRefs.headerLeft}>
      <Portal
        mount={ctx.layoutRefs.headerLeft}
        ref={(div) => {
          div.style.display = 'contents';
        }}
      >
        {props.children}
      </Portal>
    </Show>
  );
}

it('attaches header content after the portal mount node appears', async () => {
  const layoutRefs = createLayoutRefs();
  const [ready, setReady] = createSignal(false);
  render(() => (
    <SplitPanelContext.Provider
      value={{ layoutRefs } as unknown as SplitPanelContextType}
    >
      <HeaderLeft>
        <button type="button">DMs</button>
      </HeaderLeft>
      <Show when={ready()}>
        <div
          data-testid="header-left"
          ref={(element) => {
            layoutRefs.headerLeft = element;
          }}
        />
      </Show>
    </SplitPanelContext.Provider>
  ));

  expect(screen.queryByRole('button', { name: 'DMs' })).toBeNull();
  setReady(true);
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'DMs' })).toBeTruthy()
  );
  expect(
    screen
      .getByTestId('header-left')
      .contains(screen.getByRole('button', { name: 'DMs' }))
  ).toBe(true);
});
