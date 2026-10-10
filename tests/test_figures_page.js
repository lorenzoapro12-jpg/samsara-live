// Les figures chartistes dans un vrai navigateur (Chromium, Playwright), sur les bougies RÉELLES de
// la fixture 15 min tronquées à un instant, la dernière étant la bougie EN COURS (plan figures §9.2).
//
// Les instants sont trouvés par le rejeu pur (js/guide.js), pas écrits en dur : la 1re figure de la
// fixture montrée en Lisible comme ébauche, puis formée, puis « à confirmer », puis confirmée ; la
// 1re figure montrée puis invalidée.
//   1. ÉBAUCHE : Lisible « … possible » (registre debItem 'forme'), au plus 5 textes, tirets fins et
//      point creux ; Complet : le libellé dit « ébauche » et les comptes mesurés.
//   2. BOUGIE EN COURS : le prix live passe la ligne qui valide, puis revient en ne laissant qu'une
//      mèche : le calque dit « <Nom> à confirmer » et le GARDE quand le prix revient (le libellé lit
//      le plus haut / le plus bas de la bougie : il ne clignote pas, il garde le nom de la figure) ;
//      la bulle dit « Cela ne compte pas » / « percé en mèche » ; le graphique n'est pas redessiné ;
//      le libellé de la clôture ne change pas.
//   3. CLÔTURES SUCCESSIVES : « … à confirmer » (1/2), puis « … confirmé » (2/2) ; Complet : l'objectif
//      théorique est dessiné, ou une flèche au bord s'il est hors de l'échelle.
//   4. INVALIDATION, clôture après clôture DANS UNE MÊME PAGE (le Lisible ne barre que la figure
//      qu'il a dessinée : une page ouverte après coup ne la barre pas) : « ✗ … invalidé » pendant
//      garderInvalide bougies, de plus en plus pâle, puis plus rien ; bulle Complet « invalidé à
//      HH:MM UTC » et journal ; bulle Lisible « (heure de Paris) » ; une page ouverte APRÈS
//      l'invalidation ne montre pas de ✗ pour une figure qu'elle n'a jamais dessinée.
//   5. BULLES (survol à 1440, toucher à 390) : validation, invalidation, cible et « Mesuré sur »
//      ensemble ; aucun mot banni ; bulle entière dans le tracé ; la ligne qui valide n'est couverte
//      par aucun texte sur plus de 30 % de sa longueur visible (amendement C5).
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
const { chargerPage } = require('./bac');

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
// La figure que le Lisible montre quand la bougie en cours est iC (closes 0..iC−1), vue des 50 dernières.
const premiere = iC => G.formesAffichees(Object.assign({}, R, { n: iC }), P, iC + 1 - VUE, iC + 1, 'debutant')[0] || null;
const etatA = (f, j) => (f.ebauche ? 'ebauche' : f.fin && f.jFin <= j ? f.fin : G.phaseA(f, j));
// Séquence 1 : une ébauche montrée, devenue une figure montrée, « à confirmer », puis confirmée.
let seq = null;
for (const e of R.ebauches.liste.filter(x => x.fin === 'devenue' && x.devenue && x.devenue.jConf !== null && G.famille(x) === 'extremes')) {
  const f = e.devenue, jD = (f.journal.find(x => x.quoi === 'demi') || {}).j;
  if (!(jD < f.jConf)) continue;
  const iE = e.t0 + 1, iF = f.t + 1, iD = jD + 1, iCf = f.jConf + 1;
  if (iE < 400 || !(iE < iF && iF < iD && iD < iCf)) continue;
  if (premiere(iE) === e && premiere(iF) === f && premiere(iD) === f && premiere(iCf) === f && iCf + 1 < K.length) { seq = { e, f, iE, iF, iD, iC: iCf }; break; }
}
// Complet : un instant où une ébauche est parmi les figures montrées (la 1re figure du Lisible
// n'est pas forcément celle que l'Complet met en avant).
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
/** L'état des figures dans la page : registre Lisible, figures dessinées, styles, libellés. */
const lireEtat = page => page.evaluate(() => {
  const E = guideEtat;
  if (!E) return null;
  const fig = x => ({ type: x.f.type, cle: Guide.etatForme(x.f).cle, ebauche: !!x.f.ebauche, dash: x.tr.st.dash, a: x.tr.st.a, creux: !!x.tr.geo.creux, croix: !!x.tr.croix,
    objectif: x.tr.objectif || null, fleche: x.tr.fleche || null, lignes: x.lignes || null, t: x.t || null, vivant: x.texteVivant || null, pastille: x.pastille || null, v: x.v ? x.v.cle : null });
  return { n: candles.length, deb: !!E.deb, items: debEtat ? debEtat.items.map(i => ({ role: i.role, texte: i.texte, rect: i.rect })) : null,
    figures: (E.figures || []).map(fig), debForme: E.debForme ? fig(E.debForme) : null, mainH: geo.mainH, top: geoPrix.top, ph: geoPrix.ph };
});
/** Survole (ou touche) le libellé de la figure ; rend la bulle. */
async function bulle(o, tactile) {
  const pt = await o.page.evaluate(() => {
    const E = guideEtat, b = canvas.getBoundingClientRect();
    const c = E.cibles.find(x => x.figure && x.rects && x.rects.length);
    return c ? { x: b.left + (c.rects[0].x0 + c.rects[0].x1) / 2, y: b.top + (c.rects[0].y0 + c.rects[0].y1) / 2 } : null;
  });
  if (!pt) return null;
  if (tactile) await o.page.touchscreen.tap(pt.x, pt.y);
  else { await o.page.mouse.move(pt.x - 8, pt.y - 3); await o.page.mouse.move(pt.x, pt.y, { steps: 3 }); }
  await o.page.waitForTimeout(350);
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
    check('séquence 1 trouvée : ébauche → figure → à confirmer → confirmée, montrée chaque fois en Lisible', !!seq, null);
    check(`Complet : une ébauche montrée trouvée${ebX ? ' (' + ebX.e.type + ', bougie ' + (ebX.iC - 1) + ')' : ''}`, !!ebX, null);
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
      check(`Lisible : « ${nom} possible » posé (registre « forme »), au plus 5 textes`, forme && e.debForme && e.debForme.t === nom + ' possible' && e.items.length <= 5, e.items);
      check('… tracé en tirets fins [3,3] avec un point creux (le dernier point n’est pas encore acquis)', e.debForme && e.debForme.ebauche && JSON.stringify(e.debForme.dash) === '[3,3]' && e.debForme.creux, e.debForme);
      check('aucune erreur JavaScript', !o.erreurs.length, o.erreurs);
      await o.ctx.close();
      const x = await ouvrir(nav, { iC: ebX ? ebX.iC : seq.iE, mode: 'expert', w: 1440, h: 900 });
      const ex = await lireEtat(x.page);
      const fe = ex.figures.find(f => f.ebauche);
      check('Complet : le libellé dit « ébauche » et les comptes mesurés (« mesuré … conf. », ou « mesuré … rep. » pour une figure à deux droites), ≤ 80 caractères', fe && fe.lignes && /ébauche/.test(fe.lignes.join(' ')) && /mesuré \d+(\/\d+ conf\.| rep\.)/.test(fe.lignes.join(' ')) && fe.lignes.join(' ').length <= 80, ex.figures);
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
      check(`le prix live au-delà de la ligne qui valide : le calque dit « ${nom} à confirmer » ; la bulle « Si … finit … (à HHhMM) »`, r && r.a.t === nom + ' à confirmer' && r.a.item === r.a.t && /^En ce moment le prix est .* finit .*\(à \d\dh\d\d\)/.test(r.a.vivant), r);
      // (Changé exprès, revue des figures 2 : « … à confirmer » restait affiché alors que le prix était
      // revenu dedans — une mèche seule ne valide rien ; le libellé garde le nom et dit « revenu ».)
      check('il revient, une mèche reste : le libellé garde le nom et dit « revenu » (plus « à confirmer ») ; « Cela ne compte pas » (Lisible), « percé en mèche » (Complet)', r && (r.b.t === nom + ' : revenu dedans' || r.b.t === nom + ' : revenu') && r.b.t !== r.a.t && /Cela ne compte pas/.test(r.b.vivant) && /percé en mèche/.test(r.b.expert), r && r.b);
      check('… sans redessiner le graphique (calque seul), et le libellé de la clôture ne change pas', r && r.dc === 0 && r.base === r.apres, r && { dc: r.dc, base: r.base, apres: r.apres });
      check('aucune erreur JavaScript', !o.erreurs.length, o.erreurs);
      await o.ctx.close();
    }

    // ── 3. Clôtures successives ──
    titre('3. Clôtures successives : 1/2 puis 2/2');
    {
      const o = await ouvrir(nav, { iC: seq.iD, mode: 'debutant', w: 1440, h: 900 });
      const e = await lireEtat(o.page);
      check(`1 clôture au-delà : « ${G.libelleFormeDebutant(Object.assign({}, seq.f, { phase: 'formation', fin: null, demi: true }))} »`, e.debForme && e.debForme.cle === 'demi' && /à confirmer$/.test(e.debForme.t), e.debForme);
      await o.ctx.close();
      const o2 = await ouvrir(nav, { iC: seq.iC, mode: 'debutant', w: 1440, h: 900 });
      const e2 = await lireEtat(o2.page);
      check(`2 clôtures au-delà : « ${nom} confirmé » (traits pleins)`, e2.debForme && e2.debForme.cle === 'confirme' && e2.debForme.t === nom + ' confirmé' && !e2.debForme.dash.length, e2.debForme);
      await o2.ctx.close();
      const x = await ouvrir(nav, { iC: seq.iC, mode: 'expert', w: 1440, h: 900 });
      const ex = await lireEtat(x.page);
      const fc = ex.figures.find(f => f.cle === 'confirme' && f.type === seq.f.type);
      check('Complet : l’objectif théorique est dessiné (ligne dans l’échelle, ou flèche au bord avec son prix)', fc && fc.objectif && (fc.objectif.dansVue || fc.objectif.fleche), fc);
      check('aucune erreur JavaScript', !x.erreurs.length, x.erreurs);
      await x.ctx.close();
    }

    // ── 4. Invalidation et effacement, clôture après clôture dans une même page ──
    // Changement voulu (revue des figures) : le Lisible ne barre (✗) que la figure qu'il a dessinée
    // à la clôture d'avant son issue (mémoire de la page). Le test n'ouvre donc plus une page neuve
    // à chaque instant : il ouvre la page avant l'invalidation et fait avancer les clôtures dedans.
    titre('4. Invalidation : ✗ pendant ' + P.garderInvalide + ' bougies, de plus en plus pâle, puis plus rien');
    {
      const nomI = G.NOM_FORME_DEBUTANT[inv.f.type], alphas = [];
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
          if (!(e.debForme && e.debForme.t === '✗ ' + nomI + ' invalidé' && e.debForme.croix)) okLib = false;
          alphas.push(e.debForme ? e.debForme.a : null);
        } else vuApres = e.debForme;
        if (k === 0) {
          const b = await bulle(o, false);
          check('bulle Lisible : « Invalidé à HHhMM (heure de Paris) », jamais « UTC »', b && /Invalidé à \d\dh\d\d \(heure de Paris\)/.test(b.texte) && !/UTC/.test(b.texte), b && b.texte.slice(0, 300));
          await o.page.mouse.move(2, 2);
        }
      }
      check(`la figure est dessinée vivante à la clôture d’avant (« ${avant && avant.debForme ? avant.debForme.t : '—'} »)`, avant && avant.debForme && avant.debForme.type === inv.f.type && !avant.debForme.croix, avant && avant.debForme);
      check(`« ✗ ${nomI} invalidé » avec sa croix pendant ${P.garderInvalide} bougies`, okLib, alphas);
      check('… de plus en plus pâle (alpha lu dans l’état de dessin), puis plus rien', alphas.every((a, k) => a !== null && (!k || a < alphas[k - 1])) && (!vuApres || vuApres.t !== '✗ ' + nomI + ' invalidé'), { alphas, vuApres });
      check('aucune erreur JavaScript', !o.erreurs.length, o.erreurs);
      await o.ctx.close();
      // Une page ouverte après coup n'a pas vu la figure vivante : pas de ✗ pour elle.
      const neuve = await ouvrir(nav, { iC: inv.iI, mode: 'debutant', w: 1440, h: 900 });
      const en = await lireEtat(neuve.page);
      check('une page ouverte après l’invalidation ne barre pas une figure qu’elle n’a jamais dessinée', !(en.debForme && en.debForme.croix), en.debForme);
      await neuve.ctx.close();
      const x = await ouvrir(nav, { iC: inv.iI, mode: 'expert', w: 1440, h: 900 });
      const b = await bulle(x, false);
      check('bulle Complet : « invalidé à HH:MM UTC (HHhMM Paris) » et le journal (« Observé »)', b && /invalidé à \d\d:\d\d UTC \(\d\dh\d\d Paris\)/.test(b.texte) && /Observé/.test(b.texte), b && b.texte.slice(0, 400));
      check('aucune erreur JavaScript', !x.erreurs.length, x.erreurs);
      await x.ctx.close();
    }

    // ── 5. Bulles, ligne qui valide, défilement ──
    titre('5. Bulles au survol (1440) et au toucher (390), ligne qui valide visible');
    for (const [w, h, theme] of [[1440, 900, 'aero'], [390, 844, 'aero'], [390, 844, 'kala']]) {
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
        b && /validée/.test(b.texte) && /Annulée si|ne tient plus/.test(b.texte) && /cible théorique/i.test(b.texte) && /Mesuré sur/.test(b.texte) && !bannis.length && b.b && b.b.y >= 0 && b.b.y + b.b.h <= b.mainH,
        b && { bannis, b: b.b, mainH: b.mainH, texte: b.texte.slice(0, 300) });
      if (tactile) check(`${w} px : pas de défilement horizontal`, c5 && c5.scroll <= 0, c5);
      check(`${w} px · ${theme} : aucune erreur JavaScript`, !o.erreurs.length, o.erreurs);
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
