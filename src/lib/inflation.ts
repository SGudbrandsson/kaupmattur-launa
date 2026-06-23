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
  /** The comparison line; its meaning depends on the chart frame. */
  comparison: number;
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
  /** The current (most recent) nominal salary; equals its own today-króna value. */
  nowValue: number;
  /** peakValueToday − nowValue, clamped to 0 within an epsilon. */
  monthlyLoss: number;
  /** monthlyLoss / peakValueToday (0 at peak). */
  declinePct: number;
  /** Raise fraction needed to return to peak = monthlyLoss / nowValue (0 at peak). */
  raiseToReturn: number;
  /** Real change since the first salary (may be negative). */
  lifetimePct: number;
  /** The first salary event's month. */
  firstMonth: MonthKey;
  /** True when the current month is the all-time real peak. */
  atPeak: boolean;
}

/** Sub-króna residuals from CPI ratios shouldn't flip the at-peak state. */
const PEAK_EPSILON = 1;

/**
 * The peak real purchasing power and the decline from it. The peak is the
 * global argmax of salary(t)/CPI(t) over EVERY month (not just event months) —
 * the Icelandic CPI has deflationary dips, so a plateau's peak can be a
 * non-event month. Ties resolve to the most recent month.
 * Events must be within the CPI range.
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
 * Nominal is a step function. The `comparison` line depends on the frame:
 *  - "origin": real value in the FIRST event month's krónur (the anchor) —
 *    raises appear as large as they are in real terms;
 *  - "today": real value restated in today's krónur;
 *  - "keepPace": the salary needed each month to hold the first salary's
 *    purchasing power (the inflation baseline).
 * Events must be within the CPI range; sorted internally.
 */
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
