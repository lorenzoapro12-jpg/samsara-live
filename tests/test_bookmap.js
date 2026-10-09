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

// ── 2d. Bandes peintes seules = le même endroit d'un repeint complet ──────────
// La carte garde son calque publié et, quand la vue glisse d'un nombre entier de pixels, ne repeint
// que les bandes découvertes : chaque pixel d'une bande doit valoir celui d'un repeint complet.
titre('2d. Peinture par bandes (glissement) : chaque pixel = celui du repeint complet');
{
  const a = aleatoire(90, 60, 4200); a.t0 = 120 * MIN;
  const lut = Uint32Array.from({ length: 256 }, (_, v) => v + 1);
  const L = new BM.CarnetLive(20, 2000);
  L.fixerEchelle('x', q => Math.min(255, Math.round(q * 9)));
  for (let k = 0; k < 40; k++) L.ajouter(BM.agregerCarnet({ bids: Array.from({ length: 30 }, (_, i) => [String(84300 - i * 7), String((k + i) % 9 + 0.5)]), asks: Array.from({ length: 30 }, (_, i) => [String(84310 + i * 7), String((k * 3 + i) % 11 + 0.5)]) }, 20), 150 * MIN + k * 2000, 150 * MIN + k * 2000 + 90, k + 1);
  let ecarts = 0, pixels = 0;
  for (const [g, w, h, vue, mt] of [
    [a, 97, 41, { t1: 110 * MIN, t2: 220 * MIN, p1: 4195 * 20, p2: 4262 * 20 }, Infinity],
    [BM.fusionMax(a, 15, 2), 90, 50, { t1: 100 * MIN, t2: 230 * MIN, p1: 4190 * 20, p2: 4270 * 20 }, Infinity],
    [L, 120, 45, { t1: 149 * MIN, t2: 152 * MIN, p1: 84050, p2: 84600 }, 151.2 * MIN],
  ]) {
    const plein = new Uint32Array(w * h);
    BM.peindreGrille(plein, w, h, g, vue, { lut, maintenant: mt });
    for (const [xa, ya, xb, yb] of [[0, 0, 7, h], [w - 5, 0, w, h], [0, h - 3, w, h], [0, 0, w, 4], [13, 9, 40, 30], [0, 0, w, h]]) {
      const b = new Uint32Array((xb - xa) * (yb - ya));
      BM.peindreGrille(b, w, h, g, vue, { lut, maintenant: mt, rect: [xa, ya, xb, yb] });
      for (let y = ya; y < yb; y++) for (let x = xa; x < xb; x++) { pixels++; if (b[(y - ya) * (xb - xa) + (x - xa)] !== plein[y * w + x]) ecarts++; }
    }
  }
  check(`${pixels} pixels peints par bandes (grille publiée, fusionnée, carnet live) : identiques au repeint complet`, ecarts === 0 && pixels > 15000, ecarts);
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

// ── 5d. Plis : regroupements gardés et complétés, identiques à un regroupement refait ──
// La carte ne rebalaye plus toutes les secondes à chaque image : les seaux d'un (pas de temps, pas
// de prix) sont gardés, complétés seconde par seconde, coupés par la purge. Ce qu'ils rendent doit
// être, AU BIT PRÈS, ce qu'un regroupement refait de zéro rend — et ils doivent vraiment éviter de
// tout rebalayer (sinon ils ne servent à rien).
titre('5d. Seaux gardés (plis) : complétés au fil des exécutions, identiques à un regroupement refait');
{
  const T0 = 1.7e12, flux = [];
  for (let i = 0; i < 6000; i++) flux.push({ a: 50000 + i, p: (86000 + 40 * Math.sin(i / 300) + rnd() * 9).toFixed(2), q: (rnd() * rnd() * 3).toFixed(5), T: T0 + i * 230, m: rnd() < 0.5 });
  const neuf = n => { const e = new BM.SeauxExecutions(1); for (const t of flux.slice(0, n)) e.ajouter(t); return e; };
  const cle = r => r.map(b => [b.T, b.P, b.ta, b.tb, b.pa, b.pb, b.achat, b.vente, b.t].join(',')).sort().join('|');
  const vues = [[T0, T0 + 6000 * 230, 30000, 5], [T0 + 333e3, T0 + 777e3, 5000, 2], [T0 + 1e6, T0 + 1.2e6, 120000, 10]];
  const ex = new BM.SeauxExecutions(1);
  let egal = true, profils = true, ouverte = true;
  for (let n = 0; n < flux.length; n += 397) {
    for (const t of flux.slice(n, n + 397)) ex.ajouter(t);
    const m = Math.min(flux.length, n + 397), ref = neuf(m);
    for (const [ta, tb, pt, pp] of vues) if (cle(ex.regrouper(ta, tb, pt, pp)) !== cle(ref.regrouper(ta, tb, pt, pp))) egal = false;
    const p1 = ex.profil(T0 + 7777, T0 + m * 230, 5), p2 = new Map();
    for (const s of ref.secondes(T0 + 7777, T0 + m * 230)) for (const [pb, v] of ref.seaux.get(s)) { const k = Math.floor(pb / 5), e = p2.get(k) || [0, 0]; e[0] += v[0]; e[1] += v[1]; p2.set(k, e); }
    for (const [k, v] of p2) { const w = p1.get(k); if (!w || Math.abs(w[0] - v[0]) > 1e-9 || Math.abs(w[1] - v[1]) > 1e-9) profils = false; }
    if (p1.size !== p2.size) profils = false;
    // La dernière seconde (encore ouverte) est comptée : le dernier seau contient la dernière exécution.
    const der = flux[m - 1], r = ex.regrouper(der.T, der.T + 1, 1000, 1);
    if (!r.some(b => b.ta <= der.T && der.T < b.tb && b.pa <= +der.p && +der.p < b.pb)) ouverte = false;
  }
  check('regroupements gardés = regroupements refaits, au bit près (3 vues, 16 étapes de flux)', egal);
  check('profil par prix (minutes gardées + secondes de bord) = profil refait seconde par seconde', profils);
  check('la seconde ouverte (encore en cours) est comptée, sans être figée dans le pli', ouverte);
  // Purge au milieu d'un seau : le seau coupé est refait de ses secondes restantes.
  const lim = T0 + 3001 * 230 + 7000;
  ex.purger(lim);
  const ref = neuf(flux.length); ref.purger(lim);
  check('purge au milieu d\'un seau : identique à un regroupement refait après la même purge', vues.every(([ta, tb, pt, pp]) => cle(ex.regrouper(ta, tb, pt, pp)) === cle(ref.regrouper(ta, tb, pt, pp))));
  // Remplissage arrière : une seconde déjà versée change → les plis sont refaits, rien n'est perdu.
  // (Référence : les MÊMES exécutions versées dans le même ordre, sans regroupement intermédiaire.)
  const arriere = avant => {
    const e = new BM.SeauxExecutions(1), vus = new Set();
    for (const t of flux.slice(3000)) { e.ajouter(t); vus.add(t.a); }
    if (avant) e.regrouper(T0, T0 + 6000 * 230, 30000, 5);
    for (const t of flux.slice(0, 3000).reverse()) e.ajouterAncien(t, vus);
    return e.regrouper(T0, T0 + 6000 * 230, 30000, 5);
  };
  check('remplissage arrière après un regroupement : rien de perdu ni de compté deux fois', cle(arriere(true)) === cle(arriere(false)));
  // Les dents : une exécution de plus ne verse que la seconde close, pas tout l'historique.
  const e3 = neuf(flux.length);
  e3.regrouper(T0, T0 + 6000 * 230, 30000, 5);
  let verses = 0;
  const plier = e3.plier;
  e3.plier = function (...x) { verses++; return plier.apply(this, x); };
  const d = flux[flux.length - 1];
  e3.ajouter({ a: d.a + 1, p: d.p, q: '1', T: d.T + 2000, m: false });
  e3.regrouper(T0, T0 + 6000 * 230 + 3000, 30000, 5);
  check(`une exécution de plus : ${verses} seconde(s) versée(s) — pas les ${e3.seaux.size} secondes de l'historique`, verses > 0 && verses <= 3, verses);
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

// ── 7d. Mémoire du carnet : seuil exact, comptes, sommes préfixes ─────────────
titre('7d. Mémoire du carnet : seuil EXACT en BTC, comptes par rangée, fenêtres');
{
  const enc = { ref_btc: 100, plafond: 255 };
  const s10 = BM.seuilPresence(10, enc);
  check('X = 10 BTC → intensité ≥ 81, soit ≥ 10,09 BTC (le cran publié, pas X)', s10.vS === 81 && BM.nombre(s10.qS, 2, 2) === '10,09', s10);
  check('sans encodage publié : aucun seuil (null), rien d\'inventé', BM.seuilPresence(10, null) === null && BM.seuilPresence(10, {}) === null);
  check('seuils bornés au cran 1 et au plafond', BM.seuilPresence(1e-9, enc).vS === 1 && BM.seuilPresence(1e6, enc).vS === 255);
  // Pour CHAQUE cran et autour de chaque frontière : intensite(q) ≥ vS ⇔ q ≥ qS, au double près.
  let faux = [];
  for (const e of [enc, { ref_btc: 37.5, plafond: 255 }, { ref_btc: 100, plafond: 100 }]) {
    for (let v = 1; v <= e.plafond; v++) {
      const X = e.ref_btc * (v / e.plafond) ** 2 * (0.9999 + 0.0002 * rnd());
      const s = BM.seuilPresence(X, e);
      if (!s) { faux.push(['null', v]); continue; }
      const qs = [s.qS, s.qS * (1 + 1e-15), s.qS * (1 - 1e-15), s.qS * (1 + 1e-9 * rnd()), s.qS * (1 - 1e-9 * rnd()), s.qS * (0.98 + 0.04 * rnd())];
      let F = new Float64Array(1), I = new BigInt64Array(F.buffer);
      F[0] = s.qS; I[0] -= 1n; qs.push(F[0]); F[0] = s.qS; I[0] += 1n; qs.push(F[0]);
      for (const q of qs) if ((BM.intensite(q, e) >= s.vS) !== (q >= s.qS)) faux.push([e.ref_btc, v, q, s]);
    }
  }
  check('intensité ≥ vS ⇔ q ≥ qS (tous les crans, frontières au double près, trois encodages)', !faux.length, faux.slice(0, 3));

  // Grille fixe : 5 colonnes, rangées 100..105 ; colonne 2 non observée ; colonne 4 : bande 102..103.
  const G = BM.grilleVide(0, 60e3, 5, 20, 100, 6), H = 6, set = (t, c, pb, v) => { G[t][c * H + pb - 100] = v; };
  for (const c of [0, 1, 3]) { G.bas[c] = 100; G.haut[c] = 105; }
  G.bas[4] = 102; G.haut[4] = 103;
  set('bids', 0, 101, 90); set('bids', 1, 101, 81); set('bids', 3, 101, 80); set('asks', 3, 101, 200);
  set('asks', 0, 104, 81); set('asks', 1, 104, 81); set('asks', 3, 104, 81);
  set('bids', 4, 103, 255); set('asks', 4, 103, 100);
  set('bids', 4, 104, 255);         // hors de la bande de sa colonne (incohérent) : ni observé, ni présent
  const pr = BM.presence(G, 81), f = (pb, a, b) => BM.presenceFenetre(pr, pb, a, b);
  check('rangée 101 : 3 minutes observées sur 4 colonnes (2 non observée, 4 hors bande), 3 présentes, bid 2 / ask 1',
    JSON.stringify(f(101, 0, 4)) === JSON.stringify({ obs: 3, pres: 3, presB: 2, presA: 1 }), f(101, 0, 4));
  check('rangée 103 : 4 observées (bande étroite de la colonne 4 comprise), 1 présente des deux côtés',
    JSON.stringify(f(103, 0, 4)) === JSON.stringify({ obs: 4, pres: 1, presB: 1, presA: 1 }), f(103, 0, 4));
  check('rangée 104 : la colonne 4 ne la couvre pas → 3 observées, 3 présentes (ask)', JSON.stringify(f(104, 0, 4)) === JSON.stringify({ obs: 3, pres: 3, presB: 0, presA: 3 }), f(104, 0, 4));
  check('fenêtre [1, 3] de la rangée 101 : 2 observées, 2 présentes', f(101, 1, 3).obs === 2 && f(101, 1, 3).pres === 2);
  check('rangée hors grille : rien', f(99, 0, 4).obs === 0 && f(200, 0, 4).obs === 0);
  const lp = BM.plusLonguePresence(G, 81, 101, 0, 4);
  check('plus longue présence (rangée 101) : 2 colonnes (0–1) — la colonne non observée COUPE la série', lp.n === 2 && lp.c === 0, lp);
  check('plus longue présence (rangée 104) : 2 — coupée par la colonne non observée', BM.plusLonguePresence(G, 81, 104, 0, 4).n === 2);
  const br = BM.barrePresence(pr, 101, 104, 0, 4, 1);
  check('un pixel sur plusieurs rangées : la PLUS GRANDE part (rangée 101 ou 104, 100 %)', br && br.part === 1, br);
  const brPeu = BM.barrePresence(pr, 101, 104, 0, 4, 30);
  check('rangées observées moins que le minimum : barre marquée « peu observée »', brPeu && brPeu.peu === true);

  // Sommes préfixes = comptage brut, sur des grilles aléatoires et des fenêtres aléatoires.
  let ecarts = 0, essais = 0;
  for (let k = 0; k < 20; k++) {
    const W = 5 + Math.floor(rnd() * 60), Hh = 3 + Math.floor(rnd() * 30), g2 = BM.grilleVide(0, 60e3, W, 20, 500, Hh), vS = 1 + Math.floor(rnd() * 200);
    for (let c = 0; c < W; c++) {
      if (rnd() < 0.15) continue;
      const a = 500 + Math.floor(rnd() * Hh), b = 500 + Math.floor(rnd() * Hh);
      g2.bas[c] = Math.min(a, b); g2.haut[c] = Math.max(a, b);
      for (let r = 0; r < Hh; r++) { g2.bids[c * Hh + r] = Math.floor(rnd() * 256); g2.asks[c * Hh + r] = rnd() < 0.5 ? 0 : Math.floor(rnd() * 256); }
    }
    const p2 = BM.presence(g2, vS);
    for (let e = 0; e < 30; e++) {
      const c0 = Math.floor(rnd() * W), c1 = c0 + Math.floor(rnd() * (W - c0)), pb = 500 + Math.floor(rnd() * Hh), r = pb - 500;
      const brut = { obs: 0, pres: 0, presB: 0, presA: 0 };
      for (let c = c0; c <= c1; c++) {
        if (!(g2.bas[c] >= 0 && g2.bas[c] <= pb && pb <= g2.haut[c])) continue;
        brut.obs++;
        const b = g2.bids[c * Hh + r] >= vS, a = g2.asks[c * Hh + r] >= vS;
        if (a || b) brut.pres++; if (b) brut.presB++; if (a) brut.presA++;
      }
      essais++;
      if (JSON.stringify(brut) !== JSON.stringify(BM.presenceFenetre(p2, pb, c0, c1))) ecarts++;
    }
  }
  check(`sommes préfixes = comptage brut (${essais} fenêtres, 20 grilles aléatoires)`, ecarts === 0, ecarts);
  // La présence se lit sur la grille BRUTE : la fusion (réglage) n'y touche pas.
  const avant = JSON.stringify([...BM.presence(G, 81).pres]);
  for (const kt of [1, 5, 15, 60]) for (const kp of [1, 2, 5, 10]) BM.fusionMax(G, kt, kp);
  check('fusionner la grille (tout réglage) ne change pas la présence calculée', JSON.stringify([...BM.presence(G, 81).pres]) === avant);
}

// ── 7e. Rafales au marché ────────────────────────────────────────────────────
titre('7e. Rafales : même ms, même côté, identifiants consécutifs ; borne basse d\'ordres PROUVÉE');
{
  const tr = (a, T, p, q, m) => ({ a, T, p: String(p), q: String(q), m: !!m });
  // 1. Balayage acheteur de 45 prix croissants : une rafale, ≥ 1 ordre, 45 prix.
  const balai = Array.from({ length: 45 }, (_, i) => tr(1000 + i, 5000, 80000 + i * 0.5, '0.10000000', false));
  const R1 = BM.grouperRafales(balai).map(BM.lireRafale);
  check('45 exécutions à prix croissants (achat) : 1 rafale, ≥ 1 ordre, 45 prix, séquence = tout', R1.length === 1 && R1[0].ordresMin === 1 && R1[0].nPrix === 45 && R1[0].n === 45 && Math.abs(R1[0].plusLongueSequence - 4.5) < 1e-12, R1[0]);
  check('côté : m = false → achat ; pMin / pMax / vwap', R1[0].achat === true && R1[0].pMin === 80000 && R1[0].pMax === 80022 && Math.abs(R1[0].vwap - 80011) < 1e-6);
  // 2. Prix répété, prix qui recule.
  const rep = BM.lireRafale(BM.grouperRafales([tr(1, 9, 100, 1), tr(2, 9, 101, 1), tr(3, 9, 101, 2), tr(4, 9, 102, 1)])[0]);
  check('prix répété (achat) : ≥ 2 ordres, 3 prix, plus longue séquence 3 BTC (101 → 102 après la reprise)', rep.ordresMin === 2 && rep.nPrix === 3 && rep.repetes === 1 && rep.reculs === 0 && rep.plusLongueSequence === 3, rep);
  const rec = BM.lireRafale(BM.grouperRafales([tr(1, 9, 100, 1, true), tr(2, 9, 99, 1, true), tr(3, 9, 99.5, 1, true)])[0]);
  check('prix qui revient en arrière (vente) : ≥ 2 ordres', rec.ordresMin === 2 && rec.reculs === 1 && rec.achat === false, rec);
  const desc = BM.lireRafale(BM.grouperRafales([tr(1, 9, 100, 1), tr(2, 9, 99, 1), tr(3, 9, 98, 1)])[0]);
  check('achat à prix décroissants : chaque pas prouve un ordre de plus (≥ 3)', desc.ordresMin === 3, desc);
  // 3. Côtés entrelacés dans la même milliseconde.
  const ent = BM.grouperRafales([tr(1, 9, 100, 1), tr(2, 9, 100, 1, true), tr(3, 9, 101, 1)]);
  check('côtés entrelacés dans la même ms : 3 rafales', ent.length === 3);
  // 4. Identifiants non consécutifs, ou ms différente.
  check('identifiants non consécutifs : coupé', BM.grouperRafales([tr(1, 9, 100, 1), tr(3, 9, 101, 1)]).length === 2);
  check('milliseconde différente : coupé', BM.grouperRafales([tr(1, 9, 100, 1), tr(2, 10, 101, 1)]).length === 2);
  // 5. Limite de page du remplissage arrière : la rafale coupée est recousue, à l'identique.
  const fx = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'aggtrades-300.json'), 'utf8')).trades;
  const ref = BM.grouperRafales(fx).map(BM.lireRafale);
  const multiples = ref.filter(r => r.n > 1);
  check(`fixture (300 exécutions réelles) : ${ref.length} rafales, dont ${multiples.length} de plusieurs exécutions`, ref.length < 300 && multiples.length >= 5, ref.length);
  // Une coupure EN PLEIN milieu de la plus grosse rafale de plusieurs exécutions.
  const grosse = multiples.slice().sort((a, b) => b.n - a.n)[0], iCoupe = fx.findIndex(t => t.a === grosse.aDeb) + 1;
  const serie = (rs, coupes, avantDirect) => {
    const R = new BM.Rafales(0);
    const fin = coupes[coupes.length - 1];
    for (const t of fx.slice(fin)) R.ajouter(t);                     // le direct : la fin
    for (let k = coupes.length - 1; k >= 0; k--) R.ajouterAncien(fx.slice(k ? coupes[k - 1] : 0, coupes[k]));
    R.finArriere();
    return R.liste.map(BM.lireRafale);
  };
  const neutre = r => JSON.stringify(r, (k, v) => (k === 'quote' || k === 'vwap' ? Math.round(v * 1e6) : v));
  const recousu = serie(fx, [iCoupe]);
  check(`page coupée DANS une rafale (${grosse.n} exécutions) : recousue, rafales identiques au groupement d'un seul tenant`,
    recousu.length === ref.length && recousu.every((r, i) => neutre(r) === neutre(ref[i])), [recousu.length, ref.length]);
  const pages = [7, 50, 51, 120, iCoupe, 200, 260].sort((a, b) => a - b);
  const multi = serie(fx, pages);
  check('sept pages arrière + direct : mêmes rafales', multi.length === ref.length && multi.every((r, i) => neutre(r) === neutre(ref[i])), [multi.length, ref.length]);
  // Coupure au milieu d'une séquence qui avance : borne et séquences recousues exactement.
  const av = [tr(1, 9, 100, 1), tr(2, 9, 101, 1), tr(3, 9, 102, 1), tr(4, 9, 102, 1), tr(5, 9, 103, 1)];
  const coupes = [];
  for (let c = 1; c < 5; c++) {
    const R = new BM.Rafales(0); for (const t of av.slice(c)) R.ajouter(t); R.ajouterAncien(av.slice(0, c)); R.finArriere();
    const r = BM.lireRafale(R.liste[0]);
    if (!(R.liste.length === 1 && r.ordresMin === 2 && r.plusLongueSequence === 3 && r.nPrix === 4)) coupes.push([c, R.liste.length, r]);
  }
  check('coupures 1 à 4 d\'une rafale à prix répété : ≥ 2 ordres, séquence 3 BTC, 4 prix, à chaque fois', !coupes.length, coupes);
  // 6. Conservation EXACTE du volume (entiers de 1e-8 BTC), garde à 0.
  const R0 = new BM.Rafales(0); for (const t of fx) R0.ajouter(t);
  const sT = fx.reduce((s, t) => s + Math.round(+t.q * 1e8), 0), sR = R0.liste.reduce((s, r) => s + r.q8, 0), sG = BM.grouperRafales(fx).reduce((s, r) => s + r.q8, 0);
  check('Σ rafales = Σ exécutions, au 1e-8 BTC près (direct et groupement)', sT === sR && sT === sG, [sT, sR, sG]);
  // Garde : une rafale CLOSE sous 0,5 BTC s'en va, un bord ouvert reste.
  const Rg = new BM.Rafales(); for (const t of fx) Rg.ajouter(t);
  Rg.finArriere();
  check('garde 0,5 BTC : seules les rafales closes ≥ 0,5 BTC restent (et le bord ouvert)', Rg.liste.slice(0, -1).every(r => r.q8 >= 0.5e8 && r.prix === null), Rg.liste.length);
  check('liste des 20 dernières ≥ seuil, la plus récente d\'abord', (() => { const d = R0.dernieres(20, 0); return d.length === 20 && d[0] === R0.liste[R0.liste.length - 1] && d.every((r, i) => !i || r.aDeb < d[i - 1].aDeb); })());
  const Rp = new BM.Rafales(0); for (const t of fx) Rp.ajouter(t);
  Rp.purger(fx[150].T);
  check('purge : plus rien avant la limite', Rp.liste.every(r => r.T >= fx[150].T));
  check('libellé de la borne : jamais « un ordre de »', !/un ordre de/i.test(BM.TEXTE_RAFALES) && /≥ k est prouvé/.test(BM.TEXTE_RAFALES));
}

// ── 7f. Destin des murs ──────────────────────────────────────────────────────
titre('7f. Destin des murs : bornes mesurées entre deux lectures, attente des exécutions complètes');
{
  const M = BM.MURS, F = BM.FINS_MURS;
  const dep = (bids, asks, id) => ({ lastUpdateId: id, bids: bids.map(([p, q]) => [p.toFixed(2), String(q)]), asks: asks.map(([p, q]) => [p.toFixed(2), String(q)]) });
  const hz = { ecart: 0, u: 10 };          // N = ]110, 1990[ , W = [−10, 2110] pour les lectures [0, 100] et [2000, 2100]
  const tr = (a, T, p, q, m) => ({ a, T, p: p.toFixed(2), q: String(q), m });
  // Lecture 1 : bid 100,00 × 6 (suivi, seuil 5) ; lecture 2 selon le cas ; exécutions ; complètes.
  const cas = (bids2, trades, o) => {
    o = o || {};
    const S = new BM.SuiviMurs(5, 2000), log = [];
    S.surTransition = (e, Fn) => log.push({ e, F: Fn });
    S.execution(tr(1, -5000, 50, 0.1, true));                    // le début lu est bien avant
    S.lecture(dep([[100, 6], [99, 1]], [[101, 1]], 10), 0, 100, hz);
    for (const t of trades) S.execution(t);
    const res = S.lecture(dep(bids2, [[101, 1]], o.id2 || 11), o.s2 || 2000, (o.s2 || 2000) + 100, hz);
    if (!o.sansCompletes) { S.completes((o.s2 || 2000) + 100 + 20); S.avancer(hz, (o.s2 || 2000) + 200); }
    const n = S.niveaux.find(x => x.c === 10000 && x.cote === 'b');
    return { S, n, res, log, m: n && BM.SuiviMurs.prototype.marque(n) };
  };
  // 1. Les cinq marques.
  const r1 = cas([[99, 1]], []);
  check('✕ retiré : disparu, aucune exécution même dans W → borne = 6 BTC', r1.m === 'retire' && r1.S.total.retire === 6 && F[r1.m].s === '✕', [r1.m, r1.S.total]);
  const r2 = cas([[99, 1]], [tr(2, 1000, 100, 6, true)]);
  check('● échangé : X_N = 6 ≥ q₀ → rien de retiré', r2.m === 'echange' && r2.S.total.retire === 0 && r2.S.total.echange === 6, [r2.m, r2.S.total]);
  const r3 = cas([[99, 1]], [tr(2, 1000, 100, 2, true)]);
  check('◐ en partie : 0 < X_N = 2 < 6 → au moins 4 retirés', r3.m === 'partiel' && r3.S.total.retire === 4, [r3.m, r3.S.total]);
  const r4 = cas([[99, 1]], [tr(2, 50, 100, 2, true)]);
  check('? incertain : exécution dans W seulement (T = 50, avant la réception de la lecture 1) → 4 retirés, 2 incertains', r4.m === 'incertain' && r4.S.total.retire === 4 && r4.S.total.incertain === 2 && r4.S.total.echange === 0, [r4.m, r4.S.total]);
  const r5 = cas([[100, 7], [99, 1]], []);
  check('→ toujours là : taille suivie, rien de classé en fin', r5.m === 'la' && r5.n.q === 7 && r5.n.qMax === 7, [r5.m, r5.n]);
  check('fenêtres : N = ]r₁+off+u, s₂+off−u[, W = [s₁+off−u, r₂+off+u]', r1.log.length === 1 && r1.log[0].F.N[0] === 110 && r1.log[0].F.N[1] === 1990 && r1.log[0].F.W[0] === -10 && r1.log[0].F.W[1] === 2110, r1.log[0] && r1.log[0].F);
  // 2. Mauvais côté, prix voisin.
  const r6 = cas([[99, 1]], [tr(2, 1000, 100, 6, false)]);
  check('exécution du mauvais côté (acheteur au marché, m = false) ignorée pour un bid → ✕', r6.m === 'retire' && r6.S.total.retire === 6, [r6.m, r6.S.total]);
  const r7 = cas([[99, 1]], [tr(2, 1000, 100.01, 6, true), tr(3, 1000, 99.99, 6, true)]);
  check('exécutions à p ± 0,01 ignorées → ✕', r7.m === 'retire' && r7.S.total.retire === 6, [r7.m, r7.S.total]);
  // 3. Sortie de la bande.
  const r8 = cas([[100.5, 1]], [tr(2, 1000, 100, 6, true)]);
  check('sortie de la bande : plus bas bid de la lecture 2 au-dessus du prix → ni classé ni compté', r8.m === 'bande' && r8.S.total.retire === 0 && r8.S.total.echange === 0 && !r8.log.length, [r8.m, r8.S.total]);
  // 4. Lecture périmée.
  const r9 = cas([[99, 1]], [], { id2: 10 });
  check('lastUpdateId qui ne croît pas : lecture ignorée, niveau toujours suivi', r9.res === 'perimee' && r9.m === 'la' && !r9.S.attente.length && !r9.log.length, [r9.res, r9.m]);
  // 5. Trou de lecture.
  const r10 = cas([[99, 1]], [], { s2: 100 + 2 * 2000 + 1 });
  check('envoi j − réception i > 2 cadences : « interrompu », rien de compté', r10.res === 'interrompu' && r10.m === 'interrompu' && r10.S.total.retire === 0 && !r10.log.length, [r10.res, r10.m, r10.S.total]);
  const r10b = cas([[99, 1]], [], { s2: 100 + 2 * 2000 });
  check('… à 2 cadences tout juste : classé', r10b.m === 'retire', r10b.m);
  // 6. Attente des exécutions complètes.
  const r11 = cas([[99, 1]], [], { sansCompletes: true });
  check('sans exécutions complètes : en attente, rien de compté', r11.m === 'attente' && r11.S.total.retire === 0 && r11.S.attente.length === 1, [r11.m, r11.S.total]);
  r11.S.completes(2100 + 19); r11.S.avancer(hz, 2200);
  check('requête envoyée avant r₂ + 2u : toujours en attente', r11.m === 'attente' && BM.SuiviMurs.prototype.marque(r11.n) === 'attente');
  r11.S.execution(tr(2, 1500, 100, 6, true));     // arrivée tardive : sans l'attente, « ✕ 6 BTC retirés » aurait été FAUX
  r11.S.completes(2100 + 20); r11.S.avancer(hz, 2200);
  check('requête envoyée à r₂ + 2u : classé avec l\'exécution tardive → ● (et non ✕)', BM.SuiviMurs.prototype.marque(r11.n) === 'echange' && r11.S.total.retire === 0, [BM.SuiviMurs.prototype.marque(r11.n), r11.S.total]);
  const r12 = cas([[99, 1]], [], { sansCompletes: true });
  r12.S.avancer(hz, 2100 + M.attenteMaxMs - 1);
  const avant = BM.SuiviMurs.prototype.marque(r12.n);
  r12.S.avancer(hz, 2100 + M.attenteMaxMs + 1);
  check('attente de plus de ' + M.attenteMaxMs / 1000 + ' s : « interrompu »', avant === 'attente' && BM.SuiviMurs.prototype.marque(r12.n) === 'interrompu' && r12.S.total.retire === 0 && !r12.S.attente.length, [avant, r12.n.fin]);
  const r13 = cas([[99, 1]], [], { sansCompletes: true });
  r13.S.completes(1e9); r13.S.avancer({ ecart: 0, u: null }, 2200);
  check('horloge jamais mesurée : rien de classé', BM.SuiviMurs.prototype.marque(r13.n) === 'attente');
  // Exécution dans le recouvrement de deux W : incertaine, comptée UNE fois au total.
  {
    const S = new BM.SuiviMurs(5, 2000);
    S.execution(tr(1, -5000, 50, 0.1, true));
    S.lecture(dep([[100, 6], [99, 1]], [[101, 1]], 10), 0, 100, hz);
    S.execution(tr(2, 2050, 100, 1, true));      // dans W(1→2) et W(2→3), hors des deux N
    S.lecture(dep([[100, 5], [99, 1]], [[101, 1]], 11), 2000, 2100, hz);
    S.lecture(dep([[100, 5], [99, 1]], [[101, 1]], 12), 4000, 4100, hz);
    S.completes(5000); S.avancer(hz, 5000);
    check('exécution dans deux fenêtres larges : 1 BTC incertain au total (pas 2)', S.total.incertain === 1 && S.total.retire === 0, S.total);
  }
  // Exécutions d'avant le début lu : non classé.
  {
    const S = new BM.SuiviMurs(5, 2000);
    S.execution(tr(1, 500, 50, 0.1, true));      // première exécution lue après le début de W
    S.lecture(dep([[100, 6], [99, 1]], [[101, 1]], 10), 0, 100, hz);
    S.lecture(dep([[99, 1]], [[101, 1]], 11), 2000, 2100, hz);
    S.completes(5000); S.avancer(hz, 5000);
    check('fenêtre qui commence avant la première exécution lue : « interrompu »', S.niveaux[0].fin === 'interrompu' && S.total.retire === 0, S.niveaux[0].fin);
  }

  // 7. PROPRIÉTÉ DE SOLIDITÉ : un flux simulé d'ajouts, d'annulations (totales ou partielles) et
  // d'exécutions horodatées ; des lectures prises à un instant au hasard DANS [s, r] (heure du
  // serveur = locale + écart vrai, que l'horloge ne connaît qu'à ± u près), des instantanés qui
  // coupent une milliseconde au hasard. Sur CHAQUE transition classée :
  //   retireMin ≤ annulations réelles   et   X_N ≤ échangé réel ≤ X_W.
  const simuler = (graine, seuils) => {
    seed = graine;
    const off = Math.round((rnd() - 0.5) * 6000), H = new BM.Horloge();
    for (let k = 0; k < 4; k++) { const s = k * 1000, rtt = 2 + rnd() * 400, r = s + rtt; H.echantillon(s, r, s + rnd() * rtt + off); }
    const S = new BM.SuiviMurs(seuils || 1, 2000), journal = [];
    S.surTransition = (e, Fn, p) => journal.push({ e, p });
    const C0 = 1000000, livre = new Map(), ev = [];
    let T = 4000 + off, a = 0;
    const cle = (cote, c) => cote + c;
    for (let k = 0; k < 4000; k++) {
      T += Math.floor(rnd() * rnd() * 40);         // souvent la même milliseconde
      const cote = rnd() < 0.5 ? 'b' : 'a', c = cote === 'b' ? C0 - 1 - Math.floor(rnd() * 12) : C0 + Math.floor(rnd() * 12), q = livre.get(cle(cote, c)) || 0, x = rnd();
      if (x < 0.45 || q === 0) { const d = 1 + Math.floor(rnd() * (rnd() < 0.2 ? 9000 : 2500)); livre.set(cle(cote, c), q + d); ev.push({ T, k: 'aj', cote, c, q: d }); }
      else if (x < 0.75) { const d = rnd() < 0.4 ? q : 1 + Math.floor(rnd() * q); livre.set(cle(cote, c), q - d); ev.push({ T, k: 'an', cote, c, q: d }); }
      else { const d = 1 + Math.floor(rnd() * Math.min(q, 3000)); livre.set(cle(cote, c), q - d); ev.push({ T, k: 'ex', cote, c, q: d, a: ++a }); }
    }
    // Lectures : envoi à pas ~2 s (+ dérive), réception après 2 à 900 ms ; instantané à un instant
    // entier de [s + off, r + off], qui coupe la milliseconde au hasard.
    const coupes = new Map(), etat = new Map(), qty = x => (x / 1000).toFixed(3);
    let iEv = 0, iEx = 0, s = 5000, id = 0;
    const exec = ev.filter(e => e.k === 'ex');
    while (s + off < T - 2000) {
      const r = s + 2 + rnd() * 900, t0 = Math.ceil(s + off), t1 = Math.floor(r + off);
      if (t1 < t0) { s += 2000; continue; }
      const t = t0 + Math.floor(rnd() * (t1 - t0 + 1));
      while (iEv < ev.length && ev[iEv].T < t) { const e = ev[iEv++]; etat.set(cle(e.cote, e.c), (etat.get(cle(e.cote, e.c)) || 0) + (e.k === 'aj' ? e.q : -e.q)); }
      while (iEv < ev.length && ev[iEv].T === t && rnd() < 0.5) { const e = ev[iEv++]; etat.set(cle(e.cote, e.c), (etat.get(cle(e.cote, e.c)) || 0) + (e.k === 'aj' ? e.q : -e.q)); }
      if (iEv > id) {
        id = iEv;
        const bids = [], asks = [];
        for (const [k, v] of etat) if (v > 0) (k[0] === 'b' ? bids : asks).push([(+k.slice(1) / 100).toFixed(2), qty(v)]);
        bids.sort((x, y) => y[0] - x[0]); asks.sort((x, y) => x[0] - y[0]);
        if (S.lecture({ lastUpdateId: id, bids, asks }, s, r, H) !== 'perimee') coupes.set(s, iEv);
      }
      // Une requête d'exécutions envoyée après la réception, servie à l'heure du serveur ≥ envoi.
      const sc = r + rnd() * 1500, ts = sc + off + rnd() * 200;
      while (iEx < exec.length && exec[iEx].T <= ts) { const e = exec[iEx++]; S.execution({ a: e.a, T: e.T, p: (e.c / 100).toFixed(2), q: qty(e.q), m: e.cote === 'b' }); }
      S.completes(sc); S.avancer(H, sc);
      s += 1700 + rnd() * 600;
    }
    // Vérité de chaque transition classée.
    const fautes = [];
    let naif = 0;
    for (const { e, p } of journal) {
      const i0 = coupes.get(p.s), i1 = coupes.get(p.sj);
      let an = 0, ex = 0;
      for (let i = i0; i < i1; i++) { const x = ev[i]; if (x.cote !== e.cote || x.c !== e.c) continue; if (x.k === 'an') an += x.q; if (x.k === 'ex') ex += x.q; }
      an /= 1000; ex /= 1000;
      if (!(e.retireMin <= an + 1e-9) || !(e.xN <= ex + 1e-9) || !(ex <= e.xW + 1e-9)) fautes.push({ e, an, ex });
      if (e.q0 - e.q1 - e.xN > an + 1e-9) naif++;       // Δ − X_N : la borne « naïve » n'en est pas une
    }
    return { n: journal.length, fautes, naif, retire: S.total.retire, totaux: S.totaux, niveaux: S.seuils.map((x, k) => S.niveaux.filter(v => v.t0s[k] !== null).length), u: H.u, fins: S.niveaux.reduce((o, x) => (o[x.fin] = (o[x.fin] || 0) + 1, o), {}) };
  };
  let n = 0, naif = 0, retire = 0;
  const fautes = [], fins = {};
  for (let g = 1; g <= 60; g++) {
    const r = simuler(1000 + g * 7919);
    n += r.n; naif += r.naif; retire += r.retire; fautes.push(...r.fautes.slice(0, 2));
    for (const k in r.fins) fins[k] = (fins[k] || 0) + r.fins[k];
  }
  check(`solidité : ${n} transitions simulées (60 flux), retireMin ≤ annulé et X_N ≤ échangé ≤ X_W à chaque fois`, n > 10000 && !fautes.length, fautes.slice(0, 2));
  check(`la propriété a des dents : Δ − X_N dépasse l'annulé réel ${naif} fois ; borne totale mesurée ${BM.nombre(retire, 0, 0)} BTC`, naif > 0 && retire > 0, naif);
  // Le réglage du seuil ne change aucune valeur : un suivi à plusieurs seuils compte, pour chacun,
  // exactement ce qu'un suivi à ce seuil seul compterait (même flux).
  {
    const ecarts = [], SE = [1, 2.5, 5];
    for (let g = 1; g <= 12; g++) {
      const multi = simuler(500 + g * 104729, SE);
      SE.forEach((x, k) => {
        const seul = simuler(500 + g * 104729, x), a = multi.totaux[k], b = seul.totaux[0];
        if (['retire', 'echange', 'incertain'].some(c => Math.abs(a[c] - b[c]) > 1e-6) || multi.niveaux[k] !== seul.niveaux[0]) ecarts.push({ g, x, a, b, n: [multi.niveaux[k], seul.niveaux[0]] });
      });
    }
    check('seuils 1 / 2,5 / 5 BTC suivis ensemble = chacun suivi seul (totaux et niveaux, 12 flux)', !ecarts.length, ecarts.slice(0, 2));
  }
  check('toutes les marques de fin apparaissent dans la simulation', ['retire', 'echange', 'partiel', 'incertain', 'bande'].every(k => fins[k] > 0), fins);

  // Textes : décrire, jamais accuser ni conseiller.
  const pub = ['bookmap.html', 'js/bookmap.js', 'js/bookmap-calc.js', 'css/bookmap.css'].map(f => [f, fs.readFileSync(path.join(REPO, f), 'utf8')]);
  const ACCUSE = /spoof|manipul|leurre|tromper|tromperie|faux (?:mur|ordre)s?|fake|bluff|pi[eè]ge/i;
  const CONSEIL = /\b(achetez|vendez|il faut (?:acheter|vendre)|entrez|sortez|prenez position|signal d['’]achat|signal de vente|recommand(?:e|ons))/i;
  check('carte : aucun mot d\'intention ni d\'accusation (« spoof »…) dans les fichiers publiés', pub.every(([, t]) => !ACCUSE.test(t)), pub.filter(([, t]) => ACCUSE.test(t)).map(([f, t]) => f + ' : ' + t.match(ACCUSE)[0]));
  check('carte : aucun conseil', pub.every(([, t]) => !CONSEIL.test(t)), pub.filter(([, t]) => CONSEIL.test(t)).map(([f, t]) => f + ' : ' + t.match(CONSEIL)[0]));
  const textes = Object.values(F).map(f => f.t + ' ' + f.d).join(' ') + BM.TEXTE_MURS;
  check('marques et limite tirées du code : nettes, invisible entre deux lectures', /NETTES/.test(BM.TEXTE_MURS) && /invisible/.test(BM.TEXTE_MURS) && !ACCUSE.test(textes));
}

// ── 7g. Mode débutant : convention de tendance ───────────────────────────────
titre('7g. Mode débutant : la convention du « sens du prix » vient des constantes');
{
  const GD = BM.GUIDE, src = fs.readFileSync(path.join(REPO, 'js/bookmap.js'), 'utf8');
  check(`fenêtre de tendance (${GD.tendanceMs / 60e3} min) et seuil « stable » (${GD.tendancePct} %) positifs`, GD.tendanceMs > 0 && GD.tendancePct > 0 && GD.tendanceMs % 60e3 === 0, [GD.tendanceMs, GD.tendancePct]);
  // La légende (Expert) qui dit la convention la tire des constantes : jamais un « 15 min » ou un « 0,1 % » écrit en dur.
  const l = src.split('\n').filter(x => /Mode débutant : une ligne, d\\'abord le sens du prix/.test(x));
  check('légende : la convention de tendance est tirée de BM.GUIDE (tendanceMs, tendancePct), rien en dur',
    l.length === 1 && /BM\.age\(GD\.tendanceMs\)/.test(l[0]) && /GD\.tendancePct/.test(l[0]) && !/15 min|0,1 %/.test(l[0]), l);
  // Le nombre de repères débutants : la constante que la légende écrit (« deux repères au plus ») est
  // celle qui borne le dessin (guideTextesDebutant), pas un chiffre recopié.
  const fn = (src.match(/function guideTextesDebutant\(\) \{[\s\S]*?\n  \}\n/) || [''])[0];
  check(`repères débutants : BM.GUIDE.textesDebutant = 2, et c'est lui qui borne guideTextesDebutant`, GD.textesDebutant === 2 && /G\.textesDebutant/.test(fn) && /GD\.textesDebutant/.test(src), fn.slice(0, 80));
  check('guideTextes (Expert) ne porte plus de branche débutante morte', !/function guideTextes\(\) \{[\s\S]*?textesDebutant[\s\S]*?\n  \}\n/.test((src.match(/function guideTextes\(\) \{[\s\S]*?\n  \}\n/) || [''])[0]));
  const T = BM.tendancePrix([{ t: 0, c: 100 }], null, 30e3, { tendanceMs: 0 });
  check('tendancePrix suit la constante passée (fenêtre de 0 : la minute en cours)', T && T.sens === 'stable', T);
}

// ── 8. Isolement : la carte ne touche pas au terminal ─────────────────────────
titre('8. Isolement : une page à côté, qui ne partage aucun code avec le terminal');
const html = fs.readFileSync(path.join(REPO, 'bookmap.html'), 'utf8');
const charges = [...html.matchAll(/\b(?:src|href)="([^"#]+)"/g)].map(m => m[1]).filter(u => !/^https?:/.test(u));
check('bookmap.html ne charge que ses fichiers (+ le repli Binance commun et le lien retour vers le terminal)',
  charges.every(u => ['css/bookmap.css', 'js/binance-repli.js', 'js/bookmap-calc.js', 'js/bookmap.js', 'index.html'].includes(u)), charges);
check('aucun script du terminal chargé', !/js\/app\.js/.test(html) && !/themes\//.test(html));
const index = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8');
check('le terminal ne charge aucun fichier de la carte', !/bookmap/.test(index.replace(/<a [^>]*href="bookmap\.html"[^>]*>/g, '')));

console.log(ko ? `\n❌ CARTE : ${ko} contrôle(s) en échec` : '\n✅ CARTE : TOUS LES CONTRÔLES PASSENT');
process.exit(ko ? 1 : 0);
