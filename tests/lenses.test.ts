import { describe, it, expect } from "vitest";
import type { CpiData } from "../src/lib/cpi";
import type { Anchors } from "../src/lib/anchors";
import { peakGap, computeLenses } from "../src/lib/lenses";

/** Dense fixture: linear interpolation 100→110 (2023) then 110→120 (2024). */
const cpi: CpiData = {
  source: "test",
  fetchedAt: "2025-01-01T00:00:00Z",
  firstMonth: "2023-01",
  lastMonth: "2025-01",
  values: {
    "2023-01": 100, "2023-02": 100.833, "2023-03": 101.667,
    "2023-04": 102.5,  "2023-05": 103.333, "2023-06": 104.167,
    "2023-07": 105,    "2023-08": 105.833, "2023-09": 106.667,
    "2023-10": 107.5,  "2023-11": 108.333, "2023-12": 109.167,
    "2024-01": 110,    "2024-02": 110.833, "2024-03": 111.667,
    "2024-04": 112.5,  "2024-05": 113.333, "2024-06": 114.167,
    "2024-07": 115,    "2024-08": 115.833, "2024-09": 116.667,
    "2024-10": 117.5,  "2024-11": 118.333, "2024-12": 119.167,
    "2025-01": 120,
  },
};

const anchors: Anchors = {
  source: "test",
  referenceMonth: "2023-01",
  anchors: {
    rent_3room_capital: { price: 280000, unit: "month" },
    weekly_groceries_family4: { price: 35000, unit: "week" },
    trip_abroad_two: { price: 250000, unit: "trip" },
  },
};

describe("peakGap", () => {
  it("returns null with no events", () => {
    expect(peakGap([], cpi)).toBeNull();
  });

  it("is the today-króna loss from the peak, keyed to the peak month", () => {
    const g = peakGap(
      [
        { month: "2023-01", amount: 800000 },
        { month: "2025-01", amount: 820000 },
      ],
      cpi,
    );
    expect(g).not.toBeNull();
    expect(g!.current).toBe(820000);
    expect(g!.gap).toBeGreaterThan(0);
    expect(typeof g!.referenceMonth).toBe("string");
  });

  it("returns null when the latest salary is the all-time real peak", () => {
    expect(peakGap([{ month: cpi.lastMonth, amount: 800000 }], cpi)).toBeNull();
  });
});

describe("computeLenses", () => {
  const gap = { gap: 160000, current: 800000, referenceMonth: "2023-01" };
  const lenses = computeLenses(gap, cpi, anchors);
  const by = (k: string) => lenses.find((l) => l.key === k)!;

  it("returns the four lenses in order", () => {
    expect(lenses.map((l) => l.key)).toEqual(["raise", "rent", "food", "life"]);
  });

  it("computes the exact raise lens", () => {
    const l = by("raise");
    expect(l.basis).toBe("exact");
    if (l.key !== "raise") throw new Error("type");
    expect(l.raisePct).toBeCloseTo(0.2, 5); // 120/100 − 1
    expect(l.extraDays).toBeCloseTo(160000 / (800000 / 21.67), 2);
  });

  it("computes the approximate rent lens", () => {
    const l = by("rent");
    expect(l.basis).toBe("approx");
    if (l.key !== "rent") throw new Error("type");
    expect(l.monthsOfRent).toBeCloseTo(160000 / 336000, 4); // rent 280k×1.2
  });

  it("computes the approximate food lens", () => {
    const l = by("food");
    if (l.key !== "food") throw new Error("type");
    expect(l.weeksOfFood).toBeCloseTo(160000 / 42000, 4); // 35k×1.2
  });

  it("computes the approximate, annualized life lens", () => {
    const l = by("life");
    if (l.key !== "life") throw new Error("type");
    expect(l.annualLoss).toBeCloseTo(1920000, 0); // 160k×12
    expect(l.trips).toBeCloseTo(1920000 / 300000, 4); // 250k×1.2
  });
});
