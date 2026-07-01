# Preset-Scroll Disclosure & IA Redesign — Design Spec

**Date:** 2026-07-01
**Status:** Approved — Codex adversarial review incorporated (verdict was
SHIP-WITH-FIXES; all 9 findings folded in, see "Adversarial-review fixes" below).

## Problem

On a 390×844 mobile viewport with the Lágmarkslaun preset active, the page is
**8,018px tall — ~9.5 phone screens.** Measured breakdown (Playwright):

| Section | Height | Share |
|---|---|---|
| Hero | 354px | 4% |
| Profile bar | 113px | 1% |
| Payoff card (the answer) | 541px | 7% |
| **"Launin þín" — salary form** | **2,629px** | **33%** |
| Chart | 646px | 8% |
| **"Staðan í dag" — summary** | **2,649px** | **33%** |
| Methodology + footer | ~860px | 11% |

The two repeating-card sections total **5,278px (66% of the page)** and render the
same per-event data twice:

- **Salary form:** 10 locked entry cards @ 209px = 2,232px of inputs the user
  **cannot edit** (they are `disabled` on a read-only preset).
- **Summary:** 10 cards @ 246px = 2,602px, restating what the chart already plots.

The two things users came for — the payoff headline and the chart — are islanded
inside walls of repetition. The chart sits at screen ~4.5.

Root cause: the page renders one large card **per salary event**, in two separate
sections; presets ship 10–11 events, so ~20 near-identical cards bury the answer.

## Goal

Cut the preset page from ~8,000px to ~1,900–2,200px (roughly 4× less scroll) and
move the chart from screen ~4.5 to screen ~1–2, by leading with the answer and
putting raw per-event data behind progressive disclosure — **without removing any
information**, only making it opt-in.

## Decisions (from brainstorming)

1. **Scope:** disclosure is driven by a "many entries" threshold, applied to any
   profile (preset or user), not preset-only.
2. **Order:** `Payoff → Chart → history → summary` (chart moves above the form).
3. **Editing:** the history form is expanded when short/empty and collapses once
   there are many entries; a collapsed editable profile expands via **Breyta**.
4. **Summary:** a compact table, collapsed by default when there are many entries,
   living under the chart.
5. **Threshold = 5.** Collapsed history one-liner: *"N launafærslur · YYYY–YYYY"*.
   (Originally "launabreytingar"; changed to the neutral "launafærslur" per
   adversarial-review fix #3 — the first entry is the starting salary, not a
   change, and later entries can be cuts/corrections, so "changes" was inaccurate.)

"Many" = **filled rows/events count > 5** (`MANY_ENTRIES_THRESHOLD = 5`).

## Architecture

### Page order (`src/app.tsx`)

`Hero → ProfileBar → PayoffCard → Chart → SalaryForm → SummaryCards → Methodology`.

Only structural change: `<Chart>` moves above `<SalaryForm>`. **Both `SalaryForm`
and `SummaryCards` gain a `profileKey={active.resolvedId}` prop** so each can reset
its expand state on profile switch (fix #1). Do **not** auto-move focus to the
chart when it first appears during typing (fix #6) — leave the existing focus flow
alone.

### New component — `src/components/Disclosure.tsx`

A small, domain-agnostic collapse wrapper reused by both sections (one accessible
implementation, DRY).

- **Props:** `summary` (VNode, always visible — rendered as a **sibling** of the
  toggle, never wrapped inside the toggle button), `children` (collapsible region),
  `expanded: boolean`, `onToggle: () => void`, `toggleLabel: string`,
  `regionId: string`.
- **Render:** the `summary` VNode; then a `<button type="button"
  aria-expanded={expanded} aria-controls={regionId}>` carrying `toggleLabel`; then
  a region `<div id={regionId}>` that is **conditionally rendered only when
  `expanded`** (children are *unmounted* while collapsed — see fix #4). The
  `summary` and the toggle are separate elements so a `summary` that itself
  contains a button (the preset fork CTA) never nests inside the toggle button
  (fix #5).
- **No height animation.** Collapsed = children unmounted, so there is nothing to
  clip; toggling is instant. This keeps collapsed form controls out of the tab
  order for free and avoids the `grid-template-rows` "focusable-but-clipped" trap
  (fix #4). (Reduced-motion is therefore moot for this component.)
- Holds **no** domain logic; open/closed state is owned by the parent.

Rationale for parent-owned state: `SalaryForm` must reset expand-state on profile
switch and derive the default from `collapsible`; `SummaryCards` derives its
default from event count. Keeping state in the parents avoids a stale-state effect
inside the generic component.

### Threshold constant (`src/lib/profiles.ts`)

```ts
export const MANY_ENTRIES_THRESHOLD = 5;
```

Placed with the other caps (`MAX_PROFILES`, `MAX_ENTRIES`, …).

### Pure helper — `historySpan` (`src/lib/profiles.ts`)

```ts
export interface HistorySpan { count: number; firstYear: number; lastYear: number; }

/** Count and year-span of a set of salary events. Empty → count 0, years 0. */
export function historySpan(events: SalaryEvent[]): HistorySpan {
  let firstYear = Infinity, lastYear = -Infinity, count = 0;
  for (const e of events) {
    const y = Number(e.month.slice(0, 4));
    if (!Number.isFinite(y)) continue; // guard malformed month (fix #7)
    count++;
    if (y < firstYear) firstYear = y;
    if (y > lastYear) lastYear = y;
  }
  if (count === 0) return { count: 0, firstYear: 0, lastYear: 0 };
  return { count, firstYear, lastYear };
}
```

The `Number.isFinite` guard matters because `SalaryForm` feeds `historySpan` from
draft rows (fix #7); a malformed month must not produce a `NaN–NaN` label. Tests
must cover same-year events and events at the first/last CPI month.

Unit-testable, no JSX. `SalaryForm` computes its one-liner from the **filled**
rows (rows with a non-empty `amountText`), converting them to `{month}` shapes.

### `SalaryForm` (collapsible history)

- Compute `filled = props.rows.filter(r => r.amountText.trim() !== "")`.
- `collapsible = filled.length > MANY_ENTRIES_THRESHOLD`.
- Internal `expanded` state: `useState(() => !collapsible)`; a
  `useEffect(() => setExpanded(!collapsible), [props.profileKey])` resets it **only
  on profile switch/load**, keyed on `profileKey` (= `active.resolvedId`) — **not**
  on `collapsible` and **not** on every row edit.
  - **Explicit non-goal (fix #2):** the form must **never auto-collapse while the
    user is editing.** When someone editing an expanded ≤5-row form types a 6th
    valid amount (crossing the threshold on the *same* profile), the reset effect
    does not fire, so the form stays expanded and focus is preserved. An
    implementer must not add `collapsible` to the effect deps — that would collapse
    the form out from under the user mid-typing. A regression test enforces this.
- **Collapsed render** (when `collapsible && !expanded`):
  - The read-only preset banner (source + kind note + **Afrita og breyta** fork)
    stays visible when `props.readOnly` — the credibility line is what earns trust.
  - A one-liner built from `historySpan(filled-as-events)`:
    `copy.form.historySummary(count, spanLabel)` where `spanLabel` is
    `firstYear === lastYear ? String(firstYear) : \`${firstYear}–${lastYear}\``.
    (`filled-as-events` = `filled.map(r => ({ month: r.month, amount: 0 }))`;
    `historySpan` only reads `.month`, and its `Number.isFinite` guard covers any
    stray malformed row.)
  - A toggle button: `copy.form.showEntries` ("Sýna færslur") when `readOnly`,
    else `copy.form.editHistory` ("Breyta"). Sets `expanded = true`.
- **Expanded render:** today's form exactly (AI autofill, preset banner, entry
  list, add-row, empty-state). When `collapsible`, also show a
  `copy.form.hideEntries` ("Fela") toggle to re-collapse (editable and read-only).
- When **not** `collapsible` (≤5 filled or empty): render today's form with no
  disclosure chrome at all — a fresh user types immediately.

### `SummaryCards` → compact table

- Replace the per-event `article.summary-card` stack with a semantic `<table>`,
  wrapped in a `.summary-table-wrap` overflow container (fix #8):
  - `<thead>`: `Mánuður` · `Laun` · `Kaupmáttur í dag` · `Breyting`
    (`scope="col"` on the three data `<th>`; the month header is `scope="col"`).
  - One `<tr>` per event (newest-first, as today). The **month cell is
    `<th scope="row">`** for row context (fix #8); remaining cells: set amount,
    real-value-today, and a `delta-chip` (`is-loss` when negative) showing
    `formatISKDelta(delta) (formatPercent(ratio))`.
  - Numeric cells use `white-space: nowrap`; the `.summary-table-wrap` allows
    horizontal scroll as a last resort so nothing is clipped at 320–390px.
  - "Too new" row (event month === `cpi.lastMonth`): the Breyting cell shows the
    existing `copy.summary.tooNew` muted note; real-value cell shows the amount.
- Wrap the table in `Disclosure`. **`SummaryCards` gains a
  `profileKey={active.resolvedId}` prop (fix #1)** — it is always mounted from
  `App`, so a bare `useState(events.length <= 5)` initializer would only run once
  and leave the drawer stale after switching between two long profiles. State:
  `const [expanded, setExpanded] = useState(() => events.length <= MANY_ENTRIES_THRESHOLD)`
  plus
  `useEffect(() => setExpanded(events.length <= MANY_ENTRIES_THRESHOLD), [profileKey])`
  to reset on switch. (Keyed on `profileKey`, not `events.length`, for the same
  no-collapse-mid-edit reason as the form.) Collapsed toggle label:
  `copy.summary.showAll(events.length)` ("Sjá alla mánuði (N)"); expanded label
  `copy.summary.hide` ("Fela").
- `events.length === 0` still returns `null` (unchanged).

## Copy additions (`src/copy.ts`)

All Icelandic, added to the existing `form` / `summary` maps. Edits must be
byte-safe around the smart quotes `„…"` (U+201E/U+201C); verify `grep -n "„"`
after editing.

```ts
form: {
  // …
  historySummary: (count: number, span: string) => `${count} launafærslur · ${span}`,
  editHistory: "Breyta",
  showEntries: "Sýna færslur",
  hideEntries: "Fela",
},
summary: {
  // …
  showAll: (n: number) => `Sjá alla mánuði (${n})`,
  hide: "Fela",
  thMonth: "Mánuður",
  thSet: "Laun",
  thReal: "Kaupmáttur í dag",
  thChange: "Breyting",
},
```

(The collapsed history only appears when count > 5, so `launafærslur` is always
plural — no singular form needed.)

## Styling (`src/styles.css`)

- New `.disclosure`, `.disclosure-toggle`, `.disclosure-region` (grid-rows reveal).
- New `.history-collapsed` (one-liner + toggle layout).
- New `.summary-table` (dense rows ~40px, right-aligned numerics, reuse the
  existing `.delta-chip` / `.numeric` styles and `.is-loss` color token).
- Remove now-dead summary card selectors — but **verify before deleting** (fix #9):
  after the table lands, run `rg "summary-(card|list|when|real|required|too-new)"
  src` and delete only selectors with zero remaining JSX references. Candidates:
  `.summary-card`, `.summary-when`, `.summary-real`, `.summary-real-label`,
  `.summary-real-value`, `.summary-required`, `.summary-too-new`,
  `.summary-list`. Keep `.entry-card` (expanded form), and the shared
  `.delta-chip` / `.numeric` / `.is-loss` (reused by the table).
- No new color tokens; reuse existing palette.

## Edge cases

- **Empty profile** (1 blank row, filled = 0): not collapsible → form expanded,
  existing `emptyState` prompt; Payoff/Chart/Summary return `null` at 0 events.
- **Short user profile (≤5 filled):** form + summary table both expanded, no
  disclosure chrome.
- **Preset (read-only, 10 rows):** collapsed history (source + one-liner +
  **Sýna færslur** + **Afrita og breyta**); collapsed summary table.
- **Long user profile (>5):** collapsed history with **Breyta**; expands to edit.
  Summary collapsed.
- **Profile switch:** `useEffect` on `profileKey` resets `expanded` to
  `!collapsible`, so no stale open/closed state after switching.
- **Fork a preset:** the editable copy has 10 rows → collapsed with **Breyta**
  (consistent; user expands to edit).
- **Reduced motion:** disclosure reveals instantly.

## Testing

- **`tests/summary.test.ts` (new, or extend):** `historySpan` returns correct
  `{count, firstYear, lastYear}`; single-year span; empty → `{0,0,0}`. Collapsible
  predicate: `count > 5` collapses, `≤ 5` does not.
- **Component-level (Preact testing or existing harness):** collapsed preset
  renders the one-liner + source and **not** 10 inputs; expanded renders the form.
  Summary table renders N rows and the "too new" note when newest === CPI last.
- **Regression test (fix #2):** render an editable profile with 5 filled rows
  (expanded, no disclosure chrome); type a 6th valid amount; assert the entry
  inputs remain mounted (the form did **not** collapse) and focus/value is intact.
- **A11y test (fix #4):** while a drawer is collapsed, its region children are not
  in the DOM (query for an inner input/select returns nothing), so they cannot be
  tab-focused; `aria-expanded="false"` and `aria-controls` point at the region.
- **Existing suites stay green** — additive UI; presets/profiles/inflation logic
  untouched.
- **Playwright mobile (390×844):** re-measure page height on Lágmarkslaun preset
  (expect < ~2,300px); chart above the fold region; expand/collapse both drawers;
  fork still works; only the Umami network call.

## Out of scope (YAGNI)

- No row virtualization.
- No persisting expand state across reloads (reset-on-switch is enough).
- No changes to AI autofill, the Chart internals, or the CPI pipeline.
- No new profile/preset data.

## Adversarial-review fixes (Codex, verdict SHIP-WITH-FIXES)

Every finding from the Codex review is resolved in the spec above:

1. **High — summary drawer stale across switches:** `SummaryCards` gets
   `profileKey` + reset `useEffect` (same as the form).
2. **Med — misleading "collapses when many" prose:** explicit non-goal added — the
   form defaults collapsed only on switch/load and never auto-collapses mid-edit;
   effect keyed on `profileKey`, not `collapsible`; regression test added.
3. **Med — "launabreytingar" off-by-one:** copy changed to neutral "launafærslur".
4. **Med — collapsed controls in tab order:** `Disclosure` unmounts collapsed
   children (no grid-clip); a11y test added.
5. **Med — nested buttons:** `Disclosure` renders `summary` as a sibling of the
   toggle button; the preset fork CTA stays outside the toggle.
6. **Low — chart-above-form focus:** don't auto-move focus to the chart on typing.
7. **Low — `historySpan` NaN:** `Number.isFinite` guard + same-year/CPI-boundary
   tests.
8. **Low — summary table overflow:** `.summary-table-wrap` scroll container,
   `nowrap` numerics, `th scope="row"` month, test at 320/390px.
9. **Low — CSS removal:** `rg`-verify each selector before deleting; only dead
   ones go.

## Projected outcome

Preset page height ~8,000px → **~1,900–2,200px**; chart on screen ~1–2 instead of
~4.5; time-to-answer collapses from "scroll past 2.6 screens of locked inputs" to
"payoff + chart, immediately."
