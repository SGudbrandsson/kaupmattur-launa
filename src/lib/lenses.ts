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
  const latest = [...events].sort((a, b) => compareMonths(a.month, b.month)).at(-1);
  if (!latest) return null;
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
