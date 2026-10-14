import { cleanup, fireEvent, render } from '@solidjs/testing-library';
import { createSignal } from 'solid-js';
import { afterEach, expect, it } from 'vitest';
import { CanvasMediaContent } from './media-content';

afterEach(cleanup);

it('keeps the shared skeleton until the image loads, including after a source change', () => {
  const [url, setUrl] = createSignal<string>();
  const view = render(() => (
    <div style={{ width: '320px', height: '180px' }}>
      <CanvasMediaContent
        url={url()}
        type="image"
        name="Photo"
        playing={false}
        onStop={() => {}}
      />
    </div>
  ));
  const skeleton = () =>
    view.container.querySelector('.skeleton-shimmer.bg-skeleton');
  expect(skeleton()).not.toBeNull();
  setUrl('/photo.png');
  expect(skeleton()).not.toBeNull();
  fireEvent.load(view.getByAltText('Photo'));
  expect(skeleton()).toBeNull();
  expect(view.getByAltText('Photo').classList.contains('invisible')).toBe(
    false
  );
  setUrl('/next-photo.png');
  expect(skeleton()).not.toBeNull();
  fireEvent.load(view.getByAltText('Photo'));
  expect(skeleton()).toBeNull();
});

it('replaces failed image loading with an error and can load a new source', () => {
  const [url, setUrl] = createSignal('/missing.png');
  const view = render(() => (
    <CanvasMediaContent
      url={url()}
      type="image"
      name="Photo"
      playing={false}
      onStop={() => {}}
    />
  ));
  fireEvent.error(view.getByAltText('Photo'));
  expect(view.getByText('Media unavailable')).toBeTruthy();
  expect(view.container.querySelector('.skeleton-shimmer')).toBeNull();
  setUrl('/valid.png');
  expect(view.container.querySelector('.skeleton-shimmer')).not.toBeNull();
  fireEvent.load(view.getByAltText('Photo'));
  expect(view.queryByText('Media unavailable')).toBeNull();
});
