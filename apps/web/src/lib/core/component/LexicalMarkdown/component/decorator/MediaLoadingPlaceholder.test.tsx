/**
 * @vitest-environment jsdom
 */

import { describe, expect, it } from 'vitest';
import { mediaFileNameFromUrl } from './MediaLoadingPlaceholder';

describe('mediaFileNameFromUrl', () => {
  it('keeps a file name and drops opaque ids', () => {
    expect(
      mediaFileNameFromUrl('https://files.macro.com/walkthrough.mp4')
    ).toBe('walkthrough.mp4');
    expect(
      mediaFileNameFromUrl(
        'https://static-file-service-dev.macro.com/file/499fcf96-b38f-4660-9994-8b6a7da58f13'
      )
    ).toBeUndefined();
    expect(mediaFileNameFromUrl('not a url')).toBeUndefined();
  });
});
