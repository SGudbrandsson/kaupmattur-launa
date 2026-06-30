import { useEffect, useMemo, useState } from "preact/hooks";
import { Hero } from "./components/Hero";
import { PayoffCard } from "./components/PayoffCard";
import { Methodology } from "./components/Methodology";
import { ProfileBar } from "./components/ProfileBar";
import { SalaryForm, analyzeRows, type DraftRow } from "./components/SalaryForm";
import { SummaryCards } from "./components/SummaryCards";
import { Chart } from "./components/Chart";
import { getCpi } from "./lib/cpi";
import type { SalaryEvent } from "./lib/inflation";
import { formatISK } from "./lib/format";
import { loadStore, saveStore } from "./lib/storage";
import {
  MAX_IMPORT_BYTES,
  type Store,
  addProfile,
  createProfile,
  deleteProfile,
  duplicateProfile,
  forkPreset,
  newId,
  renameProfile,
  resolveActive,
  setActive,
  updateEntries,
} from "./lib/profiles";
import { PRESETS } from "./data/presets";
import {
  downloadJson,
  parseProfileFile,
  safeFilename,
  serializeProfile,
} from "./lib/profileFile";

function entriesToRows(entries: SalaryEvent[]): DraftRow[] {
  return entries.map((e) => ({
    id: newId(),
    month: e.month,
    amountText: formatISK(e.amount).replace(" kr.", ""),
  }));
}

export function App() {
  const cpi = getCpi();
  const [store, setStore] = useState<Store>(() => loadStore(cpi));

  const active = useMemo(() => resolveActive(store, PRESETS, cpi), [store, cpi]);

  // Persist a corrected active id (stale/unknown) before any mutation.
  useEffect(() => {
    if (active.resolvedId !== store.activeId) {
      setStore((s) => {
        const next = setActive(s, active.resolvedId);
        saveStore(next);
        return next;
      });
    }
  }, [active.resolvedId, store.activeId]);

  // Editable form rows, rematerialized (fresh ids) whenever the active profile changes.
  const [rows, setRows] = useState<DraftRow[]>(() => entriesToRows(active.entries));
  useEffect(() => {
    setRows(entriesToRows(active.entries));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active.resolvedId]);

  const { events, errors } = useMemo(() => analyzeRows(rows), [rows]);

  // Autosave the editable profile only (presets are read-only).
  useEffect(() => {
    if (active.readOnly) return;
    setStore((s) => {
      const next = updateEntries(s, active.resolvedId, events);
      saveStore(next);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events, active.readOnly, active.resolvedId]);

  const commit = (next: Store) => {
    saveStore(next);
    setStore(next);
  };

  const changeRow = (id: string, patch: Partial<Omit<DraftRow, "id">>) =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const addRow = () =>
    setRows((rs) => [...rs, { id: newId(), month: cpi.lastMonth, amountText: "" }]);
  const removeRow = (id: string) => setRows((rs) => rs.filter((r) => r.id !== id));
  const replaceRows = (evts: SalaryEvent[]) =>
    setRows(
      evts.length > 0
        ? entriesToRows(evts)
        : [{ id: newId(), month: cpi.lastMonth, amountText: "" }],
    );

  const onNew = () => commit(createProfile(store).store);
  const onSelect = (id: string) => commit(setActive(store, id));
  const onRename = (name: string) => commit(renameProfile(store, active.resolvedId, name));
  const onDuplicate = () => commit(duplicateProfile(store, active.resolvedId));
  const onDelete = () => commit(deleteProfile(store, active.resolvedId));
  const onFork = () => {
    const preset = PRESETS.find((p) => p.id === active.resolvedId);
    if (preset) commit(forkPreset(store, preset, cpi));
  };
  const onExport = () =>
    downloadJson(safeFilename(active.name), serializeProfile(active.name, events));
  const onImportFile = (file: File) => {
    if (file.size > MAX_IMPORT_BYTES) {
      window.alert("Skráin er of stór.");
      return;
    }
    file.text().then((text) => {
      const result = parseProfileFile(text, cpi);
      if ("error" in result) {
        window.alert(result.error);
        return;
      }
      const added = addProfile(store, result.name, result.entries, cpi);
      if ("error" in added) {
        window.alert("Hámarksfjölda sniða náð.");
        return;
      }
      commit(added.store);
    });
  };

  return (
    <>
      <div class="aurora" aria-hidden="true" />
      <main class="page">
        <Hero />
        <ProfileBar
          store={store}
          presets={PRESETS}
          activeId={active.resolvedId}
          activeName={active.name}
          isPreset={active.kind === "preset"}
          onSelect={onSelect}
          onNew={onNew}
          onRename={onRename}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
          onExport={onExport}
          onImportFile={onImportFile}
        />
        <PayoffCard events={events} cpi={cpi} />
        <SalaryForm
          rows={rows}
          errors={errors}
          cpi={cpi}
          readOnly={active.readOnly}
          presetSource={active.source}
          onChangeRow={changeRow}
          onAddRow={addRow}
          onRemoveRow={removeRow}
          onFork={onFork}
          onAiApply={replaceRows}
        />
        <Chart events={events} cpi={cpi} />
        <SummaryCards events={events} cpi={cpi} />
        <Methodology />
      </main>
    </>
  );
}
