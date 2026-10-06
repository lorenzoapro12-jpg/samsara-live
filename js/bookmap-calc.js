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

  /** heatmap.json -> grille. La couverture de chaque colonne est DÉDUITE de ses cellules :
   *  de la plus basse cellule bid à la plus haute cellule ask (les niveaux sous le seuil
   *  d'affichage ne laissent pas de cellule ; la bande réelle est donc un peu plus large). */
  BM.grillePubliee = function (h) {
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

  /** Fusion par MAX : kt colonnes × kp tranches -> une cellule. Exact (√ croissante). */
  BM.fusionMax = function (g, kt, kp) {
    kt = Math.max(1, kt | 0); kp = Math.max(1, kp | 0);
    if (kt === 1 && kp === 1) return g;
    const P0 = Math.floor(g.pbMin / kp), P1 = Math.floor((g.pbMin + g.H - 1) / kp);
    const W2 = Math.ceil(g.W / kt), H2 = P1 - P0 + 1;
    const f = grilleVide(g.t0, g.dt * kt, W2, g.dp * kp, P0, H2);
    for (let c = 0; c < g.W; c++) {
      const C = (c / kt) | 0, o = c * g.H, O = C * H2;
      for (let h = 0; h < g.H; h++) {
        const J = Math.floor((g.pbMin + h) / kp) - P0;
        const vb = g.bids[o + h], va = g.asks[o + h];
        if (vb > f.bids[O + J]) f.bids[O + J] = vb;
        if (va > f.asks[O + J]) f.asks[O + J] = va;
      }
      if (g.bas[c] >= 0) {
        const b = Math.floor(g.bas[c] / kp), t = Math.floor(g.haut[c] / kp);
        if (f.bas[C] < 0 || b < f.bas[C]) f.bas[C] = b;
        if (t > f.haut[C]) f.haut[C] = t;
      }
    }
    f.encodage = g.encodage; f.majA = g.majA;
    return f;
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
