// Apprendre en se servant du site (plan §10 bis) dans un vrai navigateur (Chromium, Playwright), sur
// les bougies réelles de la fixture 15 min ; le prix live simulé (Binance simulé, etat.live) franchit
// un repère comme le ferait le marché (fetchPrice de la page). Le cœur pur est vérifié par
// test_apprendre.js.
//
//   1. LISIBLE (1440 au survol, 390 au toucher) :
//      · au chargement : aucune ligne ; UNE marque « nouveau » (un point, pas un texte), sur le
//        libellé de la 1re nature jamais lue ;
//      · le prix live passe au-delà de la bande du repère du dessus : UNE ligne « ce qui vient de se
//        passer », dans le budget (au plus 5 textes, journal de fillText = registre), ni sur la ligne
//        du prix, ni sur le badge, ni sur un autre texte ; ses mots exacts (« pas encore cassé ») ;
//        sa bulle : le résumé (4 lignes, 3 nombres, ni « % » ni mot banni), puis le détail avec la
//        ligne du risque ; elle s'efface seule (PARAM.apprendre.dureeLisible, horloge avancée), la
//        place cédée revient ; rien n'est redit ensuite ;
//      · le prix repasse sous la bande : la ligne au présent s'efface aussitôt (plus vraie) ;
//      · la marque lue (sa bulle ouverte) s'efface et ne revient pas au rechargement
//        (samsara-nouveau-v1) ;
//      · la vue dans le passé : aucun message (ni au retour au présent) ; les bulles des figures
//        passées et des figures en cours ont la ligne du risque ;
//      · le menu du Lisible n'a pas de case (les deux aides y sont toujours).
//   2. DEUX CHANGEMENTS DANS LA MÊME IMAGE (Lisible 1440 et 390, scénarios du matin servis) : la
//      1re cible du scénario 1 touchée ET le repère franchi → UN message, le plus important
//      (Apprendre.ORDRE : la cible du scénario) ; la bulle du scénario a la ligne du risque.
//   3. COMPLET (1440 et 390) : la même ligne, discrète (9 px, encre pâle), sans redessiner le
//      graphique ni à l'arrivée ni au départ ; une marque plus petite ; « Aide à la lecture » dans
//      « Choisir l'affichage » : décochées, plus de ligne ni de marque, choix gardé au rechargement
//      (samsara-apprendre-v1) ; ni « Débutant » ni « Expert » écrit.
//   Partout : aucune erreur JavaScript ; pas de défilement horizontal à 390 px.
// Sans Playwright : « non exécuté », dit à l'écran (ce n'est pas un succès).
// USAGE   node tests/test_apprendre_page.js
const fs = require('fs'), path = require('path'), http = require('http');
const REPO = path.resolve(__dirname, '..');
const G = require(path.join(REPO, 'js/guide.js'));
const { previsionsFixture, estPrevisions } = require('./previsions-fixture');

let playwright = null;
for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright', process.env.PLAYWRIGHT_MODULE].filter(Boolean)) {
  try { playwright = require(p); break; } catch (e) { /* suivant */ }
}
if (!playwright) {
  console.log('  − NON EXÉCUTÉ : Playwright introuvable — l’aide à la lecture n’est pas vérifiée à l’écran sur ce poste.');
  process.exit(0);
}
let ko = 0;
const check = (nom, ok, det) => { if (!ok) ko++; console.log(`  ${ok ? '✓' : '✗'} ${nom}${!ok && det !== undefined ? ' — ' + JSON.stringify(det).slice(0, 700) : ''}`); };
const titre = t => console.log(`\n── ${t} ──`);
const MODES_ECRITS = /\b(Débutant|Expert)\b/;
const CONSEIL = /\b(achetez|vendez|il faut (?:acheter|vendre)|entrez|sortez|prenez position|signal d['’]achat|signal de vente)/i;

// ── Binance simulé sur la fixture : la dernière bougie est en cours ; son haut et son bas suivent le prix live ──
const K = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'bougies-btcusdt-15m.json'), 'utf8')).bougies.map(k => [Math.round(k[0] / 1000), +k[1], +k[2], +k[3], +k[4], +k[5]]);
const PAS = 9e5, iC = K.length - 1, T0 = K[iC][0] * 1000 + Math.round(PAS * 0.6);
const etat = { live: null, scen: false };
function binance(url) {
  const u = new URL(url), q = u.searchParams, x = K[iC], live = etat.live || x[4];
  if (u.pathname.endsWith('/klines')) {
    const lim = Math.min(1000, +q.get('limit') || 500), fin = q.get('endTime') ? +q.get('endTime') : Infinity;
    const serie = K.slice(0, iC).concat([[x[0], x[1], Math.max(x[1], x[4], live), Math.min(x[1], x[4], live), live, x[5]]]).filter(y => y[0] * 1000 <= fin);
    return serie.slice(-lim).map(y => [y[0] * 1000, String(y[1]), String(y[2]), String(y[3]), String(y[4]), String(y[5]), y[0] * 1000 + PAS - 1, String(y[5] * y[4]), 100, String(y[5] / 2), String(y[5] * y[4] / 2), '0']);
  }
  if (u.pathname.endsWith('/ticker/24hr')) return { symbol: 'BTCUSDT', lastPrice: String(live), openPrice: String(K[iC - 96][1]), priceChangePercent: '0', highPrice: String(live * 1.01), lowPrice: String(live * 0.99), volume: '1000', quoteVolume: '1e9', count: 100 };
  if (u.pathname.endsWith('/ticker/price')) return { price: String(live) };
  if (u.pathname.endsWith('/time')) return { serverTime: T0 };
  return {};
}
// Les scénarios du matin (section 2) : le point 3 h avant maintenant ; la 1re cible du scénario 1
// juste au-dessus des bougies depuis le point (pas encore touchée), son invalidation loin dessous ;
// les autres scénarios loin du prix (rien ne leur arrive pendant le test).
const depuis = K.slice(iC - 12), HAUT = Math.max(...depuis.map(k => k[2])), BAS = Math.min(...depuis.map(k => k[3])), L = K[iC][4];
const CIBLE1 = Math.round(HAUT + 420);
function scenarios() {
  return previsionsFixture({ maintenant: T0, modifier: d => {
    for (const s of d.scenarios) {
      s.origines = {};
      if (s.rang === '1') { s.cibles = [CIBLE1, CIBLE1 + 3000]; s.invalidation = Math.round(BAS - 900); }
      else if (s.rang === '2') { s.cibles = [Math.round(L - 4000), Math.round(L - 4600)]; s.invalidation = Math.round(L + 4000); }
      else if (s.rang === '3') { if (s.range) s.range = [Math.round(L - 5000), Math.round(L + 5000)]; }
      else { s.cibles = [Math.round(L + 6000)]; s.invalidation = Math.round(L - 6000); }
    }
  } });
}
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const serveur = http.createServer((req, res) => {
  const f = path.join(REPO, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(REPO) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

/** Ouvre la page. o : mode, w, h, scen (les scénarios du matin servis). Le stockage n'est vidé qu'au
 *  1er chargement de l'onglet : un rechargement garde les marques lues et les choix. */
async function ouvrir(nav, o) {
  etat.live = null; etat.scen = !!o.scen;
  const tactile = o.w < 500;
  const ctx = await nav.newContext({ viewport: { width: o.w, height: o.h }, deviceScaleFactor: 1, hasTouch: tactile, isMobile: tactile });
  await ctx.clock.install({ time: T0 });
  const page = await ctx.newPage();
  const erreurs = [];
  page.on('pageerror', e => erreurs.push(e.message));
  await page.route('**/*', r => {
    const u = r.request().url(), h = new URL(u).host, cors = { 'access-control-allow-origin': '*' };
    if (h.startsWith('127.0.0.1')) return r.continue();
    if (h === 'api.binance.com' || h === 'data-api.binance.vision') return r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(binance(u)) });
    if (h === 'raw.githubusercontent.com') {
      if (etat.scen && estPrevisions(u)) return r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: scenarios() });
      return r.fulfill({ status: 404, headers: cors, body: '' });
    }
    return r.abort();
  });
  await page.addInitScript(([m, scen]) => {
    try {
      if (!sessionStorage.getItem('__ouvert')) {
        sessionStorage.setItem('__ouvert', '1');
        localStorage.clear();
        localStorage.setItem('samsara-theme', 'aero'); localStorage.setItem('samsara-mode', m);
        if (!scen) localStorage.setItem('samsara-scenarios-v1', '0');
      }
    } catch (e) { /* */ }
    // Le journal des textes et des points dessinés (canvas, texte, police, couleur), actif entre deux marqueurs.
    window.__ft = []; window.__arc = []; window.__ftOn = false;
    const f0 = CanvasRenderingContext2D.prototype.fillText, a0 = CanvasRenderingContext2D.prototype.arc;
    CanvasRenderingContext2D.prototype.fillText = function (t, x, y) {
      if (window.__ftOn) window.__ft.push({ c: this.canvas && this.canvas.id, t: String(t), x, y, police: this.font, coul: String(this.fillStyle) });
      return f0.apply(this, arguments);
    };
    CanvasRenderingContext2D.prototype.arc = function (x, y, r) {
      if (window.__ftOn) window.__arc.push({ c: this.canvas && this.canvas.id, x, y, r });
      return a0.apply(this, arguments);
    };
  }, [o.mode, !!o.scen]);
  await page.goto(`http://127.0.0.1:${serveur.address().port}/index.html`);
  await attendre(page, !!o.scen);
  return { ctx, page, erreurs, tactile, w: o.w };
}
/** Attend les bougies, le rejeu des figures (et les scénarios), puis compte les dessins du graphique
 *  (window.__dc) et journalise les changements vus ensemble (window.__evts, Apprendre.choisir). */
async function attendre(page, scen) {
  await page.waitForFunction(([n, scen]) => typeof candles !== 'undefined' && candles.length >= n && typeof guideEtat !== 'undefined' && guideEtat
    && GUIDE_FORMES.val && !GUIDE_FROID && (!scen || (scenEtat && scenEtat.items && scenEtat.items.length)), [K.length, scen], { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    if (window.__dc !== undefined) return;
    window.__dc = 0; window.__evts = [];
    const d0 = drawChart;
    drawChart = function () { window.__dc++; return d0.apply(this, arguments); };
    const c0 = Apprendre.choisir;
    Apprendre.choisir = function (l) { if (l && l.length) window.__evts.push(l.map(e => e.type)); return c0.apply(this, arguments); };
  });
}
/** Le prix live passe à p : la page le lit comme toujours (fetchPrice, Binance simulé), puis
 *  quelques images. */
async function prix(o, p) {
  etat.live = p;
  await o.page.evaluate(() => fetchPrice());
  await o.page.waitForTimeout(200);
}
/** Un dessin forcé, journalisé : les textes du tracé, le registre, la ligne, la marque, les points. */
const cadre = page => page.evaluate(() => {
  crossX = crossY = null; bulleDetail = null;
  window.__ft = []; window.__arc = []; window.__ftOn = true;
  drawChart();
  window.__ftOn = false;
  const W = canvas.width / devicePixelRatio, mainH = geo.mainH, xAxe = W - 75, live = livePrice;
  const fil = (NOMS_PAIRES[activeSymbol] || activeSymbol) + '  ·  ' + Guide.nomIntervalle(chartInterval);
  const trace = window.__ft.filter(e => (e.c === 'chart' || e.c === 'chartCalque') && e.t !== fil && e.x >= 14 && e.x < xAxe && e.y >= 0 && e.y <= mainH - 20);
  const yLive = isNum(live) ? geoPrix.top + geoPrix.ph * (1 - (live - geoPrix.minP) / geoPrix.range) : null;
  const R = debutant() ? PARAM.apprendre.marque : PARAM.apprendre.marqueComplet;
  return {
    W, mainH, xAxe, yLive, live, etroit: W - 16 - 75 < PARAM.guide.debutant.etroit, top: geoPrix.top, bas: geoPrix.top + geoPrix.ph, mode: document.documentElement.getAttribute('data-mode'),
    trace: trace.map(e => e.t), journal: trace.map(e => ({ t: e.t, police: e.police, coul: e.coul })),
    items: debEtat ? debEtat.items.map(i => ({ role: i.role, texte: i.texte, rect: i.rect })) : null, nItemsMax: PARAM.guide.debutant.items,
    ligne: apprEtat.ligne, marque: apprEtat.marque, msg: apprMsg ? { type: apprMsg.e.type, cede: apprMsg.cede, fin: apprMsg.fin } : null, maintenant: Date.now(),
    points: window.__arc.filter(a => a.c === 'chartCalque' && Math.abs(a.r - R) < 1e-6).length,
    rects: (guideEtat ? guideEtat.rects : []).concat(scenEtat ? scenEtat.rects : []),
    badge: isNum(live) ? { x: xAxe, y: yLive - 10, w: 75, h: 20 } : null,
    encre3: COLORS.ink3, boite: scenEtat && scenEtat.boite ? { cede: !!scenEtat.boite.cede } : null,
    defile: document.documentElement.scrollWidth > window.innerWidth + 1,
  };
});
const chevauche = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
/** Le repère du dessus du Lisible (sa bande), ou la bande du Complet la plus proche au-dessus du prix. */
const repereDessus = page => page.evaluate(() => {
  const E = guideEtat;
  if (E.deb) {
    const d = E.debSel && E.debSel.dessus, x = d && E.D.reperes.find(r => r.p === d.p);
    return x ? { p: x.p, lo: x.lo, hi: x.hi } : null;
  }
  const L = E.niveaux.filter(L => L.visible && L.niv.lo > livePrice).sort((a, b) => a.niv.lo - b.niv.lo)[0];
  return L ? { p: L.niv.p, lo: L.niv.lo, hi: L.niv.hi } : null;
});
const repereDessous = (page, sous) => page.evaluate(sous => {
  const E = guideEtat;
  if (E.deb) {
    const d = E.debSel && E.debSel.dessous, x = d && E.D.reperes.find(r => r.p === d.p);
    return x ? { p: x.p, lo: x.lo, hi: x.hi } : null;
  }
  const L = E.niveaux.filter(L => L.visible && L.niv.hi < Math.min(livePrice, sous || Infinity)).sort((a, b) => b.niv.hi - a.niv.hi)[0];
  return L ? { p: L.niv.p, lo: L.niv.lo, hi: L.niv.hi } : null;
}, sous || null);
/** Le centre d'une cible (sa zone de survol) où guideCibleSous la trouve bien : 'ligne' (le message),
 *  'marque' (l'étiquette marquée), ou un filtre sur les cibles. */
const pointCible = (page, quoi) => page.evaluate(quoi => {
  const b = canvas.getBoundingClientRect(), mainH = geo.mainH;
  const toutes = [].concat(guideEtat ? guideEtat.cibles : [], scenEtat ? scenEtat.cibles : []);
  const C = quoi === 'ligne' ? toutes.filter(c => apprMsg && c === apprMsg.cible)
    : quoi === 'marque' ? toutes.filter(c => apprEtat.marque && apprNature(c) === apprEtat.marque.cle)
    : quoi === 'passee' ? toutes.filter(c => c.passee) : quoi === 'figure' ? toutes.filter(c => c.figure)
    : quoi === 'scenario' ? toutes.filter(c => scenEtat && scenEtat.cibles.includes(c) && c.scenario) : [];
  for (const c of C) for (const r of (c.rects || []).concat(c.zones || [])) {
    const x = (r.x0 + r.x1) / 2, y = (r.y0 + r.y1) / 2;
    if (guideCibleSous(x, y, mainH) === c) return { x: b.left + x, y: b.top + y, cle: apprNature(c) };
  }
  return null;
}, quoi);
/** La bulle ouverte : titre, corps, résumé ou détail, lignes et nombres. */
const lireBulle = page => page.evaluate(() => {
  const S = scenEtat, E = guideEtat, sc = S && S.survol && S.bulle ? S : null, X = sc || E;
  const c = X && X.survol, b = X && X.bulle;
  return c && b ? { titre: c.titre, corps: b.corps.join(' '), resume: !!b.resume, lignes: b.lignes, nombres: b.nombres, evenement: c.evenement || null,
    estMessage: !!(apprMsg && c === apprMsg.cible), P: PARAM.guide.debutant } : null;
});
async function montrer(o, pt) {
  if (o.tactile) await o.page.touchscreen.tap(pt.x, pt.y);
  else { await o.page.mouse.move(pt.x - 8, pt.y - 3); await o.page.mouse.move(pt.x, pt.y, { steps: 3 }); }
  await o.page.waitForTimeout(350);
}
async function detail(o, pt) {
  if (o.tactile) await o.page.touchscreen.tap(pt.x, pt.y); else await o.page.mouse.click(pt.x, pt.y);
  await o.page.waitForTimeout(350);
}
async function ailleurs(o) {
  if (!o.tactile) return o.page.mouse.move(2, 2);
  const r = await o.page.evaluate(() => { const q = document.getElementById('price').getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2 }; });
  await o.page.touchscreen.tap(r.x, r.y).catch(() => {});
  await o.page.waitForTimeout(250);
}
/** Les contrôles d'un écran Lisible où la ligne du message est posée. */
function controlerLisible(e, nom) {
  const etroit = e.etroit;
  const ev = e.items.filter(i => i.role === 'evenement');
  check(`${nom} : au plus ${e.nItemsMax} textes sur le tracé (${e.trace.length}), autant que le registre (${e.items.length}) ; UNE ligne du message, la place « evenement »`,
    e.trace.length <= e.nItemsMax && e.trace.length === e.items.length && e.items.every(i => e.trace.includes(i.texte)) && ev.length === 1 && e.ligne && ev[0].texte === e.ligne.texte
    && e.trace.filter(t => t === e.ligne.texte).length === 1, { trace: e.trace, items: e.items.map(i => i.role + ' ' + i.texte), ligne: e.ligne });
  if (!e.ligne) return;
  const r = e.ligne.rect;
  check(`${nom} : « ${e.ligne.texte} » (${e.ligne.texte.length} caractères ≤ ${etroit ? 48 : 90}), sans mot banni, sans « % », sans conseil`,
    e.ligne.texte.length <= (etroit ? 48 : 90) && !G.motsBannis(e.ligne.texte).length && !/%/.test(e.ligne.texte) && !CONSEIL.test(e.ligne.texte) && !MODES_ECRITS.test(e.ligne.texte), e.ligne.texte);
  check(`${nom} : la ligne ne couvre ni la ligne du prix (y ${e.yLive && e.yLive.toFixed(1)}), ni le badge du prix, ni un autre texte du tracé`,
    !(e.yLive !== null && r.y < e.yLive + 4 && r.y + r.h > e.yLive - 4) && !(e.badge && chevauche(r, e.badge))
    && e.items.filter(i => i.role !== 'evenement' && i.rect).every(i => !chevauche(r, i.rect)), { r, yLive: e.yLive, autres: e.items.filter(i => i.role !== 'evenement').map(i => [i.texte, i.rect]) });
  check(`${nom} : la ligne dans la largeur du tracé, hors de la colonne de l'axe`, r.x >= 14 && r.x + r.w <= e.xAxe + 0.5 && r.y >= 0 && r.y + r.h <= e.mainH - 20, r);
}

(async () => {
  await new Promise(r => serveur.listen(0, '127.0.0.1', r));
  const nav = await playwright.chromium.launch();
  try {
    // ── 1. Lisible ──
    for (const [w, h] of [[1440, 900], [390, 844]]) {
      titre(`1. Lisible · ${w} px (${w < 500 ? 'toucher' : 'survol'})`);
      let o = await ouvrir(nav, { mode: 'debutant', w, h });
      const P = await o.page.evaluate(() => PARAM.apprendre);
      // Au chargement.
      await prix(o, null);
      const e0 = await cadre(o.page);
      check(`au chargement : aucun message, aucune ligne ; ${e0.trace.length} textes (≤ ${e0.nItemsMax})`, !e0.msg && !e0.ligne && !e0.items.some(i => i.role === 'evenement') && e0.trace.length <= e0.nItemsMax, { msg: e0.msg, items: e0.items });
      check(`UNE marque « nouveau » (« ${e0.marque && e0.marque.cle} »), un point de ${P.marque} px et pas un texte`, !!e0.marque && e0.points === 1 && e0.trace.length === e0.items.length, { marque: e0.marque, points: e0.points });
      check(`pas de défilement horizontal`, !e0.defile, null);
      // La marque : elle est sur une étiquette ; sa bulle lue, elle s'efface.
      const cleLue = e0.marque && e0.marque.cle;
      const pm = await pointCible(o.page, 'marque');
      check(`la marque est sur une étiquette qu'on peut ${o.tactile ? 'toucher' : 'survoler'} (« ${pm && pm.cle} »)`, !!pm && pm.cle === cleLue, pm);
      if (pm) {
        await montrer(o, pm);
        const lu = await o.page.evaluate(k => ({ vus: apprVus.has(k), stocke: (() => { try { return JSON.parse(localStorage.getItem('samsara-nouveau-v1') || '[]'); } catch (e) { return null; } })() }), cleLue);
        await ailleurs(o);
        const e1 = await cadre(o.page);
        check(`sa bulle ouverte : « ${cleLue} » lue, gardée (samsara-nouveau-v1) ; la marque n'y est plus (maintenant : « ${e1.marque ? e1.marque.cle : 'aucune'} »), un point au plus`,
          lu.vus && Array.isArray(lu.stocke) && lu.stocke.includes(cleLue) && (!e1.marque || e1.marque.cle !== cleLue) && e1.points <= 1, { lu, marque: e1.marque, points: e1.points });
      }
      // Le prix live passe au-delà de la bande du repère du dessus.
      const p0 = await o.page.evaluate(() => livePrice);
      const rd = await repereDessus(o.page);
      check(`un repère du dessus (${rd && G.chiffres(rd.p)}, bande ${rd && G.chiffres(rd.lo)} – ${rd && G.chiffres(rd.hi)})`, !!rd && rd.lo > p0, { rd, p0 });
      if (!rd) { await o.ctx.close(); continue; }
      const n0 = await o.page.evaluate(() => (debEtat ? debEtat.items.length : 0));
      await prix(o, rd.hi + Math.max(2, (rd.hi - rd.lo) * 0.3));
      await o.page.waitForFunction(() => apprEtat.ligne, null, { timeout: 4000 }).catch(() => {});
      const m1 = await o.page.evaluate(() => ({ type: apprMsg && apprMsg.e.type, fin: apprMsg && apprMsg.fin, maintenant: Date.now(), ligne: apprEtat.ligne, evts: window.__evts.slice(-3) }));
      check(`le prix passe au-dessus de la bande, bougie en cours : UN message « repere_passe » (${m1.type}), posé dans les ${P.dureeLisible / 1000} s du Lisible`,
        m1.type === 'repere_passe' && !!m1.ligne && m1.fin - m1.maintenant <= P.dureeLisible && m1.fin - m1.maintenant > P.dureeLisible - 3000, m1);
      check(`ses mots sont ceux de la règle (« ${m1.ligne && m1.ligne.texte} ») : pas encore cassé (la cassure se juge en fin de quart d’heure)`,
        !!m1.ligne && /pas encore cassé|cassé seulement si 2 quarts d’heure finissent au-dessus/.test(m1.ligne.texte), m1.ligne);
      const e2 = await cadre(o.page);
      controlerLisible(e2, `avec la ligne (${n0} textes avant)`);
      // Sa bulle : le résumé, puis le détail (la ligne du risque).
      const pl = await pointCible(o.page, 'ligne');
      check('la ligne mène à sa bulle', !!pl, null);
      if (pl) {
        await montrer(o, pl);
        const b1 = await lireBulle(o.page);
        check(`${o.tactile ? '1er toucher' : 'survol'} : le RÉSUMÉ de « ${b1 && b1.titre} » — ${b1 && b1.lignes} lignes (≤ 4), ${b1 && b1.nombres} nombres (≤ 3), sans « % » ni mot banni`,
          !!b1 && b1.estMessage && b1.resume && b1.lignes <= b1.P.bulleLignes && b1.nombres <= b1.P.bulleNombres && !/%/.test(b1.corps) && !G.motsBannis(b1.titre + ' ' + b1.corps).length, b1);
        await detail(o, pl);
        const b2 = await lireBulle(o.page);
        check(`${o.tactile ? '2e toucher' : 'clic'} : le DÉTAIL dit le mot (« cassé » = 2 fins au-delà) et l’avertissement (« pas une prévision ni un conseil », une fois), sans conseil`,
          !!b2 && !b2.resume && /pas une prévision ni un conseil/.test(b2.corps) && !b2.corps.includes(G.RISQUE) && /2 quarts d’heure/.test(b2.corps) && !CONSEIL.test(b2.corps) && !/%/.test(b2.corps), b2);
        const lu = await o.page.evaluate(() => apprVus.has('evenement:repere_passe'));
        check('la bulle du message lue : sa nature notée (plus de marque pour elle)', lu, null);
        await ailleurs(o);
      }
      // Elle s'efface seule ; la place revient.
      await o.ctx.clock.fastForward(P.dureeLisible + 2000);
      await o.page.waitForTimeout(300);
      const e3 = await cadre(o.page);
      check(`après ${P.dureeLisible / 1000} s (horloge avancée) : la ligne s'est effacée seule, sa place rendue (${e3.trace.length} textes = registre)`,
        !e3.msg && !e3.ligne && !e3.items.some(i => i.role === 'evenement') && e3.trace.length === e3.items.length && e3.trace.length <= e3.nItemsMax && (!e3.boite || !e3.boite.cede), { msg: e3.msg, items: e3.items.map(i => i.role), boite: e3.boite });
      // Rien n'est redit (le prix reste au-dessus, d'autres images passent).
      const nEv = await o.page.evaluate(() => window.__evts.length);
      await prix(o, rd.hi + Math.max(3, (rd.hi - rd.lo) * 0.35));
      await o.page.evaluate(() => { dessinerCalque(); drawChart(); dessinerCalque(); });
      const r4 = await o.page.evaluate(() => ({ msg: !!apprMsg, n: window.__evts.length }));
      check('le prix reste au-delà : rien n’est redit (aucun changement, aucun message)', !r4.msg && r4.n === nEv, r4);
      // Rechargement : la marque lue ne revient pas ; rien n'est dit au chargement (le prix déjà au-delà).
      await o.page.reload();
      await attendre(o.page, false);
      const e6 = await cadre(o.page);
      check(`rechargé : la marque lue (« ${cleLue} ») ne revient pas (maintenant « ${e6.marque ? e6.marque.cle : 'aucune'} ») ; aucun message au chargement`,
        !!cleLue && (!e6.marque || e6.marque.cle !== cleLue) && e6.points <= 1 && !e6.msg && !e6.ligne, { marque: e6.marque, msg: e6.msg });
      // Un nouvel onglet : le prix passe, puis repasse sous la bande — la ligne au présent (plus vraie) s'efface aussitôt.
      await o.ctx.close();
      o = await ouvrir(nav, { mode: 'debutant', w, h });
      const rd1 = await repereDessus(o.page);
      if (rd1) {
        await prix(o, rd1.hi + Math.max(2, (rd1.hi - rd1.lo) * 0.3));
        await o.page.waitForFunction(() => apprEtat.ligne, null, { timeout: 4000 }).catch(() => {});
        const a = await o.page.evaluate(() => ({ type: apprMsg && apprMsg.e.type, texte: apprEtat.ligne && apprEtat.ligne.texte }));
        check(`le prix passe (« ${a.texte} ») : un message « repere_passe »`, a.type === 'repere_passe' && !!a.texte, a);
        await prix(o, rd1.lo - Math.max(2, (rd1.hi - rd1.lo) * 0.3));
        await o.page.waitForTimeout(200);
        const e5 = await cadre(o.page);
        check('le prix repasse sous la bande : la ligne (plus vraie) s’efface aussitôt, sa place rendue ; rien d’autre n’est dit (pas de nouveau passage avant 15 min)',
          !e5.msg && !e5.ligne && !e5.items.some(i => i.role === 'evenement') && e5.trace.length === e5.items.length && e5.trace.length <= e5.nItemsMax, { msg: e5.msg, items: e5.items.map(i => i.role) });
      } else check('un repère du dessus', false, null);
      // La vue dans le passé : aucun message ; ni au retour au présent.
      const n = await o.page.evaluate(() => candles.length);
      await o.page.evaluate(n => { viewStart = n - 260; viewEnd = n - 60; drawChart(); }, n);
      const rd2 = await o.page.evaluate(() => { const E = guideEtat; const l = (E.D && E.D.reperes) || []; return l.length ? Math.max(...l.map(r => r.hi)) : null; });
      await prix(o, Math.max(rd2 || 0, rd.hi) + 50);
      await o.page.evaluate(() => { drawChart(); dessinerCalque(); });
      const r7 = await o.page.evaluate(() => ({ msg: !!apprMsg, ligne: !!apprEtat.ligne }));
      check('la vue dans le passé : le prix live franchit des repères, aucun message', !r7.msg && !r7.ligne, r7);
      // Les bulles des figures passées (dans cette vue) et de la figure en cours : la ligne du risque.
      for (const q of ['passee', 'figure']) {
        // La vue revient au présent SANS réticule : celui que le toucher de la figure passée a laissé
        // peut tomber, la vue déplacée, sur la figure en cours (constaté à 390 px le 13/10/2026) ; sa
        // bulle serait alors déjà montrée, et ce toucher-ci, un 2e toucher, ouvrirait le détail.
        if (q === 'figure') { await o.page.evaluate(n => { viewStart = n - 200; viewEnd = n; crossX = null; crossY = null; bulleDetail = null; drawChart(); }, n); }
        const pt = await pointCible(o.page, q);
        if (!pt) { console.log(`  − pas de ${q === 'passee' ? 'figure passée' : 'figure en cours'} dans cette vue (rien à ouvrir)`); continue; }
        await montrer(o, pt);
        const b = await lireBulle(o.page);
        await detail(o, pt);
        const d = await lireBulle(o.page);
        // Le résumé du Lisible garde ses limites (4 lignes, 3 nombres).
        // Charte du 12/10/2026 : l'avertissement une fois — au résumé, la ligne d'accès (« pas une
        // prévision ») ; au détail, la dernière ligne (« pas une prévision ni un conseil »).
        check(`bulle d’une ${q === 'passee' ? 'figure passée' : 'figure en cours'} (« ${b && b.titre} ») : résumé dans ses limites (${b && b.lignes} lignes, ${b && b.nombres} nombres), « pas une prévision » au résumé, l’avertissement au détail`,
          !!b && !!d && b.resume && /pas une prévision/.test(b.corps) && b.lignes <= b.P.bulleLignes && b.nombres <= b.P.bulleNombres && !d.resume && /pas une prévision ni une? (?:conseil|recommandation)/.test(d.corps), { b, d });
        await ailleurs(o);
      }
      const r8 = await o.page.evaluate(() => { drawChart(); dessinerCalque(); return { msg: !!apprMsg, ligne: !!apprEtat.ligne }; });
      check('retour au présent (le prix déjà au-delà) : rien n’est dit (le contexte repart de zéro, en silence)', !r8.msg && !r8.ligne, r8);
      // Le menu du Lisible : pas de case.
      await o.page.click('#indDropdownBtn');
      await o.page.waitForTimeout(200);
      const menu = await o.page.evaluate(() => ({ cases: document.querySelectorAll('#indMenu .aff-aide').length, defile: document.documentElement.scrollWidth > window.innerWidth + 1 }));
      await o.page.click('#indDropdownBtn');
      check('le menu du Lisible n’a pas de case « Aide à la lecture » (les deux aides y sont toujours)', menu.cases === 0, menu);
      check('pas de défilement horizontal ; aucune erreur JavaScript', !menu.defile && !o.erreurs.length, o.erreurs);
      await o.ctx.close();
    }

    // ── 2. Deux changements dans la même image ──
    for (const [w, h] of [[1440, 900], [390, 844]]) {
      titre(`2. Lisible · ${w} px : deux changements ensemble, un seul message (scénarios du matin servis)`);
      const o = await ouvrir(nav, { mode: 'debutant', w, h, scen: true });
      const s0 = await o.page.evaluate(() => ({ montre: scenEtat && scenEtat.montre ? scenEtat.montre.sc.rang : null, cle: scenEtat && scenEtat.montre ? scenEtat.montre.sv.cle : null, msg: !!apprMsg }));
      check(`le scénario 1 est montré, suivi en direct (« ${s0.cle} ») ; aucun message au chargement`, s0.montre === '1' && ['rien', 'avant'].includes(s0.cle) && !s0.msg, s0);
      // La bulle du scénario : l’avertissement une fois, au détail ; le résumé dit « pas une prévision ».
      const ps = await pointCible(o.page, 'scenario');
      if (ps) {
        await montrer(o, ps);
        const b = await lireBulle(o.page);
        await detail(o, ps);
        const d = await lireBulle(o.page);
        check(`bulle du scénario (« ${b && b.titre} ») : au résumé, la ligne d’accès dit « pas une prévision » sans la ligne du risque (${b && b.lignes} lignes, ${b && b.nombres} nombres) et au détail, une fois, court : « Une hypothèse de Claude (une IA), pas un conseil » (charte du 12/10/2026)`,
          !!b && !!d && !b.corps.includes(G.RISQUE) && /pas une prévision/.test(b.corps) && b.lignes <= b.P.bulleLignes && b.nombres <= b.P.bulleNombres && /Une hypothèse de Claude \(une IA\), pas un conseil\./.test(d.corps), { b, d });
        await ailleurs(o);
      } else check('le libellé du scénario 1 mène à sa bulle', false, null);
      const rd = await repereDessus(o.page);
      const p = Math.max(CIBLE1 + 40, rd ? rd.hi + 15 : 0);
      // Le prix live ET la bougie en cours arrivent ensemble : une seule image les voit.
      etat.live = p;
      await o.page.evaluate(async () => {
        const d0 = dessinerCalque;
        dessinerCalque = function () {};
        try { await fetchPrice(); await fetchKlines(); } finally { dessinerCalque = d0; }
        drawChart();
      });
      await o.page.waitForTimeout(300);
      const r = await o.page.evaluate(() => ({ evts: window.__evts.slice(-2), type: apprMsg && apprMsg.e.type, ligne: apprEtat.ligne, cle: scenEtat.montre && scenEtat.montre.sv.cle }));
      const ensemble = r.evts.find(l => l.includes('scenario_cible') && l.includes('repere_passe'));
      check(`la même image voit la 1re cible du scénario 1 touchée ET le repère franchi (${JSON.stringify(r.evts)})`, !!ensemble, r);
      check(`UN message, le plus important (Apprendre.ORDRE) : « ${r.ligne && r.ligne.texte} »`, r.type === 'scenario_cible' && !!r.ligne && /^Scénario 1 : 1re cible touchée/.test(r.ligne.texte), r);
      const e = await cadre(o.page);
      controlerLisible(e, 'deux changements');
      check('aucune erreur JavaScript ; pas de défilement horizontal', !o.erreurs.length && !e.defile, o.erreurs);
      await o.ctx.close();
    }

    // ── 3. Complet ──
    for (const [w, h] of [[1440, 900], [390, 844]]) {
      titre(`3. Complet · ${w} px`);
      let o = await ouvrir(nav, { mode: 'expert', w, h });
      const P = await o.page.evaluate(() => PARAM.apprendre);
      await prix(o, null);
      const e0 = await cadre(o.page);
      check(`au chargement : aucune ligne ; UNE marque plus discrète (un point de ${P.marqueComplet} px < ${P.marque})`, !e0.msg && !e0.ligne && !!e0.marque && e0.points === 1 && e0.marque.r === P.marqueComplet && P.marqueComplet < P.marque, { msg: e0.msg, marque: e0.marque, points: e0.points });
      const rd = await repereDessus(o.page);
      check(`une bande au-dessus du prix (${rd && G.chiffres(rd.lo)} – ${rd && G.chiffres(rd.hi)})`, !!rd, null);
      if (!rd) { await o.ctx.close(); continue; }
      const dc0 = await o.page.evaluate(() => window.__dc);
      await prix(o, rd.hi + Math.max(2, (rd.hi - rd.lo) * 0.3));
      await o.page.waitForTimeout(200);
      const r1 = await o.page.evaluate(() => {
        window.__ft = []; window.__ftOn = true; dessinerCalque(); window.__ftOn = false;
        const L = apprEtat.ligne, j = L ? window.__ft.find(x => x.c === 'chartCalque' && x.t === L.texte) : null;
        const live = livePrice, yLive = geoPrix.top + geoPrix.ph * (1 - (live - geoPrix.minP) / geoPrix.range);
        return { dc: window.__dc, type: apprMsg && apprMsg.e.type, ligne: L, j, encre3: COLORS.ink3, yLive, xAxe: canvas.width / devicePixelRatio - 75,
          rects: (guideEtat ? guideEtat.rects : []).concat(scenEtat ? scenEtat.rects : []), fin: apprMsg && apprMsg.fin, maintenant: Date.now() };
      });
      check(`le prix franchit la bande : UNE ligne (« ${r1.ligne && r1.ligne.texte} »), « repere_passe », ${P.dureeComplet / 1000} s`, r1.type === 'repere_passe' && !!r1.ligne && r1.ligne.mode === 'expert'
        && /franchi ↑/.test(r1.ligne.texte) && r1.fin - r1.maintenant <= P.dureeComplet, r1);
      check(`discrète : 9 px, l'encre pâle (${r1.j && r1.j.police}, ${r1.j && r1.j.coul})`, !!r1.j && /\b9px\b/.test(r1.j.police) && String(r1.j.coul).toLowerCase() === String(r1.encre3).toLowerCase(), r1.j);
      check(`elle n’a pas redessiné le graphique (dessins : ${r1.dc - dc0})`, r1.dc === dc0, { avant: dc0, apres: r1.dc });
      if (r1.ligne) {
        const r = r1.ligne.rect;
        check('elle ne couvre ni la ligne du prix, ni le badge, ni une étiquette du Guide ou des scénarios', !(r.y < r1.yLive + 4 && r.y + r.h > r1.yLive - 4) && r.x + r.w <= r1.xAxe + 0.5 && r1.rects.every(q => !chevauche(r, q)),
          { r, yLive: r1.yLive, sous: r1.rects.filter(q => chevauche(r, q)) });
      }
      // À son heure : elle part sans redessiner le graphique.
      const dc1 = await o.page.evaluate(() => window.__dc);
      await o.page.evaluate(() => { if (apprMsg) { apprMsg.fin = Date.now(); clearTimeout(apprMinuterie); apprVerifierFin(); } });
      await o.page.waitForTimeout(200);
      const r2 = await o.page.evaluate(() => ({ dc: window.__dc, msg: !!apprMsg, ligne: !!apprEtat.ligne }));
      check(`à son heure, la ligne part (calque seul : ${r2.dc - dc1} dessin du graphique)`, !r2.msg && !r2.ligne && r2.dc === dc1, r2);
      // « Aide à la lecture » : les deux cases, décochées.
      // La bande du dessous (sous la bande franchie : celle-ci ne se redit pas avant 15 min).
      const rb = await repereDessous(o.page, rd.lo);
      await o.page.click('#indDropdownBtn');
      await o.page.waitForTimeout(200);
      const m0 = await o.page.evaluate(() => {
        const t = document.querySelector('#indMenu .aff-aide-titre'), cases = [...document.querySelectorAll('#indMenu .aff-aide')];
        return { titre: t ? t.textContent : null, cases: cases.map(c => ({ k: c.dataset.aide, coche: c.querySelector('input').checked, texte: c.innerText })), texte: document.getElementById('indMenu').innerText };
      });
      check(`« Choisir l’affichage » : « ${m0.titre} », deux cases cochées d’origine (${m0.cases.map(c => c.k).join(', ')})`,
        m0.titre === 'Aide à la lecture' && m0.cases.length === 2 && m0.cases.every(c => c.coche) && m0.cases[0].k === 'evenements' && m0.cases[1].k === 'marques', m0.cases);
      check('ni « Débutant » ni « Expert » écrit dans le panneau', !MODES_ECRITS.test(m0.texte), null);
      // Un message en cours, puis la case décochée : il part aussitôt.
      if (rb) {
        await o.page.click('#indDropdownBtn');
        await prix(o, rb.lo - Math.max(2, (rb.hi - rb.lo) * 0.3));
        const avant = await o.page.evaluate(() => !!apprEtat.ligne);
        await o.page.click('#indDropdownBtn');
        await o.page.waitForTimeout(200);
        await o.page.click('#indMenu .aff-aide[data-aide="evenements"] input');
        await o.page.click('#indMenu .aff-aide[data-aide="marques"] input');
        await o.page.waitForTimeout(200);
        const r3 = await o.page.evaluate(() => { dessinerCalque(); return { ligne: !!apprEtat.ligne, msg: !!apprMsg, marque: apprEtat.marque, choix: Object.assign({}, apprChoix), stocke: localStorage.getItem('samsara-apprendre-v1') }; });
        check(`un message en cours (${avant ? 'posé' : 'absent'}), puis les deux cases décochées : la ligne part aussitôt, plus de marque ; gardé (${r3.stocke})`,
          avant && !r3.ligne && !r3.msg && !r3.marque && r3.choix.evenements === false && r3.choix.marques === false && /"evenements":false/.test(r3.stocke || '') && /"marques":false/.test(r3.stocke || ''), r3);
        await o.page.click('#indDropdownBtn');
        await o.page.waitForTimeout(200);
      }
      // Rechargé : le choix est gardé ; un nouveau franchissement ne dit rien.
      await o.page.reload();
      await attendre(o.page, false);
      await o.page.click('#indDropdownBtn');
      await o.page.waitForTimeout(200);
      const m1 = await o.page.evaluate(() => [...document.querySelectorAll('#indMenu .aff-aide input')].map(i => i.checked));
      await o.page.click('#indDropdownBtn');
      await o.page.waitForTimeout(200);
      const rd3 = await repereDessus(o.page);
      if (rd3) await prix(o, rd3.hi + Math.max(2, (rd3.hi - rd3.lo) * 0.3));
      const e4 = await cadre(o.page);
      check(`rechargé : les cases restent décochées (${m1.join(', ')}) ; le prix franchit une bande, rien n’est dit ; aucune marque`, m1.length === 2 && m1.every(c => !c) && !!rd3 && !e4.msg && !e4.ligne && !e4.marque && e4.points === 0, { m1, msg: e4.msg, marque: e4.marque });
      check('aucune erreur JavaScript ; pas de défilement horizontal', !o.erreurs.length && !e4.defile, o.erreurs);
      await o.ctx.close();
    }
  } catch (e) {
    check('déroulé du test', false, e.message + ' ' + (e.stack || '').split('\n').slice(1, 3).join(' '));
  } finally {
    await nav.close(); serveur.close();
  }
  console.log(ko ? `\n❌ APPRENDRE À L'ÉCRAN : ${ko} contrôle(s) en échec` : '\n✅ APPRENDRE À L\'ÉCRAN : TOUS LES CONTRÔLES PASSENT');
  process.exit(ko ? 1 : 0);
})();
