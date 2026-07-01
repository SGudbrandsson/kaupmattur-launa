# Union-data presets: labeled public salary histories

**Date:** 2026-07-01
**Status:** Implemented (with data-source amendment — see below)

## Amendment (2026-07-01, during implementation)

The union PDFs proved unworkable as an autonomous data source: only the Sept
2024 VR edition was machine-extractable (older editions use subsetted fonts),
and the public-sector launatöflur online cover only the current 2024–2028
agreement (no historical depth). Rather than hand-transcribe or ship a thin/
guessed series, the three profession presets are sourced from **Hagstofa
Íslands table VIN02001** — miðgildi heildarlauna fullvinnandi by starfsstétt,
2014–2024, machine-readable via the PX-Web API (same authority as the CPI).

Consequences vs. the original design below:
- Teacher (`2331` grunnskólakennsla) and nurse (`2230` hjúkrun/ljósmæður) are
  now **actual medians (`survey`), not contractual taxi.** Retail is `522`
  afgreiðslu-/sölustörf.
- The **`taxi` flavor is dropped** — no preset uses a contractual base rate.
  `PresetKind` is `"minimum" | "survey"`. (If contractual-taxi presets are
  wanted later, re-add the flavor + copy.)
- Each annual figure is placed at mid-year (`YYYY-06`). Refresh procedure is in
  the README (Hagstofa API query), replacing the PDF/zlib recipe.

The rest of the design (kind field, badge, banner explainer, read-only + fork,
CPI-range guard, tests) is unchanged.

---

## Problem

There is exactly one public preset today — `preset:lagmarkslaun` (`src/data/presets.ts`) — and its figures are best-effort/unverified. A single preset under-uses the read-only-preset machinery that already exists (switcher grouping, `source` line, fork-on-edit, `sanitizeEntries` guard). Iceland has authoritative, published salary data — VR's launarannsókn and public-sector launatöflur — that would let people explore real, relatable histories without typing anything.

But these sources mean **different things**: a contractual base rate is a floor with exact change-dates, while a survey median is "what the typical person in this job actually earns," sampled per edition. Presenting them side by side without labeling the difference would invite apples-to-oranges comparisons and undercut the tool's credibility.

## Goal

Grow the curated preset set from 1 → **4**, one drawn from each authoritative flavor, and add **honest flavor-labeling** so each preset's meaning is glanceable in the switcher and explained on the locked-preset banner. Presets stay read-only + fork-on-edit; everything stays local; no behavioral change to the calculation.

## Data model

Add one field to the existing `Preset` interface (`src/lib/profiles.ts`):

```ts
export interface Preset {
  id: string;
  name: string;
  source: string;
  kind: "minimum" | "taxi" | "survey";
  entries: SalaryEvent[];
}
```

- `"minimum"` — kjarasamningsbundið lágmark for full-time work (Lágmarkslaun).
- `"taxi"` — public-sector contractual base rate (grunntaxti) for one launaflokkur/þrep, with exact effective dates.
- `"survey"` — miðgildi (median) of actual total wages from a wage survey, one data point per edition.

`kind` is presentation-only: it drives the badge and the banner explainer. It does not change read-only/fork behavior or any calculation. All presets remain within the bundled CPI range (a test enforces it).

## The four presets (first batch)

1. **Lágmarkslaun** (`kind: "minimum"`, id `preset:lagmarkslaun`) — the existing preset. **Before siblings ship, its figures must be verified against the actual SGS/ASÍ kjarasamningar** and corrected if wrong. This preset stays `DEFAULT_PRESET_ID` (fresh-store default). Source: SGS/ASÍ — asi.is.

2. **Afgreiðslu-/verslunarfólk — miðgildi** (`kind: "survey"`, id `preset:vr-afgreidsla`) — miðgildi **heildarlauna** for retail/service staff from VR's launarannsókn, one `SalaryEvent` per available edition (reference month of that edition). This is the "what people actually earn" line. Source: Launarannsókn VR — vr.is.
   - **Known data-availability risk:** the series is only as deep as the editions we can source. Gather every available past edition within the CPI range. If fewer than ~3 years can be sourced, the decline story is thin — flag it at transcription time and we decide then whether this preset makes the v1 cut.

3. **Grunnskólakennari — grunntaxti** (`kind: "taxi"`, id `preset:kennari`) — one representative launaflokkur/þrep from the KÍ / Samband íslenskra sveitarfélaga launatöflur, using exact effective dates across successive samningar. Source: KÍ / Samband — cited launatafla.

4. **Hjúkrunarfræðingur — grunntaxti** (`kind: "taxi"`, id `preset:hjukrunarfraedingur`) — one representative launaflokkur/þrep from the Félag íslenskra hjúkrunarfræðinga / BHM–ríkið launatöflur, exact effective dates. Source: Fíh / BHM — cited launatafla.

For each taxi preset, pick **one** representative launaflokkur + þrep (e.g. a mid-career step) and name it in the `source` string, so the figure is unambiguous and not mistaken for "every teacher/nurse."

## Labeling (the "clearly labeled" requirement)

Two surfaces, both driven by `kind`:

1. **Badge in the switch list**, a compact chip next to the preset name:
   - `minimum` → "lágmark"
   - `taxi` → "grunntaxti"
   - `survey` → "miðgildi"

2. **One-line explainer on the locked-preset banner** when a preset is active (extends the existing `presetLockedBanner`), per kind:
   - minimum: *"Lágmarkstekjur fyrir fullt starf — kjarasamningsbundið lágmark."*
   - taxi: *"Grunntaxti kjarasamnings — raunveruleg laun eru oft hærri (vaktaálag, yfirvinna)."*
   - survey: *"Miðgildi raunverulegra heildarlauna úr launarannsókn — ekki taxti; helmingur er yfir og helmingur undir."*

All copy lives in `src/copy.ts`; no user-facing strings in components or libs.

## Data sourcing & accuracy

- Figures are **transcribed from the cited published source, never approximated.** Each preset carries a `source` citation and a `kind`.
- **Not automated.** Unlike the CPI (fetched via `npm run update-data`), these are PDFs with no API. Presets are hand-curated and refreshed manually when a new könnun/samningur is published. A short "how to refresh presets" note goes in the README.
- Only figures VR publishes at ≥10 respondents per cell (their own floor) are used for the survey preset, at full-time basis.
- The CPI-range + shape test is the guard: any preset entry outside `[cpi.firstMonth, cpi.lastMonth]` or failing `isValidEntry` fails the build.

## Architecture & files

- **`src/lib/profiles.ts`** — add `kind` to the `Preset` interface. No logic change.
- **`src/data/presets.ts`** — verified Lágmarkslaun + three new presets, each with `kind` and transcribed entries.
- **`src/copy.ts`** — a `presetKinds` map: `{ [kind]: { badge: string; banner: string } }`.
- **`src/components/ProfileBar.tsx`** — render the badge chip next to each preset's name in the switch list, reading `copy.profiles.presetKinds[preset.kind].badge`. User profiles get no badge.
- **`src/components/SalaryForm.tsx`** — the locked-preset banner shows the source line plus the kind explainer. `presetLockedBanner` (or its call site) takes `kind` so it can append `copy.profiles.presetKinds[kind].banner`.
- **`src/styles.css`** — a small badge/chip style, reusing existing chip tokens (glacier-wash background, glacier-deep text, pill radius).
- **`tests/presets.test.ts`** — extend: every preset has a valid `kind`; every entry passes `isValidEntry` and lies within the CPI range (`sanitizeEntries` is a no-op); each distinct `kind` present in `PRESETS` has a matching `presetKinds` copy entry (badge + banner non-empty).
- **`README.md`** — "Refreshing presets" note (where the numbers come from, that they're hand-transcribed, how to add an edition).

## Testing

- `tests/presets.test.ts` (extended, as above) — structural + CPI-range + copy-coverage. It does **not** assert specific kr figures (those are data, verified by hand against the source at transcription time).
- ProfileBar badge rendering and the per-kind banner explainer verified via Playwright (switch to each preset, assert badge text and banner copy).

## Out of scope (v1)

More than these four presets, auto-refreshing union data, per-profession seniority/þrep pickers in the UI, licensing beyond source attribution, and survey flavors other than miðgildi heildarlauna.
