# LabResults

An AI-assisted laboratory result **organization and education** platform. Users
upload laboratory report PDFs; the system extracts every value, classifies it
against the reference range printed on that report, tracks it over time, and
explains it in plain language.

It is not a medical device, and every AI-generated statement is labelled as such.
See [the medical disclaimer](src/domain/disclaimers.ts).

React + TypeScript + Vite on Firebase (Auth, Firestore, Storage, Hosting).

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

## Layout

```
src/
  auth/         Session, role and route guards
  components/   The component library (KAN-39)
  domain/       Types, status tables and regulated copy — no React
  layouts/      Public, auth-split and authenticated shells
  lib/          Firebase, environment and monitoring plumbing
  pages/        Screens, grouped by who can reach them
  services/     Firestore and Storage access
  styles/       Broadsheet base, LabResults theme, app layout
firestore.rules storage.rules   The real security boundary
config/quotas.json              Every capacity limit, in one place
functions/                      Cloud Functions: usage accounting, roles
```

## Two rules worth knowing before you write code

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

## Phase 1 scope

This repository currently covers Phase 1: the design system and app shell,
authentication, the public pages, the report-upload flow, the Firestore/Storage
data model and rules, plus test infrastructure, CI/CD, observability and the
security baseline. Screens built in later phases resolve to a placeholder naming
the ticket that builds them.
