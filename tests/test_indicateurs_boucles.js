// Les calculs d'indicateurs de la page, RÉÉCRITS EN BOUCLES (07/10/2026), rendent les MÊMES
// valeurs que les anciens — au bit près, sur 3 000 bougies réelles.
//
// POURQUOI. Ichimoku, stochastique, Williams %R, CCI, MFI et AO prenaient leurs extrêmes et
// leurs sommes par Math.max(...v.slice(…)) / slice().reduce() / map() : deux tableaux alloués
// par bougie et par fenêtre (six pour Ichimoku). Mesuré sur 3 000 bougies (configuration
// lourde, mémo vidé à chaque queue de 5 s) : 24 ms par recalcul, 44 ms en dézoom, et 114 ms
// de ramasse-miettes pour 20 recalculs. La réécriture ne doit RIEN changer de ce qui
// s'affiche : une valeur ne change pas pour gagner du temps.
//
// CE QUI EST VÉRIFIÉ
//   1. chaque fonction réécrite, extraite de la source publiée (tests/sources.js), rend les
//      mêmes tableaux que l'ancienne version (figée ci-dessous telle qu'elle était le
//      07/10/2026) : mêmes longueurs, mêmes null aux mêmes places, mêmes nombres (Object.is) ;
//      sur la série réelle (tests/fixtures/bougies-btcusdt-15m.json), une série à paliers
//      plats (haut = bas, le cas « h − l || 1 ») et des séries plus courtes que la période ;
//   2. les corps réécrits n'allouent plus par fenêtre : ni spread, ni slice, ni reduce, ni map
//      (les dents : revenir à l'ancienne écriture fait échouer ce contrôle).
// Les durées (ancienne / nouvelle) sont affichées pour information, pas jugées : un chrono
// dépend de la machine.
//
// USAGE   node tests/test_indicateurs_boucles.js
const fs = require('fs'), path = require('path');
const { REPO, scriptsApp } = require('./sources');
const SRC = scriptsApp().map(s => s.texte).join('\n');

let ko = 0;
const check = (nom, ok, det) => { if (!ok) ko++; console.log(`  ${ok ? '✓' : '✗'} ${nom}${!ok && det !== undefined ? ' — ' + JSON.stringify(det).slice(0, 300) : ''}`); };
const titre = t => console.log(`\n── ${t} ──`);

// Une fonction de la page, accolades équilibrées (les calculs n'ont pas d'accolade dans une chaîne).
function corps(nom) {
  const i = SRC.indexOf('function ' + nom + '(');
  if (i < 0) throw new Error('fonction introuvable : ' + nom);
  let k = SRC.indexOf('{', i), n = 1; k++;
  while (n && k < SRC.length) { n += { '{': 1, '}': -1 }[SRC[k]] || 0; k++; }
  return SRC.slice(i, k);
}
const REECRITES = ['calcStoch', 'calcIchimoku', 'calcMFI', 'calcWilliamsR', 'calcCCI', 'calcAO'];
const AIDES = ['extremeGlissant', 'calcSMA', 'calcBollinger'];
const NOUVELLES = new Function(AIDES.concat(REECRITES).map(corps).join('\n') + '\nreturn {' + AIDES.concat(REECRITES).join(',') + '};')();

// ── Les anciennes versions, figées (js/app.js avant le 07/10/2026) ───────────
const ANCIENNES = (function () {
  function calcSMA(data, period) {
    const out = new Array(data.length).fill(null);
    for (let i = period - 1; i < data.length; i++) {
      let sum = 0;
      for (let j = i - period + 1; j <= i; j++) sum += data[j];
      out[i] = sum / period;
    }
    return out;
  }
  function calcBollinger(data, period, stdDev) {
    const sma = calcSMA(data, period);
    const upper = new Array(data.length).fill(null);
    const lower = new Array(data.length).fill(null);
    for (let i = period - 1; i < data.length; i++) {
      let sumSq = 0;
      for (let j = i - period + 1; j <= i; j++) sumSq += (data[j] - sma[i]) ** 2;
      const std = Math.sqrt(sumSq / period);
      upper[i] = sma[i] + stdDev * std;
      lower[i] = sma[i] - stdDev * std;
    }
    return { sma, upper, lower };
  }
  function calcStoch(highs, lows, closes, kPeriod, dPeriod) {
    const kOut = new Array(closes.length).fill(null);
    const dOut = new Array(closes.length).fill(null);
    for (let i = kPeriod - 1; i < closes.length; i++) {
      const h = Math.max(...highs.slice(i - kPeriod + 1, i + 1));
      const l = Math.min(...lows.slice(i - kPeriod + 1, i + 1));
      kOut[i] = ((closes[i] - l) / (h - l || 1)) * 100;
    }
    for (let i = kPeriod + dPeriod - 2; i < closes.length; i++) {
      let sum = 0, count = 0;
      for (let j = i - dPeriod + 1; j <= i; j++) {
        if (kOut[j] !== null) { sum += kOut[j]; count++; }
      }
      if (count > 0) dOut[i] = sum / count;
    }
    return { k: kOut, d: dOut };
  }
  function calcIchimoku(highs, lows, closes) {
    const tenkan = [], kijun = [], senkouA = [], senkouB = [], chikou = [];
    for (let i = 0; i < closes.length; i++) {
      if (i >= 8) {
        const h9 = Math.max(...highs.slice(i - 8, i + 1));
        const l9 = Math.min(...lows.slice(i - 8, i + 1));
        tenkan.push((h9 + l9) / 2);
      } else tenkan.push(null);
      if (i >= 25) {
        const h26 = Math.max(...highs.slice(i - 25, i + 1));
        const l26 = Math.min(...lows.slice(i - 25, i + 1));
        kijun.push((h26 + l26) / 2);
      } else kijun.push(null);
      senkouA.push(null); senkouB.push(null);
      if (i >= 25) {
        senkouA[i] = ((tenkan[i] || 0) + (kijun[i] || 0)) / 2;
      }
      if (i >= 51) {
        const h52 = Math.max(...highs.slice(i - 51, i + 1));
        const l52 = Math.min(...lows.slice(i - 51, i + 1));
        senkouB[i] = (h52 + l52) / 2;
      }
    }
    for (let i = 0; i < closes.length; i++) chikou.push(i + 25 < closes.length ? closes[i + 25] : null);
    const shiftedA = new Array(closes.length + 26).fill(null);
    const shiftedB = new Array(closes.length + 26).fill(null);
    for (let i = 0; i < senkouA.length; i++) {
      if (senkouA[i] !== null && i + 26 < shiftedA.length) shiftedA[i + 26] = senkouA[i];
      if (senkouB[i] !== null && i + 26 < shiftedB.length) shiftedB[i + 26] = senkouB[i];
    }
    return { tenkan, kijun, senkouA: shiftedA, senkouB: shiftedB, chikou };
  }
  function calcMFI(highs, lows, closes, volumes, period) {
    const tp = closes.map((c, i) => (highs[i] + lows[i] + c) / 3);
    const mf = tp.map((p, i) => p * volumes[i]);
    const out = new Array(closes.length).fill(null);
    for (let i = period; i < closes.length; i++) {
      let posFlow = 0, negFlow = 0;
      for (let j = i - period + 1; j <= i; j++) {
        if (tp[j] > tp[j - 1]) posFlow += mf[j];
        else if (tp[j] < tp[j - 1]) negFlow += mf[j];
      }
      out[i] = 100 - 100 / (1 + posFlow / (negFlow || 1));
    }
    return out;
  }
  function calcWilliamsR(highs, lows, closes, period) {
    const out = new Array(closes.length).fill(null);
    for (let i = period - 1; i < closes.length; i++) {
      const h = Math.max(...highs.slice(i - period + 1, i + 1));
      const l = Math.min(...lows.slice(i - period + 1, i + 1));
      out[i] = ((h - closes[i]) / (h - l || 1)) * -100;
    }
    return out;
  }
  function calcCCI(highs, lows, closes, period) {
    const tp = closes.map((c, i) => (highs[i] + lows[i] + c) / 3);
    const out = new Array(closes.length).fill(null);
    for (let i = period - 1; i < closes.length; i++) {
      const slice = tp.slice(i - period + 1, i + 1);
      const sma = slice.reduce((a, b) => a + b, 0) / period;
      const mad = slice.reduce((a, b) => a + Math.abs(b - sma), 0) / period;
      out[i] = (tp[i] - sma) / (0.015 * (mad || 1));
    }
    return out;
  }
  function calcAO(highs, lows, rapide, lente) {
    const mid = highs.map((h, i) => (h + lows[i]) / 2);
    const sma5 = calcSMA(mid, rapide);
    const sma34 = calcSMA(mid, lente);
    const out = new Array(mid.length).fill(null);
    for (let i = 0; i < mid.length; i++) {
      if (sma5[i] !== null && sma34[i] !== null) out[i] = sma5[i] - sma34[i];
    }
    return out;
  }
  return { calcSMA, calcBollinger, calcStoch, calcIchimoku, calcMFI, calcWilliamsR, calcCCI, calcAO };
})();

// ── Séries ────────────────────────────────────────────────────────────────────
const FX = JSON.parse(fs.readFileSync(path.join(REPO, 'tests', 'fixtures', 'bougies-btcusdt-15m.json'), 'utf8'));
const serie = rows => ({ H: rows.map(r => r[2]), L: rows.map(r => r[3]), C: rows.map(r => r[4]), V: rows.map(r => r[5]) });
const REELLE = serie(FX.bougies);
// Paliers plats : haut = bas = clôture sur des plages entières (division par « h − l || 1 »),
// et des égalités répétées dans les fenêtres (la file monotone garde le bon extrême).
const plates = FX.bougies.slice(0, 400).map((r, i) => (Math.floor(i / 30) % 3 === 0 ? [r[0], 86000, 86000, 86000, 86000, r[5]] : r));
const SERIES = { 'réelle (3 000 bougies 15 min BTCUSDT)': REELLE, 'paliers plats': serie(plates),
  'courte (10 bougies)': serie(FX.bougies.slice(0, 10)), 'une bougie': serie(FX.bougies.slice(0, 1)), 'vide': serie([]) };

const identiques = (a, b) => {
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return { i: 'longueur', a: a && a.length, b: b && b.length };
    for (let i = 0; i < a.length; i++) if (!Object.is(a[i], b[i])) return { i, a: a[i], b: b[i] };
    return null;
  }
  const ka = Object.keys(a).sort(), kb = Object.keys(b).sort();
  if (ka.join() !== kb.join()) return { cles: [ka, kb] };
  for (const k of ka) { const e = identiques(a[k], b[k]); if (e) return Object.assign({ cle: k }, e); }
  return null;
};

// Paramètres : ceux de la page (PARAM, lus dans la source) et d'autres périodes.
const PARAM = new Function(SRC.slice(SRC.indexOf('const PARAM = {'), SRC.indexOf('};', SRC.indexOf('const PARAM = {')) + 2) + '\nreturn PARAM;')();
const APPELS = {
  calcStoch: s => [[s.H, s.L, s.C, PARAM.stoch.k, PARAM.stoch.d], [s.H, s.L, s.C, 5, 3], [s.H, s.L, s.C, 1, 1], [s.H, s.L, s.C, 60, 5]],
  calcIchimoku: s => [[s.H, s.L, s.C]],
  calcMFI: s => [[s.H, s.L, s.C, s.V, PARAM.mfi.periode], [s.H, s.L, s.C, s.V, 3]],
  calcWilliamsR: s => [[s.H, s.L, s.C, PARAM.williamsR.periode], [s.H, s.L, s.C, 1], [s.H, s.L, s.C, 100]],
  calcCCI: s => [[s.H, s.L, s.C, PARAM.cci.periode], [s.H, s.L, s.C, 2], [s.H, s.L, s.C, 50]],
  calcAO: s => [[s.H, s.L, PARAM.ao.rapide, PARAM.ao.lente], [s.H, s.L, 3, 10]],
  calcSMA: s => [[s.C, 20], [s.C, 50], [s.C, 200]],
  calcBollinger: s => [[s.C, PARAM.bb.periode, PARAM.bb.ecarts], [s.C, 10, 1.5]],
};

titre('1. Mêmes valeurs qu’avant, au bit près');
for (const [nomS, s] of Object.entries(SERIES)) {
  const ecarts = [];
  let n = 0;
  for (const [f, args] of Object.entries(APPELS)) for (const a of args(s)) {
    n++;
    const e = identiques(ANCIENNES[f](...a), NOUVELLES[f](...a));
    if (e) ecarts.push(Object.assign({ f, periodes: a.filter(x => typeof x === 'number') }, e));
  }
  check(`série ${nomS} : ${n} appels, mêmes tableaux (Object.is, élément par élément)`, !ecarts.length, ecarts.slice(0, 3));
}

titre('2. Plus d’allocation par fenêtre dans les calculs réécrits');
for (const f of REECRITES.concat(['extremeGlissant'])) {
  const c = corps(f).replace(/\/\/.*$/gm, '');
  const motifs = [/\.\.\./, /\.slice\(/, /\.reduce\(/, /\.map\(/].filter(r => r.test(c)).map(String);
  check(`${f} : ni spread, ni slice, ni reduce, ni map`, !motifs.length, motifs);
}

// ── Pour information : durées, et pourquoi pas de somme glissante ─────────────
titre('Pour information (non jugé)');
const chrono = (fn, k = 15) => { const t = []; for (let i = 0; i < k; i++) { const a = process.hrtime.bigint(); fn(); t.push(Number(process.hrtime.bigint() - a) / 1e6); } t.sort((x, y) => x - y); return t[t.length >> 1]; };
const LOURD = (L) => () => { const s = REELLE;
  L.calcIchimoku(s.H, s.L, s.C); L.calcStoch(s.H, s.L, s.C, 14, 3); L.calcWilliamsR(s.H, s.L, s.C, 14);
  L.calcCCI(s.H, s.L, s.C, 20); L.calcMFI(s.H, s.L, s.C, s.V, 14); L.calcAO(s.H, s.L, 5, 34); };
console.log(`  ${REECRITES.length} calculs réécrits sur 3 000 bougies (médiane de 15) : avant ${chrono(LOURD(ANCIENNES)).toFixed(2)} ms, après ${chrono(LOURD(NOUVELLES)).toFixed(2)} ms`);
// Somme glissante (ajouter l'entrant, retirer le sortant) : plus rapide, mais pas les mêmes bits.
const glissante = (d, p) => { const o = new Array(d.length).fill(null); let s = 0; for (let i = 0; i < d.length; i++) { s += d[i]; if (i >= p) s -= d[i - p]; if (i >= p - 1) o[i] = s / p; } return o; };
const sma = ANCIENNES.calcSMA(REELLE.C, 20), gl = glissante(REELLE.C, 20);
let diff = 0, ecartMax = 0;
for (let i = 0; i < sma.length; i++) if (sma[i] !== null && !Object.is(sma[i], gl[i])) { diff++; ecartMax = Math.max(ecartMax, Math.abs(sma[i] - gl[i])); }
console.log(`  SMA 20 en somme glissante : ${diff} valeurs sur ${sma.length - 19} différentes de la somme refaite (écart max ${ecartMax.toExponential(1)} $) — écartée`);

console.log(ko ? `\n❌ INDICATEURS EN BOUCLES : ${ko} contrôle(s) en échec` : '\n✅ INDICATEURS EN BOUCLES : MÊMES VALEURS, SANS ALLOCATION PAR FENÊTRE');
process.exit(ko ? 1 : 0);
