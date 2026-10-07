// Les STRUCTURES de thème (js/structures.js), vérifiées dans un vrai navigateur.
//
// Un thème peut changer la structure de la page (décision du 06/10/2026). Le prix à payer : ce
// harnais. Pour chaque thème déclaré, sur bureau ET sur téléphone :
//   1. tout ce qui est VISIBLE dans la structure de base — chaque VALEUR et chaque ÂGE (prix,
//      variation, chiffres clés, âge de la publication, heure, cartes du marché, graphique,
//      boutons d'accès) — l'est encore : présent, non masqué, non recouvert, de taille non nulle ;
//   2. la structure est RÉVERSIBLE : revenir au thème de base rend la page nœud pour nœud ;
//   3. le décor ajouté — tout [data-decor], posé par chantier().decor — est muet (aria-hidden) et
//      n'intercepte pas le pointeur (pointer-events: none), qu'il porte du texte ou non ;
//   4. aucune erreur JavaScript.
//
// Sans Playwright : « non exécuté », dit à l'écran (ce n'est pas un succès).
// USAGE   node tests/test_structures.js
const fs = require('fs'), path = require('path'), http = require('http');
const REPO = path.resolve(__dirname, '..');

let playwright = null;
for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright', process.env.PLAYWRIGHT_MODULE].filter(Boolean)) {
  try { playwright = require(p); break; } catch (e) { /* suivant */ }
}
if (!playwright) {
  console.log('  − NON EXÉCUTÉ : Playwright introuvable — les structures de thème ne sont pas vérifiées sur ce poste.');
  process.exit(0);
}
let ko = 0;
const check = (nom, ok, det) => { if (!ok) ko++; console.log(`  ${ok ? '✓' : '✗'} ${nom}${!ok && det !== undefined ? ' — ' + JSON.stringify(det).slice(0, 400) : ''}`); };
const titre = t => console.log(`\n── ${t} ──`);

const index = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8');
const THEMES = [...index.matchAll(/<link\b[^>]*data-theme-id="([^"]+)"[^>]*>/g)].map(m => ({ id: m[1], structure: (m[0].match(/data-structure="([^"]+)"/) || [])[1] || null }));
const BASE = THEMES[0].id;

// Ce qui doit rester visible : valeurs, âges, accès. `tous` : chaque élément trouvé compte.
const CIBLES = [
  ['prix', '#price'], ['variation 24 h', '#var24'], ['heure de publication', '#updated'],
  ['chiffres clés', '#cycle .kpi:not([hidden])', 'tous'], ['âge des chiffres clés', '#cycle .kpi-age'],
  ['graphique', '#chart'], ['ruban d’outils', '#indicatorBar'],
  ['cartes du marché', '#feed .demon-card', 'tous'], ['bandeau d’âge du marché', '#feed .age-banner', 'tous'],
  ['bouton thème', '#themeBtn'], ['bouton ⚡', '#liveBtn'], ['bouton mode', '#modeBtn'], ['bouton réglages', '#reglagesBtn'],
  ['bouton légendes', '#legendesBtn'], ['lien carte', '#carteBtn'], ['horloge', '#taskbarClock'],
  // Horloges (js/horloges.js) et Contre-expertise (js/contre-expertise.js) : leurs âges aussi.
  ['carte Horloges', '#feed .carte-horloges'], ['âges des horloges', '#feed .carte-horloges .h-age', 'tous'],
  ['carte Contre-expertise', '#feed .carte-contre'], ['âge de la contre-expertise', '#feed .carte-contre .age-banner'],
  // Chronique (js/chronique.js) : la trace de chaque chiffre clé affiché.
  ['traces des chiffres clés', '#cycle .kpi:not([hidden]):not(.sans-trace) .chron-spark', 'tous'],
];
/** Les âges écrits sur le CALQUE du graphique (couche « Liquidité », repère de la publication) :
 *  du texte de canvas, que la visibilité ne voit pas — on relève ce que le calque écrit. */
async function agesDuCalque(page) {
  return page.evaluate(async () => {
    overlays.liq = true;
    await fetchHeatmap(true);
    // La publication servie est ancienne : on la date dans la vue pour que son repère y tombe.
    marketData = Object.assign({}, marketData, { updated: new Date(candles[Math.max(0, viewEnd - 5)].time * 1000).toISOString() });
    drawChart();
    const vus = [], f = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (t) { if (this.canvas.id === 'chartCalque') vus.push(String(t)); return f.apply(this, arguments); };
    dessinerCalque();
    CanvasRenderingContext2D.prototype.fillText = f;
    return { couche: vus.some(t => /^Carte publiée · dernière colonne .+ · publiée .+/.test(t)), repere: vus.some(t => /^fichier \d\d:\d\d UTC · prix publié .+ \((il y a .+|< 5 s)\)$/.test(t)), vus };
  });
}

function binance(url) {
  const u = new URL(url), q = u.searchParams, now = Date.now();
  if (u.pathname.endsWith('/klines')) {
    const pas = { '1m': 6e4, '5m': 3e5, '15m': 9e5, '1h': 36e5, '4h': 144e5, '1d': 864e5, '1w': 6048e5 }[q.get('interval')] || 9e5;
    const n = Math.min(1000, +q.get('limit') || 500), fin = q.get('endTime') ? Math.min(+q.get('endTime'), now) : now;
    return Array.from({ length: n }, (_, i) => { const t = Math.floor((fin - (n - 1 - i) * pas) / pas) * pas, c = 86000 + Math.sin(i / 7) * 300;
      return [t, String(c - 20), String(c + 60), String(c - 60), String(c), '80', t + pas - 1, String(80 * c), 50, '40', String(40 * c), '0']; });
  }
  if (u.pathname.endsWith('/ticker/price')) return { price: '86012.5' };
  if (u.pathname.endsWith('/time')) return { serverTime: now };
  if (u.pathname.endsWith('/ticker/24hr')) return { lastPrice: '86012.5', priceChangePercent: '0.4', highPrice: '87000', lowPrice: '85000', bidPrice: '86012.4', askPrice: '86012.6', quoteVolume: '1e9', count: '100' };
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
  const ctx = await nav.newContext({ viewport: vue });
  const page = await ctx.newPage();
  const erreurs = [];
  page.on('pageerror', e => erreurs.push(e.message));
  await page.route('**/*', r => {
    const u = r.request().url(), h = new URL(u).host, cors = { 'access-control-allow-origin': '*' };
    if (h.startsWith('127.0.0.1')) return r.continue();
    if (h === 'api.binance.com') return r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(binance(u)) });
    // Historique (js/chronique.js) : la publication d'il y a N commits, datée 7,5 × N min plus tôt
    // (une publication sur deux commits) — de quoi tracer les chiffres clés.
    const anc = u.match(/\/master~(\d+)\/market-data\.json/);
    if (anc) {
      const md = JSON.parse(fs.readFileSync(path.join(REPO, 'market-data.json'), 'utf8'));
      md.updated = new Date(Date.parse(md.updated) - anc[1] * 7.5 * 60000).toISOString();
      if (md.micro) md.micro.cvd_24h_usd = (md.micro.cvd_24h_usd || 0) + Math.sin(+anc[1]) * 1e6;
      return r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(md) });
    }
    if (h === 'raw.githubusercontent.com') return r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: fs.readFileSync(path.join(REPO, u.includes('heatmap') ? 'heatmap.json' : 'market-data.json')) });
    return r.abort();
  });
  await page.addInitScript(t => { try { localStorage.clear(); localStorage.setItem('samsara-theme', t); } catch (e) { /* */ } }, theme);
  await page.goto(`http://127.0.0.1:${serveur.address().port}/index.html`);
  await page.waitForTimeout(2200);
  await page.keyboard.press('f');            // bureau : panneau ouvert ; téléphone : la fenêtre du marché
  await page.waitForTimeout(900);
  return { ctx, page, erreurs };
}

/** Pour chaque cible : combien d'éléments existent, combien sont réellement visibles. */
async function visibles(page) {
  return page.evaluate(CIBLES => {
    // Visible = une partie de l'élément, dans l'intersection de l'écran et de TOUS ses
    // conteneurs à défilement, n'est recouverte par rien. Un élément plus haut que son
    // conteneur (la carte Microstructure dépasse le panneau) se juge sur sa partie visible —
    // sonder son centre, hors du panneau, le déclarait à tort « caché » (06/10/2026).
    const vu = el => {
      if (!el) return false;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) < 0.1) return false;
      el.scrollIntoView({ block: 'start', inline: 'nearest' });
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return false;
      let g = Math.max(0, r.left), h = Math.max(0, r.top), d = Math.min(window.innerWidth, r.right), b = Math.min(window.innerHeight, r.bottom);
      for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
        const ca = getComputedStyle(a);
        if (ca.overflowX === 'visible' && ca.overflowY === 'visible') continue;
        const ra = a.getBoundingClientRect();
        g = Math.max(g, ra.left); h = Math.max(h, ra.top); d = Math.min(d, ra.right); b = Math.min(b, ra.bottom);
      }
      if (d - g < 2 || b - h < 2) return false;
      const x = (g + d) / 2, y = h + Math.min((b - h) / 2, 12);
      const dessus = document.elementFromPoint(x, y);
      return !!dessus && (dessus === el || el.contains(dessus) || dessus.contains(el));
    };
    const out = {};
    for (const [nom, sel, tous] of CIBLES) {
      // Sur téléphone, le marché s'ouvre dans une fenêtre : on y cherche aussi.
      const els = [...document.querySelectorAll(sel)].concat(sel.startsWith('#feed') ? [...document.querySelectorAll(sel.replace('#feed', '#marketModalBody'))] : []);
      const v = els.filter(vu);
      out[nom] = { trouves: els.length, visibles: v.length, tous: !!tous };
    }
    return out;
  }, CIBLES);
}

async function squelette(page) {
  return page.evaluate(() => {
    const sig = el => el.tagName + (el.id ? '#' + el.id : '') + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).filter(c => !/^(on|open|active|collapsed|entree|deborde|ping|calme|vieux|price-up|price-down|pos|neg)$/.test(c)).sort().join('.') : '');
    const parcours = (el, d) => d > 4 ? [] : [sig(el)].concat(...[...el.children].filter(c => !['SCRIPT', 'svg'].includes(c.tagName) && !c.closest('#feed,#marketModalBody,#liveModalBody,#indMenu,#themeMenu,#stratStats,#stratParams,#stratHelp,#cycle,#fichePop,#reglagesPop'))
      .map(c => parcours(c, d + 1).map(s => '  '.repeat(d + 1) + s)));
    return parcours(document.body, 0).join('\n');
  });
}

(async () => {
  await new Promise(r => serveur.listen(0, '127.0.0.1', r));
  const nav = await playwright.chromium.launch();
  try {
    for (const [nomVue, vue] of [['bureau', { width: 1440, height: 900 }], ['téléphone', { width: 390, height: 800 }]]) {
      titre(`1. Valeurs et âges visibles — ${nomVue} (${vue.width} × ${vue.height})`);
      const base = await ouvrir(nav, BASE, vue);
      const ref = await visibles(base.page);
      // Sans quoi la comparaison ne prouverait rien : la base les montre, elle.
      const neuves = ['carte Horloges', 'âges des horloges', 'carte Contre-expertise', 'âge de la contre-expertise'];
      check(`${BASE} montre les horloges et la contre-expertise (${neuves.map(n => ref[n].visibles).join(' / ')})`, neuves.every(n => ref[n].visibles > 0), neuves.map(n => ref[n]));
      // Le téléphone n'a pas de bande de chiffres clés (CSS) : les traces se jugent sur bureau.
      await base.ctx.close();
      for (const t of THEMES) {
        const o = await ouvrir(nav, t.id, vue);
        const v = await visibles(o.page);
        const pertes = Object.entries(ref).filter(([nom, r]) => r.visibles > 0 && (v[nom].visibles === 0 || (r.tous && v[nom].visibles < Math.min(r.visibles, v[nom].trouves))))
          .map(([nom, r]) => `${nom} : ${v[nom].visibles}/${v[nom].trouves} visibles (base : ${r.visibles})`);
        const st = await o.page.evaluate(() => document.documentElement.getAttribute('data-structure'));
        check(`${t.id.padEnd(9)} ${t.structure ? '(structure « ' + t.structure + ' ») ' : ''}: rien de ce que la base montre ne disparaît`
          + (t.structure ? '' : ''), !pertes.length && (st || null) === t.structure, { pertes, structure: st });
        // Chronique : les traces passent APRÈS les valeurs (ajusterKpis) — autant de chiffres
        // clés qu'en les retirant toutes ; et la bande d'une structure (HUD, Codex) les montre.
        if (vue.width > 768) {
          const sans = await o.page.evaluate(() => { const s = document.createElement('style');
            s.textContent = '#cycle .chron-spark{display:none!important}'; document.head.appendChild(s); ajusterKpis();
            const n = document.querySelectorAll('#cycle .kpi:not([hidden])').length; s.remove(); ajusterKpis(); return n; });
          const tr = v['traces des chiffres clés'].visibles, kp = v['chiffres clés'].visibles;
          check(`${t.id.padEnd(9)} : ${tr} trace(s) sur ${kp} chiffres clés, aucun masqué pour elles (${sans} sans traces)`
            + (t.structure ? ', la bande de la structure les montre' : ''), kp === sans && (!t.structure || tr > 0), { tr, kp, sans });
        }
        // La courbe des dernières heures dans une fiche (trous hachurés) : visible, dans l'écran.
        const fc = await o.page.evaluate(() => { ouvrirFiche('cvd'); const g = document.querySelector('#fichePop .chron-fiche');
          const r = g && g.getBoundingClientRect(), x = r && document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          const ok = !!r && r.width > 100 && r.height >= 40 && r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight && !!x && g.contains(x);
          fermerFiche(); return { ok, r: r && [r.left, r.top, r.width, r.height].map(Math.round) }; });
        check(`${t.id.padEnd(9)} : la fiche porte la courbe des dernières heures, visible`, fc.ok, fc);
        const cal = await agesDuCalque(o.page);
        check(`${t.id.padEnd(9)} : le calque porte l’âge de la couche et le repère de la publication`, cal.couche && cal.repere, cal.vus);
        check(`${t.id.padEnd(9)} : aucune erreur JavaScript`, !o.erreurs.length, o.erreurs);
        await o.ctx.close();
      }
    }

    titre('2. Réversibilité : quitter un thème rend la page nœud pour nœud');
    const o = await ouvrir(nav, BASE, { width: 1440, height: 900 });
    const avant = await squelette(o.page);
    for (const t of THEMES.filter(x => x.structure)) {
      await o.page.evaluate(id => appliquerTheme(id), t.id);
      await o.page.waitForTimeout(300);
      const pendant = await squelette(o.page);
      check(`${t.id} : la structure change vraiment la page`, pendant !== avant);
      // Tout décor, quel que soit le préfixe de classe du thème : chantier().decor le marque
      // data-decor. Muet (aria-hidden) ; inerte au pointeur — exigé en premier lieu du décor qui
      // porte du TEXTE (titres, étiquettes posés près d'une vraie valeur ou d'un vrai bouton),
      // et de tout le reste. Il ne contient aucun vrai nœud (un conteneur n'est pas un décor).
      const decor = await o.page.evaluate(() => {
        const els = [...document.querySelectorAll('[data-decor]')];
        return { n: els.length, texte: els.filter(e => e.textContent.trim()).length,
          fautifs: els.filter(e => e.getAttribute('aria-hidden') !== 'true' || getComputedStyle(e).pointerEvents !== 'none' || e.querySelector('[id]'))
            .map(e => (e.textContent.trim() ? 'texte « ' + e.textContent.trim().slice(0, 20) + ' » ' : '') + e.className + ' aria-hidden=' + e.getAttribute('aria-hidden') + ' pointer-events=' + getComputedStyle(e).pointerEvents) };
      });
      check(`${t.id} : ${decor.n} élément(s) de décor [data-decor] (dont ${decor.texte} à texte), muets (aria-hidden) et inertes (pointer-events: none)`,
        decor.n > 0 && !decor.fautifs.length, decor);
      await o.page.evaluate(id => appliquerTheme(id), BASE);
      await o.page.waitForTimeout(300);
      const apres = await squelette(o.page);
      check(`${t.id} → ${BASE} : page identique à l'origine`, apres === avant, { avant: avant.length, apres: apres.length });
    }
    check('aucune erreur JavaScript pendant les bascules', !o.erreurs.length, o.erreurs);
    await o.ctx.close();
  } finally { await nav.close(); serveur.close(); }
  console.log(ko ? `\n❌ STRUCTURES : ${ko} contrôle(s) en échec` : '\n✅ STRUCTURES : TOUS LES CONTRÔLES PASSENT');
  process.exit(ko ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
