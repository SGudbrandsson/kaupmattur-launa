# Payoff-first redesign + tangible "lens chooser"

**Date:** 2026-06-14
**Status:** Approved (brainstorm), pending implementation plan
**Supersedes nothing — extends the v1 design (`2026-06-12-isk-value-web-design.md`).**

## Problem

The site answers an abstract question with an abstract answer. On mobile, the
entire first screen is read-only — kicker, headline, lead paragraph, and the
privacy badge — so nothing interactive and no payoff is visible until the user
scrolls. There is no call to action above the fold, and the result (the loss of
purchasing power) is shown only as króna figures, which don't land emotionally.

## Goals

1. **Payoff above the fold.** Show the emotional result immediately, with a clear
   CTA, instead of a privacy disclaimer in the most valuable real estate.
2. **Make the loss tangible.** Translate the abstract króna loss into things
   people feel — rent, food, lifestyle, the raise needed to stand still.
3. **Let the user choose the comparison.** The lens that matters differs per
   person (renter vs. parent vs. saver). Choosing is itself the hook.
4. **Stay honest.** Exact lenses are labelled exact; approximate ones are
   labelled "um það bil." No overclaiming — this is core to the site's ethos.

Non-goals: an onboarding wizard, multi-step input flow, or any new runtime
network request. The privacy posture (salary never leaves the browser) is
unchanged.

## Chosen direction

From the brainstorm: **payoff-first layout (direction B)** with a **user-driven
lens chooser** sitting directly under the headline/chart. Four lenses for v1:

| Lens | Chip | Basis | Source |
|------|------|-------|--------|
| Raise needed (default) | 📈 Launahækkun | **exact** | CPI + salary |
| Rent | 🏠 Leiga | approximate | bundled anchor |
| Food | 🛒 Matur | approximate | bundled anchor |
| Quality of life | ✈️ Lífsgæði | approximate (annualized) | bundled anchor |

**Default lens:** 📈 Launahækkun — exact, universal, most action-oriented.

## The core number

All lenses are framed off one quantity: the **monthly purchasing-power gap in
today's króna**, for the most recent salary entry set in month `d`:

```
required_today = nominal_current × CPI(today) / CPI(d)
loss_monthly   = required_today − nominal_current      (≥ 0)
```

`loss_monthly` is already in today's price level, so anchor prices must also be
expressed in today's króna (see Data).

## Lens computations

Let `cpiToday = CPI(lastMonth)`, `cpiRef = CPI(anchor.referenceMonth)`, and
`anchorToday = anchor.price × cpiToday / cpiRef` (inflate the reference price to
today using the overall CPI).

- **Launahækkun (exact):**
  `raisePct = CPI(today)/CPI(d) − 1` → *"þú þyrftir X% hækkun bara til að standa
  í stað."* Plus the days-of-work reframe:
  `extraDays = loss_monthly / (nominal_current / 21.67)` → *"≈ N daga til
  viðbótar í hverjum mánuði."* (21.67 = average working days/month.)
- **Leiga (approx):** `months = loss_monthly / rentAnchorToday` →
  *"um {fraction} af mánaðarleigu …"* (rendered as "þriðjungur", "helmingur",
  etc. for clean fractions, otherwise a percentage).
- **Matur (approx):** `weeks = loss_monthly / weeklyGroceryAnchorToday` →
  *"≈ {weeks} vikur af mat fyrir fjögurra manna fjölskyldu á mánuði."*
- **Lífsgæði (approx, annualized):** `lossAnnual = loss_monthly × 12`;
  `trips = lossAnnual / tripAnchorToday` →
  *"~{lossAnnual} kr á ári — eins og {trips} utanlandsferðir fyrir tvo (dæmi)."*

Each approximate result renders the **"um það bil"** badge; exact results render
the **"nákvæmt"** badge.

Edge cases: when `loss_monthly` is 0 or negative (salary kept up / too new),
the payoff card shows the existing "of nýtt"/"hélt í við verðbólguna" messaging
and the lens chooser is hidden.

## Data: `src/data/anchors.json`

A small, bundled, human-editable file. No new network requests — it ships with
the page exactly like `cpi.json`.

```json
{
  "source": "National averages, approximate. See README for provenance.",
  "referenceMonth": "2025-01",
  "anchors": {
    "rent_3room_capital":        { "price": 280000, "unit": "month" },
    "weekly_groceries_family4":  { "price": 35000,  "unit": "week"  },
    "trip_abroad_two":           { "price": 250000, "unit": "trip"  }
  }
}
```

- Prices are national-average reference points at `referenceMonth`, inflated to
  `cpi.lastMonth` at render time, so they never go stale as CPI updates.
- v1 inflates every anchor by the **overall CPI** (already bundled). Per-component
  sub-indices (housing, food) are a documented future accuracy improvement, not
  v1 scope.
- Provenance and the "approximate national averages" caveat are documented in
  the README and surfaced via the "um það bil" badge + a tooltip/expander.

## Architecture

Fits the existing Preact + per-component structure. New/changed units:

- **`src/lib/lenses.ts`** (new) — pure functions: given `loss_monthly`,
  `nominal_current`, `cpi`, `d`, and loaded anchors, return a typed result per
  lens (`{ key, label, text, basis: 'exact' | 'approx' }`). No DOM, fully
  unit-testable. This is the heart of the feature and stays isolated from UI.
- **`src/data/anchors.json`** (new) — the reference basket above.
- **`src/components/PayoffCard.tsx`** (new) — headline loss + lens chips +
  result area + basis badge. Consumes `lenses.ts` output; holds only the
  "selected lens" UI state.
- **`src/components/SalaryForm.tsx`** — unchanged logic; gains a slim inline
  privacy line ("🔒 Reiknað í tækinu þínu — launin fara hvergi").
- **`src/app.tsx`** — reorder to payoff-first:
  `Hero (condensed) → PayoffCard → SalaryForm → Chart → Methodology`.
  The full `PrivacyBadge` section is demoted: its one-line reassurance moves next
  to the form, and the detailed "how to verify" content moves into
  `Methodology`. The component may be removed if nothing else uses it.
- **`src/copy.ts`** — add a `lenses` block (chip labels, result templates as
  functions, badge text, the "dæmi"/"um það bil" strings) and a short
  `payoff` block. All Icelandic, following the existing copy-centralization rule.

Data flow: `app.tsx` already computes `events`/`series`. It will also compute
`loss_monthly` (from the existing inflation series) and pass it plus the loaded
anchors into `PayoffCard`, which calls `lenses.ts` per selected chip. On first
visit the example salary drives a fully-rendered payoff (payoff-first), with the
existing "Prófa með mínum launum" CTA.

## Honesty & privacy

- Anchors are bundled; zero new network traffic. The Umami visit counter is the
  only request, unchanged.
- Exact vs. approximate is always visible via the badge; approximate lenses say
  "um það bil"; Lífsgæði says "dæmi."
- README updated with anchor provenance and the approximation caveat.

## Testing

- `tests/lenses.test.ts` (new): each lens formula against known CPI values and a
  fixed anchors fixture — exact raise %, days-of-work, rent fraction, food weeks,
  annualized lifestyle count, and correct `basis` labelling.
- Anchor inflation: a reference price inflates to the expected today-price for a
  known CPI ratio.
- Edge cases: `loss_monthly ≤ 0` hides the chooser and shows the "too new"/"kept
  up" messaging.
- Keep to existing vitest patterns; ~20% effort, new functionality only.

## Out of scope (v1)

- 🚗 Eldsneyti chip and any 5th lens (easy future add).
- Per-component CPI sub-indices for anchor inflation (use overall CPI for now).
- The category-breakdown bar chart (brainstorm style C) and the one-question
  onboarding hook (style C fold).
