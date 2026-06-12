import { copy } from "../copy";
import type { CpiData } from "../lib/cpi";
import { compareMonths } from "../lib/cpi";
import type { SalaryEvent } from "../lib/inflation";
import { realValue, requiredToday } from "../lib/inflation";
import {
  formatISK,
  formatISKDelta,
  formatMonth,
  formatPercent,
} from "../lib/format";

interface SummaryCardsProps {
  events: SalaryEvent[];
  cpi: CpiData;
}

export function SummaryCards({ events, cpi }: SummaryCardsProps) {
  if (events.length === 0) return null;
  const s = copy.summary;
  const sorted = [...events].sort((a, b) => compareMonths(b.month, a.month));

  return (
    <section class="summary" aria-labelledby="summary-title">
      <h2 id="summary-title">{s.title}</h2>
      <div class="summary-list">
        {sorted.map((event) => {
          const isTooNew = event.month === cpi.lastMonth;
          const real = realValue(event.amount, event.month, cpi.lastMonth, cpi);
          const delta = real - event.amount;
          const ratio = real / event.amount - 1;
          return (
            <article class="summary-card card" key={event.month}>
              <header class="summary-when">
                {s.setIn(formatMonth(event.month))} ·{" "}
                <span class="numeric">{formatISK(event.amount)}</span>
              </header>
              {isTooNew ? (
                <p class="summary-too-new">{s.tooNew}</p>
              ) : (
                <>
                  <div class="summary-real">
                    <span class="summary-real-label">{s.realToday}</span>
                    <span class="summary-real-value numeric">{formatISK(real)}</span>
                    <span
                      class={`delta-chip numeric${delta < 0 ? " is-loss" : ""}`}
                    >
                      {formatISKDelta(delta)} ({formatPercent(ratio)})
                    </span>
                  </div>
                  <p class="summary-required">
                    {s.required(formatISK(requiredToday(event.amount, event.month, cpi)))}
                  </p>
                </>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
