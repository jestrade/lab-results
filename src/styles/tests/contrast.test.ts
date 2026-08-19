import { describe, expect, it } from 'vitest';

// Imported as raw text rather than read from disk: Vite resolves it the same
// way the app does, so the test reads exactly the file that ships.
import themeCss from '../theme.css?raw';

/**
 * Token contrast guard (KAN-25, KAN-53).
 *
 * Reads the ink/surface pairs straight out of `theme.css` and measures each
 * one. This is here so that retuning a colour cannot quietly drop the app
 * below WCAG AA — the failure arrives in CI, not in an accessibility audit
 * six months later.
 */

/**
 * The light theme's value for a token — the first definition in the file,
 * which is the `:root` block.
 */
function token(name: string): string {
  const match = themeCss.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!match?.[1]) throw new Error(`Token --${name} not found in theme.css`);
  return match[1];
}

/**
 * The dark theme's value, read from inside the `:root[data-theme='dark']`
 * block only.
 *
 * Scoped rather than "the second match in the file", so that adding a token to
 * one block and not the other fails loudly here instead of silently measuring
 * the light value twice and reporting that dark mode passes.
 */
const darkBlock = (() => {
  const start = themeCss.indexOf("[data-theme='dark']");
  if (start === -1) throw new Error("No :root[data-theme='dark'] block in theme.css");
  const open = themeCss.indexOf('{', start);
  const end = themeCss.indexOf('\n}', open);
  return themeCss.slice(open, end);
})();

function darkToken(name: string): string {
  const match = darkBlock.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!match?.[1]) {
    throw new Error(`Token --${name} has no dark value in theme.css`);
  }
  return match[1];
}

function channels(hex: string): [number, number, number] {
  const value = hex.replace('#', '');
  return [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16)) as [
    number,
    number,
    number,
  ];
}

function relativeLuminance(hex: string): number {
  const [r, g, b] = channels(hex).map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const [lighter, darker] = a > b ? [a, b] : [b, a];
  return (lighter + 0.05) / (darker + 0.05);
}

const AA_NORMAL = 4.5;

/** What semi-transparent ink actually becomes once painted over its ground. */
function composite(foreground: string, background: string, alpha: number): string {
  const f = channels(foreground);
  const b = channels(background);
  return `#${f
    .map((channel, index) => Math.round(channel * alpha + b[index]! * (1 - alpha)))
    .map((channel) => channel.toString(16).padStart(2, '0'))
    .join('')}`;
}

/**
 * Both themes are held to the same bar.
 *
 * Run as one parametrised suite rather than a light suite plus a dark one, so
 * that a check added for either theme is automatically demanded of the other.
 * A dark theme is a common accommodation for light sensitivity and migraine,
 * which makes "dark is a bit less legible" precisely the wrong trade.
 */
describe.each([
  ['light', token],
  ['dark', darkToken],
])('%s theme token contrast', (_theme, value) => {
  const statusPairs = ['normal', 'low', 'high', 'critical', 'unknown'];

  it.each(statusPairs)('result status "%s" meets AA for normal text', (status) => {
    const ratio = contrastRatio(value(`status-${status}-ink`), value(`status-${status}-bg`));
    expect(ratio).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  const feedbackTones = ['info', 'success', 'warning', 'danger'];

  it.each(feedbackTones)('feedback tone "%s" meets AA for normal text', (tone) => {
    const ratio = contrastRatio(value(`feedback-${tone}-ink`), value(`feedback-${tone}-bg`));
    expect(ratio).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  // `--panel-bg` is included because it is the lightest of the three grounds in
  // dark and so the one the quiet inks come closest to disappearing against —
  // it is what the settings sections and every input are painted with.
  it('muted body text meets AA on the page ground, a card and a panel', () => {
    for (const ground of [value('color-bg'), value('color-surface'), value('panel-bg')]) {
      expect(contrastRatio(value('color-text-muted'), ground)).toBeGreaterThanOrEqual(AA_NORMAL);
      expect(contrastRatio(value('color-text-faint'), ground)).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('body text meets AA on the flagged variable-card washes', () => {
    for (const status of ['critical', 'high', 'low']) {
      const wash = value(`status-${status}-wash`);
      expect(contrastRatio(value('color-text'), wash)).toBeGreaterThanOrEqual(AA_NORMAL);
      expect(contrastRatio(value('color-text-muted'), wash)).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  // The sign-in aside quiets two of its lines with opacity rather than a
  // colour, so what actually lands on screen is a composite. Measuring the
  // token alone would pass while the rendered text sat below the bar — which
  // is exactly the bug the comment on `.auth-aside-foot` records catching.
  it.each([
    ['full strength', 1],
    ['the aside foot at 0.9', 0.9],
    ['a point body at 0.86', 0.86],
  ])('large accent surfaces carry their ink at %s', (_label, alpha) => {
    const surface = value('color-accent-surface');
    const ink = composite(value('color-accent-surface-ink'), surface, alpha);
    expect(contrastRatio(ink, surface)).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('the accent carries its ink, as the primary button and hero rely on', () => {
    expect(
      contrastRatio(value('color-accent-ink'), value('color-accent')),
    ).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('the accent ink still reads on the hover step the button darkens to', () => {
    expect(
      contrastRatio(value('color-accent-ink'), value('color-accent-600')),
    ).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('accent links meet AA on the page ground, and so does their hover step', () => {
    expect(contrastRatio(value('color-accent'), value('color-bg'))).toBeGreaterThanOrEqual(
      AA_NORMAL,
    );
    expect(contrastRatio(value('color-accent-700'), value('color-bg'))).toBeGreaterThanOrEqual(
      AA_NORMAL,
    );
  });
});
