import type { CpiData, MonthKey } from "../cpi";
import { compareMonths } from "../cpi";
import type { SalaryEvent } from "../inflation";

/** Untrusted row shape emitted by the model. */
export interface RawRow {
  month: string;
  amount: number;
}

export interface NormalizeResult {
  rows: SalaryEvent[];
  dropped: number;
}

/** The form's upper bound on a salary amount (mirrors SalaryForm.MAX_AMOUNT). */
const MAX_AMOUNT = 99_000_000;

function toMonthKey(raw: string): MonthKey | null {
  if (typeof raw !== "string") return null;
  const m = /^(\d{4})[-/](\d{1,2})$/.exec(raw.trim());
  if (!m) return null;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return `${m[1]}-${String(month).padStart(2, "0")}`;
}

/**
 * Turn loose model output into valid, de-duplicated, sorted salary events.
 * Rows with an unparseable/out-of-range month or a non-positive / over-max /
 * non-finite amount are dropped and counted. On duplicate months the last
 * value wins.
 */
export function normalizeRows(raw: RawRow[], cpi: CpiData): NormalizeResult {
  const byMonth = new Map<MonthKey, number>();
  let dropped = 0;

  for (const row of raw) {
    const month = toMonthKey(row.month);
    const amount = Math.round(Number(row.amount));
    const inRange =
      month !== null &&
      compareMonths(month, cpi.firstMonth) >= 0 &&
      compareMonths(month, cpi.lastMonth) <= 0;
    const validAmount =
      Number.isFinite(amount) && amount > 0 && amount <= MAX_AMOUNT;

    if (!inRange || !validAmount) {
      dropped++;
      continue;
    }
    byMonth.set(month, amount);
  }

  const rows = [...byMonth.entries()]
    .map(([month, amount]) => ({ month, amount }))
    .sort((a, b) => compareMonths(a.month, b.month));

  return { rows, dropped };
}
