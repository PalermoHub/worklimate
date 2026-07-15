
const LEVELS = ['Basso','Moderato','Alto','Emergenza'];
const LEVEL_CLASS = { 'Basso':'basso', 'Moderato':'moderato', 'Alto':'alto', 'Emergenza':'emergenza' };
const LEVEL_VAR = { 'Basso':'--good', 'Moderato':'--warning', 'Alto':'--serious', 'Emergenza':'--critical' };

// ---- tema: chiaro di default, switch manuale persistito ----
const THEME_KEY = 'sicilia-rischio-caldo-theme';
const themeToggle = document.getElementById('themeToggle');
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  themeToggle.textContent = theme === 'dark' ? '☀️ Chiaro' : '🌙 Scuro';
}
applyTheme(localStorage.getItem(THEME_KEY) || 'light');
themeToggle.addEventListener('click', () => {
  const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
  localStorage.setItem(THEME_KEY, next);
  applyTheme(next);
});

const root = document.querySelector('.viz-root');

// ---- date dinamiche a partire da GENERATED_AT (g1 = quel giorno) ----
function addDays(iso, n) {

  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d;
}
function fmtDDMM(d) {
  return String(d.getUTCDate()).padStart(2, '0') + '/' + String(d.getUTCMonth() + 1).padStart(2, '0');
}
function fmtLong(d) {
  return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
}
function fmtFreshness(ts) {
  const hours = Math.max(0, Math.floor((Date.now() - new Date(ts).getTime()) / 36e5));
  if (hours < 1) return 'aggiornato da poco';
  if (hours < 24) return `aggiornato ${hours}h fa`;
  return `aggiornato ${Math.floor(hours / 24)}g fa`;
}

async function main() {
  const [res, resComuni] = await Promise.all([
    fetch('data/rischio-oggi.json'),
    fetch('data/comuni-sicilia.json'),
  ]);
  const { generatedAt: GENERATED_AT, generatedAtTimestamp: GENERATED_TS, data: DATA } = await res.json();
  const comuniList = await resComuni.json();
  const rows = DATA.map(d => ({ nome: d[0], provincia: d[1], g1: d[2], g2: d[3], g3: d[4] }));

  const rowsByNome = new Map(rows.map(r => [r.nome, r]));
  const geoComuni = comuniList.filter(c => rowsByNome.has(c.nome));

  const D0 = addDays(GENERATED_AT, 0), D1 = addDays(GENERATED_AT, 1), D2 = addDays(GENERATED_AT, 2);

document.getElementById('pageTitle').textContent = `Rischio da stress da caldo — comuni di Sicilia`;
document.getElementById('pageSubtitle').textContent =
  `Dati Worklimate, ${fmtDDMM(D0)}–${fmtDDMM(D2)} ${D0.getUTCFullYear()} (fascia oraria 12–16). Un valore per comune al giorno, non una superficie continua.`;
document.getElementById('thG1').textContent = `Oggi (${fmtDDMM(D0)})`;
document.querySelector('.trend-th').textContent = `Andamento ${fmtDDMM(D1)} → ${fmtDDMM(D2)}`;
document.getElementById('updatedNote').textContent = `Aggiornato al ${fmtLong(D0)}.`;
if (GENERATED_TS) {
  document.getElementById('freshnessBadge').textContent = fmtFreshness(GENERATED_TS);
}

// ---- legend ----
const legendEl = document.getElementById('legend');
legendEl.innerHTML = LEVELS.map(l =>
  `<span class="item"><span class="swatch" style="background:var(${LEVEL_VAR[l]})"></span>${l}</span>`
).join('');

// ---- summary bars per day ----
const dayDefs = [
  { key: 'g1', label: `Oggi · ${fmtDDMM(D0)}` },
  { key: 'g2', label: `Domani · ${fmtDDMM(D1)}` },
  { key: 'g3', label: `Dopodomani · ${fmtDDMM(D2)}` },
];
const summaryEl = document.getElementById('summary');
summaryEl.innerHTML = dayDefs.map(d => {
  const counts = {};
  LEVELS.forEach(l => counts[l] = 0);
  rows.forEach(r => { if (counts[r[d.key]] !== undefined) counts[r[d.key]]++; });
  const max = Math.max(...LEVELS.map(l => counts[l]), 1);
  const bars = LEVELS.map(l => `
    <div class="bar-row">
      <span class="lbl"><span class="swatch" style="background:var(${LEVEL_VAR[l]})"></span>${l}</span>
      <div class="bar-track"><div class="bar-fill" style="width:${(counts[l]/max*100).toFixed(1)}%;background:var(${LEVEL_VAR[l]})"></div></div>
      <span class="bar-count">${counts[l]}</span>
    </div>`).join('');
  return `<div class="summary-day"><div class="daylabel">${d.label}</div>${bars}</div>`;
}).join('');

// ---- KPI: comuni in Alto/Emergenza oggi ----
function isRischioAlto(level) { return level === 'Alto' || level === 'Emergenza'; }

const totalRisk = rows.filter(r => isRischioAlto(r.g1)).length;
document.getElementById('kpiNumber').textContent = totalRisk;
document.getElementById('kpiSub').textContent = `su ${rows.length} · Alto/Emergenza oggi`;

// ---- controls ----
const provinces = [...new Set(rows.map(r => r.provincia))].sort();
const provSel = document.getElementById('provFilter');
provSel.innerHTML = '<option value="">Tutte le province</option>' +
  provinces.map(p => `<option value="${p}">${p}</option>`).join('');

const searchEl = document.getElementById('search');
const searchWrap = document.getElementById('searchWrap');
const searchClear = document.getElementById('searchClear');
const tbody = document.getElementById('tbody');
const countNote = document.getElementById('countNote');
const flatTableWrap = document.getElementById('flatTableWrap');
const groupedViewEl = document.getElementById('groupedView');
const groupCheckbox = document.getElementById('groupByProvince');
const emptyState = document.getElementById('emptyState');
const emptyStateReset = document.getElementById('emptyStateReset');

const activeFiltersEl = document.getElementById('activeFilters');
const LEVEL_ORDER = { 'Basso': 0, 'Moderato': 1, 'Alto': 2, 'Emergenza': 3 };
let sortKey = 'g1';
let sortDir = -1;
const activeLevels = new Set();

// ---- persistenza filtri (provincia, livelli, raggruppamento) ----
const FILTERS_KEY = 'sicilia-rischio-caldo-filtri';
function saveFilters() {
  localStorage.setItem(FILTERS_KEY, JSON.stringify({
    prov: provSel.value,
    levels: [...activeLevels],
    grouped: groupCheckbox.checked,
  }));
}
function loadFilters() {
  try {
    return JSON.parse(localStorage.getItem(FILTERS_KEY)) || {};
  } catch {
    return {};
  }
}

// ---- filtro per livello (chip cliccabili, multi-selezione) ----
const levelFilterEl = document.getElementById('levelFilter');
levelFilterEl.innerHTML = LEVELS.map(l =>
  `<button type="button" class="level-chip ${LEVEL_CLASS[l]}" data-level="${l}">${l}</button>`
).join('');
levelFilterEl.querySelectorAll('.level-chip').forEach(btn => {
  btn.addEventListener('click', () => {
    const level = btn.dataset.level;
    if (activeLevels.has(level)) activeLevels.delete(level); else activeLevels.add(level);
    btn.classList.toggle('active', activeLevels.has(level));
    render();
  });
});

function cellHtml(level) {
  const cls = LEVEL_CLASS[level] || '';
  return `<span class="cell ${cls}"><span class="dot"></span>${level}</span>`;
}

function trendHtml(r) {
  const days = [
    { level: r.g1, label: `Oggi ${fmtDDMM(D0)}` },
    { level: r.g2, label: `Domani ${fmtDDMM(D1)}` },
    { level: r.g3, label: `Dopodomani ${fmtDDMM(D2)}` },
  ];
  const dots = days.map(d =>
    `<span class="trend-dot" style="background:var(${LEVEL_VAR[d.level]})" title="${d.label}: ${d.level}"></span>`
  ).join('<span class="trend-line"></span>');
  return `<span class="trend">${dots}</span>`;
}

function rowHtml(r) {
  const isEmergenza = r.g1 === 'Emergenza';
  return `<tr data-nome="${r.nome}"${isEmergenza ? ' class="row-emergenza"' : ''}>
      <td>${r.nome} ${isEmergenza ? '<span class="emergenza-badge" title="Rischio massimo oggi">⚠ Emergenza</span> ' : ''}<button type="button" class="share-btn" data-nome="${r.nome}" title="Copia link a questo comune" aria-label="Copia link a questo comune">🔗</button></td>
      <td><span class="prov-badge">${r.provincia}</span></td>
      <td>${cellHtml(r.g1)}</td>
      <td>${trendHtml(r)}</td>
    </tr>`;
}

const thG1Label = document.getElementById('thG1').textContent;
const trendLabel = document.querySelector('.trend-th').textContent;
function theadRowHtml() {
  return `<tr>
      <th data-key="nome" class="${sortKey === 'nome' ? 'sorted' : ''}">Comune</th>
      <th data-key="provincia" class="${sortKey === 'provincia' ? 'sorted' : ''}">Prov.</th>
      <th data-key="g1" class="${sortKey === 'g1' ? 'sorted' : ''}">${thG1Label}</th>
      <th class="trend-th">${trendLabel}</th>
    </tr>`;
}

function renderGrouped(filtered) {
  const byProv = {};
  filtered.forEach(r => { (byProv[r.provincia] ??= []).push(r); });
  const groups = Object.keys(byProv).map(p => {
    const provRows = byProv[p];
    const riskCount = provRows.filter(r => isRischioAlto(r.g1)).length;
    return { prov: p, rows: provRows, riskCount };
  }).sort((a, b) => b.riskCount - a.riskCount || a.prov.localeCompare(b.prov));

  const PREVIEW_COUNT = 5;
  groupedViewEl.innerHTML = groups.map(g => {
    const hasMore = g.rows.length > PREVIEW_COUNT;
    const previewRows = g.rows.slice(0, PREVIEW_COUNT);
    return `
    <div class="prov-group collapsed">
      <button type="button" class="prov-group-header" aria-expanded="false">
        <span class="prov-badge">${g.prov}</span>
        <span class="prov-group-meta">${g.rows.length} comun${g.rows.length === 1 ? 'e' : 'i'} · ${g.riskCount} in Alto/Emergenza</span>
        <span class="chevron">▾</span>
      </button>
      <div class="prov-group-preview">
        <div class="table-wrap">
          <table>
            <thead>${theadRowHtml()}</thead>
            <tbody>${previewRows.map(rowHtml).join('')}</tbody>
          </table>
        </div>
        ${hasMore ? `<div class="prov-group-more">+${g.rows.length - PREVIEW_COUNT} altri comuni…</div>` : ''}
      </div>
      <div class="prov-group-body">
        <div class="table-wrap">
          <table>
            <thead>${theadRowHtml()}</thead>
            <tbody>${g.rows.map(rowHtml).join('')}</tbody>
          </table>
        </div>
      </div>
    </div>`;
  }).join('');

  groupedViewEl.querySelectorAll('.prov-group-header').forEach(btn => {
    btn.addEventListener('click', () => {
      const expanded = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!expanded));
      btn.closest('.prov-group').classList.toggle('collapsed', expanded);
    });
  });
}

function renderActiveFilters(prov) {
  const chips = [];
  if (prov) chips.push(`<button type="button" class="active-filter-chip" data-filter-type="prov"><span class="prov-badge">${prov}</span><span class="remove-x">×</span></button>`);
  [...activeLevels].forEach(l => {
    chips.push(`<button type="button" class="active-filter-chip" data-filter-type="level" data-filter-value="${l}"><span class="cell ${LEVEL_CLASS[l]}"><span class="dot"></span>${l}</span><span class="remove-x">×</span></button>`);
  });
  if (chips.length > 1) chips.push('<button type="button" class="active-filters-clear" data-filter-type="clear">Rimuovi tutti</button>');
  activeFiltersEl.innerHTML = chips.join('');
  activeFiltersEl.hidden = chips.length === 0;
}

activeFiltersEl.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const type = btn.dataset.filterType;
  if (type === 'prov') {
    provSel.value = '';
  } else if (type === 'level') {
    const level = btn.dataset.filterValue;
    activeLevels.delete(level);
    levelFilterEl.querySelector(`.level-chip[data-level="${level}"]`)?.classList.remove('active');
  } else if (type === 'clear') {
    provSel.value = '';
    activeLevels.clear();
    levelFilterEl.querySelectorAll('.level-chip.active').forEach(c => c.classList.remove('active'));
  }
  render();
});

function render() {
  const q = searchEl.value.trim().toLowerCase();
  const prov = provSel.value;
  renderActiveFilters(prov);
  let filtered = rows.filter(r =>
    (!q || r.nome.toLowerCase().includes(q)) &&
    (!prov || r.provincia === prov) &&
    (activeLevels.size === 0 || activeLevels.has(r.g1))
  );
  filtered.sort((a, b) => {
    const av = sortKey === 'g1' ? LEVEL_ORDER[a[sortKey]] : a[sortKey];
    const bv = sortKey === 'g1' ? LEVEL_ORDER[b[sortKey]] : b[sortKey];
    return av < bv ? -1 * sortDir : av > bv ? 1 * sortDir : 0;
  });
  countNote.textContent = `${filtered.length} di ${rows.length} comuni`;

  document.querySelectorAll('#flatThead th[data-key]').forEach(th => {
    th.classList.toggle('sorted', th.dataset.key === sortKey);
  });

  const isEmpty = filtered.length === 0;
  emptyState.hidden = !isEmpty;

  const grouped = groupCheckbox.checked;
  flatTableWrap.hidden = grouped || isEmpty;
  groupedViewEl.hidden = !grouped || isEmpty;

  if (!isEmpty) {
    const activeContainer = grouped ? groupedViewEl : flatTableWrap;
    fadeSwap(activeContainer, () => {
      if (grouped) {
        renderGrouped(filtered);
      } else {
        tbody.innerHTML = filtered.map(rowHtml).join('');
      }
    });
  }
  saveFilters();
}

function fadeSwap(el, updateFn) {
  el.classList.add('is-updating');
  requestAnimationFrame(() => {
    updateFn();
    requestAnimationFrame(() => el.classList.remove('is-updating'));
  });
}

searchEl.addEventListener('input', () => {
  searchWrap.classList.toggle('has-value', searchEl.value.length > 0);
  render();
});
searchClear.addEventListener('click', () => {
  searchEl.value = '';
  searchWrap.classList.remove('has-value');
  searchEl.focus();
  render();
});
emptyStateReset.addEventListener('click', () => {
  searchEl.value = '';
  searchWrap.classList.remove('has-value');
  provSel.value = '';
  activeLevels.clear();
  levelFilterEl.querySelectorAll('.level-chip.active').forEach(c => c.classList.remove('active'));
  render();
});
provSel.addEventListener('change', render);
groupCheckbox.addEventListener('change', render);
document.addEventListener('click', (e) => {
  const th = e.target.closest('th[data-key]');
  if (!th) return;
  const key = th.dataset.key;
  if (sortKey === key) sortDir *= -1; else { sortKey = key; sortDir = 1; }
  render();
});

// ---- "il mio comune": geolocalizzazione opt-in, scroll+evidenzia riga (no mappa) ----
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const myComuneCard = document.getElementById('myComuneCard');
function showMyComuneCard(r) {
  myComuneCard.innerHTML = `
    <div class="prov-group-body">
      <div class="table-wrap">
        <table>
          <thead>${theadRowHtml()}</thead>
          <tbody>${rowHtml(r)}</tbody>
        </table>
      </div>
    </div>`;
  myComuneCard.hidden = false;
}

function goToComune(nome) {
  searchEl.value = '';
  searchWrap.classList.remove('has-value');
  provSel.value = '';
  activeLevels.clear();
  levelFilterEl.querySelectorAll('.level-chip.active').forEach(c => c.classList.remove('active'));
  render();

  let target = null;
  if (groupCheckbox.checked) {
    const anyRow = groupedViewEl.querySelector(`tr[data-nome="${CSS.escape(nome)}"]`);
    const group = anyRow?.closest('.prov-group');
    if (group) {
      group.classList.remove('collapsed');
      group.querySelector('.prov-group-header')?.setAttribute('aria-expanded', 'true');
      target = group.querySelector(`.prov-group-body tr[data-nome="${CSS.escape(nome)}"]`);
    }
  } else {
    target = tbody.querySelector(`tr[data-nome="${CSS.escape(nome)}"]`);
  }
  if (!target) return;
  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  target.classList.add('row-highlight');
  setTimeout(() => target.classList.remove('row-highlight'), 2600);
}

// ---- condivisione: link con query string ?comune=NOME per stato singolo comune ----
function shareUrl(nome) {
  const url = new URL(location.href);
  url.search = '';
  if (nome) url.searchParams.set('comune', nome);
  return url.toString();
}

async function copyShareLink(nome, btn) {
  const url = shareUrl(nome);
  try {
    await navigator.clipboard.writeText(url);
    const original = btn.textContent;
    btn.textContent = '✓';
    btn.disabled = true;
    setTimeout(() => { btn.textContent = original; btn.disabled = false; }, 1400);
  } catch {
    window.prompt('Copia il link:', url);
  }
}

document.addEventListener('click', (e) => {
  const btn = e.target.closest('.share-btn');
  if (!btn) return;
  e.stopPropagation();
  copyShareLink(btn.dataset.nome, btn);
});

const locateBtn = document.getElementById('locateBtn');
const locateStatus = document.getElementById('locateStatus');
const GEO_ERROR_MSG = {
  1: 'Permesso di geolocalizzazione negato.',
  2: 'Posizione non disponibile.',
  3: 'Richiesta di posizione scaduta.',
};
locateBtn.addEventListener('click', () => {
  if (!('geolocation' in navigator)) {
    locateStatus.textContent = 'Geolocalizzazione non supportata da questo browser.';
    return;
  }
  locateBtn.disabled = true;
  locateStatus.textContent = 'Localizzazione in corso…';
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      locateBtn.disabled = false;
      const { latitude, longitude } = pos.coords;
      let nearest = null, minDist = Infinity;
      geoComuni.forEach(c => {
        const d = haversineKm(latitude, longitude, c.lat, c.lon);
        if (d < minDist) { minDist = d; nearest = c; }
      });
      if (!nearest) {
        locateStatus.textContent = 'Nessun comune trovato.';
        return;
      }
      locateStatus.textContent = `Comune più vicino: ${nearest.nome} (~${minDist.toFixed(0)} km)`;
      const r = rowsByNome.get(nearest.nome);
      if (r) showMyComuneCard(r);
    },
    (err) => {
      locateBtn.disabled = false;
      locateStatus.textContent = GEO_ERROR_MSG[err.code] || 'Errore nella geolocalizzazione.';
    },
    { timeout: 10000 }
  );
});

// ---- applica filtri salvati (provincia, livelli, raggruppamento) ----
const savedFilters = loadFilters();
if (savedFilters.prov && provinces.includes(savedFilters.prov)) provSel.value = savedFilters.prov;
(savedFilters.levels || []).forEach(l => {
  if (!LEVELS.includes(l)) return;
  activeLevels.add(l);
  levelFilterEl.querySelector(`.level-chip[data-level="${l}"]`)?.classList.add('active');
});
if (typeof savedFilters.grouped === 'boolean') groupCheckbox.checked = savedFilters.grouped;

// ---- deep link: preseleziona provincia/comune da query string (sovrascrive filtri salvati) ----
const params = new URLSearchParams(location.search);
const initProv = params.get('provincia');
const initComune = params.get('comune');
if (initProv && provinces.includes(initProv)) provSel.value = initProv;
render();
if (initComune && rowsByNome.has(initComune)) goToComune(initComune);
}

main().catch((e) => {
  console.error(e);
  root.insertAdjacentHTML('afterbegin', '<p style="color:var(--serious)">Errore nel caricamento dei dati.</p>');
});

// ---- disclaimer metodologia: stesso meccanismo apri/chiudi dei gruppi provincia ----
document.querySelectorAll('.methodology-disclaimer .methodology-header').forEach(btn => {
  btn.addEventListener('click', () => {
    const expanded = btn.getAttribute('aria-expanded') === 'true';
    btn.setAttribute('aria-expanded', String(!expanded));
    btn.closest('.methodology-disclaimer').classList.toggle('collapsed', expanded);
  });
});

// ---- link "Normativa vigente" -> apri e scorri al disclaimer ----
document.getElementById('lawDisclaimerLink')?.addEventListener('click', (e) => {
  e.preventDefault();
  const disclaimer = document.getElementById('methodologyDisclaimer');
  if (!disclaimer) return;
  disclaimer.classList.remove('collapsed');
  disclaimer.querySelector('.methodology-header')?.setAttribute('aria-expanded', 'true');
  disclaimer.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

// ---- torna in cima ----
const backToTop = document.getElementById('backToTop');
window.addEventListener('scroll', () => {
  backToTop.classList.toggle('visible', window.scrollY > 400);
});
backToTop.addEventListener('click', () => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

// ---- indicatore scroll orizzontale tabella (ombra ai bordi quando il contenuto eccede) ----
function updateTableScrollShadow(el) {
  const canScroll = el.scrollWidth > el.clientWidth + 1;
  el.classList.toggle('can-scroll-left', canScroll && el.scrollLeft > 1);
  el.classList.toggle('can-scroll-right', canScroll && el.scrollLeft < el.scrollWidth - el.clientWidth - 1);
}
function updateAllTableScrollShadows() {
  document.querySelectorAll('.table-wrap').forEach(updateTableScrollShadow);
}
document.addEventListener('scroll', (e) => {
  if (e.target.classList && e.target.classList.contains('table-wrap')) {
    updateTableScrollShadow(e.target);
  }
}, true);
window.addEventListener('resize', updateAllTableScrollShadows);
new MutationObserver(updateAllTableScrollShadows).observe(document.body, { childList: true, subtree: true });
updateAllTableScrollShadows();


