// Le tableau de toutes les figures (demande de Lorenzo du 19/11/2026), dans un vrai navigateur
// (Chromium, Playwright), sur le marché réel du 08/10/2026 15:40 UTC rejoué par
// tests/scenarios-jour-harnais.js.
//   1. « Bilan des figures » dans les Outils du menu ouvre le tableau (#fichePop) : le total en
//      quatre cases, une rangée par type vu (les plus validées d'abord), chaque compte égal au bilan
//      du rejeu ; le trait du hasard sur chaque barre d'objectif mesurée ; « Si raté » quand il y a
//      des cas ratés ; aucun mot banni.
//   2. Toucher le nom d'une figure ouvre ses statistiques ; « Toutes les figures ▸ » y ramène.
//   3. À 390 px dans cinq thèmes et à 1440 : le panneau dans l'écran, aucune rangée ni barre ne
//      déborde, pas de défilement horizontal, aucune erreur JavaScript.
// USAGE   node tests/test_tableau_figures_page.js
const path = require('path');
const H = require('./scenarios-jour-harnais');
const X = require('./fixtures/rejeu-jour-0810.json');
const G = require(path.join(__dirname, '..', 'js/guide.js'));

if (!H.playwright) {
  console.log('  − NON EXÉCUTÉ : Playwright introuvable — le tableau des figures n\'est pas vérifié à l\'écran sur ce poste.');
  process.exit(0);
}
let ko = 0;
const check = (nom, ok, det) => { if (!ok) ko++; console.log(`  ${ok ? '✓' : '✗'} ${nom}${!ok && det !== undefined ? ' — ' + JSON.stringify(det).slice(0, 700) : ''}`); };
const titre = t => console.log(`\n── ${t} ──`);

async function ouvrir(nav, theme, W) {
  const h = H.harnais(X, '2026-10-08T15:40:00Z');
  const o = await H.ouvrir(nav, h, { vue: { width: W, height: W < 500 ? 844 : 900 }, tactile: W < 500, theme, mode: 'debutant' });
  await o.page.waitForFunction(() => !document.documentElement.hasAttribute('data-structure-attendue') || document.documentElement.hasAttribute('data-structure-posee'), null, { timeout: 10000 }).catch(() => {});
  await o.page.waitForFunction(() => typeof GUIDE_FORMES !== 'undefined' && GUIDE_FORMES.val && GUIDE_FORMES.val.bilan, null, { timeout: 15000 }).catch(() => {});
  await o.page.waitForTimeout(300);
  return o;
}
const lire = page => page.evaluate(() => {
  const p = document.getElementById('fichePop'), r = p.getBoundingClientRect(), T = window.__tableauFigures, B = GUIDE_FORMES.val.bilan;
  const rangs = [...p.querySelectorAll('.tab-rang')].map(e => {
    const b = e.getBoundingClientRect();
    const hors = [...e.querySelectorAll('*')].filter(x => x.getClientRects().length).some(x => { const q = x.getBoundingClientRect(); return q.right > b.right + 0.5 || q.left < b.left - 0.5; });
    return { nom: e.querySelector('.tab-nom').textContent.replace(' ▸', ''), hasard: e.querySelectorAll('.tab-barre-obj .tab-hasard').length, rate: !!e.querySelector('.tab-rate'), hors };
  });
  const comptes = T ? T.rangs.every(x => { const b = B[x.type]; return x.validees === b.confirmes && x.atteints === b.atteints && x.annulees === b.invalidesAvant && x.finis === b.atteints + b.invalides + b.expires; }) : false;
  return { ouvert: !p.hidden, titre: (p.querySelector('.fiche-titre') || {}).textContent, cases: p.querySelectorAll('.tab-case').length, texte: p.innerText, rangs, comptes, T: T && { n: T.rangs.length, valid: T.rangs.map(x => x.validees), hasard: T.rangs.map(x => x.hasard !== null), rate: T.rangs.map(x => !!x.rate) },
    dedans: r.left >= -0.5 && r.right <= innerWidth + 0.5 && r.top >= -0.5 && r.bottom <= innerHeight + 0.5, scroll: document.documentElement.scrollWidth - innerWidth };
});

(async () => {
  const nav = await H.playwright.chromium.launch();
  try {
    titre('1. Le bouton des Outils ouvre le tableau, ses comptes sont ceux du bilan');
    for (const W of [390, 1440]) {
      const o = await ouvrir(nav, 'bureau95', W), p = o.page;
      await p.click('#indDropdownBtn'); await p.waitForTimeout(250);
      await p.click('#indMenu .aff-tableau'); await p.waitForTimeout(250);
      const d = await lire(p);
      const tri = d.T && d.T.valid.every((v, i, a) => !i || a[i - 1] >= v);
      check(`${W} px : « ${d.titre} », ${d.cases} cases de total, ${d.T && d.T.n} rangées triées par validées, comptes = bilan`, d.ouvert && d.titre === 'Toutes les figures' && d.cases === 4 && d.T && d.T.n >= 1 && d.rangs.length === d.T.n && tri && d.comptes, Object.assign({}, d, { texte: d.texte.slice(0, 300) }));
      check(`${W} px : le trait du hasard sur chaque barre d'objectif mesurée, « Si raté » quand il y a des cas ratés`, d.rangs.every((r, i) => r.hasard === (d.T.hasard[i] ? 1 : 0) || !d.T.hasard[i]) && d.rangs.every((r, i) => r.rate === d.T.rate[i]) && d.T.rate.some(Boolean), d.rangs);
      check(`${W} px : aucun mot banni, le hasard expliqué en tête`, !G.motsBannis(d.texte).length && /ce que ferait le hasard/.test(d.texte), G.motsBannis(d.texte));
      check(`${W} px : dans l'écran, rien ne déborde, pas de défilement de côté`, d.dedans && !d.rangs.some(r => r.hors) && d.scroll <= 0, { dedans: d.dedans, scroll: d.scroll, hors: d.rangs.filter(r => r.hors) });
      // 2. Une rangée → ses statistiques → retour.
      await p.click('#fichePop button.tab-nom'); await p.waitForTimeout(250);
      const s = await p.evaluate(() => ({ stats: !!window.__statsFigure && /statistiques/.test(document.querySelector('#fichePop .fiche-titre').textContent), retour: !!document.querySelector('#fichePop .tab-retour') }));
      await p.click('#fichePop .tab-retour'); await p.waitForTimeout(250);
      const r = await p.evaluate(() => document.querySelector('#fichePop .fiche-titre').textContent);
      check(`${W} px : le nom d'une figure ouvre ses statistiques ; « Toutes les figures ▸ » ramène au tableau`, s.stats && s.retour && r === 'Toutes les figures', { s, r });
      await p.keyboard.press('Escape'); await p.waitForTimeout(100);
      check(`${W} px : Échap le referme ; aucune erreur JavaScript`, await p.evaluate(() => document.getElementById('fichePop').hidden) && !o.erreurs.length, o.erreurs);
      await o.ctx.close();
    }
    titre('3. Cinq thèmes à 390 px');
    for (const th of ['aero', 'gazette', 'neon', 'diazo', 'kala']) {
      const o = await ouvrir(nav, th, 390), p = o.page;
      await p.evaluate(() => ouvrirTableauFigures()); await p.waitForTimeout(200);
      const d = await lire(p);
      check(`${th} : ${d.rangs.length} rangées, dans l'écran, rien ne déborde, aucune erreur`, d.ouvert && d.rangs.length >= 1 && d.dedans && !d.rangs.some(r => r.hors) && d.scroll <= 0 && !o.erreurs.length, { dedans: d.dedans, scroll: d.scroll, erreurs: o.erreurs, hors: d.rangs.filter(r => r.hors) });
      if (process.env.CAPTURES) await p.locator('#fichePop').screenshot({ path: path.join(process.env.CAPTURES, 'tableau-' + th + '-390.png') }).catch(() => {});
      await o.ctx.close();
    }
  } finally { await nav.close(); }
  console.log(ko ? `\n${ko} contrôle(s) en échec` : '\nTout est bon.');
  process.exit(ko ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
