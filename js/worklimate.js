
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

async function main() {
  const res = await fetch('data/rischio-oggi.json');
  const { generatedAt: GENERATED_AT, data: DATA } = await res.json();
  const rows = DATA.map(d => ({ nome: d[0], provincia: d[1], g1: d[2], g2: d[3], g3: d[4] }));

  const D0 = addDays(GENERATED_AT, 0), D1 = addDays(GENERATED_AT, 1), D2 = addDays(GENERATED_AT, 2);

document.getElementById('pageTitle').textContent = `Rischio da stress da caldo — comuni di Sicilia`;
document.getElementById('pageSubtitle').textContent =
  `Dati Worklimate, ${fmtDDMM(D0)}–${fmtDDMM(D2)} ${D0.getUTCFullYear()} (fascia oraria 12–16). Un valore per comune al giorno, non una superficie continua.`;
document.getElementById('thG1').textContent = `Oggi (${fmtDDMM(D0)})`;
document.querySelector('.trend-th').textContent = `Andamento ${fmtDDMM(D1)} → ${fmtDDMM(D2)}`;
document.getElementById('updatedNote').textContent = `Aggiornato al ${fmtLong(D0)}.`;

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

let sortKey = 'nome';
let sortDir = 1;

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

function render() {
  const q = searchEl.value.trim().toLowerCase();
  const prov = provSel.value;
  let filtered = rows.filter(r =>
    (!q || r.nome.toLowerCase().includes(q)) &&
    (!prov || r.provincia === prov)
  );
  filtered.sort((a, b) => {
    const av = a[sortKey], bv = b[sortKey];
    return av < bv ? -1 * sortDir : av > bv ? 1 * sortDir : 0;
  });
  countNote.textContent = `${filtered.length} di ${rows.length} comuni`;
  tbody.innerHTML = filtered.map(r => `
    <tr>
      <td>${r.nome}</td>
      <td><span class="prov-badge">${r.provincia}</span></td>
      <td>${cellHtml(r.g1)}</td>
      <td>${trendHtml(r)}</td>
    </tr>`).join('');
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
provSel.addEventListener('change', render);
document.querySelectorAll('thead th[data-key]').forEach(th => {
  th.addEventListener('click', () => {
    const key = th.dataset.key;
    if (sortKey === key) sortDir *= -1; else { sortKey = key; sortDir = 1; }
    document.querySelectorAll('thead th').forEach(t => t.classList.remove('sorted'));
    th.classList.add('sorted');
    render();
  });
});
document.querySelector(`thead th[data-key="${sortKey}"]`).classList.add('sorted');

render();
}

main().catch((e) => {
  console.error(e);
  root.insertAdjacentHTML('afterbegin', '<p style="color:var(--serious)">Errore nel caricamento dei dati.</p>');
});

// ---- torna in cima ----
const backToTop = document.getElementById('backToTop');
window.addEventListener('scroll', () => {
  backToTop.classList.toggle('visible', window.scrollY > 400);
});
backToTop.addEventListener('click', () => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
});


