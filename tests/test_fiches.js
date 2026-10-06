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
const fs = require('fs'), vm = require('vm'), path = require('path'), { execFileSync } = require('child_process');
const { scriptsApp, REPO } = require('./sources');

let ko = 0;
const check = (nom, ok, det) => { if (!ok) ko++; console.log(`  ${ok ? '✓' : '✗'} ${nom}${!ok && det !== undefined ? ' — ' + JSON.stringify(det).slice(0, 300) : ''}`); };
const titre = t => console.log(`\n── ${t} ──`);

// ── Le code de la page, exécuté dans un DOM minimal ──────────────────────────
const scripts = scriptsApp();
const SRC_APP = fs.readFileSync(path.join(REPO, 'js/app.js'), 'utf8');
let code = scripts.map(s => s.texte).join('\n;\n').replace(/\ninit\(\);\s*$/, '\n');
code += `
globalThis.__T__ = {
  get FICHES() { return FICHES; }, get PARAM() { return PARAM; }, get INDICATORS() { return INDICATORS; },
  ETIQ, subTitle, ficheHtml, lectureCourte, renderFeedTo, modeCourant, FICHE_IND,
  setData(d) { marketData = d; },
};`;
const MODE = { v: null };
const el = () => ({ style: {}, dataset: {}, innerHTML: '', textContent: '', classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
  addEventListener() {}, appendChild() {}, setAttribute() {}, getAttribute() { return null; }, querySelector() { return null; }, querySelectorAll() { return []; },
  getContext() { return null; }, getBoundingClientRect() { return { width: 900, height: 600, left: 0, top: 0, bottom: 0 }; } });
const store = {};
const ls = { getItem: k => (k === 'samsara-mode' ? MODE.v : null), setItem() {}, removeItem() {} };
const sandbox = {
  console, Date, Math, JSON, Intl, Object, Array, String, Number, Boolean, Error, Promise, RegExp, Set, Map, isNaN, isFinite,
  parseFloat, parseInt, encodeURIComponent, decodeURIComponent, undefined,
  document: { getElementById: id => store[id] || (store[id] = el()), querySelector: () => el(), querySelectorAll: () => [], addEventListener() {},
    createElement: () => el(), body: el(), documentElement: el(), head: el(), hidden: false },
  window: { innerWidth: 1440, innerHeight: 900, addEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }), localStorage: ls, location: {} },
  localStorage: ls, requestAnimationFrame: () => 0, setTimeout: () => 0, setInterval: () => 0, clearTimeout() {}, clearInterval() {},
  fetch: async () => ({ ok: false }), navigator: {}, performance: { now: () => 0 }, getComputedStyle: () => ({ getPropertyValue: () => '' }),
  ResizeObserver: function () { this.observe = () => {}; }, Image: function () {}, location: {},
  CanvasRenderingContext2D: function () {}, history: { pushState() {}, replaceState() {} },
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(code, sandbox);
const T = sandbox.__T__;

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
const textes = Object.entries(T.FICHES).flatMap(([k, f]) => [f.simple, f.debat, f.limites, ...f.lectures.map(l => l.t)].filter(Boolean).map(t => [k, t]));
const conseils = textes.filter(([, t]) => CONSEIL.test(t));
check('aucune fiche ne dit quoi acheter ou vendre', !conseils.length, conseils);
const courtes = ['funding', 'oi', 'ls', 'cvd', 'gex', 'rsi_tf', 'vix', 'prime', 'carnet'].flatMap(k => [-5, -0.5, 0.2, 1, 50, 80].map(v => T.lectureCourte(k, v)));
check('aucune lecture courte ne dit quoi faire', courtes.every(t => !CONSEIL.test(t)));
check('chaque fiche se termine par « ce n’est pas une recommandation »', Object.keys(T.FICHES).every(k => /pas une recommandation/.test(T.ficheHtml(k))));

// ── 6. Chaque bouton « i » ouvre une fiche qui existe ────────────────────────
titre('6. Les boutons de la page pointent vers des fiches existantes');
const appels = [...SRC_APP.matchAll(/infoBtn\('([^']+)'\)|lectureCourte\('([^']+)'/g)].map(m => m[1] || m[2]);
const inconnus = [...new Set(appels.concat(Object.values(T.FICHE_IND)))].filter(k => !T.FICHES[k]);
check(`${new Set(appels).size} fiches appelées depuis les cartes et le menu, toutes définies`, !inconnus.length, inconnus);

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
console.log(ko ? `\n❌ LÉGENDES : ${ko} contrôle(s) en échec` : '\n✅ LÉGENDES : TOUS LES CONTRÔLES PASSENT');
process.exit(ko ? 1 : 0);
