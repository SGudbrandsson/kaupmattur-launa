import type { Preset } from "../lib/profiles";

/**
 * Public, read-only example histories. Figures are sourced from the cited
 * authority and must be kept within the bundled CPI range (a test enforces it).
 */
export const PRESETS: Preset[] = [
  {
    id: "preset:lagmarkslaun",
    name: "Lágmarkslaun (fullt starf)",
    source:
      "Lágmarkstekjur fyrir fullt starf skv. kjarasamningum SGS/ASÍ — asi.is",
    entries: [
      { month: "2015-05", amount: 245000 },
      { month: "2016-05", amount: 260000 },
      { month: "2017-05", amount: 280000 },
      { month: "2018-05", amount: 300000 },
      { month: "2019-04", amount: 317000 },
      { month: "2020-04", amount: 335000 },
      { month: "2021-01", amount: 351000 },
      { month: "2022-04", amount: 368000 },
      { month: "2023-01", amount: 402235 },
      { month: "2024-02", amount: 425000 },
    ],
  },
];
