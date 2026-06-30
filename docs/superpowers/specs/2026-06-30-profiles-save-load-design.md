# Profiles: save / load / import-export + public presets

**Date:** 2026-06-30
**Status:** Approved (brainstorm), pending Codex adversarial review → implementation plan

## Problem

There is exactly one autosaved slot (`storage.ts`, key `kaupmattur-launa:v1`, `{v:1, entries}`). Helping someone else ("can you see how mine looks?") overwrites your own data, and there's no way to keep multiple histories, back one up, or start fresh without losing what you had.

## Goal

Named, autosaving **profiles** with: switch, **New** (blank), rename, delete, duplicate, and file **export/import** — plus bundled **read-only public presets** (v1: Icelandic minimum wage) that anyone can explore and **fork** into their own editable copy. Everything stays local (localStorage + local file download/upload); the no-network privacy promise is unchanged.

## Data model & storage

- **User profile:** `interface Profile { id: string; name: string; entries: SalaryEvent[] }` (`id` from the existing `uid()`).
- **Store (localStorage):** `interface Store { v: 2; activeId: string; profiles: Profile[] }` under a NEW key `kaupmattur-launa:v2`.
- **Presets:** bundled, read-only `interface Preset { id: string; name: string; source: string; entries: SalaryEvent[] }` in `src/data/presets.ts`. Preset ids are namespaced (`"preset:lagmarkslaun"`) so they never collide with user `uid`s. v1 ships **one** preset: **Lágmarkslaun** — real minimum-wage figures from kjarasamningar (ASÍ), as `SalaryEvent[]` at the months the wage changed, with a `source` citation. (Actual figures are sourced during implementation; the spec pins none.)
- **`activeId`** may reference a user profile OR a preset id.
- **Migration:** on first v2 load, if `kaupmattur-launa:v1` exists and is valid, wrap its `entries` into one profile named **"Mín laun"**, set it active. The old key is left untouched (safety). If v1 is absent/corrupt, the store is created with **no user profiles** and `activeId = "preset:lagmarkslaun"`.
- **Constraint:** every persisted/imported/preset entry's `month` must be within `[cpi.firstMonth, cpi.lastMonth]` (the chart's `buildSeries`/`analyzePurchasingPower` iterate `monthRange` and call `requiredToday`, which throws on a missing CPI month). Validation enforces this.

## Behavior

- **Active = user profile** → edits autosave to that profile (today's behavior, scoped to the active profile).
- **Active = preset** → the salary form is **read-only**, with a banner: *"Almennt snið (læst) · heimild: {source}"* and a single **Afrita og breyta** action that **forks**: creates a user profile named *"{preset.name} (afrit)"* with the preset's entries, makes it active, and (optionally) immediately focuses for editing. (Replaces the old example banner / "Prófa með mínum launum".)
- **＋ Nýtt** → creates a blank user profile *"Nýtt snið"* (rename-able), made active.
- **Switch list** (tap the profile name): two groups — **Þín snið** (user profiles, active ✓) and **Almenn snið** (presets, locked, with a source line) — plus **＋ Nýtt snið** and **Flytja inn skrá…**.
- **⋯ menu**, active = **user profile**: **Endurnefna** (inline/dialog), **Flytja út** (download), **Afrita** (duplicate → "{name} (afrit)", active), **Eyða** (with confirm).
- **⋯ menu**, active = **preset**: only **Flytja út** (export the preset's data). Rename/Delete don't apply; the fork is the banner's **Afrita og breyta**.
- **Delete** the active profile → fall back to the most recent remaining user profile; if none, to `"preset:lagmarkslaun"`.

## Import / export (file only, no network)

- **Export:** `serializeProfile(name, entries)` → `{ v: 1, kind: "kaupmattur-profile", name, entries }`, downloaded as `<safe-name>.json` via a Blob + object URL. Available for user profiles AND presets (a preset exports its data).
- **Import:** file picker → `parseProfileFile(text, cpi)` validates: correct `kind`/`v`, every entry passes the existing `isValidEntry` AND is within the CPI range. Valid → added as a **new** user profile (name from the file; on collision, suffix " (2)", " (3)", …), made active. Invalid → a clear error message; the store is unchanged.

## Architecture & files

- **`src/lib/profiles.ts`** (new, **pure, fully unit-tested**) — `Store`/`Profile` types and pure transforms over a `Store`: `migrateV1(v1) → Store`, `freshStore() → Store`, `createProfile`, `renameProfile`, `deleteProfile` (with active-fallback), `duplicateProfile`, `setActive`, `updateEntries`, `forkPreset(store, preset) → Store`, and `resolveActive(store, presets) → { kind: "user"|"preset"; name; source?; entries; readOnly; profileId? }` (handles a stale/unknown `activeId` by falling back). No IO.
- **`src/lib/storage.ts`** (rewritten, thin IO) — `loadStore(presets) → Store` (read v2, else migrate `:v1`, else `freshStore`), `saveStore(store)`. Reuses the existing `isValidEntry`.
- **`src/lib/profileFile.ts`** (new, **pure, unit-tested**) — `serializeProfile`, `parseProfileFile(text, cpi) → { name; entries } | { error }`, and a `downloadJson(filename, text)` browser helper (thin, not unit-tested).
- **`src/data/presets.ts`** (new) — the bundled presets array (Lágmarkslaun + source).
- **`src/components/ProfileBar.tsx`** (new) — the bar (profile name → switch list, ＋ Nýtt, ⋯ menu) and its dialogs (rename, delete-confirm, hidden file `<input>` for import, export download). Reuses the SVG-icon style.
- **`src/components/SalaryForm.tsx`** — replace the `isExample` example-banner with a preset read-only banner; disable inputs / the add button when the active profile is a read-only preset; surface the **Afrita og breyta** fork action.
- **`src/app.tsx`** — own the `Store` in state; derive the active profile's entries via `resolveActive`; autosave edits to the active user profile; wire all ProfileBar actions and the fork; **remove** the old `isExample` / `EXAMPLE_ROWS` / `clearExample` machinery.
- **`src/copy.ts`** / **`src/styles.css`** — profile/menu/dialog strings; bar/menu/dialog styles (reuse tokens, lens-chip patterns).

## Edge cases
- Empty user-profiles list + preset active → form read-only; ＋ Nýtt or fork to begin.
- Stale `activeId` (deleted profile / unknown preset) → `resolveActive` falls back (most recent user profile, else default preset).
- Rename to empty/whitespace → trimmed; empty rejected (keep prior name).
- Import: wrong format / out-of-CPI-range months / non-positive amounts → reject with a message, no mutation; name collision → suffix.
- A preset's entries must lie within the CPI range (validated at build via a test over `presets.ts`).
- Deleting the last user profile while it's active → fall back to the preset.

## Testing
- **`tests/profiles.test.ts`** (new): v1→v2 migration; fresh store (preset active); create/rename/delete/duplicate/setActive/updateEntries; `forkPreset`; delete-active fallback chain; `resolveActive` for user/preset/stale ids; rename-empty rejection.
- **`tests/profileFile.test.ts`** (new): serialize→parse round-trip; reject wrong kind/version, out-of-range months, bad amounts; name-collision suffixing.
- **`tests/presets.test.ts`** (new): every preset entry is within the bundled CPI range and passes `isValidEntry` (guards against a bad data import).
- ProfileBar + form read-only/preset state + import/export + fork verified via Playwright.

## Out of scope (v1)
Share links / URL state, cloud sync, more than one preset, drag-to-reorder, and per-profile view settings (chart frame & selected lens stay global UI state, not saved per profile).
