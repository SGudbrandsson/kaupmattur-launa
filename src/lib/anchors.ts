import anchorsJson from "../data/anchors.json";
import type { CpiData, MonthKey } from "./cpi";
import { requiredToday } from "./inflation";

export interface AnchorEntry {
  price: number;
  unit: "month" | "week" | "trip";
}

export interface Anchors {
  source: string;
  referenceMonth: MonthKey;
  anchors: {
    rent_3room_capital: AnchorEntry;
    weekly_groceries_family4: AnchorEntry;
    trip_abroad_two: AnchorEntry;
  };
}

export function getAnchors(): Anchors {
  return anchorsJson as Anchors;
}

/**
 * The anchor's reference price inflated to the latest CPI month, using the
 * overall CPI. requiredToday(price, ref, cpi) === price × CPI(last) / CPI(ref).
 */
export function anchorToday(
  entry: AnchorEntry,
  referenceMonth: MonthKey,
  cpi: CpiData,
): number {
  return requiredToday(entry.price, referenceMonth, cpi);
}
