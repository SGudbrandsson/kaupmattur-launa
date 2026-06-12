# Kaupmáttur launa — Design Document

**Date:** 2026-06-12 · **Status:** Approved · **Project:** isk-value-web

## 1. Product spec

### What it is

A single-page static website that shows Icelanders how fast their salary loses purchasing power to inflation — "a salary decrease application." The user enters one or more salary changes from their past (month/year + monthly ISK amount). The app shows, month by month, what that nominal salary is *really* worth in the kronur of the day it was set, and what it would need to be today to have kept up.

### Audience

The general Icelandic public. No financial literacy assumed: the app explains itself in friendly, plain Icelandic. Mobile is the primary device.

### Why people should trust it

Two pillars, both architecturally enforced rather than promised:

1. **The math is official.** All calculations use the consumer price index (vísitala neysluverðs) published by Hagstofa Íslands, the same index used for verðtrygging. The methodology section shows the formula and source table.
2. **The data never leaves the browser.** There is no server, no analytics, no cookies, and — crucially — *zero network requests at runtime* (the CPI dataset is bundled into the page, the font is self-hosted). The privacy claim is verifiable by anyone who opens the devtools Network tab, and the UI tells them how.

### Success criteria

- A first-time visitor understands what the site does within five seconds (demo example pre-loaded).
- Entering a salary takes under 30 seconds on a phone.
- The "lost value" is visible at a glance in the chart (the widening band) and as a concrete krónutala in the summary card.
- The Network tab shows no third-party or API requests, ever.

## 2. The measure: CPI index, not SDR

SDR (sérstök dráttarréttindi) was considered and rejected: it measures the ISK *exchange rate* against a basket of foreign currencies, which is about buying foreign goods, not about what a salary buys in Iceland. Domestic purchasing power is exactly what the consumer price index measures.

We use the monthly CPI **index values** (not annual inflation percentages) so the month-by-month math is exact, with no compounding approximations:

- **Real value** of amount *A* set in month *d*, expressed in month-*d* kronur at later month *t*:
  `real(t) = A × CPI_d / CPI_t`
- **Required salary today** to match the purchasing power of *A* from month *d*:
  `required = A × CPI_today / CPI_d`
- **Cumulative inflation** since *d*: `CPI_t / CPI_d − 1`

**Anchor example (validated against real data):** CPI was 635.5 in January 2025 and 684.3 in May 2026. So 1.000.000 kr. set in January 2025 had the purchasing power of ≈ **928.686 kr.** by May 2026 — a real loss of 7,1%. This example is pinned in a unit test.

**Multiple raises:** the nominal salary is a step function over time. The *real* line is one continuous story, anchored to the **first** entry's month: every value is expressed in the kronur of that month. Raises therefore appear exactly as large as they are in real terms — a raise that fails to beat inflation since the anchor visibly fails to reach the previous real level. (An earlier per-raise-baseline design, where the real line reset to nominal at each raise, was rejected after user review: the reset read as "value regained" and hid whether raises actually kept up.) The per-raise erosion view lives in the summary cards, each measured against its own start month.

## 3. Data pipeline

### Source

Hagstofa Íslands PX-Web API, table **VIS01000** ("Vísitala neysluverðs og breytingar, grunnur 1988=100"):
`https://px.hagstofa.is/pxis/api/v1/is/Efnahagur/visitolur/1_vnv/1_vnv/VIS01000.px`

Monthly index values from 1988M05 onward (457 months as of May 2026), updated near the end of each month. We query Vísitala=`CPI` (full index, the headline measure used for verðtrygging), Liður=`index`.

### Why build-time, not runtime

The API sends no `Access-Control-Allow-Origin` header (verified via OPTIONS preflight), so browsers cannot call it. This constraint aligns perfectly with the privacy goal: a Node script (`npm run update-data`, the **only** network code in the repository) fetches the full series and writes `src/data/cpi.json` (~10 KB), which Vite bundles statically. Refreshing data = run the script, commit, redeploy (monthly; a CI cron that opens a PR is a documented future option).

### Dataset shape

```json
{
  "source": "Hagstofa Íslands, VIS01000 (Vísitala neysluverðs, grunnur 1988=100)",
  "fetchedAt": "2026-06-12T…Z",
  "firstMonth": "1988-05",
  "lastMonth": "2026-05",
  "values": { "1988-05": 100.0, "…": 0, "2026-05": 684.3 }
}
```

The script validates before writing: series starts 1988-05, months contiguous, all values positive and within ±10% of the previous month, count never shrinks versus the committed file. It fails loudly on any anomaly so a Hagstofa format change can never silently corrupt the site.

## 4. Architecture

Static output (HTML/CSS/JS), deployable to any static host. Vite + Preact (TSX) + TypeScript; the only runtime dependency is Preact (~4 KB). The chart is hand-rolled SVG — the signature visual (a gradient band between a step line and a decay line, with a touch crosshair) is easier to do well directly than through a chart library, and monthly data is tiny.

### Module boundaries

| Unit | Purpose | Interface | Depends on |
|---|---|---|---|
| `src/data/cpi.json` | Generated dataset | JSON, shape above | — |
| `src/lib/cpi.ts` | Dataset access + month arithmetic | `getCpi()`, `monthRange`, `addMonths`, `compareMonths` | cpi.json |
| `src/lib/inflation.ts` | Pure purchasing-power math (the test target) | `realValue`, `cumulativeInflation`, `requiredToday`, `buildSeries(events) → {month, nominal, real, baselineMonth}[]` | cpi.ts helpers; CPI data passed in (injectable for tests) |
| `src/lib/format.ts` | Icelandic formatting via `Intl` | `formatISK`, `formatMonth`, `formatPercent`, `formatCompactISK` | — |
| `src/lib/storage.ts` | localStorage persistence | `loadEntries() → events \| null`, `saveEntries(events)`; versioned payload, null on anything invalid | — |
| `src/copy.ts` | Every UI string, keyed | const object | — |
| `src/app.tsx` | State owner | `entries[]` + `isExampleData` in state; derived series via memo | libs + components |
| `src/components/*` | Presentational sections | props down, callbacks up | copy.ts, format.ts |
| `scripts/update-data.mjs` | Data fetcher (Node only) | `npm run update-data` | Hagstofa API |

State flows one way: form edits → `entries` → sorted/validated → `buildSeries` → chart + summary cards. No state manager, no router.

## 5. UX design

Single scrolling page, mobile-first, content column ~720px. Sections top to bottom:

1. **Hero** — *"Hvað eru launin þín raunverulega virði?"* plus a one-sentence explainer. Soft gradient background, generous whitespace.
2. **Privacy badge** — a pill with a lock icon directly under the hero: *"Gögnin þín fara aldrei úr vafranum — engin netumferð, engar vafrakökur, engin greining."* An expandable *"Hvernig get ég sannreynt það?"* explains the devtools Network check in plain words.
3. **Salary entries** — one soft card per raise.
   - **Date** = two native selects (Icelandic month name + year), *not* `<input type="month">` (unsupported in desktop Safari). Invalid dates are unselectable rather than validated: years run 1988→current, 1988 offers only May–December, months after the latest CPI month are disabled.
   - **Amount** = numeric-keyboard text input with "kr. á mánuði" context; groups to `1.000.000` on blur. Validation: required, integer, > 0, ≤ 99.000.000. Errors are friendly and inline (*"Þetta lítur ekki út eins og upphæð"*).
   - Duplicate month → inline error on the offending row; outputs compute from the last valid state.
   - "Bæta við launahækkun" button; per-row remove. Derived state sorts by date; the visible list keeps user order so rows don't jump mid-edit.
4. **Chart** — see §6.
5. **Summary cards** — one per raise: when it was set and the amount; the big number *"Kaupmáttur í dag: 928.700 kr."*; a delta chip *"−71.300 kr. (−7,1%)"*; and *"Til að halda í við verðbólguna þyrftu launin að vera 1.076.800 kr. í dag."* A raise set in the latest CPI month gets *"Of nýtt til að verðbólgan hafi náð að bíta — fylgstu með."*
6. **Methodology + footer** — what the CPI is in plain Icelandic, the formula, source credit, *"Gögn til og með maí 2026"* (derived from `lastMonth`), privacy statement repeated.

**Empty state:** first visit shows a pre-filled example (800.000 kr., janúar 2023) clearly tagged *"Sýnidæmi"*, with a one-tap *"Prófa með mínum launum"*. Example data is never written to localStorage; the first real edit flips to user mode and persistence begins. The page never looks dead and the chart demos itself.

**Persistence:** localStorage only — consistent with the privacy story. Cleared by the browser, owned by the user.

### Copy tone

Friendly, plain Icelandic; second person singular; no fear-mongering and no financial jargon without explanation. The app states facts warmly (*"verðbólgan étur kaupmátt"* is as dramatic as it gets) and never shames or advises. All strings live in `copy.ts`; an English locale can be added later without touching components.

### Visual design language

- **Soft and modern:** rounded radii (12–20px), soft borders, layered gentle gradients, no hard shadows. Light theme.
- **Typography:** self-hosted Inter variable (full ð/þ/æ/ö coverage); large numeric readouts use tabular figures.
- **Color roles:** calm ink/slate for nominal values and text; a warm coral/rose for lost value (the gradient band and delta chips); a confident accent for the real-value line. Strong contrast for all text (WCAG AA).
- **Motion:** chart lines draw in once on data change; band fades in; `prefers-reduced-motion` disables all of it. Nothing loops.
- **Formatting:** `Intl` with `is-IS` everywhere — `1.000.000 kr.`, `janúar 2025`, `−7,1%`.

## 6. Chart design

X axis: months from the earliest salary event through the latest CPI month. Y axis: ISK.

- **Nominal line** — the salary as paid: a step-after line, muted ink, 2px, rounded joins.
- **Real-value line** — continuous, anchored to the first entry's month; decays between raises and steps up by the raise's *real* size at each event. Straight monthly segments (no bezier smoothing across raise discontinuities). A caption under the chart states the anchor: *"Raunvirðið er sýnt á verðlagi <mánuður>…"*.
- **Lost-value band** — the filled region between the two lines, soft coral gradient fading downward. This is the message: the band visibly widens month by month.
- **Markers** — a dot + subtle hairline at each raise month; an *"í dag"* marker at the last month.
- **Axes** — X ticks adapt to span (yearly, or every 3–6 months under two years); Y has 4–5 ticks with compact labels (*"950 þús."*, *"1,2 m.kr."*). Y domain is [0.95 × min, 1.03 × max] — deliberately not zero-based, because the meaning lives between the two lines and a 5–10% erosion must be readable. Hairline gridlines only.
- **Crosshair/tooltip** — a full-size transparent rect captures pointer events; snaps to the nearest month; shows month, nominal, real, and loss (kr. + %). Desktop: floating card near the cursor. Mobile: fixed readout row above the chart, never under the finger.
- **Responsive** — `ResizeObserver` drives the SVG width; ~280px tall on mobile, ~360px on desktop, edge-to-edge on small screens.

## 7. Edge cases

| Case | Behavior |
|---|---|
| Date before 1988-05 | Unselectable (selects don't offer it) |
| Date after latest CPI month / future | Unselectable |
| Raise in the latest CPI month | Series point exists, real == nominal; friendly "too new" copy on the card |
| Duplicate month entries | Inline error on second row; outputs use last valid state |
| Amount empty / zero / negative / huge | Inline friendly error; row excluded from outputs until valid |
| Corrupt/old localStorage payload | `loadEntries` returns null; app falls back to example state |
| JS disabled | `<noscript>` note that the calculator needs JavaScript — precisely because everything happens locally |

## 8. Testing & verification

Unit tests (Vitest) carry the credibility of the site and focus on the math:

- `inflation.test.ts` — the 928.686 anchor against real data; a tiny synthetic CPI fixture with hand-computable values; multi-raise baseline switching (month before vs. at a raise); raise in `lastMonth`; `requiredToday`/`cumulativeInflation` consistency; series length and ordering.
- `cpi.test.ts` — dataset contiguity, `lastMonth == max(keys)`, month arithmetic across year boundaries.
- `format.test.ts` — is-IS grouping, month names, comma decimals.

End-to-end (Playwright, against the production build): **zero non-same-origin network requests**; the anchor scenario renders ~928.700 kr.; adding a second raise produces a step; entries persist across reload; the example state is shown on first visit and never persisted; mobile (390×844) layout pass.

## 9. Out of scope (deliberately)

Accounts, sharing links, wage-index (launavísitala) comparison, CPI-excluding-housing toggle, English locale, dark mode, historical "what if" scenarios. The string module and data layer leave room for the last few, but none are built now.
