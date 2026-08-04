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

initMonitoring();

const container = document.getElementById('root');
if (!container) throw new Error('Root container #root is missing from index.html.');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
