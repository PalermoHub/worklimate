#!/usr/bin/env node
// Aggiorna docs/sicilia-rischio-caldo.html con il rischio da caldo del giorno,
// interrogando i due endpoint pubblici usati dall'app Worklimate
// (https://github.com/aborruso/worklimate). Nessuna autenticazione richiesta.
//
// Non tocca data/comuni-sicilia.json: l'elenco comuni/centroidi è statico
// (confini amministrativi ISTAT, cambiano di rado) e va rigenerato a mano
// con scripts/fetch-comuni.mjs solo in caso di variazioni comunali.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const COMUNI_PATH = path.join(ROOT, 'data', 'comuni-sicilia.json');
const HTML_PATH = path.join(ROOT, 'index.html');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const HEADERS = {
  'User-Agent': UA,
  Accept: 'application/json, text/javascript, */*; q=0.01',
  'X-Requested-With': 'XMLHttpRequest',
  Referer: 'https://app.worklimate.it/ordinanza-caldo-lavoro',
};
const THROTTLE_MS = 100;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status} per ${url}`);
  return res.json();
}

async function nearestStation(place, lat, lon) {
  const params = new URLSearchParams({
    osmod: 'true',
    place,
    latx: String(lat),
    lonx: String(lon),
  });
  return getJson(`https://app.worklimate.it/osm-stazioni.php?${params}`);
}

async function todayRisk(pgrid) {
  const params = new URLSearchParams({ pgrid: String(pgrid), sys: 'regular' });
  return getJson(`https://app.worklimate.it/osm-stazioni.php?${params}`);
}

async function main() {
  const comuni = JSON.parse(await readFile(COMUNI_PATH, 'utf8'));
  console.log(`Comuni da interrogare: ${comuni.length}`);

  // 1. stazione/pgrid più vicina per ciascun comune
  const withStation = [];
  const stationErrors = [];
  for (const [i, c] of comuni.entries()) {
    try {
      const j = await nearestStation(c.nome, c.lat, c.lon);
      withStation.push({ ...c, pgrid: j.id });
    } catch (e) {
      stationErrors.push([c.nome, e.message]);
    }
    if (i % 50 === 0) console.log(`  stazioni ${i}/${comuni.length}`);
    await sleep(THROTTLE_MS);
  }
  console.log(`Stazioni ok: ${withStation.length}, errori: ${stationErrors.length}`);
  if (stationErrors.length) console.log(stationErrors);

  // 2. rischio per ogni pgrid unico (dedup: più comuni condividono la stessa cella griglia)
  const uniquePgrids = [...new Set(withStation.map((c) => c.pgrid))];
  const riskByPgrid = new Map();
  const riskErrors = [];
  for (const [i, pg] of uniquePgrids.entries()) {
    try {
      riskByPgrid.set(pg, await todayRisk(pg));
    } catch (e) {
      riskErrors.push([pg, e.message]);
    }
    if (i % 40 === 0) console.log(`  rischio ${i}/${uniquePgrids.length}`);
    await sleep(THROTTLE_MS);
  }
  console.log(`Rischio ok: ${riskByPgrid.size}/${uniquePgrids.length}, errori: ${riskErrors.length}`);

  // 3. join finale [nome, sigla, g1, g2, g3]
  const compact = [];
  for (const c of withStation) {
    const r = riskByPgrid.get(c.pgrid);
    if (!r) continue;
    compact.push([c.nome, c.sigla, r.g1.label, r.g2.label, r.g3.label]);
  }
  console.log(`Comuni con dato completo: ${compact.length}`);
  if (compact.length < comuni.length * 0.8) {
    throw new Error(
      `Troppi comuni senza dato (${compact.length}/${comuni.length}): possibile problema con l'API, aborto senza scrivere l'HTML.`,
    );
  }

  // 4. scrivi HTML sostituendo solo i marker GENERATED_AT e DATA
  let html = await readFile(HTML_PATH, 'utf8');
  const today = new Date().toISOString().slice(0, 10);

  const genAtRe = /const GENERATED_AT = "[^"]*";/;
  if (!genAtRe.test(html)) throw new Error('Marker GENERATED_AT non trovato in ' + HTML_PATH);
  html = html.replace(genAtRe, `const GENERATED_AT = "${today}";`);

  const dataRe = /const DATA = \[.*?\];(?= \/\/ \[nome, provincia, g1, g2, g3\])/s;
  if (!dataRe.test(html)) throw new Error('Marker DATA non trovato in ' + HTML_PATH);
  html = html.replace(dataRe, `const DATA = ${JSON.stringify(compact)};`);

  await writeFile(HTML_PATH, html, 'utf8');
  console.log(`Scritto ${HTML_PATH} (GENERATED_AT=${today}, ${compact.length} comuni).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
