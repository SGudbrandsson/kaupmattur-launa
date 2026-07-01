import { describe, it, expect } from "vitest";
import type { CpiData } from "../src/lib/cpi";
import { parseProfileFile, safeFilename, serializeProfile } from "../src/lib/profileFile";

const cpi: CpiData = {
  source: "t", fetchedAt: "x", firstMonth: "2020-01", lastMonth: "2020-04",
  values: { "2020-01": 100, "2020-02": 110, "2020-03": 120, "2020-04": 130 },
};

describe("serialize/parse round-trip", () => {
  it("round-trips a profile", () => {
    const text = serializeProfile("Anna", [{ month: "2020-01", amount: 300000 }]);
    const r = parseProfileFile(text, cpi);
    expect(r).toEqual({ name: "Anna", entries: [{ month: "2020-01", amount: 300000 }] });
  });
});

describe("parseProfileFile rejects bad input", () => {
  it("rejects non-JSON", () => {
    expect("error" in parseProfileFile("{nope", cpi)).toBe(true);
  });
  it("rejects the wrong kind/version", () => {
    expect("error" in parseProfileFile(JSON.stringify({ v: 1, kind: "other", entries: [] }), cpi)).toBe(true);
    expect("error" in parseProfileFile(JSON.stringify({ v: 2, kind: "kaupmattur-profile", entries: [] }), cpi)).toBe(true);
  });
  it("rejects when nothing valid survives sanitizing", () => {
    const text = JSON.stringify({ v: 1, kind: "kaupmattur-profile", name: "X", entries: [{ month: "1900-01", amount: 5 }] });
    expect("error" in parseProfileFile(text, cpi)).toBe(true);
  });
  it("sanitizes out-of-range entries but keeps valid ones", () => {
    const text = JSON.stringify({ v: 1, kind: "kaupmattur-profile", name: "X", entries: [{ month: "2020-02", amount: 5 }, { month: "2099-01", amount: 9 }] });
    const r = parseProfileFile(text, cpi);
    expect(r).toEqual({ name: "X", entries: [{ month: "2020-02", amount: 5 }] });
  });
});

describe("safeFilename", () => {
  it("slugifies and appends .json", () => {
    expect(safeFilename("Anna mín")).toBe("Anna-mín.json");
  });
  it("falls back when empty after cleaning", () => {
    expect(safeFilename("!!!")).toBe("kaupmattur-profile.json");
  });
});
