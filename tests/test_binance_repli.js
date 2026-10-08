// Repli Binance (js/binance-repli.js) — hors ligne, fetch simulé.
//   1. api.binance.com répond → le miroir n'est jamais appelé ;
//   2. réseau coupé, 451 ou 403 → la même requête repart sur data-api.binance.vision,
//      et la suite de la visite y reste ;
//   3. les deux injoignables → l'erreur ou la réponse d'origine remonte, l'hôte ne change pas ;
//   4. une lecture annulée (AbortError) n'est pas rejouée ; les autres hôtes ne sont pas touchés.
const fs = require('fs'), vm = require('vm'), path = require('path');
const CODE = fs.readFileSync(path.join(__dirname, '..', 'js', 'binance-repli.js'), 'utf8');
let ko = 0;
const check = (nom, ok, info) => { console.log(`  ${ok ? '✓' : '✗'} ${nom}${ok || info === undefined ? '' : ' — ' + JSON.stringify(info)}`); if (!ok) ko = 1; };

const P = 'https://api.binance.com/api/v3/', M = 'https://data-api.binance.vision/api/v3/';
function monter(regle) {
  const appels = [];
  const g = { fetch: (u, o) => { appels.push(u); return regle(u, o); } };
  g.window = g;
  vm.runInNewContext(CODE, g);
  return { g, appels };
}
const rep = status => Promise.resolve({ ok: status >= 200 && status < 300, status });
const coupe = () => Promise.reject(new TypeError('Failed to fetch'));

(async () => {
  { const { g, appels } = monter(() => rep(200));
    const r = await g.fetch(P + 'time');
    check('principal joignable : une seule requête, sur api.binance.com', r.status === 200 && appels.length === 1 && appels[0] === P + 'time', appels);
    check('hôte noté : principal', g.__binanceHote === 'https://api.binance.com/'); }

  for (const [nom, regle] of [['réseau coupé', u => u.startsWith(P) ? coupe() : rep(200)],
                             ['HTTP 451', u => rep(u.startsWith(P) ? 451 : 200)],
                             ['HTTP 403', u => rep(u.startsWith(P) ? 403 : 200)]]) {
    const { g, appels } = monter(regle);
    const r = await g.fetch(P + 'klines?symbol=BTCUSDT&interval=15m&limit=1000', { cache: 'no-cache' });
    check(`${nom} → même chemin sur le miroir`, r.status === 200 && appels[1] === M + 'klines?symbol=BTCUSDT&interval=15m&limit=1000', appels);
    await g.fetch(P + 'time');
    check(`${nom} → la suite part directement sur le miroir`, appels.length === 3 && appels[2] === M + 'time' && g.__binanceHote === 'https://data-api.binance.vision/', appels);
  }

  { const { g, appels } = monter(() => coupe());
    let e = null; try { await g.fetch(P + 'time'); } catch (x) { e = x; }
    check('les deux coupés → l\'erreur d\'origine remonte', e instanceof TypeError && appels.length === 2, appels);
    check('les deux coupés → l\'hôte reste le principal', g.__binanceHote === 'https://api.binance.com/'); }

  { const { g } = monter(u => u.startsWith(P) ? rep(451) : coupe());
    const r = await g.fetch(P + 'time');
    check('451 puis miroir coupé → la réponse 451 remonte (la page nomme le refus régional)', r.status === 451); }

  { const { g: g2, appels: a2 } = monter(u => rep(u.startsWith(P) ? 451 : 503));
    await g2.fetch(P + 'time');
    check('miroir en 503 → l\'hôte ne bascule pas', g2.__binanceHote === 'https://api.binance.com/' && a2.length === 2, a2); }

  { const { g, appels } = monter(() => { const e = new Error('annulé'); e.name = 'AbortError'; return Promise.reject(e); });
    let e = null; try { await g.fetch(P + 'time'); } catch (x) { e = x; }
    check('lecture annulée → pas rejouée sur le miroir', e && e.name === 'AbortError' && appels.length === 1, appels); }

  { const { g, appels } = monter(() => coupe());
    const raw = 'https://raw.githubusercontent.com/lorenzoapro12-jpg/samsara-live/master/market-data.json';
    try { await g.fetch(raw); } catch (x) {}
    check('autres hôtes : jamais réécrits', appels.length === 1 && appels[0] === raw, appels); }

  console.log(ko ? '\n❌ REPLI BINANCE : ÉCHEC' : '\n✅ REPLI BINANCE : TOUS LES CONTRÔLES PASSENT');
  process.exit(ko);
})();
