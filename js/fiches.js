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
  if (b) {
    // Débutant : le bouton dit où il mène (« Débutant · passer en Expert », « Passer en Expert »
    // sur téléphone) ; Expert : « Expert », la touche M ramène au Débutant.
    if (m === 'expert') { b.textContent = 'Expert'; b.title = 'Mode Expert · revenir en Débutant : touche M'; }
    else { b.innerHTML = '<span class="mode-long">Débutant · passer en Expert</span><span class="mode-court">Passer en Expert</span>'; b.title = 'Mode Débutant · passer en Expert : touche M (les valeurs ne changent pas)'; }
    b.setAttribute('aria-pressed', m === 'expert' ? 'true' : 'false');
  }
  const c = document.getElementById('carteBtn');
  if (c) c.title = m === 'expert' ? 'Carte du carnet (bookmap) — page à côté' : 'Carte des ordres en attente (page à côté)';
  const r = document.getElementById('resetBtn');
  if (r) r.title = m === 'expert' ? 'Réinitialiser le zoom (R)' : 'Revenir au présent (R)';
  // Le graphique écrit ses mots selon le mode (le canvas n'a pas de classes) : remise en page et
  // dessin à la prochaine image — mêmes valeurs, autres mots.
  try {
    if (typeof apresChangementMode === 'function') apresChangementMode(m);
    else if (typeof scheduleDraw === 'function' && candles.length) scheduleDraw();
  } catch (e) { /* page pas encore chargée */ }
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
  // ── Le Guide du graphique (js/guide.js) : ses nombres viennent de PARAM.guide ──
  guide: {
    titre: 'Guide du graphique', page: 'guide', nature: 'convention',
    simple: 'Une couche qui DÉCRIT ce que montre le graphique : les niveaux de prix proches et d’où ils viennent, le régime du marché, les formes chartistes en cours avec leur bilan mesuré, deux chemins conditionnels et une phrase de résumé. Elle ne dit jamais quoi faire.',
    formule: P => 'Niveaux : au plus ' + P.guide.niveauxParCote + ' au-dessus et ' + P.guide.niveauxParCote + ' au-dessous du prix, à moins de ' + pcF(P.guide.distanceMax) + ' %. Régime : ADX ' + P.adx.periode
      + ', EMA ' + P.guide.emaCourte + '/' + P.guide.emaLongue + ', Bollinger ' + P.bb.periode + '. Formes : au plus ' + P.guide.formesMax + ' à la fois. Choix gardé dans ce navigateur (clé samsara-guide-v1).',
    lectures: [
      { s: 'mesuré', t: 'Les niveaux (plus haut d’hier, plus bas des 24 h, zones de demi-tours, murs du carnet) sont lus dans les données ; chaque libellé dit son origine et son propre prix — jamais une moyenne — et, pour un chiffre publié, son heure de lecture.' },
      { s: 'convention', t: 'Le régime, les états « cassé » / « percé en mèche » et l’objectif d’une forme reposent sur des seuils et des règles usuels, nommés dans leur fiche.' },
      { s: 'débattu', t: 'Les murs d’options et le zéro gamma reposent sur un modèle (une hypothèse sur la position des teneurs de marché) : ils sont marqués « modèle ».' },
      { s: 'mesuré', t: 'Étude du propriétaire sur ses propres données, hors de cette page (méthode et période non reprises ici) : aucun indicateur technique n’y a prédit le rendement à 5 jours ; des règles posées sur des niveaux ont mieux tenu que les paris de direction. Le Guide montre donc des niveaux et des conditions, jamais une probabilité de hausse ou de baisse.' },
    ],
    limites: 'Ce n’est pas une prévision : aucun chemin n’est privilégié, aucune probabilité n’est calculée. Tout se lit sur l’intervalle affiché ; un autre intervalle peut dire autre chose. Masquable dans « + Indicateurs ».',
  },
  guide_niveaux: {
    titre: 'Guide — niveaux nommés', page: 'guide', nature: 'mesure',
    simple: 'Les niveaux de prix les plus proches, au-dessus et au-dessous du prix, chacun dans une bande fine avec son ORIGINE en mots. Des niveaux très proches ne font qu’une bande, qui couvre tous leurs prix et dit chacun d’eux avec son prix réel.',
    formule: P => 'Bande : ± ' + nbF(P.guide.bandeAtr) + ' × ATR ' + P.guide.atrPeriode + '. Une bande regroupe des niveaux dont l’écart total reste sous ' + pcF(P.guide.fusion) + ' %. Niveaux à moins de ' + pcF(P.guide.distanceMax) + ' % du prix, au plus '
      + P.guide.niveauxParCote + ' de chaque côté. Zones de demi-tours : au moins ' + P.guide.touchesMin + ' pivots regroupés (méthode S/R de la page, sur les ' + P.sr.bougies + ' dernières bougies de l’intervalle affiché). Cassure : 2 clôtures successives hors de la bande, ou 1 puis un retour réussi, parmi les '
      + P.guide.regardCassure + ' dernières bougies closes ; mèche : sur les ' + P.guide.mecheBougies + ' dernières. « Proche » : à moins de ' + pcF(P.guide.proche) + ' % du prix live.',
    lectures: [
      { s: 'mesuré', t: 'Plus haut / plus bas d’hier (journée UTC) et des 24 h glissantes : lus sur les bougies du graphique. Un niveau dont la période n’est pas entièrement chargée n’est pas affiché.' },
      { s: 'usuel', t: '« Zone de N demi-tours » : N sommets ou creux locaux (pivots) regroupés autour d’un prix, sur les bougies de l’intervalle AFFICHÉ seulement — le Guide ne lit pas les intervalles de référence de la couche S/R, pour ne pas dépendre d’elle ni charger d’autres données. Souvent regardé comme un support ou une résistance.' },
      { s: 'mesuré', t: 'Mur du carnet : la tranche où le plus de BTC étaient posés au moment de la publication (« lu à HH:MM ») ; un ordre posé peut être retiré à tout moment. Un mur d’achat lu AU-DESSUS du prix actuel (ou de vente au-dessous) n’est plus dans le carnet tel quel : il n’est pas affiché. Murs d’options : le prix d’exercice publié (en dollars) est dit tel quel, placé sur l’axe en USDT. Zéro gamma : un prix CALCULÉ par le modèle (là où l’exposition estimée change de signe), pas un prix d’exercice ; dit et placé de la même façon.' },
      { s: 'convention', t: 'État au prix live : « loin », « proche », « en test » (prix dans la bande), « percé en mèche » (seule une mèche a dépassé), « cassé (1/2 clôtures) » puis « cassé (2/2 clôtures, validé) » — deux clôtures successives au-delà de la bande — ou « cassé (validé par un retour réussi) » — une clôture au-delà, un retour sur la bande, puis une nouvelle clôture au-delà. Lu sur les bougies CLOSES de l’intervalle affiché ; pour un chiffre publié, seules les clôtures après sa lecture comptent. C’est la règle de travail du propriétaire, pas une mesure.' },
      { s: 'débattu', t: 'Un niveau cassé « change de rôle » (un support devient résistance) : lecture répandue, rarement vérifiée.' },
    ],
    limites: 'La distance affichée est celle entre le niveau et le prix LIVE, dite comme telle. Les murs du carnet et les niveaux d’options gardent l’heure de leur publication (« lu à HH:MM UTC ») : le carnet et le prix ont pu bouger depuis. Aucun chiffre publié n’est soustrait d’un autre chiffre d’une autre heure. Un niveau sans donnée n’est pas affiché — jamais remplacé par 0.',
  },
  guide_regime: {
    titre: 'Guide — régime du marché', page: 'guide', nature: 'convention',
    simple: 'Un badge en haut du graphique : marché en tendance (et dans quel sens), sans tendance nette, ou en compression (bandes de Bollinger parmi les plus étroites des dernières bougies).',
    formule: P => 'ADX ' + P.adx.periode + ' ≥ ' + P.guide.adxTendance + ' : tendance (haussière si +DI > −DI et EMA ' + P.guide.emaCourte + ' > EMA ' + P.guide.emaLongue + ', baissière si les deux disent l’inverse, sinon sens incertain) ; ADX ≤ '
      + P.guide.adxSans + ' : sans tendance nette ; entre les deux : tendance faible. Compression : largeur de Bollinger (' + P.bb.periode + ', ' + P.bb.ecarts + ' σ) au plus à son ' + P.guide.bbPercentile + 'e centile des ' + P.guide.bbFenetre + ' dernières bougies ; « au plus bas depuis N bougies » n’est dit qu’à partir de N = ' + P.guide.compressionDepuisMin + '.',
    lectures: [
      { s: 'convention', t: 'Les seuils de l’ADX sont ceux de l’usage (Wilder) : une convention, pas une loi. Le sens d’une tendance n’est dit que si deux mesures s’accordent.' },
      { s: 'débattu', t: 'Lecture répandue : une compression précéderait un mouvement plus ample, sans en dire le sens ; non mesuré ici.' },
      { s: 'mesuré', t: 'Un régime décrit le passé récent, pas la suite : dans l’étude du propriétaire sur ses données (hors de cette page, méthode et période non reprises ici), aucun indicateur technique n’a prédit le rendement à 5 jours.' },
    ],
    limites: 'Lu sur la dernière bougie CLOSE de l’intervalle affiché ; un autre intervalle peut dire autre chose.',
  },
  guide_formes: {
    titre: 'Guide — formes chartistes', page: 'guide', nature: 'convention',
    simple: 'Double sommet, double creux, rectangle (range) et triangle, détectés MÉCANIQUEMENT sur les bougies closes. Chaque forme a un état qui évolue : en formation, confirmée, objectif théorique atteint, ou invalidée.',
    formule: P => 'Pivots : ' + P.guide.pivot + ' bougies de chaque côté ; tolérance : ' + nbF(P.guide.tolAtr) + ' × ATR ' + P.guide.atrPeriode + '. Doubles : deux pivots à moins de la tolérance, séparés de ' + P.guide.ecartMin + ' à ' + P.guide.ecartMax
      + ' bougies, ligne de cou à au moins ' + nbF(P.guide.hauteurMinAtr) + ' ATR. Range : ≥ 2 contacts par côté sur ≥ ' + P.guide.rangeMin + ' bougies (fenêtre ' + P.guide.rangeFenetre + '), hauteur ≤ ' + nbF(P.guide.rangeHauteurAtr) + ' ATR. Triangle : régressions sur les '
      + P.guide.triPivots + ' derniers sommets et creux (fenêtre ' + P.guide.triFenetre + '), resserrement ≥ ' + pcF(P.guide.triConvergence) + ' %. Confirmation : 2 clôtures au-delà. Invalidation : clôture au-delà des sommets / creux (doubles), retour au milieu de la figure (range, triangle). Délais : '
      + P.guide.expiration + ' bougies pour confirmer, ' + P.guide.horizon + ' pour atteindre l’objectif (objectif et invalidation jugés tous deux en clôture). « Échantillon faible » sous ' + P.guide.echantillonFaible + ' confirmations. Repère sans forme : au plus ' + P.guide.temoinDeparts + ' départs rejoués.',
    lectures: [
      { s: 'débattu', t: 'Les formes chartistes sont subjectives dans la littérature : deux analystes ne tracent pas la même. Ici la détection suit des règles fixes, donc reproductibles — mais une règle fixe n’est pas une preuve d’efficacité.' },
      { s: 'convention', t: 'Objectif théorique : la hauteur de la figure reportée depuis la cassure (« mesure de la hauteur »). Une convention classique, non garantie.' },
      { s: 'mesuré', t: 'Bilan : le même détecteur est rejoué sur tout l’historique chargé, sans regarder l’avenir — une forme compte depuis la clôture où son dernier pivot devient connu ; une forme déjà confirmée à ce moment-là n’est pas comptée, et un triple sommet ne compte qu’une fois. On compte les formes repérées, les confirmations, les objectifs atteints avant invalidation, les invalidations, les formes encore ouvertes.' },
      { s: 'mesuré', t: 'L’objectif et l’invalidation ne sont pas à la même distance du point de confirmation : une partie des objectifs atteints s’explique par cette géométrie seule. D’où le repère sans forme : depuis n’importe quelle bougie, les mêmes distances (en ATR) et le même sens, la même règle. Un écart entre les deux comptes n’est pas une preuve.' },
    ],
    limites: 'Le bilan ne porte que sur l’historique CHARGÉ (son nombre de bougies et sa durée sont indiqués dans le bilan) et sur l’intervalle affiché : ce n’est ni une probabilité, ni une règle générale. Seules les formes récentes dont le dernier sommet ou creux est dans la vue sont montrées (un début sorti de la vue est coupé au bord) ; une candidate jamais confirmée disparaît quand elle tombe. Le bilan détaillé (délais écoulés, formes encore ouvertes, repère sans forme) est dans l’explication au survol en mode expert.',
  },
  guide_suite: {
    titre: 'Guide — et ensuite ?', page: 'guide', nature: 'convention',
    simple: 'Deux chemins conditionnels à droite de la dernière bougie : « si clôture au-dessus de X, prochain niveau Y » et « si clôture sous Z, prochain niveau W ».',
    formule: P => 'X et Z : le premier niveau nommé au-dessus et au-dessous du prix ; Y et W : le suivant de chaque côté. Prix DANS une bande : X et Z sont ses deux bords. Marge de dessin : ' + pcF(P.guide.futur) + ' % de la largeur du tracé, entre ' + P.guide.futurMinPx + ' et ' + P.guide.futurMaxPx + ' pixels, au plus ' + pcF(P.guide.futurMaxFraction) + ' % du tracé.',
    lectures: [
      { s: 'convention', t: 'X, Y, Z et W sont des niveaux nommés du Guide, jamais des prix inventés.' },
      { s: 'convention', t: 'Les deux chemins sont montrés ensemble, avec le même poids : aucun n’est privilégié, aucune probabilité n’est calculée. Le seuil est le bord le plus éloigné de la première bande (une clôture au-delà sort de la bande) ; un niveau publié garde son heure.' },
    ],
    limites: 'Une condition n’est pas une prévision. La marge à droite des bougies ne sert qu’à dessiner ces chemins ; elle disparaît quand le Guide est masqué, et se referme d’un pas de bougie par bougie quand la vue quitte la dernière bougie. Les deux chemins sont écrits dans la même forme, la plus complète qui tient pour les deux ; même la plus courte garde la condition (« si > X → Y »). Sans place pour les deux, ils sont réunis dans une seule boîte ; jamais un seul des deux.',
  },
  // ── Les scénarios du matin (js/scenarios.js) : fichier previsions.json, branche « previsions » ──
  scenarios: {
    titre: 'Scénarios du matin', page: 'scenarios', nature: 'convention',
    simple: 'Chaque matin, Claude (une IA) écrit trois scénarios pour les prochaines 24 h environ, à partir de son analyse du marché, et les classe du plus au moins probable, SANS pourcentage. Chaque niveau a une origine nommée (plus haut d’hier, mur d’options…) et se lit comme une zone : le niveau plus ou moins une marge. Le graphique les dessine et suit en direct ce que les bougies en font. Une description, jamais un conseil.',
    formule: P => 'Point du matin : ' + P.scenarios.point + ' (heure de Paris), BTCUSDT seulement. Zone : niveau × (1 ± marge du fichier). Une bougie touche une zone si son plus bas est sous le haut de la zone et son plus haut au-dessus du bas. Chemin : chaque cible dans une bougie plus tardive que la précédente ; invalidation touchée d’abord = invalidé. Range : sorti si une bougie dépasse une borne de plus de la marge. Suivi en direct : seules les bougies ENTIÈRES dans la fenêtre comptent, sur des bougies de ' + Math.round(P.scenarios.suiviPasMax / 60) + ' min au plus. « Échantillon faible » sous '
      + P.scenarios.echantillonFaible + ' matins notés. Fichier relu toutes les ' + (typeof CADENCES !== 'undefined' ? Math.round(CADENCES.previsions_lue / 60000) : '?') + ' minutes, onglet visible. Choix gardé dans ce navigateur (clé samsara-scenarios-v1).',
    lectures: [
      { s: 'convention', t: 'Le rang (1, 2, 3) est un CLASSEMENT : le 1 est jugé plus probable que le 2, le 2 plus que le 3. Aucun pourcentage n’est montré. Le scénario de la semaine court sur plusieurs matins et ne compte pas dans la mesure.' },
      { s: 'mesuré', t: 'Mesuré sur l’historique du propriétaire du site, hors de cette page (méthode et période non reprises ici) : avant cette méthode, les annonces de direction (« hausse » ou « baisse » à 55-60 %) se sont révélées fausses 4 fois sur 5. D’où des niveaux nommés, un ordre et une invalidation, plutôt qu’une probabilité de hausse ou de baisse.' },
      { s: 'mesuré', t: 'Le seul chiffre de réussite montré : « Ordre du premier mouvement juste N fois sur M matins », tiré du journal. Chaque matin compte le chemin le mieux classé qui a une invalidation (rangs 1 à 3 : si le 1 n’en a pas, c’est le 2 qui est mesuré). Ne comptent que les matins où il a touché sa 1re zone ou son invalidation ; « juste » = la 1re zone d’abord. C’est la mesure que suit le journal ; seule, et tant qu’il y a peu de matins notés (« échantillon faible »), elle ne prouve rien.' },
      { s: 'convention', t: 'Les états de l’encadré (« 1re cible touchée entre 10:30 et 10:45 UTC », « invalidation touchée d’abord… », « ordre inconnu ») sont un SUIVI EN DIRECT sur les bougies de l’intervalle affiché : un affichage, au créneau d’une bougie près, sur les bougies de 1 h au plus. La note officielle est celle du journal, faite mécaniquement le lendemain matin sur des bougies d’une minute ; quand elle existe, c’est elle qui s’affiche. Hors de l’encadré complet (libellés, ligne repliée), un état calculé par la page porte « (en direct) ». Si l’historique chargé ne remonte pas jusqu’au point (bougies 1 min), le suivi se dit « incomplet » plutôt que de deviner.' },
      { s: 'débattu', t: 'Les niveaux venus d’un modèle d’options (murs de calls ou de puts, zéro gamma) sont marqués « (modèle) » : ils reposent sur une hypothèse sur la position des teneurs de marché.' },
    ],
    limites: 'Ce n’est pas une prévision garantie ni une indication de quoi faire : trois scénarios sont montrés ensemble, avec leur rang et leur invalidation. Une bougie qui touche deux zones à la fois ne dit pas laquelle a été touchée la première : l’état le dit (« ordre inconnu »). Sans fichier lisible, rien n’est dessiné et l’encadré le dit en une ligne. Masquable dans « + Indicateurs » (catégorie Guide).',
  },
  // ── Le dessin lui-même ──
  // La forme d'une bougie est une CONVENTION du thème (jeton --bougie-forme) : la fiche dit celle
  // du thème courant, lue dans le code du tracé (FORMES_BOUGIE, BOUGIE_DENSE_PX, js/app.js).
  bougies: {
    titre: 'Bougies : la forme du thème', page: 'bougies', nature: 'convention',
    simple: 'Une bougie résume une période : son ouverture, son plus haut, son plus bas et sa clôture. Le thème choisit la forme qui les dessine.',
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
      { s: 'convention', t: 'La forme change, jamais la valeur : les quatre prix sont tracés aux mêmes ordonnées, quelle que soit la forme du thème.' },
      { s: 'convention', t: 'Corps creux en hausse, plein en baisse : la convention des cotes imprimées d’une seule encre — la hausse se lit à la forme, pas seulement à la couleur.' },
      { s: 'convention', t: 'Barres OHLC : l’ouverture est le tiret de gauche, la clôture celui de droite.' },
    ],
    limites: 'En vue dense, les corps redeviennent pleins (une barre, un simple trait) : un contour de quelques pixels ne se lit plus. La dernière bougie bouge jusqu’à sa clôture.',
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
/** Une fraction en pourcentage, à la française (0.003 → « 0,3 ») : pour les formules des fiches du Guide. */
const pcF = x => (x * 100).toLocaleString('fr-FR', { maximumFractionDigits: 2 });
const nbF = x => x.toLocaleString('fr-FR');
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
  // Nature : celle que publie le producteur (champ du fichier), sinon celle que la fiche déclare
  // (la forme des bougies est une convention), sinon « mesuré » pour un calcul de la page.
  const nature = m ? m.nature : (f.nature || (f.page ? 'mesure' : null));
  let h = '<div class="fiche-tete"><h3 class="fiche-titre">' + echapF(f.titre) + '</h3>'
    + (nature ? '<span class="fiche-nature nature-' + echapF(nature) + '">' + echapF(NATURES[nature] || nature) + '</span>' : '')
    + '<button type="button" class="fiche-fermer" onclick="fermerFiche()" aria-label="Fermer">×</button></div>'
    + '<p class="fiche-simple">' + echapF(f.simple) + '</p>';
  // État du moment dérivé du code (ex. la forme de bougie du thème courant) : même HTML dans les deux modes.
  const etat = f.etat ? f.etat() : null;
  if (etat) h += '<p class="fiche-valeur">' + echapF(etat) + '</p>';
  if (f.champ) {
    const vals = valeursDe(f.champ);
    const md = typeof marketData !== 'undefined' ? marketData : null;
    const age = md && md.updated ? Math.max(0, Math.round((Date.now() - Date.parse(md.updated)) / 60000)) : null;
    if (vals.length) h += '<p class="fiche-valeur">' + vals.map(([t, v]) => (t ? '<span class="fiche-tf">' + t + '</span> ' : '') + '<b>' + echapF(fmtValF(v)) + '</b>').join(' · ')
      + (m && m.unite ? ' <span class="fiche-unite">' + echapF(m.unite) + '</span>' : '')
      + (age !== null ? ' <span class="fiche-age">· publié il y a ' + age + ' min</span>' : '') + '</p>';
    if (m && m.nom_trompeur) h += '<p class="fiche-alerte">Nom trompeur : ' + echapF(m.nom_trompeur) + '</p>';
    // Les dernières heures de ce champ, publication par publication (js/chronique.js) : même
    // HTML dans les deux modes ; absent tant qu'aucun historique n'est lu.
    if (typeof chroniqueFiche === 'function') h += chroniqueFiche(f.champ, id);
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
    ['Le dessin du graphique', ['bougies']],
    ['Guide du graphique', ['guide', 'guide_niveaux', 'guide_regime', 'guide_formes', 'guide_suite', 'scenarios']],
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
/** Les phrases des cartes en mode Débutant (sans jargon, sans seuil inventé) : le même bloc que
 *  lectureCourte, pour des cartes qui n'ont pas de fiche. cle : 'fourchette' (v : position dans
 *  la fourchette, de 0 au plus bas à 1 au plus haut ; v2 : « 24 h » ou « 5 jours »), 'vix',
 *  'cvd' (v : écart achats − ventes en $), 'sources' (v : à jour, v2 : attendues). */
function phraseCarte(cle, v, v2) {
  const n = x => typeof x === 'number' && isFinite(x);
  const dollars = x => Math.round(Math.abs(x)).toLocaleString('fr-FR').replace(/[\u00a0\u202f]/g, ' ') + ' $';
  let t = null;
  switch (cle) {
    case 'fourchette': if (n(v)) t = 'Sur ' + (v2 || '24 h') + ', le prix est ' + (v >= 2 / 3 ? 'dans le haut' : v <= 1 / 3 ? 'dans le bas' : 'au milieu') + ' de sa fourchette.'; break;
    case 'vix': if (n(v)) t = v < 15 ? 'Les bourses américaines sont calmes.' : v > 25 ? 'Les bourses américaines sont nerveuses.' : 'Les bourses américaines ne sont ni calmes ni nerveuses.'; break;
    case 'cvd': if (n(v)) t = v >= 0 ? 'Sur 24 h, les achats immédiats ont dépassé les ventes immédiates de ' + dollars(v) + '.' : 'Sur 24 h, les ventes immédiates ont dépassé les achats immédiats de ' + dollars(v) + '.'; break;
    case 'sources': if (n(v) && n(v2)) t = v >= v2 ? 'Toutes les données publiées sont arrivées.' : (v2 - v) + (v2 - v > 1 ? ' sources manquent' : ' source manque') + ' (détail en mode Expert).'; break;
    default: t = null;
  }
  return t ? '<div class="lecture-courte debutant-seul">' + echapF(t) + '</div>' : '';
}

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
