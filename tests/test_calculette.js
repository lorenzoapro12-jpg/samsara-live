// La calculette de risque (plan du site du 13/10/2026, idée 7) : le cœur pur, hors navigateur.
//
//   1. LECTURE DES NOMBRES : « 83 200,5 », « 83200.5 », « 83,200.5 », « 1.000.000 », « 1,5 % »… ;
//      vide ou illisible → null.
//   2. CALCUL sur l'exemple du jour (capital 10 000 $, 1 %, stop 80 197, paliers 82 152 / 81 759 /
//      81 365) : q = 100 / 4 685 ≈ 0,02134 BTC par palier, perte 100 $ si tout se remplit puis que le
//      stop saute, prix moyen, mise ; la vente (stop au-dessus de tous) ; les lignes vides ignorées.
//   3. ERREURS : chaque champ manquant ou illisible, un stop mélangé ou égal à un palier → un message
//      clair, pas de calcul.
//   4. MOTS : des phrases courtes (15 mots au plus), aucun mot interdit du Lisible (ni « ratio »),
//      aucun conseil ; la quantité affichée arrondie vers le bas (la perte ne dépasse jamais la part).
//   5. LA PAGE : la part de départ dans PARAM ; le bloc « Outils » juste avant les « Réglages
//      fins » (qui restent le dernier bloc), dans les deux modes ; aucun stockage dans le fichier.
//
// USAGE   node tests/test_calculette.js
const fs = require('fs'), path = require('path'), vm = require('vm');
const REPO = path.resolve(__dirname, '..');
const C = require(path.join(REPO, 'js', 'calculette.js'));
const Guide = require(path.join(REPO, 'js', 'guide.js'));
const { chargerPage } = require('./bac');

let ko = 0;
const check = (nom, ok, det) => { if (!ok) ko++; console.log(`  ${ok ? '✓' : '✗'} ${nom}${!ok && det !== undefined ? ' — ' + JSON.stringify(det).slice(0, 400) : ''}`); };
const titre = t => console.log(`\n── ${t} ──`);
const proche = (a, b, e) => Math.abs(a - b) <= (e || 1e-9) * Math.max(1, Math.abs(b));
const CONSEIL = /\b(achetez|vendez|achète[rz]?\b|vends\b|il faut (?:acheter|vendre)|entrez|sortez|prenez position|signal d['’]achat|signal de vente|recommand(?:e|ons)|plac(?:er|ez?|ent)\s+(?:un|des|les|leurs?|ses|vos|votre)\s+stops?|dimensionn)/i;
const mots = t => t.replace(/[«»().,:;!?]/g, ' ').split(/\s+/).filter(m => /[\p{L}\p{N}]/u.test(m) && m !== '%' && m !== '$');
const phrases = t => t.split(/(?<=[.!?])\s+/).filter(Boolean);

// ── 1. Lecture des nombres ──
titre('1. Les nombres tapés : à la française comme à l’anglaise');
const LECTURES = [['83 200,5', 83200.5], ['83200.5', 83200.5], ['83 200', 83200], ['83 200,5', 83200.5], ['83 200', 83200], ['83,200.5', 83200.5], ['83.200,5', 83200.5],
  ['1.000.000', 1000000], ['1,000,000', 1000000], ['0,0214', 0.0214], ['1', 1], ['1,5 %', 1.5], ['0.5%', 0.5], ['83 200 $', 83200], ['$83200', 83200], [',5', 0.5], ['5.', 5],
  ['−5', -5], ['-5', -5], [80197, 80197], ['', null], ['   ', null], [null, null], [undefined, null], ['abc', null], ['8e4', null], ['1,2,3', null], ['82 152,5,1', null], ['12a', null], [NaN, null]];
const malLus = LECTURES.filter(([t, v]) => C.lireNombre(t) !== v).map(([t, v]) => [t, v, C.lireNombre(t)]);
check(`${LECTURES.length} écritures : « 83 200,5 », « 83200.5 », espaces insécables, milliers « 1.000.000 », unités « $ » et « % » ; vide ou illisible → null`, !malLus.length, malLus);

// ── 2. Calcul ──
titre('2. Le calcul : l’exemple du jour, puis la vente');
const EX = { capital: '10 000', part: '1', stop: '80 197', paliers: ['82 152', '81 759', '81 365'] };
const r = C.calculer(EX);
const ECART = (82152 - 80197) + (81759 - 80197) + (81365 - 80197);   // 1 955 + 1 562 + 1 168 = 4 685
check('achat (stop sous les trois paliers), 3 paliers, écart total 4 685 $', r.ok && r.sens === 1 && r.n === 3 && proche(r.ecart, ECART) && ECART === 4685, r);
check('quantité par palier = 100 $ / 4 685 $ ≈ 0,021345 BTC (environ 0,0213 à 0,0214)', proche(r.quantite, 100 / 4685) && r.quantite > 0.0213 && r.quantite < 0.0214, r.quantite);
check('perte si tout se remplit puis que le stop saute = 100 $ = 1 % du capital', proche(r.perte, 100) && proche(r.quantite * ECART, 100) && proche(r.part, 0.01), r);
check('prix moyen = moyenne des paliers (81 758,67) ; mise = q × somme des prix (≈ 5 235 $, 52 % du capital)',
  proche(r.prixMoyen, (82152 + 81759 + 81365) / 3) && proche(r.mise, r.quantite * (82152 + 81759 + 81365)) && proche(r.partMise, r.mise / 10000) && Math.round(r.mise) === 5235, r);
const T = C.textes(r, { base: 'BTC', unite: '$' }), L = Object.fromEntries(T.lignes);
check('les lignes : sens, quantité (0,02134 BTC ≈ 1 745 $), prix moyen 81 759 $, perte 100 $ (1 %), mise 5 235 $ (52 %)',
  L['Sens'] === 'achat (stop dessous)' && L['Quantité par palier'] === '0,02134 BTC (≈ 1 745 $)' && L['Prix moyen, tout rempli'] === '81 759 $'
  && L['Perte au stop, tout rempli'] === '100 $ (1 % du capital)' && L['Mise, tout rempli'] === '5 235 $ (52 % du capital)', T.lignes);
check('le rappel : « Le 1 % est la perte, pas la mise. Un trou de prix sous le stop coûterait plus. »', T.rappel === 'Le 1 % est la perte, pas la mise. Un trou de prix sous le stop coûterait plus.', T.rappel);
{
  const q = C.quantiteAffichee(r.quantite);
  check('la quantité affichée est arrondie VERS LE BAS (0,02134, pas 0,02135) : la perte affichée ne dépasse jamais la part', q.v === 0.02134 && q.d === 5 && q.v * ECART <= 100, q);
  const grand = C.quantiteAffichee(123.456789), petit = C.quantiteAffichee(0.000123456);
  check('4 chiffres utiles quelle que soit la taille (123,4 ; 0,0001234)', grand.v === 123.4 && grand.d === 1 && petit.v === 0.0001234 && petit.d === 7, [grand, petit]);
}
const nombres = C.calculer({ capital: 10000, part: 1, stop: 80197, paliers: [82152, 81759, 81365] });
check('des nombres au lieu du texte : le même calcul', nombres.ok && proche(nombres.quantite, r.quantite) && proche(nombres.mise, r.mise), nombres);
const vides = C.calculer(Object.assign({}, EX, { paliers: ['82 152', '', '81 759', '  ', '81 365'] }));
check('les lignes de palier vides sont ignorées', vides.ok && vides.n === 3 && proche(vides.quantite, r.quantite), vides);
const un = C.calculer({ capital: '10 000', part: '1', stop: '80 000', paliers: ['82 000'] });
check('un seul palier : 100 $ / 2 000 $ = 0,05 BTC, prix moyen = le palier', un.ok && proche(un.quantite, 0.05) && proche(un.prixMoyen, 82000) && proche(un.mise, 4100), un);
const v = C.calculer({ capital: '10 000', part: '0,5', stop: '86 000', paliers: ['84 000', '85 000'] });
const Tv = C.textes(v, { base: 'BTC', unite: '$' }), Lv = Object.fromEntries(Tv.lignes);
check('vente : stop au-dessus de tous les paliers, q = 50 $ / (2 000 + 1 000) $, perte 50 $ (0,5 %)',
  v.ok && v.sens === -1 && proche(v.quantite, 50 / 3000) && proche(v.perte, 50) && Lv['Sens'] === 'vente (stop au-dessus)' && Lv['Perte au stop, tout rempli'] === '50 $ (0,5 % du capital)', [v, Tv.lignes]);
check('vente : le rappel dit « au-dessus du stop » et la part choisie (« Le 0,5 % … »)', Tv.rappel === 'Le 0,5 % est la perte, pas la mise. Un trou de prix au-dessus du stop coûterait plus.', Tv.rappel);
const sol = C.textes(C.calculer({ capital: '50', part: '2', stop: '1 800', paliers: ['1 900'] }), { base: 'BTC', unite: 'SOL' });
check('BTC/SOL : capital et prix en SOL, quantité en BTC', /^0,01 BTC \(≈ 19 SOL\)$/.test(Object.fromEntries(sol.lignes)['Quantité par palier']) && /SOL \(2 % du capital\)$/.test(Object.fromEntries(sol.lignes)['Perte au stop, tout rempli']), sol.lignes);

// ── 3. Erreurs ──
titre('3. Rien à calculer : un message clair');
const ERREURS = [
  [{}, 'vide'], [{ part: '1', paliers: ['', ''] }, 'vide'],
  [{ part: '1', stop: '80 000', paliers: ['82 000'] }, 'capital_vide'], [{ capital: 'dix', part: '1', stop: '80 000', paliers: ['82 000'] }, 'capital_illisible'],
  [{ capital: '0', part: '1', stop: '80 000', paliers: ['82 000'] }, 'capital_nul'], [{ capital: '-100', part: '1', stop: '80 000', paliers: ['82 000'] }, 'capital_nul'],
  [{ capital: '10 000', part: '', stop: '80 000', paliers: ['82 000'] }, 'part_vide'], [{ capital: '10 000', part: 'x', stop: '80 000', paliers: ['82 000'] }, 'part_illisible'],
  [{ capital: '10 000', part: '0', stop: '80 000', paliers: ['82 000'] }, 'part_hors'], [{ capital: '10 000', part: '120', stop: '80 000', paliers: ['82 000'] }, 'part_hors'],
  [{ capital: '10 000', part: '1', paliers: ['82 000'] }, 'stop_vide'], [{ capital: '10 000', part: '1', stop: '80 000 x', paliers: ['82 000'] }, 'stop_illisible'],
  [{ capital: '10 000', part: '1', stop: '0', paliers: ['82 000'] }, 'stop_nul'],
  [{ capital: '10 000', part: '1', stop: '80 000', paliers: [] }, 'paliers_vide'], [{ capital: '10 000', part: '1', stop: '80 000', paliers: ['', ' '] }, 'paliers_vide'],
  [{ capital: '10 000', part: '1', stop: '80 000', paliers: ['82 000', 'beaucoup'] }, 'palier_illisible'], [{ capital: '10 000', part: '1', stop: '80 000', paliers: ['-82 000'] }, 'palier_nul'],
  [{ capital: '10 000', part: '1', stop: '82 000', paliers: ['82 152', '81 759'] }, 'melange'], [{ capital: '10 000', part: '1', stop: '81 759', paliers: ['82 152', '81 759'] }, 'melange'],
];
const malErr = ERREURS.map(([e, code]) => [code, C.calculer(e)]).filter(([code, x]) => x.ok || x.code !== code || !x.message);
check(`${ERREURS.length} cas : un code et un message, jamais un calcul (champ vide, illisible, nul, part hors de 0–100 %, stop entre les paliers ou égal à l’un d’eux)`, !malErr.length, malErr);
const m2 = C.calculer({ capital: '10 000', part: '1', stop: '80 000', paliers: ['82 000', 'beaucoup'] });
check('le message nomme le palier fautif (« Le palier 2 n’est pas un nombre lisible. »)', m2.message === 'Le palier 2 n’est pas un nombre lisible.' && m2.index === 1, m2);
const mel = C.calculer({ capital: '10 000', part: '1', stop: '82 000', paliers: ['82 152', '81 759'] });
check('stop mélangé : « Le stop doit être sous tous les paliers (achat) ou au-dessus de tous (vente). »', mel.message === 'Le stop doit être sous tous les paliers (achat) ou au-dessus de tous (vente).', mel.message);
const Te = C.textes(mel, {});
check('sans calcul, aucune ligne de résultat ni rappel : le message seul', Te.message === mel.message && !Te.lignes.length && !Te.rappel, Te);

// ── 4. Mots ──
titre('4. Les mots : courts, ceux du Lisible, jamais un conseil');
const TOUS = [C.PHRASE, C.PIED, T.rappel, Tv.rappel, ...T.lignes.flat(), ...Tv.lignes.flat(), ...Object.values(C.MESSAGES).map(m => (typeof m === 'function' ? m(2) : m)),
  'Calculette de risque', 'Capital ($)', 'Part risquée (%)', 'Stop (prix)', 'Paliers (prix)', 'Palier 1', 'Ajouter un palier', 'Retirer', 'Outils'];
const longues = TOUS.flatMap(phrases).filter(p => mots(p).length > 15);
check('une idée par phrase, 15 mots au plus', !longues.length, longues);
const bannis = TOUS.filter(t => Guide.motsBannis(t).length || /ratio/i.test(t));
check('aucun mot interdit du Lisible (Guide.MOTS_BANNIS_DEBUTANT), ni « ratio »', !bannis.length, bannis);
const conseils = TOUS.filter(t => CONSEIL.test(t));
check('aucun conseil (« entrez », « achetez », « placez votre stop »…), ni « achet » / « vend »', !conseils.length && !TOUS.some(t => /achet|vend/i.test(t)), conseils);
check('la phrase de tête dit ce qu’elle fait : la taille de chaque palier, la part risquée si tous se remplissent puis que le stop saute',
  /taille de chaque palier/.test(C.PHRASE) && /tous se remplissent/.test(C.PHRASE) && /stop saute/.test(C.PHRASE) && /part risquée/.test(C.PHRASE), C.PHRASE);
check('le pied : « Un calcul, pas un conseil. »', C.PIED === 'Un calcul, pas un conseil.', C.PIED);

// ── 5. La page ──
titre('5. La page : la part de départ dans PARAM, le bloc « Outils », aucun stockage');
const src = fs.readFileSync(path.join(REPO, 'js', 'calculette.js'), 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
check('js/calculette.js n’écrit ni ne lit aucun stockage (localStorage, sessionStorage, IndexedDB, cookie)', !/localStorage|sessionStorage|indexedDB|document\.cookie/.test(src));
const html = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8');
const ordre = [...html.matchAll(/<script defer src="(js\/[^"]+)"/g)].map(m => m[1]);
check('index.html charge js/calculette.js avant js/app.js, qui reste le dernier', ordre.includes('js/calculette.js') && ordre.indexOf('js/calculette.js') < ordre.indexOf('js/app.js') && ordre[ordre.length - 1] === 'js/app.js', ordre.slice(-4));
for (const [nom, stock] of [['Lisible', {}], ['Complet', { 'samsara-mode': 'expert' }]]) {
  const page = chargerPage({ stockage: stock });
  vm.runInContext('buildDropdown()', page.sandbox);
  const panneau = page.T.el('indMenu').innerHTML, o = panneau.indexOf('class="aff-outils"'), f = panneau.indexOf('<details class="aff-fins"');
  const bloc = o >= 0 ? panneau.slice(o, f) : '';
  check(`${nom} : « Outils » juste avant les « Réglages fins » (après la dernière ligne d’indicateur), un bouton .aff-btn « Calculette de risque » qui ouvre la calculette`,
    o > panneau.lastIndexOf('data-ind=') && f > o && /^class="aff-outils"[^>]*>(?:(?!<div|<label|<details)[\s\S])*<\/div>$/.test(bloc)
    && /<button type="button" class="aff-btn aff-calculette" onclick="ouvrirCalculetteMenu\(\)"[^>]*>Calculette de risque<\/button>/.test(bloc) && !/data-ind=|data-cat=/.test(bloc), bloc);
  if (nom === 'Lisible') {
    check('PARAM.risque : la part de départ (1 %) et 5 paliers au plus', page.T.PARAM.risque && page.T.PARAM.risque.part === 1 && page.T.PARAM.risque.paliersMax === 5, page.T.PARAM.risque);
    const appel = vm.runInContext('typeof ouvrirCalculette === "function" && typeof ouvrirCalculetteMenu === "function" && typeof Calculette === "object"', page.sandbox);
    check('le cœur et le panneau chargés dans la page (Calculette, ouvrirCalculette, ouvrirCalculetteMenu)', appel);
    const avant = JSON.stringify(page.stockage);
    vm.runInContext('ouvrirCalculette(null)', page.sandbox);
    const p = page.T.el('fichePop').innerHTML;
    check('ouvrirCalculette : la tête d’abord (« Calculette de risque », ×), la phrase, les champs, le pied ; la part de départ « 1 » ; rien d’écrit dans le stockage',
      /^<div class="fiche-tete"><h3 class="fiche-titre">Calculette de risque<\/h3><button type="button" class="fiche-fermer"/.test(p) && p.includes(C.PHRASE.replace(/’/g, '’'))
      && /id="calcPart"[^>]*value="1"/.test(p) && /<p class="fiche-pied">Un calcul, pas un conseil\.<\/p>$/.test(p) && (p.match(/inputmode="decimal"/g) || []).length === 4
      && JSON.stringify(page.stockage) === avant, p.slice(0, 300));
  }
}

console.log(ko ? `\n❌ CALCULETTE : ${ko} contrôle(s) en échec` : '\n✅ CALCULETTE : TOUS LES CONTRÔLES PASSENT');
process.exit(ko ? 1 : 0);
