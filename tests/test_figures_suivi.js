// Le SUIVI des figures, clôture après clôture (revue des figures, octobre 2026) : ce que le lecteur
// voit naître, vivre et tomber doit être ce que la machine applique.
// CE QUI EST VÉRIFIÉ
//   1. Naissance : une figure née déjà confirmée (ou déjà finie) vient d'une ébauche suivie avant
//      (aucune sortie « confirmée » qui apparaîtrait d'un coup, sans avoir été montrée en cours).
//   2. Doublons : jamais deux figures à deux droites (même groupe) vivantes en même temps sur la
//      moitié au moins des mêmes points, ou sur le même début.
//   3. Entrée en V : la 1re droite d'en face commence tôt (decalage) — sinon la figure commence plus
//      tard, sans tracer ses droites à travers la jambe d'entrée.
//   4. Ébauche : son abandon se juge sur le plus haut / le plus bas de la bougie (pas la clôture) ;
//      le calque dit « remise » dès que la mèche passe, et le dit encore si le prix revient ; la bulle
//      Débutant dit qu'elle sera annulée « même si le prix redescend ».
//   5. Invalidation en 2 clôtures (sortie contraire d'un drapeau) : le calque le dit (« 2 … de suite »,
//      « ce sera la 1re »), au lieu d'annoncer une invalidation à la prochaine clôture.
//   6. Heures : sur 4 h et 1 j, une fin d'un autre jour porte sa date (Débutant « le 7 à … », « hier à
//      … » ; Expert jj/mm) ; les heures du jour restent courtes ; le journal 1 j ne montre pas « 00:00 ».
//   7. « Récemment tombées » : bornées dans le temps (horizon).
//   8. Débutant : on ne barre (✗) que la figure dessinée à la clôture d'avant son issue (mémoire de
//      page) ; une figure jamais dessinée ne revient pas barrée ; la figure dessinée garde sa place.
//   9. Libellés Débutant vivants : tous gardent le nom de la figure, ≤ PARAM.guide.debutant.forme,
//      sans mot banni.
//  10. PAGE (Chromium) : clôture après clôture dans une même page, la figure dessinée qui tombe est
//      barrée à l'image suivante, aucune ✗ pour une figure jamais dessinée, un libellé à chaque
//      figure dessinée ; Expert : chaque figure montrée a son nom posé.
//  11. PAGE : revenir sur un intervalle déjà vu REPREND le rejeu (pas de rejeu complet) ; le rejeu à
//      froid (1er appel dans un processus neuf) est mesuré et affiché.
// USAGE   node tests/test_figures_suivi.js
const fs = require('fs'), path = require('path'), vm = require('vm'), http = require('http'), { execFileSync } = require('child_process');
const REPO = path.resolve(__dirname, '..');
const G = require(path.join(REPO, 'js/guide.js'));
const { chargerPage } = require('./bac');

let ko = 0;
const check = (nom, ok, det) => { if (!ok) ko++; console.log(`  ${ok ? '✓' : '✗'} ${nom}${!ok && det !== undefined ? ' — ' + JSON.stringify(det).slice(0, 600) : ''}`); };
const titre = t => console.log(`\n── ${t} ──`);
const P = vm.runInContext('PARAM.guide', chargerPage().sandbox);
const DEB = P.debutant;

function atrDe(H, L, C, n) {
  const tr = [null];
  for (let i = 1; i < C.length; i++) tr.push(Math.max(H[i] - L[i], Math.abs(H[i] - C[i - 1]), Math.abs(L[i] - C[i - 1])));
  const a = new Array(C.length).fill(null);
  let s = 0; for (let i = 1; i <= n; i++) s += tr[i];
  a[n] = s / n;
  for (let i = n + 1; i < C.length; i++) a[i] = (a[i - 1] * (n - 1) + tr[i]) / n;
  return a;
}
const lire = itv => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'bougies-btcusdt-' + itv + '.json'), 'utf8')).bougies;
const SERIES = {};
for (const itv of ['15m', '1m']) {
  const b = lire(itv), H = b.map(k => +k[2]), L = b.map(k => +k[3]), C = b.map(k => +k[4]), T = b.map(k => Math.round(k[0] / 1000));
  const S = { h: H, l: L, c: C, atr: atrDe(H, L, C, P.atrPeriode), n: C.length - 1 };
  SERIES[itv] = { b, H, L, C, T, S, R: G.detecter(S, P) };
}
const idsDe = f => (f.pivotsH || []).map(x => 'h' + x.i).concat((f.pivotsB || []).map(x => 'b' + x.i));
const groupe = f => (f.type === 'range' ? 'range' : G.famille(f));

// ── 1. Naissance ──
titre('1. Une figure née déjà confirmée (ou finie) vient d’une ébauche suivie avant');
for (const itv of ['15m', '1m']) {
  const R = SERIES[itv].R;
  // (Un double absorbé par un triple à sa naissance, « devenu_triple », n'est jamais montré.)
  const nees = R.formes.filter(f => !f.doublon && f.fin !== 'devenu_triple' && ((f.jConf !== null && f.jConf !== undefined && f.jConf <= f.t) || (f.fin && f.jFin <= f.t)));
  const sans = nees.filter(f => !(f.depuisEbauche && f.t0Ebauche < f.t));
  check(`${itv} : ${nees.length} figure(s) née(s) confirmée(s) ou finie(s), toutes venues d’une ébauche vue avant`, !sans.length, sans.slice(0, 3).map(f => ({ type: f.type, t: f.t, jConf: f.jConf, fin: f.fin })));
}

// ── 2. Doublons ──
titre('2. Pas deux figures à deux droites vivantes sur les mêmes points');
for (const itv of ['15m', '1m']) {
  const R = SERIES[itv].R, L = R.formes.filter(f => !f.doublon && G.famille(f) === 'lignes'), paires = [];
  for (let a = 0; a < L.length; a++) for (let b = a + 1; b < L.length; b++) {
    const f = L[a], g = L[b];
    if (groupe(f) !== groupe(g)) continue;
    const [x, y] = f.t <= g.t ? [f, g] : [g, f];
    if (x.fin && x.jFin < y.t) continue;                    // l'une était déjà tombée quand l'autre est née
    const m = idsDe(x), s = idsDe(y), c = s.filter(k => m.includes(k)).length;
    if (x.debut === y.debut || (c >= 2 && 2 * c >= Math.min(m.length, s.length))) paires.push([x.type + '@' + x.t, y.type + '@' + y.t]);
  }
  check(`${itv} : ${L.length} figures à deux droites, aucune paire vivante sur les mêmes points`, !paires.length, paires.slice(0, 4));
}

// ── 3. Entrée en V ──
titre('3. Entrée en V : la droite d’en face commence tôt');
{
  // Deux droites qui se resserrent (110 → et 90 →), creux dès la bougie 20, sommets à partir de 42
  // seulement : de 20 à 42, le prix ne fait que traverser la bande.
  const u = i => 110 - 0.1 * (i - 20), d = i => 90 + 0.1 * (i - 20), t = 80;
  const fab = (creux, sommets) => {
    const pts = [[0, 104], [10, 112]].concat(creux.map(i => [i, d(i)]), sommets.map(i => [i, u(i)])).sort((a, b) => a[0] - b[0]);
    pts.push([t, (u(t) + d(t)) / 2]);
    const C = [];
    for (let k = 0; k < pts.length - 1; k++) { const [a, pa] = pts[k], [b, pb] = pts[k + 1]; for (let i = a; i < b; i++) C.push(pa + (pb - pa) * (i - a) / (b - a)); }
    C.push(pts[pts.length - 1][1]);
    const H = C.map(c => c + 0.3), L = C.map(c => c - 0.3);
    return { H, L, C, hauts: sommets.map(i => ({ i, p: H[i] })), bas: creux.map(i => ({ i, p: L[i] })) };
  };
  const sans = JSON.parse(JSON.stringify(P)); sans.lignes.decalage = Infinity; sans.lignes.remplissage = 0;
  const v = fab([20, 35, 50, 65], [42, 57, 72]), r = G.deuxDroites(v.hauts, v.bas, v.H, v.L, v.C, t, 2, P), r0 = G.deuxDroites(v.hauts, v.bas, v.H, v.L, v.C, t, 2, sans);
  check('sans la règle, la figure commencerait au 1er creux (20), à travers la jambe d’entrée', r0 && r0.debut === 20, r0 && { type: r0.type, debut: r0.debut });
  check(`avec decalage = ${P.lignes.decalage} : elle commence là où les deux droites ont leurs points (${r ? r.debut : '—'})`, r && r.debut > 20 && r.debut >= 42 - P.lignes.decalage * (t - r.debut), r && { type: r.type, debut: r.debut });
  const ok = fab([20, 35, 50, 65], [30, 45, 60, 75]), r2 = G.deuxDroites(ok.hauts, ok.bas, ok.H, ok.L, ok.C, t, 2, P);
  check('une figure dont les deux droites commencent ensemble est gardée entière', r2 && r2.debut === 20, r2 && { type: r2.type, debut: r2.debut });
}

// ── 4 et 5. Le calque d'une ébauche et d'un drapeau ──
const { b: B15, H, L, C, T, S } = SERIES['15m'];
const ctxA = (j, pas, maintenant) => ({ n: j, j, intervalle: '15m', temps: T, pas: pas || 900, maintenant: maintenant != null ? maintenant : (T[j] + 900 * 0.6) * 1000, horizon: P.horizon });
const prefixe = j => G.detecter(Object.assign({}, S, { n: j }), P);
titre('4. Ébauche : abandon jugé sur la mèche, dit dès qu’elle passe et encore si le prix revient');
{
  let cas = null;
  for (let j = 2200; j < 2990 && !cas; j += 7) {
    const R = prefixe(j), e = (R.ebauches.liste || []).find(x => !x.fin && Number.isFinite(x.abandonP) && G.famille(x) === 'extremes');
    if (e) cas = { j, e };
  }
  check('une ébauche vivante (double ou triple) trouvée sur la fixture 15 min', !!cas);
  if (cas) {
    const { j, e } = cas, s = e.s, eps = Math.max(1, Math.abs(e.abandonP) * 1e-4), Sx = { h: H, l: L, c: C };
    const dedans = e.abandonP - s * 4 * eps;
    const curPasse = { high: s > 0 ? e.abandonP + eps : Math.max(dedans, e.abandonP), low: s > 0 ? Math.min(dedans, e.abandonP) : e.abandonP - eps };
    const vP = G.figureVivante(e, Sx, j, curPasse, dedans, P);
    const vN = G.figureVivante(e, Sx, j, { high: s > 0 ? e.abandonP - eps : dedans, low: s > 0 ? dedans : e.abandonP + eps }, dedans, P);
    check(`mèche ${s > 0 ? 'au-dessus' : 'sous'} du niveau d’abandon (${G.prix(e.abandonP, '$')}), prix revenu : « remise » (calque et libellé)`, vP.cle === 'remise' && vP.etiq === 'remise', { cle: vP.cle, etiq: vP.etiq });
    check('mèche juste en deçà du niveau : pas de « remise »', vN.cle !== 'remise' && vN.etiq !== 'remise', { cle: vN.cle, etiq: vN.etiq });
    const tD = G.texteVivantFigure(e, vP, Object.assign(ctxA(j), { live: dedans }), 'debutant', '$'), tE = G.texteVivantFigure(e, vP, Object.assign(ctxA(j), { live: dedans }), 'expert', '$');
    check('bulle Débutant : « sera annulée, même si le prix redescend (remonte) », sans mot banni', /sera annulée, même si le prix (redescend|remonte)/.test(tD) && !G.motsBannis(tD).length, tD);
    check('Expert : « annulée à la clôture … même si le prix revient »', /annulée à la clôture .* même si le prix revient/.test(tE), tE);
    const lib = G.libelleVivantDebutant(e, vP, DEB.forme);
    check(`libellé Débutant « ${lib} » : garde le nom, ≤ ${DEB.forme} caractères`, lib && lib.startsWith(G.NOM_FORME_DEBUTANT[e.type]) && lib.length <= DEB.forme, lib);
  }
}
titre('5. Drapeau : l’invalidation en 2 clôtures est dite comme telle');
{
  let cas = null;
  for (let j = 400; j < 2990 && !cas; j += 5) {
    const R = prefixe(j), f = R.formes.find(x => !x.fin && G.famille(x) === 'drapeau' && G.niveauxFigure(x, j, P).invals.some(iv => iv.clotures === 2) && !(x.contre > 0));
    if (f) cas = { j, f };
  }
  check('un drapeau vivant avec une invalidation en 2 clôtures trouvé sur la fixture 15 min', !!cas);
  if (cas) {
    const { j, f } = cas, iv = G.niveauxFigure(f, j, P).invals.find(x => x.clotures === 2), au = iv.p + iv.s * Math.max(1, Math.abs(iv.p) * 2e-4);
    const v = G.figureVivante(f, { h: H, l: L, c: C }, j, { high: Math.max(au, C[j - 1]), low: Math.min(au, C[j - 1]) }, au, P);
    const tD = G.texteVivantFigure(f, v, ctxA(j), 'debutant', '$'), tE = G.texteVivantFigure(f, v, ctxA(j), 'expert', '$');
    check('le calque lit « menace » avec 2 clôtures nécessaires', v.cle === 'menace' && v.clotures === 2, { cle: v.cle, clotures: v.clotures });
    check('Débutant : « Il faut 2 … de suite … ce sera la 1re »', /Il faut 2 .* de suite .* ce sera la 1re/.test(tD) && !/Cela ne compte que si/.test(tD), tD);
    check('Expert : « 2 clôtures de suite nécessaires (ce serait la 1re) »', /2 clôtures de suite nécessaires \(ce serait la 1re\)/.test(tE), tE);
  }
}

// ── 6. Heures ──
titre('6. Heures : la date quand l’instant n’est pas aujourd’hui');
{
  const R = SERIES['15m'].R, f = R.formes.find(x => (x.fin === 'invalide' || x.fin === 'invalide_avant') && x.jFin > 100);
  // La même figure lue comme si les bougies duraient 4 h et 1 j : temps 0 = la 1re bougie.
  const t0 = 1759276800;   // 01/10/2025 00:00 UTC
  for (const [pas, nomItv] of [[14400, '4h'], [86400, '1d']]) {
    const temps = T.map((_, i) => t0 + i * pas), fin = (temps[f.jFin] + pas) * 1000;
    const ctx = { n: f.jFin + 30, j: f.jFin + 30, intervalle: nomItv, temps, pas, horizon: P.horizon, maintenant: fin + 5 * 86400000 };
    const d = G.marqueFin(f, ctx, 'debutant', '$'), e = G.marqueFin(f, ctx, 'expert', '$'), jr = new Date(fin).toISOString();
    const jour = String(+G.quandParis(fin, ctx.maintenant).replace(/^le (\d+).*$/, '$1'));
    check(`${nomItv}, 5 jours après : Débutant « Invalidé le ${jour} à … (heure de Paris) »`, /^Invalidé le \d+ à \d\dh\d\d \(heure de Paris\)/.test(d), d.slice(0, 80));
    check(`${nomItv}, 5 jours après : Expert porte la date ${jr.slice(8, 10)}/${jr.slice(5, 7)}`, e.includes(jr.slice(8, 10) + '/' + jr.slice(5, 7)), e.slice(0, 80));
    const hier = G.marqueFin(f, Object.assign({}, ctx, { maintenant: fin + 86400000 }), 'debutant', '$');
    check(`${nomItv}, le lendemain : « hier à … » ou la date`, /^Invalidé (hier à|le \d+ à) \d\dh\d\d/.test(hier), hier.slice(0, 60));
    if (pas === 86400) {
      const ex = G.texteFormeExpert(f, R.bilan[f.type], ctx, P, '$');
      const tx = Array.isArray(ex) ? ex.join(' ') : String(ex);
      check('1 j : le journal Expert ne montre pas « 00:00 » pour chaque évènement', !/\b00:00\b/.test(tx), tx.slice(0, 300));
    }
  }
  const ctxJour = { n: f.jFin + 2, j: f.jFin + 2, intervalle: '15m', temps: T, pas: 900, horizon: P.horizon, maintenant: (T[f.jFin] + 1800) * 1000 };
  const court = G.marqueFin(f, ctxJour, 'debutant', '$');
  check('15 min, une demi-heure après : « Invalidé à HHhMM » sans date', /^Invalidé à \d\dh\d\d \(heure de Paris\)/.test(court), court.slice(0, 60));
}

// ── 7. Récemment tombées ──
titre('7. « Récemment tombées » : bornées dans le temps');
{
  let ok = true, vu = 0;
  for (let n = 600; n <= S.n; n += 197) {
    const Rn = prefixe(n);
    for (const f of G.tombees(Rn, 3, P.horizon)) { vu++; if (!(f.jFin <= n - 1 && n - 1 - f.jFin <= P.horizon)) ok = false; }
  }
  check(`${vu} figure(s) citée(s) : toutes tombées depuis au plus ${P.horizon} bougies`, ok && vu > 0, vu);
}

// ── 8. Débutant : la mémoire de ce qui a été dessiné ──
titre('8. Débutant : on ne barre que ce qui a été dessiné');
{
  const R = SERIES['15m'].R, VUE = 50;
  let cas = null;
  for (const f of R.formes.filter(x => (x.fin === 'invalide' || x.fin === 'invalide_avant') && x.jFin > 400)) {
    const j = f.jFin, Rn = Object.assign({}, R, { n: j + 1 });
    const id = G.idFigure(f), L0 = G.formesDebutant(Rn, P, j + 2 - VUE, j + 2, { parJ: new Map(), dernier: null });
    const memo = { parJ: new Map([[j - 1, id]]), dernier: id }, L1 = G.formesDebutant(Rn, P, j + 2 - VUE, j + 2, memo);
    if (L1.length && L1[0] === f) { cas = { f, L0, L1 }; break; }
  }
  check('une figure dessinée à la clôture d’avant son invalidation reste la 1re, barrée', !!cas);
  if (cas) check('… sans mémoire (page ouverte après coup), elle n’apparaît pas barrée', !cas.L0.includes(cas.f), cas.L0.slice(0, 3).map(G.idFigure));
  // Une figure vivante déjà dessinée garde sa place devant une autre de même rang.
  let garde = null;
  for (let j = 600; j < R.n - 1 && !garde; j += 11) {
    const Rn = Object.assign({}, R, { n: j + 1 }), L = G.formesDebutant(Rn, P, j + 2 - VUE, j + 2, {});
    const vivantes = L.filter(f => !f.fin || f.jFin > j);
    if (vivantes.length >= 2 && G.rangFigure(vivantes[1], j) === G.rangFigure(vivantes[0], j)) {
      const id = G.idFigure(vivantes[1]), L2 = G.formesDebutant(Rn, P, j + 2 - VUE, j + 2, { parJ: new Map([[j - 1, id]]), dernier: id });
      garde = { ok: L2[0] === vivantes[1], j };
    }
  }
  check('une figure vivante déjà dessinée garde sa place devant une autre de même rang', garde && garde.ok, garde);
}

// ── 9. Libellés vivants ──
titre('9. Libellés Débutant : le nom de la figure gardé, ≤ ' + DEB.forme + ' caractères, sans mot banni');
{
  const R = SERIES['15m'].R, mauvais = [];
  let n = 0;
  for (const f of R.formes.concat(R.ebauches.liste)) {
    for (const t of G.libellesPossiblesDebutant(f, DEB.forme)) {
      n++;
      if (!(t.length <= DEB.forme && !G.motsBannis(t).length && t.includes(G.NOM_FORME_DEBUTANT[f.type]))) mauvais.push(f.type + ' : ' + t);
    }
  }
  check(`${n} libellés possibles, tous corrects`, n > 0 && !mauvais.length, [...new Set(mauvais)].slice(0, 6));
}

// ── 10 et 11. Dans la page ──
let playwright = null;
for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { playwright = require(p); break; } catch (e) { /* suivant */ } }
const PAS = { '1m': 6e4, '15m': 9e5 };
const DATA = { '15m': B15.map(k => [Math.round(k[0] / 1000), +k[1], +k[2], +k[3], +k[4], +k[5]]), '1m': SERIES['1m'].b.map(k => [Math.round(k[0] / 1000), +k[1], +k[2], +k[3], +k[4], +k[5]]) };
function binance(url) {
  const u = new URL(url), q = u.searchParams, itv = q.get('interval') || '15m', k = DATA[itv] || DATA['15m'], pas = PAS[itv] || 9e5, x = k[k.length - 1];
  if (u.pathname.endsWith('/klines')) {
    const lim = Math.min(1000, +q.get('limit') || 500), fin = q.get('endTime') ? +q.get('endTime') : Infinity;
    return k.filter(y => y[0] * 1000 <= fin).slice(-lim).map(y => [y[0] * 1000, String(y[1]), String(y[2]), String(y[3]), String(y[4]), String(y[5]), y[0] * 1000 + pas - 1, '0', 100, '0', '0', '0']);
  }
  if (u.pathname.endsWith('/ticker/24hr')) return { symbol: 'BTCUSDT', lastPrice: String(x[4]), openPrice: String(x[1]), priceChangePercent: '0', highPrice: String(x[2]), lowPrice: String(x[3]), volume: '1', quoteVolume: '1', count: 1 };
  if (u.pathname.endsWith('/ticker/price')) return { price: String(x[4]) };
  if (u.pathname.endsWith('/time')) return { serverTime: x[0] * 1000 + Math.round(pas * 0.6) };
  return {};
}
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const serveur = http.createServer((req, res) => {
  const f = path.join(REPO, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(REPO) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
async function ouvrir(nav, mode, w, h) {
  const tactile = w < 500, x = DATA['15m'][DATA['15m'].length - 1];
  const ctx = await nav.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: tactile, isMobile: tactile });
  await ctx.clock.install({ time: x[0] * 1000 + Math.round(9e5 * 0.6) });
  const page = await ctx.newPage(), erreurs = [];
  page.on('pageerror', e => erreurs.push(e.message));
  await page.route('**/*', r => {
    const u = r.request().url(), hst = new URL(u).host, cors = { 'access-control-allow-origin': '*' };
    if (hst.startsWith('127.0.0.1')) return r.continue();
    if (hst === 'api.binance.com' || hst === 'data-api.binance.vision') return r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(binance(u)) });
    return r.fulfill({ status: 404, headers: cors, body: '' });
  });
  await page.addInitScript(m => { try { localStorage.clear(); localStorage.setItem('samsara-theme', 'aero'); localStorage.setItem('samsara-mode', m); localStorage.setItem('samsara-scenarios-v1', '0'); } catch (e) { /* */ } }, mode);
  await page.goto(`http://127.0.0.1:${serveur.address().port}/index.html`);
  await page.waitForFunction(() => typeof candles !== 'undefined' && candles.length > 100 && typeof guideEtat !== 'undefined' && guideEtat, null, { timeout: 15000 }).catch(() => erreurs.push('page non prête'));
  await page.waitForTimeout(800);
  return { ctx, page, erreurs };
}
/** Avance clôture après clôture dans la page (la dernière bougie en cours), de i0 à i1. */
const derouler = (page, i0, i1) => page.evaluate(([K, i0, i1]) => {
  const all = K.map(y => ({ time: y[0], open: y[1], high: y[2], low: y[3], close: y[4], volume: y[5] }));
  const o0 = all.findIndex(y => y.time === candles[0].time);
  const out = { inst: 0, avecFigure: 0, sansLibelle: 0, tombees: 0, nonBarree: 0, barreeJamaisVue: 0, figuresExpert: 0, expertSansNom: 0, ex: [] };
  let prev = null;
  for (let i = i0; i <= i1; i++) {
    candles = all.slice(o0, i + 1); viewEnd = candles.length; viewStart = viewEnd - 50; memoCache.clear(); livePrice = candles[candles.length - 1].close;
    drawChart();
    const E = guideEtat;
    if (!E) continue;
    out.inst++;
    if (!E.deb) { for (const x of E.figures) { out.figuresExpert++; if (!x.pose) { out.expertSansNom++; if (out.ex.length < 4) out.ex.push({ i, sansNom: x.f.type }); } } continue; }
    const x = E.debForme, d = x ? x.f : null, id = d ? Guide.idFigure(d) : null, n = GUIDE_FORMES.val.n;
    if (d) out.avecFigure++;
    if (x && !x.pose) out.sansLibelle++;
    if (prev && prev.f.fin && !['devenue', 'triple', 'devenu_triple'].includes(prev.f.fin) && prev.f.jFin === n - 1) {
      out.tombees++;
      if (!(d === prev.f && (x.tr.croix || /✗|atteinte|sans suite/i.test(x.t) || prev.f.fin === 'atteint'))) { out.nonBarree++; if (out.ex.length < 4) out.ex.push({ i, tombee: prev.f.type + '/' + prev.f.fin, maintenant: d ? x.t : null }); }
    }
    if (d && d.fin && (!prev || prev.id !== id)) { out.barreeJamaisVue++; if (out.ex.length < 4) out.ex.push({ i, jamaisVue: d.type + '/' + d.fin }); }
    prev = d ? { f: d, id } : null;
  }
  return out;
}, [DATA['15m'], i0, i1]);

(async () => {
  if (!playwright) {
    console.log('\n── 10–11. Page ──\n  − NON EXÉCUTÉ : Playwright introuvable — le suivi n’est pas vérifié à l’écran sur ce poste.');
    ko++;
  } else {
    await new Promise(r => serveur.listen(0, '127.0.0.1', r));
    const nav = await playwright.chromium.launch();
    try {
      const N = DATA['15m'].length;
      titre('10. Page : clôture après clôture, ce qui est dessiné puis tombe est barré');
      for (const [mode, w, h, i0] of [['debutant', 390, 844, N - 360], ['debutant', 1440, 900, N - 360], ['expert', 1440, 900, N - 200]]) {
        const o = await ouvrir(nav, mode, w, h);
        const r = await derouler(o.page, i0, N - 1);
        if (mode === 'debutant') {
          check(`Débutant ${w} px, ${r.inst} clôtures : ${r.avecFigure} avec une figure, chacune avec son libellé`, r.inst > 300 && r.avecFigure > 0 && r.sansLibelle === 0, r);
          check(`… ${r.tombees} figure(s) dessinée(s) tombée(s) : toutes barrées à l’image suivante`, r.nonBarree === 0, r.ex);
          check('… aucune ✗ pour une figure jamais dessinée', r.barreeJamaisVue === 0, r.ex);
        } else check(`Expert, ${r.inst} clôtures : ${r.figuresExpert} figures montrées, chacune avec son nom posé`, r.figuresExpert > 0 && r.expertSansNom === 0, r.ex);
        check('aucune erreur JavaScript', !o.erreurs.length, o.erreurs);
        await o.ctx.close();
      }
      titre('11. Page : revenir sur un intervalle déjà vu reprend le rejeu');
      {
        const o = await ouvrir(nav, 'debutant', 1440, 900);
        await o.page.evaluate(() => {
          window.__rejeux = [];
          const d0 = Guide.detecter;
          Guide.detecter = function (S, P, avant) { window.__rejeux.push({ itv: chartInterval, repris: !!avant }); return d0.apply(this, arguments); };
        });
        for (const itv of ['1m', '15m']) {
          await o.page.evaluate(i => { const l = document.getElementById('int_' + i); changeInterval(i, l || document.createElement('label')); }, itv);
          await o.page.waitForFunction(i => chartInterval === i && candles.length > 100 && guideEtat, itv, { timeout: 15000 }).catch(() => o.erreurs.push('intervalle ' + itv + ' non pris'));
          await o.page.waitForTimeout(600);
        }
        const rj = await o.page.evaluate(() => window.__rejeux);
        const retour = rj.filter(x => x.itv === '15m');
        check('retour en 15 min : aucun rejeu complet (repris là où il s’était arrêté)', retour.every(x => x.repris), rj);
        check('aucune erreur JavaScript', !o.erreurs.length, o.erreurs);
        await o.ctx.close();
      }
    } catch (e) {
      check('déroulé du test', false, e.message);
    } finally {
      await nav.close(); serveur.close();
    }
  }
  // Le rejeu à froid : 1er appel dans un processus neuf (JIT froid), 1 000 puis 3 000 bougies.
  try {
    const code = `const G=require(${JSON.stringify(path.join(REPO, 'js/guide.js'))});const d=JSON.parse(require('fs').readFileSync(0,'utf8'));`
      + `const t0=performance.now();G.detecter(d.a,d.P);const t1=performance.now();G.detecter(d.b,d.P);const t2=performance.now();console.log(JSON.stringify([t1-t0,t2-t1]));`;
    const cut = (a, b) => { const h = H.slice(a, b), l = L.slice(a, b), c = C.slice(a, b); return { h, l, c, atr: atrDe(h, l, c, P.atrPeriode), n: c.length - 1 }; };
    const out = execFileSync(process.execPath, ['-e', code], { input: JSON.stringify({ a: cut(C.length - 1000, C.length), b: S, P }) }).toString();
    const [a, b] = JSON.parse(out);
    console.log(`  · rejeu à froid (processus neuf) : 1 000 bougies en ${a.toFixed(1)} ms, puis ${S.n} bougies en ${b.toFixed(1)} ms — mesure affichée ; le rejeu repris à chaque clôture est contrôlé ailleurs (test_figures, test_figures_page).`);
  } catch (e) { console.log('  · rejeu à froid non mesuré : ' + e.message); }
  console.log(ko ? `\n❌ SUIVI DES FIGURES : ${ko} contrôle(s) en échec` : '\n✅ SUIVI DES FIGURES : TOUS LES CONTRÔLES PASSENT');
  process.exit(ko ? 1 : 0);
})();
