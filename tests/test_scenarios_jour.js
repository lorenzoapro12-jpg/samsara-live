// La JOURNÉE des scénarios du matin (js/scenarios.js, section 5) : aucune nouvelle prévision, les
// scénarios de 07h00 recalculés en continu — contacts, chemin restant, invalidations, temps restant,
// et le scénario au plus petit ÉCART (une mesure, jamais une probabilité). Hors navigateur.
//
//   1. position() sur le VRAI fichier du 09/10 (P = 83 096) : écarts 0,40 / 0,77 / 0,23 ;
//   2. decider / classerJour : « trop tôt » (mémorisé, M1), départ au rang 1 (M2), écart seul (M3),
//      hystérésis 0,12, seul / aucun ne colle (M5), réalisé, aucun, hors, journal, semaine, fini ;
//   3. rejouerJour sur le 08/10 réel (niveaux modèle) : changements exacts, même nom en 1 min
//      regroupées et en 15 min (M6), propriété « pas de clignotement » sur des ticks d'une minute (A1) ;
//   4. fondu (depuis la clôture de la bougie du contact, M10), reste ;
//   5. lignes Débutant (A à I, M4) : longueurs, « (en direct) » / « (journal) », aucun mot banni,
//      aucun %, aucun conseil ; libellé réalisé « zone … ✓ » (A3) ;
//   6. textes Expert : « Plus petit écart : N (clôture de 15 min …) », « nom gardé » quand l'hystérésis garde un autre nom à la clôture, jamais « écart 0,xx » ni « en tête » (A2) ;
//   7. raison() (chemin, range, ambigu, mèche) ; pas() avec la clôture (contact en mèche) ;
//   8. coût : rejeu de 3000 bougies 1 min, classement + bougie en cours.
// USAGE   node tests/test_scenarios_jour.js
const fs = require('fs'), path = require('path');
const S = require('../js/scenarios.js');
const Guide = require('../js/guide.js');
const FX = path.join(__dirname, 'fixtures');
let ko = 0;
const check = (nom, ok, det) => { if (!ok) ko++; console.log(`  ${ok ? '✓' : '✗'} ${nom}${!ok && det !== undefined ? ' — ' + JSON.stringify(det).slice(0, 600) : ''}`); };
const titre = t => console.log(`\n── ${t} ──`);
const PJ = { ecartChangement: 0.12, departageMinutes: 60, departageMouvementPct: 0.5, horsMarges: 1, fonduMinutes: 60, colle: 0.5, quartMs: 900000 };
const proche = (a, b, e) => Math.abs(a - b) <= e;
const CONSEIL = /achet|vend|\bentrez\b|\bsortez\b|prenez position|signal d.(achat|vente)|recommand|il faut/i;
const bannis = t => Guide.motsBannis(t);
const Q = 900000;

// ── 1. Le vrai fichier du 09/10 ──
titre('1. position() sur le vrai fichier du 09/10, P = 83 096 (14:55 UTC)');
const F09 = S.lire(JSON.parse(fs.readFileSync(path.join(FX, 'previsions-jour-0910.json'), 'utf8')), Date.parse('2026-10-09T15:00Z'));
const [R1, R2, R3] = F09.scenarios;
const svRien = sc => S.etat(sc, S.suiviVide(Q), Date.parse('2026-10-09T15:00Z'));
const P09 = 83096;
const p1 = S.position(R1, { cle: 'dedans' }, P09), p2 = S.position(R2, { cle: 'rien', k: 0 }, P09), p3 = S.position(R3, { cle: 'rien', k: 0 }, P09);
check(`rang 1 (range) : e = 0,40 (${p1.e.toFixed(3)}), bord haut toléré 84 335 à 1 239 $`, proche(p1.e, 0.40, 0.005) && p1.bord === 'haut' && proche(p1.niveauBord, 84335, 0.5) && proche(p1.dBord, 1239, 1), p1);
check(`rang 2 : e = 0,77 (${p2.e.toFixed(3)}), zone 80 400 à 1 892 $, invalidation à 559 $`, proche(p2.e, 0.77, 0.005) && proche(p2.dCible, 1892, 1) && proche(p2.dInv, 559, 1), p2);
check(`rang 3 : e = 0,23 (${p3.e.toFixed(3)}), zone 84 500 à 559 $ (dès 83 655 $)`, proche(p3.e, 0.23, 0.005) && proche(p3.dCible, 559, 1) && proche(p3.bordCible, 83655, 0.5), p3);
check('deux chemins miroirs : e₂ + e₃ = 1 (raison de ne jamais écrire l’indice en liste, A2)', proche(p2.e + p3.e, 1, 1e-9));
{
  const items = F09.scenarios.map(sc => ({ sc, sv: svRien(sc) }));
  items[0].sv = Object.assign({}, items[0].sv, { cle: 'dedans', n: 40 });
  items[1].sv = Object.assign({}, items[1].sv, { cle: 'rien', n: 40 }); items[2].sv = Object.assign({}, items[2].sv, { cle: 'rien', n: 40 });
  const mem = { prec: R1.id, sortiTot: true };
  const d = S.decider(items, P09, F09, Date.parse('2026-10-09T14:45Z'), mem, PJ);
  check('09/10 14:45 : le 3 a 0,17 d’avance sur le 1 (≥ 0,12) → il prend le nom', d.cas === 'meneur' && mem.prec === R3.id && d.change, { d, mem });
}

// ── Un petit monde synthétique pour les règles ──
const iso = ms => new Date(ms).toISOString().slice(0, 16) + 'Z';
const T0 = Date.parse('2026-10-08T04:30Z');
function fichier(scs, opts = {}) {
  const P0 = opts.P0 || 100000, fin = iso(T0 + 86400e3 - 600e3);
  return S.lire({ format: 'previsions-1', groupe: '2026-10-08', emis_utc: iso(T0), prix_emission: P0, marge_pct: 1,
    scenarios: scs.map((x, i) => Object.assign({ id: 'X' + (x.rang || String(i + 1)), rang: String(i + 1), groupe: '2026-10-08', emis_utc: iso(T0), fin_utc: x.rang === 'S' ? iso(T0 + 7 * 86400e3) : fin, prix_emission: P0, marge_pct: 1, statut: '⏳' }, x)) }, T0);
}
const R = { forme: 'range', range: [99000, 101000] };        // tolérée 98 010 – 102 010
const U = { forme: 'chemin', cibles: [103000], invalidation: 97000 };
const D = { forme: 'chemin', cibles: [97000], invalidation: 103000 };
const sv = (cle, k) => ({ cle, k: k || 0, n: 10, fini: false, pas: Q, touchees: [], temps: [], meche: [] });
const it = (sc, s) => ({ sc, sv: s });

titre('2. decider / classerJour : les règles de la journée');
{
  const F = fichier([R, U, D]);
  const [a, b, c] = F.scenarios;
  const items = () => [it(a, sv('dedans')), it(b, sv('rien')), it(c, sv('rien'))];
  // Trop tôt : 30 min, +0,3 % ; puis 61 min.
  let mem = { prec: null, sortiTot: false };
  let d = S.decider(items(), 100300, F, T0 + 30 * 60e3, mem, PJ);
  check('30 min après le point, +0,3 % : « trop tôt pour départager » (aucun nom)', d.cas === 'tot' && mem.prec === null, d);
  d = S.decider(items(), 100300, F, T0 + 61 * 60e3, mem, PJ);
  check('61 min : un nom ; départ = le rang 1 du matin (M2)', d.cas === 'meneur' && mem.prec === a.id && mem.sortiTot, { d, mem });
  // M1 : « trop tôt » mémorisé.
  mem = { prec: null, sortiTot: false };
  d = S.decider(items(), 100600, F, T0 + 30 * 60e3, mem, PJ);
  const d2 = S.decider(items(), 100200, F, T0 + 40 * 60e3, mem, PJ);
  check('M1 : 30 min à +0,6 % (nommé), puis 40 min à +0,2 % → toujours nommé (« trop tôt » ne revient pas)', d.cas === 'meneur' && d2.cas === 'meneur' && mem.prec === a.id, [d, d2, mem]);
  // Hystérésis : écarts construits. Range au milieu e = 0 ; on décale le prix.
  // e(range) = 1 − d/2000 ; e(U) = dZ/(dZ+dI) avec zone U [101 970, 104 030], inv [96 030, 97 970].
  const eR = p => S.position(a, null, p).e, eU = p => S.position(b, { cle: 'rien', k: 0 }, p).e;
  const chercher = avance => { let lo = 100000, hi = 101900; for (let k = 0; k < 60; k++) { const m = (lo + hi) / 2; if (eR(m) - eU(m) < avance) lo = m; else hi = m; } return (lo + hi) / 2; };
  const p11 = chercher(0.11), p13 = chercher(0.13);
  mem = { prec: a.id, sortiTot: true };
  d = S.decider(items(), p11, F, T0 + 5 * 3600e3, mem, PJ);
  check(`hystérésis : un autre à 0,11 d’avance (prix ${Math.round(p11)}) ne prend pas le nom`, mem.prec === a.id && !d.change, { eR: eR(p11), eU: eU(p11) });
  d = S.decider(items(), p13, F, T0 + 5 * 3600e3, mem, PJ);
  check(`hystérésis : à 0,13 d’avance (prix ${Math.round(p13)}), il le prend`, mem.prec === b.id && d.change, { eR: eR(p13), eU: eU(p13) });
  // M3 : l'écart seul (une cible déjà touchée ne passe pas devant).
  const F2 = fichier([R, { forme: 'chemin', cibles: [101500, 104000], invalidation: 97000 }, D]);
  const [a2, b2, c2] = F2.scenarios;
  const its = [it(a2, sv('dedans')), it(b2, sv('cible', 1)), it(c2, sv('rien'))];
  mem = { prec: b2.id, sortiTot: true };
  d = S.decider(its, 100000, F2, T0 + 5 * 3600e3, mem, PJ);
  check('M3 : un chemin qui a touché sa 1re cible mais revenu loin ne passe pas devant un range au milieu (écart seul)', mem.prec === a2.id, { mem, eB: S.position(b2, its[1].sv, 100000).e });
  // seul, aucunNeColle
  const one = [it(a, Object.assign(sv('sortie'), { t: T0 + 3600e3, sortie: { haut: true } })), it(b, sv('rien')), it(c, Object.assign(sv('invalide'), { t: T0 }))];
  const rjOk = { grille: true, sortiTot: true, prec: a.id, cas: 'meneur', tDecision: T0 + 5 * 3600e3 };
  let J = S.classerJour(one, 102500, F, T0 + 5 * 3600e3, rjOk, PJ);
  check('M5 : un seul scénario ouvert → « seul », jamais un nom de « suit le mieux »', J.cas === 'seul' && J.seul && J.seul.sc === b && !J.meneur, J.cas);
  check('M5 : « seul » en Expert : « Seul encore en cours : 2 »', /^Seul encore en cours : 2/.test(S.phraseJourExpert(J)[0]), S.phraseJourExpert(J));
  const Fa = fichier([{ forme: 'range', range: [99500, 100500] }, { forme: 'chemin', cibles: [104000], invalidation: 100800 }, D]);
  const [xa, xb, xc] = Fa.scenarios;
  mem = { prec: xa.id, sortiTot: true };
  d = S.decider([it(xa, sv('dedans')), it(xb, sv('rien')), it(xc, sv('rien'))], 101300, Fa, T0 + 5 * 3600e3, mem, PJ);
  check('M5 : deux ouverts ou plus, plus petit écart ≥ 0,5 → « aucun ne colle » (aucun nom)', d.cas === 'aucunNeColle', d);
  // réalisé, aucun
  J = S.classerJour([it(a, Object.assign(sv('sortie'), { t: T0, sortie: { haut: false } })), it(b, Object.assign(sv('realise'), { t: T0 + 3600e3 })), it(c, Object.assign(sv('invalide'), { t: T0 }))], 104500, F, T0 + 5 * 3600e3, rjOk, PJ);
  check('aucun ouvert, un réalisé → « realise » ; le montré est le réalisé', J.cas === 'realise' && J.montre && J.montre.sc === b, [J.cas, J.montre && J.montre.sc.rang]);
  J = S.classerJour([it(a, Object.assign(sv('sortie'), { t: T0 + 4 * 3600e3, sortie: { haut: true } })), it(b, Object.assign(sv('invalide'), { t: T0 })), it(c, Object.assign(sv('invalide'), { t: T0 }))], 104500, F, T0 + 4.5 * 3600e3, rjOk, PJ);
  check('ni ouvert ni réalisé → « aucun » ; le rang 1 montré pendant son fondu', J.cas === 'aucun' && J.montre && J.montre.sc === a && J.montre.fondu > 0, [J.cas, J.montre && J.montre.fondu]);
  // hors
  check('« hors » à plus d’une marge au-delà du bord extérieur de la zone la plus extrême (104 030 × 1,01)', !S.horsNiveaux(F.scenarios.slice(0, 3), 105000, PJ) && S.horsNiveaux(F.scenarios.slice(0, 3), 105100, PJ).haut && proche(S.horsNiveaux(F.scenarios.slice(0, 3), 105100, PJ).seuil, 104030 * 1.01, 0.01));
  // journal gagne
  const Fj = fichier([Object.assign({ statut: '❌', resolu_utc: iso(T0 + 3600e3) }, R), Object.assign({ statut: '✅' }, U), D]);
  J = S.classerJour([it(Fj.scenarios[0], sv('dedans')), it(Fj.scenarios[1], sv('rien')), it(Fj.scenarios[2], sv('rien'))], 100000, Fj, T0 + 5 * 3600e3, rjOk, PJ);
  check('le journal gagne : ❌ ferme un range « dedans », ✅ réalise un chemin « rien »', !J.items[0].ouvert && J.items[0].ferme.journal && J.realises.includes(J.items[1]) && J.cas === 'seul', [J.cas, J.items.map(i => i.ouvert)]);
  // semaine
  const Fs = fichier([R, U, D, Object.assign({ rang: 'S' }, { forme: 'chemin', cibles: [100100], invalidation: 90000 })]);
  J = S.classerJour(Fs.scenarios.map(x => it(x, sv(x.forme === 'range' ? 'dedans' : 'rien'))), 100050, Fs, T0 + 5 * 3600e3, { grille: true, sortiTot: true, prec: 'XS', cas: 'meneur' }, PJ);
  check('le scénario de la semaine n’entre jamais dans le classement', J.items.length === 3 && J.ouverts.every(i => i.sc.rang !== 'S') && (!J.meneur || J.meneur.sc.rang !== 'S'), J.ouverts.map(i => i.sc.rang));
  // fini
  J = S.classerJour(items(), 100000, F, T0 + 86400e3, rjOk, PJ);
  check('après la fin → « fini » ; Expert « Terminé à 04:20 UTC · note du journal à venir » (M12)', J.cas === 'fini' && S.phraseJourExpert(J)[0] === 'Terminé à 04:20 UTC · note du journal à venir', [J.cas, S.phraseJourExpert(J)]);
  // grille
  J = S.classerJour(items(), 100800, F, T0 + 5 * 3600e3, { grille: false }, PJ);
  check('bougies d’une heure (pas de grille de 15 min) : aucun nom ; Expert « à voir en 15 min » (M6)', J.cas === 'grille' && !J.meneur && /à voir en 15 min/.test(S.phraseJourExpert(J)[0]), J.cas);
  // la bougie en cours ferme le nommé : le suivant tout de suite
  J = S.classerJour([it(a, Object.assign(sv('sortie'), { t: T0 + 5 * 3600e3, sortie: { haut: true } })), it(b, sv('rien')), it(c, sv('rien'))], 102100, F, T0 + 5 * 3600e3 + 60e3, rjOk, PJ);
  check('A1 : la bougie en cours ferme le scénario nommé → le suivant est nommé tout de suite (sans hystérésis)', J.remplace && J.meneur && J.meneur.sc === b || J.cas === 'aucunNeColle', [J.cas, J.meneur && J.meneur.sc.rang]);
}

// ── 3. Rejeux réels ──
titre('3. rejouerJour : le 08/10 réel (niveaux modèle), le 06/10 (« aucun »)');
const X08 = JSON.parse(fs.readFileSync(path.join(FX, 'rejeu-jour-0810.json'), 'utf8'));
const F08 = S.lire(X08.fichier, Date.parse('2026-10-08T04:30Z'));
const col = K => ({ T: K.map(k => k[0] / 1000), H: K.map(k => k[2]), L: K.map(k => k[3]), C: K.map(k => k[4]) });
const k15 = col(X08.k15), k1 = col(X08.k1);
const hm = t => new Date(t).toISOString().slice(11, 16);
const rj = S.rejouerJour(F08, F08.scenarios, k15.T, k15.H, k15.L, k15.C, X08.k15.length, Q, PJ, true);
const nomDe = id => F08.scenarios.find(s => s.id === id).rang;
const chg = rj.changements.map(c => hm(c.t) + '→' + nomDe(c.id)).join(' ');
check(`changements du nom : 13:45 → 2 ; 14:15 → 1 (« ${chg} »)`, chg === '13:45→2 14:15→1', rj.changements);
const premier = rj.decisions.find(d => d.cas === 'meneur');
check(`premier nom à 05:30 : le rang 1 (sortie de « trop tôt »)`, premier && hm(premier.t) === '05:30' && nomDe(premier.prec) === '1', premier);
const a1530 = rj.decisions.find(d => hm(d.t) === '15:30'), a1730 = rj.decisions.find(d => hm(d.t) === '17:30');
check('15:30 : le 2 réalisé et le 3 invalidé dans la bougie 15:15–15:30 → « seul » (le 1)', a1530 && a1530.cas === 'seul', a1530);
check('17:30 : le 1 sorti (bougie 17:15–17:30) → plus aucun ouvert', a1730 && a1730.cas === 'ferme', a1730);
{
  // classerJour à 17:40 sur les bougies du graphique : réalisé (le 2).
  const n = X08.k15.findIndex(k => k[0] === Date.parse('2026-10-08T17:30Z')) + 1;
  const now = Date.parse('2026-10-08T17:40Z');
  const items = F08.scenarios.map(sc => ({ sc, sv: S.etat(sc, S.plier(sc, k15.T, k15.H, k15.L, 0, n, null, Q, k15.C), now) }));
  const J = S.classerJour(items, k15.C[n - 1], F08, now, S.rejouerJour(F08, F08.scenarios, k15.T, k15.H, k15.L, k15.C, n - 1, Q, PJ), PJ);
  check('17:40 : « realise » (le 2) ; montré = le 2 ; le 1 sorti, en fondu', J.cas === 'realise' && J.montre && J.montre.sc.rang === '2' && J.items[0].ferme && J.items[0].ferme.type === 'sortie' && J.items[0].fondu > 0, [J.cas, J.montre && J.montre.sc.rang, J.items[0].fondu]);
  const l48 = S.ligneJourDebutant(F08, J, items, now, 48, {}), l40 = S.ligneJourDebutant(F08, J, items, now, 40, {});
  // Changé délibérément (revue) : « zone du 2 ✓ » au lieu de « le 2 réalisé ✓ » (jamais « réalisé »
  // sur le tracé pour un scénario peut-être pas dessiné) ; le libellé porte sa marque « (en direct) »
  // (la ligne peut céder sa place) et dit « zone ✓ », jamais le niveau seul coché (A3).
  check(`17:40 : ligne F « ${l48} » / « ${l40} »`, l48 === 'Scén. 1 sorti · zone du 2 ✓ (en direct) ▸' && l40 === 'Scén. 1 ✗ · zone du 2 ✓ (en direct) ▸', [l48, l40]);
  const lib = S.libellesJourDebutant(J.montre, 32, null);
  check(`17:40 : libellé du montré « ${lib[0]} » : dit « zone », jamais « atteint » (A3), marqué « (en direct) », ≤ 32`, lib[0] === 'Scénario 2 : zone ✓ (en direct)' && lib.every(t => !/atteint/.test(t) && /\(en direct\)$/.test(t) && t.length <= 32), lib);
  check('M10 : le fondu part de la CLÔTURE de la bougie du contact (17:30) : à 17:40, 1 − 10/60', proche(J.items[0].fondu, 1 - 10 / 60, 1e-9), J.items[0].fondu);
}
// Rejeu incrémental = rejeu d'un coup.
{
  const N = X08.k15.length, parts = [N - 200, N - 120, N - 50, N];
  const ok = parts.every(n => {
    const r = S.rejouerJour(F08, F08.scenarios, k15.T, k15.H, k15.L, k15.C, n, Q, PJ, true);
    return r.decisions.every((d, i) => JSON.stringify(d) === JSON.stringify(rj.decisions[i]));
  });
  check('rejeux sur des historiques plus courts : mêmes décisions que le rejeu complet (déterministe)', ok);
}
// M6 : 1 min regroupées = 15 min.
{
  const r1 = S.rejouerJour(F08, F08.scenarios, k1.T, k1.H, k1.L, k1.C, X08.k1.length, 60000, PJ, true);
  const a = r1.decisions.map(d => d.t + d.cas + d.prec).join('|'), b = rj.decisions.filter(d => d.t >= r1.decisions[0].t && d.t <= r1.decisions[r1.decisions.length - 1].t).map(d => d.t + d.cas + d.prec).join('|');
  check(`M6 : bougies 1 min regroupées par quart d’heure → les mêmes ${r1.decisions.length} décisions qu’en 15 min`, a === b && r1.decisions.length > 80, [r1.decisions.length, a.slice(0, 200), b.slice(0, 200)]);
  const r5 = (() => { const K5 = []; for (const k of X08.k1) { const t = Math.floor(k[0] / 300000) * 300000; const c = K5[K5.length - 1]; if (c && c[0] === t) { c[2] = Math.max(c[2], k[2]); c[3] = Math.min(c[3], k[3]); c[4] = k[4]; } else K5.push([t, k[1], k[2], k[3], k[4]]); } const c5 = col(K5); return S.rejouerJour(F08, F08.scenarios, c5.T, c5.H, c5.L, c5.C, K5.length, 300000, PJ, true); })();
  check('M6 : bougies 5 min → les mêmes décisions', r5.decisions.map(d => d.t + d.cas + d.prec).join('|') === a);
  check('M6 : bougies 1 h → pas de grille (aucun nom)', !S.rejouerJour(F08, F08.scenarios, k15.T, k15.H, k15.L, k15.C, 10, 3600000, PJ).grille);
}
// A1 / m8 : ticks d'une minute sur la bougie 15 min en cours.
{
  const scs = F08.scenarios, idx15 = new Map(X08.k15.map((k, i) => [k[0], i]));
  let affiche = null, chgAff = 0, horsClo = [], memo = new Map();
  for (let m = 0; m < X08.k1.length; m++) {
    const t = X08.k1[m][0], q = Math.floor(t / Q) * Q, nClos = idx15.get(q);
    if (nClos === undefined) continue;
    // La bougie 15 min en cours, faite des minutes déjà passées.
    let h = -Infinity, l = Infinity, c = null;
    for (let j = m; j >= 0 && X08.k1[j][0] >= q; j--) { h = Math.max(h, X08.k1[j][2]); l = Math.min(l, X08.k1[j][3]); if (c === null) c = X08.k1[j][4]; }
    if (!memo.has(nClos)) memo.set(nClos, S.rejouerJour(F08, scs, k15.T, k15.H, k15.L, k15.C, nClos, Q, PJ));
    const now = t + 60000;
    const items = scs.map(sc => { const e = S.plier(sc, k15.T, k15.H, k15.L, 0, nClos, null, Q, k15.C); if (S.compte(sc, q, Q)) S.pas(sc, e, nClos, q, h, l, c); return { sc, sv: S.etat(sc, e, now) }; });
    const J = S.classerJour(items, c, F08, now, memo.get(nClos), PJ);
    const nom = J.meneur ? J.meneur.sc.id : null;
    if (nom && affiche && nom !== affiche) { chgAff++; if (t !== q && !J.remplace) horsClo.push(hm(t)); }
    if (nom) affiche = nom;
  }
  check(`A1 : sur ${X08.k1.length} ticks d’une minute, le nom ne change qu’à une clôture de 15 min (ou quand la bougie ferme le nommé) — changements hors clôture : ${horsClo.length}`, !horsClo.length, horsClo);
  check(`A1 : autant de changements affichés (${chgAff}) que de changements aux clôtures (${rj.changements.length})`, chgAff === rj.changements.length, [chgAff, rj.changements.length]);
}
// 06/10 : aucun scénario ne décrit le mouvement.
{
  const X06 = JSON.parse(fs.readFileSync(path.join(FX, 'rejeu-jour-0610.json'), 'utf8'));
  const F06 = S.lire(X06.fichier, Date.parse('2026-10-06T04:30Z')), k = col(X06.k15);
  const n = X06.k15.findIndex(x => x[0] === Date.parse('2026-10-07T02:15Z')) + 1, now = Date.parse('2026-10-07T02:20Z');
  const items = F06.scenarios.map(sc => ({ sc, sv: S.etat(sc, S.plier(sc, k.T, k.H, k.L, 0, n, null, Q, k.C), now) }));
  const J = S.classerJour(items, k.C[n - 1], F06, now, S.rejouerJour(F06, F06.scenarios, k.T, k.H, k.L, k.C, n - 1, Q, PJ), PJ);
  const l48 = S.ligneJourDebutant(F06, J, items, now, 48, {}), l40 = S.ligneJourDebutant(F06, J, items, now, 40, {});
  check(`06/10, 02:20 UTC le 07/10 : « aucun » ; ligne G « ${l48} » / « ${l40} »`, J.cas === 'aucun' && l48 === 'Aucun scénario ne tient plus (en direct) ▸' && l40 === 'Scénarios : aucun ne tient (en direct) ▸', [J.cas, l48, l40]);
  check('06/10 : Expert « Aucun scénario du matin ne décrit ce mouvement »', /^Aucun scénario du matin ne décrit ce mouvement/.test(S.phraseJourExpert(J)[0]), S.phraseJourExpert(J));
}

// ── 4. Fondu, reste ──
titre('4. fondu, reste');
{
  const t = Date.parse('2026-10-08T15:30Z');
  check('fondu : 1 à la clôture, 0,5 à +30 min, 0 à +60 min et après', S.fondu(t, t, PJ) === 1 && proche(S.fondu(t, t + 30 * 60e3, PJ), 0.5, 1e-9) && S.fondu(t, t + 60 * 60e3, PJ) === 0 && S.fondu(t, t + 90 * 60e3, PJ) === 0 && S.fondu(t, t - 5 * 60e3, PJ) === 1);
  check('reste : « 13 h 25 », « 1 h 00 », « 47 min », null après la fin', S.reste((13 * 60 + 25) * 60e3 + 5000) === '13 h 25' && S.reste(3600e3) === '1 h 00' && S.reste(47 * 60e3 + 3000) === '47 min' && S.reste(0) === null && S.reste(-1) === null);
}

// ── 5. Lignes Débutant ──
titre('5. Lignes Débutant (cas A à I) : longueurs, marques, mots');
{
  const lignes = [];
  const pousser = (nom, F, J, items, now) => { for (const max of [48, 40]) lignes.push({ nom: nom + ' · ' + max, max, t: S.ligneJourDebutant(F, J, items, now, max, {}), montre: J && J.montre ? J.montre.sc.rang : null }); };
  // Le 08/10 à plusieurs moments (A, C, D, F) ; puis le rang 1 en chemin (E), le journal (I).
  const instant = (F, K, hhmm, modif) => {
    const now = Date.parse('2026-10-08T' + hhmm + 'Z'), n = K.T.findIndex(x => x * 1000 + Q > now);
    const items = F.scenarios.map(sc => ({ sc: modif ? modif(sc) : sc, sv: S.etat(sc, S.plier(sc, K.T, K.H, K.L, 0, n + 1, null, Q, K.C), now) }));
    return { items, now, J: S.classerJour(items, K.C[n], F, now, S.rejouerJour(F, F.scenarios, K.T, K.H, K.L, K.C, n, Q, PJ), PJ) };
  };
  for (const h of ['05:00', '10:00', '14:05', '15:40', '17:40']) { const x = instant(F08, k15, h); pousser('08/10 ' + h + ' (' + x.J.cas + ')', F08, x.J, x.items, x.now); }
  const c14 = lignes.find(l => l.nom.startsWith('08/10 14:05') && l.max === 48), d15 = lignes.find(l => l.nom.startsWith('08/10 15:40') && l.max === 48);
  // Changé délibérément (revue, round 2) : « net » se décide à la clôture de 15 min, comme le nom
  // (sinon la ligne faisait des allers-retours dans une même bougie). À 14:05, le 2 avait le plus
  // petit écart à la clôture de 14:00 : cas C pour tout le quart d'heure, même si le 1 est un peu plus
  // près en ce moment. Le cas A d'un nom gardé à la clôture : test_scenarios_jour_stable.js (09/10).
  { const x14 = instant(F08, k15, '14:05');
    check(`C (14:05, le 2 au plus petit écart à la clôture de 14:00, le 1 plus près en ce moment) : « ${c14.t} »`, c14.t === 'En direct : le 2 (80 806 $) suit mieux le prix ▸' && S.nomNet(x14.J) && x14.J.ouverts[0].sc.rang === '1' && x14.J.pointe.sc.rang === '2', [c14.t, x14.J.ouverts[0].sc.rang]); }
  { const x = instant(F08, k15, '13:50'), t = S.ligneJourDebutant(F08, x.J, x.items, x.now, 48, {});
    check(`C (13:50, le 2 nommé ET au plus petit écart) : « ${t} »`, S.nomNet(x.J) && x.J.meneur && x.J.meneur.sc.rang === '2' && t === 'En direct : le 2 (80 806 $) suit mieux le prix ▸', [t, x.J.cas, S.nomNet(x.J)]); }
  // Changé délibérément (revue, round 2) : le 3 s'est fermé dans la même heure (un fait frais) ; la
  // ligne dit les deux tant qu'elle tient (à 40 caractères : « zone du 2 ✓ · scén. 3 ✗ »).
  check(`D (15:40, le 2 réalisé, le 1 ouvert, le 3 fermé depuis peu) : « ${d15.t} »`, d15.t === 'En direct : zone du 2 (80 806 $) ✓ · scén. 3 ✗ ▸', d15.t);
  // Rang 1 en chemin (le 3 du 08/10 en tête), le range en 2 : E et F « invalidé ».
  const fx = JSON.parse(JSON.stringify(X08.fichier));
  const [r0, r1, r2] = fx.scenarios; r2.rang = '1'; r0.rang = '2'; r1.rang = '3'; r1.cibles = [Math.round(r1.prix_emission * 0.96)];
  const FE = S.lire(fx, Date.parse('2026-10-08T04:30Z'));
  for (const h of ['15:40', '18:00']) { const x = instant(FE, k15, h); pousser('rang 1 chemin ' + h + ' (' + x.J.cas + ')', FE, x.J, x.items, x.now); }
  const e15 = lignes.find(l => l.nom.startsWith('rang 1 chemin 15:40') && l.max === 48);
  check(`E (rang 1 invalidé, un autre ouvert et montré) : « ${e15.t} »`, /^Scén\. 1 (✗|invalidé ✗)/.test(e15.t) && /\(en direct\)/.test(e15.t), e15);
  // Journal ❌ sur le rang 1 (I).
  const fj = JSON.parse(JSON.stringify(X08.fichier)); fj.scenarios[0].statut = '❌'; fj.scenarios[0].premier_ok = 'haut'; fj.scenarios[0].resolu_utc = '2026-10-08T12:00Z';
  const FI = S.lire(fj, Date.parse('2026-10-08T04:30Z'));
  { const x = instant(FI, k15, '14:05'); pousser('journal ❌ 14:05 (' + x.J.cas + ')', FI, x.J, x.items, x.now); }
  const i14 = lignes.filter(l => l.nom.startsWith('journal'));
  check(`I (journal ❌ sur le rang 1) : « ${i14.map(l => l.t).join(' » / « ')} »`, i14.every(l => /^Scén\. 1 .*\(journal\)/.test(l.t) && !/en direct/.test(l.t)), i14);
  for (const l of lignes) {
    const okLong = l.t.length <= l.max, mots = bannis(l.t), conseil = CONSEIL.test(l.t), pct = /%/.test(l.t);
    const marque = /\(journal\)/.test(l.t) ? !/en direct/i.test(l.t) : /\(en direct\)|^En direct : /.test(l.t);
    // Règle 3 : la ligne ne commence pas par le nom du scénario du libellé posé.
    const r3 = !l.montre || !new RegExp('^Scén(ario|\\.) ' + l.montre + '\\b').test(l.t);
    check(`${l.nom} : « ${l.t} » (${l.t.length} ≤ ${l.max}) ; ${/\(journal\)/.test(l.t) ? '« (journal) » seul' : '« (en direct) »'} ; sans mot banni, %, conseil ; ne commence pas par « Scén. ${l.montre} »`,
      okLong && marque && !mots.length && !conseil && !pct && r3, { l, mots });
  }
}

// ── 6. Textes Expert ──
titre('6. Textes Expert : une mesure, jamais un indice en liste ni « en tête »');
{
  const n = X08.k15.findIndex(k => k[0] === Date.parse('2026-10-08T14:00Z'));
  const now = Date.parse('2026-10-08T14:05Z');
  const items = F08.scenarios.map(sc => ({ sc, sv: S.etat(sc, S.plier(sc, k15.T, k15.H, k15.L, 0, n + 1, null, Q, k15.C), now) }));
  const J = S.classerJour(items, k15.C[n], F08, now, S.rejouerJour(F08, F08.scenarios, k15.T, k15.H, k15.L, k15.C, n, Q, PJ), PJ);
  const ph = S.phraseJourExpert(J), suf = J.items.map(i => S.suffixeExpert(i, J)), re = S.ligneResteExpert(J);
  // Changé délibérément (revue, round 2) : tout se lit à la dernière clôture de 15 min. À 14:05, le
  // 2 (nommé) avait le plus petit écart à 14:00 : « Plus petit écart : 2 », jamais « pour
  // l'instant » (le 1 est un peu plus près en ce moment ; revu à 14:15).
  check(`phrase, le nom a le plus petit écart à la clôture : « ${ph[0]} »`, S.nomNet(J) && ph[0] === 'Plus petit écart : 2 (clôture de 15 min ; une mesure, pas une probabilité)' && ph.includes('Écart min. : 2') && !ph.some(t => /pour l’instant/.test(t)), ph);
  // Nom gardé à la clôture (un autre avait un écart un peu plus petit, sans avance nette) : l'encadré dit les deux.
  const Jg = Object.assign({}, J, { pointe: J.items[0] }), ph2 = S.phraseJourExpert(Jg);
  check(`phrase, nom gardé sans le plus petit écart à la clôture : « ${ph2[0]} »`, !S.nomNet(Jg) && ph2[0] === 'Plus petit écart : 1 · nom gardé : 2 (avance pas assez nette à la clôture de 15 min)'
    && ph2.includes('Écart min. : 1 · nom gardé : 2') && !ph2.some(t => /Plus petit écart : 2\b|Écart min\. : 2\b/.test(t)), ph2);
  const tous = ph.concat(suf, re);
  check('encadré : aucun « écart 0,xx », aucun « en tête », aucun « % », aucun « probable »', tous.every(t => !/écart (relatif )?0,\d/.test(t) && !/en tête/.test(t) && !/%/.test(t) && !/probable/.test(t)), tous);
  // Changé délibérément (revue, round 2) : « ◂ » marque le plus petit écart de la DERNIÈRE CLÔTURE
  // (le 2 à 14:00), figé jusqu'à la suivante ; avec un nom gardé, il va au plus petit écart (le 1).
  const sufG = J.items.map(i => S.suffixeExpert(i, Jg));
  check(`suffixes en dollars, ◂ sur le plus petit écart de la clôture : « ${suf.join(' » « ')} » ; nom gardé : « ${sufG.join(' » « ')} »`, /^ · bord toléré à [\d ]+ \$$/.test(suf[0]) && /^ · zone à [\d ]+ \$ · inv\. à [\d ]+ \$ ◂$/.test(suf[1])
    && /^ · bord toléré à [\d ]+ \$ ◂$/.test(sufG[0]) && !/◂/.test(sufG[1]), [suf, sufG]);
  check(`temps restant : « ${re[0]} »`, /^Reste 14 h 15 \(fin 09\/10 04:20 UTC\) · aucune nouvelle prévision avant le prochain point$/.test(re[0]), re);
  const bulle = S.ligneJourExpert(J.items[1], J, { itv: '15 min', maintenant: now });
  check('bulle Expert : l’indice SEULEMENT avec sa formule et son nom complet', /écart relatif 0,\d\d = [\d ]+ \/ \([\d ]+ \+ [\d ]+\) \(0 = sur la zone, 1 = sur l’invalidation\)/.test(bulle) && /une mesure, pas une probabilité/.test(bulle), bulle);
  const regle = S.regleJourExpert(PJ).join(' ');
  check('règle (bulle de l’encadré) : formule, décision à la clôture de 15 min, 0,12, départ au rang 1, « trop tôt », convention, pas une probabilité',
    /d\(prochaine zone\) \/ \(d\(prochaine zone\) \+ d\(invalidation\)\)/.test(regle) && /clôture de 15 min/.test(regle) && /0,12/.test(regle) && /rang 1 du matin/.test(regle) && /plus jamais/.test(regle) && /convention/.test(regle) && /pas une probabilité/.test(regle), regle);
  const deb = [S.phraseMeneurDebutant(J), S.COMMENT_DEBUTANT, S.texteResteDebutant(J, now)].concat(J.items.map(i => S.ligneDebutantJour(i, J)), J.items.map(i => S.ligneDebutantJour(i, J, true)));
  check('bulles Débutant de la journée : aucun mot banni, aucun %, aucun conseil, jamais « probable »', deb.every(t => t && !bannis(t).length && !/%/.test(t) && !CONSEIL.test(t) && !/probable/.test(t)), deb.filter(t => !t || bannis(t).length || /%|probable/.test(t) || CONSEIL.test(t)));
  check('Débutant : « une règle de calcul, pas une prévision ni une chance de réussite » ; « décidé tous les quarts d’heure »', /pas une prévision ni une chance de réussite/.test(deb[0]) && /tous les quarts d’heure/.test(deb[0]) && /tous les quarts d’heure/.test(deb[1]), deb.slice(0, 2));
  check('Débutant (A3) : « du début de sa zone (… $, autour de … $) », jamais « de sa zone (84 500 $) »', /jusqu’au début de sa zone \([\d ]+ \$, autour de [\d ]+ \$\)/.test(S.ligneDebutantJour(J.items[1], J)), S.ligneDebutantJour(J.items[1], J));
}

// ── 7. raison(), pas() avec la clôture ──
titre('7. raison() et contacts en mèche');
{
  const F = fichier([R, U, D]);
  const [a, b, c] = F.scenarios;
  const e = S.suiviVide(Q);
  S.pas(b, e, 0, T0, 100500, 96500, 99000);             // invalidation touchée en mèche (clôture hors de la zone 96 030 – 97 970)
  const svI = S.etat(b, e, T0 + Q);
  check('pas() avec la clôture : invalidation touchée en mèche notée', svI.cle === 'invalide' && svI.mecheInv === true, svI);
  const e2 = S.suiviVide(Q); S.pas(b, e2, 0, T0, 100500, 96500);
  const sv2 = S.etat(b, e2, T0 + Q), sv1 = Object.assign({}, svI, { mecheInv: false, meche: [] });
  check('pas() sans clôture : l’ancien comportement exact (aucune mèche affirmée)', JSON.stringify(Object.assign({}, sv2, { meche: [] })) === JSON.stringify(sv1) && sv2.mecheInv === false);
  const rx = S.raison(b, svI, 'expert'), rd = S.raison(b, svI, 'debutant');
  check(`chemin, Expert : « ${rx} »`, /^zone 97 000 touchée avant 103 000 \(en mèche : contact, règle du journal\)$/.test(rx), rx);
  // Changé délibérément (revue) : un contact seulement en mèche est qualifié aussi pour une invalidation et une sortie.
  check(`chemin, Débutant : « ${rd} »`, /^le prix a touché la zone de 97 000 \$ \(à partir de 97 970 \$\) avant de toucher la zone de 103 000 \$, par un passage bref du prix : le journal compte ce passage/.test(rd), rd);
  const er = S.suiviVide(Q); S.pas(a, er, 0, T0, 102100, 100000, 101000);
  const svR = S.etat(a, er, T0 + Q);
  const rrx = S.raison(a, svR, 'expert'), rrd = S.raison(a, svR, 'debutant');
  check(`range : « ${rrx} » / « ${rrd} »`, /^borne haute 102 010 dépassée \(en mèche/.test(rrx) && /^le prix est passé au-dessus de 102 010 \$ \(101 000 \$ plus la marge\), par un passage bref du prix/.test(rrd), [rrx, rrd]);
  const ea = S.suiviVide(Q); S.pas(b, ea, 0, T0, 103500, 96500, 100000);
  const svA = S.etat(b, ea, T0 + Q), rax = S.raison(b, svA, 'expert'), rad = S.raison(b, svA, 'debutant');
  check(`ambigu : « ${rax} » / « ${rad} »`, svA.cle === 'ambigu' && /ordre inconnu/.test(rax) && /^non tranché : .* le même quart d’heure, et l’ordre est inconnu ; le journal tranchera avec les minutes$/.test(rad), [svA.cle, rax, rad]);
  const ec = S.suiviVide(Q); S.pas(b, ec, 0, T0, 103000, 100000, 101000);
  const svC = S.etat(b, ec, T0 + Q), rcd = S.raison(b, svC, 'debutant');
  check(`réalisé en passage bref, Débutant : « ${rcd} »`, svC.cle === 'realise' && svC.meche[0] === true && /passage bref du prix : le journal compte ce passage, alors que pour les figures, la page attend que le prix s’y maintienne/.test(rcd), [svC.meche, rcd]);
  const tousD = [rd, rrd, rad, rcd];
  check('Débutant : ni « mèche », ni « bougie », ni « UTC », ni « range », ni « clôture »', tousD.every(t => !/mèche|bougie|UTC|range|clôtur/i.test(t) && !bannis(t).length), tousD);
}

// ── 8. Coût ──
titre('8. Coût');
{
  // 3000 bougies de 1 min : les 1430 du 08/10, précédées de 1570 minutes synthétiques avant le point.
  const avant = [], t0 = X08.k1[0][0];
  for (let i = 1570; i > 0; i--) { const p = X08.k1[0][1] + Math.sin(i / 9) * 80; avant.push([t0 - i * 60000, p, p + 20, p - 20, p]); }
  const K = col(avant.concat(X08.k1)), n = K.T.length;
  const mes = f => { const ts = []; for (let r = 0; r < 25; r++) { const a = process.hrtime.bigint(); f(); ts.push(Number(process.hrtime.bigint() - a) / 1e6); } ts.sort((x, y) => x - y); return ts[12]; };
  const tRejeu = mes(() => S.rejouerJour(F08, F08.scenarios, K.T, K.H, K.L, K.C, n - 1, 60000, PJ));
  check(`rejouerJour sur ${n} bougies de 1 min : ${tRejeu.toFixed(2)} ms (médiane, ≤ 5 ms)`, n === 3000 && tRejeu <= 5, tRejeu);
  const rj1 = S.rejouerJour(F08, F08.scenarios, K.T, K.H, K.L, K.C, n - 1, 60000, PJ);
  const plis = F08.scenarios.map(sc => S.plier(sc, K.T, K.H, K.L, 0, n - 1, null, 60000, K.C));
  const now = X08.k1[X08.k1.length - 1][0] + 30000;
  const tCl = mes(() => { for (let r = 0; r < 100; r++) { const items = F08.scenarios.map((sc, j) => ({ sc, sv: S.etat(sc, S.pas(sc, S.copie(plis[j]), n - 1, K.T[n - 1] * 1000, K.H[n - 1], K.L[n - 1], K.C[n - 1]), now) })); S.classerJour(items, K.C[n - 1], F08, now, rj1, PJ); } }) / 100 * 1000;
  check(`bougie en cours + classerJour : ${tCl.toFixed(1)} µs (médiane, ≤ 50 µs)`, tCl <= 50, tCl);
}

console.log(ko ? `\n❌ SCÉNARIOS, LA JOURNÉE : ${ko} contrôle(s) en échec` : '\n✅ SCÉNARIOS, LA JOURNÉE : TOUS LES CONTRÔLES PASSENT');
process.exit(ko ? 1 : 0);
