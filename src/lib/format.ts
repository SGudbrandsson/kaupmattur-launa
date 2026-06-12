import type { MonthKey } from "./cpi";

const MINUS = "−";

const iskFormat = new Intl.NumberFormat("is-IS", { maximumFractionDigits: 0 });
const oneDecimal = new Intl.NumberFormat("is-IS", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const percentFormat = new Intl.NumberFormat("is-IS", {
  style: "percent",
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const monthLong = new Intl.DateTimeFormat("is", {
  month: "long",
  year: "numeric",
});
const monthShort = new Intl.DateTimeFormat("is", {
  month: "short",
  year: "numeric",
});

function monthToDate(month: MonthKey): Date {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1);
}

/** "1.000.000 kr." — whole kronur. */
export function formatISK(amount: number): string {
  return `${iskFormat.format(Math.round(amount))} kr.`.replace("-", MINUS);
}

/** Signed delta: "−71.300 kr." / "+5.000 kr." */
export function formatISKDelta(amount: number): string {
  const rounded = Math.round(amount);
  const sign = rounded > 0 ? "+" : rounded < 0 ? MINUS : "";
  return `${sign}${iskFormat.format(Math.abs(rounded))} kr.`;
}

/** "janúar 2025" */
export function formatMonth(month: MonthKey): string {
  return monthLong.format(monthToDate(month));
}

/** "jan. 2025" */
export function formatMonthShort(month: MonthKey): string {
  return monthShort.format(monthToDate(month));
}

/** −0.071 → "−7,1%" (proper minus sign). */
export function formatPercent(ratio: number): string {
  return percentFormat.format(ratio).replace("-", MINUS);
}

/** Compact axis labels: "950 kr.", "950 þús.", "1,2 m.kr." */
export function formatCompactISK(amount: number): string {
  const abs = Math.abs(amount);
  if (abs >= 1_000_000) {
    const m = amount / 1_000_000;
    const text = Number.isInteger(m) ? iskFormat.format(m) : oneDecimal.format(m);
    return `${text} m.kr.`.replace("-", MINUS);
  }
  if (abs >= 1_000) {
    return `${iskFormat.format(Math.round(amount / 1_000))} þús.`.replace("-", MINUS);
  }
  return formatISK(amount);
}

/**
 * Parse a user-typed ISK amount: accepts digits with optional dot/space
 * grouping ("1.000.000", "1 000 000", "800000"). Returns null when the
 * input isn't a plain positive integer amount.
 */
export function parseAmount(input: string): number | null {
  const cleaned = input.trim().replace(/kr\.?$/i, "").trim();
  if (!/^\d{1,3}(?:[. ]?\d{3})*$|^\d+$/.test(cleaned)) return null;
  const value = Number(cleaned.replace(/[. ]/g, ""));
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}
