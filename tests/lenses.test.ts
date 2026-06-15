import { describe, it, expect } from "vitest";
import type { CpiData } from "../src/lib/cpi";
import type { Anchors } from "../src/lib/anchors";
import { monthlyGap, computeLenses } from "../src/lib/lenses";

const cpi: CpiData = {
  source: "test",
  fetchedAt: "2025-01-01T00:00:00Z",
  firstMonth: "2023-01",
  lastMonth: "2025-01",
  values: { "2023-01": 100, "2024-01": 110, "2025-01": 120 },
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

describe("monthlyGap", () => {
  it("returns the today-króna shortfall for the most recent salary", () => {
    const gap = monthlyGap([{ month: "2023-01", amount: 800000 }], cpi);
    expect(gap).not.toBeNull();
    expect(gap!.current).toBe(800000);
    expect(gap!.month).toBe("2023-01");
    expect(gap!.gap).toBeCloseTo(160000, 0); // 800k×120/100 − 800k
  });

  it("uses the most recent event when there are several", () => {
    const gap = monthlyGap(
      [
        { month: "2023-01", amount: 800000 },
        { month: "2024-01", amount: 900000 },
      ],
      cpi,
    );
    expect(gap!.month).toBe("2024-01");
    expect(gap!.gap).toBeCloseTo(81818, 0); // 900k×120/110 − 900k
  });

  it("returns null when the salary is too new to have lost value", () => {
    expect(monthlyGap([{ month: "2025-01", amount: 800000 }], cpi)).toBeNull();
  });

  it("returns null when there are no events", () => {
    expect(monthlyGap([], cpi)).toBeNull();
  });
});

describe("computeLenses", () => {
  const gap = monthlyGap([{ month: "2023-01", amount: 800000 }], cpi)!;
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
