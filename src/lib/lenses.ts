import type { CpiData, MonthKey } from "./cpi";
import type { SalaryEvent } from "./inflation";
import { analyzePurchasingPower } from "./inflation";
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
