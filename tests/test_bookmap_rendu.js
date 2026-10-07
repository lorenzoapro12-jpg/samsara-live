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
let seed = 5;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
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
const MINUTES = [];
{ let p = pMid; for (let i = 1500; i >= 0; i--) { const t = Math.floor((MAINTENANT - i * 60e3) / 60e3) * 60e3, o = p, c = p + (rnd() - 0.5) * 60; const q = 20 + rnd() * 80;
  MINUTES.push([t, o.toFixed(2), (Math.max(o, c) + rnd() * 20).toFixed(2), (Math.min(o, c) - rnd() * 20).toFixed(2), c.toFixed(2), String(q), t + 59999, String(q * c), 100, String(q / 2), String(q * c * (0.3 + 0.4 * rnd())), '0']); p = c; } }
const DERNIER_ID = 5_000_000, PAS_MS = 120;
const trade = id => { const r = Math.sin(id * 12.9898) * 43758.5453; const f = r - Math.floor(r);
  return { a: id, p: (+MINUTES[MINUTES.length - 1][4] + (f - 0.5) * 30).toFixed(2), q: (f * f * 3).toFixed(5), f: id, l: id, T: MAINTENANT - (DERNIER_ID - id) * PAS_MS, m: f < 0.47, M: true }; };
function binance(url) {
  const u = new URL(url), q = u.searchParams;
  if (u.pathname.endsWith('/klines')) {
    const n = +q.get('limit'), fin = q.get('endTime') ? +q.get('endTime') : Infinity;
    return MINUTES.filter(k => k[0] <= fin).slice(-n);
  }
  if (u.pathname.endsWith('/aggTrades')) {
    const n = +q.get('limit') || 500;
    let de = q.get('fromId') !== null ? +q.get('fromId') : DERNIER_ID - n + 1;
    const out = [];
    for (let id = de; id < de + n && id <= DERNIER_ID; id++) out.push(trade(id));
    return out;
  }
  if (u.pathname.endsWith('/depth')) {
    const n = +q.get('limit'), m = +MINUTES[MINUTES.length - 1][4];
    return { lastUpdateId: 1, bids: Array.from({ length: n }, (_, i) => [(m - 0.05 - i * 0.37).toFixed(2), (rnd() * (i % 97 === 0 ? 40 : 1.5)).toFixed(5)]),
      asks: Array.from({ length: n }, (_, i) => [(m + 0.05 + i * 0.37).toFixed(2), (rnd() * (i % 89 === 0 ? 40 : 1.5)).toFixed(5)]) };
  }
  return null;
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

async function ouvrir(nav, opts) {
  const page = await nav.newPage({ viewport: opts.vue || { width: 1440, height: 860 } });
  const erreurs = [];
  page.on('pageerror', e => erreurs.push(e.message));
  const hotes = new Set();
  await page.route('**/*', r => {
    const u = r.request().url(), h = new URL(u).host;
    if (h.startsWith('127.0.0.1')) return r.continue();
    hotes.add(h);
    const cors = { 'access-control-allow-origin': '*' };
    if (h === 'api.binance.com') { const d = binance(u); return d ? r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(d) }) : r.fulfill({ status: 404 }); }
    if (h === 'raw.githubusercontent.com') {
      if (u.includes('heatmap.json')) {
        let corps = opts.encodage ? Object.assign({}, hm, { encodage }) : sansEncodage();
        if (opts.colonnes && !Array.isArray(corps.colonnes)) corps = versColonnes(corps);
        return r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(corps) });
      }
      return r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: fs.readFileSync(path.join(REPO, 'market-data.json')) });
    }
    return r.abort();
  });
  await page.addInitScript(() => { try { localStorage.clear(); } catch (e) { /* */ } });
  await page.goto(`http://127.0.0.1:${serveur.address().port}/bookmap.html`);
  await page.waitForFunction(() => window.__carte && window.__carte.etat().publiee && window.__carte.etat().live && window.__carte.etat().minutes > 1000, null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2500);
  return { page, erreurs, hotes };
}
const etat = page => page.evaluate(() => window.__carte.etat());
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
    const k = MINUTES[MINUTES.length - 120];
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
  } finally {
    await nav.close();
    serveur.close();
  }
  console.log(ko ? `\n❌ CARTE (RENDU) : ${ko} contrôle(s) en échec` : '\n✅ CARTE (RENDU) : TOUS LES CONTRÔLES PASSENT');
  process.exit(ko ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
