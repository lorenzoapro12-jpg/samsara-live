// La verticale du réticule traverse le tracé ET tous les sous-graphiques (RSI, Volume, OBV…),
// où que soit le curseur : on lit la même bougie partout d'un seul regard (demande de Lorenzo,
// 02/11/2026). Avant, curseur sur le tracé : la verticale s'arrêtait au bas du tracé ; curseur sur
// un sous-graphique : elle s'arrêtait au haut des sous-graphiques.
// Vrai navigateur (Chromium, Playwright), marché du 08/10/2026 15:40 UTC rejoué, tous les thèmes,
// ordinateur (1440) et téléphone (390, tactile).
// USAGE   node tests/test_reticule_page.js
const fs = require('fs'), path = require('path');
const H = require('./scenarios-jour-harnais');
const X = require('./fixtures/rejeu-jour-0810.json');

if (!H.playwright) {
  console.log('  − NON EXÉCUTÉ : Playwright introuvable — le réticule n\'est pas vérifié à l\'écran sur ce poste.');
  process.exit(0);
}
let ko = 0;
const check = (nom, ok, det) => { if (!ok) ko++; console.log(`  ${ok ? '✓' : '✗'} ${nom}${!ok && det !== undefined ? ' — ' + JSON.stringify(det).slice(0, 600) : ''}`); };
const THEMES = fs.readdirSync(path.join(__dirname, '..', 'themes')).filter(f => f.endsWith('.css')).map(f => f.replace(/\.css$/, ''));
const CAPTURES = process.env.CAPTURES_RETICULE;

/** Part des lignes de chaque bande [y0, y1[ où la colonne x porte un trait (pointillé : ≈ 50 %). */
const mesurer = (page, ou) => page.evaluate(ou => {
  for (const k of ['vol', 'rsi', 'obv']) activeSubs[k] = true;
  resizeCanvas(); drawChart();
  bulleTenue = null; crossListe = null; bulleDetail = null;
  const W = geo.W, x = Math.round(W * 0.45);
  const yCurseur = ou === 'trace' ? Math.round(geo.mainH * 0.5) : Math.round(geo.sous[geo.sous.length - 1].y + 20);
  crossX = x; crossY = yCurseur;
  dessinerCalque();
  const dpr = devicePixelRatio, g = calque.getContext('2d');
  const img = g.getImageData(Math.round((x - 1) * dpr), 0, Math.round(3 * dpr), calque.height).data, lw = Math.round(3 * dpr);
  const trait = y => { const r = Math.round(y * dpr); for (let i = 0; i < lw; i++) if (img[(r * lw + i) * 4 + 3] > 8) return true; return false; };
  const part = (y0, y1) => { let n = 0, t = 0; for (let y = Math.ceil(y0); y < y1; y++) { t++; if (trait(y)) n++; } return t ? n / t : 0; };
  return {
    sous: geo.sous.map(s => s.cle), mainH: geo.mainH, basSous: geo.basSous,
    trace: part(geo.mainH * 0.1, geo.mainH * 0.9),
    bandes: geo.sous.map(s => ({ cle: s.cle, part: part(s.y + 2, s.y + s.h - 2) })),
  };
}, ou);

(async () => {
  const nav = await H.playwright.chromium.launch();
  try {
    for (const W of [1440, 390]) for (const theme of THEMES) {
      const h = H.harnais(X, '2026-10-08T15:40:00Z');
      const o = await H.ouvrir(nav, h, { vue: { width: W, height: W < 500 ? 844 : 900 }, tactile: W < 500, theme, mode: 'expert', sansGuide: true });
      for (const ou of ['trace', 'sous']) {
        const m = await mesurer(o.page, ou);
        const ok = m.sous.length >= 1 && m.trace > 0.3 && m.bandes.every(b => b.part > 0.3);
        check(`${W} ${theme}, curseur sur ${ou === 'trace' ? 'le tracé' : 'un sous-graphique'} : verticale sur le tracé (${Math.round(m.trace * 100)} %) et ${m.bandes.map(b => b.cle + ' ' + Math.round(b.part * 100) + ' %').join(', ')}`, ok, m);
        if (CAPTURES && (theme === 'bureau95' || theme === 'aero')) await o.page.screenshot({ path: path.join(CAPTURES, `reticule-${theme}-${W}-${ou}.png`) });
      }
      check(`${W} ${theme} : aucune erreur de page`, !o.erreurs.length, o.erreurs);
      await o.ctx.close();
    }
  } finally { await nav.close(); }
  console.log(ko ? `\n${ko} échec(s)` : '\nRéticule : tout est vert.');
  process.exit(ko ? 1 : 0);
})();
