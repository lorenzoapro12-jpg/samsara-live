// ═══════════════════════════════════════════════════════════════════════════════
// CONTRE-EXPERTISE — « Vérifié par ton navigateur »
// ─────────────────────────────────────────────────────────────────────────────
// Ce que le serveur a publié, recalculé ICI depuis Binance : les indicateurs de chaque TF, le
// CVD à la seconde près, le prix dans la fourchette de ses secondes. Le lecteur n'a pas à
// croire le fichier sur parole. Mesuré le 07/10/2026 : 18 valeurs sur 18 retrouvées sur deux
// publications, et le résidu du CVD égal, à une seconde de flux près, à la somme des bougies
// d'une seconde depuis l'ouverture de la bougie de 5 min en cours.
//
// RIEN N'EST RECOPIÉ : les TF viennent du fichier (md.tf), les paramètres de meta.champs (params),
// la tolérance du nombre de décimales que le fichier montre (0,5 × 10^−d, d = le plus de
// décimales que ce champ porte sur tous les TF : « 36.0 » arrive « 36 » dans un JSON lu).
// Seules les raisons de NON-vérification sont écrites à la main (RAISONS).
//
// Un écart ne dit jamais « serveur faux » : la page ne sait pas qui a changé — la source
// (Binance a pu corriger une bougie) ou le calcul. « ✗ différent : source modifiée ou calcul
// différent », avec les deux valeurs.
//
// COÛT : 6 lectures de bougies (poids 2 chacune, ≈ 12), UNE fois par publication, seulement
// quand la carte est à l'écran et l'onglet visible ; jamais au tour de 60 s.
//
// Le cœur (plan, verifier) est PUR : tests/test_contre.js le rejoue sur des réponses
// enregistrées. Les fonctions de calcul sont passées par l'appelant (calcRSI, calcEMA, calcATR
// de js/app.js) : la page vérifie avec SES propres implémentations, pas une copie.
// ═══════════════════════════════════════════════════════════════════════════════
const ContreExpertise = (function () {
  // Les seules phrases écrites à la main : pourquoi un champ ne PEUT pas être recalculé ici.
  const RAISONS = {
    futures: 'API futures (fapi) : hors du contrat réseau de la page',
    deribit: 'Deribit : la page ne l’interroge pas',
    coinbase: 'Coinbase : la page ne l’interroge pas',
    yahoo: 'Yahoo : la page ne l’interroge pas',
    carnet: 'carnet d’ordres : un instantané, impossible à rejouer',
  };
  const FENETRE_LECTURE_S = 15;      // CVD : le serveur date APRÈS sa requête — convention
  const PRIX_AVANT_S = 30, PRIX_APRES_S = 5;   // btc.price : fenêtre de secondes — convention
  const ECART_FENETRES_CVD = 1.5;    // r_1h, r_4h, r_24h : chacun arrondi à l'unité
  const KLINE_MS = { '1m': 6e4, '5m': 3e5, '15m': 9e5, '30m': 18e5, '1h': 36e5, '4h': 144e5, '1d': 864e5, '1w': 6048e5 };

  // ── Lecture du fichier ──
  const champ = (md, cle) => (md && md.meta && md.meta.champs && md.meta.champs[cle]) || null;
  const params = (md, cle) => { const c = champ(md, cle); return c && c.params ? c.params : null; };
  /** Décimales que montre un nombre JSON (« 1e-7 » compris). */
  function decimales(v) {
    if (typeof v !== 'number' || !isFinite(v)) return 0;
    const s = String(v), m = /e-(\d+)$/.exec(s);
    if (m) return +m[1] + ((s.split('e')[0].split('.')[1] || '').length);
    return (s.split('.')[1] || '').length;
  }
  /** Tolérance d'un champ du bloc tf : 0,5 × 10^−d, d = le plus de décimales sur tous les TF. */
  function tolerance(md, nom) {
    let d = 0;
    for (const t of Object.values(md.tf || {})) if (t && typeof t[nom] === 'number') d = Math.max(d, decimales(t[nom]));
    return 0.5 * Math.pow(10, -d);
  }
  function symbole(md) {
    const c = champ(md, 'tf.*.rsi_14') || champ(md, 'btc.price');
    const m = c && /Binance spot (\w+)/.exec(c.source || '');
    return m ? m[1] : null;
  }

  // ── Plan des lectures (PUR) ──
  /** Phase 1 : bougies de chaque TF, bougies 5 min du CVD, secondes autour du prix.
   *  → { cle: url } ; `api` = la constante d'API de la page (aucun hôte écrit ici). */
  function plan(md, api) {
    const sym = symbole(md), out = {};
    if (!sym) return out;
    const k = (q) => api + 'klines?symbol=' + sym + '&' + q;
    for (const [tf, t] of Object.entries(md.tf || {})) {
      if (!t || !(t.bougies_lues > 0) || !t.derniere_cloture_a || !KLINE_MS[tf]) continue;
      out['tf:' + tf] = k('interval=' + tf + '&endTime=' + Date.parse(t.derniere_cloture_a) + '&limit=' + t.bougies_lues);
    }
    const c = cvdParams(md);
    if (c) out.cvd5 = k('interval=' + c.intervalle + '&endTime=' + c.fin + '&limit=' + (c.n + 1));
    const u = Date.parse(md.updated);
    if (isFinite(u) && md.btc && typeof md.btc.price === 'number') {
      const s0 = Math.floor(u / 1000) * 1000 - PRIX_AVANT_S * 1000;
      out.prix1s = k('interval=1s&startTime=' + s0 + '&endTime=' + (s0 + (PRIX_AVANT_S + PRIX_APRES_S) * 1000) + '&limit=' + (PRIX_AVANT_S + PRIX_APRES_S + 1));
    }
    return out;
  }
  /** Phase 2 : les secondes du CVD, depuis l'ouverture de la bougie 5 min la plus ancienne qui
   *  a pu être « en cours » à la lecture du serveur. null si la phase 1 n'a pas répondu. */
  function plan2(md, api, k5) {
    const c = cvdParams(md), sym = symbole(md);
    if (!c || !Array.isArray(k5) || k5.length < 2) return null;
    const al = alignements(k5, c);
    if (!al.length) return null;
    const debut = Math.min(...al.map(a => a.ouverture));
    const n = Math.ceil((c.fin - debut) / 1000) + 1;
    return api + 'klines?symbol=' + sym + '&interval=1s&startTime=' + debut + '&endTime=' + c.fin + '&limit=' + Math.min(1000, n);
  }
  function cvdParams(md) {
    const x = md.micro || {}, fen = [];
    for (const [cle, m] of Object.entries((md.meta && md.meta.champs) || {})) {
      const r = /^micro\.(cvd_(\w+)_usd)$/.exec(cle);
      if (r && m.params && m.params.bougies > 0 && typeof x[r[1]] === 'number') fen.push({ nom: r[2], cle: r[1], n: m.params.bougies, pub: x[r[1]], im: m.params.intervalle_min });
    }
    const fin = Date.parse(x.cvd_window_end);
    if (!fen.length || !isFinite(fin)) return null;
    const im = fen[0].im;
    if (!(im > 0) || fen.some(f => f.im !== im)) return null;
    return { fen, fin, intervalle: im + 'm', pas: im * 60000, n: Math.max(...fen.map(f => f.n)) };
  }
  /** Quelle bougie 5 min était EN COURS à la lecture du serveur ? La dernière renvoyée, et aussi
   *  l'avant-dernière quand la fin publiée tombe moins de FENETRE_LECTURE_S après une ouverture
   *  (la requête a pu partir juste avant). */
  function alignements(k5, c) {
    const out = [], der = k5.length - 1;
    for (const i of [der, der - 1]) {
      if (i < 0) continue;
      const ouv = +k5[i][0];
      // [début, fin] des secondes candidates à la lecture, bornées par cette bougie
      const lo = Math.max(ouv, Math.floor((c.fin - FENETRE_LECTURE_S * 1000) / 1000) * 1000);
      const hi = Math.min(ouv + c.pas, Math.floor(c.fin / 1000) * 1000);
      if (i === der - 1 && !(c.fin - +k5[der][0] <= FENETRE_LECTURE_S * 1000)) continue;
      if (hi < lo) continue;
      out.push({ i, ouverture: ouv, lo, hi });
    }
    return out;
  }

  // ── Verdicts ──
  const ligne = (o) => Object.assign({ etat: 'ok', publie: null, recalcule: null, borne: '', note: '' }, o);
  const delta = k => 2 * +k[10] - +k[7];

  /** Indicateurs d'un TF. → lignes. */
  function verifierTf(md, tf, k, calc) {
    const t = md.tf[tf], nature = n => (champ(md, 'tf.*.' + n) || {}).nature || '';
    const base = { groupe: 'Indicateurs ' + tf, tf };
    if (!t || !(t.bougies_lues > 0) || !t.derniere_cloture_a || !Array.isArray(t.last_5_candles)) {
      return [ligne(Object.assign({}, base, { cle: 'tf.' + tf, libelle: 'bloc ' + tf, etat: 'ancien', note: 'format antérieur : bougies_lues ou derniere_cloture_a absent' }))];
    }
    if (k && k.erreur) return [ligne(Object.assign({}, base, { cle: 'tf.' + tf, libelle: 'bloc ' + tf, etat: 'injoignable', note: k.erreur }))];
    if (!Array.isArray(k)) return [];
    const finPub = Date.parse(t.derniere_cloture_a);
    if (k.length !== t.bougies_lues || +k[k.length - 1][6] !== finPub) {
      return [ligne(Object.assign({}, base, { cle: 'tf.' + tf, libelle: 'bougies ' + tf, etat: 'source', publie: t.bougies_lues + ' bougies, clôture ' + t.derniere_cloture_a,
        recalcule: k.length + ' bougies, clôture ' + (k.length ? new Date(+k[k.length - 1][6]).toISOString() : '—'),
        note: 'source différente : Binance ne rend pas les bougies que le serveur a lues' }))];
    }
    const H = k.map(x => +x[2]), L = k.map(x => +x[3]), Cl = k.map(x => +x[4]), V = k.map(x => +x[5]);
    const der = k.length - 1, d5 = t.last_5_candles[t.last_5_candles.length - 1];
    let vDerniere = null;
    // Bougie EN COURS à la publication : Binance la rend aujourd'hui plus avancée (ou close).
    // Son plus haut, son plus bas et sa clôture d'alors sont publiés (last_5_candles) ; son
    // volume d'alors ne l'est pas — il est seulement BORNÉ par celui d'aujourd'hui.
    if (t.bougie_en_cours) { H[der] = d5.high; L[der] = d5.low; Cl[der] = d5.close; vDerniere = V[der]; }
    const lignes = [];
    const num = (nom, f, opts) => {
      if (!(nom in t)) return;
      const p = params(md, 'tf.*.' + nom);
      const l = ligne(Object.assign({}, base, { cle: 'tf.' + tf + '.' + nom, libelle: ((champ(md, 'tf.*.' + nom) || {}).libelle || nom) + ' ' + tf, nature: nature(nom), publie: t[nom] }));
      if (!p) { l.etat = 'ancien'; l.note = 'format antérieur : paramètres absents de meta.champs'; lignes.push(l); return; }
      const v = f(p);
      if (v === undefined) return;
      l.recalcule = v;
      if (typeof t[nom] === 'boolean') { l.etat = v === t[nom] ? 'ok' : 'diff'; }
      else if (opts && opts.borne) {
        const [lo, hi] = v; l.recalcule = lo; l.recalculeHaut = hi;
        const tol = tolerance(md, nom);
        l.etat = t[nom] >= lo - tol && t[nom] <= hi + tol ? 'approx' : 'diff';
        l.borne = opts.borne;
      } else {
        const tol = tolerance(md, nom);
        l.etat = v !== null && Math.abs(v - t[nom]) <= tol * (1 + 1e-9) ? 'ok' : 'diff';
        l.borne = '± ' + tol;
      }
      if (l.etat === 'diff') l.note = 'source modifiée ou calcul différent';
      lignes.push(l);
    };
    const derniere = a => a[a.length - 1];
    const ema = p => derniere(calc.calcEMA(Cl, p));
    const ext = (a, n, f) => f(...a.slice(-n));
    num('rsi_14', p => derniere(calc.calcRSI(Cl, p.periode)));
    for (const nom of ['ema20', 'ema50', 'ema20_4h', 'ema50_4h']) num(nom, p => ema(p.periode));
    num('ema_ecart_pct', p => (ema(p.courte) / ema(p.longue) - 1) * 100);
    num('ema_gap_pct', p => Math.abs(ema(p.courte) - ema(p.longue)) / ema(p.longue) * 100);
    for (const nom of ['ema20_sous_ema50', 'death_cross_4h']) num(nom, p => ema(p.courte) < ema(p.longue));
    num('support_30', p => ext(L, p.bougies, Math.min));
    num('resistance_30', p => ext(H, p.bougies, Math.max));
    for (const nom of ['amplitude_30_pct', 'range_24h_pct']) num(nom, p => { const lo = ext(L, p.bougies, Math.min); return (ext(H, p.bougies, Math.max) - lo) / lo * 100; });
    num('atr_14', p => derniere(calc.calcATR(H, L, Cl, p.periode)));
    num('atr_14_pct', p => derniere(calc.calcATR(H, L, Cl, p.periode)) / Cl[der] * 100);
    for (const nom of ['volume_moyen_10_btc', 'avg_volume_10']) {
      num(nom, p => {
        const s = V.slice(-p.bougies), somme = s.reduce((a, b) => a + b, 0);
        if (vDerniere === null) return somme / p.bougies;
        return [(somme - vDerniere) / p.bougies, somme / p.bougies];   // volume en cours : entre 0 et celui d'aujourd'hui
      }, t.bougie_en_cours ? { borne: 'bougie en cours : son volume d’alors est entre 0 et celui d’aujourd’hui' } : null);
    }
    // Les bougies détaillées : les closes à l'identique, celle en cours par son ouverture.
    const n5 = t.last_5_candles.length, ko5 = [];
    t.last_5_candles.forEach((c, j) => {
      const x = k[k.length - n5 + j], encours = t.bougie_en_cours && j === n5 - 1;
      const champs = encours ? ['open'] : ['open', 'high', 'low', 'close'];
      champs.forEach((f, m) => { if (Math.abs(+x[1 + m] - c[f]) > 1e-6) ko5.push(f + ' #' + (j + 1)); });
    });
    lignes.push(ligne(Object.assign({}, base, { cle: 'tf.' + tf + '.last_5_candles', libelle: 'Dernières bougies ' + tf, nature: nature('last_5_candles'),
      etat: ko5.length ? 'diff' : 'ok', publie: n5 + ' bougies', recalcule: ko5.length ? 'diffère : ' + ko5.join(', ') : n5 + ' bougies',
      note: ko5.length ? 'source modifiée ou calcul différent' : (t.bougie_en_cours ? 'la bougie en cours : son ouverture' : '') })));
    return lignes;
  }

  /** CVD : résidus égaux entre fenêtres, puis retrouvés à la seconde. → lignes. */
  function verifierCvd(md, k5, k1) {
    const c = cvdParams(md), groupe = 'CVD';
    if (!c) return [];
    const nature = (champ(md, 'micro.' + c.fen[0].cle) || {}).nature || '';
    const pour = (etat, extra) => c.fen.map(f => ligne(Object.assign({ groupe, cle: 'micro.' + f.cle, libelle: (champ(md, 'micro.' + f.cle) || {}).libelle || f.cle, nature, publie: f.pub, etat }, extra)));
    if (k5 && k5.erreur) return pour('injoignable', { note: k5.erreur });
    if (k1 && k1.erreur) return pour('injoignable', { note: k1.erreur });
    if (!Array.isArray(k5) || !Array.isArray(k1)) return [];
    let dans = null, proche = null, residus = null;
    for (const a of alignements(k5, c)) {
      if (a.i < c.n - 1) continue;
      const r = c.fen.map(f => { let s = 0; for (let j = a.i - (f.n - 1); j < a.i; j++) s += delta(k5[j]); return f.pub - s; });
      const ecartFen = Math.max(...r) - Math.min(...r);
      if (ecartFen > ECART_FENETRES_CVD) { if (!residus) residus = { ecartFen }; continue; }
      const res = r.reduce((x, y) => x + y, 0) / r.length;
      // Cumul des secondes depuis l'ouverture de la bougie en cours jusqu'à t (exclu) ; t
      // convient si l'écart tient dans le volume de la seconde qui commence à t.
      const sec = new Map(k1.filter(x => +x[0] >= a.ouverture && +x[0] < a.ouverture + c.pas).map(x => [+x[0], x]));
      let cum = 0;
      for (let t = a.ouverture; t <= a.hi; t += 1000) {
        if (t >= a.lo) {
          const e = Math.abs(cum - res), x = sec.get(t), vol = x ? +x[7] : 0;
          if (!proche || e < proche.e) proche = { e, t, cum, res };
          if (e <= vol && (!dans || e < dans.e)) dans = { e, t };
        }
        const x = sec.get(t);
        if (x) cum += delta(x);
      }
    }
    if (dans) {
      return pour('approx', { ecartUsd: Math.round(dans.e), lecture: dans.t,
        borne: 'cohérent à la seconde (écart ' + Math.round(dans.e) + ' USDT, lecture estimée ' + new Date(dans.t).toISOString().slice(11, 19) + ' UTC)' });
    }
    const meilleur = proche;
    const det = meilleur ? 'résidu ' + Math.round(meilleur.res) + ' USDT, au plus près ' + Math.round(meilleur.cum) + ' USDT'
      : residus ? 'résidus des fenêtres écartés de ' + Math.round(residus.ecartFen) + ' USDT' : 'aucune seconde comparable';
    return pour('diff', { note: 'source modifiée ou calcul différent — ' + det });
  }

  /** btc.price dans la fourchette des secondes autour de `updated`. */
  function verifierPrix(md, k1) {
    const c = champ(md, 'btc.price');
    if (!c || !md.btc || typeof md.btc.price !== 'number') return [];
    const l = ligne({ groupe: 'Prix', cle: 'btc.price', libelle: c.libelle || 'Prix', nature: c.nature || '', publie: md.btc.price });
    if (k1 && k1.erreur) return [Object.assign(l, { etat: 'injoignable', note: k1.erreur })];
    if (!Array.isArray(k1)) return [];
    if (!k1.length) return [Object.assign(l, { etat: 'diff', note: 'aucune seconde échangée dans la fenêtre' })];
    const lo = Math.min(...k1.map(x => +x[3])), hi = Math.max(...k1.map(x => +x[2]));
    const fen = 'secondes de ' + new Date(+k1[0][0]).toISOString().slice(11, 19) + ' à ' + new Date(+k1[k1.length - 1][0] + 999).toISOString().slice(11, 19) + ' UTC (fenêtre −' + PRIX_AVANT_S + ' s / +' + PRIX_APRES_S + ' s : convention)';
    const dans = md.btc.price >= lo && md.btc.price <= hi;
    return [Object.assign(l, { etat: dans ? 'approx' : 'diff', recalcule: lo, recalculeHaut: hi, borne: fen, note: dans ? '' : 'source modifiée ou calcul différent' })];
  }

  /** Les champs que la page ne recalcule pas, avec leur raison. */
  function nonVerifiables(md, faits) {
    const out = [];
    for (const [cle, m] of Object.entries((md.meta && md.meta.champs) || {})) {
      if (faits.has(cle) || m.alias_de) continue;
      const src = m.source || '';
      const raison = /futures/i.test(src) ? RAISONS.futures : /deribit/i.test(src) ? RAISONS.deribit
        : /coinbase/i.test(src) ? RAISONS.coinbase : /yahoo/i.test(src) ? RAISONS.yahoo
        : /^liquidity\./.test(cle) ? RAISONS.carnet
        : 'non recalculé ici (fenêtre : ' + (m.fenetre || '—') + ')';
      out.push({ cle, libelle: m.libelle || cle, nature: m.nature || '', source: src, raison });
    }
    return out;
  }

  /** Le verdict complet. reponses = { 'tf:4h': klines|{erreur}, cvd5, cvd1s, prix1s }.
   *  calc = { calcRSI, calcEMA, calcATR }. PUR. */
  function verifier(md, reponses, calc) {
    if (!md || !md.meta || !md.meta.champs) return { etat: 'ancien', lignes: [], non: [], note: 'format antérieur : meta.champs absent' };
    let lignes = [];
    for (const tf of Object.keys(md.tf || {})) lignes = lignes.concat(verifierTf(md, tf, reponses['tf:' + tf], calc));
    lignes = lignes.concat(verifierCvd(md, reponses.cvd5, reponses.cvd1s), verifierPrix(md, reponses.prix1s));
    const faits = new Set(lignes.map(l => l.cle.replace(/^tf\.[^.]+\./, 'tf.*.')));
    // Le CVD 24 h sous son ancien nom, et les champs de structure du bloc tf : lus par la
    // vérification de la source (nombre de bougies, dernière clôture).
    for (const n of ['bougies_lues', 'derniere_cloture_a', 'bougie_en_cours', 'last_close', 'sr_window_h']) faits.add('tf.*.' + n);
    const non = nonVerifiables(md, faits);
    const compte = e => lignes.filter(l => l.etat === e).length;
    const etat = compte('injoignable') && compte('injoignable') === lignes.length ? 'injoignable'
      : compte('diff') + compte('source') ? 'diff' : compte('ancien') && !compte('ok') && !compte('approx') ? 'ancien' : 'ok';
    return { etat, lignes, non, comptes: { ok: compte('ok'), approx: compte('approx'), diff: compte('diff') + compte('source'), ancien: compte('ancien'), injoignable: compte('injoignable') } };
  }

  /** Les lectures, puis le verdict. f = fetch ; classer (Horloges) nomme une panne. */
  async function lancer(md, api, calc, f, classer) {
    const lire = async url => {
      try {
        const r = await f(url, { cache: 'no-store' });
        if (!r.ok) { const e = new Error('HTTP ' + r.status); e.status = r.status; throw e; }
        return await r.json();
      } catch (e) {
        const c = classer ? classer({ erreur: e }) : { libelle: e.message };
        return { erreur: 'Binance injoignable (' + (c.libelle || e.message) + ')' };
      }
    };
    const p = plan(md, api), cles = Object.keys(p);
    const rep = {};
    (await Promise.all(cles.map(c => lire(p[c])))).forEach((r, i) => { rep[cles[i]] = r; });
    if (rep.cvd5 && rep.cvd5.erreur) rep.cvd1s = rep.cvd5;
    else { const u = plan2(md, api, rep.cvd5); if (u) rep.cvd1s = await lire(u); }
    return verifier(md, rep, calc);
  }

  return { RAISONS, FENETRE_LECTURE_S, decimales, tolerance, plan, plan2, verifier, lancer, alignements, cvdParams };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = ContreExpertise;
