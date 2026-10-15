/**
 * @vitest-environment jsdom
 */

import { render, screen } from '@solidjs/testing-library';
import { createSignal } from 'solid-js';
import { describe, expect, it } from 'vitest';
import { MutedMicrophoneBadge } from '../MutedMicrophoneBadge';

describe('MutedMicrophoneBadge', () => {
  it('reacts to changes in the muted state and label', () => {
    const [muted, setMuted] = createSignal(false);
    const [label, setLabel] = createSignal('You are muted');

    render(() => <MutedMicrophoneBadge muted={muted()} label={label()} />);

    expect(screen.queryByRole('status')).toBeNull();

    setMuted(true);
    expect(screen.getByRole('status', { name: 'You are muted' })).toBeTruthy();

    setLabel('Alex Morgan is muted');
    expect(
      screen.getByRole('status', { name: 'Alex Morgan is muted' })
    ).toBeTruthy();

    setMuted(false);
    expect(screen.queryByRole('status')).toBeNull();
  });
});
