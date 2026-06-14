# Payoff-first redesign + tangible lens chooser — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorder the page to lead with an emotional, tangible payoff, and let users re-frame their monthly purchasing-power loss through four chooseable lenses (raise needed, rent, food, quality of life).

**Architecture:** A pure, fully-tested `lib/lenses.ts` computes structured per-lens values from the existing inflation helpers plus a bundled `anchors.json`. A `PayoffCard` Preact component holds only the selected-lens UI state and formats those values via `copy.ts` templates. `app.tsx` is reordered to payoff-first; the standalone privacy badge is demoted to an inline form line plus a methodology expander.

**Tech Stack:** Vite, Preact (TSX), TypeScript, Vitest. No new dependencies, no new network requests.

Spec: `docs/superpowers/specs/2026-06-14-payoff-first-lens-chooser-design.md`.

---

## File structure

- **Create** `src/data/anchors.json` — bundled national-average reference prices.
- **Create** `src/lib/anchors.ts` — typed loader + `anchorToday()` (inflate to latest CPI month).
- **Create** `src/lib/lenses.ts` — `monthlyGap()` + `computeLenses()` (pure, the feature's heart).
- **Create** `tests/lenses.test.ts` — math + labelling tests for the two functions above.
- **Create** `src/components/PayoffCard.tsx` — headline loss + lens chips + result + basis badge.
- **Modify** `src/lib/format.ts` — add `formatDecimal()`.
- **Modify** `src/copy.ts` — add `payoff` and `lenses` blocks, add `privacy.inline`.
- **Modify** `src/components/SalaryForm.tsx` — add an inline privacy reassurance line.
- **Modify** `src/components/Methodology.tsx` — absorb the "how to verify" expander.
- **Modify** `src/app.tsx` — reorder to payoff-first; drop `<PrivacyBadge>`.
- **Delete** `src/components/PrivacyBadge.tsx` — superseded.
- **Modify** `src/styles.css` — payoff card + lens chip styles.
- **Modify** `README.md` — anchor provenance + approximation caveat.

---

## Task 1: Bundled anchors data + loader

**Files:**
- Create: `src/data/anchors.json`
- Create: `src/lib/anchors.ts`
- Test: covered in Task 2's test file (loader is exercised there)

- [ ] **Step 1: Create the anchors data file**

Create `src/data/anchors.json`:

```json
{
  "source": "Áætluð landsmeðaltöl, sýnd sem „um það bil“. Sjá README fyrir nánari skýringar.",
  "referenceMonth": "2025-01",
  "anchors": {
    "rent_3room_capital": { "price": 280000, "unit": "month" },
    "weekly_groceries_family4": { "price": 35000, "unit": "week" },
    "trip_abroad_two": { "price": 250000, "unit": "trip" }
  }
}
```

- [ ] **Step 2: Create the typed loader**

Create `src/lib/anchors.ts`:

```ts
import anchorsJson from "../data/anchors.json";
import type { CpiData, MonthKey } from "./cpi";
import { requiredToday } from "./inflation";

export interface AnchorEntry {
  price: number;
  unit: "month" | "week" | "trip";
}

export interface Anchors {
  source: string;
  referenceMonth: MonthKey;
  anchors: {
    rent_3room_capital: AnchorEntry;
    weekly_groceries_family4: AnchorEntry;
    trip_abroad_two: AnchorEntry;
  };
}

export function getAnchors(): Anchors {
  return anchorsJson as Anchors;
}

/**
 * The anchor's reference price inflated to the latest CPI month, using the
 * overall CPI. requiredToday(price, ref, cpi) === price × CPI(last) / CPI(ref).
 */
export function anchorToday(
  entry: AnchorEntry,
  referenceMonth: MonthKey,
  cpi: CpiData,
): number {
  return requiredToday(entry.price, referenceMonth, cpi);
}
```

- [ ] **Step 3: Confirm it typechecks**

Run: `npx tsc --noEmit`
Expected: no errors. (`resolveJsonModule` is already enabled — `cpi.json` is imported the same way.)

- [ ] **Step 4: Commit**

```bash
git add src/data/anchors.json src/lib/anchors.ts
git commit -m "feat: bundled price anchors + anchorToday helper"
```

---

## Task 2: Lens computation core (`lib/lenses.ts`)

**Files:**
- Create: `src/lib/lenses.ts`
- Test: `tests/lenses.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/lenses.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { CpiData } from "../src/lib/cpi";
import type { Anchors } from "../src/lib/anchors";
import { monthlyGap, computeLenses } from "../src/lib/lenses";

const cpi: CpiData = {
  source: "test",
  fetchedAt: "2025-01-01T00:00:00Z",
  firstMonth: "2023-01",
  lastMonth: "2025-01",
  values: { "2023-01": 100, "2024-01": 110, "2025-01": 120 },
};

const anchors: Anchors = {
  source: "test",
  referenceMonth: "2023-01",
  anchors: {
    rent_3room_capital: { price: 280000, unit: "month" },
    weekly_groceries_family4: { price: 35000, unit: "week" },
    trip_abroad_two: { price: 250000, unit: "trip" },
  },
};

describe("monthlyGap", () => {
  it("returns the today-króna shortfall for the most recent salary", () => {
    const gap = monthlyGap([{ month: "2023-01", amount: 800000 }], cpi);
    expect(gap).not.toBeNull();
    expect(gap!.current).toBe(800000);
    expect(gap!.month).toBe("2023-01");
    expect(gap!.gap).toBeCloseTo(160000, 0); // 800k×120/100 − 800k
  });

  it("uses the most recent event when there are several", () => {
    const gap = monthlyGap(
      [
        { month: "2023-01", amount: 800000 },
        { month: "2024-01", amount: 900000 },
      ],
      cpi,
    );
    expect(gap!.month).toBe("2024-01");
    expect(gap!.gap).toBeCloseTo(81818, 0); // 900k×120/110 − 900k
  });

  it("returns null when the salary is too new to have lost value", () => {
    expect(monthlyGap([{ month: "2025-01", amount: 800000 }], cpi)).toBeNull();
  });

  it("returns null when there are no events", () => {
    expect(monthlyGap([], cpi)).toBeNull();
  });
});

describe("computeLenses", () => {
  const gap = monthlyGap([{ month: "2023-01", amount: 800000 }], cpi)!;
  const lenses = computeLenses(gap, cpi, anchors);
  const by = (k: string) => lenses.find((l) => l.key === k)!;

  it("returns the four lenses in order", () => {
    expect(lenses.map((l) => l.key)).toEqual(["raise", "rent", "food", "life"]);
  });

  it("computes the exact raise lens", () => {
    const l = by("raise");
    expect(l.basis).toBe("exact");
    if (l.key !== "raise") throw new Error("type");
    expect(l.raisePct).toBeCloseTo(0.2, 5); // 120/100 − 1
    expect(l.extraDays).toBeCloseTo(160000 / (800000 / 21.67), 2);
  });

  it("computes the approximate rent lens", () => {
    const l = by("rent");
    expect(l.basis).toBe("approx");
    if (l.key !== "rent") throw new Error("type");
    expect(l.monthsOfRent).toBeCloseTo(160000 / 336000, 4); // rent 280k×1.2
  });

  it("computes the approximate food lens", () => {
    const l = by("food");
    if (l.key !== "food") throw new Error("type");
    expect(l.weeksOfFood).toBeCloseTo(160000 / 42000, 4); // 35k×1.2
  });

  it("computes the approximate, annualized life lens", () => {
    const l = by("life");
    if (l.key !== "life") throw new Error("type");
    expect(l.annualLoss).toBeCloseTo(1920000, 0); // 160k×12
    expect(l.trips).toBeCloseTo(1920000 / 300000, 4); // 250k×1.2
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/lenses.test.ts`
Expected: FAIL — `monthlyGap`/`computeLenses` not found (module missing).

- [ ] **Step 3: Implement `lib/lenses.ts`**

Create `src/lib/lenses.ts`:

```ts
import type { CpiData, MonthKey } from "./cpi";
import { compareMonths } from "./cpi";
import type { SalaryEvent } from "./inflation";
import { requiredToday } from "./inflation";
import { type Anchors, anchorToday } from "./anchors";

const WORKDAYS_PER_MONTH = 21.67;

export type LensKey = "raise" | "rent" | "food" | "life";
export type LensBasis = "exact" | "approx";

export type LensValue =
  | { key: "raise"; basis: "exact"; raisePct: number; extraDays: number }
  | { key: "rent"; basis: "approx"; monthsOfRent: number }
  | { key: "food"; basis: "approx"; weeksOfFood: number }
  | { key: "life"; basis: "approx"; annualLoss: number; trips: number };

export interface Gap {
  /** Monthly purchasing-power shortfall in today's króna (> 0). */
  gap: number;
  /** The current (most recent) nominal salary. */
  current: number;
  /** The month the current salary was set. */
  month: MonthKey;
}

/** The today-króna shortfall for the most recent salary event, or null. */
export function monthlyGap(events: SalaryEvent[], cpi: CpiData): Gap | null {
  if (events.length === 0) return null;
  const latest = [...events].sort((a, b) => compareMonths(a.month, b.month)).at(-1)!;
  const gap = requiredToday(latest.amount, latest.month, cpi) - latest.amount;
  if (gap <= 0) return null;
  return { gap, current: latest.amount, month: latest.month };
}

/** Structured values for each lens, in display order. */
export function computeLenses(gap: Gap, cpi: CpiData, anchors: Anchors): LensValue[] {
  const a = anchors.anchors;
  const ref = anchors.referenceMonth;
  return [
    {
      key: "raise",
      basis: "exact",
      raisePct: gap.gap / gap.current,
      extraDays: gap.gap / (gap.current / WORKDAYS_PER_MONTH),
    },
    {
      key: "rent",
      basis: "approx",
      monthsOfRent: gap.gap / anchorToday(a.rent_3room_capital, ref, cpi),
    },
    {
      key: "food",
      basis: "approx",
      weeksOfFood: gap.gap / anchorToday(a.weekly_groceries_family4, ref, cpi),
    },
    {
      key: "life",
      basis: "approx",
      annualLoss: gap.gap * 12,
      trips: (gap.gap * 12) / anchorToday(a.trip_abroad_two, ref, cpi),
    },
  ];
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/lenses.test.ts`
Expected: PASS (all cases green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/lenses.ts tests/lenses.test.ts
git commit -m "feat: lens computation core with tests"
```

---

## Task 3: Formatting helper + copy strings

**Files:**
- Modify: `src/lib/format.ts`
- Test: `tests/format.test.ts` (add one case if the file exists; otherwise inline check)
- Modify: `src/copy.ts`

- [ ] **Step 1: Add `formatDecimal` to `format.ts`**

In `src/lib/format.ts`, add this exported function (place it just after `formatPercent`). It reuses the existing private `fixedComma`:

```ts
/** One-or-more decimal places with an Icelandic comma: (3.81, 1) → "3,8". */
export function formatDecimal(n: number, decimals = 1): string {
  return fixedComma(n, decimals);
}
```

- [ ] **Step 2: Verify formatting**

Run: `npx tsc --noEmit`
Expected: no errors. (`fixedComma` is already defined above in the same file.)

- [ ] **Step 3: Add the `payoff` and `lenses` copy blocks**

In `src/copy.ts`, add these two blocks inside the `copy` object (e.g. directly after the `privacy` block). The lens templates take **already-formatted strings**, so `copy.ts` stays free of number logic:

```ts
  payoff: {
    // (amount) e.g. "88.000 kr." → headline
    title: (amount: string) =>
      `Verðbólgan tók ${amount} af laununum þínum á mánuði`,
    // shown when the salary kept up / is too new
    held: "Launin þín hafa haldið í við verðbólguna — eða eru of ný til að hún hafi bitið.",
    cta: "Prófa með mínum launum",
    pickLabel: "Berðu tapið saman við:",
  },

  lenses: {
    chips: {
      raise: "📈 Launahækkun",
      rent: "🏠 Leiga",
      food: "🛒 Matur",
      life: "✈️ Lífsgæði",
    },
    basisExact: "nákvæmt",
    basisApprox: "um það bil",
    // pct e.g. "12,4%", days e.g. "2,5"
    raise: (pct: string, days: string) =>
      `Þú þyrftir ${pct} launahækkun bara til að standa í stað — eða að vinna ${days} daga til viðbótar í hverjum mánuði.`,
    // pct e.g. "48%"
    rent: (pct: string) =>
      `Það er um ${pct} af mánaðarleigu á 3ja herbergja íbúð á höfuðborgarsvæðinu.`,
    // weeks e.g. "3,8"
    food: (weeks: string) =>
      `Það jafngildir um ${weeks} vikum af mat fyrir fjögurra manna fjölskyldu á mánuði.`,
    // annual e.g. "1.920.000 kr.", trips e.g. "6,4"
    life: (annual: string, trips: string) =>
      `Á ári eru þetta ${annual} — eins og ${trips} utanlandsferðir fyrir tvo (dæmi).`,
  },
```

- [ ] **Step 4: Add the inline privacy line to the `privacy` block**

In `src/copy.ts`, inside the existing `privacy` block, add one property:

```ts
    inline: "🔒 Reiknað í tækinu þínu — launin þín fara hvergi.",
```

- [ ] **Step 5: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/format.ts src/copy.ts
git commit -m "feat: formatDecimal helper and payoff/lenses copy"
```

---

## Task 4: PayoffCard component

**Files:**
- Create: `src/components/PayoffCard.tsx`

- [ ] **Step 1: Implement the component**

Create `src/components/PayoffCard.tsx`:

```tsx
import { useState } from "preact/hooks";
import { copy } from "../copy";
import type { CpiData } from "../lib/cpi";
import type { SalaryEvent } from "../lib/inflation";
import { getAnchors } from "../lib/anchors";
import {
  type LensKey,
  type LensValue,
  computeLenses,
  monthlyGap,
} from "../lib/lenses";
import { formatDecimal, formatISK, formatPercent } from "../lib/format";

interface PayoffCardProps {
  events: SalaryEvent[];
  cpi: CpiData;
  onTryOwn?: () => void;
  isExample?: boolean;
}

const ORDER: LensKey[] = ["raise", "rent", "food", "life"];

function lensText(v: LensValue): string {
  const L = copy.lenses;
  switch (v.key) {
    case "raise":
      return L.raise(formatPercent(v.raisePct), formatDecimal(v.extraDays));
    case "rent":
      return L.rent(formatPercent(v.monthsOfRent));
    case "food":
      return L.food(formatDecimal(v.weeksOfFood));
    case "life":
      return L.life(formatISK(v.annualLoss), formatDecimal(v.trips));
  }
}

export function PayoffCard({ events, cpi, onTryOwn, isExample }: PayoffCardProps) {
  const [selected, setSelected] = useState<LensKey>("raise");
  const gap = monthlyGap(events, cpi);

  if (!gap) {
    if (events.length === 0) return null;
    return (
      <section class="payoff card rise rise-2">
        <p class="payoff-held">{copy.payoff.held}</p>
      </section>
    );
  }

  const lenses = computeLenses(gap, cpi, getAnchors());
  const active = lenses.find((l) => l.key === selected) ?? lenses[0];
  const basisLabel =
    active.basis === "exact" ? copy.lenses.basisExact : copy.lenses.basisApprox;

  return (
    <section class="payoff card rise rise-2" aria-labelledby="payoff-title">
      <h2 id="payoff-title" class="payoff-title">
        {copy.payoff.title(formatISK(gap.gap))}
      </h2>

      <p class="payoff-pick">{copy.payoff.pickLabel}</p>
      <div class="lens-chips" role="tablist" aria-label={copy.payoff.pickLabel}>
        {ORDER.map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={key === selected}
            class={`lens-chip${key === selected ? " is-on" : ""}`}
            onClick={() => setSelected(key)}
          >
            {copy.lenses.chips[key]}
          </button>
        ))}
      </div>

      <div class="lens-result" role="tabpanel">
        <p class="lens-text">{lensText(active)}</p>
        <span class={`lens-basis is-${active.basis}`}>{basisLabel}</span>
      </div>

      {isExample && onTryOwn && (
        <button type="button" class="payoff-cta" onClick={onTryOwn}>
          {copy.payoff.cta}
        </button>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (The `switch` over `v.key` is exhaustive, so `lensText` always returns a string.)

- [ ] **Step 3: Commit**

```bash
git add src/components/PayoffCard.tsx
git commit -m "feat: PayoffCard component with lens chooser"
```

---

## Task 5: Payoff card styles

**Files:**
- Modify: `src/styles.css`

- [ ] **Step 1: Append the styles**

Add to the end of `src/styles.css` (the project uses the amber `#b4541e`-family accent and cream surfaces; match the existing `--`/class conventions already in the file):

```css
/* ---------- Payoff card + lens chooser ---------- */
.payoff { display: flex; flex-direction: column; gap: 0.9rem; }
.payoff-title { font-size: clamp(1.3rem, 5vw, 1.9rem); line-height: 1.15; margin: 0; }
.payoff-held { font-size: 1.05rem; margin: 0; }
.payoff-pick { font-size: 0.85rem; opacity: 0.7; margin: 0; }

.lens-chips { display: flex; flex-wrap: wrap; gap: 0.5rem; }
.lens-chip {
  border: 1px solid rgba(0, 0, 0, 0.22);
  background: #fff;
  border-radius: 999px;
  padding: 0.5rem 0.85rem;
  font: inherit;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.12s, color 0.12s, border-color 0.12s;
}
.lens-chip:hover { border-color: var(--accent, #b4541e); }
.lens-chip.is-on {
  background: #1c1a17;
  color: #fff;
  border-color: #1c1a17;
}

.lens-result {
  background: #fff3e8;
  border: 1px solid #f0c9a6;
  border-radius: 14px;
  padding: 0.9rem 1rem;
  min-height: 4.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}
.lens-text { margin: 0; font-size: 1.05rem; line-height: 1.4; }
.lens-basis {
  align-self: flex-start;
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
}
.lens-basis.is-exact { background: #dcefdf; color: #155033; border: 1px solid #9cc7a6; }
.lens-basis.is-approx { background: #fbe9cf; color: #8a4710; border: 1px solid #e3bd86; }

.payoff-cta {
  align-self: flex-start;
  background: var(--accent, #b4541e);
  color: #fff;
  border: none;
  border-radius: 10px;
  padding: 0.7rem 1.1rem;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}
.form-privacy { font-size: 0.85rem; opacity: 0.72; margin: 0 0 0.6rem; }
```

- [ ] **Step 2: Verify the build compiles the CSS**

Run: `npm run build`
Expected: build succeeds; `dist/assets/*.css` emitted.

- [ ] **Step 3: Commit**

```bash
git add src/styles.css
git commit -m "style: payoff card and lens chip styles"
```

---

## Task 6: Wire payoff-first layout + demote privacy badge

**Files:**
- Modify: `src/app.tsx`
- Modify: `src/components/SalaryForm.tsx`
- Modify: `src/components/Methodology.tsx`
- Delete: `src/components/PrivacyBadge.tsx`

- [ ] **Step 1: Add the inline privacy line to the form**

In `src/components/SalaryForm.tsx`, replace the intro paragraph line:

```tsx
      <p class="section-intro">{f.intro}</p>
```

with:

```tsx
      <p class="section-intro">{f.intro}</p>
      <p class="form-privacy">{copy.privacy.inline}</p>
```

- [ ] **Step 2: Move the "how to verify" expander into Methodology**

In `src/components/Methodology.tsx`, replace the `<section class="method">` opening and its first heading so the verify expander sits at the end of the methodology section. Change:

```tsx
        <span class="formula">{m.formula}</span>
        <div class="source">
```

to:

```tsx
        <span class="formula">{m.formula}</span>
        <details class="verify">
          <summary>{copy.privacy.howTitle}</summary>
          <p>{copy.privacy.howBody}</p>
        </details>
        <div class="source">
```

- [ ] **Step 3: Reorder `app.tsx` to payoff-first and drop PrivacyBadge**

In `src/app.tsx`:

(a) Replace the import line:

```tsx
import { PrivacyBadge } from "./components/PrivacyBadge";
```

with:

```tsx
import { PayoffCard } from "./components/PayoffCard";
```

(b) Replace the `<main>` body:

```tsx
        <Hero />
        <PrivacyBadge />
        <SalaryForm
          rows={state.rows}
          errors={errors}
          cpi={cpi}
          isExample={state.isExample}
          onChangeRow={changeRow}
          onAddRow={addRow}
          onRemoveRow={removeRow}
          onClearExample={clearExample}
        />
        <Chart series={series} />
        <SummaryCards events={events} cpi={cpi} />
        <Methodology />
```

with (PayoffCard leads, right after the hero; the form's "make it yours" CTA reuses `clearExample`):

```tsx
        <Hero />
        <PayoffCard
          events={events}
          cpi={cpi}
          isExample={state.isExample}
          onTryOwn={clearExample}
        />
        <SalaryForm
          rows={state.rows}
          errors={errors}
          cpi={cpi}
          isExample={state.isExample}
          onChangeRow={changeRow}
          onAddRow={addRow}
          onRemoveRow={removeRow}
          onClearExample={clearExample}
        />
        <Chart series={series} />
        <SummaryCards events={events} cpi={cpi} />
        <Methodology />
```

- [ ] **Step 4: Delete the superseded component**

```bash
git rm src/components/PrivacyBadge.tsx
```

- [ ] **Step 5: Verify typecheck, tests, and build**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: no type errors; all tests pass; build succeeds. (If `tsc` flags the now-unused `privacy.badge`/`privacy.detail` strings — it won't, they're object properties — leave them; they're harmless.)

- [ ] **Step 6: Manual check in the browser**

Run: `npm run dev` and open the printed URL at a 390px-wide viewport.
Expected: above the fold shows the hero + payoff headline + lens chips; tapping each chip (📈/🏠/🛒/✈️) swaps the result text and the exact/"um það bil" badge; "Prófa með mínum launum" clears the example.

- [ ] **Step 7: Commit**

```bash
git add src/app.tsx src/components/SalaryForm.tsx src/components/Methodology.tsx
git commit -m "feat: payoff-first layout; demote privacy badge to inline + methodology"
```

---

## Task 7: Document anchor provenance

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add an anchors note to the README**

In `README.md`, directly after the "Privacy, architecturally guaranteed" section, add:

```markdown
## Tangible comparisons (price anchors)

The payoff card can express the monthly purchasing-power loss as rent, food, or
a yearly lifestyle figure. These use a small bundled basket, `src/data/anchors.json`:
national-average reference prices at a reference month, **inflated to the latest
CPI month at render time** so they never go stale. They are approximate by
nature and always carry an "um það bil" badge in the UI. The "raise needed to
stand still" lens is exact — it comes straight from the CPI. Update the anchor
prices by editing `anchors.json` (and bump `referenceMonth` to match).
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: document price-anchor provenance and accuracy"
```

---

## Self-review notes (already reconciled)

- **Spec coverage:** payoff-first reorder (Task 6), four lenses + default raise (Tasks 2/4), exact-vs-approx badges (Tasks 2/4/5), `anchors.json` inflated to today via overall CPI (Tasks 1/2), honesty copy + README (Tasks 3/7), edge case `gap ≤ 0` hides chooser (Task 2 `monthlyGap` returns null; Task 4 renders `payoff.held`). Out-of-scope items (Eldsneyti, sub-indices, category chart, onboarding) are not tasked — intended.
- **Type consistency:** `LensValue` discriminated union, `Gap`, `monthlyGap`/`computeLenses` signatures, and `anchorToday` are used identically in Tasks 2 and 4. Copy templates consume only pre-formatted strings (`formatPercent`, `formatDecimal`, `formatISK`).
- **No placeholders:** every code step shows complete code; commands have expected output.
```
