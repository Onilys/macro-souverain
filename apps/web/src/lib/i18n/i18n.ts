import { makePersistedState } from '@app/lib/persistence';
import { ResultAsync } from 'neverthrow';
import { createSignal } from 'solid-js';
import { z } from 'zod';
import type {
  PartialDictionary,
  TranslationKey,
  TranslationParams,
} from './dictionary';
import { formatMessage, lookupMessage } from './dictionary';
import { DEFAULT_LANGUAGE, Language } from './languages';
import en from './locales/en';

const STORAGE_KEY = 'interface-language-v1';

const storedLanguageSchema = z.enum(Language);

type Translation = { default: PartialDictionary };

/** Translations load on demand so only the chosen language is downloaded. */
const TRANSLATIONS: Record<
  Exclude<Language, 'en'>,
  () => Promise<Translation>
> = {
  de: () => import('./locales/de'),
  fr: () => import('./locales/fr'),
  es: () => import('./locales/es'),
  it: () => import('./locales/it'),
  nl: () => import('./locales/nl'),
  'pt-PT': () => import('./locales/pt-PT'),
  sv: () => import('./locales/sv'),
  da: () => import('./locales/da'),
  nb: () => import('./locales/nb'),
  fi: () => import('./locales/fi'),
  pl: () => import('./locales/pl'),
  ru: () => import('./locales/ru'),
  ja: () => import('./locales/ja'),
  ko: () => import('./locales/ko'),
  'zh-Hans': () => import('./locales/zh-Hans'),
  'zh-Hant': () => import('./locales/zh-Hant'),
  hi: () => import('./locales/hi'),
  id: () => import('./locales/id'),
  vi: () => import('./locales/vi'),
  th: () => import('./locales/th'),
};

// Remembered on the device so the next launch starts in the same language
// before the account's setting has loaded.
const [language, setLanguage] = makePersistedState(
  createSignal<Language>(DEFAULT_LANGUAGE),
  {
    storages: {
      restore: () => {
        try {
          const stored = storedLanguageSchema.safeParse(
            localStorage.getItem(STORAGE_KEY)
          );
          return stored.success ? stored.data : undefined;
        } catch {
          return undefined;
        }
      },
      write: (value) => {
        try {
          localStorage.setItem(STORAGE_KEY, value);
        } catch {
          // Storage may be unavailable; the language still applies this session.
        }
      },
    },
  }
);

const [translation, setTranslation] = createSignal<PartialDictionary>({});

/** The language the interface is currently shown in. */
export const interfaceLanguage = language;

/**
 * Switches the interface language. Messages stay in the previous language
 * until the new translation has loaded, then every `t` call updates.
 */
export function setInterfaceLanguage(next: Language): void {
  setLanguage(() => next);
  document.documentElement.lang = next;
  if (next === 'en') {
    setTranslation({});
    return;
  }
  void loadTranslation(next);
}

async function loadTranslation(next: Exclude<Language, 'en'>) {
  const loaded = await ResultAsync.fromPromise(
    TRANSLATIONS[next](),
    (error) => error
  );
  if (loaded.isErr()) {
    console.error('Failed to load interface language', next, loaded.error);
    return;
  }
  // A later switch may have finished first; only the current one applies.
  if (language() === next) setTranslation(loaded.value.default);
}

/**
 * The message for `key` in the interface language, falling back to English.
 * Reactive: reading it inside JSX or a memo updates when the language changes.
 */
export function t(key: TranslationKey, params?: TranslationParams): string {
  const template =
    lookupMessage(translation(), key) ?? lookupMessage(en, key) ?? key;
  return formatMessage(template, params);
}

setInterfaceLanguage(language());
