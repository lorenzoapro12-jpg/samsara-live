// Figures passées (plan §8 et §5.2) — hors ligne, sur les 3 000 bougies 15 min réelles de la fixture.
//
// Une figure passée est un EXEMPLE : relue dans le rejeu (Guide.detecter), à sa place, avec son
// issue ; jamais un conseil ni une prévision, et jamais les seules réussites (le compte de la vue dit
// aussi les échecs).
// CE QUI EST VÉRIFIÉ (Guide.figuresPassees, texteComptePassees, libellePassee, texteFigurePassee)
//   1. le compte de tout l'historique = un recompte indépendant (validées terminées, cibles
//      atteintes, invalidées, délais écoulés ; tombées avant validation) ;
//   2. Lisible : rien quand la vue suit la dernière bougie ; vue dans le passé : au plus UNE figure,
//      validée, terminée, ENTIÈRE dans la vue, la plus récente (aucune autre candidate plus récente),
//      et une dès qu'il en existe une ; le choix du menu n'y change rien ;
//   3. Complet : « non » → rien ; « validées » → au plus 6, toutes validées (jamais une figure ou une
//      ébauche tombée avant sa validation), issue dans la vue, les plus récentes ; « toutes » → les
//      tombées aussi (vu sur la fixture), au plus 6, les plus récentes ; une figure exclue (montrée
//      comme figure en cours) n'y est jamais ; le compte ne dépend pas du choix ;
//   4. le compte en mots : les nombres dits = le compte (validées, cibles atteintes, tombées), les
//      échecs toujours dits (« aucune n'a atteint sa cible »), « les 6 plus récentes sont tracées » ;
//   5. les mots du Lisible, pour CHAQUE figure validée de la fixture : libellé ≤ 26 caractères qui
//      commence par la marque de son issue (✓ ✗ –), une marque par issue ; titre, résumé et détail
//      sans mot banni, sans « % », sans conseil ; le résumé dit ce qui s'est passé ENSUITE (cible
//      atteinte ou non) avec trois nombres au plus (titre compris) ; le détail dit le compte et
//      « Une description, pas un conseil. » ; avec « Le détail » : « Exemple passé », sans conseil
//      (revue du 14/10/2026, C19 : l'avertissement partagé, à la place de « pas une prévision ni un
//      conseil » et de « pas une prévision ni une recommandation ») ;
//   6. justes quand une bougie se ferme (rejeu repris) et quand l'historique s'allonge au début
//      (identité par les DATES : Guide.idFigure avec les heures) ;
//   7. temps : la sélection sur tout l'historique ≤ 1 ms.
// USAGE   node tests/test_figures_passees.js
const fs = require('fs'), path = require('path'), vm = require('vm');
const REPO = path.resolve(__dirname, '..');
const G = require(path.join(REPO, 'js/guide.js'));
const { chargerPage } = require('./bac');

let ko = 0;
const check = (nom, ok, det) => { if (!ok) ko++; console.log(`  ${ok ? '✓' : '✗'} ${nom}${!ok && det !== undefined ? ' — ' + JSON.stringify(det).slice(0, 600) : ''}`); };
const titre = t => console.log(`\n── ${t} ──`);
const CONSEIL = /\b(achetez|vendez|achète[rz]?\b|vends\b|il faut (?:acheter|vendre)|entrez|sortez|prenez position|signal d['’]achat|signal de vente|recommand(?:e|ons))/i;
// Les nombres d'un texte, au sens propre (un prix, une heure, une durée, un compte) : chaque groupe
// de chiffres compte, « 3 h 30 » en fait deux.
const nombres = t => (String(t).match(/\d+(?:[   ]\d{3})*(?:[,.:]\d+)?/g) || []).length;

const P = vm.runInContext('PARAM.guide', chargerPage().sandbox);
function atrDe(H, L, C, n) {
  const tr = [null];
  for (let i = 1; i < C.length; i++) tr.push(Math.max(H[i] - L[i], Math.abs(H[i] - C[i - 1]), Math.abs(L[i] - C[i - 1])));
  const a = new Array(C.length).fill(null);
  let s = 0; for (let i = 1; i <= n; i++) s += tr[i];
  a[n] = s / n;
  for (let i = n + 1; i < C.length; i++) a[i] = (a[i - 1] * (n - 1) + tr[i]) / n;
  return a;
}
const brut = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'bougies-btcusdt-15m.json'), 'utf8')).bougies;
const H = brut.map(k => +k[2]), L = brut.map(k => +k[3]), C = brut.map(k => +k[4]), T = brut.map(k => Math.round(k[0] / 1000));
const A = atrDe(H, L, C, P.atrPeriode);
// Comme la page : la dernière bougie est en cours, le rejeu lit les N = n − 1 closes.
const n = C.length, N = n - 1;
const R = G.detecter({ h: H, l: L, c: C, atr: A, n: N }, P);
const ctx = { n: R.n, intervalle: '15m', duree: T[N - 1] - T[0], temps: T, pas: 900, maintenant: (T[n - 1] + 540) * 1000, j: n - 1, horizon: P.horizon };
const j = R.n - 1;
const valide = f => !f.ebauche && f.jConf !== null && f.jConf !== undefined && ['atteint', 'invalide', 'expire'].includes(f.fin);
const tombee = f => (f.ebauche ? f.fin === 'abandon' : ['invalide_avant', 'expire_avant'].includes(f.fin));
const fini = f => !!f.fin && f.jFin <= j;
const VAL = R.formes.filter(f => !f.doublon && valide(f) && fini(f));
const ebs = R.ebauches.liste;
// Les ébauches annulées comptées « tombées » : une par identité (type + ancres), la dernière chute
// seulement, et aucune dont la même figure a fini par naître (revenue, devenue figure).
const ident = G.cleFigure;
const EBT = (() => {
  const fig = new Set(R.formes.map(ident)), par = new Map();
  for (const e of ebs) { const k = ident(e); if (!par.has(k)) par.set(k, []); par.get(k).push(e); }
  return ebs.filter(e => tombee(e) && !fig.has(ident(e)) && par.get(ident(e)).every(x => x === e || (x.fin && (x.jFin < e.jFin || (x.jFin === e.jFin && ebs.indexOf(x) < ebs.indexOf(e))))));
})();

// ── 1. Le compte de tout l'historique ──
titre('1. Le compte de tout l’historique = un recompte indépendant');
{
  const tout = G.figuresPassees(R, 0, n, 'toutes', 'expert');
  const c = tout.compte, att = VAL.filter(f => f.fin === 'atteint').length;
  const tomb = R.formes.filter(f => !f.doublon && !f.ebauche && tombee(f)).length;
  check(`validées terminées : ${c.validees} (recompte ${VAL.length}), cibles atteintes ${c.atteintes} (${att}), ${c.validees - c.atteintes} sans leur cible`,
    c.validees === VAL.length && c.atteintes === att && c.invalidees === VAL.filter(f => f.fin === 'invalide').length && c.expirees === VAL.filter(f => f.fin === 'expire').length
    && c.atteintes + c.invalidees + c.expirees === c.validees && c.validees > 50 && c.validees - c.atteintes > 20, c);
  const ebt = EBT.filter(e => e.jFin <= j).length;
  check(`tombées avant validation : ${c.tombees} = ${tomb} figures + ${ebt} ébauches annulées (une par identité, jamais une ébauche revenue ensuite)`, c.tombees === tomb + ebt && ebt > 0 && ebt < ebs.filter(e => e.fin === 'abandon').length, { c, tomb, ebt });
}

// Des vues dans le passé : plusieurs largeurs, toutes les 7 bougies.
const VUES = [];
for (const w of [50, 90, 150, 300]) for (let ve = w + 1; ve <= j; ve += 7) VUES.push([ve - w, ve]);

// ── 2. Lisible ──
titre('2. Lisible : rien au présent ; dans le passé, la plus récente figure validée entière');
{
  const auPresent = [50, 90, 150, 300, 3000].filter(w => G.figuresPassees(R, n - w, n, 'toutes', 'debutant').liste.length);
  check('la vue suit la dernière bougie (50, 90, 150, 300, 3 000 bougies) : aucune figure passée', !auPresent.length, auPresent);
  let avec = 0, mal = [];
  for (const [vs, ve] of VUES) {
    const r = G.figuresPassees(R, vs, ve, 'non', 'debutant'), L = r.liste;
    const entieres = VAL.filter(f => f.debut >= vs && f.jFin < ve);
    const attendue = entieres.sort((x, y) => y.jFin - x.jFin || y.debut - x.debut)[0] || null;
    if (L.length) avec++;
    if (L.length > 1 || (attendue ? L[0] !== attendue : L.length) || (L[0] && !(valide(L[0]) && L[0].debut >= vs && L[0].jFin < ve && L[0].jFin <= j))) mal.push({ vs, ve, L: L.map(f => f.type + '@' + f.debut + '-' + f.jFin), attendue: attendue && attendue.type + '@' + attendue.debut + '-' + attendue.jFin });
  }
  check(`${VUES.length} vues dans le passé : au plus une, validée, terminée, entière dans la vue, la plus récente — et une dès qu’il en existe (${avec} vues en ont une)`, !mal.length && avec > 50, mal.slice(0, 4));
  const choix = VUES.filter(([vs, ve], k) => k % 9 === 0).filter(([vs, ve]) => ['validees', 'toutes'].some(c => G.figuresPassees(R, vs, ve, c, 'debutant').liste[0] !== G.figuresPassees(R, vs, ve, 'non', 'debutant').liste[0]));
  check('le choix du menu (Complet) ne change rien au Lisible', !choix.length, choix.slice(0, 3));
}

// ── 3. Complet ──
titre('3. Complet : non / validées seulement / toutes, au plus 6, les plus récentes');
{
  const ordre = (x, y) => y.jFin - x.jFin || y.debut - x.debut;
  let malV = [], malT = [], tombVues = 0, non = 0, compte = [];
  for (const [vs, ve] of VUES.concat([[n - 150, n], [0, n]])) {
    const rn = G.figuresPassees(R, vs, ve, 'non', 'expert'), rv = G.figuresPassees(R, vs, ve, 'validees', 'expert'), rt = G.figuresPassees(R, vs, ve, 'toutes', 'expert');
    if (rn.liste.length) non++;
    if (JSON.stringify(rn.compte) !== JSON.stringify(rv.compte) || JSON.stringify(rv.compte) !== JSON.stringify(rt.compte)) compte.push([vs, ve]);
    const dans = f => f.jFin >= vs && f.jFin < ve && f.jFin <= j;
    const candV = VAL.filter(dans).sort(ordre);
    if (rv.liste.length > 6 || rv.liste.some(f => !valide(f) || !dans(f) || f.ebauche) || rv.liste.length !== Math.min(6, candV.length) || rv.liste.some((f, k) => ordre(f, candV[k]) !== 0)) malV.push({ vs, ve, v: rv.liste.map(f => f.type + ':' + f.fin) });
    const candT = R.formes.filter(f => !f.doublon && (valide(f) || (!f.ebauche && tombee(f))) && dans(f)).concat(EBT.filter(dans)).sort(ordre);
    if (rt.liste.length > 6 || rt.liste.some(f => !(valide(f) || tombee(f)) || !dans(f)) || rt.liste.length !== Math.min(6, rv.compte.validees + rv.compte.tombees)
      || rt.liste.length !== Math.min(6, candT.length) || rt.liste.some((f, k) => ordre(f, candT[k]) !== 0)) malT.push({ vs, ve, t: rt.liste.map(f => f.type + ':' + f.fin) });
    if (rt.liste.some(tombee)) tombVues++;
  }
  check('« non » (par défaut) : aucune figure passée, dans aucune vue', non === 0, non);
  check('« validées seulement » : au plus 6, validées et terminées (jamais une figure ni une ébauche tombée avant sa validation), issue dans la vue, les 6 plus récentes', !malV.length, malV.slice(0, 3));
  check(`« toutes » : au plus 6, validées ou tombées, issue dans la vue, les plus récentes ; des tombées (figures ou ébauches) y paraissent (${tombVues} vues)`, !malT.length && tombVues > 50, malT.slice(0, 3));
  check('le compte de la vue est le même quel que soit le choix', !compte.length, compte.slice(0, 3));
  const vue = VUES.find(([vs, ve]) => G.figuresPassees(R, vs, ve, 'toutes', 'expert').liste.length >= 3);
  const r0 = G.figuresPassees(R, vue[0], vue[1], 'toutes', 'expert'), ex = new Set(r0.liste.slice(0, 2));
  const r1 = G.figuresPassees(R, vue[0], vue[1], 'toutes', 'expert', { exclure: f => ex.has(f) });
  const d0 = G.figuresPassees(R, vue[0], vue[1], 'non', 'debutant'), d1 = d0.liste[0] ? G.figuresPassees(R, vue[0], vue[1], 'non', 'debutant', { exclure: f => f === d0.liste[0] }) : null;
  check('une figure montrée comme figure en cours (exclure) n’est jamais une figure passée — Complet et Lisible', !r1.liste.some(f => ex.has(f)) && r1.liste[0] === r0.liste[2] && (!d1 || !d1.liste.includes(d0.liste[0])), { r0: r0.liste.length, r1: r1.liste.length });
}

// ── 4. Le compte en mots ──
titre('4. Le compte en mots : les réussites et les échecs');
{
  const c = (validees, atteintes, tombees) => ({ validees, atteintes, invalidees: validees - atteintes, expirees: 0, tombees: tombees || 0 });
  check('« Dans cette vue : 5 figures validées, 2 ont atteint leur objectif. » (Lisible et Complet)', G.texteComptePassees(c(5, 2), 'debutant')[0] === 'Dans cette vue : 5 figures validées, 2 ont atteint leur objectif.'
    && G.texteComptePassees(c(5, 2), 'expert', 'validees', 5)[1] === 'Dans cette vue : 5 figures validées, 2 ont atteint leur objectif.', [G.texteComptePassees(c(5, 2), 'debutant'), G.texteComptePassees(c(5, 2), 'expert', 'validees', 5)]);
  check('les échecs sont dits : « aucune n’a atteint son objectif », « 1 a atteint son objectif », « elle n’a pas atteint son objectif »', /aucune n’a atteint son objectif/.test(G.texteComptePassees(c(3, 0), 'debutant')[0])
    && /, 1 a atteint son objectif\.$/.test(G.texteComptePassees(c(4, 1), 'debutant')[0]) && /elle n’a pas atteint son objectif/.test(G.texteComptePassees(c(1, 0), 'expert', 'validees', 1)[0]), null);
  // (Changé exprès, revue du 14/10/2026, M5 : « jamais validées » (annulées ou sans suite), plus « tombées ».)
  check('Complet « toutes » : les figures jamais validées sont comptées ; « (les 6 plus récentes sont tracées) » quand la vue en a plus', /; 7 jamais validées \(les 6 plus récentes sont tracées\)\.$/.test(G.texteComptePassees(c(5, 2, 7), 'expert', 'toutes', 6)[0])
    && / · 7 jamais validées$/.test(G.texteComptePassees(c(5, 2, 7), 'expert', 'toutes', 6)[2]) && / ; aucune figure non validée\.$/.test(G.texteComptePassees(c(5, 2, 0), 'expert', 'toutes', 5)[1])
    && !/tracées/.test(G.texteComptePassees(c(5, 2), 'expert', 'validees', 5)[0]), G.texteComptePassees(c(5, 2, 7), 'expert', 'toutes', 6));
  // Sur la fixture : les nombres dits sont ceux du compte, dans chaque vue.
  let mal = [];
  for (const [vs, ve] of VUES.filter((v, k) => k % 5 === 0)) {
    const r = G.figuresPassees(R, vs, ve, 'toutes', 'expert'), k = r.compte, t = G.texteComptePassees(k, 'expert', 'toutes', r.liste.length)[1];
    const m = /^Dans cette vue : (?:(\d+) figures? validées?, (?:(\d+) (?:ont|a) atteint|(aucune) n’a|(toutes|les deux) ont|elle (n’)?a)|aucune figure validée terminée).* ; (?:(\d+) jamais validées?|aucune figure non validée)/.exec(t);
    const v = m ? +(m[1] || 0) : -1, a = !m ? -1 : m[2] ? +m[2] : m[3] ? 0 : m[4] ? v : m[1] === '1' ? (m[5] ? 0 : 1) : 0, tb = m ? +(m[6] || 0) : -1;
    if (v !== k.validees || a !== k.atteintes || tb !== k.tombees) mal.push({ vs, ve, t, k });
  }
  check('sur la fixture, dans chaque vue : les nombres dits = le compte (validées, cibles atteintes, tombées)', !mal.length, mal.slice(0, 3));
  const lis = [c(1, 1), c(2, 2), c(5, 0), c(12, 7)].map(x => G.texteComptePassees(x, 'debutant')).flat();
  check('Lisible : sans « % », sans mot banni, deux nombres au plus', lis.every(t => !/%/.test(t) && !G.motsBannis(t).length && nombres(t) <= 2), lis);
}

// ── 5. Les mots ──
titre('5. Les mots : libellé, titre, résumé, détail (Lisible) ; bulle (Complet)');
{
  const marques = { atteint: '✓', invalide: '✗', expire: '–' };
  let malL = [], malT = [], malR = [], malD = [], malX = [], vus = new Set();
  for (const f of VAL) {
    const r = G.figuresPassees(R, f.debut, f.jFin + 1, 'non', 'debutant');
    const compte = G.texteComptePassees(r.compte, 'debutant');
    const x = G.texteFigurePassee(f, R.bilan[f.type], ctx, P, '$', 'debutant', compte), lib = G.libellePassee(f, P.debutant.forme);
    vus.add(f.fin);
    if (!lib || lib.length > P.debutant.forme || lib.indexOf(marques[f.fin] + ' ') !== 0 || G.marqueIssue(f) !== marques[f.fin] || G.motsBannis(lib).length || /%/.test(lib)) malL.push([f.type, f.fin, lib]);
    if (x.titre.indexOf(marques[f.fin] + ' Exemple passé : ') !== 0 || nombres(x.titre) || G.motsBannis(x.titre).length) malT.push(x.titre);
    // Le résumé : chaque variante sans « % » ni mot banni ; la plus riche de « ensuite » ≤ 1 nombre, le compte ≤ 2.
    const [ensuite, cpt] = x.resume, tous = ensuite.concat(cpt);
    // (Changé exprès, revue du 14/10/2026, M5 : délai écoulé, « n’a ni atteint son objectif ni raté ».)
    const dit = f.fin === 'atteint' ? ensuite.every(t => /a atteint l’objectif/.test(t)) : ensuite.every(t => /sans atteindre son objectif|ni atteint son objectif/.test(t) && !/tombée|annul/.test(t));
    if (!dit || !/^Après sa validation/.test(ensuite[0]) || ensuite.some(t => nombres(t) > 1) || cpt.some(t => nombres(t) > 2) || tous.some(t => /%/.test(t) || G.motsBannis(t).length || CONSEIL.test(t))) malR.push({ f: f.type + ':' + f.fin, ensuite, cpt });
    const D = x.texte.join(' ');
    if (/%/.test(D) || G.motsBannis(D).length || CONSEIL.test(D) || !D.includes(compte[0]) || x.texte[x.texte.length - 1] !== G.AVERTISSEMENT || !/Figure validée/.test(D) || !/Mesuré sur/.test(D)) malD.push({ f: f.type, bannis: G.motsBannis(D), D: D.slice(0, 200) });
    const e = G.texteFigurePassee(f, R.bilan[f.type], ctx, P, '$', 'expert', G.texteComptePassees(r.compte, 'expert', 'validees', 1));
    if (e.titre.indexOf(marques[f.fin] + ' Passée · ') !== 0 || !/^Exemple passé : validé /.test(e.texte[0]) || !/après la validation/.test(e.texte[0]) || CONSEIL.test(e.texte.join(' ')) || e.texte[e.texte.length - 1] !== G.AVERTISSEMENT) malX.push({ t: e.titre, x: e.texte[0] });
  }
  check(`libellé (${VAL.length} figures validées) : ≤ ${P.debutant.forme} caractères, la marque de son issue d’abord (✓ objectif atteint, ✗ invalidée, – délai écoulé), sans mot banni ni « % »`, !malL.length && ['atteint', 'invalide', 'expire'].every(k => vus.has(k)), malL.slice(0, 4));
  check('titre : « ✓ Exemple passé : … », sans nombre ni mot banni', !malT.length, malT.slice(0, 3));
  check('résumé : ce qui s’est passé ENSUITE (objectif atteint, ou pas), un nombre au plus, puis le compte (deux au plus) — trois au plus en tout, sans « % », mot banni ni conseil', !malR.length, malR.slice(0, 2));
  check('détail : définition, validation, issue, le compte de la vue, le bilan mesuré, « Une description, pas un conseil. » ; sans « % », mot banni ni conseil', !malD.length, malD.slice(0, 2));
  check('Le détail : « ✓ Passée · … », « Exemple passé : validé … après la validation », « Une description, pas un conseil. », sans conseil', !malX.length, malX.slice(0, 2));
  // Toutes les issues, tombées comprises (Complet « toutes ») : une marque par issue.
  const issues = {};
  for (const f of R.formes.filter(x => !x.doublon && tombee(x)).concat(ebs.filter(tombee))) issues[f.fin] = G.marqueIssue(f);
  check('une marque par issue, tombées comprises : ✗ invalidée avant validation ou annulée, ○ sans suite', issues.invalide_avant === '✗' && issues.abandon === '✗' && issues.expire_avant === '○' && !('atteint' in G.MARQUES_FIN) && G.MARQUE_ATTEINT === '✓', issues);
  check('durées en mots : un nombre au plus (« environ 12 min », « environ une heure », « environ 6 h », « environ un jour », « environ 3 jours »)',
    [[720, 'environ 12 min'], [3600, 'environ une heure'], [6 * 3600, 'environ 6 h'], [86400, 'environ un jour'], [3 * 86400, 'environ 3 jours']].every(([s, t]) => G.dureeMots(s) === t), [720, 3600, 21600, 86400, 259200].map(G.dureeMots));
}

// ── 6. Justes quand une bougie se ferme et quand l'historique s'allonge au début ──
titre('6. Une bougie qui se ferme ; l’historique qui s’allonge au début (identité par les dates)');
{
  const id = (f, temps) => G.idFigure(f, temps);
  let mal = [];
  for (const m of [2400, 2700, 2950]) {
    const avant = G.detecter({ h: H, l: L, c: C, atr: A, n: m }, P);
    const apres = G.detecter({ h: H, l: L, c: C, atr: A, n: m + 1 }, P, G.detecter({ h: H, l: L, c: C, atr: A, n: m }, P));
    for (const w of [90, 150]) for (let ve = m - 40; ve > m - 400; ve -= 37) {
      for (const [ch, mode] of [['non', 'debutant'], ['validees', 'expert'], ['toutes', 'expert']]) {
        const a = G.figuresPassees(avant, ve - w, ve, ch, mode).liste.map(f => id(f, T)).join(';'), b = G.figuresPassees(apres, ve - w, ve, ch, mode).liste.map(f => id(f, T)).join(';');
        if (a !== b) mal.push({ m, ve, ch, a, b });
      }
    }
  }
  check('une bougie de plus (rejeu repris) : les mêmes figures passées dans chaque vue du passé', !mal.length, mal.slice(0, 2));
  // L'historique chargé commence 600 bougies plus tard, puis s'allonge au début : mêmes vues (en dates).
  const k = 600, Hs = H.slice(k), Ls = L.slice(k), Cs = C.slice(k), Ts = T.slice(k), As = atrDe(Hs, Ls, Cs, P.atrPeriode);
  const court = G.detecter({ h: Hs, l: Ls, c: Cs, atr: As, n: Cs.length - 1 }, P);
  let diff = [], comptes = 0;
  for (const w of [90, 150, 300]) for (let ve = j; ve > k + 400; ve -= 23) {
    for (const [ch, mode] of [['non', 'debutant'], ['validees', 'expert'], ['toutes', 'expert']]) {
      const lg = G.figuresPassees(R, ve - w, ve, ch, mode), ct = G.figuresPassees(court, ve - w - k, ve - k, ch, mode);
      const a = lg.liste.map(f => id(f, T)).join(';'), b = ct.liste.map(f => id(f, Ts)).join(';');
      if (a !== b || JSON.stringify(lg.compte) !== JSON.stringify(ct.compte)) diff.push({ ve, w, ch, a, b });
      comptes++;
    }
  }
  check(`historique allongé de ${k} bougies au début : dans ${comptes} vues (en dates), les mêmes figures passées (Guide.idFigure avec les heures) et le même compte`, !diff.length, diff.slice(0, 2));
  const f = VAL[VAL.length - 1];
  check('l’identité d’une figure passée est dite par les dates de ses ancres, pas par ses indices', id(f, T).includes('@' + T[f.debut]) && !id(f, T).includes('@' + f.debut + ','), id(f, T));
}

// ── 7. Temps ──
titre('7. Temps');
{
  G.figuresPassees(R, 0, n, 'toutes', 'expert');
  const t0 = process.hrtime.bigint();
  for (let k = 0; k < 200; k++) G.figuresPassees(R, 0, n, k % 2 ? 'toutes' : 'validees', 'expert');
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / 200;
  check(`la sélection sur tout l’historique (${R.formes.length} figures, ${ebs.length} ébauches) : ${ms.toFixed(3)} ms (≤ 1 ms) — rien n’est recalculé à chaque image`, ms <= 1, ms);
}

console.log(ko ? `\n❌ FIGURES PASSÉES : ${ko} contrôle(s) en échec` : '\n✅ FIGURES PASSÉES : TOUS LES CONTRÔLES PASSENT');
process.exit(ko ? 1 : 0);
