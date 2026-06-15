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

/** Monochrome stroke icons, matching the lock icon style used elsewhere. */
function lensIconPaths(lens: LensKey) {
  switch (lens) {
    case "raise":
      return (
        <>
          <polyline points="3 17 9 11 13 15 21 7" />
          <polyline points="15 7 21 7 21 13" />
        </>
      );
    case "rent":
      return (
        <>
          <path d="M4 11l8-6 8 6" />
          <path d="M6 10v9h12v-9" />
        </>
      );
    case "food":
      return (
        <>
          <path d="M5 8h14l-1.1 9.2a2 2 0 0 1-2 1.8H8.1a2 2 0 0 1-2-1.8L5 8z" />
          <path d="M9 8V6.5a3 3 0 0 1 6 0V8" />
        </>
      );
    case "life":
      return (
        <>
          <path d="M21 3 3 10l7 3 3 7 8-17Z" />
          <path d="m10 13 4-4" />
        </>
      );
  }
}

function LensIcon({ lens }: { lens: LensKey }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      {lensIconPaths(lens)}
    </svg>
  );
}

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

  // Render the loss amount in coral (the system colour for lost value) by
  // splitting the title template around the formatted figure.
  const amount = formatISK(gap.gap);
  const [before, after] = copy.payoff.title(amount).split(amount);

  return (
    <section class="payoff card rise rise-2" aria-labelledby="payoff-title">
      <h2 id="payoff-title" class="payoff-title">
        {before}
        <span class="payoff-amount numeric">{amount}</span>
        {after}
      </h2>

      <p id="lens-pick" class="payoff-pick">{copy.payoff.pickLabel}</p>
      <div class="lens-chips" role="group" aria-labelledby="lens-pick">
        {lenses.map((l) => (
          <button
            key={l.key}
            type="button"
            aria-pressed={l.key === selected}
            class={`lens-chip${l.key === selected ? " is-on" : ""}`}
            onClick={() => setSelected(l.key)}
          >
            <LensIcon lens={l.key} />
            {copy.lenses.chips[l.key]}
          </button>
        ))}
      </div>

      <div class="lens-result" aria-live="polite">
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
