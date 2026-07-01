import { describe, it, expect } from "vitest";
import { getCpi } from "../src/lib/cpi";
import { DEFAULT_PRESET_ID, sanitizeEntries } from "../src/lib/profiles";
import { PRESETS } from "../src/data/presets";
import { copy } from "../src/copy";

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

  it("every preset declares a valid kind", () => {
    const kinds = new Set(["minimum", "taxi", "survey"]);
    for (const p of PRESETS) {
      expect(kinds.has(p.kind)).toBe(true);
    }
  });

  it("every kind used by a preset has non-empty badge and banner copy", () => {
    for (const p of PRESETS) {
      const k = copy.profiles.presetKinds[p.kind];
      expect(k).toBeDefined();
      expect(k.badge.length).toBeGreaterThan(0);
      expect(k.banner.length).toBeGreaterThan(0);
    }
  });
});
