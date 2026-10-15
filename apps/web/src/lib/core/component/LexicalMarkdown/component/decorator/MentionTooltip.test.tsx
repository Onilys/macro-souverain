/**
 * @vitest-environment jsdom
 */

import { render, screen } from '@solidjs/testing-library';
import { describe, expect, it } from 'vitest';
import { MentionTooltip } from './MentionTooltip';

describe('MentionTooltip', () => {
  it('shows the label and keyboard hint when visible', () => {
    render(() => <MentionTooltip show text="Open" />);

    expect(screen.getByText('Open')).toBeTruthy();
    expect(screen.getByText('↵')).toBeTruthy();
  });

  it('renders nothing when hidden', () => {
    const { container } = render(() => (
      <MentionTooltip show={false} text="Open" />
    ));

    expect(container.innerHTML).toBe('');
  });
});
