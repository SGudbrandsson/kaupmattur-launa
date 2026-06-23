# Decline-from-peak reframe — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-base the chart and payoff card on **decline from peak** (peak = global argmax of real purchasing power over *all* months, handling deflation), with a three-frame chart toggle, sign-aware/peak-led copy, and unified lens math.

**Architecture:** A new pure `analyzePurchasingPower` in `inflation.ts` is the single source of truth; `buildSeries` gains a `frame` param (and renames `real`→`comparison`); `lenses.ts` adapts to the peak gap; `Chart` owns the frame toggle and y-scales from both series; `PayoffCard` becomes peak-led and sign-aware. Pure logic is TDD'd; components are typecheck/build/Playwright-verified.

**Tech Stack:** Vite, Preact (TSX), TypeScript, Vitest. No new dependencies.

Spec: `docs/superpowers/specs/2026-06-23-decline-from-peak-reframe-design.md` (revised after Codex adversarial review).

**Plan-level simplification (called out per the review):** the spec's filled, sign-split band for the `keepPace`/`today` frames is **deferred**. v1 draws lines (+ peak marker + a "today" reference line) and a **sign-aware readout** instead of bicolor filled bands that would need exact crossing-splits. The `origin` frame keeps its existing single coral erosion band (always one sign). This preserves "show where it bit" via the lines/readout while avoiding the crossing-split risk Codex flagged.

---

## File structure
- **Modify** `src/lib/inflation.ts` — add `ChartFrame`, `PurchasingPower`, `analyzePurchasingPower`; `buildSeries(frame)` + `real`→`comparison`.
- **Modify** `tests/inflation.test.ts` — rename `.real`→`.comparison`; add analyze + per-frame tests.
- **Modify** `src/lib/lenses.ts` — `monthlyGap`→`peakGap` (peak-based), `Gap.month`→`Gap.referenceMonth`.
- **Modify** `tests/lenses.test.ts` — adapt to `peakGap` + `referenceMonth`.
- **Modify** `src/copy.ts` — chart frame labels + peak-led payoff copy.
- **Modify** `src/components/PayoffCard.tsx` — peak-led, sign-aware, positive state.
- **Modify** `src/components/Chart.tsx` — frame toggle, both-series y-scale, per-frame visuals, peak marker, sign-aware readout; prop `series`→`events`+`cpi`.
- **Modify** `src/app.tsx` — pass `events`+`cpi` to `<Chart>`.
- **Modify** `src/styles.css` — frame chips, peak marker, muted line, today reference line.
- **Modify** `README.md` — note the frames + decline-from-peak.

---

## Task 1: `analyzePurchasingPower` (pure core, TDD)

**Files:** Modify `src/lib/inflation.ts`; Modify `tests/inflation.test.ts`.

- [ ] **Step 1: Write the failing tests** — append to `tests/inflation.test.ts` (it already defines `synthetic` with CPI 100/110/125/160/200 for 2025-01..05, and imports from `../src/lib/inflation`):

```ts
import { analyzePurchasingPower } from "../src/lib/inflation";

describe("analyzePurchasingPower", () => {
  it("returns null with no events", () => {
    expect(analyzePurchasingPower([], synthetic)).toBeNull();
  });

  it("finds the peak, loss, and percentages (rising salary outrun by inflation)", () => {
    // 1000 @2025-01 then 2000 @2025-04. requiredToday over months:
    // 2025-01:2000, 04:2500 (peak), 05:2000(now).
    const pp = analyzePurchasingPower(
      [
        { month: "2025-01", amount: 1000 },
        { month: "2025-04", amount: 2000 },
      ],
      synthetic,
    )!;
    expect(pp.peakMonth).toBe("2025-04");
    expect(pp.peakValueToday).toBeCloseTo(2500, 6);
    expect(pp.nowValue).toBe(2000);
    expect(pp.monthlyLoss).toBeCloseTo(500, 6);
    expect(pp.declinePct).toBeCloseTo(0.2, 6);
    expect(pp.raiseToReturn).toBeCloseTo(0.25, 6);
    expect(pp.atPeak).toBe(false);
    expect(pp.firstMonth).toBe("2025-01");
  });

  it("peaks at a NON-event month under deflation", () => {
    const deflation: CpiData = {
      source: "t", fetchedAt: "x", firstMonth: "2025-01", lastMonth: "2025-03",
      values: { "2025-01": 100, "2025-02": 90, "2025-03": 95 },
    };
    // salary 1000 set 2025-01: requiredToday = 1000*95/CPI(m):
    // 2025-01:950, 2025-02:1055.6 (peak), 2025-03:1000(now)
    const pp = analyzePurchasingPower([{ month: "2025-01", amount: 1000 }], deflation)!;
    expect(pp.peakMonth).toBe("2025-02");
    expect(pp.peakValueToday).toBeCloseTo((1000 * 95) / 90, 6);
    expect(pp.atPeak).toBe(false);
  });

  it("rising nominal does NOT imply at-peak", () => {
    const pp = analyzePurchasingPower(
      [{ month: "2025-01", amount: 1000 }, { month: "2025-04", amount: 2000 }],
      synthetic,
    )!;
    expect(pp.atPeak).toBe(false);
    expect(pp.monthlyLoss).toBeGreaterThan(0);
  });

  it("reports at-peak when the salary was set in the last month", () => {
    const pp = analyzePurchasingPower([{ month: "2025-05", amount: 900 }], synthetic)!;
    expect(pp.peakMonth).toBe("2025-05");
    expect(pp.monthlyLoss).toBe(0);
    expect(pp.atPeak).toBe(true);
    expect(pp.declinePct).toBe(0);
    expect(pp.raiseToReturn).toBe(0);
  });

  it("a salary cut after the peak does not move the peak", () => {
    const pp = analyzePurchasingPower(
      [{ month: "2025-01", amount: 2000 }, { month: "2025-04", amount: 1500 }],
      synthetic,
    )!;
    expect(pp.peakMonth).toBe("2025-01"); // 2000*200/100 = 4000 is the max
    expect(pp.peakValueToday).toBeCloseTo(4000, 6);
    expect(pp.nowValue).toBe(1500);
    expect(pp.monthlyLoss).toBeCloseTo(2500, 6);
  });

  it("lifetimePct is negative when real value fell since the first salary", () => {
    const pp = analyzePurchasingPower(
      [{ month: "2025-01", amount: 2000 }, { month: "2025-04", amount: 1500 }],
      synthetic,
    )!;
    // firstValueToday = 2000*200/100 = 4000; now 1500 -> -0.625
    expect(pp.lifetimePct).toBeCloseTo(-0.625, 6);
  });

  it("clamps sub-króna residuals to at-peak", () => {
    const flat: CpiData = {
      source: "t", fetchedAt: "x", firstMonth: "2025-01", lastMonth: "2025-02",
      values: { "2025-01": 100, "2025-02": 100 },
    };
    // peak 1000 @2025-01, now 999.5 -> loss 0.5 < 1 -> clamped
    const pp = analyzePurchasingPower(
      [{ month: "2025-01", amount: 1000 }, { month: "2025-02", amount: 999.5 }],
      flat,
    )!;
    expect(pp.monthlyLoss).toBe(0);
    expect(pp.atPeak).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run tests/inflation.test.ts` → FAIL (`analyzePurchasingPower` not exported).

- [ ] **Step 3: Implement** — in `src/lib/inflation.ts`, add (after the existing exports; it already imports `compareMonths, monthRange` from `./cpi` and exports `requiredToday`):

```ts
export type ChartFrame = "today" | "origin" | "keepPace";

export interface PurchasingPower {
  /** Month of maximum real purchasing power (global argmax over all months). */
  peakMonth: MonthKey;
  /** That peak expressed in today's krónur. */
  peakValueToday: number;
  /** Current salary (already in today's krónur). */
  nowValue: number;
  /** peakValueToday − nowValue, clamped to 0 within an epsilon. */
  monthlyLoss: number;
  declinePct: number;
  raiseToReturn: number;
  /** Real change since the first salary (may be negative). */
  lifetimePct: number;
  firstMonth: MonthKey;
  atPeak: boolean;
}

/** Sub-króna residuals from CPI ratios shouldn't flip the at-peak state. */
const PEAK_EPSILON = 1;

/**
 * The peak real purchasing power and the decline from it. The peak is the
 * global argmax of salary(t)/CPI(t) over EVERY month (not just event months) —
 * the Icelandic CPI has deflationary dips, so a plateau's peak can be a
 * non-event month. Ties resolve to the most recent month.
 */
export function analyzePurchasingPower(
  events: SalaryEvent[],
  cpi: CpiData,
): PurchasingPower | null {
  if (events.length === 0) return null;
  const sorted = [...events].sort((a, b) => compareMonths(a.month, b.month));
  const firstMonth = sorted[0].month;

  let active = 0;
  let peakMonth = firstMonth;
  let peakValueToday = 0;
  for (const month of monthRange(firstMonth, cpi.lastMonth)) {
    while (
      active + 1 < sorted.length &&
      compareMonths(sorted[active + 1].month, month) <= 0
    ) {
      active++;
    }
    const valueToday = requiredToday(sorted[active].amount, month, cpi);
    if (valueToday >= peakValueToday) {
      peakValueToday = valueToday; // >= → ties resolve to the most recent month
      peakMonth = month;
    }
  }

  const nowValue = sorted[sorted.length - 1].amount;
  let monthlyLoss = peakValueToday - nowValue;
  if (monthlyLoss < PEAK_EPSILON) monthlyLoss = 0;
  const atPeak = monthlyLoss === 0;
  const declinePct = atPeak ? 0 : monthlyLoss / peakValueToday;
  const raiseToReturn = atPeak ? 0 : monthlyLoss / nowValue;
  const firstValueToday = requiredToday(sorted[0].amount, firstMonth, cpi);
  const lifetimePct = nowValue / firstValueToday - 1;

  return {
    peakMonth, peakValueToday, nowValue, monthlyLoss,
    declinePct, raiseToReturn, lifetimePct, firstMonth, atPeak,
  };
}
```

- [ ] **Step 4: Run to verify pass** — `npx vitest run tests/inflation.test.ts` → PASS.

- [ ] **Step 5: Commit**
```bash
git add src/lib/inflation.ts tests/inflation.test.ts
git commit -m "feat: analyzePurchasingPower (peak over all months, deflation-safe)"
```

---

## Task 2: `buildSeries` frames + `real`→`comparison` rename

**Files:** Modify `src/lib/inflation.ts`; Modify `tests/inflation.test.ts`.

- [ ] **Step 1: Update existing tests for the rename + add per-frame tests** — in `tests/inflation.test.ts`, replace every `.real` on a series point with `.comparison` (lines that read `series[0].real`, `series.at(-1)!.real`, `byMonth["..."].real`, `atRaise.real`), and update the lastMonth-event object assertion. Concretely:
  - `expect(series[0].real)` → `expect(series[0].comparison)`
  - `expect(series.at(-1)!.real)` → `expect(series.at(-1)!.comparison)`
  - the three `byMonth["2025-0X"].real` → `.comparison`
  - `expect(atRaise.real)` → `expect(atRaise.comparison)`
  - the object literal `{ month: "2025-05", nominal: 900, real: 900, eventMonth: "2025-05" }` → `{ month: "2025-05", nominal: 900, comparison: 900, eventMonth: "2025-05" }`

  Then add per-frame tests:

```ts
import type { ChartFrame } from "../src/lib/inflation";

describe("buildSeries frames", () => {
  const events = [{ month: "2025-01", amount: 1000 }];

  it("origin (default) expresses comparison in first-month krónur", () => {
    const s = buildSeries(events, synthetic, "origin");
    // 2025-05: 1000 * CPI(2025-01)/CPI(2025-05) = 1000*100/200 = 500
    expect(s.at(-1)!.comparison).toBeCloseTo(500, 9);
    // default arg matches "origin"
    expect(buildSeries(events, synthetic).at(-1)!.comparison).toBeCloseTo(500, 9);
  });

  it("today expresses comparison in today's krónur", () => {
    const s = buildSeries(events, synthetic, "today");
    // 2025-01: 1000 * CPI(2025-05)/CPI(2025-01) = 1000*200/100 = 2000
    expect(s[0].comparison).toBeCloseTo(2000, 9);
    // lastMonth: comparison == nominal
    expect(s.at(-1)!.comparison).toBeCloseTo(1000, 9);
  });

  it("keepPace draws the baseline needed to hold the first salary's power", () => {
    const s = buildSeries(events, synthetic, "keepPace");
    // 2025-05: 1000 * CPI(2025-05)/CPI(2025-01) = 1000*200/100 = 2000
    expect(s.at(-1)!.comparison).toBeCloseTo(2000, 9);
    expect(s[0].comparison).toBeCloseTo(1000, 9); // at the anchor: == first salary
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run tests/inflation.test.ts` → FAIL (the `frame` param / `comparison` field don't exist yet).

- [ ] **Step 3: Implement** — in `src/lib/inflation.ts`: change `SeriesPoint` and `buildSeries`:

```ts
export interface SeriesPoint {
  month: MonthKey;
  /** The salary as paid (step function of the events). */
  nominal: number;
  /** The comparison line; its meaning depends on the chart frame. */
  comparison: number;
  /** The month of the most recent salary event on or before this point. */
  eventMonth: MonthKey;
}
```

and replace `buildSeries` with:

```ts
export function buildSeries(
  events: SalaryEvent[],
  cpi: CpiData,
  frame: ChartFrame = "origin",
): SeriesPoint[] {
  if (events.length === 0) return [];
  const sorted = [...events].sort((a, b) => compareMonths(a.month, b.month));
  const anchor = sorted[0].month;
  const firstAmount = sorted[0].amount;
  const points: SeriesPoint[] = [];
  let active = 0;
  for (const month of monthRange(anchor, cpi.lastMonth)) {
    while (
      active + 1 < sorted.length &&
      compareMonths(sorted[active + 1].month, month) <= 0
    ) {
      active++;
    }
    const { month: eventMonth, amount } = sorted[active];
    let comparison: number;
    if (frame === "today") {
      comparison = requiredToday(amount, month, cpi);
    } else if (frame === "keepPace") {
      comparison = firstAmount * (1 + cumulativeInflation(anchor, month, cpi));
    } else {
      comparison = realValue(amount, anchor, month, cpi);
    }
    points.push({ month, nominal: amount, comparison, eventMonth });
  }
  return points;
}
```

(`cumulativeInflation` and `realValue` are already defined above in the file.)

- [ ] **Step 4: Run to verify pass** — `npx vitest run tests/inflation.test.ts` → PASS. Then `npx tsc --noEmit` will now FAIL in `Chart.tsx` (still uses `.real`) — that's expected; Chart is rewritten in Task 6. Do NOT fix Chart here.

- [ ] **Step 5: Commit**
```bash
git add src/lib/inflation.ts tests/inflation.test.ts
git commit -m "feat: buildSeries frames (today/origin/keepPace); real->comparison"
```

---

## Task 3: `lenses.ts` — peak-based gap

**Files:** Modify `src/lib/lenses.ts`; Modify `tests/lenses.test.ts`.

- [ ] **Step 1: Update tests** — replace the `monthlyGap` block in `tests/lenses.test.ts`. Change the import `import { monthlyGap, computeLenses } from "../src/lib/lenses";` → `import { peakGap, computeLenses } from "../src/lib/lenses";`, and replace the `describe("monthlyGap", ...)` block plus the `gap` used by the `computeLenses` describe with:

```ts
describe("peakGap", () => {
  it("returns null with no events", () => {
    expect(peakGap([], cpi)).toBeNull();
  });

  it("is the today-króna loss from the peak, keyed to the peak month", () => {
    const g = peakGap(
      [
        { month: "2023-01", amount: 800000 },
        { month: "2025-01", amount: 820000 }, // a raise that lags inflation
      ],
      cpi,
    );
    expect(g).not.toBeNull();
    expect(g!.current).toBe(820000);
    expect(g!.gap).toBeGreaterThan(0);
    expect(typeof g!.referenceMonth).toBe("string");
  });

  it("returns null when the latest salary is the all-time real peak", () => {
    // set in the last CPI month -> at peak -> no loss
    expect(peakGap([{ month: cpi.lastMonth, amount: 800000 }], cpi)).toBeNull();
  });
});
```

For the `computeLenses` describe block, change the fixture line `const gap = monthlyGap([...], cpi)!;` to build a `Gap` directly so the lens math stays hand-checkable:

```ts
  const gap = { gap: 160000, current: 800000, referenceMonth: "2023-01" };
  const lenses = computeLenses(gap, cpi, anchors);
```

(The existing per-lens assertions in that block — raise/rent/food/life — stay unchanged; they already use `gap.gap`/`gap.current` values of 160000/800000.)

- [ ] **Step 2: Run to verify failure** — `npx vitest run tests/lenses.test.ts` → FAIL (`peakGap` not exported; `referenceMonth` missing).

- [ ] **Step 3: Implement** — in `src/lib/lenses.ts`: change the `Gap` interface and replace `monthlyGap` (keep `computeLenses` exactly as-is). Update imports: replace `import { requiredToday } from "./inflation";` with `import { analyzePurchasingPower } from "./inflation";` (note: `compareMonths`, `MonthKey`, `SalaryEvent`, `CpiData` imports stay; `requiredToday` is no longer used here):

```ts
export interface Gap {
  /** Monthly purchasing-power shortfall from the peak, in today's króna (> 0). */
  gap: number;
  /** The current (most recent) salary. */
  current: number;
  /** The month of peak real purchasing power. */
  referenceMonth: MonthKey;
}

/** The today-króna loss from peak real purchasing power, or null at the peak. */
export function peakGap(events: SalaryEvent[], cpi: CpiData): Gap | null {
  const pp = analyzePurchasingPower(events, cpi);
  if (!pp || pp.atPeak || pp.monthlyLoss <= 0) return null;
  return { gap: pp.monthlyLoss, current: pp.nowValue, referenceMonth: pp.peakMonth };
}
```

Leave `computeLenses` untouched (it reads `gap.gap`/`gap.current` only). If `compareMonths` is now unused after removing `monthlyGap`, drop it from the import to keep `tsc` clean.

- [ ] **Step 4: Run to verify pass** — `npx vitest run tests/lenses.test.ts && npx tsc --noEmit 2>&1 | grep -v Chart.tsx || true`. Expected: lens tests PASS. (`tsc` still fails only in `Chart.tsx` and `PayoffCard.tsx` until Tasks 5–6 — ignore those.)

- [ ] **Step 5: Commit**
```bash
git add src/lib/lenses.ts tests/lenses.test.ts
git commit -m "feat: peakGap (lens gap from peak); Gap.month->referenceMonth"
```

---

## Task 4: Copy strings

**Files:** Modify `src/copy.ts`.

- [ ] **Step 1: Edit the `payoff` and `lenses.raise` and add `chart` frame copy** (use byte-safe editing if smart quotes recur). In the `payoff` block, replace `held`/`title` and add peak copy so the block reads:

```ts
  payoff: {
    // (declinePct, monthlyLoss, peakMonth)
    peakTitle: (declinePct: string, loss: string, peakMonth: string) =>
      `Kaupmáttur þinn náði hámarki í ${peakMonth}. Síðan hefur hann rýrnað um ${declinePct} — eða ${loss} á mánuði.`,
    // (verb, pct, firstMonth)
    lifetime: (verb: string, pct: string, firstMonth: string) =>
      `Frá ${firstMonth} hefur kaupmátturinn samt ${verb} um ${pct}.`,
    verbUp: "aukist",
    verbDown: "rýrnað",
    atPeak: "Kaupmáttur þinn hefur aldrei verið hærri.",
    cta: "Prófa með mínum launum",
    pickLabel: "Berðu tapið saman við:",
  },
```

In the `lenses` block, change the `raise` template wording:

```ts
    raise: (pct: string, days: string) =>
      `Þú þyrftir ${pct} launahækkun til að ná fyrri kaupmætti — eða að vinna ${days} daga til viðbótar í hverjum mánuði.`,
```

In the `chart` block, add frame labels, a peak label, a today-reference label, and a per-frame delta label:

```ts
    frameToday: "Á verðlagi í dag",
    frameOrigin: "Á verðlagi þá",
    frameKeepPace: "Hélt í við verðbólgu?",
    peakLabel: (month: string) => `hámark · ${month}`,
    framePickLabel: "Sýn:",
    belowPeak: "undir hámarki",
```

- [ ] **Step 2: Verify typecheck** — `npx tsc --noEmit 2>&1 | grep -vE "Chart.tsx|PayoffCard.tsx" || true` (only Chart/PayoffCard should still error). Confirm no NEW errors in `copy.ts`.

- [ ] **Step 3: Commit**
```bash
git add src/copy.ts
git commit -m "feat: peak-led payoff + chart frame copy"
```

---

## Task 5: PayoffCard — peak-led, sign-aware

**Files:** Modify `src/components/PayoffCard.tsx`.

- [ ] **Step 1: Rewrite the data/headers section** — replace the imports and the `PayoffCard` function body down through the `gap`/`title` computation. Change the lens/inflation imports at the top:

```tsx
import { getAnchors } from "../lib/anchors";
import { type LensKey, type LensValue, computeLenses } from "../lib/lenses";
import { peakGap } from "../lib/lenses";
import { analyzePurchasingPower } from "../lib/inflation";
import { formatDecimal, formatISK, formatPercent, formatMonth } from "../lib/format";
```

Replace the body from `const [selected, setSelected] = useState<LensKey>("raise");` through the end of the `const [before, after] = ...` line with:

```tsx
  const [selected, setSelected] = useState<LensKey>("raise");
  const pp = analyzePurchasingPower(events, cpi);
  if (!pp) return null;

  const lifetimeLine = copy.payoff.lifetime(
    pp.lifetimePct >= 0 ? copy.payoff.verbUp : copy.payoff.verbDown,
    formatPercent(Math.abs(pp.lifetimePct)),
    formatMonth(pp.firstMonth),
  );

  if (pp.atPeak) {
    return (
      <section class="payoff card rise rise-2">
        <p class="payoff-held">{copy.payoff.atPeak}</p>
        <p class="payoff-secondary">{lifetimeLine}</p>
      </section>
    );
  }

  const gap = peakGap(events, cpi);
  const lenses = gap ? computeLenses(gap, cpi, getAnchors()) : [];
  const active = lenses.find((l) => l.key === selected) ?? lenses[0];
  const basisLabel =
    active.basis === "exact" ? copy.lenses.basisExact : copy.lenses.basisApprox;

  const lossStr = formatISK(pp.monthlyLoss);
  const title = copy.payoff.peakTitle(
    formatPercent(pp.declinePct),
    lossStr,
    formatMonth(pp.peakMonth),
  );
  const [before, after] = title.split(lossStr);
```

- [ ] **Step 2: Update the returned JSX header** — replace the `<h2 ...>` title block and add the secondary line. Replace:

```tsx
      <h2 id="payoff-title" class="payoff-title">
        {before}
        <span class="payoff-amount numeric">{amount}</span>
        {after}
      </h2>
```

with:

```tsx
      <h2 id="payoff-title" class="payoff-title">
        {before}
        <span class="payoff-amount numeric">{lossStr}</span>
        {after}
      </h2>
      <p class="payoff-secondary">{lifetimeLine}</p>
```

(The rest of the component — `payoff-pick`, the lens chips, `lens-result`, the CTA — is unchanged. The old `amount`/`copy.payoff.title` references are fully removed by the Step 1 replacement.)

- [ ] **Step 3: Verify typecheck** — `npx tsc --noEmit 2>&1 | grep -vE "Chart.tsx" || true`. Expected: no `PayoffCard.tsx` errors (only `Chart.tsx` until Task 6).

- [ ] **Step 4: Commit**
```bash
git add src/components/PayoffCard.tsx
git commit -m "feat: peak-led, sign-aware PayoffCard + lifetime context"
```

---

## Task 6: Chart — frames, both-series scale, peak marker, sign-aware readout

**Files:** Modify `src/components/Chart.tsx` (full rewrite).

- [ ] **Step 1: Replace the entire file** with:

```tsx
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { copy } from "../copy";
import type { CpiData } from "../lib/cpi";
import type { ChartFrame, SalaryEvent } from "../lib/inflation";
import { analyzePurchasingPower, buildSeries } from "../lib/inflation";
import {
  formatCompactISK,
  formatISK,
  formatISKDelta,
  formatMonth,
  formatMonthShort,
  formatPercent,
} from "../lib/format";

interface ChartProps {
  events: SalaryEvent[];
  cpi: CpiData;
}

const MARGIN = { top: 18, right: 16, bottom: 30 };
const LABEL_CHAR_W = 6.8;
const FRAMES: ChartFrame[] = ["today", "origin", "keepPace"];

function frameLabel(frame: ChartFrame): string {
  return frame === "today"
    ? copy.chart.frameToday
    : frame === "origin"
      ? copy.chart.frameOrigin
      : copy.chart.frameKeepPace;
}

function niceTicks(min: number, max: number, count: number): number[] {
  const span = max - min;
  if (span <= 0) return [min];
  const rawStep = span / count;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;
  const step =
    (normalized < 1.5 ? 1 : normalized < 3 ? 2 : normalized < 7 ? 5 : 10) *
    magnitude;
  const ticks: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max; v += step) {
    ticks.push(v);
  }
  return ticks;
}

function xTickIndices(
  series: { month: string }[],
  innerW: number,
): { indices: number[]; step: number } {
  const n = series.length;
  const pick = (step: number) =>
    series
      .map((p, i) => ({
        i,
        m: Number(p.month.split("-")[1]),
        y: Number(p.month.split("-")[0]),
      }))
      .filter(({ m, y }) =>
        step < 12 ? (m - 1) % step === 0 : m === 1 && y % (step / 12) === 0,
      )
      .map(({ i }) => i);
  for (const step of [3, 6, 12, 24, 48]) {
    if (step < 3 * Math.ceil(n / 40)) continue;
    const indices = pick(step);
    const labelW = step >= 12 ? 42 : 64;
    if (indices.length * labelW <= innerW || step === 48) {
      return { indices, step };
    }
  }
  return { indices: pick(48), step: 48 };
}

export function Chart({ events, cpi }: ChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState<number | null>(null);
  const [frame, setFrame] = useState<ChartFrame>("today");

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w) setWidth(w);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const series = useMemo(
    () => buildSeries(events, cpi, frame),
    [events, cpi, frame],
  );
  const pp = useMemo(() => analyzePurchasingPower(events, cpi), [events, cpi]);

  if (series.length < 2) return null;

  const c = copy.chart;
  const height = width < 480 ? 280 : 360;
  const innerH = height - MARGIN.top - MARGIN.bottom;

  const comparisons = series.map((p) => p.comparison);
  const nominals = series.map((p) => p.nominal);
  // Scale from BOTH series so the comparison line never clips.
  const yMin = Math.min(Math.min(...comparisons), Math.min(...nominals)) * 0.95;
  const yMax = Math.max(Math.max(...comparisons), Math.max(...nominals)) * 1.03;

  const yTicks = niceTicks(yMin, yMax, 4);
  const yStep = yTicks.length > 1 ? yTicks[1] - yTicks[0] : undefined;
  const yLabel = (v: number) => formatCompactISK(v, yStep);

  const maxLabelChars = Math.max(...yTicks.map((v) => yLabel(v).length));
  const marginLeft = Math.max(44, Math.round(14 + maxLabelChars * LABEL_CHAR_W));
  const innerW = width - marginLeft - MARGIN.right;

  const x = (i: number) => marginLeft + (i / (series.length - 1)) * innerW;
  const y = (v: number) =>
    MARGIN.top + innerH - ((v - yMin) / (yMax - yMin)) * innerH;

  let stepPath = `M ${x(0)} ${y(series[0].nominal)}`;
  for (let i = 1; i < series.length; i++) {
    stepPath += ` H ${x(i)}`;
    if (series[i].nominal !== series[i - 1].nominal) {
      stepPath += ` V ${y(series[i].nominal)}`;
    }
  }

  const comparePath = series
    .map((p, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(p.comparison)}`)
    .join(" ");

  // Erosion band: only in the origin frame, where comparison <= nominal always.
  let bandPath = "";
  if (frame === "origin") {
    bandPath = comparePath;
    for (let i = series.length - 1; i >= 0; i--) {
      bandPath += ` L ${x(i)} ${y(series[i].nominal)}`;
      if (i > 0 && series[i].nominal !== series[i - 1].nominal) {
        bandPath += ` L ${x(i)} ${y(series[i - 1].nominal)}`;
      }
    }
    bandPath += " Z";
  }

  const { indices: xIndices, step: xStep } = xTickIndices(series, innerW);

  const raiseIndices = series
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => p.month === p.eventMonth)
    .map(({ i }) => i);

  const last = series.length - 1;
  const peakIndex =
    pp && frame !== "keepPace"
      ? series.findIndex((p) => p.month === pp.peakMonth)
      : -1;

  const seriesKey = `${frame}|${series[0].month}|${last}|${raiseIndices.join(",")}|${series[0].nominal}`;

  const indexFromEvent = (e: PointerEvent) => {
    const svg = e.currentTarget as SVGElement;
    const rect = svg.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * width;
    const frac = (px - marginLeft) / innerW;
    return Math.max(0, Math.min(last, Math.round(frac * last)));
  };

  const active = series[hover ?? last];
  // Sign-aware delta, per frame:
  // - origin: comparison − nominal (erosion, ≤ 0)
  // - today: comparison − peakValueToday (distance below the peak, ≤ 0)
  // - keepPace: nominal − comparison (gain > 0 / loss < 0 vs keep-pace baseline)
  const delta =
    frame === "origin"
      ? active.comparison - active.nominal
      : frame === "today"
        ? active.comparison - (pp?.peakValueToday ?? active.comparison)
        : active.nominal - active.comparison;
  const deltaPct =
    frame === "keepPace"
      ? active.nominal / active.comparison - 1
      : frame === "today"
        ? active.comparison / (pp?.peakValueToday ?? active.comparison) - 1
        : active.comparison / active.nominal - 1;
  const deltaClass = delta < 0 ? "readout-loss" : "readout-gain";

  return (
    <section class="chart-section" aria-labelledby="chart-title">
      <h2 id="chart-title">{c.title}</h2>

      <div class="frame-chips" role="group" aria-label={c.framePickLabel}>
        {FRAMES.map((f) => (
          <button
            key={f}
            type="button"
            aria-pressed={f === frame}
            class={`frame-chip${f === frame ? " is-on" : ""}`}
            onClick={() => setFrame(f)}
          >
            {frameLabel(f)}
          </button>
        ))}
      </div>

      <div class="chart-legend">
        <span class="legend-item">
          <span class="legend-swatch swatch-nominal" /> {c.legendNominal}
        </span>
        <span class="legend-item">
          <span class="legend-swatch swatch-real" /> {c.legendReal}
        </span>
        {frame === "origin" && (
          <span class="legend-item">
            <span class="legend-swatch swatch-loss" /> {c.legendLoss}
          </span>
        )}
      </div>

      <div class="chart-card card" ref={containerRef}>
        <div class="chart-readout numeric" aria-live="polite">
          <span class="readout-month">
            {hover === null ? c.today : formatMonth(active.month)}
          </span>
          <span class="readout-item">
            <span class="readout-label">{c.tooltipNominal}</span>
            {formatISK(active.nominal)}
          </span>
          <span class="readout-item readout-real">
            <span class="readout-label">{c.tooltipReal}</span>
            {formatISK(active.comparison)}
          </span>
          <span class={`readout-item ${deltaClass}`}>
            <span class="readout-label">{c.tooltipLoss}</span>
            {Math.abs(delta) < 1
              ? "—"
              : `${formatISKDelta(delta)} (${formatPercent(deltaPct)})`}
          </span>
        </div>

        <svg
          width="100%"
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={c.title}
          onPointerMove={(e) => setHover(indexFromEvent(e))}
          onPointerDown={(e) => setHover(indexFromEvent(e))}
          onPointerLeave={() => setHover(null)}
        >
          <defs>
            <linearGradient id="loss-band" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="var(--coral)" stop-opacity="0.34" />
              <stop offset="100%" stop-color="var(--coral)" stop-opacity="0.05" />
            </linearGradient>
          </defs>

          {yTicks.map((v) => (
            <g key={v}>
              <line
                x1={marginLeft}
                x2={width - MARGIN.right}
                y1={y(v)}
                y2={y(v)}
                class="gridline"
              />
              <text x={marginLeft - 8} y={y(v)} class="tick-label tick-y">
                {yLabel(v)}
              </text>
            </g>
          ))}

          {xIndices.map((i) => (
            <text key={i} x={x(i)} y={height - 8} class="tick-label tick-x">
              {xStep >= 12
                ? series[i].month.split("-")[0]
                : formatMonthShort(series[i].month)}
            </text>
          ))}

          {/* today frame: a dashed reference line at the current value */}
          {frame === "today" && pp && (
            <line
              x1={marginLeft}
              x2={width - MARGIN.right}
              y1={y(pp.nowValue)}
              y2={y(pp.nowValue)}
              class="now-line"
            />
          )}

          <g key={seriesKey}>
            {bandPath && <path d={bandPath} fill="url(#loss-band)" class="band" />}
            <path
              d={stepPath}
              class={`line-nominal draw${frame === "today" ? " is-muted" : ""}`}
              pathLength={1}
            />
            <path d={comparePath} class="line-real draw" pathLength={1} />
          </g>

          {raiseIndices.map((i) => (
            <g key={series[i].month}>
              <line
                x1={x(i)}
                x2={x(i)}
                y1={y(series[i].nominal)}
                y2={MARGIN.top + innerH}
                class="raise-hairline"
              />
              <circle
                cx={x(i)}
                cy={y(series[i].nominal)}
                r="4.5"
                class="raise-dot"
              >
                <title>
                  {c.raiseMarker}: {formatMonthShort(series[i].month)}
                </title>
              </circle>
            </g>
          ))}

          {peakIndex >= 0 && (
            <g class="peak">
              <circle
                cx={x(peakIndex)}
                cy={y(series[peakIndex].comparison)}
                r="4.5"
                class="peak-dot"
              />
              <text
                x={x(peakIndex)}
                y={y(series[peakIndex].comparison) - 12}
                class="peak-label"
              >
                {c.peakLabel(formatMonthShort(series[peakIndex].month))}
              </text>
            </g>
          )}

          <circle
            cx={x(last)}
            cy={y(series[last].comparison)}
            r="4.5"
            class="today-dot"
          />

          {hover !== null && (
            <g class="crosshair">
              <line
                x1={x(hover)}
                x2={x(hover)}
                y1={MARGIN.top}
                y2={MARGIN.top + innerH}
                class="crosshair-line"
              />
              <circle
                cx={x(hover)}
                cy={y(active.nominal)}
                r="4"
                class="crosshair-dot-nominal"
              />
              <circle
                cx={x(hover)}
                cy={y(active.comparison)}
                r="4"
                class="crosshair-dot-real"
              />
            </g>
          )}
        </svg>
      </div>
      <p class="chart-anchor-note">{c.anchorNote(formatMonth(series[0].month))}</p>
    </section>
  );
}
```

- [ ] **Step 2: Verify typecheck + tests + build** — `npx tsc --noEmit && npx vitest run && npm run build`. Expected: all green (Chart now uses `comparison`, the prop is `events`+`cpi` — Task 7 wires it; until then `app.tsx` still passes `series`, so do Task 7 before building if `tsc` complains about Chart props). If `tsc` errors only in `app.tsx`, proceed to Task 7 then re-run.

- [ ] **Step 3: Commit**
```bash
git add src/components/Chart.tsx
git commit -m "feat: multi-frame chart, both-series scale, peak marker, sign-aware readout"
```

---

## Task 7: Wire `Chart` in `app.tsx`

**Files:** Modify `src/app.tsx`.

- [ ] **Step 1: Drop the `series` memo and pass events+cpi** — in `src/app.tsx`, remove the line:

```tsx
  const series = useMemo(() => buildSeries(events, cpi), [events, cpi]);
```

and change the chart element from `<Chart series={series} />` to:

```tsx
        <Chart events={events} cpi={cpi} />
```

Then remove the now-unused import: change `import { buildSeries, type SalaryEvent } from "./lib/inflation";` to `import { type SalaryEvent } from "./lib/inflation";` (keep `SalaryEvent` — it's used by `replaceRows`). If `useMemo` becomes unused, drop it from the `preact/hooks` import.

- [ ] **Step 2: Verify** — `npx tsc --noEmit && npx vitest run && npm run build`. Expected: all green; 43+ tests pass.

- [ ] **Step 3: Commit**
```bash
git add src/app.tsx
git commit -m "refactor: Chart builds its own framed series from events+cpi"
```

---

## Task 8: Styles

**Files:** Modify `src/styles.css`.

- [ ] **Step 1: Append** the following to the end of `src/styles.css` (reuses existing tokens):

```css
/* ---------- Chart frames + peak ---------- */
.frame-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 0.875rem;
}
.frame-chip {
  min-height: 40px;
  padding: 0.375rem 0.875rem;
  font: inherit;
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--ink-soft);
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 999px;
  cursor: pointer;
}
.frame-chip.is-on {
  color: var(--paper-raised);
  background: var(--ink);
  border-color: var(--ink);
}
.frame-chip:focus-visible {
  outline: 2px solid var(--glacier);
  outline-offset: 2px;
}

.line-nominal.is-muted {
  stroke: var(--ink-faint);
  stroke-width: 1.5;
  opacity: 0.6;
}
.now-line {
  stroke: var(--ink-faint);
  stroke-width: 1;
  stroke-dasharray: 2 4;
}
.peak-dot {
  fill: var(--coral-deep);
  stroke: var(--paper-raised);
  stroke-width: 2;
}
.peak-label {
  font-family: var(--font-serif);
  font-style: italic;
  font-size: 13px;
  fill: var(--coral-deep);
  text-anchor: middle;
}
.readout-gain {
  color: var(--glacier-deep);
}

.payoff-secondary {
  margin: 0;
  font-size: 0.875rem;
  color: var(--ink-faint);
}
```

- [ ] **Step 2: Verify build** — `npm run build`. Expected: succeeds.

- [ ] **Step 3: Commit**
```bash
git add src/styles.css
git commit -m "style: chart frame chips, peak marker, muted nominal, secondary line"
```

---

## Task 9: Docs

**Files:** Modify `README.md`.

- [ ] **Step 1: Update the "How the math works" section** — in `README.md`, after the existing math formulas block, add:

```markdown
The page leads with **decline from peak**: real purchasing power is `salary ÷ CPI`,
its peak is the highest point over *all* months (Icelandic CPI has deflationary
dips, so the peak can fall between raises), and the headline shows how far today
sits below that peak — with lifetime change as secondary context. The chart offers
three reference frames (today's krónur / first-month krónur / keep-pace baseline).
```

- [ ] **Step 2: Commit**
```bash
git add README.md
git commit -m "docs: explain decline-from-peak and chart frames"
```

---

## Task 10: Manual + Playwright verification

**Files:** none committed (throwaway verification via the Playwright MCP browser).

- [ ] **Step 1: Run the app and exercise a multi-raise history with a real peak**

Start the dev server: `npm run dev -- --port 5194`. Then drive the live page (the verifier injects nothing — real CPI is bundled): clear the example, enter three salaries that reproduce a mid-history peak, e.g. `2018-01 = 600.000`, `2020-01 = 1.600.000`, `2024-01 = 1.800.000`.

- [ ] **Step 2: Verify each frame + the payoff**
Check, at 390px width:
- Payoff headline reads "Kaupmáttur þinn náði hámarki í {~2020} … rýrnað um {pct} — eða {kr} á mánuði" with a secondary lifetime line; the loss amount is coral.
- Chart frame toggle shows three chips; **today** is default; the comparison line does NOT clip (y-scale includes it); the **peak marker** sits at ~2020; switching to **origin** shows the coral erosion band; **keepPace** shows nominal vs the rising baseline.
- Scrub readout shows a sign-aware delta (coral below, glacier `readout-gain` above) and "—" within 1 króna.
- Lens chips re-based: "raise to return to your peak" wording.

Take screenshots of each frame for the record.

- [ ] **Step 3: No commit** (verification only). If anything is off, fix the relevant component and re-run.

---

## Self-review notes (reconciled)
- **Spec coverage:** peak-over-all-months + deflation (T1), frames + comparison rename (T2), peak-based lenses + referenceMonth (T3), copy (T4), peak-led sign-aware payoff + positive state (T5), both-series scale + per-frame visuals + peak marker + sign-aware readout (T6), wiring (T7), styles (T8), docs (T9), verification incl. deflation/at-peak exercised by unit tests (T1) and the live multi-raise check (T10). The spec's filled keepPace band is explicitly deferred (see header note) — lines + sign-aware readout in v1.
- **Type consistency:** `ChartFrame`, `PurchasingPower`, `analyzePurchasingPower`, `buildSeries(frame)`, `SeriesPoint.comparison`, `Gap.referenceMonth`, `peakGap`, and `computeLenses` (unchanged) line up across tasks; `Chart` props `events`+`cpi` match `app.tsx` (T7).
- **No placeholders:** every code step is complete; the only "describe-and-do" step is the manual T10 verification, which is inherently interactive.
```
