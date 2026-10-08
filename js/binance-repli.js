/* Repli Binance. La page et la carte appellent api.binance.com. Quand le navigateur ne l'atteint
   pas (réseau coupé, bloqueur, DNS) ou que Binance refuse la région (451, 403), la même requête
   repart sur le miroir public data-api.binance.vision : mêmes réponses de marché spot, CORS ouvert.
   Dès que le miroir a répondu, la suite de la visite y reste (window.__binanceHote le dit).
   Le miroir n'est jamais l'hôte par défaut : un navigateur qui ne l'atteint pas (08/10/2026,
   PR #8 retirée par #11) doit garder l'adresse principale. Chargé avant tout autre script. */
(function (g) {
  var PRINCIPAL = 'https://api.binance.com/', MIROIR = 'https://data-api.binance.vision/';
  var natif = g.fetch;
  if (typeof natif !== 'function') return;
  g.__binanceHote = PRINCIPAL;
  var miroir = function (u, o) {
    return natif.call(g, MIROIR + u.slice(PRINCIPAL.length), o).then(function (r) {
      if (r.ok) g.__binanceHote = MIROIR;
      return r;
    });
  };
  var refus = function (r) { return r.status === 451 || r.status === 403; };
  g.fetch = function (u, o) {
    var url = typeof u === 'string' ? u : (typeof URL !== 'undefined' && u instanceof URL ? u.href : null);
    if (!url || url.indexOf(PRINCIPAL) !== 0) return natif.call(g, u, o);
    if (g.__binanceHote === MIROIR) return miroir(url, o);
    return natif.call(g, url, o).then(
      function (r) { return refus(r) ? miroir(url, o).catch(function () { return r; }) : r; },
      function (e) {
        if (e && e.name === 'AbortError') throw e;
        return miroir(url, o).catch(function () { throw e; });
      });
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
