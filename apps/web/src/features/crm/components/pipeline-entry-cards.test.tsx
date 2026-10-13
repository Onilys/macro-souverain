import { cleanup, fireEvent, render, screen } from '@solidjs/testing-library';
import { afterEach, expect, it, vi } from 'vitest';
import type { PipelineEntry } from '../core/pipeline-entry';
import { PipelineEntryCards } from './pipeline-entry-cards';

afterEach(cleanup);

function entry(name: string, shared: boolean, fields: string[]): PipelineEntry {
  return {
    rowId: `${name}-row`,
    pipeline: {
      id: name,
      name,
      tableId: `${name}-table`,
      shared,
      canEdit: true,
    },
    cells: fields.map((field) => ({
      column: {
        id: `${name}-${field}`,
        name: field,
        dataType: 'STRING',
        isMultiSelect: false,
        options: [],
        writable: true,
      },
      value: `${field} value`,
    })),
  };
}

it('renders nothing when the record is in no pipeline', () => {
  render(() => (
    <PipelineEntryCards entries={[]} renderCell={(_, cell) => cell().value} />
  ));
  expect(screen.queryByRole('region', { name: 'Pipelines' })).toBeNull();
});

it('shows each pipeline row as a card that collapses past four fields', () => {
  render(() => (
    <PipelineEntryCards
      entries={[
        entry('Sales', true, ['Stage', 'Owner', 'Revenue', 'Notes', 'Source']),
        entry('Partners', false, ['Stage']),
      ]}
      renderCell={(_, cell) => cell().value}
    />
  ));
  const sales = screen.getByRole('article', { name: 'Sales' });
  expect(sales.textContent).toContain('Notes value');
  expect(sales.textContent).not.toContain('Source value');
  fireEvent.click(screen.getByRole('button', { name: 'Show 1 more' }));
  expect(sales.textContent).toContain('Source value');
  fireEvent.click(screen.getByRole('button', { name: 'Show less' }));
  expect(sales.textContent).not.toContain('Source value');
  expect(screen.getByLabelText('Private pipeline')).toBeTruthy();
  expect(
    screen.getByRole('article', { name: 'Partners' }).textContent
  ).not.toContain('more');
});

it('opens a card’s pipeline when the host can show it', () => {
  const onOpenPipeline = vi.fn();
  render(() => (
    <PipelineEntryCards
      entries={[entry('Sales', true, ['Stage'])]}
      renderCell={(_, cell) => cell().value}
      onOpenPipeline={onOpenPipeline}
    />
  ));
  fireEvent.click(screen.getByRole('button', { name: 'Open Sales' }));
  expect(onOpenPipeline).toHaveBeenCalledWith('Sales');
});
