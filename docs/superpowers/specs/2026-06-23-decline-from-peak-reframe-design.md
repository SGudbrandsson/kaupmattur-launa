# Decline-from-peak reframe + multi-frame chart

**Date:** 2026-06-23
**Status:** Approved (brainstorm), revised after adversarial review (Codex/gpt-5.4), pending implementation plan
**Supersedes the framing of:** the v1 chart and the payoff-first lens chooser (their math is re-based here).

## Problem

The chart and payoff card currently anchor everything to the **first** salary month and frame every result as a **loss**. Over a long history with raises this is misleading: a real *gain* can look like a −62% collapse (it's mostly "the króna shrank since 2006"), and the page shows **two different loss numbers** (payoff card = since last raise; chart = since first month). Worse, it hides what people actually feel: **purchasing power often peaks mid-career and then erodes**, so later nominal "raises" can be real pay cuts.

## Goal

Re-base the whole page on **decline from peak**, told honestly (gains shown as gains), with the chart offering **three reference frames** and making inflation's effect visible without a second Y-axis.

## Core model (one source of truth)

Real purchasing power at month `t` is `R(t) = salary(t) / CPI(t)`, where `salary(t)` is the salary in effect at `t` (a step function of the salary events; events may be raises **or cuts**).

**Peak is the global argmax over *all* months** in the series (first event month … latest CPI month), **not** over event months. This matters: the bundled Icelandic CPI (`src/data/cpi.json`) contains many month-over-month *declines* (deflation), so within a single salary plateau `R` is maximised at that plateau's **lowest-CPI** month, which may be *after* the salary was set. Tie-break on the **most recent** month.

Define, all in **today's krónur** (`requiredToday(a, m, cpi) = a × CPI(lastMonth)/CPI(m)`):

- `peakMonth` = `argmax_t R(t)` over all months (ties → most recent).
- `peakValueToday = requiredToday(salary(peakMonth), peakMonth, cpi)`.
- `nowValue = salary(lastMonth)` (current salary; already in today's krónur).
- `monthlyLoss = max(0, peakValueToday − nowValue)` (clamped; see epsilon below).
- `declinePct = monthlyLoss / peakValueToday`.
- `raiseToReturn = monthlyLoss / nowValue` (= `peakValueToday/nowValue − 1`).
- `firstValueToday = requiredToday(salary(firstMonth), firstMonth, cpi)`; `lifetimePct = nowValue / firstValueToday − 1` (may be negative).
- **At peak** ⇔ `peakMonth === lastMonth` ⇔ `monthlyLoss === 0`. Rising nominal salaries do **not** imply this — inflation can still have outrun the last raise.

**Epsilon clamp:** because these come from CPI ratios, clamp `monthlyLoss`, `declinePct`, `raiseToReturn` to 0 when within a small epsilon (e.g. `monthlyLoss < 1` króna) before any copy/branch decision, so floating-point dust doesn't flip the "at peak" state.

**Illustrative only (NOT a test fixture):** for someone who peaked ~2020 and is now nominally higher but real-lower, the page shows a decline of very roughly 20%-ish from peak and a large lifetime gain. **Exact numbers depend on the real CPI and are computed at runtime** — the spec pins no numbers; tests use small synthetic CPI fixtures with hand-verifiable values (see Testing).

**Single salary** reduces cleanly: the peak is that plateau's lowest-CPI month; if CPI rose monotonically since it was set, that's the set month and decline-from-peak equals inflation-since-set.

## The chart — three frames + peak marker

A small **frame toggle** (chips, mirroring the lens chooser). Every frame plots the salary line (`nominal`, step) plus one comparison line, and **the y-axis is scaled from BOTH plotted series** (min and max across nominal *and* comparison, with padding) so nothing clips:

| Frame | Chip | Comparison line | Reading |
|-------|------|-----------------|---------|
| `today` *(default)* | "Á verðlagi í dag" | `salary(t) × CPI(today)/CPI(t)` (real value in today's krónur) | Real-value line; **peak marked**, drop from peak→now is the story. Readout = "virði í dag", NOT gain/loss vs nominal. |
| `origin` | "Á verðlagi þá" | `salary(t) × CPI(first)/CPI(t)` (real value in first-month krónur) | Classic erosion: comparison ≤ nominal; single coral band = how much the króna shrank. |
| `keepPace` | "Hélt í við verðbólgu?" | `salary(first) × CPI(t)/CPI(first)` (salary needed to hold the starting purchasing power) | Sign-aware: nominal **above** baseline = real gain (glacier), **below** = loss (coral). |

Per-frame visual semantics (this is the key fix from review):
- **`today` (default):** the comparison (real-in-today) line sits *above* nominal for most past months purely because the króna was smaller then — so a "gain/loss vs nominal" band would falsely read as loss everywhere. **Do not draw a gain/loss band in this frame.** Instead: draw the real-value line as the hero, mute the nominal line to context, **mark the peak**, and emphasise the **peak→now** drop (a coral drop indicator / annotation from peak value to current value). The scrubbed readout shows the month's value "á verðlagi í dag" plus its delta **from peak**, not from same-month nominal.
- **`origin`:** comparison ≤ nominal always (inflation only erodes in this base after the first month) — keep the existing single coral erosion band + loss readout.
- **`keepPace`:** nominal vs baseline genuinely **crosses**. Color the area **per sign**, splitting the fill at exact crossing points between adjacent months (a single closed polygon cannot bicolor correctly). Readout is sign-aware (gain glacier / loss coral).

A **peak marker** (dot + label, e.g. "hámark · {peakMonth}") sits on the comparison line at `peakMonth` in the `today` and `origin` frames.

## Payoff card + lens chooser — re-based on the peak

- **Headline (sign-aware, peak-led):** when below peak — *"Kaupmáttur þinn náði hámarki í {peakMonth}. Síðan hefur hann rýrnað um {declinePct} — eða {monthlyLoss} á mánuði,"* with a quiet secondary line *"(Frá {firstMonth} hefur kaupmátturinn samt {aukist/rýrnað} um {|lifetimePct|}.)"* — verb chosen by `lifetimePct` sign.
- **At peak** (`monthlyLoss === 0` after clamp): positive state — *"Kaupmáttur þinn hefur aldrei verið hærri"* + secondary lifetime line — and the lens chooser is hidden.
- **Lenses re-based:** the chooser keys off `monthlyLoss`. `computeLenses` math is unchanged (it already derives everything from `{ gap, current }`, and `gap/current = peakValueToday/nowValue − 1 = raiseToReturn`); only the raise-lens **copy** changes to "raise to return to your peak."

## Architecture & files

- **`src/lib/inflation.ts`**
  - Add `analyzePurchasingPower(events, cpi): PurchasingPower | null` → `{ peakMonth, peakValueToday, nowValue, monthlyLoss, declinePct, raiseToReturn, lifetimePct, firstMonth, atPeak }` (null if no events). Pure; iterates the full month range; reuses `requiredToday`; applies the epsilon clamp.
  - Generalise `buildSeries(events, cpi, frame: ChartFrame)`: rename `SeriesPoint.real` → `comparison`, computed per frame (`origin` = current formula). `ChartFrame = "today" | "origin" | "keepPace"`.
- **`src/lib/lenses.ts`** — replace `monthlyGap` with an adapter over `analyzePurchasingPower`. **Do not overload `Gap.month`:** rename it to `Gap.referenceMonth` (= `peakMonth`) and update its doc comment; `computeLenses` stays. Returns null when `atPeak`.
- **`src/components/Chart.tsx`** — owns the frame toggle (`useState<ChartFrame>("today")`); builds its own series via `buildSeries(events, cpi, frame)` (prop changes from `series` → `events` + `cpi`); y-scales from both series; per-frame band logic (no band in `today`; erosion band in `origin`; sign-split band in `keepPace`); peak marker; sign-aware readout.
- **`src/components/PayoffCard.tsx`** — peak-aware, sign-aware headline + secondary line + positive state; lenses fed from the re-based gap.
- **`src/app.tsx`** — stop pre-computing `series`; pass `events` + `cpi` to `<Chart>`.
- **`src/copy.ts`** — frame chip labels, peak/headline/secondary templates (sign-aware verbs), per-frame readout/anchor copy, positive-state copy.
- **`src/styles.css`** — frame-chip styles (reuse lens-chip tokens), peak marker, sign-aware (coral/glacier) band + readout.

## Edge cases
- `< 2` points / no events → chart hidden (as today); payoff renders nothing.
- `atPeak` (current month is the global argmax) → positive headline, lenses hidden, no decline drawn.
- **Deflation** → peak may be a non-event month; handled by global argmax. Tie-break most recent month.
- **Salary cuts** (an event lower than the previous) → math holds; copy/tests must not assume every event is a raise.
- Single salary → peak = its plateau's lowest-CPI month (≈ set month under normal inflation).
- `lifetimePct < 0` → secondary line uses the "rýrnað" verb.
- `keepPace` sign-crossing within a month-to-month segment → split the band fill at the crossing.

## Testing
Pure logic is the test target; components stay manual/Playwright.
- **`tests/inflation.test.ts`**
  - `analyzePurchasingPower`: a synthetic-CPI fixture with hand-computed `peakMonth/monthlyLoss/declinePct/raiseToReturn/lifetimePct`.
  - **Deflation case**: a plateau where CPI dips after the salary was set → assert `peakMonth` is the lowest-CPI month, **not** the event month.
  - **All-rising-nominal but inflation outran it** → assert `atPeak === false` and a positive `monthlyLoss` (kills the old wrong invariant).
  - **At peak**: current month is the global argmax → `monthlyLoss === 0`, `atPeak === true`.
  - **Salary cut** after the true peak → peak unaffected, numbers correct.
  - `lifetimePct` negative case; month-vs-event tie handling; epsilon clamp (sub-1-króna residual → 0).
  - `buildSeries` per frame: the three comparison formulas; `origin` unchanged (update existing tests for the `real`→`comparison` rename).
- **`tests/lenses.test.ts`** — gap now sourced from the peak; assert `Gap.referenceMonth === peakMonth`, `null` when `atPeak`, and that `computeLenses` output (incl. the raise lens = `raiseToReturn`) is correct. Update the existing `monthlyGap` tests to the new adapter + field name.

## Out of scope (v1)
A free reference-year picker (start/peak are auto-derived), animated frame transitions, an explicit per-period inflation-rate readout (the `keepPace` frame exposes aggressive periods visually), and any CPI-pipeline change.
