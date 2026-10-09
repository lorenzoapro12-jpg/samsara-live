// ═══════════════════════════════════════════════════════════════════════════════
// SCÉNARIOS DU MATIN — l'analyse de 07h00 (Claude, une IA), dessinée sur le graphique.
// ─────────────────────────────────────────────────────────────────────────────
// La routine du matin publie previsions.json (format « previsions-1 ») sur la branche
// `previsions` du dépôt : trois scénarios CLASSÉS du plus au moins probable, SANS pourcentage,
// chacun fait de niveaux à l'origine nommée, lus avec une marge (zone = niveau ± marge %).
// Le journal (noter.py) les note mécaniquement le lendemain : c'est la SEULE note officielle.
//
// Ce cœur PUR (testé hors ligne : tests/test_scenarios.js) :
//   1. LIT le fichier : valide son format, ses dates, ses niveaux ; un fichier illisible est dit
//      illisible, un fichier d'attente dit sa note — rien n'est inventé.
//   2. SUIT chaque scénario EN DIRECT sur les bougies du graphique ouvertes depuis le point
//      (même règle que noter.py : une bougie dont [bas, haut] recoupe une zone la touche ; deux
//      zones dans la même bougie = « même bougie, ordre inconnu »). C'est un AFFICHAGE, jamais
//      une note : dès que le fichier donne un statut résolu, c'est lui qui est montré.
//   3. ÉCRIT les mots : libellés, lignes de l'encadré, explication au survol.
//
// Règles du propriétaire (choix « 1B », 08/10/2026) : aucun pourcentage en mode débutant ; la
// base « hasard pur (modèle), pas une estimation » n'apparaît qu'en mode expert, avec ces mots ;
// le seul chiffre de réussite montré est l'ordre du premier mouvement (bilan.ordre), avec
// « échantillon faible » sous P.echantillonFaible matins.
// Les phrases DÉCRIVENT : aucune ne dit d'acheter ou de vendre.
// Tous les nombres viennent de P = PARAM.scenarios (js/app.js).
// ═══════════════════════════════════════════════════════════════════════════════
const Scenarios = (function () {
  'use strict';
  const FORMAT = 'previsions-1';
  const RANGS = ['1', '2', '3', 'S'];
  const fini = x => typeof x === 'number' && isFinite(x);
  // Les libellés du journal, si un fichier ancien n'apporte pas les siens.
  const STATUTS = { '⏳': 'en cours', '✅': 'réalisé', '❌': 'invalidé d’abord', '◐': 'partiel', '⌛': 'rien de touché', '⚠': 'ambigu' };

  // ─── Formats ───
  function chiffres(v) {
    if (!fini(v)) return '—';
    const d = Math.abs(v) >= 1000 ? 0 : 2;
    return v.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: d }).replace(/[\u00a0\u202f]/g, ' ');
  }
  const prix = v => (fini(v) ? chiffres(v) + ' $' : '—');
  const nb = v => String(v).replace('.', ',');
  const heureUTC = ms => (fini(ms) ? new Date(ms).toISOString().slice(11, 16) : '—');
  let FMT_PARIS = null;
  try { FMT_PARIS = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); } catch (e) { FMT_PARIS = null; }
  /** « 06h40 » (heure de Paris) ; null si le navigateur ne connaît pas le fuseau. */
  function heureParis(ms) {
    if (!fini(ms) || !FMT_PARIS) return null;
    const p = {};
    for (const x of FMT_PARIS.formatToParts(new Date(ms))) p[x.type] = x.value;
    return p.hour + 'h' + p.minute;
  }
  /** « 2026-10-09 » → « 09/10 ». */
  const jourGroupe = g => (/^\d{4}-\d{2}-\d{2}$/.test(g || '') ? g.slice(8, 10) + '/' + g.slice(5, 7) : String(g || '—'));
  /** « 2026-10-09T04:40Z » (ou une date ISO complète) → ms ; NaN si illisible. */
  function dateUTC(s) {
    if (typeof s !== 'string') return NaN;
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?Z$/.exec(s.trim());
    if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0));
    const t = Date.parse(s);
    return isFinite(t) && /[zZ]|[+-]\d{2}:?\d{2}$/.test(s) ? t : NaN;
  }
  /** Zone d'un niveau : [niveau × (1 − m), niveau × (1 + m)] (zone() de noter.py). */
  const zone = (niveau, margePct) => [niveau * (1 - margePct / 100), niveau * (1 + margePct / 100)];
  const ordinal = k => (k === 1 ? '1re' : k + 'e');
  /** Un niveau venu d'un modèle d'options (murs de calls ou de puts, zéro gamma) le dit : « (modèle) ». */
  const modele = o => (/\b(calls?|puts?|gamma|options?)\b/i.test(o) && !/modèle/i.test(o) ? o + ' (modèle)' : o);

  // ─── 1. Lecture du fichier ─────────────────────────────────────────────────
  /** Un scénario du fichier → objet propre, ou null s'il n'est pas utilisable (dates, niveaux). */
  function scenario(x, margeDefaut) {
    if (!x || typeof x !== 'object') return null;
    const rang = String(x.rang == null ? '' : x.rang);
    if (!RANGS.includes(rang)) return null;
    const emis = dateUTC(x.emis_utc), fin = dateUTC(x.fin_utc);
    if (!fini(emis) || !fini(fin) || fin <= emis) return null;
    const marge = fini(x.marge_pct) && x.marge_pct > 0 ? x.marge_pct : margeDefaut;
    if (!fini(marge) || marge <= 0) return null;
    const forme = x.forme === 'range' ? 'range' : x.forme === 'chemin' ? 'chemin' : null;
    if (!forme) return null;
    let cibles = [], inv = null, bornes = null;
    if (forme === 'chemin') {
      cibles = Array.isArray(x.cibles) ? x.cibles : [];
      if (!cibles.length || !cibles.every(v => fini(v) && v > 0)) return null;
      inv = fini(x.invalidation) && x.invalidation > 0 ? x.invalidation : null;
    } else {
      bornes = Array.isArray(x.range) ? x.range : null;
      if (!bornes || bornes.length !== 2 || !bornes.every(v => fini(v) && v > 0) || !(bornes[0] < bornes[1])) return null;
    }
    const origines = {};
    if (x.origines && typeof x.origines === 'object') for (const [k, v] of Object.entries(x.origines)) if (typeof v === 'string' && v.trim()) origines[k] = modele(v.trim());
    const statut = typeof x.statut === 'string' && x.statut in STATUTS ? x.statut : '⏳';
    return {
      id: String(x.id || rang + '@' + x.emis_utc), rang, groupe: typeof x.groupe === 'string' ? x.groupe : null, emis, fin,
      horizon: fini(x.horizon_h) ? x.horizon_h : (fin - emis) / 3600000, prixEmission: fini(x.prix_emission) ? x.prix_emission : null,
      forme, cibles: cibles.slice(), invalidation: inv, range: bornes ? bornes.slice() : null, marge,
      etiquettes: Array.isArray(x.etiquettes) ? x.etiquettes.filter(e => typeof e === 'string') : [], origines,
      enonce: typeof x.enonce === 'string' && x.enonce.trim() ? x.enonce.trim() : null,
      version: typeof x.version_methode === 'string' ? x.version_methode : null,
      baseHasard: fini(x.base_hasard_pct) ? x.base_hasard_pct : null,
      statut, premierOk: typeof x.premier_ok === 'string' ? x.premier_ok : null,
      resolu: dateUTC(x.resolu_utc), note: typeof x.note === 'string' && x.note.trim() ? x.note.trim() : null,
      zones: forme === 'chemin'
        ? { cibles: cibles.map(c => zone(c, marge)), inv: inv !== null ? zone(inv, marge) : null }
        : { bas: bornes[0] * (1 - marge / 100), haut: bornes[1] * (1 + marge / 100) },
    };
  }
  /** Le fichier (objet JSON déjà lu) → { etat: 'ok' | 'attente' | 'illisible', … }.
   *  ok : groupe, emis, prixEmission, marge, scenarios (triés 1, 2, 3, S), precedents, bilan
   *  (l'ordre du premier mouvement, ou null), ancien (les rangs 1 à 3 sont tous finis), statuts.
   *  maintenant (ms) : sert seulement à « ancien » et à garder un S encore ouvert. */
  function lire(d, maintenant) {
    if (!d || typeof d !== 'object' || Array.isArray(d)) return { etat: 'illisible', raison: 'pas un objet JSON' };
    if (d.format !== FORMAT) return { etat: 'illisible', raison: 'format « ' + String(d.format) + ' » au lieu de « ' + FORMAT + ' »' };
    if (!Array.isArray(d.scenarios)) return { etat: 'illisible', raison: 'liste des scénarios absente' };
    const statuts = Object.assign({}, STATUTS);
    if (d.statuts && typeof d.statuts === 'object') for (const [k, v] of Object.entries(d.statuts)) if (k in STATUTS && typeof v === 'string' && v.trim()) statuts[k] = v.trim();
    const note = typeof d.note === 'string' && d.note.trim() ? d.note.trim() : null;
    let bilan = null;
    const o = d.bilan && d.bilan.ordre;
    if (o && fini(o.matins) && fini(o.reussis) && o.matins >= 0 && o.reussis >= 0 && o.reussis <= o.matins) bilan = { matins: o.matins, reussis: o.reussis, regle: typeof o.regle === 'string' ? o.regle : null };
    const base = { updated: dateUTC(d.updated), groupe: typeof d.groupe === 'string' ? d.groupe : null, note, statuts, bilan,
      precedents: Array.isArray(d.precedents) ? d.precedents.filter(p => p && typeof p.groupe === 'string' && Array.isArray(p.scenarios))
        .map(p => ({ groupe: p.groupe, scenarios: p.scenarios.filter(x => x && typeof x === 'object') })) : [] };
    if (!base.groupe || !d.scenarios.length) return Object.assign(base, { etat: 'attente', scenarios: [] });
    const margeDefaut = fini(d.marge_pct) ? d.marge_pct : null;
    const tous = d.scenarios.map(x => scenario(x, margeDefaut));
    const lus = tous.filter(Boolean);
    const t = fini(maintenant) ? maintenant : Date.now();
    // Le scénario de la semaine (S) d'un matin passé n'est gardé que s'il est encore ouvert.
    const gardes = lus.filter(s => s.rang !== 'S' || s.groupe === base.groupe || (s.statut === '⏳' && s.fin > t));
    gardes.sort((a, b) => RANGS.indexOf(a.rang) - RANGS.indexOf(b.rang) || a.emis - b.emis);
    if (!gardes.length) return Object.assign(base, { etat: 'illisible', raison: 'aucun scénario lisible', scenarios: [] });
    const jour = gardes.filter(s => s.rang !== 'S');
    const emisD = dateUTC(d.emis_utc);
    return Object.assign(base, {
      etat: 'ok', scenarios: gardes, ignores: tous.length - lus.length,
      emis: fini(emisD) ? emisD : Math.min(...gardes.map(s => s.emis)),
      prixEmission: fini(d.prix_emission) ? d.prix_emission : (gardes[0].prixEmission),
      marge: margeDefaut !== null ? margeDefaut : gardes[0].marge,
      ancien: jour.length > 0 && jour.every(s => s.fin <= t),
      // La fin des scénarios DU JOUR (rangs 1 à 3) ; la semaine seulement s'il n'y a qu'elle.
      fin: Math.max(...(jour.length ? jour : gardes).map(s => s.fin)),
      finSemaine: gardes.some(s => s.rang === 'S') ? Math.max(...gardes.filter(s => s.rang === 'S').map(s => s.fin)) : null,
    });
  }
  /** Les scénarios à montrer MAINTENANT (une page restée ouverte relit l'heure, pas le fichier) :
   *  le scénario de la semaine d'un matin passé disparaît une fois fini. */
  function vivants(F, maintenant) {
    if (!F || F.etat !== 'ok') return [];
    const t = fini(maintenant) ? maintenant : Date.now();
    return F.scenarios.filter(s => s.rang !== 'S' || s.groupe === F.groupe || (s.statut === '⏳' && s.fin > t));
  }
  /** Le groupe est-il terminé MAINTENANT (les rangs 1 à 3 tous finis) ? */
  function estAncien(F, maintenant) {
    if (!F || F.etat !== 'ok') return false;
    const t = fini(maintenant) ? maintenant : Date.now(), jour = F.scenarios.filter(s => s.rang !== 'S');
    return jour.length > 0 && jour.every(s => s.fin <= t);
  }
  /** Le scénario est-il encore OUVERT (statut ⏳, fenêtre en cours, rien de décisif touché) ? Seul un
   *  scénario ouvert garde sa flèche vers le futur. */
  function ouvert(S, sv, maintenant) {
    if (S.statut !== '⏳' || (fini(maintenant) && maintenant >= S.fin)) return false;
    return !sv || sv.cle === null || ['avant', 'rien', 'cible', 'dedans', 'large', 'incomplet'].includes(sv.cle);
  }

  // ─── 2. Suivi en direct (affichage), sur les bougies du graphique ──────────
  // Un pli bougie par bougie : l'état après les bougies CLOSES se mémorise, la bougie en cours
  // s'y ajoute (prolonger) sans rien refaire. Bougie = { t (ms, ouverture), h, l }.
  function suiviVide(pasMs) { return { n: 0, k: 0, kOpt: 0, temps: [], tempsI: [], opt: [], tInv: null, iInv: null, sortie: null, touchees: [], meche: [], mecheInv: false, dernier: null, debut: null, pas: fini(pasMs) ? pasMs : 0 }; }
  function touche(z, h, l) { return l <= z[1] && h >= z[0]; }
  /** La bougie qui touche la zone z clôt-elle HORS de z (un contact « en mèche ») ? c : sa clôture
   *  (facultative : sans elle, on ne sait pas, et on ne dit rien). */
  const enMeche = (z, c) => fini(c) && (c < z[0] || c > z[1]);
  /** Ajoute la bougie numéro i (ouverte à t ms, plus haut h, plus bas l, clôture c facultative) au
   *  suivi e (modifié). Avec c, un contact seulement en mèche est noté (e.meche[j], e.mecheInv,
   *  sortie.meche) : il compte quand même (règle du journal), l'Expert le précise. */
  function pas(S, e, i, t, h, l, c) {
    e.n++; e.dernier = t; if (e.debut === null) e.debut = t;
    if (S.forme === 'range') {
      if (!e.sortie) {
        const b = l <= S.zones.bas, hh = h >= S.zones.haut;
        if (b || hh) e.sortie = { t, i, bas: b, haut: hh, meche: fini(c) && c > S.zones.bas && c < S.zones.haut };
      }
      return e;
    }
    const Z = S.zones.cibles;
    for (let j = 0; j < Z.length; j++) if (!e.touchees[j] && touche(Z[j], h, l)) { e.touchees[j] = t; if (e.meche) e.meche[j] = enMeche(Z[j], c); }
    // Chaîne stricte (noter.py) : la cible suivante dans une bougie STRICTEMENT plus tardive.
    if (e.k < Z.length && touche(Z[e.k], h, l) && (e.k === 0 || i > e.tempsI[e.k - 1])) { e.temps.push(t); e.tempsI.push(i); e.k++; }
    // Chaîne possible : plusieurs cibles dans la même bougie (ordre inconnu).
    while (e.kOpt < Z.length && touche(Z[e.kOpt], h, l)) { e.opt.push(t); e.kOpt++; }
    if (e.tInv === null && S.zones.inv && touche(S.zones.inv, h, l)) { e.tInv = t; e.iInv = i; e.mecheInv = enMeche(S.zones.inv, c); }
    return e;
  }
  const copie = e => ({ n: e.n, k: e.k, kOpt: e.kOpt, temps: e.temps.slice(), tempsI: e.tempsI.slice(), opt: e.opt.slice(), tInv: e.tInv, iInv: e.iInv,
    sortie: e.sortie ? Object.assign({}, e.sortie) : null, touchees: e.touchees.slice(), meche: (e.meche || []).slice(), mecheInv: !!e.mecheInv, dernier: e.dernier, debut: e.debut, pas: e.pas });
  /** Une bougie ouverte à t (ms), de durée pasMs, compte-t-elle pour S ? Seulement si elle tient
   *  ENTIÈRE dans la fenêtre [point, fin] : ni celle qui contient le point, ni celle qui déborde
   *  la fin (ce qu'elle a fait après la fin n'est pas du scénario). */
  const compte = (S, t, pasMs) => t >= S.emis && t + (fini(pasMs) ? pasMs : 0) <= S.fin && t < S.fin;
  /** Les bougies de T (s), H, L d'indices [a, b) qui comptent pour S (compte()). pasMs : la durée
   *  d'une bougie (ms). → le pli. */
  function plier(S, T, H, L, a, b, e0, pasMs, C) {
    const e = e0 ? copie(e0) : suiviVide(pasMs);
    for (let i = a; i < b; i++) {
      const t = T[i] * 1000;
      if (!compte(S, t, e.pas)) continue;
      pas(S, e, i, t, H[i], L[i], C ? C[i] : undefined);
    }
    return e;
  }
  /** Le pli → l'état lisible.
   *  cle : 'avant' (aucune bougie depuis le point) | 'rien' | 'cible' (k cibles dans l'ordre) |
   *        'realise' | 'invalide' | 'ambigu' (même bougie, ordre inconnu) | 'dedans' | 'sortie'.
   *  fini : le scénario a dépassé sa fin (maintenant ≥ fin). */
  function etat(S, e, maintenant) {
    const r = { cle: null, fini: fini(maintenant) && maintenant >= S.fin, n: e.n, t: null, k: e.k, temps: e.temps, tInv: e.tInv, touchees: e.touchees, sortie: e.sortie, memeBougie: false,
      pas: e.pas || 0, debut: e.debut, meche: e.meche || [], mecheInv: !!e.mecheInv };
    if (!e.n) { r.cle = 'avant'; return r; }
    if (S.forme === 'range') {
      if (e.sortie) { r.cle = e.sortie.bas && e.sortie.haut ? 'ambigu' : 'sortie'; r.t = e.sortie.t; r.memeBougie = e.sortie.bas && e.sortie.haut; }
      else r.cle = 'dedans';
      return r;
    }
    const N = S.cibles.length;
    const complet = e.k === N, possible = e.kOpt === N && (e.tInv === null || e.opt[N - 1] <= e.tInv);
    // Deux zones dans la même bougie : la cible suivante (chaîne possible plus longue) ou la
    // cible et l'invalidation.
    const t1 = e.temps.length ? e.temps[0] : null;
    r.memeBougie = e.kOpt > e.k || (t1 !== null && e.tInv !== null && e.tempsI[0] === e.iInv);
    if (complet && (e.tInv === null || e.tempsI[N - 1] < e.iInv)) { r.cle = 'realise'; r.t = e.temps[N - 1]; }
    else if (e.tInv !== null && possible) { r.cle = 'ambigu'; r.t = e.tInv; }
    else if (e.tInv !== null) { r.cle = 'invalide'; r.t = e.tInv; r.premier = t1 !== null && e.tempsI[0] < e.iInv; if (t1 !== null && e.tempsI[0] === e.iInv) r.cle = 'ambigu'; }
    else if (e.k > 0) { r.cle = 'cible'; r.t = e.temps[e.k - 1]; }
    else r.cle = e.kOpt > 0 ? 'ambigu' : 'rien';
    return r;
  }
  /** L'historique chargé commence-t-il APRÈS la première bougie qui compte pour S ? (t0Ms : ouverture
   *  de la première bougie chargée.) Alors des bougies de la fenêtre manquent : un toucher, un ordre
   *  ou une invalidation peuvent être passés inaperçus — le suivi ne dit rien d'autre qu'« incomplet ».
   *  La première bougie qui compte s'ouvre au premier multiple du pas à partir du point. */
  function manque(S, t0Ms, pasMs) {
    if (!fini(t0Ms) || !(pasMs > 0)) return false;
    const premiere = Math.ceil(S.emis / pasMs) * pasMs;
    return premiere < S.fin && t0Ms > premiere;
  }
  /** Suivi complet sur des colonnes (T en secondes) : → état lisible. Le pli seul : la page vérifie
   *  d'abord que l'historique remonte jusqu'au point (manque()). */
  function suivre(S, T, H, L, n, maintenant, pasMs) { return etat(S, plier(S, T, H, L, 0, n, null, pasMs), maintenant); }
  /** Historique trop court (manque()) : aucun état, l'heure de la première bougie chargée. */
  function etatIncomplet(S, pasMs, maintenant, debutMs) {
    return { cle: 'incomplet', fini: fini(maintenant) && maintenant >= S.fin, n: 0, t: null, k: 0, temps: [], tInv: null, touchees: [], sortie: null, memeBougie: false, pas: pasMs, debut: debutMs };
  }
  /** Bougies trop larges pour suivre une fenêtre d'environ un jour (4 h, 1 jour…) : pas d'état. */
  function etatLarge(S, pasMs, maintenant) {
    return { cle: 'large', fini: fini(maintenant) && maintenant >= S.fin, n: 0, t: null, k: 0, temps: [], tInv: null, touchees: [], sortie: null, memeBougie: false, pas: pasMs, debut: null };
  }

  // ─── 3. Les mots ───────────────────────────────────────────────────────────
  const NOMS_RANG = { '1': 'Scénario 1', '2': 'Scénario 2', '3': 'Scénario 3', S: 'Scénario de la semaine' };
  const COURTS_RANG = { '1': 'S1', '2': 'S2', '3': 'S3', S: 'Sem.' };
  const MARQUES_RANG = { '1': '1.', '2': '2.', '3': '3.', S: 'Semaine :' };
  const origine = (S, v) => (fini(v) ? S.origines[String(v)] || null : null);
  /** Une origine entre parenthèses ; une origine qui en porte déjà (« mur de puts (modèle) ») ne
   *  s'emboîte pas : « (mur de puts, modèle) ». */
  const entreP = o => ' (' + o.replace(/\s*\(([^)]*)\)/g, ', $1') + ')';
  /** Les niveaux d'un scénario en mots : « 84 300 $ puis 86 000 $ » ; « entre 81 000 et 84 000 $ ».
   *  maxO : au plus maxO origines (défaut 0), chacune JUSTE APRÈS son propre niveau — jamais une
   *  origine loin du nombre qu'elle nomme : « 84 300 $ (plus haut du 07/10) puis 85 600 $ ». */
  function niveaux(S, exp, maxO) {
    if (exp) return S.forme === 'range' ? 'range ' + chiffres(S.range[0]) + ' – ' + chiffres(S.range[1]) : S.cibles.map(chiffres).join(' > ');
    let reste = maxO === undefined ? 0 : maxO;
    const o = v => { const x = reste > 0 ? origine(S, v) : null; if (x) reste--; return x; };
    if (S.forme === 'range') {
      const oa = o(S.range[0]), ob = o(S.range[1]);
      return 'entre ' + (oa ? prix(S.range[0]) + entreP(oa) : chiffres(S.range[0])) + ' et ' + prix(S.range[1]) + (ob ? entreP(ob) : '');
    }
    return S.cibles.map(v => { const x = o(v); return prix(v) + (x ? entreP(x) : ''); }).join(' puis ');
  }
  /** L'origine du premier niveau qui en a une (libellé court). */
  function originePremiere(S) {
    const vs = S.forme === 'range' ? S.range : S.cibles;
    for (const v of vs) { const o = origine(S, v); if (o) return o; }
    return null;
  }
  /** Le libellé posé près d'un scénario.
   *  débutant : « Scénario 1 · 84 300 $ (plus haut du 06/10) puis 86 000 $ » (une origine, après
   *  son niveau) ; court = true : sans origine ; court = 'complet' : toutes les origines ;
   *  expert   : « S1 84 300 > 86 000 · inv 80 900 ». */
  function libelle(S, mode, court) {
    if (mode === 'expert') return COURTS_RANG[S.rang] + ' ' + niveaux(S, true) + (S.invalidation !== null ? ' · inv ' + chiffres(S.invalidation) : '');
    return NOMS_RANG[S.rang] + ' · ' + niveaux(S, false, court === true ? 0 : court === 'complet' ? Infinity : 1);
  }
  const jourDe = ms => new Date(ms).toISOString().slice(0, 10);
  /** « 10:30 », précédé du jour (« 07/10 10:30 ») quand ce n'est pas le jour de `maintenant`. */
  const quand = (t, maintenant) => (fini(maintenant) && fini(t) && jourDe(t) !== jourDe(maintenant) ? jourGroupe(jourDe(t)) + ' ' : '') + heureUTC(t);
  /** Le moment d'un toucher : une bougie de plus d'une minute ne dit pas l'instant, seulement son
   *  créneau. « entre 10:30 et 10:45 UTC » (court : « 10:30–10:45 UTC ») ; en 1 min, « à 10:31 UTC ». */
  function creneau(t, pasMs, maintenant, court) {
    if (!(pasMs > 60000)) return (court ? '' : 'à ') + quand(t, maintenant) + ' UTC';
    return court ? quand(t, maintenant) + '–' + heureUTC(t + pasMs) + ' UTC' : 'entre ' + quand(t, maintenant) + ' et ' + heureUTC(t + pasMs) + ' UTC';
  }
  /** Le statut du journal en mots, avec ce que dit premier_ok (chemin : « oui » = la 1re cible avant
   *  l'invalidation ; range : la borne qui a cédé). forme : 'chemin' | 'range' | null (déduite).
   *  → { long, court } */
  function motsStatut(statut, premierOk, forme, statuts, exp) {
    const lib = (statuts || STATUTS)[statut] || STATUTS[statut] || String(statut || '—');
    const range = forme === 'range' || (!forme && (premierOk === 'bas' || premierOk === 'haut'));
    if (range) {
      if (premierOk !== 'bas' && premierOk !== 'haut') return { long: lib, court: lib };
      const sens = premierOk === 'bas' ? 'sorti par le bas' : 'sorti par le haut';
      const l = statut === '❌' ? lib.replace(/\s*d[’']abord$/, '') : lib;
      return { long: l + ' (' + sens + ')', court: statut === '❌' ? sens : l };
    }
    if (statut === '❌' && premierOk === 'oui') return { long: 'invalidé après la 1re cible' + (exp ? '' : ' (1re cible touchée d’abord)'), court: 'invalidé après la 1re cible' };
    if (statut === '❌' && premierOk === 'non') return { long: lib + (exp ? ' (inval. avant la 1re cible)' : ' (invalidation touchée avant la 1re cible)'), court: lib };
    if (premierOk === 'oui') return { long: lib + (exp ? ' (1re cible d’abord)' : ' (1re cible touchée avant l’invalidation)'), court: lib };
    if (premierOk === 'non') return { long: lib + (exp ? ' (inval. d’abord)' : ' (invalidation touchée d’abord)'), court: lib };
    return { long: lib, court: lib };
  }
  /** L'état en mots. sv : l'état du suivi (etat()) ; ctx = { itv (« 15 min »), maintenant (ms) }.
   *  Un statut résolu du fichier (≠ ⏳) passe AVANT le suivi : c'est la note officielle.
   *  → { texte, court, officiel, cle } */
  function texteEtat(S, sv, statuts, mode, ctx) {
    const exp = mode === 'expert', c = ctx || {}, now = c.maintenant;
    if (S.statut !== '⏳') {
      const m = motsStatut(S.statut, S.premierOk, S.forme, statuts, exp);
      const q = fini(S.resolu) ? ' · ' + quand(S.resolu, now) + ' UTC' : '';
      const court = 'journal : ' + m.court;
      return { cle: 'officiel', officiel: true, texte: (exp ? 'journal : ' : 'note du journal : ') + m.long + q, court, courtD: court,
        mini: m.court, micro: m.court, miniD: m.court + ' (journal)', microD: m.court + ' (journal)' };
    }
    const pasMs = sv && sv.pas ? sv.pas : 0;
    const cr = t => creneau(t, pasMs, now), crC = t => creneau(t, pasMs, now, true);
    const itv = c.itv || '';
    let t, k;
    switch (sv ? sv.cle : null) {
      case 'avant': t = (exp ? '' : 'en cours · ') + 'pas encore de bougie ' + itv + ' depuis le point'; k = 'en cours'; break;
      case 'rien': {
        // La 1re bougie comptée s'ouvre bien après le point (bougies d'une heure) : dit.
        const tard = fini(sv.debut) && sv.debut - S.emis > 5 * 60000 ? ' depuis ' + quand(sv.debut, now) + ' UTC (bougies ' + itv + ')' : '';
        t = (exp ? 'rien de touché' : 'en cours · rien de touché') + tard; k = 'rien de touché'; break;
      }
      case 'cible': t = ordinal(sv.k) + ' cible touchée ' + cr(sv.t) + (sv.memeBougie ? ' · la suivante dans la même bougie, ordre inconnu' : ''); k = ordinal(sv.k) + ' cible ' + crC(sv.t) + (sv.memeBougie ? ' · ordre inconnu' : ''); break;
      case 'realise': t = 'réalisé ' + cr(sv.t); k = 'réalisé ' + crC(sv.t); break;
      case 'invalide': t = sv.premier ? '1re cible, puis invalidation ' + cr(sv.t) : 'invalidation touchée d’abord ' + cr(sv.t); k = (sv.premier ? '1re cible, puis invalidation ' : 'invalidation d’abord ') + crC(sv.t); break;
      case 'ambigu': {
        const q = crC(sv.t || (sv.temps && sv.temps[0]));
        t = (S.forme === 'range' ? 'les deux bornes dépassées' : 'une cible et l’invalidation') + ' dans la même bougie (' + q + ') : ordre inconnu'; k = 'ordre inconnu (même bougie)'; break;
      }
      case 'dedans': t = exp ? 'dedans' : 'dedans · aucune borne dépassée'; k = 'dedans'; break;
      case 'sortie': t = (sv.sortie.haut ? 'borne haute' : 'borne basse') + ' dépassée ' + cr(sv.t); k = (sv.sortie.haut ? 'borne haute ' : 'borne basse ') + crC(sv.t); break;
      case 'large': t = exp ? 'suivi : bougies trop larges' : 'suivi en direct indisponible sur les bougies ' + itv + ' (trop larges) : il se lit en 15 min ou 1 h'; k = 'suivi : bougies trop larges'; break;
      case 'incomplet': {
        const ou = pasMs < 900000 ? '15 min' : '1 h', depuis = fini(sv.debut) ? quand(sv.debut, now) + ' UTC' : '—';
        t = exp ? 'suivi incomplet (historique ' + itv + ' depuis ' + depuis + ')' : 'suivi en direct incomplet sur les bougies ' + itv + ' (historique chargé depuis ' + depuis + ', après le point) : il se lit en ' + ou;
        k = 'suivi incomplet'; break;
      }
      default: t = 'suivi indisponible'; k = '—';
    }
    // Les formes les plus courtes (libellés étroits, ligne des états) : un mot ou deux.
    const MINI = { avant: 'en cours', rien: 'rien de touché', cible: sv && sv.k ? ordinal(sv.k) + ' cible' : 'cible', realise: 'réalisé', invalide: sv && sv.premier ? 'invalidé après la 1re cible' : 'invalidé',
      ambigu: 'ordre inconnu', dedans: 'dedans', sortie: sv && sv.sortie && sv.sortie.haut ? 'sorti par le haut' : 'sorti par le bas', large: 'non suivi', incomplet: 'suivi incomplet' };
    let mini = (sv && MINI[sv.cle]) || '—', micro = mini;
    const ouvertes = ['avant', 'rien', 'cible', 'dedans', 'large', 'incomplet'];
    if (sv && sv.fini) {
      t = 'terminé · ' + t.replace(/^en cours · /, '') + (exp ? ' · note à venir' : ' · note du journal à venir'); k = 'terminé · ' + k;
      if (ouvertes.includes(sv.cle)) { mini = 'terminé · ' + mini; micro = 'terminé'; }
    }
    // Un état calculé ici est un AFFICHAGE : hors de l'encadré complet (qui le dit dans sa note),
    // il porte sa marque « (en direct) » (expert : « · direct »).
    const D = x => x + (exp ? ' · direct' : ' (en direct)');
    return { cle: sv ? sv.cle : null, officiel: false, texte: t, court: k, courtD: D(k), mini, micro, miniD: D(mini), microD: D(micro) };
  }
  /** Le titre de l'encadré : « Scénarios du matin · 09/10 07h00 Paris » ; groupe terminé (à l'heure
   *  de `maintenant`, pas à celle de la lecture) : « Scénarios d'hier (terminés) » (ou de la date,
   *  s'il est plus vieux qu'hier), « · semaine en cours » si la semaine court encore (semOuverte :
   *  l'état du suivi en direct, facultatif). */
  function titre(F, P, maintenant, semOuverte) {
    if (!F || F.etat !== 'ok') return 'Scénarios du matin';
    const point = P && P.point ? ' ' + P.point + ' Paris' : '';
    if (!estAncien(F, maintenant)) return 'Scénarios du matin · ' + jourGroupe(F.groupe) + point;
    const t = fini(maintenant) ? maintenant : Date.now();
    const hier = jourDe(t - 86400000), auj = jourDe(t);
    // « semaine en cours » : seulement tant que la semaine est OUVERTE — selon le suivi en direct
    // quand la page le donne (semOuverte), sinon selon le fichier.
    const ouverte = typeof semOuverte === 'boolean' ? semOuverte : vivants(F, t).some(s => s.rang === 'S' && s.statut === '⏳' && s.fin > t);
    const sem = ouverte ? ' · semaine en cours' : '';
    return (F.groupe === hier || F.groupe === auj ? 'Scénarios d’hier' : 'Scénarios du ' + jourGroupe(F.groupe)) + ' (terminés)' + sem;
  }
  /** Une ligne de l'encadré. Débutant : ce qui est attendu ET ce qui l'invalide —
   *  « 1. Hausse vers 86 500 puis 87 200, sans toucher 85 500 avant — en cours · rien de touché » ;
   *  court : « 1. 86 500 $ puis 87 200 $ (inval. 85 500 $) — rien de touché » ; range :
   *  « 3. Le prix reste entre 85 600 et 86 400 $ — dedans · aucune borne dépassée ». */
  function ligne(S, et, mode, court) {
    const exp = mode === 'expert';
    let quoi;
    if (exp) quoi = libelle(S, 'expert').replace(/^\S+ /, '');
    else if (S.forme === 'range') quoi = 'Le prix reste ' + niveaux(S, false);
    else if (court) quoi = niveaux(S, false) + (S.invalidation !== null ? ' (inval. ' + prix(S.invalidation) + ')' : '');
    else {
      quoi = S.enonce || 'Vers ' + niveaux(S, false);
      if (S.invalidation !== null && !quoi.includes(chiffres(S.invalidation))) quoi += ', sans toucher ' + chiffres(S.invalidation) + ' avant';
    }
    // « Semaine : Semaine : … » se lirait deux fois : l'énoncé de la semaine perd son préfixe.
    if (S.rang === 'S') { quoi = quoi.replace(/^semaine\s*:\s*/i, ''); if (!exp) quoi = quoi.charAt(0).toLowerCase() + quoi.slice(1); }
    return MARQUES_RANG[S.rang] + ' ' + quoi + (et ? ' — ' + (exp || court ? et.court : et.texte) : '');
  }
  /** Les états de tous les scénarios sur une ligne (encadré serré) : « Suivi en direct : 1 · invalidé
   *  | 2 · rien de touché | 3 · dedans | Sem. · réalisé » ; une note du journal porte « (journal) » ;
   *  tout noté : « Note du journal : … ». items : [{ sc, et }]. sansLarge : les scénarios non suivis
   *  (bougies trop larges) sont omis (une note le dit une fois). */
  function ligneEtats(items, mode, sansLarge) {
    const L = items.filter(it => !(sansLarge && it.et.cle === 'large'));
    if (!L.length) return null;
    const tousOff = L.every(it => it.et.officiel);
    const parts = L.map(it => (it.sc.rang === 'S' ? 'Sem.' : it.sc.rang) + ' · ' + it.et.mini + (it.et.officiel && !tousOff ? ' (journal)' : ''));
    return (tousOff ? (mode === 'expert' ? 'Journal : ' : 'Note du journal : ') : (mode === 'expert' ? 'En direct : ' : 'Suivi en direct : ')) + parts.join(' | ');
  }
  /** Bougies trop larges pour le suivi : dit UNE fois (encadré), pas sur chaque ligne. */
  function noteLarge(itv, mode) {
    return mode === 'expert' ? 'Suivi en direct : bougies ' + itv + ' trop larges (15 min ou 1 h)' : 'Suivi en direct : bougies ' + itv + ' trop larges, il se lit en 15 min ou 1 h.';
  }
  /** La mesure de l'ordre, seul chiffre de réussite montré (bilan.ordre du fichier). */
  function texteBilan(b, P, mode) {
    if (!b || !(b.matins > 0)) return null;
    const faible = b.matins < (P ? P.echantillonFaible : 20);
    const m = b.matins + (b.matins > 1 ? ' matins' : ' matin');
    if (mode === 'expert') return 'Ordre du 1er mouvement : ' + b.reussis + '/' + m + (faible ? ' · échantillon faible' : '');
    return 'Ordre du premier mouvement juste ' + b.reussis + ' fois sur ' + m + (faible ? ' · échantillon faible' : '');
  }
  /** Ce que compte la mesure de l'ordre (dit avec elle). */
  // La règle de noter.py (bilan) : chaque matin, le chemin le mieux classé QUI A UNE INVALIDATION
  // (rangs 1 à 3, horizon ≤ 25 h ; si le 1 n'en a pas, c'est le 2…), statut ⚠ exclu.
  const REGLE_BILAN = 'Chaque matin compte le chemin le mieux classé qui a une invalidation (rangs 1 à 3 ; si le 1 n’en a pas, le suivant). Ne comptent que les matins où il a touché sa 1re zone ou son invalidation ; « juste » = la 1re zone d’abord. C’est le seul chiffre de réussite montré ici.';
  /** Après la règle écrite par le fichier (qui nomme déjà le chemin compté) : le reste, sans redite. */
  const REGLE_BILAN_SUITE = 'Ne comptent que les matins où ce chemin a touché sa 1re zone ou son invalidation. C’est le seul chiffre de réussite montré ici.';
  const SENS_RANG = {
    '1': 'Rang 1 : jugé par Claude le plus probable des trois ce matin. Un classement, sans pourcentage.',
    '2': 'Rang 2 : jugé par Claude moins probable que le 1, plus que le 3. Un classement, sans pourcentage.',
    '3': 'Rang 3 : jugé le moins probable des trois. Un classement, sans pourcentage.',
    S: 'Scénario de la semaine : une fenêtre plus longue, à part du classement, qui chevauche les matins suivants ; il ne compte pas dans la mesure de l’ordre.',
  };
  /** L'explication complète d'un scénario (survol), en lignes. sv : état du suivi ; ctx = { itv, statuts, maintenant }. */
  function explication(S, sv, mode, P, ctx) {
    const exp = mode === 'expert', c = ctx || {}, out = [];
    const m = nb(S.marge) + ' %';
    const z = v => { const [a, b] = zone(v, S.marge); return chiffres(a) + ' – ' + prix(b); };
    const avecO = v => { const o = origine(S, v); return prix(v) + (o ? entreP(o) : ''); };
    if (S.enonce) out.push(S.enonce + '.');
    if (S.forme === 'chemin') {
      if (exp) out.push('Cibles dans l’ordre : ' + S.cibles.map(avecO).join(' > ') + (S.invalidation !== null ? ' ; invalidation ' + avecO(S.invalidation) : '') + '.');
      else {
        out.push('Ce scénario se lit : le prix touche ' + S.cibles.map(avecO).join(', puis ') + (S.invalidation !== null ? ', sans toucher avant ' + avecO(S.invalidation) : '') + '.');
        if (S.invalidation !== null) out.push(prix(S.invalidation) + ' est l’invalidation : si sa zone est touchée avant la dernière cible, le scénario est invalidé.');
      }
      out.push((exp ? 'Zones ± ' + m + ' : ' : 'Chaque niveau est une zone (le niveau ± ' + m + ') : ') + S.cibles.map((v, k) => (exp ? ordinal(k + 1) + ' ' : 'cible ' + (k + 1) + ' : ') + z(v)).join(' ; ')
        + (S.invalidation !== null ? (exp ? ' ; invalidation ' : ' ; invalidation : ') + z(S.invalidation) : '') + '.');
    } else {
      out.push((exp ? 'Range ' : 'Ce scénario se lit : le prix reste ') + (exp ? chiffres(S.range[0]) + ' – ' + prix(S.range[1]) : 'entre ' + avecO(S.range[0]) + ' et ' + avecO(S.range[1]))
        + (exp ? ', aucune borne dépassée de plus de ' + m + '.' : ', sans sortir de ses bornes ± ' + m + ' (de ' + prix(S.zones.bas) + ' à ' + prix(S.zones.haut) + ') jusqu’à la fin.'));
    }
    const finP = heureParis(S.fin);
    const emP = heureParis(S.emis);
    out.push((exp ? 'Émis ' : 'Émis le ') + jourGroupe(jourDe(S.emis)) + ' à ' + heureUTC(S.emis) + ' UTC' + (emP ? ' (' + emP + ' Paris)' : '') + (fini(S.prixEmission) ? (exp ? ' à ' : ', prix ') + prix(S.prixEmission) : '') + ' · fin ' + jourGroupe(jourDe(S.fin)) + ' ' + heureUTC(S.fin) + ' UTC'
      + (finP ? ' (jusqu’à ' + finP + ' Paris)' : '') + (fini(S.horizon) ? ' · horizon ' + nb(Math.round(S.horizon * 10) / 10) + ' h' : '') + '.');
    const et = texteEtat(Object.assign({}, S, { statut: '⏳' }), sv, c.statuts, mode, c);
    out.push((exp ? 'Suivi en direct (bougies ' + (c.itv || '') + ') : ' : 'Suivi en direct sur les bougies ' + (c.itv || '') + ' du graphique : ') + et.texte + '.'
      + (exp ? '' : ' Un affichage : la note officielle est celle du journal, faite le lendemain sur des bougies d’une minute.'));
    if (S.statut !== '⏳') out.push(texteEtat(S, sv, c.statuts, mode, c).texte.replace(/^./, x => x.toUpperCase()) + '.');
    if (S.note) out.push('Note du journal : ' + S.note);
    out.push(SENS_RANG[S.rang]);
    if (exp && fini(S.baseHasard)) out.push('Base hasard pur (modèle), pas une estimation : ' + nb(S.baseHasard) + ' %.');
    if (exp && S.etiquettes.length) out.push('Étiquettes : ' + S.etiquettes.join(', ') + (S.version ? ' · méthode ' + S.version : '') + '.');
    return out;
  }

  // ─── 4. Mode Débutant : une ligne, un libellé, une bulle sans jargon ──────
  // L'écran Débutant montre le scénario 1 de Claude (un libellé court près de sa zone) et UNE
  // ligne d'état (« Scénario 1 de Claude : en cours (en direct) ▸ ») ; le reste est dans la bulle,
  // en mots simples, heures de Paris. Un état calculé par la page porte « (en direct) » ; la note
  // du journal, « (journal) ». Rien d'existant ne change.
  const MOTS_BANNIS = (typeof Guide !== 'undefined' && Guide.MOTS_BANNIS_DEBUTANT)
    || (typeof require === 'function' ? require('./guide.js').MOTS_BANNIS_DEBUTANT : []);
  /** Un texte libre (énoncé, origine, note) montrable en Débutant : aucun mot de la liste. */
  const propre = t => !!t && !MOTS_BANNIS.some(re => re.test(t));
  const tient = (t, max, mesure, maxPx) => (!(max > 0) || t.length <= max) && (typeof mesure !== 'function' || !(maxPx > 0) || mesure(t) <= maxPx);
  const premiere = (V, max, mesure, maxPx) => { for (const t of V) if (tient(t, max, mesure, maxPx)) return t; return V[V.length - 1]; };
  /** Les états courts du Débutant (au plus 11 caractères, sauf les deux renvois). */
  const ETATS_COURTS_DEBUTANT = {
    avant: 'en cours', rien: 'en cours', dedans: 'en cours', cible: k => ordinal(k) + ' cible ✓', realise: 'réalisé ✓', invalide: 'invalidé ✗',
    sortie: haut => 'sorti ' + (haut ? '↑' : '↓') + ' ✗', ambigu: 'indécis', termine: 'terminé', large: 'à voir en 15 min ou 1 h', incomplet: 'données manquantes',
    journal: { '✅': 'réalisé ✓', '❌': 'invalidé ✗', '◐': 'partiel', '⌛': 'rien atteint', '⚠': 'indécis' },
  };
  /** → { etat, marque } : marque « (en direct) » (calculé ici), « (journal) » (note officielle), ou
   *  rien (un renvoi : bougies trop larges, historique trop court). */
  function etatCourtDebutant(S, sv) {
    const E = ETATS_COURTS_DEBUTANT;
    if (S.statut !== '⏳') return { etat: E.journal[S.statut] || 'noté', marque: '(journal)' };
    const cle = sv ? sv.cle : null;
    if (cle === 'large') return { etat: E.large, marque: '' };
    if (cle === 'incomplet') return { etat: E.incomplet, marque: '' };
    if (!cle) return { etat: 'suivi indisponible', marque: '' };
    if (sv.fini && ['avant', 'rien', 'cible', 'dedans'].includes(cle)) return { etat: E.termine, marque: '(en direct)' };
    const etat = cle === 'cible' ? E.cible(sv.k) : cle === 'sortie' ? E.sortie(!!(sv.sortie && sv.sortie.haut)) : E[cle];
    return { etat: typeof etat === 'string' ? etat : 'suivi indisponible', marque: '(en direct)' };
  }
  const nomRang = r => (r === 'S' ? 'Scénario de la semaine' : 'Scénario ' + r);
  const minus = s => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);
  /** La ligne des scénarios (au plus 48 caractères, 40 en étroit) : « Scénario 1 de Claude : en cours
   *  (en direct) ▸ ». F : le fichier lu (ou null, ou d'attente) ; items : [{ sc, sv }]. */
  function ligneBoiteDebutant(F, items, maintenant, max, P, mesure, maxPx) {
    if (!F || F.etat !== 'ok') {
      if (F && F.etat === 'attente') return 'Scénarios du matin : ' + (F.note ? minus(F.note) : 'en attente du prochain point.');
      return 'Scénarios du matin : indisponibles';
    }
    if (estAncien(F, maintenant)) {
      const t = fini(maintenant) ? maintenant : Date.now(), hier = jourDe(t - 86400000), auj = jourDe(t);
      return premiere([(F.groupe === hier || F.groupe === auj ? 'Scénarios d’hier' : 'Scénarios du ' + jourGroupe(F.groupe)) + ' : terminés ▸', 'Scénarios : terminés ▸'], max, mesure, maxPx);
    }
    const it = (items || []).find(i => i.sc.rang === '1') || (items || [])[0];
    if (!it) return 'Scénarios du matin : indisponibles';
    const e = etatCourtDebutant(it.sc, it.sv), corps = e.etat + (e.marque ? ' ' + e.marque : '') + ' ▸';
    // « Scénario du matin » : le libellé près de la zone dit déjà « Scénario 1 » (deux lignes
    // « Scénario 1 » l'une sous l'autre se lisaient comme deux scénarios).
    const pre = it.sc.rang === '1' ? ['Scénario du matin : ', 'Scénario : ', 'Scén. : '] : ['Scénario de la semaine : ', 'Semaine : '];
    return premiere(pre.map(p => p + corps), max, mesure, maxPx);
  }
  /** Les libellés possibles du scénario près de sa zone (au plus `max` caractères), du plus riche
   *  au plus court : « Scén. 1 : reste 81 000–83 500 $ » (un range dit son verbe : sans lui, « 81 000
   *  – 83 500 $ » se lisait « va de 81 000 à 83 500 »), « Scénario 1 : vers 84 300 $ ↑ », après la
   *  1re cible « Scénario 1 : ensuite 86 000 $ ↑ » ; le dernier, « Scén. 1 », toujours. fleche ('↑' |
   *  '↓') : le niveau est hors de la vue. L'app essaie chacun tant qu'aucun n'a trouvé sa place. */
  function libellesDebutant(S, sv, max, fleche) {
    const f = fleche ? fleche + ' ' : '', noms = S.rang === 'S' ? ['Semaine', 'Sem.'] : ['Scénario ' + S.rang, 'Scén. ' + S.rang];
    const V = [];
    if (S.forme === 'range') {
      const a = chiffres(S.range[0]), b = chiffres(S.range[1]), B = prix(S.range[1]);
      // Avec l'unité d'abord (le verbe, puis sans lui) ; sans l'unité seulement en dernier recours.
      const avec = [a + ' – ' + B, a + '–' + B], nu = [a + '–' + b];
      for (const C of [avec, nu]) {
        for (const c of C) for (const n of noms) V.push(f + n + ' : reste ' + c);
        for (const n of noms) for (const c of C) V.push(f + n + ' : ' + c);
      }
    } else {
      const N = S.cibles.length, k = sv && sv.cle === 'cible' && sv.k > 0 && sv.k < N ? sv.k : 0;
      const ref = k ? S.cibles[k - 1] : fini(S.prixEmission) ? S.prixEmission : S.invalidation !== null ? S.invalidation : S.cibles[0];
      // Cible hors de la vue : la flèche de tête dit déjà où elle est ; une 2e flèche (le sens)
      // ferait « ↑ Scénario 1 : vers 86 900 $ ↑ ».
      const s = f ? '' : S.cibles[k] >= ref ? ' ↑' : ' ↓', mot = k ? 'ensuite ' : 'vers ';
      for (const n of noms) for (const c of [mot + prix(S.cibles[k]) + s, mot + chiffres(S.cibles[k]) + s]) V.push(f + n + ' : ' + c);
    }
    V.push(f + noms[1]);
    return V.filter((t, i) => i === V.length - 1 || !(max > 0) || t.length <= max);
  }
  /** Le libellé du scénario près de sa zone : le premier de libellesDebutant qui tient
   *  (caractères, pixels). */
  function libelleDebutant(S, sv, max, mesure, maxPx, fleche) {
    return premiere(libellesDebutant(S, sv, max, fleche), max, mesure, maxPx);
  }
  /** Une ligne de la bulle, en mots : « 2. Le prix va vers 84 300 $ puis 86 000 $, sans toucher
   *  80 900 $ avant — en cours (en direct) ». */
  function ligneDebutant(S, sv) {
    let quoi = S.forme === 'range' ? 'le prix reste ' + niveaux(S, false) : 'le prix va vers ' + niveaux(S, false) + (S.invalidation !== null ? ', sans toucher ' + prix(S.invalidation) + ' avant' : '');
    if (S.rang !== 'S') quoi = quoi.charAt(0).toUpperCase() + quoi.slice(1);
    const e = etatCourtDebutant(S, sv);
    return MARQUES_RANG[S.rang] + ' ' + quoi + ' — ' + e.etat + (e.marque ? ' ' + e.marque : '');
  }
  /** Une origine du fichier, gardée en Débutant morceau par morceau : sans nom d'indicateur, sans
   *  « R1 » ni « 4h » ; null s'il ne reste rien. « plus haut du 08/10 (83 521), EMA 20 1d » →
   *  « plus haut du 08/10, 83 521 ». */
  function origineDebutant(o) {
    if (!o) return null;
    const m = o.replace(/\s*\(([^)]*)\)/g, ', $1').split(',').map(x => x.trim()).filter(x => x && propre(x));
    return m.length ? m.join(', ') : null;
  }
  let FMT_JOUR_PARIS = null;
  try { FMT_JOUR_PARIS = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit' }); } catch (e) { FMT_JOUR_PARIS = null; }
  const jourParis = ms => (FMT_JOUR_PARIS && fini(ms) ? FMT_JOUR_PARIS.format(new Date(ms)) : jourGroupe(jourDe(ms)));
  /** « vers 07h45 (heure de Paris) » ; une bougie de plus d'une minute : son créneau. */
  function momentDebutant(t, pasMs) {
    const a = heureParis(t);
    if (!a) return '';
    if (!(pasMs > 60000)) return ' vers ' + a + ' (heure de Paris)';
    return ' entre ' + a + ' et ' + heureParis(t + pasMs) + ' (heure de Paris)';
  }
  /** L'état du suivi en direct, en mots (bulle Débutant). */
  function etatLongDebutant(S, sv) {
    const pas = sv && sv.pas ? sv.pas : 0, q = t => momentDebutant(t, pas);
    let t;
    switch (sv ? sv.cle : null) {
      case 'avant': case 'rien': t = 'en cours, rien de touché pour l’instant'; break;
      case 'dedans': t = 'en cours, le prix est resté entre les bornes'; break;
      case 'cible': t = ordinal(sv.k) + ' cible touchée' + q(sv.t) + (sv.memeBougie ? ', la suivante dans le même créneau (ordre inconnu)' : ''); break;
      case 'realise': t = 'réalisé : dernière cible touchée' + q(sv.t); break;
      case 'invalide': t = sv.premier ? '1re cible touchée, puis invalidation' + q(sv.t) : 'invalidation touchée d’abord' + q(sv.t); break;
      case 'ambigu': t = 'indécis : ' + (S.forme === 'range' ? 'les deux bornes dépassées' : 'une cible et l’invalidation') + ' dans le même créneau, l’ordre est inconnu'; break;
      case 'sortie': t = 'sorti par ' + (sv.sortie.haut ? 'le haut' : 'le bas') + q(sv.t); break;
      case 'large': t = 'à voir en 15 min ou 1 h : sur cet intervalle, le suivi en direct n’est pas possible'; break;
      case 'incomplet': t = 'données manquantes : l’historique chargé commence après l’écriture du scénario ; à voir en 15 min ou 1 h'; break;
      default: t = 'suivi indisponible';
    }
    if (sv && sv.fini && ['avant', 'rien', 'cible', 'dedans'].includes(sv.cle)) t = 'terminé (' + t.replace(/^en cours, /, '') + ') ; la note du journal suivra';
    return t;
  }
  /** La première ligne des bulles du Débutant : qui a écrit, quand (heure de Paris). */
  function enteteDebutant(F, P, maintenant) {
    if (!F || F.etat !== 'ok') return 'Scénarios du matin de Claude, une IA.';
    const t = fini(maintenant) ? maintenant : Date.now(), jour = jourParis(F.emis), auj = jourParis(t);
    const point = P && P.point ? P.point : heureParis(F.emis);
    // L'heure du POINT (la publication) ; celle de l'écriture de chaque scénario est dans sa bulle (« Écrit le … à … »).
    return 'Écrits par Claude, une IA, ' + (jour === auj ? 'ce matin' : 'le ' + jour) + (point ? ', publiés au point de ' + point : '') + ' (heure de Paris).';
  }
  /** L'explication d'un scénario en Débutant (bulle) : ce qu'il dit, ses zones, quand il a été
   *  écrit (heure de Paris), son suivi en direct, le sens du rang. Les origines et l'énoncé de
   *  Claude n'y passent que sans jargon (origineDebutant). La base du hasard reste en Expert. */
  function explicationDebutant(S, sv, P, ctx) {
    // Choix 1B : aucun pourcentage en Débutant, pas même la marge des zones — elles sont dites en dollars.
    const c = ctx || {}, out = [];
    const z = v => { const [a, b] = zone(v, S.marge); return chiffres(a) + ' – ' + prix(b); };
    const avecO = v => { const o = origineDebutant(origine(S, v)); return prix(v) + (o ? ' (' + o + ')' : ''); };
    if (S.forme === 'chemin') {
      out.push('Ce scénario se lit : le prix touche ' + S.cibles.map(avecO).join(', puis ') + (S.invalidation !== null ? ', sans toucher avant ' + avecO(S.invalidation) : '') + '.');
      if (S.invalidation !== null) out.push(prix(S.invalidation) + ' est l’invalidation : si le prix y arrive avant la dernière cible, le scénario ne tient plus (zone hachurée pendant le survol).');
      out.push('Chaque niveau se lit comme une zone autour de son prix : ' + S.cibles.map((v, k) => 'cible ' + (k + 1) + ' : ' + z(v)).join(' ; ') + (S.invalidation !== null ? ' ; invalidation : ' + z(S.invalidation) : '') + '.');
    } else {
      out.push('Ce scénario se lit : le prix reste entre ' + avecO(S.range[0]) + ' et ' + avecO(S.range[1]) + ', sans sortir de ' + chiffres(S.zones.bas) + ' – ' + prix(S.zones.haut) + ' jusqu’à la fin.');
    }
    if (propre(S.enonce)) out.push('Les mots de Claude : « ' + S.enonce + ' ».');
    const emP = heureParis(S.emis), finP = heureParis(S.fin);
    out.push('Écrit le ' + jourParis(S.emis) + (emP ? ' à ' + emP : '') + (fini(S.prixEmission) ? ', quand le prix valait ' + prix(S.prixEmission) : '') + ' ; valable jusqu’au ' + jourParis(S.fin) + (finP ? ' à ' + finP : '') + ' (heures de Paris).');
    out.push('Suivi en direct sur ce graphique : ' + etatLongDebutant(S, sv) + ' (un simple affichage).');
    if (S.statut !== '⏳') { const e = etatCourtDebutant(S, sv); out.push('Note du journal : ' + e.etat + '.'); }
    if (propre(S.note)) out.push('Note du journal : ' + S.note);
    out.push(SENS_RANG[S.rang]);
    return out;
  }


  // ─── 5. La journée : les scénarios du matin recalculés en continu ────────
  // Aucune nouvelle prévision dans la journée. À partir des scénarios du matin, la page recalcule
  // (un affichage, la note officielle reste celle du journal) :
  //   - les zones touchées (✓, créneau de la bougie) et les invalidations (✗, avec la raison) ;
  //   - le chemin restant depuis le prix ACTUEL, les distances aux zones, le temps restant ;
  //   - le scénario dont le prix est le plus près de ce qu'il décrit : un ÉCART, jamais une
  //     probabilité [convention] :
  //       chemin : e = d(prochaine zone) / (d(prochaine zone) + d(invalidation)), distances aux
  //                bords des zones (0 = sur la zone, 1 = sur l'invalidation) ;
  //       range  : e = 1 − d(bord toléré le plus proche) / demi-largeur tolérée (0 au milieu, 1 au bord).
  //     Le NOM du scénario au plus petit écart ne change qu'à la clôture d'un quart d'heure (grille
  //     fixe, quel que soit l'intervalle affiché ; 1 min et 5 min regroupées), et seulement si un
  //     autre a au moins `ecartChangement` d'avance (hystérésis). La bougie en cours met à jour les
  //     distances et les contacts (un contact est un fait), jamais le nom — sauf si elle FERME le
  //     scénario nommé : le suivant est pris tout de suite. Départ : le rang 1 du matin, à la sortie
  //     de « trop tôt pour départager » (état d'entrée seulement, mémorisé dans le rejeu).
  // Les nombres : PJ = PARAM.scenarios.jour (js/app.js).
  const PJ_DEFAUT = { ecartChangement: 0.12, departageMinutes: 60, departageMouvementPct: 0.5, horsMarges: 1, fonduMinutes: 60, colle: 0.5, quartMs: 900000 };
  const pj = PJ => Object.assign({}, PJ_DEFAUT, PJ || {});
  const OUVERTS_JOUR = ['avant', 'rien', 'cible', 'dedans'];
  /** Distance du prix p à la zone z = [bas, haut] (0 dedans). */
  const distanceZone = (p, z) => (p < z[0] ? z[0] - p : p > z[1] ? p - z[1] : 0);
  /** Le bord de z que le prix p rencontrerait d'abord (null : p est dedans). */
  const bordVers = (p, z) => (p < z[0] ? z[0] : p > z[1] ? z[1] : null);
  /** Un scénario du jour est-il OUVERT pour le classement (statut ⏳, suivi possible, rien de décisif) ? */
  function ouvertJour(S, sv, maintenant) {
    if (S.statut !== '⏳' || (fini(maintenant) && maintenant >= S.fin)) return false;
    return !!sv && OUVERTS_JOUR.includes(sv.cle) && !sv.fini;
  }
  /** Où est le prix par rapport à ce que décrit le scénario (ouvert).
   *  chemin → { e, k, cible, zoneCible, dCible, bordCible, inv, zoneInv, dInv, bordInv, sens }
   *  range  → { e, bord ('haut' | 'bas'), borne (niveau du fichier), niveauBord (toléré), dBord, demi }
   *  null si le scénario n'a plus de cible devant lui. */
  function position(S, sv, P) {
    if (!fini(P)) return null;
    if (S.forme === 'range') {
      const B = S.zones.bas, H = S.zones.haut, dH = H - P, dB = P - B, demi = (H - B) / 2;
      const bord = dH <= dB ? 'haut' : 'bas', d = Math.min(dH, dB);
      return { forme: 'range', e: Math.max(0, Math.min(1, 1 - d / demi)), bord, borne: bord === 'haut' ? S.range[1] : S.range[0], niveauBord: bord === 'haut' ? H : B, dBord: Math.max(0, d), demi };
    }
    const N = S.cibles.length, k = sv && sv.cle === 'cible' ? sv.k : 0;
    if (k >= N) return null;
    const Z = S.zones.cibles[k], dZ = distanceZone(P, Z);
    const r = { forme: 'chemin', k, cible: S.cibles[k], zoneCible: Z, dCible: dZ, bordCible: bordVers(P, Z), inv: S.invalidation, zoneInv: S.zones.inv, dInv: null, bordInv: null,
      sens: S.cibles[k] >= (k ? S.cibles[k - 1] : fini(S.prixEmission) ? S.prixEmission : P) ? 1 : -1 };
    if (S.zones.inv) {
      const dI = distanceZone(P, S.zones.inv);
      r.dInv = dI; r.bordInv = bordVers(P, S.zones.inv);
      r.e = dZ + dI > 0 ? dZ / (dZ + dI) : 0;
    } else {
      // Sans invalidation : la distance de la référence (prix du point, ou cible précédente) à la zone.
      const ref = k ? S.cibles[k - 1] : fini(S.prixEmission) ? S.prixEmission : P, D0 = distanceZone(ref, Z) || 1;
      r.e = dZ / (dZ + D0); r.d0 = D0;
    }
    return r;
  }
  /** La fermeture d'un scénario : un fait, avec son moment. → null (ouvert, ou rien à dire) |
   *  { type: 'realise' | 'invalide' | 'sortie' | 'ambigu' | 'note', journal, t (ouverture de la bougie
   *  du contact, ou resolu_utc), tFin (fin du créneau, départ du fondu), zone, bord, meche, statut }. */
  function fermeture(S, sv) {
    if (S.statut !== '⏳') {
      const type = S.statut === '✅' ? 'realise' : S.statut === '❌' ? 'invalide' : S.statut === '⚠' ? 'ambigu' : 'note';
      return { type, journal: true, statut: S.statut, t: fini(S.resolu) ? S.resolu : null, tFin: fini(S.resolu) ? S.resolu : null, zone: null, bord: null, meche: false };
    }
    if (!sv || !fini(sv.t)) return null;
    const pas = sv.pas || 0, base = { journal: false, t: sv.t, tFin: sv.t + pas, meche: false, zone: null, bord: null };
    if (sv.cle === 'realise') {
      const N = S.cibles.length;
      return Object.assign(base, { type: 'realise', zone: S.zones.cibles[N - 1], niveau: S.cibles[N - 1], meche: !!(sv.meche && sv.meche[N - 1]) });
    }
    if (sv.cle === 'invalide') return Object.assign(base, { type: 'invalide', zone: S.zones.inv, niveau: S.invalidation, meche: !!sv.mecheInv, premier: !!sv.premier });
    if (sv.cle === 'sortie') {
      const haut = !!(sv.sortie && sv.sortie.haut);
      return Object.assign(base, { type: 'sortie', haut, niveau: haut ? S.zones.haut : S.zones.bas, borne: haut ? S.range[1] : S.range[0], meche: !!(sv.sortie && sv.sortie.meche) });
    }
    if (sv.cle === 'ambigu') return Object.assign(base, { type: 'ambigu' });
    return null;
  }
  /** Le fondu d'un scénario fermé : 1 jusqu'à la FIN du créneau du contact (clôture de sa bougie),
   *  puis de 1 à 0 en `fonduMinutes`. Même valeur pour tous les lecteurs. */
  function fondu(tFin, maintenant, PJ) {
    if (!fini(tFin) || !fini(maintenant)) return 0;
    if (maintenant <= tFin) return 1;
    return Math.max(0, 1 - (maintenant - tFin) / (pj(PJ).fonduMinutes * 60000));
  }
  /** Le temps restant : « 13 h 25 », « 1 h 00 », « 47 min », « moins d’une minute » ; null après la fin. */
  function reste(ms) {
    if (!fini(ms) || ms <= 0) return null;
    const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
    if (h >= 1) return h + ' h ' + String(m).padStart(2, '0');
    return m >= 1 ? m + ' min' : 'moins d’une minute';
  }
  /** Le meneur peut-il se décider sur la grille des quarts d'heure avec ces bougies (pasMs) ? 1 min,
   *  5 min, 15 min : oui ; 1 h et plus : non (« à voir en 15 min »). */
  const grilleOk = (pasMs, PJ) => { const q = pj(PJ).quartMs; return pasMs > 0 && pasMs <= q && q % pasMs === 0; };
  /** La décision d'une clôture de quart d'heure. items : [{ sc, sv }] (rangs 1 à 3), P : la
   *  clôture, t : l'heure de la clôture, mem = { prec, sortiTot } (modifié). → { cas, prec, best, change } */
  function decider(items, P, F, t, mem, PJ) {
    const Q = pj(PJ);
    const ouv = items.filter(i => ouvertJour(i.sc, i.sv, t)).map(i => ({ sc: i.sc, sv: i.sv, pos: position(i.sc, i.sv, P) })).filter(i => i.pos);
    ouv.sort((a, b) => a.pos.e - b.pos.e || RANGS.indexOf(a.sc.rang) - RANGS.indexOf(b.sc.rang));
    if (ouv.length < 2) return { cas: ouv.length ? 'seul' : 'ferme', prec: mem.prec, change: false };
    if (!mem.sortiTot) {
      const P0 = fini(F.prixEmission) ? F.prixEmission : ouv[0].sc.prixEmission;
      const tot = t - F.emis < Q.departageMinutes * 60000 && fini(P0) && Math.abs(P - P0) < Q.departageMouvementPct / 100 * P0 && !ouv.some(i => i.sv.k > 0);
      if (tot) return { cas: 'tot', prec: null, change: false };
      mem.sortiTot = true;
      const un = ouv.find(i => i.sc.rang === '1');
      mem.prec = (un || ouv[0]).sc.id;
    }
    let change = false;
    const p = ouv.find(i => i.sc.id === mem.prec);
    if (!p) { change = mem.prec !== null; mem.prec = ouv[0].sc.id; }
    else if (ouv[0] !== p && p.pos.e - ouv[0].pos.e >= Q.ecartChangement - 1e-9) { mem.prec = ouv[0].sc.id; change = true; }
    return { cas: ouv[0].pos.e >= Q.colle ? 'aucunNeColle' : 'meneur', prec: mem.prec, change };
  }
  /** Le rejeu de la journée sur les bougies CLOSES [0, n) du graphique (T en s, H, L, C), regroupées
   *  par quart d'heure : les plis des quarts et la décision de chaque clôture depuis le point.
   *  scs : les scénarios du jour (rangs 1 à 3). Déterministe : tout lecteur obtient le même nom au
   *  même moment, quel que soit l'heure d'ouverture de la page ou l'intervalle (1, 5 ou 15 min).
   *  → { grille, cas, prec, sortiTot, tDecision (dernière clôture décidée), changements: [{ t, id, de }], decisions } */
  function rejouerJour(F, scs, T, H, L, C, n, pasMs, PJ, garderDecisions) {
    const Q = pj(PJ), q = Q.quartMs;
    const out = { grille: grilleOk(pasMs, Q), cas: 'tot', prec: null, sortiTot: false, tDecision: null, changements: [], decisions: garderDecisions ? [] : null };
    if (!out.grille || !scs.length || !(n > 0)) return out;
    const debut = Math.min(...scs.map(s => s.emis)), finJ = Math.max(...scs.map(s => s.fin));
    const plis = scs.map(() => suiviVide(q)), mem = { prec: null, sortiTot: false }, parQuart = q / pasMs;
    // La première bougie utile : celle du quart qui contient le point (recherche dichotomique).
    let a = 0, b = n;
    const t0 = Math.floor(debut / q) * q / 1000;
    while (a < b) { const m = (a + b) >> 1; if (T[m] < t0) a = m + 1; else b = m; }
    let qCour = null, hq = -Infinity, lq = Infinity, cq = NaN, nb = 0, iq = 0;
    const fermer = () => {
      if (qCour === null || nb !== parQuart) return;      // quart incomplet (trou dans l'historique) : pas de décision
      const tClo = qCour + q;
      if (tClo > finJ) return;
      for (let j = 0; j < scs.length; j++) if (compte(scs[j], qCour, q)) pas(scs[j], plis[j], iq, qCour, hq, lq, cq);
      iq++;
      if (tClo <= debut) return;
      const items = scs.map((sc, j) => ({ sc: sc.statut !== '⏳' && (!fini(sc.resolu) || sc.resolu <= tClo) ? sc : Object.assign({}, sc, { statut: '⏳' }), sv: etat(sc, plis[j], tClo) }));
      const avant = mem.prec;
      const d = decider(items, cq, F, tClo, mem, Q);
      if (d.cas === 'tot' || d.cas === 'meneur' || d.cas === 'aucunNeColle') out.cas = d.cas;
      else out.cas = d.cas;
      out.tDecision = tClo;
      if (d.change && avant !== null) out.changements.push({ t: tClo, id: mem.prec, de: avant });
      if (out.decisions) out.decisions.push({ t: tClo, cas: d.cas, prec: mem.prec, prix: cq });
    };
    for (let i = a; i < n; i++) {
      const t = T[i] * 1000, tq = Math.floor(t / q) * q;
      if (tq !== qCour) { fermer(); qCour = tq; hq = -Infinity; lq = Infinity; nb = 0; }
      if (H[i] > hq) hq = H[i];
      if (L[i] < lq) lq = L[i];
      cq = C[i]; nb++;
    }
    fermer();
    out.prec = mem.prec; out.sortiTot = mem.sortiTot;
    return out;
  }
  /** Le prix est-il au-delà de tous les niveaux du matin (de plus de `horsMarges` marges au-delà du
   *  bord extérieur de la zone la plus extrême) ? → { haut, seuil } | null */
  function horsNiveaux(scs, P, PJ) {
    if (!fini(P) || !scs.length) return null;
    let hi = -Infinity, lo = Infinity, m = 0;
    for (const s of scs) {
      const z = s.forme === 'range' ? [[s.zones.bas, s.zones.haut]] : s.zones.cibles.concat(s.zones.inv ? [s.zones.inv] : []);
      for (const x of z) { hi = Math.max(hi, x[1]); lo = Math.min(lo, x[0]); }
      m = Math.max(m, s.marge);
    }
    const k = pj(PJ).horsMarges * m / 100, sh = hi * (1 + k), sb = lo * (1 - k);
    return P > sh ? { haut: true, seuil: sh } : P < sb ? { haut: false, seuil: sb } : null;
  }
  const estRealise = it => it.sc.statut === '✅' || (it.sc.statut === '⏳' && it.sv && it.sv.cle === 'realise');
  /** L'état de la journée, à chaque dessin. items : [{ sc, sv }] (tous les rangs, suivi de
   *  l'intervalle affiché, bougie en cours comprise) ; P : le prix (clôture de la dernière bougie) ;
   *  rejeu : rejouerJour(…) sur les bougies closes. Les items des rangs 1 à 3 reçoivent ouvert, pos,
   *  ferme, fondu ; le rang S n'entre jamais dans le classement.
   *  → { cas: 'fini' | 'realise' | 'aucun' | 'seul' | 'grille' | 'tot' | 'meneur' | 'aucunNeColle',
   *      meneur, seul, ouverts (triés par écart), realises, hors, montre, reste, fin, tDecision } */
  function classerJour(items, P, F, maintenant, rejeu, PJ) {
    const Q = pj(PJ), jour = (items || []).filter(i => i.sc.rang !== 'S');
    for (const it of jour) {
      it.ouvert = ouvertJour(it.sc, it.sv, maintenant);
      it.pos = it.ouvert ? position(it.sc, it.sv, P) : null;
      if (!it.pos) it.ouvert = false;
      it.ferme = it.ouvert ? null : fermeture(it.sc, it.sv);
      it.fondu = it.ferme && (it.ferme.type === 'invalide' || it.ferme.type === 'sortie' || it.ferme.type === 'ambigu') ? fondu(it.ferme.tFin, maintenant, Q) : null;
    }
    const finJ = jour.length ? Math.max(...jour.map(i => i.sc.fin)) : F && F.fin;
    const ouverts = jour.filter(i => i.ouvert).sort((a, b) => a.pos.e - b.pos.e || RANGS.indexOf(a.sc.rang) - RANGS.indexOf(b.sc.rang));
    const realises = jour.filter(estRealise);
    const r = { cas: null, meneur: null, seul: null, ouverts, realises, items: jour, hors: horsNiveaux(jour.map(i => i.sc), P, Q), prix: P,
      fin: finJ, reste: fini(finJ) && fini(maintenant) ? finJ - maintenant : null, tDecision: rejeu ? rejeu.tDecision : null, montre: null, remplace: false };
    if (fini(maintenant) && fini(finJ) && maintenant >= finJ) r.cas = 'fini';
    else if (!ouverts.length) r.cas = realises.length ? 'realise' : 'aucun';
    else if (ouverts.length === 1) { r.cas = 'seul'; r.seul = ouverts[0]; }
    else if (!rejeu || !rejeu.grille) r.cas = 'grille';
    else if (!rejeu.sortiTot) r.cas = 'tot';
    else {
      let m = ouverts.find(i => i.sc.id === rejeu.prec);
      if (!m) { m = ouverts[0]; r.remplace = true; }     // le nommé vient de se fermer : le suivant, tout de suite
      r.cas = (r.remplace ? ouverts[0].pos.e >= Q.colle : rejeu.cas === 'aucunNeColle') ? 'aucunNeColle' : 'meneur';
      if (r.cas === 'meneur') r.meneur = m;
    }
    // Le scénario MONTRÉ (Débutant) : le rang 1 s'il est ouvert ou réalisé ; sinon le plus petit rang
    // encore ouvert ; sinon un réalisé ; sinon le rang 1 pendant son fondu. Il ne change qu'à une
    // fermeture (un fait), jamais avec le meneur.
    const un = jour.find(i => i.sc.rang === '1');
    const parRang = L => L.slice().sort((a, b) => RANGS.indexOf(a.sc.rang) - RANGS.indexOf(b.sc.rang));
    if (un && (un.ouvert || estRealise(un))) r.montre = un;
    else if (ouverts.length) r.montre = parRang(ouverts)[0];
    else if (realises.length) r.montre = parRang(realises)[0];
    else if (un && un.fondu > 0) r.montre = un;
    return r;
  }

  // ─── 5 bis. Les mots de la journée ─────────────────────────────────────────
  const dollars = v => prix(Math.round(v));
  const virg2 = v => nb((Math.round(v * 100) / 100).toFixed(2));
  const dec1 = v => (Math.round(v * 10) / 10).toLocaleString('fr-FR', { maximumFractionDigits: 1 }).replace(/[  ]/g, ' ');
  /** Le nom d'un créneau de bougie, pour un débutant : « le même quart d'heure ». */
  const memeCreneau = pasMs => (pasMs === 60000 ? 'la même minute' : pasMs === 900000 ? 'le même quart d’heure' : pasMs === 3600000 ? 'la même heure' : pasMs > 0 ? 'les mêmes ' + Math.round(pasMs / 60000) + ' minutes' : 'le même moment');
  /** Pourquoi un scénario s'est fermé, en mots. → texte (sans majuscule ni point). */
  function raison(S, sv, mode) {
    const exp = mode === 'expert', f = fermeture(S, sv);
    if (!f || f.journal) return null;
    if (f.type === 'invalide') {
      const z = f.zone, prochaine = S.cibles[sv.premier ? Math.min(1, S.cibles.length - 1) : 0];
      if (exp) return 'zone ' + chiffres(S.invalidation) + ' touchée' + (sv.premier ? ' après la 1re cible' : ' avant ' + chiffres(prochaine)) + (f.meche ? ' (en mèche : contact, règle du journal)' : '');
      return 'le prix a touché la zone de ' + prix(S.invalidation) + ' (à partir de ' + dollars(S.invalidation > (fini(S.prixEmission) ? S.prixEmission : S.cibles[0]) ? z[0] : z[1]) + ') avant de toucher la zone de ' + prix(prochaine);
    }
    if (f.type === 'sortie') {
      if (exp) return 'borne ' + (f.haut ? 'haute ' : 'basse ') + chiffres(f.niveau) + ' dépassée' + (f.meche ? ' (en mèche : contact, règle du journal)' : '');
      return 'le prix est passé ' + (f.haut ? 'au-dessus de ' : 'au-dessous de ') + dollars(f.niveau) + ' (' + prix(f.borne) + (f.haut ? ' plus' : ' moins') + ' la marge)';
    }
    if (f.type === 'ambigu') {
      if (exp) return (S.forme === 'range' ? 'les deux bornes' : 'cible et invalidation') + ' dans la même bougie : ordre inconnu';
      return 'non tranché : ' + (S.forme === 'range' ? 'les deux limites ont été dépassées' : 'la cible et l’invalidation ont été touchées') + ' dans ' + memeCreneau(sv.pas) + ', et l’ordre est inconnu ; le journal tranchera avec les minutes';
    }
    if (f.type === 'realise') {
      if (exp) return 'zone ' + chiffres(f.niveau) + ' touchée' + (f.meche ? ' (en mèche : contact, règle du journal)' : '');
      return 'le prix a touché la zone de ' + prix(f.niveau) + (f.meche ? ', par un passage bref du prix : le journal compte ce passage, alors que pour les figures, la page attend que le prix s’y maintienne' : '');
    }
    return null;
  }
  /** Le nom d'un scénario de la journée dans une phrase : « le 3 ». */
  const leN = it => 'le ' + it.sc.rang;
  /** Le niveau d'un scénario en court : sa prochaine cible (chemin) ou ses bornes (range). */
  function niveauCourt(it) {
    const S = it.sc;
    if (S.forme === 'range') return chiffres(S.range[0]) + '–' + prix(S.range[1]);
    const k = it.pos ? it.pos.k : 0;
    return prix(S.cibles[Math.min(k, S.cibles.length - 1)]);
  }
  /** Le mot court de la fermeture du rang 1 : « invalidé », « sorti », « indécis ». */
  const motFerme = it => (it.ferme && it.ferme.type === 'sortie' ? 'sorti' : it.ferme && it.ferme.type === 'ambigu' ? 'indécis' : 'invalidé');
  /** La ligne des scénarios du Débutant pendant la journée (au plus `max` caractères et `maxPx`
   *  pixels). jour : classerJour(…). Les cas où rien de la journée ne change (fichier absent ou
   *  d'attente, groupe terminé, suivi impossible) passent par ligneBoiteDebutant, inchangée.
   *  Toute ligne calculée porte « (en direct) » ou commence par « En direct : » ; une note du
   *  journal, « (journal) » ; jamais les deux. */
  function ligneJourDebutant(F, jour, items, maintenant, max, P, mesure, maxPx) {
    const base = () => ligneBoiteDebutant(F, items, maintenant, max, P, mesure, maxPx);
    if (!F || F.etat !== 'ok' || !jour || estAncien(F, maintenant) || jour.cas === 'fini') return base();
    const un = jour.items.find(i => i.sc.rang === '1');
    if (!un || (un.sv && ['large', 'incomplet'].includes(un.sv.cle)) || (un.sv && un.sv.cle === 'avant')) return base();
    const V = [], M = jour.montre, real = jour.realises.filter(i => i !== un), r1 = real.length ? real[0] : null;
    const men = jour.meneur;
    if (!jour.ouverts.length && !jour.realises.length) {
      V.push('Aucun scénario ne tient plus (en direct) ▸', 'Aucun ne tient plus (en direct) ▸');
      return premiere(V, max, mesure, maxPx);
    }
    const unFerme = !un.ouvert && !estRealise(un);
    if (unFerme) {
      const mot = motFerme(un), journal = un.sc.statut !== '⏳';
      if (journal) {
        const etatJ = un.sc.statut === '❌' ? 'invalidé ✗' : ETATS_COURTS_DEBUTANT.journal[un.sc.statut] || 'noté';
        if (men && men === M) V.push('Scén. 1 ✗ (journal) · ' + leN(men) + ' suit mieux ▸');
        V.push('Scén. 1 ' + etatJ + ' (journal) ▸', 'Scén. 1 ✗ (journal) ▸');
        return premiere(V, max, mesure, maxPx);
      }
      const croix = mot === 'indécis' ? 'indécis' : mot + ' ✗';
      if (!jour.ouverts.length && r1) V.push('Scén. 1 ' + mot + ' · ' + leN(r1) + ' réalisé ✓ (en direct) ▸', 'Scén. 1 ✗ · ' + leN(r1) + ' réalisé ✓ (en direct) ▸');
      else if (r1) V.push('Scén. 1 ✗ · ' + leN(r1) + ' réalisé ✓ (en direct) ▸');
      else if (men && men === M) V.push('Scén. 1 ✗ (en direct) · ' + leN(men) + ' suit mieux ▸');
      else if (jour.cas === 'seul') V.push('Scén. 1 ✗ · seul ' + leN(jour.seul) + ' en cours (en direct) ▸');
      V.push('Scén. 1 ' + croix + ' (en direct) ▸', 'Scén. 1 ✗ (en direct) ▸');
      return premiere(V, max, mesure, maxPx);
    }
    if (estRealise(un)) return base();
    // Le rang 1 est ouvert (et montré).
    const k = un.sv && un.sv.cle === 'cible' ? un.sv.k : 0;
    if (r1) {
      if (k) V.push('Scén. : ' + ordinal(k) + ' cible ✓ · ' + leN(r1) + ' réalisé ✓ (en direct) ▸');
      V.push('Scén. : en cours · ' + leN(r1) + ' réalisé ✓ (en direct) ▸', 'En cours · ' + leN(r1) + ' réalisé ✓ (en direct) ▸');
      return premiere(V, max, mesure, maxPx);
    }
    if (jour.cas === 'seul') {
      V.push('En direct : seul ' + leN(un) + ' est encore en cours ▸');
      return premiere(V.filter(t => t.length <= max).concat([base()]), max, mesure, maxPx);
    }
    if (men && men !== un && !k) {
      if (men.sc.forme === 'range') V.push('En direct : ' + leN(men) + ' (' + niveauCourt(men) + ') suit mieux ▸');
      else V.push('En direct : ' + leN(men) + ' (' + niveauCourt(men) + ') suit mieux le prix ▸', 'En direct : ' + leN(men) + ' (' + niveauCourt(men) + ') suit mieux ▸');
      // Trop long (étroit) : le cas A ; le nom reste dans la bulle.
      return premiere(V.filter(t => tient(t, max, mesure, maxPx)).concat([base()]), max, mesure, maxPx);
    }
    return base();
  }
  /** Le libellé du scénario MONTRÉ (Débutant) quand il est réalisé ou fermé : « Scénario 2 : zone
   *  80 806 $ ✓ » ; « Scén. 1 invalidé ✗ vers 17h15 » (heure de Paris du créneau du contact). Les
   *  autres cas : libellesDebutant. */
  function libellesJourDebutant(it, max, fleche) {
    const S = it.sc, f = fleche ? fleche + ' ' : '';
    if (estRealise(it)) {
      const v = S.forme === 'range' ? null : S.cibles[S.cibles.length - 1];
      if (v === null) return libellesDebutant(S, it.sv, max, fleche);
      const V = ['Scénario ' + S.rang + ' : zone ' + prix(v) + ' ✓', 'Scén. ' + S.rang + ' : zone ' + prix(v) + ' ✓', 'Scén. ' + S.rang + ' : zone ' + chiffres(v) + ' ✓', 'Scén. ' + S.rang + ' ✓'].map(t => f + t);
      return V.filter((t, i) => i === V.length - 1 || !(max > 0) || t.length <= max);
    }
    if (!it.ouvert && it.ferme) {
      const h = fini(it.ferme.t) ? heureParis(it.ferme.t) : null, mot = motFerme(it), croix = mot === 'indécis' ? 'indécis' : mot + ' ✗';
      const V = (h ? ['Scén. ' + S.rang + ' ' + croix + ' vers ' + h] : []).concat(['Scén. ' + S.rang + ' ' + croix]).map(t => f + t);
      return V.filter((t, i) => i === V.length - 1 || !(max > 0) || t.length <= max);
    }
    return libellesDebutant(S, it.sv, max, fleche);
  }
  /** « Valables jusqu'à demain 06h20 (heure de Paris) : encore 13 h 25. » */
  function texteResteDebutant(jour, maintenant) {
    if (!jour || !fini(jour.fin)) return null;
    const h = heureParis(jour.fin), r = reste(jour.fin - maintenant);
    const jF = jourParis(jour.fin), jA = jourParis(maintenant), demain = jourParis(maintenant + 86400000);
    const quand = jF === jA ? 'aujourd’hui' : jF === demain ? 'demain' : 'le ' + jF;
    if (!r) return 'Terminés depuis ' + quand.replace('aujourd’hui', 'aujourd’hui') + (h ? ' ' + h : '') + ' (heure de Paris) ; la note du journal suivra.';
    return 'Valables jusqu’à ' + quand + (h ? ' ' + h : '') + ' (heure de Paris) : encore ' + r + '. Pas de nouvelle prévision d’ici là : la page recalcule seulement où en est chaque scénario du matin.';
  }
  /** La ligne d'un scénario dans la bulle du Débutant : ce qu'il dit, son état, ses distances.
   *  « 3. Le prix va vers 84 500 $, sans toucher 80 400 $ avant — en cours (en direct) : encore 559 $
   *  jusqu'au début de sa zone (83 655 $, autour de 84 500 $) ; ce qui l'invaliderait commence à
   *  1 892 $ (81 204 $). » court : sans « Le prix va vers … ». */
  function ligneDebutantJour(it, jour, court) {
    const S = it.sc, sv = it.sv, e = etatCourtDebutant(S, sv);
    let t = court ? MARQUES_RANG[S.rang] + ' ' + e.etat + (e.marque ? ' ' + e.marque : '') : ligneDebutant(S, sv);
    if (jour && jour.meneur === it) t += !nomNet(jour) ? (court ? ', nommé au dernier quart d’heure' : ', nommé au dernier quart d’heure décidé') : court ? ', suit le mieux le prix' : ', suit le mieux le prix pour l’instant';
    const d = distancesDebutant(it, court);
    return t + (d ? ' : ' + d : '') + '.';
  }
  /** Où en est le prix pour ce scénario, en mots (Débutant) : « encore 559 $ jusqu'au début de sa zone
   *  (83 655 $, autour de 84 500 $) ; ce qui l'invaliderait commence à 1 892 $ (81 204 $) » ; range :
   *  « il est à 1 239 $ de sa limite haute (83 500 $ plus la marge, soit 84 335 $) » ; fermé : sa raison. */
  function distancesDebutant(it, court) {
    const S = it.sc, p = it.pos;
    if (court && p && p.forme === 'chemin') return (p.bordCible === null ? 'dans sa zone' : 'à ' + dollars(p.dCible) + ' de sa zone') + (p.zoneInv ? (p.bordInv === null ? ', dans la zone qui l’invaliderait' : ', à ' + dollars(p.dInv) + ' de ce qui l’invaliderait') : '');
    if (court && p && p.forme === 'range') return 'à ' + dollars(p.dBord) + ' de sa limite ' + (p.bord === 'haut' ? 'haute' : 'basse') + ' (marge comprise)';
    if (court && !it.ouvert) return null;
    if (p && p.forme === 'chemin') {
      let t = p.bordCible === null ? 'le prix est dans sa zone (autour de ' + prix(p.cible) + ')' : 'encore ' + dollars(p.dCible) + ' jusqu’au début de sa zone (' + dollars(p.bordCible) + ', autour de ' + prix(p.cible) + ')';
      if (p.zoneInv) t += p.bordInv === null ? ' ; le prix est dans la zone qui l’invaliderait' : ' ; ce qui l’invaliderait commence à ' + dollars(p.dInv) + ' (' + dollars(p.bordInv) + ')';
      return t;
    }
    if (p && p.forme === 'range') return 'il est à ' + dollars(p.dBord) + ' de sa limite ' + (p.bord === 'haut' ? 'haute (' + prix(p.borne) + ' plus la marge, soit ' : 'basse (' + prix(p.borne) + ' moins la marge, soit ') + dollars(p.niveauBord) + ')';
    if (!it.ouvert && S.statut === '⏳') return raison(S, it.sv, 'debutant');
    return null;
  }
  /** La phrase du Débutant sur le scénario au plus petit écart (bulle de la ligne), ou null. */
  /** La phrase courte du nom (bulles du libellé et écran court, Débutant) ; it : le scénario de la
   *  bulle (ou rien). Nom gardé sans le plus petit écart : dit tel quel. */
  function phraseNomDebutant(jour, it) {
    if (!jour || jour.cas !== 'meneur' || !jour.meneur) return null;
    const n = jour.meneur.sc.rang;
    if (!nomNet(jour)) return 'Le scénario ' + n + ' a été nommé au dernier quart d’heure décidé ; depuis, le prix s’est rapproché du scénario ' + jour.ouverts[0].sc.rang + ', pas encore assez nettement pour changer de nom (une règle de calcul, pas une prévision).';
    if (it && it === jour.meneur) return 'Pour l’instant, il suit le mieux le prix (décidé tous les quarts d’heure) : une règle de calcul, pas une prévision.';
    return 'Pour l’instant, le prix est le plus près de ce que décrit le scénario ' + n + ' (décidé tous les quarts d’heure) : une règle de calcul, pas une prévision ni une chance de réussite.';
  }
  function phraseMeneurDebutant(jour) {
    if (!jour) return null;
    const regle = 'Une règle de calcul, pas une prévision ni une chance de réussite.';
    if (jour.cas === 'meneur' && jour.meneur) {
      const m = jour.meneur, un = jour.items.find(i => i.sc.rang === '1');
      let excl = 'Les scénarios ne s’excluent pas toujours : leurs zones peuvent se recouvrir.';
      if (un && un !== m && un.ouvert && un.sc.forme === 'range' && m.pos && m.pos.zoneCible && m.pos.zoneCible[0] <= un.sc.zones.haut && m.pos.zoneCible[1] >= un.sc.zones.bas)
        excl = 'Les scénarios ne s’excluent pas : ' + leN(m) + ' peut se réaliser pendant que le 1 tient.';
      // Nom gardé (le prix s'est rapproché d'un autre, pas encore nettement, ou depuis moins d'un
      // quart d'heure) : dit tel quel, jamais « le plus près » pour un scénario qui ne l'est plus.
      if (!nomNet(jour)) return 'Au dernier quart d’heure décidé, le prix était le plus près de ce que décrit le scénario ' + m.sc.rang + ' ; depuis, il s’est rapproché du scénario ' + jour.ouverts[0].sc.rang + ', pas encore assez nettement pour changer de nom (décidé tous les quarts d’heure). ' + excl + ' ' + regle;
      return 'Pour l’instant, le prix est le plus près de ce que décrit le scénario ' + m.sc.rang + ' (décidé tous les quarts d’heure, seulement si l’écart est net). ' + excl + ' ' + regle;
    }
    if (jour.cas === 'tot') return 'Trop tôt pour départager : le prix a encore peu bougé depuis le point du matin ; le classement du matin tient.';
    if (jour.cas === 'aucunNeColle') return 'Aucun scénario en cours ne colle au prix : chacun est plus près de ce qui l’invaliderait que de sa zone (pour « le prix reste entre », plus près d’une limite que du milieu). ' + regle;
    if (jour.cas === 'seul') return 'Un seul scénario est encore en cours : le ' + jour.seul.sc.rang + '.' + (jour.seul.pos && jour.seul.pos.e >= 0.5 ? ' Le prix est plus près de ce qui l’invaliderait que de ce qu’il décrit.' : '');
    if (jour.cas === 'grille') return 'Sur des bougies d’une heure, la page ne dit pas quel scénario suit le mieux le prix : à voir en 15 min.';
    if (jour.cas === 'aucun') return 'Aucun scénario du matin ne décrit ce mouvement : les trois ne tiennent plus (en direct). Pas de nouvelle prévision avant le prochain point de 07h00.';
    return null;
  }
  const COMMENT_DEBUTANT = 'Comment « suit le mieux » est choisi : parmi les scénarios encore en cours, celui dont le prix est le plus près de sa prochaine zone, comparé à la distance jusqu’à ce qui l’invaliderait (pour « le prix reste entre », le plus loin des limites) ; décidé tous les quarts d’heure, seulement si un autre est nettement plus près. Au départ, c’est le scénario 1.';
  /** La phrase de l'encadré Expert sur la journée : la plus longue variante qui tient d'abord.
   *  → [variantes] (de la plus riche à la plus courte), ou [] */
  /** Le nom affiché a-t-il, en ce moment, le plus petit écart des scénarios en cours ? (Sinon il
   *  est gardé jusqu'à une clôture de 15 min où un autre est nettement plus près.) */
  const nomNet = jour => !!(jour && jour.meneur && (!jour.ouverts.length || jour.ouverts[0] === jour.meneur || !jour.ouverts[0].pos || jour.ouverts[0].pos.e >= jour.meneur.pos.e));
  function phraseJourExpert(jour, P) {
    if (!jour) return [];
    const finU = heureUTC(jour.fin) + ' UTC';
    const hors = jour.hors ? ' · prix au-delà de tous les niveaux du matin (' + (jour.hors.haut ? 'au-dessus de ' : 'au-dessous de ') + dollars(jour.hors.seuil) + ')' : '';
    switch (jour.cas) {
      case 'fini': return ['Terminé à ' + finU + ' · note du journal à venir'];
      case 'meneur': {
        // Le nom ne change qu'à une clôture de 15 min, et seulement si l'écart est net (A1,
        // hystérésis) : entre-temps, un autre scénario peut avoir un écart un peu plus petit. Alors
        // l'encadré dit les deux, au lieu d'attribuer le plus petit écart au nom gardé.
        const n = jour.meneur.sc.rang;
        if (nomNet(jour)) return ['Plus petit écart pour l’instant : ' + n + ' (une mesure, pas une probabilité)' + hors, 'Plus petit écart : ' + n + ' (pas une probabilité)' + hors, 'Plus petit écart : ' + n + ' (pas une probabilité)', 'Écart min. : ' + n];
        const m = jour.ouverts[0].sc.rang;
        return ['Plus petit écart pour l’instant : ' + m + ' · nom gardé : ' + n + ' (revu à chaque clôture de 15 min, écart net exigé)' + hors,
          'Plus petit écart : ' + m + ' · nom gardé : ' + n + ' (revu au quart d’heure)', 'Écart min. : ' + m + ' · nom gardé : ' + n];
      }
      case 'tot': return ['Trop tôt pour départager : le classement du matin tient' + hors, 'Trop tôt pour départager'];
      case 'aucunNeColle': return ['Aucun scénario en cours ne colle au prix : chacun est plus près de sa limite que de sa zone' + hors, 'Aucun scénario ne colle au prix'];
      case 'seul': { const s = jour.seul, loin = s.pos && s.pos.e >= 0.5 ? ' (prix plus près de sa limite que de son milieu)' : ''; return ['Seul encore en cours : ' + s.sc.rang + loin + hors, 'Seul en cours : ' + s.sc.rang + loin, 'Seul en cours : ' + s.sc.rang]; }
      case 'grille': return ['Plus petit écart : à voir en 15 min (bougies trop larges)', 'Plus petit écart : à voir en 15 min'];
      case 'realise': { const r = jour.realises.map(i => i.sc.rang).join(', '); return [r + ' réalisé ✓ ; plus aucun scénario en cours' + hors, r + ' réalisé ✓ · plus aucun en cours']; }
      case 'aucun': return ['Aucun scénario du matin ne décrit ce mouvement' + hors, 'Aucun scénario ne décrit ce mouvement'];
      default: return [];
    }
  }
  /** Le suffixe d'une ligne de l'encadré Expert : les distances en dollars (jamais l'indice) ;
   *  « ◂ » pour le plus petit écart. */
  function suffixeExpert(it, jour) {
    const p = it.pos;
    if (!p) return '';
    const m = jour && jour.meneur === it ? ' ◂' : '';
    if (p.forme === 'range') return ' · bord toléré à ' + dollars(p.dBord) + m;
    return ' · zone à ' + dollars(p.dCible) + (p.zoneInv ? ' · inv. à ' + dollars(p.dInv) : '') + m;
  }
  /** « Reste 13 h 25 (fin 10/10 04:20 UTC) · aucune nouvelle prévision avant le prochain point ». */
  function ligneResteExpert(jour) {
    if (!jour || !fini(jour.fin)) return [];
    const r = reste(jour.reste), f = jourGroupe(new Date(jour.fin).toISOString().slice(0, 10)) + ' ' + heureUTC(jour.fin) + ' UTC';
    if (!r) return [];
    return ['Reste ' + r + ' (fin ' + f + ') · aucune nouvelle prévision avant le prochain point', 'Reste ' + r + ' (fin ' + f + ')', 'Reste ' + r];
  }
  /** La ligne du suivi de la journée dans la bulle d'un scénario (Expert). */
  function ligneJourExpert(it, jour, ctx) {
    const S = it.sc, sv = it.sv, c = ctx || {}, p = it.pos, out = [];
    const cr = t => creneau(t, sv ? sv.pas : 0, c.maintenant, true);
    if (sv && sv.touchees) sv.touchees.forEach((t, j) => { if (fini(t)) out.push(ordinal(j + 1) + ' cible touchée' + (sv.meche && sv.meche[j] ? ' en mèche' : '') + ' ' + cr(t) + (sv.meche && sv.meche[j] ? ' (contact : règle du journal)' : '')); });
    if (p && p.forme === 'chemin') {
      out.push('prochaine zone ' + chiffres(p.cible) + (p.bordCible !== null ? ' (dès ' + dollars(p.bordCible) + ') à ' + dollars(p.dCible) : ' : prix dedans'));
      if (p.zoneInv) out.push('invalidation ' + chiffres(p.inv) + (p.bordInv !== null ? ' (dès ' + dollars(p.bordInv) + ') à ' + dollars(p.dInv) : ' : prix dedans'));
      out.push('écart relatif ' + virg2(p.e) + ' = ' + (p.zoneInv ? chiffres(Math.round(p.dCible)) + ' / (' + chiffres(Math.round(p.dCible)) + ' + ' + chiffres(Math.round(p.dInv)) + ') (0 = sur la zone, 1 = sur l’invalidation)' : chiffres(Math.round(p.dCible)) + ' / (' + chiffres(Math.round(p.dCible)) + ' + ' + chiffres(Math.round(p.d0)) + ') (sans invalidation : distance de la référence à la zone)'));
    } else if (p && p.forme === 'range') {
      out.push('bord toléré le plus proche ' + chiffres(Math.round(p.niveauBord)) + ' à ' + dollars(p.dBord));
      out.push('écart relatif ' + virg2(p.e) + ' = 1 − ' + chiffres(Math.round(p.dBord)) + ' / ' + dec1(p.demi) + ' (0 = au milieu, 1 = sur un bord)');
    } else if (!it.ouvert && S.statut === '⏳') {
      const r = raison(S, sv, 'expert');
      if (r) out.push(r);
    }
    if (jour && jour.meneur === it) out.push('plus petit écart pour l’instant (décidé à chaque clôture de 15 min ; une mesure, pas une probabilité)');
    if (it.fondu !== null && it.fondu !== undefined && it.fondu > 0 && it.fondu < 1) out.push('s’efface (fondu de ' + pj(c.PJ).fonduMinutes + ' min après le créneau du contact)');
    const r = jour ? reste(jour.reste) : null;
    if (r) out.push('reste ' + r + ' (fin ' + jourGroupe(new Date(jour.fin).toISOString().slice(0, 10)) + ' ' + heureUTC(jour.fin) + ' UTC)');
    if (!out.length) return null;
    return 'En direct (bougies ' + (c.itv || '') + ') : ' + out.join(' · ') + '.';
  }
  /** La règle complète (bulle de l'encadré, Expert). */
  function regleJourExpert(PJ) {
    const Q = pj(PJ);
    return ['Écart (une mesure, pas une probabilité ; comparer un range et un chemin par cet écart est une convention) : chemin = d(prochaine zone) / (d(prochaine zone) + d(invalidation)), distances aux bords des zones ; range = 1 − d(bord toléré le plus proche) / demi-largeur tolérée.',
      'Le nom du plus petit écart se décide à chaque clôture de 15 min (bougies 1 et 5 min regroupées ; en 1 h, aucun nom) ; départ : le rang 1 du matin ; un changement demande ' + virg2(Q.ecartChangement) + ' d’avance ; la bougie en cours ne change le nom que si elle ferme le scénario nommé. « Trop tôt pour départager » tant que le prix reste à moins de ' + nb(Q.departageMouvementPct) + ' % du prix du point pendant la 1re heure, puis plus jamais de la journée. Un scénario invalidé s’efface en ' + Q.fonduMinutes + ' min après le créneau du contact ; sa marque ✗ reste.',
      'Les scénarios ne s’excluent pas : leurs zones se recouvrent. Le classement du matin ne change pas. La note officielle reste celle du journal.'];
  }

  return { FORMAT, RANGS, STATUTS, chiffres, prix, heureUTC, heureParis, jourGroupe, dateUTC, zone, lire, vivants, estAncien, ouvert, compte, suiviVide, pas, plier, etat, etatLarge, suivre, copie,
    niveaux, originePremiere, libelle, quand, creneau, motsStatut, texteEtat, titre, ligne, texteBilan, REGLE_BILAN, REGLE_BILAN_SUITE, explication, ligneEtats, noteLarge, manque, etatIncomplet, NOMS_RANG, COURTS_RANG, SENS_RANG,
    ETATS_COURTS_DEBUTANT, etatCourtDebutant, ligneBoiteDebutant, libelleDebutant, libellesDebutant, ligneDebutant, origineDebutant, etatLongDebutant, enteteDebutant, explicationDebutant, jourParis,
    PJ_DEFAUT, distanceZone, ouvertJour, position, fermeture, fondu, reste, grilleOk, decider, rejouerJour, horsNiveaux, classerJour, estRealise, raison, ligneJourDebutant, libellesJourDebutant,
    texteResteDebutant, ligneDebutantJour, distancesDebutant, phraseMeneurDebutant, COMMENT_DEBUTANT, phraseJourExpert, nomNet, phraseNomDebutant, suffixeExpert, ligneResteExpert, ligneJourExpert, regleJourExpert, momentDebutant };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Scenarios;
