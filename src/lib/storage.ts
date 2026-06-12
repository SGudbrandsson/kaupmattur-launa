import type { SalaryEvent } from "./inflation";

const KEY = "kaupmattur-launa:v1";

interface Persisted {
  v: 1;
  entries: SalaryEvent[];
}

function isValidEntry(e: unknown): e is SalaryEvent {
  return (
    typeof e === "object" &&
    e !== null &&
    typeof (e as SalaryEvent).month === "string" &&
    /^\d{4}-\d{2}$/.test((e as SalaryEvent).month) &&
    typeof (e as SalaryEvent).amount === "number" &&
    Number.isSafeInteger((e as SalaryEvent).amount) &&
    (e as SalaryEvent).amount > 0
  );
}

/** Returns null on anything missing, corrupt or from a future version. */
export function loadEntries(): SalaryEvent[] | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Persisted;
    if (parsed?.v !== 1 || !Array.isArray(parsed.entries)) return null;
    if (!parsed.entries.every(isValidEntry)) return null;
    return parsed.entries;
  } catch {
    return null;
  }
}

export function saveEntries(entries: SalaryEvent[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ v: 1, entries } satisfies Persisted));
  } catch {
    // Storage may be full or blocked; the app simply won't persist.
  }
}
