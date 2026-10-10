// Harnais commun des tests « journée » des scénarios du matin dans le navigateur
// (test_scenarios_jour_page.js, test_scenarios_rejeu.js) : un Binance REJOUÉ à partir de bougies
// réelles enregistrées (tests/fixtures/rejeu-jour-0810.json : 15 min et 1 min du 08/10/2026),
// tronquées à l'heure du harnais — la bougie en cours est faite des minutes déjà passées (elle
// bouge quand l'heure avance) —, le fichier des scénarios du rejeu, et une page dont l'horloge est
// celle du harnais (page.clock).
//
//   const H = require('./scenarios-jour-harnais');
//   const h = H.harnais(X, '2026-10-08T15:40:00Z');      // X : le JSON du rejeu
//   const o = await H.ouvrir(nav, h, { vue, mode, tactile });
//   await H.avancer(o, h, '2026-10-08T15:52:00Z');       // l'heure avance, la page relit sa queue
const fs = require('fs'), path = require('path'), http = require('http');
const REPO = path.resolve(__dirname, '..');

let playwright = null;
for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright', process.env.PLAYWRIGHT_MODULE].filter(Boolean)) {
  try { playwright = require(p); break; } catch (e) { /* suivant */ }
}
const PAS = { '1m': 6e4, '5m': 3e5, '15m': 9e5, '1h': 36e5, '4h': 144e5, '1d': 864e5, '1w': 6048e5 };

/** Le marché rejoué : maintenant() (ms) réglable ; klines tronquées, bougie en cours faite des minutes. */
function harnais(X, debut, opts = {}) {
  const h = { X, t: Date.parse(debut), fichier: opts.fichier || X.fichier, vivante: opts.vivante || null };
  const k15 = X.k15.map(k => k.slice(0, 5)), k1 = (X.k1 || []).map(k => k.slice(0, 5));
  h.maintenant = () => h.t;
  /** Les bougies de pas p (ms) jusqu'à maintenant : celles du rejeu, regroupées ; la dernière (en
   *  cours) faite des minutes passées quand le rejeu en a. */
  h.bougies = p => {
    const now = h.t, src = p < 9e5 && k1.length ? k1 : k15, ps = src === k1 ? 6e4 : 9e5;
    const out = [];
    for (const k of src) {
      if (k[0] > now) break;
      const t = Math.floor(k[0] / p) * p, c = out[out.length - 1];
      if (c && c[0] === t) { c[2] = Math.max(c[2], k[2]); c[3] = Math.min(c[3], k[3]); c[4] = k[4]; }
      else out.push([t, k[1], k[2], k[3], k[4]]);
    }
    // La bougie en cours : rebâtie avec les minutes déjà ouvertes (si le rejeu les a).
    const der = out[out.length - 1];
    if (der && ps > 6e4 && k1.length && now < der[0] + p) {
      const ms = k1.filter(k => k[0] >= der[0] && k[0] <= now);
      if (ms.length) { der[1] = ms[0][1]; der[2] = Math.max(...ms.map(k => k[2])); der[3] = Math.min(...ms.map(k => k[3])); der[4] = ms[ms.length - 1][4]; }
    }
    // Une bougie en cours imposée (un prix qui bouge, réglé par le test).
    if (der && h.vivante) { const v = h.vivante(der, now); if (v) { der[4] = v; der[2] = Math.max(der[2], v); der[3] = Math.min(der[3], v); } }
    return out;
  };
  h.binance = url => {
    const u = new URL(url), q = u.searchParams;
    if (u.pathname.endsWith('/klines')) {
      const p = PAS[q.get('interval')] || 9e5, n = Math.min(1000, +q.get('limit') || 500);
      let K = h.bougies(p);
      if (q.get('endTime')) K = K.filter(k => k[0] <= +q.get('endTime'));
      return K.slice(-n).map(k => [k[0], String(k[1]), String(k[2]), String(k[3]), String(k[4]), '80', k[0] + p - 1, String(80 * k[4]), 50, '40', String(40 * k[4]), '0']);
    }
    const K = h.bougies(9e5), der = K[K.length - 1], prix = der ? der[4] : 80000, veille = K[Math.max(0, K.length - 97)];
    if (u.pathname.endsWith('/ticker/price')) return { price: String(prix) };
    if (u.pathname.endsWith('/ticker/24hr')) return { lastPrice: String(prix), openPrice: String(veille[1]), priceChangePercent: String(((prix / veille[1] - 1) * 100).toFixed(2)),
      highPrice: String(Math.max(...K.slice(-96).map(k => k[2]))), lowPrice: String(Math.min(...K.slice(-96).map(k => k[3]))), bidPrice: String(prix - 0.1), askPrice: String(prix + 0.1), quoteVolume: '1e9', count: '100' };
    return {};
  };
  return h;
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2' };
let serveur = null;
async function demarrer() {
  if (serveur) return serveur;
  serveur = http.createServer((req, res) => {
    const f = path.join(REPO, decodeURIComponent(req.url.split('?')[0]));
    if (!f.startsWith(REPO) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise(r => serveur.listen(0, '127.0.0.1', r));
  return serveur;
}
const arreter = () => { if (serveur) serveur.close(); serveur = null; };

/** Une page à l'heure du harnais. opts = { vue, mode, tactile, theme, sansGuide }. */
async function ouvrir(nav, h, opts = {}) {
  const ctx = await nav.newContext(Object.assign({ viewport: opts.vue || { width: 1440, height: 900 }, deviceScaleFactor: 1 }, opts.tactile ? { hasTouch: true, isMobile: true } : {}));
  await ctx.clock.install({ time: h.t });
  const page = await ctx.newPage();
  const erreurs = [];
  page.on('pageerror', e => erreurs.push(e.message));
  const md = JSON.parse(fs.readFileSync(path.join(REPO, 'market-data.json'), 'utf8'));
  await page.route('**/*', r => {
    const u = r.request().url(), host = new URL(u).host, cors = { 'access-control-allow-origin': '*' };
    if (host.startsWith('127.0.0.1')) return r.continue();
    if (host === 'api.binance.com') return r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(h.binance(u)) });
    if (host === 'raw.githubusercontent.com') {
      if (/\/previsions\/previsions\.json/.test(u)) return r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(h.fichier) });
      if (/\/master\/market-data\.json/.test(u)) { md.updated = new Date(Math.floor(h.t / 60000) * 60000).toISOString().replace('.000Z', '+00:00'); return r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(md) }); }
      return r.fulfill({ status: 404, headers: cors, body: '' });
    }
    return r.abort();
  });
  await page.addInitScript(([m, th, sg]) => { try { localStorage.clear(); localStorage.setItem('samsara-theme', th); localStorage.setItem('samsara-mode', m); localStorage.setItem('samsara-astuce-tap-v1', '1'); if (sg) localStorage.setItem('samsara-guide-v1', '0'); } catch (e) { /* */ } }, [opts.mode || 'debutant', opts.theme || 'aero', !!opts.sansGuide]);
  await page.goto(`http://127.0.0.1:${(await demarrer()).address().port}/index.html`);
  await page.waitForFunction(() => typeof scenEtat !== 'undefined' && scenEtat && scenEtat.jour && candles.length > 500, null, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(500);
  return { ctx, page, erreurs };
}
/** L'heure avance (harnais et page) ; la page relit la queue de ses bougies et redessine si besoin,
 *  puis le prix (fetchPrice : l'en-tête, l'étiquette du prix et l'horloge, au même prix que la
 *  bougie en cours). */
async function avancer(o, h, quand) {
  const t = typeof quand === 'number' ? quand : Date.parse(quand);
  h.t = t;
  await o.page.clock.setSystemTime(t);
  await o.page.evaluate(async () => { if (await fetchKlines()) drawChart(); await fetchPrice(); });
  await o.page.waitForTimeout(150);
}
/** Ce que la page a calculé et posé (scenEtat), lisible hors de la page. */
const lire = page => page.evaluate(() => {
  const S = scenEtat, J = S && S.jour;
  if (!S) return null;
  return {
    mode: document.documentElement.getAttribute('data-mode'), itv: chartInterval, n: candles.length,
    jour: J ? { cas: J.cas, meneur: J.meneur ? J.meneur.sc.rang : null, net: Scenarios.nomNet(J), montre: J.montre ? J.montre.sc.rang : null, remplace: J.remplace,
      e: J.items.map(i => (i.pos ? +i.pos.e.toFixed(4) : null)), ouverts: J.ouverts.map(i => i.sc.rang), realises: J.realises.map(i => i.sc.rang),
      fondu: J.items.map(i => i.fondu), reste: J.reste } : null,
    items: S.items.map(i => ({ rang: i.sc.rang, cle: i.sv && i.sv.cle, fondu: i.fondu, meneur: i.meneur, marques: (i.marques || []).map(m => ({ ok: m.ok, texte: m.texte })) })),
    libelles: (S.libelles || []).map(l => ({ rang: l.rang, t: l.t })),
    boite: S.boite ? { deb: !!S.boite.deb, texte: S.boite.texte || null, cede: !!S.boite.cede, prioritaire: !!S.boite.prioritaire, lignes: (S.boite.lignes || []).map(l => l.t) } : null,
    deb: typeof debEtat !== 'undefined' && debEtat ? debEtat.items.map(i => ({ role: i.role, texte: i.texte, rect: i.rect })) : null,
    cibles: S.cibles.map(c => ({ prio: c.prio, titre: c.titre, texte: c.texte, rects: c.rects || [] })),
    montre: S.montre ? S.montre.sc.rang : null, cede: !!S.libelleCede,
  };
});
/** Le calcul pur (js/scenarios.js) sur les mêmes bougies que la page : la référence. */
function reference(S, h, p) {
  const K = h.bougies(p || 9e5), now = h.t, F = S.lire(h.fichier, now), Q = p || 9e5;
  const T = K.map(k => k[0] / 1000), H = K.map(k => k[2]), L = K.map(k => k[3]), C = K.map(k => k[4]), n = K.length;
  const items = F.scenarios.map(sc => { const e = S.plier(sc, T, H, L, 0, n - 1, null, Q, C); if (S.compte(sc, K[n - 1][0], Q)) S.pas(sc, e, n - 1, K[n - 1][0], H[n - 1], L[n - 1], C[n - 1]); return { sc, sv: S.etat(sc, e, now) }; });
  const PJ = { ecartChangement: 0.12, departageMinutes: 60, departageMouvementPct: 0.5, horsMarges: 1, fonduMinutes: 60, colle: 0.5, quartMs: 900000 };
  const J = S.classerJour(items, C[n - 1], F, now, S.rejouerJour(F, F.scenarios, T, H, L, C, n - 1, Q, PJ), PJ);
  return { cas: J.cas, meneur: J.meneur ? J.meneur.sc.rang : null, montre: J.montre ? J.montre.sc.rang : null, e: J.items.map(i => (i.pos ? +i.pos.e.toFixed(4) : null)), fondu: J.items.map(i => i.fondu) };
}

module.exports = { playwright, harnais, ouvrir, avancer, lire, reference, demarrer, arreter, REPO };
