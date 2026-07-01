import { useEffect, useState } from "preact/hooks";
import { copy } from "../copy";
import type { CpiData } from "../lib/cpi";
import { compareMonths } from "../lib/cpi";
import type { SalaryEvent } from "../lib/inflation";
import { realValue } from "../lib/inflation";
import { MANY_ENTRIES_THRESHOLD } from "../lib/profiles";
import { Disclosure } from "./Disclosure";
import {
  formatISK,
  formatISKDelta,
  formatMonth,
  formatPercent,
} from "../lib/format";

interface SummaryCardsProps {
  events: SalaryEvent[];
  cpi: CpiData;
  profileKey: string;
}

export function SummaryCards({ events, cpi, profileKey }: SummaryCardsProps) {
  const s = copy.summary;
  const [expanded, setExpanded] = useState(
    () => events.length <= MANY_ENTRIES_THRESHOLD,
  );
  // Reset on profile switch only (not on every keystroke) so an in-progress
  // edit that crosses the threshold never collapses the table mid-typing.
  useEffect(() => {
    setExpanded(events.length <= MANY_ENTRIES_THRESHOLD);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileKey]);

  if (events.length === 0) return null;
  const sorted = [...events].sort((a, b) => compareMonths(b.month, a.month));

  const table = (
    <div class="summary-table-wrap">
      <table class="summary-table">
        <thead>
          <tr>
            <th scope="col">{s.thMonth}</th>
            <th scope="col">{s.thSet}</th>
            <th scope="col">{s.thReal}</th>
            <th scope="col">{s.thChange}</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((event) => {
            const isTooNew = event.month === cpi.lastMonth;
            const real = realValue(event.amount, event.month, cpi.lastMonth, cpi);
            const delta = real - event.amount;
            const ratio = real / event.amount - 1;
            return (
              <tr key={event.month}>
                <th scope="row" class="summary-td-month">{formatMonth(event.month)}</th>
                <td class="numeric">{formatISK(event.amount)}</td>
                <td class="numeric">{isTooNew ? formatISK(event.amount) : formatISK(real)}</td>
                <td>
                  {isTooNew ? (
                    <span class="summary-too-new">{s.tooNew}</span>
                  ) : (
                    <span class={`delta-chip numeric${delta < 0 ? " is-loss" : ""}`}>
                      {formatISKDelta(delta)} ({formatPercent(ratio)})
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <section class="summary" aria-labelledby="summary-title">
      <h2 id="summary-title">{s.title}</h2>
      <Disclosure
        summary={null}
        expanded={expanded}
        onToggle={() => setExpanded((v) => !v)}
        toggleLabel={expanded ? s.hide : s.showAll(events.length)}
        regionId="summary-detail"
      >
        {table}
      </Disclosure>
    </section>
  );
}
