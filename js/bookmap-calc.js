/* ══════════════════════════════════════════════════════════════════════════════
   Saṃsāra — Carte (bookmap) : les CALCULS, sans DOM ni réseau.
   Chargé par bookmap.html avant js/bookmap.js ; chargé tel quel par tests/test_bookmap.js.

   CE QUE LA CARTE SUPERPOSE — trois horloges sur une même surface
   ────────────────────────────────────────────────────────────────
   · la carte PUBLIÉE (heatmap.json) : une colonne par minute, une tranche par 20 $, publiée
     toutes les 15 min — elle a donc jusqu'à ~16 min de retard sur le présent ;
   · les MURS et le GAMMA (market-data.json) : un instantané par quart d'heure ;
   · le carnet LIVE et les EXÉCUTIONS, lus par la page elle-même sur Binance, à la seconde.
   Chaque calque porte son âge SUR la carte : aucun chiffre n'y est lu sans son instant. L'axe du
   temps est à l'heure de BINANCE (BM.Horloge) ; chaque lecture est placée à son instant réel.
   Ce qui n'a pas été lu (minutes, exécutions, carnet) est « non lu » — hachuré et dit —, jamais
   « vide ».

   RÈGLES QUI NE SE DISCUTENT PAS (06/10/2026)
   · Une cellule publiée n'est PAS une quantité : c'est min(255, ent(255·√(q/ref))), q = le
     plus gros niveau de prix de la tranche — depuis le 08/10/2026, la SOMME de ses niveaux
     (`encodage.agregation_tranche`, et `agregation_depuis` pour les colonnes d'avant).
     Fusionner des tranches = prendre le MAX (la plus forte case) ; jamais la somme
     d'intensités. On peut fusionner, jamais affiner.
   · La référence `ref` se LIT dans heatmap.json (`encodage`) ; elle n'est jamais recopiée
     ici. Absente (fichier antérieur), la carte affiche des intensités, pas des BTC.
   · Hors de la bande que le carnet reçu couvre, c'est « non observé », pas « vide ».
   ══════════════════════════════════════════════════════════════════════════════ */
(function (racine) {
  'use strict';
  const BM = {};

  // ─── Grille : la structure commune à la carte publiée et au carnet live ──────
  // Colonne-majeure : la cellule (c, h) est à c·H + h. Une colonne est contiguë, ce qui
  // rend le regroupement dans le temps (plusieurs colonnes par pixel) linéaire.
  //   t0, dt   : début de la colonne 0 (ms) et largeur d'une colonne (ms)
  //   pbMin, H : indice ABSOLU de la tranche la plus basse (prix = indice × dp) et hauteur
  //   bids, asks : Uint8Array(W·H), intensité 0..255 (0 = rien de mesuré au-dessus du seuil)
  //   bas, haut  : Int32Array(W), bande observée de la colonne en indices absolus ; −1 = colonne
  //                non observée (aucun carnet lu dans cet intervalle)
  function grilleVide(t0, dt, W, dp, pbMin, H) {
    const bas = new Int32Array(W).fill(-1), haut = new Int32Array(W).fill(-1);
    return { t0, dt, W, dp, pbMin, H, bids: new Uint8Array(W * H), asks: new Uint8Array(W * H), bas, haut };
  }
  BM.grilleVide = grilleVide;

  /** heatmap.json -> grille. Deux formats, qui donnent la MÊME grille pour la même information
   *  (contrôlé case par case par tests/test_bookmap.js) :
   *   · « colonnes-1 » : colonnes = [[minute, bid_bas, [v…], ask_bas, [v…]], …], minute = ⌊t/dt⌋
   *     ABSOLUE ; v[i] = tranche bas+i ; côté vide = null, [] ; minute absente = non observée ;
   *   · l'ancien : bids / asks = [[c, pb, v], …], c relatif à t0.
   *  La page doit lire les deux : le format change côté serveur APRÈS la livraison des pages.
   *  La couverture de chaque colonne est DÉDUITE de ses cellules : de la plus basse cellule bid
   *  à la plus haute cellule ask (les niveaux sous le seuil d'affichage ne laissent pas de
   *  cellule ; la bande réelle est donc un peu plus large). */
  BM.FORMATS_HEATMAP = ['colonnes-1'];
  BM.grillePubliee = function (h) {
    if (!h) return null;
    if (Array.isArray(h.colonnes)) return grilleColonnes(h);
    const cells = [].concat(h.bids || [], h.asks || []);
    if (!cells.length) return null;
    let cMax = 0, pMin = Infinity, pMax = -Infinity;
    for (const [c, pb] of cells) { if (c > cMax) cMax = c; if (pb < pMin) pMin = pb; if (pb > pMax) pMax = pb; }
    const W = cMax + 1, H = pMax - pMin + 1;
    const g = grilleVide(h.t0 * 1000, h.dt * 1000, W, h.dp, pMin, H);
    const bmin = new Int32Array(W).fill(2147483647), amax = new Int32Array(W).fill(-1);
    for (const [c, pb, v] of h.bids || []) {
      const i = c * H + (pb - pMin);
      if (v > g.bids[i]) g.bids[i] = v;
      if (pb < bmin[c]) bmin[c] = pb;
      if (pb > amax[c]) amax[c] = pb;          // une colonne sans asks reste bornée par ses bids
    }
    for (const [c, pb, v] of h.asks || []) {
      const i = c * H + (pb - pMin);
      if (v > g.asks[i]) g.asks[i] = v;
      if (pb > amax[c]) amax[c] = pb;
      if (pb < bmin[c]) bmin[c] = pb;
    }
    for (let c = 0; c < W; c++) if (amax[c] >= 0) { g.bas[c] = bmin[c]; g.haut[c] = amax[c]; }
    g.encodage = h.encodage || null;
    g.majA = Date.parse(h.updated) || null;
    return g;
  };
  /** « colonnes-1 ». Un format annoncé mais inconnu n'est pas deviné : null (la page le dit). */
  function grilleColonnes(h) {
    if (h.format !== undefined && !BM.FORMATS_HEATMAP.includes(h.format)) return null;
    const cols = h.colonnes, n = x => (Array.isArray(x) ? x.length : 0);
    let pMin = Infinity, pMax = -Infinity, mFin = -Infinity;
    for (const [m, bl, bs, al, as] of cols) {
      const nb = n(bs), na = n(as);
      if (nb) { if (bl < pMin) pMin = bl; if (bl + nb - 1 > pMax) pMax = bl + nb - 1; }
      if (na) { if (al < pMin) pMin = al; if (al + na - 1 > pMax) pMax = al + na - 1; }
      if ((nb || na) && m > mFin) mFin = m;
    }
    if (!cols.length || mFin === -Infinity) return null;      // aucune cellule : comme l'ancien format
    // Le temps vient des minutes ABSOLUES des colonnes (t0 du fichier = la première).
    const m0 = cols[0][0], W = mFin - m0 + 1, H = pMax - pMin + 1, dt = h.dt * 1000;
    const g = grilleVide(m0 * dt, dt, W, h.dp, pMin, H);
    for (const [m, bl, bs, al, as] of cols) {
      const c = m - m0;
      if (c < 0 || c >= W) continue;
      const o = c * H, nb = n(bs), na = n(as);
      let lo = Infinity, hi = -Infinity;
      // MAX comme l'ancien décodeur (une cellule livrée deux fois ne s'additionne pas).
      for (let i = 0; i < nb; i++) { const k = o + bl - pMin + i; if (bs[i] > g.bids[k]) g.bids[k] = bs[i]; }
      for (let i = 0; i < na; i++) { const k = o + al - pMin + i; if (as[i] > g.asks[k]) g.asks[k] = as[i]; }
      if (nb) { lo = Math.min(lo, bl); hi = Math.max(hi, bl + nb - 1); }
      if (na) { lo = Math.min(lo, al); hi = Math.max(hi, al + na - 1); }
      if (hi > -Infinity) {
        if (g.bas[c] < 0 || lo < g.bas[c]) g.bas[c] = lo;
        if (hi > g.haut[c]) g.haut[c] = hi;
      }
    }
    g.encodage = h.encodage || null;
    g.majA = Date.parse(h.updated) || null;
    return g;
  }
  /** La date de publication lue au DÉBUT du texte, sans l'analyser en entier : "updated" est la
   *  première clé des deux fichiers publiés. null si elle n'y est pas (on analysera tout). */
  BM.majEnTete = function (txt) {
    const m = /^\s*\{\s*"updated"\s*:\s*"([^"]{1,64})"/.exec(String(txt).slice(0, 200));
    return m ? m[1] : null;
  };

  /** Fusion par MAX : kt colonnes × kp tranches -> une cellule. Exact (√ croissante).
   *  Les blocs sont ancrés sur le temps ABSOLU (⌊t / (kt·dt)⌋), comme les tranches le sont sur
   *  le prix (⌊pb / kp⌋) : un bloc « 1 h » va de hh:00 à hh+1:00, et le MAX d'une heure passée ne
   *  change pas quand la fenêtre de 24 h glisse d'une publication à l'autre.
   *  Chaque bloc porte son étendue RÉELLE [deb, fin[ : de la première à la dernière colonne
   *  OBSERVÉE qu'il contient. Le dernier bloc, incomplet, n'est donc jamais peint au-delà de la
   *  fin des données (ni dans le futur). */
  BM.fusionMax = function (g, kt, kp) {
    kt = Math.max(1, kt | 0); kp = Math.max(1, kp | 0);
    if (kt === 1 && kp === 1) return g;
    const P0 = Math.floor(g.pbMin / kp), P1 = Math.floor((g.pbMin + g.H - 1) / kp);
    const pas = g.dt * kt, K0 = Math.floor(g.t0 / pas), K1 = Math.floor((g.t0 + (g.W - 1) * g.dt) / pas);
    const W2 = K1 - K0 + 1, H2 = P1 - P0 + 1;
    const f = grilleVide(K0 * pas, pas, W2, g.dp * kp, P0, H2);
    f.deb = new Float64Array(W2); f.fin = new Float64Array(W2);
    for (let C = 0; C < W2; C++) f.deb[C] = f.fin[C] = (K0 + C) * pas;    // vide : aucune colonne observée
    for (let c = 0; c < g.W; c++) {
      const tc = g.t0 + c * g.dt, C = Math.floor(tc / pas) - K0, o = c * g.H, O = C * H2;
      for (let h = 0; h < g.H; h++) {
        const J = Math.floor((g.pbMin + h) / kp) - P0;
        const vb = g.bids[o + h], va = g.asks[o + h];
        if (vb > f.bids[O + J]) f.bids[O + J] = vb;
        if (va > f.asks[O + J]) f.asks[O + J] = va;
      }
      if (g.bas[c] >= 0) {
        const b = Math.floor(g.bas[c] / kp), t = Math.floor(g.haut[c] / kp);
        if (f.bas[C] < 0) { f.bas[C] = b; f.deb[C] = tc; } else if (b < f.bas[C]) f.bas[C] = b;
        if (t > f.haut[C]) f.haut[C] = t;
        f.fin[C] = tc + g.dt;
      }
    }
    f.encodage = g.encodage; f.majA = g.majA; f.fusion = { kt, kp };
    return f;
  };

  // ─── Où tombe un pixel : colonnes et tranches qu'il recouvre ────────────────
  /** Nombre de colonnes utiles : une grille live n'est remplie que jusqu'à `n`. */
  const nCol = g => (g.n !== undefined ? g.n : g.W);
  /** Étendue [début, fin[ de la colonne c. Grille régulière : [t0 + c·dt, t0 + (c+1)·dt[ ;
   *  sinon (fusion, carnet live) l'étendue RÉELLE, portée par la grille (deb / fin, triées). */
  BM.etendueColonne = function (g, c) {
    return g.deb ? [g.deb[c], g.fin[c]] : [g.t0 + c * g.dt, g.t0 + (c + 1) * g.dt];
  };
  /** Instant où s'arrêtent les données de la grille. */
  BM.finGrille = function (g) {
    const n = nCol(g);
    if (!n) return null;
    if (!g.deb) return g.t0 + n * g.dt;
    let f = -Infinity;
    for (let c = 0; c < n; c++) if (g.bas[c] >= 0 && g.fin[c] > f) f = g.fin[c];
    return f > -Infinity ? f : null;
  };
  /** Instant dont date la dernière colonne publiée : le carnet de cette colonne a été lu AVANT la
   *  publication (heatmap.py lit puis publie dans le même tour), et au plus tard à la fin de sa
   *  minute. Mesurer l'âge depuis la fin de la minute le sous-estimerait. */
  BM.instantDerniereColonne = function (g) {
    const f = BM.finGrille(g);
    if (f === null) return null;
    return g.majA ? Math.min(f, g.majA) : f;
  };
  /** Colonnes dont l'étendue rencontre [ta, tb[ : écrit [c0, c1] dans `out` ; faux si aucune.
   *  UNE seule fonction pour la peinture et la lecture au pointeur : elles ne peuvent diverger. */
  BM.plageColonnes = function (g, ta, tb, out) {
    const n = nCol(g);
    if (!(tb > ta) || !(n > 0)) return false;
    let c0, c1;
    if (g.deb) {
      let lo = 0, hi = n;                               // premier c tel que deb[c] ≥ tb
      while (lo < hi) { const m = (lo + hi) >> 1; if (g.deb[m] < tb) lo = m + 1; else hi = m; }
      c1 = lo - 1;
      lo = 0; hi = n;                                   // premier c tel que fin[c] > ta
      while (lo < hi) { const m = (lo + hi) >> 1; if (g.fin[m] > ta) hi = m; else lo = m + 1; }
      c0 = lo;
    } else {
      c0 = Math.max(0, Math.floor((ta - g.t0) / g.dt));
      c1 = Math.min(n - 1, Math.ceil((tb - g.t0) / g.dt) - 1);
    }
    if (c0 > c1) return false;
    out[0] = c0; out[1] = c1;
    return true;
  };
  /** Tranches ABSOLUES [ja, jb] que recouvre la ligne de pixels y (haut de vue p2, pp $/px). */
  BM.tranchesLigne = function (p2, pp, y, dp, out) {
    const haut = p2 - y * pp, bas = haut - pp;
    out[0] = Math.floor(bas / dp); out[1] = Math.max(out[0], Math.ceil(haut / dp) - 1);
    return out;
  };
  BM.tranchesLignes = function (p2, pp, h, dp, ja, jb) {
    const t = [0, 0];
    for (let y = 0; y < h; y++) { BM.tranchesLigne(p2, pp, y, dp, t); ja[y] = t[0]; jb[y] = t[1]; }
  };
  /** Intensité d'une cellule (c, tranche absolue pb), côté 'b' ou 'a' ; 0 hors de la grille. */
  BM.valeurCellule = function (g, c, pb, cote) {
    if (g.creux) return g.valeur(c, pb, cote);
    const k = pb - g.pbMin;
    if (k < 0 || k >= g.H) return 0;
    return (cote === 'b' ? g.bids : g.asks)[c * g.H + k];
  };
  /** MAX des colonnes c0..c1 dans colB / colA (indices relatifs à g.pbMin), sur la bande de chaque
   *  colonne. acc ← [observée ?, plus basse tranche, plus haute tranche] (union des bandes). */
  function accumuler(g, c0, c1, colB, colA, acc) {
    let obs = 0, lo = Infinity, hi = -Infinity;
    const H = g.H, pbMin = g.pbMin;
    for (let c = c0; c <= c1; c++) {
      const b = g.bas[c];
      if (b < 0) continue;
      obs = 1;
      const t = g.haut[c];
      if (b < lo) lo = b;
      if (t > hi) hi = t;
      if (g.creux) { g.accumuler(c, colB, colA); continue; }
      const o = c * H, k1 = Math.min(H - 1, t - pbMin);
      for (let k = Math.max(0, b - pbMin); k <= k1; k++) {
        const vb = g.bids[o + k], va = g.asks[o + k];
        if (vb > colB[k]) colB[k] = vb;
        if (va > colA[k]) colA[k] = va;
      }
    }
    acc[0] = obs; acc[1] = lo; acc[2] = hi;
  }

  /** La chaleur, peinte au pixel : pour chaque pixel, le MAX des cellules qu'il recouvre (fusion
   *  comprise). Un pixel qui recouvre plusieurs colonnes ne peut donc jamais cacher un mur — ce
   *  que ferait un simple rééchantillonnage au plus proche.
   *  px : Uint32Array, déjà rempli du fond (transparent pour un calque) ; vue {t1, t2, p1, p2} ;
   *  o : { lut } ou { lutB, lutA } (Uint32Array(256)), `maintenant` : rien n'est peint après ;
   *  `rect` [xa, ya, xb, yb[ facultatif : seul ce rectangle est peint, et px en est le tampon
   *  ((xb − xa) × (yb − ya)) — la bande découverte d'un glissement. Un pixel ne dépend que de la
   *  vue et de sa position : peint seul ou avec les autres, il reçoit la même couleur.
   *
   *  Coût : les pixels voisins qui recouvrent les MÊMES colonnes (une colonne de 60 s fait ≈ 7 px
   *  dans la vue de 3 h) forment un groupe : le MAX de chaque ligne y est calculé une fois par
   *  groupe, puis écrit d'un trait (fill). Un groupe d'un pixel (vue de 24 h) revient à l'ancienne
   *  boucle, pixel par pixel. Les colonnes d'un pixel viennent de BM.plageColonnes, ses tranches de
   *  BM.tranchesLigne — les fonctions de la lecture au pointeur (BM.lirePixel). */
  BM.peindreGrille = function (px, w, h, g, vue, o) {
    const n = nCol(g);
    if (!n || w < 1 || h < 1) return;
    const rc = o.rect, xa = rc ? rc[0] : 0, ya = rc ? rc[1] : 0, xb = rc ? rc[2] : w, yb = rc ? rc[3] : h, L = xb - xa;
    if (L <= 0 || yb <= ya) return;
    const t1 = vue.t1, tpp = (vue.t2 - vue.t1) / w, pp = (vue.p2 - vue.p1) / h;
    const tMax = o.maintenant !== undefined && o.maintenant !== null ? o.maintenant : Infinity;
    const H = g.H, pbMin = g.pbMin, lut = o.lut || null, lutB = o.lutB, lutA = o.lutA;
    // Pixels qui PEUVENT rencontrer la grille (marge de 2 px : hors de là, plageColonnes est fausse).
    const tDeb = g.deb ? g.deb[0] : g.t0, tFin = Math.min(tMax, g.deb ? g.fin[n - 1] : g.t0 + n * g.dt);
    const xs = Math.max(xa, Math.floor((tDeb - t1) / tpp) - 2), xe = Math.min(xb, Math.ceil((tFin - t1) / tpp) + 2);
    if (!(xe > xs)) return;
    const ja = new Int32Array(h), jb = new Int32Array(h), t = [0, 0];
    for (let y = ya; y < yb; y++) { BM.tranchesLigne(vue.p2, pp, y, g.dp, t); ja[y] = t[0]; jb[y] = t[1]; }
    // Colonnes [c0, c1] de chaque pixel (−1 : aucune).
    const C0 = new Int32Array(xe - xs).fill(-1), C1 = new Int32Array(xe - xs), r = [0, 0];
    for (let x = xs; x < xe; x++) {
      const ta = t1 + x * tpp;
      if (ta >= tMax) break;
      if (BM.plageColonnes(g, ta, Math.min(ta + tpp, tMax), r)) { C0[x - xs] = r[0]; C1[x - xs] = r[1]; }
    }
    const colB = new Uint8Array(H), colA = new Uint8Array(H), acc = [0, 0, 0];
    let k0 = -2, k1 = -2, lo = 0, hi = -1, obs = false;
    for (let i = 0, N = xe - xs; i < N;) {
      const c0 = C0[i];
      if (c0 < 0) { i++; continue; }
      const c1 = C1[i];
      let j = i + 1;
      while (j < N && C0[j] === c0 && C1[j] === c1) j++;
      if (c0 !== k0 || c1 !== k1) {
        if (obs) { const a0 = Math.max(0, lo - pbMin), a1 = Math.min(H, hi - pbMin + 1); colB.fill(0, a0, a1); colA.fill(0, a0, a1); }
        k0 = c0; k1 = c1;
        accumuler(g, c0, c1, colB, colA, acc);
        obs = acc[0] === 1; lo = acc[1]; hi = acc[2];
      }
      if (obs) {
        const x0 = xs + i - xa, x1 = xs + j - xa, un = j - i === 1;
        for (let y = ya; y < yb; y++) {
          const a = ja[y], b = jb[y];
          if (b < lo || a > hi) continue;              // hors bande observée : le fond reste
          let vb = 0, va = 0;
          const q0 = Math.max(0, Math.max(lo, a) - pbMin), q1 = Math.min(H - 1, Math.min(hi, b) - pbMin);
          for (let k = q0; k <= q1; k++) { const u = colB[k], v = colA[k]; if (u > vb) vb = u; if (v > va) va = v; }
          const c = lut ? lut[vb > va ? vb : va] : (vb >= va ? lutB[vb] : lutA[va]), off = (y - ya) * L;
          if (un) px[off + x0] = c; else px.fill(c, off + x0, off + x1);
        }
      }
      i = j;
    }
  };

  /** Ce que montre UN pixel — colonnes qui rencontrent [ta, tb[, tranches [ja, jb] : le MAX que la
   *  peinture y met, et la cellule qui le porte. Mêmes colonnes, mêmes tranches, même règle
   *  qu'en peinture : la lecture au pointeur décrit la couleur qu'on voit.
   *  null : hors de la grille. nObs = 0 : non observé. horsBande : hors de la bande couverte. */
  BM.lirePixel = function (g, ta, tb, ja, jb) {
    const r = [0, 0];
    if (!BM.plageColonnes(g, ta, tb, r)) return null;
    const res = { c0: r[0], c1: r[1], nObs: 0, nT: jb - ja + 1, horsBande: false, v: 0, cote: 'bid',
      vb: 0, va: 0, cb: -1, pbB: -1, ca: -1, pbA: -1, c: -1, pb: -1 };
    let lo = Infinity, hi = -Infinity;
    for (let c = r[0]; c <= r[1]; c++) {
      const b = g.bas[c], t = g.haut[c];
      if (b < 0) continue;
      res.nObs++;
      if (b < lo) lo = b;
      if (t > hi) hi = t;
      for (let pb = Math.max(ja, b); pb <= Math.min(jb, t); pb++) {
        const vb = BM.valeurCellule(g, c, pb, 'b'), va = BM.valeurCellule(g, c, pb, 'a');
        if (vb > res.vb) { res.vb = vb; res.cb = c; res.pbB = pb; }
        if (va > res.va) { res.va = va; res.ca = c; res.pbA = pb; }
      }
    }
    if (!res.nObs) return res;
    if (jb < lo || ja > hi) { res.horsBande = true; return res; }
    // Même départage qu'en peinture : à égalité, le bid.
    if (res.vb >= res.va) { res.v = res.vb; res.cote = 'bid'; res.c = res.cb; res.pb = res.pbB; }
    else { res.v = res.va; res.cote = 'ask'; res.c = res.ca; res.pb = res.pbA; }
    if (res.c < 0) { res.c = r[0]; res.pb = Math.max(ja, lo); }     // tout à 0 : rien au-dessus du seuil
    return res;
  };

  // ─── Encodage : ce qu'une intensité veut dire ──────────────────────────────
  /** Intervalle de BTC compatible avec l'intensité v : [ref·(v/P)², ref·((v+1)/P)²[ ; v = P :
   *  saturé (≥ ref). null si l'encodage n'est pas publié — on n'invente pas de référence. */
  BM.decoder = function (v, enc) {
    if (!enc || !enc.ref_btc || !enc.plafond || !(v > 0)) return null;
    const P = enc.plafond, r = enc.ref_btc;
    if (v >= P) return { min: r, max: Infinity, sature: true };
    return { min: r * (v / P) ** 2, max: r * ((v + 1) / P) ** 2, sature: false };
  };
  /** Quantité -> intensité, avec l'encodage PUBLIÉ (même formule que le serveur). */
  BM.intensite = function (q, enc) {
    if (!enc || !enc.ref_btc || !enc.plafond) return null;
    return Math.min(enc.plafond, Math.floor(enc.plafond * Math.sqrt(Math.max(0, q) / enc.ref_btc)));
  };
  /** Sans encodage publié : échelle PROPRE au carnet live, ancrée sur son 99ᵉ centile.
   *  Elle n'est pas comparable à la carte publiée — la carte le dit. */
  BM.intensiteRelative = function (q, p99) {
    if (!(p99 > 0)) return 0;
    return Math.min(255, Math.floor(255 * Math.sqrt(Math.max(0, q) / p99)));
  };

  // ─── Carnet live : une colonne par lecture ─────────────────────────────────
  /** Agrège un carnet Binance par tranche de dp $ : MAX du niveau (comme la carte publiée,
   *  pour la chaleur) et SOMME (pour le carnet latéral). Renvoie aussi la bande couverte. */
  BM.agregerCarnet = function (depth, dp) {
    const out = { dp, bids: new Map(), asks: new Map(), sb: new Map(), sa: new Map(), bas: null, haut: null,
      meilleurBid: null, meilleurAsk: null, niveaux: 0 };
    const side = (lv, mx, sm) => {
      for (const [ps, qs] of lv) {
        const p = +ps, q = +qs, pb = Math.floor(p / dp);
        if (!(q > 0)) continue;
        if (!(mx.get(pb) >= q)) mx.set(pb, q);
        sm.set(pb, (sm.get(pb) || 0) + q);
        out.niveaux++;
      }
    };
    side(depth.bids || [], out.bids, out.sb);
    side(depth.asks || [], out.asks, out.sa);
    // prixBas / prixHaut : le plus bas bid et le plus haut ask LUS (la bande exacte, pas le bord de leur tranche).
    if (depth.bids && depth.bids.length) { out.meilleurBid = +depth.bids[0][0]; out.prixBas = +depth.bids[depth.bids.length - 1][0]; out.bas = Math.floor(out.prixBas / dp); }
    if (depth.asks && depth.asks.length) { out.meilleurAsk = +depth.asks[0][0]; out.prixHaut = +depth.asks[depth.asks.length - 1][0]; out.haut = Math.floor(out.prixHaut / dp); }
    return out;
  };

  /** Le carnet live : une colonne par LECTURE, à son instant réel, avec ses QUANTITÉS.
   *  · Instant : le milieu de [envoi, réception] (un carnet REST ne porte pas d'heure serveur),
   *    passé à l'heure Binance par l'écart d'horloge (recaler()). Chaque lecture est peinte de son
   *    instant jusqu'à la suivante — au plus `validite` (3 cadences + 1 s), jamais au-delà de
   *    « maintenant » : pas de colonne sautée, pas de faux « non observé » entre deux lectures,
   *    pas de chaleur dans le futur, quelle que soit la durée des requêtes.
   *  · Quantités : le plus gros niveau (BTC) par tranche est GARDÉ ; l'intensité affichée est
   *    encodée avec l'échelle courante (fixerEchelle). Quand l'encodage publié arrive après le
   *    premier carnet — ou disparaît — tout est ré-encodé : rien n'est perdu, rien ne reste sur une
   *    échelle périmée, et la lecture au pointeur donne la quantité MESURÉE.
   *  · Stockage creux : par lecture, une série par côté (du plus bas bid au meilleur bid, du
   *    meilleur ask au plus haut ask) dans un tampon commun ; aucune bande de prix fixe à
   *    recentrer. Plein (capacité ou tampon) : on oublie la moitié la plus ancienne.
   *  Même interface que les grilles pour BM.peindreGrille / BM.lirePixel (n, deb, fin, bas, haut,
   *  pbMin, H = bande réunie des lectures gardées, dp). */
  BM.LIVE_CAPACITE = 1800;
  BM.LIVE_TAMPON_MAX = 1 << 21;      // quantités gardées (16 Mo) : borne la mémoire à 5 000 niveaux / 1 $
  BM.CarnetLive = function (dp, cadence, capacite, tamponMax) {
    const W = capacite || BM.LIVE_CAPACITE, I = () => new Int32Array(W), F = () => new Float64Array(W);
    Object.assign(this, {
      creux: true, dp, cadence, dt: cadence, W, n: 0, validite: BM.validiteLecture(cadence), ecart: 0,
      envoi: F(), recu: F(), deb: F(), fin: F(), bas: new Int32Array(W).fill(-1), haut: new Int32Array(W).fill(-1),
      bB: I(), nB: I(), oB: I(), bA: I(), nA: I(), oA: I(), id: F(),
      q: new Float64Array(1 << 14), v: new Uint8Array(1 << 14), lg: 0, lgMax: tamponMax || BM.LIVE_TAMPON_MAX,
      pbMin: 0, H: 0, dernierId: null, echelle: null, encoder: null,
    });
  };
  const CL = BM.CarnetLive.prototype;
  /** Ajoute une lecture (BM.agregerCarnet) reçue entre s et r (heure LOCALE), d'identifiant `id`
   *  (lastUpdateId). Rend 'ok', 'perimee' (identifiant qui ne croît pas : un instantané plus
   *  ancien que le précédent), 'desordre' (instant non croissant) ou 'vide'. */
  CL.ajouter = function (a, s, r, id) {
    if (id !== undefined && id !== null && this.dernierId !== null && !(id > this.dernierId)) return 'perimee';
    const t = (s + r) / 2 + this.ecart;
    if (this.n && !(t > this.deb[this.n - 1])) return 'desordre';
    const serie = m => { let lo = Infinity, hi = -Infinity; for (const pb of m.keys()) { if (pb < lo) lo = pb; if (pb > hi) hi = pb; } return lo <= hi ? [lo, hi - lo + 1] : [0, 0]; };
    const [b0, nb] = serie(a.bids), [a0, na] = serie(a.asks);
    let bas = a.bas !== null && a.bas !== undefined ? a.bas : (nb ? b0 : a0);
    let haut = a.haut !== null && a.haut !== undefined ? a.haut : (na ? a0 + na - 1 : b0 + nb - 1);
    if (!nb && !na) return 'vide';
    if (nb) bas = Math.min(bas, b0); if (na) haut = Math.max(haut, a0 + na - 1);
    if (this.n === this.W) this.oublier(Math.ceil(this.W / 2));
    while (this.n > 1 && this.lg + nb + na > this.lgMax) this.oublier(Math.ceil(this.n / 2));
    this.reserver(nb + na);
    const c = this.n;
    this.envoi[c] = s; this.recu[c] = r; this.id[c] = id === undefined || id === null ? NaN : id;
    this.deb[c] = t; this.fin[c] = t + this.validite;
    if (c > 0) this.fin[c - 1] = Math.min(t, this.deb[c - 1] + this.validite);
    const ecrire = (m, p0, k, o) => { for (let i = 0; i < k; i++) { const x = m.get(p0 + i) || 0; this.q[o + i] = x; this.v[o + i] = x > 0 && this.encoder ? this.encoder(x) : 0; } };
    this.bB[c] = b0; this.nB[c] = nb; this.oB[c] = this.lg; ecrire(a.bids, b0, nb, this.lg); this.lg += nb;
    this.bA[c] = a0; this.nA[c] = na; this.oA[c] = this.lg; ecrire(a.asks, a0, na, this.lg); this.lg += na;
    this.bas[c] = bas; this.haut[c] = haut;
    if (!this.H) { this.pbMin = bas; this.H = haut - bas + 1; }
    else { const hi = Math.max(this.pbMin + this.H - 1, haut); this.pbMin = Math.min(this.pbMin, bas); this.H = hi - this.pbMin + 1; }
    this.n++;
    if (id !== undefined && id !== null) this.dernierId = id;
    return 'ok';
  };
  CL.reserver = function (k) {
    if (this.lg + k <= this.q.length) return;
    let L = this.q.length;
    while (L < this.lg + k) L *= 2;
    const q = new Float64Array(L), v = new Uint8Array(L);
    q.set(this.q.subarray(0, this.lg)); v.set(this.v.subarray(0, this.lg));
    this.q = q; this.v = v;
  };
  /** Oublie les k lectures les plus anciennes (et compacte le tampon). */
  CL.oublier = function (k) {
    k = Math.min(k, this.n);
    if (k <= 0) return;
    const off = k < this.n ? this.oB[k] : this.lg;
    this.q.copyWithin(0, off, this.lg); this.v.copyWithin(0, off, this.lg); this.lg -= off;
    for (const x of ['envoi', 'recu', 'deb', 'fin', 'bas', 'haut', 'bB', 'nB', 'oB', 'bA', 'nA', 'oA', 'id']) this[x].copyWithin(0, k, this.n);
    this.n -= k;
    this.bas.fill(-1, this.n); this.haut.fill(-1, this.n);
    let lo = Infinity, hi = -Infinity;
    for (let c = 0; c < this.n; c++) { this.oB[c] -= off; this.oA[c] -= off; if (this.bas[c] < lo) lo = this.bas[c]; if (this.haut[c] > hi) hi = this.haut[c]; }
    if (this.n) { this.pbMin = lo; this.H = hi - lo + 1; } else { this.pbMin = 0; this.H = 0; }
  };
  /** Nouvel écart d'horloge : les instants des lectures (gardées en heure locale) sont replacés. */
  CL.recaler = function (ecart) {
    this.ecart = ecart;
    for (let c = 0; c < this.n; c++) this.deb[c] = (this.envoi[c] + this.recu[c]) / 2 + ecart;
    for (let c = 0; c < this.n; c++) this.fin[c] = c + 1 < this.n ? Math.min(this.deb[c + 1], this.deb[c] + this.validite) : this.deb[c] + this.validite;
  };
  /** Échelle courante (clé + quantité → intensité). Nouvelle clé : tout est ré-encodé. Vrai si changé. */
  CL.fixerEchelle = function (cle, f) {
    if (this.echelle === cle) return false;
    this.echelle = cle; this.encoder = f;
    for (let i = 0; i < this.lg; i++) this.v[i] = this.q[i] > 0 ? f(this.q[i]) : 0;
    return true;
  };
  CL.cellule = function (c, pb, cote, tab) {
    const b = cote === 'b' ? this.bB[c] : this.bA[c], k = cote === 'b' ? this.nB[c] : this.nA[c], i = pb - b;
    return i >= 0 && i < k ? tab[(cote === 'b' ? this.oB[c] : this.oA[c]) + i] : 0;
  };
  /** Intensité affichée (échelle courante) et quantité MESURÉE (BTC) d'une cellule. */
  CL.valeur = function (c, pb, cote) { return this.cellule(c, pb, cote, this.v); };
  CL.quantite = function (c, pb, cote) { return this.cellule(c, pb, cote, this.q); };
  /** MAX de la lecture c dans colB / colA (indices relatifs à pbMin). */
  CL.accumuler = function (c, colB, colA) {
    for (const [b, k, o, col] of [[this.bB[c], this.nB[c], this.oB[c], colB], [this.bA[c], this.nA[c], this.oA[c], colA]]) {
      const d = b - this.pbMin;
      for (let i = 0; i < k; i++) { const x = this.v[o + i]; if (x > col[d + i]) col[d + i] = x; }
    }
  };
  /** Quantités non nulles de la dernière lecture (pour une échelle propre). */
  CL.quantitesDerniere = function () {
    const c = this.n - 1, out = [];
    if (c < 0) return out;
    for (let i = this.oB[c]; i < this.lg; i++) if (this.q[i] > 0) out.push(this.q[i]);
    return out;
  };

  /** Centile (0..1) d'une liste de nombres. */
  BM.centile = function (xs, p) {
    if (!xs.length) return 0;
    const s = Float64Array.from(xs).sort();
    return s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))];
  };

  // ─── Pas « ronds » compatibles avec la donnée ──────────────────────────────
  /** Pas de prix pour regrouper des tranches de `dp` $ : un MULTIPLE ENTIER de dp (dp × 1, 2, 5,
   *  10, 20, 50…) ≥ brut. Un pas non multiple (2,5 $ sur des tranches de 1 $, 25 $ sur 10 ou 20 $)
   *  verse tour à tour 2 et 3 tranches par barre : un peigne qui n'existe pas dans la donnée, et
   *  des sommes fausses. On fusionne, on n'affine jamais. */
  BM.pasMultiple = function (brut, dp) {
    if (!(brut > dp)) return dp;
    const r = brut / dp, e = Math.pow(10, Math.floor(Math.log10(r)));
    for (const m of [1, 2, 5, 10]) if (m * e >= r - 1e-9) return dp * Math.round(m * e);
    return dp * Math.round(10 * e);
  };
  /** Pas de temps pour regrouper des secondes : une échelle FIXE (1, 2, 5, 10, 15, 30 s, 1, 2, 5,
   *  10, 15, 30 min, 1, 2, 3, 6, 12 h, 1 j) ≥ brut. Avec des seaux ancrés sur l'horloge, une bulle
   *  ne bouge pas quand la vue glisse. */
  BM.PAS_TEMPS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 10800, 21600, 43200, 86400].map(s => s * 1000);
  BM.pasTemps = function (brutMs) { return BM.PAS_TEMPS.find(p => p >= brutMs) || BM.PAS_TEMPS[BM.PAS_TEMPS.length - 1]; };

  // ─── Exécutions ────────────────────────────────────────────────────────────
  /** aggTrades -> seaux (seconde, tranche de dp $) : volumes achetés / vendus au marché.
   *  `m` (buyer is maker) = le VENDEUR a pris la liquidité : c'est une vente au marché.
   *  Par seconde aussi : Σ prix × quantité et Σ quantité EXACTS (le prix moyen de la seconde ne
   *  se lit pas sur le centre d'une tranche). */
  //  REGROUPEMENTS GARDÉS (« plis ») : pour un pas de temps et un pas de prix donnés, les seaux
  //  ancrés (⌊s / pasT⌋, ⌊tranche / m⌋) sont gardés et COMPLÉTÉS seconde par seconde, au lieu de
  //  rebalayer à chaque image toutes les secondes depuis l'ouverture (6 h : 21 600 secondes). Une
  //  seconde n'y est versée que CLOSE (une seconde plus récente est arrivée : les exécutions
  //  arrivent dans l'ordre) ; la seconde ouverte est ajoutée à la lecture, sur une copie. Les
  //  secondes sont versées dans l'ordre : mêmes sommes, au bit près, qu'un regroupement refait
  //  de zéro. Une exécution plus ancienne qu'une seconde déjà versée (remplissage arrière) défait
  //  les plis ; la purge refait le seul seau qu'elle coupe.
  BM.SeauxExecutions = function (dp) {
    this.dp = dp || 1;
    this.seaux = new Map();     // seconde -> Map(tranche -> [achat, vente])
    this.pxs = new Map();       // seconde -> [Σ p·q, Σ q]
    this.triees = []; this.trieesOk = true;   // secondes triées (index des fenêtres)
    this.premier = null; this.dernier = null; this.dernierId = null; this.dernierPrix = null;
    this.total = [0, 0];
    this.sMax = null;           // la seconde la plus récente : la seule encore « ouverte »
    this.plis = new Map();      // 'pasT:m' -> pli
    this.version = 0;           // change à chaque exécution versée ou purgée
    this.servis = 0;
  };
  BM.PLIS_MAX = 6;
  const SX = BM.SeauxExecutions.prototype;
  SX.verser = function (t) {
    const s = Math.floor(t.T / 1000), p = +t.p, pb = Math.floor(p / this.dp), q = +t.q, cote = t.m ? 1 : 0;
    let m = this.seaux.get(s);
    if (!m) {
      m = new Map(); this.seaux.set(s, m); this.pxs.set(s, [0, 0]);
      const T = this.triees;
      if (this.trieesOk && (!T.length || s > T[T.length - 1])) T.push(s); else this.trieesOk = false;
    }
    const v = m.get(pb) || [0, 0];
    v[cote] += q; m.set(pb, v);
    const x = this.pxs.get(s); x[0] += p * q; x[1] += q;
    this.total[cote] += q;
    if (this.premier === null || t.T < this.premier) this.premier = t.T;
    if (this.sMax === null || s > this.sMax) this.sMax = s;
    else if (s < this.sMax && this.plis.size) this.plis.clear();      // une seconde déjà versée a changé
    this.version++;
  };
  /** Secondes triées (l'index est refait après un ajout dans le désordre). */
  SX.ordre = function () {
    if (!this.trieesOk) { this.triees = [...this.seaux.keys()].sort((a, b) => a - b); this.trieesOk = true; }
    return this.triees;
  };
  /** Le pli (pasT, m), complété jusqu'à la seconde ouverte (exclue). */
  SX.pli = function (pasT, m) {
    const cle = pasT + ':' + m;
    let P = this.plis.get(cle);
    if (!P) {
      if (this.plis.size >= BM.PLIS_MAX) {           // le moins récemment servi s'en va
        let vieux = null;
        for (const [k, x] of this.plis) if (!vieux || x.servi < this.plis.get(vieux).servi) vieux = k;
        this.plis.delete(vieux);
      }
      P = { pasT, m, fin: -Infinity, parT: new Map(), servi: 0 };
      this.plis.set(cle, P);
    }
    P.servi = ++this.servis;
    if (this.sMax !== null && P.fin < this.sMax) {
      const T = this.ordre();
      let lo = 0, hi = T.length;
      while (lo < hi) { const k = (lo + hi) >> 1; if (T[k] < P.fin) lo = k + 1; else hi = k; }
      for (let i = lo; i < T.length && T[i] < this.sMax; i++) this.plier(P, T[i]);
      P.fin = this.sMax;
    }
    return P;
  };
  /** Verse la seconde s dans le pli P (seaux créés à la demande, complétés en place). */
  SX.plier = function (P, s, cible) {
    const Tn = Math.floor(s * 1000 / P.pasT), pasPx = P.m * this.dp;
    let mp = cible || P.parT.get(Tn);
    if (!mp) { mp = new Map(); P.parT.set(Tn, mp); }
    for (const [pb, v] of this.seaux.get(s)) {
      const Pn = Math.floor(pb / P.m);
      let e = mp.get(Pn);
      if (!e) { e = { T: Tn, P: Pn, ta: Tn * P.pasT, tb: (Tn + 1) * P.pasT, pa: Pn * pasPx, pb: (Pn + 1) * pasPx, p: (Pn + 0.5) * pasPx, achat: 0, vente: 0, s0: s, s1: s, t: 0 }; mp.set(Pn, e); }
      e.achat += v[0]; e.vente += v[1];
      if (s < e.s0) e.s0 = s;
      if (s > e.s1) e.s1 = s;
      e.t = (e.s0 + e.s1 + 1) * 500;
    }
    return mp;
  };
  SX.ajouter = function (t) {
    if (this.dernierId !== null && t.a <= this.dernierId) return false;      // déjà compté
    this.verser(t);
    if (this.dernier === null || t.T >= this.dernier) { this.dernier = t.T; this.dernierPrix = +t.p; }
    if (this.dernierId === null || t.a > this.dernierId) this.dernierId = t.a;
    return true;
  };
  /** Ajout de trades plus ANCIENS que le premier (remplissage arrière) : on ne dépend pas
   *  de `dernierId`, on vérifie l'unicité par identifiant. */
  SX.ajouterAncien = function (t, vus) {
    if (vus.has(t.a)) return false;
    vus.add(t.a);
    this.verser(t);
    return true;
  };
  /** Oublie les secondes avant `avantMs`. Dans chaque pli : les seaux entièrement passés s'en
   *  vont, et le seul que la limite coupe est refait de ses secondes restantes (dans l'ordre). */
  SX.purger = function (avantMs) {
    const lim = Math.floor(avantMs / 1000), T = this.ordre();
    let k = 0, hi = T.length;
    while (k < hi) { const m = (k + hi) >> 1; if (T[m] < lim) k = m + 1; else hi = m; }
    if (k) {
      for (let i = 0; i < k; i++) { this.seaux.delete(T[i]); this.pxs.delete(T[i]); }
      this.triees = T.slice(k);
      for (const P of this.plis.values()) {
        const Tc = Math.floor(lim * 1000 / P.pasT);
        for (const Tn of P.parT.keys()) if (Tn < Tc) P.parT.delete(Tn);
        if (Tc * P.pasT < lim * 1000 && P.parT.has(Tc)) {
          const mp = new Map(), borne = Math.min((Tc + 1) * P.pasT / 1000, P.fin);
          for (let i = 0; i < this.triees.length && this.triees[i] < borne; i++) this.plier(P, this.triees[i], mp);
          if (mp.size) P.parT.set(Tc, mp); else P.parT.delete(Tc);
        }
      }
      this.version++;
    }
    if (this.premier !== null && this.premier < avantMs) this.premier = avantMs;
  };
  /** Secondes de [ta, tb[ (triées). */
  SX.secondes = function (ta, tb) {
    const T = this.ordre(), s0 = Math.floor(ta / 1000), s1 = Math.ceil(tb / 1000);
    let lo = 0, hi = T.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (T[m] < s0) lo = m + 1; else hi = m; }
    let i = lo;
    const out = [];
    for (; i < T.length && T[i] < s1; i++) out.push(T[i]);
    return out;
  };
  /** Regroupe les seaux par pas de temps (ms) et de prix ($), ANCRÉS sur l'horloge et sur le prix
   *  0 : seau (⌊s / pasT⌋, ⌊tranche / m⌋), m = pasP / dp ENTIER. Tout seau qui rencontre [ta, tb[
   *  est pris en entier : une bulle ne change pas quand la vue glisse. La SOMME des volumes est
   *  conservée (contrôlé par le harnais). Chaque seau rend ses bornes et le milieu des secondes
   *  qui portent des exécutions (t) : jamais placé là où rien n'a été lu. */
  //  Les seaux rendus sont ceux du pli (sauf celui de la seconde ouverte, une copie) : on les lit,
  //  on ne les modifie pas.
  SX.regrouper = function (ta, tb, pasT, pasP) {
    const m = Math.max(1, Math.round(pasP / this.dp)), P = this.pli(pasT, m), out = [];
    const ouv = this.sMax !== null && this.seaux.has(this.sMax) ? Math.floor(this.sMax * 1000 / pasT) : null;
    for (let T = Math.floor(ta / pasT), T1 = Math.ceil(tb / pasT); T < T1; T++) {
      const mp = P.parT.get(T);
      if (T === ouv) {
        const c = new Map();
        if (mp) for (const [k, e] of mp) c.set(k, Object.assign({}, e));
        this.plier(P, this.sMax, c);
        for (const e of c.values()) out.push(e);
      } else if (mp) for (const e of mp.values()) out.push(e);
    }
    return out;
  };
  /** Profil des exécutions par tranche de prix sur [ta, tb[ (tranches de pasP $, multiple de dp) :
   *  les minutes entières viennent du pli d'une minute, les bords seconde par seconde. */
  SX.profil = function (ta, tb, pasP) {
    const out = new Map(), m = Math.max(1, Math.round(pasP / this.dp));
    const ajouter = (P, a, v) => { const e = out.get(P); if (e) { e[0] += a; e[1] += v; } else out.set(P, [a, v]); };
    const parSeconde = (a, b) => { for (const s of this.secondes(a * 1000, b * 1000)) for (const [pb, v] of this.seaux.get(s)) ajouter(Math.floor(pb / m), v[0], v[1]); };
    const S0 = Math.floor(ta / 1000), S1 = Math.ceil(tb / 1000), Ma = Math.ceil(S0 / 60), Mb = Math.floor(S1 / 60);
    if (Mb - Ma < 2) { parSeconde(S0, S1); return out; }
    const P = this.pli(60e3, m);
    parSeconde(S0, Ma * 60);
    for (let M = Ma; M < Mb; M++) { const mp = P.parT.get(M); if (mp) for (const e of mp.values()) ajouter(e.P, e.achat, e.vente); }
    const o = this.sMax;
    if (o !== null && o >= Ma * 60 && o < Mb * 60 && this.seaux.has(o)) for (const [pb, v] of this.seaux.get(o)) ajouter(Math.floor(pb / m), v[0], v[1]);
    parSeconde(Mb * 60, S1);
    return out;
  };
  /** Prix moyen pondéré par le volume (VWAP) de chaque seconde de [ta, tb[ : [[s, prix], …]. */
  SX.prixSecondes = function (ta, tb) {
    return this.secondes(ta, tb).map(s => { const x = this.pxs.get(s); return [s, x[0] / x[1]]; }).filter(x => isFinite(x[1]));
  };

  /** La ligne de prix, en segments [[t, prix], …] (une coupure = un nouveau segment) :
   *  · les clôtures 1 min (la bougie en cours vaut ce qu'elle valait à sa lecture, minutesA) ;
   *  · puis, à la seconde, le VWAP des exécutions : après la dernière clôture, et — quand on
   *    zoome (`parSeconde`) — partout où les exécutions sont lues, au lieu d'interpoler entre deux
   *    clôtures (une droite entre deux minutes traverse des prix jamais traités) ;
   *  · coupée sur les minutes manquantes et sur les exécutions non lues (`nonLues`). */
  BM.lignePrix = function (minutes, ex, o) {
    const segs = [];
    let cur = [];
    const couper = () => { if (cur.length) segs.push(cur); cur = []; };
    const limite = o.parSeconde && ex.premier !== null ? ex.premier : Infinity;
    let fin = -Infinity, avant = null;
    for (const m of minutes) {
      if (m.fin < o.t1 - 60e3 || m.t > o.t2) { avant = m; continue; }
      if (m.fin > limite) break;
      const t = Math.min(m.fin, o.minutesA === undefined || o.minutesA === null ? Infinity : o.minutesA);
      if (avant && m.t - avant.t > 60e3) couper();
      cur.push([t, m.c]); fin = t; avant = m;
    }
    const debut = limite < Infinity ? Math.max(fin, ex.premier, o.t1 - 60e3) : Math.max(fin, o.t1 - 60e3);
    const trous = o.nonLues || [];
    let sAvant = null;
    for (const [s, p] of ex.prixSecondes(debut, Math.min(o.t2, o.maintenant === undefined ? Infinity : o.maintenant) + 1000)) {
      const t = s * 1000 + 500;
      if (t <= fin) continue;
      if (sAvant !== null && trous.some(([a, b]) => a < s * 1000 && b > (sAvant + 1) * 1000)) couper();
      cur.push([t, p]); sAvant = s;
    }
    couper();
    return segs;
  };

  // ─── Bougies 1 min : volume et CVD ─────────────────────────────────────────
  /** Klines Binance -> minutes. Le delta est EXACT : Binance publie, pour chaque bougie, la
   *  part achetée au taker (k[10], en USDT) ; delta = achats − ventes = 2·k[10] − k[7]. */
  BM.minutes = function (klines) {
    return (klines || []).map(k => ({
      t: +k[0], fin: +k[6] + 1, o: +k[1], h: +k[2], l: +k[3], c: +k[4],
      vol: +k[7], achat: +k[10], vente: +k[7] - +k[10], delta: 2 * +k[10] - +k[7],
    }));
  };
  /** Fusionne de nouvelles minutes dans une série triée par t : une minute relue REMPLACE
   *  l'ancienne (la bougie en cours se complète), une minute nouvelle s'insère à sa place — un
   *  rattrapage après une absence comble le trou au lieu de s'ajouter à la fin. */
  BM.fusionnerMinutes = function (serie, neuves) {
    if (!neuves.length) return serie;
    const out = [];
    let i = 0, j = 0;
    while (i < serie.length || j < neuves.length) {
      if (j >= neuves.length || (i < serie.length && serie[i].t < neuves[j].t)) out.push(serie[i++]);
      else { if (i < serie.length && serie[i].t === neuves[j].t) i++; out.push(neuves[j++]); }
    }
    return out;
  };
  /** Minutes MANQUANTES d'une série (Binance ne les a pas rendues, ou pas encore relues) :
   *  [[début, fin[, …] en ms. Elles sont « non lues », pas « sans volume ». */
  BM.trousMinutes = function (serie) {
    const out = [];
    for (let i = 1; i < serie.length; i++) if (serie[i].t - serie[i - 1].t > 60e3) out.push([serie[i - 1].t + 60e3, serie[i].t]);
    return out;
  };
  /** CVD cumulé à partir de l'indice i0 (0 au bord gauche de la vue). Après un trou de bougies, le
   *  cumul REPART de 0 : continuer en sautant les deltas manquants donnerait une valeur fausse pour
   *  tout le reste de la vue, sans marque. `reprises` = indices où il repart (à dire et hachurer). */
  BM.cvd = function (serie, i0) {
    const v = new Float64Array(serie.length).fill(NaN), reprises = [];
    let s = 0;
    for (let i = Math.max(0, i0); i < serie.length; i++) {
      if (i > i0 && serie[i].t - serie[i - 1].t > 60e3) { s = 0; reprises.push(i); }
      s += serie[i].delta; v[i] = s;
    }
    return { v, reprises };
  };
  BM.cvdDepuis = function (serie, i0) { return BM.cvd(serie, i0).v; };
  /** Minutes regroupées par barre de volume : la plus petite valeur d'une échelle « ronde » qui
   *  donne au moins 2 px par barre. Une échelle fixe (et des groupes ancrés sur l'horloge) : les
   *  barres ne changent pas quand la vue glisse, et le titre peut dire la vraie durée. */
  BM.PAS_MINUTES = [1, 2, 3, 5, 10, 15, 30, 60, 120, 180, 360, 720, 1440];
  BM.pasMinutes = function (pxParMinute) {
    const brut = Math.ceil(2 / Math.max(1e-9, pxParMinute));
    return BM.PAS_MINUTES.find(g => g >= brut) || BM.PAS_MINUTES[BM.PAS_MINUTES.length - 1];
  };
  BM.texteMinutes = function (g) { return g === 1 ? 'minute' : g < 60 ? g + ' min' : (g / 60) + ' h'; };
  /** Durée (ms) des intervalles [a, b[ qui tombe dans [ta, tb[. */
  BM.dureeDans = function (intervalles, ta, tb) {
    let d = 0;
    for (const [a, b] of intervalles) d += Math.max(0, Math.min(b, tb) - Math.max(a, ta));
    return d;
  };

  // ─── Lecture du fichier de 15 min : murs et gamma ──────────────────────────
  BM.niveauxPublies = function (md) {
    if (!md) return null;
    const lq = md.liquidity || {}, mi = md.micro || {};
    const at = Date.parse(lq.snapshot_at || md.updated) || null;
    const g = Date.parse(md.updated) || null;
    const murs = [];
    for (const [p, q] of lq.bid_walls || []) murs.push({ cote: 'bid', p, q });
    for (const [p, q] of lq.ask_walls || []) murs.push({ cote: 'ask', p, q });
    const gamma = [];
    if (mi.call_wall) gamma.push({ nom: 'Mur de calls', court: 'CW', p: mi.call_wall });
    if (mi.put_wall) gamma.push({ nom: 'Mur de puts', court: 'PW', p: mi.put_wall });
    if (mi.zero_gamma) gamma.push({ nom: 'Zéro gamma', court: 'ZG', p: mi.zero_gamma });
    for (const p of mi.gamma_walls || []) if (!gamma.some(x => x.p === p)) gamma.push({ nom: 'Mur de gamma', court: 'GW', p });
    // Les strikes (Deribit) sont dans l'unité que meta.champs déclare — en USD — et l'axe de la
    // carte est en USDT. Quand le fichier publie le cours USDT/USD (micro.usdt_usd : 1 USDT = x USD),
    // chaque niveau est PLACÉ à p / x USDT ; son libellé reste le strike publié. Sinon il est posé
    // tel quel, et la carte écrit « non converti ».
    const champs = (md.meta && md.meta.champs) || {};
    const unite = (champs['micro.call_wall'] && champs['micro.call_wall'].unite) || 'USD';
    const taux = +mi.usdt_usd;
    const conversion = unite === 'USD' && taux > 0 && isFinite(taux) ? { taux, a: Date.parse(mi.premium_at || md.updated) || null } : null;
    for (const x of gamma) x.pAxe = conversion ? x.p / conversion.taux : x.p;
    return {
      murs, mursA: at, tranche: lq.wall_bin_usd || null, unite: lq.unit || null,
      gamma, gammaA: g, regime: mi.gex_state || null, convention: mi.gex_convention || null,
      uniteGamma: unite, conversion,
      meta: (md.meta && md.meta.champs) || null,
    };
  };

  // ─── Horloge : l'heure de Binance ──────────────────────────────────────────
  /** Les exécutions et les bougies sont à l'heure du SERVEUR Binance ; le carnet live, « maintenant »
   *  et les âges seraient à l'heure locale. Une horloge locale décalée ferait glisser les bulles et
   *  la ligne de prix par rapport à la chaleur live. On mesure donc l'écart sur /api/v3/time :
   *  envoi s, réception r (heure locale), heure serveur S → écart = S − (s + r)/2, incertitude
   *  u = (r − s)/2. On garde les `garde` derniers échantillons et on retient celui dont l'aller-
   *  retour est le plus court (le moins incertain). */
  BM.HORLOGE_PERIODE = 5 * 60e3;     // un échantillon toutes les 5 min (poids Binance : 1)
  BM.Horloge = function (garde) {
    this.garde = garde || 5;
    this.echantillons = [];
    this.ecart = 0; this.u = null; this.a = null;   // u = null : jamais mesurée (écart supposé nul)
  };
  /** Ajoute un échantillon ; vrai si l'écart retenu a changé. */
  BM.Horloge.prototype.echantillon = function (s, r, S) {
    if (!(r >= s) || !isFinite(S)) return false;
    this.echantillons.push({ ecart: S - (s + r) / 2, u: (r - s) / 2, a: r });
    if (this.echantillons.length > this.garde) this.echantillons.shift();
    let m = this.echantillons[0];
    for (const e of this.echantillons) if (e.u < m.u) m = e;
    const avant = this.ecart;
    this.ecart = m.ecart; this.u = m.u; this.a = m.a;
    return this.ecart !== avant;
  };
  /** Heure Binance d'un instant local (Date.now() par défaut). */
  BM.Horloge.prototype.maintenant = function (local) { return (local === undefined ? Date.now() : local) + this.ecart; };
  /** Instant (heure Binance) d'une réponse dont on ne connaît que l'envoi s et la réception r
   *  (un carnet REST ne porte pas d'heure serveur) : le milieu, ± la demi-durée + l'incertitude. */
  BM.Horloge.prototype.instant = function (s, r) { return { t: (s + r) / 2 + this.ecart, u: (r - s) / 2 + (this.u || 0) }; };
  /** Texte de l'écart quand il dépasse `seuil` ms (1 s) ; null sinon. */
  BM.Horloge.prototype.texte = function (seuil) {
    if (this.u === null || Math.abs(this.ecart) <= (seuil === undefined ? 1000 : seuil)) return null;
    const s = v => (v / 1000).toFixed(1).replace('.', ',') + ' s', u = this.u < 1000 ? Math.round(this.u) + ' ms' : s(this.u);
    return 'horloge locale ' + (this.ecart > 0 ? 'en retard' : 'en avance') + ' de ' + s(Math.abs(this.ecart)) + ' ± ' + u + ' : recalée sur Binance';
  };

  // ─── Cadence des lectures : pas fixe, recul, délai maximal ─────────────────
  /** Prochain créneau d'une boucle à pas FIXE (debut + k·période, strictement après `maintenant`) :
   *  la période ne s'allonge pas de la durée de la requête, et une requête lente fait sauter des
   *  créneaux au lieu de déclencher une rafale de rattrapage. */
  BM.prochainCreneau = function (debut, periode, maintenant) {
    return debut + (Math.floor((maintenant - debut) / periode) + 1) * periode;
  };
  /** Après `echecs` échecs consécutifs (réseau, délai dépassé, 5xx) : période × 2^echecs, plafonnée
   *  à max(période, 60 s). Zéro échec : la période. */
  BM.delaiReessai = function (periode, echecs) {
    if (!(echecs > 0)) return periode;
    return Math.min(Math.max(periode, 60e3), periode * Math.pow(2, echecs));
  };
  /** Retry-After (secondes, ou date HTTP) -> secondes ; null s'il est absent ou illisible. */
  BM.lireRetryAfter = function (v, maintenantMs) {
    if (v === null || v === undefined || v === '') return null;
    if (/^\s*\d+(\.\d+)?\s*$/.test(String(v))) return +v;
    const d = Date.parse(v);
    return isFinite(d) ? Math.max(0, (d - (maintenantMs === undefined ? Date.now() : maintenantMs)) / 1000) : null;
  };
  /** Limites de requêtes d'un HÔTE (429 : trop de requêtes ; 418 : adresse IP bannie). Binance
   *  bannit (2 min à 3 jours) l'adresse qui ignore ses 429 — et le bannissement touche aussi le
   *  terminal et tous ceux derrière la même adresse. Sur 429/418, TOUTES les lectures de l'hôte
   *  s'arrêtent jusqu'à `jusqua` : Retry-After quand il est lisible, sinon un recul exponentiel
   *  (30 s, 60 s, 120 s… ; 2 min pour un 418), plafonné à 30 min. Un succès remet le compteur à zéro. */
  BM.RECUL = { base: 30e3, base418: 120e3, max: 30 * 60e3 };
  BM.Recul = function () { this.jusqua = 0; this.niveau = 0; this.statut = null; };
  BM.Recul.prototype.echec = function (statut, retryAfterS, maintenant) {
    const d = retryAfterS > 0 ? retryAfterS * 1000
      : Math.min(BM.RECUL.max, (statut === 418 ? BM.RECUL.base418 : BM.RECUL.base) * Math.pow(2, this.niveau));
    this.niveau++;
    this.statut = statut;
    this.jusqua = Math.max(this.jusqua, maintenant + d);
    return d;
  };
  BM.Recul.prototype.attente = function (maintenant) { return Math.max(0, this.jusqua - maintenant); };
  BM.Recul.prototype.succes = function () { this.niveau = 0; this.statut = null; };

  // ─── Mémoire du carnet : la présence passée d'un niveau, rangée par rangée ───
  /** Ce que la carte publiée dit d'une rangée de 20 $ sur une fenêtre : pendant combien de ses
   *  minutes OBSERVÉES un niveau d'au moins qS BTC s'y trouvait (bid ou ask). Toujours lu sur la
   *  grille BRUTE publiée (jamais la grille fusionnée : un réglage ne change pas une valeur).
   *  « Un niveau » : rien ne dit que c'est le même ordre d'une minute à l'autre. Présence passée,
   *  ni support ni résistance. Conventions (écrites dans la légende) : une minute est observée
   *  pour une rangée si la rangée est dans la bande DÉDUITE des cellules de la colonne (un peu
   *  plus étroite que la bande réellement lue) ; une rangée observée moins de `minObserveMin`
   *  minutes est hachurée (trop peu vue pour qu'une part veuille dire grand-chose). */
  BM.PRESENCE = { seuilsBtc: [1, 2, 5, 10, 25, 50], defautBtc: 10, minObserveMin: 30 };
  // Pas d'un double : le suivant / le précédent (seuil EXACT, au bit près, en flottants).
  const F64 = new Float64Array(1), I64 = new BigInt64Array(F64.buffer);
  const pasDouble = (x, s) => { F64[0] = x; I64[0] += BigInt(s); return F64[0]; };
  /** Seuil demandé X (BTC) -> le cran publié qui le porte : vS = clamp(⌈P·√(X/ref)⌉, 1, P) et
   *  qS = ref·(vS/P)². Comme v = min(P, ⌊P·√(q/ref)⌋) ne décroît jamais quand q croît,
   *  v ≥ vS ⇔ q ≥ qS : le seuil en BTC est EXACT, pas une approximation de X. qS est ajusté au
   *  double près pour que l'équivalence tienne aussi en flottants (BM.intensite).
   *  null sans encodage publié : aucun seuil en BTC n'est inventé. */
  BM.seuilPresence = function (X, enc) {
    if (!enc || !enc.ref_btc || !enc.plafond || !(X > 0)) return null;
    const P = enc.plafond, ref = enc.ref_btc;
    const vS = Math.min(P, Math.max(1, Math.ceil(P * Math.sqrt(X / ref))));
    let qS = ref * (vS / P) ** 2;
    while (BM.intensite(qS, enc) < vS) qS = pasDouble(qS, 1);
    while (qS > 0 && BM.intensite(pasDouble(qS, -1), enc) >= vS) qS = pasDouble(qS, -1);
    return { X, vS, qS };
  };
  /** Sommes préfixes par rangée : obs (minute observée), pres (max(bid, ask) ≥ vS), presB, presA.
   *  Rangée r (relative à g.pbMin), colonnes [0, c[ : tableau[r·(W+1) + c]. Une fenêtre [c0, c1]
   *  coûte donc O(1) par rangée. */
  BM.presence = function (g, vS) {
    const W = g.W, H = g.H, L = W + 1;
    const obs = new Uint16Array(L * H), pres = new Uint16Array(L * H), presB = new Uint16Array(L * H), presA = new Uint16Array(L * H);
    for (let r = 0; r < H; r++) {
      const pb = g.pbMin + r, o = r * L;
      let no = 0, np = 0, nb = 0, na = 0;
      for (let c = 0; c < W; c++) {
        if (g.bas[c] >= 0 && g.bas[c] <= pb && pb <= g.haut[c]) {
          no++;
          const b = g.bids[c * H + r] >= vS, a = g.asks[c * H + r] >= vS;
          if (b || a) np++;
          if (b) nb++;
          if (a) na++;
        }
        obs[o + c + 1] = no; pres[o + c + 1] = np; presB[o + c + 1] = nb; presA[o + c + 1] = na;
      }
    }
    return { W, H, pbMin: g.pbMin, dp: g.dp, t0: g.t0, dt: g.dt, vS, obs, pres, presB, presA };
  };
  /** Comptes de la rangée ABSOLUE pb sur les colonnes [c0, c1] (bornées à la grille). */
  BM.presenceFenetre = function (pr, pb, c0, c1) {
    const r = pb - pr.pbMin;
    c0 = Math.max(0, c0); c1 = Math.min(pr.W - 1, c1);
    if (r < 0 || r >= pr.H || c1 < c0) return { obs: 0, pres: 0, presB: 0, presA: 0 };
    const o = r * (pr.W + 1), d = t => t[o + c1 + 1] - t[o + c0];
    return { obs: d(pr.obs), pres: d(pr.pres), presB: d(pr.presB), presA: d(pr.presA) };
  };
  /** Plus longue présence ININTERROMPUE de la rangée pb sur [c0, c1] : colonnes consécutives où un
   *  niveau ≥ vS y est. Une colonne non observée (ou absente) COUPE la série : on ne sait pas.
   *  Calculée au survol seulement (une rangée, une fenêtre). Rend { n, c } (n colonnes dès c). */
  BM.plusLonguePresence = function (g, vS, pb, c0, c1) {
    const r = pb - g.pbMin, H = g.H;
    let n = 0, c = -1, k = 0;
    if (r < 0 || r >= H) return { n, c };
    c0 = Math.max(0, c0); c1 = Math.min(g.W - 1, c1);
    for (let j = c0; j <= c1; j++) {
      const ok = g.bas[j] >= 0 && g.bas[j] <= pb && pb <= g.haut[j] && (g.bids[j * H + r] >= vS || g.asks[j * H + r] >= vS);
      if (ok) { k++; if (k > n) { n = k; c = j - k + 1; } } else k = 0;
    }
    return { n, c };
  };
  /** La barre d'une ligne de pixels qui couvre les rangées [ja, jb] : la PLUS GRANDE part parmi
   *  elles (la règle de la chaleur : rien ne disparaît entre deux pixels). Les rangées assez
   *  observées (≥ minObs colonnes) passent d'abord ; sinon la plus grande part des autres, hachurée.
   *  null si aucune rangée n'est observée. */
  BM.barrePresence = function (pr, ja, jb, c0, c1, minObs) {
    let best = null, bestPeu = null;
    for (let pb = ja; pb <= jb; pb++) {
      const f = BM.presenceFenetre(pr, pb, c0, c1);
      if (!f.obs) continue;
      const part = f.pres / f.obs, x = { pb, part, obs: f.obs, pres: f.pres, presB: f.presB, presA: f.presA };
      if (f.obs >= minObs) { if (!best || part > best.part) best = x; } else if (!bestPeu || part > bestPeu.part) bestPeu = x;
    }
    if (best) { best.peu = false; return best; }
    if (bestPeu) { bestPeu.peu = true; return bestPeu; }
    return null;
  };

  // ─── Rafales au marché : exécutions d'une même milliseconde, d'un même côté ───
  /** Une RAFALE : la plus longue suite d'exécutions (aggTrades) d'identifiants `a` consécutifs, de
   *  même instant `T` (ms) et de même côté `m` (m = false : achat au marché). MESURÉ.
   *  Ce n'est PAS « un ordre » : une exécution agrégée est le remplissage d'UN ordre preneur à UN
   *  prix, et un ordre ne parcourt les prix que dans un sens (vers le haut pour un achat). Donc
   *  ordresMin = 1 + le nombre de pas où le prix N'AVANCE PAS strictement dans le sens du preneur
   *  est une borne basse PROUVÉE ; deux ordres qui avancent l'un après l'autre sont, eux,
   *  indiscernables d'un seul : le nombre exact n'est pas publié.
   *  q8 : la quantité en unités de 1e-8 BTC (entier exact) — la conservation se contrôle au bit. */
  BM.RAFALES = { seuilsBtc: [1, 2, 5, 10, 25], defautBtc: 2, gardeBtc: 0.5, gardeMs: 6 * 3600e3, liste: 20 };
  BM.TEXTE_RAFALES = 'une rafale peut réunir plusieurs ordres ; ≥ k est prouvé, le nombre exact n\'est pas publié';
  const q8De = s => Math.round(+s * 1e8);
  /** Une exécution seule, comme rafale. */
  BM.rafaleUnitaire = function (t) {
    const p = +t.p, q8 = q8De(t.q), q = q8 / 1e8;
    return { aDeb: t.a, aFin: t.a, T: t.T, achat: !t.m, q8, quote: p * q, pMin: p, pMax: p, prix: new Set([p]), n: 1,
      pDeb: p, pFin: p, ordres: 1, repetes: 0, reculs: 0, seqDeb: q8, seqFin: q8, seqMax: q8 };
  };
  /** Les deux rafales se suivent-elles (A juste avant B) ? */
  BM.rafalesContigues = (A, B) => A.aFin + 1 === B.aDeb && A.T === B.T && A.achat === B.achat;
  /** A (plus ancienne) + B (contiguës) -> une rafale ; A est modifiée et rendue. Le pas A.pFin ->
   *  B.pDeb décide si la séquence qui finit A continue dans B. */
  BM.fusionnerRafales = function (A, B) {
    const avance = A.achat ? B.pDeb > A.pFin : B.pDeb < A.pFin;
    if (!avance) { if (B.pDeb === A.pFin) A.repetes++; else A.reculs++; }
    const pont = avance ? A.seqFin + B.seqDeb : 0;
    const seqDeb = avance && A.ordres === 1 ? A.q8 + B.seqDeb : A.seqDeb;
    const seqFin = avance && B.ordres === 1 ? A.seqFin + B.q8 : B.seqFin;
    A.seqMax = Math.max(A.seqMax, B.seqMax, pont);
    A.seqDeb = seqDeb; A.seqFin = seqFin;
    A.ordres = A.ordres + B.ordres - (avance ? 1 : 0);
    A.repetes += B.repetes; A.reculs += B.reculs;
    A.aFin = B.aFin; A.q8 += B.q8; A.quote += B.quote; A.n += B.n; A.pFin = B.pFin;
    if (B.pMin < A.pMin) A.pMin = B.pMin;
    if (B.pMax > A.pMax) A.pMax = B.pMax;
    for (const p of B.prix) A.prix.add(p);
    return A;
  };
  /** Rafales d'une suite d'exécutions triées par identifiant. */
  BM.grouperRafales = function (trades) {
    const out = [];
    for (const t of trades) {
      const u = BM.rafaleUnitaire(t), d = out[out.length - 1];
      if (d && BM.rafalesContigues(d, u)) BM.fusionnerRafales(d, u); else out.push(u);
    }
    return out;
  };
  /** Ce qu'une rafale rend lisible (q en BTC, vwap, nombre de prix). */
  BM.lireRafale = function (r) {
    return { T: r.T, achat: r.achat, q: r.q8 / 1e8, quote: r.quote, vwap: r.quote / (r.q8 / 1e8), pMin: r.pMin, pMax: r.pMax,
      nPrix: r.prix ? r.prix.size : r.nPrix, n: r.n, ordresMin: r.ordres, repetes: r.repetes, reculs: r.reculs, plusLongueSequence: r.seqMax / 1e8, aDeb: r.aDeb, aFin: r.aFin };
  };
  /** Les rafales d'une séance : alimentées vers l'avant (le direct) et vers l'arrière (pages du
   *  remplissage arrière, chacune triée mais plus ancienne que tout ce qui est déjà là). Les deux
   *  bords restent OUVERTS (une page suivante peut les prolonger, même petits) ; une rafale close
   *  sous `gardeBtc` est oubliée, comme les exécutions après `gardeMs`. */
  BM.Rafales = function (garde) {
    this.garde8 = Math.round((garde === undefined ? BM.RAFALES.gardeBtc : garde) * 1e8);
    this.liste = [];            // triée par identifiant (donc par instant)
    this.arriereFini = false;
    this.version = 0;
  };
  const RF = BM.Rafales.prototype;
  /** Une rafale close sous le seuil de garde s'en va ; un bord ouvert reste (même petit). */
  RF.fermer = function (i) {
    const r = this.liste[i];
    if (!r) return;
    r.nPrix = r.prix.size; r.prix = null;          // la liste des prix ne sert qu'aux fusions
    if (r.q8 < this.garde8) this.liste.splice(i, 1);
  };
  /** Direct : une exécution PLUS RÉCENTE que toutes les autres. */
  RF.ajouter = function (t) {
    const u = BM.rafaleUnitaire(t), L = this.liste, d = L[L.length - 1];
    if (d && d.prix && BM.rafalesContigues(d, u)) BM.fusionnerRafales(d, u);
    else {
      if (d && t.a <= d.aFin) return false;          // déjà vue
      if (d && d.prix && (L.length > 1 || this.arriereFini)) this.fermer(L.length - 1);
      L.push(u);
    }
    this.version++;
    return true;
  };
  /** Remplissage arrière : une page (triée) plus ANCIENNE que la plus ancienne gardée. Sa dernière
   *  rafale est fusionnée avec la première gardée quand les identifiants se suivent et que T et m
   *  sont égaux : une rafale coupée par la limite d'une page n'est pas comptée deux fois. */
  RF.ajouterAncien = function (trades) {
    const L = this.liste, p0 = L[0];
    const page = BM.grouperRafales(p0 ? trades.filter(t => t.a < p0.aDeb) : trades);
    if (!page.length) return;
    if (p0 && p0.prix && BM.rafalesContigues(page[page.length - 1], p0)) {
      BM.fusionnerRafales(page[page.length - 1], p0);
      L.shift();
    } else if (p0 && p0.prix && L.length > 1) this.fermer(0);
    // Les rafales de la page sont closes, sauf la plus ancienne (bord arrière) ; la dernière est
    // close aussi quand elle n'est pas le bord avant.
    const n = page.length;
    this.liste = page.concat(this.liste);
    for (let i = n - 1; i >= 1; i--) if (this.liste[i] !== this.liste[this.liste.length - 1]) this.fermer(i);
    this.version++;
  };
  /** Le remplissage arrière est fini : le bord arrière est clos. */
  RF.finArriere = function () {
    this.arriereFini = true;
    if (this.liste.length > 1 && this.liste[0].prix) { this.fermer(0); this.version++; }
  };
  /** Oublie les rafales d'avant `avantMs`. */
  RF.purger = function (avantMs) {
    let k = 0;
    while (k < this.liste.length - 1 && this.liste[k].T < avantMs) k++;
    if (k) {
      this.liste.splice(0, k); this.arriereFini = true;
      if (this.liste.length > 1 && this.liste[0].prix) this.fermer(0);
      this.version++;
    }
  };
  /** Indice de la première rafale d'instant ≥ t. */
  RF.depuis = function (t) {
    const L = this.liste;
    let lo = 0, hi = L.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (L[m].T < t) lo = m + 1; else hi = m; }
    return lo;
  };
  /** Rafales d'instant dans [ta, tb[ et de taille ≥ minBtc. */
  RF.dans = function (ta, tb, minBtc) {
    const L = this.liste, m8 = Math.round(minBtc * 1e8), out = [];
    for (let i = this.depuis(ta); i < L.length && L[i].T < tb; i++) if (L[i].q8 >= m8) out.push(L[i]);
    return out;
  };
  /** Les k dernières rafales ≥ minBtc (la plus récente d'abord). */
  RF.dernieres = function (k, minBtc) {
    const L = this.liste, m8 = Math.round(minBtc * 1e8), out = [];
    for (let i = L.length - 1; i >= 0 && out.length < k; i--) if (L[i].q8 >= m8) out.push(L[i]);
    return out;
  };

  // ─── Destin des murs : ce que deviennent les gros niveaux du carnet ──────────
  // Un carnet REST ne porte pas d'heure : la lecture i décrit un instant tᵢ quelque part dans
  // [sᵢ, rᵢ] (envoi, réception, heure LOCALE), placé à l'heure Binance par l'écart ± u de
  // BM.Horloge. Entre deux lectures i et j, à un prix p exact et d'un côté :
  //   q₁ = q₀ + ajouté − annulé − échangé, et échangé ≤ X_W  ⇒  annulé ≥ q₀ − q₁ − X_W.
  // retireMin = max(0, Δ − X_W) est donc une borne BASSE MESURÉE de ce qui a été retiré (annulé
  // ou réduit) ; X_N est échangé à coup sûr, X_W − X_N est « incertain ». Ce ne sont que des
  // variations NETTES : un ordre posé puis annulé entre deux lectures ne se voit pas. Rien ne dit
  // POURQUOI un ordre est retiré : le calque décrit, il n'attribue aucune intention.
  BM.MURS = {
    seuilsBtc: [2, 5, 10, 25], defautBtc: 5,
    ecartCadences: 2,          // envoi j − réception i > 2 cadences : « interrompu »
    attenteMaxMs: 30e3,        // transition qui attend encore ses exécutions après 30 s : « interrompu »
    uAlerteMs: 500,            // horloge plus incertaine : la pastille le signale
    anneauMs: 120e3,           // exécutions gardées pour les bilans
    gardeMs: 6 * 3600e3, gardeNiveaux: 20000,
    pxMin: 2,                  // vue large : un trait plus court n'est pas dessiné (sa fin est comptée)
  };
  BM.FINS_MURS = {
    retire: { s: '✕', t: 'retiré', d: 'disparu sans aucune exécution à ce prix, même dans la fenêtre large' },
    echange: { s: '●', t: 'échangé', d: 'exécutions certaines à ce prix ≥ la taille lue' },
    partiel: { s: '◐', t: 'en partie', d: 'exécutions certaines à ce prix, moins que la taille lue' },
    incertain: { s: '?', t: 'incertain', d: 'exécutions à ce prix seulement dans la fenêtre large (horloge, durée des requêtes)' },
    bande: { s: '↕', t: 'sortie de la bande', d: 'le prix n\'est plus dans les niveaux lus : on ne sait pas' },
    interrompu: { s: '⋯', t: 'interrompu', d: 'lectures ou exécutions manquantes : rien n\'est classé ni compté' },
    la: { s: '→', t: 'toujours là', d: 'présent à la dernière lecture' },
    attente: { s: '…', t: 'en attente', d: 'attend que les exécutions de l\'intervalle soient toutes lues' },
  };
  BM.TEXTE_MURS = 'variations NETTES entre deux lectures : un ordre posé puis annulé entre deux lectures est invisible';
  BM.cents = p => Math.round(+p * 100);

  /** Une lecture brute (`depth` de Binance) en niveaux au prix EXACT (cents) : quantités par côté,
   *  bande lue (plus bas bid, plus haut ask) et niveaux ≥ seuil. */
  BM.niveauxSuivis = function (depth, seuil) {
    const b = new Map(), a = new Map(), gros = [];
    let bas = null, haut = null;
    for (const [p, q] of depth.bids || []) { const c = BM.cents(p), x = +q; if (!(x > 0)) continue; b.set(c, x); if (bas === null || c < bas) bas = c; if (x >= seuil) gros.push({ cote: 'b', c, q: x }); }
    for (const [p, q] of depth.asks || []) { const c = BM.cents(p), x = +q; if (!(x > 0)) continue; a.set(c, x); if (haut === null || c > haut) haut = c; if (x >= seuil) gros.push({ cote: 'a', c, q: x }); }
    return { b, a, bas, haut, gros, id: depth.lastUpdateId };
  };
  /** Fenêtres (heure Binance) entre la lecture i et la lecture j. N : ouverte des deux côtés (une
   *  exécution de la même milliseconde que l'instantané peut être d'un côté ou de l'autre) ; W :
   *  fermée. N peut être vide. */
  BM.fenetresMurs = function (si, ri, sj, rj, off, u) {
    return { N: [ri + off + u, sj + off - u], W: [si + off - u, rj + off + u] };
  };
  /** Indice de la première exécution d'instant ≥ T (exécutions triées par identifiant, donc par T). */
  const premiereDes = (tr, T) => { let lo = 0, hi = tr.length; while (lo < hi) { const m = (lo + hi) >> 1; if (tr[m].T < T) lo = m + 1; else hi = m; } return lo; };
  /** Le bilan d'une transition i → j. `prev` = { s, r, niveaux: [{ cote, c, q, aT }] } (q = taille
   *  lue en i, aT = dernier identifiant déjà compté pour ce niveau) ; `cur` = BM.niveauxSuivis + { s, r } ;
   *  `trades` = [{ a, T, c, q, m }] triées. Un bid n'est touché que par m === true (vendeur au
   *  marché), un ask que par m === false ; au prix EXACT seulement. Rend la fenêtre et, par niveau :
   *  q₁, dehors (hors de la bande de j), xN, xW, xU (part de W hors N pas encore comptée), retireMin, fin. */
  BM.bilanNiveaux = function (prev, cur, trades, horloge, opts) {
    const off = horloge.ecart, u = horloge.u || 0, F = BM.fenetresMurs(prev.s, prev.r, cur.s, cur.r, off, u);
    const cle = (cote, c) => cote + c, idx = new Map();
    const ent = prev.niveaux.map((n, k) => {
      const dehors = n.cote === 'b' ? cur.bas === null || n.c < cur.bas : cur.haut === null || n.c > cur.haut;
      const q1 = dehors ? null : ((n.cote === 'b' ? cur.b : cur.a).get(n.c) || 0);
      idx.set(cle(n.cote, n.c), k);
      return { cote: n.cote, c: n.c, q0: n.q, q1, dehors, xN: 0, xW: 0, xU: 0, aMax: n.aT === undefined ? -Infinity : n.aT, aT: n.aT === undefined ? -Infinity : n.aT, horsN: [], wMax: -Infinity };
    });
    if (trades) {
      for (let i = premiereDes(trades, F.W[0]); i < trades.length && trades[i].T <= F.W[1]; i++) {
        const t = trades[i], k = idx.get(cle(t.m ? 'b' : 'a', t.c));
        if (k === undefined) continue;
        const e = ent[k];
        e.xW += t.q;
        if (t.T > F.N[0] && t.T < F.N[1]) e.xN += t.q;
        else { e.horsN.push(t); if (t.a > e.aT) e.xU += t.q; }     // hors N : compté une seule fois, même si deux W se recouvrent
        if (t.a > e.aMax) e.aMax = t.a;
        if (t.a > e.wMax) e.wMax = t.a;
      }
    }
    const eps = (opts && opts.eps) || 1e-9;
    for (const e of ent) {
      if (e.dehors) { e.fin = 'bande'; e.retireMin = 0; continue; }
      e.retireMin = Math.max(0, e.q0 - e.q1 - e.xW);
      if (e.retireMin < eps) e.retireMin = 0;
      e.fin = e.q1 > 0 ? null : BM.finMur(e.q0, e.xN, e.xW, eps);
    }
    return { F, ent };
  };
  /** La marque de fin d'un niveau disparu (q₁ = 0), de sa taille q₀ et des exécutions X_N ⊂ X_W. */
  BM.finMur = function (q0, xN, xW, eps) {
    eps = eps || 1e-9;
    if (!(xW > eps)) return 'retire';
    if (xN >= q0 - eps) return 'echange';
    if (xN > eps) return 'partiel';
    return 'incertain';
  };

  /** Le suivi, lecture après lecture. Heures LOCALES pour s / r (l'écart est appliqué au bilan, avec
   *  l'horloge du moment). Une transition n'est classée qu'une fois les exécutions COMPLÈTES jusqu'à
   *  rⱼ + 2u (heure locale d'envoi d'une requête d'exécutions qui a rendu moins d'une page) : sans
   *  cette attente, une exécution pas encore lue gonflerait le retrait et la borne ne tiendrait plus. */
  // Plusieurs seuils À LA FOIS (`seuils`, liste ou nombre) : un niveau compte pour le seuil X à partir
  // de la première lecture où il atteint X — exactement ce qu'un suivi au seuil X seul compterait. Le
  // réglage choisit donc lequel MONTRER, sans rien remettre à zéro ni changer une valeur.
  BM.SuiviMurs = function (seuils, cadence) {
    seuils = [].concat(seuils).slice().sort((a, b) => a - b);
    const tot = () => ({ retire: 0, echange: 0, incertain: 0, depuis: null });
    const totaux = seuils.map(tot);
    Object.assign(this, {
      seuils, seuil: seuils[0], cadence, prec: null, dernierId: null, actifs: new Map(), niveaux: [], attente: [],
      trades: [], couvert: Infinity, complet: -Infinity,
      totaux, total: totaux[0], derniere: null, version: 0, surTransition: null,
    });
  };
  const SM = BM.SuiviMurs.prototype;
  /** Une exécution (aggTrade de Binance), dans l'ordre des identifiants. */
  SM.execution = function (x) {
    const T = +x.T;
    if (this.couvert === Infinity) this.couvert = T;      // rien n'est lu avant la première
    this.trades.push({ a: +x.a, T, c: BM.cents(x.p), q: +x.q, m: !!x.m });
    if (this.trades.length > 4096 && this.trades[0].T < T - BM.MURS.anneauMs) {
      const k = premiereDes(this.trades, T - BM.MURS.anneauMs);
      this.trades.splice(0, k);
      this.couvert = Math.max(this.couvert, this.trades[0].T);
    }
  };
  /** Exécutions lues sans trou jusqu'à l'envoi `sLocal` d'une requête qui a rendu moins d'une page. */
  SM.completes = function (sLocal) { if (sLocal > this.complet) this.complet = sLocal; };
  /** Exécutions sautées jusqu'à T (heure Binance) : rien avant n'est classé. */
  SM.trou = function (T) { this.couvert = Math.max(this.couvert === Infinity ? T : this.couvert, T); };
  const finir = (n, f, t) => { n.fin = f; if (t !== undefined) n.tFin = t; };
  /** Lecture `depth` (brute) reçue entre s et r. Rend 'ok', 'perimee' ou 'interrompu' (écart). */
  SM.lecture = function (depth, s, r, horloge) {
    const id = depth.lastUpdateId;
    if (id !== undefined && id !== null && this.dernierId !== null && !(id > this.dernierId)) return 'perimee';
    if (id !== undefined && id !== null) this.dernierId = id;
    const cur = BM.niveauxSuivis(depth, this.seuil), t = (s + r) / 2;
    cur.s = s; cur.r = r;
    let res = 'ok';
    if (this.prec && s - this.prec.r > BM.MURS.ecartCadences * this.cadence) { this.interrompre(); res = 'interrompu'; }
    if (this.total.depuis === null) for (const x of this.totaux) x.depuis = t;
    if (this.prec && this.actifs.size) {
      const niv = [...this.actifs.values()];
      const { ent } = BM.bilanNiveaux({ s: this.prec.s, r: this.prec.r, niveaux: niv }, cur, null, horloge);
      const items = [];
      ent.forEach((e, k) => {
        const n = niv[k];
        if (e.dehors) { finir(n, 'bande', t); this.actifs.delete(n.k); return; }       // q₁ inconnu : ni classé ni compté
        items.push({ n, q0: e.q0, q1: e.q1, qMax: n.qMax });     // qMax AVANT : les seuils déjà atteints
        n.tFin = t;
        if (e.q1 > 0) { n.q = e.q1; if (e.q1 > n.qMax) { n.qMax = e.q1; this.atteints(n, t); } }
        else { n.fin = 'attente'; this.actifs.delete(n.k); }
      });
      if (items.length) this.attente.push({ s: this.prec.s, r: this.prec.r, sj: s, rj: r, items, b: cur.b, a: cur.a, bas: cur.bas, haut: cur.haut });
    }
    for (const g of cur.gros) {
      const k = g.cote + g.c;
      if (this.actifs.has(k)) continue;
      // Entré dans la bande lue (hors de celle de la lecture d'avant, ou à un cent de son bord) : il était
      // peut-être déjà là, hors de vue — « vu en entrant », jamais « apparu ».
      const p0 = this.prec, entre = !!p0 && (g.cote === 'b' ? p0.bas === null || g.c <= p0.bas + 1 : p0.haut === null || g.c >= p0.haut - 1);
      const n = { k, cote: g.cote, c: g.c, t0: t, tFin: t, q: g.q, qMax: g.q, retire: 0, echange: 0, incertain: 0, aT: -Infinity, fin: null, entre,
        t0s: this.seuils.map(() => null), par: this.seuils.map(() => ({ retire: 0, echange: 0, incertain: 0 })), aTs: this.seuils.map(() => -Infinity) };
      this.atteints(n, t);
      this.actifs.set(k, n); this.niveaux.push(n);
    }
    this.prec = { s, r, bas: cur.bas, haut: cur.haut };
    this.derniere = r;
    this.avancer(horloge, r);
    this.purger(t);
    this.version++;
    return res;
  };
  /** Premier instant où le niveau atteint chaque seuil. */
  SM.atteints = function (n, t) { this.seuils.forEach((x, k) => { if (n.t0s[k] === null && n.qMax >= x) n.t0s[k] = t; }); };
  /** Indice du seuil x (le plus grand ≤ x). */
  SM.indice = function (x) { let k = 0; this.seuils.forEach((v, i) => { if (v <= x) k = i; }); return k; };
  /** Classe les transitions dont les exécutions sont complètes ; une attente de plus de 30 s
   *  interrompt tout (les exécutions manquent). */
  SM.avancer = function (horloge, maintenantLocal) {
    let change = false;
    while (this.attente.length) {
      const p = this.attente[0], u = horloge.u;
      if (u !== null && u !== undefined && this.complet >= p.rj + 2 * u) {
        this.attente.shift(); change = true;
        if (p.s + horloge.ecart - u < this.couvert) { this.interrompre(p); continue; }   // exécutions d'avant le début lu
        this.classer(p, horloge);
        continue;
      }
      if (maintenantLocal - p.rj > BM.MURS.attenteMaxMs) { this.interrompre(p); change = true; }
      break;
    }
    if (change) this.version++;
    return change;
  };
  SM.classer = function (p, horloge) {
    const niveaux = p.items.map(it => ({ cote: it.n.cote, c: it.n.c, q: it.q0, aT: it.n.aT }));
    const { F, ent } = BM.bilanNiveaux({ s: p.s, r: p.r, niveaux }, { s: p.sj, r: p.rj, b: p.b, a: p.a, bas: p.bas, haut: p.haut }, this.trades, horloge);
    ent.forEach((e, k) => {
      const n = p.items[k].n;
      n.retire += e.retireMin; n.echange += e.xN; n.incertain += e.xU; n.aT = e.aMax;
      this.seuils.forEach((x, i) => {
        if (p.items[k].qMax < x) return;
        // « Incertain » dédoublonné par seuil : un suivi au seuil x seul n'aurait rien compté avant.
        let xU = 0;
        for (const t of e.horsN) if (t.a > n.aTs[i]) xU += t.q;
        if (e.wMax > n.aTs[i]) n.aTs[i] = e.wMax;
        for (const o of [this.totaux[i], n.par[i]]) { o.retire += e.retireMin; o.echange += e.xN; o.incertain += xU; }
      });
      if (e.q1 === 0 && n.fin === 'attente') n.fin = e.fin;
      if (this.surTransition) this.surTransition(e, F, p);
    });
  };
  /** Ferme tout ce qui est suivi comme « interrompu » (rien n'est classé ni compté) ; avec `p`,
   *  aussi les transitions en attente (leurs exécutions manquent). */
  SM.interrompre = function (p) {
    for (const n of this.actifs.values()) finir(n, 'interrompu');
    this.actifs.clear();
    this.prec = null;
    if (p) {
      for (const q of [p, ...this.attente]) for (const it of q.items) if (it.n.fin === 'attente') it.n.fin = 'interrompu';
      this.attente = [];
    }
    this.version++;
  };
  SM.purger = function (t) {
    const lim = t - BM.MURS.gardeMs, L = this.niveaux;
    let k = 0;
    while (k < L.length && (L[k].fin !== null && L[k].fin !== 'attente' && L[k].tFin < lim || L.length - k > BM.MURS.gardeNiveaux && L[k].fin !== null && L[k].fin !== 'attente')) k++;
    if (k) L.splice(0, k);
  };
  /** Marque d'un niveau : sa fin, ou « toujours là ». */
  SM.marque = n => (n.fin === null ? 'la' : n.fin);

  /** Une lecture (carnet, bid / ask) vaut jusqu'à la suivante, mais pas plus de 3 cadences
   *  (+ 1 s) : au-delà, c'est une vraie absence — non observé, hachuré, ligne coupée. */
  BM.VALIDITE = { cadences: 3, margeMs: 1000 };
  BM.validiteLecture = function (cadence) { return BM.VALIDITE.cadences * cadence + BM.VALIDITE.margeMs; };

  // ─── Âges et formats ───────────────────────────────────────────────────────
  BM.age = function (ms) {
    if (!(ms >= 0)) return '—';
    if (ms < 10000) return (ms / 1000).toFixed(1).replace('.', ',') + ' s';
    if (ms < 60000) return Math.round(ms / 1000) + ' s';
    const m = Math.floor(ms / 60000);
    if (m < 60) return m + ' min';
    const h = Math.floor(m / 60), r = m % 60;
    return h + ' h ' + String(r).padStart(2, '0');
  };
  /** Jour court (« lun. 06 »), pour les graduations d'une vue qui passe minuit. */
  BM.jour = function (ms) {
    const d = new Date(ms);
    return ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'][d.getDay()] + ' ' + String(d.getDate()).padStart(2, '0');
  };
  BM.heure = function (ms, sec) {
    const d = new Date(ms);
    const p = n => String(n).padStart(2, '0');
    return p(d.getHours()) + ':' + p(d.getMinutes()) + (sec ? ':' + p(d.getSeconds()) : '');
  };
  // Formateurs gardés : toLocaleString(…, options) en construit un à CHAQUE appel (≈ 1 ms par image
  // pour les graduations et les pastilles). Mêmes chaînes.
  const FORMATS = new Map();
  BM.nombre = function (v, min, max) {
    const k = min * 32 + max;
    let f = FORMATS.get(k);
    if (!f) FORMATS.set(k, f = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: min, maximumFractionDigits: max }));
    return f.format(v);
  };
  BM.prix = function (p, dec) {
    if (p === null || p === undefined || !isFinite(p)) return '—';
    return BM.nombre(p, dec || 0, dec || 0);
  };
  BM.btc = function (q) {
    if (!isFinite(q)) return '≥ ' + q;
    if (q >= 100) return BM.nombre(Math.round(q), 0, 0);
    if (q >= 10) return q.toFixed(1).replace('.', ',');
    if (q >= 1) return q.toFixed(2).replace('.', ',');
    return q.toFixed(3).replace('.', ',');
  };
  /** Décimales qu'il faut pour écrire un pas EXACTEMENT (2,5 → 1 ; 0,25 → 2 ; 20 → 0) : une
   *  graduation de 2,5 $ écrite sans décimale montre un prix qui n'est pas le sien. */
  BM.decimales = function (pas) {
    for (let d = 0; d < 6; d++) { const x = pas * Math.pow(10, d); if (Math.abs(x - Math.round(x)) < 1e-6 * Math.max(1, x)) return d; }
    return 6;
  };
  /** Bulles d'exécutions : surface ∝ volume, ENTRE deux bornes — rayon plancher (lisible) et
   *  plafond (une bulle ne couvre pas la carte). Les bornes en BTC se déduisent de ces constantes ;
   *  la légende les écrit (BM.bornesBulles), elle ne promet pas une proportion qui n'existe pas. */
  BM.BULLES = { rMin: 1, rMax: 28, k: 3.2 };
  BM.rayonBulle = function (q, echelle) {
    return Math.min(BM.BULLES.rMax, Math.max(BM.BULLES.rMin, BM.BULLES.k * Math.sqrt(q) * (echelle || 1)));
  };
  /** Volumes (BTC) entre lesquels la surface d'une bulle est proportionnelle à son volume. */
  BM.bornesBulles = function (echelle) {
    const k = BM.BULLES.k * (echelle || 1);
    return { min: Math.pow(BM.BULLES.rMin / k, 2), max: Math.pow(BM.BULLES.rMax / k, 2) };
  };
  /** Contraste de la palette : seuil bas et saturation APPLIQUÉS (la saturation ne peut pas
   *  descendre sous le seuil + 1). La légende écrit ces valeurs-là, pas celles des curseurs. */
  BM.bornesContraste = function (seuilBas, saturation) { return { bas: seuilBas, haut: Math.max(seuilBas + 1, saturation) }; };
  /** Réglages lus du stockage local, VALIDÉS : une valeur hors des listes permises (palette
   *  renommée, fusion 3, tranche 0, « abc »…) est remplacée par le défaut — elle n'est ni
   *  appliquée en silence, ni fatale à la page. regles : { clé: { liste, nombre } | { min, max,
   *  entier } } ; les clés inconnues sont ignorées. Rend { reglages, rejets }. */
  BM.validerReglages = function (stocke, defauts, regles) {
    const o = JSON.parse(JSON.stringify(defauts)), r = stocke && typeof stocke === 'object' && !Array.isArray(stocke) ? stocke : {}, rejets = [];
    for (const [k, regle] of Object.entries(regles)) {
      if (!(k in r) || !regle) continue;
      const v = r[k];
      if (regle.liste) {
        const x = regle.nombre ? Number(v) : v;
        if ((typeof v === 'string' || typeof v === 'number') && (!regle.nombre || isFinite(x)) && regle.liste.includes(String(x))) o[k] = x; else rejets.push(k);
      } else {
        const x = typeof v === 'number' ? v : NaN;
        if (isFinite(x) && x >= regle.min && x <= regle.max && (!regle.entier || Number.isInteger(x))) o[k] = x; else rejets.push(k);
      }
    }
    if (r.calques && typeof r.calques === 'object') {
      for (const k of Object.keys(defauts.calques || {})) {
        if (!(k in r.calques)) continue;
        if (typeof r.calques[k] === 'boolean') o.calques[k] = r.calques[k]; else rejets.push('calques.' + k);
      }
    }
    return { reglages: o, rejets };
  };
  /** Un pas « rond » pour les graduations d'axe : 1, 2, 2,5, 5 × 10ⁿ ≥ brut (décimales : BM.decimales).
   *  Pour REGROUPER des tranches, c'est BM.pasMultiple (jamais 2,5 sur 1 $). */
  BM.pasRond = function (brut) {
    const e = Math.pow(10, Math.floor(Math.log10(brut)));
    for (const m of [1, 2, 2.5, 5, 10]) if (m * e >= brut) return m * e;
    return 10 * e;
  };

  // ─── Guide : la carte DITE EN MOTS, pour qui la découvre ───────────────────
  // Le guide ne mesure rien de neuf : il relit ce que la carte montre déjà (dernier carnet live,
  // suivi des murs, rafales, carte publiée, fichier de 15 min) et l'écrit en phrases.
  //  · Il DÉCRIT ce qui est posé ou échangé ; il ne dit ni pourquoi, ni ce qui va suivre. Un mur
  //    peut être retiré à tout moment : « beaucoup d'ordres d'achat en attente » n'est pas une
  //    promesse, et le mot « support » n'est jamais employé.
  //  · Une phrase ne lit qu'UNE cadence : le résumé ne lit que le dernier carnet live (son prix de
  //    référence est le milieu meilleur bid / meilleur ask de CETTE lecture) ; un mur du fichier de
  //    15 min écrit son heure de lecture.
  //  · Ce qui n'a pas été observé (hors de la bande lue, lecture manquée) n'est jamais compté 0 :
  //    la série s'arrête et le texte dit « au moins », ou « rien à comparer ».
  //  · Chaque seuil ci-dessous est une CONVENTION de ce code : la légende l'écrit (tirée d'ici).
  //  · Les heures du guide sont en UTC, et le disent.
  BM.GUIDE = {
    trancheUsd: 20,          // tranche des murs « en mots » : celle de la carte publiée et des murs du fichier
    murMinBtc: 10,           // une tranche n'est « mur » qu'à 10 BTC au moins…
    murFacteur: 2,           // … ET 2 fois la tranche médiane de la bande lue : le carnet ordinaire n'est pas un mur
    murSortiePart: 0.8,      // un mur déjà nommé le reste jusqu'à 80 % de ce seuil (il ne clignote pas d'une lecture à l'autre)
    seuilLectures: 15,       // la médiane du seuil est celle des 15 dernières lectures contiguës (≈ 30 s) : elle ne saute pas à chaque lecture
    margeTranches: 1,        // la tranche du prix et sa voisine de chaque côté ne sont jamais nommées (le carnet s'y reforme sans cesse)
    parCote: 2,              // murs nommés de chaque côté du prix (1 sur un écran étroit en mode débutant)
    procheMaxPct: 1,         // cherchés à ±1 % du prix au plus, et seulement dans la bande que le carnet lu couvre
    bandePct: 0.5,           // résumé : ordres comptés à ±0,5 % du prix (moins si le carnet lu ne va pas si loin)
    rapportNet: 1.1,         // en dessous de 1,1 fois, « à peu près autant » d'un côté que de l'autre
    fenetreMs: 10 * 60e3,    // « grossit » / « diminue » : variation sur 10 min
    varMinBtc: 3, varMinPart: 0.25,   // variation dite au-delà de 3 BTC ET de 25 % de la taille d'avant
    histoireMinMs: 10 * 60e3,         // un mur sans variation n'a une 2e ligne qu'au-delà de 10 min de présence
    trouMaxMs: 5 * 60e3,     // carte publiée → carnet live : au-delà de 5 min non observées, pas de raccord
    zoneTranches: 3,         // zone chargée : 3 tranches de 20 $ consécutives, sommées
    zoneMinBtc: 30, zoneFacteur: 1.5,  // au moins 30 BTC ET 1,5 fois la zone médiane de la bande lue
    zoneSortiePart: 0.75,    // une zone dessinée le reste tant qu'elle porte au moins 30 BTC et 75 % du seuil d'entrée du moment…
    zoneGarde: 3,            // … repassée en dessous, elle reste encore 3 lectures (elle ne clignote pas), puis s'efface
    vieMinMs: 10e3,          // un niveau vu moins de 10 s n'est ni « apparu » ni « retiré » au journal
    journalMurBtc: 10,       // journal : gros ordres d'au moins 10 BTC à un même prix (ou le seuil du destin s'il est plus haut)
    absorbePart: 0.5,        // « absorbé » / « en partie échangé » : seulement si les échanges font la moitié de la plus grande taille lue
    nommeLectures: 3,        // un mur nommé 3 lectures de suite peut faire un évènement (traversé, fondu, apparu)
    fondPart: 0.5,           // mur nommé qui « fond » : sous la moitié de sa taille ET sous le seuil
    apparuMaxMs: 2 * 60e3,   // mur nommé « apparu » : passé au-dessus du seuil depuis moins de 2 min, sous les yeux de la page
    rafaleBtc: 10,           // journal : rafales d'au moins 10 BTC (ou le seuil des rafales s'il est plus haut)
    suiteMaxMs: 5 * 60e3,    // prix passé un mur : les deux clôtures 1 min qui suivent sont attendues 5 min au plus
    journalMax: 12,          // lignes du panneau « Ce qui vient de se passer »
    journalGarde: 400,       // évènements gardés (marques sur la carte)
    journalFenetreMs: 30 * 60e3,   // à l'ouverture : les rafales des 30 dernières minutes
    fusionMs: 60e3,          // un même évènement au même prix dans la minute : compté (×n), pas répété
    marquePx: 9,             // marques du journal d'une même case de 9 px : une seule (×n au survol)
    textesDebutant: 2,       // mode débutant : 2 repères au plus sur la carte, un de chaque côté du prix
    tendanceMs: 15 * 60e3,   // mode débutant : « prix en hausse / en baisse / stable sur 15 min »…
    tendancePct: 0.1,        // … « stable » sous ±0,1 % de variation (convention)
    ageFraisMs: 5e3,         // mode débutant : sous 5 s, la ligne du haut dit « à jour » (elle ne change pas chaque seconde)
    sensGardeMs: 10e3,       // mode débutant : « plus d’achats / de ventes en attente » ne change qu'après 10 s du même autre côté
  };
  // Les symboles du journal qui ne sont pas ceux des fins de murs (BM.FINS_MURS) : la légende et la
  // carte les lisent ici.
  BM.SYMBOLES_GUIDE = {
    apparu: { s: '+', t: 'apparu' },
    fondu: { s: '−', t: 'mur nommé qui a fondu' },
    rafaleAchat: { s: '▲', t: 'rafale d\'achats au marché' },
    rafaleVente: { s: '▼', t: 'rafale de ventes au marché' },
    sous: { s: '↓', t: 'prix passé sous un mur d\'achat' },
    sur: { s: '↑', t: 'prix passé au-dessus d\'un mur de vente' },
    meche: { s: '↺', t: 'percé en mèche : la bougie a clôturé de l\'autre côté' },
    casse: { s: '‼', t: 'cassé selon la règle de travail : deux clôtures 1 min au-delà' },
    options: { s: '◇', t: 'niveau d\'options touché (modèle)' },
  };
  const NB = ' ';       // espace insécable : « 81 000 $ » ne se coupe pas avant le $
  const DOL = NB + '$';
  /** Heure UTC « 14:05 » (ou « 14:05:12 ») : le guide écrit ses heures en UTC. */
  BM.heureUtc = function (ms, sec) {
    const d = new Date(ms), p = n => String(n).padStart(2, '0');
    return p(d.getUTCHours()) + ':' + p(d.getUTCMinutes()) + (sec ? ':' + p(d.getUTCSeconds()) : '');
  };
  /** Le décalage de l'appareil sur UTC, en mots (« UTC+2 », « UTC−3:30 », « UTC »). */
  BM.fuseau = function (decalageMin) {
    const m = -decalageMin;
    if (!m) return 'UTC';
    const a = Math.abs(m);
    return 'UTC' + (m < 0 ? '−' : '+') + Math.floor(a / 60) + (a % 60 ? ':' + String(a % 60).padStart(2, '0') : '');
  };
  /** Un écart signé : « −0,20 % », « +0,12 % ». */
  BM.pourcent = function (x, dec) {
    if (!isFinite(x)) return '—';
    const d = dec === undefined ? 2 : dec;
    return (x < 0 ? '−' : '+') + BM.nombre(Math.abs(x), d, d) + ' %';
  };
  /** Une durée pour le guide : « moins d'une minute », « 12 min », « 1 h 10 » (pas de secondes : un
   *  débutant lit une ancienneté, pas un chronomètre). */
  BM.duree = ms => (ms === null || ms === undefined || !(ms >= 0) ? '—' : ms < 60e3 ? 'moins d\'une minute' : BM.age(ms));
  /** Un prix exact (2 décimales seulement s'il en a). */
  BM.prixExact = p => BM.prix(p, Math.abs(p - Math.round(p)) > 1e-6 ? 2 : 0);
  /** « 81 340–81 360 $ » : une tranche, le $ attaché. */
  const tranche = (p, pas) => BM.prix(p) + '–' + BM.prix(p + pas) + DOL;
  /** Deux lectures du carnet live se suivent-elles sans trou ? (la précédente reçue au plus une
   *  validité avant, aucune interruption dite par le suivi des murs) : sinon le guide ne compare
   *  rien entre elles (un passage serait daté de maintenant alors qu'il a eu lieu pendant le trou). */
  BM.lecturesContigues = (luAvant, lu, cadence, resMurs) => luAvant !== null && luAvant !== undefined && lu - luAvant <= BM.validiteLecture(cadence) && resMurs !== 'interrompu';
  /** Sommes d'un carnet (Map tranche de dp $ → Σ BTC) regroupées par tranches de f·dp $. */
  BM.regrouperTranches = function (m, f) {
    const out = new Map();
    for (const [pb, q] of m) { const k = Math.floor(pb / f); out.set(k, (out.get(k) || 0) + q); }
    return out;
  };
  /** Une lecture du carnet (BM.agregerCarnet : sb / sa = Σ par tranche de dp $) vue par le guide :
   *  tranches de `tr` $ (multiple de dp), prix de référence = milieu meilleur bid / meilleur ask de
   *  CETTE lecture, bande couverte [bas, haut] en $ = le plus bas bid et le plus haut ask LUS (pas le
   *  bord de leur tranche : une tranche à moitié lue n'est pas lue). null sans les deux côtés. */
  BM.carnetGuide = function (k, tr) {
    if (!k || !k.meilleurBid || !k.meilleurAsk || !k.sb || !k.sa) return null;
    const f = Math.max(1, Math.round((tr || BM.GUIDE.trancheUsd) / k.dp)), pas = f * k.dp;
    const bas = k.prixBas !== undefined && k.prixBas !== null ? k.prixBas : k.bas !== null && k.bas !== undefined ? k.bas * k.dp : null;
    const haut = k.prixHaut !== undefined && k.prixHaut !== null ? k.prixHaut : k.haut !== null && k.haut !== undefined ? (k.haut + 1) * k.dp : null;
    return { pas, dp: k.dp, sb: k.sb, sa: k.sa, b: BM.regrouperTranches(k.sb, f), a: BM.regrouperTranches(k.sa, f),
      mid: (k.meilleurBid + k.meilleurAsk) / 2, bas, haut };
  };
  const borne = (x, d) => (x === null || x === undefined ? d : x);
  /** Tranche k nommable ? Du bon côté, hors de la tranche du prix et de ses `margeTranches` voisines,
   *  et ENTIÈREMENT dans [lo, hi] (la bande lue, bornée à ±procheMaxPct). */
  const nommable = (C, cote, k, lo, hi, o) => {
    const kP = Math.floor(C.mid / C.pas);
    return cote === 'bid' ? k <= kP - 1 - o.margeTranches && k * C.pas > lo : k >= kP + 1 + o.margeTranches && (k + 1) * C.pas < hi;
  };
  /** Le seuil « mur » : max(murMinBtc, murFacteur × la tranche médiane de la bande lue, achat et
   *  vente ensemble, tranches vides comprises, hors tranche du prix). Cette médiane, sur ≈ 20 tranches,
   *  saute d'une lecture à l'autre : `o.medianes` (celles des lectures contiguës d'avant) la lisse —
   *  la médiane de ces médianes et de celle de la lecture. `sortie` : le seuil sous lequel un mur
   *  déjà nommé cesse de l'être (murSortiePart × seuil). { seuil, sortie, mediane (lissée),
   *  medianeLue (de cette lecture seule), n }. */
  BM.seuilMur = function (C, o) {
    o = Object.assign({}, BM.GUIDE, o);
    const vide = { seuil: o.murMinBtc, sortie: o.murMinBtc * o.murSortiePart, mediane: null, medianeLue: null, n: 0 };
    if (!C || C.bas === null || C.haut === null) return vide;
    const P = C.pas, kP = Math.floor(C.mid / P), xs = [];
    for (let k = Math.ceil(C.bas / P); k < kP; k++) xs.push(C.b.get(k) || 0);
    for (let k = kP + 1; (k + 1) * P <= C.haut; k++) xs.push(C.a.get(k) || 0);
    if (!xs.length) return vide;
    xs.sort((a, b) => a - b);
    const lue = xs[xs.length >> 1], ms = (o.medianes || []).filter(x => x !== null && x !== undefined).concat(lue).sort((a, b) => a - b);
    const med = ms[ms.length >> 1], seuil = Math.max(o.murMinBtc, o.murFacteur * med);
    return { seuil, sortie: seuil * o.murSortiePart, mediane: med, medianeLue: lue, n: xs.length };
  };
  /** Le seuil d'une tranche : celui d'entrée, ou celui de sortie si elle est déjà nommée
   *  (o.garder : clés « bid4999 » / « ask5002 » des murs nommés à la lecture d'avant). */
  const seuilTranche = (o, seuil, cote, k) => (o.garder && o.garder.has(cote + k) && o.sortie !== undefined ? Math.min(seuil, o.sortie) : seuil);
  /** Les `parCote` tranches les plus chargées de chaque côté (au moins le seuil « mur » ; un mur déjà
   *  nommé, o.garder : au moins le seuil de sortie o.sortie), à ±procheMaxPct du prix ET dans la bande lue, hors de la tranche du prix et de ses
   *  voisines : [{ cote: 'bid'|'ask', k, p (bas de la tranche), q }]. */
  BM.mursProches = function (C, o) {
    o = Object.assign({}, BM.GUIDE, o);
    if (!C) return [];
    const seuil = o.seuil !== undefined ? o.seuil : BM.seuilMur(C, o).seuil;
    const lo = Math.max(borne(C.bas, -Infinity), C.mid * (1 - o.procheMaxPct / 100)), hi = Math.min(borne(C.haut, Infinity), C.mid * (1 + o.procheMaxPct / 100));
    const choisir = (m, cote) => [...m].filter(([k, q]) => q >= seuilTranche(o, seuil, cote, k) && nommable(C, cote, k, lo, hi, o))
      .sort((x, y) => y[1] - x[1] || x[0] - y[0]).slice(0, o.parCote).map(([k, q]) => ({ cote, k, p: k * C.pas, q }));
    return choisir(C.b, 'bid').concat(choisir(C.a, 'ask'));
  };
  /** Le mur (au moins le seuil « mur ») le plus proche du prix d'un côté, dans la bande lue, hors de
   *  la tranche du prix et de ses voisines ; écart au prix de référence de la même lecture, en %
   *  (négatif sous le prix). null s'il n'y en a pas. */
  BM.murPlusProche = function (C, cote, o) {
    o = Object.assign({}, BM.GUIDE, o);
    if (!C) return null;
    const seuil = o.seuil !== undefined ? o.seuil : BM.seuilMur(C, o).seuil;
    const lo = borne(C.bas, -Infinity), hi = borne(C.haut, Infinity);
    let best = null;
    for (const [k, q] of (cote === 'bid' ? C.b : C.a)) {
      if (!(q >= seuilTranche(o, seuil, cote, k)) || !nommable(C, cote, k, lo, hi, o)) continue;
      if (!best || (cote === 'bid' ? k > best.k : k < best.k)) best = { cote, k, p: k * C.pas, pas: C.pas, q };
    }
    // Écart du bord de la tranche le plus proche du prix de référence.
    if (best) best.ecartPct = cote === 'bid' ? (best.p + C.pas - C.mid) / C.mid * 100 : (best.p - C.mid) / C.mid * 100;
    return best;
  };
  /** Le résumé d'UNE lecture du carnet live : Σ des ordres d'achat et de vente posés à ±bande % du
   *  prix — la bande est réduite à ce que le carnet lu couvre des DEUX côtés (1 000 niveaux ne vont
   *  souvent pas à ±0,5 %), et le résumé le dit. Une tranche compte si son milieu est dans la bande
   *  (les bids sont sous le prix et les asks au-dessus par construction : la tranche du prix compte
   *  ses bids ET ses asks). */
  BM.resumeCarnet = function (C, o) {
    o = Object.assign({}, BM.GUIDE, o);
    if (!C || C.bas === null || C.haut === null) return null;
    const couvert = Math.min(C.mid - C.bas, C.haut - C.mid) / C.mid * 100;
    const bande = Math.min(o.bandePct, couvert);
    if (!(bande > 0)) return null;
    const lo = C.mid * (1 - bande / 100), hi = C.mid * (1 + bande / 100);
    let qB = 0, qA = 0;
    for (const [pb, q] of C.sb) if ((pb + 0.5) * C.dp >= lo) qB += q;
    for (const [pb, q] of C.sa) if ((pb + 0.5) * C.dp <= hi) qA += q;
    const rapport = qA > 0 ? qB / qA : null;
    const sens = rapport === null ? (qB > 0 ? 'achat' : 'egal') : rapport >= o.rapportNet ? 'achat' : rapport <= 1 / o.rapportNet ? 'vente' : 'egal';
    return { bande, usd: C.mid * bande / 100, reduite: bande < o.bandePct, couvert, qB, qA, rapport, sens, mid: C.mid };
  };
  /** Écart au prix en mots : « 0,05 % sous le prix », « 0,03 % au-dessus du prix ». */
  const ecartMots = x => (Math.abs(x) < 0.005 ? 'à moins de 0,01 % du prix' : BM.nombre(Math.abs(x), 2, 2) + ' % ' + (x < 0 ? 'sous le prix' : 'au-dessus du prix'));
  /** La phrase du résumé (débutant) ou ses seuls chiffres (expert). `murs` = { bid, ask } de
   *  BM.murPlusProche, + seuil (BTC) ; `age` = âge de la lecture, déjà écrit. Une seule cadence : le
   *  carnet live. o.court : la version courte (écran étroit, ou phrase entière qui ne tient pas),
   *  qui dit « photo, pas une prévision » dès le début. Toujours : « photo de l'instant, pas une
   *  prévision » (une majorité d'ordres d'un côté ne dit pas où ira le prix). */
  BM.phraseResume = function (r, murs, mode, age, o) {
    o = Object.assign({}, BM.GUIDE, o);
    if (!r) return '';
    const mb = murs && murs.bid, ma = murs && murs.ask, seuil = murs && murs.seuil;
    const pct = BM.nombre(r.bande, 0, 2) + ' %', usd = BM.prix(r.usd);
    if (mode === 'expert') {
      const ec = m => BM.pourcent(m.ecartPct);
      return ['carnet live ' + age, '±' + pct + (r.reduite ? ' (bande lue)' : '') + ' : achat / vente ' + (r.rapport === null ? '—' : '×' + BM.nombre(r.rapport, 2, 2)) + ' (' + BM.btc(r.qB) + ' / ' + BM.btc(r.qA) + ' BTC)',
        'mur achat ' + (mb ? tranche(mb.p, mb.pas) + ' (' + ec(mb) + ')' : '—'), 'mur vente ' + (ma ? tranche(ma.p, ma.pas) + ' (' + ec(ma) + ')' : '—'),
      ].join(' · ');
    }
    if (o.court) {
      // « Photo, pas une prévision » tout de suite après l'âge : une ligne coupée les garde tous deux.
      return 'Carnet lu ' + age + ' (photo, pas une prévision) : achat ' + BM.btc(r.qB) + ' BTC / vente ' + BM.btc(r.qA) + ' BTC à ±' + usd + DOL + '. Murs proches : '
        + (mb ? BM.prix(mb.p) + DOL + ' (achat)' : 'aucun côté achat') + ' · ' + (ma ? BM.prix(ma.p) + DOL + ' (vente)' : 'aucun côté vente') + '.';
    }
    const x = v => BM.nombre(v, 1, 1);
    const compare = r.qB === 0 && r.qA === 0 ? 'aucun ordre lu'
      : r.rapport === null ? 'aucun ordre de vente lu'
        : { egal: 'à peu près autant de chaque côté', achat: x(r.rapport) + ' fois plus côté achat', vente: x(1 / r.rapport) + ' fois plus côté vente' }[r.sens];
    let s = 'Carnet lu ' + age + ', à ±' + pct + ' du prix (≈ ±' + usd + DOL + (r.reduite ? ' : tout ce que le carnet lu couvre' : '') + ') : '
      + BM.btc(r.qB) + ' BTC d\'ordres d\'achat, ' + BM.btc(r.qA) + ' BTC d\'ordres de vente — ' + compare + '. ';
    const aucun = c => 'aucune tranche nettement plus chargée que les autres côté ' + c;
    if (mb || ma) s += (mb ? 'Mur d\'achat le plus proche : ' + tranche(mb.p, mb.pas) + ' (' + ecartMots(mb.ecartPct) + ')' : aucun('achat').replace(/^a/, 'A'))
      + ' ; ' + (ma ? 'de vente : ' + tranche(ma.p, ma.pas) + ' (' + ecartMots(ma.ecartPct) + ')' : aucun('vente')) + '. ';
    else s += 'Pas de tranche nettement plus chargée que les autres' + (seuil ? ' (au moins ' + BM.btc(seuil) + ' BTC)' : '') + ' dans le carnet lu. ';
    // L'âge D'ABORD : une phrase coupée (écran étroit) le garde.
    return s + 'Photo de l\'instant, pas une prévision.';
  };
  // ─── Mode débutant : l'écran calme ─────────────────────────────────────────
  // Les MÊMES valeurs que l'expert, dites en mots simples et en peu de signes : une phrase en haut
  // (≤ 100 signes), deux repères au plus sur la carte (≤ 24 signes), le reste au toucher.
  /** Un âge en secondes ENTIÈRES, arrondi vers le haut (jamais plus jeune que la réalité) : le haut
   *  de l'écran change au plus une fois par seconde. Au-delà d'une minute : BM.age. */
  BM.ageEntier = ms => (!(ms >= 0) ? '—' : ms < 60e3 ? Math.max(1, Math.ceil(ms / 1000)) + ' s' : BM.age(ms));
  /** Le sens du prix sur tendanceMs (convention) : le dernier prix — `prix` = { p, t } lu en direct
   *  s'il est plus récent que le début de la dernière bougie, sinon la clôture de celle-ci —
   *  comparé à la clôture de la minute commencée tendanceMs plus tôt. Une minute manquante entre les
   *  deux, ou une dernière bougie qui ne touche pas le présent : null (rien n'est deviné).
   *  Rend { sens: 'hausse' | 'baisse' | 'stable', de, a, pct, depuis (début de la minute de
   *  référence), t (instant du prix comparé, null s'il n'est pas connu) }. */
  BM.tendancePrix = function (minutes, prix, maintenant, o) {
    o = Object.assign({}, BM.GUIDE, o);
    if (!minutes || !minutes.length || !isFinite(maintenant)) return null;
    const t0 = Math.floor((maintenant - o.tendanceMs) / 60e3) * 60e3;
    let i = minutes.length - 1;
    while (i >= 0 && minutes[i].t > t0) i--;
    if (i < 0 || minutes[i].t !== t0) return null;
    for (let j = i + 1; j < minutes.length; j++) if (minutes[j].t !== minutes[j - 1].t + 60e3) return null;
    const der = minutes[minutes.length - 1];
    if (der.t < Math.floor(maintenant / 60e3) * 60e3 - 60e3) return null;
    const vif = prix && isFinite(prix.p) && prix.p > 0 && isFinite(prix.t) && prix.t >= der.t;
    const de = minutes[i].c, a = vif ? prix.p : der.c;
    if (!(de > 0 && a > 0)) return null;
    const pct = (a - de) / de * 100;
    return { sens: Math.abs(pct) < o.tendancePct ? 'stable' : pct > 0 ? 'hausse' : 'baisse', de, a, pct, depuis: t0, t: vif ? prix.t : (o.lu !== undefined ? o.lu : null) };
  };
  const majuscule = s => s.charAt(0).toUpperCase() + s.slice(1);
  /** L'âge de la ligne du haut : « à jour » sous ageFraisMs (elle ne change pas chaque seconde),
   *  sinon « à jour il y a N s » (secondes entières) ; l'âge exact est dans le détail. */
  BM.ageLigne = (ms, o) => (ms >= 0 && ms < Object.assign({}, BM.GUIDE, o).ageFraisMs ? 'à jour' : 'à jour il y a ' + BM.ageEntier(ms));
  /** Le côté le plus chargé, tenu : un AUTRE côté ne remplace le côté dit qu'après sensGardeMs de
   *  lectures qui le disent toutes (la ligne ne bascule pas d'un mot à l'autre chaque seconde).
   *  h = l'état d'avant (ou null), sens = celui de la dernière lecture, t = son instant (ms). */
  BM.sensStable = function (h, sens, t, o) {
    o = Object.assign({}, BM.GUIDE, o);
    if (!sens) return h || { sens: null, cand: null, depuis: null };
    if (!h || !h.sens || h.sens === sens) return { sens, cand: null, depuis: null };
    if (h.cand !== sens) return { sens: h.sens, cand: sens, depuis: t };
    return t - h.depuis >= o.sensGardeMs ? { sens, cand: null, depuis: null } : h;
  };
  /** La ligne du haut en mode débutant : { long (≤ 100 signes), court (≤ 55) }.
   *    long  = « Prix 82 548 $, en hausse · plus d’achats en attente · à jour · pas une prévision »
   *    court = « Prix 82 548 $, en hausse · à jour · pas une prévision » (le prix tombe s'il ne tient pas)
   *  r = BM.resumeCarnet (null : pas encore de lecture) ; tendance = BM.tendancePrix (null : le
   *  morceau disparaît) ; ageMs = l'âge de la PLUS VIEILLE valeur de la ligne. etat : { guideCache,
   *  pauseMs (carnet plus frais : repères cachés), retardMs (échanges en retard), aucunRepere
   *  (aucun repère d'aucun côté), vide ('ask' | 'bid' : ce côté n'a pas de repère), prix (le dernier
   *  prix, celui de la pastille de l'axe) }. Le côté le plus chargé n'est dit que quand les DEUX
   *  côtés ont un repère : sinon la ligne dit le côté vide (elle ne contredit jamais la carte). */
  BM.phraseCarteDebutant = function (r, tendance, ageMs, etat, o) {
    o = Object.assign({}, BM.GUIDE, o);
    etat = etat || {};
    const une = t => ({ long: t, court: t });
    if (etat.guideCache) return une('Guide caché : bouton «' + NB + 'Guide' + NB + '» pour revoir les repères');
    if (etat.pauseMs !== undefined && etat.pauseMs !== null) return une('Ordres en attente non relus depuis ' + BM.ageEntier(etat.pauseMs) + ' · repères cachés');
    if (!r) return une('Lecture en cours…');
    const sens = tendance ? { hausse: 'en hausse', baisse: 'en baisse', stable: 'stable' }[tendance.sens] : null;
    const px = etat.prix > 0 ? 'Prix ' + BM.prix(etat.prix) + DOL : null;
    const tetes = [px && sens ? px + ', ' + sens : px, sens ? 'Prix ' + sens : null].filter(Boolean);
    const age = BM.ageLigne(ageMs, o), fin = ' · pas une prévision';
    const retard = etat.retardMs ? 'échanges en retard de ' + BM.ageEntier(etat.retardMs) : null;
    const eq = retard || (etat.aucunRepere ? 'rien de marquant autour du prix'
      : r.qB === 0 && r.qA === 0 ? 'aucun ordre en attente lu'
        : etat.vide === 'ask' ? 'rien de marquant au-dessus'
          : etat.vide === 'bid' ? 'rien de marquant au-dessous'
            : { achat: 'plus d’achats en attente', vente: 'plus de ventes en attente', egal: 'autant d’achats que de ventes' }[r.sens]);
    const premier = (l, max) => l.find(t => t.length <= max) || l[l.length - 1];
    const long = premier(tetes.map(h => h + ' · ' + eq + ' · ' + age + fin).concat([majuscule(eq) + ' · ' + age + fin]), 100);
    const court = retard ? majuscule(retard) + fin : premier(tetes.map(h => h + ' · ' + age + fin).concat([majuscule(age) + fin]), 55);
    return { long, court };
  };
  /** Le nom d'un repère sur la carte (≤ 24 signes) : « Mur d’achat · 82 480 $ » sous le prix,
   *  « Mur de vente · 82 600 $ » au-dessus — les mêmes noms que le terminal. Le prix est le bord de
   *  l'amas le plus proche du prix actuel (là où il commence). */
  BM.ETIQUETTE_MAX = 24;
  BM.etiquetteNiveau = function (cote, p) {
    const nom = cote === 'bid' ? 'Mur d’achat' : 'Mur de vente', P = BM.prix(p) + DOL, t = nom + ' · ' + P;
    return t.length <= BM.ETIQUETTE_MAX ? t : nom + ' ' + P;
  };
  /** Le prix est DANS la zone de ce côté (son cadre est « allumé ») : son nom, sans prix. */
  BM.etiquetteDedans = cote => (cote === 'bid' ? 'Dans un mur d’achat' : 'Dans un mur de vente');
  /** Ce côté n'a aucun repère : la carte le dit (on ne prend pas « rien » pour « en panne »). */
  BM.etiquetteVide = cote => (cote === 'bid' ? 'Pas de mur au-dessous' : 'Pas de mur au-dessus');
  /** Typographie des phrases débutantes : une espace insécable avant « : ; ? ! » (jamais en tête de ligne). */
  BM.typo = s => String(s).replace(/ ([:;?!])/g, NB + '$1');
  /** Le résumé OUVERT en mode débutant (un appui sur la ligne du haut) : 6 lignes en clair, mêmes
   *  valeurs que l'expert. d = { tendance, r (BM.resumeCarnet), luMs (âge de la lecture), niveaux:
   *  { ask, bid } (null, ou { etiquette, q, pBas, pHaut, dedans }), ages: { recentes, anciennes,
   *  ronds, ligne, autre (Coinbase) } (ms, ou null), o (constantes) }. Une espace insécable avant
   *  « : » (BM.typo) : un deux-points ne commence jamais une ligne. */
  BM.detailCarteDebutant = function (d) {
    const o = Object.assign({}, BM.GUIDE, d.o), t = d.tendance, r = d.r, n = d.niveaux || {}, a = d.ages || {};
    const l1 = t ? 'Prix : de ' + BM.prix(t.de) + DOL + ' à ' + BM.prix(t.a) + DOL + ' en ' + BM.age(o.tendanceMs) + ' (' + BM.pourcent(t.pct, 2) + '). «' + NB + 'Stable' + NB + '» = moins de ' + BM.nombre(o.tendancePct, 0, 2) + ' % de variation.'
      : 'Prix sur ' + BM.age(o.tendanceMs) + ' : des minutes manquent, pas de sens écrit.';
    const l2 = r ? 'Ordres en attente lus il y a ' + BM.age(d.luMs) + ', jusqu\'à ' + BM.prix(r.usd) + DOL + ' de chaque côté du prix : ' + BM.btc(r.qB) + ' BTC à l\'achat, ' + BM.btc(r.qA) + ' BTC à la vente.'
      : 'Ordres en attente : lecture en cours.';
    const entre = x => BM.btc(x.q) + ' BTC entre ' + BM.prix(x.pBas) + ' et ' + BM.prix(x.pHaut) + DOL;
    const cote = (mot, x) => mot + ' : ' + (!x ? 'rien de nettement plus chargé dans ce qui est lu.'
      : x.dedans ? 'le prix est dans un mur ' + (mot === 'Au-dessus' ? 'de vente' : 'd\'achat') + ' (' + entre(x) + ').'
        : x.etiquette + ' (' + entre(x) + ').');
    const l3 = cote('Au-dessus', n.ask) + ' ' + cote('Au-dessous', n.bid);
    const ag = [], dit = v => v !== null && v !== undefined;
    const couleurs = [dit(a.recentes) ? 'récentes ' + BM.age(a.recentes) : '', dit(a.anciennes) ? 'plus anciennes ' + BM.age(a.anciennes) : ''].filter(Boolean);
    if (couleurs.length) ag.push('couleurs ' + couleurs.join(', '));
    if (dit(a.ronds)) ag.push('ronds ' + BM.age(a.ronds));
    if (dit(a.ligne)) ag.push('ligne blanche ' + BM.age(a.ligne));
    if (dit(a.autre)) ag.push('autre plateforme ' + BM.age(a.autre));
    const l4 = 'Âges : ' + (ag.length ? ag.join(' · ') : 'rien de lu encore') + '.';
    return [l1, l2, l3, l4, 'Le scénario du matin de Claude est sur le Terminal (bouton «' + NB + '←' + NB + 'Terminal' + NB + '»).',
      'Une photo de l\'instant, pas une prévision. Tout le détail technique : mode Expert.'].map(BM.typo);
  };

  /** L'histoire d'une tranche (k, de `pas` $, côté 'b' ou 'a') dans le carnet live gardé
   *  (BM.CarnetLive), en remontant depuis la dernière lecture. Une lecture où la tranche n'est pas
   *  OBSERVÉE n'est jamais lue comme 0 : elle arrête la remontée (coupe) —
   *    'trou'  : une lecture manquée ;
   *    'bande' : la tranche n'est pas entièrement dans ce que la lecture couvre (hors de la bande) ;
   *    'prix'  : le prix était dans la tranche ou de l'autre côté (meilleur bid / ask) : la taille
   *              y est celle du carnet qui se reforme, pas celle d'un mur.
   *  · depuis : première lecture de la série ININTERROMPUE de lectures ≥ `seuil` qui finit à la
   *    dernière ; auMoins si la série n'a pas été vue commencer (raison = la coupe, ou 'debut' : la
   *    plus ancienne lecture gardée) ; raison 'seuil' : vue commencer.
   *  · qAvant : la taille à la lecture juste avant la série, quand elle a été vue commencer (sinon null).
   *  · qF, tF : la taille à la lecture la plus récente d'il y a au moins `fenetreMs`, si la remontée
   *    l'atteint ; sinon qO, tO : la plus ancienne lecture remontée.
   *  Instants : ceux de la carte (heure Binance). null sans lecture. */
  BM.histoireLive = function (L, k, pas, cote, seuil, fenetreMs) {
    if (!L || !L.n) return null;
    const f = Math.max(1, Math.round(pas / L.dp)), c1 = L.n - 1, k0 = k * f, k1 = k * f + f - 1;
    const q = c => { let s = 0; for (let i = 0; i < f; i++) s += L.quantite(c, k0 + i, cote); return s; };
    const etat = c => {
      if (cote === 'b') {
        if (!L.nB[c] || !(k0 > L.bas[c])) return 'bande';
        return k1 >= L.bB[c] + L.nB[c] - 1 ? 'prix' : 'ok';
      }
      if (!L.nA[c] || !(k1 < L.haut[c])) return 'bande';
      return k0 <= L.bA[c] ? 'prix' : 'ok';
    };
    const qN = q(c1), t = L.deb[c1], e1 = etat(c1);
    if (e1 !== 'ok') return { q: qN, t, depuis: null, auMoins: false, raison: e1, depuisDebut: false, coupe: e1, qF: null, tF: null, qO: null, tO: null, qAvant: null };
    const tFen = t - fenetreMs;
    let c0 = c1, enCours = qN >= seuil, qF = null, tF = null, qO = qN, tO = t, coupe = null, c = c1 - 1, qAvant = null;
    for (; c >= 0; c--) {
      if (L.fin[c] < L.deb[c + 1]) { coupe = 'trou'; break; }        // une lecture manquée : on ne sait pas
      const e = etat(c);
      if (e !== 'ok') { coupe = e; break; }
      const x = q(c);
      if (enCours) { if (x >= seuil) c0 = c; else { enCours = false; qAvant = x; } }
      if (qF === null && L.deb[c] <= tFen) { qF = x; tF = L.deb[c]; }
      qO = x; tO = L.deb[c];
      if (!enCours && qF !== null) break;
    }
    const vue = qN >= seuil;
    const raison = !vue ? null : !enCours ? 'seuil' : coupe || 'debut';
    return { q: qN, t, depuis: vue ? L.deb[c0] : null, auMoins: vue && enCours, raison, depuisDebut: vue && enCours && !coupe && c0 === 0, coupe, qF, tF, qO, tO, qAvant: raison === 'seuil' ? qAvant : null };
  };
  /** Carte publiée : la série ININTERROMPUE de colonnes où la rangée pb porte au moins vS d'un côté
   *  ('b' ou 'a') et qui FINIT à la colonne c1 ; rend sa première colonne, ou null si c1 n'en est pas.
   *  Une colonne non observée coupe la série (on ne sait pas) ; rien avant cMin (colonnes publiées
   *  avant que la carte ne somme ses tranches : une autre grandeur). */
  BM.presenceJusqua = function (g, vS, pb, cote, c1, cMin) {
    if (!g) return null;
    const r = pb - g.pbMin, H = g.H, t = cote === 'b' ? g.bids : g.asks;
    if (r < 0 || r >= H || !(c1 >= 0) || c1 >= g.W) return null;
    let c0 = null;
    for (let c = c1; c >= Math.max(0, cMin || 0); c--) {
      if (!(g.bas[c] >= 0 && g.bas[c] <= pb && pb <= g.haut[c] && t[c * H + r] >= vS)) break;
      c0 = c;
    }
    return c0;
  };
  /** La variation d'un mur : « grossit », « diminue » ou « à peu près stable », d'après sa taille q,
   *  celle d'avant (qAvant, il y a dureeMs) et ce qui a été échangé à ces prix pendant ce temps.
   *  null quand rien n'est mesurable. */
  BM.variationMur = function (q, qAvant, dureeMs, echange, o) {
    o = Object.assign({}, BM.GUIDE, o);
    if (qAvant === null || qAvant === undefined || !(dureeMs >= 60e3)) return null;
    const d = q - qAvant, fen = BM.age(dureeMs), net = Math.abs(d) >= o.varMinBtc && Math.abs(d) >= o.varMinPart * qAvant;
    // Échanges non lus pendant la fenêtre : on ne dit rien des échanges, plutôt que « aucun ».
    const ech = echange === null || echange === undefined ? 'échanges non lus' : echange > 0.0005 ? BM.btc(echange) + ' BTC échangés à ces prix' : 'aucun échange à ces prix';
    if (!net) return { sens: 'stable', d, texte: 'à peu près stable depuis ' + fen + ' (' + BM.pourcentBtc(d) + ')', court: '≈ ' + fen };
    if (d > 0) return { sens: 'grossit', d, texte: 'grossit (+' + BM.btc(d) + ' BTC en ' + fen + ')', court: '+' + BM.btc(d) + ' / ' + fen };
    return { sens: 'fond', d, texte: 'diminue (−' + BM.btc(-d) + ' BTC en ' + fen + ' ; ' + ech + ')', court: '−' + BM.btc(-d) + ' / ' + fen };
  };
  BM.pourcentBtc = d => (d < 0 ? '−' : '+') + BM.btc(Math.abs(d)) + ' BTC';
  /** Le libellé d'un mur en mots : lignes (débutant ou expert) et version courte (≤ 40 signes).
   *  m = { cote: 'bid'|'ask', p, pas, q, depuis (instant), auMoins, raison, publiee, variation
   *  (BM.variationMur), note ('prix' | 'bande' | null : rien à comparer, et pourquoi), source:
   *  'live'|'publie', luA (instant de lecture du fichier), periment (carnet live pas lu en ce moment) }.
   *  Débutant : une ligne ; la 2e seulement quand le mur a une histoire (il grossit, diminue, est là
   *  depuis longtemps, ou n'a rien à quoi se comparer). */
  BM.texteMur = function (m, mode, maintenant, o) {
    o = Object.assign({}, BM.GUIDE, o);
    const achat = m.cote === 'bid', nom = achat ? 'Mur d\'achat' : 'Mur de vente', q = BM.btc(m.q) + ' BTC', ba = achat ? 'Bid' : 'Ask';
    if (m.source === 'publie') {
      const lu = 'lu à ' + BM.heureUtc(m.luA) + ' UTC';
      return mode === 'expert' ? { lignes: [ba + ' publié ' + q + ' · ' + lu], court: ba + ' publié · ' + q }
        : { lignes: [nom + ' publié · ' + q + ' · ' + lu, 'fichier de 15 min (' + (m.periment ? 'carnet live pas lu en ce moment' : 'carnet live pas encore lu') + ')'], court: nom + ' publié · ' + q };
    }
    const ms = m.depuis !== null && m.depuis !== undefined ? Math.max(0, maintenant - m.depuis) : null;
    const v = m.variation || null, fen = BM.age(o.fenetreMs);
    if (mode === 'expert') {
      const d = ms === null ? '' : ' · ' + (m.auMoins ? '≥ ' : '') + BM.age(ms);
      return { lignes: [ba + ' ' + q + d + (v ? ' · ' + v.court : '') + (m.note === 'prix' ? ' · prix passé ici' : m.note === 'bande' ? ' · entre dans la bande' : '')], court: ba + ' ' + q + d };
    }
    let quand = '', quandC = '';
    if (m.note === 'prix') { quandC = ' · prix passé ici'; }
    else if (ms !== null) {
      if (m.auMoins && m.raison === 'debut' && !m.publiee && ms < 60e3) { quand = ' · déjà là à la première lecture'; quandC = ' · depuis ≥ ' + BM.age(ms); }
      else if (m.auMoins) { quand = ' · là depuis au moins ' + BM.age(ms); quandC = ' · depuis ≥ ' + BM.age(ms); }
      else if (ms < 60e3) { quand = ' · apparu il y a moins d\'une minute'; quandC = ' · < 1 min'; }
      else { quand = ' · là depuis ' + BM.age(ms); quandC = ' · depuis ' + BM.age(ms); }
    }
    const l = [nom + ' · ' + q + quand];
    if (m.note === 'prix') l.push('le prix était à ce niveau il y a moins de ' + fen + ' : rien à comparer');
    else if (m.note === 'bande') l.push('vient d\'entrer dans la bande que le carnet lu couvre : rien à comparer');
    else if (v && (v.sens !== 'stable' || (ms !== null && ms >= o.histoireMinMs))) l.push(v.texte);
    return { lignes: l, court: nom + ' ' + q + quandC };
  };

  /** Les murs NOMMÉS d'une lecture à la suivante (lectures contiguës seulement) : ce qui fait un
   *  évènement au journal. prec = { nommes, approches } (Maps « bid4999 » → { cote, k, p, pas, n
   *  (lectures nommé de suite), q, t (dernière lecture), t0, loin, qAvant }) ; murs = ceux de CETTE
   *  lecture (BM.mursProches, plus leur histoire : raison, depuis, qAvant). Rend { nommes,
   *  approches, apparus: [m], traverses: [a], fondus: [{ a, q1 }] }.
   *  · Apparu : nommé nommeLectures lectures de suite, sa série vue commencer il y a moins de
   *    apparuMaxMs, ET la tranche elle-même a grossi (d'au moins varMinBtc et varMinPart de sa
   *    taille juste avant) : un seuil qui baisse sous une tranche immobile ne fait pas un « apparu ».
   *  · Approché : un mur nommé et stable dont le prix vient toucher la tranche ou sa voisine n'est
   *    plus nommable ; il est gardé à part, et le passage est guetté à chaque lecture, jusqu'à ce
   *    que le prix le passe ou s'en éloigne.
   *  · Passé : le prix de référence de CETTE lecture est au-delà de la tranche.
   *  · Fondu : plus nommé, sa tranche encore lue loin du prix, sous fondPart de sa taille ET sous le
   *    seuil de sortie. */
  BM.suivreNommes = function (prec, murs, C, t, contigu, o) {
    o = Object.assign({}, BM.GUIDE, o);
    const P = contigu && prec ? prec : { nommes: new Map(), approches: new Map() };
    const nommes = new Map(), approches = new Map(), out = { nommes, approches, apparus: [], traverses: [], fondus: [] };
    const kP = Math.floor(C.mid / C.pas), sortie = o.sortie !== undefined ? o.sortie : BM.seuilMur(C, o).sortie;
    const passe = a => (a.cote === 'bid' ? C.mid < a.p : C.mid > a.p + a.pas);
    const proche = a => (a.cote === 'bid' ? a.k > kP - 1 - o.margeTranches : a.k < kP + 1 + o.margeTranches);
    const qLue = a => (a.cote === 'bid' ? C.b : C.a).get(a.k) || 0;
    for (const m of murs) {
      const cle = m.cote + m.k, a = P.nommes.get(cle) || P.approches.get(cle);
      const loin = m.cote === 'bid' ? C.mid - m.p > 2 * C.pas : m.p + C.pas - C.mid > 2 * C.pas;
      const x = a && a.pas === C.pas ? Object.assign({}, a, { n: a.n + 1, q: m.q, t, qAvant: null })
        : { cote: m.cote, k: m.k, p: m.p, pas: C.pas, n: 1, q: m.q, t, t0: t, loin, qAvant: null };
      nommes.set(cle, x);
      const grossi = m.qAvant !== null && m.qAvant !== undefined && m.q - m.qAvant >= o.varMinBtc && m.q - m.qAvant >= o.varMinPart * m.qAvant;
      if (x.n === o.nommeLectures && m.raison === 'seuil' && m.depuis !== null && m.depuis !== undefined && t - m.depuis <= o.apparuMaxMs && grossi) out.apparus.push(m);
    }
    for (const [cle, a] of P.nommes) {
      if (a.pas !== C.pas || a.n < o.nommeLectures) continue;
      if (a.loin && passe(a)) { out.traverses.push(a); nommes.delete(cle); continue; }
      if (nommes.has(cle)) continue;
      if (proche(a)) { approches.set(cle, Object.assign({}, a, { qAvant: qLue(a) })); continue; }
      const lue = a.cote === 'bid' ? a.p > C.bas : a.p + a.pas < C.haut, q1 = qLue(a);
      if (lue && q1 < o.fondPart * a.q && q1 < sortie) out.fondus.push({ a, q1 });
    }
    for (const [cle, a] of P.approches) {
      if (nommes.has(cle) || a.pas !== C.pas) continue;
      if (passe(a)) { out.traverses.push(a); continue; }
      if (proche(a)) approches.set(cle, Object.assign({}, a, { qAvant: qLue(a) }));
      // Sinon le prix s'en est éloigné sans le passer : plus guetté.
    }
    return out;
  };

  // Évènements du journal : { t (instant, heure de la carte), type, cote ('b'|'a'|null), p, q, s
  // (symbole), texte (journal, sans heure), carte (libellé sur la carte, avec l'heure UTC), court
  // (≤ 40 signes), cle (dédoublonnage) }.
  // Deux sortes de « gros » : un GROS ORDRE est un niveau au prix exact (un seul prix) suivi par
  // BM.SuiviMurs ; un MUR est une tranche de 20 $ du carnet live nommée sur la carte. Les mots
  // les distinguent toujours.
  const nomOrdre = cote => (cote === 'b' ? 'Gros ordre d\'achat' : 'Gros ordre de vente');
  const nomMur = cote => (cote === 'b' ? 'Mur d\'achat' : 'Mur de vente');
  const coteMot = cote => (cote === 'b' ? 'achat' : 'vente');
  // Mode débutant : chaque évènement porte aussi une phrase `debutant` — mêmes champs, mêmes
  // quantités, mêmes prix que `texte`, en mots simples, à l'heure de l'appareil (celle de l'axe).
  const ordreMot = cote => (cote === 'b' ? 'Gros ordre d\'achat' : 'Gros ordre de vente');
  /** La fin d'un gros ordre suivi (BM.SuiviMurs), en mots, d'après TOUTE sa vie : x = { fin, cote,
   *  p, q0 (taille à la dernière lecture où il était là), qMax (la plus grande lue), xN (échangé
   *  à coup sûr à la fin), echange (échangé sur toute sa vie, avec la fin), retire (au moins
   *  retiré, mesuré sur toute sa vie), t }. Seules les fins classées font un évènement. La phrase
   *  commence par la plus grande taille lue (pas par ce qui restait à la fin). « Absorbé » ou « en
   *  partie échangé » seulement si les échanges font au moins absorbePart de la plus grande taille
   *  lue : sinon il a été « retiré pour l'essentiel », et les deux quantités sont dites. */
  BM.evenementFinMur = function (x, o) {
    o = Object.assign({}, BM.GUIDE, o);
    if (!['retire', 'echange', 'partiel', 'incertain'].includes(x.fin)) return null;
    const nom = nomOrdre(x.cote), mot = coteMot(x.cote), hc = BM.heureUtc(x.t) + ' UTC', px = BM.prixExact(x.p) + DOL;
    const qMax = Math.max(x.qMax || 0, x.q0 || 0), ech = x.echange !== undefined && x.echange !== null ? x.echange : (x.xN || 0), ret = x.retire || 0;
    const plus = qMax > x.q0 + 0.0005, taille = nom + ' de ' + BM.btc(qMax) + ' BTC' + (plus ? ' (sa plus grande taille lue)' : '');
    // Sa vie avant la fin : ce qui en a été retiré (au moins) et échangé, quand il y en a.
    const vie = [ret > 0.0005 ? 'au moins ' + BM.btc(ret) + ' BTC retirés' : '', ech > 0.0005 ? BM.btc(ech) + ' BTC échangés' : ''].filter(Boolean).join(', ');
    let type = x.fin;
    if ((type === 'echange' || type === 'partiel') && ech < o.absorbePart * qMax) type = 'essentiel';
    const T = {
      retire: [!plus && !(ech > 0.0005) ? taille + ' retiré sans échange à ' + px + ' (un seul prix)'
        : taille + ' à ' + px + ' retiré' + (vie ? ' (' + vie + ' au cours de sa vie)' : '') + ' : ses derniers ' + BM.btc(x.q0) + ' BTC partis sans échange (un seul prix)',
        nom + ' retiré à ' + hc + ', sans échange', '✕ ' + mot + ' retiré ' + hc],
      echange: [nom + ' absorbé (entièrement échangé) : ' + BM.btc(ech) + ' BTC échangés à ' + px + ' (un seul prix)',
        nom + ' absorbé à ' + hc + ' : ' + BM.btc(ech) + ' BTC échangés', '● ' + mot + ' absorbé ' + hc],
      partiel: [nom + ' en partie échangé, puis disparu : ' + BM.btc(ech) + ' BTC échangés sur ' + BM.btc(qMax) + ' BTC à ' + px + ' (un seul prix)',
        nom + ' disparu à ' + hc + ' (' + BM.btc(ech) + ' sur ' + BM.btc(qMax) + ' BTC échangés)', '◐ ' + mot + ' en partie échangé ' + hc],
      essentiel: [nom + ' retiré pour l\'essentiel : ' + BM.btc(ret) + ' BTC retirés, ' + BM.btc(ech) + ' BTC échangés à ' + px + ' (jusqu\'à ' + BM.btc(qMax) + ' BTC, un seul prix)',
        nom + ' retiré pour l\'essentiel à ' + hc, '◐ ' + mot + ' surtout retiré ' + hc],
      incertain: [taille + ' disparu à ' + px + ', échanges incertains' + (vie ? ' : ' + vie + ' au cours de sa vie' : '') + (plus ? ' ; on ne sait pas si ses derniers ' + BM.btc(x.q0) + ' BTC ont été échangés' : '') + ' (un seul prix)',
        nom + ' disparu à ' + hc + ' (échanges incertains)', '? ' + mot + ' : échanges incertains ' + hc],
    }[type];
    // Débutant : des dollars entiers, chaque quantité avec son unité, et jamais « ses derniers 0,000 BTC ».
    const o2 = ordreMot(x.cote), pxD = BM.prix(x.p) + DOL;
    const D = {
      retire: o2 + ' retiré à ' + pxD + (ech > 0.0005 ? ' (' + BM.btc(qMax) + ' BTC, dont ' + BM.btc(ech) + ' BTC échangés avant)' : ', sans échange (' + BM.btc(qMax) + ' BTC)'),
      echange: o2 + ' entièrement échangé à ' + pxD + ' (' + BM.btc(ech) + ' BTC)',
      partiel: o2 + ' en partie échangé à ' + pxD + ' (' + BM.btc(ech) + ' BTC sur ' + BM.btc(qMax) + ' BTC), puis disparu',
      essentiel: o2 + ' surtout retiré à ' + pxD + (ret > 0.0005 ? ' (' + BM.btc(ret) + ' BTC retirés, ' + BM.btc(ech) + ' BTC échangés)' : ' (' + BM.btc(ech) + ' BTC échangés sur ' + BM.btc(qMax) + ' BTC)'),
      incertain: o2 + ' disparu à ' + pxD + ' : on ne sait pas s\'il a été échangé',
    }[type];
    return { t: x.t, type, cote: x.cote, p: x.p, q: type === 'echange' ? ech : qMax, s: BM.FINS_MURS[type === 'essentiel' ? 'partiel' : type].s, texte: T[0], carte: T[1],
      court: T[2], debutant: D, cle: type + x.cote + Math.round(x.p * 100) };
  };
  /** Un gros ordre qui atteint le seuil du journal. x = { cote, p, q, t, grossi (il était là avant,
   *  plus petit) }. */
  BM.evenementApparu = function (x) {
    const nom = nomOrdre(x.cote), q = BM.btc(x.q) + ' BTC', hc = BM.heureUtc(x.t) + ' UTC';
    return { t: x.t, type: 'apparu', cote: x.cote, p: x.p, q: x.q, s: BM.SYMBOLES_GUIDE.apparu.s,
      texte: x.grossi ? nom + ' : ' + q + ' à ' + BM.prixExact(x.p) + DOL + ' (un seul prix ; il y en avait moins avant)' : nom + ' apparu : ' + q + ' à ' + BM.prixExact(x.p) + DOL + ' (un seul prix)',
      carte: nom + ' apparu à ' + hc + ' (' + q + ')', court: '+ ' + coteMot(x.cote) + ' ' + q + ' ' + hc,
      debutant: ordreMot(x.cote) + (x.grossi ? ' agrandi : ' + q + ' à ' + BM.prix(x.p) + DOL : ' posé : ' + q + ' à ' + BM.prix(x.p) + DOL + ' (un seul prix)'), cle: 'apparu' + x.cote + Math.round(x.p * 100) };
  };
  /** Un mur NOMMÉ (tranche du carnet live) passé au-dessus du seuil sous les yeux de la page.
   *  x = { cote: 'b'|'a', p, pas, q, t }. */
  BM.evenementMurApparu = function (x) {
    const nom = nomMur(x.cote), q = BM.btc(x.q) + ' BTC', hc = BM.heureUtc(x.t) + ' UTC';
    return { t: x.t, type: 'murApparu', cote: x.cote, p: x.p + x.pas / 2, q: x.q, s: BM.SYMBOLES_GUIDE.apparu.s,
      texte: nom + ' apparu : ' + q + ' entre ' + BM.prix(x.p) + ' et ' + BM.prix(x.p + x.pas) + DOL + ' (tranche de ' + x.pas + DOL + ', carnet live)',
      carte: nom + ' apparu à ' + hc + ' (' + q + ')', court: '+ mur ' + coteMot(x.cote) + ' ' + q + ' ' + hc,
      debutant: (x.cote === 'b' ? 'Beaucoup d\'achats en attente apparus' : 'Beaucoup de ventes en attente apparues') + ' entre ' + BM.prix(x.p) + ' et ' + BM.prix(x.p + x.pas) + DOL + ' (' + q + ')', cle: 'murApparu' + x.cote + Math.round(x.p) };
  };
  /** Un mur NOMMÉ qui fond sans que le prix l'atteigne. x = { cote, p, pas, q0, q1, dureeMs,
   *  echange (BTC échangés dans la tranche, null si non lus), t }. */
  BM.evenementMurFondu = function (x) {
    const nom = nomMur(x.cote), hc = BM.heureUtc(x.t) + ' UTC';
    const ech = x.echange === null || x.echange === undefined ? 'échanges non lus' : x.echange > 0.0005 ? BM.btc(x.echange) + ' BTC échangés à ces prix' : 'aucun échange à ces prix';
    return { t: x.t, type: 'fondu', cote: x.cote, p: x.p + x.pas / 2, q: x.q0, s: BM.SYMBOLES_GUIDE.fondu.s,
      texte: nom + ' ' + tranche(x.p, x.pas) + ' : de ' + BM.btc(x.q0) + ' à ' + BM.btc(x.q1) + ' BTC en ' + (x.dureeMs < 60e3 ? 'moins d\'une minute' : BM.age(x.dureeMs)) + ' (' + ech + ' ; le prix n\'y est pas allé)',
      carte: nom + ' fondu à ' + hc + ' (' + BM.btc(x.q0) + ' → ' + BM.btc(x.q1) + ' BTC)', court: '− mur ' + coteMot(x.cote) + ' fondu ' + hc,
      // « retirés » seulement quand on sait qu'aucun échange n'a eu lieu à ces prix ; sinon « en baisse ».
      debutant: (x.cote === 'b' ? 'Achats en attente ' : 'Ventes en attente ') + (x.echange === 0 ? (x.cote === 'b' ? 'retirés' : 'retirées') : 'en baisse') + ' entre ' + BM.prix(x.p) + ' et ' + BM.prix(x.p + x.pas) + DOL + ' : de ' + BM.btc(x.q0) + ' à ' + BM.btc(x.q1) + ' BTC, sans que le prix y aille',
      cle: 'fondu' + x.cote + Math.round(x.p) };
  };
  /** Une rafale au marché (BM.lireRafale). */
  BM.evenementRafale = function (r) {
    const mot = r.achat ? 'd\'achats' : 'de ventes', q = BM.btc(r.q) + ' BTC', S = BM.SYMBOLES_GUIDE[r.achat ? 'rafaleAchat' : 'rafaleVente'].s;
    return { t: r.T, type: 'rafale', cote: null, achat: r.achat, p: r.vwap, q: r.q, s: S,
      texte: 'Rafale ' + mot + ' au marché : ' + q + ' d\'un seul coup (même milliseconde), ' + (r.pMax > r.pMin ? 'de ' + BM.prix(r.pMin) + ' à ' + BM.prix(r.pMax) : 'à ' + BM.prix(r.pMin)) + DOL,
      carte: 'Rafale ' + mot + ' à ' + BM.heureUtc(r.T, true) + ' UTC : ' + q, court: S + ' rafale ' + mot + ' ' + q,
      debutant: 'Grosse vague ' + mot + ' : ' + q + ' d\'un coup, vers ' + BM.prix(r.vwap) + DOL, cle: 'rafale' + r.aDeb };
  };
  /** Le prix (live) passe un mur nommé. x = { cote: 'b'|'a', p (bas de la tranche), pas, q (taille
   *  quand il était nommé), qAvant (taille à la lecture d'avant s'il n'était plus nommé : le prix
   *  l'approchait), t }.
   *  Règle de travail du propriétaire (non mesurée) : cassé après deux clôtures au-delà, ou une
   *  clôture puis un retour testé ; seulement traversé par une mèche : « percé en mèche ». */
  BM.evenementTraverse = function (x) {
    const sous = x.cote === 'b', lieu = sous ? 'sous le mur d\'achat' : 'au-dessus du mur de vente', S = BM.SYMBOLES_GUIDE[sous ? 'sous' : 'sur'].s;
    return { t: x.t, type: 'traverse', cote: x.cote, p: sous ? x.p : x.p + x.pas, q: x.q, s: S,
      texte: 'Le prix (live) passe ' + lieu + ' ' + tranche(x.p, x.pas) + ' (' + BM.btc(x.q) + ' BTC ' + (x.qAvant !== null && x.qAvant !== undefined ? 'quand il était nommé, ' + BM.btc(x.qAvant) + ' BTC à la lecture d\'avant' : 'à la lecture d\'avant') + '). Percé, pas «' + NB + 'cassé' + NB + '» : il faudrait deux clôtures 1 min '
        + (sous ? 'sous' : 'au-dessus de') + ' ce niveau, ou une clôture puis un retour testé (règle de travail, non mesurée).',
      carte: 'Prix passé ' + lieu + ' à ' + BM.heureUtc(x.t) + ' UTC', court: S + (sous ? ' sous mur achat ' : ' sur mur vente ') + BM.prix(x.p) + ' ' + BM.heureUtc(x.t),
      debutant: 'Le prix passe ' + (sous ? 'sous les achats en attente à ' + BM.prix(x.p) : 'au-dessus des ventes en attente à ' + BM.prix(x.p + x.pas)) + DOL, cle: 'traverse' + x.cote + Math.round(x.p) };
  };
  /** La suite d'un passage (BM.evenementTraverse) d'après les bougies 1 min CLOSES : 'meche' (la
   *  bougie du passage a clôturé en deçà du niveau), 'casse' (elle et la suivante ont clôturé
   *  au-delà), 'repasse' (une clôture au-delà, puis retour), 'inconnu' (bougies manquantes) ou null
   *  (pas encore closes). tr = { cote, p, pas, t } ; minutes = [{ t, fin, c }] triées. */
  BM.suiteTraverse = function (tr, minutes, maintenant, o) {
    o = Object.assign({}, BM.GUIDE, o);
    const niv = tr.cote === 'b' ? tr.p : tr.p + tr.pas, au = c => (tr.cote === 'b' ? c < niv : c > niv);
    const t1 = Math.floor(tr.t / 60e3) * 60e3, m1 = minutes.find(m => m.t === t1), m2 = minutes.find(m => m.t === t1 + 60e3);
    const clos = m => m && m.fin <= maintenant;
    if (!clos(m1)) return maintenant - tr.t > o.suiteMaxMs ? { verdict: 'inconnu' } : null;
    if (!au(m1.c)) return { verdict: 'meche', m1 };
    if (!clos(m2)) return maintenant - tr.t > o.suiteMaxMs ? { verdict: 'inconnu' } : null;
    return { verdict: au(m2.c) ? 'casse' : 'repasse', m1, m2 };
  };
  /** L'évènement de la suite d'un passage. x = { cote, p, pas, verdict, m1, m2 }. */
  BM.evenementSuite = function (x) {
    if (!x || !['meche', 'casse', 'repasse'].includes(x.verdict)) return null;
    const b = x.cote === 'b', nom = nomMur(x.cote) + ' ' + tranche(x.p, x.pas), h1 = BM.heureUtc(x.m1.t), h2 = x.m2 ? BM.heureUtc(x.m2.t) : '';
    const dela = b ? 'sous' : 'au-dessus de', deca = b ? 'au-dessus' : 'en dessous', SG = BM.SYMBOLES_GUIDE;
    const T = {
      meche: [nom + ' percé en mèche : la bougie de ' + h1 + ' UTC a clôturé ' + deca + ' (règle de travail, non mesurée)', 'Percé en mèche (bougie de ' + h1 + ' UTC)', SG.meche.s + ' mèche ' + coteMot(x.cote) + ' ' + BM.prix(x.p) + ' ' + h1],
      casse: [nom + ' cassé selon la règle de travail : deux clôtures 1 min ' + dela + ' le niveau (' + h1 + ' et ' + h2 + ' UTC ; règle non mesurée)', 'Cassé selon la règle (' + h1 + ', ' + h2 + ' UTC)', SG.casse.s + ' cassé ' + coteMot(x.cote) + ' ' + BM.prix(x.p) + ' ' + h2],
      repasse: [nom + ' : une clôture 1 min ' + dela + ' le niveau (' + h1 + ' UTC), puis retour ' + deca + ' à ' + h2 + ' UTC — pas «' + NB + 'cassé' + NB + '» selon la règle de travail', 'Clôture au-delà puis retour (' + h2 + ' UTC)', SG.meche.s + ' retour ' + coteMot(x.cote) + ' ' + BM.prix(x.p) + ' ' + h2],
    }[x.verdict];
    const t = (x.verdict === 'meche' ? x.m1 : x.m2).fin;
    // Débutant : le fait (« deux minutes de suite »), pas le mot « cassé » de la règle de travail.
    const niv = BM.prix(b ? x.p : x.p + x.pas) + DOL, l1 = BM.heure(x.m1.t), l2 = x.m2 ? BM.heure(x.m2.t) : '';
    const D = {
      meche: 'Simple passage : la minute de ' + l1 + ' finit ' + (b ? 'au-dessus de ' : 'sous ') + niv,
      casse: 'Le prix reste ' + (b ? 'sous ' : 'au-dessus de ') + niv + ' deux minutes de suite (' + l1 + ' et ' + l2 + ')',
      repasse: 'Le prix finit une minute ' + (b ? 'sous ' : 'au-dessus de ') + niv + ' (' + l1 + '), puis revient ' + (b ? 'au-dessus' : 'en dessous') + ' (' + l2 + ')',
    }[x.verdict];
    return { t, type: x.verdict, cote: x.cote, p: b ? x.p : x.p + x.pas, q: null, s: x.verdict === 'casse' ? SG.casse.s : SG.meche.s, texte: T[0], carte: T[1], court: T[2], debutant: D, cle: x.verdict + x.cote + Math.round(x.p) };
  };
  /** Le prix (bougie 1 min) touche un niveau d'options du fichier de 15 min (MODÈLE).
   *  x = { nom, court, p (strike publié), pAxe, t (début de la minute), luA (lecture du fichier) }. */
  BM.evenementOptions = function (x) {
    const nom = x.nom.charAt(0).toLowerCase() + x.nom.slice(1), S = BM.SYMBOLES_GUIDE.options.s;
    return { t: x.t + 30e3, type: 'options', cote: null, p: x.pAxe, q: null, s: S,
      texte: 'Le prix atteint le niveau d\'options «' + NB + nom + NB + '» ' + BM.prix(x.p) + DOL + ' (modèle ; fichier lu à ' + BM.heureUtc(x.luA) + ' UTC)',
      carte: 'Prix au niveau d\'options ' + x.court + ' (bougie de ' + BM.heureUtc(x.t) + ' UTC, modèle)', court: S + ' ' + x.court + ' ' + BM.prix(x.p) + ' ' + BM.heureUtc(x.t) + ' UTC',
      debutant: null, cle: 'options' + x.court + x.p };      // mode débutant : non listé (niveau d'une estimation)
  };
  /** Le journal : évènements triés par instant ; un même évènement (même clé) dans la minute est
   *  compté (×n) au lieu d'être répété ; les plus anciens s'oublient au-delà de `garde`. */
  BM.Journal = function (garde) { this.liste = []; this.cles = new Map(); this.version = 0; this.garde = garde || BM.GUIDE.journalGarde; };
  const JO = BM.Journal.prototype;
  JO.ajouter = function (ev) {
    if (!ev) return false;
    const prec = this.cles.get(ev.cle);
    if (prec && Math.abs(ev.t - prec.t) <= BM.GUIDE.fusionMs) { prec.n++; this.version++; return false; }
    ev.n = 1;
    const L = this.liste;
    let lo = 0, hi = L.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (L[m].t <= ev.t) lo = m + 1; else hi = m; }
    L.splice(lo, 0, ev);
    this.cles.set(ev.cle, ev);
    while (L.length > this.garde) { const x = L.shift(); if (this.cles.get(x.cle) === x) this.cles.delete(x.cle); }
    this.version++;
    return true;
  };
  /** Les k plus récents, le plus récent d'abord. */
  JO.derniers = function (k) { return this.liste.slice(-k).reverse(); };
  /** Ceux d'instant dans [ta, tb]. */
  JO.dans = function (ta, tb) { return this.liste.filter(e => e.t >= ta && e.t <= tb); };
  /** Marques du journal regroupées par case de `px` pixels : une par case (la plus grosse, sinon la
   *  plus récente), avec le nombre d'évènements de la case. pts = [{ x, y, ev }]. */
  BM.regrouperMarques = function (pts, px) {
    const cases = new Map();
    for (const m of pts) {
      const k = Math.floor(m.x / px) + ':' + Math.floor(m.y / px), c = cases.get(k);
      if (!c) { cases.set(k, { x: m.x, y: m.y, ev: m.ev, evs: [m.ev] }); continue; }
      c.evs.push(m.ev);
      if ((m.ev.q || 0) > (c.ev.q || 0) || ((m.ev.q || 0) === (c.ev.q || 0) && m.ev.t > c.ev.t)) { c.ev = m.ev; c.x = m.x; c.y = m.y; }
    }
    return [...cases.values()];
  };
  /** Les zones chargées les plus proches du prix, sous lui (ordres d'achat) et au-dessus (ordres de
   *  vente) : `zoneTranches` tranches consécutives sommées, entièrement dans la bande lue, hors de la
   *  tranche du prix et de ses voisines, d'au moins zoneMinBtc ET zoneFacteur × la zone médiane du
   *  même côté. Une zone d'avant (`prec`) reste tant qu'elle est chargée et que le prix y entre (ou
   *  qu'aucune autre ne la remplace) et qu'elle porte au moins max(zoneMinBtc, zoneSortiePart × le
   *  seuil d'entrée du moment) : on voit alors si elle est échangée ou retirée ; repassée en dessous,
   *  elle reste encore zoneGarde lectures (pas de clignotement), puis s'efface. Rend { bid, ask } :
   *  { cote, k0, pBas, pHaut, q, garde } ou null. */
  BM.zonesChargees = function (C, prec, o) {
    o = Object.assign({}, BM.GUIDE, o);
    const out = { bid: null, ask: null };
    if (!C || C.bas === null || C.haut === null) return out;
    const n = o.zoneTranches, P = C.pas, kP = Math.floor(C.mid / P);
    for (const cote of ['bid', 'ask']) {
      const m = cote === 'bid' ? C.b : C.a;
      const somme = k0 => { let s = 0; for (let i = 0; i < n; i++) s += m.get(k0 + i) || 0; return s; };
      const zone = (k0, q, garde) => ({ cote, k0, pBas: k0 * P, pHaut: (k0 + n) * P, q, garde: garde || 0 });
      const dansBande = k0 => k0 * P >= C.bas && (k0 + n) * P <= C.haut;
      const fen = [];
      if (cote === 'bid') { const kH = kP - 1 - o.margeTranches; for (let k0 = kH - n + 1; k0 * P >= C.bas; k0--) fen.push([k0, somme(k0)]); }
      else { const kB = kP + 1 + o.margeTranches; for (let k0 = kB; (k0 + n) * P <= C.haut; k0++) fen.push([k0, somme(k0)]); }
      const tri = fen.map(x => x[1]).sort((a, b) => a - b), med = tri.length ? tri[tri.length >> 1] : 0;
      const seuil = Math.max(o.zoneMinBtc, o.zoneFacteur * med);
      let frais = null;
      const i = fen.findIndex(x => x[1] >= seuil);
      if (i >= 0) { let b = fen[i]; for (let j = i + 1; j < Math.min(fen.length, i + n); j++) if (fen[j][1] > b[1]) b = fen[j]; frais = zone(b[0], b[1]); }
      const p0 = prec && prec[cote];
      if (p0 && dansBande(p0.k0)) {
        const q = somme(p0.k0), dedans = cote === 'bid' ? C.mid < p0.pHaut : C.mid > p0.pBas;
        const recouvre = frais && Math.abs(frais.k0 - p0.k0) < n;
        // Seuil de sortie FIXE (pas la taille d'avant : sinon il descend lecture après lecture et la
        // zone ne s'efface jamais).
        if (q >= Math.max(o.zoneMinBtc, o.zoneSortiePart * seuil) && (dedans || !frais || recouvre)) { out[cote] = zone(p0.k0, q); continue; }
        if (!frais && (p0.garde || 0) < o.zoneGarde && q >= o.zoneMinBtc / 2) { out[cote] = zone(p0.k0, q, (p0.garde || 0) + 1); continue; }
      }
      out[cote] = frais;
    }
    return out;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = BM;
  else racine.BM = BM;
})(typeof window !== 'undefined' ? window : globalThis);
