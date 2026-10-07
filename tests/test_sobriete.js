// La SOBRIÉTÉ de la page, vérifiée dans un vrai navigateur (Chromium, Playwright) : ce qu'elle
// redessine au repos et au survol, ce qu'elle charge et quand. Binance simulé (déterministe),
// fichiers publiés : ceux du dépôt.
//
// POURQUOI (07/10/2026, audit de performance du terminal) : au repos, 70 % du CPU partait dans
// une animation de couleur du prix ; l'onde du voyant repartait chaque minute ; chaque
// mouvement de souris redessinait tout le graphique ; l'horloge peignait sa propre image ;
// hyalite se chargeait sur des postes sans GPU pour y être coupé aussitôt. Chaque contrôle
// ci-dessous échoue si l'ancien comportement revient.
//
//   1. PRIX : un changement = une classe posée puis retirée (aucune animation en cours) ;
//      l'horloge s'écrit dans la MÊME tâche que le prix, et s'arrête quand l'onglet est caché ;
//   2. VOYANT : une onde par publication NOUVELLE, pas par relecture ;
//   3. CALQUE : au survol, le graphique n'est pas redessiné (le réticule est sur le calque) ;
//      le calque épouse le graphique et laisse passer le pointeur ; l'étiquette du dernier prix
//      suit le prix sans redessiner le graphique ; au repos, sans donnée nouvelle, aucun dessin ;
//   4. VERRE : sur Aero, l'anneau suspend son flou pendant le survol ; en rendu logiciel
//      (Chromium sans GPU : SwiftShader), hyalite n'est pas chargé, et le poste s'en souvient ;
//      ?glass=force le charge quand même ;
//   5. CHARGEMENT : les lectures du premier écran partent du script de tête et ne sont pas
//      redemandées ; les pages anciennes de l'historique partent APRÈS le premier dessin ;
//   6. CHALEUR : relire la même publication ne refait ni la couche ni le dessin.
//
// Sans Playwright : « non exécuté », dit à l'écran (ce n'est pas un succès).
// USAGE   node tests/test_sobriete.js
const fs = require('fs'), path = require('path'), http = require('http');
const REPO = path.resolve(__dirname, '..');

let playwright = null;
for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright', process.env.PLAYWRIGHT_MODULE].filter(Boolean)) {
  try { playwright = require(p); break; } catch (e) { /* suivant */ }
}
if (!playwright) {
  console.log('  − NON EXÉCUTÉ : Playwright introuvable — la sobriété de la page n\'est pas vérifiée sur ce poste.');
  process.exit(0);
}
let ko = 0;
const check = (nom, ok, det) => { if (!ok) ko++; console.log(`  ${ok ? '✓' : '✗'} ${nom}${!ok && det !== undefined ? ' — ' + JSON.stringify(det).slice(0, 400) : ''}`); };
const titre = t => console.log(`\n── ${t} ──`);
const attendre = ms => new Promise(r => setTimeout(r, ms));

// Binance simulé : bougies déterministes ; le prix vaut `etat.prix` (le harnais le fait bouger).
// market-data.json : celui du dépôt, publié il y a 2 min (`etat.maj`, que le harnais avance).
const etat = { prix: 86012.5, maj: new Date(Date.now() - 120000).toISOString() };
const MARCHE = JSON.parse(fs.readFileSync(path.join(REPO, 'market-data.json'), 'utf8'));
const T0 = Math.floor(Date.now() / 9e5) * 9e5;
function binance(url) {
  const u = new URL(url), q = u.searchParams;
  if (u.pathname.endsWith('/klines')) {
    const pas = { '1m': 6e4, '5m': 3e5, '15m': 9e5, '1h': 36e5, '4h': 144e5, '1d': 864e5, '1w': 6048e5 }[q.get('interval')] || 9e5;
    const n = Math.min(1000, +q.get('limit') || 500), fin = q.get('endTime') ? Math.min(+q.get('endTime'), T0) : T0;
    return Array.from({ length: n }, (_, i) => { const t = Math.floor((fin - (n - 1 - i) * pas) / pas) * pas, k = t / pas, c = 86000 + Math.sin(k / 7) * 300, o = c + (k % 2 ? 40 : -40);
      return [t, String(o), String(Math.max(o, c) + 60), String(Math.min(o, c) - 60), String(c), '80', t + pas - 1, String(80 * c), 50, '40', String(40 * c), '0']; });
  }
  if (u.pathname.endsWith('/ticker/24hr')) return { symbol: q.get('symbol'), openPrice: '85700.00', lastPrice: etat.prix.toFixed(2), highPrice: '87000', lowPrice: '85000', volume: '1000', quoteVolume: '1e9', count: 100 };
  return {};
}
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2' };
const serveur = http.createServer((req, res) => {
  const f = path.join(REPO, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(REPO) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

async function ouvrir(nav, theme, o = {}) {
  const ctx = await nav.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const erreurs = [], requetes = [];
  page.on('pageerror', e => erreurs.push(e.message));
  page.on('request', r => requetes.push({ url: r.url(), t: Date.now() }));
  await page.route('**/*', r => {
    const u = r.request().url(), h = new URL(u).host, cors = { 'access-control-allow-origin': '*' };
    if (h.startsWith('127.0.0.1')) return r.continue();
    if (h === 'api.binance.com') return r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(binance(u)) });
    if (h === 'raw.githubusercontent.com') return r.fulfill({ status: 200, contentType: 'application/json', headers: cors,
      body: u.includes('heatmap') ? fs.readFileSync(path.join(REPO, 'heatmap.json')) : JSON.stringify(Object.assign({ updated: etat.maj }, MARCHE, { updated: etat.maj })) });
    return r.abort();
  });
  await page.addInitScript(([t, garder]) => { try { if (!garder) localStorage.clear(); localStorage.setItem('samsara-theme', t); } catch (e) { /* */ } }, [theme, !!o.garderStockage]);
  // Compteurs : dessins du graphique, mutations, classes du voyant. Posés avant app.js.
  await page.addInitScript(() => {
    window.__t = { dessins: 0, premierDessin: null };
    document.addEventListener('DOMContentLoaded', () => {
      const f = window.drawChart;
      window.drawChart = function () { window.__t.dessins++; if (window.__t.premierDessin === null && typeof candles !== 'undefined' && candles.length > 1) window.__t.premierDessin = Date.now(); return f.apply(this, arguments); };
    });
  });
  const url = `http://127.0.0.1:${serveur.address().port}/index.html` + (o.q || '');
  const tDebut = Date.now();
  await page.goto(url);
  await page.waitForFunction(() => window.__t.premierDessin && document.getElementById('cycle').children.length, null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(o.attente || 3500);
  return { ctx, page, erreurs, requetes, tDebut };
}

(async () => {
  await new Promise(r => serveur.listen(0, '127.0.0.1', r));
  const nav = await playwright.chromium.launch();
  try {
    // ── 1. Prix et horloge ──
    titre('1. Prix : une classe, pas une animation ; l’horloge dans la même tâche, arrêtée onglet caché');
    const k = await ouvrir(nav, 'kala');
    await k.page.evaluate(() => {
      window.__lots = []; window.__classes = []; window.__animsVues = 0;
      const prix = document.getElementById('price');
      new MutationObserver(() => { window.__classes.push(prix.className); window.__animsVues += prix.getAnimations({ subtree: true }).length; }).observe(prix, { attributes: true, attributeFilter: ['class'] });
      const obs = new MutationObserver(recs => window.__lots.push([...new Set(recs.map(r => (r.target.id || (r.target.parentNode && r.target.parentNode.id) || '?')))]));
      for (const id of ['price', 'taskbarClock']) obs.observe(document.getElementById(id), { childList: true, characterData: true, subtree: true, attributes: true });
    });
    etat.prix = 86100.25;
    await attendre(2600);
    const eclair = await k.page.evaluate(() => ({ classes: window.__classes, anims: window.__animsVues }));
    const i = eclair.classes.findIndex(c => /eclair-hausse/.test(c) && /price-up/.test(c));
    check('hausse du prix : classe « eclair-hausse » posée, et aucune animation du prix (ni couleur, ni autre)', i >= 0 && eclair.anims === 0, eclair);
    check('… puis retirée seule (la flèche de sens reste jusqu’au prix suivant)', i >= 0 && eclair.classes[i + 1] === 'price-badge price-up', eclair.classes);
    await attendre(2200);
    const lots = await k.page.evaluate(() => window.__lots);
    const horlogeSeule = lots.filter(l => l.includes('taskbarClock') && !l.includes('price'));
    check(`horloge écrite dans la même tâche que le prix (${lots.filter(l => l.includes('taskbarClock')).length} écritures, ${horlogeSeule.length} seule)`,
      lots.some(l => l.includes('taskbarClock')) && horlogeSeule.length === 0, lots.slice(-6));
    await k.page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); });
    const h0 = await k.page.evaluate(() => document.getElementById('taskbarClock').textContent);
    await attendre(2300);
    const h1 = await k.page.evaluate(() => document.getElementById('taskbarClock').textContent);
    check('onglet caché : l’horloge ne peint plus (et le prix n’est plus lu)', h0 === h1, [h0, h1]);
    await k.page.evaluate(() => { delete document.hidden; });

    // ── 2. Voyant ──
    titre('2. Voyant : une onde par publication nouvelle');
    const ondes = await k.page.evaluate(async () => {
      const dot = document.getElementById('dot'); let n = 0;
      new MutationObserver(() => { if (dot.classList.contains('ping')) n++; }).observe(dot, { attributes: true, attributeFilter: ['class'] });
      for (let i = 0; i < 3; i++) await fetchMarket(true);          // relectures de la MÊME publication
      return n;
    });
    etat.maj = new Date(Date.now() - 30000).toISOString();          // le serveur publie
    const ondes2 = await k.page.evaluate(async () => {
      const dot = document.getElementById('dot'); let n = 0;
      new MutationObserver(() => { if (dot.classList.contains('ping')) n++; }).observe(dot, { attributes: true, attributeFilter: ['class'] });
      await fetchMarket(true);
      await new Promise(r => setTimeout(r, 100));
      return { n, ping: dot.classList.contains('ping'), calme: dot.classList.contains('calme') };
    });
    check('trois relectures de la même publication : aucune onde', ondes === 0, ondes);
    check('une publication nouvelle : une onde', ondes2.n >= 1 && ondes2.ping && !ondes2.calme, ondes2);
    const src = fs.readFileSync(path.join(REPO, 'js/app.js'), 'utf8');
    const corps = nom => { const i = src.indexOf('function ' + nom + '('); let p = src.indexOf('{', i), n = 1, j = p + 1; while (n && j < src.length) { n += { '{': 1, '}': -1 }[src[j]] || 0; j++; } return src.slice(i, j); };
    check('aucune mise en page forcée pour relancer l’onde (offsetWidth / getBoundingClientRect)', !/offsetWidth|getBoundingClientRect|offsetHeight/.test(corps('onde') + corps('majAges') + corps('fetchMarket')));

    // ── 3. Calque ──
    titre('3. Calque : le survol et le prix ne redessinent pas le graphique');
    const geom = await k.page.evaluate(() => {
      const a = document.getElementById('chart').getBoundingClientRect(), b = document.getElementById('chartCalque').getBoundingClientRect(), cq = document.getElementById('chartCalque');
      const au = document.elementFromPoint(a.left + a.width / 2, a.top + a.height / 2);
      return { a: [a.left, a.top, a.width, a.height], b: [b.left, b.top, b.width, b.height], tailles: [cq.width, cq.height, document.getElementById('chart').width, document.getElementById('chart').height], dessous: au && au.id, aria: cq.getAttribute('aria-hidden') };
    });
    check('le calque épouse le graphique (position, taille, résolution), muet, et laisse passer le pointeur',
      geom.a.every((x, i) => Math.abs(x - geom.b[i]) < 0.5) && geom.tailles[0] === geom.tailles[2] && geom.tailles[1] === geom.tailles[3] && geom.dessous === 'chart' && geom.aria === 'true', geom);
    const box = await k.page.$eval('#chart', c => { const r = c.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
    const d0 = await k.page.evaluate(() => window.__t.dessins);
    for (let i = 0; i < 30; i++) { await k.page.mouse.move(box.x + 200 + i * 9, box.y + 150 + (i % 5) * 7); await k.page.evaluate(() => new Promise(r => requestAnimationFrame(r))); }
    const survol = await k.page.evaluate(() => ({ dessins: window.__t.dessins, calque: Array.from(document.getElementById('chartCalque').getContext('2d').getImageData(0, 0, document.getElementById('chartCalque').width, document.getElementById('chartCalque').height).data).filter((x, i) => i % 4 === 3 && x).length }));
    check(`30 images de survol : ${survol.dessins - d0} dessin(s) du graphique, le réticule est sur le calque (${survol.calque} px)`, survol.dessins === d0 && survol.calque > 1000, { d0, survol });
    await k.page.mouse.move(5, 5);
    // Prix qui bouge : l'étiquette du calque suit, sans redessin du graphique (sauf changement de libellé d'axe recouvert).
    const avantPrix = await k.page.evaluate(() => ({ d: window.__t.dessins, lp: livePrice }));
    etat.prix = avantPrix.lp + 0.37;
    await attendre(1400);
    const apresPrix = await k.page.evaluate(() => {
      const c = document.getElementById('chartCalque'), g = c.getContext('2d'), P = geoPrix;
      const y = Math.round(P.top + P.ph * (1 - (livePrice - P.minP) / P.range));
      const px = Array.from(g.getImageData(c.width - 40, y - 2, 1, 5).data);   // dans l'étiquette, colonne des prix
      return { d: window.__t.dessins, lp: livePrice, y, etiquette: px.filter((x, i) => i % 4 === 3 && x > 200).length };
    });
    check(`le prix bouge (${avantPrix.lp} → ${apresPrix.lp}) : l’étiquette du calque est à sa nouvelle ordonnée, le graphique n’est pas redessiné`,
      apresPrix.lp !== avantPrix.lp && apresPrix.etiquette >= 3 && apresPrix.d === avantPrix.d, { avantPrix, apresPrix });
    // Le libellé d'axe recouvert par l'étiquette est omis — sur le calque, sans redessiner le graphique.
    const lib = await k.page.evaluate(() => {
      const vus = [], f = CanvasRenderingContext2D.prototype.fillText, P = geoPrix, d0 = window.__t.dessins, avant = livePrice;
      CanvasRenderingContext2D.prototype.fillText = function (t, x, y) { if (this.canvas.id === 'chartCalque') vus.push({ t: String(t), y }); return f.apply(this, arguments); };
      livePrice = P.maxP - P.range / GRILLE_N * 2;              // pile sur le 3e libellé
      prixSurGraphique();
      CanvasRenderingContext2D.prototype.fillText = f;
      const attendu = '$' + fmtPrix(P.maxP - P.range / GRILLE_N * 2), libelles = vus.filter(v => v.t.startsWith('$'));
      livePrice = avant; prixSurGraphique();
      return { omis: !libelles.some(v => v.t === attendu && Math.abs(v.y - (P.top + P.ph / GRILLE_N * 2 + 3)) < 0.5), etiquette: libelles.some(v => v.t === attendu), n: libelles.length, dessins: window.__t.dessins - d0 };
    });
    check('prix sur un libellé d’axe : ce libellé est omis du calque (l’étiquette le remplace), les autres restent, sans redessin du graphique',
      lib.omis && lib.etiquette && lib.n === 7 && lib.dessins === 0, lib);
    const r0 = await k.page.evaluate(() => window.__t.dessins);
    await attendre(11000);   // deux queues de bougies (5 s) inchangées, dix lectures du prix inchangé
    const r1 = await k.page.evaluate(() => window.__t.dessins);
    check(`au repos, sans donnée nouvelle (11 s) : ${r1 - r0} dessin du graphique`, r1 === r0, { r0, r1 });
    check('aucune erreur JavaScript (Kāla)', !k.erreurs.length, k.erreurs);

    // ── 5. Chargement ──
    titre('5. Chargement : préchargé une fois, historique après le premier dessin');
    const R = k.requetes.filter(r => r.t < k.tDebut + 3000);
    const n = re => R.filter(r => re.test(r.url)).length;
    const premier = await k.page.evaluate(() => window.__t.premierDessin);
    const anciennes = R.filter(r => /klines.*endTime=/.test(r.url));
    check('première page de bougies, prix et market-data.json : une requête chacun au démarrage (le préchargement est repris)',
      n(/klines\?symbol=BTCUSDT&interval=15m&limit=1000$/) === 1 && n(/market-data\.json/) === 1, R.map(r => r.url.replace(/^https?:\/\/[^/]+/, '')).filter(u => !/\.(css|js|woff2|html)$/.test(u)).slice(0, 12));
    check(`les ${anciennes.length} pages anciennes de l’historique partent après le premier dessin`, anciennes.length === 2 && anciennes.every(r => r.t >= premier), { premier, anciennes: anciennes.map(r => r.t) });

    // ── 6. Chaleur ──
    titre('6. Chaleur : la même publication relue ne refait rien');
    const ch = await k.page.evaluate(async () => {
      overlays.liq = true; await fetchHeatmap(true); drawChart();
      const couche = heatLayer, d = window.__t.dessins;
      await fetchHeatmap(true); await fetchHeatmap(true);
      return { couche: !!couche, meme: heatLayer === couche, dessins: window.__t.dessins - d, grille: !!(histHeatmap && histHeatmap.grille), format: histHeatmap && histHeatmap.format };
    });
    check(`couche construite (${ch.format}) ; deux relectures de la même publication : ni dessin, ni couche refaite`, ch.couche && ch.grille && ch.meme && ch.dessins === 0, ch);
    const ageCouche = await k.page.evaluate(() => {
      const vus = [], f = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (t) { if (this.canvas.id === 'chartCalque') vus.push(String(t)); return f.apply(this, arguments); };
      dessinerCalque();
      CanvasRenderingContext2D.prototype.fillText = f;
      const age = Math.round((Date.now() - Date.parse(histHeatmap.updated)) / 60000);
      return { vus, attendu: 'Liquidité publiée il y a ' + age + ' min' };
    });
    check(`la couche porte son âge sur le graphique (« ${ageCouche.attendu} »)`, ageCouche.vus.includes(ageCouche.attendu), ageCouche);
    const z = await k.page.evaluate(() => {
      const cles = [];
      for (const v of [50, 3000, 50, 3000, 50]) { viewStart = Math.max(0, candles.length - v); viewEnd = candles.length; drawChart(); cles.push(heatLayer && heatLayer.cle); }
      return { cles, gardees: heatLayers.length };
    });
    check('zoom et dézoom répétés : les couches des deux paliers sont gardées et reprises', z.cles[0] === z.cles[2] && z.cles[1] === z.cles[3] && z.cles[0] !== z.cles[1] && z.gardees >= 2, z);
    await k.ctx.close();

    // ── 4. Verre ──
    titre('4. Verre : anneau suspendu au survol ; hyalite absent en rendu logiciel');
    const a = await ouvrir(nav, 'aero', { attente: 3000 });
    const ab = await a.page.$eval('#chart', c => { const r = c.getBoundingClientRect(); return { x: r.left, y: r.top }; });
    await a.page.mouse.move(ab.x + 300, ab.y + 200); await a.page.mouse.move(ab.x + 320, ab.y + 210);
    // L'anneau : quatre bandes (pseudo-éléments de .lg-ring et .lg-ring-cotes), toutes suspendues ensemble.
    const flous = () => [['.lg-ring', '::before'], ['.lg-ring', '::after'], ['.lg-ring-cotes', '::before'], ['.lg-ring-cotes', '::after']]
      .map(([s, p]) => getComputedStyle(document.querySelector(s), p).backdropFilter);
    const pendant = await a.page.evaluate(f => ({ survol: document.documentElement.classList.contains('survol'), flou: (0, eval)(f)() }), '(' + flous + ')');
    await attendre(500);
    const fini = await a.page.evaluate(f => ({ survol: document.documentElement.classList.contains('survol'), flou: (0, eval)(f)() }), '(' + flous + ')');
    check('Aero : pendant le survol les quatre bandes de l’anneau ne floutent plus, 250 ms après elles floutent à nouveau',
      pendant.survol && pendant.flou.every(f => f === 'none') && !fini.survol && fini.flou.length === 4 && fini.flou.every(f => f !== 'none'), { pendant, fini });
    const verre = await a.page.evaluate(() => ({ hyalite: typeof Hyalite !== 'undefined', verdict: JSON.parse(localStorage.getItem('samsara-verre-v1') || 'null') }));
    const hy = a.requetes.filter(r => /hyalite/.test(r.url)).length;
    check(`Chromium sans GPU (${verre.verdict && verre.verdict.moteur}) : rendu logiciel reconnu, hyalite ni demandé ni chargé`, verre.verdict && verre.verdict.logiciel === true && !verre.hyalite && hy === 0, { verre, hy });
    check('aucune erreur JavaScript (Aero)', !a.erreurs.length, a.erreurs);
    await a.ctx.close();
    const f = await ouvrir(nav, 'aero', { q: '?glass=force', attente: 3000 });
    check('?glass=force : hyalite chargé quand même', f.requetes.some(r => /hyalite/.test(r.url)) && await f.page.evaluate(() => typeof Hyalite !== 'undefined'));
    await f.ctx.close();
    const kl = await ouvrir(nav, 'kala', { attente: 1500 });
    await kl.page.mouse.move(400, 400); await kl.page.mouse.move(420, 410);
    check('Kāla (sans verre) : rien à suspendre au survol', !(await kl.page.evaluate(() => document.documentElement.classList.contains('survol'))));
    await kl.ctx.close();
  } finally { await nav.close(); serveur.close(); }
  console.log(ko ? `\n❌ SOBRIÉTÉ : ${ko} contrôle(s) en échec` : '\n✅ SOBRIÉTÉ : TOUS LES CONTRÔLES PASSENT');
  process.exit(ko ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
