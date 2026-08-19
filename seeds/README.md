# Seeds

Initial contents for the two reference collections, and the only place in this
repository where laboratory-variable data or category definitions are written
down.

| File | Collection | What it is |
| --- | --- | --- |
| `categories.json` | `variableCategories/{id}` | The panels the variables grid groups by: display name per locale, display order, and the sheet-heading keywords the importer maps to them |
| `variables.json` | `variables/{id}` | The curated catalog as imported from the maintained spreadsheet |
| `variable-review.json` | `variables/{id}` | Curation verdicts for entries the pipeline discovered, applied by `apply-variable-review.mjs` |

## These are a starting point, not the source of truth

Firestore holds the live catalog. Once a project is seeded, entries are changed
at **/admin/variables** and new ones arrive from the pipeline — none of which
comes back here. A seed file is a record of what a fresh project starts with,
so a new environment can be stood up and so the initial content stays
diffable and reviewable; it is not a mirror of production, and nothing at
runtime reads it.

That is also why no application code imports from this directory. The app and
the functions read both collections from Firestore, so a category added in
Firestore appears in the grid without a deploy, and a category deleted from
this file does not vanish from anyone's data.

## Seeding a project

```bash
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
node functions/scripts/seed.mjs --dry-run
node functions/scripts/seed.mjs
```

Set `FIRESTORE_EMULATOR_HOST=localhost:8080` instead to seed the emulator.

The script creates and never overwrites, so re-running it is safe and, on a
seeded project, does nothing. Editing an entry that is already live is
deliberately not something a script does — see [docs/variables.md](../docs/variables.md).

## `other` is required

Every catalog reader falls back to the `other` category when an entry names one
that no longer exists, and the extraction prompt is told to answer `other`
rather than guess. Seeding a project without it leaves those entries labelled
by their raw id.
