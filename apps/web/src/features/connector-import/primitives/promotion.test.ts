import { afterEach, describe, expect, it, vi } from 'vitest';
import { hideImportPromotion, isImportPromotionHidden } from './promotion';

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('connector import promotion persistence', () => {
  it('persists dismissal per user and category', () => {
    hideImportPromotion('alice', 'files');
    expect(isImportPromotionHidden('alice', 'files')).toBe(true);
    expect(
      localStorage.getItem('connector-import-promotion:v1:files:alice')
    ).toBe('hidden');
    expect(isImportPromotionHidden('alice', 'tasks')).toBe(false);
    expect(isImportPromotionHidden('bob', 'files')).toBe(false);
  });

  it('restores a previously saved dismissal', () => {
    localStorage.setItem('connector-import-promotion:v1:crm:saved', 'hidden');
    expect(isImportPromotionHidden('saved', 'crm')).toBe(true);
  });

  it('continues to hide in memory when storage is unavailable', () => {
    vi.stubGlobal('localStorage', undefined);
    hideImportPromotion('offline', 'tasks');
    expect(isImportPromotionHidden('offline', 'tasks')).toBe(true);
  });

  it('does not persist an unknown user', () => {
    hideImportPromotion(undefined, 'files');
    expect(isImportPromotionHidden(undefined, 'files')).toBe(false);
    expect(localStorage.length).toBe(0);
  });
});
