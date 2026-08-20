# AI provider

All AI work runs through one narrow interface, `AiProvider`. Nothing above that
interface knows which model is answering. Today it is **Gemini 2.5 Flash**,
reached through **Firebase AI Logic**; changing either is a config change, and
changing *vendor* is one new file.

> **The API key never reaches the browser.** Every AI call is made from a Cloud
> Function. The web app has no code path that could hold the key, and it must
> never be given a `VITE_` prefix — Vite inlines those into the JS bundle at
> build time, which publishes them.

## The two paths to the same model

`AI_MODEL` in the root `.env` chooses how the request reaches Gemini. Both
paths end at the same model; what differs is who holds the credential.

| `AI_MODEL` | Path | Credential |
| --- | --- | --- |
| `firebase` **(default)** | [Firebase AI Logic](https://firebase.google.com/docs/ai-logic/get-started?platform=web), which proxies to the Gemini Developer API or Vertex AI | The public Firebase web config |
| `gemini` | The Gemini Developer API directly, via `@google/genai` | `GEMINI_API_KEY` in Secret Manager |

Firebase AI Logic is the default because it needs no additional secret. The web
config it authenticates with — `apiKey`, `projectId`, `appId` — identifies the
project rather than granting access to it, is already in the browser bundle, and
is mirrored into the functions environment by `npm run sync:env`. There is
nothing extra to mint, rotate, bind at deploy time, or leak.

The direct Gemini path is kept, tested and deployable. Set `AI_MODEL=gemini`
and redeploy to use it; nothing else changes.

### Enabling Firebase AI Logic

Once, per project: Firebase console → **AI Logic** → enable it, choosing the
Gemini Developer API (`api=dev`). This turns on `firebasevertexai.googleapis.com`.
If it is not enabled, every call fails with a message that says so.

### Which backend Firebase proxies to

```
FIREBASE_AI_BACKEND=googleai   # Gemini Developer API — free tier, no Cloud billing
FIREBASE_AI_BACKEND=vertexai   # Vertex AI — Blaze plan, never trains on your content
```

`googleai` is the default and matches the free tier this project runs on.

### App Check, from a caller that cannot be attested

Firebase AI Logic requires an App Check token. In a browser the SDK gets one by
attesting that it is a genuine instance of your app; a Cloud Function is not an
app instance and cannot make that claim. Without a token the API answers:

```
401 Firebase App Check token is invalid
```

The way through is the pair of hooks Firebase provides for exactly this shape of
caller. `firebase-admin` mints a token for the registered web app with
`appCheck().createToken()`, and the client SDK accepts it through a
`CustomProvider`. `providers/firebase.ts` wires the two together at app
initialisation, and it is why `FIREBASE_APP_ID` must name a **registered web
app** rather than any string.

The trust here does not come from attestation — it comes from holding the
service account, which is a stronger claim than a browser can make, not a weaker
one. The deployed function's service account needs the **Firebase App Check
Token Creator** role; the default App Engine service account has it via Editor.

Minting is best-effort: if it fails, the provider logs a warning and calls
proceed without a token, because a project with enforcement switched off does
not need one and failing the whole pipeline would turn an optional control into
a hard dependency.

### Which models this path serves

Not the same set as the direct API. As of this writing Firebase AI Logic answers
`gemini-2.5-flash` with *"no longer available to new users"* and points at
`gemini-3.6-flash`, while a `GEMINI_API_KEY` that already had 2.5 keeps working.
That is why `FIREBASE_AI_MODEL` and `GEMINI_MODEL` are separate variables with
separate defaults and **no fallback between them** — a shared default breaks
whichever path was not tested last, with a 404 that reads as a broken provider.

Gemini 3.x models reason before answering and bill it as output tokens. The
provider sends `thinkingConfig: { thinkingBudget: 0 }`, the same decision the
direct path makes, because these tasks are extraction and plain-language
explanation. The field is not in the SDK's `GenerationConfig` type yet, so it
goes through a cast — safely, because the SDK forwards `generationConfig`
verbatim and the API rejects unknown keys with a 400 rather than ignoring them.

## Swapping the model

Edit the root `.env` and redeploy:

```
FIREBASE_AI_MODEL=gemini-2.5-pro   # when AI_MODEL=firebase
GEMINI_MODEL=gemini-2.5-pro        # when AI_MODEL=gemini
```

No code changes. Two variables rather than one because Vertex AI and the Gemini
Developer API have diverged on model ids before, and a name pinned for one path
should not silently follow you onto the other. `gemini-2.5-flash-lite` is
cheaper (\$0.10/\$0.40 per 1M tokens vs \$0.30/\$2.50); `gemini-2.5-pro` is
stronger and ~4x the input cost.

## Adding a provider

Three steps, none of which touch the pipeline, the prompts or the data model:

1. Write `functions/src/ai/providers/<name>.ts` exporting a factory that returns
   an `AiProvider`.
2. Add the id to `AiProviderId` in `functions/src/ai/config.ts`.
3. Add one case to the switch in `functions/src/ai/registry.ts`.

The switch is exhaustive over `AiProviderId`, so adding an id without a case is
a compile error rather than a runtime surprise. `providers/shared.ts` already
carries the timeout and retry/backoff behaviour, so a new provider inherits what
was tuned for the existing ones instead of reimplementing it slightly wrong.

## Layout

| File | Responsibility |
| --- | --- |
| `ai/types.ts` | The interface. Provider-agnostic; no vendor concepts leak in. |
| `ai/config.ts` | Model, tuning and secret resolution from environment. |
| `ai/registry.ts` | Provider selection **and the redaction guarantee**. |
| `ai/redaction.ts` | Identifier stripping before anything leaves the process. |
| `ai/prompts.ts` | Versioned templates and the shared safety preamble. |
| `ai/providers/shared.ts` | Timeout and retry/backoff, shared by every provider. |
| `ai/providers/firebase.ts` | The only file that knows Firebase AI Logic exists. |
| `ai/providers/gemini.ts` | The only file that knows `@google/genai` exists. |
| `ai/healthCheck.ts` | Admin-only connectivity probe. |

## The redaction guarantee

`getAiProvider()` is the only exported way to obtain a provider, and what it
returns is always wrapped in the redaction decorator. The raw constructors are
not exported.

That is deliberate. Redaction each caller has to remember is redaction that will
eventually be forgotten. Making the wrapped provider the only reachable one
turns the landing page's promise — "Identifiers redacted before AI" — into a
property of the architecture rather than a convention.

**What it removes:** email addresses, phone numbers, URLs, dates, long digit
runs (record numbers, national IDs), postcodes.

**What it does not remove: personal names.** A name is just a capitalised word,
and so is a laboratory, a city, a test and a unit. Regexes cannot tell them
apart, and trying either misses most names or shreds the clinical text. Names
need NER at extraction time, where the document structure is known and a name
sits in a header field rather than loose in prose. Until that exists:

> Do not describe this to users as anonymisation. It is a floor, not a guarantee.

**What it deliberately preserves:** laboratory values and reference ranges.
Decimal measurements are masked out before the identifier rules run, and the
identifier rules carry a digit-count floor so that integer ranges like `70-100`
and `130-170` survive. This is not incidental — an early version of these rules
turned the haemoglobin range `13.0-17.0` into `[DATE].0`, which would have
silently corrupted classification and surfaced as inexplicably wrong results
much later. There are regression tests for both cases.

## Safety, and where it actually comes from

Every prompt carries a shared preamble forbidding diagnosis, treatment advice,
invented reference ranges, value judgements and speculation about causes. It
also tells the model to treat document content as data, not instructions
(prompt-injection defence, spec §64).

**But the prompt is the weakest control in the stack.** The real guarantees are
structural:

- **Classification is arithmetic, in code.** Whether a value is low, normal,
  high or critical is computed against the range printed on the report. The
  model is never asked to decide it — only to describe a decision already made.
  A hallucination cannot change a classification, because the model is never
  consulted about one.
- **Reference ranges are passed in and quoted back**, never recalled from the
  model's memory, because remembered ranges are exactly the plausible-but-wrong
  detail language models produce.

Treat the prompt as shaping tone and refusals. Do not rely on it for
correctness.

## Privacy: the free tier trains on your data

On the Gemini **free tier**, Google's terms allow submitted content to be used
to improve their products. For laboratory reports that is a disclosure
obligation, not a footnote.

This is a property of the *tier*, not of the path: routing through Firebase AI
Logic with `FIREBASE_AI_BACKEND=googleai` reaches the same Gemini Developer API
under the same terms. The disclosure the UI makes — that reports are processed
by Google Gemini — stays accurate either way, because both paths end at Google.

The app reports this truthfully rather than hiding it: every generated artefact
records `contentUsedForTraining`, and the health check surfaces it.

To move to the paid tier, where content is not used for training:

1. Enable billing on the project.
2. Set `AI_BILLING_ENABLED=true` in the root `.env`. (`GEMINI_BILLING_ENABLED`
   is the name this had before and is still read.)
3. Redeploy.

The flag defaults to "yes, it may be trained on", because an unset variable
almost certainly means nobody has enabled billing. The safe default for a
privacy flag is the pessimistic one.

`FIREBASE_AI_BACKEND=vertexai` is the one case that needs no flag: Vertex AI
does not use customer content for training under any tier, so the code reports
`contentUsedForTraining: false` without being told. It requires the Blaze plan.

**Whichever tier you use, the AI Processing Disclosure (KAN-22) has to state
what is sent and what may be done with it.** The registration consent already
asks users to agree to third-party AI processing; that consent is only
meaningful if the disclosure it points at is accurate.

## The credentials

### Firebase AI Logic (`AI_MODEL=firebase`) — nothing to store

It authenticates with the Firebase web config, which is already public. `npm run
sync:env` mirrors the three values it needs out of the `VITE_FIREBASE_*` block
of the root `.env` into `functions/.env`, unprefixed:

```
FIREBASE_API_KEY
FIREBASE_PROJECT_ID
FIREBASE_APP_ID
```

Setting any of them explicitly in the root `.env` overrides the mirror, which is
how you point the functions at a different Firebase app than the browser bundle.
On a deployed function `projectId` has a third source — the runtime injects
`FIREBASE_CONFIG` — so a deploy that skipped the sync still finds its project.

This direction is safe and the reverse is not: the prefix rule exists to stop
secrets reaching the browser, and this moves public values toward the server.

### Direct Gemini (`AI_MODEL=gemini`) — the key

**Deployed** — Secret Manager, never a file:

```bash
firebase functions:secrets:set GEMINI_API_KEY
```

**Local emulator** — put it in the root `.env`, unprefixed:

```
GEMINI_API_KEY=...
```

`npm run sync:env` routes it to `functions/.env.local`, which is gitignored and
which Firebase never deploys. Non-secret selection (`AI_MODEL`,
`FIREBASE_AI_MODEL`, `GEMINI_MODEL`) goes to `functions/.env`, which *is*
deployed as function environment config. Both are generated — edit the root
`.env`, not them.

`GEMINI_API_KEY` stays declared as a secret on every AI function even under
`AI_MODEL=firebase`, which does not use it. The point of keeping both providers
is being able to flip one variable and redeploy; a secret bound on only one of
the two branches turns that flip into a failed deploy at the worst moment.

Do not give the key a `VITE_` prefix. `sync:env` will refuse to run, because
that prefix would compile it into the browser bundle.

## Verifying it works

"Is the key right, is the model name right, is the secret bound in this
environment" are three different failures that all present identically as a
failed report, hours later, in a queue. The health check answers them in one
call, before any real report depends on it.

Call `aiHealthCheck` as an admin. It sends a fixed prompt with no report data
and returns provider, model, latency, token usage and the training flag.

It is the fastest way to confirm a provider switch actually took: `provider`
comes back as `firebase` or `gemini`. The failures specific to Firebase AI Logic
come back as sentences naming the cause rather than a bare status code:

| What you see | What it means |
| --- | --- |
| `api-not-enabled` | Firebase AI Logic is not turned on for the project |
| a message naming App Check | The function could not mint a token — check the service account's role and that `FIREBASE_APP_ID` is a registered web app |
| `no longer available to new users` | `FIREBASE_AI_MODEL` names a model this path no longer serves |
| `no AI credits left` | Billing, not quota. Waiting will not clear it |

## Cost

Budgets live in `config/quotas.json` under `ai`, alongside the Firebase caps —
see [quotas.md](quotas.md).

| | |
| --- | --- |
| Free tier | \$0, content may be used for training |
| Paid, 2.5 Flash | \$0.30 per 1M input, \$2.50 per 1M output |
| Rough cost per report | ~\$0.01 at ~4K tokens |

Three things keep this bounded: `maxOutputTokens` caps every call,
`thinkingBudget: 0` stops 2.5 models spending output tokens on reasoning these
tasks do not need, and variable explanations are cached **per variable** rather
than generated per user — the same explanation of what haemoglobin measures
serves everyone.

**AI spend is not a Firebase allowance and is not covered by the Blaze caps.**
It is billed separately. The \$1 GCP billing budget in
[quotas.md](quotas.md#what-this-does-not-protect-against) is what catches it.
