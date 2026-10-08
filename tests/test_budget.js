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
//   · au repos   : ms de CPU par seconde, 6 s sans interaction. Une animation infinie qui
//                  REPEINT (fond, ombre, couleur…) coûte cher ici ; une animation de `transform`
//                  / `opacity` coûte la seule composition (bien moins, mais pas rien).
//   · en geste   : ms de CPU par image pendant un glissement du graphique (une image = un
//                  déplacement) — ce que le flou posé sur le graphique faisait exploser.
// Le temps du seul thread principal est aussi relevé (colonne « principal »), pour le diagnostic.
// Les rapports au thème de référence sont portables d'une machine à l'autre ; les millisecondes
// absolues ne le sont pas (ce conteneur n'a pas de GPU : rendu logiciel).
//
// PROTOCOLE (révisé le 07/10/2026)
//   · MESURES ENTRELACÉES : référence, thème, référence, thème… référence. Chaque mesure du thème
//     est rapportée à la moyenne des deux mesures de référence qui l'encadrent, prises juste
//     avant et juste après : une dérive de la machine (autres processus, chauffe) touche les deux
//     termes du rapport. Le rapport retenu est la MÉDIANE de ESSAIS rapports. Avant : trois
//     mesures du thème, puis trois de la référence, à des minutes d'écart — un TÉMOIN vide (la
//     référence contre elle-même) y sortait à ×1,45.
//   · PRIX QUI BOUGE (--ticks) : le prix simulé change à chaque lecture (une par seconde), en
//     marche aléatoire, comme le vrai. Avant, il restait à 86012.5 : l'éclair de couleur du prix
//     (450 ms) et tout effet d'un thème lié au prix étaient INVISIBLES au banc. --enregistrer
//     mesure toujours ainsi.
//   · FENÊTRE de repos de FENETRE_S secondes, multiple de la cadence des bougies (5 s) et du prix
//     (1 s) : chaque fenêtre contient le même nombre de rafraîchissements.
//   · TÉMOIN : la référence mesurée contre elle-même, avec le même protocole. Elle DOIT tenir le
//     budget : sinon le banc est trop bruité pour juger (relancer sur une machine au calme).
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
// USAGE   node tests/test_budget.js                    # mesure et vérifie tous les thèmes (≈ 25 min)
//         node tests/test_budget.js neon codex         # ces thèmes (+ la référence)
//         node tests/test_budget.js --ticks            # prix qui bouge chaque seconde
//         node tests/test_budget.js --enregistrer      # … --ticks, et met à jour tests/budget-themes.json
//         --sans-contre-epreuves                       # pour itérer vite : ni témoin ni contre-épreuves,
//                                                      # rien n'est enregistré
//         --essais N                                   # essais par thème (défaut 5)
//         node tests/test_budget.js --controle         # le PROTOCOLE seul, sans navigateur (≈ 0 s) :
//                                                      # prix vivant, rapports entrelacés, options — run-all.sh
const fs = require('fs'), path = require('path'), http = require('http'), crypto = require('crypto');
const REPO = path.resolve(__dirname, '..');
const FICHIER = path.join(__dirname, 'budget-themes.json');
const BUDGET = { reposRapport: 1.6, gesteRapport: 1.3 };
const REFERENCE = 'kala';

const index = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8');
const DECLARES = [...index.matchAll(/<link\b[^>]*data-theme-id="([^"]+)"[^>]*>/g)].map(m => ({
  id: m[1], href: (m[0].match(/href="([^"]+)"/) || [])[1], structure: (m[0].match(/data-structure="([^"]+)"/) || [])[1] || null,
  verre: (m[0].match(/data-verre="([^"]+)"/) || [])[1] || 'aucun' }));
const DEMANDES = process.argv.slice(2).filter((a, i, l) => !a.startsWith('--') && l[i - 1] !== '--essais');
const THEMES = DEMANDES.length ? DECLARES.filter(t => t.id === REFERENCE || DEMANDES.includes(t.id)) : DECLARES;
/** Options de la ligne de commande. Une mesure ENREGISTRÉE se fait toujours prix en mouvement :
 *  c'est l'état réel de la page. */
function options(argv) {
  const e = argv.indexOf('--essais'), enregistrer = argv.includes('--enregistrer');
  return { enregistrer, ticks: enregistrer || argv.includes('--ticks'), sansCE: argv.includes('--sans-contre-epreuves'),
    essais: e >= 0 ? Math.max(1, parseInt(argv[e + 1], 10) || 5) : 5, controle: argv.includes('--controle') };
}
const OPT = options(process.argv.slice(2));
const SANS_CE = OPT.sansCE, ENREGISTRER = OPT.enregistrer, TICKS = OPT.ticks, ESSAIS = OPT.essais;
const FENETRE_S = 10;      // repos : multiple de la cadence des bougies (5 s) et du prix (1 s)
// Les cadences de la page, lues dans js/cadences.js (la fenêtre de repos doit en être un multiple).
const CADENCES_PAGE = new Function(fs.readFileSync(path.join(REPO, 'js/cadences.js'), 'utf8') + '\nreturn CADENCES;')();
const IMAGES_GESTE = 90;
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
/** Prix « vivant » d'UNE mesure (--ticks) : il part de la dernière clôture servie et fait un pas
 *  à chaque lecture (la page lit le prix une fois par seconde), jamais nul, en marche aléatoire.
 *  Même graine à chaque mesure : la référence et le thème voient la même suite de prix. */
function prixVivant() {
  let graine = 77, prix = null;
  const alea = () => (graine = (graine * 1103515245 + 12345) % 2147483648) / 2147483648;
  return {
    base(c) { if (prix === null && isFinite(c)) prix = c; },
    pas() {
      if (prix === null) prix = 86012.5;
      const d = (alea() - 0.5) * 30;
      prix = Math.round((prix + (Math.abs(d) < 0.5 ? (d < 0 ? -0.5 : 0.5) : d)) * 100) / 100;
      return prix;
    },
  };
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
  const vivant = prixVivant();
  await page.route('**/*', r => {
    const u = r.request().url(), h = new URL(u).host, cors = { 'access-control-allow-origin': '*' };
    if (h.startsWith('127.0.0.1')) return r.continue();
    if (h === 'data-api.binance.vision') {
      let corps = binance(u);
      const p = new URL(u).pathname;
      if (TICKS && p.endsWith('/klines') && Array.isArray(corps) && corps.length) vivant.base(+corps[corps.length - 1][4]);
      if (TICKS && p.endsWith('/ticker/24hr')) { const x = vivant.pas(); corps = Object.assign({}, corps, { lastPrice: x.toFixed(2), openPrice: '85700.00', priceChangePercent: ((x / 85700 - 1) * 100).toFixed(3) }); }
      if (TICKS && p.endsWith('/ticker/price')) corps = Object.assign({}, corps, { price: vivant.pas().toFixed(2) });
      return r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(corps) });
    }
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
  // Repos : FENETRE_S secondes sans rien toucher. (3 s ne suffisaient pas : le compteur de CPU
  // avance par pas de 10 ms, soit ±0,17 sur un rapport mesuré sur 3 s.)
  const r0 = await tache(), c0 = await cpu();
  await page.waitForTimeout(FENETRE_S * 1000);
  const principalRepos = (await tache() - r0) / FENETRE_S, repos = (await cpu() - c0) / FENETRE_S;
  // Geste : glisser le graphique, un déplacement par image, 90 images.
  const box = await page.$eval('#chart', c => { const r = c.getBoundingClientRect(); return { x: r.left + r.width * 0.6, y: r.top + r.height * 0.45 }; });
  await page.mouse.move(box.x, box.y);
  await page.mouse.down();
  const g0 = await tache(), d0 = await cpu();
  const N = IMAGES_GESTE;
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
const moyenne = (a, b) => (a + b) / 2;
/** T[k] rapporté à la moyenne des deux références qui l'encadrent, R[k] et R[k + 1]. */
const rapportsEntrelaces = (T, R, champ) => T.map((m, k) => m[champ] / moyenne(R[k][champ], R[k + 1][champ]));

/** Série ENTRELACÉE : R, T, R, T, … R (ESSAIS mesures du thème, chacune encadrée par deux de la
 *  référence). `precedente` : la dernière mesure de référence de la série d'avant, réutilisée
 *  comme première de celle-ci. Rapport = médiane des T / moyenne(R avant, R après). */
async function serie(nav, bc, theme, injection, precedente) {
  const R = [precedente || await mesurer(nav, REFERENCE, null, bc)], T = [];
  for (let k = 0; k < ESSAIS; k++) {
    T.push(await mesurer(nav, theme, injection, bc));
    R.push(await mesurer(nav, REFERENCE, null, bc));
  }
  const rapports = champ => rapportsEntrelaces(T, R, champ);
  const med = (xs, champ) => mediane(xs.map(m => m[champ]));
  return {
    repos: med(T, 'repos'), geste: med(T, 'geste'), principalRepos: med(T, 'principalRepos'), principalGeste: med(T, 'principalGeste'),
    refRepos: med(R, 'repos'), refGeste: med(R, 'geste'),
    rapportRepos: mediane(rapports('repos')), rapportGeste: mediane(rapports('geste')),
    rapportsRepos: rapports('repos'), rapportsGeste: rapports('geste'),
    structure: T[0].structure, derniere: R[R.length - 1], refs: R,
  };
}

// ── --controle : le protocole lui-même, sans navigateur (tests/run-all.sh) ───
if (OPT.controle) {
  let ko = 0;
  const check = (nom, ok, det) => { if (!ok) ko++; console.log(`  ${ok ? '✓' : '✗'} ${nom}${!ok && det !== undefined ? ' — ' + JSON.stringify(det) : ''}`); };
  const a = prixVivant(), b = prixVivant();
  a.base(86100); b.base(86100);
  const pa = Array.from({ length: 30 }, () => a.pas()), pb = Array.from({ length: 30 }, () => b.pas());
  check('prix vivant : il change à CHAQUE lecture (30 lectures, 30 prix différents du précédent)', pa.every((x, i) => x !== (i ? pa[i - 1] : 86100)), pa.slice(0, 6));
  check('prix vivant : il part de la dernière clôture servie et reste un prix plausible (pas ≤ 15 $)', Math.abs(pa[0] - 86100) <= 15 && pa.every((x, i) => !i || Math.abs(x - pa[i - 1]) <= 15.01), pa.slice(0, 6));
  check('prix vivant : même suite pour la référence et le thème (même graine)', JSON.stringify(pa) === JSON.stringify(pb));
  const R = [{ repos: 10 }, { repos: 20 }, { repos: 30 }], T = [{ repos: 30 }, { repos: 50 }];
  check('rapport entrelacé : chaque mesure du thème sur la moyenne des DEUX références qui l\'encadrent (dérive ×3 annulée)',
    JSON.stringify(rapportsEntrelaces(T, R, 'repos')) === JSON.stringify([2, 2]), rapportsEntrelaces(T, R, 'repos'));
  check('--enregistrer mesure toujours prix en mouvement (--ticks implicite)', options(['--enregistrer']).ticks && !options([]).ticks && options(['--ticks']).ticks);
  check('5 essais par défaut, --essais N sinon', options([]).essais === 5 && options(['--essais', '3']).essais === 3);
  check(`repos sur ${FENETRE_S} s : multiple de la cadence des bougies (${CADENCES_PAGE.bougies} ms) et du prix (${CADENCES_PAGE.prix} ms)`,
    (FENETRE_S * 1000) % CADENCES_PAGE.bougies === 0 && (FENETRE_S * 1000) % CADENCES_PAGE.prix === 0, CADENCES_PAGE);
  console.log(ko ? `\n❌ PROTOCOLE DU BUDGET : ${ko} contrôle(s) en échec` : '\n✅ PROTOCOLE DU BUDGET : TOUS LES CONTRÔLES PASSENT');
  process.exit(ko ? 1 : 0);
}

let playwright = null;
for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright', process.env.PLAYWRIGHT_MODULE].filter(Boolean)) {
  try { playwright = require(p); break; } catch (e) { /* suivant */ }
}
if (!playwright) {
  console.log('  − NON EXÉCUTÉ : Playwright introuvable — le budget n\'est pas re-mesuré sur ce poste.');
  console.log('    (tests/test_contrat.py vérifie quand même que chaque thème coûteux a une mesure à jour.)');
  process.exit(0);
}

(async () => {
  await new Promise(r => serveur.listen(0, '127.0.0.1', r));
  const nav = await playwright.chromium.launch();
  const bc = await nav.newBrowserCDPSession();
  console.log(`  protocole : ${ESSAIS} essais entrelacés (référence, thème, référence), repos ${FENETRE_S} s, geste ${IMAGES_GESTE} images, `
    + (TICKS ? 'prix en mouvement (un pas par lecture, chaque seconde)' : 'prix CONSTANT (--ticks pour le faire bouger ; --enregistrer le fait toujours)') + '\n');
  const res = {}, refs = [];
  let ko = 0, derniere = null;
  try {
    for (const t of THEMES.filter(x => x.id !== REFERENCE)) {
      const r = await serie(nav, bc, t.id, null, derniere);
      derniere = r.derniere; refs.push(...r.refs);
      res[t.id] = r;
    }
    if (!derniere) { derniere = await mesurer(nav, REFERENCE, null, bc); refs.push(derniere); }
  } catch (e) { await nav.close(); throw e; }
  // La référence : médiane de toutes ses mesures ; son rapport est 1 par définition.
  const refM = { repos: mediane(refs.map(m => m.repos)), geste: mediane(refs.map(m => m.geste)),
    principalRepos: mediane(refs.map(m => m.principalRepos)), principalGeste: mediane(refs.map(m => m.principalGeste)), structure: refs[0].structure };
  res[REFERENCE] = Object.assign({}, refM, { refRepos: refM.repos, refGeste: refM.geste, rapportRepos: 1, rapportGeste: 1, rapportsRepos: [], rapportsGeste: [] });
  console.log(`  référence « ${REFERENCE} » : repos ${refM.repos.toFixed(1)} ms CPU/s · geste ${refM.geste.toFixed(2)} ms CPU/image (tous processus, médiane de ${refs.length} mesures)\n`);
  const sortie = { mesure_le: new Date().toISOString().slice(0, 16) + 'Z', machine: process.platform + ' ' + process.arch + ', Chromium headless (rendu logiciel)',
    protocole: { essais: ESSAIS, entrelace: 'référence, thème, référence', fenetre_repos_s: FENETRE_S, images_geste: IMAGES_GESTE,
      prix: TICKS ? 'en mouvement : un pas par lecture (chaque seconde), marche aléatoire' : 'constant' },
    budget: BUDGET, reference: REFERENCE, themes: {} };
  const ligne = (nom, m, extra) => `${nom.padEnd(10)} repos ${m.repos.toFixed(1).padStart(6)} ms/s (×${m.rapportRepos.toFixed(2)}, ≤ ×${BUDGET.reposRapport})`
    + ` · geste ${m.geste.toFixed(2).padStart(6)} ms/image (×${m.rapportGeste.toFixed(2)}, ≤ ×${BUDGET.gesteRapport})`
    + ` · principal ${m.principalRepos.toFixed(1)} ms/s, ${m.principalGeste.toFixed(2)} ms/image` + (extra || '');
  for (const t of THEMES) {
    const m = res[t.id];
    const okRepos = m.rapportRepos <= BUDGET.reposRapport, okGeste = m.rapportGeste <= BUDGET.gesteRapport;
    const okStruct = (m.structure || null) === t.structure;
    const juge = t.verre === 'aucun';
    if (!okStruct || (juge && (!okRepos || !okGeste))) ko++;
    console.log(`  ${!juge ? 'ⓘ' : okRepos && okGeste && okStruct ? '✓' : '✗'} ` + ligne(t.id, m,
      (m.rapportsRepos.length ? ` · essais repos ${m.rapportsRepos.map(x => '×' + x.toFixed(2)).join(' ')}` : '')
      + (t.structure ? ` · structure « ${m.structure} »` : '') + (okStruct ? '' : ' — STRUCTURE NON POSÉE')
      + (juge ? '' : ' — verre : mesuré, non jugé (règle 3)')));
    sortie.themes[t.id] = { feuille: t.href, empreinte: empreinte(t.href), repos_ms_par_s: +m.repos.toFixed(1), geste_ms_par_image: +m.geste.toFixed(2),
      rapport_repos: +m.rapportRepos.toFixed(3), rapport_geste: +m.rapportGeste.toFixed(3),
      essais_rapport_repos: m.rapportsRepos.map(x => +x.toFixed(3)), essais_rapport_geste: m.rapportsGeste.map(x => +x.toFixed(3)),
      principal_repos_ms_par_s: +m.principalRepos.toFixed(1), principal_geste_ms_par_image: +m.principalGeste.toFixed(2),
      verre: t.verre, juge, dans_le_budget: okRepos && okGeste };
  }
  console.log('');
  if (SANS_CE) {
    await nav.close(); serveur.close();
    console.log('  − témoin et contre-épreuves non joués (--sans-contre-epreuves) : rien n\'est enregistré');
    console.log(ko ? `\n❌ BUDGET : ${ko} thème(s) hors budget` : '\n✅ BUDGET : CHAQUE THÈME JUGÉ TIENT SON BUDGET');
    process.exit(ko ? 1 : 0);
  }
  // Le TÉMOIN (la référence contre elle-même) doit tenir le budget ; chaque CONTRE-ÉPREUVE doit
  // en sortir. Même protocole entrelacé que les thèmes.
  sortie.contre_epreuves = {};
  try {
    const tm = await serie(nav, bc, REFERENCE, null, derniere);
    derniere = tm.derniere;
    const tient = tm.rapportRepos <= BUDGET.reposRapport && tm.rapportGeste <= BUDGET.gesteRapport;
    if (!tient) ko++;
    console.log(`  ${tient ? '✓' : '✗'} témoin « ${REFERENCE} contre elle-même » ${tient ? 'dans le budget' : 'HORS BUDGET — banc trop bruité pour juger'} :`
      + ` repos ×${tm.rapportRepos.toFixed(2)} · geste ×${tm.rapportGeste.toFixed(2)} (essais repos ${tm.rapportsRepos.map(x => '×' + x.toFixed(2)).join(' ')})`);
    sortie.temoin = { rapport_repos: +tm.rapportRepos.toFixed(3), rapport_geste: +tm.rapportGeste.toFixed(3),
      essais_rapport_repos: tm.rapportsRepos.map(x => +x.toFixed(3)), essais_rapport_geste: tm.rapportsGeste.map(x => +x.toFixed(3)), dans_le_budget: tient };
    for (const [nom, css] of Object.entries(CONTRE_EPREUVES)) {
      const m = await serie(nav, bc, REFERENCE, css, derniere);
      derniere = m.derniere;
      const refuse = m.rapportRepos > BUDGET.reposRapport || m.rapportGeste > BUDGET.gesteRapport;
      if (!refuse) ko++;
      console.log(`  ${refuse ? '✓' : '✗'} contre-épreuve « ${nom} » ${refuse ? 'refusée' : 'ACCEPTÉE — la mesure est aveugle'} :`
        + ` repos ${m.repos.toFixed(1)} ms/s (×${m.rapportRepos.toFixed(2)}) · geste ${m.geste.toFixed(2)} ms/image (×${m.rapportGeste.toFixed(2)})`);
      sortie.contre_epreuves[nom] = { repos_ms_par_s: +m.repos.toFixed(1), geste_ms_par_image: +m.geste.toFixed(2),
        rapport_repos: +m.rapportRepos.toFixed(3), rapport_geste: +m.rapportGeste.toFixed(3), refusee: refuse };
    }
  } finally { await nav.close(); serveur.close(); }
  if (ENREGISTRER) {
    // Mesure partielle : les thèmes non mesurés gardent leur dernière mesure (même référence
    // re-mesurée dans cette exécution : les rapports restent comparables à seuils égaux).
    if (DEMANDES.length && fs.existsSync(FICHIER)) {
      const ancien = JSON.parse(fs.readFileSync(FICHIER, 'utf8'));
      sortie.themes = Object.assign({}, ancien.themes || {}, sortie.themes);
    }
    fs.writeFileSync(FICHIER, JSON.stringify(sortie, null, 1) + '\n');
    console.log('\n  → mesures écrites dans tests/budget-themes.json');
  }
  console.log(ko ? `\n❌ BUDGET : ${ko} contrôle(s) en échec` : '\n✅ BUDGET : CHAQUE THÈME TIENT SON BUDGET D\'IMAGE');
  process.exit(ko ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
