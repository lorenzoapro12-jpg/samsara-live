// Bac à sable commun aux harnais node du terminal : exécute le JavaScript de la page (dans
// l'ordre d'index.html, via sources.js) dans un DOM minimal, sans réseau ni canvas.
//
//   const page = chargerPage({ stockage: { 'samsara-mode': 'expert' }, fetch: async url => … });
//   page.T.renderFeedTo(conteneur)          // T expose les fonctions et états utiles
//
// `stockage` simule localStorage (lu au chargement ET à chaque appel) ; `fetch` reçoit l'URL
// et rend un objet { ok, status, json() }. Les éléments sont des objets plats : innerHTML est
// une chaîne qu'on inspecte. `globaux` ajoute ou remplace des globales du bac (horloge,
// minuteries, requestAnimationFrame, flux…) pour les harnais qui pilotent le temps.
const vm = require('vm');
const { scriptsApp } = require('./sources');

function element() {
  return { style: {}, dataset: {}, innerHTML: '', textContent: '', value: '', hidden: false,
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener() {}, removeEventListener() {}, appendChild() {}, removeChild() {}, setAttribute() {}, getAttribute() { return null; },
    querySelector() { return null; }, querySelectorAll() { return []; }, focus() {}, remove() {},
    getContext() { return null; }, getBoundingClientRect() { return { width: 900, height: 600, left: 0, top: 0, bottom: 0, right: 900 }; } };
}

function chargerPage(opts = {}) {
  const stockage = Object.assign({}, opts.stockage || {});
  const ls = { getItem: k => (k in stockage ? stockage[k] : null), setItem: (k, v) => { stockage[k] = String(v); }, removeItem: k => { delete stockage[k]; } };
  const store = {};
  const appels = [];
  const sandbox = {
    console, Date, Math, JSON, Intl, Object, Array, String, Number, Boolean, Error, Promise, RegExp, Set, Map, Uint8Array, Uint32Array,
    isNaN, isFinite, parseFloat, parseInt, encodeURIComponent, decodeURIComponent, undefined,
    document: { getElementById: id => store[id] || (store[id] = element()), querySelector: () => element(), querySelectorAll: () => [],
      addEventListener() {}, removeEventListener() {}, createElement: () => element(), body: element(), documentElement: element(), head: element(), hidden: false },
    window: { innerWidth: 1440, innerHeight: 900, devicePixelRatio: 1, addEventListener() {}, removeEventListener() {},
      matchMedia: () => ({ matches: false, addEventListener() {} }), localStorage: ls, location: { href: 'file:///' } },
    localStorage: ls, requestAnimationFrame: () => 0, cancelAnimationFrame() {}, setTimeout: () => 0, setInterval: () => 0, clearTimeout() {}, clearInterval() {},
    fetch: async (url, o) => { appels.push(String(url)); return opts.fetch ? opts.fetch(String(url), o) : { ok: false, status: 0, json: async () => ({}) }; },
    navigator: { userAgent: 'node' }, performance: { now: () => 0 }, getComputedStyle: () => ({ getPropertyValue: () => '' }),
    ResizeObserver: function () { this.observe = () => {}; }, Image: function () {}, CanvasRenderingContext2D: function () {},
    history: { pushState() {}, replaceState() {} }, location: { href: 'file:///', search: '', hash: '' },
  };
  Object.assign(sandbox, opts.globaux || {});
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  let code = scriptsApp().map(s => s.texte).join('\n;\n').replace(/\ninit\(\);\s*$/, '\n');
  code += `
globalThis.__T__ = {
  get FICHES() { return FICHES; }, get PARAM() { return PARAM; }, get INDICATORS() { return INDICATORS; },
  get REGLAGES() { return REGLAGES; }, set REGLAGES(v) { REGLAGES = v; }, REGLAGES_DEFAUT, lireReglages,
  ETIQ, subTitle, ficheHtml, lectureCourte, phraseCarte, renderFeedTo, renderLive, modeCourant, FICHE_IND, apercuHtml, usageHtml,
  GLOSSAIRE_DEBUTANT, get activeSymbol() { return activeSymbol; }, set activeSymbol(v) { activeSymbol = v; },
  bandeProfil, mursFusionnes, fusionnerGrille, grilleChaleur, bandeLive, palier, ladderHtml,
  setData(d) { marketData = d; }, el: id => document.getElementById(id),
  get COLORS() { return COLORS; }, FORMES_BOUGIE, BOUGIE_DENSE_PX, CADENCES, ageBannerHtml,
  pixelsChaleur, rampeU32, HEAT_RAMPE, lireSiNouveau, lectureDue, etatPublication, majAges, fetchMarket, fetchPrice, fetchHeatmap,
  get marketData() { return marketData; }, get histHeatmap() { return histHeatmap; }, get livePrice() { return livePrice; },
  urlTicker, var24De, urlPremierePage, prechargee, DATA_URL, HEATMAP_URL, queueConnue, limiterCacheBougies, klineCache, BOUGIES_GARDEES,
};`;
  vm.runInContext(code, sandbox);
  return { T: sandbox.__T__, stockage, appels, element, sandbox };
}

module.exports = { chargerPage, element };
