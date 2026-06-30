import { useRef, useState } from "preact/hooks";
import { copy } from "../copy";
import type { Preset, Store } from "../lib/profiles";

interface ProfileBarProps {
  store: Store;
  presets: Preset[];
  activeId: string;
  activeName: string;
  isPreset: boolean;
  onSelect: (id: string) => void;
  onNew: () => void;
  onRename: (name: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onExport: () => void;
  onImportFile: (file: File) => void;
}

export function ProfileBar(props: ProfileBarProps) {
  const c = copy.profiles;
  const [list, setList] = useState(false);
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const close = () => {
    setList(false);
    setMenu(false);
  };

  return (
    <div class="profile-bar">
      <div class="profile-pick">
        <button
          type="button"
          class="profile-name"
          aria-haspopup="listbox"
          aria-expanded={list}
          onClick={() => {
            setList((v) => !v);
            setMenu(false);
          }}
        >
          {props.activeName} <span aria-hidden="true">▾</span>
        </button>
        <button type="button" class="profile-new" aria-label={c.newProfile} onClick={() => { close(); props.onNew(); }}>
          ＋
        </button>
        <button
          type="button"
          class="profile-menu-btn"
          aria-haspopup="menu"
          aria-expanded={menu}
          aria-label="…"
          onClick={() => {
            setMenu((v) => !v);
            setList(false);
          }}
        >
          ⋯
        </button>
      </div>

      {list && (
        <ul class="profile-list" role="listbox" aria-label={c.switchLabel}>
          <li class="profile-group">{c.yourProfiles}</li>
          {props.store.profiles.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                role="option"
                aria-selected={p.id === props.activeId}
                class={`profile-item${p.id === props.activeId ? " is-on" : ""}`}
                onClick={() => { close(); props.onSelect(p.id); }}
              >
                <span class="check" aria-hidden="true">{p.id === props.activeId ? "✓" : ""}</span>
                {p.name}
              </button>
            </li>
          ))}
          <li class="profile-group">{c.presetsGroup}</li>
          {props.presets.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                role="option"
                aria-selected={p.id === props.activeId}
                class={`profile-item is-preset${p.id === props.activeId ? " is-on" : ""}`}
                onClick={() => { close(); props.onSelect(p.id); }}
              >
                <span class="check" aria-hidden="true">{p.id === props.activeId ? "✓" : "🔒"}</span>
                {p.name}
                <span class="profile-src">{p.source}</span>
              </button>
            </li>
          ))}
          <li>
            <button type="button" class="profile-item is-action" onClick={() => { close(); props.onNew(); }}>
              ＋ {c.newProfile}
            </button>
          </li>
          <li>
            <button type="button" class="profile-item is-action" onClick={() => { close(); fileRef.current?.click(); }}>
              ↥ {c.importFile}
            </button>
          </li>
        </ul>
      )}

      {menu && (
        <ul class="profile-menu" role="menu">
          {!props.isPreset && (
            <li>
              <button type="button" role="menuitem" class="profile-item" onClick={() => { setMenu(false); setRenaming(props.activeName); }}>
                ✎ {c.rename}
              </button>
            </li>
          )}
          <li>
            <button type="button" role="menuitem" class="profile-item" onClick={() => { setMenu(false); props.onExport(); }}>
              ↧ {c.exportFile}
            </button>
          </li>
          {!props.isPreset && (
            <li>
              <button type="button" role="menuitem" class="profile-item" onClick={() => { setMenu(false); props.onDuplicate(); }}>
                ⎘ {c.duplicate}
              </button>
            </li>
          )}
          {!props.isPreset && (
            <li>
              <button type="button" role="menuitem" class="profile-item is-danger" onClick={() => { setMenu(false); setConfirmDelete(true); }}>
                🗑 {c.delete}
              </button>
            </li>
          )}
        </ul>
      )}

      {renaming !== null && (
        <div class="profile-dialog" role="dialog" aria-label={c.renameTitle}>
          <input
            class="profile-rename-input"
            type="text"
            value={renaming}
            maxLength={60}
            autocomplete="off"
            onInput={(e) => setRenaming(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { props.onRename(renaming); setRenaming(null); }
              if (e.key === "Escape") setRenaming(null);
            }}
          />
          <div class="profile-dialog-actions">
            <button type="button" class="ai-primary" onClick={() => { props.onRename(renaming); setRenaming(null); }}>{c.save}</button>
            <button type="button" class="ai-ghost" onClick={() => setRenaming(null)}>{c.cancel}</button>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div class="profile-dialog" role="alertdialog" aria-label={c.delete}>
          <p>{c.deleteConfirm(props.activeName)}</p>
          <div class="profile-dialog-actions">
            <button type="button" class="profile-delete-confirm" onClick={() => { setConfirmDelete(false); props.onDelete(); }}>{c.delete}</button>
            <button type="button" class="ai-ghost" onClick={() => setConfirmDelete(false)}>{c.cancel}</button>
          </div>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        class="profile-file-input"
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          e.currentTarget.value = "";
          if (file) props.onImportFile(file);
        }}
      />
    </div>
  );
}
