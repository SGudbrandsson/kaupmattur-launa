# Kaupmáttur launa

**Hvað eru launin þín raunverulega virði?** A fully client-side website that
shows how Icelandic salaries lose purchasing power to inflation, month by
month. Enter your salary changes (month + ISK amount); the app charts the
inflation-adjusted real value from each raise until today, using the
Icelandic consumer price index.

## Privacy, architecturally guaranteed

The salary data never leaves the browser:

- **No server.** The site is static files; entries live in `localStorage` only.
- **No runtime network requests.** The CPI dataset is bundled into the page
  at build time and the fonts are self-hosted. Open the devtools Network tab:
  every request is same-origin.
- **No cookies, no analytics.**

This isn't a policy — it's how the thing is built. (The Hagstofa API also
sends no CORS headers, so runtime fetching is impossible by design.)

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
