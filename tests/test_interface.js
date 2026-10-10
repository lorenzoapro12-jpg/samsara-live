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
//      sur le sélecteur de plage ; sur un canvas haut, ils gardent leur hauteur.
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

async function ouvrir(nav, theme, vue) {
  const ctx = await nav.newContext({ viewport: vue, deviceScaleFactor: 1 });
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
// Mode Complet : ce test mesure les éléments denses (chiffres clés, menus, sous-graphes…), masqués
  // en Lisible (le mode par défaut) ; leur version Lisible est vérifiée dans test_debutant_page.js.
  await page.addInitScript(t => { try { localStorage.clear(); localStorage.setItem('samsara-mode', 'expert'); localStorage.setItem('samsara-theme', t); } catch (e) { /* */ } }, theme);
  // Traces du canvas du graphique, relevées seulement quand un contrôle les demande
  // (window.__traits / window.__textes) : style et tirets de chaque trait, texte et ordonnée.
  await page.addInitScript(() => {
    const P = CanvasRenderingContext2D.prototype, stroke = P.stroke, fillText = P.fillText;
    P.stroke = function (...a) { if (window.__traits && this.canvas.id === 'chart') window.__traits.push({ s: this.strokeStyle, w: this.lineWidth, d: this.getLineDash().join(' ') }); return stroke.apply(this, a); };
    P.fillText = function (t, x, y, ...a) { if (window.__textes && this.canvas.id === 'chart') window.__textes.push({ t: String(t), x, y }); return fillText.call(this, t, x, y, ...a); };
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

    titre('3. Disposition : les sous-graphes ne débordent jamais sur le sélecteur de plage');
    for (const [nom, vue, subs] of [['canvas bas', { width: 1440, height: 700 }, ['rsi', 'macd']], ['canvas haut', { width: 1440, height: 1500 }, ['rsi', 'macd']],
                                    ['canvas très bas, 5 sous-graphes', { width: 1280, height: 560 }, ['rsi', 'macd', 'stoch', 'atr']]]) {
      const o3 = await ouvrir(nav, BASE, vue);
      const r = await o3.page.evaluate(subs => {
        for (const k of subs) activeSubs[k] = true;
        resizeCanvas(); window.__textes = []; drawChart();
        const H = canvas.height / devicePixelRatio, d = dispositionGraphique(H), textes = window.__textes; window.__textes = null;
        let total = 0; for (const s of d.sous) total += subHeights[s.cle];
        const titres = d.sous.map(s => ({ cle: s.cle, y: s.y, h: s.h, titre: (textes.find(x => x.t === subTitle(s.cle)) || {}).y }));
        return { H, RS: RS_HEIGHT, mainH: d.mainH, total, titres, serre: H - 4 - RS_HEIGHT - total < MAIN_H_MIN, MAIN_H_MIN };
      }, subs);
      const fin = r.titres.length ? r.titres[r.titres.length - 1].y + r.titres[r.titres.length - 1].h : r.mainH + 4;
      const titresDedans = r.titres.every(s => s.titre === undefined || s.titre < r.H - r.RS);
      const traces = r.titres.filter(s => s.titre !== undefined).length;
      if (r.serre) {
        check(`${nom} (${r.H} px, ${r.titres.length} sous-graphes demandant ${r.total} px) : tout tient au-dessus du sélecteur de plage`,
          fin <= r.H - r.RS + 0.5 && titresDedans && r.mainH >= Math.min(r.MAIN_H_MIN, r.H - 4 - r.RS), r);
        check(`${nom} : les sous-graphes sont réduits dans la même proportion`,
          new Set(r.titres.map(s => (s.h / ({ vol: 110, rsi: 120, macd: 120, stoch: 120, atr: 110 })[s.cle]).toFixed(6))).size === 1, r.titres);
        if (nom === 'canvas bas') check(`${nom} : chaque sous-graphe réduit reste tracé (${traces}/${r.titres.length} titres)`, traces === r.titres.length, r.titres);
      } else {
        check(`${nom} (${r.H} px) : la place suffit, chaque sous-graphe garde sa hauteur, le tracé principal prend le reste`,
          r.titres.every(s => s.h === ({ vol: 110, rsi: 120, macd: 120 })[s.cle]) && r.mainH === r.H - 4 - r.RS - r.total && traces === r.titres.length && titresDedans, r);
      }
      await o3.ctx.close();
    }
  } finally { await nav.close(); serveur.close(); }
  console.log(ko ? `\n❌ INTERFACE : ${ko} contrôle(s) en échec` : '\n✅ INTERFACE : TOUS LES CONTRÔLES PASSENT');
  process.exit(ko ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
