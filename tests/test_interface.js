// L'interface de la page, vérifiée dans un vrai navigateur (Chromium, Playwright) : ce qui ne
// se juge qu'à l'écran — où un menu s'ouvre, ce que le graphique dessine.
//
//   1. MENUS : « Choisir l'affichage », Thème, Paire s'ouvrent dans l'écran — sous leur bouton, ou au-dessus
//      quand la place manque en dessous (bouton dans une barre basse : Néon, barres des tâches),
//      bornés à 8 px des bords, défilants s'ils sont plus hauts que l'écran. Dans chaque thème, deux
//      couleurs qui ne trompent pas (revue du 14/10, C13 et C14) : « Tout afficher » a l'habit des
//      autres boutons, pas celui d'un bouton enfoncé ; « En résumé » est à l'encre neutre, et seule
//      la barre d'un résumé en hausse ou en baisse prend leur couleur.
//   2. CROCHETS DU GRAPHIQUE (jetons de thème lus par lireJetons) : sans jeton, le graphique
//      d'avant (rampe de chaleur historique à l'octet près, bougies pleines, grille pleine) ; avec
//      un jeton, la FORME change — bougies creuses ou en barres, grille en trait mixte, police
//      du canvas, encre de la chaleur — jamais la position d'un prix ; la couche de chaleur est
//      refaite quand le thème change (son id est dans la clé du cache).
//   3. DISPOSITION : sur un canvas bas, les sous-graphes sont réduits et ne débordent jamais
//      sur le sélecteur de plage ; sur un canvas haut, ils gardent leur hauteur. Le tracé du prix
//      garde 60 % de la hauteur utile ; au plus 3 sous-graphes dessinés, chacun tracé (jamais un
//      cadre vide) ; les autres sont rangés en onglets, pas dessinés.
//   4. LE TRACÉ DE L'EXPERT : un nom par chose (légende du ruban, panneau, titres), le format de la page
//      (« 86 012,50 $ », « +0,65 % »), l'unité de la paire (« SOL » sur BTC/SOL), l'heure de
//      l'appareil (fuseau d'Auckland), le CCI à ±100 sur ses lignes, l'ATR lisible à 2,5 $, une
//      étiquette par ligne, la légende S/R par intervalle, les couches d'une seule paire grisées
//      et hors du compteur.
//   5. ÂGE DE LA CARTE : à droite du compteur, sans le toucher ; au téléphone, sa forme courte
//      (« Carte publiée il y a … ») et le compteur sans sa plage.
//   6. SÉLECTEUR DE PLAGE : la légende des sessions ne couvre ni le cadre des bougies vues ni le
//      compteur, que le cadre soit à droite ou à gauche ; « 50/3 000 » n'y est pas répété.
//   7. « CHOISIR L'AFFICHAGE » (Complet) : tête (« Tout afficher », « Revenir au départ »,
//      préréglages), calques rangés par question, chaque ligne avec sa phrase, son importance (une
//      forme ET un mot) et sa fiche ; chaque préréglage, la sélection gardée d'une visite à l'autre,
//      « Revenir au départ » ; « Tout afficher » : au plus 3 sous-graphes, les autres en onglets
//      qu'un clic échange, le prix à 60 % ; la légende du ruban (calques allumés, la croix masque).
//   8. LE PANNEAU TIENT DANS L'ÉCRAN, à 360, 390 et 1440 px, dans neuf thèmes et les deux modes
//      (le bouton des « Outils » compris).
//   9. GESTES, MENUS ET CLAVIER (revue du 14/10, C23, C36, C37) : au doigt, la dernière ligne
//      visible du panneau se coche au 1er toucher ; le menu des thèmes, resté ouvert après un thème
//      qui change la structure, se replace contre son bouton ; après un zoom à deux doigts, le doigt
//      resté posé fait glisser le graphique ; au clavier, Tab atteint les six intervalles, Entrée et
//      Espace les choisissent, Échap dit le panneau fermé, le filtre est vide à chaque ouverture.
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

async function ouvrir(nav, theme, vue, fuseau, tactile) {
  const ctx = await nav.newContext(Object.assign({ viewport: vue, deviceScaleFactor: 1 }, fuseau ? { timezoneId: fuseau } : {}, tactile ? { hasTouch: true, isMobile: true } : {}));
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
  // (Un rechargement voulu, marqué dans la session — section 7 —, garde le stockage.)
  await page.addInitScript(t => { try { if (sessionStorage.getItem('__garder') === '1') return; localStorage.clear(); localStorage.setItem('samsara-mode', 'expert'); localStorage.setItem('samsara-theme', t); } catch (e) { /* */ } }, theme);
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

/** Deux couleurs qui ne trompent pas (revue du 14/10, C13 et C14), dans le thème de la page, menu
 *  « Choisir l'affichage » ouvert. « Tout afficher » est une action : il a l'habit de « Revenir au
 *  départ », pas celui d'un bouton enfoncé (rempli de l'accent, il valait « Mon écran » enfoncé en
 *  Codex, Gare et Bureau 95 contraste). « En résumé » : la boîte (fond, cadre) est la même quel que
 *  soit le ton, à l'encre neutre --ink-3 ; un résumé neutre a sa barre loin des quatre couleurs de
 *  hausse et de baisse (elle valait --down en Gazette, --down-ink en Codex, --up en Néon) ; seule la
 *  barre d'un résumé en hausse ou en baisse prend --up-ink ou --down-ink. */
async function deuxCouleurs(page, id) {
  const co = await page.evaluate(() => {
    const habit = b => { const s = getComputedStyle(b); return [s.backgroundColor, s.backgroundImage, s.color, s.borderTopColor, s.fontWeight].join(' | '); };
    const jeton = n => { const i = document.createElement('i'); i.style.color = `var(${n})`; document.body.append(i); const c = getComputedStyle(i).color; i.remove(); return c; };
    const tout = document.querySelector('#indMenu .aff-boutons .aff-tout'), mon = document.querySelector('#indMenu .aff-boutons .aff-mon-ecran');
    const revenir = document.querySelector('#indMenu .aff-boutons .aff-btn:not(.aff-tout):not(.aff-mon-ecran)');
    if (!tout || !mon || !revenir) return null;
    const avant = mon.getAttribute('aria-pressed'); mon.setAttribute('aria-pressed', 'true');
    const presse = habit(mon); mon.setAttribute('aria-pressed', avant);
    const li = document.getElementById('synthese');
    let tons = null;
    if (li) {
      const cls = li.className; tons = {};
      for (const t of ['partage', 'calme', 'hausse', 'baisse']) { li.className = 'synthese ton-' + t; const s = getComputedStyle(li); tons[t] = { barre: s.borderLeftColor, cadre: s.borderTopColor, fond: s.backgroundColor }; }
      li.className = cls;
    }
    return { tout: habit(tout), revenir: habit(revenir), presse, tons,
      J: { ink3: jeton('--ink-3'), up: jeton('--up'), down: jeton('--down'), upInk: jeton('--up-ink'), downInk: jeton('--down-ink') } };
  });
  check(`${id.padEnd(9)} · « Tout afficher » habillé comme « Revenir au départ », pas comme un bouton enfoncé`, !!co && co.tout === co.revenir && co.tout !== co.presse, co && { tout: co.tout, revenir: co.revenir, presse: co.presse });
  if (!co || !co.tons) return check(`${id.padEnd(9)} · « En résumé » présent (Le détail, colonne ouverte à 1440 px)`, false, co && co.tons);
  // « color(srgb r g b / a) » (color-mix) ou « rgb(r, g, b) » → [r, g, b] sur 255.
  const rvb = s => { const v = (s.match(/[\d.]+/g) || []).slice(0, 3).map(Number); return /^color\(srgb/.test(s) ? v.map(x => Math.round(x * 255)) : v; };
  const ecart = (a, b) => Math.max(...rvb(a).map((x, k) => Math.abs(x - rvb(b)[k])));
  const { tons: T, J } = co, sens = [J.up, J.down, J.upInk, J.downInk];
  const neutres = ['partage', 'calme'].map(t => ({ t, barre: T[t].barre, loin: Math.min(...sens.map(c => ecart(T[t].barre, c))) }));
  const boite = Object.values(T).every(x => x.fond === T.partage.fond && x.cadre === T.partage.cadre) && ecart(T.partage.cadre, J.ink3) <= 1;
  check(`${id.padEnd(9)} · « En résumé » : boîte à l'encre neutre, barre neutre loin de la hausse et de la baisse (écart ≥ 24), barre en hausse --up-ink, en baisse --down-ink`,
    boite && neutres.every(n => n.barre === J.ink3 && n.loin >= 24) && T.hausse.barre === J.upInk && T.baisse.barre === J.downInk, { tons: T, J, neutres });
}

(async () => {
  await new Promise(r => serveur.listen(0, '127.0.0.1', r));
  const nav = await playwright.chromium.launch();
  try {
    titre('1. Menus : dans l\'écran, au-dessus du bouton quand la place manque en dessous ; deux couleurs qui ne trompent pas');
    const MENUS = [['Affichage', '#indDropdownBtn', 'indMenu'], ['Thème', '#themeBtn', 'themeMenu'], ['Paire', '#paireBtn', 'paireMenu']];
    for (const t of THEMES) {
      const o = await ouvrir(nav, t.id, { width: 1440, height: 900 });
      for (const [nom, b, id] of MENUS) {
        const m = await menu(o.page, b, id);
        const place = m.boutonBas + 8 + (m.bas - m.haut) <= m.H - 8;
        // Sous le bouton quand il y a la place ; sinon AU-DESSUS (jamais par-dessus le bouton).
        const cote = place ? m.haut >= m.boutonBas : m.bas <= m.boutonHaut;
        check(`${t.id.padEnd(9)} · menu ${nom.padEnd(11)} entier dans l'écran, ${place ? 'sous' : 'au-dessus de'} son bouton`, dansLEcran(m) && cote, m);
        if (nom === 'Affichage') await deuxCouleurs(o.page, t.id);
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

    titre('3. Disposition : le prix garde 60 %, au plus 3 sous-graphes dessinés (chacun tracé), les autres en onglets, rien sur le sélecteur de plage');
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
        // Ce que demandent les sous-graphes à dessiner (les SOUS_MAX premiers), et la rangée d'onglets s'il en reste.
        let total = 0; for (const k of actifs.slice(0, SOUS_MAX)) total += subHeights[k];
        const bande = actifs.length > SOUS_MAX ? LIGNE_ONGLETS : 0;
        const titres = d.sous.map(s => ({ cle: s.cle, y: s.y, h: s.h, titre: (textes.find(x => x.t === subTitle(s.cle)) || {}).y }));
        const dispo = H - 4 - RS_HEIGHT, mainMin = Math.max(Math.min(MAIN_H_MIN, dispo), Math.ceil(dispo * MAIN_PART_MIN));
        // La rangée d'onglets (HTML posé sur le canvas) : ses boutons et sa boîte, en coordonnées du canvas.
        const og = document.getElementById('ongletsSous'), rc = canvas.getBoundingClientRect(), ro = og.getBoundingClientRect();
        const vu = !og.hidden && getComputedStyle(og).display !== 'none';
        return { W, H, RS: RS_HEIGHT, mainH: d.mainH, dispo, mainMin, part: d.mainH / dispo, total, bande, actifs, titres, SUB_H_MIN, SOUS_MAX,
          enOnglets: d.onglets, onglets: { vu, cles: vu ? [...og.querySelectorAll('button[data-sous]')].map(b => b.dataset.sous) : [], haut: ro.top - rc.top, bas: ro.bottom - rc.top, gauche: ro.left - rc.left, droite: ro.right - rc.left },
          ligne: textes.filter(x => /sans place/.test(x.t)), titresCaches: d.onglets.filter(k => textes.some(x => x.t === subTitle(k))), serre: dispo - total - bande < mainMin,
          // Place pour un sous-graphique au moins (SUB_H_MIN px), une fois le prix servi et la rangée d'onglets posée s'il en reste.
          unLoge: actifs.length > 0 && dispo - mainMin - (actifs.length > 1 ? LIGNE_ONGLETS : 0) >= SUB_H_MIN };
      }, subs);
      const fin = r.titres.length ? r.titres[r.titres.length - 1].y + r.titres[r.titres.length - 1].h : r.mainH + 4;
      const titresDedans = r.titres.every(s => s.titre === undefined || s.titre < r.H - r.RS);
      const traces = r.titres.filter(s => s.titre !== undefined).length;
      const n = r.enOnglets.length, O = r.onglets;
      check(`${nom} (${r.H} px, ${r.actifs.length} sous-graphes demandant ${r.total} px) : tout tient au-dessus du sélecteur de plage, le prix garde ${Math.round(r.part * 100)} % (≥ 60 %)`,
        fin <= r.H - r.RS + 0.5 && titresDedans && r.mainH >= r.mainMin - 0.5 && r.mainH >= Math.min(200, r.dispo) && r.part >= 0.6 - 1e-9, r);
      check(`${nom} : chaque sous-graphe logé est tracé, sur ${r.SUB_H_MIN} px au moins (${traces}/${r.titres.length} titres)`,
        traces === r.titres.length && r.titres.every(s => s.h >= r.SUB_H_MIN - 1e-9), r.titres);
      check(`${nom} : au plus ${r.SOUS_MAX} sous-graphes dessinés à la fois (${r.titres.length}) ; au moins un dès que la place le permet (${r.unLoge ? 'elle le permet' : 'elle ne le permet pas'})`,
        r.SOUS_MAX === 3 && r.titres.length <= 3 && (r.unLoge ? r.titres.length >= 1 : r.titres.length === 0), { cles: r.titres.map(s => s.cle), unLoge: r.unLoge });
      check(`${nom} : dessinés + en onglets = demandés, les premiers de l'ordre dessinés (${r.titres.length} + ${n} = ${r.actifs.length})`,
        r.titres.map(s => s.cle).concat(r.enOnglets).join() === r.actifs.join(), { loges: r.titres.map(s => s.cle), onglets: r.enOnglets });
      if (n) check(`${nom} : ${n} onglet${n > 1 ? 's' : ''} (${r.enOnglets.join(', ')}), un bouton chacun, entre le dernier sous-graphe et le sélecteur, dans la largeur ; aucun titre de ceux-là, plus de ligne « sans place »`,
        O.vu && O.cles.join() === r.enOnglets.join() && O.haut >= fin - 0.5 && O.bas <= r.H - r.RS + 0.5 && O.gauche >= 0 && O.droite <= r.W + 0.5 && !r.titresCaches.length && !r.ligne.length, r);
      else check(`${nom} : tous dessinés, aucune rangée d'onglets ni ligne « sans place »`, !O.vu && !r.ligne.length, { onglets: O, ligne: r.ligne });
      if (r.serre && r.titres.length) {
        check(`${nom} : les sous-graphes logés sont réduits dans la même proportion`,
          new Set(r.titres.map(s => (s.h / ({ vol: 110, rsi: 120, macd: 120, stoch: 120, atr: 110, obv: 110, mfi: 120, williamsR: 120, cci: 120, adx: 120, ao: 110 })[s.cle]).toFixed(6))).size === 1, r.titres);
      } else if (!r.serre) {
        check(`${nom} (${r.H} px) : la place suffit, chaque sous-graphe garde sa hauteur, le tracé principal prend le reste`,
          r.titres.every(s => s.h === ({ vol: 110, rsi: 120, macd: 120 })[s.cle]) && r.mainH === r.H - 4 - r.RS - r.total - r.bande && traces === r.titres.length && titresDedans, r);
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

      // Noms (points 18, 34, 35, 36, 46, 109) : la légende du ruban, le panneau et les titres disent la même chose.
      const noms = await p4.evaluate(() => {
        const txt = el => el.textContent.trim(), menu = {}, courts = {};
        for (const cat of INDICATORS) for (const it of cat.items) { menu[it.key] = it.label; courts[it.key] = it.court; }
        toutAfficher();   // la légende au plus long (6 puces et « + N autres »)
        const r = { sections: [...document.querySelectorAll('#indicatorBar > .section-title')].map(txt), titres: INDICATORS.map(c => c.titre), menu, courts,
          puces: [...document.querySelectorAll('#indicatorBar label[data-calque]')].map(l => ({ cle: l.dataset.calque, t: txt(l.querySelector('.ind-label')) })),
          sous: SUB_ORDRE.map(k => ({ cle: k, titre: subTitle(k), menu: menu[k] })), jour: txt(document.getElementById('int_1d')),
          equity: 'equity' in activeSubs || SUB_ORDRE.includes('equity') || INDICATORS.some(c => c.items.some(i => i.key === 'equity')) };
        revenirAuDepart(); appliquerMode('expert');   // « Revenir au départ » éteint aussi « Le détail » : rallumé, c'est le tracé du détail qu'on lit ici
        return r;
      });
      check('panneau : les calques rangés par question, plus par endroit ; ruban : « À l’écran » (la légende) et « Intervalle », plus « Overlays » ni « Sous-graphes »',
        JSON.stringify(noms.titres) === JSON.stringify(['Dans quel sens ?', 'Ça s’essouffle ?', 'Qui échange ?', 'Où le prix peut réagir ?', 'Ça bouge beaucoup ?'])
        && JSON.stringify(noms.sections) === JSON.stringify(['À l’écran', 'Intervalle']) && !noms.sections.concat(noms.titres).some(s => /^(Overlays|Sous-graphes|Sur les bougies|Sous le graphique)$/i.test(s)), noms);
      // Le nom court (légende, onglets) est le nom du panneau, paramètres ôtés : tous les calques, et chaque puce affichée.
      const court = (m, c) => !!c && (m === c || m.startsWith(c + ' ') || m.includes(' ' + c + ' ') || m.endsWith(' ' + c));
      const sansCourt = Object.keys(noms.menu).filter(k => !court(noms.menu[k], noms.courts[k]));
      check(`chaque calque a un nom court qui est le nom du panneau, paramètres ôtés (« EMA 20 », « Stochastique », « Ichimoku »)`, !sansCourt.length, sansCourt.map(k => [noms.menu[k], noms.courts[k]]));
      check(`chaque puce de la légende (${noms.puces.length}) dit le nom court de son calque`,
        noms.puces.length === 6 && noms.puces.every(p => p.t === noms.courts[p.cle] && court(noms.menu[p.cle] || '', p.t)), { puces: noms.puces });
      check('menu en français, un nom par couche : « Retracements de Fibonacci », « Profil de volume », « Nuage Ichimoku », « ADX / DMI (14) », « Ordres en attente (carte) »',
        noms.menu.fib === 'Retracements de Fibonacci' && noms.menu.vp === 'Profil de volume' && noms.menu.ichimoku === 'Nuage Ichimoku' && /^ADX \/ DMI \(\d+\)$/.test(noms.menu.adx) && noms.menu.liq === 'Ordres en attente (carte)', noms.menu);
      check('chaque sous-graphe a pour titre son nom du menu (« ADX / DMI (14) », pas « ADX (14) »)', noms.sous.every(s => s.titre === s.menu), noms.sous);
      check('l\'intervalle journalier s\'écrit « 1 j », comme « 1m » et « 1h » en minuscules', noms.jour === '1 j', noms.jour);
      check('le sous-graphe d\'équité du Grid Bot, qu\'aucune case n\'allumait, n\'existe plus', !noms.equity);

      // Formats et unités (points 25, 26, 27, 42) sur BTC/USDT : S/R, Fibonacci, profil de volume, sous-graphes en prix.
      // Cochés dans le panneau (toggleAny) : les trois derniers sous-graphes cochés sont dessinés (au
      // plus 3 à la fois), le Volume passe en onglet.
      await p4.evaluate(async () => { for (const k of ['sr', 'fib', 'vp']) overlays[k] = true; for (const k of ['atr', 'obv', 'cci']) toggleAny(k); resizeCanvas(); await refreshRefSR(); });
      check('ATR, OBV et CCI cochés : les trois dessinés', JSON.stringify(await p4.evaluate(() => geo.sous.map(s => s.cle))) === JSON.stringify(['atr', 'obv', 'cci']));
      const t1 = await releve();
      const anglais = t1.filter(x => /\$\s?\d|\d,\d{3}\.\d|\d{4,}\.\d/.test(x.t)).map(x => x.t);
      check('aucun prix au format anglais ni « $ » devant le nombre, sur le graphique et son calque', !anglais.length, [...new Set(anglais)].slice(0, 12));
      // L'axe et l'étiquette du prix : un seul format, arrondi, avec ou sans « Le détail ».
      const axe = t1.filter(x => x.c === 'chartCalque' && /^\d[\d  ]* \$$/.test(x.t));
      check(`axe et étiquette du prix au format de la page (« 86 013 $ ») : ${new Set(axe.map(x => x.t)).size} libellés`, new Set(axe.map(x => x.t)).size >= 6, t1.filter(x => x.c === 'chartCalque').map(x => x.t).slice(0, 12));
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
      // OBV : l'échelle suit le bas et le haut de la VUE (12/10 : centrée sur 0, un cumul de +11 k
      // qui bougeait de ±1 k tenait en une ligne plate). La courbe remplit la hauteur du panneau.
      const obvEch = await p4.evaluate(() => {
        const v = calcOBV(cols().close, cols().vol), vs = Math.max(0, viewStart), ve = Math.min(candles.length, viewEnd);
        let mn = Infinity, mx = -Infinity; for (let i = vs; i < ve; i++) { mn = Math.min(mn, v[i]); mx = Math.max(mx, v[i]); }
        return { mn, mx, ...basHautFenetre(v, vs, ve) };
      });
      check('OBV : échelle sur le bas et le haut de la vue (la courbe en occupe plus de 80 %), pas symétrique autour de 0',
        obvEch.bas < obvEch.mn && obvEch.haut > obvEch.mx && (obvEch.mx - obvEch.mn) / (obvEch.haut - obvEch.bas) > 0.8, obvEch);

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
        const marche = () => INDICATORS.flatMap(c => c.items).filter(i => !['guide', 'scenarios'].includes(i.key) && isActive(i.key)).length;
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

    // ─── 6. Le sélecteur de plage : la légende des sessions ne couvre ni le cadre ni le compteur ───
    titre('6. Sélecteur de plage : légende des sessions à côté du cadre des bougies vues, jamais dessus');
    for (const w of [390, 1440]) {
      const o6 = await ouvrir(nav, BASE, { width: w, height: 844 });
      const r6 = await o6.page.evaluate(() => {
        const P = CanvasRenderingContext2D.prototype, ft = P.fillText, sr = P.strokeRect, rr = P.roundRect;
        const lire = (vs, ve) => {
          viewStart = vs; viewEnd = ve;
          const t = [], c = [], l = [];
          P.fillText = function (s, x, y) { if (this.canvas.id === 'chart') t.push({ t: String(s), x, y, l: this.measureText(String(s)).width }); return ft.apply(this, arguments); };
          P.strokeRect = function (x, y, w, h) { if (this.canvas.id === 'chart') c.push({ x, y, w, h }); return sr.apply(this, arguments); };
          P.roundRect = function (x, y, w, h) { if (this.canvas.id === 'chart') l.push({ x, y, w, h }); return rr.apply(this, arguments); };
          try { drawChart(); } finally { P.fillText = ft; P.strokeRect = sr; P.roundRect = rr; }
          const leg = l.find(r => r.w === 130 && r.h === 14), cadre = leg && c.find(r => r.y === leg.y - 2), rs = t.find(x => / bougies$/.test(x.t));
          // Les dates de l'axe du temps (« 13/09 », au téléphone depuis le 14/10/2026, revue C17) ne
          // sont pas le compteur : jour et mois, deux chiffres chacun.
          return { leg, cadre, rs, nombres: t.filter(x => /^\d[\d  ]*\/\d[\d  ]*$/.test(x.t) && !/^\d\d\/\d\d$/.test(x.t)) };
        };
        const n = candles.length, droite = lire(n - 50, n), gauche = lire(0, 50);
        lire(n - 50, n);
        return { droite, gauche };
      });
      for (const [nom, r] of [['cadre à droite (les dernières bougies)', r6.droite], ['cadre à gauche (les plus anciennes)', r6.gauche]]) {
        const { leg, cadre, rs } = r;
        check(`${w} px · ${nom} : la légende ne couvre pas le cadre des bougies vues`,
          !!leg && !!cadre && (leg.x + leg.w < cadre.x - 2 || leg.x > cadre.x + cadre.w + 2), { leg, cadre });
        check(`${w} px · ${nom} : ni le compteur « ${rs ? rs.t : '—'} »`, !!leg && !!rs && (leg.x >= rs.x + rs.l + 4 || leg.x + leg.w <= rs.x - 4), { leg, rs });
        check(`${w} px · ${nom} : « 50/3 000 » écrit une fois, en haut du tracé (pas répété sous la légende)`, r.nombres.length <= 1 && r.nombres.every(x => x.y === 13), r.nombres);
      }
      check(`${w} px : aucune erreur JavaScript`, !o6.erreurs.length, o6.erreurs);
      await o6.ctx.close();
    }

    // ─── 7. Le panneau « Choisir l'affichage » (Complet) ───
    titre('7. « Choisir l’affichage » : préréglages, mémoire, « Revenir au départ », « Tout afficher » en onglets, légende du ruban');
    {
      const o7 = await ouvrir(nav, BASE, { width: 1440, height: 900 });
      const p7 = o7.page, pause = ms => p7.waitForTimeout(ms);
      const SITE = ['guide', 'scenarios'];
      // L'état affiché : calques de marché allumés, sous-graphiques, couches du site, ce qui est
      // dessiné (au plus 3 sous-graphiques) ou rangé en onglets, la légende du ruban et le panneau.
      const etat = () => p7.evaluate(SITE => {
        const vis = el => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
        const H = canvas.height / devicePixelRatio, d = dispositionGraphique(H), dispo = H - 4 - RS_HEIGHT, og = document.getElementById('ongletsSous');
        let garde = null; try { garde = JSON.parse(localStorage.getItem('samsara-affichage-v1')); } catch (e) { garde = 'illisible'; }
        // La légende attendue : chaque calque DE MARCHÉ allumé qui dessine sur la paire (posés sur les
        // bougies, puis sous-graphiques, dans l'ordre du panneau ; le Guide et les scénarios sont
        // l'écran lui-même) ; au-delà de 7, 6 puces et « + N autres » ; aucun : aucune puce.
        const items = INDICATORS.flatMap(c => c.items), dessine = i => !i.paires || i.paires.includes(activeSymbol);
        const on = items.filter(i => i.key in overlays && !SITE.includes(i.key) && overlays[i.key] && dessine(i)).concat(items.filter(i => !(i.key in overlays) && activeSubs[i.key])).map(i => i.key);
        const attendue = on.length > 7 ? on.slice(0, 6).concat('lbl__plus') : on;
        return {
          calques: document.documentElement.getAttribute('data-calques'),
          ov: Object.keys(overlays).filter(k => !SITE.includes(k) && overlays[k]).sort(), sg: Object.keys(activeSubs).filter(k => activeSubs[k]).sort(),
          site: SITE.map(k => overlays[k]), on: on.length,
          dessines: geo ? geo.sous.map(s => s.cle) : [], disposition: d.sous.map(s => s.cle), onglets: d.onglets, part: d.mainH / dispo,
          boutonsOnglets: vis(og) ? [...og.querySelectorAll('button[data-sous]')].map(b => b.dataset.sous) : [],
          puces: [...document.querySelectorAll('#indicatorBar label.puce-calque')].filter(vis).map(l => l.dataset.calque || l.id), attendue,
          noms: [...document.querySelectorAll('#indicatorBar label[data-calque]')].filter(vis).map(l => ({ cle: l.dataset.calque, t: l.querySelector('.ind-label').textContent, x: !!l.querySelector('.puce-x'), court: (items.find(i => i.key === l.dataset.calque) || {}).court })),
          presse: [...document.querySelectorAll('#indMenu .aff-preset[aria-pressed="true"]')].map(b => b.dataset.preset),
          cases: [...document.querySelectorAll('#indMenu label[data-ind] input')].filter(c => c.checked !== isActive(c.closest('label').dataset.ind)).map(c => c.closest('label').dataset.ind),
          ouvert: document.getElementById('indMenu').classList.contains('open'), aria: document.getElementById('indDropdownBtn').getAttribute('aria-expanded'),
          garde, compte: document.getElementById('indCompte').hidden ? 0 : +document.getElementById('indCompte').textContent,
          // « Mon écran » (plan du site, idée 9) : son bouton, ce qui est gardé, le lien et sa phrase.
          mon: (() => { const b = document.querySelector('#indMenu .aff-mon-ecran'); return b ? b.getAttribute('aria-pressed') : null; })(),
          monGarde: (() => { try { return JSON.parse(localStorage.getItem('samsara-mon-ecran-v1')); } catch (e) { return 'illisible'; } })(),
          lien: !!document.querySelector('#indMenu .aff-garder'), dit: (document.querySelector('#indMenu .aff-garde-dit') || {}).textContent || null,
          mode: modeCourant(),
        };
      }, SITE);
      const meme = (a, b) => JSON.stringify(a) === JSON.stringify(b);
      const legendeOk = e => meme(e.puces, e.attendue) && e.noms.every(n => n.t === n.court && n.x);

      // A. Sans clé (et sans l'ancien Complet : la page est ouverte avec « Le détail » choisi mais la
      // migration ne donne le Volume qu'à qui n'avait rien d'autre — ici, la clé est vidée d'abord) :
      // les réglages d'origine, et le panneau.
      await p7.evaluate(() => { appliquerSelection([], [], true); localStorage.removeItem('samsara-affichage-v1'); });
      let e = await etat();
      check('sans clé gardée : les réglages d’origine (aucun calque de marché ; Guide et scénarios affichés), rien de gardé',
        meme(e.ov, []) && meme(e.sg, []) && meme(e.site, [true, true]) && e.garde === null && meme(e.dessines, []), e);
      check('légende du ruban : aucune puce sans calque de marché (data-calques="0")', legendeOk(e) && meme(e.puces, []) && e.calques === '0', e);
      await p7.evaluate(() => { toggleAny('vol'); });
      e = await etat();
      check(`légende du ruban : les seuls calques de marché allumés, nom court et croix (${e.puces.join(', ')}) ; ni Guide ni scénarios (l'écran lui-même)`, legendeOk(e) && meme(e.puces, ['vol']) && e.calques === '1', e);
      await p7.evaluate(() => { toggleAny('vol'); localStorage.removeItem('samsara-affichage-v1'); });
      await p7.click('#indDropdownBtn'); await pause(200);
      e = await etat();
      check('le bouton ouvre le panneau (aria-expanded="true") ; l’origine est « L’essentiel »', e.ouvert && e.aria === 'true' && meme(e.presse, ['essentiel']), e);
      const pan = await p7.evaluate(() => {
        const m = document.getElementById('indMenu'), txt = el => el.textContent.trim();
        const fond = (el) => { const s = getComputedStyle(el, '::before'); return { couleur: s.backgroundColor, image: s.backgroundImage, bord: parseFloat(s.borderTopWidth), forme: s.borderRadius }; };
        const cats = [...m.querySelectorAll('.cat-title[data-cat]')].map(c => ({ cat: c.dataset.cat, titre: txt(c), cles: [...m.querySelectorAll('label[data-cat="' + c.dataset.cat + '"]')].map(l => l.dataset.ind) }));
        const lignes = [...m.querySelectorAll('label[data-ind]')].map(l => {
          const imp = l.querySelector('.aff-imp');
          return { cle: l.dataset.ind, nom: txt(l.querySelector('.aff-nom')), quoi: txt(l.querySelector('.aff-quoi')), imp: imp && txt(imp), classe: imp && [...imp.classList].find(c => c.startsWith('imp-')),
            forme: imp && fond(imp), fiche: !!l.querySelector('.info-btn'), coche: !!l.querySelector('input[type="checkbox"]') };
        });
        const fins = m.querySelector('details.aff-fins'), outils = m.querySelector('.aff-outils');
        return { boutons: [...m.querySelectorAll('.aff-boutons button')].map(txt), presets: [...m.querySelectorAll('.aff-preset')].map(txt), cats, lignes,
          garder: (() => { const g = m.querySelector('.aff-tete > .aff-presets + .aff-garder'); return g ? txt(g) : null; })(),
          outils: outils && { boutons: [...outils.querySelectorAll('button')].map(txt), avantFins: outils.nextElementSibling === fins },
          filtre: !!m.querySelector('#indFiltre'), apercu: !!m.querySelector('#indApercu'),
          fins: fins && { ouvert: fins.open, titre: txt(fins.querySelector('summary')), reglages: fins.querySelectorAll('.reglage').length, dernier: fins === m.querySelector('.ind-liste').lastElementChild } };
      });
      // Plan du site, idée 9 (13/10/2026) : un 3e bouton, « Mon écran », et sous les préréglages le
      // lien qui le garde — demande de Lorenzo (retrouver son affichage d'un geste).
      check('tête du panneau : exactement « Tout afficher », « Revenir au départ », « Mon écran », puis les six préréglages en mots, puis « Garder cet affichage comme mon écran »',
        meme(pan.boutons, ['Tout afficher', 'Revenir au départ', 'Mon écran']) && meme(pan.presets, ['L’essentiel', 'La tendance', 'L’élan', 'Le volume', 'Le carnet', 'Tout'])
        && pan.garder === 'Garder cet affichage comme mon écran', pan);
      // « Fourchette de 7 jours » (plan du 13/10/2026, idée 5) : rangée sous « Où le prix peut réagir ? ».
      const QUESTIONS = [['Ce que dit le graphique', ['guide', 'scenarios', 'detail', 'chiffres']], ['Dans quel sens ?', ['ema20', 'ema50', 'ema100', 'ema200', 'sma20', 'sma50', 'ichimoku', 'sar', 'vwap']],
        ['Ça s’essouffle ?', ['rsi', 'macd', 'stoch', 'williamsR', 'cci', 'mfi', 'ao']], ['Qui échange ?', ['vol', 'obv', 'vp']],
        ['Où le prix peut réagir ?', ['sr', 'fib', 'liq', 'fourchette', 'figuresPassees']], ['Ça bouge beaucoup ?', ['atr', 'bb', 'adx']]];
      check('« Ce que dit le graphique » d’abord (Guide, scénarios, Le détail, Les chiffres du marché), puis les calques rangés par question, dans l’ordre (« Dans quel sens ? », « Ça s’essouffle ? », « Qui échange ? », « Où le prix peut réagir ? », « Ça bouge beaucoup ? »)',
        meme(pan.cats.map(c => [c.titre, c.cles.slice().sort()]), QUESTIONS.map(([t, k]) => [t, k.slice().sort()])) && meme(pan.cats.find(c => c.cat === 'ecran').cles, ['guide', 'scenarios', 'detail', 'chiffres']), pan.cats);
      const MOTS = { 'imp-courant': 'courant', 'imp-utile': 'utile', 'imp-special': 'spécialisé' };
      // « Le détail » et « Les chiffres du marché » ne sont pas des calques : case, nom et phrase, sans
      // importance (ni fiche pour les chiffres, qui ont chacun la leur sur sa carte).
      const ecran = pan.lignes.filter(l => l.cle === 'detail' || l.cle === 'chiffres'), calques = pan.lignes.filter(l => !ecran.includes(l));
      const mal = calques.filter(l => !l.coche || !l.nom || !/^[A-ZÀ-Ý].{8,}[.!?]$/.test(l.quoi) || !l.fiche || MOTS[l.classe] !== l.imp)
        .concat(ecran.filter(l => !l.coche || !l.nom || !/^[A-ZÀ-Ý].{8,}[.!?]$/.test(l.quoi) || l.imp));
      // 29 calques : la fourchette de 7 jours s'ajoute (plan du 13/10/2026, idée 5).
      check(`chaque ligne (${calques.length} calques, puis « Le détail » et « Les chiffres du marché ») : case, nom, phrase « C’est quoi ? », importance en MOT (courant, utile, spécialisé) et bouton de fiche pour les calques`, calques.length === 29 && ecran.length === 2 && !mal.length, mal);
      const formes = Object.keys(MOTS).map(c => (pan.lignes.find(l => l.classe === c) || {}).forme);
      const plein = f => f && !/rgba\(0, 0, 0, 0\)|transparent/.test(f.couleur), dessin = f => f && /gradient/.test(f.image);
      check('l’importance a aussi une FORME, jamais la couleur seule : disque plein (courant), demi-disque (utile), anneau (spécialisé)',
        formes.every(f => f && f.bord > 0) && plein(formes[0]) && !dessin(formes[0]) && dessin(formes[1]) && !plein(formes[2]) && !dessin(formes[2]), formes);
      check('la recherche et l’aperçu gardés ; « Réglages fins » repliés tout en bas, avec les réglages d’affichage',
        pan.filtre && pan.apercu && pan.fins && !pan.fins.ouvert && pan.fins.titre === 'Réglages fins' && pan.fins.reglages >= 8 && pan.fins.dernier, pan.fins);
      check('chaque case dit si son calque est allumé', !e.cases.length, e.cases);
      // Plan du 13/10/2026, idée 7 : un bloc « Outils » (la calculette de risque) juste avant les
      // « Réglages fins », qui restent le dernier bloc ; ni ligne d'indicateur ni bouton de tête.
      check('« Outils » : un seul bouton, « Calculette de risque », juste avant les « Réglages fins »',
        pan.outils && meme(pan.outils.boutons, ['Calculette de risque']) && pan.outils.avantFins && pan.fins && pan.fins.dernier, pan.outils);
      // Revue du 14/10/2026, M15 [vision-10] : « range » ne trouvait rien (« Aucun indicateur ne
      // correspond. ») ; des mots cachés le mènent à la fourchette, « levier » à la calculette.
      const cherche = async (mot) => {
        await p7.fill('#indFiltre', mot); await pause(100);
        return p7.evaluate(() => {
          const m = document.getElementById('indMenu'), vide = m.querySelector('.ind-aucun');
          return { lignes: [...m.querySelectorAll('label[data-ind]:not([hidden])')].map(l => l.dataset.ind),
            aucun: !!vide && !vide.hidden, outils: !m.querySelector('.aff-outils').hidden };
        });
      };
      const rech = { range: await cherche('range'), consolidation: await cherche('Consolidation'), levier: await cherche('levier'), stop: await cherche('stop'), rien: await cherche('zzzz') };
      rech.vide = await cherche('');
      check('recherche : « range » et « consolidation » trouvent la « Fourchette de 7 jours » ; « levier » et « stop » trouvent la calculette ; un mot inconnu ne trouve toujours rien',
        meme(rech.range.lignes, ['fourchette']) && !rech.range.aucun && rech.consolidation.lignes.includes('fourchette')
        && rech.levier.outils && rech.stop.outils && rech.rien.aucun && !rech.rien.outils && !rech.vide.aucun && rech.vide.outils, rech);

      // B. Les préréglages : chacun REMPLACE la sélection ; Guide et scénarios restent comme ils sont
      // (sauf « L'essentiel ») ; « Tout » allume tout. Gardés sous samsara-affichage-v1.
      await p7.evaluate(() => toggleAny('guide'));   // le Guide masqué par l'utilisateur : les préréglages le laissent masqué
      const MARCHE = await p7.evaluate(SITE => Object.keys(overlays).filter(k => !SITE.includes(k)).sort(), SITE);
      const TOUS_SG = await p7.evaluate(() => Object.keys(activeSubs).sort());
      const PRESETS = [['tendance', ['ema20', 'ema200', 'ema50', 'ichimoku'], [], [false, true]], ['elan', [], ['macd', 'rsi', 'stoch'], [false, true]],
        ['volume', ['vp', 'vwap'], ['obv', 'vol'], [false, true]], ['carnet', ['liq', 'sr'], [], [false, true]], ['essentiel', [], [], [true, true]], ['tout', MARCHE, TOUS_SG, [true, true]]];
      for (const [id, ov, sg, site] of PRESETS) {
        await p7.click(`#indMenu .aff-preset[data-preset="${id}"]`); await pause(250);
        e = await etat();
        check(`préréglage « ${id} » : la sélection remplacée (${ov.length} sur les bougies, ${sg.length} dessous), Guide et scénarios ${id === 'essentiel' || id === 'tout' ? 'allumés' : 'laissés comme ils étaient'}, gardée ; panneau ouvert, son bouton enfoncé`,
          meme(e.ov, ov) && meme(e.sg, sg) && meme(e.site, site) && e.garde && meme(e.garde.ov.slice().sort(), ov) && meme(e.garde.sg.slice().sort(), sg)
          && e.ouvert && meme(e.presse, [id]) && !e.cases.length, e);
        check(`préréglage « ${id} » : la légende ne montre que les calques allumés (${e.puces.join(', ')})`, legendeOk(e), e);
      }
      // C. « Tout » = « Tout afficher » : au plus 3 sous-graphiques dessinés, les autres en onglets ;
      // un onglet montre le sien à la place d'un autre ; le prix garde 60 %.
      check(`« Tout » : ${e.dessines.length} sous-graphiques dessinés (≤ 3), ${e.onglets.length} en onglets, le prix garde ${Math.round(e.part * 100)} %`,
        e.dessines.length === 3 && meme(e.dessines, e.disposition) && e.dessines.length + e.onglets.length === 11 && meme(e.boutonsOnglets, e.onglets) && e.part >= 0.6 - 1e-9, e);
      check(`« Tout » : la légende garde 6 puces et « + ${e.on - 6} autres » (le ruban ne déborde pas de puces)`, e.puces.length === 7 && e.puces[6] === 'lbl__plus', e.puces);
      await p7.evaluate(() => document.getElementById('indMenu').classList.remove('open'));
      let avant = e;
      for (const k of ['adx', 'cci']) {
        await p7.click(`#ongletsSous button[data-sous="${k}"]`); await pause(250);
        e = await etat();
        const sorti = avant.dessines.filter(x => !e.dessines.includes(x));
        check(`onglet « ${k} » : dessiné à la place d’un autre (${sorti.join(', ')}, passé en onglet) ; toujours 3, le prix garde ${Math.round(e.part * 100)} %`,
          e.dessines.includes(k) && e.dessines.length === 3 && sorti.length === 1 && e.onglets.includes(sorti[0]) && !e.onglets.includes(k)
          && meme(e.boutonsOnglets, e.onglets) && e.part >= 0.6 - 1e-9 && (k !== 'cci' || e.dessines.includes('adx')), { avant: avant.dessines, apres: e.dessines, onglets: e.onglets });
        avant = e;
      }
      await p7.click('#lbl__plus'); await pause(200);
      check('« + N autres » ouvre le panneau', (await etat()).ouvert);

      // D. Mémoire : rouvert, la page reprend la sélection gardée.
      await p7.click('#indMenu .aff-preset[data-preset="volume"]'); await pause(200);
      await p7.evaluate(() => sessionStorage.setItem('__garder', '1'));
      await p7.reload(); await pause(1800);
      e = await etat();
      check('rouvert : la sélection gardée (« Le volume » : VWAP, profil de volume, Volume, OBV), sa légende', meme(e.ov, ['vp', 'vwap']) && meme(e.sg, ['obv', 'vol']) && legendeOk(e), e);
      await p7.click('#indDropdownBtn'); await pause(200);
      check('rouvert : le panneau dit le préréglage reproduit', meme((await etat()).presse, ['volume']));

      // E. « Revenir au départ » : les réglages d'origine, la clé effacée ; rouvert, toujours eux.
      await p7.click('#indMenu .aff-boutons .aff-btn:not(.aff-tout)'); await pause(250);
      e = await etat();
      check('« Revenir au départ » : aucun calque de marché, Guide et scénarios affichés, clé effacée', meme(e.ov, []) && meme(e.sg, []) && meme(e.site, [true, true]) && e.garde === null && meme(e.presse, ['essentiel']) && legendeOk(e), e);
      await p7.reload(); await pause(1800);
      e = await etat();
      check('« Revenir au départ », rouvert : toujours les réglages d’origine', meme(e.ov, []) && meme(e.sg, []) && e.garde === null, e);

      // F. Plus de sous-graphiques cochés qu'il n'en tient : la même règle (le dernier coché se montre).
      await p7.click('#indDropdownBtn'); await pause(200);
      for (const k of ['vol', 'rsi', 'macd', 'stoch']) {
        await p7.evaluate(k => document.querySelector(`#indMenu label[data-ind="${k}"]`).scrollIntoView({ block: 'center' }), k);
        await p7.click(`#indMenu label[data-ind="${k}"] input`); await pause(200);
        e = await etat();
        check(`« ${k} » coché : dessiné tout de suite (${e.dessines.join(', ')}), au plus 3, le prix garde ${Math.round(e.part * 100)} %`, e.dessines.includes(k) && e.dessines.length <= 3 && e.part >= 0.6 - 1e-9, e);
      }
      check('4 sous-graphiques cochés : les 3 derniers dessinés, le Volume en onglet', meme(e.dessines.slice().sort(), ['macd', 'rsi', 'stoch']) && meme(e.onglets, ['vol']) && meme(e.boutonsOnglets, ['vol']), e);

      // G. La légende : la croix (ou Entrée) masque ; rien d'allumé, une phrase invite à choisir.
      await p7.evaluate(() => { document.getElementById('indMenu').classList.remove('open'); toggleAny('ema50'); });
      await p7.click('#lbl_ema50 .puce-x'); await pause(200);
      e = await etat();
      check('la croix d’une puce masque son calque (EMA 50), sans ouvrir le panneau ; la case et la clé suivent', !e.ov.includes('ema50') && !e.puces.includes('ema50') && !e.ouvert && e.garde && !e.garde.ov.includes('ema50') && legendeOk(e), e);
      await p7.focus('#lbl_rsi'); await p7.keyboard.press('Enter'); await pause(200);
      e = await etat();
      check('au clavier : Entrée sur une puce masque son calque (RSI)', !e.sg.includes('rsi') && !e.puces.includes('rsi') && legendeOk(e), e);
      await p7.evaluate(() => { for (const k of ['guide', 'scenarios', 'macd', 'stoch', 'vol']) if (isActive(k)) toggleAny(k); });
      e = await etat();
      check('rien d’allumé : aucune puce (data-calques="0"), le compte à zéro ; « Choisir l’affichage » reste le chemin', meme(e.puces, []) && e.calques === '0' && e.compte === 0, e);
      await p7.click('#indDropdownBtn'); await pause(200);
      check('… qui ouvre le panneau', (await etat()).ouvert);
      // H. « Revenir au départ » : l'écran calme (sans « Le détail »), le ruban de la 1re visite — les
      // intervalles et le bouton, aucune puce.
      await p7.evaluate(() => { document.getElementById('indMenu').classList.remove('open'); revenirAuDepart(); });
      await pause(400);
      const lis = await p7.evaluate(() => {
        const vis = el => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
        return { labels: [...document.querySelectorAll('#indicatorBar label')].filter(vis).map(l => l.id), bouton: vis(document.getElementById('indDropdownBtn')), mode: modeCourant() };
      });
      check('Revenir au départ : l’écran calme, le ruban garde ses six intervalles et le bouton, sans légende', lis.mode === 'debutant' && meme(lis.labels, ['int_1m', 'int_5m', 'int_15m', 'int_1h', 'int_4h', 'int_1d']) && lis.bouton, lis);

      // I. « Mon écran » (plan du site, idée 9, 13/10/2026) : un instantané nommé de l'affichage, rappelé
      // d'un geste, gardé à part (samsara-mon-ecran-v1) : les préréglages et « Revenir au départ » ne
      // le touchent pas. Sans rien de gardé : le RSI et le MACD, les supports / résistances, le Guide
      // et les scénarios, sans « Le détail » (PARAM.monEcran). Jamais de fenêtre : une phrase.
      let fenetres = 0;
      p7.on('dialog', d => { fenetres++; d.dismiss().catch(() => {}); });
      await p7.click('#indDropdownBtn'); await pause(200);
      e = await etat();
      check('« Mon écran » : rien de gardé au départ, bouton non enfoncé (l’affichage d’origine n’est pas le sien)', e.monGarde === null && e.mon === 'false' && e.lien && !e.dit, e);
      // La preuve de la revue du 14/10/2026 (M11) : rien de gardé, l'infobulle ne dit pas « Votre
      // affichage » ; le Guide y porte le nom de sa ligne du panneau.
      const ditAvant = await p7.evaluate(() => document.querySelector('#indMenu .aff-mon-ecran').title);
      check(`« Mon écran », rien de gardé : l’infobulle dit « Affichage proposé : … », le Guide sous le nom de sa ligne (« ${ditAvant} »)`,
        /^Affichage proposé : /.test(ditAvant) && /les repères et la phrase de lecture/.test(ditAvant) && !/Guide/.test(ditAvant), ditAvant);
      await p7.click('#indMenu .aff-mon-ecran'); await pause(300);
      e = await etat();
      check('« Mon écran » sans rien de gardé : RSI et MACD dessous, supports / résistances, Guide et scénarios, sans « Le détail » ; bouton enfoncé, aucun préréglage enfoncé ; rien de gardé sous sa clé',
        meme(e.ov, ['sr']) && meme(e.sg, ['macd', 'rsi']) && meme(e.site, [true, true]) && e.mode === 'debutant' && e.mon === 'true' && meme(e.presse, []) && e.monGarde === null && meme(e.dessines, ['rsi', 'macd']), e);
      // Garder un autre affichage : « La tendance », Guide masqué, avec « Le détail ».
      await p7.click('#indMenu .aff-preset[data-preset="tendance"]'); await pause(250);
      await p7.evaluate(() => { toggleAny('guide'); choisirMode('expert'); }); await pause(300);
      e = await etat();
      check('un autre affichage : « Mon écran » n’est plus enfoncé', e.mon === 'false' && e.lien, e);
      await p7.click('#indMenu .aff-garder'); await pause(250);
      e = await etat();
      const TENDANCE = ['ema20', 'ema200', 'ema50', 'ichimoku'];
      check(`« Garder cet affichage comme mon écran » : gardé sous samsara-mon-ecran-v1 (calques, sous-graphiques, Guide, scénarios, Le détail) ; une phrase le confirme dans le panneau (« ${e.dit} »), sans fenêtre ; bouton enfoncé`,
        e.monGarde && meme(e.monGarde.ov.slice().sort(), TENDANCE) && meme(e.monGarde.sg, []) && e.monGarde.guide === false && e.monGarde.scenarios === true && e.monGarde.detail === true
        && e.dit === 'C’est gardé : « Mon écran » rappellera cet affichage.' && !e.lien && e.ouvert && e.mon === 'true' && !fenetres, { e, fenetres });
      const garde = JSON.stringify(e.monGarde);
      const ditGarde = await p7.evaluate(() => document.querySelector('#indMenu .aff-mon-ecran').title);
      check(`« Mon écran » gardé : l’infobulle dit « Votre affichage : … » (« ${ditGarde} »)`, /^Votre affichage : EMA/.test(ditGarde) && !/Guide|repères/.test(ditGarde), ditGarde);   // revue du 14/10/2026, M11
      // Les préréglages et « Revenir au départ » changent l'affichage, jamais « Mon écran ».
      await p7.click('#indMenu .aff-preset[data-preset="volume"]'); await pause(250);
      e = await etat();
      check('un préréglage après : l’affichage change, « Mon écran » reste gardé tel quel, son bouton relâché, le lien revient', meme(e.sg, ['obv', 'vol']) && JSON.stringify(e.monGarde) === garde && e.mon === 'false' && e.lien && !e.dit, e);
      await p7.click('#indMenu .aff-boutons .aff-btn:not(.aff-tout):not(.aff-mon-ecran)'); await pause(300);
      e = await etat();
      check('« Revenir au départ » : les réglages d’origine, « Mon écran » toujours gardé tel quel', meme(e.ov, []) && meme(e.sg, []) && e.mode === 'debutant' && JSON.stringify(e.monGarde) === garde && e.mon === 'false', e);
      await p7.click('#indMenu .aff-mon-ecran'); await pause(300);
      e = await etat();
      check('« Mon écran » après « Revenir au départ » : l’affichage gardé revient (La tendance, Guide masqué, scénarios, « Le détail »), un seul clic', meme(e.ov, TENDANCE) && meme(e.sg, []) && meme(e.site, [false, true]) && e.mode === 'expert' && e.mon === 'true', e);
      // Rouvert : gardé, et rappelé après « Revenir au départ ».
      await p7.evaluate(() => { revenirAuDepart(); sessionStorage.setItem('__garder', '1'); });
      await p7.reload(); await pause(1800);
      e = await etat();
      check('rouvert après « Revenir au départ » : l’écran de départ (« Mon écran » jamais posé d’office), sa clé gardée', meme(e.ov, []) && meme(e.sg, []) && e.mode === 'debutant' && JSON.stringify(e.monGarde) === garde, e);
      await p7.click('#indDropdownBtn'); await pause(200);
      await p7.click('#indMenu .aff-mon-ecran'); await pause(300);
      e = await etat();
      check('rouvert, « Mon écran » : l’affichage gardé revient, bouton enfoncé ; à la réouverture du panneau, le lien (pas la phrase)', meme(e.ov, TENDANCE) && meme(e.site, [false, true]) && e.mode === 'expert' && e.mon === 'true' && e.lien && !e.dit, e);
      await p7.evaluate(() => { sessionStorage.setItem('__garder', '1'); });
      await p7.reload(); await pause(1800);
      await p7.click('#indDropdownBtn'); await pause(200);
      e = await etat();
      check('rouvert sur « Mon écran » : le bouton est enfoncé', meme(e.ov, TENDANCE) && e.mon === 'true', e);
      await p7.evaluate(() => { document.getElementById('indMenu').classList.remove('open'); revenirAuDepart(); localStorage.removeItem('samsara-mon-ecran-v1'); });
      check('aucune erreur JavaScript', !o7.erreurs.length, o7.erreurs);
      await o7.ctx.close();
    }

    // ─── 8. Le panneau tient dans l'écran ───
    titre('8. « Choisir l’affichage » tient dans l’écran, à 360, 390 et 1440 px, dans les neuf thèmes et les deux modes');
    for (const th of ['aero', 'kala', 'neon', 'codex', 'gare', 'gazette', 'cyanotype', 'diazo', 'bureau95']) {
      const o8 = await ouvrir(nav, th, { width: 1440, height: 900 });
      const fautes = [];
      for (const mode of ['expert', 'debutant']) {
        if (mode === 'debutant') await o8.page.evaluate(() => appliquerMode('debutant'));
        for (const [w, h] of [[360, 740], [390, 844], [1440, 900]]) {
          await o8.page.setViewportSize({ width: w, height: h }); await o8.page.waitForTimeout(150);
          const m = await menu(o8.page, '#indDropdownBtn', 'indMenu');
          if (!dansLEcran(m)) fautes.push(`${mode} ${w} px : hors de l’écran ${JSON.stringify(m)}`);
          if (mode === 'expert') { await o8.page.evaluate(() => { const d = document.getElementById('affFins'); if (d) d.open = true; }); await o8.page.waitForTimeout(80); }
          const r = await o8.page.evaluate(() => {
            const m = document.getElementById('indMenu'), rm = m.getBoundingClientRect(), b = document.getElementById('indDropdownBtn');
            const vis = el => el && el.getClientRects().length > 0 && getComputedStyle(el).display !== 'none';
            const dehors = [...m.querySelectorAll('label[data-ind], .aff-tete button, .aff-outils button, .aff-fins select, .aff-fins input')].filter(vis)
              .filter(el => { const r = el.getBoundingClientRect(); return r.left < rm.left - 0.5 || r.right > rm.right + 0.5; }).map(el => el.dataset.ind || el.id || el.textContent.trim().slice(0, 20));
            return { large: m.scrollWidth - m.clientWidth, dehors, court: vis(b.querySelector('.aff-court')), long: vis(b.querySelector('.aff-long')), coupe: b.scrollWidth - b.clientWidth, L: innerWidth };
          });
          if (r.large > 1 || r.dehors.length) fautes.push(`${mode} ${w} px : déborde de côté (${r.large} px) ${r.dehors.slice(0, 4).join(', ')}`);
          if (r.coupe > 1 || (w <= 480 ? !r.court || r.long : r.court || !r.long)) fautes.push(`${mode} ${w} px : bouton « ${w <= 480 ? 'Affichage' : 'Choisir l’affichage'} » attendu entier ${JSON.stringify(r)}`);
        }
      }
      check(`${th.padEnd(9)} : panneau entier dans l’écran, sans débord de côté (réglages fins ouverts compris) ; bouton entier, « Affichage » au téléphone`, !fautes.length, fautes.slice(0, 4));
      check(`${th.padEnd(9)} : aucune erreur JavaScript`, !o8.erreurs.length, o8.erreurs);
      await o8.ctx.close();
    }

    // ─── 9. Gestes, menus et clavier (revue du 14/10 : C23, C36, C37) ───
    titre('9. Gestes, menus et clavier : la dernière case au doigt, le menu des thèmes, le doigt après un zoom, le clavier');
    // C23 : au 1er toucher, l'aperçu du bas du panneau grandissait sous le doigt et prenait le clic
    // de la dernière ligne visible : rien ne se cochait. Page neuve à chaque toucher (l'aperçu part de
    // son état de 1re ouverture) ; on vise la case, puis le nom de la ligne.
    for (const th of ['bureau95', 'gazette', 'diazo', 'codex', 'neon']) {
      const res = {};
      for (const vise of ['case', 'nom']) {
        const o9 = await ouvrir(nav, th, { width: 390, height: 844 }, null, true);
        await o9.page.tap('#indDropdownBtn'); await o9.page.waitForTimeout(300);
        const L = await o9.page.evaluate(() => {
          const libres = [...document.querySelectorAll('#indMenu label[data-ind]')].map(l => {
            const i = l.querySelector('input'), r = i.getBoundingClientRect(), n = l.querySelector('.aff-nom').getBoundingClientRect();
            const c = { x: r.x + r.width / 2, y: r.y + r.height / 2 }, t = { x: n.x + 20, y: n.y + n.height / 2 };
            return { k: l.dataset.ind, c, t, libre: !i.disabled && document.elementFromPoint(c.x, c.y) === i && l.contains(document.elementFromPoint(t.x, t.y)) };
          }).filter(l => l.libre);
          return libres[libres.length - 1] || null;
        });
        if (L) {
          const p = vise === 'case' ? L.c : L.t;
          const avant = await o9.page.evaluate(k => document.querySelector(`#indMenu label[data-ind="${k}"] input`).checked, L.k);
          await o9.page.touchscreen.tap(p.x, p.y); await o9.page.waitForTimeout(400);
          const apres = await o9.page.evaluate(k => ({ coche: document.querySelector(`#indMenu label[data-ind="${k}"] input`).checked, apercu: menuApercu, ouvert: document.getElementById('indMenu').classList.contains('open') }), L.k);
          res[vise] = { ligne: L.k, y: Math.round(p.y), bascule: apres.coche !== avant, apercu: apres.apercu, ouvert: apres.ouvert, erreurs: o9.erreurs };
        }
        await o9.ctx.close();
      }
      const ok = v => !!v && v.bascule && v.apercu === v.ligne && v.ouvert && !v.erreurs.length;
      check(`${th.padEnd(9)} · 390 px au doigt : la dernière ligne visible du panneau (« ${res.case && res.case.ligne} ») se coche au 1er toucher, sur sa case comme sur son nom ; l’aperçu la montre ensuite`, ok(res.case) && ok(res.nom), res);
    }
    // C36 : le menu des thèmes reste ouvert après un choix (pour comparer) ; un thème qui change la
    // structure déplace le bouton Thème : le menu se replace contre lui, entier dans l'écran (il
    // flottait au milieu de l'écran, sa dernière ligne dessous).
    for (const [de, vers] of [['bureau95', 'kala'], ['neon', 'bureau95'], ['aero', 'gazette']]) {
      const o9 = await ouvrir(nav, de, { width: 390, height: 844 }, null, true);
      await o9.page.tap('#themeBtn'); await o9.page.waitForTimeout(250);
      await o9.page.tap(`#themeMenu .theme-item[onclick*="'${vers}'"]`); await o9.page.waitForTimeout(400);
      const m = await o9.page.evaluate(() => {
        const m = document.getElementById('themeMenu'), rm = m.getBoundingClientRect(), rb = document.getElementById('themeBtn').getBoundingClientRect();
        return { theme: document.documentElement.dataset.theme, ouvert: m.classList.contains('open'), haut: rm.top, bas: rm.bottom, gauche: rm.left, droite: rm.right,
          boutonHaut: rb.top, boutonBas: rb.bottom, boutonGauche: rb.left, boutonDroite: rb.right, H: innerHeight, L: innerWidth };
      });
      const contre = (m.haut >= m.boutonBas - 0.5 && m.haut - m.boutonBas <= 9) || (m.bas <= m.boutonHaut + 0.5 && m.boutonHaut - m.bas <= 9);
      const enFace = m.gauche <= m.boutonDroite && m.droite >= m.boutonGauche;
      check(`${de} → ${vers} · 390 px au doigt : le menu des thèmes reste ouvert, entier dans l’écran, contre le bouton Thème qui a changé de place`, m.theme === vers && dansLEcran(m) && contre && enFace, m);
      check(`${de} → ${vers} · aucune erreur JavaScript`, !o9.erreurs.length, o9.erreurs);
      await o9.ctx.close();
    }
    // C36 : après un zoom à deux doigts, lever un doigt figeait le graphique jusqu'au toucher suivant.
    // Événements tactiles de la page (le pilote ne lève pas un seul des deux doigts) ; témoin : le même
    // glisser sous un seul doigt, depuis la même vue.
    {
      const o9 = await ouvrir(nav, BASE, { width: 390, height: 844 }, null, true);
      const z = await o9.page.evaluate(async () => {
        const c = canvas, b = c.getBoundingClientRect(), y = b.top + b.height * 0.45, mx = b.left + b.width / 2;
        const T = (id, x) => new Touch({ identifier: id, target: c, clientX: x, clientY: y });
        const ev = (type, touches, changed) => c.dispatchEvent(new TouchEvent(type, { touches, targetTouches: touches, changedTouches: changed, bubbles: true, cancelable: true }));
        const attendre = ms => new Promise(r => setTimeout(r, ms));
        const glisser = async (id, x0) => { let t; for (let i = 1; i <= 10; i++) { t = T(id, x0 + i * 15); ev('touchmove', [t], [t]); await attendre(16); } return t; };
        resetView(); await attendre(50);
        let a = T(0, mx - 40), d = T(1, mx + 40);
        ev('touchstart', [a], [a]); ev('touchstart', [a, d], [d]);
        for (let i = 1; i <= 6; i++) { a = T(0, mx - 40 - i * 8); d = T(1, mx + 40 + i * 8); ev('touchmove', [a, d], [a, d]); await attendre(16); }
        const zoom = [viewStart, viewEnd], depart = 50;
        ev('touchend', [d], [a]);
        const mode = touchMode, x0 = d.clientX;
        d = await glisser(1, x0); await attendre(50);
        const glisse = zoom[0] - viewStart;
        ev('touchend', [], [d]);
        viewStart = zoom[0]; viewEnd = zoom[1]; drawChart(); await attendre(30);
        let t = T(5, x0); ev('touchstart', [t], [t]); t = await glisser(5, x0); await attendre(50);
        const temoin = zoom[0] - viewStart; ev('touchend', [], [t]);
        return { zoomVisible: zoom[1] - zoom[0], depart, mode, glisse, temoin };
      });
      check(`390 px : zoom à deux doigts (${z.depart} → ${z.zoomVisible} bougies), un doigt levé, l’autre glisse de 150 px : le graphique suit (${z.glisse} bougies), comme sous un seul doigt (${z.temoin})`,
        z.zoomVisible < z.depart && z.mode === 'pan' && z.glisse > 0 && z.glisse === z.temoin, z);
      check('… aucune erreur JavaScript', !o9.erreurs.length, o9.erreurs);
      await o9.ctx.close();
    }
    // C37 : au clavier, les intervalles étaient hors d'atteinte ; Échap laissait aria-expanded à
    // « true » ; un texte tapé dans le filtre restait à la réouverture du panneau.
    {
      const o9 = await ouvrir(nav, BASE, { width: 1440, height: 900 });
      const p9 = o9.page;
      const etat = () => p9.evaluate(() => ({ ouvert: document.getElementById('indMenu').classList.contains('open'), aria: document.getElementById('indDropdownBtn').getAttribute('aria-expanded'),
        filtre: (document.getElementById('indFiltre') || {}).value, lignes: document.querySelectorAll('#indMenu label[data-ind]:not([hidden])').length, total: document.querySelectorAll('#indMenu label[data-ind]').length }));
      await p9.click('#indDropdownBtn'); await p9.waitForTimeout(200);
      await p9.keyboard.press('Escape'); await p9.waitForTimeout(100);
      const e1 = await etat();
      check('1440 px, clavier : Échap ferme le panneau, et son bouton le dit fermé (aria-expanded « false »)', !e1.ouvert && e1.aria === 'false', e1);
      await p9.click('#indDropdownBtn'); await p9.waitForTimeout(200);
      await p9.click('#indFiltre'); await p9.keyboard.type('ema'); await p9.waitForTimeout(100);
      const tape = await etat();
      await p9.evaluate(() => document.body.click()); await p9.waitForTimeout(150);   // un clic ailleurs le ferme
      await p9.click('#indDropdownBtn'); await p9.waitForTimeout(200);
      const e2 = await etat();
      check(`… « ema » tapé dans le filtre (${tape.lignes} lignes), panneau fermé puis rouvert : filtre vide, les ${e2.total} lignes`, tape.filtre === 'ema' && tape.lignes < tape.total && e2.ouvert && e2.filtre === '' && e2.lignes === e2.total, { tape, e2 });
      // Le focus clavier sur une ligne du panneau montre toujours son aperçu.
      await p9.focus('#indFiltre'); await p9.keyboard.press('Tab'); await p9.keyboard.press('Tab'); await p9.waitForTimeout(100);
      const f = await p9.evaluate(() => { const l = document.activeElement && document.activeElement.closest('label[data-ind]'); return { ligne: l && l.dataset.ind, apercu: menuApercu }; });
      check(`… au clavier, la ligne atteinte par Tab (« ${f.ligne} ») a son aperçu`, !!f.ligne && f.apercu === f.ligne, f);
      await p9.keyboard.press('Escape'); await p9.waitForTimeout(100);
      await p9.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });
      const INT = ['int_1m', 'int_5m', 'int_15m', 'int_1h', 'int_4h', 'int_1d'], vus = [];
      for (let i = 0; i < 80 && !vus.includes('int_1d'); i++) { await p9.keyboard.press('Tab'); vus.push(await p9.evaluate(() => document.activeElement && document.activeElement.id)); }
      const ordre = vus.filter(v => INT.includes(v));
      check('… Tab passe par les six intervalles, dans l’ordre du ruban', JSON.stringify(ordre) === JSON.stringify(INT), vus);
      const y0 = await p9.evaluate(() => scrollY);
      await p9.focus('#int_1h'); await p9.keyboard.press('Enter'); await p9.waitForTimeout(500);
      const en = await p9.evaluate(() => ({ itv: chartInterval, coches: [...document.querySelectorAll('[id^="int_"]')].filter(l => l.getAttribute('aria-checked') === 'true').map(l => l.id) }));
      await p9.focus('#int_4h'); await p9.keyboard.press(' '); await p9.waitForTimeout(500);
      const es = await p9.evaluate(y0 => ({ itv: chartInterval, coches: [...document.querySelectorAll('[id^="int_"]')].filter(l => l.getAttribute('aria-checked') === 'true').map(l => l.id),
        roles: [...document.querySelectorAll('[id^="int_"]')].every(l => l.getAttribute('role') === 'radio' && l.tabIndex === 0), defile: scrollY - y0 }), y0);
      check('… Entrée choisit « 1 h », Espace « 4 h » sans faire défiler la page ; chaque intervalle est un bouton radio, aria-checked suit le choix',
        en.itv === '1h' && JSON.stringify(en.coches) === '["int_1h"]' && es.itv === '4h' && JSON.stringify(es.coches) === '["int_4h"]' && es.roles && es.defile === 0, { en, es });
      await p9.evaluate(() => changeInterval('15m', document.getElementById('int_15m')));
      check('… aucune erreur JavaScript', !o9.erreurs.length, o9.erreurs);
      await o9.ctx.close();
    }
  } finally { await nav.close(); serveur.close(); }
  console.log(ko ? `\n❌ INTERFACE : ${ko} contrôle(s) en échec` : '\n✅ INTERFACE : TOUS LES CONTRÔLES PASSENT');
  process.exit(ko ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
