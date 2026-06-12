/**
 * Fetches the full monthly CPI series (vísitala neysluverðs) from the
 * Hagstofa Íslands PX-Web API and writes it to src/data/cpi.json.
 *
 * This is the ONLY network code in the project. The site itself never
 * fetches anything at runtime — the API sends no CORS headers, and the
 * privacy promise ("engin netumferð") depends on the data being bundled.
 *
 * Usage: npm run update-data
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const API_URL =
  "https://px.hagstofa.is/pxis/api/v1/is/Efnahagur/visitolur/1_vnv/1_vnv/VIS01000.px";
const OUT_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "src",
  "data",
  "cpi.json",
);
const FIRST_MONTH = "1988-05";

async function fetchSeries() {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: [
        { code: "Vísitala", selection: { filter: "item", values: ["CPI"] } },
        { code: "Liður", selection: { filter: "item", values: ["index"] } },
        { code: "Mánuður", selection: { filter: "all", values: ["*"] } },
      ],
      response: { format: "json" },
    }),
  });
  if (!res.ok) {
    throw new Error(`Hagstofa API responded ${res.status} ${res.statusText}`);
  }
  // The API may prefix the JSON with a BOM.
  const body = (await res.text()).replace(/^﻿/, "");
  return JSON.parse(body);
}

function toMonthKey(pxMonth) {
  const m = /^(\d{4})M(\d{2})$/.exec(pxMonth);
  if (!m) throw new Error(`Unexpected month format from API: ${pxMonth}`);
  return `${m[1]}-${m[2]}`;
}

function nextMonth(key) {
  const [y, m] = key.split("-").map(Number);
  return m === 12
    ? `${y + 1}-01`
    : `${y}-${String(m + 1).padStart(2, "0")}`;
}

function validate(values, previousCount) {
  const months = Object.keys(values).sort();
  if (months[0] !== FIRST_MONTH) {
    throw new Error(`Series starts at ${months[0]}, expected ${FIRST_MONTH}`);
  }
  for (let i = 1; i < months.length; i++) {
    if (months[i] !== nextMonth(months[i - 1])) {
      throw new Error(`Gap in series: ${months[i - 1]} -> ${months[i]}`);
    }
    const prev = values[months[i - 1]];
    const curr = values[months[i]];
    if (!(curr > 0) || Math.abs(curr / prev - 1) > 0.1) {
      throw new Error(
        `Implausible value at ${months[i]}: ${curr} (previous ${prev})`,
      );
    }
  }
  if (months.length < previousCount) {
    throw new Error(
      `Series shrank: ${months.length} months, previously ${previousCount}`,
    );
  }
  return months;
}

async function main() {
  let previous = null;
  try {
    previous = JSON.parse(await readFile(OUT_PATH, "utf8"));
  } catch {
    // First run — no existing file to compare against.
  }

  const raw = await fetchSeries();
  const values = {};
  for (const row of raw.data) {
    const value = Number(row.values[0]);
    if (!Number.isFinite(value)) {
      throw new Error(`Non-numeric value for ${row.key[0]}: ${row.values[0]}`);
    }
    values[toMonthKey(row.key[0])] = value;
  }

  const months = validate(values, previous ? Object.keys(previous.values).length : 0);
  const sorted = Object.fromEntries(months.map((m) => [m, values[m]]));
  const out = {
    source:
      "Hagstofa Íslands, VIS01000 (Vísitala neysluverðs, grunnur 1988=100)",
    fetchedAt: new Date().toISOString(),
    firstMonth: months[0],
    lastMonth: months[months.length - 1],
    values: sorted,
  };

  await mkdir(dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, JSON.stringify(out, null, 1) + "\n");

  const added = previous
    ? months.filter((m) => !(m in previous.values))
    : months;
  console.log(`Wrote ${months.length} months (${months[0]} … ${out.lastMonth})`);
  if (previous && added.length === 0) {
    console.log("No new months since last update.");
  } else if (previous) {
    for (const m of added) console.log(`  added ${m}: ${sorted[m]}`);
  }
}

main().catch((err) => {
  console.error(`update-data failed: ${err.message}`);
  process.exit(1);
});
