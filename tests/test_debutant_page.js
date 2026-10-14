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
//      défilement de côté à 412, 390 et 360 px ; la barre d'outils sur deux rangées au plus (une au
//      téléphone) ; l'en-tête en deux rangées au téléphone, « en retard » compris, rien de rogné.
//   5. LE TEST DES 5 SECONDES : le prix (« 86 013 $ »), le verbe de la phrase, un repère de chaque
//      côté du prix, « Scénario 1 », la variation 24 h visible au téléphone.
//   6. ABSENTS en Débutant : compteur, pastille de la vue, régime, « Et ensuite ? », rangs 2, 3
//      et Semaine, repères numérotés, traits du point et de la fin, repère de publication, boutons
//      et puces Expert, Grid Bot, chiffres clés. ↺ reste (retour au présent).
//   7. BULLES : survol (bureau) ou toucher (téléphone) de chaque texte — la bonne cible, le
//      détail qui a quitté l'écran (état au prix, chemins, autres scénarios, journal, bilan), pas
//      d'infobulle des prix par-dessus, un curseur « main ».
//   8. ASTUCE : une fois (tactile : « Touchez… » ; souris : « Survolez… »), jamais sur un texte. La
//      clé « ? » ne se voit jamais par-dessus une bulle ouverte (revue du 14/10, C35).
//   9. « LE DÉTAIL » et « LES CHIFFRES DU MARCHÉ » (deux cases du panneau « Choisir l'affichage » ;
//      plus d'interrupteur ni de touche M) : le détail revient entier, remis en page ; décoché,
//      l'écran calme identique ; mêmes valeurs avec et sans. Les chiffres du marché, à part : l'en-tête
//      et les boutons, pas le graphique. Le détail changé sur la carte (autre onglet) suit ici ; sans
//      data-mode / data-chiffres (ou une valeur inconnue), la feuille montre l'écran calme, jamais les
//      deux variantes à la fois. L'ancien Complet garde son écran ; les trois calques simples de
//      l'ancien Lisible sont versés dans le panneau.
//  10. STRUCTURES de thème en Débutant : pastille « Infos du marché », manchette masquée.
//  11. SOBRIÉTÉ : survoler une cible ne redessine pas le graphique ; au repos, rien.
//  12. AXE DU TEMPS au téléphone (revue du 14/10, C17) : une vue de plusieurs jours (1 h, 4 h) écrit
//      la date sur la 1re étiquette de chaque jour ; deux étiquettes jamais à moins de
//      PARAM.axeTemps.ecartMin px (Planche à 360 px, marge du futur) ; 15 min d'un seul jour : l'heure.
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
const { coupuresLignes } = require('./fins-de-ligne');

let playwright = null;
for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright', process.env.PLAYWRIGHT_MODULE].filter(Boolean)) {
  try { playwright = require(p); break; } catch (e) { /* suivant */ }
}
if (!playwright) {
  console.log('  − NON EXÉCUTÉ : Playwright introuvable — le mode Lisible n\'est pas vérifié à l\'écran sur ce poste.');
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
// L'écart attendu du point du matin (Scenarios.texteAmpleur ; revue du 14/10/2026, Q3) : ses deux
// phrases, le seul pourcentage permis dans la bulle de la boîte des scénarios.
const AGITATION = /Écart attendu entre plus bas et plus haut d’ici [^.]* : en général [\d,]+ %\.\s*Une fois sur dix, plus de [\d,]+ % \(calcul de \d\d:\d\d\)\./g;
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
// La carte des ordres en attente (heatmap.json) calée sur l'horloge et les prix simulés (86 000 ± 400) :
// celle du dépôt est republiée toutes les 15 min, à une autre heure et à d'autres prix. Douze heures de
// colonnes d'une minute, vingt tranches de 20 $ de chaque côté du prix (section des calques simples).
function chaleurAlignee() {
  const dt = 60, dp = 20, fin = Math.floor(maintenant() / 1000 / dt), n = 12 * 60, colonnes = [];
  const serie = m => Array.from({ length: 20 }, (_, i) => 60 + ((m + i) % 7) * 25);
  for (let m = fin - n + 1; m <= fin; m++) colonnes.push([m, 4280, serie(m), 4301, serie(m * 3)]);
  return JSON.stringify({ updated: LU, sym: 'BTCUSDT', t0: (fin - n + 1) * dt, dt, dp, format: 'colonnes-1', colonnes });
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
 *  mode ('debutant' par défaut), garder (ne pas vider le stockage : rechargement),
 *  chaleur (la carte des ordres en attente calée sur l'heure et les prix simulés) }. */
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
      if (u.includes('heatmap')) return r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: o.chaleur ? chaleurAlignee() : fs.readFileSync(path.join(REPO, 'heatmap.json')) });
      if (/\/master\/market-data\.json/.test(u)) return r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: MD });
      return r.fulfill({ status: 404, headers: cors, body: '' });
    }
    return r.abort();
  });
  // Le mode par défaut (stockage vide) est le Débutant ; le thème, la couche des scénarios.
  await page.addInitScript(([t, m, garder, sansScen, avant]) => {
    try {
      if (!garder) localStorage.clear();
      localStorage.setItem('samsara-theme', t);
      if (m) localStorage.setItem('samsara-mode', m);
      if (sansScen) localStorage.setItem('samsara-scenarios-v1', '0');
      for (const [k, v] of Object.entries(avant)) localStorage.setItem(k, v);
    } catch (e) { /* */ }
  }, [o.theme || 'aero', o.mode || null, !!o.garder, o.prev === 'aucun', o.avant || {}]);
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
    scen: scenEtat ? { libelles: scenEtat.libelles, cibles: scenEtat.cibles.map(c => ({ prio: c.prio, titre: c.titre, scenario: c.scenario || null, texte: [].concat(c.texte || []), moment: c.moment || null, rects: (c.rects || []).length, segs: (c.segs || []).length })),
      boite: scenEtat.boite ? { deb: !!scenEtat.boite.deb, cede: !!scenEtat.boite.cede, replie: !!scenEtat.boite.replie, texte: scenEtat.boite.texte || null, lignes: scenEtat.boite.lignes.map(l => l.t) } : null,
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
/** « Le détail » et « Les chiffres du marché », les deux cases du panneau « Choisir l'affichage »
 *  (plus d'interrupteur dans l'en-tête) : leur état, ce que la page en a fait (data-mode,
 *  data-chiffres) et ce qui est gardé. */
const reglage = page => page.evaluate(() => {
  if (!document.querySelector('#indMenu label[data-ind="detail"]')) buildDropdown();
  const c = k => { const i = document.querySelector(`#indMenu label[data-ind="${k}"] input`); return i ? i.checked : null; };
  const h = document.documentElement;
  return { detail: c('detail'), chiffres: c('chiffres'), mode: h.getAttribute('data-mode'), attrChiffres: h.getAttribute('data-chiffres'),
    stocke: localStorage.getItem('samsara-mode'), stockeCh: localStorage.getItem('samsara-chiffres-v1'), modeBtn: !!document.getElementById('modeBtn') };
});
/** Le bouton « Choisir l'affichage » (où se trouvent désormais « Le détail » et « Les chiffres du
 *  marché ») : visible, entier dans l'écran, au-dessus de tout ; et plus d'interrupteur #modeBtn. */
const boutonAffichage = page => page.evaluate(() => {
  const b = document.getElementById('indDropdownBtn'), q = b && b.getBoundingClientRect();
  const x = q && q.width ? document.elementFromPoint(Math.min(innerWidth - 1, q.left + q.width / 2), Math.min(innerHeight - 1, q.top + q.height / 2)) : null;
  return { modeBtn: !!document.getElementById('modeBtn'), visible: !!b && b.getClientRects().length > 0 && getComputedStyle(b).visibility !== 'hidden',
    entier: !!q && q.width > 0 && q.left >= -0.5 && q.right <= innerWidth + 0.5 && q.top >= -0.5 && q.bottom <= innerHeight + 0.5, dessus: !!x && (x === b || b.contains(x)) };
});
const boutonJuste = x => !!x && !x.modeBtn && x.visible && x.entier && x.dessus;
/** Coche ou décoche une de ces deux cases comme le ferait la souris : panneau ouvert, clic, refermé. */
async function cocher(page, k) {
  if (!await page.evaluate(() => document.getElementById('indMenu').classList.contains('open'))) { await page.click('#indDropdownBtn'); await page.waitForTimeout(150); }
  await page.evaluate(k => document.querySelector(`#indMenu label[data-ind="${k}"]`).scrollIntoView({ block: 'center' }), k);
  await page.click(`#indMenu label[data-ind="${k}"] input`);
  await page.waitForTimeout(300);
  await page.evaluate(() => { const m = document.getElementById('indMenu'); m.classList.remove('open'); document.getElementById('indDropdownBtn').setAttribute('aria-expanded', 'false'); });
  await page.waitForTimeout(150);
}
const nombres = t => (t.match(/\d{1,3}(?:[\s  ]\d{3})+|\d+/g) || []).map(x => x.replace(/[\s  ]/g, ''));
// Le budget d'une bulle sans « Le détail » (charte du 12/10/2026 ; revue du 14/10/2026, M6 et C16) :
// au plus PARAM.guide.debutant.bulleMots mots hors avertissement, comptés comme les fiches (un groupe
// qui porte une lettre ou un chiffre), et un seul avertissement.
// Les deux avertissements de la charte, partagés (revue du 14/10/2026, C19 : « Une lecture débattue,
// pas une prévision ni un conseil. » n'existe plus).
const AVERTISSEMENTS = ['Une description, pas un conseil.', 'Une hypothèse de Claude (une IA), pas un conseil.'];
const motsBulle = t => AVERTISSEMENTS.reduce((x, a) => x.split(a).join(' '), t).split(/\s+/).filter(w => /[\p{L}\p{N}]/u.test(w)).length;
const avertissements = t => (t.match(/pas une? (?:conseil|prévision ni un conseil)/g) || []).length;
const BULLE_MOTS = +(fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8').match(/\bbulleMots: (\d+)/) || [0, 0])[1];
const VERBES = /\b(touche|est passé|monte|baisse|hésite|s’agite|est entre|est sous|est au-dessus|est sans repère|indisponible)\b/;
// forme : PARAM.guide.debutant.forme (26) — plan figures §5.3 et amendement C1 (« Cible touchée, à confirmer », 26).
// « evenement » : la ligne « ce qui vient de se passer » (PR 5), une seule, aux limites de la phrase ;
// elle prend une des 5 places (le registre et le journal la comptent comme les autres).
// « fourchette » : l'étiquette de la couche « Fourchette de 7 jours » (plan du 13/10/2026, idée 5),
// une seule (etiqFourchette). 48 caractères et non plus 22 (revue du 14/10/2026, M2) : ses deux
// bornes hors de la vue, elle donne leurs prix, « ↕ Fourchette 7 jours : 80 394 – 84 352 $ » (39) ;
// sa place en pixels est contrôlée à part.
// scenario : 35 et non plus 32 (revue du 14/10/2026, M10) : « Scénario » en entier, jamais « Scén. »
// (PARAM.guide.debutant.scenario).
const LIMITES = { phrase: [90, 48], niveau: [26, 18], scenario: [35, 35], forme: [26, 26], boite: [48, 40], evenement: [90, 48], fourchette: [48, 48] };
// L'étiquette de la fourchette sans cassure (revue du 14/10/2026, M2) : ses deux traits dans la vue,
// « Fourchette 7 jours » ; un seul, la borne qu'il est, sans flèche (« Bas 7 jours », « Haut 7 jours » :
// seul « Fourchette 7 jours », il passait pour un repère parmi d'autres) ; aucun, la flèche (↕, ↑ ou
// ↓), puis les deux prix quand ils tiennent.
const etiqFourchette = (t, visH, visB) => visH && visB ? t === 'Fourchette 7 jours' : visH !== visB ? t === (visB ? 'Bas' : 'Haut') + ' 7 jours'
  : /^[↕↑↓] Fourchette(?: 7 jours(?: : [\d  ]+ – [\d  ]+ \$)?| : [\d  ]+ – [\d  ]+ \$)$/.test(t || '');
const ROLES_MAX = { phrase: 1, niveau: 2, scenario: 1, forme: 1, boite: 1, evenement: 1, fourchette: 1 };

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
  const lim = k => LIMITES[k][etroit ? 1 : 0];
  check(`${nom} : limites de caractères (phrase ${lim('phrase')}, repère ${lim('niveau')}, scénario ${lim('scenario')}, forme ${lim('forme')}, ligne ${lim('boite')}, événement ${lim('evenement')})`, !trop.length, trop);
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
  // « Scénario » en entier, plus « Scén. » (revue du 14/10/2026, M10).
  if (!opts.sansScenarios) check(`${nom} : « Scénario 1 » (ou la ligne des scénarios) est à l'écran`, e.items.some(i => /^(↑ |↓ )?Scénario 1|^Scénarios? /.test(i.texte)), e.items.map(i => i.texte));
  const dom = await o.page.evaluate(() => {
    const vis = el => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
    return { prix: document.getElementById('price').textContent, var24: vis(document.getElementById('var24')) ? document.getElementById('var24').textContent : null,
      caches: ['liveBtn', 'feedBtn', 'stratSection'].filter(id => vis(document.getElementById(id))),
      puces: [...document.querySelectorAll('#indicatorBar label[id^="lbl_"]')].filter(vis).length,
      kpis: [...document.querySelectorAll('#cycle .kpi')].filter(vis).length, reset: vis(document.getElementById('resetBtn')),
      kpiDeb: vis(document.querySelector('#cycle .kpi-deb')) ? document.querySelector('#cycle .kpi-deb').getAttribute('title') : null };
  });
  check(`${nom} : le prix de l'en-tête au format français (« ${dom.prix} »)`, /^\d{1,3}(?:[\s ]\d{3})*(?:,\d+)?[\s ]\$$/.test(dom.prix), dom.prix);
  check(`${nom} : la variation 24 h visible, sa durée dite (« ${dom.var24} »)`, dom.var24 && / en 24 h$/.test(dom.var24), dom.var24);
  // 6. Absents en Débutant.
  const exp = e.trace.filter(t => /^\d[\d ]*\/\d[\d ]* · /.test(t) || /^[+−]?\d+,\d+ %$/.test(t) || /^fichier .* · prix publié /.test(t) || /^\d$/.test(t) || /^(Point|fin|Écrit à)/.test(t) || /EMA|RSI|Bollinger/.test(t));
  check(`${nom} : ni compteur, ni pastille de la vue, ni repère de publication, ni repères ①②, ni traits du point et de la fin`, !exp.length, exp);
  check(`${nom} : ni badge du régime, ni « Et ensuite ? » (guideEtat.chemins vide)`, !e.cibles.some(c => /^Tendance/.test(c.titre || '')) && !e.chemins, { chemins: e.chemins, cibles: e.cibles.map(c => c.titre) });
  // Le scénario MONTRÉ (rang 1 tant qu'il est ouvert ou réalisé ; sinon le suivant encore ouvert —
  // contrat de la journée, plan-scenarios.md M7) : son libellé seul, jamais deux.
  // L'heure d'une annonce (le CPI ; revue du 14/10/2026, N4 / Q3) : son trait se touche (même famille,
  // même rang que ceux du point et de la fin), mais en L'essentiel il n'a AUCUN nom posé sur le tracé.
  if (e.scen) check(`${nom} : un seul libellé de scénario, celui du scénario montré (${e.scen.montre || '1'}) ; ni nom du point et de la fin`, e.scen.libelles.length <= 1 && e.scen.libelles.every(l => l.rang === (e.scen.montre || '1')) && !e.scen.cibles.some(c => c.prio === 3 && !c.moment), e.scen);
  const cpiDeb = e.scen ? e.scen.cibles.filter(c => c.moment) : [];
  if (cpiDeb.length) check(`${nom} : le trait du CPI se touche (« ${cpiDeb[0].titre} »), sans nom posé sur le tracé, sans texte de plus au départ`,
    cpiDeb.every(c => c.moment === 'CPI' && c.rects === 0 && c.segs === 1 && /^Chiffres américains de l’inflation \(CPI\) · /.test(c.titre)) && !e.trace.some(t => /CPI|inflation/i.test(t)) && !(e.items || []).some(i => /CPI|inflation/i.test(i.texte)), cpiDeb);
  // Les puces du ruban : une par calque de marché choisi (opts.calques ; opts.puces : des calques
  // posés sur les bougies seulement, sans le Volume — la fourchette de 7 jours), aucune sinon.
  const nPuces = opts.calques ? opts.calques.length : opts.puces || 0;
  check(`${nom} : boutons des chiffres du marché, Grid Bot et chiffres clés masqués ; ${nPuces ? 'une puce par calque choisi (' + dom.puces + ')' : 'aucune puce de calque'} ; ↺ visible ; la pastille « Infos du marché » dit l'âge (infobulle)`,
    !dom.caches.length && dom.puces === nPuces && dom.kpis === 0 && dom.reset && /il y a \d+ min/.test(dom.kpiDeb || ''), dom);
  // Le Volume, calque simple du Lisible : son seul sous-graphe, quand il est allumé (opts.calques).
  // « Mon écran » (plan du site, idée 9) : les sous-graphes qu'il pose, dans l'ordre (opts.sous).
  if (opts.sous) check(`${nom} : les sous-graphes de « Mon écran » (${e.sous.join(', ') || 'aucun'})`, e.sous.join() === opts.sous.join(), e.sous);
  else if (opts.calques) check(`${nom} : un seul sous-graphe, le Volume (${e.sous.join(', ') || 'aucun'})`, e.sous.join() === 'vol', e.sous);
  else check(`${nom} : aucun sous-graphe (${e.sous.join(', ') || 'aucun'})`, !e.sous.length, e.sous);
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
  if (!tactile) { await o.page.mouse.move(2, 2); await o.page.waitForTimeout(50); }   // hors du graphique : aucune bulle ouverte
  await o.page.evaluate(() => { window.__dc = 0; window.__ft = []; window.__ftOn = true; });
  if (tactile) await o.page.touchscreen.tap(p.x, p.y);
  else { await o.page.mouse.move(p.x - 10, p.y - 3); await o.page.mouse.move(p.x, p.y, { steps: 3 }); }
  await o.page.waitForTimeout(150);
  const lire = () => o.page.evaluate(() => {
    window.__ftOn = false;
    const G = guideEtat, S = scenEtat;
    const c = (G && G.survol) || (S && S.survol) || null;
    const b = (G && G.survol && G.bulle) || (S && S.survol && S.bulle) || null;
    return { titre: c ? c.titre : null, prio: c ? c.prio : null, scenario: c ? c.scenario || null : null, corps: b ? b.corps.join(' ') : '', curseur: canvas.style.cursor,
      police: b ? b.police : null, dansTrace: b ? b.y >= 0 && b.y + b.h <= geo.mainH && b.x >= 0 && b.x + b.w <= canvas.width / devicePixelRatio : null,
      resume: b ? b.resume : null, lignes: b ? b.lignes : null, nombres: b ? b.nombres : null,
      ohlcv: window.__ft.some(e => e.c === 'chartCalque' && /^(Début|Haut|Bas|Fin|Volume)$|^[OHLC] /.test(e.t)) };
  });
  // La bulle en trois niveaux : le résumé d'abord, puis le détail au 2e toucher (ou au clic) ;
  // une bulle déjà courte est entière d'emblée (un 2e toucher la fermerait).
  const r1 = await lire();
  if (!r1.resume) return Object.assign({}, r1, { vise: p.texte, court: r1 });
  await o.page.evaluate(() => { window.__ft = []; window.__ftOn = true; });
  if (tactile) await o.page.touchscreen.tap(p.x, p.y); else await o.page.mouse.click(p.x, p.y);
  await o.page.waitForTimeout(150);
  const r = await lire();
  return Object.assign(r, { vise: p.texte, court: r1 });
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
      for (const [vue, tactile] of [[{ width: 1440, height: 900 }, false], [{ width: 1024, height: 768 }, false], [{ width: 412, height: 892 }, true], [{ width: 390, height: 844 }, true], [{ width: 360, height: 740 }, true]]) {
        const nom = vue.width + ' px · ' + theme;
        titre(nom);
        const o = await ouvrir(nav, { vue, theme, tactile, prev });
        const e = await controlerEcran(o, nom);
        if (prev === 'ouvert') check(`${nom} : le scénario 1 en cours a son libellé sur le tracé (« ${(e.items.find(i => i.role === 'scenario') || {}).texte} »)`,
          e.items.some(i => i.role === 'scenario' && /^(?:[↑↓] )?Scénario 1 : /.test(i.texte) && (i.texte.match(/[↑↓]/g) || []).length <= 1), e.items);
        // Des calques de marché choisis dans le panneau : un seul choix, avec ou sans « Le détail ».
        // Ils sont dessinés ici aussi ; les textes du Guide (le registre des cinq) restent les mêmes.
        const e2 = await o.page.evaluate(() => {
          const avant = debEtat.items.map(i => i.texte);
          Object.assign(overlays, { ema20: true, bb: true, sr: true, fib: true, vp: true }); activeSubs.rsi = true;
          resizeCanvas(); window.__ft = []; window.__ftOn = true; drawChart(); window.__ftOn = false;
          const r = { n: debEtat.items.length, memes: JSON.stringify(debEtat.items.map(i => i.texte)) === JSON.stringify(avant), textes: window.__ft.map(x => x.t), sous: geo.sous.map(s => s.cle), mode: modeCourant() };
          Object.assign(overlays, { ema20: false, bb: false, sr: false, fib: false, vp: false }); activeSubs.rsi = false; resizeCanvas(); drawChart();
          return r;
        });
        check(`${nom} : EMA, Bollinger, S/R, Fibonacci, profil et RSI choisis — dessinés ici aussi (sous-graphe RSI, niveaux de Fibonacci, POC), sans « Le détail » ; les textes du Guide inchangés (${e2.n} ≤ 5)`,
          e2.mode === 'debutant' && e2.n <= 5 && e2.memes && e2.sous.includes('rsi') && e2.textes.some(t => /^61,8 %/.test(t)) && e2.textes.some(t => /^POC /.test(t)) && !e2.textes.some(t => /^EMA \d/.test(t)), e2);
        // La couche de chaleur (carnet) choisie : dessinée ici aussi (test_interface vérifie qu'elle est
        // refaite au changement de thème).
        const chaleur = await o.page.evaluate(async () => {
          await fetchHeatmap(); const avant = heatLayer; overlays.liq = true; drawChart();
          const r = { donnees: !!(histHeatmap && histHeatmap.grille), couche: !!heatLayer && heatLayer !== avant };
          overlays.liq = false; drawChart(); return r;
        });
        check(`${nom} : couche de chaleur choisie, dessinée ici aussi (données lues : ${chaleur.donnees})`, chaleur.donnees && chaleur.couche, chaleur);
        // 4. L'en-tête et la barre d'outils.
        const mise = await o.page.evaluate(() => {
          // La pastille dans sa forme la plus longue (« Infos · en retard ▸ ») : c'est elle qui, à
          // 412 px, poussait les boutons sur une 3e rangée.
          const cy = document.getElementById('cycle'), etaitVieux = cy.classList.contains('vieux');
          cy.classList.add('vieux');
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
          const rangs = rs => { const t = []; for (const r of rs.slice().sort((a, b) => a.top - b.top)) { if (!t.length || r.top >= t[t.length - 1].bas - 1) t.push({ bas: r.bottom }); else t[t.length - 1].bas = Math.max(t[t.length - 1].bas, r.bottom); } return t.length; };
          // Dans le cadre de l'en-tête, à 4 px de ses bords au moins (un coin trop rond rognait la paire).
          const H = hd.getBoundingClientRect(), rognes = bs.filter(b => b.r.left < H.left + 4 || b.r.right > H.right - 4).map(b => b.id);
          const res = { ch, page: [document.documentElement.scrollWidth, document.documentElement.clientWidth], tete: [hd.scrollWidth, hd.clientWidth], barre: [barre.scrollWidth, barre.clientWidth], rangees: tops.length,
            rangsTete: rangs(bs.map(b => b.r)), rognes, rayon: parseFloat(getComputedStyle(hd).borderTopLeftRadius), hTete: H.height };
          if (!etaitVieux) cy.classList.remove('vieux');
          return res;
        });
        check(`${nom} : les boutons de l'en-tête ne se chevauchent pas`, !mise.ch.length, mise.ch);
        check(`${nom} : ni la page, ni l'en-tête, ni la barre d'outils ne défilent de côté ; barre sur 2 rangées au plus`,
          mise.page[0] <= mise.page[1] + 1 && mise.tete[0] <= mise.tete[1] + 1 && mise.barre[0] <= mise.barre[1] + 1 && mise.rangees <= 2, mise);
        // Écran étroit : l'en-tête en deux rangées au plus (le prix, puis la pastille et les boutons),
        // rien de rogné par ses coins ; la barre d'outils (six intervalles et « Affichage ») sur une
        // seule rangée au téléphone.
        check(`${nom} : pastille « en retard » comprise, l'en-tête tient en ${vue.width <= 480 ? 2 : 1} rangée(s) au plus (${mise.rangsTete}), rien de rogné par ses coins`,
          mise.rangsTete <= (vue.width <= 480 ? 2 : 1) && !mise.rognes.length && (mise.rangsTete === 1 || mise.rayon < mise.hTete / 2 - 4), mise);
        if (vue.width <= 480) check(`${nom} : la barre d'outils tient sur une rangée (${mise.rangees})`, mise.rangees === 1, mise);
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
          // L'écart au prix en dollars, sans « % » : en Lisible, un pourcentage se lirait comme une
          // chance, et l'écart en dollars le dit déjà. Plan du site, idée 8 (13/10/2026) : l'écart dit à
          // quoi il sert (« 340 $ au-dessus : ce qu’il reste avant ce repère. ») et la bande aussi.
          if (role === 'niveau') detail = /^Maintenant : /.test(r.corps) && /\d\s\$\s(?:au-dessus|en dessous) : (?:ce qu’il reste avant ce repère|l’écart déjà fait au-delà)\.|le prix est dedans/.test(r.corps) && !/%/.test(r.corps) && /Si le prix finit|Aucun repère proche/.test(r.corps)
            // (Changé exprès, revue du 14/10/2026, M6 : la bande et « Tout près » ne restent que si la
            // bulle tient en 50 mots ; quand elle est dite, la bande dit toujours à quoi elle sert.)
            && (!/Bande de ±/.test(r.corps) || /Bande de ± [\d\s,]+\$ : la marge où l’on dit que le prix touche le repère\./.test(r.corps))
            // Le titre : le nom entier du repère et le prix de son libellé.
            && nombres(r.vise).filter(x => x.length >= 4).every(x => nombres(r.titre).includes(x)) && / · \d/.test(r.titre);
          if (role === 'phrase') detail = (r.corps.match(/Si le prix finit|Aucun repère proche/g) || []).length >= 2;
          // Le libellé est celui du scénario MONTRÉ (le 1, ou le suivant encore ouvert s'il est tombé) :
          // sa bulle ne redit pas les autres (charte du 12/10/2026 : la bulle de la ligne les liste).
          const mo = (e.scen && e.scen.montre) || '1', autres = ['1', '2', '3'].filter(x => x !== mo);
          // (Revue du 14/10/2026, C16 : quand la ligne a cédé sa place, la bulle dit « Les autres … » au
          // lieu du rang ; jamais « place prise ».)
          if (role === 'scenario') detail = new RegExp('^Scénario ' + mo + ' de Claude$').test(r.titre) && !autres.some(x => new RegExp('(^|\\s)' + x + '\\. ').test(r.corps)) && (/sans pourcentage/.test(r.corps) || /Les autres/.test(r.corps)) && /Une hypothèse de Claude \(une IA\), pas un conseil/.test(r.corps) && !/place prise/.test(r.corps);
          if (role === 'boite') detail = /\b1\. /.test(r.corps) && /\b2\. /.test(r.corps) && /\b3\. /.test(r.corps) && /journal/.test(r.corps);
          // Choix 1B : le classement est celui de Claude (une IA), sans pourcentage ; les seuls « % »
          // admis sont la marge d'une zone (« ± 0,3 % »), qui n'est pas une probabilité, et l'écart
          // attendu du point du matin, sans sens (revue du 14/10/2026, N4 ; Q3 de Lorenzo : « Les deux »).
          if (role === 'scenario' || role === 'boite') detail = detail && /Claude[ ,(]+une IA/.test(r.corps) && !/%/.test(r.corps.replace(/±\s*[\d,]+\s*%/g, '').replace(AGITATION, '') + r.titre);
          check(`${nom} : ${role}${k ? ' ' + (k + 1) : ''} « ${r.vise} » → sa bulle (${r.titre}), le détail attendu, sans infobulle des prix${tactile ? '' : ', curseur main'}, sans jargon ni base du hasard`,
            ok.titre && ok.ohlcv && ok.curseur && !ok.mots.length && !ok.conseil && !ok.hasard && detail, { r, ok, detail });
          // La preuve de la revue du 14/10/2026 (M6, C16) : le détail tient dans son budget, un seul avertissement.
          check(`${nom} : ${role}${k ? ' ' + (k + 1) : ''} : le détail tient en ${BULLE_MOTS} mots hors avertissement (${motsBulle(r.corps)}), un seul avertissement`,
            motsBulle(r.corps) <= BULLE_MOTS && avertissements(r.corps) === 1 && !/place prise/.test(r.corps), r.corps);
          // Le résumé (1er toucher ou survol) : le même titre, 4 lignes et 3 nombres au plus, une phrase
          // au moins quand le titre en laisse la place, et la ligne qui mène au détail.
          const c1 = r.court;
          // « tout lire », pas « le détail » : ce mot est le nom de la case (revue du 14/10/2026, M9).
          if (c1.resume) check(`${nom} : ${role}${k ? ' ' + (k + 1) : ''} : le résumé d'abord (${c1.lignes} lignes, ${c1.nombres} nombres), « ${tactile ? 'Touchez encore' : 'Cliquez'} : tout lire · pas une prévision »`,
            r.resume === false && c1.titre === r.titre && c1.lignes <= 4 && c1.nombres <= 3 && new RegExp((tactile ? 'Touchez encore' : 'Cliquez') + ' : tout lire · pas une prévision$').test(c1.corps) && !/le détail/i.test(c1.corps)
            && c1.corps.length < r.corps.length && !bannisBulle(c1.corps).length, c1);
          else check(`${nom} : ${role}${k ? ' ' + (k + 1) : ''} : bulle déjà courte, entière d'emblée (${c1.lignes} lignes), sans renvoi au détail`, c1.lignes <= 6 && !/ : (le détail|tout lire) · /.test(c1.corps), c1);
          if (role === 'niveau' && k === 0) {
            // Un chiffre publié (mur du carnet, options) garde son âge dans la bulle.
            const pub = await o.page.evaluate(() => guideEtat.niveaux.filter(L => L.niv.raisons.some(r => isFinite(r.lu))).map(L => L.etiq && L.etiq.t));
            if (pub.some(Boolean)) {
              // Au doigt, le toucher précédent a posé le réticule : on le retire, sinon un 2e
              // toucher sur la même étiquette fermerait la bulle au lieu de l'ouvrir.
              if (tactile) await o.page.evaluate(() => { crossX = crossY = null; dessinerCalque(); });
              const k2 = (await o.page.evaluate(() => debEtat.items.filter(i => i.role === 'niveau').map(i => i.texte))).findIndex(t => pub.includes(t));
              const r2 = await viser(o, 'niveau', tactile, k2);
              // Idée 8 : l'âge dans une phrase à lui (« Relevé il y a 3 min : l’âge de ce chiffre »).
              check(`${nom} : la bulle d'un repère publié dit son âge ou son heure (« relevé il y a … » ; « relevé à hh:mm » sous une minute), et à quoi il sert (« l’âge de ce chiffre »)`,
                r2 && /[Rr]elevée? (il y a \d+ min|à \d\d:\d\d)[^.;]* : l’âge de ce chiffre/.test(r2.corps), r2);
              if (tactile) await quitter(o, tactile, r2 ? 0 : 0, 0);
            }
          }
          if (tactile) { await o.page.evaluate(() => { crossX = crossY = null; dessinerCalque(); }); } else await quitter(o, false);
        }
        // Le toucher (doigt) : le 1er toucher montre le résumé, le 2e le détail, un 3e au même
        // endroit retire la bulle.
        if (tactile) {
          const p = await o.page.evaluate(() => { const it = debEtat.items.find(i => i.role === 'niveau'); const b = canvas.getBoundingClientRect(); return it ? { x: b.left + it.rect.x + 20, y: b.top + it.rect.y + it.rect.h / 2 } : null; });
          if (p) {
            const etat = () => o.page.evaluate(() => ({ survol: !!guideEtat.survol, resume: guideEtat.bulle ? guideEtat.bulle.resume : null, crossX }));
            await o.page.touchscreen.tap(p.x, p.y); await o.page.waitForTimeout(150);
            const t1 = await etat();
            await o.page.touchscreen.tap(p.x, p.y); await o.page.waitForTimeout(150);
            const t2 = await etat();
            await o.page.touchscreen.tap(p.x, p.y); await o.page.waitForTimeout(150);
            const r = await o.page.evaluate(() => ({ survol: guideEtat.survol, crossX }));
            check(`${nom} : 1er toucher, le résumé ; 2e, le détail ; un 3e au même endroit retire la bulle`, t1.survol && t1.resume === true && t2.survol && t2.resume === false && r.survol === null && r.crossX === null, { t1, t2, r });
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
        // Le même panneau pour tous : d'abord « Ce que dit le graphique » (Guide, scénarios, « Le
        // détail », « Les chiffres du marché »), en mots simples ; puis les calques de marché sous
        // des questions en mots, chacun avec sa phrase « C'est quoi ? » (son nom reste le sien : EMA,
        // RSI…, expliqué).
        const menu = await o.page.evaluate(() => {
          const m = document.getElementById('indMenu'), vis = el => el.getClientRects().length > 0;
          const titres = [...m.querySelectorAll('.cat-title')].filter(vis).map(t => ({ innerText: t.textContent.trim() }));
          const lignes = [...m.querySelectorAll('label[data-ind]')].filter(vis);
          const ecran = lignes.filter(l => l.dataset.cat === 'ecran');
          return { premier: titres.length ? titres[0].innerText : '', questions: titres.slice(1).map(t => t.innerText),
            ecran: ecran.map(l => l.dataset.ind), texteEcran: titres[0].innerText + ' ' + ecran.map(l => l.innerText).join(' '),
            sansQuoi: lignes.filter(l => !(l.querySelector('.aff-quoi') || {}).textContent).map(l => l.dataset.ind), n: lignes.length, modeBtn: !!document.getElementById('modeBtn') };
        });
        check(`${nom} : le panneau « Choisir l'affichage » s'ouvre sur « Ce que dit le graphique » (Guide, scénarios, Le détail, Les chiffres du marché), puis les calques sous des questions ; chaque ligne dit « C'est quoi ? »`,
          /^Ce que dit le graphique$/.test(menu.premier) && menu.ecran.join() === 'guide,scenarios,detail,chiffres' && menu.questions.length >= 3 && menu.n > 10 && !menu.sansQuoi.length && !menu.modeBtn, menu);
        const motsEcran = bannis(menu.texteEcran).concat(menu.questions.flatMap(bannis));
        check(`${nom} : « Ce que dit le graphique » et les questions du panneau sans jargon ni conseil`, !motsEcran.length && !CONSEIL.test(menu.texteEcran), { motsEcran, questions: menu.questions });
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
      // elle commence par « Scénario 1 » (en entier : revue du 14/10/2026, M10) et contient « ✗ », ou dit « Aucun scénario » ; toujours marquée
      // « (en direct) » ; jamais un libellé qui nomme le scénario 1 par ses niveaux.
      check(`fermé · ${vue.width} : la ligne dit la fermeture du rang 1 (« Scénario 1 … ✗ » ou « Aucun scénario »), marquée « (en direct) » ; jamais de libellé « Scénario 1 : … »`,
        ligne && (/^Scénario 1\b.*✗/.test(ligne.texte) || /^Aucun (scénario|ne)\b|^Scénarios : aucun\b/.test(ligne.texte)) && /\(en direct\)/.test(ligne.texte) && /▸$/.test(ligne.texte)
        && !e.items.some(i => i.role === 'scenario' && /^(↑ |↓ )?Scén(ario|\.) 1 :/.test(i.texte)), e.items);
      // Sa bulle (toucher ou survol) tient dans le tracé et dit le suivi en direct, le journal, l'avertissement.
      const r = await viser(o, 'boite', tactile);
      const b = await o.page.evaluate(() => (scenEtat && scenEtat.bulle ? { y: scenEtat.bulle.y, h: scenEtat.bulle.h, mainH: geo.mainH } : null));
      // (Revue du 14/10/2026, M6 : « (en direct) », le même pour tous, est dit une fois, en tête de phrase.)
      check(`fermé · ${vue.width}×${vue.height} : la bulle de la ligne tient dans le tracé et dit le suivi en direct, le journal et « pas un conseil »`,
        r && b && b.y >= 0 && b.y + b.h <= b.mainH && /[Ee]n direct/.test(r.corps) && /journal/.test(r.corps) && /Une hypothèse de Claude \(une IA\), pas un conseil/.test(r.corps), { b, corps: r && r.corps });
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

    // ── 4 h, une forme validée : elle entre, la ligne des scénarios cède (budget) ──
    titre('4 h · double sommet validé (forme forcée)');
    {
      const o = await ouvrir(nav, { vue: { width: 1440, height: 900 } });
      await o.page.click('#int_4h'); await o.page.waitForTimeout(1500);
      const r = await o.page.evaluate(() => {
        const n = candles.length, G = PARAM.guide, C = i => candles[i];
        const ia = n - 34, ic = n - 24, ib = n - 14, pa = Math.max(C(ia).high, C(ib).high), pc = C(ic).low;
        // (Plan figures : la figure forcée porte ce que le détecteur rend — extrême, hauteur,
        // invalidation, clôture de confirmation — car la bulle lit ses niveaux dans niveauxFigure.)
        const f = { type: 'double_sommet', famille: 'extremes', sens: -1, phase: 'confirme', a: { i: ia, p: pa }, b: { i: ib, p: pa }, cou: { i: ic, p: pc }, niveau: pc, extreme: pa, hauteur: pa - pc, objectif: pc - (pa - pc),
          invalidation: pa, t: ib + G.pivot, debut: ia, depart: ib + 1, jConf: ib + G.pivot + 2, fin: null, jFin: null, journal: [] };
        // (Revue des figures : le Débutant lit sa liste dans Guide.formesDebutant — la forme forcée y
        // passe aussi.)
        const f0 = Guide.formesAffichees, fd0 = Guide.formesDebutant, b0 = GUIDE_FORMES.val && GUIDE_FORMES.val.bilan;
        Guide.formesAffichees = () => [f]; Guide.formesDebutant = () => [f];
        if (GUIDE_FORMES.val) GUIDE_FORMES.val.bilan = Object.assign({}, b0, { double_sommet: { formes: 3, confirmes: 1, atteints: 1, invalides: 0, expires: 0, temoin: { departs: 40, atteints: 12 } } });
        drawChart();
        const items = debEtat.items.map(i => ({ role: i.role, texte: i.texte, rect: i.rect }));
        const forme = guideEtat.cibles.find(c => c.prio === 2 && c.rects.length);
        const B = scenEtat && scenEtat.boite, un = scenEtat && scenEtat.cibleUn;
        const out = { base: guideEtat.debForme ? guideEtat.debForme.t : null, possibles: Guide.libellesPossiblesDebutant(f), items, forme: forme ? { titre: forme.titre, texte: forme.texte.join(' '), rect: forme.rects[0] } : null, cede: !!(B && B.cede), un: un ? un.texte.join(' ') : '' };
        window.__retablir = () => { Guide.formesAffichees = f0; Guide.formesDebutant = fd0; if (GUIDE_FORMES.val) GUIDE_FORMES.val.bilan = b0; drawChart(); };
        return out;
      });
      const roles = r.items.map(i => i.role);
      // (Amendement C1 : le libellé de la figure est posé sur le calque et dit l'état vivant au prix
      // live ; « Double sommet validé » est le libellé de la clôture, le texte posé l'un des possibles.)
      check('4 h : « Double sommet validé » posé, au plus 5 textes', roles.includes('forme') && r.items.length <= 5 && r.base === 'Double sommet validé'
        && r.items.some(i => i.role === 'forme' && r.possibles.includes(i.texte)), { base: r.base, items: r.items });
      // (Changé exprès, revue du 14/10/2026, C16 : plus « La ligne des scénarios (place prise) : » suivi de
      // toute sa bulle, mais la phrase courte des autres scénarios, et un seul avertissement.)
      if (roles.includes('scenario')) check('4 h : forme + scénario 1 posés → la ligne des scénarios cède ; la bulle du libellé « Scénario 1 » dit les autres (« Les autres … »), un seul avertissement, sans « place prise »',
        r.cede && !roles.includes('boite') && /Les autres/.test(r.un) && !/place prise/.test(r.un) && avertissements(r.un) === 1 && motsBulle(r.un) <= BULLE_MOTS, r);
      // (Amendement E4, puis plan du 13/10/2026 : « objectif théorique selon l'usage des analystes : X, non garanti » ;
      // idée 8 du même plan : l'objectif dit sur quoi il se calcule, « X (la hauteur de la figure, reportée) ».)
      // Changé exprès, revue du 14/10/2026 (M6) : le nom, dans le titre, n'est plus redit en tête ;
      // « Objectif théorique : X (sa hauteur, reportée), non garanti ».
      // Revue du 14/10/2026 (C19) : la fin est l'avertissement partagé, plus « pas une prévision ni un conseil ».
      check('4 h : la bulle de la forme la définit, dit son bilan (« Mesuré sur », « fois sur ») avec l’objectif théorique et ce sur quoi il se calcule, et « Une description, pas un conseil. »',
        r.forme && /^Le prix a buté deux fois sur le même plafond\. /.test(r.forme.texte) && /Mesuré sur/.test(r.forme.texte) && /fois sur/.test(r.forme.texte) && /[Oo]bjectif théorique : \d[\d  ]* \$ \(sa hauteur, reportée\), non garanti/.test(r.forme.texte) && r.forme.texte.replace(/\s+/g, ' ').includes(AVERTISSEMENTS[0]) && !/pas une prévision ni/.test(r.forme.texte) && !bannisBulle(r.forme.texte).length, r.forme);
      const e = await dessin(o.page);
      check('4 h : la ligne des scénarios renvoie au suivi en 15 min ou 1 h (quand elle est posée)', !e.items.some(i => i.role === 'boite') || e.items.some(i => /à voir en 15 min ou 1 h/.test(i.texte)), e.items);
      await o.page.evaluate(() => window.__retablir());
      check('4 h : aucune erreur JavaScript', !o.erreurs.length, o.erreurs);
      await o.ctx.close();
    }

    // ── Une figure qui se dessine encore : nommée « possible », en tirets, sa bulle dit ce qui la validerait ──
    titre('15 min · double creux possible (forme forcée, pas encore validée)');
    {
      const o = await ouvrir(nav, { vue: { width: 1440, height: 900 } });
      const r = await o.page.evaluate(() => {
        const n = candles.length, G = PARAM.guide, C = i => candles[i];
        const ia = n - 34, ic = n - 24, ib = n - 14, pa = Math.min(C(ia).low, C(ib).low), pc = C(ic).high;
        const f = { type: 'double_creux', famille: 'extremes', sens: 1, a: { i: ia, p: pa }, b: { i: ib, p: pa }, cou: { i: ic, p: pc }, niveau: pc, extreme: pa, hauteur: pc - pa, objectif: pc + (pc - pa),
          invalidation: pa, t: ib + G.pivot, debut: ia, depart: ib + 1, phase: 'formation', fin: null, jFin: null, demi: false, journal: [] };
        // (Revue des figures : le Débutant lit sa liste dans Guide.formesDebutant — la forme forcée y
        // passe aussi.)
        const f0 = Guide.formesAffichees, fd0 = Guide.formesDebutant, b0 = GUIDE_FORMES.val && GUIDE_FORMES.val.bilan;
        Guide.formesAffichees = () => [f]; Guide.formesDebutant = () => [f];
        if (GUIDE_FORMES.val) GUIDE_FORMES.val.bilan = Object.assign({}, b0, { double_creux: { formes: 4, confirmes: 2, atteints: 1, invalides: 1, expires: 0, temoin: { departs: 40, atteints: 12 } } });
        drawChart();
        const items = debEtat.items.map(i => ({ role: i.role, texte: i.texte }));
        const forme = guideEtat.cibles.find(c => c.prio === 2 && c.rects.length);
        const base = guideEtat.debForme ? guideEtat.debForme.t : null, possibles = Guide.libellesPossiblesDebutant(f);
        Guide.formesAffichees = f0; Guide.formesDebutant = fd0; if (GUIDE_FORMES.val) GUIDE_FORMES.val.bilan = b0; drawChart();
        return { base, possibles, items, forme: forme ? { titre: forme.titre, texte: forme.texte.join(' ') } : null };
      });
      // (Amendement C1 : au prix live, le libellé peut dire « … à valider »…)
      check('« Double creux possible » posé, au plus 5 textes', r.base === 'Double creux possible' && r.items.some(i => i.role === 'forme' && r.possibles.includes(i.texte)) && r.items.length <= 5, { base: r.base, items: r.items });
      // (Changé exprès, revue du 14/10/2026, M6 : le nom, dans le titre, n'est plus redit ; « Figure validée si … ».)
      check('sa bulle : ce qu’on voit, ce qui la validerait (« Figure validée si le prix finit 2 quarts d’heure de suite au-dessus de »), le bilan mesuré, aucun prix visé, aucun mot banni',
        r.forme && /^Le prix a rebondi deux fois vers /.test(r.forme.texte) && /Figure validée si le prix finit 2 quarts d’heure de suite au-dessus de /.test(r.forme.texte)
        && /Mesuré sur/.test(r.forme.texte) && !/vise/.test(r.forme.texte) && !bannisBulle(r.forme.texte).length, r.forme);
      check('aucune erreur JavaScript', !o.erreurs.length, o.erreurs);
      await o.ctx.close();
    }

    // ── Axe du temps au téléphone (revue du 14/10, C17) ──
    // En 1 h et 4 h, l'axe n'écrivait que des heures sur 2 à 8 jours (« 06:00 22:00 14:00… ») : rien
    // ne disait le jour, et la plage datée n'existe qu'avec « Le détail ». En Planche à 360 px, avec
    // la marge du futur (flèche du scénario montré, forcée ici), la 1re étiquette, poussée contre le
    // bord gauche, touchait la 2e (« 23:4502:45 », 1 px d'écart).
    titre('Axe du temps au téléphone : la date sur la 1re étiquette de chaque jour, rien de collé');
    {
      /** Les étiquettes de l'axe du temps (la rangée la plus basse du tracé) et les jours de la vue. */
      const axeTemps = page => page.evaluate(() => {
        crossX = crossY = null; if (typeof bulleDetail !== 'undefined') bulleDetail = null;
        window.__ft = []; window.__ftOn = true; drawChart(); window.__ftOn = false;
        const ax = window.__ft.filter(e => e.c === 'chart' && /^\d\d[:/]\d\d$/.test(e.t)), y = Math.max(...ax.map(e => e.y));
        const m = document.createElement('canvas').getContext('2d'); m.font = chartFont(9);
        const vis = candles.slice(Math.max(0, viewStart), Math.min(candles.length, viewEnd));
        return { etiq: ax.filter(e => e.y === y).map(e => ({ t: e.t, x: e.x, fin: e.x + m.measureText(e.t).width })),
          jours: [...new Set(vis.map(c => Fmt.jour(c.time * 1000)))], ecartMin: PARAM.axeTemps.ecartMin };
      });
      const colle = a => a.etiq.slice(1).map((e, k) => +(e.x - a.etiq[k].fin).toFixed(1)).filter(g => g < a.ecartMin - 0.01);
      for (const [theme, L, fleche] of [['bureau95', 390, false], ['aero', 390, false], ['cyanotype', 360, true], ['diazo', 360, true]]) {
        const o = await ouvrir(nav, { vue: { width: L, height: 844 }, tactile: true, theme, avant: { 'samsara-astuce-tap-v1': '1' } });
        if (fleche) await o.page.evaluate(() => { window.scenFleches = () => true; });
        const nom = `${theme} ${L} px`;
        const a15 = await axeTemps(o.page);
        check(`${nom} · 15 min, vue d'un seul jour : l'heure seule (« ${a15.etiq.map(e => e.t).join(' ')} »)`, a15.jours.length === 1 && a15.etiq.length >= 3 && a15.etiq.every(e => /:/.test(e.t)), a15);
        check(`${nom} · 15 min : aucune étiquette à moins de ${a15.ecartMin} px de la précédente`, !colle(a15).length, { ecarts: colle(a15), etiq: a15.etiq });
        for (const itv of ['1h', '4h']) {
          await o.page.evaluate(async i => { await changeInterval(i, document.getElementById('int_' + i)); }, itv);
          await o.page.waitForFunction(i => chartInterval === i && candles.length > 30, itv, { timeout: 15000 }).catch(() => {});
          await o.page.waitForTimeout(300);
          const a = await axeTemps(o.page), dates = a.etiq.filter(e => /\//.test(e.t)).map(e => a.jours.indexOf(e.t));
          check(`${nom} · ${itv}, vue de ${a.jours.length} jours : la 1re étiquette est une date, chaque date est un jour de la vue, dans l'ordre (« ${a.etiq.map(e => e.t).join(' ')} »)`,
            a.jours.length >= 3 && /\//.test(a.etiq[0].t) && dates.length >= 2 && dates.every((d, k) => d >= 0 && (k === 0 || d > dates[k - 1])), a);
          check(`${nom} · ${itv} : aucune étiquette à moins de ${a.ecartMin} px de la précédente`, !colle(a).length, { ecarts: colle(a), etiq: a.etiq });
        }
        check(`${nom} · aucune erreur JavaScript`, !o.erreurs.length, o.erreurs);
        await o.ctx.close();
      }
    }

    // ── La clé « ? » et l'astuce : la clé toujours là en Lisible, l'astuce une fois ──
    // La clé est un bouton (hors du budget des 5 textes) posé dans un coin du tracé, jamais sur un
    // texte, ni sur la ligne qui valide une figure, ni sur la ligne du prix ; elle ouvre la fiche du
    // Guide. L'astuce (« Touchez / Survolez une étiquette pour la lire » : revue du 14/10/2026, M9) l'accompagne la toute
    // première fois, puis s'efface ; la clé reste.
    titre('Clé « ? » et astuce : la clé toujours là en Lisible, l’astuce une fois, jamais sur un texte');
    /** La clé et l'astuce telles qu'elles se voient (coordonnées du canvas). */
    const lireCle = page => page.evaluate(() => {
      const a = document.getElementById('astuceTap'), k = document.getElementById('cleAide'), ph = document.getElementById('astucePhrase');
      const c = canvas.getBoundingClientRect(), ra = a.getBoundingClientRect(), rk = k.getBoundingClientRect();
      const vis = el => !!el && !el.hidden && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden' && el.getBoundingClientRect().width > 0;
      const R = r => ({ x: r.left - c.left, y: r.top - c.top, w: r.width, h: r.height });
      const boite = R(ra), cle = R(rk), P = geoPrix;
      const coupe = (r, i) => r.x < i.x + i.w && r.x + r.w > i.x && r.y < i.y + i.h && r.y + r.h > i.y;
      const segs = (debEtat && debEtat.eviteSegs) || [];
      const surSeg = segs.some(s => { for (let t = 0; t <= 1; t += 0.02) { const x = s[0] + (s[2] - s[0]) * t, y = s[1] + (s[3] - s[1]) * t; if (x >= boite.x && x <= boite.x + boite.w && y >= boite.y && y <= boite.y + boite.h) return true; } return false; });
      const yL = yPrixLive(), h = elementFromPointCle();
      function elementFromPointCle() { const x = document.elementFromPoint(rk.left + rk.width / 2, rk.top + rk.height / 2); return x && (x === k || k.contains(x)); }
      return {
        cle: vis(k) && vis(a), bouton: k.tagName === 'BUTTON', nom: k.getAttribute('aria-label') || '', dessous: h, phrase: vis(ph) ? ph.textContent : null,
        boite, r: cle, dansTrace: !!P && boite.x >= 0 && boite.x + boite.w <= P.W - P.right + 0.5 && boite.y >= P.top - 0.5 && boite.y + boite.h <= P.top + P.ph + 0.5,
        surTexte: debEtat ? debEtat.items.filter(i => i.rect && coupe(boite, i.rect)).map(i => i.texte) : ['(pas de Lisible)'],
        surSeg, yPrix: yL, surPrix: yL !== null && yL >= boite.y - 4 && yL <= boite.y + boite.h + 4,
        stockee: (() => { try { return localStorage.getItem('samsara-astuce-tap-v1'); } catch (e) { return 'bloqué'; } })(),
      };
    });
    const cleBienPosee = c => c.cle && c.bouton && c.dessous && c.dansTrace && !c.surTexte.length && !c.surSeg && !c.surPrix;
    {
      // Tactile (390 px), 1re visite : l'astuce « Touchez… », sur aucun texte ; cachée au toucher ; la clé reste.
      const ctx = await nav.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
      await ctx.clock.install({ time: maintenant() });
      const o = await ouvrir(nav, { ctx, tactile: true });
      const a = await lireCle(o.page);
      check('tactile, 1re visite : « Touchez une étiquette pour la lire » à côté de la clé « ? », sur aucun texte ni aucune ligne', a.phrase === 'Touchez une étiquette pour la lire' && cleBienPosee(a), a);
      const b = await o.page.evaluate(() => canvas.getBoundingClientRect());
      await o.page.touchscreen.tap(b.left + b.width / 2, b.top + b.height - 60); await o.page.waitForTimeout(200);
      const apres = await lireCle(o.page);
      check('… l’astuce cachée au premier toucher du graphique ; la clé samsara-astuce-tap-v1 vaut « 1 » ; la clé « ? » reste, sur aucun texte', apres.phrase === null && apres.stockee === '1' && cleBienPosee(apres), apres);
      await o.page.close();
      const o2 = await ouvrir(nav, { ctx, tactile: true, garder: true });
      const a2 = await lireCle(o2.page);
      check('… au rechargement, l’astuce ne revient pas ; la clé, si', a2.phrase === null && cleBienPosee(a2), a2);
      await ctx.close();
      // Souris (1440 px) : « Survolez… », une fois, cachée au bout de 8 s ; la clé reste.
      const o3 = await ouvrir(nav, { vue: { width: 1440, height: 900 } });
      const a3 = await lireCle(o3.page);
      check('souris : « Survolez une étiquette pour la lire », une fois, à côté de la clé', a3.phrase === 'Survolez une étiquette pour la lire' && cleBienPosee(a3), a3);
      await o3.page.clock.runFor(9000); await o3.page.waitForTimeout(100);
      const a4 = await lireCle(o3.page);
      check('… l’astuce cachée au bout de 8 s ; la clé reste, sur aucun texte', a4.phrase === null && a4.stockee === '1' && cleBienPosee(a4), a4);
      await o3.ctx.close();
    }
    {
      // La clé, à 360, 390 (au doigt) et 1440 px : un bouton nommé en mots, sous le doigt, dans le tracé,
      // sur aucun texte ni aucune ligne ; la ligne du prix amenée dessus la fait changer de place ; elle
      // ouvre la fiche du Guide (clic, toucher, Entrée), Échap la ferme et rend la main à la clé.
      for (const [vue, tactile] of [[{ width: 360, height: 740 }, true], [{ width: 390, height: 844 }, true], [{ width: 1440, height: 900 }, false]]) {
        const o = await ouvrir(nav, { vue, tactile });
        const nom = vue.width + ' px' + (tactile ? ' (doigt)' : '');
        const c = await lireCle(o.page);
        check(`${nom} : la clé « ? » est là — un bouton nommé « ${c.nom} », sous le doigt, dans le tracé, sur aucun texte (${c.surTexte.length}), ni la ligne d’une figure, ni la ligne du prix`,
          cleBienPosee(c) && /^[A-ZÀ-Ÿ][a-zà-ÿ ’']{8,}$/.test(c.nom), c);
        if (tactile) check(`${nom} : au doigt, sa cible fait au moins 40 × 40 px (${Math.round(c.r.w)} × ${Math.round(c.r.h)})`, c.r.w >= 40 && c.r.h >= 40, c.r);
        // Le prix live amené au milieu de la clé : elle change de place, toujours hors des textes.
        const p = await o.page.evaluate(() => { const P = geoPrix, k = document.getElementById('cleAide').getBoundingClientRect(), cv = canvas.getBoundingClientRect();
          const y = k.top - cv.top + k.height / 2; return P.minP + P.range * (1 - (y - P.top) / P.ph); });
        await o.page.evaluate(v => { livePrice = v; dessinerCalque(); }, p);
        await o.page.waitForTimeout(100);
        const c2 = await lireCle(o.page);
        check(`${nom} : la ligne du prix amenée sur la clé (y ${Math.round(c.r.y + c.r.h / 2)}) : la clé change de place (y ${Math.round(c2.r.y)}), hors de la ligne et des textes`,
          Math.abs(c2.yPrix - (c.r.y + c.r.h / 2)) < 2 && c2.r.y !== c.r.y && cleBienPosee(c2), { avant: c.r, apres: c2 });
        // Elle ouvre la fiche du Guide.
        if (tactile) await o.page.tap('#cleAide'); else await o.page.click('#cleAide');
        await o.page.waitForTimeout(250);
        const f1 = await o.page.evaluate(() => ({ fiche: ficheOuverte, vue: !document.getElementById('fichePop').hidden, titre: (document.querySelector('#fichePop .fiche-titre') || {}).textContent }));
        await o.page.keyboard.press('Escape'); await o.page.waitForTimeout(150);
        const f2 = await o.page.evaluate(() => ({ fiche: ficheOuverte, focus: document.activeElement && document.activeElement.id }));
        check(`${nom} : ${tactile ? 'un toucher' : 'un clic'} sur la clé ouvre la fiche du Guide (« ${f1.titre} ») ; Échap la ferme et rend la main à la clé`,
          f1.fiche === 'guide' && f1.vue && f2.fiche === null && f2.focus === 'cleAide', { f1, f2 });
        if (!tactile) {
          await o.page.focus('#cleAide'); await o.page.keyboard.press('Enter'); await o.page.waitForTimeout(250);
          const f3 = await o.page.evaluate(() => ficheOuverte);
          await o.page.keyboard.press('Escape');
          check(`${nom} : au clavier, Entrée sur la clé ouvre la même fiche`, f3 === 'guide', f3);
        }
        check(`${nom} : aucune erreur JavaScript`, !o.erreurs.length, o.erreurs);
        await o.ctx.close();
      }
      // Complet : ni clé ni astuce.
      for (const [vue, tactile] of [[{ width: 390, height: 844 }, true], [{ width: 1440, height: 900 }, false]]) {
        const o = await ouvrir(nav, { vue, tactile, mode: 'expert' });
        const c = await o.page.evaluate(() => { const a = document.getElementById('astuceTap'), k = document.getElementById('cleAide'); return { conteneur: !a.hidden && a.getClientRects().length > 0, cle: k.getClientRects().length > 0 }; });
        check(`Complet, ${vue.width} px : ni clé « ? » ni astuce`, !c.conteneur && !c.cle, c);
        await o.ctx.close();
      }
    }
    {
      // Revue du 14/10 (C35) : une bulle trop haute pour passer au-dessus de la clé (au téléphone, la
      // place manque aussi à sa droite) se faisait cacher une ligne par le « ? ». La clé s'efface tant
      // que la bulle est ouverte, sans que la bulle bouge, et revient à sa fermeture. Deux tailles au
      // doigt, 360 × 740 et 320 × 640 : depuis que les bulles tiennent en 50 mots (revue du 14/10, M6),
      // aucune ne recouvre plus la clé à 360 × 740 ; à 320 × 640, la bulle du scénario 1 (2e toucher)
      // la recouvre encore. Le contrôle veut au moins une bulle dessus, toutes tailles confondues.
      const res = [], erreursC35 = [];
      for (const vue of [{ width: 360, height: 740 }, { width: 320, height: 640 }]) {
        const o = await ouvrir(nav, { vue, tactile: true, avant: { 'samsara-astuce-tap-v1': '1' } });
        const cibles = await o.page.evaluate(() => { const b = canvas.getBoundingClientRect(); return debEtat.items.filter(i => i.rect).map(i => ({ texte: i.texte, x: b.left + i.rect.x + Math.min(i.rect.w / 2, 40), y: b.top + i.rect.y + i.rect.h / 2 })); });
        const lire = () => o.page.evaluate(() => {
          const k = document.getElementById('cleAide'), rk = k.getBoundingClientRect(), cb = canvas.getBoundingClientRect(), B = bulleOuverte;
          const q = { x: rk.left - cb.left, y: rk.top - cb.top, w: rk.width, h: rk.height };
          return { bulle: B && [B.x, B.y, B.w, B.h].map(Math.round), vue: getComputedStyle(k).visibility === 'visible' && !k.closest('[hidden]'),
            dessous: !!B && q.x < B.x + B.w && q.x + q.w > B.x && q.y < B.y + B.h && q.y + q.h > B.y };
        });
        for (const c of cibles) {
          await o.page.evaluate(() => { crossX = crossY = null; bulleDetail = null; dessinerCalque(); });
          await o.page.touchscreen.tap(c.x, c.y); await o.page.waitForTimeout(200);
          await o.page.touchscreen.tap(c.x, c.y); await o.page.waitForTimeout(250);
          const r = await lire();
          await o.page.evaluate(() => dessinerCalque());   // une image de plus : la bulle reste où elle est
          const r2 = await lire();
          await o.page.evaluate(() => { crossX = crossY = null; bulleDetail = null; dessinerCalque(); });
          const ferme = await lire();
          res.push({ vue: vue.width + '×' + vue.height, texte: c.texte, bulle: r.bulle, dessous: r.dessous, cleVue: r.vue, stable: JSON.stringify(r2.bulle) === JSON.stringify(r.bulle) && r2.vue === r.vue, revient: ferme.vue });
        }
        erreursC35.push(...o.erreurs);
        await o.ctx.close();
      }
      const dessous = res.filter(r => r.bulle && r.dessous);
      check(`360 × 740 et 320 × 640 (doigt) : la clé « ? » ne se voit jamais par-dessus une bulle ouverte (sous ${dessous.length} bulle(s) : ${dessous.map(r => r.vue + ' ' + r.texte).join(', ')})`, dessous.length >= 1 && dessous.every(r => !r.cleVue), res);
      check('… une bulle qui laisse sa place libre la garde visible ; la bulle ne bouge pas d’une image à l’autre ; la clé revient à la fermeture',
        res.filter(r => r.bulle && !r.dessous).every(r => r.cleVue) && res.every(r => r.stable && r.revient), res);
      check('… aucune erreur JavaScript', !erreursC35.length, erreursC35);
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

    // ── « Le détail » et « Les chiffres du marché » : deux cases du panneau, plus d'interrupteur ──
    titre('Le détail et les chiffres du marché (panneau « Choisir l’affichage »)');
    {
      const o = await ouvrir(nav, { vue: { width: 1440, height: 900 } });
      const d1 = await dessin(o.page);
      const r0 = await reglage(o.page);
      check('au départ : plus d\'interrupteur dans l\'en-tête ; « Le détail » et « Les chiffres du marché » décochés dans le panneau ; data-mode « debutant », data-chiffres « 0 », rien de gardé',
        !r0.modeBtn && r0.detail === false && r0.chiffres === false && r0.mode === 'debutant' && r0.attrChiffres === '0' && r0.stocke === null && r0.stockeCh === null, r0);
      await o.page.evaluate(() => { window.__ecrits = []; const f = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { window.__ecrits.push(k + '=' + v); return f.apply(this, arguments); }; });
      await cocher(o.page, 'detail');
      const x = await dessin(o.page);
      const exp = await o.page.evaluate(() => {
        const vis = el => !!el && el.getClientRects().length > 0;
        const c = canvas;
        return { kpis: [...document.querySelectorAll('#cycle .kpi')].filter(k => k.getBoundingClientRect().width > 0).length,
          strat: vis(document.getElementById('stratSection')), puces: [...document.querySelectorAll('#indicatorBar label[id^="lbl_"]')].filter(vis).map(l => l.dataset.calque || l.id),
          taille: [c.width, c.height], attendu: [Math.round(c.clientWidth * devicePixelRatio), Math.round(c.clientHeight * devicePixelRatio)], liveBtn: vis(document.getElementById('liveBtn')),
          kpisDom: document.querySelectorAll('#cycle .kpi').length, aria: c.getAttribute('aria-label') };
      });
      const r1 = await reglage(o.page);
      check('« Le détail » coché : data-mode="expert", gardé (« expert »), la case reste cochée ; « Les chiffres du marché » ni cochés ni écrits',
        x.mode === 'expert' && r1.mode === 'expert' && r1.detail === true && r1.chiffres === false && r1.attrChiffres === '0' && r1.stocke === 'expert' && r1.stockeCh === null, r1);
      check('Le détail : le badge du régime, « Et ensuite ? » (2 boîtes ou une commune), le compteur', x.cibles.some(c => /^Tendance|^Sans tendance|^Régime/.test(c.titre || '')) && x.chemins && x.chemins.boites.length >= 1 && x.trace.some(t => /^\d[\d ]*\/\d[\d ]* · /.test(t)), { cibles: x.cibles.map(c => c.titre), chemins: x.chemins, trace: x.trace.slice(0, 8) });
      // Option A (11/10/2026) : avec « Le détail », l'encadré des scénarios est replié en une ligne ;
      // son explication (« Scénarios du matin · … ») porte une ligne par rang.
      const explB = x.scen && (x.scen.cibles.find(c => /^Scénarios du matin · /.test(c.titre || '') && c.texte.length) || {}).texte || [];
      check('Le détail : au moins 3 bandes nommées, l\'encadré des scénarios replié en une ligne, son explication « Scénarios du matin · » avec les rangs 1, 2 et 3',
        x.cibles.filter(c => c.prio === 1).length >= 2 && x.scen && x.scen.boite && !x.scen.boite.deb && x.scen.boite.replie && x.scen.boite.lignes.length === 1
        && ['1. ', '2. ', '3. '].every(m => explB.some(l => l.startsWith(m))), { scen: x.scen && x.scen.boite, explB });
      check('Le détail : le repère de publication est dessiné', x.tous.some(t => /^fichier .* · prix publié /.test(t)), x.tous.filter(t => /fichier/.test(t)));
      check('Le détail seul : ni chiffres clés, ni Grid Bot, ni bouton ⚡ (ils suivent « Les chiffres du marché ») ; aucun calque de marché ajouté (ni puce, ni sous-graphe)',
        exp.kpisDom === 8 && exp.kpis === 0 && !exp.strat && !exp.liveBtn && !exp.puces.length && !x.sous.length, { exp, sous: x.sous });
      check('Le détail : le graphique n\'a plus pour nom la phrase de l\'écran calme (aria-label retiré)', exp.aria === null, exp.aria);
      check('Le détail : le graphique remis en page (taille du canvas = son conteneur × devicePixelRatio)', exp.taille[0] === exp.attendu[0] && exp.taille[1] === exp.attendu[1], exp);
      check('mêmes valeurs avec et sans le détail : niveaux choisis, régime, états des scénarios', JSON.stringify(d1.valeurs) === JSON.stringify(x.valeurs) && JSON.stringify(d1.scen.items) === JSON.stringify(x.scen.items), { deb: [d1.valeurs, d1.scen.items], exp: [x.valeurs, x.scen.items] });
      // Le panneau reconstruit (rouvert) ne change rien : ni mode, ni écriture.
      await o.page.evaluate(() => { window.__ecrits = []; buildDropdown(); });
      const rb = await reglage(o.page), eb = await o.page.evaluate(() => ({ deb: debutant(), items: debEtat ? debEtat.items.length : null, ecrits: window.__ecrits.filter(e => /^samsara-(mode|chiffres|affichage)/.test(e)) }));
      check('panneau reconstruit : « Le détail » toujours coché, rien ne change (mode, stockage, graphique)', rb.detail === true && !eb.deb && eb.items === null && !eb.ecrits.length, { rb, eb });
      // Les chiffres du marché : l'en-tête et les boutons, pas le graphique.
      await cocher(o.page, 'chiffres');
      const xc = await dessin(o.page);
      const ch = await o.page.evaluate(() => {
        const vis = el => !!el && el.getClientRects().length > 0;
        return { kpis: [...document.querySelectorAll('#cycle .kpi')].filter(k => k.getBoundingClientRect().width > 0).length, strat: vis(document.getElementById('stratSection')),
          liveBtn: vis(document.getElementById('liveBtn')), kpiDeb: vis(document.querySelector('#cycle .kpi-deb')) };
      });
      const r2 = await reglage(o.page);
      check('« Les chiffres du marché » cochés : data-chiffres="1", gardés (« 1 ») ; les chiffres clés (au moins 3 à cette taille), le Grid Bot et ⚡ visibles, la pastille « Infos du marché » masquée ; le détail inchangé',
        r2.attrChiffres === '1' && r2.chiffres === true && r2.stockeCh === '1' && r2.detail === true && r2.mode === 'expert' && ch.kpis >= 3 && ch.strat && ch.liveBtn && !ch.kpiDeb, { r2, ch });
      check('« Les chiffres du marché » : les textes du graphique inchangés', JSON.stringify(xc.trace) === JSON.stringify(x.trace), { avant: x.trace, apres: xc.trace });
      await cocher(o.page, 'detail');
      const d2 = await dessin(o.page);
      const r3 = await reglage(o.page);
      check('« Le détail » décoché : retour à l\'écran calme, les mêmes textes ; gardé (« debutant ») ; les chiffres du marché restent (réglage à part)',
        d2.mode === 'debutant' && r3.detail === false && r3.stocke === 'debutant' && r3.chiffres === true && r3.attrChiffres === '1' && JSON.stringify(d2.items.map(i => i.texte)) === JSON.stringify(d1.items.map(i => i.texte)), { r3, avant: d1.items.map(i => i.texte), apres: d2.items.map(i => i.texte) });
      await cocher(o.page, 'chiffres');
      const r4 = await reglage(o.page), d3 = await dessin(o.page);
      check('« Les chiffres du marché » décochés : data-chiffres="0", gardés (« 0 ») ; l\'écran du départ, les mêmes textes', r4.attrChiffres === '0' && r4.chiffres === false && r4.stockeCh === '0'
        && JSON.stringify(d3.items.map(i => i.texte)) === JSON.stringify(d1.items.map(i => i.texte)), r4);
      // Rouvert : les deux choix gardés.
      await cocher(o.page, 'detail'); await cocher(o.page, 'chiffres');
      const o2 = await ouvrir(nav, { vue: { width: 1440, height: 900 }, ctx: o.ctx, garder: true });
      const r5 = await reglage(o2.page);
      check('rouvert : « Le détail » et « Les chiffres du marché » gardés (cochés, data-mode « expert », data-chiffres « 1 »)', r5.detail && r5.chiffres && r5.mode === 'expert' && r5.attrChiffres === '1', r5);
      check('aucune erreur JavaScript', !o.erreurs.length && !o2.erreurs.length, o.erreurs.concat(o2.erreurs));
      await o.ctx.close();
    }
    // Qui était en Complet (samsara-mode « expert », rien d'autre de gardé) retrouve son écran : le
    // détail, les chiffres du marché et le Volume.
    titre('Ancien Complet : le même écran qu\'avant');
    {
      const o = await ouvrir(nav, { vue: { width: 1440, height: 900 }, mode: 'expert' });
      const r = await reglage(o.page), x = await dessin(o.page);
      const vis = await o.page.evaluate(() => ({ kpis: [...document.querySelectorAll('#cycle .kpi')].filter(k => k.getBoundingClientRect().width > 0).length,
        puces: [...document.querySelectorAll('#indicatorBar label[id^="lbl_"]')].filter(l => l.getClientRects().length).map(l => l.dataset.calque || l.id) }));
      check('samsara-mode « expert » : le détail et les chiffres du marché cochés, le Volume (puce et sous-graphe), les chiffres clés visibles',
        r.detail && r.chiffres && r.mode === 'expert' && r.attrChiffres === '1' && x.sous.join() === 'vol' && vis.puces.join() === 'vol' && vis.kpis >= 3, { r, sous: x.sous, vis });
      check('aucune erreur JavaScript', !o.erreurs.length, o.erreurs);
      await o.ctx.close();
    }

    // ── Les calques de marché sur l'écran calme ──
    // Volume, EMA 20 et 50, Ordres en attente (BTC/USDT) : éteints par défaut, cochés dans le panneau
    // comme tout calque, dessinés SANS texte de plus sur le tracé (budget de cinq, mots simples) tant
    // que « Le détail » est décoché, gardés sous samsara-affichage-v1 — un seul choix, avec ou sans le
    // détail. Les trois calques simples de l'ancien Lisible (samsara-lisible-v1) y sont versés une fois.
    titre('Écran calme : Volume, EMA 20 et 50, Ordres en attente');
    for (const [vue, tactile] of [[{ width: 1440, height: 900 }, false], [{ width: 390, height: 844 }, true]]) {
      const nom = vue.width + ' px · calques';
      const o = await ouvrir(nav, { vue, tactile, prev: 'ouvert', chaleur: true });
      const d0 = await dessin(o.page);
      check(`${nom} : éteints par défaut, rien de gardé ; l'écran calme inchangé (aucun sous-graphe)`,
        !d0.sous.length && await o.page.evaluate(() => localStorage.getItem('samsara-affichage-v1') === null && !activeSubs.vol && !overlays.ema20 && !overlays.ema50 && !overlays.liq), d0.sous);
      await o.page.click('#indDropdownBtn'); await o.page.waitForTimeout(200);
      for (const k of ['vol', 'ema20', 'ema50', 'liq']) { await o.page.click(`#indMenu label[data-ind="${k}"] input`); await o.page.waitForTimeout(150); }
      const coche = await o.page.evaluate(() => ({ cases: ['vol', 'ema20', 'ema50', 'liq'].map(k => document.querySelector(`#indMenu label[data-ind="${k}"] input`).checked),
        garde: localStorage.getItem('samsara-affichage-v1'), mode: document.documentElement.getAttribute('data-mode'), ouvert: document.getElementById('indMenu').classList.contains('open') }));
      const g = coche.garde ? JSON.parse(coche.garde) : {};
      check(`${nom} : les quatre cases cochées dans le panneau (resté ouvert), gardées sous samsara-affichage-v1 ; « Le détail » toujours décoché`,
        coche.cases.every(Boolean) && coche.ouvert && coche.mode === 'debutant' && JSON.stringify((g.ov || []).slice().sort()) === JSON.stringify(['ema20', 'ema50', 'liq']) && JSON.stringify(g.sg) === JSON.stringify(['vol']), coche);
      await o.page.evaluate(() => document.getElementById('indMenu').classList.remove('open'));
      await o.page.waitForFunction(() => histHeatmap && histHeatmap.grille, null, { timeout: 5000 }).catch(() => {});
      const e = await controlerEcran(o, nom, { calques: ['ema20', 'ema50', 'liq', 'vol'] });
      const lireTrace = () => o.page.evaluate(() => {
        const lignes = [], images = [], d = drawLine, di = CanvasRenderingContext2D.prototype.drawImage, ft = CanvasRenderingContext2D.prototype.fillText, textes = [];
        const ema = k => memoized(k, calcEMA, cols().close, periodeDe(k));
        drawLine = function (...a) { lignes.push({ ema20: a[0] === ema('ema20'), ema50: a[0] === ema('ema50'), couleur: a[6] }); return d.apply(this, a); };
        CanvasRenderingContext2D.prototype.drawImage = function (...a) { if (this.canvas.id === 'chart') images.push(!!heatLayer && a[0] === heatLayer.cv); return di.apply(this, a); };
        CanvasRenderingContext2D.prototype.fillText = function (t) { textes.push(String(t)); return ft.apply(this, arguments); };
        try { drawChart(); } finally { drawLine = d; CanvasRenderingContext2D.prototype.drawImage = di; CanvasRenderingContext2D.prototype.fillText = ft; }
        const dispo = canvas.height / devicePixelRatio - 4 - RS_HEIGHT;
        return { lignes: lignes.filter(l => l.ema20 || l.ema50), chaleur: images.filter(Boolean).length, part: geo.mainH / dispo, sous: geo.sous.map(s => s.cle), noms: textes.filter(t => /^EMA \d+$/.test(t)) };
      });
      const trace = await lireTrace();
      check(`${nom} : EMA 20 et EMA 50 dessinées, sans étiquette ni nom sur le tracé`,
        trace.lignes.length === 2 && trace.lignes.some(l => l.ema20) && trace.lignes.some(l => l.ema50) && !trace.noms.length, trace);
      check(`${nom} : les Ordres en attente dessinés (la couche de chaleur posée sur le tracé)`, trace.chaleur >= 1, trace);
      check(`${nom} : le Volume dessiné sous le prix, qui garde ${Math.round(trace.part * 100)} % (≥ 60 %)`, trace.sous.join() === 'vol' && trace.part >= 0.6 - 1e-9, trace);
      const tous = e.tous.filter(t => bannis(t).length || CONSEIL.test(t));
      check(`${nom} : aucun mot banni ni conseil dans tout ce que le graphique écrit (titre du Volume compris : « ${e.tous.find(t => /^Volume/.test(t)) || '—'} »)`,
        !tous.length && e.tous.some(t => /^Volume : (bitcoins|\w+) échangés$/.test(t)), tous);
      // Rouvert : les calques sont gardés ; avec « Le détail », les mêmes, nommés sur le tracé.
      const o2 = await ouvrir(nav, { vue, tactile, prev: 'ouvert', ctx: o.ctx, garder: true, chaleur: true });
      const avant = await o2.page.evaluate(() => ({ vol: activeSubs.vol, ema20: overlays.ema20, ema50: overlays.ema50, liq: overlays.liq, sous: geo.sous.map(s => s.cle) }));
      check(`${nom} : rouvert, les calques sont gardés et dessinés`, avant.vol && avant.ema20 && avant.ema50 && avant.liq && avant.sous.join() === 'vol', avant);
      const o2l = { page: o2.page }, lire2 = () => o2l.page.evaluate(() => {
        const ft = CanvasRenderingContext2D.prototype.fillText, textes = [];
        CanvasRenderingContext2D.prototype.fillText = function (t) { textes.push(String(t)); return ft.apply(this, arguments); };
        try { resizeCanvas(); drawChart(); } finally { CanvasRenderingContext2D.prototype.fillText = ft; }
        return { mode: modeCourant(), ema20: overlays.ema20, liq: overlays.liq, depth: !!depthTimer, sous: geo.sous.map(s => s.cle), noms: textes.filter(t => /^EMA \d+$/.test(t)).sort() };
      });
      await cocher(o2.page, 'detail');
      const complet = await lire2();
      await cocher(o2.page, 'detail');
      const retour = await lire2();
      // (Deux étiquettes trop proches : la seconde n'est pas posée — règle de toujours de drawLine.)
      check(`${nom} : avec « Le détail », les mêmes calques, cette fois nommés sur le tracé (« ${complet.noms.join(' », « ')} ») ; décoché, redessinés sans nom`,
        complet.mode === 'expert' && complet.ema20 && complet.liq && complet.depth && complet.sous.join() === 'vol' && complet.noms.length >= 1 && complet.noms.every(n => /^EMA (20|50)$/.test(n))
        && retour.mode === 'debutant' && retour.ema20 && retour.depth && retour.sous.join() === 'vol' && !retour.noms.length, { complet, retour });
      // Sur une autre paire, les ordres en attente ne dessinent rien : leur case est grisée et le dit.
      const sol = await o2.page.evaluate(async () => {
        changeSymbol('SOLUSDT', document.getElementById('sym_SOLUSDT'));
        await new Promise(r => setTimeout(r, 1200));
        buildDropdown();
        const l = document.querySelector('#indMenu label[data-ind="liq"]');
        const r = { indispo: l.classList.contains('indispo'), coupee: l.querySelector('input').disabled, dit: (l.querySelector('.ind-seul') || {}).textContent || '',
          vol: (document.querySelector('#indMenu label[data-ind="vol"] .aff-quoi') || {}).textContent };
        changeSymbol('BTCUSDT', document.getElementById('sym_BTCUSDT'));
        await new Promise(r => setTimeout(r, 1200));
        return r;
      });
      check(`${nom} : SOL/USDT, « Ordres en attente » grisé, non cochable, « BTC/USDT seulement » ; le Volume compte des SOL`,
        sol.indispo && sol.coupee && sol.dit === 'BTC/USDT seulement' && / SOL ont été échangés/.test(sol.vol || ''), sol);
      check(`${nom} : aucune erreur JavaScript`, !o.erreurs.length && !o2.erreurs.length, o.erreurs.concat(o2.erreurs));
      await o.ctx.close();
    }
    // ── « Mon écran » en Lisible : le RSI et le MACD sous le prix (plan du site, idée 9, 13/10/2026) ──
    // Jamais posé d'office (rien à la 1re visite, rien sur l'écran de départ) ; rappelé par le bouton
    // « Mon écran » du panneau. Sans « Le détail », les sous-graphiques ont un titre en mots simples
    // (« RSI (14) » et « MACD (12,26,9) » étaient les seuls mots bannis de l'écran) et le badge du
    // réticule son unité en mots (il disait « 79,6 bitcoins » pour le RSI, « 63,33 bitcoins » pour le
    // MACD). Le budget de textes du Lisible tient avec le tracé du prix raccourci, à 390 et à 360 px ;
    // les supports / résistances y sont tracés sans leurs badges ni leur légende (huit textes de plus,
    // et « 15m », « 4h » : des mots bannis).
    titre('Mon écran en Lisible : RSI et MACD sous le prix, en mots simples');
    for (const vue of [{ width: 390, height: 844 }, { width: 360, height: 740 }]) {
      const nom = vue.width + ' × ' + vue.height + ' · Mon écran';
      const o = await ouvrir(nav, { vue, tactile: true, prev: 'ouvert', chaleur: true });
      const d0 = await o.page.evaluate(() => ({ garde: localStorage.getItem('samsara-mon-ecran-v1'), rsi: activeSubs.rsi, macd: activeSubs.macd, sr: overlays.sr,
        sous: geo.sous.map(s => s.cle), texte: document.body.innerText, bouton: [...document.querySelectorAll('.aff-mon-ecran')].filter(b => b.getClientRects().length).length }));
      check(`${nom} : 1re visite, « Mon écran » n'est pas posé (ni RSI, ni MACD, ni supports / résistances) et l'écran de départ n'en dit rien`,
        d0.garde === null && !d0.rsi && !d0.macd && !d0.sr && !d0.sous.length && !/Mon écran/.test(d0.texte) && !d0.bouton, Object.assign({}, d0, { texte: undefined }));
      await o.page.click('#indDropdownBtn'); await o.page.waitForTimeout(200);
      await o.page.click('#indMenu .aff-mon-ecran'); await o.page.waitForTimeout(400);
      const pose = await o.page.evaluate(() => ({ ov: Object.keys(overlays).filter(k => overlays[k]).sort(), sg: Object.keys(activeSubs).filter(k => activeSubs[k]),
        mode: document.documentElement.getAttribute('data-mode'), presse: document.querySelector('#indMenu .aff-mon-ecran').getAttribute('aria-pressed') }));
      check(`${nom} : « Mon écran » (sans rien de gardé) pose le RSI et le MACD, les supports / résistances, le Guide et les scénarios ; « Le détail » reste décoché ; bouton enfoncé`,
        JSON.stringify(pose.ov) === JSON.stringify(['guide', 'scenarios', 'sr']) && JSON.stringify(pose.sg) === JSON.stringify(['rsi', 'macd']) && pose.mode === 'debutant' && pose.presse === 'true', pose);
      await o.page.evaluate(() => { document.getElementById('indMenu').classList.remove('open'); document.getElementById('indDropdownBtn').setAttribute('aria-expanded', 'false'); });
      await o.page.waitForTimeout(300);
      const e = await controlerEcran(o, nom, { calques: ['sr', 'rsi', 'macd'], sous: ['rsi', 'macd'] });
      // Les titres des deux sous-graphiques : en mots, entiers dans leur ligne (avant la colonne de l'axe).
      const t = await o.page.evaluate(() => {
        const c = document.createElement('canvas').getContext('2d'); c.font = chartFont(9.5, 700);
        if ('letterSpacing' in c) c.letterSpacing = '0.6px';
        return { titres: geo.sous.map(s => titreSous(s.cle)), larg: geo.sous.map(s => 16 + 17 + c.measureText(titreSous(s.cle)).width), xAxe: geo.W - 75,
          traces: geo.sous.map(s => s.trace), part: geo.mainH / (canvas.height / devicePixelRatio - 4 - RS_HEIGHT) };
      });
      const tous = e.tous.filter(x => bannis(x).length || CONSEIL.test(x) || /RSI|MACD/.test(x));
      check(`${nom} : les deux sous-graphiques tracés, titrés en mots (« ${t.titres.join(' », « ')} »), entiers avant l'axe ; rien de banni dans tout ce que le graphique écrit`,
        t.traces.every(Boolean) && t.titres.every(x => e.tous.includes(x) && !bannis(x).length) && t.larg.every(x => x <= t.xAxe) && !tous.length, { t, tous });
      check(`${nom} : le prix garde ${Math.round(t.part * 100)} % de la hauteur (≥ 60 %, MAIN_PART_MIN)`, t.part >= 0.6 - 1e-9, t);
      // Les supports / résistances en Lisible : leurs traits seuls (ni badge, ni légende « S/R par
      // intervalle », ni intervalle abrégé), comme les moyennes. Mais chaque trait reste touchable :
      // une cible sans étiquette, dont la bulle le nomme en mots entiers (revue du 14/10/2026, C6 :
      // les toucher n'ouvrait que la boîte des bougies).
      const sr = await o.page.evaluate(() => {
        const g = geoPrix, vus = getMultiTFLevels().slice(0, 6).filter(l => l.price > g.minP && l.price < g.maxP), c = ciblesPrix.filter(x => /^Support \/ résistance · /.test(x.titre || ''));
        return { niveaux: getMultiTFLevels().length, badges: srBadges.length, vus: vus.map(l => l.price), cibles: c.map(x => ({ prix: x.prix, rects: x.rects.length, segs: x.segs.length, titre: x.titre })),
          bannis: Guide.motsBannis(c.map(x => x.titre + ' ' + x.texte.join(' ')).join(' ')) };
      });
      check(`${nom} : les supports / résistances tracés (${sr.niveaux} niveaux), sans badge ni légende`,
        sr.niveaux > 0 && !sr.badges && !e.tous.some(x => /S\/R|^\d+[mhd]$| · \d+[mhd]$/.test(x)), { sr, tous: e.tous });
      check(`${nom} : chacun de leurs ${sr.vus.length} traits dans la vue est touchable, sans étiquette (« ${sr.cibles.length ? sr.cibles[0].titre : '—'} »), sans mot banni`,
        sr.vus.every(p => sr.cibles.some(x => x.prix === p)) && sr.cibles.every(x => !x.rects && x.segs === 1 && / · repéré sur les \p{L}/u.test(x.titre)) && !sr.bannis.length, sr);
      // Le réticule dans les sous-graphiques : chaque valeur avec SON unité, jamais « bitcoins ».
      const b = await o.page.evaluate(() => {
        const s = geo.sous[0];
        crossX = Math.round(geo.W / 2); crossY = s.y + 20;
        window.__ft = []; window.__ftOn = true;
        try { calqueDessin(); } finally { window.__ftOn = false; }
        const out = geo.sous.map(x => ({ cle: x.cle, t: window.__ft.filter(f => f.c === 'chartCalque' && f.y > x.y && f.y < x.y + 22 && f.x > geo.W - 200).map(f => f.t) }));
        crossX = crossY = null; calqueDessin();
        return out;
      });
      const lu = k => (b.find(x => x.cle === k) || { t: [] }).t;
      check(`${nom} : le réticule dit « ${lu('rsi').join(' ')} » (RSI) et « ${lu('macd').join(' ')} » (MACD) : chacun son unité en mots, jamais « bitcoins »`,
        lu('rsi').length === 1 && /^\d{1,3},\d sur 100$/.test(lu('rsi')[0]) && lu('macd').length === 1 && /^[−-]?\d[\d  ]*(,\d+)? \$ d’écart$/.test(lu('macd')[0])
        && !b.some(x => x.t.some(y => /bitcoins|RSI|MACD/.test(y))), b);
      check(`${nom} : aucune erreur JavaScript`, !o.erreurs.length, o.erreurs);
      await o.ctx.close();
    }

    // ── La fourchette de 7 jours (plan du 13/10/2026, idée 5) ──
    // Une couche du panneau, éteinte par défaut, gardée comme les autres : deux traits fins en tirets
    // à l'encre neutre (encre 3, jamais l'accent) et UNE étiquette, inscrite au budget des cinq textes
    // (rôle « fourchette » : elle prend la place de la ligne des scénarios, puis du libellé de la
    // forme) ; sa bulle, résumée comme les autres. En 1 jour, la ligne du panneau est grisée et le
    // dit, rien n'est tracé ; le choix reste gardé.
    titre('Écran calme : la fourchette de 7 jours');
    for (const [vue, tactile] of [[{ width: 390, height: 844 }, true], [{ width: 1440, height: 900 }, false]]) {
      const nom = vue.width + ' px · fourchette';
      const o = await ouvrir(nav, { vue, tactile, prev: 'ouvert' });
      const d0 = await o.page.evaluate(() => ({ on: overlays.fourchette, etat: fourchetteEtat }));
      check(`${nom} : éteinte par défaut, rien de tracé`, d0.on === false && d0.etat === null, d0);
      await cocher(o.page, 'fourchette');
      const e = await controlerEcran(o, nom, { puces: 1 });
      const f = await o.page.evaluate(() => {
        const st = CanvasRenderingContext2D.prototype.stroke, traits = [];
        CanvasRenderingContext2D.prototype.stroke = function () { if (this.canvas.id === 'chart' && this.getLineDash().join() === '6,4') traits.push(this.strokeStyle); return st.apply(this, arguments); };
        try { crossX = crossY = null; drawChart(); } finally { CanvasRenderingContext2D.prototype.stroke = st; }
        const t = document.createElement('canvas').getContext('2d'); t.strokeStyle = COLORS.ink3;
        const V = fourchetteEtat;
        return V && { jours: V.F.jours, visH: V.visH, visB: V.visB, etiq: V.etiq, traits, ink3: t.strokeStyle, garde: JSON.parse(localStorage.getItem('samsara-affichage-v1') || '{}') };
      });
      const it = e.items.filter(i => i.role === 'fourchette');
      check(`${nom} : cochée, ses traits en tirets à l'encre 3 et UNE étiquette « ${it[0] ? it[0].texte : '—'} » au budget (${e.items.map(i => i.role).join(', ')}) ; gardée sous samsara-affichage-v1`,
        !!f && f.jours === 7 && f.traits.length === [f.visH, f.visB].filter(Boolean).length && f.traits.every(c => c === f.ink3) && it.length === 1
        && etiqFourchette(it[0].texte, f.visH, f.visB) && (f.garde.ov || []).includes('fourchette'), { f, items: e.items });
      // Sa bulle (toucher ou survol de l'étiquette) : le titre, le bas, le haut et l'écart ; résumée
      // comme les autres (4 lignes et 3 nombres au plus), sans jargon ni conseil.
      if (it[0] && it[0].rect) {
        const b0 = await o.page.evaluate(() => { const r = canvas.getBoundingClientRect(); return { x: r.left, y: r.top }; });
        const px = b0.x + it[0].rect.x + Math.min(it[0].rect.w / 2, 40), py = b0.y + it[0].rect.y + it[0].rect.h / 2;
        if (tactile) await o.page.touchscreen.tap(px, py); else { await o.page.mouse.move(2, 2); await o.page.mouse.move(px - 10, py - 3); await o.page.mouse.move(px, py, { steps: 3 }); }
        await o.page.waitForTimeout(150);
        const b = await o.page.evaluate(() => { const B = fourchetteEtat && fourchetteEtat.bulle; return B && { titre: B.titre, resume: B.resume, lignes: B.lignes, nombres: B.nombres, corps: B.corps.join(' '), dans: B.y >= 0 && B.y + B.h <= geo.mainH }; });
        check(`${nom} : sa bulle « ${b && b.titre} » dit le bas, le haut et l'écart (${b && b.lignes} lignes, ${b && b.nombres} nombres), dans le tracé, sans jargon ni conseil`,
          !!b && b.titre === 'Fourchette de 7 jours' && /^Bas [\d\s]+ \$, haut [\d\s]+ \$ : un écart de [\d\s]+ \$\./.test(b.corps) && b.dans
          && (b.resume ? b.lignes <= 4 && b.nombres <= 3 : b.lignes <= 6) && !bannisBulle(b.corps + ' ' + b.titre).length && !CONSEIL.test(b.corps), b);
        await quitter(o, tactile, b0.x + 20, b0.y + e.mainH - 30);
      }
      // En 1 jour : grisée, non cochable, dite ; rien de tracé, le choix gardé ; de retour en 15 min, tracée.
      const jour = await o.page.evaluate(async () => {
        await changeInterval('1d', document.getElementById('int_1d'));
        await new Promise(r => setTimeout(r, 1200));
        buildDropdown();
        const l = document.querySelector('#indMenu label[data-ind="fourchette"]');
        crossX = crossY = null; drawChart();
        const r = { indispo: l.classList.contains('indispo'), coupee: l.querySelector('input').disabled, dit: (l.querySelector('.ind-seul') || {}).textContent || '',
          etat: fourchetteEtat, garde: overlays.fourchette, roles: debEtat ? debEtat.items.map(i => i.role) : [] };
        await changeInterval('15m', document.getElementById('int_15m'));
        await new Promise(r => setTimeout(r, 1200));
        crossX = crossY = null; drawChart();
        r.retour = !!fourchetteEtat;
        return r;
      });
      check(`${nom} : en 1 jour, « Fourchette de 7 jours » grisée, non cochable, « ${jour.dit} », rien de tracé (le choix gardé) ; revenue en 15 min, tracée de nouveau`,
        jour.indispo && jour.coupee && jour.dit === 'pas en 1 jour' && jour.etat === null && jour.garde === true && !jour.roles.includes('fourchette') && jour.retour, jour);
      check(`${nom} : aucune erreur JavaScript`, !o.erreurs.length, o.erreurs);
      await o.ctx.close();
    }
    // Les trois calques simples de l'ancien Lisible : versés une fois dans les choix du panneau.
    titre('Ancien Lisible : ses trois calques simples versés dans le panneau');
    {
      const o = await ouvrir(nav, { vue: { width: 1440, height: 900 }, chaleur: true, avant: { 'samsara-lisible-v1': JSON.stringify({ vol: true, moyennes: true, liq: true }) } });
      const r = await o.page.evaluate(() => ({ ancien: localStorage.getItem('samsara-lisible-v1'), garde: JSON.parse(localStorage.getItem('samsara-affichage-v1') || 'null'),
        vol: activeSubs.vol, ema20: overlays.ema20, ema50: overlays.ema50, liq: overlays.liq, mode: document.documentElement.getAttribute('data-mode'),
        cases: ['vol', 'ema20', 'ema50', 'liq'].map(k => { buildDropdown(); const i = document.querySelector(`#indMenu label[data-ind="${k}"] input`); return !!i && i.checked; }) }));
      check('samsara-lisible-v1 (Volume, Moyennes, Ordres en attente) : Volume, EMA 20, EMA 50 et la carte des ordres cochés, gardés sous samsara-affichage-v1, l\'ancienne clé effacée ; l\'écran reste calme',
        r.ancien === null && r.garde && JSON.stringify(r.garde.ov.slice().sort()) === JSON.stringify(['ema20', 'ema50', 'liq']) && JSON.stringify(r.garde.sg) === JSON.stringify(['vol'])
        && r.vol && r.ema20 && r.ema50 && r.liq && r.mode === 'debutant' && r.cases.every(Boolean), r);
      check('aucune erreur JavaScript', !o.erreurs.length, o.erreurs);
      await o.ctx.close();
    }

    // ── Le mode changé sur la carte (autre onglet, même navigateur) suit dans le terminal ──
    // La carte garde son interrupteur « Lisible | Complet » ; il règle le même « Le détail » que le
    // terminal (samsara-mode). Sans réécrire le stockage (la carte vient de l'écrire) ; et dans
    // l'autre sens, la carte suit.
    titre('Le détail suit la carte (autre onglet)');
    {
      const o = await ouvrir(nav, { vue: { width: 1440, height: 900 } });
      await o.page.evaluate(() => { window.__ecrits = []; const f = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { window.__ecrits.push(k + '=' + v); return f.apply(this, arguments); }; });
      const pc = await o.ctx.newPage(), errCarte = [];
      pc.on('pageerror', e => errCarte.push(e.message));
      await pc.route('**/*', r => (new URL(r.request().url()).host.startsWith('127.0.0.1') ? r.continue() : r.abort()));
      await pc.goto(`http://127.0.0.1:${serveur.address().port}/bookmap.html`);
      await pc.waitForTimeout(800);
      const carte = () => pc.evaluate(() => ({ mode: document.documentElement.getAttribute('data-mode'), detail: document.getElementById('affDetail').checked, bascule: !!document.getElementById('btnModeBarre') }));
      const terminal = () => o.page.evaluate(() => ({ mode: document.documentElement.getAttribute('data-mode'), deb: debutant(), items: debEtat ? debEtat.items.length : null,
        detail: (() => { buildDropdown(); return document.querySelector('#indMenu label[data-ind="detail"] input').checked; })(), ecrits: window.__ecrits.filter(e => /^samsara-mode=/.test(e)) }));
      const c0 = await carte();
      check('la carte, ouverte à côté, est sans le détail comme le terminal (même réglage) ; plus d\'interrupteur, sa case « Le détail » décochée', c0.mode === 'debutant' && c0.detail === false && !c0.bascule, c0);
      await pc.evaluate(() => document.getElementById('affDetail').click());
      await o.page.waitForFunction(() => document.documentElement.getAttribute('data-mode') === 'expert', null, { timeout: 5000 }).catch(() => {});
      await o.page.waitForTimeout(300);
      const t1 = await terminal();
      check('« Le détail » coché sur la carte : le terminal passe au détail (data-mode, debutant(), graphique redessiné, « Le détail » coché) sans réécrire le stockage',
        t1.mode === 'expert' && !t1.deb && t1.items === null && t1.detail === true && !t1.ecrits.length, t1);
      await pc.evaluate(() => document.getElementById('affDetail').click());
      await o.page.waitForFunction(() => document.documentElement.getAttribute('data-mode') === 'debutant', null, { timeout: 5000 }).catch(() => {});
      await o.page.waitForTimeout(300);
      const t2 = await terminal();
      check('« Le détail » décoché sur la carte : le terminal revient à l\'écran calme (data-mode, debutant(), l\'écran calme redessiné, « Le détail » décoché), sans écrire', t2.mode === 'debutant' && t2.deb && t2.items > 0 && t2.detail === false && !t2.ecrits.length, t2);
      // Dans l'autre sens : le terminal change, la carte suit.
      await cocher(o.page, 'detail');
      await pc.waitForFunction(() => document.documentElement.getAttribute('data-mode') === 'expert', null, { timeout: 5000 }).catch(() => {});
      const c1 = await carte();
      check('« Le détail » coché sur le terminal : la carte suit (sa case cochée)', c1.mode === 'expert' && c1.detail === true, c1);
      check('aucune erreur JavaScript (terminal et carte)', !o.erreurs.length && !errCarte.length, { t: o.erreurs, c: errCarte });
      await o.ctx.close();
    }

    // ── Sans data-mode / data-chiffres (ou une valeur inconnue) : la feuille montre l'écran calme ──
    // La feuille ne lit que data-mode="expert" (« Le détail ») et data-chiffres="1" (« Les chiffres
    // du marché ») : toute autre valeur est l'écran calme, jamais les deux variantes à la fois. L'état
    // de chaque élément (display, visibility) et la mise en page de l'en-tête sont relevés dans la
    // même tâche, l'attribut changé seulement le temps de la lecture (le script ne le voit pas).
    titre('Feuille : l\'écran calme par défaut (data-mode, data-chiffres absents ou inconnus)');
    {
      const o = await ouvrir(nav, { vue: { width: 1440, height: 900 } });
      // Le détail ne touche plus guère la page hors du graphique (le panneau, une ligne de la bulle) ;
      // les chiffres du marché, l'en-tête et les cartes : au moins 1 et 5 différences.
      for (const [attr, calme, temoin, seul, sans, min] of [['data-mode', 'debutant', 'expert', '.expert-seul', '.debutant-seul', 1], ['data-chiffres', '0', '1', '.chiffres-seul', '.sans-chiffres', 5]]) {
        const r = await o.page.evaluate(([attr, calme, temoin, seul, sans]) => {
          const h = document.documentElement, tous = [...document.body.querySelectorAll('*')];
          const releve = () => {
            const etat = tous.map(e => { const cs = getComputedStyle(e); return cs.display + ' ' + cs.visibility; });
            const tete = [...document.querySelectorAll('.header *')].filter(e => e.getClientRects().length).map(e => { const q = e.getBoundingClientRect(); return [q.left, q.top, q.width, q.height].map(Math.round).join(','); });
            const vis = sel => [...document.querySelectorAll(sel)].filter(e => e.getClientRects().length > 0).length;
            return { etat, tete, seul: vis(seul), sans: vis(sans) };
          };
          const avec = v => { if (v === null) h.removeAttribute(attr); else h.setAttribute(attr, v); return releve(); };
          const ref = avec(calme), exp = avec(temoin);
          const diff = (a, b) => a.etat.reduce((n, x, i) => n + (x !== b.etat[i]), 0) + (a.tete.join('|') !== b.tete.join('|'));
          const out = { ref: { seul: ref.seul, sans: ref.sans }, diffTemoin: diff(ref, exp), variantes: {} };
          for (const [nom, v] of [['absent', null], ['lisible', 'lisible'], ['inconnu', 'xyz'], ['vide', '']]) {
            const x = avec(v);
            out.variantes[nom] = { diff: diff(ref, x), seul: x.seul, sans: x.sans, tete: x.tete.join('|') === ref.tete.join('|') };
          }
          h.setAttribute(attr, calme);
          return out;
        }, [attr, calme, temoin, seul, sans]);
        check(`témoin : ${attr}="${temoin}" change bien l'écran (${r.diffTemoin} différences) ; sans lui, aucun ${seul} visible, des ${sans} visibles`, r.diffTemoin >= min && r.ref.seul === 0 && r.ref.sans > 0, r);
        for (const [nom, v] of Object.entries(r.variantes))
          check(`${attr} ${nom} : exactement l'écran calme (tous les éléments, l'en-tête), jamais les variantes ${seul}`, v.diff === 0 && v.seul === 0 && v.sans === r.ref.sans && v.tete, v);
      }
      check('aucune erreur JavaScript', !o.erreurs.length, o.erreurs);
      await o.ctx.close();
    }

    // ── Les touches, dites dans les Légendes (une ligne) ; M ne fait plus rien ici ──
    titre('Touches : ?, R, F, I (plus de M)');
    {
      const o = await ouvrir(nav, { vue: { width: 1440, height: 900 } });
      await o.page.keyboard.press('?'); await o.page.waitForTimeout(200);
      const l = await o.page.evaluate(() => { const p = document.getElementById('fichePop'), t = p && p.querySelector('.fiche-touches'); return { ouvert: !!p && !p.hidden, titre: p && (p.querySelector('.fiche-titre') || {}).textContent, ligne: t && t.getClientRects().length ? t.innerText : null, h: t ? t.getBoundingClientRect().height : 0 }; });
      check(`? ouvre les Légendes, avec la ligne des touches, sans M (« ${l.ligne} »)`, l.ouvert && l.titre === 'Légendes' && !/\bM\b/.test(l.ligne || '') && !/Lisible|Complet/.test(l.ligne || '') && /\? cette aide/.test(l.ligne || '') && /\bR ou F revient au présent/.test(l.ligne || '') && !/vue de départ/.test(l.ligne || '') && /\bI les infos du marché/.test(l.ligne || '') && !bannis(l.ligne || '').length, l);
      await o.page.keyboard.press('Escape');
      // M : plus de bascule ; ni mode, ni chiffres, ni écriture.
      await o.page.evaluate(() => { window.__ecrits = []; const f = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { window.__ecrits.push(k + '=' + v); return f.apply(this, arguments); }; });
      await o.page.keyboard.press('m'); await o.page.waitForTimeout(300);
      const m = await o.page.evaluate(() => ({ mode: document.documentElement.getAttribute('data-mode'), ch: document.documentElement.getAttribute('data-chiffres'), deb: debutant(), ecrits: window.__ecrits.slice() }));
      check('M : rien ne change (data-mode « debutant », data-chiffres « 0 », rien d\'écrit)', m.mode === 'debutant' && m.ch === '0' && m.deb && !m.ecrits.some(e => /^samsara-(mode|chiffres)/.test(e)), m);
      // R et F : la vue revient au présent (la dernière bougie à droite), comme sur la carte.
      for (const k of ['r', 'f']) {
        await o.page.evaluate(() => { const n = viewEnd - viewStart; viewEnd = Math.max(n, candles.length - 60); viewStart = viewEnd - n; drawChart(); });
        const avant = await o.page.evaluate(() => viewEnd === candles.length);
        await o.page.keyboard.press(k); await o.page.waitForTimeout(150);
        const apres = await o.page.evaluate(() => viewEnd === candles.length);
        check(`${k.toUpperCase()} (écran calme) : la vue revient au présent (la dernière bougie)`, !avant && apres, { avant, apres });
      }
      check('aucune erreur JavaScript', !o.erreurs.length, o.erreurs);
      await o.ctx.close();
      // Revue du 14/10/2026 (M17) : au téléphone (sans souris), pas de ligne de touches dans les
      // Légendes ; le bouton ↺ n'a qu'un nom, « Revenir au présent ».
      const t = await ouvrir(nav, { vue: { width: 390, height: 844 }, tactile: true });
      await t.page.evaluate(() => ouvrirGlossaire()); await t.page.waitForTimeout(200);
      const lt = await t.page.evaluate(() => { const p = document.getElementById('fichePop'), x = p && p.querySelector('.fiche-touches'), b = document.getElementById('resetBtn');
        return { ouvert: !!p && !p.hidden, existe: !!x, vue: !!x && x.getClientRects().length > 0, reset: b && b.getAttribute('aria-label') }; });
      check('390 px, au doigt : les Légendes s’ouvrent sans la ligne des touches ; le bouton ↺ s’appelle « Revenir au présent »', lt.ouvert && lt.existe && !lt.vue && lt.reset === 'Revenir au présent', lt);
      await t.ctx.close();
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
      // Les noms des fiches du Guide sont ceux du panneau « Choisir l'affichage » (« Repères et phrase de
      // lecture ») ; la fiche des niveaux, « Les repères de prix » (elle ne parle que des repères).
      check('Légendes, Débutant : « Ce que montre l’écran » d’abord (phrase et repères, scénarios du matin, les cartes) ; les fiches de l’Expert repliées',
        g.ouvert && g.replie && /^Ce que montre l’écran$/i.test(g.h4[0]) && g.h4.length === 1 && g.boutons.includes('Scénarios du matin') && g.boutons.includes('Repères et phrase de lecture') && g.boutons.includes('Les repères de prix') && g.boutons.includes('Ordres en attente'), g);
      check('Légendes, Débutant : aucun mot banni dans ce qui est affiché', !bannis(g.texte).length && !CONSEIL.test(g.texte), bannis(g.texte));
      // Les fiches du Guide ouvertes en Débutant : leur explication est celle de l'écran Débutant.
      const fiches = [];
      for (const id of ['guide', 'guide_regime', 'guide_suite', 'guide_niveaux', 'scenarios']) {
        fiches.push(await o.page.evaluate(id => {
          ouvrirFiche(id);
          const p = document.getElementById('fichePop'), vis = el => el.getClientRects().length > 0;
          const simple = [...p.querySelectorAll('.fiche-simple')].filter(vis).map(x => x.innerText).join(' '), t = [...p.querySelectorAll('.fiche-titre, .fiche-nature')].map(x => x.innerText).join(' ');
          // « En savoir plus », replié en Débutant : son explication entière, lue une fois ouvert.
          const d = p.querySelector('details.fiche-plus'), replie = !!d && !d.open;
          if (d) d.open = true;
          const plus = d ? [...d.querySelectorAll('.fiche-simple')].filter(vis).map(x => x.innerText).join(' ') : '';
          const gras = !!p.querySelector('.fiche-quoi b') && vis(p.querySelector('.fiche-quoi'));
          return { id, simple, plus, titre: t, replie, gras };
        }, id));
      }
      // Une seule fiche : ses lignes courtes décrivent l'écran calme ; « En savoir plus » (replié) dit
      // aussi ce que « Le détail » ajoute (le badge, les chemins).
      const mal = fiches.filter(f => bannis(f.simple + ' ' + f.titre).length || /badge en haut|à droite de la dernière bougie|Bollinger|Indicateurs »/.test(f.simple) || !f.replie || !f.gras);
      check('fiches du Guide sur l\'écran calme : titre, pastille et lignes courtes en gras, sans badge ni chemins dessinés ni jargon ; le reste replié sous « En savoir plus »', !mal.length && fiches.find(f => f.id === 'guide_regime').plus.includes('pas de badge'), mal.length ? mal : fiches.map(f => f.titre));
      // Fins de ligne (revue du 14/10/2026, C8) : on lisait « sous 30, « » puis « survendu » », « incluse »
      // puis « : », « accélère-t-il » puis « ? » seul, « il y a 24 » puis « h ». Toutes les fiches, « En
      // savoir plus » ouvert, puis le panneau « Choisir l'affichage », en Aero et en Bureau 95 (le thème
      // par défaut, aux lettres plus larges).
      const coupees = [];
      for (const th of ['aero', 'bureau95']) {
        await o.page.evaluate(t => { fermerFiche(); appliquerTheme(t); }, th); await o.page.waitForTimeout(250);
        for (const id of await o.page.evaluate(() => Object.keys(FICHES))) {
          await o.page.evaluate(id => { ouvrirFiche(id); for (const d of document.querySelectorAll('#fichePop details')) d.open = true; }, id);
          for (const c of await coupuresLignes(o.page, '#fichePop')) coupees.push(th + ' · ' + id + ' : ' + c);
        }
        await o.page.evaluate(() => { fermerFiche(); document.getElementById('indDropdownBtn').click(); }); await o.page.waitForTimeout(300);
        for (const c of await coupuresLignes(o.page, '#indMenu')) coupees.push(th + ' · panneau : ' + c);
        await o.page.evaluate(() => document.getElementById('indDropdownBtn').click()); await o.page.waitForTimeout(200);
      }
      await o.page.evaluate(() => appliquerTheme('aero'));
      check('fins de ligne : dans toutes les fiches et le panneau « Choisir l’affichage », en Aero et Bureau 95, aucune ligne ne commence par « : ; ? ! » $ % » ni ne finit par « « », aucun nombre n’est coupé de ses milliers ou de son unité',
        !coupees.length, coupees.slice(0, 6));
      // Avec « Le détail », les mêmes Légendes (une seule version) ; « Toutes les fiches » ouvert, les
      // sept groupes de toujours.
      await o.page.evaluate(() => fermerFiche());
      await cocher(o.page, 'detail');
      await o.page.evaluate(() => { ouvrirGlossaire(); const d = document.querySelector('#fichePop details.glossaire-plus'); if (d) d.open = true; });
      await o.page.waitForTimeout(200);
      const x = await o.page.evaluate(() => { const p = document.getElementById('fichePop'), vis = el => el.getClientRects().length > 0; return [...p.querySelectorAll('h4')].filter(vis).map(h => h.innerText.trim()).filter(Boolean); });
      check('Légendes avec « Le détail » : « Ce que montre l’écran » d’abord, puis les sept groupes de « Toutes les fiches »', x.length === 8 && /^Ce que montre l’écran$/i.test(x[0]) && /^Positionnement et dérivés$/i.test(x[1]), x);
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
      // (Changé exprès, revue du 14/10/2026, M3 : « Plus bas et plus haut des 24 h », sans « fourchette ».)
      check(`SOL · ${vue.width} : « Ces infos parlent du bitcoin (en dollars), pas de SOL/USDT. », titres « Bitcoin : … », « le prix publié du bitcoin est … », sans « fourchette »`,
        /Ces infos parlent du bitcoin \(en dollars\), pas de SOL\/USDT\./.test(t) && /Bitcoin : plus bas et plus haut des 24 h/i.test(t) && /le prix publié du bitcoin est (dans le haut|dans le bas|au milieu)\./.test(t) && !/le prix (publié )?est (dans le haut|dans le bas|au milieu)/.test(t) && !/fourchette/i.test(t), t.slice(0, 500));
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
        sc && sc.rect && bord && !entre && !entreH && /^Scénario 1/.test(sc.texte), { sc, top: e.top, ph: e.ph, yLive: e.yLive, bas, haut });   // en entier (revue du 14/10/2026, M10)
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
      // « Scénario » en entier : le budget de 35 caractères garde le verbe (revue du 14/10/2026, M10).
      check(`range2 : « ${sc && sc.texte} » dit son verbe (« reste »)`, sc && /^Scénario 1 : reste /.test(sc.texte), e.items);
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

    // ── Stockage bloqué : « Le détail », « Les chiffres du marché » et l'astuce suivent quand même ──
    titre('Stockage bloqué (navigation privée stricte)');
    {
      const ctx = await nav.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
      await ctx.clock.install({ time: maintenant() });
      await ctx.addInitScript(() => {
        const bloque = () => { throw new DOMException('bloqué', 'SecurityError'); };
        for (const k of ['getItem', 'setItem', 'removeItem', 'clear']) Storage.prototype[k] = bloque;
      });
      const o = await ouvrir(nav, { ctx });
      const etat = () => o.page.evaluate(() => ({ html: document.documentElement.getAttribute('data-mode'), deb: debutant(), items: debEtat ? debEtat.items.length : null, astuce: !document.getElementById('astucePhrase').hidden, cle: !document.getElementById('astuceTap').hidden }));
      const e0 = await etat();
      await cocher(o.page, 'detail');
      const e1 = await etat();
      await cocher(o.page, 'detail');
      const e2 = await etat();
      check('stockage bloqué : écran calme au départ ; « Le détail » coché → le détail partout (page ET graphique) ; décoché → l\'écran calme', e0.html === 'debutant' && e0.deb && e1.html === 'expert' && !e1.deb && e1.items === null && e2.html === 'debutant' && e2.deb && e2.items > 0, { e0, e1, e2 });
      await cocher(o.page, 'chiffres');
      const c1 = await o.page.evaluate(() => ({ ch: document.documentElement.getAttribute('data-chiffres'), kpis: [...document.querySelectorAll('#cycle .kpi')].filter(k => k.getBoundingClientRect().width > 0).length }));
      await cocher(o.page, 'chiffres');
      const c2 = await o.page.evaluate(() => document.documentElement.getAttribute('data-chiffres'));
      check('stockage bloqué : « Les chiffres du marché » s\'allument (data-chiffres « 1 », chiffres clés visibles) et s\'éteignent', c1.ch === '1' && c1.kpis >= 3 && c2 === '0', { c1, c2 });
      await o.page.clock.runFor(9000); await o.page.waitForTimeout(100);
      const a1 = await o.page.evaluate(() => { drawChart(); astuceMontrer(); const a = document.getElementById('astuceTap'), ph = document.getElementById('astucePhrase');
        return { phrase: !ph.hidden && ph.getClientRects().length > 0, cle: !a.hidden && document.getElementById('cleAide').getClientRects().length > 0 }; });
      check('stockage bloqué : l’astuce, cachée au bout de 8 s, ne revient pas au dessin suivant ; la clé « ? » reste', !a1.phrase && a1.cle, a1);
      check('stockage bloqué : la clé « ? » est là sur l\'écran calme, partie avec le détail, revenue au retour', e0.cle && !e1.cle && e2.cle, { e0, e1, e2 });
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
          return { texte: m && m.textContent, m: m && c(m), l: l && c(l), live: l && l.firstChild && l.firstChild.textContent.trim() };
        });
        // Un seul nom dans les deux modes : « Infos du marché » (publiées toutes les 15 min) ;
        // l'Expert disait « Marché live » pour des infos qui ne sont pas en direct. Le panneau ⚡,
        // lui, est « En direct (à la seconde) ».
        check(`${nom} : titre des cartes « ${t.texte} » (le même dans les deux modes), même taille et graisse que le titre du panneau ⚡ « ${t.live} » (${t.l})`, t.m && t.l && t.m[0] === t.l[0] && t.m[1] === t.l[1] && t.texte === 'Infos du marché' && t.live === 'En direct (à la seconde)', t);
        await o.ctx.close();
      }
    }

    // ── L'en-tête au téléphone, 11 thèmes : prix, variation, pastille sans chevauchement ──
    titre('En-tête au téléphone, 11 thèmes (390 et 360 px)');
    for (const theme of ['aero', 'aero-nuit', 'kala', 'neon', 'codex', 'bureau95', 'bureau95-contraste', 'gare', 'gazette', 'cyanotype', 'diazo']) for (const w of [390, 360]) {
      const o = await ouvrir(nav, { vue: { width: w, height: 800 }, theme, tactile: true });
      const r = await o.page.evaluate(() => {
        const vis = el => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden' && el.getBoundingClientRect().width > 0;
        const rs = ['#price', '#var24', '#cycle .kpi-deb'].map(q => [q, document.querySelector(q)]).filter(([, e]) => vis(e)).map(([q, e]) => ({ q, r: e.getBoundingClientRect().toJSON() }));
        const ch = [];
        for (let a = 0; a < rs.length; a++) for (let b = a + 1; b < rs.length; b++) { const A = rs[a].r, B = rs[b].r; if (A.left < B.right - 0.5 && A.right > B.left + 0.5 && A.top < B.bottom - 0.5 && A.bottom > B.top + 0.5) ch.push(rs[a].q + ' × ' + rs[b].q); }
        const hp = document.querySelector('.hero-prix'), v = document.getElementById('var24');
        const ph = debEtat && debEtat.items.find(i => i.role === 'phrase');
        return { ch, vus: rs.map(x => x.q), debord: hp ? hp.scrollWidth - hp.clientWidth : 0, var24: v.textContent, v24: v.getBoundingClientRect().toJSON(), vw: innerWidth, phrase: ph && ph.texte };
      });
      check(`${theme} · ${w} : la phrase entière, jamais coupée (« ${r.phrase} »)`, r.phrase && !/…$/.test(r.phrase) && /\.$/.test(r.phrase), r.phrase);
      check(`${theme} · ${w} : prix, variation 24 h (« ${r.var24} ») et pastille visibles, sans chevauchement ni débordement`,
        !r.ch.length && r.debord <= 1 && ['#price', '#var24', '#cycle .kpi-deb'].every(q => r.vus.includes(q)) && r.v24.right <= r.vw + 0.5, r);
      const b = await boutonAffichage(o.page);
      check(`${theme} · ${w} : plus d'interrupteur de mode ; « Choisir l'affichage » entier, dans l'écran, cliquable`, boutonJuste(b), b);
      await o.ctx.close();
    }

    // ── Les 11 thèmes : texte visible ; les structures gardent la pastille. Au téléphone : Aero,
    // Gazette et Bureau 95 (le thème d'une première visite depuis le 13/10/2026) et son jumeau. ──
    titre('Thèmes et structures en Débutant');
    const THEMES = ['aero', 'aero-nuit', 'kala', 'neon', 'codex', 'bureau95', 'bureau95-contraste', 'gare', 'gazette', 'cyanotype', 'diazo'];
    for (const [theme, vue, tactile] of THEMES.map(t => [t, { width: 1440, height: 900 }, false]).concat([['aero', { width: 390, height: 844 }, true], ['gazette', { width: 390, height: 844 }, true], ['bureau95', { width: 390, height: 844 }, true], ['bureau95-contraste', { width: 390, height: 844 }, true]])) {
      const nom = theme + ' · ' + vue.width;
      const o = await ouvrir(nav, { vue, theme, tactile });
      scanTexte(nom, await texteVisible(o.page));
      const s = await o.page.evaluate(() => {
        const vis = el => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
        const k = document.querySelector('#cycle .kpi-deb'), cy = document.getElementById('cycle'), hd = document.querySelector('.header');
        const parent = cy.parentElement, pr = parent.getBoundingClientRect();
        return { kpi: vis(k) ? k.getAttribute('title') : null, cadre: [Math.round(pr.width), Math.round(pr.height)], manchette: [...document.querySelectorAll('.gazette-manchette')].some(vis),
          tete: [hd.scrollWidth, hd.clientWidth], structure: document.documentElement.getAttribute('data-structure'),
          page: [document.documentElement.scrollWidth, document.documentElement.clientWidth], canvas: Math.round(canvas.getBoundingClientRect().height), vh: innerHeight };
      });
      check(`${nom} : pas de défilement de côté ; le graphique garde au moins la moitié de la hauteur (${s.canvas} px sur ${s.vh})`, s.page[0] <= s.page[1] + 1 && s.canvas >= s.vh * 0.5, s);
      const b = await boutonAffichage(o.page);
      check(`${nom} : pastille « Infos du marché » visible (âge en infobulle), son cadre non vide, manchette masquée, plus d'interrupteur de mode, « Choisir l'affichage » entier et cliquable, en-tête sans débordement`,
        /il y a \d+ min/.test(s.kpi || '') && s.cadre[0] > 0 && s.cadre[1] > 0 && !s.manchette && boutonJuste(b) && s.tete[0] <= s.tete[1] + 1, { s, b });
      check(`${nom} : aucune erreur JavaScript`, !o.erreurs.length, o.erreurs);
      await o.ctx.close();
    }
  } finally { await nav.close(); serveur.close(); }
  console.log(ko ? `\n❌ DÉBUTANT À L'ÉCRAN : ${ko} contrôle(s) en échec` : '\n✅ DÉBUTANT À L\'ÉCRAN : TOUS LES CONTRÔLES PASSENT');
  process.exit(ko ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
