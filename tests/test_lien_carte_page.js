// La LIAISON entre le graphique du terminal (index.html) et la carte du carnet (bookmap.html), dans
// un vrai navigateur (Chromium, Playwright) — plan §10 quater, point 6 :
//
//   1. GRAPHIQUE → CARTE, à la souris (1440) : la bulle de chacun des deux repères du Lisible porte
//      « Voir sur la carte des ordres ▸ » (bookmap.html#prix=<prix du repère>) ; survoler, puis cliquer le
//      repère n'ouvre que la bulle ; la bulle reste en place pendant que la souris va vers son lien ;
//      seul le lien navigue. La carte s'ouvre centrée sur ce prix, le prix marqué (trait en tirets,
//      étiquette sur l'axe), au plus 2 textes sur la chaleur (Lisible). Sur le trait, la lecture
//      dit d'où vient ce prix, et son lien ramène au graphique.
//   2. GRAPHIQUE → CARTE, au doigt (390) : un toucher ouvre la bulle, un 2e son détail, sans
//      naviguer ; le lien (une cible de 40 px de haut) navigue.
//   3. COMPLET (1440) : les repères du Guide et les supports / résistances portent le lien.
//   4. AUTRE PAIRE : aucune bulle ne porte le lien ; un prix venu de la carte ne s'y montre pas, et
//      revient avec BTC/USDT.
//   5. CARTE → GRAPHIQUE, à la souris (1440) : la carte ouverte par #carteBtn (inchangé), sans
//      prix marqué ; la lecture d'un repère porte « Voir sur le graphique ▸ » (index.html#prix=…),
//      et reste en place pendant que la souris va vers son lien ; le terminal s'ouvre sur BTC/USDT,
//      en 15 min (son intervalle par défaut, inchangé), ce prix marqué et dans l'échelle, toujours
//      au plus 5 textes sur le tracé (Lisible). Puis la même chose depuis le Complet de la carte.
//   6. CARTE → GRAPHIQUE, au doigt (390).
//   7. ADRESSES PIÉGÉES OU INVRAISEMBLABLES : ignorées sur les deux pages, à l'ouverture et quand
//      l'adresse change, sans erreur ; un prix juste, puis faux : marqué, puis effacé.
//   8. THÈME : la carte prend le ton du terminal (Aero : fond clair, accent du thème, mots du ton
//      clair, chaleur peinte avec la palette claire) ; un changement de thème dans l'autre onglet la
//      suit sans recharger ; kala : la carte sombre d'avant (mêmes couleurs, mêmes mots). Bureau 95,
//      thème carré : tous les angles de la carte à 0, puis ses coins d'avant en Aero (revue du 14/10, M18).
//
// Harnais : celui de tests/test_debutant_page.js pour le terminal (Binance simulé autour de 86 000,
// horloge fixée au 08/10/2026 22:52 UTC, scénarios du matin, murs et options près du prix), et
// celui de tests/test_bookmap_rendu.js pour la carte (bougies d'une minute, exécutions, carnet avec
// un gros niveau de chaque côté du prix), sur la même horloge ; la carte publiée est calée sur
// l'horloge et les prix simulés. Les deux pages s'ouvrent dans le même contexte (le même
// stockage, comme deux onglets) : la navigation par les liens est réelle.
// Sans Playwright : « non exécuté », dit à l'écran (ce n'est pas un succès).
// USAGE   node tests/test_lien_carte_page.js
const fs = require('fs'), path = require('path'), http = require('http');
const REPO = path.resolve(__dirname, '..');
const { previsionsFixture, estPrevisions } = require('./previsions-fixture');
const Liaison = require('../js/liaison.js');
const BM = require('../js/bookmap-calc.js');

let playwright = null;
for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright', process.env.PLAYWRIGHT_MODULE].filter(Boolean)) {
  try { playwright = require(p); break; } catch (e) { /* suivant */ }
}
if (!playwright) {
  console.log('  − NON EXÉCUTÉ : Playwright introuvable — la liaison graphique ↔ carte n\'est pas vérifiée à l\'écran sur ce poste.');
  process.exit(0);
}
let ko = 0;
const check = (nom, ok, det) => { if (!ok) ko++; console.log(`  ${ok ? '✓' : '✗'} ${nom}${!ok && det !== undefined ? ' — ' + JSON.stringify(det).slice(0, 600) : ''}`); };
const titre = t => console.log(`\n── ${t} ──`);

// ── Horloge et Binance simulé ────────────────────────────────────────────────
const MAINTENANT = Date.parse('2026-10-08T22:52:00Z'), DECALAGE = MAINTENANT - Date.now();
const maintenant = () => Date.now() + DECALAGE;
const P0 = 86000;
const hasard = x => { const r = Math.sin(x * 12.9898) * 43758.5453; return r - Math.floor(r); };
// La carte : une minute par bougie, une exécution toutes les 120 ms, le carnet — autour de 86 000.
const BASE = Math.floor(MAINTENANT / 60e3) * 60e3 - 30 * 3600e3, PAS = 120;
const prixCarte = t => P0 + 120 * Math.sin(t / 3.6e6 * 2 * Math.PI) + 20 * Math.sin(t / 7e4);
function kline1m(t, now) {
  const o = prixCarte(t), c = prixCarte(Math.min(t + 60e3, now)), frac = Math.min(1, (now - t) / 60e3);
  const vol = (20 + 60 * hasard(t / 60e3)) * frac, quote = vol * (o + c) / 2, taker = quote * (0.3 + 0.4 * hasard(t / 60e3 + 0.5));
  return [t, o.toFixed(2), (Math.max(o, c) + 5).toFixed(2), (Math.min(o, c) - 5).toFixed(2), c.toFixed(2), String(vol), t + 59999, String(quote), 100, String(taker / ((o + c) / 2)), String(taker), '0'];
}
const trade = id => { const T = BASE + id * PAS, f = hasard(id); return { a: id, p: (prixCarte(T) + (f - 0.5) * 6).toFixed(2), q: (f * f * 3).toFixed(5), f: id, l: id, T, m: f < 0.47, M: true }; };
let updateId = 1000;
function binance(url) {
  const u = new URL(url), q = u.searchParams, now = maintenant(), k = u.pathname.split('/').pop();
  if (k === 'time') return { serverTime: now };
  if (k === 'klines' && q.get('interval') === '1m') {
    const n = Math.min(1000, +q.get('limit') || 500), der = Math.floor(Math.min(q.get('endTime') ? +q.get('endTime') : now, now) / 60e3) * 60e3, out = [];
    if (q.get('startTime') !== null) { for (let t = Math.ceil(+q.get('startTime') / 60e3) * 60e3; t <= der && out.length < n; t += 60e3) out.push(kline1m(t, now)); }
    else for (let t = der - (n - 1) * 60e3; t <= der; t += 60e3) out.push(kline1m(t, now));
    return out;
  }
  if (k === 'klines') {
    // Le terminal (test_debutant_page) : une sinusoïde autour de 86 000, à son intervalle.
    const pas = { '5m': 3e5, '15m': 9e5, '1h': 36e5, '4h': 144e5, '1d': 864e5, '1w': 6048e5 }[q.get('interval')] || 9e5;
    const n = Math.min(1000, +q.get('limit') || 500), fin = q.get('endTime') ? Math.min(+q.get('endTime'), now) : now;
    return Array.from({ length: n }, (_, i) => { const t = Math.floor((fin - (n - 1 - i) * pas) / pas) * pas, kk = Math.round(t / pas), c = P0 + Math.sin(kk / 7) * 300, o = c + (kk % 2 ? 40 : -40);
      return [t, String(o), String(Math.max(o, c) + 60), String(Math.min(o, c) - 60), String(c), '80', t + pas - 1, String(80 * c), 50, '40', String(40 * c), '0']; });
  }
  if (k === 'aggTrades') {
    const n = Math.min(1000, +q.get('limit') || 500), last = Math.floor((now - BASE) / PAS);
    const de = q.get('fromId') !== null ? +q.get('fromId') : last - n + 1, out = [];
    for (let id = de; id < de + n && id <= last; id++) out.push(trade(id));
    return out;
  }
  if (k === 'depth') {
    // Un gros niveau de chaque côté, à 60 $ du prix (deuxCotes de test_bookmap_rendu) : les repères de la carte se posent.
    const n = Math.min(5000, +q.get('limit') || 100), m = prixCarte(now);
    const lv = s => Array.from({ length: n }, (_, i) => [(m + s * (0.05 + i * 0.37)).toFixed(2), (hasard(i + Math.floor(m) + s) * (i % 97 === 0 ? 40 : 1.5) + 0.01).toFixed(5)]);
    const d = { lastUpdateId: (updateId += 7), bids: lv(-1), asks: lv(1) };
    const glisser = (l, p, qte, bas) => { const i = l.findIndex(x => (bas ? +x[0] < p : +x[0] > p)); if (i > 0) l.splice(i, 0, [p.toFixed(2), qte]); };
    for (const dp of [0, 0.5, 1]) { glisser(d.bids, Math.round(m - 60) - dp, '30.00000', true); glisser(d.asks, Math.round(m + 60) + dp, '30.00000', false); }
    return d;
  }
  if (k === 'price') return { price: '86012.5' };
  if (k === '24hr') return { lastPrice: '86012.5', openPrice: '85700', priceChangePercent: '0.4', highPrice: '87000', lowPrice: '85000', bidPrice: '86012.4', askPrice: '86012.6', quoteVolume: '1e9', count: '100' };
  return {};
}
// La carte publiée (heatmap.json) calée sur l'horloge et sur les prix simulés : douze heures de
// colonnes d'une minute, vingt tranches de 20 $ de chaque côté de 86 000 (test_debutant_page).
const LU = new Date(Math.floor(maintenant() / 60000) * 60000).toISOString().replace('.000Z', '+00:00');
function chaleurAlignee() {
  const dt = 60, fin = Math.floor(maintenant() / 1000 / dt), n = 12 * 60, colonnes = [];
  const serie = m => Array.from({ length: 20 }, (_, i) => 60 + ((m + i) % 7) * 25);
  for (let m = fin - n + 1; m <= fin; m++) colonnes.push([m, 4280, serie(m), 4301, serie(m * 3)]);
  return JSON.stringify({ updated: LU, sym: 'BTCUSDT', t0: (fin - n + 1) * dt, dt, dp: 20, format: 'colonnes-1', colonnes });
}
const md = JSON.parse(fs.readFileSync(path.join(REPO, 'market-data.json'), 'utf8'));
md.updated = LU;
md.liquidity = Object.assign({}, md.liquidity, { snapshot_at: LU, wall_bin_usd: 20, bid_walls: [[85890, 31], [85700, 12]], ask_walls: [[86150, 44], [86330, 9]] });
md.micro = Object.assign({}, md.micro, { put_wall: 85600, call_wall: 86500, zero_gamma: 86420, usdt_usd: 0.9995 });
const MD = JSON.stringify(md);

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2' };
const serveur = http.createServer((req, res) => {
  const f = path.join(REPO, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(REPO) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
const ORIGINE = () => `http://127.0.0.1:${serveur.address().port}`;

/** Un contexte (deux onglets y partagent le stockage) : horloge fixée, réseau simulé, stockage
 *  posé UNE fois (pas à chaque navigation : le thème décrit par le terminal doit survivre au lien),
 *  journal des textes du canevas. o = { vue, tactile, theme, mode, stockage }. */
async function contexte(nav, o) {
  const tactile = !!o.tactile;
  const ctx = await nav.newContext(Object.assign({ viewport: o.vue, deviceScaleFactor: 1, locale: 'fr-FR' }, tactile ? { hasTouch: true, isMobile: true } : {}));
  await ctx.clock.install({ time: maintenant() });
  await ctx.route('**/*', r => {
    const u = r.request().url(), h = new URL(u).host, cors = { 'access-control-allow-origin': '*' };
    if (h.startsWith('127.0.0.1')) return r.continue();
    if (h === 'api.binance.com') return r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(binance(u)) }).catch(() => {});
    if (h === 'raw.githubusercontent.com') {
      if (estPrevisions(u)) return r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: previsionsFixture({ maintenant: maintenant() }) }).catch(() => {});
      if (/\/master\/heatmap\.json/.test(u)) return r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: chaleurAlignee() }).catch(() => {});
      if (/\/master\/market-data\.json/.test(u)) return r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: MD }).catch(() => {});
      return r.fulfill({ status: 404, headers: cors, body: '' }).catch(() => {});
    }
    return r.abort().catch(() => {});
  });
  const st = Object.assign({ 'samsara-theme': o.theme || 'aero', 'samsara-mode': o.mode || 'debutant', 'samsara-carte-intro-v1': 'vue', 'samsara-carte-indice-v1': 'vu' }, o.stockage || {});
  await ctx.addInitScript(s => {
    try {
      if (localStorage.getItem('__harnais') === '1') return;
      localStorage.clear();
      for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v);
      localStorage.setItem('__harnais', '1');
    } catch (e) { /* */ }
  }, st);
  // Le journal des textes dessinés (canevas, texte, x, y), actif entre deux marqueurs.
  await ctx.addInitScript(() => {
    window.__ft = []; window.__ftOn = false;
    const f0 = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (t, x, y) {
      if (window.__ftOn) window.__ft.push({ c: this.canvas && this.canvas.id, t: String(t), x, y, w: this.measureText(String(t)).width });
      return f0.apply(this, arguments);
    };
  });
  return ctx;
}
async function nouvelOnglet(ctx) {
  const page = await ctx.newPage(), erreurs = [];
  page.on('pageerror', e => erreurs.push(e.message));
  return { page, erreurs };
}
async function pretTerminal(page) {
  await page.waitForFunction(() => typeof guideEtat !== 'undefined' && guideEtat && guideEtat.niveaux.length > 0 && typeof marketData !== 'undefined' && marketData
    && typeof scenEtat !== 'undefined' && (!overlays.scenarios || (scenEtat && scenEtat.boite)), null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(700);
}
async function pretCarte(page, deb) {
  await page.waitForFunction(d => { const e = window.__carte && window.__carte.etat(); return !!e && !!e.publiee && !!e.live && e.minutes > 1000 && (!d || e.debutant.etiquettes.length >= 1); }, deb, { timeout: 25000 }).catch(() => {});
  await page.waitForTimeout(1500);
}
const etatC = page => page.evaluate(() => window.__carte.etat());
const adresse = (pg, p) => Liaison.adresse(pg, p);
const chemin = page => page.evaluate(() => location.pathname.replace(/^.*\//, '') + location.hash);

// ── Terminal : viser, lire la bulle, le prix marqué ──────────────────────────
const origineCanevas = page => page.evaluate(() => { const r = canvas.getBoundingClientRect(); return { x: r.left, y: r.top }; });
/** La bulle dessinée : son lien (adresse, zone, cadre de la bulle), la cible expliquée, les textes du lien dessinés. */
const lireBulle = page => page.evaluate(() => {
  // Une image du calque, journalisée seule (le survol en a dessiné plusieurs, à des places successives).
  window.__ft = []; window.__ftOn = true; dessinerCalque(); window.__ftOn = false;
  const L = lienBulle, c = guideEtat && guideEtat.survol;
  return { lien: L && { url: L.url, cle: L.cle, rect: Object.assign({}, L.rect), bulle: Object.assign({}, L.bulle) },
    titre: c ? c.titre : null, p: c && c.niveau ? c.niveau.niv.p : null, detail: bulleDetail,
    // Le texte du lien : « Voir sur la carte des ordres ▸ » (revue du 14/10/2026, M3 : « la carte »
    // seule voulait aussi dire une case d'« Infos du marché », dans la même bulle).
    dessine: window.__ft.filter(e => e.c === 'chartCalque' && e.t === 'Voir sur la carte des ordres ▸').map(e => ({ x: e.x, y: e.y, w: e.w })),
    titres: window.__ft.filter(e => e.c === 'chartCalque').map(e => e.t),
    chemin: location.pathname.replace(/^.*\//, '') + location.hash, curseur: canvas.style.cursor, croix: [crossX, crossY],
    W: canvas.width / devicePixelRatio, mainH: geo ? geo.mainH : null };
});
const journal = page => page.evaluate(() => { window.__ft = []; window.__ftOn = true; });
/** Survol (souris) ou toucher (doigt) du point (x, y) du canevas ; la bulle lue. */
async function viserT(page, x, y, tactile) {
  const o = await origineCanevas(page);
  if (!tactile) { await page.mouse.move(2, 2); await page.waitForTimeout(60); }
  await journal(page);
  if (tactile) await page.touchscreen.tap(o.x + x, o.y + y);
  else { await page.mouse.move(o.x + x - 10, o.y + y - 3); await page.mouse.move(o.x + x, o.y + y, { steps: 3 }); }
  await page.waitForTimeout(200);
  return lireBulle(page);
}
/** Le dessin forcé du terminal, journalisé : textes du TRACÉ (hors filigrane, colonne de l'axe,
 *  heures), registre du Lisible, prix marqué, son étiquette sur l'axe. */
const dessinT = page => page.evaluate(() => {
  crossX = crossY = null;
  window.__ft = []; window.__ftOn = true;
  drawChart();
  window.__ftOn = false;
  const W = canvas.width / devicePixelRatio, mainH = geo.mainH, xAxe = W - 75;
  const fil = (NOMS_PAIRES[activeSymbol] || activeSymbol) + '  ·  ' + Guide.nomIntervalle(chartInterval);
  const trace = window.__ft.filter(e => (e.c === 'chart' || e.c === 'chartCalque') && e.t !== fil && e.x >= 14 && e.x < xAxe && e.y >= 0 && e.y <= mainH - 20).map(e => e.t);
  const pm = prixMarqueCarte(), etiq = pm === null ? null : Fmt.prix(pm, guideUnite())   // l'axe : un seul format, arrondi, avec ou sans « Le détail »;
  return { sym: activeSymbol, tf: chartInterval, pm, minP: geoPrix.minP, maxP: geoPrix.maxP, trace, items: debEtat ? debEtat.items.length : null,
    etiquette: etiq, axe: etiq !== null && window.__ft.some(e => e.c === 'chartCalque' && e.t === etiq && e.x >= xAxe - 4),
    cible: cibleMarque && { prix: cibleMarque.prix, titre: cibleMarque.titre }, live: livePrice,
    defile: document.documentElement.scrollWidth - document.documentElement.clientWidth };
});

// ── Carte : viser, la lecture et son lien, le trait du prix marqué ───────────
const origineCarte = page => page.evaluate(() => { const r = document.getElementById('carte').getBoundingClientRect(); return { x: r.left, y: r.top }; });
const lireLecture = page => page.evaluate(() => {
  const l = document.getElementById('lecture'), a = l.querySelector('a'), r = l.getBoundingClientRect(), q = a ? a.getBoundingClientRect() : null;
  return { vue: !l.hidden, texte: l.hidden ? '' : (l.firstElementChild ? l.firstElementChild.innerText : l.innerText).replace(/[  ]/g, ' '),
    lien: a && { texte: a.textContent, href: a.getAttribute('href'), vu: !a.hidden && !!q && q.width > 0, r: q && { x: q.left, y: q.top, w: q.width, h: q.height } },
    n: l.querySelectorAll('a').length, cadre: { x: r.left, y: r.top, w: r.width, h: r.height } };
});
async function viserC(page, x, y, tactile) {
  const o = await origineCarte(page);
  if (tactile) await page.touchscreen.tap(o.x + x, o.y + y);
  else { await page.mouse.move(o.x + x + 1, o.y + y); await page.mouse.move(o.x + x, o.y + y); }
  await page.waitForTimeout(350);
  return lireLecture(page);
}
/** Le trait en tirets du prix marqué se voit-il ? Huit fenêtres de 13 px (une période des tirets),
 *  ± 3 px autour de sa hauteur : la couleur du trait (C.accent) y est-elle ? */
const traitVu = (page, y, coul) => page.evaluate(([y, coul]) => {
  const c = document.getElementById('carte'), k = c.width / c.clientWidth, x = c.getContext('2d'), e = window.__carte.etat(), w = e.mise.chaleur.w;
  const rgb = [1, 3, 5].map(i => parseInt(coul.slice(i, i + 2), 16));
  let vus = 0;
  for (let i = 0; i < 8; i++) {
    const x0 = Math.round((w * (i + 0.5) / 8.5) * k), d = x.getImageData(x0, Math.round((y - 3) * k), Math.ceil(13 * k), Math.ceil(7 * k)).data;
    for (let j = 0; j < d.length; j += 4) if (Math.hypot(d[j] - rgb[0], d[j + 1] - rgb[1], d[j + 2] - rgb[2]) < 70) { vus++; break; }
  }
  return vus;
}, [y, coul]);
/** Un point de la chaleur sur la hauteur y, loin des étiquettes, des cadres, de la mini-clé et de la ligne du prix. */
function pointLibre(e, y) {
  const d = e.debutant, w = e.mise.chaleur.w, occupe = x => d.etiquettes.some(q => x >= q.x - 8 && x <= q.x + q.w + 8 && y >= q.y - 8 && y <= q.y + q.h + 8)
    || (d.miniCle && x >= d.miniCle.x - 8 && x <= d.miniCle.x + d.miniCle.w + 8 && y >= d.miniCle.y - 8 && y <= d.miniCle.y + d.miniCle.h + 8);
  for (const f of [0.18, 0.3, 0.42, 0.12, 0.55, 0.24, 0.36]) { const x = Math.round(w * f); if (!occupe(x)) return x; }
  return Math.round(w * 0.2);
}

/** La carte vient-elle de s'ouvrir sur le prix p, marqué ? (Lisible : budget des mots.) */
async function controlerCarteMarquee(page, p, nom, deb, erreurs) {
  await pretCarte(page, deb);
  const e = await etatC(page), m = e.marque, v = e.vue, ch = e.mise.chaleur;
  check(`${nom} : la carte lit le prix de l'adresse (${m && m.p}) — celui du repère (${p})`, !!m && m.p === Math.round(p * 100) / 100 && m.posee && m.tenir, m);
  const centre = v && (v.p1 + v.p2) / 2, dp = e.debutant.dernierPrix;
  check(`${nom} : vue centrée sur ce prix (centre ${centre && centre.toFixed(1)}), le prix du moment (${dp && dp.toFixed(1)}) dans la vue, le trait au milieu de la hauteur (y ${m && Math.round(m.y)} / ${ch.h})`,
    !!m && Math.abs(centre - m.p) <= (v.p2 - v.p1) * 0.12 && dp > v.p1 && dp < v.p2 && m.y > ch.h * 0.3 && m.y < ch.h * 0.7, { v, m, dp });
  check(`${nom} : l'étiquette du prix marqué est sur l'axe des prix (« ${e.textes.marque} »)`, typeof e.textes.marque === 'string' && /\d/.test(e.textes.marque), e.textes);
  const vus = m ? await traitVu(page, m.y, e.theme.accent) : 0;
  check(`${nom} : le trait en tirets se voit (${vus} fenêtres sur 8, couleur ${e.theme.accent})`, vus >= 5, vus);
  if (deb) check(`${nom} : Lisible, au plus 2 textes sur la chaleur (${e.textesCarte.length} : ${e.textesCarte.map(t => t.texte).join(' | ')})`, e.textesCarte.length <= 2, e.textesCarte);
  const retour = await page.evaluate(() => { const a = document.querySelector('a.retour'); return a && a.getAttribute('href'); });
  check(`${nom} : « ← Terminal » mène toujours au terminal (« ${retour} »)`, retour === 'index.html', retour);
  check(`${nom} : aucune erreur JavaScript`, !erreurs.length, erreurs);
  return e;
}
/** Le terminal vient-il de s'ouvrir sur le prix p, marqué ? */
async function controlerTerminalMarque(page, p, nom, deb, erreurs) {
  await pretTerminal(page);
  const d = await dessinT(page), pp = Math.round(p * 100) / 100;
  check(`${nom} : BTC/USDT, en 15 min (intervalle par défaut, inchangé) — ${d.sym}, ${d.tf}`, d.sym === 'BTCUSDT' && d.tf === '15m', d);
  check(`${nom} : le prix de l'adresse (${d.pm}) est marqué, dans l'échelle (${Math.round(d.minP)}–${Math.round(d.maxP)}), avec sa bulle (« ${d.cible && d.cible.titre} »)`,
    d.pm === pp && d.pm > d.minP && d.pm < d.maxP && !!d.cible && d.cible.prix === pp, d);
  check(`${nom} : son étiquette sur l'axe des prix (« ${d.etiquette} »), hors du tracé`, d.axe, d);
  if (deb) check(`${nom} : Lisible, toujours au plus 5 textes sur le tracé (${d.trace.length}), autant que d'entrées du registre (${d.items})`, d.trace.length <= 5 && d.trace.length === d.items, d.trace);
  check(`${nom} : aucun défilement de côté`, d.defile <= 0, d.defile);
  check(`${nom} : aucune erreur JavaScript`, !erreurs.length, erreurs);
  return d;
}

(async () => {
  await new Promise(r => serveur.listen(0, '127.0.0.1', r));
  const nav = await playwright.chromium.launch();
  const ouverts = [];
  try {
    // ── 1. Graphique → carte, à la souris ─────────────────────────────────────
    titre('1. Graphique → carte, à la souris (1440 × 900, Lisible, Aero)');
    {
      const ctx = await contexte(nav, { vue: { width: 1440, height: 900 } }); ouverts.push(ctx);
      const { page, erreurs } = await nouvelOnglet(ctx);
      await page.goto(ORIGINE() + '/index.html');
      await pretTerminal(page);
      const btn = await page.evaluate(() => { const a = document.getElementById('carteBtn'); return a && a.getAttribute('href'); });
      check(`#carteBtn mène toujours à la carte (« ${btn} »)`, btn === 'bookmap.html', btn);
      const pub = await page.evaluate(() => localStorage.getItem('samsara-theme-carte'));
      const t = Liaison.lireTheme(pub);
      check(`le terminal décrit son thème pour la carte (${pub})`, !!t && t.id === 'aero' && t.mode === 'clair' && t.accent === '#0b84b0', pub);
      const items = await page.evaluate(() => debEtat.items.filter(i => i.role === 'niveau' && i.rect).map(i => ({ texte: i.texte, rect: i.rect })));
      check(`deux repères de prix sur le graphique (${items.map(i => i.texte).join(' / ')})`, items.length === 2, items);
      let premier = null;
      for (const [k, it] of items.entries()) {
        const x = it.rect.x + Math.min(it.rect.w / 2, 40), y = it.rect.y + it.rect.h / 2;
        const b = await viserT(page, x, y, false);
        const attendu = b.p === null ? null : adresse('bookmap.html', b.p);
        check(`repère ${k + 1} (« ${it.texte} ») survolé : sa bulle s'ouvre, elle porte « Voir sur la carte des ordres ▸ » → ${b.lien && b.lien.url}`,
          !!b.titre && !!b.lien && b.lien.url === attendu && /^bookmap\.html#prix=\d+(\.\d+)?$/.test(b.lien.url), b);
        // Le texte entier du lien tient dans la bulle (il est plus long depuis la revue du 14/10/2026, M3).
        const dans = b.lien && b.dessine.length === 1 && b.dessine.every(q => q.x >= b.lien.bulle.x && q.x + q.w <= b.lien.bulle.x + b.lien.bulle.w - 8 && q.y >= b.lien.rect.y && q.y <= b.lien.bulle.y + b.lien.bulle.h);
        check(`repère ${k + 1} : le lien est dessiné une fois, en entier dans la dernière ligne de la bulle, et la bulle tient dans le tracé`,
          dans && b.lien.bulle.x >= 0 && b.lien.bulle.x + b.lien.bulle.w <= b.W - 75 && b.lien.bulle.y >= 0 && b.lien.bulle.y + b.lien.bulle.h <= b.mainH, b);
        check(`repère ${k + 1} : survoler ne navigue pas (${b.chemin})`, b.chemin === 'index.html', b.chemin);
        if (!premier) premier = { it, x, y, p: b.p };
      }
      if (premier) {
        // Cliquer le REPÈRE : son détail (Lisible), pas la carte.
        const o = await origineCanevas(page);
        await page.mouse.move(2, 2); await page.waitForTimeout(60);
        await page.mouse.move(o.x + premier.x - 10, o.y + premier.y - 3); await page.mouse.move(o.x + premier.x, o.y + premier.y, { steps: 3 }); await page.waitForTimeout(150);
        await journal(page);
        await page.mouse.click(o.x + premier.x, o.y + premier.y); await page.waitForTimeout(250);
        let b = await lireBulle(page);
        check(`cliquer le repère ouvre son détail, sans naviguer (${b.chemin}) ; le lien reste au bas de la bulle`, b.chemin === 'index.html' && !!b.detail && !!b.lien && b.lien.url === adresse('bookmap.html', premier.p), b);
        // Aller vers le lien : la bulle ne bouge plus dès que la souris a quitté le repère.
        const depart = { x: b.croix[0], y: b.croix[1] }, but = { x: b.lien.rect.x + Math.min(b.lien.rect.w / 2, 70), y: b.lien.rect.y + b.lien.rect.h / 2 };
        const poses = [];
        for (let i = 1; i <= 14; i++) {
          const px = depart.x + (but.x - depart.x) * i / 14, py = depart.y + (but.y - depart.y) * i / 14;
          await page.mouse.move(o.x + px, o.y + py); await page.waitForTimeout(40);
          poses.push(await page.evaluate(([px, py, cle]) => { const c = guideCibleSous(px, py, geo.mainH, debutant()); return { sur: !!c && cleBulle(c) === cle, lien: lienBulle && Object.assign({}, lienBulle.bulle) }; }, [px, py, b.lien.cle]));
        }
        const hors = poses.slice(poses.findIndex(q => !q.sur));
        const fixe = hors.length > 0 && hors.every(q => q.lien && q.lien.x === hors[0].lien.x && q.lien.y === hors[0].lien.y);
        b = await lireBulle(page);
        check(`la souris va vers le lien (14 pas) : la bulle reste ouverte et ne bouge plus hors du repère (${hors.length} pas) ; sur le lien, le curseur « main »`, fixe && !!b.lien && b.curseur === 'pointer', { poses: poses.map(q => [q.sur, q.lien && Math.round(q.lien.x), q.lien && Math.round(q.lien.y)]), curseur: b.curseur });
        const r = b.lien && b.lien.rect;
        if (r) await page.mouse.click(o.x + r.x + Math.min(r.w / 2, 70), o.y + r.y + r.h / 2);
        await page.waitForURL(/bookmap\.html#prix=/, { timeout: 10000 }).catch(() => {});
        const ch = await chemin(page);
        check(`seul le lien navigue : ${ch}`, ch === adresse('bookmap.html', premier.p), ch);
        const e = await controlerCarteMarquee(page, premier.p, 'carte ouverte par le lien', true, erreurs);
        check(`la carte suit le thème du terminal : ton ${e.theme.ton}, cadre ${e.theme.accentCadre}`, e.theme.ton === 'clair' && e.theme.accentCadre === '#0b84b0', e.theme);
        // Sur le trait : la lecture dit d'où vient ce prix ; son lien ramène au graphique, au même prix.
        if (e.marque) {
          const x = pointLibre(e, e.marque.y), l = await viserC(page, x, e.marque.y, false);
          check(`sur le trait du prix marqué : « ${l.texte.split('\n')[0]} » ; « Voir sur le graphique ▸ » → ${l.lien && l.lien.href}`,
            l.vue && /^Prix choisi sur le graphique · [\d ]+ \$/.test(l.texte) && !!l.lien && l.lien.vu && l.lien.texte === 'Voir sur le graphique ▸' && l.lien.href === adresse('index.html', e.marque.p), l);
        }
      }
      await ctx.close();
    }

    // ── 2. Graphique → carte, au doigt ────────────────────────────────────────
    titre('2. Graphique → carte, au doigt (390 × 844, Lisible)');
    {
      const ctx = await contexte(nav, { vue: { width: 390, height: 844 }, tactile: true }); ouverts.push(ctx);
      const { page, erreurs } = await nouvelOnglet(ctx);
      await page.goto(ORIGINE() + '/index.html');
      await pretTerminal(page);
      const it = await page.evaluate(() => { const i = debEtat.items.filter(x => x.role === 'niveau' && x.rect)[0]; return i && { texte: i.texte, rect: i.rect }; });
      if (!it) check('un repère de prix sur le graphique', false);
      else {
        const x = it.rect.x + Math.min(it.rect.w / 2, 40), y = it.rect.y + it.rect.h / 2;
        let b = await viserT(page, x, y, true);
        check(`un toucher sur « ${it.texte} » : la bulle (résumé) avec « Voir sur la carte des ordres ▸ », en entier dans la bulle à 390 px, sans naviguer (${b.chemin})`, !!b.titre && !!b.lien && b.lien.url === adresse('bookmap.html', b.p) && b.chemin === 'index.html'
          && b.dessine.length === 1 && b.dessine.every(q => q.x >= b.lien.bulle.x && q.x + q.w <= b.lien.bulle.x + b.lien.bulle.w - 8), b);
        check(`au doigt, le lien est une cible de 40 px de haut au moins (${b.lien && b.lien.rect.h}), sur toute la largeur de la bulle`, !!b.lien && b.lien.rect.h >= 40 && b.lien.rect.w === b.lien.bulle.w, b.lien);
        const p = b.p;
        b = await viserT(page, x, y, true);
        check(`un 2e toucher : le détail, sans naviguer (${b.chemin}) ; le lien toujours là`, b.chemin === 'index.html' && !!b.detail && !!b.lien && b.lien.url === adresse('bookmap.html', p), b);
        const o = await origineCanevas(page), r = b.lien && b.lien.rect;
        if (r) await page.touchscreen.tap(o.x + r.x + r.w / 2, o.y + r.y + r.h / 2);
        await page.waitForURL(/bookmap\.html#prix=/, { timeout: 10000 }).catch(() => {});
        const ch = await chemin(page);
        check(`toucher le lien navigue : ${ch}`, ch === adresse('bookmap.html', p), ch);
        await controlerCarteMarquee(page, p, 'carte au doigt', true, erreurs);
        const def = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        check('carte au doigt : aucun défilement de côté', def <= 0, def);
      }
      await ctx.close();
    }

    // ── 3 et 4. Complet ; autre paire ─────────────────────────────────────────
    titre('3. Complet (1440) : repères du Guide et supports / résistances');
    {
      const ctx = await contexte(nav, { vue: { width: 1440, height: 900 }, mode: 'expert' }); ouverts.push(ctx);
      const { page, erreurs } = await nouvelOnglet(ctx);
      await page.goto(ORIGINE() + '/index.html');
      await pretTerminal(page);
      await page.evaluate(() => { overlays.sr = true; drawChart(); });
      await page.waitForTimeout(300);
      // Les cibles visées : le centre d'une étiquette, hors de toute autre étiquette.
      const cibles = () => page.evaluate(() => {
        const tous = guideEtat.cibles.concat(ciblesPrix), centre = c => ({ x: (c.rects[0].x0 + c.rects[0].x1) / 2, y: (c.rects[0].y0 + c.rects[0].y1) / 2 });
        const seul = c => { const q = centre(c); return !tous.some(d => d !== c && (d.rects || []).some(r => q.x >= r.x0 && q.x <= r.x1 && q.y >= r.y0 && q.y <= r.y1)); };
        return { sr: ciblesPrix.filter(c => c.rects.length && seul(c)).map(c => Object.assign(centre(c), { titre: c.titre, prix: c.prix })),
          guide: guideEtat.cibles.filter(c => c.niveau && c.rects.length && seul(c)).map(c => Object.assign(centre(c), { titre: c.titre, prix: c.niveau.niv.p })) };
      });
      const cb = await cibles();
      check(`des supports / résistances (${cb.sr.length}) et des repères du Guide (${cb.guide.length}) à viser`, cb.sr.length >= 1 && cb.guide.length >= 1, cb);
      for (const [nom, c] of [['support / résistance', cb.sr[0]], ['repère du Guide', cb.guide[0]]]) {
        if (!c) continue;
        const b = await viserT(page, c.x, c.y, false);
        check(`${nom} (« ${c.titre} ») : sa bulle porte « Voir sur la carte des ordres ▸ » → ${b.lien && b.lien.url}`, !!b.lien && b.lien.cle === c.titre && b.lien.url === adresse('bookmap.html', c.prix) && b.dessine.length === 1 && b.chemin === 'index.html', b);
      }
      check('Complet : aucune erreur JavaScript', !erreurs.length, erreurs);

      titre('4. Une autre paire : pas de lien ; le prix venu de la carte ne s\'y montre pas');
      await page.evaluate(() => changeSymbol('SOLUSDT', document.getElementById('sym_SOLUSDT')));
      await page.waitForFunction(() => activeSymbol === 'SOLUSDT' && candles.length > 50 && geoPrix, null, { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(800);
      await page.evaluate(() => { overlays.sr = true; drawChart(); });
      const cs = await cibles();
      check(`SOL/USDT : des supports / résistances à viser (${cs.sr.length})`, cs.sr.length >= 1, cs);
      for (const [nom, c] of [['support / résistance', cs.sr[0]], ['repère du Guide', cs.guide[0]]]) {
        if (!c) continue;
        const b = await viserT(page, c.x, c.y, false);
        check(`SOL/USDT, ${nom} (« ${c.titre} ») : la bulle s'ouvre, sans « Voir sur la carte des ordres ▸ »`, (b.titre === c.titre || b.titres.includes(c.titre)) && !b.lien && !b.dessine.length, { titre: b.titre, lien: b.lien, dessine: b.dessine, titres: b.titres.slice(0, 12) });
      }
      await page.mouse.move(2, 2);
      await page.evaluate(() => { location.hash = '#prix=86000'; });
      await page.waitForTimeout(300);
      let d = await dessinT(page);
      check(`SOL/USDT, #prix=86000 dans l'adresse : rien n'est marqué (la carte est BTC/USDT seul)`, d.pm === null && !d.cible && !d.axe, d);
      await page.evaluate(() => changeSymbol('BTCUSDT', document.getElementById('sym_BTCUSDT')));
      await page.waitForFunction(() => activeSymbol === 'BTCUSDT' && candles.length > 50 && geoPrix && candles[candles.length - 1].close > 80000, null, { timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(800);
      d = await dessinT(page);
      check(`retour sur BTC/USDT : 86 000 marqué (${d.pm}), avec son étiquette sur l'axe`, d.pm === 86000 && !!d.cible && d.axe, d);
      check('autre paire : aucune erreur JavaScript', !erreurs.length, erreurs);
      await ctx.close();
    }

    // ── 5. Carte → graphique, à la souris ─────────────────────────────────────
    titre('5. Carte → graphique, à la souris (1440 × 900) : Lisible, puis Complet');
    for (const mode of ['debutant', 'expert']) {
      const deb = mode === 'debutant', nomM = deb ? 'Lisible' : 'Complet';
      const ctx = await contexte(nav, { vue: { width: 1440, height: 900 }, mode }); ouverts.push(ctx);
      const { page, erreurs } = await nouvelOnglet(ctx);
      await page.goto(ORIGINE() + '/index.html');
      await pretTerminal(page);
      await page.click('#carteBtn');
      await page.waitForURL(/bookmap\.html$/, { timeout: 10000 }).catch(() => {});
      await pretCarte(page, deb);
      let e = await etatC(page);
      check(`${nomM} : #carteBtn ouvre la carte (${await chemin(page)}), sans prix marqué`, (await chemin(page)) === 'bookmap.html' && e.marque === null, e.marque);
      // Lisible : chaque repère de prix (mur, zone) ; Complet : les zones et les murs nommés. (Les autres
      // étiquettes — « Pas de mur au-dessous », « Vue du passé », les événements — ne sont pas des prix.)
      const ets = deb ? e.debutant.etiquettes : e.guide.etiquettesPos, avecLien = ets.filter(q => typeof q.lien === 'number');
      const x = avecLien[0];
      check(`${nomM} : ${deb ? 'chaque repère de prix de la carte connaît' : 'les repères de la carte connaissent'} son prix pour le graphique, à moins de 10 % du prix (${ets.map(q => q.texte + ' → ' + q.lien).join(' ; ')})`,
        avecLien.length >= 1 && avecLien.every(q => Liaison.plausible(q.lien, e.debutant.dernierPrix)) && (!deb || ets.every(q => q.prix === null || typeof q.lien === 'number')), ets);
      if (!x) { await ctx.close(); continue; }
      let l = await viserC(page, x.x + x.w / 2, x.y + x.h / 2, false);
      check(`${nomM} : la lecture de « ${x.texte} » porte « Voir sur le graphique ▸ » → ${l.lien && l.lien.href}`,
        l.vue && l.n === 1 && !!l.lien && l.lien.vu && l.lien.texte === 'Voir sur le graphique ▸' && l.lien.href === adresse('index.html', x.lien), l);
      const st = await etatC(page);
      check(`${nomM} : l'état de la carte dit le même lien`, st.lien.visible && st.lien.adresse === adresse('index.html', x.lien), st.lien);
      // Aller vers le lien : la lecture reste où elle est.
      if (l.lien && l.lien.r) {
        const o = await origineCarte(page), d0 = { x: o.x + x.x + x.w / 2, y: o.y + x.y + x.h / 2 }, but = { x: l.lien.r.x + l.lien.r.w / 2, y: l.lien.r.y + l.lien.r.h / 2 }, cadres = [];
        for (let i = 1; i <= 12; i++) { await page.mouse.move(d0.x + (but.x - d0.x) * i / 12, d0.y + (but.y - d0.y) * i / 12); await page.waitForTimeout(40); cadres.push((await lireLecture(page)).cadre); }
        const fixe = cadres.every(c => Math.abs(c.x - l.cadre.x) < 0.5 && Math.abs(c.y - l.cadre.y) < 0.5);
        const l2 = await lireLecture(page);
        check(`${nomM} : la souris va vers le lien (12 pas) : la lecture reste ouverte, à sa place`, fixe && l2.vue && l2.lien && l2.lien.vu, { l: l.cadre, cadres: cadres.map(c => [Math.round(c.x), Math.round(c.y)]) });
        await page.mouse.click(but.x, but.y);
        await page.waitForURL(/index\.html#prix=/, { timeout: 10000 }).catch(() => {});
        const ch = await chemin(page);
        check(`${nomM} : cliquer le lien ouvre le terminal : ${ch}`, ch === adresse('index.html', x.lien), ch);
        await controlerTerminalMarque(page, x.lien, `${nomM} : terminal ouvert par la carte`, deb, erreurs);
        // Le trait a sa bulle (elle n'est pas un texte du budget) : ce qu'il est, et son lien vers la carte, au même prix.
        const pt = await page.evaluate(() => {
          if (!cibleMarque) return null;
          const y = cibleMarque.segs[0][1];
          for (const x of [90, 200, 320, 440, 560, 680]) { const c = guideCibleSous(x, y, geo.mainH, debutant()); if (c === cibleMarque) return { x, y }; }
          return null;
        });
        check(`${nomM} : le trait se vise (un point du trait où il est la seule cible)`, !!pt, pt);
        if (pt) {
          const b = await viserT(page, pt.x, pt.y, false);
          check(`${nomM} : survoler le trait : « Prix venu de la carte · … », et « Voir sur la carte des ordres ▸ » au même prix`, b.titres.some(t => /^Prix venu de la carte · /.test(t)) && !!b.lien && b.lien.url === adresse('bookmap.html', x.lien), b);
        }
      }
      await ctx.close();
    }

    // ── 6. Carte → graphique, au doigt ────────────────────────────────────────
    titre('6. Carte → graphique, au doigt (390 × 844, Lisible)');
    {
      const ctx = await contexte(nav, { vue: { width: 390, height: 844 }, tactile: true }); ouverts.push(ctx);
      const { page, erreurs } = await nouvelOnglet(ctx);
      await page.goto(ORIGINE() + '/bookmap.html');
      await pretCarte(page, true);
      const e = await etatC(page), x = e.debutant.etiquettes.find(q => typeof q.lien === 'number');
      if (!x) check('un repère sur la carte', false, e.debutant.etiquettes);
      else {
        const l = await viserC(page, x.x + x.w / 2, x.y + x.h / 2, true);
        check(`un toucher sur « ${x.texte} » : la lecture épinglée porte « Voir sur le graphique ▸ » → ${l.lien && l.lien.href}`, l.vue && !!l.lien && l.lien.vu && l.lien.href === adresse('index.html', x.lien), l);
        check(`au doigt, le lien est une cible de 32 px de haut au moins (${l.lien && l.lien.r && Math.round(l.lien.r.h)}), dans l'écran`, !!l.lien && !!l.lien.r && l.lien.r.h >= 32 && l.lien.r.x >= 0 && l.lien.r.x + l.lien.r.w <= 390, l.lien);
        check(`toucher le repère ne navigue pas (${await chemin(page)})`, (await chemin(page)) === 'bookmap.html');
        if (l.lien && l.lien.r) await page.touchscreen.tap(l.lien.r.x + l.lien.r.w / 2, l.lien.r.y + l.lien.r.h / 2);
        await page.waitForURL(/index\.html#prix=/, { timeout: 10000 }).catch(() => {});
        const ch = await chemin(page);
        check(`toucher le lien ouvre le terminal : ${ch}`, ch === adresse('index.html', x.lien), ch);
        await controlerTerminalMarque(page, x.lien, 'terminal au doigt', true, erreurs);
      }
      await ctx.close();
    }

    // ── 7. Adresses piégées ou invraisemblables ───────────────────────────────
    titre('7. Adresses piégées ou invraisemblables : ignorées sur les deux pages, sans erreur');
    {
      const ctx = await contexte(nav, { vue: { width: 1440, height: 900 } }); ouverts.push(ctx);
      const MAUVAIS = ['#prix=abc', '#prix=1e9', '#prix=-86000', '#prix=99000', '#prix=70000', '#prix=86000%3Cscript%3Ealert(1)%3C/script%3E', '#prix=<img src=x onerror=alert(1)>', '#prix=' + '9'.repeat(40), '#prix=0', '#prix=86 000'];
      for (const h of MAUVAIS.slice(0, 4)) {
        const { page, erreurs } = await nouvelOnglet(ctx);
        await page.goto(ORIGINE() + '/index.html' + h);
        await pretTerminal(page);
        const d = await dessinT(page);
        check(`terminal ouvert avec « ${h} » : rien de marqué, sans erreur`, d.pm === null && !d.cible && !d.axe && !erreurs.length, { d: { pm: d.pm, cible: d.cible }, erreurs });
        await page.close();
      }
      {
        const { page, erreurs } = await nouvelOnglet(ctx);
        await page.goto(ORIGINE() + '/index.html');
        await pretTerminal(page);
        const pose = async h => { await page.evaluate(h => { location.hash = h; }, h); await page.waitForTimeout(150); return dessinT(page); };
        const acceptes = [];
        for (const h of MAUVAIS) { const d = await pose(h); if (d.pm !== null || d.cible) acceptes.push([h, d.pm]); }
        check(`terminal, l'adresse changée ${MAUVAIS.length} fois vers un prix piégé ou à plus de 10 % : jamais marqué`, !acceptes.length, acceptes);
        let d = await pose('#prix=85900');
        check(`puis « #prix=85900 » : marqué (${d.pm}), étiquette sur l'axe`, d.pm === 85900 && !!d.cible && d.axe, d);
        d = await pose('#prix=abc');
        check('puis « #prix=abc » : effacé', d.pm === null && !d.cible && !d.axe, d);
        const injecte = await page.evaluate(() => !!document.querySelector('img[src="x"], script:not([src])') && [...document.querySelectorAll('script:not([src])')].some(s => /alert/.test(s.textContent)));
        check('rien de l\'adresse n\'est entré dans la page (ni balise, ni script)', !injecte && !erreurs.length, erreurs);
        await page.close();
      }
      for (const h of ['#prix=abc', '#prix=99000', '#prix=-5', '#prix=<b>1</b>']) {
        const { page, erreurs } = await nouvelOnglet(ctx);
        await page.goto(ORIGINE() + '/bookmap.html' + h);
        await pretCarte(page, true);
        const e = await etatC(page), v = e.vue, dp = e.debutant.dernierPrix;
        check(`carte ouverte avec « ${h} » : rien de marqué, la vue de départ (centrée sur le prix du moment), sans erreur`,
          e.marque === null && !e.textes.marque && !!v && dp > v.p1 && dp < v.p2 && !erreurs.length, { marque: e.marque, v, dp, erreurs });
        await page.close();
      }
      {
        const { page, erreurs } = await nouvelOnglet(ctx);
        await page.goto(ORIGINE() + '/bookmap.html');
        await pretCarte(page, true);
        const dp = (await etatC(page)).debutant.dernierPrix, p = Math.round(dp - 250);
        await page.evaluate(h => { location.hash = h; }, '#prix=' + p); await page.waitForTimeout(1500);
        let e = await etatC(page);
        check(`carte, l'adresse devient « #prix=${p} » : marqué, la vue centrée dessus`, !!e.marque && e.marque.p === p && e.marque.posee && Math.abs((e.vue.p1 + e.vue.p2) / 2 - p) < (e.vue.p2 - e.vue.p1) * 0.12, { m: e.marque, v: e.vue });
        await page.evaluate(() => { location.hash = '#prix=abc'; }); await page.waitForTimeout(1500);
        e = await etatC(page);
        check('puis « #prix=abc » : effacé', e.marque === null && !e.textes.marque && !erreurs.length, { m: e.marque, erreurs });
        await page.close();
      }
      await ctx.close();
    }

    // ── 8. Thème ──────────────────────────────────────────────────────────────
    titre('8. Thème : la carte prend le ton du terminal et ses angles carrés, et le suit d\'un onglet à l\'autre');
    {
      // La carte de référence : jamais ouverte par un terminal (aucun thème décrit) — la carte sombre d'avant.
      const ctxR = await contexte(nav, { vue: { width: 1440, height: 900 } }); ouverts.push(ctxR);
      const { page: ref } = await nouvelOnglet(ctxR);
      await ref.goto(ORIGINE() + '/bookmap.html');
      await pretCarte(ref, true);
      const lireTon = pg => pg.evaluate(() => {
        const e = window.__carte.etat(), bg = getComputedStyle(document.body).backgroundColor.match(/\d+/g).slice(0, 3).map(Number);
        const lut = Array.from({ length: 18 }, (_, i) => window.__carte.couleurIntensite(i * 15, 'bid'));
        const mots = [...document.querySelectorAll('[data-mot]')].map(s => s.getAttribute('data-mot') + ':' + s.textContent);

        const options = [...document.querySelectorAll('#rPalette option')].map(o => o.textContent);
        // La chaleur peinte : un échantillon de ses pixels, et la palette d'où ils devraient venir.
        const toutes = new Set(Array.from({ length: 256 }, (_, v) => window.__carte.couleurIntensite(v, 'bid')));
        const w = e.mise.chaleur.w, h = e.mise.chaleur.h, peints = [];
        for (let i = 0; i < 30; i++) for (let j = 0; j < 20; j++) { const c = window.__carte.couleurChaleur(Math.round(w * (i + 0.5) / 30), Math.round(h * (j + 0.5) / 20)); if (c !== null) peints.push(c); }
        return { theme: e.theme, bg, lut, mots, options, peints: peints.length, horsPalette: peints.filter(c => !toutes.has(c)).length };
      }).then(async s => {
        // L'explication (« ? ») : elle dit les couleurs ; ouverte, lue, refermée.
        await pg.keyboard.press('?'); await pg.waitForTimeout(500);
        s.intro = await pg.evaluate(() => { const g = document.getElementById('guideIntro'); return g && !g.hidden ? g.innerText : ''; });
        await pg.click('#guideIntroOk').catch(() => {}); await pg.waitForTimeout(300);
        return s;
      });
      const R0 = await lireTon(ref);
      const lum = c => BM.luminance(c);
      check(`carte sans thème décrit : la carte sombre (ton ${R0.theme.ton}, fond ${R0.bg})`, R0.theme.ton === 'sombre' && lum(R0.bg) < 0.05, R0.theme);

      const ctx = await contexte(nav, { vue: { width: 1440, height: 900 } }); ouverts.push(ctx);
      const { page: T, erreurs: eT } = await nouvelOnglet(ctx);
      await T.goto(ORIGINE() + '/index.html');
      await pretTerminal(T);
      const { page: C, erreurs: eC } = await nouvelOnglet(ctx);
      await C.goto(ORIGINE() + '/bookmap.html');
      await pretCarte(C, true);
      // Revue du 14/10/2026 (C21) : les phrases de couleur de la carte s’écrivent « peu d’ordres », avec ’.
      const clair = async (nom) => {
        const s = await lireTon(C);
        check(`${nom} : ton clair (thème « ${s.theme.terminal} »), fond de page clair (${s.bg}), cadre à l'accent d'Aero (${s.theme.accentCadre})`,
          s.theme.ton === 'clair' && s.theme.terminal === 'aero' && lum(s.bg) > 0.7 && s.theme.accentCadre === '#0b84b0', s.theme);
        check(`${nom} : les mots des couleurs sont ceux du ton clair (${s.mots.join(', ')} ; « ${s.theme.mots.palette} »)`,
          s.mots.includes('maintenant:orange') && s.mots.includes('bandes:foncées') && s.mots.includes('prix:noire') && /^Bleu très pâle : peu d’ordres/.test(s.theme.mots.palette)
          && /Bleu très pâle : peu d’ordres/.test(s.intro) && /trait orange|orange/.test(s.intro) && !/Bleu foncé : peu|blanc : le plus/.test(s.intro) && s.options.some(o => /bleu très pâle → bleu → bleu nuit/.test(o)), { mots: s.mots, intro: s.intro.slice(0, 400), options: s.options });
        check(`${nom} : la chaleur est peinte avec la palette claire (${s.peints} pixels lus, ${s.horsPalette} hors de cette palette)`, s.peints >= 50 && s.horsPalette <= s.peints * 0.05, s);
        return s;
      };
      const S1 = await clair('carte ouverte à côté d\'un terminal Aero');
      check('la palette claire n\'est pas la sombre', JSON.stringify(S1.lut) !== JSON.stringify(R0.lut));
      // Le terminal passe en kala, dans l'autre onglet : la carte suit, sans recharger.
      await T.evaluate(() => appliquerTheme('kala'));
      await C.waitForTimeout(1500);
      const S2 = await lireTon(C);
      check(`le terminal passe en kala dans l'autre onglet : la carte suit sans recharger (ton ${S2.theme.ton}, thème ${S2.theme.terminal}, cadre ${S2.theme.accentCadre}, fond ${S2.bg})`,
        S2.theme.ton === 'sombre' && S2.theme.terminal === 'kala' && S2.theme.accentCadre === '#00e0b8' && lum(S2.bg) < 0.05, S2.theme);
      check('kala : la carte sombre d\'avant — même palette, mêmes couleurs du canevas (fond, prix, repères)',
        JSON.stringify(S2.lut) === JSON.stringify(R0.lut) && S2.theme.fond === R0.theme.fond && S2.theme.accent === R0.theme.accent && S2.theme.prix === R0.theme.prix, { S2: S2.theme, R0: R0.theme });
      check(`kala : les mêmes mots que la carte sombre d'avant (légende : ${S2.mots.join(', ')} ; explication ; options)`,
        JSON.stringify(S2.theme.mots) === JSON.stringify(R0.theme.mots) && JSON.stringify(S2.mots) === JSON.stringify(R0.mots) && S2.intro.length > 100 && S2.intro === R0.intro && JSON.stringify(S2.options) === JSON.stringify(R0.options)
        && /Bleu foncé : peu d’ordres/.test(S2.intro), { mots: [S2.theme.mots, R0.theme.mots, S2.mots, R0.mots], intro: [S2.intro.slice(0, 300), R0.intro.slice(0, 300)], options: [S2.options, R0.options] });
      check(`kala : la chaleur repeinte avec la palette sombre (${S2.peints} pixels lus, ${S2.horsPalette} hors de cette palette)`, S2.peints >= 50 && S2.horsPalette <= S2.peints * 0.05, S2);
      // Thèmes carrés jusqu'au bout (revue du 14/10, M18) : la carte restait arrondie, même ouverte
      // depuis Bureau 95, le thème par défaut. Le terminal passe en Bureau 95 : la carte suit et met
      // tous ses angles à 0 (boutons, pastille « Guide », explication, pastilles dessinées) ; les ronds
      // numérotés restent ronds. De retour en Aero, ses coins d'avant.
      const coins = pg => pg.evaluate(() => {
        const r = s => { const e = document.querySelector(s); return e ? getComputedStyle(e).borderTopLeftRadius : null; };
        const th = window.__carte.etat().theme;
        return { carre: th.carre, rAngle: th.rAngle, retour: r('.retour'), puce: r('.puce'), bouton: r('.bouton'), intro: r('.guide-intro'), select: r('select'), num: r('.intro-liste .num') };
      });
      const arrondis = k => !k.carre && k.rAngle > 6 && k.retour === '8px' && k.puce === '999px' && k.bouton === '8px' && k.intro === '12px' && k.select === '8px' && k.num === '50%';
      const K0 = await coins(C);
      check('kala : la carte garde ses coins arrondis (boutons 8 px, pastille « Guide » en pilule, explication 12 px)', arrondis(K0), K0);
      await T.evaluate(() => appliquerTheme('bureau95'));
      await C.waitForTimeout(1500);
      const K1 = await coins(C);
      check('le terminal passe en Bureau 95 : la carte suit, tous ses angles à 0 (boutons, « Guide », explication, listes, pastilles dessinées), les ronds numérotés gardés',
        K1.carre && K1.rAngle === 0 && ['retour', 'puce', 'bouton', 'intro', 'select'].every(k => K1[k] === '0px') && K1.num === '50%', K1);
      await T.evaluate(() => appliquerTheme('aero'));
      await C.waitForTimeout(1500);
      await clair('retour à Aero dans l\'autre onglet');
      const K2 = await coins(C);
      check('retour à Aero : la carte retrouve ses coins d\'avant', arrondis(K2), K2);
      check('thème suivi : aucune erreur JavaScript (terminal, carte)', !eT.length && !eC.length, { eT, eC });
      await ctx.close(); await ctxR.close();
    }
  } finally {
    for (const c of ouverts) await c.close().catch(() => {});
    await nav.close();
    serveur.close();
  }
  console.log(ko ? `\n❌ LIAISON GRAPHIQUE ↔ CARTE : ${ko} contrôle(s) en échec` : '\n✅ LIAISON GRAPHIQUE ↔ CARTE : TOUS LES CONTRÔLES PASSENT');
  process.exit(ko ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
