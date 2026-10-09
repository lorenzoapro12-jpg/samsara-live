// Le mode Débutant dans un vrai navigateur (Chromium, Playwright) : l'écran calme. Le prix, une
// phrase, un repère au-dessus, un repère au-dessous et le scénario n° 1 de Claude ; le détail au
// toucher ou au survol ; tout le reste derrière le bouton Expert.
//
//   1. BUDGET : au plus PARAM.guide.debutant.items (5) textes sur le tracé, chacun sur une ligne,
//      autant que d'entrées dans guideEtat.debutant.items — y compris quand des indicateurs
//      Expert sont allumés (ils restent choisis pour l'Expert, jamais dessinés ici).
//   2. LIMITES de caractères, et chaque texte DANS le tracé, en pixels (360 px compris).
//   3. MOTS : aucun mot de la liste Guide.MOTS_BANNIS_DEBUTANT, aucun conseil, ni « UTC », ni
//      « $82 », ni « 1.6B » — sur le graphique, dans la page (cartes ouvertes, menu ouvert), pour
//      les 11 thèmes ; dans les bulles, un terme technique seulement avec son explication.
//   4. RIEN NE SE CHEVAUCHE : les textes deux à deux, avec le badge du prix ; l'en-tête ; pas de
//      défilement de côté à 390 et 360 px ; la barre d'outils sur deux rangées au plus.
//   5. LE TEST DES 5 SECONDES : le prix (« 86 013 $ »), le verbe de la phrase, un repère de chaque
//      côté du prix, « Scénario 1 », la variation 24 h visible au téléphone.
//   6. ABSENTS en Débutant : compteur, pastille de la vue, régime, « Et ensuite ? », rangs 2, 3
//      et Semaine, repères numérotés, traits du point et de la fin, repère de publication, boutons
//      et puces Expert, Grid Bot, chiffres clés. ↺ reste (retour au présent).
//   7. BULLES : survol (bureau) ou toucher (téléphone) de chaque texte — la bonne cible, le
//      détail qui a quitté l'écran (état au prix, chemins, autres scénarios, journal, bilan), pas
//      d'infobulle des prix par-dessus, un curseur « main ».
//   8. ASTUCE : une fois (tactile : « Touchez… » ; souris : « Survolez… »), jamais sur un texte.
//   9. BASCULE (touche M) : l'Expert revient entier, remis en page ; retour au Débutant identique ;
//      mêmes valeurs dans les deux modes.
//  10. STRUCTURES de thème en Débutant : pastille « Infos du marché », manchette masquée.
//  11. SOBRIÉTÉ : survoler une cible ne redessine pas le graphique ; au repos, rien.
//
// Harnais de tests/test_guide_page.js : Binance simulé, fichier publié avec murs et options près
// du prix, scénarios du matin (tests/fixtures/previsions.json), horloge fixée au 08/10/2026 22:52
// UTC. fillText est journalisé (addInitScript) autour d'un drawChart() forcé.
// Sans Playwright : « non exécuté », dit à l'écran (ce n'est pas un succès).
// USAGE   node tests/test_debutant_page.js
const fs = require('fs'), path = require('path'), http = require('http');
const REPO = path.resolve(__dirname, '..');
const { previsionsFixture, previsionsAttente, estPrevisions } = require('./previsions-fixture');
const Guide = require('../js/guide.js');

let playwright = null;
for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright', process.env.PLAYWRIGHT_MODULE].filter(Boolean)) {
  try { playwright = require(p); break; } catch (e) { /* suivant */ }
}
if (!playwright) {
  console.log('  − NON EXÉCUTÉ : Playwright introuvable — le mode Débutant n\'est pas vérifié à l\'écran sur ce poste.');
  process.exit(0);
}
let ko = 0;
const check = (nom, ok, det) => { if (!ok) ko++; console.log(`  ${ok ? '✓' : '✗'} ${nom}${!ok && det !== undefined ? ' — ' + JSON.stringify(det).slice(0, 600) : ''}`); };
const titre = t => console.log(`\n── ${t} ──`);

const CONSEIL = /\b(achetez|vendez|achète[rz]?\b|vends\b|il faut (?:acheter|vendre)|entrez|sortez|prenez position|signal d['’]achat|signal de vente|recommand(?:e|ons))/i;
const BANNIS = Guide.MOTS_BANNIS_DEBUTANT, EXPLIQUES = Guide.EXPLIQUES_DEBUTANT;
const bannis = t => BANNIS.filter(re => re.test(t)).map(re => t.match(re)[0]);
// Les formats de l'Expert : « $82 », « 1.6B », « 54.8K » (A6) ; « UTC » est déjà dans la liste.
const FORMATS_EXPERT = [/\$\d/, /\d[.,]\d+[KMB]\b/];
/** Un texte de bulle : un terme technique n'y est permis qu'avec son explication (EXPLIQUES). */
function bannisBulle(t) {
  let s = t;
  for (const [terme, expl] of Object.entries(EXPLIQUES)) if (s.includes(expl)) s = s.split(terme).join('');
  return bannis(s);
}

const MAINTENANT = Date.parse('2026-10-08T22:52:00Z'), DECALAGE = MAINTENANT - Date.now();
const maintenant = () => Date.now() + DECALAGE;
// Binance simulé (celui de test_guide_page) : une sinusoïde autour de 86 000, prix fixe.
function binance(url) {
  const u = new URL(url), q = u.searchParams, now = maintenant();
  if (u.pathname.endsWith('/klines')) {
    const pas = { '1m': 6e4, '5m': 3e5, '15m': 9e5, '1h': 36e5, '4h': 144e5, '1d': 864e5, '1w': 6048e5 }[q.get('interval')] || 9e5;
    const n = Math.min(1000, +q.get('limit') || 500), fin = q.get('endTime') ? Math.min(+q.get('endTime'), now) : now;
    return Array.from({ length: n }, (_, i) => { const t = Math.floor((fin - (n - 1 - i) * pas) / pas) * pas, k = Math.round(t / pas), c = 86000 + Math.sin(k / 7) * 300, o = c + (k % 2 ? 40 : -40);
      return [t, String(o), String(Math.max(o, c) + 60), String(Math.min(o, c) - 60), String(c), '80', t + pas - 1, String(80 * c), 50, '40', String(40 * c), '0']; });
  }
  if (u.pathname.endsWith('/ticker/price')) return { price: '86012.5' };
  if (u.pathname.endsWith('/ticker/24hr')) return { lastPrice: '86012.5', openPrice: '85700', priceChangePercent: '0.4', highPrice: '87000', lowPrice: '85000', bidPrice: '86012.4', askPrice: '86012.6', quoteVolume: '1e9', count: '100' };
  return {};
}
const LU = new Date(Math.floor(maintenant() / 60000) * 60000).toISOString().replace('.000Z', '+00:00');
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

/** o = { vue, theme, tactile, prev ('complet' | 'ouvert' | 'ferme' | 'attente' | 'absent' | 'hier' | 'aucun'),
 *  mode ('debutant' par défaut), garder (ne pas vider le stockage : rechargement) }. */
async function ouvrir(nav, o) {
  const tactile = !!o.tactile;
  const ctx = o.ctx || await nav.newContext(Object.assign({ viewport: o.vue, deviceScaleFactor: 1 }, tactile ? { hasTouch: true, isMobile: true } : {}));
  if (!o.ctx) await ctx.clock.install({ time: maintenant() });
  const page = await ctx.newPage();
  const erreurs = [];
  page.on('pageerror', e => erreurs.push(e.message));
  await page.route('**/*', r => {
    const u = r.request().url(), h = new URL(u).host, cors = { 'access-control-allow-origin': '*' };
    if (h.startsWith('127.0.0.1')) return r.continue();
    if (h === 'api.binance.com') return r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(binance(u)) });
    if (h === 'raw.githubusercontent.com') {
      if (estPrevisions(u)) {
        const prev = o.prev || 'complet';
        if (prev === 'absent' || prev === 'aucun') return r.fulfill({ status: 404, headers: cors, body: '' });
        // ouvert : le rang 1 vise 86 900 puis 87 400, invalidation 84 800 — les bougies simulées
        // (86 000 ± 400) n'atteignent ni l'un ni l'autre : le scénario reste en cours.
        const ouvert = d => { const s = d.scenarios.find(x => x.rang === '1'); s.cibles = [86900, 87400]; s.invalidation = 84800; s.origines = { 86900: 'plus haut du 08/10', 87400: 'mur de calls', 84800: 'plus bas de la nuit' }; s.enonce = 'Hausse vers 86 900 puis 87 400'; };
        // range : le rang 1 devient un range plus haut que toute la vue (84 500 – 87 500) ; range2 :
        // un range dont les bords sont dans la vue (85 700 – 86 350) ; les bougies simulées
        // (86 000 ± 460) y restent : en cours.
        const range = (lo, hi) => d => { const s = d.scenarios.find(x => x.rang === '1'); Object.assign(s, { forme: 'range', cibles: [], invalidation: null, range: [lo, hi], origines: {}, enonce: 'Range' }); };
        const ferme = d => { const s = d.scenarios.find(x => x.rang === '1'); s.cibles = [89000, 90000]; s.invalidation = 86000; s.origines = {}; };
        return r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: prev === 'attente' ? previsionsAttente()
          : previsionsFixture(Object.assign({ maintenant: maintenant() }, prev === 'hier' ? { ilYaMs: 26 * 3600e3 } : prev === 'ferme' ? { modifier: ferme } : prev === 'ouvert' ? { modifier: ouvert }
            : prev === 'range' ? { modifier: range(84500, 87500) } : prev === 'range2' ? { modifier: range(85700, 86350) } : {})) });
      }
      if (u.includes('heatmap')) return r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: fs.readFileSync(path.join(REPO, 'heatmap.json')) });
      if (/\/master\/market-data\.json/.test(u)) return r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: MD });
      return r.fulfill({ status: 404, headers: cors, body: '' });
    }
    return r.abort();
  });
  // Le mode par défaut (stockage vide) est le Débutant ; le thème, la couche des scénarios.
  await page.addInitScript(([t, m, garder, sansScen]) => {
    try {
      if (!garder) localStorage.clear();
      localStorage.setItem('samsara-theme', t);
      if (m) localStorage.setItem('samsara-mode', m);
      if (sansScen) localStorage.setItem('samsara-scenarios-v1', '0');
    } catch (e) { /* */ }
  }, [o.theme || 'aero', o.mode || null, !!o.garder, o.prev === 'aucun']);
  // Le journal des textes dessinés (canvas, texte, x, y), actif entre deux marqueurs.
  await page.addInitScript(() => {
    window.__ft = []; window.__ftOn = false;
    const f0 = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (t, x, y) {
      if (window.__ftOn) window.__ft.push({ c: this.canvas && this.canvas.id, t: String(t), x, y });
      return f0.apply(this, arguments);
    };
  });
  await page.goto(`http://127.0.0.1:${serveur.address().port}/index.html`);
  await page.waitForFunction(() => typeof guideEtat !== 'undefined' && guideEtat && guideEtat.niveaux.length > 0 && typeof marketData !== 'undefined' && marketData
    && typeof scenEtat !== 'undefined' && (!overlays.scenarios || (scenEtat && scenEtat.boite)), null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(600);
  return { ctx, page, erreurs };
}

/** Un dessin forcé, journalisé : les textes du TRACÉ (hors filigrane, colonne de l'axe, heures). */
const dessin = page => page.evaluate(() => {
  crossX = crossY = null;
  window.__ft = []; window.__ftOn = true;
  drawChart();
  window.__ftOn = false;
  const W = canvas.width / devicePixelRatio, mainH = geo.mainH, padL = 16, xAxe = W - 75;
  const fil = (NOMS_PAIRES[activeSymbol] || activeSymbol) + '  ·  ' + Guide.nomIntervalle(chartInterval);
  const tous = window.__ft.slice();
  const trace = tous.filter(e => (e.c === 'chart' || e.c === 'chartCalque') && e.t !== fil && e.x >= padL - 2 && e.x < xAxe && e.y >= 0 && e.y <= mainH - 20);
  const D = guideEtat && guideEtat.D, live = livePrice;
  return {
    W, mainH, xAxe, top: geoPrix.top, ph: geoPrix.ph, live, minP: geoPrix.minP, maxP: geoPrix.maxP, mode: document.documentElement.getAttribute('data-mode'),
    trace: trace.map(e => e.t), tous: tous.map(e => e.t),
    items: debEtat ? debEtat.items.map(i => ({ role: i.role, texte: i.texte, rect: i.rect })) : null,
    gd: guideEtat && guideEtat.debutant ? guideEtat.debutant.items.length : null,
    chemins: guideEtat ? guideEtat.chemins || null : 'sans guide',
    cibles: (guideEtat ? guideEtat.cibles : []).map(c => ({ prio: c.prio, titre: c.titre })),
    scen: scenEtat ? { libelles: scenEtat.libelles, cibles: scenEtat.cibles.map(c => ({ prio: c.prio, titre: c.titre, scenario: c.scenario || null })),
      boite: scenEtat.boite ? { deb: !!scenEtat.boite.deb, cede: !!scenEtat.boite.cede, texte: scenEtat.boite.texte || null, lignes: scenEtat.boite.lignes.map(l => l.t) } : null,
      items: scenEtat.items.map(i => ({ rang: i.sc.rang, cle: i.et.cle })), montre: scenEtat.montre ? scenEtat.montre.sc.rang : null } : null,
    sous: geo.sous.map(s => s.cle),
    valeurs: D ? { choix: { dessus: D.choix.dessus.map(n => n.p), dessous: D.choix.dessous.map(n => n.p) }, regime: D.regime ? D.regime.cle : null } : null,
    badge: isNum(live) ? { x: xAxe, y: geoPrix.top + geoPrix.ph * (1 - (live - geoPrix.minP) / geoPrix.range) - 10, w: 75, h: 20 } : null,
    yLive: isNum(live) ? geoPrix.top + geoPrix.ph * (1 - (live - geoPrix.minP) / geoPrix.range) : null,
    // Les bougies les plus récentes (le quart de la vue, au moins 3) : leur boîte haut–bas.
    recentes: (() => {
      const P = geoPrix, n = P.ve - P.vs, k = Math.max(3, Math.ceil(n * 0.25)), y = p => P.top + P.ph * (1 - (p - P.minP) / P.range), out = [];
      for (let i = P.ve - k; i < P.ve; i++) { const c = candles[i]; out.push({ x: P.left + P.gap * (i - P.vs), y: y(c.high), w: Math.max(1, P.gap * 0.8), h: y(c.low) - y(c.high) }); }
      return out;
    })(),
    bandes: guideEtat && guideEtat.deb ? guideEtat.niveaux.filter(L => L.visible).map(L => ({ p: L.niv.p, yH: L.yH, yB: L.yB, yD: guideEtat.yDe(L.niv.p) })) : [],
  };
});
const chevauche = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const nombres = t => (t.match(/\d{1,3}(?:[\s  ]\d{3})+|\d+/g) || []).map(x => x.replace(/[\s  ]/g, ''));
const VERBES = /\b(touche|est passé|monte|baisse|hésite|s’agite|est entre|est sous|est au-dessus|est sans repère|indisponible)\b/;
const LIMITES = { phrase: [90, 48], niveau: [26, 18], scenario: [32, 32], forme: [24, 24], boite: [48, 40] };
const ROLES_MAX = { phrase: 1, niveau: 2, scenario: 1, forme: 1, boite: 1 };

/** Les contrôles d'un écran Débutant (budget, limites, mots, chevauchements, 5 secondes, absents). */
async function controlerEcran(o, nom, opts = {}) {
  const e = await dessin(o.page);
  const P = await o.page.evaluate(() => PARAM.guide.debutant);
  const etroit = e.W - 16 - 75 < P.etroit;
  // 1. Budget.
  check(`${nom} : au plus ${P.items} textes sur le tracé (${e.trace.length}), autant que d'entrées du registre (${e.items.length})`,
    e.trace.length <= P.items && e.trace.length === e.items.length && e.gd === e.items.length, { trace: e.trace, items: e.items.map(i => i.role + ' ' + i.texte) });
  const roles = {};
  for (const i of e.items) roles[i.role] = (roles[i.role] || 0) + 1;
  check(`${nom} : les rôles (${Object.entries(roles).map(([k, v]) => k + '×' + v).join(', ')}) sont ceux du budget`, Object.entries(roles).every(([k, v]) => ROLES_MAX[k] && v <= ROLES_MAX[k]), roles);
  check(`${nom} : chaque texte du registre est celui dessiné`, e.items.every(i => e.trace.includes(i.texte)), { items: e.items.map(i => i.texte), trace: e.trace });
  // 2. Limites, en caractères et dans le tracé.
  const trop = e.items.filter(i => i.texte.length > LIMITES[i.role][etroit ? 1 : 0]);
  check(`${nom} : limites de caractères (phrase ${etroit ? 48 : 90}, repère ${etroit ? 18 : 26}, scénario 32, forme 24, ligne ${etroit ? 40 : 48})`, !trop.length, trop);
  const dehors = e.items.filter(i => !i.rect || i.rect.x < 16 - 0.5 || i.rect.x + i.rect.w > e.xAxe + 0.5 || i.rect.y < 0 || i.rect.y + i.rect.h > e.mainH - 20 + 0.5);
  check(`${nom} : chaque texte tient dans le tracé, en pixels`, !dehors.length, dehors);
  // 3. Mots (et aucun pourcentage sur le tracé : choix 1B, rien qui se lise comme une probabilité).
  const motsT = e.items.map(i => [i.texte, bannis(i.texte), CONSEIL.test(i.texte), FORMATS_EXPERT.some(re => re.test(i.texte)), /%/.test(i.texte)]).filter(x => x[1].length || x[2] || x[3] || x[4]);
  check(`${nom} : aucun mot banni, aucun conseil, aucun format Expert, aucun « % » sur le tracé`, !motsT.length, motsT);
  // Chaque repère est posé de SON côté du prix live et contre son trait (pas au bord d'une bande lointaine).
  if (e.yLive !== null) {
    const cote = e.items.filter(i => i.role === 'niveau' && i.rect).map(i => ({ t: i.texte, p: +nombres(i.texte).filter(x => x.length >= 4)[0], r: i.rect, fl: /[↑↓]/.test(i.texte) }))
      .filter(n => !n.fl && ((n.p > e.live && n.r.y + n.r.h > e.yLive + 0.5) || (n.p < e.live && n.r.y < e.yLive - 0.5)));
    check(`${nom} : le libellé du repère du haut est au-dessus de la ligne du prix, celui du bas au-dessous`, !cote.length, { cote, yLive: e.yLive });
    const loin = e.items.filter(i => i.role === 'niveau' && i.rect && !/[↑↓]/.test(i.texte)).map(i => ({ t: i.texte, p: +nombres(i.texte).filter(x => x.length >= 4)[0], r: i.rect }))
      .map(n => Object.assign(n, { b: e.bandes.find(b => Math.abs(b.p - n.p) < 0.5) })).filter(n => !n.b || Math.min(Math.abs(n.r.y - n.b.yD), Math.abs(n.r.y + n.r.h - n.b.yD)) > 40);
    check(`${nom} : chaque libellé de repère à moins de 40 px du trait du prix qu'il nomme`, !loin.length, loin);
  }
  const surRecentes = e.items.filter(i => (i.role === 'scenario' || i.role === 'forme') && i.rect && e.recentes.some(c => chevauche(i.rect, c)));
  check(`${nom} : ni le libellé du scénario ni celui de la forme sur les bougies les plus récentes`, !surRecentes.length, surRecentes);
  const dansBande = e.items.filter(i => (i.role === 'scenario' || i.role === 'forme') && i.rect && e.bandes.some(b => i.rect.y < b.yB + 3 && i.rect.y + i.rect.h > b.yH - 3));
  check(`${nom} : ni le libellé du scénario ni celui de la forme dans la bande d'un repère`, !dansBande.length, { dansBande, bandes: e.bandes });
  // 4. Chevauchements.
  const paires = [];
  for (let a = 0; a < e.items.length; a++) for (let b = a + 1; b < e.items.length; b++) if (e.items[a].rect && e.items[b].rect && chevauche(e.items[a].rect, e.items[b].rect)) paires.push([e.items[a].texte, e.items[b].texte]);
  check(`${nom} : aucun texte n'en chevauche un autre`, !paires.length, paires);
  check(`${nom} : aucun texte sous le badge du prix ni dans la colonne de l'axe`, !e.badge || e.items.every(i => !i.rect || !chevauche(i.rect, e.badge)), e.badge);
  // 5. Le test des 5 secondes.
  const ph = e.items.find(i => i.role === 'phrase');
  check(`${nom} : la phrase dit le mouvement par un verbe (« ${ph && ph.texte} »)`, ph && VERBES.test(ph.texte), ph);
  if (!opts.sansNiveaux) {
    const niv = e.items.filter(i => i.role === 'niveau').map(i => ({ t: i.texte, p: +nombres(i.texte).filter(x => x.length >= 4)[0] }));
    check(`${nom} : un repère au-dessus du prix et un au-dessous (${niv.map(n => n.t).join(' / ')})`, niv.some(n => n.p > e.live) && niv.some(n => n.p < e.live), { niv, live: e.live });
    // Les prix de la phrase sont ceux des deux repères (A22-2).
    const pn = nombres(ph ? ph.texte : '').filter(x => x.length >= 4), pl = [].concat(...e.items.filter(i => i.role === 'niveau').map(i => nombres(i.texte)));
    check(`${nom} : les prix de la phrase sont ceux des libellés des repères`, pn.every(x => pl.includes(x)), { pn, pl });
    check(`${nom} : aucun repère d'options quand une autre bande existe du même côté`, e.items.filter(i => i.role === 'niveau').every(i => !/option/i.test(i.texte)), e.items.map(i => i.texte));
  }
  if (!opts.sansScenarios) check(`${nom} : « Scénario 1 » (ou la ligne des scénarios) est à l'écran`, e.items.some(i => /^(↑ |↓ )?Scén(ario|\.) 1|^Scénarios? /.test(i.texte)), e.items.map(i => i.texte));
  const dom = await o.page.evaluate(() => {
    const vis = el => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
    return { prix: document.getElementById('price').textContent, var24: vis(document.getElementById('var24')) ? document.getElementById('var24').textContent : null,
      caches: ['liveBtn', 'feedBtn', 'reglagesBtn', 'stratSection'].filter(id => vis(document.getElementById(id))),
      puces: [...document.querySelectorAll('#indicatorBar label[id^="lbl_"]')].filter(vis).length,
      kpis: [...document.querySelectorAll('#cycle .kpi')].filter(vis).length, reset: vis(document.getElementById('resetBtn')),
      kpiDeb: vis(document.querySelector('#cycle .kpi-deb')) ? document.querySelector('#cycle .kpi-deb').getAttribute('title') : null };
  });
  check(`${nom} : le prix de l'en-tête au format français (« ${dom.prix} »)`, /^\d{1,3}(?:[\s ]\d{3})*(?:,\d+)?[\s ]\$$/.test(dom.prix), dom.prix);
  check(`${nom} : la variation 24 h visible, sa durée dite (« ${dom.var24} »)`, dom.var24 && / en 24 h$/.test(dom.var24), dom.var24);
  // 6. Absents en Débutant.
  const exp = e.trace.filter(t => /^\d+\/\d+ · /.test(t) || /^[+-]\d+\.\d+%$/.test(t) || /^fichier .* UTC/.test(t) || /^\d$/.test(t) || /^(Point|fin|Écrit à)/.test(t) || /EMA|RSI|Bollinger/.test(t));
  check(`${nom} : ni compteur, ni pastille de la vue, ni repère de publication, ni repères ①②, ni traits du point et de la fin`, !exp.length, exp);
  check(`${nom} : ni badge du régime, ni « Et ensuite ? » (guideEtat.chemins vide)`, !e.cibles.some(c => /^Tendance/.test(c.titre || '')) && !e.chemins, { chemins: e.chemins, cibles: e.cibles.map(c => c.titre) });
  // Le scénario MONTRÉ (rang 1 tant qu'il est ouvert ou réalisé ; sinon le suivant encore ouvert —
  // contrat de la journée, plan-scenarios.md M7) : son libellé seul, jamais deux.
  if (e.scen) check(`${nom} : un seul libellé de scénario, celui du scénario montré (${e.scen.montre || '1'}) ; ni nom du point et de la fin`, e.scen.libelles.length <= 1 && e.scen.libelles.every(l => l.rang === (e.scen.montre || '1')) && !e.scen.cibles.some(c => c.prio === 3), e.scen);
  check(`${nom} : boutons Expert, puces d'indicateurs, Grid Bot et chiffres clés masqués ; ↺ visible ; la pastille « Infos du marché » dit l'âge (infobulle)`,
    !dom.caches.length && dom.puces === 0 && dom.kpis === 0 && dom.reset && /il y a \d+ min/.test(dom.kpiDeb || ''), dom);
  check(`${nom} : aucun sous-graphe (${e.sous.join(', ') || 'aucun'})`, !e.sous.length, e.sous);
  return e;
}

/** Le texte visible de la page, hors bulles et fiches (fermées). */
const texteVisible = page => page.evaluate(() => document.body.innerText);
function scanTexte(nom, t) {
  const b = bannis(t), c = CONSEIL.test(t), f = FORMATS_EXPERT.filter(re => re.test(t)).map(re => t.match(re)[0]);
  check(`${nom} : texte visible sans mot banni, sans conseil, sans format Expert`, !b.length && !c && !f.length, { bannis: b, conseil: c, formats: f });
}

/** Survol (souris) ou toucher (doigt) du centre d'un texte du registre → la cible et sa bulle. */
async function viser(o, role, tactile, k) {
  const p = await o.page.evaluate(([role, k]) => {
    const its = debEtat.items.filter(i => i.role === role && i.rect), it = its[k || 0];
    if (!it) return null;
    const b = canvas.getBoundingClientRect();
    return { x: b.left + it.rect.x + Math.min(it.rect.w / 2, 40), y: b.top + it.rect.y + it.rect.h / 2, texte: it.texte };
  }, [role, k]);
  if (!p) return null;
  await o.page.evaluate(() => { window.__dc = 0; window.__ft = []; window.__ftOn = true; });
  if (tactile) await o.page.touchscreen.tap(p.x, p.y);
  else { await o.page.mouse.move(p.x - 10, p.y - 3); await o.page.mouse.move(p.x, p.y, { steps: 3 }); }
  await o.page.waitForTimeout(150);
  const r = await o.page.evaluate(() => {
    window.__ftOn = false;
    const G = guideEtat, S = scenEtat;
    const c = (G && G.survol) || (S && S.survol) || null;
    const b = (G && G.survol && G.bulle) || (S && S.survol && S.bulle) || null;
    return { titre: c ? c.titre : null, prio: c ? c.prio : null, scenario: c ? c.scenario || null : null, corps: b ? b.corps.join(' ') : '', curseur: canvas.style.cursor,
      police: b ? b.police : null, dansTrace: b ? b.y >= 0 && b.y + b.h <= geo.mainH && b.x >= 0 && b.x + b.w <= canvas.width / devicePixelRatio : null,
      ohlcv: window.__ft.some(e => e.c === 'chartCalque' && /^(Début|Haut|Bas|Fin|Volume)$|^[OHLC] /.test(e.t)) };
  });
  return Object.assign(r, { vise: p.texte });
}
async function quitter(o, tactile, x, y) { if (tactile) await o.page.touchscreen.tap(x, y); else await o.page.mouse.move(2, 2); await o.page.waitForTimeout(100); }

(async () => {
  await new Promise(r => serveur.listen(0, '127.0.0.1', r));
  const nav = await playwright.chromium.launch();
  try {
    // ── L'écran, à chaque taille, en aero et kala ──
    // aero : le scénario 1 du matin est EN COURS (son libellé est à l'écran) ; kala : le fichier
    // complet du dépôt de tests, où le rang 1 est déjà invalidé (seule la ligne en parle).
    for (const theme of ['aero', 'kala']) {
      const prev = theme === 'aero' ? 'ouvert' : 'complet';
      for (const [vue, tactile] of [[{ width: 1440, height: 900 }, false], [{ width: 1024, height: 768 }, false], [{ width: 390, height: 844 }, true], [{ width: 360, height: 740 }, true]]) {
        const nom = vue.width + ' px · ' + theme;
        titre(nom);
        const o = await ouvrir(nav, { vue, theme, tactile, prev });
        const e = await controlerEcran(o, nom);
        if (prev === 'ouvert') check(`${nom} : le scénario 1 en cours a son libellé sur le tracé (« ${(e.items.find(i => i.role === 'scenario') || {}).texte} »)`,
          e.items.some(i => i.role === 'scenario' && /^(?:[↑↓] )?Scénario 1 : /.test(i.texte) && (i.texte.match(/[↑↓]/g) || []).length <= 1), e.items);
        // Indicateurs Expert allumés : toujours choisis pour l'Expert, jamais dessinés ici.
        const e2 = await o.page.evaluate(() => {
          Object.assign(overlays, { ema20: true, bb: true, sr: true, fib: true, vp: true }); activeSubs.rsi = true;
          resizeCanvas(); window.__ft = []; window.__ftOn = true; drawChart(); window.__ftOn = false;
          const r = { n: debEtat.items.length, textes: window.__ft.map(x => x.t), sous: geo.sous.map(s => s.cle) };
          Object.assign(overlays, { ema20: false, bb: false, sr: false, fib: false, vp: false }); activeSubs.rsi = false; resizeCanvas(); drawChart();
          return r;
        });
        check(`${nom} : EMA, Bollinger, S/R, Fibonacci, profil et RSI allumés — toujours ≤ 5 textes, aucun « EMA » ni « RSI », pas de sous-graphe RSI`,
          e2.n <= 5 && !e2.textes.some(t => /EMA|RSI|POC|Fib|BB/.test(t)) && !e2.sous.includes('rsi'), e2);
        // La couche de chaleur (carnet) allumée en Expert : jamais dessinée en Débutant (test_interface
        // vérifie, en Expert, qu'elle est refaite au changement de thème).
        const chaleur = await o.page.evaluate(async () => {
          await fetchHeatmap(); const avant = heatLayer; overlays.liq = true; drawChart();
          const r = { donnees: !!(histHeatmap && histHeatmap.grille), couche: !!heatLayer && heatLayer !== avant };
          overlays.liq = false; drawChart(); return r;
        });
        check(`${nom} : couche de chaleur allumée en Expert, pas dessinée ici (données lues : ${chaleur.donnees})`, !chaleur.couche, chaleur);
        // 4. L'en-tête et la barre d'outils.
        const mise = await o.page.evaluate(() => {
          const vis = el => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
          const bs = [...document.querySelectorAll('.header button, .header a, .header .kpi-deb, #price, #var24')].filter(vis).map(el => ({ id: el.id || el.className, r: el.getBoundingClientRect() }));
          const ch = [];
          for (let a = 0; a < bs.length; a++) for (let b = a + 1; b < bs.length; b++) {
            const A = bs[a].r, B = bs[b].r;
            if (A.left < B.right - 0.5 && A.right > B.left + 0.5 && A.top < B.bottom - 0.5 && A.bottom > B.top + 0.5 && !bs[a].id.includes('kpi-deb') === !bs[b].id.includes('kpi-deb')) ch.push([bs[a].id, bs[b].id]);
          }
          const barre = document.getElementById('indicatorBar'), hd = document.querySelector('.header');
          // Rangées : les enfants sont centrés verticalement (hauteurs différentes) ; une nouvelle
          // rangée commence quand un enfant démarre sous le bas de la rangée en cours.
          const tops = [];
          for (const r of [...barre.children].filter(vis).map(c => c.getBoundingClientRect()).sort((a, b) => a.top - b.top)) {
            if (!tops.length || r.top >= tops[tops.length - 1].bas - 1) tops.push({ bas: r.bottom }); else tops[tops.length - 1].bas = Math.max(tops[tops.length - 1].bas, r.bottom);
          }
          return { ch, page: [document.documentElement.scrollWidth, document.documentElement.clientWidth], tete: [hd.scrollWidth, hd.clientWidth], barre: [barre.scrollWidth, barre.clientWidth], rangees: tops.length };
        });
        check(`${nom} : les boutons de l'en-tête ne se chevauchent pas`, !mise.ch.length, mise.ch);
        check(`${nom} : ni la page, ni l'en-tête, ni la barre d'outils ne défilent de côté ; barre sur 2 rangées au plus`,
          mise.page[0] <= mise.page[1] + 1 && mise.tete[0] <= mise.tete[1] + 1 && mise.barre[0] <= mise.barre[1] + 1 && mise.rangees <= 2, mise);
        // 7. Les bulles : chaque texte, au survol ou au toucher.
        const bx = 20, by = e.mainH - 30;   // un point neutre (bas à gauche du tracé) pour quitter
        for (const [role, k] of [['niveau', 0], ['niveau', 1], ['phrase', 0], ['scenario', 0], ['boite', 0]]) {
          const r = await viser(o, role, tactile, k);
          // Une cible absente : le libellé du scénario 1 quand il est fermé ; la ligne seulement quand
          // elle a cédé sa place (forme et scénario posés) — jamais en silence.
          if (!r) { if (role !== 'niveau' || k === 0) check(`${nom} : ${role} à viser`, (role === 'scenario' && prev !== 'ouvert') || (role === 'boite' && !!(e.scen && e.scen.boite && e.scen.boite.cede)), { role, boite: e.scen && e.scen.boite }); continue; }
          if (tactile) check(`${nom} : ${role}${k ? ' ' + (k + 1) : ''} : bulle en ${r.police} px (au moins 12 au téléphone), entière dans le tracé`, r.police >= 12 && r.dansTrace, r);
          const ok = { titre: !!r.titre, ohlcv: !r.ohlcv, curseur: tactile || r.curseur === 'pointer', mots: bannisBulle(r.corps + ' ' + r.titre), conseil: CONSEIL.test(r.corps), hasard: /hasard/i.test(r.corps) };
          let detail = true;
          if (role === 'niveau') detail = /^Maintenant : /.test(r.corps) && /\(\d+,\d\d %\)|le prix est dedans/.test(r.corps) && /Si le prix finit|Aucun repère proche/.test(r.corps)
            // Le titre : le nom entier du repère et le prix de son libellé.
            && nombres(r.vise).filter(x => x.length >= 4).every(x => nombres(r.titre).includes(x)) && / · \d/.test(r.titre);
          if (role === 'phrase') detail = (r.corps.match(/Si le prix finit|Aucun repère proche/g) || []).length >= 2;
          // Le libellé est celui du scénario MONTRÉ (le 1, ou le suivant encore ouvert s'il est tombé) :
          // sa bulle nomme les deux autres.
          const mo = (e.scen && e.scen.montre) || '1', autres = ['1', '2', '3'].filter(x => x !== mo);
          if (role === 'scenario') detail = new RegExp('^Scénario ' + mo + ' de Claude$').test(r.titre) && autres.every(x => new RegExp('\\b' + x + '\\. ').test(r.corps)) && /sans pourcentage/.test(r.corps) && /pas une promesse ni un conseil/.test(r.corps);
          if (role === 'boite') detail = /\b1\. /.test(r.corps) && /\b2\. /.test(r.corps) && /\b3\. /.test(r.corps) && /journal/.test(r.corps);
          // Choix 1B : le classement est celui de Claude (une IA), sans pourcentage ; le seul « % »
          // admis est la marge d'une zone (« ± 0,3 % »), qui n'est pas une probabilité.
          if (role === 'scenario' || role === 'boite') detail = detail && /Claude[ ,(]+une IA/.test(r.corps) && !/%/.test(r.corps.replace(/±\s*[\d,]+\s*%/g, '') + r.titre);
          check(`${nom} : ${role}${k ? ' ' + (k + 1) : ''} « ${r.vise} » → sa bulle (${r.titre}), le détail attendu, sans infobulle des prix${tactile ? '' : ', curseur main'}, sans jargon ni base du hasard`,
            ok.titre && ok.ohlcv && ok.curseur && !ok.mots.length && !ok.conseil && !ok.hasard && detail, { r, ok, detail });
          if (role === 'niveau' && k === 0) {
            // Un chiffre publié (mur du carnet, options) garde son âge dans la bulle.
            const pub = await o.page.evaluate(() => guideEtat.niveaux.filter(L => L.niv.raisons.some(r => isFinite(r.lu))).map(L => L.etiq && L.etiq.t));
            if (pub.some(Boolean)) {
              // Au doigt, le toucher précédent a posé le réticule : on le retire, sinon un 2e
              // toucher sur la même étiquette fermerait la bulle au lieu de l'ouvrir.
              if (tactile) await o.page.evaluate(() => { crossX = crossY = null; dessinerCalque(); });
              const k2 = (await o.page.evaluate(() => debEtat.items.filter(i => i.role === 'niveau').map(i => i.texte))).findIndex(t => pub.includes(t));
              const r2 = await viser(o, 'niveau', tactile, k2);
              check(`${nom} : la bulle d'un repère publié dit son âge (« relevé il y a … »)`, r2 && /relevée? il y a \d+ min/.test(r2.corps), r2);
              if (tactile) await quitter(o, tactile, r2 ? 0 : 0, 0);
            }
          }
          if (tactile) { await o.page.evaluate(() => { crossX = crossY = null; dessinerCalque(); }); } else await quitter(o, false);
        }
        // Le toucher (doigt) : un 2e toucher au même endroit retire la bulle.
        if (tactile) {
          const p = await o.page.evaluate(() => { const it = debEtat.items.find(i => i.role === 'niveau'); const b = canvas.getBoundingClientRect(); return it ? { x: b.left + it.rect.x + 20, y: b.top + it.rect.y + it.rect.h / 2 } : null; });
          if (p) {
            await o.page.touchscreen.tap(p.x, p.y); await o.page.waitForTimeout(150);
            await o.page.touchscreen.tap(p.x, p.y); await o.page.waitForTimeout(150);
            const r = await o.page.evaluate(() => ({ survol: guideEtat.survol, crossX }));
            check(`${nom} : un 2e toucher au même endroit retire la bulle`, r.survol === null && r.crossX === null, r);
          }
        }
        // 3. Le texte de la page : cartes ouvertes (panneau au bureau, fenêtre au téléphone), puis le menu.
        await o.page.evaluate(() => { const k = document.querySelector('#cycle .kpi-deb'); if (k) k.click(); });
        await o.page.waitForTimeout(500);
        const cartes = await o.page.evaluate(() => {
          const vis = el => el.getClientRects().length > 0;
          const box = document.getElementById(innerWidth <= 768 ? 'marketModalBody' : 'feed');
          return { n: box ? [...box.querySelectorAll('.demon-card')].filter(vis).length : 0, titres: box ? [...box.querySelectorAll('.demon-name')].map(x => x.innerText) : [] };
        });
        check(`${nom} : la pastille « Infos du marché » ouvre les 8 cartes, chacune avec son titre Débutant`, cartes.n === 8 && cartes.titres.every(t => t && !/Microstructure|Liquidité|Contre-expertise/.test(t)), cartes);
        scanTexte(`${nom}, cartes ouvertes`, await texteVisible(o.page));
        await o.page.evaluate(() => { if (innerWidth <= 768) closeMarketModal(); else toggleFeed(); });
        await o.page.waitForTimeout(450);
        await o.page.click('#indDropdownBtn'); await o.page.waitForTimeout(200);
        const menu = await o.page.evaluate(() => document.getElementById('indMenu').innerText);
        check(`${nom} : le menu « Affichage » n'a que les couches du Guide et le lien vers l'Expert (ni « oscillateur », ni « chartisme »)`,
          /Repères et phrase de lecture/.test(menu) && /passer en Expert/.test(menu) && !/oscillateur|chartisme|EMA|RSI/i.test(menu), menu);
        scanTexte(`${nom}, menu ouvert`, await texteVisible(o.page));
        await o.page.keyboard.press('Escape');
        check(`${nom} : aucune erreur JavaScript`, !o.erreurs.length, o.erreurs);
        await o.ctx.close();
      }
    }

    // ── Rang 1 fermé (invalidé en direct) : pas de libellé ni de zone ; la ligne dit son état ──
    titre('Rang 1 fermé (invalidé en direct)');
    for (const [vue, tactile] of [[{ width: 1440, height: 900 }, false], [{ width: 390, height: 844 }, true], [{ width: 375, height: 667 }, true]]) {
      const o = await ouvrir(nav, { vue, tactile, prev: 'ferme' });
      const e = await controlerEcran(o, 'fermé · ' + vue.width);
      const ligne = e.items.find(i => i.role === 'boite');
      // Changé délibérément (contrat de la journée, plan-scenarios.md A4) : quand le rang 1 tombe, le
      // scénario encore ouvert qui suit est montré (son libellé) et la ligne dit la fermeture du 1 :
      // elle commence par « Scén. 1 » et contient « ✗ », ou dit « Aucun scénario » ; toujours marquée
      // « (en direct) » ; jamais un libellé qui nomme le scénario 1 par ses niveaux.
      check(`fermé · ${vue.width} : la ligne dit la fermeture du rang 1 (« Scén. 1 … ✗ » ou « Aucun scénario »), marquée « (en direct) » ; jamais de libellé « Scénario 1 : … »`,
        ligne && (/^Scén\. 1\b.*✗/.test(ligne.texte) || /^Aucun (scénario|ne)\b|^Scénarios : aucun\b/.test(ligne.texte)) && /\(en direct\)/.test(ligne.texte) && /▸$/.test(ligne.texte)
        && !e.items.some(i => i.role === 'scenario' && /^(↑ |↓ )?Scén(ario|\.) 1 :/.test(i.texte)), e.items);
      // Sa bulle (toucher ou survol) tient dans le tracé et dit le suivi en direct, le journal, l'avertissement.
      const r = await viser(o, 'boite', tactile);
      const b = await o.page.evaluate(() => (scenEtat && scenEtat.bulle ? { y: scenEtat.bulle.y, h: scenEtat.bulle.h, mainH: geo.mainH } : null));
      check(`fermé · ${vue.width}×${vue.height} : la bulle de la ligne tient dans le tracé et dit le suivi en direct, le journal et « pas une promesse ni un conseil »`,
        r && b && b.y >= 0 && b.y + b.h <= b.mainH && /en direct/.test(r.corps) && /journal/.test(r.corps) && /pas une promesse ni un conseil/.test(r.corps), { b, corps: r && r.corps });
      check(`fermé · ${vue.width} : aucune erreur JavaScript`, !o.erreurs.length, o.erreurs);
      await o.ctx.close();
    }

    // ── Hier, absent, attente : les lignes du Débutant (A17) ──
    titre('Lignes des scénarios : hier, absent, attente');
    for (const [prev, re] of [['hier', /^Scénarios (d’hier|du \d\d\/\d\d) : terminés ▸$/], ['absent', /^Scénarios du matin : indisponibles$/], ['attente', /^Scénarios du matin : /]]) {
      const o = await ouvrir(nav, { vue: { width: 1440, height: 900 }, prev });
      const e = await dessin(o.page);
      const l = e.items.find(i => i.role === 'boite');
      check(`${prev} : la ligne « ${l && l.texte} »`, l && re.test(l.texte) && l.texte.length <= 48 && !bannis(l.texte).length, e.items);
      const r = await viser(o, 'boite', false);
      check(`${prev} : sa bulle s'ouvre, sans jargon`, r && r.titre && !bannisBulle(r.corps).length && !/UTC/.test(r.corps), r);
      check(`${prev} : aucune erreur JavaScript`, !o.erreurs.length, o.erreurs);
      await o.ctx.close();
    }

    // ── 390 px sans scénarios : au plus 4 textes ──
    titre('390 px · sans scénarios du matin');
    {
      const o = await ouvrir(nav, { vue: { width: 390, height: 844 }, tactile: true, prev: 'aucun' });
      const e = await controlerEcran(o, 'sans scénarios · 390', { sansScenarios: true });
      check('sans scénarios : au plus 4 textes (phrase, deux repères, une forme)', e.items.length <= 4 && !e.items.some(i => i.role === 'scenario' || i.role === 'boite'), e.items);
      check('sans scénarios : aucune erreur JavaScript', !o.erreurs.length, o.erreurs);
      await o.ctx.close();
    }

    // ── Un côté sans repère : dit dans la phrase et dans sa bulle ──
    titre('Un côté sans repère proche');
    {
      const o = await ouvrir(nav, { vue: { width: 1440, height: 900 } });
      const r = await o.page.evaluate(() => {
        // Le choix des bandes est vidé au-dessus à la source (l'app passe par Guide.choisirNiveaux) :
        // la phrase, les étiquettes et les chemins de la bulle en découlent tous.
        const c0 = Guide.choisirNiveaux;
        Guide.choisirNiveaux = (...a) => Object.assign({}, c0(...a), { dessus: [] });
        memoCache.clear(); debHautMemo = null; drawChart();
        const ph = debEtat.items.find(i => i.role === 'phrase');
        const out = { phrase: ph && ph.texte, bulle: guideEtat.ciblePhrase ? guideEtat.ciblePhrase.texte.join(' ') : '', niveaux: debEtat.items.filter(i => i.role === 'niveau').length };
        Guide.choisirNiveaux = c0; memoCache.clear(); debHautMemo = null; drawChart();
        return out;
      });
      check('côté vide : la phrase dit « Aucun repère proche au-dessus » (ou ne nomme que le repère du bas)', /Aucun repère proche au-dessus|au-dessus de \d/.test(r.phrase || '') && r.niveaux <= 1, r);
      check('côté vide : la bulle de la phrase le dit aussi', /Aucun repère proche au-dessus/.test(r.bulle), r);
      await o.ctx.close();
    }

    // ── 4 h, une forme confirmée : elle entre, la ligne des scénarios cède (budget) ──
    titre('4 h · double sommet confirmé (forme forcée)');
    {
      const o = await ouvrir(nav, { vue: { width: 1440, height: 900 } });
      await o.page.click('#int_4h'); await o.page.waitForTimeout(1500);
      const r = await o.page.evaluate(() => {
        const n = candles.length, G = PARAM.guide, C = i => candles[i];
        const ia = n - 34, ic = n - 24, ib = n - 14, pa = Math.max(C(ia).high, C(ib).high), pc = C(ic).low;
        const f = { type: 'double_sommet', sens: -1, phase: 'confirme', a: { i: ia, p: pa }, b: { i: ib, p: pa }, cou: { i: ic, p: pc }, niveau: pc, objectif: pc - (pa - pc),
          t: ib + G.pivot, debut: ia, fin: null, jFin: null };
        const f0 = Guide.formesAffichees, b0 = GUIDE_FORMES.val && GUIDE_FORMES.val.bilan;
        Guide.formesAffichees = () => [f];
        if (GUIDE_FORMES.val) GUIDE_FORMES.val.bilan = Object.assign({}, b0, { double_sommet: { formes: 3, confirmes: 1, atteints: 1, invalides: 0, expires: 0, temoin: { departs: 40, atteints: 12 } } });
        drawChart();
        const items = debEtat.items.map(i => ({ role: i.role, texte: i.texte, rect: i.rect }));
        const forme = guideEtat.cibles.find(c => c.prio === 2 && c.rects.length);
        const B = scenEtat && scenEtat.boite, un = scenEtat && scenEtat.cibleUn;
        const out = { items, forme: forme ? { titre: forme.titre, texte: forme.texte.join(' '), rect: forme.rects[0] } : null, cede: !!(B && B.cede), un: un ? un.texte.join(' ') : '' };
        window.__retablir = () => { Guide.formesAffichees = f0; if (GUIDE_FORMES.val) GUIDE_FORMES.val.bilan = b0; drawChart(); };
        return out;
      });
      const roles = r.items.map(i => i.role);
      check('4 h : « Double sommet confirmé » posé, au plus 5 textes', roles.includes('forme') && r.items.length <= 5 && r.items.some(i => i.texte === 'Double sommet confirmé'), r.items);
      if (roles.includes('scenario')) check('4 h : forme + scénario 1 posés → la ligne des scénarios cède ; sa bulle passe dans celle du libellé « Scénario 1 »', r.cede && !roles.includes('boite') && /La ligne des scénarios/.test(r.un), r);
      check('4 h : la bulle de la forme la définit, dit son bilan (« Mesuré sur », « fois sur ») avec le prix visé, et « pas une prévision ni un conseil »',
        r.forme && /^Double sommet : /.test(r.forme.texte) && /Mesuré sur/.test(r.forme.texte) && /fois sur/.test(r.forme.texte) && /vise \d/.test(r.forme.texte) && /pas une prévision ni un conseil/.test(r.forme.texte) && !bannisBulle(r.forme.texte).length, r.forme);
      const e = await dessin(o.page);
      check('4 h : la ligne des scénarios renvoie au suivi en 15 min ou 1 h (quand elle est posée)', !e.items.some(i => i.role === 'boite') || e.items.some(i => /à voir en 15 min ou 1 h/.test(i.texte)), e.items);
      await o.page.evaluate(() => window.__retablir());
      check('4 h : aucune erreur JavaScript', !o.erreurs.length, o.erreurs);
      await o.ctx.close();
    }

    // ── Une figure qui se dessine encore : nommée « possible », en tirets, sa bulle dit ce qui la validerait ──
    titre('15 min · double creux possible (forme forcée, pas encore confirmée)');
    {
      const o = await ouvrir(nav, { vue: { width: 1440, height: 900 } });
      const r = await o.page.evaluate(() => {
        const n = candles.length, G = PARAM.guide, C = i => candles[i];
        const ia = n - 34, ic = n - 24, ib = n - 14, pa = Math.min(C(ia).low, C(ib).low), pc = C(ic).high;
        const f = { type: 'double_creux', sens: 1, a: { i: ia, p: pa }, b: { i: ib, p: pa }, cou: { i: ic, p: pc }, niveau: pc, objectif: pc + (pc - pa),
          t: ib + G.pivot, debut: ia, fin: null, jFin: null, demi: false };
        const f0 = Guide.formesAffichees, b0 = GUIDE_FORMES.val && GUIDE_FORMES.val.bilan;
        Guide.formesAffichees = () => [f];
        if (GUIDE_FORMES.val) GUIDE_FORMES.val.bilan = Object.assign({}, b0, { double_creux: { formes: 4, confirmes: 2, atteints: 1, invalides: 1, expires: 0, temoin: { departs: 40, atteints: 12 } } });
        drawChart();
        const items = debEtat.items.map(i => ({ role: i.role, texte: i.texte }));
        const forme = guideEtat.cibles.find(c => c.prio === 2 && c.rects.length);
        Guide.formesAffichees = f0; if (GUIDE_FORMES.val) GUIDE_FORMES.val.bilan = b0; drawChart();
        return { items, forme: forme ? { titre: forme.titre, texte: forme.texte.join(' ') } : null };
      });
      check('« Double creux possible » posé, au plus 5 textes', r.items.some(i => i.role === 'forme' && i.texte === 'Double creux possible') && r.items.length <= 5, r.items);
      check('sa bulle : ce qu’on voit, ce qui la validerait (« serait validée si le prix finit 2 quarts d’heure de suite au-dessus de »), le bilan mesuré, aucun prix visé, aucun mot banni',
        r.forme && /^Double creux possible : le prix a rebondi deux fois vers /.test(r.forme.texte) && /serait validée si le prix finit 2 quarts d’heure de suite au-dessus de /.test(r.forme.texte)
        && /Mesuré sur/.test(r.forme.texte) && !/vise/.test(r.forme.texte) && !bannisBulle(r.forme.texte).length, r.forme);
      check('aucune erreur JavaScript', !o.erreurs.length, o.erreurs);
      await o.ctx.close();
    }

    // ── L'astuce : une fois ──
    titre('Astuce : une fois, jamais sur un texte');
    {
      const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
      await ctx.clock.install({ time: maintenant() });
      const o = await ouvrir(nav, { ctx, tactile: true });
      const a = await o.page.evaluate(() => {
        const el = document.getElementById('astuceTap'), b = el.getBoundingClientRect(), c = canvas.getBoundingClientRect();
        const r = { x: b.left - c.left, y: b.top - c.top, w: b.width, h: b.height };
        return { vis: !el.hidden && b.width > 0, texte: el.textContent, chevauche: debEtat.items.filter(i => i.rect && r.x < i.rect.x + i.rect.w && r.x + r.w > i.rect.x && r.y < i.rect.y + i.rect.h && r.y + r.h > i.rect.y).map(i => i.texte) };
      });
      check('tactile, 1re visite : « Touchez une étiquette pour le détail », sur aucun texte', a.vis && a.texte === 'Touchez une étiquette pour le détail' && !a.chevauche.length, a);
      const b = await o.page.evaluate(() => canvas.getBoundingClientRect());
      await o.page.touchscreen.tap(b.left + 30, b.top + b.height - 60); await o.page.waitForTimeout(200);
      const apres = await o.page.evaluate(() => ({ cache: document.getElementById('astuceTap').hidden, cle: localStorage.getItem('samsara-astuce-tap-v1') }));
      check('… cachée au premier toucher ; la clé samsara-astuce-tap-v1 vaut « 1 »', apres.cache && apres.cle === '1', apres);
      await o.page.close();
      const o2 = await ouvrir(nav, { ctx, tactile: true, garder: true });
      check('… au rechargement, elle ne revient pas', await o2.page.evaluate(() => document.getElementById('astuceTap').hidden), null);
      await ctx.close();
      const o3 = await ouvrir(nav, { vue: { width: 1440, height: 900 } });
      const a3 = await o3.page.evaluate(() => ({ vis: !document.getElementById('astuceTap').hidden, texte: document.getElementById('astuceTap').textContent }));
      check('souris : « Survolez une étiquette pour le détail », une fois', a3.vis && a3.texte === 'Survolez une étiquette pour le détail', a3);
      await o3.page.clock.runFor(9000); await o3.page.waitForTimeout(100);
      check('… cachée au bout de 8 s', await o3.page.evaluate(() => document.getElementById('astuceTap').hidden), null);
      await o3.ctx.close();
    }

    // ── ↺ : revenir au présent ──
    titre('↺ en Débutant : glisser vers le passé, revenir au présent');
    {
      const o = await ouvrir(nav, { vue: { width: 1440, height: 900 } });
      const b = await o.page.evaluate(() => canvas.getBoundingClientRect());
      await o.page.mouse.move(b.left + b.width / 2, b.top + b.height / 2); await o.page.mouse.down();
      await o.page.mouse.move(b.left + b.width / 2 + 500, b.top + b.height / 2, { steps: 8 }); await o.page.mouse.up(); await o.page.waitForTimeout(300);
      const passe = await o.page.evaluate(() => ({ fin: viewEnd < candles.length, ph: debEtat.items.find(i => i.role === 'phrase').texte }));
      check('après un glissement, la vue est dans le passé, la phrase dit « Maintenant, … »', passe.fin && /^Maintenant, /.test(passe.ph), passe);
      await o.page.click('#resetBtn'); await o.page.waitForTimeout(300);
      check('↺ visible et un clic ramène la dernière bougie dans la vue', await o.page.evaluate(() => viewEnd === candles.length), null);
      await o.ctx.close();
    }

    // ── Bascule : touche M ──
    titre('Bascule Débutant ↔ Expert (touche M)');
    {
      const o = await ouvrir(nav, { vue: { width: 1440, height: 900 } });
      const d1 = await dessin(o.page);
      await o.page.keyboard.press('m'); await o.page.waitForTimeout(400);
      const x = await dessin(o.page);
      const exp = await o.page.evaluate(() => {
        const vis = el => !!el && el.getClientRects().length > 0;
        const c = canvas, box = c.parentElement.getBoundingClientRect();
        return { mode: document.documentElement.getAttribute('data-mode'), kpis: [...document.querySelectorAll('#cycle .kpi')].filter(k => k.getBoundingClientRect().width > 0).length,
          strat: vis(document.getElementById('stratSection')), puces: [...document.querySelectorAll('#indicatorBar label[id^="lbl_"]')].filter(vis).length,
          taille: [c.width, c.height], attendu: [Math.round(c.clientWidth * devicePixelRatio), Math.round(c.clientHeight * devicePixelRatio)], liveBtn: vis(document.getElementById('liveBtn')),
          kpisDom: document.querySelectorAll('#cycle .kpi').length, aria: c.getAttribute('aria-label') };
      });
      check('M → data-mode="expert"', exp.mode === 'expert' && x.mode === 'expert', exp);
      check('Expert : le badge du régime, « Et ensuite ? » (2 boîtes ou une commune), le compteur', x.cibles.some(c => /^Tendance|^Sans tendance|^Régime/.test(c.titre || '')) && x.chemins && x.chemins.boites.length >= 1 && x.trace.some(t => /^\d+\/\d+ · /.test(t)), { cibles: x.cibles.map(c => c.titre), chemins: x.chemins, trace: x.trace.slice(0, 8) });
      check('Expert : au moins 3 bandes nommées, l\'encadré des scénarios de plusieurs lignes (« Scénarios du matin · »), les libellés des rangs 2 et 3 ou leurs lignes',
        x.cibles.filter(c => c.prio === 1).length >= 2 && x.scen && x.scen.boite && !x.scen.boite.deb && x.scen.boite.lignes.length > 1 && /^Scénarios du matin · /.test(x.scen.boite.lignes[0])
        && (x.scen.libelles.some(l => l.rang === '2') || x.scen.boite.lignes.some(l => /^2\b|2\./.test(l)) || x.scen.boite.lignes.some(l => /\| 2/.test(l)) || x.scen.boite.lignes.length >= 3), x.scen);
      check('Expert : le repère de publication est dessiné', x.tous.some(t => /fichier .*UTC/.test(t)), x.tous.filter(t => /UTC/.test(t)));
      check('Expert : les 8 chiffres clés dans la bande (au moins 3 de largeur > 0 à cette taille), le Grid Bot, les puces d\'indicateurs, le bouton ⚡', exp.kpisDom === 8 && exp.kpis >= 3 && exp.strat && exp.puces === 12 && exp.liveBtn, exp);
      check('Expert : le graphique n\'a plus pour nom la phrase du Débutant (aria-label retiré)', exp.aria === null, exp.aria);
      check('Expert : le graphique remis en page (taille du canvas = son conteneur × devicePixelRatio)', exp.taille[0] === exp.attendu[0] && exp.taille[1] === exp.attendu[1], exp);
      check('Expert : un sous-graphe (Volume) revient', x.sous.includes('vol'), x.sous);
      check('mêmes valeurs dans les deux modes : niveaux choisis, régime, états des scénarios', JSON.stringify(d1.valeurs) === JSON.stringify(x.valeurs) && JSON.stringify(d1.scen.items) === JSON.stringify(x.scen.items), { deb: [d1.valeurs, d1.scen.items], exp: [x.valeurs, x.scen.items] });
      await o.page.keyboard.press('m'); await o.page.waitForTimeout(400);
      const d2 = await dessin(o.page);
      check('2e M → retour au Débutant, les mêmes textes', d2.mode === 'debutant' && JSON.stringify(d2.items.map(i => i.texte)) === JSON.stringify(d1.items.map(i => i.texte)), { avant: d1.items.map(i => i.texte), apres: d2.items.map(i => i.texte) });
      check('bascule : aucune erreur JavaScript', !o.erreurs.length, o.erreurs);
      await o.ctx.close();
    }

    // ── Sobriété : survoler une cible ne redessine pas le graphique ; au repos, rien ──
    titre('Sobriété en Débutant');
    {
      const o = await ouvrir(nav, { vue: { width: 1440, height: 900 } });
      await o.page.evaluate(() => {
        window.__n = { dc: 0, cq: 0 };
        const d0 = window.drawChart, c0 = window.dessinerCalque;
        window.drawChart = function () { window.__n.dc++; return d0.apply(this, arguments); };
        window.dessinerCalque = function () { window.__n.cq++; return c0.apply(this, arguments); };
      });
      const p = await o.page.evaluate(() => { const it = debEtat.items.find(i => i.role === 'niveau'); const b = canvas.getBoundingClientRect(); return { x: b.left + it.rect.x + 20, y: b.top + it.rect.y + 8 }; });
      for (let k = 0; k < 6; k++) { await o.page.mouse.move(p.x + k * 3, p.y); await o.page.waitForTimeout(40); }
      await o.page.waitForTimeout(200);
      const n1 = await o.page.evaluate(() => Object.assign({}, window.__n));
      check('survol et déplacement sur une cible : aucun drawChart (le calque seul)', n1.dc === 0 && n1.cq >= 1, n1);
      await o.page.mouse.move(2, 2); await o.page.waitForTimeout(300);
      // Le calque est redessiné une fois par minute exprès (l'âge de la couche « Liquidité »,
      // horloge(), à la seconde qui suit le changement) : le repos mesuré ne chevauche pas un
      // changement de minute (sinon le contrôle dépendait de l'heure à laquelle cette section tombe).
      await o.page.evaluate(() => new Promise(r => { const s = (Date.now() % 60000) / 1000; setTimeout(r, s > 56.5 ? (61.6 - s) * 1000 : s < 1.6 ? (1.6 - s) * 1000 : 0); }));
      await o.page.evaluate(() => { window.__n = { dc: 0, cq: 0 }; });
      await o.page.waitForTimeout(2500);
      const n2 = await o.page.evaluate(() => window.__n);
      check('au repos, sans donnée nouvelle (prix inchangé) : aucun dessin', n2.dc === 0 && n2.cq === 0, n2);
      await o.ctx.close();
    }

    // ── Prix DANS une bande de l'Expert (plusieurs prix fusionnés) : un repère de chaque côté ──
    // Constat de revue : la bande « du haut » était nommée par un prix situé SOUS le prix, et son
    // libellé posé au bord de la bande, loin du trait qu'il nommait.
    titre('Prix dans une bande fusionnée : un repère au-dessus, un au-dessous, contre leurs traits');
    for (const [vue, tactile, itv] of [[{ width: 1440, height: 900 }, false, '1h'], [{ width: 390, height: 844 }, true, '1h'], [{ width: 1440, height: 900 }, false, '1m']]) {
      const o = await ouvrir(nav, { vue, tactile });
      await o.page.click('#int_' + itv); await o.page.waitForTimeout(1500);
      // Le prix live posé entre deux prix d'une même bande de l'Expert (s'il en existe une).
      const pose = await o.page.evaluate(() => {
        const D = guideDonnees();
        const b = D && D.choix.dessus.concat(D.choix.dessous).find(n => n.raisons.length >= 2 && n.pMax - n.pMin > 1);
        if (!b) return null;
        const ps = b.raisons.map(r => r.p).sort((x, y) => x - y);
        livePrice = (ps[0] + ps[1]) / 2; drawChart(); dessinerCalque();
        return { live: livePrice, prix: ps };
      });
      const nom = 'bande fusionnée · ' + vue.width + ' · ' + itv;
      if (!pose) { check(`${nom} : une bande de plusieurs prix existe dans ce montage`, false, null); await o.ctx.close(); continue; }
      const e = await controlerEcran(o, nom, { sansScenarios: true });
      const niv = e.items.filter(i => i.role === 'niveau').map(i => +nombres(i.texte).filter(x => x.length >= 4)[0]);
      check(`${nom} : prix ${Math.round(pose.live)} dans la bande ${pose.prix.join(' / ')} → un repère strictement au-dessus et un strictement au-dessous`, niv.some(p => p > pose.live) && niv.some(p => p < pose.live), { niv, pose });
      check(`${nom} : aucune erreur JavaScript`, !o.erreurs.length, o.erreurs);
      await o.ctx.close();
    }

    // ── Téléphone, prix dans un repère, tendance nette : la phrase garde son verbe ──
    titre('Téléphone : « Le prix monte et touche … » (le verbe reste)');
    for (const cle of ['hausse', 'baisse']) {
      const o = await ouvrir(nav, { vue: { width: 390, height: 844 }, tactile: true });
      const r = await o.page.evaluate(cle => {
        const r0 = Guide.regime;
        Guide.regime = (...a) => Object.assign({}, r0(...a), { cle });
        memoCache.clear(); debHautMemo = null; drawChart();
        const L = guideEtat.niveaux[0];
        livePrice = L.niv.p + (L.niv.dessus ? -1 : 1); drawChart(); dessinerCalque();
        const ph = debEtat.items.find(i => i.role === 'phrase');
        const out = { phrase: ph && ph.texte, bulle: guideEtat.ciblePhrase.texte.join(' '), regime: guideEtat.D.regime.cle };
        Guide.regime = r0; memoCache.clear(); debHautMemo = null; drawChart();
        return out;
      }, cle);
      const verbe = cle === 'hausse' ? 'monte' : 'baisse';
      check(`390 px, ${cle}, prix dans un repère : « ${r.phrase} » (≤ 48, avec « ${verbe} » et « touche »)`, r.phrase && r.phrase.length <= 48 && r.phrase.includes(verbe) && /touche/.test(r.phrase), r);
      check(`390 px, ${cle} : la bulle de la phrase explique « ${verbe} », un mot qui est à l'écran`, new RegExp('« ' + verbe.charAt(0).toUpperCase() + verbe.slice(1) + ' »').test(r.bulle), r.bulle);
      await o.ctx.close();
    }

    // ── Bougies dans une bande : leurs quatre valeurs restent lisibles au survol ──
    titre('Survol d’une bougie dans une bande : réticule et valeurs de la bougie');
    {
      const o = await ouvrir(nav, { vue: { width: 1440, height: 900 } });
      const p = await o.page.evaluate(() => {
        const E = guideEtat, P = geoPrix, b = canvas.getBoundingClientRect();
        const L = E.niveaux.find(x => x.visible);
        if (!L) return null;
        // Un point de la bande, hors de toute étiquette, sur une bougie de la vue.
        for (let i = P.ve - 1; i > P.vs; i--) {
          const x = P.left + P.gap * (i - P.vs) + P.gap * 0.4, y = (L.yH + L.yB) / 2;
          if (!guideCibleSous(x, y, geo.mainH, true) && guideCibleSous(x, y, geo.mainH)) return { x: b.left + x, y: b.top + y };
        }
        return null;
      });
      if (p) {
        await o.page.evaluate(() => { window.__ft = []; window.__ftOn = true; });
        await o.page.mouse.move(p.x - 5, p.y); await o.page.mouse.move(p.x, p.y, { steps: 2 }); await o.page.waitForTimeout(150);
        const r = await o.page.evaluate(() => { window.__ftOn = false; return { ohlcv: window.__ft.some(e => e.c === 'chartCalque' && /^Début$/.test(e.t)), bulle: !!(guideEtat.survol && guideEtat.bulle), curseur: canvas.style.cursor }; });
        check('survol d’une bande hors étiquette : les valeurs de la bougie (« Début », « Haut »…) ET la bulle du repère, à côté', r.ohlcv && r.bulle && r.curseur === 'crosshair', r);
      } else check('survol d’une bande : un point de bande hors étiquette existe', false, null);
      await o.ctx.close();
    }

    // ── Les Légendes (« ? ») en Débutant : d'abord ce que montre l'écran, sans jargon ──
    // Constat de revue : elles s'ouvraient sur « GEX », « Funding », « CVD »… et leurs fiches du
    // Guide décrivaient l'écran Expert (badge, chemins).
    titre('Légendes en Débutant (390 px)');
    {
      const o = await ouvrir(nav, { vue: { width: 390, height: 844 }, tactile: true });
      await o.page.click('#legendesBtn'); await o.page.waitForTimeout(250);
      const g = await o.page.evaluate(() => {
        const p = document.getElementById('fichePop'), d = p.querySelector('details.glossaire-plus');
        const vis = el => el.getClientRects().length > 0;
        return { texte: p.innerText, ouvert: !p.hidden, replie: !!d && !d.open, h4: [...p.querySelectorAll('h4')].filter(vis).map(h => h.innerText.trim()).filter(Boolean),
          boutons: [...p.querySelectorAll('.glossaire-item')].filter(vis).map(b => b.innerText) };
      });
      check('Légendes, Débutant : « Ce que montre l’écran » d’abord (phrase et repères, scénarios du matin, les cartes) ; les fiches de l’Expert repliées',
        g.ouvert && g.replie && /^Ce que montre l’écran$/i.test(g.h4[0]) && g.h4.length === 1 && g.boutons.includes('Scénarios du matin') && g.boutons.includes('La phrase et les deux repères') && g.boutons.includes('Ordres en attente'), g);
      check('Légendes, Débutant : aucun mot banni dans ce qui est affiché', !bannis(g.texte).length && !CONSEIL.test(g.texte), bannis(g.texte));
      // Les fiches du Guide ouvertes en Débutant : leur explication est celle de l'écran Débutant.
      const fiches = [];
      for (const id of ['guide', 'guide_regime', 'guide_suite', 'guide_niveaux', 'scenarios']) {
        fiches.push(await o.page.evaluate(id => {
          ouvrirFiche(id);
          const p = document.getElementById('fichePop'), vis = el => el.getClientRects().length > 0;
          const simple = [...p.querySelectorAll('.fiche-simple')].filter(vis).map(x => x.innerText).join(' '), t = [...p.querySelectorAll('.fiche-titre, .fiche-nature')].map(x => x.innerText).join(' ');
          return { id, simple, titre: t };
        }, id));
      }
      const mal = fiches.filter(f => bannis(f.simple + ' ' + f.titre).length || /badge en haut|à droite de la dernière bougie|Bollinger|Indicateurs »/.test(f.simple));
      check('fiches du Guide en Débutant : titre, pastille et explication du Débutant (ni badge, ni chemins dessinés, ni « convention », ni jargon)', !mal.length && fiches.find(f => f.id === 'guide_regime').simple.includes('pas de badge'), mal.length ? mal : fiches.map(f => f.titre));
      await o.page.evaluate(() => { basculerMode(); ouvrirGlossaire(); });
      await o.page.waitForTimeout(200);
      const x = await o.page.evaluate(() => { const p = document.getElementById('fichePop'), vis = el => el.getClientRects().length > 0; return [...p.querySelectorAll('h4')].filter(vis).map(h => h.innerText.trim()).filter(Boolean); });
      check('Légendes, Expert : tous les groupes, à plat, comme avant', x.length === 7 && /^Positionnement et dérivés$/i.test(x[0]), x);
      check('Légendes : aucune erreur JavaScript', !o.erreurs.length, o.erreurs);
      await o.ctx.close();
    }

    // ── Autre paire : les cartes du Débutant parlent du bitcoin, et le disent ──
    titre('SOL/USDT : les infos du marché nomment le bitcoin');
    for (const [vue, tactile] of [[{ width: 1440, height: 900 }, false], [{ width: 390, height: 844 }, true]]) {
      const o = await ouvrir(nav, { vue, tactile });
      await o.page.evaluate(async () => { await changeSymbol('SOLUSDT', document.getElementById('sym_SOLUSDT') || document.createElement('label')); });
      await o.page.waitForTimeout(800);
      await o.page.evaluate(() => { const k = document.querySelector('#cycle .kpi-deb'); if (k) k.click(); });
      await o.page.waitForTimeout(500);
      const t = await o.page.evaluate(() => { const box = document.getElementById(innerWidth <= 768 ? 'marketModalBody' : 'feed'); return box ? box.innerText : ''; });
      check(`SOL · ${vue.width} : « Ces infos parlent du bitcoin (en dollars), pas de SOL/USDT. », titres « Bitcoin : … », « le bitcoin est … de sa fourchette »`,
        /Ces infos parlent du bitcoin \(en dollars\), pas de SOL\/USDT\./.test(t) && /Bitcoin : fourchette des 24 h/i.test(t) && /le bitcoin est (dans le haut|dans le bas|au milieu) de sa fourchette/.test(t) && !/le prix est (dans le haut|dans le bas|au milieu)/.test(t), t.slice(0, 500));
      scanTexte(`SOL · ${vue.width}, cartes ouvertes`, await texteVisible(o.page));
      check(`SOL · ${vue.width} : aucune erreur JavaScript`, !o.erreurs.length, o.erreurs);
      await o.ctx.close();
    }

    // ── Téléphone : un sens (monte, baisse) dit toujours sa durée ──
    // Constat de revue : « Le prix monte. » sous « −0,57 % en 24 h » en rouge.
    titre('Téléphone : la phrase garde sa durée');
    for (const [w, cle, itv] of [[390, 'hausse', '15m'], [390, 'baisse', '1d'], [360, 'hausse', '5m']]) {
      const o = await ouvrir(nav, { vue: { width: w, height: 800 }, tactile: true });
      if (itv !== '15m') { await o.page.click('#int_' + itv); await o.page.waitForTimeout(1500); }
      const r = await o.page.evaluate(cle => {
        const r0 = Guide.regime;
        Guide.regime = (...a) => Object.assign({}, r0(...a), { cle });
        var24Courant = cle === 'hausse' ? -0.57 : 0.57;
        memoCache.clear(); debHautMemo = null; drawChart(); dessinerCalque();
        const ph = debEtat.items.find(i => i.role === 'phrase');
        const out = { phrase: ph && ph.texte, H: [Guide.HORIZON_DEBUTANT[chartInterval], Guide.HORIZON_COURT[chartInterval]] };
        Guide.regime = r0; memoCache.clear(); debHautMemo = null; drawChart();
        return out;
      }, cle);
      check(`${w} px, ${itv}, ${cle}, variation 24 h de sens contraire : « ${r.phrase} » commence par sa durée (${r.H.join(' / ')}), ≤ 48`,
        r.phrase && r.phrase.length <= 48 && r.H.some(h => r.phrase.indexOf(h + ', ') === 0) && r.phrase.includes(Guide.VERBE_DEBUTANT[cle]), r);
      await o.ctx.close();
    }

    // ── Bulle d'un repère : « Tout près » ne cite jamais l'autre repère de l'écran ──
    titre('Bulle d’un repère : « Tout près », du même côté et à côté seulement');
    for (const itv of ['1h', '1m']) {
      const o = await ouvrir(nav, { vue: { width: 1440, height: 900 } });
      await o.page.click('#int_' + itv); await o.page.waitForTimeout(1500);
      const r = await o.page.evaluate(() => {
        const D = guideDonnees();
        const b = D && D.choix.dessus.concat(D.choix.dessous).find(n => n.raisons.length >= 2 && n.pMax - n.pMin > 1);
        if (!b) return null;
        const ps = b.raisons.map(x => x.p).sort((x, y) => x - y);
        livePrice = (ps[0] + ps[1]) / 2; drawChart(); dessinerCalque();
        const E = guideEtat, S = E.debSel, lim = L => Math.max(L.niv.demi || 0, 0.25 * E.D.atr);
        return { live: livePrice, bande: ps, niveaux: E.niveaux.map(L => {
          const t = guideTexteNiveauDebutant(L, E).find(x => /^Tout près : /.test(x)) || '';
          const prix = (t.match(/\((\d{1,3}(?:[\s  ]\d{3})*(?:,\d+)?) \$\)/g) || []).map(x => +x.replace(/[^\d,]/g, '').replace(',', '.'));
          return { p: L.niv.p, autres: [S.dessus, S.dessous, L.suivant].filter(Boolean).map(x => x.p).filter(p => p !== L.niv.p), prix, lim: lim(L), t };
        }) };
      });
      if (!r) { check(`Tout près · ${itv} : une bande de plusieurs prix existe dans ce montage`, false, null); await o.ctx.close(); continue; }
      const mal = r.niveaux.filter(n => n.prix.some(p => n.autres.some(a => Math.abs(a - p) < 0.5) || Math.abs(p - n.p) > n.lim + 0.5 || (p > r.live) !== (n.p > r.live)));
      check(`Tout près · ${itv} : prix ${Math.round(r.live)} dans la bande ${r.bande.join(' / ')} → aucune bulle ne cite l'autre repère ni le suivant, ni un prix de l'autre côté ou à plus d'une demi-bande`, !mal.length, mal);
      await o.ctx.close();
    }

    // ── Un range pour scénario 1 : son libellé, toujours, en haut ; ses bords se survolent ──
    // Constat de revue : à 360 px en neon, plus de libellé du tout ; en aero et gazette, posé entre
    // la ligne du prix et le repère du bas (il se lisait comme un 3e repère).
    titre('Scénario 1 en range (plus haut que la vue) : libellé en haut, à 360 et 390 px');
    for (const [theme, w] of [['neon', 360], ['aero', 360], ['gazette', 360], ['neon', 390], ['aero', 1440]]) {
      const o = await ouvrir(nav, { vue: { width: w, height: w > 500 ? 900 : 740 }, theme, tactile: w < 500, prev: 'range' });
      const e = await controlerEcran(o, `range · ${theme} · ${w}`);
      const sc = e.items.find(i => i.role === 'scenario');
      const bas = e.bandes.filter(b => b.p < e.live).sort((a, b) => b.p - a.p)[0];
      const entre = sc && sc.rect && bas && e.yLive !== null && sc.rect.y + sc.rect.h > e.yLive && sc.rect.y < bas.yB;
      const haut = e.bandes.filter(b => b.p > e.live).sort((a, b) => a.p - b.p)[0];
      const entreH = sc && sc.rect && haut && e.yLive !== null && sc.rect.y < e.yLive && sc.rect.y + sc.rect.h > haut.yH;
      const bord = sc && sc.rect && (sc.rect.y <= e.top + 17 + 4 + 1 || sc.rect.y + sc.rect.h >= e.top + e.ph - 2 * 17 - 4 - 1);
      check(`range · ${theme} · ${w} : le libellé du scénario 1 est posé (« ${sc && sc.texte} »), dans les deux rangées du haut (ou du bas), jamais entre la ligne du prix et un repère`,
        sc && sc.rect && bord && !entre && !entreH && /^Scén(ario|\.) 1/.test(sc.texte), { sc, top: e.top, ph: e.ph, yLive: e.yLive, bas, haut });
      if (sc && w === 360) {
        const r = await viser(o, 'scenario', true);
        check(`range · ${theme} · ${w} : le toucher du libellé ouvre la bulle du scénario 1 (« reste entre »)`, r && /^Scénario 1 de Claude$/.test(r.titre) && /reste entre/.test(r.corps), r);
      }
      check(`range · ${theme} · ${w} : aucune erreur JavaScript`, !o.erreurs.length, o.erreurs);
      await o.ctx.close();
    }
    titre('Scénario 1 en range (bords dans la vue) : libellé avec son verbe, bords survolables');
    {
      const o = await ouvrir(nav, { vue: { width: 1440, height: 900 }, prev: 'range2' });
      const e = await controlerEcran(o, 'range2 · 1440');
      const sc = e.items.find(i => i.role === 'scenario');
      check(`range2 : « ${sc && sc.texte} » dit son verbe (« reste »)`, sc && /^Scén(ario|\.) 1 : reste /.test(sc.texte), e.items);
      const p = await o.page.evaluate(() => {
        const S = scenEtat, un = S && S.items.find(i => i.sc.rang === '1');
        if (!un) return null;
        const g = S.g, x0 = Math.max(g.pad.left, S.xDeT(un.sc.emis)), y = (S.yDe(un.sc.range[0]) + S.yDe(un.sc.range[1])) / 2, b = canvas.getBoundingClientRect();
        return { x: b.left + x0, y: b.top + y, dansVue: x0 > g.pad.left + 2 };
      });
      if (p && p.dansVue) {
        await o.page.mouse.move(p.x - 12, p.y); await o.page.mouse.move(p.x, p.y, { steps: 3 }); await o.page.waitForTimeout(150);
        const r = await o.page.evaluate(() => ({ titre: scenEtat.survol ? scenEtat.survol.titre : null }));
        check('range2 : survoler le bord gauche de la boîte ouvre la bulle du scénario 1', r.titre === 'Scénario 1 de Claude', r);
      } else check('range2 : le bord gauche de la boîte est dans la vue', false, p);
      await o.ctx.close();
    }

    // ── Stockage bloqué : la touche M et l'astuce suivent quand même ──
    titre('Stockage bloqué (navigation privée stricte)');
    {
      const ctx = await nav.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
      await ctx.clock.install({ time: maintenant() });
      await ctx.addInitScript(() => {
        const bloque = () => { throw new DOMException('bloqué', 'SecurityError'); };
        for (const k of ['getItem', 'setItem', 'removeItem', 'clear']) Storage.prototype[k] = bloque;
      });
      const o = await ouvrir(nav, { ctx });
      const etat = () => o.page.evaluate(() => ({ html: document.documentElement.getAttribute('data-mode'), deb: debutant(), items: debEtat ? debEtat.items.length : null, astuce: !document.getElementById('astuceTap').hidden }));
      const e0 = await etat();
      await o.page.keyboard.press('m'); await o.page.waitForTimeout(400);
      const e1 = await etat();
      await o.page.keyboard.press('m'); await o.page.waitForTimeout(400);
      const e2 = await etat();
      check('stockage bloqué : Débutant au départ ; M → Expert partout (page ET graphique) ; 2e M → Débutant', e0.html === 'debutant' && e0.deb && e1.html === 'expert' && !e1.deb && e1.items === null && e2.html === 'debutant' && e2.deb && e2.items > 0, { e0, e1, e2 });
      await o.page.clock.runFor(9000); await o.page.waitForTimeout(100);
      const a1 = await o.page.evaluate(() => { drawChart(); astuceMontrer(); return !document.getElementById('astuceTap').hidden; });
      check('stockage bloqué : l’astuce, cachée au bout de 8 s, ne revient pas au dessin suivant', !a1, a1);
      check('stockage bloqué : aucune erreur JavaScript', !o.erreurs.length, o.erreurs);
      await ctx.close();
    }

    // ── Clavier : la pastille « Infos du marché » s'ouvre à Entrée ; titre du panneau ──
    titre('Pastille « Infos du marché » au clavier ; titre du panneau des cartes');
    for (const [vue, tactile] of [[{ width: 1440, height: 900 }, false], [{ width: 390, height: 844 }, true]]) {
      for (const mode of ['debutant', 'expert']) {
        const o = await ouvrir(nav, { vue, tactile, mode });
        const nom = vue.width + ' · ' + mode;
        if (mode === 'debutant') {
          const a = await o.page.evaluate(() => { const k = document.querySelector('#cycle .kpi-deb'); k.focus(); return { focus: document.activeElement === k, aria: k.getAttribute('aria-label') }; });
          await o.page.keyboard.press('Enter'); await o.page.waitForTimeout(500);
          const ouvert = await o.page.evaluate(() => (innerWidth <= 768 ? getComputedStyle(document.getElementById('marketModal')).display !== 'none' : feedVisible));
          check(`${nom} : la pastille prend le focus, son nom accessible commence par « Infos du marché », Entrée ouvre les cartes`, a.focus && /^Infos du marché/.test(a.aria || '') && ouvert, Object.assign(a, { ouvert }));
        }
        // Le titre du panneau des cartes (téléphone) : la même police que celui du panneau « live ».
        const t = await o.page.evaluate(() => {
          const vis = el => el.getClientRects().length > 0 || getComputedStyle(el).display !== 'none';
          const m = [...document.querySelectorAll('#marketModal .modal-titre')].find(el => getComputedStyle(el).display !== 'none');
          const l = document.querySelector('#liveModal .modal-titre'), c = el => { const cs = getComputedStyle(el); return [cs.fontSize, cs.fontWeight]; };
          return { texte: m && m.textContent, m: m && c(m), l: l && c(l) };
        });
        check(`${nom} : titre des cartes « ${t.texte} », même taille et graisse que le titre du panneau live (${t.l})`, t.m && t.l && t.m[0] === t.l[0] && t.m[1] === t.l[1] && (mode === 'expert' ? t.texte === 'Marché live' : t.texte === 'Infos du marché'), t);
        await o.ctx.close();
      }
    }

    // ── L'en-tête au téléphone, 11 thèmes : prix, variation, bouton de mode, pastille sans chevauchement ──
    titre('En-tête au téléphone, 11 thèmes (390 et 360 px)');
    for (const theme of ['aero', 'aero-nuit', 'kala', 'neon', 'codex', 'bureau95', 'bureau95-contraste', 'gare', 'gazette', 'cyanotype', 'diazo']) for (const w of [390, 360]) {
      const o = await ouvrir(nav, { vue: { width: w, height: 800 }, theme, tactile: true });
      const r = await o.page.evaluate(() => {
        const vis = el => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden' && el.getBoundingClientRect().width > 0;
        const rs = ['#price', '#var24', '#modeBtn', '#cycle .kpi-deb'].map(q => [q, document.querySelector(q)]).filter(([, e]) => vis(e)).map(([q, e]) => ({ q, r: e.getBoundingClientRect().toJSON() }));
        const ch = [];
        for (let a = 0; a < rs.length; a++) for (let b = a + 1; b < rs.length; b++) { const A = rs[a].r, B = rs[b].r; if (A.left < B.right - 0.5 && A.right > B.left + 0.5 && A.top < B.bottom - 0.5 && A.bottom > B.top + 0.5) ch.push(rs[a].q + ' × ' + rs[b].q); }
        const hp = document.querySelector('.hero-prix'), v = document.getElementById('var24');
        const ph = debEtat && debEtat.items.find(i => i.role === 'phrase');
        return { ch, vus: rs.map(x => x.q), debord: hp ? hp.scrollWidth - hp.clientWidth : 0, var24: v.textContent, v24: v.getBoundingClientRect().toJSON(), vw: innerWidth, phrase: ph && ph.texte };
      });
      check(`${theme} · ${w} : la phrase entière, jamais coupée (« ${r.phrase} »)`, r.phrase && !/…$/.test(r.phrase) && /\.$/.test(r.phrase), r.phrase);
      check(`${theme} · ${w} : prix, variation 24 h (« ${r.var24} »), bouton de mode et pastille visibles, sans chevauchement ni débordement`,
        !r.ch.length && r.debord <= 1 && ['#price', '#var24', '#modeBtn', '#cycle .kpi-deb'].every(q => r.vus.includes(q)) && r.v24.right <= r.vw + 0.5, r);
      await o.ctx.close();
    }

    // ── Les 11 thèmes : texte visible ; les structures gardent la pastille ──
    titre('Thèmes et structures en Débutant');
    const THEMES = ['aero', 'aero-nuit', 'kala', 'neon', 'codex', 'bureau95', 'bureau95-contraste', 'gare', 'gazette', 'cyanotype', 'diazo'];
    for (const [theme, vue, tactile] of THEMES.map(t => [t, { width: 1440, height: 900 }, false]).concat([['aero', { width: 390, height: 844 }, true], ['gazette', { width: 390, height: 844 }, true]])) {
      const nom = theme + ' · ' + vue.width;
      const o = await ouvrir(nav, { vue, theme, tactile });
      scanTexte(nom, await texteVisible(o.page));
      const s = await o.page.evaluate(() => {
        const vis = el => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
        const k = document.querySelector('#cycle .kpi-deb'), cy = document.getElementById('cycle'), hd = document.querySelector('.header'), mb = document.getElementById('modeBtn');
        const parent = cy.parentElement, pr = parent.getBoundingClientRect();
        return { kpi: vis(k) ? k.getAttribute('title') : null, cadre: [Math.round(pr.width), Math.round(pr.height)], manchette: [...document.querySelectorAll('.gazette-manchette')].some(vis),
          mode: vis(mb) ? mb.innerText : null, tete: [hd.scrollWidth, hd.clientWidth], structure: document.documentElement.getAttribute('data-structure'),
          page: [document.documentElement.scrollWidth, document.documentElement.clientWidth], canvas: Math.round(canvas.getBoundingClientRect().height), vh: innerHeight };
      });
      check(`${nom} : pas de défilement de côté ; le graphique garde au moins la moitié de la hauteur (${s.canvas} px sur ${s.vh})`, s.page[0] <= s.page[1] + 1 && s.canvas >= s.vh * 0.5, s);
      check(`${nom} : pastille « Infos du marché » visible (âge en infobulle), son cadre non vide, manchette masquée, bouton de mode visible, en-tête sans débordement`,
        /il y a \d+ min/.test(s.kpi || '') && s.cadre[0] > 0 && s.cadre[1] > 0 && !s.manchette && /expert/i.test(s.mode || '') && s.tete[0] <= s.tete[1] + 1, s);
      check(`${nom} : aucune erreur JavaScript`, !o.erreurs.length, o.erreurs);
      await o.ctx.close();
    }
  } finally { await nav.close(); serveur.close(); }
  console.log(ko ? `\n❌ DÉBUTANT À L'ÉCRAN : ${ko} contrôle(s) en échec` : '\n✅ DÉBUTANT À L\'ÉCRAN : TOUS LES CONTRÔLES PASSENT');
  process.exit(ko ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
