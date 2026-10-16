import type { CellTextEditorProps } from '@app/components/cell-text-editor/types';
import type { JSX } from 'solid-js';

export type SpreadsheetTextEditorProps = CellTextEditorProps & {
  /** Date text the editor inserted from the `@` menu. */
  onPickDate?: (text: string) => void;
};

export type SpreadsheetMentions = {
  renderText: (value: string) => JSX.Element;
  renderEditor: (props: SpreadsheetTextEditorProps) => JSX.Element;
};
