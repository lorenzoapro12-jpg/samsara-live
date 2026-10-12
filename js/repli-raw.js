/* Repli des fichiers publiés. La page lit ses fichiers publiés sur raw.githubusercontent.com. Quand
   le navigateur ne l'atteint pas (requête bloquée par un filtre ou un antivirus, DNS, CDN en panne :
   le 12/10/2026, « Infos du marché illisibles » et « Scénarios du matin : pas de fichier lisible »
   ensemble, alors que le prix de Binance arrivait), la même lecture repart ailleurs :
   - un fichier de master → la copie servie avec la page (GitHub Pages publie master, même origine) ;
   - un fichier de la branche `previsions` → l'API GitHub (contenu brut, CORS ouvert).
   Pas de repli pour les ancêtres (master~N, la chronique) ni pour la branche `direct`. Seule une
   requête qui n'aboutit pas (TypeError) est rejouée : une réponse HTTP, même 404, remonte telle
   quelle ; les deux coupés, l'erreur d'origine remonte. raw.githubusercontent.com reste toujours
   l'adresse demandée en premier. Chargé avant tout autre script, après js/binance-repli.js. */
(function (g) {
  var RAW = 'https://raw.githubusercontent.com/lorenzoapro12-jpg/samsara-live/';
  var API = 'https://api.github.com/repos/lorenzoapro12-jpg/samsara-live/contents/';
  var natif = g.fetch;
  if (typeof natif !== 'function') return;
  /** L'adresse de repli d'une lecture sur raw, ou null. PUR (hors g.location). */
  function repli(url) {
    var chemin = url.slice(RAW.length).split('?')[0], m;
    if ((m = /^master\/([\w.-]+\.json)$/.exec(chemin))) {
      var loc = g.location;
      if (!loc || !/^https?:$/.test(loc.protocol)) return null;
      return { url: new URL(m[1], loc.href).href, entetes: null };
    }
    if ((m = /^previsions\/([\w.-]+\.json)$/.exec(chemin)))
      return { url: API + m[1] + '?ref=previsions', entetes: { Accept: 'application/vnd.github.raw' } };
    return null;
  }
  g.__repliRaw = repli;
  g.fetch = function (u, o) {
    var url = typeof u === 'string' ? u : (typeof URL !== 'undefined' && u instanceof URL ? u.href : null);
    if (!url || url.indexOf(RAW) !== 0) return natif.call(g, u, o);
    return natif.call(g, url, o).catch(function (e) {
      var r = e && e.name === 'TypeError' ? repli(url) : null;
      if (!r) throw e;
      var opt = {};
      for (var k in o || {}) opt[k] = o[k];
      if (r.entetes) opt.headers = r.entetes;
      return natif.call(g, r.url, opt).catch(function () { throw e; });
    });
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
