/* ══════════════════════════════════════════════════════════════════════════════
   Saṃsāra — Carte (bookmap) : l'interface. Les calculs sont dans js/bookmap-calc.js.

   La page est AUTONOME : elle ne partage aucun code avec le terminal (index.html, js/app.js),
   qu'elle ne modifie pas. Elle lit deux fichiers publiés (heatmap.json, market-data.json)
   et interroge Binance elle-même — rien d'autre (contrat réseau : tests/test_contrat.py).

   ORDRE DES CALQUES — le prix est une ligne SUR la chaleur, pas l'inverse :
     chaleur (carte publiée, puis carnet live) → « non observé » hachuré → murs → gamma
     → bid/ask → ligne de prix → exécutions → âges → axes, carnet latéral, profil, volumes.

   CADENCES (et pourquoi) — poids Binance par minute, plafond 6 000 par adresse IP :
     carnet 1 000 niveaux / 2 s (poids 50) ≈ 1 500 ; exécutions / 1 s (poids 4) ≈ 240 ;
     bougies 1 min / 10 s (poids 2) ≈ 12. Les lectures s'arrêtent quand l'onglet est caché.
     Le temps réel (flux à 100 ms) n'est pas construit ici : il dépend d'une sonde réseau.
   ══════════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';
  const BM = window.BM;
  const RAW = 'https://raw.githubusercontent.com/lorenzoapro12-jpg/samsara-live/master/';
  const HEATMAP_URL = RAW + 'heatmap.json';
  const DATA_URL = RAW + 'market-data.json';
  const API = 'https://api.binance.com/api/v3/';
  const SYMBOLE = 'BTCUSDT';

  // ─── Réglages : changent le DÉTAIL, jamais une valeur affichée ──────────────
  const CLE = 'samsara-carte-v1';
  const DEFAUTS = {
    calques: { publiee: true, live: true, executions: true, prix: true, bidask: true, murs: true,
      gamma: true, profil: true, dom: true, volume: true, cvd: true },
    palette: 'classique',
    seuilBas: 2,          // intensité sous laquelle rien n'est peint
    saturation: 200,      // intensité à partir de laquelle la couleur est au maximum
    fusionT: 1,           // carte publiée : colonnes fusionnées (MAX)
    fusionP: 1,           // carte publiée : tranches fusionnées (MAX)
    niveauxLive: 1000,
    dpLive: 5,            // tranche du carnet live, en $
    bulleMin: 0.1,        // BTC
    bulleEchelle: 1,
  };
  const CADENCE_CARNET = { 100: 1000, 500: 1000, 1000: 2000, 5000: 10000 };
  const POIDS_CARNET = { 100: 5, 500: 25, 1000: 50, 5000: 250 };
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
    pub: null, pubF: null, pubCle: '', pubMaj: null, pubLu: null, pubTexte: null,
    md: null, niv: null, mdLu: null, mdTexte: null,
    live: null, liveRef: null, liveP99: 0, liveEcartees: 0, carnet: null, carnetA: null,
    exec: new BM.SeauxExecutions(1), execVus: new Set(), execArriere: null, execTrous: [], execLu: null,
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
    E.erreurs[src] = e ? (e.message || String(e)) : null;
    majStatut();
  }

  // L'horloge de Binance : un échantillon toutes les 5 min (poids 1), et au retour sur l'onglet.
  async function lireHorloge() {
    try {
      const { corps, s, r } = await binance('time', DELAIS.horloge);
      if (E.horloge.echantillon(s, r, +corps.serverTime)) { if (E.live) E.live.recaler(E.horloge.ecart); sale(); }
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
      const g = BM.grillePubliee(JSON.parse(txt));
      if (!g) throw new Error('format non reconnu par cette page');
      E.pub = g; E.pubTexte = maj; E.pubMaj = g.majA;
      E.pubF = null; E.pubCle = '';
      erreur('carte', null);
      appliquerEchelle();          // l'échelle live suit l'encodage, qu'il arrive ou qu'il disparaisse
      majLegende();
      sale();
    } catch (e) { erreur('carte', e); throw e; }
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
      dessiner();
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
      sale();
    } catch (e) { erreur('bougies', e); throw e; }
  }

  // Exécutions : les 1 000 dernières, puis un remplissage ARRIÈRE (pages de 1 000) jusqu'à la
  // fin de la carte publiée (ou 30 pages), puis la suite par identifiant (`fromId` reprend
  // exactement après le dernier identifiant vu). Une absence est RATTRAPÉE page par page
  // (5 par tour) ; au-delà de 30 min de retard, on saute au présent et l'intervalle sauté devient
  // un trou de lecture — hachuré, compté dans le profil, jamais lu comme « aucune exécution ».
  const PAGES_ARRIERE = 30, PAGES_PAR_TOUR = 5, RATTRAPAGE_MAX = 30 * 60e3, GARDE_EXECUTIONS = 6 * 3600e3;
  let execInit = null;
  function lireExecutionsInitiales() { return execInit || (execInit = lireExecutionsInitiales0().finally(() => { if (E.exec.dernierId === null) execInit = null; })); }
  async function lireExecutionsInitiales0() {
    try {
      const { corps: t, s } = await binance('aggTrades?symbol=' + SYMBOLE + '&limit=1000', DELAIS.executions);
      for (const x of t) { E.exec.ajouter(x); E.execVus.add(x.a); }
      E.execLu = s;
      erreur('executions', null);
      dessiner();
      if (t.length) { E.execArriere = { id: t[0].a, pages: 0, fini: false, enCours: false }; remplirArriere(); }
    } catch (e) { erreur('executions', e); throw e; }
  }
  /** Remplissage arrière ; interrompu (erreur, limite), il reprend au tour suivant. */
  async function remplirArriere() {
    const A = E.execArriere;
    if (!A || A.fini || A.enCours) return;
    A.enCours = true;
    const objectif = () => (E.pub ? BM.finGrille(E.pub) : maintenant() - 15 * 60e3) - 60e3;
    try {
      while (A.pages < PAGES_ARRIERE && A.id > 0 && E.exec.premier > objectif()) {
        const depuis = Math.max(0, A.id - 1000);
        const t = (await binance('aggTrades?symbol=' + SYMBOLE + '&fromId=' + depuis + '&limit=' + (A.id - depuis), DELAIS.executions)).corps;
        for (const x of t) E.exec.ajouterAncien(x, E.execVus);
        A.id = depuis; A.pages++;
        dessiner();
        await pause(150);
      }
      A.fini = true;
      E.execVus = new Set();        // l'unicité arrière n'a plus d'usage ; le direct suit dernierId
    } catch (e) { erreur('executions', e); }
    finally { A.enCours = false; dessiner(); }
  }
  async function lireExecutions() {
    if (E.exec.dernierId === null) return lireExecutionsInitiales();
    try {
      let n = 0;
      // Trop de retard pour rattraper (absence longue) : on saute au présent, et on le DIT.
      if (maintenant() - execLuJusqua() > RATTRAPAGE_MAX) {
        const der = (await binance('aggTrades?symbol=' + SYMBOLE + '&limit=1', DELAIS.executions)).corps;
        if (der.length && der[0].a - 1 > E.exec.dernierId) { E.execTrous.push([E.exec.dernier, der[0].T]); E.exec.dernierId = der[0].a - 1; }
      }
      for (let p = 0; p < PAGES_PAR_TOUR; p++) {
        const { corps: t, s } = await binance('aggTrades?symbol=' + SYMBOLE + '&fromId=' + (E.exec.dernierId + 1) + '&limit=1000', DELAIS.executions);
        for (const x of t) if (E.exec.ajouter(x)) n++;
        if (t.length < 1000) { E.execLu = s; break; }         // tout est lu jusqu'à l'envoi de cette requête
      }
      const lim = maintenant() - GARDE_EXECUTIONS;
      E.exec.purger(lim);
      E.execTrous = E.execTrous.filter(([, b]) => b > lim);
      erreur('executions', null);
      if (E.execArriere && !E.execArriere.fini) remplirArriere();
      if (n) dessiner();
    } catch (e) { erreur('executions', e); throw e; }
  }
  /** Jusqu'où les exécutions sont lues sans trou : la dernière requête qui a tout rendu, ou —
   *  pendant un rattrapage — la dernière exécution reçue. */
  function execLuJusqua() { return Math.max(E.execLu !== null ? axe(E.execLu) : -Infinity, E.exec.dernier || -Infinity); }
  /** Intervalles où les exécutions n'ont PAS été lues : trous sautés, et le retard en cours
   *  (rattrapage, lecture en échec) au-delà de la validité d'une lecture. */
  function execNonLues() {
    const out = E.execTrous.slice(), lu = execLuJusqua(), now = maintenant();
    if (lu > -Infinity && now - lu > BM.validiteLecture(1000)) out.push([lu, now]);
    return out;
  }

  // Carnet live : une lecture = une colonne, à son instant réel, avec ses quantités (BM.CarnetLive).
  function reinitLive() { E.live = null; E.liveRef = null; E.liveP99 = 0; E.bidask = []; E.liveEcartees = 0; }
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
    if (E.live.fixerEchelle(e.cle, e.f)) chaleurSale = true;
    E.liveRef = e.ref;
  }
  async function lireCarnet() {
    const n = R.niveauxLive, cadence = CADENCE_CARNET[n];
    try {
      const { corps: d, s, r } = await binance('depth?symbol=' + SYMBOLE + '&limit=' + n, DELAIS.carnet);
      const a = BM.agregerCarnet(d, R.dpLive);
      if (!E.live || E.live.dp !== a.dp || E.live.cadence !== cadence) { reinitLive(); E.live = new BM.CarnetLive(a.dp, cadence); E.live.recaler(E.horloge.ecart); }
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
      sale();
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
    boucle('bougies', lireMinutes, 10e3, E.recul.binance);
    boucle('executions', lireExecutions, 1000, E.recul.binance);
    boucleCarnet = boucle('carnet', lireCarnet, () => CADENCE_CARNET[R.niveauxLive], E.recul.binance);
    // Les âges vieillissent même sans donnée neuve ; le statut décompte les reprises.
    setInterval(() => { dessiner(); majStatut(); }, 1000);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) { for (const b of boucles) b.reveiller(); sale(); }
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
    sale();
  }
  function suivreMaintenant() {
    if (!E.suivre || !E.vue) return;
    const now = maintenant(), L = E.vue.t2 - E.vue.t1, t2 = now + L * 0.07;
    // La vue avance par pas d'un pixel au plus : la chaleur n'est repeinte que si elle a bougé.
    if (Math.abs(t2 - E.vue.t2) >= L / Math.max(1, Z ? Z.chaleur.w : 1000)) { E.vue.t2 = t2; E.vue.t1 = t2 - L; chaleurSale = true; }
    const p = dernierPrix();
    if (p) {
      const H = E.vue.p2 - E.vue.p1, bas = E.vue.p1 + H * 0.25, haut = E.vue.p2 - H * 0.25;
      if (p < bas || p > haut) { E.vue.p1 = p - H / 2; E.vue.p2 = p + H / 2; chaleurSale = true; }
    }
  }

  // ─── Rendu ─────────────────────────────────────────────────────────────────
  const cv = document.getElementById('carte');
  const ctx = cv.getContext('2d');
  const tamponChaleur = document.createElement('canvas');
  const ctxChaleur = tamponChaleur.getContext('2d');
  let chaleurSale = true, rafDemande = false, IMG = null, PX = null, HACH = null;
  const MESURE = { chaleur: 0, rendu: 0 };
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
  }

  function mettreEnPage() {
    const r = cv.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(320, Math.floor(r.width)), h = Math.max(260, Math.floor(r.height));
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
      cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    }
    const etroit = w < 640;
    const axeP = etroit ? 54 : 66, dom = R.calques.dom ? (etroit ? 64 : 112) : 0, axeT = 20;
    const vol = R.calques.volume ? (etroit ? 44 : 58) : 0, cvd = R.calques.cvd ? (etroit ? 44 : 58) : 0;
    const chH = h - axeT - vol - cvd;
    Z = {
      w, h, dpr, etroit,
      chaleur: { x: 0, y: 0, w: w - axeP - dom, h: chH },
      axeP: { x: w - axeP - dom, y: 0, w: axeP, h: chH },
      dom: { x: w - dom, y: 0, w: dom, h: chH },
      axeT: { x: 0, y: chH, w: w - axeP - dom, h: axeT },
      vol: { x: 0, y: chH + axeT, w: w - axeP - dom, h: vol },
      cvd: { x: 0, y: chH + axeT + vol, w: w - axeP - dom, h: cvd },
    };
    if (tamponChaleur.width !== Z.chaleur.w || tamponChaleur.height !== Z.chaleur.h) {
      tamponChaleur.width = Math.max(1, Z.chaleur.w); tamponChaleur.height = Math.max(1, Z.chaleur.h);
      chaleurSale = true;
    }
  }
  const X = t => (t - E.vue.t1) / (E.vue.t2 - E.vue.t1) * Z.chaleur.w;
  const Y = p => (E.vue.p2 - p) / (E.vue.p2 - E.vue.p1) * Z.chaleur.h;
  const T = x => E.vue.t1 + x / Z.chaleur.w * (E.vue.t2 - E.vue.t1);
  const Pr = y => E.vue.p2 - y / Z.chaleur.h * (E.vue.p2 - E.vue.p1);

  function sale() { chaleurSale = true; dessiner(); }
  function dessiner() {
    if (rafDemande) return;
    rafDemande = true;
    requestAnimationFrame(() => { rafDemande = false; rendre(); });
  }

  /** La chaleur : la carte publiée (fusionnée selon le réglage), puis le carnet live par-dessus.
   *  Le calcul au pixel (MAX des cellules recouvertes) est BM.peindreGrille, partagé avec la lecture
   *  au pointeur. Rien n'est peint après « maintenant ». */
  function peindreChaleur() {
    const w = Z.chaleur.w, h = Z.chaleur.h;
    if (w < 2 || h < 2) return;
    if (!IMG || IMG.width !== w || IMG.height !== h) {
      IMG = ctxChaleur.createImageData(w, h);
      PX = new Uint32Array(IMG.data.buffer);
      const fond = rgb(C.nonObs), hach = rgb(C.hachure);
      const cNon = u32(fond[0], fond[1], fond[2], 255), cHach = u32(hach[0], hach[1], hach[2], 255);
      HACH = new Uint32Array(w * h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) HACH[y * w + x] = ((x + y) % 6 < 1) ? cHach : cNon;
    }
    const img = IMG, px = PX;
    px.set(HACH);
    const o = { lut: LUT, lutB: LUTB, lutA: LUTA, maintenant: maintenant() };
    const pub = grillePublieeAffichee();
    if (pub) BM.peindreGrille(px, w, h, pub, E.vue, o);
    if (R.calques.live && E.live) BM.peindreGrille(px, w, h, E.live, E.vue, o);
    ctxChaleur.putImageData(img, 0, 0);
  }
  /** La carte publiée telle qu'affichée : fusionnée (MAX) selon le réglage, calculée une fois. */
  function grillePublieeAffichee() {
    if (!R.calques.publiee || !E.pub) return null;
    if (!E.pubF || E.pubCle !== R.fusionT + 'x' + R.fusionP) {
      E.pubF = BM.fusionMax(E.pub, R.fusionT, R.fusionP); E.pubCle = R.fusionT + 'x' + R.fusionP;
    }
    return E.pubF;
  }

  function rendre() {
    const debutRendu = performance.now();
    if (!E.vue) { if (dernierPrix()) vueParDefaut(); else return; }
    mettreEnPage();
    suivreMaintenant();
    if (!LUT && !LUTB) majLuts();
    if (chaleurSale) { const t0 = performance.now(); peindreChaleur(); chaleurSale = false; MESURE.chaleur = performance.now() - t0; }
    const d = Z.dpr;
    ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.fillStyle = C.panneau;
    ctx.fillRect(0, 0, Z.w, Z.h);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tamponChaleur, Z.chaleur.x, Z.chaleur.y);
    ctx.save();
    ctx.beginPath(); ctx.rect(Z.chaleur.x, Z.chaleur.y, Z.chaleur.w, Z.chaleur.h); ctx.clip();
    posees = []; fileP = [];
    grille();
    if (R.calques.profil) profilExecutions();
    if (R.calques.murs) murs();
    if (R.calques.gamma) gamma();
    if (R.calques.bidask) bidAsk();
    if (R.calques.prix) lignePrix();
    if (R.calques.executions) { bulles(); hachuresExecutions(); }
    reperesEtAges();
    dessinerPastilles();
    croix();
    ctx.restore();
    axePrix();
    axeTemps();
    if (R.calques.dom) carnetLateral();
    if (R.calques.volume) panneauVolume();
    if (R.calques.cvd) panneauCvd();
    lectureSouris();
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
  /** Une pastille d'âge, posée SUR la carte. Mise en file pendant le dessin des calques, puis
   *  dessinée en dernier — au-dessus du prix et des bulles — sans recouvrir les autres. */
  let posees = [], fileP = [];
  function pastille(lignes, x, y, coul, align, court) { fileP.push([Z.etroit && court ? [court] : lignes, x, y, coul, align]); }
  function dessinerPastilles() { for (const a of fileP) poserPastille(...a); fileP = []; }
  function poserPastille(lignes, x, y, coul, align) {
    ctx.font = '600 11px ' + POLICE;
    const w = Math.max(...lignes.map((l, i) => { ctx.font = (i ? '' : '600 ') + '11px ' + POLICE; return ctx.measureText(l).width; })) + 14;
    const h = 8 + lignes.length * 14;
    let x0 = align === 'right' ? x - w : (align === 'center' ? x - w / 2 : x);
    x0 = Math.max(4, Math.min(Z.chaleur.w - w - 4, x0));
    let y0 = Math.max(4, Math.min(Z.chaleur.h - h - 4, y));
    for (let n = 0; n < 12 && posees.some(r => x0 < r.x + r.w && x0 + w > r.x && y0 < r.y + r.h && y0 + h > r.y); n++) y0 += h + 4;
    posees.push({ x: x0, y: y0, w, h, texte: lignes[0], lignes });
    ctx.fillStyle = C.pastille;
    arrondi(x0, y0, w, h, 6); ctx.fill();
    ctx.fillStyle = coul; ctx.fillRect(x0, y0 + 4, 3, h - 8);
    lignes.forEach((l, i) => texte(l, x0 + 9, y0 + 11 + i * 14, i ? C.ink2 : C.ink1, 11, 'left', i === 0));
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
        const hz = E.horloge.texte();
        if (hz) l.push(hz);
        pastille(l, Math.max(8, xs + 8), 8, C.live, 'left', 'Live · ' + BM.age(now - axe(E.carnetA)) + (E.liveRef === 'publiee' ? '' : ' · échelle propre'));
      } else if (E.erreurs.carnet) {
        pastille(['Carnet live indisponible', E.erreurs.carnet], Z.chaleur.w - 8, 8, C.down, 'right', 'Live indisponible');
      }
    }
    // Trou entre la carte publiée et le carnet live : non observé, et dit.
    if (E.pub) {
      const fin = BM.finGrille(E.pub), deb = E.live && E.live.n ? E.live.deb[0] : now;
      const xa = Math.max(0, X(fin)), xb = Math.min(Z.chaleur.w, X(deb));
      if (xb - xa > 70) {
        texte('non observé', (xa + xb) / 2, Z.chaleur.h - 16, C.ink3, 11, 'center');
      }
    }
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
      if (xb - xa > 120) texte('exécutions non lues', (xa + xb) / 2, Z.chaleur.h - 30, C.ink2, 10.5, 'center');
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
      texte('Σ ' + BM.btc(m.q) + ' BTC', x0 + 4, (ya + yb) / 2, coul, 10, 'left', true);
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
      cv ? 'strikes en ' + n.uniteGamma + ', placés en USDT : ÷ ' + cv.taux.toLocaleString('fr-FR', { maximumFractionDigits: 6 }) + ' (USDT/USD' + (cv.a ? ', il y a ' + BM.age(maintenant() - cv.a) : '') + ')'
        : 'strikes en ' + n.uniteGamma + ', NON convertis en USDT (cours USDT/USD non publié)'],
      x0 + 6, 60, C.gamma, 'left', 'Gamma · ' + BM.age(maintenant() - n.gammaA) + (cv ? '' : ' · non converti'));
  }
  function bidAsk() {
    if (E.bidask.length < 2) return;
    for (const [k, coul] of [['bid', C.up], ['ask', C.down]]) {
      ctx.strokeStyle = coul; ctx.lineWidth = 1.2; ctx.globalAlpha = 0.95;
      ctx.beginPath();
      let prevT = null, prevY = 0;
      const valide = BM.validiteLecture(CADENCE_CARNET[R.niveauxLive]);
      for (const b of E.bidask) {
        const t = axe(b.t);
        if (t < E.vue.t1 - 60e3 || t > E.vue.t2) continue;
        const x = X(t), y = Y(b[k]);
        // Marches : le prix tient jusqu'à la lecture suivante. Une lecture manquée (onglet
        // caché, panne) coupe la ligne au lieu de relier deux instants éloignés.
        if (prevT === null || b.t - prevT > valide) ctx.moveTo(x, y);
        else { ctx.lineTo(x, prevY); ctx.lineTo(x, y); }
        prevT = b.t; prevY = y;
      }
      ctx.stroke(); ctx.globalAlpha = 1;
    }
  }
  const SECONDE_DES_PPM = 6;     // px par minute à partir desquels la ligne suit les exécutions à la seconde
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
    ctx.strokeStyle = C.prix; ctx.lineWidth = 1.6;
    ctx.shadowColor = 'rgba(0,0,0,0.85)'; ctx.shadowBlur = 3;
    ctx.beginPath();
    // Les points viennent de BM.lignePrix : clôtures 1 min, puis VWAP à la seconde — partout où les
    // exécutions sont lues dès qu'une minute fait au moins 6 px —, coupée sur ce qui n'est pas lu.
    const segs = BM.lignePrix(ms, E.exec, { t1: E.vue.t1, t2: E.vue.t2, parSeconde: ppm >= SECONDE_DES_PPM,
      minutesA: E.minutesA ? axe(E.minutesA) : null, nonLues: execNonLues(), maintenant: maintenant() });
    for (const seg of segs) seg.forEach(([t, p], i) => { if (i) ctx.lineTo(X(t), Y(p)); else ctx.moveTo(X(t), Y(p)); });
    ctx.stroke();
    ctx.restore();
  }
  /** Seaux des bulles : pas de temps dans une échelle fixe et pas de prix multiple de la tranche
   *  des exécutions, ancrés sur l'horloge et le prix (BM.SeauxExecutions.regrouper). Les bulles
   *  dessinées sont gardées : la lecture au pointeur décrit celle qu'on survole. */
  function pasBulles() {
    return { pasT: BM.pasTemps((E.vue.t2 - E.vue.t1) / Z.chaleur.w * 9), pasP: BM.pasMultiple((E.vue.p2 - E.vue.p1) / Z.chaleur.h * 9, E.exec.dp) };
  }
  let BULLES = [];
  function bulles() {
    BULLES = [];
    if (!E.exec.seaux.size) return;
    const { pasT, pasP } = pasBulles();
    const g = E.exec.regrouper(E.vue.t1, E.vue.t2, pasT, pasP)
      .filter(b => b.achat + b.vente >= R.bulleMin)
      .sort((a, b) => (a.achat + a.vente) - (b.achat + b.vente));
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
    TEXTES.profil = 'Profil des exécutions visibles' + (manque > 0 ? ' · incomplet : ' + BM.age(manque) + ' non lues' : '');
    texte(TEXTES.profil, 6, 14, C.ink2, 10, 'left', true);
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
        if (y > 6 && y < a.h - 6) {
          ctx.fillStyle = C.gamma; ctx.fillRect(a.x, y - 7, a.w, 14);
          texte(g.court + ' ' + BM.prix(g.p), a.x + 4, y, '#0b0b12', 10, 'left', true); reserve.push(y);
        } else if (y <= 6 && haut < 3) {
          const yy = 9 + 13 * haut++; texte('↑' + g.court + ' ' + kilo(g.p), a.x + 3, yy, C.gamma, 9.5, 'left', true); reserve.push(yy);
        } else if (y >= a.h - 6 && bas < 3) {
          const yy = a.h - 9 - 13 * bas++; texte('↓' + g.court + ' ' + kilo(g.p), a.x + 3, yy, C.gamma, 9.5, 'left', true); reserve.push(yy);
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
      texte(BM.prix(p, 1), a.x + 5, yPrix, '#0b0b12', 11, 'left', true);
    }
  }
  const kilo = p => (p / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' k';
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
  }
  function carnetLateral() {
    const a = Z.dom;
    ctx.fillStyle = C.panneau; ctx.fillRect(a.x, a.y, a.w, a.h);
    texte('Carnet live', a.x + 6, 10, C.ink2, 10, 'left', true);
    const k = E.carnet;
    if (!k) { texte(E.erreurs.carnet ? 'indisponible' : '…', a.x + 6, 26, C.ink3, 10); return; }
    // Un pas MULTIPLE de la tranche du carnet live : chaque barre réunit le même nombre de
    // tranches entières (sinon 2 puis 3 tranches par barre : un peigne, et des Σ faux).
    const pas = BM.pasMultiple((E.vue.p2 - E.vue.p1) / a.h * 4, k.dp), mult = Math.round(pas / k.dp);
    texte('Σ BTC par ' + BM.prix(pas, BM.decimales(pas)) + ' $', a.x + 6, 24, C.ink3, 9.5);
    const agg = (m) => { const o = new Map(); for (const [pb, q] of m) { const P = Math.floor(pb / mult); o.set(P, (o.get(P) || 0) + q); } return o; };
    const sb = agg(k.sb), sa = agg(k.sa);
    let max = 0;
    for (const m of [sb, sa]) for (const [P, q] of m) { const y = Y(P * pas); if (y >= 0 && y <= a.h) max = Math.max(max, q); }
    if (!max) return;
    const L = a.w - 34;
    for (const [m, coul] of [[sb, C.up], [sa, C.down]]) for (const [P, q] of m) {
      const ya = Y((P + 1) * pas), yb = Y(P * pas);
      if (yb < 34 || ya > a.h) continue;
      const l = L * q / max;
      ctx.globalAlpha = 0.75; ctx.fillStyle = coul; ctx.fillRect(a.x + 2, ya, l, Math.max(1, yb - ya - 0.5)); ctx.globalAlpha = 1;
      if (yb - ya >= 11 && q >= max * 0.35) texte(BM.btc(q), a.x + 4 + l, (ya + yb) / 2, C.ink1, 9.5);
    }
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
    TEXTES.volume = 'Volume (USDT) par ' + BM.texteMinutes(g) + ' · achats ▲ / ventes ▼ au marché';
    texte(TEXTES.volume, a.x + 6, a.y + 9, C.ink3, 9.5);
    const ms = minutesVisibles();
    if (!ms.length) return;
    const groupes = new Map();
    for (const m of ms) {
      const K = Math.floor(m.t / pas), b = groupes.get(K) || { t: K * pas, achat: 0, vente: 0 };
      b.achat += m.achat; b.vente += m.vente; groupes.set(K, b);
    }
    const barres = [...groupes.values()];
    // Échelle au 95ᵉ centile : une minute exceptionnelle ne doit pas écraser toutes les
    // autres. Une barre plus haute est écrêtée ET marquée d'un trait blanc.
    const max = (BM.centile(barres.map(b => Math.max(b.achat, b.vente)), 0.95) * 1.15) || 1;
    const mid = a.y + a.h / 2 + 4, hh = a.h / 2 - 7, lw = Math.max(1, ppm * g - 1);
    for (const b of barres) {
      const x = X(b.t), ha = hh * Math.min(1, b.achat / max), hv = hh * Math.min(1, b.vente / max);
      ctx.fillStyle = C.up; ctx.fillRect(x, mid - ha, lw, ha);
      ctx.fillStyle = C.down; ctx.fillRect(x, mid, lw, hv);
      ctx.fillStyle = C.prix;
      if (b.achat > max) ctx.fillRect(x, mid - hh - 1, lw, 1.5);
      if (b.vente > max) ctx.fillRect(x, mid + hh - 0.5, lw, 1.5);
    }
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
    ctx.strokeStyle = C.grille; ctx.beginPath(); ctx.moveTo(0, y(0)); ctx.lineTo(a.w, y(0)); ctx.stroke();
    ctx.strokeStyle = C.accent; ctx.lineWidth = 1.4; ctx.beginPath();
    let der = 0;
    for (let i = i0; i <= i1; i++) {
      const x = X(Math.min(ms[i].fin, maintenant()));
      if (i === i0 || coupe.has(i)) ctx.moveTo(X(ms[i].t), y(0));
      ctx.lineTo(x, y(cvd[i])); der = cvd[i];
    }
    ctx.stroke();
    hachuresBougies(a);
    const vues = reprises.filter(i => i <= i1), depuis = vues.length ? ms[vues[vues.length - 1]].t : null;
    const manque = BM.dureeDans(BM.trousMinutes(ms), E.vue.t1, E.vue.t2);
    TEXTES.cvd = 'CVD spot (USDT) cumulé depuis ' + (depuis ? BM.heure(depuis) + ' (repart de 0 après ' + BM.age(manque) + ' de bougies non lues, hachurées)' : 'le bord gauche')
      + ' · ' + (der >= 0 ? '+' : '−') + BM.prix(Math.abs(der) / 1e6, 1) + ' M';
    texte(TEXTES.cvd, a.x + 6, a.y + 9, C.ink3, 9.5);
  }

  // ─── Lecture au pointeur : la VALEUR, quel que soit le réglage ──────────────
  const bulleInfo = document.getElementById('lecture');
  function lectureSouris() {
    const s = E.souris;
    if (!s || s.zone !== 'chaleur') { bulleInfo.hidden = true; return; }
    const t = T(s.x), p = Pr(s.y), l = [];
    l.push('<b>' + BM.prix(p, 1) + ' $</b> · ' + BM.heure(t, true));
    // Le PIXEL sous le pointeur, tel que la peinture le calcule : mêmes colonnes, mêmes tranches,
    // même MAX (BM.lirePixel). La valeur lue est celle de la couleur vue, à tout niveau de zoom.
    const tpp = (E.vue.t2 - E.vue.t1) / Z.chaleur.w, pp = (E.vue.p2 - E.vue.p1) / Z.chaleur.h;
    const ix = Math.floor(s.x), iy = Math.floor(s.y);
    const ta = E.vue.t1 + ix * tpp, tb = Math.min(ta + tpp, maintenant());
    const cel = (g, nom, enc) => {
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
        + (dec ? (dec.sature ? ' → plus gros niveau ≥ ' + BM.btc(dec.min) + ' BTC (saturé)' : ' → plus gros niveau ' + BM.btc(dec.min) + '–' + BM.btc(dec.max) + ' BTC') : ' (sans unité)'));
      // Le carnet live garde ses quantités : la valeur MESURÉE, pas seulement son intervalle.
      const q = g.creux ? g.quantite(r.c, r.pb, r.cote === 'bid' ? 'b' : 'a') : null;
      l.push('&nbsp;&nbsp;' + (q ? 'mesuré : ' + BM.btc(q) + ' BTC · ' : '') + quand + pixel);
    };
    const pub = grillePublieeAffichee();
    if (pub) cel(pub, 'Carte', pub.encodage);
    if (R.calques.live) cel(E.live, 'Live', E.liveRef === 'publiee' ? E.pub && E.pub.encodage : null);
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
    bulleInfo.innerHTML = l.join('<br>');
    bulleInfo.hidden = false;
    const r = cv.getBoundingClientRect();
    const bw = bulleInfo.offsetWidth, bh = bulleInfo.offsetHeight;
    let x = r.left + s.x + 16, y = r.top + s.y + 16;
    if (x + bw > window.innerWidth - 8) x = r.left + s.x - bw - 16;
    if (y + bh > window.innerHeight - 8) y = r.top + s.y - bh - 16;
    bulleInfo.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px)';
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
  const pointeurs = new Map();
  let geste = null;
  cv.addEventListener('pointerdown', e => {
    cv.setPointerCapture(e.pointerId);
    const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    pointeurs.set(e.pointerId, { x, y });
    if (pointeurs.size === 2) {
      const [a, b] = [...pointeurs.values()];
      geste = { pince: true, dx: Math.abs(a.x - b.x) || 1, dy: Math.abs(a.y - b.y) || 1, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, vue: Object.assign({}, E.vue) };
    } else geste = { x, y, zone: zoneDe(x, y), vue: Object.assign({}, E.vue) };
  });
  cv.addEventListener('pointermove', e => {
    const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    if (pointeurs.has(e.pointerId)) pointeurs.set(e.pointerId, { x, y });
    if (geste && E.vue) {
      const v0 = geste.vue;
      if (geste.pince && pointeurs.size === 2) {
        const [a, b] = [...pointeurs.values()];
        const fx = geste.dx / (Math.abs(a.x - b.x) || 1), fy = geste.dy / (Math.abs(a.y - b.y) || 1);
        Object.assign(E.vue, v0);
        if (geste.dx > 30) zoomTemps(fx, geste.cx);
        if (geste.dy > 30) zoomPrix(fy, geste.cy);
        lacher(); sale(); return;
      }
      if (!geste.pince) {
        const dx = x - geste.x, dy = y - geste.y;
        if (geste.zone === 'axeP') {
          Object.assign(E.vue, v0); zoomPrix(Math.exp(dy / 160), Z.chaleur.h / 2);
        } else if (geste.zone === 'axeT') {
          Object.assign(E.vue, v0); zoomTemps(Math.exp(-dx / 200), Z.chaleur.w / 2);
        } else {
          const dt = dx / Z.chaleur.w * (v0.t2 - v0.t1), dp = dy / Z.chaleur.h * (v0.p2 - v0.p1);
          E.vue.t1 = v0.t1 - dt; E.vue.t2 = v0.t2 - dt; E.vue.p1 = v0.p1 + dp; E.vue.p2 = v0.p2 + dp;
        }
        if (Math.abs(dx) + Math.abs(dy) > 3) lacher();
        sale(); return;
      }
    }
    E.souris = { x, y, zone: zoneDe(x, y) };
    dessiner();
  });
  const fin = e => { pointeurs.delete(e.pointerId); if (pointeurs.size < 2 && geste && geste.pince) geste = null; if (!pointeurs.size) geste = null; };
  cv.addEventListener('pointerup', fin);
  cv.addEventListener('pointercancel', fin);
  cv.addEventListener('pointerleave', () => { E.souris = null; dessiner(); });
  cv.addEventListener('wheel', e => {
    if (!E.vue) return;
    e.preventDefault();
    const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, zone = zoneDe(x, y);
    const f = Math.exp((e.deltaY || e.deltaX) * (e.deltaMode === 1 ? 0.05 : 0.0015));
    if (zone === 'axeP' || e.shiftKey) zoomPrix(f, Math.min(y, Z.chaleur.h));
    else if (e.ctrlKey) { zoomTemps(f, x); zoomPrix(f, y); }
    else zoomTemps(f, Math.min(x, Z.chaleur.w));
    lacher(); sale();
  }, { passive: false });
  cv.addEventListener('dblclick', () => vueParDefaut());
  window.addEventListener('keydown', e => {
    if (e.target && /input|select|textarea/i.test(e.target.tagName)) return;
    if (!E.vue) return;
    const k = e.key.toLowerCase();
    if (k === 'f') basculerSuivre();
    else if (k === 'r') vueParDefaut();
    else if (k === '+' || k === '=') { zoomTemps(0.8, Z.chaleur.w * 0.9); lacher(); sale(); }
    else if (k === '-') { zoomTemps(1.25, Z.chaleur.w * 0.9); lacher(); sale(); }
    else if (k === 'arrowup' || k === 'arrowdown') { const d = (E.vue.p2 - E.vue.p1) * 0.1 * (k === 'arrowup' ? 1 : -1); E.vue.p1 += d; E.vue.p2 += d; lacher(); sale(); }
    else if (k === 'arrowleft' || k === 'arrowright') { const d = (E.vue.t2 - E.vue.t1) * 0.1 * (k === 'arrowright' ? 1 : -1); E.vue.t1 += d; E.vue.t2 += d; lacher(); sale(); }
    else if (k === 'l') basculerPanneau('legende');
    else if (k === 'escape') { fermerPanneaux(); }
  });
  window.addEventListener('resize', () => sale());

  // ─── Barre, réglages, légende ──────────────────────────────────────────────
  const $ = id => document.getElementById(id);
  function basculerSuivre() { E.suivre = !E.suivre; if (E.suivre) suivreMaintenant(); majBoutonSuivre(); sale(); }
  function majBoutonSuivre() { const b = $('btnSuivre'); if (b) b.setAttribute('aria-pressed', E.suivre ? 'true' : 'false'); }
  function fermerPanneaux() { for (const p of document.querySelectorAll('.panneau-flottant')) p.hidden = true; for (const b of document.querySelectorAll('[aria-controls]')) b.setAttribute('aria-expanded', 'false'); }
  function basculerPanneau(id) {
    const p = $(id), ouvert = p.hidden;
    fermerPanneaux();
    p.hidden = !ouvert;
    const b = document.querySelector('[aria-controls="' + id + '"]');
    if (b) b.setAttribute('aria-expanded', ouvert ? 'true' : 'false');
  }
  const NOMS_CALQUES = [['publiee', 'Carte publiée'], ['live', 'Carnet live'], ['executions', 'Exécutions'], ['prix', 'Prix'],
    ['bidask', 'Bid / ask'], ['murs', 'Murs'], ['gamma', 'Gamma'], ['profil', 'Profil'], ['dom', 'Carnet latéral'],
    ['volume', 'Volume'], ['cvd', 'CVD']];
  function construireBarre() {
    const z = $('calques');
    for (const [k, nom] of NOMS_CALQUES) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'puce'; b.textContent = nom; b.dataset.calque = k;
      b.setAttribute('aria-pressed', R.calques[k] ? 'true' : 'false');
      b.addEventListener('click', () => {
        R.calques[k] = !R.calques[k]; b.setAttribute('aria-pressed', R.calques[k] ? 'true' : 'false');
        sauver(); sale();
      });
      z.appendChild(b);
    }
    $('btnSuivre').addEventListener('click', basculerSuivre);
    $('btnReglages').addEventListener('click', () => basculerPanneau('reglages'));
    $('btnLegende').addEventListener('click', () => basculerPanneau('legende'));
    for (const b of document.querySelectorAll('[data-fermer]')) b.addEventListener('click', fermerPanneaux);
    majBoutonSuivre();
    // Réglages
    const lier = (id, cle, conv, apres) => {
      const el = $(id);
      el.value = String(R[cle]);
      el.addEventListener('input', () => { R[cle] = conv(el.value); sauver(); if (apres) apres(); majLegende(); sale(); });
    };
    lier('rPalette', 'palette', String, majLuts);
    lier('rSeuil', 'seuilBas', Number, majLuts);
    lier('rSaturation', 'saturation', Number, majLuts);
    lier('rFusionT', 'fusionT', Number);
    lier('rFusionP', 'fusionP', Number);
    lier('rNiveaux', 'niveauxLive', Number, () => { reinitLive(); });
    lier('rDpLive', 'dpLive', Number, () => { reinitLive(); });
    lier('rBulleMin', 'bulleMin', Number);
    lier('rBulleEchelle', 'bulleEchelle', Number);
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
    const barre = $('barreCouleurs');
    if (barre) {
      const c = document.createElement('canvas'); c.width = 256; c.height = 1;
      const x = c.getContext('2d'), im = x.createImageData(256, 1), v32 = new Uint32Array(im.data.buffer);
      for (let i = 0; i < 256; i++) v32[i] = LUT ? LUT[i] : LUTA[i];
      x.putImageData(im, 0, 0);
      barre.style.backgroundImage = 'url(' + c.toDataURL() + ')';
    }
    const fmt = v => { const d = BM.decoder(v, enc); return d ? (d.sature ? '≥ ' + BM.btc(d.min) : BM.btc(d.min)) + ' BTC' : 'intensité ' + v; };
    const g = $('gradBarre');
    if (g) g.innerHTML = [0, 64, 128, 192, 255].map(v => '<span>' + (v ? fmt(v) : '0') + '</span>').join('');
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
    cadrer: (t1, t2, p1, p2) => { E.vue = { t1, t2, p1, p2 }; E.suivre = false; majBoutonSuivre(); sale(); },
    bulles: () => BULLES.map(z => ({ x: z.x, y: z.y, r: z.r, achat: z.b.achat, vente: z.b.vente, ta: z.b.ta, tb: z.b.tb, pa: z.b.pa, pb: z.b.pb })),
    lectures: () => (E.live ? { n: E.live.n, deb: Array.from(E.live.deb.subarray(0, E.live.n)), fin: Array.from(E.live.fin.subarray(0, E.live.n)),
      envoi: Array.from(E.live.envoi.subarray(0, E.live.n)), recu: Array.from(E.live.recu.subarray(0, E.live.n)), validite: E.live.validite } : null),
    etat: () => ({
      vue: E.vue && Object.assign({}, E.vue), suivre: E.suivre, erreurs: Object.assign({}, E.erreurs),
      publiee: E.pub ? { W: E.pub.W, H: E.pub.H, dt: E.pub.dt, dp: E.pub.dp, encodage: !!E.pub.encodage } : null,
      live: E.live ? { n: E.live.n, dt: E.live.cadence, dp: E.live.dp, ref: E.liveRef, ecartees: E.liveEcartees,
        deb0: E.live.n ? E.live.deb[0] : null, derniere: E.live.n ? E.live.deb[E.live.n - 1] : null,
        nonNuls: E.live.n ? E.live.v.subarray(E.live.oB[E.live.n - 1], E.live.lg).reduce((k, x) => k + (x > 0), 0) : 0 } : null,
      executions: { seaux: E.exec.seaux.size, premier: E.exec.premier, dernier: E.exec.dernier, total: E.exec.total.slice() },
      minutes: E.minutes.length, niveaux: E.niv ? { murs: E.niv.murs.length, gamma: E.niv.gamma.length, conversion: E.niv.conversion, gammaAxe: E.niv.gamma.map(g => [g.p, g.pAxe]) } : null,
      horloge: { ecart: E.horloge.ecart, u: E.horloge.u }, maintenant: maintenant(),
      bougies: { n: E.minutes.length, premiere: E.minutes.length ? E.minutes[0].t : null, derniere: E.minutes.length ? E.minutes[E.minutes.length - 1].t : null, trous: BM.trousMinutes(E.minutes) },
      execNonLues: execNonLues(), textes: Object.assign({}, TEXTES),
      recul: { binance: E.recul.binance.attente(Date.now()), github: E.recul.github.attente(Date.now()) },
      statut: ($('statut') || {}).textContent || '',
      pastilles: posees.map(p => p.texte), pastillesCompletes: posees.map(p => p.lignes.join(' | ')), reglages: JSON.parse(JSON.stringify(R)),
      mesure: Object.assign({}, MESURE),
    }),
  };
})();
