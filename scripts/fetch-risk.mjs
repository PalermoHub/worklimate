#!/usr/bin/env node
// Interroga ogni stazione già risolta in data/stazioni.json (via pgrid,
// quindi senza toccare Nominatim) e scrive data/rischio.geojson con il
// rischio da caldo di oggi/domani/dopodomani per ogni punto.
//
// Pensato per girare ogni giorno via GitHub Actions.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const STAZIONI_PATH = new URL("../data/stazioni.json", import.meta.url);
const OUT_PATH = new URL("../data/rischio.geojson", import.meta.url);
const CSV_PATH = new URL("../data/rischio_storico.csv", import.meta.url);
const CSV_HEADER = "data,codice_istat,comune,provincia,colore,label,desc,pgrid\n";

function csvEscape(value) {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function worklimateNow(pgrid) {
  const out = execFileSync(
    "npx",
    ["-y", "@aborruso/worklimate", "now", String(pgrid), "--json"],
    { encoding: "utf8" }
  );
  return JSON.parse(out);
}

function main() {
  const stazioni = JSON.parse(readFileSync(STAZIONI_PATH, "utf8"));
  const features = [];
  const csvRows = [];

  for (const s of stazioni) {
    process.stderr.write(`Interrogo ${s.nome} (pgrid ${s.pgrid})...\n`);
    try {
      const res = worklimateNow(s.pgrid);
      const oggi = res.giorni[0];
      features.push({
        type: "Feature",
        geometry: { type: "Point", coordinates: [s.lon, s.lat] },
        properties: {
          nome: s.nome,
          provincia: s.provincia,
          pgrid: s.pgrid,
          data: oggi.data,
          colore: oggi.colore,
          label: oggi.label,
          desc: oggi.desc,
          giorni: res.giorni, // oggi + prossimi 2 giorni, per il popup
        },
      });
      csvRows.push(
        [oggi.data, s.codice_istat, s.nome, s.provincia, oggi.colore, oggi.label, oggi.desc, s.pgrid]
          .map(csvEscape)
          .join(",")
      );
    } catch (err) {
      process.stderr.write(`  -> errore su ${s.nome}: ${err.message}\n`);
    }
  }

  const geojson = {
    type: "FeatureCollection",
    generated_at: new Date().toISOString(),
    features,
  };

  mkdirSync(fileURLToPath(new URL("../data", import.meta.url)), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(geojson, null, 2) + "\n");
  process.stderr.write(`\nScritte ${features.length}/${stazioni.length} feature in data/rischio.geojson\n`);

  if (!existsSync(CSV_PATH)) writeFileSync(CSV_PATH, CSV_HEADER);
  appendFileSync(CSV_PATH, csvRows.map((r) => r + "\n").join(""));
  process.stderr.write(`Aggiunte ${csvRows.length} righe a data/rischio_storico.csv\n`);
}

main();
