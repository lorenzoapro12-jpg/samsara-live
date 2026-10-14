// Horloges (js/horloges.js) — hors ligne : la liste dérivée de meta.champs, les classes de
// panne, le décalage avec Binance, et leur câblage dans les lectures de la page (bac à sable).
//
// CE QUI EST VÉRIFIÉ
//   1. chaque champ `horodatage` de meta.champs (alias exclus) est dans la liste, un par TF pour
//      « tf.* » ; un horodatage AJOUTÉ à meta y apparaît sans toucher le code ;
//   2. 451, 429, 418, 503, hors ligne, TypeError, JSON invalide : chacun sa classe ; « figé »
//      au-delà du seuil (convention de js/cadences.js, ou 2 × une cadence mesurée) ;
//   3. décalage = S − (s + r)/2, l'aller-retour le plus court des 5 derniers gagne ; l'écart
//      n'est dit qu'au-delà d'une seconde ;
//   4. dans la page : un prix refusé (451), une publication illisible, un ⚡ limité notent la
//      bonne classe ; la carte « Horloges » la dit ; la couche de chaleur porte ses deux âges ;
//      la bulle du voyant dit un prix qui n'arrive pas, et le graphique sans bougies dit Binance
//      injoignable au lieu de « Chargement… » (revue du 14/10, C11).
// USAGE   node tests/test_horloges.js
const fs = require('fs'), path = require('path'), vm = require('vm');
const REPO = path.resolve(__dirname, '..');
// js/cadences.js définit CADENCES au niveau global de la page : même chose ici.
globalThis.CADENCES = vm.runInThisContext(fs.readFileSync(path.join(REPO, 'js/cadences.js'), 'utf8') + '\nCADENCES');
const H = require(path.join(REPO, 'js/horloges.js'));
const { chargerPage } = require('./bac');

let ko = 0;
const check = (nom, ok, det) => { if (!ok) ko++; console.log(`  ${ok ? '✓' : '✗'} ${nom}${!ok && det !== undefined ? ' — ' + JSON.stringify(det).slice(0, 400) : ''}`); };
const titre = t => console.log(`\n── ${t} ──`);
const copie = o => JSON.parse(JSON.stringify(o));
const MD = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'contre', 'publication.json'), 'utf8'));

(async () => {
  titre('1. La liste vient de meta.champs');
  const liste = H.duFichier(MD);
  const attendus = [];
  for (const [cle, m] of Object.entries(MD.meta.champs)) {
    if (m.nature !== 'horodatage' || m.alias_de) continue;
    if (cle.startsWith('tf.*.')) for (const tf of Object.keys(MD.tf)) attendus.push('tf.' + tf + '.' + cle.slice(5));
    else attendus.push(cle);
  }
  check(`${attendus.length} horodatages décrits → ${liste.length} horloges, les mêmes`, attendus.length === liste.length && attendus.every(a => liste.some(l => l.chemin === a)), { attendus, vus: liste.map(l => l.chemin) });
  check('aucun alias (cvd_updated_at = cvd_window_end) en double', !liste.some(l => l.chemin === 'micro.cvd_updated_at'));
  check('chaque horloge se lit comme un instant (dates seules comprises : dxy_date)', liste.every(l => l.t !== null), liste.filter(l => l.t === null));
  { const md = copie(MD); md.meta.champs['micro.essai_at'] = { libelle: 'Essai', nature: 'horodatage', source: 'test', params: {} }; md.micro.essai_at = '2026-10-07T10:00:00+00:00';
    check('un horodatage ajouté à meta.champs apparaît sans toucher le code', H.duFichier(md).some(l => l.chemin === 'micro.essai_at' && l.libelle === 'Essai')); }
  check('meta absent (format antérieur) → liste vide, pas d’erreur', H.duFichier({ updated: 'x' }).length === 0);
  const f = liste.find(l => l.chemin === 'micro.funding_prochain_at'), t0 = Date.parse(MD.updated);
  check(`compte à rebours : prochain funding « ${H.texteAge(t0 - f.t)} » à la publication`, /^dans \d+ min$/.test(H.texteAge(t0 - f.t)));

  titre('2. Classes de panne');
  const cl = o => H.classer(o).classe;
  check('HTTP 451 → refus régional', cl({ status: 451 }) === 'refus_regional' && /451/.test(H.classer({ status: 451 }).libelle));
  check('HTTP 429 et 418 → limite', cl({ status: 429 }) === 'limite' && cl({ status: 418 }) === 'limite');
  check('HTTP 503 → serveur', cl({ status: 503 }) === 'serveur' && cl({ status: 500 }) === 'serveur');
  check('navigator.onLine = false → hors ligne (même avec un statut)', cl({ enLigne: false, status: 503 }) === 'hors_ligne');
  check('TypeError (fetch rejeté) → hors ligne', cl({ erreur: new TypeError('Failed to fetch') }) === 'hors_ligne');
  check('SyntaxError (corps illisible) → JSON invalide', cl({ erreur: new SyntaxError('Unexpected token <') }) === 'json');
  check('erreur portant son statut (verifier) → la classe du statut', cl({ erreur: (() => { try { H.verifier({ ok: false, status: 451 }); } catch (e) { return e; } })() }) === 'refus_regional');
  check('404 → réponse HTTP inattendue (404)', H.classer({ status: 404 }).libelle === 'réponse HTTP inattendue (404)');
  const s = H.seuilFige();
  check(`sans mesure : seuil figé = fige_min de js/cadences.js (« ${s.texte} »)`, s.ms === CADENCES.fige_min * 60000 && s.texte === 'attendue ' + CADENCES.attendue_min + ' min (convention)');
  check('âge au-delà du seuil → figé ; en deçà → rien', cl({ ageMs: s.ms + 1, seuilFigeMs: s.ms }) === 'fige' && cl({ ageMs: s.ms - 1, seuilFigeMs: s.ms }) === null);
  const m = H.seuilFige(10 * 60000);
  check('cadence mesurée 10 min → figé au-delà de 2 × 10 min + la marge', m.ms === 20 * 60000 + CADENCES.marge_publication_s * 1000 && /mesurée 10 min/.test(m.texte));

  titre('3. Décalage avec Binance');
  const e = H.echantillon(1000, 5000, 1400);
  check('S − (s + r)/2 et (r − s)/2', e.decalage === 3800 && e.incertitude === 200);
  const r = H.retenir([H.echantillon(0, 900, 600), H.echantillon(0, 400, 100), H.echantillon(0, 2000, 3000)]);
  check('l’aller-retour le plus court gagne', r.incertitude === 50 && r.decalage === 350);
  check('écart ≤ 1 s : rien à dire', H.texteEcart({ decalage: -800, incertitude: 30 }) === '');
  check('PC en avance de 1,5 s → « écart ≈ +1,5 s »', /^horloge de ce PC : écart ≈ \+1,5 s/.test(H.texteEcart({ decalage: -1500, incertitude: 40 })));
  await H.mesurer('https://api/time', async () => ({ ok: true, status: 200, json: async () => ({ serverTime: Date.now() + 60000 }) }));
  check('mesurer : un serveur 60 s en avance → maintenant() avance d’environ 60 s', Math.abs(H.maintenant() - Date.now() - 60000) < 2000);
  await H.mesurer('https://api/time', async () => ({ ok: false, status: 451, json: async () => ({}) }));
  check('mesurer : un 451 est noté (refus régional), le décalage précédent reste', H.sources.binance_time.classe === 'refus_regional' && Math.abs(H.maintenant() - Date.now() - 60000) < 2000);
  check('grain des âges : < 5 s, 15 s, 3 min, 2 h 05, dans 4 min', H.texteAge(2000) === '< 5 s' && H.texteAge(17000) === 'il y a 15 s' && H.texteAge(200000) === 'il y a 3 min'
    && H.texteAge(125 * 60000) === 'il y a 2 h 05' && H.texteAge(-4 * 60000 - 100) === 'dans 4 min');

  titre('4. Dans la page');
  let mode = 'ok';
  const DATA = JSON.parse(fs.readFileSync(path.join(REPO, 'market-data.json'), 'utf8'));
  const page = chargerPage({ fetch: async (url) => {
    if (mode === '451') return { ok: false, status: 451, json: async () => ({ code: 0, msg: 'restricted' }) };
    if (mode === 'panne') throw new TypeError('Failed to fetch');
    if (/ticker/.test(url)) return { ok: true, status: 200, json: async () => ({ lastPrice: '83000', openPrice: '82000' }) };
    if (mode === 'json' && /market-data/.test(url)) return { ok: true, status: 200, text: async () => '<html>', json: async () => { throw new SyntaxError('Unexpected token <'); } };
    if (mode === '429') return { ok: false, status: 429, json: async () => ({}) };
    return { ok: true, status: 200, text: async () => JSON.stringify(DATA), json: async () => DATA };
  } });
  const HP = vm.runInContext('Horloges', page.sandbox);
  await page.T.fetchMarket(true);   // la réponse préchargée par le script de tête (servie une fois)
  await page.T.fetchPrice();
  check('prix lu → succès noté', HP.sources.prix && HP.sources.prix.ok && !HP.sources.prix.classe);
  mode = '451'; await page.T.fetchPrice();
  check('prix refusé (451) → « refus régional (HTTP 451) » noté pour le prix', HP.sources.prix.classe === 'refus_regional');
  // Revue du 14/10 (C11) : Binance injoignable, la bulle du voyant disait encore « Le prix du haut
  // est lu à la seconde ». Elle suit maintenant le prix à chaque lecture ; la teinte ne bouge pas.
  {
    const dot = page.T.el('dot'), td = page.T.el('taskbarDot');
    const teinte = { ok: 'var(--up)', retard: 'var(--warn)', fige: 'var(--down)', inconnu: 'var(--ink-3)' }[page.T.etatPublication(page.T.marketData.updated).etat];
    check(`prix refusé : la bulle du voyant le dit tout de suite (« ${dot.title.split('. ')[1]} »), barre des tâches de même ; la teinte reste celle de l’âge de la publication`,
      /Le prix du haut n’arrive pas : refus régional \(HTTP 451\)\.$/.test(dot.title) && !/lu à la seconde/.test(dot.title) && td.title === dot.title && dot.style.background === teinte, [dot.title, dot.style.background, teinte]);
    mode = 'ok'; await page.T.fetchPrice();
    check('prix revenu : « Le prix du haut est lu à la seconde » à la lecture suivante', /Le prix du haut est lu à la seconde\.$/.test(dot.title), dot.title);
    // Le graphique sans bougies : « Chargement… » tant qu'aucune lecture n'a échoué, sinon il dit la
    // panne, sur deux lignes (une idée par ligne ; elles tiennent à 360 px, test_entete les mesure).
    const attente = () => vm.runInContext('texteAttente()', page.sandbox).join(' / ');
    const a0 = attente();
    HP.noter('bougies', new TypeError('Failed to fetch'));   // ce que note fetchKlines quand Binance et son miroir ne répondent pas
    const a1 = attente();
    HP.noter('bougies');
    check(`graphique sans bougies : « ${a0} », puis, Binance injoignable, « ${a1} »`, /^Chargement BTC\/USDT · /.test(a0)
      && a1 === 'Binance injoignable depuis ce poste / Nouvel essai bientôt' && HP.sources.bougies.classe === null && /^Chargement/.test(attente()), [a0, a1]);
    mode = '451'; await page.T.fetchPrice();
  }
  mode = 'json'; await page.T.fetchMarket(true);
  check('market-data.json illisible → « JSON invalide », dit dans les cartes', HP.sources.marche.classe === 'json' && /JSON invalide/.test(page.T.el('feed').innerHTML));
  mode = '429'; await vm.runInContext('renderLive', page.sandbox)();
  check('⚡ limité (429) → « limite de requêtes atteinte », dit dans le panneau', HP.sources.live.classe === 'limite' && /limite de requêtes/.test(page.T.el('liveModalBody').innerHTML));
  mode = 'ok'; await page.T.fetchMarket(true);
  const feed = page.T.el('feed').innerHTML;
  check('la carte Horloges nomme la panne du prix et celle du ⚡', /carte-horloges/.test(feed) && /refus régional \(HTTP 451\)/.test(feed) && /limite de requêtes atteinte/.test(feed));
  const vieux = Object.assign({}, DATA, { updated: new Date(Date.now() - (CADENCES.fige_min + 5) * 60000).toISOString() });
  const lignes = HP.dePage({ marche: vieux });
  check('publication plus vieille que le seuil → « fichier figé », cadence dite « (convention) »', lignes.find(l => l.cle === 'marche').classe === 'fige' && /convention/.test(lignes.find(l => l.cle === 'marche').seuil));
  // Couche de chaleur : ses deux âges, sur le calque.
  vm.runInContext(`histHeatmap = { updated: '${new Date(Date.now() - 7 * 60000).toISOString()}', majA: Date.now() - 7 * 60000, sym: 'BTCUSDT',
    grille: { t0: Math.floor((Date.now() - 9 * 60000) / 60000) * 60 - 60 * 99, dt: 60, W: 100 } }`, page.sandbox);
  const c = vm.runInContext('texteAgeCouche()', page.sandbox);
  check(`âge de la couche : « ${c.texte} »`, /^Ordres en attente \(carte\) · dernière colonne il y a (9|10) min · publiée il y a 7 min$/.test(c.texte) && c.vieux === false);

  // Revue du 14/10/2026 (M7, fonctionnement-12) : au même moment, la bulle d'un mur disait « il y a
  // 2 h », le voyant « 91 min » ; à 5 h de retard, la pastille disait « 300 min ». Une seule règle
  // (Fmt.duree) : les minutes jusqu'à 90, puis « 1 h 31 », « 5 h ».
  titre('5. Une seule règle pour les âges : « 89 min », « 1 h 31 », « 5 h »');
  const Fm = require(path.join(REPO, 'js/format.js')), Gd = require(path.join(REPO, 'js/guide.js'));
  check('Fmt.duree : 89 min, 1 h 30, 1 h 31, 5 h, 5 h 03', Fm.duree(89) === '89 min' && Fm.duree(90) === '1 h 30' && Fm.duree(91) === '1 h 31' && Fm.duree(300) === '5 h' && Fm.duree(303) === '5 h 03',
    [89, 90, 91, 300, 303].map(Fm.duree));
  const tA = Date.now(), ages = [91, 300].map(m => [H.texteAge(m * 60000), Gd.ageDebutant(tA - m * 60000, tA, true)]);
  check(`bulle et carte Horloges disent le même âge : ${JSON.stringify(ages)}`, ages[0][0] === 'il y a 1 h 31' && ages[0][1] === 'il y a 1 h 31' && ages[1][0] === 'il y a 5 h' && ages[1][1] === 'il y a 5 h', ages);
  const voyant = vm.runInContext('titreVoyant(91, "fige")', page.sandbox), pastille = vm.runInContext('titreKpiDeb(300)', page.sandbox);
  const bandeau = page.T.ageBannerHtml({ updated: new Date(Date.now() - 300 * 60000).toISOString() }).replace(/<[^>]+>/g, '');
  check('voyant « il y a 1 h 31 », pastille « il y a 5 h », bandeau « figées depuis 5 h » (jamais « 91 min » ni « 300 min »)',
    /il y a 1 h 31 \(/.test(voyant) && /il y a 5 h \(/.test(pastille) && /figées depuis 5 h :/.test(bandeau) && !/91 min|300 min/.test(voyant + pastille + bandeau), { voyant, pastille, bandeau });
  page.T.setData(Object.assign({}, DATA, { updated: new Date(Date.now() - 300 * 60000).toISOString() }));
  page.T.renderFeedTo(page.T.el('feed'));
  const f5 = page.T.el('feed').innerHTML;
  check('cartes des infos du marché à 5 h : « il y a 5 h », plus de « 300 min »', /il y a <span data-age-de="[^"]+">5 h<\/span>/.test(f5) && !/300<\/span> min|300 min/.test(f5), (f5.match(/data-age-de="[^"]+">[^<]*<\/span>[^<]{0,8}/g) || []).slice(0, 3));

  console.log(ko ? `\n❌ HORLOGES : ${ko} contrôle(s) en échec` : '\n✅ HORLOGES : TOUS LES CONTRÔLES PASSENT');
  process.exit(ko ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
