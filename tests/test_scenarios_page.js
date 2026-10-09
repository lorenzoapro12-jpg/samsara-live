// Les scénarios du matin dans un vrai navigateur (Chromium, Playwright) : la couche se dessine
// avec le fichier de test, l'encadré dit ce qu'il doit dire, le survol et le doigt atteignent
// l'explication, le fichier d'attente et l'absence de fichier sont dits en une ligne.
//
//   1. FICHIER COMPLET (1440 px débutant / expert, 1024 px et 390 px avec et sans le Guide) :
//      4 scénarios suivis, l'encadré dans le tracé (moitié haute, dans l'écran), son titre
//      « Scénarios du matin · JJ/MM 07h00 Paris », une ligne par scénario, « sans pourcentage »
//      (débutant), le bilan de l'ordre et la mention « suivi en direct » ; aucun « % » en
//      débutant ; libellé du rang 1 posé. AVEC le Guide (il place ses libellés d'abord), l'encadré
//      peut être replié en une ligne : son explication dit alors tout ; sans le Guide, jamais ;
//   2. SURVOL du libellé du rang 1 → son explication (la base du hasard en expert seulement) ;
//      DOIGT (390 px) : un tap sur le libellé (ou l'encadré replié) → l'explication, un 2e tap la retire ;
//   3. FICHIER D'ATTENTE : une ligne, la note du fichier ; FICHIER ABSENT : « pas de fichier
//      lisible (HH:MM UTC) » ; rien d'autre n'est dessiné ;
//   4. MASQUÉ dans le menu : plus rien, choix gardé (samsara-scenarios-v1).
// Binance simulé (bougies déterministes autour de 86 000) ; tests/fixtures/previsions.json
// décalé pour que le point du matin tombe 3 h avant maintenant.
// Sans Playwright : « non exécuté », dit à l'écran (ce n'est pas un succès).
// USAGE   node tests/test_scenarios_page.js
const fs = require('fs'), path = require('path'), http = require('http');
const REPO = path.resolve(__dirname, '..');
const { previsionsFixture, previsionsAttente, estPrevisions } = require('./previsions-fixture');

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

/** prev : 'complet' | 'attente' | 'absent' | 'hier' (point 26 h avant maintenant, rangs 1 à 3 finis) ;
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
        return r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: prev === 'attente' ? previsionsAttente() : previsionsFixture(prev === 'hier' ? { ilYaMs: 26 * 3600e3 } : {}) });
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
    items: S.items.map(i => ({ rang: i.sc.rang, et: i.et.texte })),
    boite: S.boite ? { x: S.boite.x, y: S.boite.y, w: S.boite.w, h: S.boite.h, seule: S.boite.seule, replie: S.boite.replie, lignes: S.boite.lignes.map(l => l.t) } : null,
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
    for (const [vue, mode, sansGuide] of [[{ width: 1440, height: 900 }, 'debutant'], [{ width: 1440, height: 900 }, 'expert'], [{ width: 1024, height: 760 }, 'debutant'],
      [{ width: 390, height: 800 }, 'debutant'], [{ width: 1024, height: 760 }, 'debutant', true], [{ width: 390, height: 800 }, 'debutant', true]]) {
      const nom = vue.width + ' px · ' + mode + (sansGuide ? ' · Guide masqué' : '');
      titre(nom + ' · fichier complet');
      const o = await ouvrir(nav, vue, mode, 'complet', false, sansGuide);
      if (process.env.SCEN_CAPTURES) await o.page.screenshot({ path: path.join(process.env.SCEN_CAPTURES, vue.width + '-' + mode + (sansGuide ? '-sans-guide' : '') + '.png') });
      const e = await etat(o.page);
      if (!e) { check(`${nom} : la couche des scénarios est préparée`, false); await o.ctx.close(); continue; }
      check(`${nom} : 4 scénarios suivis (1, 2, 3, semaine)`, e.items.map(i => i.rang).join() === '1,2,3,S', e.items);
      const B = e.boite, jour = e.groupe.slice(8, 10) + '/' + e.groupe.slice(5, 7), titreB = 'Scénarios du matin · ' + jour + ' 07h00 Paris';
      // L'encadré ne couvre jamais les bougies récentes, ni des bougies au milieu du tracé : sous
      // 1400 px (bougies simulées sur toute la hauteur), il tient ou il est replié en une ligne qui
      // nomme le rang 1 si la ligne le permet, et dont l'explication dit tout ; jamais replié sur
      // un grand écran (1440 px).
      const repliable = vue.width < 1400;
      check(`${nom} : encadré ${repliable ? 'complet ou replié en une ligne' : 'complet (non replié)'}`, B && (repliable || !B.replie), B);
      const expl = B && B.replie ? (e.cibles.find(c => c.titre === titreB && c.prio === 0) || {}).texte || [] : [];
      const L = B ? (B.replie ? [B.lignes[0]].concat(expl) : B.lignes) : [];
      check(`${nom} : titre « ${titreB} »${repliable ? ' (replié : ou « Scénario 1 … »)' : ''}`, B && (B.lignes[0].startsWith(titreB) || (B.replie && /^Scénarios?( 1)?\b/.test(B.lignes[0]))), B && B.lignes[0]);
      check(`${nom} : l'encadré ne couvre aucune des bougies les plus récentes${B && B.replie ? ' (sauf ligne épinglée faute de place)' : ''}`,
        B && (B.replie || !e.recentes.some(c => c.x1 > B.x && c.x0 < B.x + B.w && c.y1 > B.y && c.y0 < B.y + B.h)), [B, e.recentes.slice(-3)]);
      check(`${nom} : une ligne par scénario, marquée 1., 2., 3., Semaine${B && B.replie ? ' (dans l’explication du titre replié)' : ''}`, ['1. ', '2. ', '3. ', 'Semaine : '].every(m => L.some(l => l.startsWith(m))), L);
      check(`${nom} : encadré dans le tracé ${B && B.replie ? '' : '(dans sa moitié haute) '}et dans l'écran`, B && B.x >= e.left && B.x + B.w <= e.xMax + 0.5 && B.y >= e.top
        && B.y + B.h <= e.top + (B.replie ? e.ph : e.ph / 2 + 0.5) && e.bx + B.x + B.w <= e.vw, [B, e.left, e.xMax, e.top, e.ph]);
      const texte = L.join(' ');
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
      const t = await ouvrir(nav, { width: 390, height: 800 }, 'debutant', 'complet', true);
      const e = await etat(t.page);
      const c = e && (e.cibles.find(q => q.prio === 1 && q.rects.length && /\(rang\s1\)/.test(q.titre))
        || (e.boite && e.boite.replie ? e.cibles.find(q => q.prio === 0 && q.rects.length && /^Scénarios du matin/.test(q.titre)) : null));
      if (!c) check('un libellé du rang 1 (ou l’encadré replié) à toucher', false, e && e.cibles.map(q => [q.prio, q.titre]));
      else {
        const r = c.rects[0], x = e.bx + (r.x0 + r.x1) / 2, y = e.by + (r.y0 + r.y1) / 2;
        await t.page.touchscreen.tap(x, y); await t.page.waitForTimeout(200);
        const apres = await t.page.evaluate(() => (scenEtat.survol ? scenEtat.survol.titre : null));
        check('tap → son explication (bulle partagée avec le Guide) : « ' + c.titre + ' »', apres === c.titre, { apres, attendu: c.titre });
        await t.page.touchscreen.tap(x, y); await t.page.waitForTimeout(200);
        const retire = await t.page.evaluate(() => ({ survol: scenEtat.survol, crossX }));
        check('… un 2e tap au même endroit la retire', retire.survol === null && retire.crossX === null, retire);
      }
      check('écran tactile : aucune erreur JavaScript', !t.erreurs.length, t.erreurs);
      await t.ctx.close();
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
      const h = await ouvrir(nav, { width: 1440, height: 900 }, 'debutant', 'hier');
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
      const a = await ouvrir(nav, { width: 1440, height: 900 }, 'debutant', 'attente');
      const e = await etat(a.page);
      check('attente : une seule ligne « Scénarios du matin : » + la note du fichier', e && e.boite && e.boite.seule && e.boite.lignes.length === 1
        && e.boite.lignes[0] === 'Scénarios du matin : ' + note.charAt(0).toLowerCase() + note.slice(1), e && e.boite);
      check('attente : aucun scénario dessiné', e && e.items.length === 0 && await a.page.evaluate(() => scenDessinables() === null));
      check('attente : aucune erreur JavaScript', !a.erreurs.length, a.erreurs);
      await a.ctx.close();
      const z = await ouvrir(nav, { width: 390, height: 800 }, 'debutant', 'absent');
      const ez = await etat(z.page);
      check('absent (404) : « Scénarios du matin : pas de fichier lisible (HH:MM UTC) »', ez && ez.boite && ez.boite.seule && /^Scénarios du matin : pas de fichier lisible \(\d\d:\d\d UTC\)$/.test(ez.boite.lignes[0]), ez && ez.boite);
      check('absent : aucune erreur JavaScript', !z.erreurs.length, z.erreurs);
      await z.ctx.close();
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
