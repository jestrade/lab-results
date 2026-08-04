import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// Security headers (KAN-36). Vite's dev server applies them locally; the same
// set is mirrored in firebase.json so production hosting sends them too.
const securityHeaders: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
};

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // PORT lets a harness assign a free port; the defaults are the usual ones.
  server: { port: Number(process.env.PORT) || 5173, headers: securityHeaders },
  // Bound explicitly to the loopback IPv4 address: Vite's default `localhost`
  // resolves to ::1 on this machine, and Playwright polls 127.0.0.1.
  preview: {
    host: '127.0.0.1',
    port: Number(process.env.PORT) || 4173,
    headers: securityHeaders,
  },
  build: { sourcemap: true, target: 'es2022' },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
    exclude: ['e2e/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/test/**', 'src/**/*.test.{ts,tsx}', 'src/main.tsx'],
    },
  },
});
