// La couche « Liquidité » du terminal (heatmap.json) : les DEUX formats publiés se lisent, et la
// page dessine EXACTEMENT ce qu'elle dessinait avant — hors ligne, sans navigateur.
//
// POURQUOI (07/10/2026). Le serveur passe au format « colonnes-1 » (heatmap.py : colonnes
// denses, minute absolue — 6,3 fois moins d'octets, des deltas git qui fonctionnent). C'est une
// LIVRAISON SERVEUR : tant que le cron du propriétaire ne l'a pas validée, le fichier publié
// reste à l'ancien format ; et après, une page restée en cache lit le nouveau. La page lit donc
// les deux. Dans le même temps, la couche se construit sur une GRILLE en tableaux typés au lieu
// d'une Map de 131 000 cellules (22,5 ms à 1 × 1 pour ne rien fusionner).
//
// CE QUI EST VÉRIFIÉ
//   1. heatmap.json du dépôt, converti ICI dans l'autre format (convertisseurs indépendants de
//      la page) : les deux donnent la MÊME grille (grilleChaleur, js/app.js), octet par octet ;
//      cas limites du nouveau format : côté vide (null, []), trou dans une série (0), minute
//      absente, colonne entièrement vide ;
//   2. la couche dessinée (fusion par MAX, seuil, cadrage, couleurs) est IDENTIQUE, pixel par
//      pixel, à celle de l'ancien chemin (cellules → fusionnerCellules → image, figé ci-dessous),
//      pour plusieurs fusions et seuils, sur les deux rampes ;
//   3. une relecture qui rend la MÊME publication n'est pas analysée : le corps est abandonné
//      après ses premiers octets (`updated`) ; une autre publication l'est entièrement ;
//   4. quand relire : pas avant updated + cadence + marge, puis à chaque tour ; au plus tard
//      toutes les relecture_max_min.
//
// USAGE   node tests/test_chaleur.js
const fs = require('fs'), path = require('path');
const { chargerPage } = require('./bac');
const REPO = path.resolve(__dirname, '..');

let ko = 0;
const check = (nom, ok, det) => { if (!ok) ko++; console.log(`  ${ok ? '✓' : '✗'} ${nom}${!ok && det !== undefined ? ' — ' + JSON.stringify(det).slice(0, 300) : ''}`); };
const titre = t => console.log(`\n── ${t} ──`);

const page = chargerPage({ globaux: { Uint8ClampedArray, ReadableStream, TextDecoder, TextEncoder } });
const T = page.T;

// ── Convertisseurs de RÉFÉRENCE (la disposition décrite par heatmap.py, écrite ici à part) ──
/** Ancien → colonnes-1 : minute absolue = t0/dt + c ; une série par côté, de la plus basse
 *  tranche à la plus haute, 0 dans les trous ; côté vide : null, []. */
function versColonnes(h) {
  const m0 = Math.round(h.t0 / h.dt), par = new Map();
  for (const [k, cells] of [[0, h.bids], [1, h.asks]]) for (const [c, pb, v] of cells) {
    const col = par.get(c) || par.set(c, [new Map(), new Map()]).get(c);
    col[k].set(pb, Math.max(col[k].get(pb) || 0, v));
  }
  const serie = m => { if (!m.size) return [null, []]; const ps = [...m.keys()]; const lo = Math.min(...ps), hi = Math.max(...ps);
    const v = []; for (let p = lo; p <= hi; p++) v.push(m.get(p) || 0); return [lo, v]; };
  const colonnes = [...par.keys()].sort((a, b) => a - b).map(c => [m0 + c, ...serie(par.get(c)[0]), ...serie(par.get(c)[1])]);
  const o = Object.assign({}, h, { format: 'colonnes-1', colonnes });
  delete o.bids; delete o.asks;
  return o;
}
/** colonnes-1 → ancien : une cellule par valeur non nulle, c compté depuis t0. */
function versCellules(h) {
  const m0 = Math.round(h.t0 / h.dt), bids = [], asks = [];
  for (const [m, bb, bv, ab, av] of h.colonnes) {
    if (bb !== null) bv.forEach((v, i) => { if (v) bids.push([m - m0, bb + i, v]); });
    if (ab !== null) av.forEach((v, i) => { if (v) asks.push([m - m0, ab + i, v]); });
  }
  const o = Object.assign({}, h, { bids, asks });
  delete o.format; delete o.colonnes; delete o.disposition;
  return o;
}

// ── L'ancien chemin de la page, figé (js/app.js et js/reglages.js avant le 07/10/2026) ──
function fusionnerCellules(cells, kt, kp, seuil) {
  kt = Math.max(1, kt | 0); kp = Math.max(1, kp | 0);
  const m = new Map();
  for (const [c, pb, v] of cells || []) {
    if (v < (seuil || 0)) continue;
    const C = Math.floor(c / kt), P = Math.floor(pb / kp), key = C * 1e6 + P;
    const o = m.get(key);
    if (o === undefined || v > o) m.set(key, v);
  }
  const out = [];
  for (const [key, v] of m) out.push([Math.floor(key / 1e6), key % 1e6, v]);
  return out;
}
function ancienneCouche(hm, kt, kp, seuil, palB, palA) {
  const bids = fusionnerCellules(hm.bids, kt, kp, seuil), asks = fusionnerCellules(hm.asks, kt, kp, seuil);
  let W = 0, P0 = Infinity, P1 = -Infinity;
  for (const side of [bids, asks]) for (const [C, P] of side) { if (C >= W) W = C + 1; if (P < P0) P0 = P; if (P > P1) P1 = P; }
  if (!W) return null;
  const H = P1 - P0 + 1, px = new Uint32Array(W * H), val = new Uint8Array(W * H);
  for (const [cells, pal] of [[bids, palB], [asks, palA]])
    for (const [C, P, v] of cells) { const i = (P1 - P) * W + C; if (v >= val[i]) { val[i] = v; px[i] = pal[v] || pal[255]; } }
  return { W, H, P1, dt: hm.dt * kt, dp: hm.dp * kp, px };
}
const nouvelleCouche = (h, kt, kp, seuil, palB, palA) => {
  const g = T.fusionnerGrille(T.grilleChaleur(h), kt, kp, seuil), p = g && T.pixelsChaleur(g, palB, palA);
  return p && { W: p.W, H: p.H, P1: p.P1, dt: g.dt, dp: g.dp, px: p.px };
};
const memeGrille = (a, b) => a && b && ['t0', 'dt', 'dp', 'W', 'H', 'pbMin'].every(k => a[k] === b[k])
  && ['bids', 'asks'].every(k => a[k].length === b[k].length && a[k].every((x, i) => x === b[k][i]));
const memeCouche = (a, b) => a && b && ['W', 'H', 'P1', 'dt', 'dp'].every(k => a[k] === b[k]) && a.px.length === b.px.length && a.px.every((x, i) => x === b.px[i]);
const resume = g => g && { t0: g.t0, W: g.W, H: g.H, pbMin: g.pbMin };

// ── 1. Les deux formats, la même grille ───────────────────────────────────────
titre('1. Ancien format et « colonnes-1 » : la même grille');
const publie = JSON.parse(fs.readFileSync(path.join(REPO, 'heatmap.json'), 'utf8'));
const estNouveau = Array.isArray(publie.colonnes);
const ancien = estNouveau ? versCellules(publie) : publie, nouveau = estNouveau ? publie : versColonnes(publie);
console.log(`  heatmap.json du dépôt : format ${estNouveau ? '« colonnes-1 »' : 'ancien (cellules)'} — ${ancien.bids.length + ancien.asks.length} cellules, ${nouveau.colonnes.length} colonnes ; l'autre format est construit ici`);
const gA = T.grilleChaleur(ancien), gN = T.grilleChaleur(nouveau);
check('grille identique, octet par octet (t0, dt, dp, W, H, tranche basse, bids, asks)', memeGrille(gA, gN), [resume(gA), resume(gN)]);
check('la grille porte la donnée : W ≥ 1 000 colonnes, au moins une tranche, des cellules des deux côtés',
  gA && gA.W >= 1000 && gA.H >= 1 && gA.bids.some(x => x) && gA.asks.some(x => x), resume(gA));
// Chaque cellule de l'ancien format se retrouve à sa place dans la grille.
let place = true;
for (const [cells, dest] of [[ancien.bids, gA.bids], [ancien.asks, gA.asks]]) for (const [c, pb, v] of cells) if (dest[c * gA.H + pb - gA.pbMin] !== v) { place = false; break; }
check('chaque cellule publiée est dans la grille, à sa colonne et à sa tranche', place);
// Cas limites du nouveau format.
const t0 = 1791205080, petit = { updated: 'x', sym: 'BTCUSDT', t0, dt: 60, dp: 20, format: 'colonnes-1', colonnes: [
  [t0 / 60, 4300, [5, 0, 7], null, []],                 // asks vides ; un trou dans les bids
  [t0 / 60 + 1, null, [], null, []],                    // colonne vide (observée, rien au-dessus du seuil)
  [t0 / 60 + 3, 4299, [9], 4301, [0, 255]],             // minute t0+2 absente ; zéro en tête d'une série
] };
const gP = T.grilleChaleur(petit), gPA = T.grilleChaleur(versCellules(petit));
const at = (g, c, pb, cote) => g[cote][c * g.H + pb - g.pbMin];
check('cas limites : côté vide, trou (0), minute absente, colonne vide, zéro en tête — même grille que l’ancien format',
  memeGrille(gP, gPA) && gP.W === 4 && gP.pbMin === 4299 && gP.H === 4 && at(gP, 0, 4300, 'bids') === 5 && at(gP, 0, 4301, 'bids') === 0
  && at(gP, 0, 4302, 'bids') === 7 && at(gP, 3, 4302, 'asks') === 255 && at(gP, 3, 4301, 'asks') === 0 && at(gP, 3, 4299, 'bids') === 9, resume(gP));
check('fichier sans cellule : pas de grille (la couche n’est pas dessinée, rien n’est inventé)',
  T.grilleChaleur({ t0, dt: 60, dp: 20, format: 'colonnes-1', colonnes: [] }) === null && T.grilleChaleur({ t0, dt: 60, dp: 20, bids: [], asks: [] }) === null);

// ── 2. La couche dessinée : identique à l'ancienne, pixel par pixel ─────────────
titre('2. La couche : celle d’avant, pixel par pixel');
const RAMPES = { 'rampe historique': [T.rampeU32(T.HEAT_RAMPE.bid.base, T.HEAT_RAMPE.bid.pente), T.rampeU32(T.HEAT_RAMPE.ask.base, T.HEAT_RAMPE.ask.pente)],
  'encre de thème': [T.rampeU32([0, 0, 128, 0.1], [0, 0, 0, 0.8]), T.rampeU32([200, 40, 0, 0.1], [0, 0, 0, 0.8])] };
for (const [nomR, [pb, pa]] of Object.entries(RAMPES)) {
  const ecarts = [];
  for (const [kt, kp, s] of [[1, 1, 1], [2, 1, 1], [1, 2, 1], [4, 4, 1], [16, 8, 1], [1, 1, 64], [5, 2, 32], [60, 10, 128], [1, 1, 255]]) {
    const a = ancienneCouche(ancien, kt, kp, s, pb, pa), n1 = nouvelleCouche(ancien, kt, kp, s, pb, pa), n2 = nouvelleCouche(nouveau, kt, kp, s, pb, pa);
    if (!memeCouche(a, n1) || !memeCouche(a, n2)) ecarts.push({ kt, kp, s, avant: a && [a.W, a.H, a.P1], ancienFmt: n1 && [n1.W, n1.H, n1.P1], nouveauFmt: n2 && [n2.W, n2.H, n2.P1] });
  }
  check(`${nomR} : 9 fusions × seuils, les deux formats → la couche d’avant (dimensions, tranche haute, pas, chaque pixel)`, !ecarts.length, ecarts);
}
// Bid et ask dans la même case : la plus forte intensité, l'ask à égalité (règle d'avant).
const croise = { t0, dt: 60, dp: 20, bids: [[0, 10, 50], [1, 10, 90], [2, 10, 70]], asks: [[0, 10, 50], [1, 10, 40], [2, 10, 80]] };
const [pb0, pa0] = RAMPES['rampe historique'];
const cr = nouvelleCouche(croise, 1, 1, 1, pb0, pa0);
check('même case bid / ask : la plus forte l’emporte, l’ask à égalité', cr && cr.px[0] === pa0[50] && cr.px[1] === pb0[90] && cr.px[2] === pa0[80]
  && memeCouche(cr, ancienneCouche(croise, 1, 1, 1, pb0, pa0)));
// Durées, pour information.
const chrono = (f, k = 7) => { const t = []; for (let i = 0; i < k; i++) { const a = process.hrtime.bigint(); f(); t.push(Number(process.hrtime.bigint() - a) / 1e6); } return t.sort((x, y) => x - y)[k >> 1]; };
console.log(`  (pour information, 1 × 1 : avant ${chrono(() => ancienneCouche(ancien, 1, 1, 1, pb0, pa0)).toFixed(1)} ms ; après ${chrono(() => nouvelleCouche(nouveau, 1, 1, 1, pb0, pa0)).toFixed(1)} ms, décodage du nouveau format compris)`);

// ── 3. Relecture de la même publication : pas d'analyse ─────────────────────────
titre('3. Même publication relue : le corps n’est ni décodé ni analysé');
const texte = JSON.stringify(nouveau), octets = new TextEncoder().encode(texte);
function reponse(morceau) {
  let lus = 0, annule = false;
  const r = { ok: true, status: 200, body: new ReadableStream({
    pull(c) { if (lus * morceau >= octets.length) return c.close(); c.enqueue(octets.slice(lus * morceau, (lus + 1) * morceau)); lus++; },
    cancel() { annule = true; } }) };
  return { r, etat: () => ({ lus, annule, total: Math.ceil(octets.length / morceau) }) };
}
(async () => {
  const meme = reponse(16384), o1 = await T.lireSiNouveau(meme.r, nouveau.updated), e1 = meme.etat();
  check(`même \`updated\` : null, ${e1.lus} morceau(x) lu(s) sur ${e1.total}, la suite abandonnée`, o1 === null && e1.annule && e1.lus <= 2 && e1.total > 10, e1);
  const autre = reponse(16384), o2 = await T.lireSiNouveau(autre.r, '2020-01-01T00:00:00+00:00'), e2 = autre.etat();
  check('autre publication : lue en entier et analysée (le même objet que le fichier)', o2 && o2.updated === nouveau.updated && o2.colonnes.length === nouveau.colonnes.length && e2.lus === e2.total);
  const coupe = reponse(7), o3 = await T.lireSiNouveau(coupe.r, nouveau.updated);
  check('`updated` à cheval sur plusieurs morceaux (7 octets) : reconnu quand même', o3 === null && coupe.etat().annule);
  const premiere = reponse(16384), o4 = await T.lireSiNouveau(premiere.r, null);
  check('première lecture (rien de connu) : analysée', o4 && o4.updated === nouveau.updated);
  const sansFlux = await T.lireSiNouveau({ text: async () => texte }, nouveau.updated);
  const sansFlux2 = await T.lireSiNouveau({ text: async () => texte }, 'autre');
  check('sans flux lisible (repli text()) : même règle', sansFlux === null && sansFlux2 && sansFlux2.updated === nouveau.updated);

  // ── 4. Quand relire ─────────────────────────────────────────────────────────
  titre('4. Quand relire un fichier publié');
  const C = T.CADENCES, maj = Date.parse('2026-10-07T12:00:00Z'), min = 60000;
  const due = (apres, derniere) => T.lectureDue(maj, maj + derniere * min, maj + apres * min);
  const attendu = C.attendue_min + C.marge_publication_s / 60;
  check(`rien d’attendu (${C.attendue_min - 5} min après la publication, relu il y a 1 min) : pas de lecture`, !due(C.attendue_min - 5, C.attendue_min - 6));
  check(`publication attendue (updated + ${C.attendue_min} min + ${C.marge_publication_s} s) : lecture, puis à chaque tour`, due(attendu, attendu - 1) && due(attendu + 1, attendu) && !due(attendu - 0.5, attendu - 1.5));
  check(`au plus tard toutes les ${C.relecture_max_min} min, même sans publication attendue`, due(C.relecture_max_min + 1, 0.9) && !due(C.relecture_max_min, 1));
  check('jamais lu, ou date inconnue : lecture', T.lectureDue(maj, 0, maj + min) && T.lectureDue(null, maj, maj + min));
  console.log(ko ? `\n❌ CHALEUR : ${ko} contrôle(s) en échec` : '\n✅ CHALEUR : DEUX FORMATS, LA MÊME COUCHE, AUCUNE RELECTURE INUTILE');
  process.exit(ko ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
