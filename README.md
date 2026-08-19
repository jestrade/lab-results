# LabResults

An AI-assisted laboratory result **organization and education** platform. Users
upload laboratory report PDFs; the system extracts every value, classifies it
against the reference range printed on that report, tracks it over time, and
explains it in plain language.

It is not a medical device, and every AI-generated statement is labelled as such.
See [the medical disclaimer](src/domain/disclaimers.ts).

React + TypeScript + Vite on Firebase (Auth, Firestore, Storage, Hosting).
Bilingual (English and Spanish) with light, dark and system themes.

## Getting started

See **[docs/setup.md](docs/setup.md)**.

```bash
npm install && npm run dev
```

## Documentation

- **[docs/setup.md](docs/setup.md)** — local development, configuration, CI/CD
- **[docs/design-system.md](docs/design-system.md)** — tokens, components, the
  accessibility baseline every page is held to
- **[docs/quotas.md](docs/quotas.md)** — capacity limits, how they are enforced,
  and the billing budget you must set up by hand
- **[docs/ai.md](docs/ai.md)** — the AI provider layer, swapping models or
  vendors, and what redaction does and does not do
- **[docs/variables.md](docs/variables.md)** — the laboratory-variable catalog:
  how a printed test name is matched to it, why it never edits itself, and how
  to import the maintained spreadsheet

## Layout

```
src/
  auth/         Session, role and route guards
  components/   The component library (KAN-39)
  domain/       Types, status tables and regulated copy — no React
  hooks/        Cross-page state: locale, AI consent, storage quota, page views
  i18n/         Message catalogs, the provider, and per-locale formatting
  layouts/      Public, auth-split and authenticated shells
  lib/          Firebase, environment and monitoring plumbing
  pages/        Screens, grouped by who can reach them (pages/app/admin needs
                the admin role)
  services/     Firestore and Storage access
  styles/       Broadsheet base, LabResults theme, app layout
  test/         Render helpers, the axe harness and the Vitest setup
  theme/        Light/dark/system preference, resolved and persisted
firestore.rules storage.rules   The real security boundary
config/quotas.json              Every capacity limit, in one place
config/retry.json               When a failed report may be processed again
config/variables.json           The laboratory-variable catalog, as imported
                                from the maintained spreadsheet
config/variable-review.json     Curation decisions applied to that catalog
config/csp.mjs                  One Content-Security-Policy for dev, preview
                                and hosting
functions/                      Cloud Functions: the extraction pipeline, usage
                                accounting, roles, account deletion, retries,
                                trend analysis and catalog enrichment
functions/scripts/              Catalog import, curation, merges and backfill
                                (docs/variables.md)
```

## Three rules worth knowing before you write code

**Status is never colour alone.** Every status carries an icon and a text label
from `domain/status.ts`. See the design-system doc.

**The client never writes what the pipeline owns.** Extracted results,
classifications, processing state and audit records are written by the Admin SDK
only. `firestore.rules` denies them from the browser, which is what makes the
extracted data trustworthy.

**Everything runs inside the free tier.** 400 MiB per user, 4 GiB in total,
enforced in `storage.rules` against counters that Cloud Functions maintain. All
the numbers live in one file, `config/quotas.json`. See
[docs/quotas.md](docs/quotas.md) — and note that upload *operations*, not
stored bytes, are what actually binds.

## What is built

**Public** — landing, the legal pages, and the full authentication flow:
sign-in, registration, password reset and email verification.

**The app** — uploading a report and watching it process; the report list and a
detail page for each; the laboratory-variable grid at `/variables`, which is the
home screen, and a page per variable with its history, reference band and zoom;
the profile and account settings, including the AI consent gate and account
deletion.

**Administration** — an overview, account management, and the variable-catalog
review queue. The job dashboard is still a placeholder naming the ticket that
builds it.

**The pipeline** — extraction, classification against the range printed on the
report, duplicate detection, usage accounting and quota enforcement, retries,
trend analysis, matching each printed name to the catalog, catalog enrichment,
and AI analysis behind an explicit consent gate.
