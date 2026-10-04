// Contrôles HORS LIGNE des indicateurs calculés DANS la page (index.html).
//
// Chaque fonction est extraite de la source publiée, puis comparée à une implémentation
// de référence écrite indépendamment, sur une série OHLC pseudo-aléatoire reproductible.
// Défauts constatés le 04/10/2026 qui ont motivé ce harnais :
//   · SAR : bornage dans la mauvaise direction après retournement — 221 points sur 1 000
//     DANS la bougie, 398 retournements au lieu de 76 ;
//   · ADX : moyenne simple des DX au lieu du lissage de Wilder — jusqu'à 12,8 pts d'écart.
const fs = require('fs'), path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function extraire(nom) {
  const i = SRC.indexOf('function ' + nom + '(');
  if (i < 0) throw new Error('fonction introuvable : ' + nom);
  const j = SRC.indexOf('\nfunction ', i + 10);
  return SRC.slice(i, j < 0 ? undefined : j);
}
const page = {};
for (const n of ['calcEMA', 'calcRSI', 'calcATR', 'calcSAR', 'calcADX', 'mergeTail']) {
  page[n] = new Function(extraire(n) + '\nreturn ' + n + ';')();
}

// Série reproductible (LCG) : marche aléatoire avec tendances, 1 500 bougies.
let seed = 42;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const H = [], L = [], C = [];
let p = 100000, drift = 0;
for (let i = 0; i < 1500; i++) {
  if (i % 120 === 0) drift = (rnd() - 0.5) * 120;
  const o = p, c = o + drift + (rnd() - 0.5) * 900;
  H.push(Math.max(o, c) + rnd() * 300); L.push(Math.min(o, c) - rnd() * 300); C.push(c);
  p = c;
}

// ── Références ──
function refSAR(H, L, C, step = 0.02, max = 0.2) {      // transcription de ta.sar (TradingView)
  const n = H.length, out = new Array(n).fill(null);
  let below = C[1] > C[0], ext = below ? H[1] : L[1], r = below ? L[0] : H[0], acc = step;
  for (let i = 1; i < n; i++) {
    let first = i === 1;
    r = r + acc * (ext - r);
    if (below) { if (r > L[i]) { first = true; below = false; r = Math.max(H[i], ext); ext = L[i]; acc = step; } }
    else if (r < H[i]) { first = true; below = true; r = Math.min(L[i], ext); ext = H[i]; acc = step; }
    if (!first) {
      if (below && H[i] > ext) { ext = H[i]; acc = Math.min(acc + step, max); }
      if (!below && L[i] < ext) { ext = L[i]; acc = Math.min(acc + step, max); }
    }
    r = below ? Math.min(r, L[i - 1], i > 1 ? L[i - 2] : L[i - 1]) : Math.max(r, H[i - 1], i > 1 ? H[i - 2] : H[i - 1]);
    out[i] = r;
  }
  return out;
}
function refADX(H, L, C, p) {                            // Wilder : TR/DM lissés, ADX = DX lissé
  const n = C.length, adx = new Array(n).fill(null);
  let tr = 0, pd = 0, nd = 0, a = null; const seedDx = [];
  for (let i = 1; i < n; i++) {
    const t = Math.max(H[i] - L[i], Math.abs(H[i] - C[i - 1]), Math.abs(L[i] - C[i - 1]));
    const u = H[i] - H[i - 1], d = L[i - 1] - L[i];
    const P = u > d && u > 0 ? u : 0, N = d > u && d > 0 ? d : 0;
    if (i <= p) { tr += t; pd += P; nd += N; if (i < p) continue; }
    else { tr += t - tr / p; pd += P - pd / p; nd += N - nd / p; }
    const pdi = 100 * pd / tr, ndi = 100 * nd / tr, dx = 100 * Math.abs(pdi - ndi) / ((pdi + ndi) || 1);
    if (a === null) { seedDx.push(dx); if (seedDx.length === p) { a = seedDx.reduce((x, y) => x + y) / p; adx[i] = a; } }
    else { a = (a * (p - 1) + dx) / p; adx[i] = a; }
  }
  return adx;
}
function refRSI(C, p) {                                  // Wilder, écrit en moyennes « ewm »
  let g = 0, l = 0;
  for (let i = 1; i <= p; i++) { const d = C[i] - C[i - 1]; g += Math.max(d, 0); l += Math.max(-d, 0); }
  g /= p; l /= p;
  for (let i = p + 1; i < C.length; i++) { const d = C[i] - C[i - 1]; g += (Math.max(d, 0) - g) / p; l += (Math.max(-d, 0) - l) / p; }
  return 100 - 100 / (1 + g / l);
}

const ecartMax = (a, b, from = 0) => {
  let m = 0;
  for (let i = from; i < a.length; i++) if (a[i] !== null && b[i] !== null) m = Math.max(m, Math.abs(a[i] - b[i]));
  return m;
};
const checks = [];
const check = (nom, ok, detail) => { checks.push(ok); console.log(`  ${ok ? '✓' : '✗'} ${nom}${!ok && detail !== undefined ? ' — ' + detail : ''}`); };

const sar = page.calcSAR(H, L, C), rs = refSAR(H, L, C);
let dedans = 0;
for (let i = 1; i < C.length; i++) if (sar[i] > L[i] && sar[i] < H[i]) dedans++;
check('SAR identique à ta.sar (TradingView)', ecartMax(sar, rs, 1) < 1e-6, ecartMax(sar, rs, 1));
check('SAR : aucun point DANS une bougie', dedans === 0, dedans + ' points');

const adx = page.calcADX(H, L, C, 14).adx, ra = refADX(H, L, C, 14);
check('ADX = lissage de Wilder', ecartMax(adx, ra) < 1e-9, ecartMax(adx, ra).toFixed(4) + ' pts');
check('ADX : première valeur à l\'indice 2·période − 1', adx[26] === null && adx[27] !== null);

const rsi = page.calcRSI(C, 14);
check('RSI page = Wilder', Math.abs(rsi[C.length - 1] - refRSI(C, 14)) < 1e-9);
const ema = page.calcEMA(C, 20);
check('EMA amorcée par la SMA des 20 premières', Math.abs(ema[19] - C.slice(0, 20).reduce((x, y) => x + y) / 20) < 1e-9);

// mergeTail : remplace la bougie en cours, ajoute la nouvelle, refuse un trou.
const mk = t => ({ time: t, open: 1, high: 1, low: 1, close: t, volume: 1 });
let arr = [mk(1), mk(2), mk(3)];
check('queue : bougie en cours remplacée', page.mergeTail(arr, [mk(2), { ...mk(3), close: 99 }]) && arr.length === 3 && arr[2].close === 99);
check('queue : nouvelle bougie ajoutée', page.mergeTail(arr, [mk(3), mk(4)]) && arr.length === 4 && arr[3].time === 4);
check('queue : trou détecté → rechargement complet', page.mergeTail(arr, [mk(6), mk(7)]) === false && arr.length === 4);

const ko = checks.filter(x => !x).length;
console.log(ko === 0 ? '\n✅ INDICATEURS DE LA PAGE : TOUS LES CONTRÔLES PASSENT' : `\n❌ ${ko} contrôle(s) en échec`);
process.exit(ko === 0 ? 0 : 1);
