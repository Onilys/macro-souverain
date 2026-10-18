import { describe, expect, it } from 'vitest';
import type { PartialDictionary } from './dictionary';
import { formatMessage, lookupMessage } from './dictionary';
import { LANGUAGES, Language, resolveInterfaceLanguage } from './languages';
import en from './locales/en';

const translations = import.meta.glob<{ default: PartialDictionary }>(
  './locales/*.ts',
  { eager: true }
);

function translationFor(code: Language): PartialDictionary {
  const module = translations[`./locales/${code}.ts`];
  if (!module) throw new Error(`No translation file for ${code}`);
  return module.default;
}

const englishKeys = Object.entries(en).flatMap(([namespace, messages]) =>
  Object.keys(messages).map((message) => `${namespace}.${message}`)
);

const PLACEHOLDER = /\{\{\s*(\w+)\s*\}\}/g;

function placeholders(template: string): string[] {
  return [...template.matchAll(PLACEHOLDER)].map((match) => match[1]).sort();
}

describe('resolveInterfaceLanguage', () => {
  it('prefers the person, then the team, then English', () => {
    expect(resolveInterfaceLanguage(Language.ja, Language.de)).toBe('ja');
    expect(resolveInterfaceLanguage(null, Language.de)).toBe('de');
    expect(resolveInterfaceLanguage(undefined, undefined)).toBe('en');
  });
});

describe('formatMessage', () => {
  it('fills placeholders and leaves unknown ones visible', () => {
    expect(formatMessage('Go to {{label}}', { label: 'Email' })).toBe(
      'Go to Email'
    );
    expect(formatMessage('{{ count }} of {{total}}', { count: 2 })).toBe(
      '2 of {{total}}'
    );
  });
});

describe('lookupMessage', () => {
  it('falls through when a translation leaves a key out', () => {
    expect(lookupMessage({}, 'common.cancel')).toBeUndefined();
    expect(lookupMessage(en, 'common.cancel')).toBe('Cancel');
  });
});

describe('translations', () => {
  it('has a file for every language and nothing else', () => {
    const files = Object.keys(translations)
      .map((path) => path.replace('./locales/', '').replace('.ts', ''))
      .sort();
    expect(files).toEqual(LANGUAGES.map(({ code }) => code).sort());
  });

  it.each(
    LANGUAGES.filter(({ code }) => code !== 'en').map(({ code }) => code)
  )(
    '%s translates every English message with the same placeholders',
    (code) => {
      const translation = translationFor(code);
      const missing: string[] = [];
      const mismatched: string[] = [];
      for (const key of englishKeys) {
        const [namespace, message] = key.split('.') as [
          keyof typeof en,
          string,
        ];
        const english = (en[namespace] as Record<string, string>)[message];
        const translated = translation[namespace]?.[message as never] as
          | string
          | undefined;
        if (!translated?.trim()) {
          missing.push(key);
          continue;
        }
        if (
          placeholders(translated).join() !== placeholders(english ?? '').join()
        ) {
          mismatched.push(key);
        }
      }
      expect(missing).toEqual([]);
      expect(mismatched).toEqual([]);
    }
  );
});
