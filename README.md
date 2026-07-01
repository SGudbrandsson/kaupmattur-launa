# Kaupmáttur launa

**Hvað eru launin þín raunverulega virði?** A fully client-side website that
shows how Icelandic salaries lose purchasing power to inflation, month by
month. Enter your salary changes (month + ISK amount); the app charts the
inflation-adjusted real value from each raise until today, using the
Icelandic consumer price index.

## Privacy, architecturally guaranteed

The salary data never leaves the browser:

- **No server.** The site is static files; entries live in `localStorage` only.
- **The CPI dataset is bundled** into the page at build time and the fonts are
  self-hosted, so the salary calculation makes no network requests at all.
- **No cookies, no personal data.** The only thing the page sends is an
  anonymous, cookieless visit count via [Umami](https://umami.is)
  (`umami.snjall.is`), which honours Do Not Track. It never sees the salary
  figures — those are computed and kept entirely in the browser.

This isn't a policy — it's how the thing is built. (The Hagstofa API also
sends no CORS headers, so runtime fetching of the salary calculation is
impossible by design.)

## Profiles

Salary histories are saved as named **profiles** in `localStorage` — switch,
create a new blank one, rename, delete, duplicate, or **export/import** a profile
as a small `.json` file (all local; no network). A bundled, read-only **preset**
(Icelandic minimum wage, cited) is available to explore; editing it forks an
editable copy. Storage migrates the old single-slot format to the multi-profile
store automatically. Code: `src/lib/profiles.ts`, `src/lib/storage.ts`,
`src/lib/profileFile.ts`, `src/components/ProfileBar.tsx`.

### Refreshing presets

Public presets in `src/data/presets.ts` are hand-curated from cited authorities
(they are NOT auto-updated with the CPI):

- **Lágmarkslaun** (`kind: "minimum"`) — SGS/ASÍ lágmarkstekjur fyrir fullt
  starf (asi.is), dated at each kjarasamningsbundna hækkun.
- **Afgreiðslu- og sölufólk / Grunnskólakennarar / Hjúkrunarfræðingar**
  (`kind: "survey"`) — miðgildi heildarlauna fullvinnandi by starfsstétt from
  **Hagstofa Íslands table VIN02001** (annual, machine-readable via the PX-Web
  API). Each annual figure is placed at mid-year (`YYYY-06`) and amounts are
  þús. kr × 1000.

To refresh a survey preset, re-query the Hagstofa API (values come back in
þús. kr; multiply by 1000):

```bash
curl -sL -X POST \
  "https://px.hagstofa.is/pxis/api/v1/is/Samfelag/launogtekjur/1_laun/1_laun/VIN02001.px" \
  -H "Content-Type: application/json" -d '{
    "query": [
      {"code": "Starf", "selection": {"filter": "item", "values": ["522 *", "2331*", "2230*"]}},
      {"code": "Kyn", "selection": {"filter": "item", "values": ["0"]}},
      {"code": "Laun og vinnutími", "selection": {"filter": "item", "values": ["3"]}},
      {"code": "Eining", "selection": {"filter": "item", "values": ["2"]}}
    ],
    "response": {"format": "json-stat2"}
  }'
```

`Starf` = starfsstétt code (`522 *` afgreiðsla/sala, `2331*` grunnskólakennsla,
`2230*` hjúkrun/ljósmæður), `Kyn=0` alls, `Laun og vinnutími=3` heildarlaun,
`Eining=2` miðgildi.

Every preset carries a `kind` (`minimum`/`survey`) that drives the switcher
badge and banner explainer, and a `source` citation. A test enforces that all
entries are valid and within the bundled CPI range.

## Tangible comparisons (price anchors)

The payoff card can express the monthly purchasing-power loss as rent, food, or
a yearly lifestyle figure. These use a small bundled basket, `src/data/anchors.json`:
national-average reference prices at a reference month, **inflated to the latest
CPI month at render time** so they never go stale. They are approximate by
nature and always carry an "um það bil" badge in the UI. The "raise needed to
stand still" lens is exact — it comes straight from the CPI. Update the anchor
prices by editing `anchors.json` (and bump `referenceMonth` to match).

## Optional on-device AI autofill

When the browser exposes Chrome's on-device **Prompt API** (Gemini Nano) — and,
for voice, on-device Web Speech — a "Fylla út með AI" button appears on the form.
Users can describe their salary history in plain Icelandic or English (typed or
spoken) and the model parses it into editable rows. **Everything runs locally**:
the model and speech recognition never send the salary text or audio anywhere, so
the no-network promise is preserved. The feature is a progressive enhancement —
if the APIs aren't present (the common case today), nothing renders and the form
behaves exactly as before. Code: `src/lib/ai/` and `src/components/AiAutofill.tsx`.

## How the math works

We use the monthly consumer price index (vísitala neysluverðs, base
1988=100) from Statistics Iceland, table VIS01000 — the same index used for
verðtrygging. For a salary *A* set in month *d*:

```
purchasing power in month t  =  A × CPI(d) / CPI(t)
needed to keep up today      =  A × CPI(today) / CPI(d)
```

With multiple raises, the nominal salary is a step function; the real-value
line resets to the new nominal at each raise and decays against that raise's
own CPI baseline. The core math lives in `src/lib/inflation.ts` and is
unit-tested against real CPI values.

The page leads with **decline from peak**: real purchasing power is `salary ÷ CPI`,
its peak is the highest point over *all* months (Icelandic CPI has deflationary
dips, so the peak can fall between raises), and the headline shows how far today
sits below that peak — with lifetime change as secondary context. The chart offers
three reference frames (today's krónur / first-month krónur / keep-pace baseline).

## Development

```bash
npm install
npm run dev        # local dev server
npm test           # vitest unit tests (math, dataset, formatting)
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build
```

Stack: Vite, Preact, TypeScript, Vitest. The chart is hand-rolled SVG — no
chart library. The only runtime dependency is Preact.

## Updating the CPI data

Hagstofa publishes the CPI near the end of each month. To refresh:

```bash
npm run update-data   # fetches the full series, validates, writes src/data/cpi.json
git commit -am "chore: CPI data through <month>"
# rebuild + redeploy
```

The script validates the series before writing (contiguous months, sane
month-over-month deltas, never fewer months than the committed file) and
fails loudly on anything unexpected. The UI shows "Gögn til og með <mánuður>"
derived from the dataset, so stale data is always visible.

This is the only code in the repository that touches the network.

### Automated monthly refresh

`.github/workflows/update-data.yml` runs `update-data` on the 2nd of every
month (and on demand from the Actions tab). It commits `src/data/cpi.json`
**only** when a new month of data appears — the `fetchedAt` timestamp alone
never triggers a commit. Trigger a run manually with:

```bash
gh workflow run "Update CPI data"
```

## Deploying

`npm run build` produces a self-contained `dist/` with relative asset paths
(`base: './'`), so it deploys to any static host — GitHub Pages, Netlify,
Cloudflare Pages, or a plain web server. No environment variables, no build
secrets.

This repo deploys to **GitHub Pages** automatically: `.github/workflows/deploy.yml`
builds and publishes `dist/` on every push to `main` (including the monthly CPI
update, so the live site refreshes itself). Live URL:
<https://sgudbrandsson.github.io/kaupmattur-launa/>.

To serve it from a custom domain, set it under **Settings → Pages → Custom
domain** (or `gh api -X PUT repos/SGudbrandsson/kaupmattur-launa/pages -f cname=your.domain`)
and point DNS at GitHub: a `CNAME` to `sgudbrandsson.github.io` for a subdomain,
or the four GitHub Pages `A`/`AAAA` records for an apex domain. The relative
`base: './'` means no rebuild is needed when moving from the project subpath to
a root domain.

## Project documentation

- Design document: `docs/superpowers/specs/2026-06-12-isk-value-web-design.md`
- Data source: [Hagstofa Íslands, VIS01000](https://px.hagstofa.is/pxis/pxweb/is/Efnahagur/Efnahagur__visitolur__1_vnv__1_vnv/VIS01000.px)
