import { describe, expect, it } from 'vitest';
import { optionColorOf } from './tagColors';

describe('option colours', () => {
  it('names the palette colour an option stores, in any case', () => {
    expect(optionColorOf('#0091FF')).toEqual({
      name: 'Blue',
      color: '#0091FF',
    });
    expect(optionColorOf('#e93d82')).toEqual({
      name: 'Pink',
      color: '#E93D82',
    });
  });

  it('names nothing for a colour outside the palette, or none at all', () => {
    expect(optionColorOf('#123456')).toBeUndefined();
    expect(optionColorOf(null)).toBeUndefined();
    expect(optionColorOf(undefined)).toBeUndefined();
  });
});
