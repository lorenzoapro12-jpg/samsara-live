// ═══════════════════════════════════════════════════════════════════════════════
// GUIDE — ce que le graphique montre, dit en mots. Jamais quoi en faire.
// ─────────────────────────────────────────────────────────────────────────────
// Le calque « Guide » du graphique (js/app.js le dessine) repose sur ce cœur PUR, testé hors
// ligne (tests/test_guide.js) :
//   1. NIVEAUX NOMMÉS : au plus N au-dessus et N au-dessous du prix, chacun avec son ORIGINE
//      (plus haut d'hier, plus bas des 24 h, zone de demi-tours, mur du carnet, mur d'options,
//      zéro gamma). Des niveaux très proches ne font qu'une bande, qui couvre TOUS leurs prix et
//      dit chacun d'eux : aucun prix affiché n'est une moyenne.
//   2. ÉTAT D'UN NIVEAU, sur les bougies CLOSES de l'intervalle affiché, selon la règle de
//      travail du propriétaire (une règle, pas une mesure) : une cassure est validée par deux
//      clôtures successives au-delà, ou une clôture suivie d'un retour réussi ; un niveau
//      traversé par une mèche seule est « percé en mèche », pas « cassé ».
//   3. RÉGIME : ADX, +DI/−DI, EMA courte/longue, largeur de Bollinger — seuils de CONVENTION.
//   4. FORMES : double sommet, double creux, rectangle, triangle, détectés mécaniquement (pivots
//      fractals, tolérance en ATR), avec un état qui évolue, et leur BILAN MESURÉ sur
//      l'historique chargé, rejoué sans regarder l'avenir, à côté d'un repère SANS forme.
//   5. ET ENSUITE ? : deux chemins conditionnels tirés des niveaux nommés — aucune probabilité.
//   6. LECTURE DU MOMENT : une ou deux phrases construites avec ce qui précède, rien d'autre.
//
// Tous les nombres viennent de P = PARAM.guide (js/app.js). Une valeur absente est dite
// absente, jamais 0. Une valeur du fichier publié porte toujours son heure (« lu à HH:MM »).
// Le mode (débutant / expert) change les MOTS, jamais une valeur.
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
  function chiffres(v) {
    if (!fini(v)) return '—';
    const d = decimales(v);
    return v.toLocaleString('fr-FR', { minimumFractionDigits: Math.min(d, 2), maximumFractionDigits: d }).replace(/[  ]/g, ' ');
  }
  function prix(v, unite) { return fini(v) ? chiffres(v) + ' ' + (unite || '$') : '—'; }
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
  // Chaque RAISON porte : son prix sur l'axe (p), son nom (débutant), son nom court (expert),
  // sa forme avec article (pour la phrase), sa nature (mesuré / modèle) et, si elle vient du
  // fichier publié, l'heure de sa lecture (lu, en ms) — qu'aucun texte ne peut omettre (tagLu).
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
  const minuscule = s => s ? s.charAt(0).toLowerCase() + s.slice(1) : s;
  /** Le prix À DIRE d'une raison : le strike publié pour une option (en $), sinon son prix d'axe. */
  const prixR = (r, unite) => fini(r.strike) ? prix(r.strike, '$') : prix(r.p, unite);
  const chiffresR = r => chiffres(fini(r.strike) ? r.strike : r.p);
  /** L'heure de lecture d'une raison publiée (et « modèle »), sous trois formes :
   *  phrase (« lu à 15:03 » / « , modèle, lu à 15:03 »), parenthèse débutant, parenthèse expert. */
  function tagLu(r, forme) {
    if (!r || !fini(r.lu)) return '';
    const m = r.nature === 'modèle', h = heureUTC(r.lu);
    if (forme === 'phrase') return (m ? ', modèle,' : '') + ' lu à ' + h;
    if (forme === 'expert') return ' (' + (m ? 'modèle · ' : '') + h + ')';
    return ' (' + (m ? 'modèle, ' : '') + 'lu à ' + h + ')';
  }
  /** « un mur d'achat du carnet lu à 15:03 » : l'article, le nom, et l'heure si publiée. */
  const artLu = r => (r.art || minuscule(r.nom)) + tagLu(r, 'phrase');
  /** Sans article : « mur d'achat du carnet lu à 15:03 », « plus bas d'hier ». */
  const quoi = r => minuscule(r.nom) + tagLu(r, 'phrase');

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
  /** Supports / résistances de la page (méthode S/R), sur l'intervalle AFFICHÉ seulement :
   *  « Zone de 4 demi-tours (bougies 4 h) ». `touches` compte les pivots (sommets et creux
   *  locaux) regroupés autour du prix — un nombre de demi-tours, pas de « contacts ».
   *  meta = { bougies, pivot, tolMin, tolMax } : la méthode, pour l'explication. */
  function niveauxSR(levels, P, meta) {
    const m = meta || {};
    return (levels || []).filter(l => fini(l.price) && l.touches >= P.touchesMin).map(l => {
      const itv = nomIntervalle(l.tf);
      return raison('sr', l.price, {
        nom: 'Zone de ' + l.touches + ' demi-tours (bougies ' + itv + ')', court: 'S/R ×' + l.touches + ' ' + itv,
        art: 'une zone de ' + l.touches + ' demi-tours (bougies ' + itv + ')',
        origine: l.touches + ' sommets ou creux locaux (pivots' + (m.pivot ? ' de ' + m.pivot + ' bougies de chaque côté' : '') + ') regroupés autour de ce prix'
          + (m.bougies ? ', sur les ' + m.bougies + ' dernières bougies ' + itv : ', sur les bougies ' + itv)
          + (fini(m.tolMin) && fini(m.tolMax) ? ' (méthode S/R de la page : tolérance entre ' + nombre(m.tolMin * 100, 1) + ' et ' + nombre(m.tolMax * 100, 1) + ' % du prix, selon l’ATR)' : ' (méthode S/R de la page)'),
        touches: l.touches, tf: l.tf });
    });
  }
  /** market-data.json (BTCUSDT seulement) : le plus gros mur de chaque côté du carnet, et les
   *  niveaux d'options — ceux-ci reposent sur une hypothèse : nature « modèle ». Chaque niveau
   *  porte l'heure de sa lecture (lu). */
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
      out.push(raison(cle, m[0] + bin / 2, { nom, court, art, nature: 'mesuré', lu: tMurs, btc: m[1],
        detail: q + ' · lu à ' + heureUTC(tMurs), detailCourt: q + ' · ' + heureUTC(tMurs),
        origine: 'la tranche de ' + bin + ' $ où le plus de BTC étaient posés ' + (cote === 'bid_walls' ? 'à l’achat' : 'à la vente') + ' (' + q + ') dans le carnet Binance, lue à ' + heureUTC(tMurs) + ' UTC : une photo publiée ; le carnet a pu changer depuis, un ordre posé peut être retiré' }));
    }
    // Les strikes sont en USD, l'axe en USDT : PLACÉS à strike / (USDT en USD) quand le fichier le
    // publie (comme la carte) ; les textes DISENT le strike publié (prixR).
    const taux = +mi.usdt_usd, conv = taux > 0 && isFinite(taux) ? taux : 1;
    for (const [champ, cle, nom, court, art, origine] of [
      ['put_wall', 'put_wall', 'Mur d’options (puts)', 'Put wall', 'le mur d’options (puts)', 'le prix d’exercice où les options de vente (puts) pèsent le plus selon le modèle d’exposition gamma (GEX, options Deribit)'],
      ['call_wall', 'call_wall', 'Mur d’options (calls)', 'Call wall', 'le mur d’options (calls)', 'le prix d’exercice où les options d’achat (calls) pèsent le plus selon le modèle d’exposition gamma (GEX, options Deribit)'],
      ['zero_gamma', 'zero_gamma', 'Zéro gamma', 'ZG', 'le zéro gamma', 'le prix où l’exposition gamma estimée des teneurs de marché changerait de signe (options Deribit)']]) {
      const v = mi[champ];
      if (!fini(v)) continue;
      out.push(raison(cle, v / conv, { nom, court, art, nature: 'modèle', lu: tPub, strike: v, conversion: conv !== 1 ? conv : null,
        detail: 'modèle · lu à ' + heureUTC(tPub), detailCourt: 'modèle · ' + heureUTC(tPub),
        origine: origine + ' ; un MODÈLE (hypothèse sur la position des teneurs de marché), publié à ' + heureUTC(tPub) + ' UTC' }));
    }
    return out;
  }
  const MURS_OPPOSES = { mur_achat: 'mur_vente', mur_vente: 'mur_achat' };
  /** Regroupe en une bande les raisons dont TOUS les prix tiennent dans P.fusion (fraction du
   *  prix : lien complet, pas une chaîne qui s'étire), garde celles à moins de P.distanceMax du
   *  prix de référence, puis les P.niveauxParCote plus proches de chaque côté.
   *  Un mur d'achat publié AU-DESSUS du prix (ou de vente au-dessous) n'est plus dans le carnet
   *  tel quel : il est écarté. Un mur d'achat et un mur de vente ne partagent jamais une bande.
   *  → { dessus: [niv], dessous: [niv], ecartes: [raison] } ;
   *  niv = { p (le prix RÉEL le plus proche de ref), pMin, pMax, raisons } — aucun prix moyen. */
  function choisirNiveaux(raisons, ref, P) {
    const ecartes = [];
    const ok = raisons.filter(r => {
      if (!(fini(r.p) && r.p > 0 && fini(ref) && Math.abs(r.p - ref) / ref <= P.distanceMax)) return false;
      if ((r.cle === 'mur_achat' && r.p > ref) || (r.cle === 'mur_vente' && r.p < ref)) { ecartes.push(r); return false; }
      return true;
    }).sort((a, b) => a.p - b.p);
    const groupes = [];
    for (const r of ok) {
      const g = groupes[groupes.length - 1];
      const oppose = g && MURS_OPPOSES[r.cle] && g.raisons.some(x => x.cle === MURS_OPPOSES[r.cle]);
      if (g && !oppose && (r.p - g.pMin) / g.pMin < P.fusion) {
        if (!g.raisons.some(x => x.cle === r.cle && x.nom === r.nom && x.p === r.p)) g.raisons.push(r);
        g.pMax = r.p;
      } else groupes.push({ pMin: r.p, pMax: r.p, raisons: [r] });
    }
    for (const g of groupes) {
      // Le prix qui représente la bande (distance, ordre) : celui d'une raison RÉELLE, le plus proche de ref.
      g.p = Math.abs(g.pMin - ref) <= Math.abs(g.pMax - ref) ? g.pMin : g.pMax;
      g.dessus = (g.pMin + g.pMax) / 2 > ref;
    }
    const dessus = groupes.filter(g => g.dessus).sort((a, b) => a.pMin - b.pMin).slice(0, P.niveauxParCote);
    const dessous = groupes.filter(g => !g.dessus).sort((a, b) => b.pMax - a.pMax).slice(0, P.niveauxParCote);
    return { dessus, dessous, ecartes };
  }
  /** Les prix DITS d'une bande (le strike publié pour une option) : sa plage écrite ne nomme
   *  que des prix que le lecteur retrouve dans la liste de ses raisons. */
  const valeurR = r => (fini(r.strike) ? r.strike : r.p);
  function bornesNiv(niv) {
    const v = niv.raisons && niv.raisons.length ? niv.raisons.map(valeurR) : [niv.p];
    return [Math.min(...v), Math.max(...v)];
  }
  /** Les raisons d'une bande, celles qui portent une heure de lecture d'abord (une coupure en
   *  fin de ligne ne peut pas ôter l'heure d'un chiffre publié). */
  const publieesDAbord = R => R.filter(r => fini(r.lu)).concat(R.filter(r => !fini(r.lu)));
  /** « 82 490 – 82 787 $ » (une bande de plusieurs prix) ou « 84 120 $ ». */
  function plage(niv, unite, exp) {
    const [a, b] = bornesNiv(niv);
    if (a === b) return exp ? chiffres(a) : prix(a, unite);
    return chiffres(a) + ' – ' + (exp ? chiffres(b) : prix(b, unite));
  }
  /** Le libellé d'une bande : son ORIGINE en mots (débutant) ou en abrégé (expert), le prix
   *  d'abord en expert. Plusieurs raisons : CHACUNE avec son propre prix et son heure.
   *  court : la forme compacte (écran étroit) — l'heure d'un chiffre publié y reste. */
  function libelleNiveau(niv, mode, unite, court) {
    const R = niv.raisons, exp = mode === 'expert';
    if (court === 'mini') {
      // La plus courte : la plage, le nombre de raisons, et les heures des chiffres publiés.
      const h = [...new Set(R.filter(r => fini(r.lu)).map(r => heureUTC(r.lu)))].sort();
      const mod = R.some(r => r.nature === 'modèle');
      return plage(niv, unite, exp) + ' · ' + (R.length > 1 ? R.length + ' raisons' : exp ? R[0].court : R[0].nom)
        + (h.length ? (exp ? ' (' + (mod ? 'modèle · ' : '') : ' (' + (mod ? 'modèle, ' : '') + 'lu à ') + h[0] + (h.length > 1 ? '–' + h[h.length - 1] : '') + ')' : '');
    }
    if (R.length === 1) {
      const r = R[0];
      if (exp) return [chiffresR(r), r.court, r.detailCourt].filter(Boolean).join(' · ');
      // Forme courte : le prix d'abord (une coupure en fin de ligne ôte des mots, pas le prix).
      if (court) return [prixR(r, unite), r.nom, fini(r.lu) ? tagLu(r).slice(2, -1) : ''].filter(Boolean).join(' · ');
      return [r.nom, prixR(r, unite), r.detail].filter(Boolean).join(' · ');
    }
    if (exp) return plage(niv, unite, true) + ' · ' + R.map(r => r.court + ' ' + chiffresR(r) + tagLu(r, 'expert')).join(' + ');
    if (court) return plage(niv, unite) + ' · ' + R.length + ' raisons (' + publieesDAbord(R).map(quoi).join(', ') + ')';
    return plage(niv, unite) + ' · ' + R.length + ' raisons : ' + R.map(r => minuscule(r.nom) + ' ' + prixR(r, unite) + (r.detail ? ' (' + r.detail + ')' : '')).join(' + ');
  }

  // ─── 2. État d'un niveau : la règle de cassure, sur les bougies closes ─────
  /** C, H, L : colonnes ; n : nombre de bougies CLOSES (indices 0..n−1) ; [lo, hi] : la bande
   *  (tous les prix de la bande ± sa demi-hauteur) ; iMin : première bougie qui compte (pour un
   *  niveau publié : la première close APRÈS sa lecture). Une clôture « au-delà » est hors bande.
   *  Règle de travail : la cassure part de la DERNIÈRE traversée (une clôture d'un côté, puis une
   *  clôture de l'autre, des clôtures dans la bande entre elles) parmi les P.regardCassure
   *  dernières bougies ; elle est validée par la clôture suivante au-delà (2 clôtures
   *  successives), ou par une clôture au-delà après un retour sur la bande (clôture dans la bande,
   *  ou mèche qui y revient) — le « retour réussi ».
   *  → { cassure: null | 'demi' | 'valide', sens: ±1, retest, enRetour, meche, mecheSens, cote } */
  function etatFerme(C, H, L, n, lo, hi, P, iMin) {
    const res = { cassure: null, sens: 0, retest: false, enRetour: false, meche: false, mecheSens: 0, cote: 0 };
    if (n < 2 || !fini(lo) || !fini(hi)) return res;
    const cote = c => (c > hi ? 1 : c < lo ? -1 : 0);
    const k0 = Math.max(iMin || 0, n - 1 - P.regardCassure);
    let dernier = 0, x = null, prec = 0;
    for (let k = Math.max(0, k0); k < n; k++) {
      const c = cote(C[k]);
      if (c) {
        if (dernier === -c) x = { sens: c, valide: false, retest: false, dedans: false };
        else if (x && x.sens === c && !x.valide) {
          // La mèche de CETTE bougie est revenue sur la bande : retour, puis clôture au-delà.
          const touche = c > 0 ? L[k] <= hi : H[k] >= lo;
          if (x.dedans || touche) { x.valide = true; x.retest = true; }
          else if (prec === c) x.valide = true;
        }
        if (x && x.sens === c) x.dedans = false;
        dernier = c;
      } else if (x) x.dedans = true;
      prec = c;
    }
    res.cote = cote(C[n - 1]);
    if (x) { res.cassure = x.valide ? 'valide' : 'demi'; res.sens = x.sens; res.retest = x.retest; res.enRetour = x.dedans; }
    if (!res.cassure) {
      const s = res.cote;
      for (let k = n - 1; k >= Math.max(iMin || 0, n - P.mecheBougies); k--) {
        if (s <= 0 && H[k] > hi && C[k] <= hi) { res.meche = true; res.mecheSens = 1; break; }
        if (s >= 0 && L[k] < lo && C[k] >= lo) { res.meche = true; res.mecheSens = -1; break; }
      }
    }
    return res;
  }
  const MOTS = { loin: 'loin', proche: 'proche', test: 'en test', meche: 'percé en mèche', mecheCours: 'percé en mèche (bougie en cours)',
    franchi: 'au-delà (bougie pas encore close)',
    demi: 'cassé (1/2 clôtures)', demiRetour: 'cassé (1 clôture), revenu sur la bande',
    valide: 'cassé (2/2 clôtures, validé)', valideRetour: 'cassé (validé par un retour réussi)' };
  const COURTS = { loin: 'loin', proche: 'proche', test: 'en test', meche: 'mèche', mecheCours: 'mèche (en cours)', franchi: 'au-delà (non clos)',
    demi: 'cassé 1/2', demiRetour: 'cassé 1/2 · retour', valide: 'cassé 2/2', valideRetour: 'cassé · retour réussi' };
  /** L'état du moment, au prix LIVE : la distance (au prix réel le plus proche de la bande, en %
   *  du prix live) et un mot. niv : { p, lo, hi, dessus, ferme } ; cur : la bougie en cours. */
  function etatLive(niv, live, cur, P) {
    if (!fini(live) || live <= 0 || !niv) return { mot: null, dist: null };
    const lo = fini(niv.lo) ? niv.lo : niv.p - niv.demi, hi = fini(niv.hi) ? niv.hi : niv.p + niv.demi;
    const dist = (niv.p - live) / live * 100, f = niv.ferme || {};
    const dedans = live >= lo && live <= hi;
    let mot;
    if (f.cassure === 'valide') mot = f.retest ? 'valideRetour' : 'valide';
    else if (f.cassure === 'demi') mot = f.enRetour ? 'demiRetour' : 'demi';
    else if (dedans) mot = 'test';
    else {
      const auDela = niv.dessus ? live > hi : live < lo;
      const mecheCours = !!cur && (niv.dessus ? cur.high > hi : cur.low < lo);
      if (auDela) mot = 'franchi';
      else if (f.meche) mot = 'meche';
      else if (mecheCours) mot = 'mecheCours';
      else mot = Math.abs(dist) < P.proche * 100 ? 'proche' : 'loin';
    }
    // Une cassure dit son sens : « cassé vers le bas (2/2 clôtures, validé) ».
    const sens = s => s.replace('cassé', 'cassé vers le ' + (f.sens > 0 ? 'haut' : 'bas'));
    const casse = /^(demi|valide)/.test(mot);
    const enBande = casse && dedans && mot !== 'demiRetour' ? ' · prix dans la bande' : '';
    return { mot, dist, texte: (casse ? sens(MOTS[mot]) : MOTS[mot]) + enBande, court: COURTS[mot] + (casse ? (f.sens > 0 ? ' ↑' : ' ↓') : '') };
  }
  /** Le MOT d'abord (une coupure en bout de ligne ôte le nombre, jamais l'état).
   *  variante : 'plein' (défaut) | 'court' (écran étroit). */
  function texteEtatLive(e, mode, variante) {
    if (!e || e.mot === null) return mode === 'expert' ? 'prix live absent' : 'prix live absent : distance inconnue';
    if (variante === 'mini') return e.court;
    if (mode === 'expert') return (variante === 'court' ? e.court : e.texte) + ' · ' + pct(e.dist, 2) + ' live';
    return variante === 'court' ? e.court + ' · ' + pct(e.dist, 2) + ' du prix' : e.texte + ' · à ' + pct(e.dist, 2) + ' du prix live';
  }
  /** Le plus long texte d'état possible (pour réserver sa place) ; ferme : l'état sur bougies
   *  closes d'un niveau — il fixe les mots possibles jusqu'au prochain dessin. */
  function texteEtatMax(mode, variante, ferme) {
    let m = '';
    const cles = !ferme ? Object.keys(MOTS) : ferme.cassure === 'valide' ? ['valide', 'valideRetour'] : ferme.cassure === 'demi' ? ['demi', 'demiRetour']
      : ['loin', 'proche', 'test', 'franchi', 'meche', 'mecheCours'];
    for (const k of cles) {
      const casse = /^(demi|valide)/.test(k);
      const e = { mot: k, dist: -10, texte: (casse ? MOTS[k].replace('cassé', 'cassé vers le haut') : MOTS[k]) + (casse && k !== 'demiRetour' ? ' · prix dans la bande' : ''), court: COURTS[k] + (casse ? ' ↑' : '') };
      const t = texteEtatLive(e, mode, variante);
      if (t.length > m.length) m = t;
    }
    return m;
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
   *  i : la dernière bougie close. → { cle, adx, pdi, mdi, emaHaut, compression, depuis, ... }
   *  depuis : le nombre de bougies PRÉCÉDENTES, toutes plus larges, quand il atteint
   *  P.compressionDepuisMin (sinon null : « au plus bas depuis 1 bougie » ne dirait rien). */
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
    const r = { cle, adx: a, pdi, mdi, emaHaut, compression: false, depuis: null, depuisDebut: false, largeur: null, seuil: null };
    const w = x.largeur && x.largeur[i];
    if (fini(w)) {
      r.largeur = w;
      r.seuil = centile(x.largeur, i, P.bbFenetre, P.bbPercentile);
      if (r.seuil !== null && w <= r.seuil) {
        r.compression = true;
        let j = i - 1, plusLarges = 0;
        for (; j >= 0; j--) {
          if (!fini(x.largeur[j])) continue;
          if (x.largeur[j] > w) plusLarges++; else break;
        }
        if (plusLarges >= P.compressionDepuisMin) { r.depuis = plusLarges; r.depuisDebut = j < 0; }
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
        + (r.compression ? ' · largeur BB ≤ P' + P.bbPercentile + '/' + P.bbFenetre + (r.depuis ? ' (min. ' + (r.depuisDebut ? 'hist. · ' : '') + r.depuis + ' b.)' : '') : '');
    }
    let t = NOMS_REGIME[r.cle] + ' (ADX ' + adx + ')';
    if (r.compression) {
      t += ' · Compression : volatilité basse (bandes de Bollinger parmi les ' + P.bbPercentile + ' % les plus étroites des ' + P.bbFenetre + ' dernières bougies)';
      if (r.depuis) t += r.depuisDebut ? ', la plus basse de l’historique chargé (' + r.depuis + ' bougies)' : ', au plus bas depuis ' + r.depuis + ' bougies';
    }
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
  /** Fait vivre une forme d'UNE bougie close (j) : sa machine d'état, sans regarder plus loin.
   *  Objectif et invalidation se jugent sur la MÊME base : la clôture (une mèche ne compte ni
   *  pour l'un ni pour l'autre). */
  function avancer(f, j, S, P) {
    const C = S.c, H = S.h, L = S.l, A = S.atr;
    const fin = cle => { f.fin = cle; f.jFin = j; };
    if (f.phase === 'confirme') {
      if (j <= f.jConf) return;
      const s = f.sens;
      if (s > 0 ? C[j] < f.invalidation : C[j] > f.invalidation) fin('invalide');
      else if (s > 0 ? C[j] >= f.objectif : C[j] <= f.objectif) fin('atteint');
      else if (j - f.jConf >= P.horizon) fin('expire');
      return;
    }
    // Distances (en ATR) de l'objectif et de l'invalidation au point de confirmation : le repère
    // « sans forme » rejoue ces mêmes distances depuis n'importe quelle bougie.
    const noterDistances = () => { const a = A && A[j]; if (fini(a) && a > 0) { f.dObj = Math.abs(f.objectif - C[j]) / a; f.dInv = Math.abs(f.invalidation - C[j]) / a; } };
    if (f.type === 'double_sommet' || f.type === 'double_creux') {
      const s = f.sens, N = f.niveau, E = f.extreme;
      if (s < 0 ? C[j] > E : C[j] < E) { fin('invalide_avant'); return; }
      if (s < 0 ? C[j] < N : C[j] > N) {
        if (f.demi) { f.phase = 'confirme'; f.jConf = j; f.retest = s < 0 ? H[j] >= N - f.tol : L[j] <= N + f.tol; f.demi = false; f.invalidation = E; noterDistances(); }
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
          noterDistances();
        } else { f.demi = true; f.demiSens = sc; f.jDemi = j; }
      } else f.demi = false;
    }
    if (f.phase !== 'confirme' && j - f.t > P.expiration) fin('expire_avant');
  }
  const TYPES = ['double_sommet', 'double_creux', 'range', 'triangle'];
  const estDouble = f => f.type === 'double_sommet' || f.type === 'double_creux';
  /** Rejoue la détection sur les n bougies CLOSES de S = { h, l, c, atr, n } : chaque forme
   *  naît à la clôture où son dernier pivot devient connu (t), puis vit bougie après bougie.
   *  Aucune information postérieure à t n'entre dans sa détection : le bilan est celui qu'on
   *  aurait relevé en direct. Une forme dont la ligne de cou était DÉJÀ confirmée (ou l'issue
   *  déjà connue) à t n'est pas comptée : elle n'était repérable qu'après coup.
   *  → { formes, bilan, n } */
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
        // Un double qui partage un pivot avec un double du même type encore vivant (triple
        // sommet) est le MÊME mouvement : il ne fait pas un cas de plus.
        if (estDouble(f) && actives.some(g => g.type === f.type && (g.a.i === f.a.i || g.b.i === f.a.i))) continue;
        Object.assign(f, { phase: 'formation', demi: false, fin: null, jFin: null, jConf: null });
        for (let j = f.depart; j <= t && !f.fin; j++) avancer(f, j, S, P);
        // Confirmée ou finie AVANT d'être repérable : ni montrée, ni comptée.
        if (f.fin || f.phase === 'confirme') continue;
        formes.push(f);
        actives.push(f);
      }
    }
    // Deux formes du même type confirmées sur la même bougie, même ligne : un seul cas.
    for (let k = 0; k < formes.length; k++) {
      const f = formes[k];
      if (f.jConf === null) continue;
      if (formes.some((g, m) => m < k && !g.doublon && g.type === f.type && g.jConf === f.jConf && Math.abs(g.niveau - f.niveau) <= Math.max(g.tol, f.tol))) f.doublon = true;
    }
    return { formes, bilan: bilan(formes, S, P), n };
  }
  /** Le repère SANS forme d'une forme confirmée : depuis une bougie sur `pas` de tout
   *  l'historique chargé, les mêmes distances (en ATR de cette bougie) et le même sens, la même
   *  règle (clôtures, invalidation jugée d'abord, P.horizon bougies au plus). Ajouté à t. */
  function temoin(f, S, P, pas, t) {
    const C = S.c, A = S.atr, n = S.n, s = f.sens;
    for (let k = 0; k < n - 1; k += pas) {
      const a = A[k];
      if (!fini(a) || a <= 0) continue;
      const obj = C[k] + s * f.dObj * a, inv = C[k] - s * f.dInv * a, fin = Math.min(n - 1, k + P.horizon);
      let issue = null;
      for (let j = k + 1; j <= fin; j++) {
        if (s > 0 ? C[j] < inv : C[j] > inv) { issue = 'inv'; break; }
        if (s > 0 ? C[j] >= obj : C[j] <= obj) { issue = 'obj'; break; }
      }
      if (!issue && k + P.horizon <= n - 1) issue = 'exp';
      if (!issue) continue;                 // issue encore inconnue (fin de l'historique) : pas comptée
      t.departs++;
      if (issue === 'obj') t.atteints++; else if (issue === 'inv') t.invalides++; else t.expires++;
    }
  }
  function bilan(formes, S, P) {
    const b = {};
    for (const t of TYPES) b[t] = { type: t, formes: 0, confirmes: 0, atteints: 0, invalides: 0, expires: 0, ouverts: 0, invalidesAvant: 0, expiresAvant: 0,
      temoin: { departs: 0, atteints: 0, invalides: 0, expires: 0 } };
    const conf = [];
    for (const f of formes) {
      if (f.doublon) continue;
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
      if (fini(f.dObj) && fini(f.dInv)) conf.push(f);
    }
    if (S && P && conf.length) {
      const pas = Math.max(1, Math.ceil(conf.length * S.n / P.temoinDeparts));
      for (const f of conf) temoin(f, S, P, pas, b[f.type].temoin);
      for (const t of TYPES) b[t].temoin.pas = pas;
    }
    return b;
  }
  /** Les formes à montrer dans la vue [vs, ve) : vivantes, ou finies (objectif atteint,
   *  invalidée après confirmation) depuis moins de P.garderFini bougies ; celles qui
   *  COMMENCENT dans la vue ; les vivantes puis les plus récentes ; jamais deux qui se
   *  recouvrent dans le temps ; au plus P.formesMax. Une candidate jamais confirmée n'est pas
   *  montrée une fois tombée. */
  function formesAffichees(res, P, vs, ve) {
    if (!res) return [];
    const n = res.n, a = fini(vs) ? vs : -Infinity, z = fini(ve) ? ve : Infinity;
    const fin = f => (f.fin ? f.jFin : n - 1);
    const cands = res.formes.filter(f => !f.doublon && f.debut >= a && f.debut < z
      && (!f.fin || (['atteint', 'invalide'].includes(f.fin) && n - 1 - f.jFin <= P.garderFini)))
      .sort((x, y) => (!!x.fin - !!y.fin) || y.t - x.t || y.debut - x.debut);
    const out = [];
    for (const f of cands) {
      if (out.length >= P.formesMax) break;
      if (out.some(g => f.debut <= fin(g) && g.debut <= fin(f))) continue;
      out.push(f);
    }
    return out;
  }
  const NOMS_FORMES = { double_sommet: ['Double sommet', 'doubles sommets', 'un double sommet'], double_creux: ['Double creux', 'doubles creux', 'un double creux'],
    range: ['Rectangle (range)', 'rectangles', 'un rectangle'], triangle: ['Triangle (prix qui se resserre)', 'triangles', 'un triangle'] };
  /** L'état d'une forme, en mots. → { cle, texte, court } */
  function etatForme(f) {
    const dbl = estDouble(f);
    const dir = s => (s > 0 ? 'au-dessus' : 'en dessous'), cote = s => (s > 0 ? 'par le haut' : 'par le bas');
    if (f.fin === 'atteint') return { cle: 'atteint', texte: 'objectif théorique atteint (en clôture)', court: 'objectif atteint' };
    if (f.fin === 'invalide' || f.fin === 'invalide_avant') return { cle: 'invalide',
      texte: dbl ? 'invalidé (clôture ' + (f.sens < 0 ? 'au-dessus des sommets' : 'sous les creux') + ')' : 'invalidé (clôture revenue au milieu de la figure)', court: 'invalidé' };
    if (f.fin) return { cle: 'oublie', texte: 'délai écoulé', court: 'délai écoulé' };
    if (f.phase === 'confirme') return dbl
      ? { cle: 'confirme', texte: 'confirmé (2 clôtures ' + (f.sens < 0 ? 'sous' : 'au-dessus de') + ' la ligne de cou)', court: 'confirmé 2/2' }
      : { cle: 'confirme', texte: 'sorti ' + cote(f.sens) + ' — validé (2 clôtures ' + dir(f.sens) + ')', court: 'sortie validée ' + (f.sens > 0 ? '↑' : '↓') };
    if (f.demi) return dbl
      ? { cle: 'demi', texte: 'ligne de cou franchie, à confirmer (1/2 clôtures)', court: 'cassure 1/2' }
      : { cle: 'demi', texte: 'le prix est sorti ' + cote(f.demiSens) + ' — à confirmer (1/2 clôtures ' + dir(f.demiSens) + ')', court: 'sortie 1/2 ' + (f.demiSens > 0 ? '↑' : '↓') };
    return dbl ? { cle: 'formation', texte: 'en formation', court: 'en formation' } : { cle: 'dedans', texte: 'le prix est dedans', court: 'dedans' };
  }
  /** Le bilan mesuré d'un type de forme, dit en phrases (débutant) ou en abrégé (expert), à côté
   *  du repère SANS forme (mêmes distances, même sens, depuis n'importe quelle bougie).
   *  ctx = { n, intervalle (« 15m »), duree (s) }. Sous P.echantillonFaible confirmations :
   *  « Échantillon faible. » Des comptes, aucune probabilité, aucun pourcentage. */
  function texteBilan(b, ctx, P, mode) {
    if (!b) return '';
    const faible = b.confirmes < P.echantillonFaible;
    const nb = nombre(ctx.n, 0), itv = nomIntervalle(ctx.intervalle), d = duree(ctx.duree);
    const T = b.temoin || { departs: 0, atteints: 0 }, noms = NOMS_FORMES[b.type] || ['', 'formes'];
    const issues = b.atteints + b.invalides + b.expires;
    if (mode === 'expert') {
      return 'Mesuré · hist. ' + nb + ' × ' + itv + ' (' + d + ') : ' + b.formes + ' repérés · ' + b.confirmes + ' conf. · obj. ' + b.atteints + ' · inval. ' + b.invalides
        + ' · sans issue ' + b.expires + ' · ouv. ' + b.ouverts + (T.departs ? ' · sans forme : obj. ' + nombre(T.atteints, 0) + '/' + nombre(T.departs, 0) : '')
        + (faible ? ' · échantillon faible' : '');
    }
    let t = 'Mesuré sur l’historique chargé — sur les ' + nb + ' dernières bougies ' + itv + ' chargées (' + d + ') : ' + b.formes + ' ' + noms[1] + ' repérés, '
      + (b.confirmes ? b.confirmes + (b.confirmes > 1 ? ' confirmés' : ' confirmé') + '. Après confirmation : objectif théorique atteint (en clôture) d’abord ' + b.atteints + ' fois sur ' + issues
        + ' issues connues, invalidation d’abord ' + b.invalides + ' fois, ni l’un ni l’autre en ' + P.horizon + ' bougies ' + b.expires + ' fois, ' + b.ouverts + ' encore ouvert' + (b.ouverts > 1 ? 's' : '') + '.'
        : 'aucun confirmé.');
    if (T.departs) t += ' Repère sans forme : depuis n’importe quelle bougie, avec les mêmes distances et le même sens, l’objectif est atteint d’abord ' + nombre(T.atteints, 0) + ' fois sur ' + nombre(T.departs, 0)
      + ' issues connues. Un écart entre les deux n’est pas une preuve.';
    return t + (faible ? ' Échantillon faible.' : '');
  }

  // ─── 5. Et ensuite ? ────────────────────────────────────────────────────────
  /** Le prix d'une bande du côté `haut` (true : le plus haut de ses prix) et sa raison. */
  const bord = (niv, haut) => niv.raisons.reduce((a, r) => ((haut ? r.p > a.p : r.p < a.p) ? r : a));
  /** Deux chemins conditionnels, pris dans les niveaux nommés (jamais inventés), sans rang.
   *  Le seuil est le bord LOINTAIN de la première bande (au-delà = hors de la bande, la règle de
   *  cassure) ; la cible, le bord proche de la suivante. Deux prix de raisons réelles. */
  function suite(choix) {
    const d = choix.dessus, b = choix.dessous;
    return {
      haut: d[0] ? { seuil: d[0], cible: d[1] || null, sens: 1, rx: bord(d[0], true), ry: d[1] ? bord(d[1], false) : null } : null,
      bas: b[0] ? { seuil: b[0], cible: b[1] || null, sens: -1, rx: bord(b[0], false), ry: b[1] ? bord(b[1], true) : null } : null,
    };
  }
  /** Le texte d'un chemin, en lignes. variante : 'plein' | 'court' | 'mini' (deux nombres).
   *  Un niveau publié garde son heure (et « modèle ») dans toutes les variantes. */
  function texteSuite(ch, mode, unite, itv, P, variante) {
    if (!ch) return [];
    const up = ch.sens > 0, rx = ch.rx || bord(ch.seuil, up), ry = ch.ry || (ch.cible ? bord(ch.cible, !up) : null);
    const v = variante || 'plein', it = itv ? nomIntervalle(itv) + ' ' : '';
    const loin = P ? ' à moins de ' + nombre(P.distanceMax * 100, 0) + ' %' : '';
    if (v === 'mini') {
      const lu = [rx, ry].filter(r => r && fini(r.lu));
      return [(up ? '> ' : '< ') + chiffresR(rx), '→ ' + (ry ? chiffresR(ry) : '—')].concat(lu.some(r => r.nature === 'modèle') ? ['modèle'] : [], lu.length ? ['lu ' + heureUTC(lu[0].lu)] : []);
    }
    if (mode === 'expert') return ['Clôt. ' + it + (up ? '> ' : '< ') + chiffresR(rx) + tagLu(rx, 'expert'), '→ ' + (ry ? chiffresR(ry) + tagLu(ry, 'expert') : 'aucun niveau nommé' + loin)];
    if (v === 'court') return [(up ? 'Au-dessus de ' : 'Sous ') + prixR(rx, unite) + tagLu(rx), '→ ' + (ry ? prixR(ry, unite) + tagLu(ry) : 'aucun autre niveau')];
    return ['Si clôture ' + it + (up ? 'au-dessus de ' : 'sous ') + prixR(rx, unite) + tagLu(rx),
      ry ? '→ niveau suivant : ' + prixR(ry, unite) + tagLu(ry) : '→ aucun autre niveau nommé' + loin];
  }

  // ─── 6. Lecture du moment ──────────────────────────────────────────────────
  /** « de » + article : du, des, d'un, d'une, de l'… */
  function deArt(s) {
    if (/^le /.test(s)) return 'du ' + s.slice(3);
    if (/^les /.test(s)) return 'des ' + s.slice(4);
    if (/^une? /.test(s)) return 'd’' + s;
    if (/^[aeiouyéèêàâîôûh]/i.test(s)) return 'd’' + s;
    return 'de ' + s;
  }
  /** Une bande dite dans la phrase : sa raison et son prix réel, ou « une zone de A à B $ (…) »
   *  qui nomme chacune — un chiffre publié avec son heure, un modèle dit « modèle ». */
  function decrire(niv, unite) {
    const R = niv.raisons;
    if (R.length === 1) return artLu(R[0]) + ' (' + prixR(R[0], unite) + ')';
    const [a, b] = bornesNiv(niv);
    return 'une zone de ' + chiffres(a) + ' à ' + prix(b, unite) + ' (' + publieesDAbord(R).map(quoi).join(', ') + ')';
  }
  const PHRASES_REGIME = { hausse: 'marché en tendance haussière', baisse: 'marché en tendance baissière', incertaine: 'marché en tendance, de sens incertain',
    sans: 'marché sans tendance nette', faible: 'tendance faible' };
  function phraseForme(f, unite) {
    const nom = NOMS_FORMES[f.type][2], e = etatForme(f), dbl = estDouble(f);
    switch (e.cle) {
      case 'formation': return nom + ' est en formation';
      case 'dedans': return f.type === 'range' ? 'le prix est dans ' + nom + ' (' + chiffres(f.bas) + ' – ' + prix(f.haut, unite) + ')' : 'le prix est dans ' + nom;
      case 'demi': return dbl ? nom + ' attend une 2e clôture ' + (f.sens < 0 ? 'sous' : 'au-dessus de') + ' sa ligne de cou (' + prix(f.niveau, unite) + ')'
        : 'le prix est sorti ' + (f.demiSens > 0 ? 'par le haut' : 'par le bas') + ' d’' + nom + ', une 2e clôture dehors le validerait';
      case 'confirme': return nom + ' est confirmé (objectif théorique ' + prix(f.objectif, unite) + ', non garanti)';
      case 'atteint': return nom + ' a atteint son objectif théorique';
      case 'invalide': return nom + ' vient d’être invalidé';
      default: return '';
    }
  }
  /** o = { prix, unite, choix: { dessus, dessous }, enTest: niv | null, regime, forme, court, maintenant }
   *  forme : une forme DESSINÉE (ou null) ; court : sans le régime (le badge le dit déjà) ;
   *  maintenant : la vue montre le passé, la phrase dit l'instant présent. */
  function lecture(o) {
    const P = prix(o.prix, o.unite), d = o.choix && o.choix.dessus[0], b = o.choix && o.choix.dessous[0];
    let s1;
    if (!fini(o.prix)) s1 = 'Prix live absent.';
    else if (o.enTest) s1 = 'Le prix (' + P + ') teste ' + decrire(o.enTest, o.unite) + '.';
    else if (d && b) s1 = 'Le prix (' + P + ') est entre ' + decrire(b, o.unite) + ' et ' + decrire(d, o.unite) + '.';
    else if (d) s1 = 'Le prix (' + P + ') est sous ' + decrire(d, o.unite) + '.';
    else if (b) s1 = 'Le prix (' + P + ') est au-dessus ' + deArt(decrire(b, o.unite)) + '.';
    else s1 = 'Le prix (' + P + ') n’a aucun niveau nommé proche.';
    if (o.maintenant) s1 = 'Maintenant : ' + s1.charAt(0).toLowerCase() + s1.slice(1);
    const parts = [];
    if (o.regime && o.regime.cle !== 'inconnu' && !o.court) {
      parts.push(PHRASES_REGIME[o.regime.cle] + (o.regime.compression ? ', volatilité comprimée' : ''));
    }
    if (o.forme) { const t = phraseForme(o.forme, o.unite); if (t) parts.push(t); }
    if (!parts.length) return s1;
    const s2 = parts.join(' ; ');
    return s1 + ' ' + s2.charAt(0).toUpperCase() + s2.slice(1) + '.';
  }

  return { nombre, prix, chiffres, pct, nomIntervalle, duree, heureUTC, niveauxDuJour, niveauxSR, niveauxPublies, choisirNiveaux, libelleNiveau,
    prixR, tagLu, artLu, quoi, bord, etatFerme, etatLive, texteEtatLive, texteEtatMax, MOTS, centile, regime, texteRegime, pivots, regression,
    detecter, bilan, formesAffichees, etatForme, NOMS_FORMES, texteBilan, suite, texteSuite, deArt, decrire, lecture, TYPES, bornes };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Guide;
