import type { CpiData } from "./cpi";
import type { SalaryEvent } from "./inflation";
import { MAX_ENTRIES, sanitizeEntries } from "./profiles";

interface ProfileFile {
  v: 1;
  kind: "kaupmattur-profile";
  name: string;
  entries: SalaryEvent[];
}

/** Machine-readable reason a file failed to parse; UI maps these to copy. */
export type ParseError =
  | "notJson"
  | "notObject"
  | "wrongFormat"
  | "noEntries"
  | "tooManyEntries";

export type ParseResult =
  | { name: string; entries: SalaryEvent[] }
  | { error: ParseError };

export function serializeProfile(name: string, entries: SalaryEvent[]): string {
  const file: ProfileFile = { v: 1, kind: "kaupmattur-profile", name, entries };
  return JSON.stringify(file, null, 1) + "\n";
}

export function parseProfileFile(text: string, cpi: CpiData): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { error: "notJson" };
  }
  if (typeof raw !== "object" || raw === null) return { error: "notObject" };
  const r = raw as Partial<ProfileFile>;
  if (r.kind !== "kaupmattur-profile" || r.v !== 1 || !Array.isArray(r.entries)) {
    return { error: "wrongFormat" };
  }
  const entries = sanitizeEntries(r.entries as SalaryEvent[], cpi);
  if (entries.length === 0) return { error: "noEntries" };
  if (entries.length > MAX_ENTRIES) return { error: "tooManyEntries" };
  const name = typeof r.name === "string" ? r.name : "Innflutt snið";
  return { name, entries };
}

export function safeFilename(name: string): string {
  const base = name
    .trim()
    .replace(/[^\p{L}\p{N}\-_ ]/gu, "")
    .trim()
    .replace(/\s+/g, "-");
  return `${base || "kaupmattur-profile"}.json`;
}

/** Browser-only: download `text` as a JSON file and revoke the object URL. */
export function downloadJson(filename: string, text: string): void {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
