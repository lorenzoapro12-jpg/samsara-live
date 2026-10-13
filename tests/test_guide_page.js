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
    bx: b.left, by: b.top, exp: E.exp, courtes: !!E.courtes,
    niveaux: E.niveaux.map(L => ({ visible: L.visible, titre: (E.cibles.find(c => c.niveau === L) || {}).titre || null, prix: L.niv.raisons.map(r => r.p), heures: L.niv.raisons.filter(r => isFinite(r.lu)).map(r => hh(r.lu)),
      lignes: L.etiq ? L.etiq.lignes : null, essentiel: !!L.essentiel, libelle: L.libelle, etiq: L.etiq ? { enLigne: L.etiq.enLigne, sansEtat: !!L.etiq.sansEtat } : null, sansPlace: (E.sansPlace || []).includes(L),
      auBord: E.cibles.some(c => c.niveaux && c.niveaux.includes(L) && c.rects.length) })),
    chemins: E.chemins || null, suite: { haut: !!E.D.suite.haut, bas: !!E.D.suite.bas },
    cibles: E.cibles.map(c => ({ prio: c.prio, titre: c.titre, rects: c.rects || [] })),
    // Les étiquettes du bord posées : leurs lignes, et l'heure de CHAQUE chiffre publié qu'elles nomment.
    bords: E.cibles.filter(c => c.niveaux && c.rects.length).map(c => ({ lignes: c.lignes, titre: c.titre,
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
      check(`${nom} : avec « Le détail », les repères sont courts sur le tracé à cette largeur aussi`, e.courtes === true, e.courtes);
      // Avec « Le détail », à toutes les largeurs (option A du 11/10/2026) : sur le tracé, un repère
      // court d'une ligne (la plage) ; le libellé entier, heures comprises, est le titre de sa bulle
      // (et une ligne de la liste « Sur le graphique », vérifiée plus bas).
      if (e.courtes) {
        // L'essentiel (option A) : la bande la plus proche du prix de chaque côté garde son libellé
        // entier (ou sa forme la plus longue qui tient), en gras ; les autres sont des repères courts.
        const ess = vis.filter(L => L.essentiel), aut = vis.filter(L => !L.essentiel && L.lignes);
        check(`${nom} : l'essentiel — une ou deux bandes (la plus proche de chaque côté du prix), libellé de plus de 24 caractères ou entier`, ess.length >= 1 && ess.length <= 2 && ess.every(L => !L.lignes || L.lignes.join(' ').length > 24 || L.lignes.join(' ') === L.libelle), ess.map(L => [L.lignes, L.libelle]));
        check(`${nom} : repères courts — chaque autre libellé de bande tient sur une ligne de 24 caractères au plus, sans « … »`, aut.every(L => L.lignes.length === 1 && L.lignes[0].length <= 24 && !/…/.test(L.lignes[0])), aut.map(L => L.lignes));
        check(`${nom} : la bulle de chaque bande posée qui porte un chiffre publié garde son heure (« ${HM} »)`, pub.length > 0 && pub.every(L => L.titre && L.heures.every(h => L.titre.includes(h))), pub.map(L => [L.titre, L.heures]));
      } else
      check(`${nom} : chaque libellé posé qui porte un chiffre publié garde son heure (« ${HM} »), sans « … »`, pub.length > 0 && pub.every(L => L.heures.every(h => L.lignes.join(' ').includes(h)) && !/…/.test(L.lignes.join(' '))), pub);
      // … et l'étiquette du bord aussi : une heure par chiffre publié nommé, rien de coupé.
      const nFois = (t, h) => t.split(h).length - 1;
      const bordsPub = e.bords.filter(b => b.heures.length);
      if (e.courtes) check(`${nom} : repères courts — chaque étiquette du bord tient sur une ligne ; sa bulle garde chaque heure publiée (${bordsPub.length})`,
        e.bords.every(b => Array.isArray(b.lignes) && b.lignes.length === 1) && bordsPub.every(b => b.heures.every(h => nFois(b.titre, h) >= b.heures.filter(x => x === h).length)), e.bords);
      else check(`${nom} : chaque étiquette du bord qui nomme un chiffre publié garde chaque heure, sans « … » (${bordsPub.length})`,
        bordsPub.every(b => Array.isArray(b.lignes) && b.heures.every(h => nFois(b.lignes.join(' '), h) >= b.heures.filter(x => x === h).length) && !/…/.test(b.lignes.join(' '))), bordsPub);
      // 2. Les deux chemins, ensemble, dans la même variante, chacun avec sa condition.
      const ch = e.chemins;
      const boites = ch ? ch.boites : [];
      check(`${nom} : « Et ensuite ? » rendu pour les DEUX côtés (deux boîtes, ou une commune) — jamais un seul`, ch && ch.variante && (ch.variante === 'commune' ? boites.length === 1 && boites[0].lignes.length === 2 : boites.length === 2 && boites.some(b => b.sens > 0) && boites.some(b => b.sens < 0)), ch);
      const conditionnel = l => /^(Si clôt|si [<>]|[↑↓] aucun|Si clôture)/.test(l);
      // Repères courts : la cible au bout de la flèche (« ↑ 86 330 ») ; la condition est dans la bulle.
      if (e.courtes) {
        const tc = e.cibles.filter(c => c.prio === 3 && /^Et ensuite \?/.test(c.titre)).map(c => c.titre);
        check(`${nom} : repères courts — chaque chemin dit sa cible en une ligne (« ↑ … », « ↓ … ») ; sa bulle garde la condition (« Si clôture … »)`,
          boites.length && boites.every(b => b.lignes.every(l => /^[↑↓] /.test(l))) && tc.length && tc.every(t => /Si clôture/.test(t)), { lignes: boites.map(b => b.lignes), tc });
      } else
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
      // La liste « Sur le graphique » : avec « Le détail », à toutes les largeurs ; une ligne par repère (le
      // titre entier de sa bulle) ; toucher une ligne ouvre la bulle de ce repère sur le graphique.
      const li = await o.page.evaluate(() => {
        const sec = document.getElementById('reperesSection'), lignes = [...document.querySelectorAll('#reperesListe button')].map(b => b.textContent);
        const titres = [...new Set(guideEtat.cibles.concat(scenEtat ? scenEtat.cibles : []).filter(c => c.titre && !c.evenement && [c.rects, c.zones, c.segs].some(x => x && x.length)).map(c => c.titre))];
        return { visible: !sec.hidden && sec.getBoundingClientRect().height > 30, lignes, titres, barre: document.getElementById('reperesTitre').textContent };
      });
      if (!e.courtes) check(`${nom} : pas de liste « Sur le graphique » (les étiquettes sont entières sur le tracé)`, !li.visible, li.barre);
      else {
        check(`${nom} : la liste « Sur le graphique » est là, avec une ligne par repère du tracé (${li.lignes.length}) et le libellé entier de chaque bande`,
          li.visible && li.lignes.length > 3 && li.titres.every(t => li.lignes.includes(t)) && pub.every(L => li.lignes.includes(L.titre)),
          { barre: li.barre, manquants: li.titres.filter(t => !li.lignes.includes(t)).concat(pub.map(L => L.titre).filter(t => !li.lignes.includes(t))) });
        // Grand écran (> 768 px) : la liste est une colonne à droite du graphique, ouverte d'office
        // dès PARAM.guide.colonne (1280 px), repliée en onglet en dessous ; toucher une ligne ouvre
        // la bulle et la colonne reste ouverte. Téléphone : une barre sous le graphique, que toucher
        // une ligne referme.
        const enColonne = vue.width > 768;
        if (enColonne) {
          const col0 = await o.page.evaluate(() => ({ colonne: document.getElementById('reperesSection').classList.contains('colonne'), repliee: document.getElementById('reperesSection').classList.contains('collapsed') }));
          check(`${nom} : la liste est une colonne à droite, ${vue.width >= 1280 ? 'ouverte d\'office' : 'repliée en onglet'}`, col0.colonne && col0.repliee === (vue.width < 1280), col0);
          if (col0.repliee) { await o.page.click('#reperesHandle'); await o.page.waitForTimeout(300); }
        } else { await o.page.click('#reperesHandle'); await o.page.waitForTimeout(200); }
        const ouverte = await o.page.evaluate(() => { const r = document.getElementById('reperesListe').getBoundingClientRect(); return r.height > 40 && r.top >= 0 && r.bottom <= innerHeight + 1; });
        const barre = await o.page.evaluate(() => document.getElementById('reperesTitre').textContent);
        check(`${nom} : le titre de la liste ouverte compte les repères (« ${barre} »)`, enColonne ? /^Sur le graphique · \d+ repères$/.test(barre) : /^Lire les \d+ repères en entier$/.test(barre), barre);
        // « En résumé » : en tête de la liste, la phrase en gras, le pourquoi, les repères à surveiller,
        // l'avertissement unique ; au téléphone, la phrase est aussi sur la barre (lisible sans toucher).
        const sy = await o.page.evaluate(() => {
          const el = document.getElementById('synthese'), premier = document.querySelector('#reperesListe > li'), r = el && el.getBoundingClientRect();
          const res = document.getElementById('reperesResume');
          return el && { premier: premier === el, titre: el.querySelector('.synthese-titre').textContent, gras: +getComputedStyle(el.querySelector('.synthese-titre')).fontWeight,
            pourquoi: el.querySelectorAll('.synthese-liste')[0] ? el.querySelectorAll('.synthese-liste')[0].children.length : 0, texte: el.innerText,
            dansEcran: r.height > 60 && r.top >= 0 && r.bottom <= innerHeight + 1, barre: res && !res.hidden ? res.textContent : null };
        });
        check(`${nom} : « En résumé » en tête de la liste, visible, la phrase en gras, le pourquoi et l'avertissement`, sy && sy.premier && sy.dansEcran && sy.gras >= 700 && sy.pourquoi >= 1
          && /Une description, pas un conseil\./.test(sy.texte) && !/%/.test(sy.texte) && (enColonne ? sy.barre === null : sy.barre === sy.titre), sy);
        // La colonne ouverte rétrécit le graphique : la liste est relue (les repères de la vue).
        const lignes2 = await o.page.evaluate(() => [...document.querySelectorAll('#reperesListe button')].map(b => b.textContent));
        const k = lignes2.indexOf((pub.find(L => lignes2.includes(L.titre)) || {}).titre);
        await o.page.click(`#reperesListe button[data-k="${k}"]`); await o.page.waitForTimeout(200);
        const vu = await o.page.evaluate(() => ({ survol: guideEtat.survol ? guideEtat.survol.titre : null, fermee: document.getElementById('reperesListe').hidden }));
        check(`${nom} : la liste s'ouvre dans l'écran ; toucher une ligne ouvre la bulle de ce repère ${enColonne ? '(la colonne reste ouverte)' : 'et ferme la liste'}`, ouverte && k >= 0 && vu.fermee === !enColonne && vu.survol === lignes2[k], { ouverte, k, vu, ligne: lignes2[k] });
        // Surbrillance : le repère touché est mis en avant sur le tracé (le reste voilé), sans réticule
        // ni valeurs de bougie ; sa ligne de la liste est marquée.
        const sb = await o.page.evaluate(() => {
          const c = cibleVue(), d = devicePixelRatio, g = calque.getContext('2d');
          const r = c && (c.rects[0] || c.zones[0]);
          // Un point du tracé loin du repère (hors de ses rectangles, zones et tracés) : voilé (opaque sur le calque).
          const dedans = (x, y) => c.rects.concat(c.zones).some(q => x >= q.x0 - 8 && x <= q.x1 + 8 && y >= q.y0 - 8 && y <= q.y1 + 8) || c.segs.some(sg => guideDistSeg(x, y, sg) < 14);
          let voile = -1;
          for (let y = geoPrix.top + 10; y < geoPrix.top + geoPrix.ph && voile < 0; y += 23) for (let x = geoPrix.left + 10; x < geoPrix.W - geoPrix.right - 10; x += 37)
            if (!dedans(x, y)) { voile = g.getImageData(Math.round(x * d), Math.round(y * d), 1, 1).data[3]; break; }
          const ligne = document.querySelector('#reperesListe button[aria-current="true"]');
          return { titre: c && c.titre, r: !!r, voile, liste: crossListe, ligne: ligne && ligne.textContent };
        });
        check(`${nom} : le repère touché est mis en avant sur le graphique, le reste voilé, sa ligne marquée`, sb.titre === lignes2[k] && sb.r && sb.voile > 60 && sb.liste && sb.ligne === lignes2[k], sb);
        const fin = await o.page.evaluate(() => new Promise(ok => setTimeout(() => { dessinerCalque(); ok(reperesVu); }, PARAM.guide.surbrillanceMs + 200)));
        check(`${nom} : la mise en avant s'arrête d'elle-même après quelques secondes`, fin === null, fin);
        // Une bulle ouverte au survol reste quand la souris va vers elle (même de travers, même en
        // passant sur un autre repère), et un clic dedans ouvre son détail (demande du 12/10/2026).
        if (enColonne) {
          const b0 = await o.page.evaluate(() => { const r = canvas.getBoundingClientRect(); return { x: r.left, y: r.top }; });
          const cs = await o.page.evaluate(() => guideEtat.cibles.filter(c => c.rects && c.rects[0] && c.niveau).map(c => [(c.rects[0].x0 + c.rects[0].x1) / 2, (c.rects[0].y0 + c.rects[0].y1) / 2]));
          const suivi = [];
          for (const pt of cs) {
            await o.page.mouse.move(b0.x + 3, b0.y + 3); await o.page.waitForTimeout(450);
            await o.page.mouse.move(b0.x + pt[0], b0.y + pt[1]); await o.page.waitForTimeout(80);
            const B = await o.page.evaluate(() => bulleOuverte && Object.assign({}, bulleOuverte));
            if (!B) { suivi.push({ pt, bulle: false }); continue; }
            const but = [B.x + B.w / 2, B.y + B.h - 6];
            for (let k = 1; k <= 12; k++) {
              const f = k / 12;
              await o.page.mouse.move(b0.x + pt[0] + (but[0] - pt[0]) * f + Math.sin(f * Math.PI) * 30, b0.y + pt[1] + (but[1] - pt[1]) * f); await o.page.waitForTimeout(30);
            }
            await o.page.waitForTimeout(450);
            const tenue = await o.page.evaluate(cle => !!bulleOuverte && bulleOuverte.cle === cle, B.cle);
            let detail = !B.resume;
            if (tenue && B.resume) { await o.page.mouse.click(b0.x + B.x + 30, b0.y + B.y + 20); await o.page.waitForTimeout(120); detail = await o.page.evaluate(cle => bulleDetail === cle && !!bulleOuverte && bulleOuverte.cle === cle, B.cle); }
            suivi.push({ cle: B.cle.slice(0, 30), tenue, detail });
          }
          check(`${nom} : chaque bulle de repère reste ouverte quand la souris va vers elle, un clic dedans ouvre son détail (${suivi.length})`, suivi.length > 1 && suivi.every(x => x.tenue && x.detail), suivi.filter(x => !(x.tenue && x.detail)));
        }
      }
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
      const detail = await t.page.evaluate(() => ({ survol: guideEtat.survol ? guideEtat.survol.titre : null, resume: guideEtat.bulle ? guideEtat.bulle.resume : null, corps: guideEtat.bulle ? guideEtat.bulle.corps.join(' ') : '' }));
      check('… un 2e tap au même endroit ouvre son détail', detail.survol === c.titre && detail.resume === false, detail);
      // Plan du site, idée 8 (13/10/2026) : dans le détail, l'écart et la bande disent à quoi ils servent.
      check('… le détail dit à quoi sert chaque chiffre : l’écart (« ce qu’il reste avant ce repère » ou « l’écart déjà fait au-delà ») et la bande (« la marge où l’on dit que le prix touche le repère »)',
        /\$ (au-dessus|en dessous) : (ce qu’il reste avant ce repère|l’écart déjà fait au-delà)\.|le prix est dedans/.test(detail.corps) && /Bande de ± [\d\s,]+\$ : la marge où l’on dit que le prix touche le repère\./.test(detail.corps), detail.corps);
      await t.page.touchscreen.tap(x, y); await t.page.waitForTimeout(200);
      const retire = await t.page.evaluate(() => ({ survol: guideEtat.survol, crossX }));
      check('… un 3e tap au même endroit la retire', retire.survol === null && retire.crossX === null, retire);
    }
    // Complet (« Le détail ») : la tête de la bulle d'un niveau garde l'écart en %, avec son usage ;
    // la bande dit sa marge (plan du site, idée 8, 13/10/2026).
    const cplt = await t.page.evaluate(() => {
      choisirMode('expert'); drawChart();
      const c = guideEtat.cibles.find(q => q.niveau && q.niveau.live && q.rects.length);
      if (!c) return null;
      const r = c.rects[0];
      crossX = (r.x0 + r.x1) / 2; crossY = (r.y0 + r.y1) / 2; calqueDessin();
      bulleDetail = cleBulle(guideEtat.survol); calqueDessin();
      const out = { titre: guideEtat.survol && guideEtat.survol.titre, corps: guideEtat.bulle ? guideEtat.bulle.corps.join(' ') : '' };
      crossX = crossY = null; calqueDessin(); choisirMode('debutant');
      return out;
    });
    check('Complet : la bulle d’un niveau dit l’usage de l’écart en % (« reste avant le niveau », « déjà au-delà » ou « écart au prix du niveau ») et de la bande',
      !!cplt && /^Maintenant : .+ % live \((reste avant le niveau|déjà au-delà|écart au prix du niveau)\)\./.test(cplt.corps) && /\(marge où le niveau compte comme touché\)/.test(cplt.corps), cplt);
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
    // Repères courts (Complet au téléphone) : la bulle du libellé posé garde ses deux heures.
    const texteS = L => (es.courtes ? L.titre || '' : L.lignes.join(' '));
    check(`sans scénarios : chaque libellé posé qui porte un chiffre publié garde chaque heure${es.courtes ? ' dans sa bulle' : ''}, sans « … » (${pubS.length})`,
      pubS.length > 0 && pubS.every(L => L.heures.every(h => nFoisS(texteS(L), h) >= L.heures.filter(x => x === h).length) && !/…/.test(texteS(L))), pubS);
    check('sans scénarios : aucune erreur JavaScript', !s.erreurs.length, s.erreurs);
    await s.ctx.close();
  } finally { await nav.close(); serveur.close(); }
  console.log(ko ? `\n❌ GUIDE À L'ÉCRAN : ${ko} contrôle(s) en échec` : '\n✅ GUIDE À L\'ÉCRAN : TOUS LES CONTRÔLES PASSENT');
  process.exit(ko ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
