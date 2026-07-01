import { useEffect, useState } from "preact/hooks";
import { copy } from "../copy";
import type { CpiData, MonthKey } from "../lib/cpi";
import type { SalaryEvent } from "../lib/inflation";
import { MANY_ENTRIES_THRESHOLD, historySpan, type PresetKind } from "../lib/profiles";
import { MONTHS_LONG, formatISK, parseAmount } from "../lib/format";
import { Disclosure } from "./Disclosure";
import { AiAutofill } from "./AiAutofill";
import { modelAvailability } from "../lib/ai/localModel";
import { speechLangsAvailable, type SpeechLang } from "../lib/ai/speech";

function LockIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2.2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <rect x="4" y="11" width="16" height="10" rx="2.5" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

/** A row as the user is editing it; month is always valid by construction. */
export interface DraftRow {
  id: string;
  month: MonthKey;
  amountText: string;
}

export interface RowAnalysis {
  events: SalaryEvent[];
  errors: Map<string, string>;
}

const MAX_AMOUNT = 99_000_000;

/** Turn draft rows into valid salary events plus per-row error messages. */
export function analyzeRows(rows: DraftRow[]): RowAnalysis {
  const errors = new Map<string, string>();
  const events: SalaryEvent[] = [];
  const seenMonths = new Set<MonthKey>();
  for (const row of rows) {
    const text = row.amountText.trim();
    if (text === "") continue; // a fresh row isn't an error yet
    const amount = parseAmount(text);
    if (amount === null) {
      errors.set(row.id, copy.form.errorAmount);
      continue;
    }
    if (amount > MAX_AMOUNT) {
      errors.set(row.id, copy.form.errorAmountTooHigh);
      continue;
    }
    if (seenMonths.has(row.month)) {
      errors.set(row.id, copy.form.errorDuplicateMonth);
      continue;
    }
    seenMonths.add(row.month);
    events.push({ month: row.month, amount });
  }
  return { events, errors };
}

interface MonthPickerProps {
  month: MonthKey;
  cpi: CpiData;
  rowId: string;
  disabled?: boolean;
  onChange: (month: MonthKey) => void;
}

export function MonthPicker({ month, cpi, rowId, disabled, onChange }: MonthPickerProps) {
  const [firstYear, firstMonth] = cpi.firstMonth.split("-").map(Number);
  const [lastYear, lastMonth] = cpi.lastMonth.split("-").map(Number);
  const [year, monthNum] = month.split("-").map(Number);

  const years = [];
  for (let y = lastYear; y >= firstYear; y--) years.push(y);

  const minMonth = year === firstYear ? firstMonth : 1;
  const maxMonth = year === lastYear ? lastMonth : 12;

  const setYearMonth = (y: number, m: number) => {
    const lo = y === firstYear ? firstMonth : 1;
    const hi = y === lastYear ? lastMonth : 12;
    const clamped = Math.min(Math.max(m, lo), hi);
    onChange(`${y}-${String(clamped).padStart(2, "0")}`);
  };

  return (
    <div class="month-picker">
      <label class="field">
        <span class="field-label">{copy.form.monthLabel}</span>
        <select
          aria-label={copy.form.monthLabel}
          value={monthNum}
          id={`month-${rowId}`}
          disabled={disabled}
          onChange={(e) => setYearMonth(year, Number(e.currentTarget.value))}
        >
          {MONTHS_LONG.map((name, i) => (
            <option
              key={name}
              value={i + 1}
              disabled={i + 1 < minMonth || i + 1 > maxMonth}
            >
              {name}
            </option>
          ))}
        </select>
      </label>
      <label class="field field-year">
        <span class="field-label">{copy.form.yearLabel}</span>
        <select
          aria-label={copy.form.yearLabel}
          value={year}
          id={`year-${rowId}`}
          disabled={disabled}
          onChange={(e) => setYearMonth(Number(e.currentTarget.value), monthNum)}
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

interface SalaryFormProps {
  rows: DraftRow[];
  errors: Map<string, string>;
  cpi: CpiData;
  readOnly: boolean;
  presetSource?: string;
  presetKind?: PresetKind;
  profileKey: string;
  onChangeRow: (id: string, patch: Partial<Omit<DraftRow, "id">>) => void;
  onAddRow: () => void;
  onRemoveRow: (id: string) => void;
  onFork: () => void;
  onAiApply: (events: SalaryEvent[]) => void;
}

export function SalaryForm(props: SalaryFormProps) {
  const f = copy.form;

  const filled = props.rows.filter((r) => r.amountText.trim() !== "");
  const collapsible = filled.length > MANY_ENTRIES_THRESHOLD;
  const [expanded, setExpanded] = useState(() => !collapsible);
  // Reset ONLY on profile switch — never key on `collapsible`, or the form would
  // collapse out from under a user who crosses the threshold while typing.
  useEffect(() => {
    setExpanded(!collapsible);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.profileKey]);

  const [aiReady, setAiReady] = useState(false);
  const [speechLangs, setSpeechLangs] = useState<SpeechLang[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const availability = await modelAvailability();
      if (cancelled || availability === "unavailable") return;
      setAiReady(true);
      const langs = await speechLangsAvailable();
      if (cancelled) return;
      setSpeechLangs(langs);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleAmountBlur = (row: DraftRow, text: string) => {
    const amount = parseAmount(text);
    props.onChangeRow(row.id, {
      amountText:
        amount !== null && amount <= MAX_AMOUNT
          ? formatISK(amount).replace(" kr.", "")
          : text,
    });
  };

  const isEmpty = props.rows.every((r) => r.amountText.trim() === "");

  const span = historySpan(filled.map((r) => ({ month: r.month, amount: 0 })));
  const spanLabel =
    span.firstYear === span.lastYear
      ? String(span.firstYear)
      : `${span.firstYear}–${span.lastYear}`;

  const formBody = (
    <>
      <div class="entry-list">
        {props.rows.map((row) => {
          const error = props.errors.get(row.id);
          return (
            <div class={`entry-card card${error ? " has-error" : ""}`} key={row.id}>
              <MonthPicker
                month={row.month}
                cpi={props.cpi}
                rowId={row.id}
                disabled={props.readOnly}
                onChange={(month) => props.onChangeRow(row.id, { month })}
              />
              <label class="field field-amount">
                <span class="field-label">{f.amountLabel}</span>
                <div class="amount-wrap">
                  <input
                    type="text"
                    inputMode="numeric"
                    autocomplete="off"
                    placeholder={f.amountPlaceholder}
                    value={row.amountText}
                    disabled={props.readOnly}
                    aria-invalid={error ? "true" : undefined}
                    aria-describedby={error ? `err-${row.id}` : undefined}
                    onInput={(e) =>
                      props.onChangeRow(row.id, { amountText: e.currentTarget.value })
                    }
                    onBlur={(e) => handleAmountBlur(row, e.currentTarget.value)}
                  />
                  <span class="amount-suffix">{f.amountSuffix}</span>
                </div>
              </label>
              {!props.readOnly && props.rows.length > 1 && (
                <button
                  type="button"
                  class="remove-row"
                  aria-label={f.removeLabel}
                  title={f.removeLabel}
                  onClick={() => props.onRemoveRow(row.id)}
                >
                  ×
                </button>
              )}
              {error && (
                <p class="field-error" id={`err-${row.id}`} role="alert">
                  {error}
                </p>
              )}
            </div>
          );
        })}
      </div>
      {!props.readOnly && (
        <button type="button" class="add-row" onClick={props.onAddRow}>
          <span aria-hidden="true">+</span> {f.addButton}
        </button>
      )}
      {!props.readOnly && isEmpty && (
        <p class="form-empty">{copy.profiles.emptyState}</p>
      )}
    </>
  );

  const expandLabel = props.readOnly ? f.showEntries : f.editHistory;

  return (
    <section class="salary rise rise-3" aria-labelledby="salary-title">
      <h2 id="salary-title">{f.title}</h2>
      <p class="section-intro">{f.intro}</p>
      <p class="form-privacy">
        <LockIcon />
        {copy.privacy.inline}
      </p>
      {aiReady && !props.readOnly && (
        <AiAutofill
          cpi={props.cpi}
          onApply={props.onAiApply}
          speechLangs={speechLangs}
        />
      )}
      {props.readOnly && (
        <div class="preset-banner">
          <span>{copy.profiles.presetLockedBanner(props.presetSource ?? "")}</span>
          {props.presetKind && (
            <span class="preset-kind-note">
              {copy.profiles.presetKinds[props.presetKind].banner}
            </span>
          )}
          <button type="button" class="example-cta" onClick={props.onFork}>
            {copy.profiles.forkCta}
          </button>
        </div>
      )}
      {collapsible ? (
        <Disclosure
          summary={
            <span class="history-collapsed-line numeric">
              {f.historySummary(filled.length, spanLabel)}
            </span>
          }
          expanded={expanded}
          onToggle={() => setExpanded((v) => !v)}
          toggleLabel={expanded ? f.hideEntries : expandLabel}
          regionId="salary-entries"
        >
          {formBody}
        </Disclosure>
      ) : (
        formBody
      )}
    </section>
  );
}
