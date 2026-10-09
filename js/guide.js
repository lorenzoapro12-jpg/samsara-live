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
  /** Une fraction de PARAM dite en % : « 6 », « 0,4 », « 0,25 » (jamais arrondie à 0). */
  const pctParam = x => (x * 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 }).replace(/[  ]/g, ' ');
  const heureUTC = ms => fini(ms) ? new Date(ms).toISOString().slice(11, 16) : '—';

  // ─── 1. Niveaux nommés ─────────────────────────────────────────────────────
  // Chaque RAISON porte : son prix sur l'axe (p), son nom (débutant), son nom court (expert),
  // sa forme avec article (pour la phrase), sa nature (mesuré / modèle) et, si elle vient du
  // fichier publié, l'heure de sa lecture (lu, en ms) — qu'aucun texte ne peut omettre (tagLu).
  // [nom, court (expert), avec article, origine, mot (la forme la plus courte, écran étroit)]
  const RAISONS = {
    hier_haut: ['Plus haut d’hier', 'H veille', 'le plus haut d’hier', 'le plus haut atteint hier (journée UTC) sur les bougies de ce graphique', 'haut d’hier'],
    hier_bas: ['Plus bas d’hier', 'B veille', 'le plus bas d’hier', 'le plus bas atteint hier (journée UTC) sur les bougies de ce graphique', 'bas d’hier'],
    sem_haut: ['Plus haut de la semaine dernière', 'H sem. préc.', 'le plus haut de la semaine dernière', 'le plus haut de la bougie de la semaine précédente', 'haut sem. préc.'],
    sem_bas: ['Plus bas de la semaine dernière', 'B sem. préc.', 'le plus bas de la semaine dernière', 'le plus bas de la bougie de la semaine précédente', 'bas sem. préc.'],
    h24_haut: ['Plus haut des 24 h', 'H 24 h', 'le plus haut des 24 h', 'le plus haut des dernières 24 h glissantes, bougie en cours comprise', 'haut 24 h'],
    h24_bas: ['Plus bas des 24 h', 'B 24 h', 'le plus bas des 24 h', 'le plus bas des dernières 24 h glissantes, bougie en cours comprise', 'bas 24 h'],
  };
  function raison(cle, p, extra) {
    const r = RAISONS[cle];
    return Object.assign({ cle, p, nom: r ? r[0] : cle, court: r ? r[1] : cle, art: r ? r[2] : cle, origine: r ? r[3] : '', mot: r ? r[4] : '', nature: 'mesuré', detail: '', detailCourt: '' }, extra || {});
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
  /** L'heure collée au NOMBRE (formes étroites) : « 20:33 », « modèle 20:18 » ; rien si non publiée. */
  const tagMicro = r => (r && fini(r.lu) ? ' ' + (r.nature === 'modèle' ? 'modèle ' : '') + heureUTC(r.lu) : '');
  /** Le mot le plus court d'une raison (écran étroit). */
  const motR = (r, exp) => (exp ? r.courtMicro || r.court : r.mot) || r.court || r.nom;
  /** Des raisons du même nom dans une bande (deux zones de demi-tours) : chacune dit son prix,
   *  sinon le lecteur lirait deux fois le même nom sans savoir pourquoi. */
  const distinguer = (R, f) => R.map(r => f(r) + (R.filter(x => x.nom === r.nom).length > 1 ? ' à ' + chiffresR(r) : ''));
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
        nom: 'Zone de ' + l.touches + ' demi-tours (bougies ' + itv + ')', court: 'S/R ×' + l.touches + ' ' + itv, mot: 'zone ×' + l.touches, courtMicro: 'S/R ×' + l.touches,
        art: 'une zone de ' + l.touches + ' demi-tours (bougies ' + itv + ')',
        origine: l.touches + ' sommets ou creux locaux (pivots' + (m.pivot ? ' de ' + m.pivot + ' bougies de chaque côté' : '') + ') regroupés autour de ce prix'
          + (m.bougies ? ', sur les ' + m.bougies + ' dernières bougies ' + itv : ', sur les bougies ' + itv)
          + (fini(m.tolMin) && fini(m.tolMax) ? ' (méthode S/R de la page : tolérance entre ' + nombre(m.tolMin * 100, 1) + ' et ' + nombre(m.tolMax * 100, 1) + ' % du prix, selon l’ATR)' : ' (méthode S/R de la page)'),
        touches: l.touches, tf: l.tf, bougies: m.bougies });
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
    for (const [cote, cle, nom, court, art, mot] of [['bid_walls', 'mur_achat', 'Mur d’achat du carnet', 'Mur bid', 'un mur d’achat du carnet', 'mur d’achat'],
      ['ask_walls', 'mur_vente', 'Mur de vente du carnet', 'Mur ask', 'un mur de vente du carnet', 'mur de vente']]) {
      const murs = (lq[cote] || []).filter(m => Array.isArray(m) && fini(m[0]) && fini(m[1]));
      if (!murs.length) continue;
      const m = murs.reduce((a, b) => (b[1] > a[1] ? b : a));
      const q = nombre(m[1], m[1] >= 10 ? 0 : 1) + ' BTC';
      out.push(raison(cle, m[0] + bin / 2, { nom, court, art, mot, nature: 'mesuré', lu: tMurs, btc: m[1], bin,
        detail: q + ' · lu à ' + heureUTC(tMurs), detailCourt: q + ' · ' + heureUTC(tMurs),
        origine: 'la tranche de ' + bin + ' $ où le plus de BTC étaient posés ' + (cote === 'bid_walls' ? 'à l’achat' : 'à la vente') + ' (' + q + ') dans le carnet Binance, lue à ' + heureUTC(tMurs) + ' UTC : une photo publiée ; le carnet a pu changer depuis, un ordre posé peut être retiré' }));
    }
    // Les strikes sont en USD, l'axe en USDT : PLACÉS à strike / (USDT en USD) quand le fichier le
    // publie (comme la carte) ; les textes DISENT le strike publié (prixR).
    const taux = +mi.usdt_usd, conv = taux > 0 && isFinite(taux) ? taux : 1;
    // Un mur d'options est un prix d'exercice (strike) ; le zéro gamma est un prix CALCULÉ par le
    // modèle (là où l'exposition recalculée change de signe) : pas un prix d'exercice.
    for (const [champ, cle, nom, court, art, mot, origine] of [
      ['put_wall', 'put_wall', 'Mur d’options (puts)', 'Put wall', 'le mur d’options (puts)', 'mur de puts', 'le prix d’exercice où les options de vente (puts) pèsent le plus selon le modèle d’exposition gamma (GEX, options Deribit)'],
      ['call_wall', 'call_wall', 'Mur d’options (calls)', 'Call wall', 'le mur d’options (calls)', 'mur de calls', 'le prix d’exercice où les options d’achat (calls) pèsent le plus selon le modèle d’exposition gamma (GEX, options Deribit)'],
      ['zero_gamma', 'zero_gamma', 'Zéro gamma', 'ZG', 'le zéro gamma', 'zéro gamma', 'un prix calculé par le modèle (pas un prix d’exercice) : là où l’exposition gamma estimée des teneurs de marché changerait de signe (options Deribit)']]) {
      const v = mi[champ];
      if (!fini(v)) continue;
      out.push(raison(cle, v / conv, { nom, court, art, mot, nature: 'modèle', lu: tPub, strike: v, exercice: champ !== 'zero_gamma', conversion: conv !== 1 ? conv : null,
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
   *  court : true (forme compacte), 'mini' (plage + mots courts), 'micro' (chaque prix, son
   *  heure collée à lui, un mot) — dans TOUTES les formes, un chiffre publié garde son heure et
   *  chaque raison garde son origine (un mot au moins) : une coupure n'a plus rien à ôter. */
  function libelleNiveau(niv, mode, unite, court) {
    const R = niv.raisons, exp = mode === 'expert';
    if (court === 'micro') {
      // Chaque prix suivi de son heure (s'il est publié) et de son mot : « 82 130 $ 20:33 mur de vente ».
      return R.map(r => (exp ? chiffresR(r) : prixR(r, unite)) + tagMicro(r) + ' ' + motR(r, exp)).join(' + ');
    }
    if (court === 'mini') {
      // La plage, puis chaque raison en un mot, son heure collée à elle.
      if (R.length === 1) return (exp ? chiffresR(R[0]) : prixR(R[0], unite)) + tagMicro(R[0]) + ' · ' + motR(R[0], exp);
      return plage(niv, unite, exp) + ' · ' + distinguer(R, r => motR(r, exp) + tagMicro(r)).join(' + ');
    }
    if (R.length === 1) {
      const r = R[0];
      if (exp) return [chiffresR(r), r.court, r.detailCourt].filter(Boolean).join(' · ');
      // Forme courte : le prix et son heure d'abord, puis le nom.
      if (court) return prixR(r, unite) + tagLu(r) + ' · ' + r.nom;
      return [r.nom, prixR(r, unite), r.detail].filter(Boolean).join(' · ');
    }
    if (exp) return plage(niv, unite, true) + ' · ' + R.map(r => r.court + ' ' + chiffresR(r) + tagLu(r, 'expert')).join(' + ');
    if (court) return plage(niv, unite) + ' · ' + R.length + ' raisons (' + distinguer(publieesDAbord(R), quoi).join(', ') + ')';
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
   *  du prix live) et un mot. niv : { p, lo, hi, dessus, ferme, lu } ; cur : la bougie en cours
   *  ({ time (s), high, low }). Un niveau PUBLIÉ (lu : heure de lecture, ms) ne lit pas la mèche
   *  d'une bougie ouverte avant sa lecture : ce plus haut / plus bas peut dater d'avant la photo
   *  (seul le prix live peut alors dire « au-delà »). */
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
      const avantLecture = fini(niv.lu) && !(fini(cur && cur.time) && cur.time * 1000 >= niv.lu);
      const mecheCours = !!cur && !avantLecture && (niv.dessus ? cur.high > hi : cur.low < lo);
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
  const COURTS_REGIME = { hausse: 'Hausse', baisse: 'Baisse', incertaine: 'Tendance, sens incertain', sans: 'Sans tendance', faible: 'Tendance faible' };
  /** court : la forme d'un écran étroit — le régime, l'ADX et la compression tiennent en tête. */
  function texteRegime(r, mode, P, court) {
    if (!r || r.cle === 'inconnu') return mode === 'expert' ? 'ADX : historique insuffisant' : court ? 'Régime : historique court' : 'Régime : historique trop court pour le dire';
    const adx = Math.round(r.adx);
    if (court) return (mode === 'expert' ? 'ADX ' + adx + ' · +DI ' + Math.round(r.pdi) + '/−DI ' + Math.round(r.mdi) : COURTS_REGIME[r.cle] + ' · ADX ' + adx) + (r.compression ? ' · compression' : '');
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
  /** Le dernier pivot d'une forme (celui dont la confirmation l'a fait naître, en t). */
  const dernierPivot = (f, P) => f.t - P.pivot;
  /** Les formes à montrer dans la vue [vs, ve) : vivantes, ou finies (objectif atteint,
   *  invalidée après confirmation) depuis moins de P.garderFini bougies ; celles dont le
   *  DERNIER PIVOT est dans la vue (le début peut en sortir à gauche : la figure est coupée au
   *  bord) ; les vivantes puis les plus récentes ; jamais deux qui se recouvrent dans le temps ;
   *  au plus P.formesMax. Une candidate jamais confirmée n'est pas montrée une fois tombée. */
  function formesAffichees(res, P, vs, ve) {
    if (!res) return [];
    const n = res.n, a = fini(vs) ? vs : -Infinity, z = fini(ve) ? ve : Infinity;
    const fin = f => (f.fin ? f.jFin : n - 1);
    const cands = res.formes.filter(f => !f.doublon && dernierPivot(f, P) >= a && f.debut < z
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
   *  « Échantillon faible. » Des comptes, aucune probabilité, aucun pourcentage.
   *  mode 'expertCourt' : l'étiquette d'une forme en expert — les comptes et l'avertissement
   *  d'abord (une coupure en bout de ligne n'ôte que la durée). Le détail complet (délais,
   *  formes encore ouvertes) est dans le mode 'expert' et dans la fiche. */
  function texteBilan(b, ctx, P, mode) {
    if (!b) return '';
    const faible = b.confirmes < P.echantillonFaible;
    const nb = nombre(ctx.n, 0), itv = nomIntervalle(ctx.intervalle), d = duree(ctx.duree);
    const T = b.temoin || { departs: 0, atteints: 0 }, noms = NOMS_FORMES[b.type] || ['', 'formes', 'une forme'];
    if (mode === 'expertCourt') {
      return b.confirmes + ' conf.' + (faible ? ' · éch. faible' : '') + ' · obj. ' + b.atteints + ' · inval. ' + b.invalides + ' · mesuré, ' + nb + ' b. ' + itv;
    }
    if (mode === 'expert') {
      return 'Mesuré · hist. ' + nb + ' × ' + itv + ' (' + d + ') : ' + b.formes + ' repérés · ' + b.confirmes + ' conf. · obj. ' + b.atteints + ' · inval. ' + b.invalides
        + ' · sans issue ' + b.expires + ' · ouv. ' + b.ouverts + (T.departs ? ' · sans forme : obj. ' + nombre(T.atteints, 0) + '/' + nombre(T.departs, 0) : '')
        + (faible ? ' · échantillon faible' : '');
    }
    // Débutant : UNE phrase de comptes, une phrase de repère, l'avertissement.
    const un = noms[2].replace(/^une? /, '');
    let t = 'Mesuré sur l’historique chargé — sur les ' + nb + ' dernières bougies ' + itv + ' (' + d + ') : ';
    if (b.confirmes) {
      t += (b.confirmes > 1 ? b.confirmes + ' ' + noms[1] + ' confirmés' : '1 ' + un + ' confirmé') + ' sur ' + b.formes + (b.formes > 1 ? ' repérés' : ' repéré') + ', objectif théorique atteint '
        + b.atteints + ' fois avant invalidation (invalidation d’abord : ' + b.invalides + ').';
      if (T.departs) t += ' Repère sans forme, mêmes distances : ' + nombre(T.atteints, 0) + ' fois sur ' + nombre(T.departs, 0) + '.';
    } else t += b.formes + ' ' + (b.formes > 1 ? noms[1] + ' repérés' : un + ' repéré') + ', aucun confirmé.';
    return t + (faible ? ' Échantillon faible.' : '');
  }

  // ─── 5. Et ensuite ? ────────────────────────────────────────────────────────
  /** Le prix d'une bande du côté `haut` (true : le plus haut de ses prix) et sa raison. */
  const bord = (niv, haut) => niv.raisons.reduce((a, r) => ((haut ? r.p > a.p : r.p < a.p) ? r : a));
  /** Deux chemins conditionnels, pris dans les niveaux nommés (jamais inventés), sans rang.
   *  Le seuil est le bord LOINTAIN de la première bande (au-delà = hors de la bande, la règle de
   *  cassure) ; la cible, le bord proche de la suivante. Deux prix de raisons réelles.
   *  ref : le prix de référence. Quand il est DANS une bande (± sa demi-hauteur : lo, hi), cette
   *  bande sert aux DEUX chemins — son bord haut vers le haut, son bord bas vers le bas — pour
   *  que les deux sorties partent de la même bande, à la même distance du prix. */
  function suite(choix, ref) {
    const d = choix.dessus, b = choix.dessous;
    const dans = niv => !!niv && fini(ref) && ref >= (fini(niv.lo) ? niv.lo : niv.pMin - (niv.demi || 0)) && ref <= (fini(niv.hi) ? niv.hi : niv.pMax + (niv.demi || 0));
    const ch = (seuil, cible, sens) => (seuil ? { seuil, cible: cible || null, sens, rx: bord(seuil, sens > 0), ry: cible ? bord(cible, sens < 0) : null } : null);
    if (dans(d[0])) return { haut: ch(d[0], d[1], 1), bas: ch(d[0], b[0], -1), dans: d[0] };
    if (dans(b[0])) return { haut: ch(b[0], d[0], 1), bas: ch(b[0], b[1], -1), dans: b[0] };
    return { haut: ch(d[0], d[1], 1), bas: ch(b[0], b[1], -1), dans: null };
  }
  /** Les VARIANTES d'un chemin, de la plus riche à la plus courte ; toutes gardent la condition
   *  (« si … ») et collent l'heure d'un chiffre publié à CE chiffre. Les deux chemins sont écrits
   *  dans la même variante (choisie par le dessin : la plus riche qui tient pour les deux). */
  const VARIANTES_SUITE = { debutant: ['plein', 'court', 'mini'], expert: ['plein', 'mini'] };
  /** Le texte d'un chemin, en lignes. variante : 'plein' | 'court' | 'mini'.
   *  ch null : le côté sans niveau nommé (dit, dans la même variante). */
  function texteSuite(ch, mode, unite, itv, P, variante, sens) {
    const v = variante || 'plein', exp = mode === 'expert', it = itv ? nomIntervalle(itv) + ' ' : '';
    const pc = P ? pctParam(P.distanceMax) + ' %' : '';
    const up = ch ? ch.sens > 0 : sens > 0;
    if (!ch) {
      if (v === 'mini') return [(up ? '↑ ' : '↓ ') + 'aucun niveau', pc ? '(< ' + pc + ')' : ''].filter(Boolean);
      if (exp) return [(up ? 'Au-dessus' : 'Au-dessous') + ' : aucun niveau', pc ? '(< ' + pc + ')' : ''].filter(Boolean);
      return ['Si clôture ' + (v === 'plein' ? it : '') + (up ? 'au-dessus' : 'au-dessous') + ' :', 'aucun niveau nommé' + (pc ? ' à moins de ' + pc : '')];
    }
    const rx = ch.rx || bord(ch.seuil, up), ry = ch.ry || (ch.cible ? bord(ch.cible, !up) : null);
    const loin = pc ? ' à moins de ' + pc : '';
    if (v === 'mini') return [(up ? 'si > ' : 'si < ') + chiffresR(rx) + (fini(rx.lu) ? ' (' + tagMicro(rx).slice(1) + ')' : ''),
      '→ ' + (ry ? chiffresR(ry) + (fini(ry.lu) ? ' (' + tagMicro(ry).slice(1) + ')' : '') : 'aucun niveau')];
    if (exp) return ['Si clôt. ' + it + (up ? '> ' : '< ') + chiffresR(rx) + tagLu(rx, 'expert'), '→ ' + (ry ? chiffresR(ry) + tagLu(ry, 'expert') : 'aucun niveau nommé' + loin)];
    if (v === 'court') return ['Si clôture ' + (up ? '> ' : '< ') + prixR(rx, unite) + tagLu(rx), '→ ' + (ry ? prixR(ry, unite) + tagLu(ry) : 'aucun autre niveau')];
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
    return 'une zone de ' + chiffres(a) + ' à ' + prix(b, unite) + ' (' + distinguer(publieesDAbord(R), quoi).join(', ') + ')';
  }
  /** La forme COMPACTE (écran étroit) : les prix seuls, chacun avec son heure s'il est publié
   *  (« 83 000 $ (lu à 15:03) », « 81 670 (lu à 21:03) – 81 891 $ ») ; les libellés des bandes
   *  disent les origines. */
  function decrireCompact(niv, unite) {
    const R = niv.raisons, h = r => (r && fini(r.lu) ? ' (' + (r.nature === 'modèle' ? 'modèle, ' : '') + 'lu à ' + heureUTC(r.lu) + ')' : '');
    if (R.length === 1) return prixR(R[0], unite) + h(R[0]);
    const [a, b] = bornesNiv(niv), ra = R.find(r => valeurR(r) === a), rb = R.find(r => valeurR(r) === b);
    const ha = R.filter(r => valeurR(r) === a && fini(r.lu)).map(h)[0] || '', hb = R.filter(r => valeurR(r) === b && fini(r.lu)).map(h)[0] || '';
    return chiffres(a) + (ra ? ha : '') + ' – ' + prix(b, unite) + (rb ? hb : '');
  }
  const PHRASES_REGIME = { hausse: 'marché en tendance haussière', baisse: 'marché en tendance baissière', incertaine: 'marché en tendance, de sens incertain',
    sans: 'marché sans tendance nette', faible: 'tendance faible' };
  /** quand (forme finie) : { bougies, itv, date } — l'âge de l'issue, dit en bougies et en date :
   *  « vient d'être » ne se dit que pour la dernière bougie close. */
  function quandFin(q) {
    if (!q || !fini(q.bougies) || q.bougies <= 1) return null;
    return 'il y a ' + q.bougies + ' bougies' + (q.itv ? ' ' + nomIntervalle(q.itv) : '') + (q.date ? ' (' + q.date + ')' : '');
  }
  function phraseForme(f, unite, quand) {
    const nom = NOMS_FORMES[f.type][2], e = etatForme(f), dbl = estDouble(f), il = quandFin(quand);
    switch (e.cle) {
      case 'formation': return nom + ' est en formation';
      case 'dedans': return f.type === 'range' ? 'le prix est dans ' + nom + ' (' + chiffres(f.bas) + ' – ' + prix(f.haut, unite) + ')' : 'le prix est dans ' + nom;
      case 'demi': return dbl ? nom + ' attend une 2e clôture ' + (f.sens < 0 ? 'sous' : 'au-dessus de') + ' sa ligne de cou (' + prix(f.niveau, unite) + ')'
        : 'le prix est sorti ' + (f.demiSens > 0 ? 'par le haut' : 'par le bas') + ' d’' + nom + ', une 2e clôture dehors le validerait';
      case 'confirme': return nom + ' est confirmé (objectif théorique ' + prix(f.objectif, unite) + ', non garanti)';
      case 'atteint': return nom + ' a atteint son objectif théorique' + (il ? ' ' + il : '');
      case 'invalide': return il ? nom + ' a été invalidé ' + il : nom + ' vient d’être invalidé';
      default: return '';
    }
  }
  /** o = { prix, unite, choix: { dessus, dessous }, enTest: niv | null, regime, forme, formeQuand,
   *        court, compact, sansForme, maintenant }
   *  forme : une forme DESSINÉE (ou null) ; formeQuand : l'âge de son issue (phraseForme) ;
   *  court : sans le sens du régime (le badge le dit déjà), la compression reste dite ;
   *  compact : les bandes dites par leurs prix (et leurs heures), sans leurs noms ;
   *  sansForme : sans la phrase de la forme (son étiquette la dit) ;
   *  maintenant : la vue montre le passé, la phrase dit l'instant présent. */
  function lecture(o) {
    const P = prix(o.prix, o.unite), d = o.choix && o.choix.dessus[0], b = o.choix && o.choix.dessous[0];
    const dc = niv => (o.compact ? decrireCompact(niv, o.unite) : decrire(niv, o.unite));
    let s1;
    if (!fini(o.prix)) s1 = 'Prix live absent.';
    else if (o.compact) {
      const t = 'Prix ' + P;
      s1 = o.enTest ? t + ' dans la bande ' + dc(o.enTest) + '.' : d && b ? t + ' entre ' + dc(b) + ' et ' + dc(d) + '.'
        : d ? t + ' sous ' + dc(d) + '.' : b ? t + ' au-dessus de ' + dc(b) + '.' : t + ' : aucun niveau nommé proche.';
    } else if (o.enTest) s1 = 'Le prix (' + P + ') teste ' + dc(o.enTest) + '.';
    else if (d && b) s1 = 'Le prix (' + P + ') est entre ' + dc(b) + ' et ' + dc(d) + '.';
    else if (d) s1 = 'Le prix (' + P + ') est sous ' + dc(d) + '.';
    else if (b) s1 = 'Le prix (' + P + ') est au-dessus ' + deArt(dc(b)) + '.';
    else s1 = 'Le prix (' + P + ') n’a aucun niveau nommé proche.';
    if (o.maintenant) s1 = 'Maintenant : ' + s1.charAt(0).toLowerCase() + s1.slice(1);
    const parts = [];
    if (o.regime && o.regime.cle !== 'inconnu') {
      if (!o.court) parts.push(PHRASES_REGIME[o.regime.cle] + (o.regime.compression ? ', volatilité comprimée' : ''));
      else if (o.regime.compression) parts.push('volatilité comprimée');
    }
    if (o.forme && !o.sansForme) { const t = phraseForme(o.forme, o.unite, o.formeQuand); if (t) parts.push(t); }
    if (!parts.length) return s1;
    const s2 = parts.join(' ; ');
    return s1 + ' ' + s2.charAt(0).toUpperCase() + s2.slice(1) + '.';
  }
  /** Les formes de la lecture, de la plus riche à la plus courte : le dessin prend la première
   *  qui tient dans ses lignes (pour TOUS les prix « en test » possibles). */
  const VARIANTES_LECTURE = [{}, { court: true }, { court: true, compact: true }, { court: true, compact: true, sansForme: true }];

  // ─── 7. Mode Débutant : l'écran calme ─────────────────────────────────────
  // Le Débutant voit le prix, UNE phrase, un repère au-dessus, un au-dessous, le scénario 1 : le
  // détail est dans la bulle (survol, toucher). Mêmes valeurs que l'Expert, d'autres mots ; aucun
  // nom d'indicateur, aucune heure UTC, aucun pourcentage dans la phrase. Chaque texte d'étiquette
  // rend la PREMIÈRE variante qui tient en caractères (max) ET en pixels (mesure(t) ≤ maxPx).
  const OPTIONS_CLES = ['put_wall', 'call_wall', 'zero_gamma'];
  const estOption = r => OPTIONS_CLES.includes(r.cle);
  const optionsSeules = niv => !!niv && niv.raisons.length > 0 && niv.raisons.every(estOption);
  /** [nom, mot (étroit), avec article] : les mots de l'écran Débutant (aucun mot technique). */
  /** [nom, mot (étroit), avec article, mini (≤ 8 : téléphone avec flèche)] : les mots de l'écran
   *  Débutant (aucun mot technique). Une zone où le prix a fait demi-tour se dit « zone de
   *  retour » : elle peut être au-dessus ou au-dessous du prix (« rebond » ferait lire un plancher). */
  const NOMS_DEBUTANT = {
    hier_haut: ['Haut d’hier', 'Haut hier', 'le plus haut d’hier', 'Max hier'],
    hier_bas: ['Bas d’hier', 'Bas hier', 'le plus bas d’hier', 'Min hier'],
    h24_haut: ['Haut des 24 h', 'Haut 24 h', 'le plus haut des 24 h', 'Max 24 h'],
    h24_bas: ['Bas des 24 h', 'Bas 24 h', 'le plus bas des 24 h', 'Min 24 h'],
    sem_haut: ['Haut sem. passée', 'Haut sem.', 'le plus haut de la semaine dernière', 'Max sem.'],
    sem_bas: ['Bas sem. passée', 'Bas sem.', 'le plus bas de la semaine dernière', 'Min sem.'],
    sr: ['Zone de retour', 'Demi-tour', 'une zone de retour', 'Retour'],
    mur_achat: ['Mur d’achat', 'Mur achat', 'le mur d’achat', 'Achats'],
    mur_vente: ['Mur de vente', 'Mur vente', 'le mur de vente', 'Ventes'],
    options: ['Repère d’options', 'Options', 'un repère d’options', 'Options'],
  };

  const nomsDebutant = r => NOMS_DEBUTANT[estOption(r) ? 'options' : r.cle] || [r.nom, r.mot || r.nom, r.art || minuscule(r.nom), r.mot || r.nom];
  // À égalité de prix : hier, semaine, 24 h, mur, zone de retour, options.
  const rangRaison = r => { const k = ['hier_', 'sem_', 'h24_', 'mur_', 'sr'].findIndex(p => r.cle.indexOf(p) === 0); return k < 0 ? 9 : k; };
  /** La raison qui NOMME une bande à l'écran : celle dont le prix est le prix de la bande (le prix
   *  réel le plus proche du prix de référence), jamais une option si la bande a une autre raison. */
  function raisonPrincipale(niv) {
    if (niv && niv.principale) return niv.principale;   // un repère du Débutant (reperesDe) : sa raison
    const R = (niv && niv.raisons) || [], hors = R.filter(r => !estOption(r)), C = hors.length ? hors : R;
    return C.slice().sort((a, b) => Math.abs(a.p - niv.p) - Math.abs(b.p - niv.p) || rangRaison(a) - rangRaison(b))[0] || null;
  }
  /** Les deux bandes de l'écran Débutant : la plus proche de chaque côté, sauf une bande faite
   *  seulement d'options quand ce côté en a une autre (une estimation ne passe pas devant une mesure). */
  function choixDebutant(choix) {
    const un = L => (L || []).find(n => !optionsSeules(n)) || (L || [])[0] || null;
    return { dessus: choix ? un(choix.dessus) : null, dessous: choix ? un(choix.dessous) : null };
  }
  /** Les REPÈRES du Débutant : un par prix nommé des bandes de l'Expert (deux raisons au même prix
   *  n'en font qu'un). Une bande de l'Expert réunit des prix proches (fusion) ; le Débutant, lui,
   *  montre UN prix de chaque côté du prix live : chaque repère est donc le prix d'une raison réelle,
   *  sa bande à lui (± demi), et garde sa bande d'origine (bande) pour la bulle. Les valeurs sont
   *  celles de l'Expert : rien n'est recalculé, sauf l'état fermé de la petite bande (app.js). */
  function reperesDe(choix, demi) {
    const out = [];
    for (const niv of choix ? choix.dessus.concat(choix.dessous) : []) {
      for (const r of niv.raisons) {
        if (!fini(r.p)) continue;
        const deja = out.find(x => x.p === r.p);
        if (deja) { if (!deja.raisons.includes(r)) deja.raisons.push(r); continue; }
        out.push({ raisons: [r], p: r.p, pMin: r.p, pMax: r.p, bande: niv });
      }
    }
    for (const x of out) {
      const hors = x.raisons.filter(r => !estOption(r)), C = hors.length ? hors : x.raisons;
      x.principale = C.slice().sort((a, b) => rangRaison(a) - rangRaison(b))[0];
      x.raisons.sort((a, b) => (a === x.principale ? -1 : b === x.principale ? 1 : 0));
      x.demi = fini(demi) ? demi : (x.bande.demi || 0);
      x.lo = x.p - x.demi; x.hi = x.p + x.demi;
      let lu = -Infinity;
      for (const r of x.raisons) if (fini(r.lu) && r.lu > lu) lu = r.lu;
      if (lu > -Infinity) x.lu = lu;
    }
    return out.sort((a, b) => a.p - b.p);
  }
  /** Les deux repères à l'écran, au prix LIVE : de chaque côté, le plus proche STRICTEMENT au-dessus
   *  et au-dessous (une bande de l'Expert qui enjambe le prix donne un repère à chaque côté) ; un
   *  repère fait seulement d'options ne passe qu'à défaut d'une mesure du même côté ; un mur d'achat
   *  n'est jamais « au-dessus », un mur de vente jamais « au-dessous » (même règle que les bandes).
   *  Deux repères distincts : s'ils sont à moins de `ecart` l'un de l'autre, le plus proche du prix
   *  reste et l'autre côté passe au suivant (à au moins `ecart` de lui). Les suivants (au-delà de
   *  chacun, à au moins `ecart`) disent le chemin « si le prix finit au-delà ».
   *  → { dessus, dessous, suivantHaut, suivantBas } (copies portant `dessus`), null d'un côté vide. */
  function choisirReperes(reps, prix, ecart) {
    const vide = { dessus: null, dessous: null, suivantHaut: null, suivantBas: null };
    if (!fini(prix) || !reps || !reps.length) return vide;
    const e = fini(ecart) && ecart > 0 ? ecart : 0;
    const que = x => x.raisons.every(r => r.cle === x.raisons[0].cle) ? x.raisons[0].cle : null;
    const H = reps.filter(x => x.p > prix && que(x) !== 'mur_achat').sort((a, b) => a.p - b.p);
    const B = reps.filter(x => x.p < prix && que(x) !== 'mur_vente').sort((a, b) => b.p - a.p);
    const mesure = L => { const m = L.filter(x => !optionsSeules(x)); return m.length ? m : L; };
    const Hm = mesure(H), Bm = mesure(B);
    let h = Hm[0] || null, b = Bm[0] || null;
    if (h && b && h.p - b.p < e) {
      if (h.p - prix <= prix - b.p) b = Bm.find(x => h.p - x.p >= e) || b;
      else h = Hm.find(x => x.p - b.p >= e) || h;
    }
    const sh = h ? Hm.find(x => x.p - h.p >= e && x !== h) || null : null;
    const sb = b ? Bm.find(x => b.p - x.p >= e && x !== b) || null : null;
    const cote = (x, d) => (x ? Object.assign({}, x, { dessus: d }) : null);
    return { dessus: cote(h, true), dessous: cote(b, false), suivantHaut: cote(sh, true), suivantBas: cote(sb, false) };
  }
  const tient = (t, max, mesure, maxPx) => (!(max > 0) || t.length <= max) && (typeof mesure !== 'function' || !(maxPx > 0) || mesure(t) <= maxPx);
  /** La première variante qui tient ; sinon la dernière (la plus courte). */
  function premiere(V, max, mesure, maxPx) { for (const t of V) if (tient(t, max, mesure, maxPx)) return t; return V[V.length - 1]; }
  /** Les FORMATS d'un libellé de repère, du plus riche au plus court ; tous gardent le prix ET son
   *  unité : 0 « Mur de vente · 82 610 $ », 1 « Mur vente · 82 610 $ », 2 « Mur vente 82 610 $ »,
   *  3 « Ventes 82 610 $ », 4 « 82 610 $ ». Une flèche (bande hors de la vue) précède, collée dans
   *  les formats sans « · ». Les formats 0 et 1 ont le séparateur « · », les autres non : l'écran
   *  choisit un même style pour ses deux libellés (app.js). */
  const AVEC_POINT = k => k < 2;
  function libellesDebutant(niv, o) {
    const q = o || {}, r = raisonPrincipale(niv);
    if (!r) return [];
    const [nom, mot, , mini] = nomsDebutant(r), p = prixR(r, q.unite), f = q.fleche || '';
    const fs = f ? f + ' ' : '';
    return [fs + nom + ' · ' + p, fs + mot + ' · ' + p, f + mot + ' ' + p, f + mini + ' ' + p, f + (f ? ' ' : '') + p];
  }
  /** Le premier format qui tient (caractères, pixels) : son indice. */
  function formatDebutant(V, o) {
    const q = o || {};
    for (let k = 0; k < V.length; k++) if (tient(V[k], q.max, q.mesure, q.maxPx)) return k;
    return V.length - 1;
  }
  /** Le libellé d'un repère (le premier format qui tient). o = { max, unite, fleche ('↑' | '↓' :
   *  bande hors de la vue), mesure, maxPx }. */
  function libelleDebutant(niv, o) {
    const V = libellesDebutant(niv, o);
    return V.length ? V[formatDebutant(V, o)] : '';
  }
  /** Le nom entier d'une raison, en mots du Débutant (« Mur de vente »). */
  const nomDebutant = r => nomsDebutant(r)[0];
  /** Son nom dans une phrase, sans article : « plus haut d’hier », « mur de vente ». */
  const nomPhrase = r => nomsDebutant(r)[2].replace(/^(?:le|la|les|une?) /, '');
  /** Le titre de la bulle d'un repère : son nom entier et son prix. */
  function titreDebutant(niv, unite) {
    const r = raisonPrincipale(niv);
    return r ? nomsDebutant(r)[0] + ' · ' + prixR(r, unite) : '';
  }
  /** Le début de la phrase, selon l'intervalle affiché : le verbe décrit CETTE durée, pas 24 h. */
  const HORIZON_DEBUTANT = { '1m': 'Ces dernières minutes', '5m': 'Depuis une heure environ', '15m': 'Ces dernières heures', '1h': 'Depuis hier', '4h': 'Ces derniers jours', '1d': 'Ces dernières semaines' };
  /** Une bougie, dite en mots : [singulier, pluriel (2), démonstratif, pluriel sans nombre]. */
  const PERIODE_DEBUTANT = {
    '1m': ['une minute', '2 minutes', 'cette minute', 'minutes'],
    '5m': ['une tranche de 5 min', '2 tranches de 5 min', 'cette tranche de 5 min', 'tranches de 5 min'],
    '15m': ['un quart d’heure', '2 quarts d’heure', 'ce quart d’heure', 'quarts d’heure'],
    '1h': ['une heure', '2 heures', 'cette heure', 'heures'],
    '4h': ['une tranche de 4 h', '2 tranches de 4 h', 'cette tranche de 4 h', 'tranches de 4 h'],
    '1d': ['une journée', '2 journées', 'cette journée', 'journées'],
  };
  const periode = itv => PERIODE_DEBUTANT[itv] || ['une période', '2 périodes', 'cette période', 'périodes'];
  /** « 5 derniers jours », « 18 dernières heures », « 45 dernières minutes » (s en secondes). */
  function dernieres(s) {
    if (!fini(s) || s <= 0) return null;
    if (s >= 2 * 86400) return Math.round(s / 86400) + ' derniers jours';
    if (s >= 2 * 3600) return Math.round(s / 3600) + ' dernières heures';
    return Math.max(2, Math.round(s / 60)) + ' dernières minutes';
  }
  /** « environ 3 h 30 », « environ 5 jours » (s en secondes). */
  function environ(s) {
    if (!fini(s) || s <= 0) return null;
    if (s >= 2 * 86400) return 'environ ' + Math.round(s / 86400) + ' jours';
    if (s >= 3600) { const h = Math.floor(s / 3600), m = Math.round((s - h * 3600) / 1800) * 30; return 'environ ' + h + ' h' + (m === 60 ? '' : m ? ' ' + m : ''); }
    return 'environ ' + Math.round(s / 60) + ' min';
  }
  let FMT_PARIS = null;
  try { FMT_PARIS = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); } catch (e) { FMT_PARIS = null; }
  /** « 07h33 » (heure de Paris), null si le fuseau est inconnu du navigateur. */
  function heureParis(ms) {
    if (!fini(ms) || !FMT_PARIS) return null;
    const p = {};
    for (const x of FMT_PARIS.formatToParts(new Date(ms))) p[x.type] = x.value;
    return p.hour + 'h' + p.minute;
  }
  /** L'âge d'un chiffre publié, en mots : « il y a 4 min (07h33, heure de Paris) » ; sans
   *  `maintenant`, l'heure de Paris seule. */
  function ageDebutant(lu, maintenant, sansHeure) {
    if (!fini(lu)) return '';
    const hp = heureParis(lu), m = fini(maintenant) ? Math.max(0, Math.round((maintenant - lu) / 60000)) : null;
    const age = m === null ? null : m < 90 ? m + ' min' : Math.round(m / 60) + ' h';
    if (age === null) return hp ? 'à ' + hp + ' (heure de Paris)' : '';
    return 'il y a ' + age + (hp && !sansHeure ? ' (' + hp + ', heure de Paris)' : '');
  }
  // Un écart en dollars se lit à l'unité près (« 84 $ », pas « 83,57 $ ») dès 10 $.
  const prixRond = (v, unite) => (Math.abs(v) >= ((unite || '$') === '$' ? 10 : 100) ? nombre(Math.round(Math.abs(v)), 0) + ' ' + (unite || '$') : prix(Math.abs(v), unite));
  /** La phrase de lecture, ses variantes de la plus riche à la plus courte (la dernière est la
   *  forme COMPACTE). o = { prix (live), unite, choix, enTest (bande où est le prix, ou null),
   *  regime, maintenant (la vue montre le passé), itv (« 15m ») }. Jamais de %, d'heure, ni de nom
   *  d'indicateur : le verbe vient du régime (le même objet que le badge Expert). */
  const VERBE_DEBUTANT = { hausse: 'monte', baisse: 'baisse', faible: 'hésite', sans: 'hésite', incertaine: 's’agite' };
  function phrasesDebutant(o) {
    if (!fini(o.prix)) return ['Prix en direct indisponible pour l’instant.'];
    const u = o.unite, ch = o.reperes || choixDebutant(o.choix), rA = ch.dessus && raisonPrincipale(ch.dessus), rB = ch.dessous && raisonPrincipale(ch.dessous);
    const A = rA && prixR(rA, u), B = rB && prixR(rB, u), Bc = rB && chiffresR(rB);
    const H = HORIZON_DEBUTANT[o.itv] || null, cle = o.regime ? o.regime.cle : 'inconnu';
    const avecH = s => (H ? [H + ', ' + minuscule(s)] : []).concat([s]);
    let V, compacte;
    const enTest = o.enTest && raisonPrincipale(o.enTest);
    const casseSous = ch.dessus && ch.dessus.ferme && ch.dessus.ferme.cassure === 'valide' && ch.dessus.ferme.sens < 0;
    const casseSur = ch.dessous && ch.dessous.ferme && ch.dessous.ferme.cassure === 'valide' && ch.dessous.ferme.sens > 0;
    if (enTest) {
      const N = nomsDebutant(enTest)[2], P = prixR(enTest, u), sens = VERBE_DEBUTANT[cle] || null;
      // Le verbe du mouvement passe avant le nom du repère : sur téléphone (48 caractères),
      // « Le prix monte et touche 82 710 $. » plutôt que « Le prix touche le mur de vente (…) ».
      V = (sens ? avecH('Le prix ' + sens + ' et touche ' + N + ' (' + P + ').').concat(['Le prix ' + sens + ' et touche ' + P + '.']) : [])
        .concat(['Le prix touche ' + N + ' (' + P + ').', 'Le prix touche le repère ' + P + '.']);
      compacte = 'Le prix touche ' + P + '.';
    } else if (casseSur || casseSous) {
      V = [casseSur ? 'Le prix est passé au-dessus de ' + B + '.' : 'Le prix est passé sous ' + A + '.'];
      compacte = V[0];
    } else if (cle === 'hausse') {
      V = A ? avecH('Le prix monte. Repère au-dessus : ' + A + '.') : avecH('Le prix monte. Aucun repère proche au-dessus.').concat(['Le prix monte.']);
      compacte = A ? 'Le prix monte. Au-dessus : ' + A + '.' : 'Le prix monte.';
    } else if (cle === 'baisse') {
      V = B ? avecH('Le prix baisse. Repère en dessous : ' + B + '.') : avecH('Le prix baisse. Aucun repère proche en dessous.').concat(['Le prix baisse.']);
      compacte = B ? 'Le prix baisse. En dessous : ' + B + '.' : 'Le prix baisse.';
    } else if (cle === 'inconnu') {
      if (A && B) { V = ['Le prix est entre ' + B + ' et ' + A + '.', 'Le prix est entre ' + Bc + ' et ' + A + '.']; compacte = V[1]; }
      else if (A) { V = ['Le prix est sous ' + A + '. Aucun repère proche en dessous.', 'Le prix est sous ' + A + '.']; compacte = V[1]; }
      else if (B) { V = ['Le prix est au-dessus de ' + B + '. Aucun repère proche au-dessus.', 'Le prix est au-dessus de ' + B + '.']; compacte = V[1]; }
      else { V = ['Le prix est sans repère proche.']; compacte = V[0]; }
    } else {
      // faible, sans tendance : « hésite » ; tendance de sens incertain : « s'agite » (il bouge fort).
      const verbe = cle === 'incertaine' ? 's’agite' : 'hésite';
      if (A && B) { V = avecH('Le prix ' + verbe + ' entre ' + B + ' et ' + A + '.').concat(['Le prix ' + verbe + ' entre ' + Bc + ' et ' + A + '.']); compacte = 'Le prix ' + verbe + ' : ' + Bc + ' – ' + A + '.'; }
      else if (A) { V = avecH('Le prix ' + verbe + ' sous ' + A + '. Aucun repère proche en dessous.').concat(['Le prix ' + verbe + ' sous ' + A + '.']); compacte = V[V.length - 1]; }
      else if (B) { V = avecH('Le prix ' + verbe + ' au-dessus de ' + B + '. Aucun repère proche au-dessus.').concat(['Le prix ' + verbe + ' au-dessus de ' + B + '.']); compacte = V[V.length - 1]; }
      else { V = avecH('Le prix ' + verbe + ' : aucun repère proche.'); compacte = V[V.length - 1]; }
    }
    // Vue dans le passé : « Maintenant, … » (sans l'horizon, qui parlerait d'une autre durée), s'il tient.
    if (o.maintenant) { const sansH = V.filter(v => !H || v.indexOf(H) !== 0); V = ['Maintenant, ' + minuscule(sansH[0])].concat(sansH); }
    return V.concat([compacte]);
  }
  /** La phrase qui tient (caractères et pixels) ; à défaut, la forme compacte. */
  function phraseDebutant(o, max, mesure, maxPx) {
    const V = phrasesDebutant(o);
    for (const t of V) if (tient(t, max, mesure, maxPx)) return t;
    return V[V.length - 1];
  }
  /** Un chemin « Et ensuite ? » en une phrase : « Si le prix finit un quart d'heure au-dessus de
   *  82 827 $ (zone de retour), le repère suivant est 83 105 $ (haut d'hier). » Un chiffre
   *  publié dit son âge. ch null : le côté sans repère proche, dit. */
  function texteSuiteDebutant(ch, unite, itv, sens, maintenant) {
    const up = ch ? ch.sens > 0 : sens > 0, per = periode(itv);
    if (!ch) return 'Aucun repère proche ' + (up ? 'au-dessus' : 'en dessous') + ' : pas de suite à décrire de ce côté.';
    const rx = ch.rx || bord(ch.seuil, up), ry = ch.ry || (ch.cible ? bord(ch.cible, !up) : null);
    const de = r => ' (' + nomPhrase(r) + (fini(r.lu) ? ', relevé ' + ageDebutant(r.lu, maintenant, true) : '') + ')';
    return 'Si le prix finit ' + per[0] + (up ? ' au-dessus de ' : ' sous ') + prixR(rx, unite) + de(rx) + ', '
      + (ry ? 'le repère suivant est ' + prixR(ry, unite) + de(ry) + '.' : 'aucun autre repère n’est proche de ce côté.');
  }
  /** L'état d'un repère au prix live, en mots (bulle). */
  const ETATS_DEBUTANT = {
    loin: () => 'loin du prix', proche: () => 'proche du prix', test: () => 'le prix est dedans',
    meche: () => 'le prix l’a traversé un instant, puis il est revenu', mecheCours: () => 'le prix le traverse en ce moment',
    franchi: p => 'le prix est au-delà ; à confirmer quand ' + p[2] + ' se termine',
    demi: p => 'franchi une fois ; ' + p[0] + ' de plus au-delà le confirmerait',
    demiRetour: () => 'franchi, puis le prix est revenu dans la bande',
    valide: p => 'franchi et confirmé (' + p[1] + ' finis au-delà)',
    valideRetour: () => 'franchi, revenu le toucher, puis reparti : confirmé',
  };
  /** « Maintenant : proche du prix, 264 $ au-dessus (0,32 %). » e : etatLive ; live : le prix. */
  function texteEtatDebutant(e, niv, live, unite, itv) {
    if (!e || e.mot === null || !fini(live) || !niv) return 'Maintenant : prix en direct indisponible, distance inconnue.';
    const f = ETATS_DEBUTANT[e.mot], d = niv.p - live;
    const dist = e.mot === 'test' ? '' : ', ' + prixRond(d, unite) + (d > 0 ? ' au-dessus' : ' en dessous') + (fini(e.dist) ? ' (' + nombre(Math.abs(e.dist), 2) + ' %)' : '');
    return 'Maintenant : ' + (f ? f(periode(itv)) : e.mot) + dist + '.';
  }
  /** L'origine d'une raison en mots simples, pour la bulle d'un repère. pasS : la durée d'une
   *  bougie (s), pour dire la fenêtre des zones de rebonds en jours ou en heures. */
  function origineDebutant(r, unite, maintenant, pasS) {
    const n = nomsDebutant(r)[0] + ' (' + prixR(r, unite) + ') : ';
    const age = fini(r.lu) ? ', relevée ' + ageDebutant(r.lu, maintenant) : '';
    if (estOption(r)) return n + 'une estimation, tirée des contrats d’options de la plateforme Deribit (des contrats sur le prix futur du BTC)' + age + '. Pas une mesure : un calcul sur ces contrats.';
    switch (r.cle) {
      case 'hier_haut': return n + 'le prix le plus haut atteint hier, sur ce graphique.';
      case 'hier_bas': return n + 'le prix le plus bas atteint hier, sur ce graphique.';
      case 'sem_haut': return n + 'le prix le plus haut de la semaine dernière.';
      case 'sem_bas': return n + 'le prix le plus bas de la semaine dernière.';
      case 'h24_haut': return n + 'le prix le plus haut des dernières 24 heures.';
      case 'h24_bas': return n + 'le prix le plus bas des dernières 24 heures.';
      case 'sr': { const d = fini(r.bougies) && fini(pasS) ? dernieres(r.bougies * pasS) : null; return n + (r.touches || '') + ' fois, le prix a fait demi-tour autour de ce prix' + (d ? ' sur les ' + d + ' de ce graphique' : '') + '.'; }
      case 'mur_achat': case 'mur_vente': {
        const q = fini(r.btc) ? ' (' + nombre(r.btc, r.btc >= 10 ? 0 : 1) + ' BTC)' : '';
        return n + (fini(r.bin) && r.bin > 0 ? 'la tranche de ' + nombre(r.bin, 0) + ' $' : 'le prix') + ' où le plus de BTC attendaient ' + (r.cle === 'mur_achat' ? 'à l’achat' : 'à la vente') + q
          + ' parmi les ordres en attente de Binance' + age + '. Ces ordres peuvent avoir bougé depuis.';
      }
      default: return n + minuscule(r.nom) + '.';
    }
  }
  /** Le libellé d'une forme en Débutant (au plus 24 caractères) : seulement confirmée ou invalidée. */
  const NOM_FORME_DEBUTANT = { double_sommet: 'Double sommet', double_creux: 'Double creux', range: 'Rectangle', triangle: 'Triangle' };
  function libelleFormeDebutant(f) {
    const e = etatForme(f), nom = NOM_FORME_DEBUTANT[f.type];
    if (!nom) return null;
    if (e.cle === 'confirme') return estDouble(f) ? nom + ' confirmé' : 'Sortie du ' + minuscule(nom) + (f.sens > 0 ? ' ↑' : ' ↓');
    if (e.cle === 'invalide') return nom + ' invalidé';
    return null;
  }
  const DEFINITION_FORME = {
    double_sommet: 'Double sommet : le prix a buté deux fois sur le même plafond, puis il est passé sous le creux entre les deux.',
    double_creux: 'Double creux : le prix a buté deux fois sur le même plancher, puis il est passé au-dessus du sommet entre les deux.',
    range: 'Rectangle : le prix a fait des allers-retours entre un plafond et un plancher, puis il en est sorti.',
    triangle: 'Triangle : les allers-retours du prix se sont resserrés, puis il en est sorti.',
  };
  /** La bulle d'une forme en Débutant : la définition d'abord, puis le prix visé TOUJOURS avec son
   *  bilan mesuré (jamais seul : seul, il se lirait comme une promesse), puis l'avertissement.
   *  ctx = { duree (s) de l'historique }. */
  function texteFormeDebutant(f, b, ctx, P, unite) {
    const e = etatForme(f), out = [];
    out.push(DEFINITION_FORME[f.type].replace(/\.$/, '') + (e.cle === 'invalide' ? ', puis le prix est revenu : la figure ne tient plus.' : '.'));
    if (b) {
      const T = b.temoin || { departs: 0, atteints: 0 }, finis = b.atteints + b.invalides + b.expires;
      const d = dernieres(ctx && ctx.duree);
      let t = 'Mesuré sur les ' + (d || 'données') + ' de ce graphique : ' + b.formes + (b.formes > 1 ? ' figures' : ' figure') + ' de ce type, ' + b.confirmes + (b.confirmes > 1 ? ' confirmées' : ' confirmée');
      t += finis ? ', cible atteinte ' + b.atteints + ' fois sur ' + finis + '.' : ', aucune n’est encore allée au bout.';
      if (T.departs) t += ' Pour comparer, sans figure, un trajet de même taille : ' + nombre(T.atteints, 0) + ' fois sur ' + nombre(T.departs, 0) + '.';
      if (b.confirmes < P.echantillonFaible) t += ' Trop peu de cas pour en tirer une règle.';
      if (e.cle === 'confirme' && finis && fini(f.objectif)) t = 'En théorie, cette figure vise ' + prix(f.objectif, unite) + '. ' + t;
      out.push(t);
    }
    out.push('Une lecture débattue, pas une prévision ni un conseil.');
    return out;
  }
  /** Les mots qui n'ont pas leur place sur l'écran Débutant (noms d'indicateurs, jargon, heures UTC,
   *  intervalles abrégés). Partagée avec les tests et js/scenarios.js. */
  const MOTS_BANNIS_DEBUTANT = [
    /\b(?:ADX|EMA|SMA|ATR|RSI|MACD|VWAP|GEX|CVD|OI|SAR|POC|OBV|MFI|CCI|VIX|DXY)\b/, /[+−-]?\bDI\b/, /\bUTC\b/, /\b[RS][1-4]\b/, /\b\d+[mhd]\b/,
    /bollinger/i, /\bstoch\w*/i, /gamma/i, /γ/, /Σ/, /\bbid\b/i, /\bask\b/i, /\bdelta\b/i, /\bfunding\b/i, /open interest/i, /\btaker\b/i,
    /\bL\/S\b/i, /\bratio\b/i, /\bpivots?\b/i, /\bS\/R\b/i, /\bcalls?\b/i, /\bputs?\b/i, /\bstrikes?\b/i, /liquidité/i, /\bcarnet\b/i, /convention/i,
    /\bmodèles?\b/i, /percentile/i, /\bbougies?\b/i, /\bclôtur\w*/i, /\bmèches?\b/i, /\brange\b/i, /ichimoku/i, /\bfibo\w*/i, /oscillateur\w*/i,
    /chartisme/i, /volatilité/i,
  ];
  /** Les mots bannis trouvés dans t (liste vide : rien à redire). */
  const motsBannis = t => MOTS_BANNIS_DEBUTANT.filter(re => re.test(String(t))).map(re => (String(t).match(re) || [''])[0]);
  /** Un terme permis dans une bulle Débutant seulement avec son explication, dans la même bulle. */
  const EXPLIQUES_DEBUTANT = { 'repère d’options': 'une estimation, tirée des contrats d’options de la plateforme Deribit' };

  return { pctParam, nombre, prix, chiffres, pct, nomIntervalle, duree, heureUTC, niveauxDuJour, niveauxSR, niveauxPublies, choisirNiveaux, libelleNiveau,
    prixR, tagLu, artLu, quoi, bord, etatFerme, etatLive, texteEtatLive, texteEtatMax, MOTS, centile, regime, texteRegime, pivots, regression,
    detecter, bilan, formesAffichees, etatForme, NOMS_FORMES, texteBilan, suite, texteSuite, VARIANTES_SUITE, tagMicro, deArt, decrire, decrireCompact, lecture, VARIANTES_LECTURE, phraseForme, TYPES, bornes,
    NOMS_DEBUTANT, raisonPrincipale, choixDebutant, reperesDe, choisirReperes, VERBE_DEBUTANT, optionsSeules, libelleDebutant, libellesDebutant, formatDebutant, AVEC_POINT, titreDebutant, nomDebutant, nomPhrase, HORIZON_DEBUTANT, PERIODE_DEBUTANT, phrasesDebutant, phraseDebutant,
    texteSuiteDebutant, prixRond, ETATS_DEBUTANT, texteEtatDebutant, origineDebutant, ageDebutant, heureParis, dernieres, environ, libelleFormeDebutant, texteFormeDebutant,
    MOTS_BANNIS_DEBUTANT, motsBannis, EXPLIQUES_DEBUTANT };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Guide;
