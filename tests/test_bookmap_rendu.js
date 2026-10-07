// La carte (bookmap.html) RENDUE dans un vrai navigateur : Chromium, via Playwright.
//
// Le harnais node (test_bookmap.js) prouve que les CALCULS sont justes ; celui-ci prouve que la
// page les DESSINE comme promis : chaque calque porte son âge sur la carte, le prix est une
// ligne sur la chaleur, un réglage change le détail et pas la valeur lue au pointeur, la page
// tient sur un téléphone, et la chaleur se repeint dans son budget.
//
// Aucun réseau : Binance est simulé ici (réponses déterministes), heatmap.json et
// market-data.json sont ceux du dépôt. Sans Playwright, le harnais le DIT et sort en 0 :
// « non exécuté » n'est pas « réussi », et l'écran l'affiche.
//
// USAGE   node tests/test_bookmap_rendu.js
const fs = require('fs'), path = require('path'), http = require('http'), { execFileSync } = require('child_process');
const REPO = path.resolve(__dirname, '..');

let playwright = null;
for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright', process.env.PLAYWRIGHT_MODULE].filter(Boolean)) {
  try { playwright = require(p); break; } catch (e) { /* suivant */ }
}
if (!playwright) {
  console.log('  − NON EXÉCUTÉ : Playwright introuvable (npm i -g playwright, ou PLAYWRIGHT_MODULE=<chemin>).');
  console.log('    Ce n\'est pas un succès : le rendu de la carte n\'a pas été vérifié sur ce poste.');
  process.exit(0);
}

let ko = 0;
const check = (nom, ok, det) => { if (!ok) ko++; console.log(`  ${ok ? '✓' : '✗'} ${nom}${!ok && det !== undefined ? ' — ' + JSON.stringify(det).slice(0, 300) : ''}`); };
const titre = t => console.log(`\n── ${t} ──`);

// ── Binance simulé ───────────────────────────────────────────────────────────
const MAINTENANT = Date.now();
// Le fichier du dépôt est lu À TRAVERS le décodeur de la carte (js/bookmap-calc.js), jamais par
// ses champs : son format change côté serveur (« colonnes-1 »), et un harnais qui lirait
// hm.bids deviendrait rouge ce jour-là en accusant la carte.
const BM = require('../js/bookmap-calc.js');
const { versColonnes } = require('./heatmap_colonnes.js');
const hm = JSON.parse(fs.readFileSync(path.join(REPO, 'heatmap.json'), 'utf8'));
const G = BM.grillePubliee(hm);
if (!G) { console.error('heatmap.json du dépôt illisible par la carte'); process.exit(1); }
// Les cellules publiées, telles que la carte les décode : { c, pb, val } côté bid puis ask.
const CELLULES = [];
for (let c = 0; c < G.W; c++) for (let k = 0; k < G.H; k++) {
  for (const [cote, t] of [['bid', G.bids], ['ask', G.asks]]) { const v = t[c * G.H + k]; if (v) CELLULES.push({ c, pb: G.pbMin + k, val: v, cote }); }
}
// Le fichier du dépôt PEUT porter un `encodage` : le producteur en publie un depuis le
// 06/10/2026. Quand le harnais veut le cas « encodage NON publié », il doit donc le RETIRER de
// la réponse simulée — sinon il devient rouge tout seul, quinze minutes après la livraison du
// producteur qui l'introduit, en accusant la carte d'un défaut qui n'existe pas. Un faux rouge
// qui dépend de la donnée vivante ne vaut pas mieux qu'un faux vert.
const sansEncodage = () => { const c = Object.assign({}, hm); delete c.encodage; return c; };
// Prix de référence : la plus basse cellule ask de la dernière colonne qui en a.
const pMid = (() => { const a = CELLULES.filter(x => x.cote === 'ask'), cMax = Math.max(...a.map(x => x.c)); return Math.min(...a.filter(x => x.c === cMax).map(x => x.pb)) * G.dp; })();
// ── Binance simulé, à l'heure de SON serveur ─────────────────────────────────
// S.now() = Date.now() + S.decalage : l'horloge du serveur peut différer de celle de la page
// (horloge locale décalée), et avancer d'un coup (veille, onglet caché). Tout est engendré à la
// demande et cohérent dans le temps : bougies, exécutions (une toutes les 120 ms), carnet.
function simulateur() {
  const S = { decalage: 0, compte: {}, log: [], updateId: 1000 };
  S.now = () => Date.now() + S.decalage;
  const BASE = Math.floor(MAINTENANT / 60e3) * 60e3 - 30 * 3600e3, PAS = 120;
  const h = x => { const r = Math.sin(x * 12.9898) * 43758.5453; return r - Math.floor(r); };
  S.prix = t => pMid + 300 * Math.sin(t / 3.6e6 * 2 * Math.PI) + 40 * Math.sin(t / 7e4);
  S.kline = (t, now) => {
    const o = S.prix(t), c = S.prix(Math.min(t + 60e3, now)), frac = Math.min(1, (now - t) / 60e3);
    const vol = (20 + 60 * h(t / 60e3)) * frac, quote = vol * (o + c) / 2, taker = quote * (0.3 + 0.4 * h(t / 60e3 + 0.5));
    return [t, o.toFixed(2), (Math.max(o, c) + 5).toFixed(2), (Math.min(o, c) - 5).toFixed(2), c.toFixed(2), String(vol), t + 59999, String(quote), 100, String(vol / 2), String(taker), '0'];
  };
  S.trade = id => { const T = BASE + id * PAS, f = h(id); return { a: id, p: (S.prix(T) + (f - 0.5) * 6).toFixed(2), q: (f * f * 3).toFixed(5), f: id, l: id, T, m: f < 0.47, M: true }; };
  S.dernierId = () => Math.floor((S.now() - BASE) / PAS);
  S.repondre = url => {
    const u = new URL(url), q = u.searchParams, now = S.now(), k = u.pathname.split('/').pop();
    S.compte[k] = (S.compte[k] || 0) + 1;
    S.log.push([k, Date.now(), u.search]);
    if (k === 'time') return { serverTime: now };
    if (k === 'klines') {
      const n = Math.min(1000, +q.get('limit') || 500), der = Math.floor(Math.min(q.get('endTime') ? +q.get('endTime') : now, now) / 60e3) * 60e3, out = [];
      if (q.get('startTime') !== null) { for (let t = Math.ceil(+q.get('startTime') / 60e3) * 60e3; t <= der && out.length < n; t += 60e3) out.push(S.kline(t, now)); }
      else for (let t = der - (n - 1) * 60e3; t <= der; t += 60e3) out.push(S.kline(t, now));
      return out;
    }
    if (k === 'aggTrades') {
      const n = Math.min(1000, +q.get('limit') || 500), last = S.dernierId();
      const de = q.get('fromId') !== null ? +q.get('fromId') : last - n + 1, out = [];
      for (let id = de; id < de + n && id <= last; id++) out.push(S.trade(id));
      return out;
    }
    if (k === 'depth') {
      const n = +q.get('limit'), m = S.prix(now);
      const lv = s => Array.from({ length: n }, (_, i) => [(m + s * (0.05 + i * 0.37)).toFixed(2), (h(i + Math.floor(m) + s) * (i % 97 === 0 ? 40 : 1.5) + 0.01).toFixed(5)]);
      S.updateId += 7;
      return { lastUpdateId: S.updateId, bids: lv(-1), asks: lv(1) };
    }
    return null;
  };
  return S;
}
const encodage = JSON.parse(execFileSync('python3', ['-c', 'import sys,json;sys.path.insert(0,sys.argv[1]);import heatmap;print(json.dumps(heatmap.encodage()))', REPO]).toString());

// ── Serveur statique local ───────────────────────────────────────────────────
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const serveur = http.createServer((req, res) => {
  const f = path.join(REPO, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(REPO) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

// opts : encodage, colonnes (heatmap.json servi en « colonnes-1 »), vue, S (simulateur),
// intercept(url, chemin, S) → réponse à servir à la place, 'pendre' (jamais de réponse) ou rien ;
// latenceHeatmap (ms) ; init (script avant la page) ; horloge (page.clock installée) ;
// attendre: false (ne pas attendre le chargement complet).
async function ouvrir(nav, opts) {
  const page = await nav.newPage({ viewport: opts.vue || { width: 1440, height: 860 } });
  const erreurs = [];
  page.on('pageerror', e => erreurs.push(e.message));
  const hotes = new Set(), S = opts.S || simulateur(), urls = [];
  const comptes = { heatmap: 0, md: 0 };
  await page.route('**/*', async r => {
    const u = r.request().url(), h = new URL(u).host;
    if (h.startsWith('127.0.0.1')) return r.continue();
    hotes.add(h); urls.push(u);
    const cors = { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'retry-after' };
    if (h === 'api.binance.com') {
      const k = new URL(u).pathname.split('/').pop();
      if (opts.intercept) {
        const x = await opts.intercept(u, k, S);
        if (x === 'pendre') return;
        if (x) return r.fulfill(Object.assign({ contentType: 'application/json' }, x, { headers: Object.assign({}, cors, x.headers || {}) })).catch(() => {});
      }
      const d = S.repondre(u);
      return (d ? r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(d) }) : r.fulfill({ status: 404, headers: cors })).catch(() => {});
    }
    if (h === 'raw.githubusercontent.com') {
      if (u.includes('heatmap.json')) {
        comptes.heatmap++;
        let corps = opts.heatmap ? opts.heatmap() : (opts.encodage ? Object.assign({}, hm, { encodage }) : sansEncodage());
        if (opts.colonnes && !Array.isArray(corps.colonnes)) corps = versColonnes(corps);
        if (opts.latenceHeatmap) await new Promise(z => setTimeout(z, opts.latenceHeatmap));
        return r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(corps) }).catch(() => {});
      }
      comptes.md++;
      return r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: fs.readFileSync(path.join(REPO, 'market-data.json')) }).catch(() => {});
    }
    return r.abort();
  });
  if (opts.init) await page.addInitScript(opts.init);
  await page.addInitScript(() => { try { localStorage.clear(); } catch (e) { /* */ } });
  if (opts.reglages) await page.addInitScript(r => { localStorage.setItem('samsara-carte-v1', JSON.stringify(r)); }, opts.reglages);
  if (opts.horloge) await page.clock.install({ time: Date.now() });
  await page.goto(`http://127.0.0.1:${serveur.address().port}/bookmap.html`);
  if (opts.attendre !== false) {
    await page.waitForFunction(() => window.__carte && window.__carte.etat().publiee && window.__carte.etat().live && window.__carte.etat().minutes > 1000, null, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2500);
  }
  return { page, erreurs, hotes, S, comptes, urls };
}
const etat = page => page.evaluate(() => window.__carte.etat());
// Onglet caché / visible, simulé (document.hidden piloté par le harnais).
const ONGLET = () => {
  window.__cache = false;
  Object.defineProperty(Document.prototype, 'hidden', { configurable: true, get() { return window.__cache; } });
  Object.defineProperty(Document.prototype, 'visibilityState', { configurable: true, get() { return window.__cache ? 'hidden' : 'visible'; } });
};
const montrer = (page, cache) => page.evaluate(c => { window.__cache = c; document.dispatchEvent(new Event('visibilitychange')); }, cache);
// Le pixel le plus clair d'un voisinage 5 × 5 : une ligne lissée (anticrénelage) n'a pas son
// centre exactement sur un pixel entier.
async function pixel(page, x, y) {
  return page.evaluate(([x, y]) => {
    const c = document.getElementById('carte'), k = c.width / c.clientWidth;
    const d = c.getContext('2d').getImageData(Math.round(x * k) - 2, Math.round(y * k) - 2, 5, 5).data;
    let best = [0, 0, 0];
    for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > best[0] + best[1] + best[2]) best = [d[i], d[i + 1], d[i + 2]];
    return best;
  }, [x, y]);
}

(async () => {
  await new Promise(r => serveur.listen(0, '127.0.0.1', r));
  const nav = await playwright.chromium.launch();
  try {
    titre('1. Chargement : quatre sources, aucune erreur, aucun autre hôte');
    let { page, erreurs, hotes } = await ouvrir(nav, { encodage: true });
    let e = await etat(page);
    check('aucune erreur JavaScript', !erreurs.length, erreurs);
    check('seuls Binance et GitHub Raw sont appelés', [...hotes].every(h => ['api.binance.com', 'raw.githubusercontent.com'].includes(h)), [...hotes]);
    check('carte publiée chargée, encodage lu', e.publiee && e.publiee.W > 1000 && e.publiee.encodage, e.publiee);
    check('carnet live : au moins une colonne, même échelle que la carte publiée', e.live && e.live.n >= 1 && e.live.ref === 'publiee', e.live);
    check('exécutions et bougies 24 h chargées', e.executions.seaux > 0 && e.minutes >= 1440, { ex: e.executions.seaux, minutes: e.minutes });
    check('aucune erreur de source', Object.values(e.erreurs).every(v => !v), e.erreurs);

    titre('2. Chaque calque porte son âge SUR la carte');
    for (const [nom, motif] of [['carte publiée', /^Carte publiée · dernière colonne il y a /], ['carnet live', /^Carnet live · dernier il y a /],
      ['exécutions', /^Exécutions · dernière il y a /], ['murs', /^Murs du carnet · lus il y a /], ['gamma', /^Gamma \(Deribit\) · il y a /]]) {
      // Les murs et le gamma partent de leur instant de lecture : on élargit la vue si besoin.
      check(`pastille d'âge : ${nom}`, e.pastilles.some(t => motif.test(t)), e.pastilles);
    }

    titre('3. Le prix est une ligne SUR la chaleur');
    const v = e.vue, W = await page.evaluate(() => document.getElementById('carte').clientWidth);
    const L = await page.evaluate(() => { const c = document.getElementById('carte'); return { w: c.clientWidth, h: c.clientHeight }; });
    // Une minute ANCIENNE (avant les exécutions) : seule la ligne de prix est dessinée au-dessus de la chaleur.
    const k = simulateur().kline(Math.floor(Date.now() / 60e3) * 60e3 - 120 * 60e3, Date.now());
    const zoneW = L.w - 66 - 112, zoneH = L.h - 20 - 58 - 58;
    const x = (k[6] + 1 - v.t1) / (v.t2 - v.t1) * zoneW, y = (v.p2 - +k[4]) / (v.p2 - v.p1) * zoneH;
    const px = await pixel(page, x, y);
    check('pixel de la ligne de prix (il y a 2 h) : blanc', px.every(c => c > 235), { px, x, y });
    void W;

    titre('4. Un réglage change le détail, jamais la valeur lue');
    // Cadrage sur le milieu de la carte publiée (le fichier du dépôt peut dater de plusieurs
    // jours : la vue par défaut, sur le présent, ne la montrerait pas).
    {
      const tm = G.t0 + G.dt * 720;
      await page.evaluate(([a, b, c, d]) => window.__carte.cadrer(a, b, c, d), [tm - 3600e3, tm + 3600e3, pMid - 600, pMid + 600]);
      await page.waitForTimeout(400);
      Object.assign(v, (await etat(page)).vue);
    }
    // Une cellule publiée réelle, bien visible : on vise son centre.
    const cible = CELLULES.map(({ c, pb, val }) => ({ t: G.t0 + (c + 0.5) * G.dt, p: (pb + 0.5) * G.dp, val, pb }))
      .filter(z => z.t > v.t1 + (v.t2 - v.t1) * 0.15 && z.t < v.t1 + (v.t2 - v.t1) * 0.6 && z.p > v.p1 + (v.p2 - v.p1) * 0.1 && z.p < v.p2 - (v.p2 - v.p1) * 0.1 && z.val >= 40 && z.val < 255)
      .sort((a, b) => b.val - a.val)[0];
    const cx = (cible.t - v.t1) / (v.t2 - v.t1) * zoneW, cy = (v.p2 - cible.p) / (v.p2 - v.p1) * zoneH;
    // La souris se déplace en coordonnées de PAGE : on ajoute la position du canvas.
    const rc = await page.evaluate(() => { const r = document.getElementById('carte').getBoundingClientRect(); return { x: r.left, y: r.top }; });
    const lire = async () => { await page.mouse.move(rc.x + cx + 1, rc.y + cy); await page.mouse.move(rc.x + cx, rc.y + cy); await page.waitForTimeout(300); return page.evaluate(() => document.getElementById('lecture').innerText); };
    const lu1 = await lire();
    const m1 = lu1.match(/Carte ([\d\s ]+)–([\d\s ]+) \$ \((bid|ask)\) : intensité (\d+) → plus gros niveau ([\d,]+)–([\d,]+) BTC/);
    check(`lecture d'une cellule publiée : intensité ${cible.val} décodée en BTC`, m1 && +m1[4] >= cible.val, lu1);
    await page.evaluate(() => { const s = document.getElementById('rSaturation'); s.value = '60'; s.dispatchEvent(new Event('input')); });
    const lu2 = await lire();
    check('saturation changée : la même valeur est lue au même endroit', lu1 === lu2, [lu1, lu2]);
    await page.evaluate(() => { const s = document.getElementById('rFusionP'); s.value = '5'; s.dispatchEvent(new Event('input')); });
    const lu3 = await lire();
    const m3 = lu3.match(/Carte ([\d\s ]+)–([\d\s ]+) \$ \((bid|ask)\) : intensité (\d+)/);
    const larg = m3 ? (+m3[2].replace(/\s/g, '') - +m3[1].replace(/\s/g, '')) : null;
    check('fusion ×5 : la lecture dit la tranche de 100 $, intensité = MAX du bloc (≥ la cellule)',
      m3 && larg === 100 && +m3[4] >= +m1[4] && +m3[1].replace(/\s/g, '') <= cible.p && cible.p < +m3[2].replace(/\s/g, ''), [lu1, lu3]);

    titre('4b. Pixel qui recouvre plusieurs colonnes : la lecture donne le MAX peint');
    {
      await page.evaluate(() => { const s = document.getElementById('rFusionP'); s.value = '1'; s.dispatchEvent(new Event('input')); });
      // Toute la fenêtre publiée sur la largeur de la carte : ~70 s par pixel, deux colonnes par pixel.
      const vue = { t1: G.t0, t2: G.t0 + G.W * G.dt, p1: pMid - 900, p2: pMid + 900 };
      await page.evaluate(([a, b, c, d]) => window.__carte.cadrer(a, b, c, d), [vue.t1, vue.t2, vue.p1, vue.p2]);
      await page.waitForTimeout(400);
      const tpp = (vue.t2 - vue.t1) / zoneW, pp = (vue.p2 - vue.p1) / zoneH;
      const lirePx = (x, y) => { const [ja, jb] = BM.tranchesLigne(vue.p2, pp, y, G.dp, [0, 0]); const ta = vue.t1 + x * tpp; return BM.lirePixel(G, ta, ta + tpp, ja, jb); };
      // La cellule EXACTE sous le pointeur (ce que lisait l'ancienne lecture) doit différer du MAX
      // du pixel : sinon le contrôle n'aurait pas de dents.
      const cellule = (x, y) => { const t = vue.t1 + (x + 0.5) * tpp, p = vue.p2 - (y + 0.5) * pp, c = Math.floor((t - G.t0) / G.dt), k = Math.floor(p / G.dp) - G.pbMin;
        return Math.max(G.bids[c * G.H + k] || 0, G.asks[c * G.H + k] || 0); };
      let cible = null;
      for (let x = Math.floor(zoneW * 0.3); x < zoneW * 0.7 && !cible; x++) for (let y = Math.floor(zoneH * 0.3); y < zoneH * 0.7 && !cible; y += 3) {
        const r = lirePx(x, y);
        if (!r || r.nObs < 2 || r.horsBande || !r.v || r.v === 255 || cellule(x, y) === r.v) continue;
        let stable = true;
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) { const q = lirePx(x + dx, y + dy); if (!q || q.v !== r.v) stable = false; }
        if (stable) cible = { x, y, v: r.v, n: r.nObs };
      }
      if (!cible) check('pixel multi-colonnes trouvé pour le contrôle', false);
      else {
        await page.mouse.move(rc.x + cible.x + 0.4, rc.y + cible.y + 0.4); await page.mouse.move(rc.x + cible.x + 0.5, rc.y + cible.y + 0.5); await page.waitForTimeout(300);
        const lu = await page.evaluate(() => document.getElementById('lecture').innerText);
        const m = lu.match(/Carte [^\n]*: intensité (\d+)/);
        check(`pixel de ${cible.n} colonnes : intensité lue ${m && m[1]} = MAX peint ${cible.v} (la cellule exacte vaut autre chose)`, m && +m[1] === cible.v && /pixel = MAX de/.test(lu), lu);
      }
    }

    titre('5. Budget de rendu');
    e = await etat(page);
    check(`chaleur repeinte en ${e.mesure.chaleur.toFixed(1)} ms (budget 50 ms à 1440 × 860)`, e.mesure.chaleur < 50, e.mesure);
    check(`calques et axes en ${e.mesure.rendu.toFixed(1)} ms (budget 30 ms)`, e.mesure.rendu < 30, e.mesure);
    await page.close();

    titre('5b. heatmap.json en « colonnes-1 » : la même carte, la même lecture');
    {
      let p2;
      ({ page: p2, erreurs } = await ouvrir(nav, { encodage: true, colonnes: true }));
      const e2 = await etat(p2);
      check('aucune erreur JavaScript', !erreurs.length, erreurs);
      check('même grille publiée (colonnes, tranches, encodage)', e2.publiee && e2.publiee.W === G.W && e2.publiee.H === G.H && e2.publiee.encodage, e2.publiee);
      await p2.evaluate(([a, b, c, d]) => window.__carte.cadrer(a, b, c, d), [v.t1, v.t2, v.p1, v.p2]);
      await p2.waitForTimeout(400);
      const rc2 = await p2.evaluate(() => { const r = document.getElementById('carte').getBoundingClientRect(); return { x: r.left, y: r.top }; });
      await p2.mouse.move(rc2.x + cx + 1, rc2.y + cy); await p2.mouse.move(rc2.x + cx, rc2.y + cy); await p2.waitForTimeout(300);
      const luC = await p2.evaluate(() => document.getElementById('lecture').innerText);
      const ligne = t => (t.split('\n').find(l => /^Carte /.test(l)) || '');
      check('lecture au même point : identique à l\'ancien format', ligne(luC) && ligne(luC) === ligne(lu1), [ligne(lu1), ligne(luC)]);
      await p2.close();
    }

    titre('6. Sans encodage publié : des intensités, et la carte le dit');
    ({ page, erreurs } = await ouvrir(nav, { encodage: false }));
    e = await etat(page);
    check('aucune erreur JavaScript', !erreurs.length, erreurs);
    check('carnet live sur une échelle PROPRE, annoncée', e.live && e.live.ref === 'propre' && e.pastilles.some(t => /^Carnet live/.test(t)), e.live);
    const leg = await page.evaluate(() => document.getElementById('encodageEtat').textContent);
    check('légende : « encodage NON publié », aucune référence inventée', /NON publié/.test(leg), leg);
    await page.close();

    titre('7. Téléphone (390 × 800)');
    ({ page, erreurs } = await ouvrir(nav, { encodage: true, vue: { width: 390, height: 800 } }));
    e = await etat(page);
    const deb = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    check('aucun défilement horizontal', deb <= 0, deb);
    check('âges présents, en version courte', e.pastilles.length >= 4 && e.pastilles.every(t => t.length <= 40), e.pastilles);
    check('aucune erreur JavaScript', !erreurs.length, erreurs);
    await page.close();

    // ════ Sources live : horloge, cadence, limites, délais ════════════════════
    titre('8. Démarrage : chaque fichier publié lu UNE fois, sans paramètre anti-cache');
    {
      let p8, comptes, urls;
      ({ page: p8, erreurs, comptes, urls } = await ouvrir(nav, { encodage: true }));
      check('heatmap.json et market-data.json : une requête chacun à l\'ouverture', comptes.heatmap === 1 && comptes.md === 1, comptes);
      check('aucun ?t= sur GitHub Raw (le CDN l\'ignore ; il empêchait la revalidation)', urls.filter(u => /raw\.githubusercontent/.test(u)).every(u => !/\?/.test(u)), urls.filter(u => /raw\./.test(u)));
      check('aucune erreur JavaScript', !erreurs.length, erreurs);
      await p8.close();
    }

    titre('9. Horloge locale décalée : tout est recalé sur l\'heure de Binance');
    for (const dec of [30000, -30000]) {
      const S = simulateur(); S.decalage = dec;
      let p9;
      ({ page: p9, erreurs } = await ouvrir(nav, { encodage: true, S }));
      const e9 = await etat(p9);
      const exe = e9.pastilles.find(t => /^Exécutions · dernière il y a /.test(t)) || '';
      const age = (m => m ? +m[1].replace(',', '.') : NaN)(exe.match(/il y a ([\d,]+) s/));
      check(`horloge ${dec > 0 ? 'en retard' : 'en avance'} de 30 s : écart mesuré ${(e9.horloge.ecart / 1000).toFixed(2)} s ± ${e9.horloge.u} ms`, Math.abs(e9.horloge.ecart - dec) < 1000, e9.horloge);
      check('« maintenant » de la carte = heure Binance', Math.abs(e9.maintenant - S.now()) < 1500, e9.maintenant - S.now());
      check(`âge des exécutions juste (${exe.replace(/^.* il y a /, '')}) : ni « — », ni gonflé de 30 s`, age >= 0 && age < 8, exe);
      check('aucune erreur JavaScript', !erreurs.length, erreurs);
      await p9.close();
    }

    titre('10. Limite Binance (429) : TOUTES les lectures Binance s\'arrêtent, le statut décompte, puis reprise');
    {
      let limite = false;
      const intercept = () => (limite ? { status: 429, headers: { 'retry-after': '4' }, body: '{"code":-1003,"msg":"Too many requests"}' } : null);
      let p10, S;
      ({ page: p10, erreurs, S } = await ouvrir(nav, { encodage: true, intercept }));
      limite = true;
      await p10.waitForFunction(() => /limite de requêtes atteinte \(HTTP 429\)/.test(window.__carte.etat().statut), null, { timeout: 5000 }).catch(() => {});
      const e10 = await etat(p10), t429 = Date.now(), n0 = S.log.length;
      check('statut : « limite de requêtes atteinte (HTTP 429) — reprise dans … »', /Binance : limite de requêtes atteinte \(HTTP 429\).*reprise dans/.test(e10.statut), e10.statut);
      await p10.waitForTimeout(2500);
      const pendant = S.log.slice(n0).length;
      limite = false;
      check(`pendant la pause : aucune requête Binance (${pendant})`, pendant === 0, S.log.slice(n0));
      await p10.waitForFunction(() => !window.__carte.etat().recul.binance, null, { timeout: 8000 }).catch(() => {});
      await p10.waitForTimeout(2500);
      const apres = S.log.filter(x => x[1] > t429 + 3500).length, e10b = await etat(p10);
      check(`reprise après Retry-After (4 s) : ${apres} requêtes, statut effacé`, apres >= 3 && !/429/.test(e10b.statut), { apres, statut: e10b.statut });
      check('aucune erreur JavaScript', !erreurs.length, erreurs);
      await p10.close();
    }

    titre('11. Requête sans réponse : délai maximal, erreur affichée, la source repart');
    {
      let pendre = 0;
      const intercept = (u, k) => (k === 'depth' && pendre-- > 0 ? 'pendre' : null);
      let p11;
      ({ page: p11, erreurs } = await ouvrir(nav, { encodage: true, intercept }));
      const n1 = (await etat(p11)).live.n;
      pendre = 1;
      await p11.waitForFunction(() => /carnet live : pas de réponse en 5 s/.test(window.__carte.etat().statut), null, { timeout: 9000 }).catch(() => {});
      const st = (await etat(p11)).statut;
      check('statut : « carnet live : pas de réponse en 5 s — nouvel essai dans … »', /carnet live : pas de réponse en 5 s — nouvel essai dans/.test(st), st);
      await p11.waitForTimeout(6000);
      const e11 = await etat(p11);
      check(`le carnet live repart (${n1} → ${e11.live.n} lectures), erreur effacée`, e11.live.n > n1 + 1 && !/carnet live/.test(e11.statut), { n1, n: e11.live.n, statut: e11.statut });
      check('aucune erreur JavaScript', !erreurs.length, erreurs);
      await p11.close();
    }

    // ════ Carnet live : échelle, instants, lectures périmées ═══════════════════
    titre('12. heatmap.json arrive APRÈS le carnet : le live passe à l\'échelle publiée, sans rien perdre');
    {
      let p12;
      ({ page: p12, erreurs } = await ouvrir(nav, { encodage: true, latenceHeatmap: 3000, attendre: false }));
      await p12.waitForFunction(() => window.__carte && window.__carte.etat().live && window.__carte.etat().live.n >= 2 && !window.__carte.etat().publiee, null, { timeout: 8000 }).catch(() => {});
      const avant = await etat(p12);
      check(`avant heatmap.json : ${avant.live && avant.live.n} lectures, échelle propre (annoncée)`, avant.live && avant.live.ref === 'propre' && !avant.publiee, avant.live);
      await p12.waitForFunction(() => window.__carte.etat().publiee, null, { timeout: 8000 }).catch(() => {});
      await p12.waitForTimeout(600);
      const apres = await etat(p12);
      check(`après : même échelle que la carte publiée, lectures d'avant gardées (${avant.live && avant.live.n} → ${apres.live.n})`,
        apres.live.ref === 'publiee' && apres.live.deb0 === (avant.live && avant.live.deb0) && apres.pastilles.some(t => /^Carnet live/.test(t)), apres.live);
      // La lecture au pointeur du live donne des BTC (l'encodage publié), et la valeur MESURÉE.
      const L = await p12.evaluate(() => window.__carte.lectures());
      const e = apres, mid = (e.vue.p1 + e.vue.p2) / 2;
      await p12.evaluate(([a, b, c, d]) => window.__carte.cadrer(a, b, c, d), [L.deb[0] - 20e3, L.deb[L.n - 1] + 10e3, mid - 40, mid + 40]);
      await p12.waitForTimeout(400);
      const r = await p12.evaluate(() => { const c = document.getElementById('carte').getBoundingClientRect(); return { x: c.left, y: c.top, w: c.width, h: c.height }; });
      const zw = r.w - 66 - 112, zh = r.h - 20 - 58 - 58, xLu = ((L.deb[0] + L.deb[1]) / 2 - (L.deb[0] - 20e3)) / (L.deb[L.n - 1] + 30e3 - L.deb[0]) * zw;
      let lu = '';
      for (const fy of [0.5, 0.45, 0.55, 0.4, 0.6]) {
        await p12.mouse.move(r.x + xLu + 1, r.y + zh * fy); await p12.mouse.move(r.x + xLu, r.y + zh * fy); await p12.waitForTimeout(250);
        lu = await p12.evaluate(() => document.getElementById('lecture').innerText);
        if (/Live [^\n]*intensité/.test(lu)) break;
      }
      check('lecture du live (lu avant l\'arrivée de heatmap.json) : en BTC, valeur mesurée', /Live [^\n]*intensité \d+ → plus gros niveau/.test(lu) && /mesuré : [\d,]+ BTC/.test(lu), lu);
      check('aucune erreur JavaScript', !erreurs.length, erreurs);
      await p12.close();
    }

    titre('13. Encodage disparu en cours de séance : le live repasse à une échelle propre — jamais nul');
    {
      let sansEnc = false;
      const heatmap = () => (sansEnc ? Object.assign(sansEncodage(), { updated: new Date().toISOString() }) : Object.assign({}, hm, { encodage }));
      let p13;
      ({ page: p13, erreurs } = await ouvrir(nav, { heatmap, init: ONGLET }));
      const e0 = await etat(p13);
      check('au départ : échelle publiée', e0.live && e0.live.ref === 'publiee', e0.live);
      sansEnc = true;
      await montrer(p13, true); await p13.waitForTimeout(300); await montrer(p13, false);     // retour sur l'onglet : relecture
      await p13.waitForFunction(() => !window.__carte.etat().publiee.encodage, null, { timeout: 8000 }).catch(() => {});
      await p13.waitForTimeout(2500);
      const e1 = await etat(p13);
      check('heatmap.json republié sans encodage : relu', e1.publiee && !e1.publiee.encodage, e1.publiee);
      check(`live : échelle propre annoncée, chaleur non nulle (${e1.live.nonNuls} cellules)`, e1.live.ref === 'propre' && e1.live.nonNuls > 10 && e1.pastilles.some(t => /^Carnet live/.test(t)), e1.live);
      check('aucune erreur JavaScript', !erreurs.length, erreurs);
      await p13.close();
    }

    titre('14. Carnet à 1 s : chaque lecture à son instant, aucune colonne sautée');
    {
      let p14;
      // 250 ms de latence par carnet : une boucle qui relancerait APRÈS la réponse lirait toutes les 1,25 s.
      const intercept = async (u, k) => { if (k === 'depth') await new Promise(z => setTimeout(z, 250)); return null; };
      ({ page: p14, erreurs } = await ouvrir(nav, { encodage: true, reglages: { niveauxLive: 100 }, intercept }));
      await p14.waitForTimeout(6000);
      const L = await p14.evaluate(() => window.__carte.lectures()), e14 = await etat(p14);
      let jointif = 0, ecarts = [];
      for (let c = 0; c + 1 < L.n; c++) { if (L.fin[c] === L.deb[c + 1]) jointif++; ecarts.push(L.deb[c + 1] - L.deb[c]); }
      const moy = ecarts.reduce((a, b) => a + b, 0) / ecarts.length;
      check(`${L.n} lectures, chacune jusqu'à la suivante (${jointif}/${L.n - 1} jointives)`, L.n >= 8 && jointif === L.n - 1, { n: L.n, jointif });
      check(`pas fixe : ${Math.round(moy)} ms en moyenne entre deux lectures (cadence 1 000 ms, latence de 250 ms non ajoutée)`, Math.abs(moy - 1000) < 60, ecarts);
      check('instant de chaque lecture = milieu [envoi, réception] à l\'heure Binance', L.deb.every((d, c) => Math.abs(d - ((L.envoi[c] + L.recu[c]) / 2 + e14.horloge.ecart)) < 1e-6));
      check('aucune erreur JavaScript', !erreurs.length, erreurs);
      await p14.close();
    }

    titre('15. Carnet plus ancien que le précédent (lastUpdateId) : écarté');
    {
      let k = 0;
      const intercept = (u, ch, S) => { if (ch !== 'depth' || ++k % 3) return null; const d = S.repondre(u); d.lastUpdateId -= 1000; return { status: 200, body: JSON.stringify(d) }; };
      let p15;
      ({ page: p15, erreurs } = await ouvrir(nav, { encodage: true, intercept }));
      await p15.waitForTimeout(4000);
      const e15 = await etat(p15);
      check(`${e15.live.ecartees} lecture(s) périmée(s) écartée(s), ${e15.live.n} gardées`, e15.live.ecartees >= 1 && e15.live.n >= 2, e15.live);
      check('aucune erreur JavaScript', !erreurs.length, erreurs);
      await p15.close();
    }
  } finally {
    await nav.close();
    serveur.close();
  }
  console.log(ko ? `\n❌ CARTE (RENDU) : ${ko} contrôle(s) en échec` : '\n✅ CARTE (RENDU) : TOUS LES CONTRÔLES PASSENT');
  process.exit(ko ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
