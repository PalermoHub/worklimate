# Rischio da caldo — comuni di Sicilia

Pagina statica che mostra il livello di rischio da caldo per il lavoro all'aperto (basso / moderato / alto / emergenza) per tutti i **391 comuni siciliani**, per oggi, domani e dopodomani. Dato pubblico via [Worklimate](https://github.com/aborruso/worklimate), aggiornato automaticamente ogni giorno.

👉 **Pagina live:**  [index.html](https://palermohub.github.io/worklimate/) (pubblicata come GitHub Pages).

## Cosa fa

- Tabella comune × giorno con il livello di rischio da caldo per fascia lavorativa 12–16.
- Ricerca/filtro per nome comune, ordinamento per comune o provincia.
- Tema chiaro/scuro con toggle (preferenza salvata in `localStorage`).
- Nessun backend: è un unico file HTML con dati incorporati, dati e viste generati staticamente.

## Come funziona 

```
scripts/fetch-comuni.mjs   → genera data/comuni-sicilia.json (elenco comuni + centroide)
scripts/update-data.mjs    → interroga Worklimate e scrive i dati dentro index.html
.github/workflows/         → esegue update-data.mjs ogni giorno e fa commit/push
```

- **`data/comuni-sicilia.json`** — elenco statico dei comuni siciliani (nome, provincia, sigla, codice ISTAT, coordinate del centroide), ricavato dai confini amministrativi ISTAT ([openpolis/geojson-italy](https://github.com/openpolis/geojson-italy)). Va rigenerato **a mano** con `node scripts/fetch-comuni.mjs` solo in caso di fusioni/istituzioni di nuovi comuni — evento raro, non è nel workflow giornaliero.
- **`index.html`** — contiene due marcatori che lo script aggiorna via regex, senza toccare il resto della pagina (HTML/CSS/JS):
  - `const GENERATED_AT = "YYYY-MM-DD"` — data della corsa che ha prodotto i dati (il giorno "oggi" della tabella).
  - `const DATA = [...]` — array `[nome, sigla_provincia, rischio_oggi, rischio_domani, rischio_dopodomani]` per ogni comune.

## Come vengono ricavati i dati

I dati arrivano dagli endpoint pubblici dell'app [Worklimate](https://app.worklimate.it/ordinanza-caldo-lavoro) (nessuna autenticazione richiesta), interrogati da `scripts/update-data.mjs`:

1. **Stazione più vicina** — per ogni comune (nome + centroide lat/lon) si chiama `osm-stazioni.php?osmod=true&place=...&latx=...&lonx=...`, che restituisce l'id della cella griglia meteo (`pgrid`) più vicina.
2. **Rischio per cella** — le celle griglia sono deduplicate (molti comuni condividono la stessa cella) e per ognuna si chiama `osm-stazioni.php?pgrid=...&sys=regular`, che restituisce il livello di rischio (`g1`/`g2`/`g3` = oggi/domani/dopodomani).
3. **Join finale** — ogni comune eredita il rischio della sua cella griglia, producendo le righe `[nome, sigla, g1, g2, g3]`.
4. **Scrittura** — se i comuni con dato completo sono meno dell'80% del totale, lo script si ferma con errore senza scrivere l'HTML (protezione contro API non disponibile/risposte parziali). Altrimenti sostituisce i marcatori `GENERATED_AT` e `DATA` in `index.html`.

Le chiamate sono throttled (100ms tra una richiesta e l'altra) e usano header realistici (`User-Agent`, `Referer`) per comportarsi come il client browser dell'app originale.

### Automazione

Il workflow [`update-sicilia-data.yml`](.github/workflows/update-sicilia-data.yml) esegue `scripts/update-data.mjs` ogni giorno alle **05:30 UTC (07:30 CEST)**, prima della fascia di rischio 12–16, e fa commit/push di `index.html` se i dati sono cambiati. È anche lanciabile a mano da GitHub Actions (`workflow_dispatch`).

## Sviluppo locale

```bash
# rigenerare i dati di rischio (richiede rete, interroga Worklimate)
node scripts/update-data.mjs

# rigenerare l'elenco comuni (solo se cambiano i confini amministrativi)
node scripts/fetch-comuni.mjs
```

Nessuna dipendenza da installare: gli script usano solo `fetch`/`fs` nativi di Node ≥ 18.

## Struttura repo

```
index.html                  pagina pubblicata (dati + UI)
data/comuni-sicilia.json     elenco comuni siciliani (statico)
scripts/update-data.mjs      job giornaliero: rischio da Worklimate → index.html
scripts/fetch-comuni.mjs     job manuale: confini ISTAT → data/comuni-sicilia.json
.github/workflows/           automazione GitHub Actions
varianti/                    prototipi di design alternativi (non pubblicati)
```
## Licenza
[CC BY 4.0 Attribuzione 4.0 Internazionale](https://creativecommons.org/licenses/by/4.0/deed.it)

