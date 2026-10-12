// Repli des fichiers publiés (js/repli-raw.js) — hors ligne, fetch simulé.
//   1. raw.githubusercontent.com répond → aucune autre requête ;
//   2. raw injoignable → market-data.json / heatmap.json relus sur la copie de la page (même
//      origine), previsions.json sur l'API GitHub (contenu brut) ;
//   3. une réponse HTTP (404, 503) n'est jamais rejouée ; ancêtres et branche `direct` : pas de repli ;
//   4. les deux coupés → l'erreur d'origine remonte ; page en file:// → pas de repli ;
//   5. une lecture annulée (AbortError) n'est pas rejouée ; les autres hôtes ne sont pas touchés.
const fs = require('fs'), vm = require('vm'), path = require('path');
const CODE = fs.readFileSync(path.join(__dirname, '..', 'js', 'repli-raw.js'), 'utf8');
let ko = 0;
const check = (nom, ok, info) => { console.log(`  ${ok ? '✓' : '✗'} ${nom}${ok || info === undefined ? '' : ' — ' + JSON.stringify(info)}`); if (!ok) ko = 1; };

const RAW = 'https://raw.githubusercontent.com/lorenzoapro12-jpg/samsara-live/';
const PAGE = 'https://lorenzoapro12-jpg.github.io/samsara-live/index.html';
function monter(regle, href) {
  const appels = [];
  const g = { fetch: (u, o) => { appels.push({ u, o }); return regle(u, o); }, URL, location: new URL(href || PAGE) };
  g.window = g;
  vm.runInNewContext(CODE, g);
  return { g, appels };
}
const rep = status => Promise.resolve({ ok: status >= 200 && status < 300, status });
const coupe = () => Promise.reject(new TypeError('Failed to fetch'));
const rawCoupe = u => u.startsWith(RAW) ? coupe() : rep(200);

(async () => {
  { const { g, appels } = monter(() => rep(200));
    const r = await g.fetch(RAW + 'master/market-data.json', { cache: 'no-cache' });
    check('raw joignable : une seule requête, sur raw', r.status === 200 && appels.length === 1 && appels[0].u === RAW + 'master/market-data.json', appels); }

  for (const f of ['market-data.json', 'heatmap.json']) {
    const { g, appels } = monter(rawCoupe);
    const r = await g.fetch(RAW + 'master/' + f, { cache: 'no-cache' });
    check(`raw coupé → ${f} relu sur la copie de la page, mêmes options`, r.status === 200 && appels.length === 2
      && appels[1].u === 'https://lorenzoapro12-jpg.github.io/samsara-live/' + f && appels[1].o.cache === 'no-cache', appels);
    await g.fetch(RAW + 'master/' + f);
    check(`… et raw redemandé en premier à la lecture suivante`, appels[2].u === RAW + 'master/' + f, appels.map(a => a.u));
  }

  { const { g, appels } = monter(rawCoupe);
    const r = await g.fetch(RAW + 'previsions/previsions.json', { cache: 'no-cache' });
    check('raw coupé → previsions.json relu sur l’API GitHub, en contenu brut', r.status === 200 && appels.length === 2
      && appels[1].u === 'https://api.github.com/repos/lorenzoapro12-jpg/samsara-live/contents/previsions.json?ref=previsions'
      && appels[1].o.headers.Accept === 'application/vnd.github.raw' && appels[1].o.cache === 'no-cache', appels); }

  for (const [nom, u] of [['ancêtre master~4', RAW + 'master~4/market-data.json'], ['branche direct', RAW + 'direct/market-data.json']]) {
    const { g, appels } = monter(rawCoupe);
    let e = null; try { await g.fetch(u); } catch (x) { e = x; }
    check(`${nom} : pas de repli, l’erreur remonte`, e instanceof TypeError && appels.length === 1, appels); }

  for (const st of [404, 503]) {
    const { g, appels } = monter(u => rep(u.startsWith(RAW) ? st : 200));
    const r = await g.fetch(RAW + 'previsions/previsions.json');
    check(`raw en ${st} : la réponse remonte, pas de repli`, r.status === st && appels.length === 1, appels); }

  { const { g, appels } = monter(() => coupe());
    let e = null; try { await g.fetch(RAW + 'master/market-data.json'); } catch (x) { e = x; }
    check('les deux coupés → l’erreur d’origine remonte', e instanceof TypeError && appels.length === 2, appels); }

  { const { g, appels } = monter(rawCoupe, 'file:///home/x/samsara-live/index.html');
    let e = null; try { await g.fetch(RAW + 'master/market-data.json'); } catch (x) { e = x; }
    check('page ouverte en file:// → pas de repli sur la même origine', e instanceof TypeError && appels.length === 1, appels); }

  { const { g, appels } = monter(() => { const e = new Error('annulé'); e.name = 'AbortError'; return Promise.reject(e); });
    let e = null; try { await g.fetch(RAW + 'master/market-data.json'); } catch (x) { e = x; }
    check('lecture annulée → pas rejouée', e && e.name === 'AbortError' && appels.length === 1, appels); }

  { const { g, appels } = monter(() => coupe());
    try { await g.fetch('https://api.binance.com/api/v3/time'); } catch (x) {}
    check('autres hôtes : jamais réécrits', appels.length === 1 && appels[0].u === 'https://api.binance.com/api/v3/time', appels); }

  console.log(ko ? '\n✗ repli des fichiers publiés : échec' : '\n✓ repli des fichiers publiés');
  process.exit(ko);
})();
