#!/usr/bin/env node
// Da lanciare UNA VOLTA (o quando cambia config/punti.json), non nel workflow
// schedulato: risolve ogni luogo nel pgrid della stazione Worklimate più
// vicina, così le esecuzioni successive non devono più fare geocoding.
//
// Rispetta la Nominatim Usage Policy: una richiesta alla volta, con pausa
// abbondante tra una chiamata e l'altra (la CLI fa già 1 richiesta a run,
// qui aggiungiamo il ritardo lato nostro perché lo lanciamo in loop).
//
// Uso: node scripts/geocode-stazioni.mjs

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const PUNTI_PATH = new URL("../config/punti.json", import.meta.url);
const OUT_PATH = new URL("../data/stazioni.json", import.meta.url);
const PAUSE_MS = 1200;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function worklimateSearch(luogo) {
  const out = execFileSync(
    "npx",
    ["-y", "@aborruso/worklimate", "search", luogo, "--json"],
    { encoding: "utf8" }
  );
  return JSON.parse(out);
}

async function main() {
  const punti = JSON.parse(readFileSync(PUNTI_PATH, "utf8"));
  const stazioni = [];

  for (const punto of punti) {
    // Se punti.json arriva da prepara-comuni.mjs, "Comune, Provincia"
    // disambigua meglio su Nominatim rispetto al solo nome (es. comuni
    // omonimi in regioni diverse).
    const query = punto.provincia ? `${punto.nome}, ${punto.provincia}` : punto.nome;
    process.stderr.write(`Geocodifico "${query}"...\n`);
    try {
      const res = worklimateSearch(query);
      stazioni.push({
        nome: punto.nome,
        codice_istat: punto.codice_istat || null,
        // Preferisce il centroide ufficiale del Municipio (da ISTAT/
        // opendatasicilia), se presente in punti.json: è il punto giusto
        // da mostrare, dato che il dato di rischio è comunque a livello
        // di comune/provincia. Altrimenti usa le coordinate della
        // stazione restituite da worklimate.
        lat: Number.isFinite(punto.lat) ? punto.lat : Number(res.stazione.lat),
        lon: Number.isFinite(punto.lon) ? punto.lon : Number(res.stazione.lon),
        pgrid: res.pgrid,
        distanza_km: res.distanza_km,
      });
    } catch (err) {
      process.stderr.write(`  -> errore, punto saltato: ${err.message}\n`);
    }
    await sleep(PAUSE_MS);
  }

  mkdirSync(fileURLToPath(new URL("../data", import.meta.url)), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(stazioni, null, 2) + "\n");
  process.stderr.write(`\nSalvate ${stazioni.length}/${punti.length} stazioni in data/stazioni.json\n`);
}

main();
