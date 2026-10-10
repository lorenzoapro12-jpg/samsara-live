// La structure « fenetres » (thèmes Bureau 95 et Bureau 95 contraste), vérifiée dans Chromium.
//
// tests/test_structures.js garantit, pour TOUT thème, qu'aucune valeur ni aucun âge ne disparaît et
// que la structure se défait nœud pour nœud. Ici, ce que cette structure promet en propre :
//   1. la BARRE DES TÂCHES, pleine largeur en bas : Démarrer (le menu des thèmes, qui s'ouvre
//      AU-DESSUS et laisse le bouton enfoncé tant qu'il est ouvert), le lancement rapide (les six
//      boutons d'accès de l'en-tête, dans leur ordre), la zone de notification (point live, heure de
//      publication, horloge) ;
//   2. la FENÊTRE du graphique : barre de titre, barre d'outils, zone client, barre d'état, de haut
//      en bas, sans chevauchement ; le canvas occupe exactement la zone client ;
//   3. la BARRE D'ÉTAT : chaque chiffre clé visible l'est EN ENTIER, l'âge reste ; une publication
//      en retard garde ses minutes et prend l'icône d'avertissement ;
//   4. quand la fenêtre change de LARGEUR (le marché live s'ouvre), les chiffres clés sont
//      réajustés et le canvas redimensionné AUSSITÔT — avant, la bande restait coupée ;
//   5. la fenêtre du marché live s'allume au survol (barre de titre active) ; la police du canvas
//      loge un prix dans la colonne fixe de l'info-bulle ;
//   6. au TÉLÉPHONE : barre des tâches de 40 px, cibles d'au moins 32 × 34 px, rien ne déborde ni
//      ne se chevauche (390 et 360 px), le prix entier, la barre d'état garde un chiffre et l'âge.
//
// Sans Playwright : « non exécuté », dit à l'écran (ce n'est pas un succès).
// USAGE   node tests/test_fenetres.js
const fs = require('fs'), path = require('path'), http = require('http');
const { previsionsFixture, estPrevisions } = require('./previsions-fixture');   // scénarios du matin (branche previsions)
const REPO = path.resolve(__dirname, '..');

let playwright = null;
for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright', process.env.PLAYWRIGHT_MODULE].filter(Boolean)) {
  try { playwright = require(p); break; } catch (e) { /* suivant */ }
}
if (!playwright) {
  console.log('  − NON EXÉCUTÉ : Playwright introuvable — la structure « fenetres » n\'est pas vérifiée sur ce poste.');
  process.exit(0);
}
let ko = 0;
const check = (nom, ok, det) => { if (!ok) ko++; console.log(`  ${ok ? '✓' : '✗'} ${nom}${!ok && det !== undefined ? ' — ' + JSON.stringify(det).slice(0, 500) : ''}`); };
const titre = t => console.log(`\n── ${t} ──`);

const index = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8');
const THEMES = [...index.matchAll(/<link\b[^>]*data-theme-id="([^"]+)"[^>]*>/g)]
  .filter(m => /data-structure="fenetres"/.test(m[0])).map(m => m[1]);

// Binance simulé (bougies déterministes, prix fixe) ; market-data.json du dépôt, vieilli de 3 h
// (publicationVieille) : EN RETARD pour la page, le cas de l'icône d'avertissement.
function binance(url) {
  const u = new URL(url), q = u.searchParams, now = Date.now();
  if (u.pathname.endsWith('/klines')) {
    const pas = { '1m': 6e4, '5m': 3e5, '15m': 9e5, '1h': 36e5, '4h': 144e5, '1d': 864e5, '1w': 6048e5 }[q.get('interval')] || 9e5;
    const n = Math.min(1000, +q.get('limit') || 500), fin = q.get('endTime') ? Math.min(+q.get('endTime'), now) : now;
    return Array.from({ length: n }, (_, i) => { const t = Math.floor((fin - (n - 1 - i) * pas) / pas) * pas, c = 86000 + Math.sin(i / 7) * 300;
      return [t, String(c - 20), String(c + 60), String(c - 60), String(c), '80', t + pas - 1, String(80 * c), 50, '40', String(40 * c), '0']; });
  }
  if (u.pathname.endsWith('/ticker/price')) return { price: '86012.5' };
  if (u.pathname.endsWith('/ticker/24hr')) return { lastPrice: '86012.5', priceChangePercent: '0.4', highPrice: '87000', lowPrice: '85000', bidPrice: '86012.4', askPrice: '86012.6', quoteVolume: '1e9', count: '100' };
  return {};
}
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2' };
const serveur = http.createServer((req, res) => {
  const f = path.join(REPO, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(REPO) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

// La publication servie est VIEILLIE de 3 h, construite ici : le fichier du dépôt est réécrit
// toutes les 15 min par le serveur, et un test qui le servait tel quel passait ou échouait selon
// l'heure du dernier cron (rouge dès que la publication était fraîche). Un cas « en retard » se
// fabrique, il ne s'attend pas.
function publicationVieille() {
  const md = JSON.parse(fs.readFileSync(path.join(REPO, 'market-data.json'), 'utf8'));
  md.updated = new Date(Date.now() - 3 * 3600e3).toISOString();
  return JSON.stringify(md);
}
async function ouvrir(nav, theme, vue) {
  const ctx = await nav.newContext({ viewport: vue, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const erreurs = [];
  page.on('pageerror', e => erreurs.push(e.message));
  await page.route('**/*', r => {
    const u = r.request().url(), h = new URL(u).host, cors = { 'access-control-allow-origin': '*' };
    if (h.startsWith('127.0.0.1')) return r.continue();
    if (h === 'api.binance.com') return r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(binance(u)) });
    if (estPrevisions(u)) return r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: previsionsFixture() });
    if (h === 'raw.githubusercontent.com') return r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: u.includes('heatmap') ? fs.readFileSync(path.join(REPO, 'heatmap.json')) : publicationVieille() });
    return r.abort();
  });
// Mode Complet : ce test mesure les éléments denses (chiffres clés, menus, sous-graphes…), masqués
  // en Lisible (le mode par défaut) ; leur version Lisible est vérifiée dans test_debutant_page.js.
  await page.addInitScript(t => { try { localStorage.clear(); localStorage.setItem('samsara-mode', 'expert'); localStorage.setItem('samsara-theme', t); } catch (e) { /* */ } }, theme);
  await page.goto(`http://127.0.0.1:${serveur.address().port}/index.html`);
  await page.waitForTimeout(2000);
  return { ctx, page, erreurs };
}

// Boîtes utiles, en px entiers d'écran.
const boites = page => page.evaluate(() => {
  const R = el => { if (!el) return null; const r = el.getBoundingClientRect(); return { g: r.left, d: r.right, h: r.top, b: r.bottom, l: r.width, t: r.height }; };
  const $ = s => document.querySelector(s), cc = $('.chart-container'), cs = getComputedStyle(cc), rc = cc.getBoundingClientRect();
  const cy = $('#cycle'), kpis = [...cy.querySelectorAll('.kpi')].filter(k => !k.hidden);
  return {
    L: innerWidth, H: innerHeight, barre: R($('.aero-taskbar')), demarrer: R($('#themeBtn')), lancement: R($('.f95-lancement')), zone: R($('.f95-zone')),
    titre: R($('.chart-container > .f95-titre')), outils: R($('#indicatorBar')), canvas: R($('#chart')), etat: R($('.f95-etat')), fenetre: R(cc),
    client: { g: rc.left + cc.clientLeft + parseFloat(cs.paddingLeft), d: rc.left + cc.clientLeft + cc.clientWidth - parseFloat(cs.paddingRight),
              h: rc.top + cc.clientTop + parseFloat(cs.paddingTop), b: rc.top + cc.clientTop + cc.clientHeight - parseFloat(cs.paddingBottom) },
    cycle: R(cy), deborde: cy.scrollWidth - cy.clientWidth, kpis: kpis.map(R), nKpis: kpis.length, age: R($('#cycle .kpi-age')),
    prix: R($('#price')), mode: R($('#modeBtn')), entete: R($('.header')),
    boutons: [...document.querySelectorAll('.f95-lancement > *')].map(R),
  };
});
const dedans = (a, b, m = 0.5) => a && b && a.g >= b.g - m && a.d <= b.d + m && a.h >= b.h - m && a.b <= b.b + m;

(async () => {
  await new Promise(r => serveur.listen(0, '127.0.0.1', r));
  const nav = await playwright.chromium.launch();
  try {
    check(`au moins un thème déclare data-structure="fenetres"`, THEMES.length > 0, THEMES);
    for (const theme of THEMES) {
      titre(`${theme} — bureau (1440 × 900)`);
      const o = await ouvrir(nav, theme, { width: 1440, height: 900 });
      const p = o.page;
      // 1. Barre des tâches
      const place = await p.evaluate(() => {
        const tl = document.querySelector('.taskbar-left'), lr = document.querySelector('.f95-lancement'), z = document.querySelector('.f95-zone');
        return { premier: tl && tl.firstElementChild && tl.firstElementChild.id, lancement: lr ? [...lr.children].map(e => e.id || e.getAttribute('onclick')) : null,
          zone: z ? ['dot', 'updated', 'taskbarClock'].every(id => z.contains(document.getElementById(id))) : false };
      });
      let b = await boites(p);
      check('barre des tâches pleine largeur, collée au bas de l\'écran', b.barre && b.barre.g === 0 && Math.abs(b.barre.d - b.L) < 0.5 && Math.abs(b.barre.b - b.H) < 0.5, b.barre);
      check('Démarrer en tête de la barre ; lancement rapide = les six boutons d\'accès, dans l\'ordre ; zone : point live, publication, horloge',
        // (le bouton ↺ porte désormais un id, resetBtn : la pastille Lisible le désigne)
        place.premier === 'themeBtn' && JSON.stringify(place.lancement) === JSON.stringify(['feedBtn', 'liveBtn', 'resetBtn', 'carteBtn', 'reglagesBtn', 'legendesBtn']) && place.zone, place);
      // Démarrer : enfoncé tant que son menu est ouvert ; le menu au-dessus du bouton.
      const ombre = () => p.evaluate(() => getComputedStyle(document.getElementById('themeBtn')).boxShadow);
      const repos = await ombre();
      await p.click('#themeBtn'); await p.waitForTimeout(150);
      const ouvert = await ombre();
      const menu = await p.evaluate(() => { const m = document.getElementById('themeMenu'), r = m.getBoundingClientRect(), rb = document.getElementById('themeBtn').getBoundingClientRect();
        return { open: m.classList.contains('open'), bas: r.bottom, haut: r.top, bouton: rb.top }; });
      await p.keyboard.press('Escape'); await p.waitForTimeout(100);
      const ferme = await ombre();
      check('Démarrer : son menu s\'ouvre au-dessus de lui, le bouton reste enfoncé tant qu\'il est ouvert',
        menu.open && menu.bas <= menu.bouton && menu.haut >= 8 && ouvert !== repos && ferme === repos, { menu, repos, ouvert, ferme });
      // 2. La fenêtre du graphique
      check('fenêtre : barre de titre ▸ barre d\'outils ▸ zone client ▸ barre d\'état, sans chevauchement, dans la fenêtre',
        b.titre && b.outils && b.etat && b.titre.b <= b.outils.h + 0.5 && b.outils.b <= b.canvas.h + 0.5 && b.canvas.b <= b.etat.h + 0.5
        && [b.titre, b.outils, b.canvas, b.etat].every(x => dedans(x, b.fenetre)), b);
      check('le canvas occupe exactement la zone client', ['g', 'd', 'h', 'b'].every(k => Math.abs(b.canvas[k] - b.client[k]) <= 1), { canvas: b.canvas, client: b.client });
      // 3. La barre d'état
      check(`barre d'état : ${b.nKpis} chiffre(s) clé(s), chacun ENTIER ; l'âge dedans`,
        b.nKpis > 0 && b.deborde <= 1 && b.kpis.every(k => dedans(k, b.cycle)) && dedans(b.age, b.etat), { deborde: b.deborde, cycle: b.cycle, kpis: b.kpis, age: b.age });
      const retard = await p.evaluate(() => { const a = document.querySelector('#cycle .kpi-age'), cy = document.getElementById('cycle');
        return { vieux: cy.classList.contains('vieux'), texte: a.textContent, icone: getComputedStyle(a, '::before').backgroundImage }; });
      check(`publication en retard (« ${retard.texte} ») : les minutes restent, l'icône d'avertissement s'ajoute`,
        retard.vieux && /\d+ min/.test(retard.texte) && /^url\("data:image\/svg/.test(retard.icone), retard);
      // 5. Fenêtre active : le marché live au survol
      await p.keyboard.press('f'); await p.waitForTimeout(400);
      await p.mouse.move(700, 450); await p.waitForTimeout(100);
      const fond = s => p.evaluate(s => getComputedStyle(document.querySelector(s)).backgroundImage + ' ' + getComputedStyle(document.querySelector(s)).backgroundColor, s);
      const inactive = await fond('#feedPanel > .f95-titre'), graphique = await fond('.chart-container > .f95-titre');
      await p.hover('#feed'); await p.waitForTimeout(100);
      const active = await fond('#feedPanel > .f95-titre');
      check('fenêtre active : le graphique l\'est ; le marché live s\'allume au survol, s\'éteint sinon',
        inactive !== active && active === graphique, { inactive, active, graphique });
      // L'info-bulle du graphique place « O … » et « H … » à 60 px d'écart (abscisses fixes de
      // drawChart) : la police du canvas doit y loger un prix à cinq chiffres et deux décimales.
      const colonne = await p.evaluate(() => { const g = document.createElement('canvas').getContext('2d'); g.font = chartFont(10, 600);
        return { police: g.font, largeur: g.measureText('O ' + fmtPrix(99999.99)).width }; });
      check(`info-bulle : « O 99999.99 » tient dans sa colonne de 60 px (${colonne.largeur.toFixed(1)} px)`, colonne.largeur <= 57, colonne);
      check('aucune erreur JavaScript', !o.erreurs.length, o.erreurs);
      await o.ctx.close();

      // 4. La fenêtre change de largeur : chiffres clés réajustés, canvas redimensionné, aussitôt.
      titre(`${theme} — largeur de la fenêtre (1100 × 800) : le marché live s'ouvre puis se replie`);
      const o2 = await ouvrir(nav, theme, { width: 1100, height: 800 });
      const avant = await boites(o2.page);
      await o2.page.keyboard.press('f'); await o2.page.waitForTimeout(150);      // < 350 ms, le délai de toggleFeed
      const pendant = await boites(o2.page);
      await o2.page.keyboard.press('f'); await o2.page.waitForTimeout(150);
      const apres = await boites(o2.page);
      check(`ouvert : la barre d'état rétrécit, ${avant.nKpis} → ${pendant.nKpis} chiffres clés, aucun coupé`,
        pendant.cycle.l < avant.cycle.l && pendant.nKpis < avant.nKpis && pendant.deborde <= 1 && pendant.kpis.every(k => dedans(k, pendant.cycle)),
        { avant: [avant.cycle.l, avant.nKpis], pendant: [pendant.cycle.l, pendant.nKpis, pendant.deborde] });
      check('ouvert : le canvas suit la zone client sans attendre', ['g', 'd'].every(k => Math.abs(pendant.canvas[k] - pendant.client[k]) <= 1), { canvas: pendant.canvas, client: pendant.client });
      check(`replié : ${apres.nKpis} chiffres clés, comme avant`, apres.nKpis === avant.nKpis && apres.deborde <= 1, { avant: avant.nKpis, apres: apres.nKpis });
      check('aucune erreur JavaScript', !o2.erreurs.length, o2.erreurs);
      await o2.ctx.close();

      // 6. Téléphone
      for (const vue of [{ width: 390, height: 800 }, { width: 360, height: 740 }]) {
        titre(`${theme} — téléphone (${vue.width} × ${vue.height})`);
        const o3 = await ouvrir(nav, theme, vue);
        const t = await boites(o3.page);
        check(`barre des tâches de 40 px ; Démarrer et les ${t.boutons.length} boutons du lancement font au moins 32 × 34 px`,
          Math.abs(t.barre.t - 40) < 0.5 && t.demarrer.l >= 32 && t.demarrer.t >= 34 && t.boutons.length === 6 && t.boutons.every(x => x.l >= 32 && x.t >= 34), { barre: t.barre, demarrer: t.demarrer, boutons: t.boutons });
        check('rien ne déborde ni ne se chevauche : Démarrer | lancement rapide | zone de notification',
          t.demarrer.d <= t.lancement.g + 0.5 && t.lancement.d <= t.zone.g + 0.5 && t.zone.d <= t.L + 0.5 && t.demarrer.g >= -0.5, { demarrer: t.demarrer, lancement: t.lancement, zone: t.zone, L: t.L });
        check('le prix entier dans l\'en-tête, sans chevaucher le bouton de mode', dedans(t.prix, t.entete) && t.prix.d <= t.mode.g + 0.5, { prix: t.prix, mode: t.mode, entete: t.entete });
        check(`la barre d'état garde ${t.nKpis} chiffre(s) clé(s) entier(s) et l'âge`, t.nKpis >= 1 && t.deborde <= 1 && t.kpis.every(k => dedans(k, t.cycle)) && dedans(t.age, t.etat), { n: t.nKpis, deborde: t.deborde });
        check('aucune erreur JavaScript', !o3.erreurs.length, o3.erreurs);
        await o3.ctx.close();
      }
    }
  } finally { await nav.close(); serveur.close(); }
  console.log(ko ? `\n❌ FENÊTRES : ${ko} contrôle(s) en échec` : '\n✅ FENÊTRES : TOUS LES CONTRÔLES PASSENT');
  process.exit(ko ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
