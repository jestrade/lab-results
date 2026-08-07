import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '@fontsource/plus-jakarta-sans/400.css';
import '@fontsource/plus-jakarta-sans/500.css';
import '@fontsource/plus-jakarta-sans/600.css';
import '@fontsource/plus-jakarta-sans/700.css';
import '@fontsource/plus-jakarta-sans/800.css';
import '@phosphor-icons/web/duotone';

// Order matters: Broadsheet lays down the system, the theme retunes its tokens,
// then the app adds its own layout on top.
import './styles/broadsheet.css';
import './styles/theme.css';
import './styles/app.css';

import { App } from './App';
import { initMonitoring } from './lib/sentry';
import { bootTheme } from './theme/resolve';

// Before anything renders. Reads the remembered theme off `localStorage` and
// puts it on <html>, so the first paint is already the colour the reader chose
// rather than a white flash they watch turn dark. This lives here rather than
// in an inline script in index.html because the content security policy allows
// no inline script — see the note in `src/theme/resolve.ts`.
bootTheme();

initMonitoring();

const container = document.getElementById('root');
if (!container) throw new Error('Root container #root is missing from index.html.');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
