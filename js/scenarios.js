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
    if (x.origines && typeof x.origines === 'object') for (const [k, v] of Object.entries(x.origines)) if (typeof v === 'string' && v.trim()) origines[k] = v.trim();
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
      precedents: Array.isArray(d.precedents) ? d.precedents.filter(p => p && typeof p.groupe === 'string' && Array.isArray(p.scenarios)) : [] };
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
      fin: Math.max(...jour.concat(gardes).map(s => s.fin)),
    });
  }

  // ─── 2. Suivi en direct (affichage), sur les bougies du graphique ──────────
  // Un pli bougie par bougie : l'état après les bougies CLOSES se mémorise, la bougie en cours
  // s'y ajoute (prolonger) sans rien refaire. Bougie = { t (ms, ouverture), h, l }.
  function suiviVide() { return { n: 0, k: 0, kOpt: 0, temps: [], tempsI: [], opt: [], tInv: null, iInv: null, sortie: null, touchees: [], dernier: null }; }
  function touche(z, h, l) { return l <= z[1] && h >= z[0]; }
  /** Ajoute la bougie numéro i (ouverte à t ms, plus haut h, plus bas l) au suivi e (modifié). */
  function pas(S, e, i, t, h, l) {
    e.n++; e.dernier = t;
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
    sortie: e.sortie ? Object.assign({}, e.sortie) : null, touchees: e.touchees.slice(), dernier: e.dernier });
  /** Les bougies de T (s), H, L d'indices [a, b) qui comptent pour S : ouvertes au point ou après,
   *  avant sa fin. → le pli. */
  function plier(S, T, H, L, a, b, e0) {
    const e = e0 ? copie(e0) : suiviVide();
    for (let i = a; i < b; i++) {
      const t = T[i] * 1000;
      if (t < S.emis || t >= S.fin) continue;
      pas(S, e, i, t, H[i], L[i]);
    }
    return e;
  }
  /** Le pli → l'état lisible.
   *  cle : 'avant' (aucune bougie depuis le point) | 'rien' | 'cible' (k cibles dans l'ordre) |
   *        'realise' | 'invalide' | 'ambigu' (même bougie, ordre inconnu) | 'dedans' | 'sortie'.
   *  fini : le scénario a dépassé sa fin (maintenant ≥ fin). */
  function etat(S, e, maintenant) {
    const r = { cle: null, fini: fini(maintenant) && maintenant >= S.fin, n: e.n, t: null, k: e.k, temps: e.temps, tInv: e.tInv, touchees: e.touchees, sortie: e.sortie, memeBougie: false };
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
  /** Suivi complet sur des colonnes (T en secondes) : → état lisible. */
  function suivre(S, T, H, L, n, maintenant) { return etat(S, plier(S, T, H, L, 0, n), maintenant); }

  // ─── 3. Les mots ───────────────────────────────────────────────────────────
  const NOMS_RANG = { '1': 'Scénario 1', '2': 'Scénario 2', '3': 'Scénario 3', S: 'Scénario de la semaine' };
  const COURTS_RANG = { '1': 'S1', '2': 'S2', '3': 'S3', S: 'Sem.' };
  const MARQUES_RANG = { '1': '1.', '2': '2.', '3': '3.', S: 'Semaine :' };
  /** Les niveaux d'un scénario en mots : « 84 300 $ puis 86 000 $ » ; « entre 81 000 et 84 000 $ ». */
  function niveaux(S, exp) {
    if (S.forme === 'range') return exp ? 'range ' + chiffres(S.range[0]) + ' – ' + chiffres(S.range[1]) : 'entre ' + chiffres(S.range[0]) + ' et ' + prix(S.range[1]);
    return exp ? S.cibles.map(chiffres).join(' > ') : S.cibles.map(prix).join(' puis ');
  }
  const origine = (S, v) => (fini(v) ? S.origines[String(v)] || null : null);
  /** L'origine du premier niveau qui en a une (libellé court). */
  function originePremiere(S) {
    const vs = S.forme === 'range' ? S.range : S.cibles;
    for (const v of vs) { const o = origine(S, v); if (o) return o; }
    return null;
  }
  /** Le libellé posé près d'un scénario.
   *  débutant : « Scénario 1 · 84 300 $ puis 86 000 $ · plus haut du 06/10 » ;
   *  expert   : « S1 84 300 > 86 000 · inv 80 900 ».  court : sans l'origine. */
  function libelle(S, mode, court) {
    if (mode === 'expert') return COURTS_RANG[S.rang] + ' ' + niveaux(S, true) + (S.invalidation !== null ? ' · inv ' + chiffres(S.invalidation) : '');
    const o = court ? null : originePremiere(S);
    return NOMS_RANG[S.rang] + ' · ' + niveaux(S, false) + (o ? ' · ' + o : '');
  }
  /** L'état en mots. sv : l'état du suivi (etat()) ; ctx = { itv (« 15 min ») }.
   *  Un statut résolu du fichier (≠ ⏳) passe AVANT le suivi : c'est la note officielle.
   *  → { texte, court, officiel, cle } */
  function texteEtat(S, sv, statuts, mode, ctx) {
    const lib = (statuts || STATUTS)[S.statut] || STATUTS[S.statut] || S.statut;
    const exp = mode === 'expert';
    if (S.statut !== '⏳') {
      let det = '';
      if (S.forme === 'range' && (S.premierOk === 'bas' || S.premierOk === 'haut')) det = S.premierOk === 'bas' ? ' (borne basse cédée)' : ' (borne haute cédée)';
      else if (S.premierOk === 'oui') det = exp ? ' (1re cible d’abord)' : ' (1re cible touchée avant l’invalidation)';
      else if (S.premierOk === 'non' && S.statut !== '❌') det = exp ? ' (inval. d’abord)' : ' (invalidation touchée d’abord)';
      const quand = fini(S.resolu) ? ' · ' + heureUTC(S.resolu) + ' UTC' : '';
      return { cle: 'officiel', officiel: true, texte: (exp ? 'journal : ' : 'note du journal : ') + lib + det + quand, court: 'journal : ' + lib };
    }
    const h = t => heureUTC(t) + ' UTC';
    const itv = ctx && ctx.itv ? ctx.itv : '';
    let t, c;
    switch (sv ? sv.cle : null) {
      case 'avant': t = exp ? 'pas encore de bougie ' + itv + ' depuis le point' : 'en cours · pas encore de bougie ' + itv + ' depuis le point'; c = 'en cours'; break;
      case 'rien': t = exp ? 'rien touché' : 'en cours · rien de touché'; c = 'rien touché'; break;
      case 'cible': t = ordinal(sv.k) + ' cible touchée à ' + h(sv.t) + (sv.memeBougie ? ' · la suivante dans la même bougie, ordre inconnu' : ''); c = ordinal(sv.k) + ' cible ' + h(sv.t) + (sv.memeBougie ? ' · ordre inconnu' : ''); break;
      case 'realise': t = (exp ? 'réalisé ' : 'réalisé à ') + h(sv.t); c = 'réalisé ' + h(sv.t); break;
      case 'invalide': t = sv.premier ? '1re cible, puis invalidation à ' + h(sv.t) : 'invalidation touchée d’abord à ' + h(sv.t); c = 'invalidation ' + h(sv.t); break;
      case 'ambigu': t = 'même bougie, ordre inconnu (' + h(sv.t || (sv.temps && sv.temps[0])) + ')'; c = 'ordre inconnu'; break;
      case 'dedans': t = exp ? 'dedans' : 'dedans · aucune borne dépassée'; c = 'dedans'; break;
      case 'sortie': t = (sv.sortie.haut ? 'borne haute' : 'borne basse') + ' dépassée à ' + h(sv.t); c = (sv.sortie.haut ? 'borne haute ' : 'borne basse ') + h(sv.t); break;
      default: t = 'suivi indisponible'; c = '—';
    }
    if (sv && sv.fini) { t = 'terminé · ' + t.replace(/^en cours · /, '') + (exp ? ' · note à venir' : ' · note du journal à venir'); c = 'terminé · ' + c; }
    return { cle: sv ? sv.cle : null, officiel: false, texte: t, court: c };
  }
  /** Le titre de l'encadré : « Scénarios du matin · 09/10 07h00 Paris » ; groupe terminé :
   *  « Scénarios d'hier (terminés) » (ou de la date, s'il est plus vieux qu'hier). */
  function titre(F, P, maintenant) {
    if (!F || F.etat !== 'ok') return 'Scénarios du matin';
    const point = P && P.point ? ' ' + P.point + ' Paris' : '';
    if (!F.ancien) return 'Scénarios du matin · ' + jourGroupe(F.groupe) + point;
    const hier = fini(maintenant) ? new Date(maintenant - 86400000).toISOString().slice(0, 10) : null;
    const auj = fini(maintenant) ? new Date(maintenant).toISOString().slice(0, 10) : null;
    return (F.groupe === hier || F.groupe === auj ? 'Scénarios d’hier' : 'Scénarios du ' + jourGroupe(F.groupe)) + ' (terminés)';
  }
  /** Une ligne de l'encadré : « 1. Hausse vers 84 300 puis 86 000 — en cours · rien de touché ». */
  function ligne(S, et, mode, court) {
    let quoi = mode === 'expert' ? libelle(S, 'expert').replace(/^\S+ /, '') : court ? niveaux(S, false) : (S.enonce || niveaux(S, false));
    // « Sem. Semaine : … » se lirait deux fois : l'énoncé de la semaine perd son préfixe.
    if (S.rang === 'S') quoi = quoi.replace(/^semaine\s*:\s*/i, '');
    return MARQUES_RANG[S.rang] + ' ' + quoi + ' — ' + (mode === 'expert' || court ? et.court : et.texte);
  }
  /** La mesure de l'ordre, seul chiffre de réussite montré (bilan.ordre du fichier). */
  function texteBilan(b, P, mode) {
    if (!b || !(b.matins > 0)) return null;
    const faible = b.matins < (P ? P.echantillonFaible : 20);
    const m = b.matins + (b.matins > 1 ? ' matins' : ' matin');
    if (mode === 'expert') return 'Ordre du 1er mouvement : ' + b.reussis + '/' + m + (faible ? ' · échantillon faible' : '');
    return 'Ordre du premier mouvement juste ' + b.reussis + ' fois sur ' + m + (faible ? ' · échantillon faible' : '');
  }
  const SENS_RANG = {
    '1': 'Rang 1 : le scénario jugé le plus probable ce matin parmi les trois. Un classement, sans pourcentage.',
    '2': 'Rang 2 : jugé moins probable que le 1, plus que le 3. Un classement, sans pourcentage.',
    '3': 'Rang 3 : le moins probable des trois. Un classement, sans pourcentage.',
    S: 'Scénario de la semaine : une fenêtre plus longue, qui chevauche les matins suivants ; il ne compte pas dans la mesure de l’ordre.',
  };
  /** L'explication complète d'un scénario (survol), en lignes. sv : état du suivi ; ctx = { itv, statuts }. */
  function explication(S, sv, mode, P, ctx) {
    const exp = mode === 'expert', c = ctx || {}, out = [];
    const m = nb(S.marge) + ' %';
    const z = v => { const [a, b] = zone(v, S.marge); return chiffres(a) + ' – ' + prix(b); };
    // Une origine déjà entre parenthèses (« mur de puts (modèle) ») ne s'emboîte pas : virgule.
    const avecO = v => { const o = origine(S, v); return prix(v) + (o ? ' (' + o.replace(/\s*\(([^)]*)\)/g, ', $1') + ')' : ''); };
    if (S.enonce) out.push(S.enonce + '.');
    if (S.forme === 'chemin') {
      out.push((exp ? 'Cibles dans l’ordre : ' : 'Ce scénario se lit : ') + S.cibles.map(avecO).join(exp ? ' > ' : ', puis ')
        + (S.invalidation !== null ? (exp ? ' ; invalidation ' : ', sans toucher d’abord ') + avecO(S.invalidation) : '') + '.');
      out.push((exp ? 'Zones ± ' + m + ' : ' : 'Chaque niveau est une zone (le niveau ± ' + m + ') : ') + S.cibles.map((v, k) => (exp ? ordinal(k + 1) + ' ' : 'cible ' + (k + 1) + ' : ') + z(v)).join(' ; ')
        + (S.invalidation !== null ? (exp ? ' ; invalidation ' : ' ; invalidation : ') + z(S.invalidation) : '') + '.');
    } else {
      out.push((exp ? 'Range ' : 'Ce scénario se lit : le prix reste ') + (exp ? chiffres(S.range[0]) + ' – ' + prix(S.range[1]) : 'entre ' + avecO(S.range[0]) + ' et ' + avecO(S.range[1]))
        + (exp ? ', aucune borne dépassée de plus de ' + m + '.' : ', sans sortir de ses bornes ± ' + m + ' (de ' + prix(S.zones.bas) + ' à ' + prix(S.zones.haut) + ') jusqu’à la fin.'));
    }
    const finP = heureParis(S.fin);
    const emP = heureParis(S.emis);
    out.push((exp ? 'Émis ' : 'Émis à ') + heureUTC(S.emis) + ' UTC' + (emP ? ' (' + emP + ' Paris)' : '') + (fini(S.prixEmission) ? (exp ? ' à ' : ', prix ') + prix(S.prixEmission) : '') + ' · fin ' + jourGroupe(new Date(S.fin).toISOString().slice(0, 10)) + ' ' + heureUTC(S.fin) + ' UTC'
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

  return { FORMAT, RANGS, STATUTS, chiffres, prix, heureUTC, heureParis, jourGroupe, dateUTC, zone, lire, suiviVide, pas, plier, etat, suivre, copie,
    niveaux, originePremiere, libelle, texteEtat, titre, ligne, texteBilan, explication, NOMS_RANG, COURTS_RANG, SENS_RANG };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Scenarios;
