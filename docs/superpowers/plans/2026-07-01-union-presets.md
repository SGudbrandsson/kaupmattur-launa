# Union-data Presets Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Grow the public preset set from 1 → 4 (minimum + one VR survey + teacher & nurse contractual taxi) and add honest per-flavor labeling (badge in the switcher + explainer on the locked-preset banner).

**Architecture:** A new `PresetKind` (`"minimum" | "taxi" | "survey"`) field on `Preset` drives presentation only — a badge chip in `ProfileBar` and a one-line explainer on the `SalaryForm` preset banner. `resolveActive` surfaces the active preset's flavor as `presetKind` so the banner can read it. Preset figures are hand-transcribed from cited published PDFs (VR launarannsókn, public-sector launatöflur); a structural test enforces shape + CPI-range and copy-coverage per kind. No calculation or read-only/fork behavior changes.

**Tech Stack:** Vite + Preact (TSX, `class=` not `className`) + TypeScript + Vitest. No new deps. Spec: `docs/superpowers/specs/2026-07-01-union-presets-design.md`.

**Key naming caution:** `ActiveResolved.kind` already exists and means `"user" | "preset"`. The new flavor field is a DIFFERENT concept — call it `PresetKind` on the type and `presetKind` on `ActiveResolved`. Never conflate the two.

---

## File Structure

- `src/lib/profiles.ts` — add `PresetKind` type, `kind` on `Preset`, `presetKind?` on `ActiveResolved`, set it in `resolveActive`.
- `src/data/presets.ts` — `kind` on the existing preset + 3 new presets with transcribed data.
- `src/copy.ts` — `presetKinds` map (badge + banner per flavor).
- `src/components/ProfileBar.tsx` — badge chip next to each preset name.
- `src/components/SalaryForm.tsx` — new `presetKind?` prop; banner shows source + flavor explainer.
- `src/app.tsx` — pass `active.presetKind` to `SalaryForm`.
- `src/styles.css` — badge chip + banner note styles.
- `tests/presets.test.ts` — kind validity + per-kind copy coverage.
- `tests/profiles.test.ts` — `resolveActive` surfaces `presetKind`.
- `README.md` — "Refreshing presets" note.

---

## Task 1: Add `PresetKind` type and `kind` field to `Preset`

**Files:**
- Modify: `src/lib/profiles.ts:17-22` (the `Preset` interface)
- Modify: `src/data/presets.ts:8-25` (give existing preset a `kind`)
- Test: `tests/presets.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/presets.test.ts` inside `describe("PRESETS", …)`:

```ts
it("every preset declares a valid kind", () => {
  const kinds = new Set(["minimum", "taxi", "survey"]);
  for (const p of PRESETS) {
    expect(kinds.has(p.kind)).toBe(true);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/presets.test.ts`
Expected: FAIL — `Property 'kind' does not exist on type 'Preset'` (tsc) / assertion undefined.

- [ ] **Step 3: Add the type and field**

In `src/lib/profiles.ts`, replace the `Preset` interface (currently lines 17-22):

```ts
export type PresetKind = "minimum" | "taxi" | "survey";

export interface Preset {
  id: string;
  name: string;
  source: string;
  kind: PresetKind;
  entries: SalaryEvent[];
}
```

In `src/data/presets.ts`, add `kind: "minimum",` to the existing `preset:lagmarkslaun` object (right after the `source` field):

```ts
    id: "preset:lagmarkslaun",
    name: "Lágmarkslaun (fullt starf)",
    source:
      "Lágmarkstekjur fyrir fullt starf skv. kjarasamningum SGS/ASÍ — asi.is",
    kind: "minimum",
    entries: [
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/presets.test.ts && npx tsc --noEmit`
Expected: PASS + `TSC OK`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/profiles.ts src/data/presets.ts tests/presets.test.ts
git commit -m "feat: add PresetKind flavor field to Preset"
```

---

## Task 2: Surface `presetKind` from `resolveActive`

**Files:**
- Modify: `src/lib/profiles.ts:142-149` (`ActiveResolved`), `:235-250` (`resolveActive` preset branches)
- Test: `tests/profiles.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/profiles.test.ts` (top of file already imports from `../src/lib/profiles` and builds stores/presets; mirror the existing `resolveActive` tests). Add a preset with a `kind` in the test's preset fixture if one isn't already present, then:

```ts
it("resolveActive surfaces the preset flavor as presetKind", () => {
  const cpi = getCpi();
  const preset = {
    id: "preset:test",
    name: "Test",
    source: "src",
    kind: "survey" as const,
    entries: [{ month: cpi.firstMonth, amount: 500000 }],
  };
  const store = { v: 2 as const, activeId: "preset:test", profiles: [] };
  const active = resolveActive(store, [preset], cpi);
  expect(active.kind).toBe("preset");
  expect(active.presetKind).toBe("survey");
});
```

(If `getCpi`/`resolveActive` aren't yet imported in this file, add them to the existing import from `../src/lib/profiles` and `../src/lib/cpi`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/profiles.test.ts`
Expected: FAIL — `presetKind` is `undefined` / not on `ActiveResolved`.

- [ ] **Step 3: Add the field and populate it**

In `src/lib/profiles.ts`, add to `ActiveResolved` (after `source?: string;`):

```ts
  presetKind?: PresetKind;
```

In `resolveActive`, add `presetKind: preset.kind,` to the matched-preset return (the block at ~line 237-240) and `presetKind: def.kind,` to the default-preset fallback return (~line 247-250). The two user-profile returns stay unchanged (no `presetKind`). Example for the matched-preset branch:

```ts
    return {
      resolvedId: preset.id, kind: "preset", name: preset.name, source: preset.source,
      presetKind: preset.kind,
      entries: sanitizeEntries(preset.entries, cpi), readOnly: true,
    };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/profiles.test.ts && npx tsc --noEmit`
Expected: PASS + `TSC OK`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/profiles.ts tests/profiles.test.ts
git commit -m "feat: surface active preset flavor as presetKind"
```

---

## Task 3: Add `presetKinds` copy (badge + banner per flavor)

**Files:**
- Modify: `src/copy.ts` (the `profiles` block, ends ~line 54)
- Test: `tests/presets.test.ts`

**Smart-quote hazard:** `copy.ts` contains Icelandic quotes `„…"` (U+201E/U+201C). The Edit tool has corrupted them before. Make this edit with a byte-safe Python script (below), not the Edit tool, and afterward verify with `grep -n "„" src/copy.ts` that existing quotes are intact.

- [ ] **Step 1: Write the failing test**

Add to `tests/presets.test.ts`:

```ts
it("every kind used by a preset has non-empty badge and banner copy", () => {
  for (const p of PRESETS) {
    const k = copy.profiles.presetKinds[p.kind];
    expect(k).toBeDefined();
    expect(k.badge.length).toBeGreaterThan(0);
    expect(k.banner.length).toBeGreaterThan(0);
  }
});
```

Add the import at the top of the test file: `import { copy } from "../src/copy";`

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/presets.test.ts`
Expected: FAIL — `copy.profiles.presetKinds` is undefined.

- [ ] **Step 3: Add the copy via byte-safe Python**

Run this exact script:

```bash
python3 - <<'PY'
import io
p = "src/copy.ts"
s = io.open(p, encoding="utf-8").read()
anchor = '    switchLabel: "Veldu snið",\n'
block = (
    '    switchLabel: "Veldu snið",\n'
    '    presetKinds: {\n'
    '      minimum: {\n'
    '        badge: "lágmark",\n'
    '        banner: "Lágmarkstekjur fyrir fullt starf — kjarasamningsbundið lágmark.",\n'
    '      },\n'
    '      taxi: {\n'
    '        badge: "grunntaxti",\n'
    '        banner:\n'
    '          "Grunntaxti kjarasamnings — raunveruleg laun eru oft hærri (vaktaálag, yfirvinna).",\n'
    '      },\n'
    '      survey: {\n'
    '        badge: "miðgildi",\n'
    '        banner:\n'
    '          "Miðgildi raunverulegra heildarlauna úr launarannsókn — ekki taxti; helmingur er yfir og helmingur undir.",\n'
    '      },\n'
    '    } as Record<string, { badge: string; banner: string }>,\n'
)
assert s.count(anchor) == 1, s.count(anchor)
s = s.replace(anchor, block)
io.open(p, "w", encoding="utf-8").write(s)
print("ok")
PY
grep -n "„" src/copy.ts | head -1
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/presets.test.ts && npx tsc --noEmit`
Expected: PASS + `TSC OK`. The `grep` above should still show the existing `„…"` line (quotes intact).

- [ ] **Step 5: Commit**

```bash
git add src/copy.ts tests/presets.test.ts
git commit -m "feat: add per-flavor preset badge and banner copy"
```

---

## Task 4: Render the flavor badge in the switch list

**Files:**
- Modify: `src/components/ProfileBar.tsx:84-98` (the presets `.map`)

- [ ] **Step 1: Add the badge chip**

In `src/components/ProfileBar.tsx`, in the presets `.map`, add the badge span after `{p.name}` and before the `profile-src` span:

```tsx
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
                <span class="profile-kind-badge">{c.presetKinds[p.kind].badge}</span>
                <span class="profile-src">{p.source}</span>
              </button>
            </li>
          ))}
```

(`c` is already `copy.profiles` at the top of the component.)

- [ ] **Step 2: Verify it builds**

Run: `npx tsc --noEmit`
Expected: `TSC OK` (no type errors — `p.kind` is now on `Preset`, `c.presetKinds[p.kind]` resolves).

- [ ] **Step 3: Commit**

```bash
git add src/components/ProfileBar.tsx
git commit -m "feat: show flavor badge next to preset names in switcher"
```

---

## Task 5: Show the flavor explainer on the preset banner

**Files:**
- Modify: `src/components/SalaryForm.tsx:142-143` (props), `:199-207` (banner)
- Modify: `src/app.tsx:158-159` (pass `presetKind`)

- [ ] **Step 1: Add the prop**

In `src/components/SalaryForm.tsx`, add to `SalaryFormProps` (after `presetSource?: string;` at line 143):

```ts
  presetKind?: import("../lib/profiles").PresetKind;
```

(Or add `PresetKind` to the existing `import type … from "../lib/profiles"` if one exists in the file — check imports and prefer a named import over the inline form.)

- [ ] **Step 2: Render the explainer**

Replace the banner block (currently ~lines 199-207) so it shows the source line, the flavor note, then the fork button:

```tsx
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
```

(Keep the existing fork button text/handler exactly as they were — only the surrounding structure and the new note span are added.)

- [ ] **Step 3: Pass the prop from app.tsx**

In `src/app.tsx`, in the `<SalaryForm … />` usage, add next to `presetSource={active.source}` (line 159):

```tsx
          presetKind={active.presetKind}
```

- [ ] **Step 4: Verify it builds**

Run: `npx tsc --noEmit`
Expected: `TSC OK`.

- [ ] **Step 5: Commit**

```bash
git add src/components/SalaryForm.tsx src/app.tsx
git commit -m "feat: explain preset flavor on the locked-preset banner"
```

---

## Task 6: Style the badge and banner note

**Files:**
- Modify: `src/styles.css` (after line 1411, the `.preset-banner .example-cta` rule; and near line 1360, the preset item rules)

- [ ] **Step 1: Add the styles**

Append after `src/styles.css:1411` (`.preset-banner .example-cta { margin-left: auto; }`):

```css
.profile-kind-badge {
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: var(--glacier-deep);
  background: var(--glacier-wash);
  border-radius: 999px;
  padding: 0.1rem 0.45rem;
  margin-left: 0.4rem;
  white-space: nowrap;
}
.preset-kind-note {
  flex-basis: 100%;
  font-size: 0.8125rem;
  color: var(--ink-soft);
  line-height: 1.4;
}
```

`flex-basis: 100%` makes the note wrap to its own full-width line inside the flex `.preset-banner`, above the fork button (which keeps `margin-left: auto`).

- [ ] **Step 2: Verify build**

Run: `npm run build`
Expected: builds successfully; CSS bundle grows slightly.

- [ ] **Step 3: Commit**

```bash
git add src/styles.css
git commit -m "style: preset flavor badge chip and banner note"
```

---

## Task 7: Verify and correct the Lágmarkslaun figures

**Files:**
- Modify: `src/data/presets.ts` (the `preset:lagmarkslaun` `entries`)

The existing entries are best-effort. Verify each against the SGS/ASÍ lágmarkstekjur history (kjarasamningsbundnar lágmarkstekjur fyrir fullt starf) and correct any that are wrong. The current values to check:

```
2015-05 245000 · 2016-05 260000 · 2017-05 280000 · 2018-05 300000 ·
2019-04 317000 · 2020-04 335000 · 2021-01 351000 · 2022-04 368000 ·
2023-01 402235 · 2024-02 425000
```

- [ ] **Step 1: Source the authoritative figures**

Use WebSearch/WebFetch on asi.is / sgs.is / vinnretturinn for "lágmarkstekjur fyrir fullt starf" by year. Cross-check the effective month (lágmarkstekjur typically step on the samningsbundnar dagsetningar — often 1 April or 1 January). Record the correct `{ month, amount }` for each change within the CPI range.

- [ ] **Step 2: Update entries if needed**

Edit `src/data/presets.ts` so `preset:lagmarkslaun.entries` matches the verified figures. If all current values check out, leave them and note it in the commit body. Keep months in `YYYY-MM`, amounts as plain numbers (kr, not thousands).

- [ ] **Step 3: Run the guard test**

Run: `npx vitest run tests/presets.test.ts`
Expected: PASS (entries valid + in CPI range).

- [ ] **Step 4: Commit**

```bash
git add src/data/presets.ts
git commit -m "fix: verify Lágmarkslaun preset figures against SGS/ASÍ"
```

---

## Task 8: Add the VR survey preset (Sölu- og afgreiðslufólk)

**Files:**
- Modify: `src/data/presets.ts` (append a new preset to `PRESETS`)

**Data flavor:** `survey` — miðgildi (median) of **heildarlaun** (total wages), full-time, from VR's launarannsókn. One `SalaryEvent` per edition, dated at the edition's reference month.

**Proven extraction recipe** (VR PDFs are FlateDecode-compressed; WebFetch can't parse them, but their text streams decompress with zlib). For each edition PDF:

```bash
# 1) Download the PDF (example: Sept 2024 edition)
curl -sL -o /tmp/vr.pdf "https://www.vr.is/media/n4ed1zfs/launatafla_vefur.pdf"
# 2) Extract row text
python3 - <<'PY'
import re, zlib
data=open("/tmp/vr.pdf","rb").read()
streams=re.findall(rb'stream\r?\n(.*?)\r?\nendstream', data, re.DOTALL)
chunks=[]
for s in streams:
    try: d=zlib.decompress(s)
    except: continue
    parts=re.findall(rb'\((?:[^()\\]|\\.)*\)', d)
    if parts: chunks.append(b''.join(p[1:-1] for p in parts).decode('latin-1','replace'))
full=re.sub(r'\s+',' ',' '.join(chunks))
i=full.find("Sölu- og afgreiðslufólk")
print(full[i:i+80])
PY
```

**Column order (verified):** each starfsstétt row is
`Grunnlaun[miðgildi, meðaltal, 25%, 75%] Heildarlaun[miðgildi, meðaltal, 25%, 75%] Fjöldi`, all wage values in **þúsundir króna** (multiply by 1000). The number we want is the **5th value** (heildarlaun miðgildi).

**Worked example (already verified for this plan):** in the Sept 2024 edition the row reads
`Sölu- og afgreiðslufólk 705 740 603 838 716 749 609 845 2.192` →
heildarlaun miðgildi = 716 → **716000 kr at 2024-09** (2,192 respondents).

- [ ] **Step 1: Gather all sourceable editions**

Known edition PDFs (confirm current URLs via `site:vr.is launarannsókn` / the VR "Laun" page https://www.vr.is/kjaramal/laun/ ):
- Sept 2024 → https://www.vr.is/media/n4ed1zfs/launatafla_vefur.pdf → month `2024-09`
- Feb 2024 → https://www.vr.is/media/ogvfb001/launarannsókn_tafla_febrúar2024.pdf → month `2024-02`
- Feb 2023 → https://www.vr.is/media/y10ihrjt/tafla_launarannsokn.pdf → month `2023-02`

Search vr.is for any earlier editions and add them (the deeper the series, the better). For each, extract the `Sölu- og afgreiðslufólk` heildarlaun-miðgildi with the recipe above, ×1000.

**Series-depth check:** if only the three 2023–2024 editions are obtainable, the window is ~18 months — a thin decline story. Proceed with what's available (the banner explains it's survey data), but note in the commit body how many editions were found. If ZERO older-than-2023 editions exist and the result feels too thin to be meaningful, flag it back to the controller before finalizing.

- [ ] **Step 2: Append the preset**

Add to `PRESETS` in `src/data/presets.ts` (fill `entries` from Step 1; the 2024-09 point is pre-verified):

```ts
  {
    id: "preset:vr-afgreidsla",
    name: "Sölu- og afgreiðslufólk (miðgildi)",
    source:
      "Miðgildi heildarlauna, fullt starf — launarannsókn VR (vr.is)",
    kind: "survey",
    entries: [
      // one point per edition, ascending; amounts in kr (þús. × 1000)
      { month: "2023-02", amount: /* from Feb 2023 edition */ 0 },
      { month: "2024-02", amount: /* from Feb 2024 edition */ 0 },
      { month: "2024-09", amount: 716000 },
    ],
  },
```

Replace every `0` placeholder with the extracted figure before committing — the guard test will pass with `0` (it's a valid in-range entry), so DO NOT rely on the test to catch an unfilled value; fill them all.

- [ ] **Step 3: Run the guard test**

Run: `npx vitest run tests/presets.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/data/presets.ts
git commit -m "feat: add VR survey preset (Sölu- og afgreiðslufólk median)"
```

---

## Task 9: Add the teacher taxi preset (grunnskólakennari)

**Files:**
- Modify: `src/data/presets.ts` (append a new preset to `PRESETS`)

**Data flavor:** `taxi` — contractual **dagvinnulaun (mánaðarlaun)** for ONE representative launaflokkur/þrep of a fully-qualified grunnskólakennari, from the KÍ / Samband íslenskra sveitarfélaga launatöflur.

- [ ] **Step 1: Source one continuous launaflokkur/þrep series**

Sources: KÍ (ki.is), Samband íslenskra sveitarfélaga launatöflur (e.g. https://www.samband.is), Kjölur launatöflur (https://www.kjolur.is/is/kjarasamningar/...). Use the same download+zlib recipe from Task 8 for PDF tables (or read HTML tables directly with WebFetch).

**To keep the series honest and comparable, stay within one continuous samningstímabil** where the launaflokkur numbering is stable (launaflokkur numbers get remapped between agreements — do NOT splice a fixed flokkur number across a renumbering). Pick one representative position (e.g. grunnskólakennari með full réttindi at a mid step), and record the base mánaðarlaun (dagvinnulaun) at each launatöflu effective date within that period. Name the exact flokkur/þrep in the `source`.

- [ ] **Step 2: Append the preset**

```ts
  {
    id: "preset:kennari",
    name: "Grunnskólakennari (grunntaxti)",
    source:
      "Grunntaxti (dagvinnulaun), lfl. XX þrep Y — kjarasamningur KÍ/Sambands ísl. sveitarfélaga",
    kind: "taxi",
    entries: [
      // { month: "YYYY-MM", amount: <mánaðarlaun kr> } per launatöflu effective date
    ],
  },
```

Replace `lfl. XX þrep Y` with the actual flokkur/þrep chosen, and fill `entries` from Step 1 (≥2 points, ascending, within CPI range).

- [ ] **Step 3: Run the guard test**

Run: `npx vitest run tests/presets.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/data/presets.ts
git commit -m "feat: add grunnskólakennari taxi preset"
```

---

## Task 10: Add the nurse taxi preset (hjúkrunarfræðingur)

**Files:**
- Modify: `src/data/presets.ts` (append a new preset to `PRESETS`)

**Data flavor:** `taxi` — contractual dagvinnulaun for ONE representative launaflokkur/þrep of a hjúkrunarfræðingur, from the Félag íslenskra hjúkrunarfræðinga (Fíh) / BHM–ríkið launatöflur.

- [ ] **Step 1: Source one continuous launaflokkur/þrep series**

Sources: Fíh (https://www.hjukrun.is), BHM (https://www.bhm.is/vinnurettur/laun/rikid), the ríkið launatöflur. Same recipe and the same "one continuous samningstímabil, name the flokkur/þrep" discipline as Task 9.

- [ ] **Step 2: Append the preset**

```ts
  {
    id: "preset:hjukrunarfraedingur",
    name: "Hjúkrunarfræðingur (grunntaxti)",
    source:
      "Grunntaxti (dagvinnulaun), lfl. XX þrep Y — kjarasamningur Fíh/BHM við ríkið",
    kind: "taxi",
    entries: [
      // { month: "YYYY-MM", amount: <mánaðarlaun kr> } per launatöflu effective date
    ],
  },
```

Replace `lfl. XX þrep Y` with the actual flokkur/þrep, fill `entries` from Step 1 (≥2 points, ascending, within CPI range).

- [ ] **Step 3: Run the guard test**

Run: `npx vitest run tests/presets.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/data/presets.ts
git commit -m "feat: add hjúkrunarfræðingur taxi preset"
```

---

## Task 11: Document how to refresh presets

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add a "Refreshing presets" subsection**

Under the existing Profiles/data section of `README.md`, add:

```markdown
### Refreshing presets

Public presets in `src/data/presets.ts` are hand-transcribed from published
sources (they are NOT auto-updated like the CPI, which has no equivalent API):

- **Lágmarkslaun** — SGS/ASÍ lágmarkstekjur (asi.is).
- **Sölu- og afgreiðslufólk (miðgildi)** — VR launarannsókn, miðgildi
  heildarlauna. Each edition PDF is FlateDecode-compressed; extract text with
  the zlib recipe in the implementation plan, read the heildarlaun-miðgildi
  column (þús. kr × 1000), add one dated point per edition.
- **Kennari / Hjúkrunarfræðingur (grunntaxti)** — public-sector launatöflur
  (KÍ/Samband, Fíh/BHM). One launaflokkur/þrep, dagvinnulaun, per effective
  date within a single samningstímabil (launaflokkur numbering is remapped
  between agreements — don't splice across a renumbering).

Every preset carries a `kind` (`minimum`/`taxi`/`survey`) that drives the
switcher badge and banner explainer, and a `source` citation. A test enforces
that all entries are valid and within the bundled CPI range.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: how to refresh public presets"
```

---

## Task 12: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Typecheck, test, build**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: `TSC OK`; all tests pass; build succeeds.

- [ ] **Step 2: Playwright badge + banner check**

Start the preview server (`npm run preview`), open the app, and via the Playwright MCP:
1. Open the switch list → assert each preset row shows its badge text (`lágmark`, `miðgildi`, `grunntaxti`).
2. Select each preset → assert the banner shows the matching flavor explainer copy (`copy.profiles.presetKinds[kind].banner`) and that the form is read-only with the fork CTA.
3. Fork one preset → assert it becomes an editable user profile.
4. Confirm no network requests to anything other than the Umami endpoint (privacy invariant).

- [ ] **Step 3: Final commit (if any Playwright-driven fixes were needed)**

```bash
git add -A
git commit -m "test: verify preset badges and banners in browser"
```

---

## Notes for the executor

- **DRY:** the badge and banner both read `copy.profiles.presetKinds[kind]` — never hardcode flavor strings in components.
- **YAGNI:** exactly four presets. Don't add more or build a seniority picker (out of scope).
- **Honesty gate:** never approximate a kr figure. If a source can't be obtained, leave the preset out and flag it rather than guessing — a wrong "authoritative" number is worse than a missing preset.
- **`class=` not `className`** (Preact).
- **Smart quotes:** edit `copy.ts` only via byte-safe Python; verify `„…"` intact after.
