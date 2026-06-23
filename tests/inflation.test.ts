import { describe, expect, it } from "vitest";
import { getCpi, type CpiData } from "../src/lib/cpi";
import {
  analyzePurchasingPower,
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
    expect(series[0].comparison).toBe(1000);
    expect(series.at(-1)!.comparison).toBeCloseTo((1000 * 110) / 200, 12);
  });

  it("keeps one continuous anchor: raises are measured in first-month kronur", () => {
    const series = buildSeries(
      [
        { month: "2025-01", amount: 1000 },
        { month: "2025-04", amount: 2000 },
      ],
      synthetic,
    );
    const byMonth = Object.fromEntries(series.map((p) => [p.month, p]));
    // Before the raise: decaying against the 2025-01 anchor.
    expect(byMonth["2025-03"].eventMonth).toBe("2025-01");
    expect(byMonth["2025-03"].nominal).toBe(1000);
    expect(byMonth["2025-03"].comparison).toBeCloseTo(1000 * (100 / 125), 12);
    // At the raise: the new nominal is still expressed in anchor kronur,
    // NOT reset to face value — 2000 buys what 1250 bought in January.
    expect(byMonth["2025-04"].eventMonth).toBe("2025-04");
    expect(byMonth["2025-04"].nominal).toBe(2000);
    expect(byMonth["2025-04"].comparison).toBeCloseTo(2000 * (100 / 160), 12);
    // After the raise: continues decaying against the same anchor.
    expect(byMonth["2025-05"].comparison).toBeCloseTo(2000 * (100 / 200), 12);
  });

  it("a raise that fails to beat inflation stays below the original real level", () => {
    // +25% nominal raise while prices rose 60% since the anchor.
    const series = buildSeries(
      [
        { month: "2025-01", amount: 1000 },
        { month: "2025-04", amount: 1250 },
      ],
      synthetic,
    );
    const atRaise = series.find((p) => p.month === "2025-04")!;
    expect(atRaise.comparison).toBeLessThan(1000);
  });

  it("handles an event in lastMonth itself: single point, real == nominal", () => {
    const series = buildSeries([{ month: "2025-05", amount: 900 }], synthetic);
    expect(series).toEqual([
      { month: "2025-05", nominal: 900, comparison: 900, eventMonth: "2025-05" },
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

describe("analyzePurchasingPower", () => {
  it("returns null with no events", () => {
    expect(analyzePurchasingPower([], synthetic)).toBeNull();
  });

  it("finds the peak, loss, and percentages (rising salary outrun by inflation)", () => {
    const pp = analyzePurchasingPower(
      [
        { month: "2025-01", amount: 1000 },
        { month: "2025-04", amount: 2000 },
      ],
      synthetic,
    )!;
    expect(pp.peakMonth).toBe("2025-04");
    expect(pp.peakValueToday).toBeCloseTo(2500, 6);
    expect(pp.nowValue).toBe(2000);
    expect(pp.monthlyLoss).toBeCloseTo(500, 6);
    expect(pp.declinePct).toBeCloseTo(0.2, 6);
    expect(pp.raiseToReturn).toBeCloseTo(0.25, 6);
    expect(pp.atPeak).toBe(false);
    expect(pp.firstMonth).toBe("2025-01");
  });

  it("peaks at a NON-event month under deflation", () => {
    const deflation: CpiData = {
      source: "t", fetchedAt: "x", firstMonth: "2025-01", lastMonth: "2025-03",
      values: { "2025-01": 100, "2025-02": 90, "2025-03": 95 },
    };
    const pp = analyzePurchasingPower([{ month: "2025-01", amount: 1000 }], deflation)!;
    expect(pp.peakMonth).toBe("2025-02");
    expect(pp.peakValueToday).toBeCloseTo((1000 * 95) / 90, 6);
    expect(pp.atPeak).toBe(false);
  });

  it("rising nominal does NOT imply at-peak", () => {
    const pp = analyzePurchasingPower(
      [{ month: "2025-01", amount: 1000 }, { month: "2025-04", amount: 2000 }],
      synthetic,
    )!;
    expect(pp.atPeak).toBe(false);
    expect(pp.monthlyLoss).toBeGreaterThan(0);
  });

  it("reports at-peak when the salary was set in the last month", () => {
    const pp = analyzePurchasingPower([{ month: "2025-05", amount: 900 }], synthetic)!;
    expect(pp.peakMonth).toBe("2025-05");
    expect(pp.monthlyLoss).toBe(0);
    expect(pp.atPeak).toBe(true);
    expect(pp.declinePct).toBe(0);
    expect(pp.raiseToReturn).toBe(0);
  });

  it("a salary cut after the peak does not move the peak", () => {
    const pp = analyzePurchasingPower(
      [{ month: "2025-01", amount: 2000 }, { month: "2025-04", amount: 1500 }],
      synthetic,
    )!;
    expect(pp.peakMonth).toBe("2025-01");
    expect(pp.peakValueToday).toBeCloseTo(4000, 6);
    expect(pp.nowValue).toBe(1500);
    expect(pp.monthlyLoss).toBeCloseTo(2500, 6);
  });

  it("lifetimePct is negative when real value fell since the first salary", () => {
    const pp = analyzePurchasingPower(
      [{ month: "2025-01", amount: 2000 }, { month: "2025-04", amount: 1500 }],
      synthetic,
    )!;
    expect(pp.lifetimePct).toBeCloseTo(-0.625, 6);
  });

  it("clamps sub-króna residuals to at-peak", () => {
    const flat: CpiData = {
      source: "t", fetchedAt: "x", firstMonth: "2025-01", lastMonth: "2025-02",
      values: { "2025-01": 100, "2025-02": 100 },
    };
    const pp = analyzePurchasingPower(
      [{ month: "2025-01", amount: 1000 }, { month: "2025-02", amount: 999.5 }],
      flat,
    )!;
    expect(pp.monthlyLoss).toBe(0);
    expect(pp.atPeak).toBe(true);
  });
});

describe("buildSeries frames", () => {
  const events = [{ month: "2025-01", amount: 1000 }];

  it("origin (default) expresses comparison in first-month krónur", () => {
    const s = buildSeries(events, synthetic, "origin");
    expect(s.at(-1)!.comparison).toBeCloseTo(500, 9);
    expect(buildSeries(events, synthetic).at(-1)!.comparison).toBeCloseTo(500, 9);
  });

  it("today expresses comparison in today's krónur", () => {
    const s = buildSeries(events, synthetic, "today");
    expect(s[0].comparison).toBeCloseTo(2000, 9);
    expect(s.at(-1)!.comparison).toBeCloseTo(1000, 9);
  });

  it("keepPace draws the baseline needed to hold the first salary's power", () => {
    const s = buildSeries(events, synthetic, "keepPace");
    expect(s.at(-1)!.comparison).toBeCloseTo(2000, 9);
    expect(s[0].comparison).toBeCloseTo(1000, 9);
  });
});
