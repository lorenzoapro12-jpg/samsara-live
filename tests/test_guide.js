// Guide du graphique (js/guide.js) — hors ligne : le cœur pur, puis son câblage dans la page.
//
// CE QUI EST VÉRIFIÉ
//   1. formats : « 84 120 $ », jamais un libellé qui commence par « $ » ; intervalles et durées en mots ;
//   2. niveaux nommés : plus haut / bas d'hier et des 24 h lus sur les bougies (rien sur une
//      fenêtre incomplète), murs et options du fichier avec « lu à HH:MM » et « modèle », champ
//      absent = niveau absent (jamais 0), fusion en une bande « 2 raisons », au plus N par côté ;
//   3. règle de cassure (règle de travail) : 1/2 puis 2/2 clôtures, retour réussi, mèche seule,
//      état au prix LIVE (en test, proche, loin, franchi en séance, prix absent) ;
//   4. régime : tendance, sans tendance, compression — seuils lus dans PARAM.guide ;
//   5. formes : double sommet / creux, range, triangle détectés ; états qui évoluent ; AUCUN
//      regard vers l'avenir (une détection sur un historique tronqué = la même sur l'historique
//      complet) ; bilan compté, « échantillon faible », aucune probabilité ;
//   6. suite et lecture du moment : tirées des niveaux nommés, sans conseil ni intention prêtée ;
//   7. dans la page : PARAM.guide porte chaque paramètre lu par js/guide.js, entrée « Guide »
//      du menu avec sa fiche, choix gardé (samsara-guide-v1), marge de futur d'une seule formule,
//      même valeur dans les deux modes.
// USAGE   node tests/test_guide.js
const fs = require('fs'), path = require('path'), vm = require('vm');
const REPO = path.resolve(__dirname, '..');
const G = require(path.join(REPO, 'js/guide.js'));
const { chargerPage } = require('./bac');

let ko = 0;
const check = (nom, ok, det) => { if (!ok) ko++; console.log(`  ${ok ? '✓' : '✗'} ${nom}${!ok && det !== undefined ? ' — ' + JSON.stringify(det).slice(0, 400) : ''}`); };
const titre = t => console.log(`\n── ${t} ──`);
const CONSEIL = /\b(achetez|vendez|achète[rz]?\b|vends\b|il faut (?:acheter|vendre)|entrez|sortez|prenez position|signal d['’]achat|signal de vente|recommand(?:e|ons))/i;
const ACCUSE = /spoof|manipul|leurre|tromper|tromperie|faux (?:mur|ordre)s?|fake|bluff|pi[eè]ge/i;

// Les paramètres RÉELS de la page (PARAM.guide, js/app.js), lus dans le bac à sable.
const page = chargerPage();
const dansPage = code => vm.runInContext(code, page.sandbox);
const P = dansPage('PARAM.guide');
const textes = [];                       // tout ce que le Guide écrit, relu à la fin (conseil, intention)
const t = s => { textes.push(s); return s; };

// ── Outils : bougies synthétiques et ATR (même définition que calcATR de la page) ──
function atrDe(H, L, C, n) {
  const tr = [null];
  for (let i = 1; i < C.length; i++) tr.push(Math.max(H[i] - L[i], Math.abs(H[i] - C[i - 1]), Math.abs(L[i] - C[i - 1])));
  const a = new Array(C.length).fill(null);
  let s = 0; for (let i = 1; i <= n; i++) s += tr[i];
  a[n] = s / n;
  for (let i = n + 1; i < C.length; i++) a[i] = (a[i - 1] * (n - 1) + tr[i]) / n;
  return a;
}
/** Une série qui suit `chemin` (clôtures), chaque bougie de ±d autour d'elle. */
function serie(chemin, d) {
  const C = chemin.slice(), H = [], L = [], O = [];
  // Ouverture à mi-chemin de la clôture précédente : deux bougies voisines n'ont jamais le même
  // extrême (un pivot fractal demande un sommet STRICTEMENT plus haut que ses voisins).
  for (let i = 0; i < C.length; i++) { const o = i ? (C[i - 1] + C[i]) / 2 : C[0]; O.push(o); H.push(Math.max(o, C[i]) + d); L.push(Math.min(o, C[i]) - d); }
  return { O, H, L, C };
}
const lin = (a, b, n) => Array.from({ length: n }, (_, i) => a + (b - a) * (i + 1) / n);

// ── 1. Formats ──
titre('1. Formats : des nombres à la française, jamais un « $ » en tête');
check('84120 → « 84 120 $ » ; 0,5123 → « 0,5123 $ » ; ratio BTC/SOL en « SOL »', G.prix(84120) === '84 120 $' && G.prix(0.5123) === '0,5123 $' && G.prix(412.5, 'SOL') === '412,50 SOL', [G.prix(84120), G.prix(0.5123)]);
check('valeur absente → « — » (jamais 0)', G.prix(null) === '—' && G.prix(NaN) === '—' && G.pct(undefined) === '—');
check('pourcentages signés : +1,2 % / −0,8 %', G.pct(1.234) === '+1,2 %' && G.pct(-0.84) === '−0,8 %', [G.pct(1.234), G.pct(-0.84)]);
check('intervalles en mots : 15 min, 4 h, 1 jour, 1 semaine', G.nomIntervalle('15m') === '15 min' && G.nomIntervalle('4h') === '4 h' && G.nomIntervalle('1d') === '1 jour' && G.nomIntervalle('1w') === '1 semaine');
check('durées : 31 j, 18 h', G.duree(31 * 86400) === '31 j' && G.duree(18 * 3600) === '18 h');

// ── 2. Niveaux nommés ──
titre('2. Niveaux nommés : leur origine en mots');
{
  // Trois jours de bougies 1 h : hier, plus haut 110 à 14 h, plus bas 90 à 03 h.
  const pas = 3600, j0 = 20000 * 86400, n = 72, T = [], H = [], L = [];
  for (let i = 0; i < n; i++) { T.push(j0 + i * pas); H.push(101); L.push(99); }
  H[24 + 14] = 110; L[24 + 3] = 90; H[60] = 105; L[70] = 97;
  const niv = G.niveauxDuJour(T, H, L, n, pas), de = cle => (niv.find(x => x.cle === cle) || {}).p;
  check('plus haut / plus bas d’hier (journée UTC) : 110 et 90', de('hier_haut') === 110 && de('hier_bas') === 90, niv);
  check('plus haut / plus bas des 24 h glissantes, bougie en cours comprise : 105 et 97', de('h24_haut') === 105 && de('h24_bas') === 97, niv);
  const partiel = G.niveauxDuJour(T.slice(30), H.slice(30), L.slice(30), n - 30, pas);
  check('hier incomplet dans l’historique chargé → aucun « plus haut d’hier » (pas de demi-journée)', !partiel.some(x => x.cle === 'hier_haut'), partiel.map(x => x.cle));
  const jour = G.niveauxDuJour([0, 86400, 172800], [10, 12, 11], [8, 9, 7], 3, 86400);
  check('en 1 jour : la bougie d’hier ; en 1 semaine : « semaine dernière »', jour.find(x => x.cle === 'hier_haut').p === 12
    && G.niveauxDuJour([0, 604800, 1209600], [10, 12, 11], [8, 9, 7], 3, 604800).some(x => x.cle === 'sem_haut'));
}
{
  const md = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'contre', 'publication.json'), 'utf8'));
  const pub = G.niveauxPublies(md), achat = pub.find(x => x.cle === 'mur_achat'), put = pub.find(x => x.cle === 'put_wall');
  const plusGros = md.liquidity.bid_walls.reduce((a, b) => (b[1] > a[1] ? b : a));
  const hm = md.liquidity.snapshot_at.slice(11, 16);
  check('mur d’achat = la plus grosse tranche publiée, au milieu de sa tranche, « lu à " + hm + " »'.replace('" + hm + "', hm),
    achat && achat.p === plusGros[0] + md.liquidity.wall_bin_usd / 2 && t(achat.detail).includes('lu à ' + hm) && /BTC/.test(achat.detail), achat);
  check('mur de puts, de calls, zéro gamma : nature « modèle », dite dans le libellé', ['put_wall', 'call_wall', 'zero_gamma'].every(k => { const x = pub.find(y => y.cle === k); return x && x.nature === 'modèle' && /modèle/.test(x.detail); }));
  check('strike en USD placé sur l’axe USDT : p / usdt_usd', put && Math.abs(put.p - md.micro.put_wall / md.micro.usdt_usd) < 1e-9 && put.strike === md.micro.put_wall, put);
  const sans = JSON.parse(JSON.stringify(md)); delete sans.micro.zero_gamma; sans.liquidity.ask_walls = [];
  const pub2 = G.niveauxPublies(sans);
  check('champ absent → niveau absent (jamais un niveau à 0)', !pub2.some(x => x.cle === 'zero_gamma' || x.cle === 'mur_vente') && pub2.every(x => x.p > 0));
  check('aucune publication (autre paire que BTCUSDT) → aucun niveau publié', G.niveauxPublies(null).length === 0);
  const sr = G.niveauxSR([{ price: 83000, touches: 4, tf: '4h' }, { price: 82000, touches: 1, tf: '1h' }], P);
  check('S/R : « Zone touchée 4 fois (4h) » ; une touche unique ne fait pas un niveau du Guide', sr.length === 1 && t(sr[0].nom) === 'Zone touchée 4 fois (4h)', sr);
}
{
  const R = (cle, p, nom) => ({ cle, p, nom, court: nom, art: 'le ' + nom, origine: '', nature: 'mesuré', detail: '', detailCourt: '' });
  const ref = 82600;
  const choix = G.choisirNiveaux([R('a', 84120, 'Plus haut d’hier'), R('b', 84200, 'Zone touchée 3 fois (1h)'), R('c', 83000, 'Mur'), R('d', 85500, 'Loin'),
    R('e', 81900, 'Plus bas d’hier'), R('f', 80000, 'Put'), R('g', 79000, 'Trop bas'), R('h', 95000, 'Hors distance')], ref, P);
  check('au plus ' + P.niveauxParCote + ' niveaux de chaque côté, les plus proches', choix.dessus.length === P.niveauxParCote && choix.dessous.length === P.niveauxParCote
    && choix.dessus[0].p === 83000 && choix.dessous[0].p === 81900, choix);
  const fus = choix.dessus[1];
  check('deux niveaux à moins de ' + P.fusion * 100 + ' % → UNE bande qui dit ses deux raisons', fus.raisons.length === 2 && /^2 raisons · /.test(t(G.libelleNiveau(fus, 'debutant'))), G.libelleNiveau(fus, 'debutant'));
  check('niveau au-delà de ' + P.distanceMax * 100 + ' % du prix : écarté', ![...choix.dessus, ...choix.dessous].some(x => x.p === 95000));
  check('libellé débutant « Plus haut d’hier · 84 120 $ » ; expert abrégé, même prix', G.libelleNiveau({ p: 84120, raisons: [R('a', 84120, 'Plus haut d’hier')] }, 'debutant') === 'Plus haut d’hier · 84 120 $'
    && G.libelleNiveau({ p: 84120, raisons: [R('a', 84120, 'Plus haut d’hier')] }, 'expert').includes('84 120'));
}

// ── 3. Règle de cassure ──
titre('3. Cassure : deux clôtures au-delà de la bande, une mèche n’est pas une cassure');
{
  const p = 100, demi = 0.5;
  const C = [99, 99, 99, 99, 99], H = C.map(c => c + 0.3), L = C.map(c => c - 0.3);
  const etat = (c, h, l) => G.etatFerme(c, h || c.map(x => x + 0.3), l || c.map(x => x - 0.3), c.length, p, demi, P);
  check('aucune clôture au-delà : pas de cassure', etat(C).cassure === null);
  check('une clôture au-dessus de la bande : « cassé (1/2 clôtures) », vers le haut', etat([99, 99, 99, 99, 101]).cassure === 'demi' && etat([99, 99, 99, 99, 101]).sens === 1);
  const v = etat([99, 99, 99, 101, 101.2]);
  check('deux clôtures successives au-dessus : « cassé (2/2 clôtures, validé) »', v.cassure === 'valide' && v.sens === 1, v);
  const rt = etat([99, 99, 99, 101, 101.2], [99.3, 99.3, 99.3, 101.3, 101.5], [98.7, 98.7, 98.7, 100.7, 100.4]);
  check('la 2e clôture dont la mèche revient sur la bande : retour réussi (retest) noté', rt.cassure === 'valide' && rt.retest === true, rt);
  check('une clôture au-delà PUIS retour dans la bande : la cassure ne compte plus', etat([99, 99, 101, 99.8]).cassure === null);
  check('au-dessus puis deux clôtures sous la bande : cassure validée VERS LE BAS', etat([101, 101, 101, 99, 99]).cassure === 'valide' && etat([101, 101, 101, 99, 99]).sens === -1);
  const m = etat([99, 99, 99, 99, 99.4], [99.3, 99.3, 99.3, 99.3, 101], null);
  check('mèche au-delà, clôture en deçà : « percé en mèche », pas « cassé »', m.cassure === null && m.meche === true, m);
  check('clôtures au-delà depuis plus de ' + P.regardCassure + ' bougies : un niveau de l’autre côté, plus une cassure', etat([99, ...Array(P.regardCassure + 2).fill(101)]).cassure === null);
  const niv = { p, demi, dessus: true, ferme: etat(C) };
  check('prix live dans la bande : « en test »', G.etatLive(niv, 100.2, null, P).mot === 'test');
  const fin = { p, demi: 0.1, dessus: true, ferme: etat(C) };
  check('prix live à moins de ' + P.proche * 100 + ' % : « proche » ; au-delà : « loin »', G.etatLive(fin, 99.7, null, P).mot === 'proche' && G.etatLive(fin, 90, null, P).mot === 'loin');
  check('prix live au-delà de la bande sans clôture : « franchi en séance (clôture à venir) »', G.etatLive(niv, 101, null, P).mot === 'franchi');
  check('mèche de la bougie en cours au-delà, prix revenu : « percé en mèche »', G.etatLive(niv, 99.4, { high: 100.8, low: 99 }, P).mot === 'meche');
  const e = G.etatLive(niv, 99, null, P);
  check('distance au prix LIVE, dite comme telle : « à +1,01 % du prix live »', t(G.texteEtatLive(e, 'debutant')).startsWith('à +1,01 % du prix live'), G.texteEtatLive(e, 'debutant'));
  check('prix live absent : dit absent, aucune distance inventée', G.etatLive(niv, null, null, P).mot === null && /absent/.test(G.texteEtatLive(G.etatLive(niv, null, null, P), 'debutant')));
  const cv = G.etatLive({ p, demi, dessus: false, ferme: v }, 101.3, null, P);
  check('cassure validée : son sens est dit (« cassé vers le haut (2/2 clôtures, validé) »)', t(cv.texte) === 'cassé vers le haut (2/2 clôtures, validé)', cv);
}

// ── 4. Régime ──
titre('4. Régime : seuils de convention lus dans PARAM.guide');
{
  const n = 60, col = v => Array(n).fill(v);
  const monte = Array.from({ length: n }, (_, i) => 0.02 + i * 0.0001);     // volatilité qui s'élargit : pas de compression
  const r = (adx, pdi, mdi, ec, el, larg) => G.regime({ adx: col(adx), plusDI: col(pdi), minusDI: col(mdi), emaC: col(ec), emaL: col(el), largeur: larg || monte }, n - 1, P);
  check('ADX ≥ ' + P.adxTendance + ', +DI > −DI, EMA courte > longue : tendance haussière', r(31, 30, 12, 101, 100).cle === 'hausse' && t(G.texteRegime(r(31, 30, 12, 101, 100), 'debutant', P)) === 'Tendance haussière (ADX 31)');
  check('ADX ≥ ' + P.adxTendance + ', mesures en désaccord : « sens incertain »', r(31, 30, 12, 99, 100).cle === 'incertaine');
  check('ADX ≤ ' + P.adxSans + ' : « Sans tendance nette » ; entre les deux : « Tendance faible »', r(17, 20, 18, 1, 1).cle === 'sans' && r(22, 20, 18, 1, 1).cle === 'faible');
  const larg = Array.from({ length: n }, (_, i) => 0.05 - i * 0.0005);
  const c = r(17, 20, 18, 1, 1, larg);
  check('largeur de Bollinger au plus bas : « Compression : volatilité au plus bas depuis … »', c.compression && c.depuis === null && /Compression : volatilité au plus bas/.test(t(G.texteRegime(c, 'debutant', P))), c);
  check('ADX absent (historique court) : dit, pas inventé', r(null, 1, 1, 1, 1).cle === 'inconnu' && /historique/.test(G.texteRegime(r(null, 1, 1, 1, 1), 'debutant', P)));
}

// ── 5. Formes ──
titre('5. Formes : détection mécanique, états qui évoluent, aucun regard vers l’avenir');
const d = 0.4;
{
  // Double sommet : montée, sommet à 110, creux à 104 (ligne de cou), sommet à 110,1, puis …
  const base = [...lin(100, 100, 20), ...lin(100, 110, 10), ...lin(110, 104, 8), ...lin(104, 110.1, 8), ...lin(110.1, 106, 6)];
  const run = suite => { const s = serie(base.concat(suite), d), atr = atrDe(s.H, s.L, s.C, P.atrPeriode); return G.detecter({ h: s.H, l: s.L, c: s.C, atr, n: s.C.length }, P); };
  const f0 = run([]).formes.find(f => f.type === 'double_sommet');
  check('double sommet détecté, ligne de cou au creux entre les deux sommets', !!f0 && Math.abs(f0.niveau - (104 - d)) < 0.6, f0 && { niveau: f0.niveau, etat: G.etatForme(f0) });
  check('… « en formation » tant qu’aucune clôture n’est sous la ligne de cou', f0 && G.etatForme(f0).cle === 'formation', f0 && G.etatForme(f0));
  const f1 = run([...lin(106, 102.5, 2)]).formes.find(f => f.type === 'double_sommet');
  check('1 clôture sous la ligne de cou : « cassure … à confirmer (1/2 clôtures) »', f1 && G.etatForme(f1).cle === 'demi', f1 && G.etatForme(f1));
  const f2 = run([...lin(106, 102.5, 2), 102]).formes.find(f => f.type === 'double_sommet');
  check('2 clôtures sous la ligne de cou : « confirmé »', f2 && G.etatForme(f2).cle === 'confirme' && /2 clôtures sous la ligne de cou/.test(t(G.etatForme(f2).texte)), f2 && G.etatForme(f2));
  check('objectif théorique = ligne de cou − hauteur (convention)', f2 && Math.abs(f2.objectif - (f2.niveau - (f2.extreme - f2.niveau))) < 1e-9);
  const f3 = run([...lin(106, 102.5, 2), 102, ...lin(102, 95, 6)]).formes.find(f => f.type === 'double_sommet');
  check('… puis le prix touche l’objectif : « objectif théorique atteint »', f3 && f3.fin === 'atteint', f3 && G.etatForme(f3));
  const f4 = run([...lin(106, 102.5, 2), 102, ...lin(102, 112, 6)]).formes.find(f => f.type === 'double_sommet');
  check('… ou clôture au-dessus des sommets : « invalidé »', f4 && f4.fin === 'invalide' && G.etatForme(f4).cle === 'invalide', f4 && G.etatForme(f4));
  const r3 = run([...lin(106, 102.5, 2), 102, ...lin(102, 95, 6)]);
  check('bilan : 1 confirmé, objectif atteint 1 fois, « Échantillon faible. », aucun pourcentage',
    r3.bilan.double_sommet.confirmes >= 1 && r3.bilan.double_sommet.atteints >= 1 && /Échantillon faible\.$/.test(t(G.texteBilan(r3.bilan.double_sommet, { n: r3.n, intervalle: '15m', duree: r3.n * 900 }, P, 'debutant')))
    && !/%/.test(G.texteBilan(r3.bilan.double_sommet, { n: r3.n, intervalle: '15m', duree: r3.n * 900 }, P, 'debutant')), r3.bilan.double_sommet);
}
{
  // Double creux : le miroir.
  const base = [...lin(110, 110, 20), ...lin(110, 100, 10), ...lin(100, 106, 8), ...lin(106, 99.9, 8), ...lin(99.9, 104, 6), ...lin(104, 107.5, 2), 108];
  const s = serie(base, d), r = G.detecter({ h: s.H, l: s.L, c: s.C, atr: atrDe(s.H, s.L, s.C, P.atrPeriode), n: s.C.length }, P);
  const f = r.formes.find(x => x.type === 'double_creux');
  check('double creux détecté et confirmé (2 clôtures au-dessus de la ligne de cou)', f && G.etatForme(f).cle === 'confirme' && /au-dessus de la ligne de cou/.test(G.etatForme(f).texte), f && G.etatForme(f));
}
{
  // Range : 60 bougies entre 98 et 102, puis deux clôtures au-dessus.
  const osc = Array.from({ length: 64 }, (_, i) => 100 + 1.6 * Math.sin(i * Math.PI / 6));
  const base = [...lin(100, 100, 20), ...osc];
  const run = suite => { const s = serie(base.concat(suite), 0.3); return G.detecter({ h: s.H, l: s.L, c: s.C, atr: atrDe(s.H, s.L, s.C, P.atrPeriode), n: s.C.length }, P); };
  const r0 = run([]), f0 = G.formesAffichees(r0, P).find(f => f.type === 'range') || r0.formes.find(f => f.type === 'range' && !f.fin);
  check('range détecté : « le prix est dedans »', f0 && G.etatForme(f0).cle === 'dedans', f0 && { haut: f0.haut, bas: f0.bas, etat: G.etatForme(f0) });
  const r1 = run([103.5]), f1 = r1.formes.find(f => f.type === 'range' && f.t === (f0 && f0.t));
  check('1 clôture au-dessus : « sortie à confirmer (1/2 clôtures au-dessus) »', f1 && G.etatForme(f1).cle === 'demi' && /1\/2 clôtures au-dessus/.test(t(G.etatForme(f1).texte)), f1 && G.etatForme(f1));
  const r2 = run([103.5, 104]), f2 = r2.formes.find(f => f.type === 'range' && f.t === (f0 && f0.t));
  check('2 clôtures au-dessus : « sortie validée », objectif = borne + hauteur', f2 && G.etatForme(f2).cle === 'confirme' && Math.abs(f2.objectif - (f2.niveau + f2.hauteur)) < 1e-9, f2 && G.etatForme(f2));
}
{
  // Triangle : sommets qui baissent, creux qui montent.
  const pts = [100, 110, 101.5, 108.5, 103, 107, 104.5, 106];
  const ch = [...lin(100, 100, 10)];
  for (let k = 1; k < pts.length; k++) ch.push(...lin(pts[k - 1], pts[k], 6));
  ch.push(...lin(106, 105.2, 3));
  const s = serie(ch, 0.2), r = G.detecter({ h: s.H, l: s.L, c: s.C, atr: atrDe(s.H, s.L, s.C, P.atrPeriode), n: s.C.length }, P);
  const f = r.formes.find(x => x.type === 'triangle');
  check('triangle (droites qui se resserrent) détecté', !!f && f.hautL.b < 0 && f.basL.b > 0, f && { h: f.hautL, b: f.basL, etat: G.etatForme(f) });
}
{
  // Aucun regard vers l'avenir : sur des bougies réelles enregistrées, la détection faite sur les
  // N premières bougies retrouve, à l'identique, chaque forme née avant N sur l'historique entier.
  const brut = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'bougies-btcusdt-15m.json'), 'utf8')).bougies;
  const H = brut.map(k => +k[2]), L = brut.map(k => +k[3]), C = brut.map(k => +k[4]), atr = atrDe(H, L, C, P.atrPeriode);
  const tout = G.detecter({ h: H, l: L, c: C, atr, n: C.length }, P);
  const N = Math.floor(C.length * 0.6), tronque = G.detecter({ h: H, l: L, c: C, atr, n: N }, P);
  const cle = f => [f.type, f.debut, f.t, f.depart].join('|');
  const avant = tout.formes.filter(f => f.t < N).map(cle), court = tronque.formes.map(cle);
  check(`historique réel (${C.length} bougies 15 min) : ${tout.formes.length} formes ; celles nées avant la bougie ${N} sont les mêmes vues sans la suite (${court.length})`,
    tout.formes.length > 0 && avant.length === court.length && avant.every((k, i) => k === court[i]), { avant: avant.length, court: court.length });
  const finiAvant = tout.formes.filter(f => f.fin && f.jFin < N), memeFin = finiAvant.every(f => { const g = tronque.formes.find(x => cle(x) === cle(f)); return g && g.fin === f.fin && g.jFin === f.jFin; });
  check('… et chaque issue connue avant N y est la même (aucune information d’après)', memeFin);
  const b = tout.bilan;
  check('bilan : confirmés = atteints + invalidés + délai + ouverts, pour chaque type', G.TYPES.every(k => b[k].confirmes === b[k].atteints + b[k].invalides + b[k].expires + b[k].ouverts), b);
  check('au plus ' + P.formesMax + ' formes montrées à la fois', G.formesAffichees(tout, P).length <= P.formesMax);
  const exp = G.texteBilan(b.triangle, { n: C.length, intervalle: '15m', duree: C.length * 900 }, P, 'expert'), deb = G.texteBilan(b.triangle, { n: C.length, intervalle: '15m', duree: C.length * 900 }, P, 'debutant');
  t(exp); t(deb);
  check('bilan : mêmes comptes en débutant et en expert, « mesuré sur l’historique chargé » dit', exp.includes(b.triangle.confirmes + ' conf.') && deb.includes(String(b.triangle.confirmes)) && /Mesuré sur l’historique chargé/.test(deb), { exp, deb });
  const t0 = Date.now(); for (let k = 0; k < 5; k++) G.detecter({ h: H, l: L, c: C, atr, n: C.length }, P);
  check(`rejeu rapide (${((Date.now() - t0) / 5).toFixed(1)} ms pour ${C.length} bougies)`, (Date.now() - t0) / 5 < 200);
}

// ── 6. Suite et lecture ──
titre('6. Et ensuite ? et lecture du moment : des niveaux nommés, aucune direction privilégiée');
{
  const R = (p, nom, art) => ({ p, raisons: [{ cle: 'x', p, nom, court: nom, art, detail: '', detailCourt: '' }] });
  const choix = { dessus: [R(84120, 'Plus haut d’hier', 'le plus haut d’hier'), R(85400, 'Zéro gamma', 'le zéro gamma')], dessous: [R(81900, 'Plus bas d’hier', 'le plus bas d’hier')] };
  const s = G.suite(choix);
  check('deux chemins : seuil = premier niveau de chaque côté, cible = le suivant (ou aucune)', s.haut.seuil.p === 84120 && s.haut.cible.p === 85400 && s.bas.seuil.p === 81900 && s.bas.cible === null);
  const h = G.texteSuite(s.haut, 'debutant'), b = G.texteSuite(s.bas, 'debutant');
  t(h.join(' ')); t(b.join(' '));
  check('« Si clôture au-dessus de 84 120 $ → prochain niveau 85 400 $ » ; sans cible : dit', h.join(' ') === 'Si clôture au-dessus de 84 120 $ → prochain niveau 85 400 $' && /aucun autre niveau/.test(b.join(' ')), [h, b]);
  check('aucune probabilité dans les chemins', ![...h, ...b].some(x => /%|probab|chance/i.test(x)));
  const l = t(G.lecture({ prix: 82600, unite: '$', choix, enTest: null, regime: { cle: 'sans' }, forme: null }));
  check('lecture : « Le prix (82 600 $) est entre le plus bas d’hier (81 900 $) et le plus haut d’hier (84 120 $). Marché sans tendance nette. »',
    l === 'Le prix (82 600 $) est entre le plus bas d’hier (81 900 $) et le plus haut d’hier (84 120 $). Marché sans tendance nette.', l);
  const l2 = t(G.lecture({ prix: 81910, unite: '$', choix, enTest: choix.dessous[0], regime: null, forme: null }));
  check('prix dans une bande : « teste »', l2 === 'Le prix (81 910 $) teste le plus bas d’hier (81 900 $).', l2);
  check('prix live absent : dit absent', /Prix live absent/.test(G.lecture({ prix: null, choix, regime: null })));
}

// ── 7. Dans la page ──
titre('7. Dans la page : paramètres, menu, fiche, choix gardé, marge de futur');
{
  const src = fs.readFileSync(path.join(REPO, 'js/guide.js'), 'utf8');
  const lus = [...new Set([...src.matchAll(/\bP\.([a-zA-Z]+)\b/g)].map(m => m[1]))];
  check(`les ${lus.length} paramètres lus par js/guide.js sont dans PARAM.guide (js/app.js)`, lus.every(k => k in P), lus.filter(k => !(k in P)));
  const html = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8');
  check('js/guide.js chargé (defer) AVANT js/app.js, qui reste le dernier', /<script defer src="js\/guide\.js"><\/script>[\s\S]*<script defer src="js\/app\.js"><\/script>\s*<\/head>/.test(html));
  const T = page.T, cat = T.INDICATORS.find(c => c.cat === 'Guide');
  check('menu « + Indicateurs » : catégorie « Guide », avec sa fiche', cat && cat.items.some(i => i.key === 'guide') && T.FICHE_IND.guide === 'guide');
  const fiches = ['guide', 'guide_niveaux', 'guide_regime', 'guide_formes', 'guide_suite'];
  check('fiches du Guide définies, chacune « pas une recommandation »', fiches.every(k => T.FICHES[k] && /pas une recommandation/.test(T.ficheHtml(k))));
  check('la fiche des formes dit « débattu » et « mesuré » (sa lecture est discutée, son bilan compté)', T.FICHES.guide_formes.lectures.some(l => l.s === 'débattu') && T.FICHES.guide_formes.lectures.some(l => l.s === 'mesuré'));
  const sauve = JSON.stringify(P); P.niveauxParCote = 3; P.fusion = 0.0042;
  check('PARAM.guide change → la fiche suit (3 niveaux, 0,42 %)', /au plus 3 de chaque côté/.test(T.ficheHtml('guide_niveaux')) && /0,42 %/.test(T.ficheHtml('guide_niveaux')));
  Object.assign(P, JSON.parse(sauve));
  check('Guide affiché par défaut', dansPage('overlays.guide') === true);
  const masque = chargerPage({ stockage: { 'samsara-guide-v1': '0' } });
  check('masqué une fois, il le reste (samsara-guide-v1)', vm.runInContext('overlays.guide', masque.sandbox) === false);
  const marge = dansPage('[pasBougie(1000, 50) * 50 + margeFutur(1000), margeFutur(1000), (overlays.guide = false, pasBougie(1000, 50) * 50), margeFutur(1000), (overlays.guide = true)]');
  check('marge de futur : bougies + marge = largeur du tracé ; Guide masqué : marge nulle, le pas d’avant', Math.abs(marge[0] - 1000) < 1e-9 && marge[1] > 0 && marge[2] === 1000 && marge[3] === 0, marge);
  const appSrc = fs.readFileSync(path.join(REPO, 'js/app.js'), 'utf8');
  check('une seule formule du pas : plus aucun « pw / » dans le calcul des bougies, du réticule, de la chaleur, des sous-graphes', !/const gap = pw \//.test(appSrc) && !/chartPw \/ n/.test(appSrc), (appSrc.match(/const gap = [^;]+;/g) || []));
  check('aucune minuterie dans le Guide (rien ne tourne au repos)', !/setInterval|setTimeout/.test(src) && !/setInterval|setTimeout/.test(appSrc.slice(appSrc.indexOf('// GUIDE — le dessin'), appSrc.indexOf('// Étiquettes d\'overlays posées'))));
}

// ── 8. Mots ──
titre('8. Ce que le Guide écrit : il décrit, ne conseille pas, n’attribue aucune intention');
{
  const src = fs.readFileSync(path.join(REPO, 'js/guide.js'), 'utf8');
  check(`${textes.length} textes produits : aucun conseil d’achat ou de vente`, !textes.some(x => CONSEIL.test(x)), textes.filter(x => CONSEIL.test(x)));
  check('aucune intention prêtée (manipulation, leurre, faux mur…)', !textes.some(x => ACCUSE.test(x)) && !ACCUSE.test(src), textes.filter(x => ACCUSE.test(x)));
  check('js/guide.js : aucun mot de conseil, même en commentaire', !CONSEIL.test(src));
  const app = fs.readFileSync(path.join(REPO, 'js/app.js'), 'utf8');
  const bloc = app.slice(app.indexOf('// GUIDE — le dessin'), app.indexOf('// Étiquettes d\'overlays posées'));
  check('js/app.js, bloc de dessin du Guide : ni conseil ni intention prêtée', bloc.length > 1000 && !CONSEIL.test(bloc) && !ACCUSE.test(bloc), [bloc.length, (bloc.match(CONSEIL) || [])[0], (bloc.match(ACCUSE) || [])[0]]);
  const fiches = dansPage('JSON.stringify(Object.keys(FICHES).filter(k => /^guide/.test(k)).map(k => { const f = FICHES[k]; return Object.assign({}, f, { formule: f.formule ? f.formule(PARAM) : "" }); }))');
  check('fiches du Guide : présentes, sans conseil ni intention prêtée', /Guide/.test(fiches) && JSON.parse(fiches).length === 5 && !CONSEIL.test(fiches) && !ACCUSE.test(fiches), [JSON.parse(fiches).length, (fiches.match(CONSEIL) || [])[0], (fiches.match(ACCUSE) || [])[0]]);
  check('aucun libellé ne commence par « $ »', !textes.some(x => /^\$/.test(x)));
}

console.log(ko ? `\n❌ GUIDE : ${ko} contrôle(s) en échec` : '\n✅ GUIDE : TOUS LES CONTRÔLES PASSENT');
process.exit(ko ? 1 : 0);
