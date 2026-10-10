// Le harnais des LÉGENDES de la page (js/fiches.js) et des libellés d'indicateurs (js/app.js).
//
// La règle : une légende ne se rédige pas à la main, elle se DÉRIVE du code qui calcule.
//   · champ du fichier  -> sa formule vient de `meta.champs` (publish.py), le harnais vérifie
//     que le champ y est décrit et que la fiche affiche CETTE description ;
//   · indicateur de la page -> sa formule et son libellé sont construits avec PARAM (js/app.js) ;
//     le harnais change PARAM et vérifie que libellé et légende suivent, et qu'aucun libellé ni
//     appel de calcul ne réécrit un nombre à la main ;
//   · mode débutant / expert -> le HTML est IDENTIQUE dans les deux modes ;
//   · une lecture n'est pas un conseil -> aucun impératif d'achat / de vente.
//
// USAGE   node tests/test_fiches.js
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const { REPO } = require('./sources');

let ko = 0;
const check = (nom, ok, det) => { if (!ok) ko++; console.log(`  ${ok ? '✓' : '✗'} ${nom}${!ok && det !== undefined ? ' — ' + JSON.stringify(det).slice(0, 300) : ''}`); };
const titre = t => console.log(`\n── ${t} ──`);

// ── Le code de la page, exécuté dans un DOM minimal (tests/bac.js) ───────────
const { chargerPage, element: el } = require('./bac');
const SRC_APP = fs.readFileSync(path.join(REPO, 'js/app.js'), 'utf8');
const page = chargerPage();
const T = page.T;
const MODE = { set v(m) { if (m === null) delete page.stockage['samsara-mode']; else page.stockage['samsara-mode'] = m; } };

// Les descriptions publiées par le serveur : celles que publish.py écrit dans meta.champs.
const META = JSON.parse(execFileSync('python3', ['-c',
  'import sys,json;sys.path.insert(0,sys.argv[1]);import publish;print(json.dumps(publish.meta_champs(),ensure_ascii=False))', REPO]).toString());
const DATA = JSON.parse(fs.readFileSync(path.join(REPO, 'market-data.json'), 'utf8'));

// ── 1. Les légendes demandées existent ───────────────────────────────────────
titre('1. Une légende pour chaque indicateur demandé');
const DEMANDES = ['gex', 'ls', 'dxy', 'vix', 'funding', 'oi', 'cvd', 'rsi', 'rsi_tf', 'ema', 'ema_tf', 'sr', 'sr_tf', 'vwap', 'adx', 'atr', 'atr_tf', 'volume', 'volume_tf'];
check('GEX, L/S, DXY, VIX, funding, OI, CVD, RSI, EMA, S/R, VWAP, ADX, ATR, volume', DEMANDES.every(k => T.FICHES[k]), DEMANDES.filter(k => !T.FICHES[k]));
const STATUTS = new Set(['usuel', 'convention', 'débattu', 'mesuré']);
const malFormees = Object.entries(T.FICHES).filter(([, f]) => !f.titre || !f.simple || !f.limites || !Array.isArray(f.lectures) || !f.lectures.length
  || f.lectures.some(l => !STATUTS.has(l.s) || !l.t) || (!f.champ && !f.page));
check('chaque fiche : titre, explication simple, lectures marquées (usuel / convention / débattu / mesuré), limites', !malFormees.length, malFormees.map(x => x[0]));
for (const k of ['gex', 'ls', 'top_ls', 'dxy']) check(`« ${k} » : la contradiction de la littérature est DITE`, !!(T.FICHES[k] && T.FICHES[k].debat));
check('GEX : le signe est marqué « convention », pas « mesuré »', T.FICHES.gex.lectures.every(l => l.s === 'convention'));

// ── 2. Champs du fichier : la formule vient du producteur ────────────────────
titre('2. Champs du fichier : formule, unité, fenêtre lues dans meta');
const champs = Object.entries(T.FICHES).filter(([, f]) => f.champ);
const absents = champs.filter(([, f]) => !META[f.champ]).map(([k, f]) => k + ' → ' + f.champ);
check(`les ${champs.length} champs cités sont décrits par publish.py`, !absents.length, absents);
T.setData(Object.assign({}, DATA, { meta: { version: 1, champs: META } }));
const sansFormule = champs.filter(([k, f]) => !T.ficheHtml(k).includes(esc(META[f.champ].formule))).map(([k]) => k);
check('chaque fiche affiche la formule PUBLIÉE, mot pour mot', !sansFormule.length, sansFormule);
const rt = T.ficheHtml('amplitude');
check('nom trompeur signalé quand le producteur le déclare (range_24h_pct ⇒ via son alias)', META['tf.*.range_24h_pct'].nom_trompeur && /Nom trompeur|range_24h_pct/.test(rt));
const ema = T.ficheHtml('ema_tf');
check('poids résiduel de l’amorce affiché pour l’EMA (paramètre publié)', ema.includes(String(META['tf.*.ema20'].params.poids_amorce_pct)));
T.setData(Object.assign({}, DATA, { meta: undefined }));
check('fichier sans meta : la fiche le DIT au lieu d’inventer une formule', /Description non publiée/.test(T.ficheHtml('rsi_tf')));
// Aucune formule de champ n'est écrite dans fiches.js : ses fiches à `champ` n'ont pas de `formule`.
check('aucune fiche de champ ne porte sa propre formule', champs.every(([, f]) => !f.formule));

// ── 3. Indicateurs de la page : libellés et formules construits avec PARAM ────
titre('3. Indicateurs de la page : libellés et formules suivent PARAM');
const libelle = k => T.INDICATORS.flatMap(c => c.items).find(i => i.key === k).label;
check('libellés du menu = PARAM (RSI, MACD, ATR, ADX, CCI, Bollinger, stochastique)',
  libelle('rsi').includes(String(T.PARAM.rsi.periode)) && libelle('macd').includes(T.PARAM.macd.rapide + ',' + T.PARAM.macd.lente + ',' + T.PARAM.macd.signal)
  && libelle('atr').includes(String(T.PARAM.atr.periode)) && libelle('adx').includes(String(T.PARAM.adx.periode))
  && libelle('cci').includes(String(T.PARAM.cci.periode)) && libelle('bb').includes(String(T.PARAM.bb.periode))
  && libelle('stoch') === 'Stochastique rapide (' + T.PARAM.stoch.k + ',' + T.PARAM.stoch.d + ')');
check('le stochastique ne se dit plus « 14,3,3 » (version lente) : c’est la version rapide qui est calculée', !/14,3,3/.test(libelle('stoch')) && /rapide/i.test(libelle('stoch')));
// Les dents : on change PARAM, le libellé et la légende suivent.
const sauve = JSON.stringify(T.PARAM);
T.PARAM.rsi.periode = 21; T.PARAM.atr.periode = 9; T.PARAM.vwap.ancrageBougies = 30;
check('PARAM.rsi = 21 → libellé « RSI (21) », sous-graphe et légende disent 21',
  T.ETIQ.rsi() === 'RSI (21)' && T.subTitle('rsi').includes('21') && T.ficheHtml('rsi').includes('sur 21 bougies'));
check('PARAM.atr = 9 → légende de l’ATR dit 9', T.ficheHtml('atr').includes('sur 9 bougies'));
check('PARAM.vwap.ancrageBougies = 30 → légende du VWAP dit 30', T.ficheHtml('vwap').includes('toutes les 30 bougies'));
Object.assign(T.PARAM, JSON.parse(sauve));
// Aucun nombre réécrit à la main dans le code de la page.
const sansCommentaires = SRC_APP.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const libellesEnDur = sansCommentaires.match(/['"`](?:RSI|ATR|ADX|ADX\/DMI|MFI[^'"`]*|CCI|Williams %R|%R|STOCH|Stochastique[^'"`(]*|MACD|Bollinger[^'"`(]*|AO|Awesome Oscillator)\s*\(\s*\d[^'"`]*['"`]/g) || [];
check('aucun libellé d’indicateur avec un nombre écrit en dur', !libellesEnDur.length, libellesEnDur);
const appelsEnDur = sansCommentaires.match(/memoized\('[^']+',\s*calc(?:RSI|ATR|ADX|MFI|WilliamsR|CCI|Stoch|Bollinger|MACD|AO|VWAP)\b[^;\n]*?,\s*\d+(?:\.\d+)?\s*[,)]/g) || [];
check('aucun appel de calcul affiché avec un paramètre écrit en dur', !appelsEnDur.length, appelsEnDur);
check('S/R de la page : profondeur, tolérances et fusion lues dans PARAM', !/computeSR\([^)]*\b500\b/.test(sansCommentaires)
  && /PARAM\.sr\.tolMin/.test(sansCommentaires) && /PARAM\.sr\.fusionTf/.test(sansCommentaires));

// ── 4. Le mode change le détail, jamais une valeur ───────────────────────────
titre('4. Mode débutant / expert : même HTML, seule une classe change');
T.setData(Object.assign({}, DATA, { meta: { version: 1, champs: META } }));
const rendre = mode => { MODE.v = mode; const c = el(); T.renderFeedTo(c); return c.innerHTML; };
const deb = rendre(null), exp = rendre('expert');
check('le mode est bien lu différemment', (MODE.v = null, T.modeCourant()) === 'debutant' && (MODE.v = 'expert', T.modeCourant()) === 'expert');
check('cartes du marché : HTML identique en débutant et en expert', deb === exp && deb.length > 1000, { deb: deb.length, exp: exp.length });
const fichesIdentiques = Object.keys(T.FICHES).every(k => { MODE.v = null; const a = T.ficheHtml(k); MODE.v = 'expert'; return a === T.ficheHtml(k); });
check('chaque fiche : HTML identique dans les deux modes', fichesIdentiques);
check('les lectures courtes sont réservées au mode débutant', (deb.match(/lecture-courte/g) || []).length > 3
  && (deb.match(/class="lecture-courte debutant-seul"/g) || []).length === (deb.match(/lecture-courte/g) || []).length);
check('la formule est réservée au mode expert (dans chaque fiche)', Object.keys(T.FICHES).every(k => /class="expert-seul fiche-technique"/.test(T.ficheHtml(k))));

// ── 5. Une lecture n'est pas un conseil ──────────────────────────────────────
titre('5. « Voici comment ça se lit » n’est pas « voici quoi faire »');
const CONSEIL = /\b(achetez|vendez|achète[rz]?\b|vends\b|il faut (?:acheter|vendre)|entrez|sortez|prenez position|signal d['’]achat|signal de vente|recommand(?:e|ons))/i;
const textes = Object.entries(T.FICHES).flatMap(([k, f]) => [f.simple, f.simpleDeb, f.titreDeb, f.debat, f.limites, ...f.lectures.map(l => l.t)].filter(Boolean).map(t => [k, t]));
const conseils = textes.filter(([, t]) => CONSEIL.test(t));
check('aucune fiche ne dit quoi acheter ou vendre', !conseils.length, conseils);
const courtes = ['funding', 'oi', 'ls', 'cvd', 'gex', 'rsi_tf', 'vix', 'prime', 'carnet'].flatMap(k => [-5, -0.5, 0.2, 1, 50, 80].map(v => T.lectureCourte(k, v)));
check('aucune lecture courte ne dit quoi faire', courtes.every(t => !CONSEIL.test(t)));
// Les phrases des cartes du Lisible (phraseCarte) : le même bloc réservé au Lisible, en mots
// simples (aucun mot de la liste du Guide), sans conseil.
{
  const Gd = require(path.join(REPO, 'js/guide.js'));
  const ph = [['fourchette', 0, '24 h'], ['fourchette', 0.5, '5 jours'], ['fourchette', 0.9], ['vix', 12], ['vix', 20], ['vix', 30], ['cvd', 1.2e8], ['cvd', -3.4e7], ['sources', 9, 9], ['sources', 7, 9], ['sources', 8, 9]].map(a => T.phraseCarte(...a));
  check(`${ph.length} phrases des cartes : chacune « lecture-courte debutant-seul », sans conseil ni mot technique`, ph.every(h => /^<div class="lecture-courte debutant-seul">[^<]+<\/div>$/.test(h) && !CONSEIL.test(h) && !Gd.motsBannis(h).length), ph);
  check('fourchette : « Sur 24 h, le prix est dans le bas de sa fourchette. » ; écart achats/ventes arrondi en millions (« 120 millions $ », « 34 millions $ », jamais un nombre à 7 chiffres)', /^<div[^>]*>Sur 24 h, le prix est dans le bas de sa fourchette\.<\/div>$/.test(ph[0]) && /de 120 millions \$\./.test(ph[6]) && /de 34 millions \$\./.test(ph[7])
    && /de 3,4 millions \$\./.test(T.phraseCarte('cvd', 3356931)) && /de 1,2 million \$\./.test(T.phraseCarte('cvd', -1.2e6)) && /de 845 000 \$\./.test(T.phraseCarte('cvd', 845000)) && !/\d{1,3}(?: \d{3}){2}/.test(ph[6] + ph[7] + T.phraseCarte('cvd', 3356931)) && /2 sources manquent/.test(ph[9]) && /1 source manque/.test(ph[10]), [ph[0], ph[6], ph[9]]);
  check('valeur absente ou clé inconnue : aucune phrase (rien d’inventé)', T.phraseCarte('vix', null) === '' && T.phraseCarte('fourchette', NaN) === '' && T.phraseCarte('inconnue', 1) === '' && T.phraseCarte('sources', 3) === '');
}
// Le glossaire en Lisible : d'abord ce que montre SON écran, avec un titre et une explication du
// Lisible, sans mot technique (constat de revue : il s'ouvrait sur GEX, funding, CVD…).
{
  const Gd = require(path.join(REPO, 'js/guide.js'));
  const G = T.GLOSSAIRE_DEBUTANT || [];
  const manque = G.filter(k => !T.FICHES[k] || !T.FICHES[k].titreDeb || !T.FICHES[k].simpleDeb);
  check(`glossaire Lisible : ${G.length} fiches (guide, repères, scénarios, dessin des prix, les cartes), chacune avec titreDeb et simpleDeb`, G.length >= 6 && !manque.length && ['guide_niveaux', 'scenarios'].every(k => G.includes(k)), manque);
  const sales = Object.entries(T.FICHES).filter(([, f]) => f.titreDeb || f.simpleDeb).map(([k, f]) => [k, Gd.motsBannis((f.titreDeb || '') + ' ' + (f.simpleDeb || ''))]).filter(([, b]) => b.length);
  check('titres et explications du Lisible : aucun mot de la liste du Guide', !sales.length, sales);
  check('guide, guide_regime, guide_suite : une explication du Lisible qui décrit l’écran Lisible (ni badge, ni chemins dessinés, « + Affichage »)', ['guide', 'guide_regime', 'guide_suite'].every(k => T.FICHES[k].simpleDeb)
    && /« \+ Affichage »/.test(T.FICHES.guide.simpleDeb) && /pas de badge/.test(T.FICHES.guide_regime.simpleDeb) && /rien n’est dessiné/.test(T.FICHES.guide_suite.simpleDeb));
  const fg = T.ficheHtml('guide_regime');
  check('fiche avec texte du Lisible : les deux explications, chacune dans sa classe ; les deux titres de même', /<p class="fiche-simple expert-seul">/.test(fg) && /<p class="fiche-simple debutant-seul">/.test(fg) && /<span class="debutant-seul">Le mouvement du prix<\/span>/.test(fg));
  // Autre paire : les cartes du Lisible nomment le bitcoin (le fichier ne suit que lui).
  const sym = T.activeSymbol;
  T.activeSymbol = 'SOLUSDT';
  const dS = rendre(null), eS = rendre('expert');
  T.activeSymbol = sym;
  check('SOL/USDT : cartes identiques dans les deux modes ; le Lisible dit « Ces infos parlent du bitcoin », « Bitcoin : fourchette des 24 h », « le bitcoin est … de sa fourchette »', dS === eS && /Ces infos parlent du bitcoin \(en dollars\), pas de SOL\/USDT\./.test(dS)
    && /Bitcoin : fourchette des 24 h/.test(dS) && /le bitcoin est (dans le haut|dans le bas|au milieu) de sa fourchette/.test(dS) && !/le prix est (dans le haut|dans le bas|au milieu)/.test(dS), dS.slice(0, 400));
  const dB = rendre(null);
  check('BTC/USDT : « le prix », pas de mention « Ces infos parlent du bitcoin » ; haut et bas publiés dits « publié »', !/Ces infos parlent du bitcoin/.test(dB) && /le prix est (dans le haut|dans le bas|au milieu) de sa fourchette/.test(dB) && /Haut publié/.test(dB) && /Bas publié/.test(dB));
}
check('chaque fiche se termine par « ce n’est pas une recommandation »', Object.keys(T.FICHES).every(k => /pas une recommandation/.test(T.ficheHtml(k))));

// ── 6. Chaque bouton « i » ouvre une fiche qui existe ────────────────────────
titre('6. Les boutons de la page pointent vers des fiches existantes');
const appels = [...SRC_APP.matchAll(/infoBtn\('([^']+)'\)|lectureCourte\('([^']+)'/g)].map(m => m[1] || m[2]);
const inconnus = [...new Set(appels.concat(Object.values(T.FICHE_IND)))].filter(k => !T.FICHES[k]);
check(`${new Set(appels).size} fiches appelées depuis les cartes et le menu, toutes définies`, !inconnus.length, inconnus);

// ── 7. La forme des bougies : une convention du thème, dite par une fiche dérivée du tracé ──
titre('7. Bougies : la fiche dit la forme du thème courant, lue dans le code du tracé');
const SRC_FICHES = fs.readFileSync(path.join(REPO, 'js/fiches.js'), 'utf8');
const fb = T.ficheHtml('bougies');
check('fiche « bougies » : nature « convention » (pas « mesuré »)', /fiche-nature nature-convention/.test(fb), fb.slice(0, 200));
check('elle dit la forme du thème et le seuil de la vue dense, lus dans FORMES_BOUGIE et BOUGIE_DENSE_PX (js/app.js)',
  fb.includes(esc(T.FORMES_BOUGIE[T.COLORS.bougieForme])) && fb.includes('corps &lt; ' + T.BOUGIE_DENSE_PX + ' px') && /La forme change, jamais la valeur/.test(fb));
const formeAvant = T.COLORS.bougieForme;
const parForme = Object.keys(T.FORMES_BOUGIE).map(f => { T.COLORS.bougieForme = f; return [f, T.ficheHtml('bougies').includes(esc(T.FORMES_BOUGIE[f]))]; });
T.COLORS.bougieForme = formeAvant;
check(`la fiche suit la forme du thème (${Object.keys(T.FORMES_BOUGIE).join(', ')})`, parForme.every(([, ok]) => ok), parForme);
check('aucun seuil en pixels écrit à la main dans js/fiches.js', !/<\s*\d+\s*px/.test(SRC_FICHES.replace(/^\s*\/\/.*$/gm, '')));
check('la fiche est dans le glossaire', /'bougies'/.test(SRC_FICHES.slice(SRC_FICHES.indexOf('function ouvrirGlossaire'))));

// ── 8. Cadences : une table (js/cadences.js), lue par les minuteries, les seuils et les étiquettes ──
titre('8. Cadences : une table, lue partout — aucun nombre recopié');
const C = T.CADENCES;
const CLES = ['prix', 'bougies', 'publication_lue', 'attendue_min', 'vieux_min', 'fige_min'];
check('CADENCES déclare ' + CLES.join(', '), C && CLES.every(k => typeof C[k] === 'number' && C[k] > 0), C);
check('ordre des seuils : attendue < vieux < figé', C.attendue_min < C.vieux_min && C.vieux_min < C.fige_min, C);
const SRC = { 'js/app.js': SRC_APP, 'js/reglages.js': fs.readFileSync(path.join(REPO, 'js/reglages.js'), 'utf8'),
  'js/structures.js': fs.readFileSync(path.join(REPO, 'js/structures.js'), 'utf8') };
const code = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '');
const corps = (src, nom) => { const i = src.indexOf('function ' + nom + '('); if (i < 0) return ''; let p = src.indexOf('{', i), n = 1, k = p + 1;
  while (n && k < src.length) { n += { '{': 1, '}': -1 }[src[k]] || 0; k++; } return code(src.slice(i, k)); };
// Chaque appel setInterval(…), parenthèses équilibrées ; son DERNIER argument est la cadence.
const minuteries = t => { const out = []; let i = -1;
  while ((i = t.indexOf('setInterval(', i + 1)) >= 0) { let n = 0, k = i + 11; do { n += { '(': 1, ')': -1 }[t[k]] || 0; k++; } while (n && k < t.length); out.push(t.slice(i, k)); }
  return out; };
const enDur = t => minuteries(t).filter(m => /,\s*\d[\d_]*\s*\)$/.test(m));
const initC = corps(SRC_APP, 'init');
check(`init() : ${minuteries(initC).length} minuteries, aucune à cadence écrite en dur`, minuteries(initC).length >= 4 && !enDur(initC).length, enDur(initC));
check('toggleDepth() : relecture de la chaleur à CADENCES.chaleur_lue', /CADENCES\.chaleur_lue/.test(corps(SRC_APP, 'toggleDepth')) && !enDur(corps(SRC_APP, 'toggleDepth')).length);
// Le voyant se décide dans etatPublication() (appelée par majAges() à chaque tour de fetchMarket).
const ab = corps(SRC_APP, 'ageBannerHtml'), rf = corps(SRC_APP, 'renderFeedTo') + corps(SRC_APP, 'renderCycle'), fm = corps(SRC_APP, 'etatPublication');
check('ageBannerHtml() : seuils et cadence lus dans CADENCES (plus de 20, 32, « 15 min »)',
  /CADENCES\.vieux_min/.test(ab) && /CADENCES\.fige_min/.test(ab) && /CADENCES\.attendue_min/.test(ab) && !/[<>]=?\s*\d+\b/.test(ab) && !/\b\d+ min\)/.test(ab));
check('renderFeedTo() / renderCycle() : la bande des chiffres clés vieillit à CADENCES.vieux_min', /ageK\s*>\s*CADENCES\.vieux_min/.test(rf) && !/ageK\s*>\s*\d/.test(rf));
check('etatPublication() : le voyant passe au retard / au figé aux seuils de CADENCES', /CADENCES\.fige_min/.test(fm) && /CADENCES\.vieux_min/.test(fm) && !/ageMin\s*>\s*\d/.test(fm));
// Aucune étiquette ne recopie une cadence de la table : chaînes de code, commentaires exclus.
const valeurs = [C.attendue_min, C.vieux_min, C.fige_min].join('|');
const recopies = Object.entries(SRC).flatMap(([f, t]) => (code(t).match(new RegExp("(['\"\x60])[^'\"\x60\\n]*\\b(?:" + valeurs + ")\\s*(?:min|MIN|minutes)\\b[^'\"\x60\\n]*\\1", 'g')) || []).map(m => f + ' : ' + m));
check('aucune étiquette ne recopie « ' + C.attendue_min + ' / ' + C.vieux_min + ' / ' + C.fige_min + ' min » (app.js, reglages.js, structures.js)', !recopies.length, recopies);
// Les dents : la table change, les seuils et les étiquettes suivent.
const sauveC = Object.assign({}, C), ilYa = m => ({ updated: new Date(Date.now() - m * 60000).toISOString() });
check(`publication de ${C.vieux_min - 1} min : aucun bandeau ; de ${C.vieux_min + 1} min : bandeau de retard qui dit « cadence attendue : ${C.attendue_min} min »`,
  T.ageBannerHtml(ilYa(C.vieux_min - 1)) === '' && /retard/.test(T.ageBannerHtml(ilYa(C.vieux_min + 1))) && T.ageBannerHtml(ilYa(C.vieux_min + 1)).includes('cadence attendue : ' + C.attendue_min + ' min'));
Object.assign(C, { attendue_min: 3, vieux_min: 5, fige_min: 8 });
const b6 = T.ageBannerHtml(ilYa(6)), b9 = T.ageBannerHtml(ilYa(9)), b4 = T.ageBannerHtml(ilYa(4));
Object.assign(C, sauveC);
check('CADENCES = 3 / 5 / 8 min → bandeau à 6 min (« cadence attendue : 3 min »), figé à 9 min, rien à 4 min',
  /cadence attendue : 3 min/.test(b6) && /figées/.test(b9) && b4 === '', { b4, b6, b9 });

// ── 9. Chaque indicateur du menu : ce que c'est ET comment s'en servir (demande du 09/10/2026) ──
titre('9. Chaque indicateur du menu : comment les traders l’utilisent, comment il est calculé, et un aperçu');
{
  const Gd = require(path.join(REPO, 'js/guide.js'));
  const items = T.INDICATORS.flatMap(c => c.items);
  const sansFiche = items.filter(i => !T.FICHE_IND[i.key] || !T.FICHES[T.FICHE_IND[i.key]]).map(i => i.key);
  check(`les ${items.length} indicateurs du menu ont une fiche`, !sansFiche.length, sansFiche);
  const COUCHES = ['guide', 'scenarios', 'figuresPassees'];
  const marche = items.filter(i => !COUCHES.includes(i.key));
  const manque = marche.filter(i => { const f = T.FICHES[T.FICHE_IND[i.key]]; return !f || !f.traders || !f.calcul; }).map(i => i.key);
  check(`les ${marche.length} indicateurs de marché : « Comment les traders l’utilisent » et « Comment c’est calculé »`, !manque.length, manque);
  check('les couches du site (Guide, scénarios, figures passées) : une ligne « Comment s’en servir »', COUCHES.every(k => T.FICHES[k].usage));
  const champs = Object.entries(T.FICHES).filter(([, f]) => f.champ);
  const champsSans = champs.filter(([, f]) => !f.traders || !f.calcul).map(([k]) => k);
  check(`les ${champs.length} champs du fichier : usage des traders et calcul en mots`, !champsSans.length, champsSans);
  const textes = Object.entries(T.FICHES).flatMap(([k, f]) => [f.traders, typeof f.calcul === 'function' ? f.calcul(T.PARAM) : f.calcul,
    ...(f.usage ? (typeof f.usage === 'string' ? [f.usage] : [f.usage.exp, f.usage.deb]) : [])].filter(Boolean).map(t => [k, t]));
  check('aucun de ces textes ne dit quoi acheter ou vendre', textes.every(([, t]) => !CONSEIL.test(t)), textes.filter(([, t]) => CONSEIL.test(t)));
  const perso = Object.entries(T.FICHES).filter(([k]) => k).map(([k]) => [k, T.ficheHtml(k)]).filter(([, h]) => /propriétaire|dans ce projet|nos données|ses propres données/i.test(h)).map(([k]) => k);
  check('aucune explication personnalisée (étude du propriétaire, « dans ce projet »)', !perso.length, perso);
  const debSales = COUCHES.map(k => [k, Gd.motsBannis(T.FICHES[k].usage.deb)]).filter(([, b]) => b.length);
  check('les lignes du Lisible (guide, scénarios, figures passées) : aucun mot de la liste du Guide', !debSales.length, debSales);
  check('la fiche affiche « Comment les traders l’utilisent » et « Comment c’est calculé » (dans les deux modes)', /Comment les traders l’utilisent/.test(T.ficheHtml('rsi')) && /Comment c’est calculé/.test(T.ficheHtml('rsi'))
    && !/expert-seul[^>]*>[^<]*Comment c’est calculé/.test(T.ficheHtml('rsi')) && /Comment s’en servir/.test(T.ficheHtml('guide')));
  check('le calcul en mots suit PARAM (RSI 14 → 21)', (() => { const v = T.PARAM.rsi.periode; T.PARAM.rsi.periode = 21; const ok = T.ficheHtml('rsi').includes('à la Wilder » sur 21 bougies'); T.PARAM.rsi.periode = v; return ok; })());
  MODE.v = null;
  const apDeb = T.apercuHtml('guide'), apVide = T.apercuHtml(null);
  MODE.v = 'expert';
  const apExp = T.apercuHtml('ichimoku');
  check('aperçu du menu : titre, « C’est quoi ? », usage des traders, calcul, lien vers la fiche ; en Lisible, ses mots à lui', /C’est quoi \?/.test(apExp) && /Comment les traders l’utilisent/.test(apExp) && /Comment c’est calculé/.test(apExp) && /ouvrirFiche\('ichimoku'/.test(apExp)
    && apDeb.includes(T.FICHES.guide.titreDeb) && apDeb.includes(T.FICHES.guide.usage.deb.slice(0, 30)) && !Gd.motsBannis(apDeb.replace(/<[^>]+>/g, ' ')).length && !Gd.motsBannis(apVide.replace(/<[^>]+>/g, ' ')).length, { apDeb, apExp });
  // Les dents : les formules des nouvelles fiches suivent PARAM.
  const sauveP = JSON.stringify(T.PARAM);
  T.PARAM.ichimoku.tenkan = 7; T.PARAM.sar.max = 0.3; T.PARAM.vp.zoneValeur = 0.68; T.PARAM.fib.niveaux = [0, 0.5, 1];
  check('PARAM change → Ichimoku dit 7, SAR 0,3, profil de volume 68 %, Fibonacci ses seuls niveaux', T.ficheHtml('ichimoku').includes('sur 7 bougies') && T.ficheHtml('sar').includes('plafonné à 0,3')
    && T.ficheHtml('vp').includes('68 %') && T.ficheHtml('fib').includes('niveaux 0 %, 50 %, 100 %'));
  Object.assign(T.PARAM, JSON.parse(sauveP));
  check('Ichimoku, SAR, Fibonacci, profil de volume : le dessin lit PARAM', /calcIchimoku, highs, lows, closes, PARAM\.ichimoku\.tenkan/.test(SRC_APP) && /calcSAR, highs2, lows2, closes, PARAM\.sar\.pas, PARAM\.sar\.max/.test(SRC_APP)
    && /fibLevels = PARAM\.fib\.niveaux/.test(SRC_APP) && /PARAM\.vp\.zoneValeur/.test(SRC_APP) && !/\[0, 0\.236, 0\.382/.test(SRC_APP.replace(/^.*fib: \{ niveaux.*$/m, '')));
}

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
console.log(ko ? `\n❌ LÉGENDES : ${ko} contrôle(s) en échec` : '\n✅ LÉGENDES : TOUS LES CONTRÔLES PASSENT');
process.exit(ko ? 1 : 0);
