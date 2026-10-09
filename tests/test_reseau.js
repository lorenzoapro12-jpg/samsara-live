// Ce que le terminal demande au réseau, et quand — hors ligne (DOM minimal, horloge simulée).
//
// POURQUOI (07/10/2026, mesures : texte-5 de l'audit). La page consommait ~4,8 Mo/h :
//   · market-data.json relu CHAQUE MINUTE avec `?t=` et `no-store` — 8,6 Ko à chaque fois, alors
//     que le CDN ignore la requête (même copie, même âge) et que le fichier ne change qu'au
//     quart d'heure ; puis cartes refaites et onde du voyant, 14 fois sur 15 pour rien ;
//   · le prix en ticker/24hr complet (559 o par seconde, 77 % des octets) ;
//   · les lectures du premier écran ne partaient qu'après l'exécution de js/app.js.
//
// CE QUI EST VÉRIFIÉ
//   1. market-data.json : sans paramètre d'URL, en revalidation (`no-cache`) ; relu seulement
//      quand une publication est attendue ; la même publication relue n'est pas réaffichée et
//      ne fait pas onduler le voyant ; une nouvelle, oui ; un échec se retente au tour suivant ;
//      entre deux lectures, les âges affichés avancent quand même ;
//   2. le prix : ticker/24hr au format MINI, variation calculée sur l'ouverture de la MÊME
//      réponse (= priceChangePercent de Binance, à son arrondi près) ;
//   3. le script de tête d'index.html précharge EXACTEMENT les URL que la page demande au
//      démarrage (sinon le préchargement serait perdu), et une réponse préchargée sert une fois ;
//   4. la queue de bougies inchangée n'invalide rien ; le cache de bougies est borné.
//
// USAGE   node tests/test_reseau.js
const fs = require('fs'), path = require('path');
const { chargerPage } = require('./bac');
const { scriptsApp } = require('./sources');
const REPO = path.resolve(__dirname, '..');

let ko = 0;
const check = (nom, ok, det) => { if (!ok) ko++; console.log(`  ${ok ? '✓' : '✗'} ${nom}${!ok && det !== undefined ? ' — ' + JSON.stringify(det).slice(0, 300) : ''}`); };
const titre = t => console.log(`\n── ${t} ──`);

// Horloge simulée : Date.now() rend `maintenant` ; new Date() sans argument aussi.
let maintenant = Date.parse('2026-10-07T12:00:00Z');
class DateSimulee extends Date { constructor(...a) { if (a.length) super(...a); else super(maintenant); } static now() { return maintenant; } }
const MIN = 60000;

const DATA = JSON.parse(fs.readFileSync(path.join(REPO, 'market-data.json'), 'utf8'));
let publication = Object.assign({}, DATA, { updated: new Date(maintenant - 2 * MIN).toISOString() });
const lectures = [];
let panne = false;
const page = chargerPage({
  // En Expert : le contrôle du format du prix (« $83,512.51 », « −3.05 % ») garde toute sa force ;
  // le mode Débutant écrit les mêmes valeurs autrement (« 83 513 $ », « −3,05 % en 24 h »),
  // contrôlé à part plus bas.
  stockage: { 'samsara-mode': 'expert' },
  // requestAnimationFrame immédiat : l'onde du voyant se repose deux images plus tard.
  globaux: { Date: DateSimulee, TextDecoder, Uint8ClampedArray, requestAnimationFrame: f => { f(0); return 1; } },
  fetch: async (url, o) => {
    lectures.push({ url, o });
    if (panne) throw new Error('réseau coupé');
    if (/ticker\/24hr/.test(url)) return { ok: true, status: 200, json: async () => ({ symbol: 'BTCUSDT', openPrice: '86144.01000000', lastPrice: '83512.51000000', highPrice: '86698.99', lowPrice: '83346.27', volume: '19868.3', quoteVolume: '1681587428.3', count: 4764779 }) };
    const texte = JSON.stringify(publication);
    return { ok: true, status: 200, text: async () => texte, json: async () => JSON.parse(texte) };
  },
});
const T = page.T, el = T.el;
// Le voyant et la bande : des éléments qui gardent leurs classes et leur contenu.
function classes() { const c = new Set(); return { add: (...k) => k.forEach(x => c.add(x)), remove: (...k) => k.forEach(x => c.delete(x)), toggle: (k, v) => (v === undefined ? !c.has(k) : v) ? c.add(k) : c.delete(k), contains: k => c.has(k), set: c }; }
const dot = el('dot'); dot.classList = classes();
const ajouts = []; const add0 = dot.classList.add; dot.classList.add = (...k) => { ajouts.push(...k); add0(...k); };
const ages = [];   // les [data-age-de] que la page réécrit
page.sandbox.document.querySelectorAll = sel => sel === '[data-age-de]' ? ages : [];
const feed = el('feed');
let rendus = 0; let html = '';
Object.defineProperty(feed, 'innerHTML', { get: () => html, set: v => { rendus++; html = v; } });

(async () => {
  titre('1. market-data.json : revalidé, et seulement quand une publication est attendue');
  // Le script de tête a déjà lancé la lecture (au chargement du bac) : la page la reprend.
  const l0 = lectures.filter(x => /market-data/.test(x.url));
  await T.fetchMarket(true);
  check('URL sans paramètre (le CDN ignore la requête) et cache « no-cache » (revalidation, 304)',
    l0.length === 1 && l0[0].url === T.DATA_URL && !/\?/.test(l0[0].url) && l0[0].o && l0[0].o.cache === 'no-cache', l0);
  check('première lecture : celle du script de tête, reprise (aucune requête de plus)', lectures.filter(x => /market-data/.test(x.url)).length === 1);
  check('première lecture : cartes rendues, une onde du voyant', rendus === 1 && ajouts.filter(k => k === 'ping').length === 1, { rendus, ajouts });
  // Un tour une minute plus tard : rien n'est attendu.
  ages.push({ textContent: '2' });
  maintenant += MIN;
  await T.fetchMarket();
  check('une minute plus tard (rien d’attendu) : aucune requête, cartes intactes, pas d’onde',
    lectures.filter(x => /market-data/.test(x.url)).length === 1 && rendus === 1 && ajouts.filter(k => k === 'ping').length === 1);
  check('… mais l’âge affiché avance (3 min)', ages[0].textContent === '3', ages);
  // La publication suivante est attendue : relue chaque tour ; la même publication → rien.
  maintenant = Date.parse(publication.updated) + (T.CADENCES.attendue_min * 60 + T.CADENCES.marge_publication_s) * 1000;
  await T.fetchMarket();
  check('publication attendue mais pas encore là (même `updated`) : relue, ni cartes refaites ni onde',
    lectures.filter(x => /market-data/.test(x.url)).length === 2 && rendus === 1 && ajouts.filter(k => k === 'ping').length === 1, { rendus });
  maintenant += MIN;
  publication = Object.assign({}, DATA, { updated: new Date(maintenant - 30000).toISOString() });
  const ondes = ajouts.filter(k => k === 'ping').length;
  await T.fetchMarket();
  check('nouvelle publication : cartes refaites, une onde (relancée sans mise en page forcée)',
    rendus === 2 && T.marketData.updated === publication.updated && ajouts.filter(k => k === 'ping').length === ondes + 1 && dot.classList.contains('ping'));
  maintenant += MIN;
  await T.fetchMarket();
  check('le tour suivant : plus rien d’attendu, aucune requête', lectures.filter(x => /market-data/.test(x.url)).length === 3);
  maintenant += T.CADENCES.relecture_max_min * MIN;
  await T.fetchMarket();
  check(`au plus tard ${T.CADENCES.relecture_max_min} min après la dernière lecture : relue (publication hors cadence)`, lectures.filter(x => /market-data/.test(x.url)).length === 4);
  panne = true; maintenant += T.CADENCES.relecture_max_min * MIN; await T.fetchMarket(); panne = false;
  check('un échec : l’erreur est dite à la place des cartes', /class="error"/.test(html));
  maintenant += MIN; await T.fetchMarket();
  check('un échec se retente au tour suivant', lectures.filter(x => /market-data/.test(x.url)).length === 6);
  check('… et les cartes reviennent, même si la publication n’a pas changé', !/class="error"/.test(html) && /demon-card/.test(html));
  // Âge qui franchit le seuil « retard » sans nouvelle publication : le bandeau apparaît.
  const r0 = rendus;
  maintenant = Date.parse(publication.updated) + (T.CADENCES.vieux_min + 1) * MIN;
  await T.fetchMarket();
  check(`seuil « retard » (${T.CADENCES.vieux_min} min) franchi : cartes refaites (bandeau d’âge), voyant au calme`, rendus > r0 && /age-banner/.test(html) && dot.classList.contains('calme'));

  titre('2. Le prix : ticker MINI, variation sur l’ouverture de la même réponse');
  check('URL du prix : ticker/24hr au format MINI', T.urlTicker('BTCUSDT') === 'https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT&type=MINI');
  const v = T.var24De({ openPrice: '86144.01000000', lastPrice: '83512.51000000' });
  check(`variation = (dernier − ouverture) / ouverture : ${v.toFixed(4)} % ; Binance publie −3.055 (arrondi à 3 décimales)`, Math.abs(v - (-3.055)) < 0.0005 && v.toFixed(2) === '-3.05', v);
  check('réponse complète (sans openPrice) : priceChangePercent en repli', T.var24De({ lastPrice: '1', priceChangePercent: '0.4' }) === 0.4);
  check('le prix du premier écran : préchargé par le script de tête, au format MINI', lectures.filter(x => /ticker/.test(x.url)).map(x => x.url).join() === T.urlTicker('BTCUSDT'));
  await T.fetchPrice();                                    // reprend le préchargement
  lectures.length = 0;
  await T.fetchPrice();
  check('fetchPrice demande ensuite le format MINI, et rien d’autre', lectures.length === 1 && lectures[0].url === T.urlTicker('BTCUSDT'), lectures.map(x => x.url));
  check('prix et variation affichés depuis la réponse MINI', el('price').textContent === '$83,512.51' && el('var24').textContent === '−' + Math.abs(v).toFixed(2) + ' %', [el('price').textContent, el('var24').textContent]);
  // Débutant : les mêmes valeurs, au format français, la durée de la variation dite.
  page.stockage['samsara-mode'] = 'debutant';
  await T.fetchPrice();
  check('Débutant : même prix et même variation, écrits « 83 513 $ » et « −3,05 % en 24 h »', /^83\s513\s\$$/.test(el('price').textContent) && el('var24').textContent === '−' + Math.abs(v).toFixed(2).replace('.', ',') + ' % en 24 h', [el('price').textContent, el('var24').textContent]);
  page.stockage['samsara-mode'] = 'expert';
  await T.fetchPrice();
  check('… et de retour en Expert, le format d’avant', el('price').textContent === '$83,512.51', el('price').textContent);

  titre('3. Le préchargement du script de tête : les URL exactes du démarrage');
  const scripts = scriptsApp(), tete = scripts.find(s => s.fichier === 'index.html (inline)');
  check('le repli Binance est installé avant tout autre script (préchargement compris)', scripts[0].fichier === 'js/binance-repli.js', scripts.map(s => s.fichier));
  const prech = [...tete.texte.matchAll(/lire\((B \+ )?'([^']+)'/g)].map(m => (m[1] ? 'https://api.binance.com/api/v3/' : '') + m[2]);
  const attendues = [T.urlPremierePage('BTCUSDT', '15m'), T.urlTicker('BTCUSDT'), T.DATA_URL].sort();
  check('le premier script en ligne d’index.html précharge la première page de bougies, le prix et market-data.json — mêmes URL que js/app.js',
    tete.fichier === 'index.html (inline)' && JSON.stringify(prech.slice().sort()) === JSON.stringify(attendues), { prech, attendues });
  check('… pour la paire et l’intervalle par défaut de la page', /let marketData = null, livePrice = null, candles = \[\], chartInterval = '15m';/.test(fs.readFileSync(path.join(REPO, 'js/app.js'), 'utf8'))
    && /let activeSymbol = 'BTCUSDT';/.test(fs.readFileSync(path.join(REPO, 'js/app.js'), 'utf8')));
  check('market-data.json préchargé en revalidation (no-cache), comme la page le lit', /lire\('https:\/\/raw\.githubusercontent\.com[^']+market-data\.json', \{ cache: 'no-cache' \}\)/.test(tete.texte));
  page.sandbox.window.__precharge = { 'u://x': Promise.resolve('R') };
  const p1 = T.prechargee('u://x'), p2 = T.prechargee('u://x');
  check('une réponse préchargée sert UNE fois (la suivante repart sur le réseau)', p1 && (await p1) === 'R' && p2 === null);

  titre('4. Bougies : queue inchangée, cache borné');
  const c = (t, x) => ({ time: t, open: x, high: x + 1, low: x - 1, close: x, volume: 5 });
  const hist = [c(1, 10), c(2, 11), c(3, 12)];
  check('queue identique à l’historique : reconnue (ni mémo vidé, ni dessin)', T.queueConnue(hist, [c(2, 11), c(3, 12)]) === true);
  check('dernière clôture changée : non reconnue', T.queueConnue(hist, [c(2, 11), Object.assign(c(3, 12), { close: 12.5 })]) === false);
  check('nouvelle bougie : non reconnue', T.queueConnue(hist, [c(3, 12), c(4, 13)]) === false);
  for (let i = 0; i < 12; i++) T.klineCache['SYM' + i + '_15m'] = { data: [c(1, 1)], ts: 1000 + i };
  T.klineCache['BTCUSDT_15m'] = { data: [c(1, 1)], ts: 0 };       // l'historique affiché, le plus ancien
  T.limiterCacheBougies('SYM0_15m');
  const restants = Object.keys(T.klineCache);
  check(`cache de bougies borné à ${T.BOUGIES_GARDEES} historiques, en gardant l’affiché et le demandé, sinon les plus récents`,
    restants.length === T.BOUGIES_GARDEES && restants.includes('BTCUSDT_15m') && restants.includes('SYM0_15m') && restants.includes('SYM11_15m') && !restants.includes('SYM1_15m'), restants);

  console.log(ko ? `\n❌ RÉSEAU : ${ko} contrôle(s) en échec` : '\n✅ RÉSEAU : LES BONNES LECTURES, AU BON MOMENT');
  process.exit(ko ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
