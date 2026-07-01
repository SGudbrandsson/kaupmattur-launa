# Preset-Scroll Disclosure & IA Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut the preset mobile page from ~8000px to ~1900–2200px by leading with payoff+chart and putting the salary history and per-event summary behind progressive disclosure.

**Architecture:** A new domain-agnostic `Disclosure` wrapper (unmounts collapsed children). `SalaryForm` collapses its history when there are >5 filled rows; `SummaryCards` becomes a compact table collapsed the same way. Both reset their expand state on profile switch via a `profileKey` prop. `app.tsx` moves `<Chart>` above `<SalaryForm>`.

**Tech Stack:** Vite, Preact (TSX — uses `class=` NOT `className`), TypeScript, Vitest (pure-logic tests only — NO component-render harness exists; UI behavior is verified with Playwright).

## Global Constraints

- **Preact JSX:** use `class=`, not `className`. Functional components + `preact/hooks`.
- **All user-facing text lives in `src/copy.ts`** — components never hard-code strings.
- **Smart-quote hazard:** `src/copy.ts` contains Icelandic quotes `„…"` (U+201E/U+201C). Prior edits have corrupted them. After ANY edit to `copy.ts`, run `grep -c "„" src/copy.ts` and confirm the count is unchanged (should stay at its pre-edit value). Preserve the exact characters `·` (U+00B7 middle dot) and `–` (U+2013 en dash) in new strings.
- **Tests are pure logic only.** Do NOT add jsdom / @testing-library. Behavior that needs rendering is verified in Task 7 with Playwright.
- **Threshold value is exactly `5`** (`MANY_ENTRIES_THRESHOLD`). "Many" = filled-rows/events count strictly `> 5`.
- **Conventional commits**, ending with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Run the full suite with `npm test` (alias for `vitest run`).

---

### Task 1: Threshold constant + `historySpan` helper

**Files:**
- Modify: `src/lib/profiles.ts` (add constant + function near the other caps, ~line 27-31)
- Test: `tests/historySpan.test.ts` (create)

**Interfaces:**
- Produces: `export const MANY_ENTRIES_THRESHOLD = 5;`
- Produces: `export interface HistorySpan { count: number; firstYear: number; lastYear: number; }`
- Produces: `export function historySpan(events: SalaryEvent[]): HistorySpan` — counts events with a well-formed 4-digit year, returns min/max year; empty/all-malformed → `{count:0, firstYear:0, lastYear:0}`.

- [ ] **Step 1: Write the failing test**

Create `tests/historySpan.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { historySpan, MANY_ENTRIES_THRESHOLD } from "../src/lib/profiles";
import type { SalaryEvent } from "../src/lib/inflation";

const ev = (month: string): SalaryEvent => ({ month, amount: 1 });

describe("historySpan", () => {
  it("returns count and min/max year across events", () => {
    expect(historySpan([ev("2015-05"), ev("2020-06"), ev("2024-06")])).toEqual({
      count: 3, firstYear: 2015, lastYear: 2024,
    });
  });

  it("collapses a single-year set to one year", () => {
    expect(historySpan([ev("2022-01"), ev("2022-09")])).toEqual({
      count: 2, firstYear: 2022, lastYear: 2022,
    });
  });

  it("handles the CPI boundary months", () => {
    expect(historySpan([ev("1988-05"), ev("2026-05")])).toEqual({
      count: 2, firstYear: 1988, lastYear: 2026,
    });
  });

  it("empty input yields zeros", () => {
    expect(historySpan([])).toEqual({ count: 0, firstYear: 0, lastYear: 0 });
  });

  it("skips malformed months instead of producing NaN", () => {
    expect(historySpan([ev("2015-05"), { month: "bad", amount: 1 }])).toEqual({
      count: 1, firstYear: 2015, lastYear: 2015,
    });
  });

  it("exposes the threshold as 5", () => {
    expect(MANY_ENTRIES_THRESHOLD).toBe(5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- historySpan`
Expected: FAIL — `historySpan`/`MANY_ENTRIES_THRESHOLD` not exported.

- [ ] **Step 3: Write the implementation**

In `src/lib/profiles.ts`, after `export const MAX_IMPORT_BYTES = 1_000_000;` (line ~31) add:

```ts
export const MANY_ENTRIES_THRESHOLD = 5;

export interface HistorySpan {
  count: number;
  firstYear: number;
  lastYear: number;
}

/** Count and year-span of a set of salary events; malformed months are skipped. */
export function historySpan(events: SalaryEvent[]): HistorySpan {
  let firstYear = Infinity;
  let lastYear = -Infinity;
  let count = 0;
  for (const e of events) {
    const y = Number(e.month.slice(0, 4));
    if (!Number.isFinite(y)) continue;
    count++;
    if (y < firstYear) firstYear = y;
    if (y > lastYear) lastYear = y;
  }
  if (count === 0) return { count: 0, firstYear: 0, lastYear: 0 };
  return { count, firstYear, lastYear };
}
```

(`SalaryEvent` is already imported at the top of `profiles.ts`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- historySpan`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/profiles.ts tests/historySpan.test.ts
git commit -m "feat: add MANY_ENTRIES_THRESHOLD and historySpan helper

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Copy strings for disclosure + summary table

**Files:**
- Modify: `src/copy.ts` (`form` block ~line 127-143; `summary` block ~line 172-179)
- Test: `tests/disclosureCopy.test.ts` (create)

**Interfaces:**
- Produces on `copy.form`: `historySummary: (count: number, span: string) => string`, `editHistory: string`, `showEntries: string`, `hideEntries: string`.
- Produces on `copy.summary`: `showAll: (n: number) => string`, `hide: string`, `thMonth: string`, `thSet: string`, `thReal: string`, `thChange: string`.

- [ ] **Step 1: Write the failing test**

Create `tests/disclosureCopy.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { copy } from "../src/copy";

describe("disclosure + summary-table copy", () => {
  it("history summary combines count and span", () => {
    expect(copy.form.historySummary(10, "2015–2024")).toBe("10 launafærslur · 2015–2024");
  });

  it("has non-empty history toggle labels", () => {
    expect(copy.form.editHistory.length).toBeGreaterThan(0);
    expect(copy.form.showEntries.length).toBeGreaterThan(0);
    expect(copy.form.hideEntries.length).toBeGreaterThan(0);
  });

  it("summary showAll includes the count", () => {
    expect(copy.summary.showAll(10)).toContain("10");
  });

  it("has four summary table headers", () => {
    for (const h of [copy.summary.thMonth, copy.summary.thSet, copy.summary.thReal, copy.summary.thChange]) {
      expect(h.length).toBeGreaterThan(0);
    }
    expect(copy.summary.hide.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- disclosureCopy`
Expected: FAIL — properties undefined.

- [ ] **Step 3: Add the copy**

In `src/copy.ts`, inside the `form: { … }` object (after `exampleNote`, before the closing `},` at ~line 143) add:

```ts
    historySummary: (count: number, span: string) => `${count} launafærslur · ${span}`,
    editHistory: "Breyta",
    showEntries: "Sýna færslur",
    hideEntries: "Fela",
```

Inside the `summary: { … }` object (after `tooNew`, before its closing `},` at ~line 179) add:

```ts
    showAll: (n: number) => `Sjá alla mánuði (${n})`,
    hide: "Fela",
    thMonth: "Mánuður",
    thSet: "Laun",
    thReal: "Kaupmáttur í dag",
    thChange: "Breyting",
```

The literal `·` is U+00B7 (middle dot) and `–` (in the test) is U+2013 (en dash). Do not substitute ASCII.

- [ ] **Step 4: Verify smart quotes intact, then run tests**

```bash
grep -c "„" src/copy.ts   # note this number equals the pre-edit count (unchanged)
npm test -- disclosureCopy
```
Expected: `grep` count unchanged from before the edit; tests PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/copy.ts tests/disclosureCopy.test.ts
git commit -m "feat: add copy for salary-history disclosure and summary table

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `Disclosure` component

**Files:**
- Create: `src/components/Disclosure.tsx`
- Modify: `src/styles.css` (append `.disclosure` styles)

**Interfaces:**
- Produces: `export interface DisclosureProps { summary: ComponentChildren; children: ComponentChildren; expanded: boolean; onToggle: () => void; toggleLabel: string; regionId: string; }`
- Produces: `export function Disclosure(props: DisclosureProps)` — renders `summary` (sibling), a toggle `<button>` with `aria-expanded`/`aria-controls`, and the region `<div id={regionId}>` **only when `expanded`** (children unmounted while collapsed). State is owned by the parent.

No unit test — this is a presentational component and the repo has no render harness. Its gate is typecheck + build + its consumers (Tasks 4-5) + Playwright (Task 7).

- [ ] **Step 1: Create the component**

Create `src/components/Disclosure.tsx`:

```tsx
import type { ComponentChildren } from "preact";

export interface DisclosureProps {
  /** Always-visible content; rendered as a sibling of the toggle, never inside it. */
  summary: ComponentChildren;
  /** Collapsible content; unmounted entirely while collapsed. */
  children: ComponentChildren;
  expanded: boolean;
  onToggle: () => void;
  toggleLabel: string;
  regionId: string;
}

/**
 * Domain-agnostic collapse wrapper. Collapsed children are UNMOUNTED (not just
 * visually hidden) so their focusable controls never sit in the tab order.
 * Open/closed state is owned by the parent.
 */
export function Disclosure({
  summary,
  children,
  expanded,
  onToggle,
  toggleLabel,
  regionId,
}: DisclosureProps) {
  return (
    <div class="disclosure">
      <div class="disclosure-summary">{summary}</div>
      <button
        type="button"
        class="disclosure-toggle"
        aria-expanded={expanded}
        aria-controls={regionId}
        onClick={onToggle}
      >
        {toggleLabel}
      </button>
      {expanded && (
        <div id={regionId} class="disclosure-region">
          {children}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add styles**

Append to `src/styles.css`:

```css
.disclosure {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.disclosure-summary {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.5rem 0.75rem;
}
.disclosure-toggle {
  align-self: flex-start;
  background: none;
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 0.5rem 1rem;
  min-height: 44px;
  font: inherit;
  color: var(--ink);
  cursor: pointer;
}
.disclosure-toggle:hover {
  border-color: var(--glacier);
}
```

(Tokens confirmed in `:root`: `--line`, `--ink`, `--glacier` (accent), `--ink-soft` (muted), `--paper`. Match a bordered pill already present — e.g. `.frame-pick button` — for exact feel.)

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: no type errors; build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/Disclosure.tsx src/styles.css
git commit -m "feat: add Disclosure collapse wrapper (unmounts collapsed children)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: `SummaryCards` → collapsible compact table

**Files:**
- Modify: `src/components/SummaryCards.tsx` (full rewrite of the render)
- Modify: `src/styles.css` (add `.summary-table*`; remove dead `.summary-*` selectors after `rg` check)

**Interfaces:**
- Consumes: `Disclosure` (Task 3), `MANY_ENTRIES_THRESHOLD` (Task 1), `copy.summary.{showAll,hide,thMonth,thSet,thReal,thChange,tooNew}` (Task 2).
- Produces: `SummaryCards` now takes an added prop `profileKey: string` (the caller passes `active.resolvedId`).

- [ ] **Step 1: Rewrite the component**

Replace the body of `src/components/SummaryCards.tsx` with:

```tsx
import { useEffect, useState } from "preact/hooks";
import { copy } from "../copy";
import type { CpiData } from "../lib/cpi";
import { compareMonths } from "../lib/cpi";
import type { SalaryEvent } from "../lib/inflation";
import { realValue, requiredToday } from "../lib/inflation";
import { MANY_ENTRIES_THRESHOLD } from "../lib/profiles";
import { Disclosure } from "./Disclosure";
import {
  formatISK,
  formatISKDelta,
  formatMonth,
  formatPercent,
} from "../lib/format";

interface SummaryCardsProps {
  events: SalaryEvent[];
  cpi: CpiData;
  profileKey: string;
}

export function SummaryCards({ events, cpi, profileKey }: SummaryCardsProps) {
  const s = copy.summary;
  const [expanded, setExpanded] = useState(
    () => events.length <= MANY_ENTRIES_THRESHOLD,
  );
  // Reset on profile switch only (not on every keystroke) so an in-progress
  // edit that crosses the threshold never collapses the table mid-typing.
  useEffect(() => {
    setExpanded(events.length <= MANY_ENTRIES_THRESHOLD);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileKey]);

  if (events.length === 0) return null;
  const sorted = [...events].sort((a, b) => compareMonths(b.month, a.month));

  const table = (
    <div class="summary-table-wrap">
      <table class="summary-table">
        <thead>
          <tr>
            <th scope="col">{s.thMonth}</th>
            <th scope="col">{s.thSet}</th>
            <th scope="col">{s.thReal}</th>
            <th scope="col">{s.thChange}</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((event) => {
            const isTooNew = event.month === cpi.lastMonth;
            const real = realValue(event.amount, event.month, cpi.lastMonth, cpi);
            const delta = real - event.amount;
            const ratio = real / event.amount - 1;
            return (
              <tr key={event.month}>
                <th scope="row" class="summary-td-month">{formatMonth(event.month)}</th>
                <td class="numeric">{formatISK(event.amount)}</td>
                <td class="numeric">{isTooNew ? formatISK(event.amount) : formatISK(real)}</td>
                <td>
                  {isTooNew ? (
                    <span class="summary-too-new">{s.tooNew}</span>
                  ) : (
                    <span class={`delta-chip numeric${delta < 0 ? " is-loss" : ""}`}>
                      {formatISKDelta(delta)} ({formatPercent(ratio)})
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <section class="summary" aria-labelledby="summary-title">
      <h2 id="summary-title">{s.title}</h2>
      <Disclosure
        summary={null}
        expanded={expanded}
        onToggle={() => setExpanded((v) => !v)}
        toggleLabel={expanded ? s.hide : s.showAll(events.length)}
        regionId="summary-detail"
      >
        {table}
      </Disclosure>
    </section>
  );
}
```

- [ ] **Step 2: Add table styles; remove dead card styles**

First check what is now dead:

```bash
rg "summary-(card|list|when|real|required|too-new)" src
```

Delete from `src/styles.css` every `.summary-*` selector in that list that has NO remaining hit in `src/` (keep `.summary-too-new` — still used above; keep `.summary` and `.summary h2`; keep shared `.delta-chip`, `.numeric`, `.is-loss`). Then append:

```css
.summary-table-wrap {
  overflow-x: auto;
}
.summary-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.95rem;
}
.summary-table th,
.summary-table td {
  padding: 0.55rem 0.6rem;
  text-align: right;
  border-bottom: 1px solid var(--line);
  white-space: nowrap;
}
.summary-table thead th {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--ink-soft);
  border-bottom-width: 2px;
}
.summary-table th[scope="row"],
.summary-table thead th:first-child {
  text-align: left;
}
.summary-td-month {
  font-weight: 500;
}
```

- [ ] **Step 3: Verify existing tests still green + typecheck + build**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: all existing tests PASS; no type errors (note: `app.tsx` won't yet pass `profileKey` — TS may flag the missing prop; that is fixed in Task 6. If `tsc` errors ONLY on the `SummaryCards` call site in `app.tsx`, that is expected and resolved next; the build via Task 6 must be clean).

> Implementer note: to keep this task independently green, you MAY do Task 6's one-line `profileKey` wiring for `SummaryCards` now; but prefer to keep tasks separate and accept the known transient `app.tsx` type error until Task 6.

- [ ] **Step 4: Commit**

```bash
git add src/components/SummaryCards.tsx src/styles.css
git commit -m "feat: render Staðan í dag as a collapsible compact table

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: `SalaryForm` collapsible history

**Files:**
- Modify: `src/components/SalaryForm.tsx`
- Modify: `src/styles.css` (add `.history-collapsed` styles)

**Interfaces:**
- Consumes: `Disclosure` (Task 3), `MANY_ENTRIES_THRESHOLD` + `historySpan` (Task 1), `copy.form.{historySummary,editHistory,showEntries,hideEntries}` (Task 2).
- Produces: `SalaryFormProps` gains `profileKey: string`.

- [ ] **Step 1: Add prop + expand state**

In `src/components/SalaryForm.tsx`:

1. Extend imports:
```tsx
import { useEffect, useState } from "preact/hooks";
import { MANY_ENTRIES_THRESHOLD, historySpan, type PresetKind } from "../lib/profiles";
import { Disclosure } from "./Disclosure";
```
(Keep the existing `import type { SalaryEvent } from "../lib/inflation";`.)

2. Add `profileKey: string;` to `interface SalaryFormProps`.

3. Inside `SalaryForm`, after `const f = copy.form;` add:
```tsx
  const filled = props.rows.filter((r) => r.amountText.trim() !== "");
  const collapsible = filled.length > MANY_ENTRIES_THRESHOLD;
  const [expanded, setExpanded] = useState(() => !collapsible);
  // Reset ONLY on profile switch — never key on `collapsible`, or the form would
  // collapse out from under a user who crosses the threshold while typing.
  useEffect(() => {
    setExpanded(!collapsible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.profileKey]);
```

- [ ] **Step 2: Render collapsed vs expanded**

The current form body (from `<div class="entry-list">` through the empty-state `<p>`) becomes the expanded region. Wrap the entry list + add-row + empty-state in a `formBody` variable, then render via `Disclosure` when `collapsible`, else inline as today.

Replace the block starting at `<div class="entry-list">` … through the end of the `return (…)` with:

```tsx
  const span = historySpan(filled.map((r) => ({ month: r.month, amount: 0 })));
  const spanLabel =
    span.firstYear === span.lastYear
      ? String(span.firstYear)
      : `${span.firstYear}–${span.lastYear}`;

  const formBody = (
    <>
      <div class="entry-list">
        {props.rows.map((row) => {
          const error = props.errors.get(row.id);
          return (
            <div class={`entry-card card${error ? " has-error" : ""}`} key={row.id}>
              <MonthPicker
                month={row.month}
                cpi={props.cpi}
                rowId={row.id}
                disabled={props.readOnly}
                onChange={(month) => props.onChangeRow(row.id, { month })}
              />
              <label class="field field-amount">
                <span class="field-label">{f.amountLabel}</span>
                <div class="amount-wrap">
                  <input
                    type="text"
                    inputMode="numeric"
                    autocomplete="off"
                    placeholder={f.amountPlaceholder}
                    value={row.amountText}
                    disabled={props.readOnly}
                    aria-invalid={error ? "true" : undefined}
                    aria-describedby={error ? `err-${row.id}` : undefined}
                    onInput={(e) =>
                      props.onChangeRow(row.id, { amountText: e.currentTarget.value })
                    }
                    onBlur={(e) => handleAmountBlur(row, e.currentTarget.value)}
                  />
                  <span class="amount-suffix">{f.amountSuffix}</span>
                </div>
              </label>
              {!props.readOnly && props.rows.length > 1 && (
                <button
                  type="button"
                  class="remove-row"
                  aria-label={f.removeLabel}
                  title={f.removeLabel}
                  onClick={() => props.onRemoveRow(row.id)}
                >
                  ×
                </button>
              )}
              {error && (
                <p class="field-error" id={`err-${row.id}`} role="alert">
                  {error}
                </p>
              )}
            </div>
          );
        })}
      </div>
      {!props.readOnly && (
        <button type="button" class="add-row" onClick={props.onAddRow}>
          <span aria-hidden="true">+</span> {f.addButton}
        </button>
      )}
      {!props.readOnly && isEmpty && (
        <p class="form-empty">{copy.profiles.emptyState}</p>
      )}
    </>
  );

  const expandLabel = props.readOnly ? f.showEntries : f.editHistory;

  return (
    <section class="salary rise rise-3" aria-labelledby="salary-title">
      <h2 id="salary-title">{f.title}</h2>
      <p class="section-intro">{f.intro}</p>
      <p class="form-privacy">
        <LockIcon />
        {copy.privacy.inline}
      </p>
      {aiReady && !props.readOnly && (
        <AiAutofill
          cpi={props.cpi}
          onApply={props.onAiApply}
          speechLangs={speechLangs}
        />
      )}
      {props.readOnly && (
        <div class="preset-banner">
          <span>{copy.profiles.presetLockedBanner(props.presetSource ?? "")}</span>
          {props.presetKind && (
            <span class="preset-kind-note">
              {copy.profiles.presetKinds[props.presetKind].banner}
            </span>
          )}
          <button type="button" class="example-cta" onClick={props.onFork}>
            {copy.profiles.forkCta}
          </button>
        </div>
      )}
      {collapsible ? (
        <Disclosure
          summary={
            <span class="history-collapsed-line numeric">
              {f.historySummary(filled.length, spanLabel)}
            </span>
          }
          expanded={expanded}
          onToggle={() => setExpanded((v) => !v)}
          toggleLabel={expanded ? f.hideEntries : expandLabel}
          regionId="salary-entries"
        >
          {formBody}
        </Disclosure>
      ) : (
        formBody
      )}
    </section>
  );
```

Note: the preset banner (with the fork CTA) is rendered ABOVE the `Disclosure` and stays visible when collapsed — the credibility line always shows, and the fork button is never nested inside the toggle.

- [ ] **Step 3: Add collapsed-line style**

Append to `src/styles.css`:

```css
.history-collapsed-line {
  color: var(--ink-soft);
  font-size: 0.95rem;
}
```

- [ ] **Step 4: Typecheck + build (app.tsx wiring lands in Task 6)**

Run: `npx tsc --noEmit`
Expected: the only errors are the two call sites in `app.tsx` missing `profileKey` (SalaryForm + SummaryCards) — resolved in Task 6.

- [ ] **Step 5: Commit**

```bash
git add src/components/SalaryForm.tsx src/styles.css
git commit -m "feat: collapse the salary history behind disclosure when many entries

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Wire up `app.tsx` — reorder chart, pass `profileKey`

**Files:**
- Modify: `src/app.tsx` (the returned JSX, ~line 134-172)

**Interfaces:**
- Consumes: `SalaryForm` + `SummaryCards` now each require `profileKey`.

- [ ] **Step 1: Reorder + pass props**

In `src/app.tsx`, change the JSX so `<Chart>` comes before `<SalaryForm>`, and pass `profileKey={active.resolvedId}` to both `<SalaryForm>` and `<SummaryCards>`. The `<main>` children become, in order:

```tsx
        <Hero />
        <ProfileBar
          store={store}
          presets={PRESETS}
          activeId={active.resolvedId}
          activeName={active.name}
          isPreset={active.kind === "preset"}
          onSelect={onSelect}
          onNew={onNew}
          onRename={onRename}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
          onExport={onExport}
          onImportFile={onImportFile}
        />
        <PayoffCard events={events} cpi={cpi} />
        <Chart events={events} cpi={cpi} />
        <SalaryForm
          rows={rows}
          errors={errors}
          cpi={cpi}
          readOnly={active.readOnly}
          presetSource={active.source}
          presetKind={active.presetKind}
          profileKey={active.resolvedId}
          onChangeRow={changeRow}
          onAddRow={addRow}
          onRemoveRow={removeRow}
          onFork={onFork}
          onAiApply={replaceRows}
        />
        <SummaryCards events={events} cpi={cpi} profileKey={active.resolvedId} />
        <Methodology />
```

(Only three changes vs. current: `<Chart>` moved up above `<SalaryForm>`; `profileKey` added to `<SalaryForm>`; `profileKey` added to `<SummaryCards>`.)

- [ ] **Step 2: Full green — tests, typecheck, build**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: all tests PASS, no type errors, build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/app.tsx
git commit -m "feat: lead with chart above the salary form; pass profileKey for disclosure reset

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Verify (Playwright mobile) + docs

**Files:**
- Modify: `README.md` (if it describes page structure/sections), `CLAUDE.md` (session-log row)

**This task has no unit test** — it is the manual/Playwright verification gate the repo uses for UI, plus docs.

- [ ] **Step 1: Full suite**

Run: `npm test`
Expected: all tests PASS (existing + `historySpan` + `disclosureCopy`).

- [ ] **Step 2: Playwright mobile verification** (dev server on `http://localhost:5173/`, viewport 390×844)

Verify each, capturing evidence:
1. **Preset active (Lágmarkslaun):** total page height < ~2400px (was 8018px). Measure `document.body.scrollHeight`.
2. Order is Hero → ProfileBar → Payoff → **Chart** → Launin þín → Staðan í dag; the chart is reachable within ~1.5 screens.
3. Salary history is collapsed showing `"10 launafærslur · 2015–2024"` + **Sýna færslur**; the source banner + **Afrita og breyta** are visible; expanding shows the (disabled) rows; collapsing hides them.
4. **A11y (fix #4):** while collapsed, `document.querySelectorAll('#salary-entries input, #salary-entries select').length === 0` (children unmounted).
5. Summary "Staðan í dag" is a collapsed table with **Sjá alla mánuði (10)**; expanding shows a 4-column table with correct values and no horizontal clipping at 390px (and check 320px).
6. **Regression (fix #2):** create a NEW profile, add 5 salaries (form expanded, no disclosure). Add a 6th valid amount → assert the form stays expanded and the inputs remain (does NOT collapse mid-edit).
7. **Fork:** on a preset, **Afrita og breyta** creates an editable copy.
8. **Network:** only request to `umami.snjall.is`; no salary data leaves the device.

- [ ] **Step 3: Update docs**

- If `README.md` documents the page layout/sections, update it to reflect chart-above-form + the two disclosures.
- Add a `CLAUDE.md` session-log row dated 2026-07-01 summarizing the redesign (problem measured at 8018px → target ~2000px; Disclosure component; collapsible history + summary table; Codex-reviewed; Playwright-verified).

- [ ] **Step 4: Commit**

```bash
git add README.md CLAUDE.md
git commit -m "docs: record preset-scroll disclosure redesign

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review notes

- **Spec coverage:** Threshold+helper (T1), copy (T2), Disclosure/unmount/sibling-summary (T3), summary table+profileKey reset+overflow+th-scope-row (T4), collapsible history+no-mid-collapse+banner-outside-toggle (T5), chart reorder+profileKey wiring+no-focus-move (T6), CSS dead-code rg-check (T4), Playwright height/a11y/regression/network (T7). All 9 Codex fixes map to a task.
- **Testing deviation (documented):** component/a11y/regression behaviors are Playwright-verified, not unit-tested, because the repo has no render harness and deliberately keeps tests pure — matching every prior feature in the session log. Pure logic (`historySpan`, threshold, copy) IS unit-tested.
- **Type consistency:** `profileKey: string` added to both `SalaryFormProps` and `SummaryCardsProps`; `historySpan`/`MANY_ENTRIES_THRESHOLD` names consistent across T1/T4/T5; `Disclosure` prop names consistent T3→T4/T5.
```
