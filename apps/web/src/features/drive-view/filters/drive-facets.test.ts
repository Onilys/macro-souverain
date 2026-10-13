import { describe, expect, it } from 'vitest';
import { driveSearchFileTypes } from './drive-facets';

describe('driveSearchFileTypes', () => {
  it('maps Figma to the fig extension used by soup search', () => {
    expect(driveSearchFileTypes(['file-fig'])).toEqual(['fig']);
  });

  it('keeps Figma when combined with other explicit types', () => {
    expect(driveSearchFileTypes(['file-fig', 'file-pdf'])).toEqual([
      'fig',
      'pdf',
    ]);
  });
});
