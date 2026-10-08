// Le thème « Gare » (themes/gare.css, structure « tableau » de js/structures.js), vérifié dans un
// vrai navigateur (Chromium, Playwright). tests/test_structures.js contrôle déjà ce que toute
// structure doit tenir (valeurs visibles, réversibilité, décor muet) ; ici, ce qui est PROPRE au
// tableau d'affichage et qu'aucun autre contrôle ne verrait casser :
//   1. PALETTES : chaque caractère d'une palette occupe exactement 1ch (chasse fixe, glyphe présent
//      dans la police servie — « long γ » compris) : sinon les tuiles du fond, posées tous les 1ch,
//      glissent sous le texte ;
//   2. PROVENANCE : les cadences affichées par le décor sont LUES dans CADENCES (on change la
//      table, l'étiquette suit) ;
//   3. REMARQUE D'ÂGE : « À l'heure » sous le seuil de la page, « Retard » au-delà
//      (CADENCES.vieux_min, classe posée par la base), rien quand l'âge est inconnu ;
//   4. CHUTES liées à l'ÉVÉNEMENT : une publication nouvelle fait tomber le tableau ; la même
//      publication réécrite (chaque minute) ne fait rien tomber ; l'âge seul tombe quand ses minutes
//      changent ; le prix, au plus une fois par CHUTE_PRIX_MS ; coupées sous prefers-reduced-motion ;
//   5. DÉMONTAGE : quitter le thème débranche les observateurs (leur nombre revient à l'identique)
//      et ne laisse aucune classe du thème sur un vrai nœud ;
//   6. DISPOSITION : tableau des départs SOUS le graphique seulement sur un écran haut et large
//      (le graphique y garde sa hauteur) ; au téléphone, le prix n'est recouvert par aucun bouton.
//
// Sans Playwright : « non exécuté », dit à l'écran (ce n'est pas un succès).
// USAGE   node tests/test_gare.js
const fs = require('fs'), path = require('path'), http = require('http');
const REPO = path.resolve(__dirname, '..');
const THEME = 'gare';

let playwright = null;
for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright', process.env.PLAYWRIGHT_MODULE].filter(Boolean)) {
  try { playwright = require(p); break; } catch (e) { /* suivant */ }
}
if (!playwright) {
  console.log('  − NON EXÉCUTÉ : Playwright introuvable — le thème Gare n\'est pas vérifié sur ce poste.');
  process.exit(0);
}
let ko = 0;
const check = (nom, ok, det) => { if (!ok) ko++; console.log(`  ${ok ? '✓' : '✗'} ${nom}${!ok && det !== undefined ? ' — ' + JSON.stringify(det).slice(0, 500) : ''}`); };
const titre = t => console.log(`\n── ${t} ──`);

const index = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8');
const BASE = [...index.matchAll(/<link\b[^>]*data-theme-id="([^"]+)"[^>]*>/g)][0][1];

// Binance simulé : bougies déterministes, prix fixe (seul le test le fait changer).
function binance(url) {
  const u = new URL(url), q = u.searchParams, now = Date.now();
  if (u.pathname.endsWith('/klines')) {
    const pas = { '1m': 6e4, '5m': 3e5, '15m': 9e5, '1h': 36e5, '4h': 144e5, '1d': 864e5, '1w': 6048e5 }[q.get('interval')] || 9e5;
    const n = Math.min(1000, +q.get('limit') || 500), fin = q.get('endTime') ? Math.min(+q.get('endTime'), now) : now;
    return Array.from({ length: n }, (_, i) => { const t = Math.floor((fin - (n - 1 - i) * pas) / pas) * pas, c = 86000 + Math.sin(i / 7) * 300;
      return [t, String(c - 20), String(c + 60), String(c - 60), String(c), '80', t + pas - 1, String(80 * c), 50, '40', String(40 * c), '0']; });
  }
  if (u.pathname.endsWith('/ticker/price')) return { price: '86012.5' };
  if (u.pathname.endsWith('/ticker/24hr')) return { lastPrice: '86012.5', openPrice: '85700', priceChangePercent: '0.4', highPrice: '87000', lowPrice: '85000', bidPrice: '86012.4', askPrice: '86012.6', quoteVolume: '1e9', count: '100' };
  return {};
}
// La publication servie : celle du dépôt, datée d’il y a 4 min (« à l’heure » ; l’âge arrondi reste
// « 4 min » pendant près de 30 s).
function publication() {
  const d = JSON.parse(fs.readFileSync(path.join(REPO, 'market-data.json'), 'utf8'));
  d.updated = new Date(Date.now() - 242000).toISOString();
  return JSON.stringify(d);
}
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2' };
const serveur = http.createServer((req, res) => {
  const f = path.join(REPO, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(REPO) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

async function ouvrir(nav, vue, options) {
  const ctx = await nav.newContext(Object.assign({ viewport: vue, deviceScaleFactor: 1 }, options || {}));
  const page = await ctx.newPage();
  const erreurs = [];
  page.on('pageerror', e => erreurs.push(e.message));
  await page.route('**/*', r => {
    const u = r.request().url(), h = new URL(u).host, cors = { 'access-control-allow-origin': '*' };
    if (h.startsWith('127.0.0.1')) return r.continue();
    if (h === 'data-api.binance.vision') return r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(binance(u)) });
    if (h === 'raw.githubusercontent.com') return r.fulfill({ status: 200, contentType: 'application/json', headers: cors,
      body: u.includes('heatmap') ? fs.readFileSync(path.join(REPO, 'heatmap.json')) : publication() });
    return r.abort();
  });
  await page.addInitScript(t => { try { localStorage.clear(); localStorage.setItem('samsara-theme', t); } catch (e) { /* */ } }, THEME);
  // Observateurs BRANCHÉS (observe sans disconnect) créés par js/structures.js, comptés pour le
  // contrôle du démontage. Les autres ne comptent pas : le verre d'Aero (hyalite) a les siens.
  await page.addInitScript(() => {
    const MO = window.MutationObserver, actifs = new Set();
    window.__observateurs = () => actifs.size;
    window.MutationObserver = class extends MO {
      constructor(f) { super(f); this.__structure = /\/js\/structures\.js/.test(new Error().stack || ''); }
      observe(...a) { if (this.__structure) actifs.add(this); return super.observe(...a); }
      disconnect() { actifs.delete(this); return super.disconnect(); }
    };
  });
  await page.goto(`http://127.0.0.1:${serveur.address().port}/index.html`);
  await page.waitForTimeout(2200);
  return { ctx, page, erreurs };
}

// Dans la page : laisser passer les observateurs (microtâches) puis une image.
const SOUFFLE = 'new Promise(r => setTimeout(() => requestAnimationFrame(() => r()), 0))';

(async () => {
  await new Promise(r => serveur.listen(0, '127.0.0.1', r));
  const nav = await playwright.chromium.launch();
  try {
    const o = await ouvrir(nav, { width: 1440, height: 900 });
    const p = o.page;
    check('structure « tableau » posée', await p.evaluate(() => document.documentElement.getAttribute('data-structure')) === 'tableau');

    titre('1. Palettes : un caractère = 1ch, pour chaque valeur affichée');
    await p.evaluate(() => document.fonts.ready);
    const palettes = await p.evaluate(() => {
      const els = [document.getElementById('price'), document.getElementById('var24'), document.getElementById('updated'),
        document.getElementById('taskbarClock'), ...document.querySelectorAll('#cycle .kpi:not([hidden]) b, #cycle .kpi-age')];
      return els.filter(Boolean).map(el => {
        const cs = getComputedStyle(el), cv = document.createElement('canvas').getContext('2d');
        cv.font = cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
        const ch = cv.measureText('0').width;
        // Largeur du TEXTE seul (les ::before ne sont pas dans le DOM).
        const texte = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('');
        const r = document.createRange(); r.selectNodeContents(el);
        const larg = [...el.childNodes].filter(n => n.nodeType === 3).reduce((s, n) => { r.selectNodeContents(n); return s + r.getBoundingClientRect().width; }, 0);
        const famille = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim();
        return { id: el.id || el.className || el.tagName, texte, n: [...texte].length, larg: +larg.toFixed(2), ch: +ch.toFixed(3),
          ecart: +Math.abs(larg - [...texte].length * ch).toFixed(2), chargee: document.fonts.check(cs.fontSize + ' "' + famille + '"', texte),
          ls: cs.letterSpacing };
      });
    });
    check(`${palettes.length} palettes, police chargée et sans letter-spacing`, palettes.length >= 8 && palettes.every(x => x.chargee && (x.ls === 'normal' || x.ls === '0px')),
      palettes.filter(x => !x.chargee || (x.ls !== 'normal' && x.ls !== '0px')));
    const fautives = palettes.filter(x => x.n && x.ecart > 0.6);
    check('chaque palette mesure n × 1ch (à 0,6 px près) : aucun glyphe d\'une autre chasse', !fautives.length, fautives);
    check('le GEX « long γ » / « short γ » est sur palettes (γ présent dans la police servie)',
      palettes.some(x => /γ/.test(x.texte) && x.ecart <= 0.6), palettes.filter(x => /γ/.test(x.texte)));

    titre('2. Provenance : cadences lues dans CADENCES');
    const prov = await p.evaluate(base => {
      const lire = () => [...document.querySelectorAll('.gare-provenance')].map(e => e.textContent);
      const avant = lire(), attendu = ['Provenance serveur · ' + CADENCES.attendue_min + ' min', 'Binance · ' + CADENCES.prix / 1000 + ' s'];
      const sauve = { a: CADENCES.attendue_min, p: CADENCES.prix };
      CADENCES.attendue_min = 37; CADENCES.prix = 3000;
      appliquerTheme(base); appliquerTheme('gare');
      const change = lire();
      CADENCES.attendue_min = sauve.a; CADENCES.prix = sauve.p;
      appliquerTheme(base); appliquerTheme('gare');
      return { avant, attendu, change };
    }, BASE);
    check('les deux étiquettes de provenance disent les cadences de CADENCES', prov.attendu.every(t => prov.avant.includes(t)), prov);
    check('CADENCES changée → l\'étiquette suit (37 min, 3 s) : aucune cadence recopiée', prov.change.includes('Provenance serveur · 37 min') && prov.change.includes('Binance · 3 s'), prov.change);

    titre('3. Remarque d\'âge : « À l\'heure », « Retard », rien si l\'âge est inconnu');
    const remarque = await p.evaluate(async souffle => {
      const lire = () => { const a = document.querySelector('#cycle .kpi-age'); return { texte: a.textContent, avant: getComputedStyle(a, '::before').content, vieux: document.getElementById('cycle').classList.contains('vieux') }; };
      const garde = marketData.updated, r = {};
      r.frais = lire();
      marketData.updated = new Date(Date.now() - (CADENCES.vieux_min + 5) * 60000).toISOString(); renderFeed(); await eval(souffle);
      r.retard = lire();
      delete marketData.updated; renderFeed(); await eval(souffle);
      r.inconnu = lire();
      marketData.updated = garde; renderFeed(); await eval(souffle);
      r.retour = lire();
      return r;
    }, SOUFFLE);
    check('publication de 4 min : « À l’heure · 4 min »', /À l’heure/.test(remarque.frais.avant) && !remarque.frais.vieux && /^4 min$/.test(remarque.frais.texte), remarque.frais);
    check(`au-delà de CADENCES.vieux_min : « Retard », minutes affichées`, /Retard/.test(remarque.retard.avant) && remarque.retard.vieux && /\d+ min/.test(remarque.retard.texte), remarque.retard);
    check('âge inconnu (« — ») : aucune remarque — « À l’heure » serait faux', remarque.inconnu.texte === '—' && remarque.inconnu.avant === 'none', remarque.inconnu);
    check('retour à la publication : « À l’heure » de nouveau', /À l’heure/.test(remarque.retour.avant), remarque.retour);

    titre('4. Chutes : à l\'événement seulement');
    const chutes = await p.evaluate(async souffle => {
      const tab = document.querySelector('.gare-tableau'), hp = document.querySelector('.hero-prix'), prix = document.getElementById('price');
      const age = () => document.querySelector('#cycle .kpi-age');
      const r = {};
      // Les volets posés pendant ce contrôle, comptés à la source : chaque passage de la classe
      // d'absente à présente. Rejouer l'animation retire puis remet la classe : deux
      // enregistrements pour UN volet ; la valeur qui suit un enregistrement est l'ancienne valeur
      // du suivant (même nœud), ou la valeur actuelle.
      let poses = [];
      const a = v => (v || '').split(' ').includes('gare-chute');
      const compte = new MutationObserver(ms => ms.forEach((m, i) => {
        const suite = ms.slice(i + 1).find(x => x.target === m.target);
        if (!a(m.oldValue) && (suite ? a(suite.oldValue) : m.target.classList.contains('gare-chute'))) poses.push(m.target.className.split(' ')[0]);
      }));
      compte.observe(document.body, { attributes: true, attributeFilter: ['class'], attributeOldValue: true, subtree: true });
      const attendre = ms => new Promise(res => setTimeout(res, ms));
      await attendre(CHUTE_RETRAIT_MS + 100); poses = [];
      // a) même publication réécrite (le cas de chaque minute) : rien ne tombe
      renderFeed(); await eval(souffle);
      r.meme = poses.slice(); poses = [];
      // b) publication nouvelle (autre heure) : le tableau tombe — chiffres clés, âge, heure
      const garde = marketData.updated;
      marketData.updated = new Date(Date.parse(garde) - 15 * 60000).toISOString(); renderFeed(); await eval(souffle);
      r.nouvelle = poses.slice(); poses = [];
      r.anim = ['#updated', '#cycle .kpi b', '#cycle .kpi-age'].map(s => getComputedStyle(document.querySelector(s), '::after').animationName);
      await attendre(CHUTE_RETRAIT_MS + 100);
      r.retiree = !tab.classList.contains('gare-chute');
      marketData.updated = garde; renderFeed(); await eval(souffle); poses = [];
      // c) l'âge seul : une minute de plus, même heure de publication
      const vrai = Date.now; Date.now = () => vrai() + 60000;
      try { renderFeed(); await eval(souffle); } finally { Date.now = vrai; }
      r.age = poses.slice(); poses = [];
      r.ageAnim = getComputedStyle(age(), '::after').animationName;
      renderFeed(); await eval(souffle); poses = [];
      // d) le prix : une chute, puis plus rien avant CHUTE_PRIX_MS (fetchPrice le réécrit chaque seconde)
      await attendre(CHUTE_PRIX_MS + 100); poses = [];
      prix.textContent = '$86,100.00'; await eval(souffle);
      prix.textContent = '$86,101.00'; await eval(souffle);
      prix.textContent = '$86,102.00'; await eval(souffle);
      r.prix = poses.slice(); poses = [];
      r.prixAnim = getComputedStyle(prix, '::after').animationName;
      compte.disconnect();
      r.pasDeBoucle = document.getAnimations().filter(a => a.effect && a.effect.getTiming().iterations === Infinity).length;
      return r;
    }, SOUFFLE);
    check('même publication réécrite (chaque minute) : aucune chute', !chutes.meme.length, chutes.meme);
    check('publication nouvelle : le tableau tombe, une fois (chiffres clés, âge, heure)', chutes.nouvelle.length === 1 && chutes.nouvelle[0] === 'gare-tableau'
      && chutes.anim.every(a => a === 'gare-chute'), chutes);
    check('le volet est retiré après son passage (CHUTE_RETRAIT_MS)', chutes.retiree);
    check('une minute d\'âge de plus, même publication : l\'âge seul tombe', chutes.age.length === 1 && chutes.age[0] === 'kpi-age' && chutes.ageAnim === 'gare-chute', chutes);
    check('prix : trois changements en un instant → une seule chute (au plus une par CHUTE_PRIX_MS)', chutes.prix.length === 1 && chutes.prix[0] === 'hero-prix' && chutes.prixAnim === 'gare-chute', chutes);
    check('aucune animation infinie dans la page', chutes.pasDeBoucle === 0, chutes.pasDeBoucle);

    titre('5. Démontage : observateurs débranchés, aucune classe laissée');
    const dem = await p.evaluate(async ([base, souffle]) => {
      appliquerTheme(base); await eval(souffle);
      const sans = window.__observateurs();
      appliquerTheme('gare'); await eval(souffle);
      const avec = window.__observateurs();
      appliquerTheme(base); await eval(souffle);
      const apres = window.__observateurs();
      // Événements après le démontage : rien ne doit plus réagir.
      document.getElementById('price').textContent = '$1.00';
      marketData.updated = new Date(Date.parse(marketData.updated) - 30 * 60000).toISOString(); renderFeed(); await eval(souffle);
      const restes = [...document.querySelectorAll('.gare-chute, .gare-inconnu, [class*="gare-"]')].map(e => e.className);
      return { sans, avec, apres, restes };
    }, [BASE, SOUFFLE]);
    check(`gare branche ses observateurs (${dem.avec - dem.sans}) et les débranche tous au démontage`, dem.avec > dem.sans && dem.apres === dem.sans, dem);
    check('après démontage, un événement ne pose aucune classe du thème', !dem.restes.length, dem.restes);
    check('aucune erreur JavaScript', !o.erreurs.length, o.erreurs);
    await o.ctx.close();

    titre('6. Mouvement réduit, disposition');
    const rm = await ouvrir(nav, { width: 1440, height: 900 }, { reducedMotion: 'reduce' });
    const reduit = await rm.page.evaluate(async souffle => {
      const tab = document.querySelector('.gare-tableau');
      // Une publication nouvelle : la structure ne pose pas la classe…
      marketData.updated = new Date(Date.parse(marketData.updated) - 15 * 60000).toISOString(); renderFeed(); await eval(souffle);
      const pose = tab.classList.contains('gare-chute');
      // … et la feuille ne dessinerait pas le volet si elle l'était.
      tab.classList.add('gare-chute'); await eval(souffle);
      const cs = getComputedStyle(document.getElementById('updated'), '::after');
      return { pose, display: cs.display, anim: cs.animationName };
    }, SOUFFLE);
    check('prefers-reduced-motion : aucune chute posée à une publication nouvelle', !reduit.pose, reduit);
    check('prefers-reduced-motion : la feuille ne dessine ni n\'anime le volet', reduit.display === 'none' && reduit.anim === 'none', reduit);
    await rm.ctx.close();

    const dispo = async vue => {
      const x = await ouvrir(nav, vue);
      await x.page.keyboard.press('f'); await x.page.waitForTimeout(900);
      const r = await x.page.evaluate(() => {
        const rect = s => { const b = document.querySelector(s).getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom, h: b.height }; };
        return { sens: getComputedStyle(document.querySelector('.main-area')).flexDirection, feed: getComputedStyle(document.getElementById('feed')).flexDirection,
          chart: rect('#chart'), panneau: rect('#feedPanel') };
      });
      await x.ctx.close();
      return r;
    };
    const haut = await dispo({ width: 1920, height: 1080 }), large = await dispo({ width: 1440, height: 900 });
    check('1920 × 1080 : tableau des départs SOUS le graphique, cartes en rangée', haut.sens === 'column' && haut.feed === 'row' && haut.panneau.t >= haut.chart.b, haut);
    check('1920 × 1080 : le graphique garde au moins 400 px de haut sous le tableau des départs', haut.chart.h >= 400, haut.chart);
    check('1440 × 900 : panneau latéral (la colonne écraserait le graphique)', large.sens === 'row' && large.panneau.l >= large.chart.r, large);

    const tel = await ouvrir(nav, { width: 390, height: 800 });
    const tete = await tel.page.evaluate(() => {
      const r = el => el.getBoundingClientRect(), p = r(document.getElementById('price'));
      const boutons = [...document.querySelectorAll('.header-right > *')].filter(b => getComputedStyle(b).display !== 'none').map(b => ({ id: b.id || b.className, r: r(b) }));
      const recouvre = boutons.filter(b => b.r.left < p.right && b.r.right > p.left && b.r.top < p.bottom && b.r.bottom > p.top).map(b => b.id);
      const v = document.getElementById('var24'), rv = r(v);
      return { prix: { l: p.left, r: p.right }, recouvre, dansEcran: p.left >= 0 && p.right <= innerWidth, var24: rv.width > 0 && getComputedStyle(v).display !== 'none' && rv.right <= innerWidth,
        kpis: document.querySelectorAll('#cycle .kpi:not([hidden])').length, age: r(document.querySelector('#cycle .kpi-age')).width > 0 };
    });
    check('390 × 800 : aucun bouton ne recouvre le prix, le prix tient dans l\'écran', !tete.recouvre.length && tete.dansEcran, tete);
    check('390 × 800 : variation 24 h affichée (la base la masque faute de place)', tete.var24, tete);
    check('390 × 800 : chiffres clés et leur âge dans le tableau', tete.kpis >= 3 && tete.age, tete);
    await tel.ctx.close();
  } finally { await nav.close(); serveur.close(); }
  console.log(ko ? `\n❌ GARE : ${ko} contrôle(s) en échec` : '\n✅ GARE : TOUS LES CONTRÔLES PASSENT');
  process.exit(ko ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
