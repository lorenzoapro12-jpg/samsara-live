// Le harnais des RÉGLAGES d'affichage du terminal (js/reglages.js).
//
// Trois règles :
//   1. un réglage change le NIVEAU DE DÉTAIL, jamais la valeur d'une quantité affichée ;
//   2. ce qui vient du FICHIER garde les constantes du fichier : bandes publiées, tranche
//      `wall_bin_usd` — rien n'est recopié dans la page (on le prouve avec un fichier aux
//      constantes inhabituelles) ; la heatmap se fusionne par MAX, jamais en affinant ;
//   3. ce que la page va chercher elle-même (⚡) est libre : profondeur, bandes, nombre de
//      trades, seuils de lecture — et une bande non couverte est dite, pas tronquée.
//
// USAGE   node tests/test_reglages.js
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const { chargerPage, element } = require('./bac');
const REPO = path.resolve(__dirname, '..');

let ko = 0;
const check = (nom, ok, det) => { if (!ok) ko++; console.log(`  ${ok ? '✓' : '✗'} ${nom}${!ok && det !== undefined ? ' — ' + JSON.stringify(det).slice(0, 300) : ''}`); };
const titre = t => console.log(`\n── ${t} ──`);
let seed = 3;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;

// Un carnet synthétique, analysé PAR LE SERVEUR (publish.analyse_carnet) : la page doit
// retrouver exactement ce que le serveur publie quand elle n'applique aucun réglage.
const mid = 86000;
const book = { bids: [], asks: [] };
for (let i = 0; i < 4000; i++) {
  book.bids.push([(mid - 0.05 - i * 0.2).toFixed(2), (0.01 + rnd() * (i % 211 === 0 ? 60 : 2)).toFixed(4)]);
  book.asks.push([(mid + 0.05 + i * 0.2).toFixed(2), (0.01 + rnd() * (i % 197 === 0 ? 60 : 2)).toFixed(4)]);
}
const LQ = JSON.parse(execFileSync('python3', ['-c',
  'import sys,json;sys.path.insert(0,sys.argv[1]);import publish;b=json.load(sys.stdin);print(json.dumps(publish.analyse_carnet(b["bids"],b["asks"])))', REPO],
  { input: JSON.stringify(book) }).toString());
const DATA = JSON.parse(fs.readFileSync(path.join(REPO, 'market-data.json'), 'utf8'));
DATA.liquidity = Object.assign({}, LQ, { snapshot_at: DATA.updated });

const page = chargerPage();
const T = page.T;
T.setData(DATA);
const rendre = () => { const c = element(); T.renderFeedTo(c); return c.innerHTML; };
const regler = f => { const r = JSON.parse(JSON.stringify(T.REGLAGES_DEFAUT)); f(r); T.REGLAGES = r; };

// ── 1. Le profil publié redonne ce que le serveur publie ──────────────────────
titre('1. Sans réglage, la page redonne EXACTEMENT ce que le serveur publie');
check('murs ×1 (bids) = murs publiés', JSON.stringify(T.mursFusionnes(LQ, 'bid', 1, LQ.murs_n, 0)) === JSON.stringify(LQ.bid_walls), [T.mursFusionnes(LQ, 'bid', 1, 3, 0), LQ.bid_walls.slice(0, 3)]);
check('murs ×1 (asks) = murs publiés', JSON.stringify(T.mursFusionnes(LQ, 'ask', 1, LQ.murs_n, 0)) === JSON.stringify(LQ.ask_walls));
regler(() => {});
const h0 = rendre();
const ref = LQ.bandes[String(LQ.bande_ref_pct)];
check('carte Liquidité : bande de référence publiée, son ratio tel quel', h0.includes('Carnet ±' + LQ.bande_ref_pct + ' %') && h0.includes('>' + ref.ratio.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '</b>'));
check('tranche des murs affichée = tranche publiée', h0.includes('par tranche de ' + LQ.wall_bin_usd + ' $'));

// ── 2. Un réglage change le détail, pas la valeur ────────────────────────────
titre('2. Un réglage change le détail, jamais la valeur d’une quantité');
const ratioDe = (h, b) => { const m = h.match(new RegExp('±' + b.replace('.', '\\.') + ' % : ([\\d.]+)')); return m && m[1]; };
const autresAvant = Object.keys(LQ.bandes).map(b => ratioDe(h0, b));
regler(r => { r.carnet.trancheX = 5; r.carnet.murs = 3; r.carnet.murMin = 10; r.carnet.bandesPerso = [0.2, 0.3]; });
const h1 = rendre();
check('tranche ×5, 3 murs, seuil 10 BTC, bandes perso : les ratios publiés ne bougent pas',
  JSON.stringify(Object.keys(LQ.bandes).map(b => ratioDe(h1, b))) === JSON.stringify(autresAvant), [autresAvant]);
check('la tranche affichée porte sa largeur (5 × 20 $ = 100 $)', h1.includes('par tranche de ' + 5 * LQ.wall_bin_usd + ' $'));
const m5 = T.mursFusionnes(LQ, 'bid', 5, 3, 10);
const sommes = new Map();
for (const [p, q] of LQ.profil_bids) { const P = Math.floor(p / (5 * LQ.wall_bin_usd)) * 5 * LQ.wall_bin_usd; sommes.set(P, (sommes.get(P) || 0) + q); }
check('murs ×5 = sommes exactes de 5 tranches publiées (fusionner des sommes = sommer)',
  m5.every(([p, q]) => Math.abs(q - Math.round(sommes.get(p) * 10) / 10) < 1e-9) && m5.every(([, q]) => q >= 10) && m5.length <= 3, m5);
check('bandes perso : marquées « ≈ » et « à 20 $ près »', /Sur le profil publié \(à 20 \$ près\) : ±0\.2 % ≈ [\d.]+/.test(h1));
const bp = T.bandeProfil(LQ, LQ.bande_ref_pct);
check('bande perso = bande publiée à une tranche près (même carnet)', Math.abs(bp.bid_btc - ref.bid_btc) <= Math.max(...LQ.profil_bids.map(x => x[1])) + 1e-9, [bp, ref]);
check('bande perso au-delà de la couverture : refusée (null), jamais tronquée', T.bandeProfil(LQ, LQ.couverture_pct + 0.01) === null);
const autre = Object.keys(LQ.bandes).find(k => k !== String(LQ.bande_ref_pct));
regler(r => { r.carnet.bande = +autre; });
const h2 = rendre();
check(`bande choisie (±${autre} %) parmi les PUBLIÉES : son ratio publié tel quel`, h2.includes('Carnet ±' + autre + ' %')
  && h2.includes('>' + LQ.bandes[autre].ratio.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '</b>'));
regler(r => { r.carnet.bande = 0.37; });
check('bande demandée mais NON publiée : retour à la référence publiée (rien d’inventé)', rendre().includes('Carnet ±' + LQ.bande_ref_pct + ' %'));

// ── 3. Les constantes viennent du fichier ────────────────────────────────────
titre('3. Constantes du fichier : lues, jamais recopiées');
const etrange = JSON.parse(JSON.stringify(DATA));
const lq = etrange.liquidity;
lq.wall_bin_usd = 25; lq.bande_ref_pct = 0.7; lq.bandes = { '0.2': lq.bandes[String(LQ.bande_ref_pct)], '0.7': lq.bandes[String(LQ.bande_ref_pct)] };
delete lq.profil_bids; delete lq.profil_asks;
T.setData(etrange); regler(() => {});
const h3 = rendre();
check('fichier aux bandes 0,2 / 0,7 % et tranche 25 $ : la page affiche CES valeurs',
  h3.includes('Carnet ±0.7 %') && h3.includes('±0.2 % :') && h3.includes('par tranche de 25 $'), h3.match(/Carnet ±[^<]+|tranche de [^<]+/g));
check('… et aucune des constantes habituelles (±0,5 %, 20 $)', !h3.includes('±0.5 %') && !h3.includes('tranche de 20 $'));
delete lq.wall_bin_usd;
check('tranche absente du fichier : « non publiée », pas 20 $ par défaut', rendre().includes('(tranche non publiée)'));
T.setData(DATA);
const src = ['js/app.js', 'js/reglages.js'].map(f => fs.readFileSync(path.join(REPO, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')).join('\n');
check('aucune tranche de murs par défaut écrite dans la page (|| 20)', !/wall_bin_usd\s*\|\|\s*\d/.test(src));
check('aucune liste de bandes du serveur recopiée (0.1, 0.5, 1)', !/\[\s*0\.1\s*,\s*0\.5\s*,\s*1(\.0)?\s*\]/.test(src));

// ── 4. Heatmap : fusionner par MAX, jamais affiner ───────────────────────────
titre('4. Heatmap du graphique : fusion par MAX');
const cells = [];
for (let i = 0; i < 3000; i++) cells.push([(rnd() * 120) | 0, 4200 + ((rnd() * 90) | 0), 1 + ((rnd() * 254) | 0)]);
// La grille de la page (grilleChaleur), puis sa fusion (fusionnerGrille), comparées case par case
// au MAX calculé ici, cellule par cellule, depuis le fichier.
const grille = T.grilleChaleur({ t0: 1791205080, dt: 60, dp: 20, bids: cells, asks: [] });
const lire = (f, C, P) => { const i = C * f.H + (P - f.pbMin); return C < f.W && P >= f.pbMin && P < f.pbMin + f.H ? f.bids[i] : 0; };
let exact = true;
for (const [kt, kp, s] of [[1, 1, 1], [5, 2, 1], [15, 5, 32], [60, 10, 128], [1, 1, 64]]) {
  const f = T.fusionnerGrille(grille, kt, kp, s), m = new Map();
  for (const [c, p, v] of cells) if (v >= s) { const k = Math.floor(c / kt) + ':' + Math.floor(p / kp); m.set(k, Math.max(m.get(k) || 0, v)); }
  let n = 0;
  for (let C = 0; C < f.W; C++) for (let P = f.pbMin; P < f.pbMin + f.H; P++) { const v = lire(f, C, P); if (v) n++; if (v !== (m.get(C + ':' + P) || 0)) exact = false; }
  if (n !== m.size || f.dt !== 60 * kt || f.dp !== 20 * kp) exact = false;
}
check('case fusionnée = MAX de son bloc, seuil appliqué (5 tailles, vérifié case par case)', exact);
const g05 = T.fusionnerGrille(grille, 0.5, 0, 1);
check('fusion ≥ 1 seulement : un facteur < 1 vaut 1 (on n’affine pas)', g05.W === grille.W && g05.H === grille.H && g05.dt === grille.dt && g05.dp === grille.dp);
check('fusion automatique en dézoom : par paliers de 2, jamais sous 1', T.palier(0.3) === 1 && T.palier(1) === 1 && T.palier(1.2) === 2 && T.palier(3) === 4 && T.palier(9) === 16);
check('le lissage (qui MOYENNE et efface un mur) est coupé', /imageSmoothingEnabled = false;/.test(fs.readFileSync(path.join(REPO, 'js/app.js'), 'utf8')));

// ── 5. Panneau ⚡ : libre, et honnête ─────────────────────────────────────────
titre('5. Panneau ⚡ : profondeur, bandes, trades et seuils réglables');
const px = 86000.5;
const depthLive = n => ({ bids: Array.from({ length: n }, (_, i) => [(px - 0.05 - i * 0.12).toFixed(2), '1.0']),
  asks: Array.from({ length: n }, (_, i) => [(px + 0.05 + i * 0.1).toFixed(2), '1.0']) });
const live = chargerPage({ fetch: async url => ({ ok: true, status: 200, json: async () => (
  /ticker\/24hr/.test(url) ? { lastPrice: String(px), bidPrice: String(px - 0.01), askPrice: String(px + 0.01), highPrice: '87000', lowPrice: '85000', priceChangePercent: '0.3', quoteVolume: '1e9', count: '1000' }
  : /depth/.test(url) ? depthLive(+url.match(/limit=(\d+)/)[1])
  : /trades/.test(url) ? Array.from({ length: +url.match(/limit=(\d+)/)[1] }, (_, i) => ({ qty: '0.5', isBuyerMaker: i % 3 === 0, time: 1e12 + i * 10 })) : {}) }) });
live.T.setData(DATA);
const lireLive = async f => { const r = JSON.parse(JSON.stringify(live.T.REGLAGES_DEFAUT)); f(r); live.T.REGLAGES = r; live.appels.length = 0; await live.T.renderLive(); return live.T.el('liveModalBody').innerHTML; };
const l1 = await_(() => lireLive(r => { r.live.niveaux = 1000; r.live.trades = 1000; r.live.bandes = [0.05, 0.1, 1]; }));
l1.then(async h => {
  check('profondeur et trades demandés à Binance = réglages (limit=1000)', live.appels.some(u => /depth.*limit=1000/.test(u)) && live.appels.some(u => /trades.*limit=1000/.test(u)), live.appels);
  check('le titre dit la profondeur réellement lue', /1[\s\u202f\u00a0]000 niveaux/.test(h));   // espace fine insécable (fr-FR)
  check('bande ±1 % au-delà du carnet reçu : « non couverte », pas un chiffre tronqué', /±1 % : non couverte/.test(h), h.match(/±[\d.]+ % : [^·<]+/g));
  check('bande ±0,1 % couverte : ratio mesuré', /±0\.1 % : <b>[\d.]+<\/b>/.test(h));
  const ratio1 = (h.match(/Ratio bid\/ask ([\d.]+)/) || [])[1];
  const h2b = await lireLive(r => { r.live.niveaux = 1000; r.live.trades = 1000; r.live.bandes = [0.05, 0.1, 1]; r.live.ratioMarque = 1.05; r.live.ratioLeger = 1.01; });
  const ratio2 = (h2b.match(/Ratio bid\/ask ([\d.]+)/) || [])[1];
  check('seuils de lecture changés : le RATIO affiché est le même, seule la phrase change', ratio1 && ratio1 === ratio2, [ratio1, ratio2]);
  const t1 = (h.match(/Taker buy ([\d.]+ %)/) || [])[1];
  const h3b = await lireLive(r => { r.live.niveaux = 1000; r.live.trades = 1000; r.live.bandes = [0.05]; r.live.takerDominant = 55; r.live.takerLeger = 51; });
  check('seuils des achats au marché changés : la part affichée est la même', t1 && t1 === (h3b.match(/Taker buy ([\d.]+ %)/) || [])[1], [t1]);
  await lireLive(r => { r.live.niveaux = 5000; });
  check('5 000 niveaux : demandés tels quels', live.appels.some(u => /depth.*limit=5000/.test(u)));
  fin();
}).catch(e => { console.error(e); process.exit(1); });

function await_(f) { return f(); }
function fin() {
  console.log(ko ? `\n❌ RÉGLAGES : ${ko} contrôle(s) en échec` : '\n✅ RÉGLAGES : TOUS LES CONTRÔLES PASSENT');
  process.exit(ko ? 1 : 0);
}
