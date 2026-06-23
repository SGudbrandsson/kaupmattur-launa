import { useEffect, useMemo, useState } from "preact/hooks";
import { Hero } from "./components/Hero";
import { PayoffCard } from "./components/PayoffCard";
import { Methodology } from "./components/Methodology";
import {
  SalaryForm,
  analyzeRows,
  type DraftRow,
} from "./components/SalaryForm";
import { SummaryCards } from "./components/SummaryCards";
import { Chart } from "./components/Chart";
import { getCpi } from "./lib/cpi";
import { type SalaryEvent } from "./lib/inflation";
import { formatISK } from "./lib/format";
import { loadEntries, saveEntries } from "./lib/storage";

function uid(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

const EXAMPLE_ROWS: DraftRow[] = [
  { id: "example-1", month: "2023-01", amountText: "800.000" },
];

interface FormState {
  rows: DraftRow[];
  isExample: boolean;
}

function initialState(): FormState {
  const saved = loadEntries();
  if (saved && saved.length > 0) {
    return {
      rows: saved.map((e) => ({
        id: uid(),
        month: e.month,
        amountText: formatISK(e.amount).replace(" kr.", ""),
      })),
      isExample: false,
    };
  }
  return { rows: EXAMPLE_ROWS, isExample: true };
}

export function App() {
  const cpi = getCpi();
  const [state, setState] = useState<FormState>(initialState);

  const { events, errors } = useMemo(() => analyzeRows(state.rows), [state.rows]);

  // Example data is never persisted; user data always is.
  useEffect(() => {
    if (!state.isExample) saveEntries(events);
  }, [state.isExample, events]);

  const changeRow = (id: string, patch: Partial<Omit<DraftRow, "id">>) =>
    setState((s) => ({
      isExample: false,
      rows: s.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    }));

  const addRow = () =>
    setState((s) => ({
      isExample: false,
      rows: [
        ...(s.isExample ? [] : s.rows),
        { id: uid(), month: cpi.lastMonth, amountText: "" },
      ],
    }));

  const removeRow = (id: string) =>
    setState((s) => ({
      isExample: false,
      rows: s.rows.filter((r) => r.id !== id),
    }));

  const clearExample = () =>
    setState({
      isExample: false,
      rows: [{ id: uid(), month: cpi.lastMonth, amountText: "" }],
    });

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

  return (
    <>
      <div class="aurora" aria-hidden="true" />
      <main class="page">
        <Hero />
        <PayoffCard
          events={events}
          cpi={cpi}
          isExample={state.isExample}
          onTryOwn={clearExample}
        />
        <SalaryForm
          rows={state.rows}
          errors={errors}
          cpi={cpi}
          isExample={state.isExample}
          onChangeRow={changeRow}
          onAddRow={addRow}
          onRemoveRow={removeRow}
          onClearExample={clearExample}
          onAiApply={replaceRows}
        />
        <Chart events={events} cpi={cpi} />
        <SummaryCards events={events} cpi={cpi} />
        <Methodology />
      </main>
    </>
  );
}
