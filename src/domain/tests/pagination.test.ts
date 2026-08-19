import { describe, expect, it } from 'vitest';

import {
  clampPage,
  PAGE_GAP,
  PAGE_SIZE,
  pageCount,
  pageNumbers,
  pageSlice,
  pageWindow,
  readPage,
} from '../pagination';

const rows = Array.from({ length: 178 }, (_, index) => index + 1);

describe('pageCount', () => {
  it('counts the pages a list needs', () => {
    expect(pageCount(178, 25)).toBe(8);
    expect(pageCount(50, 25)).toBe(2);
    expect(pageCount(51, 25)).toBe(3);
  });

  it('calls an empty list one page, not none', () => {
    // "Page 0 of 0" is a table reporting a bug.
    expect(pageCount(0, 25)).toBe(1);
  });

  it('does not divide by a zero page size', () => {
    expect(pageCount(10, 0)).toBe(1);
  });
});

describe('clampPage', () => {
  it('leaves a page that exists alone', () => {
    expect(clampPage(3, 178, 25)).toBe(3);
  });

  it('pulls a page past the end back to the last one', () => {
    // The failure this exists for: filter to three rows while on page 5 and
    // the table renders empty with working controls and no explanation.
    expect(clampPage(5, 3, 25)).toBe(1);
    expect(clampPage(99, 178, 25)).toBe(8);
  });

  it('absorbs whatever a hand-edited URL carries', () => {
    expect(clampPage(0, 178, 25)).toBe(1);
    expect(clampPage(-4, 178, 25)).toBe(1);
    expect(clampPage(Number.NaN, 178, 25)).toBe(1);
    expect(clampPage(Number.POSITIVE_INFINITY, 178, 25)).toBe(1);
    expect(clampPage(2.7, 178, 25)).toBe(2);
  });
});

describe('pageSlice', () => {
  it('returns the rows on the page', () => {
    expect(pageSlice(rows, 1, 25)[0]).toBe(1);
    expect(pageSlice(rows, 1, 25)).toHaveLength(25);
    expect(pageSlice(rows, 2, 25)[0]).toBe(26);
  });

  it('returns the remainder on the last page', () => {
    expect(pageSlice(rows, 8, 25)).toHaveLength(3);
    expect(pageSlice(rows, 8, 25).at(-1)).toBe(178);
  });

  it('never renders blank for an out-of-range page', () => {
    expect(pageSlice(rows, 99, 25)).toHaveLength(3);
    expect(pageSlice(rows, 0, 25)[0]).toBe(1);
  });

  it('handles an empty list', () => {
    expect(pageSlice([], 1, 25)).toEqual([]);
  });

  it('leaves the caller’s array alone', () => {
    const original = [...rows];
    pageSlice(rows, 2, 25);
    expect(rows).toEqual(original);
  });
});

describe('pageWindow', () => {
  it('counts the way a person does, from one', () => {
    expect(pageWindow(1, 178, 25)).toEqual({ from: 1, to: 25, total: 178 });
    expect(pageWindow(2, 178, 25)).toEqual({ from: 26, to: 50, total: 178 });
  });

  it('stops at the total on a short last page', () => {
    expect(pageWindow(8, 178, 25)).toEqual({ from: 176, to: 178, total: 178 });
  });

  it('claims no first row when there are none', () => {
    expect(pageWindow(1, 0, 25)).toEqual({ from: 0, to: 0, total: 0 });
  });
});

describe('pageNumbers', () => {
  it('lists every page when they all fit', () => {
    expect(pageNumbers(1, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it('always keeps the first and last page reachable', () => {
    const entries = pageNumbers(10, 20);
    expect(entries[0]).toBe(1);
    expect(entries.at(-1)).toBe(20);
  });

  it('gaps the runs it leaves out', () => {
    const entries = pageNumbers(10, 20);
    expect(entries).toContain(PAGE_GAP);
    expect(entries).toContain(9);
    expect(entries).toContain(10);
    expect(entries).toContain(11);
  });

  it('opens out at the start rather than gapping immediately', () => {
    // A gap that hides a single page costs the same width as the number.
    expect(pageNumbers(1, 20).slice(0, 4)).toEqual([1, 2, 3, 4]);
  });

  it('opens out at the end in the same way', () => {
    expect(pageNumbers(20, 20).slice(-4)).toEqual([17, 18, 19, 20]);
  });

  it('never repeats a page', () => {
    const numbers = pageNumbers(10, 20).filter((entry) => entry !== PAGE_GAP);
    expect(new Set(numbers).size).toBe(numbers.length);
  });

  it('stays a single page when there is only one', () => {
    expect(pageNumbers(1, 1)).toEqual([1]);
  });
});

describe('readPage', () => {
  it('reads a page from the query string', () => {
    expect(readPage(new URLSearchParams('page=4'))).toBe(4);
  });

  it('treats absent and malformed as the first page', () => {
    expect(readPage(new URLSearchParams())).toBe(1);
    expect(readPage(new URLSearchParams('page=abc'))).toBe(1);
    expect(readPage(new URLSearchParams('page=0'))).toBe(1);
    expect(readPage(new URLSearchParams('page=-3'))).toBe(1);
  });
});

describe('PAGE_SIZE', () => {
  it('is the default every helper falls back to', () => {
    expect(pageSlice(rows, 1)).toHaveLength(PAGE_SIZE);
    expect(pageCount(rows.length)).toBe(Math.ceil(rows.length / PAGE_SIZE));
  });
});
