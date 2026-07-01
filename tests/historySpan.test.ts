import { describe, it, expect } from "vitest";
import { historySpan, MANY_ENTRIES_THRESHOLD } from "../src/lib/profiles";
import type { SalaryEvent } from "../src/lib/inflation";

const ev = (month: string): SalaryEvent => ({ month, amount: 1 });

describe("historySpan", () => {
  it("returns count and min/max year across events", () => {
    expect(historySpan([ev("2015-05"), ev("2020-06"), ev("2024-06")])).toEqual({
      count: 3, firstYear: 2015, lastYear: 2024,
    });
  });

  it("collapses a single-year set to one year", () => {
    expect(historySpan([ev("2022-01"), ev("2022-09")])).toEqual({
      count: 2, firstYear: 2022, lastYear: 2022,
    });
  });

  it("handles the CPI boundary months", () => {
    expect(historySpan([ev("1988-05"), ev("2026-05")])).toEqual({
      count: 2, firstYear: 1988, lastYear: 2026,
    });
  });

  it("empty input yields zeros", () => {
    expect(historySpan([])).toEqual({ count: 0, firstYear: 0, lastYear: 0 });
  });

  it("skips malformed months instead of producing NaN", () => {
    expect(historySpan([ev("2015-05"), { month: "bad", amount: 1 }])).toEqual({
      count: 1, firstYear: 2015, lastYear: 2015,
    });
  });

  it("exposes the threshold as 5", () => {
    expect(MANY_ENTRIES_THRESHOLD).toBe(5);
  });
});
