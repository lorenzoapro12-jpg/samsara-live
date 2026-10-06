// Contrôles HORS LIGNE des calculs de la carte (js/bookmap-calc.js) et de son isolement.
//
// La carte superpose des données de trois cadences ; ses calculs ont trois façons de mentir :
//   · une FUSION qui sommerait des intensités (sans unité) ou rééchantillonnerait au plus
//     proche (un mur disparaît entre deux pixels) ;
//   · un DÉCODAGE qui inventerait une référence au lieu de lire celle que le serveur publie ;
//   · un REGROUPEMENT des exécutions qui perdrait ou doublerait du volume.
// Et une façon de casser le terminal : partager son code. Les deux sont contrôlés ici.
const fs = require('fs'), path = require('path');
const BM = require('../js/bookmap-calc.js');
const REPO = path.resolve(__dirname, '..');

let ko = 0;
const check = (nom, ok, det) => { if (!ok) ko++; console.log(`  ${ok ? '✓' : '✗'} ${nom}${!ok && det !== undefined ? ' — ' + JSON.stringify(det).slice(0, 200) : ''}`); };
const titre = t => console.log(`\n── ${t} ──`);
let seed = 11;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;

// ── 1. Grille publiée ────────────────────────────────────────────────────────
titre('1. heatmap.json → grille');
const h = { updated: '2026-10-06T09:30:00+00:00', t0: 1000, dt: 60, dp: 20,
  bids: [[0, 4290, 10], [0, 4289, 200], [1, 4291, 30], [2, 4285, 5]],
  asks: [[0, 4292, 40], [0, 4296, 7], [1, 4293, 255]] };
const g = BM.grillePubliee(h);
check('dimensions : 3 colonnes, tranches 4285 → 4296', g.W === 3 && g.pbMin === 4285 && g.H === 12, { W: g.W, pbMin: g.pbMin, H: g.H });
check('temps en ms : t0 = 1 000 s, dt = 60 s', g.t0 === 1e6 && g.dt === 60000);
check('cellule (0, 4289) bid = 200', g.bids[0 * g.H + (4289 - 4285)] === 200);
check('couverture DÉDUITE : colonne 0 de 4289 à 4296', g.bas[0] === 4289 && g.haut[0] === 4296, [g.bas[0], g.haut[0]]);
check('colonne 2 (bids seuls) : bornée par ses bids', g.bas[2] === 4285 && g.haut[2] === 4285);
check('encodage absent → null (rien d\'inventé)', g.encodage === null);

// ── 2. Fusion par MAX ────────────────────────────────────────────────────────
titre('2. Fusion : le MAX, exact, et jamais d\'affinage');
function aleatoire(W, H, pbMin) {
  const x = BM.grilleVide(0, 60000, W, 20, pbMin, H);
  for (let i = 0; i < W * H; i++) { if (rnd() < 0.4) x.bids[i] = (rnd() * 256) | 0; if (rnd() < 0.4) x.asks[i] = (rnd() * 256) | 0; }
  for (let c = 0; c < W; c++) if (rnd() < 0.9) { x.bas[c] = pbMin + ((rnd() * 5) | 0); x.haut[c] = pbMin + H - 1 - ((rnd() * 5) | 0); }
  return x;
}
let ok = true, okCouv = true;
for (const [kt, kp] of [[2, 1], [1, 3], [5, 5], [15, 2], [7, 10]]) {
  const a = aleatoire(61, 47, 4207);
  const f = BM.fusionMax(a, kt, kp);
  for (let C = 0; C < f.W; C++) for (let J = 0; J < f.H; J++) {
    let mb = 0, ma = 0;
    for (let c = C * kt; c < Math.min(a.W, (C + 1) * kt); c++) for (let h2 = 0; h2 < a.H; h2++) {
      if (Math.floor((a.pbMin + h2) / kp) !== f.pbMin + J) continue;
      mb = Math.max(mb, a.bids[c * a.H + h2]); ma = Math.max(ma, a.asks[c * a.H + h2]);
    }
    if (f.bids[C * f.H + J] !== mb || f.asks[C * f.H + J] !== ma) ok = false;
  }
  for (let C = 0; C < f.W; C++) {
    let lo = Infinity, hi = -Infinity;
    for (let c = C * kt; c < Math.min(a.W, (C + 1) * kt); c++) if (a.bas[c] >= 0) { lo = Math.min(lo, Math.floor(a.bas[c] / kp)); hi = Math.max(hi, Math.floor(a.haut[c] / kp)); }
    if ((lo === Infinity ? -1 : lo) !== f.bas[C] || (hi === -Infinity ? -1 : hi) !== f.haut[C]) okCouv = false;
  }
}
check('cellule fusionnée = MAX du bloc, vérifié case par case (5 tailles de bloc)', ok);
check('couverture fusionnée = union des couvertures du bloc', okCouv);
const a1 = aleatoire(10, 10, 100);
check('fusion 1 × 1 : la grille elle-même (aucune copie, aucune altération)', BM.fusionMax(a1, 1, 1) === a1);
check('facteur < 1 refusé : on ne peut pas AFFINER (0,5 → 1)', BM.fusionMax(a1, 0.5, 0) === a1);
const f2 = BM.fusionMax(BM.grillePubliee(h), 1, 2);
check('tranches fusionnées : 40 $, indices absolus alignés (4285 → 2142)', f2.dp === 40 && f2.pbMin === 2142, { dp: f2.dp, pbMin: f2.pbMin });

// ── 3. Encodage : lu, jamais recopié ─────────────────────────────────────────
titre('3. Encodage publié : décoder sans inventer');
const enc = { ref_btc: 100, plafond: 255 };
// Valeurs du serveur (heatmap.intensite, Python) : le même calcul des deux côtés.
const SERVEUR = [[0.0015, 0], [0.00154, 1], [0.5, 18], [1, 25], [7.3, 68], [42, 165], [99.9, 254], [100, 255], [250, 255]];
check('intensité page = intensité serveur sur 9 quantités', SERVEUR.every(([q, v]) => BM.intensite(q, enc) === v),
  SERVEUR.map(([q]) => BM.intensite(q, enc)));
let dedans = true;
for (let i = 0; i < 2000; i++) {
  const q = Math.exp(rnd() * 11 - 6.5), v = BM.intensite(q, enc), d = BM.decoder(v, enc);
  if (v === 0) continue;
  if (!(d.min <= q + 1e-12 && (q < d.max || d.sature))) dedans = false;
}
check('décodage : la quantité réelle est toujours DANS l\'intervalle annoncé (2 000 tirages)', dedans);
check('saturé : « au moins la référence », borne haute infinie', BM.decoder(255, enc).sature && BM.decoder(255, enc).max === Infinity);
check('sans encodage publié : aucun décodage, aucune intensité calculée', BM.decoder(120, null) === null && BM.intensite(3, null) === null);
// La référence n'est recopiée nulle part dans le code de la carte.
const src = ['js/bookmap-calc.js', 'js/bookmap.js'].map(f => fs.readFileSync(path.join(REPO, f), 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ''));
const recopie = src.some(t => /Math\.sqrt\([^)]*\/\s*\d/.test(t) || /ref_btc\s*[:=]\s*\d/.test(t) || /\bREF\b\s*=\s*\d/.test(t));
check('aucune référence d\'intensité écrite en dur dans la carte (√(q / <nombre>))', !recopie);

// ── 4. Carnet live ───────────────────────────────────────────────────────────
titre('4. Carnet live : MAX pour la chaleur, SOMME pour le carnet latéral');
const depth = { bids: [['86000.10', '1.5'], ['86000.05', '3'], ['85995.00', '0.2'], ['85990.00', '0']],
  asks: [['86000.20', '2'], ['86004.90', '7'], ['86005.00', '1']] };
const ag = BM.agregerCarnet(depth, 5);
check('tranche 86 000–86 005 côté bid : MAX = 3, SOMME = 4,5', ag.bids.get(17200) === 3 && ag.sb.get(17200) === 4.5, [ag.bids.get(17200), ag.sb.get(17200)]);
check('tranche 86 000–86 005 côté ask : MAX = 7, SOMME = 9', ag.asks.get(17200) === 7 && ag.sa.get(17200) === 9);
check('quantité nulle ignorée', ![...ag.bids.keys()].includes(17198));
check('bande couverte : du dernier bid au dernier ask reçus', ag.bas === Math.floor(85990 / 5) && ag.haut === Math.floor(86005 / 5));
check('meilleurs prix', ag.meilleurBid === 86000.1 && ag.meilleurAsk === 86000.2);

// ── 5. Exécutions ────────────────────────────────────────────────────────────
titre('5. Exécutions : aucun volume perdu ni compté deux fois');
const ex = new BM.SeauxExecutions(1);
const trades = [];
for (let i = 0; i < 3000; i++) trades.push({ a: 1000 + i, p: (86000 + rnd() * 60).toFixed(2), q: (rnd() * 2).toFixed(5), T: 1.7e12 + i * 37, m: rnd() < 0.45 });
for (const t of trades.slice(1500)) ex.ajouter(t);
const vus = new Set(trades.slice(1500).map(t => t.a));
for (const t of trades.slice(0, 1500).reverse()) ex.ajouterAncien(t, vus);
for (const t of trades.slice(2900)) ex.ajouter(t);                         // re-livrés : ignorés
for (const t of trades.slice(0, 10)) ex.ajouterAncien(t, vus);             // idem en arrière
const vrai = [0, 0];
for (const t of trades) vrai[t.m ? 1 : 0] += +t.q;
check('totaux achats / ventes exacts malgré les doublons livrés', Math.abs(ex.total[0] - vrai[0]) < 1e-6 && Math.abs(ex.total[1] - vrai[1]) < 1e-6, [ex.total, vrai]);
check('« m » (acheteur maker) = vente au marché', (() => { const e = new BM.SeauxExecutions(1); e.ajouter({ a: 1, p: '1', q: '2', T: 0, m: true }); return e.total[1] === 2 && e.total[0] === 0; })());
const ta = 1.7e12, tb = 1.7e12 + 3000 * 37 + 1000;
for (const [pt, pp] of [[1000, 1], [7000, 5], [60000, 25]]) {
  const r = ex.regrouper(ta, tb, pt, pp);
  const s = r.reduce((x, b) => [x[0] + b.achat, x[1] + b.vente], [0, 0]);
  check(`regroupement ${pt / 1000} s × ${pp} $ : volume conservé`, Math.abs(s[0] - vrai[0]) < 1e-6 && Math.abs(s[1] - vrai[1]) < 1e-6);
}
const pr = ex.profil(ta, tb, 10);
const sp = [...pr.values()].reduce((x, v) => [x[0] + v[0], x[1] + v[1]], [0, 0]);
check('profil par prix : volume conservé', Math.abs(sp[0] - vrai[0]) < 1e-6 && Math.abs(sp[1] - vrai[1]) < 1e-6);
check('dernier prix = prix de la dernière exécution', ex.dernierPrix === +trades[2999].p);

// ── 6. Bougies 1 min : volume et CVD ─────────────────────────────────────────
titre('6. Bougies 1 min : delta exact, CVD cumulé');
const k = (t, q, tb) => [t, '1', '2', '0.5', '1.5', '10', t + 59999, String(q), 5, '5', String(tb), '0'];
const ms = BM.minutes([k(0, 1000, 700), k(60000, 1000, 200), k(120000, 500, 250)]);
check('delta = 2 × achats taker − volume', ms[0].delta === 400 && ms[1].delta === -600 && ms[2].delta === 0);
const cvd = BM.cvdDepuis(ms, 1);
check('CVD remis à zéro au bord gauche (indice 1) : −600, −600', isNaN(cvd[0]) && cvd[1] === -600 && cvd[2] === -600);
const m2 = BM.fusionnerMinutes(ms, BM.minutes([k(120000, 900, 600), k(180000, 10, 5)]));
check('fusion : la bougie en cours est REMPLACÉE, pas doublée', m2.length === 4 && m2[2].vol === 900);

// ── 7. Fichier de 15 min : murs et gamma ─────────────────────────────────────
titre('7. Murs et gamma : lus avec leur instant');
const md = JSON.parse(fs.readFileSync(path.join(REPO, 'market-data.json'), 'utf8'));
const n = BM.niveauxPublies(md);
check('murs lus des deux côtés, avec leur tranche', n.murs.length === (md.liquidity.bid_walls || []).length + (md.liquidity.ask_walls || []).length && n.tranche === md.liquidity.wall_bin_usd);
check('instant des murs = instant de la lecture du carnet', n.mursA === Date.parse(md.liquidity.snapshot_at));
check('gamma : mur de calls, de puts, zéro gamma', ['CW', 'PW', 'ZG'].every(c => n.gamma.some(x => x.court === c)) || !md.micro.call_wall);
check('âges lisibles', BM.age(800) === '0,8 s' && BM.age(42000) === '42 s' && BM.age(16 * 60e3) === '16 min' && BM.age(125 * 60e3) === '2 h 05');

// ── 8. Isolement : la carte ne touche pas au terminal ─────────────────────────
titre('8. Isolement : une page à côté, qui ne partage aucun code avec le terminal');
const html = fs.readFileSync(path.join(REPO, 'bookmap.html'), 'utf8');
const charges = [...html.matchAll(/\b(?:src|href)="([^"#]+)"/g)].map(m => m[1]).filter(u => !/^https?:/.test(u));
check('bookmap.html ne charge que ses fichiers (+ le lien retour vers le terminal)',
  charges.every(u => ['css/bookmap.css', 'js/bookmap-calc.js', 'js/bookmap.js', 'index.html'].includes(u)), charges);
check('aucun script du terminal chargé', !/js\/app\.js/.test(html) && !/themes\//.test(html));
const index = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8');
check('le terminal ne charge aucun fichier de la carte', !/bookmap/.test(index.replace(/<a [^>]*href="bookmap\.html"[^>]*>/g, '')));

console.log(ko ? `\n❌ CARTE : ${ko} contrôle(s) en échec` : '\n✅ CARTE : TOUS LES CONTRÔLES PASSENT');
process.exit(ko ? 1 : 0);
