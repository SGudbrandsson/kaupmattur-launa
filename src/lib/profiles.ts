import type { CpiData, MonthKey } from "./cpi";
import { compareMonths } from "./cpi";
import type { SalaryEvent } from "./inflation";

export interface Profile {
  id: string;
  name: string;
  entries: SalaryEvent[];
}

export interface Store {
  v: 2;
  activeId: string;
  profiles: Profile[];
}

export interface Preset {
  id: string;
  name: string;
  source: string;
  entries: SalaryEvent[];
}

export const DEFAULT_PRESET_ID = "preset:lagmarkslaun";
export const MAX_PROFILES = 50;
export const MAX_NAME_LEN = 60;
export const MAX_ENTRIES = 600;
export const MAX_IMPORT_BYTES = 1_000_000;

/** Unique id that never collides with the reserved "preset:" namespace. */
export function newId(): string {
  const raw =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  return raw.startsWith("preset:") ? `u-${raw}` : raw;
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

/** Keep only valid, in-CPI-range entries; dedupe by month (last wins); sort ascending. */
export function sanitizeEntries(entries: SalaryEvent[], cpi: CpiData): SalaryEvent[] {
  const byMonth = new Map<MonthKey, number>();
  for (const e of entries) {
    if (!isValidEntry(e)) continue;
    if (
      compareMonths(e.month, cpi.firstMonth) < 0 ||
      compareMonths(e.month, cpi.lastMonth) > 0
    ) {
      continue;
    }
    byMonth.set(e.month, e.amount);
  }
  return [...byMonth.entries()]
    .map(([month, amount]) => ({ month, amount }))
    .sort((a, b) => compareMonths(a.month, b.month));
}

export function freshStore(): Store {
  return { v: 2, activeId: DEFAULT_PRESET_ID, profiles: [] };
}

export function migrateV1(entries: SalaryEvent[], cpi: CpiData): Store {
  const profile: Profile = {
    id: newId(),
    name: "Mín laun",
    entries: sanitizeEntries(entries, cpi),
  };
  return { v: 2, activeId: profile.id, profiles: [profile] };
}

/** Validate raw v2 JSON: fix ids (reserved/dup/missing), sanitize entries, cap count. */
export function validateStore(raw: unknown, cpi: CpiData): Store | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Partial<Store>;
  if (r.v !== 2 || !Array.isArray(r.profiles) || typeof r.activeId !== "string") {
    return null;
  }
  const seen = new Set<string>();
  const remap = new Map<string, string>();
  const profiles: Profile[] = [];
  for (const p of r.profiles.slice(0, MAX_PROFILES)) {
    if (typeof p !== "object" || p === null) continue;
    const pp = p as Partial<Profile>;
    let id = typeof pp.id === "string" ? pp.id : "";
    if (!id || id.startsWith("preset:") || seen.has(id)) {
      const fresh = newId();
      if (id) remap.set(id, fresh);
      id = fresh;
    }
    seen.add(id);
    const name =
      (typeof pp.name === "string" ? pp.name : "Snið").trim().slice(0, MAX_NAME_LEN) ||
      "Snið";
    const entries = sanitizeEntries(
      Array.isArray(pp.entries) ? (pp.entries as SalaryEvent[]) : [],
      cpi,
    );
    profiles.push({ id, name, entries });
  }
  const activeId = remap.get(r.activeId) ?? r.activeId;
  return { v: 2, activeId, profiles };
}

/** Precedence: valid v2 > valid v1 migration > fresh. Pure (raw strings in). */
export function loadStoreFrom(
  v2raw: string | null,
  v1raw: string | null,
  cpi: CpiData,
): { store: Store; migrated: boolean } {
  if (v2raw) {
    try {
      const s = validateStore(JSON.parse(v2raw), cpi);
      if (s) return { store: s, migrated: false };
    } catch {
      /* fall through */
    }
  }
  if (v1raw) {
    try {
      const parsed = JSON.parse(v1raw) as { v?: number; entries?: unknown };
      if (parsed?.v === 1 && Array.isArray(parsed.entries)) {
        return { store: migrateV1(parsed.entries as SalaryEvent[], cpi), migrated: true };
      }
    } catch {
      /* fall through */
    }
  }
  return { store: freshStore(), migrated: false };
}

export interface ActiveResolved {
  resolvedId: string;
  kind: "user" | "preset";
  name: string;
  source?: string;
  entries: SalaryEvent[];
  readOnly: boolean;
}

/** A name not already used; suffixes " (2)", " (3)", … on collision. */
function uniqueName(store: Store, base: string): string {
  const names = new Set(store.profiles.map((p) => p.name));
  if (!names.has(base)) return base;
  let n = 2;
  while (names.has(`${base} (${n})`)) n++;
  return `${base} (${n})`;
}

export function createProfile(store: Store, name = "Nýtt snið"): { store: Store; id: string } {
  if (store.profiles.length >= MAX_PROFILES) return { store, id: store.activeId };
  const id = newId();
  const profile: Profile = {
    id,
    name: name.trim().slice(0, MAX_NAME_LEN) || "Nýtt snið",
    entries: [],
  };
  return { store: { ...store, profiles: [...store.profiles, profile], activeId: id }, id };
}

export function renameProfile(store: Store, id: string, name: string): Store {
  const trimmed = name.trim().slice(0, MAX_NAME_LEN);
  if (!trimmed) return store;
  return { ...store, profiles: store.profiles.map((p) => (p.id === id ? { ...p, name: trimmed } : p)) };
}

export function deleteProfile(store: Store, id: string): Store {
  const profiles = store.profiles.filter((p) => p.id !== id);
  const activeId = store.activeId === id ? (profiles.at(-1)?.id ?? DEFAULT_PRESET_ID) : store.activeId;
  return { ...store, profiles, activeId };
}

export function duplicateProfile(store: Store, id: string): Store {
  const src = store.profiles.find((p) => p.id === id);
  if (!src || store.profiles.length >= MAX_PROFILES) return store;
  const copy: Profile = { id: newId(), name: uniqueName(store, `${src.name} (afrit)`), entries: [...src.entries] };
  return { ...store, profiles: [...store.profiles, copy], activeId: copy.id };
}

export function setActive(store: Store, id: string): Store {
  return { ...store, activeId: id };
}

export function updateEntries(store: Store, id: string, entries: SalaryEvent[]): Store {
  return { ...store, profiles: store.profiles.map((p) => (p.id === id ? { ...p, entries } : p)) };
}

export function forkPreset(store: Store, preset: Preset, cpi: CpiData): Store {
  if (store.profiles.length >= MAX_PROFILES) return store;
  const copy: Profile = {
    id: newId(),
    name: uniqueName(store, `${preset.name} (afrit)`),
    entries: sanitizeEntries(preset.entries, cpi),
  };
  return { ...store, profiles: [...store.profiles, copy], activeId: copy.id };
}

/** Add an imported profile (sanitized, suffixed, capped). */
export function addProfile(
  store: Store,
  name: string,
  entries: SalaryEvent[],
  cpi: CpiData,
): { store: Store; id: string } | { error: "limit" } {
  if (store.profiles.length >= MAX_PROFILES) return { error: "limit" };
  const id = newId();
  const profile: Profile = {
    id,
    name: uniqueName(store, name.trim().slice(0, MAX_NAME_LEN) || "Innflutt snið"),
    entries: sanitizeEntries(entries, cpi).slice(0, MAX_ENTRIES),
  };
  return { store: { ...store, profiles: [...store.profiles, profile], activeId: id }, id };
}

/** The active profile's data, with a corrected id when activeId is stale. */
export function resolveActive(
  store: Store,
  presets: Preset[],
  cpi: CpiData,
): ActiveResolved {
  const user = store.profiles.find((p) => p.id === store.activeId);
  if (user) {
    return { resolvedId: user.id, kind: "user", name: user.name, entries: user.entries, readOnly: false };
  }
  const preset = presets.find((p) => p.id === store.activeId);
  if (preset) {
    return {
      resolvedId: preset.id, kind: "preset", name: preset.name, source: preset.source,
      entries: sanitizeEntries(preset.entries, cpi), readOnly: true,
    };
  }
  const lastUser = store.profiles.at(-1);
  if (lastUser) {
    return { resolvedId: lastUser.id, kind: "user", name: lastUser.name, entries: lastUser.entries, readOnly: false };
  }
  const def = presets.find((p) => p.id === DEFAULT_PRESET_ID) ?? presets[0];
  return {
    resolvedId: def.id, kind: "preset", name: def.name, source: def.source,
    entries: sanitizeEntries(def.entries, cpi), readOnly: true,
  };
}
