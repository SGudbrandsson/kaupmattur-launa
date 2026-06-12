import { describe, expect, it } from "vitest";
import { getCpi, type CpiData } from "../src/lib/cpi";
import {
  buildSeries,
  cumulativeInflation,
  realValue,
  requiredToday,
} from "../src/lib/inflation";

/** Hand-computable fixture: prices double over four months. */
const synthetic: CpiData = {
  source: "test",
  fetchedAt: "2026-01-01T00:00:00Z",
  firstMonth: "2025-01",
  lastMonth: "2025-05",
  values: {
    "2025-01": 100,
    "2025-02": 110,
    "2025-03": 125,
    "2025-04": 160,
    "2025-05": 200,
  },
};

describe("realValue", () => {
  it("halves purchasing power when prices double", () => {
    expect(realValue(1000, "2025-01", "2025-05", synthetic)).toBe(500);
  });

  it("is the identity for the same month", () => {
    expect(realValue(1000, "2025-03", "2025-03", synthetic)).toBe(1000);
  });

  it("matches the validated real-data anchor: 1M kr from jan 2025", () => {
    // CPI 2025-01 = 635.5, 2026-05 = 684.3 -> ~928,686 kr.
    const real = realValue(1_000_000, "2025-01", "2026-05", getCpi());
    expect(real).toBeCloseTo((1_000_000 * 635.5) / 684.3, 6);
    expect(Math.round(real)).toBe(928_686);
  });

  it("throws on a month outside the dataset", () => {
    expect(() => realValue(1000, "2024-12", "2025-05", synthetic)).toThrow(
      /No CPI value/,
    );
  });
});

describe("cumulativeInflation and requiredToday", () => {
  it("computes total price increase", () => {
    expect(cumulativeInflation("2025-01", "2025-05", synthetic)).toBe(1);
    expect(cumulativeInflation("2025-02", "2025-04", synthetic)).toBeCloseTo(
      160 / 110 - 1,
      12,
    );
  });

  it("requiredToday inverts realValue at lastMonth", () => {
    const amount = 800_000;
    const required = requiredToday(amount, "2025-01", synthetic);
    expect(required).toBe(1_600_000);
    // Keeping up with inflation means the required salary's purchasing
    // power today equals the original amount in its own start month.
    expect(realValue(required, "2025-05", "2025-05", synthetic)).toBe(required);
    expect(amount * (1 + cumulativeInflation("2025-01", "2025-05", synthetic))).toBe(
      required,
    );
  });
});

describe("buildSeries", () => {
  it("returns an empty series for no events", () => {
    expect(buildSeries([], synthetic)).toEqual([]);
  });

  it("spans from the first event through lastMonth, in order", () => {
    const series = buildSeries([{ month: "2025-02", amount: 1000 }], synthetic);
    expect(series.map((p) => p.month)).toEqual([
      "2025-02",
      "2025-03",
      "2025-04",
      "2025-05",
    ]);
    expect(series[0].real).toBe(1000);
    expect(series.at(-1)!.real).toBeCloseTo((1000 * 110) / 200, 12);
  });

  it("switches baseline exactly at each raise and resets the real line", () => {
    const series = buildSeries(
      [
        { month: "2025-01", amount: 1000 },
        { month: "2025-04", amount: 2000 },
      ],
      synthetic,
    );
    const byMonth = Object.fromEntries(series.map((p) => [p.month, p]));
    // Just before the raise: still decaying against the 2025-01 baseline.
    expect(byMonth["2025-03"].baselineMonth).toBe("2025-01");
    expect(byMonth["2025-03"].nominal).toBe(1000);
    expect(byMonth["2025-03"].real).toBeCloseTo(1000 * (100 / 125), 12);
    // At the raise: real resets to the new nominal.
    expect(byMonth["2025-04"].baselineMonth).toBe("2025-04");
    expect(byMonth["2025-04"].nominal).toBe(2000);
    expect(byMonth["2025-04"].real).toBe(2000);
    // After the raise: decays against the new baseline.
    expect(byMonth["2025-05"].real).toBeCloseTo(2000 * (160 / 200), 12);
  });

  it("handles an event in lastMonth itself: single point, real == nominal", () => {
    const series = buildSeries([{ month: "2025-05", amount: 900 }], synthetic);
    expect(series).toEqual([
      { month: "2025-05", nominal: 900, real: 900, baselineMonth: "2025-05" },
    ]);
  });

  it("sorts unsorted events", () => {
    const series = buildSeries(
      [
        { month: "2025-04", amount: 2000 },
        { month: "2025-02", amount: 1000 },
      ],
      synthetic,
    );
    expect(series[0]).toMatchObject({ month: "2025-02", nominal: 1000 });
    expect(series.at(-1)!).toMatchObject({ month: "2025-05", nominal: 2000 });
  });
});
