import {
  type CpiData,
  type MonthKey,
  compareMonths,
  monthRange,
} from "./cpi";

/** A salary set or changed in a given month. */
export interface SalaryEvent {
  month: MonthKey;
  amount: number;
}

export interface SeriesPoint {
  month: MonthKey;
  /** The salary as paid (step function of the events). */
  nominal: number;
  /** Purchasing power expressed in anchor-month kronur (the first event's month). */
  real: number;
  /** The month of the most recent salary event on or before this point. */
  eventMonth: MonthKey;
}

function index(cpi: CpiData, month: MonthKey): number {
  const v = cpi.values[month];
  if (v === undefined) {
    throw new Error(`No CPI value for ${month}`);
  }
  return v;
}

/**
 * Purchasing power at month `to` of `amount` set in month `from`,
 * expressed in `from`-month kronur.
 */
export function realValue(
  amount: number,
  from: MonthKey,
  to: MonthKey,
  cpi: CpiData,
): number {
  return (amount * index(cpi, from)) / index(cpi, to);
}

/** Total price increase from `from` to `to`, e.g. 0.071 for 7.1%. */
export function cumulativeInflation(
  from: MonthKey,
  to: MonthKey,
  cpi: CpiData,
): number {
  return index(cpi, to) / index(cpi, from) - 1;
}

/**
 * The salary needed in the latest CPI month to match the purchasing
 * power `amount` had in month `from`.
 */
export function requiredToday(
  amount: number,
  from: MonthKey,
  cpi: CpiData,
): number {
  return (amount * index(cpi, cpi.lastMonth)) / index(cpi, from);
}

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

/**
 * Monthly series from the earliest event through the latest CPI month.
 * Nominal is a step function. The real line is one continuous story:
 * every value is expressed in the kronur of the FIRST event's month
 * (the anchor), so raises appear exactly as large as they are in real
 * terms — a raise that fails to beat inflation visibly fails to reach
 * the old level. Events must be within the CPI range; sorted internally.
 */
export function buildSeries(events: SalaryEvent[], cpi: CpiData): SeriesPoint[] {
  if (events.length === 0) return [];
  const sorted = [...events].sort((a, b) => compareMonths(a.month, b.month));
  const anchor = sorted[0].month;
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
    points.push({
      month,
      nominal: amount,
      eventMonth,
      real: realValue(amount, anchor, month, cpi),
    });
  }
  return points;
}
