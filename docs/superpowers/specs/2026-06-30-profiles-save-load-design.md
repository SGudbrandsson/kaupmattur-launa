# Profiles: save / load / import-export + public presets

**Date:** 2026-06-30
**Status:** Approved (brainstorm), revised after Codex adversarial review, pending implementation plan

## Problem

There is exactly one autosaved slot (`storage.ts`, key `kaupmattur-launa:v1`, `{v:1, entries}`). Helping someone else ("can you see how mine looks?") overwrites your own data, and there's no way to keep multiple histories, back one up, or start fresh without losing what you had.

## Goal

Named, autosaving **profiles** (switch / New / rename / delete / duplicate / file export-import) plus bundled **read-only public presets** (v1: Icelandic minimum wage) that anyone can explore and **fork** into an editable copy. Everything stays local (localStorage + local file download/upload); the no-network privacy promise is unchanged.

## Data model

- **User profile:** `interface Profile { id: string; name: string; entries: SalaryEvent[] }`.
- **Store:** `interface Store { v: 2; activeId: string; profiles: Profile[] }` in localStorage under a NEW key `kaupmattur-launa:v2`.
- **Preset:** bundled `interface Preset { id: string; name: string; source: string; entries: SalaryEvent[] }` in `src/data/presets.ts`. Preset ids use a reserved `"preset:"` prefix (e.g. `"preset:lagmarkslaun"`). v1 ships **one** preset, **Lágmarkslaun** (real minimum-wage figures from kjarasamningar/ASÍ, as `SalaryEvent[]` at the months the wage changed, with a `source` citation; figures sourced during implementation — the spec pins none).
- `activeId` may reference a user profile id OR a preset id.

## IDs & invariants (collision/safety)
- **All ids are created in `profiles.ts`** via `newId()` (`crypto.randomUUID()` with the existing `Math.random` fallback); `newId()` never returns a value starting with `"preset:"`.
- On load, any stored user profile whose `id` is missing, duplicated, or starts with `"preset:"` is **reassigned a fresh id** (and `activeId` updated to match if it pointed at it).
- `MAX_PROFILES = 50`, `MAX_NAME_LEN = 60`, `MAX_ENTRIES = 600` (≈50 yrs monthly), `MAX_IMPORT_BYTES = 1_000_000`. Mutations that would exceed these are rejected with a message.

## CPI-range safety (the load-bearing invariant)
`requiredToday`/`realValue` throw on a missing CPI month, and `analyzePurchasingPower`, `buildSeries`, `Chart`, **and `SummaryCards`** all feed off the entries. So **no out-of-range entry may ever reach the UI**. A single pure helper guards every ingress:

```
sanitizeEntries(entries, cpi): SalaryEvent[]
  // keep only entries that pass isValidEntry AND whose month is within
  // [cpi.firstMonth, cpi.lastMonth]; dedupe by month (last wins); sort ascending.
```

`sanitizeEntries` is applied to: v1 migration, every profile read in `loadStore` (v2), preset entries (at build, asserted by a test), import parse, and `forkPreset`. An entry list reduced to `[]` is allowed (renders an empty editable profile — see empty state). Because the `MonthPicker` already clamps user input to the CPI range, normal editing never produces out-of-range months; this guard covers imports, presets, hand-edited storage, and any future CPI-trimming.

## Storage & migration (precedence)
`loadStore(presets)`:
1. If `kaupmattur-launa:v2` exists **and validates** (shape ok, ids fixed, each profile's entries sanitized) → use it.
2. Else if `kaupmattur-launa:v1` exists and is valid → migrate: wrap `sanitizeEntries(v1.entries)` into one profile **"Mín laun"**, `activeId` = that profile, **write v2, then remove the `:v1` key** (v2 is now authoritative; this avoids an old cached bundle writing a divergent `:v1` that v2 would ignore).
3. Else → `freshStore()`: no user profiles, `activeId = "preset:lagmarkslaun"`.

`saveStore(store)` writes v2 only. v2 is authoritative once it exists.

## Active resolution
`resolveActive(store, presets): { resolvedId; kind: "user"|"preset"; name; source?; entries; readOnly }` — looks up `activeId`; if it's an unknown/deleted id, falls back to the **last** user profile, else `"preset:lagmarkslaun"`, and returns the corrected `resolvedId`. `app.tsx` compares `resolvedId` to `store.activeId` and **persists `setActive(store, resolvedId)`** before enabling any mutation, so stale ids can't misroute a rename/delete/update.

## Behavior
- **Active = user profile** → edits autosave to that profile (`updateEntries(store, resolvedId, events)` → `saveStore`).
- **Active = preset** (`readOnly`) → the salary form is **fully read-only**: inputs/add/remove disabled, **the AI-autofill panel is not rendered**, and a banner shows *"Almennt snið (læst) · heimild: {source}"* + **Afrita og breyta**. The fork is the ONLY mutation path: `forkPreset` creates a user profile *"{preset.name} (afrit)"* (sanitized entries), makes it active. No mutation path (edit, add, remove, AI apply) is reachable while a preset is active.
- **Profile switch / fork / new** → `app.tsx` rebuilds the form `DraftRow[]` from the resolved entries with **fresh `DraftRow.id`s** (a `useEffect` keyed on `resolvedId`), and `errors` derive only from the current rows. No stale ids carry across profiles.
- **＋ Nýtt** → blank user profile *"Nýtt snið"* (rename-able), active. An editable profile with zero entries shows an **empty state** ("Skráðu fyrstu launin þín …") since Payoff/Chart/Summary render nothing without data.
- **Switch list:** **Þín snið** (user, active ✓) + **Almenn snið** (presets, locked, source line); **＋ Nýtt snið**; **Flytja inn skrá…**.
- **⋯ menu, user profile:** Endurnefna, Flytja út, Afrita ("{name} (afrit)", active), Eyða (confirm).
- **⋯ menu, preset:** only Flytja út (exports the preset's data).
- **Delete** active profile → fall back to the **last** remaining user profile; if none, to `"preset:lagmarkslaun"`.

## Import / export (file only, no network)
- **Export:** `serializeProfile(name, entries) → { v:1, kind:"kaupmattur-profile", name, entries }`; `downloadJson(filename, text)` builds a Blob + object URL, clicks it, and **revokes the URL** afterward. Filename = sanitized profile name, falling back to `kaupmattur-profile.json` if empty/reserved.
- **Import:** file `<input>` → reject if `> MAX_IMPORT_BYTES`; `parseProfileFile(text, cpi)` validates `kind`/`v`, then `sanitizeEntries`; rejects empty-after-sanitize, `> MAX_ENTRIES`, or wrong shape with a clear message (store unchanged). Valid → new user profile (name trimmed/clamped to `MAX_NAME_LEN`; on collision after trim, suffix " (2)", " (3)", …; reject if at `MAX_PROFILES`), made active.

## Architecture & files
- **`src/lib/profiles.ts`** (new, **pure, fully unit-tested**): `Store`/`Profile` types, `newId`, `sanitizeEntries`, `freshStore`, `migrateV1`, `validateStore` (fix ids/sanitize), `createProfile`, `renameProfile`, `deleteProfile` (with fallback), `duplicateProfile`, `setActive`, `updateEntries`, `forkPreset`, `resolveActive`. The limits live here. No IO, no DOM.
- **`src/lib/storage.ts`** (rewritten, thin IO): `loadStore(presets)` (precedence above; removes `:v1` after migration), `saveStore(store)`. Keeps/relocates `isValidEntry`.
- **`src/lib/profileFile.ts`** (new, **pure + a thin DOM helper**): `serializeProfile`, `parseProfileFile(text, cpi)`, `downloadJson` (Blob/URL + revoke).
- **`src/data/presets.ts`** (new): bundled presets (Lágmarkslaun + source).
- **`src/components/ProfileBar.tsx`** (new): the bar (name → switch list, ＋ Nýtt, ⋯ menu) + dialogs (rename, delete-confirm, import `<input>`, export). SVG-icon style.
- **`src/components/SalaryForm.tsx`**: drop `isExample`/`onClearExample`; add `readOnly` + `onFork` (+ `presetSource`); render the preset read-only banner, disable controls when `readOnly`, and show the empty state when editable with no rows.
- **`src/components/PayoffCard.tsx`**: **remove** `isExample`/`onTryOwn` and the example CTA (the fork lives on the form now).
- **`src/app.tsx`**: hold the `Store` in state; `resolveActive` → persist corrected active id; derive/rebuild `DraftRow`s on `resolvedId` change; autosave to the active user profile; gate AI-autofill on `!readOnly`; wire every ProfileBar action; **remove** `isExample`/`EXAMPLE_ROWS`/`clearExample`. AI-autofill's `onApply` (`replaceRows`) only runs for an editable profile.
- **`src/copy.ts`** / **`src/styles.css`**: profile/menu/dialog/empty-state strings; bar/menu/dialog styles (reuse tokens & lens-chip patterns).

## Testing
- **`tests/profiles.test.ts`**: `sanitizeEntries` (drops out-of-range/invalid, dedupe, sort); v1→v2 migration; `freshStore` (preset active); precedence — only-v1, valid-v2+valid-v1, **corrupt-v2+valid-v1**, empty-v2+valid-v1; id fixing (reserved-prefix/dup/missing → reassigned, activeId follows); create/rename(empty rejected)/delete(+fallback chain)/duplicate/setActive/updateEntries; `forkPreset`; `resolveActive` for user/preset/stale ids returning corrected `resolvedId`; limits (MAX_PROFILES/NAME/ENTRIES).
- **`tests/profileFile.test.ts`**: serialize→parse round-trip; reject wrong kind/version, oversize, out-of-range months, bad amounts, empty-after-sanitize; name-collision suffixing after trim.
- **`tests/presets.test.ts`**: every preset entry passes `isValidEntry` and lies within the bundled CPI range (`sanitizeEntries` is a no-op on them).
- ProfileBar, the preset read-only state, **AI-apply-blocked-while-preset**, fork, import/export, and the empty state verified via Playwright.

## Out of scope (v1)
Share links / URL state, cloud sync, more than one preset, drag-to-reorder, per-profile `createdAt` metadata (fallback uses array order), and per-profile view settings (chart frame & lens stay global UI state).
