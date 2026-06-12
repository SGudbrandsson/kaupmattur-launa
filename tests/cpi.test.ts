import { describe, expect, it } from "vitest";
import {
  addMonths,
  compareMonths,
  getCpi,
  monthRange,
} from "../src/lib/cpi";

describe("month helpers", () => {
  it("addMonths crosses year boundaries both ways", () => {
    expect(addMonths("2025-12", 1)).toBe("2026-01");
    expect(addMonths("2025-01", -1)).toBe("2024-12");
    expect(addMonths("2025-06", 18)).toBe("2026-12");
    expect(addMonths("2025-06", 0)).toBe("2025-06");
  });

  it("compareMonths orders correctly", () => {
    expect(compareMonths("2025-01", "2025-02")).toBeLessThan(0);
    expect(compareMonths("2026-01", "2025-12")).toBeGreaterThan(0);
    expect(compareMonths("2025-05", "2025-05")).toBe(0);
  });

  it("monthRange is inclusive and handles empty ranges", () => {
    expect(monthRange("2025-11", "2026-02")).toEqual([
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
    ]);
    expect(monthRange("2025-05", "2025-05")).toEqual(["2025-05"]);
    expect(monthRange("2025-06", "2025-05")).toEqual([]);
  });
});

describe("bundled CPI dataset", () => {
  const cpi = getCpi();

  it("declares first/last months that match the data", () => {
    const months = Object.keys(cpi.values).sort();
    expect(cpi.firstMonth).toBe("1988-05");
    expect(months[0]).toBe(cpi.firstMonth);
    expect(months.at(-1)!).toBe(cpi.lastMonth);
  });

  it("is contiguous with positive values throughout", () => {
    const months = monthRange(cpi.firstMonth, cpi.lastMonth);
    expect(Object.keys(cpi.values).length).toBe(months.length);
    for (const m of months) {
      expect(cpi.values[m], `missing or invalid ${m}`).toBeGreaterThan(0);
    }
  });

  it("starts at the 1988 base of 100", () => {
    expect(cpi.values["1988-05"]).toBe(100);
  });
});
