import { fireEvent, render, screen } from '@solidjs/testing-library';
import { describe, expect, it } from 'vitest';
import { ChangesHandoff, ChangesProvider } from '../changes';
import { createMockChangesContext, mockChangeset } from '../tests/mock-context';

describe('ChangesHandoff', () => {
  it('opens and closes the pane from the composer chip', () => {
    const context = createMockChangesContext({
      summary: { capturing: false, changeset: mockChangeset() },
    });
    render(() => (
      <ChangesProvider context={context}>
        <ChangesHandoff />
      </ChangesProvider>
    ));
    const chip = screen.getByRole('button', { name: 'Review changes' });
    expect(chip.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(chip);
    expect(chip.getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(chip);
    expect(chip.getAttribute('aria-pressed')).toBe('false');
  });

  it('stays hidden without changed files', () => {
    const context = createMockChangesContext({
      summary: { capturing: false, changeset: mockChangeset({ files: [] }) },
    });
    render(() => (
      <ChangesProvider context={context}>
        <ChangesHandoff />
      </ChangesProvider>
    ));
    expect(screen.queryByRole('button', { name: 'Review changes' })).toBeNull();
  });
});
