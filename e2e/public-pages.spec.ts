import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Public-page journeys (KAN-26, KAN-40) and the real-browser accessibility
 * pass (KAN-25, KAN-53).
 *
 * Nothing here signs in: these are the pages a visitor sees before they have
 * an account, and they must work with no Firebase session at all.
 */

const PUBLIC_PAGES = [
  { path: '/', name: 'landing' },
  { path: '/sign-in', name: 'sign in' },
  { path: '/register', name: 'register' },
  { path: '/forgot-password', name: 'forgot password' },
  { path: '/legal/medical-disclaimer', name: 'medical disclaimer' },
];

test.describe('public pages', () => {
  for (const page of PUBLIC_PAGES) {
    test(`${page.name} has no serious accessibility violations`, async ({ page: browserPage }) => {
      await browserPage.goto(page.path);
      const results = await new AxeBuilder({ page: browserPage })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();

      const blocking = results.violations.filter(
        (violation) => violation.impact === 'serious' || violation.impact === 'critical',
      );
      expect(blocking.map((violation) => `${violation.id}: ${violation.help}`)).toEqual([]);
    });
  }

  test('the landing page reaches sign-in and registration', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: 'Create free account' }).click();
    await expect(page).toHaveURL(/\/register$/);

    await page.getByRole('link', { name: /sign in/i }).first().click();
    await expect(page).toHaveURL(/\/sign-in$/);
  });

  test('the medical disclaimer is published verbatim', async ({ page }) => {
    await page.goto('/legal/medical-disclaimer');
    await expect(
      page.getByText(/It is not a medical device and does not provide medical diagnoses/),
    ).toBeVisible();
  });

  test('an unpublished legal document says so rather than pretending', async ({ page }) => {
    await page.goto('/legal/privacy');
    await expect(page.getByText(/has not been published yet/i)).toBeVisible();
  });

  test('the whole sign-in form is reachable by keyboard alone', async ({ page }) => {
    await page.goto('/sign-in');
    // The auth guard shows a spinner until the persisted session resolves.
    // Tabbing before the form exists proves nothing.
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();

    const reached: string[] = [];
    for (let step = 0; step < 16; step += 1) {
      await page.keyboard.press('Tab');
      reached.push(
        await page.evaluate(() => {
          const active = document.activeElement as HTMLElement | null;
          if (!active) return '';
          const type = active.getAttribute('type') ?? '';
          const text = (active.textContent ?? '').trim().slice(0, 24);
          return `${active.tagName}|${type}|${text}`;
        }),
      );
    }

    // Every control needed to sign in must be on the sequential tab path —
    // no mouse-only affordance, and no focus trap short of the submit button.
    expect(reached, reached.join('\n')).toContain('INPUT|email|');
    expect(reached, reached.join('\n')).toContain('INPUT|password|');
    expect(reached.some((entry) => entry.startsWith('BUTTON|submit|Sign in'))).toBe(true);
  });

  test('a signed-out visitor is redirected away from the app', async ({ page }) => {
    await page.goto('/upload');
    await expect(page).toHaveURL(/\/sign-in$/);
  });
});

test.describe('responsive shell', () => {
  test('the landing page does not scroll sideways on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');

    const overflows = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    );
    expect(overflows).toBe(false);
  });
});
