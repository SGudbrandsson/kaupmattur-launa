# Local-AI salary autofill — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional, on-device "Fylla út með AI" feature that turns a plain-language (typed or spoken, Icelandic or English) salary history into editable table rows, gated entirely behind on-device browser APIs so the no-network privacy promise holds.

**Architecture:** Thin feature-detected wrappers over Chrome's Prompt API (`localModel.ts`) and the on-device Web Speech API (`speech.ts`); a pure, fully-tested `normalizeRows.ts` that turns model output into valid `SalaryEvent`s; an `AiAutofill.tsx` panel that owns the describe→preview→apply flow; and a `replaceRows` handler wired through `SalaryForm` into `app.tsx`. The feature renders only when `modelAvailability() !== "unavailable"`.

**Tech Stack:** Vite, Preact (TSX), TypeScript, Vitest. No new dependencies. Experimental browser APIs are declared ambiently and feature-detected.

Spec: `docs/superpowers/specs/2026-06-17-local-ai-salary-autofill-design.md`.

---

## File structure

- **Create** `src/types/web-ai.d.ts` — minimal ambient declaration of the `LanguageModel` global (not in TS lib).
- **Create** `src/lib/ai/normalizeRows.ts` — pure: `RawRow[]` → validated `SalaryEvent[]` + dropped count.
- **Create** `tests/normalizeRows.test.ts` — unit tests for the above.
- **Create** `src/lib/ai/localModel.ts` — Prompt API wrapper (`modelAvailability`, `createExtractor`).
- **Create** `src/lib/ai/speech.ts` — on-device Web Speech wrapper (`speechLangsAvailable`, `createDictation`).
- **Create** `src/components/AiAutofill.tsx` — the panel component.
- **Modify** `src/components/SalaryForm.tsx` — export `MonthPicker`; detect availability; render `<AiAutofill>`.
- **Modify** `src/app.tsx` — add `replaceRows`; pass `onAiApply` to `SalaryForm`.
- **Modify** `src/copy.ts` — add the `ai` block.
- **Modify** `src/styles.css` — AI panel styles.
- **Modify** `README.md` — note the optional on-device AI.

---

## Task 1: Ambient types for the Prompt API

**Files:**
- Create: `src/types/web-ai.d.ts`

- [ ] **Step 1: Create the declaration file**

Create `src/types/web-ai.d.ts`:

```ts
// Minimal ambient types for Chrome's experimental on-device Prompt API.
// These are NOT in TypeScript's DOM lib. Runtime code feature-detects them;
// this only makes the wrapper in src/lib/ai/localModel.ts typecheck.

export type AiAvailability =
  | "unavailable"
  | "downloadable"
  | "downloading"
  | "available";

export interface LanguageModelMonitor {
  addEventListener(
    type: "downloadprogress",
    listener: (event: { loaded: number }) => void,
  ): void;
}

export interface LanguageModelCreateOptions {
  monitor?: (monitor: LanguageModelMonitor) => void;
  initialPrompts?: Array<{
    role: "system" | "user" | "assistant";
    content: string;
  }>;
}

export interface LanguageModelPromptOptions {
  responseConstraint?: object;
}

export interface LanguageModelSession {
  prompt(input: string, options?: LanguageModelPromptOptions): Promise<string>;
  destroy(): void;
}

export interface LanguageModelStatic {
  availability(): Promise<AiAvailability>;
  create(options?: LanguageModelCreateOptions): Promise<LanguageModelSession>;
}

declare global {
  // eslint-disable-next-line no-var
  var LanguageModel: LanguageModelStatic | undefined;
  interface Window {
    LanguageModel?: LanguageModelStatic;
  }
}
```

- [ ] **Step 2: Verify it's picked up by the typechecker**

Run: `npx tsc --noEmit`
Expected: no errors. (The repo's `tsconfig` compiles `src/`, so the `.d.ts` is included automatically. The `export {}`-free `declare global` block augments the global scope.)

- [ ] **Step 3: Commit**

```bash
git add src/types/web-ai.d.ts
git commit -m "feat: ambient types for the on-device Prompt API"
```

---

## Task 2: Copy strings (`ai` block)

**Files:**
- Modify: `src/copy.ts`

- [ ] **Step 1: Add the `ai` block**

In `src/copy.ts`, add this block inside the `copy` object (e.g. directly after the `lenses` block). Use a byte-safe editor if the smart-quote issue recurs; the strings below use straight ASCII quotes and Icelandic letters only:

```ts
  ai: {
    button: "Fylla út með AI",
    describeTitle: "Lýstu launasögunni þinni",
    placeholder:
      "t.d. Byrjaði á 650þ í jan 2020, hækkaði í 720þ 2022, og er á 800þ í dag. (íslensku eða ensku)",
    privacy: "Allt keyrt í tækinu þínu — ekkert sent neitt.",
    analyze: "Greina",
    cancel: "Hætta við",
    micStart: "Tala inn",
    micStop: "Stöðva upptöku",
    langLabel: "Tungumál talgreiningar",
    downloadTitle: "Sæki AI-líkan…",
    downloadBody: "Þarf að sækja AI líkanið (~nokkur GB). Geymist svo í tækinu.",
    downloadHint: "Má loka og halda áfram síðar.",
    previewTitle: "AI las úr textanum:",
    replaceNote: "Þetta kemur í stað núverandi færslna í töflunni.",
    dropped: (n: number) =>
      n === 1
        ? "Einni færslu var sleppt (utan gildissviðs)."
        : `${n} færslum var sleppt (utan gildissviðs).`,
    refinePlaceholder: "Lagfæra… t.d. „hækkunin 2022 var 730þ“",
    refineSend: "Senda lagfæringu",
    apply: "Setja í töfluna",
    errorNoParse:
      "Náði ekki að lesa úr textanum — prófaðu að orða það öðruvísi eða sláðu inn handvirkt.",
    errorGeneric: "Eitthvað fór úrskeiðis. Þú getur slegið inn handvirkt.",
  },
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/copy.ts
git commit -m "feat: copy strings for AI autofill"
```

---

## Task 3: `normalizeRows` (pure core, TDD)

**Files:**
- Create: `src/lib/ai/normalizeRows.ts`
- Test: `tests/normalizeRows.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/normalizeRows.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { CpiData } from "../src/lib/cpi";
import { normalizeRows } from "../src/lib/ai/normalizeRows";

const cpi: CpiData = {
  source: "test",
  fetchedAt: "2025-01-01T00:00:00Z",
  firstMonth: "1988-05",
  lastMonth: "2025-01",
  values: {},
};

describe("normalizeRows", () => {
  it("keeps valid rows, sorted ascending", () => {
    const { rows, dropped } = normalizeRows(
      [
        { month: "2024-01", amount: 800000 },
        { month: "2020-03", amount: 650000 },
      ],
      cpi,
    );
    expect(dropped).toBe(0);
    expect(rows).toEqual([
      { month: "2020-03", amount: 650000 },
      { month: "2024-01", amount: 800000 },
    ]);
  });

  it("accepts YYYY/M and single-digit months, zero-padding them", () => {
    const { rows } = normalizeRows([{ month: "2021/4", amount: 700000 }], cpi);
    expect(rows).toEqual([{ month: "2021-04", amount: 700000 }]);
  });

  it("rounds amounts", () => {
    const { rows } = normalizeRows([{ month: "2022-01", amount: 700000.7 }], cpi);
    expect(rows[0].amount).toBe(700001);
  });

  it("drops out-of-range months and counts them", () => {
    const { rows, dropped } = normalizeRows(
      [
        { month: "1988-04", amount: 100000 }, // before firstMonth
        { month: "2030-01", amount: 900000 }, // after lastMonth
        { month: "2023-01", amount: 800000 }, // ok
      ],
      cpi,
    );
    expect(rows).toEqual([{ month: "2023-01", amount: 800000 }]);
    expect(dropped).toBe(2);
  });

  it("drops non-positive, over-max, and non-finite amounts", () => {
    const { rows, dropped } = normalizeRows(
      [
        { month: "2023-01", amount: 0 },
        { month: "2023-02", amount: -5 },
        { month: "2023-03", amount: 99_000_001 },
        { month: "2023-04", amount: Number.NaN },
      ],
      cpi,
    );
    expect(rows).toEqual([]);
    expect(dropped).toBe(4);
  });

  it("drops unparseable month strings", () => {
    const { rows, dropped } = normalizeRows(
      [
        { month: "early 2022", amount: 700000 },
        { month: "2022-13", amount: 700000 },
        { month: "", amount: 700000 },
      ],
      cpi,
    );
    expect(rows).toEqual([]);
    expect(dropped).toBe(3);
  });

  it("dedupes by month, last value wins", () => {
    const { rows } = normalizeRows(
      [
        { month: "2023-01", amount: 800000 },
        { month: "2023-01", amount: 850000 },
      ],
      cpi,
    );
    expect(rows).toEqual([{ month: "2023-01", amount: 850000 }]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/normalizeRows.test.ts`
Expected: FAIL — module `../src/lib/ai/normalizeRows` not found.

- [ ] **Step 3: Implement `normalizeRows.ts`**

Create `src/lib/ai/normalizeRows.ts`:

```ts
import type { CpiData, MonthKey } from "../cpi";
import { compareMonths } from "../cpi";
import type { SalaryEvent } from "../inflation";

/** Untrusted row shape emitted by the model. */
export interface RawRow {
  month: string;
  amount: number;
}

export interface NormalizeResult {
  rows: SalaryEvent[];
  dropped: number;
}

/** The form's upper bound on a salary amount (mirrors SalaryForm.MAX_AMOUNT). */
const MAX_AMOUNT = 99_000_000;

function toMonthKey(raw: string): MonthKey | null {
  if (typeof raw !== "string") return null;
  const m = /^(\d{4})[-/](\d{1,2})$/.exec(raw.trim());
  if (!m) return null;
  const month = Number(m[2]);
  if (month < 1 || month > 12) return null;
  return `${m[1]}-${String(month).padStart(2, "0")}`;
}

/**
 * Turn loose model output into valid, de-duplicated, sorted salary events.
 * Rows with an unparseable/out-of-range month or a non-positive / over-max /
 * non-finite amount are dropped and counted. On duplicate months the last
 * value wins.
 */
export function normalizeRows(raw: RawRow[], cpi: CpiData): NormalizeResult {
  const byMonth = new Map<MonthKey, number>();
  let dropped = 0;

  for (const row of raw) {
    const month = toMonthKey(row?.month);
    const amount = Math.round(Number(row?.amount));
    const inRange =
      month !== null &&
      compareMonths(month, cpi.firstMonth) >= 0 &&
      compareMonths(month, cpi.lastMonth) <= 0;
    const validAmount =
      Number.isFinite(amount) && amount > 0 && amount <= MAX_AMOUNT;

    if (!inRange || !validAmount) {
      dropped++;
      continue;
    }
    byMonth.set(month, amount);
  }

  const rows = [...byMonth.entries()]
    .map(([month, amount]) => ({ month, amount }))
    .sort((a, b) => compareMonths(a.month, b.month));

  return { rows, dropped };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/normalizeRows.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai/normalizeRows.ts tests/normalizeRows.test.ts
git commit -m "feat: normalizeRows core with tests"
```

---

## Task 4: Prompt API wrapper (`localModel.ts`)

**Files:**
- Create: `src/lib/ai/localModel.ts`

- [ ] **Step 1: Implement the wrapper**

Create `src/lib/ai/localModel.ts`:

```ts
import type { AiAvailability, LanguageModelStatic } from "../../types/web-ai";
import type { RawRow } from "./normalizeRows";

const SYSTEM_PROMPT = [
  "You extract a salary history from the user's message.",
  "The user may write in Icelandic or English, with informal numbers",
  "(e.g. '650þ', '650 thousand', '0.8m' all mean ISK amounts).",
  "Return every salary level the user states, as objects with:",
  '- "month": the year-month it took effect, formatted strictly as "YYYY-MM".',
  '- "amount": the monthly salary as an integer number of Icelandic krónur.',
  "If only a year is given, use month 01. If the user says 'now'/'í dag',",
  "use the most recent plausible month. Output only the structured data.",
].join(" ");

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    rows: {
      type: "array",
      items: {
        type: "object",
        properties: {
          month: { type: "string" },
          amount: { type: "number" },
        },
        required: ["month", "amount"],
      },
    },
  },
  required: ["rows"],
} as const;

function model(): LanguageModelStatic | undefined {
  return (globalThis as { LanguageModel?: LanguageModelStatic }).LanguageModel;
}

export async function modelAvailability(): Promise<AiAvailability> {
  const lm = model();
  if (!lm) return "unavailable";
  try {
    return await lm.availability();
  } catch {
    return "unavailable";
  }
}

export interface Extractor {
  /** Parse a fresh free-text description into rows. */
  extract(text: string): Promise<RawRow[]>;
  /** Apply a correction in the same conversation; returns the full new set. */
  refine(instruction: string): Promise<RawRow[]>;
  destroy(): void;
}

/**
 * Create an extraction session. If the model needs downloading, `onProgress`
 * receives a 0..1 fraction. Throws if the API is unavailable.
 */
export async function createExtractor(
  onProgress?: (fraction: number) => void,
): Promise<Extractor> {
  const lm = model();
  if (!lm) throw new Error("LanguageModel unavailable");

  const session = await lm.create({
    initialPrompts: [{ role: "system", content: SYSTEM_PROMPT }],
    monitor: onProgress
      ? (m) =>
          m.addEventListener("downloadprogress", (e) => onProgress(e.loaded))
      : undefined,
  });

  async function run(input: string): Promise<RawRow[]> {
    const out = await session.prompt(input, {
      responseConstraint: RESPONSE_SCHEMA,
    });
    try {
      const parsed = JSON.parse(out) as { rows?: RawRow[] };
      return Array.isArray(parsed.rows) ? parsed.rows : [];
    } catch {
      return [];
    }
  }

  return {
    extract: (text) => run(text),
    refine: (instruction) => run(instruction),
    destroy: () => session.destroy(),
  };
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/ai/localModel.ts
git commit -m "feat: on-device Prompt API wrapper"
```

---

## Task 5: On-device speech wrapper (`speech.ts`)

**Files:**
- Create: `src/lib/ai/speech.ts`

- [ ] **Step 1: Implement the wrapper**

Create `src/lib/ai/speech.ts`. It intentionally requires `availableOnDevice` to exist, so dictation is enabled ONLY when on-device recognition is present — never the server-based fallback:

```ts
export type SpeechLang = "is-IS" | "en-US";

const LANGS: SpeechLang[] = ["is-IS", "en-US"];

interface RecognitionResultSeg {
  isFinal: boolean;
  0: { transcript: string };
}
interface RecognitionEvent {
  resultIndex: number;
  results: ArrayLike<RecognitionResultSeg>;
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  processLocally?: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
}
interface RecognitionCtor {
  new (): Recognition;
  availableOnDevice?(lang: string): Promise<string>;
}

function ctor(): RecognitionCtor | undefined {
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

/** Languages with on-device recognition. Empty unless the on-device API exists. */
export async function speechLangsAvailable(): Promise<SpeechLang[]> {
  const C = ctor();
  if (!C || typeof C.availableOnDevice !== "function") return [];
  const out: SpeechLang[] = [];
  for (const lang of LANGS) {
    try {
      const a = await C.availableOnDevice(lang);
      if (a === "available" || a === "downloadable" || a === "downloading") {
        out.push(lang);
      }
    } catch {
      /* ignore this language */
    }
  }
  return out;
}

export interface Dictation {
  start(): void;
  stop(): void;
}

export interface DictationHandlers {
  onPartial: (text: string) => void;
  onFinal: (text: string) => void;
  onError: () => void;
  onEnd: () => void;
}

/** Create an on-device dictation session for `lang`. Throws if unsupported. */
export function createDictation(
  lang: SpeechLang,
  handlers: DictationHandlers,
): Dictation {
  const C = ctor();
  if (!C) throw new Error("SpeechRecognition unavailable");
  const rec = new C();
  rec.lang = lang;
  rec.continuous = true;
  rec.interimResults = true;
  rec.processLocally = true; // keep audio on-device

  rec.onresult = (e) => {
    let finalText = "";
    let partial = "";
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const seg = e.results[i];
      if (seg.isFinal) finalText += seg[0].transcript;
      else partial += seg[0].transcript;
    }
    if (finalText) handlers.onFinal(finalText);
    if (partial) handlers.onPartial(partial);
  };
  rec.onerror = () => handlers.onError();
  rec.onend = () => handlers.onEnd();

  return {
    start: () => rec.start(),
    stop: () => rec.stop(),
  };
}
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/ai/speech.ts
git commit -m "feat: on-device speech-to-text wrapper"
```

---

## Task 6: Export `MonthPicker` from SalaryForm

**Files:**
- Modify: `src/components/SalaryForm.tsx`

- [ ] **Step 1: Export the component**

In `src/components/SalaryForm.tsx`, change the declaration:

```tsx
function MonthPicker({ month, cpi, rowId, onChange }: MonthPickerProps) {
```

to:

```tsx
export function MonthPicker({ month, cpi, rowId, onChange }: MonthPickerProps) {
```

(`AiAutofill` reuses it so the preview rows edit months exactly like the form does.)

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/SalaryForm.tsx
git commit -m "refactor: export MonthPicker for reuse"
```

---

## Task 7: The `AiAutofill` panel component

**Files:**
- Create: `src/components/AiAutofill.tsx`

- [ ] **Step 1: Implement the component**

Create `src/components/AiAutofill.tsx`:

```tsx
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
```

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (`analyzeRows`, `MonthPicker`, and `DraftRow` are exported by `SalaryForm.tsx`; `RawRow` by `normalizeRows.ts`.)

- [ ] **Step 3: Commit**

```bash
git add src/components/AiAutofill.tsx
git commit -m "feat: AiAutofill panel (describe, voice, preview, refine)"
```

---

## Task 8: AI panel styles

**Files:**
- Modify: `src/styles.css`

- [ ] **Step 1: Append the styles**

Add to the end of `src/styles.css` (reuses the existing tokens; no hard-coded colours):

```css
/* ---------- AI autofill ---------- */
.ai-open {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  width: 100%;
  min-height: 48px;
  margin-bottom: 1.25rem;
  font: inherit;
  font-weight: 700;
  color: var(--glacier-deep);
  background: var(--glacier-wash);
  border: 1.5px solid color-mix(in srgb, var(--glacier) 40%, transparent);
  border-radius: var(--radius-m);
  cursor: pointer;
  transition: border-color 0.15s ease, background 0.15s ease;
}
.ai-open:hover {
  border-color: var(--glacier);
}

.ai-panel {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-bottom: 1.25rem;
  padding: 1rem;
  background: var(--paper-raised);
  border: 1px solid var(--line);
  border-radius: var(--radius-m);
}

.ai-title {
  margin: 0;
  font-size: 0.9375rem;
  font-weight: 700;
}

.ai-ta-wrap {
  position: relative;
}
.ai-ta {
  width: 100%;
  font: inherit;
  font-size: 1rem;
  color: var(--ink);
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: var(--radius-s);
  padding: 0.625rem 3rem 0.625rem 0.75rem;
  resize: vertical;
}
.ai-ta:focus-visible {
  outline: 2px solid var(--glacier);
  outline-offset: 1px;
  border-color: var(--glacier);
}
.ai-mic {
  position: absolute;
  right: 0.5rem;
  bottom: 0.5rem;
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  color: var(--glacier-deep);
  background: var(--glacier-wash);
  border: 1px solid color-mix(in srgb, var(--glacier) 30%, transparent);
  border-radius: 50%;
  cursor: pointer;
}
.ai-mic.is-live {
  color: #fff;
  background: var(--coral-deep);
  border-color: var(--coral-deep);
}

.ai-lang {
  display: flex;
  gap: 0.375rem;
}
.ai-lang-opt {
  min-height: 36px;
  padding: 0.25rem 0.75rem;
  font: inherit;
  font-size: 0.8125rem;
  font-weight: 700;
  color: var(--ink-soft);
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 999px;
  cursor: pointer;
}
.ai-lang-opt.is-on {
  color: var(--paper-raised);
  background: var(--ink);
  border-color: var(--ink);
}

.ai-priv {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--ink-faint);
}
.ai-error {
  margin: 0;
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--coral-deep);
}

.ai-download {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  font-size: 0.9375rem;
  color: var(--glacier-deep);
}
.ai-download-title {
  margin: 0;
  font-weight: 700;
}
.ai-download-hint {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--ink-faint);
}
.ai-bar {
  height: 6px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--glacier) 20%, transparent);
  overflow: hidden;
}
.ai-bar > i {
  display: block;
  height: 100%;
  background: var(--glacier);
  border-radius: 4px;
  transition: width 0.2s ease;
}

.ai-rows {
  display: grid;
  gap: 0.75rem;
}
.ai-row {
  position: relative;
  display: grid;
  gap: 0.75rem;
  padding: 0.875rem 2.5rem 0.875rem 0.875rem;
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: var(--radius-s);
}
.ai-row-remove {
  position: absolute;
  top: 0.5rem;
  right: 0.5rem;
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  font-size: 1.25rem;
  line-height: 1;
  color: var(--ink-faint);
  background: transparent;
  border: none;
  border-radius: 50%;
  cursor: pointer;
}
.ai-row-remove:hover {
  background: var(--coral-wash);
  color: var(--coral-deep);
}

.ai-dropped {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--ink-soft);
}
.ai-replace {
  margin: 0;
  font-size: 0.8125rem;
  color: var(--coral-deep);
  background: var(--coral-wash);
  border-radius: var(--radius-s);
  padding: 0.5rem 0.75rem;
}

.ai-refine {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  border-top: 1px dashed var(--line-soft);
  padding-top: 0.75rem;
}
.ai-refine-input {
  flex: 1;
  font: inherit;
  font-size: 0.9375rem;
  color: var(--ink);
  background: var(--paper);
  border: 1px solid var(--line);
  border-radius: 999px;
  padding: 0.5rem 0.875rem;
}
.ai-refine-input:focus-visible {
  outline: 2px solid var(--glacier);
  outline-offset: 1px;
}
.ai-refine-send {
  width: 40px;
  height: 40px;
  flex: none;
  display: grid;
  place-items: center;
  color: #fff;
  background: var(--glacier);
  border: none;
  border-radius: 50%;
  cursor: pointer;
}

.ai-acts {
  display: flex;
  gap: 0.625rem;
  align-items: center;
}
.ai-primary {
  min-height: 44px;
  padding: 0.5rem 1.25rem;
  font: inherit;
  font-weight: 700;
  color: #fff;
  background: var(--glacier);
  border: none;
  border-radius: 999px;
  cursor: pointer;
}
.ai-primary:disabled {
  opacity: 0.5;
  cursor: default;
}
.ai-ghost {
  min-height: 44px;
  padding: 0.5rem 1rem;
  font: inherit;
  font-weight: 600;
  color: var(--ink-soft);
  background: transparent;
  border: 1px solid var(--line);
  border-radius: 999px;
  cursor: pointer;
}
.ai-open:focus-visible,
.ai-mic:focus-visible,
.ai-primary:focus-visible,
.ai-ghost:focus-visible,
.ai-refine-send:focus-visible,
.ai-lang-opt:focus-visible,
.ai-row-remove:focus-visible {
  outline: 2px solid var(--glacier);
  outline-offset: 2px;
}
```

- [ ] **Step 2: Verify the build compiles the CSS**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/styles.css
git commit -m "style: AI autofill panel styles"
```

---

## Task 9: Wire availability detection + apply into the app

**Files:**
- Modify: `src/components/SalaryForm.tsx`
- Modify: `src/app.tsx`

- [ ] **Step 1: Add the Ai imports and availability state to SalaryForm**

In `src/components/SalaryForm.tsx`, add imports at the top (after the existing imports):

```tsx
import { useEffect, useState } from "preact/hooks";
import { AiAutofill } from "./AiAutofill";
import type { SalaryEvent } from "../lib/inflation";
import { modelAvailability } from "../lib/ai/localModel";
import { speechLangsAvailable, type SpeechLang } from "../lib/ai/speech";
```

(Note: `SalaryEvent` may already be imported — if so, don't duplicate it; keep a single import.)

- [ ] **Step 2: Add an `onAiApply` prop to `SalaryFormProps`**

In `src/components/SalaryForm.tsx`, in the `SalaryFormProps` interface, add:

```tsx
  onAiApply: (events: SalaryEvent[]) => void;
```

- [ ] **Step 3: Detect availability and render the panel**

In `src/components/SalaryForm.tsx`, inside `export function SalaryForm(props: SalaryFormProps) {`, just below `const f = copy.form;`, add:

```tsx
  const [aiReady, setAiReady] = useState(false);
  const [speechLangs, setSpeechLangs] = useState<SpeechLang[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const availability = await modelAvailability();
      if (cancelled || availability === "unavailable") return;
      setAiReady(true);
      setSpeechLangs(await speechLangsAvailable());
    })();
    return () => {
      cancelled = true;
    };
  }, []);
```

Then, in the returned JSX, immediately after the `<p class="section-intro">{f.intro}</p>` line (and before the `form-privacy` line), add:

```tsx
      {aiReady && (
        <AiAutofill
          cpi={props.cpi}
          onApply={props.onAiApply}
          speechLangs={speechLangs}
        />
      )}
```

- [ ] **Step 4: Add `replaceRows` to app.tsx and pass it down**

In `src/app.tsx`, first add the `SalaryEvent` type to the existing inflation import — change:

```tsx
import { buildSeries } from "./lib/inflation";
```

to:

```tsx
import { buildSeries, type SalaryEvent } from "./lib/inflation";
```

Then add this handler next to the other row handlers (after `clearExample`):

```tsx
  const replaceRows = (events: SalaryEvent[]) =>
    setState({
      isExample: false,
      rows:
        events.length > 0
          ? events.map((e) => ({
              id: uid(),
              month: e.month,
              amountText: formatISK(e.amount).replace(" kr.", ""),
            }))
          : [{ id: uid(), month: cpi.lastMonth, amountText: "" }],
    });
```

Then add the prop to the `<SalaryForm ... />` element:

```tsx
          onAiApply={replaceRows}
```

(`formatISK` and `uid` are already in scope in `app.tsx`; `SalaryEvent` is now imported via Step 4's import change.)

- [ ] **Step 5: Verify typecheck, tests, and build**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: no type errors; all tests pass (including `normalizeRows`); build succeeds.

- [ ] **Step 6: Manual sanity check (feature hidden by default)**

Run: `npm run dev`, open the URL.
Expected: because a normal dev browser has no `LanguageModel`, the AI button does NOT appear and the form is unchanged. (The mock-driven flow is exercised in Task 11.)

- [ ] **Step 7: Commit**

```bash
git add src/components/SalaryForm.tsx src/app.tsx
git commit -m "feat: render AI autofill when on-device APIs are available"
```

---

## Task 10: Document the optional on-device AI

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add a subsection under "Tangible comparisons" / before "How the math works"**

In `README.md`, add this section (place it right after the "Tangible comparisons (price anchors)" section):

```markdown
## Optional on-device AI autofill

When the browser exposes Chrome's on-device **Prompt API** (Gemini Nano) — and,
for voice, on-device Web Speech — a "Fylla út með AI" button appears on the form.
Users can describe their salary history in plain Icelandic or English (typed or
spoken) and the model parses it into editable rows. **Everything runs locally**:
the model and speech recognition never send the salary text or audio anywhere, so
the no-network promise is preserved. The feature is a progressive enhancement —
if the APIs aren't present (the common case today), nothing renders and the form
behaves exactly as before. Code: `src/lib/ai/` and `src/components/AiAutofill.tsx`.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: document optional on-device AI autofill"
```

---

## Task 11: Mock-driven flow verification (Playwright)

**Files:**
- Create: `/tmp/ai-autofill-verify.mjs` (throwaway; not committed)

- [ ] **Step 1: Write a Playwright script that injects a fake `LanguageModel`**

Create `/tmp/ai-autofill-verify.mjs`:

```js
import { chromium } from "playwright";

const URL = process.env.URL || "http://localhost:5173/";

const fake = () => {
  // Injected before page scripts run.
  window.LanguageModel = {
    async availability() { return "available"; },
    async create() {
      return {
        async prompt() {
          return JSON.stringify({
            rows: [
              { month: "2020-01", amount: 650000 },
              { month: "2022-03", amount: 720000 },
              { month: "2024-01", amount: 800000 },
            ],
          });
        },
        destroy() {},
      };
    },
  };
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.addInitScript(fake);
await page.goto(URL);

await page.getByRole("button", { name: "Fylla út með AI" }).click();
await page.locator(".ai-ta").fill("Byrjaði á 650þ 2020, 720þ 2022, 800þ núna");
await page.getByRole("button", { name: "Greina" }).click();
await page.getByText("AI las úr textanum:").waitFor();
const rowCount = await page.locator(".ai-row").count();
await page.getByRole("button", { name: "Setja í töfluna" }).click();
// After apply, the panel closes and the form shows 3 entry cards.
const entryCount = await page.locator(".entry-card").count();
await page.screenshot({ path: "/tmp/ai-autofill-result.png" });
await browser.close();

console.log(`preview rows: ${rowCount}, entry cards after apply: ${entryCount}`);
if (rowCount !== 3 || entryCount !== 3) {
  console.error("FAIL: expected 3 preview rows and 3 entry cards");
  process.exit(1);
}
console.log("PASS");
```

- [ ] **Step 2: Run it against the dev server**

Run (in one shell): `npm run dev`
Run (in another): `URL=http://localhost:5173/ node /tmp/ai-autofill-verify.mjs`
Expected: prints `PASS` (3 preview rows, 3 entry cards after apply). Inspect `/tmp/ai-autofill-result.png` to confirm the rows landed in the table.

- [ ] **Step 3: No commit (throwaway verification)**

The script is intentionally not committed. If it fails, fix the component/wiring and re-run.

---

## Self-review notes (already reconciled)

- **Spec coverage:** progressive-enhancement gating (Tasks 4/9), bilingual analysis (Task 4 system prompt) + STT (Task 5, Task 7 toggle), `normalizeRows` core + tests (Task 3), thin wrappers (Tasks 4/5), `AiAutofill` states incl. download/preview/error/listening (Task 7), tap-to-edit + chat refine (Task 7 via `MonthPicker`/amount input + refine), replace-on-apply (Task 9 `replaceRows`), privacy docs (Task 10), mock verification (Task 11). Out-of-scope items (server STT, other languages, cloud fallback, merge) are not implemented — intended.
- **Type consistency:** `RawRow` (normalizeRows) is consumed by `localModel` and `AiAutofill`; `Extractor`, `Dictation`, `SpeechLang`, `AiAvailability`, `LanguageModelStatic` are defined once and imported. `onApply(events: SalaryEvent[])` matches `replaceRows`. `MonthPicker`/`analyzeRows`/`DraftRow` are exported from `SalaryForm`.
- **No placeholders:** every code step is complete; commands have expected output.
- **Note for implementer:** the experimental APIs evolve; the wrappers are deliberately thin and defensive so a shape change is a one-file fix. Keep all browser-API access inside `localModel.ts`/`speech.ts`.
```
