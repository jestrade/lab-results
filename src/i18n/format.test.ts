import { describe, expect, it } from 'vitest';

import { format, formatNodes } from './format';

describe('format', () => {
  it('fills named holes', () => {
    expect(format('Welcome, {name}', { name: 'Ada' })).toBe('Welcome, Ada');
  });

  it('fills the same hole everywhere it appears', () => {
    expect(format('{n} of {n}', { n: 3 })).toBe('3 of 3');
  });

  it('leaves an unknown hole visible rather than blanking it', () => {
    // A literal "{count}" on screen gets reported as a bug. "You have
    // reports" gets investigated as missing data, in the wrong place.
    expect(format('You have {count} reports', {})).toBe('You have {count} reports');
  });

  it('does not treat a value as a template', () => {
    expect(format('Hello {name}', { name: '{name}' })).toBe('Hello {name}');
  });
});

describe('formatNodes', () => {
  it('splits the sentence around the substituted node', () => {
    expect(formatNodes('Read the {doc} first.', { doc: 'DOC' })).toEqual([
      'Read the ',
      'DOC',
      ' first.',
    ]);
  });

  it('handles a hole at either end without emitting empty segments', () => {
    expect(formatNodes('{a} trails', { a: 'A' })).toEqual(['A', ' trails']);
    expect(formatNodes('leads {a}', { a: 'A' })).toEqual(['leads ', 'A']);
  });

  it('substitutes several holes, in the order the translation puts them', () => {
    // Spanish routinely reorders these; the function must follow the string,
    // not the object.
    expect(formatNodes('{b} then {a}', { a: 'A', b: 'B' })).toEqual(['B', ' then ', 'A']);
  });

  it('returns the untouched string when nothing matches', () => {
    expect(formatNodes('No holes here', { a: 'A' })).toEqual(['No holes here']);
  });
});
