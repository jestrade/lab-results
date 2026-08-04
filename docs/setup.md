# Running LabResults locally

## Prerequisites

- Node 20 or later (22 is what CI uses)
- The Firebase CLI, if you want the emulators: `npm install -g firebase-tools`

## First run

```bash
npm install
cp .env.example .env.local   # then fill it in — see below
npm run dev
```

## Configuration

`.env.local` holds the Firebase web config. The values are public by design:
they identify the project, they do not grant access. Access is enforced by
`firestore.rules` and `storage.rules`, never by keeping these secret. They are
still gitignored, so that switching projects is a local change.

`src/lib/env.ts` validates them at startup and fails with one clear message
listing everything missing, rather than letting `undefined` disappear into the
Firebase SDK.

| Variable | Purpose |
| --- | --- |
| `VITE_FIREBASE_*` | Web app config from the Firebase console |
| `VITE_USE_FIREBASE_EMULATORS` | `true` routes Auth/Firestore/Storage to the local suite |
| `VITE_SENTRY_DSN` | Leave blank to disable error reporting entirely |

## Two ways to run

**Against the emulators** (no live project touched):

```bash
npm run emulators   # in one terminal
npm run dev         # in another, with VITE_USE_FIREBASE_EMULATORS=true
```

**Against the real project** — set `VITE_USE_FIREBASE_EMULATORS=false`. Deploy
the rules first, or every read and write will be denied:

```bash
firebase deploy --only firestore:rules,firestore:indexes,storage
```

## Firebase console setup

The app expects these to be enabled in the project. None of it can be done from
the codebase.

1. **Authentication → Sign-in method**: enable **Email/Password** and **Google**.
2. **Authentication → Settings → Authorized domains**: add the hosting domain
   (`localhost` is authorized by default).
3. **Firestore** and **Storage**: create both, then deploy the rules above.
4. **Custom claims**: the `role` claim is what grants admin. It has to be set by
   a trusted server — a Cloud Function or the Admin SDK — never by the client.
   See the note in `firestore.rules`.

## Everyday commands

| Command | Does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm test` | Unit and component tests |
| `npm run test:coverage` | The same, with coverage |
| `npm run e2e` | Playwright, against a production build |
| `npm run lint` / `npm run typecheck` | Static checks |
| `npm run audit:deps` | Dependency audit (`high` and above fails) |

`npm run e2e` needs browsers once: `npx playwright install chromium`.

## CI/CD

`.github/workflows/ci.yml` runs four jobs: **verify** (lint, typecheck, unit
tests, build), **e2e**, **security** (`npm audit` + gitleaks), and **deploy** to
Firebase Hosting on a green push to `main`.

Deploy needs these repository secrets: `FIREBASE_SERVICE_ACCOUNT`, each
`VITE_FIREBASE_*`, and `VITE_SENTRY_DSN`. The build job uses dummy values
instead — a build must never depend on production secrets.
