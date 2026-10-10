// Les figures PASSÉES dans un vrai navigateur (Chromium, Playwright), sur les bougies réelles de la
// fixture 15 min (plan §8 et §5.2 ; la sélection pure est contrôlée par test_figures_passees.js).
//
//   1. LISIBLE (1440 au survol, 390 au toucher) :
//      · la vue suit la dernière bougie : aucune figure passée, aucun texte de plus ;
//      · la vue glisse dans le passé : UNE figure passée exactement, celle de la sélection pure
//        (Guide.figuresPassees), validée, entière dans la vue, avec la marque de son issue tracée ;
//        tracée en points ronds, sous la figure en cours, jamais avec une pastille « à confirmer » ;
//        son libellé prend une place du budget (au plus 5 textes sur le tracé, journal de fillText) ;
//      · sa bulle : le résumé d'abord (4 lignes et 3 nombres au plus, sans « % » ni mot banni,
//        ce qui s'est passé ensuite, et le compte de la vue s'il tient), puis le détail au 2e
//        toucher ou au clic (le compte, « pas une prévision ni un conseil ») ;
//      · retour au présent : plus rien ; un vrai glisser de souris (1440) : la page = la sélection pure ;
//      · le menu du Lisible n'a pas l'option.
//   2. COMPLET (1440 et 390) : « Figures passées » non par défaut (rien, pas de ligne du compte) ;
//      « validées seulement » puis « toutes » choisies dans le menu : au plus 6, celles de la
//      sélection pure, dessous les figures en cours, chacune sa marque et sa bulle ; la ligne du
//      compte = un recompte indépendant (les échecs dits) ; le choix est gardé au rechargement
//      (localStorage samsara-figures-passees-v1). Aucun « Débutant » ni « Expert » écrit.
//   3. JUSTES QUAND L'HISTORIQUE S'ALLONGE AU DÉBUT (les pages plus anciennes arrivent après la
//      1re) et QUAND UNE BOUGIE SE FERME : les mêmes figures passées, par leurs dates.
//   Partout : aucune erreur JavaScript ; pas de défilement horizontal à 390 px.
// Sans Playwright : « non exécuté », dit à l'écran (ce n'est pas un succès).
// USAGE   node tests/test_figures_passees_page.js
const fs = require('fs'), path = require('path'), http = require('http');
const REPO = path.resolve(__dirname, '..');
const G = require(path.join(REPO, 'js/guide.js'));

let playwright = null;
for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright', process.env.PLAYWRIGHT_MODULE].filter(Boolean)) {
  try { playwright = require(p); break; } catch (e) { /* suivant */ }
}
if (!playwright) {
  console.log('  − NON EXÉCUTÉ : Playwright introuvable — les figures passées ne sont pas vérifiées à l\'écran sur ce poste.');
  process.exit(0);
}
let ko = 0;
const check = (nom, ok, det) => { if (!ok) ko++; console.log(`  ${ok ? '✓' : '✗'} ${nom}${!ok && det !== undefined ? ' — ' + JSON.stringify(det).slice(0, 700) : ''}`); };
const titre = t => console.log(`\n── ${t} ──`);
const sansBlancs = t => String(t).replace(/[\s  ]+/g, '');
const MODES_ECRITS = /\b(Débutant|Expert)\b/;

// ── Binance simulé sur la fixture : la dernière bougie est en cours ──
const K = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'bougies-btcusdt-15m.json'), 'utf8')).bougies.map(k => [Math.round(k[0] / 1000), +k[1], +k[2], +k[3], +k[4], +k[5]]);
const PAS = 9e5;
const etat = { iC: K.length - 1, retenir: false, attente: [] };
function binance(url) {
  const u = new URL(url), q = u.searchParams, x = K[etat.iC], live = x[4];
  if (u.pathname.endsWith('/klines')) {
    const lim = Math.min(1000, +q.get('limit') || 500), fin = q.get('endTime') ? +q.get('endTime') : Infinity;
    const serie = K.slice(0, etat.iC).concat([[x[0], x[1], Math.max(x[1], live), Math.min(x[1], live), live, x[5]]]).filter(y => y[0] * 1000 <= fin);
    return serie.slice(-lim).map(y => [y[0] * 1000, String(y[1]), String(y[2]), String(y[3]), String(y[4]), String(y[5]), y[0] * 1000 + PAS - 1, String(y[5] * y[4]), 100, String(y[5] / 2), String(y[5] * y[4] / 2), '0']);
  }
  if (u.pathname.endsWith('/ticker/24hr')) return { symbol: 'BTCUSDT', lastPrice: String(live), openPrice: String(K[etat.iC - 96][1]), priceChangePercent: '0', highPrice: String(live * 1.01), lowPrice: String(live * 0.99), volume: '1000', quoteVolume: '1e9', count: 100 };
  if (u.pathname.endsWith('/ticker/price')) return { price: String(live) };
  if (u.pathname.endsWith('/time')) return { serverTime: x[0] * 1000 + Math.round(PAS * 0.6) };
  return {};
}
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const serveur = http.createServer((req, res) => {
  const f = path.join(REPO, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(REPO) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

/** Ouvre la page. o : mode ('debutant' | 'expert'), w, h, fp (choix mémorisé), retenir (les pages
 *  plus anciennes de l'historique attendent etat.attente). Le stockage n'est vidé qu'au 1er
 *  chargement de l'onglet : un rechargement garde le choix. */
async function ouvrir(nav, o) {
  etat.retenir = !!o.retenir; etat.attente = [];
  const tactile = o.w < 500;
  const ctx = await nav.newContext({ viewport: { width: o.w, height: o.h }, deviceScaleFactor: 1, hasTouch: tactile, isMobile: tactile });
  await ctx.clock.install({ time: K[etat.iC][0] * 1000 + Math.round(PAS * 0.6) });
  const page = await ctx.newPage();
  const erreurs = [];
  page.on('pageerror', e => erreurs.push(e.message));
  await page.route('**/*', r => {
    const u = r.request().url(), h = new URL(u).host, cors = { 'access-control-allow-origin': '*' };
    if (h.startsWith('127.0.0.1')) return r.continue();
    if (h === 'api.binance.com' || h === 'data-api.binance.vision') {
      const servir = () => r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(binance(u)) });
      if (etat.retenir && /[?&]endTime=/.test(u)) { etat.attente.push(servir); return; }
      return servir();
    }
    if (h === 'raw.githubusercontent.com') return r.fulfill({ status: 404, headers: cors, body: '' });
    return r.abort();
  });
  await page.addInitScript(([m, fp]) => {
    try {
      if (!sessionStorage.getItem('__ouvert')) {
        sessionStorage.setItem('__ouvert', '1');
        localStorage.clear();
        localStorage.setItem('samsara-theme', 'aero'); localStorage.setItem('samsara-mode', m); localStorage.setItem('samsara-scenarios-v1', '0');
        if (fp) localStorage.setItem('samsara-figures-passees-v1', fp);
      }
    } catch (e) { /* */ }
    // Le journal des textes dessinés, actif entre deux marqueurs ; l'ordre des tracés de figures.
    window.__ft = []; window.__ftOn = false;
    const f0 = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (t, x, y) {
      if (window.__ftOn) window.__ft.push({ c: this.canvas && this.canvas.id, t: String(t), x, y });
      return f0.apply(this, arguments);
    };
  }, [o.mode, o.fp || null]);
  await page.goto(`http://127.0.0.1:${serveur.address().port}/index.html`);
  await attendre(page, o.retenir ? 1000 : K.length);
  return { ctx, page, erreurs, tactile };
}
/** Attend que la page ait n bougies et un rejeu des figures fini (pas de rejeu à froid en cours). */
async function attendre(page, n) {
  await page.waitForFunction(n => typeof candles !== 'undefined' && candles.length >= n && typeof guideEtat !== 'undefined' && guideEtat
    && GUIDE_FORMES.val && !GUIDE_FROID, n, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(400);
  // Le tracé des figures, journalisé : passee (true) ou figure en cours (false), dans l'ordre.
  await page.evaluate(() => {
    if (window.__tr) return;
    window.__tr = [];
    const t0 = guideFigureTracer;
    guideFigureTracer = function (E, f, passee) { window.__tr.push(!!passee); return t0.apply(this, arguments); };
  });
}
/** Met la vue sur [vs, ve) et dessine, journalisé ; rend l'état des figures passées. */
const vue = (page, vs, ve) => page.evaluate(([vs, ve]) => {
  crossX = crossY = null; bulleDetail = null;
  if (vs !== null) { viewStart = vs; viewEnd = ve; }
  window.__ft = []; window.__tr = []; window.__ftOn = true;
  drawChart();
  window.__ftOn = false;
  const E = guideEtat, R = GUIDE_FORMES.val, W = canvas.width / devicePixelRatio, mainH = geo.mainH, xAxe = W - 75;
  const fil = (NOMS_PAIRES[activeSymbol] || activeSymbol) + '  ·  ' + Guide.nomIntervalle(chartInterval);
  const trace = window.__ft.filter(e => (e.c === 'chart' || e.c === 'chartCalque') && e.t !== fil && e.x >= 14 && e.x < xAxe && e.y >= 0 && e.y <= mainH - 20).map(e => e.t);
  const Pz = E.passees, mode = document.documentElement.getAttribute('data-mode');
  // La sélection pure, avec les mêmes entrées que la page.
  const pur = R ? Guide.figuresPassees(R, viewStart, viewEnd, figuresPasseesChoix, mode, { exclure: f => E.formes.includes(f) }) : null;
  const d = f => ({ type: f.type, fin: f.fin, ebauche: !!f.ebauche, debut: f.debut, jConf: f.jConf, jFin: f.jFin, id: Guide.idFigure(f, cols().time), marque: Guide.marqueIssue(f) });
  const cibles = E.cibles.filter(c => c.passee);
  return {
    n: candles.length, vs: viewStart, ve: viewEnd, Rn: R ? R.n : null, mode, choix: figuresPasseesChoix, W, mainH,
    liste: Pz ? Pz.liste.map(d) : null, compte: Pz ? Pz.compte : null, present: Pz ? Pz.present : null, ligne: Pz && Pz.ligne ? Pz.ligne : null,
    memePur: !!(Pz && pur) && Pz.liste.length === pur.liste.length && Pz.liste.every((f, k) => f === pur.liste[k]) && JSON.stringify(Pz.compte) === JSON.stringify(pur.compte),
    cibles: cibles.map(c => ({ id: c.passee.id, marque: c.passee.marque, titre: c.titre, rects: c.rects.length, zones: c.zones.length })),
    deb: E.passeeDeb ? { id: Guide.idFigure(E.passeeDeb.f, cols().time), st: { dash: E.passeeDeb.tr.st.dash, passee: !!E.passeeDeb.tr.st.passee, aplat: E.passeeDeb.tr.st.aplat },
      marque: E.passeeDeb.tr.marque ? { t: E.passeeDeb.tr.marque.t } : null, item: E.passeeDeb.item ? E.passeeDeb.item.texte : null, entiere: E.passeeDeb.f.debut >= viewStart && E.passeeDeb.f.jFin < viewEnd } : null,
    items: debEtat ? debEtat.items.map(i => ({ role: i.role, texte: i.texte })) : null,
    courantes: E.deb ? (E.debForme ? [{ id: Guide.idFigure(E.debForme.f, cols().time), dash: E.debForme.tr.st.dash, t: E.debForme.t || '' }] : []) : (E.figures || []).map(x => ({ id: Guide.idFigure(x.f, cols().time), dash: x.tr.st.dash, t: (x.lignes || []).join(' ') })),
    trace, ordre: window.__tr.slice(), scroll: document.documentElement.scrollWidth - window.innerWidth,
  };
}, [vs, ve]);
/** Le point où survoler (ou toucher) la figure passée : son libellé, sinon sa marque — un point
 *  dont la cible est bien elle (guideCibleSous). */
const pointPassee = (page, k) => page.evaluate(k => {
  const b = canvas.getBoundingClientRect(), mainH = geo.mainH;
  const C = guideEtat.cibles.filter(c => c.passee);
  for (const c of k === null ? C : [C[k]].filter(Boolean)) {
    for (const r of (c.rects || []).concat(c.zones || [])) {
      const x = (r.x0 + r.x1) / 2, y = (r.y0 + r.y1) / 2;
      if (guideCibleSous(x, y, mainH) === c) return { x: b.left + x, y: b.top + y, id: c.passee.id };
    }
  }
  return null;
}, k);
const lireBulle = page => page.evaluate(() => {
  const E = guideEtat;
  return E.survol && E.survol.passee ? { id: E.survol.passee.id, titre: E.survol.titre, texte: E.survol.texte.join(' '), corps: E.bulle ? E.bulle.corps.join(' ') : '', resume: !!(E.bulle && E.bulle.resume),
    lignes: E.bulle ? E.bulle.lignes : null, nombres: E.bulle ? E.bulle.nombres : null, b: E.bulle ? { y: E.bulle.y, h: E.bulle.h } : null, mainH: geo.mainH, P: PARAM.guide.debutant } : null;
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
/** Le recompte indépendant de la vue (dans la page, sur le rejeu) : validées terminées, cibles atteintes, tombées. */
const recompte = page => page.evaluate(() => {
  const R = GUIDE_FORMES.val, j = R.n - 1, a = viewStart, z = viewEnd;
  const dans = f => Number.isFinite(f.jFin) && f.jFin <= j && f.jFin >= a && f.jFin < z;
  const V = R.formes.filter(f => !f.doublon && !f.ebauche && Number.isFinite(f.jConf) && ['atteint', 'invalide', 'expire'].includes(f.fin) && dans(f));
  return { validees: V.length, atteintes: V.filter(f => f.fin === 'atteint').length };
});
/** Les cibles atteintes que dit la ligne du compte (le reste des validées les a manquées) : en
 *  mots (« aucune n’a », « toutes ont », « les deux ont », « elle a ») ou le 2e nombre. */
const lireAtteintes = (t, nb) => (/aucune n’a|elle n’a pas/.test(t) ? 0 : /toutes ont|les deux ont/.test(t) ? nb[0] : /elle a atteint/.test(t) ? 1 : nb[1]);
/** Le choix que montre le panneau : la case « Figures passées » (décochée : 'non'), puis, cochée, la
 *  liste « validées seulement / toutes ». */
const VALEUR_MENU = () => { const c = document.getElementById('figPassees'), q = document.getElementById('figPasseesQuelles'); return !c ? null : !c.checked ? 'non' : q ? q.value : null; };
/** Toucher (ou survoler) hors du graphique, là où rien ne répond : le milieu du prix de l'en-tête. Le coin de
 *  l'écran ne convient plus au doigt : la zone de toucher de la paire (40 px de haut) en est tout près, et
 *  Chromium y ramène un toucher voisin (le menu des paires s'ouvrait). */
async function ailleurs(o) {
  if (!o.tactile) return o.page.mouse.move(2, 2);
  const r = await o.page.evaluate(() => { const q = document.getElementById('price').getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2 }; });
  await o.page.touchscreen.tap(r.x, r.y).catch(() => {});
}
/** Choisit dans le panneau « Choisir l'affichage » comme un utilisateur (la case, puis la liste), puis le referme. */
async function choisir(o, v) {
  await o.page.click('#indDropdownBtn');
  await o.page.waitForTimeout(200);
  const coche = await o.page.evaluate(() => document.getElementById('figPassees').checked);
  if (coche !== (v !== 'non')) { await o.page.click('#figPassees'); await o.page.waitForTimeout(150); }
  if (v !== 'non') await o.page.selectOption('#figPasseesQuelles', v);
  const lu = await o.page.evaluate(f => ({ choix: figuresPasseesChoix, stocke: localStorage.getItem('samsara-figures-passees-v1'), select: (0, eval)('(' + f + ')')(),
    texte: document.querySelector('label.ind-passees').innerText }), VALEUR_MENU.toString());
  await o.page.click('#indDropdownBtn');   // le referme
  await o.page.waitForTimeout(250);
  return lu;
}

(async () => {
  await new Promise(r => serveur.listen(0, '127.0.0.1', r));
  const nav = await playwright.chromium.launch();
  try {
    // ── 1. Lisible ──
    for (const [w, h, largeur] of [[1440, 900, 150], [390, 844, 90]]) {
      titre(`1. Lisible · ${w} px (${w < 500 ? 'toucher' : 'survol'})`);
      const o = await ouvrir(nav, { mode: 'debutant', w, h });
      const n = await o.page.evaluate(() => candles.length);
      const p0 = await vue(o.page, n - largeur, n);
      check(`la vue suit la dernière bougie (${p0.n} bougies) : aucune figure passée, aucun libellé « passee », aucune cible`, p0.mode === 'debutant' && p0.present && p0.liste && !p0.liste.length && !p0.deb && !p0.cibles.length
        && !p0.items.some(i => i.role === 'passee') && p0.trace.length <= 5, p0);
      // Une vue du passé où la figure passée a son libellé (il reste une place dans le budget).
      let p = null, essais = 0;
      for (let ve = n - 40; ve > largeur + 50 && !p; ve -= 9) {
        const r = await vue(o.page, ve - largeur, ve);
        essais++;
        if (r.deb && r.deb.item) p = r;
      }
      check(`vue dans le passé trouvée (${essais} essais${p ? ', bougies ' + p.vs + '–' + p.ve : ''}) : une figure passée avec son libellé`, !!p, null);
      if (!p) { await o.ctx.close(); continue; }
      const f = p.liste[0];
      check(`exactement UNE figure passée (${f.type}, ${f.fin}), celle de la sélection pure (Guide.figuresPassees) : validée, terminée, entière dans la vue`,
        p.liste.length === 1 && p.memePur && !f.ebauche && Number.isFinite(f.jConf) && ['atteint', 'invalide', 'expire'].includes(f.fin) && p.deb.entiere && f.jFin <= p.Rn - 1 && !p.present, p.liste);
      check(`la marque de son issue est tracée (« ${p.deb.marque && p.deb.marque.t} » = Guide.marqueIssue) ; une seule cible « passée »`, p.deb.marque && p.deb.marque.t === f.marque && p.cibles.length === 1 && p.cibles[0].marque === f.marque, { deb: p.deb, cibles: p.cibles });
      check('un contour léger en points ronds, sans aplat, jamais le style d’une figure en cours ; jamais « à confirmer » ni « à valider »', p.deb.st.passee && p.deb.st.aplat === 0 && p.deb.st.dash[0] < 0.5
        && p.courantes.every(c => !c.dash.length || c.dash[0] >= 1) && !p.courantes.some(c => c.id === p.deb.id) && !/à confirmer|à valider/.test(p.deb.item), { deb: p.deb, courantes: p.courantes });
      check(`dessinée SOUS la figure en cours (ordre des tracés : ${p.ordre.map(x => (x ? 'passée' : 'en cours')).join(', ')})`, p.ordre.includes(true) && (p.ordre.indexOf(false) === -1 || p.ordre.lastIndexOf(true) < p.ordre.indexOf(false)), p.ordre);
      const libelle = G.libellePassee({ type: f.type, fin: f.fin }, 26);
      check(`son libellé « ${p.deb.item} » (Guide.libellePassee, la marque d’abord) prend une place du budget : ${p.trace.length} textes sur le tracé (≤ 5), autant que le registre`,
        p.deb.item === libelle && p.deb.item.indexOf(f.marque) === 0 && p.items.filter(i => i.role === 'passee').length === 1 && p.trace.length <= 5 && p.items.length <= 5
        && p.trace.length === p.items.length && p.items.every(i => p.trace.includes(i.texte)), { trace: p.trace, items: p.items });
      check('aucun mot banni, aucun « % », ni « Débutant » ni « Expert » sur le tracé', p.trace.every(t => !G.motsBannis(t).length && !/%/.test(t) && !MODES_ECRITS.test(t)), p.trace);
      // La bulle : le résumé, puis le détail.
      const pt = await pointPassee(o.page, 0);
      check(`un point de son libellé (ou de sa marque) mène à sa bulle`, !!pt && pt.id === p.deb.id, pt);
      if (pt) {
        await montrer(o, pt);
        const b1 = await lireBulle(o.page);
        const cpt = G.texteComptePassees(p.compte, 'debutant', 'validees'), cptDans = t => cpt.some(v => sansBlancs(t).includes(sansBlancs(v)));
        check(`${o.tactile ? '1er toucher' : 'survol'} : le RÉSUMÉ (« ${b1 && b1.titre} ») — ${b1 && b1.lignes} lignes (≤ ${b1 && b1.P.bulleLignes}), ${b1 && b1.nombres} nombres (≤ ${b1 && b1.P.bulleNombres}), ce qui s’est passé ensuite`,
          b1 && b1.id === p.deb.id && b1.resume && b1.titre.indexOf(f.marque + ' Exemple passé : ') === 0 && b1.lignes <= b1.P.bulleLignes && b1.nombres <= b1.P.bulleNombres
          && /Après sa validation, le prix/.test(b1.corps) && b1.b.y >= 0 && b1.b.y + b1.b.h <= b1.mainH, b1);
        check('… sans « % », sans mot banni, sans conseil ; le compte de la vue y est s’il tient, sinon dans le détail', b1 && !/%/.test(b1.titre + b1.corps) && !G.motsBannis(b1.titre + ' ' + b1.corps).length
          && !MODES_ECRITS.test(b1.titre + b1.corps) && !/achet|vend|recommand/i.test(b1.corps) && (cptDans(b1.corps) || cptDans(b1.texte)), b1 && { corps: b1.corps, cpt });
        console.log(`  · résumé : ${b1 ? b1.corps : '—'}${b1 && cptDans(b1.corps) ? '' : '  (compte : dans le détail)'}`);
        await detail(o, pt);
        const b2 = await lireBulle(o.page);
        check(`${o.tactile ? '2e toucher' : 'clic'} : le DÉTAIL — la définition, la validation, l’issue, le compte de la vue, « pas une prévision ni un conseil » ; sans « % » ni mot banni`,
          b2 && b2.id === p.deb.id && !b2.resume && /Figure validée/.test(b2.corps) && cptDans(b2.corps) && /pas une prévision ni un conseil/.test(b2.corps.replace(/\s+/g, ' '))
          && !/%/.test(b2.titre + b2.corps) && !G.motsBannis(b2.titre + ' ' + b2.corps).length && !MODES_ECRITS.test(b2.corps), b2 && b2.corps.slice(0, 500));
        await ailleurs(o);
      }
      // Retour au présent.
      const p2 = await vue(o.page, n - largeur, n);
      check('retour au présent : la figure passée disparaît (ni tracé, ni libellé, ni cible)', p2.present && !p2.liste.length && !p2.deb && !p2.cibles.length && !p2.items.some(i => i.role === 'passee') && !p2.ordre.includes(true), p2);
      if (!o.tactile) {
        // Un vrai glisser de souris vers le passé : la page = la sélection pure, à chaque image.
        await o.page.evaluate(([vs, ve]) => { viewStart = vs; viewEnd = ve; drawChart(); }, [n - largeur, n]);
        const b = await o.page.evaluate(() => { const r = canvas.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + geo.mainH / 2 }; });
        await o.page.mouse.move(b.x, b.y); await o.page.mouse.down();
        for (let k = 1; k <= 12; k++) await o.page.mouse.move(b.x + k * 50, b.y);
        await o.page.mouse.up(); await o.page.mouse.move(2, 2);
        await o.page.waitForTimeout(400);
        const p3 = await vue(o.page, null, null);
        check(`un vrai glisser de souris (bougies ${p3.vs}–${p3.ve} sur ${p3.n}) : la page montre la sélection pure (${p3.liste.length} figure passée)`, p3.ve < p3.n && p3.memePur && p3.liste.length <= 1 && p3.cibles.length === p3.liste.length, p3);
      } else check(`${w} px : pas de défilement horizontal`, p.scroll <= 0, p.scroll);
      // Le menu du Lisible n'a pas l'option.
      await o.page.click('#indDropdownBtn'); await o.page.waitForTimeout(200);
      const menu = await o.page.evaluate(() => ({ option: !!document.getElementById('figPassees'), texte: document.getElementById('indMenu').innerText }));
      check('le menu du Lisible n’a pas l’option « Figures passées »', !menu.option && !/Figures passées/.test(menu.texte), menu.option);
      await o.page.click('#indDropdownBtn');
      check(`${w} px : aucune erreur JavaScript`, !o.erreurs.length, o.erreurs);
      await o.ctx.close();
    }

    // ── 2. Complet ──
    for (const [w, h, largeur] of [[1440, 900, 220], [390, 844, 120]]) {
      titre(`2. Complet · ${w} px (${w < 500 ? 'toucher' : 'survol'})`);
      const o = await ouvrir(nav, { mode: 'expert', w, h });
      const n = await o.page.evaluate(() => candles.length);
      // Une vue où « toutes » montre au moins une figure tombée avant sa validation et « validées » au moins 3.
      const v = await o.page.evaluate(L => {
        const R = GUIDE_FORMES.val, n = candles.length;
        for (let ve = n - 60; ve > L + 50; ve -= 11) {
          const a = Guide.figuresPassees(R, ve - L, ve, 'validees', 'expert'), t = Guide.figuresPassees(R, ve - L, ve, 'toutes', 'expert');
          if (a.liste.length >= 3 && t.liste.some(f => f.ebauche || !['atteint', 'invalide', 'expire'].includes(f.fin)) && a.compte.validees > a.compte.atteintes) return [ve - L, ve];
        }
        return null;
      }, largeur);
      check(`vue du passé trouvée (bougies ${v && v.join('–')}) : des figures validées, des échecs, des tombées`, !!v, null);
      if (!v) { await o.ctx.close(); continue; }
      const p0 = await vue(o.page, v[0], v[1]);
      check('« Figures passées » : non par défaut — aucune figure passée, aucune ligne du compte', p0.mode === 'expert' && p0.choix === 'non' && !p0.liste.length && !p0.cibles.length && !p0.ligne && !p0.ordre.includes(true)
        && !p0.trace.some(t => /Dans cette vue|Figures passées/.test(t)), { choix: p0.choix, liste: p0.liste, ligne: p0.ligne });
      for (const ch of ['validees', 'toutes']) {
        const m = await choisir(o, ch);
        check(`menu : « ${m.texte.split('\n')[0]} » → « ${ch} », gardé sous samsara-figures-passees-v1 ; ni « Débutant » ni « Expert » écrit`, m.choix === ch && m.stocke === ch && m.select === ch && !MODES_ECRITS.test(m.texte), m);
        const p = await vue(o.page, v[0], v[1]);
        const rc = await recompte(o.page);
        const tomb = p.liste.filter(f => f.ebauche || !['atteint', 'invalide', 'expire'].includes(f.fin));
        check(`« ${ch} » : ${p.liste.length} figures passées (≤ 6), celles de la sélection pure, la plus récente d’abord${ch === 'toutes' ? ', dont ' + tomb.length + ' tombées avant leur validation' : ', toutes validées'}`,
          p.liste.length >= 1 && p.liste.length <= 6 && p.memePur && (ch === 'toutes' ? tomb.length > 0 : !tomb.length) && p.liste.every((f, k) => !k || f.jFin <= p.liste[k - 1].jFin), p.liste.map(f => f.type + ':' + f.fin));
        check('chacune sa marque d’issue et sa cible ; aucune n’est une figure en cours', p.cibles.length === p.liste.length && p.cibles.every((c, k) => c.marque === p.liste[k].marque && c.titre.indexOf(c.marque + ' Passée · ') === 0)
          && !p.courantes.some(c => p.liste.some(f => f.id === c.id)), { cibles: p.cibles, courantes: p.courantes.map(c => c.id) });
        check(`dessinées SOUS les figures en cours (${p.ordre.filter(x => x).length} passées, puis ${p.ordre.filter(x => !x).length} en cours)`, p.ordre.filter(x => x).length === p.liste.length && (p.ordre.indexOf(false) === -1 || p.ordre.lastIndexOf(true) < p.ordre.indexOf(false)), p.ordre);
        const V = G.texteComptePassees(p.compte, 'expert', ch, p.liste.length);
        const nb = p.ligne ? (p.ligne.texte.match(/\d+/g) || []).map(Number) : [];
        check(`la ligne du compte « ${p.ligne && p.ligne.texte} » : dessinée, = Guide.texteComptePassees, et = le recompte (${rc.validees} validées, ${rc.atteintes} cibles atteintes${ch === 'toutes' ? ', ' + p.compte.tombees + ' tombées' : ''})`,
          p.ligne && V.includes(p.ligne.texte) && p.trace.includes(p.ligne.texte) && p.compte.validees === rc.validees && p.compte.atteintes === rc.atteintes
          && nb[0] === rc.validees && lireAtteintes(p.ligne.texte, nb) === rc.atteintes && (ch !== 'toutes' || nb.includes(p.compte.tombees)), { ligne: p.ligne, V, rc });
        check('aucun mot du Lisible imposé, ni « Débutant » ni « Expert », ni conseil sur le tracé', p.trace.every(t => !MODES_ECRITS.test(t) && !/achetez|vendez|recommand/i.test(t)), p.trace);
        // La bulle d'une figure passée (survol de sa marque, ou toucher).
        const pt = await pointPassee(o.page, null);
        check('la marque d’une figure passée mène à sa bulle', !!pt, null);
        if (pt) {
          await montrer(o, pt);
          const b = await lireBulle(o.page);
          check(`bulle « ${b && b.titre} » : ce qui s’est passé ensuite, le compte de la vue, « pas une prévision ni une recommandation », entière dans le tracé`,
            b && b.id === pt.id && /^Exemple passé : (validé|jamais validé)/.test(b.texte) && sansBlancs(b.texte).includes(sansBlancs(V[0])) && /pas une prévision ni une recommandation/.test(b.texte)
            && !MODES_ECRITS.test(b.titre + b.texte) && b.b.y >= 0 && b.b.y + b.b.h <= b.mainH, b && { titre: b.titre, texte: b.texte.slice(0, 400), b: b.b });
          await ailleurs(o);
        }
        if (o.tactile) check(`${w} px : pas de défilement horizontal`, p.scroll <= 0, p.scroll);
      }
      // Le choix est gardé au rechargement.
      await o.page.reload();
      await attendre(o.page, K.length);
      const r = await vue(o.page, v[0], v[1]);
      await o.page.click('#indDropdownBtn'); await o.page.waitForTimeout(200);
      const sel = await o.page.evaluate(f => (0, eval)('(' + f + ')')(), VALEUR_MENU.toString());
      check(`rechargement : « toutes » est relu (samsara-figures-passees-v1), dans le menu et sur le graphique (${r.liste.length} figures passées)`, r.choix === 'toutes' && sel === 'toutes' && r.liste.length >= 1 && r.memePur && !!r.ligne, { choix: r.choix, sel, n: r.liste.length });
      check(`${w} px : aucune erreur JavaScript`, !o.erreurs.length, o.erreurs);
      await o.ctx.close();
    }

    // ── 3. L'historique qui s'allonge au début ; une bougie qui se ferme ──
    titre('3. Historique allongé au début, bougie fermée : les mêmes figures passées (par leurs dates)');
    {
      const o = await ouvrir(nav, { mode: 'expert', w: 1440, h: 900, fp: 'toutes', retenir: true });
      const n1 = await o.page.evaluate(() => candles.length);
      const ids = r => r.liste.map(f => f.id).join(';');
      // Des vues de la 1re page, loin de son début (le rejeu y a oublié son point de départ).
      const vues = [[n1 - 260, n1 - 60], [n1 - 420, n1 - 230], [n1 - 560, n1 - 400]];
      const avant = [];
      for (const [vs, ve] of vues) { const r = await vue(o.page, vs, ve); avant.push({ t0: await o.page.evaluate(i => candles[i].time, vs), t1: await o.page.evaluate(i => candles[i].time, ve), ids: ids(r), compte: JSON.stringify(r.compte), k: r.liste.length }); }
      // Les pages plus anciennes sont demandées quand la page est au calme : on les attend, puis on les sert.
      for (let k = 0; k < 60 && !etat.attente.length; k++) await o.page.waitForTimeout(200);
      await o.page.waitForTimeout(400);
      const attente = etat.attente.splice(0);
      etat.retenir = false;
      for (const s of attente) await s();
      await attendre(o.page, K.length);
      const n2 = await o.page.evaluate(() => candles.length);
      const mal = [];
      for (const a of avant) {
        const [vs, ve] = await o.page.evaluate(([t0, t1]) => [candles.findIndex(c => c.time === t0), candles.findIndex(c => c.time === t1)], [a.t0, a.t1]);
        const r = await vue(o.page, vs, ve);
        if (ids(r) !== a.ids || JSON.stringify(r.compte) !== a.compte || !r.memePur) mal.push({ a, r: { ids: ids(r), compte: r.compte } });
      }
      check(`${attente.length} pages plus anciennes arrivées (${n1} → ${n2} bougies) : dans ${avant.length} vues (en dates, ${avant.map(a => a.k).join(' + ')} figures), les mêmes figures passées et le même compte`, attente.length > 0 && n2 > n1 && avant.every(a => a.k > 0) && !mal.length, mal.slice(0, 2));
      // Une bougie se ferme (la suivante est en cours) : même historique, rejeu repris.
      const r0 = await vue(o.page, vues[0][0] + (n2 - n1), vues[0][1] + (n2 - n1));
      await o.page.evaluate(() => {
        const d = candles[candles.length - 1];
        candles.push({ time: d.time + 900, open: d.close, high: d.close, low: d.close, close: d.close, volume: 0 });
        memoCache.clear();
      });
      const r1 = await vue(o.page, r0.vs, r0.ve);
      check(`une bougie se ferme (rejeu repris : ${r0.Rn} → ${r1.Rn}) : la même vue montre les mêmes figures passées`, r1.Rn === r0.Rn + 1 && ids(r1) === ids(r0) && JSON.stringify(r1.compte) === JSON.stringify(r0.compte) && r1.memePur, { r0: ids(r0), r1: ids(r1) });
      check('aucune erreur JavaScript', !o.erreurs.length, o.erreurs);
      await o.ctx.close();
    }
  } catch (e) {
    check('déroulé du test', false, e.message);
  } finally {
    await nav.close(); serveur.close();
  }
  console.log(ko ? `\n❌ FIGURES PASSÉES À L'ÉCRAN : ${ko} contrôle(s) en échec` : '\n✅ FIGURES PASSÉES À L\'ÉCRAN : TOUS LES CONTRÔLES PASSENT');
  process.exit(ko ? 1 : 0);
})();
