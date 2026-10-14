// Les scénarios du matin dans un vrai navigateur (Chromium, Playwright) : la couche se dessine
// avec le fichier de test, l'encadré dit ce qu'il doit dire, le survol et le doigt atteignent
// l'explication, le fichier d'attente et l'absence de fichier sont dits en une ligne.
//
//   1. FICHIER COMPLET (1440 px débutant / expert, 1024 px et 390 px avec et sans le Guide) :
//      4 scénarios suivis, l'encadré dans le tracé (moitié haute, dans l'écran), son titre
//      « Scénarios du matin · JJ/MM HH:MM » (le point du matin à l'heure de l'appareil, calculé avec
//      Fmt ; ni « UTC » ni « Paris »), une ligne par scénario, « sans pourcentage »
//      (débutant), le bilan de l'ordre et la mention « suivi en direct » ; aucun « % » en
//      débutant ; libellé du rang 1 posé. AVEC le Guide (il place ses libellés d'abord), l'encadré
//      peut être replié en une ligne : son explication dit alors tout ; sans le Guide, jamais ;
//   2. SURVOL du libellé du rang 1 → son explication (la base du hasard en expert seulement) ;
//      DOIGT (390 px) : un tap sur le libellé (ou l'encadré replié) → l'explication, un 2e tap la retire ;
//   3. FICHIER D'ATTENTE : une ligne, la note du fichier ; FICHIER ABSENT : « pas de fichier
//      lisible (HH:MM UTC) » ; rien d'autre n'est dessiné ;
//   4. MASQUÉ dans le menu : plus rien, choix gardé (samsara-scenarios-v1) ;
//   5. HEURE À RETENIR ET AGITATION (revue du 14/10/2026, N4 ; Q3 de Lorenzo : « Les deux ») : le
//      trait du CPI (L'essentiel : sans nom, touchable, budget des textes du départ inchangé ; Le
//      détail : nommé et dans la liste), sa bulle ; l'agitation attendue, sans sens, avec sa source
//      et son heure, dans la bulle des scénarios et dans « En résumé » ; le FOMC lu, pas dessiné ;
//      sans les deux clés (fichier d'avant), rien de tout cela.
// Binance simulé (bougies déterministes autour de 86 000) ; tests/fixtures/previsions.json
// décalé pour que le point du matin tombe 3 h avant maintenant.
// Sans Playwright : « non exécuté », dit à l'écran (ce n'est pas un succès).
// USAGE   node tests/test_scenarios_page.js
const fs = require('fs'), path = require('path'), http = require('http');
const REPO = path.resolve(__dirname, '..');
const { previsionsFixture, previsionsAttente, estPrevisions } = require('./previsions-fixture');
const Fm = require(path.join(REPO, 'js/format.js'));
const Sc = require(path.join(REPO, 'js/scenarios.js'));
const Guide = require(path.join(REPO, 'js/guide.js'));

let playwright = null;
for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright', process.env.PLAYWRIGHT_MODULE].filter(Boolean)) {
  try { playwright = require(p); break; } catch (e) { /* suivant */ }
}
if (!playwright) {
  console.log('  − NON EXÉCUTÉ : Playwright introuvable — les scénarios ne sont pas vérifiés à l\'écran sur ce poste.');
  process.exit(0);
}
let ko = 0;
const check = (nom, ok, det) => { if (!ok) ko++; console.log(`  ${ok ? '✓' : '✗'} ${nom}${!ok && det !== undefined ? ' — ' + JSON.stringify(det).slice(0, 500) : ''}`); };
const titre = t => console.log(`\n── ${t} ──`);

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
const LU = new Date(Math.floor(Date.now() / 60000) * 60000).toISOString().replace('.000Z', '+00:00');
const md = JSON.parse(fs.readFileSync(path.join(REPO, 'market-data.json'), 'utf8'));
md.updated = LU;
const MD = JSON.stringify(md);

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2' };
const serveur = http.createServer((req, res) => {
  const f = path.join(REPO, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(REPO) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

/** prev : 'complet' | 'attente' | 'absent' | 'hier' (point 26 h avant maintenant, rangs 1 à 3 finis) |
 *  'ferme' (le rang 1 invalidé en direct : cibles 89 000 puis 90 000, invalidation 86 000) |
 *  'sansAgitation' (le fichier complet d'avant le 14/10/2026 : ni « ampleur » ni « moments ») ;
 *  sansGuide : le Guide masqué. */
async function ouvrir(nav, vue, mode, prev, tactile, sansGuide) {
  const ctx = await nav.newContext(Object.assign({ viewport: vue, deviceScaleFactor: 1 }, tactile ? { hasTouch: true, isMobile: true } : {}));
  const page = await ctx.newPage();
  const erreurs = [];
  page.on('pageerror', e => erreurs.push(e.message));
  await page.route('**/*', r => {
    const u = r.request().url(), h = new URL(u).host, cors = { 'access-control-allow-origin': '*' };
    if (h.startsWith('127.0.0.1')) return r.continue();
    if (h === 'api.binance.com') return r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(binance(u)) });
    if (h === 'raw.githubusercontent.com') {
      if (estPrevisions(u)) {
        if (prev === 'absent') return r.fulfill({ status: 404, headers: cors, body: '' });
        const ferme = d => { const s = d.scenarios.find(x => x.rang === '1'); s.cibles = [89000, 90000]; s.invalidation = 86000; s.origines = {}; };
        return r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: prev === 'attente' ? previsionsAttente()
          : previsionsFixture(prev === 'hier' ? { ilYaMs: 26 * 3600e3 } : prev === 'ferme' ? { modifier: ferme } : prev === 'sansAgitation' ? { sansAgitation: true } : {}) });
      }
      if (u.includes('heatmap')) return r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: fs.readFileSync(path.join(REPO, 'heatmap.json')) });
      if (/\/master\/market-data\.json/.test(u)) return r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: MD });
      return r.fulfill({ status: 404, headers: cors, body: '' });
    }
    return r.abort();
  });
  await page.addInitScript(([m, sg]) => { try { localStorage.clear(); localStorage.setItem('samsara-theme', 'aero'); localStorage.setItem('samsara-mode', m); if (sg) localStorage.setItem('samsara-guide-v1', '0'); } catch (e) { /* */ } }, [mode, !!sansGuide]);
  await page.goto(`http://127.0.0.1:${serveur.address().port}/index.html`);
  await page.waitForFunction(() => typeof scenEtat !== 'undefined' && scenEtat && scenEtat.boite && (previsions || previsionsEchec), null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(500);
  return { ctx, page, erreurs };
}

const etat = page => page.evaluate(() => {
  const S = scenEtat, b = canvas.getBoundingClientRect();
  if (!S) return null;
  return {
    bx: b.left, by: b.top, vw: window.innerWidth, top: S.g.pad.top, ph: S.g.ph, left: S.g.pad.left, xMax: S.xMax,
    items: S.items.map(i => ({ rang: i.sc.rang, et: i.et.texte })), point: PARAM.scenarios.point,
    boite: S.boite ? { x: S.boite.x, y: S.boite.y, w: S.boite.w, h: S.boite.h, seule: S.boite.seule, replie: S.boite.replie, serre: S.boite.serre, lignes: S.boite.lignes.map(l => l.t) } : null,
    libelles: (S.libelles || []).slice(), mainH: geo && geo.mainH,
    // Les flèches des scénarios et les tracés du Guide (chemins conditionnels, formes).
    fleches: S.cibles.filter(c => c.prio === 2 && c.segs && c.segs.length).map(c => ({ titre: c.titre, segs: c.segs })),
    guideSegs: guideEtat && overlays.guide ? [].concat(...guideEtat.cibles.map(c => c.segs || [])) : [],
    reperes: S.items.map(i => ({ rang: i.sc.rang, n: i.reperes || 0, fleche: !!i.fleche })),
    cibles: S.cibles.map(c => ({ prio: c.prio, titre: c.titre, rects: c.rects || [], texte: c.texte, segs: (c.segs || []).length })),
    groupe: previsions && previsions.groupe, itv: S.itv, ouverts: S.items.map(i => i.ouvert),
    // Les bougies les plus récentes (le quart de la vue, au moins 3) : leurs rectangles à l'écran.
    recentes: (() => { const g = S.g, n = Math.max(3, Math.ceil(g.n * 0.25)), out = [];
      for (let i = Math.max(g.vs, g.ve - n); i < g.ve; i++) { const c = candles[i]; out.push({ x0: g.pad.left + g.gap * (i - g.vs), x1: g.pad.left + g.gap * (i - g.vs) + g.candleW, y0: S.yDe(c.high), y1: S.yDe(c.low) }); }
      return out; })(),
  };
});

(async () => {
  await new Promise(r => serveur.listen(0, '127.0.0.1', r));
  const nav = await playwright.chromium.launch();
  try {
    // Mode Expert : l'encadré complet (titre, une ligne par rang, bilan) et les libellés de chaque
    // rang sont des éléments denses, réservés à l'Expert. En Débutant, une seule ligne d'état et le
    // libellé du rang 1 : vérifiés dans test_debutant_page.js (classement de Claude sans
    // pourcentage, base du hasard absente, bulle au survol et au toucher).
    for (const [vue, mode, sansGuide] of [[{ width: 1440, height: 900 }, 'expert'], [{ width: 1024, height: 760 }, 'expert'],
      [{ width: 390, height: 800 }, 'expert'], [{ width: 1024, height: 760 }, 'expert', true], [{ width: 390, height: 800 }, 'expert', true]]) {
      const nom = vue.width + ' px · ' + mode + (sansGuide ? ' · Guide masqué' : '');
      titre(nom + ' · fichier complet');
      const o = await ouvrir(nav, vue, mode, 'complet', false, sansGuide);
      if (process.env.SCEN_CAPTURES) await o.page.screenshot({ path: path.join(process.env.SCEN_CAPTURES, vue.width + '-' + mode + (sansGuide ? '-sans-guide' : '') + '.png') });
      const e = await etat(o.page);
      if (!e) { check(`${nom} : la couche des scénarios est préparée`, false); await o.ctx.close(); continue; }
      check(`${nom} : 4 scénarios suivis (1, 2, 3, semaine)`, e.items.map(i => i.rang).join() === '1,2,3,S', e.items);
      // Le point du matin (PARAM.scenarios.point, heure de la routine) du jour du fichier, dit à
      // l'heure de l'appareil (Node et Chromium lisent le même fuseau).
      const tp = Sc.pointMs(e.groupe, e.point), B = e.boite, titreB = 'Scénarios du matin · ' + Fm.jour(tp) + ' ' + Fm.heure(tp);
      // L'encadré ne couvre jamais les bougies récentes, ni des bougies au milieu du tracé : sous
      // 1400 px (bougies simulées sur toute la hauteur), il tient ou il est replié en une ligne qui
      // nomme le rang 1 si la ligne le permet, et dont l'explication dit tout.
      // Avec « Le détail » (option A du 11/10/2026), l'encadré est replié en une ligne à toutes les
      // largeurs : le tableau entier est dans son explication et dans la liste « Sur le graphique ».
      const repliable = true;
      check(`${nom} : encadré replié en une ligne (le tableau entier dans son explication)`, B && B.replie, B);
      if (B && B.serre) {
        check(`${nom} : encadré serré : les états de tous les rangs sur une ligne (« ${mode === 'expert' ? 'En direct' : 'Suivi en direct'} : 1 · … | Sem. · … »)`,
          B.lignes.some(l => /^(Suivi en direct|En direct|Note du journal|Journal) : 1 · /.test(l)) && /Sem\. · /.test(B.lignes.join(' ')), B.lignes);
        if (mode === 'debutant') check(`${nom} : encadré serré, débutant : « sans pourcentage » dans l’encadré même`, /sans pourcentage/.test(B.lignes.join(' ')), B.lignes);
      }
      // Les flèches des scénarios ne croisent ni ne longent un tracé du Guide (départ commun exclu).
      const pres = e.fleches.map(f => {
        const p0 = f.segs[0];
        for (const sg of f.segs) for (let j = 0; j <= 20; j++) {
          const x = sg[0] + (sg[2] - sg[0]) * j / 20, y = sg[1] + (sg[3] - sg[1]) * j / 20;
          if (Math.hypot(x - p0[0], y - p0[1]) <= 16) continue;
          for (const g of e.guideSegs) {
            const dx = g[2] - g[0], dy = g[3] - g[1], l2 = dx * dx + dy * dy, t = l2 ? Math.max(0, Math.min(1, ((x - g[0]) * dx + (y - g[1]) * dy) / l2)) : 0;
            if (Math.hypot(x - g[0] - t * dx, y - g[1] - t * dy) < 4.5) return [f.titre, x, y];
          }
        }
        return null;
      }).filter(Boolean);
      check(`${nom} : aucune flèche de scénario sur un chemin du Guide (${e.fleches.length} flèche(s), ${e.guideSegs.length} tracé(s) du Guide)`, !pres.length, pres);
      // Replié en une ligne, ou serré (titre et états sur une ligne) : l'explication de l'encadré dit le reste.
      const expl = B && (B.replie || B.serre) ? (e.cibles.find(c => c.titre === titreB && c.prio === 0) || {}).texte || [] : [];
      const L = B ? (B.replie ? [B.lignes[0]].concat(expl) : B.serre ? B.lignes.concat(expl) : B.lignes) : [];
      check(`${nom} : titre « ${titreB} »${repliable ? ' (replié : ou « Scénario 1 … »)' : ''}, sans « UTC » ni « Paris »`, B && Number.isFinite(tp) && (B.lignes[0].startsWith(titreB) || (B.replie && /^Scénarios?( 1)?\b/.test(B.lignes[0]))) && !/UTC|Paris/.test(B.lignes[0]), B && B.lignes[0]);
      check(`${nom} : l'encadré ne couvre aucune des bougies les plus récentes${B && B.replie ? ' (sauf ligne épinglée faute de place)' : ''}`,
        B && (B.replie || !e.recentes.some(c => c.x1 > B.x && c.x0 < B.x + B.w && c.y1 > B.y && c.y0 < B.y + B.h)), [B, e.recentes.slice(-3)]);
      check(`${nom} : une ligne par scénario, marquée 1., 2., 3., Semaine${B && (B.replie || B.serre) ? ' (dans l’explication de l’encadré ' + (B.replie ? 'replié' : 'serré') + ')' : ''}`, ['1. ', '2. ', '3. ', 'Semaine : '].every(m => L.some(l => l.startsWith(m))), L);
      check(`${nom} : encadré dans le tracé ${B && B.replie ? '' : '(dans sa moitié haute) '}et dans l'écran`, B && B.x >= e.left && B.x + B.w <= e.xMax + 0.5 && B.y >= e.top
        && B.y + B.h <= e.top + (B.replie ? e.ph : e.ph / 2 + 0.5) && e.bx + B.x + B.w <= e.vw, [B, e.left, e.xMax, e.top, e.ph]);
      const texte = L.join(' ');
      // Branches « debutant » : ce fichier n'ouvre plus l'encadré dense qu'en Expert (le Débutant
      // n'a plus d'encadré, une seule ligne). Leurs équivalents Débutant sont dans
      // tests/test_debutant_page.js : bulles du libellé et de la ligne (« Claude, une IA »,
      // « sans pourcentage », aucun « % »), aucun « % » sur le tracé, ligne marquée « (en direct) ».
      if (mode === 'debutant') {
        check(`${nom} : le classement est dit de Claude (une IA), sans pourcentage`, /Class(ement de|é par) Claude \((une )?IA\)[^]*[Ss]ans pourcentage/.test(texte), L);
        check(`${nom} : aucun « % » dans l'encadré ni dans les libellés`, !/%/.test(B.lignes.join(' ')) && !e.cibles.some(c => /%/.test(c.titre || '')), L);
      }
      check(`${nom} : bilan « Ordre du premier mouvement … 0 fois sur 1 matin · échantillon faible »`, /Ordre du (premier|1er) mouvement/.test(texte) && /échantillon faible/.test(texte), L);
      check(`${nom} : « suivi en direct » dit`, /[Ss]uivi en direct/.test(texte), L);
      // Libellé du rang 1 et survol.
      // Le rang 1 passe devant les libellés du Guide : nommé sur le graphique (au téléphone, au
      // moins par la ligne repliée, sans toucher), et jamais seul sans nom quand un autre rang en a un.
      const lib = e.cibles.find(c => c.prio === 1 && c.rects.length && /\(rang\s1\)/.test(c.titre));
      const autres = e.cibles.filter(c => c.prio === 1 && c.rects.length && /\(rang\s[23]\)|^Scénario de la semaine|^Sem\./.test(c.titre));
      const vuSansToucher = !!lib || (vue.width < 500 && B && B.replie && /Scénario 1\b| 1\. /.test(B.lignes[0]));
      check(`${nom} : rang 1 nommé sur le graphique sans toucher${vue.width < 500 ? ' (libellé, ou ligne repliée qui le nomme)' : ' (libellé posé)'}`, vuSansToucher, [B && B.lignes[0], e.cibles.map(c => [c.prio, c.titre])]);
      check(`${nom} : jamais un autre rang nommé quand le rang 1 ne l’est pas`, !!lib || !autres.length, autres.map(c => c.titre));
      if (lib) {
        const r = lib.rects[0], x = e.bx + (r.x0 + r.x1) / 2, y = e.by + (r.y0 + r.y1) / 2;
        await o.page.mouse.move(x - 12, y - 4); await o.page.mouse.move(x, y, { steps: 3 }); await o.page.waitForTimeout(150);
        const s = await o.page.evaluate(() => (scenEtat.survol ? { titre: scenEtat.survol.titre, texte: scenEtat.survol.texte } : null));
        check(`${nom} : survol du libellé du rang 1 → son explication`, s && s.titre === lib.titre && s.texte.some(l => /^Rang 1 : /.test(l)), s);
        const base = s && s.texte.filter(l => /hasard/i.test(l));
        check(`${nom} : base du hasard ${mode === 'expert' ? 'dite « hasard pur (modèle), pas une estimation »' : 'absente (débutant)'}`,
          s && (mode === 'expert' ? base.length === 1 && /^Base hasard pur \(modèle\), pas une estimation : /.test(base[0]) : base.length === 0), base);
        await o.page.mouse.move(2, 2);
      }
      check(`${nom} : aucune erreur JavaScript`, !o.erreurs.length, o.erreurs);
      await o.ctx.close();
    }

    titre('Doigt (390 px, écran tactile) : un tap sur le libellé du rang 1 (ou sur l’encadré replié)');
    {
      // Mode Expert : le libellé du rang 1 du fichier complet (déjà invalidé) et l'encadré replié
      // n'existent qu'en Expert ; le toucher en Débutant est vérifié dans test_debutant_page.js.
      const t = await ouvrir(nav, { width: 390, height: 800 }, 'expert', 'complet', true);
      const e = await etat(t.page);
      const c = e && (e.cibles.find(q => q.prio === 1 && q.rects.length && /\(rang\s1\)/.test(q.titre))
        || (e.boite && e.boite.replie ? e.cibles.find(q => q.prio === 0 && q.rects.length && /^Scénarios du matin/.test(q.titre)) : null));
      if (!c) check('un libellé du rang 1 (ou l’encadré replié) à toucher', false, e && e.cibles.map(q => [q.prio, q.titre]));
      else {
        const r = c.rects[0], x = e.bx + (r.x0 + r.x1) / 2, y = e.by + (r.y0 + r.y1) / 2;
        await t.page.touchscreen.tap(x, y); await t.page.waitForTimeout(200);
        const apres = await t.page.evaluate(() => (scenEtat.survol ? scenEtat.survol.titre : null));
        check('tap → son explication (bulle partagée avec le Guide) : « ' + c.titre + ' »', apres === c.titre, { apres, attendu: c.titre });
        // Une bulle en trois niveaux, avec ou sans « Le détail » (option A, 11/10/2026) : le 2e tap
        // ouvre son détail, le 3e la retire.
        await t.page.touchscreen.tap(x, y); await t.page.waitForTimeout(200);
        const detail = await t.page.evaluate(() => ({ survol: scenEtat.survol ? scenEtat.survol.titre : null, bulleDetail }));
        check('… un 2e tap ouvre son détail (même bulle)', detail.survol === c.titre && detail.bulleDetail !== null, detail);
        await t.page.touchscreen.tap(x, y); await t.page.waitForTimeout(200);
        const retire = await t.page.evaluate(() => ({ survol: scenEtat.survol, crossX }));
        check('… un 3e tap au même endroit la retire', retire.survol === null && retire.crossX === null, retire);
        // Revue du 14/10/2026 : au téléphone, la bulle en détail peut couvrir le point touché (ni
        // dessous ni dessus n'ont sa hauteur ; selon l'heure, le libellé est plus ou moins haut) ;
        // le 3e toucher au même endroit la retirait seulement quand elle ne le couvrait pas. Ici, la
        // bulle est posée par-dessus le point : le contrôle ne dépend plus de l'heure.
        const force = await t.page.evaluate(([x, y]) => {
          crossX = null; crossY = null; bulleDetail = null; dessinerCalque();
          const R = canvas.getBoundingClientRect(), tx = x - R.left, ty = y - R.top;
          const couvrir = () => { lienBulle = null; if (bulleOuverte) Object.assign(bulleOuverte, { x: Math.max(0, tx - 60), y: Math.max(0, ty - 30), w: 200, h: 160 }); };
          tapGraphique(x, y); tapGraphique(x, y);   // l'explication, puis son détail
          const detail = bulleDetail;
          couvrir();
          const couvre = !!bulleOuverte && tx >= bulleOuverte.x && tx <= bulleOuverte.x + bulleOuverte.w && ty >= bulleOuverte.y && ty <= bulleOuverte.y + bulleOuverte.h;
          tapGraphique(x + 30, y + 40); couvrir();   // ailleurs dans la bulle : on lit, rien ne bouge
          const lit = { crossX, bulleDetail };
          tapGraphique(x, y);                        // au point même : retirée
          return { detail, couvre, lit, tx, apres: { crossX, survol: scenEtat.survol ? scenEtat.survol.titre : null } };
        }, [x, y]);
        check('… bulle en détail par-dessus le point touché : un toucher ailleurs dans la bulle la laisse, un 3e tap au point même la retire',
          force.detail !== null && force.couvre && force.lit.crossX === force.tx && force.lit.bulleDetail !== null && force.apres.crossX === null && force.apres.survol === null, force);
      }
      check('écran tactile : aucune erreur JavaScript', !t.erreurs.length, t.erreurs);
      await t.ctx.close();
    }

    titre('Rang 1 fermé (invalidé en direct), téléphone : son état reste dit ; la bulle tient dans l’écran');
    // Mode Expert : le libellé d'état du rang 1 et l'encadré (« · direct ») sont ceux de l'Expert ; en
    // Débutant, la ligne « Scénario 1 : invalidé ✗ (en direct) ▸ » et sa bulle dans le tracé sont
    // vérifiées dans test_debutant_page.js (1440, 390 et 375 px).
    for (const [vue, mode, tactile] of [[{ width: 390, height: 800 }, 'expert', true], [{ width: 375, height: 667 }, 'expert', true], [{ width: 1024, height: 760 }, 'expert', false]]) {
      const nom = vue.width + '×' + vue.height + ' · ' + mode;
      const o = await ouvrir(nav, vue, mode, 'ferme', tactile);
      if (process.env.SCEN_CAPTURES) await o.page.screenshot({ path: path.join(process.env.SCEN_CAPTURES, 'ferme-' + vue.width + '-' + mode + '.png') });
      const e = await etat(o.page);
      const un = e && e.items.find(i => i.rang === '1');
      check(`${nom} : le rang 1 est fermé en direct (invalidation d’abord)`, un && /^invalidation touchée d’abord/.test(un.et), un);
      const lib = e && e.libelles.find(l => l.rang === '1');
      const B = e && e.boite;
      // Un rang 1 fermé n'est jamais nommé par ses niveaux seuls : son libellé, ou la ligne repliée, dit son état.
      const marque = mode === 'expert' ? / · direct$/ : / \(en direct\)$/;
      check(`${nom} : libellé du rang 1 fermé = son état, marqué « ${mode === 'expert' ? '· direct' : '(en direct)'} » (jamais les niveaux seuls)`,
        lib ? marque.test(lib.t) && /invalid/.test(lib.t) : !!(B && B.replie && /Scénario 1\b.*invalid.*direct/.test(B.lignes[0])), [lib, B && B.lignes[0]]);
      if (B && B.replie && /Scénario 1\b/.test(B.lignes[0])) check(`${nom} : ligne repliée qui nomme le rang 1 : son état, marqué en direct`, /invalid.*direct/.test(B.lignes[0]), B.lignes[0]);
      // Un tap (ou survol) sur l'encadré : la bulle tient dans le tracé, l'avertissement compris
      // (revue du 14/10/2026, C19 : « Une hypothèse de Claude (une IA), pas un conseil. », celui de la
      // charte, plus « pas une recommandation »).
      const c = e && e.cibles.find(q => q.prio <= 1 && q.rects.length && /^Scénarios/.test(q.titre));
      if (!c) check(`${nom} : l’encadré à toucher`, false, e && e.cibles.map(q => [q.prio, q.titre]));
      else {
        const r = c.rects[0], x = e.bx + (r.x0 + r.x1) / 2, y = e.by + (r.y0 + r.y1) / 2;
        if (tactile) await o.page.touchscreen.tap(x, y); else { await o.page.mouse.move(x - 8, y - 2); await o.page.mouse.move(x, y, { steps: 3 }); }
        await o.page.waitForTimeout(250);
        // D'abord le résumé, qui mène au détail ; un 2e toucher (ou un clic) ouvre le détail.
        const b0 = await o.page.evaluate(() => (scenEtat && scenEtat.bulle ? scenEtat.bulle : null));
        // « tout lire » : « Le détail » est réservé au nom de la case (revue du 14/10/2026, M9).
        check(`${nom} : la bulle de l’encadré s’ouvre sur son résumé, qui mène au détail (« ${tactile ? 'Touchez encore' : 'Cliquez'} : tout lire »)`, b0 && /(Touchez encore|Cliquez) : tout lire/.test(b0.corps.join(' ')), b0 && b0.corps);
        if (tactile) await o.page.touchscreen.tap(x, y); else await o.page.mouse.click(x, y);
        await o.page.waitForTimeout(250);
        const b = await o.page.evaluate(() => (scenEtat && scenEtat.bulle ? scenEtat.bulle : null));
        const vu = b ? b.corps.join(' ') : '';
        check(`${nom} : bulle de l’encadré dans le tracé (haut ≥ 0, bas ≤ ${e.mainH} px)`, b && b.y >= 0 && b.y + b.h <= e.mainH, b && { y: b.y, h: b.h, mainH: e.mainH });
        check(`${nom} : la bulle MONTRE le suivi en direct, la note du journal et « Une hypothèse de Claude (une IA), pas un conseil. »`, /en direct/i.test(vu) && /journal/.test(vu)
          && /Une hypothèse de Claude \(une IA\), pas un conseil\./.test(vu.replace(/\s+/g, ' ')) && !/pas une recommandation/.test(vu), b && b.corps);
      }
      check(`${nom} : aucune erreur JavaScript`, !o.erreurs.length, o.erreurs);
      await o.ctx.close();
    }

    titre('Changement d’intervalle, groupe terminé');
    {
      const o = await ouvrir(nav, { width: 1440, height: 900 }, 'debutant', 'complet');
      await o.page.click('#int_1h'); await o.page.waitForTimeout(800);
      const e = await etat(o.page);
      check('clic sur 1h : aucune erreur JavaScript (changeInterval)', !o.erreurs.length, o.erreurs);
      check('clic sur 1h : la couche est refaite sur les bougies 1 h', e && e.itv === '1 h' && e.items.length === 4, e && [e.itv, e.items.length]);
      await o.page.click('#int_4h'); await o.page.waitForTimeout(800);
      const e4 = await etat(o.page);
      check('clic sur 4h : pas de suivi sur des bougies trop larges (dit tel quel), aucune erreur', !o.erreurs.length && e4 && e4.items.filter(i => i.rang !== '3' || true).some(i => /bougies 4 h \(trop larges\)/.test(i.et)), [o.erreurs, e4 && e4.items]);
      await o.ctx.close();
      // Mode Expert : le titre de l'encadré complet est de l'Expert ; la ligne Débutant
      // (« Scénarios d’hier : terminés ▸ ») est vérifiée dans test_debutant_page.js.
      const h = await ouvrir(nav, { width: 1440, height: 900 }, 'expert', 'hier');
      const eh = await etat(h.page);
      check('groupe terminé : titre « Scénarios d’hier (terminés) · semaine en cours » (encadré complet ou replié)', eh && eh.boite && /^Scénarios d’hier \(terminés\) · semaine en cours/.test(eh.boite.lignes[0]), eh && eh.boite);
      check('groupe terminé : aucun scénario ouvert parmi les rangs 1 à 3, aucune flèche vers le futur', eh && eh.items.every((i, k) => i.rang === 'S' || !eh.ouverts[k])
        && !eh.cibles.some(c => c.prio === 2 && c.segs > 0 && !/^Scénario de la semaine/.test(c.titre)), eh && eh.cibles.filter(c => c.prio === 2).map(c => [c.titre, c.segs]));
      check('groupe terminé : aucune erreur JavaScript', !h.erreurs.length, h.erreurs);
      if (process.env.SCEN_CAPTURES) await h.page.screenshot({ path: path.join(process.env.SCEN_CAPTURES, 'hier-1440.png') });
      await h.ctx.close();
    }

    titre('Fichier d’attente, fichier absent : une ligne');
    {
      const note = JSON.parse(previsionsAttente()).note;
      // Mode Expert : les lignes « attente » et « absent » ci-dessous sont celles de l'Expert (heure
      // de l'appareil) ; leurs lignes Débutant sont vérifiées dans test_debutant_page.js.
      const a = await ouvrir(nav, { width: 1440, height: 900 }, 'expert', 'attente');
      const e = await etat(a.page);
      check('attente : une seule ligne « Scénarios du matin : » + la note du fichier', e && e.boite && e.boite.seule && e.boite.lignes.length === 1
        && e.boite.lignes[0] === 'Scénarios du matin : ' + note.charAt(0).toLowerCase() + note.slice(1), e && e.boite);
      check('attente : aucun scénario dessiné', e && e.items.length === 0 && await a.page.evaluate(() => scenDessinables() === null));
      check('attente : aucune erreur JavaScript', !a.erreurs.length, a.erreurs);
      await a.ctx.close();
      const z = await ouvrir(nav, { width: 390, height: 800 }, 'expert', 'absent');
      const ez = await etat(z.page);
      check('absent (404) : « Scénarios du matin : pas de fichier lisible (HH:MM) », à l\'heure de l\'appareil', ez && ez.boite && ez.boite.seule && /^Scénarios du matin : pas de fichier lisible \(\d\d:\d\d\)$/.test(ez.boite.lignes[0]), ez && ez.boite);
      check('absent : aucune erreur JavaScript', !z.erreurs.length, z.erreurs);
      await z.ctx.close();
    }

    titre('Heure à retenir (CPI) et agitation attendue (revue du 14/10/2026, N4 ; Q3 : « Les deux »)');
    {
      const EFFET = 'Souvent 2 à 4 fois plus agité pendant quelques heures, dans les deux sens.';
      const SENS = /hausse|baisse|monte|montée|descend|grimpe|chute|rebond|achet|vend/i;
      const motsN = x => x.split(/\s+/).filter(w => /[\p{L}\d]/u.test(w)).length;
      const lit = page => page.evaluate(() => {
        const S = scenEtat, R = syntheseLecture();
        const bo = S && ((S.boite && S.boite.cible) || S.cibles.find(c => c.ico === 'scenario' && c.prio <= 1 && /^Scénarios/.test(c.titre || '')));
        return {
          ag: ampleurTexte(), max: PARAM.guide.debutant.bulleMots,
          // La bulle de L'essentiel avec un seul scénario : la place de l'agitation dans le budget.
          seul: S && debutant() && S.items.length ? scenTexteLigneDebutant(Object.assign({}, S, { items: S.items.slice(0, 1) })) : null,
          lus: previsions && previsions.moments ? previsions.moments.map(m => m.nom) : null,
          cpi: S ? S.cibles.filter(c => c.moment).map(c => ({ moment: c.moment, ico: c.ico, titre: c.titre, texte: c.texte, rects: c.rects.length, segs: c.segs.map(q => q.slice()) })) : [],
          titres: S ? S.cibles.map(c => c.titre || '') : [], top: S && S.g.pad.top, ph: S && S.g.ph,
          boite: bo ? { texte: [].concat(bo.texte || []), court: bo.texteCourt ? [].concat(bo.texteCourt) : null } : null,
          resume: R ? R.pourquoi.map(p => ({ texte: p.texte, sens: p.sens, agitation: !!p.agitation })) : null,
          items: typeof debEtat !== 'undefined' && debEtat ? debEtat.items.map(i => ({ role: i.role, texte: i.texte })) : null,
          liste: [...document.querySelectorAll('#reperesListe button')].map(b => b.textContent),
        };
      });
      /** Le trait du CPI touché (doigt) ou survolé (souris) là où il est seul sous le doigt : sa bulle. */
      const toucherCpi = async (o, tactile) => {
        const pt = await o.page.evaluate(() => {
          const c = scenEtat.cibles.find(q => q.moment), s = c && c.segs[0], R = canvas.getBoundingClientRect();
          if (!s) return null;
          for (let k = 2; k < 30; k++) { const y = s[1] + (s[3] - s[1]) * k / 30; if (guideCibleSous(s[0] + 2, y, geo.mainH) === c) return { x: R.left + s[0] + 2, y: R.top + y }; }
          return null;
        });
        if (!pt) return null;
        if (tactile) await o.page.touchscreen.tap(pt.x, pt.y); else { await o.page.mouse.move(pt.x - 10, pt.y - 3); await o.page.mouse.move(pt.x, pt.y, { steps: 3 }); }
        await o.page.waitForTimeout(250);
        return o.page.evaluate(() => ({ survol: scenEtat.survol ? scenEtat.survol.titre : null, corps: scenEtat.bulle ? scenEtat.bulle.corps.join(' ') : '', titre: reperesBulleTitre }));
      };
      const sansSens = ph => ph.every(x => motsN(x) <= 15 && !Guide.motsBannis(x).length && !SENS.test(x));
      const rolesSans = {};
      for (const [vue, mode, tactile] of [[{ width: 1440, height: 900 }, 'debutant', false], [{ width: 390, height: 800 }, 'debutant', true], [{ width: 1440, height: 900 }, 'expert', false], [{ width: 390, height: 800 }, 'expert', true]]) {
        const nom = vue.width + ' px · ' + (mode === 'debutant' ? 'L’essentiel' : 'Le détail');
        // D'abord le fichier d'avant : rien de neuf ; la liste des textes du départ, pour comparer.
        const z = await ouvrir(nav, vue, mode, 'sansAgitation', tactile);
        const ez = await lit(z.page);
        rolesSans[nom] = ez.items && ez.items.map(i => i.role);
        check(`${nom} · sans « ampleur » ni « moments » : ni trait du CPI, ni ligne d’agitation (bulle des scénarios, En résumé)`,
          ez.ag === null && !ez.cpi.length && !(ez.lus || []).length && ez.boite && !ez.boite.texte.some(t => /Écart attendu|Une fois sur dix/.test(t))
          && !(ez.resume || []).some(p => p.agitation || /Écart attendu/.test(p.texte)) && !ez.titres.some(t => /CPI|inflation/i.test(t)), ez);
        check(`${nom} · sans les deux clés : aucune erreur JavaScript`, !z.erreurs.length, z.erreurs);
        await z.ctx.close();

        const o = await ouvrir(nav, vue, mode, 'complet', tactile);
        if (process.env.SCEN_CAPTURES) await o.page.screenshot({ path: path.join(process.env.SCEN_CAPTURES, 'cpi-' + vue.width + '-' + mode + '.png') });
        const e = await lit(o.page);
        // L'agitation : deux phrases, la source (le calcul du matin) et son heure ; 3,07 → 3,1 % ; 6,19 → 6,2 %.
        const ph = e.ag || [];
        check(`${nom} : l’agitation attendue, deux phrases sans sens, avec l’heure du calcul (« ${ph.join(' ')} »)`, ph.length === 2
          && /^Écart attendu entre plus bas et plus haut d’ici (demain |le \d\d\/\d\d )?\d\d:\d\d : en général 3,1 %\.$/.test(ph[0]) && /^Une fois sur dix, plus de 6,2 % \(calcul de \d\d:\d\d\)\.$/.test(ph[1]) && sansSens(ph), ph);
        if (mode === 'debutant') {
          // L'essentiel : la bulle garde son budget de mots hors avertissement (PARAM.guide.debutant.bulleMots,
          // revue du 14/10/2026, M6). L'agitation y entre entière, ou sa 1re phrase, si elle tient ;
          // sinon elle reste dans « En résumé », où N4 la demandait. Quatre scénarios (ce fichier)
          // prennent la place ; avec un seul, elle tient entière.
          const t = e.boite ? e.boite.texte : [], aG = t.filter(x => x === ph.join(' ') || x === ph[0]), mots = motsN(t.slice(0, -1).join(' '));
          check(`${nom} : dans la bulle des scénarios, au plus une fois et dans le budget (${mots} ≤ ${e.max} mots)`, ph.length && e.boite && aG.length <= 1 && mots <= e.max
            && (!e.boite.court || aG.every(x => e.boite.court.includes(x))), e.boite);
          check(`${nom} : avec un seul scénario, elle tient entière dans la bulle, en une ligne, avant l’avertissement`, ph.length && e.seul && e.seul.filter(x => x === ph.join(' ')).length === 1
            && e.seul.indexOf(ph.join(' ')) < e.seul.length - 1 && motsN(e.seul.slice(0, -1).join(' ')) <= e.max, e.seul);
        } else check(`${nom} : dans la bulle des scénarios${e.boite && e.boite.court ? ' (entière et courte)' : ''}, en une ligne`, ph.length && e.boite && e.boite.texte.filter(t => t === ph.join(' ')).length === 1
          && (!e.boite.court || e.boite.court.includes(ph.join(' '))), e.boite);
        const rAg = (e.resume || []).filter(p => p.agitation);
        check(`${nom} : dans « En résumé », la dernière ligne du pourquoi, sans sens`, rAg.length === 1 && rAg[0].texte === ph.join(' ') && rAg[0].sens === 0 && e.resume[e.resume.length - 1].agitation, e.resume);
        // Le trait du CPI : la famille « Heure à retenir », son nom entier dans la bulle, l'effet mesuré.
        const c = e.cpi[0];
        check(`${nom} : un trait du CPI, famille « Heure à retenir », de haut en bas du tracé (« ${c && c.titre} »)`, e.cpi.length === 1 && c.moment === 'CPI' && c.ico === 'moment'
          && /^Chiffres américains de l’inflation \(CPI\) · \d\d:\d\d$/.test(c.titre) && c.segs.length === 1 && c.segs[0][0] === c.segs[0][2] && c.segs[0][1] === e.top && Math.abs(c.segs[0][3] - (e.top + e.ph)) < 0.5, e.cpi);
        // L'avertissement partagé du Guide, le même dans les deux modes (revue du 14/10/2026, C19 :
        // plus de « pas une recommandation »).
        check(`${nom} : sa bulle dit l’effet mesuré, sans sens, puis « pas un conseil »`, c && c.texte[0] === EFFET
          && c.texte[1] === Guide.AVERTISSEMENT && sansSens([c.texte[0].replace('dans les deux sens', '')]), c && c.texte);
        check(`${nom} : le FOMC est lu, jamais dessiné`, e.lus && e.lus.includes('FOMC') && !e.titres.some(t => /FOMC|\bFed\b/.test(t)), [e.lus, e.titres]);
        if (mode === 'debutant') {
          // L'écran de départ : rien de permanent en plus. Le trait n'a pas de nom ; les textes du
          // budget (5 au plus) sont les mêmes qu'avec le fichier d'avant.
          check(`${nom} : le trait du CPI n’a aucun nom sur le tracé`, c && c.rects === 0, c);
          check(`${nom} : budget des textes du départ inchangé (${e.items && e.items.length} ≤ ${5}), aucun ne parle du CPI ni de l’agitation`, e.items && e.items.length <= 5
            && JSON.stringify(e.items.map(i => i.role)) === JSON.stringify(rolesSans[nom]) && !e.items.some(i => /CPI|inflation|Écart attendu|plus agité/i.test(i.texte)), [e.items, rolesSans[nom]]);
        } else {
          // Le détail : le nom posé si la place le permet (grand écran : toujours ici), et la ligne de la liste.
          if (vue.width >= 1024) check(`${nom} : le nom du CPI posé sur le tracé`, c && c.rects === 1, c);
          check(`${nom} : la liste « Sur le graphique » a sa ligne (« ${c && c.titre} »)`, c && e.liste.includes(c.titre), e.liste);
        }
        const b = c ? await toucherCpi(o, tactile) : null;
        check(`${nom} : ${tactile ? 'toucher' : 'survoler'} le trait ouvre sa bulle : son nom, l’effet`, b && b.survol === c.titre && b.titre === c.titre && b.corps.includes(EFFET), b);
        // Une autre paire : ni agitation (elle est mesurée sur BTC/USDT seulement), ni trait.
        const autre = await o.page.evaluate(() => { const s0 = activeSymbol; activeSymbol = 'ETHUSDT'; const r = { ag: ampleurTexte(), cpi: scenEtat ? scenMomentsVus(scenEtat).length : 0 }; activeSymbol = s0; return r; });
        check(`${nom} : sur une autre paire, ni agitation ni trait`, autre.ag === null && autre.cpi === 0, autre);
        check(`${nom} : aucune erreur JavaScript`, !o.erreurs.length, o.erreurs);
        await o.ctx.close();
      }
      // La fenêtre finie (fichier d'hier, non republié) : l'agitation n'est plus dite.
      const h = await ouvrir(nav, { width: 1440, height: 900 }, 'expert', 'hier');
      const eh = await lit(h.page);
      check('fichier d’hier (fenêtre de 24 h finie) : plus de ligne d’agitation, ni dans la bulle ni dans « En résumé »', eh.ag === null && eh.boite && !eh.boite.texte.some(t => /Écart attendu/.test(t)) && !(eh.resume || []).some(p => p.agitation), eh);
      check('fichier d’hier : aucune erreur JavaScript', !h.erreurs.length, h.erreurs);
      await h.ctx.close();
    }

    titre('Masqué dans le menu : plus rien, choix gardé');
    {
      const m = await ouvrir(nav, { width: 1440, height: 900 }, 'debutant', 'complet');
      const r = await m.page.evaluate(() => { toggleAny('scenarios'); return { etat: scenEtat, cle: localStorage.getItem('samsara-scenarios-v1'), marge: margeFutur(1000, 50) }; });
      check('masqué : plus d’encadré ni de libellé ; « samsara-scenarios-v1 » = 0', r.etat === null && r.cle === '0', r);
      // (le harnais vide le stockage à chaque chargement : la relecture se vérifie par la fonction même de init)
      check('relu au prochain chargement : masqué (scenariosMemorise() = false)', await m.page.evaluate(() => scenariosMemorise() === false));
      check('masqué : aucune erreur JavaScript', !m.erreurs.length, m.erreurs);
      await m.ctx.close();
    }
  } finally { await nav.close(); serveur.close(); }
  console.log(ko ? `\n❌ SCÉNARIOS À L'ÉCRAN : ${ko} contrôle(s) en échec` : '\n✅ SCÉNARIOS À L\'ÉCRAN : TOUS LES CONTRÔLES PASSENT');
  process.exit(ko ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
