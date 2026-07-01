import { describe, it, expect } from "vitest";
import { copy } from "../src/copy";

describe("disclosure + summary-table copy", () => {
  it("history summary combines count and span", () => {
    expect(copy.form.historySummary(10, "2015–2024")).toBe("10 launafærslur · 2015–2024");
  });

  it("has non-empty history toggle labels", () => {
    expect(copy.form.editHistory.length).toBeGreaterThan(0);
    expect(copy.form.showEntries.length).toBeGreaterThan(0);
    expect(copy.form.hideEntries.length).toBeGreaterThan(0);
  });

  it("summary showAll includes the count", () => {
    expect(copy.summary.showAll(10)).toContain("10");
  });

  it("has four summary table headers", () => {
    for (const h of [copy.summary.thMonth, copy.summary.thSet, copy.summary.thReal, copy.summary.thChange]) {
      expect(h.length).toBeGreaterThan(0);
    }
    expect(copy.summary.hide.length).toBeGreaterThan(0);
  });
});
