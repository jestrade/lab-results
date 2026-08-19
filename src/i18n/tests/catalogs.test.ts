/**
 * Catalog integrity.
 *
 * Key parity is the compiler's job — `Messages` is a total record, so a
 * missing Spanish key fails `tsc`. What the compiler cannot see is *inside*
 * the strings, which is what this covers.
 */

import { describe, expect, it } from 'vitest';

import { LOCALES } from '@/domain/locales';

import { CATALOGS } from '../catalogs';
import { en } from '../en';

const KEYS = Object.keys(en) as (keyof typeof en)[];

function placeholders(message: string): string[] {
  return [...message.matchAll(/\{(\w+)\}/g)].map((match) => match[1] ?? '').sort();
}

describe('catalogs', () => {
  it('covers every supported locale', () => {
    expect(Object.keys(CATALOGS).sort()).toEqual([...LOCALES].sort());
  });

  for (const locale of LOCALES) {
    describe(locale, () => {
      it('carries the same placeholders as English in every message', () => {
        // A translation that drops `{name}` renders a sentence with the name
        // missing — grammatical, plausible, and wrong. Nothing else catches it.
        const mismatched = KEYS.filter(
          (key) =>
            placeholders(CATALOGS[locale][key]).join() !== placeholders(en[key]).join(),
        );
        expect(mismatched).toEqual([]);
      });

      it('has no blank or untrimmed messages', () => {
        const bad = KEYS.filter((key) => {
          const message: string = CATALOGS[locale][key];
          return !message.trim() || message !== message.trim();
        });
        expect(bad).toEqual([]);
      });
    });
  }

  it('leaves nothing untranslated by copy-paste', () => {
    // Identical strings are legitimate for proper nouns and a few short
    // labels, so this asserts a ceiling rather than zero: a wholesale
    // duplicate of the English file would blow straight through it.
    const identical = KEYS.filter((key) => CATALOGS.es[key] === en[key]);
    expect(identical.length / KEYS.length).toBeLessThan(0.15);
  });
});
