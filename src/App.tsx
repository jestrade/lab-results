import { BrowserRouter } from 'react-router-dom';

import { AuthProvider } from '@/auth/AuthProvider';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ToastProvider } from '@/components/ToastProvider';
import { I18nProvider } from '@/i18n/I18nProvider';
import { AppRoutes } from '@/routes';
import { ThemeProvider } from '@/theme/ThemeProvider';

/**
 * `I18nProvider` sits below `AuthProvider` because the account's stored
 * language preference lives on the profile, and above everything that renders
 * copy. The error boundary stays outermost and therefore outside the context —
 * it translates through `@/i18n/resolve` instead, since the tree it is
 * catching for may be the one that failed.
 *
 * `ThemeProvider` sits below `I18nProvider` for both of those reasons at once:
 * its preference also lives on the profile, and the one string it exposes —
 * shown when saving the theme fails — has to be translated. Its position in
 * the tree does not affect when the theme appears, though: `bootTheme()` has
 * already put it on <html> before any of these mount.
 */
export function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <AuthProvider>
          <I18nProvider>
            <ThemeProvider>
              <ToastProvider>
                <AppRoutes />
              </ToastProvider>
            </ThemeProvider>
          </I18nProvider>
        </AuthProvider>
      </BrowserRouter>
    </ErrorBoundary>
  );
}
