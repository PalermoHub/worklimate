#!/usr/bin/env node
// Aggiorna data/temperatura-oggi.json con la temperatura reale osservata,
// interrogando MeteoHub (Agenzia ItaliaMeteo), rete DPC Sicilia.
// Fonte indipendente dal rischio da caldo (Worklimate, scripts/update-data.mjs):
// gira più spesso perché è un'osservazione in tempo reale, non una previsione
// giornaliera. Non tocca data/rischio-oggi.json né data/storico-rischio.csv.

import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const COMUNI_PATH = path.join(ROOT, 'data', 'comuni-sicilia.json');
const JSON_PATH = path.join(ROOT, 'data', 'temperatura-oggi.json');
const CSV_PATH = path.join(ROOT, 'data', 'storico-temperatura.csv');

// B12101 = temperatura aria/dry-bulb in Kelvin.
const METEOHUB_URL = 'https://meteohub.agenziaitaliameteo.it/api/observations';

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} per ${url}`);
  return res.json();
}

async function fetchTemperatureStations(today) {
  const q = `reftime: >=${today} 00:00,<=${today} 23:59;product:B12101;license:CCBY_COMPLIANT;timerange:254,0,0;level:103,2000,0,0`;
  const params = new URLSearchParams({ q, output_format: 'JSON', networks: 'dpcn-sicilia' });
  const j = await getJson(`${METEOHUB_URL}?${params}`);
  return (j.data || [])
    .map((s) => {
      const values = s.prod?.[0]?.val || [];
      if (!values.length) return null;
      // ultima osservazione disponibile: è il dato "reale" più recente,
      // non un massimo del giorno (che richiederebbe attendere il picco).
      const last = values.reduce((a, b) => (a.ref > b.ref ? a : b));
      return { lat: s.stat.lat, lon: s.stat.lon, tempC: last.val - 273.15, ref: last.ref };
    })
    .filter(Boolean);
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// stazione più vicina entro 40km: oltre, il dato non è rappresentativo del comune
const MAX_STATION_DISTANCE_KM = 40;

function nearestStationTemp(lat, lon, stations) {
  let best = null;
  let bestDist = Infinity;
  for (const s of stations) {
    const d = haversineKm(lat, lon, s.lat, s.lon);
    if (d < bestDist) {
      bestDist = d;
      best = s;
    }
  }
  if (!best || bestDist > MAX_STATION_DISTANCE_KM) return null;
  return Math.round(best.tempC * 10) / 10;
}

function csvField(v) {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

async function appendCsvStorico(timestamp, rows) {
  const header = 'timestamp,comune,provincia,temperatura\n';
  let existing = '';
  try {
    existing = await readFile(CSV_PATH, 'utf8');
  } catch {
    // file non esiste ancora: verrà creato con l'header
  }
  const righe = rows
    .filter(([, , temp]) => temp !== null)
    .map(([nome, sigla, temp]) => [timestamp, nome, sigla, temp].map(csvField).join(','))
    .join('\n');
  const out = existing ? `${existing}${righe}\n` : `${header}${righe}\n`;
  await writeFile(CSV_PATH, out, 'utf8');
  console.log(`Aggiornato ${CSV_PATH} (+${rows.filter(([, , t]) => t !== null).length} righe).`);
}

async function main() {
  const comuni = JSON.parse(await readFile(COMUNI_PATH, 'utf8'));
  console.log(`Comuni da interrogare: ${comuni.length}`);

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const stations = await fetchTemperatureStations(today);
  console.log(`Stazioni temperatura: ${stations.length}`);

  const rows = comuni.map((c) => [c.nome, c.sigla, nearestStationTemp(c.lat, c.lon, stations)]);
  const matched = rows.filter(([, , t]) => t !== null).length;
  console.log(`Comuni con temperatura: ${matched}/${comuni.length}`);
  if (matched < comuni.length * 0.5) {
    throw new Error(
      `Troppi comuni senza temperatura (${matched}/${comuni.length}): possibile problema con MeteoHub, aborto senza scrivere.`,
    );
  }

  await writeFile(
    JSON_PATH,
    JSON.stringify({ generatedAt: today, generatedAtTimestamp: now.toISOString(), data: rows }),
    'utf8',
  );
  console.log(`Scritto ${JSON_PATH} (${matched} comuni).`);

  await appendCsvStorico(now.toISOString(), rows);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
