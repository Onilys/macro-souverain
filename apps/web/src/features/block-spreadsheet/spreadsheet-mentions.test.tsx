import { setCellTextCursor } from '@app/components/cell-text-editor/cell-mention-dom';
import {
  cellTextParts,
  encodeCellMention,
} from '@macro-inc/spreadsheet/cell-mentions';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@solidjs/testing-library';
import { createSignal } from 'solid-js';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock(
  '@core/component/LexicalMarkdown/component/decorator/DocumentMention',
  () => ({ DocumentMention: () => 'document mention' })
);
vi.mock(
  '@core/component/LexicalMarkdown/component/decorator/UserMention',
  () => ({ UserMention: () => 'user mention' })
);
vi.mock(
  '@core/component/LexicalMarkdown/component/menu/MentionsMenu/MentionsMenu',
  () => ({
    MentionsMenu: (props: { onPick: (item: unknown) => void }) => {
      const button = document.createElement('button');
      button.textContent = 'Tomorrow';
      button.onclick = () =>
        props.onPick({
          kind: 'date',
          id: 'date-preset-tomorrow',
          data: {
            id: 'preset-tomorrow',
            displayText: 'Tomorrow',
            date: new Date(2026, 9, 17, 23, 59, 59, 999),
            type: 'preset',
          },
        });
      return button;
    },
  })
);
vi.mock(
  '@core/component/LexicalMarkdown/component/menu/MentionsMenu/utils/entityUtils',
  () => ({ getBlockNameFromEntity: () => 'md' })
);
vi.mock(
  '@core/component/LexicalMarkdown/plugins/text-paste/textPastePlugin',
  () => ({ parseMacroAppUrl: () => ({ isValid: false }) })
);
vi.mock('./spreadsheet-cell-links', () => ({
  SpreadsheetCellLinks: (props: { value: string }) => props.value,
}));

import { linkMentions, spreadsheetMentions } from './spreadsheet-mentions';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

async function renderEditor(initial = '') {
  const [value, setValue] = createSignal(initial);
  const onPickDate = vi.fn();
  const onKeyDown = vi.fn();
  render(() =>
    spreadsheetMentions.renderEditor({
      label: 'Edit A1',
      get value() {
        return value();
      },
      class: '',
      autoFocus: true,
      onInput: setValue,
      onPickDate,
      onKeyDown,
      onBlur: vi.fn(),
    })
  );
  const editor = screen.getByRole('textbox', { name: 'Edit A1' });
  await waitFor(() => expect(document.activeElement).toBe(editor));
  const type = (text: string) => {
    editor.textContent = text;
    setCellTextCursor(editor, text.length);
    fireEvent.input(editor);
  };
  return { editor, value, onPickDate, onKeyDown, type };
}

it('turns a routine link into a rendered mention chip instead of exposing its encoding', () => {
  const value = linkMentions(
    'https://macro.com/app/routines/routine-1',
    () => ({
      block: 'routine',
      id: 'routine-1',
      params: {},
    })
  );
  expect(cellTextParts(value)[0].mention).toMatchObject({
    type: 'document',
    blockName: 'routine',
    documentId: 'routine-1',
  });
  render(() => spreadsheetMentions.renderText(value));
  expect(
    document.querySelector('[data-spreadsheet-mention]')?.textContent
  ).toBe('document mention');
  expect(document.body.textContent).not.toContain('<m-document-mention>');
});

it('renders a date pill as a relative chip with the full date as its tooltip', () => {
  const tomorrow = new Date();
  tomorrow.setHours(9, 30, 0, 0);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const due = encodeCellMention({
    type: 'date',
    date: tomorrow.toISOString(),
    displayFormat: 'Next week',
  });
  render(() => spreadsheetMentions.renderText(`Due ${due}`));
  const chip = screen.getByTitle(/9:30 AM$/);
  expect(chip.textContent).toBe('Tomorrow');
  expect(chip.getAttribute('data-date')).toBe(tomorrow.toISOString());
  expect(document.body.textContent).toBe('Due Tomorrow');
});

it('enters a date picked from the @ menu as date text, not a date chip', async () => {
  const { editor, value, onPickDate, type } = await renderEditor();
  type('@tom');
  fireEvent.click(await screen.findByRole('button', { name: 'Tomorrow' }));
  expect(value()).toBe('10/17/2026 ');
  expect(onPickDate).toHaveBeenCalledWith('10/17/2026');
  expect(editor.textContent).toBe('10/17/2026 ');
  expect(value()).not.toContain('<m-date-mention>');
  expect(document.activeElement).toBe(editor);
});

it('opens a calendar for @date whose keyboard picks a day while the editor keeps focus', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 16, 9, 30));
  const { editor, value, onPickDate, onKeyDown, type } = await renderEditor();
  type('Due @date');
  const today = await screen.findByText('16', { selector: '[role=gridcell]' });
  expect(today.getAttribute('aria-selected')).toBe('true');
  expect(screen.queryByRole('button', { name: 'Tomorrow' })).toBeNull();
  fireEvent.keyDown(editor, { key: 'ArrowDown' });
  fireEvent.keyDown(editor, { key: 'ArrowLeft' });
  expect(
    screen
      .getByText('22', { selector: '[role=gridcell]' })
      .getAttribute('aria-selected')
  ).toBe('true');
  fireEvent.keyDown(editor, { key: 'Enter' });
  expect(value()).toBe('Due 10/22/2026 ');
  expect(onPickDate).toHaveBeenCalledWith('10/22/2026');
  expect(onKeyDown).not.toHaveBeenCalled();
  expect(screen.queryByRole('grid', { hidden: true })).toBeNull();
  expect(document.activeElement).toBe(editor);
});
