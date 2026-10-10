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
//   4. DOIGT : un tap sur le libellé d'une bande montre le résumé de son explication ; un 2e, le
//      détail ; un 3e la retire.
//
// Binance simulé (bougies déterministes) ; fichier publié recopié avec des murs et des niveaux
// d'options posés près du prix simulé, lu « maintenant » ; scénarios du matin présents
// (tests/fixtures/previsions.json) : le Guide reste lisible avec eux.
// HORLOGE FIXÉE : « maintenant » est le 08/10/2026 à 22:52 UTC, pour le harnais (bougies, fichier
// publié, scénarios) ET pour la page (page.clock), quelle que soit l'heure du lancement. Les
// bougies simulées dépendent de l'heure (sinusoïde sur l'indice absolu de la bougie, plus haut et
// plus bas d'hier pris sur la journée UTC) : la place laissée aux étiquettes en dépendait, et le
// harnais passait ou non selon l'heure. À 22:52, une bande de cinq raisons dont deux publiées
// (zéro gamma, mur de calls) est nommée à 390 px sur quatre lignes : l'heure de chacune doit y
// rester (coupée à trois lignes, la seconde se perdait dans « … »).
// Sans Playwright : « non exécuté », dit à l'écran (ce n'est pas un succès).
// USAGE   node tests/test_guide_page.js
const fs = require('fs'), path = require('path'), http = require('http');
const REPO = path.resolve(__dirname, '..');
const { previsionsFixture, estPrevisions } = require('./previsions-fixture');

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

// L'horloge du harnais et de la page : MAINTENANT au lancement, puis le temps qui passe.
const MAINTENANT = Date.parse('2026-10-08T22:52:00Z'), DECALAGE = MAINTENANT - Date.now();
const maintenant = () => Date.now() + DECALAGE;
// Binance simulé : une sinusoïde autour de 86 000, prix fixe.
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
// Le fichier publié, lu « maintenant », avec des murs et des niveaux d'options près du prix simulé.
// L'heure attendue est celle que la page AFFICHE : l'heure de l'appareil (js/format.js), quel que
// soit le fuseau du poste qui lance le test (TZ=Europe/Paris comme UTC).
const Fm = require(path.join(REPO, 'js/format.js'));
const LU = new Date(Math.floor(maintenant() / 60000) * 60000).toISOString().replace('.000Z', '+00:00'), HM = Fm.heure(Date.parse(LU));
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

async function ouvrir(nav, vue, mode, tactile, sansScenarios) {
  const ctx = await nav.newContext(Object.assign({ viewport: vue, deviceScaleFactor: 1 }, tactile ? { hasTouch: true, isMobile: true } : {}));
  // La page vit à l'heure du harnais (le temps s'écoule normalement à partir de là).
  await ctx.clock.install({ time: maintenant() });
  const page = await ctx.newPage();
  const erreurs = [];
  page.on('pageerror', e => erreurs.push(e.message));
  await page.route('**/*', r => {
    const u = r.request().url(), h = new URL(u).host, cors = { 'access-control-allow-origin': '*' };
    if (h.startsWith('127.0.0.1')) return r.continue();
    if (h === 'api.binance.com') return r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(binance(u)) });
    if (h === 'raw.githubusercontent.com') {
      // Les scénarios du matin aussi : le Guide doit rester lisible avec eux.
      if (estPrevisions(u) && sansScenarios) return r.fulfill({ status: 404, headers: cors, body: '' });
      if (estPrevisions(u)) return r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: previsionsFixture({ maintenant: maintenant() }) });
      if (u.includes('heatmap')) return r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: fs.readFileSync(path.join(REPO, 'heatmap.json')) });
      if (/\/master\/market-data\.json/.test(u)) return r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: MD });
      return r.fulfill({ status: 404, headers: cors, body: '' });
    }
    return r.abort();
  });
  await page.addInitScript(m => { try { localStorage.clear(); localStorage.setItem('samsara-theme', 'aero'); localStorage.setItem('samsara-mode', m); } catch (e) { /* */ } }, mode);
  // Les places réservées sur le tracé (E.rects, partagé par le Guide et les scénarios) qui se
  // recouvrent de plus d'un pixel dans les deux sens.
  await page.addInitScript(() => {
    window.chevauchementsPlaces = () => {
      const R = guideEtat ? guideEtat.rects : [], o = [];
      for (let a = 0; a < R.length; a++) for (let b = a + 1; b < R.length; b++) {
        const A = R[a], B = R[b], ix = Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x), iy = Math.min(A.y + A.h, B.y + B.h) - Math.max(A.y, B.y);
        if (ix > 1 && iy > 1) o.push([A, B].map(r => [r.x, r.y, r.w, r.h].map(Math.round)));
      }
      const B = typeof scenEtat !== 'undefined' && scenEtat && scenEtat.boite;
      return { n: R.length, o, boite: B ? { x: Math.round(B.x), y: Math.round(B.y), w: Math.round(B.w), lignes: (B.lignes || []).map(l => l.t) } : null };
    };
  });
  await page.goto(`http://127.0.0.1:${serveur.address().port}/index.html`);
  await page.waitForFunction(() => typeof guideEtat !== 'undefined' && guideEtat && guideEtat.niveaux.length > 0 && typeof marketData !== 'undefined' && marketData, null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(600);
  return { ctx, page, erreurs };
}

/** L'état du Guide, relu dans la page : bandes, libellés, étiquettes du bord, chemins. */
const etat = page => page.evaluate(() => {
  const E = guideEtat, b = canvas.getBoundingClientRect();
  const hh = ms => Fmt.heure(ms);   // l'heure affichée par la page : celle de l'appareil (js/format.js)
  return {
    bx: b.left, by: b.top, exp: E.exp,
    niveaux: E.niveaux.map(L => ({ visible: L.visible, prix: L.niv.raisons.map(r => r.p), heures: L.niv.raisons.filter(r => isFinite(r.lu)).map(r => hh(r.lu)),
      lignes: L.etiq ? L.etiq.lignes : null, etiq: L.etiq ? { enLigne: L.etiq.enLigne, sansEtat: !!L.etiq.sansEtat } : null, sansPlace: (E.sansPlace || []).includes(L),
      auBord: E.cibles.some(c => c.niveaux && c.niveaux.includes(L) && c.rects.length) })),
    chemins: E.chemins || null, suite: { haut: !!E.D.suite.haut, bas: !!E.D.suite.bas },
    cibles: E.cibles.map(c => ({ prio: c.prio, titre: c.titre, rects: c.rects || [] })),
    // Les étiquettes du bord posées : leurs lignes, et l'heure de CHAQUE chiffre publié qu'elles nomment.
    bords: E.cibles.filter(c => c.niveaux && c.rects.length).map(c => ({ lignes: c.lignes,
      heures: [].concat(...c.niveaux.map(L => L.niv.raisons.filter(r => isFinite(r.lu)).map(r => hh(r.lu)))) })),
  };
});

(async () => {
  await new Promise(r => serveur.listen(0, '127.0.0.1', r));
  const nav = await playwright.chromium.launch();
  try {
    // Mode Expert : les étiquettes des bandes (heures de publication, étiquette du bord) et les
    // chemins « Et ensuite ? » mesurés ici sont des éléments denses, réservés à l'Expert. Le
    // Débutant (deux repères en mots, chemins dans la bulle) est vérifié dans test_debutant_page.js.
    for (const [vue, mode] of [[{ width: 1440, height: 900 }, 'expert'], [{ width: 1024, height: 760 }, 'expert'], [{ width: 390, height: 800 }, 'expert']]) {
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
      // … et l'étiquette du bord aussi : une heure par chiffre publié nommé, rien de coupé.
      const nFois = (t, h) => t.split(h).length - 1;
      const bordsPub = e.bords.filter(b => b.heures.length);
      check(`${nom} : chaque étiquette du bord qui nomme un chiffre publié garde chaque heure, sans « … » (${bordsPub.length})`,
        bordsPub.every(b => Array.isArray(b.lignes) && b.heures.every(h => nFois(b.lignes.join(' '), h) >= b.heures.filter(x => x === h).length) && !/…/.test(b.lignes.join(' '))), bordsPub);
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
      // 5. Rien ne se chevauche : les places réservées (libellés, bord, chemins, figures, scénarios et
      // leur encadré) sont disjointes deux à deux — à 390 px comme à 1440 px, et à 360 px plus bas.
      const places = await o.page.evaluate(() => { crossX = crossY = null; drawChart(); return chevauchementsPlaces(); });
      check(`${nom} : aucune étiquette ne se pose sur une autre (${places.n} places)`, places.n > 3 && !places.o.length, places);
      // Écran étroit : l'état d'une bande (« proche · … ») n'ajoute pas une ligne sous son libellé ;
      // il est dans la bulle (« Maintenant : … »).
      if (vue.width < 700) check(`${nom} : l'état de chaque bande est à côté de son libellé ou dans la bulle, jamais sur une ligne de plus`,
        e.niveaux.filter(L => L.etiq).every(L => L.etiq.enLigne || L.etiq.sansEtat), e.niveaux.map(L => L.etiq));
      check(`${nom} : aucune erreur JavaScript`, !o.erreurs.length, o.erreurs);
      await o.ctx.close();
    }

    titre('360 px · expert : rien ne se chevauche, même à l\'étroit');
    {
      const o = await ouvrir(nav, { width: 360, height: 740 }, 'expert');
      const places = await o.page.evaluate(() => { crossX = crossY = null; drawChart(); return chevauchementsPlaces(); });
      check(`360 px : aucune étiquette ne se pose sur une autre, l'encadré des scénarios compris (${places.n} places)`, places.n > 3 && !places.o.length && places.boite, places);
      check('360 px : aucune erreur JavaScript', !o.erreurs.length, o.erreurs);
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
      // Débutant : le 1er tap montre le résumé de la bulle, le 2e son détail, le 3e la retire.
      await t.page.touchscreen.tap(x, y); await t.page.waitForTimeout(200);
      const detail = await t.page.evaluate(() => ({ survol: guideEtat.survol ? guideEtat.survol.titre : null, resume: guideEtat.bulle ? guideEtat.bulle.resume : null }));
      check('… un 2e tap au même endroit ouvre son détail', detail.survol === c.titre && detail.resume === false, detail);
      await t.page.touchscreen.tap(x, y); await t.page.waitForTimeout(200);
      const retire = await t.page.evaluate(() => ({ survol: guideEtat.survol, crossX }));
      check('… un 3e tap au même endroit la retire', retire.survol === null && retire.crossX === null, retire);
    }
    check('écran tactile : aucune erreur JavaScript', !t.erreurs.length, t.erreurs);
    await t.ctx.close();

    // Sans scénarios du matin, la bande à cinq raisons (deux chiffres publiés) se pose près d'elle
    // à 22:52 sur un téléphone : c'est le libellé POSÉ qui doit garder ses deux heures, pas le bord.
    // Mode Expert : les heures de publication dans le libellé posé n'existent qu'en Expert.
    titre('390 px · expert, sans scénarios du matin');
    const s = await ouvrir(nav, { width: 390, height: 800 }, 'expert', false, true);
    const es = await etat(s.page);
    const pubS = es.niveaux.filter(L => L.visible && L.lignes && L.heures.length);
    const nFoisS = (t, h) => t.split(h).length - 1;
    check(`sans scénarios : chaque libellé posé qui porte un chiffre publié garde chaque heure, sans « … » (${pubS.length})`,
      pubS.length > 0 && pubS.every(L => L.heures.every(h => nFoisS(L.lignes.join(' '), h) >= L.heures.filter(x => x === h).length) && !/…/.test(L.lignes.join(' '))), pubS);
    check('sans scénarios : aucune erreur JavaScript', !s.erreurs.length, s.erreurs);
    await s.ctx.close();
  } finally { await nav.close(); serveur.close(); }
  console.log(ko ? `\n❌ GUIDE À L'ÉCRAN : ${ko} contrôle(s) en échec` : '\n✅ GUIDE À L\'ÉCRAN : TOUS LES CONTRÔLES PASSENT');
  process.exit(ko ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
