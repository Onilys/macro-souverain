/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@core/component/Toast/Toast', () => ({
  toast: { alert: vi.fn(), success: vi.fn(), failure: vi.fn() },
}));

import { DEFAULT_DARK_THEME, DEFAULT_LIGHT_THEME } from '../../constants';
import {
  currentThemeId,
  darkModeTheme,
  lightModeTheme,
  liveThemeMode,
  setDarkModeTheme,
  setLightModeTheme,
  setThemeMode,
  themeMode,
} from '../../signals/themeSignals';
import { macroDarkTheme } from '../../themes/macro-dark';
import { paperTheme } from '../../themes/paper';
import {
  applyTheme,
  clearThemePreview,
  pinTheme,
  previewTheme,
  scheduleThemePreviewEnd,
} from '../themeUtils';

beforeEach(() => {
  setThemeMode('dark');
  setLightModeTheme(DEFAULT_LIGHT_THEME);
  setDarkModeTheme(DEFAULT_DARK_THEME);
  applyTheme(DEFAULT_DARK_THEME);
  clearThemePreview();
});

describe('pinTheme', () => {
  it('keeps a previewed light theme after the picker highlight ends', async () => {
    previewTheme(paperTheme.id);
    pinTheme(paperTheme);
    scheduleThemePreviewEnd();
    await Promise.resolve();

    expect(themeMode()).toBe('light');
    expect(lightModeTheme()).toBe(paperTheme.id);
    expect(currentThemeId()).toBe(paperTheme.id);
    expect(liveThemeMode()).toBe('light');
  });

  it('keeps a previewed dark theme after the picker highlight ends', async () => {
    setThemeMode('light');
    applyTheme(DEFAULT_LIGHT_THEME);
    previewTheme(macroDarkTheme.id);
    pinTheme(macroDarkTheme);
    scheduleThemePreviewEnd();
    await Promise.resolve();

    expect(themeMode()).toBe('dark');
    expect(darkModeTheme()).toBe(macroDarkTheme.id);
    expect(currentThemeId()).toBe(macroDarkTheme.id);
    expect(liveThemeMode()).toBe('dark');
  });
});
