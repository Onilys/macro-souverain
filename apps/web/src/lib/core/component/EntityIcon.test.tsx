import { itemToBlockName } from '@core/constant/allBlocks';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getEntityIconType, getIconConfig } from './EntityIcon';

vi.mock('@core/constant/allBlocks', () => ({
  blockAcceptedFileExtensionSet: new Set(),
  fileTypeToBlockName: vi.fn(),
  isBlockAlias: () => false,
  itemToBlockName: vi.fn(),
}));
vi.mock('@ui', async () => ({
  cn: (await import('@ui/utils/classname')).cn,
}));

describe('entity glyphs', () => {
  it('keeps the routine icon and label for saved mentions using the old block name', () => {
    expect(getIconConfig('automation')).toEqual(getIconConfig('routine'));
  });

  beforeEach(() => {
    vi.mocked(itemToBlockName).mockReset();
  });

  it('keeps archive documents distinct from unresolved documents', () => {
    vi.mocked(itemToBlockName).mockReturnValue('unknown');
    const targetType = getEntityIconType({
      type: 'document',
      fileType: 'zip',
    });
    expect(targetType).toBe('archive');
  });
});
