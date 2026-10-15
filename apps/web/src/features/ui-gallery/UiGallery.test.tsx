import { MemoryRouter, Route } from '@solidjs/router';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@solidjs/testing-library';
import { type JSX, Suspense } from 'solid-js';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { DocPage } from './components/DocPage';
import { DOC_ENTRIES } from './registry';
import UiGallery from './UiGallery';

vi.mock('@components/app/split-layout/components/SplitHeader', () => ({
  SplitHeaderLeft: (props: { children: JSX.Element }) => props.children,
  SplitHeaderRight: (props: { children: JSX.Element }) => props.children,
}));

vi.mock('@components/app/split-layout/components/SplitLabel', () => ({
  StaticSplitLabel: (props: { label: string }) => <span>{props.label}</span>,
}));

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
});

afterEach(cleanup);

function renderGallery() {
  return render(() => (
    <MemoryRouter>
      <Route path="/" component={UiGallery} />
    </MemoryRouter>
  ));
}

describe('UiGallery', () => {
  it('hides page code by default and toggles all examples from the header', async () => {
    const { container } = renderGallery();
    const toggle = screen.getByRole('switch', { name: 'Show code' });

    expect((toggle as HTMLInputElement).checked).toBe(false);
    expect(container.querySelectorAll('pre')).toHaveLength(0);

    fireEvent.click(toggle);
    await waitFor(() => {
      expect(container.querySelectorAll('pre').length).toBeGreaterThan(0);
    });

    fireEvent.click(toggle);
    await waitFor(() => {
      expect(container.querySelectorAll('pre')).toHaveLength(0);
    });
  });
});

describe('DocPage suspense safety', () => {
  // The split layout wraps panel content in a <Suspense> with no fallback
  // (SplitLayout.tsx), so a resource read that is still pending detaches the
  // whole pane and renders nothing — silently, with no console error. Every
  // resource read in DocPage is gated on state for this reason.
  it('renders without suspending while its resources are still pending', () => {
    const entry = DOC_ENTRIES.find((e) => e.doc.name === 'Button');
    if (!entry) throw new Error('Button page missing');

    const { container } = render(() => (
      <Suspense fallback={<span data-testid="suspended">suspended</span>}>
        <DocPage entry={entry} showCode={false} />
      </Suspense>
    ));

    expect(container.querySelector('[data-testid="suspended"]')).toBeNull();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Button' })
    ).toBeTruthy();
  });
});
