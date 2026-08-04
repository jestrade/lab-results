# Capacity limits

LabResults is designed to run inside the Blaze plan's **no-cost tier**. Blaze
has no spending cap of its own — exceeding an allowance does not stop the
service, it starts charging for it. So every limit here sits *below* its
allowance, and the job of this system is to make the overspend impossible
rather than merely visible.

All numbers live in **[`config/quotas.json`](../config/quotas.json)**. Change
them there and nowhere else; a test will tell you what else needs updating.

## The two headline limits

| | Limit | Allowance | Headroom |
| --- | --- | --- | --- |
| Per user | **400 MiB** | — | — |
| All users | **4 GiB** | 5 GB | ~0.7 GB |

`floor(4 GiB / 400 MiB)` = **10 users** can hold a full quota at once. That is
the *planned ceiling*, and it is what every other per-user budget is divided
by. It is not enforced at registration — real users rarely fill a quota, and
locking out an 11th signup is a product decision, not an infrastructure one.

## Storage is not the binding constraint

This is the thing to know before tuning anything:

> This project's bucket is `labresults-2a13f.firebasestorage.app`. That bucket
> type allows **5,000 upload operations per month** — not per day. A legacy
> `*.appspot.com` bucket allows 20,000 per *day*, so any limit copied from
> appspot documentation will be wrong by a factor of ~120.

At the 4,000/month app cap across 10 users that is **400 uploads per user per
month**, while 400 MiB holds roughly 200 typical 2 MiB reports *in total*. A
busy user runs out of operations long before they run out of space. Treat 4,000
as optimistic, too: a resumable upload can consume more than one operation.

## Every service

App caps are 80% of the allowance unless noted. Storage is tighter — see below.

| Service | Metric | Allowance | App cap |
| --- | --- | --- | --- |
| Storage | Stored | 5 GB | **4 GiB** |
| Storage | Uploads | 5K/month | 4K/month |
| Storage | Downloads | 50K/month | 40K/month |
| Storage | Egress | 100 GB/month | 80 GB/month |
| Firestore | Stored | 1 GiB | 800 MiB |
| Firestore | Reads | 50K/day | 40K/day |
| Firestore | Writes | 20K/day | 16K/day |
| Firestore | Deletes | 20K/day | 16K/day |
| Firestore | Egress | 10 GiB/month | 8 GiB/month |
| Auth | MAUs | 50K | 40K |
| Functions | Invocations | 2M/month | 1.6M/month |
| Functions | GB-seconds | 400K/month | 320K/month |
| Functions | CPU-seconds | 200K/month | 160K/month |
| Functions | Egress | 5 GB/month | 4 GB/month |
| Hosting | Stored | 10 GB | 8 GB |
| Hosting | Transfer | 360 MB/day | 288 MB/day |

The global storage cap is 4 GiB rather than 80% of 5 GB because Google may
quote "5 GB" as 5.0 × 10⁹ bytes rather than 5 GiB. 4 GiB = 4.295 × 10⁹ is under
either reading, so the cap holds whichever unit is meant.

## What is actually enforced

**Hard — denied server-side, cannot be bypassed.** All in `storage.rules`:

- per-file size (25 MiB)
- per-user stored bytes, read via `firestore.get(usage/{uid})`
- per-user uploads this month, from the same document
- global stored bytes, via `firestore.get(systemUsage/global)`
- the `uploadsDisabled` kill switch

**Soft — surfaced, not blocked.** Firestore read/write/delete counts, Functions
invocations, egress. Counting these in-band would cost a write per operation,
spending the very budget it protects. Use a GCP billing budget instead (below).

## How it fits together

```
 browser                    storage.rules              Cloud Functions
 ───────                    ─────────────              ───────────────
 checkUploadAllowed()  ──▶  allow create: if …    ──▶  onReportUploaded
 instant, friendly          the actual control         increments counters
 message; NOT a control     reads the counters         in a transaction
                                   ▲                          │
                                   └──────── usage/{uid} ◀─────┘
                                             systemUsage/global
                                                   ▲
                                          reconcileUsage (nightly)
                                          recomputes from the bucket
```

The browser check exists so a user gets a specific sentence instantly instead
of an opaque permission error after a 25 MiB upload fails. It is a courtesy.
The rules are the control.

## The known gap: counter drift

Counters are updated by a Storage trigger **after** an object finalizes, so
several uploads racing in parallel can each pass the rules check before any
counter moves. Worst case overshoot is roughly *(concurrent uploads × 25 MiB)*.

Four things contain it:

1. The client uploads strictly one file at a time.
2. The caps sit below the allowance, so an overshoot costs nothing.
3. `reconcileUsage` recomputes true usage from the bucket nightly and corrects
   the counters, logging any drift it finds.
4. If real usage crosses the global cap anyway, reconciliation flips
   `uploadsDisabled`, which the rules honour immediately without a deploy.

Closing the gap entirely needs a reserve-then-commit protocol (a callable that
transactionally reserves quota before the upload starts, with a sweeper for
abandoned reservations). That is worth building when the ceiling is a real
product limit rather than a free-tier one.

## Operations

### Pausing uploads by hand

```bash
firebase firestore:write systemUsage/global '{"uploadsDisabled": true}' --merge
```

Takes effect on the next upload attempt — no deploy. Reconciliation clears it
automatically once usage falls back below 95% of the cap.

### Forcing a reconciliation

```bash
gcloud scheduler jobs run firebase-schedule-reconcileUsage-us-central1
```

### Raising a limit

1. Edit `config/quotas.json`.
2. Run `npm test` — the drift test names any rules literal that must change.
3. Update `storage.rules` to match.
4. Re-check the totals still sit under the allowances; a test asserts this.

## What this does not protect against

**These caps protect the free tier, not the bill.** They cover the metrics we
can count cheaply. They do not cover a Functions runaway loop, an unexpected
egress spike, or the AI provider costs in Phase 2 — which are billed by a third
party and are outside Firebase entirely.

A **GCP billing budget with alerts is not optional** and cannot be configured
from this repository:

1. GCP console → Billing → Budgets & alerts.
2. Budget scoped to project `labresults-2a13f`, amount **$1**.
3. Alert thresholds at 50%, 90%, 100% of actual spend.
4. Email the project owner.

A $1 budget means the first cent of real spend pages someone. Since everything
here is designed to stay inside the no-cost tier, *any* charge is a signal that
something is wrong — not that the service grew.

For a genuinely hard stop, wire the budget's Pub/Sub topic to a function that
disables billing on the project. That is a blunt instrument — it takes the
whole project offline — so it is documented rather than implemented.
