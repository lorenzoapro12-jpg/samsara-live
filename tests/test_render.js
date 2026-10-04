// Harnais de test : exécute le rendu réel du dashboard dans node, DOM stubbé.
// Les chemins sont dérivés de l'emplacement de ce fichier : le dépôt fonctionne
// cloné n'importe où.
const fs = require('fs'), vm = require('vm'), os = require('os'), path = require('path');
const REPO = path.resolve(__dirname, '..');
const fb = require('./forbidden');

const JS_PATH = path.join(os.tmpdir(), 'samsara-inline.js');
if (!fs.existsSync(JS_PATH)) {
  console.log(`✗ ${JS_PATH} absent — lancer d'abord : python3 tests/refresh_harness.py`);
  process.exit(1);
}

let code = fs.readFileSync(JS_PATH, 'utf8');
// Retire l'appel init() final (canvas/timers) — on teste le chemin marché.
code = code.replace(/\ninit\(\);\s*$/, '\n');
code += `
globalThis.__TEST__ = {
  setData: function (d) { marketData = d; },
  render: function (el) { renderFeedTo(el); },
  fetch: function () { return fetchMarket(); },
  grab: function () { return { cycle: document.getElementById('cycle').textContent,
                               updated: document.getElementById('updated').textContent }; }
};`;

const DATA = JSON.parse(fs.readFileSync(path.join(REPO, 'market-data.json'), 'utf8'));

const store = {};
function mkEl(id) {
  if (store[id]) return store[id];
  return store[id] = {
    id, style: {}, textContent: '', innerHTML: '', value: '', dataset: {},
    classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } },
    addEventListener(){}, appendChild(){}, removeChild(){}, setAttribute(){},
    querySelector(){ return null; }, querySelectorAll(){ return []; },
    getContext(){ return null; }, focus(){}, remove(){},
    getBoundingClientRect(){ return { width: 900, height: 600, left: 0, top: 0 }; }
  };
}

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
  fetch: async () => ({ ok: true, status: 200, json: async () => DATA }),
  navigator: { userAgent: 'node' }, performance: { now: () => 0 },
  Image: function(){}, ResizeObserver: function(){ this.observe = () => {}; },
  CanvasRenderingContext2D: function(){},
  getComputedStyle: () => ({ getPropertyValue: () => '' }),
  history: { pushState(){}, replaceState(){}, back(){}, forward(){} },
  location: { href: 'file:///', reload(){}, search: '', hash: '' },
  Date, Math, JSON, Intl, Object, Array, String, Number, Boolean, Error, Promise,
  RegExp, Set, Map, isNaN, isFinite, parseFloat, parseInt, encodeURIComponent,
  decodeURIComponent, undefined
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

try {
  vm.runInContext(code, sandbox);
  console.log('✓ Script évalué sans erreur\n');
} catch (e) {
  console.log('✗ ERREUR à l\'évaluation :', e.message);
  process.exit(1);
}

// ── Test 1 : fetchMarket() de bout en bout ──
(async () => {
  try {
    await sandbox.__TEST__.fetch();
    console.log('✓ fetchMarket() exécuté\n');
  } catch (e) {
    console.log('✗ fetchMarket() a levé :', e.message, '\n', e.stack.split('\n')[1]);
    process.exit(1);
  }

  const feed = mkEl('feed');
  try {
    sandbox.__TEST__.render(feed);
  } catch (e) {
    console.log('✗ renderFeedTo() a levé :', e.message, '\n', e.stack.split('\n').slice(1,4).join('\n'));
    process.exit(1);
  }

  console.log('En-tête →', JSON.stringify(sandbox.__TEST__.grab()));
  console.log('HTML rendu :', feed.innerHTML.length, 'chars\n');
  console.log('════════════════════════════════════════');

  // Rendu texte lisible
  let t = feed.innerHTML
    .replace(/<hr[^>]*>/g, '\n────────\n')
    .replace(/<\/div>/g, '\n')
    .replace(/<br\s*\/?>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .split('\n').map(l => l.trim()).filter(Boolean).join('\n');
  console.log(t);

  // ── Contrôle d'absence : aucun motif interdit, nulle part ──
  const fbList = fb.load();
  const hitsFeed = fb.find(feed.innerHTML, fbList.terms);
  const hitsSrc = fb.find(fs.readFileSync(path.join(REPO, 'index.html'), 'utf8'), fbList.terms);

  console.log('\n════════════════════════════════════════');
  console.log(`  motifs interdits : ${fbList.terms.length} (${fbList.file}${fbList.local ? '' : ' — EXEMPLE, aucun motif réel'})`);

  // Contrôles de non-régression — valeurs lues depuis la source, pas codées en dur
  const D = DATA;
  const usd = v => Math.round(v).toLocaleString('en-US');
  // ⚠️ Même formateur que `fmtNum` de index.html — PAS `toFixed`.
  // Mesuré le 04/10/2026 : pour 0,615, `toFixed(2)` rend « 0.61 » et `toLocaleString`
  // rend « 0.62 ». Le harnais échouait donc sur SON propre rendu, uniquement les jours où
  // la variation tombait sur un x,xx5 — un faux rouge dépendant de la donnée vivante.
  const fmt = (v, d = 2) => Number(v).toLocaleString('en-US',
    { minimumFractionDigits: d, maximumFractionDigits: d });
  const checks = [
    ['Prix BTC réel', feed.innerHTML.includes(usd(D.btc.price))],
    ['Variation 24h', feed.innerHTML.includes(fmt(D.btc.change_24h_pct))],
    ['L/S réel', feed.innerHTML.includes(String(D.micro.ls_ratio))],
    ['Funding réel', feed.innerHTML.includes(fmt(D.micro.funding_annual_pct))],
    ['OI réel', feed.innerHTML.includes(Math.round(D.micro.oi_btc).toLocaleString('en-US'))],
    ['DXY réel', feed.innerHTML.includes(fmt(D.macro.dxy_spot))],
    ['Support 4h réel', feed.innerHTML.includes(usd(D.tf['4h'].support_30))],
    ['Cross 4h', feed.innerHTML.includes(D.tf['4h'].death_cross_4h ? 'DEATH CROSS' : 'GOLDEN CROSS')],
    ['Mur bid dominant', feed.innerHTML.includes((D.liquidity.bid_walls[0][0]/1000).toFixed(1)+'k')],
    ['GEX', feed.innerHTML.includes(D.micro.gex_state)],
    ['Tous blocs ok', new RegExp(Object.keys(D.status).length+'/'+Object.keys(D.status).length+' blocs').test(feed.innerHTML)],
    ['6 cartes rendues', (feed.innerHTML.match(/demon-card/g)||[]).length === 6],
    ['Aucun motif interdit dans le RENDU', hitsFeed.length === 0],
    ['Aucun motif interdit dans la SOURCE publiée', hitsSrc.length === 0],
  ];
  let ko = 0;
  for (const [nom, ok] of checks) { console.log(`  ${ok ? '✓' : '✗'} ${nom}`); if (!ok) ko++; }
  for (const h of hitsFeed.concat(hitsSrc).slice(0, 6)) {
    console.log(`      motif « ${h.term} » → …${h.extrait}…`);
  }
  console.log(ko === 0 ? '\n✅ TOUS LES CONTRÔLES PASSENT' : `\n❌ ${ko} contrôle(s) en échec`);
  process.exit(ko === 0 ? 0 : 1);
})();
