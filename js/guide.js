// ═══════════════════════════════════════════════════════════════════════════════
// GUIDE — ce que le graphique montre, dit en mots. Jamais quoi en faire.
// ─────────────────────────────────────────────────────────────────────────────
// Le calque « Guide » du graphique (js/app.js le dessine) repose sur ce cœur PUR, testé hors
// ligne (tests/test_guide.js) :
//   1. NIVEAUX NOMMÉS : au plus N au-dessus et N au-dessous du prix, chacun avec son ORIGINE
//      (plus haut d'hier, plus bas des 24 h, zone touchée k fois, mur du carnet, mur d'options,
//      zéro gamma). Deux niveaux proches ne font qu'une bande, qui dit ses deux raisons.
//   2. ÉTAT D'UN NIVEAU, sur les bougies CLOSES de l'intervalle affiché, selon la règle de
//      travail du propriétaire (une règle, pas une mesure) : une cassure est validée par deux
//      clôtures successives au-delà, ou une clôture suivie d'un retour réussi ; un niveau
//      traversé par une mèche seule est « percé en mèche », pas « cassé ».
//   3. RÉGIME : ADX, +DI/−DI, EMA courte/longue, largeur de Bollinger — seuils de CONVENTION.
//   4. FORMES : double sommet, double creux, range, triangle, détectés mécaniquement (pivots
//      fractals, tolérance en ATR), avec un état qui évolue, et leur BILAN MESURÉ sur
//      l'historique chargé, rejoué sans regarder l'avenir.
//   5. ET ENSUITE ? : deux chemins conditionnels tirés des niveaux nommés — aucune probabilité.
//   6. LECTURE DU MOMENT : une ou deux phrases construites avec ce qui précède, rien d'autre.
//
// Tous les nombres viennent de P = PARAM.guide (js/app.js). Une valeur absente est dite
// absente, jamais 0. Le mode (débutant / expert) change les MOTS, jamais une valeur.
// Les phrases DÉCRIVENT : aucune ne dit d'acheter, de vendre, ni n'attribue d'intention.
// ═══════════════════════════════════════════════════════════════════════════════
const Guide = (function () {
  'use strict';
  const fini = x => typeof x === 'number' && isFinite(x);

  // ─── Formats : « 84 120 $ », « +1,2 % », jamais un libellé qui commence par « $ » ───
  function nombre(v, dec) {
    return v.toLocaleString('fr-FR', { minimumFractionDigits: dec, maximumFractionDigits: dec }).replace(/[  ]/g, ' ');
  }
  function decimales(v) { const a = Math.abs(v); return a >= 1000 ? 0 : a >= 10 ? 2 : a >= 1 ? 4 : 6; }
  function prix(v, unite) {
    if (!fini(v)) return '—';
    const d = decimales(v);
    return v.toLocaleString('fr-FR', { minimumFractionDigits: Math.min(d, 2), maximumFractionDigits: d }).replace(/[\u202f\u00a0]/g, ' ') + ' ' + (unite || '$');
  }
  function pct(x, dec) {
    if (!fini(x)) return '—';
    const d = dec === undefined ? 1 : dec, a = nombre(Math.abs(x), d);
    return (Math.abs(x) < 0.5 * Math.pow(10, -d) ? '' : x > 0 ? '+' : '−') + a + ' %';
  }
  /** « 15m » → « 15 min », « 4h » → « 4 h », « 1d » → « 1 jour », « 1w » → « 1 semaine ». */
  function nomIntervalle(itv) {
    const m = /^(\d+)([mhdw])$/.exec(String(itv || ''));
    if (!m) return String(itv || '');
    const n = +m[1];
    return n + ({ m: ' min', h: ' h', d: n > 1 ? ' jours' : ' jour', w: n > 1 ? ' semaines' : ' semaine' })[m[2]];
  }
  /** Durée en secondes → « 31 j » / « 18 h » / « 45 min ». */
  function duree(s) {
    if (!fini(s) || s < 0) return '—';
    if (s >= 2 * 86400) return Math.round(s / 86400) + ' j';
    if (s >= 2 * 3600) return Math.round(s / 3600) + ' h';
    return Math.max(1, Math.round(s / 60)) + ' min';
  }
  const heureUTC = ms => fini(ms) ? new Date(ms).toISOString().slice(11, 16) : '—';

  // ─── 1. Niveaux nommés ─────────────────────────────────────────────────────
  // Chaque RAISON porte : son nom (débutant), son nom court (expert), sa forme avec article
  // (pour la phrase), sa nature (mesuré / modèle) et, le cas échéant, son détail daté.
  const RAISONS = {
    hier_haut: ['Plus haut d’hier', 'H veille', 'le plus haut d’hier', 'le plus haut atteint hier (journée UTC) sur les bougies de ce graphique'],
    hier_bas: ['Plus bas d’hier', 'B veille', 'le plus bas d’hier', 'le plus bas atteint hier (journée UTC) sur les bougies de ce graphique'],
    sem_haut: ['Plus haut de la semaine dernière', 'H sem. préc.', 'le plus haut de la semaine dernière', 'le plus haut de la bougie de la semaine précédente'],
    sem_bas: ['Plus bas de la semaine dernière', 'B sem. préc.', 'le plus bas de la semaine dernière', 'le plus bas de la bougie de la semaine précédente'],
    h24_haut: ['Plus haut des 24 h', 'H 24 h', 'le plus haut des 24 h', 'le plus haut des dernières 24 h glissantes, bougie en cours comprise'],
    h24_bas: ['Plus bas des 24 h', 'B 24 h', 'le plus bas des 24 h', 'le plus bas des dernières 24 h glissantes, bougie en cours comprise'],
  };
  function raison(cle, p, extra) {
    const r = RAISONS[cle];
    return Object.assign({ cle, p, nom: r ? r[0] : cle, court: r ? r[1] : cle, art: r ? r[2] : cle, origine: r ? r[3] : '', nature: 'mesuré', detail: '', detailCourt: '' }, extra || {});
  }
  /** Plus haut / plus bas d'hier et des 24 h, lus sur les bougies du graphique.
   *  T, H, L : colonnes (T en secondes) ; n : nombre de bougies (la dernière est en cours) ;
   *  pas : durée d'une bougie en secondes. Un niveau dont la fenêtre n'est pas entièrement
   *  chargée n'est PAS produit (pas de « plus haut d'hier » calculé sur une demi-journée). */
  function niveauxDuJour(T, H, L, n, pas) {
    const out = [];
    if (n < 2 || !(pas > 0)) return out;
    const tl = T[n - 1];
    if (pas < 86400) {
      const jour = Math.floor(tl / 86400), d0 = (jour - 1) * 86400, d1 = jour * 86400;
      if (T[0] <= d0) {
        let hi = -Infinity, lo = Infinity;
        for (let i = n - 1; i >= 0 && T[i] >= d0; i--) if (T[i] < d1) { if (H[i] > hi) hi = H[i]; if (L[i] < lo) lo = L[i]; }
        if (hi > -Infinity) { out.push(raison('hier_haut', hi)); out.push(raison('hier_bas', lo)); }
      }
      const t24 = tl + pas - 86400;
      if (T[0] <= t24) {
        let hi = -Infinity, lo = Infinity;
        for (let i = n - 1; i >= 0 && T[i] >= t24; i--) { if (H[i] > hi) hi = H[i]; if (L[i] < lo) lo = L[i]; }
        if (hi > -Infinity) { out.push(raison('h24_haut', hi)); out.push(raison('h24_bas', lo)); }
      }
    } else {
      const sem = pas >= 604800;
      out.push(raison(sem ? 'sem_haut' : 'hier_haut', H[n - 2]));
      out.push(raison(sem ? 'sem_bas' : 'hier_bas', L[n - 2]));
    }
    return out;
  }
  /** Supports / résistances de la page (getMultiTFLevels) : « Zone touchée 4 fois (4h) ». */
  function niveauxSR(levels, P) {
    return (levels || []).filter(l => fini(l.price) && l.touches >= P.touchesMin).map(l => raison('sr', l.price, {
      nom: 'Zone touchée ' + l.touches + ' fois (' + l.tf + ')', court: 'S/R ×' + l.touches + ' ' + l.tf,
      art: 'une zone touchée ' + l.touches + ' fois (' + l.tf + ')',
      origine: 'des pivots (sommets et creux locaux) regroupés : le prix a fait demi-tour ' + l.touches + ' fois autour de ce prix, sur les bougies ' + l.tf + ' (méthode S/R de la page)',
      touches: l.touches, tf: l.tf }));
  }
  /** market-data.json (BTCUSDT seulement) : le plus gros mur de chaque côté du carnet, et les
   *  niveaux d'options — ceux-ci reposent sur une hypothèse : nature « modèle ». Chaque niveau
   *  porte l'heure de sa lecture (« lu à HH:MM »). */
  function niveauxPublies(md) {
    const out = [];
    if (!md) return out;
    const lq = md.liquidity || {}, mi = md.micro || {};
    const tMurs = Date.parse(lq.snapshot_at || md.updated), tPub = Date.parse(md.updated);
    const bin = fini(lq.wall_bin_usd) ? lq.wall_bin_usd : 0;
    for (const [cote, cle, nom, court, art] of [['bid_walls', 'mur_achat', 'Mur d’achat du carnet', 'Mur bid', 'un mur d’achat du carnet'],
      ['ask_walls', 'mur_vente', 'Mur de vente du carnet', 'Mur ask', 'un mur de vente du carnet']]) {
      const murs = (lq[cote] || []).filter(m => Array.isArray(m) && fini(m[0]) && fini(m[1]));
      if (!murs.length) continue;
      const m = murs.reduce((a, b) => (b[1] > a[1] ? b : a));
      const q = nombre(m[1], m[1] >= 10 ? 0 : 1) + ' BTC';
      out.push(raison(cle, m[0] + bin / 2, { nom, court, art, nature: 'mesuré', lu: tMurs,
        detail: q + ' · lu à ' + heureUTC(tMurs), detailCourt: q + ' · ' + heureUTC(tMurs),
        origine: 'la tranche de ' + bin + ' $ où le plus de BTC étaient posés ' + (cote === 'bid_walls' ? 'à l’achat' : 'à la vente') + ' dans le carnet Binance, lue à ' + heureUTC(tMurs) + ' UTC (photo publiée ; un ordre posé peut être retiré)' }));
    }
    // Les strikes sont en USD, l'axe en USDT : placés à p / (USDT en USD) quand le fichier le
    // publie (comme la carte) ; le libellé garde le strike publié.
    const taux = +mi.usdt_usd, conv = taux > 0 && isFinite(taux) ? taux : 1;
    for (const [champ, cle, nom, court, art, origine] of [
      ['put_wall', 'put_wall', 'Mur d’options (puts)', 'Put wall', 'le mur d’options (puts)', 'le prix d’exercice des puts au plus grand GEX (Deribit)'],
      ['call_wall', 'call_wall', 'Mur d’options (calls)', 'Call wall', 'le mur d’options (calls)', 'le prix d’exercice des calls au plus grand GEX (Deribit)'],
      ['zero_gamma', 'zero_gamma', 'Zéro gamma', 'ZG', 'le zéro gamma', 'le prix où l’exposition gamma estimée des teneurs de marché changerait de signe']]) {
      const v = mi[champ];
      if (!fini(v)) continue;
      out.push(raison(cle, v / conv, { nom, court, art, nature: 'modèle', lu: tPub, strike: v,
        detail: 'modèle · lu à ' + heureUTC(tPub), detailCourt: 'modèle · ' + heureUTC(tPub),
        origine: origine + ' ; un MODÈLE (hypothèse sur la position des teneurs de marché), publié à ' + heureUTC(tPub) + ' UTC' }));
    }
    return out;
  }
  /** Regroupe les raisons à moins de P.fusion (fraction du prix) en une seule bande, garde
   *  celles à moins de P.distanceMax du prix de référence, puis les P.niveauxParCote plus
   *  proches de chaque côté. → { dessus: [niv], dessous: [niv] } ; niv = { p, raisons }. */
  function choisirNiveaux(raisons, ref, P) {
    const ok = raisons.filter(r => fini(r.p) && r.p > 0 && fini(ref) && Math.abs(r.p - ref) / ref <= P.distanceMax).sort((a, b) => a.p - b.p);
    const groupes = [];
    for (const r of ok) {
      const g = groupes[groupes.length - 1];
      if (g && Math.abs(r.p - g.p) / g.p < P.fusion) {
        if (!g.raisons.some(x => x.cle === r.cle && x.nom === r.nom)) g.raisons.push(r);
        g.prix.push(r.p); g.p = g.prix.reduce((a, b) => a + b, 0) / g.prix.length;
      } else groupes.push({ p: r.p, prix: [r.p], raisons: [r] });
    }
    const dessus = groupes.filter(g => g.p > ref).sort((a, b) => a.p - b.p).slice(0, P.niveauxParCote);
    const dessous = groupes.filter(g => g.p <= ref).sort((a, b) => b.p - a.p).slice(0, P.niveauxParCote);
    for (const g of dessus) g.dessus = true;
    for (const g of dessous) g.dessus = false;
    return { dessus, dessous };
  }
  const minuscule = s => s ? s.charAt(0).toLowerCase() + s.slice(1) : s;
  /** Le libellé d'une bande : son ORIGINE en mots (débutant) ou en abrégé (expert). */
  function libelleNiveau(niv, mode, unite) {
    const R = niv.raisons, exp = mode === 'expert';
    const px = exp ? nombre(niv.p, decimales(niv.p)) : prix(niv.p, unite);
    if (R.length === 1) return [exp ? R[0].court : R[0].nom, px, exp ? R[0].detailCourt : R[0].detail].filter(Boolean).join(' · ');
    // Plusieurs raisons : le prix d'abord, puis chaque raison avec SON détail (quantité, heure).
    const une = r => (exp ? r.court : minuscule(r.nom)) + ((exp ? r.detailCourt : r.detail) ? ' (' + (exp ? r.detailCourt : r.detail) + ')' : '');
    return exp ? R.map(une).join(' + ') + ' · ' + px : R.length + ' raisons · ' + px + ' : ' + R.map(une).join(' + ');
  }

  // ─── 2. État d'un niveau : la règle de cassure, sur les bougies closes ─────
  /** C, H, L : colonnes ; n : nombre de bougies CLOSES (indices 0..n−1) ; p : le niveau ;
   *  demi : demi-hauteur de sa bande. Une clôture « au-delà » est une clôture hors de la bande.
   *  → { cassure: null | 'demi' | 'valide', sens: ±1, retest, meche, mecheSens } */
  function etatFerme(C, H, L, n, p, demi, P) {
    const res = { cassure: null, sens: 0, retest: false, meche: false, mecheSens: 0, cote: 0 };
    if (n < 2 || !fini(p)) return res;
    const cote = c => (c > p + demi ? 1 : c < p - demi ? -1 : 0);
    const s = cote(C[n - 1]);
    res.cote = s;
    if (s) {
      let r = 0;
      while (r < P.regardCassure && n - 1 - r >= 0 && cote(C[n - 1 - r]) === s) r++;
      let j = n - 1 - r;
      const lim = n - 1 - P.regardCassure;
      while (j >= 0 && j > lim && cote(C[j]) === 0) j--;
      if (r < P.regardCassure && j >= 0 && j > lim && cote(C[j]) === -s) {
        res.cassure = r >= 2 ? 'valide' : 'demi'; res.sens = s;
        // Retour réussi : la 2e clôture au-delà a vu sa mèche revenir sur la bande.
        if (r >= 2) { const k = n - r + 1; res.retest = s > 0 ? L[k] <= p + demi : H[k] >= p - demi; }
      }
    }
    if (!res.cassure) {
      for (let k = n - 1; k >= Math.max(0, n - P.mecheBougies); k--) {
        if (s <= 0 && H[k] > p + demi && C[k] <= p) { res.meche = true; res.mecheSens = 1; break; }
        if (s >= 0 && L[k] < p - demi && C[k] >= p) { res.meche = true; res.mecheSens = -1; break; }
      }
    }
    return res;
  }
  const MOTS = { loin: 'loin', proche: 'proche', test: 'en test', meche: 'percé en mèche', franchi: 'franchi en séance (clôture à venir)',
    demi: 'cassé (1/2 clôtures)', valide: 'cassé (2/2 clôtures, validé)' };
  /** L'état du moment, au prix LIVE : la distance (en % du prix live) et un mot.
   *  niv : { p, demi, dessus, ferme } ; cur : la bougie en cours { high, low } ou null. */
  function etatLive(niv, live, cur, P) {
    if (!fini(live) || live <= 0 || !niv) return { mot: null, dist: null };
    const dist = (niv.p - live) / live * 100, f = niv.ferme || {};
    const dedans = Math.abs(live - niv.p) <= niv.demi;
    let mot;
    if (f.cassure === 'valide') mot = 'valide';
    else if (dedans) mot = 'test';
    else if (f.cassure === 'demi') mot = 'demi';
    else {
      const auDela = niv.dessus ? live > niv.p + niv.demi : live < niv.p - niv.demi;
      const mecheCours = !!cur && (niv.dessus ? cur.high > niv.p + niv.demi : cur.low < niv.p - niv.demi);
      if (auDela) mot = 'franchi';
      else if (f.meche || mecheCours) mot = 'meche';
      else mot = Math.abs(dist) < P.proche * 100 ? 'proche' : 'loin';
    }
    // Une cassure dit son sens : « cassé vers le bas (2/2 clôtures, validé) ».
    const texte = (mot === 'valide' || mot === 'demi') ? MOTS[mot].replace('cassé', 'cassé vers le ' + (f.sens > 0 ? 'haut' : 'bas')) : MOTS[mot];
    return { mot, dist, texte };
  }
  function texteEtatLive(e, mode) {
    if (!e || e.mot === null) return mode === 'expert' ? 'prix live absent' : 'prix live absent : distance inconnue';
    return mode === 'expert' ? pct(e.dist, 2) + ' live · ' + e.texte : 'à ' + pct(e.dist, 2) + ' du prix live · ' + e.texte;
  }

  // ─── 3. Régime du marché (convention) ──────────────────────────────────────
  /** Rang centile (au plus proche rang) des valeurs finies de a[i−F+1..i]. */
  function centile(a, i, F, q) {
    const v = [];
    for (let j = Math.max(0, i - F + 1); j <= i; j++) if (fini(a[j])) v.push(a[j]);
    if (!v.length) return null;
    v.sort((x, y) => x - y);
    return v[Math.max(0, Math.ceil(q / 100 * v.length) - 1)];
  }
  /** x = { adx, plusDI, minusDI, emaC, emaL, largeur } (colonnes alignées sur les bougies) ;
   *  i : la dernière bougie close. → { cle, adx, pdi, mdi, emaHaut, compression, depuis, ... } */
  function regime(x, i, P) {
    const a = x.adx && x.adx[i];
    if (!fini(a)) return { cle: 'inconnu', adx: null };
    const pdi = x.plusDI[i], mdi = x.minusDI[i], ec = x.emaC && x.emaC[i], el = x.emaL && x.emaL[i];
    const emaHaut = fini(ec) && fini(el) ? ec > el : null;
    let cle;
    if (a >= P.adxTendance) {
      if (pdi > mdi && emaHaut === true) cle = 'hausse';
      else if (pdi < mdi && emaHaut === false) cle = 'baisse';
      else cle = 'incertaine';
    } else if (a <= P.adxSans) cle = 'sans';
    else cle = 'faible';
    const r = { cle, adx: a, pdi, mdi, emaHaut, compression: false, depuis: null, largeur: null, seuil: null };
    const w = x.largeur && x.largeur[i];
    if (fini(w)) {
      r.largeur = w;
      r.seuil = centile(x.largeur, i, P.bbFenetre, P.bbPercentile);
      if (r.seuil !== null && w <= r.seuil) {
        r.compression = true;
        let j = i - 1;
        while (j >= 0 && (!fini(x.largeur[j]) || x.largeur[j] > w)) j--;
        r.depuis = j >= 0 ? i - j : null;          // null : plus bas de tout l'historique chargé
        r.histoire = i;
      }
    }
    return r;
  }
  const NOMS_REGIME = { hausse: 'Tendance haussière', baisse: 'Tendance baissière', incertaine: 'Tendance de sens incertain',
    sans: 'Sans tendance nette', faible: 'Tendance faible' };
  function texteRegime(r, mode, P) {
    if (!r || r.cle === 'inconnu') return mode === 'expert' ? 'ADX : historique insuffisant' : 'Régime : historique trop court pour le dire';
    const adx = Math.round(r.adx);
    if (mode === 'expert') {
      return 'ADX ' + adx + ' · +DI ' + Math.round(r.pdi) + ' / −DI ' + Math.round(r.mdi)
        + (r.emaHaut === null ? '' : ' · EMA' + P.emaCourte + (r.emaHaut ? ' > ' : ' < ') + 'EMA' + P.emaLongue)
        + (r.compression ? ' · largeur BB ≤ P' + P.bbPercentile + '/' + P.bbFenetre + (r.depuis === null ? ' (min. hist.)' : ' (min. ' + r.depuis + ' b.)') : '');
    }
    let t = NOMS_REGIME[r.cle] + ' (ADX ' + adx + ')';
    if (r.compression) t += ' · Compression : volatilité au plus bas depuis ' + (r.depuis === null ? 'le début de l’historique chargé' : r.depuis + ' bougies');
    return t;
  }

  // ─── 4. Formes chartistes ──────────────────────────────────────────────────
  /** Pivots fractals : un sommet en i dépasse STRICTEMENT les k bougies de chaque côté. Il n'est
   *  connu qu'à la clôture de i + k (champ c) : c'est là qu'il entre dans la détection. */
  function pivots(H, L, k, n) {
    const hauts = [], bas = [];
    for (let i = k; i < n - k; i++) {
      let ph = true, pl = true;
      for (let j = i - k; j <= i + k && (ph || pl); j++) {
        if (j === i) continue;
        if (H[j] >= H[i]) ph = false;
        if (L[j] <= L[i]) pl = false;
      }
      if (ph) hauts.push({ i, p: H[i], c: i + k });
      if (pl) bas.push({ i, p: L[i], c: i + k });
    }
    return { hauts, bas };
  }
  function regression(pts) {
    const n = pts.length;
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (const q of pts) { sx += q.i; sy += q.p; sxx += q.i * q.i; sxy += q.i * q.p; }
    const d = n * sxx - sx * sx;
    const b = d ? (n * sxy - sx * sy) / d : 0, a = (sy - b * sx) / n;
    return { a, b, en: i => a + b * i };
  }
  /** Double sommet (s = −1) ou double creux (s = +1) dont le 2e pivot vient d'être confirmé. */
  function doubleExtreme(piv, H, L, t, tol, atr, P, s) {
    const b = piv[piv.length - 1];
    if (!b || b.c !== t) return null;
    for (let m = piv.length - 2; m >= 0; m--) {
      const a = piv[m], ecart = b.i - a.i;
      if (ecart < P.ecartMin) continue;
      if (ecart > P.ecartMax) break;
      if (Math.abs(a.p - b.p) > tol) continue;
      let ext = s < 0 ? -Infinity : Infinity, cou = s < 0 ? Infinity : -Infinity, jc = -1;
      for (let j = a.i + 1; j < b.i; j++) {
        if (s < 0) { if (H[j] > ext) ext = H[j]; if (L[j] < cou) { cou = L[j]; jc = j; } }
        else { if (L[j] < ext) ext = L[j]; if (H[j] > cou) { cou = H[j]; jc = j; } }
      }
      // Rien entre les deux ne dépasse le moins marqué des deux extrêmes.
      if (s < 0 ? ext >= Math.min(a.p, b.p) : ext <= Math.max(a.p, b.p)) continue;
      const E = s < 0 ? Math.max(a.p, b.p) : Math.min(a.p, b.p), h = Math.abs(E - cou);
      if (h < P.hauteurMinAtr * atr) continue;
      return { type: s < 0 ? 'double_sommet' : 'double_creux', sens: s, a: { i: a.i, p: a.p }, b: { i: b.i, p: b.p }, cou: { i: jc, p: cou },
        niveau: cou, extreme: E, hauteur: h, objectif: cou + s * h, debut: a.i, depart: b.i + 1, t, tol };
    }
    return null;
  }
  function range(hauts, bas, H, L, t, tol, atr, P) {
    const hR = hauts[hauts.length - 1], bR = bas[bas.length - 1];
    if (!hR || !bR) return null;
    const lim = t - P.rangeFenetre, th = [], tb = [];
    for (let m = hauts.length - 1; m >= 0; m--) { const x = hauts[m]; if (x.i < lim || x.p > hR.p + tol) break; if (x.p >= hR.p - tol) th.push(x); }
    for (let m = bas.length - 1; m >= 0; m--) { const x = bas[m]; if (x.i < lim || x.p < bR.p - tol) break; if (x.p <= bR.p + tol) tb.push(x); }
    if (th.length < 2 || tb.length < 2) return null;
    const debut = Math.min(th[th.length - 1].i, tb[tb.length - 1].i);
    if (t - debut < P.rangeMin) return null;
    let U = -Infinity, D = Infinity;
    for (let j = debut; j <= t; j++) { if (H[j] > U) U = H[j]; if (L[j] < D) D = L[j]; }
    if (U > hR.p + tol || D < bR.p - tol) return null;
    const h = U - D;
    if (h > P.rangeHauteurAtr * atr || h < P.hauteurMinAtr * atr) return null;
    return { type: 'range', haut: U, bas: D, hauteur: h, debut, depart: t + 1, t, tol, touches: [th.length, tb.length] };
  }
  function triangle(hauts, bas, C, t, tol, P) {
    const q = P.triPivots;
    if (hauts.length < q || bas.length < q) return null;
    const hs = hauts.slice(-q), bs = bas.slice(-q), x0 = Math.min(hs[0].i, bs[0].i);
    if (t - x0 > P.triFenetre) return null;
    const rh = regression(hs), rb = regression(bs);
    if (hs.some(x => Math.abs(x.p - rh.en(x.i)) > tol) || bs.some(x => Math.abs(x.p - rb.en(x.i)) > tol)) return null;
    const w0 = rh.en(x0) - rb.en(x0), wt = rh.en(t) - rb.en(t);
    if (!(w0 > 0 && wt > 0 && wt <= (1 - P.triConvergence) * w0)) return null;
    if (C[t] > rh.en(t) || C[t] < rb.en(t)) return null;
    const apex = (rh.b - rb.b) < 0 ? -(rh.a - rb.a) / (rh.b - rb.b) : Infinity;
    return { type: 'triangle', hautL: { a: rh.a, b: rh.b }, basL: { a: rb.a, b: rb.b }, hauteur: w0, debut: x0, apex, depart: t + 1, t, tol,
      pivotsH: hs.map(x => ({ i: x.i, p: x.p })), pivotsB: bs.map(x => ({ i: x.i, p: x.p })) };
  }
  const ligne = (l, i) => l.a + l.b * i;
  /** Bornes d'une figure de sortie (range, triangle) à la bougie j. */
  function bornes(f, j) { return f.type === 'range' ? { u: f.haut, d: f.bas } : { u: ligne(f.hautL, j), d: ligne(f.basL, j) }; }
  /** Fait vivre une forme d'UNE bougie close (j) : sa machine d'état, sans regarder plus loin. */
  function avancer(f, j, S, P) {
    const C = S.c, H = S.h, L = S.l;
    const fin = cle => { f.fin = cle; f.jFin = j; };
    if (f.phase === 'confirme') {
      if (j <= f.jConf) return;
      const s = f.sens;
      if (s > 0 ? C[j] < f.invalidation : C[j] > f.invalidation) fin('invalide');
      else if (s > 0 ? H[j] >= f.objectif : L[j] <= f.objectif) fin('atteint');
      else if (j - f.jConf >= P.horizon) fin('expire');
      return;
    }
    if (f.type === 'double_sommet' || f.type === 'double_creux') {
      const s = f.sens, N = f.niveau, E = f.extreme;
      if (s < 0 ? C[j] > E : C[j] < E) { fin('invalide_avant'); return; }
      if (s < 0 ? C[j] < N : C[j] > N) {
        if (f.demi) { f.phase = 'confirme'; f.jConf = j; f.retest = s < 0 ? H[j] >= N - f.tol : L[j] <= N + f.tol; f.demi = false; f.invalidation = E; }
        else { f.demi = true; f.jDemi = j; }
      } else f.demi = false;
    } else {
      if (f.type === 'triangle' && j >= f.apex) { fin('expire_avant'); return; }
      const { u, d } = bornes(f, j), c = C[j], sc = c > u ? 1 : c < d ? -1 : 0;
      if (sc) {
        if (f.demi && f.demiSens === sc) {
          const b0 = bornes(f, f.jDemi);
          f.phase = 'confirme'; f.jConf = j; f.sens = sc; f.demi = false;
          f.niveau = sc > 0 ? b0.u : b0.d;
          f.objectif = f.niveau + sc * f.hauteur;
          f.invalidation = (b0.u + b0.d) / 2;
          f.retest = sc > 0 ? L[j] <= u + f.tol : H[j] >= d - f.tol;
        } else { f.demi = true; f.demiSens = sc; f.jDemi = j; }
      } else f.demi = false;
    }
    if (f.phase !== 'confirme' && j - f.t > P.expiration) fin('expire_avant');
  }
  const TYPES = ['double_sommet', 'double_creux', 'range', 'triangle'];
  /** Rejoue la détection sur les n bougies CLOSES de S = { h, l, c, atr, n } : chaque forme
   *  naît à la clôture où son dernier pivot devient connu (t), puis vit bougie après bougie.
   *  Aucune information postérieure à t n'entre dans sa détection : le bilan est celui qu'on
   *  aurait relevé en direct. → { formes, bilan, n } */
  function detecter(S, P) {
    const H = S.h, L = S.l, C = S.c, A = S.atr, n = S.n;
    const piv = pivots(H, L, P.pivot, n);
    const formes = [], actives = [], hauts = [], bas = [];
    let ih = 0, ib = 0;
    for (let t = 0; t < n; t++) {
      for (let a = actives.length - 1; a >= 0; a--) {
        avancer(actives[a], t, S, P);
        if (actives[a].fin) actives.splice(a, 1);
      }
      let nh = false, nb = false;
      while (ih < piv.hauts.length && piv.hauts[ih].c === t) { hauts.push(piv.hauts[ih++]); nh = true; }
      while (ib < piv.bas.length && piv.bas[ib].c === t) { bas.push(piv.bas[ib++]); nb = true; }
      if (!(nh || nb) || !fini(A[t]) || A[t] <= 0) continue;
      const tol = P.tolAtr * A[t], nouvelles = [];
      if (nh) { const f = doubleExtreme(hauts, H, L, t, tol, A[t], P, -1); if (f) nouvelles.push(f); }
      if (nb) { const f = doubleExtreme(bas, H, L, t, tol, A[t], P, 1); if (f) nouvelles.push(f); }
      const enCours = type => actives.some(f => f.type === type && f.phase !== 'confirme');
      if (!enCours('range')) { const f = range(hauts, bas, H, L, t, tol, A[t], P); if (f) nouvelles.push(f); }
      if (!enCours('triangle')) { const f = triangle(hauts, bas, C, t, tol, P); if (f) nouvelles.push(f); }
      for (const f of nouvelles) {
        Object.assign(f, { phase: 'formation', demi: false, fin: null, jFin: null, jConf: null });
        formes.push(f);
        for (let j = f.depart; j <= t && !f.fin; j++) avancer(f, j, S, P);
        if (!f.fin) actives.push(f);
      }
    }
    return { formes, bilan: bilan(formes), n };
  }
  function bilan(formes) {
    const b = {};
    for (const t of TYPES) b[t] = { formes: 0, confirmes: 0, atteints: 0, invalides: 0, expires: 0, ouverts: 0, invalidesAvant: 0, expiresAvant: 0 };
    for (const f of formes) {
      const x = b[f.type];
      x.formes++;
      if (f.fin === 'invalide_avant') x.invalidesAvant++;
      if (f.fin === 'expire_avant') x.expiresAvant++;
      if (f.jConf === null) continue;
      x.confirmes++;
      if (f.fin === 'atteint') x.atteints++;
      else if (f.fin === 'invalide') x.invalides++;
      else if (f.fin === 'expire') x.expires++;
      else x.ouverts++;
    }
    return b;
  }
  /** Les formes à montrer : vivantes, ou finies depuis moins de P.garderFini bougies ; les plus
   *  récentes d'abord, au plus P.formesMax. Une forme oubliée (délai écoulé) n'est pas montrée. */
  function formesAffichees(res, P) {
    if (!res) return [];
    const n = res.n;
    return res.formes.filter(f => !f.fin || (['atteint', 'invalide', 'invalide_avant'].includes(f.fin) && n - 1 - f.jFin <= P.garderFini))
      .sort((a, b) => b.t - a.t || b.debut - a.debut).slice(0, P.formesMax);
  }
  const NOMS_FORMES = { double_sommet: ['Double sommet', 'doubles sommets', 'un double sommet'], double_creux: ['Double creux', 'doubles creux', 'un double creux'],
    range: ['Range (rectangle)', 'ranges', 'un range'], triangle: ['Triangle / compression', 'triangles', 'un triangle (compression)'] };
  /** L'état d'une forme, en mots. → { cle, texte, court } */
  function etatForme(f) {
    const dbl = f.type === 'double_sommet' || f.type === 'double_creux';
    const dir = s => (s > 0 ? 'au-dessus' : 'en dessous');
    if (f.fin === 'atteint') return { cle: 'atteint', texte: 'objectif théorique atteint', court: 'objectif atteint' };
    if (f.fin === 'invalide' || f.fin === 'invalide_avant') return { cle: 'invalide',
      texte: dbl ? 'invalidé (clôture ' + (f.sens < 0 ? 'au-dessus des sommets' : 'sous les creux') + ')' : 'invalidé (clôture revenue au milieu de la figure)', court: 'invalidé' };
    if (f.fin) return { cle: 'oublie', texte: 'délai écoulé', court: 'délai écoulé' };
    if (f.phase === 'confirme') return dbl
      ? { cle: 'confirme', texte: 'confirmé (2 clôtures ' + (f.sens < 0 ? 'sous' : 'au-dessus de') + ' la ligne de cou)', court: 'confirmé 2/2' }
      : { cle: 'confirme', texte: 'sortie validée (2 clôtures ' + dir(f.sens) + ', vers le ' + (f.sens > 0 ? 'haut' : 'bas') + ')', court: 'sortie validée ' + (f.sens > 0 ? '↑' : '↓') };
    if (f.demi) return dbl
      ? { cle: 'demi', texte: 'cassure de la ligne de cou à confirmer (1/2 clôtures)', court: 'cassure 1/2' }
      : { cle: 'demi', texte: 'sortie à confirmer (1/2 clôtures ' + dir(f.demiSens) + ')', court: 'sortie 1/2 ' + (f.demiSens > 0 ? '↑' : '↓') };
    return dbl ? { cle: 'formation', texte: 'en formation', court: 'en formation' } : { cle: 'dedans', texte: 'le prix est dedans', court: 'dedans' };
  }
  /** Le bilan mesuré d'un type de forme, dit en une phrase (débutant) ou en abrégé (expert).
   *  ctx = { n, intervalle (« 15m »), duree (s) }. Sous P.echantillonFaible confirmations :
   *  « Échantillon faible. » Aucune probabilité n'est tirée de ces comptes. */
  function texteBilan(b, ctx, P, mode) {
    if (!b) return '';
    const faible = b.confirmes < P.echantillonFaible;
    const nb = nombre(ctx.n, 0), itv = nomIntervalle(ctx.intervalle), d = duree(ctx.duree);
    if (mode === 'expert') {
      return 'Hist. ' + nb + ' × ' + itv + ' (' + d + ') : ' + b.confirmes + ' conf. · obj. ' + b.atteints + ' · inval. ' + b.invalides
        + ' · ouv. ' + b.ouverts + ' · délai ' + b.expires + (faible ? ' · échantillon faible' : '');
    }
    return 'Mesuré sur l’historique chargé — sur les ' + nb + ' dernières bougies ' + itv + ' chargées (' + d + ') : '
      + (b.confirmes ? b.confirmes + (b.confirmes > 1 ? ' confirmés' : ' confirmé') + ', objectif atteint ' + b.atteints + ' fois avant invalidation, invalidé d’abord '
        + b.invalides + ' fois, ' + b.ouverts + ' encore ouvert' + (b.ouverts > 1 ? 's' : '') + ', ' + b.expires + ' sans issue après ' + P.horizon + ' bougies.'
        : 'aucun confirmé.')
      + (faible ? ' Échantillon faible.' : '');
  }

  // ─── 5. Et ensuite ? ────────────────────────────────────────────────────────
  /** Deux chemins conditionnels, pris dans les niveaux nommés (jamais inventés), sans rang. */
  function suite(choix) {
    const d = choix.dessus, b = choix.dessous;
    return { haut: d[0] ? { seuil: d[0], cible: d[1] || null, sens: 1 } : null, bas: b[0] ? { seuil: b[0], cible: b[1] || null, sens: -1 } : null };
  }
  function texteSuite(ch, mode, unite) {
    if (!ch) return [];
    const x = prix(ch.seuil.p, unite), y = ch.cible ? prix(ch.cible.p, unite) : null;
    if (mode === 'expert') return [(ch.sens > 0 ? 'Clôt. > ' : 'Clôt. < ') + x, '→ ' + (y || 'aucun niveau nommé')];
    return ['Si clôture ' + (ch.sens > 0 ? 'au-dessus de ' : 'sous ') + x, y ? '→ prochain niveau ' + y : '→ aucun autre niveau nommé proche'];
  }

  // ─── 6. Lecture du moment ──────────────────────────────────────────────────
  const deArt = s => /^le /.test(s) ? 'du ' + s.slice(3) : /^les /.test(s) ? 'des ' + s.slice(4) : 'de ' + s;
  const artDe = niv => niv.raisons[0].art;
  /** « (82 629 $) », ou « (82 629 $, 3 raisons) » pour une bande qui en regroupe plusieurs. */
  const entre = (niv, unite) => '(' + prix(niv.p, unite) + (niv.raisons.length > 1 ? ', ' + niv.raisons.length + ' raisons' : '') + ')';
  const PHRASES_REGIME = { hausse: 'marché en tendance haussière', baisse: 'marché en tendance baissière', incertaine: 'marché en tendance, de sens incertain',
    sans: 'marché sans tendance nette', faible: 'tendance faible' };
  function phraseForme(f, unite) {
    const nom = NOMS_FORMES[f.type][2], e = etatForme(f);
    switch (e.cle) {
      case 'formation': return nom + ' est en formation';
      case 'dedans': return f.type === 'range' ? 'le prix est dans ' + nom + ' (' + prix(f.bas, unite) + ' – ' + prix(f.haut, unite) + ')' : 'le prix est dans ' + nom;
      case 'demi': return nom + ' attend une 2e clôture pour confirmer sa sortie';
      case 'confirme': return nom + ' est confirmé (objectif théorique ' + prix(f.objectif, unite) + ', non garanti)';
      case 'atteint': return nom + ' a atteint son objectif théorique';
      case 'invalide': return nom + ' vient d’être invalidé';
      default: return '';
    }
  }
  /** o = { prix, unite, choix: { dessus, dessous }, enTest: niv | null, regime, forme, court }
   *  court : sans le régime (le badge le dit déjà) — pour un écran étroit. */
  function lecture(o) {
    const P = prix(o.prix, o.unite), d = o.choix && o.choix.dessus[0], b = o.choix && o.choix.dessous[0];
    let s1;
    if (!fini(o.prix)) s1 = 'Prix live absent.';
    else if (o.enTest) s1 = 'Le prix (' + P + ') teste ' + artDe(o.enTest) + ' ' + entre(o.enTest, o.unite) + '.';
    else if (d && b) s1 = 'Le prix (' + P + ') est entre ' + artDe(b) + ' ' + entre(b, o.unite) + ' et ' + artDe(d) + ' ' + entre(d, o.unite) + '.';
    else if (d) s1 = 'Le prix (' + P + ') est sous ' + artDe(d) + ' ' + entre(d, o.unite) + '.';
    else if (b) s1 = 'Le prix (' + P + ') est au-dessus ' + deArt(artDe(b)) + ' ' + entre(b, o.unite) + '.';
    else s1 = 'Le prix (' + P + ') n’a aucun niveau nommé proche.';
    const parts = [];
    if (o.regime && o.regime.cle !== 'inconnu' && !o.court) {
      parts.push(PHRASES_REGIME[o.regime.cle] + (o.regime.compression ? ', volatilité comprimée' : ''));
    }
    if (o.forme) { const t = phraseForme(o.forme, o.unite); if (t) parts.push(t); }
    if (!parts.length) return s1;
    const s2 = parts.join(' ; ');
    return s1 + ' ' + s2.charAt(0).toUpperCase() + s2.slice(1) + '.';
  }

  return { nombre, prix, pct, nomIntervalle, duree, heureUTC, niveauxDuJour, niveauxSR, niveauxPublies, choisirNiveaux, libelleNiveau,
    etatFerme, etatLive, texteEtatLive, MOTS, centile, regime, texteRegime, pivots, regression, detecter, bilan, formesAffichees,
    etatForme, NOMS_FORMES, texteBilan, suite, texteSuite, lecture, TYPES, bornes };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Guide;
