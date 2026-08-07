import { createContext } from 'react';

import type { Theme, ThemePreference } from '@/domain/themes';

export interface ThemeContextValue {
  /** What the reader chose — including `system`. This is what the picker shows. */
  preference: ThemePreference;
  /**
   * What is actually painted, with `system` already resolved against the
   * device. Components that need to branch on the real appearance — a chart
   * picking a gridline colour it cannot express as a token — read this.
   */
  theme: Theme;
  /**
   * Switch themes. Resolves once the choice has been stored, so the picker can
   * keep its saving state up until it is actually saved rather than until it
   * has been asked for.
   */
  setPreference: (preference: ThemePreference) => Promise<void>;
  /** True while a chosen theme is being written to the profile. */
  saving: boolean;
  /**
   * Set when the preference could not be persisted. The switch still applies
   * locally — a failed write must not leave the reader looking at a theme they
   * did not ask for.
   */
  error: string | null;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);
