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
check('bande lue en $ : [plus bas bid, plus haut ask + 1 tranche[', C.bas === 99700 && C.haut === 100300, [C.bas, C.haut]);
check('regroupement exact : Σ conservée côté achat', Math.abs([...C.b.values()].reduce((a, b) => a + b, 0) - 102) < 1e-9);
check('tranche 99 980–100 000 = 12 + 4', C.b.get(Math.floor(99980 / 20)) === 16, C.b.get(4999));
check('sans un côté : null (rien d\'inventé)', BM.carnetGuide(carnet([[100, 1]], []), 20) === null);

// ── 3. Murs proches ──────────────────────────────────────────────────────────
titre('3. mursProches / murPlusProche : seuil, côté, bande, ±1 %');
const M = BM.mursProches(C);
const mb = M.filter(m => m.cote === 'bid'), ma = M.filter(m => m.cote === 'ask');
check(`au plus ${G.parCote} par côté, les plus chargés d'abord`, mb.length === 2 && ma.length === 2 && mb[0].q >= mb[1].q && ma[0].q >= ma[1].q, M);
check(`chacun ≥ ${G.murMinBtc} BTC`, M.every(m => m.q >= G.murMinBtc), M);
check('les bids sous le prix, les asks au-dessus', mb.every(m => m.p < C.mid) && ma.every(m => m.p + C.pas > C.mid));
check('le plus gros bid (99 800, 50 BTC) puis 99 940 (30 BTC)', mb[0].p === 99800 && mb[1].p === 99940, mb);
const Cserre = Object.assign({}, C, { haut: 100120 });
check('une tranche hors de la bande lue n\'est jamais nommée', !BM.mursProches(Cserre).some(m => m.p >= 100120), BM.mursProches(Cserre));
check('à plus de ±1 % du prix : ignoré', !BM.mursProches(C, { procheMaxPct: 0.1 }).some(m => Math.abs(m.p - C.mid) / C.mid > 0.001 + C.pas / C.mid));
const pb = BM.murPlusProche(C, 'bid'), pa = BM.murPlusProche(C, 'ask');
check('le mur d\'achat le plus proche : 99 980–100 000 (16 BTC)', pb.p === 99980 && pb.pas === 20, pb);
check('le mur de vente le plus proche : 100 020–100 040 (16 BTC)', pa.p === 100020, pa);
check('écart mesuré au bord le plus proche : négatif sous le prix, positif au-dessus', pb.ecartPct < 0 && pa.ecartPct > 0 && Math.abs(pb.ecartPct - (100000 - C.mid) / C.mid * 100) < 1e-9, [pb.ecartPct, pa.ecartPct]);
check('rien sous le seuil : null', BM.murPlusProche(C, 'bid', { murMinBtc: 1000 }) === null);

// ── 4. Résumé ────────────────────────────────────────────────────────────────
titre('4. resumeCarnet / phraseResume : même bande des deux côtés, lu à…');
const r = BM.resumeCarnet(C);
const couvert = Math.min(C.mid - C.bas, C.haut - C.mid) / C.mid * 100;
check('bande réduite à ce que le carnet couvre des DEUX côtés', r.reduite === true && Math.abs(r.bande - couvert) < 1e-12 && r.bande < G.bandePct, r);
check('bande pleine quand le carnet va assez loin', BM.resumeCarnet(Object.assign({}, C, { bas: 90000, haut: 110000 })).reduite === false);
let qB = 0, qA = 0;
for (const [k, q] of C.b) if (Math.abs((k + 0.5) * C.pas - C.mid) <= C.mid * r.bande / 100) qB += q;
for (const [k, q] of C.a) if (Math.abs((k + 0.5) * C.pas - C.mid) <= C.mid * r.bande / 100) qA += q;
check('Σ achat / vente dans la bande (milieu de tranche dedans)', Math.abs(r.qB - qB) < 1e-9 && Math.abs(r.qA - qA) < 1e-9, { r, qB, qA });
check('sens d\'après le rapport (convention ' + G.rapportNet + ')', r.sens === (r.rapport >= G.rapportNet ? 'achat' : r.rapport <= 1 / G.rapportNet ? 'vente' : 'autant'), r);
const murs = { bid: pb, ask: pa };
const deb = BM.phraseResume(r, murs, 'debutant', 'il y a 2,0 s'), exp = BM.phraseResume(r, murs, 'expert', 'il y a 2,0 s');
garder(deb, exp);
check('débutant : une phrase, en mots, qui dit ce qui est compté et quand (l\'âge d\'abord : coupée, elle le garde)', /ordres d'(?:achat|vente)/.test(deb) && /tout le carnet lu/.test(deb) && /^Carnet lu il y a 2,0 s : /.test(deb), deb);
check('débutant : le mur le plus proche avec sa tranche et son écart au milieu du carnet', deb.includes(BM.prix(99980) + '–' + BM.prix(100000) + ' $') && /du milieu du carnet/.test(deb), deb);
check('expert : les chiffres seuls (pas de phrase)', !/ordres d'achat/.test(exp) && /×/.test(exp) && exp.split(' · ').length === 4 && /^carnet live il y a 2,0 s · /.test(exp), exp);
check('aucune direction annoncée (pas de « va monter / baisser », pas de probabilité)', !/monter|baisser|hausse|baisse|probab|chance/i.test(deb + exp), deb);
const r0 = BM.resumeCarnet(Object.assign({}, C, { b: new Map(), a: C.a }));
const p0 = BM.phraseResume(r0, { bid: null, ask: pa }, 'debutant', 'il y a 1 s');
garder(p0);
check('sans mur d\'achat : « aucun mur… », pas « 0 »', /Aucun mur d'achat d'au moins 10 BTC/.test(p0) && !/\b0 BTC/.test(p0), p0);
const pIn = BM.phraseResume(r, { bid: Object.assign({}, pb, { ecartPct: -0.001 }), ask: pa }, 'debutant', 'il y a 1 s');
check('prix dans la tranche : « au prix », pas « −0,00 % »', /au prix/.test(pIn) && !/0,00 %/.test(pIn), pIn);
check('carnet absent : résumé vide (rien d\'affiché, rien d\'inventé)', BM.resumeCarnet(null) === null && BM.phraseResume(null) === '');

// ── 5. Histoire d'un mur dans le carnet live ─────────────────────────────────
titre('5. histoireLive : série ininterrompue, fenêtre, lecture manquée');
// Faux carnet live : n lectures toutes les 2 s, quantités par tranche de 10 $ données par f(c, pb).
const live = (n, f, trou) => ({ n, dp: 10, deb: Array.from({ length: n }, (_, c) => 1e6 + c * 2000), fin: Array.from({ length: n }, (_, c) => 1e6 + c * 2000 + (c === trou ? -500 : 2000)),
  quantite: (c, pbx, cote) => (cote === 'b' ? f(c, pbx) : 0) });
const k = 4999;                       // tranche 99 980–100 000, en tranches de 20 $ : 10 $ × 2
const qa = c => (c < 100 ? 2 : c < 400 ? 12 : 20);   // apparaît (≥ 10) à la lecture 100, grossit à 400
const L = live(500, (c, pbx) => (pbx === k * 2 ? qa(c) : 0));
const h = BM.histoireLive(L, k, 20, 'b', 10, 600e3);
check('« depuis » = première lecture ≥ seuil de la série qui finit maintenant', h.depuis === L.deb[100] && h.depuisDebut === false, h);
check('taille d\'il y a 10 min lue à la bonne lecture', h.tF === L.deb[499 - 300] && h.qF === 12, h);
const Lt = live(500, (c, pbx) => (pbx === k * 2 ? qa(c) : 0), 300);
const ht = BM.histoireLive(Lt, k, 20, 'b', 10, 600e3);
check('une lecture manquée coupe la série (on ne sait pas d\'avant)', ht.depuis === Lt.deb[301] && ht.qF === null && ht.tO === Lt.deb[301], ht);
const Lb = live(50, (c, pbx) => (pbx === k * 2 ? 15 : 0));
const hb = BM.histoireLive(Lb, k, 20, 'b', 10, 600e3);
check('série qui touche la plus ancienne lecture : depuisDebut (→ « au moins »)', hb.depuisDebut === true && hb.depuis === Lb.deb[0], hb);
check('sous le seuil maintenant : depuis = null', BM.histoireLive(live(10, () => 1), k, 20, 'b', 10, 600e3).depuis === null);
check('sans lecture : null', BM.histoireLive({ n: 0 }, k, 20, 'b', 10, 1) === null);

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
titre('7. variationMur : grossit / fond / peu changé — exécutions non lues ≠ aucune');
const vG = BM.variationMur(30, 20, 600e3, 0), vF = BM.variationMur(10, 20, 600e3, 4), vS = BM.variationMur(21, 20, 600e3, 0), vN = BM.variationMur(10, 20, 600e3, null);
garder(vG, vF, vS, vN);
check('+10 BTC sur 10 min : grossit', vG.sens === 'grossit' && /grossit \(\+10,0 BTC en 10 min\)/.test(vG.texte), vG);
check('−10 BTC avec 4 échangés : fond, et les échanges dits', vF.sens === 'fond' && /4,00 BTC échangés à ces prix/.test(vF.texte), vF);
check('+1 BTC : sous les seuils (convention) → peu changé, avec le chiffre', vS.sens === 'stable' && /peu changé/.test(vS.texte) && /\+1,00 BTC/.test(vS.texte), vS);
check('exécutions non lues : dit tel quel, jamais « aucun échange »', /exécutions non lues/.test(vN.texte) && !/aucun échange/.test(vN.texte), vN);
check('moins d\'une minute d\'historique : pas de variation', BM.variationMur(30, 20, 30e3, 0) === null && BM.variationMur(30, null, 600e3, 0) === null);

// ── 8. Libellés des murs ─────────────────────────────────────────────────────
titre('8. texteMur : débutant en phrases, expert en chiffres, court ≤ 40 signes');
const now = 5e6;
const cas = [
  { cote: 'bid', p: 99980, q: 16, depuis: now - 4200e3, auMoins: false, variation: vG, source: 'live' },
  { cote: 'ask', p: 100020, q: 123.4, depuis: now - 20e3, auMoins: true, variation: null, source: 'live' },
  { cote: 'ask', p: 100020, q: 16, depuis: now - 20e3, auMoins: false, variation: null, source: 'live' },
  { cote: 'bid', p: 99980, q: 16, depuis: null, auMoins: false, variation: vN, source: 'live' },
  { cote: 'ask', p: 100020, q: 55, source: 'publie', luA: t0 },
];
for (const mode of ['debutant', 'expert']) for (const m of cas) {
  const t = BM.texteMur(m, mode, now);
  garder(t);
  check(`${mode} ${m.source} ${m.cote} : court ≤ 40 signes et ne commence pas par « $ »`, t.court.length <= 40 && !/^\$/.test(t.court) && t.lignes.every(l => !/^\$/.test(l)), t);
}
const tD = BM.texteMur(cas[0], 'debutant', now), tE = BM.texteMur(cas[0], 'expert', now);
check('débutant : « Mur d\'achat », « là depuis 1 h 10 », la variation en mots', /^Mur d'achat · 16,0 BTC · là depuis 1 h 10/.test(tD.lignes[0]) && /grossit/.test(tD.lignes[1]), tD);
check('expert : une ligne de chiffres', tE.lignes.length === 1 && /^Bid 16,0 BTC/.test(tE.lignes[0]), tE);
const tA = BM.texteMur(cas[1], 'debutant', now), tB = BM.texteMur(cas[2], 'debutant', now);
check('série au bord de ce qui est lu : « là dès la première lecture », pas « sans interruption »', /là dès la première lecture/.test(tA.lignes[0]) && /là sans interruption depuis moins d'une minute/.test(tB.lignes[0]), [tA, tB]);
const tP = BM.texteMur(cas[4], 'debutant', now);
check('mur publié : « lu à HH:MM UTC » (fichier de 15 min)', tP.lignes[0].includes('lu à ' + BM.heureUtc(t0) + ' UTC'), tP);
check('le seuil « Mur » en BTC est celui de BM.GUIDE (10)', G.murMinBtc === 10 && G.trancheUsd === 20);

// ── 9. Évènements ────────────────────────────────────────────────────────────
titre('9. Évènements du journal : phrases, heure UTC, court ≤ 40 signes');
const evs = [
  ...['retire', 'echange', 'partiel', 'incertain'].map(fin => BM.evenementFinMur({ fin, cote: 'b', p: 99987.5, q0: 0.34, qMax: 12.5, xN: fin === 'echange' ? 13 : 2, t: t0 })),
  BM.evenementFinMur({ fin: 'retire', cote: 'a', p: 100100, q0: 12.5, qMax: 12.5, xN: 0, t: t0 }),
  BM.evenementApparu({ cote: 'a', p: 100100, q: 25, t: t0 }),
  BM.evenementRafale({ T: t0, achat: false, q: 24.5, vwap: 80940, pMin: 80936, pMax: 80943, aDeb: 7 }),
  BM.evenementRafale({ T: t0, achat: true, q: 12, vwap: 80998, pMin: 80998, pMax: 80998, aDeb: 8 }),
  BM.evenementTraverse({ cote: 'b', p: 99980, pas: 20, q: 16, t: t0 }),
  BM.evenementOptions({ nom: 'Mur de gamma', court: 'GW', p: 81000, pAxe: 81003, t: t0, luA: t0 - 900e3 }),
];
for (const ev of evs) {
  garder(ev);
  check(`${ev.type} ${ev.cote || ''} : court ≤ 40 signes, heure UTC sur la carte, symbole`, ev.court.length <= 40 && !/^\$/.test(ev.court) && /\d\d:\d\d(?::\d\d)? UTC/.test(ev.carte) && ev.s && ev.cle, ev);
}
check('fin hors classement (« toujours là », « interrompu ») : pas d\'évènement', BM.evenementFinMur({ fin: 'la', cote: 'b', p: 1, q0: 1, t: 1 }) === null && BM.evenementFinMur({ fin: 'interrompu', cote: 'b', p: 1, q0: 1, t: 1 }) === null);
check('retiré : la taille la plus grande lue est dite (pas seulement le reste)', /jusqu'à 12,5 BTC plus tôt/.test(evs[0].texte) && !/plus tôt/.test(evs[4].texte), [evs[0].texte, evs[4].texte]);
check('absorbé : les BTC ÉCHANGÉS, pas la taille posée', /13,0 BTC échangés/.test(evs[1].texte) && evs[1].q === 13, evs[1]);
check('rafale : « dans la même milliseconde », un seul prix s\'il n\'y en a qu\'un', /de 80 936 à 80 943 \$/.test(evs[6].texte.replace(/\u202f|\u00a0/g, ' ')) && /, à 80.998 \$/.test(evs[7].texte), [evs[6].texte, evs[7].texte]);
check('prix qui passe un mur : prix live, « pas une cassure confirmée »', /pas une cassure confirmée/.test(evs[8].texte), evs[8].texte);
check('niveau d\'options : « modèle » et « lu à »', /modèle/.test(evs[9].texte) && /lu à \d\d:\d\d UTC/.test(evs[9].texte), evs[9].texte);
check('symboles du journal = ceux de BM.FINS_MURS (rien de renommé)', evs[0].s === BM.FINS_MURS.retire.s && evs[1].s === BM.FINS_MURS.echange.s);

// ── 10. Journal ──────────────────────────────────────────────────────────────
titre('10. Journal : dédoublonné dans la minute, trié, borné');
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

// ── 11. Zones à surveiller ───────────────────────────────────────────────────
titre('11. zonesChargees : 3 tranches sommées, seuils, la zone d\'avant reste quand le prix y entre');
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
const C2 = base([[4980, 20], [4981, 20], [4982, 10], [4990, 30], [4991, 30]], [[5020, 40]], 99630);
const z2 = BM.zonesChargees(C2, z1);
check('le prix entre dans la zone : elle reste dessinée (on voit si elle est absorbée ou retirée)', z2.bid && z2.bid.k0 === z1.bid.k0, z2.bid);
const C3 = base([[4980, 1], [4990, 30], [4991, 30]], [[5020, 40]], 99630);
const z3 = BM.zonesChargees(C3, z1);
check('zone vidée : elle n\'est plus gardée', !z3.bid || z3.bid.k0 !== z1.bid.k0, z3.bid);
check('carnet sans bande : rien', BM.zonesChargees({ pas: 20, b: new Map(), a: new Map(), mid: 1, bas: null, haut: null }, null).bid === null);

// ── 12. Constantes et mots ───────────────────────────────────────────────────
titre('12. Constantes et mots');
check('journal : murs d\'au moins 10 BTC, au plus 12 lignes montrées', G.journalMurBtc === 10 && G.journalMax === 12);
check('constantes positives et cohérentes', Object.values(G).every(v => typeof v === 'number' && v > 0) && G.presencePart < 1 && G.varMinPart < 1);
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
