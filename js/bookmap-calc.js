/* ══════════════════════════════════════════════════════════════════════════════
   Saṃsāra — Carte (bookmap) : les CALCULS, sans DOM ni réseau.
   Chargé par bookmap.html avant js/bookmap.js ; chargé tel quel par tests/test_bookmap.js.

   CE QUE LA CARTE SUPERPOSE — trois horloges sur une même surface
   ────────────────────────────────────────────────────────────────
   · la carte PUBLIÉE (heatmap.json) : une colonne par minute, une tranche par 20 $, publiée
     toutes les 15 min — elle a donc jusqu'à ~16 min de retard sur le présent ;
   · les MURS et le GAMMA (market-data.json) : un instantané par quart d'heure ;
   · le carnet LIVE et les EXÉCUTIONS, lus par la page elle-même sur Binance, à la seconde.
   Chaque calque porte son âge SUR la carte : aucun chiffre n'y est lu sans son instant.

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

  /** Centile (0..1) d'une liste de nombres. */
  BM.centile = function (xs, p) {
    if (!xs.length) return 0;
    const s = Float64Array.from(xs).sort();
    return s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))];
  };

  // ─── Exécutions ────────────────────────────────────────────────────────────
  /** aggTrades -> seaux (seconde, tranche de dp $) : volumes achetés / vendus au marché.
   *  `m` (buyer is maker) = le VENDEUR a pris la liquidité : c'est une vente au marché. */
  BM.SeauxExecutions = function (dp) {
    this.dp = dp || 1;
    this.seaux = new Map();     // seconde -> Map(tranche -> [achat, vente])
    this.premier = null; this.dernier = null; this.dernierId = null; this.dernierPrix = null;
    this.total = [0, 0];
  };
  BM.SeauxExecutions.prototype.ajouter = function (t) {
    if (this.dernierId !== null && t.a <= this.dernierId) return false;      // déjà compté
    const s = Math.floor(t.T / 1000), pb = Math.floor(+t.p / this.dp), q = +t.q, cote = t.m ? 1 : 0;
    let m = this.seaux.get(s);
    if (!m) { m = new Map(); this.seaux.set(s, m); }
    const v = m.get(pb) || [0, 0];
    v[cote] += q; m.set(pb, v);
    this.total[cote] += q;
    if (this.premier === null || t.T < this.premier) this.premier = t.T;
    if (this.dernier === null || t.T >= this.dernier) { this.dernier = t.T; this.dernierPrix = +t.p; }
    if (this.dernierId === null || t.a > this.dernierId) this.dernierId = t.a;
    return true;
  };
  /** Ajout de trades plus ANCIENS que le premier (remplissage arrière) : on ne dépend pas
   *  de `dernierId`, on vérifie l'unicité par identifiant. */
  BM.SeauxExecutions.prototype.ajouterAncien = function (t, vus) {
    if (vus.has(t.a)) return false;
    vus.add(t.a);
    const s = Math.floor(t.T / 1000), pb = Math.floor(+t.p / this.dp), q = +t.q, cote = t.m ? 1 : 0;
    let m = this.seaux.get(s);
    if (!m) { m = new Map(); this.seaux.set(s, m); }
    const v = m.get(pb) || [0, 0];
    v[cote] += q; m.set(pb, v);
    this.total[cote] += q;
    if (this.premier === null || t.T < this.premier) this.premier = t.T;
    return true;
  };
  BM.SeauxExecutions.prototype.purger = function (avantMs) {
    const lim = Math.floor(avantMs / 1000);
    for (const s of this.seaux.keys()) if (s < lim) this.seaux.delete(s);
    if (this.premier !== null && this.premier < avantMs) this.premier = avantMs;
  };
  /** Regroupe les seaux d'un intervalle [ta, tb[ par pas de temps (ms) et de prix ($).
   *  La SOMME des volumes est conservée (contrôlé par le harnais). */
  BM.SeauxExecutions.prototype.regrouper = function (ta, tb, pasT, pasP) {
    const out = new Map();
    const s0 = Math.floor(ta / 1000), s1 = Math.ceil(tb / 1000);
    for (const [s, m] of this.seaux) {
      if (s < s0 || s >= s1) continue;
      const T = Math.floor((s * 1000 - ta) / pasT);
      for (const [pb, v] of m) {
        const P = Math.floor((pb * this.dp) / pasP);
        const k = T + ':' + P;
        const e = out.get(k);
        if (e) { e.achat += v[0]; e.vente += v[1]; }
        else out.set(k, { t: ta + (T + 0.5) * pasT, p: (P + 0.5) * pasP, achat: v[0], vente: v[1] });
      }
    }
    return [...out.values()];
  };
  /** Profil des exécutions par tranche de prix sur [ta, tb[. */
  BM.SeauxExecutions.prototype.profil = function (ta, tb, pasP) {
    const out = new Map();
    const s0 = Math.floor(ta / 1000), s1 = Math.ceil(tb / 1000);
    for (const [s, m] of this.seaux) {
      if (s < s0 || s >= s1) continue;
      for (const [pb, v] of m) {
        const P = Math.floor((pb * this.dp) / pasP);
        const e = out.get(P) || [0, 0];
        e[0] += v[0]; e[1] += v[1]; out.set(P, e);
      }
    }
    return out;
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
  /** Fusionne de nouvelles minutes dans une série triée (la dernière, en cours, est remplacée). */
  BM.fusionnerMinutes = function (serie, neuves) {
    if (!neuves.length) return serie;
    const t0 = neuves[0].t;
    const garde = serie.filter(m => m.t < t0);
    return garde.concat(neuves);
  };
  /** CVD cumulé à partir de l'indice i0 (0 au bord gauche de la vue). */
  BM.cvdDepuis = function (serie, i0) {
    const out = new Float64Array(serie.length);
    let s = 0;
    for (let i = 0; i < serie.length; i++) { if (i >= i0) s += serie[i].delta; out[i] = i >= i0 ? s : NaN; }
    return out;
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
    return {
      murs, mursA: at, tranche: lq.wall_bin_usd || null, unite: lq.unit || null,
      gamma, gammaA: g, regime: mi.gex_state || null, convention: mi.gex_convention || null,
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
  BM.validiteLecture = function (cadence) { return 3 * cadence + 1000; };

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
  /** Un pas « rond » pour les graduations : 1, 2, 5 × 10ⁿ ≥ brut. */
  BM.pasRond = function (brut) {
    const e = Math.pow(10, Math.floor(Math.log10(brut)));
    for (const m of [1, 2, 2.5, 5, 10]) if (m * e >= brut) return m * e;
    return 10 * e;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = BM;
  else racine.BM = BM;
})(typeof window !== 'undefined' ? window : globalThis);
