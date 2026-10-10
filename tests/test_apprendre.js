// Apprendre en se servant du site (plan §10 bis) — hors ligne : le cœur pur js/apprendre.js, sur
// des observations construites et sur les figures réelles de la fixture 15 min.
//
// CE QUI EST VÉRIFIÉ
//   1. LA DÉTECTION : rien à la première observation d'un contexte (le chargement), ni après un
//      contexte remis à zéro (vue dans le passé, onglet caché) ; un repère franchi d'un bord à
//      l'autre de sa bande (pas sur le trait, pas dans la bande), dit une fois, et pas redit avant
//      `passageMs` (un prix qui oscille ne répète rien) ; jamais dans le sens d'une cassure déjà
//      validée ; la cassure validée (Guide.etatFerme) dite une fois ; une figure validée, tombée,
//      atteinte, finie — seulement dessinée, jamais deux fois, jamais après sa fin ; un scénario qui
//      touche sa 1re puis sa 2e cible, réalisé, invalidé, sorti, indécis — seulement montré (ou
//      montré à l'image d'avant), jamais sans suivi en direct ; un passage dit au présent est retiré
//      quand le prix repasse (perime) ;
//   2. LA PRIORITÉ : deux changements ensemble → un seul message, le plus important (ORDRE) ; un
//      message n'est remplacé que par un plus important ou égal ;
//   3. LES MOTS, pour chaque type, chaque sens, chaque intervalle, chaque type de figure de la
//      fixture : Lisible — sans mot banni, sans conseil, sans prévision (ni « rebond »), sans « % »,
//      une variante de 48 caractères au plus (téléphone) et chacune de 90 au plus, résumé de 3
//      nombres au plus ; Complet — sans conseil ; les deux : la ligne du risque (Guide.RISQUE) en
//      tête du dernier paragraphe ; et EXACTS : « cassé » = « 2 quarts d'heure ont fini au-delà »,
//      « validé » = 2 fins au-delà de la ligne, « invalidé » = une fin au-delà du niveau qui annule ;
//   4. LA LIGNE DU RISQUE dans les bulles de figure (en cours et passées, les deux modes), pour
//      chaque figure de la fixture ;
//   5. « NOUVEAU » : clé versionnée, lue et écrite sous try/catch (stockage absent, qui lève,
//      illisible), une marque à la fois dans l'ordre des natures ; les choix du Complet gardés ;
//   6. les paramètres de la page (PARAM.apprendre, la limite de la ligne = celle de la phrase).
// USAGE   node tests/test_apprendre.js
const fs = require('fs'), path = require('path'), vm = require('vm');
const REPO = path.resolve(__dirname, '..');
const G = require(path.join(REPO, 'js/guide.js'));
const A = require(path.join(REPO, 'js/apprendre.js'));
const { chargerPage } = require('./bac');

let ko = 0;
const check = (nom, ok, det) => { if (!ok) ko++; console.log(`  ${ok ? '✓' : '✗'} ${nom}${!ok && det !== undefined ? ' — ' + JSON.stringify(det).slice(0, 700) : ''}`); };
const titre = t => console.log(`\n── ${t} ──`);
const CONSEIL = /\b(achetez|vendez|achète[rz]?\b|vends\b|il faut (?:acheter|vendre)|entrez|sortez|prenez position|signal d['’]achat|signal de vente|recommand(?:e|ons))/i;
const PREVISION = /\b(va (?:monter|baisser|remonter|rebondir|chuter)|rebond\w*|c['’]est le moment|bientôt|devrait|prochaine? hausse|prochaine? baisse)\b/i;
const page = chargerPage();
const PAGE = page.sandbox;
const P = vm.runInContext('PARAM', PAGE);
const nombresDe = vm.runInContext('nombresDe', PAGE);

// ── 1. La détection ──
titre('1. La détection : un changement vu en direct, une fois');
const O = (live, t, extra) => Object.assign({ live, maintenant: t, tClos: Math.floor(t / 900000) * 900, passageMs: 15 * 60000 }, extra || {});
const rep = (o) => Object.assign({ id: 'L84145', bas: 84130, haut: 84160, cassure: null, sens: 0, retest: false, affiche: true, niv: { p: 84145, lo: 84130, hi: 84160, principale: { cle: 'hier_haut', p: 84145, nom: 'Plus haut d’hier' } } }, o || {});
{
  const T = A.suivi();
  A.contexte(T, 'BTCUSDT|15m|L|1');
  let e = A.comparer(T, 'repere', [rep()], O(84000, 1e9));
  check('chargement : la 1re observation n’est qu’une base (rien n’est dit)', e.length === 0, e);
  e = A.comparer(T, 'repere', [rep()], O(84145, 1e9 + 1000));
  check('le prix sur le trait du repère : rien (pas passé)', e.length === 0, e);
  e = A.comparer(T, 'repere', [rep()], O(84150, 1e9 + 2000));
  check('le prix dans la petite bande du repère : rien (pas passé de l’autre côté)', e.length === 0, e);
  e = A.comparer(T, 'repere', [rep()], O(84170, 1e9 + 3000));
  check('le prix sort de la bande par le haut : UN passage, vers le haut', e.length === 1 && e[0].type === 'repere_passe' && e[0].sens === 1, e);
  check('… dit au présent, et vrai tant que le prix reste au-dessus (perime : non)', !A.perime(T, e[0]), null);
  const msg = e[0];
  e = A.comparer(T, 'repere', [rep()], O(84170, 1e9 + 4000));
  check('même côté à l’image suivante : rien de plus', e.length === 0, e);
  e = A.comparer(T, 'repere', [rep()], O(84100, 1e9 + 5000));
  check('le prix repasse sous la bande 1 s plus tard : rien n’est redit (un passage par repère et par quart d’heure)', e.length === 0, e);
  check('… et la ligne « au-dessus » est retirée (perime)', A.perime(T, msg), null);
  e = A.comparer(T, 'repere', [rep()], O(84170, 1e9 + 6000));
  check('le prix qui oscille ne répète rien', e.length === 0, e);
  e = A.comparer(T, 'repere', [rep()], O(84100, 1e9 + 5000 + 15 * 60000));
  check('15 min plus tard, un nouveau passage (vers le bas) est dit', e.length === 1 && e[0].sens === -1, e);
  // Cassure validée (règle du Guide) : dite une fois ; un passage dans son sens n'apprend rien.
  e = A.comparer(T, 'repere', [rep({ cassure: 'demi', sens: -1 })], O(84100, 2e9));
  check('une seule fin au-delà (« demi ») : rien', e.length === 0, e);
  e = A.comparer(T, 'repere', [rep({ cassure: 'valide', sens: -1 })], O(84100, 2e9 + 1000));
  check('la cassure validée vers le bas : UN « repère cassé »', e.length === 1 && e[0].type === 'repere_casse' && e[0].sens === -1, e);
  e = A.comparer(T, 'repere', [rep({ cassure: 'valide', sens: -1 })], O(84100, 2e9 + 2000));
  check('… pas deux fois', e.length === 0, e);
  A.comparer(T, 'repere', [rep({ cassure: 'valide', sens: -1 })], O(84170, 3e9));
  e = A.comparer(T, 'repere', [rep({ cassure: 'valide', sens: -1 })], O(84100, 3e9 + 1000));
  check('un passage dans le sens d’une cassure déjà validée : rien', e.length === 0, e);
  // Pas affiché : rien.
  const T2 = A.suivi(); A.contexte(T2, 'x');
  A.comparer(T2, 'repere', [rep({ affiche: false })], O(84000, 1e9));
  e = A.comparer(T2, 'repere', [rep({ affiche: false })], O(84200, 1e9 + 1000));
  check('un repère qui n’est pas à l’écran (ni avant, ni maintenant) : rien', e.length === 0, e);
  // Le repère affiché AVANT le passage (il change de côté, puis la sélection change) : dit.
  const T3 = A.suivi(); A.contexte(T3, 'x');
  A.comparer(T3, 'repere', [rep({ affiche: true })], O(84000, 1e9));
  e = A.comparer(T3, 'repere', [rep({ affiche: false })], O(84200, 1e9 + 1000));
  check('un repère à l’écran à l’image d’avant : son passage est dit', e.length === 1, e);
  // Contexte : vue dans le passé (null), puis retour : une base, rien.
  const T4 = A.suivi(); A.contexte(T4, 'a');
  A.comparer(T4, 'repere', [rep()], O(84000, 1e9));
  check('contexte null (vue dans le passé, onglet caché) : les bases sont vidées', A.contexte(T4, null) === true && Object.keys(T4.base).length === 0, T4.base);
  A.contexte(T4, 'a');
  e = A.comparer(T4, 'repere', [rep()], O(84200, 1e9 + 1000));
  check('retour au présent : la 1re observation est une base (le passage fait pendant l’absence n’est pas dit)', e.length === 0, e);
  check('contexte changé (paire, intervalle, mode) : les bases sont vidées', A.contexte(T4, 'b') === true && A.contexte(T4, 'b') === false, null);
  // Complet : la bande entière.
  const T5 = A.suivi(); A.contexte(T5, 'c');
  const bande = { id: 'C1', bas: 84100, haut: 84300, cassure: null, sens: 0, affiche: true, niv: { pMin: 84145, pMax: 84250, p: 84200 } };
  A.comparer(T5, 'repere', [bande], O(84000, 1e9));
  e = A.comparer(T5, 'repere', [bande], O(84200, 1e9 + 1000));
  check('Complet : dans la bande, rien', e.length === 0, e);
  e = A.comparer(T5, 'repere', [bande], O(84320, 1e9 + 2000));
  check('Complet : passée d’un bord à l’autre, un passage', e.length === 1 && e[0].type === 'repere_passe', e);
}
{
  const T = A.suivi(); A.contexte(T, 'f');
  const fig = (cle, affiche, id) => ({ id: id || 'double_creux@1', cle, f: { type: 'double_creux', sens: 1 }, affiche: affiche !== false });
  let e = A.comparer(T, 'figure', [fig('demi')], {});
  check('figure : la 1re observation est une base', e.length === 0, e);
  e = A.comparer(T, 'figure', [fig('confirme', false)], {});
  check('figure validée mais pas dessinée : rien', e.length === 0, e);
  const T2 = A.suivi(); A.contexte(T2, 'f');
  A.comparer(T2, 'figure', [fig('demi')], {});
  e = A.comparer(T2, 'figure', [fig('confirme')], {});
  check('figure dessinée : « validée », une fois', e.length === 1 && e[0].type === 'figure_validee', e);
  check('… pas deux fois', A.comparer(T2, 'figure', [fig('confirme')], {}).length === 0, null);
  e = A.comparer(T2, 'figure', [fig('invalide')], {});
  check('validée → invalidée : « tombée »', e.length === 1 && e[0].type === 'figure_tombee', e);
  check('après sa fin, plus rien (une fin ne se défait pas)', A.comparer(T2, 'figure', [fig('atteint')], {}).length === 0, null);
  const T3 = A.suivi(); A.contexte(T3, 'f');
  A.comparer(T3, 'figure', [fig('confirme')], {});
  e = A.comparer(T3, 'figure', [fig('atteint')], {});
  check('validée → cible atteinte : « atteinte »', e.length === 1 && e[0].type === 'figure_atteinte', e);
  const T4 = A.suivi(); A.contexte(T4, 'f');
  A.comparer(T4, 'figure', [fig('ebauche')], {});
  e = A.comparer(T4, 'figure', [fig('abandon')], {});
  check('ébauche → annulée : « tombée » (annulée)', e.length === 1 && e[0].type === 'figure_tombee' && e[0].cleEtat === 'abandon', e);
  const T5 = A.suivi(); A.contexte(T5, 'f');
  A.comparer(T5, 'figure', [], {});
  e = A.comparer(T5, 'figure', [fig('confirme', true, 'nouvelle')], {});
  check('une figure qui APPARAÎT déjà validée : rien (le changement n’a pas été vu)', e.length === 0, e);
  const T6 = A.suivi(); A.contexte(T6, 'f');
  A.comparer(T6, 'figure', [fig('dedans')], {});
  e = A.comparer(T6, 'figure', [fig('sans_suite')], {});
  check('en cours → sans suite : « finie »', e.length === 1 && e[0].type === 'figure_finie', e);
}
{
  const sc1 = { id: 's1', rang: '1', forme: 'chemin', cibles: [84300, 86000], invalidation: 82000 };
  const sc2 = { id: 's2', rang: '2', forme: 'range', cibles: [] };
  const S = (sc, cle, k, affiche, haut) => ({ id: sc.id, cle, k: k || 0, haut: !!haut, sc, affiche: affiche !== false });
  const T = A.suivi(); A.contexte(T, 's');
  let e = A.comparer(T, 'scenario', [S(sc1, 'rien')], {});
  check('scénario : la 1re observation est une base', e.length === 0, e);
  e = A.comparer(T, 'scenario', [S(sc1, 'cible', 1)], {});
  check('1re cible touchée', e.length === 1 && e[0].type === 'scenario_cible' && e[0].k === 1, e);
  e = A.comparer(T, 'scenario', [S(sc1, 'cible', 1)], {});
  check('… pas deux fois', e.length === 0, e);
  e = A.comparer(T, 'scenario', [S(sc1, 'cible', 2)], {});
  check('2e cible touchée (k qui monte)', e.length === 1 && e[0].k === 2, e);
  e = A.comparer(T, 'scenario', [S(sc1, 'realise', 2)], {});
  check('réalisé', e.length === 1 && e[0].type === 'scenario_realise', e);
  check('après « réalisé », plus rien', A.comparer(T, 'scenario', [S(sc1, 'invalide', 2)], {}).length === 0, null);
  const T2 = A.suivi(); A.contexte(T2, 's');
  A.comparer(T2, 'scenario', [S(sc1, 'cible', 1, true)], {});
  e = A.comparer(T2, 'scenario', [S(sc1, 'invalide', 1, false)], {});
  check('invalidé (montré à l’image d’avant, plus maintenant : le suivant est montré) : dit', e.length === 1 && e[0].type === 'scenario_tombe', e);
  const T3 = A.suivi(); A.contexte(T3, 's');
  A.comparer(T3, 'scenario', [S(sc2, 'dedans', 0, false)], {});
  e = A.comparer(T3, 'scenario', [S(sc2, 'sortie', 0, false, true)], {});
  check('un scénario jamais montré (Lisible) : rien', e.length === 0, e);
  const T4 = A.suivi(); A.contexte(T4, 's');
  A.comparer(T4, 'scenario', [S(sc2, 'dedans')], {});
  e = A.comparer(T4, 'scenario', [S(sc2, 'sortie', 0, true, true)], {});
  check('range montré : sorti par le haut → « tombé »', e.length === 1 && e[0].type === 'scenario_tombe' && e[0].haut, e);
  const T5 = A.suivi(); A.contexte(T5, 's');
  A.comparer(T5, 'scenario', [S(sc1, 'rien')], {});
  e = A.comparer(T5, 'scenario', [S(sc1, 'ambigu')], {});
  check('indécis (deux niveaux dans le même créneau)', e.length === 1 && e[0].type === 'scenario_indecis', e);
}

// ── 2. La priorité ──
titre('2. Deux changements ensemble : un seul message, le plus important');
{
  const ev = t => ({ type: t });
  const ordre = A.ORDRE;
  check(`l’ordre est documenté et complet (${ordre.join(' > ')})`, ordre.length === 10 && ordre[0] === 'scenario_tombe' && ordre.indexOf('repere_casse') < ordre.indexOf('repere_passe') && ordre.indexOf('figure_tombee') < ordre.indexOf('figure_validee'), ordre);
  const tous = ordre.map(ev).reverse();
  check('choisir : le premier de l’ordre, quel que soit l’ordre d’arrivée', A.choisir(tous).type === ordre[0] && A.choisir([ev('repere_passe'), ev('repere_casse')]).type === 'repere_casse', null);
  check('un message n’est remplacé que par un plus important (ou égal)', A.remplace(ev('repere_passe'), ev('repere_casse')) && !A.remplace(ev('repere_casse'), ev('repere_passe')) && A.remplace(ev('figure_validee'), ev('figure_validee')) && A.remplace(null, ev('figure_finie')), null);
  // Réel : une fermeture de bougie qui casse un repère ET fait tomber le scénario montré.
  const T = A.suivi(); A.contexte(T, 'p');
  A.comparer(T, 'repere', [rep()], O(84000, 1e9)); A.comparer(T, 'scenario', [{ id: 's', cle: 'cible', k: 1, sc: { rang: '1', cibles: [1, 2] }, affiche: true }], {});
  const e = A.comparer(T, 'repere', [rep({ cassure: 'valide', sens: -1 })], O(84000, 1e9 + 1)).concat(A.comparer(T, 'scenario', [{ id: 's', cle: 'invalide', k: 1, sc: { rang: '1', cibles: [1, 2] }, affiche: true }], {}));
  check('repère cassé + scénario invalidé à la même image : un seul message, le scénario', e.length === 2 && A.choisir(e).type === 'scenario_tombe', e.map(x => x.type));
}

// ── 3. Les mots ──
titre('3. Les mots : sans jargon ni conseil en Lisible, sans conseil en Complet, exacts, la ligne du risque');
const K = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'bougies-btcusdt-15m.json'), 'utf8')).bougies;
const H = K.map(k => +k[2]), L = K.map(k => +k[3]), C = K.map(k => +k[4]), Tm = K.map(k => Math.round(k[0] / 1000));
function atrDe(n) {
  const tr = [null];
  for (let i = 1; i < C.length; i++) tr.push(Math.max(H[i] - L[i], Math.abs(H[i] - C[i - 1]), Math.abs(L[i] - C[i - 1])));
  const a = new Array(C.length).fill(null);
  let s = 0; for (let i = 1; i <= n; i++) s += tr[i];
  a[n] = s / n;
  for (let i = n + 1; i < C.length; i++) a[i] = (a[i - 1] * (n - 1) + tr[i]) / n;
  return a;
}
const R = G.detecter({ h: H, l: L, c: C, atr: atrDe(P.guide.atrPeriode), n: C.length - 1 }, P.guide);
const parType = new Map();
for (const f of R.formes.concat(R.ebauches.liste)) { const k = f.type + '|' + G.etatForme(f).cle; if (!parType.has(k)) parType.set(k, f); }
const ITV = ['1m', '5m', '15m', '1h', '4h', '1d'];
const evts = [];
const raisons = [{ cle: 'hier_haut', p: 84145.28, nom: 'Plus haut d’hier' }, { cle: 'sr', p: 105610.4, nom: 'Zone de retour' }, { cle: 'mur_vente', p: 9999.5, nom: 'Mur de vente' }];
for (const r of raisons) for (const s of [1, -1]) for (const type of ['repere_passe', 'repere_casse']) for (const retest of [false, true])
  evts.push({ type, source: 'repere', sens: s, retest, niv: { p: r.p, lo: r.p - 15, hi: r.p + 15, pMin: r.p, pMax: r.p + 120, principale: r, raisons: [r] } });
const TYPE_DE = { confirme: 'figure_validee', atteint: 'figure_atteinte', invalide: 'figure_tombee', abandon: 'figure_tombee', sans_suite: 'figure_finie', oublie: 'figure_finie' };
for (const [k, f] of parType) { const cle = k.split('|')[1]; if (TYPE_DE[cle]) evts.push({ type: TYPE_DE[cle], source: 'figure', f, cleEtat: cle }); }
const sc1 = { rang: '1', forme: 'chemin', cibles: [84300, 86000], invalidation: 82000 }, sc3 = { rang: '3', forme: 'chemin', cibles: [80000], invalidation: null }, scS = { rang: 'S', forme: 'range', cibles: [] };
for (const sc of [sc1, sc3, scS]) {
  for (const k of [1, 2]) evts.push({ type: 'scenario_cible', source: 'scenario', sc, k, cleEtat: 'cible' });
  evts.push({ type: 'scenario_realise', source: 'scenario', sc, k: 2, cleEtat: 'realise' });
  evts.push({ type: 'scenario_tombe', source: 'scenario', sc, k: 0, cleEtat: sc.forme === 'range' ? 'sortie' : 'invalide', haut: true });
  evts.push({ type: 'scenario_indecis', source: 'scenario', sc, k: 0, cleEtat: 'ambigu' });
}
const typesFig = new Set(evts.filter(e => e.source === 'figure').map(e => e.type));
check(`des événements de chaque sorte (${evts.length}, figures de la fixture : ${[...typesFig].join(', ')})`, A.ORDRE.every(t => evts.some(e => e.type === t)), A.ORDRE.filter(t => !evts.some(e => e.type === t)));
const malL = [], malX = [], longs = [], courts = [], nb = [], exact = [], risque = [];
for (const e of evts) for (const itv of ITV) {
  const per = G.PERIODE_DEBUTANT[itv];
  const D = A.textes(e, 'debutant', { unite: '$', itv }), X = A.textes(e, 'expert', { unite: '$', itv });
  const tout = [D.titre].concat(D.variantes, D.texte, [].concat(...(D.resume || []))).join(' \n ');
  if (G.motsBannis(tout).length || CONSEIL.test(tout) || PREVISION.test(tout) || /%/.test(tout)) malL.push({ type: e.type, itv, bannis: G.motsBannis(tout), t: tout.slice(0, 160) });
  const toutX = [X.titre].concat(X.variantes, X.texte).join(' ');
  if (CONSEIL.test(toutX.replace(/pas une recommandation/g, '')) || PREVISION.test(toutX)) malX.push({ type: e.type, t: toutX.slice(0, 160) });
  if (D.variantes.some(v => v.length > P.guide.debutant.evenement)) longs.push({ type: e.type, itv, v: D.variantes.filter(v => v.length > 90) });
  if (!D.variantes.some(v => v.length <= P.guide.debutant.evenementEtroit)) courts.push({ type: e.type, itv, v: D.variantes });
  for (const ph of D.resume || []) for (const v of ph) if (nombresDe(D.titre) + nombresDe(v) > P.guide.debutant.bulleNombres) nb.push({ type: e.type, v });
  if (!D.texte[D.texte.length - 1].startsWith(G.RISQUE) || !X.texte[X.texte.length - 1].startsWith(G.RISQUE) || !/pas une recommandation|ni un conseil/.test(X.texte[X.texte.length - 1] + D.texte[D.texte.length - 1])) risque.push(e.type);
  // Exactitude des mots (la règle du code, dite dans la ligne).
  const v0 = D.variantes[0], cote = e.sens > 0 ? 'au-dessus' : 'en dessous';
  const ok = {
    repere_casse: () => v0.includes('cassé') && v0.includes(per[1] + ' ont fini ' + cote) && /c’est validé/.test(v0) && X.variantes[0].includes(e.retest ? 'validé par un retour réussi' : '2/2 clôtures, validé'),
    repere_passe: () => D.variantes.some(v => v.includes('cassé seulement si ' + per[1] + ' finissent ' + cote)) && D.variantes.slice(1).every(v => /pas encore cassé/.test(v)) && /bougie pas encore close/.test(X.variantes[0]),
    figure_validee: () => /validée?(?!\p{L})/u.test(v0) && v0.includes(per[1] + ' ont fini ') && X.variantes[0].includes(G.etatForme(e.f).texte),
    figure_tombee: () => (e.cleEtat === 'abandon' ? /annulé : la figure ne s’est pas formée\./.test(v0) : /invalidé : le prix a fini au-delà du niveau qui l’annule\./.test(v0)) && X.variantes[0].includes(G.etatForme(e.f).texte),
    figure_atteinte: () => v0.includes('cible atteinte, ' + per[0] + ' a fini à la cible ou au-delà.'),
    figure_finie: () => /sans suite : le prix (?:n’en est pas sorti à temps|est resté dedans jusqu’à la pointe)\.|: délai écoulé, ni la cible ni l’invalidation n’ont été atteintes\./.test(v0),
    scenario_cible: () => v0.includes((e.k === 1 ? '1re' : e.k + 'e') + ' cible touchée, le prix a atteint sa zone.'),
    scenario_realise: () => /réalisé : le prix a touché (?:ses \d cibles dans l’ordre|sa cible)(?:, avant l’invalidation)?\./.test(v0) && (e.sc.invalidation === null || e.sc.invalidation === undefined) === !/avant l’invalidation/.test(v0),
    scenario_tombe: () => (e.cleEtat === 'sortie' ? /sorti : le prix a quitté ses bornes par le haut\./ : /invalidé : le prix a touché son invalidation avant la (?:dernière )?cible\./).test(v0),
    scenario_indecis: () => /indécis : deux de ses niveaux touchés en même temps, ordre inconnu\./.test(v0),
  }[e.type];
  if (!ok || !ok()) exact.push({ type: e.type, itv, v0, x: X.variantes[0] });
}
check('Lisible : aucun mot banni, aucun conseil, aucune prévision (ni « rebond »), aucun « % » — ligne, titre, bulle, résumé', !malL.length, malL.slice(0, 3));
check('Complet : aucun conseil, aucune prévision', !malX.length, malX.slice(0, 3));
check(`Lisible : chaque variante de la ligne en ${P.guide.debutant.evenement} caractères au plus (la phrase)`, !longs.length, longs.slice(0, 3));
check(`Lisible : toujours une variante de ${P.guide.debutant.evenementEtroit} caractères au plus (téléphone)`, !courts.length, courts.slice(0, 3));
check(`Lisible : chaque phrase du résumé, titre compris, ${P.guide.debutant.bulleNombres} nombres au plus`, !nb.length, nb.slice(0, 3));
check('les deux modes : le dernier paragraphe commence par la ligne du risque, puis « pas une recommandation » ou « ni un conseil »', !risque.length, [...new Set(risque)]);
check('les mots sont EXACTS (la règle du code dite dans la ligne : « cassé » = 2 fins au-delà, « validé », « invalidé », « touchée »…) pour chaque intervalle', !exact.length, exact.slice(0, 3));
{
  const D = A.textes({ type: 'repere_casse', source: 'repere', sens: 1, niv: evts[0].niv }, 'debutant', { unite: '$', itv: '15m' });
  check(`exemple Lisible : « ${D.variantes[0]} »`, D.variantes[0] === 'Le prix a cassé 84 145 $ : 2 quarts d’heure ont fini au-dessus, c’est validé.', D.variantes);
  const Pz = A.textes({ type: 'repere_passe', source: 'repere', sens: -1, niv: evts[0].niv }, 'debutant', { unite: '$', itv: '1h' });
  check(`exemple Lisible : « ${Pz.variantes[0]} » / « ${Pz.variantes[1]} »`, Pz.variantes[0] === 'Prix sous 84 145 $ : cassé seulement si 2 heures finissent en dessous.' && Pz.variantes[1] === 'Prix sous 84 145 $ : pas encore cassé.', Pz.variantes);
  check('un RSI bas n’annonce jamais un rebond : aucun texte d’événement ne nomme le RSI ni un rebond', evts.every(e => !/RSI|rebond/i.test(JSON.stringify(A.textes(e, 'debutant', { unite: '$', itv: '15m' })) + JSON.stringify(A.textes(e, 'expert', { unite: '$', itv: '15m' })))), null);
}

// ── 4. La ligne du risque dans les bulles de figure ──
titre('4. La ligne du risque : la même, dans chaque bulle de figure (en cours, passée ; Lisible et Complet)');
{
  check(`Guide.RISQUE : « ${G.RISQUE} » (personne ne sait prédire, rien n’est promis)`, /^Personne ne sait prédire le prix : rien n’est promis\.$/.test(G.RISQUE) && !G.motsBannis(G.RISQUE).length, G.RISQUE);
  const ctx = { n: R.n, intervalle: '15m', duree: 3600, temps: Tm, pas: 900, maintenant: (Tm[Tm.length - 1] + 540) * 1000, j: C.length - 1, horizon: P.guide.horizon };
  const mal = [];
  let n = 0;
  for (const f of R.formes.concat(R.ebauches.liste)) {
    const b = R.bilan[f.type];
    const T1 = G.texteFormeDebutant(f, b, ctx, P.guide, '$'), T2 = G.texteFormeExpert(f, b, ctx, P.guide, '$', {});
    const dern = t => t[t.length - 1];
    if (!dern(T1).startsWith(G.RISQUE) || !dern(T2).startsWith(G.RISQUE)) mal.push(f.type + ' en cours');
    if (f.fin && !f.ebauche) {
      const p1 = G.texteFigurePassee(f, b, ctx, P.guide, '$', 'debutant', []), p2 = G.texteFigurePassee(f, b, ctx, P.guide, '$', 'expert', []);
      if (!dern(p1.texte).startsWith(G.RISQUE) || !dern(p2.texte).startsWith(G.RISQUE)) mal.push(f.type + ' passée');
    }
    n++;
  }
  check(`${n} figures de la fixture : le dernier paragraphe de chaque bulle (en cours et passée, Lisible et Complet) commence par la ligne du risque`, n > 50 && !mal.length, mal.slice(0, 5));
  // Le résumé du Lisible : elle ne compte pas comme un avertissement à ôter, ni comme des nombres.
  const estAv = vm.runInContext('estAvertissement', PAGE);
  check('la ligne du risque devant l’avertissement : le paragraphe reste un avertissement (le résumé l’ôte comme avant), sans nombre', estAv(G.RISQUE + ' Une lecture débattue, pas une prévision ni un conseil.') && nombresDe(G.RISQUE) === 0, null);
}

// ── 5. « Nouveau » ──
titre('5. « Nouveau » : la mémoire des natures lues, une marque à la fois, sans stockage aussi');
{
  const magasin = () => { const m = {}; return { m, getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); } }; };
  const S = magasin();
  check(`clé versionnée, propre à cette mémoire (« ${A.CLE_VUS} », « ${A.CLE_CHOIX} »)`, /-v\d+$/.test(A.CLE_VUS) && /-v\d+$/.test(A.CLE_CHOIX) && A.CLE_VUS !== A.CLE_CHOIX && !/astuce|mode|theme/.test(A.CLE_VUS), null);
  let vus = A.lireVus(S);
  check('premier passage : rien de lu', vus.size === 0, [...vus]);
  const cands = [{ cle: 'figure:double_creux' }, { cle: 'repere:hier_haut' }, { cle: 'phrase' }, { cle: 'repere:sr' }, { cle: 'evenement:repere_casse' }];
  check('une seule marque, la première nature de l’ordre (la phrase d’abord)', A.choisirMarque(cands, vus).cle === 'phrase', A.choisirMarque(cands, vus));
  check('lue : noterVu → true, puis false (une fois)', A.noterVu(vus, 'phrase', S) === true && A.noterVu(vus, 'phrase', S) === false, null);
  check('la marque passe à la suivante (un repère, dans l’ordre de l’écran)', A.choisirMarque(cands, vus).cle === 'repere:hier_haut', A.choisirMarque(cands, vus));
  check(`gardée dans le stockage (${A.CLE_VUS} = ${S.m[A.CLE_VUS]}) et relue au rechargement`, JSON.parse(S.m[A.CLE_VUS]).includes('phrase') && A.lireVus(S).has('phrase'), S.m);
  for (const c of cands) A.noterVu(vus, c.cle, S);
  check('tout lu : plus aucune marque', A.choisirMarque(cands, vus) === null, null);
  const leve = { getItem() { throw new Error('bloqué'); }, setItem() { throw new Error('bloqué'); } };
  let okLeve = true;
  try { const v = A.lireVus(leve); A.noterVu(v, 'phrase', leve); okLeve = v.has('phrase') && A.lireChoix(leve).evenements === true && A.noterChoix({ evenements: false, marques: true }, leve) === false; } catch (e) { okLeve = false; }
  check('stockage qui lève (navigation privée) : rien ne casse, la mémoire de la page suffit', okLeve, null);
  check('stockage absent (null) : rien ne casse', A.lireVus(null).size === 0 && A.noterVu(new Set(), 'x', null) === true, null);
  const abime = { getItem: () => '{pas du json', setItem() {} };
  check('stockage illisible : vide, sans erreur', A.lireVus(abime).size === 0 && A.lireChoix(abime).marques === true, null);
  const S2 = magasin();
  check('Complet : les deux aides allumées d’origine', JSON.stringify(A.lireChoix(S2)) === JSON.stringify({ evenements: true, marques: true }), A.lireChoix(S2));
  A.noterChoix({ evenements: false, marques: false }, S2);
  check('un clic coupe : le choix est gardé (relu tel quel)', JSON.stringify(A.lireChoix(S2)) === JSON.stringify({ evenements: false, marques: false }) && /"evenements":false/.test(S2.m[A.CLE_CHOIX]), S2.m);
}

// ── 6. La page ──
titre('6. La page : paramètres et chargement');
{
  check('PARAM.apprendre : durées (Lisible plus longue que Complet), passage, rayons des marques (Complet plus discret)', P.apprendre && P.apprendre.dureeLisible > P.apprendre.dureeComplet && P.apprendre.dureeComplet >= 4000 && P.apprendre.passageMs >= 60000 && P.apprendre.marqueComplet < P.apprendre.marque, P.apprendre);
  check('la ligne du Lisible a la limite de la phrase (90, 48 au téléphone)', P.guide.debutant.evenement === P.guide.debutant.phrase && P.guide.debutant.evenementEtroit === P.guide.debutant.phraseEtroit, P.guide.debutant);
  const html = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8');
  const iA = html.indexOf('<script defer src="js/apprendre.js"'), iG = html.indexOf('<script defer src="js/guide.js"'), iApp = html.indexOf('<script defer src="js/app.js"');
  check('index.html charge js/apprendre.js après le Guide, avant app.js', iA > iG && iA < iApp, { iA, iG, iApp });
  const src = fs.readFileSync(path.join(REPO, 'js/apprendre.js'), 'utf8');
  check('js/apprendre.js : aucun regard en arrière dans une expression régulière', !/\(\?<[=!]/.test(src), null);
  // Les mêmes règles que le bloc de dessin du Guide et des scénarios (test_guide, test_scenarios) :
  // ni conseil ni intention prêtée ; rien ne tourne au repos — le cœur n'a aucune minuterie, la page
  // une seule, celle qui efface le message en cours (posée à l'annonce, reposée si sa bulle est ouverte).
  const ACCUSE = /spoof|manipul|leurre|tromper|tromperie|faux (?:mur|ordre)s?|fake|bluff|pi[eè]ge/i;
  check('js/apprendre.js : ni conseil ni intention prêtée, même en commentaire ; aucune minuterie', !CONSEIL.test(src) && !ACCUSE.test(src) && !/setInterval|setTimeout/.test(src),
    [(src.match(CONSEIL) || [])[0], (src.match(ACCUSE) || [])[0]]);
  const app = fs.readFileSync(path.join(REPO, 'js/app.js'), 'utf8'), i0 = app.indexOf('// APPRENDRE EN SE SERVANT DU SITE'), i1 = app.indexOf('// ============ SAMSARA ============');
  const bloc = app.slice(i0, i1), minuteries = bloc.match(/set(?:Timeout|Interval)\([^;]*/g) || [];
  check('js/app.js, bloc « Apprendre » : ni conseil ni intention prêtée ; aucune minuterie au repos (deux setTimeout, ceux du message en cours ; aucun setInterval)',
    i0 > 0 && i1 > i0 && bloc.length > 5000 && !CONSEIL.test(bloc) && !ACCUSE.test(bloc) && minuteries.length === 2 && minuteries.every(m => /^setTimeout\(apprVerifierFin, /.test(m))
    && /function apprAnnoncer[\s\S]*?apprMinuterie = setTimeout\(apprVerifierFin/.test(bloc) && /function apprVerifierFin[\s\S]*?if \(!m\) return;/.test(bloc), { minuteries, conseil: (bloc.match(CONSEIL) || [])[0], accuse: (bloc.match(ACCUSE) || [])[0] });
  check('dans la page, le cœur est chargé (Apprendre.suivi) et sa mémoire lue', vm.runInContext('typeof Apprendre === "object" && apprVus instanceof Set && typeof apprCalque === "function"', PAGE) === true, null);
}

console.log(ko ? `\n❌ APPRENDRE : ${ko} contrôle(s) en échec` : '\n✅ APPRENDRE : TOUS LES CONTRÔLES PASSENT');
process.exit(ko ? 1 : 0);
