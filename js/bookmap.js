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

  function charger() {
    let r = {};
    try { r = JSON.parse(localStorage.getItem(CLE) || '{}') || {}; } catch (e) { r = {}; }
    const o = Object.assign({}, DEFAUTS, r);
    o.calques = Object.assign({}, DEFAUTS.calques, r.calques || {});
    if (!CADENCE_CARNET[o.niveauxLive]) o.niveauxLive = DEFAUTS.niveauxLive;
    return o;
  }
  function sauver() { try { localStorage.setItem(CLE, JSON.stringify(R)); } catch (e) { /* navigation privée */ } }

  // ─── État ──────────────────────────────────────────────────────────────────
  const E = {
    pub: null, pubF: null, pubCle: '', pubMaj: null, pubLu: null,
    md: null, niv: null, mdLu: null,
    live: null, liveRef: null, liveP99: 0, liveDebut: null, carnet: null, carnetA: null,
    exec: new BM.SeauxExecutions(1), execVus: new Set(), execRemplissage: null, execTrous: [],
    minutes: [], minutesA: null,
    bidask: [],
    erreurs: {},
    vue: null, suivre: true,
    souris: null,
    session: Date.now(),
  };

  // ─── Réseau ────────────────────────────────────────────────────────────────
  async function json(url, opts) {
    const r = await fetch(url, opts || {});
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }
  function erreur(src, e) {
    E.erreurs[src] = e ? (e.message || String(e)) : null;
    majStatut();
  }

  async function lireHeatmap() {
    try {
      const h = await json(HEATMAP_URL, { cache: 'no-cache' });
      E.pubLu = Date.now();
      if (E.pub && h.updated && Date.parse(h.updated) === E.pubMaj) { erreur('carte', null); return; }
      E.pub = BM.grillePubliee(h);
      E.pubMaj = Date.parse(h.updated) || null;
      E.pubF = null; E.pubCle = '';
      erreur('carte', null);
      if (E.live && E.pub && E.pub.encodage && !E.liveRef) reinitLive();   // l'échelle commune devient possible
      majLegende();
      sale();
    } catch (e) { erreur('carte', e); }
  }
  async function lireMarketData() {
    try {
      const md = await json(DATA_URL + '?t=' + Date.now(), { cache: 'no-store' });
      E.md = md; E.niv = BM.niveauxPublies(md); E.mdLu = Date.now();
      erreur('fichier', null);
      dessiner();
    } catch (e) { erreur('fichier', e); }
  }

  // Bougies 1 min : 24 h au démarrage (deux requêtes), puis les 3 dernières toutes les 10 s.
  async function lireMinutesInitiales() {
    try {
      const a = await json(API + 'klines?symbol=' + SYMBOLE + '&interval=1m&limit=1000');
      let b = [];
      if (a.length) b = await json(API + 'klines?symbol=' + SYMBOLE + '&interval=1m&limit=440&endTime=' + (a[0][0] - 1));
      E.minutes = BM.minutes(b.concat(a));
      E.minutesA = Date.now();
      erreur('bougies', null);
      if (!E.vue) vueParDefaut();
      sale();
    } catch (e) { erreur('bougies', e); }
  }
  async function lireMinutes() {
    try {
      const k = await json(API + 'klines?symbol=' + SYMBOLE + '&interval=1m&limit=3');
      E.minutes = BM.fusionnerMinutes(E.minutes, BM.minutes(k));
      const lim = Date.now() - 26 * 3600e3;
      if (E.minutes.length && E.minutes[0].t < lim) E.minutes = E.minutes.filter(m => m.t >= lim);
      E.minutesA = Date.now();
      erreur('bougies', null);
      dessiner();
    } catch (e) { erreur('bougies', e); }
  }

  // Exécutions : les 1 000 dernières, puis un remplissage ARRIÈRE (pages de 1 000) jusqu'à la
  // fin de la carte publiée (ou 30 pages), puis la suite par identifiant — sans trou possible :
  // `fromId` reprend exactement après le dernier identifiant vu.
  const PAGES_ARRIERE = 30;
  let execInit = null;
  function lireExecutionsInitiales() { return execInit || (execInit = lireExecutionsInitiales0().finally(() => { if (E.exec.dernierId === null) execInit = null; })); }
  async function lireExecutionsInitiales0() {
    try {
      const t = await json(API + 'aggTrades?symbol=' + SYMBOLE + '&limit=1000');
      for (const x of t) { E.exec.ajouter(x); E.execVus.add(x.a); }
      erreur('executions', null);
      dessiner();
      remplirArriere(t.length ? t[0].a : null);
    } catch (e) { erreur('executions', e); }
  }
  async function remplirArriere(premierId) {
    if (premierId === null) return;
    E.execRemplissage = { pages: 0, enCours: true };
    let id = premierId;
    const objectif = () => (E.pub ? E.pub.t0 + E.pub.W * E.pub.dt : Date.now() - 15 * 60e3) - 60e3;
    while (E.execRemplissage.pages < PAGES_ARRIERE && id > 0 && E.exec.premier > objectif()) {
      const depuis = Math.max(0, id - 1000);
      try {
        const t = await json(API + 'aggTrades?symbol=' + SYMBOLE + '&fromId=' + depuis + '&limit=' + (id - depuis));
        for (const x of t) E.exec.ajouterAncien(x, E.execVus);
        id = depuis;
        E.execRemplissage.pages++;
        dessiner();
      } catch (e) { erreur('executions', e); break; }
      await pause(150);
    }
    E.execRemplissage.enCours = false;
    E.execVus = new Set();          // l'unicité arrière n'a plus d'usage ; le direct suit dernierId
    dessiner();
  }
  let rattrapage = 0;
  async function lireExecutions() {
    if (E.exec.dernierId === null) return lireExecutionsInitiales();
    try {
      let n = 0;
      for (let tour = 0; tour < 5; tour++) {
        const t = await json(API + 'aggTrades?symbol=' + SYMBOLE + '&fromId=' + (E.exec.dernierId + 1) + '&limit=1000');
        for (const x of t) if (E.exec.ajouter(x)) n++;
        if (t.length < 1000) break;
        if (tour === 4) {           // trop de retard (onglet longtemps caché) : on saute, et on le DIT
          const avant = E.exec.dernier;
          const der = await json(API + 'aggTrades?symbol=' + SYMBOLE + '&limit=1');
          if (der.length) { E.execTrous.push([avant, der[0].T]); E.exec.dernierId = der[0].a - 1; rattrapage++; }
        }
      }
      E.exec.purger(Date.now() - 6 * 3600e3);
      erreur('executions', null);
      if (n) dessiner();
    } catch (e) { erreur('executions', e); }
  }

  // Carnet live : une lecture = une colonne de la grille live.
  function reinitLive() { E.live = null; E.liveRef = null; E.liveP99 = 0; E.bidask = []; E.liveDebut = null; }
  async function lireCarnet() {
    const n = R.niveauxLive;
    try {
      const d = await json(API + 'depth?symbol=' + SYMBOLE + '&limit=' + n);
      const t = Date.now();
      const a = BM.agregerCarnet(d, R.dpLive);
      E.carnet = a; E.carnetA = t;
      if (a.meilleurBid && a.meilleurAsk) E.bidask.push({ t, bid: a.meilleurBid, ask: a.meilleurAsk });
      if (E.bidask.length > 20000) E.bidask.splice(0, 5000);
      poserColonneLive(a, t);
      erreur('carnet', null);
      sale();
    } catch (e) { erreur('carnet', e); }
  }
  const LIVE_CAPACITE = 1800, LIVE_BANDE = 0.015;   // colonnes ; ± bande de prix couverte par la grille
  function poserColonneLive(a, t) {
    const enc = E.pub && E.pub.encodage;
    const dt = CADENCE_CARNET[R.niveauxLive];
    const mid = (a.meilleurBid + a.meilleurAsk) / 2;
    if (!E.live || E.live.dp !== a.dp || E.live.dt !== dt) {
      const dp = a.dp, H = Math.ceil(2 * LIVE_BANDE * mid / dp);
      E.live = BM.grilleVide(t, dt, LIVE_CAPACITE, dp, Math.floor(mid * (1 - LIVE_BANDE) / dp), H);
      E.live.n = 0;
      E.liveDebut = t;
      E.liveRef = enc ? 'publiee' : 'propre';
      if (!enc) {
        const qs = [...a.bids.values(), ...a.asks.values()];
        E.liveP99 = BM.centile(qs, 0.99) || 1;
      }
    }
    let g = E.live;
    // Le prix sort de la bande de la grille : on la recentre en recopiant ce qui recouvre.
    const pbMid = Math.floor(mid / g.dp);
    if (pbMid < g.pbMin + g.H * 0.15 || pbMid > g.pbMin + g.H * 0.85) g = E.live = recentrer(g, pbMid);
    let c = Math.round((t - g.t0) / g.dt);
    if (c < 0) return;
    if (c >= g.W) {                  // grille pleine : on oublie la moitié la plus ancienne
      const k = Math.ceil(g.W / 2);
      g.bids.copyWithin(0, k * g.H); g.asks.copyWithin(0, k * g.H);
      g.bids.fill(0, (g.W - k) * g.H); g.asks.fill(0, (g.W - k) * g.H);
      g.bas.copyWithin(0, k); g.haut.copyWithin(0, k); g.bas.fill(-1, g.W - k); g.haut.fill(-1, g.W - k);
      g.t0 += k * g.dt; c -= k;
    }
    const o = c * g.H;
    g.bids.fill(0, o, o + g.H); g.asks.fill(0, o, o + g.H);
    const val = q => (E.liveRef === 'publiee' && enc) ? BM.intensite(q, enc) : BM.intensiteRelative(q, E.liveP99);
    for (const [pb, q] of a.bids) { const h = pb - g.pbMin; if (h >= 0 && h < g.H) g.bids[o + h] = val(q); }
    for (const [pb, q] of a.asks) { const h = pb - g.pbMin; if (h >= 0 && h < g.H) g.asks[o + h] = val(q); }
    const bas = a.bas !== null ? a.bas : Math.floor(mid / g.dp), haut = a.haut !== null ? a.haut : Math.floor(mid / g.dp);
    g.bas[c] = Math.max(bas, g.pbMin); g.haut[c] = Math.min(haut, g.pbMin + g.H - 1);
    g.n = Math.max(g.n, c + 1);
  }
  function recentrer(g, pbMid) {
    const n = BM.grilleVide(g.t0, g.dt, g.W, g.dp, pbMid - (g.H >> 1), g.H);
    n.n = g.n;
    const d = n.pbMin - g.pbMin;
    for (let c = 0; c < g.W; c++) {
      const o = c * g.H;
      for (let h = 0; h < g.H; h++) {
        const h2 = h - d;
        if (h2 >= 0 && h2 < g.H) { n.bids[o + h2] = g.bids[o + h]; n.asks[o + h2] = g.asks[o + h]; }
      }
      if (g.bas[c] >= 0) { n.bas[c] = Math.max(g.bas[c], n.pbMin); n.haut[c] = Math.min(g.haut[c], n.pbMin + n.H - 1); }
    }
    return n;
  }

  // ─── Boucles de lecture : arrêtées quand l'onglet est caché ─────────────────
  const minuteurs = [];
  function boucle(fn, ms) {
    let actif = true, h = null;
    const tour = async () => {
      if (!actif) return;
      if (!document.hidden) { try { await fn(); } catch (e) { /* chaque source gère son erreur */ } }
      h = setTimeout(tour, typeof ms === 'function' ? ms() : ms);
    };
    tour();
    const m = { arreter() { actif = false; clearTimeout(h); } };
    minuteurs.push(m);
    return m;
  }
  const pause = ms => new Promise(r => setTimeout(r, ms));
  let boucleCarnet = null;
  function demarrer() {
    lireHeatmap(); lireMarketData(); lireMinutesInitiales(); lireExecutionsInitiales();
    boucle(lireHeatmap, 5 * 60e3);
    boucle(lireMarketData, 60e3);
    setTimeout(() => boucle(lireMinutes, 10e3), 10e3);
    setTimeout(() => boucle(lireExecutions, 1000), 1500);
    boucleCarnet = boucle(lireCarnet, () => CADENCE_CARNET[R.niveauxLive]);
    setInterval(dessiner, 1000);                   // les âges vieillissent même sans donnée neuve
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { sale(); } });
  }

  // ─── Vue ───────────────────────────────────────────────────────────────────
  function dernierPrix() {
    if (E.exec.dernierPrix) return E.exec.dernierPrix;
    if (E.carnet && E.carnet.meilleurBid) return (E.carnet.meilleurBid + E.carnet.meilleurAsk) / 2;
    if (E.minutes.length) return E.minutes[E.minutes.length - 1].c;
    return null;
  }
  function vueParDefaut() {
    const now = Date.now(), p = dernierPrix() || 86000;
    const largeur = 3 * 3600e3;
    E.vue = { t1: now - largeur * 0.93, t2: now + largeur * 0.07, p1: p * (1 - 0.009), p2: p * (1 + 0.009) };
    E.suivre = true;
    majBoutonSuivre();
    sale();
  }
  function suivreMaintenant() {
    if (!E.suivre || !E.vue) return;
    const now = Date.now(), L = E.vue.t2 - E.vue.t1, t2 = now + L * 0.07;
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
    const bas = R.seuilBas, haut = Math.max(bas + 1, R.saturation);
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

  /** La chaleur, peinte au pixel : pour chaque pixel, le MAX des cellules qu'il recouvre
   *  (fusion comprise). Un pixel qui recouvre plusieurs colonnes ne peut donc jamais cacher
   *  un mur — ce que ferait un simple rééchantillonnage au plus proche. */
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
    const pp = (E.vue.p2 - E.vue.p1) / h;
    if (R.calques.publiee && E.pub) {
      if (!E.pubF || E.pubCle !== R.fusionT + 'x' + R.fusionP) {
        E.pubF = BM.fusionMax(E.pub, R.fusionT, R.fusionP); E.pubCle = R.fusionT + 'x' + R.fusionP;
      }
      peindreGrille(px, w, h, E.pubF, pp, 0);
    }
    if (R.calques.live && E.live) peindreGrille(px, w, h, E.live, pp, E.live.n);
    ctxChaleur.putImageData(img, 0, 0);
  }
  function peindreGrille(px, w, h, g, pp, nMax) {
    const W = nMax || g.W, tpp = (E.vue.t2 - E.vue.t1) / w;
    const colB = new Uint8Array(g.H), colA = new Uint8Array(g.H);
    // Lignes : indices absolus [ja, jb] des tranches que chaque pixel recouvre.
    const ja = new Int32Array(h), jb = new Int32Array(h);
    for (let y = 0; y < h; y++) {
      const haut = E.vue.p2 - y * pp, bas = haut - pp;
      ja[y] = Math.floor(bas / g.dp); jb[y] = Math.max(ja[y], Math.ceil(haut / g.dp) - 1);
    }
    let cle0 = -2, cle1 = -2, lo = 0, hi = -1, obs = false;
    for (let x = 0; x < w; x++) {
      const ta = E.vue.t1 + x * tpp, tb = ta + tpp;
      let c0 = Math.floor((ta - g.t0) / g.dt), c1 = Math.floor((tb - 1 - g.t0) / g.dt);
      if (c1 < 0 || c0 >= W) continue;
      c0 = Math.max(0, c0); c1 = Math.min(W - 1, c1);
      if (c0 !== cle0 || c1 !== cle1) {
        cle0 = c0; cle1 = c1; colB.fill(0); colA.fill(0); lo = Infinity; hi = -Infinity; obs = false;
        for (let c = c0; c <= c1; c++) {
          if (g.bas[c] < 0) continue;
          obs = true;
          if (g.bas[c] < lo) lo = g.bas[c];
          if (g.haut[c] > hi) hi = g.haut[c];
          const o = c * g.H;
          for (let k = 0; k < g.H; k++) {
            const vb = g.bids[o + k], va = g.asks[o + k];
            if (vb > colB[k]) colB[k] = vb;
            if (va > colA[k]) colA[k] = va;
          }
        }
      }
      if (!obs) continue;
      for (let y = 0; y < h; y++) {
        const a = ja[y], b = jb[y];
        if (b < lo || a > hi) continue;              // hors bande observée : la hachure reste
        let vb = 0, va = 0;
        const k0 = Math.max(0, a - g.pbMin), k1 = Math.min(g.H - 1, b - g.pbMin);
        for (let k = k0; k <= k1; k++) { if (colB[k] > vb) vb = colB[k]; if (colA[k] > va) va = colA[k]; }
        let c;
        if (LUT) c = LUT[vb > va ? vb : va];
        else c = vb >= va ? LUTB[vb] : LUTA[va];
        px[y * w + x] = c;
      }
    }
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
    if (R.calques.executions) bulles();
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
    posees.push({ x: x0, y: y0, w, h, texte: lignes[0] });
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
    const now = Date.now();
    // Maintenant
    const xn = X(now);
    ctx.fillStyle = C.accent; ctx.globalAlpha = 0.8; ctx.fillRect(Math.round(xn), 0, 1, Z.chaleur.h); ctx.globalAlpha = 1;
    // Carte publiée : jusqu'où elle va, et de quand elle date.
    if (R.calques.publiee && E.pub) {
      const fin = E.pub.t0 + E.pub.W * E.pub.dt;
      const xf = X(fin);
      if (xf > 0 && xf < Z.chaleur.w) tirets(xf, C.publie);
      const l = ['Carte publiée · dernière colonne il y a ' + BM.age(now - fin),
        (E.pub.dt / 1000) + ' s × ' + (E.pub.dp) + ' $' + (E.pubF && E.pubF !== E.pub ? ' (affichée : ' + E.pubF.dt / 1000 + ' s × ' + E.pubF.dp + ' $, MAX)' : '')
        + ' · publiée il y a ' + BM.age(now - E.pubMaj)];
      if (!E.pub.encodage) l.push('échelle en intensités : encodage non publié');
      pastille(l, Math.min(xf, Z.chaleur.w) - 8, 8, C.publie, 'right', 'Carte publiée · ' + BM.age(now - fin));
    }
    // Carnet live
    if (R.calques.live) {
      if (E.live && E.liveDebut) {
        const xs = X(Math.max(E.liveDebut, E.live.t0));
        if (xs > 0 && xs < Z.chaleur.w) tirets(xs, C.live);
        const l = ['Carnet live · dernier il y a ' + BM.age(now - E.carnetA),
          R.niveauxLive + ' niveaux / ' + CADENCE_CARNET[R.niveauxLive] / 1000 + ' s · ' + R.dpLive + ' $ · depuis ' + BM.heure(E.liveDebut),
          E.liveRef === 'publiee' ? 'même échelle que la carte publiée' : 'échelle propre : NON comparable à la carte publiée'];
        pastille(l, Math.max(8, xs + 8), 8, C.live, 'left', 'Live · ' + BM.age(now - E.carnetA) + (E.liveRef === 'publiee' ? '' : ' · échelle propre'));
      } else if (E.erreurs.carnet) {
        pastille(['Carnet live indisponible', E.erreurs.carnet], Z.chaleur.w - 8, 8, C.down, 'right', 'Live indisponible');
      }
    }
    // Trou entre la carte publiée et le carnet live : non observé, et dit.
    if (E.pub) {
      const fin = E.pub.t0 + E.pub.W * E.pub.dt, deb = E.live && E.liveDebut ? Math.max(E.liveDebut, E.live.t0) : now;
      const xa = Math.max(0, X(fin)), xb = Math.min(Z.chaleur.w, X(deb));
      if (xb - xa > 70) {
        texte('non observé', (xa + xb) / 2, Z.chaleur.h - 16, C.ink3, 11, 'center');
      }
    }
    // Exécutions
    if (R.calques.executions) {
      if (E.exec.dernier) {
        const l = ['Exécutions · dernière il y a ' + BM.age(now - E.exec.dernier),
          'depuis ' + BM.heure(E.exec.premier) + (E.execRemplissage && E.execRemplissage.enCours ? ' (remplissage…)' : '')
          + ' · bulles ≥ ' + BM.btc(R.bulleMin) + ' BTC'];
        if (E.execTrous.length) l.push(E.execTrous.length + ' trou(s) : onglet caché trop longtemps');
        pastille(l, Math.min(xn, Z.chaleur.w) - 8, Z.chaleur.h - 70, C.ink2, 'right', 'Exécutions · ' + BM.age(now - E.exec.dernier));
      } else if (E.erreurs.executions) pastille(['Exécutions indisponibles', E.erreurs.executions], Z.chaleur.w - 8, Z.chaleur.h - 60, C.down, 'right', 'Exécutions indisponibles');
    }
  }

  function murs() {
    const n = E.niv;
    if (!n || !n.murs.length || !n.mursA) return;
    const now = Date.now(), x0 = Math.max(0, X(n.mursA)), tr = n.tranche;
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
      const y = Math.round(Y(g.p)) + 0.5;
      if (y < 0 || y > Z.chaleur.h) continue;
      ctx.strokeStyle = C.gamma; ctx.setLineDash(g.court === 'ZG' ? [2, 3] : [7, 4]); ctx.lineWidth = g.court === 'ZG' ? 1.5 : 1.2;
      ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(Z.chaleur.w, y); ctx.stroke();
      texte(g.court + ' ' + BM.prix(g.p), Z.chaleur.w - 6, y - 8, C.gamma, 10, 'right', true);
    }
    ctx.restore();
    pastille(['Gamma (Deribit) · il y a ' + BM.age(Date.now() - n.gammaA), 'convention : ' + (n.convention || 'non précisée par le fichier')],
      x0 + 6, 60, C.gamma, 'left', 'Gamma · ' + BM.age(Date.now() - n.gammaA));
  }
  function bidAsk() {
    if (E.bidask.length < 2) return;
    for (const [k, coul] of [['bid', C.up], ['ask', C.down]]) {
      ctx.strokeStyle = coul; ctx.lineWidth = 1.2; ctx.globalAlpha = 0.95;
      ctx.beginPath();
      let prevT = null, prevY = 0;
      for (const b of E.bidask) {
        if (b.t < E.vue.t1 - 60e3 || b.t > E.vue.t2) continue;
        const x = X(b.t), y = Y(b[k]);
        // Marches : le prix tient jusqu'à la lecture suivante. Une lecture manquée (onglet
        // caché, panne) coupe la ligne au lieu de relier deux instants éloignés.
        if (prevT === null || b.t - prevT > 3 * CADENCE_CARNET[R.niveauxLive] + 1000) ctx.moveTo(x, y);
        else { ctx.lineTo(x, prevY); ctx.lineTo(x, y); }
        prevT = b.t; prevY = y;
      }
      ctx.stroke(); ctx.globalAlpha = 1;
    }
  }
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
    let premier = true, fin = 0;
    for (const m of ms) {
      if (m.fin < E.vue.t1 - 60e3 || m.t > E.vue.t2) continue;
      const t = Math.min(m.fin, E.minutesA || Date.now());   // la bougie en cours vaut ce qu'elle valait à sa lecture
      const x = X(t), y = Y(m.c);
      if (premier) { ctx.moveTo(x, y); premier = false; } else ctx.lineTo(x, y);
      fin = t;
    }
    // Après la dernière bougie lue : le prix des exécutions, à la seconde.
    if (E.exec.seaux.size) {
      const secs = [...E.exec.seaux.keys()].filter(s => s * 1000 > fin).sort((a, b) => a - b);
      for (const s of secs) {
        const m = E.exec.seaux.get(s);
        let pv = 0, q = 0;
        for (const [pb, v] of m) { pv += (pb + 0.5) * E.exec.dp * (v[0] + v[1]); q += v[0] + v[1]; }
        if (!q) continue;
        const x = X(s * 1000 + 500), y = Y(pv / q);
        if (premier) { ctx.moveTo(x, y); premier = false; } else ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
    ctx.restore();
  }
  function bulles() {
    if (!E.exec.seaux.size) return;
    const pasT = Math.max(1000, (E.vue.t2 - E.vue.t1) / Z.chaleur.w * 9);
    const pasP = Math.max(E.exec.dp, (E.vue.p2 - E.vue.p1) / Z.chaleur.h * 9);
    const g = E.exec.regrouper(E.vue.t1, E.vue.t2, pasT, pasP)
      .filter(b => b.achat + b.vente >= R.bulleMin)
      .sort((a, b) => (a.achat + a.vente) - (b.achat + b.vente));
    for (const b of g) {
      const q = b.achat + b.vente, r = Math.min(28, Math.max(2, 3.2 * Math.sqrt(q) * R.bulleEchelle));
      const x = X(b.t), y = Y(b.p);
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
    const pasP = Math.max(E.exec.dp, (E.vue.p2 - E.vue.p1) / Z.chaleur.h * 3);
    const prof = E.exec.profil(Math.max(E.vue.t1, E.exec.premier || E.vue.t1), Math.min(E.vue.t2, Date.now() + 1000), pasP);
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
    texte('Profil des exécutions visibles', 6, 14, C.ink2, 10, 'left', true);
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
      for (const g of [...E.niv.gamma].sort((u, v) => Math.abs(u.p - centre) - Math.abs(v.p - centre))) {
        const y = Y(g.p);
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
    const dec = pas < 1 ? 2 : 0;
    for (let q = Math.ceil(E.vue.p1 / pas) * pas; q <= E.vue.p2; q += pas) {
      const y = Y(q);
      if (reserve.some(r => Math.abs(r - y) < 13)) continue;
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
    const pasMin = [1, 2, 5, 10, 15, 30, 60, 120, 180, 360, 720].map(m => m * 60e3).find(x => x >= brut) || 1440 * 60e3;
    const pas = brut < 60e3 ? BM.pasRond(brut / 1000) * 1000 : pasMin;
    const off = new Date().getTimezoneOffset() * 60e3;
    for (let t = Math.ceil((E.vue.t1 - off) / pas) * pas + off; t <= E.vue.t2; t += pas) {
      const x = X(t);
      ctx.fillStyle = C.grille; ctx.fillRect(Math.round(x), a.y, 1, 4);
      texte(BM.heure(t, pas < 60e3), x, a.y + a.h / 2 + 1, C.ink3, 10.5, 'center');
    }
  }
  function carnetLateral() {
    const a = Z.dom;
    ctx.fillStyle = C.panneau; ctx.fillRect(a.x, a.y, a.w, a.h);
    texte('Carnet live', a.x + 6, 10, C.ink2, 10, 'left', true);
    const k = E.carnet;
    if (!k) { texte(E.erreurs.carnet ? 'indisponible' : '…', a.x + 6, 26, C.ink3, 10); return; }
    texte('Σ BTC par ' + Math.max(k.dp, BM.pasRond((E.vue.p2 - E.vue.p1) / a.h * 4)) + ' $', a.x + 6, 24, C.ink3, 9.5);
    const pas = Math.max(k.dp, BM.pasRond((E.vue.p2 - E.vue.p1) / a.h * 4));
    const agg = (m) => { const o = new Map(); for (const [pb, q] of m) { const P = Math.floor(pb * k.dp / pas); o.set(P, (o.get(P) || 0) + q); } return o; };
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
  function panneauVolume() {
    const a = Z.vol;
    ctx.fillStyle = C.panneau; ctx.fillRect(a.x, a.y, Z.w, a.h);
    const ms = minutesVisibles();
    texte('Volume 1 min (USDT) · achats ▲ / ventes ▼ au marché', a.x + 6, a.y + 9, C.ink3, 9.5);
    if (!ms.length) return;
    const ppm = a.w / ((E.vue.t2 - E.vue.t1) / 60e3);
    const g = Math.max(1, Math.ceil(2 / ppm));          // minutes regroupées par barre
    const barres = [];
    for (let i = 0; i < ms.length; i += g) {
      const b = { t: ms[i].t, achat: 0, vente: 0 };
      for (let j = i; j < Math.min(ms.length, i + g); j++) { b.achat += ms[j].achat; b.vente += ms[j].vente; }
      barres.push(b);
    }
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
  }
  function panneauCvd() {
    const a = Z.cvd;
    ctx.fillStyle = C.panneau; ctx.fillRect(a.x, a.y, Z.w, a.h);
    const ms = E.minutes, i0 = ms.findIndex(m => m.fin > E.vue.t1);
    if (i0 < 0) return;
    const cvd = BM.cvdDepuis(ms, i0);
    let lo = 0, hi = 0;
    for (let i = i0; i < ms.length; i++) { if (ms[i].t > E.vue.t2) break; lo = Math.min(lo, cvd[i]); hi = Math.max(hi, cvd[i]); }
    const pad = (hi - lo) * 0.1 || 1, y = v => a.y + 16 + (a.h - 20) * (1 - (v - lo + pad) / (hi - lo + 2 * pad));
    ctx.strokeStyle = C.grille; ctx.beginPath(); ctx.moveTo(0, y(0)); ctx.lineTo(a.w, y(0)); ctx.stroke();
    ctx.strokeStyle = C.accent; ctx.lineWidth = 1.4; ctx.beginPath();
    let premier = true, der = 0;
    for (let i = i0; i < ms.length; i++) {
      if (ms[i].t > E.vue.t2) break;
      const x = X(Math.min(ms[i].fin, Date.now()));
      if (premier) { ctx.moveTo(X(ms[i0].t), y(0)); premier = false; }
      ctx.lineTo(x, y(cvd[i])); der = cvd[i];
    }
    ctx.stroke();
    texte('CVD spot (USDT) cumulé depuis le bord gauche · ' + (der >= 0 ? '+' : '−') + BM.prix(Math.abs(der) / 1e6, 1) + ' M',
      a.x + 6, a.y + 9, C.ink3, 9.5);
  }

  // ─── Lecture au pointeur : la VALEUR, quel que soit le réglage ──────────────
  const bulleInfo = document.getElementById('lecture');
  function lectureSouris() {
    const s = E.souris;
    if (!s || s.zone !== 'chaleur') { bulleInfo.hidden = true; return; }
    const t = T(s.x), p = Pr(s.y), l = [];
    l.push('<b>' + BM.prix(p, 1) + ' $</b> · ' + BM.heure(t, true));
    const cel = (g, nom) => {
      if (!g) return;
      const c = Math.floor((t - g.t0) / g.dt);
      const W = g.n || g.W;
      if (c < 0 || c >= W) return;
      if (g.bas[c] < 0) { l.push(nom + ' : non observé'); return; }
      const pb = Math.floor(p / g.dp), h = pb - g.pbMin;
      if (pb < g.bas[c] || pb > g.haut[c]) { l.push(nom + ' : hors de la bande couverte'); return; }
      const vb = h >= 0 && h < g.H ? g.bids[c * g.H + h] : 0, va = h >= 0 && h < g.H ? g.asks[c * g.H + h] : 0;
      const v = Math.max(vb, va), cote = vb >= va ? 'bid' : 'ask';
      const tranche = BM.prix(pb * g.dp) + '–' + BM.prix((pb + 1) * g.dp) + ' $';
      if (!v) { l.push(nom + ' ' + tranche + ' : rien au-dessus du seuil'); return; }
      const enc = g === E.live ? (E.liveRef === 'publiee' ? E.pub && E.pub.encodage : null) : g.encodage;
      const d = BM.decoder(v, enc);
      l.push(nom + ' ' + tranche + ' (' + cote + ') : intensité ' + v
        + (d ? (d.sature ? ' → plus gros niveau ≥ ' + BM.btc(d.min) + ' BTC (saturé)' : ' → plus gros niveau ' + BM.btc(d.min) + '–' + BM.btc(d.max) + ' BTC') : ' (sans unité)'));
    };
    if (R.calques.publiee) cel(E.pubF || E.pub, 'Carte');
    if (R.calques.live) cel(E.live, 'Live');
    if (R.calques.executions && E.exec.seaux.size) {
      const pasT = Math.max(1000, (E.vue.t2 - E.vue.t1) / Z.chaleur.w * 9), pasP = Math.max(E.exec.dp, (E.vue.p2 - E.vue.p1) / Z.chaleur.h * 9);
      const b = E.exec.regrouper(t - pasT / 2, t + pasT / 2, pasT, pasP).filter(x => Math.abs(x.p - p) <= pasP / 2);
      const ach = b.reduce((s, x) => s + x.achat, 0), ven = b.reduce((s, x) => s + x.vente, 0);
      if (ach + ven > 0) l.push('Exécutions : ' + BM.btc(ach) + ' BTC achetés / ' + BM.btc(ven) + ' vendus au marché');
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
    const s = $('rSeuilVal'); if (s) s.textContent = R.seuilBas ? fmt(R.seuilBas) : 'aucun';
    const t = $('rSaturationVal'); if (t) t.textContent = fmt(R.saturation);
    const e = $('encodageEtat');
    if (e) e.textContent = enc
      ? 'Encodage publié : intensité = min(' + enc.plafond + ', ent(' + enc.plafond + ' × √(q / ' + enc.ref_btc + ' BTC))), q = ' + enc.q + '.'
      : 'Encodage NON publié par ce fichier : la carte affiche des intensités 0–255, sans conversion en BTC (aucune référence n\'est inventée ici).';
  }
  function majStatut() {
    const el = $('statut');
    if (!el) return;
    const noms = { carte: 'carte publiée', fichier: 'fichier 15 min', bougies: 'bougies', executions: 'exécutions', carnet: 'carnet live' };
    const ko = Object.entries(E.erreurs).filter(([, v]) => v).map(([k, v]) => noms[k] + ' : ' + v);
    el.textContent = ko.length ? '⚠ ' + ko.join(' · ') : '';
    el.hidden = !ko.length;
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
    etat: () => ({
      vue: E.vue && Object.assign({}, E.vue), suivre: E.suivre, erreurs: Object.assign({}, E.erreurs),
      publiee: E.pub ? { W: E.pub.W, H: E.pub.H, dt: E.pub.dt, dp: E.pub.dp, encodage: !!E.pub.encodage } : null,
      live: E.live ? { n: E.live.n, dt: E.live.dt, dp: E.live.dp, ref: E.liveRef } : null,
      executions: { seaux: E.exec.seaux.size, premier: E.exec.premier, dernier: E.exec.dernier, total: E.exec.total.slice() },
      minutes: E.minutes.length, niveaux: E.niv ? { murs: E.niv.murs.length, gamma: E.niv.gamma.length } : null,
      pastilles: posees.map(p => p.texte), reglages: JSON.parse(JSON.stringify(R)),
      mesure: Object.assign({}, MESURE),
    }),
  };
})();
