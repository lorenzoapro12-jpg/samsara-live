// ═══════════════════════════════════════════════════════════════════════════════
// LÉGENDES — comment chaque indicateur se LIT. Pas quoi en faire.
// ─────────────────────────────────────────────────────────────────────────────
// POURQUOI CE FICHIER EST CONSTRUIT AINSI (06/10/2026)
// Des champs ont déjà menti par leur nom (`range_24h_pct` couvrait 30 bougies, `ema20_4h`
// portait le TF demandé, le menu annonçait un stochastique « 14,3,3 » qui était un 14,3). Une
// légende rédigée à la main à côté du code dérive de la même façon. Donc ici :
//   · la FORMULE, l'unité, la fenêtre et la nature d'un champ du fichier se LISENT dans
//     `meta.champs`, publié par le code serveur qui calcule — jamais écrites ici ; le calcul en
//     mots (CALCUL) en tire ses nombres (fenêtres, tranches, échéances) au moment de l'affichage ;
//   · la formule d'un indicateur de la page est CONSTRUITE avec PARAM (js/app.js), les
//     paramètres mêmes du calcul ; l'usage des traders et le calcul en mots (COURT), « Comment
//     s'en servir » (USAGES) aussi, dès qu'ils citent un de ces paramètres ;
//   · ce fichier n'apporte que la LECTURE : ce que l'usage en fait, marqué « usuel »,
//     « convention » ou « débattu » — et, quand la littérature se contredit (GEX, L/S), il le
//     dit au lieu de choisir un camp.
// tests/test_fiches.js fait tenir ces règles (champ publié, paramètres réels, aucun conseil,
// aucun nombre avec unité écrit en dur dans COURT, CALCUL et USAGES).
//
// UN SEUL ÉCRAN (choix de Lorenzo, 11/10/2026) : plus d'interrupteur Lisible / Complet. Deux calques
// du panneau « Choisir l'affichage » décident de ce qui est MONTRÉ, jamais d'une valeur :
//   - « Le détail » (tous les repères, figures et scénarios) : data-mode="expert" sur <html> quand il
//     est allumé, 'debutant' sinon ; gardé sous samsara-mode, la clé de l'ancien mode Complet — qui
//     y était garde donc tout son détail. Les classes .expert-seul / .debutant-seul le suivent.
//   - « Les chiffres du marché » (chiffres de l'en-tête, En direct, Grid Bot, infos chiffrées) :
//     data-chiffres="1" ; gardé sous samsara-chiffres-v1 ; sans clé, l'état du détail au chargement.
// Le HTML produit est le même dans tous les cas : seul l'affichage des classes change (le harnais le
// vérifie). Les identifiants internes restent 'debutant' (détail éteint) et 'expert' (allumé).
// ═══════════════════════════════════════════════════════════════════════════════

const MODE_CLE = 'samsara-mode', CHIFFRES_CLE = 'samsara-chiffres-v1';
// Le choix quand le stockage ne le garde pas (navigation privée, stockage bloqué) : la page entière
// — classes, panneau ET graphique — lit alors ce choix-ci, jamais un stockage muet ou figé.
let MODE_MEMOIRE = null, CHIFFRES_MEMOIRE = null;
function modeHtml() {
  try { return document.documentElement.getAttribute('data-mode') === 'expert' ? 'expert' : 'debutant'; } catch (e) { return 'debutant'; }
}
/** 'expert' quand « Le détail » est allumé, 'debutant' sinon. */
function modeCourant() {
  if (MODE_MEMOIRE) return MODE_MEMOIRE;
  try { return localStorage.getItem(MODE_CLE) === 'expert' ? 'expert' : 'debutant'; } catch (e) { return modeHtml(); }
}
/** « Le détail » est-il allumé ? */
const detailAllume = () => modeCourant() === 'expert';
// Sans choix gardé, « Les chiffres du marché » prennent, une fois pour toutes, l'état du détail au
// chargement (qui était en Complet les garde) ; ensuite les deux cases sont indépendantes.
const CHIFFRES_DEPART = (() => {
  try { const v = localStorage.getItem(CHIFFRES_CLE); return v === null ? localStorage.getItem(MODE_CLE) === 'expert' : v === '1'; }
  catch (e) { try { return document.documentElement.getAttribute('data-chiffres') === '1'; } catch (e2) { return false; } }
})();
/** « Les chiffres du marché » sont-ils allumés ? */
function chiffresAllumes() {
  if (CHIFFRES_MEMOIRE !== null) return CHIFFRES_MEMOIRE;
  try { const v = localStorage.getItem(CHIFFRES_CLE); return v === null ? CHIFFRES_DEPART : v === '1'; }
  catch (e) { return CHIFFRES_DEPART; }
}
/** Pose « Le détail » (m : 'expert' allumé, 'debutant' éteint) sur toute la page. `ecrire` (par
 *  défaut) le garde aussi dans le stockage ; false : il y est déjà (changé dans un autre onglet). */
function appliquerMode(m, ecrire) {
  document.documentElement.setAttribute('data-mode', m);
  if (ecrire === false) MODE_MEMOIRE = null;   // le stockage dit vrai : l'autre onglet vient de l'écrire
  else {
    let garde = false;
    try { localStorage.setItem(MODE_CLE, m); garde = localStorage.getItem(MODE_CLE) === m; } catch (e) { /* navigation privée */ }
    MODE_MEMOIRE = garde ? null : m;
  }
  document.documentElement.setAttribute('data-chiffres', chiffresAllumes() ? '1' : '0');
  // Le graphique écrit ses mots selon le détail (le canvas n'a pas de classes) : remise en page et
  // dessin à la prochaine image — mêmes valeurs, autres mots.
  try {
    if (typeof apresChangementMode === 'function') apresChangementMode(m);
    else if (typeof scheduleDraw === 'function' && candles.length) scheduleDraw();
  } catch (e) { /* page pas encore chargée */ }
}
/** Pose « Les chiffres du marché » (on : booléen) et le garde. */
function appliquerChiffres(on, ecrire) {
  if (ecrire !== false) {
    let garde = false;
    try { localStorage.setItem(CHIFFRES_CLE, on ? '1' : '0'); garde = localStorage.getItem(CHIFFRES_CLE) === (on ? '1' : '0'); } catch (e) { /* navigation privée */ }
    CHIFFRES_MEMOIRE = garde ? null : !!on;
  } else CHIFFRES_MEMOIRE = null;
  document.documentElement.setAttribute('data-chiffres', chiffresAllumes() ? '1' : '0');
  try { if (typeof apresChangementChiffres === 'function') apresChangementChiffres(); } catch (e) { /* page pas encore chargée */ }
}
function basculerMode() { appliquerMode(modeCourant() === 'expert' ? 'debutant' : 'expert'); }
/** « Le détail » allumé ('expert') ou éteint ('debutant') ; rien si c'est déjà le cas. */
function choisirMode(m) { if (m !== modeCourant()) appliquerMode(m); }
// Le choix changé dans un autre onglet (la carte, ou un autre terminal) : suivi ici sans réécrire le
// stockage, comme la carte (js/bookmap.js). Sans cela, le graphique (qui relit le stockage à chaque
// dessin) suivait l'autre onglet, la page (classes) restait sur le premier choix.
function modeChangeAilleurs(e) {
  if (e && e.key === CHIFFRES_CLE) { appliquerChiffres(null, false); return; }
  if (e && e.key !== MODE_CLE && e.key !== null) return;
  const m = modeCourant();
  if (document.documentElement.getAttribute('data-mode') !== m) appliquerMode(m, false);
}
if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('storage', modeChangeAilleurs);

// ─── Les fiches ───────────────────────────────────────────────────────────────
// s : 'usuel' (lecture courante), 'convention' (dépend d'une hypothèse ou d'un seuil choisi),
//     'débattu' (la littérature se contredit), 'mesuré' (un fait sur la mesure elle-même).
// Textes courts (charte du 12/10/2026) : une idée par phrase ; lectures et limites en une ligne,
// le débat en trois phrases au plus. `simple` (et `simpleDeb`) : la définition en une phrase, lue
// par le menu quand la fiche n'a pas de ligne courte ; la fiche montre la ligne courte (COURT).
// Les règles de calcul et de dessin (seuils, détections) vont dans la formule.
// La fourchette de N jours (plan du 13/10/2026, idée 5) : N tiré de PARAM.guide.fourchette (42 × 4 h).
const joursFourchetteF = P => P.guide.fourchette.periodes * P.guide.fourchette.heures / 24;
const derniersJoursF = () => (typeof PARAM !== 'undefined' ? 'les ' + joursFourchetteF(PARAM) + ' derniers jours' : 'les derniers jours');
const FICHES = {
  // ── Positionnement et dérivés (fichier de 15 min) ──
  gex: {
    titre: 'GEX — exposition gamma des dealers', champ: 'micro.gex_usd_1pct',
    simple: 'Couverture que les teneurs de marché d’options devraient acheter ou vendre si le prix bouge.',
    lectures: [
      { s: 'convention', t: 'GEX positif (« long gamma ») : les dealers amortiraient les mouvements. Prix attiré par les gros strikes.' },
      { s: 'convention', t: 'GEX négatif (« short gamma ») : ils suivraient le mouvement, qui serait amplifié.' },
      { s: 'convention', t: 'Zéro gamma : le prix où le régime basculerait. Murs de calls et de puts : la couverture la plus forte.' },
    ],
    debat: 'Tout repose sur une hypothèse : dealers acheteurs des calls, vendeurs des puts. Si des clients achètent des calls ou vendent des puts, le signe s’inverse. Leur position réelle ne se voit pas : c’est un modèle.',
    limites: 'Deribit seulement (ni CME, ni gré à gré). Ne dit ni la direction ni le moment.',
  },
  ls: {
    titre: 'Ratio long / short (comptes)', champ: 'micro.ls_ratio',
    simple: 'Comptes Binance nets acheteurs divisés par comptes nets vendeurs, sur le perpétuel.',
    lectures: [
      { s: 'débattu', t: 'Lecture contrarienne : une foule très acheteuse est exposée. Ses liquidations peuvent nourrir une baisse.' },
      { s: 'débattu', t: 'Lecture de tendance : un ratio qui monte avec le prix accompagne un mouvement suivi.' },
    ],
    debat: 'Les deux lectures se contredisent et aucune ne fait consensus. Chacune « marche » sur ses exemples choisis. Le ratio des gros comptes peut dire l’inverse au même instant.',
    limites: 'Binance seulement, avec sa propre définition d’un « compte net acheteur ».',
  },
  top_ls: {
    titre: 'Ratio long / short des gros traders', champ: 'micro.top_ls_ratio',
    simple: 'Positions acheteuses sur vendeuses des plus gros comptes Binance, pondérées par la taille.',
    lectures: [
      { s: 'usuel', t: 'Souvent lu comme « l’argent informé » face à la foule.' },
    ],
    debat: 'Comme pour le ratio des comptes, les lectures contrarienne et de tendance se contredisent.',
    limites: 'Binance définit et change le périmètre des « top traders ».',
  },
  taker: {
    titre: 'Ratio acheteurs / vendeurs au marché (perpétuel)', champ: 'micro.taker_ratio',
    simple: 'Volume acheté au marché divisé par volume vendu au marché, sur le perpétuel.',
    lectures: [
      { s: 'mesuré', t: 'Mesure l’agression, pas l’intention : une liquidation forcée compte aussi.' },
    ],
    limites: 'Perpétuel Binance, dernier point horaire.',
  },
  funding: {
    titre: 'Funding (financement du perpétuel)', champ: 'micro.funding_rate_pct',
    get simple() { return 'Taux payé ' + echeancesMots() + ' entre acheteurs et vendeurs du perpétuel.'; },
    lectures: [
      { s: 'usuel', t: 'Positif : les acheteurs paient les vendeurs. Nettement positif : beaucoup de levier acheteur, coûteux à tenir.' },
      { s: 'usuel', t: 'Négatif : les vendeurs à découvert paient. Le camp vendeur domine.' },
      { s: 'convention', t: 'Le funding annualisé suppose le taux du moment constant toute l’année. Cela n’arrive jamais.' },
    ],
    limites: 'Binance seulement. Le taux affiché peut changer avant le paiement.',
  },
  oi: {
    titre: 'Open interest (contrats ouverts)', champ: 'micro.oi_change_24h_pct',
    simple: 'Nombre de contrats perpétuels ouverts, et sa variation : le levier entre ou sort.',
    lectures: [
      { s: 'usuel', t: 'OI en baisse : des positions se ferment (prises de bénéfice, liquidations).' },
      { s: 'mesuré', t: 'Chaque contrat a un acheteur et un vendeur. L’OI ne dit pas quel camp a ouvert.' },
    ],
    limites: 'Binance seulement ; la variation compare deux points horaires.',
  },
  cvd: {
    titreDeb: 'Achats et ventes',
    simpleDeb: 'Sur 24 h, les achats immédiats comparés aux ventes immédiates : qui a été le plus pressé.',
    titre: 'CVD — delta cumulé des volumes', champ: 'micro.cvd_24h_usd',
    simple: 'Achats au marché moins ventes au marché, en dollars, sur une fenêtre.',
    lectures: [
      { s: 'mesuré', t: 'Positif : les achats au marché ont dominé sur la fenêtre ; négatif : les ventes.' },
      { s: 'usuel', t: 'Prix en hausse, CVD en baisse : hausse portée par des ordres passifs, ou ventes absorbées.' },
    ],
    limites: 'Spot Binance seulement. Un gros ordre limite qui absorbe les ventes n’y apparaît pas.',
  },
  prime: {
    titre: 'Prime Coinbase', champ: 'micro.premium_pct',
    simple: 'Écart de prix entre Coinbase (en dollars) et Binance (en USDT).',
    lectures: [
      { s: 'usuel', t: 'Une prime positive est souvent lue comme une demande institutionnelle.' },
      { s: 'mesuré', t: 'Elle compare des dollars à des USDT. Un USDT sous 1 $ la rend négative à lui seul.' },
      { s: 'mesuré', t: 'La prime « hors USDT » compare des dollars à des dollars.' },
      { s: 'convention', t: 'Les états POSITIVE / NEGATIVE / EXTREME sont des seuils de ce code, pas une norme.' },
    ],
    limites: 'Deux carnets lus à quelques millisecondes d’écart. Vers 0,01 % d’écart, c’est du bruit.',
  },
  // ── Macro (fichier de 15 min, sources différées) ──
  dxy: {
    titre: 'DXY — indice du dollar', champ: 'macro.dxy_spot',
    simple: 'Valeur du dollar face à six grandes devises.',
    lectures: [
      { s: 'mesuré', t: 'L’euro pèse environ 58 % de l’indice : il suit surtout l’euro-dollar.' },
    ],
    debat: 'La relation dollar / BTC n’est pas stable. Selon la période étudiée, la corrélation change de signe.',
    limites: 'Dernière valeur journalière d’un jour ouvré, différée. Marché fermé le week-end.',
  },
  vix: {
    titreDeb: 'Nervosité des bourses',
    simpleDeb: 'Un indice de la nervosité attendue des bourses américaines : bas, calmes ; haut, nerveuses.',
    titre: 'VIX — volatilité implicite du S&P 500', champ: 'macro.vix',
    simple: 'Volatilité attendue par les options sur actions américaines, à 30 jours : l’« indice de la peur ».',
    lectures: [
      { s: 'convention', t: 'Repères courants : sous 15, calme ; au-dessus de 25 à 30, stress. Des habitudes, pas des lois.' },
      { s: 'débattu', t: 'Le lien entre VIX et bitcoin n’est pas systématique.' },
    ],
    limites: 'Actions américaines, pas crypto. Différé, mis à jour aux heures de séance.',
  },
  // ── Carnet (fichier de 15 min) ──
  carnet: {
    titreDeb: 'Ordres en attente',
    simpleDeb: 'Les ordres d’achat et de vente qui attendent sur Binance, près du prix. Ils peuvent être retirés.',
    titre: 'Ratio bid / ask du carnet', champ: 'liquidity.ratio_bid_ask',
    simple: 'BTC posés à l’achat divisés par BTC posés à la vente, près du milieu du carnet.',
    lectures: [
      { s: 'mesuré', t: 'Au-dessus de 1 : plus d’ordres d’achat que de vente posés près du prix.' },
      { s: 'débattu', t: 'Lire une « pression » est discuté : un ordre peut être retiré, ou juste montré.' },
    ],
    limites: 'Une photo du carnet Binance spot à la publication. Une bande n’est publiée que si le carnet la couvre.',
  },
  murs: {
    titre: 'Murs de liquidité', champ: 'liquidity.bid_walls',
    simple: 'Les tranches de prix où le plus de BTC sont posés, à l’achat et à la vente.',
    lectures: [
      { s: 'usuel', t: 'Souvent lus comme des supports (achat) ou des résistances (vente) possibles.' },
      { s: 'mesuré', t: 'Un mur peut être retiré à tout moment. La carte (bookmap.html) montre son histoire.' },
    ],
    limites: 'Une photo à la publication, dans la bande couverte par le carnet.',
  },
  // ── Indicateurs du fichier (bloc tf) ──
  rsi_tf: {
    titre: 'RSI (fichier, par échelle de temps)', champ: 'tf.*.rsi_14',
    simple: 'Force des hausses face aux baisses récentes, de 0 à 100, par échelle de temps.',
    lectures: [
      { s: 'convention', t: 'Ces seuils sont ceux de Wilder, l’inventeur du RSI.' },
      { s: 'usuel', t: 'En tendance forte, le RSI peut rester longtemps au-delà de ces seuils.' },
    ],
    limites: 'Bougie en cours incluse : il bouge jusqu’à la clôture. Peut différer du RSI du graphique.',
  },
  ema_tf: {
    titre: 'EMA 20 / EMA 50 (fichier)', champ: 'tf.*.ema20',
    simple: 'Moyennes des clôtures sur 20 et 50 bougies, les plus récentes pesant plus.',
    lectures: [
      { s: 'usuel', t: 'Courte au-dessus de la longue : hausse à court terme. Un croisement arrive toujours après le mouvement.' },
    ],
    limites: 'Dépend de l’historique chargé : voir le poids résiduel de l’amorce, plus bas.',
  },
  croisement: {
    titre: 'EMA 20 sous EMA 50 (ex-« death cross »)', champ: 'tf.*.ema20_sous_ema50',
    simple: 'Dit si la moyenne courte est sous la longue : un état, pas un croisement daté.',
    lectures: [
      { s: 'usuel', t: 'Vrai : la tendance courte est plus faible que la longue sur cet horizon.' },
      { s: 'mesuré', t: 'Le « death cross » des manuels : SMA 50 sous SMA 200, en journalier. L’ancien champ `death_cross_4h` n’en était pas un.' },
    ],
    limites: 'Un état qui peut durer des semaines, sans date de croisement.',
  },
  sr_tf: {
    titreDeb: 'Fourchette (plus bas, plus haut)',
    simpleDeb: 'Le plus bas et le plus haut récents (5 jours pour la carte) : le prix est-il en haut, au milieu, en bas ?',
    titre: 'Support / résistance (fichier)', champ: 'tf.*.support_30',
    simple: 'Le plus bas et le plus haut des dernières bougies de l’échelle de temps.',
    lectures: [
      { s: 'usuel', t: 'Le prix entre les deux : sa place dans son canal récent.' },
      { s: 'mesuré', t: 'Ce sont des extrêmes, pas des niveaux testés plusieurs fois comme un vrai support.' },
    ],
    limites: 'La fenêtre change avec l’échelle de temps, affichée à côté de la valeur.',
  },
  amplitude: {
    titre: 'Amplitude (fichier)', champ: 'tf.*.amplitude_30_pct',
    simple: 'Écart entre le plus haut et le plus bas récents, en % du plus bas.',
    lectures: [{ s: 'usuel', t: 'Grande amplitude : marché agité ; petite : compression.' }],
    limites: 'Le champ historique `range_24h_pct` ne couvre jamais 24 h.',
  },
  atr_tf: {
    titre: 'ATR (fichier)', champ: 'tf.*.atr_14',
    simple: 'Amplitude moyenne d’une bougie, en dollars : l’échelle normale du mouvement.',
    lectures: [
      { s: 'usuel', t: 'Une fraction d’ATR est souvent lue comme du bruit. Aucun seuil universel.' },
      { s: 'mesuré', t: 'Ne dit rien de la direction.' },
    ],
    limites: 'Moyenne de Wilder, bougie en cours incluse. Une moyenne simple donnerait un peu autre chose.',
  },
  volume_tf: {
    titre: 'Volume moyen (fichier)', champ: 'tf.*.volume_moyen_10_btc',
    simple: 'Quantité moyenne de BTC échangée par bougie, sur les dernières bougies.',
    lectures: [{ s: 'usuel', t: 'La moyenne sert de référence : une bougie se juge par rapport à elle.' }],
    limites: 'La bougie en cours, incomplète, tire la moyenne vers le bas.',
  },
  // ── Indicateurs calculés par la PAGE (formule : CALCUL, construit avec PARAM) ──
  rsi: {
    titre: 'RSI (graphique)', page: 'rsi',
    simple: 'Force des hausses face aux baisses récentes, sur une échelle de 0 à 100.',
    lectures: [
      { s: 'convention', t: 'Ces seuils sont ceux de Wilder, l’inventeur du RSI. En forte tendance, certains prennent 80 et 20.' },
      { s: 'usuel', t: 'Divergence : nouveau plus haut du prix sans celui du RSI, lu comme un essoufflement.' },
      { s: 'usuel', t: 'En tendance forte, le RSI peut rester longtemps au-delà de ces seuils.' },
      { s: 'usuel', t: 'Beaucoup surveillent aussi le passage de 50.' },
    ],
    limites: 'Calculé sur les bougies chargées, bougie en cours incluse.',
  },
  ema: {
    titre: 'Moyennes mobiles (graphique)', page: 'ema',
    simple: 'EMA : moyenne des clôtures qui pèse plus les récentes. SMA : moyenne simple.',
    lectures: [
      { s: 'usuel', t: 'Les moyennes 50 et 200 sont très suivies : beaucoup regardent les mêmes niveaux.' },
      { s: 'usuel', t: '50 au-dessus de 200 : « golden cross » ; l’inverse : « death cross ».' },
    ],
    limites: 'En retard par construction.',
  },
  vwap: {
    titre: 'VWAP', page: 'vwap',
    simple: 'Prix moyen payé, pondéré par les volumes, depuis un point d’ancrage.',
    lectures: [
      { s: 'usuel', t: 'En intraday, beaucoup le prennent comme le prix « juste » de la séance.' },
    ],
    limites: 'Dépend de son ancrage : deux plateformes peuvent afficher deux valeurs.',
  },
  adx: {
    titre: 'ADX / DMI', page: 'adx',
    simple: 'La force d’une tendance, pas son sens ; +DI et −DI disent qui pousse.',
    lectures: [
      { s: 'convention', t: 'Les repères 25 et 20 sont des habitudes. Le graphique trace des lignes à 25 et 50.' },
      { s: 'usuel', t: '+DI au-dessus de −DI : la pression haussière domine, et inversement.' },
    ],
    limites: 'Réagit lentement (double lissage).',
  },
  atr: {
    titre: 'ATR (graphique)', page: 'atr',
    simple: 'Amplitude moyenne d’une bougie : l’échelle normale du mouvement.',
    lectures: [{ s: 'usuel', t: 'Une distance se dit souvent « en ATR » : à 2 ATR, deux fois le mouvement habituel.' }],
    limites: 'En dollars : comparer des prix très différents demande l’ATR en %.',
  },
  volume: {
    titre: 'Volume (graphique)', page: 'volume',
    simple: 'Quantité échangée pendant chaque bougie.',
    lectures: [
      { s: 'usuel', t: 'Un pic extrême est souvent lu comme une fin de mouvement (capitulation ou euphorie).' },
    ],
    limites: 'Binance seulement : une fraction du volume mondial.',
  },
  sr: {
    titre: 'Supports / résistances (graphique)', page: 'sr',
    simple: 'Niveaux où le prix a fait demi-tour, regroupés ; les plus forts sont tracés.',
    lectures: [
      { s: 'usuel', t: 'Un niveau touché souvent, récemment et sur du volume, est jugé plus solide.' },
      { s: 'usuel', t: 'Beaucoup attendent une période finie au-delà du niveau avant de le dire cassé.' },
      { s: 'mesuré', t: 'Le style du trait dit l’intervalle d’origine (nommé sur le badge), pas l’importance.' },
    ],
    limites: 'Méthode propre à cette page : d’autres outils tracent d’autres niveaux.',
  },
  bb: {
    titre: 'Bandes de Bollinger', page: 'bb',
    simple: 'Une moyenne et deux bandes à quelques écarts-types : l’enveloppe normale du prix.',
    lectures: [
      { s: 'usuel', t: 'Une volatilité comprimée précède souvent un mouvement, de sens inconnu.' },
      { s: 'convention', t: 'Bollinger lui-même le rappelle : une bande touchée n’est pas un signal en soi.' },
    ],
    limites: 'Sur le BTC, les grands écarts sont plus fréquents qu’une loi normale ne le prévoit.',
  },
  macd: {
    titre: 'MACD', page: 'macd',
    simple: 'Écart entre deux moyennes exponentielles, et sa moyenne : la dynamique de la tendance.',
    lectures: [
      { s: 'usuel', t: 'MACD au-dessus de son signal : l’écart monte, même sous 0 (une baisse qui ralentit).' },
      { s: 'usuel', t: 'Les croisements arrivent en retard sur le prix. On guette aussi les divergences.' },
    ],
    limites: 'Non borné : pas de niveau « extrême » universel.',
  },
  // ── Le Guide du graphique (js/guide.js) : ses nombres viennent de PARAM.guide ──
  // simpleDeb des fiches du Guide : ce que montre l'écran sans « Le détail »,
  // redit sous « En savoir plus ».
  guide: {
    titre: 'Guide du graphique', page: 'guide', nature: 'convention',
    titreDeb: 'Repères et phrase de lecture',
    simpleDeb: 'Sans « Le détail » : la phrase, deux repères, le scénario n° 1 et parfois une figure. Le reste s’ajoute dans « Choisir l’affichage ».',
    simple: 'Une couche qui décrit le graphique : niveaux proches, régime, figures, chemins conditionnels. Jamais quoi faire.',
    formule: P => 'Niveaux : au plus ' + P.guide.niveauxParCote + ' au-dessus et ' + P.guide.niveauxParCote + ' au-dessous du prix, à moins de ' + pcF(P.guide.distanceMax) + ' %. Régime : ADX ' + P.adx.periode
      + ', EMA ' + P.guide.emaCourte + '/' + P.guide.emaLongue + ', Bollinger ' + P.bb.periode + '. Formes : au plus ' + P.guide.formesMax + ' à la fois. Choix gardé dans ce navigateur.',
    lectures: [
      { s: 'mesuré', t: 'Les niveaux sont lus dans les données. Chacun dit son origine, son prix et, s’il est publié, son heure.' },
      { s: 'convention', t: 'Régime, états « cassé » ou « percé en mèche », objectifs : des règles usuelles, nommées dans leur fiche.' },
      { s: 'débattu', t: 'Murs d’options et zéro gamma viennent d’un modèle : ils sont marqués « modèle ».' },
    ],
    limites: 'Pas une prévision : aucun chemin privilégié, aucune probabilité. Masquable dans « Choisir l’affichage », dans les deux modes.',
  },
  guide_niveaux: {
    titre: 'Guide — niveaux nommés', page: 'guide', nature: 'mesure',
    titreDeb: 'Les repères de prix',
    simpleDeb: 'Chaque repère dit son origine en mots, et son heure si c’est un chiffre publié.',
    simple: 'Les niveaux les plus proches du prix, chacun dans une bande fine avec son origine en mots.',
    formule: P => 'Bande : ± ' + nbF(P.guide.bandeAtr) + ' × ATR ' + P.guide.atrPeriode + '. Une bande regroupe des niveaux dont l’écart total reste sous ' + pcF(P.guide.fusion) + ' %. Niveaux à moins de ' + pcF(P.guide.distanceMax) + ' % du prix, au plus '
      + P.guide.niveauxParCote + ' de chaque côté. Zones de demi-tours : au moins ' + P.guide.touchesMin + ' pivots regroupés (méthode S/R de la page, sur les ' + P.sr.bougies + ' dernières bougies de l’intervalle affiché). Cassure : 2 clôtures successives hors de la bande, ou 1 puis un retour réussi, parmi les '
      + P.guide.regardCassure + ' dernières bougies closes ; mèche : sur les ' + P.guide.mecheBougies + ' dernières. « Proche » : à moins de ' + pcF(P.guide.proche) + ' % du prix live.',
    lectures: [
      { s: 'mesuré', t: 'Hauts et bas d’hier (journée UTC) et des 24 h, lus sur les bougies. Période incomplète : pas affiché.' },
      { s: 'usuel', t: 'Zone de N demi-tours : N pivots regroupés, sur l’intervalle affiché seulement. Souvent lue comme support ou résistance.' },
      { s: 'mesuré', t: 'Mur du carnet : la tranche la plus chargée à la publication. Un mur déjà dépassé n’est pas affiché.' },
      { s: 'mesuré', t: 'Mur d’options : le prix d’exercice publié. Zéro gamma : un prix calculé par le modèle.' },
      { s: 'convention', t: 'États : loin, proche, en test, percé en mèche. Cassé : deux clôtures au-delà, ou une et un retour.' },
      { s: 'convention', t: 'Lus sur les bougies closes. Pour un chiffre publié, seules les clôtures après sa lecture comptent.' },
      { s: 'usuel', t: 'Un niveau cassé est souvent lu comme ayant « changé de rôle » : un support franchi devient résistance.' },
    ],
    limites: 'Distance mesurée au prix en direct. Un chiffre publié garde son heure (« lu à HH:MM »). Sans donnée, rien ; jamais 0.',
  },
  guide_regime: {
    titre: 'Guide — régime du marché', page: 'guide', nature: 'convention',
    titreDeb: 'Le mouvement du prix',
    simpleDeb: 'Sans « Le détail », pas de badge : il s’affiche avec ses mesures quand on l’allume.',
    simple: 'Un badge : tendance (et son sens), tendance faible ou sans tendance ; « compression » si les bandes sont étroites.',
    formule: P => 'ADX ' + P.adx.periode + ' ≥ ' + P.guide.adxTendance + ' : tendance (haussière si +DI > −DI et EMA ' + P.guide.emaCourte + ' > EMA ' + P.guide.emaLongue + ', baissière si les deux disent l’inverse, sinon sens incertain) ; ADX ≤ '
      + P.guide.adxSans + ' : sans tendance nette ; entre les deux : tendance faible. Compression : largeur de Bollinger (' + P.bb.periode + ', ' + P.bb.ecarts + ' σ) au plus à son ' + P.guide.bbPercentile + 'e centile des ' + P.guide.bbFenetre + ' dernières bougies ; « au plus bas depuis N bougies » n’est dit qu’à partir de N = ' + P.guide.compressionDepuisMin + '.',
    lectures: [
      { s: 'convention', t: 'Les seuils de l’ADX sont ceux de l’usage (Wilder) : une convention, pas une loi.' },
      { s: 'débattu', t: 'Une compression précéderait un mouvement plus ample, de sens inconnu. Non mesuré ici.' },
    ],
    limites: 'Lu sur la dernière bougie close de l’intervalle affiché.',
  },
  guide_formes: {
    titre: 'Guide — figures chartistes', page: 'guide', nature: 'convention',
    titreDeb: 'Les figures du graphique',
    simpleDeb: 'Une figure en tirets se dessine ; en trait plein, elle est validée ; en pointillés, finie, barrée « ✗ » si défaite.',
    simple: 'Seize figures détectées par des règles fixes, sur bougies closes ; états de l’ébauche à l’objectif, délai écoulé –, sans suite ○.',
    formule: P => {
      const g = P.guide, E = g.ete, L = g.lignes, D = g.drapeau;
      return 'Socle : pivots de ' + g.pivot + ' bougies de chaque côté ; tolérance ' + nbF(g.tolAtr) + ' × ATR ' + g.atrPeriode + ' ; hauteur d’au moins ' + nbF(g.hauteurMinAtr) + ' ATR ; sortie hors d’une bande de ± ' + nbF(g.bandeAtr) + ' × ATR (figée à la naissance de la figure) : 2 clôtures au-delà, ou 1 clôture puis un retour réussi (au plus ' + g.retourMax + ' clôtures dans la bande). '
        + 'Ébauche : dès la 1re clôture (au moins ' + g.ebaucheDroiteMin + ' bougie à droite du dernier extrême), avec le pivot en attente ; annulée si un nouvel extrême dépasse les autres sommets (ou creux) de plus de la tolérance. '
        + 'Doubles : deux pivots à moins de la tolérance, séparés de ' + g.ecartMin + ' à ' + g.ecartMax + ' bougies. Triples : trois pivots, ' + g.tripleMax + ' bougies au plus, écarts réguliers à ' + pcF(g.tripleRegulier) + ' % près, creux (ou sommets) intermédiaires d’au moins ' + pcF(g.tripleCreux) + ' % de la hauteur. '
        + 'Épaule-tête-épaule : ' + E.min + ' à ' + E.max + ' bougies ; tête au-delà des épaules d’au moins ' + nbF(E.teteAtr) + ' ATR et ' + pcF(E.teteH) + ' % de la hauteur ; épaules à moins de ' + nbF(E.epaulesAtr) + ' ATR et ' + pcF(E.epaulesH) + ' % de la hauteur l’une de l’autre ; symétrie dans un rapport de ' + nbF(E.symetrie) + ' au plus ; ligne de cou de pente ≤ ' + pcF(E.couPente) + ' % de la hauteur ; épaules à ' + pcF(E.epauleCouMin) + ' % de la hauteur au moins au-dessus du cou ; jambes ≥ ' + E.jambeMin + ' bougies ; tendance d’avant ≥ ' + pcF(E.tendanceH) + ' % de la hauteur. '
        + 'Rectangle : ≥ 2 contacts par côté sur ≥ ' + g.rangeMin + ' bougies (fenêtre ' + g.rangeFenetre + '), hauteur ≤ ' + nbF(g.rangeHauteurAtr) + ' ATR. '
        + 'Triangles, biseaux, canaux : régressions sur les 2 à 4 derniers sommets et creux (chacun à ≤ ' + nbF(L.tolAtr) + ' ATR de sa droite), ' + L.min + ' à ' + L.fenetre + ' bougies, chaque droite sur ≥ ' + pcF(L.etalement) + ' % de la figure ; un côté « plat » : < ' + nbF(L.platAtr) + ' ATR et < ' + pcF(L.platW0) + ' % de la largeur ; triangles : resserrement ≥ ' + pcF(g.triConvergence) + ' % ; biseaux : ≥ ' + pcF(L.biseauConvergence) + ' %, les deux droites dans le même sens ; repérés avant ' + pcF(L.avancementMax) + ' % du chemin vers la pointe ; canaux : parallèles à ' + pcF(L.paralleleMax) + ' % près, pente ≥ ' + nbF(L.penteCanalAtr) + ' ATR, largeur ≤ ' + nbF(L.canalLargeurMaxAtr) + ' ATR, ≥ ' + L.canalMin + ' bougies ; une droite de 2 points seulement : le prix revient entre eux à moins de ' + pcF(L.approche) + ' % de la largeur (ou de la tolérance) ; aucune clôture hors de la bande de sortie avant la naissance de la figure. '
        + 'Drapeau et fanion : un mât d’au moins ' + nbF(D.matAtr) + ' ATR en ' + D.matMin + ' à ' + D.matMax + ' bougies, puis une pause de ' + D.pauseMin + ' à ' + D.pauseMax + ' bougies, recul ≤ ' + pcF(D.retrait) + ' % du mât, largeur ≤ ' + pcF(D.largeur) + ' % du mât, pas plus de ' + pcF(D.pente) + ' % du mât dans son sens ; fanion si les droites se resserrent d’au moins ' + pcF(g.triConvergence) + ' %, drapeau sinon (jusqu’à ' + pcF(D.paralleleMax) + ' % d’écartement) ; un mât ne sert qu’une fois. '
        + 'Objectifs : la hauteur reportée depuis la ligne franchie (doubles, triples, épaule-tête-épaule, rectangle), la largeur à l’ouverture (triangles, biseaux, canaux), la longueur du mât (drapeaux, fanions). '
        + 'Invalidations : clôture au-delà de l’extrême (doubles, triples) ; de la tête puis, une fois validée, de l’épaule droite (épaule-tête-épaule) ; retour au-delà du milieu (deux droites, rectangle) ; recul de plus de la moitié du mât, ou retour au-delà de l’extrême de la pause (drapeaux). '
        + 'Bilan : une figure compte depuis la clôture où son dernier pivot est connu ; un double devenu triple ne compte qu’une fois et sort du dénominateur des validations. '
        + 'Dessin : un nouveau pivot sur une droite la refait (même nom, même début) ; une figure validée porte un trait fin à son niveau d’invalidation ; en Complet, la bulle cite les figures récemment invalidées, sans suite ou annulées. '
        + 'Délais : ' + g.expiration + ' bougies pour valider, ' + g.horizon + ' pour atteindre l’objectif (objectif et invalidation jugés tous deux en clôture). À l’écran : au plus ' + g.formesMax + ' figures en Complet (une seule en Lisible) ; une figure invalidée reste ' + g.garderInvalide + ' bougies, une ébauche annulée ' + g.garderEbauche + ', un objectif atteint ' + g.garderFini + ' (Complet). « Échantillon faible » sous ' + g.echantillonFaible + ' cas. Repère sans forme : au plus ' + g.temoinDeparts + ' départs rejoués.';
    },
    lectures: [
      { s: 'convention', t: 'États : ébauche, formée, sortie à valider (1 clôture sur 2), validée, objectif atteint, invalidée ✗.' },
      { s: 'convention', t: 'Délai écoulé : un – sur la ligne de validation. Sans suite : un ○, jamais une croix.' },
      { s: 'convention', t: 'Un passage en mèche se dit « percé en mèche, à valider », jamais une validation.' },
      { s: 'convention', t: 'Objectif théorique et invalidation suivent des conventions de l’usage, non garanties (règles plus bas).' },
      { s: 'convention', t: 'Figure tombée : une ✗ sur le niveau franchi, jamais sur un prix de clôture.' },
      { s: 'débattu', t: 'Le sens « attendu » d’une figure est débattu. En Complet, la page montre le partage mesuré des sorties.' },
      { s: 'débattu', t: 'Les figures sont subjectives. Des règles fixes les rendent reproductibles, pas efficaces.' },
      { s: 'mesuré', t: 'Bilan : le même détecteur rejoué sur l’historique chargé, sans regarder l’avenir.' },
      { s: 'mesuré', t: 'Objectif et invalidation ne sont pas à la même distance. Un repère sans forme sert de témoin (Wilson 95 %).' },
    ],
    limites: 'Bilan sur l’historique chargé et l’intervalle affiché : ni probabilité, ni règle générale. Échantillons souvent petits.',
  },
  guide_suite: {
    titre: 'Guide — et ensuite ?', page: 'guide', nature: 'convention',
    titreDeb: 'Et après un repère ?',
    simpleDeb: 'Sans « Le détail », rien n’est dessiné pour la suite. Touchez un repère pour lire la condition.',
    simple: 'Deux chemins conditionnels après la dernière bougie : « si clôture au-delà de X, prochain niveau Y ».',
    formule: P => 'X et Z : le premier niveau nommé au-dessus et au-dessous du prix ; Y et W : le suivant de chaque côté. Prix DANS une bande : X et Z sont ses deux bords. Marge de dessin : ' + pcF(P.guide.futur) + ' % de la largeur du tracé, entre ' + P.guide.futurMinPx + ' et ' + P.guide.futurMaxPx + ' pixels, au plus ' + pcF(P.guide.futurMaxFraction) + ' % du tracé.'
      + ' La marge disparaît quand rien ne s’y dessine et se referme d’un pas par bougie quittée. Les deux chemins ont la même forme, la plus complète qui tient ; sans place, une seule boîte, jamais un seul chemin.',
    lectures: [
      { s: 'convention', t: 'X, Y, Z et W sont des niveaux nommés du Guide, jamais des prix inventés.' },
      { s: 'convention', t: 'Les deux chemins ont le même poids : aucun n’est privilégié, aucune probabilité.' },
      { s: 'convention', t: 'Le seuil est le bord le plus éloigné de la première bande. Un niveau publié garde son heure.' },
    ],
    limites: 'Une condition, pas une prévision. La marge à droite reçoit ces chemins et les flèches des scénarios.',
  },
  // ── Les scénarios du matin (js/scenarios.js) : fichier previsions.json, branche « previsions » ──
  scenarios: {
    titreDeb: 'Scénarios du matin',
    simpleDeb: 'L’écran montre le n° 1 et une ligne qui dit où il en est. Touchez-les pour les trois.',
    titre: 'Scénarios du matin', page: 'scenarios', nature: 'convention',
    simple: 'Chaque matin, Claude (une IA) écrit trois scénarios pour 24 h environ, classés sans pourcentage.',
    formule: P => 'Point du matin : ' + pointMots(P) + ', BTCUSDT seulement. Zone : niveau × (1 ± marge du fichier). Une bougie touche une zone si son plus bas est sous le haut de la zone et son plus haut au-dessus du bas. Chemin : chaque cible dans une bougie plus tardive que la précédente ; invalidation touchée d’abord = invalidé. Range : sorti si une bougie dépasse une borne de plus de la marge. Suivi en direct : seules les bougies ENTIÈRES dans la fenêtre comptent, sur des bougies de ' + Math.round(P.scenarios.suiviPasMax / 60) + ' min au plus. « Échantillon faible » sous '
      + P.scenarios.echantillonFaible + ' matins notés. Fichier relu toutes les ' + (typeof CADENCES !== 'undefined' ? Math.round(CADENCES.previsions_lue / 60000) : '?') + ' minutes, onglet visible ; sans fichier lisible, rien n’est dessiné. Choix gardé dans ce navigateur (clé samsara-scenarios-v1).',
    lectures: [
      { s: 'convention', t: 'Le rang (1, 2, 3) est un classement, SANS pourcentage. Le 1 est jugé le plus probable.' },
      { s: 'convention', t: 'Le scénario de la semaine court sur plusieurs matins. Il ne compte pas dans la mesure.' },
      { s: 'mesuré', t: 'Seul chiffre de réussite : « Ordre du premier mouvement juste N fois sur M matins ».' },
      { s: 'mesuré', t: 'Tiré du journal : le chemin le mieux classé avec invalidation. Compté s’il touche sa 1re zone ou celle-ci.' },
      { s: 'mesuré', t: '« Juste » : la 1re zone d’abord. Avec peu de matins notés (« échantillon faible »), cela ne prouve rien.' },
      { s: 'convention', t: 'L’encadré est un SUIVI EN DIRECT, au créneau d’une bougie près. La note officielle est celle du journal.' },
      { s: 'convention', t: 'Le journal note le lendemain, sur des bougies d’une minute. Hors encadré, un état de la page porte « (en direct) ».' },
      { s: 'convention', t: 'Historique trop court pour remonter au point du matin : le suivi se dit « incomplet ».' },
      { s: 'débattu', t: 'Les niveaux d’un modèle d’options (murs, zéro gamma) sont marqués « (modèle) ».' },
      // Pendant la journée (js/scenarios.js, section 5) : aucune nouvelle prévision, les scénarios du
      // matin suivis. Des paragraphes par mode (classe .debutant-seul / .expert-seul).
      { s: 'convention', mode: 'debutant', t: 'Pendant la journée, pas de nouvelle prévision : les scénarios du matin sont suivis.' },
      { s: 'convention', mode: 'debutant', t: '« Indécis » : impossible de trancher. Une zone qui ne tient plus s’efface en une heure environ.' },
      { s: 'convention', mode: 'debutant', t: '« Suit le mieux le prix » : le plus près de ce qu’il décrit. Revu au quart d’heure ; pas une chance.' },
      { s: 'convention', mode: 'debutant', t: '« Aucun scénario ne tient plus » : rien de neuf avant le prochain point du matin.' },
      { s: 'convention', mode: 'expert', get t() { return journeeExpert(typeof PARAM !== 'undefined' ? PARAM : null); } },
    ],
    limites: 'Pas une prévision garantie. Une bougie sur deux zones : « ordre inconnu ». Masquable dans « Choisir l’affichage », dans les deux modes.',
  },
  // ── Le dessin lui-même ──
  // La forme d'une bougie est une CONVENTION du thème (jeton --bougie-forme) : la fiche dit celle
  // du thème courant, lue dans le code du tracé (FORMES_BOUGIE, BOUGIE_DENSE_PX, js/app.js).
  bougies: {
    titreDeb: 'Le dessin des prix',
    simpleDeb: 'Chaque bâton résume une période : début, plus haut, plus bas, fin. Le thème change la forme, jamais les valeurs.',
    titre: 'Bougies : la forme du thème', page: 'bougies', nature: 'convention',
    simple: 'Une bougie résume une période : ouverture, plus haut, plus bas et clôture.',
    etat: () => {
      if (typeof FORMES_BOUGIE === 'undefined') return null;
      const f = typeof COLORS !== 'undefined' && Object.prototype.hasOwnProperty.call(FORMES_BOUGIE, COLORS.bougieForme) ? COLORS.bougieForme : 'pleine';
      return 'Thème « ' + (typeof themeCourant === 'function' ? themeCourant().nom : '—') + ' » : ' + FORMES_BOUGIE[f]
        + '. La forme change, jamais la valeur ; en vue dense (corps < ' + BOUGIE_DENSE_PX + ' px), corps pleins'
        + (f === 'barre' ? ' — pour des barres, le trait seul' : '') + '.';
    },
    formule: () => 'Hausse : clôture ≥ ouverture. Le corps va de l’ouverture à la clôture, la mèche du plus bas au plus haut, aux ordonnées exactes de ces prix ; seule la forme suit le thème (jeton --bougie-forme : '
      + (typeof FORMES_BOUGIE !== 'undefined' ? Object.keys(FORMES_BOUGIE).join(', ') : '—') + ').',
    lectures: [
      { s: 'convention', t: 'Bougies « creuses en hausse » : corps creux en hausse, plein en baisse. La hausse se lit à la forme.' },
      { s: 'convention', t: 'Barres OHLC : l’ouverture est le tiret de gauche, la clôture celui de droite.' },
    ],
    limites: 'En vue dense, corps pleins : un contour fin ne se lit plus. La dernière bougie bouge jusqu’à sa clôture.',
  },
  stoch: {
    titre: 'Stochastique rapide', page: 'stoch',
    simple: 'Place de la clôture dans le range récent, de 0 (plus bas) à 100 (plus haut).',
    lectures: [
      { s: 'convention', t: 'Les seuils 80 et 20 sont une habitude, pas une loi.' },
      { s: 'usuel', t: 'En tendance, il peut rester longtemps collé à un bord.' },
    ],
    limites: 'Très nerveux en version rapide.',
  },
  // ── Indicateurs du menu sans fiche jusqu'au 09/10/2026 (formule : CALCUL, construit avec PARAM) ──
  ichimoku: {
    titre: 'Nuage Ichimoku', page: 'ichimoku',
    simple: 'Deux lignes de milieu de fourchette et un nuage décalé : la zone d’équilibre récente.',
    lectures: [
      { s: 'usuel', t: 'Nuage fin : zone jugée fragile.' },
      { s: 'convention', t: 'Ligne rapide qui croise la lente : un changement de rythme, en retard sur le prix.' },
      { s: 'usuel', t: 'Les traders suivent aussi la couleur du nuage projeté vers l’avant, non dessiné ici.' },
    ],
    limites: 'Réglages pensés pour les actions japonaises des années 1960. Rien n’est dessiné avant assez d’historique.',
  },
  sar: {
    titre: 'Parabolic SAR', page: 'sar',
    simple: 'Des points sous les bougies quand le prix monte, au-dessus quand il baisse.',
    lectures: [
      { s: 'usuel', t: 'On l’appelle « stop suiveur » : en hausse, il ne fait que monter.' },
    ],
    limites: 'Sans tendance, les points changent de côté sans arrêt et ne disent rien.',
  },
  obv: {
    titre: 'OBV — On-Balance Volume', page: 'obv',
    simple: 'Un compteur : il ajoute le volume des bougies en hausse et retire celui des baisses.',
    lectures: [
      { s: 'usuel', t: 'Seule la pente compte. Un OBV qui monte : plus de volume sur les bougies haussières.' },
      { s: 'usuel', t: 'Beaucoup guettent un OBV qui dépasse son sommet avant le prix.' },
    ],
    limites: 'Sa valeur dépend de la première bougie chargée. Tout le volume d’une bougie compte d’un seul côté.',
  },
  mfi: {
    titre: 'MFI — Money Flow Index', page: 'mfi',
    simple: 'Un RSI qui tient compte du volume, de 0 à 100.',
    lectures: [
      { s: 'convention', t: 'Les seuils 80 et 20, tracés sur le sous-graphe, sont une habitude.' },
      { s: 'usuel', t: 'Se lit comme le RSI, mais réagit plus aux bougies très échangées.' },
    ],
    limites: 'Corrélé au RSI : ne pas compter deux signaux. Volume Binance seulement.',
  },
  williamsR: {
    titre: 'Williams %R', page: 'williamsR',
    simple: 'Place du prix dans sa fourchette récente, de 0 (plus haut) à −100 (plus bas).',
    lectures: [
      { s: 'convention', t: 'Les seuils −20 et −80, tracés sur le sous-graphe, sont une habitude.' },
      { s: 'usuel', t: 'Même information que le stochastique rapide : ne pas les compter deux fois.' },
    ],
    limites: 'Très corrélé au stochastique et au RSI : pas des signaux séparés.',
  },
  cci: {
    titre: 'CCI — Commodity Channel Index', page: 'cci',
    simple: 'L’écart du prix à sa moyenne, mesuré en « écarts habituels ».',
    lectures: [
      { s: 'convention', t: 'Les lignes ±100, tracées sur le sous-graphe, sont un repère d’usage.' },
      { s: 'usuel', t: 'Longtemps au-delà de ±100 : lu comme une tendance forte plutôt qu’un excès.' },
    ],
    limites: 'Non borné : pas d’extrême universel. Corrélé aux autres oscillateurs.',
  },
  ao: {
    titre: 'Awesome Oscillator', page: 'ao',
    simple: 'Des barres : le prix récent au-dessus ou au-dessous de sa moyenne plus longue.',
    lectures: [
      { s: 'usuel', t: 'Barres de plus en plus courtes : l’élan faiblit.' },
      { s: 'mesuré', t: 'Ici, la couleur dit le côté de 0. Dans l’AO classique, elle dit si la barre grandit.' },
      { s: 'usuel', t: 'Autre forme suivie : « deux pics » du même côté de zéro.' },
    ],
    limites: 'En retard sur le prix. Proche du MACD : ne pas les compter deux fois.',
  },
  fib: {
    titre: 'Retracements de Fibonacci', page: 'fib',
    get simple() { return 'Des lignes à des fractions fixes (' + (typeof PARAM !== 'undefined' ? niveauxFib(PARAM, x => x > 0 && x < 1).join(', ') : 'les niveaux de Fibonacci') + ') entre le plus haut et le plus bas visibles.'; },
    lectures: [
      { s: 'usuel', t: 'Beaucoup les regardent, ce qui leur donne du poids : le repère est partagé.' },
      { s: 'usuel', t: 'Repli arrêté vers 38,2 % ou 50 % : tendance jugée intacte. Au-delà de 78,6 % : mouvement presque effacé.' },
    ],
    limites: 'Les lignes bougent quand on déplace ou zoome : elles dépendent de la vue.',
  },
  vp: {
    titre: 'Profil de volume', page: 'vp',
    simple: 'Barres horizontales au bord droit : le volume échangé à chaque prix de la vue.',
    lectures: [
      { s: 'usuel', t: 'Prix très échangés : lus comme des zones d’accord, où le prix ralentit.' },
      { s: 'mesuré', t: 'Le POC a une barre et un trait plus marqués, aux couleurs du thème. Zone de valeur : en pointillés.' },
    ],
    limites: 'Le volume d’une bougie est étalé sur toute sa hauteur. Le profil change avec la vue.',
  },
  liq: {
    titre: 'Ordres en attente (carte)', page: 'liq',
    simple: 'Une carte de chaleur sur le graphique : où des ordres attendaient dans le carnet Binance.',
    lectures: [
      { s: 'mesuré', t: 'Bande marquée et horizontale : beaucoup de BTC restés longtemps en attente à ce prix.' },
      { s: 'mesuré', t: 'La carte détaillée, en direct, est sur la page « Carte ».' },
    ],
    get limites() { return 'Un ordre peut être retiré à tout moment. Publiée toutes les ' + CADENCES.attendue_min + ' min : dernière colonne jusqu’à ' + CADENCES.attendue_min + ' min, plus l’envoi.'; },
  },
  // Plan du 13/10/2026, idée 5 ; « mesuré » : marche/range-cassure (BTC/USDT, 2019-2026).
  fourchette: {
    get titre() { return typeof PARAM !== 'undefined' ? 'Fourchette de ' + joursFourchetteF(PARAM) + ' jours' : 'Fourchette des derniers jours'; }, page: 'fourchette',
    get simple() { return 'Le plus haut et le plus bas du prix sur ' + derniersJoursF() + ', en deux lignes.'; },
    lectures: [
      { s: 'mesuré', t: 'Sur BTC/USDT, une sortie a souvent précédé un prix plus agité, sans sens privilégié.' },
      { s: 'mesuré', t: 'Une sortie sur deux est revenue dedans dans la journée, à peu près comme le hasard.' },
      { s: 'mesuré', t: 'Avec « Le détail », « En résumé » dit une sortie récente, même lignes masquées.' },
    ],
    get limites() { return 'Pas en 1 jour. Il faut ' + (typeof PARAM !== 'undefined' ? joursFourchetteF(PARAM) + ' jours' : 'assez') + ' de prix chargés : en 1 min, jamais.'; },
  },
};

// ─── Valeurs et métadonnées ───────────────────────────────────────────────────
const NATURES = { mesure: 'Mesuré', 'modèle': 'Modèle', convention: 'Convention', seuil: 'Seuil de ce code', horodatage: 'Horodatage' };
const STATUTS = { usuel: 'Usuel', convention: 'Convention', 'débattu': 'Débattu', 'mesuré': 'Mesuré' };
// Les mêmes pastilles en mots du Débutant (« convention » et « modèle » sont des mots de l'Expert).
const NATURES_DEB = { 'modèle': 'Estimation', convention: 'Règle d’usage' };
const STATUTS_DEB = { convention: 'Règle d’usage' };
/** Un mot dit autrement en Débutant : les deux, chacun dans sa classe (même HTML dans les deux modes). */
const motModes = (exp, deb) => (deb && deb !== exp ? '<span class="expert-seul">' + echapF(exp) + '</span><span class="debutant-seul">' + echapF(deb) + '</span>' : echapF(exp));
/** Les décimales utiles d'un nombre, au plus max (0,236 → 3 ; 0,5 → 1 ; 20 → 0). */
const decUtiles = (x, max) => { let d = 0; while (d < max && Math.abs(Math.round(x * Math.pow(10, d)) - x * Math.pow(10, d)) > 1e-9) d++; return d; };
/** Une fraction en pourcentage, à la française (0.003 → « 0,3 ») : pour les formules des fiches du Guide (Fmt, js/format.js). */
const pcF = x => { const v = Math.round(x * 1e6) / 1e4; return Fmt.nombre(v, decUtiles(v, 2)); };
const nbF = x => Fmt.nombre(x, decUtiles(x, 3));
// ─── Les nombres que les textes citent, lus là où le calcul les prend ───────────
// (PARAM pour la page, meta.champs pour le fichier, CADENCES, la carte publiée) : au moment de
// l'affichage, jamais recopiés ; sans eux, des mots plutôt qu'un nombre inventé.
/** Un paramètre publié par le serveur (meta.champs[cle].params[nom]), ou null. */
function prmMeta(cle, nom) {
  const m = metaDe(cle), v = m && m.params ? m.params[nom] : undefined;
  return typeof v === 'number' && isFinite(v) ? v : null;
}
/** « 14 bougies », lu dans meta ; sinon les mots de repli. */
const bougiesMeta = (cle, nom, repli) => { const v = prmMeta(cle, nom); return v !== null ? nbF(v) + ' bougies' : repli; };
/** « 30 dernières bougies », lu dans meta ; sinon « dernières bougies ». */
const dernieresMeta = (cle, nom) => { const v = prmMeta(cle, nom); return (v !== null ? nbF(v) + ' ' : '') + 'dernières bougies'; };
/** Minuit UTC (le début du jour UTC, une définition de calcul) dit en clair, avec l'heure qui lui
 *  correspond sur l'appareil : « minuit UTC (02:00 à l’heure de l’appareil) » ; sur un appareil à
 *  l'heure UTC, « minuit UTC ». */
function minuitUtcMots() {
  const d = new Date(), h = Fmt.heure(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  return 'minuit UTC' + (h === '00:00' ? '' : ' (' + h + ' à l’heure de l’appareil)');
}
/** Le point du matin des scénarios à l'heure de l'appareil (« 07:00 ») : PARAM.scenarios.point est
 *  une heure de la routine (à Paris), convertie en un instant du jour par js/scenarios.js. */
function pointMots(P) {
  const pt = P && P.scenarios ? P.scenarios.point : null;
  const t = typeof Scenarios !== 'undefined' && Scenarios.pointMs ? Scenarios.pointMs(new Date().toISOString().slice(0, 10), pt) : NaN;
  return isFinite(t) ? Fmt.heure(t) : 'le matin';
}
/** La durée du quart des scénarios (« 15 min »), lue dans PARAM.scenarios.jour. */
function quartMots() {
  const Q = typeof PARAM !== 'undefined' && PARAM.scenarios ? PARAM.scenarios.jour : null;
  return Q && Q.quartMs > 0 ? nbF(Math.round(Q.quartMs / 60000)) + ' min' : 'quart d’heure';
}
/** Les niveaux de Fibonacci de PARAM, en % (« 23,6 % ») ; garder : filtre facultatif. */
const niveauxFib = (P, garder) => (P && P.fib ? P.fib.niveaux : []).filter(x => !garder || garder(x)).map(x => pcF(x) + ' %');
/** La grille de la carte publiée (heatmap.json : dt s, dp $), lue dans le fichier quand il est lu. */
function grilleLiq() {
  const h = typeof histHeatmap !== 'undefined' && histHeatmap ? histHeatmap : null;
  const dt = h && h.dt > 0 ? h.dt : null, dp = h && h.dp > 0 ? h.dp : null;
  return {
    colonne: dt === null ? 'une colonne par pas de temps du fichier' : dt === 60 ? 'une colonne par minute' : dt % 60 === 0 ? 'une colonne toutes les ' + nbF(dt / 60) + ' min' : 'une colonne toutes les ' + nbF(dt) + ' s',
    tranche: dp === null ? 'une tranche de prix par pas de prix du fichier' : 'une tranche de prix par ' + nbF(dp) + ' $',
    pas: dt === null ? 'À chaque pas de temps du fichier' : dt === 60 ? 'Chaque minute' : 'Toutes les ' + (dt % 60 === 0 ? nbF(dt / 60) + ' min' : nbF(dt) + ' s'),
    dp,
  };
}
/** La demi-vie des supports / résistances de l'intervalle affiché (PARAM.sr.demiVie), en mots. */
function demiVieMots(P) {
  const itv = typeof chartInterval !== 'undefined' ? chartInterval : null, d = P && P.sr && P.sr.demiVie ? P.sr.demiVie[itv] : undefined;
  return typeof d === 'number' ? 'toutes les ' + nbF(d) + ' bougies sur cet intervalle' : 'en un nombre de bougies propre à chaque intervalle';
}
/** Les échéances du funding : « 3 fois par jour (toutes les 8 h) », lu dans meta. */
function echeancesMots() {
  const e = prmMeta('micro.funding_annual_pct', 'echeances_par_jour');
  return e ? nbF(e) + ' fois par jour (toutes les ' + nbF(24 / e) + ' h)' : 'à chaque échéance';
}
/** Une fenêtre en heures (« 24 h ») lue dans meta, ou null. */
const heuresMeta = (cle, nom) => { const v = prmMeta(cle, nom || 'fenetre_h'); return v !== null ? nbF(v) + ' h' : null; };
/** La lecture Expert de la journée des scénarios : ses nombres lus dans PARAM.scenarios.jour (ceux
 *  du calcul, js/scenarios.js) ; la stabilité mesurée garde les réglages de sa mesure. */
function journeeExpert(P) {
  const Q = P && P.scenarios && P.scenarios.jour ? P.scenarios.jour : typeof Scenarios !== 'undefined' ? Scenarios.PJ_DEFAUT : null;
  if (!Q) return '';
  const quart = nbF(Math.round(Q.quartMs / 60000)) + ' min';
  const debut = Q.departageMinutes === 60 ? 'la 1re heure' : Q.departageMinutes % 60 === 0 ? 'les ' + nbF(Q.departageMinutes / 60) + ' premières heures' : 'les ' + nbF(Q.departageMinutes) + ' premières minutes';
  const marges = Q.horsMarges === 1 ? 'd’une marge' : 'de ' + nbF(Q.horsMarges) + ' marges';
  return 'Pendant la journée, aucune nouvelle prévision. Écart d’un chemin = d(prochaine zone) / (d(prochaine zone) + d(invalidation)) ; d’un range = 1 − d(bord toléré) / demi-largeur tolérée. Comparer les deux est une convention, pas une probabilité. '
    + 'Le nom du plus petit écart se décide à chaque clôture de ' + quart + ' (en 1 h, aucun nom) et ne change qu’avec ' + nbF(Q.ecartChangement) + ' d’avance. « ◂ » marque le plus petit écart de la dernière clôture, parfois autre que le nom gardé. '
    + '« Trop tôt pour départager » pendant ' + debut + ', tant que le prix reste à moins de ' + nbF(Q.departageMouvementPct) + ' % du prix du point. Un seul ouvert : « seul encore en cours ». '
    + 'Aucun nom si le plus petit écart vaut au moins ' + nbF(Q.colle) + ' (« aucun ne colle »). « Au-delà de tous les niveaux du matin » : prix à plus ' + marges + ' au-delà de la zone la plus extrême. '
    + 'En 4 h ou 1 jour, rien n’est dit. Une cible n’est cochée que dans l’ordre, avant l’invalidation. Un scénario invalidé s’efface en ' + nbF(Q.fonduMinutes) + ' min ; sa croix et ses niveaux restent, plus pâles. '
    + 'Stabilité mesurée sur un modèle (règles v1 rejouées sur 398 matins, clôtures de 15 min, 0,12 d’avance) : 1,65 changement de nom par jour en moyenne.';
}
const echapF = s => String(s === undefined || s === null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// ─── Comment s'en servir : les deux couches du site (Guide, scénarios) ─────────────
// Elles ne sont pas des indicateurs de marché : leur fiche dit comment lire l'écran du site.
// { exp, deb } : exp, sous « En savoir plus », n'ajoute que ce que la ligne courte (COURT) ne dit
// pas ; deb, la ligne du menu quand la fiche n'a pas de ligne courte.
const USAGES = {
  guide: { exp: 'Figure en tirets : elle se forme encore. Trait plein : validée (deux clôtures au-delà, ou une et un retour réussi). Pointillés : finie sans son objectif, barrée ✗ si invalidée, « – » au délai écoulé, « ○ » sans suite.',
    deb: 'Une figure en tirets se dessine encore ; en trait plein, elle est validée ; barrée, elle ne tient plus.' },
  scenarios: { get exp() { return 'Pendant la journée, l’encadré dit les zones touchées (✓), les scénarios tombés (✗) et celui qui suit le mieux le prix, revu à chaque clôture de ' + quartMots() + '. « ◂ » marque le plus petit écart : pas une probabilité.'; },
    deb: 'Regardez le scénario n° 1 et sa zone. La ligne du haut dit ce qui a changé depuis le matin.' },
};
for (const k of Object.keys(USAGES)) if (FICHES[k]) FICHES[k].usage = USAGES[k];
/** La ligne « Comment s'en servir » d'une fiche, en HTML (les deux textes, chacun dans sa classe, s'ils diffèrent). */
function usageHtml(id) {
  const u = FICHES[id] && FICHES[id].usage;
  if (!u) return '';
  return typeof u === 'string' ? echapF(u) : motModes(u.exp, u.deb);
}

// ─── La fiche ouverte : ce que c'est · comment les traders l'utilisent · comment c'est calculé ───
// Demandes du 10/10/2026 (des explications qu'un adolescent comprend) et du 12/10/2026 (plus
// courtes) : chaque fiche s'ouvre sur trois lignes — ce que c'est (une phrase, en gras), comment
// les traders s'en servent (ou, pour le Guide et les scénarios, comment s'en servir), comment c'est
// calculé ; deux phrases au plus, sans formule. C'est l'usage CLASSIQUE chez les traders (manuels,
// plateformes), tel qu'ils le disent : rien de propre à ce site, rien de filtré par nos mesures
// (demande de Lorenzo du 13/10/2026 : « RSI survendu : beaucoup y guettent un rebond »). Une
// pratique décrite et attribuée (« beaucoup y guettent… », « beaucoup placent leur stop… ») n'est
// pas un conseil : la ligne ne dit jamais au lecteur quoi faire, ni ce que fera le prix (pas de
// « un rebond est attendu »). Les nombres sont lus là où le calcul les prend
// (PARAM, meta, CADENCES) : aucun nombre avec unité écrit en dur (tests/test_fiches.js). Pour les
// fiches que l'écran Débutant montre (GLOSSAIRE_DEBUTANT) et les calques simples, aucun mot de la
// liste du Guide : « période » pour une bougie, « gros paquet d'ordres » pour un mur.
// La ligne des traders est AUSSI `traders` de la fiche (une seule version).
// Une chaîne, ou une fonction de PARAM.
const COURT = {
  // ── Positionnement et dérivés (fichier de 15 min) ──
  gex: { quoi: 'Une estimation : les vendeurs d’options vont-ils freiner ou accélérer les mouvements du prix ?',
    traders: 'Positif, beaucoup attendent un marché plus calme ; négatif, des mouvements plus brusques. C’est une hypothèse, discutée entre spécialistes.',
    calcul: 'On part des options ouvertes sur Deribit. On additionne ce que leurs vendeurs devraient acheter ou vendre si le prix bouge.' },
  ls: { quoi: 'Chez Binance, combien de comptes parient sur la hausse pour un sur la baisse.',
    traders: 'Lu à contre-courant : si presque tous parient pareil, un retournement peut forcer des fermetures. Un petit compte pèse autant qu’un gros.',
    calcul: 'Sur son contrat perpétuel, Binance divise les comptes acheteurs par les comptes vendeurs. Un chiffre par heure.' },
  top_ls: { quoi: 'La même mesure chez les plus gros comptes de Binance, comptée en argent.',
    traders: 'On le compare à celui de tous les comptes. S’ils divergent, beaucoup regardent les gros, qui peuvent aussi se tromper.',
    calcul: 'Les paris à la hausse des gros comptes, divisés par leurs paris à la baisse. Un chiffre par heure.' },
  taker: { quoi: 'Qui est le plus pressé : ceux qui achètent tout de suite, ou ceux qui vendent ?',
    traders: 'Au-dessus de 1, les acheteurs pressés dominent ; en dessous, les vendeurs. On regarde si le prix suit ou résiste.',
    calcul: 'Sur le perpétuel de Binance : achats immédiats divisés par ventes immédiates, sur la dernière heure.' },
  funding: { quoi: 'Un paiement régulier entre parieurs, qui garde le prix du contrat collé au vrai prix.',
    traders: 'Très positif : beaucoup d’acheteurs à crédit, qu’une baisse peut forcer à vendre en chaîne. Très négatif : l’inverse.',
    calcul: () => 'Binance le fixe d’après l’écart entre son contrat perpétuel et le bitcoin. Il est réglé ' + echeancesMots() + '.' },
  oi: { quoi: 'Combien de paris sur le bitcoin sont ouverts, et si leur nombre grandit ou diminue.',
    traders: 'Prix et paris ouverts en hausse : de nouveaux joueurs entrent. Une chute brutale accompagne souvent une vague de fermetures forcées.',
    calcul: () => 'Binance compte ses contrats perpétuels ouverts. La variation compare au chiffre d’il y a ' + (heuresMeta('micro.oi_change_24h_pct') || 'une journée') + '.' },
  cvd: { quoi: 'Qui a été le plus pressé d’échanger : les acheteurs ou les vendeurs ?',
    traders: 'Prix en hausse et achats pressés en tête : hausse jugée solide. Prix en hausse mais ventes pressées en tête : hausse jugée fragile.',
    calcul: 'Les achats faits tout de suite, moins les ventes faites tout de suite. En dollars.' },
  prime: { quoi: 'Le bitcoin coûte-t-il plus cher aux États-Unis (Coinbase) qu’ailleurs (Binance) ?',
    traders: 'Plus cher sur Coinbase pendant longtemps : beaucoup y lisent une forte demande américaine. Moins cher : une demande faible.',
    calcul: 'Prix Coinbase en dollars comparé au prix Binance en USDT (un dollar numérique). L’écart, en pourcentage.' },
  dxy: { quoi: 'La force du dollar américain face aux grandes monnaies, surtout l’euro.',
    traders: 'Un dollar qui monte est souvent allé avec un bitcoin qui baisse, et l’inverse. Ce lien n’est pas une règle.',
    calcul: 'Une moyenne du dollar face à six monnaies, l’euro pour plus de la moitié. Le chiffre du dernier jour, via Yahoo Finance.' },
  vix: { quoi: 'Un thermomètre de la nervosité des bourses américaines.',
    traders: 'Quand il grimpe d’un coup, beaucoup vendent ce qui est risqué, bitcoin compris. Bas, les marchés sont jugés calmes.',
    calcul: 'Calculé à Chicago d’après le prix des protections contre les gros mouvements des actions américaines. Plus elles coûtent, plus il monte.' },
  carnet: { quoi: 'Combien de bitcoins attendent d’être achetés, et combien d’être vendus, près du prix.',
    traders: 'On cherche un côté nettement plus chargé que l’autre. Avec méfiance : un ordre peut être posé pour être vu.',
    calcul: 'Sur Binance, on additionne les bitcoins posés près du prix, à l’achat puis à la vente. On compare.' },
  murs: { quoi: 'Les prix où le plus de bitcoins attendent d’être achetés ou vendus.',
    traders: 'On les surveille quand le prix approche : le gros paquet tient-il, est-il avalé, disparaît-il ?',
    calcul: () => { const t = prmMeta('liquidity.bid_walls', 'tranche_usd');
      return 'On découpe les prix en tranches' + (t !== null ? ' de ' + nbF(t) + ' $' : '') + ' et on additionne les bitcoins de chacune. Les murs sont les plus remplies.'; } },
  // ── Indicateurs du fichier (bloc tf) ──
  rsi_tf: { quoi: 'Le RSI du graphique, calculé pour plusieurs durées.',
    traders: 'Au-dessus de 70, on dit « suracheté » ; sous 30, « survendu ». Quand plusieurs durées le disent ensemble, beaucoup y croient davantage.',
    calcul: () => 'Le serveur fait le calcul du graphique sur ' + bougiesMeta('tf.*.rsi_14', 'periode', 'les dernières périodes') + ' de chaque durée. La période en cours compte.' },
  ema_tf: { quoi: 'Les moyennes du prix, calculées par le serveur pour plusieurs durées.',
    traders: 'Prix au-dessus des moyennes : tendance lue à la hausse ; en dessous, à la baisse. Beaucoup comparent les durées pour voir si elles s’accordent.',
    calcul: () => { const a = prmMeta('tf.*.ema20', 'periode'), b = prmMeta('tf.*.ema50', 'periode');
      return 'Les moyennes des prix de fin' + (a !== null && b !== null ? ' des ' + nbF(a) + ' et des ' + nbF(b) + ' dernières périodes' : ' des dernières périodes') + ', les récents comptant plus. La période en cours compte.'; } },
  croisement: { quoi: 'Dit si la moyenne courte est sous la moyenne longue : un état, pas un moment.',
    traders: 'Courte sous longue : tendance lue comme baissière ; au-dessus, haussière. Beaucoup guettent le moment où elles se croisent.',
    calcul: () => { const a = prmMeta('tf.*.ema20_sous_ema50', 'courte'), b = prmMeta('tf.*.ema20_sous_ema50', 'longue');
      return 'Oui si la moyenne ' + (a !== null && b !== null ? 'des ' + nbF(a) + ' dernières périodes est sous celle des ' + nbF(b) : 'courte est sous la longue') + ', à la publication.'; } },
  sr_tf: { quoi: 'Le plus bas et le plus haut récents du prix : sa fourchette.',
    traders: 'Ces deux bornes sont surveillées quand le prix s’en approche. Les franchir est lu comme une sortie de la fourchette.',
    calcul: () => { const v = prmMeta('tf.*.support_30', 'bougies');
      return 'Le plus bas et le plus haut des ' + (v !== null ? nbF(v) + ' ' : '') + 'dernières périodes, pour plusieurs durées. La période en cours compte.'; } },
  amplitude: { quoi: 'L’écart entre le plus haut et le plus bas récents, en pourcentage.',
    traders: 'Il dit si le marché a été agité ou calme. Le calme précède souvent un mouvement plus large, de sens inconnu.',
    calcul: () => 'Le plus haut moins le plus bas des ' + dernieresMeta('tf.*.amplitude_30_pct', 'bougies') + ', divisé par le plus bas.' },
  atr_tf: { quoi: 'De combien le prix bouge d’habitude en une période, pour plusieurs durées.',
    traders: 'Beaucoup placent leur stop à un ou deux ATR, pris sur la durée qu’ils suivent. Un mouvement de plusieurs ATR sort de l’ordinaire.',
    calcul: () => 'Le calcul du graphique, fait par le serveur sur ' + bougiesMeta('tf.*.atr_14', 'periode', 'les dernières périodes') + ' de chaque durée.' },
  volume_tf: { quoi: 'La quantité moyenne de bitcoins échangée par période, ces derniers temps.',
    traders: 'Une période bien au-dessus de la moyenne est jugée importante. Un mouvement sur peu d’échanges, fragile.',
    calcul: () => 'La moyenne des quantités échangées sur les ' + dernieresMeta('tf.*.volume_moyen_10_btc', 'bougies') + ', période en cours comprise.' },
  // ── Indicateurs du graphique ──
  rsi: { quoi: 'Le RSI compare la force des hausses et des baisses récentes, de 0 à 100.',
    traders: 'Au-dessus de 70, on dit « suracheté » : beaucoup y guettent un repli. Sous 30, « survendu » : beaucoup y guettent un rebond.',
    calcul: P => 'On compare hausses et baisses moyennes sur les ' + P.rsi.periode + ' dernières périodes. Que des hausses : 100 ; que des baisses : 0.' },
  ema: { quoi: 'Une ligne qui suit le prix moyen récent : elle lisse les secousses.',
    traders: 'Prix au-dessus d’une moyenne qui monte : tendance à la hausse, et inversement. Beaucoup guettent aussi le croisement d’une moyenne courte et d’une longue.',
    calcul: 'La moyenne des prix de fin des dernières périodes ; leur nombre est dans le nom. L’« exponentielle » compte plus les récents.' },
  vwap: { quoi: 'Le prix moyen payé depuis le début de la journée, pondéré par les échanges.',
    traders: 'Prix au-dessus : la séance est lue comme acheteuse ; en dessous, vendeuse. Beaucoup s’en servent comme support ou résistance du jour.',
    calcul: P => 'Chaque prix compte selon ce qui s’y est échangé. Le calcul repart de zéro à ' + minuitUtcMots() + ', ou toutes les ' + P.vwap.ancrageBougies + ' périodes en journalier.' },
  adx: { quoi: 'L’ADX dit si le prix a une direction nette, sans dire laquelle.',
    traders: 'Au-dessus de 25 : marché en tendance ; sous 20 : sans direction. +DI et −DI disent quel camp pousse.',
    calcul: P => 'On compare la montée des hauts et la descente des bas, sur ' + P.adx.periode + ' périodes. L’ADX dit si un côté l’emporte.' },
  atr: { quoi: 'L’ATR dit de combien le prix bouge d’habitude en une période, sans le sens.',
    traders: 'Beaucoup placent leur stop à un ou deux ATR du prix, hors du bruit. Un mouvement de plusieurs ATR sort de l’ordinaire.',
    calcul: P => 'L’écart entre le haut et le bas de chaque période, saut depuis la précédente compris. Moyenne sur ' + P.atr.periode + ' périodes.' },
  volume: { quoi: 'Combien a été échangé pendant chaque période : barre haute, beaucoup d’échanges.',
    traders: 'Un mouvement avec beaucoup d’échanges est jugé plus solide. Une hausse aux échanges déclinants, essoufflée.',
    calcul: 'Binance publie la quantité échangée par période (des bitcoins pour BTC/USDT). Couleur de la hausse si le prix finit au moins aussi haut.' },
  sr: { quoi: 'Les prix où le prix a déjà fait demi-tour : support en dessous, résistance au-dessus.',
    traders: 'On regarde si le niveau tient quand le prix revient. Un niveau franchi est souvent lu comme ayant changé de rôle.',
    calcul: P => 'Sommets et creux des ' + P.sr.bougies + ' dernières périodes, regroupés quand ils sont proches. On garde les groupes récents et très échangés.' },
  bb: { quoi: 'Une moyenne et deux bandes : l’enveloppe où le prix bouge d’habitude.',
    traders: 'Bandes serrées : beaucoup guettent une sortie forte. Bande touchée : souvent lue comme un excès, sauf en tendance où le prix la longe.',
    calcul: P => 'Le milieu est la moyenne des ' + P.bb.periode + ' derniers prix de fin. Les bandes s’écartent quand ces prix se dispersent.' },
  macd: { quoi: 'Le MACD compare une moyenne rapide et une lente : le mouvement accélère-t-il ?',
    traders: 'MACD au-dessus de sa ligne signal : élan lu comme haussier ; en dessous, baissier. Beaucoup guettent leur croisement et le passage de zéro.',
    calcul: P => 'La moyenne rapide (' + P.macd.rapide + ' périodes) moins la lente (' + P.macd.lente + '). La ligne signal est la moyenne de ce résultat.' },
  stoch: { quoi: 'Où finit le prix dans sa fourchette récente : 100 en haut, 0 en bas.',
    traders: 'Au-dessus de 80, on dit « suracheté » ; sous 20, « survendu ». Beaucoup y guettent le croisement des deux lignes.',
    calcul: P => 'Le dernier prix, situé entre le haut et le bas des ' + P.stoch.k + ' dernières périodes. La 2e ligne : moyenne des ' + P.stoch.d + ' dernières valeurs.' },
  ichimoku: { quoi: 'Un nuage coloré et deux lignes : la zone d’équilibre récente du prix.',
    traders: 'Prix au-dessus du nuage : tendance vue à la hausse ; au-dessous, à la baisse ; dedans, indécis. Nuage épais : difficile à traverser.',
    calcul: P => 'Chaque ligne : le milieu entre haut et bas de ' + P.ichimoku.tenkan + ', ' + P.ichimoku.kijun + ' ou ' + P.ichimoku.senkouB + ' périodes. Le nuage est décalé vers la droite.' },
  sar: { quoi: 'Des points sous les bougies quand le prix monte, au-dessus quand il baisse.',
    traders: 'Un changement de côté est lu comme un retournement. Beaucoup s’en servent aussi de stop qui suit le prix.',
    calcul: 'À chaque période, le point se rapproche du prix, plus vite à chaque nouveau record. Touché, il change de côté.' },
  obv: { quoi: 'Un compteur : les échanges se font-ils surtout dans les hausses ou les baisses ?',
    traders: 'Il monte avec le prix : hausse jugée soutenue. Le prix monte mais lui stagne : hausse jugée fragile.',
    calcul: 'On part de zéro. Chaque période en hausse ajoute ses échanges, chaque période en baisse les retire.' },
  mfi: { quoi: 'Un RSI qui tient compte des quantités échangées, de 0 à 100.',
    traders: 'Au-dessus de 80, on dit « suracheté » ; sous 20, « survendu ». Beaucoup guettent aussi le moment où il ne suit plus le prix.',
    calcul: P => 'Sur ' + P.mfi.periode + ' périodes : l’argent échangé quand le prix moyen monte, face à celui des baisses.' },
  williamsR: { quoi: 'Où est le prix dans sa fourchette récente : 0 en haut, −100 en bas.',
    traders: 'Au-dessus de −20, on dit « suracheté » ; sous −80, « survendu ». Beaucoup s’en servent surtout quand le prix va et vient.',
    calcul: P => 'Le dernier prix, situé entre le haut et le bas des ' + P.williamsR.periode + ' dernières périodes. C’est le stochastique retourné.' },
  cci: { quoi: 'Le CCI dit si le prix s’est éloigné de sa moyenne plus que d’habitude.',
    traders: 'Au-dessus de +100, on dit « suracheté » ; sous −100, « survendu ». D’autres y lisent le départ d’un mouvement fort.',
    calcul: P => 'L’écart entre le prix et sa moyenne des ' + P.cci.periode + ' dernières périodes, divisé par l’écart habituel. La plupart des valeurs restent entre −100 et +100.' },
  ao: { quoi: 'Des barres : le prix récent est-il au-dessus de sa moyenne plus longue ?',
    traders: 'Barres au-dessus de zéro : élan haussier ; au-dessous : baissier. Beaucoup guettent le passage de zéro et la forme « soucoupe ».',
    calcul: P => 'Le milieu de chaque période, moyenné sur ' + P.ao.rapide + ' périodes, moins sa moyenne sur ' + P.ao.lente + '.' },
  fib: { quoi: 'Des lignes à des fractions fixes entre le plus haut et le plus bas visibles.',
    traders: P => { const m = niveauxFib(P, x => x > 0.3 && x < 0.7);
      return 'Beaucoup y situent jusqu’où un recul peut aller. Les niveaux du milieu' + (m.length ? ' (' + m.join(', ') + ')' : '') + ' sont les plus surveillés.'; },
    calcul: 'Comptées depuis le haut si le prix a monté sur la vue. Sinon, depuis le bas.' },
  vp: { quoi: 'Des barres couchées au bord droit : combien s’est échangé à chaque prix.',
    traders: P => 'Repères : le prix le plus échangé (POC) et la zone de valeur (' + pcF(P.vp.zoneValeur) + ' % des échanges). Les zones creuses sont souvent traversées vite.',
    calcul: P => 'On découpe les prix visibles en tranches ; chaque période y ajoute ses échanges. La zone de valeur réunit les plus remplies.' },
  liq: { quoi: 'Une carte de chaleur : où beaucoup d’ordres d’achat ou de vente attendaient.',
    traders: 'On regarde ces gros paquets d’ordres quand le prix approche : tiennent-ils, partent-ils ? La carte dit où ils étaient.',
    calcul: 'Le serveur additionne les bitcoins en attente sur Binance, prix par prix. Plus la case est marquée, plus il y en avait.' },
  fourchette: { quoi: P => 'Deux lignes : le plus haut et le plus bas du prix sur ' + joursFourchetteF(P) + ' jours.',
    traders: 'Beaucoup surveillent ces deux bords. Une période finie au-delà est souvent lue comme une cassure, le départ d’un mouvement dans ce sens.',
    calcul: P => 'Le site regroupe les prix par tranches de ' + P.guide.fourchette.heures + ' heures. Il garde le plus haut et le plus bas des ' + P.guide.fourchette.periodes + ' dernières tranches finies.' },
  // ── Le Guide, les scénarios, le dessin ──
  guide: { quoi: 'Une phrase et deux repères de prix qui décrivent le graphique.',
    usage: 'Lisez la phrase, puis les deux repères : entre eux, rien de neuf. Touchez un texte pour le détail.',
    calcul: 'Le site lit le mouvement récent et les prix proches où quelque chose s’est passé. Il garde le plus proche de chaque côté.' },
  guide_niveaux: { quoi: 'Les prix les plus proches où il s’est passé quelque chose, de chaque côté.',
    usage: 'Touchez un repère : son origine, la place du prix, le repère suivant s’il est dépassé.',
    calcul: 'Chaque repère vient des données : haut ou bas d’hier, gros paquet d’ordres, zone de demi-tours. Des repères proches forment une bande.' },
  guide_regime: { quoi: 'Le mouvement du prix en un mot : il monte, baisse, hésite ou s’agite.',
    usage: 'Le mot est le verbe de la phrase du haut. Il décrit le passé récent, pas la suite.',
    calcul: 'Le site regarde si le prix a une direction nette et si deux mesures s’accordent. Sinon : « hésite », ou « s’agite » s’il bouge fort.' },
  guide_formes: { quoi: 'Les dessins que le prix a déjà faits : deux sommets, un triangle, un drapeau…',
    usage: 'Touchez le nom d’une figure : sa ligne de validation, celle d’annulation, son bilan ici.',
    calcul: 'Seize figures cherchées avec des règles fixes, sur les périodes terminées. Le site compte aussi combien sont allées au bout.' },
  guide_suite: { quoi: 'Le repère suivant, si le prix franchit le premier.',
    usage: 'Touchez un repère : « si le prix finit au-delà, le repère suivant est … ». Une condition, pas une prévision.',
    calcul: 'Le repère suivant est le prochain, plus loin du même côté. Aucun côté n’est jugé plus probable.' },
  scenarios: { quoi: 'Chaque matin, Claude (une IA) écrit trois scénarios pour la journée, classés sans pourcentage.',
    usage: 'Regardez le scénario n° 1 et sa zone. La ligne du haut dit ce qui a changé depuis le matin.',
    calcul: P => 'Le matin à ' + pointMots(P) + ', Claude lit le marché et écrit. Ensuite, le site regarde seulement si le prix touche les zones.' },
  bougies: { quoi: 'Chaque petit bâton résume une période : début, plus haut, plus bas et fin.',
    usage: 'Couleur de la hausse : fin plus haute que le début ; de la baisse : plus basse. Les traits fins montrent les extrêmes.',
    calcul: 'Le site lit ces quatre prix chez Binance, période par période.' },
};
/** Un texte court lu à l'ouverture (fonction de PARAM ou chaîne). */
const courtTexte = t => typeof t === 'function' ? (typeof PARAM !== 'undefined' ? t(PARAM) : '') : (t || '');
// L'usage des traders d'une fiche : sa ligne courte, relue à chaque ouverture (elle peut lire PARAM).
for (const k of Object.keys(COURT)) if (FICHES[k] && COURT[k].traders) {
  const t = COURT[k].traders;
  Object.defineProperty(FICHES[k], 'traders', { get: () => courtTexte(t), enumerable: true, configurable: true });
}

// ─── Le calcul en détail (sous « En savoir plus ») ──────────────────────────────
// Indicateur de la page : sa formule précise, construite avec PARAM (les nombres du calcul) ; c'est
// AUSSI la `formule` de sa fiche (une seule version). Champ du fichier : le calcul en mots, avec les
// paramètres publiés (meta.champs : fenêtre, tranche, échéances) lus à l'affichage ; sa formule
// exacte, publiée, suit. Aucun nombre avec unité écrit en dur ici (tests/test_fiches.js).
const CALCUL = {
  // ── Indicateurs du graphique ──
  rsi: P => 'Moyennes des hausses et des baisses de clôture, lissées « à la Wilder » sur ' + P.rsi.periode + ' bougies (poids 1/' + P.rsi.periode + '). RSI = 100 − 100 / (1 + hausses / baisses) ; 50 : hausses et baisses égales.',
  ema: () => 'EMA N : poids k = 2 / (N + 1), amorcée par la moyenne simple des N premières clôtures, puis eₜ = k·cₜ + (1 − k)·eₜ₋₁. SMA N : moyenne des N dernières clôtures. N est dans le nom.',
  bb: P => 'Milieu : moyenne simple des ' + P.bb.periode + ' dernières clôtures. Bandes : milieu ± ' + P.bb.ecarts + ' écarts-types de ces clôtures.',
  vwap: P => 'Σ (prix typique × volume) / Σ volume, prix typique = (H + B + C) / 3. Remis à zéro toutes les ' + (P.vwap.ancrageIntradayS / 3600) + ' h, à ' + minuitUtcMots() + ', en intraday ; sinon toutes les ' + P.vwap.ancrageBougies + ' bougies.',
  ichimoku: P => 'Tenkan = (plus haut + plus bas) / 2 sur ' + P.ichimoku.tenkan + ' bougies ; kijun : idem sur ' + P.ichimoku.kijun + '. Nuage : A = (tenkan + kijun) / 2, B = milieu sur ' + P.ichimoku.senkouB
    + ', reportés de ' + P.ichimoku.kijun + ' bougies vers la droite. Couleur des bougies haussières si A ≥ B, des baissières sinon. Ni nuage projeté au-delà de la dernière bougie, ni chikou.',
  sar: P => 'SAR de Wilder (comme ta.sar de TradingView) : SARₜ = SARₜ₋₁ + AF × (EP − SARₜ₋₁), EP = extrême du mouvement. AF part de ' + nbF(P.sar.pas) + ', + ' + nbF(P.sar.pas) + ' à chaque nouvel extrême, plafonné à ' + nbF(P.sar.max) + '.',
  volume: () => 'Volume publié par Binance, dans l’actif de base de la paire (des BTC pour BTC/USDT, des SOL pour SOL/USDT ; BTC/SOL reprend BTC/USDT). Couleur de hausse si clôture ≥ ouverture.',
  macd: P => 'MACD = EMA ' + P.macd.rapide + ' − EMA ' + P.macd.lente + ' des clôtures ; signal = EMA ' + P.macd.signal + ' du MACD ; histogramme = MACD − signal.',
  stoch: P => '%K = (C − plus bas ' + P.stoch.k + ') / (plus haut ' + P.stoch.k + ' − plus bas ' + P.stoch.k + ') × 100, non lissé ; %D = moyenne de ' + P.stoch.d + ' %K. La version « lente » 14,3,3 lisse aussi %K.',
  atr: P => 'Vrai range = max(H − B, |H − C₋₁|, |B − C₋₁|) : les trous entre bougies comptent. ATR : sa moyenne de Wilder sur ' + P.atr.periode + ' bougies.',
  obv: () => 'OBVₜ = OBVₜ₋₁ + volume si la clôture monte, − volume si elle baisse, inchangé sinon. Part de 0 à la première bougie chargée.',
  mfi: P => 'Flux = prix typique (H + B + C) / 3 × volume. Sur ' + P.mfi.periode + ' bougies : positif si le prix typique dépasse celui de la bougie précédente, négatif s’il est plus bas. MFI = 100 − 100 / (1 + positifs / négatifs).',
  williamsR: P => '%R = (plus haut ' + P.williamsR.periode + ' − clôture) / (plus haut ' + P.williamsR.periode + ' − plus bas ' + P.williamsR.periode + ') × −100.',
  cci: P => 'Prix typique = (H + B + C) / 3 ; CCI = (prix typique − sa moyenne sur ' + P.cci.periode + ') / (0,015 × écart moyen absolu sur ' + P.cci.periode + '). Le 0,015 garde la plupart des valeurs entre −100 et +100.',
  adx: P => 'DM+, DM− et vrai range lissés par Wilder sur ' + P.adx.periode + ' ; DX = |DI+ − DI−| / (DI+ + DI−) × 100 ; ADX = DX lissé par Wilder (première valeur à 2 × ' + P.adx.periode + ' − 1).',
  ao: P => 'Milieu = (H + B) / 2 ; AO = moyenne simple ' + P.ao.rapide + ' du milieu − moyenne simple ' + P.ao.lente + ' du milieu.',
  sr: P => 'Pivots (sommet ou creux qui dépasse ses voisins) des ' + P.sr.bougies + ' dernières bougies, regroupés à ' + pcF(P.sr.tolMin) + ' – ' + pcF(P.sr.tolMax) + ' % près (selon l’ATR ' + P.sr.atrPeriode + '). Score : récence (poids divisé par deux '
    + demiVieMots(P) + ') × logarithme de leur volume. ' + P.sr.niveauxTf + ' niveaux de l’intervalle affiché + ' + P.sr.niveauxRef + ' par intervalle de référence, fusionnés à ' + pcF(P.sr.fusionTf) + ' %.',
  fib: P => 'Plus haut et plus bas des bougies visibles ; niveaux ' + P.fib.niveaux.map(x => pcF(x) + ' %').join(', ') + '. Mesurés depuis le haut si la dernière clôture visible dépasse la première, sinon depuis le bas.',
  vp: P => 'Prix de la vue en tranches (environ ' + P.vp.dollarsParTranche + ' $, entre ' + P.vp.tranchesMin + ' et ' + P.vp.tranchesMax + ' tranches). Chaque bougie visible ajoute son volume entre son bas et son haut. POC : la tranche la plus chargée. Zone de valeur : jusqu’à '
    + pcF(P.vp.zoneValeur) + ' % du total.',
  fourchette: P => { const F = P.guide.fourchette;
    return 'Périodes de ' + F.heures + ' h alignées sur l’heure UTC, refaites avec les bougies déjà chargées quand l’intervalle divise la période. Haut et bas : extrêmes des ' + F.periodes
      + ' périodes closes avant celle en cours. Cassure : une période close finit sous le bas (ou au-dessus du haut) de la fourchette des ' + F.periodes + ' périodes d’avant elle, '
      + 'la précédente ayant fini dans la sienne ; sans filtre de volume. Dite dans « En résumé » pendant les ' + F.phrasePeriodes + ' périodes suivantes, tant qu’aucune n’a fini de nouveau dedans.'; },
  liq: () => grilleLiq().pas + ', le serveur additionne les BTC posés dans le carnet Binance, par tranche de prix' + (grilleLiq().dp ? ' de ' + nbF(grilleLiq().dp) + ' $' : '') + '. Publié toutes les ' + CADENCES.attendue_min + ' min ; en Complet, l’âge de la dernière colonne est écrit en haut à droite. BTC/USDT seulement.',
  // ── Champs du fichier ──
  gex: () => 'Pour chaque option Deribit ouverte : variation de sa couverture pour ' + (prmMeta('micro.gex_usd_1pct', 'mouvement_pct') !== null ? nbF(prmMeta('micro.gex_usd_1pct', 'mouvement_pct')) + ' %' : 'un petit mouvement') + ' de prix (le « gamma ») × contrats ouverts. Calls en positif, puts en négatif (hypothèse). En dollars.',
  ls: 'Comptes Binance nets acheteurs divisés par comptes nets vendeurs, sur le perpétuel BTC. Un point par heure.',
  top_ls: 'Positions acheteuses des plus gros comptes Binance divisées par leurs positions vendeuses, perpétuel BTC. Un point par heure.',
  taker: 'Volume acheté au marché divisé par volume vendu au marché, perpétuel BTC de Binance, dernière heure publiée.',
  funding: () => 'Fixé par Binance d’après l’écart entre perpétuel et spot, réglé ' + echeancesMots() + '. Taux de la prochaine échéance, en %.',
  oi: () => 'Contrats perpétuels BTC ouverts sur Binance. Variation : écart en % entre le dernier point horaire et celui d’il y a ' + (heuresMeta('micro.oi_change_24h_pct') || 'une journée') + '.',
  cvd: () => { const m = prmMeta('micro.cvd_24h_usd', 'intervalle_min'), f = ['micro.cvd_1h_usd', 'micro.cvd_4h_usd', 'micro.cvd_24h_usd'].map(c => heuresMeta(c)).filter(Boolean);
    return 'Pour chaque bougie ' + (m !== null ? 'de ' + nbF(m) + ' min ' : '') + 'du spot Binance : achats au marché − ventes au marché, en dollars. Additionnés sur la fenêtre' + (f.length ? ' (' + f.join(', ').replace(/, ([^,]*)$/, ' ou $1') + ')' : '') + '.'; },
  prime: '(Milieu Coinbase en dollars − milieu Binance en USDT) / prix Binance, en %. La version « hors USDT » convertit d’abord l’USDT en dollars.',
  dxy: 'Moyenne pondérée du dollar face à six devises : l’euro (plus de la moitié), le yen, la livre, le dollar canadien, la couronne suédoise, le franc suisse. Via Yahoo Finance.',
  vix: 'Calculé par la bourse de Chicago d’après les options sur le S&P 500 : la volatilité annuelle qu’elles supposent pour le mois, en %. Via Yahoo Finance.',
  carnet: () => { const md = typeof marketData !== 'undefined' ? marketData : null, b = md && md.liquidity ? md.liquidity.bande_ref_pct : null;
    return 'BTC posés à l’achat divisés par BTC posés à la vente, dans la bande de référence'
      + (typeof b === 'number' && isFinite(b) ? ' (±' + nbF(b) + ' %)' : '') + ' du carnet Binance. Si le carnet reçu ne la couvre pas des deux côtés : la plus étroite publiée.'; },
  murs: () => { const t = prmMeta('liquidity.bid_walls', 'tranche_usd'), n = prmMeta('liquidity.bid_walls', 'n');
    return 'Carnet Binance découpé en tranches' + (t !== null ? ' de ' + nbF(t) + ' $' : '') + ', quantités additionnées. Les murs : les ' + (n !== null ? nbF(n) + ' ' : '') + 'tranches les plus chargées de chaque côté.'; },
  rsi_tf: () => 'Le RSI du graphique (Wilder, ' + bougiesMeta('tf.*.rsi_14', 'periode', 'période publiée par le fichier') + '), calculé par le serveur sur chaque échelle de temps, bougie en cours comprise.',
  ema_tf: () => { const a = prmMeta('tf.*.ema20', 'periode'), b = prmMeta('tf.*.ema50', 'periode');
    return 'Moyennes exponentielles des clôtures' + (a !== null && b !== null ? ' sur ' + nbF(a) + ' et ' + nbF(b) + ' bougies' : ', courte et longue,') + ' de chaque échelle de temps, bougie en cours comprise.'; },
  croisement: () => { const a = prmMeta('tf.*.ema20_sous_ema50', 'courte'), b = prmMeta('tf.*.ema20_sous_ema50', 'longue');
    return 'Vrai si la moyenne exponentielle ' + (a !== null && b !== null ? nbF(a) + ' est sous la ' + nbF(b) : 'courte est sous la longue') + ', à la publication.'; },
  sr_tf: () => 'Plus bas et plus haut des ' + dernieresMeta('tf.*.support_30', 'bougies') + ', bougie en cours comprise.',
  amplitude: () => '(Plus haut − plus bas) des ' + dernieresMeta('tf.*.amplitude_30_pct', 'bougies') + ', divisé par le plus bas, en %.',
  atr_tf: () => 'L’ATR du graphique (vrai range lissé sur ' + bougiesMeta('tf.*.atr_14', 'periode', 'la période publiée par le fichier') + '), calculé par le serveur sur chaque échelle de temps.',
  volume_tf: () => 'Volume moyen en BTC des ' + dernieresMeta('tf.*.volume_moyen_10_btc', 'bougies') + ', bougie en cours comprise.',
};
for (const k of Object.keys(CALCUL)) if (FICHES[k]) {
  FICHES[k].calcul = CALCUL[k];
  // Indicateur de la page : le calcul en détail EST sa formule (relue avec PARAM).
  if (FICHES[k].page && !FICHES[k].formule) FICHES[k].formule = typeof CALCUL[k] === 'function' ? CALCUL[k] : () => CALCUL[k];
}
/** « Le calcul en détail », en mots : construit avec PARAM pour un indicateur de la page. */
function calculTexte(f) {
  if (!f || !f.calcul) return '';
  return typeof f.calcul === 'function' ? (typeof PARAM !== 'undefined' ? f.calcul(PARAM) : '') : f.calcul;
}

function metaDe(cle) {
  const md = typeof marketData !== 'undefined' ? marketData : null;
  return md && md.meta && md.meta.champs ? md.meta.champs[cle] || null : null;
}
/** Valeur(s) courante(s) du champ dans le fichier : une par TF pour les champs `tf.*`. */
function valeursDe(cle) {
  const md = typeof marketData !== 'undefined' ? marketData : null;
  if (!md || !cle) return [];
  const [bloc, ...rest] = cle.split('.');
  if (bloc === 'tf') return ['4h', '1h', '1d'].filter(t => md.tf && md.tf[t]).map(t => [t, md.tf[t][rest[1]]]);
  let v = md[bloc];
  for (const k of rest) v = v && v[k];
  return [['', v]];
}
function fmtValF(v) {
  if (v === undefined || v === null) return '—';
  if (typeof v === 'boolean') return v ? 'oui' : 'non';
  if (typeof v === 'number') return Math.abs(v) >= 1e6 ? Fmt.compact(v, 1) : Fmt.nombre(v, decUtiles(v, Math.abs(v) < 1 ? 4 : 2));
  if (Array.isArray(v)) return v.slice(0, 3).map(x => Array.isArray(x) ? fmtValF(x[0]) + ' : ' + fmtValF(x[1]) : fmtValF(x)).join(' · ');
  return String(v);
}

/** La fiche, en HTML, la même pour tout le monde (un seul écran). D'abord trois lignes courtes
 *  (COURT) : ce que c'est (en gras), comment les traders s'en servent (ou comment s'en servir),
 *  comment c'est calculé. Puis « En savoir plus », replié, qui n'ajoute que du NEUF : la valeur
 *  publiée, le nom technique, ce que montre l'écran (Guide, scénarios), les lectures, le débat, les
 *  limites et le calcul en détail (formule). Rien n'y redit les lignes courtes. */
function ficheHtml(id) {
  const f = FICHES[id];
  if (!f) return '';
  const m = f.champ ? metaDe(f.champ) : null;
  const P = typeof PARAM !== 'undefined' ? PARAM : null;
  const c = COURT[id] || {};
  // Nature : celle que publie le producteur (champ du fichier), sinon celle que la fiche déclare
  // (la forme des bougies est une convention), sinon « mesuré » pour un calcul de la page.
  const nature = m ? m.nature : (f.nature || (f.page ? 'mesure' : null));
  const titre = echapF(f.titreDeb || f.titre);
  const quoi = courtTexte(c.quoi) || f.simpleDeb || f.simple;
  let h = '<div class="fiche-tete"><h3 class="fiche-titre">' + titre + '</h3>'
    + (nature ? '<span class="fiche-nature nature-' + echapF(nature) + '">' + echapF(NATURES_DEB[nature] || NATURES[nature] || nature) + '</span>' : '')
    + '<button type="button" class="fiche-fermer" onclick="fermerFiche()" aria-label="Fermer">×</button></div>'
    + '<p class="fiche-simple fiche-quoi"><b>' + echapF(quoi) + '</b></p>';
  // État du moment dérivé du code (ex. la forme de bougie du thème courant) : même HTML dans les deux modes.
  const etat = f.etat ? f.etat() : null;
  if (etat) h += '<p class="fiche-valeur">' + echapF(etat) + '</p>';
  const traders = courtTexte(c.traders), usage = courtTexte(c.usage), calculCourt = courtTexte(c.calcul);
  if (traders) h += '<h4>Comment les traders l’utilisent</h4><p class="fiche-usage">' + echapF(traders) + '</p>';
  else if (usage) h += '<h4>Comment s’en servir</h4><p class="fiche-usage">' + echapF(usage) + '</p>';
  if (calculCourt) h += '<h4>Comment c’est calculé</h4><p class="fiche-calcul">' + echapF(calculCourt) + '</p>';
  // La valeur publiée, avec son unité et son échelle de temps telles que le fichier les nomme, et
  // son âge (un chiffre vieux de 40 min ne se lit pas comme un chiffre frais).
  let valeur = '';
  if (f.champ) {
    const vals = valeursDe(f.champ);
    const md = typeof marketData !== 'undefined' ? marketData : null;
    const age = md && md.updated ? Math.max(0, Math.round((Date.now() - Date.parse(md.updated)) / 60000)) : null;
    if (vals.length) valeur = vals.map(([t, v]) => (t ? '<span class="fiche-tf">' + t + '</span> ' : '') + '<b>' + echapF(fmtValF(v)) + '</b>').join(' · ')
      + (m && m.unite ? ' <span class="fiche-unite">' + echapF(m.unite) + '</span>' : '')
      + (age !== null ? ' <span class="fiche-age">· publié il y a ' + age + ' min</span>' : '');
  }
  // « En savoir plus » : seulement ce que les lignes courtes ne disent pas.
  h += '<details class="fiche-plus"><summary>En savoir plus</summary>';
  if (f.champ) {
    if (m && m.nom_trompeur) h += '<p class="fiche-alerte">Nom trompeur : ' + echapF(m.nom_trompeur) + '</p>';
    // Les dernières heures de ce champ, publication par publication (js/chronique.js), en tête du
    // détail ; absente tant qu'aucun historique n'est lu.
    if (typeof chroniqueFiche === 'function') h += chroniqueFiche(f.champ, id);
  }
  const entiers = [];
  if (valeur) entiers.push('<p class="fiche-valeur">' + valeur + '</p>');
  if (f.titreDeb && f.titreDeb !== f.titre) entiers.push('<p class="fiche-simple"><b>' + echapF(f.titre) + '</b></p>');
  // Guide : ce que montre l'écran sans « Le détail » (le badge, les chemins…).
  if (f.simpleDeb && f.page === 'guide') entiers.push('<p class="fiche-simple">' + echapF(f.simpleDeb) + '</p>');
  if (f.usage && typeof f.usage === 'object' && f.usage.exp) entiers.push('<p class="fiche-usage">' + echapF(f.usage.exp) + '</p>');
  if (entiers.length) h += '<div class="fiche-entiers">' + entiers.join('') + '</div>';
  h += '<h4>À savoir</h4><ul class="fiche-lectures">' + f.lectures.map(l =>
    // Une lecture propre à un mode (mode : 'debutant' | 'expert') : même HTML, seule sa classe change.
    '<li' + (l.mode === 'debutant' || l.mode === 'expert' ? ' class="' + l.mode + '-seul"' : '') + '><span class="statut statut-' + echapF(l.s) + '">' + echapF(STATUTS_DEB[l.s] || STATUTS[l.s] || l.s) + '</span> ' + echapF(l.t) + '</li>').join('') + '</ul>';
  if (f.debat) h += '<div class="fiche-debat"><b>La littérature se contredit.</b> ' + echapF(f.debat) + '</div>';
  if (f.limites) h += '<p class="fiche-limites"><b>Ce que ça ne dit pas :</b> ' + echapF(f.limites) + '</p>';
  // Le calcul en détail. La formule d'un champ n'est JAMAIS écrite ici à la main : elle est publiée.
  let formule, details = [], mots = '';
  if (f.champ) {
    mots = calculTexte(f);
    if (m) {
      formule = 'Formule publiée : ' + m.formule;
      details = [['Unité', m.unite], ['Fenêtre', m.fenetre], ['Source', m.source], ['Champ', f.champ.replace('.*.', '.<TF>.')]];
      if (m.alias_de) details.push(['Alias de', m.alias_de]);
      if (m.params && m.params.poids_amorce_pct !== undefined) details.push(['Poids résiduel de l’amorce', m.params.poids_amorce_pct + ' %']);
    } else formule = 'Description non publiée par ce fichier (producteur antérieur au 06/10/2026).';
  } else if (f.formule) formule = P ? f.formule(P) : '—';
  h += '<div class="fiche-technique"><h4>Le calcul en détail</h4>' + (mots ? '<p>' + echapF(mots) + '</p>' : '') + '<p>' + echapF(formule)
    + '</p>' + (details.length ? '<dl>' + details.filter(d => d[1] !== undefined && d[1] !== null).map(([k, v]) => '<dt>' + echapF(k) + '</dt><dd>' + echapF(v) + '</dd>').join('') + '</dl>' : '')
    + '</div>'
    + '</details>'
    + '<p class="fiche-pied">Une description, pas un conseil.</p>';
  return h;
}

// ─── Ouverture, glossaire ─────────────────────────────────────────────────────
let ficheOuverte = null, ficheRetour = null;
function ouvrirFiche(id, ancre) {
  const p = document.getElementById('fichePop');
  if (!p || !FICHES[id]) return;
  p.innerHTML = ficheHtml(id);
  p.setAttribute('aria-label', 'Légende');
  // « En savoir plus » : replié sur l'écran calme, ouvert avec « Le détail » (qui veut tout voir).
  const plus = p.querySelector('.fiche-plus');
  if (plus) plus.open = detailAllume();
  p.hidden = false;
  ficheOuverte = id; ficheRetour = ancre || null;
  // Bureau : près du bouton ; téléphone : en bas de l'écran (CSS).
  if (ancre && ancre.getBoundingClientRect && window.innerWidth > 768) {
    const r = ancre.getBoundingClientRect(), w = Math.min(420, window.innerWidth - 24);
    p.style.left = Math.max(12, Math.min(window.innerWidth - w - 12, r.left - w / 2)) + 'px';
    // Sous le bouton s'il y a la place, sinon au-dessus, sinon calée en bas : jamais coupée.
    const h = p.offsetHeight || 300, bas = window.innerHeight - 12;
    let top = r.bottom + 8;
    if (top + h > bas) top = r.top - h - 8 >= 12 ? r.top - h - 8 : Math.max(12, bas - h);
    p.style.top = top + 'px';
  } else { p.style.left = ''; p.style.top = ''; }
  const b = p.querySelector('.fiche-fermer');
  if (b && b.focus) b.focus();
}
function fermerFiche() {
  const p = document.getElementById('fichePop');
  if (p) { p.hidden = true; p.setAttribute('aria-label', 'Légende'); }
  if (ficheRetour && ficheRetour.focus) ficheRetour.focus();
  ficheOuverte = null; ficheRetour = null;
}
/** Le bouton « i » d'un libellé : il ouvre la fiche. */
function infoBtn(id) {
  const f = FICHES[id];
  if (!f) return '';
  return '<button type="button" class="info-btn" onclick="event.stopPropagation();ouvrirFiche(\'' + id + '\',this)" aria-label="Comment lire : '
    + echapF(f.titre) + '">i</button>';
}
/** Le glossaire : toutes les fiches, ouvert depuis l'en-tête. En Débutant, d'abord ce que
 *  montre SON écran (titres du Débutant) ; les fiches de l'Expert, repliées dessous. Même HTML
 *  dans les deux modes : seules les classes .debutant-seul / .expert-seul changent. */
const GLOSSAIRE_DEBUTANT = ['guide', 'guide_niveaux', 'scenarios', 'bougies', 'sr_tf', 'vix', 'cvd', 'carnet'];
/** Les touches du terminal (js/app.js), dans l'ordre de la légende de la carte : une même touche
 *  veut dire la même chose sur les deux pages (M le mode, ? l'aide de la page, R la vue de départ,
 *  F le présent) ; I ouvre les infos du marché (le terminal seul). */
const RACCOURCIS_TERMINAL = 'Touches : ? cette aide · R revient à la vue de départ · F suit le présent (ici, comme R) · I les infos du marché · T / D le thème.';
function ouvrirGlossaire(ancre) {
  const p = document.getElementById('fichePop');
  if (!p) return;
  const groupes = [['Positionnement et dérivés', ['gex', 'ls', 'top_ls', 'taker', 'funding', 'oi', 'cvd', 'prime']],
    ['Macro', ['dxy', 'vix']], ['Carnet', ['carnet', 'murs']],
    ['Indicateurs du fichier', ['rsi_tf', 'ema_tf', 'croisement', 'sr_tf', 'amplitude', 'atr_tf', 'volume_tf']],
    ['Le dessin du graphique', ['bougies']],
    ['Guide et scénarios du matin', ['guide', 'guide_niveaux', 'guide_regime', 'guide_formes', 'guide_suite', 'scenarios']],
    ['Indicateurs du graphique', ['rsi', 'ema', 'vwap', 'adx', 'atr', 'volume', 'sr', 'bb', 'macd', 'stoch', 'ichimoku', 'sar', 'obv', 'mfi', 'williamsR', 'cci', 'ao', 'fib', 'vp', 'liq', 'fourchette']]];
  const bouton = (i, t) => '<button type="button" class="glossaire-item" onclick="ouvrirFiche(\'' + i + '\')">' + echapF(t) + '</button>';
  const tous = groupes.map(([g, ids]) => '<h4>' + g + '</h4><div class="glossaire">' + ids.map(i => bouton(i, FICHES[i].titre)).join('') + '</div>').join('');
  p.innerHTML = '<div class="fiche-tete"><h3 class="fiche-titre">Légendes</h3><button type="button" class="fiche-fermer" onclick="fermerFiche()" aria-label="Fermer">×</button></div>'
    + '<p class="fiche-simple">Comment lire chaque chiffre, et ce qu’il ne dit pas.</p>'
    // Les touches : les mêmes que sur la carte (?, R, F), en une ligne.
    + '<p class="fiche-touches">' + RACCOURCIS_TERMINAL + '</p>'
    + '<h4>Ce que montre l’écran</h4><div class="glossaire">' + GLOSSAIRE_DEBUTANT.map(i => bouton(i, FICHES[i].titreDeb || FICHES[i].titre)).join('') + '</div>'
    + '<details class="glossaire-plus"><summary>Toutes les fiches ▸</summary>' + tous + '</details>';
  p.setAttribute('aria-label', 'Légende');
  p.hidden = false;
  p.style.left = ''; p.style.top = '';
  ficheOuverte = 'glossaire'; ficheRetour = ancre || null;
}
document.addEventListener('keydown', e => { if (e.key === 'Escape' && ficheOuverte) fermerFiche(); });
// Un clic hors de la bulle la ferme. « Dedans » se lit sur le CHEMIN du clic (composedPath, fixé au
// départ du clic) et non sur sa cible seule : un bouton de la bulle qui en change le contenu
// (un titre du glossaire qui ouvre sa fiche, « Retirer » un palier de la calculette) est détaché
// avant que le clic arrive ici — p.contains(cible) disait alors « dehors » et la bulle se refermait
// aussitôt (mesuré le 13/10/2026 sur le glossaire, à 1440 et 390 px).
document.addEventListener('click', e => {
  const p = document.getElementById('fichePop');
  if (!ficheOuverte || !p) return;
  const chemin = typeof e.composedPath === 'function' ? e.composedPath() : [];
  const dedans = chemin.includes(p) || p.contains(e.target);
  if (!dedans && !(e.target.closest && e.target.closest('.info-btn, #legendesBtn'))) fermerFiche();
});

// ─── Lecture courte : ce que dit la valeur DU MOMENT, en mots, sans conseil ────────────────
// Les seuils utilisés ici sont des CONVENTIONS ; la phrase le dit quand c'en est une.
// lectureCourte : la phrase d'un bloc de chiffres, toujours (avec les chiffres du marché, à côté
// des chiffres, plus discrète) ; le bloc qui la porte (envExpert / envDebutant) dit où elle se voit.
// phraseCarte : les phrases propres aux cartes sans les chiffres du marché.
/** Les phrases des cartes en mode Débutant (sans jargon, sans seuil inventé) : le même bloc que
 *  lectureCourte, pour des cartes qui n'ont pas de fiche. cle : 'fourchette' (v : position dans
 *  la fourchette, de 0 au plus bas à 1 au plus haut ; v2 : « 24 h » ou « 5 jours » ; sujet : « le
 *  prix », ou « le bitcoin » sur une autre paire), 'vix',
 *  'cvd' (v : écart achats − ventes en $), 'sources' (v : à jour, v2 : attendues). */
function phraseCarte(cle, v, v2, sujet) {
  const n = x => typeof x === 'number' && isFinite(x);
  // Un montant se lit arrondi : « 3,4 millions $ », « 1,2 milliard $ » ; sous un million, en dollars entiers.
  const fr = (x, d) => Fmt.nombre(x, decUtiles(x, d));
  const dollars = x => {
    const a = Math.abs(x);
    if (a >= 1e9) { const m = Math.round(a / 1e8) / 10; return fr(m, 1) + (m >= 2 ? ' milliards $' : ' milliard $'); }
    if (a >= 1e6) { const m = Math.round(a / 1e5) / 10; return fr(m, 1) + (m >= 2 ? ' millions $' : ' million $'); }
    return fr(Math.round(a), 0) + ' $';
  };
  let t = null;
  switch (cle) {
    case 'fourchette': if (n(v)) t = 'Sur ' + (v2 || '24 h') + ', ' + (sujet || 'le prix') + ' est ' + (v >= 2 / 3 ? 'dans le haut' : v <= 1 / 3 ? 'dans le bas' : 'au milieu') + ' de sa fourchette.'; break;
    case 'vix': if (n(v)) t = phraseVix(v); break;
    case 'cvd': if (n(v)) t = v >= 0 ? 'Sur 24 h, les achats immédiats ont dépassé les ventes immédiates de ' + dollars(v) + '.' : 'Sur 24 h, les ventes immédiates ont dépassé les achats immédiats de ' + dollars(v) + '.'; break;
    // Elle compte les blocs de la DERNIÈRE publication (status), pas des sources ni leur âge
    // (le bandeau d'âge le dit) : « Toutes les données publiées sont arrivées » se lisait au-dessus
    // de « Données figées depuis 45 min ».
    case 'sources': if (n(v) && n(v2)) t = v >= v2 ? 'La dernière publication est complète.' : (v2 - v) + (v2 - v > 1 ? ' infos manquent' : ' info manque') + ' dans la dernière publication (détail en mode Complet).'; break;
    default: t = null;
  }
  return t ? '<div class="lecture-courte sans-chiffres">' + echapF(t) + '</div>' : '';
}

/** Le VIX en mots du Débutant : UNE phrase pour les mêmes repères (sous 15, au-dessus de 25), dans
 *  la carte (phraseCarte) comme dans la lecture courte. */
function phraseVix(v) {
  return v < 15 ? 'Les bourses américaines sont calmes.' : v > 25 ? 'Les bourses américaines sont nerveuses.' : 'Les bourses américaines ne sont ni calmes ni nerveuses.';
}
function lectureCourte(id, v, v2) {
  const n = x => typeof x === 'number' && isFinite(x);
  const r2 = x => Math.round(x * 100) / 100;   // un ratio comme il s'affiche (« 1,00 »)
  const pct = x => Fmt.pct(x, 1);               // la précision du chiffre clé et de la carte (OI Δ24h, 1 décimale)
  let t = null;
  switch (id) {
    case 'funding': if (n(v)) t = v > 0 ? 'Les acheteurs à levier paient les vendeurs.' : v < 0 ? 'Les vendeurs à découvert paient les acheteurs.' : 'Aucun paiement entre acheteurs et vendeurs.'; break;
    case 'oi': if (n(v)) t = v > 0 ? 'Plus de positions à levier ouvertes qu’il y a 24 h (' + pct(v) + ').' : v < 0 ? 'Moins de positions à levier ouvertes qu’il y a 24 h (' + pct(v) + ').' : 'Autant de positions à levier ouvertes qu’il y a 24 h.'; break;
    // Le ratio jugé tel qu'il s'affiche (2 décimales) : à 1,00, ni plus d'acheteurs ni plus de
    // vendeurs (la phrase disait « plus de vendeurs » à 1 exactement).
    case 'ls': if (n(v)) t = (r2(v) > 1 ? 'Plus de comptes acheteurs que vendeurs' : r2(v) < 1 ? 'Plus de comptes vendeurs qu’acheteurs' : 'Autant de comptes acheteurs que vendeurs') + ' — des comptes, pas des montants.'; break;
    case 'cvd': if (n(v)) t = v > 0 ? 'Sur 24 h, les achats au marché ont dominé.' : 'Sur 24 h, les ventes au marché ont dominé.'; break;
    case 'gex': if (n(v)) t = v > 0 ? 'Régime « long gamma » selon la convention ; lecture usuelle : mouvements amortis.' : 'Régime « short gamma » selon la convention ; lecture usuelle : mouvements amplifiés.'; break;
    case 'rsi_tf': if (n(v)) t = v >= 70 ? '« Suracheté » (au-dessus de 70) : la hausse récente a été forte.' : v <= 30 ? '« Survendu » (sous 30) : la baisse récente a été forte.' : 'Zone neutre (entre 30 et 70).'; break;
    case 'vix': if (n(v)) t = phraseVix(v); break;
    case 'prime': {
      const x = n(v2) ? v2 : v, seuil = prmMeta('micro.premium_state', 'seuil_pct');
      if (n(x)) t = (seuil !== null ? Math.abs(x) < seuil : x === 0) ? 'Pas d’écart notable entre Coinbase et Binance' + (n(v2) ? ' une fois l’USDT ramené en dollars.' : '.')
        : (x > 0 ? 'Le BTC est plus cher sur Coinbase que sur Binance (souvent lu comme une demande américaine plus forte).' : 'Le BTC est moins cher sur Coinbase que sur Binance (souvent lu comme une demande américaine plus faible).');
      break;
    }
    case 'carnet': if (n(v)) t = r2(v) > 1 ? 'Plus de BTC posés à l’achat qu’à la vente près du prix.' : r2(v) < 1 ? 'Plus de BTC posés à la vente qu’à l’achat près du prix.' : 'Autant de BTC posés à l’achat qu’à la vente près du prix.'; break;
    default: t = null;
  }
  return t ? '<div class="lecture-courte">' + echapF(t) + '</div>' : '';
}
