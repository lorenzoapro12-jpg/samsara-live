// L'interface de la page, vérifiée dans un vrai navigateur (Chromium, Playwright) : ce qui ne
// se juge qu'à l'écran — où un menu s'ouvre, ce que le graphique dessine.
//
//   1. MENUS : Indicateurs, Thème, Paire s'ouvrent dans l'écran — sous leur bouton, ou au-dessus
//      quand la place manque en dessous (bouton dans une barre basse : Néon, barres des tâches),
//      bornés à 8 px des bords, défilants s'ils sont plus hauts que l'écran.
//   2. CROCHETS DU GRAPHIQUE (jetons de thème lus par lireJetons) : sans jeton, le graphique
//      d'avant (rampe de chaleur historique à l'octet près, bougies pleines, grille pleine) ; avec
//      un jeton, la FORME change — bougies creuses ou en barres, grille en trait mixte, police
//      du canvas, encre de la chaleur — jamais la position d'un prix ; la couche de chaleur est
//      refaite quand le thème change (son id est dans la clé du cache).
//   3. DISPOSITION : sur un canvas bas, les sous-graphes sont réduits et ne débordent jamais
//      sur le sélecteur de plage ; sur un canvas haut, ils gardent leur hauteur. Le tracé du prix
//      garde 60 % de la hauteur utile ; chaque sous-graphe logé est tracé (jamais un cadre vide) ;
//      ceux qui n'ont plus de place sont annoncés par une ligne, pas dessinés.
//   4. LE TRACÉ DE L'EXPERT : un nom par chose (ruban, menu, titres), le format de la page
//      (« 86 012,50 $ », « +0,65 % »), l'unité de la paire (« SOL » sur BTC/SOL), l'heure de
//      l'appareil (fuseau d'Auckland), le CCI à ±100 sur ses lignes, l'ATR lisible à 2,5 $, une
//      étiquette par ligne, la légende S/R par intervalle, les couches d'une seule paire grisées
//      et hors du compteur.
//   5. ÂGE DE LA CARTE : à droite du compteur, sans le toucher ; au téléphone, sa forme courte
//      (« Carte publiée il y a … ») et le compteur sans sa plage.
//
// Sans Playwright : « non exécuté », dit à l'écran (ce n'est pas un succès).
// USAGE   node tests/test_interface.js
const fs = require('fs'), path = require('path'), http = require('http');
const { previsionsFixture, estPrevisions } = require('./previsions-fixture');   // scénarios du matin (branche previsions)
const REPO = path.resolve(__dirname, '..');

let playwright = null;
for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright', process.env.PLAYWRIGHT_MODULE].filter(Boolean)) {
  try { playwright = require(p); break; } catch (e) { /* suivant */ }
}
if (!playwright) {
  console.log('  − NON EXÉCUTÉ : Playwright introuvable — l\'interface n\'est pas vérifiée sur ce poste.');
  process.exit(0);
}
let ko = 0;
const check = (nom, ok, det) => { if (!ok) ko++; console.log(`  ${ok ? '✓' : '✗'} ${nom}${!ok && det !== undefined ? ' — ' + JSON.stringify(det).slice(0, 400) : ''}`); };
const titre = t => console.log(`\n── ${t} ──`);

const index = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8');
const THEMES = [...index.matchAll(/<link\b[^>]*data-theme-id="([^"]+)"[^>]*>/g)].map(m => ({ id: m[1], structure: (m[0].match(/data-structure="([^"]+)"/) || [])[1] || null }));
const BASE = THEMES[0].id;

// Binance simulé : bougies déterministes (une sinusoïde), prix fixe.
function binance(url) {
  const u = new URL(url), q = u.searchParams, now = Date.now();
  if (u.pathname.endsWith('/klines')) {
    const pas = { '1m': 6e4, '5m': 3e5, '15m': 9e5, '1h': 36e5, '4h': 144e5, '1d': 864e5, '1w': 6048e5 }[q.get('interval')] || 9e5;
    const n = Math.min(1000, +q.get('limit') || 500), fin = q.get('endTime') ? Math.min(+q.get('endTime'), now) : now;
    return Array.from({ length: n }, (_, i) => { const t = Math.floor((fin - (n - 1 - i) * pas) / pas) * pas, c = 86000 + Math.sin(i / 7) * 300, o = c + (i % 2 ? 40 : -40);
      return [t, String(o), String(Math.max(o, c) + 60), String(Math.min(o, c) - 60), String(c), '80', t + pas - 1, String(80 * c), 50, '40', String(40 * c), '0']; });
  }
  if (u.pathname.endsWith('/ticker/price')) return { price: '86012.5' };
  if (u.pathname.endsWith('/ticker/24hr')) return { lastPrice: '86012.5', openPrice: '85700', priceChangePercent: '0.4', highPrice: '87000', lowPrice: '85000', bidPrice: '86012.4', askPrice: '86012.6', quoteVolume: '1e9', count: '100' };
  return {};
}
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2' };
const serveur = http.createServer((req, res) => {
  const f = path.join(REPO, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(REPO) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

async function ouvrir(nav, theme, vue, fuseau) {
  const ctx = await nav.newContext(Object.assign({ viewport: vue, deviceScaleFactor: 1 }, fuseau ? { timezoneId: fuseau } : {}));
  const page = await ctx.newPage();
  const erreurs = [];
  page.on('pageerror', e => erreurs.push(e.message));
  await page.route('**/*', r => {
    const u = r.request().url(), h = new URL(u).host, cors = { 'access-control-allow-origin': '*' };
    if (h.startsWith('127.0.0.1')) return r.continue();
    if (h === 'api.binance.com') return r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(binance(u)) });
    if (estPrevisions(u)) return r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: previsionsFixture() });
    if (h === 'raw.githubusercontent.com') return r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: fs.readFileSync(path.join(REPO, u.includes('heatmap') ? 'heatmap.json' : 'market-data.json')) });
    return r.abort();
  });
// Mode Expert : ce test mesure les éléments denses (chiffres clés, menus, sous-graphes…), masqués
  // en Débutant (le mode par défaut) ; leur version Débutant est vérifiée dans test_debutant_page.js.
  await page.addInitScript(t => { try { localStorage.clear(); localStorage.setItem('samsara-mode', 'expert'); localStorage.setItem('samsara-theme', t); } catch (e) { /* */ } }, theme);
  // Traces du canvas du graphique, relevées seulement quand un contrôle les demande
  // (window.__traits / window.__textes) : style et tirets de chaque trait, texte et ordonnée.
  await page.addInitScript(() => {
    const P = CanvasRenderingContext2D.prototype, stroke = P.stroke, fillText = P.fillText;
    P.stroke = function (...a) { if (window.__traits && this.canvas.id === 'chart') window.__traits.push({ s: this.strokeStyle, w: this.lineWidth, d: this.getLineDash().join(' ') }); return stroke.apply(this, a); };
    P.fillText = function (t, x, y, ...a) { if (window.__textes && this.canvas.id === 'chart') window.__textes.push({ t: String(t), x, y, w: this.measureText(String(t)).width }); return fillText.call(this, t, x, y, ...a); };
  });
  await page.goto(`http://127.0.0.1:${serveur.address().port}/index.html`);
  await page.waitForTimeout(1800);
  return { ctx, page, erreurs };
}

/** Ouvre un menu par son bouton ; rend la boîte du menu, celle du bouton et la hauteur de l'écran. */
async function menu(page, bouton, id) {
  await page.evaluate(() => { for (const m of document.querySelectorAll('.open')) m.classList.remove('open'); });
  await page.click(bouton);
  await page.waitForTimeout(150);
  return page.evaluate(([b, id]) => {
    const m = document.getElementById(id), rm = m.getBoundingClientRect(), rb = document.querySelector(b).getBoundingClientRect();
    return { ouvert: m.classList.contains('open'), haut: rm.top, bas: rm.bottom, gauche: rm.left, droite: rm.right,
      boutonHaut: rb.top, boutonBas: rb.bottom, H: innerHeight, L: innerWidth, defile: m.scrollHeight > m.clientHeight + 1 };
  }, [bouton, id]);
}
const dansLEcran = m => m.ouvert && m.haut >= 8 - 0.5 && m.bas <= m.H - 8 + 0.5 && m.gauche >= 8 - 0.5 && m.droite <= m.L - 8 + 0.5;

(async () => {
  await new Promise(r => serveur.listen(0, '127.0.0.1', r));
  const nav = await playwright.chromium.launch();
  try {
    titre('1. Menus : dans l\'écran, au-dessus du bouton quand la place manque en dessous');
    const MENUS = [['Indicateurs', '#indDropdownBtn', 'indMenu'], ['Thème', '#themeBtn', 'themeMenu'], ['Paire', '#paireBtn', 'paireMenu']];
    for (const t of THEMES) {
      const o = await ouvrir(nav, t.id, { width: 1440, height: 900 });
      for (const [nom, b, id] of MENUS) {
        const m = await menu(o.page, b, id);
        const place = m.boutonBas + 8 + (m.bas - m.haut) <= m.H - 8;
        // Sous le bouton quand il y a la place ; sinon AU-DESSUS (jamais par-dessus le bouton).
        const cote = place ? m.haut >= m.boutonBas : m.bas <= m.boutonHaut;
        check(`${t.id.padEnd(9)} · menu ${nom.padEnd(11)} entier dans l'écran, ${place ? 'sous' : 'au-dessus de'} son bouton`, dansLEcran(m) && cote, m);
      }
      check(`${t.id.padEnd(9)} · aucune erreur JavaScript`, !o.erreurs.length, o.erreurs);
      await o.ctx.close();
    }
    // Un bouton en bas de l'écran (une barre des tâches) : le menu s'ouvre au-dessus. Les
    // boutons sont DÉPLACÉS dans une barre fixe (un `position: fixed` posé sur eux se mesurerait
    // dans l'en-tête, que son verre transforme en bloc conteneur).
    const o = await ouvrir(nav, BASE, { width: 1440, height: 900 });
    await o.page.evaluate(() => {
      const barre = document.createElement('div');
      barre.style.cssText = 'position:fixed;left:0;right:0;bottom:4px;display:flex;justify-content:space-between;z-index:2000';
      for (const id of ['paireBtn', 'indDropdownBtn', 'themeBtn']) barre.appendChild(document.getElementById(id));
      document.body.appendChild(barre);
    });
    for (const [nom, b, id] of MENUS) {
      const m = await menu(o.page, b, id);
      check(`bouton en bas de l'écran · menu ${nom.padEnd(11)} au-dessus du bouton, dans l'écran`, dansLEcran(m) && m.bas <= m.boutonHaut, m);
    }
    await o.ctx.close();
    // Écran plus bas que le menu : il prend le plus grand côté et y défile, sans recouvrir son
    // bouton ni sortir de l'écran.
    const p = await ouvrir(nav, BASE, { width: 1000, height: 260 });
    const m = await menu(p.page, '#themeBtn', 'themeMenu');
    check('écran de 260 px · menu Thème dans l\'écran, défilant, sans recouvrir son bouton', dansLEcran(m) && m.defile && (m.haut >= m.boutonBas || m.bas <= m.boutonHaut), m);
    await p.ctx.close();

    titre('2. Crochets du graphique : sans jeton, le graphique d\'avant ; un jeton change la forme, jamais la valeur');
    // La rampe historique, recopiée ICI comme référence figée (l'ancienne table de chaînes
    // rgba() de js/app.js) : la rampe d'un thème sans --chaleur-* doit lui rester identique.
    const legacy = (r, g, b, ar, ag, ab) => Array.from({ length: 256 }, (_, i) => { const t = i / 255;
      return (((0.2 + 0.65 * t) * 255 | 0) << 24 | ((b + ab * t | 0) << 16) | ((g + ag * t | 0) << 8) | (r + ar * t | 0)) >>> 0; });
    const LEG = { bid: legacy(10, 60, 55, 80, 180, 165), ask: legacy(60, 15, 15, 195, 105, 75) };
    for (const t of THEMES) {
      const o = await ouvrir(nav, t.id, { width: 1440, height: 900 });
      const d = await o.page.evaluate(() => {
        const cs = getComputedStyle(document.documentElement), tok = n => cs.getPropertyValue(n).trim();
        // Couleur CSS → « #rrggbb » par le canvas lui-même (indépendant du code testé).
        const hex = c => { if (!c) return ''; const t = document.createElement('canvas').getContext('2d'); t.fillStyle = '#000'; t.fillStyle = c; return /^#/.test(t.fillStyle) ? t.fillStyle : ''; };
        return { forme: COLORS.bougieForme, rayon: COLORS.bougieRayon, tirets: COLORS.grilleTirets.join(' '), police: chartFont(10),
          font: tok('--font'), polGraph: tok('--police-graphique'), bid: Array.from(HEAT_U32.bid), ask: Array.from(HEAT_U32.ask),
          chaleur: [tok('--chaleur-bid'), tok('--chaleur-ask')], chaleurHex: [hex(tok('--chaleur-bid')), hex(tok('--chaleur-ask'))], formeTok: tok('--bougie-forme'), rayonTok: tok('--bougie-rayon'), tiretsTok: tok('--grille-tirets') };
      });
      // Les jetons déclarés par la feuille du thème (sinon les défauts).
      const attenduForme = d.formeTok || 'pleine', attenduRayon = d.rayonTok === '' ? 2 : +d.rayonTok;
      const attenduTirets = !d.tiretsTok || d.tiretsTok === 'none' ? '' : d.tiretsTok.split(/[\s,]+/).join(' ');
      check(`${t.id.padEnd(9)} · bougies « ${d.forme} », rayon ${d.rayon}, grille « ${d.tirets || 'pleine'} » : celles de la feuille (défauts sinon)`,
        d.forme === attenduForme && d.rayon === attenduRayon && d.tirets === attenduTirets, d);
      check(`${t.id.padEnd(9)} · police du canvas = --police-graphique, à défaut --font`, d.police === '500 10px ' + (d.polGraph || d.font), { police: d.police, font: d.font, polGraph: d.polGraph });
      for (const [i, cote] of [[0, 'bid'], [1, 'ask']]) {
        if (!d.chaleur[i]) {
          const ok = d[cote].every((x, k) => x === LEG[cote][k]);
          check(`${t.id.padEnd(9)} · chaleur ${cote} : sans jeton, rampe historique à l'octet près`, ok);
        } else {
          const h = /^#([0-9a-f]{6})$/i.exec(d.chaleurHex[i]), n = h ? parseInt(h[1], 16) : null;
          const enc = a => (((0.10 + 0.80 * a / 255) * 255 | 0) << 24 | ((n & 255) << 16) | (((n >> 8) & 255) << 8) | (n >> 16)) >>> 0;
          check(`${t.id.padEnd(9)} · chaleur ${cote} : encre ${d.chaleur[i]}, opacité 0,10 → 0,90`, n !== null && [0, 128, 255].every(a => d[cote][a] === enc(a)),
            { jeton: d.chaleur[i], u32: [d[cote][0], d[cote][255]] });
        }
      }
      await o.ctx.close();
    }
    const o2 = await ouvrir(nav, BASE, { width: 1440, height: 900 });
    // Bougies : une bougie de 40 px, tracée seule sur un canvas témoin, dans chaque forme.
    const formes = await o2.page.evaluate(() => {
      const rgb = c => { const t = document.createElement('canvas').getContext('2d'); t.fillStyle = c; const h = t.fillStyle; return [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)).concat(255); };
      const un = (forme, hausse, candleW) => {
        const cv = document.createElement('canvas'); cv.width = 60; cv.height = 120;
        const g = cv.getContext('2d'), sauve = COLORS.bougieForme;
        COLORS.bougieForme = forme;
        // Ouverture à 80 et clôture à 30 en hausse (l'inverse en baisse) ; plus haut 10, plus bas 110.
        tracerBougie(g, 10, candleW, hausse ? 80 : 30, hausse ? 30 : 80, 10, 110, hausse);
        COLORS.bougieForme = sauve;
        const px = (x, y) => Array.from(g.getImageData(x, y, 1, 1).data);
        return { corps: px(22, 55), centre: px(30, 55), bord: px(16, 55), ouverture: px(20, hausse ? 80 : 30), cloture: px(40, hausse ? 30 : 80),
          vide: px(20, hausse ? 30 : 80), denseCorps: px(11, 55), denseTiret: px(10, 80), denseTrait: px(12, 55) };
      };
      return { haut: rgb(COLORS.candleUp), bas: rgb(COLORS.candleDown), surface: rgb(COLORS.surface),
        pleine: un('pleine', true, 40), creuse: un('creuse-hausse', true, 40), creuseBaisse: un('creuse-hausse', false, 40),
        barre: un('barre', true, 40), creuseDense: un('creuse-hausse', true, 5), barreDense: un('barre', true, 5) };
    });
    const egal = (a, b) => a && b && a.every((x, i) => Math.abs(x - b[i]) <= 2);
    const vide = a => a[3] === 0;
    const F = formes;
    check('bougie pleine : corps plein à la couleur de la hausse', egal(F.pleine.corps, F.haut) && egal(F.pleine.centre, F.haut), F.pleine);
    check('bougie creuse en hausse : intérieur à la couleur du fond, contour à la couleur de la hausse, la mèche s\'arrête au corps',
      egal(F.creuse.corps, F.surface) && egal(F.creuse.centre, F.surface) && egal(F.creuse.bord, F.haut), F.creuse);
    check('bougie creuse en BAISSE : corps plein (la convention ne creuse que la hausse)', egal(F.creuseBaisse.corps, F.bas), F.creuseBaisse);
    check('barre OHLC : aucun corps, tiret d\'ouverture à gauche, de clôture à droite, aux ordonnées des prix',
      vide(F.barre.corps) && egal(F.barre.ouverture, F.haut) && egal(F.barre.cloture, F.haut) && vide(F.barre.vide), F.barre);
    check('vue dense (corps < 4 px) : la bougie creuse redevient pleine, la barre un trait seul',
      egal(F.creuseDense.denseCorps, F.haut) && vide(F.barreDense.denseTiret) && egal(F.barreDense.denseTrait, F.haut), { creuse: F.creuseDense, barre: F.barreDense });
    // Jetons posés par une feuille : lus une fois (lireJetons), appliqués au dessin réel.
    const g = await o2.page.evaluate(() => {
      const norme = c => { const t = document.createElement('canvas').getContext('2d'); t.strokeStyle = c; return t.strokeStyle; };
      const grille = () => { window.__traits = []; drawChart(); const n = norme(COLORS.grid), tr = window.__traits.filter(x => x.s === n && x.w === 0.5); window.__traits = null; return tr.map(x => x.d); };
      const avant = grille();
      const st = document.createElement('style');
      st.textContent = ':root[data-theme] { --bougie-forme: barre; --bougie-rayon: 0; --grille-tirets: 8 3 2 3; --police-graphique: "Courier New", monospace; --chaleur-bid: #000080; }';
      document.head.appendChild(st); lireJetons();
      const r = { forme: COLORS.bougieForme, rayon: COLORS.bougieRayon, police: chartFont(10), bid255: HEAT_U32.bid[255], bid0: HEAT_U32.bid[0] };
      const apres = grille();
      st.textContent = ':root[data-theme] { --bougie-forme: ovale; }'; lireJetons();
      r.inconnue = COLORS.bougieForme;
      st.remove(); lireJetons(); drawChart();
      return Object.assign(r, { avant, apres });
    });
    check(`grille par défaut : ${g.avant.length} traits pleins`, g.avant.length >= 7 && g.avant.every(d => d === ''), g.avant);
    check(`--grille-tirets: 8 3 2 3 → ${g.apres.length} traits de grille en trait mixte`, g.apres.length === g.avant.length && g.apres.every(d => d === '8 3 2 3'), g.apres);
    check('--bougie-forme / --bougie-rayon / --police-graphique lus par lireJetons', g.forme === 'barre' && g.rayon === 0 && g.police === '500 10px "Courier New", monospace', g);
    check('--chaleur-bid: #000080 → encre fixe, opacité 0,10 au plus faible, 0,90 au plus fort',
      g.bid255 === ((229 << 24 | 0x80 << 16) >>> 0) && g.bid0 === ((25 << 24 | 0x80 << 16) >>> 0), g);
    check('forme inconnue → bougies pleines (jamais une forme non déclarée)', g.inconnue === 'pleine', g.inconnue);
    // Couche de chaleur : l'id du thème est dans la clé du cache — un autre thème la refait.
    const cles = await o2.page.evaluate(async () => {
      await fetchHeatmap(); overlays.liq = true; drawChart();
      const a = heatLayer && heatLayer.cle;
      appliquerTheme('codex'); drawChart();
      const b = heatLayer && heatLayer.cle;
      overlays.liq = false; appliquerTheme(THEMES[0].id);
      return { a, b, theme0: THEMES[0].id };
    });
    check('couche de chaleur refaite au changement de thème (id du thème dans la clé)',
      !!cles.a && !!cles.b && cles.a.endsWith('|' + cles.theme0) && cles.b.endsWith('|codex') && cles.a !== cles.b, cles);
    check('aucune erreur JavaScript', !o2.erreurs.length, o2.erreurs);
    await o2.ctx.close();

    titre('3. Disposition : le prix garde 60 %, chaque sous-graphe logé est tracé, les autres annoncés, rien sur le sélecteur de plage');
    const TOUS = ['vol', 'rsi', 'macd', 'stoch', 'atr', 'obv', 'mfi', 'williamsR', 'cci', 'adx', 'ao'];
    for (const [nom, vue, subs] of [['canvas bas', { width: 1440, height: 700 }, ['rsi', 'macd']], ['canvas haut', { width: 1440, height: 1500 }, ['rsi', 'macd']],
                                    ['canvas très bas, 5 sous-graphes', { width: 1280, height: 560 }, ['rsi', 'macd', 'stoch', 'atr']],
                                    ['1440 × 900, les 11 sous-graphes', { width: 1440, height: 900 }, TOUS],
                                    ['390 × 844, les 11 sous-graphes', { width: 390, height: 844 }, TOUS]]) {
      const o3 = await ouvrir(nav, BASE, vue);
      const r = await o3.page.evaluate(subs => {
        for (const k of subs) activeSubs[k] = true;
        resizeCanvas(); window.__textes = []; drawChart();
        const W = canvas.width / devicePixelRatio, H = canvas.height / devicePixelRatio, d = dispositionGraphique(H), textes = window.__textes; window.__textes = null;
        const actifs = SUB_ORDRE.filter(k => activeSubs[k]);
        let total = 0; for (const k of actifs) total += subHeights[k];
        const titres = d.sous.map(s => ({ cle: s.cle, y: s.y, h: s.h, titre: (textes.find(x => x.t === subTitle(s.cle)) || {}).y }));
        const dispo = H - 4 - RS_HEIGHT, mainMin = Math.max(Math.min(MAIN_H_MIN, dispo), Math.ceil(dispo * MAIN_PART_MIN));
        return { W, H, RS: RS_HEIGHT, mainH: d.mainH, dispo, mainMin, part: d.mainH / dispo, total, actifs, titres, SUB_H_MIN,
          sansPlace: d.sansPlace, ySansPlace: d.ySansPlace, ligne: textes.filter(x => /sous-graphes? sans place/.test(x.t)),
          titresCaches: d.sansPlace.filter(k => textes.some(x => x.t === subTitle(k))), serre: dispo - total < mainMin };
      }, subs);
      const fin = r.titres.length ? r.titres[r.titres.length - 1].y + r.titres[r.titres.length - 1].h : r.mainH + 4;
      const titresDedans = r.titres.every(s => s.titre === undefined || s.titre < r.H - r.RS);
      const traces = r.titres.filter(s => s.titre !== undefined).length;
      const n = r.sansPlace.length, L = r.ligne[0];
      check(`${nom} (${r.H} px, ${r.actifs.length} sous-graphes demandant ${r.total} px) : tout tient au-dessus du sélecteur de plage, le prix garde ${Math.round(r.part * 100)} % (≥ 60 %)`,
        fin <= r.H - r.RS + 0.5 && titresDedans && r.mainH >= r.mainMin - 0.5 && r.mainH >= Math.min(200, r.dispo) && r.part >= 0.6 - 1e-9, r);
      check(`${nom} : chaque sous-graphe logé est tracé, sur ${r.SUB_H_MIN} px au moins (${traces}/${r.titres.length} titres)`,
        traces === r.titres.length && r.titres.every(s => s.h >= r.SUB_H_MIN - 1e-9), r.titres);
      check(`${nom} : logés + annoncés = demandés, les premiers de l'ordre logés (${r.titres.length} + ${n} = ${r.actifs.length})`,
        r.titres.map(s => s.cle).concat(r.sansPlace).join() === r.actifs.join(), { loges: r.titres.map(s => s.cle), sansPlace: r.sansPlace });
      if (n) check(`${nom} : « + ${n} sous-graphe${n > 1 ? 's' : ''} sans place… » dit une fois, entre le dernier sous-graphe logé et le sélecteur, dans la largeur ; aucun titre de ceux-là`,
        r.ligne.length === 1 && L.t === '+ ' + n + ' sous-graphe' + (n > 1 ? 's' : '') + ' sans place : agrandissez la fenêtre ou décochez-en'
          && L.y >= fin && L.y <= r.H - r.RS && L.x >= 0 && L.x + L.w <= r.W && !r.titresCaches.length, r);
      else check(`${nom} : tous logés, aucune ligne « sans place »`, !r.ligne.length, r.ligne);
      if (r.serre && r.titres.length) {
        check(`${nom} : les sous-graphes logés sont réduits dans la même proportion`,
          new Set(r.titres.map(s => (s.h / ({ vol: 110, rsi: 120, macd: 120, stoch: 120, atr: 110, obv: 110, mfi: 120, williamsR: 120, cci: 120, adx: 120, ao: 110 })[s.cle]).toFixed(6))).size === 1, r.titres);
      } else if (!r.serre) {
        check(`${nom} (${r.H} px) : la place suffit, chaque sous-graphe garde sa hauteur, le tracé principal prend le reste`,
          r.titres.every(s => s.h === ({ vol: 110, rsi: 120, macd: 120 })[s.cle]) && r.mainH === r.H - 4 - r.RS - r.total && traces === r.titres.length && titresDedans, r);
      }
      check(`${nom} : aucune erreur JavaScript`, !o3.erreurs.length, o3.erreurs);
      await o3.ctx.close();
    }

    // ─── 4. Le tracé de l'Expert ───
    titre('4. Le tracé de l\'Expert : un nom par chose, le format de la page, l\'unité de la paire, l\'heure de l\'appareil');
    {
      // Un fuseau loin d'UTC (Auckland, UTC+13 en octobre) : une heure UTC affichée s'y verrait.
      const o4 = await ouvrir(nav, BASE, { width: 1440, height: 1500 }, 'Pacific/Auckland');
      const p4 = o4.page, pause = ms => p4.waitForTimeout(ms);
      // Ce que le graphique et son calque écrivent, sur un dessin complet.
      const releve = () => p4.evaluate(() => {
        const vus = [], f = CanvasRenderingContext2D.prototype.fillText;
        CanvasRenderingContext2D.prototype.fillText = function (t, x, y) { if (this.canvas.id === 'chart' || this.canvas.id === 'chartCalque') vus.push({ t: String(t), x, y, c: this.canvas.id }); return f.apply(this, arguments); };
        try { drawChart(); dessinerCalque(); } finally { CanvasRenderingContext2D.prototype.fillText = f; }
        return vus;
      });

      // Noms (points 18, 34, 35, 36, 46, 109) : le ruban, le menu et les titres disent la même chose.
      const noms = await p4.evaluate(() => {
        const txt = el => el.textContent.trim(), menu = {};
        for (const cat of INDICATORS) for (const it of cat.items) menu[it.key] = it.label;
        return { sections: [...document.querySelectorAll('#indicatorBar > .section-title')].map(txt), titres: TITRES_CAT, menu,
          puces: [...document.querySelectorAll('#indicatorBar label[id^="lbl_"]')].map(l => ({ cle: l.id.slice(4), t: txt(l) })),
          sous: SUB_ORDRE.map(k => ({ cle: k, titre: subTitle(k), menu: menu[k] })), jour: txt(document.getElementById('int_1d')),
          equity: 'equity' in activeSubs || SUB_ORDRE.includes('equity') || INDICATORS.some(c => c.items.some(i => i.key === 'equity')) };
      });
      check('ruban et menu : les mêmes catégories (« Sur les bougies », « Sous le graphique »), plus « Overlays » ni « Sous-graphes »',
        noms.sections.includes(noms.titres.Overlays) && noms.sections.includes(noms.titres['Sous-graphes']) && !noms.sections.some(s => /^(Overlays|Sous-graphes)$/i.test(s)), noms.sections);
      check(`chaque puce du ruban (${noms.puces.length}) est le nom du menu, paramètres ôtés (« EMA 20 », « Stochastique »)`,
        noms.puces.length > 0 && noms.puces.every(p => { const m = noms.menu[p.cle] || ''; return m === p.t || m.startsWith(p.t + ' ') || m.includes(' ' + p.t + ' '); }), { puces: noms.puces, menu: noms.menu });
      check('menu en français, un nom par couche : « Retracements de Fibonacci », « Profil de volume », « Nuage Ichimoku », « ADX / DMI (14) », « Ordres en attente (carte) »',
        noms.menu.fib === 'Retracements de Fibonacci' && noms.menu.vp === 'Profil de volume' && noms.menu.ichimoku === 'Nuage Ichimoku' && /^ADX \/ DMI \(\d+\)$/.test(noms.menu.adx) && noms.menu.liq === 'Ordres en attente (carte)', noms.menu);
      check('chaque sous-graphe a pour titre son nom du menu (« ADX / DMI (14) », pas « ADX (14) »)', noms.sous.every(s => s.titre === s.menu), noms.sous);
      check('l\'intervalle journalier s\'écrit « 1 j », comme « 1m » et « 1h » en minuscules', noms.jour === '1 j', noms.jour);
      check('le sous-graphe d\'équité du Grid Bot, qu\'aucune case n\'allumait, n\'existe plus', !noms.equity);

      // Formats et unités (points 25, 26, 27, 42) sur BTC/USDT : S/R, Fibonacci, profil de volume, sous-graphes en prix.
      await p4.evaluate(async () => { for (const k of ['sr', 'fib', 'vp']) overlays[k] = true; for (const k of ['atr', 'obv', 'cci']) activeSubs[k] = true; resizeCanvas(); await refreshRefSR(); });
      const t1 = await releve();
      const anglais = t1.filter(x => /\$\s?\d|\d,\d{3}\.\d|\d{4,}\.\d/.test(x.t)).map(x => x.t);
      check('aucun prix au format anglais ni « $ » devant le nombre, sur le graphique et son calque', !anglais.length, [...new Set(anglais)].slice(0, 12));
      const axe = t1.filter(x => x.c === 'chartCalque' && /^\d[\d ]*,\d\d \$$/.test(x.t));
      check(`axe et étiquette du prix au format de l'Expert (« 86 012,50 $ ») : ${new Set(axe.map(x => x.t)).size} libellés`, new Set(axe.map(x => x.t)).size >= 6, t1.filter(x => x.c === 'chartCalque').map(x => x.t).slice(0, 12));
      const motif = (nom, re) => check(`${nom} au format de la page`, t1.some(x => re.test(x.t)), t1.map(x => x.t).filter(t => /\$|%/.test(t)).slice(0, 20));
      motif('badge S/R « 86 154,92 $ · 4h »', /^\d[\d ]*,\d\d \$ · (15m|1h|4h)$/);
      motif('Fibonacci « 23,6 % · 85 855,11 $ »', /^\d+,\d % · \d[\d ]*,\d\d \$$/);
      motif('POC « POC 85 933 $ »', /^POC \d[\d ]* \$$/);
      motif('pastille de la vue « +0,65 % »', /^[+−]?\d+,\d\d %$/);
      motif('compteur « 50/3 000 · 09/10 22:45 → 10/10 11:00 »', /^\d[\d ]*\/\d[\d ]* · \d\d\/\d\d \d\d:\d\d → \d\d\/\d\d \d\d:\d\d$/);
      // OBV : le badge du réticule au format de l'axe (« 4,8 k »), pas toujours en millions (« 0.05M »).
      const obv = await p4.evaluate(() => {
        const s = geo.sous.find(x => x.cle === 'obv'), W = geo.W, v = calcOBV(cols().close, cols().vol), i = candles.length - 1;
        return { badge: getSubIndicatorValue('obv', i), v: v[i], s: !!s };
      });
      check(`OBV : le badge (« ${obv.badge} ») au format abrégé de l'axe, sans « M » sous le million`,
        obv.s && /^−?\d+(,\d)?( k| M| Md)?$/.test(obv.badge || '') && (Math.abs(obv.v) >= 1e6 || !/M/.test(obv.badge)), obv);

      // Les heures (en-tête de cette partie) : celles de l'appareil, ici Auckland.
      const heures = await p4.evaluate(() => {
        const z = x => String(x).padStart(2, '0'), loc = ms => { const d = new Date(ms); return z(d.getDate()) + '/' + z(d.getMonth() + 1) + ' ' + z(d.getHours()) + ':' + z(d.getMinutes()); };
        const vs = Math.max(0, viewStart), ve = Math.min(candles.length, viewEnd);
        marketData = Object.assign({}, marketData, { updated: new Date(candles[ve - 5].time * 1000).toISOString() });
        const tu = candles[ve - 5].time * 1000, auj = new Date(tu).toDateString() === new Date().toDateString();
        return { debut: loc(candles[vs].time * 1000), fin: loc(candles[ve - 1].time * 1000), repere: auj ? loc(tu).slice(6) : loc(tu), decalage: new Date().getTimezoneOffset() };
      });
      const t2 = await releve();
      const cpt = (t2.find(x => / → /.test(x.t) && /^\d/.test(x.t)) || {}).t || '';
      check(`fuseau de l'appareil (UTC${heures.decalage <= 0 ? '+' : '−'}${Math.abs(heures.decalage / 60)}) : le compteur dit « ${heures.debut} → ${heures.fin} »`,
        heures.decalage !== 0 && cpt.endsWith(' · ' + heures.debut + ' → ' + heures.fin), { cpt, heures });
      const rep = (t2.find(x => /^fichier /.test(x.t)) || {}).t || '';
      check(`repère de la publication à l'heure de l'appareil (« fichier ${heures.repere} · prix publié … »)`, rep.startsWith('fichier ' + heures.repere + ' · prix publié '), { rep, heures });
      check('aucune heure dite « UTC » par le compteur, l\'axe des temps ou le repère', !t2.some(x => /UTC/.test(x.t) && (/ → |^fichier /.test(x.t) || /^(\d\d\/\d\d )?\d\d:\d\d( UTC)?$/.test(x.t))), t2.filter(x => /UTC/.test(x.t)).map(x => x.t));

      // CCI (point 24) : les lignes ±100 sont là où la courbe vaut ±100.
      const cci = await p4.evaluate(() => {
        const n = document.createElement('canvas').getContext('2d'); n.strokeStyle = COLORS.cci; const encre = n.strokeStyle;
        const vrai = calcCCI, P = CanvasRenderingContext2D.prototype, mt = P.moveTo, lt = P.lineTo, ft = P.fillText, pts = [], lib = [];
        calcCCI = (h, l, c) => c.map((_, i) => (i % 2 ? 100 : -100));
        memoCache.clear();
        P.moveTo = function (x, y) { if (this.canvas.id === 'chart' && this.strokeStyle === encre) pts.push(y); return mt.apply(this, arguments); };
        P.lineTo = function (x, y) { if (this.canvas.id === 'chart' && this.strokeStyle === encre) pts.push(y); return lt.apply(this, arguments); };
        P.fillText = function (t, x, y) { if (this.canvas.id === 'chart') lib.push({ t: String(t), y }); return ft.apply(this, arguments); };
        try { drawChart(); } finally { P.moveTo = mt; P.lineTo = lt; P.fillText = ft; calcCCI = vrai; memoCache.clear(); drawChart(); }
        const s = geo.sous.find(x => x.cle === 'cci');
        const dans = y => s && y > s.y && y < s.y + s.h;
        const yDe = t => { const e = lib.find(e => e.t === t && dans(e.y)); return e ? e.y - 3 : null; };
        return { haut: yDe('100'), bas: yDe(Fmt.MOINS + '100'), pts: pts.filter(dans) };
      });
      check(`CCI : la courbe à +100 et à −100 passe sur les lignes « 100 » et « −100 » (${cci.pts.length} points)`,
        cci.haut !== null && cci.bas !== null && cci.pts.length > 10 && cci.pts.every(y => Math.abs(y - cci.haut) < 0.5 || Math.abs(y - cci.bas) < 0.5), { haut: cci.haut, bas: cci.bas, pts: [...new Set(cci.pts.map(y => Math.round(y * 10) / 10))].slice(0, 6) });

      // ATR (point 40) : sur une paire à ~2,5 $ (XRP), l'ATR (~0,005) garde ses chiffres significatifs.
      const atr = await p4.evaluate(() => {
        const avant = candles, k = 34400;
        candles = candles.map(c => Object.assign({}, c, { open: c.open / k, high: c.high / k, low: c.low / k, close: c.close / k }));
        memoCache.clear();
        const lib = [], ft = CanvasRenderingContext2D.prototype.fillText;
        CanvasRenderingContext2D.prototype.fillText = function (t, x, y) { if (this.canvas.id === 'chart') lib.push({ t: String(t), x, y }); return ft.apply(this, arguments); };
        let s, badge;
        try { drawChart(); s = geo.sous.find(x => x.cle === 'atr'); badge = getSubIndicatorValue('atr', candles.length - 1); }
        finally { CanvasRenderingContext2D.prototype.fillText = ft; candles = avant; memoCache.clear(); drawChart(); }
        return { axe: lib.filter(e => s && e.y > s.y && e.y < s.y + s.h && Math.abs(e.x - (geo.W - 8)) < 0.5).map(e => e.t), badge };
      });
      check(`ATR à ~2,5 $ : trois graduations distinctes à 4 décimales (${atr.axe.join(' | ')}), badge « ${atr.badge} »`,
        atr.axe.length === 3 && new Set(atr.axe).size === 3 && atr.axe.every(t => /^\d+,\d{4} \$$/.test(t)) && /^\d+,\d{4} \$$/.test(atr.badge || ''), atr);

      // Étiquettes de ligne (point 37) : VWAP, Bollinger et Ichimoku comme les moyennes mobiles.
      const lignes = await p4.evaluate(() => {
        const vus = [], d = drawLine;
        drawLine = function (...a) { vus.push(a[10]); return d.apply(this, a); };
        for (const k of ['vwap', 'bb', 'ichimoku']) overlays[k] = true;
        try { drawChart(); } finally { drawLine = d; for (const k of ['vwap', 'bb', 'ichimoku']) overlays[k] = false; drawChart(); }
        return vus;
      });
      check('chaque ligne sur les bougies porte son étiquette : VWAP, Bollinger (+2 σ, milieu, −2 σ), Tenkan, Kijun',
        lignes.length >= 6 && lignes.every(e => typeof e === 'string' && e.length > 0)
          && ['VWAP', 'Bollinger +2 σ', 'Bollinger (milieu)', 'Bollinger −2 σ', 'Tenkan (rapide)', 'Kijun (lente)'].every(n => lignes.includes(n)), lignes);

      // Légende S/R (point 32) : un trait par intervalle d'origine, ceux qui existent seulement.
      const legende = async () => (await releve()).filter(x => x.c === 'chart' && x.y === 42).map(x => x.t);
      const l15 = await legende();
      check(`légende S/R en 15m : « ${l15.join(' ')} » (l'intervalle affiché et ses deux de référence)`, l15.join('|') === 'S/R par intervalle :|15m|1h|4h', l15);
      await p4.evaluate(() => changeInterval('1d', document.getElementById('int_1d')));
      await pause(1500);
      await p4.evaluate(() => refreshRefSR());
      const l1j = await legende();
      check(`légende S/R en 1 j : « ${l1j.join(' ')} » (un seul intervalle de référence : pas de 3e trait)`, l1j.join('|') === 'S/R par intervalle :|1 j|1 sem.', l1j);
      check('ni « Mineur », ni « Interm. », ni « Majeur » : la légende ne classe pas par importance', ![...l15, ...l1j].some(t => /Mineur|Interm|Majeur/.test(t)));
      await p4.evaluate(() => changeInterval('15m', document.getElementById('int_15m')));
      await pause(1500);

      // Bulle d'un niveau du Guide en Expert (point 45) : son titre dans les mots de l'Expert.
      const bulles = await p4.evaluate(() => {
        drawChart();
        const u = guideUnite(), c = guideEtat ? guideEtat.cibles.filter(c => c.niveau) : [];
        return c.map(c => ({ titre: c.titre, exp: Guide.libelleNiveau(c.niveau.niv, 'expert', u), deb: Guide.libelleNiveau(c.niveau.niv, 'debutant', u) }));
      });
      check(`Expert : les ${bulles.length} bulles de niveau ont pour titre la forme Expert, pas les mots du Débutant`,
        bulles.length > 0 && bulles.every(b => b.titre === b.exp) && bulles.some(b => b.exp !== b.deb), bulles.slice(0, 4));

      // Paires (points 26, 44, 110) : l'unité, les couches d'une seule paire, le compteur.
      const paires = await p4.evaluate(async () => {
        const attendre = ms => new Promise(r => setTimeout(r, ms));
        const lire = () => { const c = document.getElementById('indCompte'); return c.hidden ? 0 : +c.textContent; };
        const ligne = k => { const e = document.querySelector('#indMenu label[data-ind="' + k + '"]'); return e && { indispo: e.classList.contains('indispo'), coupee: e.querySelector('input').disabled, dit: (e.querySelector('.ind-seul') || {}).textContent || '' }; };
        const marche = () => INDICATORS.filter(c => c.cat !== 'Guide').flatMap(c => c.items).filter(i => isActive(i.key)).length;
        for (const k of ['guide', 'scenarios']) if (!isActive(k)) toggleAny(k);
        if (overlays.liq) toggleAny('liq');
        compterIndicateurs();   // les couches allumées plus haut sans passer par le menu
        const sans = { compte: lire(), marche: marche() };
        toggleAny('liq');
        const avec = lire();
        changeSymbol('SOLUSDT', document.getElementById('sym_SOLUSDT')); await attendre(1200);
        buildDropdown();
        const sol = { compte: lire(), liq: ligne('liq'), scen: ligne('scenarios'), ema: ligne('ema20') };
        changeSymbol('BTCSOL', document.getElementById('sym_BTCSOL')); await attendre(1200);
        const vus = [], f = CanvasRenderingContext2D.prototype.fillText;
        CanvasRenderingContext2D.prototype.fillText = function (t) { if (this.canvas.id === 'chart' || this.canvas.id === 'chartCalque') vus.push(String(t)); return f.apply(this, arguments); };
        try { drawChart(); dessinerCalque(); } finally { CanvasRenderingContext2D.prototype.fillText = f; }
        const atrSol = getSubIndicatorValue('atr', candles.length - 1);
        changeSymbol('BTCUSDT', document.getElementById('sym_BTCUSDT')); await attendre(1200);
        buildDropdown();
        return { sans, avec, sol, btcsol: { dollars: vus.filter(t => /\$/.test(t)), sol: vus.filter(t => /\d SOL$|\d SOL ·/.test(t)), atr: atrSol }, retour: { compte: lire(), liq: ligne('liq') } };
      });
      check(`compteur : les indicateurs de marché seuls (${paires.sans.compte} = ${paires.sans.marche}), ni le Guide ni les scénarios`, paires.sans.compte === paires.sans.marche && paires.sans.marche >= 1, paires.sans);
      check('compteur : « Ordres en attente (carte) » compté sur BTC/USDT, pas sur SOL/USDT où elle ne dessine rien', paires.avec === paires.sans.compte + 1 && paires.sol.compte === paires.sans.compte && paires.retour.compte === paires.avec, paires);
      check('SOL/USDT : « Ordres en attente (carte) » et les scénarios grisés, non cochables, « BTC/USDT seulement »',
        [paires.sol.liq, paires.sol.scen].every(l => l && l.indispo && l.coupee && l.dit === 'BTC/USDT seulement') && paires.sol.ema && !paires.sol.ema.indispo && !paires.sol.ema.coupee, paires.sol);
      check('retour sur BTC/USDT : la case redevient cochable', paires.retour.liq && !paires.retour.liq.indispo && !paires.retour.liq.coupee, paires.retour);
      check(`BTC/SOL : prix en « SOL » (axe, étiquette, S/R, Fibonacci, POC, ATR « ${paires.btcsol.atr} »), aucun « $ »`,
        !paires.btcsol.dollars.length && paires.btcsol.sol.length >= 6 && / SOL$/.test(paires.btcsol.atr || ''), paires.btcsol);
      check('aucune erreur JavaScript', !o4.erreurs.length, o4.erreurs);
      await o4.ctx.close();
    }

    // ─── 5. L'âge de la carte et le compteur, sur la même rangée ───
    titre('5. Âge de la carte : jamais sur le compteur ; il garde l\'âge de la publication, même au téléphone');
    for (const w of [360, 390, 412, 1440]) {
      const o5 = await ouvrir(nav, BASE, { width: w, height: 844 });
      const r5 = await o5.page.evaluate(async () => {
        overlays.liq = true; await fetchHeatmap(true); resizeCanvas(); drawChart();
        const vus = [], f = CanvasRenderingContext2D.prototype.fillText;
        CanvasRenderingContext2D.prototype.fillText = function (t, x, y) {
          if ((this.canvas.id === 'chart' || this.canvas.id === 'chartCalque') && Math.abs(y - 13) < 1) {
            const l = this.measureText(String(t)).width, d = this.textAlign === 'right' ? x - l : x;
            vus.push({ t: String(t), x0: d, x1: d + l, c: this.canvas.id });
          }
          return f.apply(this, arguments);
        };
        try { drawChart(); dessinerCalque(); } finally { CanvasRenderingContext2D.prototype.fillText = f; }
        return { vus, age: texteAgeCouche() };
      });
      const cpt = r5.vus.find(v => v.c === 'chart' && /^\d[\d ]*\/\d/.test(v.t)), age = r5.vus.find(v => v.c === 'chartCalque' && r5.age.variantes.includes(v.t));
      check(`${w} px : « ${age ? age.t : '—'} » à droite du compteur « ${cpt ? cpt.t : '—'} », sans le toucher`,
        !!cpt && !!age && age.x0 >= cpt.x1 + 8 && /publiée il y a|^Carte publiée/.test(age.t), r5.vus);
      if (w >= 1440) check('1440 px : la forme pleine (ses deux âges) et le compteur avec sa plage', !!age && age.t === r5.age.texte && !!cpt && / → /.test(cpt.t), r5.vus);
      check(`${w} px : aucune erreur JavaScript`, !o5.erreurs.length, o5.erreurs);
      await o5.ctx.close();
    }
  } finally { await nav.close(); serveur.close(); }
  console.log(ko ? `\n❌ INTERFACE : ${ko} contrôle(s) en échec` : '\n✅ INTERFACE : TOUS LES CONTRÔLES PASSENT');
  process.exit(ko ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
