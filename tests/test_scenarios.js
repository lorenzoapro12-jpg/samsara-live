// Scénarios du matin (js/scenarios.js) — hors ligne : le cœur pur, puis son câblage dans la page.
//
// CE QUI EST VÉRIFIÉ
//   1. formats : « 84 120 $ », heures de l'appareil (Fmt.heure : les attentes sont calculées, elles
//      tiennent dans tout fuseau), le point du matin (heure de la routine, à Paris) converti en instant ;
//   2. lecture du fichier : complet, d'attente, ancien, mal formé, format inconnu — rien d'inventé ;
//   3. suivi en direct (même règle que noter.py) : une bougie touche une zone si [bas, haut] la
//      recoupe ; cibles dans l'ordre (chaîne stricte), invalidation d'abord, même bougie = ordre
//      inconnu, bougies avant le point ou après la fin ignorées ; le pli mémorisé = le pli complet ;
//   4. range : dedans, borne basse / haute dépassée, les deux dans une bougie ;
//   5. note officielle (statut du fichier ≠ ⏳) AVANT le suivi en direct, avec le libellé du fichier ;
//   6. choix « 1B » : aucun pourcentage en mode débutant (base hasard comprise), base du hasard
//      en expert seulement et avec ces mots exacts ; seul chiffre de réussite : l'ordre du premier
//      mouvement, « échantillon faible » sous PARAM.scenarios.echantillonFaible ;
//   7. mots : aucun conseil, aucune intention prêtée (source et textes produits) ;
//   8. dans la page : PARAM.scenarios, menu (catégorie Guide), fiche, choix gardé, cadence de
//      relecture, lecture sans redessin quand le contenu n'a pas changé, échec dit en une ligne.
// USAGE   node tests/test_scenarios.js
const fs = require('fs'), path = require('path'), vm = require('vm');
const REPO = path.resolve(__dirname, '..');
const S = require(path.join(REPO, 'js/scenarios.js'));
const Fm = require(path.join(REPO, 'js/format.js'));
const { chargerPage } = require('./bac');

let ko = 0;
const check = (nom, ok, det) => { if (!ok) ko++; console.log(`  ${ok ? '✓' : '✗'} ${nom}${!ok && det !== undefined ? ' — ' + JSON.stringify(det).slice(0, 400) : ''}`); };
const titre = t => console.log(`\n── ${t} ──`);
const CONSEIL = /\b(achetez|vendez|achète[rz]?\b|vends\b|il faut (?:acheter|vendre)|entrez|sortez|prenez position|signal d['’]achat|signal de vente|recommand(?:e|ons))/i;
const ACCUSE = /spoof|manipul|leurre|tromper|tromperie|faux (?:mur|ordre)s?|fake|bluff|pi[eè]ge/i;

const page = chargerPage();
const dansPage = code => vm.runInContext(code, page.sandbox);
const P = dansPage('PARAM.scenarios');
const textes = [];                          // tout ce qui est écrit, relu à la fin
const t = s => { if (Array.isArray(s)) s.forEach(x => textes.push(x)); else if (s) textes.push(s); return s; };

const FIX = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'previsions.json'), 'utf8'));
const ATTENTE = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'previsions-attente.json'), 'utf8'));
const copie = o => JSON.parse(JSON.stringify(o));
const ms = s => Date.parse(s);
const EMIS = ms(FIX.emis_utc), H3 = EMIS + 3 * 3600e3;

// ── 1. Formats ──
titre('1. Formats : « 84 120 $ », heures de l’appareil');
check('84120 → « 84 120 $ » (espace simple, jamais insécable) ; 0,5 → « 0,5 $ »', S.prix(84120) === '84 120 $' && S.prix(0.5) === '0,5 $', [S.prix(84120), S.prix(0.5)]);
check('aucun prix ne commence par « $ »', ![S.prix(1), S.prix(84120.5), S.prix(99999)].some(x => /^\$/.test(x)));
check('heures affichées : celles de l’appareil (Fmt.heure), sans fuseau écrit ; instant absent → null',
  [ms('2026-10-09T04:40Z'), ms('2026-12-09T05:00Z')].every(x => S.heureVue(x) === Fm.heure(x) && /^\d\d:\d\d$/.test(S.heureVue(x))) && S.heureVue(NaN) === '—');
// Les deux noms exportés que js/app.js fait suivre de « UTC » ou « Paris » gardent leur sens exact
// (sinon la page dirait « 06:40 UTC » pour une heure de Paris).
check('noms exportés pour la page : 04:40Z → « 04:40 » UTC et « 06h40 » à Paris (heure d’été) ; 05:00Z en hiver → « 06h00 »',
  S.heureUTC(ms('2026-10-09T04:40Z')) === '04:40' && S.heureParis(ms('2026-10-09T04:40Z')) === '06h40' && S.heureParis(ms('2026-12-09T05:00Z')) === '06h00' && S.heureParis(NaN) === null);
check('point du matin « 07h00 » (heure de la routine, à Paris) → 05:00Z en heure d’été, 06:00Z en hiver',
  S.pointMs('2026-10-09', '07h00') === ms('2026-10-09T05:00Z') && S.pointMs('2026-12-09', '07h00') === ms('2026-12-09T06:00Z') && isNaN(S.pointMs('x', '07h00')), [S.pointMs('2026-10-09', '07h00'), S.pointMs('2026-12-09', '07h00')]);
check('groupe « 2026-10-09 » → « 09/10 »', S.jourGroupe('2026-10-09') === '09/10');
check('dates : « 2026-10-09T04:40Z » lue, une date sans fuseau refusée', S.dateUTC('2026-10-09T04:40Z') === Date.UTC(2026, 9, 9, 4, 40) && isNaN(S.dateUTC('2026-10-09T04:40')));

// ── 2. Lecture du fichier ──
titre('2. Lecture : complet, attente, ancien, mal formé');
{
  const F = S.lire(copie(FIX), H3);
  check('fichier complet : lisible, 4 scénarios triés 1, 2, 3, S', F.etat === 'ok' && F.scenarios.map(s => s.rang).join() === '1,2,3,S', F.etat === 'ok' ? F.scenarios.map(s => s.rang) : F);
  check('zones = niveau × (1 ± marge) ; range : bornes ± marge', Math.abs(F.scenarios[0].zones.cibles[0][0] - 86500 * 0.997) < 1e-6 && Math.abs(F.scenarios[0].zones.cibles[0][1] - 86500 * 1.003) < 1e-6
    && Math.abs(F.scenarios[2].zones.bas - 85600 * 0.997) < 1e-6 && Math.abs(F.scenarios[2].zones.haut - 86400 * 1.003) < 1e-6);
  check('bilan de l’ordre lu tel quel (1 matin, 0 juste)', F.bilan && F.bilan.matins === 1 && F.bilan.reussis === 0);
  const tp = S.pointMs(F.groupe, P.point), titreAttendu = 'Scénarios du matin · ' + Fm.jour(tp) + ' ' + Fm.heure(tp);
  check('titre : « ' + titreAttendu + ' » (le point du matin à l’heure de l’appareil, sans « Paris »)', t(S.titre(F, P, H3)) === titreAttendu, S.titre(F, P, H3));
  const tard = ms('2026-10-10T08:00Z'), Fa = S.lire(copie(FIX), tard);
  check('après la fin des rangs 1 à 3 : « ancien », titre « Scénarios d’hier (terminés) · semaine en cours » (la semaine court encore)', Fa.ancien === true && t(S.titre(Fa, P, tard)) === 'Scénarios d’hier (terminés) · semaine en cours', S.titre(Fa, P, tard));
  const Fv = S.lire(copie(FIX), ms('2026-10-13T08:00Z'));
  check('plus vieux qu’hier : « Scénarios du 09/10 (terminés) … »', /^Scénarios du 09\/10 \(terminés\)/.test(S.titre(Fv, P, ms('2026-10-13T08:00Z'))));
  const Fs = S.lire(copie(FIX), ms('2026-10-16T08:00Z'));
  check('semaine finie aussi : « Scénarios du 09/10 (terminés) », sans « semaine en cours »', S.titre(Fs, P, ms('2026-10-16T08:00Z')) === 'Scénarios du 09/10 (terminés)', S.titre(Fs, P, ms('2026-10-16T08:00Z')));
  // Lu le matin, page restée ouverte : le titre suit l'HEURE, pas l'heure de la lecture.
  check('lu à 07h40, relu des yeux le lendemain sans nouveau fichier : « Scénarios d’hier (terminés)… » (calculé à l’affichage)',
    F.ancien === false && /^Scénarios d’hier \(terminés\)/.test(S.titre(F, P, tard)) && S.estAncien(F, tard) && !S.estAncien(F, H3));
  check('fin des scénarios = celle des rangs 1 à 3 (pas celle de la semaine) ; la semaine à part',
    F.fin === ms('2026-10-10T04:20Z') && F.finSemaine === ms('2026-10-15T04:40Z'), [new Date(F.fin).toISOString(), F.finSemaine && new Date(F.finSemaine).toISOString()]);
  const sem2 = copie(FIX), s2 = sem2.scenarios.find(s => s.rang === 'S');
  s2.groupe = '2026-10-05'; s2.emis_utc = '2026-10-05T04:40Z'; s2.fin_utc = '2026-10-09T06:00Z';
  const Fw = S.lire(sem2, ms('2026-10-09T05:00Z'));
  check('semaine d’un matin passé lue ouverte, puis finie la page ouverte : retirée à l’affichage (vivants)', S.vivants(Fw, ms('2026-10-09T05:00Z')).some(s => s.rang === 'S') && !S.vivants(Fw, ms('2026-10-09T07:00Z')).some(s => s.rang === 'S'));
  const nul = copie(FIX); nul.precedents[0].scenarios.unshift(null); nul.precedents.push(null, { groupe: '2026-10-07', scenarios: [null, 3, { rang: '1', enonce: 'x', statut: '✅' }] });
  const Fn = S.lire(nul, H3);
  check('précédents mal formés (null, nombre) : écartés, le reste lu', Fn.etat === 'ok' && Fn.precedents.length === 2 && Fn.precedents.every(p => p.scenarios.every(x => x && typeof x === 'object')) && Fn.precedents[1].scenarios.length === 1, Fn.precedents);
  check('origine venue d’un modèle d’options : « (modèle) » ajouté (« mur de calls (modèle) »), une origine ordinaire inchangée',
    F.scenarios[0].origines['87200'] === 'mur de calls (modèle)' && F.scenarios[0].origines['86500'] === 'plus haut du 08/10', F.scenarios[0].origines);
  const A = S.lire(copie(ATTENTE), H3);
  check('fichier d’attente : état « attente », sa note gardée, aucun scénario', A.etat === 'attente' && !!A.note && A.scenarios.length === 0, A);
  const ill = [null, [], 'x', {}, { format: 'previsions-2', scenarios: [] }, { format: 'previsions-1' }, { format: 'previsions-1', scenarios: 'x' }].map(d => S.lire(d, H3));
  check('mal formé (null, tableau, texte, objet vide, autre format, liste absente) : « illisible » avec sa raison', ill.every(r => r.etat === 'illisible' && r.raison), ill);
  const casse = copie(FIX);
  casse.scenarios[1].fin_utc = casse.scenarios[1].emis_utc;          // fin ≤ point
  casse.scenarios[2].range = [86400, 85600];                          // bornes à l'envers
  casse.scenarios[0].cibles = [86500, 'x'];                           // niveau non numérique
  const Fc = S.lire(casse, H3);
  check('scénarios mal formés écartés et comptés (dates, bornes, niveaux), les autres lus', Fc.etat === 'ok' && Fc.ignores === 3 && Fc.scenarios.map(s => s.rang).join() === 'S', Fc.etat === 'ok' ? [Fc.ignores, Fc.scenarios.map(s => s.rang)] : Fc);
  const tous = copie(FIX); tous.scenarios.forEach(s => { s.forme = 'spirale'; });
  check('aucun scénario lisible : « illisible », rien d’inventé', S.lire(tous, H3).etat === 'illisible');
  const bil = copie(FIX); bil.bilan.ordre = { matins: 2, reussis: 3 };
  check('bilan incohérent (3 justes sur 2) : pas de bilan', S.lire(bil, H3).bilan === null);
  // Un scénario de la semaine d'un matin passé : gardé tant qu'il est ouvert.
  const sem = copie(FIX), s0 = sem.scenarios.find(s => s.rang === 'S');
  s0.groupe = '2026-10-05'; s0.emis_utc = '2026-10-05T04:40Z'; s0.fin_utc = '2026-10-09T06:00Z';
  check('semaine d’un matin passé : gardée tant qu’ouverte, écartée une fois finie', S.lire(copie(sem), ms('2026-10-09T05:00Z')).scenarios.some(s => s.rang === 'S')
    && !S.lire(copie(sem), ms('2026-10-09T07:00Z')).scenarios.some(s => s.rang === 'S'));
}

// ── 3. Suivi d'un chemin ──
titre('3. Suivi en direct d’un chemin (règle de noter.py)');
// Fichier minimal : cibles 100 puis 110, invalidation 90, marge 1 % → zones [99, 101], [108,9 ; 111,1], [89,1 ; 90,9].
const E0 = Date.UTC(2026, 9, 9, 4, 40), FIN = E0 + 20 * 3600e3, PAS = 900;
const fichier = scs => ({ format: 'previsions-1', updated: '2026-10-09T04:45Z', groupe: '2026-10-09', marge_pct: 1, emis_utc: '2026-10-09T04:40Z', prix_emission: 95,
  scenarios: scs.map((x, k) => Object.assign({ id: 'T' + k, rang: String(k + 1), groupe: '2026-10-09', emis_utc: '2026-10-09T04:40Z', fin_utc: '2026-10-10T00:40Z', prix_emission: 95, statut: '⏳' }, x)),
  precedents: [], bilan: null, statuts: {} });
const chemin = S.lire(fichier([{ forme: 'chemin', cibles: [100, 110], invalidation: 90, origines: { 100: 'plus haut d’hier' } }]), E0 + 3600e3).scenarios[0];
const range = S.lire(fichier([{ forme: 'range', range: [100, 110] }]), E0 + 3600e3).scenarios[0];
/** Bougies [h, l] à partir du point (la 1re ouvre au point), plus `avant` bougies avant lui. */
function bougies(hl, avant) {
  const T = [], H = [], L = [];
  (avant || []).forEach(([h, l], k) => { T.push(E0 / 1000 - ((avant.length - k) * PAS)); H.push(h); L.push(l); });
  hl.forEach(([h, l], k) => { T.push(E0 / 1000 + k * PAS); H.push(h); L.push(l); });
  return { T, H, L, n: T.length };
}
const suivre = (sc, b, maintenant) => S.suivre(sc, b.T, b.H, b.L, b.n, maintenant === undefined ? E0 + 3600e3 : maintenant);
const heureDe = k => Fm.heure(E0 + k * PAS * 1000);   // l'heure de l'appareil du début de la bougie k
const mots = (sc, sv) => t(S.texteEtat(sc, sv, null, 'debutant', { itv: '15 min' }).texte);
{
  const avantSeul = suivre(chemin, bougies([], [[112, 98]]));
  check('aucune bougie depuis le point : « avant » (une bougie d’AVANT le point qui touche tout ne compte pas)', avantSeul.cle === 'avant', avantSeul);
  check('… dit « en cours · pas encore de bougie 15 min depuis le point »', mots(chemin, avantSeul) === 'en cours · pas encore de bougie 15 min depuis le point');
  const rien = suivre(chemin, bougies([[98, 95], [98.9, 91]]));
  check('rien de touché (98,9 < 99 ; 91 > 90,9) : « en cours · rien de touché »', rien.cle === 'rien' && mots(chemin, rien) === 'en cours · rien de touché', rien);
  const bord = suivre(chemin, bougies([[99, 95]]));
  check('le bord compte : un plus haut à 99,0 touche la zone [99 ; 101]', bord.cle === 'cible' && bord.k === 1, bord);
  const c1 = suivre(chemin, bougies([[96, 94], [100.5, 96]]));
  check('1re cible touchée : « 1re cible touchée à ' + heureDe(1) + ' »', c1.cle === 'cible' && mots(chemin, c1) === '1re cible touchée à ' + heureDe(1), mots(chemin, c1));
  const ok = suivre(chemin, bougies([[96, 94], [100.5, 96], [105, 100], [109, 104], [104, 92]]));
  check('cibles dans l’ordre puis invalidation plus tard : « réalisé à » la 2e cible', ok.cle === 'realise' && mots(chemin, ok) === 'réalisé à ' + heureDe(3), [ok.cle, mots(chemin, ok)]);
  const meme = suivre(chemin, bougies([[96, 94], [109, 99]]));
  check('les deux cibles dans la même bougie : 1re touchée, « la suivante dans la même bougie, ordre inconnu » (chaîne stricte non complète)',
    meme.cle === 'cible' && meme.k === 1 && meme.memeBougie && /la suivante dans la même bougie, ordre inconnu/.test(mots(chemin, meme)), [meme.cle, meme.k, mots(chemin, meme)]);
  const ensuite = suivre(chemin, bougies([[96, 94], [109, 99], [110, 105]]));
  check('… puis la 2e dans une bougie plus tardive : « réalisé »', ensuite.cle === 'realise', ensuite.cle);
  const inv = suivre(chemin, bougies([[96, 94], [95, 90.5], [101, 96]]));
  check('invalidation d’abord : « invalidation touchée d’abord à ' + heureDe(1) + ' »', inv.cle === 'invalide' && !inv.premier && mots(chemin, inv) === 'invalidation touchée d’abord à ' + heureDe(1), mots(chemin, inv));
  const puis = suivre(chemin, bougies([[100, 96], [95, 90]]));
  check('1re cible puis invalidation : « 1re cible, puis invalidation à … »', puis.cle === 'invalide' && puis.premier && /^1re cible, puis invalidation à /.test(mots(chemin, puis)), mots(chemin, puis));
  const amb = suivre(chemin, bougies([[96, 94], [100, 90]]));
  check('cible et invalidation dans la même bougie : « une cible et l’invalidation dans la même bougie (…) : ordre inconnu »', amb.cle === 'ambigu' && mots(chemin, amb) === 'une cible et l’invalidation dans la même bougie (' + heureDe(1) + ') : ordre inconnu', [amb.cle, mots(chemin, amb)]);
  const apresFin = bougies(Array.from({ length: 81 }, (_, k) => (k === 80 ? [120, 80] : [96, 94])));
  check('une bougie ouverte à la fin du scénario ne compte pas', suivre(chemin, apresFin).cle === 'rien', suivre(chemin, apresFin).cle);
  const fini = suivre(chemin, bougies([[96, 94]]), FIN + 3600e3);
  check('fenêtre passée sans note : « terminé · … · note du journal à venir »', fini.fini && /^terminé · rien de touché · note du journal à venir$/.test(mots(chemin, fini)), mots(chemin, fini));
  // Le pli mémorisé (bougies closes) prolongé de la suite = le pli complet.
  const b = bougies([[96, 94], [100.5, 96], [105, 100], [95, 92], [109, 104], [104, 90]]);
  const tout = S.plier(chemin, b.T, b.H, b.L, 0, b.n);
  const memo = S.plier(chemin, b.T, b.H, b.L, 0, 3), suite = S.plier(chemin, b.T, b.H, b.L, 3, b.n, memo);
  check('pli mémorisé puis prolongé = pli complet ; le pli mémorisé n’est pas modifié', JSON.stringify(tout) === JSON.stringify(suite) && memo.n === 3, { tout, suite });
}

// ── 4. Range ──
titre('4. Range : dedans, borne dépassée (au-delà de la marge)');
{
  const dedans = suivre(range, bougies([[110.5, 99.5], [111, 99.1]]));
  check('dans les bornes ± marge (99 – 111,1) : « dedans · aucune borne dépassée »', dedans.cle === 'dedans' && mots(range, dedans) === 'dedans · aucune borne dépassée', [dedans.cle, mots(range, dedans)]);
  const bas = suivre(range, bougies([[105, 101], [102, 99]]));
  check('plus bas à 99 : « borne basse dépassée à ' + heureDe(1) + ' »', bas.cle === 'sortie' && mots(range, bas) === 'borne basse dépassée à ' + heureDe(1), mots(range, bas));
  const haut = suivre(range, bougies([[111.1, 105]]));
  check('plus haut à 111,1 : « borne haute dépassée à … »', haut.cle === 'sortie' && /^borne haute dépassée à /.test(mots(range, haut)), mots(range, haut));
  const deux = suivre(range, bougies([[112, 98]]));
  check('les deux bornes dans une bougie : « les deux bornes dépassées dans la même bougie (…) : ordre inconnu »', deux.cle === 'ambigu' && mots(range, deux) === 'les deux bornes dépassées dans la même bougie (' + heureDe(0) + ') : ordre inconnu', mots(range, deux));
  const garde = suivre(range, bougies([[112, 105], [104, 98]]));
  check('la 1re sortie est gardée (haute), pas la suivante', garde.cle === 'sortie' && garde.sortie.haut && !garde.sortie.bas, garde.sortie);
}

// ── 4 bis. Bougies larges, créneaux, scénario ouvert ──
titre('4 bis. Bougies entières dans la fenêtre, créneau d’une bougie, bougies trop larges, scénario ouvert');
{
  const P4 = 4 * 3600e3, P1 = 3600e3, P15 = 900e3;
  const col = (debut, pasMs, hl) => ({ T: hl.map((_, k) => (debut + k * pasMs) / 1000), H: hl.map(x => x[0]), L: hl.map(x => x[1]), n: hl.length });
  // 4 h : la bougie de 04:00 contient le point (04:40) : elle ne compte pas, même si elle touche la cible 1.
  const d4 = Date.UTC(2026, 9, 9, 4, 0), b4 = col(d4, P4, [[100.5, 96], [96, 94]]);
  const s4 = S.suivre(chemin, b4.T, b4.H, b4.L, b4.n, E0 + 5 * 3600e3, P4);
  const h8 = Fm.heure(d4 + P4);
  check('bougie 4 h qui contient le point : ignorée (rien de touché, depuis ' + h8 + ', la bougie suivante)', s4.cle === 'rien' && t(S.texteEtat(chemin, s4, null, 'debutant', { itv: '4 h' }).texte) === 'en cours · rien de touché depuis ' + h8 + ' (bougies 4 h)', [s4.cle, S.texteEtat(chemin, s4, null, 'debutant', { itv: '4 h' }).texte]);
  // 1 h : la bougie de 00:00 déborde la fin (00:40) : ce qu'elle fait après la fin ne compte pas.
  const d1 = Date.UTC(2026, 9, 10, 0, 0), b1 = col(d1 - 2 * P1, P1, [[96, 94], [96, 94], [96, 89]]);
  check('bougie 1 h qui déborde la fin du scénario : ignorée', S.suivre(chemin, b1.T, b1.H, b1.L, b1.n, d1 + P1, P1).cle === 'rien');
  check('Scenarios.compte : entière dans [point, fin] seulement', S.compte(chemin, E0, P15) && !S.compte(chemin, E0 - 60e3, P15) && !S.compte(chemin, chemin.fin - 60e3, P15) && S.compte(chemin, chemin.fin - P15, P15));
  // 15 min : le créneau de la bougie, jamais un instant inventé.
  const b15 = col(E0 + 15 * 60e3, P15, [[96, 94], [100.5, 96]]);
  const s15 = S.suivre(chemin, b15.T, b15.H, b15.L, b15.n, E0 + 3600e3, P15);
  const e15 = S.texteEtat(chemin, s15, null, 'debutant', { itv: '15 min', maintenant: E0 + 3600e3 });
  const hA = Fm.heure(E0 + 30 * 60e3), hB = Fm.heure(E0 + 45 * 60e3);
  check('bougie 15 min : « 1re cible touchée entre ' + hA + ' et ' + hB + ' » ; court « 1re cible ' + hA + '–' + hB + ' »', t(e15.texte) === '1re cible touchée entre ' + hA + ' et ' + hB && e15.court === '1re cible ' + hA + '–' + hB, [e15.texte, e15.court]);
  const lendemain = S.texteEtat(chemin, s15, null, 'debutant', { itv: '15 min', maintenant: E0 + 24 * 3600e3 });
  check('vu le lendemain : le jour est dit (« ' + Fm.jour(E0 + 30 * 60e3) + ' ' + hA + ' »)', lendemain.texte.includes('entre ' + Fm.jour(E0 + 30 * 60e3) + ' ' + hA + ' et ' + hB) && !/UTC|Paris/.test(lendemain.texte), lendemain.texte);
  const inv15 = S.suivre(chemin, ...(b => [b.T, b.H, b.L, b.n])(col(E0 + 5 * 60e3, P15, [[95, 90]])), E0 + 3600e3, P15);
  const pui15 = S.suivre(chemin, ...(b => [b.T, b.H, b.L, b.n])(col(E0 + 5 * 60e3, P15, [[100, 96], [95, 90]])), E0 + 3600e3, P15);
  check('court : « invalidation d’abord … » contre « 1re cible, puis invalidation … » (jamais le même mot)',
    S.texteEtat(chemin, inv15, null, 'debutant', {}).court === 'invalidation d’abord ' + Fm.heure(E0 + 5 * 60e3) + '–' + Fm.heure(E0 + 20 * 60e3)
    && S.texteEtat(chemin, pui15, null, 'debutant', {}).court === '1re cible, puis invalidation ' + Fm.heure(E0 + 20 * 60e3) + '–' + Fm.heure(E0 + 35 * 60e3),
    [S.texteEtat(chemin, inv15, null, 'debutant', {}).court, S.texteEtat(chemin, pui15, null, 'debutant', {}).court]);
  const lg = S.etatLarge(chemin, P4, E0 + 3600e3);
  check('bougies de 4 h : pas d’état, « suivi en direct indisponible sur les bougies 4 h (trop larges) : il se lit en 15 min ou 1 h »',
    t(S.texteEtat(chemin, lg, null, 'debutant', { itv: '4 h' }).texte) === 'suivi en direct indisponible sur les bougies 4 h (trop larges) : il se lit en 15 min ou 1 h' && S.texteEtat(chemin, lg, null, 'expert', { itv: '4 h' }).texte === 'suivi : bougies trop larges');
  // Ouvert : seul un scénario ouvert garde sa flèche vers le futur.
  const now = E0 + 3600e3;
  const sv = hl => S.suivre(chemin, ...(b => [b.T, b.H, b.L, b.n])(col(E0 + 5 * 60e3, P15, hl)), now, P15);
  check('ouvert : rien de touché, 1re cible touchée → oui ; invalidé, réalisé, ordre inconnu → non',
    S.ouvert(chemin, sv([[96, 94]]), now) && S.ouvert(chemin, sv([[100, 96]]), now) && !S.ouvert(chemin, sv([[95, 90]]), now)
    && !S.ouvert(chemin, sv([[100, 96], [110, 104]]), now) && !S.ouvert(chemin, sv([[100, 90]]), now));
  check('ouvert : fenêtre passée → non ; statut du journal → non ; bougies trop larges → oui', !S.ouvert(chemin, sv([[96, 94]]), chemin.fin + 1)
    && !S.ouvert(Object.assign({}, chemin, { statut: '✅' }), null, now) && S.ouvert(chemin, lg, now));
}

// ── 4 ter. Historique incomplet, marque « en direct », ligne des états ──
titre('4 ter. Historique qui ne remonte pas au point, marque « en direct » hors de l’encadré, ligne des états');
{
  const P1m = 60e3, P15 = 900e3;
  // manque() : la 1re bougie qui compte s'ouvre au 1er multiple du pas depuis le point (04:40 → 04:45 en 15 min).
  check('historique depuis 04:45 (15 min, point 04:40) : complet ; depuis 05:00 : il manque la bougie de 04:45',
    !S.manque(chemin, E0 + 5 * 60e3, P15) && S.manque(chemin, E0 + 20 * 60e3, P15) && !S.manque(chemin, E0 - 3600e3, P15));
  check('point pile sur une ouverture (04:40 en 1 min) : historique depuis 04:40 complet, depuis 04:41 incomplet', !S.manque(chemin, E0, P1m) && S.manque(chemin, E0 + P1m, P1m));
  check('historique qui commence après la fin du scénario : incomplet aussi (aucune bougie de la fenêtre chargée, rien n’est affirmé)', S.manque(chemin, chemin.fin + 3600e3, P15));
  // Fenêtre qui commence AVANT la 1re bougie chargée : en 1 min, l'invalidation touchée avant le
  // début de l'historique n'est pas vue — le pli dirait « réalisé » ; la page dit « incomplet ».
  const T = [], H = [], L = [];
  for (let k = 0; k < 120; k++) { T.push((E0 + 6 * 3600e3 + k * P1m) / 1000); H.push(k === 60 ? 110.5 : k === 10 ? 100.5 : 98); L.push(96); }
  const naif = S.suivre(chemin, T, H, L, T.length, E0 + 9 * 3600e3, P1m);
  check('le pli seul, sur un historique qui commence 6 h après le point, dirait « réalisé » (rien ne prouve l’ordre)', naif.cle === 'realise', naif.cle);
  check('… manque() le voit : historique incomplet', S.manque(chemin, T[0] * 1000, P1m));
  const inc = S.etatIncomplet(chemin, P1m, E0 + 9 * 3600e3, T[0] * 1000);
  const ti = S.texteEtat(chemin, inc, null, 'debutant', { itv: '1 min', maintenant: E0 + 9 * 3600e3 });
  const h6 = Fm.heure(E0 + 6 * 3600e3);
  check('« suivi en direct incomplet sur les bougies 1 min (historique chargé depuis ' + h6 + ', après le point) : il se lit en 15 min »',
    t(ti.texte) === 'suivi en direct incomplet sur les bougies 1 min (historique chargé depuis ' + h6 + ', après le point) : il se lit en 15 min', ti.texte);
  check('incomplet : jamais « réalisé », « invalid… » ni « ordre » ; le scénario reste ouvert (pas d’affirmation)', !/réalisé|invalid|ordre/.test(ti.texte + ti.court + ti.mini) && S.ouvert(chemin, inc, E0 + 9 * 3600e3));
  // La page : scenSuivi() sur des bougies 1 min qui commencent après le point → « incomplet ».
  const pg = chargerPage(), run = c => vm.runInContext(c, pg.sandbox);
  run('candles = Array.from({ length: 200 }, (_, i) => ({ time: ' + (E0 / 1000 + 6 * 3600) + ' + i * 60, open: 97, high: i === 100 ? 110.5 : 98, low: 96, close: 97, volume: 1 }));');
  pg.sandbox.__S = chemin;
  check('page : scenSuivi() sur des bougies 1 min commencées après le point → « incomplet »', run('scenSuivi(__S).cle') === 'incomplet', run('scenSuivi(__S).cle'));
  run('candles = Array.from({ length: 200 }, (_, i) => ({ time: ' + (E0 / 1000 - 600) + ' + i * 60, open: 97, high: 98, low: 96, close: 97, volume: 1 }));');
  check('page : historique depuis avant le point → suivi normal (« rien »)', run('scenSuivi(__S).cle') === 'rien', run('scenSuivi(__S).cle'));
  // Marque « en direct » : toute forme courte d'un état calculé ici la porte ; une note du journal, « journal ».
  const cas = [['avant', bougies([], [[112, 98]])], ['rien', bougies([[98, 95]])], ['cible', bougies([[100.5, 96]])], ['realise', bougies([[100.5, 96], [110, 104]])],
    ['invalide', bougies([[95, 90]])], ['ambigu', bougies([[100, 90]])]].map(([c, b]) => [c, chemin, suivre(chemin, b)])
    .concat([['dedans', range, suivre(range, bougies([[105, 101]]))], ['sortie', range, suivre(range, bougies([[112, 101]]))], ['large', chemin, S.etatLarge(chemin, 4 * 3600e3, E0)], ['incomplet', chemin, inc],
      ['fini', chemin, suivre(chemin, bougies([[96, 94]]), FIN + 3600e3)]]);
  const sans = [];
  for (const [c, sc, sv] of cas) for (const mode of ['debutant', 'expert']) {
    const e = S.texteEtat(sc, sv, null, mode, { itv: '15 min', maintenant: E0 + 3600e3 });
    t([e.courtD, e.miniD, e.microD]);
    const m = mode === 'expert' ? / · direct$/ : / \(en direct\)$/;
    if (e.officiel || ![e.courtD, e.miniD, e.microD].every(x => m.test(x))) sans.push([c, mode, e.courtD, e.miniD, e.microD]);
  }
  check(`${cas.length} états en direct × 2 modes : formes courtes hors encadré (courtD, miniD, microD) marquées « (en direct) » / « · direct »`, !sans.length, sans);
  const fin = S.texteEtat(chemin, suivre(chemin, bougies([[96, 94]]), FIN + 3600e3), null, 'debutant', {});
  check('fenêtre finie sans note : la forme la plus courte reste un état (« terminé (en direct) »)', fin.microD === 'terminé (en direct)' && fin.miniD === 'terminé · rien de touché (en direct)', [fin.miniD, fin.microD]);
  const inv = S.texteEtat(chemin, suivre(chemin, bougies([[95, 90]])), null, 'debutant', {});
  check('invalidé : « invalidé (en direct) »', inv.miniD === 'invalidé (en direct)', inv.miniD);
  const off = S.texteEtat(Object.assign({}, chemin, { statut: '✅', premierOk: 'oui' }), null, { '✅': 'réalisé' }, 'debutant', {});
  check('note du journal : « journal : réalisé » / « réalisé (journal) », jamais « en direct »', off.courtD === 'journal : réalisé' && off.miniD === 'réalisé (journal)' && !/direct/.test(off.courtD + off.miniD + off.microD), [off.courtD, off.miniD]);
  // La ligne des états (encadré serré).
  const sc2 = Object.assign({}, chemin, { rang: '2' }), sc3 = Object.assign({}, range, { rang: '3' }), scS = Object.assign({}, chemin, { rang: 'S' });
  const etd = (sc, sv) => S.texteEtat(sc, sv, null, 'debutant', {});
  const items = [{ sc: chemin, et: inv }, { sc: sc2, et: etd(sc2, suivre(chemin, bougies([[98, 95]]))) }, { sc: sc3, et: etd(sc3, suivre(range, bougies([[105, 101]]))) }, { sc: scS, et: off }];
  check('ligne des états : « Suivi en direct : 1 · invalidé | 2 · rien de touché | 3 · dedans | Sem. · réalisé (journal) »',
    t(S.ligneEtats(items, 'debutant')) === 'Suivi en direct : 1 · invalidé | 2 · rien de touché | 3 · dedans | Sem. · réalisé (journal)', S.ligneEtats(items, 'debutant'));
  check('tout noté par le journal : « Note du journal : 1 · réalisé »', S.ligneEtats([{ sc: chemin, et: off }], 'debutant') === 'Note du journal : 1 · réalisé', S.ligneEtats([{ sc: chemin, et: off }], 'debutant'));
  const lg = S.texteEtat(chemin, S.etatLarge(chemin, 4 * 3600e3, E0), null, 'debutant', { itv: '4 h' });
  check('bougies trop larges : la ligne omet les scénarios non suivis (une seule note le dit) ; tous omis → rien',
    S.ligneEtats([{ sc: chemin, et: lg }, { sc: scS, et: off }], 'debutant', true) === 'Note du journal : Sem. · réalisé' && S.ligneEtats([{ sc: chemin, et: lg }], 'debutant', true) === null);
  check('ligne de l’encadré sans état (bougies trop larges) : pas de « — »', S.ligne(chemin, null, 'debutant', true) === '1. 100 $ puis 110 $ (inval. 90 $)', S.ligne(chemin, null, 'debutant', true));
  // Le titre suit le suivi en direct de la semaine.
  const Fa = S.lire(copie(FIX), ms('2026-10-10T08:00Z'));
  check('groupe terminé, semaine réalisée en direct : pas de « semaine en cours » (semOuverte = false)',
    S.titre(Fa, P, ms('2026-10-10T08:00Z'), false) === 'Scénarios d’hier (terminés)' && S.titre(Fa, P, ms('2026-10-10T08:00Z'), true) === 'Scénarios d’hier (terminés) · semaine en cours');
  check('règle du bilan : « le chemin le mieux classé qui a une invalidation » (règle de noter.py)', /chemin le mieux classé qui a une invalidation/.test(t(S.REGLE_BILAN)) && !/mieux classé a touché/.test(S.REGLE_BILAN));
  t(S.REGLE_BILAN_SUITE); t(S.noteLarge('4 h', 'debutant')); t(S.noteLarge('4 h', 'expert'));
}

// ── 5. Note officielle ──
titre('5. Note du journal (statut du fichier) AVANT le suivi en direct');
{
  const f = fichier([{ forme: 'chemin', cibles: [100, 110], invalidation: 90, statut: '✅', premier_ok: 'oui', resolu_utc: '2026-10-09T09:15Z' }]);
  f.statuts = { '✅': 'réalisé (journal)' };
  const F = S.lire(f, E0 + 3600e3), sc = F.scenarios[0];
  const enDirect = suivre(sc, bougies([[95, 89]]));         // le suivi dirait « invalidation d'abord »
  const e = S.texteEtat(sc, enDirect, F.statuts, 'debutant', { itv: '15 min' });
  t(e.texte);
  check('statut ✅ : la note officielle passe, avec le libellé DU FICHIER et son heure', e.officiel && e.texte === 'note du journal : réalisé (journal) (1re cible touchée avant l’invalidation) · ' + Fm.heure(ms('2026-10-09T09:15Z')), e.texte);
  check('… et la ligne de l’encadré la montre', /note du journal : réalisé \(journal\)/.test(t(S.ligne(sc, e, 'debutant'))));
  const ex = t(S.explication(sc, enDirect, 'debutant', P, { itv: '15 min', statuts: F.statuts }));
  check('l’explication dit les deux : le suivi en direct (un affichage) et la note du journal', ex.some(l => /^Suivi en direct sur les bougies 15 min/.test(l) && /la note officielle est celle du journal/.test(l)) && ex.some(l => /^Note du journal : réalisé \(journal\)/.test(l)), ex);
  const enCours = S.lire(fichier([{ forme: 'chemin', cibles: [100, 110], invalidation: 90 }]), E0).scenarios[0];
  check('statut ⏳ : le suivi en direct, jamais présenté comme une note', S.texteEtat(enCours, enDirect, null, 'debutant', {}).officiel === false);
  const r = fichier([{ forme: 'range', range: [100, 110], statut: '❌', premier_ok: 'bas', resolu_utc: '2026-10-09T09:15Z' }]);
  const sr = S.lire(r, E0).scenarios[0];
  check('range noté ❌ : « note du journal : invalidé (sorti par le bas) · ' + Fm.heure(ms('2026-10-09T09:15Z')) + ' »', t(S.texteEtat(sr, null, null, 'debutant', {}).texte) === 'note du journal : invalidé (sorti par le bas) · ' + Fm.heure(ms('2026-10-09T09:15Z')), S.texteEtat(sr, null, null, 'debutant', {}).texte);
  // ❌ du journal = invalidation avant la fin de la chaîne : la 1re cible a pu être touchée d'abord.
  const noteC = (statut, premier) => S.lire(fichier([{ forme: 'chemin', cibles: [100, 110], invalidation: 90, statut, premier_ok: premier, resolu_utc: '2026-10-09T22:45Z' }]), E0).scenarios[0];
  const st = { '❌': 'invalidé d’abord' };
  check('chemin ❌ + premier_ok « oui » : « invalidé après la 1re cible (1re cible touchée d’abord) » — jamais « invalidé d’abord »',
    t(S.texteEtat(noteC('❌', 'oui'), null, st, 'debutant', {}).texte) === 'note du journal : invalidé après la 1re cible (1re cible touchée d’abord) · ' + Fm.heure(ms('2026-10-09T22:45Z')), S.texteEtat(noteC('❌', 'oui'), null, st, 'debutant', {}).texte);
  check('chemin ❌ + « non » : « invalidé d’abord (invalidation touchée avant la 1re cible) »',
    t(S.texteEtat(noteC('❌', 'non'), null, st, 'debutant', {}).texte) === 'note du journal : invalidé d’abord (invalidation touchée avant la 1re cible) · ' + Fm.heure(ms('2026-10-09T22:45Z')));
  check('formes courtes : « journal : invalidé après la 1re cible » / « journal : invalidé d’abord »',
    S.texteEtat(noteC('❌', 'oui'), null, st, 'debutant', {}).court === 'journal : invalidé après la 1re cible' && S.texteEtat(noteC('❌', 'non'), null, st, 'debutant', {}).court === 'journal : invalidé d’abord');
  check('matins précédents (sans forme) : « sorti par le bas » pour un range, « invalidé après la 1re cible » pour un chemin',
    S.motsStatut('❌', 'bas', null, st).long === 'invalidé (sorti par le bas)' && S.motsStatut('❌', 'oui', null, st).court === 'invalidé après la 1re cible' && S.motsStatut('❌', 'non', null, st).court === 'invalidé d’abord');
}

// ── 6. Choix « 1B » : aucun pourcentage en débutant ──
titre('6. Choix « 1B » : classement sans pourcentage, la base du hasard en expert seulement');
{
  const F = S.lire(copie(FIX), H3);
  check('la fixture porte bien une base du hasard (sinon le contrôle ne prouve rien)', F.scenarios.some(s => s.baseHasard !== null));
  const deb = [], expT = [];
  for (const sc of F.scenarios) {
    const b = bougies([[86600, 85900]]);
    const sv = S.etat(sc, S.plier(sc, b.T.map((x, k) => EMIS / 1000 + k * PAS), b.H, b.L, 0, b.n), H3);
    const ctx = { itv: '15 min', statuts: F.statuts };
    const e = S.texteEtat(sc, sv, F.statuts, 'debutant', ctx);
    deb.push(S.libelle(sc, 'debutant'), S.libelle(sc, 'debutant', true), S.ligne(sc, e, 'debutant'), S.ligne(sc, e, 'debutant', true), e.texte, ...S.explication(sc, sv, 'debutant', P, ctx));
    const ee = S.texteEtat(sc, sv, F.statuts, 'expert', ctx);
    expT.push(S.libelle(sc, 'expert'), S.ligne(sc, ee, 'expert'), ...S.explication(sc, sv, 'expert', P, ctx));
  }
  deb.push(S.titre(F, P, H3), S.texteBilan(F.bilan, P, 'debutant'));
  t(deb); t(expT);
  // La seule écriture « % » admise en débutant : la marge d'une zone (« ± 0,3 % »), qui n'est pas une probabilité.
  const pcts = deb.filter(x => /%/.test(x.replace(/±\s*[\d,]+\s*%/g, '')));
  check(`${deb.length} textes du mode débutant : aucun pourcentage (hors la marge « ± N % » d’une zone)`, !pcts.length, pcts);
  check('… ni la valeur de la base du hasard, ni le mot « hasard »', !deb.some(x => /hasard/i.test(x)));
  const base = expT.filter(x => /hasard/i.test(x));
  check('expert : la base est dite « hasard pur (modèle), pas une estimation » — ces mots, rien d’autre', base.length > 0 && base.every(x => /^Base hasard pur \(modèle\), pas une estimation : \d+(,\d+)? %\.$/.test(x)), base);
  check('classement en débutant : « Rang 1 : … sans pourcentage »', deb.some(x => /^Rang 1 : .*sans pourcentage/.test(x)));
  check('bilan : « Ordre du premier mouvement juste 3 fois sur 5 matins · échantillon faible »', S.texteBilan({ matins: 5, reussis: 3 }, P, 'debutant') === 'Ordre du premier mouvement juste 3 fois sur 5 matins · échantillon faible');
  check('« échantillon faible » sous PARAM.scenarios.echantillonFaible matins (' + P.echantillonFaible + '), plus au-delà',
    /échantillon faible/.test(S.texteBilan({ matins: P.echantillonFaible - 1, reussis: 1 }, P, 'debutant')) && !/échantillon faible/.test(S.texteBilan({ matins: P.echantillonFaible, reussis: 1 }, P, 'debutant')));
  check('1 matin au singulier ; 0 matin : aucune ligne de bilan', /sur 1 matin$|sur 1 matin ·/.test(S.texteBilan({ matins: 1, reussis: 0 }, P, 'debutant')) && S.texteBilan({ matins: 0, reussis: 0 }, P, 'debutant') === null);
  check('aucun autre chiffre de réussite : pas de « % » dans le bilan', !/%/.test(S.texteBilan({ matins: 30, reussis: 12 }, P, 'debutant') + S.texteBilan({ matins: 30, reussis: 12 }, P, 'expert')));
  check('libellé débutant : « Scénario 1 · 86 500 $ (plus haut du 08/10) puis 87 200 $ » (l’origine juste après SON niveau) ; expert : « S1 86 500 > 87 200 · inv 85 500 »',
    S.libelle(F.scenarios[0], 'debutant') === 'Scénario 1 · 86 500 $ (plus haut du 08/10) puis 87 200 $' && S.libelle(F.scenarios[0], 'expert') === 'S1 86 500 > 87 200 · inv 85 500', [S.libelle(F.scenarios[0], 'debutant'), S.libelle(F.scenarios[0], 'expert')]);
  check('libellé complet : chaque origine après son niveau (« (mur de calls, modèle) ») ; court : aucune',
    S.libelle(F.scenarios[0], 'debutant', 'complet') === 'Scénario 1 · 86 500 $ (plus haut du 08/10) puis 87 200 $ (mur de calls, modèle)' && S.libelle(F.scenarios[0], 'debutant', true) === 'Scénario 1 · 86 500 $ puis 87 200 $', S.libelle(F.scenarios[0], 'debutant', 'complet'));
  const rg = copie(FIX); rg.scenarios[2].origines = { 85600: 'plus bas du 01/10, arrondi', 86400: 'bas de la zone du 07/10' };
  const R3 = S.lire(rg, H3).scenarios[2];
  check('range : l’origine de la borne basse reste sur la borne basse (« entre 85 600 $ (plus bas du 01/10, arrondi) et 86 400 $ »)',
    S.libelle(R3, 'debutant') === 'Scénario 3 · entre 85 600 $ (plus bas du 01/10, arrondi) et 86 400 $', S.libelle(R3, 'debutant'));
  const r2 = copie(FIX); r2.scenarios[0].origines = { 87200: 'mur de calls (modèle)' };
  check('chemin dont seule la 2e cible a une origine : elle reste après 87 200 $, jamais après 86 500 $',
    S.libelle(S.lire(r2, H3).scenarios[0], 'debutant') === 'Scénario 1 · 86 500 $ puis 87 200 $ (mur de calls, modèle)', S.libelle(S.lire(r2, H3).scenarios[0], 'debutant'));
  // Ce qui invalide un scénario est dit au débutant, dans l'encadré.
  const e0 = { texte: 'en cours · rien de touché', court: 'rien de touché' };
  check('ligne débutant d’un chemin : « 1. Hausse vers 86 500 puis 87 200, sans toucher 85 500 avant — … »', t(S.ligne(F.scenarios[0], e0, 'debutant')) === '1. Hausse vers 86 500 puis 87 200, sans toucher 85 500 avant — en cours · rien de touché', S.ligne(F.scenarios[0], e0, 'debutant'));
  check('… forme courte : « 1. 86 500 $ puis 87 200 $ (inval. 85 500 $) — rien de touché »', t(S.ligne(F.scenarios[0], e0, 'debutant', true)) === '1. 86 500 $ puis 87 200 $ (inval. 85 500 $) — rien de touché', S.ligne(F.scenarios[0], e0, 'debutant', true));
  check('range, débutant : « 3. Le prix reste entre 85 600 et 86 400 $ — … » (pas « Range »)', t(S.ligne(F.scenarios[2], e0, 'debutant')) === '3. Le prix reste entre 85 600 et 86 400 $ — en cours · rien de touché', S.ligne(F.scenarios[2], e0, 'debutant'));
  check('semaine : « Semaine : vers 88 000, sans toucher 84 000 avant — … »', t(S.ligne(F.scenarios[3], e0, 'debutant')) === 'Semaine : vers 88 000, sans toucher 84 000 avant — en cours · rien de touché', S.ligne(F.scenarios[3], e0, 'debutant'));
  const ex1 = t(S.explication(F.scenarios[0], null, 'debutant', P, { itv: '15 min' }));
  check('survol : « Ce scénario se lit : le prix touche 86 500 $ (…), puis 87 200 $ (…), sans toucher avant 85 500 $ (…) » et ce qu’est l’invalidation',
    ex1.includes('Ce scénario se lit : le prix touche 86 500 $ (plus haut du 08/10), puis 87 200 $ (mur de calls, modèle), sans toucher avant 85 500 $ (plus bas de la nuit).') && ex1.some(l => /^85 500 \$ est l’invalidation : si sa zone est touchée/.test(l)), ex1);
  check('le rang dit que c’est le jugement de Claude', /^Rang 1 : jugé par Claude le plus probable/.test(S.SENS_RANG['1']));
  check('aucun libellé ne commence par « $ »', textes.every(x => !/^\$/.test(x)));
}

// ── 6 bis. Débutant : la ligne, le libellé, la bulle (A1) ──
titre('6 bis. Débutant : une ligne d’état marquée, un libellé court, une bulle sans jargon');
{
  const G = require(path.join(REPO, 'js/guide.js')), DEB = dansPage('PARAM.guide.debutant');
  const F = S.lire(copie(FIX), H3), un = F.scenarios.find(x => x.rang === '1');
  const SV = [{ cle: 'avant' }, { cle: 'rien' }, { cle: 'dedans' }, { cle: 'cible', k: 1 }, { cle: 'realise' }, { cle: 'invalide' }, { cle: 'sortie', sortie: { haut: true } }, { cle: 'ambigu' }, { cle: 'rien', fini: true }];
  const lignes = [];
  for (const sv of SV) for (const max of [DEB.boite, DEB.boiteEtroit]) lignes.push([sv.cle + (sv.fini ? ' fini' : ''), max, t(S.ligneBoiteDebutant(F, [{ sc: un, sv }], H3, max, P))]);
  check('ligne des scénarios : ≤ ' + DEB.boite + ' caractères (≤ ' + DEB.boiteEtroit + ' en étroit), l’état calculé ici marqué « (en direct) », le renvoi ▸', lignes.every(([, max, l]) => l.length <= max && / \(en direct\) ▸$/.test(l) && /^Scén(?:ario|\.)(?: du matin)? : /.test(l) && !/Scén(?:ario|\.) 1/.test(l)), lignes);
  check('ligne au large : « Scénario du matin : en cours (en direct) ▸ » (jamais un 2e « Scénario 1 » sous le libellé)', S.ligneBoiteDebutant(F, [{ sc: un, sv: { cle: 'avant' } }], H3, DEB.boite, P) === 'Scénario du matin : en cours (en direct) ▸', S.ligneBoiteDebutant(F, [{ sc: un, sv: { cle: 'avant' } }], H3, DEB.boite, P));
  const renvois = ['large', 'incomplet'].map(cle => t(S.ligneBoiteDebutant(F, [{ sc: un, sv: { cle } }], H3, DEB.boite, P)));
  check('bougies trop larges, historique trop court : un renvoi, SANS marque (rien n’est calculé)', renvois.every(l => l.length <= DEB.boite && !/\((en direct|journal)\)/.test(l)) && /à voir en 15 min ou 1 h/.test(renvois[0]) && /données manquantes/.test(renvois[1]), renvois);
  const jn = Object.assign({}, un, { statut: '✅' });
  const lj = t(S.ligneBoiteDebutant(F, [{ sc: jn, sv: { cle: 'avant' } }], H3, DEB.boite, P));
  check('note du journal : marquée « (journal) », jamais « (en direct) »', /réalisé ✓ \(journal\) ▸$/.test(lj) && !/en direct/.test(lj), lj);
  const att = t(S.ligneBoiteDebutant(S.lire(copie(ATTENTE), H3), [], H3, DEB.boite, P)), abs = t(S.ligneBoiteDebutant(null, [], H3, DEB.boite, P));
  const anc = t(S.ligneBoiteDebutant(F, [{ sc: un, sv: { cle: 'avant' } }], ms('2026-10-10T08:00Z'), DEB.boite, P));
  check('fichier d’attente, absent, de la veille : « Scénarios du matin : … », « … indisponibles », « Scénarios d’hier : terminés ▸ »', /^Scénarios du matin : /.test(att) && abs === 'Scénarios du matin : indisponibles' && anc === 'Scénarios d’hier : terminés ▸', [att, abs, anc]);
  const toutes = lignes.map(l => l[2]).concat(renvois, [lj, att, abs, anc]);
  check('lignes : aucun « ordre » (un mot de bourse), aucun mot banni, aucun pourcentage', toutes.every(l => !/\bordres?\b/i.test(l) && !G.motsBannis(l).length && !/%/.test(l)), toutes.filter(l => /\bordres?\b/i.test(l) || G.motsBannis(l).length || /%/.test(l)));
  // Le libellé près de la zone : ≤ 32 caractères, une flèche au plus.
  const libs = [];
  for (const sc of F.scenarios) for (const fl of [null, '↑', '↓']) for (const sv of [null, { cle: 'cible', k: 1 }]) for (const max of [DEB.scenario, 20]) libs.push([sc.rang, fl, max, t(S.libelleDebutant(sc, sv, max, null, 0, fl))]);
  check('libellé du scénario : ≤ ' + DEB.scenario + ' caractères, une flèche au plus (hors de la vue, la flèche de tête remplace celle du sens)',
    libs.every(([, , max, l]) => l.length <= Math.max(max, 9) && (l.match(/[↑↓]/g) || []).length <= 1) && libs.every(([, , max, l]) => max < DEB.scenario || l.length <= DEB.scenario), libs.filter(([, , max, l]) => l.length > DEB.scenario || (l.match(/[↑↓]/g) || []).length > 1));
  check('libellé : « Scénario 1 : vers 86 500 $ ↑ », après la 1re cible « Scénario 1 : ensuite 87 200 $ ↑ » ; range avec son verbe et son unité « Scén. 3 : reste 85 600–86 400 $ » (sans « reste », il se lisait « va de … à … »), « Scénario 3 : 85 600 – 86 400 $ » en repli',
    S.libelleDebutant(un, null, DEB.scenario) === 'Scénario 1 : vers 86 500 $ ↑' && S.libelleDebutant(un, { cle: 'cible', k: 1 }, DEB.scenario) === 'Scénario 1 : ensuite 87 200 $ ↑'
    && S.libelleDebutant(F.scenarios[2], null, DEB.scenario) === 'Scén. 3 : reste 85 600–86 400 $' && S.libellesDebutant(F.scenarios[2], null, DEB.scenario).includes('Scénario 3 : 85 600 – 86 400 $')
    && S.libellesDebutant(F.scenarios[2], null, DEB.scenario).slice(-1)[0] === 'Scén. 3' && S.libellesDebutant(F.scenarios[2], null, DEB.scenario).every(l => l.length <= DEB.scenario) && S.libelleDebutant(un, null, DEB.scenario, null, 0, '↑') === '↑ Scénario 1 : vers 86 500 $',
    [S.libelleDebutant(un, null, DEB.scenario), S.libelleDebutant(F.scenarios[2], null, DEB.scenario), S.libelleDebutant(un, null, DEB.scenario, null, 0, '↑')]);
  // La bulle : chaque scénario en mots, ses origines sans jargon, aucun pourcentage hors la marge.
  const bul = [];
  for (const sc of F.scenarios) for (const sv of SV) { bul.push(t(S.ligneDebutant(sc, sv))); bul.push(...t(S.explicationDebutant(sc, sv, P, {}))); }
  bul.push(t(S.enteteDebutant(F, P, H3)), t(S.enteteDebutant(null, P, H3)));
  const sales = bul.filter(x => G.motsBannis(x).length || /%/.test(x) || /hasard|\bUTC\b/i.test(x));
  check(`${bul.length} textes de bulle : aucun mot banni, ni UTC, ni pourcentage (pas même la marge d’une zone : dite en dollars, choix 1B), ni base du hasard`, !sales.length, sales.slice(0, 4));
  check('ligne de bulle : « 1. Le prix va vers 86 500 $ puis 87 200 $, sans toucher 85 500 $ avant — en cours (en direct) »', S.ligneDebutant(un, { cle: 'avant' }) === '1. Le prix va vers 86 500 $ puis 87 200 $, sans toucher 85 500 $ avant — en cours (en direct)', S.ligneDebutant(un, { cle: 'avant' }));
  check('origine sans jargon : « plus haut du 08/10 (83 521), EMA 20 1d » → « plus haut du 08/10, 83 521 » ; « mur de calls (modèle) » → rien', S.origineDebutant('plus haut du 08/10 (83 521), EMA 20 1d') === 'plus haut du 08/10, 83 521' && S.origineDebutant('mur de calls (modèle)') === null, [S.origineDebutant('plus haut du 08/10 (83 521), EMA 20 1d'), S.origineDebutant('mur de calls (modèle)')]);
  const hPoint = Fm.heure(S.pointMs(F.groupe, P.point));
  check('en-tête : « Écrits par Claude, une IA, ce matin, publiés au point de ' + hPoint + '. » (heure de l’appareil, sans « heure de Paris »)', S.enteteDebutant(F, P, H3) === 'Écrits par Claude, une IA, ce matin, publiés au point de ' + hPoint + '.', S.enteteDebutant(F, P, H3));
  const exR = S.explicationDebutant(F.scenarios[2], null, P, {}).join(' ');
  check('range, bulle : ses bornes élargies en dollars (« sans sortir de 85 343 – 86 659 $ »), aucun « ± N % »', /sans sortir de \d{1,3}(?: \d{3})* – \d{1,3}(?: \d{3})* \$/.test(exR) && !/%/.test(exR), exR);
}

// ── 7. Dans la page ──
titre('7. Dans la page : paramètres, menu, fiche, choix gardé, lecture du fichier');
{
  const src = fs.readFileSync(path.join(REPO, 'js/scenarios.js'), 'utf8');
  const lus = [...new Set([...src.matchAll(/\bP\.([a-zA-Z]+)\b/g)].map(m => m[1]))];
  check(`les ${lus.length} paramètres lus par js/scenarios.js sont dans PARAM.scenarios`, lus.length > 0 && lus.every(k => k in P), lus.filter(k => !(k in P)));
  const html = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8');
  check('js/scenarios.js chargé (defer) avant js/app.js', /<script defer src="js\/scenarios\.js"><\/script>[\s\S]*<script defer src="js\/app\.js"><\/script>/.test(html));
  const T = page.T, cat = T.INDICATORS.find(c => c.cat === 'Guide');
  const item = cat && cat.items.find(i => i.key === 'scenarios');
  // L'heure du point dans le libellé : celle de l'appareil (Fmt.heure), ni « Paris » ni « 07h00 ».
  const hMenu = Fm.heure(S.pointMs(new Date().toISOString().slice(0, 10), P.point));
  check(`menu : « Scénarios du matin … (${hMenu}) » dans la catégorie Guide (heure de l’appareil), avec sa fiche`, item && /^Scénarios du matin/.test(item.label) && item.label.endsWith('(' + hMenu + ')') && !/Paris|\dh\d/.test(item.label) && T.FICHE_IND.scenarios === 'scenarios', item);
  const f = T.ficheHtml('scenarios');
  check('fiche « scenarios » : Claude (une IA), sans pourcentage, ordre du premier mouvement, suivi en direct / journal, pas une recommandation',
    /Claude \(une IA\)/.test(f) && /SANS pourcentage/.test(f) && /Ordre du premier mouvement/.test(f) && /SUIVI EN DIRECT/.test(f) && /note officielle est celle du journal/.test(f) && /pas une recommandation/.test(f));
  const SRC_FICHES = fs.readFileSync(path.join(REPO, 'js/fiches.js'), 'utf8');
  check('la fiche est dans le glossaire, groupe « Guide et scénarios du matin »', /\['Guide et scénarios du matin', \[[^\]]*'scenarios'/.test(SRC_FICHES));
  check('fiche : la cadence de relecture et le seuil d’échantillon lus dans CADENCES / PARAM', f.includes('toutes les ' + Math.round(T.CADENCES.previsions_lue / 60000) + ' minutes') && f.includes('sous ' + P.echantillonFaible + ' matins'));
  check('affichés par défaut ; masqués une fois, ils le restent (samsara-scenarios-v1)', dansPage('overlays.scenarios') === true
    && vm.runInContext('overlays.scenarios', chargerPage({ stockage: { 'samsara-scenarios-v1': '0' } }).sandbox) === false);
  check('cadence de relecture dans CADENCES (previsions_lue), minuterie d’init() qui la lit', T.CADENCES.previsions_lue > 0 && /setInterval\(visible\(fetchPrevisions\), CADENCES\.previsions_lue\)/.test(fs.readFileSync(path.join(REPO, 'js/app.js'), 'utf8')));
  check('URL : la branche « previsions » sur GitHub Raw, sans « ?t= » (le CDN l’ignore)', /\/previsions\/previsions\.json$/.test(dansPage('PREVISIONS_URL')));
  check('sans fichier lu, Guide masqué : marge de futur nulle (aucun scénario à dessiner)',
    dansPage('candles = Array.from({ length: 60 }, (_, i) => ({ time: i * 900, open: 1, high: 2, low: 0.5, close: 1, volume: 1 })); viewStart = 10; viewEnd = 60; overlays.guide = false; const __m = margeFutur(1000, 50); overlays.guide = true; candles = []; viewStart = viewEnd = 0; __m') === 0);
}

// La lecture du fichier par la page (fetch simulé) : même contenu = aucun redessin.
async function lecturePage() {
  titre('8. Lecture par la page : redessin seulement si le contenu change, échec dit en une ligne');
  let reponse = null;
  const p = chargerPage({ fetch: async () => reponse() });
  const run = c => vm.runInContext(c, p.sandbox);
  run('__dessins = 0; scheduleDraw = () => { __dessins++; };');
  const texte = JSON.stringify(FIX);
  reponse = () => ({ ok: true, status: 200, text: async () => texte });
  await run('fetchPrevisions()');
  check('1re lecture : fichier lisible, un dessin demandé', run('previsions && previsions.etat') === 'ok' && run('__dessins') === 1, [run('previsions && previsions.etat'), run('__dessins')]);
  const n = run('previsionsN');
  await run('fetchPrevisions()');
  check('même contenu relu : aucun dessin de plus, même numéro de fichier', run('__dessins') === 1 && run('previsionsN') === n);
  reponse = () => ({ ok: false, status: 404, text: async () => '' });
  await run('fetchPrevisions()');
  check('relecture ratée : le dernier fichier lisible reste, l’échec est noté (HTTP 404)', run('previsions.etat') === 'ok' && run('previsionsEchec && previsionsEchec.raison') === 'HTTP 404');
  // L'encadré, sans fichier : une ligne.
  const p2 = chargerPage({ fetch: async () => ({ ok: true, status: 200, text: async () => '{ pas du json' }) });
  vm.runInContext('scheduleDraw = () => {};', p2.sandbox);
  await vm.runInContext('fetchPrevisions()', p2.sandbox);
  check('JSON illisible : rien de lu, raison « JSON illisible »', vm.runInContext('previsions === null && previsionsEchec.raison', p2.sandbox) === 'JSON illisible');
  const p3 = chargerPage({ fetch: async () => ({ ok: true, status: 200, text: async () => JSON.stringify(ATTENTE) }) });
  vm.runInContext('scheduleDraw = () => {};', p3.sandbox);
  await vm.runInContext('fetchPrevisions()', p3.sandbox);
  check('fichier d’attente : lu comme tel (rien à dessiner, la note gardée)', vm.runInContext('previsions.etat === "attente" && !!previsions.note && scenDessinables() === null', p3.sandbox));
  const p4 = chargerPage({ fetch: async () => ({ ok: true, status: 200, text: async () => texte }) });
  vm.runInContext('scheduleDraw = () => {}; activeSymbol = "ETHUSDT";', p4.sandbox);
  await vm.runInContext('fetchPrevisions()', p4.sandbox);
  check('hors BTCUSDT : aucune lecture', !p4.appels.some(u => /previsions/.test(u)));
}

// ── 9. Mots ──
function mots9() {
  titre('9. Ce que les scénarios écrivent : ils décrivent, ne conseillent pas, n’attribuent aucune intention');
  const src = fs.readFileSync(path.join(REPO, 'js/scenarios.js'), 'utf8');
  check(`${textes.length} textes produits : aucun conseil d’achat ou de vente`, !textes.some(x => CONSEIL.test(x)), textes.filter(x => CONSEIL.test(x)));
  check('aucune intention prêtée', !textes.some(x => ACCUSE.test(x)), textes.filter(x => ACCUSE.test(x)));
  check('js/scenarios.js : ni conseil ni intention prêtée, même en commentaire', !CONSEIL.test(src) && !ACCUSE.test(src), [(src.match(CONSEIL) || [])[0], (src.match(ACCUSE) || [])[0]]);
  const app = fs.readFileSync(path.join(REPO, 'js/app.js'), 'utf8');
  const i0 = app.indexOf('let scenEtat = null;'), bloc = app.slice(i0, app.indexOf('// Étiquettes d\'overlays posées'));
  check('js/app.js, dessin des scénarios : ni conseil ni intention prêtée, aucune minuterie', i0 > 0 && bloc.length > 1000 && !CONSEIL.test(bloc) && !ACCUSE.test(bloc) && !/setInterval|setTimeout/.test(bloc));
  const f = page.T.FICHES.scenarios;
  const ft = [f.simple, f.limites, ...f.lectures.map(l => l.t)].join(' ');
  check('fiche : ni conseil ni intention prêtée', !CONSEIL.test(ft) && !ACCUSE.test(ft));
}

lecturePage().then(() => {
  mots9();
  console.log(ko ? `\n❌ SCÉNARIOS : ${ko} contrôle(s) en échec` : '\n✅ SCÉNARIOS : TOUS LES CONTRÔLES PASSENT');
  process.exit(ko ? 1 : 0);
}).catch(e => { console.error(e); process.exit(1); });
