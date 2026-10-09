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
  function suiviVide(pasMs) { return { n: 0, k: 0, kOpt: 0, temps: [], tempsI: [], opt: [], tInv: null, iInv: null, sortie: null, touchees: [], dernier: null, debut: null, pas: fini(pasMs) ? pasMs : 0 }; }
  function touche(z, h, l) { return l <= z[1] && h >= z[0]; }
  /** Ajoute la bougie numéro i (ouverte à t ms, plus haut h, plus bas l) au suivi e (modifié). */
  function pas(S, e, i, t, h, l) {
    e.n++; e.dernier = t; if (e.debut === null) e.debut = t;
    if (S.forme === 'range') {
      if (!e.sortie) {
        const b = l <= S.zones.bas, hh = h >= S.zones.haut;
        if (b || hh) e.sortie = { t, i, bas: b, haut: hh };
      }
      return e;
    }
    const Z = S.zones.cibles;
    for (let j = 0; j < Z.length; j++) if (!e.touchees[j] && touche(Z[j], h, l)) e.touchees[j] = t;
    // Chaîne stricte (noter.py) : la cible suivante dans une bougie STRICTEMENT plus tardive.
    if (e.k < Z.length && touche(Z[e.k], h, l) && (e.k === 0 || i > e.tempsI[e.k - 1])) { e.temps.push(t); e.tempsI.push(i); e.k++; }
    // Chaîne possible : plusieurs cibles dans la même bougie (ordre inconnu).
    while (e.kOpt < Z.length && touche(Z[e.kOpt], h, l)) { e.opt.push(t); e.kOpt++; }
    if (e.tInv === null && S.zones.inv && touche(S.zones.inv, h, l)) { e.tInv = t; e.iInv = i; }
    return e;
  }
  const copie = e => ({ n: e.n, k: e.k, kOpt: e.kOpt, temps: e.temps.slice(), tempsI: e.tempsI.slice(), opt: e.opt.slice(), tInv: e.tInv, iInv: e.iInv,
    sortie: e.sortie ? Object.assign({}, e.sortie) : null, touchees: e.touchees.slice(), dernier: e.dernier, debut: e.debut, pas: e.pas });
  /** Une bougie ouverte à t (ms), de durée pasMs, compte-t-elle pour S ? Seulement si elle tient
   *  ENTIÈRE dans la fenêtre [point, fin] : ni celle qui contient le point, ni celle qui déborde
   *  la fin (ce qu'elle a fait après la fin n'est pas du scénario). */
  const compte = (S, t, pasMs) => t >= S.emis && t + (fini(pasMs) ? pasMs : 0) <= S.fin && t < S.fin;
  /** Les bougies de T (s), H, L d'indices [a, b) qui comptent pour S (compte()). pasMs : la durée
   *  d'une bougie (ms). → le pli. */
  function plier(S, T, H, L, a, b, e0, pasMs) {
    const e = e0 ? copie(e0) : suiviVide(pasMs);
    for (let i = a; i < b; i++) {
      const t = T[i] * 1000;
      if (!compte(S, t, e.pas)) continue;
      pas(S, e, i, t, H[i], L[i]);
    }
    return e;
  }
  /** Le pli → l'état lisible.
   *  cle : 'avant' (aucune bougie depuis le point) | 'rien' | 'cible' (k cibles dans l'ordre) |
   *        'realise' | 'invalide' | 'ambigu' (même bougie, ordre inconnu) | 'dedans' | 'sortie'.
   *  fini : le scénario a dépassé sa fin (maintenant ≥ fin). */
  function etat(S, e, maintenant) {
    const r = { cle: null, fini: fini(maintenant) && maintenant >= S.fin, n: e.n, t: null, k: e.k, temps: e.temps, tInv: e.tInv, touchees: e.touchees, sortie: e.sortie, memeBougie: false,
      pas: e.pas || 0, debut: e.debut };
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

  return { FORMAT, RANGS, STATUTS, chiffres, prix, heureUTC, heureParis, jourGroupe, dateUTC, zone, lire, vivants, estAncien, ouvert, compte, suiviVide, pas, plier, etat, etatLarge, suivre, copie,
    niveaux, originePremiere, libelle, quand, creneau, motsStatut, texteEtat, titre, ligne, texteBilan, REGLE_BILAN, REGLE_BILAN_SUITE, explication, ligneEtats, noteLarge, manque, etatIncomplet, NOMS_RANG, COURTS_RANG, SENS_RANG };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Scenarios;
