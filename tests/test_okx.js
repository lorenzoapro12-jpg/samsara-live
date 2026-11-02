// Paires OKX (js/okx.js) — hors ligne, fetch simulé.
//   1. un symbole Binance (sans tiret) passe tel quel, sans toucher OKX ;
//   2. un contrat OKX : bougies remises dans l'ordre de Binance, volume en unités de l'actif,
//      jour et semaine en UTC, pages enchaînées jusqu'à la limite, endTime respecté ;
//   3. prix 24 h sous les noms de Binance (lastPrice, openPrice) ;
//   4. www.okx.com coupé ou en 5xx → www.okx.cab, et la suite y reste ; les deux coupés → TypeError ;
//   5. limite OKX (50011) → HTTP 429, que la page nomme « limite de requêtes ».
const fs = require('fs'), vm = require('vm'), path = require('path');
const CODE = fs.readFileSync(path.join(__dirname, '..', 'js', 'okx.js'), 'utf8');
let ko = 0;
const check = (nom, ok, info) => { console.log(`  ${ok ? '✓' : '✗'} ${nom}${ok || info === undefined ? '' : ' — ' + JSON.stringify(info)}`); if (!ok) ko = 1; };

const H = 3600e3, T0 = Date.UTC(2026, 10, 2, 8);   // dernière bougie d'1 h : 02/11/2026 08:00 UTC
// Marché simulé : 2 000 bougies d'1 h, OKX les rend du plus récent au plus ancien.
const marche = Array.from({ length: 2000 }, (_, i) => { const t = T0 - i * H, p = 3900 + i; return [String(t), String(p), String(p + 2), String(p - 2), String(p + 1), String(1000 * (i + 1)), String(i + 1), '0', '1']; });
const json = (corps, status = 200) => Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(corps) });
function okx(u) {
  const q = new URL(u).searchParams, n = +q.get('limit') || 100;
  if (u.includes('/market/ticker')) return json({ code: '0', data: [{ instId: q.get('instId'), last: '3903.6', open24h: '3892.4', high24h: '3925.7', low24h: '3888.3', volCcy24h: '39052.877', ts: String(T0) }] });
  if (q.get('instId') === 'FOO-USDT-SWAP') return json({ code: '51001', data: [], msg: 'inconnu' });
  const after = q.get('after') ? +q.get('after') : Infinity;
  return json({ code: '0', data: marche.filter(k => +k[0] < after).slice(0, Math.min(n, 300)), msg: '' });
}
function monter(regle) {
  const appels = [];
  const g = { fetch: (u, o) => { appels.push(u); return regle(u, o); }, Response, URL };
  g.window = g;
  vm.runInNewContext(CODE, g);
  return { g, appels };
}
const coupe = () => Promise.reject(new TypeError('Failed to fetch'));
const B = 'https://api.binance.com/api/v3/';

(async () => {
  { const { g, appels } = monter(u => u.startsWith(B) ? json([[1, '1', '1', '1', '1', '1']]) : okx(u));
    const r = await g.fetch(B + 'klines?symbol=BTCUSDT&interval=1h&limit=2');
    check('BTCUSDT : la requête part chez Binance, telle quelle', r.status === 200 && appels.length === 1 && appels[0] === B + 'klines?symbol=BTCUSDT&interval=1h&limit=2', appels);
    await g.fetch(B + 'time');
    check('les autres adresses ne sont pas touchées', appels[1] === B + 'time', appels); }

  { const { g, appels } = monter(okx);
    const r = await g.fetch(B + 'klines?symbol=XAU-USDT-SWAP&interval=1h&limit=1000');
    const d = await r.json();
    check('1 000 bougies demandées → 1 000 rendues, sans doublon', d.length === 1000 && new Set(d.map(k => k[0])).size === 1000, d.length);
    check('ordre de Binance : de la plus ancienne à la plus récente, la dernière = la plus récente d’OKX', d.every((k, i) => !i || k[0] > d[i - 1][0]) && d[999][0] === T0, [d[0][0], d[999][0]]);
    check('colonnes : ouverture, o, h, l, c, volume en unités de l’actif (volCcy), clôture', d[999][1] === '3900' && d[999][4] === '3901' && d[999][5] === '1' && d[999][6] === T0 + H - 1, d[999]);
    check('pages : /market/candles d’abord, puis /market/history-candles en remontant', /\/market\/candles\?/.test(appels[0]) && appels.slice(1).every(u => /history-candles.*after=/.test(u)) && appels.length === 4, appels);
    check('hôte principal : www.okx.com', appels.every(u => u.startsWith('https://www.okx.com/')), appels); }

  { const { g, appels } = monter(okx);
    const fin = T0 - 1500 * H;
    const d = await (await g.fetch(B + 'klines?symbol=XAU-USDT-SWAP&interval=1h&limit=1000&endTime=' + fin)).json();
    check('endTime : les bougies ouvertes au plus tard à endTime, et les 1 000 qui le précèdent (ici les 500 restantes)', d.length === 500 && d[d.length - 1][0] === fin && /history-candles.*after=/.test(appels[0]), [d.length, d[d.length - 1] && d[d.length - 1][0]]); }

  { const { g, appels } = monter(okx);
    await g.fetch(B + 'klines?symbol=CL-USDT-SWAP&interval=1d&limit=2');
    await g.fetch(B + 'klines?symbol=CL-USDT-SWAP&interval=4h&limit=2');
    check('1 jour en UTC (1Dutc) comme Binance ; 4 h tel quel', /bar=1Dutc/.test(appels[0]) && /bar=4H/.test(appels[1]), appels); }

  { const { g } = monter(okx);
    const t = await (await g.fetch(B + 'ticker/24hr?symbol=XAU-USDT-SWAP&type=MINI')).json();
    check('prix 24 h : lastPrice et openPrice comme Binance', t.lastPrice === '3903.6' && t.openPrice === '3892.4', t); }

  for (const [nom, panne] of [['coupé', coupe], ['en 503', () => json({}, 503)]]) {
    const { g, appels } = monter(u => u.startsWith('https://www.okx.com/') ? panne() : okx(u));
    const t = await (await g.fetch(B + 'ticker/24hr?symbol=XAU-USDT-SWAP&type=MINI')).json();
    check(`www.okx.com ${nom} → même chemin sur www.okx.cab`, t.lastPrice === '3903.6' && appels[1] === appels[0].replace('www.okx.com', 'www.okx.cab'), appels);
    await g.fetch(B + 'ticker/24hr?symbol=XAU-USDT-SWAP&type=MINI');
    check(`www.okx.com ${nom} → la suite part directement sur le repli`, appels.length === 3 && appels[2].startsWith('https://www.okx.cab/') && g.__okxHote === 'https://www.okx.cab', appels);
  }

  { const { g } = monter(() => coupe());
    let e = null; try { await g.fetch(B + 'ticker/24hr?symbol=XAU-USDT-SWAP&type=MINI'); } catch (x) { e = x; }
    check('les deux hôtes coupés → TypeError (la page dit « hors ligne »)', e instanceof TypeError, String(e)); }

  { const { g } = monter(u => json({ code: '50011', data: [], msg: 'Too Many Requests' }));
    const r = await g.fetch(B + 'klines?symbol=XAU-USDT-SWAP&interval=1h&limit=2');
    check('limite OKX (50011) → HTTP 429', r.status === 429 && r.ok === false, r.status); }

  { const { g } = monter(okx);
    const r = await g.fetch(B + 'klines?symbol=FOO-USDT-SWAP&interval=1h&limit=2');
    check('contrat inconnu → réponse en erreur, jamais un graphique vide présenté comme juste', r.ok === false, r.status); }

  { const { g } = monter(okx);
    const r = await g.fetch(B + 'klines?symbol=XAU-USDT-SWAP&interval=3d&limit=2');
    check('intervalle absent chez OKX → réponse en erreur', r.ok === false, r.status); }

  // Le menu et le code de la page : chaque contrat du menu a son nom et son unité.
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
  const menu = [...html.matchAll(/changeSymbol\('([A-Z0-9]+-USDT-SWAP)'/g)].map(m => m[1]);
  check('menu : 8 contrats de matières premières OKX', menu.length === 8, menu);
  check('chacun a son nom et son unité de volume dans js/app.js (MATIERES)', menu.every(s => new RegExp("'" + s + "': \\{ nom: '[^']+', unite: '[^']+' \\}").test(app)), menu);
  const ordre = [...html.matchAll(/<script[^>]*src="(js\/[^"]+)"/g)].map(m => m[1]);
  check('js/okx.js chargé juste après les replis, avant js/app.js', ordre.indexOf('js/okx.js') === 2 && ordre.indexOf('js/okx.js') < ordre.indexOf('js/app.js'), ordre);
  process.exit(ko);
})();
