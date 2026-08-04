import { describe, expect, it } from 'vitest';

// Imported as raw text rather than read from disk: Vite resolves it the same
// way the app does, so the test reads exactly the file that ships.
import themeCss from './theme.css?raw';

/**
 * Token contrast guard (KAN-25, KAN-53).
 *
 * Reads the ink/surface pairs straight out of `theme.css` and measures each
 * one. This is here so that retuning a colour cannot quietly drop the app
 * below WCAG AA — the failure arrives in CI, not in an accessibility audit
 * six months later.
 */

function token(name: string): string {
  const match = themeCss.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`));
  if (!match?.[1]) throw new Error(`Token --${name} not found in theme.css`);
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

describe('theme token contrast', () => {
  const statusPairs = ['normal', 'low', 'high', 'critical', 'unknown'];

  it.each(statusPairs)('result status "%s" meets AA for normal text', (status) => {
    const ratio = contrastRatio(token(`status-${status}-ink`), token(`status-${status}-bg`));
    expect(ratio).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  const feedbackTones = ['info', 'success', 'warning', 'danger'];

  it.each(feedbackTones)('feedback tone "%s" meets AA for normal text', (tone) => {
    const ratio = contrastRatio(token(`feedback-${tone}-ink`), token(`feedback-${tone}-bg`));
    expect(ratio).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('muted body text meets AA on both the page ground and a card surface', () => {
    for (const ground of [token('color-bg'), token('color-surface')]) {
      expect(contrastRatio(token('color-text-muted'), ground)).toBeGreaterThanOrEqual(AA_NORMAL);
      expect(contrastRatio(token('color-text-faint'), ground)).toBeGreaterThanOrEqual(AA_NORMAL);
    }
  });

  it('the accent carries white text, as the primary button and hero rely on', () => {
    expect(contrastRatio('#ffffff', token('color-accent'))).toBeGreaterThanOrEqual(AA_NORMAL);
  });

  it('accent links meet AA on the page ground', () => {
    expect(contrastRatio(token('color-accent'), token('color-bg'))).toBeGreaterThanOrEqual(
      AA_NORMAL,
    );
  });
});
