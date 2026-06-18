import { useEffect, useState } from "preact/hooks";
import { copy } from "../copy";
import type { CpiData, MonthKey } from "../lib/cpi";
import type { SalaryEvent } from "../lib/inflation";
import { MONTHS_LONG, formatISK, parseAmount } from "../lib/format";
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
  onChange: (month: MonthKey) => void;
}

export function MonthPicker({ month, cpi, rowId, onChange }: MonthPickerProps) {
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
  isExample: boolean;
  onChangeRow: (id: string, patch: Partial<Omit<DraftRow, "id">>) => void;
  onAddRow: () => void;
  onRemoveRow: (id: string) => void;
  onClearExample: () => void;
  onAiApply: (events: SalaryEvent[]) => void;
}

export function SalaryForm(props: SalaryFormProps) {
  const f = copy.form;

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

  return (
    <section class="salary rise rise-3" aria-labelledby="salary-title">
      <h2 id="salary-title">{f.title}</h2>
      <p class="section-intro">{f.intro}</p>
      <p class="form-privacy">
        <LockIcon />
        {copy.privacy.inline}
      </p>
      {aiReady && (
        <AiAutofill
          cpi={props.cpi}
          onApply={props.onAiApply}
          speechLangs={speechLangs}
        />
      )}
      {props.isExample && (
        <div class="example-banner">
          <span class="example-tag">{f.exampleTag}</span>
          <span>{f.exampleNote}</span>
          <button type="button" class="example-cta" onClick={props.onClearExample}>
            {f.exampleCta}
          </button>
        </div>
      )}
      <div class="entry-list">
        {props.rows.map((row) => {
          const error = props.errors.get(row.id);
          return (
            <div class={`entry-card card${error ? " has-error" : ""}`} key={row.id}>
              <MonthPicker
                month={row.month}
                cpi={props.cpi}
                rowId={row.id}
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
              {props.rows.length > 1 && (
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
      <button type="button" class="add-row" onClick={props.onAddRow}>
        <span aria-hidden="true">+</span> {f.addButton}
      </button>
    </section>
  );
}
