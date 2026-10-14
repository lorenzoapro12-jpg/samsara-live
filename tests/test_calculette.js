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
//   6. REVUE DU 14/10 (C5, M1, N2) : une mise plus grande que le capital est dite (« × 8,3 », il
//      faudrait emprunter), sans conseil, et seulement au-delà du capital ; jamais « 0,00 % » ; le
//      stop redit avec son écart au prix moyen ; les nombres réécrits « 80 000 » en quittant un
//      champ (même nombre relu) ; « palier », « stop » et « part risquée » dits en mots simples.
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
check('sans calcul, aucune ligne de résultat, ni alerte, ni rappel : le message seul', Te.message === mel.message && !Te.lignes.length && !Te.alerte && !Te.rappel, Te);

// ── 4. Mots ──
titre('4. Les mots : courts, ceux du Lisible, jamais un conseil');
// Revue du 14/10 : les noms des champs disent ce qu'ils veulent dire (N2), et la ligne d'alerte d'une
// mise plus grande que le capital (C5) passe par les mêmes règles de mots.
const ALERTE = C.textes(C.calculer({ capital: '10 000', part: '1', stop: '82 900', paliers: ['83 000'] }), { base: 'BTC', unite: '$' });
const TOUS = [C.PHRASE, C.PIED, T.rappel, Tv.rappel, ALERTE.alerte || '', ...T.lignes.flat(), ...Tv.lignes.flat(), ...Object.values(C.MESSAGES).map(m => (typeof m === 'function' ? m(2) : m)),
  'Calculette de risque', 'Capital ($)', ...Object.values(C.NOMS).map(n => n.join(' ')), 'Palier 1', 'Ajouter un palier', 'Retirer', 'Outils'];
const longues = TOUS.flatMap(phrases).filter(p => mots(p).length > 15);
check('une idée par phrase, 15 mots au plus', !longues.length, longues);
const bannis = TOUS.filter(t => Guide.motsBannis(t).length || /ratio/i.test(t));
check('aucun mot interdit du Lisible (Guide.MOTS_BANNIS_DEBUTANT), ni « ratio »', !bannis.length, bannis);
const conseils = TOUS.filter(t => CONSEIL.test(t));
check('aucun conseil (« entrez », « achetez », « placez votre stop »…), ni « achet » / « vend »', !conseils.length && !TOUS.some(t => /achet|vend/i.test(t)), conseils);
// Revue du 14/10 (textes-14, N2) : « le prix touche le stop » remplace « le stop saute », pas expliqué
// (« Une fois tout rempli » au lieu de « Si tous se remplissent puis que » : 15 mots au plus).
check('la phrase de tête dit ce qu’elle fait : la taille de chaque palier, la part risquée une fois tout rempli si le prix touche le stop',
  /taille de chaque palier/.test(C.PHRASE) && /tout rempli/.test(C.PHRASE) && /si le prix touche le stop/.test(C.PHRASE) && !/stop saute/.test(C.PHRASE) && /part risquée/.test(C.PHRASE), C.PHRASE);
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
    // Revue du 14/10 (N2) : chaque mot dit dans l'étiquette même, pas une ligne d'aide de plus.
    check('les étiquettes disent les mots : « Part risquée (% du capital perdu au stop) », « Stop (prix où la perte est coupée) », « Paliers (prix où un ordre attend) »',
      /<label class="calc-nom" for="calcPart">Part risquée <span class="calc-def">\(% du capital perdu au stop\)<\/span><\/label>/.test(p)
      && /<label class="calc-nom" for="calcStop">Stop <span class="calc-def">\(prix où la perte est coupée\)<\/span><\/label>/.test(p)
      && /<legend class="calc-legende">Paliers <span class="calc-def">\(prix où un ordre attend\)<\/span><\/legend>/.test(p)
      && !/calc-aide|<small/.test(p), p.slice(p.indexOf('calc-champs'), p.indexOf('calc-champs') + 900));
    // Revue du 14/10 (M1, vA-9) : en quittant un champ (« change »), « 80000 » devient « 80 000 ».
    check('le panneau réécrit un champ à sa sortie (« change » sur .calc → calculetteSortie)', /<div class="calc"[^>]*onchange="calculetteSortie\(event\)"/.test(p)
      && vm.runInContext('typeof calculetteSortie === "function"', page.sandbox));
  }
}

// ── 6. Revue du 14/10 ──
titre('6. Revue du 14/10 : mise au-delà du capital, stop redit, « 80 000 », mots expliqués');
{
  // C5 (vision-3) : stop 100 $ sous un palier à 83 000 → mise 83 000 $, 830 % du capital.
  const L8 = Object.fromEntries(ALERTE.lignes);
  check('mise de 830 % du capital : la ligne d’alerte « La mise dépasse le capital (× 8,3). Tout remplir demande d’emprunter (effet de levier). »',
    L8['Mise, tout rempli'] === '83 000 $ (830 % du capital)' && ALERTE.alerte === 'La mise dépasse le capital (× 8,3). Tout remplir demande d’emprunter (effet de levier).', [ALERTE.lignes, ALERTE.alerte]);
  // C5 (fonctionnement-7) : le cas courant, deux paliers et un stop 1 000 $ sous le premier → 110 %.
  const courant = C.textes(C.calculer({ capital: '10 000', part: '1', stop: '82 000', paliers: ['83 000', '82 500'] }), {});
  check('cas courant (paliers 83 000 et 82 500, stop 82 000) : 110 % du capital, alerte « × 1,1 »',
    Object.fromEntries(courant.lignes)['Mise, tout rempli'] === '11 033 $ (110 % du capital)' && /^La mise dépasse le capital \(× 1,1\)\./.test(courant.alerte), [courant.lignes, courant.alerte]);
  const extreme = C.textes(C.calculer({ capital: '10 000', part: '1', stop: '82 990', paliers: ['83 000'] }), {});
  check('stop à 10 $ du palier : « × 83 » (8 300 %)', /\(× 83\)/.test(extreme.alerte), extreme.alerte);
  // Pas d'alerte quand la mise tient dans le capital, même tout juste (100 % pile).
  const pile = C.calculer({ capital: '10 000', part: '1', stop: '79 200', paliers: ['80 000'] }), Tp = C.textes(pile, {});
  check('aucune alerte à 52 % (l’exemple du jour), ni à 100 % pile du capital', !T.alerte && !Tv.alerte && proche(pile.partMise, 1) && !Tp.alerte, [T.alerte, pile.partMise, Tp.alerte]);
  check('l’alerte dit le fait, sans conseil (ni « trop proche », ni « réduisez », ni « éloignez »)',
    !CONSEIL.test(ALERTE.alerte) && !/trop proche|rédui|éloign|baiss|il faut|devr/i.test(ALERTE.alerte), ALERTE.alerte);
  check('combien de fois le capital : « × 8,3 », « × 83 », « × 1,1 », « × 2 », jamais « × 1 » au-delà du capital',
    C.fois(8.3) === '× 8,3' && C.fois(83) === '× 83' && C.fois(1.1033) === '× 1,1' && C.fois(2) === '× 2' && C.fois(1.004) !== '× 1' && C.fois(1.004) !== '× 1,0', [C.fois(8.3), C.fois(83), C.fois(1.1033), C.fois(2), C.fois(1.004)]);
  // C5 (fonctionnement-7) : une part de 0,001 % ne s'écrit plus « 0,00 % ».
  const mini = C.textes(C.calculer({ capital: '10 000', part: '0,001', stop: '82 000', paliers: ['83 000', '82 500'] }), {});
  check('part de 0,001 % : « 0,001 % » dans la perte et le rappel, jamais « 0,00 % »',
    C.partMots(0.00001) === '0,001 %' && Object.fromEntries(mini.lignes)['Perte au stop, tout rempli'] === '0,10 $ (0,001 % du capital)' && /^Le 0,001 % est la perte/.test(mini.rappel)
    && ![...mini.lignes.flat(), mini.rappel].some(t => /(^|[^\d,])0,0+ %/.test(t)), [mini.lignes, mini.rappel]);
  check('les parts déjà justes ne changent pas (« 1 % », « 0,5 % », « 0,25 % », « 52 % », « 7,3 % »)',
    C.partMots(0.01) === '1 %' && C.partMots(0.005) === '0,5 %' && C.partMots(0.0025) === '0,25 %' && C.partMots(0.52, true) === '52 %' && C.partMots(0.073, true) === '7,3 %');
  // M1 (vA-9) : le stop redit, avec son écart au prix moyen (un calcul, pas un conseil).
  const un = C.textes(C.calculer({ capital: '10000', part: '1', stop: '80000', paliers: ['83000'] }), {}), s1 = un.lignes.find(l => l[0] === 'Stop');
  check('le stop redit : « Stop | 80 000 $ | à 3,6 % sous le prix moyen », entre le prix moyen et la perte',
    !!s1 && s1[1] === '80 000 $' && s1[2] === 'à 3,6 % sous le prix moyen' && un.lignes.map(l => l[0]).join(' / ') === 'Sens / Quantité par palier / Prix moyen, tout rempli / Stop / Perte au stop, tout rempli / Mise, tout rempli', un.lignes);
  const sv = Tv.lignes.find(l => l[0] === 'Stop'), sj = T.lignes.find(l => l[0] === 'Stop');
  check('vente : « 86 000 $, à 1,8 % au-dessus du prix moyen » ; l’exemple du jour : « 80 197 $, à 1,9 % sous le prix moyen »',
    !!sv && sv[1] === '86 000 $' && sv[2] === 'à 1,8 % au-dessus du prix moyen' && !!sj && sj[1] === '80 197 $' && sj[2] === 'à 1,9 % sous le prix moyen', [sv, sj]);
  const zero = C.textes(C.calculer({ capital: '10000', part: '1', stop: '8000', paliers: ['83000'] }), {}).lignes.find(l => l[0] === 'Stop');
  check('un zéro en moins sur le stop (8 000) se voit : « 8 000 $, à 90 % sous le prix moyen »', !!zero && zero[1] === '8 000 $' && zero[2] === 'à 90 % sous le prix moyen', zero);
  // M1 (vA-9) : les nombres réécrits à la française en quittant le champ ; le même nombre relu.
  const ECRITS = [['80000', '80 000'], ['10000', '10 000'], ['83 000', '83 000'], ['82152.5', '82 152,5'], ['81 365,0', '81 365'], ['0,5', '0,5'], ['1', '1'], ['0,001', '0,001'],
    ['1.000.000', '1 000 000'], ['$83200', '83 200'], ['1,5 %', '1,5'], ['', ''], ['abc', 'abc'], ['80 000 x', '80 000 x'], ['0,000000001', '0,000000001']];
  const malEcrits = ECRITS.filter(([t, v]) => C.ecrireNombre(t) !== v).map(([t, v]) => [t, v, C.ecrireNombre(t)]);
  check(`${ECRITS.length} textes réécrits en quittant le champ : « 80000 » → « 80 000 », « 82152.5 » → « 82 152,5 » ; vide ou illisible : tel quel`, !malEcrits.length, malEcrits);
  const relus = LECTURES.filter(([t, v]) => v !== null && C.lireNombre(C.ecrireNombre(t)) !== v).map(([t, v]) => [t, v, C.ecrireNombre(t)]);
  check('chaque écriture lisible, une fois réécrite, se relit en le même nombre', !relus.length, relus);
  // N2 (textes-14) : les trois mots dits en mots simples, dans les noms mêmes.
  check('« part risquée », « stop », « palier » : chacun avec ce qu’il veut dire',
    C.NOMS.part.join(' ') === 'Part risquée (% du capital perdu au stop)' && C.NOMS.stop.join(' ') === 'Stop (prix où la perte est coupée)' && C.NOMS.paliers.join(' ') === 'Paliers (prix où un ordre attend)', C.NOMS);
}

console.log(ko ? `\n❌ CALCULETTE : ${ko} contrôle(s) en échec` : '\n✅ CALCULETTE : TOUS LES CONTRÔLES PASSENT');
process.exit(ko ? 1 : 0);
