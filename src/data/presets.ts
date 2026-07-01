import type { Preset } from "../lib/profiles";

/**
 * Public, read-only example histories. Figures are sourced from the cited
 * authority and must be kept within the bundled CPI range (a test enforces it).
 *
 * The three "survey" presets are miðgildi (median) heildarlaun of full-time
 * workers by starfsstétt, from Hagstofa Íslands table VIN02001 (annual,
 * machine-readable). Each annual figure is placed at mid-year (YYYY-06).
 * To refresh, re-query the PX-Web API — see README "Refreshing presets".
 */
export const PRESETS: Preset[] = [
  {
    id: "preset:lagmarkslaun",
    name: "Lágmarkslaun (fullt starf)",
    source:
      "Lágmarkstekjur fyrir fullt starf skv. kjarasamningum SGS/ASÍ — asi.is",
    kind: "minimum",
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
  {
    id: "preset:afgreidslufolk",
    name: "Afgreiðslu- og sölufólk (miðgildi)",
    source:
      "Miðgildi heildarlauna fullvinnandi, afgreiðslu- og sölustörf (starfsstétt 522) — Hagstofa Íslands, tafla VIN02001",
    kind: "survey",
    entries: [
      { month: "2014-06", amount: 397000 },
      { month: "2015-06", amount: 424000 },
      { month: "2016-06", amount: 501000 },
      { month: "2017-06", amount: 509000 },
      { month: "2018-06", amount: 526000 },
      { month: "2019-06", amount: 561000 },
      { month: "2020-06", amount: 561000 },
      { month: "2021-06", amount: 576000 },
      { month: "2022-06", amount: 622000 },
      { month: "2023-06", amount: 670000 },
      { month: "2024-06", amount: 693000 },
    ],
  },
  {
    id: "preset:grunnskolakennari",
    name: "Grunnskólakennarar (miðgildi)",
    source:
      "Miðgildi heildarlauna fullvinnandi, kennsla á grunnskólastigi (starfsstétt 2331) — Hagstofa Íslands, tafla VIN02001",
    kind: "survey",
    entries: [
      { month: "2014-06", amount: 437000 },
      { month: "2015-06", amount: 493000 },
      { month: "2016-06", amount: 517000 },
      { month: "2017-06", amount: 580000 },
      { month: "2018-06", amount: 604000 },
      { month: "2019-06", amount: 617000 },
      { month: "2020-06", amount: 643000 },
      { month: "2021-06", amount: 685000 },
      { month: "2022-06", amount: 727000 },
      { month: "2023-06", amount: 779000 },
      { month: "2024-06", amount: 814000 },
    ],
  },
  {
    id: "preset:hjukrunarfraedingur",
    name: "Hjúkrunarfræðingar (miðgildi)",
    source:
      "Miðgildi heildarlauna fullvinnandi, störf hjúkrunarfræðinga og ljósmæðra (starfsstétt 2230) — Hagstofa Íslands, tafla VIN02001",
    kind: "survey",
    entries: [
      { month: "2014-06", amount: 594000 },
      { month: "2015-06", amount: 638000 },
      { month: "2016-06", amount: 710000 },
      { month: "2017-06", amount: 754000 },
      { month: "2018-06", amount: 813000 },
      { month: "2019-06", amount: 856000 },
      { month: "2020-06", amount: 920000 },
      { month: "2021-06", amount: 930000 },
      { month: "2022-06", amount: 1007000 },
      { month: "2023-06", amount: 1069000 },
      { month: "2024-06", amount: 1139000 },
    ],
  },
];
