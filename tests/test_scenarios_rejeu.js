// Rejeu ANIMÉ de la journée des scénarios du matin dans un vrai navigateur : le marché réel du
// 08/10/2026 (tests/fixtures/rejeu-jour-0810.json) avance quart d'heure par quart d'heure, et la
// bougie en cours BOUGE entre deux clôtures (le harnais la fait passer par 82 300, 81 900,
// 81 750 puis 82 200 $).
//
//   1. À chaque mise à jour (13:31 → 14:28 UTC, 4 par quart d'heure) : le nom affiché (meneur), le
//      montré et les écarts de la page = le calcul pur (js/scenarios.js) sur les mêmes bougies ;
//   2. A1 : le nom ne change qu'à une clôture de 15 min (jamais pendant la bougie en cours, sauf
//      si elle ferme le scénario nommé) ; autant de changements affichés que de changements du
//      calcul pur aux clôtures ; les écarts, eux, bougent avec le prix ;
//   3. la ligne Débutant suit : « En direct : le 2 (80 806 $) suit mieux le prix ▸ » quand le 2 est
//      nommé, le cas A quand le montré (le 1) l'est ; toujours « (en direct) » ou « En direct : » ;
//   4. journée « aucun » (06/10, niveaux modèle asymétriques), le 07/10 à 02:20 UTC : ligne G
//      « Aucun scénario ne tient plus (en direct) ▸ », Expert « Aucun scénario du matin ne décrit
//      ce mouvement ».
// SCEN_CAPTURES=dossier : écrit aussi les captures de relecture (rejeu-HHMM-mode-largeur.png), hors
// assertions, à regarder une à une.
// USAGE   node tests/test_scenarios_rejeu.js
const path = require('path');
const H = require('./scenarios-jour-harnais');
const S = require('../js/scenarios.js');
const X = require('./fixtures/rejeu-jour-0810.json');
const X06 = require('./fixtures/rejeu-jour-0610.json');

if (!H.playwright) {
  console.log('  − NON EXÉCUTÉ : Playwright introuvable — le rejeu de la journée n\'est pas vérifié à l\'écran sur ce poste.');
  process.exit(0);
}
let ko = 0;
const check = (nom, ok, det) => { if (!ok) ko++; console.log(`  ${ok ? '✓' : '✗'} ${nom}${!ok && det !== undefined ? ' — ' + JSON.stringify(det).slice(0, 600) : ''}`); };
const titre = t => console.log(`\n── ${t} ──`);
const proche = (a, b, tol) => (a === null && b === null) || (a !== null && b !== null && Math.abs(a - b) <= tol);
const hm = t => new Date(t).toISOString().slice(11, 16);
const VIVANTE = [82300, 81900, 81750, 82200];   // la clôture de la bougie en cours, de tick en tick
const TICKS = [1, 5, 9, 13];                      // minutes dans le quart d'heure

/** La ligne des scénarios (Débutant), posée ou cédée (alors dans la bulle du libellé). */
const ligne = page => page.evaluate(() => {
  const B = scenEtat && scenEtat.boite;
  return B ? { texte: B.texte || null, cede: !!B.cede, un: scenEtat.cibleUn ? scenEtat.cibleUn.texte.join('\n') : '' } : null;
});

(async () => {
  const nav = await H.playwright.chromium.launch();
  try {
    for (const [mode, vue] of [['debutant', { width: 1440, height: 900 }], ['expert', { width: 1440, height: 900 }], ['debutant', { width: 390, height: 844 }]]) {
      titre(`08/10, 13:31 → 14:28 UTC · ${mode} · ${vue.width} px (bougie en cours qui bouge)`);
      const h = H.harnais(X, '2026-10-08T13:31:00Z');
      let tick = 0;
      h.vivante = () => VIVANTE[tick % 4];
      const o = await H.ouvrir(nav, h, { vue, mode, tactile: vue.width < 500 });
      const suite = [];
      for (const q of ['13:30', '13:45', '14:00', '14:15']) {
        for (let k = 0; k < 4; k++) {
          tick = k;
          const t = Date.parse('2026-10-08T' + q + ':00Z') + TICKS[k] * 60000;
          await H.avancer(o, h, t);
          const e = await H.lire(o.page), ref = H.reference(S, h), L = await ligne(o.page);
          suite.push({ t, q, page: e.jour, ref, L, libelles: e.libelles });
          // Capture de relecture : le libellé du scénario survolé (sa bulle porte la ligne quand
          // celle-ci a cédé sa place à une figure du Guide).
          if (process.env.SCEN_CAPTURES && k === 1 && mode === 'debutant' && vue.width === 1440) {
            const r = await o.page.evaluate(() => { const it = debEtat.items.find(i => i.role === (scenEtat.boite && scenEtat.boite.cede ? 'scenario' : 'boite')); const b = canvas.getBoundingClientRect(); return it && it.rect ? { x: b.left + it.rect.x + it.rect.w / 2, y: b.top + it.rect.y + it.rect.h / 2 } : null; });
            if (r) { await o.page.mouse.move(r.x - 10, r.y); await o.page.mouse.move(r.x, r.y, { steps: 3 }); await o.page.waitForTimeout(200); }
            await o.page.screenshot({ path: path.join(process.env.SCEN_CAPTURES, 'rejeu-' + hm(t).replace(':', '') + '-' + mode + '-' + vue.width + '.png') });
            await o.page.mouse.move(2, 2); await o.page.waitForTimeout(100);
          }
          if (process.env.SCEN_CAPTURES && k === 1 && mode === 'expert' && q === '14:15') await o.page.screenshot({ path: path.join(process.env.SCEN_CAPTURES, 'rejeu-' + hm(t).replace(':', '') + '-' + mode + '-' + vue.width + '.png') });
        }
      }
      const diff = suite.filter(s => !s.page || s.page.meneur !== s.ref.meneur || s.page.montre !== s.ref.montre || s.page.cas !== s.ref.cas || !s.page.e.every((v, i) => proche(v, s.ref.e[i], 0.01)));
      check(`${mode} ${vue.width} : à chacune des 16 mises à jour, nom, montré, cas et écarts = calcul pur`, !diff.length, diff.map(s => [hm(s.t), s.page, s.ref]));
      // A1 : le nom ne change pas à l'intérieur d'un quart d'heure (sauf fermeture du nommé).
      const dedans = [];
      for (let i = 1; i < suite.length; i++) if (suite[i].q === suite[i - 1].q && suite[i].page && suite[i - 1].page && suite[i].page.meneur !== suite[i - 1].page.meneur && !suite[i].page.remplace) dedans.push([hm(suite[i].t), suite[i - 1].page.meneur, suite[i].page.meneur]);
      check(`${mode} ${vue.width} : A1 — le nom ne change jamais pendant la bougie en cours`, !dedans.length, dedans);
      const noms = suite.map(s => s.page && s.page.meneur), chg = noms.filter((n, i) => i && n !== noms[i - 1]).length;
      const nomsRef = suite.map(s => s.ref.meneur), chgRef = nomsRef.filter((n, i) => i && n !== nomsRef[i - 1]).length;
      check(`${mode} ${vue.width} : autant de changements affichés que de changements du calcul pur aux clôtures (${chg} = ${chgRef}) : ${suite.filter((s, i) => !i || noms[i] !== noms[i - 1]).map(s => hm(s.t) + ' ' + (s.page && s.page.meneur)).join(' → ')}`, chg === chgRef && chg >= 1, { noms, nomsRef });
      const bouge = suite.filter((s, i) => i && s.q === suite[i - 1].q && s.page && suite[i - 1].page && JSON.stringify(s.page.e) !== JSON.stringify(suite[i - 1].page.e)).length;
      check(`${mode} ${vue.width} : les écarts suivent le prix pendant la bougie en cours (${bouge} mises à jour sur 12)`, bouge >= 8, bouge);
      if (mode === 'debutant') {
        const etroit = vue.width < 500, faux = [];
        for (const s of suite) {
          const L = s.L, t = L && L.texte;
          if (!t) { faux.push([hm(s.t), 'pas de ligne', L]); continue; }
          if (!/\(en direct\)|^En direct : /.test(t)) faux.push([hm(s.t), 'sans « en direct »', t]);
          // Changé délibérément (revue) : le cas C seulement quand le nommé a le plus petit écart EN CE
          // MOMENT (s.page.net) ; un nom gardé par l'hystérésis reste dans les bulles (cas A sur la ligne).
          if (s.page.meneur === '2' && s.page.montre === '1' && s.page.net) { if (!(etroit ? /^En direct : le 2 \(80 806 \$\) suit mieux( le prix)? ▸$|^Scénario( du matin)? : en cours \(en direct\) ▸$/ : /^En direct : le 2 \(80 806 \$\) suit mieux le prix ▸$/).test(t)) faux.push([hm(s.t), 'cas C attendu', t]); }
          else if (s.page.meneur === '1' || s.page.cas === 'tot' || (s.page.meneur && !s.page.net)) { if (!/^Scénario( du matin)? : en cours \(en direct\) ▸$/.test(t)) faux.push([hm(s.t), 'cas A attendu', t]); }
          if (L.texte.length > (etroit ? 40 : 48)) faux.push([hm(s.t), 'trop longue', t]);
          // Le nom dit aussi dans la bulle du libellé (la ligne peut céder sa place à une figure).
          if (s.page.meneur && s.page.meneur !== s.page.montre && !new RegExp('^(Pour l’instant, le prix est le plus près de ce que décrit le scénario|Le scénario) ' + s.page.meneur + ' ', 'm').test(L.un)) faux.push([hm(s.t), 'bulle du libellé sans le nom', L.un.slice(0, 300)]);
        }
        check(`${mode} ${vue.width} : la ligne suit le nom (cas C quand le 2 est nommé, cas A quand c'est le 1), « (en direct) » partout, le nom aussi dans la bulle du libellé : ${[...new Set(suite.map(s => s.L && s.L.texte))].join(' / ')}`, !faux.length, faux);
        const lib = suite.filter(s => !(s.libelles.length === 1 && s.libelles[0].rang === '1'));
        check(`${mode} ${vue.width} : un seul libellé, celui du montré (le 1), qui ne change pas avec le nom`, !lib.length, lib.map(s => [hm(s.t), s.libelles]));
      } else {
        const ph = await o.page.evaluate(() => scenEtat.boite && scenEtat.boite.lignes.map(l => l.t));
        check(`${mode} ${vue.width} : l'encadré nomme le ${noms[noms.length - 1]} (« Plus petit écart pour l’instant : ${noms[noms.length - 1]} … », ou « … nom gardé : ${noms[noms.length - 1]} » quand un autre est un peu plus près)`, ph && ph.some(l => new RegExp('^(Plus petit écart pour l’instant : |Plus petit écart : |Écart min\\. : )' + noms[noms.length - 1] + '\\b|nom gardé : ' + noms[noms.length - 1] + '\\b').test(l)), ph);
      }
      check(`${mode} ${vue.width} : aucune erreur JavaScript`, !o.erreurs.length, o.erreurs);
      await o.ctx.close();
    }

    titre('06/10 (niveaux modèle asymétriques), le 07/10 à 02:20 UTC : aucun scénario ne tient plus');
    for (const [mode, vue] of [['debutant', { width: 1440, height: 900 }], ['debutant', { width: 390, height: 844 }], ['expert', { width: 1440, height: 900 }]]) {
      const h = H.harnais(X06, '2026-10-07T02:20:00Z');
      const o = await H.ouvrir(nav, h, { vue, mode, tactile: vue.width < 500 });
      if (process.env.SCEN_CAPTURES) await o.page.screenshot({ path: path.join(process.env.SCEN_CAPTURES, 'aucun-0220-' + mode + '-' + vue.width + '.png') });
      const e = await H.lire(o.page), ref = H.reference(S, h), L = await ligne(o.page);
      check(`${mode} ${vue.width} : cas « aucun », = calcul pur`, e.jour && e.jour.cas === 'aucun' && ref.cas === 'aucun', [e.jour, ref]);
      if (mode === 'debutant') check(`${mode} ${vue.width} : ligne G « ${L && L.texte} »`, L && (vue.width < 500 ? /^(Aucun scénario ne tient plus|Scénarios : aucun ne tient) \(en direct\) ▸$/ : /^Aucun scénario ne tient plus \(en direct\) ▸$/).test(L.texte), L);
      else check(`${mode} ${vue.width} : encadré « Aucun scénario du matin ne décrit ce mouvement »`, e.boite && e.boite.lignes.some(l => /^Aucun scénario (du matin )?ne décrit ce mouvement/.test(l)), e.boite);
      check(`${mode} ${vue.width} : aucune erreur JavaScript`, !o.erreurs.length, o.erreurs);
      await o.ctx.close();
    }
  } finally {
    await nav.close();
    H.arreter();
  }
  console.log(ko ? `\n❌ REJEU DE LA JOURNÉE : ${ko} CONTRÔLE(S) EN ÉCHEC` : '\n✅ REJEU DE LA JOURNÉE : TOUS LES CONTRÔLES PASSENT');
  process.exit(ko ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
