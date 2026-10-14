// Le harnais des RÉGLAGES d'affichage du terminal (js/reglages.js).
//
// Trois règles :
//   1. un réglage change le NIVEAU DE DÉTAIL, jamais la valeur d'une quantité affichée ;
//   2. ce qui vient du FICHIER garde les constantes du fichier : bandes publiées, tranche
//      `wall_bin_usd` — rien n'est recopié dans la page (on le prouve avec un fichier aux
//      constantes inhabituelles) ; la heatmap se fusionne par MAX, jamais en affinant ;
//   3. ce que la page va chercher elle-même (⚡) est libre : profondeur, bandes, nombre de
//      trades, seuils de lecture — et une bande non couverte est dite, pas tronquée.
// Et (revue du 14/10, C9 et C10) : un seuil vide ou hors bornes n'est jamais gardé, « marqué »
// reste au-dessus de « léger », le panneau reste ouvert quand le clavier du téléphone s'ouvre
// sur un seuil ; une bande non couverte écrit « — », pas « 0,0 BTC ».
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
// Nombres à la française (js/format.js) : virgule décimale, « ±0,5 % », ratio « 1,05 ».
const fr2 = x => x.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const frB = b => String(b).replace('.', ',');
check('carte Liquidité : bande de référence publiée, son ratio tel quel', h0.includes('Carnet ±' + frB(LQ.bande_ref_pct) + ' %') && h0.includes('>' + fr2(ref.ratio) + '</b>'));
check('tranche des murs affichée = tranche publiée', h0.includes('par tranche de ' + LQ.wall_bin_usd + ' $'));
// La bande vient d'un RÉGLAGE de l'Expert, masqué en Débutant : la carte « Ordres en attente »
// du Débutant la dit, et dit quand elle a été choisie en mode Expert.
check('Débutant, « Ordres en attente » : « à ±' + frB(LQ.bande_ref_pct) + ' % du prix », sans « bande choisie » quand rien n’est réglé',
  h0.includes('Binance, à ±' + frB(LQ.bande_ref_pct) + ' % du prix') && !h0.includes('bande choisie dans les réglages fins'));
{
  const rg = page.sandbox.reglagesHtml();
  check('Réglages : « référence publiée (±' + frB(LQ.bande_ref_pct) + ' %) » à la française, comme les autres bandes ; la carte du Débutant nommée',
    rg.includes('référence publiée (±' + frB(LQ.bande_ref_pct) + ' %)') && rg.includes('sans les chiffres du marché') && !rg.includes('Débutant') && !/±\d+\.\d/.test(rg), (rg.match(/±[\d.,]+ %[^<]{0,20}/g) || []).slice(0, 6));
}
{
  // Plus de bouton « Réglages » dans l'en-tête : ce sont les « Réglages fins », repliés en bas du
  // panneau « Choisir l'affichage » du Complet — le même contenu, la même clé, les mêmes effets.
  const vm = require('vm');
  const exp = chargerPage({ stockage: { 'samsara-mode': 'expert' } });
  exp.T.setData(DATA);
  vm.runInContext('buildDropdown()', exp.sandbox);
  const panneau = exp.T.el('indMenu').innerHTML, rg = exp.sandbox.reglagesHtml();
  check('Complet : les réglages sont les « Réglages fins », repliés, en bas du panneau « Choisir l’affichage », avec tout leur contenu',
    /<details class="aff-fins"[^>]*><summary>Réglages fins<\/summary>/.test(panneau) && !/<details class="aff-fins"[^>]* open/.test(panneau)
    && panneau.includes(rg) && rg.includes('r_live_niveaux') && rg.includes('r_heat_seuil') && panneau.indexOf('aff-fins') > panneau.lastIndexOf('data-ind='), panneau.slice(-300));
  const deb = chargerPage();
  vm.runInContext('buildDropdown()', deb.sandbox);
  check('un seul panneau : sans « Le détail » aussi, les « Réglages fins » repliés en bas, le même contenu', deb.T.el('indMenu').innerHTML.includes('Réglages fins') && deb.T.el('indMenu').innerHTML.includes('r_live_niveaux'));
  const html = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8');
  check('plus de bouton ni de bulle « Réglages » dans l’en-tête (#reglagesBtn, #reglagesPop)', !/id="reglages(Btn|Pop)"/.test(html));
  // (Le bac n'a pas de canvas : le dessin du graphique, que appliquerReglages demande, est neutralisé.)
  vm.runInContext('drawChart = () => {}; REGLAGES.carnet.murs = 12; sauverReglages(); reinitReglages()', exp.sandbox);
  check('même clé (samsara-reglages-v1) ; « Réglages par défaut » les remet et reconstruit le panneau',
    vm.runInContext('REGLAGES_CLE', exp.sandbox) === 'samsara-reglages-v1' && JSON.parse(exp.stockage['samsara-reglages-v1']).carnet.murs === T.REGLAGES_DEFAUT.carnet.murs
    && exp.T.el('indMenu').innerHTML.includes('Réglages fins'), exp.stockage['samsara-reglages-v1']);
}

// ── 2. Un réglage change le détail, pas la valeur ────────────────────────────
titre('2. Un réglage change le détail, jamais la valeur d’une quantité');
const ratioDe = (h, b) => { const m = h.match(new RegExp('±' + frB(b) + ' % : ([\\d,]+)')); return m && m[1]; };
const autresAvant = Object.keys(LQ.bandes).map(b => ratioDe(h0, b));
check('chaque bande publiée a son ratio lu sur la carte (« ±0,1 % : 1,23 »)', autresAvant.length > 1 && autresAvant.every(Boolean), autresAvant);
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
check('bandes perso : marquées « ≈ » et « à 20 $ près »', /Sur le profil publié \(à 20 \$ près\) : ±0,2 % ≈ \d+,\d\d\b/.test(h1));
const bp = T.bandeProfil(LQ, LQ.bande_ref_pct);
check('bande perso = bande publiée à une tranche près (même carnet)', Math.abs(bp.bid_btc - ref.bid_btc) <= Math.max(...LQ.profil_bids.map(x => x[1])) + 1e-9, [bp, ref]);
check('bande perso au-delà de la couverture : refusée (null), jamais tronquée', T.bandeProfil(LQ, LQ.couverture_pct + 0.01) === null);
const autre = Object.keys(LQ.bandes).find(k => k !== String(LQ.bande_ref_pct));
regler(r => { r.carnet.bande = +autre; });
const h2 = rendre();
check(`bande choisie (±${autre} %) parmi les PUBLIÉES : son ratio publié tel quel`, h2.includes('Carnet ±' + frB(autre) + ' %')
  && h2.includes('>' + fr2(LQ.bandes[autre].ratio) + '</b>'));
check(`… et la carte du Débutant le dit : « à ±${frB(autre)} % du prix (bande choisie dans les réglages fins) »`, h2.includes('Binance, à ±' + frB(autre) + ' % du prix (bande choisie dans les réglages fins)'));
regler(r => { r.carnet.bande = 0.37; });
check('bande demandée mais NON publiée : retour à la référence publiée (rien d’inventé)', rendre().includes('Carnet ±' + frB(LQ.bande_ref_pct) + ' %'));

// ── 3. Les constantes viennent du fichier ────────────────────────────────────
titre('3. Constantes du fichier : lues, jamais recopiées');
const etrange = JSON.parse(JSON.stringify(DATA));
const lq = etrange.liquidity;
lq.wall_bin_usd = 25; lq.bande_ref_pct = 0.7; lq.bandes = { '0.2': lq.bandes[String(LQ.bande_ref_pct)], '0.7': lq.bandes[String(LQ.bande_ref_pct)] };
delete lq.profil_bids; delete lq.profil_asks;
T.setData(etrange); regler(() => {});
const h3 = rendre();
check('fichier aux bandes 0,2 / 0,7 % et tranche 25 $ : la page affiche CES valeurs',
  h3.includes('Carnet ±0,7 %') && h3.includes('±0,2 % :') && h3.includes('par tranche de 25 $'), h3.match(/Carnet ±[^<]+|tranche de [^<]+/g));
check('… et aucune des constantes habituelles (±0,5 %, 20 $)', !h3.includes('±0,5 %') && !h3.includes('±0.5 %') && !h3.includes('tranche de 20 $'));
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
  check('bande ±0,1 % couverte : ratio mesuré', /±0,1 % : <b>\d+,\d\d<\/b>/.test(h));
  const ratio1 = (h.match(/Ratio bid\/ask (\d+,\d\d)/) || [])[1];
  const h2b = await lireLive(r => { r.live.niveaux = 1000; r.live.trades = 1000; r.live.bandes = [0.05, 0.1, 1]; r.live.ratioMarque = 1.05; r.live.ratioLeger = 1.01; });
  const ratio2 = (h2b.match(/Ratio bid\/ask (\d+,\d\d)/) || [])[1];
  check('seuils de lecture changés : le RATIO affiché est le même, seule la phrase change', ratio1 && ratio1 === ratio2, [ratio1, ratio2]);
  const t1 = (h.match(/Taker buy (\d+,\d %)/) || [])[1];
  const h3b = await lireLive(r => { r.live.niveaux = 1000; r.live.trades = 1000; r.live.bandes = [0.05]; r.live.takerDominant = 55; r.live.takerLeger = 51; });
  check('seuils des achats au marché changés : la part affichée est la même', t1 && t1 === (h3b.match(/Taker buy (\d+,\d %)/) || [])[1], [t1]);
  await lireLive(r => { r.live.niveaux = 5000; });
  check('5 000 niveaux : demandés tels quels', live.appels.some(u => /depth.*limit=5000/.test(u)));
  // Revue du 14/10 (C10) : une bande non couverte écrivait « Bids 0,0 BTC · Asks 0,0 BTC »
  // (« personne n'achète ni ne vend »). 500 niveaux couvrent ici ±0,06 % : ±1 % ne l'est pas.
  const carte = x => x.slice(x.indexOf('Carnet en direct'), x.indexOf('Tape en direct'));
  const h4 = carte(await lireLive(r => { r.live.bandes = [1]; }));
  check('bande non couverte : « Bids — · Asks — (carnet reçu trop court) », jamais « 0,0 BTC »',
    h4.includes('Bids — · Asks — (carnet reçu trop court)') && !/0,0 BTC/.test(h4) && h4.includes('bande non couverte par le carnet reçu'), h4.replace(/<[^>]+>/g, ' ').slice(0, 260));
  check('bande couverte : les volumes en BTC, comme avant', /Bids <b>[\d\s\u202f\u00a0]+,\d BTC<\/b> · Asks <b>[\d\s\u202f\u00a0]+,\d BTC<\/b>/.test(carte(h)), carte(h).replace(/<[^>]+>/g, ' ').slice(0, 200));
  seuils();
  fin();
}).catch(e => { console.error(e); process.exit(1); });

// ── 6. Seuils du ⚡ : jamais vides, jamais hors bornes (revue du 14/10, C9) ──────────
// Avant : vider « marqué ≥ » gardait 0, taper 0,5 (sous le minimum) le gardait aussi, et le ⚡
// disait « déséquilibre acheteur marqué » pour un carnet presque équilibré, même rechargé.
function seuils() {
  const vm = require('vm');
  titre('6. Seuils de lecture du ⚡ : un champ vide ne change rien, une valeur est bornée, « marqué » reste au-dessus de « léger »');
  const D = T.REGLAGES_DEFAUT.live;
  const p = chargerPage({ stockage: { 'samsara-mode': 'expert' } });
  vm.runInContext('drawChart = () => {}', p.sandbox);
  const changer = (cle, valeur) => {
    const c = p.T.el('r_live_' + cle);
    c.id = 'r_live_' + cle; c.value = valeur;
    vm.runInContext('changerReglage', p.sandbox)(c);
    const L = p.T.REGLAGES.live, champs = ['ratioMarque', 'ratioLeger', 'takerDominant', 'takerLeger'].map(k => p.T.el('r_live_' + k).value);
    return { marque: L.ratioMarque, leger: L.ratioLeger, dominant: L.takerDominant, achLeger: L.takerLeger, champs, garde: p.stockage['samsara-reglages-v1'] || null };
  };
  let e = changer('ratioMarque', '');
  check('« marqué ≥ » vidé : la valeur ne change pas, le champ la remontre, rien n’est enregistré', e.marque === D.ratioMarque && e.champs[0] === String(D.ratioMarque) && e.garde === null, e);
  e = changer('ratioMarque', '0.5');
  check('« marqué ≥ » à 0,5 (sous le minimum) : borné à 1,01, puis échangé avec « léger ≥ » 1,1 ; gardé et montré tel quel',
    e.marque === D.ratioLeger && e.leger === 1.01 && e.champs[0] === String(D.ratioLeger) && e.champs[1] === '1.01' && JSON.parse(e.garde).live.ratioLeger === 1.01, e);
  e = changer('ratioMarque', '16');
  check('« marqué ≥ » à 16 (au-dessus du maximum) : 5, le maximum', e.marque === 5 && e.champs[0] === '5', e);
  changer('ratioMarque', '1.4');
  e = changer('ratioLeger', '1.6');
  check('« léger ≥ » 1,6 au-dessus de « marqué ≥ » 1,4 : les deux seuils sont échangés, dans les champs aussi', e.marque === 1.6 && e.leger === 1.4 && e.champs[0] === '1.6' && e.champs[1] === '1.4', e);
  e = changer('takerLeger', '20');
  check('achats au marché, « léger ≥ » 20 : 50,5, le minimum', e.achLeger === 50.5 && e.champs[3] === '50.5' && e.dominant === D.takerDominant, e);
  e = changer('takerDominant', '  ');
  check('achats au marché, « dominant ≥ » vidé : inchangé', e.dominant === D.takerDominant && e.champs[2] === String(D.takerDominant), e);
  // Ce qui était déjà gardé hors bornes (avant ce correctif) est relu à sa valeur par défaut.
  const rel = chargerPage({ stockage: { 'samsara-reglages-v1': JSON.stringify({ live: { ratioMarque: 0.5, ratioLeger: 1.1, takerDominant: 99, takerLeger: 'x' } }) } }).T.REGLAGES.live;
  check('relu au chargement : 0,5 · 99 · « x » gardés → valeurs par défaut', rel.ratioMarque === D.ratioMarque && rel.ratioLeger === 1.1 && rel.takerDominant === D.takerDominant && rel.takerLeger === D.takerLeger, rel);
  const inv = chargerPage({ stockage: { 'samsara-reglages-v1': JSON.stringify({ live: { ratioMarque: 1.05, ratioLeger: 1.2, takerDominant: 52, takerLeger: 58 } }) } }).T.REGLAGES.live;
  check('relu au chargement : « marqué » sous « léger » → échangés', inv.ratioMarque === 1.2 && inv.ratioLeger === 1.05 && inv.takerDominant === 58 && inv.takerLeger === 52, inv);
  const rg = p.sandbox.reglagesHtml(), bornes = vm.runInContext('LIVE_SEUILS', p.sandbox);
  check('les bornes des champs sont celles que la page impose (LIVE_SEUILS)', Object.entries(bornes).every(([k, [mn, mx]]) => new RegExp('id="r_live_' + k + '" min="' + mn + '" max="' + mx + '"').test(rg)), rg.match(/<input type="number"[^>]+>/g));

  // Le clavier d'un téléphone redimensionne la fenêtre : le panneau reste ouvert pendant qu'on
  // écrit dans un de ses champs (avant : seulement dans le filtre ; un seuil le fermait).
  const ecoute = [];
  const pf = chargerPage({ stockage: { 'samsara-mode': 'expert' }, globaux: { window: { innerWidth: 1440, innerHeight: 900, devicePixelRatio: 1,
    addEventListener: (t, f) => { if (t === 'resize') ecoute.push(f); }, removeEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }), location: { href: 'file:///' } } } });
  const fermeMenus = ecoute.filter(f => /indMenu/.test(String(f)));
  const menu = pf.T.el('indMenu');
  let ferme = 0;
  menu.classList = { add() {}, remove: k => { if (k === 'open') ferme++; }, toggle() {}, contains: () => true };
  menu.contains = el => !!el && el.dansMenu === true;
  const resteOuvert = actif => { pf.sandbox.document.activeElement = actif; ferme = 0; fermeMenus.forEach(f => f()); return ferme === 0; };
  check('clavier ouvert sur un seuil (« dominant ≥ ») : le panneau reste ouvert', fermeMenus.length === 1 && resteOuvert({ tagName: 'INPUT', type: 'number', id: 'r_live_takerDominant', dansMenu: true }), fermeMenus.length);
  check('… sur le filtre aussi, comme avant', resteOuvert({ tagName: 'INPUT', type: 'search', id: 'indFiltre', dansMenu: true }));
  check('une case cochée du panneau, ou un champ hors du panneau : il se ferme, comme avant',
    !resteOuvert({ tagName: 'INPUT', type: 'checkbox', dansMenu: true }) && !resteOuvert({ tagName: 'INPUT', type: 'number', dansMenu: false }) && !resteOuvert(null));
}

function await_(f) { return f(); }
function fin() {
  console.log(ko ? `\n❌ RÉGLAGES : ${ko} contrôle(s) en échec` : '\n✅ RÉGLAGES : TOUS LES CONTRÔLES PASSENT');
  process.exit(ko ? 1 : 0);
}
