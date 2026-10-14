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
const Fm = require(path.join(REPO, 'js/format.js'));
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
  const hm = Fm.heure(Date.parse(md.liquidity.snapshot_at));   // l'heure de lecture, à l'heure de l'appareil
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
  check('formes étroites des libellés (mini, micro, courte ; deux modes) : chaque chiffre publié garde son heure', etroits.every(x => x.includes(hm) || x.includes(Fm.heure(Date.parse(md.updated)))), etroits);
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
  check('1 clôture sous la ligne de cou : « cassure … à valider (1/2 clôtures) »', f1 && G.etatForme(f1).cle === 'demi', f1 && G.etatForme(f1));
  const f2 = run([...lin(106, 102.5, 2), 102]).formes.find(f => f.type === 'double_sommet');
  check('2 clôtures sous la ligne de cou : « validé »', f2 && G.etatForme(f2).cle === 'confirme' && /2 clôtures sous la ligne de cou/.test(t(G.etatForme(f2).texte)), f2 && G.etatForme(f2));
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
  // (Sortie jugée hors de la bande ± bandeAtr × ATR : la chute franchit la ligne de cou nettement.)
  const base = [...lin(100, 100, 20), ...lin(100, 110, 10), ...lin(110, 104, 8), ...lin(104, 110.1, 8), ...lin(110.1, 98, k), 97.5, 97];
  const s = serie(base, d), r = G.detecter({ h: s.H, l: s.L, c: s.C, atr: atrDe(s.H, s.L, s.C, P.atrPeriode), n: s.C.length }, P);
  // (Changé exprès : l'ébauche de ce double sommet — son 2e sommet en attente — était à l'écran quand
  // la ligne de cou a cédé ; elle a suivi la même règle de sortie, et la figure née de son point
  // garde ce qui a été vu en direct. Repérable = à la naissance de l'ébauche, pas après coup.)
  const ds = r.formes.filter(f => f.type === 'double_sommet');
  check('ligne de cou confirmée pendant que l’ébauche était à l’écran : comptée, jamais confirmée avant l’ébauche (aucun « atteint » connu d’avance)', ds.every(f => f.jConf === null || f.jConf > (f.depuisEbauche ? f.t0Ebauche : f.t))
    && ds.filter(f => f.jConf !== null).every(f => f.depuisEbauche && r.ebauches.liste.some(e => e.devenue === f)), ds.map(f => ({ t: f.t, jConf: f.jConf, fin: f.fin, t0: f.t0Ebauche })));
  // Sans ébauche à l'écran (aucune bougie close à droite du 2e sommet avant la chute) : non comptée.
  const r0 = G.detecter({ h: s.H, l: s.L, c: s.C, atr: atrDe(s.H, s.L, s.C, P.atrPeriode), n: s.C.length }, Object.assign({}, P, { ebaucheDroiteMin: 99 }));
  check('… sans ébauche vue avant : la forme n’était repérable qu’après coup — ni montrée, ni comptée', !r0.formes.some(f => f.type === 'double_sommet' && f.jConf !== null && f.jConf <= f.t) && r0.bilan.double_sommet.confirmes === 0);
}
{
  // Triple sommet : (a, b) puis (b, c) — le même mouvement, un seul cas dans le bilan.
  const base = [...lin(100, 100, 20), ...lin(100, 110, 10), ...lin(110, 104, 8), ...lin(104, 110.1, 8), ...lin(110.1, 104.2, 8), ...lin(104.2, 110.05, 8), ...lin(110.05, 102.5, 4), 102, 101.5];
  const s = serie(base, d), r = G.detecter({ h: s.H, l: s.L, c: s.C, atr: atrDe(s.H, s.L, s.C, P.atrPeriode), n: s.C.length }, P);
  // Depuis les figures triples (plan figures §2.2) : le double vivant devient le triple ; le
  // mouvement reste compté une seule fois (double OU triple, jamais deux doubles).
  const conf = r.formes.filter(f => /^(double|triple)_sommet$/.test(f.type) && f.jConf !== null && !f.doublon);
  check('triple sommet : une seule confirmation comptée (pas deux doubles sur la même cassure)', conf.length === 1 && r.bilan.double_sommet.confirmes + r.bilan.triple_sommet.confirmes === 1, r.formes.filter(f => /sommet/.test(f.type)).map(f => ({ type: f.type, a: f.a.i, b: f.b.i, jConf: f.jConf, fin: f.fin, doublon: f.doublon })));
}
{
  // Range : 60 bougies entre 98 et 102, puis deux clôtures au-dessus.
  const osc = Array.from({ length: 64 }, (_, i) => 100 + 1.6 * Math.sin(i * Math.PI / 6));
  const base = [...lin(100, 100, 20), ...osc];
  const run = suite => { const s = serie(base.concat(suite), 0.3); return G.detecter({ h: s.H, l: s.L, c: s.C, atr: atrDe(s.H, s.L, s.C, P.atrPeriode), n: s.C.length }, P); };
  const r0 = run([]), f0 = G.formesAffichees(r0, P).find(f => f.type === 'range') || r0.formes.find(f => f.type === 'range' && !f.fin);
  check('range détecté : « le prix est dedans »', f0 && G.etatForme(f0).cle === 'dedans', f0 && { haut: f0.haut, bas: f0.bas, etat: G.etatForme(f0) });
  const r1 = run([103.5]), f1 = r1.formes.find(f => f.type === 'range' && f.t === (f0 && f0.t));
  check('1 clôture au-dessus : « sortie à valider (1/2 clôtures au-dessus) »', f1 && G.etatForme(f1).cle === 'demi' && /1\/2 clôtures au-dessus/.test(t(G.etatForme(f1).texte)), f1 && G.etatForme(f1));
  const r2 = run([103.5, 104]), f2 = r2.formes.find(f => f.type === 'range' && f.t === (f0 && f0.t));
  check('2 clôtures au-dessus : « sortie validée », objectif = borne + hauteur', f2 && G.etatForme(f2).cle === 'confirme' && Math.abs(f2.objectif - (f2.niveau + f2.hauteur)) < 1e-9, f2 && G.etatForme(f2));
}
{
  // Triangle : sommets qui baissent, creux qui montent. (Plan figures §2.4 : un triangle repéré
  // à plus de 85 % du chemin vers sa pointe n'est plus rendu : des droites qui se resserrent moins
  // vite, pour qu'il soit repéré avant ; type « triangle_symetrique ».)
  const pts = [100, 110, 101.5, 109, 102.5, 108, 103.5, 107];
  const ch = [...lin(100, 100, 10)];
  for (let k = 1; k < pts.length; k++) ch.push(...lin(pts[k - 1], pts[k], 6));
  ch.push(...lin(107, 106, 3));
  const s = serie(ch, 0.2), r = G.detecter({ h: s.H, l: s.L, c: s.C, atr: atrDe(s.H, s.L, s.C, P.atrPeriode), n: s.C.length }, P);
  const f = r.formes.find(x => x.type === 'triangle_symetrique');
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
  check('aucune forme comptée n’est confirmée avant d’être repérable (jConf > t, ou > naissance de son ébauche)', tout.formes.every(f => f.jConf === null || f.jConf > (f.depuisEbauche ? f.t0Ebauche : f.t)));
  check('repère sans forme calculé pour chaque type confirmé (mêmes distances, même sens)', G.TYPES.every(k => !b[k].confirmes || b[k].temoin.departs > 0), G.TYPES.map(k => [k, b[k].confirmes, b[k].temoin]));
  // (Plan figures §9.3 : un type à deux droites ne dit plus « confirmés » mais ses sorties ↑ / ↓ ;
  // le contrôle des mêmes comptes porte sur un type à extrêmes présent dans la fixture.)
  const exp = G.texteBilan(b.double_creux, { n: C.length, intervalle: '15m', duree: C.length * 900 }, P, 'expert'), deb = G.texteBilan(b.double_creux, { n: C.length, intervalle: '15m', duree: C.length * 900 }, P, 'debutant');
  t(exp); t(deb);
  check('bilan : mêmes comptes en débutant et en expert, « mesuré » dit dans les deux', exp.includes(b.double_creux.confirmes + ' valid.') && deb.includes(String(b.double_creux.confirmes)) && /Mesuré sur l’historique chargé/.test(deb) && /^Mesuré · /.test(exp), { exp, deb });
  const td = G.texteBilan(b.double_creux, { n: C.length, intervalle: '15m', duree: C.length * 900 }, P, 'debutant');
  check('bilan débutant : formes repérées, issues, et le repère sans forme en comptes (aucun %)', /repérés?/.test(t(td)) && (!b.double_creux.confirmes || /Repère sans forme/.test(td)) && !/%/.test(td), td);
  // Débutant : la phrase du cahier des charges d'abord, courte (une bulle de téléphone la lit).
  const bx = { type: 'double_sommet', formes: 31, confirmes: 14, atteints: 6, invalides: 7, expires: 1, ouverts: 0, temoin: { departs: 4614, atteints: 2335 } };
  const tb = t(G.texteBilan(bx, { n: 2980, intervalle: '15m', duree: 31 * 86400 }, P, 'debutant'));
  check('bilan débutant : « Sur les 2 980 dernières bougies 15 min (31 j) : 14 … validés …, objectif théorique atteint 6 fois avant invalidation … Échantillon faible. » — court', /sur les 2 980 dernières bougies 15 min \(31 j\) : 14 doubles sommets validés/.test(tb)
    && /objectif théorique atteint 6 fois avant invalidation/.test(tb) && /2 335 fois sur 4 614/.test(tb) && /Échantillon faible\.$/.test(tb) && tb.split(' ').length <= 60, [tb.split(' ').length, tb]);
  const ec = t(G.texteBilan(bx, { n: 2980, intervalle: '15m', duree: 31 * 86400 }, P, 'expertCourt'));
  // (Plan figures, amendement D1 : libellé ≤ 80 caractères, « mesuré {validés}/{repérées} valid., obj. {a}/{finies} ».)
  check('étiquette expert : les comptes et « éch. faible » d’abord (une coupure en bout de ligne n’ôte que la durée)', /^mesuré 14\/31 valid\., obj\. 6\/14 · éch\. faible/.test(ec), ec);
  // Un double devenu triple ne peut plus être validé : il sort du dénominateur de l'étiquette,
  // comme la bulle le dit (« dont N devenus triples »).
  const ec4 = t(G.texteBilan(Object.assign({}, bx, { devenusTriples: 4 }), { n: 2980, intervalle: '15m', duree: 31 * 86400 }, P, 'expertCourt'));
  check('étiquette expert : les doubles devenus triples hors du dénominateur (« mesuré 14/27 valid. » pour 31 repérés dont 4 devenus triples)', /^mesuré 14\/27 valid\./.test(ec4), ec4);
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
  const pub = G.niveauxPublies(md), hm = Fm.heure(Date.parse(md.liquidity.snapshot_at));   // heure de l'appareil
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
  const h2103 = Fm.heure(Date.UTC(2026, 9, 8, 21, 3));   // la lecture du mur, à l'heure de l'appareil
  // Les noms exportés que js/app.js fait suivre de « UTC » ou « heure de Paris » gardent leur sens exact.
  check('noms exportés pour la page : heureUTC = l’heure UTC (« 21:03 »), heureParis = l’heure de Paris (« 23h03 ») ; les textes du Guide n’en usent pas', G.heureUTC(Date.UTC(2026, 9, 8, 21, 3)) === '21:03' && G.heureParis(Date.UTC(2026, 9, 8, 21, 3)) === '23h03' && G.heureParis(NaN) === null
    && !/\bheureUTC\(|\bheureParis\(/.test(fs.readFileSync(path.join(REPO, 'js/guide.js'), 'utf8')));
  check(`variante mini : l’heure d’un chiffre publié collée à CE chiffre (« si < 81 670 (${h2103}) → 80 394 »), pas au niveau suivant`, mini[0] === 'si < 81 670 (' + h2103 + ')' && mini[1] === '→ 80 394', mini);
  const aucun = ['plein', 'court', 'mini'].map(v => G.texteSuite(null, 'debutant', '$', '15m', P, v, -1).join(' '));
  aucun.forEach(t);
  check('côté sans niveau nommé : dit dans chaque variante', aucun.every(x => /aucun niveau/.test(x)), aucun);
  check('un pourcentage de PARAM n’est jamais arrondi à 0 (« 0,4 % »)', G.pctParam(0.004) === '0,4' && G.pctParam(0.06) === '6');
  // L'issue d'une forme est datée : « vient d'être » ne se dit que pour la dernière bougie close.
  // (Changé exprès, revue du 14/10/2026, M5 : « raté » après la validation, « annulé » avant ;
  // plus « invalidé ».)
  const fi = { type: 'double_sommet', fin: 'invalide', sens: -1 }, fa = { type: 'double_sommet', fin: 'invalide_avant', sens: -1 };
  const p17 = t(G.phraseForme(fi, '$', { bougies: 17, itv: '1d', date: '21/09' })), p1 = G.phraseForme(fi, '$', { bougies: 1, itv: '1d', date: '07/10' });
  const a17 = t(G.phraseForme(fa, '$', { bougies: 17, itv: '1d', date: '21/09' })), a1 = G.phraseForme(fa, '$', { bougies: 1, itv: '1d', date: '07/10' });
  check('forme ratée il y a 17 bougies 1 jour : « a raté il y a 17 bougies 1 jour (21/09) » ; la veille : « vient de rater » ; avant sa validation : « a été annulé », « vient d’être annulé »',
    p17 === 'un double sommet a raté il y a 17 bougies 1 jour (21/09)' && /vient de rater$/.test(p1) && a17 === 'un double sommet a été annulé il y a 17 bougies 1 jour (21/09)' && /vient d’être annulé$/.test(a1), [p17, p1, a17, a1]);
  // Lecture compacte (téléphone) : les prix et leurs heures, la compression dite.
  const lc = t(G.lecture({ prix: 81686, unite: '$', choix: choixDans, enTest: bande, regime: { cle: 'baisse', compression: true }, forme: null, court: true, compact: true }));
  check(`lecture compacte : « Prix 81 686 $ dans la bande 81 670 (lu à ${h2103}) – 81 891 $. Volatilité comprimée. »`, lc === 'Prix 81 686 $ dans la bande 81 670 (lu à ' + h2103 + ') – 81 891 $. Volatilité comprimée.', lc);
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
  // Le panneau « Choisir l'affichage » range ses calques par question : le Guide est EN TÊTE de la
  // sienne, et en tête du panneau du Lisible (couche affichée par défaut, visible sans défiler) ; en
  // Complet, sa puce du ruban le masque d'un clic (tests/test_interface.js).
  const T = page.T, cat = T.INDICATORS.find(c => c.items.some(i => i.key === 'guide'));
  check('panneau « Choisir l’affichage » : le Guide EN TÊTE de sa question (« Où le prix peut réagir ? »), avec sa fiche ; en tête du panneau du Lisible',
    cat && cat.cat === 'reaction' && cat.titre === 'Où le prix peut réagir ?' && cat.items[0].key === 'guide' && T.FICHE_IND.guide === 'guide'
    && vm.runInContext('COUCHES_SITE[0]', page.sandbox) === 'guide', cat && cat.items.map(i => i.key));
  const fiches = ['guide', 'guide_niveaux', 'guide_regime', 'guide_formes', 'guide_suite'];
  check('fiches du Guide définies, chacune « pas un conseil »', fiches.every(k => T.FICHES[k] && /pas un conseil/.test(T.ficheHtml(k))));
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
  const mots = libs.filter(([cle, , , b]) => { const N = G.NOMS_DEBUTANT[cle === 'put_wall' ? 'options' : cle]; return !b.includes(N[1]) && !b.includes(N[3]); });
  check('prix BTC (5 chiffres), étroit : le mot d’origine reste (« ↓Bas hier 85 640 $ », « ↑Max hier 85 640 $ »), flèche collée, toujours avec « $ »', !mots.length && libs.find(l => l[0] === 'hier_bas' && l[1] === '↓')[3] === '↓Bas hier 85 640 $'
    && libs.find(l => l[0] === 'hier_haut' && l[1] === '↑')[3] === '↑Max hier 85 640 $' && libs.every(l => / \$$/.test(l[2]) && / \$$/.test(l[3])), mots.concat(libs.filter(l => !/ \$$/.test(l[3]))));
  check('libellé d’un repère : aucun mot banni du Débutant', libs.every(l => !G.motsBannis(l[2]).length && !G.motsBannis(l[3]).length), libs.filter(l => G.motsBannis(l[2] + ' ' + l[3]).length));
  // 2. La raison qui nomme une bande : jamais une option quand une mesure est dans la bande ; sinon la plus proche du prix de la bande.
  const nOpt = { p: 85600, pMin: 85600, pMax: 85640, raisons: [Rd('put_wall', 85600, { strike: 85600 }), Rd('hier_bas', 85640)] };
  const nDeux = { p: 85640, pMin: 85600, pMax: 85640, raisons: [Rd('sr', 85600), Rd('hier_bas', 85640)] };
  check('raisonPrincipale : une option ne nomme pas une bande qui a une mesure ; sinon le prix le plus proche de la bande', G.raisonPrincipale(nOpt).cle === 'hier_bas' && G.raisonPrincipale(nDeux).cle === 'hier_bas'
    && G.raisonPrincipale(N(Rd('call_wall', 87000, { strike: 87000 }))).cle === 'call_wall' && G.raisonPrincipale(null) === null, [G.raisonPrincipale(nOpt).cle, G.raisonPrincipale(nDeux).cle]);
  check('choixDebutant : une bande faite seulement d’options passe après une mesure du même côté', G.choixDebutant({ dessus: [N(Rd('call_wall', 86500, { strike: 86500 })), N(Rd('hier_haut', 86700))], dessous: [] }).dessus.raisons[0].cle === 'hier_haut'
    && G.choixDebutant({ dessus: [N(Rd('call_wall', 86500, { strike: 86500 }))], dessous: [] }).dessus.raisons[0].cle === 'call_wall' && G.choixDebutant(null).dessus === null);
  // La bulle d'un repère dit l'écart en dollars, sans « % » (le Lisible n'en montre aucun). Plan du
  // site, idée 8 (13/10/2026) : l'écart, dans une phrase à lui, dit à quoi il sert — ce qu'il reste
  // avant ce repère, ou l'écart déjà fait au-delà quand le prix l'a passé (il finissait par « au-dessus. »).
  const nE = { p: 85640, demi: 40, dessus: true, pMin: 85600, pMax: 85680, raisons: [Rd('hier_haut', 85640)] }, PL = dansPage('PARAM.guide');
  const etats = [85300, 85500, 85660, 86000, 88000].map(live => G.texteEtatDebutant(G.etatLive(nE, live, null, PL), nE, live, '$', '1h'));
  check('bulle d’un repère, « Maintenant : … » : l’écart en dollars, aucun « % » ; avant le repère « 340 $ au-dessus : ce qu’il reste avant ce repère », passé « 360 $ en dessous : l’écart déjà fait au-delà », dedans sans écart',
    etats.every(x => /^Maintenant : /.test(x) && !/%/.test(x)) && /\. 340 \$ au-dessus : ce qu’il reste avant ce repère\.$/.test(etats[0]) && etats[2] === 'Maintenant : le prix est dedans.'
    && /\. 360 \$ en dessous : l’écart déjà fait au-delà\.$/.test(etats[3]) && /\. 2 360 \$ en dessous : l’écart déjà fait au-delà\.$/.test(etats[4]), etats);
  // 2 bis. Les repères du Débutant, choisis au prix LIVE (constat de revue : une bande fusionnée qui
  // enjambait le prix nommait « au-dessus » un prix situé en dessous).
  {
    const bA = N(Rd('hier_bas', 85600), Rd('sr', 85602), Rd('put_wall', 85643, { strike: 85643 })), bB = N(Rd('h24_bas', 85887), Rd('hier_haut', 86133));
    const reps = G.reperesDe({ dessus: [bB], dessous: [bA] }, 20);
    const s1 = G.choisirReperes(reps, 86000, 100), s2 = G.choisirReperes(reps, 85620, 100), s3 = G.choisirReperes(reps, 85900, 100);
    check('repères : une bande qui enjambe le prix donne un repère de chaque côté, chacun strictement de son côté (86 000 → 86 133 au-dessus, 85 887 au-dessous)',
      s1.dessus.p === 86133 && s1.dessous.p === 85887 && s1.dessus.dessus === true && s1.dessous.dessus === false && G.raisonPrincipale(s1.dessus).cle === 'hier_haut', [s1.dessus && s1.dessus.p, s1.dessous && s1.dessous.p]);
    check('repères : prix DANS une bande de trois prix (85 620) → au-dessus une mesure (85 887, pas l’option 85 643), au-dessous 85 602 ; le suivant au-delà de chacun',
      s2.dessus.p === 85887 && s2.dessous.p === 85602 && s2.suivantHaut && s2.suivantHaut.p === 86133 && (!s2.suivantBas || s2.suivantBas.p <= 85502), [s2.dessus && s2.dessus.p, s2.dessous && s2.dessous.p, s2.suivantHaut && s2.suivantHaut.p]);
    const r5 = G.reperesDe({ dessus: [N(Rd('mur_vente', 82710)), N(Rd('hier_haut', 82890))], dessous: [N(Rd('sr', 82672))] }, 20), s5 = G.choisirReperes(r5, 82680, 75);
    check('repères : deux prix à moins de l’écart minimal (82 672 et 82 710, prix 82 680 : 38 $ < 75) ne font pas deux repères : le plus proche reste, l’autre côté passe au suivant (82 890)',
      s5.dessous.p === 82672 && s5.dessus.p === 82890 && s3.dessous.p === 85887 && s3.dessus.p === 86133, [s5.dessus && s5.dessus.p, s5.dessous && s5.dessous.p]);
    const r2 = G.reperesDe({ dessus: [N(Rd('mur_achat', 86100)), N(Rd('mur_vente', 86300))], dessous: [N(Rd('mur_vente', 85950)), N(Rd('hier_bas', 85800))] }, 20), s4 = G.choisirReperes(r2, 86050, 50);
    check('repères : un mur d’achat n’est jamais « au-dessus », un mur de vente jamais « au-dessous »', s4.dessus.p === 86300 && s4.dessous.p === 85800, [s4.dessus && s4.dessus.p, s4.dessous && s4.dessous.p]);
    const r3 = G.reperesDe({ dessus: [N(Rd('hier_haut', 86200), Rd('h24_haut', 86200))], dessous: [] }, 20);
    check('repères : deux raisons au même prix font un seul repère, nommé par la plus parlante (hier avant 24 h)', r3.length === 1 && r3[0].raisons.length === 2 && G.raisonPrincipale(r3[0]).cle === 'hier_haut', r3);
    // La phrase garde son verbe sur téléphone quand le prix touche un repère.
    const enT = s1.dessus, court = [];
    for (const cle of ['hausse', 'baisse', 'faible', 'incertaine']) court.push([cle, G.phraseDebutant({ prix: 86120, unite: '$', reperes: s1, enTest: enT, regime: { cle }, itv: '15m' }, DEB.phraseEtroit)]);
    check('phrase au téléphone, prix dans un repère : le verbe du mouvement reste (« Depuis 3 h, le prix monte et touche 86 133 $. »)', court.every(([cle, t]) => t.length <= DEB.phraseEtroit && t.includes(G.VERBE_DEBUTANT[cle]) && /touche/.test(t)), court);
    // Sur 1 jour, quand durée + « touche » ne tiennent pas : la durée reste, le prix touché part.
    // (« Sur 14 jours » est plus court que l'ancien « Sur 2 semaines » : la phrase entière tient
    // en 48 ; la priorité se vérifie sous la longueur de la phrase entière, à 46.)
    const jour = ['hausse', 'baisse'].map(cle => G.phraseDebutant({ prix: 86120, unite: '$', reperes: s1, enTest: enT, regime: { cle }, itv: '1d' }, 46));
    const jour48 = ['hausse', 'baisse'].map(cle => G.phraseDebutant({ prix: 86120, unite: '$', reperes: s1, enTest: enT, regime: { cle }, itv: '1d' }, DEB.phraseEtroit));
    check('téléphone, 1 jour, prix dans un repère : « Sur 14 jours, le prix monte. » (la durée avant le prix touché) ; en 48, la phrase entière', jour[0] === 'Sur 14 jours, le prix monte.' && jour[1] === 'Sur 14 jours, le prix baisse.'
      && jour48.every(x => x.length <= DEB.phraseEtroit && x.indexOf('Sur 14 jours, ') === 0 && /touche 86 133 \$\.$/.test(x)), jour.concat(jour48));
  }
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
  // 3 bis. Au téléphone, un sens (monte, baisse) garde sa durée (constat de revue : « Le prix
  // monte. » à côté de « −0,57 % en 24 h » en rouge) ; le repère quitte la phrase avant elle.
  {
    const duree = [];
    for (const itv of Object.keys(G.HORIZON_COURT)) for (const cle of ['hausse', 'baisse']) for (const ch of [{ dessus: [haut], dessous: [bas] }, { dessus: [], dessous: [] }]) {
      const o = { prix: 86012.5, unite: '$', choix: ch, enTest: null, regime: { cle }, itv };
      const e = G.phraseDebutant(o, DEB.phraseEtroit), l = G.phraseDebutant(o, DEB.phrase);
      duree.push({ itv, cle, e, l, ok: e.length <= DEB.phraseEtroit && [G.HORIZON_DEBUTANT[itv], G.HORIZON_COURT[itv]].some(h => e.indexOf(h + ', ') === 0) && l.indexOf(G.HORIZON_DEBUTANT[itv] + ', ') === 0 && e.includes(G.VERBE_DEBUTANT[cle]) });
    }
    check('téléphone (48) : « Sur 3 h 30, le prix monte. Au-dessus : 86 398 $. » — un sens garde toujours sa durée, sur chaque intervalle', duree.every(x => x.ok)
      && duree.some(x => x.e === 'Sur 3 h 30, le prix monte. Au-dessus : 86 398 $.'), duree.filter(x => !x.ok).slice(0, 4));
    // La durée courte est celle que dit la bulle de la phrase (« sur les 14 derniers quarts d'heure
    // (environ 3 h 30) ») : PARAM.adx.periode bougies, environ (incohérence 96 : « Depuis 3 h »).
    const PAS = { '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400 }, nAdx = dansPage('PARAM.adx.periode');
    const ecartH = Object.keys(PAS).filter(k => G.HORIZON_COURT[k].replace(/^(Sur|Depuis) /, '') !== String(G.environ(nAdx * PAS[k])).replace(/^environ /, '')).map(k => [k, G.HORIZON_COURT[k], G.environ(nAdx * PAS[k])]);
    check('durées courtes = environ(PARAM.adx.periode × pas), la durée de la bulle, sur chaque intervalle ; jamais « Depuis » devant des heures et minutes', !ecartH.length && Object.keys(PAS).every(k => G.HORIZON_COURT[k]) && !Object.values(G.HORIZON_COURT).some(h => /^Depuis \d+ h \d/.test(h)), ecartH);
    const Hs = Object.values(G.HORIZON_COURT).filter(h => G.motsBannis(h).length || h.length > 14);
    check('durées courtes : ≤ 14 caractères, sans mot banni (« 3 h », jamais « 3h »)', !Hs.length, Hs);
  }
  // 3 ter. « Entre B et A » seulement si les deux repères sont dans la vue (constat de revue :
  // « hésite entre 82 626 $ et 83 170 $ » sur un axe 82 465–82 777).
  {
    const loinH = N(Rd('h24_haut', 87000)), presB = N(Rd('sr', 85900));
    const vue = { lo: 85700, hi: 86300 }, ent = [];
    for (const cle of ['faible', 'sans', 'incertaine']) for (const [ch, att] of [[{ dessus: [loinH], dessous: [presB] }, /au-dessus de 85 900 \$/], [{ dessus: [N(Rd('hier_haut', 86200))], dessous: [N(Rd('hier_bas', 85000))] }, /sous 86 200 \$/],
      [{ dessus: [loinH], dessous: [N(Rd('hier_bas', 85000))] }, /loin de ses repères|hésite\.|s’agite\./]]) {
      const V = G.phrasesDebutant({ prix: 86012.5, unite: '$', choix: ch, enTest: null, regime: { cle }, itv: '15m', vue });
      ent.push({ cle, V, ok: !V.some(v => /entre/.test(v)) && att.test(V[0]) });
    }
    const dedans = G.phrasesDebutant({ prix: 86012.5, unite: '$', choix: { dessus: [N(Rd('hier_haut', 86200))], dessous: [presB] }, enTest: null, regime: { cle: 'faible' }, itv: '15m', vue });
    check('un repère hors de la vue : jamais « entre » ; la phrase nomme le repère proche seul (« … hésite au-dessus de 85 900 $. ») ; les deux dans la vue : « entre »', ent.every(x => x.ok) && /entre 85 900 \$ et 86 200 \$/.test(dedans[0]), ent.filter(x => !x.ok).concat([dedans[0]]));
  }
  // 3 quater. Une zone de retour se nomme par ce qu'elle a été (« Zone retour », « Retour »), jamais
  // « Demi-tour » (lu comme une consigne ou une prévision).
  {
    const z = N(Rd('sr', 82681)), Z = [DEB.niveau, DEB.niveauEtroit].map(max => t(G.libelleDebutant(z, { max })));
    check('zone de retour : « Zone de retour · 82 681 $ » (26), « Retour 82 681 $ » (18), jamais « Demi-tour »', Z[0] === 'Zone de retour · 82 681 $' && Z[1] === 'Retour 82 681 $' && !JSON.stringify(G.NOMS_DEBUTANT).includes('Demi-tour')
      && t(G.libelleDebutant(Object.assign({}, z, { raisons: [Rd('sr', 749.15)] }), { max: DEB.niveau, unite: 'SOL' })) === 'Zone retour · 749,15 SOL', Z);
  }
  // 4. La forme : validée, invalidée, et aussi pendant qu'elle se dessine (« possible », « Prix
  //    dans un … », « à valider ») ; ≤ 26 caractères. (Plan figures §5.3 et amendement C6 : une
  //    figure invalidée porte « ✗ » ; la cible atteinte et la figure sans suite sont nommées.)
  const fo = [['double_sommet', { phase: 'confirme', sens: -1 }], ['double_creux', { fin: 'invalide', sens: 1 }], ['triangle_symetrique', { phase: 'confirme', sens: 1 }], ['range', { phase: 'confirme', sens: -1 }],
    ['double_sommet', {}], ['triangle_symetrique', { demi: true, demiSens: 1 }], ['range', {}], ['double_creux', { demi: true }], ['double_sommet', { fin: 'atteint' }], ['triangle_symetrique', { fin: 'expire_avant' }]]
    .map(([type, e]) => [type, t(G.libelleFormeDebutant(Object.assign({ type, sens: 1 }, e)) || '') || null]);
  // (Changé exprès : le côté d'une sortie se dit en mots, jamais par une flèche seule ; le nom reste.)
  // (Changé exprès, revue du 14/10/2026, M5 : « ✗ Double creux raté », plus « invalidé ».)
  check('forme : « Double sommet validé », « ✗ Double creux raté », « Triangle : sortie en haut », « Rectangle : sortie en bas » ; en train de se dessiner : « Double sommet possible », « Triangle : sort en haut ? », « Prix dans un rectangle », « Double creux à valider » ; issues : « Double sommet : objectif ✓ » (la forme longue dépasse : le nom reste — changé exprès, revue des figures 2), « ○ Triangle sans suite »',
    fo[0][1] === 'Double sommet validé' && fo[1][1] === '✗ Double creux raté' && fo[2][1] === 'Triangle : sortie en haut' && fo[3][1] === 'Rectangle : sortie en bas'
    && fo[4][1] === 'Double sommet possible' && fo[5][1] === 'Triangle : sort en haut ?' && fo[6][1] === 'Prix dans un rectangle' && fo[7][1] === 'Double creux à valider'
    && fo[8][1] === 'Double sommet : objectif ✓' && fo[9][1] === '○ Triangle sans suite' && fo.every(([, l]) => !l || l.length <= DEB.forme) && !fo.some(([, l]) => /[↑↓]/.test(l || '')), fo);
  {
    // Une marque par issue (incohérence 119) : ✗ seulement pour une figure invalidée ou annulée ;
    // « – » pour un délai écoulé après la validation ; « ○ » pour une figure restée sans suite.
    const issue = (fin, e) => G.libelleFormeDebutant(Object.assign({ type: 'double_sommet', sens: -1, fin }, e || {})) || '';
    const L = { invalide: issue('invalide'), invalide_avant: issue('invalide_avant'), abandon: issue('abandon', { ebauche: true }), expire: issue('expire'), expire_avant: issue('expire_avant') };
    // Un mot par issue (revue du 14/10/2026, M5) : « raté » après la validation, « annulé » avant
    // (figure jamais validée ou ébauche) ; plus « invalidé ».
    check('une marque par issue : ✗ ratée / annulée, « – » délai écoulé, « ○ » sans suite ; jamais ✗ pour une figure qui n’a pas échoué', /^✗ .*raté$/.test(L.invalide) && /^✗ .*annulé$/.test(L.invalide_avant) && /^✗ .*annulé/.test(L.abandon)
      && /^– /.test(L.expire) && !/✗/.test(L.expire) && /^○ .*sans suite/.test(L.expire_avant) && !/✗/.test(L.expire_avant)
      && G.MARQUES_FIN.invalide === '✗' && G.MARQUES_FIN.abandon === '✗' && G.MARQUES_FIN.expire === '–' && G.MARQUES_FIN.expire_avant === '○' && !('atteint' in G.MARQUES_FIN), L);
  }
  // 4 bis. La bulle d'une figure qui se dessine : ce qu'on voit, ce qui la validerait (2 périodes
  // finies de suite), ce qui l'annulerait, sa cible conditionnelle (« cible théorique … non
  // garantie »), toujours avec le bilan mesuré ; mots du Débutant seulement. (Plan figures §9.3 :
  // « jamais un prix visé » devient « cible conditionnelle, toujours avec le bilan mesuré » ; figures
  // complètes, comme le détecteur les rend ; wording des amendements C2 et C4.)
  {
    const ds = { type: 'double_sommet', sens: -1, a: { i: 10, p: 86400 }, b: { i: 30, p: 86350 }, cou: { i: 20, p: 85700 }, niveau: 85700, extreme: 86400, hauteur: 700, objectif: 85000, invalidation: 86400, debut: 10 };
    const dc = { type: 'double_creux', sens: 1, a: { i: 10, p: 81900 }, b: { i: 30, p: 81950 }, cou: { i: 20, p: 82600 }, niveau: 82600, extreme: 81900, hauteur: 700, objectif: 83300, invalidation: 81900, demi: true, demiSens: 1, jDemi: 40, debut: 10 };
    const rg = { type: 'range', haut: 83500, bas: 82900, hautL: { a: 83500, b: 0 }, basL: { a: 82900, b: 0 }, hauteur: 600, apex: Infinity, debut: 5 };
    const tr = { type: 'triangle_symetrique', hautL: { a: 84000, b: -10 }, basL: { a: 82000, b: 10 }, hauteur: 1900, apex: 100, demi: true, demiSens: -1, jDemi: 40, debut: 5 };
    const b = { type: 'double_sommet', formes: 6, confirmes: 3, atteints: 1, invalides: 1, expires: 0, haut: 1, bas: 2, ebauches: { n: 0, devenues: 0, confirmees: 0 }, temoin: { departs: 300, atteints: 90 } };
    const ec = [[ds, '15m'], [dc, '1h'], [rg, '15m'], [tr, '4h']].map(([f, itv]) => t(G.texteFormeDebutant(f, b, { duree: 5 * 86400, itv, j: 41 }, P, '$').join(' ')));
    // (Changé exprès, revue du 14/10/2026, M6 : 50 mots par bulle, 15 par phrase. Le nom, déjà dans le
    // titre de la bulle, n'est plus redit en tête ; « Figure validée si … » dit le seuil, sans son origine ni
    // le court retour, qui restent dans « Le détail » ; les phrases à point-virgule sont coupées.)
    check('en train de se dessiner : « Le prix a buté deux fois entre 86 350 et 86 400 $. Figure validée si le prix finit 2 quarts d’heure de suite sous 85 700 $. »',
      /^Le prix a buté deux fois entre 86 350 et 86 400 \$\. Figure validée si le prix finit 2 quarts d’heure de suite sous 85 700 \$\. Annulée si /.test(ec[0]), ec[0]);
    check('… à valider : « S’il finit encore une heure au-dessus, la figure sera validée » ; rectangle : « entre 82 900 et 83 500 $ » ; sortie : « S’il revient franchement dedans, la sortie ne compte pas »',
      /^Le prix a rebondi deux fois .*Il a fini une heure au-dessus de 82 600 \$\. S’il finit encore une heure au-dessus, la figure sera validée\./.test(ec[1]) && /Prix dans un rectangle : il fait des allers-retours entre 82 900 et 83 500 \$/.test(ec[2])
      && /^Triangle qui se resserre : .*Le prix vient de sortir par le bas\. Il a fini une tranche de 4 h sous .*S’il revient franchement dedans, la sortie ne compte pas\./.test(ec[3]), ec);
    // (Revue du 14/10/2026, M6 : « selon l'usage des analystes » part de la bulle du Débutant ;
    // « théorique » et « non garanti » restent, les statistiques de la figure disent d'où il vient.)
    // (Revue du 14/10/2026, C19 : la fin est l'avertissement partagé de la charte, « Une description,
    // pas un conseil. », plus « pas une prévision ni un conseil ».)
    check('… toujours l’objectif théorique (« non garanti », jamais « cible ») avec le bilan mesuré, l’annulation dite pour les doubles, jamais « vise », aucun mot banni, aucun conseil, « Une description, pas un conseil. »',
      ec.every(x => /Mesuré sur/.test(x) && /[Oo]bjectifs? théoriques? : \d/.test(x) && /non garantis?/.test(x) && !/cible/i.test(x) && !/vise/.test(x) && !G.motsBannis(x).length && !CONSEIL.test(x.replace(G.AVERTISSEMENT, '')) && x.endsWith(G.AVERTISSEMENT) && !/pas une prévision ni/.test(x))
      && /Annulée si le prix finit un quart d’heure au-dessus de 86 400 \$/.test(ec[0]) && /Annulée si le prix finit une heure sous 81 900 \$/.test(ec[1]), ec.map(x => [x, G.motsBannis(x)]));
    // Plan du site, idée 8 (13/10/2026) : l'objectif dit sur quoi il se calcule (hauteur, ou largeur
    // pour une figure à deux droites) — en moins de mots depuis la revue du 14/10/2026 (M6, N6) :
    // « sa hauteur, reportée » ; le rectangle, ses deux objectifs dans une phrase, le calcul dans la suivante.
    check('… l’objectif dit sur quoi il se calcule : « 85 000 $ (sa hauteur, reportée) », rectangle « Calculés avec sa largeur reportée »',
      /objectif théorique : 85 000 \$ \(sa hauteur, reportée\), non garanti/.test(ec[0]) && /objectifs théoriques : 84 100 \$ par le haut, 82 300 \$ par le bas\. Calculés avec sa largeur reportée, non garantis\./.test(ec[2]), [ec[0], ec[2]]);
    // La preuve du budget (revue du 14/10/2026, M6) : chaque phrase de ces bulles fait 15 mots au plus,
    // comptés comme les fiches (un groupe qui porte une lettre ou un chiffre).
    const longues = ec.flatMap(x => x.split(/(?<=[.!?])\s+(?=[A-ZÀÂÉÈÊÎÔÛÇ«0-9])/)).filter(p => p.split(/\s+/).filter(w => /[\p{L}\p{N}]/u.test(w)).length > 15);
    check('… chaque phrase de ces bulles : 15 mots au plus (charte du 12/10/2026)', !longues.length, longues);
  }
  // 5. La suite, en une phrase : « Si le prix finit un quart d'heure au-dessus de … ».
  const s2 = G.suite({ dessus: [N(Rd('hier_haut', 86398)), N(Rd('mur_vente', 86700, { lu: Date.parse('2026-10-08T22:51:00Z') }))], dessous: [bas] }, 86012.5);
  const sh = t(G.texteSuiteDebutant(s2.haut, '$', '15m', 1, Date.parse('2026-10-08T22:52:00Z'))), sb = t(G.texteSuiteDebutant(s2.bas, '$', '4h', -1)), sv = t(G.texteSuiteDebutant(null, '$', '15m', 1));
  // Plan du site, idée 8 (13/10/2026) : l'âge d'un chiffre publié dans une phrase à lui, qui dit à
  // quoi il sert (il était entre parenthèses : « (mur de vente, relevé il y a 1 min) »).
  // (Changé exprès, revue du 14/10/2026, M6 : la phrase faisait 21 mots, l'exemple « Avant » de la
  // charte ; sans les noms entre parenthèses, comme son exemple « Après » — l'âge nomme le mur.)
  check('suite : « Si le prix finit un quart d’heure au-dessus de 86 398 $ : prochain repère 86 700 $. Mur de vente relevé il y a 1 min : l’âge de ce chiffre. »',
    sh === 'Si le prix finit un quart d’heure au-dessus de 86 398 $ : prochain repère 86 700 $. Mur de vente relevé il y a 1 min : l’âge de ce chiffre.', sh);
  // Un chiffre publié il y a moins d'une minute : pas de « relevé il y a 0 min » (rien de plus à dire).
  const s0 = t(G.texteSuiteDebutant(s2.haut, '$', '15m', 1, Date.parse('2026-10-08T22:51:30Z')));
  check('suite : un chiffre publié il y a moins d’une minute ne dit pas « il y a 0 min »', s0 === 'Si le prix finit un quart d’heure au-dessus de 86 398 $ : prochain repère 86 700 $.', s0);
  // La preuve (revue du 14/10/2026, M6) : la phrase de la suite tient en 15 mots (règle des fiches).
  check('suite : 15 mots au plus (charte du 12/10/2026 ; elle en faisait 21)', s0.split(/\s+/).filter(w => /[\p{L}\p{N}]/u.test(w)).length <= 15, s0);
  // Dans la bulle du repère lui-même (seuilDit) : son nom et son prix sont dans le titre, pas redits.
  const sd = t(G.texteSuiteDebutant(s2.haut, '$', '15m', 1, Date.parse('2026-10-08T22:52:00Z'), true));
  check('suite, bulle du repère : la condition sans redire le repère du titre', sd === 'Si le prix finit un quart d’heure au-dessus : prochain repère 86 700 $. Mur de vente relevé il y a 1 min : l’âge de ce chiffre.', sd);
  check('suite : la durée suit l’intervalle (« une tranche de 4 h ») ; sans repère suivant, dit ; côté vide, dit', /^Si le prix finit une tranche de 4 h sous 85 900 \$ : aucun autre repère proche\.$/.test(sb)
    && sv === 'Aucun repère proche au-dessus.', [sb, sv]);
  check('suite et forme : aucun mot banni, aucun conseil', ![sh, sb, sv].concat(fo.map(f => f[1] || '')).some(x => G.motsBannis(x).length || CONSEIL.test(x)));
  // 6. Les écarts en dollars : à l'unité près dès 10 $.
  check('prixRond : « 84 $ » (pas « 83,57 $ »), « 24 $ », « 3,50 $ » sous 10 $', G.prixRond(83.57) === '84 $' && G.prixRond(-24) === '24 $' && G.prixRond(3.5) === '3,50 $', [G.prixRond(83.57), G.prixRond(-24), G.prixRond(3.5)]);
}

// ── 7 ter. À quoi sert chaque chiffre des bulles (plan du site, idée 8, 13/10/2026) ──
// Demande de Lorenzo : dans le DÉTAIL d'une bulle (2e toucher), chaque nombre dit ce qu'il mesure et
// à quoi il sert (« 264 $ au-dessus : ce qu'il reste avant ce repère »). Une table pure
// (Guide.USAGES_CHIFFRES), lue par les bulles des repères (Lisible et Complet), la phrase,
// « Et ensuite ? » et les figures. Le résumé (4 lignes, 3 nombres) ne change pas.
titre('7 ter. Bulles : chaque chiffre dit ce qu’il mesure et à quoi il sert');
{
  const U = G.USAGES_CHIFFRES, mots = x => x.split(/\s+/).filter(w => /[\p{L}\d]/u.test(w)).length;
  const malU = Object.entries(U).filter(([, u]) => !u.debutant || !u.expert || G.motsBannis(u.debutant).length || /[%\d]/.test(u.debutant + u.expert) || CONSEIL.test(u.debutant + ' ' + u.expert) || mots(u.debutant) > 12);
  check(`la table des usages (${Object.keys(U).length} chiffres) : un mot pour le Lisible et un pour le Complet ; en Lisible aucun mot banni ; nulle part un %, un chiffre ni un conseil`,
    Object.keys(U).length >= 10 && !malU.length && ['distance', 'auDela', 'releve', 'bande', 'demiTours', 'quantite', 'cas', 'objectif'].every(k => k in U), malU);
  check('avecUsage : « 264 $ au-dessus : ce qu’il reste avant ce repère » (Lisible), « 0,31 % live (reste avant le niveau) » (Complet) ; une clé inconnue laisse le chiffre seul',
    G.avecUsage('264 $ au-dessus', 'distance', 'debutant') === '264 $ au-dessus : ce qu’il reste avant ce repère' && G.avecUsage('0,31 % live', 'distance', 'expert') === '0,31 % live (reste avant le niveau)'
    && G.avecUsage('12', 'inconnu', 'debutant') === '12' && G.usageChiffre('bande', 'debutant') === 'la marge où l’on dit que le prix touche le repère');
  // L'origine d'un repère (bulle du Lisible) : chaque nombre dans une phrase à lui, avec son usage.
  const T0 = Date.parse('2026-10-08T22:51:00Z'), apres3 = T0 + 3 * 60000;
  const Rd = (cle, p, extra) => Object.assign({ cle, p, nom: cle, court: cle, art: 'le ' + cle, origine: '', nature: 'mesuré', detail: '', detailCourt: '' }, extra || {});
  const mur = t(G.origineDebutant(Rd('mur_vente', 86700, { btc: 44, lu: T0 }), '$', apres3, 900));
  const zone = t(G.origineDebutant(Rd('sr', 85600, { touches: 4, bougies: 96 }), '$', apres3, 900));
  const opt = t(G.origineDebutant(Rd('put_wall', 85600, { strike: 85600, lu: T0, nature: 'modèle' }), '$', apres3, 900, true));
  check('mur : « 44 BTC : ce qui attend à ce prix. Relevé il y a 3 min (…) : l’âge de ce chiffre ; les ordres ont pu bouger. »',
    /^Mur de vente \(86 700 \$\) : le plus d’ordres de vente en attente chez Binance\. 44 BTC : ce qui attend à ce prix\. Relevé il y a 3 min.* : l’âge de ce chiffre ; les ordres ont pu bouger\.$/.test(mur), mur);
  check('zone de retour : « 4 demi-tours : ce qui en fait un repère. »', /^Zone de retour \(85 600 \$\) : le prix a fait demi-tour ici ces .+\. 4 demi-tours : ce qui en fait un repère\.$/.test(zone), zone);
  check('options : « Relevée il y a 3 min (…) : l’âge de ce chiffre. Un calcul, pas une mesure. »', /\. Relevée il y a 3 min.* : l’âge de ce chiffre\. Un calcul, pas une mesure\.$/.test(opt), opt);
  const usagesL = [mur, zone, opt].concat(etatsUsage()).join(' ').split(/(?<=[.;])\s+/).filter(x => / : (ce qu|l’|la marge|ce qui)/.test(x));
  check('ces phrases d’usage (Lisible) : 15 mots au plus, aucun mot banni, aucun %, aucun conseil', usagesL.length >= 5 && usagesL.every(x => mots(x) <= 15 && !G.motsBannis(x).length && !/%/.test(x) && !CONSEIL.test(x)),
    usagesL.map(x => [mots(x), x]));
  function etatsUsage() {
    const n = { p: 85640, demi: 40, dessus: true, pMin: 85600, pMax: 85680, raisons: [Rd('hier_haut', 85640)] };
    return [85300, 88000].map(live => G.texteEtatDebutant(G.etatLive(n, live, null, P), n, live, '$', '1h').replace(/^Maintenant : [^.]+\. /, ''));
  }
  // Complet : le chiffre technique reste, avec son mot d'usage (bulle d'un niveau, « Et ensuite ? »).
  const pubU = G.niveauxPublies({ updated: '2026-10-08T22:51:00Z', liquidity: { snapshot_at: '2026-10-08T22:51:00Z', wall_bin_usd: 20, ask_walls: [[86690, 44]] }, micro: {} });
  const srU = G.niveauxSR([{ price: 85600, touches: 4, tf: '1h' }], P, { bougies: 500 });
  vm.runInContext('__usage = ' + JSON.stringify(pubU.concat(srU)), page.sandbox);
  const nivC = dansPage('guideTexteNiveau({ niv: { raisons: __usage, demi: 120 } }, true)');
  nivC.forEach(t);
  check(`Complet, bulle d’un niveau : « ${nivC[0]} » ; « ${nivC[1]} » ; la bande dit sa marge`,
    /^Mur ask 86 700 \$ — mesuré · 44 BTC \(quantité posée au relevé\) · lu à .+ \(âge du chiffre\)$/.test(nivC[0]) && /^S\/R 1 h 85 600 \$ — mesuré · 4 demi-tours \(ce qui en fait un niveau\)$/.test(nivC[1])
    && /^Bande ± 120 \$ \(marge où le niveau compte comme touché\) = .+ × ATR \d+\. Cassure : /.test(nivC[2]), nivC);
  check('Complet, l’heure de lecture dans « Et ensuite ? » : « (lu à hh:mm, âge du chiffre) »', /^ \(lu à \d\d:\d\d, âge du chiffre\)$/.test(G.tagLu(pubU[0], 'usage')), G.tagLu(pubU[0], 'usage'));
  // Figures : l'objectif dit sur quoi il se calcule ; le nombre de cas, où il est compté.
  check('figure (Lisible) : « (8 cas sur ce graphique) » ; Complet : « obj. 3/8 (atteint / issues connues) »',
    /\(8 cas sur ce graphique\)\.$/.test(G.texteEcart({ atteints: 3, invalides: 3, expires: 2, ecart: 'pareil' }))
    && /obj\. 3\/8 \(atteint \/ issues connues\)/.test(G.texteBilan({ type: 'double_sommet', formes: 9, confirmes: 8, atteints: 3, invalides: 3, expires: 2, haut: 1, bas: 2 }, { n: 1000, intervalle: '15m', duree: 5 * 86400 }, P, 'expertCompact')));
}

// ── 7 bis. En résumé ──
titre('7 bis. En résumé : la lecture recoupée, honnête, courte, sans chiffre de trop');
{
  const Rd = (cle, p, extra) => Object.assign({ cle, p, nom: cle, court: cle, art: 'le ' + cle, origine: '', nature: 'mesuré', detail: '', detailCourt: '' }, extra || {});
  const N = (...rs) => ({ p: rs[0].p, pMin: Math.min(...rs.map(r => r.p)), pMax: Math.max(...rs.map(r => r.p)), raisons: rs, demi: 40 });
  const haut = N(Rd('sr', 86398.2), Rd('hier_haut', 86398)), loin = N(Rd('mur_vente', 86700)), bas = N(Rd('sr', 85600)), bas2 = N(Rd('h24_bas', 85300));
  const choix = { dessus: [haut, loin], dessous: [bas, bas2] }, suite = G.suite(choix, 86000);
  const base = { prix: 86000, unite: '$', itv: '1h', choix, suite, figures: [], scenario: null };
  const syn = x => { const r = G.synthese(Object.assign({}, base, x)); [r.titre, r.regle].concat(r.pourquoi.map(p => p.texte), r.surveiller).forEach(t); return r; };
  const figure = (sens, extra) => Object.assign({ type: 'double_creux', famille: 'extremes', sens, phase: 'confirme', fin: null }, extra || {});
  // 1. Le sens n'est dit qu'avec au moins deux signaux d'accord et aucun en face. Revue du 14/10/2026
  // (C2) : le 2e signal était une figure validée (« il pointe vers le haut ») ; une figure ne compte
  // plus, c'est le scénario de Claude qui fait le 2e signal (note du contradicteur).
  const h = syn({ regime: { cle: 'hausse' }, scenario: { rang: '1', forme: 'chemin', ouvert: true, sens: 1 } });
  check('deux signaux vers le haut, aucun en face : « penchent plutôt vers la hausse »', h.ton === 'hausse' && /penchent plutôt vers la hausse/.test(h.titre) && h.pourquoi.filter(p => p.sens > 0).length === 2, h);
  // Une figure validée (revue du 14/10/2026, C2) : dite pour son objectif, sans sens ni direction ;
  // seule avec la tendance, elle ne fait jamais pencher le titre (le 08/10 à 15:40, « Double sommet
  // validé : il pointe vers le bas » faisait « penchent plutôt vers la baisse »). Sur BTCUSDT en 1 h
  // (double creux mesuré « moins? », lu comme au hasard, C7), la ligne finit comme la bulle.
  const vH = syn({ regime: { cle: 'hausse' }, figures: [figure(1, { objectif: 87412.6 })], symbole: 'BTCUSDT' });
  const vB = syn({ regime: { cle: 'baisse' }, figures: [figure(-1, { type: 'double_sommet', objectif: 81158.3 })], symbole: 'BTCUSDT', itv: '15m' });
  const vC = syn({ regime: { cle: 'hausse' }, figures: [figure(-1, { type: 'double_sommet', objectif: 81158.3 })] });
  const vS = syn({ regime: { cle: 'faible' }, figures: [figure(1)] });
  const ligneF = r => r.pourquoi.find(p => p.fam === 'figure');
  check('figure validée : sens 0, « Double sommet validé : objectif 81 158 $, comme au hasard. », rien sur la direction',
    [vH, vB, vC, vS].every(r => ligneF(r) && ligneF(r).sens === 0 && !/pointe|vers le (haut|bas)|hausse|baisse/.test(ligneF(r).texte))
    && /^Double sommet validé : objectif 81 158 \$, comme au hasard\.$/.test(ligneF(vB).texte) && /^Double creux validé : objectif 87 413 \$, comme au hasard\.$/.test(ligneF(vH).texte),
    [vH, vB, vC, vS].map(r => ligneF(r)));
  check('une figure validée ne fait jamais pencher le titre : avec la tendance seule, « Pas de sens net pour l’instant »',
    [vH, vB].every(r => r.ton === 'calme' && /^Pas de sens net pour l’instant\.$/.test(r.titre) && /Un seul signal/.test(r.regle)) && vC.ton === 'calme' && vS.ton === 'calme' && /hésite/.test(vS.titre),
    [vH, vB, vC, vS].map(r => [r.ton, r.titre, r.regle]));
  // Revue du 14/10/2026 (C15) : « En résumé » (montré avec « Le détail ») nomme chaque figure comme
  // son étiquette du graphique (libelleFormeCourt), pour les 16 types ; l'ETE inversé s'appelait
  // « Tête-épaules à l'envers » à côté d'une étiquette « Épaule-tête-épaule inversé ».
  const noms2 = G.TYPES.map(type => { const f = { type, sens: 1, phase: 'confirme', fin: null }, l = ligneF(syn({ regime: { cle: 'faible' }, figures: [f] }));
    return [type, l && l.texte, G.libelleFormeCourt(f)]; }).filter(([, l, e]) => !l || l.indexOf(e + ' validé') !== 0);
  const finie = fin => ligneF(syn({ regime: { cle: 'faible' }, figures: [{ type: 'ete_inverse', sens: 1, fin, jFin: 3 }] }));
  check('« En résumé » : la figure porte le nom de son étiquette (« Épaule-tête-épaule inversé validé », 16 types) ; finie : « raté » après sa validation, « annulé » avant',
    !noms2.length && /^Épaule-tête-épaule inversé : raté, plus de signal\.$/.test(finie('invalide').texte) && /^Épaule-tête-épaule inversé : annulé, plus de signal\.$/.test(finie('invalide_avant').texte),
    { noms2, rate: finie('invalide'), annule: finie('invalide_avant') });
  check('sans mesure sur des années (autre paire, ou objectif inconnu) : pas de « comme au hasard », toujours sans sens',
    /^Double sommet validé : objectif 81 158 \$\.$/.test(ligneF(vC).texte) && /^Double creux validé\.$/.test(ligneF(vS).texte), [ligneF(vC), ligneF(vS)]);
  check('la lecture dit ce qui la ferait tomber (le repère du bas)', h.surveiller.some(x => /tombe si le prix finit une heure sous/.test(x)), h.surveiller);
  const b = syn({ regime: { cle: 'baisse' }, scenario: { rang: '1', forme: 'chemin', ouvert: true, sens: -1 } });
  check('tendance et scénario vers le bas : baisse ; le scénario est dit « de Claude »', b.ton === 'baisse' && b.pourquoi.some(p => /de Claude/.test(p.texte) && p.sens < 0), b);
  const c = syn({ regime: { cle: 'hausse' }, scenario: { rang: '1', forme: 'chemin', ouvert: true, sens: -1 } });
  check('signaux opposés : « se contredisent : pas de sens net »', c.ton === 'partage' && /pas de sens net/.test(c.titre), c);
  const u = syn({ regime: { cle: 'hausse' } });
  check('un seul signal : pas de sens net, et la règle le dit (« trop peu »)', u.ton === 'calme' && /Pas de sens net/.test(u.titre) && /trop peu/.test(u.regle), u);
  const z = syn({ regime: { cle: 'faible' }, scenario: { rang: '1', forme: 'range', ouvert: true, sens: 0 } });
  // « fourchette » est réservé à celle de 7 jours (revue du 14/10/2026, M3) : le range du scénario se dit « entre deux bornes ».
  check('tendance faible, scénario en range : le prix hésite, aucun signal ne penche ; « entre deux bornes », pas « fourchette »', z.ton === 'calme' && /hésite/.test(z.titre) && z.pourquoi.every(p => p.sens === 0) && /Aucun signal/.test(z.regle)
    && z.pourquoi.some(p => /^Scénario n° 1 de Claude, ce matin : le prix reste entre deux bornes\.$/.test(p.texte)) && !z.pourquoi.some(p => /fourchette/.test(p.texte)), z);
  check('à surveiller : un repère de chaque côté, le plus parlant à prix égal (« le plus haut d’hier »)', /^Au-dessus : 86 398 \$, le plus haut d’hier\.$/.test(z.surveiller[0]) && /^En dessous : 85 600 \$, une zone de retour\.$/.test(z.surveiller[1]), z.surveiller);
  // 2. Le prix dans une bande : elle est dite, puis le repère suivant de chaque côté.
  const d = G.synthese(Object.assign({}, base, { prix: 86398, suite: G.suite(choix, 86398), regime: { cle: 'faible' } }));
  check('prix sur un repère : « Le prix est sur … », puis les repères suivants', /^Le prix est sur 86 398 \$, le plus haut d’hier\.$/.test(d.surveiller[0]) && /prochain repère : 86 700 \$/.test(d.surveiller[1]) && /prochain repère : 85 600 \$/.test(d.surveiller[2]), d.surveiller);
  // 3. Figures : une sortie à valider ne compte pas ; une figure finie est dite sans effet.
  const dm = syn({ regime: { cle: 'hausse' }, figures: [figure(1, { phase: null, demi: true })] });
  check('figure sortie mais pas validée : dite, sans compter', dm.ton === 'calme' && dm.pourquoi.some(p => /pas encore validé/.test(p.texte) && p.sens === 0), dm);
  const fa = syn({ regime: { cle: 'faible' }, figures: [figure(1, { fin: 'atteint', jFin: 10 })] });
  check('figure finie (objectif atteint) : « plus de signal »', fa.pourquoi.some(p => /objectif déjà atteint, plus de signal/.test(p.texte) && p.sens === 0), fa.pourquoi);
  const st = syn({ regime: { cle: 'faible', compression: true }, scenario: { rang: '1', forme: 'chemin', ouvert: false, tombe: true, sens: 0 } });
  check('scénario tombé et calme du prix : dits, sans sens', st.pourquoi.some(p => /ne tient plus/.test(p.texte)) && st.pourquoi.some(p => /bouge peu/.test(p.texte)) && st.ton === 'calme', st.pourquoi);
  // 4. Charte : une idée par phrase, 15 mots au plus ; aucun %, aucun mot technique ; l'avertissement une fois.
  const tous = [h, b, c, u, z, d, dm, fa, st, vH, vB, vC, vS];
  const phrases = [].concat(...tous.map(r => [r.titre, r.regle].concat(r.pourquoi.map(p => p.texte), r.surveiller)));
  const longues = phrases.filter(x => x.split(/\s+/).filter(w => /[\p{L}\d]/u.test(w)).length > 15);
  check('chaque phrase : 15 mots au plus (charte)', !longues.length, longues);
  check('aucun pourcentage, aucun mot technique (liste du Débutant), aucun conseil', !phrases.some(x => /%/.test(x) || G.motsBannis(x).length || CONSEIL.test(x)), phrases.filter(x => /%/.test(x) || G.motsBannis(x).length || CONSEIL.test(x)));
  check('l’avertissement unique de la page', tous.every(r => r.avertissement === G.AVERTISSEMENT));
  // Chaque signal porte sa famille (son icône, js/icones.js) ; « À surveiller » a la sienne, ligne pour ligne.
  const I = require(path.join(REPO, 'js/icones.js'));
  check('chaque signal du pourquoi a une famille connue (icône), la ligne de chaque repère à surveiller aussi',
    tous.every(r => r.pourquoi.every(p => I.connue(p.fam === 'tendance' ? I.tendance(p.sens) : p.fam)) && r.surveillerFam.length === r.surveiller.length
      && r.surveiller.every((t, k) => (r.surveillerFam[k] === 'niveau') === /^(Au-dessus|En dessous|Le prix est)/.test(t))), tous.map(r => [r.pourquoi, r.surveillerFam]));
  check('les icônes : une par famille de la légende, un nom chacune', I.LEGENDE.every(f => I.connue(f) && I.NOMS[f]) && /<svg[^>]*viewBox="0 0 10 10"/.test(I.svg('figure')) && I.svg('inconnue') === '');
  const sans = G.synthese(Object.assign({}, base, { prix: NaN }));
  check('prix absent : dit, rien d’inventé', /indisponible/.test(sans.titre) && !sans.pourquoi.length && !sans.surveiller.length, sans);
  // 4 bis. L'agitation attendue du point du matin (revue du 14/10/2026, N4 ; Q3 de Lorenzo : « Les
  // deux ») : une ligne de plus, sans sens, qui ne compte pas dans la lecture ; le seul % permis ici.
  const AG = ['Écart attendu entre plus bas et plus haut d’ici demain 06:00 : en général 4,2 %.', 'Une fois sur dix, plus de 6,1 % (calcul de 06:31).'];
  const ag = syn({ regime: { cle: 'baisse' }, scenario: { rang: '1', forme: 'chemin', ouvert: true, sens: -1 }, agitation: AG });
  const lAg = ag.pourquoi.filter(p => p.agitation);
  check('agitation : une ligne du pourquoi, la dernière, sans sens (famille tendance)', lAg.length === 1 && ag.pourquoi[ag.pourquoi.length - 1] === lAg[0]
    && lAg[0].sens === 0 && lAg[0].fam === 'tendance' && lAg[0].texte === AG.join(' '), ag.pourquoi);
  check('agitation : la lecture ne change pas (titre, ton, règle, à surveiller ceux du cas sans elle)', ag.titre === b.titre && ag.ton === b.ton && ag.regle === b.regle
    && JSON.stringify(ag.surveiller) === JSON.stringify(b.surveiller) && JSON.stringify(ag.pourquoi.filter(p => !p.agitation)) === JSON.stringify(b.pourquoi), [ag, b]);
  const phrasesAg = lAg.length ? lAg[0].texte.split(/(?<=\.)\s+/) : [];
  check('agitation : 15 mots au plus par phrase, aucun mot banni, aucun conseil, aucun sens dit', phrasesAg.length === 2
    && phrasesAg.every(x => x.split(/\s+/).filter(w => /[\p{L}\d]/u.test(w)).length <= 15 && !G.motsBannis(x).length && !CONSEIL.test(x) && !/hausse|baisse|monte|descend|grimpe|chute/i.test(x)), phrasesAg);
  check('le % : seulement dans la ligne d’agitation', [ag.titre, ag.regle].concat(ag.pourquoi.filter(p => !p.agitation).map(p => p.texte), ag.surveiller).every(x => !/%/.test(x)));
  check('agitation absente (undefined, null, []) : aucune ligne ajoutée', [undefined, null, []].every(a => !syn({ regime: { cle: 'baisse' }, agitation: a }).pourquoi.some(p => p.agitation)));

  // 5. La fourchette de 7 jours (plan du 13/10/2026, idée 5 ; mesure marche/range-cassure) : le haut
  // et le bas des 42 périodes de 4 h closes (heure UTC) avant celle en cours, refaites avec les bougies
  // chargées ; sa cassure (une période close finit hors de la fourchette des 42 d'avant elle, la
  // précédente ayant fini dans la sienne), dite dans « En résumé » pendant 6 périodes, sans sens.
  const PF = P, F4 = PF.fourchette, per = F4.heures * 3600;
  check('PARAM.guide.fourchette : 42 périodes de 4 h (7 jours), la phrase pendant 6 périodes', F4.periodes === 42 && F4.heures === 4 && F4.phrasePeriodes === 6, F4);
  // Une série de `pas` s, commencée à mi-période, prix en vagues de ± 2 autour de 100, la dernière bougie en cours.
  const serie = (pas, n, modif) => {
    const T = [], H = [], L = [], C = [], t0 = Math.floor(Date.UTC(2026, 9, 1) / 1000 / per) * per + 3 * pas;
    for (let i = 0; i < n; i++) { const c = 100 + Math.sin(i * pas / 36000) * 2; T.push(t0 + i * pas); H.push(c + 0.5); L.push(c - 0.5); C.push(c); }
    const pc = Math.floor(T[n - 1] / per);
    if (modif) modif({ T, H, L, C, n, pc, dans: (i, k) => Math.floor(T[i] / per) === pc - k });
    return { T, H, L, C, n };
  };
  const fo = (x, pas) => G.fourchette(x.T, x.H, x.L, x.C, x.n, pas, PF);
  const s15 = serie(900, 1000), f15 = fo(s15, 900);
  const pcs = Math.floor(s15.T[s15.n - 1] / per), dansF = i => { const k = Math.floor(s15.T[i] / per); return k >= pcs - 42 && k < pcs; };
  const hautAttendu = Math.max(...s15.H.filter((_, i) => dansF(i))), basAttendu = Math.min(...s15.L.filter((_, i) => dansF(i)));
  check('fourchette en 15 min : le plus haut et le plus bas des 42 périodes de 4 h closes (bougie en cours exclue), fenêtre alignée sur 4 h UTC, 7 jours',
    f15 && f15.haut === hautAttendu && f15.bas === basAttendu && f15.jours === 7 && f15.debut === (pcs - 42) * per && f15.fin === pcs * per && f15.debut % per === 0 && f15.cassure === null, f15);
  // Les mêmes périodes refaites en 1 h et en 4 h : la même fourchette (au même instant).
  const s1h = serie(3600, 300), s4h = serie(per, 80);
  check('fourchette en 1 h et en 4 h : calculée (l’intervalle divise la période)', !!fo(s1h, 3600) && !!fo(s4h, per) && fo(s4h, per).jours === 7);
  check('pas de fourchette : en 1 jour, avec un historique de moins de 7 jours (1 min : 3000 bougies), ou un intervalle qui ne divise pas 4 h',
    fo(serie(86400, 60), 86400) === null && fo(serie(60, 3000), 60) === null && fo(serie(900, 600), 900) === null && fo(serie(3 * 3600, 100), 3 * 3600) === null && G.fourchette([], [], [], [], 0, 900, PF) === null);
  // Cassure par le bas sur la dernière période close : dite ; par le haut, de même.
  const casse = (sens, k, apres) => serie(900, 1000, x => { for (let i = 0; i < x.n - 1; i++) {
    if (x.dans(i, k)) { const c = sens < 0 ? 90 : 110; x.C[i] = c; x.H[i] = c + 0.5; x.L[i] = c - 0.5; }
    if (apres && Math.floor(x.T[i] / per) > x.pc - k && Math.floor(x.T[i] / per) < x.pc) { x.C[i] = 100; x.H[i] = 100.5; x.L[i] = 99.5; }
  } });
  const cb = fo(casse(-1, 1), 900), ch = fo(casse(1, 1), 900);
  check('cassure du bas : la dernière période close finit sous le bas des 42 d’avant elle ; du haut, au-dessus', cb && cb.cassure && cb.cassure.sens === -1 && cb.cassure.depuis === 0 && !cb.cassure.revenu
    && ch && ch.cassure && ch.cassure.sens === 1 && !ch.cassure.revenu, { cb: cb && cb.cassure, ch: ch && ch.cassure });
  // Revue du 14/10/2026 (C1, C4) : l'heure dite est la FIN de la période qui a cassé (pas son début) ;
  // la fenêtre de la fourchette cassée est gardée pour la couche du graphique.
  check('cassure : tFin = fin de la période qui a cassé (t + 4 h), debut = début de la fenêtre cassée (t − 42 × 4 h)',
    cb.cassure.tFin === cb.cassure.t + per && cb.cassure.debut === cb.cassure.t - 42 * per && cb.cassure.tFin === cb.fin, cb.cassure);
  const c6 = fo(casse(-1, 6), 900), c7 = fo(casse(-1, 7), 900), cr = fo(casse(-1, 3, true), 900);
  check('cassure il y a 6 périodes : encore dite ; il y a 7 : plus dite ; revenue dedans depuis : « revenu »', c6 && c6.cassure && c6.cassure.depuis === 5 && c7 && c7.cassure === null && cr && cr.cassure && cr.cassure.revenu, { c6: c6 && c6.cassure, c7: c7 && c7.cassure, cr: cr && cr.cassure });
  // Deux périodes de suite sous le bas : seule la première est une cassure (la précédente avait fini dans SA fourchette).
  const deux = fo(serie(900, 1000, x => { for (let i = 0; i < x.n - 1; i++) if (x.dans(i, 1) || x.dans(i, 2)) { x.C[i] = 90; x.H[i] = 90.5; x.L[i] = 89.5; } }), 900);
  check('deux périodes de suite sous le bas : la cassure est la première (depuis 1), pas la seconde', deux && deux.cassure && deux.cassure.depuis === 1 && deux.cassure.sens === -1, deux && deux.cassure);
  check('cassureDite : la cassure tant que le prix n’est pas revenu dedans, sinon null (la même règle pour « En résumé », la barre et la couche)',
    G.cassureDite(cb) === cb.cassure && G.cassureDite(deux) === deux.cassure && G.cassureDite(cr) === null && G.cassureDite(c7) === null && G.cassureDite(f15) === null && G.cassureDite(null) === null);
  // En résumé : la phrase, sans sens (la règle du titre n'en tient pas compte), famille « niveau ».
  // Revue du 14/10/2026 (C4) : avec l'heure de la cassure (fin de la période, heure de l'appareil) ;
  // « juste après » pendant la 1re période seulement, puis « pas revenu dedans depuis ».
  const hc = G.heureVueSi(cb.cassure.tFin * 1000), hh = G.heureVueSi(ch.cassure.tFin * 1000);
  const ra = syn({ regime: { cle: 'faible' }, fourchette: cb, symbole: 'BTCUSDT', maintenant: cb.cassure.tFin * 1000 + 60000 }), rh = syn({ regime: { cle: 'faible' }, fourchette: ch, symbole: 'SOLUSDT' });
  const lf = r => r.pourquoi.find(p => /fourchette de 7 jours/.test(p.texte));
  check('En résumé, cassure du bas sur BTC/USDT : « Le prix a cassé le bas de sa fourchette de 7 jours à ' + hc + '. Attention : ça bouge souvent fort juste après, dans les deux sens. Une fois sur deux, il est revenu dedans dans la journée. »',
    lf(ra) && lf(ra).texte === 'Le prix a cassé le bas de sa fourchette de 7 jours à ' + hc + '. Attention : ça bouge souvent fort juste après, dans les deux sens. Une fois sur deux, il est revenu dedans dans la journée.'
    && lf(ra).sens === 0 && lf(ra).fam === 'niveau', lf(ra));
  check('par le haut, sur une autre paire (non mesurée) : « … le haut … à ' + hh + '. … Il revient souvent dedans dans la journée. »',
    lf(rh) && lf(rh).texte === 'Le prix a cassé le haut de sa fourchette de 7 jours à ' + hh + '. Attention : ça bouge souvent fort juste après, dans les deux sens. Il revient souvent dedans dans la journée.' && lf(rh).sens === 0, lf(rh));
  // Le lendemain (la phrase reste jusqu'à 24 h) : « hier à … » ; après la 1re période, plus de « juste après ».
  const dT = new Date(deux.cassure.tFin * 1000), lendemain = new Date(dT.getFullYear(), dT.getMonth(), dT.getDate() + 1, 1, 0).getTime();
  const r6 = syn({ regime: { cle: 'faible' }, fourchette: deux, symbole: 'BTCUSDT', maintenant: lendemain }), h6 = G.heureVueSi(deux.cassure.tFin * 1000);
  check('cassure dite le lendemain, une période plus tard (pas revenu dedans) : « … de 7 jours hier à ' + h6 + '. Il n’est pas revenu dedans depuis. … » (plus de « juste après »)',
    lf(r6) && lf(r6).texte === 'Le prix a cassé le bas de sa fourchette de 7 jours hier à ' + h6 + '. Il n’est pas revenu dedans depuis. Une fois sur deux, il est revenu dedans dans la journée.', lf(r6));
  // La barre du téléphone (revue du 14/10/2026, C1) : la 1re phrase de la cassure à la place du titre ; sinon le titre.
  check('barre du téléphone : la cassure dite (« Le prix a cassé le bas … à ' + hc + '. »), sinon le titre',
    ra.barre === 'Le prix a cassé le bas de sa fourchette de 7 jours à ' + hc + '.' && r6.barre === 'Le prix a cassé le bas de sa fourchette de 7 jours hier à ' + h6 + '.'
    && syn({ regime: { cle: 'faible' } }).barre === syn({ regime: { cle: 'faible' } }).titre && syn({ fourchette: cr, symbole: 'BTCUSDT' }).barre === syn({ fourchette: cr, symbole: 'BTCUSDT' }).titre,
    [ra.barre, r6.barre]);
  const sansF = syn({ regime: { cle: 'faible' } }), avecF = syn({ regime: { cle: 'faible' }, fourchette: cb, symbole: 'BTCUSDT' });
  const h1 = syn({ regime: { cle: 'hausse' }, fourchette: ch, symbole: 'BTCUSDT' });
  check('la cassure ne change jamais la règle du sens : même titre et même ton avec ou sans elle ; un seul signal vers le haut reste « trop peu »',
    sansF.ton === avecF.ton && sansF.titre === avecF.titre && h1.ton === 'calme' && /trop peu/.test(h1.regle), { sansF: sansF.titre, avecF: avecF.titre, h1: h1.regle });
  check('rien de dit : sans fourchette, sans cassure, cassure revenue dedans, cassure trop ancienne',
    ![syn({ fourchette: null }), syn({ fourchette: f15 }), syn({ fourchette: cr, symbole: 'BTCUSDT' }), syn({ fourchette: c7, symbole: 'BTCUSDT' })].some(lf));
  // Charte : une idée par phrase, 15 mots au plus ; ni « range », ni « va baisser », ni volume, ni conseil.
  const phrF = [lf(ra).texte, lf(rh).texte, lf(r6).texte].flatMap(t => t.split(/(?<=\.)\s+/));
  const nM = x => x.split(/\s+/).filter(w => /[\p{L}\d]/u.test(w)).length;
  check('la phrase de la fourchette : chaque phrase 15 mots au plus ; aucun mot banni (« range »…), aucun %, ni « va baisser / monter », ni volume, ni conseil',
    phrF.every(x => nM(x) <= 15) && !phrF.some(x => G.motsBannis(x).length || /%|va (baisser|monter)|volume/i.test(x) || CONSEIL.test(x)), phrF.map(x => [nM(x), x]));
  // La phrase du haut du graphique (Lisible) dit la cassure pendant ses 24 h (revue du 14/10/2026,
  // N1 ; oui de Lorenzo à Q2), à la place de la lecture du moment ; rien n'est ajouté le reste du
  // temps. Sa bulle reprend la phrase mesurée de « En résumé ». Avant : la phrase ne la disait jamais.
  {
    const DEB = dansPage('PARAM.guide.debutant');
    const oP = x => Object.assign({ prix: 86012.5, unite: '$', choix: { dessus: [haut], dessous: [bas] }, enTest: null, regime: { cle: 'faible' }, itv: '15m' }, x);
    const hm = cb.cassure.tFin * 1000 + 60000, V = G.phrasesDebutant(oP({ fourchette: cb, horloge: hm })), sansF = G.phrasesDebutant(oP({}));
    check('phrase du haut, fourchette cassée par le bas : « Fourchette de 7 jours cassée par le bas à ' + hc + '. », puis sans « de », sans l’heure, sans « 7 jours » ; la compacte tient en ' + DEB.phraseEtroit,
      V[0] === 'Fourchette de 7 jours cassée par le bas à ' + hc + '.' && V[1] === 'Fourchette 7 jours cassée par le bas à ' + hc + '.' && V.includes('Fourchette de 7 jours cassée par le bas.')
      && V[V.length - 1] === 'Fourchette cassée par le bas.' && V.every(v => /^Fourchette .*cassée par le bas/.test(v)) && G.phraseDebutant(oP({ fourchette: cb, horloge: hm }), DEB.phraseEtroit).length <= DEB.phraseEtroit, V);
    check('… par le haut : « … cassée par le haut … » ; vue dans le passé : jamais « Maintenant, » (elle porte son heure)',
      G.phrasesDebutant(oP({ fourchette: ch, horloge: ch.cassure.tFin * 1000 + 60000 }))[0] === 'Fourchette de 7 jours cassée par le haut à ' + hh + '.'
      && G.phrasesDebutant(oP({ fourchette: cb, horloge: hm, maintenant: true }))[0] === V[0]);
    const Vh = G.phrasesDebutant(oP({ fourchette: deux, horloge: lendemain }));
    check('… le lendemain : « … hier à ' + h6 + '. », jamais l’heure seule (elle se lirait comme celle d’aujourd’hui)',
      Vh[0] === 'Fourchette de 7 jours cassée par le bas hier à ' + h6 + '.' && Vh.filter(v => v.includes(h6)).every(v => v.includes('hier à ' + h6)), Vh);
    check('rien d’ajouté le reste du temps : sans fourchette, sans cassure, revenue dedans, trop ancienne (au-delà de 24 h), prix absent : la phrase de toujours',
      [null, f15, cr, c7].every(f => JSON.stringify(G.phrasesDebutant(oP({ fourchette: f, horloge: hm }))) === JSON.stringify(sansF))
      && /indisponible/.test(G.phrasesDebutant(oP({ prix: null, fourchette: cb, horloge: hm }))[0]), sansF);
    const VV = V.concat(Vh);
    check('… chaque variante : 15 mots au plus, aucun mot banni, ni %, ni conseil', VV.every(v => nM(v) <= 15 && !G.motsBannis(v).length && !/%/.test(v) && !CONSEIL.test(v)), VV);
    // Sa bulle : la phrase mesurée de « En résumé » ; la 1re phrase (avec l'heure) seulement quand le
    // titre n'a pas gardé l'heure et « 7 jours » ; les bords de la fourchette cassée ; l'avertissement.
    const L = G.phrasesCassureFourchette(cb, 'BTCUSDT', hm), b1 = G.bulleCassureDebutant(cb, 'BTCUSDT', hm, V[0], '$'), b2 = G.bulleCassureDebutant(cb, 'BTCUSDT', hm, 'Fourchette cassée par le bas.', '$');
    const prixB = G.prix(cb.cassure.bas, '$'), prixH = G.prix(cb.cassure.haut, '$');
    check('bulle de la phrase : « Bas …, haut …. », puis la phrase mesurée (« Attention : ça bouge souvent fort juste après, dans les deux sens. ») et les retours ; le résumé du 1er toucher, la phrase mesurée',
      !!b1 && JSON.stringify(b1.texte) === JSON.stringify(['Bas ' + prixB + ', haut ' + prixH + '.', L[1], L[2], G.AVERTISSEMENT]) && JSON.stringify(b1.resume) === JSON.stringify([L[1], L[2]])
      && L[1] === 'Attention : ça bouge souvent fort juste après, dans les deux sens.', b1);
    check('… titre sans l’heure : la bulle commence par « Le prix a cassé le bas de sa fourchette de 7 jours à ' + hc + '. » ; le lendemain, « Il n’est pas revenu dedans depuis. » ; rien pour une cassure revenue',
      !!b2 && b2.texte[0] === L[0] && b2.texte.length === 5 && G.bulleCassureDebutant(deux, 'BTCUSDT', lendemain, Vh[0], '$').resume[0] === 'Il n’est pas revenu dedans depuis.'
      && G.bulleCassureDebutant(cr, 'BTCUSDT', hm, '', '$') === null, { b2, lend: G.bulleCassureDebutant(deux, 'BTCUSDT', lendemain, Vh[0], '$') });
  }

  // 6. Un rejet sur un repère, dit en mots (plan du 13/10/2026, idée 6) : etatFerme a vu, sur les
  // P.mecheBougies dernières périodes closes, le prix dépasser le repère puis finir de nouveau de
  // son côté (une mèche, sans cassure). « En résumé » le dit tant que c'est récent, sans sens.
  const M = (n, k, haut) => { const C = Array(n).fill(100), H = Array(n).fill(100.5), L = Array(n).fill(99.5);
    if (haut) H[n - 1 - k] = 102.5; else L[n - 1 - k] = 97.5; return [C, H, L]; };
  const fH = (k) => G.etatFerme(...M(30, k, true), 30, 101, 102, P), fB = (k) => G.etatFerme(...M(30, k, false), 30, 98, 99, P);
  check('etatFerme : dépassé puis repoussé sur l’une des ' + P.mecheBougies + ' dernières périodes closes → mèche (vers le haut : +1, vers le bas : −1) ; plus ancien → rien',
    fH(0).meche && fH(0).mecheSens === 1 && fH(P.mecheBougies - 1).meche && !fH(P.mecheBougies).meche && fB(1).meche && fB(1).mecheSens === -1 && !fB(P.mecheBougies + 2).meche && !fH(0).cassure,
    [fH(0), fH(P.mecheBougies), fB(1)]);
  check('etatFerme : l’indice de la bougie de la mèche (mecheI), pour en dire l’heure (revue du 14/10/2026, C4)', fH(0).mecheI === 29 && fB(1).mecheI === 28 && fH(P.mecheBougies - 1).mecheI === 30 - P.mecheBougies, [fH(0).mecheI, fB(1).mecheI]);
  const choixF = (dessus, dessous) => ({ dessus: [Object.assign({}, haut, { ferme: dessus }), loin], dessous: [Object.assign({}, bas, { ferme: dessous }), bas2] });
  const rejH = syn({ regime: { cle: 'faible' }, choix: choixF(fH(0), null) }), rejB = syn({ regime: { cle: 'faible' }, choix: choixF(null, fB(1)) });
  const lr = r => r.pourquoi.find(p => /repoussé/.test(p.texte));
  // Revue du 14/10/2026 (C4) : « il a été » tombe, pour garder 15 mots avec l'heure (ci-dessous).
  check('repère du haut dépassé puis repoussé : « Le prix est monté au-dessus de 86 398 $, puis repoussé dessous. » (sans sens, famille repère)',
    lr(rejH) && lr(rejH).texte === 'Le prix est monté au-dessus de 86 398 $, puis repoussé dessous.' && lr(rejH).sens === 0 && lr(rejH).fam === 'niveau', rejH.pourquoi);
  check('repère du bas : « Le prix est descendu sous 85 600 $, puis repoussé au-dessus. »',
    lr(rejB) && lr(rejB).texte === 'Le prix est descendu sous 85 600 $, puis repoussé au-dessus.' && lr(rejB).sens === 0 && lr(rejB).fam === 'niveau', rejB.pourquoi);
  // Son heure (ferme.mecheT, ms : la fin de la période de la mèche, posée par la page) : « à 10:15 »
  // le jour même, « hier à … » le lendemain, « le 12 à … » au-delà (en 1 jour, 3 bougies).
  const tM = Date.UTC(2026, 9, 8, 10, 15), hM = G.heureVueSi(tM), dM = new Date(tM);
  const avecT = f => Object.assign({}, f, { mecheT: tM });
  const rejHt = syn({ regime: { cle: 'faible' }, choix: choixF(avecT(fH(0)), null), maintenant: tM + 60000 });
  const rejBt = syn({ regime: { cle: 'faible' }, choix: choixF(null, avecT(fB(1))), maintenant: new Date(dM.getFullYear(), dM.getMonth(), dM.getDate() + 1, 12, 0).getTime() });
  const rejB3 = syn({ regime: { cle: 'faible' }, choix: choixF(null, avecT(fB(1))), maintenant: new Date(dM.getFullYear(), dM.getMonth(), dM.getDate() + 2, 12, 0).getTime() });
  check('le rejet dit son heure : « … puis repoussé dessous à ' + hM + '. », « … repoussé au-dessus hier à ' + hM + '. », « … au-dessus le ' + dM.getDate() + ' à ' + hM + '. »',
    lr(rejHt) && lr(rejHt).texte === 'Le prix est monté au-dessus de 86 398 $, puis repoussé dessous à ' + hM + '.'
    && lr(rejBt) && lr(rejBt).texte === 'Le prix est descendu sous 85 600 $, puis repoussé au-dessus hier à ' + hM + '.'
    && lr(rejB3) && lr(rejB3).texte === 'Le prix est descendu sous 85 600 $, puis repoussé au-dessus le ' + dM.getDate() + ' à ' + hM + '.', [rejHt, rejBt, rejB3].map(r => lr(r) && lr(r).texte));
  const rejT = syn({ regime: { cle: 'hausse' }, choix: choixF(fH(0), null) });
  check('le rejet ne change pas la règle du sens (même titre qu’avant, un seul signal vers le haut : « trop peu »)', rejH.titre === sansF.titre && rejH.ton === sansF.ton && rejT.ton === 'calme' && /trop peu/.test(rejT.regle), [rejH.titre, rejT.regle]);
  check('rien de dit : mèche trop ancienne, mèche du mauvais côté (repère du haut percé par le bas), pas de mèche',
    ![syn({ choix: choixF(fH(P.mecheBougies), fB(P.mecheBougies + 2)) }), syn({ choix: choixF(fB(1), fH(0)) }), syn({ choix: choixF({ cassure: null, meche: false, mecheSens: 0 }, null) })].some(lr));
  const phrR = [lr(rejH).texte, lr(rejB).texte, lr(rejHt).texte, lr(rejBt).texte, lr(rejB3).texte];
  check('le rejet : 15 mots au plus, aucun mot banni (ni « mèche »), aucun %, aucun conseil, pas de sens annoncé',
    phrR.every(x => nM(x) <= 15) && !phrR.some(x => G.motsBannis(x).length || /%|va (baisser|monter)/.test(x) || CONSEIL.test(x)), phrR.map(x => [nM(x), x]));
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
