// Harnais DÉDIÉ au panneau ⚡ (lecture live). Contrairement à test_render.js, le `fetch`
// du sandbox est le fetch RÉSEAU de node : ce test tape vraiment api.binance.com (ou son miroir, si le poste est refusé) et
// vérifie donc la chaîne complète, pas un simulacre.
const fs = require('fs'), vm = require('vm'), os = require('os'), path = require('path');
const REPO = path.resolve(__dirname, '..');
const fb = require('./forbidden');
const { texteServi } = require('./sources');

const JS_PATH = path.join(os.tmpdir(), 'samsara-inline.js');
if (!fs.existsSync(JS_PATH)) {
  console.log(`✗ ${JS_PATH} absent — lancer d'abord : python3 tests/refresh_harness.py`);
  process.exit(1);
}

let code = fs.readFileSync(JS_PATH, 'utf8');
code = code.replace(/\ninit\(\);\s*$/, '\n');
code += `
globalThis.__TEST__ = {
  setData: function (d) { marketData = d; },
  live: function () { return renderLive(); },
  open: function () { return openLiveModal(); },
  close: function () { return closeLiveModal(); },
  body: function () { return document.getElementById('liveModalBody').innerHTML; },
  files: function () { return __files; }
};
// Les URL que le panneau a réellement appelées — mesuré, pas supposé.
globalThis.__files = [];`;

const DATA = JSON.parse(fs.readFileSync(path.join(REPO, 'market-data.json'), 'utf8'));
const SRC = texteServi();   // page + css/ + js/ + themes/ : tout ce qui est servi

const store = {};
function mkEl(id) {
  if (store[id]) return store[id];
  return store[id] = {
    id, style: {}, textContent: '', innerHTML: '', value: '', dataset: {},
    classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } },
    addEventListener(){}, appendChild(){}, removeChild(){}, setAttribute(){}, getAttribute(){ return null; },
    querySelector(){ return null; }, querySelectorAll(){ return []; },
    getContext(){ return null; }, focus(){}, remove(){},
    getBoundingClientRect(){ return { width: 900, height: 600, left: 0, top: 0 }; }
  };
}

// fetch RÉSEAU, enregistré : on veut savoir ce qui a été appelé pour de vrai.
const realFetch = globalThis.fetch;
const recorder = async (url, opts) => {
  sandbox.__files.push(String(url));
  return realFetch(url, opts);
};

const sandbox = {
  console,
  document: {
    getElementById: mkEl, querySelector: (s) => mkEl(s), querySelectorAll: () => [],
    addEventListener(){}, createElement: (t) => mkEl(t), body: mkEl('body'),
    documentElement: mkEl('html'), cookie: '', hidden: false,
    removeEventListener(){}, head: mkEl('head')
  },
  window: {
    innerWidth: 1440, innerHeight: 900, devicePixelRatio: 1,
    addEventListener(){}, removeEventListener(){},
    matchMedia: () => ({ matches: false, addEventListener(){} }),
    location: { href: 'file:///', reload(){} },
    localStorage: { getItem: () => null, setItem(){}, removeItem(){} }
  },
  localStorage: { getItem: () => null, setItem(){}, removeItem(){} },
  requestAnimationFrame: () => 0, cancelAnimationFrame(){},
  setTimeout: () => 0, setInterval: () => 0, clearTimeout(){}, clearInterval(){},
  fetch: recorder,
  navigator: { userAgent: 'node' }, performance: { now: () => 0 },
  Image: function(){}, ResizeObserver: function(){ this.observe = () => {}; },
  CanvasRenderingContext2D: function(){},
  getComputedStyle: () => ({ getPropertyValue: () => '' }),
  history: { pushState(){}, replaceState(){}, back(){}, forward(){} },
  location: { href: 'file:///', reload(){}, search: '', hash: '' },
  Date, Math, JSON, Intl, Object, Array, String, Number, Boolean, Error, Promise,
  RegExp, Set, Map, isNaN, isFinite, parseFloat, parseInt, encodeURIComponent,
  decodeURIComponent, undefined, URLSearchParams
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

try {
  vm.runInContext(code, sandbox);
  sandbox.__TEST__.setData(DATA);
  console.log('✓ Script évalué, données du fichier injectées\n');
} catch (e) {
  console.log('✗ ERREUR à l\'évaluation :', e.message);
  process.exit(1);
}

const num = (v, d = 2) => Number(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
const usd = v => Math.round(v).toLocaleString('en-US');
// Formats français de la page (js/format.js), recalculés ici : « 82 760,0 », « −38,5 ».
const fr = (v, d = 2) => (v < 0 ? '−' : '') + Math.abs(Number(v)).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/[\u00a0\u202f]/g, ' ');
const NB = '\\d{1,3}(?: \\d{3})*';   // partie entière à la française (espaces des milliers)

(async () => {
  try {
    await sandbox.__TEST__.live();
  } catch (e) {
    console.log('✗ renderLive() a levé :', e.message, '\n', (e.stack || '').split('\n')[1]);
    process.exit(1);
  }
  const html = sandbox.__TEST__.body();

  // Rendu texte lisible
  let t = html.replace(/<\/div>/g, '\n').replace(/<br\s*\/?>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .split('\n').map(l => l.trim()).filter(Boolean).join('\n');
  console.log('── RENDU DU PANNEAU ⚡ ──');
  console.log(t);
  console.log('── FIN ──\n');

  const called = sandbox.__files;
  const apiOk = called.every(u => /^https:\/\/(api\.binance\.com|data-api\.binance\.vision)\/api\/v3\//.test(u));
  const fbList = fb.load();
  const hits = fb.find(html, fbList.terms).concat(fb.find(SRC, fbList.terms));

  const checks = [
    ['Appels réels à Binance', called.length >= 3 && apiOk],
    ['Prix live réel présent', html.includes(usd(DATA.btc.price)) || /Prix en direct/.test(html)],
    ['Bid/Ask réels présents', new RegExp('Bid\\s*<b>' + NB + ',\\d\\d</b>').test(html) && new RegExp('Ask\\s*<b>' + NB + ',\\d\\d</b>').test(html)],
    ['Variation 24 h réelle', /[+−]?\d+,\d\d % en 24 h/.test(html)],
    ['Range 24 h (haut/bas réels)', new RegExp('Haut\\s*<b>' + NB + ',\\d</b>').test(html) && new RegExp('Bas\\s*<b>' + NB + ',\\d</b>').test(html)],
    ['Carnet live : ratio affiché', /Ratio bid\/ask\s*[\d.,]+/.test(html) || /Ratio bid\/ask\s*—/.test(html)],
    ['Carnet live : valeurs en BTC', /Bids\s*<b>[\d.,]+ BTC<\/b>/.test(html)],
    // 500 niveaux couvrent ≈ ±0,13 % : la carte annonçait « ±1 % ». La bande affichée doit
    // être couverte, et la couverture réelle doit se lire.
    ['Carnet live : bande couverte (pas « ±1 % »)', /Carnet en direct ±0,1 %/.test(html) && !/Carnet en direct ±1 %/.test(html)],
    ['Carnet live : couverture réelle affichée', /vus jusqu'à ±(\d+,\d\d|—) %/.test(html)],
    ['Tape live : taker buy en %', /Taker buy\s*[\d.,]+\s*%/.test(html)],
    ['Tape live : delta net signé', /Delta net/.test(html)],
    ['Bloc « non live » : perp depuis le fichier', html.includes(fr(DATA.micro.mark_price, 1))],
    ['Basis calculé sur la MÊME source', new RegExp('basis\\s*<b>[+−]?' + NB + ',\\d\\s*pts').test(html)],
    ['Basis ≠ mélange de cadences', !/basis vs spot live/.test(html)],
    ['Dérive du spot affichée séparément', /Dérive du spot depuis la publication\s*<b>/.test(html)],
    ['Piège du basis documenté dans la page', /Deux cadences différentes ne se soustraient/.test(html)],
    ['Spread en 2 décimales', /spread\s*<b>\d+,\d\d\s*pts/.test(html)],
    ['Fenêtre du tape affichée', /fenêtre\s*(\d+\s*s|—)/.test(html)],
    ['Mention : cette page n\'interroge que Binance', /cette page n'interroge que Binance/.test(html)],
    ['Aucun motif interdit dans le panneau', fb.find(html, fbList.terms).length === 0],
    ['Aucun motif interdit dans la SOURCE publiée', fb.find(SRC, fbList.terms).length === 0],
    ['Avertissement spot ≠ swap', /comparez-le à votre <b>spot<\/b>/.test(html)],
    // Le panneau dit l'heure de l'appareil (aucun « UTC ») et ne recopie aucune note de développeur.
    ['Heure du panneau sans « UTC », sans note de développeur', !/UTC|Piège mesuré|\.js\b|\.py\b/.test(html)],
    ['Aucun nombre au format anglais (« 82,810.19 », « 0.1 % »)', !/\d,\d{3}\.\d|\d\.\d+ ?(?:%|pts|BTC)/.test(t)],   // le TEXTE (les styles gardent « 42.2% »)
    ['5 cartes rendues', (html.match(/demon-card/g) || []).length === 5],
    ['Pas de valeur « — » sur le prix', !/<div style="font-size:22px[^>]*>—/.test(html)],
    ['Aucun NaN affiché', !/NaN/.test(html)],
  ];

  console.log('════════════════════════════════════════');
  console.log(`  motifs interdits : ${fbList.terms.length} (${fbList.file}${fbList.local ? '' : ' — EXEMPLE, aucun motif réel'})`);
  let ko = 0;
  for (const [nom, ok] of checks) { console.log(`  ${ok ? '✓' : '✗'} ${nom}`); if (!ok) ko++; }
  for (const h of hits.slice(0, 6)) console.log(`      motif « ${h.term} » → …${h.extrait}…`);
  console.log(ko === 0 ? '\n✅ TOUS LES CONTRÔLES DU PANNEAU LIVE PASSENT' : `\n❌ ${ko} contrôle(s) en échec`);
  process.exit(ko === 0 ? 0 : 1);
})();
