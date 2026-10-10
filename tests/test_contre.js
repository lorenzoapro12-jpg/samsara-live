// Contre-expertise (js/contre-expertise.js) — hors ligne, sur une publication RÉELLE et les
// réponses Binance enregistrées pour elle (tests/fixtures/contre/, relevées le 07/10/2026 sur
// le miroir public de Binance).
//
// CE QUI EST VÉRIFIÉ
//   1. la publication enregistrée se retrouve : tout en ✓ ou ≈, aucun ✗ ;
//   2. une valeur publiée décalée d'UNE unité de sa dernière décimale → ✗ ;
//   3. une bougie modifiée → ✗ « source modifiée ou calcul différent » (jamais « serveur faux ») ;
//   4. bougies_lues retiré → « format antérieur » ; meta.champs absent → « format antérieur » ;
//   5. réseau coupé, HTTP 451 → « injoignable », avec la classe de la panne ;
//   6. les paramètres viennent de meta.champs (une période changée y change le verdict), la
//      tolérance des décimales affichées, les TF du fichier ; ≈ 12 de poids, un seul hôte.
//
// Les fonctions de calcul sont celles de la PAGE (extraites de js/app.js, comme test_indicateurs).
// USAGE   node tests/test_contre.js
const fs = require('fs'), path = require('path');
const REPO = path.resolve(__dirname, '..');
const SRC = require('./sources').scriptsApp().map(s => s.texte).join('\n');
const CE = require(path.join(REPO, 'js/contre-expertise.js'));
const H = require(path.join(REPO, 'js/horloges.js'));

let ko = 0;
const check = (nom, ok, det) => { if (!ok) ko++; console.log(`  ${ok ? '✓' : '✗'} ${nom}${!ok && det !== undefined ? ' — ' + JSON.stringify(det).slice(0, 400) : ''}`); };
const titre = t => console.log(`\n── ${t} ──`);

function extraire(nom) {
  const i = SRC.indexOf('function ' + nom + '(');
  if (i < 0) throw new Error('fonction introuvable : ' + nom);
  const j = SRC.indexOf('\nfunction ', i + 10);
  return new Function(SRC.slice(i, j < 0 ? undefined : j) + '\nreturn ' + nom + ';')();
}
const calc = { calcRSI: extraire('calcRSI'), calcEMA: extraire('calcEMA'), calcATR: extraire('calcATR') };
const API = (SRC.match(/const API_BINANCE = '([^']+)'/) || [])[1];
const FIX = path.join(__dirname, 'fixtures', 'contre');
const MD = JSON.parse(fs.readFileSync(path.join(FIX, 'publication.json'), 'utf8'));
const REP = JSON.parse(fs.readFileSync(path.join(FIX, 'reponses.json'), 'utf8'));
const copie = o => JSON.parse(JSON.stringify(o));

/** fetch simulé : les réponses enregistrées, par URL exacte ; `modif` peut les altérer. */
function faux(rep, o = {}) {
  const urls = [];
  const f = async (url) => {
    urls.push(url);
    if (o.panne) throw new TypeError('Failed to fetch');
    if (o.status) return { ok: false, status: o.status, json: async () => ({ code: 0, msg: 'restricted location' }) };
    if (!(url in rep)) return { ok: false, status: 400, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => copie(rep[url]) };
  };
  f.urls = urls;
  return f;
}
const lancer = (md, rep, o) => { const f = faux(rep || REP, o); return CE.lancer(md, API, calc, f, H.classer).then(r => Object.assign(r, { urls: f.urls })); };
const ligne = (r, cle) => r.lignes.find(l => l.cle === cle);

(async () => {
  titre('0. Constante d’API lue dans js/app.js');
  check(`API de la page : ${API}`, /^https:\/\/api\.binance\.com\//.test(API || ''));

  titre('1. La publication enregistrée se retrouve');
  const r0 = await lancer(MD);
  check(`verdict global « ok » (${JSON.stringify(r0.comptes)})`, r0.etat === 'ok' && r0.comptes.diff === 0 && r0.comptes.ancien === 0 && r0.comptes.injoignable === 0, r0.lignes.filter(l => !['ok', 'approx'].includes(l.etat)));
  const tfs = Object.keys(MD.tf);
  check(`indicateurs des ${tfs.length} TF du fichier recalculés et ✓ (RSI, EMA, ATR, S/R, écarts)`,
    tfs.every(tf => ['rsi_14', 'ema20', 'ema50', 'atr_14', 'support_30', 'resistance_30', 'ema_ecart_pct', 'atr_14_pct', 'amplitude_30_pct', 'ema20_sous_ema50'].every(n => (ligne(r0, `tf.${tf}.${n}`) || {}).etat === 'ok')));
  const cvd = ligne(r0, 'micro.cvd_24h_usd');
  check(`CVD ≈ à la seconde (« ${cvd && cvd.borne} »)`, cvd && cvd.etat === 'approx' && /cohérent à la seconde \(écart \d{1,3}(?:[ \u202f\u00a0]\d{3})* USDT, lecture estimée \d\d:\d\d:\d\d\)/.test(cvd.borne));
  // L'heure lue est celle de l'appareil (comme toute la page) : « UTC » n'y est plus écrit.
  {
    const srcCE = fs.readFileSync(path.join(REPO, 'js/contre-expertise.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    const utc = srcCE.match(/(['"`])[^'"`\n]*UTC[^'"`\n]*\1/g) || [];
    check('heures de la contre-expertise : celles de l’appareil (Fmt.heureSec / Fmt.jourHeure), aucun « UTC » écrit', !utc.length && /F\.heureSec\(/.test(srcCE) && /F\.jourHeure\(/.test(srcCE) && !/getUTC|toISOString\(\)\.slice/.test(srcCE), utc);
  }
  const px = ligne(r0, 'btc.price');
  check(`prix ≈ dans la fourchette de ses secondes, fenêtre dite (« ${px && px.borne} »)`, px && px.etat === 'approx' && /convention/.test(px.borne));
  check('chaque ligne porte la nature de son champ (meta.champs)', r0.lignes.every(l => l.nature === ((MD.meta.champs[l.cle.replace(/^tf\.[^.]+\./, 'tf.*.')] || {}).nature)));
  const raisons = new Set(r0.non.map(n => n.raison));
  check('non vérifiables : futures, Deribit, Coinbase, Yahoo, carnet — chacun avec sa raison', Object.values(CE.RAISONS).every(x => raisons.has(x)), [...raisons]);
  check('aucun champ décrit n’est oublié (vérifié, structurel ou non vérifiable)', Object.keys(MD.meta.champs).every(c => MD.meta.champs[c].alias_de
    || r0.lignes.some(l => l.cle.replace(/^tf\.[^.]+\./, 'tf.*.') === c) || r0.non.some(n => n.cle === c) || /^tf\.\*\.(bougies_lues|derniere_cloture_a|bougie_en_cours|last_close|sr_window_h)$/.test(c)));

  titre('2. Une unité de la dernière décimale → ✗');
  for (const [tf, nom, pas] of [['4h', 'rsi_14', 0.1], ['1h', 'ema20', 0.01], ['1d', 'atr_14', 0.01], ['4h', 'support_30', 0.01], ['1h', 'ema_ecart_pct', 0.01]]) {
    const md = copie(MD); md.tf[tf][nom] = +(md.tf[tf][nom] + pas).toFixed(6);
    const r = await lancer(md), l = ligne(r, `tf.${tf}.${nom}`);
    check(`${tf}.${nom} ${MD.tf[tf][nom]} → ${md.tf[tf][nom]} : ✗ différent, deux valeurs montrées`, l && l.etat === 'diff' && l.publie === md.tf[tf][nom] && l.recalcule !== null && r.etat === 'diff', l);
  }
  { const md = copie(MD); md.tf['4h'].ema20_sous_ema50 = !md.tf['4h'].ema20_sous_ema50;
    const l = ligne(await lancer(md), 'tf.4h.ema20_sous_ema50'); check('un état booléen inversé → ✗', l && l.etat === 'diff'); }
  { const md = copie(MD); md.btc.price = 1000;
    const l = ligne(await lancer(md), 'btc.price'); check('un prix hors de la fourchette de ses secondes → ✗', l && l.etat === 'diff'); }
  { const md = copie(MD); md.micro.cvd_24h_usd += 5e6;
    const r = await lancer(md); check('un CVD 24 h décalé de 5 M$ → ✗ sur les trois fenêtres (résidus inégaux)', ['1h', '4h', '24h'].every(w => ligne(r, `micro.cvd_${w}_usd`).etat === 'diff')); }

  titre('3. Une bougie modifiée → ✗ « source modifiée ou calcul différent »');
  {
    const rep = copie(REP), url = Object.keys(rep).find(u => /interval=4h/.test(u));
    rep[url][150][4] = String(+rep[url][150][4] + 900);   // une clôture, 50 bougies avant la fin
    const r = await lancer(MD, rep), l = ligne(r, 'tf.4h.rsi_14'), e = ligne(r, 'tf.4h.ema50');
    check('RSI et EMA 4h : ✗, avec « source modifiée ou calcul différent »', l.etat === 'diff' && e.etat === 'diff' && /source modifiée ou calcul différent/.test(l.note));
    check('les autres TF restent ✓', ligne(r, 'tf.1h.rsi_14').etat === 'ok' && ligne(r, 'tf.1d.rsi_14').etat === 'ok');
    const rep2 = copie(REP), u5 = Object.keys(rep2).find(u => /interval=1s/.test(u) && !/startTime=\d+&endTime=\d+&limit=36\b/.test(u));
    rep2[u5].forEach(k => { k[10] = String(+k[7] * 0.9); });   // les achats taker de chaque seconde gonflés
    const c = ligne(await lancer(MD, rep2), 'micro.cvd_1h_usd');
    check('secondes du CVD modifiées → ✗', c.etat === 'diff' && /source modifiée ou calcul différent/.test(c.note), c);
    const tous = JSON.stringify((await lancer(MD, rep)).lignes);
    check('jamais « serveur faux »', !/serveur faux/i.test(tous) && !/serveur faux/i.test(fs.readFileSync(path.join(REPO, 'js/contre-expertise.js'), 'utf8').replace(/^\s*\/\/.*$/gm, '')));
    const rep3 = copie(REP), u1 = Object.keys(rep3).find(u => /interval=1h/.test(u));
    rep3[u1].pop();
    const s = ligne(await lancer(MD, rep3), 'tf.1h');
    check('moins de bougies que bougies_lues → « source différente »', s && s.etat === 'source' && /source différente/.test(s.note), s);
  }

  titre('4. Format antérieur');
  { const md = copie(MD); delete md.tf['1h'].bougies_lues;
    const r = await lancer(md), l = ligne(r, 'tf.1h');
    check('bougies_lues retiré → « format antérieur » pour ce TF, sans requête pour lui', l && l.etat === 'ancien' && !r.urls.some(u => /interval=1h/.test(u)) && ligne(r, 'tf.4h.rsi_14').etat === 'ok', l); }
  { const md = copie(MD); delete md.meta;
    const r = await lancer(md); check('meta.champs absent → « format antérieur », aucune requête', r.etat === 'ancien' && /format antérieur/.test(r.note)); }
  { const md = copie(MD); delete md.meta.champs['tf.*.rsi_14'].params;
    const l = ligne(await lancer(md), 'tf.4h.rsi_14'); check('paramètres absents d’un champ → « format antérieur » pour lui', l && l.etat === 'ancien'); }

  titre('5. Binance injoignable');
  { const r = await lancer(MD, REP, { panne: true });
    check(`réseau coupé → « injoignable » partout (« ${r.lignes[0].note} »)`, r.etat === 'injoignable' && r.lignes.every(l => l.etat === 'injoignable') && /Binance injoignable/.test(r.lignes[0].note)); }
  { const r = await lancer(MD, REP, { status: 451 });
    check(`HTTP 451 → « injoignable (refus régional…) » (« ${r.lignes[0].note} »)`, r.etat === 'injoignable' && /Binance injoignable \(refus régional \(HTTP 451\)\)/.test(r.lignes[0].note)); }

  titre('6. Rien de recopié : paramètres, tolérances, TF, coût');
  { const md = copie(MD); md.meta.champs['tf.*.rsi_14'].params.periode = 13;
    check('meta.champs params.periode = 13 → le RSI recalculé change (✗) : la période est LUE', ligne(await lancer(md), 'tf.4h.rsi_14').etat === 'diff'); }
  check('décimales : 32.3 → 1, 84953.87 → 2, 36 → 0, 1e-7 → 7', CE.decimales(32.3) === 1 && CE.decimales(84953.87) === 2 && CE.decimales(36) === 0 && CE.decimales(1e-7) === 7);
  { const md = { tf: { a: { rsi_14: 36 }, b: { rsi_14: 32.3 } } };
    check('« 36.0 » lu « 36 » : la tolérance prend le plus de décimales sur tous les TF (± 0,05)', CE.tolerance(md, 'rsi_14') === 0.05); }
  { const md = copie(MD); delete md.tf['1d'];
    const r = await lancer(md); check('un TF retiré du fichier n’est ni demandé ni vérifié', !r.urls.some(u => /interval=1d/.test(u)) && !ligne(r, 'tf.1d.rsi_14')); }
  check(`${r0.urls.length} lectures de bougies (poids 2 chacune : ${2 * r0.urls.length}), toutes sur l’API de la page`, r0.urls.length === 6 && r0.urls.every(u => u.startsWith(API + 'klines?')));
  check('aucun conseil dans les textes produits', (() => { const fb = require('./forbidden'); const l = fb.load(); return fb.find(JSON.stringify(r0), l.terms).length === 0; })());

  console.log(ko ? `\n❌ CONTRE-EXPERTISE : ${ko} contrôle(s) en échec` : '\n✅ CONTRE-EXPERTISE : TOUS LES CONTRÔLES PASSENT');
  process.exit(ko ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
