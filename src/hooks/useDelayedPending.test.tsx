import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PENDING_DELAY_MS, useDelayedPending } from './useDelayedPending';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('useDelayedPending', () => {
  it('says nothing while the work is still short', () => {
    const { result } = renderHook(() => useDelayedPending(true));

    act(() => void vi.advanceTimersByTime(PENDING_DELAY_MS - 1));
    // A spinner the eye cannot read reads as a glitch, not as progress.
    expect(result.current).toBe(false);
  });

  it('speaks up once the wait is long enough to be worth saying', () => {
    const { result } = renderHook(() => useDelayedPending(true));

    act(() => void vi.advanceTimersByTime(PENDING_DELAY_MS));
    expect(result.current).toBe(true);
  });

  it('shows nothing at all for work that finishes instantly', () => {
    // The landing-page navigation: synchronous, nothing to wait for.
    const { result, rerender } = renderHook(({ busy }) => useDelayedPending(busy), {
      initialProps: { busy: true },
    });

    act(() => void vi.advanceTimersByTime(20));
    rerender({ busy: false });
    act(() => void vi.advanceTimersByTime(1000));

    expect(result.current).toBe(false);
  });

  it('stops the moment the work does, rather than holding a minimum', () => {
    // A spinner still on screen after the work finished is a spinner lying.
    const { result, rerender } = renderHook(({ busy }) => useDelayedPending(busy), {
      initialProps: { busy: true },
    });

    act(() => void vi.advanceTimersByTime(PENDING_DELAY_MS));
    expect(result.current).toBe(true);

    rerender({ busy: false });
    expect(result.current).toBe(false);
  });

  it('starts over when the work starts again', () => {
    const { result, rerender } = renderHook(({ busy }) => useDelayedPending(busy), {
      initialProps: { busy: false },
    });

    rerender({ busy: true });
    act(() => void vi.advanceTimersByTime(PENDING_DELAY_MS));
    expect(result.current).toBe(true);
  });

  it('honours a threshold of its own', () => {
    const { result } = renderHook(() => useDelayedPending(true, 500));

    act(() => void vi.advanceTimersByTime(499));
    expect(result.current).toBe(false);
    act(() => void vi.advanceTimersByTime(1));
    expect(result.current).toBe(true);
  });
});
