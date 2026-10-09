// La journée des scénarios du matin dans un vrai navigateur (Chromium, Playwright), sur le marché
// RÉEL du 08/10/2026 rejoué (tests/fixtures/rejeu-jour-0810.json, harnais
// tests/scenarios-jour-harnais.js : horloge de la page réglée, bougies tronquées à l'heure dite).
//
//   1. 15:40 UTC (le 2 réalisé et le 3 invalidé entre 15:15 et 15:30, le 1 encore dedans) —
//      1440 × 900 et 390 × 844, Débutant et Expert :
//      · scenEtat.jour de la page = classerJour pur sur les mêmes bougies (cas, meneur, montré,
//        écarts à 0,01 près, fondus) ; les deux modes donnent les mêmes valeurs ;
//      · Débutant : au plus 5 textes, un seul libellé (celui du montré, le 1), la ligne du cas D
//        (« … le 2 réalisé ✓ (en direct) ▸ »), sa bulle : les trois lignes numérotées, « Ce
//        classement ne change pas pendant la journée », « pas de nouvelle prévision » ; aucun mot
//        banni, aucun « % » ; aucune marque dessinée pour un scénario qui n'est pas montré ;
//      · Expert : « Seul encore en cours : 1 », les distances en $ sur la ligne ouverte, les
//        pastilles « ✓ 15:15–15:30 UTC » (le 2) et « ✗ S3 15:15–15:30 UTC » (le 3), le fondu du 3
//        parti de la CLÔTURE (15:30) : 0,83 ; ni « écart 0,xx » ni « en tête » (A2) ;
//   2. 17:40 (le 1 sorti, le 2 réalisé) : Débutant, libellé « Scénario 2 : zone 80 806 $ ✓ » (A3,
//      jamais « atteint »), ligne du cas F, une coche dessinée ; Expert, la pastille ✗ du 1 ;
//      18:40 : le fondu du 1 est fini (0), sa pastille ✗ reste en Expert ;
//   3. M8 : une figure forcée pendant le fondu d'une fermeture → c'est le LIBELLÉ qui cède, la
//      ligne reste, au plus 5 textes ;
//   4. SOBRIÉTÉ : survol → aucun drawChart ; tick de prix → le calque seul, jour inchangé ; une
//      minute de plus (queue des bougies changée) → un drawChart, jour recalculé.
// Sans Playwright : « non exécuté », dit à l'écran (ce n'est pas un succès).
// USAGE   node tests/test_scenarios_jour_page.js      (SCEN_CAPTURES=dossier : captures en plus)
const path = require('path');
const H = require('./scenarios-jour-harnais');
const S = require('../js/scenarios.js');
const X = require('./fixtures/rejeu-jour-0810.json');
const { motsBannis } = require('../js/guide.js');

if (!H.playwright) {
  console.log('  − NON EXÉCUTÉ : Playwright introuvable — la journée des scénarios n\'est pas vérifiée à l\'écran sur ce poste.');
  process.exit(0);
}
let ko = 0;
const check = (nom, ok, det) => { if (!ok) ko++; console.log(`  ${ok ? '✓' : '✗'} ${nom}${!ok && det !== undefined ? ' — ' + JSON.stringify(det).slice(0, 600) : ''}`); };
const titre = t => console.log(`\n── ${t} ──`);
const CONSEIL = /\b(achetez|vendez|ach[eè]te[rz]?|vends|il faut (acheter|vendre)|entrez|sortez|prenez position|signal d.(achat|vente)|recommand)/i;
const bannis = t => motsBannis(t);
const A2 = /écart (relatif )?0,\d|en tête/;
const proche = (a, b, tol) => (a === null && b === null) || (a !== null && b !== null && Math.abs(a - b) <= tol);

/** Les textes dessinés sur le tracé pendant un drawChart forcé (journal de fillText). */
const textes = page => page.evaluate(() => {
  const out = [], f0 = CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText = function (t, x, y) { if (this.canvas && (this.canvas.id === 'chart' || this.canvas.id === 'chartCalque')) out.push({ t: String(t), x, y }); return f0.apply(this, arguments); };
  crossX = crossY = null; drawChart();
  CanvasRenderingContext2D.prototype.fillText = f0;
  const W = canvas.width / devicePixelRatio, fil = (NOMS_PAIRES[activeSymbol] || activeSymbol) + '  ·  ' + Guide.nomIntervalle(chartInterval);
  return out.filter(e => e.t !== fil && e.x >= 14 && e.x < W - 75 && e.y >= 0 && e.y <= geo.mainH - 20).map(e => e.t);
});
/** La bulle de la ligne des scénarios (Débutant) et celle de l'encadré (Expert). */
const bulle = page => page.evaluate(() => {
  const S = scenEtat, c = S && S.cibles.find(x => /^Scénarios du matin · /.test(x.titre || '') && x.rects && x.rects.length);
  return c ? c.texte.join('\n') : '';
});
const capt = async (o, nom) => { if (process.env.SCEN_CAPTURES) await o.page.screenshot({ path: path.join(process.env.SCEN_CAPTURES, nom + '.png') }); };

(async () => {
  const nav = await H.playwright.chromium.launch();
  try {
    const parMode = {};
    for (const [vue, mode] of [[{ width: 1440, height: 900 }, 'debutant'], [{ width: 1440, height: 900 }, 'expert'], [{ width: 390, height: 844 }, 'debutant'], [{ width: 390, height: 844 }, 'expert']]) {
      const nom = '15:40 · ' + vue.width + ' px · ' + mode, tactile = vue.width < 500;
      titre(nom);
      const h = H.harnais(X, '2026-10-08T15:40:00Z');
      const o = await H.ouvrir(nav, h, { vue, mode, tactile });
      await capt(o, 'jour-1540-' + mode + '-' + vue.width);
      const e = await H.lire(o.page), ref = H.reference(S, h);
      if (!e || !e.jour) { check(`${nom} : la journée est calculée (scenEtat.jour)`, false, e); await o.ctx.close(); continue; }
      check(`${nom} : intervalle 15m, bougies du rejeu`, e.itv === '15m' && e.n > 500, [e.itv, e.n]);
      check(`${nom} : jour de la page = calcul pur (cas ${ref.cas}, meneur ${ref.meneur}, montré ${ref.montre})`, e.jour.cas === ref.cas && e.jour.meneur === ref.meneur && e.jour.montre === ref.montre, { page: e.jour, ref });
      check(`${nom} : écarts = calcul pur à 0,01 près`, e.jour.e.every((v, i) => proche(v, ref.e[i], 0.01)), { page: e.jour.e, ref: ref.e });
      check(`${nom} : fondus = calcul pur à 0,01 près`, e.jour.fondu.every((v, i) => proche(v, ref.fondu[i], 0.01)), { page: e.jour.fondu, ref: ref.fondu });
      check(`${nom} : le 2 réalisé, le 3 fermé, le 1 seul en cours (cas « seul »)`, e.jour.cas === 'seul' && e.jour.realises.join() === '2' && e.jour.ouverts.join() === '1', e.jour);
      check(`${nom} : fondu du 3 parti de la clôture du contact (15:30) : fondu(10 min) ≈ 0,83`, proche(e.jour.fondu[2], 50 / 60, 0.01), e.jour.fondu);
      (parMode[vue.width] = parMode[vue.width] || {})[mode] = { cas: e.jour.cas, meneur: e.jour.meneur, montre: e.jour.montre, e: e.jour.e, ouverts: e.jour.ouverts, realises: e.jour.realises };
      const T = await textes(o.page);
      if (mode === 'debutant') {
        const etroit = vue.width < 500;
        check(`${nom} : au plus 5 textes sur le tracé (${T.length})`, T.length <= 5, T);
        const lib = e.libelles;
        check(`${nom} : un seul libellé de scénario, celui du montré (le 1) : « Scén. 1 : reste 81 436–83 947 $ »`, lib.length === 1 && lib[0].rang === '1' && /^Scén(ario|\.) 1 : reste 81 436–83 947 \$$/.test(lib[0].t), lib);
        const L = e.boite && e.boite.texte;
        check(`${nom} : ligne du cas D (« ${L} »)`, !!L && /^(Scén\. : en cours|En cours) · le 2 réalisé ✓ \(en direct\) ▸$/.test(L) && L.length <= (etroit ? 40 : 48), L);
        check(`${nom} : aucune marque dessinée pour un scénario non montré`, e.items.every(i => i.rang === e.montre || !i.marques.length), e.items);
        const b = await bulle(o.page);
        check(`${nom} : bulle de la ligne : 1., 2., 3., « Ce classement ne change pas pendant la journée », « Pas de nouvelle prévision »`,
          ['1. ', '2. ', '3. '].every(m => b.split('\n').some(l => l.startsWith(m))) && /Ce classement ne change pas pendant la journée/.test(b) && /[Pp]as de nouvelle prévision/.test(b), b);
        check(`${nom} : jamais « suit le mieux » quand un seul scénario est en cours (M5)`, !/suit (le )?mieux/.test(b + ' ' + L), b);
        const tout = T.concat([b]).join('\n');
        check(`${nom} : aucun « % », aucun mot banni, aucun conseil (tracé et bulle)`, !/%/.test(tout) && !bannis(T.join(' ')).length && !CONSEIL.test(tout), { pct: /%/.test(tout), bannis: bannis(T.join(' ')) });
      } else {
        const B = e.boite, lignes = B ? B.lignes : [], tout = lignes.concat(e.libelles.map(l => l.t)).concat(T);
        const b = await bulle(o.page), txt = lignes.concat(b.split('\n'));
        check(`${nom} : « Seul encore en cours : 1 » (encadré ou sa bulle)`, txt.some(l => /^Seul encore en cours : 1\b/.test(l)), txt);
        check(`${nom} : la ligne du 1 (ouvert) dit sa distance en $ (« bord toléré à … $ »)`, txt.some(l => /^1\. .*bord toléré à [\d  ]+ \$/.test(l)), txt);
        const m2 = (e.items.find(i => i.rang === '2') || {}).marques || [], m3 = (e.items.find(i => i.rang === '3') || {}).marques || [];
        check(`${nom} : pastille « ✓ 15:15–15:30 UTC » sur le 2`, m2.some(m => m.ok && m.texte === '✓ 15:15–15:30 UTC'), m2);
        check(`${nom} : pastille « ✗ S3 15:15–15:30 UTC » sur le 3`, m3.some(m => !m.ok && m.texte === '✗ S3 15:15–15:30 UTC'), m3);
        const l3 = e.libelles.find(l => l.rang === '3');
        check(`${nom} : le libellé du 3 dit pourquoi il est fermé`, !l3 || /invalid|touch|zone|sorti/i.test(l3.t), l3);
        check(`${nom} : ni « écart 0,xx » ni « en tête » sur le tracé ni dans l'encadré (A2)`, !tout.some(t => A2.test(t)), tout.filter(t => A2.test(t)));
        check(`${nom} : aucun conseil`, !tout.some(t => CONSEIL.test(t)), tout.filter(t => CONSEIL.test(t)));
      }
      check(`${nom} : aucune erreur JavaScript`, !o.erreurs.length, o.erreurs);
      await o.ctx.close();
    }
    for (const w of Object.keys(parMode)) {
      const p = parMode[w];
      check(`15:40 · ${w} px : mêmes valeurs en Débutant et en Expert`, p.debutant && p.expert && JSON.stringify(p.debutant) === JSON.stringify(p.expert), p);
    }

    titre('17:40 puis 18:40 : le 1 sorti, le 2 réalisé');
    for (const [vue, mode] of [[{ width: 1440, height: 900 }, 'debutant'], [{ width: 390, height: 844 }, 'debutant'], [{ width: 1440, height: 900 }, 'expert']]) {
      const nom = vue.width + ' px · ' + mode, etroit = vue.width < 500;
      const h = H.harnais(X, '2026-10-08T17:40:00Z');
      const o = await H.ouvrir(nav, h, { vue, mode, tactile: etroit });
      await capt(o, 'jour-1740-' + mode + '-' + vue.width);
      let e = await H.lire(o.page);
      const ref = H.reference(S, h);
      check(`17:40 · ${nom} : jour = calcul pur (cas ${ref.cas}, montré ${ref.montre})`, e.jour && e.jour.cas === ref.cas && e.jour.montre === ref.montre && e.jour.fondu.every((v, i) => proche(v, ref.fondu[i], 0.01)), { page: e.jour, ref });
      check(`17:40 · ${nom} : le 1 sorti en fondu (0 < fondu < 1), le 2 réalisé et montré`, e.jour.fondu[0] > 0 && e.jour.fondu[0] < 1 && e.jour.realises.join() === '2' && e.jour.montre === '2', e.jour);
      if (mode === 'debutant') {
        check(`17:40 · ${nom} : libellé « Scénario 2 : zone 80 806 $ ✓ » (ou son repli), jamais « atteint »`, e.libelles.length === 1 && /^Scén(ario|\.) 2 : zone 80 806 \$ ✓$/.test(e.libelles[0].t), e.libelles);
        const L = e.boite && e.boite.texte;
        check(`17:40 · ${nom} : ligne du cas F (« ${L} »)`, !!L && (etroit ? /^Scén\. 1 (✗|sorti) · le 2 réalisé ✓ \(en direct\) ▸$/ : /^Scén\. 1 sorti · le 2 réalisé ✓ \(en direct\) ▸$/).test(L) && L.length <= (etroit ? 40 : 48), L);
        const m2 = (e.items.find(i => i.rang === '2') || {}).marques || [];
        check(`17:40 · ${nom} : une coche dessinée (sans texte) sur la zone du 2`, m2.length === 1 && m2[0].ok && !m2[0].texte, m2);
        const T = await textes(o.page);
        check(`17:40 · ${nom} : au plus 5 textes, aucun « % »`, T.length <= 5 && !T.some(t => /%/.test(t)), T);
      } else {
        const m1 = (e.items.find(i => i.rang === '1') || {}).marques || [];
        check(`17:40 · ${nom} : la pastille ✗ du 1`, m1.some(m => !m.ok && /^✗ S1 \d\d:\d\d–\d\d:\d\d UTC$/.test(m.texte || '')), m1);
      }
      await H.avancer(o, h, '2026-10-08T18:40:00Z');
      e = await H.lire(o.page);
      check(`18:40 · ${nom} : le fondu du 1 est fini (0)`, e.jour && e.jour.fondu[0] === 0, e.jour);
      if (mode === 'expert') {
        const m1 = (e.items.find(i => i.rang === '1') || {}).marques || [];
        check(`18:40 · ${nom} : la pastille ✗ du 1 reste`, m1.some(m => !m.ok && /^✗ S1 /.test(m.texte || '')), m1);
      } else {
        check(`18:40 · ${nom} : le libellé reste celui du 2`, e.libelles.length === 1 && e.libelles[0].rang === '2', e.libelles);
      }
      check(`17:40–18:40 · ${nom} : aucune erreur JavaScript`, !o.erreurs.length, o.erreurs);
      await o.ctx.close();
    }

    titre('M8 : une figure pendant le fondu d’une fermeture → le libellé cède, la ligne reste');
    {
      const h = H.harnais(X, '2026-10-08T17:40:00Z');
      const o = await H.ouvrir(nav, h, { vue: { width: 1440, height: 900 }, mode: 'debutant' });
      const r = await o.page.evaluate(() => {
        const n = candles.length, G = PARAM.guide, C = i => candles[i];
        const ia = n - 34, ic = n - 24, ib = n - 14, pa = Math.max(C(ia).high, C(ib).high), pc = C(ic).low;
        const f = { type: 'double_sommet', sens: -1, phase: 'confirme', a: { i: ia, p: pa }, b: { i: ib, p: pa }, cou: { i: ic, p: pc }, niveau: pc, objectif: pc - (pa - pc), t: ib + G.pivot, debut: ia, fin: null, jFin: null };
        const f0 = Guide.formesAffichees;
        Guide.formesAffichees = () => [f];
        drawChart();
        const out = { items: debEtat.items.map(i => ({ role: i.role, texte: i.texte })), cede: !!scenEtat.libelleCede, boite: scenEtat.boite && scenEtat.boite.texte,
          bulle: (scenEtat.cibles.find(c => /^Scénarios du matin · /.test(c.titre || '') && c.rects && c.rects.length) || { texte: [] }).texte.join('\n') };
        Guide.formesAffichees = f0; drawChart();
        return out;
      });
      const roles = r.items.map(i => i.role);
      check('M8 : la forme est posée, la ligne reste, le libellé du scénario cède ; au plus 5 textes', roles.includes('forme') && roles.includes('boite') && !roles.includes('scenario') && r.cede && r.items.length <= 5, r);
      check('M8 : la bulle de la ligne reprend celle du libellé', /Le libellé du scénario \(place prise\)/.test(r.bulle), r.bulle);
      check('M8 : aucune erreur JavaScript', !o.erreurs.length, o.erreurs);
      await o.ctx.close();
    }

    titre('Sobriété : survol, tick de prix, nouvelle minute');
    {
      const h = H.harnais(X, '2026-10-08T15:40:00Z');
      const o = await H.ouvrir(nav, h, { vue: { width: 1440, height: 900 }, mode: 'debutant' });
      await o.page.evaluate(() => {
        window.__n = { dc: 0, cq: 0 };
        const d0 = window.drawChart, c0 = window.dessinerCalque;
        window.drawChart = function () { window.__n.dc++; return d0.apply(this, arguments); };
        window.dessinerCalque = function () { window.__n.cq++; return c0.apply(this, arguments); };
      });
      const p = await o.page.evaluate(() => { const it = debEtat.items.find(i => i.role === 'scenario') || debEtat.items[0]; const b = canvas.getBoundingClientRect(); return { x: b.left + it.rect.x + 10, y: b.top + it.rect.y + 6 }; });
      for (let k = 0; k < 6; k++) { await o.page.mouse.move(p.x + k * 3, p.y); await o.page.waitForTimeout(40); }
      await o.page.waitForTimeout(200);
      const n1 = await o.page.evaluate(() => Object.assign({}, window.__n));
      check('survol du libellé du scénario : aucun drawChart (le calque seul)', n1.dc === 0 && n1.cq >= 1, n1);
      await o.page.mouse.move(2, 2); await o.page.waitForTimeout(200);
      const j0 = (await H.lire(o.page)).jour;
      const avantK = await o.page.evaluate(() => candles[candles.length - 1].close);
      // Le tick : seul le ticker change (fetchPrice ne relit pas les bougies).
      const prixT = String(avantK + 37);
      await o.page.route('**/ticker/24hr**', r => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ lastPrice: prixT, openPrice: '82000', priceChangePercent: '1', highPrice: '84000', lowPrice: '80000' }) }));
      await o.page.evaluate(() => { window.__n = { dc: 0, cq: 0 }; });
      await o.page.evaluate(() => fetchPrice());
      await o.page.waitForTimeout(150);
      const n2 = await o.page.evaluate(() => Object.assign({ live: livePrice }, window.__n)), j1 = (await H.lire(o.page)).jour;
      check('tick de prix : aucun drawChart, le calque seul ; jour inchangé', n2.dc === 0 && n2.cq >= 1 && Math.abs(n2.live - (avantK + 37)) < 1e-6 && JSON.stringify(j0.e) === JSON.stringify(j1.e) && j0.cas === j1.cas, { n2, j0, j1 });
      await o.page.unroute('**/ticker/24hr**');
      await o.page.evaluate(() => { window.__n = { dc: 0, cq: 0 }; });
      h.t = Date.parse('2026-10-08T15:47:00Z');
      await o.page.clock.setSystemTime(h.t);
      await o.page.evaluate(async () => { if (await fetchKlines()) drawChart(); });
      await o.page.waitForTimeout(150);
      const n3 = await o.page.evaluate(() => Object.assign({}, window.__n)), j2 = (await H.lire(o.page)).jour, ref = H.reference(S, h);
      check('nouvelle minute (queue changée) : un drawChart, jour recalculé = calcul pur', n3.dc === 1 && j2.e.every((v, i) => proche(v, ref.e[i], 0.01)) && JSON.stringify(j2.e) !== JSON.stringify(j1.e), { n3, j2: j2.e, ref: ref.e, j1: j1.e });
      check('sobriété : aucune erreur JavaScript', !o.erreurs.length, o.erreurs);
      await o.ctx.close();
    }
  } finally {
    await nav.close();
    H.arreter();
  }
  console.log(ko ? `\n❌ JOURNÉE DES SCÉNARIOS À L'ÉCRAN : ${ko} CONTRÔLE(S) EN ÉCHEC` : '\n✅ JOURNÉE DES SCÉNARIOS À L\'ÉCRAN : TOUS LES CONTRÔLES PASSENT');
  process.exit(ko ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
