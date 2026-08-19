import { describe, expect, it } from 'vitest';

import { summariseBody, summariseProfile } from '../profileSummary';
import type { HealthContext, IdentityDocument, UserProfile } from '../types';

function stamp(iso: string) {
  return { toDate: () => new Date(iso) } as never;
}

function makeContext(overrides: Partial<HealthContext> = {}): HealthContext {
  return {
    dateOfBirth: null,
    biologicalSex: null,
    pregnancyStatus: null,
    weightKg: null,
    heightCm: null,
    medications: null,
    conditions: null,
    familyConditions: null,
    ongoingSymptoms: null,
    updatedAt: null,
    ...overrides,
  };
}

function makeProfile(overrides: Partial<UserProfile> = {}): UserProfile {
  return {
    uid: 'test-uid',
    email: 'test@example.com',
    displayName: 'Test User',
    role: 'user',
    disabled: false,
    consents: {
      termsAcceptedAt: stamp('2026-01-01'),
      aiProcessingAcceptedAt: stamp('2026-01-01'),
      documentsVersion: '2026-07-01',
    },
    preferences: { notifyOnProcessed: true, notifyOnCritical: true },
    healthContext: null,
    identityDocument: null,
    createdAt: stamp('2026-01-15T12:00:00Z'),
    updatedAt: null,
    deletedAt: null,
    ...overrides,
  };
}

function document(overrides: Partial<IdentityDocument> = {}): IdentityDocument {
  return { type: null, number: null, placeOfIssue: null, updatedAt: null, ...overrides };
}

function keys(profile: UserProfile) {
  return summariseProfile(profile, 'en').map((item) => item.key);
}

describe('summariseProfile', () => {
  it('has nothing to say about an empty profile', () => {
    // The panel shows a way to fill it in instead. A list of em dashes would
    // be the shape of a record that does not exist.
    expect(summariseProfile(makeProfile(), 'en')).toEqual([]);
    expect(summariseProfile(null, 'en')).toEqual([]);
  });

  it('lists only the fields that were actually saved', () => {
    const profile = makeProfile({
      healthContext: makeContext({ conditions: 'Hypothyroidism', medications: 'Levothyroxine' }),
    });

    expect(keys(profile)).toEqual(['medications', 'conditions']);
  });

  it('joins the identity document into one row', () => {
    const profile = makeProfile({
      identityDocument: document({
        type: 'cedula_extranjeria',
        number: 'E-4471129',
        placeOfIssue: 'Cali',
      }),
    });

    expect(summariseProfile(profile, 'en')[0]).toEqual({
      key: 'document',
      label: 'Identity document',
      value: 'Cédula de extranjería · E-4471129 · Cali',
    });
  });

  it('leaves no gap where a document part is missing', () => {
    const profile = makeProfile({ identityDocument: document({ type: 'pasaporte' }) });

    expect(summariseProfile(profile, 'en')[0]?.value).toBe('Passport');
  });

  it('ignores a document record whose fields are all empty', () => {
    // `clearIdentityDocument` deletes the field, but a profile written before
    // that existed can hold a map of nulls, and that is not a document.
    expect(keys(makeProfile({ identityDocument: document() }))).toEqual([]);
  });

  it('keeps the index out of the row list, where rows are conditional', () => {
    // The rows say "what you saved". The index says something about the
    // account whether or not anything was saved, so it is not one of them.
    const profile = makeProfile({ healthContext: makeContext({ weightKg: 70, heightCm: 175 }) });

    expect(keys(profile)).toEqual([]);
  });

  it('translates the labels and the coded values', () => {
    const profile = makeProfile({
      healthContext: makeContext({ biologicalSex: 'female', pregnancyStatus: 'pregnant' }),
    });

    expect(summariseProfile(profile, 'es').map((item) => [item.label, item.value])).toEqual([
      ['Sexo', 'Mujer'],
      ['Estado de embarazo', 'Embarazada'],
    ]);
  });

  it('keeps free text exactly as it was written, line breaks included', () => {
    const medications = 'Levothyroxine 50mcg\nMetformin 850mg';
    const profile = makeProfile({ healthContext: makeContext({ medications }) });

    // "One per line" is how the form asked for it, and reflowing the list into
    // a paragraph loses the list.
    expect(summariseProfile(profile, 'en')[0]?.value).toBe(medications);
  });

  it('orders the rows the way someone reads them', () => {
    const profile = makeProfile({
      identityDocument: document({ type: 'cedula' }),
      healthContext: makeContext({
        dateOfBirth: '1990-04-02',
        biologicalSex: 'female',
        pregnancyStatus: 'not_pregnant',
        weightKg: 62,
        heightCm: 168,
        medications: 'Levothyroxine',
        conditions: 'Hypothyroidism',
        familyConditions: 'Type 2 diabetes — father',
        ongoingSymptoms: 'Fatigue',
      }),
    });

    // Who they are, then what they live with. The index is drawn above this
    // list, unconditionally, and so is not part of it.
    expect(keys(profile)).toEqual([
      'document',
      'dateOfBirth',
      'biologicalSex',
      'pregnancyStatus',
      'medications',
      'conditions',
      'familyConditions',
      'ongoingSymptoms',
    ]);
  });
});

describe('summariseBody', () => {
  it('reports the index, its band and the numbers behind it', () => {
    const profile = makeProfile({ healthContext: makeContext({ weightKg: 70, heightCm: 175 }) });

    expect(summariseBody(profile, 'en')).toEqual({
      index: '22.9',
      band: 'normal',
      measurements: '70 kg · 175 cm',
    });
  });

  it('answers for a profile with nothing in it rather than refusing to', () => {
    // The panel draws this row whether or not there is an index, so this has
    // to return a shape, not nothing.
    expect(summariseBody(makeProfile(), 'en')).toEqual({
      index: null,
      band: null,
      measurements: null,
    });
    expect(summariseBody(null, 'en')).toEqual({
      index: null,
      band: null,
      measurements: null,
    });
  });

  it('keeps a lone measurement without inventing an index for it', () => {
    const profile = makeProfile({ healthContext: makeContext({ heightCm: 175 }) });

    expect(summariseBody(profile, 'en')).toEqual({
      index: null,
      band: null,
      measurements: '175 cm',
    });
  });

  it('refuses an index from an implausible measurement', () => {
    // A height stored in metres by an older client would otherwise put an
    // index of 24,221 in the account menu, in red, as though it were a fact.
    const profile = makeProfile({ healthContext: makeContext({ weightKg: 70, heightCm: 1.75 }) });

    expect(summariseBody(profile, 'en').index).toBeNull();
    expect(summariseBody(profile, 'en').band).toBeNull();
  });

  it('follows the reader’s locale for the decimal separator', () => {
    const profile = makeProfile({ healthContext: makeContext({ weightKg: 70, heightCm: 175 }) });

    // The separator is not decoration; it is which number is being shown.
    expect(summariseBody(profile, 'es').index).toBe('22,9');
  });

  it.each([
    [45, 175, 'underweight'],
    [70, 175, 'normal'],
    [85, 175, 'overweight'],
    [95, 175, 'obese'],
  ])('places %s kg at %s cm in the %s band', (weightKg, heightCm, band) => {
    const profile = makeProfile({ healthContext: makeContext({ weightKg, heightCm }) });

    expect(summariseBody(profile, 'en').band).toBe(band);
  });
});
