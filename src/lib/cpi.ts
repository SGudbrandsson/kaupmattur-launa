import cpiJson from "../data/cpi.json";

/** A month in "YYYY-MM" form, e.g. "2025-01". */
export type MonthKey = string;

export interface CpiData {
  source: string;
  fetchedAt: string;
  firstMonth: MonthKey;
  lastMonth: MonthKey;
  values: Record<MonthKey, number>;
}

export function getCpi(): CpiData {
  return cpiJson as CpiData;
}

export function compareMonths(a: MonthKey, b: MonthKey): number {
  // "YYYY-MM" sorts correctly as a string.
  return a < b ? -1 : a > b ? 1 : 0;
}

export function addMonths(month: MonthKey, n: number): MonthKey {
  const [y, m] = month.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  const year = Math.floor(total / 12);
  const mon = (total % 12) + 1;
  return `${year}-${String(mon).padStart(2, "0")}`;
}

/** Inclusive list of months from `from` through `to`. Empty if from > to. */
export function monthRange(from: MonthKey, to: MonthKey): MonthKey[] {
  const out: MonthKey[] = [];
  for (let m = from; compareMonths(m, to) <= 0; m = addMonths(m, 1)) {
    out.push(m);
  }
  return out;
}
