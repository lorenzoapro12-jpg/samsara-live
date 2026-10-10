// Harnais de test : exécute le rendu réel du dashboard dans node, DOM stubbé.
// Les chemins sont dérivés de l'emplacement de ce fichier : le dépôt fonctionne
// cloné n'importe où.
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

/** Le HTML sans ses sous-arbres « expert-seul » (masqués en Débutant par display:none). */
function sansExpert(html) {
  const VIDES = /^(br|hr|img|input|meta|link|wbr|source)$/i;
  let out = '', i = 0;
  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt < 0) { out += html.slice(i); break; }
    out += html.slice(i, lt);
    const gt = html.indexOf('>', lt), tag = html.slice(lt, gt + 1), m = tag.match(/^<([a-z0-9]+)/i);
    if (m && /class="[^"]*\bexpert-seul\b/.test(tag) && !VIDES.test(m[1]) && !/\/>$/.test(tag)) {
      // Saute jusqu'à la fermeture assortie (même nom de balise, imbrications comptées).
      const nom = m[1].toLowerCase(), re = new RegExp('<(/?)' + nom + '\\b[^>]*>', 'gi');
      re.lastIndex = gt + 1;
      let prof = 1, x;
      while (prof && (x = re.exec(html))) prof += x[1] ? -1 : 1;
      i = x ? re.lastIndex : html.length;
      continue;
    }
    out += tag; i = gt + 1;
  }
  return out;
}
const texteDe = h => h.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;|&quot;/g, "'").replace(/\s+/g, ' ').trim();

const DATA = JSON.parse(fs.readFileSync(path.join(REPO, 'market-data.json'), 'utf8'));

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
  const hitsSrc = fb.find(texteServi(), fbList.terms);   // page + css/ + js/ + themes/

  console.log('\n════════════════════════════════════════');
  console.log(`  motifs interdits : ${fbList.terms.length} (${fbList.file}${fbList.local ? '' : ' — EXEMPLE, aucun motif réel'})`);

  // Contrôles de non-régression — valeurs lues depuis la source, pas codées en dur
  const D = DATA;
  const usd = v => Math.round(v).toLocaleString('en-US');
  // ⚠️ Même formateur que `fmtNum` de js/app.js — PAS `toFixed`.
  // Mesuré le 04/10/2026 : pour 0,615, `toFixed(2)` rend « 0.61 » et `toLocaleString`
  // rend « 0.62 ». Le harnais échouait donc sur SON propre rendu, uniquement les jours où
  // la variation tombait sur un x,xx5 — un faux rouge dépendant de la donnée vivante.
  const fmt = (v, d = 2) => Number(v).toLocaleString('en-US',
    { minimumFractionDigits: d, maximumFractionDigits: d });
  // Formats français de la page (js/format.js) recalculés ICI, indépendamment : virgule
  // décimale, espace pour les milliers, moins typographique, unité après le nombre.
  const fr = (v, d = 2) => (v < 0 && Number(Math.abs(v).toFixed(d)) !== 0 ? '−' : '') + Math.abs(Number(v)).toLocaleString('fr-FR',
    { minimumFractionDigits: d, maximumFractionDigits: d }).replace(/[\u00a0\u202f]/g, ' ');
  const frS = (v, d = 2) => (v > 0 && Number(v.toFixed(d)) !== 0 ? '+' : '') + fr(v, d);
  const usdFr = v => fr(Math.round(v), 0) + ' $';
  const checks = [
    ['Prix BTC réel', feed.innerHTML.includes(usdFr(D.btc.price))],
    ['Variation 24h', feed.innerHTML.includes(frS(D.btc.change_24h_pct) + ' % en 24 h')],
    ['L/S réel', feed.innerHTML.includes('L/S&nbsp;<b style="color:var(--ink-1)">' + fr(D.micro.ls_ratio, 2) + '</b>')],
    // Funding annualisé à 1 décimale, comme le chiffre clé du haut (même précision partout).
    ['Funding réel', feed.innerHTML.includes(frS(D.micro.funding_annual_pct, 1) + ' % annualisé')],
    ['OI réel', texteDe(feed.innerHTML).includes(fr(Math.round(D.micro.oi_btc), 0) + ' BTC')],
    ['DXY réel', feed.innerHTML.includes(fr(D.macro.dxy_spot))],
    ['Support 4h réel', feed.innerHTML.includes(usdFr(D.tf['4h'].support_30))],
    // Aucun nombre au format anglais visible (« 82,798 », « 1.53 ») ni prix « $82 » en tête.
    ['Nombres à la française (aucun « 82,798 » ni « $82 »)', !/\d,\d{3}\b(?![\d,])|\$\d/.test(texteDe(feed.innerHTML).replace(/\b(?:BTC|ETH|SOL|XRP|USDT|USD)\b/g, ''))],
    // L'état EMA20 / EMA50 du TF, sous son vrai nom : le badge disait « DEATH CROSS », nom
    // d'un croisement de SMA50 / SMA200 en daily — un autre objet (voir indicateurs.py).
    ['État EMA20 / EMA50 4h', feed.innerHTML.includes((D.tf['4h'].ema20_sous_ema50 ?? D.tf['4h'].death_cross_4h) ? 'EMA 20 &lt; EMA 50' : 'EMA 20 &gt; EMA 50')
      && !/DEATH CROSS|GOLDEN CROSS/.test(feed.innerHTML)],
    ['Mur bid dominant (prix complet)', feed.innerHTML.includes(usdFr(D.liquidity.bid_walls[0][0]))],
    ['Murs en BTC', /BTC<\/span>/.test(feed.innerHTML) && D.liquidity.unit === 'BTC'],
    ['Ratio carnet sur sa bande', feed.innerHTML.includes('±' + String(D.liquidity.bande_ref_pct).replace('.', ',') + ' %')],
    // Le régime GEX en mots (« long γ » / « short γ », comme le chiffre clé), jamais le code brut
    // du fichier (LONG_GAMMA), et sans couleur hausse / baisse (le GEX ne dit pas la direction).
    ['GEX', D.micro.gex_state && feed.innerHTML.includes(D.micro.gex_usd_1pct > 0 ? '>long γ<' : '>short γ<') && !feed.innerHTML.includes(D.micro.gex_state)
      && !/<b>GEX<\/b>[\s\S]{0,300}?(?:badge-haussier|badge-baissier|var\(--up\)|var\(--down\))[\s\S]{0,200}?\/ 1 %/.test(feed.innerHTML)],
    // GEX en USD / 1 % : l'ancien calcul publiait des BTC sous des seuils en dollars.
    ['GEX en USD / 1 %', /GEX<\/b>[\s\S]*?[+−]\d+(?:,\d+)? (?:k|M|Md) \$<\/b> \/ 1 %/.test(feed.innerHTML)],
    // CVD fenêtré : l'ancien était un cumul depuis le premier démarrage du daemon.
    // Chaque fenêtre est nommée ET porte sa valeur signée (barres divergentes depuis le 04/10).
    ['CVD 1h / 4h / 24h', ['1h', '4h', '24h'].every(w => new RegExp('dv-lbl">' + w + '</span>[\\s\\S]*?dv-val"><span[^>]*>[+−]?\\d+(?:,\\d+)?(?: k| M| Md)? \\$</span>').test(feed.innerHTML))],
    // 1 décimale, comme le chiffre clé « OI 24h » du haut.
    ['OI Δ24h glissant', feed.innerHTML.includes('Δ24h ' + frS(D.micro.oi_change_24h_pct, 1) + ' %')],
    // S/R : fenêtre réelle (30 bougies), plus l'ancien « 16 j » faux pour les trois TF.
    ['Fenêtre S/R réelle', /min\/max 5 j/.test(feed.innerHTML) && /min\/max 30 h/.test(feed.innerHTML) && !/16 j/.test(feed.innerHTML)],
    ['Tous blocs ok', new RegExp(Object.keys(D.status).length+'/'+Object.keys(D.status).length+' blocs').test(feed.innerHTML)],
    ['8 cartes rendues (dont Horloges et Contre-expertise)', (feed.innerHTML.match(/demon-card/g)||[]).length === 8
      && /carte-horloges/.test(feed.innerHTML) && /carte-contre/.test(feed.innerHTML)],
    // Horloges : chaque champ « horodatage » décrit (alias exclus) a sa ligne, sous son libellé.
    ['Horloges : un horodatage décrit = une ligne', Object.entries(D.meta.champs).filter(([, m]) => m.nature === 'horodatage' && !m.alias_de)
      .every(([, m]) => feed.innerHTML.includes('<span class="h-nom">' + m.libelle))],
    // Repère de la publication sur le graphique : à `updated`, au prix publié, jamais sans son âge.
    // L'heure est celle de l'appareil (le jour devant si ce n'est pas aujourd'hui), le prix au
    // format de l'Expert (« 82 798,49 $ ») : recalculés ici sans passer par Fmt.
    ['Repère de la publication (instant, prix, âge)', (() => {
      const tu = Date.parse(D.updated) / 1000, P = { left: 16, right: 75, W: 900, top: 10, ph: 400, minP: D.btc.price - 500, maxP: D.btc.price + 500, range: 1000, t0: tu - 900 * 10, pas: 900, gap: 8 };
      vm.runInContext('activeSymbol = "BTCUSDT"', sandbox);
      const r = sandbox.reperePublication(P);
      const d = new Date(Date.parse(D.updated)), n = new Date(), z = x => String(x).padStart(2, '0');
      const quand = (d.toDateString() === n.toDateString() ? '' : z(d.getDate()) + '/' + z(d.getMonth() + 1) + ' ') + z(d.getHours()) + ':' + z(d.getMinutes());
      const prixFin = D.btc.price.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/[\u00a0\u202f]/g, ' ') + ' $';
      return r && Math.abs(r.x - (16 + 80)) < 1e-6 && Math.abs(r.y - (10 + 200)) < 1e-6
        && r.texte === 'fichier ' + quand + ' · prix publié ' + prixFin + ' (' + vm.runInContext('Horloges', sandbox).texteAge(Date.now() - Date.parse(D.updated)) + ')'
        && sandbox.reperePublication(Object.assign({}, P, { t0: tu + 900 })) === null;
    })()],
    // Débutant (le mode par défaut, stockage vide) : ce qui reste visible quand les sous-arbres
    // .expert-seul sont masqués — un titre Débutant par carte, une phrase simple, aucun mot technique.
    ...(() => {
      const Gd = require(path.join(REPO, 'js/guide.js'));
      const CONSEIL = /\b(achetez|vendez|achète[rz]?\b|vends\b|il faut (?:acheter|vendre)|entrez|sortez|prenez position|signal d['’]achat|signal de vente|recommand(?:e|ons))/i;
      const cartes = feed.innerHTML.split('<div class="demon-card').slice(1);
      const deb = cartes.map(c => sansExpert('<div class="demon-card' + c));
      const titres = deb.map(c => texteDe((c.match(/<div class="demon-name">([\s\S]*?)<\/div>/) || [])[1] || ''));
      const vu = texteDe(sansExpert(feed.innerHTML)), bannis = Gd.motsBannis(vu);
      if (bannis.length) console.log('      Débutant, mots techniques visibles :', bannis.join(', '));
      return [
        ['Débutant : 8 cartes, chacune avec un titre Débutant (ni « Microstructure », ni « Liquidité », ni « Contre-expertise »)', cartes.length === 8 && titres.every(t => t && !/Microstructure|Liquidité|Contre-expertise|Marché live|Macro|Indicateurs|Flux/.test(t))],
        ['Débutant : chaque carte garde un texte en mots simples', deb.every(c => texteDe(c.replace(/<div class="demon-header">[\s\S]*?<div class="demon-body">/, '')).length > 20)],
        ['Débutant : texte visible sans mot technique (liste du Guide), sans conseil', !bannis.length && !CONSEIL.test(vu)],
        ['Débutant : les âges écrits restent réécrits chaque minute ([data-age-de] visibles)', /data-age-de/.test(sansExpert(feed.innerHTML))],
      ];
    })(),
    // Ni note de développeur (nom de fichier, version, débogage, capitales d'insistance), ni code
    // brut du fichier (LONG_GAMMA, NEGATIVE) : des mots, dans les deux modes.
    ['Aucune note de développeur ni code brut dans les cartes', !/market-data|\.json|\.py\b|meta\.champs|PÉRISSABLE|Piège mesuré|LONG_GAMMA|SHORT_GAMMA|\bNEGATIVE\b|\bPOSITIVE\b|\bNEUTRAL\b/.test(texteDe(feed.innerHTML))],
    // Vouvoiement partout (« Vérifié par ton navigateur » tutoyait).
    ['Vouvoiement : « Vérifié par votre navigateur », aucun « ton / ta / tes / tu »', /Vérifié par votre navigateur/.test(feed.innerHTML) && !/\b(?:ton|ta|tes|tu|toi)\b/i.test(texteDe(feed.innerHTML))],
    // Flux : il compte les blocs de la DERNIÈRE publication — ni « live », ni « sources à jour ».
    ['Flux : « N/N blocs publiés », jamais « blocs live » ni « sources à jour »', /\d+\/\d+ blocs publiés/.test(feed.innerHTML) && !/blocs live|sources à jour|Toutes les données publiées sont arrivées/.test(feed.innerHTML)],
    // Un ratio affiché « 1,00 » n'a pas de couleur (il était rouge, comme un penchant vendeur).
    ['Ratio affiché 1,00 : sans couleur ; 1,01 / 0,99 colorés', sandbox.clsCote(1.004, 1, 2) === '' && sandbox.clsCote(0.996, 1, 2) === '' && sandbox.clsCote(1.006, 1, 2) === 'stat-pos' && sandbox.clsCote(0.994, 1, 2) === 'stat-neg'],
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
