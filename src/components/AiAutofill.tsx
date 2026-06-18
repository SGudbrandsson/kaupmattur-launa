import { useRef, useState } from "preact/hooks";
import { copy } from "../copy";
import type { CpiData } from "../lib/cpi";
import type { SalaryEvent } from "../lib/inflation";
import { formatISK } from "../lib/format";
import { MonthPicker, analyzeRows, type DraftRow } from "./SalaryForm";
import { normalizeRows, type RawRow } from "../lib/ai/normalizeRows";
import { createExtractor, type Extractor } from "../lib/ai/localModel";
import {
  createDictation,
  type Dictation,
  type SpeechLang,
} from "../lib/ai/speech";

interface AiAutofillProps {
  cpi: CpiData;
  onApply: (events: SalaryEvent[]) => void;
  /** Languages with on-device STT (from speechLangsAvailable). May be empty. */
  speechLangs: SpeechLang[];
}

type Phase = "describe" | "downloading" | "preview" | "error";

function uid(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

function SparkIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2 2M16 16l2 2M18 6l-2 2M8 16l-2 2" />
    </svg>
  );
}
function MicIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}
function ArrowIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export function AiAutofill({ cpi, onApply, speechLangs }: AiAutofillProps) {
  const c = copy.ai;
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("describe");
  const [text, setText] = useState("");
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [dropped, setDropped] = useState(0);
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState("");
  const [refineText, setRefineText] = useState("");
  const [listening, setListening] = useState(false);
  const [speechLang, setSpeechLang] = useState<SpeechLang>(
    speechLangs[0] ?? "is-IS",
  );
  const extractorRef = useRef<Extractor | null>(null);
  const dictationRef = useRef<Dictation | null>(null);

  function close() {
    extractorRef.current?.destroy();
    extractorRef.current = null;
    dictationRef.current?.stop();
    dictationRef.current = null;
    setOpen(false);
    setPhase("describe");
    setText("");
    setRows([]);
    setDropped(0);
    setProgress(0);
    setErrorMsg("");
    setRefineText("");
    setListening(false);
  }

  async function ensureExtractor(): Promise<Extractor> {
    if (extractorRef.current) return extractorRef.current;
    setPhase("downloading");
    const ex = await createExtractor((f) => setProgress(f));
    extractorRef.current = ex;
    return ex;
  }

  function showRows(raw: RawRow[]) {
    const { rows: events, dropped: d } = normalizeRows(raw, cpi);
    setRows(
      events.map((e) => ({
        id: uid(),
        month: e.month,
        amountText: formatISK(e.amount).replace(" kr.", ""),
      })),
    );
    setDropped(d);
    setPhase("preview");
  }

  async function analyze() {
    if (!text.trim()) return;
    try {
      const ex = await ensureExtractor();
      const raw = await ex.extract(text.trim());
      if (raw.length === 0) {
        setPhase("describe");
        setErrorMsg(c.errorNoParse);
        return;
      }
      setErrorMsg("");
      showRows(raw);
    } catch {
      setPhase("error");
      setErrorMsg(c.errorGeneric);
    }
  }

  async function refine() {
    if (!refineText.trim() || !extractorRef.current) return;
    try {
      const raw = await extractorRef.current.refine(refineText.trim());
      setRefineText("");
      if (raw.length > 0) showRows(raw);
    } catch {
      setPhase("error");
      setErrorMsg(c.errorGeneric);
    }
  }

  function toggleDictation() {
    if (listening) {
      dictationRef.current?.stop();
      return;
    }
    try {
      const d = createDictation(speechLang, {
        onPartial: () => {},
        onFinal: (t) => setText((prev) => (prev ? `${prev} ${t}` : t)),
        onError: () => setListening(false),
        onEnd: () => setListening(false),
      });
      dictationRef.current = d;
      d.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  }

  function editRow(id: string, patch: Partial<Omit<DraftRow, "id">>) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  function removeRow(id: string) {
    setRows((rs) => rs.filter((r) => r.id !== id));
  }

  function apply() {
    const { events } = analyzeRows(rows);
    onApply(events);
    close();
  }

  if (!open) {
    return (
      <button type="button" class="ai-open" onClick={() => setOpen(true)}>
        <SparkIcon />
        {c.button}
      </button>
    );
  }

  return (
    <div class="ai-panel">
      {phase === "downloading" && (
        <div class="ai-download">
          <p class="ai-download-title">{c.downloadTitle}</p>
          <p>{c.downloadBody}</p>
          <div class="ai-bar">
            <i style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <p class="ai-download-hint">{c.downloadHint}</p>
        </div>
      )}

      {(phase === "describe" || phase === "error") && (
        <>
          <p class="ai-title">{c.describeTitle}</p>
          <div class="ai-ta-wrap">
            <textarea
              class="ai-ta"
              rows={3}
              placeholder={c.placeholder}
              value={text}
              onInput={(e) => setText(e.currentTarget.value)}
            />
            {speechLangs.length > 0 && (
              <button
                type="button"
                class={`ai-mic${listening ? " is-live" : ""}`}
                aria-pressed={listening}
                aria-label={listening ? c.micStop : c.micStart}
                onClick={toggleDictation}
              >
                <MicIcon />
              </button>
            )}
          </div>
          {speechLangs.length > 1 && (
            <div class="ai-lang" role="group" aria-label={c.langLabel}>
              {speechLangs.map((l) => (
                <button
                  key={l}
                  type="button"
                  aria-pressed={l === speechLang}
                  class={`ai-lang-opt${l === speechLang ? " is-on" : ""}`}
                  onClick={() => setSpeechLang(l)}
                >
                  {l === "is-IS" ? "IS" : "EN"}
                </button>
              ))}
            </div>
          )}
          <p class="ai-priv">{c.privacy}</p>
          {errorMsg && <p class="ai-error">{errorMsg}</p>}
          <div class="ai-acts">
            <button type="button" class="ai-primary" onClick={analyze}>
              {c.analyze}
            </button>
            <button type="button" class="ai-ghost" onClick={close}>
              {c.cancel}
            </button>
          </div>
        </>
      )}

      {phase === "preview" && (
        <>
          <p class="ai-title">{c.previewTitle}</p>
          <div class="ai-rows">
            {rows.map((r) => (
              <div class="ai-row" key={r.id}>
                <MonthPicker
                  month={r.month}
                  cpi={cpi}
                  rowId={`ai-${r.id}`}
                  onChange={(month) => editRow(r.id, { month })}
                />
                <label class="field">
                  <span class="field-label">{copy.form.amountLabel}</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    autocomplete="off"
                    value={r.amountText}
                    onInput={(e) =>
                      editRow(r.id, { amountText: e.currentTarget.value })
                    }
                  />
                </label>
                <button
                  type="button"
                  class="ai-row-remove"
                  aria-label={copy.form.removeLabel}
                  onClick={() => removeRow(r.id)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          {dropped > 0 && <p class="ai-dropped">{c.dropped(dropped)}</p>}
          <p class="ai-replace">{c.replaceNote}</p>
          <div class="ai-refine">
            <input
              class="ai-refine-input"
              type="text"
              placeholder={c.refinePlaceholder}
              value={refineText}
              onInput={(e) => setRefineText(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") refine();
              }}
            />
            <button
              type="button"
              class="ai-refine-send"
              aria-label={c.refineSend}
              onClick={refine}
            >
              <ArrowIcon />
            </button>
          </div>
          <div class="ai-acts">
            <button
              type="button"
              class="ai-primary"
              disabled={rows.length === 0}
              onClick={apply}
            >
              {c.apply}
            </button>
            <button type="button" class="ai-ghost" onClick={close}>
              {c.cancel}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
