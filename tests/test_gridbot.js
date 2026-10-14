// Le Grid Bot (section 🤖, « Les chiffres du marché ») : ce qu'il affiche après un backtest, hors
// navigateur. Revue du site du 14/10/2026, C12 (constats textes-12 et fonctionnement-6) : sur 1
// opération, « ✅ gagne et bat le marché » s'affichait en gros avec un Sharpe de 25 et « Gains /
// pertes : ∞ » ; sur 0, le verdict disait « perd » à 0,00 % ; un capital de −5 000 était gardé ;
// « Comparer au témoin » comparait le témoin à lui-même ; l'aide de la grille EMA écrivait un pas
// négatif, bornes à l'envers.
//
//   1. TROP PEU D'OPÉRATIONS : sous PARAM.gridBot.operationsMin opérations closes, ni verdict, ni
//      ✅ / ⚠️ / ❌, ni ratio de Sharpe, ni « Gains / pertes » ; « 2 opérations : trop peu pour
//      juger. », « Aucune opération sur cette période. » ; au-delà, le verdict revient. La frontière
//      suit PARAM.
//   2. COMPARER AU TÉMOIN : grisé quand la grille fixe est choisie, et sans effet ; sinon, les deux
//      lignes, « opération close » / « opérations closes » accordés, sans Sharpe sous le seuil.
//   3. CAPITAL : un nombre ≤ 0 est refusé (le champ reprend le capital d'avant, la phrase de la
//      calculette le dit) ; un capital > 0 est pris.
//   4. AIDE DE LA GRILLE : bornes dans l'ordre et pas sans signe, même quand la grille va du haut
//      vers le bas (grille EMA, prix sous l'EMA ; bornes saisies à l'envers).
//
// Bougies : la journée rejouée du 08/10/2026 à 15:40 UTC (tests/fixtures/rejeu-jour-0810.json, les
// mêmes que la page des tests « journée »), 50 dernières bougies de 15 min comme la vue de départ.
// USAGE   node tests/test_gridbot.js
const path = require('path'), vm = require('vm');
const REPO = path.resolve(__dirname, '..');
const { chargerPage } = require('./bac');
const H = require('./scenarios-jour-harnais');
const X = require(path.join(REPO, 'tests', 'fixtures', 'rejeu-jour-0810.json'));

let ko = 0;
const check = (nom, ok, det) => { if (!ok) ko++; console.log(`  ${ok ? '✓' : '✗'} ${nom}${!ok && det !== undefined ? ' — ' + JSON.stringify(det).slice(0, 500) : ''}`); };
const titre = t => console.log(`\n── ${t} ──`);
const texte = h => String(h).replace(/<\/div>/g, '\n').replace(/<[^>]+>/g, '').split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);

const page = chargerPage(), S = page.sandbox, el = page.T.el, P = page.T.PARAM;
const ctx = code => vm.runInContext(code, S);
const K = H.harnais(X, '2026-10-08T15:40:00Z').bougies(9e5);
S.__K = K.map(k => ({ time: k[0] / 1000, open: k[1], high: k[2], low: k[3], close: k[4], volume: 80 }));
ctx('candles = __K; drawChart = () => {}; viewStart = candles.length - 50; viewEnd = candles.length;');
const n = K.length, MIN = P.gridBot.operationsMin;
const STRATS = ctx('Object.keys(STRATEGIES)');
const backtest = k => S.runBacktest(k, S.__K, n - 50, n - 1, {}, 1000);
const stats = r => { S.showStratStats(r); return texte(el('stratStats').innerHTML); };
const VERDICT = /✅|❌|⚠️|gagne|perd|bat le marché|rapportait plus/;

// ── 1. Trop peu d'opérations ──
titre(`1. Sous ${MIN} opérations closes : ni verdict, ni Sharpe, ni « Gains / pertes »`);
check('PARAM.gridBot : le seuil (10) et le nombre visé (30)', MIN === 10 && P.gridBot.operationsVisees === 30, P.gridBot);
const res = {};
for (const k of STRATS) res[k] = backtest(k);
const nb = Object.values(res).map(r => r.tradeCount);
// Sans ces cas, les contrôles ne prouveraient rien : 0, 1, entre 2 et le seuil, au moins le seuil.
check(`la journée rejouée donne 0, 1, entre 2 et ${MIN - 1}, et au moins ${MIN} opérations (${STRATS.map(k => k + ' ' + res[k].tradeCount).join(', ')})`,
  nb.includes(0) && nb.includes(1) && nb.some(x => x >= 2 && x < MIN) && nb.some(x => x >= MIN), nb);
for (const k of STRATS) {
  const r = res[k], t = stats(r), m = r.tradeCount, tout = t.join(' / ');
  if (m < MIN) {
    const tete = m ? m + (m > 1 ? ' opérations' : ' opération') + ' : trop peu pour juger.' : 'Aucune opération sur cette période.';
    check(`${k} (${m}) : « ${tete} » en tête ; ni verdict ni ✅ / ⚠️ / ❌, ni Sharpe, ni « Gains / pertes », ni « ∞ » ; la note « Visez 30 opérations closes » ; aucun « (s) »`,
      t[0] === tete && !VERDICT.test(tout) && !/Sharpe|Gains \/ pertes|∞/.test(tout)
      && t[t.length - 1] === 'Visez ' + P.gridBot.operationsVisees + ' opérations closes : élargissez la période avec les champs « Du » / « Au ».' && !/\(s\)/.test(tout), t);
  } else {
    check(`${k} (${m}) : le verdict face au marché, le ratio de Sharpe et « Gains / pertes » ; pas de note « trop peu »`,
      /^(✅|⚠️|❌) /.test(t[0]) && / sur la même période$/.test(t[0]) && /Ratio de Sharpe : /.test(tout) && /Gains \/ pertes : /.test(tout) && !/trop peu|Visez/.test(tout), t);
  }
}
// La frontière, sur un vrai résultat : une opération de moins, le verdict part ; au seuil, il est là.
const grand = Object.values(res).find(r => r.tradeCount >= MIN);
const sous = stats(Object.assign({}, grand, { tradeCount: MIN - 1 })), au = stats(Object.assign({}, grand, { tradeCount: MIN }));
check(`frontière : ${MIN - 1} opérations → « ${MIN - 1} opérations : trop peu pour juger. » ; ${MIN} → le verdict`,
  sous[0] === (MIN - 1) + ' opérations : trop peu pour juger.' && !VERDICT.test(sous.join(' ')) && VERDICT.test(au[0]), { sous: sous[0], au: au[0] });
// Les dents : le seuil est lu dans PARAM, pas recopié.
P.gridBot.operationsMin = grand.tradeCount + 1;
const dent = stats(grand);
P.gridBot.operationsMin = MIN;
check(`PARAM.gridBot.operationsMin = ${grand.tradeCount + 1} → ${grand.tradeCount} opérations n'ont plus de verdict`,
  dent[0] === grand.tradeCount + ' opérations : trop peu pour juger.' && !/Sharpe/.test(dent.join(' ')), dent[0]);
// Les mots : une phrase courte (15 mots au plus), aucun conseil de marché.
const mots = t => t.replace(/[«»().,:;/]/g, ' ').split(/\s+/).filter(m => /[\p{L}\p{N}]/u.test(m));
const NEUFS = ['2 opérations : trop peu pour juger.', 'Aucune opération sur cette période.', 'Visez 30 opérations closes : élargissez la période avec les champs « Du » / « Au ».', 'La grille fixe est déjà le témoin.'];
check('les phrases nouvelles : 15 mots au plus, sans conseil (achetez, vendez, entrez…)', NEUFS.every(t => mots(t).length <= 15 && !/achet|vend|entrez|sortez|position/i.test(t)), NEUFS.map(t => mots(t).length));

// ── 2. Comparer au témoin ──
titre('2. « Comparer au témoin » : grisé quand le témoin est choisi ; sinon, accordé et sans Sharpe sous le seuil');
const bouton = el('stratDumbCmp');
ctx("btActiveStrategy = 'dumb_grid'; majComparer();");
el('stratStats').innerHTML = '<div>avant</div>';
ctx('onCompareDumbGrid()');
check('grille fixe choisie : bouton grisé (disabled), son titre dit pourquoi ; un appel ne compare rien',
  bouton.disabled === true && /témoin/.test(bouton.title) && el('stratStats').innerHTML === '<div>avant</div>', { disabled: bouton.disabled, title: bouton.title, stats: el('stratStats').innerHTML.slice(0, 120) });
ctx("btActiveStrategy = 'rsi_grid'; majComparer(); onCompareDumbGrid();");
const cmp = texte(el('stratStats').innerHTML), lignes = cmp.filter(l => /^(Grille .*) : /.test(l));
const accord = lignes.map(l => (l.match(/\((\d+) (opérations? closes?)(, ratio de Sharpe [^)]+)?\)$/) || []).slice(1));
check('grille RSI choisie : bouton actif ; deux lignes, « 1 opération close » / « N opérations closes », le Sharpe seulement à partir du seuil, aucun « (s) »',
  bouton.disabled === false && bouton.title === '' && /Comparaison avec la grille fixe/.test(cmp[0]) && lignes.length === 2
  && accord.every(([c, mot, sh]) => c !== undefined && mot === (+c > 1 ? 'opérations closes' : 'opération close') && (+c >= MIN) === !!sh)
  && accord.some(([c]) => +c < MIN) && !/\(s\)/.test(cmp.join(' ')), cmp);

// ── 3. Capital ──
titre('3. Capital : ≤ 0 refusé, comme dans la calculette');
el('stratSelect').value = 'bb_grid';
const capital = v => { el('stratCapital').value = v; el('stratStats').innerHTML = ''; ctx('onStratParamChange()'); return { cap: ctx('btCapital'), champ: String(el('stratCapital').value), stats: texte(el('stratStats').innerHTML) }; };
const MSG = ctx('Calculette.MESSAGES.capital_nul');
const c1 = capital('-5000'), c2 = capital('0'), c3 = capital('2500'), c4 = capital(''), c5 = capital('-1');
check(`« -5000 » : refusé, le champ reprend 1 000 ; « ${MSG} »`, c1.cap === 1000 && c1.champ === '1000' && c1.stats.join() === MSG, c1);
check('« 0 » : refusé de même', c2.cap === 1000 && c2.champ === '1000' && c2.stats.join() === MSG, c2);
check('« 2500 » : pris', c3.cap === 2500 && !c3.stats.length, c3);
check('champ vidé : le capital d\'avant revient, sans message', c4.cap === 2500 && c4.champ === '2500' && !c4.stats.length, c4);
check('« -1 » après 2 500 : refusé, le champ reprend 2 500', c5.cap === 2500 && c5.champ === '2500' && c5.stats.join() === MSG, c5);
ctx('btUserParams = {}; btCapital = 1000;');

// ── 4. Aide de la grille ──
titre('4. Aide de la grille : bornes dans l\'ordre, pas sans signe');
const aide = (k, params) => {
  S.__p = params || {};
  ctx(`btActiveStrategy = '${k}'; btUserParams = __p; renderStratHelp();`);
  const t = texte((el('stratHelp').innerHTML.match(/<div class="strat-auto">[\s\S]*?<\/div>/) || [''])[0]).join(' ');
  const m = t.match(/^(?:Auto|Bornes saisies à la main) : (.+?) → (.+?) · \d+ niveaux · pas de (.+?) · /);
  const nombre = s => parseFloat(s.replace(/[^\d,−-]/g, '').replace(',', '.').replace('−', '-'));
  return { t, lo: m && nombre(m[1]), hi: m && nombre(m[2]), pas: m && m[3] };
};
// Le cas du constat : la grille EMA va de l'EMA au prix, et le prix est sous l'EMA à 15:40.
const brut = ctx("(() => { const b = new GridBot('ema_grid', 1000), p = b.buildParams({}), i = candles.length - 1; const L = STRATEGIES.ema_grid.generateLevels(candles, i, p, b.computeIndicators(candles, i, p)); return [L[0].price, L[L.length - 1].price]; })()");
const ema = aide('ema_grid');
check(`grille EMA, niveaux du haut vers le bas (${Math.round(brut[0])} → ${Math.round(brut[1])}) : « bas → haut », pas sans signe`,
  brut[0] > brut[1] && ema.lo < ema.hi && Math.abs(ema.lo - brut[1]) < 0.01 && Math.abs(ema.hi - brut[0]) < 0.01 && !/^[−-]/.test(ema.pas), ema);
const main = aide('dumb_grid', { priceLow: 90000, priceHigh: 80000 });
check('bornes saisies à l\'envers (90 000 / 80 000) : « 80 000,00 $ → 90 000,00 $ », pas sans signe', main.lo === 80000 && main.hi === 90000 && /^Bornes saisies à la main/.test(main.t) && !/^[−-]/.test(main.pas), main);
ctx("btActiveStrategy = 'bb_grid'; btUserParams = {};");

console.log(ko ? `\n❌ GRID BOT : ${ko} contrôle(s) en échec` : '\n✅ GRID BOT : TOUS LES CONTRÔLES PASSENT');
process.exit(ko ? 1 : 0);
