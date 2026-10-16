import { cleanup, fireEvent, render } from '@solidjs/testing-library';
import { afterEach, expect, it, vi } from 'vitest';
import { CanvasInsertRadialMenu } from './insert-radial-menu';

afterEach(cleanup);
it('offers only media, direct upload, and reference, with Ctrl+J/K navigation', () => {
  const media = vi.fn(),
    upload = vi.fn(),
    reference = vi.fn();
  const view = render(() => (
    <CanvasInsertRadialMenu
      center={{ x: 160, y: 128 }}
      onMedia={media}
      onUpload={upload}
      onReference={reference}
    />
  ));
  const choices = view.getAllByRole('menuitem');
  expect(choices).toHaveLength(3);
  const first = view.getByRole('menuitem', { name: 'Media' });
  first.focus();
  fireEvent.keyDown(first, { key: 'j', ctrlKey: true });
  expect(document.activeElement).toBe(
    view.getByRole('menuitem', { name: 'Upload media' })
  );
  fireEvent.keyDown(document.activeElement!, { key: 'j', ctrlKey: true });
  expect(document.activeElement).toBe(
    view.getByRole('menuitem', { name: 'Reference' })
  );
  fireEvent.keyDown(document.activeElement!, { key: 'k', ctrlKey: true });
  expect(document.activeElement).toBe(
    view.getByRole('menuitem', { name: 'Upload media' })
  );
  fireEvent.click(view.getByRole('menuitem', { name: 'Upload media' }));
  expect(upload).toHaveBeenCalledOnce();
  expect(media).not.toHaveBeenCalled();
  expect(reference).not.toHaveBeenCalled();
});

it('selects by direction in the gaps and highlights the matching ring slice', () => {
  const media = vi.fn(),
    upload = vi.fn(),
    reference = vi.fn();
  const view = render(() => (
    <CanvasInsertRadialMenu
      center={{ x: 160, y: 128 }}
      onMedia={media}
      onUpload={upload}
      onReference={reference}
    />
  ));
  const menu = view.getByRole('menu');
  vi.spyOn(menu, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    width: 320,
    height: 256,
  } as DOMRect);
  const point = (x: number, y: number) =>
    fireEvent(
      menu.parentElement!,
      new MouseEvent('pointermove', { bubbles: true, clientX: x, clientY: y })
    );
  point(900, 128);
  expect(
    view
      .getByRole('menuitem', { name: 'Upload media' })
      .hasAttribute('data-highlighted')
  ).toBe(true);
  expect(menu.querySelectorAll('circle')[1].hasAttribute('data-active')).toBe(
    true
  );
  fireEvent.click(menu.parentElement!, { clientX: 900, clientY: 128 });
  expect(upload).toHaveBeenCalledOnce();
  point(20, 128);
  expect(
    view
      .getByRole('menuitem', { name: 'Reference' })
      .hasAttribute('data-highlighted')
  ).toBe(true);
  expect(menu.querySelectorAll('circle')[2].hasAttribute('data-active')).toBe(
    true
  );
  fireEvent.keyDown(document.activeElement!, { key: 'Enter' });
  expect(reference).toHaveBeenCalledOnce();
  point(160, 128);
  expect(menu.querySelector('[data-highlighted]')).toBeNull();
  expect(menu.querySelector('circle[data-active]')).toBeNull();
  fireEvent.click(menu, { clientX: 160, clientY: 128 });
  expect(media).not.toHaveBeenCalled();
  expect(upload).toHaveBeenCalledOnce();
  expect(reference).toHaveBeenCalledOnce();
});
