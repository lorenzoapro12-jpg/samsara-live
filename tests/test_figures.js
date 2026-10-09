// Figures chartistes (js/guide.js, §4) — hors ligne, sur les 3 000 bougies 15 min réelles de la
// fixture et sur des séries fabriquées.
//
// CE QUI EST VÉRIFIÉ (plan figures §9.1 et amendements de la critique)
//   1. les 16 types sont trouvés sur la fixture ; chaque figure garde son type, son objectif suit la
//      convention de sa famille, ses invalidations ont une raison de sa famille ; sans suite à la pointe ;
//   1 bis. (A2) chaque niveau annoncé est celui que la machine applique : une clôture fabriquée juste
//      au-delà (+ε) fait ce que la bulle dit (demi, confirmé, invalidé, atteint), juste en deçà (−ε) rien ;
//   2. règles d'élimination (tendance d'avant, épaules, pointe trop proche, pivots serrés, pause trop
//      large, jamais d'élargissement) ;
//   3. recalages (droites refaites, même type, journal) ; double → triple (absent des confirmés) ;
//      (A3) un retour remis à zéro quand la sortie est annulée ;
//   4. aucun regard vers l'avenir, pour les 16 types et les ébauches, issues comprises ;
//   5. bilan : comptes cohérents, ébauches → figures → confirmées, témoin, aucun « % » ;
//   6. mots : libellés Débutant ≤ PARAM.guide.debutant.forme et sans mot banni ; Expert ≤ 80 ; bulles
//      avec validation, invalidation, cible « non garantie » et « Mesuré sur » ; mêmes valeurs dans les
//      deux modes ; heure de Paris en Débutant, jamais « UTC » ; aucun conseil ni intention ; (C7) des
//      définitions sans sens attendu ;
//   7. états vivants (figureVivante) : « franchi », « percé en mèche », jamais un changement d'état ;
//      (A1) une ébauche ne naît qu'à une clôture ;
//   8. sélection : Débutant entière dans la vue et rangée, Expert ≤ formesMax sans recouvrement d'une
//      même famille, une figure tombée montrée garderInvalide bougies puis plus ;
//   9. temps : rejeu des 3 000 bougies ≤ 60 ms (moyenne de 5 après un appel), figureVivante ≤ 1 ms.
// USAGE   node tests/test_figures.js
const fs = require('fs'), path = require('path'), vm = require('vm');
const REPO = path.resolve(__dirname, '..');
const G = require(path.join(REPO, 'js/guide.js'));
const { chargerPage } = require('./bac');

let ko = 0;
const check = (nom, ok, det) => { if (!ok) ko++; console.log(`  ${ok ? '✓' : '✗'} ${nom}${!ok && det !== undefined ? ' — ' + JSON.stringify(det).slice(0, 600) : ''}`); };
const titre = t => console.log(`\n── ${t} ──`);
const CONSEIL = /\b(achetez|vendez|achète[rz]?\b|vends\b|il faut (?:acheter|vendre)|entrez|sortez|prenez position|signal d['’]achat|signal de vente|recommand(?:e|ons))/i;
const ACCUSE = /spoof|manipul|leurre|tromper|tromperie|faux (?:mur|ordre)s?|fake|bluff|pi[eè]ge/i;
const C7 = /annonce|souvent suivi|devrait|signal/i;

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
function serie(chemin, d) {
  const C = chemin.slice(), H = [], L = [];
  for (let i = 0; i < C.length; i++) { const o = i ? (C[i - 1] + C[i]) / 2 : C[0]; H.push(Math.max(o, C[i]) + d); L.push(Math.min(o, C[i]) - d); }
  return { H, L, C };
}
const lin = (a, b, n) => Array.from({ length: n }, (_, i) => a + (b - a) * (i + 1) / n);
const clone = x => structuredClone(x);

// La fixture : 3 000 bougies 15 min réelles (ms, o, h, l, c, v).
const brut = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'bougies-btcusdt-15m.json'), 'utf8')).bougies;
const H = brut.map(k => +k[2]), L = brut.map(k => +k[3]), C = brut.map(k => +k[4]), T = brut.map(k => Math.round(k[0] / 1000));
const A = atrDe(H, L, C, P.atrPeriode), NN = C.length;
const S = { h: H, l: L, c: C, atr: A, n: NN };
const R = G.detecter(S, P);
const tronque = n => G.detecter({ h: H, l: L, c: C, atr: A, n }, P);
const ctxDe = n => ({ n, intervalle: '15m', duree: T[n - 1] - T[0], temps: T, pas: 900, maintenant: (T[n - 1] + 900) * 1000, j: n, horizon: P.horizon });
const fam = f => G.famille(f);

// ── 1. Les 16 types ──
titre('1. Les 16 types sur la fixture : type, objectif, invalidations, sans suite');
{
  const manque = G.TYPES.filter(t => !R.formes.some(f => f.type === t));
  check(`les ${G.TYPES.length} types sont trouvés sur la fixture (${R.formes.length} figures, ${R.ebauches.liste.length} ébauches)`, G.TYPES.length === 16 && !manque.length, manque);
  // Un type à deux droites garde la classe de ses droites (à sa naissance, ou à son dernier recalage).
  const mal = R.formes.filter(f => fam(f) === 'lignes' && f.type !== 'range').filter(f => G.classer(f.hautL, f.basL, f.debut, f.tMaj || f.t, A[f.tMaj || f.t], P) !== f.type
    && !/^canal/.test(f.type));
  check('triangles et biseaux : la classe de leurs droites est leur type (un triangle ascendant n’est pas un biseau)', !mal.length, mal.map(f => [f.type, f.debut, f.t]));
  const mauvaisObj = [], raisons = [];
  for (const f of R.formes) {
    if (f.jConf !== null && f.jConf !== undefined && f.phase === 'confirme') {
      const base = fam(f) === 'drapeau' ? f.mat.h : f.hauteur;
      if (Math.abs(f.objectif - (f.niveau + f.sens * base)) > 1e-6) mauvaisObj.push([f.type, f.jConf, f.objectif, f.niveau, base]);
    }
    if (f.fin === 'invalide' || f.fin === 'invalide_avant') {
      const ok = { extremes: ['extreme'], ete: f.fin === 'invalide' ? ['epaule'] : ['tete'], lignes: ['milieu'], drapeau: f.fin === 'invalide' ? ['pause'] : ['recul', 'sortie_contraire'] }[fam(f)];
      if (!ok.includes(f.raison)) raisons.push([f.type, f.fin, f.raison]);
    }
  }
  check('objectif théorique = ligne franchie + hauteur (doubles, triples, ETE, deux droites) ou mât (drapeaux), dans le sens de la sortie', !mauvaisObj.length, mauvaisObj.slice(0, 5));
  check('invalidations : extrême (doubles, triples), tête puis épaule (ETE), milieu (deux droites), recul ou sortie contraire puis bout de la pause (drapeaux)', !raisons.length, raisons.slice(0, 5));
  const pointes = R.formes.filter(f => f.fin === 'expire_avant' && f.raison === 'pointe');
  check(`sans suite à la pointe (${pointes.length} cas) : jamais avant la pointe`, pointes.length > 0 && pointes.every(f => f.jFin >= f.apex), pointes.map(f => [f.type, f.jFin, f.apex]));
  // Repérable : à sa naissance, ou (figure née d'une ébauche vue à l'écran) à celle de son ébauche.
  const confAvant = R.formes.filter(f => f.jConf !== null && f.jConf <= (f.depuisEbauche ? f.t0Ebauche : f.t));
  check('aucune figure comptée n’est confirmée avant d’être repérable (à sa naissance, ou à celle de l’ébauche dont elle vient)', !confAvant.length, confAvant.map(f => [f.type, f.t, f.jConf]));
  const viaEb = R.formes.filter(f => f.depuisEbauche);
  check(`figures nées d'une ébauche déjà sortie (${viaEb.length}) : l'ébauche de même identité était vivante et est « devenue » cette figure`, viaEb.every(f => R.ebauches.liste.some(e => e.devenue === f && e.t0 === f.t0Ebauche)), viaEb.map(f => [f.type, f.t]));
}

// ── 1 bis. Le niveau annoncé est celui que la machine applique (A2) ──
titre('1 bis. ±ε : chaque niveau annoncé fait ce que la bulle dit');
{
  const eps = 0.01, ecarts = [];
  let essais = 0;
  const parType = {};
  // Une clôture fabriquée à j (après les bougies closes 0..j−1), sans mèche.
  const avecCloture = (j, c) => ({ h: H.slice(0, j).concat([c]), l: L.slice(0, j).concat([c]), c: C.slice(0, j).concat([c]), atr: A, n: j + 1 });
  for (const f0 of R.formes) {
    if (f0.doublon || (parType[f0.type] || 0) >= 3) continue;
    // L'état de la figure à la clôture j − 1 : le rejeu tronqué (rien d'après).
    const j = f0.t + 2;
    if (j >= NN - 1 || (f0.fin && f0.jFin < j)) continue;
    const g = tronque(j).formes.find(x => G.cleFigure(x) === G.cleFigure(f0) && x.t === f0.t);
    if (!g || g.fin) continue;
    parType[f0.type] = (parType[f0.type] || 0) + 1;
    const N = G.niveauxFigure(g, j, P);
    const jouer = c => { const x = clone(g); G.avancer(x, j, avecCloture(j, c), P); return x; };
    for (const x of N.sorties) {
      essais++;
      const dehors = jouer(x.seuil + x.s * eps), dedans = jouer(x.seuil - x.s * eps);
      const attendu = g.demi && g.demiSens === x.s ? dehors.phase === 'confirme' : dehors.demi && dehors.demiSens === x.s;
      const rien = dedans.demi === g.demi && dedans.phase === g.phase && !dedans.fin || (g.demi && !dedans.demi);   // en deçà : rien (ou retour annulé, jamais une sortie)
      if (!attendu || !rien || (dedans.demi && !g.demi)) ecarts.push(['sortie', g.type, x.s, x.seuil, dehors.phase, dehors.demi, dedans.demi]);
    }
    for (const iv of N.invals.filter(v => v.clotures === 1)) {
      essais++;
      const dehors = jouer(iv.p + iv.s * eps), dedans = jouer(iv.p - iv.s * eps);
      if (!dehors.fin || !/^invalide/.test(dehors.fin) || dehors.raison !== iv.raison || (dedans.fin && /^invalide/.test(dedans.fin) && dedans.raison === iv.raison)) ecarts.push(['invalidation', g.type, iv.raison, iv.p, dehors.fin, dehors.raison, dedans.fin, dedans.raison]);
    }
  }
  // Figures confirmées : invalidation et objectif, à la clôture qui suit leur confirmation.
  const conf = {};
  for (const f0 of R.formes) {
    if (f0.jConf === null || f0.doublon || (conf[f0.type] || 0) >= 2) continue;
    const j = f0.jConf + 1;
    if (j >= NN - 1 || (f0.fin && f0.jFin < j)) continue;
    const g = tronque(j).formes.find(x => G.cleFigure(x) === G.cleFigure(f0) && x.t === f0.t);
    if (!g || g.fin || g.phase !== 'confirme') continue;
    conf[f0.type] = (conf[f0.type] || 0) + 1;
    const N = G.niveauxFigure(g, j, P), jouer = c => { const x = clone(g); G.avancer(x, j, avecCloture(j, c), P); return x; };
    const iv = N.invals[0], o = N.objectifs[0];
    essais += 2;
    const i1 = jouer(iv.p + iv.s * eps), i2 = jouer(iv.p - iv.s * eps), o1 = jouer(o.p + o.s * eps), o2 = jouer(o.p - o.s * eps);
    if (i1.fin !== 'invalide' || i2.fin === 'invalide') ecarts.push(['invalidation après confirmation', g.type, iv.p, i1.fin, i2.fin]);
    if (o1.fin !== 'atteint' || o2.fin === 'atteint') ecarts.push(['objectif', g.type, o.p, o1.fin, o2.fin]);
  }
  check(`${essais} niveaux annoncés, ${Object.keys(parType).length} types vivants et ${Object.keys(conf).length} types confirmés : +ε fait ce que la bulle dit, −ε ne change rien`, essais > 40 && !ecarts.length, ecarts.slice(0, 6));
  // Ébauches de doubles et triples : le niveau d'abandon dit (autres sommets + tol figée) est celui appliqué.
  const ab = R.ebauches.liste.filter(e => e.fin === 'abandon' && e.raison === 'depasse');
  check(`ébauches abandonnées par un nouvel extrême (${ab.length}) : toujours au-delà du niveau d’abandon annoncé, tol figée à la naissance`, ab.length > 0
    && ab.every(e => (e.s > 0 ? e.pAbandon > e.abandonP : e.pAbandon < e.abandonP) && Math.abs(e.tol - P.tolAtr * e.atr0) < 1e-9), ab.slice(0, 3).map(e => [e.type, e.pAbandon, e.abandonP]));
}

// ── 2. Règles d'élimination ──
titre('2. Règles d’élimination');
{
  const piv = G.pivots(H, L, P.pivot, NN);
  const connus = (l, t) => l.filter(x => x.c <= t);
  const avec = (cle, sous) => Object.assign({}, P, { [cle]: Object.assign({}, P[cle], sous) });
  const etes = R.formes.filter(f => fam(f) === 'ete');
  const refaire = (f, Q) => G.ete(connus(piv.hauts, f.t), connus(piv.bas, f.t), H, L, C, f.t, A[f.t], Q, f.sens);
  check(`ETE (${etes.length}) : retrouvée avec les seuils de la page`, etes.length > 0 && etes.every(f => { const g = refaire(f, P); return g && g.T.i === f.T.i; }), etes.map(f => [f.type, f.t]));
  check('ETE sans tendance d’avant : refusée (tendanceH très grand)', etes.every(f => !refaire(f, avec('ete', { tendanceH: 1e6 }))));
  check('ETE aux épaules dissemblables : refusée (épaules à 0 ATR l’une de l’autre exigées)', etes.every(f => { const g = refaire(f, avec('ete', { epaulesAtr: 0 })); return !g || g.T.i !== f.T.i; }));
  // Deux droites : la pointe trop proche, des pivots serrés.
  const dd = R.formes.filter(f => fam(f) === 'lignes' && f.type !== 'range' && !f.tMaj);
  // (Une figure née de son ébauche garde la tolérance figée de celle-ci : son ATR de naissance, atrN.)
  const refaireL = (f, Q) => G.deuxDroites(connus(piv.hauts, f.t), connus(piv.bas, f.t), H, L, C, f.t, f.atrN || A[f.t], Q);
  check(`deux droites (${dd.length}) : retrouvées avec les seuils de la page`, dd.length > 0 && dd.every(f => { const g = refaireL(f, P); return g && g.type === f.type; }), dd.filter(f => { const g = refaireL(f, P); return !g || g.type !== f.type; }).map(f => [f.type, f.t]));
  check('triangle ou biseau repéré trop près de sa pointe (avancementMax = 0) : refusé', dd.filter(f => isFinite(f.apex)).every(f => { const g = refaireL(f, avec('lignes', { avancementMax: 0 })); return !g || !isFinite(g.apex) || g.debut !== f.debut; }));
  check('droites à pivots serrés (étalement exigé > 100 %) : refusées', dd.every(f => !refaireL(f, avec('lignes', { etalement: 1.01 }))));
  // Le triangle du contrôle historique (droites qui se resserrent trop vite) : repéré trop tard, refusé.
  const pts = [100, 110, 101.5, 108.5, 103, 107, 104.5, 106], ch = [...lin(100, 100, 10)];
  for (let k = 1; k < pts.length; k++) ch.push(...lin(pts[k - 1], pts[k], 6));
  ch.push(...lin(106, 105.2, 3));
  const s = serie(ch, 0.2), rs = G.detecter({ h: s.H, l: s.L, c: s.C, atr: atrDe(s.H, s.L, s.C, P.atrPeriode), n: s.C.length }, P);
  check('triangle fabriqué repéré à plus de ' + Math.round(P.lignes.avancementMax * 100) + ' % du chemin vers sa pointe : aucun triangle', !rs.formes.some(f => /^triangle/.test(f.type)), rs.formes.map(f => f.type));
  // Élargissement : deux droites qui s'écartent ne font jamais une figure.
  const ecarte = G.classer({ a: 100, b: 0.2 }, { a: 95, b: -0.2 }, 0, 40, 1, P);
  const larg = R.formes.filter(f => fam(f) === 'lignes' && f.type !== 'range' && !/^canal/.test(f.type)).filter(f => G.ligne(f.hautL, f.t) - G.ligne(f.basL, f.t) > G.ligne(f.hautL, f.debut) - G.ligne(f.basL, f.debut));
  check('deux droites qui s’écartent : jamais rendues (classer → null ; aucun triangle ni biseau qui s’élargit sur la fixture)', ecarte === null && !larg.length, [ecarte, larg.length]);
  // Drapeaux : pause plus large que la moitié du mât refusée.
  const dr = R.formes.filter(f => fam(f) === 'drapeau');
  const refaireD = (f, Q) => G.drapeau(connus(piv.hauts, f.t), connus(piv.bas, f.t), H, L, C, f.t, A[f.t], Q, f.sens, null);
  check(`drapeaux et fanions (${dr.length}) : retrouvés ; une pause plus large que permis (largeur = 0 × mât) : refusée`, dr.length > 0 && dr.every(f => { const g = refaireD(f, P); return g && g.mat.i1 === f.mat.i1; })
    && dr.every(f => { const g = refaireD(f, avec('drapeau', { largeur: 0 })); return !g || g.mat.i1 !== f.mat.i1; }));
}

// ── 3. Recalages, double → triple, retour remis à zéro ──
titre('3. Recalages, double → triple, retour remis à zéro (A3)');
{
  const rec = R.formes.filter(f => (f.journal || []).some(x => x.quoi === 'recalage'));
  const recL = rec.filter(f => fam(f) === 'lignes');
  check(`recalages (${rec.length} figures) : droites refaites, même type, début inchangé, noté au journal avec les bornes avant / après`, rec.length > 0
    && recL.every(f => { const x = f.journal.find(y => y.quoi === 'recalage'); return f.tMaj && x.avant && x.apres && (/^canal/.test(f.type) || G.classer(f.hautL, f.basL, f.debut, f.tMaj, A[f.tMaj], P) === f.type); }), rec.map(f => f.type));
  const devenus = R.formes.filter(f => f.fin === 'devenu_triple'), triples = R.formes.filter(f => f.depuisDouble);
  check(`double → triple (${devenus.length}) : le double finit « devenu un triple » (jamais ✗), le triple le cite ; compté repéré, jamais confirmé`, devenus.length > 0
    && devenus.every(f => f.jConf === null && triples.some(g => g.depuisDouble === f && g.t === f.jFin))
    && ['double_sommet', 'double_creux'].every(t => R.bilan[t].devenusTriples === devenus.filter(f => f.type === t).length));
  check('un double devenu triple n’est pas montré barré : formesAffichees ne le rend jamais', [NN - 1].concat(devenus.map(f => f.jFin)).every(j => !G.formesAffichees(Object.assign({}, R, { n: j + 1 }), P, j - 60, j + 1, 'expert').some(f => f.fin === 'devenu_triple')));
  // A3 : demi → retour → clôture loin dedans (sortie annulée) → nouveau demi → 2e clôture : pas « par un retour ».
  const base = [...lin(110, 110, 20), ...lin(110, 100, 10), ...lin(100, 106, 8), ...lin(106, 99.9, 8), ...lin(99.9, 104, 6)];
  const s0 = serie(base, 0.4), r0 = G.detecter({ h: s0.H, l: s0.L, c: s0.C, atr: atrDe(s0.H, s0.L, s0.C, P.atrPeriode), n: s0.C.length }, P);
  const f0 = r0.formes.find(f => f.type === 'double_creux' && !f.fin);
  if (!f0) check('A3 : double creux fabriqué trouvé', false, r0.formes.map(f => f.type));
  else {
    const N0 = f0.niveau, b0 = f0.bande, suite = [N0 + b0 + 1, N0 + b0 * 0.5, N0 - 3, N0 + b0 + 1, N0 + b0 + 1.6];
    const s1 = serie(base.concat(suite), 0.4), r1 = G.detecter({ h: s1.H, l: s1.L, c: s1.C, atr: atrDe(s1.H, s1.L, s1.C, P.atrPeriode), n: s1.C.length }, P);
    const f1 = r1.formes.find(f => f.type === 'double_creux' && f.a.i === f0.a.i);
    const quoi = f1 ? f1.journal.map(x => x.quoi) : [];
    check('A3 : demi → retour → sortie annulée → demi → confirmé : « retest » faux (le retour d’avant ne compte plus)', f1 && f1.phase === 'confirme' && f1.retest === false
      && quoi.join(',').includes('demi,retour,sortie_annulee,demi,confirme'), f1 && { quoi, retest: f1.retest });
  }
}

// ── 4. Aucun regard vers l'avenir ──
titre('4. Aucun regard vers l’avenir : 16 types et ébauches, issues comprises');
{
  const cle = f => [f.type, f.debut, f.t, f.depart].join('|');
  const ce = e => [e.type, e.cle, e.t0].join('|');
  for (const N of [Math.floor(NN * 0.5), Math.floor(NN * 0.8)]) {
    const r = tronque(N);
    const a1 = R.formes.filter(f => f.t < N).map(cle), a2 = r.formes.map(cle);
    const okF = a1.length === a2.length && a1.every((x, i) => x === a2[i]);
    const okFin = R.formes.filter(f => f.fin && f.jFin < N).every(f => { const g = r.formes.find(x => cle(x) === cle(f)); return g && g.fin === f.fin && g.jFin === f.jFin && g.raison === f.raison; });
    const e1 = R.ebauches.liste.filter(e => e.t0 < N).map(ce), e2 = r.ebauches.liste.map(ce);
    const okE = e1.length === e2.length && e1.every((x, i) => x === e2[i]);
    const okEF = R.ebauches.liste.filter(e => e.fin && e.jFin < N).every(e => { const g = r.ebauches.liste.find(x => ce(x) === ce(e)); return g && g.fin === e.fin && g.jFin === e.jFin; });
    const types = new Set(r.formes.map(f => f.type));
    check(`N = ${N} : ${a2.length} figures (${types.size} types) et ${e2.length} ébauches nées avant N, identiques sans la suite ; leurs issues connues avant N aussi`, okF && okFin && okE && okEF, { okF, okFin, okE, okEF });
  }
}

// ── 5. Bilan ──
titre('5. Bilan : comptes, ébauches, témoin, aucun pourcentage');
{
  const b = R.bilan, ctx = ctxDe(NN);
  check('confirmés = atteints + invalidés + sans issue + ouverts, pour les 16 types', G.TYPES.every(k => b[k].confirmes === b[k].atteints + b[k].invalides + b[k].expires + b[k].ouverts), G.TYPES.map(k => [k, b[k]]));
  check('ébauches : devenues ≤ ébauches, confirmées ≤ devenues, pour chaque type', G.TYPES.every(k => b[k].ebauches.devenues <= b[k].ebauches.n && b[k].ebauches.confirmees <= b[k].ebauches.devenues));
  check('un témoin (repère sans forme) pour chaque type confirmé', G.TYPES.every(k => !b[k].confirmes || b[k].temoin.departs > 0));
  const tx = G.TYPES.flatMap(k => ['expert', 'expertCourt', 'debutant'].map(m => G.texteBilan(b[k], ctx, P, m)));
  // Le seul « % » permis : le niveau de l'intervalle de Wilson (Expert), jamais un taux ni une probabilité.
  const pc = x => /%/.test(x.replace(/Wilson 95 %/g, ''));
  check('« échantillon faible » sous ' + P.echantillonFaible + ' cas, aucun « % » dans les bilans (hors « Wilson 95 % » en Expert)', G.TYPES.filter(k => b[k].confirmes < P.echantillonFaible).every(k => /faible/.test(G.texteBilan(b[k], ctx, P, 'expert')))
    && !tx.some(pc) && !G.TYPES.some(k => /%/.test(G.texteBilan(b[k], ctx, P, 'debutant'))), tx.filter(pc));
}

// ── 6. Mots ──
titre('6. Mots : libellés, bulles, mêmes valeurs, heures');
{
  // Tous les libellés Débutant, pour chaque type et chaque état (et les libellés vivants).
  const etats = [{ ebauche: true, s: 1, pend: { i: 0, p: 1, reste: 1 } }, { phase: 'formation' }, { demi: true, demiSens: 1 }, { demi: true, demiSens: -1 }, { phase: 'confirme', sens: 1 }, { phase: 'confirme', sens: -1 },
    { fin: 'invalide' }, { fin: 'invalide_avant' }, { ebauche: true, fin: 'abandon', s: 1 }, { fin: 'expire_avant', raison: 'pointe' }, { fin: 'atteint' }, { fin: 'expire' }];
  const lib = new Set();
  for (const type of G.TYPES) for (const e of etats) { const l = G.libelleFormeDebutant(Object.assign({ type, sens: 1 }, e)); if (l) lib.add(l); }
  for (const l of Object.values(G.LIBELLES_VIVANTS)) lib.add(l);
  // Les libellés vivants (nom + état du moment) de chaque type et de chaque état vivant.
  for (const type of G.TYPES) for (const e of etats.filter(x => !x.fin)) for (const l of G.libellesPossiblesDebutant(Object.assign({ type, sens: 1, abandonP: 1 }, e))) lib.add(l);
  const L0 = [...lib], trop = L0.filter(l => l.length > DEB.forme), sales = L0.filter(l => G.motsBannis(l).length || CONSEIL.test(l) || /%/.test(l));
  check(`${L0.length} libellés Débutant distincts : ≤ ${DEB.forme} caractères, aucun mot banni, aucun conseil`, L0.length >= 40 && !trop.length && !sales.length, { trop, sales });
  // Bulles, sur les figures montrées à 40 instants de la fixture, dans les deux modes.
  const pb = [];
  let nb = 0, nbEx = 0;
  const prixDe = p => G.prix(p, '$');
  for (let k = 0; k < 40; k++) {
    const n = 600 + Math.floor((NN - 601) * k / 39), r = k === 39 ? R : tronque(n), ctx = ctxDe(n);
    const vus = G.formesAffichees(r, P, n - 60, n + 1, 'expert').concat(G.formesAffichees(r, P, n - 60, n + 1, 'debutant').slice(0, 1));
    for (const f of vus) {
      nb++;
      const b = r.bilan[f.type], deb = G.texteFormeDebutant(f, b, ctx, P, '$').join(' '), exp = G.texteFormeExpert(f, b, ctx, P, '$', { concurrentes: G.concurrentes(r, f, P), tombees: G.tombees(r, 3) }).join(' ');
      const lE = G.libellesFormeExpert(f, b, ctx, P);
      const e = G.etatForme(f).cle, vivante = !f.fin;
      const def = f.ebauche || f.phase !== 'confirme' ? null : null;
      if (!/Mesuré sur/.test(deb)) pb.push(['Mesuré sur', f.type, e]);
      if (!/^Mesuré · /m.test(exp) && !exp.includes('Mesuré · ')) pb.push(['Mesuré · (expert)', f.type, e]);
      if (G.motsBannis(deb).length) pb.push(['mot banni', f.type, G.motsBannis(deb)]);
      if (CONSEIL.test(deb) || CONSEIL.test(exp.replace(/pas une recommandation/, '')) || ACCUSE.test(deb + exp)) pb.push(['conseil', f.type]);
      if (C7.test(deb) || C7.test(exp)) pb.push(['C7', f.type, (deb + exp).match(C7)[0]]);
      if (/UTC/.test(deb)) pb.push(['UTC en débutant', f.type]);
      if (/undefined|NaN|—/.test(deb + exp)) pb.push(['valeur manquante', f.type, e, (deb + ' ¦ ' + exp).match(/.{0,80}(?:undefined|NaN|—).{0,40}/g)]);
      if (!lE.length || lE[0].length > 80 && lE[lE.length - 1].length > 80) pb.push(['libellé expert > 80', lE[0]]);
      if (vivante) {
        nbEx++;
        const N = G.niveauxFigure(f, ctx.j, P);
        // Débutant : validation, cible « non garantie » ; annulation quand la figure en a une.
        if (!/validée|sortie compte|Validée/.test(deb)) pb.push(['validation', f.type, e]);
        if (!f.ebauche && !/cibles? théoriques?/i.test(deb)) pb.push(['cible', f.type, e]);
        if (!f.ebauche && !/non garanties?/.test(deb)) pb.push(['non garantie', f.type, e]);
        if (N.invals.length && !f.ebauche && !/Annulée si|ne tient plus|annulée si/.test(deb)) pb.push(['invalidation', f.type, e, deb.slice(0, 200)]);
        if (!f.ebauche && !/objectif théorique \(convention, non garanti\)/.test(exp)) pb.push(['objectif expert', f.type, e]);
        // Mêmes valeurs dans les deux modes : chaque niveau du moment est écrit à l'identique.
        const niv = N.confirme ? [N.invals[0].p, N.objectifs[0].p] : N.sorties.map(x => x.seuil).concat(N.invals.filter(v => v.clotures === 1).map(v => v.p));
        for (const p of niv) if (!f.ebauche && (!deb.includes(prixDe(p).replace(' $', '')) || !exp.includes(prixDe(p).replace(' $', '')))) pb.push(['même valeur', f.type, e, prixDe(p)]);
      } else {
        const m = G.marqueFin(f, ctx, 'debutant', '$'), mx = G.marqueFin(f, ctx, 'expert', '$');
        if (['invalide', 'abandon'].includes(e) && !/\d\dh\d\d \(heure de Paris\)/.test(m)) pb.push(['heure de Paris', f.type, m]);
        if (['invalide', 'abandon'].includes(e) && !/\d\d:\d\d UTC \(\d\dh\d\d Paris\)/.test(mx)) pb.push(['heure expert', f.type, mx]);
      }
    }
  }
  check(`${nb} bulles (${nbEx} figures vivantes) à 40 instants : « Mesuré sur », validation, invalidation, cible « non garantie », mêmes valeurs dans les deux modes, heure de Paris en Débutant, ni mot banni ni conseil ni sens attendu`, nb > 40 && !pb.length, pb.slice(0, 8));
  const defs = Object.values(G.DEFINITION_FORME);
  check(`C7 : les ${defs.length} définitions ne disent ni « annonce », ni « souvent suivi », ni « devrait », ni « signal »`, defs.length === 16 && !defs.some(d => C7.test(d)), defs.filter(d => C7.test(d)));
}

// ── 7. États vivants, ébauches à la clôture ──
titre('7. États vivants (figureVivante) ; une ébauche ne naît qu’à une clôture (A1)');
{
  // Une figure vivante, à l'état de sa clôture : la bougie en cours ne la change jamais.
  const f0 = R.formes.find(f => f.type === 'double_sommet' && f.jConf !== null && f.jConf - f.t >= 4);
  const j = f0.t + 2, r = tronque(j), f = r.formes.find(x => G.cleFigure(x) === G.cleFigure(f0));
  const Sv = { h: H, l: L, c: C }, N = G.niveauxFigure(f, j, P), x = N.sorties[0], avant = JSON.stringify(f);
  const ctx = ctxDe(j);
  const v1 = G.figureVivante(f, Sv, j, { high: x.ligne + 50, low: x.seuil - 30 }, x.seuil - 20, P);
  const v2 = G.figureVivante(f, Sv, j, { high: x.ligne + 50, low: x.seuil - 30 }, x.ligne + 10, P);
  const t1 = G.texteVivantFigure(f, v1, ctx, 'expert', '$'), t2 = G.texteVivantFigure(f, v2, ctx, 'expert', '$');
  // (Comportement changé exprès : le libellé Débutant garde le nom de la figure et ne revient pas en
  // arrière avant la clôture — il ne clignote plus quand le prix oscille autour de la ligne.)
  check('prix live au-delà de la ligne de cou : « franchi », « à confirmer à la fin de la bougie » ; Débutant « Double sommet à confirmer » (le nom reste)', v1.cle === 'franchi' && v1.etiq === 'sortie' && /à confirmer à la fin de la bougie/.test(t1) && G.libelleVivantDebutant(f, v1) === 'Double sommet à confirmer', [v1.cle, t1, G.libelleVivantDebutant(f, v1)]);
  check('mèche seule (la bougie en cours y est allée, le prix est revenu) : « percé en mèche » ; Débutant : le MÊME libellé qu’au-delà (pas de clignotement), la bulle dit la différence', v2.cle === 'meche' && /percé en mèche/.test(t2) && G.libelleVivantDebutant(f, v2) === G.libelleVivantDebutant(f, v1), [v2.cle, t2]);
  const tD = G.texteVivantFigure(f, v2, ctx, 'debutant', '$');
  check('… en Débutant : « Cela ne compte pas : seule la fin de … compte », l’heure de Paris, aucun mot banni', /Cela ne compte pas : seule la fin d/.test(tD) && /\d\dh\d\d/.test(tD) && !G.motsBannis(tD).length, tD);
  check('un état vivant ne change jamais la figure (phase, demi, journal)', JSON.stringify(f) === avant);
  // A1 : chaque ébauche naît à une clôture, avec au moins ebaucheDroiteMin bougie close à droite de son extrême.
  const eb = R.ebauches.liste;
  check(`A1 : ${eb.length} ébauches, chacune née à une clôture, au moins ${P.ebaucheDroiteMin} bougie close à droite du point en attente`, eb.length > 0 && eb.every(e => e.journal[0].quoi === 'ebauche' && e.journal[0].j === e.t0 && e.t0 - e.pend0 >= P.ebaucheDroiteMin));
  // Les ébauches montrées après chaque clôture sont des ébauches du rejeu (celles que compte le bilan) :
  // rien ne naît de la bougie en cours (le rejeu ne lit que les bougies closes).
  let ok = true;
  for (const n of [1200, 1800, 2400, NN]) {
    const rr = n === NN ? R : tronque(n), vus = G.formesAffichees(rr, P, n - 60, n + 1, 'expert').filter(f => f.ebauche);
    if (!vus.every(e => rr.ebauches.liste.includes(e) && e.t0 <= n - 1)) ok = false;
  }
  check('ébauches montrées = ébauches du rejeu des bougies closes (aucune née de la bougie en cours)', ok);
}

// ── 8. Sélection ──
titre('8. Sélection : Débutant, Expert, figure tombée');
{
  const pb = [];
  for (let n = 400; n <= NN; n += 37) {
    const res = Object.assign({}, R, { n }), j = n - 1, vs = n - 50, ve = n + 1;
    const D = G.formesAffichees(res, P, vs, ve, 'debutant'), X = G.formesAffichees(res, P, vs, ve, 'expert');
    if (D.some(f => f.debut < vs)) pb.push(['débutant hors vue', n]);
    for (let k = 1; k < D.length; k++) if (G.rangFigure(D[k], j) < G.rangFigure(D[k - 1], j)) pb.push(['rang', n]);
    if (X.length > P.formesMax) pb.push(['expert > formesMax', n]);
    const fin = f => (f.fin && f.jFin <= j ? f.jFin : j);
    for (let a = 0; a < X.length; a++) for (let b = a + 1; b < X.length; b++) {
      const f = X[a], g = X[b];
      if (G.groupeVue(f) === G.groupeVue(g) && f.debut <= fin(g) && g.debut <= fin(f)) pb.push(['recouvrement', n, f.type, g.type]);
      if (G.dernierPoint(f, P) === G.dernierPoint(g, P)) pb.push(['même dernier point', n]);
    }
  }
  check('Débutant : figures entières dans la vue, rangées ; Expert : ≤ ' + P.formesMax + ', jamais deux d’une même famille d’écran qui se recouvrent ni sur le même dernier point', !pb.length, pb.slice(0, 5));
  const inv = { fin: 'invalide', jFin: 100, type: 'double_sommet', journal: [] }, eb = { ebauche: true, type: 'double_sommet', journal: [] };
  check('une figure invalidée depuis moins de 2 clôtures (rang 2) passe devant une ébauche (rang 4) ; plus tard, derrière (rang 5)', G.rangFigure(inv, 101) === 2 && G.rangFigure(eb, 101) === 4 && G.rangFigure(inv, 103) === 5);
  // invalide_avant : montrée garderInvalide bougies, puis plus.
  let vu = null;
  for (const f of R.formes.filter(x => x.fin === 'invalide_avant' && x.jFin + P.garderInvalide + 2 < NN)) {
    const montre = j => G.formesAffichees(Object.assign({}, R, { n: j + 1 }), P, f.jFin - 40, f.jFin + 12, 'expert').includes(f);
    if (!montre(f.jFin - 1)) continue;
    vu = { f: f.type, pendant: Array.from({ length: P.garderInvalide + 1 }, (_, k) => montre(f.jFin + k)), apres: montre(f.jFin + P.garderInvalide + 1) };
    break;
  }
  check(`figure invalidée avant confirmation, montrée la clôture d’avant : ✗ pendant ${P.garderInvalide} bougies, puis plus`, vu && vu.pendant.every(Boolean) && !vu.apres, vu);
  // Une figure jamais montrée n'est jamais barrée.
  const jamais = R.formes.filter(f => f.fin === 'invalide_avant').filter(f => !G.formesAffichees(Object.assign({}, R, { n: f.jFin }), P, f.jFin - 40, f.jFin + 12, 'expert').includes(f));
  check('une figure tombée que la clôture d’avant ne montrait pas n’est pas barrée ensuite (on ne barre que ce qui a été vu)', jamais.every(f => !G.formesAffichees(Object.assign({}, R, { n: f.jFin + 1 }), P, f.jFin - 40, f.jFin + 12, 'expert').includes(f)));
}

// ── 4 bis. 1 min (amendement E1) : sans regard vers l'avenir, et le temps du rejeu refait chaque minute ──
titre('4 bis. 1 min : aucun regard vers l’avenir, rejeu ≤ 60 ms');
{
  const b1 = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'bougies-btcusdt-1m.json'), 'utf8')).bougies;
  const H1 = b1.map(k => +k[2]), L1 = b1.map(k => +k[3]), C1 = b1.map(k => +k[4]), A1 = atrDe(H1, L1, C1, P.atrPeriode), n1 = C1.length;
  const S1 = { h: H1, l: L1, c: C1, atr: A1, n: n1 }, R1 = G.detecter(S1, P), N = Math.floor(n1 * 0.6), r = G.detecter(Object.assign({}, S1, { n: N }), P);
  const cle = f => [f.type, f.debut, f.t, f.depart, f.fin && f.jFin < N ? f.fin + '@' + f.jFin : ''].join('|');
  const ce = e => [e.type, e.cle, e.t0, e.fin && e.jFin < N ? e.fin + '@' + e.jFin : ''].join('|');
  const a1 = R1.formes.filter(f => f.t < N).map(cle), a2 = r.formes.map(cle);
  const e1 = R1.ebauches.liste.filter(e => e.t0 < N).map(ce), e2 = r.ebauches.liste.map(ce);
  check(`1 min (${n1} bougies, ${R1.formes.length} figures, ${new Set(R1.formes.map(f => f.type)).size} types) : figures et ébauches nées avant ${N}, issues comprises, identiques sans la suite`,
    a1.length === a2.length && a1.every((x, i) => x === a2[i]) && e1.length === e2.length && e1.every((x, i) => x === e2[i]), { a1: a1.length, a2: a2.length, e1: e1.length, e2: e2.length });
  G.detecter(S1, P);
  const t0 = process.hrtime.bigint();
  for (let k = 0; k < 5; k++) G.detecter(S1, P);
  const ms = Number(process.hrtime.bigint() - t0) / 5e6;
  check(`1 min : rejeu des ${n1} bougies en ${ms.toFixed(1)} ms (moyenne de 5, ≤ 60 ms)`, ms <= 60, ms);
}

// ── 6 bis. Une figure tombée AVANT sa validation : la bulle ne dit pas qu'elle est sortie ──
titre('6 bis. Figure tombée avant validation : la définition s’arrête avant « puis … sorti »');
{
  const tombees = R.formes.filter(f => f.jConf === null && ['invalide_avant', 'expire_avant'].includes(f.fin));
  const faux = [];
  for (const f of tombees) {
    const t = G.texteFormeDebutant(f, R.bilan[f.type], ctxDe(f.jFin + 2), P, '$').join(' ');
    // (Mots changés exprès : « tombée avant d’être validée » ; la cible d'une figure tombée n'est plus dite.)
    if (/puis (il|le prix) (est passé|en est sorti|est sorti)|puis il en est sorti/.test(t) || !/la figure est tombée avant d’être validée/.test(t) || /[Cc]ible théorique/.test(t)) faux.push({ type: f.type, t: t.slice(0, 200) });
  }
  check(`${tombees.length} figures tombées avant validation : « la figure est tombée avant d’être validée », jamais « puis … sorti », pas de cible`, tombees.length > 5 && !faux.length, faux.slice(0, 3));
}

// ── 4 ter. Rejeu repris d'une clôture à l'autre : le même résultat qu'un rejeu complet ──
titre('4 ter. Rejeu repris (une bougie de plus) = rejeu complet ; repli si l’historique change');
{
  const ser = r => JSON.stringify({
    f: r.formes.map(f => [f.type, f.debut, f.t, f.jConf, f.fin, f.jFin, f.journal, !!f.doublon, f.objectif, f.invalidation]),
    e: r.ebauches.liste.map(e => [e.cle, e.t0, e.fin, e.jFin, e.raison, e.abandonP, e.journal]), a: r.ebauches.actuelles.map(e => e.cle), b: r.bilan });
  let r = null, ecarts = 0, pts = 0, max = 0;
  for (let n = NN - 600; n <= NN; n++) {
    const Sn = Object.assign({}, S, { n }), t0 = process.hrtime.bigint();
    r = G.detecter(Sn, P, r);
    max = Math.max(max, Number(process.hrtime.bigint() - t0) / 1e6);
    if (n % 50 === 0 || n === NN) { pts++; if (ser(r) !== ser(G.detecter(Sn, P))) ecarts++; }
  }
  check(`15 min : 600 clôtures rejouées en reprenant (${pts} points comparés) : figures, journaux, ébauches et bilan identiques au rejeu complet`, ecarts === 0, { ecarts, pts });
  check(`… plusieurs bougies d’un coup (onglet en arrière-plan) : identique`, ser(G.detecter(S, P, G.detecter(Object.assign({}, S, { n: NN - 37 }), P))) === ser(R), null);
  // Une bougie déjà lue a changé (historique corrigé) : rejeu complet, pas de reprise.
  const H2 = H.slice(); H2[NN - 2] = H2[NN - 2] * 1.01;
  const S2 = Object.assign({}, S, { h: H2 });
  const avant = G.detecter(Object.assign({}, S, { n: NN - 1 }), P);
  check('une bougie déjà lue a changé (empreinte) : rejeu complet, même résultat qu’un rejeu neuf', ser(G.detecter(S2, P, avant)) === ser(G.detecter(S2, P)), null);
  check('d’autres réglages : rejeu complet', ser(G.detecter(S, Object.assign({}, P), G.detecter(Object.assign({}, S, { n: NN - 1 }), P))) === ser(R), null);
  check(`reprise la plus lente sur 600 clôtures : ${max.toFixed(1)} ms (≤ 60 ms)`, max <= 60, max);
}

// ── 9. Temps ──
titre('9. Temps');
{
  G.detecter(S, P);
  const t0 = process.hrtime.bigint();
  for (let k = 0; k < 5; k++) G.detecter(S, P);
  const ms = Number(process.hrtime.bigint() - t0) / 5e6;
  check(`rejeu des ${NN} bougies (figures, ébauches, témoin) : ${ms.toFixed(1)} ms en moyenne de 5 (≤ 60 ms)`, ms <= 60, ms);
  const vivantes = R.formes.filter(f => !f.fin).concat(R.ebauches.actuelles);
  const liste = vivantes.length ? vivantes : R.formes.slice(-5);
  const j = NN - 1, cur = { high: H[j] * 1.001, low: L[j] * 0.999 }, Sv = { h: H, l: L, c: C };
  const t1 = process.hrtime.bigint();
  for (let k = 0; k < 200; k++) for (const f of liste) G.figureVivante(f, Sv, j, cur, C[j] * (1 + (k % 7 - 3) * 0.002), P);
  const par = Number(process.hrtime.bigint() - t1) / 1e6 / 200;
  check(`figureVivante pour ${liste.length} figure(s) : ${par.toFixed(3)} ms par seconde de calque (≤ 1 ms)`, par <= 1, par);
}

console.log(ko ? `\n❌ FIGURES : ${ko} contrôle(s) en échec` : '\n✅ FIGURES : TOUS LES CONTRÔLES PASSENT');
process.exit(ko ? 1 : 0);
