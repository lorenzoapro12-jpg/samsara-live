// La journée des scénarios du matin dans un vrai navigateur, suite de la revue (Chromium,
// Playwright ; marché réel du 08/10/2026 rejoué par tests/scenarios-jour-harnais.js) :
//
//   1. 13:50 UTC, trois scénarios ouverts en 15 min ; clic sur 4 h puis 1 jour, et 1 min dont
//      l'historique ne remonte pas jusqu'au point (« incomplet ») : jamais « Aucun scénario … »
//      (encadré, ligne, bulles), cas « nonSuivi », Débutant : un libellé pour le rang 1, la ligne
//      n'est pas prioritaire ;
//   2. 13:50, une figure du Guide prend la place de la ligne (Débutant, 1440 × 900 et 390 × 844) :
//      la bulle DESSINÉE du libellé (scenEtat.bulle.corps) nomme le scénario 2 ;
//   3. 17:40, Débutant : le rang 1 sorti garde sa croix dessinée (sans texte) pendant son fondu
//      alors que le 2 est montré ; au plus 5 textes ;
//   4. Expert : 08/10 18:40, le libellé du 1 (fondu fini) garde ses niveaux ; 07/10 02:20 (journée
//      du 06/10) : aucune coche sur un scénario après son invalidation.
// USAGE   node tests/test_scenarios_jour_revue_page.js
const H = require('./scenarios-jour-harnais');
const X = require('./fixtures/rejeu-jour-0810.json');
const X06 = require('./fixtures/rejeu-jour-0610.json');

if (!H.playwright) {
  console.log('  − NON EXÉCUTÉ : Playwright introuvable — la revue de la journée des scénarios n\'est pas vérifiée à l\'écran sur ce poste.');
  process.exit(0);
}
let ko = 0;
const check = (nom, ok, det) => { if (!ok) ko++; console.log(`  ${ok ? '✓' : '✗'} ${nom}${!ok && det !== undefined ? ' — ' + JSON.stringify(det).slice(0, 600) : ''}`); };
const titre = t => console.log(`\n── ${t} ──`);
const AUCUN = /Aucun scénario|ne tient plus|aucun ne tient/i;

/** Tous les textes des scénarios : lignes de l'encadré, ligne Débutant, libellés, bulles. */
const textes = page => page.evaluate(() => {
  const S = scenEtat;
  if (!S) return [];
  return [].concat(S.boite ? [S.boite.texte || ''].concat((S.boite.lignes || []).map(l => l.t)) : [], (S.libelles || []).map(l => l.t), ...S.cibles.map(c => (c.texte || []).concat(c.texteCourt || [])));
});

(async () => {
  const nav = await H.playwright.chromium.launch();
  try {
    titre('1. 4 h, 1 jour, 1 min incomplet : rien n’est dit « aucun »');
    for (const mode of ['debutant', 'expert']) {
      const h = H.harnais(X, '2026-10-08T13:50:00Z');
      const o = await H.ouvrir(nav, h, { vue: { width: 1440, height: 900 }, mode });
      const e15 = await H.lire(o.page);
      check(`${mode} · 15 min : trois scénarios ouverts`, e15.jour && e15.jour.ouverts.length === 3, e15.jour);
      for (const itv of ['4h', '1d']) {
        await o.page.click('#int_' + itv); await o.page.waitForTimeout(900);
        const e = await H.lire(o.page), T = await textes(o.page);
        check(`${mode} · ${itv} : cas « nonSuivi », montré = le 1`, e.itv === itv && e.jour && e.jour.cas === 'nonSuivi' && e.jour.montre === '1', [e.itv, e.jour]);
        check(`${mode} · ${itv} : aucun texte « Aucun scénario … » ni « ne tient plus »`, !T.some(t => AUCUN.test(t)), T.filter(t => AUCUN.test(t)));
        if (mode === 'debutant') {
          check(`${mode} · ${itv} : un libellé pour le rang 1 (« ${e.libelles.map(l => l.t).join(' | ')} »), ligne non prioritaire`, e.libelles.length === 1 && e.libelles[0].rang === '1' && e.boite && !e.boite.prioritaire, [e.libelles, e.boite]);
        }
      }
      check(`${mode} : aucune erreur JavaScript`, !o.erreurs.length, o.erreurs);
      await o.ctx.close();
    }
    {
      // 1 min : l'historique chargé commence à 06:00, après le point (04:30) → « incomplet ».
      const Xi = Object.assign({}, X, { k1: X.k1.filter(k => k[0] >= Date.parse('2026-10-08T06:00Z')) });
      const h = H.harnais(Xi, '2026-10-08T13:50:00Z');
      const o = await H.ouvrir(nav, h, { vue: { width: 1440, height: 900 }, mode: 'debutant' });
      await o.page.click('#int_1m'); await o.page.waitForTimeout(1200);
      const e = await H.lire(o.page), T = await textes(o.page);
      check('1 min incomplet : cas « nonSuivi », suivi « incomplet », aucun « Aucun scénario »', e.itv === '1m' && e.jour && e.jour.cas === 'nonSuivi' && e.items.every(i => i.cle === 'incomplet') && !T.some(t => AUCUN.test(t)), [e.itv, e.jour, e.items.map(i => i.cle), T.filter(t => AUCUN.test(t))]);
      check('1 min incomplet : un libellé pour le rang 1, ligne non prioritaire', e.libelles.length === 1 && e.libelles[0].rang === '1' && !e.boite.prioritaire, [e.libelles, e.boite]);
      check('1 min incomplet : aucune erreur JavaScript', !o.erreurs.length, o.erreurs);
      await o.ctx.close();
    }

    titre('2. Une figure prend la place de la ligne : la bulle dessinée du libellé nomme le scénario');
    for (const vue of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      const h = H.harnais(X, '2026-10-08T13:50:00Z');
      const o = await H.ouvrir(nav, h, { vue, mode: 'debutant' });
      const e0 = await H.lire(o.page);
      const r = await o.page.evaluate(() => {
        const n = candles.length, G = PARAM.guide, C = i => candles[i];
        const ia = n - 34, ic = n - 24, ib = n - 14, pa = Math.max(C(ia).high, C(ib).high), pc = C(ic).low;
        // (Figures en direct : une figure complète, et le Débutant lit sa liste dans Guide.formesDebutant.)
        const f = { type: 'double_sommet', famille: 'extremes', sens: -1, phase: 'confirme', a: { i: ia, p: pa }, b: { i: ib, p: pa }, cou: { i: ic, p: pc }, niveau: pc, extreme: pa, hauteur: pa - pc, objectif: pc - (pa - pc),
          invalidation: pa, t: ib + G.pivot, debut: ia, depart: ib + 1, jConf: ib + G.pivot + 2, fin: null, jFin: null, journal: [] };
        window.__f0 = Guide.formesAffichees; window.__fd0 = Guide.formesDebutant;
        Guide.formesAffichees = () => [f]; Guide.formesDebutant = () => [f];
        drawChart();
        const it = debEtat.items.find(i => i.role === 'scenario');
        return { cede: !!(scenEtat.boite && scenEtat.boite.cede), roles: debEtat.items.map(i => i.role), rect: it ? it.rect : null, cv: canvas.getBoundingClientRect().toJSON() };
      });
      check(`${vue.width} : le 2 est nommé (${e0.jour.net ? 'au plus petit écart' : 'nom gardé'}) ; la ligne a cédé sa place à la figure`, e0.jour.meneur === '2' && r.cede && r.roles.includes('forme') && r.rect, [e0.jour, r]);
      if (r.rect) {
        const x = r.cv.x + r.rect.x + r.rect.w / 2, y = r.cv.y + r.rect.y + r.rect.h / 2;
        await o.page.mouse.move(x - 10, y); await o.page.mouse.move(x, y, { steps: 3 }); await o.page.waitForTimeout(250);
        // Le résumé d'abord ; le clic ouvre le détail de la bulle.
        if (await o.page.evaluate(() => !!(scenEtat && scenEtat.bulle && scenEtat.bulle.resume))) { await o.page.mouse.click(x, y); await o.page.waitForTimeout(250); }
        const b = await o.page.evaluate(() => (scenEtat && scenEtat.bulle ? scenEtat.bulle.corps.join(' ') : ''));
        check(`${vue.width} : bulle dessinée du libellé : le scénario 2 y est nommé (« ${(b.match(/[^.]*scénario 2[^.]*/i) || [''])[0].slice(0, 120)} »)`, /le plus près de ce que décrit le scénario 2|scénario 2 a été nommé|scénario 2 suit le mieux|Nommé[^.]* le scénario 2\b|La ligne des scénarios \(place prise\) : « En direct : le 2/.test(b.replace(/\s+/g, ' ')), b.slice(0, 900));
      }
      await o.page.evaluate(() => { Guide.formesAffichees = window.__f0; Guide.formesDebutant = window.__fd0; drawChart(); });
      check(`${vue.width} : aucune erreur JavaScript`, !o.erreurs.length, o.erreurs);
      await o.ctx.close();
    }

    titre('3. 17:40, Débutant : le rang 1 sorti garde sa croix pendant son fondu');
    for (const vue of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      const h = H.harnais(X, '2026-10-08T17:40:00Z');
      const o = await H.ouvrir(nav, h, { vue, mode: 'debutant', tactile: vue.width < 500 });
      const e = await H.lire(o.page);
      const m1 = (e.items.find(i => i.rang === '1') || {}).marques || [];
      check(`${vue.width} : montré = le 2, le 1 en fondu avec sa croix dessinée, sans texte`, e.montre === '2' && e.jour.fondu[0] > 0 && m1.some(m => !m.ok && !m.texte), [e.montre, e.jour.fondu, m1]);
      check(`${vue.width} : au plus 5 textes (budget inchangé)`, e.deb && e.deb.length <= 5, e.deb);
      check(`${vue.width} : aucune erreur JavaScript`, !o.erreurs.length, o.erreurs);
      await o.ctx.close();
    }

    titre('4. Expert : niveaux gardés après le fondu ; aucune coche après une invalidation');
    {
      const h = H.harnais(X, '2026-10-08T18:40:00Z');
      const o = await H.ouvrir(nav, h, { vue: { width: 1440, height: 900 }, mode: 'expert' });
      const e = await H.lire(o.page), l1 = e.libelles.find(l => l.rang === '1');
      check(`18:40 : fondu du 1 fini, son libellé garde ses niveaux (« ${l1 && l1.t} »)`, e.jour.fondu[0] === 0 && l1 && /81 436/.test(l1.t), [e.jour.fondu, e.libelles]);
      check('18:40 : aucune erreur JavaScript', !o.erreurs.length, o.erreurs);
      await o.ctx.close();
    }
    {
      const h = H.harnais(X06, '2026-10-07T02:20:00Z');
      const o = await H.ouvrir(nav, h, { vue: { width: 1440, height: 900 }, mode: 'expert' });
      const r = await o.page.evaluate(() => scenEtat.items.map(i => ({ rang: i.sc.rang, cle: i.sv && i.sv.cle, tInv: i.sv && i.sv.tInv, brut: (i.sv && i.sv.touchees || []).filter(Number.isFinite), ok: (i.marques || []).filter(m => m.ok).map(m => m.texte) })));
      const inv = r.filter(x => x.cle === 'invalide' || x.cle === 'ambigu');
      check(`07/10 02:20 : les scénarios invalidés (${inv.map(x => x.rang).join(', ')}) n’ont aucune coche datée après leur invalidation`, inv.length >= 1 && inv.every(x => !x.brut.some(t => t >= x.tInv) || !x.ok.length || x.ok.every(t => !/02:00/.test(t))), r);
      const s2 = r.find(x => x.rang === '2');
      check(`07/10 02:20 : le 2 (invalidé le 06/10, touché le 07/10 à 02:00) n’a pas de coche « 02:00 » (« ${(s2 && s2.ok || []).join(' | ')} »)`, s2 && !s2.ok.some(t => /02:00/.test(t)), s2);
      check('07/10 02:20 : aucune erreur JavaScript', !o.erreurs.length, o.erreurs);
      await o.ctx.close();
    }
  } finally {
    await nav.close();
    H.arreter();
  }
  console.log(ko ? `\n❌ JOURNÉE DES SCÉNARIOS, REVUE À L'ÉCRAN : ${ko} CONTRÔLE(S) EN ÉCHEC` : '\n✅ JOURNÉE DES SCÉNARIOS, REVUE À L\'ÉCRAN : TOUS LES CONTRÔLES PASSENT');
  process.exit(ko ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
