#!/usr/bin/env node
// Rigenera data/comuni-sicilia.json (nome, provincia, sigla, istat, centroide)
// dai confini amministrativi ISTAT via openpolis/geojson-italy.
//
// Da lanciare A MANO, non è nel workflow giornaliero: l'elenco dei comuni
// cambia solo per fusioni/istituzioni comunali (eventi rari, poche volte
// l'anno in tutta Italia), non ha senso rigenerarlo ogni giorno.
//
// Uso: node scripts/fetch-comuni.mjs

import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.join(__dirname, '..', 'data', 'comuni-sicilia.json');

// Codici provincia ISTAT della Sicilia (reg_istat_code 19)
const PROVINCE_CODES = ['81', '82', '83', '84', '85', '86', '87', '88', '89'];

function centroidOf(geometry) {
  const pts = [];
  const walk = (c, depth) => {
    if (depth === 0) pts.push(c);
    else c.forEach((x) => walk(x, depth - 1));
  };
  if (geometry.type === 'Polygon') walk(geometry.coordinates, 2);
  else if (geometry.type === 'MultiPolygon') walk(geometry.coordinates, 3);
  const lat = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  const lon = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  return [lat, lon];
}

async function main() {
  const comuni = [];
  for (const p of PROVINCE_CODES) {
    const url = `https://raw.githubusercontent.com/openpolis/geojson-italy/master/geojson/limits_P_${p}_municipalities.geojson`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status} per ${url}`);
    const geo = await res.json();
    for (const feat of geo.features) {
      const props = feat.properties;
      const [lat, lon] = centroidOf(feat.geometry);
      comuni.push({
        nome: props.name,
        provincia: props.prov_name,
        sigla: props.prov_acr,
        istat: props.com_istat_code,
        lat: Number(lat.toFixed(6)),
        lon: Number(lon.toFixed(6)),
      });
    }
    console.log(`provincia ${p}: ok`);
  }
  comuni.sort((a, b) => a.istat.localeCompare(b.istat));
  await writeFile(OUT_PATH, JSON.stringify(comuni, null, 1), 'utf8');
  console.log(`Scritti ${comuni.length} comuni in ${OUT_PATH}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
