/**
 * @vitest-environment jsdom
 */

import { render } from '@solidjs/testing-library';
import { describe, expect, it } from 'vitest';
import { EditorSystemMessage } from './EditorSystemMessage';

describe('EditorSystemMessage', () => {
  it('renders the base variant by default', () => {
    const { getByRole } = render(() => (
      <EditorSystemMessage>Document status</EditorSystemMessage>
    ));

    const message = getByRole('status');
    expect(message.dataset.variant).toBe('base');
  });

  it('renders errors as alerts', () => {
    const { getByRole } = render(() => (
      <EditorSystemMessage variant="error">Document error</EditorSystemMessage>
    ));

    const message = getByRole('alert');
    expect(message.dataset.variant).toBe('error');
  });

  it('renders warnings as statuses', () => {
    const { getByRole } = render(() => (
      <EditorSystemMessage variant="warning">
        Document warning
      </EditorSystemMessage>
    ));

    expect(getByRole('status').dataset.variant).toBe('warning');
  });
});
