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
     plus gros niveau de prix de la tranche. Fusionner des tranches = prendre le MAX (exact,
     √ est croissante) ; jamais la somme. On peut fusionner, jamais affiner.
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
   *  px : Uint32Array(w·h), déjà rempli du fond « non observé » ; vue {t1, t2, p1, p2} ;
   *  o : { lut } ou { lutB, lutA } (Uint32Array(256)), et `maintenant` : rien n'est peint après. */
  BM.peindreGrille = function (px, w, h, g, vue, o) {
    if (!nCol(g) || w < 1 || h < 1) return;
    const tpp = (vue.t2 - vue.t1) / w, pp = (vue.p2 - vue.p1) / h;
    const tMax = o.maintenant !== undefined && o.maintenant !== null ? o.maintenant : Infinity;
    const H = g.H, pbMin = g.pbMin, lut = o.lut, lutB = o.lutB, lutA = o.lutA;
    const colB = new Uint8Array(H), colA = new Uint8Array(H);
    const ja = new Int32Array(h), jb = new Int32Array(h);
    BM.tranchesLignes(vue.p2, pp, h, g.dp, ja, jb);
    const r = [0, 0], acc = [0, 0, 0];
    let cle0 = -2, cle1 = -2, lo = 0, hi = -1, obs = false;
    for (let x = 0; x < w; x++) {
      const ta = vue.t1 + x * tpp;
      if (ta >= tMax) break;
      if (!BM.plageColonnes(g, ta, Math.min(ta + tpp, tMax), r)) continue;
      if (r[0] !== cle0 || r[1] !== cle1) {
        if (obs) { colB.fill(0, lo - pbMin, hi - pbMin + 1); colA.fill(0, lo - pbMin, hi - pbMin + 1); }
        cle0 = r[0]; cle1 = r[1];
        accumuler(g, cle0, cle1, colB, colA, acc);
        obs = acc[0] === 1; lo = acc[1]; hi = acc[2];
      }
      if (!obs) continue;
      for (let y = 0; y < h; y++) {
        const a = ja[y], b = jb[y];
        if (b < lo || a > hi) continue;              // hors bande observée : la hachure reste
        let vb = 0, va = 0;
        const k0 = Math.max(0, Math.max(lo, a) - pbMin), k1 = Math.min(H - 1, Math.min(hi, b) - pbMin);
        for (let k = k0; k <= k1; k++) { if (colB[k] > vb) vb = colB[k]; if (colA[k] > va) va = colA[k]; }
        px[y * w + x] = lut ? lut[vb > va ? vb : va] : (vb >= va ? lutB[vb] : lutA[va]);
      }
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
    if (depth.bids && depth.bids.length) { out.meilleurBid = +depth.bids[0][0]; out.bas = Math.floor(+depth.bids[depth.bids.length - 1][0] / dp); }
    if (depth.asks && depth.asks.length) { out.meilleurAsk = +depth.asks[0][0]; out.haut = Math.floor(+depth.asks[depth.asks.length - 1][0] / dp); }
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
  BM.SeauxExecutions = function (dp) {
    this.dp = dp || 1;
    this.seaux = new Map();     // seconde -> Map(tranche -> [achat, vente])
    this.pxs = new Map();       // seconde -> [Σ p·q, Σ q]
    this.triees = []; this.trieesOk = true;   // secondes triées (index des fenêtres)
    this.premier = null; this.dernier = null; this.dernierId = null; this.dernierPrix = null;
    this.total = [0, 0];
  };
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
  SX.purger = function (avantMs) {
    const lim = Math.floor(avantMs / 1000);
    for (const s of this.seaux.keys()) if (s < lim) { this.seaux.delete(s); this.pxs.delete(s); }
    if (this.trieesOk) { let i = 0; while (i < this.triees.length && this.triees[i] < lim) i++; if (i) this.triees = this.triees.slice(i); }
    if (this.premier !== null && this.premier < avantMs) this.premier = avantMs;
  };
  /** Secondes de [ta, tb[ (triées). */
  SX.secondes = function (ta, tb) {
    if (!this.trieesOk) { this.triees = [...this.seaux.keys()].sort((a, b) => a - b); this.trieesOk = true; }
    const T = this.triees, s0 = Math.floor(ta / 1000), s1 = Math.ceil(tb / 1000);
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
  SX.regrouper = function (ta, tb, pasT, pasP) {
    const out = new Map(), m = Math.max(1, Math.round(pasP / this.dp)), pasPx = m * this.dp;
    const t0 = Math.floor(ta / pasT) * pasT, t1 = Math.ceil(tb / pasT) * pasT;
    for (const s of this.secondes(t0, t1)) {
      const T = Math.floor(s * 1000 / pasT);
      for (const [pb, v] of this.seaux.get(s)) {
        const P = Math.floor(pb / m), k = T + ':' + P;
        let e = out.get(k);
        if (!e) { e = { T, P, ta: T * pasT, tb: (T + 1) * pasT, pa: P * pasPx, pb: (P + 1) * pasPx, p: (P + 0.5) * pasPx, achat: 0, vente: 0, s0: s, s1: s }; out.set(k, e); }
        e.achat += v[0]; e.vente += v[1];
        if (s < e.s0) e.s0 = s;
        if (s > e.s1) e.s1 = s;
      }
    }
    for (const e of out.values()) e.t = (e.s0 + e.s1 + 1) * 500;
    return [...out.values()];
  };
  /** Profil des exécutions par tranche de prix sur [ta, tb[ (tranches de pasP $, multiple de dp). */
  SX.profil = function (ta, tb, pasP) {
    const out = new Map(), m = Math.max(1, Math.round(pasP / this.dp));
    for (const s of this.secondes(ta, tb)) {
      for (const [pb, v] of this.seaux.get(s)) {
        const P = Math.floor(pb / m);
        const e = out.get(P) || [0, 0];
        e[0] += v[0]; e[1] += v[1]; out.set(P, e);
      }
    }
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
  BM.prix = function (p, dec) {
    if (p === null || p === undefined || !isFinite(p)) return '—';
    return p.toLocaleString('fr-FR', { minimumFractionDigits: dec || 0, maximumFractionDigits: dec || 0 });
  };
  BM.btc = function (q) {
    if (!isFinite(q)) return '≥ ' + q;
    if (q >= 100) return Math.round(q).toLocaleString('fr-FR');
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
  BM.BULLES = { rMin: 2, rMax: 28, k: 3.2 };
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

  if (typeof module !== 'undefined' && module.exports) module.exports = BM;
  else racine.BM = BM;
})(typeof window !== 'undefined' ? window : globalThis);
