/* ══════════════════════════════════════════════════════════════════════════════
   Saṃsāra — Carte (bookmap) : l'interface. Les calculs sont dans js/bookmap-calc.js.

   La page est AUTONOME : elle ne partage aucun code avec le terminal (index.html, js/app.js),
   qu'elle ne modifie pas. Elle lit deux fichiers publiés (heatmap.json, market-data.json)
   et interroge Binance elle-même — rien d'autre (contrat réseau : tests/test_contrat.py).
   Depuis le 08/10/2026, un troisième fichier publié, executions.json (executions.py, service
   permanent du VPS), porte 24 h d'exécutions : la carte les montre AVANT ce que la page a lu.

   ORDRE DES CALQUES — le prix est une ligne SUR la chaleur, pas l'inverse :
     chaleur (carte publiée, puis carnet live) → « non observé » hachuré → mémoire du carnet
     (bord droit) → murs → gamma → bid/ask → ligne de prix → exécutions → rafales → âges → axes,
     carnet latéral, profil, volumes.

   CADENCES (et pourquoi) — poids Binance par minute, plafond 6 000 par adresse IP :
     carnet 1 000 niveaux / 2 s (poids 50) ≈ 1 500 ; exécutions / 1 s (poids 4) ≈ 240 ;
     bougies 1 min / 10 s (poids 2) ≈ 12 ; heure du serveur / 5 min (poids 1).
     Lectures à pas FIXE, avec un délai maximal ; arrêtées quand l'onglet est caché, reprises
     au retour (rattrapage). Sur 429 / 418, TOUTES les lectures Binance attendent (recul).
     Le temps réel (flux à 100 ms) n'est pas construit ici : il dépend d'une sonde réseau.

   HORLOGES — l'axe du temps est à l'heure de BINANCE (BM.Horloge) : exécutions et bougies y sont
     nativement ; les instants notés par la page y sont recalés par l'écart mesuré.
   ══════════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const BM = window.BM;
  const RAW = 'https://raw.githubusercontent.com/lorenzoapro12-jpg/samsara-live/master/';
  const HEATMAP_URL = RAW + 'heatmap.json';
  const DATA_URL = RAW + 'market-data.json';
  const EXEC_URL = RAW + 'executions.json';
  const LOIN_URL = RAW + 'profondeur.json';     // carnet Coinbase ±10 % (profondeur.py), 5 min × 100 $
  // Branche `direct` (heatmap.py, 08/10/2026) : les 30 dernières minutes, publiées chaque minute.
  // Elle comble le retard de master (15 min) : il ne reste que le cache de raw.githubusercontent.
  const DIRECT = 'https://raw.githubusercontent.com/lorenzoapro12-jpg/samsara-live/direct/';
  const API = 'https://data-api.binance.vision/api/v3/';
  const SYMBOLE = 'BTCUSDT';

  // ─── Réglages : changent le DÉTAIL, jamais une valeur affichée ──────────────
  const CLE = 'samsara-carte-v1';
  // Mémoire, Rafales et Destin des murs s'allument à la demande (boutons du ruban) : allumés
  // ensemble, leurs libellés et leurs pastilles se chevauchaient sur la chaleur.
  const DEFAUTS = {
    calques: { publiee: true, live: true, executions: true, prix: true, bidask: true, murs: true,
      gamma: true, profil: true, dom: true, volume: true, cvd: true, memoire: false, rafales: false, destin: false, loin: true },
    palette: 'classique',
    seuilBas: 2,          // intensité sous laquelle rien n'est peint
    saturation: 200,      // intensité à partir de laquelle la couleur est au maximum
    fusionT: 1,           // carte publiée : colonnes fusionnées (MAX)
    fusionP: 1,           // carte publiée : tranches fusionnées (MAX)
    niveauxLive: 1000,
    dpLive: 20,           // tranche du carnet live, en $ : celle de la carte publiée (même image des deux côtés)
    bulleMin: 0.1,        // BTC
    bulleEchelle: 1,
    presenceSeuil: BM.PRESENCE.defautBtc,   // BTC demandés : la carte écrit le cran publié qui les porte
    rafaleMin: BM.RAFALES.defautBtc,        // BTC
    mursSeuil: BM.MURS.defautBtc,           // BTC : niveaux suivis par le destin des murs
  };
  const CADENCE_CARNET = { 100: 1000, 500: 1000, 1000: 2000, 5000: 10000 };
  const POIDS_CARNET = { 100: 5, 500: 25, 1000: 50, 5000: 250 };
  // Les choix de la mémoire et des rafales viennent des constantes du calcul (BM.PRESENCE,
  // BM.RAFALES) : écrits dans les <select> AVANT la lecture des réglages, qui les valide contre eux.
  function remplirChoix() {
    const remplir = (id, vals, txt) => { const el = document.getElementById(id); if (el && !el.options.length) el.innerHTML = vals.map(v => '<option value="' + v + '">' + txt(v) + '</option>').join(''); };
    remplir('rPresence', BM.PRESENCE.seuilsBtc, v => '≥ ' + BM.nombre(v, 0, 2) + ' BTC');
    remplir('rRafaleMin', BM.RAFALES.seuilsBtc, v => BM.nombre(v, 0, 2) + ' BTC');
    remplir('rMurs', BM.MURS.seuilsBtc, v => '≥ ' + BM.nombre(v, 0, 2) + ' BTC');
  }
  remplirChoix();
  const R = charger();

  /** Les réglages stockés, VALIDÉS contre ce que la page permet — les listes viennent des
   *  <option> et des bornes des curseurs de bookmap.html : elles ne peuvent pas diverger. */
  function charger() {
    let r = {};
    try { r = JSON.parse(localStorage.getItem(CLE) || '{}') || {}; } catch (e) { r = {}; }
    const el = id => document.getElementById(id);
    const liste = (id, nombre) => ({ liste: [...document.querySelectorAll('#' + id + ' option')].map(o => o.value), nombre });
    const plage = id => (el(id) ? { min: +el(id).min, max: +el(id).max, entier: true } : null);
    const regles = {
      palette: liste('rPalette', false), fusionT: liste('rFusionT', true), fusionP: liste('rFusionP', true),
      niveauxLive: liste('rNiveaux', true), dpLive: liste('rDpLive', true), bulleMin: liste('rBulleMin', true),
      bulleEchelle: liste('rBulleEchelle', true), seuilBas: plage('rSeuil'), saturation: plage('rSaturation'),
      presenceSeuil: liste('rPresence', true), rafaleMin: liste('rRafaleMin', true),
      mursSeuil: liste('rMurs', true),
    };
    const { reglages, rejets } = BM.validerReglages(r, DEFAUTS, regles);
    if (!CADENCE_CARNET[reglages.niveauxLive]) reglages.niveauxLive = DEFAUTS.niveauxLive;
    reglages.rejets = rejets.length ? rejets : undefined;
    return reglages;
  }
  function sauver() { try { const r = Object.assign({}, R); delete r.rejets; localStorage.setItem(CLE, JSON.stringify(r)); } catch (e) { /* navigation privée */ } }

  // ─── État ──────────────────────────────────────────────────────────────────
  // Instants : ce qui vient de Binance (exécutions T, bougies) est à l'heure du SERVEUR ; les
  // instants de lecture notés par la page (…A, …Lu, bid / ask) sont LOCAUX (Date.now()) et passent
  // sur l'axe par axe(), avec l'écart mesuré par E.horloge. L'axe du temps est à l'heure Binance.
  const E = {
    pub: null, pubF: null, pubCle: '', pubMaj: null, pubLu: null, pubTexte: null, pubN: 0,
    pubBrut: null, directBrut: null, directTexte: null,      // heatmap.json de master et de `direct`, analysés
    loin: null, loinN: 0, loinBrut: {}, loinTexte: {},       // profondeur lointaine (Coinbase), peinte SOUS la carte ; brut et dates par source
    md: null, niv: null, mdLu: null, mdTexte: null,
    live: null, liveRef: null, liveP99: 0, liveEcartees: 0, carnet: null, carnetA: null, liveV: 0,
    exec: new BM.SeauxExecutions(1), execVus: new Set(), execArriere: null, execTrous: [], execLu: null,
    // Exécutions publiées (executions.json) : `frontiere` (ms) = avant elle, les seaux publiés ;
    // après, ce que la page lit elle-même. Fixée à la première lecture, jamais déplacée.
    execPub: null,
    raf: new BM.Rafales(),     // rafales au marché : alimentées par les MÊMES exécutions acceptées
    murs: null,                // destin des murs (BM.SuiviMurs) : carnet BRUT + mêmes exécutions
    minutes: [], minutesA: null,
    bidask: [],
    erreurs: {},
    horloge: new BM.Horloge(),
    recul: { binance: new BM.Recul(), github: new BM.Recul() },
    vue: null, suivre: true,
    souris: null,
    session: Date.now(),
  };
  /** L'instant présent sur l'axe du temps : l'heure de Binance. */
  const maintenant = () => E.horloge.maintenant();
  /** Un instant LOCAL noté par la page, placé sur l'axe (heure Binance). */
  const axe = local => local + E.horloge.ecart;
  /** Destin des murs : un suivi neuf (cadence changée). TOUS les seuils proposés sont suivis à la
   *  fois : le réglage choisit lequel montrer, sans rien remettre à zéro. Les exécutions déjà lues et
   *  leur couverture passent au nouveau suivi : il n'attend pas la prochaine page pour classer. */
  function reinitMurs() {
    const v = E.murs, n = new BM.SuiviMurs(BM.MURS.seuilsBtc, CADENCE_CARNET[R.niveauxLive]);
    if (v) { n.trades = v.trades; n.couvert = v.couvert; n.complet = v.complet; }
    E.murs = n;
  }
  reinitMurs();

  // ─── Réseau ────────────────────────────────────────────────────────────────
  // Délai maximal par source (≈ 2 à 3 cadences) : une requête qui ne répond pas (bascule Wi-Fi /
  // 4G, flux bloqué) ne fige plus sa source sans rien dire — elle échoue, l'erreur s'affiche, et
  // la boucle réessaie.
  const DELAIS = { carnet: 5e3, executions: 5e3, bougies: 15e3, horloge: 5e3, carte: 30e3, fichier: 15e3 };
  /** fetch avec délai maximal et porte de l'hôte (429 / 418). Rend { corps, s, r } : instants
   *  LOCAUX d'envoi et de réception (en-têtes reçus). Une porte fermée ne laisse rien partir. */
  async function lire(url, o) {
    const porte = o.porte;
    if (porte && porte.attente(Date.now()) > 0) { const e = new Error('en pause (limite de requêtes)'); e.pause = true; throw e; }
    const ac = new AbortController(), minuteur = setTimeout(() => ac.abort(), o.delai);
    try {
      const s = Date.now();
      let rep;
      try { rep = await fetch(url, { cache: o.cache || 'default', signal: ac.signal }); }
      catch (e) { throw new Error(ac.signal.aborted ? 'pas de réponse en ' + o.delai / 1000 + ' s' : 'réseau injoignable'); }
      const r = Date.now();
      if (rep.status === 429 || rep.status === 418) {
        if (porte) porte.echec(rep.status, BM.lireRetryAfter(rep.headers.get('retry-after'), r), r);
        majStatut();
        const e = new Error('HTTP ' + rep.status); e.limite = true; throw e;
      }
      if (!rep.ok) throw new Error('HTTP ' + rep.status);
      let corps;
      try { corps = o.texte ? await rep.text() : await rep.json(); }
      catch (e) { throw new Error(ac.signal.aborted ? 'réponse incomplète en ' + o.delai / 1000 + ' s' : 'réponse illisible'); }
      if (porte) porte.succes();
      return { corps, s, r };
    } finally { clearTimeout(minuteur); }
  }
  const binance = (chemin, delai) => lire(API + chemin, { delai, porte: E.recul.binance });
  function erreur(src, e) {
    if (e && e.pause) return;      // porte fermée : le statut le dit déjà (et garde la cause, 429 / 418)
    E.erreurs[src] = e ? (e.message || String(e)) : null;
    majStatut();
  }

  // L'horloge de Binance : un échantillon toutes les 5 min (poids 1), et au retour sur l'onglet.
  async function lireHorloge() {
    try {
      const { corps, s, r } = await binance('time', DELAIS.horloge);
      if (E.horloge.echantillon(s, r, +corps.serverTime)) { if (E.live) E.live.recaler(E.horloge.ecart); liveChange(); bientot(); }
      erreur('horloge', null);
    } catch (e) { erreur('horloge', e); throw e; }
  }

  // Les deux fichiers publiés : relus avec revalidation (cache 'no-cache' : un 304 ne retransfère
  // rien). Un paramètre ?t= ne servait à rien — le CDN l'ignore — sinon à empêcher le 304. Le texte
  // n'est analysé que si sa date de publication, lue en tête, a changé.
  async function lireHeatmap() {
    try {
      const { corps: txt } = await lire(HEATMAP_URL, { delai: DELAIS.carte, cache: 'no-cache', texte: true, porte: E.recul.github });
      E.pubLu = Date.now();
      const maj = BM.majEnTete(txt);
      if (E.pub && maj !== null && maj === E.pubTexte) { erreur('carte', null); return; }
      const h = JSON.parse(txt);
      if (!BM.grillePubliee(h)) throw new Error('format non reconnu par cette page');
      E.pubBrut = h; E.pubTexte = maj;
      composerCarte();
      erreur('carte', null);
    } catch (e) { erreur('carte', e); throw e; }
  }
  /** Un fichier de master (24 h) prolongé par son double de `direct` (30 dernières minutes) : une
   *  colonne présente dans les deux est prise dans `direct`, plus récente. Seulement si les deux
   *  sont en « colonnes-1 » avec le même pas et le même encodage ; sinon master seule. */
  function prolonger(h, d) {
    if (!(h && d && Array.isArray(h.colonnes) && Array.isArray(d.colonnes) && d.colonnes.length && h.dt === d.dt && h.dp === d.dp
      && JSON.stringify(h.encodage || null) === JSON.stringify(d.encodage || null))) return h;
    const m0 = d.colonnes[0][0], cols = h.colonnes.filter(c => c[0] < m0).concat(d.colonnes);
    return Object.assign({}, h, { colonnes: cols, t0: cols[0][0] * h.dt, updated: d.updated > h.updated ? d.updated : h.updated });
  }
  function composerCarte() {
    const src = prolonger(E.pubBrut, E.directBrut);
    const g = src && BM.grillePubliee(src);
    if (!g) return;
    E.pub = g; E.pubMaj = g.majA; E.pubN++;
    E.pubF = null; E.pubCle = '';
    appliquerEchelle();          // l'échelle live suit l'encodage, qu'il arrive ou qu'il disparaisse
    majLegende();
    bientot();
  }
  /** profondeur.json : le carnet complet de Coinbase sur ±10 %, peint sous la carte de Binance (qui
   *  ne voit que ≈ ±1 %). Celui de master (24 h, toutes les 5 min) prolongé par celui de `direct`
   *  (lu chaque minute avec la branche), comme la carte. Absent (404) : rien ne change. */
  async function lireProfondeur(url, cle) {
    url = url || LOIN_URL; cle = cle || 'master';
    try {
      const { corps: txt } = await lire(url, { delai: DELAIS.carte, cache: 'no-cache', texte: true, porte: E.recul.github });
      const maj = BM.majEnTete(txt);
      if (E.loinBrut[cle] && maj !== null && maj === E.loinTexte[cle]) { erreur('profondeur', null); return; }
      const d = JSON.parse(txt);
      if (!BM.grillePubliee(d)) throw new Error('format non reconnu par cette page');
      E.loinBrut[cle] = d; E.loinTexte[cle] = maj;
      composerLoin();
      erreur('profondeur', null);
    } catch (e) {
      if (e && e.message === 'HTTP 404') { erreur('profondeur', null); return; }
      erreur('profondeur', e); throw e;
    }
  }
  function composerLoin() {
    const src = prolonger(E.loinBrut.master, E.loinBrut.direct);
    const g = src && BM.grillePubliee(src);
    if (!g) return;
    E.loin = g; E.loinN++;
    bientot();
  }
  /** Branche `direct` : carnet, exécutions et profondeur Coinbase des 30 dernières minutes, relus
   *  chaque minute. Absente (404 : VPS pas encore à jour) : rien ne change. */
  async function lireDirect() {
    try {
      const { corps: txt } = await lire(DIRECT + 'heatmap.json', { delai: DELAIS.carte, cache: 'no-cache', texte: true, porte: E.recul.github });
      const maj = BM.majEnTete(txt);
      if (maj === null || maj !== E.directTexte) {
        E.directBrut = JSON.parse(txt); E.directTexte = maj;
        if (E.pubBrut) composerCarte();
      }
      await lireExecutionsPubliees(DIRECT + 'executions.json', 'direct');
      await lireProfondeur(DIRECT + 'profondeur.json', 'direct');
      erreur('direct', null);
    } catch (e) {
      if (e && e.message === 'HTTP 404') { erreur('direct', null); return; }
      erreur('direct', e); throw e;
    }
  }
  async function lireMarketData() {
    try {
      const { corps: txt } = await lire(DATA_URL, { delai: DELAIS.fichier, cache: 'no-cache', texte: true, porte: E.recul.github });
      E.mdLu = Date.now();
      const maj = BM.majEnTete(txt);
      if (E.md && maj !== null && maj === E.mdTexte) { erreur('fichier', null); return; }
      const md = JSON.parse(txt);
      E.md = md; E.mdTexte = maj; E.niv = BM.niveauxPublies(md);
      erreur('fichier', null);
      bientot();
    } catch (e) { erreur('fichier', e); throw e; }
  }

  // Bougies 1 min : toujours relues DEPUIS la dernière minute gardée (startTime, pages de 1 000) —
  // et depuis 24 h tant que l'historique ne les couvre pas. Une absence (onglet caché, veille,
  // coupure) est donc comblée au retour, et un premier chargement raté est retenté au tour
  // suivant. Ce que Binance ne rend pas reste un TROU, montré : ligne de prix coupée, volume et
  // CVD hachurés, CVD qui repart de 0 et le dit.
  const FENETRE_BOUGIES = 24 * 3600e3, GARDE_BOUGIES = 26 * 3600e3, PAGES_BOUGIES = 4;
  async function lireMinutes() {
    try {
      const debut24 = Math.floor((maintenant() - FENETRE_BOUGIES) / 60e3) * 60e3;
      const couvert = E.minutes.length && E.minutes[0].t <= debut24 + 60e3;
      let depuis = couvert ? E.minutes[E.minutes.length - 1].t : debut24;
      for (let p = 0; p < PAGES_BOUGIES; p++) {
        const k = (await binance('klines?symbol=' + SYMBOLE + '&interval=1m&startTime=' + depuis + '&limit=1000', DELAIS.bougies)).corps;
        E.minutes = BM.fusionnerMinutes(E.minutes, BM.minutes(k));
        if (k.length < 1000) break;
        depuis = +k[k.length - 1][0] + 60e3;
      }
      const lim = maintenant() - GARDE_BOUGIES;
      if (E.minutes.length && E.minutes[0].t < lim) E.minutes = E.minutes.filter(m => m.t >= lim);
      E.minutesA = Date.now();
      erreur('bougies', null);
      if (!E.vue) vueParDefaut();
      bientot();
    } catch (e) { erreur('bougies', e); throw e; }
  }

  // Exécutions : les 1 000 dernières, puis un remplissage ARRIÈRE (pages de 1 000) jusqu'à la
  // fin de la carte publiée (ou 30 pages), puis la suite par identifiant (`fromId` reprend
  // exactement après le dernier identifiant vu). Une absence est RATTRAPÉE page par page
  // (5 par tour) ; au-delà de 30 min de retard, on saute au présent et l'intervalle sauté devient
  // un trou de lecture — hachuré, compté dans le profil, jamais lu comme « aucune exécution ».
  const PAGES_ARRIERE = 30, PAGES_PAR_TOUR = 5, RATTRAPAGE_MAX = 30 * 60e3, GARDE_EXECUTIONS = 24 * 3600e3;
  let execInit = null;
  function lireExecutionsInitiales() { return execInit || (execInit = lireExecutionsInitiales0().finally(() => { if (E.exec.dernierId === null) execInit = null; })); }
  async function lireExecutionsInitiales0() {
    try {
      const { corps: t, s } = await binance('aggTrades?symbol=' + SYMBOLE + '&limit=1000', DELAIS.executions);
      for (const x of t) { if (E.exec.ajouter(x)) { E.raf.ajouter(x); E.murs.execution(x); } E.execVus.add(x.a); }
      E.execLu = s;
      E.murs.completes(s);       // les plus récentes : rien ne manque jusqu'à l'envoi
      erreur('executions', null);
      bientot();
      if (t.length) { E.execArriere = { id: t[0].a, T: t[0].T, pages: 0, fini: false, enCours: false }; remplirArriere(); }
    } catch (e) { erreur('executions', e); throw e; }
  }
  /** Remplissage arrière ; interrompu (erreur, limite), il reprend au tour suivant. */
  async function remplirArriere() {
    const A = E.execArriere;
    if (!A || A.fini || A.enCours) return;
    A.enCours = true;
    // Avec les exécutions publiées, le remplissage s'arrête à leur frontière : avant, elles y sont.
    const objectif = () => (E.execPub ? E.execPub.frontiere : (E.pub ? BM.finGrille(E.pub) : maintenant() - 15 * 60e3) - 60e3);
    try {
      // A.T, pas E.exec.premier : les seaux publiés reculent `premier` sans rien lire ici.
      while (A.pages < PAGES_ARRIERE && A.id > 0 && A.T > objectif()) {
        if (document.hidden) return;              // repris par lireExecutions au retour sur l'onglet
        const depuis = Math.max(0, A.id - 1000);
        const t = (await binance('aggTrades?symbol=' + SYMBOLE + '&fromId=' + depuis + '&limit=' + (A.id - depuis), DELAIS.executions)).corps;
        // Les rafales recousent la limite de page (identifiants contigus, même ms, même côté).
        const F = E.execPub ? E.execPub.frontiere : -Infinity;      // avant : déjà versé depuis le fichier
        E.raf.ajouterAncien(t.filter(x => x.T >= F && E.exec.ajouterAncien(x, E.execVus)));
        A.id = depuis; A.pages++;
        if (t.length) A.T = t[0].T;
        bientot();
        await pause(150);
      }
      A.fini = true;
      E.raf.finArriere();
      E.execVus = new Set();        // l'unicité arrière n'a plus d'usage ; le direct suit dernierId
    } catch (e) { erreur('executions', e); }
    finally { A.enCours = false; bientot(); }
  }
  async function lireExecutions() {
    if (E.exec.dernierId === null) return lireExecutionsInitiales();
    try {
      let n = 0;
      // Trop de retard pour rattraper (absence longue) : on saute au présent, et on le DIT.
      if (maintenant() - execLuJusqua() > RATTRAPAGE_MAX) {
        const der = (await binance('aggTrades?symbol=' + SYMBOLE + '&limit=1', DELAIS.executions)).corps;
        if (der.length && der[0].a - 1 > E.exec.dernierId) { E.execTrous.push([E.exec.dernier, der[0].T]); E.exec.dernierId = der[0].a - 1; E.murs.trou(der[0].T); }
      }
      for (let p = 0; p < PAGES_PAR_TOUR; p++) {
        const { corps: t, s } = await binance('aggTrades?symbol=' + SYMBOLE + '&fromId=' + (E.exec.dernierId + 1) + '&limit=1000', DELAIS.executions);
        for (const x of t) if (E.exec.ajouter(x)) { n++; E.raf.ajouter(x); E.murs.execution(x); }
        if (t.length < 1000) { E.execLu = s; E.murs.completes(s); break; }         // tout est lu jusqu'à l'envoi de cette requête
      }
      // Destin des murs : les transitions dont les exécutions sont maintenant complètes sont classées.
      if (E.murs.avancer(E.horloge, Date.now())) n++;
      const lim = maintenant() - GARDE_EXECUTIONS;
      E.exec.purger(lim);
      E.raf.purger(lim);
      E.execTrous = E.execTrous.filter(([, b]) => b > lim);
      erreur('executions', null);
      if (E.execArriere && !E.execArriere.fini) remplirArriere();
      if (n) bientot();
    } catch (e) { erreur('executions', e); throw e; }
  }
  /** Jusqu'où les exécutions sont lues sans trou : la dernière requête qui a tout rendu, ou —
   *  pendant un rattrapage — la dernière exécution reçue. */
  function execLuJusqua() { return Math.max(E.execLu !== null ? axe(E.execLu) : -Infinity, E.exec.dernier || -Infinity); }
  /** executions.json : 24 h de seaux (dt s × dp $, achats / ventes au marché) lus par le VPS.
   *  Versés dans les MÊMES seaux que les exécutions lues ici, à l'instant du milieu de leur seau et
   *  au milieu de leur tranche, sans jamais compter deux fois une exécution :
   *   · avant la frontière (fixée à la première lecture : la fin de ce que le fichier a lu, ou plus
   *     tôt si la page a déjà remonté plus loin), seuls les seaux ENTIERS avant elle ;
   *   · dans un trou de lecture de la page (onglet caché, coupure), les seaux entièrement dedans,
   *     et le trou est refermé quand le fichier le couvre.
   *  Les rafales et le destin des murs n'en reçoivent rien : il leur faut chaque exécution. */
  async function lireExecutionsPubliees(url, cle) {
    url = url || EXEC_URL; cle = cle || 'master';
    try {
      const { corps: txt } = await lire(url, { delai: DELAIS.carte, cache: 'no-cache', texte: true, porte: E.recul.github });
      const maj = BM.majEnTete(txt);
      if (E.execPub && maj !== null && maj === E.execPub.maj[cle]) { erreur('historique', null); return; }
      const d = JSON.parse(txt);
      if (d.format !== 'seaux-1' || !Array.isArray(d.seaux)) throw new Error('format non reconnu par cette page');
      const dtMs = d.dt * 1000, lu = (d.lu_jusqua || 0) * 1000;
      if (!E.execPub) {
        let F = Math.floor(lu / dtMs) * dtMs;
        if (E.exec.premier !== null) F = Math.min(F, Math.floor(E.exec.premier / dtMs) * dtMs);
        E.execPub = { frontiere: F, vus: new Set(), maj: {}, depuis: null, trous: [] };
      }
      const P = E.execPub, F = P.frontiere, ouverts = d.trous.map(([a, b]) => [a * 1000, b * 1000]);
      const dedans = (a, b) => E.execTrous.some(([x, y]) => a >= x && b <= y);
      let n = 0;
      for (const [k, bas, ach, ven] of d.seaux) {
        const a = k * dtMs, b = a + dtMs;
        if (P.vus.has(k) || !(b <= F || dedans(a, b))) continue;
        P.vus.add(k);
        const T = a + dtMs / 2;
        for (let i = 0; i < ach.length; i++) {
          const p = (bas + i + 0.5) * d.dp;
          if (ach[i]) { E.exec.verser({ T, p, q: ach[i] * d.unite_btc, m: false }); n++; }
          if (ven[i]) { E.exec.verser({ T, p, q: ven[i] * d.unite_btc, m: true }); n++; }
        }
      }
      // Les trous de la page que le fichier couvre en entier sont refermés (lus par le VPS).
      E.execTrous = E.execTrous.filter(([x, y]) => !(x >= (d.lu_depuis || Infinity) * 1000 && y <= lu && !ouverts.some(([a, b]) => a < y && b > x)));
      // `depuis` et les trous : ceux du fichier de 24 h (celui de `direct` ne couvre que 30 min).
      P.maj[cle] = maj;
      if (cle === 'master' || P.depuis === null) { P.depuis = d.lu_depuis ? d.lu_depuis * 1000 : null; P.trous = ouverts.filter(([, b]) => b <= F); }
      erreur('historique', null);
      if (n) bientot();
    } catch (e) {
      // Pas encore publié (service du VPS non installé) : rien à dire, la page lit seule comme avant.
      if (e && e.message === 'HTTP 404') { erreur('historique', null); return; }
      erreur('historique', e); throw e;
    }
  }
  /** Intervalles où les exécutions n'ont PAS été lues : trous sautés, et le retard en cours
   *  (rattrapage, lecture en échec) au-delà de la validité d'une lecture. */
  function execNonLues() {
    const out = E.execTrous.concat(E.execPub ? E.execPub.trous : []), lu = execLuJusqua(), now = maintenant();
    if (lu > -Infinity && now - lu > BM.validiteLecture(1000)) out.push([lu, now]);
    return out;
  }

  // Carnet live : une lecture = une colonne, à son instant réel, avec ses quantités (BM.CarnetLive).
  function reinitLive() { E.live = null; E.liveRef = null; E.liveP99 = 0; E.bidask = []; E.liveEcartees = 0; liveChange(); }
  /** Le calque live est à repeindre (lecture, échelle, horloge) : sa version change. */
  function liveChange() { E.liveV++; }
  /** L'échelle du carnet live : celle de la carte publiée quand le fichier publie son encodage ;
   *  sinon une échelle PROPRE (99ᵉ centile d'un carnet), non comparable — et la carte le dit. Elle
   *  suit l'encodage dans les DEUX sens : publié après le premier carnet, ou disparu en cours de
   *  séance. Les quantités étant gardées, le changement ré-encode tout, sans rien perdre. */
  function echelleLive(a) {
    const enc = E.pub && E.pub.encodage;
    if (enc && enc.ref_btc && enc.plafond) return { ref: 'publiee', cle: 'publiee:' + enc.ref_btc + ':' + enc.plafond, f: q => BM.intensite(q, enc) };
    if (!(E.liveP99 > 0)) {
      const qs = a ? [...a.bids.values(), ...a.asks.values()] : (E.live ? E.live.quantitesDerniere() : []);
      if (qs.length) E.liveP99 = BM.centile(qs, 0.99) || 1;
    }
    if (!(E.liveP99 > 0)) return null;
    const p99 = E.liveP99;
    return { ref: 'propre', cle: 'propre:' + p99, f: q => BM.intensiteRelative(q, p99) };
  }
  function appliquerEchelle(a) {
    const e = echelleLive(a);
    if (!E.live || !e) return;
    if (E.live.fixerEchelle(e.cle, e.f)) liveChange();
    E.liveRef = e.ref;
  }
  /** La carte publiée agrège-t-elle ses tranches en somme ? (encodage publié) */
  const sommePubliee = () => !!(E.pub && E.pub.encodage && E.pub.encodage.agregation_tranche === 'somme');
  /** Ce que dit une case : la somme de sa tranche, ou son plus gros niveau (colonnes publiées avant
   *  le passage à la somme, ou fichier qui ne le dit pas). */
  function natureCase(g, debutColonne) {
    if (g.creux) return g.somme ? 'somme de la tranche' : 'plus gros niveau';
    const enc = g.encodage || (E.pub && E.pub.encodage);
    if (!enc || enc.agregation_tranche !== 'somme') return 'plus gros niveau';
    const depuis = enc.agregation_depuis;
    return depuis === null || depuis === undefined || debutColonne >= depuis * 60e3 ? 'somme de la tranche' : 'plus gros niveau';
  }
  /** Le carnet n'est lu que si un calque s'en sert (chaleur live, carnet latéral, bid / ask) :
   *  1 000 niveaux toutes les 2 s, c'est ≈ 1 500 de poids Binance par minute et ≈ 19 Mo par heure. */
  const carnetUtile = () => R.calques.live || R.calques.dom || R.calques.bidask || R.calques.destin;
  async function lireCarnet() {
    const n = R.niveauxLive, cadence = CADENCE_CARNET[n];
    if (!carnetUtile()) { erreur('carnet', null); return; }
    try {
      const { corps: d, s, r } = await binance('depth?symbol=' + SYMBOLE + '&limit=' + n, DELAIS.carnet);
      // Destin des murs : le carnet BRUT, au prix exact (avant toute tranche). Éteint, il n'est pas
      // suivi : à la reprise, l'écart entre deux lectures le dit « interrompu ».
      if (R.calques.destin) E.murs.lecture(d, s, r, E.horloge);
      const a = BM.agregerCarnet(d, R.dpLive);
      // Le live compte TOUJOURS la somme d'une tranche, comme la carte publiée depuis le 08/10/2026 :
      // décidé avant de connaître heatmap.json, il n'a pas à repartir de zéro quand celui-ci arrive.
      a.bids = a.sb; a.asks = a.sa; a.somme = true;
      if (!E.live || E.live.dp !== a.dp || E.live.cadence !== cadence) { reinitLive(); E.live = new BM.CarnetLive(a.dp, cadence); E.live.somme = a.somme; E.live.recaler(E.horloge.ecart); }
      appliquerEchelle(a);
      // lastUpdateId doit croître strictement : un instantané plus ancien que le précédent (servi
      // par un autre nœud de Binance) est écarté, pas peint par-dessus le plus récent.
      const res = E.live.ajouter(a, s, r, d.lastUpdateId);
      if (res !== 'ok') { E.liveEcartees++; erreur('carnet', null); return; }
      const t = (s + r) / 2;      // instant LOCAL estimé de la lecture
      E.carnet = a; E.carnetA = t;
      if (a.meilleurBid && a.meilleurAsk) E.bidask.push({ t, bid: a.meilleurBid, ask: a.meilleurAsk });
      if (E.bidask.length > 20000) E.bidask.splice(0, 5000);
      erreur('carnet', null);
      liveChange();
      bientot();
    } catch (e) { erreur('carnet', e); throw e; }
  }

  // ─── Boucles de lecture ──────────────────────────────────────────────────────
  // À pas FIXE : la k-ième lecture part à debut + k·période ; la durée de la requête ne s'ajoute
  // pas à la période (elle faisait sauter des colonnes live). Sur échec : recul exponentiel par
  // source ; sur 429 / 418 : la porte de l'hôte (toutes les sources de l'hôte attendent). Onglet
  // caché : plus aucune lecture ; au retour, chaque source repart tout de suite (rattrapage).
  const boucles = [];
  function boucle(nom, fn, periode, porte) {
    const per = () => (typeof periode === 'function' ? periode() : periode);
    const b = { nom, debut: Date.now(), h: null, endormie: false, enCours: false, echecs: 0, prochain: null, dernier: 0 };
    b.tour = async () => {
      clearTimeout(b.h); b.h = null;
      if (document.hidden) { b.endormie = true; return; }
      if (b.enCours) return;
      b.enCours = true; b.dernier = Date.now();
      let ok = true, enPause = false;
      try { await fn(); } catch (e) { ok = false; enPause = !!(e && e.pause); }
      b.enCours = false;
      const t = Date.now(), p = per();
      let suivant;
      if (ok) { b.echecs = 0; suivant = BM.prochainCreneau(b.debut, p, t); }
      else if (enPause) suivant = t + p;
      else { b.echecs++; suivant = t + BM.delaiReessai(p, b.echecs); b.debut = suivant; }
      const att = porte ? porte.attente(t) : 0;
      if (att > 0) { suivant = Math.max(suivant, t + att + 250); b.debut = suivant; }
      b.prochain = suivant;
      if (!ok) majStatut();          // le statut dit tout de suite quand la source repart
      if (document.hidden) { b.endormie = true; return; }
      b.h = setTimeout(b.tour, Math.max(0, suivant - t));
    };
    b.reveiller = () => {
      if (b.enCours || Date.now() - b.dernier < 1000) return;
      b.endormie = false; b.debut = Date.now(); b.tour();
    };
    boucles.push(b);
    b.tour();
    return b;
  }
  const pause = ms => new Promise(r => setTimeout(r, ms));
  let boucleCarnet = null;
  function demarrer() {
    // Chaque boucle lit dès son premier tour : aucun appel direct en plus (heatmap.json était
    // téléchargé et analysé deux fois à chaque ouverture).
    boucle('horloge', lireHorloge, BM.HORLOGE_PERIODE, E.recul.binance);
    boucle('carte', lireHeatmap, 5 * 60e3, E.recul.github);
    boucle('fichier', lireMarketData, 60e3, E.recul.github);
    boucle('historique', () => lireExecutionsPubliees(), 5 * 60e3, E.recul.github);
    boucle('direct', lireDirect, 60e3, E.recul.github);
    boucle('profondeur', () => lireProfondeur(), 5 * 60e3, E.recul.github);
    boucle('bougies', lireMinutes, 10e3, E.recul.binance);
    boucle('executions', lireExecutions, 1000, E.recul.binance);
    boucleCarnet = boucle('carnet', lireCarnet, () => CADENCE_CARNET[R.niveauxLive], E.recul.binance);
    // Le BATTEMENT : un rendu par seconde au repos — les âges vieillissent, et les données arrivées
    // depuis (marquées, pas rendues) apparaissent. Le statut décompte les reprises.
    setInterval(() => { dessiner(); majStatut(); }, 1000);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) { for (const b of boucles) b.reveiller(); dessiner(); }
    });
  }

  // ─── Vue ───────────────────────────────────────────────────────────────────
  function dernierPrix() {
    if (E.exec.dernierPrix) return E.exec.dernierPrix;
    if (E.carnet && E.carnet.meilleurBid) return (E.carnet.meilleurBid + E.carnet.meilleurAsk) / 2;
    if (E.minutes.length) return E.minutes[E.minutes.length - 1].c;
    return null;
  }
  function vueParDefaut() {
    const now = maintenant(), p = dernierPrix() || 86000;
    const largeur = 3 * 3600e3;
    E.vue = { t1: now - largeur * 0.93, t2: now + largeur * 0.07, p1: p * (1 - 0.009), p2: p * (1 + 0.009) };
    E.suivre = true;
    majBoutonSuivre();
    dessiner();
  }
  /** Suivre le présent : la vue avance par PIXELS ENTIERS (et se recentre sur le prix par pixels
   *  entiers) — le calque publié se décale alors sur lui-même au lieu d'être repeint. */
  function suivreMaintenant() {
    if (!E.suivre || !E.vue || !Z) return;
    const v = E.vue, L = v.t2 - v.t1, tpp = L / Math.max(1, Z.chaleur.w), k = Math.trunc((maintenant() + L * 0.07 - v.t2) / tpp);
    if (k) { v.t1 += k * tpp; v.t2 += k * tpp; }
    const p = dernierPrix();
    if (p) {
      const H = v.p2 - v.p1, pp = H / Math.max(1, Z.chaleur.h), bas = v.p1 + H * 0.25, haut = v.p2 - H * 0.25;
      if (p < bas || p > haut) { const d = Math.round((p - (v.p1 + v.p2) / 2) / pp) * pp; v.p1 += d; v.p2 += d; }
    }
  }

  // ─── Rendu ─────────────────────────────────────────────────────────────────
  // CADENCE — au repos, UN rendu par seconde (le battement : les âges vieillissent) ; une donnée qui
  //   arrive (carnet, exécutions, fichiers) change sa version et attend le battement — elle apparaît
  //   avec au plus 1 s de retard ; un geste rend tout de suite (requestAnimationFrame).
  // CALQUES GARDÉS — la chaleur est composée de canevas hors écran, à la résolution CSS de la zone :
  //   · le fond « non observé » : un motif (createPattern) ;
  //   · la carte PUBLIÉE : repeinte seulement quand sa clé change (taille, publication, fusion,
  //     palette, ms par pixel, $ par pixel). Un glissement d'un nombre ENTIER de pixels la décale
  //     (drawImage) et ne repeint que les bandes découvertes : un pixel ne dépend que de la vue et de
  //     sa position, le résultat est celui d'un repeint complet (contrôlé : __carte.verifierChaleur) ;
  //   · le carnet LIVE : repeint quand une lecture arrive, quand la vue change, ou quand « maintenant »
  //     a avancé d'un pixel tant que la dernière lecture vaut — sur sa seule bande de temps.
  //   Composition par drawImage, sans lissage ; puis les calques vectoriels, redessinés à chaque rendu.
  const cv = document.getElementById('carte');
  const ctx = cv.getContext('2d', { alpha: false });     // opaque : tout est repeint à chaque rendu
  function calque() { const c = document.createElement('canvas'); c.width = c.height = 1; return { c, x: c.getContext('2d'), cle: null, t1: 0, p2: 0, coupe: Infinity, vide: true }; }
  const PUB = calque(), LIVE = calque(), COMP = calque(), LOIN = calque();   // COMP : la chaleur composée, gardée
  let RESERVE = calque();          // second tampon du calque publié (décalage sans recouvrement)
  let rafDemande = false, premierComplet = false, LUTV = 0;
  const MESURE = { chaleur: 0, rendu: 0, rendus: 0, complets: 0, decalages: 0, live: 0 };
  let Z = null;           // zones de la mise en page (px CSS)
  const C = {};           // couleurs, lues dans le CSS
  function lireCouleurs() {
    const s = getComputedStyle(document.documentElement);
    const v = (n, d) => (s.getPropertyValue(n) || '').trim() || d;
    Object.assign(C, {
      fond: v('--carte-fond', '#090c14'), nonObs: v('--carte-non-observe', '#0e121c'), hachure: v('--carte-hachure', '#232a3d'),
      ink1: v('--ink-1', '#eef2ff'), ink2: v('--ink-2', '#aab3cc'), ink3: v('--ink-3', '#7d87a3'),
      up: v('--up', '#22c39a'), down: v('--down', '#ff5a7a'), accent: v('--accent', '#ffd166'),
      prix: v('--carte-prix', '#ffffff'), grille: v('--carte-grille', 'rgba(255,255,255,0.06)'),
      pastille: v('--carte-pastille', 'rgba(9,12,20,0.86)'), murBid: v('--carte-mur-bid', '#3ee6b5'),
      murAsk: v('--carte-mur-ask', '#ff7a93'), gamma: v('--carte-gamma', '#c9a7ff'), live: v('--carte-live', '#7cc4ff'),
      publie: v('--carte-publie', '#ffd166'), panneau: v('--carte-panneau', '#0c1019'),
    });
  }

  // Palettes : 256 couleurs RGBA (Uint32, petit-boutiste = ABGR). Le contraste (seuil bas,
  // saturation) ne fait que choisir QUELLE couleur reçoit une intensité ; la lecture au
  // pointeur donne toujours la valeur, quel que soit le réglage.
  const PALETTES = {
    classique: [[0, [12, 20, 60]], [0.18, [20, 60, 160]], [0.38, [0, 170, 220]], [0.58, [90, 230, 120]],
      [0.76, [250, 230, 60]], [0.9, [255, 130, 30]], [1, [255, 250, 240]]],
    cividis: [[0, [0, 32, 77]], [0.25, [67, 78, 108]], [0.5, [125, 124, 120]], [0.75, [188, 175, 111]], [1, [255, 233, 69]]],
    bid: [[0, [8, 40, 44]], [0.5, [20, 170, 150]], [1, [190, 255, 235]]],
    ask: [[0, [50, 12, 20]], [0.5, [220, 70, 70]], [1, [255, 225, 200]]],
  };
  function rgb(c) {
    const m = c.match(/^#([0-9a-f]{6})$/i);
    if (m) { const n = parseInt(m[1], 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
    const r = c.match(/rgba?\(([^)]+)\)/);
    if (r) { const p = r[1].split(',').map(x => parseFloat(x)); return [p[0], p[1], p[2]]; }
    return [9, 12, 20];
  }
  const u32 = (r, g, b, a) => ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
  function lut(nom) {
    const pts = PALETTES[nom], out = new Uint32Array(256), fond = rgb(C.fond);
    const { bas, haut } = BM.bornesContraste(R.seuilBas, R.saturation);
    for (let v = 0; v < 256; v++) {
      if (v === 0 || v < bas) { out[v] = u32(fond[0], fond[1], fond[2], 255); continue; }
      const x = Math.min(1, Math.max(0, (v - bas) / (haut - bas)));
      let i = 0;
      while (i < pts.length - 2 && x > pts[i + 1][0]) i++;
      const [x0, c0] = pts[i], [x1, c1] = pts[i + 1], f = (x - x0) / (x1 - x0 || 1);
      const k = j => Math.round(c0[j] + (c1[j] - c0[j]) * f);
      out[v] = u32(k(0), k(1), k(2), 255);
    }
    return out;
  }
  let LUT = null, LUTB = null, LUTA = null;
  function majLuts() {
    if (R.palette === 'cote') { LUTB = lut('bid'); LUTA = lut('ask'); LUT = null; }
    else { LUT = lut(R.palette); LUTB = LUTA = null; }
    LUTV++;                      // les calques gardés sont à repeindre
  }
  /** Le motif « non observé » (hachure d'un pixel toutes les 6 diagonales), un par contexte. */
  function motif(c) {
    if (c.__motif) return c.__motif;
    const t = document.createElement('canvas'); t.width = t.height = 6;
    const x = t.getContext('2d'), fond = C.nonObs, hach = C.hachure;
    for (let y = 0; y < 6; y++) for (let i = 0; i < 6; i++) { x.fillStyle = (i + y) % 6 < 1 ? hach : fond; x.fillRect(i, y, 1, 1); }
    return (c.__motif = c.createPattern(t, 'repeat'));
  }

  // La position du canevas, gardée (lue par chaque événement du pointeur) : mise à jour quand sa
  // taille ou celle de la barre change — pas de mise en page forcée à chaque mouvement.
  let RECT = null;
  const rect = () => RECT || (RECT = cv.getBoundingClientRect());
  // Densité de pixels : celle de l'écran (3 sur un téléphone récent), plafonnée par un BUDGET de
  // pixels réels (un écran 4K) plutôt qu'à 2 — le texte du canevas est aussi net que celui de la
  // page. La chaleur reste à la résolution CSS (agrandie sans lissage) : son coût n'en dépend pas.
  const BUDGET_PIXELS = 3840 * 2160;
  // Hauteur minimale de la chaleur : en dessous, les panneaux (volume, CVD) s'effacent — et la carte
  // le dit. Le canevas n'est jamais dessiné plus grand que sa place (le pointeur y serait décalé).
  const MIN_CHALEUR = 140, MIN_LARGEUR = 160;
  function mettreEnPage() {
    const r = rect(), wf = r.width, hf = r.height;
    if (!(wf >= 40 && hf >= 40)) { Z = null; return; }
    const dpr = Math.max(0.5, Math.min(window.devicePixelRatio || 1, Math.sqrt(BUDGET_PIXELS / (wf * hf))));
    const bw = Math.max(1, Math.round(wf * dpr)), bh = Math.max(1, Math.round(hf * dpr));
    if (cv.width !== bw || cv.height !== bh) { cv.width = bw; cv.height = bh; }
    const w = Math.floor(wf), h = Math.floor(hf), etroit = w < 640, masques = [];
    const axeP = etroit ? 54 : 66, axeT = 20;
    let dom = R.calques.dom ? (etroit ? 64 : 112) : 0;
    let vol = R.calques.volume ? (etroit ? 44 : 58) : 0, cvd = R.calques.cvd ? (etroit ? 44 : 58) : 0;
    if (h - axeT - vol - cvd < MIN_CHALEUR) { vol = Math.min(vol, 34); cvd = Math.min(cvd, 34); }
    if (h - axeT - vol - cvd < MIN_CHALEUR && cvd) { cvd = 0; masques.push('CVD'); }
    if (h - axeT - vol - cvd < MIN_CHALEUR && vol) { vol = 0; masques.push('volume'); }
    if (w - axeP - dom < MIN_LARGEUR && dom) { dom = 0; masques.push('carnet latéral'); }
    const chW = Math.max(1, w - axeP - dom), chH = Math.max(1, h - axeT - vol - cvd);
    Z = {
      w: wf, h: hf, dpr, sx: bw / wf, sy: bh / hf, etroit, masques,
      // Une carte basse ou étroite : les pastilles prennent leur version courte.
      court: etroit || chH < 300,
      chaleur: { x: 0, y: 0, w: chW, h: chH },
      axeP: { x: chW, y: 0, w: axeP, h: chH },
      dom: { x: w - dom, y: 0, w: dom, h: chH },
      axeT: { x: 0, y: chH, w: chW, h: axeT },
      vol: { x: 0, y: chH + axeT, w: chW, h: vol },
      cvd: { x: 0, y: chH + axeT + vol, w: chW, h: cvd },
    };
  }
  const X = t => (t - E.vue.t1) / (E.vue.t2 - E.vue.t1) * Z.chaleur.w;
  const Y = p => (E.vue.p2 - p) / (E.vue.p2 - E.vue.p1) * Z.chaleur.h;
  const T = x => E.vue.t1 + x / Z.chaleur.w * (E.vue.t2 - E.vue.t1);
  const Pr = y => E.vue.p2 - y / Z.chaleur.h * (E.vue.p2 - E.vue.p1);

  /** Un rendu à la prochaine image (geste, réglage, retour sur l'onglet). */
  function dessiner() {
    if (rafDemande) return;
    rafDemande = true;
    requestAnimationFrame(() => { rafDemande = false; rendre(); });
  }
  /** Une donnée est arrivée : le battement la rendra (au plus 1 s). Avant le premier rendu complet,
   *  tout de suite — l'ouverture ne gagne rien à attendre. */
  function bientot() { if (!premierComplet) dessiner(); }

  /** La carte publiée telle qu'affichée : fusionnée (MAX) selon le réglage, calculée une fois. */
  function grillePublieeAffichee() {
    if (!R.calques.publiee || !E.pub) return null;
    if (!E.pubF || E.pubCle !== R.fusionT + 'x' + R.fusionP) {
      E.pubF = BM.fusionMax(E.pub, R.fusionT, R.fusionP); E.pubCle = R.fusionT + 'x' + R.fusionP;
    }
    return E.pubF;
  }
  const couleurs = coupe => ({ lut: LUT, lutB: LUTB, lutA: LUTA, maintenant: coupe });
  /** Peint le rectangle [xa, ya, xb, yb[ de la grille g dans le calque L (le reste n'est pas touché). */
  function peindreRect(L, g, w, h, coupe, xa, ya, xb, yb) {
    if (xb <= xa || yb <= ya) return;
    const buf = new Uint32Array((xb - xa) * (yb - ya));
    BM.peindreGrille(buf, w, h, g, E.vue, Object.assign(couleurs(coupe), { rect: [xa, ya, xb, yb] }));
    L.x.putImageData(new ImageData(new Uint8ClampedArray(buf.buffer), xb - xa, yb - ya), xa, ya);
  }
  function peindrePubliee(w, h) {
    const g = grillePublieeAffichee();
    if (!g) { const etait = !PUB.vide; PUB.vide = true; PUB.cle = null; return etait; }   // éteinte : la composition change
    const v = E.vue, tpp = (v.t2 - v.t1) / w, pp = (v.p2 - v.p1) / h, fin = BM.finGrille(g), now = maintenant();
    // La carte publiée s'arrête avant « maintenant » ; sinon (horloge du serveur en avance), on la coupe.
    const coupe = fin !== null && fin > now ? now : Infinity;
    const cle = [w, h, E.pubN, E.pubCle, LUTV, Math.round(tpp * 1e6), Math.round(pp * 1e9), coupe].join('|');
    PUB.vide = false;
    if (PUB.cle === cle) {
      const sx = (v.t1 - PUB.t1) / tpp, sy = (PUB.p2 - v.p2) / pp, rx = Math.round(sx), ry = Math.round(sy);
      if (Math.abs(sx - rx) < 1e-3 && Math.abs(sy - ry) < 1e-3 && Math.abs(rx) < w && Math.abs(ry) < h) {
        if (!rx && !ry) return false;
        // Le pixel x montre maintenant ce que montrait x + rx : copie décalée dans le second tampon.
        const D = RESERVE;
        if (D.c.width !== w || D.c.height !== h) { D.c.width = w; D.c.height = h; } else D.x.clearRect(0, 0, w, h);
        D.x.drawImage(PUB.c, -rx, -ry);
        RESERVE = { c: PUB.c, x: PUB.x };
        PUB.c = D.c; PUB.x = D.x;
        if (rx > 0) peindreRect(PUB, g, w, h, coupe, w - rx, 0, w, h); else if (rx < 0) peindreRect(PUB, g, w, h, coupe, 0, 0, -rx, h);
        if (ry > 0) peindreRect(PUB, g, w, h, coupe, 0, h - ry, w, h); else if (ry < 0) peindreRect(PUB, g, w, h, coupe, 0, 0, w, -ry);
        PUB.t1 = v.t1; PUB.p2 = v.p2; MESURE.decalages++;
        return true;
      }
    }
    PUB.x.clearRect(0, 0, w, h);
    peindreRect(PUB, g, w, h, coupe, 0, 0, w, h);
    PUB.cle = cle; PUB.t1 = v.t1; PUB.p2 = v.p2; PUB.coupe = coupe; MESURE.complets++;
    return true;
  }
  /** Profondeur Coinbase : repeinte entière quand la vue ou le fichier change (288 colonnes au plus). */
  function peindreLoin(w, h) {
    const g = R.calques.loin && E.loin ? E.loin : null;
    if (!g) { const etait = !LOIN.vide; if (etait) LOIN.x.clearRect(0, 0, w, h); LOIN.vide = true; LOIN.cle = null; return etait; }
    const v = E.vue, cle = [w, h, E.loinN, LUTV, v.t1, v.t2, v.p1, v.p2].join('|');
    if (cle === LOIN.cle) return false;
    LOIN.x.clearRect(0, 0, w, h);
    peindreRect(LOIN, g, w, h, maintenant(), 0, 0, w, h);
    LOIN.cle = cle; LOIN.coupe = maintenant(); LOIN.vide = false;
    return true;
  }
  function peindreLive(w, h) {
    const g = R.calques.live && E.live && E.live.n ? E.live : null;
    if (!g) { const etait = !LIVE.vide; if (etait) LIVE.x.clearRect(0, 0, w, h); LIVE.vide = true; LIVE.cle = null; return etait; }
    const v = E.vue, cle = [w, h, E.liveV, LUTV, v.t1, v.t2, v.p1, v.p2].join('|'), finD = g.fin[g.n - 1];
    // La dernière lecture vaut jusqu'à « maintenant » : quand il a avancé d'un pixel depuis la dernière
    // peinture, on repeint — sinon une bande « non observé » s'ouvrirait entre deux lectures.
    const avance = finD > LIVE.coupe && X(Math.min(maintenant(), finD)) - X(LIVE.coupe) >= 1;
    if (cle === LIVE.cle && !avance) return false;
    const coupe = maintenant(), tpp = (v.t2 - v.t1) / w;
    const xa = Math.max(0, Math.floor((g.deb[0] - v.t1) / tpp) - 2), xb = Math.min(w, Math.ceil((Math.min(finD, coupe) - v.t1) / tpp) + 2);
    LIVE.x.clearRect(0, 0, w, h);
    peindreRect(LIVE, g, w, h, coupe, xa, 0, xb, h);
    LIVE.cle = cle; LIVE.coupe = coupe; LIVE.vide = false; MESURE.live++;
    return true;
  }
  /** Met les calques gardés à jour ; vrai si l'un d'eux a été (re)peint. */
  function peindreCalques() {
    const w = Z.chaleur.w, h = Z.chaleur.h;
    for (const L of [PUB, LIVE, LOIN]) if (L.c.width !== w || L.c.height !== h) { L.c.width = w; L.c.height = h; L.cle = null; L.vide = true; }
    const a = peindrePubliee(w, h), b = peindreLive(w, h), c = peindreLoin(w, h);
    return a || b || c;
  }
  /** La chaleur composée : fond hachuré, carte publiée, carnet live — dans le contexte c, en (x0, y0). */
  function composerChaleur(c, x0, y0) {
    const w = Z.chaleur.w, h = Z.chaleur.h;
    c.imageSmoothingEnabled = false;
    c.fillStyle = motif(c); c.fillRect(x0, y0, w, h);
    if (!LOIN.vide) c.drawImage(LOIN.c, x0, y0);      // sous la carte : visible seulement là où Binance ne voit rien
    if (!PUB.vide) c.drawImage(PUB.c, x0, y0);
    if (!LIVE.vide) c.drawImage(LIVE.c, x0, y0);
  }
  /** Contrôle (harnais) : la chaleur affichée == un repeint COMPLET, sans calque gardé ni décalage,
   *  avec les mêmes « maintenant ». Rend le nombre de pixels qui diffèrent. */
  function verifierChaleur() {
    rendre();
    const w = Z.chaleur.w, h = Z.chaleur.h;
    const vu = new Uint32Array(COMP.x.getImageData(0, 0, w, h).data.buffer.slice(0));     // ce qui est affiché
    const ref = new Uint32Array(w * h), f = rgb(C.nonObs), k = rgb(C.hachure);
    const cNon = u32(f[0], f[1], f[2], 255), cHach = u32(k[0], k[1], k[2], 255);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) ref[y * w + x] = (x + y) % 6 < 1 ? cHach : cNon;
    const g = grillePublieeAffichee();
    if (!LOIN.vide) BM.peindreGrille(ref, w, h, E.loin, E.vue, couleurs(LOIN.coupe));
    if (g) BM.peindreGrille(ref, w, h, g, E.vue, couleurs(PUB.coupe));
    if (!LIVE.vide) BM.peindreGrille(ref, w, h, E.live, E.vue, couleurs(LIVE.coupe));
    let d = 0;
    for (let i = 0; i < ref.length; i++) if (ref[i] !== vu[i]) d++;
    return { differents: d, total: ref.length, complets: MESURE.complets, decalages: MESURE.decalages };
  }

  function rendre() {
    const debutRendu = performance.now();
    mettreEnPage();
    if (!Z) return;
    if (!E.vue && dernierPrix()) vueParDefaut();
    if (!E.vue) {                  // rien à montrer encore : le canevas a déjà sa taille et son fond
      ctx.setTransform(Z.sx, 0, 0, Z.sy, 0, 0); ctx.fillStyle = C.panneau; ctx.fillRect(0, 0, Z.w, Z.h);
      return;
    }
    MESURE.rendus++;
    suivreMaintenant();
    if (!LUT && !LUTB) majLuts();
    const t0 = performance.now();
    // La chaleur est composée à la résolution CSS, puis agrandie d'UN seul drawImage : à la densité 3,
    // le motif et les deux calques ne sont pas chacun agrandis (≈ 3 × 1,6 million de pixels par image).
    if (peindreCalques() || COMP.cle !== LUTV + '|' + Z.chaleur.w + '|' + Z.chaleur.h) {
      if (COMP.c.width !== Z.chaleur.w || COMP.c.height !== Z.chaleur.h) { COMP.c.width = Z.chaleur.w; COMP.c.height = Z.chaleur.h; COMP.x.__motif = null; }
      composerChaleur(COMP.x, 0, 0);
      COMP.cle = LUTV + '|' + Z.chaleur.w + '|' + Z.chaleur.h;
      MESURE.chaleur = performance.now() - t0;
    }
    if (!premierComplet && E.pub && E.live && E.live.n && E.exec.dernier && E.minutes.length) premierComplet = true;
    ctx.setTransform(Z.sx, 0, 0, Z.sy, 0, 0);
    ctx.fillStyle = C.panneau;
    ctx.fillRect(0, 0, Z.w, Z.h);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(COMP.c, Z.chaleur.x, Z.chaleur.y);
    ctx.save();
    ctx.beginPath(); ctx.rect(Z.chaleur.x, Z.chaleur.y, Z.chaleur.w, Z.chaleur.h); ctx.clip();
    posees = []; fileP = [];
    grille();
    if (R.calques.memoire) memoire();       // sous les murs et le gamma : leurs libellés restent lisibles
    if (R.calques.profil) profilExecutions();
    if (R.calques.destin) destin(); else DM.items = [];
    if (R.calques.murs) murs();
    if (R.calques.gamma) gamma();
    if (R.calques.bidask) bidAsk();
    if (R.calques.prix) lignePrix();
    if (R.calques.executions) bulles();
    if (R.calques.rafales) rafales(); else RAF.items = [];
    if (R.calques.executions || R.calques.rafales) hachuresExecutions();
    reperesEtAges();
    dessinerPastilles();
    croix();
    ctx.restore();
    axePrix();
    axeTemps();
    if (Z.dom.w) carnetLateral();
    if (Z.vol.h) panneauVolume();
    if (Z.cvd.h) panneauCvd();
    lectureSouris();
    majPanneauRafales();
    MESURE.rendu = performance.now() - debutRendu;
  }

  // ─── Calques ───────────────────────────────────────────────────────────────
  function grille() {
    const pas = BM.pasRond((E.vue.p2 - E.vue.p1) / Math.max(4, Z.chaleur.h / 70));
    ctx.strokeStyle = C.grille; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let p = Math.ceil(E.vue.p1 / pas) * pas; p <= E.vue.p2; p += pas) {
      const y = Math.round(Y(p)) + 0.5; ctx.moveTo(0, y); ctx.lineTo(Z.chaleur.w, y);
    }
    ctx.stroke();
  }
  function texte(t, x, y, coul, taille, align, gras) {
    ctx.font = (gras ? '600 ' : '') + (taille || 11) + 'px ' + POLICE;
    ctx.fillStyle = coul; ctx.textAlign = align || 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(t, x, y);
  }
  const POLICE = getComputedStyle(document.documentElement).getPropertyValue('--police-carte').trim() || 'system-ui, sans-serif';
  const largeurTexte = (t, taille, gras) => { ctx.font = (gras ? '600 ' : '') + (taille || 11) + 'px ' + POLICE; return ctx.measureText(t).width; };
  /** Le premier texte de la liste qui tient dans `largeur` (sinon le dernier, le plus court). */
  function ajuster(textes, largeur, taille, gras) {
    for (const t of textes) if (largeurTexte(t, taille, gras) <= largeur) return t;
    return textes[textes.length - 1];
  }
  // ÉTIQUETTES SUR LA CARTE — tout ce qui est écrit sur la chaleur réserve sa place (posees) :
  // titres, libellés des murs, pastilles d'âge. Un texte ne se pose pas sur un autre.
  let posees = [], fileP = [];
  const chevauche = (x, y, w, h) => posees.some(r => x < r.x + r.w && x + w > r.x && y < r.y + r.h && y + h > r.y);
  function reserver(x, y, w, h, texte) { posees.push({ x, y, w, h, texte, lignes: [texte], etiquette: true }); }
  /** Un texte centré en (x, y), écrit seulement s'il ne recouvre rien (et réservé). */
  function texteLibre(t, x, y, coul, taille) {
    const w = largeurTexte(t, taille) + 4, h = (taille || 11) + 4, x0 = x - w / 2, y0 = y - h / 2;
    if (x0 < 0 || x0 + w > Z.chaleur.w || chevauche(x0, y0, w, h)) return false;
    reserver(x0, y0, w, h, t);
    texte(t, x, y, coul, taille, 'center');
    return true;
  }
  /** Une pastille d'âge, posée SUR la carte. Mise en file pendant le dessin des calques, puis
   *  dessinée en dernier — au-dessus du prix et des bulles — sans recouvrir les autres. */
  function pastille(lignes, x, y, coul, align, court) { fileP.push([lignes, x, y, coul, align, court]); }
  function dessinerPastilles() { for (const a of fileP) poserPastille(...a); fileP = []; }
  /** Une pastille est TOUJOURS dans la carte (aucun âge ne disparaît) : à l'endroit voulu, sinon
   *  plus bas, plus haut, en version courte, ailleurs dans la carte ; en dernier recours, posée
   *  dans la carte sur une autre. */
  function poserPastille(lignes, x, y, coul, align, court) {
    const W = Z.chaleur.w, H = Z.chaleur.h;
    const taille = ls => ({ w: Math.max(...ls.map((l, i) => largeurTexte(l, 11, i === 0))) + 14, h: 8 + ls.length * 14 });
    const placer = (ls, xs) => {
      const { w, h } = taille(ls);
      for (const xv of xs) {
        const x0 = Math.max(4, Math.min(W - w - 4, xv(w))), y1 = Math.max(4, Math.min(H - h - 4, y));
        for (let y0 = y1; y0 + h <= H - 4 + 1e-9; y0 += h + 4) if (!chevauche(x0, y0, w, h)) return { x0, y0, w, h, ls };
        for (let y0 = y1 - h - 4; y0 >= 4; y0 -= h + 4) if (!chevauche(x0, y0, w, h)) return { x0, y0, w, h, ls };
        for (let y0 = 4; y0 + h <= H - 4; y0 += 4) if (!chevauche(x0, y0, w, h)) return { x0, y0, w, h, ls };
      }
      return null;
    };
    const ici = [w => (align === 'right' ? x - w : (align === 'center' ? x - w / 2 : x))], ailleurs = [w => W - w - 4, () => 4, w => (W - w) / 2];
    const courtes = court ? [court] : null, longues = Z.court && courtes ? courtes : lignes;
    let p = placer(longues, ici) || (courtes && placer(courtes, ici)) || placer(courtes || longues, ailleurs);
    if (!p) {
      const ls = courtes || longues, { w, h } = taille(ls);
      p = { x0: Math.max(4, Math.min(W - w - 4, ici[0](w))), y0: Math.max(0, Math.min(H - h, y)), w, h, ls };
    }
    const { x0, y0, w, h, ls } = p;
    posees.push({ x: x0, y: y0, w, h, texte: ls[0], lignes: ls, pastille: true });
    ctx.fillStyle = C.pastille;
    arrondi(x0, y0, w, h, 6); ctx.fill();
    ctx.fillStyle = coul; ctx.fillRect(x0, y0 + 4, 3, h - 8);
    ls.forEach((l, i) => texte(l, x0 + 9, y0 + 11 + i * 14, i ? C.ink2 : C.ink1, 11, 'left', i === 0));
    return { x: x0, y: y0, w, h };
  }
  function arrondi(x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function tirets(x, coul) {
    ctx.save(); ctx.strokeStyle = coul; ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(Math.round(x) + 0.5, 0); ctx.lineTo(Math.round(x) + 0.5, Z.chaleur.h); ctx.stroke(); ctx.restore();
  }

  function reperesEtAges() {
    const now = maintenant();
    // L'écart d'horloge (> 1 s) est écrit dans la pastille du live, sinon dans celle des exécutions.
    let horlogeTexte = E.horloge.texte();
    // Maintenant
    const xn = X(now);
    ctx.fillStyle = C.accent; ctx.globalAlpha = 0.8; ctx.fillRect(Math.round(xn), 0, 1, Z.chaleur.h); ctx.globalAlpha = 1;
    // Carte publiée : jusqu'où elle va, et de quand elle date.
    if (R.calques.publiee && E.pub) {
      const fin = BM.finGrille(E.pub), lue = BM.instantDerniereColonne(E.pub);
      const xf = X(fin);
      if (xf > 0 && xf < Z.chaleur.w) tirets(xf, C.publie);
      const l = ['Carte publiée · dernière colonne il y a ' + BM.age(now - lue),
        (E.pub.dt / 1000) + ' s × ' + (E.pub.dp) + ' $' + (E.pubF && E.pubF !== E.pub ? ' (affichée : ' + E.pubF.dt / 1000 + ' s × ' + E.pubF.dp + ' $, MAX, blocs alignés sur l\'horloge)' : '')
        + ' · publiée il y a ' + BM.age(now - E.pubMaj)];
      if (!E.pub.encodage) l.push('échelle en intensités : encodage non publié');
      if (R.calques.loin && E.loin) l.push('au-delà : carnet Coinbase ±10 %, ' + E.loin.dt / 60e3 + ' min × ' + E.loin.dp + ' $, échelle propre · il y a ' + BM.age(now - BM.instantDerniereColonne(E.loin)));
      pastille(l, Math.min(xf, Z.chaleur.w) - 8, 8, C.publie, 'right', 'Carte publiée · ' + BM.age(now - lue));
    }
    // Carnet live
    if (R.calques.live) {
      if (E.live && E.live.n) {
        // « depuis » : la plus ancienne lecture GARDÉE (la moitié ancienne s'oublie quand c'est plein).
        const debut = E.live.deb[0], xs = X(debut);
        if (xs > 0 && xs < Z.chaleur.w) tirets(xs, C.live);
        const l = ['Carnet live · dernier il y a ' + BM.age(now - axe(E.carnetA)),
          R.niveauxLive + ' niveaux / ' + CADENCE_CARNET[R.niveauxLive] / 1000 + ' s · ' + R.dpLive + ' $ · depuis ' + BM.heure(debut, true),
          E.liveRef === 'publiee' ? 'même échelle que la carte publiée' : 'échelle propre : NON comparable à la carte publiée'];
        if (horlogeTexte) { l.push(horlogeTexte); horlogeTexte = null; }
        pastille(l, Math.max(8, xs + 8), 8, C.live, 'left', 'Live · ' + BM.age(now - axe(E.carnetA)) + (E.liveRef === 'publiee' ? '' : ' · échelle propre'));
      } else if (E.erreurs.carnet) {
        pastille(['Carnet live indisponible', E.erreurs.carnet], Z.chaleur.w - 8, 8, C.down, 'right', 'Live indisponible');
      }
    }
    // Trou entre la carte publiée et le carnet live : non observé, et dit.
    if (E.pub) {
      const fin = BM.finGrille(E.pub), deb = E.live && E.live.n ? E.live.deb[0] : now;
      const xa = Math.max(0, X(fin)), xb = Math.min(Z.chaleur.w, X(deb));
      if (xb - xa > 70) texteLibre('non observé', (xa + xb) / 2, Z.chaleur.h - 16, C.ink3, 11);
    }
    // Panneaux qui n'ont pas la place d'être dessinés : dit, jamais en silence.
    if (Z.masques.length) pastille(['Masqués faute de place : ' + Z.masques.join(', ')], 8, Z.chaleur.h - 30, C.ink3, 'left', 'Masqués : ' + Z.masques.join(', '));
    // Mémoire du carnet : la carte publiée dont elle vient, sa fenêtre et son seuil.
    if (R.calques.memoire && E.pub) {
      const s = seuilMemoire(), f = s && fenetreMemoire(), xm = Z.chaleur.w - largeurMemoire() - 6;
      if (!s) pastille(['Mémoire du carnet · éteinte', 'encodage non publié : aucun seuil en BTC'], xm, 120, C.ink3, 'right', 'Mémoire · encodage non publié');
      else {
        const fen = f ? BM.heure(E.pub.t0 + f[0] * E.pub.dt) + '–' + BM.heure(Math.min(E.pub.t0 + (f[1] + 1) * E.pub.dt, now)) : 'hors de la carte publiée';
        pastille(['Mémoire du carnet · carte publiée il y a ' + BM.age(now - E.pubMaj),
          'fenêtre ' + fen + ' · seuil ≥ ' + BM.nombre(s.qS, 2, 2) + ' BTC (intensité ≥ ' + s.vS + ')'],
        xm, 120, C.murBid, 'right', 'Mémoire · ' + BM.age(now - E.pubMaj));
      }
    }
    // Rafales au marché : depuis quand elles sont lues, et la dernière.
    if (R.calques.rafales && E.exec.premier !== null) {
      const d = E.raf.dernieres(1, R.rafaleMin)[0];
      pastille(['Rafales ≥ ' + BM.nombre(R.rafaleMin, 0, 2) + ' BTC · depuis ' + BM.heure(E.exec.premier) + ' · ' + (d ? 'dernière il y a ' + BM.age(now - d.T) : 'aucune encore'),
        '≥ k ordres : borne basse prouvée, le nombre exact n\'est pas publié'],
      Math.min(xn, Z.chaleur.w) - 8, Z.chaleur.h - 130, C.ink2, 'right', 'Rafales · ' + (d ? BM.age(now - d.T) : 'aucune'));
    }
    if (R.calques.destin) pastilleDestin(now);
    // Exécutions
    if (R.calques.executions) {
      if (E.exec.dernier) {
        const l = ['Exécutions · dernière il y a ' + BM.age(now - E.exec.dernier),
          'depuis ' + BM.heure(E.exec.premier) + (E.execArriere && !E.execArriere.fini ? ' (remplissage…)' : '')
          + ' · bulles ≥ ' + BM.btc(R.bulleMin) + ' BTC'];
        const lu = execLuJusqua();
        if (now - lu > BM.validiteLecture(1000)) l.push('lues jusqu\'à il y a ' + BM.age(now - lu) + (E.erreurs.executions ? ' (lecture en échec)' : ' (rattrapage)'));
        const sautees = BM.dureeDans(E.execTrous, -Infinity, Infinity);
        if (sautees) l.push('lecture interrompue : ' + BM.age(sautees) + ' non lues (hachurées)');
        if (horlogeTexte) { l.push(horlogeTexte); horlogeTexte = null; }
        pastille(l, Math.min(xn, Z.chaleur.w) - 8, Z.chaleur.h - 70, C.ink2, 'right', 'Exécutions · ' + BM.age(now - E.exec.dernier));
      } else if (E.erreurs.executions) pastille(['Exécutions indisponibles', E.erreurs.executions], Z.chaleur.w - 8, Z.chaleur.h - 60, C.down, 'right', 'Exécutions indisponibles');
    }
  }

  /** Des hachures sur [x, x + w[ × [y, y + h[ : « non lu », par-dessus ce qui est dessiné. */
  function hachurer(x, y, w, h, alpha) {
    if (w < 1 || h < 1) return;
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.strokeStyle = C.ink3; ctx.globalAlpha = alpha; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let d = -h; d < w; d += 7) { ctx.moveTo(x + d, y + h); ctx.lineTo(x + d + h, y); }
    ctx.stroke();
    ctx.restore();
  }
  /** Intervalles où les exécutions n'ont pas été lues : hachurés (bulles, profil et ligne de prix
   *  à la seconde n'y disent RIEN — ce n'est pas « aucune exécution »). */
  function hachuresExecutions() {
    for (const [a, b] of execNonLues()) {
      const xa = Math.max(0, X(a)), xb = Math.min(Z.chaleur.w, X(b));
      if (xb <= xa) continue;
      hachurer(xa, 0, xb - xa, Z.chaleur.h, 0.35);
      if (xb - xa > 120) texteLibre('exécutions non lues', (xa + xb) / 2, Z.chaleur.h - 30, C.ink2, 10.5);
    }
  }
  function murs() {
    const n = E.niv;
    if (!n || !n.murs.length || !n.mursA) return;
    const now = maintenant(), x0 = Math.max(0, X(n.mursA)), tr = n.tranche;
    if (x0 >= Z.chaleur.w || !tr) return;
    for (const m of n.murs) {
      const ya = Y(m.p + tr), yb = Y(m.p);
      if (yb < 0 || ya > Z.chaleur.h) continue;
      const coul = m.cote === 'bid' ? C.murBid : C.murAsk;
      ctx.fillStyle = coul; ctx.globalAlpha = 0.16;
      ctx.fillRect(x0, ya, Z.chaleur.w - x0, Math.max(2, yb - ya));
      ctx.globalAlpha = 0.9; ctx.strokeStyle = coul; ctx.lineWidth = 1;
      ctx.strokeRect(Math.round(x0) + 0.5, Math.round(ya) + 0.5, Z.chaleur.w - x0, Math.max(2, Math.round(yb - ya)));
      ctx.globalAlpha = 1;
      // Le libellé tient dans la carte (un mur posé près du bord droit l'écrit à sa gauche), et ne se
      // pose pas sur un autre : deux murs voisins écrivent leurs Σ côte à côte le long de leur trait.
      const t = 'Σ ' + BM.btc(m.q) + ' BTC', tw = largeurTexte(t, 10, true), ty = (ya + yb) / 2, W = Z.chaleur.w;
      let tx = Math.max(2, Math.min(x0 + 4, W - tw - 4));
      for (let x = tx; x + tw <= W - 4; x += tw + 10) if (!chevauche(x - 1, ty - 7, tw + 2, 14)) { tx = x; break; }
      texte(t, tx, ty, coul, 10, 'left', true);
      reserver(tx - 1, ty - 7, tw + 2, 14, t);
    }
    pastille(['Murs du carnet · lus il y a ' + BM.age(now - n.mursA), 'Σ par tranche de ' + tr + ' $ · fichier de 15 min'],
      x0 + 6, 60, C.murBid, 'left', 'Murs · ' + BM.age(now - n.mursA));
  }
  function gamma() {
    const n = E.niv;
    if (!n || !n.gamma.length || !n.gammaA) return;
    const x0 = Math.max(0, X(n.gammaA));
    if (x0 >= Z.chaleur.w) return;
    ctx.save();
    for (const g of n.gamma) {
      const y = Math.round(Y(g.pAxe)) + 0.5;       // placé en USDT (converti), libellé au strike publié
      if (y < 0 || y > Z.chaleur.h) continue;
      ctx.strokeStyle = C.gamma; ctx.setLineDash(g.court === 'ZG' ? [2, 3] : [7, 4]); ctx.lineWidth = g.court === 'ZG' ? 1.5 : 1.2;
      ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(Z.chaleur.w, y); ctx.stroke();
      texte(g.court + ' ' + BM.prix(g.p), Z.chaleur.w - 6, y - 8, C.gamma, 10, 'right', true);
    }
    ctx.restore();
    const cv = n.conversion;
    pastille(['Gamma (Deribit) · il y a ' + BM.age(maintenant() - n.gammaA), 'convention : ' + (n.convention || 'non précisée par le fichier'),
      cv ? 'strikes en ' + n.uniteGamma + ', placés en USDT : ÷ ' + BM.nombre(cv.taux, 0, 6) + ' (USDT/USD' + (cv.a ? ', il y a ' + BM.age(maintenant() - cv.a) : '') + ')'
        : 'strikes en ' + n.uniteGamma + ', NON convertis en USDT (cours USDT/USD non publié)'],
      x0 + 6, 60, C.gamma, 'left', 'Gamma · ' + BM.age(maintenant() - n.gammaA) + (cv ? '' : ' · non converti'));
  }
  /** Meilleur bid / meilleur ask, en marches (le prix tient jusqu'à la lecture suivante). Trait
   *  d'UN pixel (le chemin rapide du canevas), lectures cherchées par dichotomie à partir du bord
   *  gauche, et au plus une marche par colonne de pixels : les lectures d'une même colonne y
   *  deviennent un trait vertical de leur étendue. Après 6 h (10 000 lectures), le tracé ne coûte
   *  pas plus que la largeur de la carte. */
  function bidAsk() {
    const ba = E.bidask;
    if (ba.length < 2) return;
    const valide = BM.validiteLecture(CADENCE_CARNET[R.niveauxLive]), ecart = E.horloge.ecart;
    const tmin = E.vue.t1 - 60e3 - ecart, tmax = E.vue.t2 - ecart;     // en heure LOCALE (b.t)
    let lo = 0, hi = ba.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (ba[m].t < tmin) lo = m + 1; else hi = m; }
    for (const [k, coul] of [['bid', C.up], ['ask', C.down]]) {
      ctx.strokeStyle = coul; ctx.fillStyle = coul; ctx.lineWidth = 1; ctx.globalAlpha = 0.95;
      ctx.beginPath();
      const spans = [];
      let prevT = null, prevY = 0, col = null, cmin = 0, cmax = 0;
      for (let i = lo; i < ba.length; i++) {
        const b = ba[i];
        if (b.t > tmax) break;
        const x = X(b.t + ecart), y = Y(b[k]), xc = Math.floor(x);
        // Une lecture manquée (onglet caché, panne) coupe la ligne au lieu de relier deux instants éloignés.
        if (prevT === null || b.t - prevT > valide) { if (col !== null) spans.push(col, cmin, cmax); ctx.moveTo(x, y); col = xc; cmin = cmax = y; }
        else if (xc === col) { cmin = Math.min(cmin, y, prevY); cmax = Math.max(cmax, y, prevY); }
        else { spans.push(col, cmin, cmax); ctx.lineTo(x, prevY); ctx.lineTo(x, y); col = xc; cmin = Math.min(y, prevY); cmax = Math.max(y, prevY); }
        prevT = b.t; prevY = y;
      }
      if (col !== null) spans.push(col, cmin, cmax);
      ctx.stroke();
      for (let j = 0; j < spans.length; j += 3) if (spans[j + 2] - spans[j + 1] >= 1) ctx.fillRect(spans[j], spans[j + 1], 1, spans[j + 2] - spans[j + 1]);
      ctx.globalAlpha = 1;
    }
  }
  const SECONDE_DES_PPM = 6;     // px par minute à partir desquels la ligne suit les exécutions à la seconde
  /** M4 : par colonne de pixels, le premier point, le plus bas, le plus haut et le dernier, dans leur
   *  ordre. Le tracé d'une ligne fine est celui de tous les points, pour au plus 4 points par colonne
   *  (vue de 3 h, prix à la seconde : 10 800 points → ≤ 4 × 1 262). */
  function tracerM4(ch, seg) {
    let col = null, pr = null, bas = null, haut = null, der = null, n = 0;
    const vider = () => {
      if (col === null) return;
      for (const q of [pr, bas, haut, der].filter((q, i, a) => a.indexOf(q) === i).sort((a, b) => a.i - b.i)) {
        if (n++) ch.lineTo(q.x, q.y); else ch.moveTo(q.x, q.y);
      }
    };
    seg.forEach(([t, p], i) => {
      const x = X(t), y = Y(p), c = Math.floor(x), q = { x, y, i };
      if (c !== col) { vider(); col = c; pr = bas = haut = q; }
      if (y < bas.y) bas = q;
      if (y > haut.y) haut = q;
      der = q;
    });
    vider();
  }
  let LIGNE = { cle: null, chemin: null };
  function lignePrix() {
    const ms = E.minutes;
    ctx.save();
    ctx.lineJoin = 'round';
    // Les mèches (plus haut / plus bas de chaque minute) quand une minute fait au moins 3 px.
    const ppm = Z.chaleur.w / ((E.vue.t2 - E.vue.t1) / 60e3);
    if (ppm >= 3) {
      ctx.strokeStyle = C.prix; ctx.globalAlpha = 0.28; ctx.lineWidth = 1;
      ctx.beginPath();
      for (const m of ms) {
        if (m.fin < E.vue.t1 || m.t > E.vue.t2) continue;
        const x = Math.round(X(m.t + 30e3)) + 0.5; ctx.moveTo(x, Y(m.h)); ctx.lineTo(x, Y(m.l));
      }
      ctx.stroke(); ctx.globalAlpha = 1;
    }
    // Les points viennent de BM.lignePrix : clôtures 1 min, puis VWAP à la seconde — partout où les
    // exécutions sont lues dès qu'une minute fait au moins 6 px —, coupée sur ce qui n'est pas lu. Le
    // tracé est gardé tant que ni les données ni la vue ne changent (le survol ne le refait pas).
    const nonLues = execNonLues(), parSeconde = ppm >= SECONDE_DES_PPM, der = ms.length ? ms[ms.length - 1] : null;
    const cle = [E.exec.version, ms.length, der ? der.t + ':' + der.c : '', E.minutesA, E.horloge.ecart, E.vue.t1, E.vue.t2, E.vue.p1, E.vue.p2,
      Z.chaleur.w, Z.chaleur.h, parSeconde, nonLues.map(x => x.join(':')).join(',')].join('|');
    if (LIGNE.cle !== cle) {
      const segs = BM.lignePrix(ms, E.exec, { t1: E.vue.t1, t2: E.vue.t2, parSeconde, minutesA: E.minutesA ? axe(E.minutesA) : null, nonLues, maintenant: maintenant() });
      const ch = new Path2D();
      for (const seg of segs) tracerM4(ch, seg);
      LIGNE = { cle, chemin: ch };
    }
    // Un trait sombre plus large SOUS la ligne la détache de la chaleur (une ombre floue coûtait
    // ≈ 1,5 ms par image au navigateur).
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 3.6; ctx.stroke(LIGNE.chemin);
    ctx.strokeStyle = C.prix; ctx.lineWidth = 1.6; ctx.stroke(LIGNE.chemin);
    ctx.restore();
  }
  /** Seaux des bulles : pas de temps dans une échelle fixe et pas de prix multiple de la tranche
   *  des exécutions, ancrés sur l'horloge et le prix (BM.SeauxExecutions.regrouper). Les bulles
   *  dessinées sont gardées : la lecture au pointeur décrit celle qu'on survole. */
  function pasBulles() {
    return { pasT: BM.pasTemps((E.vue.t2 - E.vue.t1) / Z.chaleur.w * 9), pasP: BM.pasMultiple((E.vue.p2 - E.vue.p1) / Z.chaleur.h * 9, E.exec.dp) };
  }
  let BULLES = [], TRI = { cle: null, g: [] };
  function bulles() {
    BULLES = [];
    if (!E.exec.seaux.size) return;
    const { pasT, pasP } = pasBulles();
    // Les seaux viennent des plis gardés (BM.SeauxExecutions) ; le tri par volume est gardé tant que
    // ni les exécutions, ni la fenêtre, ni le seuil ne changent.
    const cle = [E.exec.version, E.vue.t1, E.vue.t2, pasT, pasP, R.bulleMin].join('|');
    if (TRI.cle !== cle) {
      TRI = { cle, g: E.exec.regrouper(E.vue.t1, E.vue.t2, pasT, pasP).filter(b => b.achat + b.vente >= R.bulleMin).sort((a, b) => (a.achat + a.vente) - (b.achat + b.vente)) };
    }
    const g = TRI.g;
    for (const b of g) {
      const q = b.achat + b.vente, r = BM.rayonBulle(q, R.bulleEchelle);
      const x = X(b.t), y = Y(b.p);
      BULLES.push({ x, y, r, b });
      const coul = b.achat >= b.vente ? C.up : C.down;
      ctx.globalAlpha = 0.55; ctx.fillStyle = coul;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.95; ctx.strokeStyle = coul; ctx.lineWidth = 1; ctx.stroke();
      // Part achetée : un arc intérieur, quand la bulle est assez grande pour le montrer.
      if (r >= 8) {
        ctx.globalAlpha = 0.9; ctx.strokeStyle = C.prix; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(x, y, r - 3, -Math.PI / 2, -Math.PI / 2 + 2 * Math.PI * b.achat / q); ctx.stroke();
      }
      if (r >= 12) texte(BM.btc(q), x, y, C.ink1, 10, 'center', true);
    }
    ctx.globalAlpha = 1;
  }
  function profilExecutions() {
    if (!E.exec.seaux.size) return;
    const pasP = BM.pasMultiple((E.vue.p2 - E.vue.p1) / Z.chaleur.h * 3, E.exec.dp);     // multiple de la tranche
    const ta = Math.max(E.vue.t1, E.exec.premier || E.vue.t1), tb = Math.min(E.vue.t2, maintenant() + 1000);
    const prof = E.exec.profil(ta, tb, pasP);
    let max = 0;
    for (const v of prof.values()) max = Math.max(max, v[0] + v[1]);
    if (!max) return;
    const L = Math.min(110, Z.chaleur.w * 0.16);
    for (const [P, v] of prof) {
      const ya = Y((P + 1) * pasP), yb = Y(P * pasP), hh = Math.max(1, yb - ya - 0.5);
      const la = L * v[0] / max, lv = L * v[1] / max;
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = C.down; ctx.fillRect(0, ya, lv, hh);
      ctx.fillStyle = C.up; ctx.fillRect(lv, ya, la, hh);
    }
    ctx.globalAlpha = 1;
    // Une fenêtre qui contient des exécutions NON LUES donne un profil incomplet : il le dit.
    const manque = BM.dureeDans(execNonLues(), ta, tb);
    TEXTES.profil = (Z.etroit ? 'Profil' : 'Profil des exécutions visibles') + (manque > 0 ? ' · incomplet : ' + BM.age(manque) + ' non lues' : '');
    texte(TEXTES.profil, 6, 14, C.ink2, 10, 'left', true);
    reserver(2, 6, largeurTexte(TEXTES.profil, 10, true) + 8, 16, TEXTES.profil);     // les pastilles l'évitent
  }
  // ─── Mémoire du carnet : barres au bord droit de la chaleur ─────────────────
  // Lue sur la carte publiée BRUTE (E.pub, jamais E.pubF) : la fusion ne change aucune part. Les
  // sommes préfixes (BM.presence) sont refaites à chaque publication ou seuil ; les barres, quand
  // la fenêtre (colonnes visibles), les prix ou la taille changent — pas à chaque battement.
  const MEM = { prCle: null, pr: null, cle: null, barres: [], lp: { cle: null, v: null }, calque: calque(), peint: null };
  const largeurMemoire = () => (Z.etroit ? 30 : 48);
  function seuilMemoire() { return E.pub ? BM.seuilPresence(R.presenceSeuil, E.pub.encodage) : null; }
  /** Colonnes de la carte publiée dans la vue (jusqu'à « maintenant ») : la fenêtre des comptes. */
  function fenetreMemoire() {
    const r = [0, 0];
    return E.pub && BM.plageColonnes(E.pub, E.vue.t1, Math.min(E.vue.t2, maintenant()), r) ? r : null;
  }
  function presenceMemoire(s) {
    const k = E.pubN + ':' + s.vS;
    if (MEM.prCle !== k) { MEM.pr = BM.presence(E.pub, s.vS); MEM.prCle = k; }
    return MEM.pr;
  }
  /** Barres par lignes de pixels (fusionnées quand elles décrivent la même rangée) ; gardées. */
  function barresMemoire(s, f) {
    const h = Z.chaleur.h, w = Z.chaleur.w, L = largeurMemoire(), v = E.vue;
    const cle = [MEM.prCle, f[0], f[1], v.p1, v.p2, w, h, L].join('|');
    if (MEM.cle === cle) return;
    const pr = presenceMemoire(s), pp = (v.p2 - v.p1) / h, t = [0, 0], minObs = Math.ceil(BM.PRESENCE.minObserveMin * 60e3 / E.pub.dt);
    const barres = [];
    let cour = null;
    for (let y = 0; y < h; y++) {
      BM.tranchesLigne(v.p2, pp, y, E.pub.dp, t);
      const b = BM.barrePresence(pr, t[0], t[1], f[0], f[1], minObs);
      if (b) b.nT = t[1] - t[0] + 1;
      if (cour && b && cour.b.pb === b.pb && cour.b.part === b.part && cour.b.nT === b.nT) { cour.y1 = y + 1; continue; }
      cour = b ? { y0: y, y1: y + 1, b } : null;
      if (cour) barres.push(cour);
    }
    for (const r of barres) r.cote = r.b.presB === r.b.presA ? 'égalité' : r.b.presB > r.b.presA ? 'bid' : 'ask';
    Object.assign(MEM, { cle, barres });
  }
  /** Le calque des barres (L × h, hors écran) : repeint quand les barres ou les couleurs changent ;
   *  sinon UN drawImage par rendu. */
  function peindreMemoire() {
    const h = Z.chaleur.h, L = largeurMemoire(), M = MEM.calque, cle = MEM.cle + '|' + C.murBid + C.murAsk;
    if (MEM.peint === cle) return;
    if (M.c.width !== L || M.c.height !== h) { M.c.width = L; M.c.height = h; } else M.x.clearRect(0, 0, L, h);
    const x = M.x, hach = new Path2D();
    // Échelle FIXE : le trait fin marque 100 %, le pointillé 50 % — jamais normalisée sur la vue.
    x.fillStyle = C.pastille; x.globalAlpha = 0.55; x.fillRect(0, 0, L, h); x.globalAlpha = 1;
    x.fillStyle = C.ink3; x.fillRect(0, 0, 1, h);
    x.globalAlpha = 0.85;
    for (const r of MEM.barres) {
      const l = Math.round(L * r.b.part);
      if (l > 0) { x.fillStyle = r.cote === 'ask' ? C.murAsk : C.murBid; x.fillRect(L - l, r.y0, l, r.y1 - r.y0); }
      if (r.b.peu) hach.rect(0, r.y0, L, r.y1 - r.y0);
    }
    x.globalAlpha = 1;
    x.save(); x.strokeStyle = C.ink3; x.setLineDash([2, 3]); x.beginPath(); x.moveTo(L / 2 + 0.5, 0); x.lineTo(L / 2 + 0.5, h); x.stroke(); x.restore();
    // Peu observée (convention) : hachurée, d'un seul tracé découpé sur ses rangées.
    x.save(); x.clip(hach); x.strokeStyle = C.ink2; x.globalAlpha = 0.6; x.lineWidth = 1; x.beginPath();
    for (let d = -L; d < h; d += 5) { x.moveTo(0, d + L); x.lineTo(L, d); }
    x.stroke(); x.restore();
    MEM.peint = cle;
  }
  function memoire() {
    const s = seuilMemoire(), f = s && fenetreMemoire();
    if (!s || !f) return;
    barresMemoire(s, f);
    peindreMemoire();
    ctx.drawImage(MEM.calque.c, Z.chaleur.w - largeurMemoire(), 0);
  }
  /** La barre sous la ligne de pixels y (celle que le dessin a peinte), ou null. */
  function barreMemoireEn(y) {
    for (const r of MEM.barres) if (y >= r.y0 && y < r.y1) return r;
    return null;
  }
  function texteMemoire(y) {
    const s = seuilMemoire(), f = s && fenetreMemoire();
    if (!s || !f) return null;
    barresMemoire(s, f);
    const r = barreMemoireEn(Math.floor(y));
    if (!r) return 'Mémoire : rangée non observée dans la fenêtre';
    const b = r.b, dtMin = E.pub.dt / 60e3, dp = E.pub.dp;
    // La plus longue présence : au survol seulement, pour CETTE rangée et cette fenêtre (gardée).
    const k = [MEM.prCle, b.pb, f[0], f[1]].join('|');
    if (MEM.lp.cle !== k) MEM.lp = { cle: k, v: BM.plusLonguePresence(E.pub, s.vS, b.pb, f[0], f[1]) };
    const lp = MEM.lp.v, n = x => BM.nombre(x * dtMin, 0, 0);
    return 'Mémoire ' + BM.prix(b.pb * dp) + '–' + BM.prix((b.pb + 1) * dp) + ' $ : ' + (sommePubliee() ? 'la tranche porte Σ ≥ ' : 'un niveau ≥ ') + BM.nombre(s.qS, 2, 2) + ' BTC' + (sommePubliee() ? '' : ' dans la tranche') + ' pendant '
      + n(b.pres) + ' des ' + n(b.obs) + ' min observées (' + Math.round(100 * b.part) + ' %) · plus longue présence ' + (lp.n ? BM.age(lp.n * E.pub.dt) : '—')
      + ' · côté ' + (r.cote === 'égalité' ? 'bid et ask à égalité' : r.cote)
      + (b.peu ? ' · observée moins de ' + BM.PRESENCE.minObserveMin + ' min (hachurée)' : '')
      + (b.nT > 1 ? ' · pixel = plus grande part de ' + b.nT + ' tranches' : '');
  }

  // ─── Destin des murs : un trait par niveau suivi, sa marque de fin ───────────
  // Traits et marques gardés tant que ni le suivi (version) ni la vue ni l'horloge ne changent : au
  // repos, un rendu ne fait que deux tracés et quelques textes.
  let DM = { cle: null, items: [], traits: 0, bid: null, ask: null, marques: [], ks: 0 };
  function destin() {
    const S = E.murs, v = E.vue;
    if (!S.niveaux.length) { DM.items = []; DM.marques = []; DM.traits = 0; return; }
    const ks = S.indice(R.mursSeuil), cle = [S.version, ks, v.t1, v.t2, v.p1, v.p2, Z.chaleur.w, Z.chaleur.h, E.horloge.ecart].join('|');
    if (DM.cle !== cle) {
      const bid = new Path2D(), ask = new Path2D(), items = [], cases = new Map(), W = Z.chaleur.w, H = Z.chaleur.h;
      let traits = 0;
      for (const n of S.niveaux) {
        if (n.t0s[ks] === null) continue;          // jamais au seuil choisi
        const x0 = X(axe(n.t0s[ks])), x1 = X(axe(n.tFin)), y = Math.round(Y(n.c / 100)) + 0.5;
        if (x1 < -8 || x0 > W + 8 || y < 0 || y > H) continue;
        items.push({ x0, x1, y, n });
        // Vue large : seuls les traits d'au moins 2 px ; la fin, elle, est toujours comptée.
        if (x1 - x0 >= BM.MURS.pxMin) { const P = n.cote === 'b' ? bid : ask; P.moveTo(Math.max(-1, x0), y); P.lineTo(Math.min(W + 1, x1), y); traits++; }
        const mq = BM.SuiviMurs.prototype.marque(n), k = Math.round(x1) + ':' + y;
        let c = cases.get(k);
        if (!c) cases.set(k, c = { x: x1, y, n: 0, m: {}, cote: n.cote });
        c.n++; c.m[mq] = (c.m[mq] || 0) + 1;
      }
      const marques = [];
      for (const c of cases.values()) {
        if (c.x < 0 || c.x > W) continue;
        const k = Object.keys(c.m).sort((a, b) => c.m[b] - c.m[a])[0];
        marques.push({ x: c.x, y: c.y, cote: c.cote, t: BM.FINS_MURS[k].s + (c.n > 1 ? '×' + c.n : '') });
      }
      DM = { cle, items, traits, bid, ask, marques, ks };
    }
    ctx.save();
    ctx.lineWidth = 1.5; ctx.globalAlpha = 0.85;
    ctx.strokeStyle = C.murBid; ctx.stroke(DM.bid);
    ctx.strokeStyle = C.murAsk; ctx.stroke(DM.ask);
    ctx.restore();
    for (const m of DM.marques) texte(m.t, m.x + 2, m.y, m.cote === 'b' ? C.murBid : C.murAsk, 10, 'left', true);
  }
  /** Le niveau suivi sous le pointeur (trait élargi de 3 px), le plus récent d'abord. */
  function destinEn(x, y) {
    for (let i = DM.items.length - 1; i >= 0; i--) { const it = DM.items[i]; if (Math.abs(y - it.y) <= 3 && x >= it.x0 - 3 && x <= it.x1 + 12) return it.n; }
    return null;
  }
  function texteDestin(n) {
    const f = BM.FINS_MURS[BM.SuiviMurs.prototype.marque(n)], ks = E.murs.indice(R.mursSeuil), o = n.par[ks];
    return 'Destin ' + BM.prix(n.c / 100, 2) + ' $ (' + (n.cote === 'b' ? 'bid' : 'ask') + ') : ≥ ' + BM.nombre(E.murs.seuils[ks], 0, 2) + ' BTC de ' + BM.heure(axe(n.t0s[ks]), true) + ' à ' + BM.heure(axe(n.tFin), true)
      + ' · jusqu\'à ' + BM.btc(n.qMax) + ' BTC · au moins ' + BM.btc(o.retire) + ' BTC retirés sans échange · ' + BM.btc(o.echange) + ' BTC échangés à ce prix · '
      + BM.btc(o.incertain) + ' incertains · ' + f.s + ' ' + f.t + ' (' + f.d + ')';
  }
  /** L'âge du suivi, l'incertitude de l'horloge et les totaux depuis le début du suivi. */
  function pastilleDestin(now) {
    const S = E.murs, h = E.horloge, cad = CADENCE_CARNET[R.niveauxLive];
    const uTxt = h.u === null ? 'horloge Binance pas encore mesurée : rien n\'est classé' : 'horloge Binance ± ' + Math.round(h.u) + ' ms';
    const l = ['Destin des murs · ' + (S.derniere !== null ? 'dernière lecture il y a ' + BM.age(now - axe(S.derniere)) : 'aucune lecture encore') + ' · ' + uTxt + ' · ' + R.niveauxLive + ' niveaux / ' + cad / 1000 + ' s'];
    const ks = S.indice(R.mursSeuil), t = S.totaux[ks], nb = BM.nombre(S.seuils[ks], 0, 2);
    if (t.depuis !== null) l.push('Depuis ' + BM.heure(axe(t.depuis)) + ' · niveaux ≥ ' + nb + ' BTC : au moins ' + BM.btc(t.retire) + ' BTC retirés sans échange · ' + BM.btc(t.echange) + ' BTC échangés à ces prix · ' + BM.btc(t.incertain) + ' BTC incertains');
    if (S.attente.length) l.push(S.attente.length + ' intervalle(s) en attente des exécutions complètes');
    if (h.u !== null && h.u > BM.MURS.uAlerteMs) l.push('⚠ horloge incertaine (± ' + Math.round(h.u) + ' ms > ' + BM.MURS.uAlerteMs + ' ms) : fenêtres larges, davantage d\'« incertain »');
    pastille(l, 8, 180, h.u !== null && h.u > BM.MURS.uAlerteMs ? C.down : C.murAsk, 'left', 'Destin · ' + (S.derniere !== null ? BM.age(now - axe(S.derniere)) : '—') + (h.u !== null && h.u > BM.MURS.uAlerteMs ? ' · ⚠ horloge' : ''));
  }

  // ─── Rafales au marché : un trait vertical par rafale ──────────────────────
  // Rien avant le début des exécutions lues (E.exec.premier) ; les intervalles non lus sont hachurés
  // (hachuresExecutions). Les traits sont gardés tant que ni les rafales ni la vue ne changent.
  let RAF = { cle: null, items: [], achat: null, vente: null, fond: null };
  const RAF_LARGEUR = 2, RAF_HAUTEUR = 3;
  const fleche = r => (r.achat ? '▲' : '▼');
  const ordres = k => '≥ ' + k + ' ordre' + (k > 1 ? 's' : '');
  function rafales() {
    const debut = E.exec.premier;
    if (debut === null || !E.raf.liste.length) { RAF.items = []; return; }
    const v = E.vue, cle = [E.raf.version, v.t1, v.t2, v.p1, v.p2, Z.chaleur.w, Z.chaleur.h, R.rafaleMin, debut].join('|');
    if (RAF.cle !== cle) {
      const tpp = (v.t2 - v.t1) / Z.chaleur.w, items = [], achat = new Path2D(), vente = new Path2D(), fond = new Path2D();
      for (const r of E.raf.dans(Math.max(v.t1 - tpp * 4, debut), v.t2, R.rafaleMin)) {
        const x = Math.round(X(r.T)) - 1, ya = Y(r.pMax), yb = Y(r.pMin), h = Math.max(RAF_HAUTEUR, yb - ya), y0 = (ya + yb) / 2 - h / 2;
        if (y0 > Z.chaleur.h || y0 + h < 0) continue;
        items.push({ x, y0, h, r, t: null, tw: 0 });
        (r.achat ? achat : vente).rect(x, y0, RAF_LARGEUR, h);
        fond.rect(x - 1, y0 - 1, RAF_LARGEUR + 2, h + 2);
      }
      items.sort((a, b) => b.r.q8 - a.r.q8);
      RAF = { cle, items, achat, vente, fond };
    }
    ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fill(RAF.fond);
    ctx.fillStyle = C.up; ctx.fill(RAF.achat);
    ctx.fillStyle = C.down; ctx.fill(RAF.vente);
    // Libellés là où il y a la place, les plus grosses d'abord ; jamais sur un autre texte.
    let n = 0;
    for (const it of RAF.items) {
      if (n >= 30) break;
      const r = it.r;
      // Texte et largeur gardés avec le trait (une mesure de texte par libellé et par recalcul).
      if (!it.t) { it.t = fleche(r) + ' ' + BM.btc(r.q8 / 1e8) + ' BTC · ' + (r.prix ? r.prix.size : r.nPrix) + ' prix · ' + ordres(r.ordres); it.tw = largeurTexte(it.t, 10, true) + 4; }
      const t = it.t, tw = it.tw, x0 = it.x + RAF_LARGEUR + 3, y0 = it.y0 + it.h / 2 - 7;
      if (x0 + tw > Z.chaleur.w || y0 < 0 || y0 + 14 > Z.chaleur.h || chevauche(x0, y0, tw, 14)) continue;
      reserver(x0, y0, tw, 14, t);
      texte(t, x0 + 2, y0 + 7, r.achat ? C.up : C.down, 10, 'left', true);
      n++;
    }
  }
  /** La rafale sous le pointeur (la plus grosse dont le trait, élargi de 3 px, le contient). */
  function rafaleEn(x, y) {
    for (const it of RAF.items) if (Math.abs(x - (it.x + RAF_LARGEUR / 2)) <= 3 && y >= it.y0 - 3 && y <= it.y0 + it.h + 3) return it.r;
    return null;
  }
  const usdt = v => (v >= 1e6 ? BM.nombre(v / 1e6, 0, 2) + ' M USDT' : BM.nombre(v, 0, 0) + ' USDT');
  function texteRafale(raf, court) {
    const r = BM.lireRafale(raf), ms = String(raf.T % 1000).padStart(3, '0');
    const raison = r.ordresMin === 1 ? 'aucun prix répété ni recul' : [r.repetes ? 'prix répété' : '', r.reculs ? 'prix revenu en arrière' : ''].filter(Boolean).join(', ');
    const tete = BM.heure(r.T, true) + ',' + ms + ' · ' + (r.achat ? 'achat' : 'vente') + ' au marché · ' + BM.btc(r.q) + ' BTC (≈ ' + usdt(r.quote) + ')';
    if (court) return tete + ' · ' + r.nPrix + ' prix · ' + ordres(r.ordresMin);
    return tete + ' · prix moyen ' + BM.prix(r.vwap, 2) + ' · de ' + BM.prix(r.pMin, 2) + ' à ' + BM.prix(r.pMax, 2) + ' (' + r.nPrix + ' prix, ' + r.n + ' exécutions)'
      + ' · ' + ordres(r.ordresMin) + ' (' + raison + ') · plus longue séquence ' + BM.btc(r.plusLongueSequence) + ' BTC';
  }
  /** Le panneau des dernières rafales : réécrit seulement s'il est ouvert et que la liste a changé. */
  let LISTE_RAF = null;
  function majPanneauRafales() {
    const p = document.getElementById('rafalesPanneau');
    if (!p || p.hidden) return;
    const cle = E.raf.version + '|' + R.rafaleMin;
    if (LISTE_RAF === cle) return;
    LISTE_RAF = cle;
    const l = E.raf.dernieres(BM.RAFALES.liste, R.rafaleMin);
    document.getElementById('listeRafales').innerHTML = l.length
      ? l.map(r => '<li><span class="' + (r.achat ? 'achat' : 'vente') + '">' + fleche(r) + '</span> ' + texteRafale(r, true).replace(/ · (\S+ BTC) /, ' · <b>$1</b> ') + '</li>').join('')
      : '<li>Aucune rafale ≥ ' + BM.nombre(R.rafaleMin, 0, 2) + ' BTC depuis ' + (E.exec.premier ? BM.heure(E.exec.premier) : 'l\'ouverture') + '.</li>';
  }

  function croix() {
    const s = E.souris;
    if (!s || s.zone !== 'chaleur') return;
    ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(Math.round(s.x) + 0.5, 0); ctx.lineTo(Math.round(s.x) + 0.5, Z.chaleur.h);
    ctx.moveTo(0, Math.round(s.y) + 0.5); ctx.lineTo(Z.chaleur.w, Math.round(s.y) + 0.5); ctx.stroke(); ctx.restore();
  }

  // ─── Axes, carnet latéral, panneaux ────────────────────────────────────────
  function axePrix() {
    const a = Z.axeP;
    ctx.fillStyle = C.panneau; ctx.fillRect(a.x, a.y, a.w, a.h);
    // Gamma d'abord : ses repères (dans le champ ou fléchés hors champ) réservent leur place,
    // et les graduations s'effacent devant eux.
    const reserve = [];
    if (R.calques.gamma && E.niv) {
      let haut = 0, bas = 0;
      const centre = (E.vue.p1 + E.vue.p2) / 2;
      for (const g of [...E.niv.gamma].sort((u, v) => Math.abs(u.pAxe - centre) - Math.abs(v.pAxe - centre))) {
        const y = Y(g.pAxe);
        // Le libellé TIENT dans l'axe (54 px sur un téléphone) : strike entier, sinon en milliers.
        if (y > 6 && y < a.h - 6) {
          ctx.fillStyle = C.gamma; ctx.fillRect(a.x, y - 7, a.w, 14);
          const t = ajuster([g.court + ' ' + BM.prix(g.p), g.court + ' ' + kilo(g.p), g.court + ' ' + kiloCourt(g.p)], a.w - 6, 10, true);
          texte(t, a.x + 4, y, '#0b0b12', largeurTexte(t, 10, true) <= a.w - 6 ? 10 : 8.5, 'left', true); reserve.push(y);
        } else if ((y <= 6 && haut < 3) || (y >= a.h - 6 && bas < 3)) {
          // Hors champ : fléché, en milliers ; la valeur reste écrite (corps réduit s'il le faut).
          const f = y <= 6 ? '↑' : '↓', yy = y <= 6 ? 9 + 13 * haut++ : a.h - 9 - 13 * bas++;
          const t = ajuster([f + g.court + ' ' + kilo(g.p), f + g.court + ' ' + kiloCourt(g.p), f + g.court + kiloCourt(g.p)], a.w - 5, 9.5, true);
          const corps = largeurTexte(t, 9.5, true) <= a.w - 5 ? 9.5 : 8;
          texte(t, a.x + 3, yy, C.gamma, corps, 'left', true); reserve.push(yy);
        }
      }
    }
    const p = dernierPrix(), yPrix = p ? Math.max(8, Math.min(a.h - 8, Y(p))) : -99;
    reserve.push(yPrix);
    const pas = BM.pasRond((E.vue.p2 - E.vue.p1) / Math.max(4, a.h / 70));
    const dec = BM.decimales(pas);          // 2,5 $ s'écrit 2,5 — pas « 3 »
    const graduations = TEXTES.axePrix = [];
    for (let q = Math.ceil(E.vue.p1 / pas) * pas; q <= E.vue.p2; q += pas) {
      const y = Y(q);
      if (reserve.some(r => Math.abs(r - y) < 13)) continue;
      graduations.push(BM.prix(q, dec));
      texte(BM.prix(q, dec), a.x + 6, y, C.ink3, 10.5);
    }
    if (p) {
      ctx.fillStyle = C.prix; arrondi(a.x + 1, yPrix - 9, a.w - 2, 18, 4); ctx.fill();
      texte(ajuster([BM.prix(p, 1), BM.prix(p, 0)], a.w - 7, 11, true), a.x + 5, yPrix, '#0b0b12', 11, 'left', true);
    }
  }
  const kilo = p => BM.nombre(p / 1000, 0, 1) + ' k';
  const kiloCourt = p => BM.nombre(p / 1000, 0, 0) + 'k';
  /** Le fuseau de l'axe du temps (l'heure LOCALE de l'appareil), écrit dans l'angle : « UTC+2 ». */
  function fuseau(t) {
    const m = -new Date(t).getTimezoneOffset(), a = Math.abs(m);
    return 'UTC' + (m < 0 ? '−' : '+') + Math.floor(a / 60) + (a % 60 ? ':' + String(a % 60).padStart(2, '0') : '');
  }
  function axeTemps() {
    const a = Z.axeT;
    ctx.fillStyle = C.panneau; ctx.fillRect(a.x, a.y, Z.w, a.h);
    const L = E.vue.t2 - E.vue.t1, brut = L / Math.max(3, a.w / 110);
    // Une échelle fixe (BM.PAS_TEMPS) ; les secondes sont écrites dès que le pas n'est pas un
    // nombre entier de minutes (un pas de 100 s n'existe plus, et 15 s s'écrit avec ses secondes).
    const pas = BM.pasTemps(brut), sec = pas % 60e3 !== 0;
    const off = new Date().getTimezoneOffset() * 60e3, ticks = [];
    for (let t = Math.ceil((E.vue.t1 - off) / pas) * pas + off; t <= E.vue.t2; t += pas) ticks.push(t);
    // Une vue qui passe minuit (ou dépasse 24 h) : le jour sur la première graduation et après
    // chaque minuit — sinon « 18:00 » aux deux bouts de l'axe ne dit pas lequel est hier.
    const jours = ticks.length && BM.jour(ticks[0]) !== BM.jour(ticks[ticks.length - 1]);
    ticks.forEach((t, i) => {
      const x = X(t);
      ctx.fillStyle = C.grille; ctx.fillRect(Math.round(x), a.y, 1, 4);
      const j = jours && (i === 0 || BM.jour(t) !== BM.jour(ticks[i - 1])) ? BM.jour(t) + ' ' : '';
      texte(j + BM.heure(t, sec), x, a.y + a.h / 2 + 1, j ? C.ink2 : C.ink3, 10.5, 'center');
    });
    TEXTES.axeTemps = ticks.map((t, i) => (jours && (i === 0 || BM.jour(t) !== BM.jour(ticks[i - 1])) ? BM.jour(t) + ' ' : '') + BM.heure(t, sec));
    TEXTES.pasTemps = pas;
    // Les heures sont LOCALES (celles de l'appareil) : le fuseau est écrit dans l'angle, sous l'axe des prix.
    TEXTES.fuseau = fuseau(E.vue.t2);
    texte(TEXTES.fuseau, Z.axeP.x + Z.axeP.w / 2, a.y + a.h / 2 + 1, C.ink3, 9.5, 'center');
  }
  function carnetLateral() {
    const a = Z.dom;
    ctx.fillStyle = C.panneau; ctx.fillRect(a.x, a.y, a.w, a.h);
    texte('Carnet live', a.x + 6, 10, C.ink2, 10, 'left', true);
    const k = E.carnet;
    if (!k) { texte(E.erreurs.carnet ? 'indisponible' : '…', a.x + 6, 26, C.ink3, 10); return; }
    // Un pas MULTIPLE de la tranche du carnet live : chaque barre réunit le même nombre de
    // tranches entières (sinon 2 puis 3 tranches par barre : un peigne, et des Σ faux).
    const pas = BM.pasMultiple((E.vue.p2 - E.vue.p1) / a.h * 4, k.dp), mult = Math.round(pas / k.dp), tp = BM.prix(pas, BM.decimales(pas));
    TEXTES.carnet = ajuster(['Σ BTC par ' + tp + ' $', 'Σ BTC / ' + tp + ' $', 'Σ / ' + tp + ' $'], a.w - 8, 9.5);
    texte(TEXTES.carnet, a.x + 6, 24, C.ink3, 9.5);
    const agg = (m) => { const o = new Map(); for (const [pb, q] of m) { const P = Math.floor(pb / mult); o.set(P, (o.get(P) || 0) + q); } return o; };
    const sb = agg(k.sb), sa = agg(k.sa);
    let max = 0;
    for (const m of [sb, sa]) for (const [P, q] of m) { const y = Y(P * pas); if (y >= 0 && y <= a.h) max = Math.max(max, q); }
    if (!max) return;
    const L = a.w - 34;
    // Les barres restent entre l'en-tête (34 px) et la ligne de l'écart (20 px du bas) : aucun texte dessous.
    ctx.save(); ctx.beginPath(); ctx.rect(a.x, 34, a.w, a.h - 54); ctx.clip();
    for (const [m, coul] of [[sb, C.up], [sa, C.down]]) for (const [P, q] of m) {
      const ya = Y((P + 1) * pas), yb = Y(P * pas);
      if (yb < 34 || ya > a.h - 20) continue;
      const l = L * q / max;
      ctx.globalAlpha = 0.75; ctx.fillStyle = coul; ctx.fillRect(a.x + 2, ya, l, Math.max(1, yb - ya - 0.5)); ctx.globalAlpha = 1;
      if (yb - ya >= 11 && q >= max * 0.35) texte(BM.btc(q), a.x + 4 + l, (ya + yb) / 2, C.ink1, 9.5);
    }
    ctx.restore();
    if (k.meilleurBid && k.meilleurAsk) {
      const sp = k.meilleurAsk - k.meilleurBid;
      texte('écart ' + BM.prix(sp, 2) + ' $', a.x + 6, a.h - 10, C.ink3, 9.5);
    }
  }
  function minutesVisibles() {
    return E.minutes.filter(m => m.fin > E.vue.t1 && m.t < E.vue.t2);
  }
  /** Minutes non lues (trous des bougies) dans la vue, hachurées sur un panneau. */
  function hachuresBougies(a) {
    for (const [ta, tb] of BM.trousMinutes(E.minutes)) {
      const xa = Math.max(0, X(ta)), xb = Math.min(a.w, X(tb));
      if (xb > xa) hachurer(xa, a.y + 14, xb - xa, a.h - 14, 0.6);
    }
  }
  const TEXTES = {};             // textes des panneaux (lus par les harnais : ce qui est écrit)
  function panneauVolume() {
    const a = Z.vol;
    ctx.fillStyle = C.panneau; ctx.fillRect(a.x, a.y, Z.w, a.h);
    // Une barre = g minutes, g pris dans une échelle fixe et les groupes ANCRÉS sur l'horloge
    // (⌊t / g min⌋) : le titre dit la vraie durée, et les barres ne bougent pas quand la vue glisse.
    const ppm = a.w / ((E.vue.t2 - E.vue.t1) / 60e3), g = BM.pasMinutes(ppm), pas = g * 60e3;
    // Les bougies (volume, CVD, ligne de prix) portent aussi leur âge : une lecture arrêtée se voit.
    const age = E.minutesA ? ' · bougies lues il y a ' + BM.age(Date.now() - E.minutesA) : '';
    TEXTES.volume = Z.etroit ? 'Volume / ' + BM.texteMinutes(g) + age : 'Volume (USDT) par ' + BM.texteMinutes(g) + ' · achats ▲ / ventes ▼ au marché' + age;
    texte(TEXTES.volume, a.x + 6, a.y + 9, C.ink3, 9.5);
    const ms = minutesVisibles();
    if (!ms.length) return;
    // Les barres restent SOUS le titre et dans la largeur de la carte (jamais sous l'axe des prix).
    ctx.save(); ctx.beginPath(); ctx.rect(a.x, a.y + 16, a.w, a.h - 16); ctx.clip();
    const groupes = new Map();
    for (const m of ms) {
      const K = Math.floor(m.t / pas), b = groupes.get(K) || { t: K * pas, achat: 0, vente: 0 };
      b.achat += m.achat; b.vente += m.vente; groupes.set(K, b);
    }
    const barres = [...groupes.values()];
    // Échelle au 95ᵉ centile : une minute exceptionnelle ne doit pas écraser toutes les
    // autres. Une barre plus haute est écrêtée ET marquée d'un trait blanc.
    const max = (BM.centile(barres.map(b => Math.max(b.achat, b.vente)), 0.95) * 1.15) || 1;
    const haut = a.y + 18, basZ = a.y + a.h - 2, mid = (haut + basZ) / 2, hh = (basZ - haut) / 2 - 1, lw = Math.max(1, ppm * g - 1);
    for (const b of barres) {
      const x = X(b.t), ha = hh * Math.min(1, b.achat / max), hv = hh * Math.min(1, b.vente / max);
      ctx.fillStyle = C.up; ctx.fillRect(x, mid - ha, lw, ha);
      ctx.fillStyle = C.down; ctx.fillRect(x, mid, lw, hv);
      ctx.fillStyle = C.prix;
      if (b.achat > max) ctx.fillRect(x, mid - hh - 1, lw, 1.5);
      if (b.vente > max) ctx.fillRect(x, mid + hh - 0.5, lw, 1.5);
    }
    ctx.restore();
    hachuresBougies(a);
  }
  function panneauCvd() {
    const a = Z.cvd;
    ctx.fillStyle = C.panneau; ctx.fillRect(a.x, a.y, Z.w, a.h);
    const ms = E.minutes, i0 = ms.findIndex(m => m.fin > E.vue.t1);
    if (i0 < 0) { TEXTES.cvd = ''; return; }
    // Après un trou de bougies, le cumul repart de 0 (BM.cvd) : il est coupé, hachuré, et dit.
    const { v: cvd, reprises } = BM.cvd(ms, i0), coupe = new Set(reprises);
    let lo = 0, hi = 0, i1 = i0;
    for (let i = i0; i < ms.length; i++) { if (ms[i].t > E.vue.t2) break; lo = Math.min(lo, cvd[i]); hi = Math.max(hi, cvd[i]); i1 = i; }
    const pad = (hi - lo) * 0.1 || 1, y = v => a.y + 16 + (a.h - 20) * (1 - (v - lo + pad) / (hi - lo + 2 * pad));
    // La courbe reste dans la largeur de la carte (jamais sous l'axe des prix ni le carnet latéral).
    ctx.save(); ctx.beginPath(); ctx.rect(a.x, a.y, a.w, a.h); ctx.clip();
    ctx.strokeStyle = C.grille; ctx.beginPath(); ctx.moveTo(0, y(0)); ctx.lineTo(a.w, y(0)); ctx.stroke();
    ctx.strokeStyle = C.accent; ctx.lineWidth = 1.4; ctx.beginPath();
    let der = 0;
    for (let i = i0; i <= i1; i++) {
      const x = X(Math.min(ms[i].fin, maintenant()));
      if (i === i0 || coupe.has(i)) ctx.moveTo(X(ms[i].t), y(0));
      ctx.lineTo(x, y(cvd[i])); der = cvd[i];
    }
    ctx.stroke();
    ctx.restore();
    hachuresBougies(a);
    const vues = reprises.filter(i => i <= i1), depuis = vues.length ? ms[vues[vues.length - 1]].t : null;
    const manque = BM.dureeDans(BM.trousMinutes(ms), E.vue.t1, E.vue.t2);
    const val = ' · ' + (der >= 0 ? '+' : '−') + BM.prix(Math.abs(der) / 1e6, 1) + ' M';
    TEXTES.cvd = Z.etroit ? 'CVD depuis ' + (depuis ? BM.heure(depuis) + ' (après ' + BM.age(manque) + ' non lues)' : 'le bord') + val
      : 'CVD spot (USDT) cumulé depuis ' + (depuis ? BM.heure(depuis) + ' (repart de 0 après ' + BM.age(manque) + ' de bougies non lues, hachurées)' : 'le bord gauche') + val;
    texte(TEXTES.cvd, a.x + 6, a.y + 9, C.ink3, 9.5);
  }

  // ─── Lecture au pointeur : la VALEUR, quel que soit le réglage ──────────────
  const bulleInfo = document.getElementById('lecture');
  let lectureHtml = null, lectureTaille = null;
  // Largeur maximale de la bulle de lecture : lue dans la feuille (--lecture-max), pas recopiée.
  const LECTURE_MAX = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--lecture-max')) || 440;
  function cacherLecture() { if (!bulleInfo.hidden) bulleInfo.hidden = true; lectureHtml = null; }
  function lectureSouris() {
    const s = E.souris;
    // Pendant un glissement à la souris, la croix suit le pointeur et la lecture attend le lâcher.
    if (!s || s.zone !== 'chaleur' || s.geste) { cacherLecture(); return; }
    const t = T(s.x), p = Pr(s.y), l = [];
    l.push('<b>' + BM.prix(p, 1) + ' $</b> · ' + BM.heure(t, true));
    // Le PIXEL sous le pointeur, tel que la peinture le calcule : mêmes colonnes, mêmes tranches,
    // même MAX (BM.lirePixel), même « maintenant » que la peinture de SON calque. La valeur lue est
    // celle de la couleur vue, à tout niveau de zoom.
    const tpp = (E.vue.t2 - E.vue.t1) / Z.chaleur.w, pp = (E.vue.p2 - E.vue.p1) / Z.chaleur.h;
    const ix = Math.floor(s.x), iy = Math.floor(s.y), ta = E.vue.t1 + ix * tpp;
    const cel = (g, nom, enc, coupe) => {
      const tb = Math.min(ta + tpp, coupe);
      if (!g || !(tb > ta)) return;
      const [ja, jb] = BM.tranchesLigne(E.vue.p2, pp, iy, g.dp, [0, 0]);
      const r = BM.lirePixel(g, ta, tb, ja, jb);
      if (!r) return;
      if (!r.nObs) { l.push(nom + ' : non observé'); return; }
      if (r.horsBande) { l.push(nom + ' : hors de la bande couverte'); return; }
      const tranche = (a, b) => BM.prix(a * g.dp) + '–' + BM.prix((b + 1) * g.dp) + ' $';
      const [d, f] = BM.etendueColonne(g, r.c);
      const quand = g.fusion ? 'colonnes ' + BM.heure(d) + '–' + BM.heure(f) + ' (MAX de ' + Math.round((f - d) / 60e3) + ' min)'
        : (g.creux ? 'lu à ' + BM.heure(d, true) : 'minute ' + BM.heure(d));
      const pixel = r.nObs * r.nT > 1 ? ' · pixel = MAX de ' + r.nObs + (g.creux ? ' lecture(s)' : ' colonne(s)') + ' × ' + r.nT + ' tranche(s)' : '';
      if (!r.v) { l.push(nom + ' ' + tranche(ja, jb) + ' : rien au-dessus du seuil'); l.push('&nbsp;&nbsp;' + quand + pixel); return; }
      const dec = BM.decoder(r.v, enc);
      l.push(nom + ' ' + tranche(r.pb, r.pb) + ' (' + r.cote + ') : intensité ' + r.v
        + (dec ? (dec.sature ? ' → ' + natureCase(g, d) + ' ≥ ' + BM.btc(dec.min) + ' BTC (saturé)' : ' → ' + natureCase(g, d) + ' ' + BM.btc(dec.min) + '–' + BM.btc(dec.max) + ' BTC') : ' (sans unité)'));
      // Le carnet live garde ses quantités : la valeur MESURÉE, pas seulement son intervalle.
      const q = g.creux ? g.quantite(r.c, r.pb, r.cote === 'bid' ? 'b' : 'a') : null;
      l.push('&nbsp;&nbsp;' + (q ? 'mesuré : ' + BM.btc(q) + ' BTC · ' : '') + quand + pixel);
    };
    const pub = grillePublieeAffichee();
    if (R.calques.loin && E.loin) cel(E.loin, 'Coinbase', E.loin.encodage, LOIN.coupe);
    if (pub) cel(pub, 'Carte', pub.encodage, PUB.coupe);
    if (R.calques.live && !LIVE.vide) cel(E.live, 'Live', E.liveRef === 'publiee' ? E.pub && E.pub.encodage : null, LIVE.coupe);
    if (R.calques.executions && E.exec.seaux.size) {
      // La bulle SURVOLÉE (la plus haute qui contient le pointeur), sinon le seau sous le pointeur :
      // la même grille de seaux que le dessin, jamais une fenêtre centrée sur le pointeur.
      let b = null;
      for (let i = BULLES.length - 1; i >= 0 && !b; i--) { const z = BULLES[i]; if ((s.x - z.x) ** 2 + (s.y - z.y) ** 2 <= z.r * z.r) b = z.b; }
      if (!b) {
        const { pasT, pasP } = pasBulles(), T0 = Math.floor(t / pasT) * pasT;
        b = E.exec.regrouper(T0, T0 + pasT, pasT, pasP).find(x => p >= x.pa && p < x.pb) || null;
      }
      if (b && b.achat + b.vente > 0) {
        l.push('Exécutions ' + BM.heure(b.ta, true) + '–' + BM.heure(b.tb, true) + ' · ' + BM.prix(b.pa) + '–' + BM.prix(b.pb) + ' $ : '
          + BM.btc(b.achat) + ' BTC achetés / ' + BM.btc(b.vente) + ' vendus au marché');
      }
    }
    if (R.calques.rafales) { const rf = rafaleEn(s.x, s.y); if (rf) l.push('Rafale ' + texteRafale(rf)); }
    if (R.calques.memoire && E.pub) { const tm = texteMemoire(s.y); if (tm) l.push(tm); }
    if (R.calques.destin) { const dn = destinEn(s.x, s.y); if (dn) l.push(texteDestin(dn)); }
    // Le texte n'est réécrit que s'il a changé ; à la souris, la bulle se place sans être MESURÉE
    // (une mesure après innerHTML force une mise en page à chaque mouvement) : elle bascule à gauche
    // ou au-dessus du pointeur par un translate(-100 %) quand sa largeur maximale (LECTURE_MAX) ou
    // une hauteur prudente ne tiendraient pas. Au doigt (un appui, rare), elle est mesurée.
    const html = l.join('<br>');
    if (html !== lectureHtml) { bulleInfo.innerHTML = html; bulleInfo.hidden = false; lectureHtml = html; lectureTaille = null; }
    const r = rect(), vw = window.innerWidth, vh = window.innerHeight, px = r.left + s.x, py = r.top + s.y;
    if (s.tactile || vw < 2 * LECTURE_MAX) {
      if (!lectureTaille) lectureTaille = [bulleInfo.offsetWidth, bulleInfo.offsetHeight];
      const [bw, bh] = lectureTaille;
      let x, y;
      if (s.tactile) {
        // Au doigt : au-dessus du point touché (le doigt ne la cache pas), centrée et dans l'écran.
        x = Math.max(8, Math.min(vw - bw - 8, px - bw / 2));
        y = py - bh - 28;
        if (y < 8) y = py + 28;
      } else {
        x = px + 16; y = py + 16;
        if (x + bw > vw - 8) x = Math.max(8, px - bw - 16);
        if (y + bh > vh - 8) y = Math.max(8, py - bh - 16);
      }
      bulleInfo.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px)';
      return;
    }
    const gauche = px + 16 + LECTURE_MAX > vw - 8, haut = py + 16 + 170 > vh - 8;
    bulleInfo.style.transform = 'translate(' + Math.round(px + (gauche ? -16 : 16)) + 'px,' + Math.round(py + (haut ? -16 : 16)) + 'px)'
      + (gauche || haut ? ' translate(' + (gauche ? '-100%' : '0') + ',' + (haut ? '-100%' : '0') + ')' : '');
  }
  // ─── Interactions ──────────────────────────────────────────────────────────
  function zoneDe(x, y) {
    if (!Z) return null;
    for (const k of ['chaleur', 'axeP', 'dom', 'axeT', 'vol', 'cvd']) {
      const a = Z[k];
      if (x >= a.x && x < a.x + a.w && y >= a.y && y < a.y + a.h) return k;
    }
    return null;
  }
  function zoomTemps(f, x) {
    const t = T(x), v = E.vue;
    const L = Math.min(30 * 3600e3, Math.max(60e3, (v.t2 - v.t1) * f));
    v.t1 = t - (t - v.t1) / (v.t2 - v.t1) * L; v.t2 = v.t1 + L;
  }
  function zoomPrix(f, y) {
    const p = Pr(y), v = E.vue;
    const L = Math.min(v.p2 * 0.5, Math.max(5, (v.p2 - v.p1) * f));
    v.p2 = p + (v.p2 - p) / (v.p2 - v.p1) * L; v.p1 = v.p2 - L;
  }
  function lacher() { if (E.suivre) { E.suivre = false; majBoutonSuivre(); } }
  // GESTES
  //   Souris : glisser déplace la carte (par pixels entiers : le calque publié se décale au lieu
  //   d'être repeint) ; la croix suit le pointeur pendant le geste, la lecture revient au lâcher.
  //   Doigt : un appui bref ÉPINGLE la lecture là où il tombe (un autre appui la déplace, un appui
  //   au même endroit l'enlève) ; un appui long (APPUI_LONG) l'affiche et la fait suivre le doigt
  //   sans déplacer la carte ; glisser déplace la carte ; deux doigts zooment.
  const APPUI_LONG = 450, TAP_PX = 8;
  const pointeurs = new Map();
  let geste = null, minuteurAppui = null;
  const position = e => { const r = rect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  cv.addEventListener('pointerdown', e => {
    try { cv.setPointerCapture(e.pointerId); } catch (x) { /* pointeur synthétique */ }
    const { x, y } = position(e), tactile = e.pointerType === 'touch';
    pointeurs.set(e.pointerId, { x, y });
    clearTimeout(minuteurAppui);
    if (pointeurs.size === 2) {
      const [a, b] = [...pointeurs.values()];
      geste = { pince: true, dx: Math.abs(a.x - b.x) || 1, dy: Math.abs(a.y - b.y) || 1, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, vue: Object.assign({}, E.vue) };
      return;
    }
    geste = { x, y, zone: zoneDe(x, y), vue: Object.assign({}, E.vue), tactile, bouge: false, lecture: false };
    if (tactile) {
      minuteurAppui = setTimeout(() => {
        if (!geste || geste.pince || geste.bouge) return;
        geste.lecture = true;
        E.souris = { x: geste.x, y: geste.y, zone: zoneDe(geste.x, geste.y), tactile: true };
        dessiner();
      }, APPUI_LONG);
    }
  });
  cv.addEventListener('pointermove', e => {
    const { x, y } = position(e), tactile = e.pointerType === 'touch';
    if (pointeurs.has(e.pointerId)) pointeurs.set(e.pointerId, { x, y });
    // La souris : la croix suit TOUJOURS le pointeur, geste ou non.
    if (!tactile) E.souris = { x, y, zone: zoneDe(x, y), geste: !!(geste && geste.bouge) };
    if (geste && E.vue && Z) {
      const v0 = geste.vue;
      if (geste.pince && pointeurs.size === 2) {
        const [a, b] = [...pointeurs.values()];
        const fx = geste.dx / (Math.abs(a.x - b.x) || 1), fy = geste.dy / (Math.abs(a.y - b.y) || 1);
        Object.assign(E.vue, v0);
        if (geste.dx > 30) zoomTemps(fx, geste.cx);
        if (geste.dy > 30) zoomPrix(fy, geste.cy);
        lacher(); dessiner(); return;
      }
      if (!geste.pince) {
        if (geste.lecture) { E.souris = { x, y, zone: zoneDe(x, y), tactile: true }; dessiner(); return; }
        const dx = Math.round(x - geste.x), dy = Math.round(y - geste.y);
        if (!geste.bouge) {
          if (Math.abs(dx) + Math.abs(dy) < (tactile ? TAP_PX : 1)) return;     // pas encore un glissement
          geste.bouge = true; clearTimeout(minuteurAppui);
          if (tactile && E.souris) E.souris = null;                            // la lecture épinglée s'en va
          if (!tactile) E.souris.geste = true;
        }
        if (geste.zone === 'axeP') {
          Object.assign(E.vue, v0); zoomPrix(Math.exp(dy / 160), Z.chaleur.h / 2);
        } else if (geste.zone === 'axeT') {
          Object.assign(E.vue, v0); zoomTemps(Math.exp(-dx / 200), Z.chaleur.w / 2);
        } else {
          // Un nombre ENTIER de pixels (invisible) : la chaleur gardée se décale exactement.
          const dt = dx * (v0.t2 - v0.t1) / Z.chaleur.w, dp = dy * (v0.p2 - v0.p1) / Z.chaleur.h;
          E.vue.t1 = v0.t1 - dt; E.vue.t2 = v0.t2 - dt; E.vue.p1 = v0.p1 + dp; E.vue.p2 = v0.p2 + dp;
        }
        if (Math.abs(dx) + Math.abs(dy) > 3) lacher();
        dessiner(); return;
      }
    }
    if (!tactile) dessiner();
  });
  const fin = e => {
    clearTimeout(minuteurAppui);
    const tactile = e.pointerType === 'touch';
    // Un appui bref au doigt, sans glisser : la lecture est épinglée là (ou enlevée si on retouche le même point).
    if (tactile && e.type === 'pointerup' && geste && !geste.pince && !geste.bouge && !geste.lecture && pointeurs.size === 1) {
      const { x, y } = position(e), s = E.souris;
      E.souris = s && s.tactile && Math.hypot(s.x - x, s.y - y) < 16 ? null : { x, y, zone: zoneDe(x, y), tactile: true };
    }
    pointeurs.delete(e.pointerId);
    if (pointeurs.size < 2 && geste && geste.pince) geste = null;
    if (!pointeurs.size) { geste = null; if (E.souris && E.souris.geste) E.souris.geste = false; }
    dessiner();
  };
  cv.addEventListener('pointerup', fin);
  cv.addEventListener('pointercancel', fin);
  // Le doigt « quitte » la carte à chaque lever : la lecture épinglée reste.
  cv.addEventListener('pointerleave', e => { if (e.pointerType === 'touch' || geste) return; E.souris = null; dessiner(); });
  cv.addEventListener('wheel', e => {
    if (!E.vue || !Z) return;
    e.preventDefault();
    const { x, y } = position(e), zone = zoneDe(x, y);
    const f = Math.exp((e.deltaY || e.deltaX) * (e.deltaMode === 1 ? 0.05 : 0.0015));
    if (zone === 'axeP' || e.shiftKey) zoomPrix(f, Math.min(y, Z.chaleur.h));
    else if (e.ctrlKey) { zoomTemps(f, x); zoomPrix(f, y); }
    else zoomTemps(f, Math.min(x, Z.chaleur.w));
    lacher(); dessiner();
  }, { passive: false });
  cv.addEventListener('dblclick', () => vueParDefaut());
  window.addEventListener('keydown', e => {
    // Échap ferme un panneau ouvert, même depuis un de ses réglages, et rend la main au bouton.
    if (e.key === 'Escape') {
      if (document.querySelector('.panneau-flottant:not([hidden])')) { fermerPanneaux(true); e.preventDefault(); }
      else if (E.souris && E.souris.tactile) { E.souris = null; dessiner(); }
      return;
    }
    // Ctrl / Cmd / Alt + touche : un raccourci du navigateur (chercher, zoom, historique), pas de la carte.
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target && /input|select|textarea/i.test(e.target.tagName)) return;
    if (!E.vue || !Z) return;
    const k = e.key.toLowerCase(), v = E.vue;
    // Flèches : un dixième de la vue, arrondi au pixel (le calque publié se décale).
    const pasX = Math.round(Z.chaleur.w * 0.1) * (v.t2 - v.t1) / Z.chaleur.w, pasY = Math.round(Z.chaleur.h * 0.1) * (v.p2 - v.p1) / Z.chaleur.h;
    if (k === 'f') basculerSuivre();
    else if (k === 'r') vueParDefaut();
    else if (k === '+' || k === '=') { zoomTemps(0.8, Z.chaleur.w * 0.9); lacher(); }
    else if (k === '-') { zoomTemps(1.25, Z.chaleur.w * 0.9); lacher(); }
    else if (k === 'arrowup' || k === 'arrowdown') { const d = pasY * (k === 'arrowup' ? 1 : -1); v.p1 += d; v.p2 += d; lacher(); }
    else if (k === 'arrowleft' || k === 'arrowright') { const d = pasX * (k === 'arrowright' ? 1 : -1); v.t1 += d; v.t2 += d; lacher(); }
    else if (k === 'l') basculerPanneau('legende');
    else return;
    e.preventDefault();
    dessiner();
  });
  // Taille du canevas ou de la barre changée : position et mise en page relues (la barre peut passer
  // sur deux lignes ; les panneaux s'ouvrent sous sa hauteur RÉELLE).
  const barre = document.querySelector('.barre');
  function majHauteurBarre() { if (barre) document.documentElement.style.setProperty('--haut-barre', Math.ceil(barre.getBoundingClientRect().bottom) + 'px'); }
  const surTaille = () => { RECT = null; majHauteurBarre(); dessiner(); };
  if (window.ResizeObserver) { const ro = new ResizeObserver(surTaille); ro.observe(cv); if (barre) ro.observe(barre); }
  window.addEventListener('resize', surTaille);
  majHauteurBarre();

  // ─── Barre, réglages, légende ──────────────────────────────────────────────
  const $ = id => document.getElementById(id);
  function basculerSuivre() { E.suivre = !E.suivre; if (E.suivre) suivreMaintenant(); majBoutonSuivre(); dessiner(); }
  function majBoutonSuivre() { const b = $('btnSuivre'); if (b) b.setAttribute('aria-pressed', E.suivre ? 'true' : 'false'); }
  /** Ferme les panneaux ; `rendreFocus` : le bouton qui avait ouvert le panneau reprend la main. */
  function fermerPanneaux(rendreFocus) {
    let ouvreur = null;
    for (const p of document.querySelectorAll('.panneau-flottant')) {
      if (!p.hidden) ouvreur = document.querySelector('[aria-controls="' + p.id + '"]');
      p.hidden = true;
    }
    for (const b of document.querySelectorAll('[aria-controls]')) b.setAttribute('aria-expanded', 'false');
    if (rendreFocus && ouvreur) ouvreur.focus();
  }
  function basculerPanneau(id) {
    const p = $(id), ouvert = p.hidden;
    fermerPanneaux();
    p.hidden = !ouvert;
    const b = document.querySelector('[aria-controls="' + id + '"]');
    if (b) b.setAttribute('aria-expanded', ouvert ? 'true' : 'false');
  }
  const NOMS_CALQUES = [['publiee', 'Carte publiée'], ['live', 'Carnet live'], ['executions', 'Exécutions'], ['prix', 'Prix'],
    ['bidask', 'Bid / ask'], ['murs', 'Murs'], ['gamma', 'Gamma'], ['profil', 'Profil'], ['dom', 'Carnet latéral'],
    ['volume', 'Volume'], ['cvd', 'CVD'], ['memoire', 'Mémoire'], ['rafales', 'Rafales'], ['destin', 'Destin des murs'],
    ['loin', 'Profondeur Coinbase']];
  function construireBarre() {
    const z = $('calques');
    // Une ligne de puces qui défile : la molette verticale la fait défiler (sans Maj).
    z.addEventListener('wheel', e => {
      if (z.scrollWidth > z.clientWidth && Math.abs(e.deltaY) > Math.abs(e.deltaX)) { z.scrollLeft += e.deltaY; e.preventDefault(); }
    }, { passive: false });
    for (const [k, nom] of NOMS_CALQUES) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'puce'; b.textContent = nom; b.dataset.calque = k;
      b.setAttribute('aria-pressed', R.calques[k] ? 'true' : 'false');
      b.addEventListener('click', () => {
        R.calques[k] = !R.calques[k]; b.setAttribute('aria-pressed', R.calques[k] ? 'true' : 'false');
        sauver();
        // Le carnet n'est lu que pour ses calques : rallumé, il repart tout de suite.
        if (boucleCarnet && ['live', 'dom', 'bidask', 'destin'].includes(k) && R.calques[k]) boucleCarnet.reveiller();
        dessiner();
      });
      z.appendChild(b);
    }
    $('btnSuivre').addEventListener('click', basculerSuivre);
    $('btnReglages').addEventListener('click', () => basculerPanneau('reglages'));
    $('btnLegende').addEventListener('click', () => basculerPanneau('legende'));
    $('btnRafales').addEventListener('click', () => { LISTE_RAF = null; basculerPanneau('rafalesPanneau'); majPanneauRafales(); });
    for (const b of document.querySelectorAll('[data-fermer]')) b.addEventListener('click', fermerPanneaux);
    majBoutonSuivre();
    // Réglages
    const lier = (id, cle, conv, apres) => {
      const el = $(id);
      el.value = String(R[cle]);
      el.addEventListener('input', () => { R[cle] = conv(el.value); sauver(); if (apres) apres(); majLegende(); dessiner(); });
    };
    lier('rPalette', 'palette', String, majLuts);
    lier('rSeuil', 'seuilBas', Number, majLuts);
    lier('rSaturation', 'saturation', Number, majLuts);
    lier('rFusionT', 'fusionT', Number);
    lier('rFusionP', 'fusionP', Number);
    lier('rNiveaux', 'niveauxLive', Number, () => { reinitLive(); reinitMurs(); });
    lier('rDpLive', 'dpLive', Number, () => { reinitLive(); });
    lier('rBulleMin', 'bulleMin', Number);
    lier('rBulleEchelle', 'bulleEchelle', Number);
    lier('rPresence', 'presenceSeuil', Number);
    lier('rRafaleMin', 'rafaleMin', Number);
    lier('rMurs', 'mursSeuil', Number);
    $('rDefauts').addEventListener('click', () => {
      const c = R.calques; Object.assign(R, JSON.parse(JSON.stringify(DEFAUTS))); R.calques = c;
      sauver(); location.reload();
    });
  }
  /** La légende des couleurs : graduée en BTC quand l'encodage est publié. Les libellés des
   *  réglages de contraste disent aussi leur équivalent en BTC — la valeur, pas l'apparence. */
  function majLegende() {
    if (!C.fond) return;
    majLuts();
    const enc = E.pub && E.pub.encodage;
    // Une barre par rampe peinte : la palette « bid / ask teintés » en a DEUX (bid et ask), chacune
    // avec sa couleur ; les graduations valent pour les deux (même échelle).
    const zone = $('barreCouleurs');
    if (zone) {
      const rampes = LUT ? [[null, LUT]] : [['Bid (achats posés)', LUTB], ['Ask (ventes posées)', LUTA]];
      zone.innerHTML = rampes.map(([nom]) => (nom ? '<span class="rampe-nom">' + nom + '</span>' : '') + '<div class="rampe"></div>').join('');
      zone.querySelectorAll('.rampe').forEach((el, k) => {
        const c = document.createElement('canvas'); c.width = 256; c.height = 1;
        const x = c.getContext('2d'), im = x.createImageData(256, 1), v32 = new Uint32Array(im.data.buffer);
        v32.set(rampes[k][1]);
        x.putImageData(im, 0, 0);
        el.style.backgroundImage = 'url(' + c.toDataURL() + ')';
        el.dataset.rampe = rampes[k][0] ? (k ? 'ask' : 'bid') : 'unique';
      });
    }
    const fmt = v => { const d = BM.decoder(v, enc); return d ? (d.sature ? '≥ ' + BM.btc(d.min) : BM.btc(d.min)) + ' BTC' : 'intensité ' + v; };
    // Chaque libellé est posé SOUS sa couleur : au centre de la case de son intensité (v + ½) / 256,
    // les deux extrêmes alignés sur les bords de la barre.
    const g = $('gradBarre');
    if (g) g.innerHTML = [0, 64, 128, 192, 255].map(v => '<span data-v="' + v + '" class="' + (v === 0 ? 'debut' : v === 255 ? 'fin' : '') + '" style="left:' + ((v + 0.5) / 256 * 100).toFixed(3) + '%">' + (v ? fmt(v) : '0') + '</span>').join('');
    // Les valeurs APPLIQUÉES (BM.bornesContraste) : une saturation sous le seuil n'est pas appliquée.
    const ct = BM.bornesContraste(R.seuilBas, R.saturation);
    const s = $('rSeuilVal'); if (s) s.textContent = ct.bas ? fmt(ct.bas) : 'aucun';
    const t = $('rSaturationVal'); if (t) t.textContent = fmt(ct.haut) + (ct.haut !== R.saturation ? ' (seuil bas + 1)' : '');
    // Textes de la légende tirés des constantes du code qui dessine.
    const bb = BM.bornesBulles(R.bulleEchelle), tx = (id, v) => { const x = $(id); if (x) x.textContent = v; };
    tx('legBulles', 'Surface ∝ volume de ' + BM.btc(bb.min) + ' à ' + BM.btc(bb.max) + ' BTC (taille choisie) ; en dessous, le rayon reste au minimum ; au-delà, la bulle est plafonnée et son volume écrit.');
    tx('legPrixSeconde', String(SECONDE_DES_PPM));
    tx('legValidite', BM.VALIDITE.cadences + ' cadences + ' + BM.VALIDITE.margeMs / 1000 + ' s');
    tx('legVolume', BM.PAS_MINUTES.slice(0, 5).join(', ') + '…');
    // Mémoire du carnet et rafales : chaque nombre vient de BM.PRESENCE / BM.RAFALES / l'encodage publié.
    const P = BM.PRESENCE, RF = BM.RAFALES, sp = BM.seuilPresence(R.presenceSeuil, enc), lst = a => a.map(v => BM.nombre(v, 0, 2)).join(', ');
    const seuilTxt = sp ? '≥ ' + BM.nombre(sp.qS, 2, 2) + ' BTC (intensité ≥ ' + sp.vS + ' : le cran publié qui porte le seuil choisi, ' + BM.nombre(R.presenceSeuil, 0, 2) + ' BTC)' : null;
    tx('legMemoire', 'Pour chaque tranche de la carte publiée, la part des minutes OBSERVÉES de la fenêtre visible pendant lesquelles un niveau '
      + (seuilTxt || 'au-dessus du seuil choisi') + ' s\'y trouvait — bid ou ask (mesuré, lu sur la carte publiée brute : la fusion n\'y change rien). '
      + 'Échelle FIXE de 0 à 100 % (le pointillé marque 50 %) ; couleur du côté le plus souvent présent. Un pixel qui couvre plusieurs tranches montre la plus grande part. '
      + 'Conventions : « observée » = dans la bande déduite des cellules de la minute (un peu plus étroite que la bande lue) ; une tranche observée moins de '
      + P.minObserveMin + ' min est hachurée. Seuils proposés : ' + lst(P.seuilsBtc) + ' BTC. « Un niveau » : rien ne dit que c\'est le même ordre d\'une minute à l\'autre. '
      + 'Présence passée, ni support ni résistance.' + (sp ? '' : ' Encodage non publié : aucun seuil en BTC, le calque est éteint.'));
    tx('rPresenceNote', sp ? 'Seuil appliqué : ' + seuilTxt + '.' : 'Encodage non publié par la carte : aucun seuil en BTC.');
    tx('legRafales', 'Exécutions d\'une même milliseconde, d\'un même côté, aux identifiants consécutifs (mesuré) : un trait du prix le plus bas au plus haut, ▲ achat / ▼ vente au marché. '
      + 'Affichées à partir du seuil choisi (' + lst(RF.seuilsBtc) + ' BTC) ; gardées à partir de ' + BM.nombre(RF.gardeBtc, 0, 2) + ' BTC pendant ' + RF.gardeMs / 3600e3 + ' h, comme les exécutions. '
      + '« ≥ k ordres » : chaque exécution est un ordre preneur rempli à un prix, et un ordre ne parcourt les prix que dans un sens ; chaque prix répété ou recul en prouve donc un de plus. '
      + 'Mais ' + BM.TEXTE_RAFALES + '. Une rafale ne dit pas qui a acheté. Le panneau « Rafales » liste les ' + RF.liste + ' dernières.');
    tx('rafalesNote', 'Les ' + RF.liste + ' dernières rafales ≥ ' + BM.nombre(R.rafaleMin, 0, 2) + ' BTC, la plus récente d\'abord. ' + BM.TEXTE_RAFALES[0].toUpperCase() + BM.TEXTE_RAFALES.slice(1) + '.');
    // Destin des murs : seuils, marques, attente et limites tirés de BM.MURS / BM.FINS_MURS.
    const MU = BM.MURS, FM = BM.FINS_MURS;
    tx('legDestin', 'Chaque niveau de prix EXACT du carnet live brut qui atteint le seuil choisi (' + lst(MU.seuilsBtc) + ' BTC) est suivi de lecture en lecture : un trait à son prix, de la première lecture où il atteint ce seuil à sa fin. Tous les seuils sont suivis ensemble : en changer ne remet rien à zéro. '
      + 'Entre deux lectures, on compte les exécutions à ce prix et du côté qui le touche (un bid par une vente au marché, un ask par un achat) dans deux fenêtres tirées des instants d\'envoi et de réception des lectures et de l\'horloge Binance ± u : '
      + 'la fenêtre étroite (exécutions certainement entre les deux lectures, X_N) et la fenêtre large (toutes celles qui ont pu y être, X_W). '
      + 'Mesuré : « au moins … retirés » = baisse de la taille moins X_W, une borne basse de ce qui a été annulé ou réduit ; X_N est échangé à coup sûr, X_W − X_N est incertain. '
      + 'Fins : ' + ['retire', 'echange', 'partiel', 'incertain', 'bande', 'interrompu', 'la'].map(k => FM[k].s + ' ' + FM[k].t + ' (' + FM[k].d + ')').join(' ; ') + '. '
      + 'Une transition n\'est classée qu\'une fois les exécutions lues jusqu\'au bout de la fenêtre large (au plus ' + MU.attenteMaxMs / 1000 + ' s, sinon interrompu) ; deux lectures distantes de plus de ' + MU.ecartCadences + ' cadences : interrompu. '
      + 'Vue large : un trait de moins de ' + MU.pxMin + ' px n\'est pas dessiné et les fins d\'un même pixel sont comptées (×n). '
      + 'Limites : ' + BM.TEXTE_MURS + ' ; la carte ne dit pas qui a posé ni pourquoi un ordre est retiré. Une horloge incertaine (± u > ' + MU.uAlerteMs + ' ms) élargit les fenêtres, et la pastille le signale.');
    const e = $('encodageEtat');
    if (e) e.textContent = enc
      ? 'Encodage publié : intensité = min(' + enc.plafond + ', ent(' + enc.plafond + ' × √(q / ' + enc.ref_btc + ' BTC))), q = ' + enc.q + '.'
      : 'Encodage NON publié par ce fichier : la carte affiche des intensités 0–255, sans conversion en BTC (aucune référence n\'est inventée ici).';
  }
  /** Le statut dit ce qui ne marche pas ET quand ça repart : une porte fermée (429 / 418) et
   *  le prochain essai d'une source en échec, décomptés à la seconde. */
  function majStatut() {
    const el = $('statut');
    if (!el) return;
    const t = Date.now(), l = [];
    for (const [nom, p] of [['Binance', E.recul.binance], ['GitHub', E.recul.github]]) {
      const a = p.attente(t);
      if (a > 0) l.push(nom + ' : limite de requêtes atteinte (HTTP ' + (p.statut || 429) + ') — lectures suspendues, reprise dans ' + BM.age(a));
    }
    const noms = { carte: 'carte publiée', fichier: 'fichier 15 min', bougies: 'bougies', executions: 'exécutions', carnet: 'carnet live', horloge: 'horloge Binance' };
    for (const [k, v] of Object.entries(E.erreurs)) {
      if (!v) continue;
      const b = boucles.find(x => x.nom === k), d = b && b.echecs && b.prochain ? b.prochain - t : 0;
      l.push((noms[k] || k) + ' : ' + v + (d > 0 ? ' — nouvel essai dans ' + BM.age(d) : ''));
    }
    const txt = l.length ? '⚠ ' + l.join(' · ') : '';
    if (el.textContent !== txt) el.textContent = txt;
    el.hidden = !l.length;
  }

  // Le fichier de 15 min : la carte lit aussi ses descriptions pour les infobulles des calques.
  // (Si elles manquent — fichier antérieur — les libellés de la page suffisent.)

  // ─── Démarrage ─────────────────────────────────────────────────────────────
  lireCouleurs();
  construireBarre();
  majLegende();
  demarrer();
  // Pour les harnais : un regard en lecture seule sur l'état, et un cadrage (la même chose
  // qu'un geste de l'utilisateur : aucune donnée n'est touchée).
  window.__carte = {
    verifierChaleur,
    // La couleur de chaleur affichée au pixel CSS (x, y) de la zone, et celle d'une intensité.
    couleurChaleur: (x, y) => {
      for (const L of [LIVE, PUB]) { if (L.vide) continue; const d = L.x.getImageData(x, y, 1, 1).data; if (d[3]) return (d[0] | d[1] << 8 | d[2] << 16 | d[3] << 24) >>> 0; }
      return null;
    },
    couleurIntensite: (v, cote) => (LUT ? LUT[v] : (cote === 'ask' ? LUTA[v] : LUTB[v])),
    cadrer: (t1, t2, p1, p2) => { E.vue = { t1, t2, p1, p2 }; E.suivre = false; majBoutonSuivre(); dessiner(); },
    bulles: () => BULLES.map(z => ({ x: z.x, y: z.y, r: z.r, achat: z.b.achat, vente: z.b.vente, ta: z.b.ta, tb: z.b.tb, pa: z.b.pa, pb: z.b.pb })),
    lectures: () => (E.live ? { n: E.live.n, deb: Array.from(E.live.deb.subarray(0, E.live.n)), fin: Array.from(E.live.fin.subarray(0, E.live.n)),
      envoi: Array.from(E.live.envoi.subarray(0, E.live.n)), recu: Array.from(E.live.recu.subarray(0, E.live.n)), validite: E.live.validite } : null),
    etat: () => ({
      vue: E.vue && Object.assign({}, E.vue), suivre: E.suivre, erreurs: Object.assign({}, E.erreurs),
      publiee: E.pub ? { W: E.pub.W, H: E.pub.H, dt: E.pub.dt, dp: E.pub.dp, encodage: !!E.pub.encodage } : null,
      finCarte: E.pub ? BM.finGrille(E.pub) : null,
      loin: E.loin ? { n: E.loinN, dt: E.loin.dt, dp: E.loin.dp, peinte: !LOIN.vide, fin: BM.finGrille(E.loin) } : null,
      live: E.live ? { n: E.live.n, dt: E.live.cadence, dp: E.live.dp, ref: E.liveRef, ecartees: E.liveEcartees,
        deb0: E.live.n ? E.live.deb[0] : null, derniere: E.live.n ? E.live.deb[E.live.n - 1] : null,
        nonNuls: E.live.n ? E.live.v.subarray(E.live.oB[E.live.n - 1], E.live.lg).reduce((k, x) => k + (x > 0), 0) : 0 } : null,
      executions: { seaux: E.exec.seaux.size, premier: E.exec.premier, dernier: E.exec.dernier, total: E.exec.total.slice() },
      executionsPubliees: E.execPub ? { frontiere: E.execPub.frontiere, seaux: E.execPub.vus.size, depuis: E.execPub.depuis } : null,
      erreurs: Object.assign({}, E.erreurs),
      minutes: E.minutes.length, niveaux: E.niv ? { murs: E.niv.murs.length, gamma: E.niv.gamma.length, conversion: E.niv.conversion, gammaAxe: E.niv.gamma.map(g => [g.p, g.pAxe]) } : null,
      horloge: { ecart: E.horloge.ecart, u: E.horloge.u }, maintenant: maintenant(),
      bougies: { n: E.minutes.length, premiere: E.minutes.length ? E.minutes[0].t : null, derniere: E.minutes.length ? E.minutes[E.minutes.length - 1].t : null, trous: BM.trousMinutes(E.minutes) },
      execNonLues: execNonLues(), textes: Object.assign({}, TEXTES),
      recul: { binance: E.recul.binance.attente(Date.now()), github: E.recul.github.attente(Date.now()) },
      statut: ($('statut') || {}).textContent || '',
      pastilles: posees.map(p => p.texte), pastillesCompletes: posees.map(p => p.lignes.join(' | ')), reglages: JSON.parse(JSON.stringify(R)),
      mesure: Object.assign({}, MESURE), chaleurPeinteA: LIVE.coupe, carnetLu: carnetUtile(), souris: E.souris && Object.assign({}, E.souris),
      mise: Z && { w: Z.w, h: Z.h, dpr: Z.dpr, sx: Z.sx, sy: Z.sy, chaleur: Object.assign({}, Z.chaleur), masques: Z.masques.slice(), court: Z.court },
      posees: posees.map(p => ({ x: p.x, y: p.y, w: p.w, h: p.h, texte: p.texte, pastille: !!p.pastille })),
      memoire: { barres: MEM.barres.map(r => ({ y0: r.y0, y1: r.y1, pb: r.b.pb, part: r.b.part, obs: r.b.obs, pres: r.b.pres, peu: r.b.peu, cote: r.cote })), largeur: Z ? largeurMemoire() : 0, seuil: seuilMemoire(), fenetre: E.vue && fenetreMemoire() },
      destin: { niveaux: E.murs.niveaux.length, actifs: E.murs.actifs.size, attente: E.murs.attente.length, total: Object.assign({}, E.murs.totaux[E.murs.indice(R.mursSeuil)]), totaux: E.murs.totaux.map(x => Object.assign({}, x)), seuil: E.murs.seuils[E.murs.indice(R.mursSeuil)], dessines: DM.items.length, traits: DM.traits, marques: DM.marques.map(m => m.t), items: DM.items.slice(-200).map(it => ({ x0: it.x0, x1: it.x1, y: it.y, fin: it.n.fin })) },
      rafales: { n: E.raf.liste.length, version: E.raf.version, arriereFini: !!(E.execArriere && E.execArriere.fini), dessinees: RAF.items.map(it => ({ x: it.x, y0: it.y0, h: it.h, q: it.r.q8 / 1e8, T: it.r.T, achat: it.r.achat, ordres: it.r.ordres })) },
    }),
    /** Les rafales gardées (lecture seule) et la Σ des exécutions vues (contrôle de conservation). */
    rafalesListe: () => E.raf.liste.map(BM.lireRafale),
  };
})();
