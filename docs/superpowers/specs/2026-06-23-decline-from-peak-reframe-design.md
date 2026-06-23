# Decline-from-peak reframe + multi-frame chart

**Date:** 2026-06-23
**Status:** Approved (brainstorm), pending implementation plan
**Supersedes the framing of:** the v1 chart and the payoff-first lens chooser (their math is re-based here).

## Problem

The chart and payoff card currently anchor everything to the **first** salary month and frame every result as a **loss**. Over a long history with raises this is misleading: a real *gain* can look like a −62% collapse (it's mostly "the króna shrank since 2006"), and the page shows **two different loss numbers** (payoff card = since last raise; chart = since first month). Worse, it hides the thing people actually feel: **purchasing power often peaks mid-career and then erodes**, so later nominal "raises" are real pay cuts.

## Goal

Re-base the whole page on **decline from peak**, the number people feel, told honestly (gains shown as gains), with the chart offering **three reference frames** and making inflation's effect — and *when it bit hardest* — visible without a second Y-axis.

## Core model (one source of truth)

Real purchasing power over time is `R(t) = salary(t) / CPI(t)`. Because `R` jumps up at each raise and decays between raises, its maximum always falls on an **event (raise) month**. Define, all in **today's krónur**:

- **peak event** `t*` = the event maximising `amount / CPI(eventMonth)`; on ties, the **most recent** such event.
- `peakValueToday = requiredToday(amount(t*), t*, cpi)` = `amount(t*) × CPI(today) / CPI(t*)`
- `nowValue = amount(mostRecentEvent)` (today's salary, already in today's krónur)
- `monthlyLoss = peakValueToday − nowValue`
- `declinePct = monthlyLoss / peakValueToday` (0 when current *is* the peak)
- `raiseToReturn = peakValueToday / nowValue − 1` (= `monthlyLoss / nowValue`)
- `lifetimePct = nowValue / firstValueToday − 1`, where `firstValueToday = requiredToday(amount(firstEvent), firstEvent.month, cpi)` — the real change since the first salary (may be positive or negative).

**Worked example (the user's data):** 1.6M set 2020 (`CPI≈2.10`), now 1.8M (`CPI(today)≈2.64`). `peakValueToday = 1.6M×2.64/2.10 ≈ 2.011M`; `monthlyLoss ≈ 211.000`; `declinePct ≈ 10.5%`; `raiseToReturn ≈ 11.7%`; `lifetimePct ≈ +241%`. Matches the felt story: up a lot since 2006, but down ~10% from the 2020 peak.

**Why this unifies things:** for a *single* salary the peak is the month it was set, so "decline from peak" reduces exactly to "inflation since you set it" — the same model with no special case.

## The chart — three frames + peak marker

A small **frame toggle** (chips, mirroring the lens chooser). Each frame plots the salary line (`nominal`, step) plus one comparison line:

| Frame | Chip (Icelandic) | Comparison line | Question it answers |
|-------|------------------|-----------------|---------------------|
| `today` *(default)* | "Á verðlagi í dag" | `amount × CPI(today)/CPI(month)` (real value in today's krónur) | "What were my past salaries worth in today's money — and when did I peak?" |
| `origin` | "Á verðlagi þá" | `amount × CPI(first)/CPI(month)` (real value in first-month krónur — current behaviour) | "How much has the króna shrunk?" |
| `keepPace` | "Hélt í við verðbólgu?" | `amount(first) × CPI(month)/CPI(first)` (salary needed to hold the starting purchasing power) | "Is my pay keeping up with inflation, and when did it fall behind?" |

- **Default = `today`**: the real-value line is in relatable krónur, where the peak (≈2.0M in 2020) visibly sits above today (1.8M).
- **Peak marker**: a dot + label ("hámark · maí 2020") on the comparison line at `t*`.
- **Sign-aware band/readout**: the band between the two lines is **coral** where the salary's real line is below its reference (erosion) and **glacier** where above (gain) — computed per frame, per segment. The scrubbed readout shows the active month's gain/loss vs that frame's reference, coloured by sign (no more "everything is loss"). The today-dot/label and the anchor note become frame-specific copy.

## Payoff card + lens chooser — re-based on the peak

- **Headline (sign-aware, peak-led):** when below peak — *"Kaupmáttur þinn náði hámarki í {peakMonth}. Síðan hefur hann rýrnað um {declinePct} — eða {monthlyLoss} á mánuði,"* with a quiet secondary line *"(Frá {firstMonth} hefur kaupmátturinn samt {aukist/rýrnað} um {|lifetimePct|}.)"*.
- **At the peak** (`monthlyLoss ≤ 0`): a positive state — *"Kaupmáttur þinn hefur aldrei verið hærri,"* secondary lifetime line — and the lens chooser is hidden.
- **Lenses re-based:** the lens chooser keys off `monthlyLoss` instead of "since last raise." Math is unchanged except its source (`computeLenses` already derives everything from `{gap, current}`): rent/food/lífsgæði divide `monthlyLoss` by the anchors; the raise lens becomes **"raise to return to your peak"** = `raiseToReturn` (= `monthlyLoss/nowValue`, the same formula it already uses). Only the raise-lens copy changes wording.

## Architecture & files

- **`src/lib/inflation.ts`**
  - Add `analyzePurchasingPower(events, cpi): PurchasingPower | null` → `{ peakMonth, peakValueToday, nowValue, monthlyLoss, declinePct, raiseToReturn, lifetimePct, firstMonth }` (null if no events). Pure; reuses `requiredToday`.
  - Generalise `buildSeries(events, cpi, frame: ChartFrame)`: rename the `SeriesPoint.real` field to `comparison` and compute it per frame (`origin` = current formula). `ChartFrame = "today" | "origin" | "keepPace"`.
- **`src/lib/lenses.ts`** — replace `monthlyGap` with a thin adapter over `analyzePurchasingPower` returning the existing `Gap` shape `{ gap: monthlyLoss, current: nowValue, month: peakMonth }`; `computeLenses` is unchanged. Update the `raise` lens copy call site only.
- **`src/components/Chart.tsx`** — owns the frame toggle (`useState<ChartFrame>("today")`); builds its own series via `buildSeries(events, cpi, frame)` (so its prop changes from `series` to `events` + `cpi`); renders the peak marker and sign-aware band/readout.
- **`src/components/PayoffCard.tsx`** — peak-aware, sign-aware headline + secondary line + positive state; lenses fed from the re-based gap.
- **`src/app.tsx`** — stop pre-computing `series`; pass `events` + `cpi` to `<Chart>`.
- **`src/copy.ts`** — frame chip labels, peak/headline/secondary templates (sign-aware verbs), per-frame anchor notes, positive-state copy.
- **`src/styles.css`** — frame-chip styles (reuse lens-chip tokens), peak marker, sign-aware (coral/glacier) band + readout.

## Edge cases
- `< 2` points / no events → chart hidden (as today); payoff renders nothing.
- Current is the peak (`monthlyLoss ≤ 0`) → positive headline, lenses hidden, no decline drawn.
- Single salary → peak = its set month; decline = inflation since (consistent).
- `lifetimePct < 0` (real fell overall) → secondary line uses the "rýrnað" verb; still coherent.
- Peak ties → most recent qualifying event (conservative decline duration).

## Testing
- **`tests/inflation.test.ts`** — extend: `analyzePurchasingPower` (the worked example numbers; single-salary = inflation-since-set; all-rising → `monthlyLoss = 0`, peak = today; tie handling; `lifetimePct` sign), and `buildSeries` per frame (the three comparison-line formulas, `origin` unchanged). Update existing `buildSeries` tests for the `real`→`comparison` rename.
- **`tests/lenses.test.ts`** — the gap now comes from the peak; assert the re-based `monthlyLoss`/`raiseToReturn` feed `computeLenses` correctly.
- Chart/PayoffCard remain manual/Playwright-verified (no component test harness).

## Out of scope (v1)
A free reference-year picker (start/peak are auto-derived), animated frame transitions, per-period inflation-rate readout on scrub (the keep-pace frame already exposes aggressive periods visually; revisit later), and any CPI-pipeline change.
