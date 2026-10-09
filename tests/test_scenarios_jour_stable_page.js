// La journée des scénarios du matin dans un vrai navigateur, round 2 de la revue (Chromium,
// Playwright ; le 09/10/2026 RÉEL rejoué par tests/scenarios-jour-harnais.js, puis sa suite
// SYNTHÉTIQUE marquée, tests/scenarios-jour-0910.js) :
//
//   1. dans la bougie de 16:00 (15 min), minute par minute : la ligne Débutant, la phrase de
//      l'encadré Expert, la place de « ◂ » et l'état du libellé du nommé ne changent pas ;
//   2. 19:08 (synthétique) : le 3 réalisé et le 2 invalidé dans la bougie, une figure du Guide
//      posée — la ligne garde sa place (le libellé cède), au plus 5 textes (1440 et 390) ;
//   3. 20:06 (synthétique, contact en mèche) : la bulle de la ligne survolée est la LONGUE (elle tient
//      à 1440 × 900) et dit « zone » et « passage bref » ; la bulle courte aussi ;
//   4. Expert, téléphone : la bulle de l'encadré replié dit la journée (« Seul en cours », « Reste ») ;
//   5. 1 h, Débutant : le libellé du range est sur sa boîte (au moins à moitié dedans ; jamais au
//      milieu du tracé, au-dessus des bougies d'avant le point) ;
//   6. Expert : la coche du 3 et la croix du 2 au même contact ne se recouvrent pas ; sans flèche
//      pour le nommé, aucune autre flèche.
// USAGE   node tests/test_scenarios_jour_stable_page.js
const H = require('./scenarios-jour-harnais');
const { reel, synth } = require('./scenarios-jour-0910');

if (!H.playwright) {
  console.log('  − NON EXÉCUTÉ : Playwright introuvable — la stabilité de la journée des scénarios n\'est pas vérifiée à l\'écran sur ce poste.');
  process.exit(0);
}
let ko = 0;
const check = (nom, ok, det) => { if (!ok) ko++; console.log(`  ${ok ? '✓' : '✗'} ${nom}${!ok && det !== undefined ? ' — ' + JSON.stringify(det).slice(0, 700) : ''}`); };
const titre = t => console.log(`\n── ${t} ──`);
/** Survole (souris) ou touche (doigt) le centre d'un rectangle du tracé ; rend la bulle dessinée. */
async function survoler(o, rect, doigt) {
  const cv = await o.page.evaluate(() => canvas.getBoundingClientRect().toJSON());
  const x = cv.x + rect.x + Math.min(rect.w / 2, 40), y = cv.y + rect.y + rect.h / 2;
  if (doigt) await o.page.touchscreen.tap(x, y); else { await o.page.mouse.move(x - 10, y); await o.page.mouse.move(x, y, { steps: 3 }); }
  await o.page.waitForTimeout(300);
  return o.page.evaluate(() => (scenEtat && scenEtat.bulle ? scenEtat.bulle.corps.join(' ').replace(/\s+/g, ' ') : ''));
}

(async () => {
  const nav = await H.playwright.chromium.launch();
  try {
    titre('1. Dans la bougie de 16:00, minute par minute : rien ne bascule');
    for (const mode of ['debutant', 'expert']) {
      const h = H.harnais(reel, '2026-10-09T16:01:30Z');
      const o = await H.ouvrir(nav, h, { vue: { width: 1440, height: 900 }, mode });
      const vus = [];
      for (let m = 1; m <= 14; m++) {
        await H.avancer(o, h, '2026-10-09T16:' + String(m).padStart(2, '0') + ':30Z');
        const r = await o.page.evaluate(() => {
          const S = scenEtat, B = S.boite;
          return { prix: candles[candles.length - 1].close, ligne: B && B.deb ? B.texte : null, phrase: B && !B.deb ? (B.lignes[1] || {}).t || null : null,
            pointe: B && !B.deb ? B.lignes.findIndex(l => / ◂$/.test(l.t)) : null, lib3: (S.libelles || []).filter(l => l.rang === '3').map(l => l.t.replace(/^[↑↓] /, '')).join() };
        });
        vus.push(r);
      }
      const prix = new Set(vus.map(v => Math.round(v.prix))).size;
      const cles = mode === 'debutant' ? ['ligne'] : ['phrase', 'pointe', 'lib3'];
      for (const k of cles) {
        const val = [...new Set(vus.map(v => JSON.stringify(v[k])))];
        check(`${mode} : « ${k} » constant sur 14 minutes (${prix} prix différents) : ${val[0]}`, val.length === 1 && prix > 5, vus.map(v => [Math.round(v.prix), v[k]]));
      }
      check(`${mode} : aucune erreur JavaScript`, !o.erreurs.length, o.erreurs);
      await o.ctx.close();
    }

    titre('2. 19:08 (synthétique) : fait frais + figure — la ligne garde sa place');
    for (const vue of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      const h = H.harnais(synth, '2026-10-09T19:08:00Z');
      const o = await H.ouvrir(nav, h, { vue, mode: 'debutant', tactile: vue.width < 500 });
      // Une figure du Guide posée à coup sûr (comme test_scenarios_jour_revue_page.js).
      const r = await o.page.evaluate(() => {
        const n = candles.length, G = PARAM.guide, C = i => candles[i];
        const ia = n - 34, ic = n - 24, ib = n - 14, pa = Math.max(C(ia).high, C(ib).high), pc = C(ic).low;
        const f = { type: 'double_sommet', sens: -1, phase: 'confirme', a: { i: ia, p: pa }, b: { i: ib, p: pa }, cou: { i: ic, p: pc }, niveau: pc, objectif: pc - (pa - pc), t: ib + G.pivot, debut: ia, fin: null, jFin: null };
        window.__f0 = Guide.formesAffichees;
        Guide.formesAffichees = () => [f];
        drawChart();
        const B = scenEtat.boite;
        return { roles: debEtat.items.map(i => i.role), textes: debEtat.items.map(i => i.texte), cede: !!(B && B.cede), prio: !!(B && B.prioritaire), ligne: B && B.texte, frais: scenEtat.jour.frais.map(i => i.sc.rang) };
      });
      check(`${vue.width} : le 2 et le 3 frais, la ligne dit les deux (« ${r.ligne} »)`, r.frais.join() === '2,3' && /zone du 3 .*✓ · scén\. 2 ✗/.test(r.ligne || ''), r);
      // 1440 : la figure trouve sa place (l'arbitrage joue) ; 390 : elle peut ne pas en trouver, la ligne reste posée.
      const avecForme = r.roles.includes('forme');
      check(`${vue.width} : ${avecForme ? 'figure posée, ' : 'figure sans place, '}ligne prioritaire et posée${avecForme ? ', libellé cédé' : ''} ; ${r.roles.length} textes ≤ 5`, (avecForme ? !r.roles.includes('scenario') : vue.width < 500) && r.roles.includes('boite') && r.prio && !r.cede && r.roles.length <= 5, r);
      await o.page.evaluate(() => { Guide.formesAffichees = window.__f0; drawChart(); });
      check(`${vue.width} : aucune erreur JavaScript`, !o.erreurs.length, o.erreurs);
      await o.ctx.close();
    }

    titre('3. 20:06 (synthétique, contact en mèche) : la bulle de la ligne dit « zone » et « passage bref »');
    for (const vue of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
      const h = H.harnais(synth, '2026-10-09T20:06:00Z');
      const tel = vue.width < 500;
      const o = await H.ouvrir(nav, h, { vue, mode: 'debutant', tactile: tel });
      const it = await o.page.evaluate(() => { const i = debEtat.items.find(x => x.role === 'boite'); return i ? i.rect : null; });
      check(`${vue.width} : la ligne est posée`, !!it, it);
      if (it) {
        const b = await survoler(o, it, tel);
        const longue = /Valables jusqu’à/.test(b);
        check(`${vue.width} : bulle ${longue ? 'longue' : 'courte'} dessinée${tel ? '' : ' (la longue tient à 1440 × 900)'} ; la réalisation du 3 dit « zone » et « passage bref »`, b && (tel || longue) && /passage bref/.test(b) && /zone de 84 500 \$/.test(b) && !/vers 84 500 \$ — réalisé/.test(b), b.slice(0, 1200));
      }
      check(`${vue.width} : aucune erreur JavaScript`, !o.erreurs.length, o.erreurs);
      await o.ctx.close();
    }

    titre('4. Expert, téléphone : l’encadré replié dit la journée');
    {
      const h = H.harnais(synth, '2026-10-09T19:16:00Z');
      const o = await H.ouvrir(nav, h, { vue: { width: 390, height: 844 }, mode: 'expert', tactile: true });
      const B = await o.page.evaluate(() => { const B = scenEtat.boite; return B ? { x: B.x, y: B.y, w: B.w, h: Math.min(B.h, 14), replie: B.replie || B.serre } : null; });
      const b = B ? await survoler(o, B, true) : '';
      check(`bulle de l’encadré : « Seul en cours : 1 … », distances, « Reste … »`, /Seul en cours : 1/.test(b) && /bord toléré à [\d ]+ \$/.test(b) && /Reste \d+ h \d\d/.test(b), b.slice(0, 900));
      check('aucune erreur JavaScript', !o.erreurs.length, o.erreurs);
      await o.ctx.close();
    }

    titre('5. 1 h, Débutant : le libellé du range sur sa boîte');
    for (const quand of ['2026-10-09T15:00:00Z', '2026-10-09T18:00:00Z']) {
      const h = H.harnais(reel, quand);
      const o = await H.ouvrir(nav, h, { vue: { width: 1440, height: 900 }, mode: 'debutant' });
      await o.page.click('#int_1h'); await o.page.waitForTimeout(1200);
      const r = await o.page.evaluate(() => {
        const S = scenEtat, it = debEtat.items.find(i => i.role === 'scenario'), un = S.items.find(i => i.sc.rang === '1');
        return { itv: chartInterval, rect: it ? it.rect : null, t: it ? it.texte : null, xBox: Math.max(S.g.pad.left, S.xDeT(un.sc.emis)), forme: un.sc.forme };
      });
      check(`${quand.slice(11, 16)} : « ${r.t} » au moins à moitié dans la boîte du range (milieu ${r.rect && Math.round(r.rect.x + r.rect.w / 2)} ≥ ${Math.round(r.xBox)}), ou pas posé`, r.itv === '1h' && r.forme === 'range' && (!r.rect || r.rect.x + r.rect.w / 2 >= r.xBox - 1), r);
      check(`${quand.slice(11, 16)} : aucune erreur JavaScript`, !o.erreurs.length, o.erreurs);
      await o.ctx.close();
    }

    titre('6. Expert : marques lisibles, flèches');
    {
      const h = H.harnais(synth, '2026-10-09T19:08:00Z');
      const o = await H.ouvrir(nav, h, { vue: { width: 1440, height: 900 }, mode: 'expert' });
      const m = await o.page.evaluate(() => scenEtat.items.map(i => ({ rang: i.sc.rang, m: (i.marques || []).map(x => ({ x: x.x, y: x.y, ok: x.ok })) })));
      const ok3 = (m.find(i => i.rang === '3').m || []).find(x => x.ok), ko2 = (m.find(i => i.rang === '2').m || []).find(x => !x.ok);
      check(`19:08 : la coche du 3 et la croix du 2 (même contact) sont séparées (${ok3 && ko2 ? Math.round(Math.abs(ok3.y - ko2.y)) : '?'} px)`, ok3 && ko2 && (Math.abs(ok3.x - ko2.x) >= 8 || Math.abs(ok3.y - ko2.y) >= 8), m);
      check('19:08 : aucune erreur JavaScript', !o.erreurs.length, o.erreurs);
      await o.ctx.close();
    }
    for (const quand of ['2026-10-09T12:10:00Z', '2026-10-09T19:04:00Z']) {
      const h = H.harnais(synth, quand);
      const o = await H.ouvrir(nav, h, { vue: { width: 1440, height: 900 }, mode: 'expert' });
      const r = await o.page.evaluate(() => scenEtat.items.map(i => ({ rang: i.sc.rang, meneur: i.meneur, ouvert: i.ouvert, chemin: i.sc.forme === 'chemin', fleche: !!i.fleche })));
      const n = r.find(i => i.meneur && i.ouvert && i.chemin);
      check(`${quand.slice(11, 16)} : sans flèche pour le nommé (${n ? n.rang : '—'}), aucune autre flèche`, !n || n.fleche || !r.some(i => i.fleche), r);
      await o.ctx.close();
    }
  } finally {
    await nav.close();
    H.arreter();
  }
  console.log(ko ? `\n❌ JOURNÉE DES SCÉNARIOS, STABILITÉ À L'ÉCRAN : ${ko} CONTRÔLE(S) EN ÉCHEC` : '\n✅ JOURNÉE DES SCÉNARIOS, STABILITÉ À L\'ÉCRAN : TOUS LES CONTRÔLES PASSENT');
  process.exit(ko ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
