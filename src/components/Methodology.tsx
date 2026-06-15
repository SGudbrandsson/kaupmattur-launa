import { copy } from "../copy";
import { getCpi } from "../lib/cpi";
import { formatDateLong, formatMonth } from "../lib/format";

export function Methodology() {
  const cpi = getCpi();
  const m = copy.method;
  const fetched = formatDateLong(cpi.fetchedAt);
  return (
    <>
      <section class="method">
        <h2>{m.title}</h2>
        <p>{m.p1}</p>
        <p>{m.p2}</p>
        <span class="formula">{m.formula}</span>
        <details class="verify">
          <summary>{copy.privacy.howTitle}</summary>
          <p>{copy.privacy.howBody}</p>
        </details>
        <div class="source">
          <span class="data-badge">{m.dataThrough(formatMonth(cpi.lastMonth))}</span>
          <br />
          <strong>{m.sourceLabel}:</strong> {m.source}
          <br />
          {m.updatedAt(fetched)}
        </div>
      </section>
      <footer class="colophon">{copy.footer.privacyReminder}</footer>
    </>
  );
}
