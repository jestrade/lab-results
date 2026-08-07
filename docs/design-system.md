# LabResults design system

The visual system is **Broadsheet**, the design system bound to the Claude Design
project, retuned by a LabResults theme. Everything a feature page needs already
exists — build with it rather than writing new CSS, so the screens in Phases 2–7
stay consistent with the board.

## The three layers

| Layer | File | What it owns | Change it when |
| --- | --- | --- | --- |
| Base | `src/styles/broadsheet.css` | Element resets and the component classes (`.btn`, `.card`, `.input`, `.field`, `.tag`, `.table`, `.dialog`, `.seg`, `.radio`, `.nav`) | Never by hand — it is vendored, and is replaced wholesale when the design system updates |
| Theme | `src/styles/theme.css` | Token values: colour, type, spacing, radius, elevation, status and feedback palettes | A colour or shape changes across the product |
| App | `src/styles/app.css` | LabResults' own structures: shells, dropzone, steps, pills, toasts | A new layout pattern appears in more than one place |

Two deliberate departures from upstream Broadsheet are documented at the top of
`broadsheet.css`: the Google-hosted font `@import` is removed (we self-host Plus
Jakarta Sans, which also lets the CSP keep `font-src 'self'`), and the editorial
print-plate treatments are dropped as unused.

## Tokens

Read tokens as CSS custom properties. Never hardcode a hex value in a component.

```css
/* ✗ */  color: #6355c6;
/* ✓ */  color: var(--color-accent);
```

The palette is a nine-step neutral ramp and a nine-step accent ramp, plus
semantic groups:

- **Status** — `--status-{normal,low,high,critical,unknown}-{bg,ink}`
- **Feedback** — `--feedback-{info,success,warning,danger}-{bg,ink,border}`
- **Chart** — `--chart-{line,band,band-edge,axis,point-critical}`
- **Secondary ink** — `--color-text-muted`, `--color-text-faint`

### Why `--color-text-muted` exists

The design board writes quiet text as `color-mix(--color-text 55%, transparent)`.
Composited on white that measures **3.78:1**, below the 4.5:1 AA bar for the
12–13px sizes it is used at. `--color-text-muted` (6.49:1) and
`--color-text-faint` (5.00:1) replace that expression everywhere. Use the `.muted`
and `.faint` helper classes; do not reach for the raw `color-mix`.

`src/styles/contrast.test.ts` measures every ink/surface pair on every run, so
retuning a colour below AA fails CI rather than an audit.

## Status is never colour alone

This is the rule the whole component layer is built to enforce (spec §60,
KAN-25, KAN-53). `src/domain/status.ts` maps every status to a **label**, an
**icon** and a **description**. Components read that table; they never pick their
own.

```tsx
<ResultStatusBadge status="critical" />
// → 🛑 icon + the word "Critical" + a critical-toned pill
```

Strip the colour and the badge still reads. Consequences for new code:

- Never signal meaning with colour alone — add the label from the table.
- Never write a new status string; add it to `domain/status.ts` and the union in
  `domain/types.ts`, and the tests will hold you to a label, icon and description.
- Icons are decorative (`aria-hidden`) because the text beside them already says
  it. Pass `title` to `<Icon>` only for an icon that is genuinely alone.

## Components

| Component | Use for | Notes |
| --- | --- | --- |
| `Button` / `ButtonLink` | Actions / navigation | `ButtonLink` stays a link to assistive tech |
| `Card` | Grouped content | `kicker` / `title` / `footer` slots |
| `Tag` | Neutral metadata | Not for status — use a badge |
| `ResultStatusBadge` | low / normal / high / critical / unknown | `describe` adds the long form for screen readers |
| `ReportStatusBadge` | Report lifecycle | Spins on `processing` |
| `ConfidenceTag` | Extraction confidence | Renders nothing for `high` — only the exceptions are flagged |
| `TrendBadge` | Direction of travel | Wording is value-neutral by contract |
| `Field` + `TextInput` / `PasswordInput` / `Checkbox` | Forms | `Field` wires label, `aria-describedby`, `aria-invalid` and the error's `role="alert"` |
| `DataTable` | Tabular data | Sort buttons inside `<th>`, `aria-sort` on the header, required `caption` |
| `Modal` | Dialogs | Native `<dialog>` — focus trap, Escape and top layer come free |
| `Alert` | Inline feedback | `live` announces it; use for anything the user just caused |
| `ToastProvider` / `useToast` | Transient confirmation | Region is always mounted so announcements land |
| `EmptyState` | Nothing to show | Always pair with the action that fills it |
| `Skeleton*` | Loading | `aria-hidden`; the container carries `role="status"` |
| `DisclaimerBanner` | Required medical disclaimer | `short` in-app, `full` on public pages |
| `FileDropzone` | PDF upload | Button + hidden input, so keyboard and drag reach the same control |
| `ProgressBar` / `StepIndicator` | Upload and processing progress | Real `progressbar` / ordered-list semantics |

## Regulated copy

Disclaimer text lives in `src/domain/disclaimers.ts`, quoted verbatim from the
spec, and is pinned by `disclaimers.test.ts`. Import it — never retype it, never
paraphrase it, never interpolate into it. If Legal revises the wording, that file
and its test are the only places to change.

## Accessibility baseline

Every screen is expected to clear WCAG 2.1 AA. What is already handled for you:

- Focus is visible everywhere (`:focus-visible`, from Broadsheet).
- Every layout starts with a skip link to `#main`.
- Form errors are announced and tied to their field by `Field`.
- `prefers-reduced-motion` is honoured globally in `theme.css`.
- Modals trap focus and close on Escape via native `<dialog>`.

What each new page owes: one `<h1>`, headings in order, a `caption` on tables, a
text alternative for any chart, and an axe assertion in its test:

```tsx
it('has no serious accessibility violations', async () => {
  const { container } = renderWithProviders(<MyPage />);
  await expectNoA11yViolations(container);
});
```

`expectNoA11yViolations` fails on `serious` and `critical` findings. Contrast is
checked separately — by the token test, and by axe in a real browser in the
Playwright suite, since jsdom cannot compute colour.

## Responsive

Breakpoints are `sm 640 / md 768 / lg 1024 / xl 1280`. The design board is drawn
at a fixed 1440px desktop frame; `app.css` is the responsive reading of it. The
significant collapse is at `lg`: the app sidebar becomes an off-canvas drawer and
the auth screens drop their violet panel. Both use the same markup at every size —
there is one navigation, not a desktop one and a mobile one.
