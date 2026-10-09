// La JOURNÉE des scénarios du matin, suite de la revue (js/scenarios.js, section 5), hors navigateur :
//
//   1. bougies qui ne suivent pas (4 h, 1 jour : « large » ; historique trop court : « incomplet »)
//      avec trois scénarios en cours → cas « nonSuivi », jamais « aucun » ; montré = le rang 1 ;
//      aucune phrase « Aucun scénario … » ni « ne tient plus » ;
//   2. la bougie en cours ferme le scénario nommé : le remplaçant est choisi UNE fois (ordre de la
//      dernière clôture), il ne change pas d'un tick à l'autre quand la clôture oscille ;
//   3. « fini » : « noté par le journal » / « le journal les a notés » quand les statuts sont là ;
//   4. honnêteté du nom : sur toutes les minutes du 08/10, la ligne Débutant ne dit « le N suit
//      mieux » que si N a le plus petit écart EN CE MOMENT ; la bulle Expert ne dit « plus petit
//      écart pour l'instant » que pour lui (14:05 et 14:10 compris) ;
//   5. les coches : la chaîne stricte avant l'invalidation, aucune après (06/10, le 2 invalidé à
//      13:30 puis touché le 07/10), aucune sur une note ❌ du journal ;
//   6. une note ❌ du journal sans heure de résolution ne s'efface pas d'un coup ;
//   7. libellés Débutant d'un état : toujours « (en direct) » ou « (journal) », ≤ 32 caractères ;
//      un range dont le prix est dans la marge : « tient jusqu’à … $ » ; la ligne ne montre jamais
//      ⚠ comme ✗, et une réalisation notée par le journal porte « (journal) » ;
//   8. bulles : l'heure d'une fermeture (heure de Paris) ; « seul » sur un range dit sa limite ;
//      version courte : le niveau de chaque scénario.
// USAGE   node tests/test_scenarios_jour_suivi.js
const fs = require('fs'), path = require('path');
const S = require('../js/scenarios.js');
const Guide = require('../js/guide.js');
const FX = path.join(__dirname, 'fixtures');
let ko = 0;
const check = (nom, ok, det) => { if (!ok) ko++; console.log(`  ${ok ? '✓' : '✗'} ${nom}${!ok && det !== undefined ? ' — ' + JSON.stringify(det).slice(0, 600) : ''}`); };
const titre = t => console.log(`\n── ${t} ──`);
const PJ = { ecartChangement: 0.12, departageMinutes: 60, departageMouvementPct: 0.5, horsMarges: 1, fonduMinutes: 60, colle: 0.5, quartMs: 900000 };
const Q = 900000;
const proche = (a, b, e) => Math.abs(a - b) <= e;
const hm = t => new Date(t).toISOString().slice(11, 16);
const col = K => ({ T: K.map(k => k[0] / 1000), H: K.map(k => k[2]), L: K.map(k => k[3]), C: K.map(k => k[4]) });
const X08 = JSON.parse(fs.readFileSync(path.join(FX, 'rejeu-jour-0810.json'), 'utf8'));
const F08 = S.lire(X08.fichier, Date.parse('2026-10-08T04:30Z'));
const k15 = col(X08.k15);
/** La journée à l'instant hhmm du 08/10 sur les bougies 15 min (bougie en cours comprise). */
function instant(F, K, quand, modif) {
  const now = Date.parse(quand), n = K.T.findIndex(x => x * 1000 + Q > now);
  const items = F.scenarios.map(sc => ({ sc: modif ? modif(sc) : sc, sv: S.etat(sc, S.plier(sc, K.T, K.H, K.L, 0, n + 1, null, Q, K.C), now) }));
  return { items, now, J: S.classerJour(items, K.C[n], F, now, S.rejouerJour(F, F.scenarios, K.T, K.H, K.L, K.C, n, Q, PJ), PJ) };
}
const iso = ms => new Date(ms).toISOString().slice(0, 16) + 'Z';
const T0 = Date.parse('2026-10-08T04:30Z');
function fichier(scs, opts = {}) {
  const P0 = 100000, fin = iso(T0 + 86400e3 - 600e3);
  return S.lire(Object.assign({ format: 'previsions-1', groupe: '2026-10-08', emis_utc: iso(T0), prix_emission: P0, marge_pct: 1,
    scenarios: scs.map((x, i) => Object.assign({ id: 'X' + (i + 1), rang: String(i + 1), groupe: '2026-10-08', emis_utc: iso(T0), fin_utc: fin, prix_emission: P0, marge_pct: 1, statut: '⏳' }, x)) }, opts), T0);
}
const R = { forme: 'range', range: [99000, 101000] }, U = { forme: 'chemin', cibles: [103000], invalidation: 97000 }, D = { forme: 'chemin', cibles: [97000], invalidation: 103000 };
const sv = (cle, k, x) => Object.assign({ cle, k: k || 0, n: 10, fini: false, pas: Q, touchees: [], temps: [], meche: [] }, x || {});
const it = (sc, s) => ({ sc, sv: s });

titre('1. 4 h, 1 jour, historique incomplet : « nonSuivi », jamais « aucun »');
{
  const now = Date.parse('2026-10-08T13:00Z');
  for (const [nom, mk] of [['4 h (large)', sc => S.etatLarge(sc, 4 * 3600e3, now)], ['1 jour (large)', sc => S.etatLarge(sc, 86400e3, now)], ['1 min (incomplet)', sc => S.etatIncomplet(sc, 60e3, now, now - 3000 * 60e3)]]) {
    const items = F08.scenarios.map(sc => ({ sc, sv: mk(sc) }));
    const J = S.classerJour(items, 82000, F08, now, { grille: false }, PJ);
    const textes = [].concat(S.phraseJourExpert(J), [S.phraseMeneurDebutant(J) || '', S.ligneJourDebutant(F08, J, items, now, 48, {}), S.ligneJourDebutant(F08, J, items, now, 40, {})]);
    check(`${nom} : cas « nonSuivi », montré = le rang 1, aucun nom`, J.cas === 'nonSuivi' && J.montre && J.montre.sc.rang === '1' && !J.meneur, [J.cas, J.montre && J.montre.sc.rang]);
    check(`${nom} : ni « Aucun scénario », ni « ne tient plus », ni phrase Expert de la journée`, !textes.some(t => /Aucun scénario|ne tient plus|aucun ne tient/i.test(t)) && !S.phraseJourExpert(J).length && !S.phraseMeneurDebutant(J), textes);
    check(`${nom} : la ligne Débutant reste celle d'avant le suivi (« … à voir en 15 min ou 1 h » ou « données manquantes »)`, /à voir en 15 min ou 1 h|données manquantes/.test(textes[textes.length - 2]), textes.slice(-2));
    const lib = S.libellesJourDebutant(J.montre, 32, null);
    check(`${nom} : un libellé Débutant pour le rang 1 (« ${lib[0]} »)`, /^Scén(ario|\.) 1\b/.test(lib[0]) && !/✗|✓/.test(lib[0]), lib);
  }
  // Un scénario déjà noté ❌ par le journal, les deux autres non suivis : toujours « nonSuivi ».
  const fj = JSON.parse(JSON.stringify(X08.fichier)); fj.scenarios[0].statut = '❌'; fj.scenarios[0].resolu_utc = '2026-10-08T12:00Z';
  const Fj = S.lire(fj, T0), now2 = Date.parse('2026-10-08T13:00Z');
  const J2 = S.classerJour(Fj.scenarios.map(sc => ({ sc, sv: S.etatLarge(sc, 4 * 3600e3, now2) })), 82000, Fj, now2, { grille: false }, PJ);
  check('rang 1 noté ❌, les autres non suivis : « nonSuivi », montré = le 2', J2.cas === 'nonSuivi' && J2.montre && J2.montre.sc.rang === '2', [J2.cas, J2.montre && J2.montre.sc.rang]);
}

titre('2. La bougie en cours ferme le nommé : un remplaçant, figé jusqu’à la clôture suivante');
{
  const F = fichier([R, U, D]);
  const [a, b, c] = F.scenarios;
  // La dernière clôture : 100 020 → le range au milieu (nommé), puis U et D presque à égalité.
  const mem = { prec: a.id, sortiTot: true };
  const d = S.decider([it(a, sv('dedans')), it(b, sv('rien')), it(c, sv('rien'))], 100020, F, T0 + 5 * 3600e3, mem, PJ);
  const rj = { grille: true, sortiTot: true, prec: mem.prec, cas: d.cas, ordre: d.ordre, tDecision: T0 + 5 * 3600e3 };
  check('decider rend l’ordre de la clôture (plus petit écart d’abord)', Array.isArray(d.ordre) && d.ordre[0] === a.id && d.ordre.length === 3, d);
  const noms = [], lignes = [], exp = [];
  for (const p of [100000, 99900, 100050, 99950, 100120, 99880]) {
    const items = [it(a, sv('sortie', 0, { t: T0 + 5 * 3600e3, sortie: { haut: true } })), it(b, sv('rien')), it(c, sv('rien'))];
    const J = S.classerJour(items, p, F, T0 + 5 * 3600e3 + 5 * 60e3, rj, PJ);
    noms.push(J.meneur ? J.meneur.sc.rang : null);
    lignes.push(S.ligneJourDebutant(F, J, items, T0 + 5 * 3600e3 + 5 * 60e3, 48, {}));
    exp.push(S.phraseJourExpert(J)[0]);
    if (p === 100000) check('remplace : marqué, et la phrase Débutant le dit (« nommé à la place … »)', J.remplace && /à la place du scénario qui vient de se fermer|vient de se fermer/.test(S.phraseMeneurDebutant(J)), S.phraseMeneurDebutant(J));
  }
  check(`le nom ne change pas d’un tick à l’autre (${noms.join(' ')})`, noms.every(n => n && n === noms[0]), noms);
  check('la ligne Débutant ne change pas de nom d’un tick à l’autre', new Set(lignes.map(t => (t.match(/le (\d)/) || [])[1] || '-')).size === 1, lignes);
  check('l’encadré Expert garde le même nom repris', new Set(exp.map(t => (t.match(/nom repris : (\d)|écart pour l’instant : (\d) \(/) || []).slice(1).join(''))).size <= 2 && exp.every(t => !/Plus petit écart pour l’instant : (\d) \(/.test(t) || t.includes(': ' + noms[0] + ' (')), exp);
  // Sans ordre (rejeu ancien) : le plus petit rang encore ouvert, déterministe.
  const J0 = S.classerJour([it(a, sv('sortie', 0, { t: T0, sortie: { haut: true } })), it(b, sv('rien')), it(c, sv('rien'))], 99800, F, T0 + 5 * 3600e3, { grille: true, sortiTot: true, prec: a.id, cas: 'meneur' }, PJ);
  check('sans ordre mémorisé : le plus petit rang encore ouvert (le 2)', J0.meneur && J0.meneur.sc.rang === '2' && J0.remplace, [J0.meneur && J0.meneur.sc.rang]);
}

titre('3. « fini » : le journal a-t-il déjà noté ?');
{
  const fj = JSON.parse(JSON.stringify(X08.fichier));
  fj.scenarios.forEach((x, i) => { x.statut = ['✅', '✅', '❌'][i]; });
  const Fn = S.lire(fj, T0), now = Date.parse('2026-10-09T04:40Z');
  const J = S.classerJour(Fn.scenarios.map(sc => ({ sc, sv: S.etat(sc, S.suiviVide(Q), now) })), 82000, Fn, now, null, PJ);
  check(`statuts notés : Expert « ${S.phraseJourExpert(J)[0]} »`, J.cas === 'fini' && /^Terminé à \d\d:\d\d UTC · noté par le journal$/.test(S.phraseJourExpert(J)[0]), S.phraseJourExpert(J));
  check(`statuts notés : Débutant « ${S.texteResteDebutant(J, now)} »`, /le journal les a notés\.$/.test(S.texteResteDebutant(J, now)) && !/suivra/.test(S.texteResteDebutant(J, now)), S.texteResteDebutant(J, now));
  const J2 = S.classerJour(F08.scenarios.map(sc => ({ sc, sv: S.etat(sc, S.suiviVide(Q), now) })), 82000, F08, now, null, PJ);
  check('statuts encore ⏳ : « note du journal à venir » / « la note du journal suivra »', /note du journal à venir$/.test(S.phraseJourExpert(J2)[0]) && /la note du journal suivra\.$/.test(S.texteResteDebutant(J2, now)), [S.phraseJourExpert(J2), S.texteResteDebutant(J2, now)]);
}

titre('4. Honnêteté du nom, sur toutes les minutes du 08/10 (bougie 15 min en cours faite des minutes)');
{
  const scs = F08.scenarios, idx15 = new Map(X08.k15.map((k, i) => [k[0], i])), memo = new Map();
  const faux = [], fauxE = [];
  let gardes = 0, n = 0;
  for (let m = 0; m < X08.k1.length; m++) {
    const t = X08.k1[m][0], q = Math.floor(t / Q) * Q, nClos = idx15.get(q);
    if (nClos === undefined) continue;
    let h = -Infinity, l = Infinity, c = null;
    for (let j = m; j >= 0 && X08.k1[j][0] >= q; j--) { h = Math.max(h, X08.k1[j][2]); l = Math.min(l, X08.k1[j][3]); if (c === null) c = X08.k1[j][4]; }
    if (!memo.has(nClos)) memo.set(nClos, S.rejouerJour(F08, scs, k15.T, k15.H, k15.L, k15.C, nClos, Q, PJ));
    const now = t + 60000;
    const items = scs.map(sc => { const e = S.plier(sc, k15.T, k15.H, k15.L, 0, nClos, null, Q, k15.C); if (S.compte(sc, q, Q)) S.pas(sc, e, nClos, q, h, l, c); return { sc, sv: S.etat(sc, e, now) }; });
    const J = S.classerJour(items, c, F08, now, memo.get(nClos), PJ);
    n++;
    if (J.meneur && !S.nomNet(J)) gardes++;
    const premier = J.ouverts.length ? J.ouverts[0].sc.rang : null;
    for (const max of [48, 40]) {
      const L = S.ligneJourDebutant(F08, J, items, now, max, {}), mm = L.match(/le (\d)\b[^·]*suit mieux/);
      if (mm && mm[1] !== premier) faux.push([hm(t), max, L, 'plus petit écart : ' + premier]);
    }
    for (const x of J.items) {
      const b = S.ligneJourExpert(x, J, { itv: '15 min', maintenant: now }) || '';
      if (/plus petit écart pour l’instant/.test(b) && x.sc.rang !== premier) fauxE.push([hm(t), x.sc.rang, premier]);
    }
  }
  check(`ligne Débutant : « le N suit mieux » seulement pour le plus petit écart du moment (${n} minutes, dont ${gardes} à nom gardé)`, !faux.length && gardes > 0, faux.slice(0, 5));
  check('bulle Expert : « plus petit écart pour l’instant » seulement pour le plus petit écart du moment', !fauxE.length, fauxE.slice(0, 5));
  for (const hh of ['14:05', '14:10']) {
    const x = instant(F08, k15, '2026-10-08T' + hh + 'Z'), J = x.J, m = J.meneur, p0 = J.ouverts[0];
    const L48 = S.ligneJourDebutant(F08, J, x.items, x.now, 48, {}), bm = S.ligneJourExpert(m, J, { itv: '15 min', maintenant: x.now }), b0 = S.ligneJourExpert(p0, J, { itv: '15 min', maintenant: x.now });
    check(`${hh} : nom gardé (${m && m.sc.rang}) sans le plus petit écart (${p0.sc.rang}) → ligne cas A « ${L48} »`, m && m !== p0 && !S.nomNet(J) && L48 === 'Scénario du matin : en cours (en direct) ▸', [L48, m && m.sc.rang, p0.sc.rang]);
    check(`${hh} : bulle Expert du nom gardé : « nom gardé … ; plus petit écart en ce moment : ${p0.sc.rang} », jamais « plus petit écart pour l’instant »`, /nom gardé \(revu à chaque clôture de 15 min, écart net exigé\) ; plus petit écart en ce moment : \d/.test(bm) && !/plus petit écart pour l’instant/.test(bm), bm);
    check(`${hh} : bulle Expert du ${p0.sc.rang} : « plus petit écart en ce moment »`, /plus petit écart en ce moment ; le nom reste au \d/.test(b0), b0);
    check(`${hh} : « ◂ » sur le ${p0.sc.rang} (plus petit écart), pas sur le nom gardé`, S.pointe(p0, J) && !S.pointe(m, J) && / ◂$/.test(S.suffixeExpert(p0, J)) && !/◂/.test(S.suffixeExpert(m, J)));
  }
}

titre('5. Les coches : chaîne stricte, avant l’invalidation');
{
  const X06 = JSON.parse(fs.readFileSync(path.join(FX, 'rejeu-jour-0610.json'), 'utf8'));
  const F06 = S.lire(X06.fichier, Date.parse('2026-10-06T04:30Z')), k = col(X06.k15);
  const n = X06.k15.findIndex(x => x[0] === Date.parse('2026-10-07T02:15Z')) + 1, now = Date.parse('2026-10-07T02:20Z');
  const res = F06.scenarios.map(sc => { const e = S.etat(sc, S.plier(sc, k.T, k.H, k.L, 0, n, null, Q, k.C), now); return { sc, e, v: S.touchesValides(sc, e) }; });
  const apres = res.filter(r => r.e.tInv !== null && r.e.touchees.some(t => Number.isFinite(t) && t >= r.e.tInv));
  check(`06/10 → 07/10 02:20 : un scénario invalidé puis touché (${apres.map(r => r.sc.rang + ' inv ' + hm(r.e.tInv)).join(', ')}) n’a aucune coche après l’invalidation`, apres.length >= 1 && apres.every(r => r.v.every(x => x.t < r.e.tInv)), apres.map(r => [r.sc.rang, r.e.touchees, r.e.tInv, r.v]));
  check('toutes les coches : dans l’ordre des cibles, avant l’invalidation', res.every(r => r.v.every((x, i) => x.j === i && (r.e.tInv === null || x.t < r.e.tInv))), res.map(r => r.v));
  const nj = res.find(r => r.sc.forme === 'chemin');
  const noteKO = Object.assign({}, nj.sc, { statut: '❌' }), noteA = Object.assign({}, nj.sc, { statut: '⚠' });
  const fauxSv = Object.assign({}, nj.e, { temps: [now - 3600e3], tInv: null, touchees: [now - 3600e3] });
  check('note du journal ❌ ou ⚠ : aucune coche', !S.touchesValides(noteKO, fauxSv).length && !S.touchesValides(noteA, fauxSv).length && S.touchesValides(nj.sc, fauxSv).length === 1);
  // Contact hors de l'ordre (la 2e cible avant la 1re) : pas de coche pour la 2e.
  const F = fichier([{ forme: 'chemin', cibles: [101500, 103000], invalidation: 97000 }, R, D]), sc = F.scenarios[0];
  const e = S.suiviVide(Q); S.pas(sc, e, 0, T0, 103100, 102900, 103000); S.pas(sc, e, 1, T0 + Q, 101600, 101400, 101500);
  const svx = S.etat(sc, e, T0 + 2 * Q), v = S.touchesValides(sc, svx);
  check('2e cible touchée avant la 1re : seule la 1re a sa coche (chaîne stricte)', v.length === 1 && v[0].j === 0 && Number.isFinite(svx.touchees[1]), [v, svx.touchees]);
}

titre('6. Note ❌ du journal sans heure de résolution : pas d’effacement d’un coup');
{
  const pub = T0 + 6 * 3600e3;
  const F = fichier([Object.assign({ statut: '❌' }, R), U, D], { updated: iso(pub) });
  const items = () => [it(F.scenarios[0], sv('dedans')), it(F.scenarios[1], sv('rien')), it(F.scenarios[2], sv('rien'))];
  const J = S.classerJour(items(), 100000, F, pub + 30 * 60e3, { grille: true, sortiTot: true, prec: 'X2', cas: 'meneur' }, PJ);
  check(`fondu depuis la publication du fichier : 0,5 à +30 min (${J.items[0].fondu})`, proche(J.items[0].fondu, 0.5, 1e-9), J.items[0].fondu);
  const F2 = fichier([Object.assign({ statut: '❌' }, R), U, D]);
  const J2 = S.classerJour([it(F2.scenarios[0], sv('dedans')), it(F2.scenarios[1], sv('rien')), it(F2.scenarios[2], sv('rien'))], 100000, F2, pub, { grille: true, sortiTot: true, prec: 'X2', cas: 'meneur' }, PJ);
  check('sans heure de publication non plus : il ne s’efface pas (1)', J2.items[0].fondu === 1, J2.items[0].fondu);
  const F3 = fichier([Object.assign({ statut: '❌', resolu_utc: iso(pub) }, R), U, D]);
  const J3 = S.classerJour([it(F3.scenarios[0], sv('dedans')), it(F3.scenarios[1], sv('rien')), it(F3.scenarios[2], sv('rien'))], 100000, F3, pub + 15 * 60e3, { grille: true, sortiTot: true, prec: 'X2', cas: 'meneur' }, PJ);
  check('avec resolu_utc : fondu depuis lui (0,75 à +15 min)', proche(J3.items[0].fondu, 0.75, 1e-9) && J3.items[0].ferme.journal && J3.items[0].ferme.t === pub, J3.items[0]);
}

titre('7. Libellés et ligne Débutant : marques, ⚠, journal, marge d’un range');
{
  const F = fichier([R, U, D]);
  const [a, b, c] = F.scenarios;
  const tous = [];
  const cas = [
    ['réalisé en direct', it(b, sv('realise', 1, { t: T0 + 3600e3 }))],
    ['invalidé en direct', it(b, sv('invalide', 0, { t: T0 + 3600e3 }))],
    ['sorti en direct', it(a, sv('sortie', 0, { t: T0 + 3600e3, sortie: { haut: false } }))],
    ['indécis en direct', it(c, sv('ambigu', 0, { t: T0 + 3600e3 }))],
    ['journal ✅', it(Object.assign({}, b, { statut: '✅' }), sv('rien'))],
    ['journal ❌', it(Object.assign({}, b, { statut: '❌' }), sv('rien'))],
    ['journal ⚠', it(Object.assign({}, b, { statut: '⚠' }), sv('rien'))],
  ];
  for (const [nom, x] of cas) {
    const J = S.classerJour([x].concat([a, b, c].filter(s => s.rang !== x.sc.rang).map(s => it(s, sv(s.forme === 'range' ? 'dedans' : 'rien')))), 100000, F, T0 + 3 * 3600e3, { grille: true, sortiTot: true, prec: 'X1', cas: 'meneur' }, PJ);
    const y = J.items.find(i => i.sc.rang === x.sc.rang);
    for (const fl of [null, '↑']) {
      const L = S.libellesJourDebutant(y, 32, fl);
      tous.push(...L);
      const attendue = x.sc.statut !== '⏳' ? /\(journal\)$/ : /\(en direct\)$/;
      check(`${nom}${fl ? ' (hors vue)' : ''} : « ${L[0]} » … « ${L[L.length - 1]} » : chacun marqué, ≤ 32`, L.every(t => attendue.test(t) && t.length <= 32), L);
    }
    if (nom === 'journal ⚠') check('journal ⚠ : « indécis », jamais ✗', S.libellesJourDebutant(y, 32, null).every(t => !/✗/.test(t)));
  }
  check('libellés : aucun « atteint », aucun mot banni', tous.every(t => !/atteint/.test(t) && !Guide.motsBannis(t).length), tous.filter(t => /atteint/.test(t)));
  // Heure de la fermeture dans le libellé (Paris).
  const Jh = S.classerJour([it(b, sv('invalide', 0, { t: Date.parse('2026-10-08T15:15Z') })), it(a, sv('dedans')), it(c, sv('rien'))], 100000, F, Date.parse('2026-10-08T15:40Z'), { grille: true, sortiTot: true, prec: 'X1', cas: 'meneur' }, PJ);
  const Lh = S.libellesJourDebutant(Jh.items.find(i => i.sc === b), 32, null);
  check(`fermeture : l’heure de Paris dans le libellé (« ${Lh[0]} »)`, /vers 17h15 \(en direct\)$/.test(Lh[0]), Lh);
  // Ligne : ⚠ du journal sur le rang 1.
  const fa = JSON.parse(JSON.stringify(X08.fichier)); fa.scenarios[0].statut = '⚠';
  const FA = S.lire(fa, T0), xa = instant(FA, k15, '2026-10-08T14:05Z');
  const la = [48, 40].map(m => S.ligneJourDebutant(FA, xa.J, xa.items, xa.now, m, {}));
  check(`rang 1 noté ⚠ : « ${la.join(' » / « ')} » (indécis, jamais ✗ ; « (journal) » seul)`, la.every(t => /^Scén\. 1 indécis \(journal\) ▸$/.test(t)), la);
  // Ligne : le 2 réalisé par le journal, le 1 ouvert → « (journal) ».
  const fr = JSON.parse(JSON.stringify(X08.fichier)); fr.scenarios[1].statut = '✅';
  const FR = S.lire(fr, T0), xr = instant(FR, k15, '2026-10-08T12:00Z');
  const lr = [48, 40].map(m => S.ligneJourDebutant(FR, xr.J, xr.items, xr.now, m, {}));
  check(`le 2 réalisé par le journal, le 1 ouvert : « ${lr.join(' » / « ')} »`, lr.every(t => /\(journal\) ▸$/.test(t) && !/en direct/i.test(t) && /^Zone du 2/.test(t)), lr);
  // Range : prix sous la borne basse, dans la marge (08/10 ~15:40-17:15 : 81 436 – 83 947, toléré dès 80 622).
  const x = instant(F08, k15, '2026-10-08T16:40Z'), un = x.J.items[0];
  const Lm = S.libellesJourDebutant(un, 32, null);
  check(`range dans sa marge (prix ${Math.round(x.J.prix)}) : « ${Lm[0]} »`, un.ouvert && S.dansMarge(un) && /^Scén(ario|\.) 1 : tient jusqu’à 80 622 \$$/.test(Lm[0]) && Lm[0].length <= 32, [x.J.prix, Lm]);
  const xin = instant(F08, k15, '2026-10-08T12:00Z');
  check('range dans ses bornes : le libellé habituel « reste … »', !S.dansMarge(xin.J.items[0]) && /reste/.test(S.libellesJourDebutant(xin.J.items[0], 32, null)[0]), S.libellesJourDebutant(xin.J.items[0], 32, null));
}

titre('8. Bulles Débutant : heure des fermetures, « seul » d’un range, version courte');
{
  const x = instant(F08, k15, '2026-10-08T15:40Z');
  const l3 = S.ligneDebutantJour(x.J.items[2], x.J), l3c = S.ligneDebutantJour(x.J.items[2], x.J, true);
  check(`fermeture : l’heure de Paris (« ${l3.slice(0, 160)} … »)`, /\(en direct\) entre \d\dh\d\d et \d\dh\d\d \(heure de Paris\)/.test(l3) && /entre \d\dh\d\d et \d\dh\d\d \(heure de Paris\)/.test(l3c), [l3, l3c]);
  const sl = S.phraseMeneurDebutant(x.J);
  check(`« seul » d’un range : « ${sl} »`, x.J.cas === 'seul' && x.J.seul.sc.forme === 'range' && !/ce qu’il décrit/.test(sl), sl);
  const xs = instant(F08, k15, '2026-10-08T15:25Z');
  if (xs.J.cas === 'seul' && xs.J.seul.pos.e >= 0.5) check(`« seul », prix près d’une limite : « ${S.phraseMeneurDebutant(xs.J)} »`, /plus près de sa limite (basse|haute) \([\d ]+ \$, marge comprise\) que du milieu de la fourchette/.test(S.phraseMeneurDebutant(xs.J)), S.phraseMeneurDebutant(xs.J));
  const y = instant(F08, k15, '2026-10-08T13:50Z');
  const courts = y.J.items.map(i => S.ligneDebutantJour(i, y.J, true));
  check(`version courte : chaque scénario dit son niveau (« ${courts.join(' » « ')} »)`, /^1\. entre 81 436 et 83 947 \$ — /.test(courts[0]) && courts.slice(1).every(t => /^\d\. vers [\d ]+ \$/.test(t)) && courts.every(t => !/sa zone(?! \(dès)/.test(t) || /de sa zone \(dès [\d ]+ \$\)|dans sa zone/.test(t)), courts);
  const tout = [l3, l3c, sl].concat(courts);
  check('aucun mot banni, aucun %, aucun conseil', tout.every(t => !Guide.motsBannis(t).length && !/%/.test(t) && !/achet|vend|recommand|il faut/i.test(t)), tout);
}

console.log(ko ? `\n❌ SCÉNARIOS, SUIVI DE LA JOURNÉE (REVUE) : ${ko} contrôle(s) en échec` : '\n✅ SCÉNARIOS, SUIVI DE LA JOURNÉE (REVUE) : TOUS LES CONTRÔLES PASSENT');
process.exit(ko ? 1 : 0);
