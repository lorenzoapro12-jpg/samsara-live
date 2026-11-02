/* Paires OKX (contrats perpétuels adossés aux matières premières : or, argent, pétrole…).
   La page ne sait lire que l'API Binance (bougies /api/v3/klines, prix /api/v3/ticker/24hr) :
   plutôt que de doubler chaque appel de js/app.js, ce module répond À LA PLACE de Binance quand
   le symbole demandé est un contrat OKX (« XAU-USDT-SWAP » : un tiret, ce que Binance n'a jamais).
   Il lit OKX et rend une réponse au format Binance ; le reste de la page ne voit pas la différence.
   Tout autre appel passe tel quel (Binance, son miroir, les fichiers publiés).

   Hôtes : www.okx.com d'abord, www.okx.cab en repli (CORS ouvert sur les deux, vérifié le
   02/11/2026 ; my.okx.com et app.okx.com répondent mais SANS CORS, donc inutilisables ici).
   Comme pour Binance, dès que le repli a répondu, la suite de la visite y reste.

   Bougies OKX : /market/candles (les plus récentes, 300 au plus) puis /market/history-candles
   (plus anciennes, page par page avec `after`), du plus récent au plus ancien ; on les remet dans
   l'ordre de Binance. Volume = colonne volCcy (en unités de l'actif : onces d'or, barils…).
   Le jour et la semaine sont pris en UTC (1Dutc, 1Wutc) comme chez Binance ; le 1D d'OKX seul
   commence à minuit de Hong Kong.

   Chargé après js/binance-repli.js, avant le script de préchargement et js/app.js. */
(function (g) {
  var natif = g.fetch;
  if (typeof natif !== 'function') return;
  var HOTES = ['https://www.okx.com', 'https://www.okx.cab'];
  var BINANCE = /^https:\/\/(api\.binance\.com|data-api\.binance\.vision)\/api\/v3\/(klines|ticker\/24hr)\?/;
  var BARRES = { '1m': '1m', '5m': '5m', '15m': '15m', '30m': '30m', '1h': '1H', '2h': '2H', '4h': '4H', '1d': '1Dutc', '1w': '1Wutc' };
  var DUREE = { '1m': 6e4, '5m': 3e5, '15m': 9e5, '30m': 18e5, '1h': 36e5, '2h': 72e5, '4h': 144e5, '1d': 864e5, '1w': 6048e5 };
  var PAGE = 300;          // bougies par requête OKX
  var PAGES_MAX = 12;      // garde-fou : 3 600 bougies au plus par demande
  g.__okxHote = HOTES[0];

  var estOkx = function (sym) { return typeof sym === 'string' && sym.indexOf('-') > 0; };
  // Une erreur qui garde son statut HTTP (Horloges.classer la nomme : limite, serveur…).
  var erreur = function (msg, status) { var e = new Error(msg); if (status) e.status = status; return e; };
  var reponse = function (corps, status) {
    return new Response(JSON.stringify(corps), { status: status || 200, headers: { 'Content-Type': 'application/json' } });
  };

  // Un appel OKX : l'hôte retenu, puis l'autre si le premier est injoignable ou refuse (403, 451,
  // 5xx). Rend le tableau `data` ; une réponse OKX en erreur (code ≠ "0") lève avec son statut.
  function lire(chemin, o) {
    var i0 = Math.max(0, HOTES.indexOf(g.__okxHote));
    var essai = function (k, derniere) {
      // Fin des hôtes : la dernière réponse (un refus nommé), ou l'erreur réseau telle quelle.
      if (k >= HOTES.length) return derniere && typeof derniere.ok === 'boolean' ? Promise.resolve(derniere) : Promise.reject(derniere);
      var h = HOTES[(i0 + k) % HOTES.length];
      return natif.call(g, h + chemin, o && o.signal ? { signal: o.signal } : undefined).then(function (r) {
        if (r.status === 403 || r.status === 451 || r.status >= 500) return essai(k + 1, r);
        g.__okxHote = h;
        return r;
      }, function (e) {
        if (e && e.name === 'AbortError') throw e;
        return essai(k + 1, e);
      });
    };
    return essai(0, null).then(function (r) {
      if (!r.ok) throw erreur('OKX HTTP ' + r.status, r.status);
      return r.json();
    }).then(function (j) {
      if (!j || j.code !== '0' || !Array.isArray(j.data)) {
        // 50011 : trop de requêtes ; 51001 : contrat inconnu.
        throw erreur('OKX ' + (j && j.code) + ' ' + (j && j.msg || ''), j && j.code === '50011' ? 429 : 400);
      }
      return j.data;
    });
  }

  // Bougies au format Binance : [ouverture ms, o, h, l, c, volume, clôture ms], de la plus ancienne
  // à la plus récente ; les `limite` dernières dont l'ouverture est ≤ fin (sans fin : les dernières).
  function bougies(inst, itv, limite, fin, o) {
    var bar = BARRES[itv];
    if (!bar) return Promise.reject(erreur('intervalle ' + itv + ' absent chez OKX', 400));
    var dur = DUREE[itv], vues = {}, res = [], pages = 0;
    var suite = function (after) {
      var n = Math.min(PAGE, limite - res.length);
      var chemin = after == null
        ? '/api/v5/market/candles?instId=' + encodeURIComponent(inst) + '&bar=' + bar + '&limit=' + n
        : '/api/v5/market/history-candles?instId=' + encodeURIComponent(inst) + '&bar=' + bar + '&limit=' + n + '&after=' + after;
      return lire(chemin, o).then(function (d) {
        pages++;
        var plusVieux = null;
        for (var i = 0; i < d.length; i++) {
          var t = +d[i][0];
          if (plusVieux == null || t < plusVieux) plusVieux = t;
          if (vues[t] || (fin != null && t > fin)) continue;
          vues[t] = 1;
          res.push([t, d[i][1], d[i][2], d[i][3], d[i][4], d[i][6], t + dur - 1]);
        }
        if (!d.length || res.length >= limite || pages >= PAGES_MAX || plusVieux == null) return res;
        return suite(plusVieux);
      });
    };
    return suite(fin != null ? fin + 1 : null).then(function () {
      res.sort(function (a, b) { return a[0] - b[0]; });
      return res.slice(-limite);
    });
  }

  // Le prix et l'ouverture 24 h glissantes, sous les noms de Binance (format MINI et complet).
  function ticker(inst, o) {
    return lire('/api/v5/market/ticker?instId=' + encodeURIComponent(inst), o).then(function (d) {
      var t = d[0];
      if (!t) throw erreur('OKX : prix absent pour ' + inst, 400);
      return { symbol: inst, lastPrice: t.last, openPrice: t.open24h, highPrice: t.high24h, lowPrice: t.low24h,
        volume: t.volCcy24h, closeTime: +t.ts };
    });
  }

  g.fetch = function (u, o) {
    var url = typeof u === 'string' ? u : (typeof URL !== 'undefined' && u instanceof URL ? u.href : null);
    var m = url && url.match(BINANCE);
    if (!m) return natif.call(g, u, o);
    var q = {};
    url.slice(url.indexOf('?') + 1).split('&').forEach(function (p) {
      var k = p.indexOf('='); if (k > 0) q[decodeURIComponent(p.slice(0, k))] = decodeURIComponent(p.slice(k + 1));
    });
    if (!estOkx(q.symbol)) return natif.call(g, u, o);
    var lecture = m[2] === 'klines'
      ? bougies(q.symbol, q.interval, Math.max(1, Math.min(1000, +q.limit || 500)), q.endTime != null ? +q.endTime : null, o)
      : ticker(q.symbol, o);
    return lecture.then(function (corps) { return reponse(corps); }, function (e) {
      if (e && e.status) return reponse({ code: -1, msg: e.message }, e.status);
      throw e;   // réseau : TypeError, comme un fetch qui n'aboutit pas
    });
  };
  g.__okx = { HOTES: HOTES, BARRES: BARRES, estOkx: estOkx };
})(typeof globalThis !== 'undefined' ? globalThis : window);
