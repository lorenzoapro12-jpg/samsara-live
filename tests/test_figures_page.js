// Les figures chartistes dans un vrai navigateur (Chromium, Playwright), sur les bougies RÉELLES de
// la fixture 15 min tronquées à un instant, la dernière étant la bougie EN COURS (plan figures §9.2).
//
// Les instants sont trouvés par le rejeu pur (js/guide.js), pas écrits en dur : la 1re figure de la
// fixture montrée en Débutant comme ébauche, puis formée, puis « à valider », puis validée ; la
// 1re figure montrée puis invalidée.
//   1. ÉBAUCHE : Débutant « … possible » (registre debItem 'forme'), au plus 5 textes, tirets fins et
//      point creux ; Expert : le libellé dit « ébauche » et les comptes mesurés.
//   2. BOUGIE EN COURS : le prix live passe la ligne qui valide, puis revient en ne laissant qu'une
//      mèche : le calque dit « <Nom> à valider » et le GARDE quand le prix revient (le libellé lit
//      le plus haut / le plus bas de la bougie : il ne clignote pas, il garde le nom de la figure) ;
//      la bulle dit « Cela ne compte pas » / « percé en mèche » ; le graphique n'est pas redessiné ;
//      le libellé de la clôture ne change pas.
//   3. CLÔTURES SUCCESSIVES : « … à valider » (1/2), puis « … validé » (2/2) ; Expert : l'objectif
//      théorique est dessiné, ou une flèche au bord s'il est hors de l'échelle.
//   4. INVALIDATION, clôture après clôture DANS UNE MÊME PAGE (le Débutant ne barre que la figure
//      qu'il a dessinée : une page ouverte après coup ne la barre pas) : « ✗ … invalidé » pendant
//      garderInvalide bougies, de plus en plus pâle, puis plus rien ; bulles Expert et Débutant
//      « invalidé à HH:MM » à l'heure de l'appareil (Fmt.heure), sans fuseau écrit, et journal ; une page ouverte APRÈS
//      l'invalidation ne montre pas de ✗ pour une figure qu'elle n'a jamais dessinée.
//   5. BULLES (survol à 1440, toucher à 390) : validation, invalidation, cible et « Mesuré sur »
//      ensemble ; aucun mot banni ; bulle entière dans le tracé ; la ligne qui valide n'est couverte
//      par aucun texte sur plus de 30 % de sa longueur visible (amendement C5).
//   5 bis. CIBLE ET STATISTIQUES (11/10/2026) : la bulle (résumé du Lisible compris) finit par « Cible … ·
//      atteinte X fois sur Y ▸ » ; la toucher ouvre le détail (#fichePop) : cible en gros, réussite
//      mesurée, barre, détail, sans mot banni ; Échap le ferme ; en Complet, un clic sur le libellé aussi.
//      Échantillon faible : aucune barre, « Trop peu de cas » juste sous la phrase ; les exemples
//      passés avant « Les chiffres » ; avec assez de cas, la barre revient (revue du 14/10/2026, M8).
//   5 ter. EXEMPLES PASSÉS (plan du 13/10/2026, idée 4) : dans le détail, les derniers cas de ce type
//      sur ce graphique, sans tri, en petites cartes (le prix avant, pendant et après, l'objectif,
//      l'invalidation, l'issue) dans une bande qu'on fait défiler de côté ; ni la page ni le panneau
//      ne s'élargissent ; carrées dans les thèmes carrés, couleurs du thème ; onze thèmes à 390 px.
//      Aucune ligne du panneau ne coupe un nombre ni ne commence par « : » (revue du 14/10/2026, C8).
//      Le même ordre dans chaque thème, l'alerte collée à la phrase (revue du 14/10/2026, M8).
//   6. Aucune erreur JavaScript ; pas de défilement horizontal à 390 px.
//   7. TEMPS (amendement E2) : le rejeu dans Chromium, processeur ralenti 4 fois, en 1 min (où il
//      revient chaque minute) et en 15 min : ≤ 100 ms à chaque clôture. Le rejeu complet dépassant
//      ce seuil en 15 min, le rejeu est REPRIS d'une clôture à l'autre (Guide.detecter(S, P, avant)) :
//      c'est lui qui est contrôlé, avec le même résultat qu'un rejeu complet ; le complet est affiché.
// Sans Playwright : « non exécuté », dit à l'écran (ce n'est pas un succès).
// USAGE   node tests/test_figures_page.js
const fs = require('fs'), path = require('path'), http = require('http'), vm = require('vm');
const REPO = path.resolve(__dirname, '..');
const G = require(path.join(REPO, 'js/guide.js'));
const Fm = require(path.join(REPO, 'js/format.js'));
const { chargerPage } = require('./bac');
const { coupuresLignes } = require('./fins-de-ligne');

let playwright = null;
for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright', process.env.PLAYWRIGHT_MODULE].filter(Boolean)) {
  try { playwright = require(p); break; } catch (e) { /* suivant */ }
}
if (!playwright) {
  console.log('  − NON EXÉCUTÉ : Playwright introuvable — les figures ne sont pas vérifiées à l\'écran sur ce poste.');
  process.exit(0);
}
let ko = 0;
const check = (nom, ok, det) => { if (!ok) ko++; console.log(`  ${ok ? '✓' : '✗'} ${nom}${!ok && det !== undefined ? ' — ' + JSON.stringify(det).slice(0, 600) : ''}`); };
const titre = t => console.log(`\n── ${t} ──`);
const P = vm.runInContext('PARAM.guide', chargerPage().sandbox);

// ── Les données : fixtures réelles, et le rejeu pur qui choisit les instants ──
const lire = itv => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'bougies-btcusdt-' + itv + '.json'), 'utf8')).bougies.map(k => [Math.round(k[0] / 1000), +k[1], +k[2], +k[3], +k[4], +k[5]]);
const DATA = { '15m': lire('15m'), '1m': lire('1m') };
const PAS = { '1m': 6e4, '15m': 9e5 };
function atrDe(H, L, C, n) {
  const tr = [null];
  for (let i = 1; i < C.length; i++) tr.push(Math.max(H[i] - L[i], Math.abs(H[i] - C[i - 1]), Math.abs(L[i] - C[i - 1])));
  const a = new Array(C.length).fill(null);
  let s = 0; for (let i = 1; i <= n; i++) s += tr[i];
  a[n] = s / n;
  for (let i = n + 1; i < C.length; i++) a[i] = (a[i - 1] * (n - 1) + tr[i]) / n;
  return a;
}
const K = DATA['15m'], H = K.map(x => x[2]), L = K.map(x => x[3]), C = K.map(x => x[4]), A = atrDe(H, L, C, P.atrPeriode);
const R = G.detecter({ h: H, l: L, c: C, atr: A, n: K.length }, P);
const VUE = 50;
// La figure que le Débutant montre quand la bougie en cours est iC (closes 0..iC−1), vue des 50 dernières.
const premiere = iC => G.formesAffichees(Object.assign({}, R, { n: iC }), P, iC + 1 - VUE, iC + 1, 'debutant')[0] || null;
const etatA = (f, j) => (f.ebauche ? 'ebauche' : f.fin && f.jFin <= j ? f.fin : G.phaseA(f, j));
// Séquence 1 : une ébauche montrée, devenue une figure montrée, « à valider », puis validée.
let seq = null;
for (const e of R.ebauches.liste.filter(x => x.fin === 'devenue' && x.devenue && x.devenue.jConf !== null && G.famille(x) === 'extremes')) {
  const f = e.devenue, jD = (f.journal.find(x => x.quoi === 'demi') || {}).j;
  if (!(jD < f.jConf)) continue;
  const iE = e.t0 + 1, iF = f.t + 1, iD = jD + 1, iCf = f.jConf + 1;
  if (iE < 400 || !(iE < iF && iF < iD && iD < iCf)) continue;
  if (premiere(iE) === e && premiere(iF) === f && premiere(iD) === f && premiere(iCf) === f && iCf + 1 < K.length) { seq = { e, f, iE, iF, iD, iC: iCf }; break; }
}
// Expert : un instant où une ébauche est parmi les figures montrées (la 1re figure du Débutant
// n'est pas forcément celle que l'Expert met en avant).
const expertA = iC => G.formesAffichees(Object.assign({}, R, { n: iC }), P, iC + 1 - VUE, iC + 1, 'expert');
let ebX = null;
for (const e of R.ebauches.liste) {
  const iC = e.t0 + 1;
  if (iC >= 400 && iC + 1 < K.length && expertA(iC).includes(e)) { ebX = { e, iC }; break; }
}
// Séquence 2 : une figure montrée, puis invalidée (✗) ; montrée garderInvalide bougies, puis plus.
let inv = null;
for (const f of R.formes.filter(x => (x.fin === 'invalide' || x.fin === 'invalide_avant') && x.jFin + P.garderInvalide + 3 < K.length)) {
  const iI = f.jFin + 1;
  if (iI < 400) continue;
  if (premiere(iI - 1) === f && premiere(iI) === f) { inv = { f, iI }; break; }
}

// ── Binance simulé sur la fixture, à l'instant voulu ──
const etatLive = { itv: '15m', iC: 0, live: null };
function binance(url) {
  const u = new URL(url), q = u.searchParams, itv = q.get('interval') || etatLive.itv, k = DATA[itv] || DATA['15m'], pas = PAS[itv] || 9e5;
  const iC = itv === etatLive.itv ? etatLive.iC : k.length - 1, x = k[iC], live = etatLive.live != null && itv === etatLive.itv ? etatLive.live : x[4];
  if (u.pathname.endsWith('/klines')) {
    const lim = Math.min(1000, +q.get('limit') || 500), fin = q.get('endTime') ? +q.get('endTime') : Infinity;
    const cours = [x[0], x[1], Math.max(x[1], live), Math.min(x[1], live), live, x[5]];
    const serie = k.slice(0, iC).concat([cours]).filter(y => y[0] * 1000 <= fin);
    return serie.slice(-lim).map(y => [y[0] * 1000, String(y[1]), String(y[2]), String(y[3]), String(y[4]), String(y[5]), y[0] * 1000 + pas - 1, String(y[5] * y[4]), 100, String(y[5] / 2), String(y[5] * y[4] / 2), '0']);
  }
  if (u.pathname.endsWith('/ticker/24hr')) return { symbol: 'BTCUSDT', lastPrice: String(live), openPrice: String(k[Math.max(0, iC - 96)][1]), priceChangePercent: '0', highPrice: String(live * 1.01), lowPrice: String(live * 0.99), volume: '1000', quoteVolume: '1e9', count: 100 };
  if (u.pathname.endsWith('/ticker/price')) return { price: String(live) };
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

async function ouvrir(nav, o) {
  const itv = o.itv || '15m', k = DATA[itv], iC = o.iC != null ? o.iC : k.length - 1;
  Object.assign(etatLive, { itv, iC, live: o.live != null ? o.live : null });
  const tactile = o.w < 500;
  const ctx = await nav.newContext({ viewport: { width: o.w || 1440, height: o.h || 900 }, deviceScaleFactor: 1, hasTouch: tactile, isMobile: tactile });
  await ctx.clock.install({ time: k[iC][0] * 1000 + Math.round(PAS[itv] * 0.6) });
  const page = await ctx.newPage();
  const erreurs = [];
  page.on('pageerror', e => erreurs.push(e.message));
  await page.route('**/*', r => {
    const u = r.request().url(), h = new URL(u).host, cors = { 'access-control-allow-origin': '*' };
    if (h.startsWith('127.0.0.1')) return r.continue();
    if (h === 'api.binance.com' || h === 'data-api.binance.vision') return r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(binance(u)) });
    if (h === 'raw.githubusercontent.com') return r.fulfill({ status: 404, headers: cors, body: '' });
    return r.abort();
  });
  await page.addInitScript(([m, t]) => { try { localStorage.clear(); localStorage.setItem('samsara-theme', t); localStorage.setItem('samsara-mode', m); localStorage.setItem('samsara-scenarios-v1', '0'); } catch (e) { /* */ } }, [o.mode || 'debutant', o.theme || 'aero']);
  await page.goto(`http://127.0.0.1:${serveur.address().port}/index.html`);
  await page.waitForFunction(() => typeof candles !== 'undefined' && candles.length > 100 && typeof guideEtat !== 'undefined' && guideEtat, null, { timeout: 15000 }).catch(() => {});
  if (itv !== '15m') {
    await page.evaluate(i => { const l = document.getElementById('int_' + i); changeInterval(i, l || document.createElement('label')); }, itv);
    await page.waitForFunction(i => chartInterval === i && candles.length > 100, itv, { timeout: 15000 }).catch(() => erreurs.push('intervalle ' + itv + ' non pris'));
  }
  await page.waitForTimeout(1200);
  await page.evaluate(v => { viewEnd = candles.length; viewStart = Math.max(0, candles.length - v); drawChart(); }, VUE);
  await page.waitForTimeout(300);
  return { ctx, page, erreurs };
}
/** Les exemples passés du panneau des statistiques (idée 4 du 13/10/2026) : la phrase, la bande, ses
 *  cartes (taille, rayon, SVG, légende), les couleurs de l'objectif et de l'invalidation, les débords. */
const lireExemples = page => page.evaluate(() => {
  const p = document.getElementById('fichePop'), b = p.querySelector('.stats-exemples'), S = window.__statsFigure || { dernieres: [] }, rp = p.getBoundingClientRect();
  const couleur = v => { const e = document.createElement('i'); e.style.color = 'var(' + v + ')'; p.appendChild(e); const c = getComputedStyle(e).color; e.remove(); return c; };
  const phrases = [...p.querySelectorAll('.stats-phrase')].map(x => x.textContent);
  const rb = b && b.getBoundingClientRect(), obj = b && b.querySelector('.ex-objectif'), inv = b && b.querySelector('.ex-inval');
  const cartes = b ? [...b.querySelectorAll('.stats-exemple')].map(c => {
    const r = c.getBoundingClientRect(), st = getComputedStyle(c), svg = c.querySelector('svg'), fc = c.querySelector('figcaption');
    return { w: r.width, h: r.height, rayon: parseFloat(st.borderTopLeftRadius) || 0, svg: !!svg && svg.getAttribute('role') === 'img' && !!svg.querySelector('title'),
      legende: fc ? fc.textContent : '', anim: st.animationName !== 'none' || parseFloat(st.transitionDuration) > 0 };
  }) : [];
  return { n: S.dernieres.length, dernieres: S.dernieres.map(d => ({ quand: d.quand, marque: d.marque })), phrases, cartes,
    bande: b && { large: b.scrollWidth, client: b.clientWidth, g: rb.left, d: rb.right, defile: getComputedStyle(b).overflowX, snap: getComputedStyle(b).scrollSnapType, focus: b.tabIndex === 0 },
    panneau: { g: rp.left, d: rp.right }, page: document.documentElement.scrollWidth - innerWidth, bulle: p.scrollWidth - p.clientWidth,
    couleurs: obj && inv ? { objectif: getComputedStyle(obj).stroke, inval: getComputedStyle(inv).stroke, up: couleur('--up-ink'), down: couleur('--down-ink') } : null,
    rTile: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--r-tile')) || 0, texte: p.innerText };
});
/** La bande dit les derniers cas (sans tri), un par carte, chacun avec son SVG et sa légende (date,
 *  issue) ; elle défile de côté sans élargir ni le panneau ni la page ; aucun cas : une phrase. */
function exemplesOk(ex, tactile) {
  const bannis = G.motsBannis(ex.texte);
  if (bannis.length) return false;
  if (!ex.n) return ex.phrases.includes('Aucun cas fini sur ce graphique.') && !ex.bande;
  const B = ex.bande;
  return ex.phrases.includes('Les derniers cas sur ce graphique, sans tri :') && !!B && ex.cartes.length === ex.n && B.defile === 'auto' && /x/.test(B.snap) && B.focus
    && ex.cartes.every((c, k) => c.svg && c.h >= 40 && c.w >= 130 && c.w <= 150 && c.legende.includes(ex.dernieres[k].quand) && c.legende.includes(ex.dernieres[k].marque))
    && B.g >= ex.panneau.g - 0.5 && B.d <= ex.panneau.d + 0.5 && ex.bulle <= 1 && (!tactile || ex.page <= 0)
    && (ex.n < 3 || B.large > B.client);   // trois cartes ne tiennent pas de front : la bande défile
}
/** L'ordre du panneau des statistiques ouvert (revue du 14/10/2026, M8) : ses parties dans l'ordre
 *  (titres h4, phrases, alerte, barres, légende), la place de l'alerte sous la phrase à l'écran, et
 *  le même panneau rendu comme s'il y avait assez de cas (S.faible faux) : ses barres reviennent. */
const lireOrdre = page => page.evaluate(() => {
  const p = document.getElementById('fichePop'), S = window.__statsFigure;
  const nom = e => e.tagName === 'H4' ? 'h4:' + e.textContent.trim() : e.classList.contains('fiche-alerte') ? 'alerte' : e.classList.contains('stats-barre') ? 'barre'
    : e.classList.contains('stats-legende') ? 'legende' : e.classList.contains('stats-phrase') ? 'phrase' : e.className || e.tagName.toLowerCase();
  const enfants = [...p.children], ordre = enfants.map(nom), i = ordre.indexOf('h4:Sur ce graphique');
  const r = k => enfants[k] && enfants[k].getBoundingClientRect();
  const sous = i >= 0 && ordre[i + 2] === 'alerte' ? Math.round(r(i + 2).top - r(i + 1).bottom) : null;
  const t = document.createElement('template'); t.innerHTML = S && S.taux ? statsFigureHtml(Object.assign({}, S, { faible: false }), null) : '';
  return { faible: !!(S && S.faible), finis: S && S.taux ? S.taux.finis : 0, temoin: !!(S && S.temoin), annees: !!(S && S.annees), ordre, sous,
    assez: { barres: t.content.querySelectorAll('.stats-barre').length, alertes: t.content.querySelectorAll('.fiche-alerte').length } };
});
/** Échantillon faible : ni barre ni légende, « Trop peu de cas » juste sous la phrase (à moins de
 *  16 px) ; les exemples passés avant « Les chiffres » ; la mesure sur des années avant « Sur ce
 *  graphique » ; avec assez de cas, la barre des issues (et celle du témoin) revient, sans alerte. */
function ordreOk(o) {
  const O = o.ordre, i = O.indexOf('h4:Sur ce graphique'), ex = O.indexOf('h4:Exemples passés'), ch = O.indexOf('h4:Les chiffres');
  if (i < 0 || O[i + 1] !== 'phrase' || ex < 0 || ch < 0 || ex > ch) return false;
  if (o.annees && !(O.indexOf('h4:Sur des années') >= 0 && O.indexOf('h4:Sur des années') < i)) return false;
  if (o.faible && (O[i + 2] !== 'alerte' || O.includes('barre') || O.includes('legende') || o.sous === null || o.sous > 16)) return false;
  if (!o.faible && O.includes('alerte')) return false;
  return !o.finis || (o.assez.barres >= (o.temoin ? 2 : 1) && !o.assez.alertes);
}
/** L'état des figures dans la page : registre Débutant, figures dessinées, styles, libellés. */
const lireEtat = page => page.evaluate(() => {
  const E = guideEtat;
  if (!E) return null;
  const fig = x => ({ type: x.f.type, cle: Guide.etatForme(x.f).cle, ebauche: !!x.f.ebauche, dash: x.tr.st.dash, a: x.tr.st.a, creux: !!x.tr.geo.creux, croix: !!x.tr.croix,
    objectif: x.tr.objectif || null, fleche: x.tr.fleche || null, lignes: x.lignes || null, t: x.t || null, vivant: x.texteVivant || null, pastille: x.pastille || null, v: x.v ? x.v.cle : null });
  return { n: candles.length, deb: !!E.deb, items: debEtat ? debEtat.items.map(i => ({ role: i.role, texte: i.texte, rect: i.rect })) : null,
    figures: (E.figures || []).map(fig), debForme: E.debForme ? fig(E.debForme) : null, mainH: geo.mainH, top: geoPrix.top, ph: geoPrix.ph };
});
/** Survole (ou touche) le libellé de la figure ; rend la bulle. En Débutant, la bulle montre
 *  d'abord son résumé : un 2e toucher (ou un clic) ouvre le détail, qui est rendu ici. */
async function bulle(o, tactile) {
  const pt = await o.page.evaluate(() => {
    const E = guideEtat, b = canvas.getBoundingClientRect();
    const c = E.cibles.find(x => x.figure && x.rects && x.rects.length);
    return c ? { x: b.left + (c.rects[0].x0 + c.rects[0].x1) / 2, y: b.top + (c.rects[0].y0 + c.rects[0].y1) / 2, deb: debutant() } : null;
  });
  if (!pt) return null;
  if (tactile) await o.page.touchscreen.tap(pt.x, pt.y);
  else { await o.page.mouse.move(pt.x - 8, pt.y - 3); await o.page.mouse.move(pt.x, pt.y, { steps: 3 }); }
  await o.page.waitForTimeout(350);
  if (pt.deb && await o.page.evaluate(() => !!(guideEtat.bulle && guideEtat.bulle.resume))) {
    if (tactile) await o.page.touchscreen.tap(pt.x, pt.y); else await o.page.mouse.click(pt.x, pt.y);
    await o.page.waitForTimeout(350);
  }
  return o.page.evaluate(() => {
    const E = guideEtat;
    return E.survol && E.survol.figure ? { titre: E.survol.titre, corps: E.bulle ? E.bulle.corps.join(' ') : '', texte: E.survol.texte.join(' '), b: E.bulle ? { y: E.bulle.y, h: E.bulle.h } : null, mainH: geo.mainH } : null;
  });
}

(async () => {
  await new Promise(r => serveur.listen(0, '127.0.0.1', r));
  const nav = await playwright.chromium.launch();
  try {
    titre('Instants trouvés par le rejeu pur');
    check('séquence 1 trouvée : ébauche → figure → à valider → validée, montrée chaque fois en Débutant', !!seq, null);
    check(`Expert : une ébauche montrée trouvée${ebX ? ' (' + ebX.e.type + ', bougie ' + (ebX.iC - 1) + ')' : ''}`, !!ebX, null);
    check(`séquence 2 trouvée : figure montrée puis invalidée${inv ? ' (' + inv.f.type + ', bougie ' + inv.f.jFin + ')' : ''}`, !!inv, null);
    if (!seq || !inv) throw new Error('instants introuvables');
    const nom = G.NOM_FORME_DEBUTANT[seq.f.type];
    console.log(`  · ${seq.f.type} : ébauche ${seq.iE - 1}, repérée ${seq.iF - 1}, 1/2 ${seq.iD - 1}, confirmée ${seq.iC - 1}`);

    // ── 1. Ébauche ──
    titre('1. Ébauche');
    {
      const o = await ouvrir(nav, { iC: seq.iE, mode: 'debutant', w: 1440, h: 900 });
      const e = await lireEtat(o.page);
      const forme = e.items.find(i => i.role === 'forme');
      check(`Débutant : « ${nom} possible » posé (registre « forme »), au plus 5 textes`, forme && e.debForme && e.debForme.t === nom + ' possible' && e.items.length <= 5, e.items);
      check('… tracé en tirets fins [3,3] avec un point creux (le dernier point n’est pas encore acquis)', e.debForme && e.debForme.ebauche && JSON.stringify(e.debForme.dash) === '[3,3]' && e.debForme.creux, e.debForme);
      check('aucune erreur JavaScript', !o.erreurs.length, o.erreurs);
      await o.ctx.close();
      const x = await ouvrir(nav, { iC: ebX ? ebX.iC : seq.iE, mode: 'expert', w: 1440, h: 900 });
      const ex = await lireEtat(x.page);
      const fe = ex.figures.find(f => f.ebauche);
      // Avec « Le détail » (option A du 11/10/2026) : sur le tracé, le repère court d'une ligne ; le
      // libellé entier (« ébauche », comptes mesurés) est dans la bulle de la figure et dans la liste.
      const bulleE = await x.page.evaluate(() => { const c = guideEtat.cibles.find(q => q.figure && q.figure.f.ebauche); return c ? [c.titre].concat(c.texte || []).join(' ') : null; });
      check('Expert : repère court d\'une ligne sur le tracé (le nom de la figure, ≤ 24 caractères)', fe && fe.lignes && fe.lignes.length === 1 && fe.lignes[0].length <= 24, ex.figures);
      check('Expert : la bulle dit « ébauche » et les comptes mesurés (« Mesuré · hist. … : N repérés · M valid. », ou « N repérées » pour une figure à deux droites)', bulleE && /ébauche/.test(bulleE) && /Mesuré · hist\. [^:]*: \d+ repéré(e)?s.*( · \d+ valid\.| · sorties)/.test(bulleE), bulleE);
      await x.ctx.close();
    }

    // ── 2. La bougie en cours : ligne passée, puis mèche ; sans redessin du graphique ──
    titre('2. Bougie en cours : ligne passée, puis mèche — le libellé garde le nom de la figure');
    {
      const o = await ouvrir(nav, { iC: seq.iF, mode: 'debutant', w: 1440, h: 900 });
      const r = await o.page.evaluate(() => {
        const x = guideEtat.debForme;
        if (!x) return null;
        const f = x.f, n = candles.length, N = Guide.niveauxFigure(f, n - 1, PARAM.guide), s = N.sorties[0];
        window.__dc = 0; const d0 = window.drawChart; window.drawChart = function () { window.__dc++; return d0.apply(this, arguments); };
        const base = x.t, cur = candles[n - 1], h0 = cur.high, l0 = cur.low;
        // Le prix live passe la ligne qui valide (comme un tick de fetchPrice : calque seul).
        const au = s.seuil + s.s * Math.max(5, Math.abs(s.seuil) * 0.0005);
        if (s.s > 0) cur.high = Math.max(cur.high, au); else cur.low = Math.min(cur.low, au);
        livePrice = au; prixSurGraphique();
        const a = { t: x.texteVivant, item: guideEtat.debForme.item.texte, vivant: Guide.texteVivantFigure(f, x.v, guideEtat.ctxF, 'debutant', guideUnite()) };
        // Il revient : seule la mèche de la bougie en cours est restée au-delà.
        livePrice = s.ligne - s.s * Math.max(5, Math.abs(s.ligne) * 0.0005); prixSurGraphique();
        const b = { t: x.texteVivant, vivant: Guide.texteVivantFigure(f, x.v, guideEtat.ctxF, 'debutant', guideUnite()), expert: Guide.texteVivantFigure(f, x.v, guideEtat.ctxF, 'expert', guideUnite()) };
        cur.high = h0; cur.low = l0;
        return { base, apres: x.t, a, b, dc: window.__dc };
      });
      // Changement voulu (revue des figures) : l'ancien libellé « Ligne passée, à confirmer » puis
      // « Passé et revenu, à suivre » perdait le nom de la figure et clignotait quand le prix
      // oscillait autour de la ligne ; le libellé garde désormais le nom et ne revient pas en arrière
      // avant la clôture.
      // L'heure dite : la fin de la bougie en cours, à l'heure de l'appareil (Fmt.heure ; Node et Chromium lisent le même fuseau).
      const hFinF = Fm.heure((K[seq.iF][0] + 900) * 1000);
      check(`le prix live au-delà de la ligne qui valide : le calque dit « ${nom} à valider » ; la bulle « Si … finit … (à ${hFinF}) »`, r && r.a.t === nom + ' à valider' && r.a.item === r.a.t && r.a.vivant.indexOf('En ce moment le prix est ') === 0 && / finit /.test(r.a.vivant) && r.a.vivant.includes('(à ' + hFinF + ')') && !/UTC|Paris/.test(r.a.vivant), r);
      // (Changé exprès, revue des figures 2 : « … à confirmer » restait affiché alors que le prix était
      // revenu dedans — une mèche seule ne valide rien ; le libellé garde le nom et dit « revenu ».)
      check('il revient, une mèche reste : le libellé garde le nom et dit « revenu » (plus « à valider ») ; « Cela ne compte pas » (Débutant), « percé en mèche » (Expert)', r && (r.b.t === nom + ' : revenu dedans' || r.b.t === nom + ' : revenu') && r.b.t !== r.a.t && /Cela ne compte pas/.test(r.b.vivant) && /percé en mèche/.test(r.b.expert), r && r.b);
      check('… sans redessiner le graphique (calque seul), et le libellé de la clôture ne change pas', r && r.dc === 0 && r.base === r.apres, r && { dc: r.dc, base: r.base, apres: r.apres });
      check('aucune erreur JavaScript', !o.erreurs.length, o.erreurs);
      await o.ctx.close();
    }

    // ── 3. Clôtures successives ──
    titre('3. Clôtures successives : 1/2 puis 2/2');
    {
      const o = await ouvrir(nav, { iC: seq.iD, mode: 'debutant', w: 1440, h: 900 });
      const e = await lireEtat(o.page);
      check(`1 clôture au-delà : « ${G.libelleFormeDebutant(Object.assign({}, seq.f, { phase: 'formation', fin: null, demi: true }))} »`, e.debForme && e.debForme.cle === 'demi' && /à valider$/.test(e.debForme.t), e.debForme);
      await o.ctx.close();
      const o2 = await ouvrir(nav, { iC: seq.iC, mode: 'debutant', w: 1440, h: 900 });
      const e2 = await lireEtat(o2.page);
      check(`2 clôtures au-delà : « ${nom} validé » (traits pleins)`, e2.debForme && e2.debForme.cle === 'confirme' && e2.debForme.t === nom + ' validé' && !e2.debForme.dash.length, e2.debForme);
      await o2.ctx.close();
      const x = await ouvrir(nav, { iC: seq.iC, mode: 'expert', w: 1440, h: 900 });
      const ex = await lireEtat(x.page);
      const fc = ex.figures.find(f => f.cle === 'confirme' && f.type === seq.f.type);
      check('Expert : l’objectif théorique est dessiné (ligne dans l’échelle, ou flèche au bord avec son prix)', fc && fc.objectif && (fc.objectif.dansVue || fc.objectif.fleche), fc);
      check('aucune erreur JavaScript', !x.erreurs.length, x.erreurs);
      await x.ctx.close();
    }

    // ── 4. Invalidation et effacement, clôture après clôture dans une même page ──
    // Changement voulu (revue des figures) : le Débutant ne barre (✗) que la figure qu'il a dessinée
    // à la clôture d'avant son issue (mémoire de la page). Le test n'ouvre donc plus une page neuve
    // à chaque instant : il ouvre la page avant l'invalidation et fait avancer les clôtures dedans.
    titre('4. Invalidation : ✗ pendant ' + P.garderInvalide + ' bougies, de plus en plus pâle, puis plus rien');
    {
      // Le mot de l'issue : « raté » après la validation, « annulé » avant (changé exprès, revue du
      // 14/10/2026, M5 : plus « invalidé »).
      const nomI = G.NOM_FORME_DEBUTANT[inv.f.type], alphas = [], mot = G.motEchec(inv.f), Mot = mot.charAt(0).toUpperCase() + mot.slice(1);
      let okLib = true, vuApres = null, avant = null;
      const o = await ouvrir(nav, { iC: inv.iI - 1, mode: 'debutant', w: 1440, h: 900 });
      await o.page.evaluate(rows => { window.__K = rows; }, K);
      const avancer = iC => o.page.evaluate(([iC, v]) => {
        const K = window.__K, o0 = K.findIndex(y => y[0] === candles[0].time), x = K[iC];
        const cours = { time: x[0], open: x[1], high: Math.max(x[1], x[4]), low: Math.min(x[1], x[4]), close: x[4], volume: x[5] };
        candles = K.slice(o0, iC).map(y => ({ time: y[0], open: y[1], high: y[2], low: y[3], close: y[4], volume: y[5] })).concat([cours]);
        viewEnd = candles.length; viewStart = Math.max(0, viewEnd - v); livePrice = x[4]; memoCache.clear(); drawChart();
      }, [iC, VUE]);
      avant = await lireEtat(o.page);
      for (let k = 0; k <= P.garderInvalide + 1; k++) {
        await avancer(inv.iI + k);
        const e = await lireEtat(o.page);
        if (k <= P.garderInvalide) {
          if (!(e.debForme && e.debForme.t === '✗ ' + nomI + ' ' + mot && e.debForme.croix)) okLib = false;
          alphas.push(e.debForme ? e.debForme.a : null);
        } else vuApres = e.debForme;
        if (k === 0) {
          const b = await bulle(o, false);
          const hInv = Fm.heure(K[inv.iI][0] * 1000);
          check(`bulle Débutant : « ${Mot} à ${hInv} » (heure de l’appareil), jamais « UTC » ni « heure de Paris », ni « invalidé » ni « ne tient plus »`, b && b.texte.includes(Mot + ' à ' + hInv + ' :') && !/UTC|Paris/.test(b.texte) && !/[Ii]nvalidé|ne tient plus|tombée/.test(b.texte), b && b.texte.slice(0, 300));
          await o.page.mouse.move(2, 2);
        }
      }
      check(`la figure est dessinée vivante à la clôture d’avant (« ${avant && avant.debForme ? avant.debForme.t : '—'} »)`, avant && avant.debForme && avant.debForme.type === inv.f.type && !avant.debForme.croix, avant && avant.debForme);
      check(`« ✗ ${nomI} ${mot} » avec sa croix pendant ${P.garderInvalide} bougies`, okLib, alphas);
      check('… de plus en plus pâle (alpha lu dans l’état de dessin), puis plus rien', alphas.every((a, k) => a !== null && (!k || a < alphas[k - 1])) && (!vuApres || vuApres.t !== '✗ ' + nomI + ' ' + mot), { alphas, vuApres });
      check('aucune erreur JavaScript', !o.erreurs.length, o.erreurs);
      await o.ctx.close();
      // Une page ouverte après coup n'a pas vu la figure vivante : pas de ✗ pour elle.
      const neuve = await ouvrir(nav, { iC: inv.iI, mode: 'debutant', w: 1440, h: 900 });
      const en = await lireEtat(neuve.page);
      check('une page ouverte après l’invalidation ne barre pas une figure qu’elle n’a jamais dessinée', !(en.debForme && en.debForme.croix), en.debForme);
      await neuve.ctx.close();
      const x = await ouvrir(nav, { iC: inv.iI, mode: 'expert', w: 1440, h: 900 });
      const b = await bulle(x, false);
      const hInvX = Fm.heure(K[inv.iI][0] * 1000);
      check(`bulle Expert : « ${mot} à ${hInvX} » (heure de l’appareil, sans « UTC » ni « Paris ») et le journal (« Observé »)`, b && b.texte.includes(mot + ' à ' + hInvX + ' :') && !/UTC|Paris/.test(b.texte) && /Observé/.test(b.texte) && !/[Ii]nvalidé/.test(b.texte), b && b.texte.slice(0, 400));
      check('aucune erreur JavaScript', !x.erreurs.length, x.erreurs);
      await x.ctx.close();
    }

    // ── 5. Bulles, ligne qui valide, défilement ──
    titre('5. Bulles au survol (1440) et au toucher (390), ligne qui valide visible');
    for (const [w, h, theme] of [[1440, 900, 'aero'], [390, 844, 'aero'], [390, 844, 'kala'], [390, 844, 'bureau95']]) {
      const tactile = w < 500;
      const o = await ouvrir(nav, { iC: seq.iF, mode: 'debutant', w, h, theme });
      const c5 = await o.page.evaluate(() => {
        const x = guideEtat.debForme, g = geoPrix;
        if (!x) return null;
        const S = x.segsV, rects = debEtat.items.map(i => i.rect).filter(Boolean);
        const astuce = document.getElementById('astuceTap'), cb = canvas.getBoundingClientRect();
        if (astuce && !astuce.hidden) { const a = astuce.getBoundingClientRect(); rects.push({ x: a.left - cb.left, y: a.top - cb.top, w: a.width, h: a.height }); }
        let vis = 0, couv = 0;
        for (const s of S) {
          const n = Math.max(2, Math.ceil(Math.hypot(s[2] - s[0], s[3] - s[1]) / 2));
          for (let k = 0; k <= n; k++) {
            const px = s[0] + (s[2] - s[0]) * k / n, py = s[1] + (s[3] - s[1]) * k / n;
            if (px < g.left || px > g.W - g.right || py < g.top || py > g.top + g.ph) continue;
            vis++;
            if (rects.some(r => px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h)) couv++;
          }
        }
        return { vis, couv, scroll: document.documentElement.scrollWidth - window.innerWidth };
      });
      check(`${w} px · ${theme} : la ligne qui valide est dans le tracé, aucun texte n’en couvre plus de 30 %`, c5 && c5.vis > 0 && c5.couv <= 0.3 * c5.vis, c5);
      const b = await bulle(o, tactile);
      const bannis = b ? G.motsBannis(b.corps) : null;
      check(`${w} px · ${theme} : ${tactile ? 'toucher' : 'survol'} du libellé → bulle avec validation, invalidation, cible et « Mesuré sur », sans mot banni, entière dans le tracé`,
        b && /validée/.test(b.texte) && /Annulée si|la figure est ratée/.test(b.texte) && /objectif théorique/i.test(b.texte) && !/cible/i.test(b.texte) && /Mesuré sur/.test(b.texte) && !bannis.length && b.b && b.b.y >= 0 && b.b.y + b.b.h <= b.mainH,
        b && { bannis, b: b.b, mainH: b.mainH, texte: b.texte.slice(0, 300) });
      if (tactile) check(`${w} px : pas de défilement horizontal`, c5 && c5.scroll <= 0, c5);
      check(`${w} px · ${theme} : aucune erreur JavaScript`, !o.erreurs.length, o.erreurs);
      await o.ctx.close();
    }

    // ── 5 bis. Cible et statistiques (demande du 11/10/2026) ──
    titre('5 bis. La ligne « Cible … · atteinte X fois sur Y ▸ » au bas de la bulle, et le détail qu’elle ouvre');
    for (const [mode, w, h] of [['debutant', 1440, 900], ['debutant', 390, 844], ['expert', 1440, 900]]) {
      const tactile = w < 500;
      const o = await ouvrir(nav, { iC: seq.iC + 2, mode, w, h });
      // Le résumé du Lisible (1er toucher) porte déjà la ligne ; bulle() ouvre ensuite le détail.
      const pt = await o.page.evaluate(() => { const b = canvas.getBoundingClientRect(), c = guideEtat.cibles.find(x => x.figure && x.rects && x.rects.length); return c ? { x: b.left + (c.rects[0].x0 + c.rects[0].x1) / 2, y: b.top + (c.rects[0].y0 + c.rects[0].y1) / 2 } : null; });
      if (pt && tactile) await o.page.touchscreen.tap(pt.x, pt.y); else if (pt) { await o.page.mouse.move(pt.x - 8, pt.y - 3); await o.page.mouse.move(pt.x, pt.y, { steps: 3 }); }
      await o.page.waitForTimeout(350);
      const r1 = await o.page.evaluate(() => ({ resume: !!(guideEtat.bulle && guideEtat.bulle.resume), lien: lienBulle && lienBulle.action ? { texte: lienBulle.texte, rect: lienBulle.rect, bulle: lienBulle.bulle } : null,
        attendu: (() => { const c = guideEtat.survol; return c && c.figure ? Guide.resumeStatsFigure(c.figure.f, GUIDE_FORMES.val.bilan[c.figure.f.type], guideEtat.ctxF, PARAM.guide, guideUnite()) : null; })(),
        aide: (() => { const a = document.getElementById('astuceTap'); if (!a || a.hidden || !a.offsetParent) return null; const r = a.getBoundingClientRect(), cb = canvas.getBoundingClientRect(); return { x: r.left - cb.left, y: r.top - cb.top, w: r.width, h: r.height }; })() }));
      const L1 = r1.lien;
      check(`${mode} ${w} px · ${mode === 'debutant' ? 'résumé (1er ' + (tactile ? 'toucher' : 'survol') + ')' : 'survol'} : la bulle finit par « ${L1 && L1.texte} » (la cible et le taux mesuré), dans la bulle`,
        L1 && L1.texte === r1.attendu && /^Objectif .+ \$.* · (ces figures : sens prévu \d+ sur 10|sur ce graphique : atteint \d+ fois sur \d+).* ▸$/.test(L1.texte) && L1.rect.y + L1.rect.h <= L1.bulle.y + L1.bulle.h + 8 && (mode === 'expert' || r1.resume), r1);
      if (r1.aide && L1) check(`${mode} ${w} px : la touche « ? » ne couvre pas la bulle`, !(L1.bulle.x < r1.aide.x + r1.aide.w && L1.bulle.x + L1.bulle.w > r1.aide.x && L1.bulle.y < r1.aide.y + r1.aide.h && L1.bulle.y + L1.bulle.h > r1.aide.y), r1);
      // Toucher (cliquer) la ligne : le détail s'ouvre, la page ne change pas.
      const cible = await o.page.evaluate(() => { const b = canvas.getBoundingClientRect(), R = lienBulle.rect; return { x: b.left + R.x + R.w / 2, y: b.top + R.y + R.h / 2 }; });
      if (tactile) await o.page.touchscreen.tap(cible.x, cible.y); else { await o.page.mouse.move(cible.x, cible.y, { steps: 6 }); await o.page.waitForTimeout(120); await o.page.mouse.click(cible.x, cible.y); }
      await o.page.waitForTimeout(300);
      const d = await o.page.evaluate(() => { const p = document.getElementById('fichePop'), r = p.getBoundingClientRect(); return { ouvert: !p.hidden, texte: p.innerText, prix: [...p.querySelectorAll('.stats-prix')].map(x => x.textContent), barres: p.querySelectorAll('.stats-barre').length, S: window.__statsFigure,
        dedans: r.left >= 0 && r.right <= innerWidth + 0.5 && r.top >= 0 && r.bottom <= innerHeight + 0.5, chemin: location.pathname.replace(/^.*\//, ''), scroll: document.documentElement.scrollWidth - innerWidth }; });
      // Le tableau s'intitule « Les chiffres » : « Le détail » ne nomme plus que la case (revue du 14/10/2026, M9).
      // Sa barre seulement s'il y a assez de cas (revue du 14/10/2026, M8 : la barre de 4 cas était
      // la chose la plus voyante du panneau).
      check(`${mode} ${w} px : la ligne ouvre « ${d.S && d.S.titre} » : l’objectif de la figure en gros (${d.prix.join(' / ')}), sur des années si mesuré, la réussite mesurée (${d.S && d.S.faible ? 'échantillon faible : sans barre' : 'et sa barre'}), les chiffres, sans mot banni, dans l’écran, sans changer de page`,
        d.ouvert && d.S && d.prix.length >= 1 && d.prix.length === d.S.cibles.length && (d.S.faible ? d.barres === 0 : d.barres >= 1) && /Sur ce graphique/i.test(d.texte) && /Objectif de la figure/i.test(d.texte) && (!d.S.annees || /Sur des années/i.test(d.texte)) && !/cible/i.test(d.texte) && /Les chiffres/i.test(d.texte)
        && /usage des analystes/.test(d.texte) && !G.motsBannis(d.texte).length && d.dedans && d.chemin === 'index.html' && (!tactile || d.scroll <= 0), { d: Object.assign({}, d, { texte: d.texte.slice(0, 400) }), bannis: G.motsBannis(d.texte) });
      // L'ordre du panneau (revue du 14/10/2026, M8).
      const od = await lireOrdre(o.page);
      check(`${mode} ${w} px : ${od.faible ? 'échantillon faible : ni barre ni légende, « Trop peu de cas » juste sous la phrase (' + od.sous + ' px)' : 'assez de cas : la barre, pas d’alerte'} ; les exemples passés avant « Les chiffres » ; rendu avec assez de cas : ${od.assez.barres} barre(s), sans alerte`,
        ordreOk(od), od);
      // Les exemples passés (plan du 13/10/2026, idée 4) : la bande des derniers cas, ou une phrase.
      const ex = await lireExemples(o.page);
      check(`${mode} ${w} px : exemples passés — ${ex.n ? ex.n + ' cas en petit, dans une bande à faire défiler, sans débord' : '« Aucun cas fini sur ce graphique. »'}`, exemplesOk(ex, tactile), ex);
      // Échap le referme.
      await o.page.keyboard.press('Escape'); await o.page.waitForTimeout(100);
      check(`${mode} ${w} px : Échap referme le détail`, await o.page.evaluate(() => document.getElementById('fichePop').hidden), null);
      // Le détail (souris) : la bulle s'ouvre sur son résumé (option A, 11/10/2026) ; un clic sur la
      // figure ouvre la bulle entière, un 2e clic ses statistiques détaillées.
      if (mode === 'expert' && pt) {
        await o.page.mouse.move(pt.x - 8, pt.y - 3); await o.page.mouse.move(pt.x, pt.y, { steps: 3 }); await o.page.waitForTimeout(250);
        await o.page.mouse.click(pt.x, pt.y); await o.page.waitForTimeout(300);
        const entiere = await o.page.evaluate(() => ({ fiche: !document.getElementById('fichePop').hidden, detail: bulleDetail !== null }));
        await o.page.mouse.click(pt.x, pt.y); await o.page.waitForTimeout(300);
        check('Le détail : un clic sur le libellé de la figure ouvre sa bulle entière, un 2e clic ses statistiques détaillées', !entiere.fiche && entiere.detail && await o.page.evaluate(() => !document.getElementById('fichePop').hidden && !!window.__statsFigure), entiere);
      }
      check(`${mode} ${w} px : aucune erreur JavaScript`, !o.erreurs.length, o.erreurs);
      await o.ctx.close();
    }

    // ── 5 ter. Exemples passés dans chaque thème (plan du 13/10/2026, idée 4) ──
    titre('5 ter. Exemples passés : la bande des derniers cas dans le panneau des statistiques, onze thèmes à 390 px, deux à 1440 px');
    for (const [mode, w, h, themes] of [['debutant', 390, 844, ['bureau95', 'aero', 'bureau95-contraste', 'gazette', 'neon', 'diazo', 'codex', 'cyanotype', 'gare', 'kala', 'aero-nuit']], ['expert', 1440, 900, ['bureau95', 'aero']]]) {
      const tactile = w < 500;
      const o = await ouvrir(nav, { iC: seq.iC + 2, mode, w, h, theme: themes[0] });
      const fautes = [], coupees = [], ordres = [];
      let vu = 0, faibles = 0;
      for (const th of themes) {
        await o.page.evaluate(t => { fermerFiche(); appliquerTheme(t); }, th); await o.page.waitForTimeout(350);
        // La figure dont le type a le plus de cas finis : la bande a de quoi défiler.
        const n = await o.page.evaluate(() => {
          const R = GUIDE_FORMES.val, fin = g => !g.doublon && g.jConf !== null && g.jConf !== undefined && ['atteint', 'invalide', 'expire'].includes(g.fin);
          const nb = t => R.formes.filter(g => g.type === t && fin(g)).length, f = R.formes.filter(g => !g.doublon).sort((a, b) => nb(b.type) - nb(a.type))[0];
          return f && ouvrirStatsFigure(f) ? nb(f.type) : -1;
        });
        await o.page.waitForTimeout(150);
        const ex = await lireExemples(o.page);
        vu = Math.max(vu, ex.cartes.length);
        // L'ordre du panneau dans chaque thème (revue du 14/10/2026, M8).
        const od = await lireOrdre(o.page);
        if (od.faible) faibles++;
        if (!ordreOk(od)) ordres.push(Object.assign({ th }, od));
        for (const c of await coupuresLignes(o.page, '#fichePop')) coupees.push(th + ' : ' + c);
        if (n < 1 || !exemplesOk(ex, tactile)) fautes.push({ th, n, ex: Object.assign({}, ex, { texte: undefined }) });
        // Carré dans les thèmes carrés ; l'objectif et l'invalidation aux couleurs de la barre des issues ; aucune animation.
        const carre = ex.rTile === 0 ? ex.cartes.every(c => c.rayon === 0) : ex.cartes.every(c => c.rayon <= 8);
        if (!carre || !ex.couleurs || ex.couleurs.objectif !== ex.couleurs.up || ex.couleurs.inval !== ex.couleurs.down || ex.cartes.some(c => c.anim)) fautes.push({ th, carre, couleurs: ex.couleurs, rTile: ex.rTile, rayons: ex.cartes.map(c => c.rayon) });
      }
      check(`${mode} ${w} px : dans ${themes.length} thèmes (${faibles} à échantillon faible), le panneau sans barre quand il y a trop peu de cas, « Trop peu de cas » juste sous la phrase, les exemples passés avant « Les chiffres »`,
        !ordres.length, ordres.slice(0, 3));
      check(`${mode} ${w} px : dans ${themes.length} thèmes, la bande des derniers cas (jusqu’à ${vu} cartes) tient dans le panneau, sans défilement de côté de la page ; cartes de 40 px de haut au moins, carrées dans les thèmes carrés ; objectif et invalidation aux couleurs du thème ; sans mot banni`,
        !fautes.length && vu >= 3, fautes.slice(0, 3));
      // Revue du 14/10/2026, C8 : on lisait « 2 918 fois sur 5 » puis « 103. » à la ligne, « (15 » puis
      // « min) », « sans tri » puis « : » seul.
      check(`${mode} ${w} px : dans ${themes.length} thèmes, aucune ligne du panneau des statistiques ne commence par « : ; ? ! » $ % » ni ne finit par « « », aucun nombre n’est coupé de ses milliers ou de son unité`,
        !coupees.length, coupees.slice(0, 6));
      check(`${mode} ${w} px : aucune erreur JavaScript (thèmes changés, panneau rouvert)`, !o.erreurs.length, o.erreurs);
      await o.ctx.close();
    }

    // ── 7. Temps dans Chromium, processeur ralenti 4 fois ──
    titre('7. Rejeu dans Chromium, processeur ralenti 4 fois (amendement E2)');
    for (const itv of ['1m', '15m']) {
      const o = await ouvrir(nav, { itv, mode: 'debutant', w: 1440, h: 900 });
      const cdp = await o.ctx.newCDPSession(o.page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      const m = await o.page.evaluate(() => {
        const K = cols(), n = candles.length - 1, G = PARAM.guide;
        const atr = calcATR(K.high, K.low, K.close, G.atrPeriode), S = { h: K.high, l: K.low, c: K.close, atr, n };
        const med = t => { t.sort((a, b) => a - b); return { mediane: t[2], max: t[4] }; };
        // Rejeu complet (1er affichage, changement d'intervalle ou de symbole).
        Guide.detecter(S, G);
        const t = [];
        for (let k = 0; k < 5; k++) { const t0 = performance.now(); Guide.detecter(S, G); t.push(performance.now() - t0); }
        // À chaque clôture : le rejeu reprend sur une bougie de plus (ce que fait guideDonnees).
        const u = [];
        let egal = true;
        for (let k = 0; k < 5; k++) {
          const avant = Guide.detecter(Object.assign({}, S, { n: n - 1 }), G);
          const t0 = performance.now(); const r = Guide.detecter(S, G, avant); u.push(performance.now() - t0);
          const plein = Guide.detecter(S, G);
          egal = egal && r.formes.length === plein.formes.length && r.ebauches.liste.length === plein.ebauches.liste.length && JSON.stringify(r.bilan) === JSON.stringify(plein.bilan);
        }
        return { n, complet: med(t), cloture: med(u), egal };
      });
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
      check(`${itv} : à chaque clôture, rejeu repris sur ${m.n} bougies en ${m.cloture.mediane.toFixed(1)} ms (médiane de 5, max ${m.cloture.max.toFixed(1)} ms), processeur ÷ 4 : ≤ 100 ms ; même résultat qu’un rejeu complet`, m.cloture.mediane <= 100 && m.egal, m);
      // Le rejeu complet n'a lieu qu'au 1er affichage (et au changement d'intervalle ou de symbole) :
      // mesuré et affiché ; au-delà de 100 ms, c'est le rejeu repris ci-dessus qui tient la règle E2.
      console.log(`  · ${itv} : rejeu complet de ${m.n} bougies (1er affichage) : ${m.complet.mediane.toFixed(1)} ms (médiane de 5, max ${m.complet.max.toFixed(1)} ms), processeur ÷ 4`);
      await o.ctx.close();
    }
  } catch (e) {
    check('déroulé du test', false, e.message);
  } finally {
    await nav.close(); serveur.close();
  }
  console.log(ko ? `\n❌ FIGURES À L'ÉCRAN : ${ko} contrôle(s) en échec` : '\n✅ FIGURES À L\'ÉCRAN : TOUS LES CONTRÔLES PASSENT');
  process.exit(ko ? 1 : 0);
})();
