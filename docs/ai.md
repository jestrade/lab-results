# AI provider

All AI work runs through one narrow interface, `AiProvider`. Nothing above that
interface knows which model is answering. Today it is **Gemini 2.5 Flash**;
changing that is a config change, and changing *vendor* is one new file.

> **The API key never reaches the browser.** Every AI call is made from a Cloud
> Function. The web app has no code path that could hold the key, and it must
> never be given a `VITE_` prefix — Vite inlines those into the JS bundle at
> build time, which publishes them.

## Swapping the model

Edit the root `.env` and redeploy:

```
GEMINI_MODEL=gemini-2.5-pro
```

No code changes. `gemini-2.5-flash-lite` is cheaper (\$0.10/\$0.40 per 1M tokens
vs \$0.30/\$2.50); `gemini-2.5-pro` is stronger and ~4x the input cost.

## Swapping the provider

Three steps, none of which touch the pipeline, the prompts or the data model:

1. Write `functions/src/ai/providers/<name>.ts` exporting a factory that returns
   an `AiProvider`.
2. Add the id to `AiProviderId` in `functions/src/ai/config.ts`.
3. Add one case to the switch in `functions/src/ai/registry.ts`.

The switch is exhaustive over `AiProviderId`, so adding an id without a case is
a compile error rather than a runtime surprise.

## Layout

| File | Responsibility |
| --- | --- |
| `ai/types.ts` | The interface. Provider-agnostic; no vendor concepts leak in. |
| `ai/config.ts` | Model, tuning and secret resolution from environment. |
| `ai/registry.ts` | Provider selection **and the redaction guarantee**. |
| `ai/redaction.ts` | Identifier stripping before anything leaves the process. |
| `ai/prompts.ts` | Versioned templates and the shared safety preamble. |
| `ai/providers/gemini.ts` | The only file that knows Gemini exists. |
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

The app reports this truthfully rather than hiding it: every generated artefact
records `contentUsedForTraining`, and the health check surfaces it.

To move to the paid tier, where content is not used for training:

1. Enable billing on the Gemini API project.
2. Set `GEMINI_BILLING_ENABLED=true` in the root `.env`.
3. Redeploy.

The flag defaults to "yes, it may be trained on", because an unset variable
almost certainly means nobody has enabled billing. The safe default for a
privacy flag is the pessimistic one.

**Whichever tier you use, the AI Processing Disclosure (KAN-22) has to state
what is sent and what may be done with it.** The registration consent already
asks users to agree to third-party AI processing; that consent is only
meaningful if the disclosure it points at is accurate.

## The key

**Deployed** — Secret Manager, never a file:

```bash
firebase functions:secrets:set GEMINI_API_KEY
```

**Local emulator** — put it in the root `.env`, unprefixed:

```
GEMINI_API_KEY=...
```

`npm run sync:env` routes it to `functions/.env.local`, which is gitignored and
which Firebase never deploys. Non-secret selection (`AI_PROVIDER`,
`GEMINI_MODEL`) goes to `functions/.env`, which *is* deployed as function
environment config. Both are generated — edit the root `.env`, not them.

Do not give the key a `VITE_` prefix. `sync:env` will refuse to run, because
that prefix would compile it into the browser bundle.

## Verifying it works

"Is the key right, is the model name right, is the secret bound in this
environment" are three different failures that all present identically as a
failed report, hours later, in a queue. The health check answers them in one
call, before any real report depends on it.

Call `aiHealthCheck` as an admin. It sends a fixed prompt with no report data
and returns provider, model, latency, token usage and the training flag.

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
