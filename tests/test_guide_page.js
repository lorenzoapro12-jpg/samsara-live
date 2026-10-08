// Le Guide du graphique dans un vrai navigateur (Chromium, Playwright) : ce qui ne se juge qu'à
// l'écran — où ses étiquettes se posent, ce que le survol et le doigt atteignent.
//
//   1. CHAQUE BANDE NOMMÉE : une bande dessinée a son libellé près d'elle, ou elle est nommée dans
//      l'étiquette du bord (jamais une bande muette) ; à 390 px comme à 1440 px, chaque libellé
//      qui porte un chiffre publié garde son heure (« 21:03 ») — rien n'est coupé dessus.
//   2. ET ENSUITE ? : les deux chemins sont rendus ensemble (deux boîtes, ou une boîte commune),
//      dans la même variante, chacune gardant sa condition (« si … ») ; la boîte du chemin vers
//      le haut reste au-dessus de celle du chemin vers le bas ; un côté sans niveau nommé est dit.
//   3. SURVOL : le centre de l'étiquette de chaque chemin montre l'explication du chemin.
//   4. DOIGT : un tap sur le libellé d'une bande montre son explication ; un 2e tap la retire.
//
// Binance simulé (bougies déterministes) ; fichier publié recopié avec des murs et des niveaux
// d'options posés près du prix simulé, lu « maintenant ».
// Sans Playwright : « non exécuté », dit à l'écran (ce n'est pas un succès).
// USAGE   node tests/test_guide_page.js
const fs = require('fs'), path = require('path'), http = require('http');
const REPO = path.resolve(__dirname, '..');

let playwright = null;
for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright', process.env.PLAYWRIGHT_MODULE].filter(Boolean)) {
  try { playwright = require(p); break; } catch (e) { /* suivant */ }
}
if (!playwright) {
  console.log('  − NON EXÉCUTÉ : Playwright introuvable — le Guide n\'est pas vérifié à l\'écran sur ce poste.');
  process.exit(0);
}
let ko = 0;
const check = (nom, ok, det) => { if (!ok) ko++; console.log(`  ${ok ? '✓' : '✗'} ${nom}${!ok && det !== undefined ? ' — ' + JSON.stringify(det).slice(0, 500) : ''}`); };
const titre = t => console.log(`\n── ${t} ──`);

// Binance simulé : une sinusoïde autour de 86 000, prix fixe.
function binance(url) {
  const u = new URL(url), q = u.searchParams, now = Date.now();
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
// Le fichier publié, lu « maintenant », avec des murs et des niveaux d'options près du prix simulé.
const LU = new Date(Math.floor(Date.now() / 60000) * 60000).toISOString().replace('.000Z', '+00:00'), HM = LU.slice(11, 16);
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

async function ouvrir(nav, vue, mode, tactile) {
  const ctx = await nav.newContext(Object.assign({ viewport: vue, deviceScaleFactor: 1 }, tactile ? { hasTouch: true, isMobile: true } : {}));
  const page = await ctx.newPage();
  const erreurs = [];
  page.on('pageerror', e => erreurs.push(e.message));
  await page.route('**/*', r => {
    const u = r.request().url(), h = new URL(u).host, cors = { 'access-control-allow-origin': '*' };
    if (h.startsWith('127.0.0.1')) return r.continue();
    if (h === 'api.binance.com') return r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(binance(u)) });
    if (h === 'raw.githubusercontent.com') {
      if (u.includes('heatmap')) return r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: fs.readFileSync(path.join(REPO, 'heatmap.json')) });
      if (/\/master\/market-data\.json/.test(u)) return r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: MD });
      return r.fulfill({ status: 404, headers: cors, body: '' });
    }
    return r.abort();
  });
  await page.addInitScript(m => { try { localStorage.clear(); localStorage.setItem('samsara-theme', 'aero'); localStorage.setItem('samsara-mode', m); } catch (e) { /* */ } }, mode);
  await page.goto(`http://127.0.0.1:${serveur.address().port}/index.html`);
  await page.waitForFunction(() => typeof guideEtat !== 'undefined' && guideEtat && guideEtat.niveaux.length > 0 && typeof marketData !== 'undefined' && marketData, null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(600);
  return { ctx, page, erreurs };
}

/** L'état du Guide, relu dans la page : bandes, libellés, étiquettes du bord, chemins. */
const etat = page => page.evaluate(() => {
  const E = guideEtat, b = canvas.getBoundingClientRect();
  const hh = ms => new Date(ms).toISOString().slice(11, 16);
  return {
    bx: b.left, by: b.top, exp: E.exp,
    niveaux: E.niveaux.map(L => ({ visible: L.visible, prix: L.niv.raisons.map(r => r.p), heures: L.niv.raisons.filter(r => isFinite(r.lu)).map(r => hh(r.lu)),
      lignes: L.etiq ? L.etiq.lignes : null, sansPlace: (E.sansPlace || []).includes(L),
      auBord: E.cibles.some(c => c.niveaux && c.niveaux.includes(L) && c.rects.length) })),
    chemins: E.chemins || null, suite: { haut: !!E.D.suite.haut, bas: !!E.D.suite.bas },
    cibles: E.cibles.map(c => ({ prio: c.prio, titre: c.titre, rects: c.rects || [] })),
  };
});

(async () => {
  await new Promise(r => serveur.listen(0, '127.0.0.1', r));
  const nav = await playwright.chromium.launch();
  try {
    for (const [vue, mode] of [[{ width: 1440, height: 900 }, 'debutant'], [{ width: 1440, height: 900 }, 'expert'], [{ width: 1024, height: 760 }, 'debutant'],
      [{ width: 390, height: 800 }, 'debutant'], [{ width: 390, height: 800 }, 'expert']]) {
      const nom = vue.width + ' px · ' + mode;
      titre(nom);
      const o = await ouvrir(nav, vue, mode);
      const e = await etat(o.page);
      const vis = e.niveaux.filter(L => L.visible);
      check(`${nom} : des bandes dessinées (${vis.length}), dont au moins une avec un chiffre publié`, vis.length > 0 && e.niveaux.some(L => L.heures.length), e.niveaux);
      // 1. Chaque bande nommée ; chaque libellé publié garde son heure, en entier.
      check(`${nom} : chaque bande visible est nommée — son libellé près d'elle, ou dans l'étiquette du bord`, vis.every(L => L.lignes || (L.sansPlace && L.auBord)), vis);
      const pub = vis.filter(L => L.lignes && L.heures.length);
      check(`${nom} : chaque libellé posé qui porte un chiffre publié garde son heure (« ${HM} »), sans « … »`, pub.length > 0 && pub.every(L => L.heures.every(h => L.lignes.join(' ').includes(h)) && !/…/.test(L.lignes.join(' '))), pub);
      // 2. Les deux chemins, ensemble, dans la même variante, chacun avec sa condition.
      const ch = e.chemins;
      const boites = ch ? ch.boites : [];
      check(`${nom} : « Et ensuite ? » rendu pour les DEUX côtés (deux boîtes, ou une commune) — jamais un seul`, ch && ch.variante && (ch.variante === 'commune' ? boites.length === 1 && boites[0].lignes.length === 2 : boites.length === 2 && boites.some(b => b.sens > 0) && boites.some(b => b.sens < 0)), ch);
      const conditionnel = l => /^(Si clôt|si [<>]|[↑↓] aucun|Si clôture)/.test(l);
      check(`${nom} : chaque chemin garde sa condition (« Si clôture … », « si > … », « si < … »)`, boites.length && boites.every(b => (ch.variante === 'commune' ? b.lignes : [b.lignes[0]]).every(conditionnel)), boites.map(b => b.lignes));
      if (ch && ch.variante !== 'commune' && boites.length === 2) {
        const h = boites.find(b => b.sens > 0), b = boites.find(x => x.sens < 0);
        check(`${nom} : la boîte du chemin vers le haut est au-dessus de celle du chemin vers le bas`, h.rect.y1 <= b.rect.y0 + 0.5, [h.rect, b.rect]);
      }
      // 3. Survol du centre de chaque étiquette de chemin : son explication.
      const cs = e.cibles.filter(c => c.prio === 3 && c.rects.length);
      const vus = [];
      for (const c of cs) {
        const r = c.rects[0], x = e.bx + (r.x0 + r.x1) / 2, y = e.by + (r.y0 + r.y1) / 2;
        await o.page.mouse.move(x - 12, y - 4); await o.page.mouse.move(x, y, { steps: 3 }); await o.page.waitForTimeout(120);
        vus.push(await o.page.evaluate(() => (guideEtat.survol ? guideEtat.survol.titre : null)));
      }
      check(`${nom} : survol du centre de chaque étiquette « Et ensuite ? » → son explication (${vus.length})`, cs.length && vus.every((t, k) => t === cs[k].titre && /^Et ensuite \?/.test(t)), { vus, attendus: cs.map(c => c.titre) });
      await o.page.mouse.move(2, 2);
      // Un côté sans niveau nommé : dit, dans la même variante, avec l'autre.
      const seul = await o.page.evaluate(() => {
        const s = Guide.suite;
        Guide.suite = (c, r) => ({ haut: s(c, r).haut, bas: null, dans: null });
        memoCache.clear(); drawChart();
        const C = guideEtat.chemins;
        Guide.suite = s; memoCache.clear(); drawChart();
        return C;
      });
      check(`${nom} : un côté sans niveau nommé — les deux côtés restent rendus, le vide est dit (« aucun niveau »)`, seul && seul.variante && (seul.variante === 'commune'
        ? /aucun/.test(seul.boites[0].lignes.join(' ')) : seul.boites.length === 2 && /aucun/.test(seul.boites.find(b => b.sens < 0).lignes.join(' '))), seul);
      check(`${nom} : aucune erreur JavaScript`, !o.erreurs.length, o.erreurs);
      await o.ctx.close();
    }

    titre('Doigt (390 px, écran tactile) : un tap sur un libellé explique la bande');
    const t = await ouvrir(nav, { width: 390, height: 800 }, 'debutant', true);
    const e = await etat(t.page);
    const c = e.cibles.find(q => q.prio === 1 && q.rects.length);
    if (!c) check('un libellé de bande à toucher', false, e.cibles);
    else {
      const r = c.rects[0], x = e.bx + (r.x0 + r.x1) / 2, y = e.by + (r.y0 + r.y1) / 2;
      await t.page.touchscreen.tap(x, y); await t.page.waitForTimeout(200);
      const apres = await t.page.evaluate(() => ({ survol: guideEtat.survol ? guideEtat.survol.titre : null, crossX, crossY }));
      check('tap sur le libellé d’une bande → son explication (bulle du Guide)', apres.survol === c.titre, { apres, attendu: c.titre });
      await t.page.touchscreen.tap(x, y); await t.page.waitForTimeout(200);
      const retire = await t.page.evaluate(() => ({ survol: guideEtat.survol, crossX }));
      check('… un 2e tap au même endroit la retire', retire.survol === null && retire.crossX === null, retire);
    }
    check('écran tactile : aucune erreur JavaScript', !t.erreurs.length, t.erreurs);
    await t.ctx.close();
  } finally { await nav.close(); serveur.close(); }
  console.log(ko ? `\n❌ GUIDE À L'ÉCRAN : ${ko} contrôle(s) en échec` : '\n✅ GUIDE À L\'ÉCRAN : TOUS LES CONTRÔLES PASSENT');
  process.exit(ko ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
