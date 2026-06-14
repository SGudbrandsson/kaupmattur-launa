import { useState } from "preact/hooks";
import { copy } from "../copy";
import type { CpiData } from "../lib/cpi";
import type { SalaryEvent } from "../lib/inflation";
import { getAnchors } from "../lib/anchors";
import {
  type LensKey,
  type LensValue,
  computeLenses,
  monthlyGap,
} from "../lib/lenses";
import { formatDecimal, formatISK, formatPercent } from "../lib/format";

interface PayoffCardProps {
  events: SalaryEvent[];
  cpi: CpiData;
  onTryOwn?: () => void;
  isExample?: boolean;
}

const ORDER: LensKey[] = ["raise", "rent", "food", "life"];

function lensText(v: LensValue): string {
  const L = copy.lenses;
  switch (v.key) {
    case "raise":
      return L.raise(formatPercent(v.raisePct), formatDecimal(v.extraDays));
    case "rent":
      return L.rent(formatPercent(v.monthsOfRent));
    case "food":
      return L.food(formatDecimal(v.weeksOfFood));
    case "life":
      return L.life(formatISK(v.annualLoss), formatDecimal(v.trips));
  }
}

export function PayoffCard({ events, cpi, onTryOwn, isExample }: PayoffCardProps) {
  const [selected, setSelected] = useState<LensKey>("raise");
  const gap = monthlyGap(events, cpi);

  if (!gap) {
    if (events.length === 0) return null;
    return (
      <section class="payoff card rise rise-2">
        <p class="payoff-held">{copy.payoff.held}</p>
      </section>
    );
  }

  const lenses = computeLenses(gap, cpi, getAnchors());
  const active = lenses.find((l) => l.key === selected) ?? lenses[0];
  const basisLabel =
    active.basis === "exact" ? copy.lenses.basisExact : copy.lenses.basisApprox;

  return (
    <section class="payoff card rise rise-2" aria-labelledby="payoff-title">
      <h2 id="payoff-title" class="payoff-title">
        {copy.payoff.title(formatISK(gap.gap))}
      </h2>

      <p class="payoff-pick">{copy.payoff.pickLabel}</p>
      <div class="lens-chips" role="tablist" aria-label={copy.payoff.pickLabel}>
        {ORDER.map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={key === selected}
            class={`lens-chip${key === selected ? " is-on" : ""}`}
            onClick={() => setSelected(key)}
          >
            {copy.lenses.chips[key]}
          </button>
        ))}
      </div>

      <div class="lens-result" role="tabpanel">
        <p class="lens-text">{lensText(active)}</p>
        <span class={`lens-basis is-${active.basis}`}>{basisLabel}</span>
      </div>

      {isExample && onTryOwn && (
        <button type="button" class="payoff-cta" onClick={onTryOwn}>
          {copy.payoff.cta}
        </button>
      )}
    </section>
  );
}
