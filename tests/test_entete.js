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
//      boutons « Infos du marché (F) » et « En direct (à la seconde) ».
//   5. LA MÊME VARIATION 24 h dans l'en-tête et dans le panneau ⚡ (ouverture → dernier prix).
//   6. L'HEURE de l'appareil, le fuseau dit une fois (titre de l'horloge) ; aucun « UTC » dans
//      l'en-tête ; l'heure de publication écrite à l'heure de l'appareil.
//   7. « + Indicateurs » à l'écran en Expert, ruban plein (tous les indicateurs allumés) : à
//      1440 px, épinglé au bord droit, ruban défilé au début comme à la fin ; à 390 px, en tête.
//   8. RACCOURCIS : une touche tapée dans un champ, ou avec Ctrl, ne déclenche rien.
//   9. GEX sans couleur hausse / baisse dans les chiffres clés ; cartes : prix publié plus petit
//      que le prix en direct, jauge RSI sans vert ni rouge ; bandeau d'âge qui avance.
//  10. TÉLÉPHONE : la barre du bas ne cache pas la dernière ligne des modales.
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
      check(`boutons : « ${noms.feed} » ; « ${noms.live.slice(0, 40)}… »`, noms.feed === 'Infos du marché (F)' && /^En direct \(à la seconde\)/.test(noms.live), noms);
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

      // Raccourcis : rien depuis un champ, rien avec Ctrl ; la touche seule, oui.
      await p.evaluate(() => { const i = document.createElement('input'); i.id = '__champ'; document.body.appendChild(i); i.focus(); });
      await p.keyboard.press('f');
      const dansChamp = await p.evaluate(() => feedVisible);
      await p.evaluate(() => { document.getElementById('__champ').blur(); document.body.focus(); });
      await p.keyboard.press('Control+f');
      const avecCtrl = await p.evaluate(() => feedVisible);
      await p.keyboard.press('f');
      const seule = await p.evaluate(() => feedVisible);
      check(`raccourci « F » : tapé dans un champ, rien (${dansChamp}) ; Ctrl+F, rien (${avecCtrl}) ; seul, le panneau s’ouvre (${seule})`, !dansChamp && !avecCtrl && seule);

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

    // ── 7. « + Indicateurs » toujours à l'écran ────────────────────────────────
    titre('5. « + Indicateurs » à l’écran en Expert, ruban plein : épinglé au bureau, en tête au téléphone');
    for (const w of [1440, 390]) {
      const o = await ouvrir(nav, { vue: { width: w, height: w <= 480 ? 844 : 900 }, mode: 'expert' });
      const p = o.page;
      await p.evaluate(() => { for (const l of document.querySelectorAll('#indicatorBar label[id^="lbl_"]')) if (!l.classList.contains('active')) l.click(); });
      await p.waitForTimeout(500);
      // Au bureau, il est épinglé au bord droit (ruban défilé au début comme à la fin) ; au
      // téléphone, il est en TÊTE du ruban (avant les intervalles) : visible à l'ouverture.
      for (const bout of w > 768 ? ['début', 'fin'] : ['début']) {
        const r = await p.evaluate(fin => {
          const bar = document.getElementById('indicatorBar'), btn = document.getElementById('indDropdownBtn');
          bar.scrollLeft = fin ? bar.scrollWidth : 0;
          if (typeof ajusterRuban === 'function') ajusterRuban();
          const b = btn.getBoundingClientRect(), z = bar.getBoundingClientRect();
          const cible = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
          return { deborde: bar.scrollWidth > bar.clientWidth, b: [Math.round(b.left), Math.round(b.right)], z: [Math.round(z.left), Math.round(z.right)], vw: innerWidth, dessus: !!cible && btn.contains(cible) };
        }, bout === 'fin');
        check(`${w} px, ruban défilé au ${bout} : « + Indicateurs » entier dans le ruban et l’écran (x ${r.b[0]}–${r.b[1]}, ruban ${r.z[0]}–${r.z[1]}), rien par-dessus`,
          r.deborde && r.b[0] >= r.z[0] && r.b[1] <= r.z[1] && r.b[1] <= r.vw && r.dessus, r);
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
  } finally {
    await nav.close();
    serveur.close();
  }
  console.log(ko ? `\n❌ EN-TÊTE : ${ko} contrôle(s) en échec` : '\n✅ EN-TÊTE : TOUS LES CONTRÔLES PASSENT');
  process.exit(ko ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
