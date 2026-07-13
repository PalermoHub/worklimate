# Mappa dinamica del rischio da caldo (Worklimate)

Mappa dei livelli di rischio da stress da caldo per un elenco di punti,
costruita sopra la CLI [worklimate](https://github.com/aborruso/worklimate)
di Andrea Borruso.

## Come funziona

```
scripts/prepara-comuni.mjs    → una tantum: scarica l'elenco comuni ISTAT (via opendatasicilia) e genera config/punti.json
config/punti.json     → elenco dei comuni da mappare (nome, provincia, codice ISTAT, coordinate Municipio)
scripts/geocode-stazioni.mjs  → una tantum: comune → pgrid stazione (usa Nominatim)
data/stazioni.json    → output dello script sopra (pgrid + coordinate, statico)
scripts/fetch-risk.mjs → schedulato: pgrid → rischio oggi/domani/dopodomani
data/rischio.geojson  → GeoJSON pronto per la mappa (aggiornato ogni giorno)
index.html             → viewer MapLibre che legge data/rischio.geojson
.github/workflows/update-map.yml → Action che rilancia fetch-risk.mjs ogni giorno
```

I comuni (nome, codice ISTAT, coordinate del Municipio, provincia, regione)
vengono da [opendatasicilia/comuni-italiani](https://github.com/opendatasicilia/comuni-italiani),
che a sua volta deriva questi campi dai file ufficiali ISTAT (Codici
statistici delle unità amministrative territoriali). Così le coordinate
mostrate in mappa sono il centroide ufficiale del Municipio, non un punto
qualsiasi restituito da un geocoder.

Il geocoding via Nominatim (necessario solo per risolvere il `pgrid` della
stazione più vicina a ogni comune) viene fatto **una sola volta**, non a
ogni run: così il workflow schedulato interroga solo Worklimate via
`pgrid` e non tocca mai Nominatim, restando ben dentro la sua usage
policy.

## Setup

1. **Genera l'elenco comuni** — scarica i dati ISTAT/opendatasicilia e
   filtra per regione o provincia:
   ```
   node scripts/prepara-comuni.mjs --regione 19     # tutta la Sicilia
   node scripts/prepara-comuni.mjs --provincia PA    # solo provincia di Palermo
   ```
   Genera `config/punti.json`. Puoi anche editarlo a mano dopo, per
   togliere/aggiungere comuni specifici.

2. **Geocodifica una volta sola**, in locale:
   ```
   npm install   # non necessario, usiamo npx; utile solo per testare
   node scripts/geocode-stazioni.mjs
   ```
   Genera `data/stazioni.json`. Fai commit di questo file: è statico e
   non serve rigenerarlo finché non cambi l'elenco dei punti.

3. **Pubblica su GitHub Pages** — attiva Pages sul branch `main` (root),
   così `index.html` sarà raggiungibile pubblicamente.

4. **Abilita il workflow** — è già pianificato alle 05:00 UTC ogni giorno
   (`workflow_dispatch` per lanciarlo anche a mano da Actions). Aggiorna
   `data/rischio.geojson` e fa commit automatico se cambia qualcosa.

5. **Apri `index.html`** — mostra i punti colorati per livello di rischio
   (verde/giallo/arancione/rosso), con selettore oggi/domani/dopodomani e
   popup col dettaglio al click su ogni punto.

## Attenzioni

- I valori sono a livello di comune/provincia, non di indirizzo puntuale
  (limite dei dati Worklimate stessi, non di questa pipeline).
- Se aggiungi molti punti, la prima geocodifica richiede tempo (pausa di
  ~1,2s tra un punto e l'altro per rispettare Nominatim): è normale,
  succede una volta sola.
- Licenza dati: Worklimate/CNR. Licenza geocoding: OpenStreetMap (ODbL),
  attribuzione già gestita dalla CLI.
