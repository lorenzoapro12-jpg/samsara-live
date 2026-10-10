// Les figures après la 2e revue (octobre 2026), sur des bougies BTCUSDT réelles enregistrées
// (tests/fixtures/bougies-revue-figures.json : 15 min et 1 h jusqu'au 09/10/2026 20:00 UTC).
// CE QUI EST VÉRIFIÉ
//   1. Complet : une figure montrée qui tombe reste montrée, barrée, à la clôture suivante — même
//      quand une figure mieux rangée du même groupe la recouvre (15 min, 08/10 13:45 UTC : le double
//      creux tombe, le double sommet le recouvre).
//   2. Figures à deux droites : une droite de 2 points seulement est approchée par le prix entre
//      eux ; aucune clôture hors de la bande de sortie sur la durée de la figure à sa naissance (le
//      biseau montant du 08/10 14:00 UTC en 1 h, tenu par 2 sommets jamais revisités, n'est plus vu).
//   3. Bilan : un double et un triple sur les mêmes creux ne comptent pas deux fois le même
//      mouvement (15 min, 09/10 02:00 UTC).
//   4. Double devenu triple : en Lisible, le triple prend la place du double dessiné (« Devenu
//      triple creux », une fois, et la bulle le dit) ; en Complet, il passe devant une figure du
//      même dernier point (1 h, 06/10 10:00 UTC).
//   5. Mots : la ✗ dit le côté et le prix (« au-dessus de 85 447 $ (le milieu de la figure) »,
//      « clôture > 84 670 $ (haut de la pause) ») ; jamais « au bout de la pause » ; une mèche seule
//      ne dit pas « sort en bas ? » ; « cible atteinte » garde le nom ; la 1re clôture dehors est dite
//      avec le seuil de SA bougie ; « Figure validée » ; « 500 j, soit 1,4 an » ; les ébauches
//      annulées à part des figures invalidées (Complet).
//   6. Tracé : une figure confirmée porte son trait d'invalidation (de la validation à la bougie en
//      cours, ou à sa chute : la ✗ au bout).
//   7. Rejeu à froid par tranches = rejeu complet ; tranches mesurées (affiché).
//   8. PAGE (Chromium) : 1re visite d'un intervalle, le rejeu se fait par tranches de
//      PARAM.guide.froidTranche bougies (aucune image ne porte un rejeu complet), puis s'arrête ;
//      les figures paraissent.
// USAGE   node tests/test_figures_revue2.js
const fs = require('fs'), path = require('path'), vm = require('vm'), http = require('http');
const REPO = path.resolve(__dirname, '..');
const G = require(path.join(REPO, 'js/guide.js'));
const { chargerPage } = require('./bac');

let ko = 0;
const check = (nom, ok, det) => { if (!ok) ko++; console.log(`  ${ok ? '✓' : '✗'} ${nom}${!ok && det !== undefined ? ' — ' + JSON.stringify(det).slice(0, 600) : ''}`); };
const titre = t => console.log(`\n── ${t} ──`);
const page = chargerPage();
const P = vm.runInContext('PARAM.guide', page.sandbox);
const DEB = P.debutant;

function atrDe(H, L, C, n) {
  const tr = [null];
  for (let i = 1; i < C.length; i++) tr.push(Math.max(H[i] - L[i], Math.abs(H[i] - C[i - 1]), Math.abs(L[i] - C[i - 1])));
  const a = new Array(C.length).fill(null);
  let s = 0; for (let i = 1; i <= n; i++) s += tr[i];
  a[n] = s / n;
  for (let i = n + 1; i < C.length; i++) a[i] = (a[i - 1] * (n - 1) + tr[i]) / n;
  return a;
}
const FX = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'bougies-revue-figures.json'), 'utf8'));
const serie = K => { const h = K.map(k => k[2]), l = K.map(k => k[3]), c = K.map(k => k[4]); return { h, l, c, atr: atrDe(h, l, c, P.atrPeriode), n: K.length - 1 }; };
const iso = s => new Date(s * 1000).toISOString().slice(0, 16);
const idx = (K, quand) => K.findIndex(k => iso(k[0]) === quand);
const LARG = 50;
/** Rejoue la page clôture après clôture : K[0..i] (i : la bougie en cours), de i0 à i1. f(i, res, n). */
function rejouer(K, i0, i1, f) {
  let res = null;
  for (let i = i0; i <= i1; i++) {
    const k = K.slice(0, i + 1);
    res = G.detecter(serie(k), P, res);
    f(i, res, k.length);
  }
  return res;
}

// ── 1. ✗ gardée en Complet ──
titre('1. Complet : une figure montrée qui tombe est barrée à la clôture suivante');
{
  const K = FX['15m'], iC = idx(K, '2026-10-08T13:45');
  const st = { tombees: 0, sansCroix: 0, cas: null, ex: [] };
  let prev = [];
  rejouer(K, iC - 150, iC + 150, (i, res, n) => {
    const j = res.n - 1, E = G.formesAffichees(res, P, n - LARG, n, 'expert');
    for (const f of prev) if (f.fin && f.jFin === j && ['invalide', 'invalide_avant', 'abandon', 'expire_avant'].includes(f.fin)) {
      st.tombees++;
      if (!E.includes(f)) { st.sansCroix++; st.ex.push(iso(K[i][0]) + ' ' + f.type); }
      if (i === iC) st.cas = { type: f.type, fin: f.fin, avec: E.map(x => x.type + ':' + G.etatForme(x).cle) };
    }
    prev = E;
  });
  check(`clôture du 08/10 13:45 UTC : la figure tombée (${st.cas ? st.cas.type : '?'}) est encore à l’écran, barrée, avec la figure qui la recouvre`, !!st.cas && st.cas.type === 'double_creux' && st.cas.avec.some(x => /double_creux:invalide/.test(x)), st.cas);
  check(`${st.tombees} figures montrées tombées sur 300 clôtures : toutes barrées à la clôture suivante`, st.tombees >= 3 && st.sansCroix === 0, st.ex);
  // Le plafond tient : jamais plus de formesMax.
  let trop = 0;
  rejouer(K, iC - 20, iC + 20, (i, res, n) => { if (G.formesAffichees(res, P, n - LARG, n, 'expert').length > P.formesMax) trop++; });
  check(`… et jamais plus de ${P.formesMax} figures à l’écran`, trop === 0, trop);
}

// ── 2. Droites de 2 points ──
titre('2. Figures à deux droites : une droite de 2 points est approchée, aucune clôture hors de la bande');
{
  const ancienBiseau = (() => { const R = G.detecter(serie(FX['1h']), P); return R.formes.filter(f => f.type === 'biseau_montant' && iso(FX['1h'][f.debut][0]) === '2026-10-08T14:00'); })();
  check('1 h : plus de biseau montant commencé le 08/10 14:00 UTC (2 sommets à 690 – 1 855 $ sous leur droite entre eux)', ancienBiseau.length === 0, ancienBiseau.map(f => f.t));
  const brut15 = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'bougies-btcusdt-15m.json'), 'utf8')).bougies.map(k => [k[0] / 1000, +k[1], +k[2], +k[3], +k[4]]);
  for (const [nom, K] of [['15 min (revue)', FX['15m'].slice(-3000)], ['1 h (revue)', FX['1h']], ['15 min (fixture)', brut15]]) {
    const S = serie(K), R = G.detecter(S, P), F = R.formes.filter(f => G.famille(f) === 'lignes' && f.type !== 'range' && !f.doublon);
    const sans = [], dehors = [];
    for (const f of F) {
      for (const [pv, s] of [[f.pivotsH, 1], [f.pivotsB, -1]]) {
        if (pv.length !== 2) continue;
        let pres = Infinity;
        for (let j = pv[0].i + P.pivot + 1; j < pv[1].i - P.pivot; j++) {
          const u = G.ligne(f.hautL, j), d = G.ligne(f.basL, j), w = u - d, lim = Math.max(P.lignes.tolAtr * S.atr[f.t], P.lignes.approche * w);
          pres = Math.min(pres, (s > 0 ? u - S.h[j] : S.l[j] - d) - lim);
        }
        if (pres > 0 && pres !== Infinity) sans.push(f.type + '@' + iso(K[f.debut][0]));
      }
      // À sa naissance (avant tout recalage) : les clôtures de [début, t] dans la bande de sortie.
      if (!(f.journal || []).some(x => x.quoi === 'recalage')) {
        const b = Math.min(P.lignes.tolAtr, P.bandeAtr) * S.atr[f.t];
        for (let j = f.debut; j <= f.t; j++) if (S.c[j] > G.ligne(f.hautL, j) + b + 1e-9 || S.c[j] < G.ligne(f.basL, j) - b - 1e-9) { dehors.push(f.type + '@' + iso(K[f.debut][0]) + ' j' + j); break; }
      }
    }
    check(`${nom} : ${F.length} figures à deux droites ; aucune droite de 2 points sans retour du prix près d’elle`, F.length > 5 && !sans.length, sans.slice(0, 5));
    check(`${nom} : aucune clôture hors de la bande de sortie entre le début et la naissance`, !dehors.length, dehors.slice(0, 5));
  }
}

// ── 3. Bilan : un mouvement compté une fois ──
titre('3. Bilan : double et triple sur les mêmes creux, un seul cas');
{
  const K = FX['15m'].slice(-3000), R = G.detecter(serie(K), P);
  const D = R.formes.filter(f => /^double/.test(f.type) && !f.doublon && f.fin !== 'devenu_triple'), T = R.formes.filter(f => /^triple/.test(f.type) && !f.doublon);
  const paires = [];
  for (const d of D) for (const t of T) if (G.couvre(t, d) && d.jConf !== null && t.jConf !== null && d.jConf === t.jConf) paires.push(d.type + '@' + iso(K[d.jConf][0]));
  const tc = T.filter(t => t.jConf !== null && iso(K[t.jConf][0]) === '2026-10-09T02:00');
  check('09/10 02:00 UTC : le triple creux confirmé est compté, le double sur ses creux ne l’est pas', tc.length === 1 && !paires.length, { tc: tc.length, paires });
  const dbl = R.formes.filter(f => f.doublonDe);
  check(`le double vu deux fois est marqué doublon du triple (${dbl.length}) ; né à la même clôture que le triple, son ébauche finit « triple » (pas « devenue »)`, dbl.length >= 1
    && R.ebauches.liste.filter(e => /^double/.test(e.type) && e.fin === 'devenue' && e.devenue && e.devenue.doublonDe && e.devenue.t === e.devenue.doublonDe.t).length === 0, dbl.map(f => f.type + '@' + f.t + '/' + f.doublonDe.t));
}

// ── 4. Double devenu triple ──
titre('4. Double devenu triple : le triple prend la place, et le dit une fois');
{
  const K = FX['1h'], iT = idx(K, '2026-10-06T10:00');
  let memo = { parJ: new Map(), dernier: null }, cas = null, exp = null;
  rejouer(K, iT - 60, iT + 3, (i, res, n) => {
    const j = res.n - 1, L = G.formesDebutant(res, P, n - LARG, n, memo);
    const lib = x => (L.devenu === x ? G.libelleDevenuTriple(x) : G.libelleFormeDebutant(x));
    const f = L.find(x => { const t = lib(x); return t && t.length <= DEB.forme; }) || null;
    if (L.devenu) cas = { i, avant: memo.dernier, apres: f ? G.idFigure(f) : null, lib: f ? lib(f) : null, premier: L[0] === L.devenu };
    if (i === iT && L.devenu) {
      const ctx = { n: res.n, intervalle: '1h', duree: 86400 * 100, temps: K.map(k => k[0]), pas: 3600, maintenant: (K[i][0] + 1800) * 1000, j: i };
      cas.bulle = G.texteFormeDebutant(L.devenu, res.bilan[L.devenu.type], ctx, P, '$').join(' ');
      exp = G.formesAffichees(res, P, n - LARG, n, 'expert').map(x => x.type);
    }
    const id = f ? G.idFigure(f) : null;
    memo.parJ.set(j, id); memo.dernier = id;
  });
  check('06/10 10:00 UTC : le double creux dessiné devient le triple creux, en tête, « Devenu triple creux »', !!cas && /^double_creux/.test(cas.avant) && /^triple_creux/.test(cas.apres) && cas.premier && cas.lib === 'Devenu triple creux', cas);
  check('… la bulle le dit (« le double creux est devenu un triple creux »), sans mot banni', !!cas && /le double creux est devenu un triple creux/.test(cas.bulle || '') && !G.motsBannis(cas.bulle || '').length, cas && cas.bulle);
  check('… et l’Complet montre le triple creux (il passe devant la figure du même dernier point)', !!exp && exp.includes('triple_creux'), exp);
  // Après : le libellé redevient celui de l'état (dit une fois).
  const R2 = G.detecter(serie(K.slice(0, iT + 3)), P);
  const tr = R2.formes.concat(R2.ebauches.liste).find(x => /^triple_creux/.test(x.type) && x.deDouble);
  check('… une clôture plus tard, son libellé est celui de son état', !!tr && G.libelleFormeDebutant(tr) !== 'Devenu triple creux', tr && G.libelleFormeDebutant(tr));
}

// ── 5. Mots ──
titre('5. Mots : côté et prix de la ✗, mèche, cible, 1re clôture dehors, durées, ébauches');
{
  const ctx = { n: 200, intervalle: '1h', duree: 86400 * 30, temps: Array.from({ length: 300 }, (_, i) => 1790000000 + i * 3600), pas: 3600, maintenant: (1790000000 + 210 * 3600) * 1000, j: 200 };
  const lignes = { type: 'biseau_montant', sens: -1, fin: 'invalide', jFin: 150, raison: 'milieu', invalidation: 85447, journal: [{ j: 150, quoi: 'invalide', p: 85447, c: 85500 }] };
  const drap = { type: 'drapeau', sens: -1, fin: 'invalide', jFin: 150, raison: 'pause', invalidation: 84670, mat: { h: 900 }, journal: [{ j: 150, quoi: 'invalide', p: 84670, c: 84700 }] };
  const dD = G.marqueFin(lignes, ctx, 'debutant', '$'), dE = G.marqueFin(lignes, ctx, 'expert', '$'), fD = G.marqueFin(drap, ctx, 'debutant', '$'), fE = G.marqueFin(drap, ctx, 'expert', '$');
  check('✗ Lisible : « le prix a fini une heure au-dessus de 85 447 $ (le milieu de la figure) »', /le prix a fini une heure au-dessus de 85 447 \$ \(le milieu de la figure\)/.test(dD) && !/revenu au milieu/.test(dD), dD);
  check('✗ Complet : « clôture > 84 670 $ (haut de la pause) », jamais « au bout de la pause »', /clôture > 84 670 \$ \(haut de la pause\)/.test(fE) && !/au bout/.test(fE + fD + dE) && /au-dessus de 84 670 \$ \(le haut de la pause\)/.test(fD), [fE, fD, dE]);
  check('… sans prix répété', (dD.match(/85 447/g) || []).length === 1 && (fE.match(/84 670/g) || []).length === 1, [dD, fE]);
  check('état : « invalidé (clôture repassée au-dessus de son milieu) », « … au-dessus du haut de la pause »', G.etatForme(lignes).texte === 'invalidé (clôture repassée au-dessus de son milieu)' && G.etatForme(drap).texte === 'invalidé (clôture au-dessus du haut de la pause)', [G.etatForme(lignes).texte, G.etatForme(drap).texte]);
  // Mèche seule : la bougie en cours est passée sous la borne basse, le prix est revenu dedans.
  const f = { type: 'drapeau', famille: 'drapeau', sens: -1, hautL: { a: 84700, b: 0 }, basL: { a: 84200, b: 0 }, mat: { i0: 0, p0: 86000, i1: 5, p1: 84100, h: 1900 }, debutPause: 5, debut: 0, depart: 10,
    apex: Infinity, extremePause: 84700, bande: 20, tol: 100, phase: 'formation', journal: [] };
  const v = G.figureVivante(f, null, 20, { high: 84400, low: 84150 }, 84300, P);
  const lv = G.libelleVivantDebutant(f, v, DEB.forme);
  check('mèche seule sous la borne (prix revenu à 84 300 $) : « Drapeau : revenu dedans », pas « sort en bas ? »', v.etiq === 'meche' && lv === 'Drapeau : revenu dedans' && !/sort/.test(lv), [v.etiq, lv]);
  const v2 = G.figureVivante(f, null, 20, { high: 84400, low: 84150 }, 84160, P);
  check('… prix au-delà maintenant : « Drapeau : sort en bas ? »', v2.etiq === 'sortie' && G.libelleVivantDebutant(f, v2, DEB.forme) === 'Drapeau : sort en bas ?', [v2.etiq, G.libelleVivantDebutant(f, v2, DEB.forme)]);
  const atteints = G.TYPES.map(t => G.libelleFormeDebutant({ type: t, sens: 1, fin: 'atteint', jFin: 1 }));
  check('« cible atteinte » garde le nom, ≤ ' + DEB.forme + ' caractères, pour les 16 types', atteints.every((t, k) => t && t.length <= DEB.forme && t.includes(G.NOM_FORME_DEBUTANT[G.TYPES[k]])), atteints);
  // 1re clôture dehors sur une droite en pente : le seuil de SA bougie, puis celui d'en ce moment.
  const fb = { type: 'biseau_montant', famille: 'lignes', hautL: { a: 80000, b: 10 }, basL: { a: 79000, b: 12 }, debut: 0, depart: 60, apex: 1000, bande: 20, tol: 100, phase: 'formation', hauteur: 1000,
    demi: true, demiSens: -1, jDemi: 100, journal: [{ j: 100, quoi: 'demi', s: -1, c: 80150, seuil: 80180 }] };
  const tB = G.texteFormeDebutant(fb, null, Object.assign({}, ctx, { j: 110, n: 110 }), P, '$').join(' ');
  check('1re clôture dehors : « il a fini une heure sous 80 180 $, le niveau de la ligne à ce moment-là », puis le seuil d’en ce moment (80 300 $)', /il a fini une heure sous 80 180 \$, le niveau de la ligne à ce moment-là/.test(tB) && /sous 80 300 \$ en ce moment/.test(tB), tB);
  const fc = { type: 'double_sommet', famille: 'extremes', sens: -1, phase: 'confirme', jConf: 120, invalidation: 85000, objectif: 83000, niveau: 84000, a: { i: 10, p: 85000 }, b: { i: 30, p: 84990 }, journal: [] };
  const tC = G.texteFormeDebutant(fc, null, ctx, P, '$').join(' ');
  check('confirmée : « Figure validée … » (accord avec « figure »)', /Figure validée /.test(tC) && !/(^|\. )Validée /.test(tC), tC);
  check('durée de l’historique : « 500 j, soit 1,4 an », sans parenthèses imbriquées', G.duree(500 * 86400) === '500 j, soit 1,4 an' && G.duree(1000 * 86400) === '1 000 j, soit 2,7 ans', [G.duree(500 * 86400), G.duree(1000 * 86400)]);
  // Complet : les ébauches annulées à part des figures invalidées.
  const eb = { type: 'double_sommet', ebauche: true, s: -1, fin: 'abandon', jFin: 140, raison: 'depasse', pAbandon: 85100, abandonP: 85050, journal: [] };
  const tx = G.texteFormeExpert(fc, null, ctx, P, '$', { tombees: [lignes, eb] }).join(' ');
  check('Complet : « Invalidées récemment » ne cite que des figures ; les ébauches annulées ont leur ligne', /Invalidées récemment \(ce graphique\) : Biseau montant/.test(tx) && !/Invalidées récemment[^.]*ébauche/.test(tx) && /Ébauches annulées récemment \(jamais devenues des figures\) : Double sommet/.test(tx), tx);
}

// ── 6. Trait d'invalidation ──
titre('6. Tracé : le trait d’invalidation d’une figure confirmée');
{
  const geo = vm.runInContext('guideFigureGeo', page.sandbox);
  const conf = { type: 'double_sommet', famille: 'extremes', sens: -1, phase: 'confirme', jConf: 120, invalidation: 85000, objectif: 83000, niveau: 84000, a: { i: 10, p: 85000 }, b: { i: 30, p: 84990 }, cou: { i: 20, p: 84000 }, journal: [] };
  const g1 = geo(conf, 140, null), g2 = geo(Object.assign({}, conf, { fin: 'invalide', jFin: 133 }), 133, null), g3 = geo(Object.assign({}, conf, { fin: 'atteint', jFin: 133 }), 133, null), g4 = geo(Object.assign({}, conf, { phase: 'formation', jConf: null }), 140, null);
  check('vivante : de la validation (120) à la bougie en cours (140), au prix d’invalidation', JSON.stringify(g1.inval) === JSON.stringify([[120, 85000], [140, 85000]]), g1.inval);
  check('tombée : jusqu’à sa chute (la ✗ au bout) ; cible atteinte ou pas encore confirmée : aucun trait', JSON.stringify(g2.inval) === JSON.stringify([[120, 85000], [133, 85000]]) && g3.inval === null && g4.inval === null, [g2.inval, g3.inval, g4.inval]);
}

// ── 7. Rejeu par tranches ──
titre('7. Rejeu à froid par tranches = rejeu complet');
for (const itv of ['15m', '1h']) {
  const K = itv === '15m' ? FX['15m'].slice(-3000) : FX['1h'], S = serie(K), T = P.froidTranche;
  let part = null; const t = [];
  for (let m = Math.min(S.n, T); ; m = Math.min(S.n, m + T)) {
    const t0 = process.hrtime.bigint(); part = G.detecter(Object.assign({}, S, { n: m }), P, part); t.push(Number(process.hrtime.bigint() - t0) / 1e6);
    if (m >= S.n) break;
  }
  const plein = G.detecter(S, P);
  check(`${itv} : ${t.length} tranches de ${T} bougies = rejeu complet (mêmes figures, ébauches, bilan)`, T > 0 && T < S.n && plein.formes.length === part.formes.length && plein.ebauches.liste.length === part.ebauches.liste.length && JSON.stringify(plein.bilan) === JSON.stringify(part.bilan));
  console.log(`  · tranches (ms, processus déjà chaud) : ${t.map(x => x.toFixed(1)).join(' ')} — la plus longue ${Math.max(...t).toFixed(1)} ms (mesure affichée)`);
}

// ── 8. Page ──
let playwright = null;
for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) { try { playwright = require(p); break; } catch (e) { /* suivant */ } }
const DATA = { '15m': FX['15m'], '1h': FX['1h'] }, PAS = { '15m': 900, '1h': 3600 };
function binance(url) {
  const u = new URL(url), q = u.searchParams, itv = q.get('interval') || '15m', k = DATA[itv] || DATA['15m'], pas = (PAS[itv] || 900) * 1000, x = k[k.length - 1];
  if (u.pathname.endsWith('/klines')) {
    const lim = Math.min(1000, +q.get('limit') || 500), fin = q.get('endTime') ? +q.get('endTime') : Infinity;
    return k.filter(y => y[0] * 1000 <= fin).slice(-lim).map(y => [y[0] * 1000, String(y[1]), String(y[2]), String(y[3]), String(y[4]), '100', y[0] * 1000 + pas - 1, '0', 100, '0', '0', '0']);
  }
  if (u.pathname.endsWith('/ticker/24hr')) return { symbol: 'BTCUSDT', lastPrice: String(x[4]), openPrice: String(x[1]), priceChangePercent: '0', highPrice: String(x[2]), lowPrice: String(x[3]), volume: '1', quoteVolume: '1', count: 1 };
  if (u.pathname.endsWith('/ticker/price')) return { price: String(x[4]) };
  if (u.pathname.endsWith('/time')) return { serverTime: x[0] * 1000 + 300000 };
  return {};
}
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const serveur = http.createServer((req, res) => {
  const f = path.join(REPO, decodeURIComponent(req.url.split('?')[0]));
  if (!f.startsWith(REPO) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
(async () => {
  titre('8. Page : 1re visite d’un intervalle, le rejeu se fait par tranches, puis s’arrête');
  if (!playwright) { console.log('  − NON EXÉCUTÉ : Playwright introuvable.'); ko++; }
  else {
    await new Promise(r => serveur.listen(0, '127.0.0.1', r));
    const nav = await playwright.chromium.launch();
    try {
      const x = DATA['15m'][DATA['15m'].length - 1];
      const ctx = await nav.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
      await ctx.clock.install({ time: x[0] * 1000 + 300000 });
      const pg = await ctx.newPage(), erreurs = [];
      pg.on('pageerror', e => erreurs.push(e.message));
      await pg.route('**/*', r => {
        const u = r.request().url(), h = new URL(u).host, cors = { 'access-control-allow-origin': '*' };
        if (h.startsWith('127.0.0.1')) return r.continue();
        if (h === 'api.binance.com' || h === 'data-api.binance.vision') return r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: JSON.stringify(binance(u)) });
        return r.fulfill({ status: 404, headers: cors, body: '' });
      });
      await pg.addInitScript(() => { try { localStorage.clear(); localStorage.setItem('samsara-theme', 'aero'); localStorage.setItem('samsara-mode', 'expert'); localStorage.setItem('samsara-scenarios-v1', '0'); } catch (e) { /* */ } });
      await pg.goto(`http://127.0.0.1:${serveur.address().port}/index.html`);
      await pg.waitForFunction(() => typeof candles !== 'undefined' && candles.length > 100 && typeof guideEtat !== 'undefined' && guideEtat, null, { timeout: 15000 }).catch(() => erreurs.push('page non prête'));
      await pg.waitForTimeout(1500);
      await pg.evaluate(() => {
        window.__rejeux = [];
        const d0 = Guide.detecter;
        Guide.detecter = function (S, Pp, avant) { const t0 = performance.now(), r = d0.apply(this, arguments); window.__rejeux.push({ itv: chartInterval, n: S.n, repris: !!avant, avantN: avant ? avant.n : 0, ms: performance.now() - t0 }); return r; };
      });
      await pg.evaluate(() => { const l = document.getElementById('int_1h'); changeInterval('1h', l || document.createElement('label')); });
      await pg.waitForFunction(() => chartInterval === '1h' && candles.length > 1000 && GUIDE_FROID === null && GUIDE_FORMES.val && GUIDE_FORMES.val.n === candles.length - 1, null, { timeout: 20000 }).catch(() => erreurs.push('rejeu 1 h non fini'));
      await pg.waitForTimeout(500);
      const o = await pg.evaluate(() => ({ rj: window.__rejeux.filter(x => x.itv === '1h'), n: candles.length - 1, tranche: PARAM.guide.froidTranche, froid: GUIDE_FROID, val: !!GUIDE_FORMES.val, figures: guideEtat && guideEtat.figures ? guideEtat.figures.length : -1 }));
      const pas = o.rj.map(x => x.n - x.avantN);
      check(`1 h, 1re visite (${o.n} bougies closes) : ${o.rj.length} rejeux, chacun ≤ ${o.tranche} bougies nouvelles (aucun rejeu complet dans une image)`, o.rj.length >= Math.ceil(o.n / o.tranche) && pas.every(p => p <= o.tranche), { pas: pas.slice(0, 20), rj: o.rj.slice(0, 3) });
      console.log(`  · tranches dans Chromium (ms) : ${o.rj.map(x => x.ms.toFixed(1)).join(' ')}`);
      check('… puis plus rien ne tourne (pas de tranche en attente) ; les formes de la série sont là, figures dessinées', o.froid === null && o.val && o.figures >= 0, o);
      const apres = await pg.evaluate(async () => { const k = window.__rejeux.length; await new Promise(r => setTimeout(r, 1500)); return window.__rejeux.length - k; });
      check('… au repos, aucun rejeu de plus', apres === 0, apres);
      check('aucune erreur JavaScript', !erreurs.length, erreurs);
      await ctx.close();
    } catch (e) { check('déroulé du test', false, e.message); }
    finally { await nav.close(); serveur.close(); }
  }
  console.log(ko ? `\n❌ FIGURES (REVUE 2) : ${ko} contrôle(s) en échec` : '\n✅ FIGURES (REVUE 2) : TOUS LES CONTRÔLES PASSENT');
  process.exit(ko ? 1 : 0);
})();
