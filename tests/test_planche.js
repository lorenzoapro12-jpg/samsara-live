// La structure « planche » (thèmes Cyanotype et Diazo), vérifiée : les deux feuilles, puis la
// page dans un vrai navigateur (Chromium, Playwright).
//
//   1. JUMEAUX (sans navigateur) : themes/diazo.css a les MÊMES règles que themes/cyanotype.css au
//      sélecteur de thème près — seuls les jetons diffèrent —, les deux blocs de jetons déclarent
//      les mêmes noms, et chaque var(--plan-…) employé est défini des deux côtés.
//   2. CHANTIER : le pied de planche (nomenclature = le ruban, cartouche = chiffres clés et heure)
//      est posé entre le graphique et le Grid Bot ; rien n'est inséré DANS le ruban (la règle
//      téléphone compte ses <span>) ; 24 repères de zone et 4 de centrage, dans un cadre fixe SOUS
//      le contenu — et <html> n'a pas de fond (sinon le cadre passerait dessous).
//   3. MISE EN PAGE à 1440 × 900, 1280 × 720, 1024 × 768, 800 × 900 et 390 × 800 : aucun chiffre
//      clé masqué, pas de défilement horizontal, le canvas tient dans son cadre ; sur bureau, la
//      nomenclature tient en DEUX rangées et le pied en moins de 100 px ; « Vue A » est sous le
//      tracé ; au téléphone, ni cadre ni repères, et aucun bouton ne recouvre le prix.
//   4. Le canvas SUIT la hauteur de son cadre quand le pied grandit (ResizeObserver de la
//      structure) — sans événement de fenêtre.
//   5. NUAGE DE RÉVISION : absent au premier remplissage de l'heure, posé quand elle CHANGE,
//      retiré après sa durée ; dessin statique (aucune animation).
//   6. Indice de révision : étiquette « Ind. de révision », triangle △ seulement si la publication
//      est en retard (.vieux) ; « Détail A, B… » sur les cartes ; sources lues dans la publication.
//   7. Étiquette du dernier prix : son texte est --up-sur / --down-sur (Cyanotype : la hausse est
//      blanche, le texte d'avant était blanc).
//   8. DÉMONTAGE : quitter le thème débranche les observateurs (MutationObserver, ResizeObserver)
//      et retire tout ; le jumeau (touche D) garde la même structure sans la reconstruire.
//
// Sans Playwright, la partie 1 tourne seule et le reste est dit « non exécuté ».
// USAGE   node tests/test_planche.js
const fs = require('fs'), path = require('path'), http = require('http');
const { previsionsFixture, estPrevisions } = require('./previsions-fixture');   // scénarios du matin (branche previsions)
const REPO = path.resolve(__dirname, '..');

let ko = 0;
const check = (nom, ok, det) => { if (!ok) ko++; console.log(`  ${ok ? '✓' : '✗'} ${nom}${!ok && det !== undefined ? ' — ' + JSON.stringify(det).slice(0, 500) : ''}`); };
const titre = t => console.log(`\n── ${t} ──`);
const fin = () => { console.log(ko ? `\n❌ PLANCHE : ${ko} contrôle(s) en échec` : '\n✅ PLANCHE : TOUS LES CONTRÔLES PASSENT'); process.exit(ko ? 1 : 0); };

// ─── 1. Jumeaux ───
titre('1. Jumeaux : mêmes règles, jetons seuls différents');
const sansCom = css => css.replace(/\/\*[\s\S]*?\*\//g, '');
function decouper(id) {
  const css = sansCom(fs.readFileSync(path.join(REPO, 'themes', id + '.css'), 'utf8'));
  const sel = `[data-theme="${id}"] {`, i = css.indexOf(sel), j = css.indexOf('}', i);
  const bloc = css.slice(i + sel.length, j);
  const jetons = Object.fromEntries([...bloc.matchAll(/(--[\w-]+|color-scheme)\s*:\s*([^;]+);/g)].map(m => [m[1], m[2].trim()]));
  const regles = (css.slice(0, i) + css.slice(j + 1)).split(`[data-theme="${id}"]`).join('[data-theme="§"]').replace(/\s+/g, ' ').trim();
  return { jetons, regles };
}
const C = decouper('cyanotype'), D = decouper('diazo');
check('diazo.css : mêmes règles que cyanotype.css, au sélecteur de thème près', C.regles === D.regles,
  (() => { let k = 0; while (k < C.regles.length && C.regles[k] === D.regles[k]) k++; return { ecart: C.regles.slice(k, k + 80) + ' ≠ ' + D.regles.slice(k, k + 80) }; })());
const nc = Object.keys(C.jetons).sort(), nd = Object.keys(D.jetons).sort();
check(`les deux blocs de jetons déclarent les mêmes ${nc.length} noms`, nc.join() === nd.join(),
  { seulement_cyanotype: nc.filter(n => !nd.includes(n)), seulement_diazo: nd.filter(n => !nc.includes(n)) });
const plan = [...new Set([...C.regles.matchAll(/var\((--plan-[\w-]+)/g)].map(m => m[1]))];
check(`chaque var(--plan-…) employé (${plan.length}) est défini dans les deux thèmes`, plan.length > 0 && plan.every(n => n in C.jetons && n in D.jetons),
  plan.filter(n => !(n in C.jetons && n in D.jetons)));
check('les deux thèmes déclarent la structure « planche » et se désignent comme jumeaux', (() => {
  const idx = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8');
  return /data-theme-id="cyanotype"[^>]*data-structure="planche"[^>]*data-paire="diazo"/.test(idx)
    && /data-theme-id="diazo"[^>]*data-structure="planche"[^>]*data-paire="cyanotype"/.test(idx);
})());

let playwright = null;
for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright', process.env.PLAYWRIGHT_MODULE].filter(Boolean)) {
  try { playwright = require(p); break; } catch (e) { /* suivant */ }
}
if (!playwright) {
  console.log('  − NON EXÉCUTÉ : Playwright introuvable — la planche n\'est pas vérifiée dans un navigateur sur ce poste.');
  fin();
}

// Binance simulé : bougies déterministes (une sinusoïde), prix fixe (86012.5).
function binance(url) {
  const u = new URL(url), q = u.searchParams, now = Date.now();
  if (u.pathname.endsWith('/klines')) {
    const pas = { '1m': 6e4, '5m': 3e5, '15m': 9e5, '1h': 36e5, '4h': 144e5, '1d': 864e5, '1w': 6048e5 }[q.get('interval')] || 9e5;
    const n = Math.min(1000, +q.get('limit') || 500), f = q.get('endTime') ? Math.min(+q.get('endTime'), now) : now;
    return Array.from({ length: n }, (_, i) => { const t = Math.floor((f - (n - 1 - i) * pas) / pas) * pas, c = 86000 + Math.sin(i / 7) * 300, o = c + (i % 2 ? 40 : -40);
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

async function ouvrir(nav, theme, vue, retardPublication) {
  const ctx = await nav.newContext({ viewport: vue, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const erreurs = [];
  page.on('pageerror', e => erreurs.push(e.message));
  await page.route('**/*', async r => {
    const u = r.request().url(), h = new URL(u).host, cors = { 'access-control-allow-origin': '*' };
    if (h.startsWith('127.0.0.1')) return r.continue();
    if (h === 'api.binance.com') return r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(binance(u)) });
    if (estPrevisions(u)) return r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: previsionsFixture() });
    if (h === 'raw.githubusercontent.com') {
      if (retardPublication && !u.includes('heatmap')) await new Promise(ok => setTimeout(ok, retardPublication));
      return r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: fs.readFileSync(path.join(REPO, u.includes('heatmap') ? 'heatmap.json' : 'market-data.json')) });
    }
    return r.abort();
  });
  // Mode Expert : ce test mesure les éléments denses (chiffres clés, heure de publication, couche de
  // chaleur, étiquettes de l'axe…), masqués en Débutant (le mode par défaut) ; leur version Débutant
  // est vérifiée dans test_debutant_page.js.
  await page.addInitScript(t => { try { localStorage.clear(); localStorage.setItem('samsara-mode', 'expert'); localStorage.setItem('samsara-theme', t); } catch (e) { /* */ } }, theme);
  // Observateurs VIVANTS (observe sans disconnect), comptés par type ; textes du canvas relevés.
  await page.addInitScript(() => {
    window.__vivants = { MutationObserver: new Set(), ResizeObserver: new Set() };
    for (const nom of ['MutationObserver', 'ResizeObserver']) {
      const Base = window[nom];
      if (!Base) continue;
      window[nom] = class extends Base {
        observe(...a) { window.__vivants[nom].add(this); return super.observe(...a); }
        disconnect() { window.__vivants[nom].delete(this); return super.disconnect(); }
      };
    }
    const P = CanvasRenderingContext2D.prototype, fillText = P.fillText;
    window.__textes = [];
    P.fillText = function (t, x, y, ...a) { if ((this.canvas.id === 'chart' || this.canvas.id === 'chartCalque') && window.__textes.length < 20000) window.__textes.push({ t: String(t), s: String(this.fillStyle) }); return fillText.call(this, t, x, y, ...a); };
  });
  await page.goto(`http://127.0.0.1:${serveur.address().port}/index.html`);
  await page.waitForTimeout(2000 + (retardPublication || 0));
  return { ctx, page, erreurs };
}

/** Mesures de mise en page (dans la page). */
const MESURES = () => {
  const $ = id => document.getElementById(id), r = el => el.getBoundingClientRect();
  const pied = document.querySelector('.plan-pied'), cart = document.querySelector('.plan-cartouche'), cc = document.querySelector('.chart-container');
  const cv = $('chart'), rc = r(cv), rcc = r(cc), cs = getComputedStyle(cc);
  const barre = $('indicatorBar');
  // Rangées du ruban : centres verticaux de ses éléments, regroupés à 8 px près (titres, pastilles
  // et bouton n'ont pas la même hauteur : leurs bords hauts diffèrent sur une même rangée).
  const centres = [...barre.children].filter(e => getComputedStyle(e).display !== 'none' && r(e).width > 0 && !e.classList.contains('sep'))
    .map(e => (r(e).top + r(e).bottom) / 2).sort((a, b) => a - b);
  const rangees = centres.reduce((acc, y) => (acc.length && y - acc[acc.length - 1] < 8 ? acc : acc.concat(y)), []);
  const centreMenu = (r(document.querySelector('.ind-dropdown')).top + r(document.querySelector('.ind-dropdown')).bottom) / 2;
  const kpis = [...document.querySelectorAll('#cycle .kpi')];
  const prix = r($('price')), boutons = [...document.querySelectorAll('.header-right > *')].filter(e => getComputedStyle(e).display !== 'none' && r(e).width > 0);
  const coupe = (a, b) => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
  const vue = document.querySelector('.plan-vue');
  return {
    pied: pied ? Math.round(r(pied).height) : null,
    lignes: rangees.length,
    menuEnPremiereLigne: Math.abs(centreMenu - rangees[0]) < 8,
    colonnes: getComputedStyle($('cycle')).gridTemplateColumns.split(' ').length,
    kpis: kpis.length, kpisMasques: kpis.filter(k => k.hidden || getComputedStyle(k).display === 'none').length,
    debord: document.documentElement.scrollWidth - innerWidth,
    canvasDansCadre: rc.bottom <= rcc.bottom - parseFloat(cs.paddingBottom) + 1 && rc.top >= rcc.top - 1,
    ecartCanvas: Math.round(rcc.height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) - rc.height),
    vueSousLeTrace: vue && getComputedStyle(vue).display !== 'none' ? r(vue).top >= rc.bottom - 0.5 && r(vue).bottom <= rcc.bottom + 0.5 : null,
    cadre: getComputedStyle(document.querySelector('.plan-cadre')).display,
    prixRecouvert: boutons.filter(b => coupe(prix, r(b))).map(b => b.id || b.className),
    cartoucheVisible: !!cart && getComputedStyle(cart).display !== 'none' && r(cart).height > 20,
    majVisible: getComputedStyle($('updated')).display !== 'none' && r($('updated')).width > 0,
    intervalleEnTete: r($('int_1m')).left < r($('lbl_ema20')).left,
  };
};

(async () => {
  await new Promise(r => serveur.listen(0, '127.0.0.1', r));
  const nav = await playwright.chromium.launch();
  try {
    // ─── 2. Chantier ───
    titre('2. Chantier : pied de planche, cartouche, cadre sous le contenu');
    let o = await ouvrir(nav, 'cyanotype', { width: 1440, height: 900 });
    const ch = await o.page.evaluate(() => {
      const $ = id => document.getElementById(id), pied = document.querySelector('.plan-pied'), cadre = document.querySelector('.plan-cadre');
      const cs = cadre && getComputedStyle(cadre), html = getComputedStyle(document.documentElement);
      return {
        structure: document.documentElement.getAttribute('data-structure'),
        piedOuIlFaut: !!pied && pied.previousElementSibling === document.querySelector('.main-area') && pied.nextElementSibling === $('stratSection'),
        rubanDansPied: $('indicatorBar').parentNode === pied,
        cartouche: $('cycle').parentNode.className + ' / ' + $('updated').parentNode.className,
        spansDuRuban: [...$('indicatorBar').children].filter(e => e.tagName === 'SPAN').length,
        reperes: document.querySelectorAll('.plan-cadre .plan-repere').length, centrage: document.querySelectorAll('.plan-cadre .plan-centrage').length,
        cadre: cs && cs.position + ' ' + cs.zIndex,
        fondHtml: html.backgroundImage === 'none' && /rgba\(0, 0, 0, 0\)|transparent/.test(html.backgroundColor),
        sources: (document.querySelector('.plan-sources') || {}).textContent, attendu: 'Sources : ' + (marketData && marketData.source),
        // Le compteur n'est pas résolu par getComputedStyle : on lit sa déclaration, sa remise à
        // zéro sur le panneau et son incrément par carte.
        details: { avant: getComputedStyle(document.querySelector('#feed .demon-name'), '::before').content,
          remise: getComputedStyle($('feed')).counterReset, increment: getComputedStyle(document.querySelector('#feed .demon-card')).counterIncrement },
      };
    });
    check('structure « planche » posée', ch.structure === 'planche', ch.structure);
    check('pied de planche entre le graphique et le Grid Bot, ruban dedans', ch.piedOuIlFaut && ch.rubanDansPied, ch);
    check('chiffres clés et heure de publication dans le cartouche', ch.cartouche === 'plan-cartouche / plan-cartouche', ch.cartouche);
    check('rien n\'est inséré dans le ruban (6 <span>, comme la base)', ch.spansDuRuban === 6, ch.spansDuRuban);
    check('24 repères de zone et 4 de centrage, cadre fixe sous le contenu (z-index −1)', ch.reperes === 24 && ch.centrage === 4 && ch.cadre === 'fixed -1', ch);
    check('<html> sans fond (le cadre en z-index −1 resterait dessous)', ch.fondHtml);
    check('sources du cartouche lues dans la publication', ch.sources === ch.attendu, ch);
    check('cartes : « Détail A, B… » (compteur remis à zéro par le panneau, un cran par carte)',
      /^"Détail " counter\(detail, upper-alpha\)/.test(ch.details.avant) && ch.details.remise === 'detail 0' && ch.details.increment === 'detail 1', ch.details);

    // ─── 6. Indice de révision ───
    const ind = await o.page.evaluate(() => {
      const cy = document.getElementById('cycle'), a = cy.querySelector('.kpi-age'), lire = () => getComputedStyle(a, '::after').content;
      cy.classList.remove('vieux'); const frais = lire();
      cy.classList.add('vieux'); const vieux = lire();
      return { etiquette: getComputedStyle(a, '::before').content, frais, vieux, texte: a.textContent };
    });
    check('indice de révision : étiquette posée, valeur inchangée (l\'âge en minutes)', /Ind\. de révision/.test(ind.etiquette) && /^(\d+ min|—)$/.test(ind.texte), ind);
    check('indice de révision : △ au crayon rouge seulement en retard (.vieux)', ind.frais === 'none' && /△/.test(ind.vieux), ind);

    // ─── 7. Étiquette du dernier prix ───
    const tag = await o.page.evaluate(() => {
      const cs = getComputedStyle(document.documentElement), norm = c => { const x = document.createElement('canvas').getContext('2d'); x.fillStyle = c; return x.fillStyle; };
      window.__textes.length = 0; drawChart(); dessinerCalque();   // l'étiquette du prix vit sur le calque (chartCalque)
      const t = window.__textes.filter(e => /^\$86012\.5/.test(e.t));
      return { styles: [...new Set(t.map(e => e.s))], surUp: norm(cs.getPropertyValue('--up-sur').trim()), surDown: norm(cs.getPropertyValue('--down-sur').trim()), up: norm(cs.getPropertyValue('--up').trim()) };
    });
    check('étiquette du dernier prix écrite en --up-sur / --down-sur, jamais à la couleur de la barre',
      tag.styles.length > 0 && tag.styles.every(s => s === tag.surUp || s === tag.surDown) && !tag.styles.includes(tag.up), tag);

    // ─── 5. Nuage de révision ───
    titre('5. Nuage de révision : une NOUVELLE publication, 90 s, dessin statique');
    const nuage = await o.page.evaluate(async () => {
      const cart = () => document.querySelector('.plan-cartouche'), u = document.getElementById('updated');
      const auChargement = cart().classList.contains('revise');
      // Durée raccourcie pour le test : relue à la construction.
      appliquerTheme('aero'); STRUCTURES.planche.revisionMs = 400; appliquerTheme('cyanotype');
      const avant = cart().classList.contains('revise');
      u.textContent = '23:59';
      await new Promise(r => setTimeout(r, 50));
      const apres = cart().classList.contains('revise'), cs = getComputedStyle(cart(), '::after');
      const dessin = { content: cs.content, anim: cs.animationName, pe: cs.pointerEvents };
      await new Promise(r => setTimeout(r, 600));
      const retire = !cart().classList.contains('revise');
      STRUCTURES.planche.revisionMs = 90000;
      return { auChargement, avant, apres, dessin, retire, duree: STRUCTURES.planche.revisionMs };
    });
    check('aucun nuage au premier remplissage de l\'heure', !nuage.auChargement && !nuage.avant, nuage);
    check('nuage posé quand l\'heure de publication CHANGE', nuage.apres, nuage);
    check('nuage : dessin statique, sans animation, inerte', nuage.dessin.content !== 'none' && nuage.dessin.anim === 'none' && nuage.dessin.pe === 'none', nuage.dessin);
    check('nuage retiré après sa durée (90 s par défaut)', nuage.retire && nuage.duree === 90000, nuage);

    // ─── 8. Démontage, jumeau ───
    titre('8. Démontage : observateurs débranchés ; le jumeau garde la structure');
    const dem = await o.page.evaluate(async () => {
      const n = () => ({ mo: window.__vivants.MutationObserver.size, ro: window.__vivants.ResizeObserver.size });
      appliquerTheme('aero'); const sans = n();
      appliquerTheme('cyanotype'); const avec = n(); const pied = document.querySelector('.plan-pied');
      appliquerTheme('diazo'); const jumeau = { meme: document.querySelector('.plan-pied') === pied, structure: document.documentElement.getAttribute('data-structure'), n: n() };
      appliquerTheme('aero'); const apres = n();
      document.getElementById('updated').textContent = '00:01';
      await new Promise(r => setTimeout(r, 50));
      return { sans, avec, jumeau, apres, restes: document.querySelectorAll('[class*="plan-"], .revise').length };
    });
    check('la planche branche ses observateurs (1 MutationObserver, 1 ResizeObserver)', dem.avec.mo === dem.sans.mo + 1 && dem.avec.ro === dem.sans.ro + 1, dem);
    check('quitter la planche les débranche tous', dem.apres.mo === dem.sans.mo && dem.apres.ro === dem.sans.ro, dem);
    check('quitter la planche retire tout son décor et ses conteneurs', dem.restes === 0, dem.restes);
    check('cyanotype → diazo (touche D) : même structure, pas reconstruite', dem.jumeau.meme && dem.jumeau.structure === 'planche' && dem.jumeau.n.mo === dem.avec.mo, dem.jumeau);
    check('aucune erreur JavaScript', !o.erreurs.length, o.erreurs);
    await o.ctx.close();

    // ─── 3. Mise en page ───
    titre('3. Mise en page : rien de masqué, rien qui déborde');
    for (const [th, w, h] of [['cyanotype', 1440, 900], ['cyanotype', 1280, 720], ['diazo', 1280, 720], ['cyanotype', 1024, 768], ['cyanotype', 800, 900], ['cyanotype', 390, 800], ['diazo', 390, 800]]) {
      o = await ouvrir(nav, th, { width: w, height: h });
      const m = await o.page.evaluate(MESURES);
      const nom = `${th.padEnd(9)} ${w} × ${h}`;
      check(`${nom} · 8 chiffres clés, aucun masqué ; pas de défilement horizontal ; canvas dans son cadre`,
        m.kpis === 8 && m.kpisMasques === 0 && m.debord <= 0 && m.canvasDansCadre && Math.abs(m.ecartCanvas) <= 1, m);
      if (w >= 1280) {
        check(`${nom} · nomenclature en 2 rangées (menu « Indicateurs » sur la première), pied ≤ 95 px, cartouche en 5 colonnes`,
          m.lignes === 2 && m.menuEnPremiereLigne && m.pied <= 95 && m.colonnes === 5, m);
        check(`${nom} · « Vue A » dans la marge basse, sous le tracé`, m.vueSousLeTrace === true, m);
      } else if (w > 768) {
        check(`${nom} · nomenclature sur une rangée qui défile, cartouche dessous`, m.lignes === 1 && m.cartoucheVisible, m);
      } else {
        check(`${nom} · ni cadre ni repères ; cartouche et heure visibles ; intervalle en tête du ruban`, m.cadre === 'none' && m.cartoucheVisible && m.majVisible && m.intervalleEnTete, m);
        check(`${nom} · aucun bouton de l'en-tête ne recouvre le prix`, !m.prixRecouvert.length, m.prixRecouvert);
      }
      check(`${nom} · aucune erreur JavaScript`, !o.erreurs.length, o.erreurs);
      await o.ctx.close();
    }

    // ─── 4. Le canvas suit son cadre ───
    titre('4. Le canvas suit la hauteur de son cadre quand le pied change');
    for (const [w, h] of [[1440, 900], [390, 800]]) {
      // Publication servie avec 1,5 s de retard : le cartouche se remplit APRÈS le premier dessin.
      o = await ouvrir(nav, 'cyanotype', { width: w, height: h }, 1500);
      const tard = await o.page.evaluate(MESURES);
      check(`${w} × ${h} · publication arrivée après le premier dessin : canvas ajusté au cadre`, tard.canvasDansCadre && Math.abs(tard.ecartCanvas) <= 1, tard);
      // Le pied grandit de 40 px, sans événement de fenêtre : le canvas suit.
      await o.page.evaluate(() => { document.querySelector('.plan-cartouche').style.marginTop = '40px'; });
      await o.page.waitForTimeout(200);
      const grandi = await o.page.evaluate(MESURES);
      await o.page.evaluate(() => { document.querySelector('.plan-cartouche').style.marginTop = ''; });
      await o.page.waitForTimeout(200);
      const revenu = await o.page.evaluate(MESURES);
      check(`${w} × ${h} · pied plus haut de 40 px : le canvas rapetisse avec son cadre, puis revient`,
        grandi.canvasDansCadre && Math.abs(grandi.ecartCanvas) <= 1 && revenu.canvasDansCadre && Math.abs(revenu.ecartCanvas) <= 1, { grandi, revenu });
      check(`${w} × ${h} · aucune erreur JavaScript`, !o.erreurs.length, o.erreurs);
      await o.ctx.close();
    }
  } finally { await nav.close(); serveur.close(); }
  fin();
})().catch(e => { console.error(e); process.exit(1); });
