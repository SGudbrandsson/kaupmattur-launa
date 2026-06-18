import { describe, it, expect } from "vitest";
import type { CpiData } from "../src/lib/cpi";
import { normalizeRows } from "../src/lib/ai/normalizeRows";

const cpi: CpiData = {
  source: "test",
  fetchedAt: "2025-01-01T00:00:00Z",
  firstMonth: "1988-05",
  lastMonth: "2025-01",
  values: {},
};

describe("normalizeRows", () => {
  it("keeps valid rows, sorted ascending", () => {
    const { rows, dropped } = normalizeRows(
      [
        { month: "2024-01", amount: 800000 },
        { month: "2020-03", amount: 650000 },
      ],
      cpi,
    );
    expect(dropped).toBe(0);
    expect(rows).toEqual([
      { month: "2020-03", amount: 650000 },
      { month: "2024-01", amount: 800000 },
    ]);
  });

  it("accepts YYYY/M and single-digit months, zero-padding them", () => {
    const { rows } = normalizeRows([{ month: "2021/4", amount: 700000 }], cpi);
    expect(rows).toEqual([{ month: "2021-04", amount: 700000 }]);
  });

  it("rounds amounts", () => {
    const { rows } = normalizeRows([{ month: "2022-01", amount: 700000.7 }], cpi);
    expect(rows[0].amount).toBe(700001);
  });

  it("drops out-of-range months and counts them", () => {
    const { rows, dropped } = normalizeRows(
      [
        { month: "1988-04", amount: 100000 },
        { month: "2030-01", amount: 900000 },
        { month: "2023-01", amount: 800000 },
      ],
      cpi,
    );
    expect(rows).toEqual([{ month: "2023-01", amount: 800000 }]);
    expect(dropped).toBe(2);
  });

  it("drops non-positive, over-max, and non-finite amounts", () => {
    const { rows, dropped } = normalizeRows(
      [
        { month: "2023-01", amount: 0 },
        { month: "2023-02", amount: -5 },
        { month: "2023-03", amount: 99_000_001 },
        { month: "2023-04", amount: Number.NaN },
      ],
      cpi,
    );
    expect(rows).toEqual([]);
    expect(dropped).toBe(4);
  });

  it("drops unparseable month strings", () => {
    const { rows, dropped } = normalizeRows(
      [
        { month: "early 2022", amount: 700000 },
        { month: "2022-13", amount: 700000 },
        { month: "", amount: 700000 },
      ],
      cpi,
    );
    expect(rows).toEqual([]);
    expect(dropped).toBe(3);
  });

  it("dedupes by month, last value wins", () => {
    const { rows } = normalizeRows(
      [
        { month: "2023-01", amount: 800000 },
        { month: "2023-01", amount: 850000 },
      ],
      cpi,
    );
    expect(rows).toEqual([{ month: "2023-01", amount: 850000 }]);
  });
});
