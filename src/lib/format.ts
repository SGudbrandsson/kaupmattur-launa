import type { MonthKey } from "./cpi";

/**
 * All formatting is hand-rolled rather than Intl-based: browsers with
 * reduced ICU builds (headless shells, some WebViews) silently fall back
 * from "is" to English, which would break both month names and digit
 * grouping. Icelandic formatting is simple enough to own outright.
 */

const MINUS = "−";

export const MONTHS_LONG = [
  "janúar",
  "febrúar",
  "mars",
  "apríl",
  "maí",
  "júní",
  "júlí",
  "ágúst",
  "september",
  "október",
  "nóvember",
  "desember",
] as const;

export const MONTHS_SHORT = [
  "jan.",
  "feb.",
  "mar.",
  "apr.",
  "maí",
  "jún.",
  "júl.",
  "ágú.",
  "sep.",
  "okt.",
  "nóv.",
  "des.",
] as const;

/** Dot-grouped integer: 1234567 → "1.234.567". */
function group(n: number): string {
  const abs = Math.abs(Math.round(n));
  const sign = n < 0 ? MINUS : "";
  return sign + String(abs).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** Fixed decimals with an Icelandic comma: (1.25, 1) → "1,3". */
function fixedComma(n: number, decimals: number): string {
  const sign = n < 0 ? MINUS : "";
  const [int, frac] = Math.abs(n).toFixed(decimals).split(".");
  return `${sign}${group(Number(int))}${frac ? `,${frac}` : ""}`;
}

/** "1.000.000 kr." — whole kronur. */
export function formatISK(amount: number): string {
  return `${group(amount)} kr.`;
}

/** Signed delta: "−71.300 kr." / "+5.000 kr." */
export function formatISKDelta(amount: number): string {
  const rounded = Math.round(amount);
  const sign = rounded > 0 ? "+" : "";
  return `${sign}${group(rounded)} kr.`;
}

/** "janúar 2025" */
export function formatMonth(month: MonthKey): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTHS_LONG[m - 1]} ${y}`;
}

/** "jan. 2025" */
export function formatMonthShort(month: MonthKey): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTHS_SHORT[m - 1]} ${y}`;
}

/** ISO timestamp → "12. júní 2026". */
export function formatDateLong(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()}. ${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`;
}

/** −0.071 → "−7,1%". */
export function formatPercent(ratio: number): string {
  return `${fixedComma(ratio * 100, 1)}%`;
}

/** One-or-more decimal places with an Icelandic comma: (3.81, 1) → "3,8". */
export function formatDecimal(n: number, decimals = 1): string {
  return fixedComma(n, decimals);
}

/**
 * Compact axis labels: "950 kr.", "950 þús.", "1,2 m.kr."
 * Pass the tick step so neighbouring ticks stay distinguishable
 * (step 50.000 → "1,05 m.kr." instead of two ticks both saying "1,1").
 */
export function formatCompactISK(amount: number, step?: number): string {
  const abs = Math.abs(amount);
  if (abs >= 1_000_000) {
    const m = amount / 1_000_000;
    const decimals =
      step !== undefined
        ? step % 1_000_000 === 0
          ? 0
          : step % 100_000 === 0
            ? 1
            : 2
        : Math.round(m * 10) % 10 === 0
          ? 0
          : 1;
    return `${fixedComma(m, decimals)} m.kr.`;
  }
  if (abs >= 1_000) {
    return `${group(Math.round(amount / 1_000))} þús.`;
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
