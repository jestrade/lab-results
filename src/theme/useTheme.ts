import { useContext } from 'react';

import { ThemeContext, type ThemeContextValue } from './ThemeContext';

/**
 * The current theme and the control to change it.
 *
 * Throws outside the provider rather than falling back to light: a component
 * that silently renders in the wrong theme is a bug that ships, while this one
 * fails on the first render in development.
 */
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used inside a <ThemeProvider>.');
  }
  return context;
}
