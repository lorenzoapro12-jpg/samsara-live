// Contrôles HORS LIGNE du « Guide » de la carte (js/bookmap-calc.js, bloc BM.GUIDE).
//
// Le guide écrit en mots ce que la carte montre. Il a quatre façons de mentir, contrôlées ici :
//   · CHOISIR mal : nommer « mur » une tranche hors de la bande lue, du mauvais côté du prix, ou
//     sous le seuil annoncé ;
//   · DATER mal : « là depuis » à travers une lecture manquée, ou une durée sans « au moins »
//     quand la série touche le bord de ce qui est lu ;
//   · RÉSUMER mal : compter un côté plus loin que l'autre (bande non couverte), comparer à un autre
//     prix que celui de la même lecture, écrire 0 pour une valeur absente ;
//   · PARLER mal : un conseil, une intention prêtée, un libellé court trop long ou qui commence
//     par « $ ».
const fs = require('fs'), path = require('path');
const BM = require('../js/bookmap-calc.js');
const REPO = path.resolve(__dirname, '..');

let ko = 0;
const check = (nom, ok, det) => { if (!ok) ko++; console.log(`  ${ok ? '✓' : '✗'} ${nom}${!ok && det !== undefined ? ' — ' + JSON.stringify(det).slice(0, 240) : ''}`); };
const titre = t => console.log(`\n── ${t} ──`);
// Mots interdits (texte montré ET fichiers de la carte, commentaires compris).
const CONSEIL = /\b(achetez|vendez|ach[eè]te[rz]?|vends|il faut (?:acheter|vendre)|entrez|sortez|prenez position|signal d['’]achat|signal de vente|recommand(?:e|ons))\b/i;
const ACCUSE = /spoof|manipul|leurre|tromper|tromperie|faux (?:mur|ordre)s?|fake|bluff|pi[eè]ge/i;
const textes = [];        // tout texte produit, relu à la fin
const garder = (...l) => { for (const x of l) if (typeof x === 'string') textes.push(x); else if (x && typeof x === 'object') garder(...Object.values(x).filter(v => typeof v === 'string' || Array.isArray(v)).flat()); };
const G = BM.GUIDE;

// Un carnet (BM.agregerCarnet) fabriqué : niveaux [prix, BTC], tranches de 10 $.
const carnet = (bids, asks) => BM.agregerCarnet({ bids: bids.map(([p, q]) => [String(p), String(q)]), asks: asks.map(([p, q]) => [String(p), String(q)]) }, 10);

// ── 1. Formats ───────────────────────────────────────────────────────────────
titre('1. Formats : heures UTC, signe, durées');
const t0 = Date.UTC(2026, 9, 8, 14, 5, 7);
check('heure UTC (pas locale) : 14:05 et 14:05:07', BM.heureUtc(t0) === '14:05' && BM.heureUtc(t0, true) === '14:05:07', [BM.heureUtc(t0), BM.heureUtc(t0, true)]);
check('écart signé avec le vrai signe moins', BM.pourcent(-0.2) === '−0,20 %' && BM.pourcent(0.123) === '+0,12 %', [BM.pourcent(-0.2), BM.pourcent(0.123)]);
check('écart absent → « — », jamais 0', BM.pourcent(NaN) === '—' && BM.duree(null) === '—' && BM.duree(undefined) === '—');
check('durée sous une minute : en mots, pas « 5,3 s »', BM.duree(5300) === 'moins d\'une minute' && BM.duree(125e3) === BM.age(125e3));
check('prix exact : décimales seulement s\'il en a', BM.prixExact(81000) === BM.prix(81000) && /,5/.test(BM.prixExact(81000.5)));

// ── 2. Le carnet vu par le guide ─────────────────────────────────────────────
titre('2. carnetGuide : tranches de 20 $, prix de référence de la MÊME lecture, bande lue');
const K = carnet(
  [[100010, 1], [100005, 3], [99995, 12], [99990, 4], [99950, 30], [99800, 50], [99700, 2]],
  [[100020, 1], [100030, 15], [100045, 6], [100100, 25], [100190, 40], [100290, 1]]);
const C = BM.carnetGuide(K, 20);
check('tranches de 20 $ (2 × 10 $)', C.pas === 20 && C.dp === 10);
check('milieu = (meilleur bid + meilleur ask) / 2 de cette lecture', C.mid === (100010 + 100020) / 2, C.mid);
check('bande lue en $ : le plus bas bid et le plus haut ask LUS (pas le bord de leur tranche)', C.bas === 99700 && C.haut === 100290, [C.bas, C.haut]);
check('regroupement exact : Σ conservée côté achat', Math.abs([...C.b.values()].reduce((a, b) => a + b, 0) - 102) < 1e-9);
check('tranche 99 980–100 000 = 12 + 4', C.b.get(Math.floor(99980 / 20)) === 16, C.b.get(4999));
check('sans un côté : null (rien d\'inventé)', BM.carnetGuide(carnet([[100, 1]], []), 20) === null);

// ── 3. Murs proches ──────────────────────────────────────────────────────────
titre('3. mursProches / murPlusProche : seuil relatif, côté, bande, ±1 %, jamais la tranche du prix');
const S0 = BM.seuilMur(C);
check(`seuil « mur » = max(${G.murMinBtc} BTC, ${G.murFacteur} × la tranche médiane de la bande lue)`, S0.seuil === Math.max(G.murMinBtc, G.murFacteur * S0.mediane) && S0.n > 10, S0);
const M = BM.mursProches(C);
const mb = M.filter(m => m.cote === 'bid'), ma = M.filter(m => m.cote === 'ask');
check(`au plus ${G.parCote} par côté, les plus chargés d'abord`, mb.length === 2 && ma.length === 2 && mb[0].q >= mb[1].q && ma[0].q >= ma[1].q, M);
check('chacun ≥ le seuil « mur » de la lecture', M.every(m => m.q >= S0.seuil), M);
const kP = Math.floor(C.mid / C.pas);
check(`jamais la tranche du prix ni ses ${G.margeTranches} voisine(s) de chaque côté (le carnet s'y reforme sans cesse)`, M.every(m => Math.abs(m.k - kP) > G.margeTranches), M.map(m => m.k - kP));
check('les bids sous le prix, les asks au-dessus', mb.every(m => m.p + C.pas < C.mid) && ma.every(m => m.p > C.mid));
check('le plus gros bid (99 800, 50 BTC) puis 99 940 (30 BTC) ; 99 980 (16 BTC, voisine du prix) n\'est pas nommée', mb[0].p === 99800 && mb[1].p === 99940 && !M.some(m => m.p === 99980), mb);
const Cserre = Object.assign({}, C, { haut: 100130 });
check('une tranche hors de la bande lue (même en partie) n\'est jamais nommée', !BM.mursProches(Cserre).some(m => m.p + C.pas > 100130), BM.mursProches(Cserre));
check('à plus de ±1 % du prix : ignoré', !BM.mursProches(C, { procheMaxPct: 0.1 }).some(m => Math.abs(m.p - C.mid) / C.mid > 0.001 + C.pas / C.mid));
const pb = BM.murPlusProche(C, 'bid'), pa = BM.murPlusProche(C, 'ask');
check('le mur d\'achat le plus proche (hors voisine du prix) : 99 940–99 960 (30 BTC)', pb.p === 99940 && pb.pas === 20, pb);
check('le mur de vente le plus proche : 100 100–100 120 (25 BTC) — 100 020–100 040 est la tranche voisine', pa.p === 100100, pa);
check('écart mesuré au bord le plus proche : négatif sous le prix, positif au-dessus', pb.ecartPct < 0 && pa.ecartPct > 0 && Math.abs(pb.ecartPct - (99960 - C.mid) / C.mid * 100) < 1e-9, [pb.ecartPct, pa.ecartPct]);
check('rien sous le seuil : null', BM.murPlusProche(C, 'bid', { seuil: 1000 }) === null);
// Un carnet ORDINAIRE (≈ 10 BTC par tranche partout, comme le carnet réel) n'a aucun « mur ».
const bO = [], aO = [];
for (let i = 0; i < 60; i++) { bO.push([100000 - 5 - i * 20, 9 + (i % 3)]); aO.push([100000 + 5 + i * 20, 9 + (i % 4)]); }
const CO = BM.carnetGuide(carnet(bO, aO), 20);
check('carnet ordinaire (≈ 10 BTC par tranche) : seuil ≈ 2 × médiane, aucun mur nommé', BM.seuilMur(CO).seuil >= 18 && BM.mursProches(CO).length === 0 && BM.murPlusProche(CO, 'bid') === null, BM.seuilMur(CO));

// ── 4. Résumé ────────────────────────────────────────────────────────────────
titre('4. resumeCarnet / phraseResume : même bande des deux côtés, lu à…, photo pas prévision');
const r = BM.resumeCarnet(C);
const couvert = Math.min(C.mid - C.bas, C.haut - C.mid) / C.mid * 100;
check('bande réduite à ce que le carnet couvre des DEUX côtés', r.reduite === true && Math.abs(r.bande - couvert) < 1e-12 && r.bande < G.bandePct, r);
check('bande pleine quand le carnet va assez loin', BM.resumeCarnet(Object.assign({}, C, { bas: 90000, haut: 110000 })).reduite === false);
let qB = 0, qA = 0;
for (const [kk, q] of C.sb) if ((kk + 0.5) * C.dp >= C.mid * (1 - r.bande / 100)) qB += q;
for (const [kk, q] of C.sa) if ((kk + 0.5) * C.dp <= C.mid * (1 + r.bande / 100)) qA += q;
check('Σ achat / vente dans la bande (milieu de tranche dedans)', Math.abs(r.qB - qB) < 1e-9 && Math.abs(r.qA - qA) < 1e-9, { r, qB, qA });
check('sens d\'après le rapport (convention ' + G.rapportNet + ')', r.sens === (r.rapport >= G.rapportNet ? 'achat' : r.rapport <= 1 / G.rapportNet ? 'vente' : 'egal'), r);
// Carnet SYMÉTRIQUE, prix hors du milieu de sa tranche (meilleur bid et meilleur ask dans la même
// tranche) : aucun côté n'est perdu, « à peu près autant », quel que soit le côté du milieu.
for (const pBid of [100011, 100002, 100018.5]) {
  // Les niveaux lointains (0,001 BTC) fixent la bande lue loin des niveaux comptés : seule la
  // tranche du prix est en jeu.
  const bs = [[pBid, 5]], as = [[pBid + 0.01, 5]];
  for (let i = 1; i <= 4; i++) { bs.push([pBid - i * 20, 1]); as.push([pBid + 0.01 + i * 20, 1]); }
  bs.push([pBid - 400, 0.001]); as.push([pBid + 400.01, 0.001]);
  const rs = BM.resumeCarnet(BM.carnetGuide(BM.agregerCarnet({ bids: bs.map(([p, q]) => [p.toFixed(2), String(q)]), asks: as.map(([p, q]) => [p.toFixed(2), String(q)]) }, 20), 20));
  check(`carnet symétrique, meilleur bid ${pBid} : « à peu près autant », rapport 1 (le haut de la tranche du prix compte ses asks, le bas ses bids)`, rs && rs.sens === 'egal' && Math.abs(rs.rapport - 1) < 1e-3 && rs.qB > 8.9, rs);
}
const murs = { bid: pb, ask: pa, seuil: S0.seuil };
const deb = BM.phraseResume(r, murs, 'debutant', 'il y a 2,0 s'), exp = BM.phraseResume(r, murs, 'expert', 'il y a 2,0 s'), crt = BM.phraseResume(r, murs, 'debutant', 'il y a 2,0 s', { court: true });
garder(deb, exp, crt);
const sp = x => x.replace(/[\u202f\u00a0]/g, ' ');
check('débutant : l\'âge d\'abord, la bande en % ET en dollars, les deux quantités en BTC', /^Carnet lu il y a 2,0 s, à ±0,27 % du prix \(≈ ±275 \$ : tout ce que le carnet lu couvre\) : 100 BTC d'ordres d'achat, 87,0 BTC d'ordres de vente — 1,1 fois plus côté achat\./.test(sp(deb)), deb);
check('débutant : le mur le plus proche, sa tranche, « x % sous le prix » / « au-dessus du prix »', sp(deb).includes('99 940–99 960 $ (0,05 % sous le prix)') && sp(deb).includes('100 100–100 120 $ (0,08 % au-dessus du prix)'), deb);
check('débutant : « Photo de l\'instant, pas une prévision. »', /Photo de l'instant, pas une prévision\.$/.test(deb), deb);
check('court (écran étroit, ou phrase qui ne tient pas) : « photo, pas une prévision » juste après l\'âge, achat / vente en BTC, murs proches, bien plus court', /^Carnet lu il y a 2,0 s \(photo, pas une prévision\) : achat 100 BTC \/ vente 87,0 BTC à ±275 \$\. Murs proches : 99 940 \$ \(achat\) · 100 100 \$ \(vente\)\.$/.test(sp(crt)) && crt.length < deb.length * 0.6, crt);
check('expert : les chiffres seuls (pas de phrase)', !/ordres d'achat/.test(exp) && /×/.test(exp) && exp.split(' · ').length === 4 && /^carnet live il y a 2,0 s · /.test(exp), exp);
check('aucune direction annoncée (pas de « va monter / baisser », pas de probabilité)', !/monter|baisser|hausse|baisse|probab|chance/i.test(deb + exp + crt), deb);
const r0 = BM.resumeCarnet(Object.assign({}, C, { b: new Map(), a: C.a }));
const p0 = BM.phraseResume(r0, { bid: null, ask: pa, seuil: 10 }, 'debutant', 'il y a 1 s'), p00 = BM.phraseResume(r0, { bid: null, ask: null, seuil: 19 }, 'debutant', 'il y a 1 s');
garder(p0, p00);
check('sans mur d\'achat : « aucune tranche nettement plus chargée… côté achat », pas « 0 »', /Aucune tranche nettement plus chargée que les autres côté achat/.test(p0) && !/(^|[^\d,])0 BTC/.test(p0), p0);
check('aucun mur : « Pas de tranche nettement plus chargée que les autres (au moins 19,0 BTC) »', /Pas de tranche nettement plus chargée que les autres \(au moins 19,0 BTC\) dans le carnet lu/.test(p00), p00);
const pIn = BM.phraseResume(r, { bid: Object.assign({}, pb, { ecartPct: -0.001 }), ask: pa }, 'debutant', 'il y a 1 s');
check('écart minuscule : « à moins de 0,01 % du prix », pas « 0,00 % »', /à moins de 0,01 % du prix/.test(pIn) && !/0,00 %/.test(pIn), pIn);
check('carnet absent : résumé vide (rien d\'affiché, rien d\'inventé)', BM.resumeCarnet(null) === null && BM.phraseResume(null) === '');

// ── 5. Histoire d'un mur dans le carnet live ─────────────────────────────────
titre('5. histoireLive : série ininterrompue, fenêtre ; lecture manquée, bande, prix : jamais 0');
// Faux carnet live : n lectures toutes les 2 s, quantités par tranche de 10 $ données par f(c, pb) ;
// bande(c) = { bas, bB, nB, bA, nA, haut } (indices de tranches de 10 $), par défaut large.
const live = (n, f, trou, bande) => {
  const L = { n, dp: 10, deb: [], fin: [], bas: [], haut: [], bB: [], nB: [], bA: [], nA: [], quantite: (c, pbx, cote) => (cote === 'b' ? f(c, pbx) : 0) };
  for (let c = 0; c < n; c++) {
    L.deb.push(1e6 + c * 2000); L.fin.push(1e6 + c * 2000 + (c === trou ? -500 : 2000));
    const b = Object.assign({ bas: 9000, bB: 9000, nB: 1010, bA: 10010, nA: 1000, haut: 11009 }, bande ? bande(c) : {});
    for (const x of ['bas', 'haut', 'bB', 'nB', 'bA', 'nA']) L[x].push(b[x]);
  }
  return L;
};
const k = 4999;                       // tranche 99 980–100 000, en tranches de 20 $ : 10 $ × 2
const qa = c => (c < 100 ? 2 : c < 400 ? 12 : 20);   // apparaît (≥ 10) à la lecture 100, grossit à 400
const L = live(500, (c, pbx) => (pbx === k * 2 ? qa(c) : 0));
const h = BM.histoireLive(L, k, 20, 'b', 10, 600e3);
check('« depuis » = première lecture ≥ seuil de la série qui finit maintenant ; vue commencer (raison « seuil »)', h.depuis === L.deb[100] && h.auMoins === false && h.raison === 'seuil', h);
check('taille d\'il y a 10 min lue à la bonne lecture', h.tF === L.deb[499 - 300] && h.qF === 12, h);
const Lt = live(500, (c, pbx) => (pbx === k * 2 ? qa(c) : 0), 300);
const ht = BM.histoireLive(Lt, k, 20, 'b', 10, 600e3);
check('une lecture manquée coupe la série : « au moins », rien d\'avant', ht.depuis === Lt.deb[301] && ht.auMoins && ht.coupe === 'trou' && ht.qF === null && ht.tO === Lt.deb[301], ht);
const Lb = live(50, (c, pbx) => (pbx === k * 2 ? 15 : 0));
const hb = BM.histoireLive(Lb, k, 20, 'b', 10, 600e3);
check('série qui touche la plus ancienne lecture : depuisDebut, raison « debut » (→ « au moins »)', hb.depuisDebut === true && hb.raison === 'debut' && hb.auMoins && hb.depuis === Lb.deb[0], hb);
check('sous le seuil maintenant : depuis = null', BM.histoireLive(live(10, () => 1), k, 20, 'b', 10, 600e3).depuis === null);
check('sans lecture : null', BM.histoireLive({ n: 0 }, k, 20, 'b', 10, 1) === null);
// La bande lue se déplace : la tranche n'était pas LUE pendant 40 lectures (pas « vide »).
const Lh = live(60, (c, pbx) => (pbx === k * 2 && c >= 40 ? 50 : 0), -1, c => (c < 40 ? { bas: 10000 } : {}));
const hh = BM.histoireLive(Lh, k, 20, 'b', 10, 600e3);
check('tranche entrée dans la bande lue : la série s\'arrête (« au moins », coupe « bande »), rien de comparé à un 0 non observé', hh.auMoins && hh.coupe === 'bande' && hh.raison === 'bande' && hh.qF === null && hh.qO === 50, hh);
// Le prix était dans la tranche (meilleur bid sous elle) : sa taille d'alors n'est pas celle d'un mur.
const Lp = live(60, (c, pbx) => (pbx === k * 2 && c >= 40 ? 24 : 0), -1, c => (c < 40 ? { nB: 9998 - 9000 + 1 } : {}));
const hp = BM.histoireLive(Lp, k, 20, 'b', 10, 600e3);
check('prix passé dans la tranche : coupe « prix », rien à comparer', hp.coupe === 'prix' && hp.raison === 'prix' && hp.qF === null, hp);
check('lecture courante hors bande : ni depuis ni variation', BM.histoireLive(live(5, () => 30, -1, () => ({ bas: 10000 })), k, 20, 'b', 10, 600e3).depuis === null);

// ── 6. Raccord avec la carte publiée ─────────────────────────────────────────
titre('6. presenceJusqua : la série publiée s\'arrête à la première colonne non observée');
const W = 6, H = 3;
const grille = { W, H, pbMin: 10, bids: new Float32Array(W * H), asks: new Float32Array(W * H), bas: new Int32Array(W).fill(10), haut: new Int32Array(W).fill(12) };
for (let c = 0; c < W; c++) grille.bids[c * H + 1] = 200;
grille.bas[1] = -1;                    // colonne 1 non observée
check('remonte jusqu\'à la colonne 2 (la 1 n\'est pas observée)', BM.presenceJusqua(grille, 100, 11, 'b', 5, 0) === 2);
check('ne va pas avant cMin', BM.presenceJusqua(grille, 100, 11, 'b', 5, 4) === 4);
check('sous le seuil à la dernière colonne : null', BM.presenceJusqua(grille, 300, 11, 'b', 5, 0) === null);
check('rangée hors grille : null', BM.presenceJusqua(grille, 1, 40, 'b', 5, 0) === null);

// ── 7. Variation d'un mur ────────────────────────────────────────────────────
titre('7. variationMur : grossit / diminue / stable — échanges non lus ≠ aucun');
const vG = BM.variationMur(30, 20, 600e3, 0), vF = BM.variationMur(10, 20, 600e3, 4), vS = BM.variationMur(21, 20, 600e3, 0), vN = BM.variationMur(10, 20, 600e3, null);
garder(vG, vF, vS, vN);
check('+10 BTC sur 10 min : grossit', vG.sens === 'grossit' && /grossit \(\+10,0 BTC en 10 min\)/.test(vG.texte), vG);
check('−10 BTC avec 4 échangés : diminue, et les échanges dits', vF.sens === 'fond' && /^diminue \(−10,0 BTC en 10 min ; 4,00 BTC échangés à ces prix\)$/.test(vF.texte), vF);
check('+1 BTC : sous les seuils (convention) → « à peu près stable depuis 10 min (+1,00 BTC) »', vS.sens === 'stable' && vS.texte === 'à peu près stable depuis 10 min (+1,00 BTC)', vS);
check('échanges non lus : dit tel quel, jamais « aucun échange »', /échanges non lus/.test(vN.texte) && !/aucun échange/.test(vN.texte), vN);
check('moins d\'une minute d\'historique : pas de variation', BM.variationMur(30, 20, 30e3, 0) === null && BM.variationMur(30, null, 600e3, 0) === null);

// ── 8. Libellés des murs ─────────────────────────────────────────────────────
titre('8. texteMur : débutant en mots (2e ligne seulement s\'il a une histoire), expert en chiffres, court ≤ 40 signes');
const now = 5e6;
const cas = [
  { cote: 'bid', p: 99980, pas: 20, q: 16, depuis: now - 4200e3, auMoins: false, raison: 'seuil', variation: vG, source: 'live' },
  { cote: 'ask', p: 100020, pas: 20, q: 123.4, depuis: now - 20e3, auMoins: true, raison: 'debut', variation: null, source: 'live' },
  { cote: 'ask', p: 100020, pas: 20, q: 16, depuis: now - 20e3, auMoins: false, raison: 'seuil', variation: null, source: 'live' },
  { cote: 'bid', p: 99980, pas: 20, q: 16, depuis: null, auMoins: false, raison: 'prix', note: 'prix', variation: null, source: 'live' },
  { cote: 'bid', p: 99980, pas: 20, q: 50, depuis: now - 80e3, auMoins: true, raison: 'bande', note: 'bande', variation: null, source: 'live' },
  { cote: 'ask', p: 100020, pas: 20, q: 21.2, depuis: now - 130e3, auMoins: false, raison: 'seuil', variation: vS, source: 'live' },
  { cote: 'ask', p: 100020, pas: 20, q: 55, source: 'publie', luA: t0 },
];
for (const mode of ['debutant', 'expert']) for (const m of cas) {
  const t = BM.texteMur(m, mode, now);
  garder(t);
  check(`${mode} ${m.source} ${m.cote} ${m.note || ''} : court ≤ 40 signes et ne commence pas par « $ »`, t.court.length <= 40 && !/^\$/.test(t.court) && t.lignes.every(l => !/^\$/.test(l)), t);
}
const tD = BM.texteMur(cas[0], 'debutant', now), tE = BM.texteMur(cas[0], 'expert', now);
check('débutant : « Mur d\'achat · 16,0 BTC · là depuis 1 h 10 », la variation en 2e ligne', tD.lignes[0] === 'Mur d\'achat · 16,0 BTC · là depuis 1 h 10' && /grossit/.test(tD.lignes[1]) && tD.court === 'Mur d\'achat 16,0 BTC · depuis 1 h 10', tD);
check('expert : une ligne de chiffres', tE.lignes.length === 1 && /^Bid 16,0 BTC · 1 h 10/.test(tE.lignes[0]), tE);
const tA = BM.texteMur(cas[1], 'debutant', now), tB = BM.texteMur(cas[2], 'debutant', now);
check('série au bord de ce qui est lu : « déjà là à la première lecture » ; vue commencer : « apparu il y a moins d\'une minute » ; une seule ligne', tA.lignes[0] === 'Mur de vente · 123 BTC · déjà là à la première lecture' && tB.lignes[0] === 'Mur de vente · 16,0 BTC · apparu il y a moins d\'une minute' && tA.lignes.length === 1 && tB.lignes.length === 1, [tA, tB]);
const tPx = BM.texteMur(cas[3], 'debutant', now), tBd = BM.texteMur(cas[4], 'debutant', now);
check('prix passé dans la tranche : ni « depuis » ni « grossit » ; « rien à comparer »', tPx.lignes[0] === 'Mur d\'achat · 16,0 BTC' && /le prix était à ce niveau il y a moins de 10 min : rien à comparer/.test(tPx.lignes[1]) && tPx.court === 'Mur d\'achat 16,0 BTC · prix passé ici', tPx);
check('entré dans la bande lue : « là depuis au moins 1 min », « vient d\'entrer… rien à comparer », jamais « grossit »', tBd.lignes[0] === 'Mur d\'achat · 50,0 BTC · là depuis au moins 1 min' && /vient d'entrer dans la bande que le carnet lu couvre : rien à comparer/.test(tBd.lignes[1]) && !/grossit/.test(tBd.lignes.join(' ')), tBd);
const tSt = BM.texteMur(cas[5], 'debutant', now);
check('stable et récent (2 min) : une seule ligne (pas d\'histoire à dire)', tSt.lignes.length === 1 && tSt.lignes[0] === 'Mur de vente · 21,2 BTC · là depuis 2 min', tSt);
const tP = BM.texteMur(cas[6], 'debutant', now);
check('mur publié : « lu à HH:MM UTC » (fichier de 15 min), court « Mur de vente publié · 55,0 BTC »', tP.lignes[0].includes('lu à ' + BM.heureUtc(t0) + ' UTC') && tP.court === 'Mur de vente publié · 55,0 BTC', tP);
check('le plancher « Mur » en BTC est celui de BM.GUIDE (10)', G.murMinBtc === 10 && G.trancheUsd === 20);

// ── 9. Évènements ────────────────────────────────────────────────────────────
titre('9. Évènements du journal : phrases, heure UTC, court ≤ 40 signes ; « gros ordre » (un prix) ≠ « mur » (une tranche)');
const evs = [
  ...['retire', 'echange', 'partiel', 'incertain'].map(fin => BM.evenementFinMur({ fin, cote: 'b', p: 99987.5, q0: fin === 'echange' ? 12.5 : 0.34, qMax: 12.5, xN: fin === 'echange' ? 13 : 2, echange: fin === 'echange' ? 13 : fin === 'partiel' ? 8 : 0, retire: 0, t: t0 })),
  BM.evenementFinMur({ fin: 'retire', cote: 'a', p: 100100, q0: 12.5, qMax: 12.5, xN: 0, t: t0 }),
  BM.evenementApparu({ cote: 'a', p: 100100, q: 25, t: t0 }),
  BM.evenementRafale({ T: t0, achat: false, q: 24.5, vwap: 80940, pMin: 80936, pMax: 80943, aDeb: 7 }),
  BM.evenementRafale({ T: t0, achat: true, q: 12, vwap: 80998, pMin: 80998, pMax: 80998, aDeb: 8 }),
  BM.evenementTraverse({ cote: 'b', p: 99980, pas: 20, q: 16, t: t0 }),
  BM.evenementOptions({ nom: 'Mur de gamma', court: 'GW', p: 81000, pAxe: 81003, t: t0, luA: t0 - 900e3 }),
  BM.evenementMurApparu({ cote: 'a', p: 100100, pas: 20, q: 31, t: t0 }),
  BM.evenementMurFondu({ cote: 'b', p: 99940, pas: 20, q0: 25, q1: 6, dureeMs: 40e3, echange: 3, t: t0 }),
];
for (const ev of evs) {
  garder(ev);
  check(`${ev.type} ${ev.cote || ''} : court ≤ 40 signes, heure UTC sur la carte, symbole`, ev.court.length <= 40 && !/^\$/.test(ev.court) && /\d\d:\d\d(?::\d\d)? UTC/.test(ev.carte) && ev.s && ev.cle, ev);
}
check('fin hors classement (« toujours là », « interrompu ») : pas d\'évènement', BM.evenementFinMur({ fin: 'la', cote: 'b', p: 1, q0: 1, t: 1 }) === null && BM.evenementFinMur({ fin: 'interrompu', cote: 'b', p: 1, q0: 1, t: 1 }) === null);
check('retiré : la phrase COMMENCE par la plus grande taille lue, puis le reste à la fin', /^Gros ordre d'achat de 12,5 BTC \(sa plus grande taille lue\) à 99 987,50 \$ retiré : ses derniers 0,340 BTC partis sans échange/.test(sp(evs[0].texte)) && /^Gros ordre de vente de 12,5 BTC retiré sans échange à 100 100 \$ \(un seul prix\)$/.test(sp(evs[4].texte)), [evs[0].texte, evs[4].texte]);
{
  // Disparu, échanges incertains (relevé réel : « 0,035 BTC … jusqu'à 15,6 BTC plus tôt ») : la
  // plus grande taille d'abord, puis ce qui en a été retiré et échangé au cours de sa vie.
  const ei = BM.evenementFinMur({ fin: 'incertain', cote: 'b', p: 81798, q0: 0.035, qMax: 15.6, echange: 3.5, retire: 12, t: t0 });
  garder(ei);
  check('disparu, échanges incertains : « de 15,6 BTC (sa plus grande taille lue) », retiré / échangé au cours de sa vie, le reste dit en dernier', /^Gros ordre d'achat de 15,6 BTC \(sa plus grande taille lue\) disparu à 81 798 \$, échanges incertains : au moins 12,0 BTC retirés, 3,50 BTC échangés au cours de sa vie ; on ne sait pas si ses derniers 0,035 BTC ont été échangés/.test(sp(ei.texte)) && ei.q === 15.6, ei);
}
check('absorbé : les BTC ÉCHANGÉS, « entièrement échangé »', /absorbé \(entièrement échangé\) : 13,0 BTC échangés/.test(evs[1].texte) && evs[1].q === 13, evs[1]);
check('« gros ordre » au prix exact : « (un seul prix) » ; « mur » : une tranche', evs.slice(0, 6).every(e => /^Gros ordre d/.test(e.texte) && /un seul prix/.test(e.texte)) && /^Mur de vente apparu : 31,0 BTC entre 100 100 et 100 120.\$/.test(sp(evs[10].texte)), evs.map(e => e.texte));
check('rafale : « d\'un seul coup (même milliseconde) », un seul prix s\'il n\'y en a qu\'un', /d'un seul coup \(même milliseconde\), de 80 936 à 80 943 \$/.test(sp(evs[6].texte)) && /, à 80.998 \$/.test(sp(evs[7].texte)), [evs[6].texte, evs[7].texte]);
check('prix qui passe un mur : prix live, « percé, pas cassé », la règle de travail dite', /^Le prix \(live\) passe sous le mur d'achat/.test(evs[8].texte) && /Percé, pas « cassé »/.test(sp(evs[8].texte)) && /deux clôtures 1 min/.test(evs[8].texte) && /règle de travail, non mesurée/.test(evs[8].texte), evs[8].texte);
check('niveau d\'options : « niveau d\'options « mur de gamma » », « modèle » et « lu à »', /niveau d'options « mur de gamma » 81 000 \$ \(modèle ; fichier lu à \d\d:\d\d UTC\)/.test(sp(evs[9].texte)) && evs[9].t === t0 + 30e3, evs[9]);
check('mur fondu : de 25 à 6 BTC, les échanges dits, « le prix n\'y est pas allé »', /de 25,0 à 6,00 BTC en moins d'une minute \(3,00 BTC échangés à ces prix ; le prix n'y est pas allé\)/.test(evs[11].texte), evs[11].texte);
check('symboles du journal = ceux de BM.FINS_MURS et BM.SYMBOLES_GUIDE (rien de renommé)', evs[0].s === BM.FINS_MURS.retire.s && evs[1].s === BM.FINS_MURS.echange.s && evs[5].s === BM.SYMBOLES_GUIDE.apparu.s && evs[8].s === BM.SYMBOLES_GUIDE.sous.s);
// Retiré pour l'essentiel PUIS touché : jamais « absorbé ». Le suivi réel (BM.SuiviMurs), lecture par lecture.
{
  const dep = (bids, id) => ({ lastUpdateId: id, bids: bids.map(([p, q]) => [p.toFixed(2), String(q)]), asks: [['80950.00', '1']] });
  const hz = { ecart: 0, u: 10 }, S = new BM.SuiviMurs(BM.MURS.seuilsBtc, 2000), fins = [];
  S.surTransition = (e, F, p) => { if (e.q1 !== 0) return; const it = p.items.find(x => x.n.c === e.c); fins.push(BM.evenementFinMur({ fin: e.fin, cote: e.cote, p: e.c / 100, q0: e.q0, qMax: Math.max(it.qMax, it.n.qMax), xN: e.xN, echange: it.n.echange, retire: it.n.retire, t: t0 })); };
  S.execution({ a: 1, T: -5000, p: '80000.00', q: '0.1', m: true });
  const lire = (k, bids) => { S.lecture(dep(bids, 10 + k), k * 2000, k * 2000 + 100, hz); S.completes(k * 2000 + 120); S.avancer(hz, k * 2000 + 200); };
  for (let k = 0; k < 6; k++) lire(k, [[80900, 15], [80890, 1]]);         // 15 BTC tenus 10 s
  lire(6, [[80900, 0.5], [80890, 1]]);                                      // 14,5 BTC retirés, sans échange
  S.execution({ a: 2, T: 6 * 2000 + 1000, p: '80900.00', q: '0.5', m: true }); // le reste est échangé (entre les lectures 6 et 7)
  lire(7, [[80890, 1]]);
  const f = fins[0] || {};
  garder(f);
  check('15 BTC retirés à 14,5 puis 0,5 échangé : « retiré pour l\'essentiel », les deux quantités dites, jamais « absorbé »', fins.length === 1 && f.type === 'essentiel' && !/absorbé/.test(f.texte + f.carte + f.court)
    && /retiré pour l'essentiel : 14,5 BTC retirés, 0,500 BTC échangés à 80 900 \$ \(jusqu'à 15,0 BTC/.test(sp(f.texte)), fins);
  // Le même suivi : un niveau vu en ENTRANT dans la bande lue (la lecture d'avant s'arrêtait au-dessus) est marqué.
  const S2 = new BM.SuiviMurs(BM.MURS.seuilsBtc, 2000);
  S2.lecture(dep([[80950, 1], [80930, 1]], 1), 0, 100, hz);
  S2.lecture(dep([[80940, 1], [80920, 1], [80900, 15]], 2), 2000, 2100, hz);
  S2.lecture(dep([[80940, 1], [80920, 1], [80900, 15], [80800, 1], [80700, 2]], 3), 4000, 4100, hz);
  const n900 = S2.niveaux.find(n => n.c === 8090000);
  check('niveau de 15 BTC sous le plus bas bid de la lecture d\'avant : « entré » (pas « apparu »)', n900 && n900.entre === true, n900);
  S2.lecture(dep([[80940, 1], [80920, 1], [80900, 15], [80850, 12], [80800, 1], [80700, 2]], 4), 6000, 6100, hz);
  const n850 = S2.niveaux.find(n => n.c === 8085000);
  check('niveau nouveau DANS la bande déjà lue : pas « entré » (il est bien apparu)', n850 && n850.entre === false, n850);
}

// ── 9b. Suite d'un passage : règle de travail ────────────────────────────────
titre('9b. suiteTraverse : percé en mèche, cassé après deux clôtures, retour ; bougies pas closes : on attend');
{
  const base = 60e3 * 1000, tr = { cote: 'b', p: 99980, pas: 20, t: base + 20e3 };
  const mn = cs => cs.map((c, i) => ({ t: base + i * 60e3, fin: base + (i + 1) * 60e3, c }));
  const fin2 = base + 2 * 60e3 + 1;
  check('bougie du passage pas close : rien encore', BM.suiteTraverse(tr, mn([99970]), base + 50e3) === null);
  check('clôture au-dessus du niveau : « percé en mèche »', BM.suiteTraverse(tr, mn([99985, 99990]), fin2).verdict === 'meche');
  check('deux clôtures sous le niveau : « cassé » (règle de travail)', BM.suiteTraverse(tr, mn([99970, 99960]), fin2).verdict === 'casse');
  check('une clôture sous, puis retour : « repasse »', BM.suiteTraverse(tr, mn([99970, 99990]), fin2).verdict === 'repasse');
  check('bougies manquantes au-delà de 5 min : « inconnu » (rien n\'est inventé)', BM.suiteTraverse(tr, [], tr.t + 6 * 60e3).verdict === 'inconnu');
  const ec = BM.evenementSuite(Object.assign({}, tr, BM.suiteTraverse(tr, mn([99970, 99960]), fin2))), em = BM.evenementSuite(Object.assign({}, tr, BM.suiteTraverse(tr, mn([99985]), fin2)));
  garder(ec, em);
  check('textes : « cassé selon la règle de travail : deux clôtures 1 min sous le niveau (HH:MM et HH:MM UTC…) » ; « percé en mèche »', /cassé selon la règle de travail : deux clôtures 1 min sous le niveau \(\d\d:\d\d et \d\d:\d\d UTC ; règle non mesurée\)/.test(ec.texte) && /percé en mèche : la bougie de \d\d:\d\d UTC a clôturé au-dessus/.test(em.texte) && ec.court.length <= 40 && em.court.length <= 40, [ec, em]);
}

// ── 9c. Lectures contiguës ───────────────────────────────────────────────────
titre('9c. lecturesContigues : rien n\'est comparé à travers un trou, une interruption, un guide éteint');
check('deux lectures à 2 s : contiguës', BM.lecturesContigues(1000, 3000, 2000, 'ok') === true);
check(`écart de plus d'une validité (${BM.validiteLecture(2000)} ms : onglet caché, lectures en échec) : pas contiguës`, BM.lecturesContigues(1000, 1000 + BM.validiteLecture(2000) + 1, 2000, 'ok') === false);
check('suivi des murs « interrompu » : pas contiguës', BM.lecturesContigues(1000, 3000, 2000, 'interrompu') === false);
check('pas de lecture d\'avant (guide rallumé) : pas contiguës', BM.lecturesContigues(null, 3000, 2000, 'ok') === false);

// ── 10. Journal ──────────────────────────────────────────────────────────────
titre('10. Journal : dédoublonné dans la minute, trié, borné ; marques regroupées par case');
const J = new BM.Journal(5);
const ev = (t, cle) => ({ t, cle, type: 'x', texte: cle });
check('premier ajout accepté', J.ajouter(ev(1000, 'a')) === true);
check('même clé dans la minute : compté (×2), pas répété', J.ajouter(ev(1000 + G.fusionMs, 'a')) === false && J.liste.length === 1 && J.liste[0].n === 2);
check('même clé plus d\'une minute après : nouvelle ligne', J.ajouter(ev(1000 + G.fusionMs + 1 + G.fusionMs, 'a')) === true && J.liste.length === 2);
J.ajouter(ev(500, 'b'));
check('trié par instant même si ajouté en retard', J.liste.map(e => e.t).every((t, i, l) => !i || l[i - 1] <= t), J.liste.map(e => e.t));
for (let i = 0; i < 10; i++) J.ajouter(ev(1e6 + i, 'c' + i));
check('borné à `garde`, les plus anciens oubliés', J.liste.length === 5 && J.liste[0].t === 1e6 + 5);
check('derniers(k) : le plus récent d\'abord', J.derniers(2).map(e => e.t).join() === [1e6 + 9, 1e6 + 8].join());
check('dans(ta, tb)', J.dans(1e6 + 6, 1e6 + 7).length === 2);
check('null ignoré', J.ajouter(null) === false);
const v0 = J.version; J.ajouter(ev(1e6 + 9, 'c9'));
check('chaque changement (même un ×n) change la version (le panneau se réécrit)', J.version === v0 + 1);
const pts = [{ x: 100, y: 100, ev: { q: 2, t: 1 } }, { x: 104, y: 102, ev: { q: 9, t: 2 } }, { x: 103, y: 101, ev: { q: 1, t: 3 } }, { x: 140, y: 100, ev: { q: 1, t: 4 } }];
const rg = BM.regrouperMarques(pts, G.marquePx);
check('marques d\'une même case : une seule (la plus grosse), le nombre gardé', rg.length === 2 && rg[0].ev.q === 9 && rg[0].evs.length === 3 && rg[1].evs.length === 1, rg);

// ── 11. Zones à surveiller ───────────────────────────────────────────────────
titre('11. zonesChargees : 3 tranches sommées, seuils, hors tranche du prix ; la zone reste quand le prix y entre ; pas de clignotement');
const base = (bz, az, mid) => {
  const b = new Map(), a = new Map();
  for (let kk = 4900; kk < 5000; kk++) b.set(kk, 2);
  for (let kk = 5000; kk < 5100; kk++) a.set(kk, 2);
  for (const [kk, q] of bz) b.set(kk, q);
  for (const [kk, q] of az) a.set(kk, q);
  return { pas: 20, b, a, mid, bas: 4900 * 20, haut: 5100 * 20 };
};
const C1 = base([[4980, 20], [4981, 20], [4982, 10]], [[5020, 40]], 100000);
const z1 = BM.zonesChargees(C1, null);
check('zone d\'achat trouvée : 99 600–99 660, 50 BTC', z1.bid && z1.bid.pBas === 99600 && z1.bid.pHaut === 99660 && z1.bid.q === 50, z1.bid);
check(`zone de vente : ≥ ${G.zoneMinBtc} BTC, la plus proche du prix`, z1.ask && z1.ask.q >= G.zoneMinBtc && z1.ask.pBas <= 5020 * 20 && z1.ask.pHaut > 5020 * 20, z1.ask);
check('zone d\'achat sous le prix, de vente au-dessus', z1.bid.pHaut <= C1.mid && z1.ask.pBas >= C1.mid);
check('rien d\'assez chargé : null (pas de zone inventée)', BM.zonesChargees(base([], [], 100000), null).bid === null);
const Cp = base([[4999, 60], [4998, 60]], [[5000, 60]], 100010);
const zp = BM.zonesChargees(Cp, null);
check('la tranche du prix et sa voisine ne font jamais une zone neuve', !zp.bid || zp.bid.pHaut <= (Math.floor(100010 / 20) - 1) * 20, zp.bid);
const C2 = base([[4980, 20], [4981, 20], [4982, 10], [4990, 30], [4991, 30]], [[5020, 40]], 99630);
const z2 = BM.zonesChargees(C2, z1);
check('le prix entre dans la zone : elle reste dessinée (on voit si elle est absorbée ou retirée)', z2.bid && z2.bid.k0 === z1.bid.k0, z2.bid);
const C3 = base([[4980, 1], [4990, 30], [4991, 30]], [[5020, 40]], 99630);
const z3 = BM.zonesChargees(C3, z1);
check('zone vidée : elle n\'est plus gardée', !z3.bid || z3.bid.k0 !== z1.bid.k0, z3.bid);
const C4 = base([[4980, 9], [4981, 9], [4982, 9]], [[5020, 40]], 100000);
let zg = z1;
const gardes = [];
for (let i = 0; i < 5; i++) { zg = BM.zonesChargees(C4, zg); gardes.push(zg.bid ? zg.bid.garde : null); }
check(`zone repassée sous les seuils (27 BTC) : gardée ${G.zoneGarde} lectures, puis oubliée (pas de clignotement)`, gardes.join() === [1, 2, 3, null, null].slice(0, G.zoneGarde + 2).join(), gardes);
check('carnet sans bande : rien', BM.zonesChargees({ pas: 20, b: new Map(), a: new Map(), mid: 1, bas: null, haut: null }, null).bid === null);
check('fuseau de l\'appareil en mots : UTC+2, UTC−3:30, UTC', BM.fuseau(-120) === 'UTC+2' && BM.fuseau(210) === 'UTC−3:30' && BM.fuseau(0) === 'UTC');

// ── 11b. Murs nommés d'une lecture à l'autre ─────────────────────────────────
titre('11b. suivreNommes + seuil lissé : un passage progressif est vu, un seuil qui bouge ne fait ni « apparu » ni clignotement ; une zone finit par s\'effacer');
{
  // La boucle de majGuide (js/bookmap.js), lecture après lecture : seuil lissé, hystérésis, suivi.
  const rejouer = (carnets, o) => {
    let etat = { nommes: new Map(), approches: new Map() }, meds = [], tr = [], noms = [];
    carnets.forEach((K, i) => {
      const C = BM.carnetGuide(K, 20), t = i * 2000, S = BM.seuilMur(C, { medianes: meds });
      meds = meds.concat(S.medianeLue === null ? [] : [S.medianeLue]).slice(-(G.seuilLectures - 1));
      const garder = new Set([...etat.nommes.keys(), ...etat.approches.keys()]);
      const murs = BM.mursProches(C, { seuil: S.seuil, sortie: S.sortie, garder }).map(m => Object.assign({ raison: null, depuis: null, qAvant: null }, m, (o && o.histoire) ? o.histoire(m, i) : {}));
      const r = BM.suivreNommes(etat, murs, C, t, true, { sortie: S.sortie });
      tr.push(...r.traverses.map(a => Object.assign({ i, mid: C.mid }, a)));
      noms.push(murs.map(m => m.cote + m.p));
      etat = { nommes: r.nommes, approches: r.approches };
    });
    return { tr, noms };
  };
  // Un mur d'achat de 60 BTC à 99 900–99 920 (0,3 BTC tous les 2 $ ailleurs) ; le prix descend.
  const livre = mid => {
    const bids = [], asks = [];
    for (let p = Math.floor(mid - 0.5); p > mid - 400; p -= 2) bids.push([p.toFixed(2), String(p >= 99900 && p < 99920 ? 6 : 0.3)]);
    for (let p = Math.ceil(mid + 0.5); p < mid + 400; p += 2) asks.push([p.toFixed(2), '0.3']);
    return BM.agregerCarnet({ bids, asks }, 20);
  };
  for (const pas of [10, 30]) {
    const n = Math.ceil(240 / pas) + 3, r = rejouer(Array.from({ length: n }, (_, i) => livre(100000 - i * pas)));
    check(`prix qui descend de ${pas} $ par lecture à travers un mur nommé : UN passage, au bon niveau, une fois le prix sous le mur`, r.tr.length === 1 && r.tr[0].p === 99900 && r.tr[0].mid < 99900, r.tr);
    const ev = r.tr[0] && BM.evenementTraverse({ cote: 'b', p: r.tr[0].p, pas: 20, q: r.tr[0].q, qAvant: r.tr[0].qAvant, t: t0 });
    if (ev) garder(ev);
    check('le passage d\'un mur approché dit sa taille quand il était nommé ET à la lecture d\'avant', !ev || r.tr[0].qAvant === null || /BTC quand il était nommé, .+ BTC à la lecture d'avant\)/.test(ev.texte), ev && ev.texte);
  }
  // Le prix approche le mur puis repart : aucun passage.
  const allerRetour = [0, 10, 20, 30, 40, 50, 60, 70, 60, 50, 40, 30, 20, 10, 0].map(d => livre(100000 - d));
  check('le prix approche un mur puis repart : aucun passage inventé', rejouer(allerRetour).tr.length === 0);
  // Seuil qui saute (médiane de ≈ 20 tranches) : une tranche immobile à 22,5 BTC, au-dessus puis au-dessous du seuil brut.
  const cg = (med, q) => {
    const b = new Map(), a = new Map();
    for (let kk = 4990; kk < 5000; kk++) b.set(kk, med);
    for (let kk = 5001; kk < 5011; kk++) a.set(kk, med);
    b.set(4993, q);
    return { mid: 100010, b, a, bas: 4990 * 20, haut: 5011 * 20, pas: 20 };
  };
  const brut = [], lisse = [];
  let meds = [], nommes = new Set();
  for (let i = 0; i < 24; i++) {
    const C = cg(i % 2 ? 13.1 : 10.9, 22.5), S0b = BM.seuilMur(C), S = BM.seuilMur(C, { medianes: meds });
    meds = meds.concat(S.medianeLue).slice(-(G.seuilLectures - 1));
    brut.push(BM.mursProches(C, { seuil: S0b.seuil }).some(m => m.k === 4993) ? 'X' : '.');
    const M = BM.mursProches(C, { seuil: S.seuil, sortie: S.sortie, garder: nommes });
    nommes = new Set(M.map(m => m.cote + m.k));
    lisse.push(M.some(m => m.k === 4993) ? 'X' : '.');
  }
  check('seuil brut d\'une lecture : la tranche immobile clignote (le défaut corrigé)', /X\./.test(brut.join('')) && /\.X/.test(brut.join('')), brut.join(''));
  check(`seuil lissé (${G.seuilLectures} lectures) + sortie à ${G.murSortiePart * 100} % : nommée sans clignoter`, /^X+$/.test(lisse.join('')), lisse.join(''));
  check('seuil de sortie = murSortiePart × seuil', Math.abs(BM.seuilMur(cg(11, 30)).sortie - G.murSortiePart * BM.seuilMur(cg(11, 30)).seuil) < 1e-9);
  // « Apparu » : seulement si la tranche a grossi, pas si le seuil est passé sous elle.
  const Ca = cg(5, 30), mur = { cote: 'bid', k: 4993, p: 4993 * 20, q: 30, raison: 'seuil' };
  let etat = { nommes: new Map(), approches: new Map() }, app = [[], []];
  [29, 8].forEach((qAvant, j) => {
    etat = { nommes: new Map(), approches: new Map() };
    for (let i = 0; i < G.nommeLectures; i++) {
      const r = BM.suivreNommes(etat, [Object.assign({}, mur, { depuis: 0, qAvant })], Ca, 2000 + i * 2000, true, { sortie: 8 });
      app[j].push(...r.apparus); etat = { nommes: r.nommes, approches: r.approches };
    }
  });
  check('tranche déjà à 29 BTC, nommée quand le seuil baisse : pas « apparu »', app[0].length === 0, app[0]);
  check(`tranche passée de 8 à 30 BTC : « apparu » une fois (après ${G.nommeLectures} lectures)`, app[1].length === 1, app[1]);
  // Zone qui retombe entre 30 BTC et le seuil d'entrée (carnet ordinaire de 10 BTC par tranche).
  const zb = (z, mid) => {
    const b = new Map(), a = new Map();
    for (let kk = 4900; kk < 5000; kk++) b.set(kk, 10);
    for (let kk = 5000; kk < 5100; kk++) a.set(kk, 10);
    for (const [kk, q] of z) b.set(kk, q);
    return { pas: 20, b, a, mid, bas: 4900 * 20, haut: 5100 * 20 };
  };
  let zz = BM.zonesChargees(zb([[4980, 20], [4981, 20], [4982, 20]], 100000), null);
  const z0 = zz.bid, suite = [];
  for (let i = 0; i < 8; i++) { zz = BM.zonesChargees(zb([[4980, 11], [4981, 11], [4982, 11]], 100000), zz); suite.push(zz.bid ? zz.bid.garde : null); }
  check(`zone de 60 BTC retombée à 33 BTC (le carnet ordinaire en a 30 partout) : gardée ${G.zoneGarde} lectures, puis effacée`, z0 && z0.q === 60 && suite.join() === [1, 2, 3, null, null, null, null, null].join(), { z0, suite });
}

// ── 13. Mode débutant : phrase, étiquettes, tendance, journal ────────────────
titre('13. Mode débutant : phrase du haut, étiquettes, sens du prix, journal en clair');
{
  const MD = require('./mots_debutant.js');
  const propre = t => !CONSEIL.test(t) && !ACCUSE.test(t) && !MD.motsInterdits(t).length;
  const debTextes = [];
  // a. La phrase du haut : 7 équilibres × 4 tendances × 5 âges × 3 prix.
  const eqs = [
    [{ qB: 120, qA: 60, sens: 'achat', usd: 160 }, {}],
    [{ qB: 60, qA: 120, sens: 'vente', usd: 160 }, {}],
    [{ qB: 80, qA: 82, sens: 'egal', usd: 160 }, {}],
    [{ qB: 0, qA: 0, sens: 'egal', usd: 160 }, {}],
    [{ qB: 80, qA: 82, sens: 'egal', usd: 160 }, { aucunRepere: true }],
    [{ qB: 120, qA: 60, sens: 'achat', usd: 160 }, { vide: 'ask' }],
    [{ qB: 60, qA: 120, sens: 'vente', usd: 160 }, { vide: 'bid' }],
  ];
  const tends = [null, { sens: 'hausse' }, { sens: 'baisse' }, { sens: 'stable' }];
  const MOTS_SENS = { hausse: 'en hausse', baisse: 'en baisse', stable: 'stable' };
  let maxL = 0, maxC = 0, okForme = true, avecPrix = 0, nPrix = 0;
  const pire = [], malF = [];
  for (const [r, e0] of eqs) for (const t of tends) for (const a of [400, 4900, 9900, 31e3, 59e3]) for (const prix of [undefined, 82548.3, 182548.6]) {
    const e = Object.assign({ prix }, e0), p = BM.phraseCarteDebutant(r, t, a, e);
    debTextes.push(p.long, p.court);
    if (p.long.length > maxL) { maxL = p.long.length; pire[0] = p.long; }
    if (p.court.length > maxC) { maxC = p.court.length; pire[1] = p.court; }
    // Âge : « à jour » sous 5 s (la ligne ne change pas chaque seconde), puis « à jour il y a N s ».
    const ageOk = new RegExp('(?:^À|· à) jour' + (a < G.ageFraisMs ? '' : ' il y a ' + Math.max(1, Math.ceil(a / 1000)) + ' s') + ' · pas une prévision$');
    const P = prix ? BM.prix(prix) + ' \\$' : null, S = t ? MOTS_SENS[t.sens] : null;
    const tete = P && S ? new RegExp('^Prix (' + P + ', )?' + S + ' · ') : S ? new RegExp('^Prix ' + S + ' · ') : P ? new RegExp('^Prix ' + P + ' · ') : /^(?!Prix)/;
    if (!ageOk.test(p.long) || !ageOk.test(p.court) || !tete.test(p.long)) { okForme = false; malF.push(p); }
    if (P) { nPrix++; if (p.long.startsWith('Prix ' + BM.prix(prix))) avecPrix++; }
  }
  check(`phrase longue ≤ 100 signes sur ${eqs.length * 60} cas (pire : ${maxL})`, maxL <= 100, pire[0]);
  check(`phrase courte ≤ 55 signes (pire : ${maxC})`, maxC <= 55, pire[1]);
  check('forme : « [Prix P $, ][en hausse|en baisse|stable] · … · à jour[ il y a N s] · pas une prévision », âge en secondes entières à partir de 5 s', okForme, malF.slice(0, 3));
  check(`5 s (a) : le prix est dans la ligne longue quand il est connu (${avecPrix} / ${nPrix} cas, tous)`, avecPrix === nPrix, { avecPrix, nPrix });
  const eq7 = eqs.map(([r, e]) => BM.phraseCarteDebutant(r, null, 2000, e).long.split(' · ')[0]);
  check('les 7 équilibres en mots (le côté vide est dit ; le côté le plus chargé seulement quand les deux ont un repère)',
    eq7.join('|') === 'Plus d’achats en attente|Plus de ventes en attente|Autant d’achats que de ventes|Aucun ordre en attente lu|Rien de marquant autour du prix|Rien de marquant au-dessus|Rien de marquant au-dessous', eq7);
  const c1 = BM.phraseCarteDebutant(eqs[0][0], tends[1], 2000, { prix: 82548.3 }), c2 = BM.phraseCarteDebutant(eqs[0][0], tends[1], 31e3, { prix: 82548.3 });
  check(`court : le prix quand il tient (« ${c1.court} »), sinon le sens seul (« ${c2.court} »)`, /^Prix 82.548 \$, en hausse · à jour · pas une prévision$/.test(sp(c1.court)) && /^Prix en hausse · à jour il y a 31 s · pas une prévision$/.test(c2.court), [c1, c2]);
  check('âge arrondi VERS LE HAUT : 0,4 s → « 1 s », 1,2 s → « 2 s », 59,1 s → « 60 s », jamais de virgule',
    BM.ageEntier(400) === '1 s' && BM.ageEntier(1200) === '2 s' && BM.ageEntier(59100) === '60 s' && BM.ageEntier(0) === '1 s' && BM.ageEntier(NaN) === '—', [BM.ageEntier(400), BM.ageEntier(1200), BM.ageEntier(59100)]);
  check(`âge de la ligne : « à jour » sous ${G.ageFraisMs / 1000} s, « à jour il y a 5 s » à 5 s`, BM.ageLigne(0) === 'à jour' && BM.ageLigne(4999) === 'à jour' && BM.ageLigne(5000) === 'à jour il y a 5 s' && BM.ageLigne(NaN) === 'à jour il y a —');
  // Le côté le plus chargé, tenu sensGardeMs : une lecture isolée de l'autre côté ne change rien.
  {
    let h = null; const vu = [];
    for (const [sens, t] of [['achat', 0], ['vente', 2e3], ['achat', 4e3], ['vente', 6e3], ['vente', 8e3], ['vente', 6e3 + G.sensGardeMs - 1], ['vente', 6e3 + G.sensGardeMs], ['egal', 20e3]]) { h = BM.sensStable(h, sens, t); vu.push(h.sens); }
    check(`côté le plus chargé tenu ${G.sensGardeMs / 1000} s : un aller-retour ne change rien, ${G.sensGardeMs / 1000} s du même autre côté le change`, vu.join() === 'achat,achat,achat,achat,achat,achat,vente,vente', vu);
  }
  const pause = BM.phraseCarteDebutant(eqs[0][0], tends[1], 2000, { pauseMs: 125e3 });
  const retard = BM.phraseCarteDebutant(eqs[0][0], tends[1], 31e3, { retardMs: 12e3, prix: 82548.3 });
  const cache = BM.phraseCarteDebutant(eqs[0][0], tends[1], 2000, { guideCache: true });
  debTextes.push(pause.long, retard.long, retard.court, cache.long);
  check(`pause : « Ordres en attente non relus depuis … · repères cachés » (${pause.long.length} ≤ 60)`, /^Ordres en attente non relus depuis 2 min · repères cachés$/.test(pause.long) && pause.long.length <= 60, pause);
  check(`retard des échanges (${retard.long.length} ≤ 100, court ${retard.court.length} ≤ 55)`, /^Prix 82.548 \$, en hausse · échanges en retard de 12 s · à jour il y a 31 s · pas une prévision$/.test(sp(retard.long)) && retard.long.length <= 100 && retard.court.length <= 55, retard);
  check('guide caché : la bande dit comment revenir', /^Guide caché : bouton «.Guide.» pour revoir les repères$/.test(cache.long) && cache.long.length <= 60, cache);
  check('sans lecture : « Lecture en cours… »', BM.phraseCarteDebutant(null, null, 0, {}).long === 'Lecture en cours…');
  // b. Étiquettes : ≤ 24 signes, prix avant « $ », jamais de « $ » en tête.
  let okE = true; const malE = [];
  for (const p of [9990, 10000, 82480, 82480.5, 99999, 100000, 123456.78, 250000]) for (const c of ['bid', 'ask']) {
    const e = BM.etiquetteNiveau(c, p); debTextes.push(e);
    if (!(e.length <= BM.ETIQUETTE_MAX && /^(Mur d’achat|Mur de vente) · [\d\u202f\u00a0]+\u00a0\$$/.test(e) && !/^\s*\$/.test(e))) { okE = false; malE.push(e); }
  }
  check(`étiquettes de 9 990 à 250 000 $, deux côtés : ≤ ${BM.ETIQUETTE_MAX} signes, « Mur d’achat / de vente · P $ »`, okE, malE);
  check('le côté décide du nom (achat sous le prix, vente au-dessus)', /^Mur d’achat/.test(BM.etiquetteNiveau('bid', 82480)) && /^Mur de vente/.test(BM.etiquetteNiveau('ask', 82600)));
  const autres = ['bid', 'ask'].flatMap(c => [BM.etiquetteDedans(c), BM.etiquetteVide(c)]);
  debTextes.push(...autres);
  check(`prix DANS la zone et côté sans repère : « ${autres.join(' », « ')} », ≤ ${BM.ETIQUETTE_MAX} signes`, autres.join('|') === 'Dans un mur d’achat|Pas de mur au-dessous|Dans un mur de vente|Pas de mur au-dessus' && autres.every(t => t.length <= BM.ETIQUETTE_MAX), autres);
  check('typographie : une espace insécable avant « : ; ? ! » (jamais en tête de ligne)', BM.typo('Âges : a ; b ? c !') === 'Âges\u00a0: a\u00a0; b\u00a0? c\u00a0!');
  // c. Sens du prix sur 15 min.
  const T0 = Date.UTC(2026, 9, 9, 7, 30, 0), maint = T0 + 20e3;
  const mins = (f, trou) => { const l = []; for (let t = T0 - 20 * 60e3; t <= T0; t += 60e3) if (t !== trou) l.push({ t, c: f(t) }); return l; };
  const tRef = Math.floor((maint - G.tendanceMs) / 60e3) * 60e3;
  const plat = 100000, fin = pct => t => (t === tRef ? plat : t === T0 ? plat * (1 + pct / 100) : plat);
  const th = BM.tendancePrix(mins(fin(0.12)), null, maint), tb = BM.tendancePrix(mins(fin(-0.12)), null, maint), ts = BM.tendancePrix(mins(fin(0.08)), null, maint), ts2 = BM.tendancePrix(mins(fin(-0.099)), null, maint);
  check(`hausse (+0,12 %), baisse (−0,12 %), stable (+0,08 % et −0,099 %) autour du seuil de ${G.tendancePct} %`, th.sens === 'hausse' && tb.sens === 'baisse' && ts.sens === 'stable' && ts2.sens === 'stable', [th, tb, ts, ts2].map(x => x && x.sens));
  check('référence : la clôture de la minute commencée 15 min plus tôt', th.de === plat && th.depuis === tRef && Math.abs(th.pct - 0.12) < 1e-9, th);
  check('une minute manquante dans la fenêtre : null (rien n\'est deviné)', BM.tendancePrix(mins(fin(0.12), T0 - 5 * 60e3), null, maint) === null);
  check('la minute de référence manquante : null', BM.tendancePrix(mins(fin(0.12), tRef), null, maint) === null);
  check('dernière bougie trop vieille (ne touche pas le présent) : null', BM.tendancePrix(mins(fin(0.12)), null, maint + 3 * 60e3) === null);
  const tv = BM.tendancePrix(mins(() => plat), { p: plat * 0.998, t: T0 + 15e3 }, maint), tvv = BM.tendancePrix(mins(() => plat), { p: plat * 0.998, t: T0 - 60e3 }, maint);
  check('un prix en direct plus récent que la dernière bougie est pris (−0,2 % → baisse) ; plus vieux : ignoré', tv.sens === 'baisse' && tv.a === plat * 0.998 && tv.t === T0 + 15e3 && tvv.sens === 'stable', [tv, tvv]);
  // d. Le résumé ouvert : 6 lignes, mêmes valeurs.
  const det = BM.detailCarteDebutant({ tendance: th, r: eqs[0][0], luMs: 2000,
    niveaux: { ask: { etiquette: BM.etiquetteNiveau('ask', 100060), q: 36.1, pBas: 100060, pHaut: 100080 }, bid: null },
    ages: { recentes: 2000, anciennes: 120e3, ronds: 1500, ligne: 10e3, autre: 4 * 60e3 } });
  debTextes.push(...det);
  const dS = det.map(sp);
  check('résumé ouvert : 6 lignes (prix, ordres en attente, les deux côtés, âges dont l\'autre plateforme, scénario au Terminal, photo pas prévision)', det.length === 6 && /^Prix : de 100.000 \$ à 100.120 \$ en 15 min \(\+0,12 %\)/.test(dS[0]) && /120 BTC à l'achat, 60,0 BTC à la vente/.test(dS[1])
    && /^Au-dessus : Mur de vente · 100.060 \$ \(36,1 BTC entre 100.060 et 100.080 \$\)\. Au-dessous : rien de nettement plus chargé/.test(dS[2]) && /^Âges : couleurs récentes 2,0 s, plus anciennes 2 min · ronds 1,5 s · ligne blanche 10 s · autre plateforme 4 min\.$/.test(dS[3])
    && /^Le scénario du matin de Claude est sur le Terminal/.test(dS[4]) && /pas une prévision.+mode Expert/.test(dS[5]), dS);
  check('résumé ouvert : jamais « : » en tête de ligne (espace insécable avant)', det.every(l => !/ [:;?!]/.test(l)), det);
  const detD = BM.detailCarteDebutant({ tendance: th, r: eqs[0][0], luMs: 2000, niveaux: { ask: { etiquette: BM.etiquetteDedans('ask'), q: 92, pBas: 100040, pHaut: 100100, dedans: true }, bid: null }, ages: {} });
  debTextes.push(...detD);
  check('résumé ouvert, prix dans la zone : « Au-dessus : le prix est dans un mur de vente (92,0 BTC entre … et … $) »', /^Au-dessus : le prix est dans un mur de vente \(92,0 BTC entre 100.040 et 100.100 \$\)\./.test(sp(detD[2])), detD[2]);
  // e. Journal : chaque type a sa phrase en clair, mêmes quantités et mêmes prix.
  const tj = Date.UTC(2026, 9, 9, 7, 31, 0);
  const evs = [
    ...['retire', 'echange', 'partiel', 'incertain'].flatMap(fin2 => ['b', 'a'].map(c => BM.evenementFinMur({ cote: c, p: 82600, q0: 36.1, qMax: 36.1, fin: fin2, echange: fin2 === 'retire' ? 0 : fin2 === 'echange' ? 36.1 : fin2 === 'partiel' ? 12 : null, retire: fin2 === 'partiel' ? 24.1 : 0, t: tj }))),
    BM.evenementFinMur({ cote: 'a', p: 82600, q0: 6.1, qMax: 36.1, fin: 'partiel', echange: 6.1, retire: 30, t: tj }),
    BM.evenementApparu({ cote: 'a', p: 82600, q: 36.1, t: tj }), BM.evenementApparu({ cote: 'b', p: 82480, q: 20, t: tj, grossi: true }),
    BM.evenementMurApparu({ cote: 'a', p: 82600, pas: 20, q: 36.1, t: tj }), BM.evenementMurApparu({ cote: 'b', p: 82420, pas: 20, q: 40, t: tj }),
    BM.evenementMurFondu({ cote: 'a', p: 82600, pas: 20, q0: 36.1, q1: 8.2, dureeMs: 90e3, echange: 0, t: tj }), BM.evenementMurFondu({ cote: 'b', p: 82420, pas: 20, q0: 40, q1: 8, dureeMs: 30e3, echange: null, t: tj }),
    BM.evenementRafale({ T: tj, achat: false, q: 12.3, vwap: 82400, pMin: 82396, pMax: 82403, aDeb: 1 }), BM.evenementRafale({ T: tj, achat: true, q: 12, vwap: 82410, pMin: 82410, pMax: 82410, aDeb: 2 }),
    BM.evenementTraverse({ cote: 'a', p: 82600, pas: 20, q: 36.1, t: tj }), BM.evenementTraverse({ cote: 'b', p: 82420, pas: 20, q: 40, t: tj }),
  ];
  const trj = { cote: 'a', p: 82600, pas: 20, t: tj };
  const m1 = { t: tj, fin: tj + 60e3, c: 82630 }, m2 = { t: tj + 60e3, fin: tj + 120e3, c: 82640 }, m2r = { t: tj + 60e3, fin: tj + 120e3, c: 82610 };
  evs.push(BM.evenementSuite(Object.assign({}, trj, { verdict: 'meche', m1: { t: tj, fin: tj + 60e3, c: 82610 } })), BM.evenementSuite(Object.assign({}, trj, { verdict: 'casse', m1, m2 })), BM.evenementSuite(Object.assign({}, trj, { verdict: 'repasse', m1, m2: m2r })));
  const nombres = s => (s.replace(/\b\d\d:\d\d(:\d\d)?\b/g, '').match(/\d[\d\u202f\u00a0]*(?:,\d+)?/g) || []).map(x => x.replace(/[\u202f\u00a0]/g, ''));
  let okJ = true; const malJ = [], types = new Set();
  for (const ev of evs) {
    types.add(ev.type);
    const d = ev.debutant; debTextes.push(d || '');
    const ref = nombres(ev.texte + ' ' + BM.prix(ev.p) + ' ' + BM.prix(ev.p, 2)), extra = nombres(d || '').filter(n => !ref.includes(n));
    if (!d || d.length > 110 || extra.length || /UTC/.test(d)) { okJ = false; malJ.push([ev.type, d, extra]); }
  }
  check(`journal : ${types.size} types (${[...types].join(', ')}), une phrase en clair chacun, ≤ 110 signes, sans « UTC », mêmes quantités et prix que le texte expert`, okJ && types.size >= 12, malJ);
  check('journal : les heures débutantes sont celles de l\'axe (heure de l\'appareil)', evs.at(-2).debutant.includes(BM.heure(tj)) && evs.at(-2).debutant.includes(BM.heure(tj + 60e3)), evs.at(-2).debutant);
  {
    // Les sentences débutantes des fins : dollars entiers, chaque quantité avec son unité, jamais « 0,000 BTC ».
    const fins = [BM.evenementFinMur({ cote: 'a', p: 82554.39, q0: 0, qMax: 13.7, fin: 'retire', echange: 0.78, retire: 13.7, t: tj }),
      BM.evenementFinMur({ cote: 'b', p: 82554.39, q0: 13.7, qMax: 13.7, fin: 'partiel', echange: 0.78, retire: 0, t: tj }),
      BM.evenementFinMur({ cote: 'b', p: 82554.39, q0: 13.7, qMax: 13.7, fin: 'partiel', echange: 0.78, retire: 12.9, t: tj }),
      BM.evenementApparu({ cote: 'a', p: 82554.39, q: 13.7, t: tj })];
    const dd = fins.map(e => e.debutant);
    debTextes.push(...dd);
    check(`journal débutant : prix en dollars entiers, « BTC » après chaque quantité, jamais « 0,000 BTC » (${dd.join(' | ')})`,
      dd.every(d => /82.554\u00a0\$/.test(d) && !/82.554,39/.test(d) && !/0,000/.test(d) && !/\d,\d+(?! BTC)\)/.test(d) && !/ \d+,\d+ (échangés|retirés)/.test(d)), dd);
  }
  check('journal : « cassé » n\'est jamais dit au débutant (le fait : deux minutes de suite)', evs.every(e => !/cass/i.test(e.debutant)), evs.map(e => e.debutant));
  check('journal : niveau d\'options non listé en débutant (estimation)', BM.evenementOptions({ nom: 'Mur call', court: 'CW', p: 85000, pAxe: 85000, t: tj, luA: tj }).debutant === null);
  // f. Mots : tout ce qui est produit pour le débutant passe CONSEIL, ACCUSE et la liste débutant.
  const mal = debTextes.filter(t => !propre(t));
  check(`${debTextes.length} textes débutant : ni conseil, ni intention prêtée, ni mot technique (tests/mots_debutant.js)`, !mal.length, mal.map(t => [t, MD.motsInterdits(t)]));
  garder(...debTextes);
}

// ── 12. Constantes et mots ───────────────────────────────────────────────────
titre('12. Constantes et mots');
check('journal : murs d\'au moins 10 BTC, au plus 12 lignes montrées', G.journalMurBtc === 10 && G.journalMax === 12);
check('constantes positives et cohérentes', Object.values(G).every(v => typeof v === 'number' && v > 0) && G.absorbePart < 1 && G.fondPart < 1 && G.varMinPart < 1 && G.murFacteur > 1);
const tous = textes.join('\n');
check(`aucun conseil dans ${textes.length} textes produits`, !CONSEIL.test(tous), tous.match(CONSEIL));
check('aucune intention prêtée', !ACCUSE.test(tous), tous.match(ACCUSE));
check('aucun libellé ne commence par « $ »', textes.every(s => !/^\s*\$/.test(s)));
for (const f of ['bookmap.html', 'css/bookmap.css', 'js/bookmap-calc.js', 'js/bookmap.js']) {
  const s = fs.readFileSync(path.join(REPO, f), 'utf8');
  check(`${f} : ni conseil ni intention prêtée (commentaires compris)`, !CONSEIL.test(s) && !ACCUSE.test(s), (s.match(CONSEIL) || s.match(ACCUSE) || [])[0]);
}

console.log(ko ? `\n❌ GUIDE DE LA CARTE : ${ko} contrôle(s) en échec` : '\n✅ GUIDE DE LA CARTE : TOUS LES CONTRÔLES PASSENT');
process.exit(ko ? 1 : 0);
