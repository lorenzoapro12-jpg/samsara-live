// L'interface de la page, vérifiée dans un vrai navigateur (Chromium, Playwright) : ce qui ne
// se juge qu'à l'écran — où un menu s'ouvre, ce que le graphique dessine.
//
//   1. MENUS : Indicateurs, Thème, Paire s'ouvrent dans l'écran — sous leur bouton, ou au-dessus
//      quand la place manque en dessous (bouton dans une barre basse : Néon, barres des tâches),
//      bornés à 8 px des bords, défilants s'ils sont plus hauts que l'écran.
//
// Sans Playwright : « non exécuté », dit à l'écran (ce n'est pas un succès).
// USAGE   node tests/test_interface.js
const fs = require('fs'), path = require('path'), http = require('http');
const REPO = path.resolve(__dirname, '..');

let playwright = null;
for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright', process.env.PLAYWRIGHT_MODULE].filter(Boolean)) {
  try { playwright = require(p); break; } catch (e) { /* suivant */ }
}
if (!playwright) {
  console.log('  − NON EXÉCUTÉ : Playwright introuvable — l\'interface n\'est pas vérifiée sur ce poste.');
  process.exit(0);
}
let ko = 0;
const check = (nom, ok, det) => { if (!ok) ko++; console.log(`  ${ok ? '✓' : '✗'} ${nom}${!ok && det !== undefined ? ' — ' + JSON.stringify(det).slice(0, 400) : ''}`); };
const titre = t => console.log(`\n── ${t} ──`);

const index = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8');
const THEMES = [...index.matchAll(/<link\b[^>]*data-theme-id="([^"]+)"[^>]*>/g)].map(m => ({ id: m[1], structure: (m[0].match(/data-structure="([^"]+)"/) || [])[1] || null }));
const BASE = THEMES[0].id;

// Binance simulé : bougies déterministes (une sinusoïde), prix fixe.
function binance(url) {
  const u = new URL(url), q = u.searchParams, now = Date.now();
  if (u.pathname.endsWith('/klines')) {
    const pas = { '1m': 6e4, '5m': 3e5, '15m': 9e5, '1h': 36e5, '4h': 144e5, '1d': 864e5, '1w': 6048e5 }[q.get('interval')] || 9e5;
    const n = Math.min(1000, +q.get('limit') || 500), fin = q.get('endTime') ? Math.min(+q.get('endTime'), now) : now;
    return Array.from({ length: n }, (_, i) => { const t = Math.floor((fin - (n - 1 - i) * pas) / pas) * pas, c = 86000 + Math.sin(i / 7) * 300, o = c + (i % 2 ? 40 : -40);
      return [t, String(o), String(Math.max(o, c) + 60), String(Math.min(o, c) - 60), String(c), '80', t + pas - 1, String(80 * c), 50, '40', String(40 * c), '0']; });
  }
  if (u.pathname.endsWith('/ticker/price')) return { price: '86012.5' };
  if (u.pathname.endsWith('/ticker/24hr')) return { lastPrice: '86012.5', openPrice: '85700', priceChangePercent: '0.4', highPrice: '87000', lowPrice: '85000', bidPrice: '86012.4', askPrice: '86012.6', quoteVolume: '1e9', count: '100' };
  return {};
}
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2' };
const serveur = http.createServer((req, res) => {
  const f = path.join(REPO, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(REPO) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

async function ouvrir(nav, theme, vue) {
  const ctx = await nav.newContext({ viewport: vue, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const erreurs = [];
  page.on('pageerror', e => erreurs.push(e.message));
  await page.route('**/*', r => {
    const u = r.request().url(), h = new URL(u).host, cors = { 'access-control-allow-origin': '*' };
    if (h.startsWith('127.0.0.1')) return r.continue();
    if (h === 'api.binance.com') return r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(binance(u)) });
    if (h === 'raw.githubusercontent.com') return r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: fs.readFileSync(path.join(REPO, u.includes('heatmap') ? 'heatmap.json' : 'market-data.json')) });
    return r.abort();
  });
  await page.addInitScript(t => { try { localStorage.clear(); localStorage.setItem('samsara-theme', t); } catch (e) { /* */ } }, theme);
  await page.goto(`http://127.0.0.1:${serveur.address().port}/index.html`);
  await page.waitForTimeout(1800);
  return { ctx, page, erreurs };
}

/** Ouvre un menu par son bouton ; rend la boîte du menu, celle du bouton et la hauteur de l'écran. */
async function menu(page, bouton, id) {
  await page.evaluate(() => { for (const m of document.querySelectorAll('.open')) m.classList.remove('open'); });
  await page.click(bouton);
  await page.waitForTimeout(150);
  return page.evaluate(([b, id]) => {
    const m = document.getElementById(id), rm = m.getBoundingClientRect(), rb = document.querySelector(b).getBoundingClientRect();
    return { ouvert: m.classList.contains('open'), haut: rm.top, bas: rm.bottom, gauche: rm.left, droite: rm.right,
      boutonHaut: rb.top, boutonBas: rb.bottom, H: innerHeight, L: innerWidth, defile: m.scrollHeight > m.clientHeight + 1 };
  }, [bouton, id]);
}
const dansLEcran = m => m.ouvert && m.haut >= 8 - 0.5 && m.bas <= m.H - 8 + 0.5 && m.gauche >= 8 - 0.5 && m.droite <= m.L - 8 + 0.5;

(async () => {
  await new Promise(r => serveur.listen(0, '127.0.0.1', r));
  const nav = await playwright.chromium.launch();
  try {
    titre('1. Menus : dans l\'écran, au-dessus du bouton quand la place manque en dessous');
    const MENUS = [['Indicateurs', '#indDropdownBtn', 'indMenu'], ['Thème', '#themeBtn', 'themeMenu'], ['Paire', '#paireBtn', 'paireMenu']];
    for (const t of THEMES) {
      const o = await ouvrir(nav, t.id, { width: 1440, height: 900 });
      for (const [nom, b, id] of MENUS) {
        const m = await menu(o.page, b, id);
        const place = m.boutonBas + 8 + (m.bas - m.haut) <= m.H - 8;
        // Sous le bouton quand il y a la place ; sinon AU-DESSUS (jamais par-dessus le bouton).
        const cote = place ? m.haut >= m.boutonBas : m.bas <= m.boutonHaut;
        check(`${t.id.padEnd(9)} · menu ${nom.padEnd(11)} entier dans l'écran, ${place ? 'sous' : 'au-dessus de'} son bouton`, dansLEcran(m) && cote, m);
      }
      check(`${t.id.padEnd(9)} · aucune erreur JavaScript`, !o.erreurs.length, o.erreurs);
      await o.ctx.close();
    }
    // Un bouton en bas de l'écran (une barre des tâches) : le menu s'ouvre au-dessus. Les
    // boutons sont DÉPLACÉS dans une barre fixe (un `position: fixed` posé sur eux se mesurerait
    // dans l'en-tête, que son verre transforme en bloc conteneur).
    const o = await ouvrir(nav, BASE, { width: 1440, height: 900 });
    await o.page.evaluate(() => {
      const barre = document.createElement('div');
      barre.style.cssText = 'position:fixed;left:0;right:0;bottom:4px;display:flex;justify-content:space-between;z-index:2000';
      for (const id of ['paireBtn', 'indDropdownBtn', 'themeBtn']) barre.appendChild(document.getElementById(id));
      document.body.appendChild(barre);
    });
    for (const [nom, b, id] of MENUS) {
      const m = await menu(o.page, b, id);
      check(`bouton en bas de l'écran · menu ${nom.padEnd(11)} au-dessus du bouton, dans l'écran`, dansLEcran(m) && m.bas <= m.boutonHaut, m);
    }
    await o.ctx.close();
    // Écran plus bas que le menu : il prend le plus grand côté et y défile, sans recouvrir son
    // bouton ni sortir de l'écran.
    const p = await ouvrir(nav, BASE, { width: 1000, height: 260 });
    const m = await menu(p.page, '#themeBtn', 'themeMenu');
    check('écran de 260 px · menu Thème dans l\'écran, défilant, sans recouvrir son bouton', dansLEcran(m) && m.defile && (m.haut >= m.boutonBas || m.bas <= m.boutonHaut), m);
    await p.ctx.close();
  } finally { await nav.close(); serveur.close(); }
  console.log(ko ? `\n❌ INTERFACE : ${ko} contrôle(s) en échec` : '\n✅ INTERFACE : TOUS LES CONTRÔLES PASSENT');
  process.exit(ko ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
