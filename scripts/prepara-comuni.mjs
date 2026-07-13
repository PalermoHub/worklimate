#!/usr/bin/env node
// Scarica l'elenco dei comuni italiani (codice ISTAT + coordinate del
// Municipio) dal repo opendatasicilia/comuni-italiani, che a sua volta
// deriva i dati dai file ufficiali ISTAT (Codici statistici delle unità
// amministrative territoriali) e genera config/punti.json filtrato.
//
// Fonte: https://github.com/opendatasicilia/comuni-italiani
//
// Uso:
//   node scripts/prepara-comuni.mjs                # tutta Italia (7.894 comuni: tanti!)
//   node scripts/prepara-comuni.mjs --regione 19    # solo Sicilia (cod_reg 19)
//   node scripts/prepara-comuni.mjs --provincia PA  # solo provincia di Palermo (sigla)

import { writeFileSync } from "node:fs";

const URL_MAIN_CSV =
  "https://raw.githubusercontent.com/opendatasicilia/comuni-italiani/main/dati/main.csv";
const OUT_PATH = new URL("../config/punti.json", import.meta.url);

const args = process.argv.slice(2);
const getArg = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
};
const codiceRegione = getArg("--regione"); // es. "19" = Sicilia
const siglaProvincia = getArg("--provincia"); // es. "PA"

// main.csv è un CSV semplice, senza virgole dentro i campi: basta lo split.
function parseCsv(text) {
  const [headerLine, ...lines] = text.trim().split("\n");
  const headers = headerLine.split(",").map((h) => h.trim());
  return lines.filter(Boolean).map((line) => {
    const cols = line.split(",");
    const row = {};
    headers.forEach((h, i) => (row[h] = (cols[i] || "").trim()));
    return row;
  });
}

async function main() {
  const res = await fetch(URL_MAIN_CSV);
  if (!res.ok) throw new Error(`Download fallito: HTTP ${res.status}`);
  const rows = parseCsv(await res.text());

  let filtrati = rows;
  if (codiceRegione) filtrati = filtrati.filter((r) => r.cod_reg === codiceRegione);
  if (siglaProvincia) filtrati = filtrati.filter((r) => r.sigla === siglaProvincia);

  const punti = filtrati.map((r) => ({
    nome: r.comune,
    provincia: r.sigla,
    codice_istat: r.pro_com_t,
    lat: Number(r.lat),
    lon: Number(r.long),
  }));

  writeFileSync(OUT_PATH, JSON.stringify(punti, null, 2) + "\n");
  process.stderr.write(
    `Scritti ${punti.length} comuni in config/punti.json` +
      (codiceRegione || siglaProvincia ? " (filtrati)\n" : " (tutta Italia — valuta un filtro)\n")
  );
}

main().catch((err) => {
  process.stderr.write(`Errore: ${err.message}\n`);
  process.exit(1);
});
