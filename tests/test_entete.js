// En-tête, ruban et barre des tâches dans un vrai navigateur (Chromium, Playwright) : ce qui se
// lit SANS ouvrir de panneau.
//
//   1. PUBLICATION EN RETARD, panneau fermé, dans les deux modes : la pastille ambre dit « en
//      retard » et l'âge (« en retard · 25 min »), visible et entière à 1440, 1024, 412, 390 et
//      360 px ; le prix reste entier, rien ne déborde, l'en-tête tient en deux rangées au
//      téléphone. Les minutes avancent sans nouvelle publication (25 → 27). Publication fraîche :
//      pas de « en retard » (la pastille du Débutant redit « Infos du marché »).
//   2. UN SEUIL, l'âge ARRONDI : à 20 min 10 s, « 20 min » partout et aucun retard ; à 20 min
//      45 s, « 21 min » et « en retard » partout (voyant, pastille, bandeau des cartes).
//   3. VOYANT avant la première lecture : neutre (pas vert), et il dit ce qu'il attend.
//   4. NOMS : la barre des tâches dit la paire comme l'en-tête (« SOL/USDT », pas « SOLUSDT ») ;
//      boutons « Infos du marché (I) » et « En direct (à la seconde) ».
//   5. LA MÊME VARIATION 24 h dans l'en-tête et dans le panneau ⚡ (ouverture → dernier prix).
//   6. L'HEURE de l'appareil, le fuseau dit une fois (titre de l'horloge) ; aucun « UTC » dans
//      l'en-tête ; l'heure de publication écrite à l'heure de l'appareil.
//   7. « Choisir l'affichage » à l'écran en Complet, ruban plein (« Tout afficher » : sa légende
//      au plus long) : à 1440 px, dans le ruban et l'écran ; à 1024 px (le ruban défile), épinglé
//      au bord droit, ruban défilé au début comme à la fin ; à 390 px, en tête.
//   8. RACCOURCIS : une touche tapée dans un champ (ou un texte éditable), ou avec Ctrl, ne
//      déclenche rien. I les infos du marché ; R et F la vue au présent (les touches de la carte).
//   9. GEX sans couleur hausse / baisse dans les chiffres clés ; cartes : prix publié plus petit
//      que le prix en direct, jauge RSI sans vert ni rouge ; bandeau d'âge qui avance.
//  10. TÉLÉPHONE : la barre du bas ne cache pas la dernière ligne des modales.
//  11. BOUTONS DE L'EN-TÊTE, de 360 à 1440 px, dans neuf thèmes et les deux modes : ni sur le
//      prix, ni hors de l'écran, ni cachés ; « Choisir l'affichage » à l'écran (Planche comprise).
//  12. AU DOIGT (écran tactile, 360 et 390 px, aero et kala, deux modes) : chaque bouton de
//      l'en-tête et chaque intervalle du ruban couvre un carré de 40 × 40 px ; aucune zone sur
//      « Choisir l'affichage » ; le nom d'un bouton-icône dit à l'appui.
//
// Binance simulé (prix 86 012,50, ouverture 85 700 : +0,36 % ; Binance arrondit à +0,365), le
// fichier publié du dépôt avec l'heure de publication réglée par contrôle ; horloge fixée au
// 08/10/2026 22:52 UTC, fuseau de l'appareil Europe/Paris.
// Sans Playwright : « non exécuté », dit à l'écran (ce n'est pas un succès).
// USAGE   node tests/test_entete.js
const fs = require('fs'), path = require('path'), http = require('http');
const REPO = path.resolve(__dirname, '..');

let playwright = null;
for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright', process.env.PLAYWRIGHT_MODULE].filter(Boolean)) {
  try { playwright = require(p); break; } catch (e) { /* suivant */ }
}
if (!playwright) {
  console.log('  − NON EXÉCUTÉ : Playwright introuvable — l’en-tête n’est pas vérifié à l’écran sur ce poste.');
  process.exit(0);
}
let ko = 0;
const check = (nom, ok, det) => { if (!ok) ko++; console.log(`  ${ok ? '✓' : '✗'} ${nom}${!ok && det !== undefined ? ' — ' + JSON.stringify(det).slice(0, 700) : ''}`); };
const titre = t => console.log(`\n── ${t} ──`);

const MAINTENANT = Date.parse('2026-10-08T22:52:00Z'), DECALAGE = MAINTENANT - Date.now();
const maintenant = () => Date.now() + DECALAGE;
const FUSEAU = 'Europe/Paris';
function binance(url) {
  const u = new URL(url), q = u.searchParams, now = maintenant();
  if (u.pathname.endsWith('/klines')) {
    const pas = { '1m': 6e4, '5m': 3e5, '15m': 9e5, '1h': 36e5, '4h': 144e5, '1d': 864e5, '1w': 6048e5 }[q.get('interval')] || 9e5;
    const n = Math.min(1000, +q.get('limit') || 500), fin = q.get('endTime') ? Math.min(+q.get('endTime'), now) : now;
    return Array.from({ length: n }, (_, i) => { const t = Math.floor((fin - (n - 1 - i) * pas) / pas) * pas, k = Math.round(t / pas), c = 86000 + Math.sin(k / 7) * 300, o = c + (k % 2 ? 40 : -40);
      return [t, String(o), String(Math.max(o, c) + 60), String(Math.min(o, c) - 60), String(c), '80', t + pas - 1, String(80 * c), 50, '40', String(40 * c), '0']; });
  }
  if (u.pathname.endsWith('/ticker/24hr')) return { symbol: q.get('symbol'), lastPrice: '86012.5', openPrice: '85700', priceChangePercent: '0.365', highPrice: '87000', lowPrice: '85000', bidPrice: '86012.4', askPrice: '86012.6', quoteVolume: '1e9', count: '100' };
  if (u.pathname.endsWith('/depth')) return { bids: Array.from({ length: 500 }, (_, i) => [String(86012.4 - i * 0.3), '0.5']), asks: Array.from({ length: 500 }, (_, i) => [String(86012.6 + i * 0.3), '0.4']) };
  if (u.pathname.endsWith('/trades')) return Array.from({ length: 500 }, (_, i) => ({ qty: '0.01', isBuyerMaker: i % 3 === 0, time: now - (500 - i) * 100 }));
  if (u.pathname.endsWith('/time')) return { serverTime: now };
  return {};
}
const MD0 = JSON.parse(fs.readFileSync(path.join(REPO, 'market-data.json'), 'utf8'));
/** La publication, vieille de `ageS` secondes à l'ouverture de la page. */
const publication = ageS => {
  const md = JSON.parse(JSON.stringify(MD0));
  md.updated = new Date(maintenant() - ageS * 1000).toISOString().replace(/\.\d{3}Z$/, '+00:00');
  return md;
};

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2' };
const serveur = http.createServer((req, res) => {
  const f = path.join(REPO, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(REPO) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

/** o = { vue, mode ('debutant' | 'expert'), theme, ageS, retenir (la publication n'arrive qu'à la demande) }. */
async function ouvrir(nav, o) {
  const tactile = o.vue.width <= 480;
  const ctx = await nav.newContext(Object.assign({ viewport: o.vue, deviceScaleFactor: 1, timezoneId: FUSEAU }, tactile ? { hasTouch: true, isMobile: true } : {}));
  await ctx.clock.install({ time: maintenant() });
  await ctx.addInitScript(([m, t]) => {
    try { localStorage.clear(); localStorage.setItem('samsara-mode', m); localStorage.setItem('samsara-theme', t); localStorage.setItem('samsara-astuce-tap-v1', '1'); } catch (e) { /* */ }
  }, [o.mode, o.theme || 'aero']);
  const page = await ctx.newPage();
  const erreurs = [], retenues = [];
  page.on('pageerror', e => erreurs.push(e.message));
  const MD = JSON.stringify(publication(o.ageS === undefined ? 120 : o.ageS));
  await page.route('**/*', r => {
    const u = r.request().url(), h = new URL(u).host, cors = { 'access-control-allow-origin': '*' };
    if (h.startsWith('127.0.0.1')) return r.continue();
    if (h === 'api.binance.com') return r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(binance(u)) });
    if (h === 'raw.githubusercontent.com' && /market-data/.test(u)) {
      const servir = () => r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: MD }).catch(() => {});
      if (o.retenir) { retenues.push(servir); return; }
      return servir();
    }
    return r.fulfill({ status: 404, headers: cors, body: '' });
  });
  await page.goto(`http://127.0.0.1:${serveur.address().port}/index.html`);
  if (!o.retenir) await page.waitForFunction(() => typeof marketData !== 'undefined' && marketData && typeof livePrice !== 'undefined' && livePrice, null, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(700);
  return { ctx, page, erreurs, servir: () => { while (retenues.length) retenues.shift()(); } };
}

/** L'en-tête tel qu'il se voit : pastille d'âge, prix, débordements, rangées. */
const lireEntete = page => page.evaluate(() => {
  const vis = el => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden' && el.getBoundingClientRect().width > 0;
  const R = el => { const r = el.getBoundingClientRect(); return { l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom) }; };
  const cy = document.getElementById('cycle'), hd = document.querySelector('.header');
  const age = cy.querySelector('.kpi-age'), deb = cy.querySelector('.kpi-deb');
  const retard = deb && deb.querySelector('.deb-retard'), frais = deb && deb.querySelector('.deb-frais');
  const pastille = document.documentElement.dataset.mode === 'debutant' ? deb : age;
  const prix = document.getElementById('price');
  // La teinte ambre de la pastille : celle de --warn-soft (Expert) / le fond de la pastille Débutant en retard.
  const sonde = document.createElement('span'); sonde.style.background = 'var(--warn-soft)'; cy.appendChild(sonde);
  const ambre = getComputedStyle(sonde).backgroundColor;
  const teinte = v => { sonde.style.background = v; return getComputedStyle(sonde).backgroundColor; };
  const dotFond = getComputedStyle(document.getElementById('dot')).backgroundColor;
  const dotEtat = dotFond === teinte('var(--up)') ? 'ok' : dotFond === teinte('var(--warn)') ? 'retard' : dotFond === teinte('var(--down)') ? 'fige' : dotFond;
  sonde.remove();
  const rp = vis(pastille) ? R(pastille) : null, rprix = R(prix), rc = R(cy);
  // Le texte LU de la pastille : le mot « en retard · » est écrit par le CSS (contenu généré de
  // .age-retard, le texte de la pastille restant l'âge seul) ; innerText ne le voit pas.
  const genere = el => { if (!vis(el)) return ''; const c = getComputedStyle(el, '::before').content; return c && c !== 'none' && c !== 'normal' ? c.replace(/^"|"$/g, '') : ''; };
  const lu = el => (el === age ? genere(age.querySelector('.age-retard')) : '') + el.innerText.replace(/\s+/g, ' ').trim();
  // Rangées de l'en-tête : les sommets distincts (à 12 px près) des éléments visibles.
  const tops = [...document.querySelectorAll('.header-left > *, .header-right > *, #cycle > .kpi-age, #cycle > .kpi-deb')].filter(vis).map(e => e.getBoundingClientRect().top).sort((a, b) => a - b);
  const rangees = tops.reduce((n, t, i) => n + (i === 0 || t - tops[i - 1] > 12 ? 1 : 0), 0);
  return {
    mode: document.documentElement.dataset.mode, vieux: cy.classList.contains('vieux'),
    pastille: rp && { texte: lu(pastille), r: rp, fond: getComputedStyle(pastille).backgroundColor, dedans: rp.l >= Math.min(rc.l, 0) && rp.r <= innerWidth && pastille.scrollWidth <= pastille.clientWidth + 1
      && (getComputedStyle(cy).overflow === 'visible' || (rp.l >= rc.l - 1 && rp.r <= rc.r + 1)) },
    ambre, retardVu: !!retard && vis(retard), fraisVu: !!frais && vis(frais), fraisTexte: frais ? frais.innerText.trim() : null,
    ageRetardVu: !!age && vis(age.querySelector('.age-retard')),
    prix: prix.textContent, prixEntier: vis(prix) && rprix.l >= 0 && rprix.r <= innerWidth && prix.scrollWidth <= prix.clientWidth + 1,
    chevauche: !!rp && !(rp.r <= rprix.l || rp.l >= rprix.r || rp.b <= rprix.t || rp.t >= rprix.b),
    page: [document.documentElement.scrollWidth, innerWidth], tete: [hd.scrollWidth, hd.clientWidth], rangees,
    panneauFerme: innerWidth <= 768 ? getComputedStyle(document.getElementById('marketModal')).display === 'none' : !feedVisible,
    dot: document.getElementById('dot').title, dotEtat, banniere: (document.querySelector('#feed .age-banner:not(.verif)') || {}).textContent || '',
  };
});

(async () => {
  await new Promise(r => serveur.listen(0, '127.0.0.1', r));
  const nav = await playwright.chromium.launch();
  try {
    // ── 1. En retard, panneau fermé ─────────────────────────────────────────────
    titre('1. Publication en retard (25 min) : dite dans l’en-tête, panneau fermé, dans les deux modes');
    for (const mode of ['debutant', 'expert']) {
      for (const w of [1440, 1024, 412, 390, 360]) {
        const o = await ouvrir(nav, { vue: { width: w, height: w <= 480 ? 844 : 900 }, mode, ageS: 25 * 60 });
        const e = await lireEntete(o.page);
        const nom = `${mode} · ${w}`;
        check(`${nom} : panneau fermé, la pastille dit « en retard · 25 min » (« ${e.pastille && e.pastille.texte} »), entière, en ambre`,
          e.panneauFerme && e.vieux && e.pastille && /en retard · 25 min/.test(e.pastille.texte) && e.pastille.dedans && e.pastille.fond === e.ambre
          && (mode === 'debutant' ? e.retardVu && !e.fraisVu : e.ageRetardVu), e);
        check(`${nom} : le prix entier (« ${e.prix} »), sans chevauchement ; ni la page ni l’en-tête ne débordent ; ${e.rangees} rangée(s) d’en-tête`,
          e.prixEntier && !e.chevauche && e.page[0] <= e.page[1] && e.tete[0] <= e.tete[1] + 1 && e.rangees <= 2, e);
        if (w === 1440 || w === 390) {
          // Les minutes avancent sans nouvelle publication (relue chaque minute, inchangée).
          await o.page.clock.runFor(2 * 60000 + 1000);
          await o.page.waitForTimeout(400);
          const e2 = await lireEntete(o.page);
          // Le bandeau d'âge des cartes avance aussi (il restait figé sur son premier chiffre).
          check(`${nom} : 2 min plus tard, « ${e2.pastille && e2.pastille.texte} » (l’âge avance, toujours « en retard ») ; le bandeau des cartes aussi (27 min)`,
            e2.pastille && /en retard · 27 min/.test(e2.pastille.texte) && e2.vieux && /27 min/.test(e2.banniere) && !/25 min/.test(e2.banniere), [e2.pastille, e2.banniere]);
        }
        check(`${nom} : aucune erreur de script`, !o.erreurs.length, o.erreurs);
        await o.ctx.close();
      }
    }
    for (const mode of ['debutant', 'expert']) {
      for (const w of [1440, 390]) {
        const o = await ouvrir(nav, { vue: { width: w, height: w <= 480 ? 844 : 900 }, mode, ageS: 2 * 60 });
        const e = await lireEntete(o.page);
        check(`${mode} · ${w} · publication fraîche (2 min) : aucun « en retard »` + (mode === 'debutant' ? ` ; la pastille dit « ${e.fraisTexte} »` : ''),
          !e.vieux && !e.retardVu && !e.ageRetardVu && (mode === 'expert' || (e.fraisVu && /^Infos du marché/.test(e.fraisTexte))), e);
        await o.ctx.close();
      }
    }

    // ── 2. Un seuil, l'âge arrondi ─────────────────────────────────────────────
    titre('2. Le seuil « en retard » se juge sur l’âge ARRONDI, celui qui s’écrit : tout le monde dit la même chose');
    for (const [ageS, n, retard] of [[20 * 60 + 10, 20, false], [20 * 60 + 45, 21, true]]) {
      const o = await ouvrir(nav, { vue: { width: 1440, height: 900 }, mode: 'expert', ageS });
      const e = await lireEntete(o.page);
      const vu = e.pastille && e.pastille.texte;
      check(`${Math.floor(ageS / 60)} min ${ageS % 60} s : pastille « ${vu} », voyant ${e.dotEtat} « ${e.dot.slice(0, 60)}… » — ${n} min et ${retard ? '« en retard » partout (voyant ambre)' : 'aucun retard (voyant vert)'}`,
        vu === (retard ? 'en retard · ' : '') + n + ' min' && e.vieux === retard && e.dotEtat === (retard ? 'retard' : 'ok')
        && e.dot.includes('il y a ' + n + ' min') && /en retard/.test(e.dot) === retard
        && (retard ? e.banniere.includes('il y a ' + n + ' min') : e.banniere === ''), e);
      await o.ctx.close();
    }

    // ── 3. Voyant avant la première lecture ────────────────────────────────────
    titre('3. Le voyant avant la première lecture : neutre, et il dit ce qu’il attend');
    {
      const o = await ouvrir(nav, { vue: { width: 1440, height: 900 }, mode: 'expert', retenir: true });
      const avant = await o.page.evaluate(() => {
        const d = document.getElementById('dot'), td = document.getElementById('taskbarDot');
        const sonde = document.createElement('span'); document.body.appendChild(sonde);
        const c = v => { sonde.style.background = v; return getComputedStyle(sonde).backgroundColor; };
        const r = { titre: d.title, tache: td.title, fond: getComputedStyle(d).backgroundColor, neutre: c('var(--ink-3)'), vert: c('var(--up)'), donnees: !!marketData };
        sonde.remove(); return r;
      });
      check(`avant la publication : « ${avant.titre} », gris (pas vert) ; barre des tâches de même`, !avant.donnees && avant.titre === 'Infos du marché : en attente de la première lecture'
        && avant.tache === avant.titre && avant.fond === avant.neutre && avant.fond !== avant.vert, avant);
      o.servir();
      await o.page.waitForFunction(() => !!marketData, null, { timeout: 10000 }).catch(() => {});
      await o.page.waitForTimeout(300);
      const apres = await o.page.evaluate(() => document.getElementById('dot').title);
      check(`après : « ${apres.slice(0, 70)}… » (l’âge des infos du marché, pas « temps réel »)`, /^Infos du marché publiées il y a \d+ min/.test(apres) && !/temps réel/i.test(apres), apres);
      await o.ctx.close();
    }

    // ── 4 à 9 : une page Expert à 1440 ─────────────────────────────────────────
    titre('4. Noms, variation 24 h, heure, raccourcis, GEX (Expert, 1440 px)');
    {
      const o = await ouvrir(nav, { vue: { width: 1440, height: 900 }, mode: 'expert', ageS: 5 * 60 });
      const p = o.page;
      const noms = await p.evaluate(() => ({ feed: document.getElementById('feedBtn').title, live: document.getElementById('liveBtn').title, tache: document.getElementById('taskbarPair').textContent }));
      await p.evaluate(() => changeSymbol('SOLUSDT', document.getElementById('sym_SOLUSDT')));
      await p.waitForTimeout(800);
      const sol = await p.evaluate(() => ({ tache: document.getElementById('taskbarPair').textContent, tete: (document.getElementById('paireNom') || {}).textContent }));
      check(`barre des tâches : « ${noms.tache} » puis « ${sol.tache} », comme l’en-tête (« ${sol.tete} »)`, noms.tache === 'BTC/USDT' && sol.tache === 'SOL/USDT' && sol.tete === 'SOL/USDT', sol);
      check(`boutons : « ${noms.feed} » ; « ${noms.live.slice(0, 40)}… »`, noms.feed === 'Infos du marché (I)' && /^En direct \(à la seconde\)/.test(noms.live), noms);
      await p.evaluate(() => changeSymbol('BTCUSDT', document.getElementById('sym_BTCUSDT')));
      await p.waitForTimeout(800);

      // Heure : celle de l'appareil ; le fuseau, une fois, dans le titre de l'horloge.
      const h = await p.evaluate(() => ({ maj: document.getElementById('updated').textContent, majTitre: document.getElementById('updated').title,
        tete: document.querySelector('.header').innerText, horloge: document.getElementById('taskbarClock').title, upd: marketData.updated }));
      const attendue = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: FUSEAU }).format(new Date(h.upd));
      check(`heure de publication « ${h.maj} » = ${attendue} à l’heure de l’appareil (${FUSEAU}) ; aucun « UTC » dans l’en-tête`, h.maj === attendue && !/UTC/.test(h.tete + h.majTitre), h);
      check(`le fuseau dit une fois, dans le titre de l’horloge : « ${h.horloge} »`, h.horloge === 'heure de l’appareil (UTC+2)', h.horloge);

      // La variation 24 h : la même dans l'en-tête et dans le panneau ⚡.
      await p.evaluate(() => document.getElementById('liveBtn').click());
      await p.waitForFunction(() => /en 24 h/.test((document.getElementById('liveModalBody') || {}).textContent || ''), null, { timeout: 10000 }).catch(() => {});
      const v = await p.evaluate(() => ({ tete: document.getElementById('var24').textContent, live: (document.getElementById('liveModalBody').textContent.match(/[+−]?\d+,\d\d % en 24 h/) || [])[0] }));
      check(`variation 24 h : en-tête « ${v.tete} », panneau ⚡ « ${v.live} » — la même (ouverture → dernier prix)`, v.tete === '+0,36 %' && v.live === v.tete + ' en 24 h', v);
      await p.evaluate(() => { const m = document.getElementById('liveModal'); if (typeof closeLiveModal === 'function') closeLiveModal(); else m.style.display = 'none'; });

      // Raccourcis : rien depuis un champ ni un texte éditable, rien avec Ctrl ; la touche seule, oui.
      // Les infos du marché sont sur I (F suit le présent, comme sur la carte).
      await p.evaluate(() => { const i = document.createElement('input'); i.id = '__champ'; document.body.appendChild(i); i.focus(); });
      await p.keyboard.press('i');
      const dansChamp = await p.evaluate(() => feedVisible);
      await p.evaluate(() => { document.getElementById('__champ').blur(); const d = document.createElement('div'); d.id = '__edit'; d.contentEditable = 'true'; d.textContent = 'note'; document.body.appendChild(d); d.focus(); });
      await p.keyboard.press('i');
      const dansEdit = await p.evaluate(() => feedVisible);
      await p.evaluate(() => { document.getElementById('__edit').blur(); document.body.focus(); });
      await p.keyboard.press('Control+i');
      const avecCtrl = await p.evaluate(() => feedVisible);
      await p.keyboard.press('i');
      const seule = await p.evaluate(() => feedVisible);
      check(`raccourci « I » : tapé dans un champ, rien (${dansChamp}) ; dans un texte éditable, rien (${dansEdit}) ; Ctrl+I, rien (${avecCtrl}) ; seul, le panneau s’ouvre (${seule})`, !dansChamp && !dansEdit && !avecCtrl && seule);
      await p.keyboard.press('i'); await p.waitForTimeout(450);
      // R et F : la vue revient au présent (dernière bougie à droite, zoom de départ) ; jamais depuis un
      // champ, jamais avec Ctrl ; F n'ouvre plus les infos du marché.
      const recule = () => p.evaluate(() => { const n = viewEnd - viewStart; viewEnd = Math.max(n, candles.length - 60); viewStart = viewEnd - n; drawChart(); return viewEnd === candles.length; });
      const auPresent = () => p.evaluate(() => viewEnd === candles.length);
      for (const k of ['r', 'f']) {
        const r0 = await recule();
        await p.evaluate(() => { document.getElementById('__champ').focus(); });
        await p.keyboard.press(k);
        const champ = await auPresent();
        await p.evaluate(() => { document.getElementById('__champ').blur(); document.body.focus(); });
        await p.keyboard.press(k === 'r' ? 'Alt+r' : 'Control+f');   // Ctrl+R recharge : Alt pour R
        const mod = await auPresent();
        const feed0 = await p.evaluate(() => feedVisible);
        await p.keyboard.press(k); await p.waitForTimeout(150);
        const seul = await auPresent(), feed1 = await p.evaluate(() => feedVisible);
        check(`raccourci « ${k.toUpperCase()} » : dans un champ, rien ; avec ${k === 'r' ? 'Alt' : 'Ctrl'}, rien ; seul, la vue revient au présent ; les infos du marché ne bougent pas`, !r0 && !champ && !mod && seul && feed0 === feed1, { r0, champ, mod, seul, feed0, feed1 });
      }

      // GEX : aucune teinte hausse / baisse dans les chiffres clés.
      const gex = await p.evaluate(() => { const k = [...document.querySelectorAll('#cycle .kpi')].find(x => /GEX/.test(x.querySelector('i').textContent)); const b = k && k.querySelector('b'); return b && { cls: b.className, texte: b.textContent }; });
      check(`chiffre clé GEX « ${gex && gex.texte} » sans classe de couleur`, gex && gex.cls === '' && /^(long|short) γ$/.test(gex.texte), gex);

      // Cartes : le prix PUBLIÉ plus petit que le prix en direct de l'en-tête ; jauge RSI sans
      // vert sous 30 ni rouge au-dessus de 70 (un RSI bas n'annonce aucun rebond).
      const c = await p.evaluate(() => {
        const fs = el => el && parseFloat(getComputedStyle(el).fontSize);
        const sonde = document.createElement('span'); document.body.appendChild(sonde);
        const t = v => { sonde.style.background = v; return getComputedStyle(sonde).backgroundColor; };
        const bg = s => { const el = document.querySelector(s); return el && getComputedStyle(el).backgroundColor; };
        const r = { publie: fs(document.querySelector('#feed .hero-publie .hero-val')), direct: fs(document.getElementById('price')),
          bas: bg('#feed .rsi-zone.bas'), haut: bg('#feed .rsi-zone.haut'), vert: t('var(--up-soft)'), rouge: t('var(--down-soft)'),
          pointFroid: (() => { const m = document.createElement('div'); m.className = 'rsi-meter froid'; m.innerHTML = '<span class="rsi-dot"></span>'; document.body.appendChild(m); const v = getComputedStyle(m.firstChild).backgroundColor; m.remove(); return v; })(), up: t('var(--up)') };
        sonde.remove(); return r;
      });
      check(`prix publié des cartes (${c.publie} px) plus petit que le prix en direct de l’en-tête (${c.direct} px)`, c.publie > 0 && c.direct > 0 && c.publie < c.direct, c);
      check('jauge RSI : zones sous 30 et au-dessus de 70 de la même teinte, ni verte ni rouge ; point sous 30 pas vert', c.bas && c.bas === c.haut && c.bas !== c.vert && c.bas !== c.rouge && c.pointFroid !== c.up, c);
      check('aucune erreur de script', !o.erreurs.length, o.erreurs);
      await o.ctx.close();
    }

    // ── 7. « Choisir l'affichage » toujours à l'écran ─────────────────────────
    titre('5. « Choisir l’affichage » à l’écran en Complet, ruban plein : épinglé au bureau, en tête au téléphone');
    for (const w of [1440, 1024, 390]) {
      const o = await ouvrir(nav, { vue: { width: w, height: w <= 480 ? 844 : 900 }, mode: 'expert' });
      const p = o.page;
      // Ruban plein : tout allumé, la légende du ruban au plus long (ses puces et « + N autres »).
      const legende = await p.evaluate(() => { toutAfficher(); return document.querySelectorAll('#indicatorBar label.puce-calque').length; });
      await p.waitForTimeout(500);
      check(`${w} px : « Tout afficher » remplit la légende du ruban (${legende} puces)`, legende >= 6, legende);
      // Au bureau, il est épinglé au bord droit (ruban défilé au début comme à la fin) ; au
      // téléphone, il est en TÊTE du ruban (avant les intervalles) : visible à l'ouverture. À 1440 px
      // la légende (au plus 7 puces) tient sans défiler ; à 1024 et 390 px, le ruban défile.
      for (const bout of w > 768 ? ['début', 'fin'] : ['début']) {
        const r = await p.evaluate(fin => {
          const bar = document.getElementById('indicatorBar'), btn = document.getElementById('indDropdownBtn');
          bar.scrollLeft = fin ? bar.scrollWidth : 0;
          if (typeof ajusterRuban === 'function') ajusterRuban();
          const b = btn.getBoundingClientRect(), z = bar.getBoundingClientRect();
          const cible = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
          return { deborde: bar.scrollWidth > bar.clientWidth, b: [Math.round(b.left), Math.round(b.right)], z: [Math.round(z.left), Math.round(z.right)], vw: innerWidth, dessus: !!cible && btn.contains(cible) };
        }, bout === 'fin');
        check(`${w} px, ruban ${r.deborde ? 'défilé au ' + bout : 'sans défilement'} : « Choisir l’affichage » entier dans le ruban et l’écran (x ${r.b[0]}–${r.b[1]}, ruban ${r.z[0]}–${r.z[1]}), rien par-dessus`,
          (w === 1440 || r.deborde) && r.b[0] >= r.z[0] && r.b[1] <= r.z[1] && r.b[1] <= r.vw && r.dessus, r);
      }
      await o.ctx.close();
    }
    // ── Modales au téléphone : la barre du bas ne cache pas leur dernière ligne ──
    titre('6. Téléphone (390 px) : la dernière ligne des modales « Infos du marché » et ⚡ au-dessus de la barre du bas');
    for (const mode of ['debutant', 'expert']) {
      const o = await ouvrir(nav, { vue: { width: 390, height: 844 }, mode });
      for (const [ouvrirModale, corps] of [['openMarketModal', 'marketModalBody'], ['openLiveModal', 'liveModalBody']]) {
        await o.page.evaluate(f => window[f](), ouvrirModale);
        await o.page.waitForTimeout(1200);
        const r = await o.page.evaluate(id => {
          const b = document.getElementById(id); b.scrollTop = b.scrollHeight;
          const vis = [...b.children].filter(e => e.getClientRects().length && getComputedStyle(e).display !== 'none');
          const der = vis[vis.length - 1], barre = document.getElementById('taskbar');
          return { dernier: der && Math.round(der.getBoundingClientRect().bottom), barre: Math.round(barre.getBoundingClientRect().top), barreVue: getComputedStyle(barre).display !== 'none' };
        }, corps);
        check(`${mode} · ${corps} défilé en bas : dernière ligne à y ${r.dernier}, barre du bas à y ${r.barre}`, r.dernier !== undefined && (!r.barreVue || r.dernier <= r.barre), r);
        await o.page.evaluate(() => { for (const m of document.querySelectorAll('.modal')) m.style.display = 'none'; });
      }
      await o.ctx.close();
    }

    // ── 7. Les boutons de l'en-tête, à toute largeur : ni sur le prix, ni hors de l'écran ──
    // Constaté le 10/10 : en Expert, entre 481 et 660 px, les boutons se posaient sur le prix ;
    // dans les thèmes à structure (Néon, Codex, Gare, Planche), entre 801 et 1000 px, Réglages,
    // Légendes et Thème sortaient de l'écran ; dans la Planche, le bouton du panneau (alors
    // « + Indicateurs », aujourd'hui « Choisir l'affichage ») restait au bout
    // de sa nomenclature qui défile, hors de l'écran, jusqu'à 1279 px. Une page par thème et par
    // mode, redimensionnée de largeur en largeur ; publication en retard (pastille à placer aussi).
    titre('7. Boutons de l’en-tête et « Choisir l’affichage » : ni sur le prix, ni hors de l’écran, de 360 à 1440 px');
    const LARGEURS = [360, 390, 412, 481, 540, 600, 660, 720, 800, 801, 850, 900, 950, 1000, 1100, 1279, 1280, 1440];
    for (const theme of ['aero', 'kala', 'neon', 'codex', 'gare', 'gazette', 'cyanotype', 'diazo', 'bureau95']) {
      for (const mode of ['debutant', 'expert']) {
        const o = await ouvrir(nav, { vue: { width: 1440, height: 900 }, mode, theme, ageS: 25 * 60 });
        const fautes = [];
        for (const w of LARGEURS) {
          await o.page.setViewportSize({ width: w, height: 900 });
          await o.page.waitForTimeout(120);
          const f = await o.page.evaluate(mode => {
            const r = e => e.getBoundingClientRect();
            const vis = e => { const s = getComputedStyle(e); return s.display !== 'none' && s.visibility !== 'hidden' && r(e).width > 0 && r(e).height > 0; };
            const prix = document.getElementById('price'), rp = r(prix), out = [];
            const coupe = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
            const boutons = [...new Set(document.querySelectorAll('.header button, .header .ico-btn, #dot, .header .kpi-deb, .header .kpi-age, #indDropdownBtn'))].filter(b => vis(b) && !b.contains(prix) && !prix.contains(b));
            for (const b of boutons) {
              const rb = r(b), nom = b.id || b.className.split(' ')[0];
              if (vis(prix) && coupe(rp, rb)) out.push(nom + ' sur le prix');
              // Dans l'écran, et réellement sous le pointeur (pas caché par un voisin ni par un bord).
              const x = document.elementFromPoint(Math.min(innerWidth - 1, Math.max(0, rb.left + rb.width / 2)), Math.min(innerHeight - 1, Math.max(0, rb.top + rb.height / 2)));
              if (rb.right > innerWidth + 0.5 || rb.left < -0.5) out.push(nom + ' hors de l’écran');
              else if (!x || !(b.contains(x) || x.contains(b))) out.push(nom + ' caché');
            }
            if (document.documentElement.scrollWidth > innerWidth) out.push('défilement horizontal');
            // Plus d'interrupteur « Lisible | Complet » : « Le détail » et « Les chiffres du marché » sont
            // dans « Choisir l'affichage » (compté plus haut avec les autres boutons).
            if (document.getElementById('modeBtn')) out.push('interrupteur de mode encore là');
            return out;
          }, mode);
          for (const x of f) fautes.push(w + ' px : ' + x);
        }
        check(`${theme.padEnd(9)} · ${mode.padEnd(8)} : de 360 à 1440 px, aucun bouton sur le prix ni hors de l’écran ni caché ; plus d’interrupteur de mode`, !fautes.length, fautes.slice(0, 6));
        await o.ctx.close();
      }
    }

    // ── 8. Au doigt : des cibles d'au moins 40 × 40 px ──────────────────────────
    // Écran tactile (pointer: coarse), 360 et 390 px, deux modes, aero et kala, publication en retard
    // (la pastille la plus longue). Chaque bouton de l'en-tête et chaque intervalle du ruban : tout
    // le carré de 40 × 40 px centré sur lui (17 × 17 points jusqu'à ±19,5 px : le point du bord est au
    // milieu du dernier pixel) le touche, lui (la pastille
    // « Infos du marché » : elle ou la bande qui la porte, même action). « Choisir
    // l'affichage » a sa propre mesure : pas de taille exigée ici, mais aucune zone voisine ne le
    // couvre (chaque point de son cadre le touche, lui ou son conteneur). Puis le nom d'un bouton-icône,
    // dit à l'appui du doigt : chaque bouton sans mot visible a un nom en mots (aria-label), qui
    // s'affiche sous lui à l'appui, entier dans l'écran, et s'efface après le relâcher.
    titre('8. Au doigt (360 et 390 px, écran tactile) : chaque bouton de l’en-tête et du ruban, une cible de 40 × 40 px au moins ; le nom d’un bouton-icône dit à l’appui');
    for (const theme of ['aero', 'kala']) for (const mode of ['debutant', 'expert']) for (const w of [360, 390]) {
      const o = await ouvrir(nav, { vue: { width: w, height: 800 }, mode, theme, ageS: 25 * 60 });
      const nom = `${theme} · ${mode} · ${w}`;
      const m = await o.page.evaluate(() => {
        const vis = e => { const s = getComputedStyle(e), r = e.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0; };
        const AUTRES = ['indDropdownBtn'], autre = b => AUTRES.includes(b.id);
        const tous = [...document.querySelectorAll('.header button, .header a, .header [role="button"], .indicator-bar label[id^="int_"], #indDropdownBtn')].filter(vis);
        const cycle = document.getElementById('cycle');
        const nomDe = b => b.id || b.className.split(' ')[0];
        const cibles = tous.filter(b => !autre(b)).map(b => {
          // Un intervalle hors de la partie visible du ruban (Complet : il défile) : amené à l'écran d'abord.
          if (b.closest('.indicator-bar')) b.scrollIntoView({ block: 'nearest', inline: 'nearest' });
          const r = b.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
          const a = h => !!h && (b.contains(h) || (b.classList.contains('kpi-deb') && h === cycle));
          const rates = [];
          for (let i = -8; i <= 8; i++) for (let j = -8; j <= 8; j++) { const h = document.elementFromPoint(cx + i * 19.5 / 8, cy + j * 19.5 / 8); if (!a(h)) rates.push([Math.round(i * 19.5 / 8), Math.round(j * 19.5 / 8), h ? nomDe(h) : 'rien']); }
          // L'étendue de la zone sur les deux axes (au demi-pixel), pour le rapport.
          const ext = (dx, dy) => { let d = 0; while (d < 60 && a(document.elementFromPoint(cx + dx * (d + 0.5), cy + dy * (d + 0.5)))) d += 0.5; return d; };
          return { id: nomDe(b), dessin: [Math.round(r.width), Math.round(r.height)], zone: [ext(-1, 0) + ext(1, 0), ext(0, -1) + ext(0, 1)], rates: rates.length, ex: rates.slice(0, 3) };
        });
        // « Choisir l'affichage » : aucun point de son cadre (grille de 2 px) ne touche un autre élément
        // que lui — ou que son conteneur, dans les coins arrondis.
        const autres = tous.filter(autre).map(b => {
          if (b.closest('.indicator-bar')) b.scrollIntoView({ block: 'nearest', inline: 'nearest' });
          const r = b.getBoundingClientRect(), pris = new Set();
          for (let x = r.left + 1; x < r.right - 0.5; x += 2) for (let y = r.top + 1; y < r.bottom - 0.5; y += 2) { const h = document.elementFromPoint(x, y); if (!h || !(b.contains(h) || h.contains(b))) pris.add(h ? nomDe(h) : 'rien'); }
          return { id: b.id || b.dataset.modeChoix || nomDe(b), rates: pris.size, par: [...pris] };
        });
        const hd = document.querySelector('.header');
        return { cibles, autres, page: document.documentElement.scrollWidth - innerWidth, tete: [hd.scrollWidth, hd.clientWidth], hTete: Math.round(hd.getBoundingClientRect().height),
          geo: ['.header-left', '#cycle', '.header-right'].map(s => { const q = document.querySelector(s).getBoundingClientRect(); return s + ' ' + [q.left, q.top, q.right, q.bottom].map(Math.round).join(','); }) };
      });
      const petits = m.cibles.filter(c => c.rates);
      check(`${nom} : ${m.cibles.length} cibles (${m.cibles.map(c => c.id + ' ' + c.zone.join('×')).join(', ')}) — chacune couvre un carré de 40 × 40 px`,
        m.cibles.length >= (mode === 'debutant' ? 12 : 13) && !petits.length, { petits, geo: m.geo });
      check(`${nom} : « Choisir l’affichage » reste entier sous le doigt (aucune zone voisine sur lui)`,
        m.autres.length === 1 && m.autres.every(x => !x.rates), m.autres);
      check(`${nom} : ni la page ni l’en-tête ne débordent (en-tête ${m.hTete} px)`, m.page <= 0 && m.tete[0] <= m.tete[1] + 1, m);
      // Le nom à l'appui : chaque bouton sans mot visible, un nom en mots ; à l'appui, il s'affiche.
      const icones = await o.page.evaluate(() => [...document.querySelectorAll('.header button, .header a')].filter(b => b.getClientRects().length && getComputedStyle(b).visibility !== 'hidden' && !b.innerText.trim())
        .map(b => ({ id: b.id, nom: b.getAttribute('aria-label') || '' })));
      check(`${nom} : ${icones.length} boutons-icônes, chacun un nom en mots (${icones.map(i => '« ' + i.nom + ' »').join(', ')})`,
        icones.length >= 4 && icones.every(i => /^[A-ZÀ-Ÿ][a-zà-ÿ’' ()]+[a-zà-ÿ)]$/.test(i.nom) && i.nom.length >= 6), icones);
      const dits = [];
      for (const i of icones) {
        // L'appui seul (pointerdown tactile, sans relâcher : la carte du carnet ne s'ouvre pas).
        const r = await o.page.evaluate(id => {
          const b = document.getElementById(id), q = b.getBoundingClientRect();
          b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', isPrimary: true, clientX: q.left + q.width / 2, clientY: q.top + q.height / 2 }));
          const n = document.getElementById('nomAppui'), rn = n && n.getBoundingClientRect();
          const res = n && { texte: n.textContent, vu: !n.hidden && rn.width > 0, dans: rn.left >= 0 && rn.right <= innerWidth && rn.top >= 0 && rn.bottom <= innerHeight, pres: Math.abs(rn.left + rn.width / 2 - (q.left + q.width / 2)) < rn.width / 2 + q.width / 2 + 1 && (rn.top >= q.bottom || rn.bottom <= q.top), muet: n.getAttribute('aria-hidden') === 'true' };
          b.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'touch', isPrimary: true }));
          return res;
        }, i.id);
        dits.push({ id: i.id, r });
        if (!r || r.texte !== i.nom || !r.vu || !r.dans || !r.pres || !r.muet) break;
      }
      check(`${nom} : à l’appui, chaque bouton-icône dit son nom sous lui, entier dans l’écran (bulle muette pour un lecteur d’écran)`,
        dits.length === icones.length && dits.every((d, k) => d.r && d.r.texte === icones[k].nom && d.r.vu && d.r.dans && d.r.pres && d.r.muet), dits.slice(-2));
      await o.page.waitForTimeout(1400);
      const parti = await o.page.evaluate(() => { const n = document.getElementById('nomAppui'); return !n || n.hidden; });
      check(`${nom} : 1,2 s après le relâcher, le nom s’efface`, parti, parti);
      if (w === 390 && mode === 'debutant') {
        // Un vrai toucher : le nom s'affiche ET l'action a lieu (Légendes s'ouvre).
        const b = await o.page.evaluate(() => { const q = document.getElementById('legendesBtn').getBoundingClientRect(); return { x: q.left + q.width / 2, y: q.top + q.height / 2 }; });
        await o.page.touchscreen.tap(b.x, b.y);
        await o.page.waitForTimeout(300);
        const t = await o.page.evaluate(() => { const n = document.getElementById('nomAppui'), g = document.getElementById('fichePop'), ti = g && g.querySelector('.fiche-titre');
          return { nom: n && !n.hidden ? n.textContent : null, ouvert: !!g && g.getClientRects().length > 0 && getComputedStyle(g).visibility !== 'hidden' && !!ti && ti.textContent === 'Légendes' }; });
        check(`${nom} : un vrai toucher sur Légendes : « ${t.nom} » s’affiche et les légendes s’ouvrent`, t.nom === 'Légendes' && t.ouvert, t);
      }
      check(`${nom} : aucune erreur de script`, !o.erreurs.length, o.erreurs);
      await o.ctx.close();
    }
  } finally {
    await nav.close();
    serveur.close();
  }
  console.log(ko ? `\n❌ EN-TÊTE : ${ko} contrôle(s) en échec` : '\n✅ EN-TÊTE : TOUS LES CONTRÔLES PASSENT');
  process.exit(ko ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
