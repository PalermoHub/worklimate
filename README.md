# Rischio da caldo — comuni di Sicilia

Pagina statica che mostra il livello di rischio da caldo per il lavoro all'aperto (basso / moderato / alto / emergenza) per tutti i **391 comuni siciliani**, per oggi, domani e dopodomani. Dato di rischio pubblico via [Worklimate](https://github.com/aborruso/worklimate), temperatura in tempo reale via [MeteoHub](https://meteohub.agenziaitaliameteo.it) (Agenzia ItaliaMeteo), aggiornato automaticamente ogni giorno.

👉 **Pagina live:** `index.html` (pubblicata come GitHub Pages).

## Cosa fa

- Tabella comune × giorno con il livello di rischio da caldo per fascia lavorativa 12–16.
- Ricerca/filtro per nome comune, ordinamento per comune o provincia.
- Tema chiaro/scuro con toggle (preferenza salvata in `localStorage`).
- Nessun backend: è un unico file HTML con dati incorporati, dati e viste generati staticamente.

## Come funziona

```
scripts/fetch-comuni.mjs        → genera data/comuni-sicilia.json (elenco comuni + centroide)
scripts/update-data.mjs         → interroga Worklimate e scrive data/rischio-oggi.json
scripts/update-temperatura.mjs  → interroga MeteoHub e scrive data/temperatura-oggi.json
.github/workflows/               → eseguono i due script sopra su cadenze diverse e fanno commit/push
```

Rischio e temperatura sono **due fonti indipendenti**, con cadenze diverse, che non si toccano tra loro: il rischio è una previsione (un valore al giorno, calcolato una volta), la temperatura è un'osservazione in tempo reale (cambia in continuo). `index.html` li legge entrambi via `fetch` e li unisce lato client per nome comune.

- **`data/comuni-sicilia.json`** — elenco statico dei comuni siciliani (nome, provincia, sigla, codice ISTAT, coordinate del centroide), ricavato dai confini amministrativi ISTAT ([openpolis/geojson-italy](https://github.com/openpolis/geojson-italy)). Va rigenerato **a mano** con `node scripts/fetch-comuni.mjs` solo in caso di fusioni/istituzioni di nuovi comuni — evento raro, non è nel workflow giornaliero.
- **`data/rischio-oggi.json`** — `{ generatedAt, generatedAtTimestamp, data: [[nome, sigla, rischio_oggi, rischio_domani, rischio_dopodomani], ...] }`, scritto da `scripts/update-data.mjs`.
- **`data/temperatura-oggi.json`** — `{ generatedAt, generatedAtTimestamp, data: [[nome, sigla, temperatura_C], ...] }`, scritto da `scripts/update-temperatura.mjs`. `temperatura_C` è `null` se nessuna stazione è entro 40km dal comune.

## Come vengono ricavati i dati

### Rischio da caldo (previsione, 1 run/giorno)

Arriva dagli endpoint pubblici dell'app [Worklimate](https://app.worklimate.it/ordinanza-caldo-lavoro) (nessuna autenticazione richiesta), interrogati da `scripts/update-data.mjs`:

1. **Stazione più vicina** — per ogni comune (nome + centroide lat/lon) si chiama `osm-stazioni.php?osmod=true&place=...&latx=...&lonx=...`, che restituisce l'id della cella griglia meteo (`pgrid`) più vicina.
2. **Rischio per cella** — le celle griglia sono deduplicate (molti comuni condividono la stessa cella) e per ognuna si chiama `osm-stazioni.php?pgrid=...&sys=regular`, che restituisce il livello di rischio (`g1`/`g2`/`g3` = oggi/domani/dopodomani).
3. **Join finale** — ogni comune eredita il rischio della sua cella griglia, producendo le righe `[nome, sigla, g1, g2, g3]`.
4. **Scrittura** — se i comuni con dato completo sono meno dell'80% del totale, lo script si ferma con errore senza scrivere (protezione contro API non disponibile/risposte parziali). Altrimenti scrive `data/rischio-oggi.json` e accoda a `data/storico-rischio.csv`.

Le chiamate sono throttled (100ms tra una richiesta e l'altra) e usano header realistici (`User-Agent`, `Referer`) per comportarsi come il client browser dell'app originale.

### Temperatura reale (osservazione, ogni 2h)

Arriva da [MeteoHub](https://meteohub.agenziaitaliameteo.it) (Agenzia ItaliaMeteo), rete osservativa `dpcn-sicilia`, parametro `B12101` (temperatura aria, Kelvin), interrogato da `scripts/update-temperatura.mjs`. La data usata nella query (`reftime`) è calcolata al momento del run (`new Date().toISOString()`), quindi cambia da sola giorno per giorno — non c'è nulla da aggiornare a mano.

Per ogni comune si prende la stazione più vicina (haversine, entro 40km) e se ne legge l'**ultima osservazione disponibile** (non un massimo giornaliero, per restare coerente con la cadenza infra-giornaliera). Se nessuna stazione è entro 40km, o l'endpoint non risponde, la temperatura resta `null` per quel comune. Ogni run accoda anche una riga per comune a `data/storico-temperatura.csv` (serie storica infra-giornaliera).

### Automazione

- [`update-sicilia-data.yml`](.github/workflows/update-sicilia-data.yml) esegue `scripts/update-data.mjs` ogni giorno alle **05:30 UTC (07:30 CEST)**, prima della fascia di rischio 12–16, e fa commit/push di `data/rischio-oggi.json` + `data/storico-rischio.csv` se cambiati.
- [`update-temperatura.yml`](.github/workflows/update-temperatura.yml) esegue `scripts/update-temperatura.mjs` **ogni 2 ore, tutto il giorno**, e fa commit/push di `data/temperatura-oggi.json` + `data/storico-temperatura.csv` se cambiati.

Entrambi sono anche lanciabili a mano da GitHub Actions (`workflow_dispatch`).

## Sviluppo locale

```bash
# rigenerare i dati di rischio (richiede rete, interroga Worklimate)
node scripts/update-data.mjs

# rigenerare la temperatura reale (richiede rete, interroga MeteoHub)
node scripts/update-temperatura.mjs

# rigenerare l'elenco comuni (solo se cambiano i confini amministrativi)
node scripts/fetch-comuni.mjs
```

Nessuna dipendenza da installare: gli script usano solo `fetch`/`fs` nativi di Node ≥ 18.

## Struttura repo

```
index.html                       pagina pubblicata (dati + UI)
data/comuni-sicilia.json         elenco comuni siciliani (statico)
data/rischio-oggi.json           output di scripts/update-data.mjs (1 run/giorno)
data/temperatura-oggi.json       output di scripts/update-temperatura.mjs (ogni 2h)
scripts/update-data.mjs          job giornaliero: rischio da Worklimate → data/rischio-oggi.json
scripts/update-temperatura.mjs   job ogni 2h: temperatura da MeteoHub → data/temperatura-oggi.json
scripts/fetch-comuni.mjs         job manuale: confini ISTAT → data/comuni-sicilia.json
.github/workflows/                automazione GitHub Actions
varianti/                         prototipi di design alternativi (non pubblicati)
```
