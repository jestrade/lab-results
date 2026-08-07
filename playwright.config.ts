import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end suite (KAN-33).
 *
 * These run against a built preview server rather than the dev server, so what
 * is tested is what ships — bundling, the router's history fallback and the
 * production security headers included.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    // KAN-53 asks for a responsive pass; running the whole suite at a phone
    // viewport is how the mobile navigation stays covered rather than checked
    // once by hand.
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
