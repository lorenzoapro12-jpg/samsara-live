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
  const sr = G.niveauxSR([{ price: 83000, touches: 4, tf: '4h' }, { price: 82000, touches: 1, tf: '1h' }], P, { bougies: 500, pivot: 3, tolMin: 0.002, tolMax: 0.01 });
  check('S/R : « Zone de 4 demi-tours (bougies 4 h) » (intervalle en mots) ; un pivot isolé ne fait pas un niveau du Guide', sr.length === 1 && t(sr[0].nom) === 'Zone de 4 demi-tours (bougies 4 h)'
    && /4 sommets ou creux locaux/.test(t(sr[0].origine)) && /500 dernières bougies 4 h/.test(sr[0].origine), sr);
  const lp = G.libelleNiveau({ p: put.p, pMin: put.p, pMax: put.p, raisons: [put] }, 'debutant');
  check('mur d’options : le libellé dit le strike PUBLIÉ (80 000 $), pas sa conversion en USDT', t(lp).startsWith('Mur d’options (puts) · 80 000 $ · modèle · lu à ') && !lp.includes(G.chiffres(put.p)), lp);
  // Formes étroites (téléphone) : l'heure d'un chiffre publié collée à CE chiffre, et l'origine de
  // chaque raison (un mot au moins) — une bande de deux raisons ne se réduit jamais à une plage.
  const zgR = pub.find(x => x.cle === 'zero_gamma'), h24 = { cle: 'h24_bas', p: put.p + 30, nom: 'Plus bas des 24 h', court: 'B 24 h', mot: 'bas 24 h', art: 'le plus bas des 24 h', nature: 'mesuré' };
  const deux = { p: put.p, pMin: put.p, pMax: put.p + 30, raisons: [put, h24] }, seul = { p: achat.p, pMin: achat.p, pMax: achat.p, raisons: [achat] };
  const etroits = ['debutant', 'expert'].flatMap(m => ['mini', 'micro', true].flatMap(v => [G.libelleNiveau(deux, m, '$', v), G.libelleNiveau(seul, m, '$', v)]));
  etroits.forEach(t);
  check('formes étroites des libellés (mini, micro, courte ; deux modes) : chaque chiffre publié garde son heure', etroits.every(x => x.includes(hm) || x.includes(G.heureUTC(Date.parse(md.updated)))), etroits);
  check('… et chaque raison son origine (mur, bas 24 h) : « 2 raisons » seul ne suffit plus', etroits.every(x => /mur|Mur|put|Put/i.test(x)) && etroits.filter(x => x.includes('–')).every(x => /24 h/.test(x)), etroits);
  const micro = G.libelleNiveau(seul, 'debutant', '$', 'micro');
  check('forme micro : l’heure juste après le prix publié (« ' + micro + ' »)', new RegExp('^' + G.prix(achat.p).replace(/[$]/g, '\\$') + ' ' + hm + ' ').test(micro), micro);
  void zgR;
  // Deux zones de demi-tours dans une bande : chacune dit son prix (sinon deux fois le même nom).
  const z1 = G.niveauxSR([{ price: 720.01, touches: 2, tf: '15m' }, { price: 721.61, touches: 2, tf: '15m' }], P, {});
  const bz = { p: 720.01, pMin: 720.01, pMax: 721.61, raisons: z1 }, lz = t(G.libelleNiveau(bz, 'debutant', 'SOL', true)), dz = t(G.decrire(bz, 'SOL'));
  check('deux raisons du même nom dans une bande : chacune avec son prix (« … à 720,01, … à 721,61 »)', /à 720,01/.test(lz) && /à 721,61/.test(lz) && /à 720,01/.test(dz), [lz, dz]);
  // Murs du mauvais côté du prix : plus dans le carnet tel quel ; un mur d'achat et un de vente ne partagent pas une bande.
  const vente = pub.find(x => x.cle === 'mur_vente');
  const ch2 = G.choisirNiveaux([achat, vente], (achat.p + vente.p) / 2, P);
  const tous2 = [...ch2.dessus, ...ch2.dessous];
  check('mur d’achat SOUS le prix et mur de vente AU-DESSUS : gardés, chacun sa bande', achat.p < vente.p && tous2.length === 2 && tous2.every(n => n.raisons.length === 1), tous2.map(n => n.raisons.map(r => r.cle)));
  const ch3 = G.choisirNiveaux([achat, vente], achat.p - 50, P);
  check('mur d’achat publié AU-DESSUS du prix actuel : écarté (il n’est plus dans le carnet tel quel)', ![...ch3.dessus, ...ch3.dessous].some(n => n.raisons.some(r => r.cle === 'mur_achat')) && ch3.ecartes.some(r => r.cle === 'mur_achat'));
}
{
  const R = (cle, p, nom) => ({ cle, p, nom, court: nom, art: 'le ' + nom, origine: '', nature: 'mesuré', detail: '', detailCourt: '' });
  const ref = 82600;
  const choix = G.choisirNiveaux([R('a', 84120, 'Plus haut d’hier'), R('b', 84200, 'Zone touchée 3 fois (1h)'), R('c', 83000, 'Mur'), R('d', 85500, 'Loin'),
    R('e', 81900, 'Plus bas d’hier'), R('f', 80000, 'Put'), R('g', 79000, 'Trop bas'), R('h', 95000, 'Hors distance')], ref, P);
  check('au plus ' + P.niveauxParCote + ' niveaux de chaque côté, les plus proches', choix.dessus.length === P.niveauxParCote && choix.dessous.length === P.niveauxParCote
    && choix.dessus[0].p === 83000 && choix.dessous[0].p === 81900, choix);
  const fus = choix.dessus[1];
  const lf = G.libelleNiveau(fus, 'debutant');
  check('deux niveaux à moins de ' + P.fusion * 100 + ' % → UNE bande qui dit ses deux raisons, CHACUNE avec son prix', fus.raisons.length === 2 && /^84 120 – 84 200 \$ · 2 raisons : /.test(t(lf)) && lf.includes('84 120 $') && lf.includes('84 200 $'), lf);
  check('la bande couvre tous ses prix (pMin, pMax) ; son prix de référence est l’un d’eux, jamais une moyenne', fus.pMin === 84120 && fus.pMax === 84200 && fus.raisons.some(r => r.p === fus.p));
  // Pas de fusion en chaîne : trois niveaux espacés de 0,2 % ne font pas UNE bande de 0,4 %.
  const ch = G.choisirNiveaux([R('x', 100000, 'A'), R('y', 100200, 'B'), R('z', 100400, 'C')], 99000, P);
  check('fusion à lien complet : l’écart total d’une bande reste sous ' + P.fusion * 100 + ' % (pas de chaîne qui s’étire)', ch.dessus.every(n => (n.pMax - n.pMin) / n.pMin < P.fusion) && ch.dessus.length === 2, ch.dessus.map(n => [n.pMin, n.pMax]));
  // Tout prix écrit dans un libellé, dans les deux modes, est le prix d'une raison réelle.
  const sources = new Set([84120, 84200, 83000, 81900, 80000].map(v => G.chiffres(v)));
  const ecrits = [...choix.dessus, ...choix.dessous].flatMap(n => ['debutant', 'expert'].flatMap(m => [G.libelleNiveau(n, m), G.libelleNiveau(n, m, '$', true)]))
    .flatMap(x => x.match(/\d{1,3}(?: \d{3})+(?:,\d+)?|\d+,\d+/g) || []);
  check('chaque prix affiché (libellés, deux modes) est celui d’un niveau source — aucune moyenne', ecrits.length > 0 && ecrits.every(v => sources.has(v)), ecrits.filter(v => !sources.has(v)));
  check('niveau au-delà de ' + P.distanceMax * 100 + ' % du prix : écarté', ![...choix.dessus, ...choix.dessous].some(x => x.p === 95000));
  check('libellé débutant « Plus haut d’hier · 84 120 $ » ; expert abrégé, même prix', G.libelleNiveau({ p: 84120, raisons: [R('a', 84120, 'Plus haut d’hier')] }, 'debutant') === 'Plus haut d’hier · 84 120 $'
    && G.libelleNiveau({ p: 84120, raisons: [R('a', 84120, 'Plus haut d’hier')] }, 'expert').includes('84 120'));
}

// ── 3. Règle de cassure ──
titre('3. Cassure : deux clôtures au-delà de la bande, une mèche n’est pas une cassure');
{
  const p = 100, demi = 0.5;
  const C = [99, 99, 99, 99, 99], H = C.map(c => c + 0.3), L = C.map(c => c - 0.3);
  const etat = (c, h, l) => G.etatFerme(c, h || c.map(x => x + 0.3), l || c.map(x => x - 0.3), c.length, p - demi, p + demi, P);
  check('aucune clôture au-delà : pas de cassure', etat(C).cassure === null);
  check('une clôture au-dessus de la bande : « cassé (1/2 clôtures) », vers le haut', etat([99, 99, 99, 99, 101]).cassure === 'demi' && etat([99, 99, 99, 99, 101]).sens === 1);
  const v = etat([99, 99, 99, 101, 101.2]);
  check('deux clôtures successives au-dessus : « cassé (2/2 clôtures, validé) »', v.cassure === 'valide' && v.sens === 1, v);
  const rt = etat([99, 99, 99, 101, 101.2], [99.3, 99.3, 99.3, 101.3, 101.5], [98.7, 98.7, 98.7, 100.7, 100.4]);
  check('la 2e clôture dont la mèche revient sur la bande : retour réussi (retest) noté', rt.cassure === 'valide' && rt.retest === true, rt);
  const ret = etat([99, 99, 101, 99.8]);
  check('une clôture au-delà PUIS retour dans la bande : « cassé (1 clôture), revenu sur la bande »', ret.cassure === 'demi' && ret.enRetour === true, ret);
  const rr = etat([99, 99, 99, 101, 100.3, 101.2]);
  check('règle du propriétaire : 1 clôture au-delà, retour dans la bande, clôture au-delà → validé par un retour réussi', rr.cassure === 'valide' && rr.retest === true && rr.sens === 1, rr);
  check('… et dit ainsi : « cassé vers le haut (validé par un retour réussi) »', t(G.etatLive({ p, demi, dessus: false, ferme: rr }, 101.3, null, P).texte) === 'cassé vers le haut (validé par un retour réussi)');
  const rm = etat([99, 99, 99, 101, 101.2], [99.3, 99.3, 99.3, 101.3, 101.5], [98.7, 98.7, 98.7, 100.7, 100.4]);
  const rw = etat([99, 99, 99, 101, 101.6, 101.2], [99.3, 99.3, 99.3, 101.3, 101.9, 101.5], [98.7, 98.7, 98.7, 100.7, 101.3, 100.3]);
  check('… ou 1 clôture au-delà puis une mèche revenue sur la bande et une clôture au-delà', rm.cassure === 'valide' && rm.retest && rw.cassure === 'valide', [rm, rw]);
  const vr = etat([98, 98, 98, 101, 101, 100.2, 101.5, 102]);
  check('une cassure validée suivie d’un retour puis d’une reprise reste validée (le retour ne l’efface pas)', vr.cassure === 'valide' && vr.sens === 1, vr);
  const mf = etat([99, 99, 99, 99, 100.3], [99.3, 99.3, 99.3, 99.3, 101], null);
  check('mèche au-delà, clôture dans la moitié haute de la bande : « percé en mèche » aussi', mf.cassure === null && mf.meche === true, mf);
  const avant = G.etatFerme([98, 98, 98, 101, 101], [98.3, 98.3, 98.3, 101.3, 101.3], [97.7, 97.7, 97.7, 100.7, 100.7], 5, p - demi, p + demi, P, 4);
  check('niveau publié : les clôtures d’avant sa lecture ne comptent pas (aucune cassure « vue » avant le mur)', avant.cassure === null, avant);
  check('au-dessus puis deux clôtures sous la bande : cassure validée VERS LE BAS', etat([101, 101, 101, 99, 99]).cassure === 'valide' && etat([101, 101, 101, 99, 99]).sens === -1);
  const m = etat([99, 99, 99, 99, 99.4], [99.3, 99.3, 99.3, 99.3, 101], null);
  check('mèche au-delà, clôture en deçà : « percé en mèche », pas « cassé »', m.cassure === null && m.meche === true, m);
  check('clôtures au-delà depuis plus de ' + P.regardCassure + ' bougies : un niveau de l’autre côté, plus une cassure', etat([99, ...Array(P.regardCassure + 2).fill(101)]).cassure === null);
  const niv = { p, demi, dessus: true, ferme: etat(C) };
  check('prix live dans la bande : « en test »', G.etatLive(niv, 100.2, null, P).mot === 'test');
  const fin = { p, demi: 0.1, dessus: true, ferme: etat(C) };
  check('prix live à moins de ' + P.proche * 100 + ' % : « proche » ; au-delà : « loin »', G.etatLive(fin, 99.7, null, P).mot === 'proche' && G.etatLive(fin, 90, null, P).mot === 'loin');
  check('prix live au-delà de la bande sans clôture : « au-delà (bougie pas encore close) »', G.etatLive(niv, 101, null, P).mot === 'franchi' && t(G.etatLive(niv, 101, null, P).texte) === 'au-delà (bougie pas encore close)');
  check('mèche de la bougie en cours au-delà, prix revenu : percé en mèche', G.etatLive(niv, 99.4, { high: 100.8, low: 99 }, P).mot === 'mecheCours');
  const e = G.etatLive(niv, 99, null, P);
  check('distance au prix LIVE, dite comme telle, le MOT d’abord : « loin · à +1,01 % du prix live »', t(G.texteEtatLive(e, 'debutant')) === 'loin · à +1,01 % du prix live', G.texteEtatLive(e, 'debutant'));
  check('mèche de la bougie en cours : « percé en mèche (bougie en cours) »', t(G.etatLive(niv, 99.4, { high: 100.8, low: 99 }, P).texte) === 'percé en mèche (bougie en cours)');
  check('prix live absent : dit absent, aucune distance inventée', G.etatLive(niv, null, null, P).mot === null && /absent/.test(G.texteEtatLive(G.etatLive(niv, null, null, P), 'debutant')));
  const cv = G.etatLive({ p, demi, dessus: false, ferme: v }, 101.3, null, P);
  check('cassure validée : son sens est dit (« cassé vers le haut (2/2 clôtures, validé) »)', t(cv.texte) === 'cassé vers le haut (2/2 clôtures, validé)', cv);
  // Niveau PUBLIÉ (lu à 20:18) : la bougie en cours, ouverte à 00:00, a fait son plus haut AVANT la
  // lecture — sa mèche ne dit rien du niveau ; seule une bougie ouverte après la lecture compte.
  const lu = Date.UTC(2026, 9, 8, 20, 18), pub = { p, demi, dessus: true, ferme: etat(C), lu };
  const avantLu = G.etatLive(pub, 99.4, { time: Date.UTC(2026, 9, 8, 0, 0) / 1000, high: 100.8, low: 99 }, P);
  const apresLu = G.etatLive(pub, 99.4, { time: Date.UTC(2026, 9, 8, 20, 30) / 1000, high: 100.8, low: 99 }, P);
  check('niveau publié, mèche de la bougie en cours ouverte AVANT la lecture : pas « percé en mèche » (« ' + avantLu.mot + ' »)', avantLu.mot !== 'mecheCours' && avantLu.mot !== 'meche', avantLu);
  check('… ouverte APRÈS la lecture : « percé en mèche (bougie en cours) » ; prix live au-delà : « au-delà » quoi qu’il en soit', apresLu.mot === 'mecheCours'
    && G.etatLive(pub, 101, { time: Date.UTC(2026, 9, 8, 0, 0) / 1000, high: 101.2, low: 99 }, P).mot === 'franchi', apresLu);
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
  check('largeur de Bollinger au plus bas de tout l’historique : « Compression : volatilité basse … la plus basse de l’historique chargé »', c.compression && c.depuisDebut && /Compression : volatilité basse/.test(t(G.texteRegime(c, 'debutant', P))) && /la plus basse de l’historique chargé/.test(G.texteRegime(c, 'debutant', P)), c);
  // Largeur non monotone : la bougie d'avant était plus ÉTROITE → pas de « au plus bas depuis 1 bougies ».
  const zz = Array.from({ length: n }, (_, i) => 0.05 - Math.min(i, n - 2) * 0.0005 + (i === n - 1 ? 0.0001 : 0));
  const c2 = r(17, 20, 18, 1, 1, zz), t2 = t(G.texteRegime(c2, 'debutant', P));
  check('largeur non monotone (la précédente plus étroite) : compression dite, sans « au plus bas depuis N »', c2.compression && c2.depuis === null && !/depuis/.test(t2) && !/1 bougies/.test(t2), [c2, t2]);
  const zz2 = Array.from({ length: n }, (_, i) => (i === n - 1 ? 0.01 : i < 5 ? 0.005 : 0.03));
  const c3 = r(17, 20, 18, 1, 1, zz2);
  check('« au plus bas depuis N bougies » : N = les bougies précédentes TOUTES plus larges (≥ ' + P.compressionDepuisMin + ')', c3.depuis === n - 1 - 5 && /au plus bas depuis 54 bougies/.test(t(G.texteRegime(c3, 'debutant', P))), [c3.depuis, G.texteRegime(c3, 'debutant', P)]);
  const cc = t(G.texteRegime(c, 'debutant', P, true));
  check('forme courte du badge (écran étroit) : le régime, l’ADX ET la compression (« … · compression »)', /ADX \d+/.test(cc) && /compression$/.test(cc) && cc.length < 40, cc);
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
  // Objectif jugé en CLÔTURE, comme l'invalidation : une mèche qui le touche ne suffit pas.
  const s5 = serie(base.concat([...lin(106, 102.5, 2), 102]), d);
  const ob = run([...lin(106, 102.5, 2), 102]).formes.find(f => f.type === 'double_sommet').objectif;
  const C5 = s5.C.concat([ob + 1.5]), H5 = s5.H.concat([ob + 2]), L5 = s5.L.concat([ob - 0.5]);
  const f5 = G.detecter({ h: H5, l: L5, c: C5, atr: atrDe(H5, L5, C5, P.atrPeriode), n: C5.length }, P).formes.find(f => f.type === 'double_sommet');
  check('objectif touché par une MÈCHE seule : pas « atteint » (même base que l’invalidation : la clôture)', f5 && f5.fin !== 'atteint', f5 && f5.fin);
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
  // Ligne de cou cassée ENTRE le 2e sommet et la clôture qui le rend repérable (b.i + pivot) :
  // la forme n'était visible qu'après coup — ni montrée, ni comptée.
  const k = P.pivot;
  const base = [...lin(100, 100, 20), ...lin(100, 110, 10), ...lin(110, 104, 8), ...lin(104, 110.1, 8), ...lin(110.1, 100, k), 99.5, 99];
  const s = serie(base, d), r = G.detecter({ h: s.H, l: s.L, c: s.C, atr: atrDe(s.H, s.L, s.C, P.atrPeriode), n: s.C.length }, P);
  check('ligne de cou confirmée avant que la forme soit repérable : non comptée (aucun « atteint » connu d’avance)', !r.formes.some(f => f.type === 'double_sommet' && f.jConf !== null && f.jConf <= f.t)
    && r.bilan.double_sommet.confirmes === 0, r.formes.filter(f => f.type === 'double_sommet').map(f => ({ t: f.t, jConf: f.jConf, fin: f.fin })));
}
{
  // Triple sommet : (a, b) puis (b, c) — le même mouvement, un seul cas dans le bilan.
  const base = [...lin(100, 100, 20), ...lin(100, 110, 10), ...lin(110, 104, 8), ...lin(104, 110.1, 8), ...lin(110.1, 104.2, 8), ...lin(104.2, 110.05, 8), ...lin(110.05, 102.5, 4), 102, 101.5];
  const s = serie(base, d), r = G.detecter({ h: s.H, l: s.L, c: s.C, atr: atrDe(s.H, s.L, s.C, P.atrPeriode), n: s.C.length }, P);
  const conf = r.formes.filter(f => f.type === 'double_sommet' && f.jConf !== null && !f.doublon);
  check('triple sommet : une seule confirmation comptée (pas deux doubles sur la même cassure)', conf.length === 1 && r.bilan.double_sommet.confirmes === 1, r.formes.filter(f => f.type === 'double_sommet').map(f => ({ a: f.a.i, b: f.b.i, jConf: f.jConf, doublon: f.doublon })));
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
  const vue = [C.length - 50, C.length];
  const aff = G.formesAffichees(tout, P, vue[0], vue[1]);
  check('formes montrées : leur DERNIER pivot est dans la vue (le début peut en sortir à gauche), aucune candidate tombée avant confirmation, aucun recouvrement', aff.every(f => f.t - P.pivot >= vue[0] && f.debut < vue[1] && f.fin !== 'invalide_avant')
    && aff.every((f, k) => aff.every((g, m) => m === k || f.debut > (g.fin ? g.jFin : tout.n - 1) || g.debut > (f.fin ? f.jFin : tout.n - 1))), aff.map(f => [f.type, f.debut, f.fin]));
  check('aucune forme comptée n’est confirmée avant d’être repérable (jConf > t)', tout.formes.every(f => f.jConf === null || f.jConf > f.t));
  check('repère sans forme calculé pour chaque type confirmé (mêmes distances, même sens)', G.TYPES.every(k => !b[k].confirmes || b[k].temoin.departs > 0), G.TYPES.map(k => [k, b[k].confirmes, b[k].temoin]));
  const exp = G.texteBilan(b.triangle, { n: C.length, intervalle: '15m', duree: C.length * 900 }, P, 'expert'), deb = G.texteBilan(b.triangle, { n: C.length, intervalle: '15m', duree: C.length * 900 }, P, 'debutant');
  t(exp); t(deb);
  check('bilan : mêmes comptes en débutant et en expert, « mesuré » dit dans les deux', exp.includes(b.triangle.confirmes + ' conf.') && deb.includes(String(b.triangle.confirmes)) && /Mesuré sur l’historique chargé/.test(deb) && /^Mesuré · /.test(exp), { exp, deb });
  const td = G.texteBilan(b.double_creux, { n: C.length, intervalle: '15m', duree: C.length * 900 }, P, 'debutant');
  check('bilan débutant : formes repérées, issues, et le repère sans forme en comptes (aucun %)', /repérés?/.test(t(td)) && (!b.double_creux.confirmes || /Repère sans forme/.test(td)) && !/%/.test(td), td);
  // Débutant : la phrase du cahier des charges d'abord, courte (une bulle de téléphone la lit).
  const bx = { type: 'double_sommet', formes: 31, confirmes: 14, atteints: 6, invalides: 7, expires: 1, ouverts: 0, temoin: { departs: 4614, atteints: 2335 } };
  const tb = t(G.texteBilan(bx, { n: 2980, intervalle: '15m', duree: 31 * 86400 }, P, 'debutant'));
  check('bilan débutant : « Sur les 2 980 dernières bougies 15 min (31 j) : 14 … confirmés …, objectif théorique atteint 6 fois avant invalidation … Échantillon faible. » — court', /sur les 2 980 dernières bougies 15 min \(31 j\) : 14 doubles sommets confirmés/.test(tb)
    && /objectif théorique atteint 6 fois avant invalidation/.test(tb) && /2 335 fois sur 4 614/.test(tb) && /Échantillon faible\.$/.test(tb) && tb.split(' ').length <= 60, [tb.split(' ').length, tb]);
  const ec = t(G.texteBilan(bx, { n: 2980, intervalle: '15m', duree: 31 * 86400 }, P, 'expertCourt'));
  check('étiquette expert : les comptes et « éch. faible » d’abord (une coupure en bout de ligne n’ôte que la durée)', /^14 conf\. · éch\. faible · obj\. 6 · inval\. 7/.test(ec), ec);
  // Une forme dont le début est sorti à gauche de la vue, mais dont le dernier pivot est dedans : montrée.
  const vive = tout.formes.find(f => !f.doublon && f.t - P.pivot - f.debut >= 2);
  if (vive) {
    const res1 = { formes: [Object.assign({}, vive, { fin: null, jFin: null })], n: vive.t + 5 };
    const vs1 = vive.debut + 1;
    check('forme dont le début est hors de la vue mais le dernier pivot dedans : montrée ; dernier pivot hors de la vue : non', G.formesAffichees(res1, P, vs1, vs1 + 50).length === 1
      && G.formesAffichees(res1, P, vive.t - P.pivot + 1, vive.t + 50).length === 0);
  }
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
  check('« Si clôture au-dessus de 84 120 $ → niveau suivant : 85 400 $ » ; sans cible : dit', h.join(' ') === 'Si clôture au-dessus de 84 120 $ → niveau suivant : 85 400 $' && /aucun autre niveau/.test(b.join(' ')), [h, b]);
  const h15 = G.texteSuite(s.haut, 'debutant', '$', '15m');
  check('l’intervalle de la clôture est dit : « Si clôture 15 min au-dessus de … »', t(h15[0]) === 'Si clôture 15 min au-dessus de 84 120 $', h15);
  check('aucune probabilité dans les chemins', ![...h, ...b].some(x => /%|probab|chance/i.test(x)));
  const l = t(G.lecture({ prix: 82600, unite: '$', choix, enTest: null, regime: { cle: 'sans' }, forme: null }));
  check('lecture : « Le prix (82 600 $) est entre le plus bas d’hier (81 900 $) et le plus haut d’hier (84 120 $). Marché sans tendance nette. »',
    l === 'Le prix (82 600 $) est entre le plus bas d’hier (81 900 $) et le plus haut d’hier (84 120 $). Marché sans tendance nette.', l);
  const l2 = t(G.lecture({ prix: 81910, unite: '$', choix, enTest: choix.dessous[0], regime: null, forme: null }));
  check('prix dans une bande : « teste »', l2 === 'Le prix (81 910 $) teste le plus bas d’hier (81 900 $).', l2);
  check('prix live absent : dit absent', /Prix live absent/.test(G.lecture({ prix: null, choix, regime: null })));
  const bas1 = { dessus: [], dessous: [{ p: 95, raisons: [{ cle: 'sr', p: 95, nom: 'Zone de 4 demi-tours (bougies 4 h)', art: 'une zone de 4 demi-tours (bougies 4 h)' }] }] };
  const l3 = t(G.lecture({ prix: 100, unite: '$', choix: bas1, regime: null }));
  check('« au-dessus d’une zone » (élision), jamais « de une »', /au-dessus d’une zone de 4 demi-tours/.test(l3) && !/\bde une?\b/.test(l3), l3);
  check('élisions : du, des, d’un, d’une, d’', G.deArt('le zéro gamma') === 'du zéro gamma' && G.deArt('un mur') === 'd’un mur' && G.deArt('une zone') === 'd’une zone' && G.deArt('les murs') === 'des murs');
  // Niveaux publiés : la phrase et les chemins disent l'heure de lecture et « modèle ».
  const md = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'contre', 'publication.json'), 'utf8'));
  const pub = G.niveauxPublies(md), hm = md.liquidity.snapshot_at.slice(11, 16);
  const zg = pub.find(r => r.cle === 'zero_gamma'), pw = pub.find(r => r.cle === 'put_wall'), mur = pub.find(r => r.cle === 'mur_achat');
  const unNiv = r => ({ p: r.p, pMin: r.p, pMax: r.p, raisons: [r] });
  const lp = t(G.lecture({ prix: Math.max(zg.p, pw.p) + 50, unite: '$', choix: { dessus: [], dessous: [unNiv(pw), unNiv(zg)] }, regime: null }));
  check('lecture avec un niveau d’options : « modèle » et « lu à HH:MM » dits', /modèle/.test(lp) && /lu à \d\d:\d\d/.test(lp), lp);
  const lm = t(G.lecture({ prix: mur.p + 20, unite: '$', choix: { dessus: [], dessous: [unNiv(mur)] }, regime: null }));
  check('lecture avec un mur du carnet : « lu à " + hm + " »'.replace('" + hm + "', hm), lm.includes('lu à ' + hm), lm);
  const sp = G.suite({ dessus: [], dessous: [unNiv(mur), unNiv(pw)] }).bas;
  const ts = ['debutant', 'expert'].flatMap(m => ['plein', 'court', 'mini'].map(v => G.texteSuite(sp, m, '$', '15m', P, v).join(' ')));
  ts.forEach(t);
  check('chemins : un niveau publié garde son heure dans toutes les variantes (débutant, expert, court, minimal)', ts.every(x => /\d\d:\d\d/.test(x)), ts);
  check('chemin vers un mur d’options : le strike publié (80 000), « modèle »', /80 000/.test(ts[0]) && /modèle/.test(ts[0]), ts[0]);

  // Prix DANS une bande de deux raisons : les deux chemins partent de ses deux bords (même bande,
  // même distance), pas du bord haut d'un côté et d'un niveau lointain de l'autre.
  const RR = (p, nom, lu) => ({ cle: 'x' + p, p, nom, court: nom, mot: nom, art: 'le ' + nom, nature: 'mesuré', lu });
  const bande = { p: 81670, pMin: 81670, pMax: 81891, lo: 81640, hi: 81921, demi: 30, raisons: [RR(81670, 'Mur d’achat du carnet', Date.UTC(2026, 9, 8, 21, 3)), RR(81891, 'Zone de 2 demi-tours')] };
  const choixDans = { dessus: [bande, { p: 82130, pMin: 82130, pMax: 82130, raisons: [RR(82130, 'Mur de vente')] }], dessous: [{ p: 80394, pMin: 80394, pMax: 80394, raisons: [RR(80394, 'Plus bas des 24 h')] }] };
  const sd = G.suite(choixDans, 81686);
  check('prix dans une bande (« en test ») : seuils = SES deux bords (81 891 vers le haut, 81 670 vers le bas), cibles = la bande suivante de chaque côté', sd.haut.rx.p === 81891 && sd.bas.rx.p === 81670
    && sd.haut.ry.p === 82130 && sd.bas.ry.p === 80394 && sd.dans === bande, { haut: [sd.haut.rx.p, sd.haut.ry && sd.haut.ry.p], bas: [sd.bas.rx.p, sd.bas.ry && sd.bas.ry.p] });
  const sh = G.suite(choixDans, 81500);
  check('prix hors de toute bande : seuil = premier niveau de chaque côté (inchangé)', sh.haut.rx.p === 81891 && sh.bas.rx.p === 80394 && sh.dans === null);
  // Toutes les variantes gardent la condition ; le mini colle l'heure à SON nombre.
  const vs = ['debutant', 'expert'].flatMap(m => G.VARIANTES_SUITE[m].map(v => [m, v, G.texteSuite(sd.bas, m, '$', '15m', P, v), G.texteSuite(sd.haut, m, '$', '15m', P, v)]));
  vs.forEach(x => { t(x[2].join(' ')); t(x[3].join(' ')); });
  check('chaque variante d’un chemin garde la condition (« Si clôture … », « si > … », « si < … »)', vs.every(x => /^(Si clôt|si [<>])/.test(x[2][0]) && /^(Si clôt|si [<>])/.test(x[3][0])), vs.map(x => x[2][0]));
  const mini = G.texteSuite(sd.bas, 'debutant', '$', '15m', P, 'mini');
  check('variante mini : l’heure d’un chiffre publié collée à CE chiffre (« si < 81 670 (21:03) → 80 394 »), pas au niveau suivant', mini[0] === 'si < 81 670 (21:03)' && mini[1] === '→ 80 394', mini);
  const aucun = ['plein', 'court', 'mini'].map(v => G.texteSuite(null, 'debutant', '$', '15m', P, v, -1).join(' '));
  aucun.forEach(t);
  check('côté sans niveau nommé : dit dans chaque variante', aucun.every(x => /aucun niveau/.test(x)), aucun);
  check('un pourcentage de PARAM n’est jamais arrondi à 0 (« 0,4 % »)', G.pctParam(0.004) === '0,4' && G.pctParam(0.06) === '6');
  // L'issue d'une forme est datée : « vient d'être » ne se dit que pour la dernière bougie close.
  const fi = { type: 'double_sommet', fin: 'invalide', sens: -1 };
  const p17 = t(G.phraseForme(fi, '$', { bougies: 17, itv: '1d', date: '21/09' })), p1 = G.phraseForme(fi, '$', { bougies: 1, itv: '1d', date: '07/10' });
  check('forme invalidée il y a 17 bougies 1 jour : « a été invalidé il y a 17 bougies 1 jour (21/09) » ; la veille : « vient d’être invalidé »', p17 === 'un double sommet a été invalidé il y a 17 bougies 1 jour (21/09)' && /vient d’être invalidé/.test(p1), [p17, p1]);
  // Lecture compacte (téléphone) : les prix et leurs heures, la compression dite.
  const lc = t(G.lecture({ prix: 81686, unite: '$', choix: choixDans, enTest: bande, regime: { cle: 'baisse', compression: true }, forme: null, court: true, compact: true }));
  check('lecture compacte : « Prix 81 686 $ dans la bande 81 670 (lu à 21:03) – 81 891 $. Volatilité comprimée. »', lc === 'Prix 81 686 $ dans la bande 81 670 (lu à 21:03) – 81 891 $. Volatilité comprimée.', lc);
  check('lecture courte (sans le sens du régime) : la compression reste dite', /volatilité comprimée/i.test(G.lecture({ prix: 81500, unite: '$', choix: choixDans, regime: { cle: 'baisse', compression: true }, court: true })));
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
  check('menu « + Indicateurs » : catégorie « Guide », avec sa fiche — EN TÊTE du menu (interrupteur d’une couche affichée par défaut, visible sans défiler)', cat && cat.items.some(i => i.key === 'guide') && T.FICHE_IND.guide === 'guide' && T.INDICATORS[0] === cat);
  const fiches = ['guide', 'guide_niveaux', 'guide_regime', 'guide_formes', 'guide_suite'];
  check('fiches du Guide définies, chacune « pas une recommandation »', fiches.every(k => T.FICHES[k] && /pas une recommandation/.test(T.ficheHtml(k))));
  check('la fiche des formes dit « débattu » et « mesuré » (sa lecture est discutée, son bilan compté)', T.FICHES.guide_formes.lectures.some(l => l.s === 'débattu') && T.FICHES.guide_formes.lectures.some(l => l.s === 'mesuré'));
  const sauve = JSON.stringify(P); P.niveauxParCote = 3; P.fusion = 0.0042;
  check('PARAM.guide change → la fiche suit (3 niveaux, 0,42 %)', /au plus 3 de chaque côté/.test(T.ficheHtml('guide_niveaux')) && /0,42 %/.test(T.ficheHtml('guide_niveaux')));
  Object.assign(P, JSON.parse(sauve));
  check('Guide affiché par défaut', dansPage('overlays.guide') === true);
  const masque = chargerPage({ stockage: { 'samsara-guide-v1': '0' } });
  check('masqué une fois, il le reste (samsara-guide-v1)', vm.runInContext('overlays.guide', masque.sandbox) === false);
  // En Expert : le Guide y ouvre la marge de futur (ses chemins « Et ensuite ? ») ; en Débutant, seule
  // la flèche du scénario 1 l'ouvre (contrôlé juste après).
  page.stockage['samsara-mode'] = 'expert';
  const marge = dansPage('candles = Array.from({ length: 60 }, (_, i) => ({ time: i * 900, open: 1, high: 2, low: 0.5, close: 1, volume: 1 })); viewStart = 10; viewEnd = 60;'
    + '[pasBougie(1000, 50) * 50 + margeFutur(1000, 50), margeFutur(1000, 50), (overlays.guide = false, pasBougie(1000, 50) * 50), margeFutur(1000, 50), (overlays.guide = true, viewStart = 0, viewEnd = 30, margeFutur(1000, 30))]');
  // Glissement d'une bougie à la fois depuis la fin : le pas change d'au plus 1/n par bougie (la
  // marge se referme d'un pas par bougie quittée), jamais d'un coup.
  const pas = dansPage('(() => { const n = 50, out = []; for (let k = 0; k <= 12; k++) { viewEnd = 60 - k; viewStart = viewEnd - n; out.push(pasBougie(1000, n)); } return out; })()');
  const sauts = pas.slice(1).map((p, k) => p / pas[k] - 1);
  page.stockage['samsara-mode'] = 'debutant';
  const margeDeb = dansPage('viewStart = 10; viewEnd = 60; overlays.guide = true; [margeFutur(1000, 50), pasBougie(1000, 50) * 50]');
  dansPage('candles = []; viewEnd = 0; viewStart = 0;');
  check('Débutant : le Guide n’ouvre pas de marge de futur (pas de chemins dessinés), sans flèche de scénario la marge est nulle', margeDeb[0] === 0 && margeDeb[1] === 1000, margeDeb);
  check('marge de futur : bougies + marge = largeur du tracé ; Guide masqué, ou vue loin de la dernière bougie : marge nulle, le pas d’avant', Math.abs(marge[0] - 1000) < 1e-9 && marge[1] > 0 && marge[2] === 1000 && marge[3] === 0 && marge[4] === 0, marge);
  check('glisser d’une bougie hors de la fin : le pas des bougies varie de ≤ 1/n à chaque cran (avant : +22 % d’un coup) et rejoint le pas sans marge', sauts.every(x => x >= -1e-9 && x <= 1 / 50 + 1e-9) && Math.abs(pas[pas.length - 1] - 1000 / 50) < 1e-9, { pas, sauts });
  check('plafond de la marge dans PARAM.guide (futurMaxFraction), dit par la fiche « et ensuite ? »', P.futurMaxFraction > 0 && T.ficheHtml('guide_suite').includes(String(P.futurMaxFraction * 100).replace('.', ',') + ' %'));
  check('fiche des formes : plus de « 3 000 bougies » écrit à la main (la taille de l’historique est dite par le bilan)', !/3 000 bougies/.test(T.ficheHtml('guide_formes')));
  // Zéro gamma : un prix calculé par le modèle, pas un prix d'exercice ; le taux à 4 décimales.
  const mdP = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'contre', 'publication.json'), 'utf8'));
  if (!(mdP.micro.usdt_usd > 0)) mdP.micro.usdt_usd = 0.9992;
  const pubP = G.niveauxPublies(mdP);
  vm.runInContext('__pubP = ' + JSON.stringify(pubP), page.sandbox);
  const tz = dansPage('(() => { const z = __pubP.find(r => r.cle === "zero_gamma"), w = __pubP.find(r => r.cle === "put_wall"); return [guideTexteNiveau({ niv: { raisons: [z], demi: 10 } }, false)[0], guideTexteNiveau({ niv: { raisons: [w], demi: 10 } }, false)[0]]; })()');
  tz.forEach(t);
  const taux = mdP.micro.usdt_usd.toLocaleString('fr-FR', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  check('zéro gamma : « prix calculé par le modèle », jamais « prix d’exercice » ; mur de puts : « prix d’exercice » ; taux à 4 décimales (« ' + taux + ' »)', !/exercice/.test(tz[0].replace('pas un prix d’exercice', '')) && /Prix calculé par le modèle/.test(tz[0])
    && /Prix d’exercice/.test(tz[1]) && tz[1].includes('1 USDT = ' + taux + ' $'), tz);
  const appSrc = fs.readFileSync(path.join(REPO, 'js/app.js'), 'utf8');
  check('une seule formule du pas : plus aucun « pw / » dans le calcul des bougies, du réticule, de la chaleur, des sous-graphes', !/const gap = pw \//.test(appSrc) && !/chartPw \/ n/.test(appSrc), (appSrc.match(/const gap = [^;]+;/g) || []));
  // Les points d'une forme et le départ des chemins sont au CENTRE des bougies, au pixel près de
  // tracerBougie (x + candleW / 2, x = pad.left + gap × i) — pas au milieu du créneau (gap / 2).
  const xGuide = /const xDe = i => g\.pad\.left \+ g\.gap \* \(i - g\.vs\) \+ g\.candleW \/ 2;/.test(appSrc);
  const xBougie = /const xm = x \+ candleW \/ 2;/.test(appSrc) && /tracerBougie\(ctx, pad\.left \+ gap \* i, candleW,/.test(appSrc) && /guidePreparer\(\{[^}]*candleW[^}]*\}\)/.test(appSrc);
  check('Guide et bougies : même centre x (pad.left + gap × (i − vs) + candleW / 2)', xGuide && xBougie, { xGuide, xBougie });
  check('aucune minuterie dans le Guide (rien ne tourne au repos)', !/setInterval|setTimeout/.test(src) && !/setInterval|setTimeout/.test(appSrc.slice(appSrc.indexOf('// GUIDE — le dessin'), appSrc.indexOf('// Étiquettes d\'overlays posées'))));
}

// ── 7b. Débutant : les textes courts de l'écran ──
titre('7b. Débutant : libellés, phrase, forme, suite — courts, en mots simples');
{
  const DEB = dansPage('PARAM.guide.debutant');
  const Rd = (cle, p, extra) => Object.assign({ cle, p, nom: cle, court: cle, art: 'le ' + cle, origine: '', nature: 'mesuré', detail: '', detailCourt: '' }, extra || {});
  const N = (...rs) => ({ p: rs[0].p, pMin: Math.min(...rs.map(r => r.p)), pMax: Math.max(...rs.map(r => r.p)), raisons: rs });
  // 1. Libellés des repères : ≤ 26 caractères (≤ 18 étroit) ; le MOT d'origine gardé pour un prix BTC.
  const cles = Object.keys(G.NOMS_DEBUTANT).map(k => k === 'options' ? 'put_wall' : k);
  const libs = [];
  for (const cle of cles) for (const fl of [null, '↑', '↓']) {
    const n = N(Rd(cle, 85640));
    libs.push([cle, fl, t(G.libelleDebutant(n, { max: DEB.niveau, fleche: fl })), t(G.libelleDebutant(n, { max: DEB.niveauEtroit, fleche: fl }))]);
  }
  check('libellé d’un repère : ≤ ' + DEB.niveau + ' caractères, ≤ ' + DEB.niveauEtroit + ' en étroit, toujours avec son prix', libs.every(([, , a, b]) => a.length <= DEB.niveau && b.length <= DEB.niveauEtroit && /85 640/.test(a) && /85 640/.test(b)), libs);
  const mots = libs.filter(([cle, , , b]) => !b.includes(G.NOMS_DEBUTANT[cle === 'put_wall' ? 'options' : cle][1]));
  check('prix BTC (5 chiffres), étroit : le mot d’origine reste (« ↓Bas d’hier 85 640 »), flèche collée', !mots.length && libs.find(l => l[0] === 'hier_bas' && l[1] === '↓')[3] === '↓Bas d’hier 85 640', mots);
  check('libellé d’un repère : aucun mot banni du Débutant', libs.every(l => !G.motsBannis(l[2]).length && !G.motsBannis(l[3]).length), libs.filter(l => G.motsBannis(l[2] + ' ' + l[3]).length));
  // 2. La raison qui nomme une bande : jamais une option quand une mesure est dans la bande ; sinon la plus proche du prix de la bande.
  const nOpt = { p: 85600, pMin: 85600, pMax: 85640, raisons: [Rd('put_wall', 85600, { strike: 85600 }), Rd('hier_bas', 85640)] };
  const nDeux = { p: 85640, pMin: 85600, pMax: 85640, raisons: [Rd('sr', 85600), Rd('hier_bas', 85640)] };
  check('raisonPrincipale : une option ne nomme pas une bande qui a une mesure ; sinon le prix le plus proche de la bande', G.raisonPrincipale(nOpt).cle === 'hier_bas' && G.raisonPrincipale(nDeux).cle === 'hier_bas'
    && G.raisonPrincipale(N(Rd('call_wall', 87000, { strike: 87000 }))).cle === 'call_wall' && G.raisonPrincipale(null) === null, [G.raisonPrincipale(nOpt).cle, G.raisonPrincipale(nDeux).cle]);
  check('choixDebutant : une bande faite seulement d’options passe après une mesure du même côté', G.choixDebutant({ dessus: [N(Rd('call_wall', 86500, { strike: 86500 })), N(Rd('hier_haut', 86700))], dessous: [] }).dessus.raisons[0].cle === 'hier_haut'
    && G.choixDebutant({ dessus: [N(Rd('call_wall', 86500, { strike: 86500 }))], dessous: [] }).dessus.raisons[0].cle === 'call_wall' && G.choixDebutant(null).dessus === null);
  // 3. La phrase : un verbe, ni %, ni heure, ni nom d'indicateur ; « hésite » seulement sans tendance.
  const haut = N(Rd('hier_haut', 86398)), bas = N(Rd('mur_achat', 85900));
  const phr = [];
  for (const cle of ['hausse', 'baisse', 'faible', 'sans', 'incertaine', 'inconnu']) for (const ch of [{ dessus: [haut], dessous: [bas] }, { dessus: [], dessous: [bas] }, { dessus: [haut], dessous: [] }, { dessus: [], dessous: [] }])
    for (const itv of ['15m', '4h', null]) for (const maint of [false, true]) {
      const o = { prix: 86012.5, unite: '$', choix: ch, enTest: null, regime: { cle }, maintenant: maint, itv };
      const V = G.phrasesDebutant(o).map(t);
      phr.push({ cle, V, large: G.phraseDebutant(o, DEB.phrase), etroit: G.phraseDebutant(o, DEB.phraseEtroit) });
    }
  const sansVerbe = phr.filter(x => x.V.some(v => !/\b(monte|baisse|hésite|s’agite|touche|est|indisponible)\b/.test(v)));
  check('phrase : chaque variante porte un verbe (monte, baisse, hésite, s’agite, touche, est…)', !sansVerbe.length, sansVerbe.slice(0, 3));
  const tropLong = phr.filter(x => x.large.length > DEB.phrase || x.etroit.length > DEB.phraseEtroit);
  check('phrase choisie : ≤ ' + DEB.phrase + ' caractères, ≤ ' + DEB.phraseEtroit + ' en étroit (la forme compacte tient toujours)', !tropLong.length, tropLong.slice(0, 3).map(x => [x.large, x.etroit]));
  const sales = phr.filter(x => x.V.some(v => /%|\d\d:\d\d|\d+h\d\d|\bUTC\b/.test(v) || G.motsBannis(v).length));
  check('phrase : ni %, ni heure, ni mot banni', !sales.length, sales.slice(0, 3).map(x => x.V));
  const hesite = phr.filter(x => (x.cle === 'inconnu' || x.cle === 'incertaine') && x.V.some(v => /hésite/.test(v)));
  check('phrase : un régime inconnu ou de sens incertain ne « hésite » jamais (« s’agite » : le prix bouge fort)', !hesite.length && phr.some(x => x.cle === 'incertaine' && x.V.some(v => /s’agite/.test(v))), hesite.slice(0, 2).map(x => x.V));
  const deuxPrix = phr.filter(x => x.V[0].includes('entre')).every(x => x.V[0].includes('85 900 $') && x.V[0].includes('86 398 $'));
  check('phrase : les prix cités sont ceux des repères (85 900 $ et 86 398 $)', deuxPrix);
  const vide = phr.filter(x => !x.cle.match(/hausse|baisse/) && x.V[0].includes('86 398') && !x.V[0].includes('85 900'));
  check('phrase : un côté sans repère est dit (« Aucun repère proche en dessous »)', vide.length > 0 && vide.every(x => /Aucun repère proche en dessous/.test(x.V[0])), vide.slice(0, 2).map(x => x.V));
  const prixAbsent = G.phrasesDebutant({ prix: null, choix: { dessus: [haut], dessous: [bas] }, regime: { cle: 'faible' } });
  check('phrase : prix en direct absent, dit (aucun prix inventé)', prixAbsent.length === 1 && /indisponible/.test(prixAbsent[0]), prixAbsent);
  // 4. La forme : seulement confirmée ou invalidée, ≤ 24 caractères.
  const fo = [['double_sommet', { phase: 'confirme', sens: -1 }], ['double_creux', { fin: 'invalide', sens: 1 }], ['triangle', { phase: 'confirme', sens: 1 }], ['range', { phase: 'confirme', sens: -1 }], ['double_sommet', {}], ['triangle', { demi: true, demiSens: 1 }]]
    .map(([type, e]) => [type, t(G.libelleFormeDebutant(Object.assign({ type, sens: 1 }, e)) || '') || null]);
  check('forme : « Double sommet confirmé », « Double creux invalidé », « Sortie du triangle ↑ », « Sortie du rectangle ↓ » ; en formation ou à confirmer : rien', fo[0][1] === 'Double sommet confirmé' && fo[1][1] === 'Double creux invalidé' && fo[2][1] === 'Sortie du triangle ↑'
    && fo[3][1] === 'Sortie du rectangle ↓' && fo[4][1] === null && fo[5][1] === null && fo.every(([, l]) => !l || l.length <= DEB.forme), fo);
  // 5. La suite, en une phrase : « Si le prix finit un quart d'heure au-dessus de … ».
  const s2 = G.suite({ dessus: [N(Rd('hier_haut', 86398)), N(Rd('mur_vente', 86700, { lu: Date.parse('2026-10-08T22:51:00Z') }))], dessous: [bas] }, 86012.5);
  const sh = t(G.texteSuiteDebutant(s2.haut, '$', '15m', 1, Date.parse('2026-10-08T22:52:00Z'))), sb = t(G.texteSuiteDebutant(s2.bas, '$', '4h', -1)), sv = t(G.texteSuiteDebutant(null, '$', '15m', 1));
  check('suite : « Si le prix finit un quart d’heure au-dessus de 86 398 $ (plus haut d’hier), le repère suivant est 86 700 $ (mur de vente, relevé il y a 1 min). »',
    sh === 'Si le prix finit un quart d’heure au-dessus de 86 398 $ (plus haut d’hier), le repère suivant est 86 700 $ (mur de vente, relevé il y a 1 min).', sh);
  check('suite : la durée suit l’intervalle (« une tranche de 4 h ») ; sans repère suivant, dit ; côté vide, dit', /^Si le prix finit une tranche de 4 h sous 85 900 \$ \(mur d’achat\), aucun autre repère n’est proche de ce côté\.$/.test(sb)
    && sv === 'Aucun repère proche au-dessus : pas de suite à décrire de ce côté.', [sb, sv]);
  check('suite et forme : aucun mot banni, aucun conseil', ![sh, sb, sv].concat(fo.map(f => f[1] || '')).some(x => G.motsBannis(x).length || CONSEIL.test(x)));
  // 6. Les écarts en dollars : à l'unité près dès 10 $.
  check('prixRond : « 84 $ » (pas « 83,57 $ »), « 24 $ », « 3,50 $ » sous 10 $', G.prixRond(83.57) === '84 $' && G.prixRond(-24) === '24 $' && G.prixRond(3.5) === '3,50 $', [G.prixRond(83.57), G.prixRond(-24), G.prixRond(3.5)]);
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
