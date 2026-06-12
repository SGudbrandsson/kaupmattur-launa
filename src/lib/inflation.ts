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
  /** Purchasing power expressed in baseline-month kronur. */
  real: number;
  /** The month of the event this point's purchasing power is measured against. */
  baselineMonth: MonthKey;
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

/**
 * Monthly series from the earliest event through the latest CPI month.
 * Nominal is a step function; the real line resets to nominal at each
 * event and decays against that event's CPI until the next one.
 * Events must be within the CPI range; they are sorted internally.
 */
export function buildSeries(events: SalaryEvent[], cpi: CpiData): SeriesPoint[] {
  if (events.length === 0) return [];
  const sorted = [...events].sort((a, b) => compareMonths(a.month, b.month));
  const points: SeriesPoint[] = [];
  let active = 0;
  for (const month of monthRange(sorted[0].month, cpi.lastMonth)) {
    while (
      active + 1 < sorted.length &&
      compareMonths(sorted[active + 1].month, month) <= 0
    ) {
      active++;
    }
    const { month: baselineMonth, amount } = sorted[active];
    points.push({
      month,
      nominal: amount,
      baselineMonth,
      real: realValue(amount, baselineMonth, month, cpi),
    });
  }
  return points;
}
