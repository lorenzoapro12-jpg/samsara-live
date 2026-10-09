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
    if (s >= 365 * 86400) return nombre(Math.round(s / 86400), 0) + ' j (' + nombre(s / (365.25 * 86400), 1) + ' ans)';
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

  // ─── 4. Figures chartistes ─────────────────────────────────────────────────
  // Seize types en quatre familles, détectés MÉCANIQUEMENT sur les bougies closes :
  //   extremes : double sommet / creux, triple sommet / creux (ligne de cou horizontale) ;
  //   ete      : épaule-tête-épaule et inversé (ligne de cou qui peut pencher) ;
  //   lignes   : rectangle, triangles (ascendant, descendant, symétrique), biseaux, canaux ;
  //   drapeau  : drapeau et fanion (un mât, puis une pause courte).
  // Une figure naît à la clôture où son dernier pivot devient connu (t), puis vit bougie close après
  // bougie close (avancer) : aucune information postérieure n'entre dans sa détection. Une ÉBAUCHE
  // est ce que les MÊMES règles trouvent si le pivot EN ATTENTE (un extrême à qui il manque encore
  // des bougies à droite) était confirmé ; elle naît à une clôture, jamais en cours de bougie.
  // Règle de sortie, la même pour toutes (règle de travail du propriétaire) : « au-delà » = une
  // clôture hors de la bande ± bandeAtr × ATR autour de la ligne de validation (lue à la bougie
  // jugée) ; 1re clôture au-delà = « à confirmer » ; la suivante au-delà = confirmée ; une clôture
  // revenue DANS la bande = un retour (au plus retourMax), et la clôture suivante au-delà confirme
  // (« validée par un retour réussi ») ; plus loin dedans, la sortie est annulée.
  const FAMILLES = { double_sommet: 'extremes', double_creux: 'extremes', triple_sommet: 'extremes', triple_creux: 'extremes', ete: 'ete', ete_inverse: 'ete',
    range: 'lignes', triangle_ascendant: 'lignes', triangle_descendant: 'lignes', triangle_symetrique: 'lignes', biseau_montant: 'lignes', biseau_descendant: 'lignes',
    canal_montant: 'lignes', canal_descendant: 'lignes', drapeau: 'drapeau', fanion: 'drapeau' };
  const TYPES = Object.keys(FAMILLES);
  /** La famille d'une figure ; déduite du type pour un objet minimal (forcé par un test). */
  const famille = f => f.famille || FAMILLES[f.type] || 'extremes';
  const estDouble = f => f.type === 'double_sommet' || f.type === 'double_creux';
  const estTriple = f => f.type === 'triple_sommet' || f.type === 'triple_creux';
  /** Les deux familles de l'écran : « contexte » (figures à deux droites, rectangle compris) et « extrêmes ». */
  const groupeVue = f => (famille(f) === 'lignes' ? 'contexte' : 'extremes');
  /** Le sens d'une sortie à deux côtés possibles (rectangle, triangle…) : celui de la sortie. */
  const deuxCotes = f => famille(f) === 'lignes';

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
  /** Le pivot EN ATTENTE à t (côté s : +1 sommet, −1 creux) : l'extrême des k dernières bougies qui
   *  dépasse déjà ses k voisines de gauche et toutes celles de droite connues, avec au moins dmin
   *  bougies closes à sa droite. Il lui manque `reste` bougies pour devenir un pivot. */
  function enAttente(H, L, t, k, s, dmin) {
    let i = -1;
    for (let q = Math.max(k, t - k + 1); q <= t; q++) {
      let ok = true;
      for (let j = q - k; j <= t && ok; j++) if (j !== q && (s > 0 ? H[j] >= H[q] : L[j] <= L[q])) ok = false;
      if (ok && t - q >= (dmin || 0)) i = q;
    }
    return i < 0 ? null : { i, p: s > 0 ? H[i] : L[i], c: t, conf: i + k, reste: k - (t - i), attente: true };
  }
  function regression(pts) {
    const n = pts.length;
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (const q of pts) { sx += q.i; sy += q.p; sxx += q.i * q.i; sxy += q.i * q.p; }
    const d = n * sxx - sx * sx;
    const b = d ? (n * sxy - sx * sy) / d : 0, a = (sy - b * sx) / n;
    return { a, b };
  }
  /** Deux droites de MÊME pente (canal) : régression commune, deux ordonnées. */
  function regressionParallele(hs, bs) {
    const mx = a => a.reduce((s, q) => s + q.i, 0) / a.length, my = a => a.reduce((s, q) => s + q.p, 0) / a.length;
    const xh = mx(hs), yh = my(hs), xb = mx(bs), yb = my(bs);
    let num = 0, den = 0;
    for (const q of hs) { num += (q.i - xh) * (q.p - yh); den += (q.i - xh) * (q.i - xh); }
    for (const q of bs) { num += (q.i - xb) * (q.p - yb); den += (q.i - xb) * (q.i - xb); }
    const b = den ? num / den : 0;
    return { h: { a: yh - b * xh, b }, b: { a: yb - b * xb, b } };
  }
  const ligne = (l, i) => l.a + l.b * i;
  const pointe = (rh, rb) => (rh.b - rb.b < 0 ? -(rh.a - rb.a) / (rh.b - rb.b) : Infinity);
  /** L'extrême opposé entre deux indices (exclus) : le creux (s < 0) ou le sommet (s > 0). */
  function oppose(H, L, i0, i1, s) {
    let v = s < 0 ? Infinity : -Infinity, jv = -1;
    for (let j = i0 + 1; j < i1; j++) { const x = s < 0 ? L[j] : H[j]; if (s < 0 ? x < v : x > v) { v = x; jv = j; } }
    return { i: jv, p: v };
  }

  // ── Doubles et triples : sommets (s = −1) ou creux (s = +1) au même niveau ──
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
      return { type: s < 0 ? 'double_sommet' : 'double_creux', famille: 'extremes', sens: s, a: { i: a.i, p: a.p }, b: { i: b.i, p: b.p }, cou: { i: jc, p: cou },
        niveau: cou, extreme: E, hauteur: h, objectif: cou + s * h, invalidation: E, debut: a.i, depart: b.i + 1, t, tol };
    }
    return null;
  }
  /** Triple : trois pivots à moins de tol, espacés assez régulièrement (tripleRegulier), deux
   *  creux marqués (tripleCreux × hauteur), rien entre eux au-delà du plus extrême. */
  function tripleExtreme(piv, H, L, t, tol, atr, P, s) {
    const c = piv[piv.length - 1];
    if (!c || c.c !== t || piv.length < 3) return null;
    for (let m2 = piv.length - 2; m2 >= 1; m2--) {
      const b = piv[m2];
      if (c.i - b.i < P.ecartMin) continue;
      if (c.i - b.i > P.ecartMax) break;
      for (let m1 = m2 - 1; m1 >= 0; m1--) {
        const a = piv[m1];
        if (b.i - a.i < P.ecartMin) continue;
        if (c.i - a.i > P.tripleMax) break;
        const hi = Math.max(a.p, b.p, c.p), lo = Math.min(a.p, b.p, c.p);
        if (hi - lo > tol) continue;
        const g1 = b.i - a.i, g2 = c.i - b.i;
        if (Math.min(g1, g2) < P.tripleRegulier * Math.max(g1, g2)) continue;
        let ext = s < 0 ? -Infinity : Infinity;
        for (let j = a.i + 1; j < c.i; j++) if (j !== b.i) { if (s < 0) { if (H[j] > ext) ext = H[j]; } else if (L[j] < ext) ext = L[j]; }
        if (s < 0 ? ext > hi : ext < lo) continue;
        // Les creux (sommets) entre eux, mèche de la bougie du pivot du milieu comprise (comme on la trace).
        const c1 = oppose(H, L, a.i, b.i + 1, s), c2 = oppose(H, L, b.i - 1, c.i, s);
        if (c1.i < 0 || c2.i < 0) continue;
        const cou = s < 0 ? (c1.p <= c2.p ? c1 : c2) : (c1.p >= c2.p ? c1 : c2);
        const E = s < 0 ? hi : lo, h = Math.abs(E - cou.p);
        if (h < P.hauteurMinAtr * atr) continue;
        if (Math.min(Math.abs(E - c1.p), Math.abs(E - c2.p)) < P.tripleCreux * h) continue;
        return { type: s < 0 ? 'triple_sommet' : 'triple_creux', famille: 'extremes', sens: s, a: { i: a.i, p: a.p }, b: { i: b.i, p: b.p }, c: { i: c.i, p: c.p },
          c1, c2, cou: { i: cou.i, p: cou.p }, niveau: cou.p, extreme: E, hauteur: h, objectif: cou.p + s * h, invalidation: E, debut: a.i, depart: c.i + 1, t, tol };
      }
    }
    return null;
  }
  // ── Épaule-tête-épaule (s = −1) et inversé (s = +1) ──
  function ete(hauts, bas, H, L, C, t, atr, P, s) {
    const piv = s < 0 ? hauts : bas, Q = P.ete;
    const D = piv[piv.length - 1];
    if (!D || D.c !== t) return null;
    const ecartP = (x, y) => (s < 0 ? x - y : y - x);           // de combien x dépasse y (vers l'extrême)
    for (let mT = piv.length - 2; mT >= 1; mT--) {
      const T = piv[mT];
      if (D.i - T.i > Q.max) break;
      if (ecartP(T.p, D.p) < Q.teteAtr * atr) continue;
      for (let mG = mT - 1; mG >= 0; mG--) {
        const G = piv[mG];
        if (D.i - G.i > Q.max) break;
        if (D.i - G.i < Q.min) continue;
        if (ecartP(T.p, G.p) < Q.teteAtr * atr) continue;
        if (Math.abs(G.p - D.p) > Q.epaulesAtr * atr) continue;
        const r = (T.i - G.i) / (D.i - T.i);
        if (r > Q.symetrie || r < 1 / Q.symetrie) continue;
        // La tête est l'extrême strict de [G, D].
        let ok = true;
        for (let j = G.i; j <= D.i; j++) if (j !== T.i && (s < 0 ? H[j] >= T.p : L[j] <= T.p)) { ok = false; break; }
        if (!ok) continue;
        const N1 = oppose(H, L, G.i, T.i, s), N2 = oppose(H, L, T.i, D.i, s);
        if (N1.i < 0 || N2.i < 0) continue;
        // Des jambes d'au moins jambeMin bougies (pas une épaule au fond d'une chute verticale).
        if (Math.min(N1.i - G.i, T.i - N1.i, N2.i - T.i, D.i - N2.i) < Q.jambeMin) continue;
        const pente = (N2.p - N1.p) / (N2.i - N1.i), couL = { a: N1.p - pente * N1.i, b: pente };
        const h = ecartP(T.p, ligne(couL, T.i));
        if (h < P.hauteurMinAtr * atr) continue;
        if (Math.abs(N2.p - N1.p) > Q.couPente * h) continue;
        if (ecartP(G.p, ligne(couL, G.i)) < Q.epauleCouMin * h || ecartP(D.p, ligne(couL, D.i)) < Q.epauleCouMin * h) continue;
        if (Math.abs(G.p - D.p) > Q.epaulesH * h) continue;
        if (ecartP(T.p, s < 0 ? Math.max(G.p, D.p) : Math.min(G.p, D.p)) < Q.teteH * h) continue;
        // L'épaule gauche domine son côté ; une tendance d'avant : le prix venait d'au-delà de la
        // ligne de cou prolongée, d'au moins tendanceH × h.
        const avant = Math.max(0, G.i - (T.i - G.i));
        let domine = true;
        for (let j = avant; j < G.i; j++) if (s < 0 ? H[j] > G.p : L[j] < G.p) { domine = false; break; }
        if (!domine) continue;
        let venu = 0;
        for (let j = Math.max(0, G.i - (D.i - G.i)); j < G.i; j++) venu = Math.max(venu, s < 0 ? ligne(couL, j) - L[j] : H[j] - ligne(couL, j));
        if (venu < Q.tendanceH * h) continue;
        // Aucune clôture déjà au-delà de la ligne de cou entre N2 et t.
        let casse = false;
        for (let j = N2.i + 1; j <= t; j++) if (s < 0 ? C[j] < ligne(couL, j) : C[j] > ligne(couL, j)) { casse = true; break; }
        if (casse) continue;
        return { type: s < 0 ? 'ete' : 'ete_inverse', famille: 'ete', sens: s, G: { i: G.i, p: G.p }, T: { i: T.i, p: T.p }, D: { i: D.i, p: D.p }, N1, N2, couL,
          hauteur: h, extreme: T.p, debut: G.i, depart: D.i + 1, t, tol: P.tolAtr * atr };
      }
    }
    return null;
  }
  // ── Deux droites : triangles, biseaux, canaux ──
  /** Le type d'une paire de droites sur [x0, t], ou null. Un côté « plat » doit se voir plat :
   *  moins de platAtr ATR ET moins de platW0 fois la largeur à l'ouverture ; entre plat et pente,
   *  une zone morte (rien). Pentes en ATR sur la durée de la figure. */
  function classer(rh, rb, x0, t, atr, P) {
    const Q = P.lignes, span = t - x0, dh = rh.b * span / atr, db = rb.b * span / atr;
    const w0 = ligne(rh, x0) - ligne(rb, x0), wt = ligne(rh, t) - ligne(rb, t);
    if (!(w0 > 0 && wt > 0)) return null;
    const conv = 1 - wt / w0, plat = Q.platAtr, pr = Q.platW0 * w0 / atr;
    const estPlat = d => Math.abs(d) <= plat && Math.abs(d) <= pr;
    if (conv >= P.triConvergence) {
      if (estPlat(dh) && db > plat) return 'triangle_ascendant';
      if (estPlat(db) && dh < -plat) return 'triangle_descendant';
      if (dh < -plat && db > plat) return 'triangle_symetrique';
    }
    if (conv >= Q.biseauConvergence) {
      if (dh > plat && db > plat) return 'biseau_montant';
      if (dh < -plat && db < -plat) return 'biseau_descendant';
    }
    if (Math.abs(conv) <= Q.paralleleMax && Math.abs(dh) >= Q.penteCanalAtr && Math.abs(db) >= Q.penteCanalAtr && dh * db > 0) return dh > 0 ? 'canal_montant' : 'canal_descendant';
    return null;
  }
  const COMBOS_DROITES = [[4, 4], [4, 3], [3, 4], [3, 3], [3, 2], [2, 3]];
  function deuxDroites(hauts, bas, H, L, C, t, atr, P) {
    const Q = P.lignes, tol = Q.tolAtr * atr;
    for (const [qh, qb] of COMBOS_DROITES) {
      const nH = hauts.length, nB = bas.length;
      if (nH < qh || nB < qb) continue;
      // Les bornes d'abord (sans copier les listes) : la plupart des essais s'arrêtent là.
      const h0 = hauts[nH - qh].i, b0 = bas[nB - qb].i, x0 = Math.min(h0, b0), x1 = Math.max(h0, b0);
      if (t - x0 > Q.fenetre || t - x0 < Q.min) continue;
      if (x1 >= Math.min(hauts[nH - 1].i, bas[nB - 1].i)) continue;      // les deux côtés se chevauchent
      const hs = hauts.slice(-qh), bs = bas.slice(-qb);
      let rh = regression(hs), rb = regression(bs);
      const type = classer(rh, rb, x0, t, atr, P);
      if (!type) continue;
      if (type.startsWith('canal')) { const r = regressionParallele(hs, bs); rh = r.h; rb = r.b; }
      if (hs.some(x => Math.abs(x.p - ligne(rh, x.i)) > tol) || bs.some(x => Math.abs(x.p - ligne(rb, x.i)) > tol)) continue;
      // Chaque droite couvre au moins `etalement` de la figure (deux pivots serrés ne font pas une droite).
      const span = t - x0;
      if (hs[qh - 1].i - hs[0].i < Q.etalement * span || bs[qb - 1].i - bs[0].i < Q.etalement * span) continue;
      let dehors = false;
      for (let j = x0; j <= t; j++) if (C[j] > ligne(rh, j) + tol || C[j] < ligne(rb, j) - tol) { dehors = true; break; }
      if (dehors) continue;
      const w0 = ligne(rh, x0) - ligne(rb, x0);
      if (w0 < P.hauteurMinAtr * atr) continue;
      // La figure se voit dès son début : la 1re droite d'en face commence tôt (decalage × durée au
      // plus après le début), et le prix occupe la bande au début (sur le premier quart, ses plus haut
      // et plus bas couvrent au moins `remplissage` de la largeur) : pas un V ni une jambe d'entrée
      // qui traverse la bande, avec une droite encore sans point.
      if (fini(Q.decalage) && x1 - x0 > Q.decalage * span) continue;
      if (fini(Q.remplissage)) {
        const z = x0 + Math.max(2, Math.round(span / 4));
        let hi = -Infinity, lo = Infinity;
        for (let j = x0; j <= z; j++) { if (H[j] > hi) hi = H[j]; if (L[j] < lo) lo = L[j]; }
        if ((Math.min(hi, ligne(rh, x0)) - Math.max(lo, ligne(rb, x0))) / w0 < Q.remplissage) continue;
      }
      if (type.startsWith('canal') && (w0 > Q.canalLargeurMaxAtr * atr || t - x0 < Q.canalMin)) continue;
      const apex = type.startsWith('triangle') || type.startsWith('biseau') ? pointe(rh, rb) : Infinity;
      // Repérée trop près de sa pointe : la figure est déjà finie, rien à suivre.
      if (isFinite(apex) && (t - x0) / (apex - x0) > Q.avancementMax) continue;
      return { type, famille: 'lignes', hautL: { a: rh.a, b: rh.b }, basL: { a: rb.a, b: rb.b }, hauteur: w0, debut: x0, apex, depart: t + 1, t, tol,
        pivotsH: hs.map(x => ({ i: x.i, p: x.p })), pivotsB: bs.map(x => ({ i: x.i, p: x.p })) };
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
    return { type: 'range', famille: 'lignes', haut: U, bas: D, hautL: { a: U, b: 0 }, basL: { a: D, b: 0 }, hauteur: h, debut, apex: Infinity, depart: t + 1, t, tol,
      touches: [th.length, tb.length], pivotsH: th.map(x => ({ i: x.i, p: x.p })).reverse(), pivotsB: tb.map(x => ({ i: x.i, p: x.p })).reverse() };
  }
  // ── Drapeau et fanion : un mât, puis une pause courte ──
  function drapeau(hauts, bas, H, L, C, t, atr, P, s, matUtilise) {
    const Q = P.drapeau, piv = s > 0 ? hauts : bas, tol = P.lignes.tolAtr * atr;
    for (let m = piv.length - 1; m >= 0; m--) {
      const e = piv[m];
      if (t - e.i > Q.pauseMax) break;
      if (t - e.i < Q.pauseMin) continue;
      // Pied du mât : l'extrême opposé dans les matMax bougies avant e.
      let p0 = s > 0 ? Infinity : -Infinity, i0 = -1;
      for (let j = Math.max(0, e.i - Q.matMax); j < e.i; j++) { const x = s > 0 ? L[j] : H[j]; if (s > 0 ? x < p0 : x > p0) { p0 = x; i0 = j; } }
      if (i0 < 0 || e.i - i0 < Q.matMin) continue;
      if (matUtilise && matUtilise(i0, e.i)) continue;
      const mat = Math.abs(e.p - p0);
      if (mat < Q.matAtr * atr) continue;
      // La pause : pas de nouvel extrême, recul ≤ retrait × mât.
      let ok = true, ext = s > 0 ? Infinity : -Infinity;
      for (let j = e.i + 1; j <= t; j++) {
        if (s > 0 ? H[j] > e.p : L[j] < e.p) { ok = false; break; }
        const x = s > 0 ? L[j] : H[j]; if (s > 0 ? x < ext : x > ext) ext = x;
      }
      if (!ok || Math.abs(e.p - ext) > Q.retrait * mat) continue;
      const hs = hauts.filter(x => x.i >= e.i && x.i <= t), bs = bas.filter(x => x.i >= e.i && x.i <= t);
      const sideM = s > 0 ? hs : bs, sideO = s > 0 ? bs.filter(x => x.i > e.i) : hs.filter(x => x.i > e.i);
      if (sideM.length < 2 || sideO.length < 1) continue;
      let rh, rb;
      if (sideO.length === 1) {
        const r = regression(sideM), o = sideO[0];
        if (s > 0) { rh = r; rb = { a: o.p - r.b * o.i, b: r.b }; } else { rb = r; rh = { a: o.p - r.b * o.i, b: r.b }; }
      } else { rh = regression(s > 0 ? sideM : sideO); rb = regression(s > 0 ? sideO : sideM); }
      const ph = s > 0 ? sideM : sideO, pb = s > 0 ? sideO : sideM;
      if (ph.some(x => Math.abs(x.p - ligne(rh, x.i)) > tol) || pb.some(x => Math.abs(x.p - ligne(rb, x.i)) > tol)) continue;
      const span = t - e.i, w0 = ligne(rh, e.i) - ligne(rb, e.i), wt = ligne(rh, t) - ligne(rb, t);
      if (!(w0 > 0 && wt > 0) || w0 > Q.largeur * mat) continue;
      // La pause ne progresse pas de plus de pente × mât dans le sens du mât.
      if (s * (rh.b + rb.b) / 2 * span > Q.pente * mat) continue;
      const conv = 1 - wt / w0;
      const type = conv >= P.triConvergence ? 'fanion' : conv >= -Q.paralleleMax ? 'drapeau' : null;
      if (!type) continue;
      let dehors = false;
      for (let j = e.i + 1; j <= t; j++) if (C[j] > ligne(rh, j) + tol || C[j] < ligne(rb, j) - tol) { dehors = true; break; }
      if (dehors) continue;
      const apex = type === 'fanion' ? pointe(rh, rb) : Infinity;
      return { type, famille: 'drapeau', sens: s, mat: { i0, p0, i1: e.i, p1: e.p, h: mat }, hautL: { a: rh.a, b: rh.b }, basL: { a: rb.a, b: rb.b }, hauteur: mat, debut: i0, debutPause: e.i, apex,
        extremePause: ext, depart: t + 1, t, tol, pivotsH: ph.map(x => ({ i: x.i, p: x.p })), pivotsB: pb.map(x => ({ i: x.i, p: x.p })) };
    }
    return null;
  }

  /** Bornes d'une figure à deux droites à la bougie j. */
  function bornes(f, j) { return f.type === 'range' ? { u: f.haut, d: f.bas } : { u: ligne(f.hautL, j), d: ligne(f.basL, j) }; }
  /** La bande de sortie d'une figure (± bandeAtr × ATR à sa naissance) ; le rectangle sort à ses
   *  extrêmes mêmes (ses bornes sont déjà les plus haut et plus bas de la figure). */
  const bandeSortie = f => (f.type === 'range' ? 0 : fini(f.bande) ? f.bande : 0);
  const bandeRetour = f => (f.type === 'range' ? f.tol : fini(f.bande) ? f.bande : f.tol || 0);
  /** LES NIVEAUX d'une figure à la bougie j : ceux qu'applique la machine (avancer), que lit le
   *  calque (figureVivante) et que disent les textes. Aucun texte ne recalcule un niveau.
   *  → { sorties: [{ s, ligne, seuil }] (au-delà : clôture > seuil si s > 0, < seuil si s < 0),
   *      invals: [{ s, p, raison, clotures }] (une clôture au-delà de p dans le sens s fait tomber
   *      la figure ; clotures = 2 : il en faut deux de suite), objectifs: [{ s, p }],
   *      pointe (indice, ou Infinity), confirme } */
  function niveauxFigure(f, j, P) {
    const fam = famille(f), out = { sorties: [], invals: [], objectifs: [], pointe: fini(f.apex) ? f.apex : Infinity, confirme: f.phase === 'confirme' };
    if (out.confirme) {
      out.invals.push({ s: -f.sens, p: f.invalidation, raison: fam === 'lignes' ? 'milieu' : fam === 'ete' ? 'epaule' : fam === 'drapeau' ? 'pause' : 'extreme', clotures: 1 });
      out.objectifs.push({ s: f.sens, p: f.objectif });
      return out;
    }
    const b = bandeSortie(f);
    if (fam === 'extremes' || fam === 'ete') {
      const s = f.sens, N = fam === 'ete' ? ligne(f.couL, j) : f.niveau;
      out.sorties.push({ s, ligne: N, seuil: N + s * b });
      out.invals.push({ s: -s, p: fam === 'ete' ? f.T.p : f.extreme, raison: fam === 'ete' ? 'tete' : 'extreme', clotures: 1 });
      const base = f.demi && fam === 'ete' && fini(f.jDemi) ? ligne(f.couL, f.jDemi) : N;
      out.objectifs.push({ s, p: base + s * f.hauteur });
    } else if (fam === 'drapeau') {
      const s = f.sens, { u, d } = bornes(f, j), N = s > 0 ? u : d, O = s > 0 ? d : u;
      out.sorties.push({ s, ligne: N, seuil: N + s * b });
      out.invals.push({ s: -s, p: f.mat.p1 - s * P.drapeau.retrait * f.mat.h, raison: 'recul', clotures: 1 });
      out.invals.push({ s: -s, p: O - s * b, raison: 'sortie_contraire', clotures: 2, ligne: O });
      const base = f.demi && fini(f.jDemi) ? (s > 0 ? bornes(f, f.jDemi).u : bornes(f, f.jDemi).d) : N;
      out.objectifs.push({ s, p: base + s * f.hauteur });
    } else {
      const { u, d } = bornes(f, j);
      const cotes = [{ s: 1, ligne: u, seuil: u + b }, { s: -1, ligne: d, seuil: d - b }];
      // La sortie déjà commencée d'abord (son côté est celui qu'on suit).
      if (f.demi && f.demiSens < 0) cotes.reverse();
      out.sorties = cotes;
      for (const c of cotes) {
        const base = f.demi && f.demiSens === c.s && fini(f.jDemi) ? (c.s > 0 ? bornes(f, f.jDemi).u : bornes(f, f.jDemi).d) : c.ligne;
        out.objectifs.push({ s: c.s, p: base + c.s * f.hauteur });
      }
    }
    return out;
  }
  const auDela = (c, s, seuil) => (s > 0 ? c > seuil : c < seuil);
  const noter = (f, j, quoi, x) => { (f.journal = f.journal || []).push(Object.assign({ j, quoi }, x || {})); };
  /** Fait vivre une figure d'UNE bougie close (j) : sa machine d'état, sans regarder plus loin.
   *  Objectif et invalidation se jugent sur la MÊME base : la clôture. */
  function avancer(f, j, S, P) {
    const C = S.c, H = S.h, L = S.l, A = S.atr, c = C[j], fam = famille(f);
    const fin = (cle, raison, x) => { f.fin = cle; f.jFin = j; f.raison = raison || null; noter(f, j, cle, Object.assign({ raison: raison || null, c }, x || {})); };
    if (f.phase === 'confirme') {
      // Une ébauche confirmée attend son point : la figure née de lui rejoue la suite (objectif, invalidation).
      if (j <= f.jConf || f.ebauche) return;
      const s = f.sens;
      if (s > 0 ? c < f.invalidation : c > f.invalidation) fin('invalide', fam === 'lignes' ? 'milieu' : fam === 'ete' ? 'epaule' : fam === 'drapeau' ? 'pause' : 'extreme', { p: f.invalidation });
      else if (s > 0 ? c >= f.objectif : c <= f.objectif) fin('atteint', null, { p: f.objectif });
      else if (j - f.jConf >= P.horizon) fin('expire', 'horizon');
      return;
    }
    if (j >= f.apex) { fin('expire_avant', 'pointe'); return; }
    if (fam === 'drapeau' && j - f.debutPause > P.drapeau.pauseMax + 10) { fin('expire_avant', 'delai'); return; }
    // Drapeau : l'extrême de la pause suit le recul jusqu'à la 1re clôture de sortie.
    if (fam === 'drapeau' && !f.demi) f.extremePause = f.sens > 0 ? Math.min(f.extremePause, L[j]) : Math.max(f.extremePause, H[j]);
    const N = niveauxFigure(f, j, P);
    for (const iv of N.invals) {
      // Une ébauche : l'extrême et la tête sont l'affaire de son point en attente (abandon, recalage).
      if (f.ebauche && (iv.raison === 'extreme' || iv.raison === 'tete')) continue;
      if (!auDela(c, iv.s, iv.p)) { if (iv.clotures === 2) f.contre = 0; continue; }
      if (iv.clotures === 2) { f.contre = (f.contre || 0) + 1; if (f.contre < 2) continue; }
      fin('invalide_avant', iv.raison, { p: iv.p });
      return;
    }
    const noterDistances = () => { const a = A && A[j]; if (fini(a) && a > 0) { f.dObj = Math.abs(f.objectif - c) / a; f.dInv = Math.abs(f.invalidation - c) / a; } };
    const dehors = N.sorties.find(x => auDela(c, x.s, x.seuil));
    if (dehors) {
      if (f.demi && f.demiSens === dehors.s) {
        const s = dehors.s, br = bandeRetour(f);
        // Le retour : une clôture revenue dans la bande pendant la sortie, ou la mèche de CETTE bougie.
        const touche = s > 0 ? L[j] <= dehors.ligne + br : H[j] >= dehors.ligne - br;
        f.retest = !!f.enRetour || touche;
        f.phase = 'confirme'; f.jConf = j; f.demi = false; f.sens = s;
        if (fam === 'extremes') { f.invalidation = f.extreme; }
        else if (fam === 'ete') { f.niveau = ligne(f.couL, f.jDemi); f.objectif = f.niveau + s * f.hauteur; f.invalidation = f.D.p; }
        else if (fam === 'drapeau') { const b0 = bornes(f, f.jDemi); f.niveau = s > 0 ? b0.u : b0.d; f.objectif = f.niveau + s * f.hauteur; f.invalidation = f.extremePause; }
        else { const b0 = bornes(f, f.jDemi); f.niveau = s > 0 ? b0.u : b0.d; f.objectif = f.niveau + s * f.hauteur; f.invalidation = (b0.u + b0.d) / 2; }
        noterDistances();
        noter(f, j, 'confirme', { s, retest: f.retest, c });
      } else {
        f.demi = true; f.demiSens = dehors.s; f.jDemi = j; f.enRetour = false; f.nRetour = 0;
        noter(f, j, 'demi', { s: dehors.s, c, seuil: dehors.seuil });
      }
    } else if (f.demi) {
      const x = N.sorties.find(y => y.s === f.demiSens), br = bandeRetour(f);
      const dansBande = x && (f.demiSens > 0 ? c >= x.ligne - br : c <= x.ligne + br);
      if (dansBande && (f.nRetour || 0) < P.retourMax) { f.nRetour = (f.nRetour || 0) + 1; f.enRetour = true; noter(f, j, 'retour', { c }); }
      else { f.demi = false; f.enRetour = false; f.nRetour = 0; noter(f, j, 'sortie_annulee', { c }); }
    }
    if (f.phase !== 'confirme' && j - (f.tMaj || f.t) > P.expiration) fin('expire_avant', 'delai');
  }
  /** Recalage d'une figure à deux droites vivante (ni confirmée ni « à confirmer ») : un pivot
   *  nouveau à moins de la tolérance d'une droite y est ajouté ; les droites sont refaites, le
   *  type doit rester le même, et chaque pivot à moins de la tolérance. Le début ne bouge pas. */
  function recaler(f, hauts, bas, t, atr, P, nh, nb) {
    if (famille(f) !== 'lignes' || f.type === 'range' || f.phase === 'confirme' || f.demi) return false;
    const tol = P.lignes.tolAtr * atr;
    let hs = f.pivotsH, bs = f.pivotsB, cote = null;
    if (nh) { const x = hauts[hauts.length - 1]; if (x.i > hs[hs.length - 1].i && Math.abs(x.p - ligne(f.hautL, x.i)) <= tol) { hs = hs.concat([{ i: x.i, p: x.p }]).slice(-6); cote = 'haut'; } }
    if (nb) { const x = bas[bas.length - 1]; if (x.i > bs[bs.length - 1].i && Math.abs(x.p - ligne(f.basL, x.i)) <= tol) { bs = bs.concat([{ i: x.i, p: x.p }]).slice(-6); cote = cote ? 'deux' : 'bas'; } }
    if (!cote) return false;
    let rh = regression(hs), rb = regression(bs);
    if (classer(rh, rb, f.debut, t, atr, P) !== f.type) return false;
    if (f.type.startsWith('canal')) { const r = regressionParallele(hs, bs); rh = r.h; rb = r.b; }
    if (hs.some(x => Math.abs(x.p - ligne(rh, x.i)) > tol) || bs.some(x => Math.abs(x.p - ligne(rb, x.i)) > tol)) return false;
    const avant = bornes(f, t);
    f.hautL = { a: rh.a, b: rh.b }; f.basL = { a: rb.a, b: rb.b }; f.pivotsH = hs; f.pivotsB = bs;
    f.hauteur = ligne(rh, f.debut) - ligne(rb, f.debut); f.tMaj = t; f.dernier = t - P.pivot;
    f.apex = f.type.startsWith('triangle') || f.type.startsWith('biseau') ? pointe(rh, rb) : Infinity;
    const apres = bornes(f, t);
    noter(f, t, 'recalage', { cote, avant: [avant.u, avant.d], apres: [apres.u, apres.d] });
    return true;
  }
  const groupeDetect = f => (f.type === 'range' ? 'range' : famille(f) === 'lignes' ? 'lignes' : famille(f) === 'drapeau' ? 'drapeau' : f.type);
  /** Les figures que les règles trouvent à t, avec les pivots connus à t. */
  function candidats(hauts, bas, H, L, C, t, at, P, actives, nh, nb, matUtilise) {
    const tol = P.tolAtr * at, out = [];
    if (nh) { const f = doubleExtreme(hauts, H, L, t, tol, at, P, -1); if (f) out.push(f); }
    if (nb) { const f = doubleExtreme(bas, H, L, t, tol, at, P, 1); if (f) out.push(f); }
    if (nh) { const f = tripleExtreme(hauts, H, L, t, tol, at, P, -1); if (f) out.push(f); }
    if (nb) { const f = tripleExtreme(bas, H, L, t, tol, at, P, 1); if (f) out.push(f); }
    if (nh) { const f = ete(hauts, bas, H, L, C, t, at, P, -1); if (f) out.push(f); }
    if (nb) { const f = ete(hauts, bas, H, L, C, t, at, P, 1); if (f) out.push(f); }
    const enCours = g => actives.some(f => groupeDetect(f) === g && f.phase !== 'confirme');
    if (!enCours('range')) { const f = range(hauts, bas, H, L, t, tol, at, P); if (f) out.push(f); }
    if (!enCours('lignes')) { const f = deuxDroites(hauts, bas, H, L, C, t, at, P); if (f) out.push(f); }
    if (!enCours('drapeau')) for (const s of [1, -1]) { const f = drapeau(hauts, bas, H, L, C, t, at, P, s, matUtilise); if (f) { out.push(f); break; } }
    return out;
  }
  /** L'identité d'une figure ou d'une ébauche : son type et son ancre. */
  const cleFigure = f => { const m = famille(f); return f.type + '|' + (m === 'extremes' ? f.a.i : m === 'ete' ? f.G.i + ',' + f.T.i : m === 'drapeau' ? f.mat.i1 : f.debut); };
  /** Le niveau (prix extrême du pivot en attente) au-delà duquel une ébauche est abandonnée, pour
   *  un double ou un triple : min(autres sommets) + tol, figé à sa naissance (pour un creux :
   *  max(autres creux) − tol) ; pour une tête-épaules : la tête (l'épaule droite ne la dépasse pas).
   *  Pour les autres familles : null (la bulle dit la règle en mots). Il se juge sur le plus haut
   *  (le plus bas) des bougies — c'est lui qui fait le point en attente —, pas sur la clôture. */
  function niveauAbandon(e) {
    if (famille(e) === 'ete') return e.T ? e.T.p : null;
    if (famille(e) !== 'extremes') return null;
    const autres = estTriple(e) ? [e.a, e.b] : [e.a];
    return e.sens < 0 ? Math.min(...autres.map(x => x.p)) + e.tol : Math.max(...autres.map(x => x.p)) - e.tol;
  }
  /** Rejoue la détection sur les n bougies CLOSES de S = { h, l, c, atr, n } (et t : les heures,
   *  facultatives). Une figure dont la sortie était DÉJÀ confirmée (ou l'issue déjà connue) à sa
   *  naissance n'est pas comptée : elle n'était repérable qu'après coup.
   *  `avant` (facultatif) : le résultat d'un appel précédent sur le MÊME début d'historique. Le
   *  rejeu reprend alors là où il s'était arrêté (chaque pas ne lit que les bougies closes jusqu'à
   *  lui : le résultat est le même qu'un rejeu complet) ; si les bougies déjà lues ont changé (une
   *  empreinte au début et à la dernière bougie lue), ou si les réglages ne sont plus les mêmes,
   *  tout est rejoué. Les figures de `avant` continuent de vivre dans le nouveau résultat.
   *  → { formes, ebauches: { liste, actuelles }, bilan, n } */
  const COTES = [1, -1];
  const empreinte = (S, j) => (j < 0 ? null : [S.h[j], S.l[j], S.c[j], S.atr[j]].join('|'));
  function detecter(S, P, avant) {
    const H = S.h, L = S.l, C = S.c, A = S.atr, n = S.n, k = P.pivot;
    const piv = pivots(H, L, k, n);
    let X = avant && avant._etat;
    if (!(X && X.P === P && X.t <= n && X.e0 === empreinte(S, 0) && X.eF === empreinte(S, X.t - 1))) {
      X = { P, t: 0, ih: 0, ib: 0, formes: [], actives: [], hauts: [], bas: [], liste: [], vivantes: [], mats: [], cles: new Set(),
        cotes: { 1: { pend: null, cree: null }, '-1': { pend: null, cree: null } } };
    }
    const { formes, actives, hauts, bas, liste, vivantes, cotes, mats, cles } = X;
    const matUtilise = (i0, i1) => mats.some(m => m.i0 === i0 || m.i1 === i1);
    // L'identité ne bouge pas avec un recalage (ancre, épaule et tête, mât, début) : un ensemble.
    const cleExiste = cle => cles.has(cle);
    // Les pivots connus plus le point en attente, sans copier la liste (lue seulement).
    const avecPend = (s, pend, fn) => { const l = s > 0 ? hauts : bas; l.push(pend); try { return fn(); } finally { l.pop(); } };
    // Une ébauche suit la MÊME règle de sortie que la figure, à chaque clôture (sortie 1/2, puis
    // confirmée) : la figure qui naîtra de son point fera de même. Une issue qui ferait tomber la
    // figure (recul, sortie contraire, pointe, délai) annule l'ébauche (finFig dit laquelle).
    const avancerEbauche = (e, j) => { avancer(e, j, S, P); if (e.fin) { e.finFig = e.fin; e.fin = 'abandon'; } };
    const rejouerEbauche = (e, t) => {
      Object.assign(e, { phase: 'ebauche', demi: false, demiSens: null, jDemi: null, enRetour: false, nRetour: 0, jConf: null, retest: false, contre: 0, finFig: null });
      if (famille(e) !== 'extremes') { delete e.niveau; delete e.objectif; delete e.invalidation; }
      delete e.dObj; delete e.dInv;
      e.journal = (e.journal || []).filter(x => x.quoi === 'ebauche' || x.quoi === 'suivi');
      for (let j = e.depart; j <= t && !e.fin; j++) avancerEbauche(e, j);
    };
    // Une figure à deux droites (ou un rectangle) trouvée sur les mêmes pivots (la moitié au moins, et
    // au moins deux ; ou le même début) qu'une figure de son groupe ENCORE VIVANTE : la même figure vue une 2e fois (après
    // sa confirmation, la détection de son groupe reprend), pas un cas de plus. Une figure tombée
    // laisse ses pivots libres : une autre lecture peut naître d'eux.
    const pivIdx = f => (f.pivotsH || []).map(x => 'h' + x.i).concat((f.pivotsB || []).map(x => 'b' + x.i));
    const dejaTrouvee = (f, t) => {
      if (famille(f) !== 'lignes') return false;
      const gr = groupeDetect(f), mien = pivIdx(f), lim = t - Math.max(P.lignes.fenetre, P.rangeFenetre) - k;
      for (let m = formes.length - 1; m >= 0 && formes[m].t >= lim; m--) {
        const g = formes[m];
        if (g.doublon || groupeDetect(g) !== gr || (g.fin && g.jFin < t)) continue;
        const sien = pivIdx(g), communs = sien.filter(x => mien.includes(x)).length;
        if (g.debut === f.debut || (communs >= 2 && 2 * communs >= Math.min(sien.length, mien.length))) return true;
      }
      return false;
    };
    /** Une figure candidate à t : refusée (même mouvement qu'une figure vivante, déjà trouvée, ou
     *  sortie déjà confirmée à sa naissance sans ébauche vue avant), ou née (rejouée depuis son
     *  départ). → true si elle est née. */
    const accueillir = (f, t, at, triples) => {
      // Un double qui partage un pivot avec un double du même type encore vivant, ou né en même
      // temps qu'un triple sur les mêmes sommets : le MÊME mouvement, pas un cas de plus.
      if (estDouble(f) && actives.some(g => g.type === f.type && (g.a.i === f.a.i || g.b.i === f.a.i))) return false;
      if (estDouble(f) && triples.some(g => g.sens === f.sens && [g.a.i, g.b.i, g.c.i].includes(f.a.i) && [g.b.i, g.c.i].includes(f.b.i))) return false;
      if (estTriple(f) && actives.some(g => g.type === f.type && g.a.i === f.a.i)) return false;
      // Tête-épaules : même épaule gauche et même tête qu'une figure vivante = la même, recalée.
      if (famille(f) === 'ete') {
        const g = actives.find(x => x.type === f.type && x.G.i === f.G.i && x.T.i === f.T.i && x.phase !== 'confirme' && !x.demi);
        if (g) { Object.assign(g, { D: f.D, N2: f.N2, couL: f.couL, hauteur: f.hauteur, tMaj: t, dernier: f.D.i }); noter(g, t, 'recalage', { cote: 'epaule' }); return false; }
        if (formes.some(x => x.type === f.type && x.G.i === f.G.i && x.T.i === f.T.i)) return false;
      }
      if (dejaTrouvee(f, t)) return false;
      Object.assign(f, { phase: 'formation', demi: false, fin: null, jFin: null, jConf: null, journal: [], dernier: t - k, bande: P.bandeAtr * at, nRetour: 0, enRetour: false, atrN: at });
      // Le double vivant sur les mêmes sommets devient ce triple : un recalage, pas un ✗.
      const dbls = estTriple(f) ? actives.filter(g => g.type === 'double_' + f.type.slice(7) && g.phase !== 'confirme' && !g.fin && [f.a.i, f.b.i].includes(g.a.i)) : [];
      if (dbls.length) f.depuisDouble = dbls[dbls.length - 1];
      noter(f, t, 'repere', f.depuisDouble ? { triple: true } : null);
      // L'ébauche vivante de même identité dont le point en attente est confirmé à cette clôture :
      // elle était à l'écran, sa sortie a été vue en direct ; la figure garde sa bande et naît
      // même si sa sortie est déjà confirmée (ou son issue déjà connue).
      const eb = vivantes.find(x => !x.fin && x.pend && x.pend.i + k === t && x.cle === cleFigure(f));
      if (eb) f.bande = eb.bande;
      for (let j = f.depart; j <= t && !f.fin; j++) avancer(f, j, S, P);
      if ((f.fin || f.phase === 'confirme') && !eb) { delete f.depuisDouble; return false; }
      if (eb && (f.fin || f.phase === 'confirme')) { f.depuisEbauche = true; f.t0Ebauche = eb.t0; }
      for (const g of dbls) { g.fin = 'devenu_triple'; g.jFin = t; g.raison = 'triple'; noter(g, t, 'devenu_triple'); }
      if (famille(f) === 'drapeau') mats.push({ i0: f.mat.i0, i1: f.mat.i1 });
      formes.push(f); cles.add(cleFigure(f)); actives.push(f);
      return true;
    };
    let ih = X.ih, ib = X.ib;
    for (let t = X.t; t < n; t++) {
      for (let a = actives.length - 1; a >= 0; a--) {
        avancer(actives[a], t, S, P);
        if (actives[a].fin) actives.splice(a, 1);
      }
      for (const e of vivantes) if (!e.fin && e.t0 < t) avancerEbauche(e, t);
      let nh = false, nb = false;
      while (ih < piv.hauts.length && piv.hauts[ih].c === t) { hauts.push(piv.hauts[ih++]); nh = true; }
      while (ib < piv.bas.length && piv.bas[ib].c === t) { bas.push(piv.bas[ib++]); nb = true; }
      const at = A[t];
      if (!fini(at) || at <= 0) continue;
      const nees = [];
      if (nh || nb) {
        for (const f of actives) recaler(f, hauts, bas, t, at, P, nh, nb);
        const nouvelles = candidats(hauts, bas, H, L, C, t, at, P, actives, nh, nb, matUtilise);
        const triples = nouvelles.filter(estTriple);
        for (const f of nouvelles) if (accueillir(f, t, at, triples)) nees.push(f);
        for (let a = actives.length - 1; a >= 0; a--) if (actives[a].fin) actives.splice(a, 1);
      }
      // ── Ébauches ──
      for (const s of COTES) {
        const cote = cotes[s];
        // Le pivot en attente vient d'être confirmé : l'ébauche devient la figure de même identité,
        // ou s'arrête (« la figure ne tient plus »).
        // (Le point a-t-il vraiment été confirmé ? Sinon un nouvel extrême l'a remplacé : c'est le
        // recalage plus bas qui en décide.)
        const confirmes = s > 0 ? (nh ? hauts : null) : (nb ? bas : null);
        const vientDe = i => !!confirmes && confirmes.length > 0 && confirmes[confirmes.length - 1].i === i;
        for (const e of vivantes) if (!e.fin && e.s === s && e.pend.i + k === t && vientDe(e.pend.i)) {
          let g = nees.find(x => cleFigure(x) === e.cle) || null;
          const triple = !g && estDouble(e) && nees.some(x => estTriple(x) && x.sens === e.sens && [x.b.i, x.c.i].includes(e.b.i));
          // Pas née avec l'ATR du moment : la même figure avec la tolérance figée de l'ébauche (l'ATR
          // a bougé de quelques bougies, pas la figure).
          if (!g && !triple && fini(e.atr0)) {
            const alt = candidats(hauts, bas, H, L, C, t, e.atr0, P, actives, s > 0, s < 0, matUtilise).find(x => cleFigure(x) === e.cle);
            if (alt && accueillir(alt, t, e.atr0, [])) { g = alt; nees.push(alt); }
          }
          if (g) { e.fin = 'devenue'; e.jFin = t; e.devenue = g; }
          else if (triple) { e.fin = 'triple'; e.jFin = t; }
          else { e.fin = 'abandon'; e.jFin = t; e.raison = 'regle'; }     // point acquis, mais la figure ne remplit plus ses règles
        }
        for (let a = actives.length - 1; a >= 0; a--) if (actives[a].fin) actives.splice(a, 1);
        const pend = enAttente(H, L, t, k, s, 0);
        const change = pend && (!cote.pend || pend.i !== cote.pend.i || pend.p !== cote.pend.p);
        if (change) {
          // Un nouvel extrême : chaque ébauche de ce côté est refaite avec lui (sa tolérance figée).
          const memo = new Map();             // une seule recherche par tolérance figée
          const parAtr = a => { if (!memo.has(a)) memo.set(a, avecPend(s, pend, () => candidats(hauts, bas, H, L, C, t, a, P, actives, s > 0, s < 0, matUtilise))); return memo.get(a); };
          for (const e of vivantes) if (!e.fin && e.s === s) {
            const g = parAtr(e.atr0).find(x => cleFigure(x) === e.cle);
            if (g) { Object.assign(e, g, { t: t }); e.pend = pend; e.dernier = pend.i; noter(e, t, 'suivi', { p: pend.p }); rejouerEbauche(e, t); }
            else {
              const lim = niveauAbandon(e);
              e.fin = 'abandon'; e.jFin = t; e.raison = lim !== null && auDela(pend.p, -e.sens, lim) ? 'depasse' : 'forme'; e.pAbandon = pend.p;
            }
          }
        }
        cote.pend = pend;
        // Le point en attente vu à cette clôture (il lui manque `reste` bougies).
        if (pend && !change) for (const e of vivantes) if (!e.fin && e.s === s && e.pend.i === pend.i) e.pend = pend;
        if (pend && t - pend.i >= P.ebaucheDroiteMin && cote.cree !== pend.i + ':' + pend.p) {
          cote.cree = pend.i + ':' + pend.p;
          for (const g of avecPend(s, pend, () => candidats(hauts, bas, H, L, C, t, at, P, actives, s > 0, s < 0, matUtilise))) {
            const cle = cleFigure(g);
            if (vivantes.some(e => !e.fin && e.cle === cle) || cleExiste(cle)) continue;
            if (estDouble(g) && actives.some(x => x.type === g.type && (x.a.i === g.a.i || x.b.i === g.a.i))) continue;
            if (dejaTrouvee(g, t)) continue;
            const e = Object.assign(g, { ebauche: true, phase: 'ebauche', cle, s, pend, pend0: pend.i, t0: t, atr0: at, tol: P.tolAtr * at, bande: P.bandeAtr * at, dernier: pend.i,
              fin: null, jFin: null, devenue: null, demi: false, journal: [{ j: t, quoi: 'ebauche' }] });
            e.abandonP = niveauAbandon(e);
            rejouerEbauche(e, t);
            // Déjà tombée, ou déjà confirmée à sa naissance : rien à suivre (sa sortie n'a pas été vue).
            if (e.fin || e.phase === 'confirme') continue;
            liste.push(e); vivantes.push(e);
          }
        }
      }
      for (let a = vivantes.length - 1; a >= 0; a--) if (vivantes[a].fin) vivantes.splice(a, 1);
    }
    Object.assign(X, { t: n, ih, ib, e0: empreinte(S, 0), eF: empreinte(S, n - 1) });
    // Deux figures du même type confirmées sur la même bougie, même ligne : un seul cas (repassé en
    // entier à chaque appel : une figure plus ancienne garde la priorité, la décision est stable).
    const parConf = new Map();
    for (const f of formes) {
      if (f.jConf === null) continue;
      const q = f.type + '|' + f.jConf, deja = parConf.get(q) || [];
      if (deja.some(g => Math.abs(g.niveau - f.niveau) <= Math.max(g.tol, f.tol))) f.doublon = true;
      else { deja.push(f); parConf.set(q, deja); }
    }
    for (const e of liste) e.abandonP = niveauAbandon(e);
    const res = { formes, ebauches: { liste, actuelles: vivantes.slice() }, bilan: bilan(formes, S, P, liste), n };
    Object.defineProperty(res, '_etat', { value: X });   // non énumérable : pour la reprise seulement
    return res;
  }
  /** Le repère SANS forme d'une figure confirmée : depuis une bougie sur `pas` de tout
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
  /** Intervalle de Wilson à 95 % d'un taux k / n. */
  function wilson(k, n) {
    if (!(n > 0)) return [0, 1];
    const z = 1.96, p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), m = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
    return [(c - m) / d, (c + m) / d];
  }
  /** La comparaison au repère sans forme : 'peu' (moins de echantillonFaible issues), sinon le taux
   *  du repère comparé à l'intervalle de Wilson 95 % du taux de la figure : 'pareil' (dedans),
   *  'moins' (repère au-dessus : la figure atteint sa cible moins souvent), 'plus'. */
  function ecartTemoin(b, P) {
    const finis = b.atteints + b.invalides + b.expires, T = b.temoin || {};
    if (finis < P.echantillonFaible || !(T.departs > 0)) return 'peu';
    const [lo, hi] = wilson(b.atteints, finis), r = T.atteints / T.departs;
    return r < lo ? 'plus' : r > hi ? 'moins' : 'pareil';
  }
  function bilan(formes, S, P, ebauches) {
    const b = {};
    for (const t of TYPES) b[t] = { type: t, formes: 0, confirmes: 0, atteints: 0, invalides: 0, expires: 0, ouverts: 0, invalidesAvant: 0, expiresAvant: 0, devenusTriples: 0,
      haut: 0, bas: 0, temoin: { departs: 0, atteints: 0, invalides: 0, expires: 0 }, ebauches: { n: 0, devenues: 0, confirmees: 0 } };
    const conf = [];
    for (const f of formes) {
      if (f.doublon || !b[f.type]) continue;
      const x = b[f.type];
      x.formes++;
      if (f.fin === 'devenu_triple') { x.devenusTriples++; continue; }
      if (f.fin === 'invalide_avant') x.invalidesAvant++;
      if (f.fin === 'expire_avant') x.expiresAvant++;
      if (f.jConf === null) continue;
      x.confirmes++;
      if (f.sens > 0) x.haut++; else x.bas++;
      if (f.fin === 'atteint') x.atteints++;
      else if (f.fin === 'invalide') x.invalides++;
      else if (f.fin === 'expire') x.expires++;
      else x.ouverts++;
      if (fini(f.dObj) && fini(f.dInv)) conf.push(f);
    }
    // Ébauches : seules celles dont l'issue est connue ; « devenue » si la figure née d'elle est
    // comptée dans le bilan.
    for (const e of ebauches || []) {
      if (!e.fin || e.fin === 'triple' || !b[e.type]) continue;
      const x = b[e.type].ebauches;
      x.n++;
      if (e.fin === 'devenue' && e.devenue && !e.devenue.doublon) { x.devenues++; if (e.devenue.jConf !== null) x.confirmees++; }
    }
    if (S && P && conf.length) {
      const pas = Math.max(1, Math.ceil(conf.length * S.n / P.temoinDeparts));
      for (const f of conf) temoin(f, S, P, pas, b[f.type].temoin);
      for (const t of TYPES) b[t].temoin.pas = pas;
    }
    if (P) for (const t of TYPES) b[t].ecart = ecartTemoin(b[t], P);
    return b;
  }

  // ── Ce que l'écran montre ──
  /** L'état d'une figure à la clôture j, relu dans son journal (sans mémoire à part). */
  function phaseA(f, j) {
    const base = f.ebauche ? 'ebauche' : 'formee';
    let e = base;
    for (const x of f.journal || []) {
      if (x.j > j) break;
      if (x.quoi === 'demi' || x.quoi === 'retour') e = 'demi';
      else if (x.quoi === 'sortie_annulee') e = base;
      else if (x.quoi === 'confirme') e = 'confirme';
    }
    return e;
  }
  /** Le DERNIER point d'une figure (celui dont la confirmation l'a fait naître, ou son pivot en attente). */
  const dernierPoint = (f, P) => (fini(f.dernier) ? f.dernier : f.ebauche && f.pend ? f.pend.i : f.t - P.pivot);
  /** Le nombre de points d'ancrage (départage à rang égal) et des lignes horizontales ? */
  function ancres(f) {
    const fam = famille(f);
    if (fam === 'extremes') return estTriple(f) ? 4 : 3;
    if (fam === 'ete') return 5;
    return (f.pivotsH ? f.pivotsH.length : 2) + (f.pivotsB ? f.pivotsB.length : 2) + (fam === 'drapeau' ? 1 : 0);
  }
  const horizontale = f => famille(f) === 'extremes' || f.type === 'range';
  /** Le rang d'une figure à l'écran (le plus petit d'abord) à la clôture j :
   *  0 à confirmer · 1 confirmée vivante · 2 invalidée ✗ ou cible atteinte (2 premières clôtures)
   *  · 3 formée · 4 ébauche · 5 annulée, sans suite, invalidée plus ancienne · 6 atteinte ancienne. */
  function rangFigure(f, j) {
    if (f.fin && f.jFin <= j) {
      const age = j - f.jFin;
      if (f.fin === 'atteint') return age < 2 ? 2 : age <= 6 ? 5 : 6;
      if (f.fin === 'invalide' || f.fin === 'invalide_avant') return age < 2 ? 2 : 5;
      return 5;
    }
    const p = phaseA(f, j);
    return p === 'demi' ? 0 : p === 'confirme' ? 1 : p === 'ebauche' ? 4 : 3;
  }
  /** Gardée à l'écran après son issue ? (âge en bougies closes depuis jFin) */
  function garde(f, j, P, mode) {
    if (!f.fin || f.jFin > j) return true;
    const age = j - f.jFin;
    if (f.fin === 'atteint') return age <= (mode === 'debutant' ? P.garderInvalide : P.garderFini);
    if (f.fin === 'abandon') return age <= P.garderEbauche;
    if (['invalide', 'invalide_avant', 'expire', 'expire_avant'].includes(f.fin)) return age <= P.garderInvalide;
    return false;
  }
  /** Les candidates à la clôture j (n = j + 1 bougies closes), triées par rang puis départage. */
  function candidatesA(res, P, a, z, mode, j) {
    const eb = res.ebauches || { liste: [] }, deb = mode === 'debutant';
    const dansVue = f => dernierPoint(f, P) >= a && f.debut < z && (!deb || f.debut >= a);
    const C0 = res.formes.filter(f => !f.doublon && f.fin !== 'devenu_triple' && f.t <= j && garde(f, j, P, mode) && dansVue(f));
    // Ébauches vivantes à j, ou annulées depuis peu ; un double est caché par un triple sur ses sommets.
    const ebVue = e => e.t0 <= j && (!e.fin || e.jFin > j || (e.fin === 'abandon' && j - e.jFin <= P.garderEbauche));
    const E0 = (eb.liste || []).filter(e => ebVue(e) && dansVue(e));
    const E1 = E0.filter(e => !(estDouble(e) && E0.some(x => estTriple(x) && x.sens === e.sens && x.pend.i === e.pend.i)));
    return C0.concat(E1).sort((x, y) => rangFigure(x, j) - rangFigure(y, j) || dernierPoint(y, P) - dernierPoint(x, P) || ancres(y) - ancres(x)
      || (horizontale(y) - horizontale(x)) || TYPES.indexOf(x.type) - TYPES.indexOf(y.type));
  }
  function choisir(cands, P, mode, j, res) {
    const out = [], finA = f => (f.fin && f.jFin <= j ? f.jFin : j);
    for (const f of cands) {
      if (out.length >= (mode === 'debutant' ? 1 : P.formesMax)) break;
      if (out.some(g => groupeVue(g) === groupeVue(f) && f.debut <= finA(g) && g.debut <= finA(f))) continue;
      if (out.some(g => dernierPoint(g, P) === dernierPoint(f, P))) continue;
      out.push(f);
    }
    return out;
  }
  /** Les figures à montrer dans la vue [vs, ve) : vivantes (dernier point dans la vue), ébauches,
   *  et finies récemment (une figure qui tombe reste lisible avec sa marque ✗). Rang, puis le
   *  dernier point le plus récent, puis le plus de points d'ancrage, puis les lignes horizontales.
   *  Expert : au plus formesMax, jamais deux d'une même famille d'écran qui se recouvrent, jamais
   *  deux sur le même dernier point. Débutant : la liste ordonnée des figures ENTIÈRES dans la vue
   *  (l'écran prend la première dont le libellé trouve sa place) ; une seule est montrée.
   *  Une figure finie n'est montrée que si elle l'était à la clôture d'avant son issue (même vue,
   *  même mode) : on ne barre que ce qui a été vu. */
  function formesAffichees(res, P, vs, ve, mode) {
    if (!res) return [];
    const n = res.n, j = n - 1, a = fini(vs) ? vs : -Infinity, z = fini(ve) ? ve : Infinity, m = mode === 'debutant' ? 'debutant' : 'expert';
    const cands = candidatesA(res, P, a, z, m, j).filter(f => {
      if (!f.fin || f.jFin > j) return true;
      // Vue à la clôture d'avant son issue : la figure y était-elle montrée ?
      const avant = choisir(candidatesA(res, P, a, z, m, f.jFin - 1), P, m, f.jFin - 1, res);
      return avant.includes(f);
    });
    if (m === 'debutant') return cands;
    return choisir(cands, P, m, j, res);
  }
  /** L'identité d'une figure À L'ÉCRAN : son type et son ancre (une ébauche et la figure née d'elle
   *  ont la même ; un rejeu complet la garde). */
  const idFigure = f => cleFigure(f);
  /** Débutant : la liste ordonnée des figures à essayer (l'écran prend la première dont le libellé
   *  trouve sa place, ou à défaut dessine la première sans libellé), d'après ce que la page a
   *  RÉELLEMENT dessiné aux clôtures d'avant (memo) :
   *   memo = { parJ: Map(clôture → id dessinée ou null), dernier: id dessinée à l'image d'avant }.
   *  - une figure tombée (✗, annulée, sans suite, cible atteinte) n'est montrée que si la page la
   *    dessinait à la clôture d'avant sa chute (on ne barre que ce qui a été vu) ; elle passe en tête
   *    pendant 2 clôtures (la chute se lit) ;
   *  - la figure dessinée reste en tête tant qu'elle vit, même si son début sort de la vue à gauche
   *    (le tracé est coupé au bord) ; une autre ne la remplace que si elle est nettement plus avancée
   *    (sortie à confirmer ou confirmée, contre une figure formée ou une ébauche) ;
   *  - une identité tombée depuis peu (2 × garderEbauche clôtures) ne revient pas comme une figure
   *    vivante (pas de « possible » / « ✗ annulé » / « possible » d'une clôture à l'autre). */
  function formesDebutant(res, P, vs, ve, memo) {
    if (!res) return [];
    const j = res.n - 1, a = fini(vs) ? vs : -Infinity, z = fini(ve) ? ve : Infinity, M = memo || {}, parJ = M.parJ || new Map();
    const vu = f => {
      for (let q = f.jFin - 1; q >= f.jFin - 3; q--) if (parJ.has(q)) return parJ.get(q) === idFigure(f);
      return false;
    };
    const tombe = f => !!f.fin && f.jFin <= j;
    let L = candidatesA(res, P, a, z, 'debutant', j);
    // La figure dessinée à l'image d'avant, même si son début (ou son dernier point) est sorti de la
    // vue : elle garde sa place tant qu'un morceau de son tracé (jusqu'à sa clôture ou sa croix) y est.
    if (M.dernier && !L.some(f => idFigure(f) === M.dernier)) {
      const large = candidatesA(res, P, -Infinity, z, 'expert', j).find(f => idFigure(f) === M.dernier && (tombe(f) ? f.jFin : j) >= a);
      if (large) L = L.concat([large]);
    }
    // Une figure tombée : seulement si elle était dessinée à la clôture d'avant son issue, et tant
    // qu'elle tient sa place (une autre dessinée depuis : elle ne revient pas, barrée).
    L = L.filter(f => !tombe(f) || (vu(f) && (j - f.jFin < 2 || idFigure(f) === M.dernier)));
    // Une identité tombée depuis peu ne revient pas comme une figure vivante.
    const recentes = new Set();
    for (const f of res.formes.concat((res.ebauches && res.ebauches.liste) || [])) if (tombe(f) && f.fin !== 'devenue' && f.fin !== 'triple' && j - f.jFin <= 2 * P.garderEbauche) recentes.add(idFigure(f));
    L = L.filter(f => tombe(f) || !recentes.has(idFigure(f)));
    // Deux objets de même identité (une ébauche tombée et une figure) : le premier rangé seul.
    const ids = new Set();
    L = L.filter(f => { const k = idFigure(f); if (ids.has(k)) return false; ids.add(k); return true; });
    const S = M.dernier ? L.find(f => idFigure(f) === M.dernier) : null;
    if (!S) return L;
    const rS = rangFigure(S, j);
    const garderS = tombe(S) ? j - S.jFin < 2 : !L.some(f => f !== S && !tombe(f) && rangFigure(f, j) <= 1 && rS >= 3);
    return garderS ? [S].concat(L.filter(f => f !== S)) : L;
  }
  /** Les figures concurrentes d'une figure montrée : celles qui partagent son dernier point (la
   *  bulle Expert les cite). */
  function concurrentes(res, f, P) {
    if (!res || !f) return [];
    const d = dernierPoint(f, P), j = res.n - 1;
    return candidatesA(res, P, -Infinity, Infinity, 'expert', j).filter(g => g !== f && (!g.fin || g.jFin > j) && dernierPoint(g, P) === d);
  }
  /** Les dernières figures tombées de l'historique (invalidées, annulées, sans suite), les plus
   *  récentes d'abord, tombées depuis au plus `age` bougies closes (P.horizon par défaut : au-delà,
   *  « récemment » ne se dirait plus). */
  function tombees(res, nb, age) {
    if (!res) return [];
    const jMin = res.n - 1 - (fini(age) ? age : 60);
    const L0 = res.formes.filter(f => !f.doublon && ['invalide', 'invalide_avant', 'expire_avant'].includes(f.fin) && f.jFin >= jMin)
      .concat(((res.ebauches && res.ebauches.liste) || []).filter(e => e.fin === 'abandon' && e.raison === 'depasse' && e.jFin >= jMin));
    return L0.sort((x, y) => y.jFin - x.jFin).slice(0, nb || 3);
  }
  /** L'état VIVANT d'une figure montrée, au prix live : il ne change jamais son état fermé.
   *  S = { h, l, c } (bougies closes 0..j−1) ; j : l'indice de la bougie en cours ; cur : elle
   *  ({ high, low }) ; live : le prix. → { cle, s, p, niveaux, etiq, … }
   *  cle (le prix live) : null | menace | cible | franchi | meche | meche_close | remise | suit ;
   *  etiq (ce que dit le libellé) : la même lecture sur le plus haut et le plus bas de la bougie en
   *  cours — elle ne revient jamais en arrière avant la clôture (pas de libellé qui clignote quand
   *  le prix oscille autour d'une ligne) : menace | cible | sortie | remise | null.
   *  Une ébauche lit les mêmes niveaux que sa figure (sorties, recul, sortie contraire), plus son
   *  niveau d'abandon (le plus haut ou le plus bas de la bougie, pas la clôture : `remise`). */
  function figureVivante(f, S, j, cur, live, P) {
    const out = { cle: null, s: 0, p: null, niveaux: null, etiq: null };
    if (!f || f.fin) return out;
    const N = niveauxFigure(f, j, P);
    out.niveaux = N;
    const hi = cur && fini(cur.high) ? Math.max(cur.high, fini(live) ? live : -Infinity) : live, lo = cur && fini(cur.low) ? Math.min(cur.low, fini(live) ? live : Infinity) : live;
    if (!fini(live)) return out;
    const ext = s => (s > 0 ? hi : lo);
    // Les invalidations que la machine applique (une ébauche : l'extrême et la tête sont l'affaire
    // de son point en attente).
    const invals = N.invals.filter(iv => !(f.ebauche && (iv.raison === 'extreme' || iv.raison === 'tete')));
    let etiq = null, etiqS = 0;
    const touchee = N.confirme ? null : N.sorties.find(x => auDela(live, x.s, x.seuil)) || N.sorties.find(x => auDela(ext(x.s), x.s, x.seuil));
    if (invals.some(iv => auDela(ext(iv.s), iv.s, iv.p))) etiq = 'menace';
    else if (N.confirme && N.objectifs[0] && auDela(ext(N.objectifs[0].s), N.objectifs[0].s, N.objectifs[0].p)) etiq = 'cible';
    else if (touchee) { etiq = 'sortie'; etiqS = touchee.s; }
    if (f.ebauche && fini(f.abandonP) && auDela(ext(f.s), f.s, f.abandonP)) {
      // Le plus haut (plus bas) de la bougie a passé le niveau d'abandon : à la clôture, ce sera le
      // nouveau point en attente, et l'ébauche sera annulée, même si le prix revient.
      return Object.assign(out, { cle: 'remise', s: f.s, p: f.abandonP, ext: ext(f.s), etiq: 'remise' });
    }
    out.etiq = etiq; out.etiqS = etiqS;
    for (const iv of invals) if (auDela(live, iv.s, iv.p)) return Object.assign(out, { cle: 'menace', s: iv.s, p: iv.p, raison: iv.raison, clotures: iv.clotures || 1, contre: f.contre || 0 });
    if (N.confirme) {
      const o = N.objectifs[0];
      if (o && (auDela(live, o.s, o.p) || auDela(ext(o.s), o.s, o.p))) return Object.assign(out, { cle: 'cible', s: o.s, p: o.p });
      return out;
    }
    for (const x of N.sorties) if (auDela(live, x.s, x.seuil)) return Object.assign(out, { cle: 'franchi', s: x.s, p: x.seuil, ligne: x.ligne });
    for (const x of N.sorties) if (auDela(ext(x.s), x.s, x.seuil)) return Object.assign(out, { cle: 'meche', s: x.s, p: x.seuil, ligne: x.ligne });
    if (!f.demi && S && S.h) {
      for (let k = j - 1; k >= Math.max(f.depart || 0, j - P.mecheBougies); k--) {
        const Nk = niveauxFigure(f, k, P);
        for (const x of Nk.sorties) if (auDela(x.s > 0 ? S.h[k] : S.l[k], x.s, x.seuil) && !auDela(S.c[k], x.s, x.seuil)) return Object.assign(out, { cle: 'meche_close', s: x.s, p: x.seuil, k });
      }
    }
    if (f.ebauche && f.pend && auDela(ext(f.s), f.s, f.pend.p)) return Object.assign(out, { cle: 'suit', s: f.s, p: ext(f.s) });
    return out;
  }

  // ── Les mots ──
  // [nom (Expert), pluriel, avec article]
  const NOMS_FORMES = {
    double_sommet: ['Double sommet', 'doubles sommets', 'un double sommet'], double_creux: ['Double creux', 'doubles creux', 'un double creux'],
    triple_sommet: ['Triple sommet', 'triples sommets', 'un triple sommet'], triple_creux: ['Triple creux', 'triples creux', 'un triple creux'],
    ete: ['Épaule-tête-épaule', 'épaule-tête-épaule', 'un épaule-tête-épaule'], ete_inverse: ['Épaule-tête-épaule inversé', 'épaule-tête-épaule inversés', 'un épaule-tête-épaule inversé'],
    range: ['Rectangle (range)', 'rectangles', 'un rectangle'],
    triangle_ascendant: ['Triangle ascendant', 'triangles ascendants', 'un triangle ascendant'], triangle_descendant: ['Triangle descendant', 'triangles descendants', 'un triangle descendant'],
    triangle_symetrique: ['Triangle symétrique', 'triangles symétriques', 'un triangle symétrique'],
    biseau_montant: ['Biseau montant', 'biseaux montants', 'un biseau montant'], biseau_descendant: ['Biseau descendant', 'biseaux descendants', 'un biseau descendant'],
    canal_montant: ['Canal montant', 'canaux montants', 'un canal montant'], canal_descendant: ['Canal descendant', 'canaux descendants', 'un canal descendant'],
    drapeau: ['Drapeau', 'drapeaux', 'un drapeau'], fanion: ['Fanion', 'fanions', 'un fanion'],
  };
  /** L'état d'une figure, en mots. → { cle, texte, court } */
  function etatForme(f) {
    const fam = famille(f), dbl = !deuxCotes(f) && fam !== 'drapeau';
    const dir = s => (s > 0 ? 'au-dessus' : 'en dessous'), cote = s => (s > 0 ? 'par le haut' : 'par le bas'), fl = s => (s > 0 ? '↑' : '↓');
    const ligneV = fam === 'ete' || fam === 'extremes' ? 'la ligne de cou' : 'la borne';
    if (f.ebauche) {
      if (f.fin === 'abandon') return { cle: 'abandon', texte: 'ébauche annulée', court: '✗ annulée' };
      if (!f.demi && f.phase !== 'confirme') return { cle: 'ebauche', texte: 'ébauche : dernier ' + (f.s > 0 ? 'sommet' : 'creux') + ' pas encore confirmé', court: 'ébauche (' + (f.pend && f.pend.reste > 0 ? f.pend.reste : 1) + ' b.)' };
    }
    if (f.fin === 'atteint') return { cle: 'atteint', texte: 'objectif théorique atteint (en clôture)', court: 'obj. atteint' };
    if (f.fin === 'invalide' || f.fin === 'invalide_avant') return { cle: 'invalide',
      texte: fam === 'extremes' ? 'invalidé (clôture ' + (f.sens < 0 ? 'au-dessus des sommets' : 'sous les creux') + ')' : fam === 'ete' ? 'invalidé (clôture au-delà ' + (f.fin === 'invalide' ? 'de l’épaule droite' : 'de la tête') + ')'
        : fam === 'drapeau' && f.fin === 'invalide_avant' ? 'invalidé (' + (f.raison === 'recul' ? 'recul de plus de la moitié du mât' : 'sortie du mauvais côté') + ')' : 'invalidé (clôture revenue ' + (fam === 'drapeau' ? 'au bout de la pause' : 'au milieu de la figure') + ')', court: '✗ invalidé' };
    if (f.fin === 'expire_avant') return { cle: 'sans_suite', texte: f.raison === 'pointe' ? 'sans suite (pointe atteinte sans sortie)' : 'sans suite (délai écoulé)', court: 'sans suite' };
    if (f.fin === 'devenu_triple') return { cle: 'devenu_triple', texte: 'devenu un triple', court: 'devenu triple' };
    if (f.fin) return { cle: 'oublie', texte: 'délai écoulé', court: 'délai écoulé' };
    if (f.phase === 'confirme') return dbl
      ? { cle: 'confirme', texte: 'confirmé (2 clôtures ' + (f.sens < 0 ? 'sous' : 'au-dessus de') + ' ' + ligneV + ')' + (f.retest ? ', par un retour réussi' : ''), court: 'confirmé 2/2' + (f.retest ? ' · retour' : '') }
      : { cle: 'confirme', texte: 'sorti ' + cote(f.sens) + ' — validé (2 clôtures ' + dir(f.sens) + ')' + (f.retest ? ', par un retour réussi' : ''), court: 'sortie validée ' + fl(f.sens) };
    if (f.demi) {
      const r = f.enRetour ? ' · retour' : '';
      return dbl
        ? { cle: 'demi', texte: (fam === 'ete' || fam === 'extremes' ? 'ligne de cou franchie' : 'sortie') + ', à confirmer (1/2 clôtures)' + (f.enRetour ? ', revenu tout près de la ligne' : ''), court: 'cassure 1/2' + r }
        : { cle: 'demi', texte: 'le prix est sorti ' + cote(f.demiSens) + ' — à confirmer (1/2 clôtures ' + dir(f.demiSens) + ')' + (f.enRetour ? ', revenu tout près de la borne' : ''), court: 'sortie 1/2 ' + fl(f.demiSens) + r };
    }
    return deuxCotes(f) ? { cle: 'dedans', texte: 'le prix est dedans', court: 'dedans' } : { cle: 'formation', texte: 'en formation', court: 'en formation' };
  }
  /** Le bilan mesuré d'un type, en phrases (débutant) ou en abrégé (expert), à côté du repère SANS
   *  forme. ctx = { n, intervalle (« 15m »), duree (s) }. Des comptes, aucune probabilité.
   *  mode 'expertCourt' : l'étiquette d'une figure en expert, ≤ 80 caractères avec le nom ;
   *  mode 'expert' : la bulle (ébauches, témoin, sens des sorties). */
  function texteBilan(b, ctx, P, mode) {
    if (!b) return '';
    const faible = b.confirmes < P.echantillonFaible, lignesF = FAMILLES[b.type] === 'lignes';
    const nb = nombre(ctx.n, 0), itv = nomIntervalle(ctx.intervalle), d = duree(ctx.duree);
    const T = b.temoin || { departs: 0, atteints: 0 }, noms = NOMS_FORMES[b.type] || ['', 'formes', 'une forme'], E = b.ebauches || { n: 0, devenues: 0, confirmees: 0 };
    const finis = b.atteints + b.invalides + b.expires;
    if (mode === 'expertCourt') {
      // Sans aucune issue connue, pas de « obj. 0/0 ».
      const obj = finis ? ', obj. ' + b.atteints + '/' + finis : '';
      return (lignesF ? 'mesuré ' + b.formes + ' rep.' + obj : 'mesuré ' + b.confirmes + '/' + b.formes + ' conf.' + obj) + (faible ? ' · éch. faible' : '');
    }
    if (mode === 'expert') {
      const eb = E.n ? ' · ébauches ' + E.n + ' → figures ' + E.devenues + (lignesF ? '' : ' → conf. ' + E.confirmees) + (E.n < P.echantillonFaible ? ' (éch. faible)' : '') : '';
      const ecart = { peu: '', pareil: ' (pareil au repère, Wilson 95 %)', plus: ' (plus souvent que le repère, Wilson 95 %)', moins: ' (moins souvent que le repère, Wilson 95 %)' }[b.ecart || 'peu'];
      if (lignesF) {
        return 'Mesuré · hist. ' + nb + ' × ' + itv + ' (' + d + ') : ' + b.formes + ' repérées · sorties ↑ ' + b.haut + ' / ↓ ' + b.bas + ' · après sortie : cible ' + b.atteints + ' / invalidée ' + b.invalides + ' / sans issue ' + b.expires + ' / ouv. ' + b.ouverts
          + (T.departs ? ' · sans forme : obj. ' + nombre(T.atteints, 0) + '/' + nombre(T.departs, 0) + ecart : '') + eb + (faible ? ' · échantillon faible' : '');
      }
      return 'Mesuré · hist. ' + nb + ' × ' + itv + ' (' + d + ') : ' + b.formes + ' repérés' + (b.devenusTriples ? ' (dont ' + b.devenusTriples + ' devenus triples)' : '') + ' · ' + b.confirmes + ' conf. · obj. ' + b.atteints + ' · inval. ' + b.invalides
        + ' · sans issue ' + b.expires + ' · ouv. ' + b.ouverts + (T.departs ? ' · sans forme : obj. ' + nombre(T.atteints, 0) + '/' + nombre(T.departs, 0) + ecart : '') + eb
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
    const nom = NOMS_FORMES[f.type][2], e = etatForme(f), il = quandFin(quand), fam = famille(f), deNom = deArt(NOMS_FORMES[f.type][0].toLowerCase());
    switch (e.cle) {
      case 'ebauche': return 'une ébauche ' + deNom + ' se dessine';
      case 'formation': return nom + ' est en formation';
      case 'dedans': return f.type === 'range' ? 'le prix est dans ' + nom + ' (' + chiffres(f.bas) + ' – ' + prix(f.haut, unite) + ')' : 'le prix est dans ' + nom;
      case 'demi': return fam === 'extremes' || fam === 'ete' ? nom + ' attend une 2e clôture ' + (f.sens < 0 ? 'sous' : 'au-dessus de') + ' sa ligne de cou (' + prix(fam === 'ete' ? ligne(f.couL, f.jDemi) : f.niveau, unite) + ')'
        : 'le prix est sorti ' + ((fam === 'drapeau' ? f.sens : f.demiSens) > 0 ? 'par le haut' : 'par le bas') + ' ' + deArt(nom) + ', une 2e clôture dehors le validerait';
      case 'confirme': return nom + ' est confirmé (objectif théorique ' + prix(f.objectif, unite) + ', non garanti)';
      case 'atteint': return nom + ' a atteint son objectif théorique' + (il ? ' ' + il : '');
      case 'invalide': return il ? nom + ' a été invalidé ' + il : nom + ' vient d’être invalidé';
      case 'abandon': return 'une ébauche ' + deNom + ' a été annulée' + (il ? ' ' + il : '');
      case 'sans_suite': return nom + ' est resté sans suite' + (il ? ' (' + il + ')' : '');
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
    sr: ['Zone de retour', 'Zone retour', 'une zone de retour', 'Retour'],
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
  /** La même durée, en court (téléphone, 48 caractères) : un verbe de mouvement sans sa durée se
   *  lisait comme le contraire de la variation 24 h affichée juste au-dessus (« Le prix monte. » à
   *  côté de « −0,57 % en 24 h »). Environ la fenêtre du mouvement mesuré (ADX 14 bougies). */
  const HORIZON_COURT = { '1m': 'Depuis 15 min', '5m': 'Depuis 1 h', '15m': 'Depuis 3 h', '1h': 'Depuis hier', '4h': 'Sur 2 jours', '1d': 'Sur 2 semaines' };
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
    if (s >= 2 * 86400) return nombre(Math.round(s / 86400), 0) + ' derniers jours';
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
    const H = HORIZON_DEBUTANT[o.itv] || null, Hc = HORIZON_COURT[o.itv] || null, cle = o.regime ? o.regime.cle : 'inconnu';
    // Les variantes AVEC la durée : la longue, puis la courte (téléphone) ; sans durée, en dernier.
    const avecH = s => (H ? [H + ', ' + minuscule(s)] : []).concat(Hc && Hc !== H ? [Hc + ', ' + minuscule(s)] : []);
    const avecHc = s => (Hc ? [Hc + ', ' + minuscule(s)] : []);
    // « Entre B et A » seulement si les deux repères sont dans la vue (o.vue = { lo, hi }, l'échelle
    // de prix affichée) : un repère loin hors de la vue n'encadre pas un prix qui ne l'a jamais
    // approché (constat de revue : « hésite entre 82 626 $ et 83 170 $ » sur un axe 82 465–82 777).
    const dansVue = r => !r || !o.vue || !fini(o.vue.lo) || !fini(o.vue.hi) || (r.p >= o.vue.lo && r.p <= o.vue.hi);
    let V, compacte;
    const enTest = o.enTest && raisonPrincipale(o.enTest);
    const casseSous = ch.dessus && ch.dessus.ferme && ch.dessus.ferme.cassure === 'valide' && ch.dessus.ferme.sens < 0;
    const casseSur = ch.dessous && ch.dessous.ferme && ch.dessous.ferme.cassure === 'valide' && ch.dessous.ferme.sens > 0;
    if (enTest) {
      const N = nomsDebutant(enTest)[2], P = prixR(enTest, u), sens = VERBE_DEBUTANT[cle] || null;
      // Le verbe du mouvement passe avant le nom du repère : sur téléphone (48 caractères),
      // « Depuis 3 h, le prix monte et touche 82 710 $. » plutôt que « Le prix touche le mur de vente (…) ».
      // Un sens garde sa durée : sans place pour les deux, le prix touché quitte la phrase (sa bande
      // s'allume sur le tracé) avant la durée (« Sur 2 semaines, le prix monte. »).
      const dir = sens === 'monte' || sens === 'baisse';
      V = (sens ? avecH('Le prix ' + sens + ' et touche ' + N + ' (' + P + ').').concat(avecHc('Le prix ' + sens + ' et touche ' + P + '.'), dir ? avecHc('Le prix ' + sens + '.') : [], ['Le prix ' + sens + ' et touche ' + P + '.']) : [])
        .concat(['Le prix touche ' + N + ' (' + P + ').', 'Le prix touche le repère ' + P + '.']);
      compacte = 'Le prix touche ' + P + '.';
    } else if (casseSur || casseSous) {
      V = [casseSur ? 'Le prix est passé au-dessus de ' + B + '.' : 'Le prix est passé sous ' + A + '.'];
      compacte = V[0];
    } else if (cle === 'hausse' || cle === 'baisse') {
      // Un sens (monte, baisse) garde TOUJOURS sa durée : au téléphone, le repère quitte la phrase
      // avant elle (il a son libellé sur le tracé).
      const verbe = VERBE_DEBUTANT[cle], X = cle === 'hausse' ? A : B;
      const repere = cle === 'hausse' ? 'Repère au-dessus : ' : 'Repère en dessous : ', court = cle === 'hausse' ? 'Au-dessus : ' : 'En dessous : ';
      const aucun = cle === 'hausse' ? 'Aucun repère proche au-dessus.' : 'Aucun repère proche en dessous.';
      const base = 'Le prix ' + verbe + '.';
      V = X ? avecH(base + ' ' + repere + X + '.').concat(avecHc(base + ' ' + court + X + '.'), avecHc(base), [base + ' ' + repere + X + '.'])
        : avecH(base + ' ' + aucun).concat(avecHc(base), [base]);
      compacte = X ? base + ' ' + court + X + '.' : base;
    } else if (cle === 'inconnu') {
      if (A && B) { V = ['Le prix est entre ' + B + ' et ' + A + '.', 'Le prix est entre ' + Bc + ' et ' + A + '.']; compacte = V[1]; }
      else if (A) { V = ['Le prix est sous ' + A + '. Aucun repère proche en dessous.', 'Le prix est sous ' + A + '.']; compacte = V[1]; }
      else if (B) { V = ['Le prix est au-dessus de ' + B + '. Aucun repère proche au-dessus.', 'Le prix est au-dessus de ' + B + '.']; compacte = V[1]; }
      else { V = ['Le prix est sans repère proche.']; compacte = V[0]; }
    } else {
      // faible, sans tendance : « hésite » ; tendance de sens incertain : « s'agite » (il bouge fort).
      const verbe = cle === 'incertaine' ? 's’agite' : 'hésite';
      // Avec la durée (longue, courte), puis sans elle.
      const avecHs = t => avecH(t).concat([t]);
      const vA = A && dansVue(rA), vB = B && dansVue(rB);
      if (vA && vB) { V = avecHs('Le prix ' + verbe + ' entre ' + B + ' et ' + A + '.').concat(['Le prix ' + verbe + ' entre ' + Bc + ' et ' + A + '.']); compacte = 'Le prix ' + verbe + ' : ' + Bc + ' – ' + A + '.'; }
      // Un repère de chaque côté, l'un loin hors de la vue : la phrase nomme le proche seul (le
      // lointain garde son libellé, fléché, au bord du tracé).
      else if (A && B && vB) { V = avecHs('Le prix ' + verbe + ' au-dessus de ' + B + '.'); compacte = V[V.length - 1]; }
      else if (A && B && vA) { V = avecHs('Le prix ' + verbe + ' sous ' + A + '.'); compacte = V[V.length - 1]; }
      else if (A && B) { V = avecHs('Le prix ' + verbe + ', loin de ses repères.').concat(avecHs('Le prix ' + verbe + '.')); compacte = V[V.length - 1]; }
      else if (A) { V = avecHs('Le prix ' + verbe + ' sous ' + A + '. Aucun repère proche en dessous.').concat(['Le prix ' + verbe + ' sous ' + A + '.']); compacte = V[V.length - 1]; }
      else if (B) { V = avecHs('Le prix ' + verbe + ' au-dessus de ' + B + '. Aucun repère proche au-dessus.').concat(['Le prix ' + verbe + ' au-dessus de ' + B + '.']); compacte = V[V.length - 1]; }
      else { V = avecHs('Le prix ' + verbe + ' : aucun repère proche.'); compacte = V[V.length - 1]; }
    }
    // Vue dans le passé : « Maintenant, … » (sans la durée, qui parlerait d'une autre période), s'il tient.
    if (o.maintenant) {
      const aH = v => (H && v.indexOf(H + ',') === 0) || (Hc && v.indexOf(Hc + ',') === 0);
      const sansH = V.filter(v => !aH(v));
      V = ['Maintenant, ' + minuscule(sansH[0])].concat(sansH);
    }
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
      case 'h24_haut': return n + 'le prix le plus haut des dernières 24 heures, sur ce graphique.';
      case 'h24_bas': return n + 'le prix le plus bas des dernières 24 heures, sur ce graphique.';
      case 'sr': { const d = fini(r.bougies) && fini(pasS) ? dernieres(r.bougies * pasS) : null; return n + (r.touches || '') + ' fois, le prix a fait demi-tour autour de ce prix' + (d ? ' sur les ' + d + ' de ce graphique' : '') + '.'; }
      case 'mur_achat': case 'mur_vente': {
        const q = fini(r.btc) ? ' (' + nombre(r.btc, r.btc >= 10 ? 0 : 1) + ' BTC)' : '';
        return n + (fini(r.bin) && r.bin > 0 ? 'la tranche de ' + nombre(r.bin, 0) + ' $' : 'le prix') + ' où le plus de BTC attendaient ' + (r.cle === 'mur_achat' ? 'à l’achat' : 'à la vente') + q
          + ' parmi les ordres en attente de Binance' + age + '. Ces ordres peuvent avoir bougé depuis.';
      }
      default: return n + minuscule(r.nom) + '.';
    }
  }
  // ─── Figures, en mots : libellés (Débutant ≤ 26 caractères, Expert ≤ 80) et bulles ───
  // Les NIVEAUX viennent tous de niveauxFigure (ceux que la machine applique) ; la cible n'est
  // jamais écrite sans le bilan mesuré. ctx = { n, intervalle (« 15m »), duree (s), temps (heures
  // d'ouverture des bougies, s), pas (s), maintenant (ms), j (la bougie en cours) }.
  const NOM_FORME_DEBUTANT = { double_sommet: 'Double sommet', double_creux: 'Double creux', triple_sommet: 'Triple sommet', triple_creux: 'Triple creux',
    ete: 'Tête-épaules', ete_inverse: 'Tête-épaules', range: 'Rectangle', triangle_ascendant: 'Triangle', triangle_descendant: 'Triangle', triangle_symetrique: 'Triangle',
    biseau_montant: 'Biseau', biseau_descendant: 'Biseau', canal_montant: 'Canal', canal_descendant: 'Canal', drapeau: 'Drapeau', fanion: 'Fanion' };
  /** Le nom long, en mots simples (titre de la bulle Débutant) : le sous-type dit sans flèche. */
  const NOM_LONG_DEBUTANT = { double_sommet: 'Double sommet', double_creux: 'Double creux', triple_sommet: 'Triple sommet', triple_creux: 'Triple creux',
    ete: 'Tête-épaules', ete_inverse: 'Tête-épaules à l’envers', range: 'Rectangle', triangle_ascendant: 'Triangle à plafond plat', triangle_descendant: 'Triangle à plancher plat',
    triangle_symetrique: 'Triangle qui se resserre', biseau_montant: 'Biseau qui monte', biseau_descendant: 'Biseau qui descend', canal_montant: 'Canal qui monte',
    canal_descendant: 'Canal qui descend', drapeau: 'Drapeau', fanion: 'Fanion' };
  const fleche = s => (s > 0 ? '↑' : '↓');
  /** Le côté d'une sortie, en mots (jamais une flèche seule, qui se lirait comme une prévision). */
  const enHautBas = s => (s > 0 ? 'en haut' : 'en bas');
  /** Le premier libellé d'une liste qui tient en `max` caractères (26 par défaut), sinon le dernier. */
  const tenir = (V, max) => V.find(t => t.length <= (max || 26)) || V[V.length - 1];
  /** Le libellé d'une figure en Débutant (≤ 26 caractères), à la dernière clôture : son nom, puis
   *  son état. Une ébauche et une figure formée portent le même « … possible » : le trait les
   *  distingue (tirets fins et point creux), et la 1re phrase de la bulle. Le côté d'une sortie se
   *  dit en mots (« Biseau : sortie en bas »). */
  function libelleFormeDebutant(f) {
    const e = etatForme(f), nom = NOM_FORME_DEBUTANT[f.type], sortie = famille(f) === 'lignes' || famille(f) === 'drapeau';
    if (!nom) return null;
    switch (e.cle) {
      case 'ebauche': case 'formation': return nom + ' possible';
      case 'dedans': return 'Prix dans un ' + minuscule(nom);
      case 'demi': return sortie ? nom + ' : sort ' + enHautBas(famille(f) === 'drapeau' ? f.sens : f.demiSens) + ' ?' : nom + ' à confirmer';
      case 'confirme': return sortie ? nom + ' : sortie ' + enHautBas(f.sens) : nom + ' confirmé';
      case 'invalide': return '✗ ' + nom + ' invalidé';
      case 'abandon': return '✗ ' + nom + ' annulé';
      case 'sans_suite': return nom + ' sans suite';
      case 'atteint': return tenir([nom + ' : cible atteinte', 'Cible atteinte']);
      case 'oublie': return tenir([nom + ' : délai écoulé', nom + ' : expiré']);
      default: return null;
    }
  }
  /** Les libellés VIVANTS (Débutant, posés sur le calque, au prix live, sans redessin du graphique) :
   *  le nom de la figure reste, l'état du moment s'y ajoute. Clé : figureVivante(…).etiq, lue sur le
   *  plus haut et le plus bas de la bougie en cours (il ne revient pas en arrière avant la clôture).
   *  → les variantes, de la plus riche à la plus courte. */
  function libellesVivantsDebutant(f, etiq, s) {
    const nom = NOM_FORME_DEBUTANT[f.type], cote = famille(f) === 'lignes' || famille(f) === 'drapeau';
    if (!nom) return [];
    switch (etiq) {
      case 'sortie': return cote ? [nom + ' : sort ' + enHautBas(famille(f) === 'drapeau' ? f.sens : s) + ' ?'] : [nom + ' à confirmer'];
      case 'menace': return [nom + ' : menacé'];
      case 'cible': return [nom + ' : à la cible'];
      case 'remise': return [nom + ' : se défait'];
      default: return [];
    }
  }
  /** Des exemples de libellés vivants (un par état), pour les tests de mots. */
  const LIBELLES_VIVANTS = { sortie: 'Rectangle : sort en haut ?', menace: 'Double sommet : menacé', cible: 'Tête-épaules : à la cible', remise: 'Double sommet : se défait' };
  function libelleVivantDebutant(f, v, max) {
    const V = v && v.etiq ? libellesVivantsDebutant(f, v.etiq, v.etiqS != null ? v.etiqS : v.s).filter(t => t.length <= (max || 26)) : [];
    return V[0] || libelleFormeDebutant(f);
  }
  /** Tous les libellés qu'une figure peut porter jusqu'à la prochaine clôture (la place réservée
   *  est celle du plus long). */
  function libellesPossiblesDebutant(f, max) {
    const base = libelleFormeDebutant(f);
    if (!base || f.fin) return base ? [base] : [];
    const etiqs = f.phase === 'confirme' ? ['menace', 'cible'] : ['sortie', 'menace'].concat(f.ebauche && fini(f.abandonP) ? ['remise'] : []);
    const out = [base];
    for (const k of etiqs) for (const s of [1, -1]) { const t = libellesVivantsDebutant(f, k, s).find(x => x.length <= (max || 26)); if (t && !out.includes(t)) out.push(t); }
    return out;
  }

  // Heures : celle de la FIN d'une bougie, partout ; le Débutant lit l'heure de Paris, l'Expert
  // l'heure UTC suivie de celle de Paris.
  const tempsDe = (ctx, i) => (ctx && ctx.temps && fini(ctx.temps[i]) ? ctx.temps[i] : ctx && ctx.temps && ctx.temps.length && fini(ctx.pas) ? ctx.temps[0] + i * ctx.pas : NaN);
  const finMs = (ctx, i) => (fini(tempsDe(ctx, i)) ? (tempsDe(ctx, i) + ctx.pas) * 1000 : NaN);
  const debutMs = (ctx, i) => (fini(tempsDe(ctx, i)) ? tempsDe(ctx, i) * 1000 : NaN);
  let FMT_JOUR = null;
  try { FMT_JOUR = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: 'numeric', month: 'numeric', year: 'numeric' }); } catch (e) { FMT_JOUR = null; }
  const jourParis = ms => (FMT_JOUR && fini(ms) ? FMT_JOUR.format(new Date(ms)) : '');
  /** « aujourd'hui à 13h00 », « hier à 03h00 », « le 7 à 18h00 » (heure de Paris). */
  function quandParis(ms, maintenant) {
    const h = heureParis(ms);
    if (!h) return '';
    if (!fini(maintenant)) return 'à ' + h;
    const j = jourParis(ms);
    if (j === jourParis(maintenant)) return 'aujourd’hui à ' + h;
    if (j === jourParis(maintenant - 86400000)) return 'hier à ' + h;
    if (j === jourParis(maintenant + 86400000)) return 'demain à ' + h;
    // Le jour seul dans le mois en cours ; le jour et le mois au-delà de 20 jours.
    const [d, m] = j.split('/');
    return 'le ' + d + (Math.abs(maintenant - ms) > 20 * 86400000 ? '/' + String(m).padStart(2, '0') : '') + ' à ' + h;
  }
  /** Débutant : « à 14h00 » aujourd'hui, sinon « hier à 14h00 », « demain à 02h00 », « le 7 à
   *  14h00 » (heure de Paris) — une heure seule se lirait comme celle d'aujourd'hui. */
  function quandDeb(ms, ctx) {
    if (!fini(ms) || !heureParis(ms)) return '';
    const now = ctx && ctx.maintenant;
    return fini(now) ? quandParis(ms, now).replace(/^aujourd’hui /, '') : 'à ' + heureParis(ms);
  }
  /** Expert : la date (jj/mm) s'ajoute à l'heure UTC sur des bougies de 4 h ou plus, ou quand
   *  l'instant n'est pas du même jour (UTC) que maintenant ; sur des bougies d'un jour, la date seule. */
  const dateUTC = ms => { const d = new Date(ms).toISOString(); return d.slice(8, 10) + '/' + d.slice(5, 7); };
  function avecDate(ms, ctx) {
    const now = ctx && fini(ctx.maintenant) ? ctx.maintenant : NaN, pas = ctx && fini(ctx.pas) ? ctx.pas : 0;
    return pas >= 4 * 3600 || (fini(now) && fini(ms) && dateUTC(now) !== dateUTC(ms));
  }
  function heureCourteUTC(ms, ctx) {
    if (!fini(ms)) return '—';
    if (ctx && ctx.pas >= 86400) return dateUTC(ms);
    return (avecDate(ms, ctx) ? dateUTC(ms) + ' ' : '') + heureUTC(ms) + ' UTC';
  }
  const heureExpert = (ms, ctx) => (fini(ms) ? heureCourteUTC(ms, ctx) + (heureParis(ms) && !(ctx && ctx.pas >= 86400) ? ' (' + heureParis(ms) + ' Paris)' : '') : '—');

  /** La marque de fin d'une figure tombée : « ✗ invalidé à 06:15 UTC (08h15 Paris) : clôture
   *  au-dessus des sommets (83 664 $) » (Expert) ; « Invalidé à 08h15 (heure de Paris) : … » (Débutant). */
  function marqueFin(f, ctx, mode, unite) {
    if (!f || !f.fin) return '';
    const exp = mode === 'expert', ms = finMs(ctx, f.jFin), per = periode(ctx && ctx.intervalle), fam = famille(f);
    // Expert : « à 06:15 UTC (08h15 Paris) », « le 13/09 à 09:00 UTC (11h00 Paris) », « le 13/09 » (1 j).
    const hx = exp ? heureExpert(ms, ctx) : '';
    const h = exp ? (ctx && ctx.pas >= 86400 ? 'le ' + hx : /^\d\d\/\d\d /.test(hx) ? 'le ' + hx.replace(/^(\d\d\/\d\d) /, '$1 à ') : 'à ' + hx)
      : fini(ms) && heureParis(ms) ? quandDeb(ms, ctx) + ' (heure de Paris)' : '';
    const s = f.sens, ev = (f.journal || []).filter(x => x.j === f.jFin).pop() || {}, p = fini(ev.p) ? ev.p : f.invalidation;
    if (f.ebauche && f.fin === 'abandon') {
      const pt = f.s > 0 ? 'sommet' : 'creux', pts = f.s > 0 ? 'sommets' : 'creux', ete = famille(f) === 'ete';
      if (f.finFig) {
        // Tombée comme la figure serait tombée (recul, sortie contraire, pointe, délai).
        const g = Object.assign({}, f, { ebauche: false, fin: f.finFig });
        return marqueFin(g, ctx, mode, unite).replace(/^✗ invalidé|^sans suite|^Invalidé|^Sans suite/, exp ? '✗ ébauche annulée' : 'Annulé');
      }
      if (exp) return '✗ ébauche annulée ' + h + ' : ' + (f.raison === 'depasse' ? 'nouvel extrême ' + prix(f.pAbandon, unite) + ' au-delà de ' + prix(f.abandonP, unite) + (ete ? ' (la tête)' : '')
        : f.raison === 'regle' ? 'point confirmé, mais les règles de la figure ne sont plus remplies' : 'la figure ne tient plus avec le nouvel extrême');
      return 'Annulé ' + h + ' : ' + (f.raison === 'depasse' ? 'le prix est ' + (f.s > 0 ? 'monté au-dessus de ' : 'descendu sous ') + prix(f.abandonP, unite) + (ete ? ', plus loin que la tête.' : ' ; les ' + pts + ' ne sont plus au même niveau.')
        : f.raison === 'regle' ? 'le dernier ' + pt + ' est acquis, mais la figure ne remplit plus ses conditions.' : 'avec ce nouveau ' + pt + ', la figure ne tient plus.');
    }
    if (f.fin === 'atteint') return exp ? 'objectif théorique atteint ' + h + ' (clôture ' + prix(ev.c, unite) + ')' : 'Cible théorique atteinte ' + h + ' (' + prix(f.objectif, unite) + ').';
    if (f.fin === 'expire_avant') return exp ? 'sans suite ' + h + ' : ' + (f.raison === 'pointe' ? 'pointe atteinte sans sortie' : 'délai écoulé') : 'Sans suite ' + h + ' : ' + (f.raison === 'pointe' ? 'le prix est resté dedans jusqu’à la pointe.' : 'le prix n’en est pas sorti à temps.');
    if (f.fin === 'expire') return exp ? 'délai de ' + (ctx && ctx.horizon || '') + ' bougies écoulé ' + h + ' sans objectif ni invalidation' : 'Délai écoulé ' + h + ' : ni la cible ni l’invalidation n’ont été atteintes.';
    if (f.fin !== 'invalide' && f.fin !== 'invalide_avant') return '';
    const raisons = {
      extreme: [s < 0 ? 'clôture au-dessus des sommets' : 'clôture sous les creux', 'le prix a fini ' + per[0] + (s < 0 ? ' au-dessus des sommets' : ' sous les creux')],
      tete: [s < 0 ? 'clôture au-dessus de la tête' : 'clôture sous la tête', 'le prix a fini ' + per[0] + (s < 0 ? ' au-dessus de la tête' : ' sous la tête')],
      epaule: [s < 0 ? 'clôture au-dessus de l’épaule droite' : 'clôture sous l’épaule droite', 'le prix a fini ' + per[0] + (s < 0 ? ' au-dessus de l’épaule droite' : ' sous l’épaule droite')],
      milieu: ['clôture revenue au milieu de la figure', 'le prix a fini ' + per[0] + ' revenu au milieu de la figure'],
      pause: ['clôture revenue au bout de la pause', 'le prix a fini ' + per[0] + ' revenu au bout de la pause'],
      recul: ['recul de plus de ' + nombre(50, 0) + ' % du mât', 'le prix a reculé de plus de la moitié de la montée'],
      sortie_contraire: ['2 clôtures du mauvais côté de la pause', 'le prix a fini ' + per[1] + ' de suite du mauvais côté de la pause'],
    }[f.raison] || ['clôture au-delà de l’invalidation', 'le prix a fini ' + per[0] + ' au-delà de l’invalidation'];
    if (fam === 'drapeau' && f.raison === 'recul') raisons[1] = s > 0 ? 'le prix a reculé de plus de la moitié de la montée' : 'le prix a remonté plus de la moitié de la descente';
    return exp ? '✗ invalidé ' + h + ' : ' + raisons[0] + ' (' + prix(p, unite) + ')' : 'Invalidé ' + h + ' : ' + raisons[1] + ' (' + prix(p, unite) + ') ; la figure ne tient plus.';
  }
  /** L'état court Expert : « ébauche (1 b.) », « cassure 1/2 », « ✗ invalidé 06:15 UTC »… */
  function etatCourtExpert(f, ctx) {
    const e = etatForme(f);
    if (e.cle === 'invalide') return '✗ invalidé ' + heureCourteUTC(finMs(ctx, f.jFin), ctx);
    if (e.cle === 'abandon') return '✗ annulé ' + heureCourteUTC(finMs(ctx, f.jFin), ctx);
    const rec = !f.fin && fini(f.tMaj) && ctx && fini(ctx.n) && ctx.n - 1 - f.tMaj <= 1 ? ' · recalé ' + heureCourteUTC(finMs(ctx, f.tMaj), ctx) : '';
    return e.court + rec;
  }
  /** Les libellés Expert, du plus riche au plus court (≤ 80 caractères) :
   *  « {Nom} · {état} · mesuré {conf}/{repérées} conf., obj. {a}/{finies} · éch. faible ». */
  function libellesFormeExpert(f, b, ctx, P) {
    const nom = NOMS_FORMES[f.type][0], e = etatCourtExpert(f, ctx), c = b ? texteBilan(b, ctx, P, 'expertCourt') : '';
    const V = [nom + ' · ' + e + (c ? ' · ' + c : ''), nom + ' · ' + e.replace(' · retour', '') + (c ? ' · ' + c : ''), nom + ' · ' + e.replace(/ · recalé.*$/, '') + (c ? ' · ' + c.replace(' · éch. faible', '') : ''), nom + ' · ' + e];
    return V.filter((x, k) => x.length <= 80 || k === V.length - 1).filter((x, k, a) => a.indexOf(x) === k);
  }

  /** Les mots du Débutant pour un côté : [« sous », « au-dessus de »], « dessous ». */
  const sousSur = s => (s > 0 ? 'au-dessus de ' : 'sous ');
  const dessous = s => (s > 0 ? 'au-dessus' : 'dessous');
  /** Le nom d'une période sans article (« quart d’heure »), « de » + lui, « du » + lui, « un nouveau » + lui. */
  const nomPer = per => per[0].replace(/^une? /, '');
  const dePer = per => (/^[aeiouhéè]/i.test(nomPer(per)) ? 'd’' : 'de ') + nomPer(per);
  const duPer = per => (per[0].startsWith('un ') ? 'du ' : /^[aeiouhéè]/i.test(nomPer(per)) ? 'de l’' : 'de la ') + nomPer(per);
  const nouvellePer = per => per[0].replace(/^une /, 'une nouvelle ').replace(/^un /, 'un nouveau ');
  const majuscule = t => t.charAt(0).toUpperCase() + t.slice(1);
  /** Ce que la figure montre, et ce qui lui manque encore (1re phrase de la bulle Débutant). */
  function vuDebutant(f, ctx, unite) {
    const fam = famille(f), per = periode(ctx && ctx.intervalle), now = ctx && ctx.maintenant;
    const q = i => quandParis(debutMs(ctx, i), now);
    // « d’ici 14h00 », « d’ici demain 02h00 » ; le point en attente au prix de la bougie en cours
    // quand elle va plus loin que lui (v.cle 'suit') ; rien à promettre quand l'ébauche se défait.
    const dici = ms => { const t = quandDeb(ms, ctx); return t ? ' d’ici ' + t.replace(/^à /, '').replace(/ à /, ' ') : ''; };
    const v = ctx && ctx.vivant, pendP = f.pend ? (v && v.cle === 'suit' && fini(v.p) ? v.p : f.pend.p) : NaN, defait = v && v.cle === 'remise';
    const pourLInstant = v && v.cle === 'suit' ? ' (pour l’instant ' + prix(pendP, unite) + ')' : '';
    if (fam === 'extremes') {
      const pts = estTriple(f) ? [f.a, f.b, f.c] : [f.a, f.b], haut = f.sens < 0;
      const ps = pts.map(x => x.p), lo = Math.min(...ps), hi = Math.max(...ps);
      const dates = pts.map(x => q(x.i)).filter(Boolean);
      const vu = 'Le prix a ' + (haut ? 'buté ' : 'rebondi ') + (pts.length === 3 ? 'trois' : 'deux') + ' fois ' + (hi - lo >= 1 ? 'entre ' + chiffres(lo) + ' et ' + prix(hi, unite) : 'vers ' + prix(hi, unite))
        + (dates.length ? ' (' + dates.join(', ') + ', heure de Paris)' : '') + '.';
      if (f.ebauche && !defait) {
        const k = pts.length === 3 ? '3e' : '2e', fin = finMs(ctx, f.pend.conf), d = dici(fin);
        return vu + ' Le ' + k + (haut ? ' sommet' : ' creux') + pourLInstant + ' sera acquis si le prix ' + (haut ? 'ne va pas plus haut' : 'ne va pas plus bas') + (d || ' encore ' + (f.pend.reste > 1 ? f.pend.reste + ' ' + per[3] : per[0])) + '.';
      }
      return vu;
    }
    if (fam === 'ete') {
      const haut = f.sens < 0;
      const vu = 'Trois ' + (haut ? 'sommets' : 'creux') + ', celui du milieu ' + (haut ? 'plus haut' : 'plus bas') + ' (la tête, ' + prix(f.T.p, unite) + ' ' + q(f.T.i) + '), les deux autres à peu près au même niveau (les épaules).';
      if (f.ebauche && !defait) { const fin = finMs(ctx, f.pend.conf); return vu + ' La 2e épaule' + pourLInstant + ' sera acquise si le prix ' + (haut ? 'ne va pas plus haut' : 'ne va pas plus bas') + dici(fin) + '.'; }
      return vu;
    }
    if (fam === 'drapeau') {
      const up = f.sens > 0;
      const vu = 'Après ' + (up ? 'une montée rapide' : 'une descente rapide') + ' de ' + prixRond(f.mat.h, unite) + ' (le mât), le prix fait une pause étroite' + (f.type === 'fanion' ? ' qui se resserre' : '') + '.';
      if (f.ebauche && !defait) return vu + ' Le dernier ' + (f.s > 0 ? 'sommet' : 'creux') + ' de la pause' + pourLInstant + ' n’est pas encore acquis.';
      return vu;
    }
    const nom = NOM_LONG_DEBUTANT[f.type];
    let vu;
    if (f.type === 'range') vu = 'Prix dans un rectangle : il fait des allers-retours entre ' + chiffres(f.bas) + ' et ' + prix(f.haut, unite) + '.';
    else if (/^triangle/.test(f.type)) vu = nom + ' : ses allers-retours se resserrent entre deux droites' + (f.type === 'triangle_ascendant' ? ', le plafond reste plat' : f.type === 'triangle_descendant' ? ', le plancher reste plat' : '') + '.';
    else if (/^biseau/.test(f.type)) vu = nom + ' : ses allers-retours se resserrent entre deux droites qui ' + (f.type === 'biseau_montant' ? 'montent' : 'descendent') + ' toutes les deux.';
    else vu = nom + ' : ses allers-retours restent entre deux droites parallèles qui ' + (f.type === 'canal_montant' ? 'montent' : 'descendent') + '.';
    if (f.ebauche && !defait) vu += ' Le dernier ' + (f.s > 0 ? 'sommet' : 'creux') + pourLInstant + ' n’est pas encore acquis.';
    return vu;
  }
  /** Les niveaux du moment, en mots du Débutant : validation, annulation (ou invalidation), cible
   *  théorique — toujours ensemble. */
  function niveauxDebutant(f, ctx, P, unite) {
    const N = niveauxFigure(f, ctx && fini(ctx.j) ? ctx.j : (ctx && ctx.n) || 0, P), per = periode(ctx && ctx.intervalle), fam = famille(f), out = [];
    const cible = (o, plur) => 'cible' + (plur ? 's' : '') + ' théorique' + (plur ? 's' : '') + ' selon l’usage des analystes : ' + o + ', non garantie' + (plur ? 's' : '');
    const pente = fam === 'lignes' && f.type !== 'range' || fam === 'drapeau' || (fam === 'ete' && f.couL && Math.abs(f.couL.b) > 0);
    const enCeMoment = pente ? ' en ce moment' : '';
    if (N.confirme) {
      const o = N.objectifs[0], iv = N.invals[0];
      out.push('Validée ' + (fini(f.jConf) && heureParis(finMs(ctx, f.jConf)) ? quandDeb(finMs(ctx, f.jConf), ctx) + ' (heure de Paris)' : '') + (f.retest ? ', après un court retour vers la ligne' : '') + '. Si le prix finit ' + per[0] + ' ' + sousSur(iv.s) + prix(iv.p, unite)
        + ', la figure ne tient plus. ' + cible(prix(o.p, unite)).replace(/^c/, 'C') + '.');
      return out.join(' ');
    }
    if (fam === 'extremes' || fam === 'ete' || fam === 'drapeau') {
      const x = N.sorties[0], o = N.objectifs[0], s = x.s;
      const quoi = fam === 'extremes' ? (f.sens < 0 ? 'le creux entre les sommets' : 'le sommet entre les creux') : fam === 'ete' ? 'la ligne qui joint les deux ' + (f.sens < 0 ? 'creux' : 'sommets') : 'le ' + (s > 0 ? 'haut' : 'bas') + ' de la pause';
      const marge = Math.abs(x.seuil - x.ligne) >= 0.5 ? ' (' + quoi + ', ' + prix(x.ligne, unite) + enCeMoment + ', avec une petite marge)' : ' (' + quoi + enCeMoment + ')';
      let t = (f.demi ? 'Il a fini ' + per[0] + ' ' + sousSur(s) + prix(x.seuil, unite) + marge + ' ; s’il finit encore ' + per[0] + ' ' + dessous(s) + ', la figure sera validée. S’il revient tout près de la ligne puis ressort, cela compte aussi ; s’il revient franchement dedans, la sortie ne compte pas.'
        : 'La figure serait validée si le prix finit ' + per[1] + ' de suite ' + sousSur(s) + prix(x.seuil, unite) + marge + '. ' + majuscule(per[0]) + ' ' + dessous(s) + ', puis un court retour vers ce prix et ' + nouvellePer(per) + ' ' + dessous(s) + ', compte aussi.');
      // Une ébauche : UN niveau d'annulation, celui que la machine applique (le plus haut ou le plus
      // bas des bougies, pas leur fin) ; l'extrême et la tête sont l'affaire de ce niveau.
      if (f.ebauche && fini(f.abandonP)) t += ' Annulée si le prix ' + (f.s > 0 ? 'monte au-dessus de ' : 'descend sous ') + prix(f.abandonP, unite) + ', même un instant' + (fam === 'ete' ? ' (plus loin que la tête).' : ' (les ' + (f.s > 0 ? 'sommets' : 'creux') + ' ne seraient plus au même niveau).');
      for (const iv of N.invals) {
        if (f.ebauche && (iv.raison === 'extreme' || iv.raison === 'tete')) continue;
        if (iv.raison === 'recul') t += ' Annulée si le prix finit ' + per[0] + ' ' + sousSur(iv.s) + prix(iv.p, unite) + ' (' + (s > 0 ? 'recul' : 'remontée') + ' de plus de la moitié du mât).';
        else if (iv.raison === 'sortie_contraire') t += ' Annulée aussi si le prix finit ' + per[1] + ' de suite ' + sousSur(iv.s) + prix(iv.p, unite) + '.';
        else t += ' Annulée si le prix finit ' + per[0] + ' ' + sousSur(iv.s) + prix(iv.p, unite) + (iv.raison === 'tete' ? ' (la tête)' : '') + '.';
      }
      t += ' Si elle est validée, ' + cible(prix(o.p, unite)) + '.';
      return t;
    }
    // Deux droites : une sortie d'un côté ou de l'autre.
    const [x1, x2] = N.sorties, o1 = N.objectifs.find(o => o.s === x1.s), o2 = N.objectifs.find(o => o.s === x2.s);
    const hautB = x1.s > 0 ? x1 : x2, basB = x1.s > 0 ? x2 : x1, oH = x1.s > 0 ? o1 : o2, oB = x1.s > 0 ? o2 : o1;
    let t;
    if (f.demi) {
      const x = x1, s = x.s;
      t = 'Le prix vient de sortir ' + (s > 0 ? 'par le haut' : 'par le bas') + ' (il a fini ' + per[0] + ' ' + sousSur(s) + prix(x.seuil, unite) + '). S’il finit encore ' + per[0] + ' dehors, la sortie sera validée. S’il revient tout près de la ligne puis ressort, cela compte aussi ; s’il revient franchement dedans, la sortie ne compte pas.';
      t += ' Si elle est validée, ' + cible(prix((s > 0 ? oH : oB).p, unite)) + '.';
    } else {
      t = 'Une sortie compte quand le prix finit ' + per[1] + ' de suite au-dessus de ' + prix(hautB.seuil, unite) + ' ou sous ' + prix(basB.seuil, unite) + enCeMoment + (pente ? ' (ces droites bougent un peu à chaque ' + per[0].replace(/^une? /, '') + ')' : '')
        + ', ou une fois dehors, puis encore une fois dehors après un court retour. Si elle est validée, ' + cible(prix(oH.p, unite) + ' par le haut, ' + prix(oB.p, unite) + ' par le bas', true) + '.';
      if (fini(N.pointe)) { const ms = finMs(ctx, Math.floor(N.pointe)); t += ' Sans sortie avant la pointe' + (fini(ms) && heureParis(ms) ? ' (vers ' + quandParis(ms, ctx && ctx.maintenant) + ')' : '') + ', elle s’arrête sans suite.'; }
    }
    if (f.ebauche) t += ' Elle est annulée si le prochain ' + (f.s > 0 ? 'sommet' : 'creux') + ' s’écarte de sa droite.';
    return t;
  }
  /** La définition d'une figure (bulle Débutant d'une figure validée ou tombée) : ce qu'on voit,
   *  jamais un sens attendu. */
  const DEFINITION_FORME = {
    double_sommet: 'Double sommet : le prix a buté deux fois sur le même plafond, puis il est passé sous le creux entre les deux.',
    double_creux: 'Double creux : le prix a buté deux fois sur le même plancher, puis il est passé au-dessus du sommet entre les deux.',
    triple_sommet: 'Triple sommet : le prix a buté trois fois sur le même plafond, puis il est passé sous les creux entre eux.',
    triple_creux: 'Triple creux : le prix a buté trois fois sur le même plancher, puis il est passé au-dessus des sommets entre eux.',
    ete: 'Tête-épaules : trois sommets, celui du milieu plus haut, puis le prix est passé sous la ligne qui joint les deux creux.',
    ete_inverse: 'Tête-épaules à l’envers : trois creux, celui du milieu plus bas, puis le prix est passé au-dessus de la ligne qui joint les deux sommets.',
    range: 'Rectangle : le prix a fait des allers-retours entre un plafond et un plancher, puis il en est sorti.',
    triangle_ascendant: 'Triangle à plafond plat : sous un plafond plat, les creux remontaient ; puis le prix en est sorti.',
    triangle_descendant: 'Triangle à plancher plat : sur un plancher plat, les sommets descendaient ; puis le prix en est sorti.',
    triangle_symetrique: 'Triangle qui se resserre : les sommets descendaient, les creux remontaient ; puis le prix en est sorti.',
    biseau_montant: 'Biseau qui monte : deux droites qui montent et se rapprochent ; puis le prix en est sorti.',
    biseau_descendant: 'Biseau qui descend : deux droites qui descendent et se rapprochent ; puis le prix en est sorti.',
    canal_montant: 'Canal qui monte : le prix allait et venait entre deux droites parallèles qui montent ; puis il en est sorti.',
    canal_descendant: 'Canal qui descend : le prix allait et venait entre deux droites parallèles qui descendent ; puis il en est sorti.',
    drapeau: 'Drapeau : un mouvement rapide (le mât), une pause étroite, puis le prix est sorti de la pause dans le sens du mât.',
    fanion: 'Fanion : un mouvement rapide (le mât), une pause qui se resserre, puis le prix est sorti de la pause dans le sens du mât.',
  };
  /** La comparaison au repère sans forme, en mots (mesuré, avec son nombre de cas). */
  function texteEcart(b) {
    const finis = b.atteints + b.invalides + b.expires;
    switch (b.ecart) {
      case 'pareil': return 'Sur ce graphique, cette cible n’a pas été atteinte plus souvent qu’un trajet de même taille pris à n’importe quel moment (mesuré, ' + finis + ' cas).';
      case 'plus': return 'Sur ce graphique, cette cible a été atteinte plus souvent qu’un trajet de même taille pris à n’importe quel moment (mesuré, ' + finis + ' cas).';
      case 'moins': return 'Sur ce graphique, cette cible a été atteinte moins souvent qu’un trajet de même taille pris à n’importe quel moment (mesuré, ' + finis + ' cas).';
      default: return 'Trop peu de cas pour comparer à un trajet quelconque.';
    }
  }
  /** Le bilan mesuré en mots du Débutant : au plus DEUX comptes. Une ébauche : combien de débuts
   *  comme celui-ci, combien sont devenus la figure. Une figure : combien de figures de ce type,
   *  combien de fois la cible a été atteinte. Jamais « confirmées » ni le partage ↑/↓ pour les
   *  figures à deux droites (il se lirait comme une probabilité de sens). */
  function bilanDebutant(f, b, ctx, P) {
    if (!b) return '';
    const d = dernieres(ctx && ctx.duree), sur = 'Mesuré sur les ' + (d || 'données') + ' de ce graphique : ', noms = NOMS_FORMES[f.type], fam = famille(f);
    const nomP = NOM_FORME_DEBUTANT[f.type] === 'Tête-épaules' ? 'tête-épaules' : minuscule(noms[1]).replace(/ (ascendants|descendants|symétriques|montants|descendants|inversés)$/, '');
    if (f.ebauche) {
      const E = b.ebauches || { n: 0, devenues: 0 };
      return sur + E.n + (E.n > 1 ? ' débuts comme celui-ci, ' : ' début comme celui-ci, ') + E.devenues + (E.devenues > 1 ? ' sont devenus ' : ' est devenu ') + noms[2] + '.'
        + (E.n < P.echantillonFaible ? ' Trop peu de cas pour en tirer une règle.' : '');
    }
    const finis = b.atteints + b.invalides + b.expires;
    const nomL = fam === 'lignes' || fam === 'drapeau' ? NOM_LONG_DEBUTANT[f.type].toLowerCase() : nomP;
    let t = sur + b.formes + ' ' + (fam === 'lignes' ? (b.formes > 1 ? 'figures « ' + nomL + ' »' : 'figure « ' + nomL + ' »') : (b.formes > 1 ? (fam === 'drapeau' ? minuscule(noms[1]) : nomL) + ' repérés' : minuscule(noms[0]) + ' repéré'))
      + (finis ? (fam === 'lignes' || fam === 'drapeau' ? ' ; après leur sortie, cible atteinte ' : ' ; une fois validés, cible atteinte ') + b.atteints + ' fois sur ' + finis + '.' : ' ; aucune n’est encore allée au bout.');
    return t + ' ' + texteEcart(b);
  }
  /** La bulle d'une figure en Débutant : ce qu'on voit et ce qui manque, les niveaux du moment
   *  (validation, annulation, cible), le bilan mesuré, l'avertissement. ctx : voir plus haut. */
  function texteFormeDebutant(f, b, ctx, P, unite) {
    const e = etatForme(f), out = [], c = Object.assign({}, ctx || {});
    if (!c.intervalle && c.itv) c.intervalle = c.itv;
    if (['ebauche', 'formation', 'dedans', 'demi'].includes(e.cle)) {
      const vu = vuDebutant(f, c, unite);
      out.push(famille(f) === 'lignes' ? vu : libelleFormeDebutant(f) + ' : ' + minuscule(vu));
      // Lignes redessinées depuis la dernière clôture : dit pendant une bougie.
      const rec = (f.journal || []).filter(x => x.quoi === 'recalage').pop();
      if (rec && fini(c.n) && c.n - 1 - rec.j <= 1) out.push('Lignes redessinées ' + quandDeb(finMs(c, rec.j), c) + ' : un nouveau point touche ' + (rec.cote === 'bas' ? 'la ligne du bas' : rec.cote === 'epaule' ? 'l’épaule droite' : 'la ligne du haut') + '.');
      // L'ébauche se défait (le prix live a passé son niveau d'annulation) : la tête de bulle le dit,
      // aucun niveau de validation n'est plus promis.
      if (!(c.vivant && c.vivant.cle === 'remise')) out.push(niveauxDebutant(f, c, P, unite));
    } else {
      let def = DEFINITION_FORME[f.type] || '';
      const cote = famille(f) === 'lignes';
      if (f.ebauche && e.cle === 'abandon') def = NOM_LONG_DEBUTANT[f.type] + ' possible : l’ébauche ne s’est pas formée.';
      // Tombée avant sa validation : la définition s'arrête avant « puis … sorti » (ce n'est pas arrivé).
      else if (def && f.jConf == null) def = def.replace(/\s*[,;]\s*puis .*$/, '') + ' ; la figure est tombée avant d’être validée.';
      // Sortie validée : le côté, en mots.
      else if (cote && fini(f.sens)) def = def.replace(/en est sorti\./, 'en est sorti ' + (f.sens > 0 ? 'par le haut' : 'par le bas') + '.');
      if (e.cle === 'confirme') {
        out.push(def);
        if (f.ebauche && f.pend) { const d = quandDeb(finMs(c, f.pend.conf), c); out.push('Le dernier ' + (f.s > 0 ? 'sommet' : 'creux') + ' n’est pas encore acquis' + (d ? ' (' + d.replace(/^à /, 'jusqu’à ') + ')' : '') + '.'); }
        out.push(niveauxDebutant(f, c, P, unite));
      } else out.push(def.replace(/\.$/, '') + '.', marqueFin(f, c, 'debutant', unite));
      // La cible : dite seulement quand elle a été atteinte (une figure tombée n'en a plus).
      if (e.cle === 'atteint' && fini(f.objectif)) out.push('Cible théorique selon l’usage des analystes : ' + prix(f.objectif, unite) + ', non garantie ; elle a été atteinte.');
    }
    if (b) out.push(bilanDebutant(f, b, c, P));
    out.push('Une lecture débattue, pas une prévision ni un conseil.');
    return out.filter(Boolean);
  }
  /** L'état vivant en mots, en tête de bulle (calque) : seule la fin de la bougie compte. Le prix
   *  live et le plus haut (plus bas) de la bougie en cours sont dits chacun pour lui. */
  function texteVivantFigure(f, v, ctx, mode, unite) {
    if (!v || (!v.cle && !v.etiq) || v.cle === 'suit') return '';
    const exp = mode === 'expert', per = periode(ctx && ctx.intervalle), fin = finMs(ctx, ctx && fini(ctx.j) ? ctx.j : 0);
    const hd = fini(fin) && heureParis(fin) ? quandDeb(fin, ctx) : null, he = fini(fin) ? heureCourteUTC(fin, ctx) : '';
    const P0 = prix(v.p, unite), deux = v.clotures === 2, n1 = (v.contre || 0) + 1;
    // Rien au-delà maintenant, mais la bougie y est allée (le libellé le garde jusqu'à la clôture).
    if (!v.cle && v.etiq === 'menace') {
      const iv = (v.niveaux && v.niveaux.invals || []).find(x => !(f.ebauche && (x.raison === 'extreme' || x.raison === 'tete'))) || null;
      const Pi = iv ? prix(iv.p, unite) : '';
      return exp ? 'Maintenant : invalidation (' + Pi + ') touchée en cours de bougie, prix revenu · jugé à la clôture (' + he + ').'
        : 'Pendant ' + per[2] + ', le prix est allé ' + (iv ? sousSur(iv.s) + Pi : 'au-delà du niveau') + ', le niveau qui annule la figure, puis il est revenu : cela ne compte pas ; seule la fin ' + duPer(per) + (hd ? ' (' + hd + ')' : '') + ' compte.';
    }
    if (!v.cle) return '';
    if (exp) {
      return 'Maintenant : ' + ({ franchi: 'au-delà de ' + P0 + ' · à confirmer à la fin de la bougie (' + he + ')', meche: 'percé en mèche (bougie en cours) au-delà de ' + P0 + ', revenu dedans · à confirmer',
        meche_close: 'percé en mèche sur une bougie close (' + P0 + '), pas validé',
        menace: 'au-delà de l’invalidation (' + P0 + ')' + (deux ? ', 2 clôtures de suite nécessaires (ce serait la ' + (n1 === 1 ? '1re' : n1 + 'e') + ')' : '') + ', jugé à la fin de la bougie (' + he + ')',
        cible: 'objectif touché en cours de bougie (' + P0 + '), à confirmer à la clôture',
        remise: 'ébauche remise en cause : ' + (v.s > 0 ? 'plus haut' : 'plus bas') + ' de la bougie ' + prix(v.ext, unite) + (v.s > 0 ? ' > ' : ' < ') + P0 + ' (abandon) ; annulée à la clôture (' + he + ') même si le prix revient (prix ' + prix(ctx && fini(ctx.live) ? ctx.live : v.ext, unite) + ')' })[v.cle] + '.';
    }
    const fn = hd ? ' (' + hd + ')' : '';
    switch (v.cle) {
      case 'franchi': return 'En ce moment le prix est ' + sousSur(v.s) + P0 + '. Si ' + per[2] + ' finit ' + dessous(v.s) + fn + ', ce sera ' + (f.demi && (f.demiSens == null || f.demiSens === v.s) ? 'la 2e fin ' + dePer(per) + ' ' + dessous(v.s) + ' : la figure sera validée.' : 'la 1re fin ' + dePer(per) + ' ' + dessous(v.s) + ' sur les 2 qu’il faut.');
      case 'meche': return 'Le prix est passé ' + sousSur(v.s) + P0 + ' puis il est revenu. Cela ne compte pas : seule la fin ' + duPer(per) + fn + ' compte.';
      case 'meche_close': return 'Le prix est passé ' + sousSur(v.s) + P0 + ' un instant, puis il est revenu avant la fin ' + duPer(per) + ' : cela ne valide rien.';
      case 'menace': return 'En ce moment le prix est ' + sousSur(v.s) + P0 + ', le niveau qui annule la figure. ' + (deux
        ? 'Il faut ' + per[1] + ' de suite ' + dessous(v.s) + ' : si ' + per[2] + ' finit ' + dessous(v.s) + fn + ', ce sera la ' + (n1 === 1 ? '1re' : n1 + 'e') + '.'
        : 'Cela ne compte que si ' + per[2] + ' finit ' + dessous(v.s) + fn + '.');
      case 'cible': return 'Le prix touche en ce moment la cible théorique (' + P0 + '). Cela compte seulement si ' + per[2] + ' finit au-delà' + fn + '.';
      case 'remise': {
        const live = ctx && fini(ctx.live) ? ctx.live : null, haut = v.s > 0;
        return 'Le plus ' + (haut ? 'haut' : 'bas') + ' de ' + per[2] + ' (' + prix(v.ext, unite) + ') est passé ' + (haut ? 'au-dessus de ' : 'sous ') + P0 + ' : '
          + (famille(f) === 'ete' ? 'plus loin que la tête' : 'les ' + (f.s > 0 ? 'sommets' : 'creux') + ' ne sont plus au même niveau') + '. À la fin ' + duPer(per) + fn + ', la figure possible sera annulée, même si le prix ' + (haut ? 'redescend' : 'remonte')
          + (live !== null ? ' (il est à ' + prix(live, unite) + ')' : '') + '.';
      }
      default: return '';
    }
  }
  /** La règle d'un type, en Expert (« Règle (seuils de convention) : … »), avec les seuils lus dans P. */
  function regleExpert(f, P, unite) {
    const fam = famille(f), Q = P.lignes, Dp = P.drapeau, E = P.ete, nf = x => nombre(x, x % 1 ? (x * 10 % 1 ? 2 : 1) : 0), pc = x => nombre(x * 100, 0) + ' %';
    if (fam === 'extremes') {
      const s = f.sens < 0 ? 'sommets' : 'creux', o = f.sens < 0 ? 'bas' : 'haut';
      return estTriple(f)
        ? 'Trois ' + s + ' à moins de ' + nf(P.tolAtr) + ' ATR (' + P.ecartMin + ' à ' + P.ecartMax + ' bougies entre deux, ' + P.tripleMax + ' au plus en tout, écarts réguliers à ' + nf(P.tripleRegulier) + ' près), deux ' + (f.sens < 0 ? 'creux' : 'sommets') + ' marqués (≥ ' + nf(P.tripleCreux) + ' × hauteur) ; ligne de cou ' + prix(f.niveau, unite) + ', au moins ' + nf(P.hauteurMinAtr) + ' ATR plus ' + o + '.'
        : 'Deux ' + s + ' à moins de ' + nf(P.tolAtr) + ' ATR, séparés de ' + P.ecartMin + ' à ' + P.ecartMax + ' bougies ; ligne de cou ' + prix(f.niveau, unite) + ', au moins ' + nf(P.hauteurMinAtr) + ' ATR plus ' + o + '.';
    }
    if (fam === 'ete') return 'Tête au-delà des épaules d’au moins ' + nf(E.teteAtr) + ' ATR et ' + nf(E.teteH) + ' × h ; épaules à moins de ' + nf(E.epaulesAtr) + ' ATR et ' + nf(E.epaulesH) + ' × h l’une de l’autre ; ligne de cou par les deux ' + (f.sens < 0 ? 'creux' : 'sommets') + ' (pente ≤ ' + nf(E.couPente) + ' × h), h = ' + prix(f.hauteur, unite)
      + ' ; jambes ≥ ' + E.jambeMin + ' bougies ; tendance d’avant ≥ ' + nf(E.tendanceH) + ' × h ; ' + E.min + ' à ' + E.max + ' bougies.';
    if (fam === 'drapeau') return 'Mât de ' + prix(f.mat.h, unite) + ' (≥ ' + nf(Dp.matAtr) + ' ATR en ' + Dp.matMin + ' à ' + Dp.matMax + ' bougies), pause de ' + Dp.pauseMin + ' à ' + Dp.pauseMax + ' bougies, recul ≤ ' + nf(Dp.retrait) + ' × mât, largeur ≤ ' + nf(Dp.largeur) + ' × mât, pas plus de ' + nf(Dp.pente)
      + ' × mât dans le sens du mât ; fanion si les droites se resserrent d’au moins ' + pc(P.triConvergence) + ', drapeau sinon (jusqu’à ' + pc(Dp.paralleleMax) + ' d’écartement).';
    if (f.type === 'range') return '≥ 2 contacts par côté (± ' + nf(P.tolAtr) + ' ATR), ≥ ' + P.rangeMin + ' bougies, hauteur ≤ ' + nf(P.rangeHauteurAtr) + ' ATR : ' + chiffres(f.bas) + ' – ' + prix(f.haut, unite) + '.';
    const nh = f.pivotsH ? f.pivotsH.length : 0, nb = f.pivotsB ? f.pivotsB.length : 0;
    return 'Régressions sur ' + nh + ' sommets et ' + nb + ' creux (chacun à ≤ ' + nf(Q.tolAtr) + ' ATR de sa droite), ' + Q.min + ' à ' + Q.fenetre + ' bougies, chaque droite sur ≥ ' + pc(Q.etalement) + ' de la figure ; plat = < ' + nf(Q.platAtr) + ' ATR et < ' + pc(Q.platW0) + ' de la largeur'
      + (/^canal/.test(f.type) ? ' ; parallèles à ' + pc(Q.paralleleMax) + ' près, pente ≥ ' + nf(Q.penteCanalAtr) + ' ATR, largeur ≤ ' + nf(Q.canalLargeurMaxAtr) + ' ATR' : ' ; resserrement ≥ ' + pc(/^biseau/.test(f.type) ? Q.biseauConvergence : P.triConvergence) + ', repéré avant ' + pc(Q.avancementMax) + ' du chemin vers la pointe') + '.';
  }
  /** Les niveaux du moment en Expert (« Maintenant : validation = … · invalidation = … · objectif… »). */
  function niveauxExpert(f, ctx, P, unite) {
    const j = ctx && fini(ctx.j) ? ctx.j : (ctx && ctx.n) || 0, N = niveauxFigure(f, j, P), itv = nomIntervalle(ctx && ctx.intervalle), b = bandeSortie(f);
    const obj = o => prix(o.p, unite);
    if (N.confirme) return 'Maintenant : invalidation = clôture ' + itv + (N.invals[0].s > 0 ? ' > ' : ' < ') + prix(N.invals[0].p, unite) + ' · objectif théorique (convention, non garanti) : ' + obj(N.objectifs[0]) + ' · horizon ' + P.horizon + ' bougies.';
    const sorties = N.sorties.map(x => '2 clôtures ' + itv + (x.s > 0 ? ' > ' : ' < ') + prix(x.seuil, unite) + (b ? ' (ligne ' + prix(x.ligne, unite) + ' ' + (x.s > 0 ? '+' : '−') + ' bande ' + prixRond(b, unite) + ')' : '')).join(' ou ');
    const invals = N.invals.filter(iv => !(f.ebauche && (iv.raison === 'extreme' || iv.raison === 'tete'))).map(iv => (iv.clotures === 2 ? '2 clôtures' : 'clôture') + (iv.s > 0 ? ' > ' : ' < ') + prix(iv.p, unite) + ' (' + { extreme: 'extrême', tete: 'tête', recul: 'recul > ' + nombre(P.drapeau.retrait * 100, 0) + ' % du mât', sortie_contraire: 'sortie contraire' }[iv.raison] + ')');
    const ab = f.ebauche && fini(f.abandonP) ? ' · abandon de l’ébauche = ' + (f.s > 0 ? 'plus haut > ' : 'plus bas < ') + prix(f.abandonP, unite) + (famille(f) === 'ete' ? ' (la tête)' : ' (autres ' + (f.s > 0 ? 'sommets' : 'creux') + ' ' + (f.s > 0 ? '+' : '−') + ' tol. ' + prixRond(f.tol, unite) + ', figée)') + ', jugé sur l’extrême de la bougie, pas la clôture' : '';
    const objs = N.objectifs.map(o => (N.objectifs.length > 1 ? (o.s > 0 ? '↑ ' : '↓ ') : '') + obj(o)).join(' / ');
    const base = famille(f) === 'drapeau' ? 'mât reporté' : famille(f) === 'lignes' ? 'largeur ' + prix(f.hauteur, unite) + ' reportée' : 'hauteur ' + prix(f.hauteur, unite) + ' reportée';
    return 'Maintenant : validation = ' + sorties + ' (ou 1 clôture + retour réussi, ≤ ' + P.retourMax + ')' + (invals.length ? ' · invalidation = ' + invals.join(' ou ') : '') + ab
      + (fini(N.pointe) ? ' · pointe à ' + heureCourteUTC(finMs(ctx, Math.floor(N.pointe)), ctx) + ' (sans sortie : sans suite)' : '') + ' · objectif théorique (convention, non garanti) : ' + objs + ' (' + base + ').';
  }
  const QUOI_JOURNAL = { repere: 'repéré', ebauche: 'ébauche', suivi: 'point en attente déplacé', recalage: 'recalé', demi: 'sortie 1/2', retour: 'retour', sortie_annulee: 'sortie non confirmée',
    confirme: 'confirmé', atteint: 'objectif atteint', invalide: '✗ invalidé', invalide_avant: '✗ invalidé', expire_avant: 'sans suite', expire: 'délai écoulé', devenu_triple: 'devenu un triple' };
  /** Le journal d'une figure (Expert) : « Observé : 23:45 repéré · 01:15 sortie 1/2 · … ». */
  function texteJournal(f, ctx, unite) {
    const J = (f.journal || []).filter(x => QUOI_JOURNAL[x.quoi]);
    if (!J.length) return '';
    // L'heure UTC seule le même jour ; la date (jj/mm) à chaque changement de jour, ou partout sur
    // des bougies de 4 h et plus (un jour : la date seule).
    const J8 = J.slice(-8), plusieurs = new Set(J8.map(x => fini(finMs(ctx, x.j)) ? dateUTC(finMs(ctx, x.j)) : '')).size > 1;
    let jourPrec = null;
    const quand = ms => {
      if (!fini(ms)) return '—';
      if (ctx && ctx.pas >= 86400) return dateUTC(ms);
      const d = dateUTC(ms), montre = (ctx && ctx.pas >= 4 * 3600) || (jourPrec === null ? plusieurs || avecDate(ms, ctx) : d !== jourPrec);
      jourPrec = d;
      return (montre ? d + ' ' : '') + heureUTC(ms);
    };
    const parts = J8.map(x => quand(finMs(ctx, x.j)) + ' ' + QUOI_JOURNAL[x.quoi]
      + (x.quoi === 'repere' && x.triple ? ' (3e ' + (/creux/.test(f.type) ? 'creux' : 'sommet') + ' : le double devient un triple)' : '')
      + (x.quoi === 'recalage' && x.apres ? ' (bornes ' + chiffres(x.avant[0]) + ' / ' + chiffres(x.avant[1]) + ' → ' + chiffres(x.apres[0]) + ' / ' + chiffres(x.apres[1]) + ')' : '')
      + ((x.quoi === 'demi' || x.quoi === 'confirme' || x.quoi === 'invalide' || x.quoi === 'invalide_avant' || x.quoi === 'atteint') && fini(x.c) ? ' (clôture ' + prix(x.c, unite) + ')' : ''));
    return 'Observé (' + (ctx && ctx.pas >= 86400 ? 'dates UTC' : 'heures UTC') + ', fin de bougie) : ' + (J.length > 8 ? '… · ' : '') + parts.join(' · ') + '.';
  }
  /** La lecture classique (débattue) d'un type, à côté du partage mesuré des sorties (Expert). */
  const CLASSIQUE = { biseau_montant: 'sortie par le bas', biseau_descendant: 'sortie par le haut', drapeau: 'sortie dans le sens du mât', fanion: 'sortie dans le sens du mât',
    ete: 'sortie par le bas', ete_inverse: 'sortie par le haut' };
  /** La bulle Expert d'une figure : règle, niveaux du moment, bilan, journal, invalidées récemment,
   *  lectures concurrentes, avertissement. extra = { concurrentes: [figures], tombees: [figures] }. */
  function texteFormeExpert(f, b, ctx, P, unite, extra) {
    const x = extra || {}, out = [], itv = nomIntervalle(ctx && ctx.intervalle);
    out.push('Règle (seuils de convention) : ' + regleExpert(f, P, unite) + ' Détection mécanique sur les bougies ' + itv + ' closes (pivots : ' + P.pivot + ' bougies de chaque côté).'
      + (f.ebauche ? ' Ébauche : le dernier ' + (f.s > 0 ? 'sommet' : 'creux') + ' (' + prix(f.pend.p, unite) + ') est en attente, il manque ' + f.pend.reste + ' bougie' + (f.pend.reste > 1 ? 's' : '') + ' ' + itv + ' pour le confirmer.' : ''));
    if (!f.fin) out.push(niveauxExpert(f, ctx, P, unite));
    else out.push(marqueFin(f, ctx, 'expert', unite).replace(/^./, c => c.toUpperCase()) + '.' + (fini(f.objectif) && f.fin !== 'abandon' ? (f.fin === 'atteint' ? ' Objectif théorique (convention, non garanti) : ' : ' Objectif (caduc) : ') + prix(f.objectif, unite) + '.' : ''));
    if (b) {
      let t = texteBilan(b, ctx, P, 'expert');
      if (CLASSIQUE[f.type]) t += ' · lecture classique (débattue) : ' + CLASSIQUE[f.type] + ' ; ici, mesuré : ↑ ' + b.haut + ' / ↓ ' + b.bas + ' sur ' + (b.haut + b.bas);
      out.push(t + '.');
    }
    const J = texteJournal(f, ctx, unite);
    if (J) out.push(J);
    const tb = (x.tombees || []).filter(g => g !== f);
    if (tb.length) out.push('Invalidées récemment (ce graphique) : ' + tb.map(g => NOMS_FORMES[g.type][0] + (g.ebauche ? ' (ébauche)' : '') + ' ' + marqueFin(g, ctx, 'expert', unite).replace(/^✗ (ébauche )?/, '')).join(' ; ') + '.');
    if (x.concurrentes && x.concurrentes.length) out.push('Raisonnement : lecture concurrente sur le même ' + (f.s > 0 || f.sens < 0 ? 'sommet' : 'point') + ' : ' + x.concurrentes.map(g => NOMS_FORMES[g.type][0].toLowerCase() + ' (' + etatForme(g).court + ')').join(', ') + ' ; une seule est montrée.');
    out.push('Lecture des formes : débattue ; une description, pas une recommandation.');
    return out;
  }
  /** Le titre de la bulle d'une figure. */
  function titreForme(f, mode, ctx) {
    if (mode === 'expert') return NOMS_FORMES[f.type][0] + ' — ' + (f.ebauche && !f.fin ? 'ébauche (dernier ' + (f.s > 0 ? 'sommet' : 'creux') + ' en attente : ' + f.pend.reste + ' bougie' + (f.pend.reste > 1 ? 's' : '') + ' ' + nomIntervalle(ctx && ctx.intervalle) + ')' : etatForme(f).texte);
    const e = etatForme(f), nom = NOM_LONG_DEBUTANT[f.type];
    return ({ ebauche: nom + ' possible', formation: nom + ' possible', dedans: nom, demi: nom + ' : sortie à confirmer', confirme: ['lignes', 'drapeau'].includes(famille(f)) ? nom + ' : sortie validée' : nom + ' confirmé', invalide: '✗ ' + nom + ' invalidé',
      abandon: '✗ ' + nom + ' annulé', sans_suite: nom + ' sans suite', atteint: nom + ' : cible théorique atteinte', oublie: nom + ' : délai écoulé' })[e.cle] || nom;
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
    prixR, tagLu, artLu, quoi, bord, etatFerme, etatLive, texteEtatLive, texteEtatMax, MOTS, centile, regime, texteRegime, pivots, regression, regressionParallele,
    detecter, bilan, formesAffichees, formesDebutant, idFigure, etatForme, NOMS_FORMES, texteBilan, suite, texteSuite, VARIANTES_SUITE, tagMicro, deArt, decrire, decrireCompact, lecture, VARIANTES_LECTURE, phraseForme, TYPES, bornes,
    FAMILLES, famille, groupeVue, enAttente, candidats, avancer, niveauxFigure, figureVivante, cleFigure, niveauAbandon, wilson, ecartTemoin, dernierPoint, rangFigure, concurrentes, tombees, phaseA, classer, deuxDroites, ete, drapeau, tripleExtreme, doubleExtreme, range, ligne,
    NOMS_DEBUTANT, raisonPrincipale, choixDebutant, reperesDe, choisirReperes, VERBE_DEBUTANT, optionsSeules, libelleDebutant, libellesDebutant, formatDebutant, AVEC_POINT, titreDebutant, nomDebutant, nomPhrase, HORIZON_DEBUTANT, HORIZON_COURT, PERIODE_DEBUTANT, phrasesDebutant, phraseDebutant,
    texteSuiteDebutant, prixRond, ETATS_DEBUTANT, texteEtatDebutant, origineDebutant, ageDebutant, heureParis, dernieres, environ, libelleFormeDebutant, texteFormeDebutant, texteEnCoursDebutant: (f, e, unite, itv) => texteFormeDebutant(f, null, { intervalle: itv }, null, unite).slice(0, -1).join(' '),
    NOM_FORME_DEBUTANT, NOM_LONG_DEBUTANT, LIBELLES_VIVANTS, libelleVivantDebutant, libellesPossiblesDebutant, libellesFormeExpert, texteFormeExpert, texteVivantFigure, titreForme, marqueFin, DEFINITION_FORME, bilanDebutant, texteEcart, quandParis,
    MOTS_BANNIS_DEBUTANT, motsBannis, EXPLIQUES_DEBUTANT };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Guide;
