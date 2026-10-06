// ═══════════════════════════════════════════════════════════════════════════════
// LÉGENDES — comment chaque indicateur se LIT. Pas quoi en faire.
// ─────────────────────────────────────────────────────────────────────────────
// POURQUOI CE FICHIER EST CONSTRUIT AINSI (06/10/2026)
// Des champs ont déjà menti par leur nom (`range_24h_pct` couvrait 30 bougies, `ema20_4h`
// portait le TF demandé, le menu annonçait un stochastique « 14,3,3 » qui était un 14,3). Une
// légende rédigée à la main à côté du code dérive de la même façon. Donc ici :
//   · la FORMULE, l'unité, la fenêtre et la nature d'un champ du fichier se LISENT dans
//     `meta.champs`, publié par le code serveur qui calcule — jamais écrites ici ;
//   · la formule d'un indicateur de la page est CONSTRUITE avec PARAM (js/app.js), les
//     paramètres mêmes du calcul ;
//   · ce fichier n'apporte que la LECTURE : ce que l'usage en fait, marqué « usuel »,
//     « convention » ou « débattu » — et, quand la littérature se contredit (GEX, L/S), il le
//     dit au lieu de choisir un camp.
// tests/test_fiches.js fait tenir ces règles (champ publié, paramètres réels, aucun conseil).
//
// MODE DÉBUTANT / EXPERT : une CLASSE sur <html>, rien d'autre. Le HTML produit est le même
// dans les deux modes ; seul l'affichage de `.debutant-seul` / `.expert-seul` change. Une
// valeur ne peut donc pas différer d'un mode à l'autre — le harnais le vérifie.
// ═══════════════════════════════════════════════════════════════════════════════

const MODE_CLE = 'samsara-mode';
function modeCourant() {
  try { return localStorage.getItem(MODE_CLE) === 'expert' ? 'expert' : 'debutant'; } catch (e) { return 'debutant'; }
}
function appliquerMode(m) {
  document.documentElement.setAttribute('data-mode', m);
  try { localStorage.setItem(MODE_CLE, m); } catch (e) { /* navigation privée */ }
  const b = document.getElementById('modeBtn');
  if (b) { b.textContent = m === 'expert' ? 'Expert' : 'Débutant'; b.setAttribute('aria-pressed', m === 'expert' ? 'true' : 'false'); }
}
function basculerMode() { appliquerMode(modeCourant() === 'expert' ? 'debutant' : 'expert'); }

// ─── Les fiches ───────────────────────────────────────────────────────────────
// s : 'usuel' (lecture courante), 'convention' (dépend d'une hypothèse ou d'un seuil choisi),
//     'débattu' (la littérature se contredit), 'mesuré' (un fait sur la mesure elle-même).
const FICHES = {
  // ── Positionnement et dérivés (fichier de 15 min) ──
  gex: {
    titre: 'GEX — exposition gamma des dealers', champ: 'micro.gex_usd_1pct',
    simple: 'Estime combien les teneurs de marché d’options devraient acheter ou vendre de BTC pour rester couverts si le prix bouge de 1 %.',
    lectures: [
      { s: 'convention', t: 'GEX positif (« long gamma ») : les dealers vendraient dans les hausses et achèteraient dans les baisses — lecture usuelle : mouvements amortis, prix attiré par les gros strikes.' },
      { s: 'convention', t: 'GEX négatif (« short gamma ») : ils suivraient le mouvement — lecture usuelle : mouvements amplifiés.' },
      { s: 'convention', t: 'Zéro gamma : le prix où le régime basculerait. Murs de calls / de puts : les strikes où la couverture serait la plus forte.' },
    ],
    debat: 'Tout repose sur une HYPOTHÈSE : dealers acheteurs des calls, vendeurs des puts. Sur le marché crypto, une part importante des calls est vendue par des détenteurs de BTC qui cherchent du rendement — les dealers seraient alors ACHETEURS de ces calls, et le signe s’inverserait sur ces strikes. Les fournisseurs de données ne s’accordent pas sur la convention à retenir. Le positionnement réel des dealers n’est pas observable : c’est un modèle, pas une mesure.',
    limites: 'Deribit seulement (ni CME, ni gré à gré). Ne dit ni la direction ni le moment.',
  },
  ls: {
    titre: 'Ratio long / short (comptes)', champ: 'micro.ls_ratio',
    simple: 'Nombre de comptes Binance nets acheteurs divisé par le nombre de comptes nets vendeurs, sur le contrat perpétuel.',
    lectures: [
      { s: 'débattu', t: 'Lecture « contrarienne » : une foule très majoritairement acheteuse est déjà positionnée — si le prix baisse, ses liquidations alimentent la baisse.' },
      { s: 'débattu', t: 'Lecture « de tendance » : un ratio qui monte avec le prix accompagne un mouvement que la foule suit.' },
      { s: 'mesuré', t: 'Un compte = une voix, quelle que soit sa taille : mille petits comptes acheteurs pèsent plus qu’une seule grosse position vendeuse.' },
    ],
    debat: 'Les deux lectures coexistent et se contredisent ; aucune ne fait consensus, et chacune « marche » sur les exemples choisis pour l’illustrer. Le ratio des « top traders » (pondéré par la taille des positions) peut dire l’inverse au même instant.',
    limites: 'Binance seulement ; la définition d’un « compte net acheteur » est celle de Binance.',
  },
  top_ls: {
    titre: 'Ratio long / short des gros traders', champ: 'micro.top_ls_ratio',
    simple: 'Positions acheteuses divisées par positions vendeuses chez les plus gros comptes de Binance — pondéré par la TAILLE, contrairement au ratio des comptes.',
    lectures: [
      { s: 'débattu', t: 'Souvent lu comme le positionnement de « l’argent informé » face à la foule ; rien ne prouve qu’il le soit.' },
      { s: 'mesuré', t: 'Peut diverger du ratio des comptes : la foule et les gros comptes ne sont pas du même côté.' },
    ],
    debat: 'Comme pour le ratio des comptes, les lectures contrarienne et de tendance se contredisent.',
    limites: 'Le périmètre des « top traders » est défini et changé par Binance.',
  },
  taker: {
    titre: 'Ratio acheteurs / vendeurs au marché (perpétuel)', champ: 'micro.taker_ratio',
    simple: 'Volume acheté au marché divisé par volume vendu au marché sur le perpétuel, sur la dernière heure.',
    lectures: [
      { s: 'usuel', t: 'Au-dessus de 1 : les acheteurs pressés (qui prennent la liquidité) dominent ; en dessous : les vendeurs pressés.' },
      { s: 'mesuré', t: 'Mesure l’AGRESSION, pas l’intention : une couverture ou une liquidation forcée compte comme un achat ou une vente au marché.' },
    ],
    limites: 'Perpétuel Binance, dernier point horaire.',
  },
  funding: {
    titre: 'Funding (financement du perpétuel)', champ: 'micro.funding_rate_pct',
    simple: 'Taux échangé toutes les 8 h entre acheteurs et vendeurs du contrat perpétuel pour que son prix colle au spot. Positif : les acheteurs paient les vendeurs.',
    lectures: [
      { s: 'usuel', t: 'Funding nettement positif : positionnement acheteur à levier chargé, et coûteux à tenir.' },
      { s: 'usuel', t: 'Funding négatif : les vendeurs à découvert paient — positionnement vendeur dominant.' },
      { s: 'convention', t: 'Le funding annualisé multiplie le taux du moment par 3 × 365 : il suppose un taux constant toute l’année, ce qui n’arrive jamais.' },
    ],
    limites: 'Binance seulement ; le taux affiché est celui de l’échéance en cours (il peut changer avant le paiement).',
  },
  oi: {
    titre: 'Open interest (contrats ouverts)', champ: 'micro.oi_change_24h_pct',
    simple: 'Nombre de contrats perpétuels ouverts, et sa variation : de l’argent qui entre ou qui sort des positions à levier.',
    lectures: [
      { s: 'usuel', t: 'OI en hausse avec le prix : de nouvelles positions accompagnent le mouvement ; OI en baisse : des positions se ferment (prises de bénéfice, liquidations).' },
      { s: 'mesuré', t: 'Chaque contrat a un acheteur ET un vendeur : une hausse d’OI ne dit pas, à elle seule, quel camp a ouvert.' },
    ],
    limites: 'Binance seulement ; la variation 24 h compare deux points de la série horaire.',
  },
  cvd: {
    titre: 'CVD — delta cumulé des volumes', champ: 'micro.cvd_1h_usd',
    simple: 'Achats au marché moins ventes au marché, en dollars, sur une fenêtre : qui a été le plus pressé.',
    lectures: [
      { s: 'mesuré', t: 'Positif : les achats au marché ont dominé sur la fenêtre ; négatif : les ventes.' },
      { s: 'usuel', t: 'Divergence (le prix monte quand le CVD baisse) : lecture usuelle — la hausse est portée par des ordres passifs, ou des ventes sont absorbées.' },
    ],
    limites: 'Spot Binance seulement. Un gros ordre limite qui absorbe les ventes n’apparaît pas dans le CVD. Agression ≠ intention.',
  },
  prime: {
    titre: 'Prime Coinbase', champ: 'micro.premium_pct',
    simple: 'Écart de prix entre Coinbase (bourse américaine, en dollars) et Binance (en USDT).',
    lectures: [
      { s: 'usuel', t: 'Prime positive : la demande est plus forte sur la plateforme américaine — souvent lue comme une demande institutionnelle US.' },
      { s: 'mesuré', t: 'La prime usuelle compare des DOLLARS à des TETHERS : un USDT à 0,9997 $ crée à lui seul +0,03 %. La prime « hors USDT » compare des dollars à des dollars.' },
      { s: 'convention', t: 'Les états POSITIVE / NEGATIVE / EXTREME sont des seuils choisis par ce code, pas une norme de marché.' },
    ],
    limites: 'Deux carnets lus à quelques millisecondes d’écart ; écarts de l’ordre de 0,01 % : du bruit.',
  },
  // ── Macro (fichier de 15 min, sources différées) ──
  dxy: {
    titre: 'DXY — indice du dollar', champ: 'macro.dxy_spot',
    simple: 'Valeur du dollar face à six devises (l’euro y pèse environ 58 %).',
    lectures: [
      { s: 'débattu', t: 'Lecture usuelle : un dollar qui se renforce pèse sur les actifs risqués, dont le BTC. La corrélation varie beaucoup selon les périodes et s’inverse parfois.' },
    ],
    debat: 'La relation dollar / BTC n’est pas stable : selon la fenêtre étudiée, la corrélation mesurée change de signe.',
    limites: 'Dernière clôture journalière d’un jour ouvré, différée ; marché fermé le week-end.',
  },
  vix: {
    titre: 'VIX — volatilité implicite du S&P 500', champ: 'macro.vix',
    simple: 'La volatilité que les options sur les actions américaines anticipent pour les 30 prochains jours — l’« indice de la peur ».',
    lectures: [
      { s: 'convention', t: 'Repères courants : sous 15, marché calme ; au-dessus de 25–30, stress. Ce sont des habitudes, pas des seuils théoriques.' },
      { s: 'débattu', t: 'Un VIX qui bondit accompagne souvent une baisse des actifs risqués, BTC compris ; le lien n’est pas systématique.' },
    ],
    limites: 'Actions américaines, pas crypto ; mis à jour aux heures de séance US, différé.',
  },
  // ── Carnet (fichier de 15 min) ──
  carnet: {
    titre: 'Ratio bid / ask du carnet', champ: 'liquidity.ratio_bid_ask',
    simple: 'BTC posés à l’achat divisés par BTC posés à la vente, dans une bande de prix autour du milieu du carnet.',
    lectures: [
      { s: 'mesuré', t: 'Au-dessus de 1 : plus d’ordres d’achat posés près du prix que d’ordres de vente.' },
      { s: 'débattu', t: 'Le lire comme une « pression » acheteuse est discuté : un ordre posé peut être retiré avant d’être touché, ou posé pour être vu.' },
    ],
    limites: 'Un instantané du carnet Binance spot à la publication ; une bande n’est publiée que si le carnet reçu la couvre.',
  },
  murs: {
    titre: 'Murs de liquidité', champ: 'liquidity.bid_walls',
    simple: 'Les tranches de prix où le plus de BTC sont posés, à l’achat et à la vente.',
    lectures: [
      { s: 'usuel', t: 'Souvent lus comme des supports (côté achat) ou des résistances (côté vente) potentiels.' },
      { s: 'mesuré', t: 'Un mur peut être retiré à tout moment ; la carte (bookmap.html) montre son histoire, ce chiffre n’en est qu’une photo.' },
    ],
    limites: 'Instantané à la publication, dans la bande couverte par le carnet reçu.',
  },
  // ── Indicateurs du fichier (bloc tf) ──
  rsi_tf: {
    titre: 'RSI (fichier, par échelle de temps)', champ: 'tf.*.rsi_14',
    simple: 'Compare la force des hausses et des baisses récentes, sur une échelle de 0 à 100.',
    lectures: [
      { s: 'convention', t: 'Au-dessus de 70 : « suracheté » ; en dessous de 30 : « survendu ». Ce sont les seuils proposés par Wilder.' },
      { s: 'usuel', t: 'En tendance forte, le RSI peut rester au-dessus de 70 (ou sous 30) longtemps : ce n’est pas, seul, un signal de retournement.' },
    ],
    limites: 'Calculé sur la bougie EN COURS : il bouge jusqu’à sa clôture. Le RSI du graphique est calculé par la page, sur ses propres bougies : même méthode, pas forcément même valeur.',
  },
  ema_tf: {
    titre: 'EMA 20 / EMA 50 (fichier)', champ: 'tf.*.ema20',
    simple: 'Moyennes des clôtures qui donnent plus de poids aux plus récentes ; 20 et 50 bougies de l’échelle de temps de la ligne.',
    lectures: [
      { s: 'usuel', t: 'Prix au-dessus de la moyenne : tendance haussière sur cet horizon ; en dessous : baissière.' },
      { s: 'usuel', t: 'EMA courte au-dessus de la longue : tendance haussière de plus court terme. Un croisement arrive toujours APRÈS le mouvement (retard par construction).' },
    ],
    limites: 'Dépend de la profondeur chargée : voir le poids résiduel de l’amorce en mode expert.',
  },
  croisement: {
    titre: 'EMA 20 sous EMA 50 (ex-« death cross »)', champ: 'tf.*.ema20_sous_ema50',
    simple: 'Dit si la moyenne courte est sous la longue, sur l’échelle de temps de la ligne. C’est un ÉTAT, pas un croisement daté.',
    lectures: [
      { s: 'usuel', t: 'Vrai : la tendance courte est plus faible que la tendance longue sur cet horizon.' },
      { s: 'mesuré', t: 'Le « death cross » de la littérature est le croisement de la SMA 50 sous la SMA 200 en daily. Le champ historique `death_cross_4h` n’était ni l’un ni l’autre — d’où son nouveau nom.' },
    ],
    limites: 'Un état qui peut durer des semaines ; il ne dit pas quand le croisement a eu lieu.',
  },
  sr_tf: {
    titre: 'Support / résistance (fichier)', champ: 'tf.*.support_30',
    simple: 'Le plus bas et le plus haut des dernières bougies de l’échelle de temps.',
    lectures: [
      { s: 'usuel', t: 'Le prix entre les deux : où il se situe dans son canal récent.' },
      { s: 'mesuré', t: 'Ce sont des EXTRÊMES, pas des niveaux testés plusieurs fois : la littérature appelle « support » un niveau où le prix a rebondi à plusieurs reprises.' },
    ],
    limites: 'La fenêtre change avec l’échelle de temps (affichée à côté de la valeur).',
  },
  amplitude: {
    titre: 'Amplitude (fichier)', champ: 'tf.*.amplitude_30_pct',
    simple: 'L’écart entre le plus haut et le plus bas récents, en % du plus bas.',
    lectures: [{ s: 'usuel', t: 'Grande amplitude : marché agité sur la fenêtre ; petite : compression.' }],
    limites: 'Le champ historique s’appelle `range_24h_pct` mais ne couvre jamais 24 h.',
  },
  atr_tf: {
    titre: 'ATR (fichier)', champ: 'tf.*.atr_14',
    simple: 'L’amplitude moyenne d’une bougie, en dollars : l’échelle « normale » du mouvement sur cet horizon.',
    lectures: [
      { s: 'usuel', t: 'Sert couramment d’ÉCHELLE : un mouvement de 2 ATR est inhabituel, une distance d’un demi-ATR est du bruit.' },
      { s: 'mesuré', t: 'Ne dit rien de la direction.' },
    ],
    limites: 'Sa méthode (moyenne de Wilder ou simple) change sa valeur de plusieurs % : voir la formule.',
  },
  volume_tf: {
    titre: 'Volume moyen (fichier)', champ: 'tf.*.volume_moyen_10_btc',
    simple: 'Quantité moyenne de BTC échangée par bougie, sur les dernières bougies.',
    lectures: [{ s: 'usuel', t: 'Un mouvement sur un volume supérieur à la moyenne est généralement jugé plus significatif.' }],
    limites: 'La bougie en cours, incomplète, tire la moyenne vers le bas.',
  },
  // ── Indicateurs calculés par la PAGE (formule construite avec PARAM) ──
  rsi: {
    titre: 'RSI (graphique)', page: 'rsi',
    simple: 'Compare la force des hausses et des baisses récentes, sur une échelle de 0 à 100.',
    formule: P => 'RSI de Wilder sur ' + P.rsi.periode + ' bougies : moyennes des hausses et des baisses lissées à 1/' + P.rsi.periode
      + ' ; RSI = 100 − 100 / (1 + hausses / baisses).',
    lectures: [
      { s: 'convention', t: 'Au-dessus de 70 : « suracheté » ; en dessous de 30 : « survendu » (seuils de Wilder).' },
      { s: 'usuel', t: 'Divergence : un nouveau plus haut du prix sans nouveau plus haut du RSI est lu comme un essoufflement. Sa fiabilité est discutée.' },
    ],
    limites: 'Calculé sur les bougies chargées par la page, bougie en cours incluse.',
  },
  ema: {
    titre: 'Moyennes mobiles (graphique)', page: 'ema',
    simple: 'EMA : moyenne des clôtures qui pèse davantage les plus récentes. SMA : moyenne simple.',
    formule: () => 'EMA n : k = 2/(n+1), amorcée par la moyenne simple des n premières clôtures, puis eₜ = k·cₜ + (1−k)·eₜ₋₁. SMA n : moyenne des n dernières clôtures. La période est celle du nom (EMA 20 → 20).',
    lectures: [
      { s: 'usuel', t: 'Prix au-dessus de la moyenne : tendance haussière sur cet horizon.' },
      { s: 'usuel', t: 'Les moyennes 50 et 200 sont très suivies : beaucoup de participants regardent les mêmes niveaux, ce qui peut suffire à leur donner du poids.' },
    ],
    limites: 'En retard par construction.',
  },
  vwap: {
    titre: 'VWAP', page: 'vwap',
    simple: 'Prix moyen payé, pondéré par les volumes échangés, depuis un point d’ancrage.',
    formule: P => 'Σ(prix typique × volume) / Σ volume, prix typique = (H + B + C) / 3. Ancrage : remis à zéro toutes les '
      + (P.vwap.ancrageIntradayS / 3600) + ' h (00:00 UTC) en intraday ; au-delà, toutes les ' + P.vwap.ancrageBougies + ' bougies.',
    lectures: [
      { s: 'usuel', t: 'Prix au-dessus du VWAP : les acheteurs de la séance sont, en moyenne, en gain ; c’est une référence d’exécution des institutions.' },
    ],
    limites: 'Un VWAP dépend de son ancrage : deux plateformes qui ancrent différemment n’affichent pas la même valeur.',
  },
  adx: {
    titre: 'ADX / DMI', page: 'adx',
    simple: 'Mesure la FORCE d’une tendance, pas sa direction ; +DI et −DI disent laquelle des deux pousse.',
    formule: P => 'DM+ / DM− et vrai range lissés par Wilder sur ' + P.adx.periode + ' ; DX = |DI+ − DI−| / (DI+ + DI−) × 100 ; ADX = DX lissé par Wilder (première valeur à 2 × ' + P.adx.periode + ' − 1).',
    lectures: [
      { s: 'convention', t: 'Repères courants : au-dessus de 25, tendance ; sous 20, marché sans tendance.' },
      { s: 'usuel', t: '+DI au-dessus de −DI : la pression haussière domine, et inversement.' },
    ],
    limites: 'Réagit lentement (double lissage).',
  },
  atr: {
    titre: 'ATR (graphique)', page: 'atr',
    simple: 'L’amplitude moyenne d’une bougie : l’échelle normale du mouvement.',
    formule: P => 'Vrai range = max(H − B, |H − C₋₁|, |B − C₋₁|), lissé par Wilder sur ' + P.atr.periode + ' bougies.',
    lectures: [{ s: 'usuel', t: 'Sert couramment d’échelle pour juger un mouvement ; ne dit rien de la direction.' }],
    limites: 'En dollars : comparer deux périodes de prix très différents demande l’ATR en % du prix.',
  },
  volume: {
    titre: 'Volume (graphique)', page: 'volume',
    simple: 'Quantité échangée pendant chaque bougie.',
    formule: () => 'Volume de base de la bougie (en BTC pour BTC/USDT), tel que publié par Binance.',
    lectures: [{ s: 'usuel', t: 'Un mouvement de prix sur un volume élevé est jugé plus significatif ; un volume qui s’éteint, un mouvement qui s’essouffle.' }],
    limites: 'Binance seulement : une fraction du volume mondial.',
  },
  sr: {
    titre: 'Supports / résistances (graphique)', page: 'sr',
    simple: 'Niveaux où le prix a fait demi-tour, regroupés et classés par importance.',
    formule: P => 'Pivots (plus haut / plus bas dépassant leurs voisins), sur les ' + P.sr.bougies + ' dernières bougies, regroupés dans une tolérance de '
      + (P.sr.tolMin * 100) + ' à ' + (P.sr.tolMax * 100) + ' % (fonction de l’ATR ' + P.sr.atrPeriode + '), pondérés par récence (demi-vie par TF) × log du volume ; '
      + P.sr.niveauxTf + ' niveaux du TF affiché + ' + P.sr.niveauxRef + ' par TF de référence, fusionnés à ' + (P.sr.fusionTf * 100) + ' %.',
    lectures: [
      { s: 'usuel', t: 'Un niveau touché plusieurs fois, récemment et sur du volume, est jugé plus solide.' },
      { s: 'débattu', t: 'Un niveau « cassé » change souvent de rôle (un support devient résistance) — lecture répandue, rarement vérifiée.' },
    ],
    limites: 'Méthode propre à cette page : d’autres outils tracent d’autres niveaux.',
  },
  bb: {
    titre: 'Bandes de Bollinger', page: 'bb',
    simple: 'Une moyenne et deux bandes à quelques écarts-types : l’enveloppe « normale » du prix.',
    formule: P => 'Moyenne simple ' + P.bb.periode + ' ± ' + P.bb.ecarts + ' écarts-types des ' + P.bb.periode + ' dernières clôtures.',
    lectures: [
      { s: 'usuel', t: 'Bandes resserrées : volatilité comprimée (souvent avant un mouvement) ; prix qui longe une bande : tendance forte.' },
      { s: 'convention', t: '« Toucher la bande » n’est pas un signal en soi : en tendance, le prix peut la longer longtemps.' },
    ],
    limites: 'Suppose implicitement des rendements « normaux », ce qu’ils ne sont pas.',
  },
  macd: {
    titre: 'MACD', page: 'macd',
    simple: 'Écart entre deux moyennes exponentielles, et sa propre moyenne : la dynamique de la tendance.',
    formule: P => 'MACD = EMA ' + P.macd.rapide + ' − EMA ' + P.macd.lente + ' ; signal = EMA ' + P.macd.signal + ' du MACD ; histogramme = MACD − signal.',
    lectures: [{ s: 'usuel', t: 'MACD au-dessus de son signal : dynamique haussière qui s’accélère ; croisements en retard sur le prix.' }],
    limites: 'Non borné : pas de niveau « extrême » universel.',
  },
  stoch: {
    titre: 'Stochastique rapide', page: 'stoch',
    simple: 'Où se situe la clôture dans le range récent, de 0 (au plus bas) à 100 (au plus haut).',
    formule: P => '%K = (C − plus bas ' + P.stoch.k + ') / (plus haut ' + P.stoch.k + ' − plus bas ' + P.stoch.k + ') × 100, NON lissé ; %D = moyenne de '
      + P.stoch.d + ' %K. (La version « lente » 14,3,3 lisse aussi %K ; ce n’est pas celle-ci.)',
    lectures: [{ s: 'convention', t: 'Au-dessus de 80 : haut du range ; sous 20 : bas du range (seuils usuels).' }],
    limites: 'Très nerveux en version rapide.',
  },
};

// ─── Valeurs et métadonnées ───────────────────────────────────────────────────
const NATURES = { mesure: 'Mesuré', 'modèle': 'Modèle', convention: 'Convention', seuil: 'Seuil de ce code', horodatage: 'Horodatage' };
const STATUTS = { usuel: 'Usuel', convention: 'Convention', 'débattu': 'Débattu', 'mesuré': 'Mesuré' };
const echapF = s => String(s === undefined || s === null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
  if (typeof v === 'number') return Math.abs(v) >= 1e6 ? (v / 1e6).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' M'
    : v.toLocaleString('fr-FR', { maximumFractionDigits: Math.abs(v) < 1 ? 4 : 2 });
  if (Array.isArray(v)) return v.slice(0, 3).map(x => Array.isArray(x) ? fmtValF(x[0]) + ' : ' + fmtValF(x[1]) : fmtValF(x)).join(' · ');
  return String(v);
}

/** La fiche, en HTML. IDENTIQUE dans les deux modes : seules les classes `.debutant-seul` /
 *  `.expert-seul` décident de ce qui s'affiche. */
function ficheHtml(id) {
  const f = FICHES[id];
  if (!f) return '';
  const m = f.champ ? metaDe(f.champ) : null;
  const P = typeof PARAM !== 'undefined' ? PARAM : null;
  const nature = m ? m.nature : (f.page ? 'mesure' : null);
  let h = '<div class="fiche-tete"><h3 class="fiche-titre">' + echapF(f.titre) + '</h3>'
    + (nature ? '<span class="fiche-nature nature-' + echapF(nature) + '">' + echapF(NATURES[nature] || nature) + '</span>' : '')
    + '<button type="button" class="fiche-fermer" onclick="fermerFiche()" aria-label="Fermer">×</button></div>'
    + '<p class="fiche-simple">' + echapF(f.simple) + '</p>';
  if (f.champ) {
    const vals = valeursDe(f.champ);
    const md = typeof marketData !== 'undefined' ? marketData : null;
    const age = md && md.updated ? Math.max(0, Math.round((Date.now() - Date.parse(md.updated)) / 60000)) : null;
    if (vals.length) h += '<p class="fiche-valeur">' + vals.map(([t, v]) => (t ? '<span class="fiche-tf">' + t + '</span> ' : '') + '<b>' + echapF(fmtValF(v)) + '</b>').join(' · ')
      + (m && m.unite ? ' <span class="fiche-unite">' + echapF(m.unite) + '</span>' : '')
      + (age !== null ? ' <span class="fiche-age">· publié il y a ' + age + ' min</span>' : '') + '</p>';
    if (m && m.nom_trompeur) h += '<p class="fiche-alerte">Nom trompeur : ' + echapF(m.nom_trompeur) + '</p>';
  }
  h += '<h4>Comment ça se lit</h4><ul class="fiche-lectures">' + f.lectures.map(l =>
    '<li><span class="statut statut-' + echapF(l.s) + '">' + echapF(STATUTS[l.s] || l.s) + '</span> ' + echapF(l.t) + '</li>').join('') + '</ul>';
  if (f.debat) h += '<div class="fiche-debat"><b>La littérature se contredit.</b> ' + echapF(f.debat) + '</div>';
  if (f.limites) h += '<p class="fiche-limites"><b>Ce que ça ne dit pas :</b> ' + echapF(f.limites) + '</p>';
  // Détail technique : expert. La formule n'est JAMAIS écrite ici à la main.
  let formule, details = [];
  if (f.champ) {
    if (m) {
      formule = m.formule;
      details = [['Unité', m.unite], ['Fenêtre', m.fenetre], ['Source', m.source], ['Champ', f.champ.replace('.*.', '.<TF>.')]];
      if (m.alias_de) details.push(['Alias de', m.alias_de]);
      if (m.params && m.params.poids_amorce_pct !== undefined) details.push(['Poids résiduel de l’amorce', m.params.poids_amorce_pct + ' %']);
    } else formule = 'Description non publiée par ce fichier (producteur antérieur au 06/10/2026).';
  } else if (f.formule) formule = P ? f.formule(P) : '—';
  h += '<div class="expert-seul fiche-technique"><h4>Formule</h4><p>' + echapF(formule)
    + '</p>' + (details.length ? '<dl>' + details.filter(d => d[1] !== undefined && d[1] !== null).map(([k, v]) => '<dt>' + echapF(k) + '</dt><dd>' + echapF(v) + '</dd>').join('') + '</dl>' : '')
    + '</div>'
    + '<p class="debutant-seul fiche-indice">La formule exacte, la fenêtre et la source sont en mode Expert.</p>'
    + '<p class="fiche-pied">Ceci décrit comment l’indicateur se lit. Ce n’est pas une recommandation d’achat ou de vente.</p>';
  return h;
}

// ─── Ouverture, glossaire ─────────────────────────────────────────────────────
let ficheOuverte = null, ficheRetour = null;
function ouvrirFiche(id, ancre) {
  const p = document.getElementById('fichePop');
  if (!p || !FICHES[id]) return;
  p.innerHTML = ficheHtml(id);
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
  if (p) p.hidden = true;
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
/** Le glossaire : toutes les fiches, ouvert depuis l'en-tête. */
function ouvrirGlossaire(ancre) {
  const p = document.getElementById('fichePop');
  if (!p) return;
  const groupes = [['Positionnement et dérivés', ['gex', 'ls', 'top_ls', 'taker', 'funding', 'oi', 'cvd', 'prime']],
    ['Macro', ['dxy', 'vix']], ['Carnet', ['carnet', 'murs']],
    ['Indicateurs du fichier', ['rsi_tf', 'ema_tf', 'croisement', 'sr_tf', 'amplitude', 'atr_tf', 'volume_tf']],
    ['Indicateurs du graphique', ['rsi', 'ema', 'vwap', 'adx', 'atr', 'volume', 'sr', 'bb', 'macd', 'stoch']]];
  p.innerHTML = '<div class="fiche-tete"><h3 class="fiche-titre">Légendes</h3><button type="button" class="fiche-fermer" onclick="fermerFiche()" aria-label="Fermer">×</button></div>'
    + '<p class="fiche-simple">Comment chaque chiffre se lit — et ce qu’il ne dit pas. Mode <b>' + (modeCourant() === 'expert' ? 'Expert' : 'Débutant') + '</b> : '
    + '<button type="button" class="lien" onclick="basculerMode();ouvrirGlossaire()">changer</button>.</p>'
    + groupes.map(([g, ids]) => '<h4>' + g + '</h4><div class="glossaire">' + ids.map(i =>
      '<button type="button" class="glossaire-item" onclick="ouvrirFiche(\'' + i + '\')">' + echapF(FICHES[i].titre) + '</button>').join('') + '</div>').join('');
  p.hidden = false;
  p.style.left = ''; p.style.top = '';
  ficheOuverte = 'glossaire'; ficheRetour = ancre || null;
}
document.addEventListener('keydown', e => { if (e.key === 'Escape' && ficheOuverte) fermerFiche(); });
document.addEventListener('click', e => {
  const p = document.getElementById('fichePop');
  if (ficheOuverte && p && !p.contains(e.target) && !(e.target.closest && e.target.closest('.info-btn, #legendesBtn'))) fermerFiche();
});

// ─── Lecture courte (mode débutant) : ce que dit la valeur DU MOMENT, sans conseil ─────────
// Les seuils utilisés ici sont des CONVENTIONS ; la phrase le dit quand c'en est une.
function lectureCourte(id, v, v2) {
  const n = x => typeof x === 'number' && isFinite(x);
  const pct = x => (x > 0 ? '+' : '') + x.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + ' %';
  let t = null;
  switch (id) {
    case 'funding': if (n(v)) t = v > 0 ? 'Les acheteurs à levier paient les vendeurs.' : v < 0 ? 'Les vendeurs à découvert paient les acheteurs.' : 'Aucun paiement entre acheteurs et vendeurs.'; break;
    case 'oi': if (n(v)) t = v > 0 ? 'Des positions à levier s’ouvrent (' + pct(v) + ' en 24 h).' : 'Des positions à levier se ferment (' + pct(v) + ' en 24 h).'; break;
    case 'ls': if (n(v)) t = (v > 1 ? 'Plus de comptes acheteurs que vendeurs' : 'Plus de comptes vendeurs qu’acheteurs') + ' — des comptes, pas des montants.'; break;
    case 'cvd': if (n(v)) t = v > 0 ? 'Sur 24 h, les achats au marché ont dominé.' : 'Sur 24 h, les ventes au marché ont dominé.'; break;
    case 'gex': if (n(v)) t = v > 0 ? 'Régime « long gamma » selon la convention : mouvements plutôt amortis.' : 'Régime « short gamma » selon la convention : mouvements plutôt amplifiés.'; break;
    case 'rsi_tf': if (n(v)) t = v >= 70 ? 'Zone haute (au-dessus de 70, « suracheté » par convention).' : v <= 30 ? 'Zone basse (sous 30, « survendu » par convention).' : 'Zone neutre (entre 30 et 70).'; break;
    case 'vix': if (n(v)) t = v < 15 ? 'Marchés actions calmes (repère usuel : sous 15).' : v > 25 ? 'Marchés actions sous tension (repère usuel : au-dessus de 25).' : 'Volatilité actions intermédiaire.'; break;
    case 'prime': {
      const x = n(v2) ? v2 : v;
      if (n(x)) t = Math.abs(x) < 0.03 ? 'Pas d’écart notable entre Coinbase et Binance' + (n(v2) ? ' une fois l’USDT ramené en dollars.' : '.')
        : (x > 0 ? 'Le BTC est plus cher sur Coinbase (demande américaine plus forte).' : 'Le BTC est moins cher sur Coinbase (demande américaine plus faible).');
      break;
    }
    case 'carnet': if (n(v)) t = v > 1 ? 'Plus de BTC posés à l’achat qu’à la vente près du prix.' : 'Plus de BTC posés à la vente qu’à l’achat près du prix.'; break;
    default: t = null;
  }
  return t ? '<div class="lecture-courte debutant-seul">' + echapF(t) + '</div>' : '';
}
