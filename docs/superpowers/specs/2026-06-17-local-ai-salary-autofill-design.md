# Local-AI salary autofill ("Fylla út með AI")

**Date:** 2026-06-17
**Status:** Approved (brainstorm), pending implementation plan
**Extends:** the v1 design and the payoff-first redesign.

## Problem

Entering a salary history by hand — month, amount, raise, raise, raise — is the
most tedious part of the tool. Users who can describe it in a sentence ("started
at 650k in Jan 2020, raised to 800k by 2024") should be able to.

## Goal

Let users describe their salary history in **plain language — typed or spoken,
in Icelandic or English** — and have an **on-device** model parse it into table
rows, which they preview/edit and apply. Everything runs locally, so the site's
"ekkert sent neitt" promise is preserved.

## Core principle: progressive enhancement

The feature renders **only when the browser exposes the required on-device APIs**.
When absent (the common case today), the form is exactly as it is now — no button,
no hint, no behavioural change. This is layered enhancement on top of a fully
working manual form. No cloud fallback is ever used.

## Browser APIs

- **Analysis:** Chrome's Prompt API — global `LanguageModel`. `availability()`
  returns `"unavailable" | "downloadable" | "downloading" | "available"`. Sessions
  are created with `LanguageModel.create({ monitor, initialPrompts })`; structured
  output is obtained via `session.prompt(text, { responseConstraint: <JSON schema> })`.
- **Voice (STT):** the **on-device** Web Speech API. Availability is probed per
  language (`is-IS`, `en-US`); recognition runs locally only. Server-based STT is
  never used.

Both are experimental and Chrome-only today; that is acceptable because the whole
feature is gated on their presence.

## Bilingual support

- **Analysis** accepts Icelandic or English input. The system prompt states the
  user may write in either language and must always emit months as `YYYY-MM` and
  amounts as integers in ISK. Output is language-agnostic, so nothing downstream
  changes by language.
- **STT** supports `is-IS` and `en-US`. The mic appears if **either** is available
  on-device. If both are, a small `IS / EN` toggle sits on the mic (default
  `is-IS` when available, else `en-US`). If only one, no toggle.
- UI chrome stays Icelandic; the textarea placeholder notes input may be
  *íslensku eða ensku*.

## Architecture (small, isolated units)

- **`src/lib/ai/localModel.ts`** — thin wrapper over the Prompt API. Exports:
  - `modelAvailability(): Promise<Availability>`
  - `createExtractor(onProgress?): Promise<Extractor>` — creates a session with the
    system prompt + JSON-schema constraint; triggers/monitors download if needed.
  - `Extractor.extract(text): Promise<RawRow[]>` and `Extractor.refine(instruction):
    Promise<RawRow[]>` (same session → conversational context).
  - `Extractor.destroy()`.
  No DOM. `RawRow = { month: string; amount: number }` (untrusted model output).
- **`src/lib/ai/speech.ts`** — thin wrapper over on-device Web Speech. Exports:
  - `speechLangsAvailable(): Promise<Array<"is-IS" | "en-US">>`
  - `createDictation(lang, { onPartial, onFinal, onError }): Dictation` with
    `start()` / `stop()`. Local processing only.
  No DOM beyond the recognition object.
- **`src/lib/ai/normalizeRows.ts`** — **pure, fully unit-tested.**
  `normalizeRows(raw: RawRow[], cpi: CpiData): { rows: SalaryEvent[]; dropped: number }`.
  Rules: coerce `month` to `YYYY-MM`; keep only months within `[cpi.firstMonth,
  cpi.lastMonth]`; round `amount`, require `0 < amount ≤ 99_000_000` (the form's
  `MAX_AMOUNT`); dedupe by month (last wins); sort ascending; count drops.
- **`src/components/AiAutofill.tsx`** — the panel. Owns: open/closed, current state
  (`describe | downloading | listening | preview | error`), the working-set rows,
  the live transcript, and the `Extractor` session. Renders the button, textarea +
  mic, download progress, and the editable preview + refine input.
- **`src/components/SalaryForm.tsx`** — renders `<AiAutofill onApply={...} />` at the
  top of the form, gated on `modelAvailability() !== "unavailable"`. Reuses the
  existing `LockIcon` style for any iconography.
- **`src/app.tsx`** — `replaceRows(events: SalaryEvent[])`: sets `rows` from the
  applied events (mapped to `DraftRow`s), `isExample: false`. Mirrors the existing
  state-setter pattern.
- **`src/copy.ts`** — a new `ai` block holding every string.

## Data flow & states

1. **Idle** → button "Fylla út með AI" visible (only when supported).
2. **describe** → panel open: textarea (placeholder example) + mic (if STT
   available). Buttons: **Greina** / Hætta við.
3. **listening** (optional) → dictation fills the textarea live; mic toggles stop.
4. **downloading** (first run, `downloadable`) → on first **Greina**, create the
   session and show progress: *"Þarf að sækja AI líkanið (~nokkur GB). Geymist svo
   í tækinu."* + a bar + "má loka og halda áfram síðar". Then continue to extract.
5. **preview** → `extract()` → `normalizeRows` → working-set shown as rows
   (month + amount). Each row is **tap-to-edit** (inline month/amount). A coral note:
   *"Þetta kemur í stað núverandi færslna í töflunni."* A **refine** input
   (chat) re-runs `refine()` → new working-set. Buttons: **Setja í töfluna** /
   Hætta við.
6. **apply** → `onApply(workingSet)` → `replaceRows` swaps the table → session
   destroyed, panel closes.

## Error handling

- `unavailable` → `AiAutofill` renders nothing (gated in `SalaryForm`).
- Download/session-create failure → inline error; manual entry unaffected.
- Empty/invalid parse → *"Náði ekki að lesa úr textanum — prófaðu að orða það
  öðruvísi eða sláðu inn handvirkt."* (stay in describe state, keep the text).
- `normalizeRows.dropped > 0` → small note that some entries were skipped
  (out of range / unparseable).
- STT unsupported for both langs → mic hidden. STT runtime error → stop, keep
  whatever text exists, surface a quiet message.
- The model session is created lazily (first Greina) and destroyed on close/apply.

## Privacy & docs

All processing is on-device; audio and salary text never leave the browser, so the
existing privacy claims hold. The README and the methodology "verify" content gain
a sentence noting the optional on-device AI (same truthfulness discipline applied
for Umami). The privacy verification copy remains accurate — the Network tab shows
no new requests.

## Testing

- **`tests/normalizeRows.test.ts`** (new, pure): valid rows pass; out-of-range
  months dropped (and counted); amounts rounded/bounded; sub-zero and over-max
  rejected; dedupe-by-month keeps last; unsorted input sorted; mixed/garbage
  `month` strings rejected gracefully.
- The Prompt/Speech wrappers are feature-detected and thin; verified manually and
  via Playwright with an **injected mock** `LanguageModel`/recognition (so the
  panel flow — describe → preview → edit → apply — is exercised without the real
  browser model). We do not unit-test the browser APIs themselves.

## Out of scope (v1)

Server STT, languages beyond Icelandic/English, multi-language UI chrome,
persistent chat/history, voice output, any cloud fallback, and merging into
existing rows (apply always replaces, per the brainstorm).
