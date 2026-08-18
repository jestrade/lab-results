# Running LabResults locally

## Prerequisites

- Node 20 or later (22 is what CI uses)
- The Firebase CLI, if you want the emulators: `npm install -g firebase-tools`

## First run

```bash
npm install
cp .env.example .env   # then fill it in — see below
npm run dev
```

## Configuration

### One file

**`.env` at the repository root is the only environment file you edit.**
`functions/.env` and `functions/.env.local` are generated from it by
`npm run sync:env` (which `dev`, `emulators` and the functions build all run
for you). They are gitignored; editing them directly loses the change on the
next sync.

The prefix is the security boundary, and it is enforced:

| Prefix | Reaches | Notes |
| --- | --- | --- |
| `VITE_*` | the browser | Vite inlines these into the bundle. **Public.** |
| anything else | Cloud Functions only | Never enters the bundle. Credentials go here. |

`sync:env` refuses to run if a known secret is given a `VITE_` prefix, because
that one prefix is all that separates "server-side secret" from "published on
the next deploy".

The Firebase web config values are public by design:
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
| `VITE_GA_MEASUREMENT_ID` | GA4 id. Leave blank to disable analytics entirely |
| `AI_PROVIDER`, `GEMINI_MODEL` | AI provider and model selection — see [ai.md](ai.md) |
| `GEMINI_API_KEY` | **Server-only.** Emulator reads it here; deploys read Secret Manager |

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

   Leave `VITE_FIREBASE_AUTH_DOMAIN` as the default `<project>.firebaseapp.com`.
   Pointing it at your Hosting domain makes `signInWithPopup` same-origin —
   genuinely better, because the popup then does not depend on third-party
   storage — but Firebase's auto-created Google OAuth client only authorises
   `https://<project>.firebaseapp.com/__/auth/handler`. Changing `authDomain`
   alone breaks Google sign-in with **Error 400: redirect_uri_mismatch**, which
   is awkward to diagnose because it fails on Google's side after the popup
   opens. To make the switch, do both halves: change the variable *and* add
   `https://<hosting-domain>/__/auth/handler` to the OAuth client's authorised
   redirect URIs in Google Cloud Console → APIs & Services → Credentials.
3. **Firestore** and **Storage**: create both, then deploy the rules above.
4. **Custom claims**: the `role` claim is what grants admin. It is set by the
   `setUserRole` callable in `functions/src/roles.ts`, which requires an admin
   caller — so the *first* admin must be bootstrapped by hand:

   ```bash
   firebase functions:shell
   > admin.auth().setCustomUserClaims('<uid>', { role: 'admin' })
   ```

   After that, **/admin/users** grants and removes the claim for everyone else,
   and disables or re-enables an account through `setUserDisabled`
   (`functions/src/userAdmin.ts`). Neither is offered on your own row: an admin
   who removes their own claim or locks their own account cannot undo either,
   and on a project with one admin that is every administrative operation gone
   until somebody returns to the shell above.

   Note what a granted claim does *not* do: reach a session that is already
   open. It arrives on that session's next token refresh — within the hour, or
   immediately if the user signs in again. Disabling has the mirror-image
   property, since `firestore.rules` reads the token rather than the Auth
   record: sign-in and token renewal stop at once, and a token already minted
   runs out its remaining lifetime. To end access immediately, delete the
   account.

5. **Billing budget** — required, and not optional. The capacity caps protect
   the free tier, not the bill. Set a $1 budget with alerts at 50/90/100% on
   project `labresults-2a13f`. Full rationale in
   [quotas.md](quotas.md#what-this-does-not-protect-against).

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
| `npm run sync:env` | Regenerate `functions/.env*` from the root `.env` |
| `npm run test:functions` | Build and test the Cloud Functions package |
| `npm run build:functions` | Compile the Cloud Functions package |

`npm run e2e` needs browsers once: `npx playwright install chromium`.

## CI/CD

`.github/workflows/ci.yml` runs five jobs:

| Job | When | Does |
| --- | --- | --- |
| `verify` | every push and PR | lint, typecheck, unit tests with coverage, build |
| `e2e` | after `verify` | Playwright on desktop and mobile, including the axe pass |
| `security` | every push and PR | `npm audit` at `high`, gitleaks over the history |
| `preview` | PRs from this repo | deploys a Hosting preview channel against **staging** |
| `deploy` | green push to `main` | builds and deploys hosting + rules to production |

Dependabot (`.github/dependabot.yml`) opens grouped dependency PRs weekly.

### Required repository secrets

| Secret | Used by |
| --- | --- |
| `FIREBASE_SERVICE_ACCOUNT` | production deploy |
| `FIREBASE_STAGING_SERVICE_ACCOUNT` | PR previews |
| `VITE_FIREBASE_*` | production build |
| `VITE_STAGING_FIREBASE_*` | preview build |
| `VITE_SENTRY_DSN` | production build |

The `verify` job builds with dummy values instead — a build must never depend on
production secrets. Previews point at the staging project, never production, so
a PR build cannot reach real users' data.

Two things still have to be set in GitHub itself, because a workflow cannot set
them: **branch protection** on `main` requiring the `verify`, `e2e` and
`security` checks, and least-privilege IAM on both deploy service accounts.
