import { describe, expect, it } from 'vitest';

import {
  DEFAULT_LOCALE,
  detectLocale,
  isLocale,
  readTranslated,
  readTranslatedOptional,
  resolveLocale,
  translate,
  translateOptional,
} from './locales';

describe('resolveLocale', () => {
  it('accepts a bare supported tag', () => {
    expect(resolveLocale('es')).toBe('es');
    expect(resolveLocale('en')).toBe('en');
  });

  it('matches on the primary subtag, so regional variants resolve', () => {
    expect(resolveLocale('es-MX')).toBe('es');
    expect(resolveLocale('es-419')).toBe('es');
    expect(resolveLocale('en_GB')).toBe('en');
    expect(resolveLocale('ES-mx')).toBe('es');
  });

  it('falls back to English for anything unsupported or absent', () => {
    expect(resolveLocale('fr-FR')).toBe(DEFAULT_LOCALE);
    expect(resolveLocale('')).toBe(DEFAULT_LOCALE);
    expect(resolveLocale(null)).toBe(DEFAULT_LOCALE);
  });
});

describe('detectLocale', () => {
  it('takes the first supported entry, not the first entry', () => {
    expect(detectLocale(['fr-FR', 'es-MX', 'en'])).toBe('es');
  });

  it('falls back to English when nothing is supported', () => {
    expect(detectLocale(['fr', 'de'])).toBe(DEFAULT_LOCALE);
    expect(detectLocale([])).toBe(DEFAULT_LOCALE);
  });
});

describe('translate', () => {
  it('returns the requested locale when it exists', () => {
    expect(translate({ en: 'Hemoglobin', es: 'Hemoglobina' }, 'es')).toBe('Hemoglobina');
  });

  it('falls back to English rather than rendering nothing', () => {
    // A Spanish reader seeing an English name has a visible, reportable gap.
    // A blank card looks like their result went missing.
    expect(translate({ en: 'Ferritin' }, 'es')).toBe('Ferritin');
  });
});

describe('readTranslated', () => {
  it('reads the locales present on a document', () => {
    expect(readTranslated({ en: 'Glucose', es: 'Glucosa' }, 'fallback')).toEqual({
      en: 'Glucose',
      es: 'Glucosa',
    });
  });

  it('uses the fallback when the map is missing entirely', () => {
    // Series written before the catalog existed have no names map at all.
    expect(readTranslated(undefined, 'Hemoglobina')).toEqual({ en: 'Hemoglobina' });
  });

  it('drops blank and non-string entries instead of showing them', () => {
    expect(readTranslated({ en: 'Glucose', es: '   ' }, 'x')).toEqual({ en: 'Glucose' });
    expect(readTranslated({ en: 'Glucose', es: 42 }, 'x')).toEqual({ en: 'Glucose' });
  });

  it('trims whitespace a sheet cell carried in', () => {
    expect(readTranslated({ en: '  Glucose  ' }, 'x').en).toBe('Glucose');
  });
});

describe('readTranslatedOptional / translateOptional', () => {
  it('stays empty for a description nobody wrote', () => {
    expect(readTranslatedOptional(undefined)).toEqual({});
    expect(translateOptional({}, 'es')).toBeNull();
    expect(translateOptional(null, 'en')).toBeNull();
  });

  it('falls back to English before giving up', () => {
    expect(translateOptional({ en: 'Stores iron.' }, 'es')).toBe('Stores iron.');
    expect(translateOptional({ es: 'Almacena hierro.' }, 'es')).toBe('Almacena hierro.');
  });
});

describe('isLocale', () => {
  it('recognises only the supported set', () => {
    expect(isLocale('en')).toBe(true);
    expect(isLocale('es')).toBe(true);
    expect(isLocale('fr')).toBe(false);
    expect(isLocale(null)).toBe(false);
  });
});
