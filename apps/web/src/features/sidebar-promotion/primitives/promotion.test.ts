import { afterEach, describe, expect, it, vi } from 'vitest';
import { hidePromotion, isPromotionHidden } from './promotion';

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('sidebar promotion persistence', () => {
  it('persists dismissal per user and promotion', () => {
    hidePromotion('alice', 'import:files');
    expect(isPromotionHidden('alice', 'import:files')).toBe(true);
    expect(
      localStorage.getItem('sidebar-promotion:v1:import%3Afiles:alice')
    ).toBe('hidden');
    expect(isPromotionHidden('alice', 'calendar')).toBe(false);
    expect(isPromotionHidden('bob', 'import:files')).toBe(false);
  });

  it('restores a previously saved dismissal', () => {
    localStorage.setItem('sidebar-promotion:v1:home:saved', 'hidden');
    expect(isPromotionHidden('saved', 'home')).toBe(true);
  });

  it('continues to hide in memory when storage is unavailable', () => {
    vi.stubGlobal('localStorage', undefined);
    hidePromotion('offline', 'pull-requests');
    expect(isPromotionHidden('offline', 'pull-requests')).toBe(true);
  });

  it('does not persist an unknown user', () => {
    hidePromotion(undefined, 'home');
    expect(isPromotionHidden(undefined, 'home')).toBe(false);
    expect(localStorage.length).toBe(0);
  });
});
