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
    const kinds = new Set(["minimum", "survey"]);
    for (const p of PRESETS) {
      expect(kinds.has(p.kind)).toBe(true);
    }
  });

  it("every flavor has non-empty badge and banner copy", () => {
    const kinds: Array<"minimum" | "survey"> = ["minimum", "survey"];
    for (const k of kinds) {
      const c = copy.profiles.presetKinds[k];
      expect(c).toBeDefined();
      expect(c.badge.length).toBeGreaterThan(0);
      expect(c.banner.length).toBeGreaterThan(0);
    }
  });
});
