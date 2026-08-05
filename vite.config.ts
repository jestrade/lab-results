import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// Security headers and CSP come from config/csp.mjs so that the dev server,
// the preview server and Firebase Hosting cannot disagree — see the note in
// that file about the CSP bug that reached production.
import { developmentCsp, productionCsp, securityHeaders } from './config/csp.mjs';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // PORT lets a harness assign a free port; the defaults are the usual ones.
  server: {
    port: Number(process.env.PORT) || 5173,
    // Relaxed CSP: Vite's HMR client needs inline scripts and a websocket.
    headers: { ...securityHeaders, 'Content-Security-Policy': developmentCsp },
  },
  // Bound explicitly to the loopback IPv4 address: Vite's default `localhost`
  // resolves to ::1 on this machine, and Playwright polls 127.0.0.1.
  preview: {
    host: '127.0.0.1',
    port: Number(process.env.PORT) || 4173,
    // The STRICT policy, byte-identical to what Hosting sends. Preview serves
    // the real build with no HMR, so a CSP violation surfaces here rather than
    // after a deploy. Run `npm run preview` before shipping.
    headers: { ...securityHeaders, 'Content-Security-Policy': productionCsp },
  },
  build: {
    sourcemap: true,
    target: 'es2022',
    // Never inline fonts. Vite inlines assets under 4 KB by default, which
    // turned the small Plus Jakarta Sans subsets into `data:` URIs that
    // `font-src 'self'` then blocked in production. Keeping fonts as real
    // files is what lets the CSP stay strict.
    assetsInlineLimit: (filePath) => (/\.(woff2?|ttf|otf|eot)$/i.test(filePath) ? false : undefined),
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
    // `functions/` is a separate package with its own toolchain and its own
    // vitest run — its sources are CommonJS and depend on a generated JSON
    // file that only its build produces.
    // `.claude/worktrees/**` holds full checkouts of this repo made for
    // background agents. Without excluding it, vitest runs every copy's tests
    // alongside the real ones and reports failures from work in progress
    // elsewhere as failures here.
    exclude: ['e2e/**', 'node_modules/**', 'functions/**', '.claude/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/test/**', 'src/**/*.test.{ts,tsx}', 'src/main.tsx'],
    },
  },
});
