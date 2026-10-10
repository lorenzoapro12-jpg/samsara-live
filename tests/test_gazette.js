// La structure « une » (thème Gazette, js/structures.js), vérifiée dans un vrai navigateur.
//
// Ce que les contrôles communs (tests/test_structures.js) ne voient pas :
//   1. LA MANCHETTE RECOPIE LA COTE : chaque valeur qu'elle cite est, au caractère près, le texte
//      affiché d'un chiffre clé de #cycle (ou l'heure de #updated) ; aucun nombre ailleurs ; son
//      seul mot choisi, le verbe, suit la règle du premier caractère (+ progresse, − recule, sinon
//      stable) ; une valeur « — » est omise ; aucune tournure de conseil ;
//   2. LE TAMPON « Dernière heure » ne s'allume qu'à une édition NOUVELLE (ni au premier rendu, ni
//      à la réécriture de chaque minute) et s'éteint à CADENCES.publication_lue ; « Édition
//      périmée » s'affiche exactement quand la cote est vieille ;
//   3. LES ÉTIQUETTES DE CADENCE sont lues dans CADENCES, jamais recopiées ;
//   4. LE DÉMONTAGE débranche ses observateurs et annule ses minuteries ;
//   5. LA MISE EN PAGE : le graphique garde sa place (1440 × 900, 1280 × 720), la légende du cliché
//      ne mord pas le canvas, la plaque ne se chevauche pas, rien ne déborde ; au téléphone, la
//      cote reste affichée ; une manchette qui change de hauteur fait remesurer le graphique ;
//   6. LES ENCRES PROPRES au thème (tampon, édition périmée, âge vieux, valeur négative citée)
//      tiennent 4,5:1 sur leur fond réel ;
//   7. LA PLAQUE est composée dans la police renommée (« Samsara Gazette Titre »), servie par le dépôt.
//
// Sans Playwright : « non exécuté », dit à l'écran (ce n'est pas un succès).
// USAGE   node tests/test_gazette.js
const fs = require('fs'), path = require('path'), http = require('http');
const { previsionsFixture, estPrevisions } = require('./previsions-fixture');   // scénarios du matin (branche previsions)
const REPO = path.resolve(__dirname, '..');

let playwright = null;
for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright', process.env.PLAYWRIGHT_MODULE].filter(Boolean)) {
  try { playwright = require(p); break; } catch (e) { /* suivant */ }
}
if (!playwright) {
  console.log('  − NON EXÉCUTÉ : Playwright introuvable — la structure « une » n\'est pas vérifiée sur ce poste.');
  process.exit(0);
}
let ko = 0;
const check = (nom, ok, det) => { if (!ok) ko++; console.log(`  ${ok ? '✓' : '✗'} ${nom}${!ok && det !== undefined ? ' — ' + JSON.stringify(det).slice(0, 500) : ''}`); };
const titre = t => console.log(`\n── ${t} ──`);

// La tournure de conseil interdite : celle de tests/test_fiches.js, LUE dans sa source (une seule liste).
const srcFiches = fs.readFileSync(path.join(REPO, 'tests', 'test_fiches.js'), 'utf8');
const mc = srcFiches.match(/const CONSEIL = \/(.+)\/(\w*);/);
const CONSEIL = mc ? new RegExp(mc[1], mc[2]) : null;

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
const servis = [];
const serveur = http.createServer((req, res) => {
  const f = path.join(REPO, decodeURIComponent(req.url.split('?')[0]));
  servis.push(req.url);
  if (!f.startsWith(REPO) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});

// La publication servie est VIEILLIE de 3 h, construite ici : le fichier du dépôt est réécrit
// toutes les 15 min par le serveur, et un test qui le servait tel quel passait ou échouait selon
// l'heure du dernier cron (rouge dès que la publication était fraîche). Un cas « en retard » se
// fabrique, il ne s'attend pas.
function publicationVieille() {
  const md = JSON.parse(fs.readFileSync(path.join(REPO, 'market-data.json'), 'utf8'));
  md.updated = new Date(Date.now() - 3 * 3600e3).toISOString();
  return JSON.stringify(md);
}
async function ouvrir(nav, vue, theme) {
  const ctx = await nav.newContext({ viewport: vue, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const erreurs = [], externes = [];
  page.on('pageerror', e => erreurs.push(e.message));
  await page.route('**/*', r => {
    const u = r.request().url(), h = new URL(u).host, cors = { 'access-control-allow-origin': '*' };
    if (h.startsWith('127.0.0.1')) return r.continue();
    if (h === 'api.binance.com') return r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(binance(u)) });
    if (estPrevisions(u)) return r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: previsionsFixture() });
    if (h === 'raw.githubusercontent.com') return r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: u.includes('heatmap') ? fs.readFileSync(path.join(REPO, 'heatmap.json')) : publicationVieille() });
    externes.push(u);
    return r.abort();
  });
  // Observateurs et minuteries : chaque MutationObserver est noté (branché / débranché) ; chaque
  // setTimeout posé DEPUIS js/structures.js est suivi jusqu'à son annulation ou son échéance.
  await page.addInitScript(t => {
    // Mode Complet : ce test mesure les éléments denses (chiffres clés, heure de publication, couche de
    // chaleur, étiquettes de l'axe…), masqués en Lisible (le mode par défaut) ; leur version Lisible
    // est vérifiée dans test_debutant_page.js.
    try { localStorage.clear(); localStorage.setItem('samsara-mode', 'expert'); localStorage.setItem('samsara-theme', t); } catch (e) { /* */ }
    window.__observateurs = [];
    const MO = window.MutationObserver;
    window.MutationObserver = class extends MO {
      constructor(...a) { super(...a); this.__fiche = { branche: false }; window.__observateurs.push(this.__fiche); }
      observe(...a) { this.__fiche.branche = true; return super.observe(...a); }
      disconnect() { this.__fiche.branche = false; return super.disconnect(); }
    };
    window.__minuteries = new Set();
    const st = window.setTimeout, ct = window.clearTimeout;
    window.setTimeout = function (fn, ms, ...a) {
      // L'APPELANT direct (3e ligne de la pile) : une minuterie posée par js/app.js au fil d'un
      // appel venu de structures.js (drawChart…) n'est pas celle de la structure.
      const deStructure = /structures\.js/.test((new Error().stack || '').split('\n')[2] || '');
      let id = 0;
      id = st.call(window, function () { window.__minuteries.delete(id); return typeof fn === 'function' ? fn.apply(this, arguments) : undefined; }, ms, ...a);
      if (deStructure) window.__minuteries.add(id);
      return id;
    };
    window.clearTimeout = function (id) { window.__minuteries.delete(id); return ct.call(window, id); };
  }, theme);
  await page.goto(`http://127.0.0.1:${serveur.address().port}/index.html`);
  await page.waitForTimeout(2200);
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await page.waitForTimeout(200);
  return { ctx, page, erreurs, externes };
}

(async () => {
  await new Promise(r => serveur.listen(0, '127.0.0.1', r));
  const nav = await playwright.chromium.launch();
  try {
    // ── 1. La manchette recopie la cote ──
    titre('1. La manchette recopie la cote (bureau 1440 × 900, publication du dépôt)');
    const o = await ouvrir(nav, { width: 1440, height: 900 }, 'gazette');
    const p = o.page;
    check('structure « une » posée', await p.evaluate(() => document.documentElement.getAttribute('data-structure')) === 'une');
    const lu = await p.evaluate(() => {
      const cote = {};
      for (const k of document.querySelectorAll('#cycle .kpi')) cote[k.querySelector('i').textContent.trim()] = k.querySelector('b').textContent.trim();
      const man = document.querySelector('.gazette-manchette');
      const valeurs = [...man.querySelectorAll('.gazette-valeur')].map(s => s.textContent);
      const horsValeurs = [...man.querySelectorAll('.gazette-titre, .gazette-chapeau')].map(el =>
        [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('|')).join(' / ');
      return { cote, cles: GAZETTE_CLES, valeurs, horsValeurs, titre: man.querySelector('.gazette-titre').textContent,
               chapeau: man.querySelector('.gazette-chapeau').textContent, heure: document.getElementById('updated').textContent.trim() };
    });
    const cites = Object.values(lu.cles).map(l => lu.cote[l]);
    check(`les libellés que la manchette cite existent dans la cote (${Object.values(lu.cles).join(', ')})`,
      Object.values(lu.cles).every(l => typeof lu.cote[l] === 'string'), { cote: Object.keys(lu.cote) });
    const permis = new Set(cites.concat(lu.heure));
    check('chaque valeur citée est le texte affiché d\'un chiffre clé (ou l\'heure de l\'édition), au caractère près',
      lu.valeurs.length > 0 && lu.valeurs.every(v => permis.has(v)), { valeurs: lu.valeurs, permis: [...permis] });
    check('chaque chiffre clé cité (≠ « — ») figure dans la manchette',
      cites.filter(v => v && v !== '—').every(v => lu.valeurs.includes(v)), { cites, valeurs: lu.valeurs });
    check('hors des valeurs citées, aucun nombre (seulement « 24 h » et les libellés de la cote)',
      !/\d/.test(lu.horsValeurs.replace(/24[\s\u00a0]?h/g, '')), lu.horsValeurs);
    const oi = lu.cote[lu.cles.interet];
    const attendu = !oi || oi === '—' ? null : oi[0] === '+' ? 'progresse' : oi[0] === '−' ? 'recule' : 'stable';
    check(`le verbe suit le premier caractère du texte affiché (« ${oi} » → ${attendu || 'clause omise'})`,
      attendu ? new RegExp('intérêt ouvert ' + attendu + '\\b').test(lu.titre) : !/intérêt ouvert/.test(lu.titre), lu.titre);
    check('aucune tournure de conseil (liste de tests/test_fiches.js)', !!CONSEIL && !CONSEIL.test(lu.titre + ' ' + lu.chapeau), lu.titre);

    const cas = await p.evaluate(() => {
      const de = obj => lib => (lib in obj ? obj[lib] : null);
      const txt = segs => segs.map(s => s[0]).join('');
      const vals = segs => segs.filter(s => s[1]).map(s => s[0]);
      const plein = { Funding: '+0.2%', 'OI 24h': '−2.6%', 'CVD 24h': '−$98.81M', GEX: 'long γ' };
      const m = manchetteGazette(de(plein), '13:03');
      return {
        titre: txt(m.titre), valeursTitre: vals(m.titre), valeursChapeau: vals(m.chapeau), chapeau: txt(m.chapeau),
        hausse: txt(manchetteGazette(de({ 'OI 24h': '+2.6%' }), '').titre),
        nul: txt(manchetteGazette(de({ 'OI 24h': '0.0%' }), '').titre),
        tiret: txt(manchetteGazette(de({ Funding: '+0.2%', 'OI 24h': '—' }), '').titre),
        trait: txt(manchetteGazette(de({ 'OI 24h': '-2.6%' }), '').titre),
        absent: txt(manchetteGazette(de({}), '').titre),
        vide: txt(manchetteGazette(de({ Funding: '—', 'OI 24h': '—' }), '').titre),
        identite: (() => { const v = '−$1,234.5K'; const r = manchetteGazette(de({ 'CVD 24h': v }), ''); return vals(r.chapeau)[0] === v; })(),
      };
    });
    check('cas complet : valeurs recopiées telles quelles, verbe « recule » pour « −2.6% »',
      cas.titre === 'Le financement des perpétuels à +0.2%\u00a0; l’intérêt ouvert recule\u00a0: −2.6% en\u00a024\u00a0h'
      && JSON.stringify(cas.valeursTitre) === '["+0.2%","−2.6%"]' && JSON.stringify(cas.valeursChapeau) === '["−$98.81M","long γ","13:03"]', cas);
    check('« +2.6% » → progresse ; « 0.0% » → stable', /progresse\u00a0: \+2\.6%/.test(cas.hausse) && /stable\u00a0: 0\.0%/.test(cas.nul), [cas.hausse, cas.nul]);
    check('une clause « — » est omise', cas.tiret === 'Le financement des perpétuels à +0.2%', cas.tiret);
    check('seul le signe moins affiché (U+2212) fait « recule » : un trait d\'union n\'est pas un signe', /stable\u00a0: -2\.6%/.test(cas.trait), cas.trait);
    check('sans cote : « Édition en attente » ; cote sans valeur : « La cote de l’édition »', cas.absent === 'Édition en attente' && cas.vide === 'La cote de l’édition', [cas.absent, cas.vide]);
    check('la valeur rendue est la chaîne reçue (aucun reformatage)', cas.identite);
    check('aucune tournure de conseil dans les gabarits', !!CONSEIL && ![cas.titre, cas.chapeau, cas.hausse, cas.nul].some(t => CONSEIL.test(t)));

    // ── 2. Tampon et édition périmée ──
    titre('2. Tampon « Dernière heure » (édition nouvelle seulement) et « Édition périmée »');
    const etat = () => p.evaluate(() => {
      const vu = s => { const e = document.querySelector(s); return !!e && getComputedStyle(e).display !== 'none' && e.getBoundingClientRect().width > 0; };
      return { tampon: vu('.gazette-tampon'), perimee: vu('.gazette-perimee'), cadence: vu('.gazette-cadence'),
               vieux: document.getElementById('cycle').classList.contains('vieux'), cadenceTexte: document.querySelector('.gazette-cadence').textContent };
    });
    let e0 = await etat();
    check('premier rendu : tampon éteint', !e0.tampon, e0);
    check('cote vieille (publication du dépôt) : « Édition périmée » affichée, cadence masquée', e0.vieux && e0.perimee && !e0.cadence, e0);
    await p.evaluate(() => renderFeed());
    await p.waitForTimeout(100);
    check('réécriture de la même édition (chaque minute) : tampon éteint', !(await etat()).tampon);
    await p.evaluate(() => { CADENCES.publication_lue = 600; marketData.updated = new Date(Date.parse(marketData.updated) + 15 * 60000).toISOString(); renderFeed(); });
    await p.waitForTimeout(100);
    const e1 = await etat();
    check('édition nouvelle : tampon allumé', e1.tampon, e1);
    const valeursApres = await p.evaluate(() => [...document.querySelectorAll('.gazette-chapeau .gazette-valeur')].map(s => s.textContent).pop());
    check('la manchette suit l\'édition nouvelle (heure recopiée)', valeursApres === (await p.evaluate(() => document.getElementById('updated').textContent.trim())), valeursApres);
    await p.waitForTimeout(900);
    check('tampon éteint après CADENCES.publication_lue', !(await etat()).tampon);
    // Une édition fraîche (elle aussi nouvelle : le tampon s'allume, puis s'éteint).
    await p.evaluate(() => { CADENCES.publication_lue = 400; marketData.updated = new Date().toISOString(); renderFeed(); });
    await p.waitForTimeout(100);
    const e2 = await etat();
    check('cote fraîche : « Édition périmée » masquée ; le tampon tient la ligne', !e2.vieux && !e2.perimee && e2.tampon && !e2.cadence, e2);
    await p.waitForTimeout(700);
    const e3 = await etat();
    await p.evaluate(() => { CADENCES.publication_lue = 60000; });
    check('tampon éteint : la cadence attendue revient (lue dans CADENCES)',
      !e3.tampon && e3.cadence && e3.cadenceTexte === 'Paraît toutes les ' + (await p.evaluate(() => CADENCES.attendue_min)) + ' min', e3);

    // ── 3. Étiquettes de cadence ──
    titre('3. Étiquettes de cadence lues dans CADENCES');
    const cad = await p.evaluate(() => {
      const avant = Object.assign({}, CADENCES);
      Object.assign(CADENCES, { prix: 2000, bougies: 10000, attendue_min: 30 });
      appliquerTheme('aero'); appliquerTheme('gazette');
      const r = { oreille: document.querySelector('.gazette-oreille-g .gazette-tag').textContent, legende: document.querySelector('.gazette-legende').textContent,
                  cadence: document.querySelector('.gazette-cadence').textContent };
      Object.assign(CADENCES, avant); appliquerTheme('aero'); appliquerTheme('gazette');
      return r;
    });
    check('oreille, légende du cliché et cadence suivent CADENCES (2 s, 10 s, 30 min)',
      cad.oreille === 'Cours toutes les 2 s' && /rafraîchies toutes les 10 s$/.test(cad.legende) && cad.cadence === 'Paraît toutes les 30 min', cad);

    // ── 4. Démontage ──
    titre('4. Démontage : observateurs débranchés, minuteries annulées');
    const dem = await p.evaluate(async () => {
      const n0 = window.__observateurs.length;
      appliquerTheme('aero'); appliquerTheme('gazette');
      const nes = window.__observateurs.slice(n0).length;
      // Une édition nouvelle : le tampon pose sa minuterie, puis on quitte le thème.
      marketData.updated = new Date(Date.parse(marketData.updated) + 15 * 60000).toISOString(); renderFeed();
      await new Promise(r => requestAnimationFrame(r));
      const enCours = window.__minuteries.size;
      appliquerTheme('aero');
      marketData.updated = new Date(Date.parse(marketData.updated) + 15 * 60000).toISOString(); renderFeed();
      return { nes, encoreBranches: window.__observateurs.slice(n0).filter(f => f.branche).length, enCours, restantes: window.__minuteries.size,
               restes: document.querySelectorAll('[class*="gazette-"]').length };
    });
    check(`${dem.nes} observateur(s) né(s) avec la structure, tous débranchés`, dem.nes > 0 && dem.encoreBranches === 0, dem);
    check(`${dem.enCours} minuterie(s) de la structure en cours (date du folio, tampon), toutes annulées au démontage`, dem.enCours >= 2 && dem.restantes === 0, dem);
    check('aucun nœud de la une ne reste', dem.restes === 0, dem);
    check('aucune erreur JavaScript', !o.erreurs.length, o.erreurs);
    await o.ctx.close();

    // ── 5. Mise en page ──
    titre('5. Mise en page : le graphique garde sa place, rien ne se chevauche');
    const PLANCHER = { '1440x900': 480, '1280x720': 380 };
    for (const [w, h] of [[1440, 900], [1280, 720], [960, 800], [640, 900], [390, 800]]) {
      const x = await ouvrir(nav, { width: w, height: h }, 'gazette');
      const m = await x.page.evaluate(() => {
        const r = s => { const e = document.querySelector(s); if (!e || getComputedStyle(e).display === 'none') return null; const b = e.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom, w: b.width, h: b.height }; };
        const cc = document.querySelector('.chart-container'), cs = getComputedStyle(cc), rc = cc.getBoundingClientRect();
        const kpis = [...document.querySelectorAll('#cycle .kpi')].filter(k => !k.hidden && k.getBoundingClientRect().width > 0).length;
        const man = document.querySelector('.gazette-manchette');
        return { canvas: r('#chart'), legende: r('.gazette-legende'), og: r('.gazette-oreille-g'), h1: r('.header-left h1'), od: r('.gazette-oreille-d'),
                 interieurBas: rc.bottom - parseFloat(cs.paddingBottom), interieurH: rc.height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom),
                 kpis, coteAffichee: getComputedStyle(document.getElementById('cycle')).display !== 'none',
                 debordeX: document.documentElement.scrollWidth > innerWidth + 1, manCoupee: man.scrollWidth > man.clientWidth + 1 };
      });
      const v = `${w} × ${h}`, cle = `${w}x${h}`;
      check(`${v} : le canvas tient dans son cadre (bas ${Math.round(m.canvas.b)} ≤ ${Math.round(m.interieurBas)}) et le remplit`,
        m.canvas.b <= m.interieurBas + 1 && Math.abs(m.canvas.h - m.interieurH) <= 2, m);
      check(`${v} : la légende du cliché est sous le canvas, jamais dessus`, !!m.legende && m.legende.t >= m.canvas.b - 1, { legende: m.legende, canvas: m.canvas });
      if (PLANCHER[cle]) check(`${v} : le graphique garde sa place (${Math.round(m.canvas.h)} px ≥ ${PLANCHER[cle]})`, m.canvas.h >= PLANCHER[cle], m.canvas);
      if (w > 600) {
        // Deux boîtes disjointes : séparées en largeur OU en hauteur (sous 1000 px, le titre passe
        // au-dessus des oreilles). À 640 px, l'oreille du cours débordait sur le titre.
        const disjoints = (a, b) => a.r <= b.l + 1 || b.r <= a.l + 1 || a.b <= b.t + 1 || b.b <= a.t + 1;
        const dedans = a => a.l >= -1 && a.r <= w + 1;
        check(`${v} : plaque — oreille, titre, oreille sans chevauchement, dans l'écran`,
          m.og && m.h1 && m.od && disjoints(m.og, m.h1) && disjoints(m.h1, m.od) && disjoints(m.og, m.od) && [m.og, m.h1, m.od].every(dedans), { og: m.og, h1: m.h1, od: m.od });
      } else {
        check(`${v} : la cote reste affichée au téléphone (${m.kpis} chiffres clés)`, m.coteAffichee && m.kpis >= 3, m);
        check(`${v} : l'oreille du cours prend la largeur, le titre cède`, !!m.og && !m.h1 && !m.od, m);
      }
      check(`${v} : aucun débordement horizontal, manchette entière`, !m.debordeX && !m.manCoupee, m);
      check(`${v} : aucune erreur JavaScript`, !x.erreurs.length, x.erreurs);
      await x.ctx.close();
    }

    // Une manchette qui change de hauteur à l'édition (deux lignes → une) : le graphique se remesure
    // (js/app.js ne le remesure qu'au redimensionnement de la fenêtre). 820 px : la manchette
    // complète tient sur deux lignes.
    const z = await ouvrir(nav, { width: 820, height: 900 }, 'gazette');
    const rz = await z.page.evaluate(async () => {
      const man = document.querySelector('.gazette-manchette'), h0 = man.offsetHeight;
      marketData.micro = Object.assign({}, marketData.micro, { funding_annual_pct: null, oi_change_24h_pct: null, oi_change_1d_pct: null });
      renderFeed();
      await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
      const cc = document.querySelector('.chart-container'), cs = getComputedStyle(cc), rc = cc.getBoundingClientRect(), cv = document.getElementById('chart').getBoundingClientRect();
      return { h0, apres: man.offsetHeight, interieurH: rc.height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom), canvasH: cv.height,
               titre: document.querySelector('.gazette-titre').textContent };
    });
    check(`820 × 900 : la manchette passe de ${rz.h0} à ${rz.apres} px à l'édition — le canvas se remesure (${Math.round(rz.canvasH)} px pour ${Math.round(rz.interieurH)})`,
      rz.titre === 'La cote de l’édition' && rz.apres < rz.h0 && Math.abs(rz.canvasH - rz.interieurH) <= 2, rz);
    check('820 × 900 : aucune erreur JavaScript', !z.erreurs.length, z.erreurs);
    await z.ctx.close();

    // ── 6. Encres propres au thème ──
    titre('6. Encres propres au thème, sur leur fond réel (AA texte ≥ 4,5:1)');
    const y = await ouvrir(nav, { width: 1440, height: 900 }, 'gazette');
    const enc = await y.page.evaluate(() => {
      const rvb = c => { const m = c.match(/[\d.]+/g).map(Number); return m.slice(0, 3); };
      const hex = h => { h = h.replace('#', ''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)); };
      const lum = c => { const l = c.map(v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2]; };
      const ratio = (a, b) => { const x = lum(a), z = lum(b); return (Math.max(x, z) + 0.05) / (Math.min(x, z) + 0.05); };
      // Le papier : chaque borne hexadécimale du dégradé de --fond (le grain n'y ajoute que 3 % d'encre).
      const papiers = (getComputedStyle(document.documentElement).getPropertyValue('--fond').match(/#[0-9a-f]{6}\b/gi) || []).map(hex);
      const surPapier = sel => Math.min(...papiers.map(f => ratio(rvb(getComputedStyle(document.querySelector(sel)).color), f)));
      document.querySelector('.gazette-alertes').classList.add('tampon');
      const t = document.querySelector('.gazette-tampon'), ts = getComputedStyle(t);
      const age = document.querySelector('#cycle .kpi-age'), as = getComputedStyle(age);
      const neg = document.createElement('span'); neg.className = 'gazette-valeur neg'; neg.textContent = '−1'; document.querySelector('.gazette-chapeau').appendChild(neg);
      const r = {
        papiers: papiers.length,
        tampon: ratio(rvb(ts.color), rvb(ts.backgroundColor)),
        perimee: surPapier('.gazette-perimee'), cadence: surPapier('.gazette-cadence'), legende: surPapier('.gazette-legende'),
        valeurNeg: surPapier('.gazette-chapeau .gazette-valeur.neg'), tag: surPapier('.gazette-cote > .gazette-tag'),
        ageVieux: document.getElementById('cycle').classList.contains('vieux') ? ratio(rvb(as.color), rvb(as.backgroundColor)) : null,
      };
      neg.remove(); document.querySelector('.gazette-alertes').classList.remove('tampon');
      return r;
    });
    check(`papier lu dans --fond (${enc.papiers} bornes)`, enc.papiers >= 2, enc);
    for (const [nom, v] of Object.entries(enc)) if (nom !== 'papiers' && v !== null) check(`${nom.padEnd(10)} ${v.toFixed(2)}:1`, v >= 4.5, enc);

    // ── 7. La plaque ──
    titre('7. La plaque : police renommée, servie par le dépôt');
    const pl = await y.page.evaluate(() => ({ famille: getComputedStyle(document.querySelector('.header-left h1')).fontFamily,
      chargee: document.fonts.check('800 46px "Samsara Gazette Titre"', 'Saṃsāra') && [...document.fonts].some(f => f.family.replace(/"/g, '') === 'Samsara Gazette Titre' && f.status === 'loaded') }));
    check('le titre est composé en « Samsara Gazette Titre », chargée', /^"?Samsara Gazette Titre/.test(pl.famille) && pl.chargee, pl);
    check('police servie depuis fonts/ (aucune requête hors de la page, Binance et GitHub Raw)',
      servis.some(u => u.startsWith('/fonts/gazette-titre.woff2')) && !y.externes.length, { externes: y.externes });
    await y.ctx.close();
  } finally { await nav.close(); serveur.close(); }
  console.log(ko ? `\n❌ GAZETTE : ${ko} contrôle(s) en échec` : '\n✅ GAZETTE : TOUS LES CONTRÔLES PASSENT');
  process.exit(ko ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
