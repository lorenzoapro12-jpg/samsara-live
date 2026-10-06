// Le BUDGET D'IMAGE de chaque thème, MESURÉ dans un vrai navigateur (Chromium, Playwright).
//
// POURQUOI (06/10/2026)
// ---------------------
// Le contrat interdisait dans toute feuille servie `filter: blur`, `mix-blend-mode`, les
// animations infinies — trois règles APPRISES (mesures du 05/10 : flou sur le graphique 33 →
// 17 ms/image sans ; une animation infinie redessinait la page au repos). Ce sont précisément les
// outils d'un thème cyberpunk. La règle est donc RÉVISÉE en la mesurant, pas contournée : un
// thème peut utiliser ces effets s'il tient son budget, mesuré ici contre le thème de référence
// (Kāla, « le chemin le plus rapide de la page »), sur la même machine, dans la même exécution.
//
// CE QUI EST MESURÉ : le temps CPU de TOUS les processus du navigateur (SystemInfo.getProcessInfo
// — page, navigateur, processus graphique). Première version : le seul thread principal de la
// page. La contre-épreuve du flou l'a prise en défaut (06/10/2026) : un flou posé sur le
// graphique n'y coûtait RIEN (×1,02), parce qu'il se calcule à la composition, dans le
// processus graphique (21,7 → 39 ms par image ici). Une mesure qui ne voit pas ce que la règle
// interdisait ne peut pas la remplacer : on compte donc tout.
//   · au repos   : ms de CPU par seconde, 3 s sans interaction. Une animation infinie qui
//                  REPEINT (fond, ombre, couleur…) coûte cher ici ; une animation de `transform`
//                  / `opacity` coûte la seule composition (bien moins, mais pas rien).
//   · en geste   : ms de CPU par image pendant un glissement du graphique (une image = un
//                  déplacement) — ce que le flou posé sur le graphique faisait exploser.
// Le temps du seul thread principal est aussi relevé (colonne « principal »), pour le diagnostic.
// Médiane de 3 essais. Les rapports au thème de référence sont portables d'une machine à l'autre ;
// les millisecondes absolues ne le sont pas (ce conteneur n'a pas de GPU : rendu logiciel).
//
// BUDGET (tests/budget-themes.json garde la dernière mesure de chaque thème, avec l'empreinte
// de sa feuille : tests/test_contrat.py refuse un effet coûteux sans mesure à jour)
//   · repos : ≤ BUDGET.reposRapport × référence (ms de CPU par seconde)
//   · geste : ≤ BUDGET.gesteRapport × référence (ms de CPU par image)
// Seuils fixés le 06/10/2026 entre les thèmes tels qu'ils sont et les contre-épreuves, qui
// doivent rester DEHORS (les rapports mesurés sont consignés dans tests/budget-themes.json).
//
// PÉRIMÈTRE : le budget JUGE les thèmes sans verre (data-verre="aucun"). Les thèmes à verre
// (Aero, Aero nuit) sont MESURÉS et rapportés, pas jugés : leur coût relève de la règle 3 du
// contrat (verre choisi par le thème, appliqué par la structure) et d'un garde-fou à
// l'exécution (js/app.js : la réfraction se coupe au-delà de 22 ms par image).
//
// USAGE   node tests/test_budget.js                    # mesure et vérifie tous les thèmes
//         node tests/test_budget.js neon codex         # ces thèmes (+ la référence)
//         node tests/test_budget.js --enregistrer      # … et met à jour tests/budget-themes.json
//         --sans-contre-epreuves                       # pour itérer vite (rien n'est enregistré)
const fs = require('fs'), path = require('path'), http = require('http'), crypto = require('crypto');
const REPO = path.resolve(__dirname, '..');
const FICHIER = path.join(__dirname, 'budget-themes.json');
const BUDGET = { reposRapport: 1.6, gesteRapport: 1.3 };
const REFERENCE = 'kala';

let playwright = null;
for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright', process.env.PLAYWRIGHT_MODULE].filter(Boolean)) {
  try { playwright = require(p); break; } catch (e) { /* suivant */ }
}
if (!playwright) {
  console.log('  − NON EXÉCUTÉ : Playwright introuvable — le budget n\'est pas re-mesuré sur ce poste.');
  console.log('    (tests/test_contrat.py vérifie quand même que chaque thème coûteux a une mesure à jour.)');
  process.exit(0);
}

const index = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8');
const DECLARES = [...index.matchAll(/<link\b[^>]*data-theme-id="([^"]+)"[^>]*>/g)].map(m => ({
  id: m[1], href: (m[0].match(/href="([^"]+)"/) || [])[1], structure: (m[0].match(/data-structure="([^"]+)"/) || [])[1] || null,
  verre: (m[0].match(/data-verre="([^"]+)"/) || [])[1] || 'aucun' }));
const DEMANDES = process.argv.slice(2).filter(a => !a.startsWith('--'));
const THEMES = DEMANDES.length ? DECLARES.filter(t => t.id === REFERENCE || DEMANDES.includes(t.id)) : DECLARES;
const SANS_CE = process.argv.includes('--sans-contre-epreuves');
const empreinte = f => crypto.createHash('sha256').update(fs.readFileSync(path.join(REPO, f))).digest('hex').slice(0, 16);

// ── Données simulées : bougies, prix, fichier publié ─────────────────────────
const MAINTENANT = Date.now();
let seed = 9;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const MS = { '1m': 6e4, '5m': 3e5, '15m': 9e5, '30m': 18e5, '1h': 36e5, '4h': 144e5, '1d': 864e5, '1w': 6048e5 };
function klines(itv, n, fin) {
  const pas = MS[itv] || 9e5, out = [];
  let p = 86000;
  const t1 = Math.min(fin || MAINTENANT, MAINTENANT);
  for (let i = n - 1; i >= 0; i--) {
    const t = Math.floor((t1 - i * pas) / pas) * pas, o = p, c = p + (rnd() - 0.5) * 300, v = 50 + rnd() * 100;
    out.push([t, o.toFixed(2), (Math.max(o, c) + rnd() * 80).toFixed(2), (Math.min(o, c) - rnd() * 80).toFixed(2), c.toFixed(2), v.toFixed(3), t + pas - 1, String(v * c), 100, String(v / 2), String(v * c / 2), '0']);
    p = c;
  }
  return out;
}
function binance(url) {
  const u = new URL(url), q = u.searchParams;
  if (u.pathname.endsWith('/klines')) return klines(q.get('interval'), Math.min(1000, +q.get('limit') || 500), q.get('endTime') ? +q.get('endTime') : null);
  if (u.pathname.endsWith('/ticker/price')) return { symbol: q.get('symbol'), price: '86012.50' };
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

// CONTRE-ÉPREUVES : ce que l'ancienne règle interdisait, injecté dans le thème de référence. Le
// budget n'a de sens que s'il les REFUSE ; sinon c'est la mesure qui est aveugle, et le harnais
// échoue. (Mesuré le 06/10/2026 : voir tests/budget-themes.json.)
const CONTRE_EPREUVES = {
  'animation infinie qui repeint (fond)': '[data-theme] body::after { content: ""; position: fixed; inset: 0; pointer-events: none; z-index: 5;'
    + ' background: repeating-linear-gradient(90deg, rgba(255,0,0,.04) 0 2px, transparent 2px 8px); animation: ce-fond 1s linear infinite; }'
    + ' @keyframes ce-fond { to { background-position: 80px 0; } }',
  'flou posé sur le graphique': '[data-theme] .chart-container canvas { filter: blur(2px) saturate(1.4); }',
};

async function mesurer(nav, theme, injection, bc) {
  const ctx = await nav.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.route('**/*', r => {
    const u = r.request().url(), h = new URL(u).host, cors = { 'access-control-allow-origin': '*' };
    if (h.startsWith('127.0.0.1')) return r.continue();
    if (h === 'api.binance.com') return r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(binance(u)) });
    if (h === 'raw.githubusercontent.com') return r.fulfill({ status: 200, contentType: 'application/json', headers: cors,
      body: fs.readFileSync(path.join(REPO, u.includes('heatmap') ? 'heatmap.json' : 'market-data.json')) });
    return r.abort();
  });
  await page.addInitScript(t => { try { localStorage.clear(); localStorage.setItem('samsara-theme', t); } catch (e) { /* */ } }, theme);
  await page.goto(`http://127.0.0.1:${serveur.address().port}/index.html`);
  if (injection) await page.addStyleTag({ content: injection });
  await page.waitForTimeout(2500);
  await page.keyboard.press('f');                       // panneau du marché ouvert : la page complète
  await page.waitForTimeout(1500);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Performance.enable');
  const tache = async () => (await cdp.send('Performance.getMetrics')).metrics.find(m => m.name === 'TaskDuration').value * 1000;
  const cpu = async () => (await bc.send('SystemInfo.getProcessInfo')).processInfo.reduce((s, p) => s + p.cpuTime, 0) * 1000;
  // Repos : 3 s sans rien toucher.
  const r0 = await tache(), c0 = await cpu();
  await page.waitForTimeout(3000);
  const principalRepos = (await tache() - r0) / 3, repos = (await cpu() - c0) / 3;
  // Geste : glisser le graphique, un déplacement par image, 90 images.
  const box = await page.$eval('#chart', c => { const r = c.getBoundingClientRect(); return { x: r.left + r.width * 0.6, y: r.top + r.height * 0.45 }; });
  await page.mouse.move(box.x, box.y);
  await page.mouse.down();
  const g0 = await tache(), d0 = await cpu();
  const N = 90;
  for (let i = 1; i <= N; i++) {
    await page.mouse.move(box.x - i * 4, box.y + Math.sin(i / 9) * 20);
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => r())));
  }
  const principalGeste = (await tache() - g0) / N, geste = (await cpu() - d0) / N;
  await page.mouse.up();
  const structure = await page.evaluate(() => document.documentElement.getAttribute('data-structure'));
  await ctx.close();
  return { repos, geste, principalRepos, principalGeste, structure };
}
const mediane = xs => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)];

(async () => {
  await new Promise(r => serveur.listen(0, '127.0.0.1', r));
  const nav = await playwright.chromium.launch();
  const bc = await nav.newBrowserCDPSession();
  const res = {};
  let ko = 0;
  try {
    for (const t of THEMES) {
      const essais = [];
      for (let k = 0; k < 3; k++) essais.push(await mesurer(nav, t.id, null, bc));
      res[t.id] = { repos: mediane(essais.map(e => e.repos)), geste: mediane(essais.map(e => e.geste)),
        principalRepos: mediane(essais.map(e => e.principalRepos)), principalGeste: mediane(essais.map(e => e.principalGeste)), structure: essais[0].structure };
    }
  } finally { await nav.close(); }
  const ref = res[REFERENCE];
  console.log(`  référence « ${REFERENCE} » : repos ${ref.repos.toFixed(1)} ms CPU/s · geste ${ref.geste.toFixed(2)} ms CPU/image (tous processus)\n`);
  const sortie = { mesure_le: new Date().toISOString().slice(0, 16) + 'Z', machine: process.platform + ' ' + process.arch + ', Chromium headless (rendu logiciel)',
    budget: BUDGET, reference: REFERENCE, themes: {} };
  for (const t of THEMES) {
    const m = res[t.id];
    const okRepos = m.repos <= ref.repos * BUDGET.reposRapport, okGeste = m.geste <= ref.geste * BUDGET.gesteRapport;
    const okStruct = (m.structure || null) === t.structure;
    const juge = t.verre === 'aucun';
    if (!okStruct || (juge && (!okRepos || !okGeste))) ko++;
    console.log(`  ${!juge ? 'ⓘ' : okRepos && okGeste && okStruct ? '✓' : '✗'} ${t.id.padEnd(10)} repos ${m.repos.toFixed(1).padStart(6)} ms/s (×${(m.repos / ref.repos).toFixed(2)}, ≤ ×${BUDGET.reposRapport})`
      + ` · geste ${m.geste.toFixed(2).padStart(6)} ms/image (×${(m.geste / ref.geste).toFixed(2)}, ≤ ×${BUDGET.gesteRapport})`
      + ` · principal ${m.principalRepos.toFixed(1)} ms/s, ${m.principalGeste.toFixed(2)} ms/image`
      + (t.structure ? ` · structure « ${m.structure} »` : '') + (okStruct ? '' : ' — STRUCTURE NON POSÉE')
      + (juge ? '' : ' — verre : mesuré, non jugé (règle 3)'));
    sortie.themes[t.id] = { feuille: t.href, empreinte: empreinte(t.href), repos_ms_par_s: +m.repos.toFixed(1), geste_ms_par_image: +m.geste.toFixed(2),
      rapport_repos: +(m.repos / ref.repos).toFixed(3), rapport_geste: +(m.geste / ref.geste).toFixed(3),
      principal_repos_ms_par_s: +m.principalRepos.toFixed(1), principal_geste_ms_par_image: +m.principalGeste.toFixed(2),
      verre: t.verre, juge, dans_le_budget: okRepos && okGeste };
  }
  // Les contre-épreuves : chacune DOIT sortir du budget.
  console.log('');
  if (SANS_CE) {
    console.log('  − contre-épreuves non jouées (--sans-contre-epreuves) : rien n\'est enregistré');
    serveur.close();
    console.log(ko ? `\n❌ BUDGET : ${ko} thème(s) hors budget` : '\n✅ BUDGET : CHAQUE THÈME JUGÉ TIENT SON BUDGET');
    process.exit(ko ? 1 : 0);
  }
  const nav2 = await playwright.chromium.launch();
  const bc2 = await nav2.newBrowserCDPSession();
  sortie.contre_epreuves = {};
  try {
    for (const [nom, css] of Object.entries(CONTRE_EPREUVES)) {
      const essais = [];
      for (let k = 0; k < 3; k++) essais.push(await mesurer(nav2, REFERENCE, css, bc2));
      const m = { repos: mediane(essais.map(e => e.repos)), geste: mediane(essais.map(e => e.geste)) };
      const refuse = m.repos > ref.repos * BUDGET.reposRapport || m.geste > ref.geste * BUDGET.gesteRapport;
      if (!refuse) ko++;
      console.log(`  ${refuse ? '✓' : '✗'} contre-épreuve « ${nom} » ${refuse ? 'refusée' : 'ACCEPTÉE — la mesure est aveugle'} :`
        + ` repos ${m.repos.toFixed(1)} ms/s (×${(m.repos / ref.repos).toFixed(2)}) · geste ${m.geste.toFixed(2)} ms/image (×${(m.geste / ref.geste).toFixed(2)})`);
      sortie.contre_epreuves[nom] = { repos_ms_par_s: +m.repos.toFixed(1), geste_ms_par_image: +m.geste.toFixed(2),
        rapport_repos: +(m.repos / ref.repos).toFixed(3), rapport_geste: +(m.geste / ref.geste).toFixed(3), refusee: refuse };
    }
  } finally { await nav2.close(); serveur.close(); }
  if (process.argv.includes('--enregistrer')) {
    // Mesure partielle : les thèmes non mesurés gardent leur dernière mesure (même référence
    // re-mesurée dans cette exécution : les rapports restent comparables à seuils égaux).
    if (DEMANDES.length && fs.existsSync(FICHIER)) {
      const ancien = JSON.parse(fs.readFileSync(FICHIER, 'utf8'));
      sortie.themes = Object.assign({}, ancien.themes || {}, sortie.themes);
    }
    fs.writeFileSync(FICHIER, JSON.stringify(sortie, null, 1) + '\n');
    console.log('\n  → mesures écrites dans tests/budget-themes.json');
  }
  console.log(ko ? `\n❌ BUDGET : ${ko} thème(s) hors budget` : '\n✅ BUDGET : CHAQUE THÈME TIENT SON BUDGET D\'IMAGE');
  process.exit(ko ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
