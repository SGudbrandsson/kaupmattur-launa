# Profiles (save / load / import-export + presets) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Named, autosaving profiles (switch / new / rename / delete / duplicate / file import-export) plus a bundled read-only minimum-wage preset that forks-on-edit — all local, with a hard guarantee that no out-of-CPI-range entry ever reaches the UI.

**Architecture:** A pure `profiles.ts` (Store transforms + `sanitizeEntries` guard + `resolveActive`) is the single source of truth; `storage.ts` is thin localStorage IO with v2-authoritative precedence (and removes `:v1` after migration); `profileFile.ts` handles import/export; `ProfileBar` is the UI; `app.tsx` holds the Store, rebuilds form rows on profile switch, and gates all mutation (incl. AI autofill) when a preset is active.

**Tech Stack:** Vite, Preact (TSX), TypeScript, Vitest. No new dependencies.

Spec: `docs/superpowers/specs/2026-06-30-profiles-save-load-design.md` (revised after Codex review).

---

## File structure
- **Create** `src/lib/profiles.ts` — pure Store model + transforms + `sanitizeEntries` + `resolveActive` + `loadStoreFrom`. **Tested.**
- **Create** `tests/profiles.test.ts`.
- **Create** `src/lib/profileFile.ts` — serialize/parse + DOM download. **Parse/serialize tested.**
- **Create** `tests/profileFile.test.ts`.
- **Create** `src/data/presets.ts` — bundled Lágmarkslaun preset. **Create** `tests/presets.test.ts`.
- **Rewrite** `src/lib/storage.ts` — `loadStore`/`saveStore` (IO + precedence + remove `:v1`).
- **Create** `src/components/ProfileBar.tsx`.
- **Modify** `src/components/SalaryForm.tsx` — drop `isExample`/`onClearExample`; add `readOnly`/`onFork`/`presetSource` + empty state.
- **Modify** `src/components/PayoffCard.tsx` — remove `isExample`/`onTryOwn`.
- **Modify** `src/app.tsx` — Store state, resolve+persist active, rebuild rows on switch, autosave, gate AI, wire ProfileBar; remove example machinery.
- **Modify** `src/copy.ts`, `src/styles.css`, `README.md`.

---

## Task 1: `profiles.ts` — load/resolve half (pure, TDD)

**Files:** Create `src/lib/profiles.ts`, `tests/profiles.test.ts`.

- [ ] **Step 1: Write failing tests** — Create `tests/profiles.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { CpiData } from "../src/lib/cpi";
import type { Preset } from "../src/lib/profiles";
import {
  DEFAULT_PRESET_ID,
  freshStore,
  loadStoreFrom,
  migrateV1,
  newId,
  resolveActive,
  sanitizeEntries,
  validateStore,
} from "../src/lib/profiles";

const cpi: CpiData = {
  source: "t", fetchedAt: "x", firstMonth: "2020-01", lastMonth: "2020-04",
  values: { "2020-01": 100, "2020-02": 110, "2020-03": 120, "2020-04": 130 },
};
const preset: Preset = {
  id: DEFAULT_PRESET_ID, name: "Lágmarkslaun", source: "ASÍ",
  entries: [{ month: "2020-01", amount: 300000 }],
};

describe("newId", () => {
  it("never produces a reserved preset-prefixed id", () => {
    for (let i = 0; i < 50; i++) expect(newId().startsWith("preset:")).toBe(false);
  });
});

describe("sanitizeEntries", () => {
  it("drops out-of-range and invalid entries, dedupes by month, sorts", () => {
    const out = sanitizeEntries(
      [
        { month: "2020-03", amount: 3 },
        { month: "2019-12", amount: 1 }, // before range
        { month: "2020-05", amount: 1 }, // after range
        { month: "bad", amount: 1 } as never,
        { month: "2020-02", amount: -5 }, // non-positive
        { month: "2020-01", amount: 1 },
        { month: "2020-01", amount: 2 }, // dupe -> last wins
      ],
      cpi,
    );
    expect(out).toEqual([
      { month: "2020-01", amount: 2 },
      { month: "2020-03", amount: 3 },
    ]);
  });
});

describe("freshStore / migrateV1 / loadStoreFrom precedence", () => {
  it("freshStore has no profiles and the preset active", () => {
    expect(freshStore()).toEqual({ v: 2, activeId: DEFAULT_PRESET_ID, profiles: [] });
  });

  it("migrateV1 wraps sanitized entries into 'Mín laun', active", () => {
    const s = migrateV1([{ month: "2020-02", amount: 5 }, { month: "2030-01", amount: 9 }], cpi);
    expect(s.profiles).toHaveLength(1);
    expect(s.profiles[0].name).toBe("Mín laun");
    expect(s.profiles[0].entries).toEqual([{ month: "2020-02", amount: 5 }]);
    expect(s.activeId).toBe(s.profiles[0].id);
  });

  it("uses valid v2 over v1", () => {
    const v2 = JSON.stringify({ v: 2, activeId: "a", profiles: [{ id: "a", name: "X", entries: [] }] });
    const v1 = JSON.stringify({ v: 1, entries: [{ month: "2020-01", amount: 9 }] });
    const { store, migrated } = loadStoreFrom(v2, v1, cpi);
    expect(migrated).toBe(false);
    expect(store.profiles[0].name).toBe("X");
  });

  it("falls back to v1 migration when v2 is corrupt", () => {
    const v1 = JSON.stringify({ v: 1, entries: [{ month: "2020-01", amount: 9 }] });
    const { store, migrated } = loadStoreFrom("{not json", v1, cpi);
    expect(migrated).toBe(true);
    expect(store.profiles[0].name).toBe("Mín laun");
  });

  it("fresh store when neither key is present", () => {
    const { store, migrated } = loadStoreFrom(null, null, cpi);
    expect(migrated).toBe(false);
    expect(store).toEqual(freshStore());
  });
});

describe("validateStore", () => {
  it("reassigns reserved/duplicate/missing ids and follows activeId", () => {
    const raw = {
      v: 2, activeId: "preset:lagmarkslaun",
      profiles: [
        { id: "preset:lagmarkslaun", name: "A", entries: [] }, // reserved -> reassigned
        { id: "dup", name: "B", entries: [] },
        { id: "dup", name: "C", entries: [] }, // duplicate -> reassigned
      ],
    };
    const s = validateStore(raw, cpi)!;
    expect(s.profiles.every((p) => !p.id.startsWith("preset:"))).toBe(true);
    expect(new Set(s.profiles.map((p) => p.id)).size).toBe(3);
    // activeId pointed at the reserved profile -> now its new id
    expect(s.activeId).toBe(s.profiles[0].id);
  });

  it("returns null on a non-v2 shape", () => {
    expect(validateStore({ v: 1 }, cpi)).toBeNull();
    expect(validateStore(null, cpi)).toBeNull();
  });
});

describe("resolveActive", () => {
  it("resolves a user profile (editable)", () => {
    const store = { v: 2 as const, activeId: "u1", profiles: [{ id: "u1", name: "Me", entries: [] }] };
    const r = resolveActive(store, [preset], cpi);
    expect(r).toMatchObject({ resolvedId: "u1", kind: "user", readOnly: false });
  });

  it("resolves a preset (read-only, sanitized)", () => {
    const store = { v: 2 as const, activeId: DEFAULT_PRESET_ID, profiles: [] };
    const r = resolveActive(store, [preset], cpi);
    expect(r).toMatchObject({ resolvedId: DEFAULT_PRESET_ID, kind: "preset", readOnly: true });
    expect(r.entries).toEqual([{ month: "2020-01", amount: 300000 }]);
  });

  it("falls back to the last user profile on a stale id", () => {
    const store = { v: 2 as const, activeId: "gone", profiles: [{ id: "a", name: "A", entries: [] }, { id: "b", name: "B", entries: [] }] };
    expect(resolveActive(store, [preset], cpi).resolvedId).toBe("b");
  });

  it("falls back to the preset when there are no user profiles", () => {
    const store = { v: 2 as const, activeId: "gone", profiles: [] };
    expect(resolveActive(store, [preset], cpi).resolvedId).toBe(DEFAULT_PRESET_ID);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run tests/profiles.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement** — Create `src/lib/profiles.ts`:

```ts
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
```

- [ ] **Step 4: Run to verify pass** — `npx vitest run tests/profiles.test.ts` → PASS.

- [ ] **Step 5: Commit**
```bash
git add src/lib/profiles.ts tests/profiles.test.ts
git commit -m "feat: profiles store core (sanitize, migrate, validate, resolveActive)"
```

---

## Task 2: `profiles.ts` — mutations (pure, TDD)

**Files:** Modify `src/lib/profiles.ts`, `tests/profiles.test.ts`.

- [ ] **Step 1: Append failing tests** to `tests/profiles.test.ts` (add the imports `addProfile, createProfile, deleteProfile, duplicateProfile, forkPreset, renameProfile, setActive, updateEntries` to the existing import from `../src/lib/profiles`):

```ts
describe("mutations", () => {
  const base = () => ({ v: 2 as const, activeId: "a", profiles: [{ id: "a", name: "A", entries: [] as never[] }] });

  it("createProfile adds a blank profile and activates it", () => {
    const { store, id } = createProfile(base());
    expect(store.profiles).toHaveLength(2);
    expect(store.activeId).toBe(id);
    expect(store.profiles.at(-1)).toMatchObject({ name: "Nýtt snið", entries: [] });
  });

  it("renameProfile trims; rejects empty", () => {
    expect(renameProfile(base(), "a", "  Anna ").profiles[0].name).toBe("Anna");
    expect(renameProfile(base(), "a", "   ").profiles[0].name).toBe("A");
  });

  it("deleteProfile falls back to the last remaining profile, else the preset", () => {
    const two = { v: 2 as const, activeId: "a", profiles: [{ id: "a", name: "A", entries: [] }, { id: "b", name: "B", entries: [] }] };
    expect(deleteProfile(two, "a").activeId).toBe("b");
    expect(deleteProfile(base(), "a").activeId).toBe(DEFAULT_PRESET_ID);
  });

  it("duplicateProfile suffixes the name and activates the copy", () => {
    const s = duplicateProfile(base(), "a");
    expect(s.profiles.at(-1)!.name).toBe("A (afrit)");
    expect(s.activeId).toBe(s.profiles.at(-1)!.id);
  });

  it("setActive / updateEntries", () => {
    expect(setActive(base(), "z").activeId).toBe("z");
    const s = updateEntries(base(), "a", [{ month: "2020-01", amount: 5 }]);
    expect(s.profiles[0].entries).toEqual([{ month: "2020-01", amount: 5 }]);
  });

  it("forkPreset creates a sanitized editable copy, active", () => {
    const cpi: CpiData = { source: "t", fetchedAt: "x", firstMonth: "2020-01", lastMonth: "2020-02", values: { "2020-01": 100, "2020-02": 110 } };
    const s = forkPreset(base(), { id: DEFAULT_PRESET_ID, name: "Lágmarkslaun", source: "ASÍ", entries: [{ month: "2020-01", amount: 300000 }, { month: "2099-01", amount: 1 }] }, cpi);
    expect(s.profiles.at(-1)!.name).toBe("Lágmarkslaun (afrit)");
    expect(s.profiles.at(-1)!.entries).toEqual([{ month: "2020-01", amount: 300000 }]);
    expect(s.activeId).toBe(s.profiles.at(-1)!.id);
  });

  it("addProfile (import) sanitizes, suffixes collisions, caps", () => {
    const cpi: CpiData = { source: "t", fetchedAt: "x", firstMonth: "2020-01", lastMonth: "2020-02", values: { "2020-01": 100, "2020-02": 110 } };
    const start = { v: 2 as const, activeId: "a", profiles: [{ id: "a", name: "Anna", entries: [] }] };
    const res = addProfile(start, "Anna", [{ month: "2020-01", amount: 9 }], cpi);
    expect("store" in res).toBe(true);
    if ("store" in res) {
      expect(res.store.profiles.at(-1)!.name).toBe("Anna (2)");
      expect(res.store.activeId).toBe(res.id);
    }
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run tests/profiles.test.ts` → FAIL (mutations missing).

- [ ] **Step 3: Implement** — append to `src/lib/profiles.ts`:

```ts
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
```

- [ ] **Step 4: Run to verify pass** — `npx vitest run tests/profiles.test.ts` → PASS.

- [ ] **Step 5: Commit**
```bash
git add src/lib/profiles.ts tests/profiles.test.ts
git commit -m "feat: profile mutations (create/rename/delete/duplicate/fork/import)"
```

---

## Task 3: `profileFile.ts` (import/export, TDD)

**Files:** Create `src/lib/profileFile.ts`, `tests/profileFile.test.ts`.

- [ ] **Step 1: Write failing tests** — Create `tests/profileFile.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { CpiData } from "../src/lib/cpi";
import { parseProfileFile, safeFilename, serializeProfile } from "../src/lib/profileFile";

const cpi: CpiData = {
  source: "t", fetchedAt: "x", firstMonth: "2020-01", lastMonth: "2020-04",
  values: { "2020-01": 100, "2020-02": 110, "2020-03": 120, "2020-04": 130 },
};

describe("serialize/parse round-trip", () => {
  it("round-trips a profile", () => {
    const text = serializeProfile("Anna", [{ month: "2020-01", amount: 300000 }]);
    const r = parseProfileFile(text, cpi);
    expect(r).toEqual({ name: "Anna", entries: [{ month: "2020-01", amount: 300000 }] });
  });
});

describe("parseProfileFile rejects bad input", () => {
  it("rejects non-JSON", () => {
    expect("error" in parseProfileFile("{nope", cpi)).toBe(true);
  });
  it("rejects the wrong kind/version", () => {
    expect("error" in parseProfileFile(JSON.stringify({ v: 1, kind: "other", entries: [] }), cpi)).toBe(true);
    expect("error" in parseProfileFile(JSON.stringify({ v: 2, kind: "kaupmattur-profile", entries: [] }), cpi)).toBe(true);
  });
  it("rejects when nothing valid survives sanitizing", () => {
    const text = JSON.stringify({ v: 1, kind: "kaupmattur-profile", name: "X", entries: [{ month: "1900-01", amount: 5 }] });
    expect("error" in parseProfileFile(text, cpi)).toBe(true);
  });
  it("sanitizes out-of-range entries but keeps valid ones", () => {
    const text = JSON.stringify({ v: 1, kind: "kaupmattur-profile", name: "X", entries: [{ month: "2020-02", amount: 5 }, { month: "2099-01", amount: 9 }] });
    const r = parseProfileFile(text, cpi);
    expect(r).toEqual({ name: "X", entries: [{ month: "2020-02", amount: 5 }] });
  });
});

describe("safeFilename", () => {
  it("slugifies and appends .json", () => {
    expect(safeFilename("Anna mín")).toBe("Anna-mín.json");
  });
  it("falls back when empty after cleaning", () => {
    expect(safeFilename("!!!")).toBe("kaupmattur-profile.json");
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run tests/profileFile.test.ts` → FAIL.

- [ ] **Step 3: Implement** — Create `src/lib/profileFile.ts`:

```ts
import type { CpiData } from "./cpi";
import type { SalaryEvent } from "./inflation";
import { MAX_ENTRIES, sanitizeEntries } from "./profiles";

interface ProfileFile {
  v: 1;
  kind: "kaupmattur-profile";
  name: string;
  entries: SalaryEvent[];
}

export type ParseResult = { name: string; entries: SalaryEvent[] } | { error: string };

export function serializeProfile(name: string, entries: SalaryEvent[]): string {
  const file: ProfileFile = { v: 1, kind: "kaupmattur-profile", name, entries };
  return JSON.stringify(file, null, 1) + "\n";
}

export function parseProfileFile(text: string, cpi: CpiData): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { error: "Skráin er ekki gild JSON-skrá." };
  }
  if (typeof raw !== "object" || raw === null) return { error: "Skráin er ekki gild." };
  const r = raw as Partial<ProfileFile>;
  if (r.kind !== "kaupmattur-profile" || r.v !== 1 || !Array.isArray(r.entries)) {
    return { error: "Þetta er ekki gilt sniðsskjal." };
  }
  const entries = sanitizeEntries(r.entries as SalaryEvent[], cpi);
  if (entries.length === 0) return { error: "Engar gildar færslur fundust í skránni." };
  if (entries.length > MAX_ENTRIES) return { error: "Of margar færslur í skránni." };
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
```

- [ ] **Step 4: Run to verify pass** — `npx vitest run tests/profileFile.test.ts` → PASS.

- [ ] **Step 5: Commit**
```bash
git add src/lib/profileFile.ts tests/profileFile.test.ts
git commit -m "feat: profile file serialize/parse + safe download"
```

---

## Task 4: `presets.ts` (bundled minimum-wage preset) + test

**Files:** Create `src/data/presets.ts`, `tests/presets.test.ts`.

- [ ] **Step 1: Write the structural test** — Create `tests/presets.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { getCpi } from "../src/lib/cpi";
import { DEFAULT_PRESET_ID, sanitizeEntries } from "../src/lib/profiles";
import { PRESETS } from "../src/data/presets";

describe("PRESETS", () => {
  it("includes the default minimum-wage preset with a source", () => {
    const p = PRESETS.find((x) => x.id === DEFAULT_PRESET_ID);
    expect(p).toBeDefined();
    expect(p!.source.length).toBeGreaterThan(0);
    expect(p!.entries.length).toBeGreaterThan(1);
  });

  it("every preset entry is valid and in CPI range (sanitize is a no-op)", () => {
    const cpi = getCpi();
    for (const p of PRESETS) {
      expect(sanitizeEntries(p.entries, cpi)).toEqual(p.entries);
    }
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run tests/presets.test.ts` → FAIL (module missing).

- [ ] **Step 3: Implement** — Create `src/data/presets.ts`. **Source the real figures**: the entries below are Iceland's *lágmarkstekjur fyrir fullt starf* (minimum monthly income for full-time work, from the general SGS/ASÍ kjarasamningar). **Before committing, verify each month + amount against the cited ASÍ source and correct any that are off** — the test only checks shape/range, so accuracy is your sourcing responsibility. Each entry is the month a new rate took effect:

```ts
import type { Preset } from "../lib/profiles";

/**
 * Public, read-only example histories. Figures are sourced from the cited
 * authority and must be kept within the bundled CPI range (a test enforces it).
 */
export const PRESETS: Preset[] = [
  {
    id: "preset:lagmarkslaun",
    name: "Lágmarkslaun (fullt starf)",
    source:
      "Lágmarkstekjur fyrir fullt starf skv. kjarasamningum SGS/ASÍ — asi.is",
    entries: [
      { month: "2015-05", amount: 245000 },
      { month: "2016-05", amount: 260000 },
      { month: "2017-05", amount: 280000 },
      { month: "2018-05", amount: 300000 },
      { month: "2019-04", amount: 317000 },
      { month: "2020-04", amount: 335000 },
      { month: "2021-01", amount: 351000 },
      { month: "2022-04", amount: 368000 },
      { month: "2023-01", amount: 402235 },
      { month: "2024-02", amount: 425000 },
    ],
  },
];
```

- [ ] **Step 4: Run to verify pass** — `npx vitest run tests/presets.test.ts` → PASS. If any amount/month fails the range check or you corrected figures against the source, re-run until green.

- [ ] **Step 5: Commit**
```bash
git add src/data/presets.ts tests/presets.test.ts
git commit -m "feat: bundled Lágmarkslaun preset (sourced, in-range)"
```

---

## Task 5: rewrite `storage.ts` (IO + precedence)

**Files:** Modify `src/lib/storage.ts`.

- [ ] **Step 1: Replace the file** with:

```ts
import type { CpiData } from "./cpi";
import { type Store, loadStoreFrom } from "./profiles";

const V2_KEY = "kaupmattur-launa:v2";
const V1_KEY = "kaupmattur-launa:v1";

/**
 * Load the profile store. Precedence: valid v2 > migrate valid v1 > fresh.
 * After a successful v1 migration the old v1 key is removed so a stale old
 * bundle can't write a divergent copy that v2 would silently ignore.
 */
export function loadStore(cpi: CpiData): Store {
  let v2raw: string | null = null;
  let v1raw: string | null = null;
  try {
    v2raw = localStorage.getItem(V2_KEY);
    v1raw = localStorage.getItem(V1_KEY);
  } catch {
    /* storage blocked — fall through to fresh */
  }
  const { store, migrated } = loadStoreFrom(v2raw, v1raw, cpi);
  if (migrated) {
    try {
      localStorage.setItem(V2_KEY, JSON.stringify(store));
      localStorage.removeItem(V1_KEY);
    } catch {
      /* ignore */
    }
  }
  return store;
}

export function saveStore(store: Store): void {
  try {
    localStorage.setItem(V2_KEY, JSON.stringify(store));
  } catch {
    /* storage may be full or blocked; the app simply won't persist */
  }
}
```

- [ ] **Step 2: Verify** — `npx tsc --noEmit 2>&1 | grep -v "app.tsx"` should show no NEW errors here (app.tsx still imports the old `loadEntries`/`saveEntries` and will error until Task 10 — that's expected). Run `npx vitest run` → all pass.

- [ ] **Step 3: Commit**
```bash
git add src/lib/storage.ts
git commit -m "feat: storage v2 (loadStore/saveStore, v2-authoritative, drop v1)"
```

---

## Task 6: copy strings

**Files:** Modify `src/copy.ts`.

- [ ] **Step 1: Add a `profiles` block** inside the `copy` object (after the `payoff` block; byte-safe edit — verify existing Icelandic curly quotes are untouched):

```ts
  profiles: {
    yourProfiles: "Þín snið",
    presetsGroup: "Almenn snið",
    newProfile: "Nýtt snið",
    importFile: "Flytja inn skrá…",
    rename: "Endurnefna",
    exportFile: "Flytja út (skrá)",
    duplicate: "Afrita",
    delete: "Eyða",
    deleteConfirm: (name: string) => `Eyða sniðinu „${name}"? Þessu er ekki hægt að afturkalla.`,
    presetLockedBanner: (source: string) => `Almennt snið (læst) · heimild: ${source}`,
    forkCta: "Afrita og breyta",
    renameTitle: "Endurnefna snið",
    save: "Vista",
    cancel: "Hætta við",
    emptyState: "Skráðu fyrstu launin þín hér að neðan til að sjá kaupmáttinn.",
    importError: "Gat ekki lesið skrána.",
    limitReached: "Hámarksfjölda sniða náð.",
    switchLabel: "Veldu snið",
  },
```

- [ ] **Step 2: Verify** — `npx tsc --noEmit 2>&1 | grep -vE "app.tsx|ProfileBar.tsx|SalaryForm.tsx|PayoffCard.tsx"` → no new errors in copy.ts.

- [ ] **Step 3: Commit**
```bash
git add src/copy.ts
git commit -m "feat: profile copy strings"
```

---

## Task 7: PayoffCard — drop example props

**Files:** Modify `src/components/PayoffCard.tsx`.

- [ ] **Step 1: Remove `isExample`/`onTryOwn`.** Change the props interface from:
```tsx
interface PayoffCardProps {
  events: SalaryEvent[];
  cpi: CpiData;
  onTryOwn?: () => void;
  isExample?: boolean;
}
```
to:
```tsx
interface PayoffCardProps {
  events: SalaryEvent[];
  cpi: CpiData;
}
```
Update the function signature `export function PayoffCard({ events, cpi, onTryOwn, isExample }: PayoffCardProps)` → `export function PayoffCard({ events, cpi }: PayoffCardProps)`. And delete the CTA block at the end of the non-atPeak return:
```tsx
      {isExample && onTryOwn && (
        <button type="button" class="payoff-cta" onClick={onTryOwn}>
          {copy.payoff.cta}
        </button>
      )}
```
(remove those lines entirely).

- [ ] **Step 2: Verify** — `npx tsc --noEmit 2>&1 | grep -vE "app.tsx|ProfileBar.tsx|SalaryForm.tsx"` → no PayoffCard errors. (`copy.payoff.cta` may now be unused — leave it; harmless.)

- [ ] **Step 3: Commit**
```bash
git add src/components/PayoffCard.tsx
git commit -m "refactor: drop example CTA from PayoffCard"
```

---

## Task 8: SalaryForm — read-only preset + empty state

**Files:** Modify `src/components/SalaryForm.tsx`.

- [ ] **Step 1: Change `SalaryFormProps`.** Replace:
```tsx
interface SalaryFormProps {
  rows: DraftRow[];
  errors: Map<string, string>;
  cpi: CpiData;
  isExample: boolean;
  onChangeRow: (id: string, patch: Partial<Omit<DraftRow, "id">>) => void;
  onAddRow: () => void;
  onRemoveRow: (id: string) => void;
  onClearExample: () => void;
  onAiApply: (events: SalaryEvent[]) => void;
}
```
with:
```tsx
interface SalaryFormProps {
  rows: DraftRow[];
  errors: Map<string, string>;
  cpi: CpiData;
  readOnly: boolean;
  presetSource?: string;
  onChangeRow: (id: string, patch: Partial<Omit<DraftRow, "id">>) => void;
  onAddRow: () => void;
  onRemoveRow: (id: string) => void;
  onFork: () => void;
  onAiApply: (events: SalaryEvent[]) => void;
}
```

- [ ] **Step 2: Replace the example banner + AI gating + entry list rendering.** In the returned JSX, replace the existing `{props.isExample && ( <div class="example-banner"> … </div> )}` block with the preset banner:
```tsx
      {props.readOnly && (
        <div class="preset-banner">
          <span>{copy.profiles.presetLockedBanner(props.presetSource ?? "")}</span>
          <button type="button" class="example-cta" onClick={props.onFork}>
            {copy.profiles.forkCta}
          </button>
        </div>
      )}
```
Find the availability `useEffect` that sets `aiReady` and change the render guard so AI only shows for an editable profile — replace `{aiReady && (` with `{aiReady && !props.readOnly && (`.
After the `<div class="entry-list">…</div>` and the add-row button, add an empty-state when editable with no usable rows. Wrap the existing add-row button so it's hidden when read-only, and add the empty hint. Specifically, change the add-row button to:
```tsx
      {!props.readOnly && (
        <button type="button" class="add-row" onClick={props.onAddRow}>
          <span aria-hidden="true">+</span> {f.addButton}
        </button>
      )}
      {!props.readOnly && props.rows.every((r) => r.amountText.trim() === "") && (
        <p class="form-empty">{copy.profiles.emptyState}</p>
      )}
```
Disable inputs when read-only: in `MonthPicker` the selects and in the amount `<input>`, add `disabled={...}`. The simplest robust approach — pass `readOnly` down: add `disabled={props.readOnly}` to the amount `<input>` and to both `<select>`s. Since `MonthPicker` is a separate component, add a `disabled?: boolean` prop to `MonthPickerProps` and the two `<select>`s (`disabled={disabled}`), and pass `disabled={props.readOnly}` where `MonthPicker` is used in the entry list. Also hide the remove-row button when read-only: change `{props.rows.length > 1 && (` to `{!props.readOnly && props.rows.length > 1 && (`.

- [ ] **Step 3: Verify** — `npx tsc --noEmit 2>&1 | grep -vE "app.tsx|ProfileBar.tsx"` → no SalaryForm errors. Run `npx vitest run` → pass.

- [ ] **Step 4: Commit**
```bash
git add src/components/SalaryForm.tsx
git commit -m "feat: SalaryForm read-only preset banner + fork + empty state"
```

---

## Task 9: ProfileBar component

**Files:** Create `src/components/ProfileBar.tsx`.

- [ ] **Step 1: Implement** — Create `src/components/ProfileBar.tsx`:

```tsx
import { useRef, useState } from "preact/hooks";
import { copy } from "../copy";
import type { Preset, Store } from "../lib/profiles";

interface ProfileBarProps {
  store: Store;
  presets: Preset[];
  activeId: string;
  activeName: string;
  isPreset: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (name: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onExport: () => void;
  onImportFile: (file: File) => void;
}

export function ProfileBar(props: ProfileBarProps) {
  const c = copy.profiles;
  const [list, setList] = useState(false);
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const close = () => {
    setList(false);
    setMenu(false);
  };

  return (
    <div class="profile-bar">
      <div class="profile-pick">
        <button
          type="button"
          class="profile-name"
          aria-haspopup="listbox"
          aria-expanded={list}
          onClick={() => {
            setList((v) => !v);
            setMenu(false);
          }}
        >
          {props.activeName} <span aria-hidden="true">▾</span>
        </button>
        <button type="button" class="profile-new" aria-label={c.newProfile} onClick={() => { close(); props.onNew(); }}>
          ＋
        </button>
        <button
          type="button"
          class="profile-menu-btn"
          aria-haspopup="menu"
          aria-expanded={menu}
          aria-label="…"
          onClick={() => {
            setMenu((v) => !v);
            setList(false);
          }}
        >
          ⋯
        </button>
      </div>

      {list && (
        <ul class="profile-list" role="listbox" aria-label={c.switchLabel}>
          <li class="profile-group">{c.yourProfiles}</li>
          {props.store.profiles.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                role="option"
                aria-selected={p.id === props.activeId}
                class={`profile-item${p.id === props.activeId ? " is-on" : ""}`}
                onClick={() => { close(); props.onSelect(p.id); }}
              >
                <span class="check" aria-hidden="true">{p.id === props.activeId ? "✓" : ""}</span>
                {p.name}
              </button>
            </li>
          ))}
          <li class="profile-group">{c.presetsGroup}</li>
          {props.presets.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                role="option"
                aria-selected={p.id === props.activeId}
                class={`profile-item is-preset${p.id === props.activeId ? " is-on" : ""}`}
                onClick={() => { close(); props.onSelect(p.id); }}
              >
                <span class="check" aria-hidden="true">{p.id === props.activeId ? "✓" : "🔒"}</span>
                {p.name}
                <span class="profile-src">{p.source}</span>
              </button>
            </li>
          ))}
          <li>
            <button type="button" class="profile-item is-action" onClick={() => { close(); props.onNew(); }}>
              ＋ {c.newProfile}
            </button>
          </li>
          <li>
            <button type="button" class="profile-item is-action" onClick={() => { close(); fileRef.current?.click(); }}>
              ↥ {c.importFile}
            </button>
          </li>
        </ul>
      )}

      {menu && (
        <ul class="profile-menu" role="menu">
          {!props.isPreset && (
            <li>
              <button type="button" role="menuitem" class="profile-item" onClick={() => { setMenu(false); setRenaming(props.activeName); }}>
                ✎ {c.rename}
              </button>
            </li>
          )}
          <li>
            <button type="button" role="menuitem" class="profile-item" onClick={() => { setMenu(false); props.onExport(); }}>
              ↧ {c.exportFile}
            </button>
          </li>
          {!props.isPreset && (
            <li>
              <button type="button" role="menuitem" class="profile-item" onClick={() => { setMenu(false); props.onDuplicate(); }}>
                ⎘ {c.duplicate}
              </button>
            </li>
          )}
          {!props.isPreset && (
            <li>
              <button type="button" role="menuitem" class="profile-item is-danger" onClick={() => { setMenu(false); setConfirmDelete(true); }}>
                🗑 {c.delete}
              </button>
            </li>
          )}
        </ul>
      )}

      {renaming !== null && (
        <div class="profile-dialog" role="dialog" aria-label={c.renameTitle}>
          <input
            class="profile-rename-input"
            type="text"
            value={renaming}
            maxLength={60}
            autocomplete="off"
            onInput={(e) => setRenaming(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { props.onRename(renaming); setRenaming(null); }
              if (e.key === "Escape") setRenaming(null);
            }}
          />
          <div class="profile-dialog-actions">
            <button type="button" class="ai-primary" onClick={() => { props.onRename(renaming); setRenaming(null); }}>{c.save}</button>
            <button type="button" class="ai-ghost" onClick={() => setRenaming(null)}>{c.cancel}</button>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div class="profile-dialog" role="alertdialog" aria-label={c.delete}>
          <p>{c.deleteConfirm(props.activeName)}</p>
          <div class="profile-dialog-actions">
            <button type="button" class="profile-delete-confirm" onClick={() => { setConfirmDelete(false); props.onDelete(); }}>{c.delete}</button>
            <button type="button" class="ai-ghost" onClick={() => setConfirmDelete(false)}>{c.cancel}</button>
          </div>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        class="profile-file-input"
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          e.currentTarget.value = "";
          if (file) props.onImportFile(file);
        }}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify** — `npx tsc --noEmit 2>&1 | grep -v "app.tsx"` → no ProfileBar errors (app.tsx still errors until Task 10).

- [ ] **Step 3: Commit**
```bash
git add src/components/ProfileBar.tsx
git commit -m "feat: ProfileBar (switch list, new, menu, rename/delete dialogs, import)"
```

---

## Task 10: app.tsx — wire the store

**Files:** Modify `src/app.tsx` (full rewrite).

- [ ] **Step 1: Replace the entire file** with:

```tsx
import { useEffect, useMemo, useState } from "preact/hooks";
import { Hero } from "./components/Hero";
import { PayoffCard } from "./components/PayoffCard";
import { Methodology } from "./components/Methodology";
import { ProfileBar } from "./components/ProfileBar";
import { SalaryForm, analyzeRows, type DraftRow } from "./components/SalaryForm";
import { SummaryCards } from "./components/SummaryCards";
import { Chart } from "./components/Chart";
import { getCpi } from "./lib/cpi";
import type { SalaryEvent } from "./lib/inflation";
import { formatISK } from "./lib/format";
import { loadStore, saveStore } from "./lib/storage";
import {
  type Store,
  addProfile,
  createProfile,
  deleteProfile,
  duplicateProfile,
  forkPreset,
  newId,
  renameProfile,
  resolveActive,
  setActive,
  updateEntries,
} from "./lib/profiles";
import { PRESETS } from "./data/presets";
import {
  MAX_IMPORT_BYTES,
  downloadJson,
  parseProfileFile,
  safeFilename,
  serializeProfile,
} from "./lib/profileFile";

function entriesToRows(entries: SalaryEvent[]): DraftRow[] {
  return entries.map((e) => ({
    id: newId(),
    month: e.month,
    amountText: formatISK(e.amount).replace(" kr.", ""),
  }));
}

export function App() {
  const cpi = getCpi();
  const [store, setStore] = useState<Store>(() => loadStore(cpi));

  const active = useMemo(() => resolveActive(store, PRESETS, cpi), [store, cpi]);

  // Persist a corrected active id (stale/unknown) before any mutation.
  useEffect(() => {
    if (active.resolvedId !== store.activeId) {
      setStore((s) => {
        const next = setActive(s, active.resolvedId);
        saveStore(next);
        return next;
      });
    }
  }, [active.resolvedId, store.activeId]);

  // Editable form rows, rematerialized (fresh ids) whenever the active profile changes.
  const [rows, setRows] = useState<DraftRow[]>(() => entriesToRows(active.entries));
  useEffect(() => {
    setRows(entriesToRows(active.entries));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active.resolvedId]);

  const { events, errors } = useMemo(() => analyzeRows(rows), [rows]);

  // Autosave the editable profile only (presets are read-only).
  useEffect(() => {
    if (active.readOnly) return;
    setStore((s) => {
      const next = updateEntries(s, active.resolvedId, events);
      saveStore(next);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, active.readOnly, active.resolvedId]);

  const commit = (next: Store) => {
    saveStore(next);
    setStore(next);
  };

  const changeRow = (id: string, patch: Partial<Omit<DraftRow, "id">>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const addRow = () =>
    setRows((rs) => [...rs, { id: newId(), month: cpi.lastMonth, amountText: "" }]);
  const removeRow = (id: string) => setRows((rs) => rs.filter((r) => r.id !== id));
  const replaceRows = (evts: SalaryEvent[]) =>
    setRows(
      evts.length > 0
        ? entriesToRows(evts)
        : [{ id: newId(), month: cpi.lastMonth, amountText: "" }],
    );

  const onNew = () => commit(createProfile(store).store);
  const onSelect = (id: string) => commit(setActive(store, id));
  const onRename = (name: string) => commit(renameProfile(store, active.resolvedId, name));
  const onDuplicate = () => commit(duplicateProfile(store, active.resolvedId));
  const onDelete = () => commit(deleteProfile(store, active.resolvedId));
  const onFork = () => {
    const preset = PRESETS.find((p) => p.id === active.resolvedId);
    if (preset) commit(forkPreset(store, preset, cpi));
  };
  const onExport = () =>
    downloadJson(safeFilename(active.name), serializeProfile(active.name, events));
  const onImportFile = (file: File) => {
    if (file.size > MAX_IMPORT_BYTES) {
      window.alert(copyImportError());
      return;
    }
    file.text().then((text) => {
      const result = parseProfileFile(text, cpi);
      if ("error" in result) {
        window.alert(result.error);
        return;
      }
      const added = addProfile(store, result.name, result.entries, cpi);
      if ("error" in added) {
        window.alert(copyLimit());
        return;
      }
      commit(added.store);
    });
  };

  return (
    <>
      <div class="aurora" aria-hidden="true" />
      <main class="page">
        <Hero />
        <ProfileBar
          store={store}
          presets={PRESETS}
          activeId={active.resolvedId}
          activeName={active.name}
          isPreset={active.kind === "preset"}
          onSelect={onSelect}
          onNew={onNew}
          onRename={onRename}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
          onExport={onExport}
          onImportFile={onImportFile}
        />
        <PayoffCard events={events} cpi={cpi} />
        <SalaryForm
          rows={rows}
          errors={errors}
          cpi={cpi}
          readOnly={active.readOnly}
          presetSource={active.source}
          onChangeRow={changeRow}
          onAddRow={addRow}
          onRemoveRow={removeRow}
          onFork={onFork}
          onAiApply={replaceRows}
        />
        <Chart events={events} cpi={cpi} />
        <SummaryCards events={events} cpi={cpi} />
        <Methodology />
      </main>
    </>
  );
}

function copyImportError(): string {
  return "Skráin er of stór.";
}
function copyLimit(): string {
  return "Hámarksfjölda sniða náð.";
}
```

(The two tiny helpers keep the alert strings out of JSX; they could also live in `copy.profiles` — keep here for v1.)

- [ ] **Step 2: Verify** — `npx tsc --noEmit && npx vitest run && npm run build` → all green. The old `loadEntries`/`saveEntries`/`isExample`/`EXAMPLE_ROWS` are gone; the ProfileBar is wired; AI apply only mutates the editable rows.

- [ ] **Step 3: Manual smoke** — `npm run dev`; the page should load the **Lágmarkslaun** preset read-only on a fresh browser (clear localStorage first), with a profile bar above the form, ＋ Nýtt, and the ⋯ menu.

- [ ] **Step 4: Commit**
```bash
git add src/app.tsx
git commit -m "feat: profile-aware app (store, resolve+persist, autosave, fork, import/export)"
```

---

## Task 11: styles

**Files:** Modify `src/styles.css`.

- [ ] **Step 1: Append** to the end of `src/styles.css` (reuses tokens):

```css
/* ---------- Profiles ---------- */
.profile-bar { position: relative; margin-bottom: 1.25rem; }
.profile-pick { display: flex; align-items: center; gap: 0.5rem; }
.profile-name {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 44px;
  font: inherit;
  font-weight: 700;
  color: var(--ink);
  background: var(--paper-raised);
  border: 1px solid var(--line);
  border-radius: var(--radius-s);
  padding: 0.5rem 0.875rem;
  cursor: pointer;
}
.profile-new, .profile-menu-btn {
  width: 44px;
  height: 44px;
  flex: none;
  display: grid;
  place-items: center;
  font: inherit;
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--paper-raised);
  background: var(--ink);
  border: 1px solid var(--ink);
  border-radius: var(--radius-s);
  cursor: pointer;
}
.profile-menu-btn { color: var(--ink-soft); background: var(--paper-raised); border-color: var(--line); }
.profile-name:focus-visible, .profile-new:focus-visible, .profile-menu-btn:focus-visible,
.profile-item:focus-visible { outline: 2px solid var(--glacier); outline-offset: 2px; }

.profile-list, .profile-menu {
  list-style: none;
  margin: 0.4rem 0 0;
  padding: 0.3rem;
  position: absolute;
  z-index: 5;
  left: 0;
  right: 0;
  background: var(--paper-raised);
  border: 1px solid var(--line);
  border-radius: var(--radius-m);
  box-shadow: var(--shadow-lift);
  max-height: 60vh;
  overflow: auto;
}
.profile-menu { right: 0; left: auto; min-width: 12rem; }
.profile-group {
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-faint);
  padding: 0.5rem 0.625rem 0.25rem;
}
.profile-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  text-align: left;
  font: inherit;
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--ink);
  background: transparent;
  border: none;
  border-radius: var(--radius-s);
  padding: 0.55rem 0.625rem;
  cursor: pointer;
}
.profile-item:hover { background: var(--paper); }
.profile-item.is-on { color: var(--glacier-deep); }
.profile-item .check { width: 1.1rem; text-align: center; color: var(--glacier-deep); }
.profile-item.is-preset .profile-src { margin-left: auto; font-size: 0.7rem; color: var(--ink-faint); font-weight: 600; }
.profile-item.is-action { color: var(--glacier-deep); font-weight: 700; }
.profile-item.is-danger { color: var(--coral-deep); }

.profile-dialog {
  margin-top: 0.5rem;
  padding: 0.875rem;
  background: var(--paper-raised);
  border: 1px solid var(--line);
  border-radius: var(--radius-m);
  box-shadow: var(--shadow-soft);
}
.profile-dialog p { margin: 0 0 0.75rem; }
.profile-rename-input {
  width: 100%;
  font: inherit;
  color: var(--ink);
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: var(--radius-s);
  padding: 0.625rem 0.75rem;
  margin-bottom: 0.625rem;
}
.profile-rename-input:focus-visible { outline: 2px solid var(--glacier); outline-offset: 1px; }
.profile-dialog-actions { display: flex; gap: 0.625rem; }
.profile-delete-confirm {
  min-height: 44px;
  padding: 0.5rem 1.25rem;
  font: inherit;
  font-weight: 700;
  color: #fff;
  background: var(--coral-deep);
  border: none;
  border-radius: 999px;
  cursor: pointer;
}
.profile-file-input { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }

.preset-banner {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.625rem 0.875rem;
  font-size: 0.9375rem;
  color: var(--ink-soft);
  background: var(--glacier-wash);
  border: 1px solid color-mix(in srgb, var(--glacier) 18%, transparent);
  border-radius: var(--radius-m);
  padding: 0.75rem 1rem;
  margin-bottom: 1.25rem;
}
.preset-banner .example-cta { margin-left: auto; }
.form-empty { margin: 1rem 0 0; font-size: 0.9375rem; color: var(--ink-faint); }
```

- [ ] **Step 2: Verify** — `npm run build` → succeeds.

- [ ] **Step 3: Commit**
```bash
git add src/styles.css
git commit -m "style: profile bar, switch list, menu, dialogs, preset banner"
```

---

## Task 12: docs

**Files:** Modify `README.md`.

- [ ] **Step 1: Add a "Profiles" subsection** under the Privacy section:

```markdown
## Profiles

Salary histories are saved as named **profiles** in `localStorage` — switch,
create a new blank one, rename, delete, duplicate, or **export/import** a profile
as a small `.json` file (all local; no network). A bundled, read-only **preset**
(Icelandic minimum wage, cited) is available to explore; editing it forks an
editable copy. Storage migrates the old single-slot format to the multi-profile
store automatically. Code: `src/lib/profiles.ts`, `src/lib/storage.ts`,
`src/lib/profileFile.ts`, `src/components/ProfileBar.tsx`.
```

- [ ] **Step 2: Commit**
```bash
git add README.md
git commit -m "docs: document profiles + presets"
```

---

## Task 13: Playwright verification (manual, throwaway)

- [ ] **Step 1:** `npm run dev -- --port 5195`. Using the Playwright browser, exercise:
  1. **Fresh load** (clear localStorage): the **Lágmarkslaun** preset is active and read-only; the form is disabled; the **Afrita og breyta** banner shows; PayoffCard/Chart render the preset's decline.
  2. **Fork:** click **Afrita og breyta** → a "Lágmarkslaun (afrit)" editable profile becomes active; inputs enabled.
  3. **＋ Nýtt:** new blank "Nýtt snið" → empty state shows; payoff/chart hidden until entries added.
  4. **Switch:** add entries to one profile, switch to another, switch back — entries persist per profile; rows have fresh ids (no cross-profile bleed).
  5. **AI gating:** while a preset is active, the "Fylla út með AI" button is NOT rendered (seed `window.LanguageModel` mock + preset active).
  6. **Export/Import:** export a profile (download), import it back → appears as a new profile (collision suffix), becomes active.
  7. **Delete:** delete the active profile → falls back to another profile (or preset).
  8. **Migration:** pre-seed `localStorage["kaupmattur-launa:v1"] = {v:1,entries:[…]}`, reload → "Mín laun" profile created active; `:v1` key removed; `:v2` present.

- [ ] **Step 2:** No commit (verification only). Fix any component/wiring issue found and re-run.

---

## Self-review notes (reconciled)
- **Spec coverage:** sanitize/migrate/validate/resolve (T1), mutations + import add (T2), file serialize/parse + download (T3), bundled preset + range test (T4), storage precedence + drop-v1 (T5), copy (T6), PayoffCard prop removal (T7), SalaryForm read-only/empty/AI-gate (T8), ProfileBar (T9), app store wiring + resolve-persist + rebuild-rows-on-switch + autosave + fork + import/export (T10), styles (T11), docs (T12), verification incl. AI-blocked-while-preset + migration (T13). Codex's Criticals (v2/v1 precedence + drop v1, CPI-range sanitize everywhere, read-only gates AI) are all tasked.
- **Type consistency:** `Store`/`Profile`/`Preset`/`ActiveResolved`, `sanitizeEntries`, `resolveActive`, `loadStoreFrom`, and every mutation signature are defined in T1/T2 and used identically in T3/T5/T10; `SalaryForm` props (`readOnly`/`presetSource`/`onFork`) and `PayoffCard` (no example props) match T10's call sites.
- **No placeholders:** every code step is complete. The one sourcing caveat (preset figures) is an explicit verify-against-source instruction with a structural test, not a code placeholder.
```
