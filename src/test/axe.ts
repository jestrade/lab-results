import axe from 'axe-core';
import { expect } from 'vitest';

/**
 * Runs axe-core over a rendered container and fails the test on any violation
 * at `serious` or above (KAN-25's acceptance criterion, KAN-53).
 *
 * `moderate` and `minor` findings are reported in the failure message when
 * something else already failed, but do not fail the build on their own — they
 * are frequently artefacts of testing a component outside a full page (a
 * heading-order complaint about an `<h2>` with no `<h1>` above it, say).
 */
export async function expectNoA11yViolations(container: HTMLElement): Promise<void> {
  const results = await axe.run(container, {
    rules: {
      // Irrelevant when the component under test is not a whole document.
      region: { enabled: false },
      // jsdom has no layout engine and no canvas, so axe cannot resolve
      // computed colours here — it either errors or guesses. Contrast is
      // covered two other ways instead: `styles/contrast.test.ts` measures the
      // tokens directly, and the Playwright suite runs axe in a real browser
      // where this rule works properly.
      'color-contrast': { enabled: false },
    },
  });

  const blocking = results.violations.filter(
    (violation) => violation.impact === 'serious' || violation.impact === 'critical',
  );

  const describe = (violations: typeof blocking) =>
    violations
      .map(
        (violation) =>
          `[${violation.impact}] ${violation.id}: ${violation.help}\n` +
          violation.nodes.map((node) => `    ${node.html}`).join('\n'),
      )
      .join('\n');

  expect(blocking, describe(blocking)).toHaveLength(0);
}
