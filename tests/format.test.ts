import { describe, expect, it } from "vitest";
import {
  formatCompactISK,
  formatDateLong,
  formatISK,
  formatISKDelta,
  formatMonth,
  formatMonthShort,
  formatPercent,
  parseAmount,
} from "../src/lib/format";

describe("formatISK", () => {
  it("groups with dots and appends kr.", () => {
    expect(formatISK(1_000_000)).toBe("1.000.000 kr.");
    expect(formatISK(928_686.4)).toBe("928.686 kr.");
    expect(formatISK(0)).toBe("0 kr.");
  });
});

describe("formatISKDelta", () => {
  it("signs deltas with a proper minus", () => {
    expect(formatISKDelta(-71_300)).toBe("−71.300 kr.");
    expect(formatISKDelta(5_000)).toBe("+5.000 kr.");
    expect(formatISKDelta(0)).toBe("0 kr.");
  });
});

describe("formatMonth", () => {
  it("renders Icelandic month names", () => {
    expect(formatMonth("2025-01")).toBe("janúar 2025");
    expect(formatMonth("2026-05")).toBe("maí 2026");
    expect(formatMonthShort("2025-01")).toBe("jan. 2025");
  });

  it("formats full dates in Icelandic", () => {
    expect(formatDateLong("2026-06-12T10:30:00Z")).toBe("12. júní 2026");
  });
});

describe("formatPercent", () => {
  it("uses comma decimals and a proper minus", () => {
    expect(formatPercent(-0.071)).toBe("−7,1%");
    expect(formatPercent(0.123)).toBe("12,3%");
  });
});

describe("formatCompactISK", () => {
  it("scales units for axis ticks", () => {
    expect(formatCompactISK(950)).toBe("950 kr.");
    expect(formatCompactISK(950_000)).toBe("950 þús.");
    expect(formatCompactISK(1_200_000)).toBe("1,2 m.kr.");
    expect(formatCompactISK(2_000_000)).toBe("2 m.kr.");
  });
});

describe("parseAmount", () => {
  it("accepts plain and grouped digits", () => {
    expect(parseAmount("800000")).toBe(800_000);
    expect(parseAmount("1.000.000")).toBe(1_000_000);
    expect(parseAmount("1 000 000")).toBe(1_000_000);
    expect(parseAmount(" 750.000 kr. ")).toBe(750_000);
  });

  it("rejects junk, negatives, decimals and zero", () => {
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("abc")).toBeNull();
    expect(parseAmount("-500")).toBeNull();
    expect(parseAmount("1,5")).toBeNull();
    expect(parseAmount("0")).toBeNull();
    expect(parseAmount("1.00.000")).toBeNull();
  });
});
