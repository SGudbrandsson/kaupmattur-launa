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
  addProfile,
  createProfile,
  deleteProfile,
  duplicateProfile,
  forkPreset,
  renameProfile,
  setActive,
  updateEntries,
} from "../src/lib/profiles";

const cpi: CpiData = {
  source: "t", fetchedAt: "x", firstMonth: "2020-01", lastMonth: "2020-04",
  values: { "2020-01": 100, "2020-02": 110, "2020-03": 120, "2020-04": 130 },
};
const preset: Preset = {
  id: DEFAULT_PRESET_ID, name: "Lágmarkslaun", source: "ASÍ", kind: "minimum",
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
        { month: "2019-12", amount: 1 },
        { month: "2020-05", amount: 1 },
        { month: "bad", amount: 1 } as never,
        { month: "2020-02", amount: -5 },
        { month: "2020-01", amount: 1 },
        { month: "2020-01", amount: 2 },
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
        { id: "preset:lagmarkslaun", name: "A", entries: [] },
        { id: "dup", name: "B", entries: [] },
        { id: "dup", name: "C", entries: [] },
      ],
    };
    const s = validateStore(raw, cpi)!;
    expect(s.profiles.every((p) => !p.id.startsWith("preset:"))).toBe(true);
    expect(new Set(s.profiles.map((p) => p.id)).size).toBe(3);
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

  it("resolveActive surfaces the preset flavor as presetKind", () => {
    const surveyPreset: Preset = {
      id: "preset:test", name: "Test", source: "src", kind: "survey",
      entries: [{ month: cpi.firstMonth, amount: 500000 }],
    };
    const store = { v: 2 as const, activeId: "preset:test", profiles: [] };
    const active = resolveActive(store, [surveyPreset], cpi);
    expect(active.kind).toBe("preset");
    expect(active.presetKind).toBe("survey");
  });
});

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
    const s = forkPreset(base(), { id: DEFAULT_PRESET_ID, name: "Lágmarkslaun", source: "ASÍ", kind: "minimum", entries: [{ month: "2020-01", amount: 300000 }, { month: "2099-01", amount: 1 }] }, cpi);
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
