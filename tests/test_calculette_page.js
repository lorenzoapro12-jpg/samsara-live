// La calculette de risque (plan du site du 13/10/2026, idée 7), vérifiée dans Chromium.
//
//   1. OUVERTURE : rien sur l'écran de départ ; dans « Choisir l'affichage », un bloc « Outils »
//      juste avant les « Réglages fins » (qui restent le dernier bloc), un bouton « Calculette de
//      risque » qui ferme le panneau et ouvre la calculette dans la bulle des légendes (#fichePop) :
//      sa tête (« Calculette de risque », ×) d'abord, le focus sur la croix (le clavier du téléphone
//      ne surgit pas), une phrase en tête, le pied « Un calcul, pas un conseil. ».
//   2. SAISIE : des champs texte au clavier décimal, sans saisie automatique, 16 px et 40 px de haut
//      au doigt, au-dessus des résultats ; « 10 000 », « 80 197 », trois paliers ajoutés au bouton
//      (la bulle ne se referme pas) : 0,02134 BTC par palier, perte 100 $ (1 % du capital), prix
//      moyen, mise ; retirer un palier, un stop entre les paliers (un message, pas de calcul), au-dessus
//      (vente) ; la part choisie dans la ligne de rappel.
//   3. SANS MÉMOIRE : rien n'est écrit dans le stockage par la calculette ; fermée puis rouverte, ses
//      champs sont vides (la part revient à sa valeur de départ).
//   4. ÉCRAN : à 390 px (doigt) et 1440 px, dans plusieurs thèmes (Bureau 95 et son contraste,
//      Gazette, Néon, Diazo, Aero) : la bulle dans l'écran, aucun défilement de côté (page ni bulle),
//      aucun mot interdit du Lisible ni conseil, aucune erreur JavaScript.
//   5. Le glossaire des légendes : un titre touché ouvre sa fiche, qui reste ouverte (le même défaut
//      que les boutons de la calculette, corrigé dans js/fiches.js).
//   6. REVUE DU 14/10 (C5, M1, N2) : les noms disent « part risquée », « stop », « palier » en mots
//      simples ; un nombre tapé sans espace (« 81700 ») est réécrit « 81 700 » en quittant le champ ;
//      le stop est redit ; une mise plus grande que le capital est dite, en couleur d'alerte.
//   7. REVUE DU 14/10 (N3, vision-4 ; « Les deux » de Lorenzo à Q3) : sous les résultats d'un achat,
//      la ligne mesurée (source et condition dites), sous le rappel, dans la bulle, aux jetons du
//      thème, sans « : » ni « jours » en tête de ligne ; aucune avant un calcul ni en vente.
//   8. CALCULETTE LISIBLE (29/10, « Tout » de Lorenzo) : deux onglets, une question en tête de
//      chacun, « Essayer un exemple » qui remplit les champs (la bulle reste ouverte), la perte en $
//      (capital facultatif) ou en %, la phrase de tête du résultat au-dessus du détail, l'onglet
//      « Position ouverte » (0,28 BTC à 84 300, stop 67 000 → 4 844 $), ce qui est tapé gardé d'un
//      onglet à l'autre, Entrée qui reste dans l'onglet ouvert.
//
// Sans Playwright : « non exécuté », dit à l'écran (ce n'est pas un succès).
// USAGE   node tests/test_calculette_page.js
const fs = require('fs'), path = require('path'), http = require('http');
const REPO = path.resolve(__dirname, '..');
const Guide = require(path.join(REPO, 'js', 'guide.js'));

let playwright = null;
for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright', process.env.PLAYWRIGHT_MODULE].filter(Boolean)) {
  try { playwright = require(p); break; } catch (e) { /* suivant */ }
}
if (!playwright) {
  console.log('  − NON EXÉCUTÉ : Playwright introuvable — la calculette n’est pas vérifiée à l’écran sur ce poste.');
  process.exit(0);
}
let ko = 0;
const check = (nom, ok, det) => { if (!ok) ko++; console.log(`  ${ok ? '✓' : '✗'} ${nom}${!ok && det !== undefined ? ' — ' + JSON.stringify(det).slice(0, 600) : ''}`); };
const titre = t => console.log(`\n── ${t} ──`);
const CONSEIL = /\b(achetez|vendez|achète[rz]?\b|vends\b|il faut (?:acheter|vendre)|entrez|sortez|prenez position|signal d['’]achat|signal de vente|recommand(?:e|ons)|plac(?:er|ez?)\s+(?:un|des|les|vos|votre)\s+stops?)/i;

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
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const serveur = http.createServer((req, res) => {
  const f = path.join(REPO, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(REPO) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

async function ouvrir(nav, theme, w, h, mode) {
  const tactile = w < 500;
  const ctx = await nav.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: tactile, isMobile: tactile });
  const page = await ctx.newPage();
  const erreurs = [];
  page.on('pageerror', e => erreurs.push(e.message));
  await page.route('**/*', r => {
    const u = r.request().url(), host = new URL(u).host, cors = { 'access-control-allow-origin': '*' };
    if (host.startsWith('127.0.0.1')) return r.continue();
    if (host === 'api.binance.com' || host === 'data-api.binance.vision') return r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(binance(u)) });
    if (host === 'raw.githubusercontent.com') return r.fulfill({ status: 404, headers: cors, body: '' });
    return r.abort();
  });
  await page.addInitScript(([t, m]) => {
    try { localStorage.clear(); sessionStorage.clear(); localStorage.setItem('samsara-theme', t); if (m === 'expert') localStorage.setItem('samsara-mode', 'expert'); } catch (e) { /* */ }
    // Toute écriture dans le stockage, notée pendant que la calculette est ouverte (window.__ecrit).
    const set = Storage.prototype.setItem;
    window.__ecrit = null;
    Storage.prototype.setItem = function (k, v) { if (window.__ecrit) window.__ecrit.push({ k: String(k), v: String(v).slice(0, 200), session: this === window.sessionStorage }); return set.call(this, k, v); };
  }, [theme, mode]);
  await page.goto(`http://127.0.0.1:${serveur.address().port}/index.html`);
  await page.waitForFunction(() => typeof candles !== 'undefined' && candles.length > 100
    && (!document.documentElement.hasAttribute('data-structure-attendue') || document.documentElement.hasAttribute('data-structure-posee')), null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(500);
  return { ctx, page, erreurs, tactile };
}

/** L'état de la bulle : place, contenu, champs, résultats. */
const lire = page => page.evaluate(() => {
  const p = document.getElementById('fichePop'), r = p.getBoundingClientRect(), vis = el => el && el.getClientRects().length > 0;
  const champs = [...p.querySelectorAll('.calc input')].filter(i => !i.closest('[hidden]')).map(i => {
    const b = i.getBoundingClientRect(), s = getComputedStyle(i);
    return { id: i.id, type: i.type, mode: i.inputMode, auto: i.autocomplete, valeur: i.value, taille: parseFloat(s.fontSize), haut: b.height, bas: b.bottom, gauche: b.left, droite: b.right };
  });
  const res = p.querySelector('.calc-resultats'), rr = res ? res.getBoundingClientRect() : null;
  const lignes = [...p.querySelectorAll('.calc-table dt')].map(dt => [dt.textContent, dt.nextElementSibling ? dt.nextElementSibling.textContent : '']);
  const boutons = [...p.querySelectorAll('button')].filter(vis).map(b => { const q = b.getBoundingClientRect(); return { t: b.textContent.trim(), h: q.height, w: q.width, g: q.left, d: q.right }; });
  return { cache: p.hidden, ouverte: typeof ficheOuverte !== 'undefined' ? ficheOuverte : null, aria: p.getAttribute('aria-label'),
    tete: p.firstElementChild && p.firstElementChild.className, titre: (p.querySelector('.fiche-titre') || {}).textContent,
    focus: document.activeElement && document.activeElement.className, texte: p.innerText,
    phrase: (p.querySelector('.calc-volet:not([hidden]) .calc-question') || {}).textContent,
    resume: (p.querySelector('.calc-resume') || {}).textContent || null,
    onglets: [...p.querySelectorAll('.calc-onglet')].map(b => [b.textContent, b.getAttribute('aria-pressed')]),
    unites: [...p.querySelectorAll('.calc-unite')].map(b => [b.textContent, b.getAttribute('aria-pressed')]), pied: (p.querySelector('.fiche-pied') || {}).textContent,
    message: (p.querySelector('.calc-message') || {}).textContent || null, rappel: (p.querySelector('.calc-rappel') || {}).textContent || null,
    alerte: (p.querySelector('.calc-alerte') || {}).textContent || null,
    mesure: (p.querySelector('.calc-mesure') || {}).textContent || null,
    lignes, champs, boutons, resHaut: rr ? rr.top : null,
    boite: { g: r.left, d: r.right, h: r.top, b: r.bottom }, L: innerWidth, H: innerHeight,
    pageLarge: document.documentElement.scrollWidth - innerWidth, bulleLarge: p.scrollWidth - p.clientWidth,
    calc: window.__calculette || null };
});
/** Tape un texte dans un champ (comme au clavier : un événement « input » par caractère). */
async function taper(page, id, t) {
  await page.fill('#' + id, '');
  await page.type('#' + id, t);
}
const valeur = (e, nom) => (e.lignes.find(l => l[0] === nom) || [])[1];
/** Revue du 14/10 (N3) : la ligne mesurée, à l'écran. La bulle défile jusqu'en bas (au téléphone, la
 *  ligne est sous le pli) ; la ligne doit être sous le rappel (et sous l'alerte s'il y en a une), dans
 *  la bulle, visible une fois défilée, en --ink-2 (le jeton du thème), et ses morceaux liés (« (2019-2026) : »,
 *  « 7 jours, ») chacun sur une seule ligne. */
const lireMesure = page => page.evaluate(() => {
  const p = document.getElementById('fichePop'), m = p.querySelector('.calc-mesure');
  if (!m) return null;
  p.scrollTop = p.scrollHeight;
  const r = m.getBoundingClientRect(), b = p.getBoundingClientRect(), rap = p.querySelector('.calc-rappel'), al = p.querySelector('.calc-alerte');
  const sonde = document.createElement('span'); sonde.style.color = 'var(--ink-2)'; p.appendChild(sonde);
  const attendu = getComputedStyle(sonde).color; sonde.remove();
  const lies = [...m.querySelectorAll('.insec')].map(s => ({ t: s.textContent, lignes: s.getClientRects().length }));
  const res = { couleur: getComputedStyle(m).color, attendu, taille: parseFloat(getComputedStyle(m).fontSize),
    sousRappel: !!rap && r.top >= rap.getBoundingClientRect().bottom - 0.5, sousAlerte: !al || r.top >= al.getBoundingClientRect().bottom - 0.5,
    dernier: m === p.querySelector('.calc-resultats').lastElementChild,
    dedans: r.left >= b.left - 0.5 && r.right <= b.right + 0.5, visible: r.height > 0 && r.top >= b.top - 0.5 && r.bottom <= b.bottom + 0.5,
    lies };
  p.scrollTop = 0;
  return res;
});
const LIGNE_MESUREE = 'Mesuré sur BTC (2019-2026) : paliers au bas d’une fourchette de 7 jours, stop juste dessous. Tout s’est rempli puis le prix a touché le stop, 6 fois sur 10.';

(async () => {
  await new Promise(r => serveur.listen(0, '127.0.0.1', r));
  const nav = await playwright.chromium.launch();
  try {
    const CAS = [['bureau95', 390, 844, 'debutant'], ['aero', 390, 844, 'debutant'], ['bureau95-contraste', 390, 844, 'debutant'], ['gazette', 390, 844, 'expert'],
      ['neon', 390, 844, 'debutant'], ['diazo', 390, 844, 'expert'], ['bureau95', 1440, 900, 'expert'], ['aero', 1440, 900, 'debutant'], ['gazette', 1440, 900, 'debutant']];
    for (const [theme, w, h, mode] of CAS) {
      titre(`${theme}, ${w} px, ${mode === 'expert' ? 'Complet' : 'Lisible'}`);
      const o = await ouvrir(nav, theme, w, h, mode), page = o.page;
      const fautes = [];
      // 1. Rien sur l'écran de départ ; le bloc « Outils » du panneau.
      const depart = await page.evaluate(() => ({ calc: [...document.querySelectorAll('.calc, .aff-outils')].filter(el => el.getClientRects().length > 0).length,
        bouton: [...document.querySelectorAll('.header button, .header-right *')].some(b => /calculette/i.test(b.textContent || '')) }));
      check('rien de la calculette sur l’écran de départ ni dans l’en-tête', !depart.calc && !depart.bouton, depart);
      await page.click('#indDropdownBtn'); await page.waitForTimeout(200);
      const menu = await page.evaluate(() => {
        const m = document.getElementById('indMenu'), liste = m.querySelector('.ind-liste'), o = m.querySelector('.aff-outils'), b = o && o.querySelector('button');
        const rm = m.getBoundingClientRect(), rb = b && b.getBoundingClientRect();
        return { ouvert: m.classList.contains('open'), outils: !!o, avantFins: !!o && o.nextElementSibling === m.querySelector('details.aff-fins'),
          finsDernier: m.querySelector('details.aff-fins') === liste.lastElementChild, bouton: b && b.textContent.trim(), classe: b && b.className,
          dedans: !!rb && rb.left >= rm.left - 0.5 && rb.right <= rm.right + 0.5, haut: rb && rb.height, teteSans: !m.querySelector('.aff-boutons .aff-calculette'),
          pasLigne: !(o && o.closest('label[data-ind]')) && !(o && o.querySelector('[data-ind], .cat-title[data-cat]')) };
      });
      check('« Choisir l’affichage » : un bloc « Outils » juste avant les « Réglages fins », qui restent le dernier bloc ; un bouton « Calculette de risque » (ni ligne d’indicateur, ni bouton de tête)',
        menu.ouvert && menu.outils && menu.avantFins && menu.finsDernier && menu.bouton === 'Calculette de risque' && /\baff-btn\b/.test(menu.classe) && menu.teteSans && menu.pasLigne, menu);
      check('le bouton tient dans le panneau' + (o.tactile ? ', 40 px de haut au doigt' : ''), menu.dedans && (!o.tactile || menu.haut >= 40 - 0.5), menu);
      await page.evaluate(() => { window.__ecrit = []; });
      await page.click('#indMenu .aff-calculette'); await page.waitForTimeout(200);
      let e = await lire(page);
      const menuApres = await page.evaluate(() => ({ ouvert: document.getElementById('indMenu').classList.contains('open'), aria: document.getElementById('indDropdownBtn').getAttribute('aria-expanded') }));
      check('le bouton ferme le panneau (aria-expanded="false") et ouvre la calculette dans la bulle des légendes, sa tête d’abord', !menuApres.ouvert && menuApres.aria === 'false'
        && !e.cache && e.ouverte === 'calculette' && /fiche-tete/.test(e.tete) && e.titre === 'Calculette de risque' && e.aria === 'Calculette de risque', [menuApres, e.cache, e.ouverte, e.tete, e.titre, e.aria]);
      check('le focus est sur la croix, pas sur un champ (pas de clavier qui surgit)', /fiche-fermer/.test(e.focus || ''), e.focus);
      // 29/10 (A) : la question en tête, deux onglets, « Avant d'entrer » d'abord ; la perte en $.
      check('29/10 : deux onglets (« Avant d’entrer » pris), la question en tête, « Essayer un exemple », la perte en $ ; le pied « Un calcul, pas un conseil. »',
        e.phrase === 'Combien prendre à chaque palier pour ne pas perdre plus qu’une somme choisie au stop ?' && e.pied === 'Un calcul, pas un conseil.'
        && JSON.stringify(e.onglets) === JSON.stringify([['Avant d’entrer', 'true'], ['Position ouverte', 'false']]) && JSON.stringify(e.unites) === JSON.stringify([['$', 'true'], ['%', 'false']])
        && e.boutons.some(b => b.t === 'Essayer un exemple'), [e.phrase, e.pied, e.onglets, e.unites]);
      const noms = await page.evaluate(() => [...document.querySelectorAll('#fichePop .calc-nom, #fichePop .calc-legende')].map(l => l.textContent));
      check('revue du 14/10 : les noms disent les mots (« Perte acceptable (si le prix touche le stop) », « Capital ($) (facultatif) », « Stop (prix où la perte est coupée) », « Paliers (prix où un ordre attend) »)',
        noms.includes('Perte acceptable (si le prix touche le stop)') && noms.includes('Capital ($) (facultatif)') && noms.includes('Stop (prix où la perte est coupée)') && noms.includes('Paliers (prix où un ordre attend)'), noms);
      check('les champs visibles : perte, capital, stop, un palier, tous vides ; texte au clavier décimal, sans saisie automatique',
        JSON.stringify(e.champs.map(c => c.id)) === JSON.stringify(['calcPerte', 'calcCapital', 'calcStop', 'calcPalier0']) && e.champs.every(c => c.type === 'text' && c.mode === 'decimal' && c.auto === 'off')
        && e.champs.every(c => c.valeur === ''), e.champs);
      check('avant la saisie : une phrase d’attente, pas de calcul', e.message && /quand les champs sont remplis/.test(e.message) && !e.lignes.length, e.message);
      // Revue du 14/10 (N3) : la mesure ne s'affiche qu'avec un calcul, et ne remplit aucun champ.
      check('revue du 14/10 : avant la saisie, pas de ligne mesurée ; aucun champ prérempli', e.mesure === null && !/Mesuré/.test(e.texte), [e.mesure, e.champs.map(x => x.valeur)]);
      // 29/10 (B) : « % » choisi, le champ devient la part risquée (1 au départ), le capital n'est plus facultatif.
      await page.click('#fichePop .calc-unite[data-unite="%"]'); await page.waitForTimeout(60);
      e = await lire(page);
      const noms2 = await page.evaluate(() => [...document.querySelectorAll('#fichePop .calc-nom')].filter(l => !l.closest('[hidden]')).map(l => l.textContent));
      check('29/10 : « % » pris : « Part risquée (% du capital perdu au stop) » à 1, « Capital ($) » sans « facultatif », la bulle ouverte',
        !e.cache && JSON.stringify(e.unites) === JSON.stringify([['$', 'false'], ['%', 'true']]) && e.champs[0].valeur === '1' && noms2[0] === 'Part risquée (% du capital perdu au stop)' && noms2[1] === 'Capital ($)', [e.unites, e.champs.map(x => x.valeur), noms2]);
      // 2. La saisie : l'exemple du jour.
      await taper(page, 'calcCapital', '10 000');
      await taper(page, 'calcStop', '80 197');
      await taper(page, 'calcPalier0', '82 152');
      await page.click('#fichePop .calc-ajouter'); await page.waitForTimeout(80);
      e = await lire(page);
      check('« Ajouter un palier » : la bulle reste ouverte, une ligne de plus, le focus dans le nouveau champ, les valeurs gardées',
        !e.cache && e.ouverte === 'calculette' && e.champs.length === 5 && e.champs[3].valeur === '82 152' && await page.evaluate(() => document.activeElement && document.activeElement.id) === 'calcPalier1', [e.cache, e.ouverte, e.champs.map(c => c.valeur)]);
      await page.keyboard.type('81759');
      await page.click('#fichePop .calc-ajouter'); await page.waitForTimeout(80);
      await page.keyboard.type('81 365,0');
      await page.waitForTimeout(80);
      e = await lire(page);
      const c = e.calc || {};
      check('résultats en direct : 3 paliers, achat ; en tête « 0,02134 BTC à chaque palier (≈ 1 745 $). Tout rempli, si le prix touche 80 197 $ : perte de 100 $ (1 % du capital). » ; prix moyen 81 759 $, mise 5 235 $',
        c.ok && c.n === 3 && c.sens === 1 && Math.abs(c.quantite - 100 / 4685) < 1e-12 && Math.abs(c.perte - 100) < 1e-9
        && e.resume === '0,02134 BTC à chaque palier (≈ 1 745 $). Tout rempli, si le prix touche 80 197 $ : perte de 100 $ (1 % du capital).'
        && valeur(e, 'Sens') === 'achat (stop dessous)' && valeur(e, 'Prix moyen, tout rempli') === '81 759 $' && valeur(e, 'Mise, tout rempli') === '5 235 $ (52 % du capital)', [c, e.resume, e.lignes]);
      const ordre = await page.evaluate(() => { const r = document.querySelector('#fichePop .calc-resume'), t = document.querySelector('#fichePop .calc-table');
        return !!r && !!t && r.getBoundingClientRect().bottom <= t.getBoundingClientRect().top + 0.5 && parseFloat(getComputedStyle(r.querySelector('strong')).fontWeight) >= 600; });
      check('29/10 (C) : la phrase de tête au-dessus du détail, la quantité en gras', ordre);
      check('la ligne de rappel : « Le 1 % est la perte, pas la mise. Un trou de prix sous le stop coûterait plus. »', e.rappel === 'Le 1 % est la perte, pas la mise. Un trou de prix sous le stop coûterait plus.', e.rappel);
      // Revue du 14/10 (N3, vision-4) : avant, rien ne disait que cette perte « tout rempli » est l'issue
      // la plus fréquente de la méthode mesurée. La ligne dit sa source et sa condition.
      const me = await lireMesure(page);
      check('revue du 14/10 : sous le rappel, la ligne mesurée « Mesuré sur BTC (2019-2026) : paliers au bas d’une fourchette de 7 jours, stop juste dessous. Tout s’est rempli puis le prix a touché le stop, 6 fois sur 10. »',
        e.mesure === LIGNE_MESUREE && !!me && me.sousRappel && me.dernier, [e.mesure, me]);
      check('la ligne mesurée dans la bulle, visible une fois la bulle défilée, en --ink-2 (le jeton du thème) ; « (2019-2026) : » et « 7 jours, » chacun sur une seule ligne',
        !!me && me.dedans && me.visible && me.couleur === me.attendu && me.taille >= 11
        && ['(2019-2026) :', '7 jours,'].every(t => me.lies.some(x => x.t === t && x.lignes === 1)), me);
      // Revue du 14/10 (M1) : le stop redit avec son écart ; « 81759 » tapé sans espace, réécrit en quittant le champ.
      check('revue du 14/10 : « Stop 80 197 $ à 1,9 % sous le prix moyen » ; « 81759 » devenu « 81 759 » en quittant le champ ; pas d’alerte à 52 %',
        valeur(e, 'Stop') === '80 197 $ à 1,9 % sous le prix moyen' && e.champs[4].valeur === '81 759' && e.alerte === null, [valeur(e, 'Stop'), e.champs.map(x => x.valeur), e.alerte]);
      const dessous = e.champs.every(x => x.bas <= e.resHaut + 0.5);
      check('les champs en haut, les résultats dessous', dessous, [e.champs.map(x => x.bas), e.resHaut]);
      if (o.tactile) {
        const petits = e.champs.filter(x => x.taille < 16 || x.haut < 40 - 0.5), btn = e.boutons.filter(b => /Retirer|Ajouter/.test(b.t) && b.h < 40 - 0.5);
        check('au doigt : champs en 16 px et 40 px de haut (le téléphone ne zoome pas), boutons « Ajouter » / « Retirer » de 40 px', !petits.length && !btn.length, { petits, btn });
      }
      // La part choisie se lit dans le rappel ; retirer un palier ; un stop mélangé ; la vente.
      await taper(page, 'calcPerte', '0,5'); await page.waitForTimeout(60);
      e = await lire(page);
      check('part 0,5 : perte 50 $, la part dans le rappel (« Le 0,5 % est la perte… »)', /: perte de 50 \$ \(0,5 % du capital\)\.$/.test(e.resume || '') && /^Le 0,5 % est la perte, pas la mise\./.test(e.rappel || ''), [e.resume, e.rappel]);
      await page.click('#fichePop button[aria-label="Retirer le palier 3"]'); await page.waitForTimeout(80);
      e = await lire(page);
      check('« Retirer » : la bulle reste ouverte, deux paliers, le calcul refait', !e.cache && e.ouverte === 'calculette' && e.champs.length === 3 + 2 && e.calc && e.calc.n === 2
        && Math.abs(e.calc.quantite - 50 / (1955 + 1562)) < 1e-9, [e.cache, e.champs.map(x => x.valeur), e.calc]);
      await taper(page, 'calcStop', '82000'); await page.waitForTimeout(60);
      e = await lire(page);
      check('un stop entre les paliers : un message clair, pas de calcul', e.calc && !e.calc.ok && e.calc.code === 'melange' && /sous tous les paliers \(achat\) ou au-dessus de tous \(vente\)/.test(e.message || '') && !e.lignes.length, [e.message, e.lignes]);
      await taper(page, 'calcStop', '83 000'); await page.waitForTimeout(60);
      e = await lire(page);
      check('un stop au-dessus de tous les paliers : vente, « au-dessus du stop » dans le rappel', e.calc && e.calc.ok && e.calc.sens === -1 && valeur(e, 'Sens') === 'vente (stop au-dessus)' && /au-dessus du stop coûterait plus\.$/.test(e.rappel || ''), [e.lignes, e.rappel]);
      check('revue du 14/10 : en vente, pas de ligne mesurée (la mesure ne porte que sur des achats)', e.mesure === null, e.mesure);
      // 6. Revue du 14/10 (C5, M1) : au pavé numérique, « 81700 » sans espace ; Entrée passe au champ
      // suivant et le stop devient « 81 700 ». Paliers 82 152 et 81 759, 0,5 % : mise de 160 % du
      // capital, dite par une ligne d'alerte sous la table (couleur --warn-ink, le jeton du thème).
      await taper(page, 'calcStop', '81700'); await page.keyboard.press('Enter'); await page.waitForTimeout(80);
      e = await lire(page);
      const al = await page.evaluate(() => {
        const a = document.querySelector('#fichePop .calc-alerte'), t = document.querySelector('#fichePop .calc-table');
        if (!a || !t) return null;
        const sonde = document.createElement('span'); sonde.style.color = 'var(--warn-ink)'; document.getElementById('fichePop').appendChild(sonde);
        const attendu = getComputedStyle(sonde).color; sonde.remove();
        return { couleur: getComputedStyle(a).color, attendu, sousTable: a.getBoundingClientRect().top >= t.getBoundingClientRect().bottom - 0.5, visible: a.getClientRects().length > 0 };
      });
      check('revue du 14/10 : le stop tapé « 81700 » est réécrit « 81 700 » en quittant le champ, et redit dans le résultat',
        (e.champs.find(x => x.id === 'calcStop') || {}).valeur === '81 700' && /^81 700 \$ à 0,3 % sous le prix moyen$/.test(valeur(e, 'Stop') || ''), [e.champs.map(x => x.valeur), valeur(e, 'Stop')]);
      check('revue du 14/10 : mise de 160 % du capital → « La mise dépasse le capital (× 1,6). Tout remplir demande d’emprunter (effet de levier). », sous la table, en couleur d’alerte',
        e.calc && e.calc.ok && e.calc.partMise > 1 && valeur(e, 'Mise, tout rempli') === '16 038 $ (160 % du capital)'
        && e.alerte === 'La mise dépasse le capital (× 1,6). Tout remplir demande d’emprunter (effet de levier).' && al && al.visible && al.sousTable && al.couleur === al.attendu, [valeur(e, 'Mise, tout rempli'), e.alerte, al]);
      const me2 = await lireMesure(page);
      check('revue du 14/10 : de nouveau en achat, la ligne mesurée revient, sous l’alerte et le rappel, en dernier', e.mesure === LIGNE_MESUREE && !!me2 && me2.sousAlerte && me2.sousRappel && me2.dernier && me2.visible, [e.mesure, me2]);
      // 4. Écran et mots, panneau rempli (avec la ligne d'alerte).
      const dansEcran = e.boite.g >= -0.5 && e.boite.d <= e.L + 0.5 && e.boite.h >= -0.5 && e.boite.b <= e.H + 0.5;
      const hors = e.champs.concat(e.boutons.map(b => ({ id: b.t, gauche: b.g, droite: b.d }))).filter(x => x.gauche < e.boite.g - 0.5 || x.droite > e.boite.d + 0.5).map(x => x.id);
      check('la bulle dans l’écran, aucun défilement de côté (page ni bulle), champs et boutons dans la bulle', dansEcran && e.pageLarge <= 0 && e.bulleLarge <= 1 && !hors.length, { boite: e.boite, L: e.L, H: e.H, page: e.pageLarge, bulle: e.bulleLarge, hors });
      const bannis = Guide.motsBannis(e.texte), conseil = e.texte.match(CONSEIL);
      check('aucun mot interdit du Lisible (ni « ratio »), aucun conseil, dans toute la bulle', !bannis.length && !conseil && !/ratio/i.test(e.texte), { bannis, conseil: conseil && conseil[0] });
      // 3. Sans mémoire.
      const ecrit = await page.evaluate(() => window.__ecrit);
      const suspects = ecrit.filter(x => x.session || /calc|risque|palier/i.test(x.k) || /80 ?197|82 ?152|81 ?759|83 ?000/.test(x.v));
      check('rien n’est écrit dans le stockage par la calculette (ni local ni session)', !suspects.length, suspects);
      const stock = await page.evaluate(() => ({ local: JSON.stringify(Object.assign({}, localStorage)), session: sessionStorage.length }));
      check('aucune valeur de la calculette dans le stockage', !/80 ?197|82 ?152|calcul/i.test(stock.local) && stock.session === 0, stock);
      await page.click('#fichePop .fiche-fermer'); await page.waitForTimeout(80);
      const ferme = await page.evaluate(() => ({ cache: document.getElementById('fichePop').hidden, aria: document.getElementById('fichePop').getAttribute('aria-label'), focus: document.activeElement && document.activeElement.id }));
      check('× ferme la bulle ; le focus revient au bouton « Choisir l’affichage »', ferme.cache && ferme.aria === 'Légende' && ferme.focus === 'indDropdownBtn', ferme);
      await page.click('#indDropdownBtn'); await page.waitForTimeout(150);
      await page.click('#indMenu .aff-calculette'); await page.waitForTimeout(120);
      e = await lire(page);
      check('rouverte : les champs sont vides, la perte revient en $, un seul palier — sans mémoire',
        !e.cache && e.champs.length === 4 && e.champs.every(x => x.valeur === '') && e.unites[0][1] === 'true', e.champs.map(x => x.valeur));
      // 8. 29/10 : « Essayer un exemple » (A), la perte en $ sans capital (B), la position ouverte (D).
      await page.click('#fichePop .calc-exemple'); await page.waitForTimeout(80);
      e = await lire(page);
      check('29/10 (A) : « Essayer un exemple » remplit les champs autour du prix du moment (86 012,5) : perte 100, capital 10 000, stop 80 900, paliers 84 300 / 83 400 / 82 600 ; la bulle reste ouverte, le calcul se fait',
        !e.cache && e.ouverte === 'calculette' && e.champs.map(x => x.valeur).join(' | ') === '100 | 10 000 | 80 900 | 84 300 | 83 400 | 82 600' && e.calc && e.calc.ok && e.calc.n === 3
        && /^0,01315 BTC à chaque palier/.test(e.resume || ''), [e.cache, e.champs.map(x => x.valeur), e.resume]);
      await taper(page, 'calcCapital', ''); await taper(page, 'calcPerte', '1 500'); await taper(page, 'calcStop', '67 000');
      await page.click('#fichePop button[aria-label="Retirer le palier 3"]'); await page.click('#fichePop button[aria-label="Retirer le palier 2"]'); await page.waitForTimeout(60);
      await taper(page, 'calcPalier0', '84 300'); await page.waitForTimeout(60);
      e = await lire(page);
      check('29/10 (B) : perte 1 500 $ sans capital, stop 67 000, un palier à 84 300 → « 0,0867 BTC (≈ 7 309 $). Si le prix touche 67 000 $ : perte de 1 500 $. »',
        e.calc && e.calc.ok && e.calc.capital === null && e.resume === '0,0867 BTC (≈ 7 309 $). Si le prix touche 67 000 $ : perte de 1 500 $.' && e.rappel === 'Ces 1 500 $ sont la perte, pas la mise. Un trou de prix sous le stop coûterait plus.', [e.resume, e.rappel]);
      await page.click('#fichePop .calc-onglet[data-onglet="ouverte"]'); await page.waitForTimeout(60);
      e = await lire(page);
      check('29/10 (D) : « Position ouverte » pris : sa question, quantité / prix moyen / stop (ou liquidation) / capital, vides ; la bulle reste ouverte',
        !e.cache && e.phrase === 'Que coûte une position déjà ouverte si le prix touche le stop ?' && e.onglets[1][1] === 'true'
        && JSON.stringify(e.champs.map(x => x.id)) === JSON.stringify(['calcQuantite', 'calcEntree', 'calcStopPosition', 'calcCapitalPosition']) && e.champs.every(x => x.valeur === '') && /quand les champs sont remplis/.test(e.message || ''), [e.phrase, e.onglets, e.champs]);
      await taper(page, 'calcQuantite', '0,28'); await page.keyboard.press('Enter');
      await page.keyboard.type('84300'); await page.keyboard.press('Enter');
      await page.keyboard.type('67000'); await page.keyboard.press('Enter'); await page.waitForTimeout(80);
      e = await lire(page);
      const focusPos = await page.evaluate(() => document.activeElement && document.activeElement.id);
      check('Entrée passe au champ suivant de l’onglet ouvert (jusqu’au capital) ; « 84300 » réécrit « 84 300 »',
        focusPos === 'calcCapitalPosition' && e.champs[1].valeur === '84 300' && e.champs[2].valeur === '67 000', [focusPos, e.champs.map(x => x.valeur)]);
      check('29/10 (D) : 0,28 BTC à 84 300, stop 67 000 → « Si le prix touche 67 000 $ : perte de 4 844 $. Compté depuis le prix moyen. » ; au prix du moment (86 012,5) +480 $, puis −5 324 $ jusqu’au stop',
        e.calc && e.calc.ok && Math.abs(e.calc.auStop + 4844) < 1e-6 && e.resume === 'Si le prix touche 67 000 $ : perte de 4 844 $. Compté depuis le prix moyen.'
        && /^\+480 \$/.test(valeur(e, 'Au prix du moment') || '') && /^−5 324 \$/.test(valeur(e, 'Du prix du moment au stop') || '')
        && e.rappel === 'Frais et financement non comptés. Un trou de prix sous le stop coûterait plus.' && e.mesure === null, [e.resume, e.lignes, e.rappel]);
      await page.click('#fichePop .calc-onglet[data-onglet="avant"]'); await page.waitForTimeout(60);
      e = await lire(page);
      check('de retour sur « Avant d’entrer » : ce qui était tapé est toujours là, et son calcul', e.champs.map(x => x.valeur).join(' | ') === '1 500 |  | 67 000 | 84 300' && /^0,0867 BTC/.test(e.resume || ''), [e.champs.map(x => x.valeur), e.resume]);
      const bannis2 = Guide.motsBannis(e.texte), conseil2 = e.texte.match(CONSEIL);
      check('29/10 : aucun mot interdit du Lisible, aucun conseil, aucun défilement de côté', !bannis2.length && !conseil2 && e.pageLarge <= 0 && e.bulleLarge <= 1, { bannis2, conseil2: conseil2 && conseil2[0] });
      await page.keyboard.press('Escape'); await page.waitForTimeout(60);
      check('Échap ferme la bulle', await page.evaluate(() => document.getElementById('fichePop').hidden));
      // 5. Le glossaire : un titre touché ouvre sa fiche, qui reste ouverte.
      if (theme === 'bureau95' || theme === 'aero') {
        await page.evaluate(() => ouvrirGlossaire(document.getElementById('legendesBtn')));
        await page.click('#fichePop .glossaire-item'); await page.waitForTimeout(120);
        const g = await page.evaluate(() => ({ cache: document.getElementById('fichePop').hidden, ouverte: ficheOuverte }));
        check('Légendes : un titre touché ouvre sa fiche, qui reste ouverte (le clic n’est plus pris pour un clic dehors)', !g.cache && g.ouverte && g.ouverte !== 'glossaire', g);
        await page.mouse.click(5, Math.round((await page.evaluate(() => innerHeight)) / 2)); await page.waitForTimeout(80);
        check('un clic dehors la ferme toujours', await page.evaluate(() => document.getElementById('fichePop').hidden));
      }
      check('aucune erreur JavaScript', !o.erreurs.length, o.erreurs);
      if (process.env.CAPTURES) {
        await page.click('#indDropdownBtn'); await page.waitForTimeout(150);
        await page.click('#indMenu .aff-calculette'); await page.waitForTimeout(120);
        await page.screenshot({ path: path.join(process.env.CAPTURES, `calc-${theme}-${w}-ouverture.png`) });
        await page.click('#fichePop .calc-exemple'); await page.waitForTimeout(100);
        await page.screenshot({ path: path.join(process.env.CAPTURES, `calc-${theme}-${w}-exemple.png`) });
        await page.click('#fichePop .calc-onglet[data-onglet="ouverte"]');
        await taper(page, 'calcQuantite', '0,28'); await taper(page, 'calcEntree', '84 300'); await taper(page, 'calcStopPosition', '67 000');
        await page.evaluate(() => document.activeElement.blur()); await page.waitForTimeout(100);
        await page.screenshot({ path: path.join(process.env.CAPTURES, `calc-${theme}-${w}-position.png`) });
      }
      void fautes;
      await o.ctx.close();
    }
  } finally { await nav.close(); serveur.close(); }
  console.log(ko ? `\n❌ CALCULETTE À L’ÉCRAN : ${ko} contrôle(s) en échec` : '\n✅ CALCULETTE À L’ÉCRAN : TOUS LES CONTRÔLES PASSENT');
  process.exit(ko ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
