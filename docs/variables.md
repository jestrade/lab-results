# The laboratory-variable catalog

`variables/{variableId}` is the canonical list of laboratory tests: what each
one is called in English and Spanish, what it measures, and which panel it
belongs to. It is reference data — readable by any signed-in user, written only
by the Admin SDK.

`variableCategories/{categoryId}` is the list of panels it groups by, on the
same terms. Both are seeded from `seeds/` and read from Firestore thereafter;
neither is a constant in the source. See [The categories](#the-categories).

Four things put entries in the catalog, and only the last may change one:

| Source | What it writes | When |
| --- | --- | --- |
| `import-variables.mjs` | Curated entries from the maintained spreadsheet | By hand, when the sheet changes |
| The processing pipeline | Placeholders for tests seen on a report but absent from the catalog | Automatically, per upload |
| `backfill-variables.mjs` | Entries for variables analysed before the catalog existed | By hand, once |
| `/admin/variables` | Corrections, translations and explanations — the only writer allowed to edit | By an admin, deliberately |

## The two rules

**Never a duplicate.** A test that already has an entry never gets a second
one, whichever route it arrives by. A printed name is matched against every
existing entry — canonical name, both display names, and every alias — before
anything is created.

**Never an edit.** Nothing in the running system modifies an entry that already
exists. The importer creates and skips; the pipeline creates and reuses; the
backfill only fills gaps. Curated names and explanations are reviewed content,
and a laboratory's spelling on one PDF is evidence about that PDF, not a
correction to the catalog.

There is one deliberate exception. A document the pipeline has just created
carries `needsEnrichment: true`, and the enrichment pass may complete it once —
guarded by that flag, inside a transaction, clearing it as part of the same
write. A curated entry never carries the flag, so enrichment can never reach
reviewed content.

To change an entry that is already live, change the spreadsheet and edit the
entry at **/admin/variables** (KAN-49). That is intentionally not something a
script does, because there is no way for a script to tell a correction from a
regression.

The console is the fourth writer, and the only one allowed to edit. Two of its
behaviours follow from the rules above rather than from taste:

* **Saving marks the entry reviewed** — `origin: catalog`, `needsEnrichment:
  false`. A person has now read it, so the interface must stop captioning its
  explanation as unreviewed, and the enrichment pass must stop treating it as
  a placeholder it may complete.
* **It warns about a probable duplicate rather than refusing one.** Every name
  the draft would be known by is compared against every name each existing
  entry is known by. This is an exact-match check and deliberately not a second
  copy of `matching.ts` — two implementations of the one rule that must never
  disagree. A near-identical pair of genuinely distinct tests is a judgement,
  and the console is the place with a person on it.

## How a printed name is matched

Laboratories do not agree on names. One report says `Hemoglobin`, the next
`Hemoglobina`, a third `HGB`, a fourth `Hemoglobin, serum`. All four are one
test. Meanwhile `HDL Cholesterol` and `LDL Cholesterol` are 93% identical as
strings and are not one test.

`functions/src/variables/matching.ts` resolves this in three passes:

1. **Exact.** The normalised name — lowercased, unaccented, punctuation and
   specimen words stripped, tokens sorted — against every entry's normalised
   name. `Cholesterol, Total`, `TOTAL CHOLESTEROL` and `cholesterol - total`
   all normalise identically.
2. **Alias.** The same normalised form against every alias and every localised
   display name, which is how a Spanish report reaches an English entry.
3. **Similarity.** Levenshtein ratio at or above `SIMILARITY_THRESHOLD`
   (0.86), which absorbs plurals, doubled consonants and dropped letters. The
   best candidate wins, not the first over the line.

No match means the test is new, and a placeholder is created for it.

### The discriminator guard

The similarity pass alone would merge tests that must stay apart, so it is
gated. `discriminators()` extracts the tokens that carry a distinction —
qualifiers (`free`, `total`, `direct`, `libre`), anything containing a digit
(`B12`, `T3`, `C4`), and short abbreviations of two to four letters (`HDL`,
`TSH`, `ALT`) — and two names whose discriminator sets differ can never match,
at any similarity.

This is the reason `Vitamin B12` and `Vitamin B6` stay separate, and the reason
an unlisted `VLDL Cholesterol` becomes a new variable rather than being folded
into `LDL Cholesterol`.

### Why it errs toward splitting

A false split shows two cards where the reader expected one. It is untidy;
nothing on screen is false.

A false merge puts one test's values into another test's history, computes a
trend across the two, and presents the result as a measurement of the reader's
blood. There is nothing on the card to suggest anything went wrong.

Every threshold here is set on that asymmetry. Where a looser rule would match
more names at the cost of occasionally matching the wrong ones, this takes the
extra card.

## The categories

The panels on the variables grid — *Biometría hemática*, *Perfil de lípidos* —
are `variableCategories` documents, each carrying the heading per locale, the
position it sits at, and the sheet-heading keywords the importer maps onto it.

They used to be a union in `src/domain/types.ts`, a `VARIABLE_CATEGORIES` array
in `functions/src/variables/catalog.ts`, a `CATEGORY_NAME` map and a
`CATEGORY_ORDER` list beside it, and a `CATEGORY_KEYWORDS` table in the import
script — five copies of one list, in two codebases that deploy separately, each
carrying a comment asking the next reader to keep them in step. Adding a panel a
laboratory prints took a change to all five and two deploys, and in between the
two deploys one half of the system writes a category the other half will not
draw.

Now an admin adds a document. Both halves read the collection:

* the app through `fetchVariableCategories()` and the `CategoryCatalog` value
  object in `src/domain/categories.ts`;
* the functions through `loadCategoryIds()` in
  `functions/src/variables/categories.ts`, which is also what the enrichment
  prompt lists as the categories the model may answer with.

Both cache per session and per instance respectively, on the same reasoning as
the variable catalog: reference data that changes a few times a year, read by
everything that draws a heading.

### `other` is the one id in the source

It is the fallback three separate things depend on — the extraction prompt is
told to answer with it rather than guess a panel, enrichment writes it when the
model returns a category the collection does not have, and a stored entry whose
category has since been deleted is shown under it. That makes it structure
rather than data, and it is a constant in both codebases.

Everything else is a document. A category id with no document is still drawn:
the grid groups by it and labels the heading from the id itself
(`purine_panel` → "Purine panel"), after the panels the catalog knows. Dropping
those cards would hide somebody's own results because a category was deleted.

### Seeding

`seeds/categories.json` is what a fresh project starts with — the eighteen
panels, their Spanish headings and their import keywords:

```bash
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
node functions/scripts/seed.mjs --dry-run
node functions/scripts/seed.mjs
```

It seeds `variables` from `seeds/variables.json` in the same run, creates and
never overwrites, and is safe to re-run. Nothing at runtime reads either file.

## Translations

Each entry carries `names` and `descriptions` keyed by locale (`en`, `es`).
English is required — it is the fallback for every other locale and the anchor
the matcher compares against — and everything else is optional.

`translate()` falls back to English rather than rendering nothing. A Spanish
reader seeing an English name has a visible gap they can report; a blank card
looks like their result went missing.

The category headings carry their own `names` map, for the same reason and
with the same rule: they are panel names, not literal translations.
`complete_blood_count` is *Biometría hemática* in Spanish, which is what a
Spanish-language laboratory actually prints.

The interface's own copy is still English. Translating it is a separate job
with a separate mechanism; `useLocale()` is where a stored language preference
would plug in when a picker lands on the account page.

## Importing the spreadsheet

Export the sheet with **File → Download → Comma-separated values**, then:

```bash
node functions/scripts/import-variables.mjs --csv ~/Downloads/variables.csv
```

That writes `seeds/variables.json` and prints what it understood: which
columns it recognised, which it ignored, which rows it read as group headings,
and how many variables fell into `other`. Read that report — it is how a
renamed column or an unmapped panel becomes visible instead of silently
importing blanks.

Review the diff, then load it:

```bash
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
node functions/scripts/import-variables.mjs --push --dry-run
node functions/scripts/import-variables.mjs --push
```

The intermediate JSON is deliberate. This is content shown to every user as an
explanation of their own blood test, so it goes through the repository where it
can be diffed, reviewed and rolled back.

Column headings are matched case- and accent-insensitively against a list of
known spellings in `sheet-catalog.mjs` (`name`, `nombre`, `variable`,
`descripción`, `unidad`, `siglas`, …). Panel names are mapped to categories by
the `keywords` on each category in `seeds/categories.json`; anything
unrecognised becomes `other` rather than being guessed at, and is listed in the
import report.

Add a spelling to the column list, or a keyword to the category, when the sheet
grows one.

Headings are parsed rather than looked up, because a bilingual sheet writes
`Grupo / Group` and `Explicación (ES)` — neither of which is a spelling of
anything. Each heading is split into a field word and an optional language
tag, and the two combine; the cross-product of field words, languages and
separators is not a list anyone would keep correct by hand.

Names carry their abbreviations parenthetically — `Mean Corpuscular Volume
(MCV)`, `Urea (BUN)` — and reports print whichever half they prefer. Both
halves are extracted as aliases, because `MCV` and `Mean Corpuscular Volume`
share three letters and no amount of string distance connects them.

## Backfilling

For variables that were analysed before the catalog existed:

```bash
npm --prefix functions run build
node functions/scripts/backfill-variables.mjs --dry-run
node functions/scripts/backfill-variables.mjs
```

It walks every user's `variableSeries`, finds ids with no catalog entry,
creates them, and runs the same enrichment the pipeline runs — which is what
supplies the explanation and the Spanish name.

It will also report series that *do* match an existing entry under a different
id, and change nothing about them. Repointing a series means merging two
histories and recomputing a trend across them; that is a data migration with a
real chance of corrupting somebody's record, and it should be a decision rather
than a side effect.

### Enrichment is resumable, and will need to be

Creating a placeholder and enriching it are separate steps, and only the first
is guaranteed. The script therefore picks up **both** variables missing from
the catalog *and* entries that already exist with `needsEnrichment: true` —
otherwise a second run would report "nothing missing" and exit, skipping the
documents the first run failed to finish.

Two failures are routine and neither loses anything:

**Rate limiting.** The Gemini free tier allows only a handful of requests per
minute, and enrichment is one request per chunk of `ENRICHMENT_CHUNK`
variables. A backfill of forty will partially fail. Re-run it — each pass
completes what it can, and the flag is what makes that safe.

**Oversized batches.** Each entry costs roughly 170 output tokens across two
names and two descriptions. A chunk that overruns the output budget does not
truncate one description: the JSON stops mid-string, the response fails to
parse, and every variable in that chunk is lost. This is why `ENRICHMENT_CHUNK`
is twelve against an 8,192-token budget rather than something that merely fits
— the overrun costs the batch, so the margin is deliberately large.

Chunks fail independently, so one bad response costs twelve variables rather
than the whole run.
