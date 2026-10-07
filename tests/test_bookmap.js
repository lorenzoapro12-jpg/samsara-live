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

// ── 1b. Deux formats publiés, une seule grille ───────────────────────────────
// Le serveur passe à « colonnes-1 » APRÈS la livraison des pages : elles doivent lire les deux et
// en tirer EXACTEMENT la même grille. Contrôlé sur le fichier du dépôt converti ici (quel que soit
// son format : déjà converti, il est relu tel quel), et sur des cas limites.
titre('1b. heatmap.json : ancien format et « colonnes-1 » → grilles identiques');
const { versColonnes } = require('./heatmap_colonnes.js');
const memeGrille = (a, b) => !!a && !!b && ['t0', 'dt', 'W', 'dp', 'pbMin', 'H'].every(k => a[k] === b[k]) &&
  ['bids', 'asks', 'bas', 'haut'].every(k => a[k].length === b[k].length && a[k].every((x, i) => x === b[k][i])) &&
  JSON.stringify(a.encodage) === JSON.stringify(b.encodage) && a.majA === b.majA;
const hmDepot = JSON.parse(fs.readFileSync(path.join(REPO, 'heatmap.json'), 'utf8'));
const hmAncien = Array.isArray(hmDepot.colonnes) ? null : hmDepot;
if (hmAncien) {
  const gA = BM.grillePubliee(hmAncien), gC = BM.grillePubliee(versColonnes(hmAncien));
  check(`fichier du dépôt (${gA.W} colonnes × ${gA.H} tranches) : grille identique case par case`, memeGrille(gA, gC), { W: [gA.W, gC && gC.W], H: [gA.H, gC && gC.H] });
} else check('fichier du dépôt déjà en « colonnes-1 » : décodé', !!BM.grillePubliee(hmDepot));
// (Le serveur écrit t0 = minute × dt : un t0 hors minute n'existe que dans ce test.)
const hAligne = Object.assign({}, h, { t0: 17 * 60 });
check('petit fichier : identique, colonnes à un seul côté comprises', memeGrille(BM.grillePubliee(hAligne), BM.grillePubliee(versColonnes(hAligne))));
check('« colonnes-1 » : minute ABSOLUE → t0 = minute × dt', BM.grillePubliee(versColonnes(h)).t0 === Math.round(h.t0 / h.dt) * h.dt * 1000);
const trou = { updated: h.updated, t0: 60 * 100, dt: 60, dp: 20, format: 'colonnes-1',
  colonnes: [[100, 50, [3, 0, 7], 53, [9]], [102, null, [], 60, [1, 2]], [103, null, [], null, []]] };
const gT = BM.grillePubliee(trou);
check('minute absente (101) = non observée ; côté vide accepté ; colonne vide finale ignorée (comme l\'ancien)',
  gT.W === 3 && gT.bas[1] === -1 && gT.bas[0] === 50 && gT.haut[0] === 53 && gT.bas[2] === 60 && gT.haut[2] === 61, { W: gT.W, bas: [...gT.bas], haut: [...gT.haut] });
check('« 0 » dans une série : rien au-dessus du seuil, la couverture reste celle de la série', gT.bids[0 * gT.H + 1] === 0 && gT.bids[0 * gT.H + 2] === 7);
check('format annoncé inconnu : refusé (null), jamais deviné', BM.grillePubliee(Object.assign({}, trou, { format: 'colonnes-9' })) === null);
check('date de publication lue en tête, sans analyse complète', BM.majEnTete(JSON.stringify(h)) === h.updated && BM.majEnTete('{"x":1,"updated":"a"}') === null);

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

// ── 2b. Fusion : blocs ancrés sur l'HORLOGE, bornés à leurs données ────────────
titre('2b. Fusion dans le temps : blocs à l\'heure de l\'horloge, jamais au-delà des données');
const MIN = 60000;
{
  // Fenêtre publiée qui commence à hh:07 et finit à hh:18 (11 minutes) : blocs de 5 min.
  const a = aleatoire(11, 30, 4200); a.t0 = 7 * MIN; for (let c = 0; c < 11; c++) { a.bas[c] = 4202; a.haut[c] = 4225; }
  const f = BM.fusionMax(a, 5, 1);
  check('blocs ancrés sur l\'horloge : le premier commence à :05 (pas à :07, début de la fenêtre)', f.t0 === 5 * MIN && f.W === 3, { t0: f.t0 / MIN, W: f.W });
  check('premier bloc partiel : étendue réelle :07 → :10', f.deb[0] === 7 * MIN && f.fin[0] === 10 * MIN, [f.deb[0] / MIN, f.fin[0] / MIN]);
  check('dernier bloc partiel : étendue réelle :15 → :18 (pas :20)', f.deb[2] === 15 * MIN && f.fin[2] === 18 * MIN, [f.deb[2] / MIN, f.fin[2] / MIN]);
  check('fin des données inchangée par la fusion', BM.finGrille(f) === BM.finGrille(a) && BM.finGrille(a) === 18 * MIN);
  // La même heure passée, vue par deux publications décalées de 15 min : le même MAX.
  const b = aleatoire(240, 20, 4300); b.t0 = 600 * MIN;
  const p1 = Object.assign({}, b), p2 = BM.grilleVide(b.t0 + 15 * MIN, MIN, 225, 20, 4300, 20);
  for (let c = 15; c < 240; c++) { p2.bids.set(b.bids.subarray(c * 20, c * 20 + 20), (c - 15) * 20); p2.asks.set(b.asks.subarray(c * 20, c * 20 + 20), (c - 15) * 20); p2.bas[c - 15] = b.bas[c]; p2.haut[c - 15] = b.haut[c]; }
  const F1 = BM.fusionMax(p1, 60, 1), F2 = BM.fusionMax(p2, 60, 1);
  const bloc = (F, debut) => { const C = Math.round((debut - F.t0) / F.dt); return [...F.bids.subarray(C * F.H, C * F.H + F.H)].join(); };
  check('fenêtre glissée de 15 min : le MAX de l\'heure 11:00–12:00 ne change pas', bloc(F1, 660 * MIN) === bloc(F2, 660 * MIN));
  // Rien n'est peint après la fin des données, même quand le bloc est large.
  const w = 120, h = 30, vue = { t1: 5 * MIN, t2: 25 * MIN, p1: 4200 * 20, p2: 4230 * 20 };
  const px = new Uint32Array(w * h).fill(0xffffffff), lut = Uint32Array.from({ length: 256 }, (_, v) => v + 1);
  BM.peindreGrille(px, w, h, f, vue, { lut, maintenant: Infinity });
  let apres = 0, avant = 0;
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) {
    const t = vue.t1 + x * (vue.t2 - vue.t1) / w, peint = px[y * w + x] !== 0xffffffff;
    if (peint && t >= 18 * MIN) apres++;
    if (peint && t + (vue.t2 - vue.t1) / w <= 7 * MIN) avant++;
  }
  check('aucun pixel peint après la fin des données (:18) ni avant leur début (:07)', !apres && !avant, { apres, avant });
}
check('âge de la dernière colonne : depuis la publication quand elle précède la fin de la minute',
  BM.instantDerniereColonne(Object.assign(BM.grilleVide(0, MIN, 3, 20, 0, 1), { majA: 2.5 * MIN })) === 2.5 * MIN &&
  BM.instantDerniereColonne(Object.assign(BM.grilleVide(0, MIN, 3, 20, 0, 1), { majA: 9 * MIN })) === 3 * MIN);

// ── 2c. La lecture au pointeur décrit le pixel peint ───────────────────────────
// Un pixel peint le MAX de toutes les cellules qu'il recouvre ; la lecture doit donner CE
// maximum, pas la cellule exacte sous le pointeur (contrôlé pixel par pixel, à plusieurs zooms,
// grille régulière et fusionnée, palette unique et palette par côté).
titre('2c. Lecture au pointeur = pixel peint (même MAX, mêmes colonnes, mêmes tranches)');
{
  const a = aleatoire(90, 60, 4200); a.t0 = 120 * MIN;
  const lutB = Uint32Array.from({ length: 256 }, (_, v) => 1000 + v), lutA = Uint32Array.from({ length: 256 }, (_, v) => 2000 + v);
  const lut = Uint32Array.from({ length: 256 }, (_, v) => v + 1);
  let ecarts = 0, pixels = 0, multiples = 0;
  for (const [g, w, h, vue, mt] of [
    [a, 70, 40, { t1: 110 * MIN, t2: 220 * MIN, p1: 4195 * 20, p2: 4262 * 20 }, Infinity],          // ~1,6 colonne et ~1,7 tranche par pixel
    [a, 300, 200, { t1: 150 * MIN, t2: 170 * MIN, p1: 4210 * 20, p2: 4230 * 20 }, 165.5 * MIN],     // zoom fin, « maintenant » au milieu
    [BM.fusionMax(a, 15, 2), 90, 50, { t1: 100 * MIN, t2: 230 * MIN, p1: 4190 * 20, p2: 4270 * 20 }, Infinity],
  ]) for (const o of [{ lut }, { lutB, lutA }]) {
    const px = new Uint32Array(w * h).fill(7), tpp = (vue.t2 - vue.t1) / w, pp = (vue.p2 - vue.p1) / h;
    BM.peindreGrille(px, w, h, g, vue, Object.assign({ maintenant: mt }, o));
    for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) {
      const ta = vue.t1 + x * tpp, tb = Math.min(ta + tpp, mt), [ja, jb] = BM.tranchesLigne(vue.p2, pp, y, g.dp, [0, 0]);
      const r = tb > ta ? BM.lirePixel(g, ta, tb, ja, jb) : null;
      const attendu = !r || !r.nObs || r.horsBande ? 7 : (o.lut ? lut[r.v] : (r.cote === 'bid' ? lutB[r.v] : lutA[r.v]));
      pixels++; if (r && r.nObs * r.nT > 1) multiples++;
      if (px[y * w + x] !== attendu) ecarts++;
    }
  }
  check(`${pixels} pixels : la valeur lue est celle peinte (dont ${multiples} pixels qui recouvrent plusieurs cellules)`, ecarts === 0 && multiples > 1000, { ecarts, multiples });
}

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

// ── 4b. Carnet live : à l'instant réel de chaque lecture, en quantités ────────
titre('4b. Carnet live : chaque lecture à son instant, quantités gardées, échelle qui suit');
{
  // Un carnet synthétique centré sur `m` (prix), niveaux de 1 $ ; q(i) déterministe.
  const carnet = (m, k) => BM.agregerCarnet({
    bids: Array.from({ length: 40 }, (_, i) => [String(m - 0.5 - i), String(((i * 7 + k) % 13) / 2 + 0.25)]),
    asks: Array.from({ length: 40 }, (_, i) => [String(m + 0.5 + i), String(((i * 5 + k) % 11) / 2 + 0.25)]) }, 5);
  const enc = { ref_btc: 100, plafond: 255 };
  const L = new BM.CarnetLive(5, 2000);
  L.fixerEchelle('publiee', q => BM.intensite(q, enc));
  // Lectures « réelles » : période 2 s + latence variable (2,0 à 2,4 s), comme une boucle qui
  // relançait APRÈS la réponse ; et une requête de 1,1 s.
  const lectures = [];
  let t = 1e6;
  for (let k = 0; k < 30; k++) { const s = t, r = t + (k === 12 ? 1100 : 80 + (k % 5) * 60); lectures.push([s, r]); L.ajouter(carnet(86000 + k, k), s, r, 100 + k); t = r + 2000; }
  check('30 lectures, 30 colonnes (aucune perdue, aucune doublée)', L.n === 30);
  check('instant d\'une lecture = milieu de [envoi, réception]', lectures.every(([s, r], c) => L.deb[c] === (s + r) / 2));
  let jointif = true;
  for (let c = 0; c + 1 < L.n; c++) if (L.fin[c] !== L.deb[c + 1]) jointif = false;
  check('chaque lecture vaut jusqu\'à la suivante : aucune colonne « non observé » entre deux lectures', jointif);
  // Lecture au pointeur à chaque instant entre la première lecture et « maintenant » : toujours observée.
  const fin = L.deb[L.n - 1] + 1500;
  let trous = 0;
  for (let x = L.deb[0]; x < fin; x += 97) { const r = BM.lirePixel(L, x, x + 97, 17200, 17200); if (!r || !r.nObs) trous++; }
  check('de la première lecture à « maintenant », aucun instant non observé', trous === 0, trous);
  // Rien après « maintenant » : un pixel au-delà ne reçoit rien.
  const w = 200, h = 10, vue = { t1: L.deb[L.n - 1] - 5000, t2: L.deb[L.n - 1] + 15000, p1: 85990, p2: 86070 }, px = new Uint32Array(w * h);
  const lut = Uint32Array.from({ length: 256 }, (_, v) => v + 1);
  BM.peindreGrille(px, w, h, L, vue, { lut, maintenant: fin });
  let futur = 0, present = 0;
  for (let x = 0; x < w; x++) { const ta = vue.t1 + x * 100; for (let y = 0; y < h; y++) if (px[y * w + x]) { if (ta >= fin) futur++; else present++; } }
  check('aucune chaleur peinte après « maintenant » (la dernière lecture s\'arrête au présent)', futur === 0 && present > 0, { futur, present });
  // Absence réelle (plus de 3 cadences + 1 s) : non observé.
  const L2 = new BM.CarnetLive(5, 2000);
  L2.ajouter(carnet(86000, 1), 0, 100, 1); L2.ajouter(carnet(86000, 2), 30000, 30100, 2);
  check('absence de 30 s : la lecture d\'avant s\'arrête à 3 cadences + 1 s, le reste est non observé',
    L2.fin[0] === 50 + 7000 && !BM.lirePixel(L2, 20000, 20100, 17200, 17200), [L2.fin[0]]);
  // Identifiant qui ne croît pas : instantané plus ancien, écarté.
  check('lastUpdateId qui ne croît pas : lecture écartée (« perimee »)', L2.ajouter(carnet(86000, 3), 32000, 32100, 2) === 'perimee' && L2.n === 2);
  check('instant qui ne croît pas : écarté', L2.ajouter(carnet(86000, 3), 29000, 29100, 9) === 'desordre' && L2.n === 2);
  // Échelle : propre au départ, puis l'encodage publié arrive — tout est ré-encodé, rien n'est perdu.
  const L3 = new BM.CarnetLive(5, 2000), a3 = carnet(86000, 4);
  L3.fixerEchelle('propre:2', q => BM.intensiteRelative(q, 2));
  L3.ajouter(a3, 0, 100, 1); L3.ajouter(carnet(86001, 5), 2000, 2100, 2);
  const pb = [...a3.bids.keys()][3], q3 = a3.bids.get(pb);
  const vPropre = L3.valeur(0, pb, 'b');
  check('échelle propre : intensité relative au p99', vPropre === BM.intensiteRelative(q3, 2));
  check('encodage publié arrivé après : ré-encodage (vrai), les DEUX lectures gardées', L3.fixerEchelle('publiee', q => BM.intensite(q, enc)) && L3.n === 2);
  check('… même quantité → intensité publiée', L3.valeur(0, pb, 'b') === BM.intensite(q3, enc) && L3.quantite(0, pb, 'b') === q3);
  check('encodage disparu : retour à une échelle propre, rien de nul', L3.fixerEchelle('propre:2', q => BM.intensiteRelative(q, 2)) && L3.valeur(0, pb, 'b') === vPropre && vPropre > 0);
  check('même échelle redemandée : rien à refaire', !L3.fixerEchelle('propre:2', q => BM.intensiteRelative(q, 2)));
  // Horloge recalée : les instants (gardés en heure locale) suivent l'écart.
  L3.recaler(30000);
  check('nouvel écart d\'horloge : chaque lecture replacée (+30 s)', L3.deb[0] === 50 + 30000 && L3.deb[1] === 2050 + 30000 && L3.fin[0] === L3.deb[1]);
  // Capacité : la moitié ancienne s'oublie, les valeurs gardées restent justes (tampon compacté).
  const L4 = new BM.CarnetLive(5, 1000, 10);
  L4.fixerEchelle('publiee', q => BM.intensite(q, enc));
  const ref = [];
  for (let k = 0; k < 11; k++) { const a = carnet(86000 + 3 * k, k); ref.push(a); L4.ajouter(a, k * 1000, k * 1000 + 50, k + 1); }
  let justes = true;
  for (let c = 0; c < L4.n; c++) { const a = ref[11 - L4.n + c]; for (const [p, q] of a.bids) if (L4.quantite(c, p, 'b') !== q) justes = false; for (const [p, q] of a.asks) if (L4.quantite(c, p, 'a') !== q) justes = false; }
  check('pleine (10) : la moitié ancienne oubliée, 6 lectures gardées, quantités intactes', L4.n === 6 && L4.deb[0] === 5025 && justes, { n: L4.n, deb0: L4.deb[0] });
  let bande = true;
  for (let c = 0; c < L4.n; c++) if (L4.bas[c] < L4.pbMin || L4.haut[c] > L4.pbMin + L4.H - 1) bande = false;
  check('bande réunie recalculée après oubli (aucune bande fixe à recentrer)', bande && L4.pbMin === Math.min(...Array.from(L4.bas.subarray(0, L4.n))));
  const L5 = new BM.CarnetLive(1, 1000, 100, 400);
  for (let k = 0; k < 20; k++) L5.ajouter(BM.agregerCarnet({ bids: Array.from({ length: 60 }, (_, i) => [String(86000 - i), '1']), asks: Array.from({ length: 60 }, (_, i) => [String(86001 + i), '1']) }, 1), k * 1000, k * 1000 + 10, k + 1);
  check('tampon borné : la mémoire ne dépasse jamais sa borne', L5.lg <= 400 && L5.n >= 1 && L5.n < 20, { lg: L5.lg, n: L5.n });
  // Peinture et lecture au pointeur du carnet live : la même valeur, pixel par pixel.
  const lb = Uint32Array.from({ length: 256 }, (_, v) => 1000 + v), la = Uint32Array.from({ length: 256 }, (_, v) => 2000 + v);
  const w2 = 160, h2 = 50, v2 = { t1: L.deb[0] - 3000, t2: L.deb[L.n - 1] + 4000, p1: 85940, p2: 86110 }, p2 = new Uint32Array(w2 * h2).fill(7);
  BM.peindreGrille(p2, w2, h2, L, v2, { lutB: lb, lutA: la, maintenant: fin });
  let ecarts = 0;
  const tpp = (v2.t2 - v2.t1) / w2, pp = (v2.p2 - v2.p1) / h2;
  for (let x = 0; x < w2; x++) for (let y = 0; y < h2; y++) {
    const ta = v2.t1 + x * tpp, tb = Math.min(ta + tpp, fin), [ja, jb] = BM.tranchesLigne(v2.p2, pp, y, L.dp, [0, 0]);
    const r = tb > ta ? BM.lirePixel(L, ta, tb, ja, jb) : null;
    if (p2[y * w2 + x] !== (!r || !r.nObs || r.horsBande ? 7 : (r.cote === 'bid' ? lb[r.v] : la[r.v]))) ecarts++;
  }
  check('carnet live : la valeur lue est celle peinte (' + w2 * h2 + ' pixels)', ecarts === 0, ecarts);
}

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

// ── 5b. Seaux ancrés, pas multiples de la tranche ─────────────────────────────
titre('5b. Seaux : ancrés sur l\'horloge et le prix, pas de prix multiples de la tranche');
let multiples = true;
for (let i = 0; i < 3000; i++) {
  const dp = [1, 5, 10, 20][i % 4], brut = Math.exp(rnd() * 9 - 1), p = BM.pasMultiple(brut, dp), k = p / dp, e = Math.pow(10, Math.floor(Math.log10(k)));
  if (!(Number.isInteger(k) && p >= brut - 1e-9 && [1, 2, 5].includes(Math.round(k / e)))) { multiples = false; break; }
}
check('pas de prix = tranche × (1, 2, 5) × 10ⁿ ≥ brut, toujours un multiple ENTIER (3 000 tirages)', multiples);
check('jamais 2,5 $ sur 1 $, ni 25 $ sur 10 ou 20 $', BM.pasMultiple(2.3, 1) === 5 && BM.pasMultiple(22, 10) === 50 && BM.pasMultiple(22, 20) === 40 && BM.pasMultiple(12, 5) === 25);
// Un carnet UNIFORME (1 BTC par tranche de 10 $) agrégé au pas choisi : toutes les barres égales.
{
  const dp = 10, sb = new Map(); for (let pb = 8000; pb < 8200; pb++) sb.set(pb, 1);
  const pas = BM.pasMultiple(22, dp), m = pas / dp, o = new Map();
  for (const [pb, q] of sb) { const P = Math.floor(pb / m); o.set(P, (o.get(P) || 0) + q); }
  const vals = [...o.values()];
  check(`carnet latéral uniforme, Σ par ${pas} $ : toutes les barres pleines égales (aucun peigne)`, vals.slice(1, -1).every(v => v === m), vals.slice(0, 8));
}
{
  // Flux uniforme : 1 BTC par seconde dans chaque tranche de 1 $ ; profil au pas choisi pour 1,5 $ brut.
  const e = new BM.SeauxExecutions(1); let id = 1;
  for (let s = 0; s < 20; s++) for (let pb = 86000; pb < 86040; pb++) e.ajouter({ a: id++, p: String(pb + 0.5), q: '1', T: 1.7e12 + s * 1000, m: false });
  const pas = BM.pasMultiple(1.5, 1), pr = [...e.profil(1.7e12, 1.7e12 + 20000, pas).values()].map(v => v[0]);
  check(`profil d'un flux uniforme, tranches de ${pas} $ : toutes égales (aucun nœud inventé)`, pr.every(v => v === pr[0]) && pr[0] === 20 * pas, pr.slice(0, 6));
  // Ancrage : deux vues décalées d'un nombre quelconque de ms → les mêmes seaux (mêmes volumes, mêmes bornes).
  const cle = r => r.map(b => [b.ta, b.pa, b.achat].join()).sort().join('|');
  const a1 = e.regrouper(1.7e12 + 3000, 1.7e12 + 17000, 5000, 5), a2 = e.regrouper(1.7e12 + 3777, 1.7e12 + 16123, 5000, 5);
  check('bulles : ancrées sur l\'horloge — une vue qui glisse ne regroupe pas autrement', cle(a1) === cle(a2) && a1.every(b => b.ta % 5000 === 0 && b.pa % 5 === 0));
  check('bulle placée au milieu des secondes qui ont des exécutions (pas au centre d\'un seau à moitié lu)',
    e.regrouper(1.7e12 + 15000, 1.7e12 + 20000, 10000, 5).every(b => b.t >= 1.7e12 + 10000 && b.t <= 1.7e12 + 20000) && e.regrouper(1.7e12 + 15000, 1.7e12 + 20000, 60000, 5)[0].t === 1.7e12 + 10000);
}

// ── 5c. Ligne de prix : à la seconde, exacte, coupée sur ce qui n'est pas lu ──
titre('5c. Ligne de prix : VWAP exact à la seconde au zoom, clôtures ailleurs, coupée sur les trous');
{
  const T0 = 1.7e12, e = new BM.SeauxExecutions(1); let id = 1;
  // Exécutions de T0 + 120 s à T0 + 300 s : deux par seconde, à des prix qui ne sont pas des centres de tranche.
  const vrai = new Map();
  for (let s = 120; s < 300; s++) {
    if (s >= 200 && s < 230) continue;                         // 30 s non lues
    const p1 = 86000 + Math.sin(s / 9) * 20 + 0.13, p2 = p1 + 0.71, q1 = 0.4, q2 = 1.1;
    e.ajouter({ a: id++, p: p1.toFixed(2), q: String(q1), T: T0 + s * 1000 + 100, m: false });
    e.ajouter({ a: id++, p: p2.toFixed(2), q: String(q2), T: T0 + s * 1000 + 600, m: true });
    vrai.set(s, (+p1.toFixed(2) * q1 + +p2.toFixed(2) * q2) / (q1 + q2));
  }
  const kl = (t, c) => [t, '1', '1', '1', String(c), '1', t + 59999, '1', 1, '1', '1', '0'];
  const ms = BM.minutes([0, 1, 2, 3, 4].map(i => kl(T0 + i * 60000, 86000 + i)));
  const nonLues = [[T0 + 200000, T0 + 230000]];
  const z = BM.lignePrix(ms, e, { t1: T0, t2: T0 + 300000, parSeconde: true, minutesA: T0 + 300000, nonLues, maintenant: T0 + 300000 });
  const pts = z.flat(), sec = pts.filter(([t]) => t > T0 + 120000);
  check('au zoom : avant les exécutions, les clôtures 1 min', pts[0][0] === T0 + 60000 && pts[0][1] === 86000 && pts.filter(([t]) => t <= T0 + 120000).length === 2, pts.slice(0, 3));
  check('au zoom : ensuite, chaque seconde lue à son VWAP EXACT (pas au centre d\'une tranche de 1 $)',
    sec.length === 150 && sec.every(([t, p]) => Math.abs(p - vrai.get(Math.floor(t / 1000) - T0 / 1000)) < 1e-9 && (t - 500) % 1000 === 0), sec.length);
  check('coupée sur les 30 s d\'exécutions non lues (deux segments à la seconde)', z.length === 2 && z[1][0][0] === T0 + 230500, z.map(x => x.length));
  const d = BM.lignePrix(ms, e, { t1: T0, t2: T0 + 300000, parSeconde: false, minutesA: T0 + 300000, nonLues: [], maintenant: T0 + 300000 });
  check('vue large : les clôtures 1 min (aucune seconde avant la dernière clôture)', d.flat().filter(([t]) => t < T0 + 300000).every(([t]) => (t - T0) % 60000 === 0));
  const trou = BM.minutes([kl(T0, 1), kl(T0 + 60000, 2), kl(T0 + 240000, 3)]);
  check('minutes manquantes : la ligne des clôtures est coupée', BM.lignePrix(trou, new BM.SeauxExecutions(1), { t1: T0, t2: T0 + 300000, parSeconde: false, minutesA: T0 + 1e6 }).length === 2);
}

// ── 6. Bougies 1 min : volume et CVD ─────────────────────────────────────────
titre('6. Bougies 1 min : delta exact, CVD cumulé');
const k = (t, q, tb) => [t, '1', '2', '0.5', '1.5', '10', t + 59999, String(q), 5, '5', String(tb), '0'];
const ms = BM.minutes([k(0, 1000, 700), k(60000, 1000, 200), k(120000, 500, 250)]);
check('delta = 2 × achats taker − volume', ms[0].delta === 400 && ms[1].delta === -600 && ms[2].delta === 0);
const cvd = BM.cvdDepuis(ms, 1);
check('CVD remis à zéro au bord gauche (indice 1) : −600, −600', isNaN(cvd[0]) && cvd[1] === -600 && cvd[2] === -600);
const m2 = BM.fusionnerMinutes(ms, BM.minutes([k(120000, 900, 600), k(180000, 10, 5)]));
check('fusion : la bougie en cours est REMPLACÉE, pas doublée', m2.length === 4 && m2[2].vol === 900);
// Absence : la série a un trou, le rattrapage (startTime) le comble EN PLACE.
const avecTrou = BM.minutes([k(0, 10, 2), k(60000, 10, 2), k(300000, 10, 2), k(360000, 10, 2)]);     // delta −6 par minute
check('trou de bougies détecté : minutes 2 à 4 non lues', JSON.stringify(BM.trousMinutes(avecTrou)) === JSON.stringify([[120000, 300000]]), BM.trousMinutes(avecTrou));
const comble = BM.fusionnerMinutes(avecTrou, BM.minutes([k(60000, 20, 5), k(120000, 30, 5), k(180000, 30, 5), k(240000, 30, 5), k(300000, 40, 5)]));
check('rattrapage : les minutes manquantes s\'insèrent à leur place, les relues sont remplacées',
  comble.map(m => m.t / 60000).join() === '0,1,2,3,4,5,6' && comble[1].vol === 20 && comble[5].vol === 40 && !BM.trousMinutes(comble).length, comble.map(m => m.t / 60000));
const cv = BM.cvd(avecTrou, 0);
check('CVD : après un trou, le cumul repart de 0 (et l\'indice de reprise est rendu)', cv.reprises.join() === '2' && [...cv.v].join() === '-6,-12,-6,-12', { v: [...cv.v], r: cv.reprises });
check('durée non lue dans une fenêtre', BM.dureeDans([[100, 200], [300, 500]], 150, 400) === 150);
check('volume : minutes par barre dans une échelle fixe (≥ 2 px), ancrable sur l\'horloge',
  BM.pasMinutes(10) === 1 && BM.pasMinutes(0.9) === 3 && BM.pasMinutes(0.3) === 10 && BM.pasMinutes(0.01) === 360 && BM.texteMinutes(1) === 'minute' && BM.texteMinutes(15) === '15 min' && BM.texteMinutes(120) === '2 h');

// ── 7. Fichier de 15 min : murs et gamma ─────────────────────────────────────
titre('7. Murs et gamma : lus avec leur instant');
const md = JSON.parse(fs.readFileSync(path.join(REPO, 'market-data.json'), 'utf8'));
const n = BM.niveauxPublies(md);
check('murs lus des deux côtés, avec leur tranche', n.murs.length === (md.liquidity.bid_walls || []).length + (md.liquidity.ask_walls || []).length && n.tranche === md.liquidity.wall_bin_usd);
check('instant des murs = instant de la lecture du carnet', n.mursA === Date.parse(md.liquidity.snapshot_at));
check('gamma : mur de calls, de puts, zéro gamma', ['CW', 'PW', 'ZG'].every(c => n.gamma.some(x => x.court === c)) || !md.micro.call_wall);
{
  const usdt = md.micro && md.micro.usdt_usd;
  const unite = md.meta && md.meta.champs && md.meta.champs['micro.call_wall'] && md.meta.champs['micro.call_wall'].unite;
  if (usdt && unite === 'USD') check(`gamma : strikes en USD placés en USDT au cours publié (÷ ${usdt})`, n.conversion && n.conversion.taux === usdt && n.gamma.every(g => Math.abs(g.pAxe - g.p / usdt) < 1e-9), n.gamma);
  const sans = JSON.parse(JSON.stringify(md)); delete sans.micro.usdt_usd;
  const n2 = BM.niveauxPublies(sans);
  check('gamma sans cours USDT/USD publié : posé tel quel, « non converti » (conversion = null)', n2.conversion === null && n2.gamma.every(g => g.pAxe === g.p));
  const enUsdt = JSON.parse(JSON.stringify(md)); if (enUsdt.meta && enUsdt.meta.champs && enUsdt.meta.champs['micro.call_wall']) enUsdt.meta.champs['micro.call_wall'].unite = 'USDT';
  check('strikes déclarés en USDT par meta.champs : aucune conversion (l\'unité vient du fichier)', !enUsdt.meta || BM.niveauxPublies(enUsdt).conversion === null);
}
check('âges lisibles', BM.age(800) === '0,8 s' && BM.age(42000) === '42 s' && BM.age(16 * 60e3) === '16 min' && BM.age(125 * 60e3) === '2 h 05');

// ── 7a. Libellés : ce qu'ils disent est ce que le code fait ────────────────────
titre('7a. Libellés justes : graduations, contraste, bulles, réglages');
check('décimales du pas : 2,5 → 1 ; 0,25 → 2 ; 20 → 0 ; 0,5 → 1', BM.decimales(2.5) === 1 && BM.decimales(0.25) === 2 && BM.decimales(20) === 0 && BM.decimales(0.5) === 1 && BM.decimales(25) === 0);
check('graduation de 2,5 $ écrite avec sa décimale (86 002,5, pas 86 003)', BM.prix(86002.5, BM.decimales(2.5)).replace(/\s/g, ' ') === '86 002,5');
check('pas de temps : jamais 100 s (échelle fixe) ; 15 s, 30 s, 1 min…', !BM.PAS_TEMPS.includes(100000) && BM.pasTemps(55000) === 60000 && BM.pasTemps(12000) === 15000 && BM.pasTemps(16 * 60e3) === 30 * 60e3);
check('jour court pour une vue qui passe minuit', /^(dim|lun|mar|mer|jeu|ven|sam)\. \d\d$/.test(BM.jour(Date.UTC(2026, 9, 6, 12))));
check('contraste appliqué : saturation ≤ seuil → seuil + 1 (c\'est cette valeur que la légende écrit)', BM.bornesContraste(100, 60).haut === 101 && BM.bornesContraste(2, 200).haut === 200);
{
  const b = BM.bornesBulles(1), b6 = BM.bornesBulles(0.6);
  check(`bulles : surface ∝ volume de ${BM.btc(b.min)} à ${BM.btc(b.max)} BTC (normale), bornes tirées du rayon`,
    Math.abs(BM.rayonBulle(b.min, 1) - BM.BULLES.rMin) < 1e-9 && Math.abs(BM.rayonBulle(b.max, 1) - BM.BULLES.rMax) < 1e-9
    && BM.rayonBulle(b.min / 2, 1) === BM.BULLES.rMin && BM.rayonBulle(b.max * 3, 1) === BM.BULLES.rMax && b6.min > b.min);
}
{
  const D = { calques: { a: true, b: false }, palette: 'classique', fusionT: 1, seuilBas: 2, bulleMin: 0.1 };
  const regles = { palette: { liste: ['classique', 'cividis', 'cote'] }, fusionT: { liste: ['1', '5', '15', '60'], nombre: true },
    bulleMin: { liste: ['0', '0.1', '0.5'], nombre: true }, seuilBas: { min: 0, max: 120, entier: true } };
  const v = BM.validerReglages({ palette: 'disparue', fusionT: 3, bulleMin: 'abc', seuilBas: 500, calques: { a: 'oui', b: true }, inconnu: 1 }, D, regles);
  check('réglages stockés invalides : remplacés par les défauts, jamais appliqués en silence',
    v.reglages.palette === 'classique' && v.reglages.fusionT === 1 && v.reglages.bulleMin === 0.1 && v.reglages.seuilBas === 2 && v.reglages.calques.a === true && v.reglages.calques.b === true && !('inconnu' in v.reglages), v);
  check('… et listés (palette, fusionT, bulleMin, seuilBas, calques.a)', ['palette', 'fusionT', 'bulleMin', 'seuilBas', 'calques.a'].every(k => v.rejets.includes(k)), v.rejets);
  const ok = BM.validerReglages({ palette: 'cote', fusionT: '15', bulleMin: 0.5, seuilBas: 40 }, D, regles);
  check('réglages valides : gardés (nombres normalisés)', ok.reglages.palette === 'cote' && ok.reglages.fusionT === 15 && ok.reglages.bulleMin === 0.5 && ok.reglages.seuilBas === 40 && !ok.rejets.length, ok);
  check('stockage illisible (tableau, null) : les défauts', BM.validerReglages([1, 2], D, regles).reglages.palette === 'classique' && BM.validerReglages(null, D, regles).reglages.fusionT === 1);
}

// ── 7b. Horloge Binance ──────────────────────────────────────────────────────
titre('7b. Horloge : l\'heure de Binance, mesurée, avec son incertitude');
{
  const hz = new BM.Horloge();
  // Horloge locale en RETARD de 30 s : le serveur répond S = local + 30 000 au milieu de l'aller-retour.
  hz.echantillon(1000, 1400, 1200 + 30000);            // aller-retour 400 ms
  check('écart = S − (s + r)/2 ; incertitude = (r − s)/2', hz.ecart === 30000 && hz.u === 200, { ecart: hz.ecart, u: hz.u });
  hz.echantillon(5000, 5060, 5030 + 30012);            // aller-retour 60 ms : plus sûr, retenu
  hz.echantillon(9000, 9900, 9450 + 29000);            // aller-retour 900 ms : écarté
  check('retenu : l\'échantillon au plus court aller-retour parmi les 5 derniers', hz.ecart === 30012 && hz.u === 30, { ecart: hz.ecart, u: hz.u });
  for (let i = 0; i < 5; i++) hz.echantillon(20000 + i * 1000, 20000 + i * 1000 + 300, 20000 + i * 1000 + 150 + 31000);
  check('fenêtre glissante : un vieil échantillon sort (5 gardés)', hz.echantillons.length === 5 && hz.ecart === 31000, hz.ecart);
  check('maintenant = local + écart', hz.maintenant(1e6) === 1e6 + 31000);
  const i = hz.instant(100000, 100400);
  check('instant d\'une lecture sans heure serveur : milieu de [s, r] ± (demi-aller-retour + incertitude)', i.t === 100200 + 31000 && i.u === 200 + 150, i);
  check('écart > 1 s : écrit (« horloge locale en retard de 31,0 s ± 150 ms »)', /en retard de 31,0 s ± 150 ms/.test(hz.texte() || ''), hz.texte());
  const h0 = new BM.Horloge(); h0.echantillon(0, 100, 50 + 400);
  check('écart ≤ 1 s : rien d\'écrit ; jamais mesurée : écart nul', h0.texte() === null && new BM.Horloge().maintenant(5) === 5);
  check('échantillon absurde refusé (réception avant envoi, heure illisible)', !new BM.Horloge().echantillon(10, 5, 7) && !new BM.Horloge().echantillon(0, 5, NaN));
}

// ── 7c. Cadence : pas fixe, recul, porte des limites ─────────────────────────
titre('7c. Lectures : pas fixe, délais, recul sur 429 / 418');
check('pas fixe : la durée de la requête ne s\'ajoute pas (départ 0, période 2 s, fin à 2,3 s → 4 s)', BM.prochainCreneau(0, 2000, 2300) === 4000);
check('requête plus longue qu\'une période : on saute les créneaux passés (pas de rafale)', BM.prochainCreneau(0, 2000, 7100) === 8000);
check('juste à l\'heure : le créneau suivant', BM.prochainCreneau(0, 2000, 4000) === 6000);
check('échecs : période × 2^n, plafonnée à 60 s (ou à la période si elle est plus longue)',
  BM.delaiReessai(2000, 0) === 2000 && BM.delaiReessai(2000, 1) === 4000 && BM.delaiReessai(2000, 3) === 16000 && BM.delaiReessai(2000, 9) === 60000 && BM.delaiReessai(300000, 4) === 300000);
check('Retry-After : secondes ou date HTTP ; absent → null', BM.lireRetryAfter('7', 0) === 7 && BM.lireRetryAfter(new Date(10000).toUTCString(), 4000) === 6 && BM.lireRetryAfter(null) === null && BM.lireRetryAfter('n/a') === null);
{
  const p = new BM.Recul();
  const d1 = p.echec(429, null, 0), d2 = p.echec(429, null, 0), d3 = p.echec(429, null, 0);
  check('429 sans Retry-After : 30 s, 60 s, 120 s…', d1 === 30000 && d2 === 60000 && d3 === 120000, [d1, d2, d3]);
  check('la porte reste fermée jusqu\'au bout du recul', p.attente(119000) === 1000 && p.attente(130000) === 0);
  p.succes();
  check('un succès remet le recul à zéro', p.echec(429, null, 200000) === 30000);
  const q = new BM.Recul();
  check('Retry-After honoré tel quel ; 418 (adresse bannie) : 2 min sans Retry-After', q.echec(429, 7, 0) === 7000 && new BM.Recul().echec(418, null, 0) === 120000);
  let r = new BM.Recul(), d = 0; for (let k = 0; k < 20; k++) d = r.echec(429, null, 0);
  check('recul plafonné à 30 min', d === 30 * 60e3);
}
check('une lecture vaut jusqu\'à la suivante, au plus 3 cadences + 1 s', BM.validiteLecture(2000) === 7000);

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
