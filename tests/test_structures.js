// Les STRUCTURES de thème (js/structures.js), vérifiées dans un vrai navigateur.
//
// Un thème peut changer la structure de la page (décision du 06/10/2026). Le prix à payer : ce
// harnais. Pour chaque thème déclaré, sur bureau ET sur téléphone :
//   1. tout ce qui est VISIBLE dans la structure de base — chaque VALEUR et chaque ÂGE (prix,
//      variation, chiffres clés, âge de la publication, heure, cartes du marché, graphique,
//      boutons d'accès) — l'est encore : présent, non masqué, non recouvert, de taille non nulle ;
//   2. la structure est RÉVERSIBLE : revenir au thème de base rend la page nœud pour nœud ;
//   3. le décor ajouté est muet (aria-hidden) et n'intercepte pas le pointeur ;
//   4. aucune erreur JavaScript.
//
// Sans Playwright : « non exécuté », dit à l'écran (ce n'est pas un succès).
// USAGE   node tests/test_structures.js
const fs = require('fs'), path = require('path'), http = require('http');
const REPO = path.resolve(__dirname, '..');

let playwright = null;
for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright', process.env.PLAYWRIGHT_MODULE].filter(Boolean)) {
  try { playwright = require(p); break; } catch (e) { /* suivant */ }
}
if (!playwright) {
  console.log('  − NON EXÉCUTÉ : Playwright introuvable — les structures de thème ne sont pas vérifiées sur ce poste.');
  process.exit(0);
}
let ko = 0;
const check = (nom, ok, det) => { if (!ok) ko++; console.log(`  ${ok ? '✓' : '✗'} ${nom}${!ok && det !== undefined ? ' — ' + JSON.stringify(det).slice(0, 400) : ''}`); };
const titre = t => console.log(`\n── ${t} ──`);

const index = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8');
const THEMES = [...index.matchAll(/<link\b[^>]*data-theme-id="([^"]+)"[^>]*>/g)].map(m => ({ id: m[1], structure: (m[0].match(/data-structure="([^"]+)"/) || [])[1] || null }));
const BASE = THEMES[0].id;

// Ce qui doit rester visible : valeurs, âges, accès. `tous` : chaque élément trouvé compte.
const CIBLES = [
  ['prix', '#price'], ['variation 24 h', '#var24'], ['heure de publication', '#updated'],
  ['chiffres clés', '#cycle .kpi:not([hidden])', 'tous'], ['âge des chiffres clés', '#cycle .kpi-age'],
  ['graphique', '#chart'], ['ruban d’outils', '#indicatorBar'],
  ['cartes du marché', '#feed .demon-card', 'tous'], ['bandeau d’âge du marché', '#feed .age-banner', 'tous'],
  ['bouton thème', '#themeBtn'], ['bouton ⚡', '#liveBtn'], ['bouton mode', '#modeBtn'], ['bouton réglages', '#reglagesBtn'],
  ['bouton légendes', '#legendesBtn'], ['lien carte', '#carteBtn'], ['horloge', '#taskbarClock'],
];

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

async function ouvrir(nav, theme, vue) {
  const ctx = await nav.newContext({ viewport: vue });
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
  await page.waitForTimeout(2200);
  await page.keyboard.press('f');            // bureau : panneau ouvert ; téléphone : la fenêtre du marché
  await page.waitForTimeout(900);
  return { ctx, page, erreurs };
}

/** Pour chaque cible : combien d'éléments existent, combien sont réellement visibles. */
async function visibles(page) {
  return page.evaluate(CIBLES => {
    const vu = el => {
      if (!el) return false;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.1) return false;
      el.scrollIntoView({ block: 'center', inline: 'center' });
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return false;
      const x = Math.min(window.innerWidth - 1, Math.max(0, r.left + r.width / 2)), y = Math.min(window.innerHeight - 1, Math.max(0, r.top + Math.min(r.height / 2, 12)));
      if (r.right < 0 || r.bottom < 0 || r.left > window.innerWidth || r.top > window.innerHeight) return false;
      const dessus = document.elementFromPoint(x, y);
      return !!dessus && (dessus === el || el.contains(dessus) || dessus.contains(el));
    };
    const out = {};
    for (const [nom, sel, tous] of CIBLES) {
      // Sur téléphone, le marché s'ouvre dans une fenêtre : on y cherche aussi.
      const els = [...document.querySelectorAll(sel)].concat(sel.startsWith('#feed') ? [...document.querySelectorAll(sel.replace('#feed', '#marketModalBody'))] : []);
      const v = els.filter(vu);
      out[nom] = { trouves: els.length, visibles: v.length, tous: !!tous };
    }
    return out;
  }, CIBLES);
}

async function squelette(page) {
  return page.evaluate(() => {
    const sig = el => el.tagName + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).filter(c => !/^(on|open|active|collapsed|entree|deborde|ping|calme|vieux|price-up|price-down|pos|neg)$/.test(c)).sort().join('.') : '');
    const parcours = (el, d) => d > 4 ? [] : [sig(el)].concat(...[...el.children].filter(c => !['SCRIPT', 'svg'].includes(c.tagName) && !c.closest('#feed,#marketModalBody,#liveModalBody,#indMenu,#themeMenu,#stratStats,#stratParams,#stratHelp,#cycle,#fichePop,#reglagesPop'))
      .map(c => parcours(c, d + 1).map(s => '  '.repeat(d + 1) + s)));
    return parcours(document.body, 0).join('\n');
  });
}

(async () => {
  await new Promise(r => serveur.listen(0, '127.0.0.1', r));
  const nav = await playwright.chromium.launch();
  try {
    for (const [nomVue, vue] of [['bureau', { width: 1440, height: 900 }], ['téléphone', { width: 390, height: 800 }]]) {
      titre(`1. Valeurs et âges visibles — ${nomVue} (${vue.width} × ${vue.height})`);
      const base = await ouvrir(nav, BASE, vue);
      const ref = await visibles(base.page);
      await base.ctx.close();
      for (const t of THEMES) {
        const o = await ouvrir(nav, t.id, vue);
        const v = await visibles(o.page);
        const pertes = Object.entries(ref).filter(([nom, r]) => r.visibles > 0 && (v[nom].visibles === 0 || (r.tous && v[nom].visibles < Math.min(r.visibles, v[nom].trouves))))
          .map(([nom, r]) => `${nom} : ${v[nom].visibles}/${v[nom].trouves} visibles (base : ${r.visibles})`);
        const st = await o.page.evaluate(() => document.documentElement.getAttribute('data-structure'));
        check(`${t.id.padEnd(9)} ${t.structure ? '(structure « ' + t.structure + ' ») ' : ''}: rien de ce que la base montre ne disparaît`
          + (t.structure ? '' : ''), !pertes.length && (st || null) === t.structure, { pertes, structure: st });
        check(`${t.id.padEnd(9)} : aucune erreur JavaScript`, !o.erreurs.length, o.erreurs);
        await o.ctx.close();
      }
    }

    titre('2. Réversibilité : quitter un thème rend la page nœud pour nœud');
    const o = await ouvrir(nav, BASE, { width: 1440, height: 900 });
    const avant = await squelette(o.page);
    for (const t of THEMES.filter(x => x.structure)) {
      await o.page.evaluate(id => appliquerTheme(id), t.id);
      await o.page.waitForTimeout(300);
      const pendant = await squelette(o.page);
      check(`${t.id} : la structure change vraiment la page`, pendant !== avant);
      const decor = await o.page.evaluate(() => [...document.querySelectorAll('[class^="hud-"],[class*=" hud-"],[class^="codex-"],[class*=" codex-"]')]
        .filter(e => !e.querySelector('[id]')).filter(e => e.getAttribute('aria-hidden') !== 'true' || getComputedStyle(e).pointerEvents !== 'none' && !/tag|titre|fleuron|invite|colophon/.test(e.className))
        .map(e => e.className));
      check(`${t.id} : décor muet (aria-hidden) et sans interaction`, !decor.length, decor);
      await o.page.evaluate(id => appliquerTheme(id), BASE);
      await o.page.waitForTimeout(300);
      const apres = await squelette(o.page);
      check(`${t.id} → ${BASE} : page identique à l'origine`, apres === avant, { avant: avant.length, apres: apres.length });
    }
    check('aucune erreur JavaScript pendant les bascules', !o.erreurs.length, o.erreurs);
    await o.ctx.close();
  } finally { await nav.close(); serveur.close(); }
  console.log(ko ? `\n❌ STRUCTURES : ${ko} contrôle(s) en échec` : '\n✅ STRUCTURES : TOUS LES CONTRÔLES PASSENT');
  process.exit(ko ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
