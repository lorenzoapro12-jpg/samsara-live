// La JOURNÉE des scénarios du matin, round 2 de la revue (js/scenarios.js, section 5), hors navigateur,
// sur le 09/10/2026 RÉEL (vrai previsions.json, bougies BTCUSDT 15 min et 1 min) puis sa suite
// SYNTHÉTIQUE marquée (tests/scenarios-jour-0910.js) :
//
//   1. stabilité : minute par minute (bougie 15 min en cours faite des minutes), la ligne Débutant
//      (48 et 40 caractères), la phrase de l'encadré Expert, « ◂ » et l'état du nom (plus petit
//      écart / nom gardé / nom repris) ne changent dans une bougie que si un FAIT change (un contact,
//      une fermeture, la fin du « frais » d'un fait) — jamais par un aller-retour d'écart ;
//   2. nom gardé à la clôture (16:05) : ligne cas A ; « Plus petit écart : 1 · nom gardé : 3 » ; « ◂ »
//      sur le 1 ; bulles Débutant et Expert qui disent les deux, au dernier quart d'heure décidé ;
//   3. fait frais (19:08, synthétique : la zone du 3 et l'invalidation du 2 touchées dans la même
//      bougie) : la ligne dit les deux ; plus « frais » après fonduMinutes ;
//   4. contact en mèche : toute bulle Débutant qui dit la réalisation dit « zone » et « passage
//      bref » ; jamais « vers 84 500 $ — réalisé ✓ » ; la raison courte d'une invalidation ;
//   5. après minuit (heure de Paris) : « hier » devant les créneaux de la veille ;
//   6. mots : « Trop tôt pour dire quel scénario suit le mieux le prix » ; Expert : pas de redite de
//      la touche d'un chemin réalisé ; « sorti par le haut » comme état ; « ◂ » expliqué.
// USAGE   node tests/test_scenarios_jour_stable.js
const S = require('../js/scenarios.js');
const Guide = require('../js/guide.js');
const { reel, synth } = require('./scenarios-jour-0910');
let ko = 0;
const check = (nom, ok, det) => { if (!ok) ko++; console.log(`  ${ok ? '✓' : '✗'} ${nom}${!ok && det !== undefined ? ' — ' + JSON.stringify(det).slice(0, 700) : ''}`); };
const titre = t => console.log(`\n── ${t} ──`);
const PJ = { ecartChangement: 0.12, departageMinutes: 60, departageMouvementPct: 0.5, horsMarges: 1, fonduMinutes: 60, colle: 0.5, quartMs: 900000 };
const Q = 9e5;
const hm = t => new Date(t).toISOString().slice(11, 16);
const CONSEIL = /achet|vend|\bentrez\b|\bsortez\b|prenez position|signal d.(achat|vente)|recommand|il faut/i;

/** La journée à l'instant `now` (ms) : bougies 15 min closes, la bougie en cours faite des minutes
 *  déjà closes ; rejeu mémorisé par nombre de bougies closes. */
function journee(X, memo) {
  const idx = new Map(X.k15.map((k, i) => [k[0], i]));
  const T = X.k15.map(k => k[0] / 1000), H = X.k15.map(k => k[2]), L = X.k15.map(k => k[3]), C = X.k15.map(k => k[4]);
  return now => {
    const q = Math.floor(now / Q) * Q, nC = idx.get(q);
    if (nC === undefined) return null;
    let h = -Infinity, l = Infinity, c = null;
    for (const k of X.k1) { if (k[0] < q || k[0] >= now) continue; h = Math.max(h, k[2]); l = Math.min(l, k[3]); c = k[4]; }
    if (c === null) { h = X.k15[nC][1]; l = h; c = h; }
    const F = S.lire(X.fichier, now);
    if (!memo.has(nC)) memo.set(nC, S.rejouerJour(F, F.scenarios, T, H, L, C, nC, Q, PJ));
    const items = F.scenarios.map(sc => { const e = S.plier(sc, T, H, L, 0, nC, null, Q, C); if (S.compte(sc, q, Q)) S.pas(sc, e, nC, q, h, l, c); return { sc, sv: S.etat(sc, e, now) }; });
    const J = S.classerJour(items, c, F, now, memo.get(nC), PJ);
    return { F, J, items, now, q };
  };
}
const etatNom = J => (!J.meneur ? '-' : S.nomNet(J) ? 'net' : J.remplace ? 'repris' : 'garde');
/** Les faits : ce que la bougie en cours peut changer légitimement (contacts, fermetures, « frais »). */
const faits = J => J.items.map(i => [i.sc.rang, i.ouvert ? 'o' : 'f', i.ferme ? i.ferme.type : '', i.sv ? i.sv.cle + (i.sv.k || 0) : '', i.frais ? '*' : ''].join(':')).join('|') + '#' + J.cas;

titre('1. Stabilité dans une bougie : seuls les faits changent la ligne, la phrase, « ◂ », l’état du nom');
{
  const at = journee(reel, new Map());
  const t0 = Date.parse('2026-10-09T04:31Z'), t1 = Date.parse('2026-10-09T18:52Z');
  const vus = { ligne48: [], ligne40: [], phrase: [], pointe: [], nom: [] };
  let prec = null, n = 0, chg = 0, fautes = [];
  for (let now = t0; now <= t1; now += 60000) {
    const x = at(now);
    if (!x) continue;
    n++;
    const J = x.J;
    const v = { ligne48: S.ligneJourDebutant(x.F, J, x.items, now, 48, {}), ligne40: S.ligneJourDebutant(x.F, J, x.items, now, 40, {}), phrase: S.phraseJourExpert(J).join('|'),
      pointe: J.items.filter(i => S.pointe(i, J)).map(i => i.sc.rang).join(','), nom: etatNom(J) + (J.meneur ? J.meneur.sc.rang : ''), q: x.q, f: faits(J) };
    if (prec && prec.q === v.q) {
      for (const k of Object.keys(vus)) if (v[k] !== prec[k]) { chg++; if (v.f === prec.f) fautes.push([hm(now), k, prec[k], v[k]]); }
    }
    prec = v;
  }
  check(`09/10 réel, ${n} minutes : aucun changement dans une bougie sans fait nouveau (${chg} changement(s) dans une bougie, tous dus à un fait)`, n > 800 && !fautes.length, fautes.slice(0, 6));
  // Les mêmes textes, sur la suite synthétique (contacts dans la bougie en cours).
  const as = journee(synth, new Map());
  let ps = null; const fs2 = [];
  for (let now = Date.parse('2026-10-09T18:46Z'); now <= Date.parse('2026-10-09T22:30Z'); now += 60000) {
    const x = as(now); if (!x) continue;
    const v = { l: S.ligneJourDebutant(x.F, x.J, x.items, now, 48, {}), p: S.phraseJourExpert(x.J).join('|'), q: x.q, f: faits(x.J) };
    if (ps && ps.q === v.q && v.f === ps.f && (v.l !== ps.l || v.p !== ps.p)) fs2.push([hm(now), ps.l, v.l]);
    ps = v;
  }
  check('09/10 synthétique (19:00–22:30) : de même', !fs2.length, fs2.slice(0, 4));
}

titre('2. Nom gardé à la clôture de 16:00 (09/10 réel, 16:05)');
{
  const x = journee(reel, new Map())(Date.parse('2026-10-09T16:05Z')), J = x.J;
  const un = J.items.find(i => i.sc.rang === '1'), trois = J.items.find(i => i.sc.rang === '3');
  check(`le 3 nommé, le 1 au plus petit écart à 16:00 (avance < 0,12) : nom gardé`, J.cas === 'meneur' && J.meneur === trois && J.pointe === un && !S.nomNet(J), [J.cas, J.meneur && J.meneur.sc.rang, J.pointe && J.pointe.sc.rang]);
  const L = S.ligneJourDebutant(x.F, J, x.items, x.now, 48, {});
  check(`ligne Débutant : cas A « ${L} » (le nom gardé est dans les bulles)`, L === 'Scénario du matin : en cours (en direct) ▸', L);
  const ph = S.phraseJourExpert(J);
  check(`encadré Expert : « ${ph[0]} »`, ph[0] === 'Plus petit écart : 1 · nom gardé : 3 (avance pas assez nette à la clôture de 15 min)' && !ph.some(t => /pour l’instant/.test(t)), ph);
  check('« ◂ » sur le 1 (plus petit écart de la clôture), pas sur le 3', / ◂$/.test(S.suffixeExpert(un, J)) && !/◂/.test(S.suffixeExpert(trois, J)));
  const b3 = S.ligneJourExpert(trois, J, { itv: '15 min', maintenant: x.now }), b1 = S.ligneJourExpert(un, J, { itv: '15 min', maintenant: x.now });
  check('bulle Expert du 3 : « nom gardé (avance pas assez nette …) ; plus petit écart à cette clôture : 1 »', /nom gardé \(avance pas assez nette à la dernière clôture de 15 min\) ; plus petit écart à cette clôture : 1/.test(b3), b3);
  check('bulle Expert du 1 : « plus petit écart à la dernière clôture de 15 min ; le nom reste au 3 »', /plus petit écart à la dernière clôture de 15 min ; le nom reste au 3/.test(b1), b1);
  const d = S.phraseMeneurDebutant(J), dc = S.phraseNomDebutant(J, null, true);
  check(`bulle Débutant : « ${d.slice(0, 150)}… »`, /^Le nom reste au scénario 3 : au dernier quart d’heure décidé, le prix était un peu plus près de ce que décrit le scénario 1/.test(d) && !/depuis/.test(d), d);
  check(`bulle courte : « ${dc} »`, /le 1 était un peu plus près/.test(dc), dc);
}

titre('3. Fait frais : la ligne le dit, et le garde une heure (suite synthétique, modèle)');
{
  const at = journee(synth, new Map());
  const x = at(Date.parse('2026-10-09T19:08Z')), J = x.J;
  const L48 = S.ligneJourDebutant(x.F, J, x.items, x.now, 48, {}), L40 = S.ligneJourDebutant(x.F, J, x.items, x.now, 40, {});
  check(`19:08 : le 3 réalisé et le 2 invalidé (même bougie), frais ; ligne « ${L48} » / « ${L40} »`, J.frais.map(i => i.sc.rang).join() === '2,3'
    && L48 === 'En direct : zone du 3 (84 500 $) ✓ · scén. 2 ✗ ▸' && L40 === 'En direct : zone du 3 ✓ · scén. 2 ✗ ▸', [J.frais.map(i => i.sc.rang), L48, L40]);
  const y = at(Date.parse('2026-10-09T20:20Z'));
  check('20:20 (plus d’une heure après la fin de la bougie de 19:00) : le 2 et le 3 ne sont plus frais', !y.J.frais.some(i => i.sc.rang !== '1'), y.J.frais.map(i => i.sc.rang));
  // Le 2 seul fermé depuis peu, le 1 ouvert et rien de réalisé (le 3 rendu neutre) : « Scén. 2 … ✗ ».
  const z = at(Date.parse('2026-10-09T19:30Z'));
  const items = z.items.map(i => (i.sc.rang === '3' ? { sc: i.sc, sv: Object.assign({}, i.sv, { cle: 'rien', k: 0, t: null }) } : i));
  const Jz = S.classerJour(items, z.J.prix, z.F, z.now, { grille: true, sortiTot: true, prec: z.F.scenarios[0].id, cas: 'meneur', ordre: [] }, PJ);
  const Lz = S.ligneJourDebutant(z.F, Jz, items, z.now, 48, {});
  check(`le 2 seul fermé depuis peu : « ${Lz} »`, /^Scén\. 2 invalidé ✗ (vers 21h00 )?\(en direct\) ▸$/.test(Lz), Lz);
  const tous = [L48, L40, Lz];
  check('lignes : sans mot banni, sans %, sans conseil', tous.every(t => !Guide.motsBannis(t).length && !/%/.test(t) && !CONSEIL.test(t)), tous);
}

titre('4. Contact en mèche : les bulles Débutant disent « zone » et « passage bref »');
{
  const at = journee(synth, new Map());
  for (const q of ['2026-10-09T19:16Z', '2026-10-09T20:06Z', '2026-10-09T21:30Z']) {
    const x = at(Date.parse(q)), J = x.J, trois = J.items.find(i => i.sc.rang === '3'), deux = J.items.find(i => i.sc.rang === '2');
    const textes = [S.ligneDebutantJour(trois, J), S.ligneDebutantJour(trois, J, true), S.ligneCourteDebutant(trois.sc, trois.sv, x.now)];
    check(`${hm(x.now)} : le 3, réalisé en mèche : « ${textes[1]} »`, trois.ferme && trois.ferme.meche && textes.every(t => /zone/.test(t) && /passage bref/.test(t)) && textes.every(t => !/vers 84 500 \$ — réalisé/.test(t)), textes);
    const c2 = S.ligneDebutantJour(deux, J, true);
    check(`${hm(x.now)} : le 2, raison courte : « ${c2} »`, /invalidé ✗ .*: zone de 84 500 \$ touchée \(dès 83 655 \$\), par un passage bref du prix/.test(c2), c2);
    check(`${hm(x.now)} : sans mot banni`, textes.concat([c2]).every(t => !Guide.motsBannis(t).length));
  }
}

titre('5. Après minuit (heure de Paris) : « hier » devant les créneaux de la veille');
{
  const x = journee(synth, new Map())(Date.parse('2026-10-10T03:35Z')), J = x.J;
  const c = J.items.map(i => S.ligneDebutantJour(i, J, true)), l = J.items.map(i => S.ligneDebutantJour(i, J));
  check(`03:35 UTC le 10/10 : « ${c[0]} »`, c.concat(l).every(t => !/entre \d\dh\d\d/.test(t) || /hier entre \d\dh\d\d et \d\dh\d\d/.test(t)) && c.some(t => /hier entre/.test(t)), c);
  const lib = J.items.filter(i => i.ferme && i.ferme.type !== 'realise').map(i => S.libellesJourDebutant(i, 32, null, x.now)[0]);
  check(`libellés : « ${lib.join(' » « ')} »`, lib.length && lib.every(t => /hier \d\dh\d\d/.test(t) && t.length <= 32), lib);
  const y = journee(synth, new Map())(Date.parse('2026-10-09T21:30Z'));
  check('le même jour : pas de « hier »', y.J.items.every(i => !/hier/.test(S.ligneDebutantJour(i, y.J, true))));
}

titre('6. Mots');
{
  const x = journee(reel, new Map())(Date.parse('2026-10-09T05:10Z'));
  const t = S.phraseMeneurDebutant(x.J);
  check(`05:10, « trop tôt » : « ${t} »`, x.J.cas === 'tot' && /^Trop tôt pour dire quel scénario suit le mieux le prix : /.test(t), t);
  const y = journee(synth, new Map())(Date.parse('2026-10-09T20:30Z')), trois = y.J.items.find(i => i.sc.rang === '3'), un = y.J.items.find(i => i.sc.rang === '1');
  const b3 = S.ligneJourExpert(trois, y.J, { itv: '15 min', maintenant: y.now });
  check(`Expert, le 3 réalisé : la touche dite une fois (« ${b3} »)`, /cible touchée en mèche/.test(b3) && !/zone 84 500 touchée/.test(b3), b3);
  const et = S.texteEtat(un.sc, un.sv, null, 'expert', { itv: '15 min', maintenant: y.now });
  check(`Expert, état court du 1 sorti : « ${et.court} »`, /^sorti par le haut \d\d:\d\d–\d\d:\d\d UTC$/.test(et.court), et.court);
  const regle = S.regleJourExpert(PJ).join(' ');
  check('règle Expert : « ◂ » expliqué (plus petit écart à la dernière clôture)', /« ◂ » : le plus petit écart à la dernière clôture/.test(regle), regle.slice(0, 300));
}

console.log(ko ? `\n❌ SCÉNARIOS, JOURNÉE STABLE (REVUE 2) : ${ko} contrôle(s) en échec` : '\n✅ SCÉNARIOS, JOURNÉE STABLE (REVUE 2) : TOUS LES CONTRÔLES PASSENT');
process.exit(ko ? 1 : 0);
