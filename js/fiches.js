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
//     paramètres mêmes du calcul ; l'usage des traders (TRADERS) et « Comment s'en servir »
//     (USAGES) aussi, dès qu'ils citent un de ces paramètres ;
//   · ce fichier n'apporte que la LECTURE : ce que l'usage en fait, marqué « usuel »,
//     « convention » ou « débattu » — et, quand la littérature se contredit (GEX, L/S), il le
//     dit au lieu de choisir un camp.
// tests/test_fiches.js fait tenir ces règles (champ publié, paramètres réels, aucun conseil,
// aucun nombre avec unité écrit en dur dans TRADERS, CALCUL et USAGES).
//
// MODE DÉBUTANT / EXPERT : une CLASSE sur <html>, rien d'autre. Le HTML produit est le même
// dans les deux modes ; seul l'affichage de `.debutant-seul` / `.expert-seul` change. Une
// valeur ne peut donc pas différer d'un mode à l'autre — le harnais le vérifie.
// ═══════════════════════════════════════════════════════════════════════════════

const MODE_CLE = 'samsara-mode';
// Le mode quand le stockage ne le garde pas (navigation privée, stockage bloqué) : la page entière
// — classes, bouton ET graphique — lit alors ce mode-ci, jamais un stockage muet ou figé.
let MODE_MEMOIRE = null;
function modeHtml() {
  try { return document.documentElement.getAttribute('data-mode') === 'expert' ? 'expert' : 'debutant'; } catch (e) { return 'debutant'; }
}
function modeCourant() {
  if (MODE_MEMOIRE) return MODE_MEMOIRE;
  try { return localStorage.getItem(MODE_CLE) === 'expert' ? 'expert' : 'debutant'; } catch (e) { return modeHtml(); }
}
function appliquerMode(m) {
  document.documentElement.setAttribute('data-mode', m);
  let garde = false;
  try { localStorage.setItem(MODE_CLE, m); garde = localStorage.getItem(MODE_CLE) === m; } catch (e) { /* navigation privée */ }
  MODE_MEMOIRE = garde ? null : m;
  const b = document.getElementById('modeBtn');
  if (b) {
    // Débutant : le bouton dit où il mène (« Débutant · passer en Expert », « Passer en Expert »
    // sur téléphone) ; Expert : « Expert », la touche M ramène au Débutant.
    if (m === 'expert') { b.textContent = 'Expert'; b.title = 'Mode Expert · revenir en Débutant : touche M'; }
    else { b.innerHTML = '<span class="mode-long">Débutant · passer en Expert</span><span class="mode-court">Passer en Expert</span>'; b.title = 'Mode Débutant · passer en Expert : touche M (les valeurs ne changent pas)'; }
    b.setAttribute('aria-pressed', m === 'expert' ? 'true' : 'false');
  }
  const c = document.getElementById('carteBtn');
  if (c) {
    c.title = m === 'expert' ? 'Carte du carnet (bookmap) — page à côté' : 'Carte des ordres en attente (page à côté)';
    c.setAttribute('aria-label', m === 'expert' ? 'Carte du carnet' : 'Carte des ordres en attente');
  }
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
    simple: 'Estime pour combien de dollars de BTC les teneurs de marché d’options devraient acheter ou vendre pour rester couverts si le prix bouge de 1 %.',
    lectures: [
      { s: 'convention', t: 'GEX positif (« long gamma ») : les dealers vendraient dans les hausses et achèteraient dans les baisses — lecture usuelle : mouvements amortis, prix attiré par les gros strikes.' },
      { s: 'convention', t: 'GEX négatif (« short gamma ») : ils suivraient le mouvement — lecture usuelle : mouvements amplifiés.' },
      { s: 'convention', t: 'Zéro gamma : le prix où le régime basculerait. Murs de calls / de puts : les strikes où la couverture serait la plus forte.' },
    ],
    debat: 'Tout repose sur une HYPOTHÈSE : dealers acheteurs des calls, vendeurs des puts. Les détenteurs de BTC qui vendent des calls pour un rendement vont dans le sens de cette hypothèse ; mais quand des clients ACHÈTENT des calls (spéculation) ou VENDENT des puts (rendement), les dealers sont vendeurs de ces calls ou acheteurs de ces puts, et le signe s’inverse sur ces strikes. Les fournisseurs de données ne s’accordent pas sur la convention à retenir. Le positionnement réel des dealers n’est pas observable : c’est un modèle, pas une mesure.',
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
    get simple() { return 'Taux échangé ' + echeancesMots() + ' entre acheteurs et vendeurs du contrat perpétuel pour que son prix colle au spot. Positif : les acheteurs paient les vendeurs.'; },
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
    titreDeb: 'Achats et ventes',
    simpleDeb: 'Sur 24 h, les achats faits tout de suite au prix du moment, comparés aux ventes faites tout de suite : qui a été le plus pressé d’échanger.',
    titre: 'CVD — delta cumulé des volumes', champ: 'micro.cvd_24h_usd',
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
      { s: 'mesuré', t: 'La prime usuelle compare des DOLLARS à des TETHERS : un USDT à 0,9997 $ crée à lui seul −0,03 % (un USDT au-dessus de 1 $, une prime positive). La prime « hors USDT » compare des dollars à des dollars.' },
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
    limites: 'Dernière valeur journalière d’un jour ouvré (le dernier cours pendant la séance, sinon la clôture), différée ; marché fermé le week-end.',
  },
  vix: {
    titreDeb: 'Nervosité des bourses',
    simpleDeb: 'Un indice qui dit la nervosité attendue des bourses américaines pour les 30 prochains jours : bas, elles sont calmes ; haut, elles sont nerveuses.',
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
    titreDeb: 'Ordres en attente',
    simpleDeb: 'Les ordres d’achat et de vente qui attendent sur Binance, près du prix : combien de BTC sont posés de chaque côté. Un ordre posé peut être retiré à tout moment.',
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
      { s: 'convention', t: 'Au-dessus de 70 et sous 30 : les seuils proposés par Wilder, appelés « suracheté » et « survendu ». Ce sont des noms : ils disent que le mouvement récent a été fort, pas qu’il va se retourner.' },
      { s: 'usuel', t: 'En tendance forte, le RSI peut rester au-dessus de 70 (ou sous 30) longtemps : ce n’est pas un signal de retournement.' },
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
    titreDeb: 'Fourchette (plus bas, plus haut)',
    simpleDeb: 'Le plus bas et le plus haut récents (sur les 5 derniers jours, pour la carte) : la carte dit si le prix est dans le haut, au milieu ou dans le bas de cette fourchette.',
    titre: 'Support / résistance (fichier)', champ: 'tf.*.support_30',
    simple: 'Le plus bas et le plus haut des dernières bougies de l’échelle de temps.',
    lectures: [
      { s: 'usuel', t: 'Le prix entre les deux : où il se situe dans son canal récent.' },
      { s: 'mesuré', t: 'Ce sont des EXTRÊMES, pas des niveaux testés plusieurs fois : la littérature appelle « support » un niveau où le prix a fait demi-tour à plusieurs reprises.' },
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
      { s: 'usuel', t: 'Sert couramment d’ÉCHELLE : un mouvement de plusieurs ATR est jugé inhabituel, une distance d’une fraction d’ATR est lue comme du bruit (repères d’usage, sans seuil universel).' },
      { s: 'mesuré', t: 'Ne dit rien de la direction.' },
    ],
    limites: 'Calculé avec la moyenne de Wilder ; une moyenne simple donnerait une valeur un peu différente. Bougie en cours incluse.',
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
      { s: 'convention', t: 'Au-dessus de 70 et sous 30 : les seuils de Wilder, appelés « suracheté » et « survendu ». Ce sont des noms : ils disent que le mouvement récent a été fort, pas qu’il va se retourner ; en tendance, le RSI peut y rester longtemps.' },
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
      { s: 'convention', t: 'Repères courants : au-dessus de 25, tendance ; sous 20, marché sans tendance. Le graphique trace des lignes à 25 et 50 (pas à 20).' },
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
      + pcF(P.sr.tolMin) + ' à ' + pcF(P.sr.tolMax) + ' % (fonction de l’ATR ' + P.sr.atrPeriode + '), pondérés par récence (demi-vie par TF) × log du volume ; '
      + P.sr.niveauxTf + ' niveaux du TF affiché + ' + P.sr.niveauxRef + ' par TF de référence, fusionnés à ' + pcF(P.sr.fusionTf) + ' %.',
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
    limites: 'L’écart-type suppose une dispersion des prix « régulière » ; sur le BTC, les grands écarts sont plus fréquents qu’une loi normale ne le prévoit.',
  },
  macd: {
    titre: 'MACD', page: 'macd',
    simple: 'Écart entre deux moyennes exponentielles, et sa propre moyenne : la dynamique de la tendance.',
    formule: P => 'MACD = EMA ' + P.macd.rapide + ' − EMA ' + P.macd.lente + ' ; signal = EMA ' + P.macd.signal + ' du MACD ; histogramme = MACD − signal.',
    lectures: [{ s: 'usuel', t: 'MACD au-dessus de son signal (histogramme positif) : l’écart entre les deux moyennes évolue vers le haut, même si le MACD est encore sous 0 (une baisse qui ralentit). Les croisements sont en retard sur le prix.' }],
    limites: 'Non borné : pas de niveau « extrême » universel.',
  },
  // ── Le Guide du graphique (js/guide.js) : ses nombres viennent de PARAM.guide ──
  guide: {
    titre: 'Guide du graphique', page: 'guide', nature: 'convention',
    titreDeb: 'Repères et phrase de lecture',
    simpleDeb: 'En haut du graphique, une phrase dit si le prix monte, baisse ou hésite, et depuis quand. Deux repères de prix l’encadrent : le plus proche au-dessus, le plus proche en dessous. Puis le scénario n° 1 de Claude et, s’il y en a une, une figure du graphique. Touchez (ou survolez) un texte pour le détail. Une description, jamais un conseil ; le reste est en mode Expert, et tout se masque dans « + Affichage ».',
    simple: 'Une couche qui DÉCRIT ce que montre le graphique : les niveaux de prix proches et d’où ils viennent, le régime du marché, les formes chartistes en cours avec leur bilan mesuré, deux chemins conditionnels et une phrase de résumé. Elle ne dit jamais quoi faire.',
    formule: P => 'Niveaux : au plus ' + P.guide.niveauxParCote + ' au-dessus et ' + P.guide.niveauxParCote + ' au-dessous du prix, à moins de ' + pcF(P.guide.distanceMax) + ' %. Régime : ADX ' + P.adx.periode
      + ', EMA ' + P.guide.emaCourte + '/' + P.guide.emaLongue + ', Bollinger ' + P.bb.periode + '. Formes : au plus ' + P.guide.formesMax + ' à la fois. Choix gardé dans ce navigateur (clé samsara-guide-v1).',
    lectures: [
      { s: 'mesuré', t: 'Les niveaux (plus haut d’hier, plus bas des 24 h, zones de demi-tours, murs du carnet) sont lus dans les données ; chaque libellé dit son origine et son propre prix — jamais une moyenne — et, pour un chiffre publié, son heure de lecture.' },
      { s: 'convention', t: 'Le régime, les états « cassé » / « percé en mèche » et l’objectif d’une forme reposent sur des seuils et des règles usuels, nommés dans leur fiche.' },
      { s: 'débattu', t: 'Les murs d’options et le zéro gamma reposent sur un modèle (une hypothèse sur la position des teneurs de marché) : ils sont marqués « modèle ».' },
    ],
    limites: 'Ce n’est pas une prévision : aucun chemin n’est privilégié, aucune probabilité n’est calculée. Tout se lit sur l’intervalle affiché ; un autre intervalle peut dire autre chose. Masquable dans « + Indicateurs » (« + Affichage » en mode Débutant).',
  },
  guide_niveaux: {
    titre: 'Guide — niveaux nommés', page: 'guide', nature: 'mesure',
    titreDeb: 'Les repères de prix',
    simpleDeb: 'Les deux repères sont les prix les plus proches où il s’est passé quelque chose : le haut ou le bas d’hier, un mur d’ordres en attente, une zone où le prix a souvent fait demi-tour… Chacun dit son origine en mots. La phrase du haut les cite. Touchez un repère : d’où il vient, où est le prix, et le repère suivant si le prix le dépasse.',
    simple: 'Les niveaux de prix les plus proches, au-dessus et au-dessous du prix, chacun dans une bande fine avec son ORIGINE en mots. Des niveaux très proches ne font qu’une bande, qui couvre tous leurs prix et dit chacun d’eux avec son prix réel.',
    formule: P => 'Bande : ± ' + nbF(P.guide.bandeAtr) + ' × ATR ' + P.guide.atrPeriode + '. Une bande regroupe des niveaux dont l’écart total reste sous ' + pcF(P.guide.fusion) + ' %. Niveaux à moins de ' + pcF(P.guide.distanceMax) + ' % du prix, au plus '
      + P.guide.niveauxParCote + ' de chaque côté. Zones de demi-tours : au moins ' + P.guide.touchesMin + ' pivots regroupés (méthode S/R de la page, sur les ' + P.sr.bougies + ' dernières bougies de l’intervalle affiché). Cassure : 2 clôtures successives hors de la bande, ou 1 puis un retour réussi, parmi les '
      + P.guide.regardCassure + ' dernières bougies closes ; mèche : sur les ' + P.guide.mecheBougies + ' dernières. « Proche » : à moins de ' + pcF(P.guide.proche) + ' % du prix live.',
    lectures: [
      { s: 'mesuré', t: 'Plus haut / plus bas d’hier (journée UTC) et des 24 h glissantes : lus sur les bougies du graphique. Un niveau dont la période n’est pas entièrement chargée n’est pas affiché.' },
      { s: 'usuel', t: '« Zone de N demi-tours » : N sommets ou creux locaux (pivots) regroupés autour d’un prix, sur les bougies de l’intervalle AFFICHÉ seulement — le Guide ne lit pas les intervalles de référence de la couche S/R, pour ne pas dépendre d’elle ni charger d’autres données. Souvent regardé comme un support ou une résistance.' },
      { s: 'mesuré', t: 'Mur du carnet : la tranche où le plus de BTC étaient posés au moment de la publication (« lu à HH:MM ») ; un ordre posé peut être retiré à tout moment. Un mur d’achat lu AU-DESSUS du prix actuel (ou de vente au-dessous) n’est plus dans le carnet tel quel : il n’est pas affiché. Murs d’options : le prix d’exercice publié (en dollars) est dit tel quel, placé sur l’axe en USDT. Zéro gamma : un prix CALCULÉ par le modèle (là où l’exposition estimée change de signe), pas un prix d’exercice ; dit et placé de la même façon.' },
      { s: 'convention', t: 'État au prix live : « loin », « proche », « en test » (prix dans la bande), « percé en mèche » (seule une mèche a dépassé), « cassé (1/2 clôtures) » puis « cassé (2/2 clôtures, validé) » — deux clôtures successives au-delà de la bande — ou « cassé (validé par un retour réussi) » — une clôture au-delà, un retour sur la bande, puis une nouvelle clôture au-delà. Lu sur les bougies CLOSES de l’intervalle affiché ; pour un chiffre publié, seules les clôtures après sa lecture comptent. C’est une règle de travail, pas une mesure.' },
      { s: 'débattu', t: 'Un niveau cassé « change de rôle » (un support devient résistance) : lecture répandue, rarement vérifiée.' },
    ],
    limites: 'La distance affichée est celle entre le niveau et le prix LIVE, dite comme telle. Les murs du carnet et les niveaux d’options gardent l’heure de leur publication (« lu à HH:MM ») : le carnet et le prix ont pu bouger depuis. Aucun chiffre publié n’est soustrait d’un autre chiffre d’une autre heure. Un niveau sans donnée n’est pas affiché — jamais remplacé par 0.',
  },
  guide_regime: {
    titre: 'Guide — régime du marché', page: 'guide', nature: 'convention',
    titreDeb: 'Le mouvement du prix',
    simpleDeb: 'En mode Débutant, le mouvement n’a pas de badge : il donne le verbe de la phrase en haut du graphique. « Monte » ou « baisse » : le prix a pris une direction nette ; « hésite » : pas de direction nette ; « s’agite » : il bouge fort, sans sens clair. Le badge et ses mesures sont en mode Expert.',
    simple: 'Un badge en haut du graphique : marché en tendance (et dans quel sens), en tendance faible ou sans tendance nette ; il ajoute « compression » quand les bandes de Bollinger sont parmi les plus étroites des dernières bougies.',
    formule: P => 'ADX ' + P.adx.periode + ' ≥ ' + P.guide.adxTendance + ' : tendance (haussière si +DI > −DI et EMA ' + P.guide.emaCourte + ' > EMA ' + P.guide.emaLongue + ', baissière si les deux disent l’inverse, sinon sens incertain) ; ADX ≤ '
      + P.guide.adxSans + ' : sans tendance nette ; entre les deux : tendance faible. Compression : largeur de Bollinger (' + P.bb.periode + ', ' + P.bb.ecarts + ' σ) au plus à son ' + P.guide.bbPercentile + 'e centile des ' + P.guide.bbFenetre + ' dernières bougies ; « au plus bas depuis N bougies » n’est dit qu’à partir de N = ' + P.guide.compressionDepuisMin + '.',
    lectures: [
      { s: 'convention', t: 'Les seuils de l’ADX sont ceux de l’usage (Wilder) : une convention, pas une loi. Le sens d’une tendance n’est dit que si deux mesures s’accordent.' },
      { s: 'débattu', t: 'Lecture répandue : une compression précéderait un mouvement plus ample, sans en dire le sens ; non mesuré ici.' },
      { s: 'usuel', t: 'Un régime décrit le passé récent, pas la suite.' },
    ],
    limites: 'Lu sur la dernière bougie CLOSE de l’intervalle affiché ; un autre intervalle peut dire autre chose.',
  },
  guide_formes: {
    titre: 'Guide — figures chartistes', page: 'guide', nature: 'convention',
    titreDeb: 'Les figures du graphique',
    simpleDeb: 'Une figure est un dessin que le prix a déjà fait : deux sommets presque au même prix, une tête entre deux épaules, deux lignes qui se rapprochent, un drapeau après une forte montée ou descente… Elle apparaît en tirets dès qu’elle se dessine, avec son nom : « possible », « à valider », puis « validé » en trait plein ; une figure finie passe en pointillés, barrée « ✗ » si le prix l’a défaite. Elle ne compte qu’à la fin d’une période : si le prix passe une ligne puis revient, cela ne valide rien. Touchez son nom pour lire la ligne qui la valide, celle qui l’annule, la cible que retiennent les analystes (non garantie) et combien de fois ces figures sont allées au bout sur ce graphique. Une description, jamais un conseil.',
    simple: 'Seize figures, détectées MÉCANIQUEMENT sur les bougies closes : double sommet et double creux, triple sommet et triple creux, épaule-tête-épaule et sa version inversée, rectangle (range), triangles ascendant, descendant et symétrique, biseaux montant et descendant, canaux montant et descendant, drapeau et fanion. Chaque figure a un état qui évolue : ébauche (son dernier sommet ou creux n’est pas encore confirmé), formée, sortie à valider (1 clôture sur 2), validée, objectif théorique atteint, invalidée ✗ (ou annulée ✗, pour une ébauche), délai écoulé – (validée, ni objectif ni invalidation à temps), sans suite ○ (jamais validée). Une figure ne compte qu’en fin de bougie : un passage en mèche est dit « percé en mèche, à valider », jamais une validation.',
    formule: P => {
      const g = P.guide, E = g.ete, L = g.lignes, D = g.drapeau;
      return 'Socle : pivots de ' + g.pivot + ' bougies de chaque côté ; tolérance ' + nbF(g.tolAtr) + ' × ATR ' + g.atrPeriode + ' ; hauteur d’au moins ' + nbF(g.hauteurMinAtr) + ' ATR ; sortie hors d’une bande de ± ' + nbF(g.bandeAtr) + ' × ATR (figée à la naissance de la figure) : 2 clôtures au-delà, ou 1 clôture puis un retour réussi (au plus ' + g.retourMax + ' clôtures dans la bande). '
        + 'Ébauche : dès la 1re clôture (au moins ' + g.ebaucheDroiteMin + ' bougie à droite du dernier extrême), avec le pivot en attente ; annulée si un nouvel extrême dépasse les autres sommets (ou creux) de plus de la tolérance. '
        + 'Doubles : deux pivots à moins de la tolérance, séparés de ' + g.ecartMin + ' à ' + g.ecartMax + ' bougies. Triples : trois pivots, ' + g.tripleMax + ' bougies au plus, écarts réguliers à ' + pcF(g.tripleRegulier) + ' % près, creux (ou sommets) intermédiaires d’au moins ' + pcF(g.tripleCreux) + ' % de la hauteur. '
        + 'Épaule-tête-épaule : ' + E.min + ' à ' + E.max + ' bougies ; tête au-delà des épaules d’au moins ' + nbF(E.teteAtr) + ' ATR et ' + pcF(E.teteH) + ' % de la hauteur ; épaules à moins de ' + nbF(E.epaulesAtr) + ' ATR et ' + pcF(E.epaulesH) + ' % de la hauteur l’une de l’autre ; symétrie dans un rapport de ' + nbF(E.symetrie) + ' au plus ; ligne de cou de pente ≤ ' + pcF(E.couPente) + ' % de la hauteur ; épaules à ' + pcF(E.epauleCouMin) + ' % de la hauteur au moins au-dessus du cou ; jambes ≥ ' + E.jambeMin + ' bougies ; tendance d’avant ≥ ' + pcF(E.tendanceH) + ' % de la hauteur. '
        + 'Rectangle : ≥ 2 contacts par côté sur ≥ ' + g.rangeMin + ' bougies (fenêtre ' + g.rangeFenetre + '), hauteur ≤ ' + nbF(g.rangeHauteurAtr) + ' ATR. '
        + 'Triangles, biseaux, canaux : régressions sur les 2 à 4 derniers sommets et creux (chacun à ≤ ' + nbF(L.tolAtr) + ' ATR de sa droite), ' + L.min + ' à ' + L.fenetre + ' bougies, chaque droite sur ≥ ' + pcF(L.etalement) + ' % de la figure ; un côté « plat » : < ' + nbF(L.platAtr) + ' ATR et < ' + pcF(L.platW0) + ' % de la largeur ; triangles : resserrement ≥ ' + pcF(g.triConvergence) + ' % ; biseaux : ≥ ' + pcF(L.biseauConvergence) + ' %, les deux droites dans le même sens ; repérés avant ' + pcF(L.avancementMax) + ' % du chemin vers la pointe ; canaux : parallèles à ' + pcF(L.paralleleMax) + ' % près, pente ≥ ' + nbF(L.penteCanalAtr) + ' ATR, largeur ≤ ' + nbF(L.canalLargeurMaxAtr) + ' ATR, ≥ ' + L.canalMin + ' bougies ; une droite de 2 points seulement : le prix revient entre eux à moins de ' + pcF(L.approche) + ' % de la largeur (ou de la tolérance) ; aucune clôture hors de la bande de sortie avant la naissance de la figure. '
        + 'Drapeau et fanion : un mât d’au moins ' + nbF(D.matAtr) + ' ATR en ' + D.matMin + ' à ' + D.matMax + ' bougies, puis une pause de ' + D.pauseMin + ' à ' + D.pauseMax + ' bougies, recul ≤ ' + pcF(D.retrait) + ' % du mât, largeur ≤ ' + pcF(D.largeur) + ' % du mât, pas plus de ' + pcF(D.pente) + ' % du mât dans son sens ; fanion si les droites se resserrent d’au moins ' + pcF(g.triConvergence) + ' %, drapeau sinon (jusqu’à ' + pcF(D.paralleleMax) + ' % d’écartement) ; un mât ne sert qu’une fois. '
        + 'Délais : ' + g.expiration + ' bougies pour valider, ' + g.horizon + ' pour atteindre l’objectif (objectif et invalidation jugés tous deux en clôture). À l’écran : au plus ' + g.formesMax + ' figures en Expert (une seule en Débutant) ; une figure invalidée reste ' + g.garderInvalide + ' bougies, une ébauche annulée ' + g.garderEbauche + ', un objectif atteint ' + g.garderFini + ' (Expert). « Échantillon faible » sous ' + g.echantillonFaible + ' cas. Repère sans forme : au plus ' + g.temoinDeparts + ' départs rejoués.';
    },
    lectures: [
      { s: 'convention', t: 'Objectifs théoriques : la hauteur de la figure reportée depuis la ligne franchie (doubles, triples, épaule-tête-épaule, rectangle), la largeur à l’ouverture pour les triangles, biseaux et canaux, la longueur du mât pour les drapeaux et fanions. Des conventions de l’usage, non garanties.' },
      { s: 'convention', t: 'Invalidations : une clôture au-delà de l’extrême (doubles, triples), de la tête puis, une fois validée, de l’épaule droite (épaule-tête-épaule), retour au-delà du milieu de la figure (deux droites, rectangle), recul de plus de la moitié du mât ou retour au-delà de l’extrême de la pause — sous son plus bas après une sortie par le haut, au-dessus de son plus haut après une sortie par le bas (drapeaux).' },
      { s: 'débattu', t: 'Le sens « attendu » d’une figure est débattu : un biseau montant se lirait à la baisse, un drapeau dans le sens du mât, un épaule-tête-épaule comme un retournement. La page ne l’affirme pas : en Expert, elle montre à côté le partage mesuré des sorties (vers le haut, vers le bas) sur l’historique chargé.' },
      { s: 'débattu', t: 'Les figures chartistes sont subjectives dans la littérature : deux analystes ne tracent pas la même. Ici la détection suit des règles fixes, donc reproductibles ; une règle fixe n’est pas une preuve d’efficacité.' },
      { s: 'mesuré', t: 'Bilan : le même détecteur est rejoué sur tout l’historique chargé, sans regarder l’avenir. Une figure compte depuis la clôture où son dernier pivot devient connu ; on compte les figures repérées, les validations, les objectifs atteints avant invalidation, les invalidations, les figures encore ouvertes ; pour les ébauches, combien de débuts sont devenus une figure, puis une figure validée. Un double devenu triple ne peut plus être validé : il sort du dénominateur des validations.' },
      { s: 'mesuré', t: 'L’objectif et l’invalidation ne sont pas à la même distance du point de validation : une partie des objectifs atteints s’explique par cette géométrie seule. D’où le repère sans forme : depuis n’importe quelle bougie, les mêmes distances (en ATR) et le même sens, la même règle ; l’écart entre les deux est jugé avec un intervalle de Wilson à 95 %. Un écart n’est pas une preuve.' },
      { s: 'convention', t: 'Choix de la page (raisonnement) : quand un nouveau sommet ou creux touche une droite, les droites sont refaites (recalage) et la figure garde son nom et son début ; une figure invalidée reste quelques bougies, en pointillés barrés d’une ✗ et de plus en plus pâle, à sa place même si une autre figure la recouvre, pour qu’on voie qu’elle est tombée et pourquoi ; la ✗ se pose sur le niveau qui l’a fait tomber, jamais sur un prix de clôture ; une figure au délai écoulé (–) ou sans suite (○) passe en pointillés sans croix : elle n’a pas été invalidée. Une figure validée porte un trait fin à son niveau d’invalidation, jusqu’à la bougie en cours. Un double qui devient triple le dit (« Devenu triple creux ») et garde sa place ; double et triple sur les mêmes creux ne comptent qu’une fois au bilan. La bulle Expert cite les dernières figures invalidées (« Invalidées récemment ») et, à part, celles restées sans suite (« Sans suite récemment ») et les ébauches annulées, tirées du même rejeu.' },
    ],
    limites: 'Le bilan ne porte que sur l’historique CHARGÉ (son nombre de bougies et sa durée sont indiqués) et sur l’intervalle affiché : ce n’est ni une probabilité, ni une règle générale. Les échantillons sont petits : « trop peu de cas » est fréquent. Une ébauche n’est pas une figure : son dernier sommet ou creux peut encore changer. Les figures à droites en pente ont des niveaux qui bougent à chaque bougie (la bulle dit les niveaux du moment). Fanions et épaule-tête-épaule sont rares sur les petits intervalles. Seules les figures dont le dernier point est dans la vue sont montrées.',
  },
  guide_suite: {
    titre: 'Guide — et ensuite ?', page: 'guide', nature: 'convention',
    titreDeb: 'Et après un repère ?',
    simpleDeb: 'En mode Débutant, rien n’est dessiné pour la suite : touchez un repère (ou la phrase) pour lire « si le prix finit au-delà de ce repère, le repère suivant est … ». Une condition, pas une prévision. Les chemins dessinés sont en mode Expert.',
    simple: 'Deux chemins conditionnels à droite de la dernière bougie : « si clôture au-dessus de X, prochain niveau Y » et « si clôture sous Z, prochain niveau W ».',
    formule: P => 'X et Z : le premier niveau nommé au-dessus et au-dessous du prix ; Y et W : le suivant de chaque côté. Prix DANS une bande : X et Z sont ses deux bords. Marge de dessin : ' + pcF(P.guide.futur) + ' % de la largeur du tracé, entre ' + P.guide.futurMinPx + ' et ' + P.guide.futurMaxPx + ' pixels, au plus ' + pcF(P.guide.futurMaxFraction) + ' % du tracé.',
    lectures: [
      { s: 'convention', t: 'X, Y, Z et W sont des niveaux nommés du Guide, jamais des prix inventés.' },
      { s: 'convention', t: 'Les deux chemins sont montrés ensemble, avec le même poids : aucun n’est privilégié, aucune probabilité n’est calculée. Le seuil est le bord le plus éloigné de la première bande (une clôture au-delà sort de la bande) ; un niveau publié garde son heure.' },
    ],
    limites: 'Une condition n’est pas une prévision. La marge à droite des bougies reçoit ces chemins et les flèches des scénarios du matin : elle disparaît quand rien ne s’y dessine (Guide masqué ou mode Débutant, et aucune flèche de scénario ; en Débutant, seule la flèche du scénario montré l’ouvre), et se referme d’un pas de bougie par bougie quand la vue quitte la dernière bougie. Les deux chemins sont écrits dans la même forme, la plus complète qui tient pour les deux ; même la plus courte garde la condition (« si > X → Y »). Sans place pour les deux, ils sont réunis dans une seule boîte ; jamais un seul des deux.',
  },
  // ── Les scénarios du matin (js/scenarios.js) : fichier previsions.json, branche « previsions » ──
  scenarios: {
    titreDeb: 'Scénarios du matin',
    simpleDeb: 'Chaque matin, Claude (une IA) écrit trois scénarios pour les 24 h qui suivent et les classe du plus au moins probable, sans pourcentage. L’écran Débutant montre le n° 1 (son libellé près de sa zone ; s’il ne tient plus, le suivant encore en cours) et une ligne qui dit où il en est ; touchez-les pour les trois. Une hypothèse, jamais un conseil.',
    titre: 'Scénarios du matin', page: 'scenarios', nature: 'convention',
    simple: 'Chaque matin, Claude (une IA) écrit trois scénarios pour les prochaines 24 h environ, à partir de son analyse du marché, et les classe du plus au moins probable, SANS pourcentage. Chaque niveau a une origine nommée (plus haut d’hier, mur d’options…) et se lit comme une zone : le niveau plus ou moins une marge. Le graphique les dessine et suit en direct ce que les bougies en font. Une description, jamais un conseil.',
    formule: P => 'Point du matin : ' + pointMots(P) + ', BTCUSDT seulement. Zone : niveau × (1 ± marge du fichier). Une bougie touche une zone si son plus bas est sous le haut de la zone et son plus haut au-dessus du bas. Chemin : chaque cible dans une bougie plus tardive que la précédente ; invalidation touchée d’abord = invalidé. Range : sorti si une bougie dépasse une borne de plus de la marge. Suivi en direct : seules les bougies ENTIÈRES dans la fenêtre comptent, sur des bougies de ' + Math.round(P.scenarios.suiviPasMax / 60) + ' min au plus. « Échantillon faible » sous '
      + P.scenarios.echantillonFaible + ' matins notés. Fichier relu toutes les ' + (typeof CADENCES !== 'undefined' ? Math.round(CADENCES.previsions_lue / 60000) : '?') + ' minutes, onglet visible. Choix gardé dans ce navigateur (clé samsara-scenarios-v1).',
    lectures: [
      { s: 'convention', t: 'Le rang (1, 2, 3) est un CLASSEMENT : le 1 est jugé plus probable que le 2, le 2 plus que le 3. Aucun pourcentage n’est montré. Le scénario de la semaine court sur plusieurs matins et ne compte pas dans la mesure.' },
      { s: 'mesuré', t: 'Le seul chiffre de réussite montré : « Ordre du premier mouvement juste N fois sur M matins », tiré du journal. Chaque matin compte le chemin le mieux classé qui a une invalidation (rangs 1 à 3 : si le 1 n’en a pas, c’est le 2 qui est mesuré). Ne comptent que les matins où il a touché sa 1re zone ou son invalidation ; « juste » = la 1re zone d’abord. C’est la mesure que suit le journal ; seule, et tant qu’il y a peu de matins notés (« échantillon faible »), elle ne prouve rien.' },
      { s: 'convention', t: 'Les états de l’encadré (« 1re cible touchée entre 10:30 et 10:45 », « invalidation touchée d’abord… », « ordre inconnu ») sont un SUIVI EN DIRECT sur les bougies de l’intervalle affiché : un affichage, au créneau d’une bougie près, sur les bougies de 1 h au plus. La note officielle est celle du journal, faite mécaniquement le lendemain matin sur des bougies d’une minute ; quand elle existe, c’est elle qui s’affiche. Hors de l’encadré complet (libellés, ligne repliée), un état calculé par la page porte « (en direct) ». Si l’historique chargé ne remonte pas jusqu’au point (bougies 1 min), le suivi se dit « incomplet » plutôt que de deviner.' },
      { s: 'débattu', t: 'Les niveaux venus d’un modèle d’options (murs de calls ou de puts, zéro gamma) sont marqués « (modèle) » : ils reposent sur une hypothèse sur la position des teneurs de marché.' },
      // Pendant la journée (js/scenarios.js, section 5) : aucune nouvelle prévision, les scénarios du
      // matin recalculés. Un paragraphe par mode (classe .debutant-seul / .expert-seul).
      { s: 'convention', mode: 'debutant', t: 'Pendant la journée, aucune nouvelle prévision : la page recalcule seulement où en est chaque scénario du matin. Une zone touchée prend une coche ✓ ; un scénario qui ne tient plus prend une croix ✗ (ou le mot « indécis » si la page ne peut pas trancher) ; pendant l’heure qui suit, la ligne le dit (elle garde alors sa place), et sa zone s’efface en une heure environ. « Suit le mieux le prix » et ce que dit la ligne ne changent qu’à la fin d’un quart d’heure, ou quand un scénario se ferme. « Suit le mieux le prix » nomme le scénario dont le prix est le plus près de ce qu’il décrit, décidé tous les quarts d’heure, et changé seulement si un autre est nettement plus près : une règle de calcul, pas une prévision ni une chance de réussite, et le classement du matin ne change pas. « Aucun scénario ne tient plus » : aucun des trois n’est encore en cours ni réalisé ; pas de nouvelle prévision avant le prochain point du matin.' },
      { s: 'convention', mode: 'expert', get t() { return journeeExpert(typeof PARAM !== 'undefined' ? PARAM : null); } },
    ],
    limites: 'Ce n’est pas une prévision garantie ni une indication de quoi faire : trois scénarios sont montrés ensemble, avec leur rang et leur invalidation. Une bougie qui touche deux zones à la fois ne dit pas laquelle a été touchée la première : l’état le dit (« ordre inconnu »). Sans fichier lisible, rien n’est dessiné et l’encadré le dit en une ligne. Masquable dans « + Indicateurs » (catégorie Guide), ou dans « + Affichage » en mode Débutant.',
  },
  // ── Le dessin lui-même ──
  // La forme d'une bougie est une CONVENTION du thème (jeton --bougie-forme) : la fiche dit celle
  // du thème courant, lue dans le code du tracé (FORMES_BOUGIE, BOUGIE_DENSE_PX, js/app.js).
  bougies: {
    titreDeb: 'Le dessin des prix',
    simpleDeb: 'Chaque petit bâton du graphique résume une période (un quart d’heure, une heure…) : le prix au début, le plus haut, le plus bas et le prix à la fin. Le thème choisit la forme du dessin, jamais les valeurs.',
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
      { s: 'convention', t: 'Dans les thèmes à bougies « creuses en hausse » : corps creux en hausse, plein en baisse, la convention des cotes imprimées d’une seule encre — la hausse se lit à la forme, pas seulement à la couleur.' },
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
  // ── Indicateurs du menu sans fiche jusqu'au 09/10/2026 (formule construite avec PARAM) ──
  ichimoku: {
    titre: 'Ichimoku (nuage)', page: 'ichimoku',
    simple: 'Deux lignes de milieu de fourchette (rapide et lente) et un « nuage » coloré, décalé vers la droite, qui montre la zone d’équilibre récente du prix.',
    formule: P => 'Ligne rapide (tenkan) = (plus haut + plus bas) / 2 sur ' + P.ichimoku.tenkan + ' bougies ; ligne lente (kijun) = idem sur ' + P.ichimoku.kijun
      + ' ; nuage : bord A = (tenkan + kijun) / 2, bord B = (plus haut + plus bas) / 2 sur ' + P.ichimoku.senkouB + ', tous deux reportés de ' + P.ichimoku.kijun
      + ' bougies vers la droite. Nuage de la couleur des bougies haussières quand A ≥ B, de celle des baissières sinon. La partie du nuage au-delà de la dernière bougie et la ligne retardée (chikou) ne sont pas dessinées.',
    lectures: [
      { s: 'usuel', t: 'Prix au-dessus du nuage : tendance haussière sur cet horizon ; au-dessous : baissière ; dedans : zone d’hésitation.' },
      { s: 'usuel', t: 'Un nuage épais est lu comme une zone difficile à traverser ; un nuage fin, comme une zone fragile.' },
      { s: 'convention', t: 'Ligne rapide qui croise la ligne lente : lu comme un changement de rythme, en retard sur le prix.' },
    ],
    limites: 'Réglages pensés pour les marchés actions japonais des années 1960 ; tous des milieux de fourchette, donc en retard. Rien n’est dessiné tant que la fenêtre la plus longue n’est pas chargée.',
  },
  sar: {
    titre: 'Parabolic SAR', page: 'sar',
    simple: 'Des points posés sous les bougies quand le prix monte, au-dessus quand il baisse. Ils se rapprochent du prix à mesure que le mouvement dure.',
    formule: P => 'SAR de Wilder (même algorithme que TradingView, ta.sar) : SARₜ = SARₜ₋₁ + AF × (EP − SARₜ₋₁), EP = extrême du mouvement en cours ; AF part de ' + nbF(P.sar.pas)
      + ', monte de ' + nbF(P.sar.pas) + ' à chaque nouvel extrême, plafonné à ' + nbF(P.sar.max) + '. Le point change de côté quand le prix le traverse.',
    lectures: [
      { s: 'usuel', t: 'Points sous le prix : mouvement haussier en cours ; au-dessus : baissier. Le changement de côté marque la fin du mouvement précédent.' },
      { s: 'usuel', t: 'Souvent utilisé comme niveau de sortie qui suit le prix (« stop suiveur »), plus que comme indication de direction.' },
    ],
    limites: 'Dans un marché sans tendance, les points changent de côté sans arrêt et ne disent rien.',
  },
  obv: {
    titre: 'OBV — On-Balance Volume', page: 'obv',
    simple: 'Un compteur de volume : il ajoute le volume des bougies qui finissent en hausse et retire celui des bougies qui finissent en baisse.',
    formule: () => 'OBVₜ = OBVₜ₋₁ + volume si clôture > clôture précédente, − volume si clôture < clôture précédente, inchangé sinon. Part de 0 à la première bougie chargée.',
    lectures: [
      { s: 'usuel', t: 'Seule la PENTE compte : un OBV qui monte veut dire que plus de volume s’échange sur les bougies haussières que sur les baissières.' },
      { s: 'débattu', t: 'Un OBV qui ne suit pas le prix (le prix monte, l’OBV stagne) est lu comme un mouvement peu soutenu. Lecture répandue, rarement vérifiée.' },
    ],
    limites: 'Sa valeur absolue n’a pas de sens : elle dépend de la première bougie chargée. Tout le volume d’une bougie est compté d’un seul côté, même pour une clôture à peine différente.',
  },
  mfi: {
    titre: 'MFI — Money Flow Index', page: 'mfi',
    simple: 'Un RSI qui tient compte du volume : de 0 à 100, il compare l’argent échangé sur les bougies dont le prix moyen monte (par rapport à la bougie d’avant) et sur celles où il baisse.',
    formule: P => 'Prix typique = (H + B + C) / 3 ; flux = prix typique × volume. Sur ' + P.mfi.periode + ' bougies : flux positifs (prix typique plus haut que celui de la bougie précédente) et négatifs (plus bas) ; MFI = 100 − 100 / (1 + positifs / négatifs).',
    lectures: [
      { s: 'convention', t: 'Au-dessus de 80 : zone haute ; sous 20 : zone basse (lignes tracées sur le sous-graphe).' },
      { s: 'usuel', t: 'Se lit comme le RSI, avec le volume en plus : il réagit davantage aux bougies très échangées.' },
    ],
    limites: 'Corrélé au RSI : ne pas les compter comme deux signaux. Volume Binance seulement.',
  },
  williamsR: {
    titre: 'Williams %R', page: 'williamsR',
    simple: 'Où se trouve le prix dans sa fourchette récente, de 0 (au plus haut) à −100 (au plus bas).',
    formule: P => '%R = (plus haut ' + P.williamsR.periode + ' − clôture) / (plus haut ' + P.williamsR.periode + ' − plus bas ' + P.williamsR.periode + ') × −100.',
    lectures: [
      { s: 'convention', t: 'Au-dessus de −20 : haut de la fourchette ; sous −80 : bas de la fourchette (lignes tracées sur le sous-graphe).' },
      { s: 'usuel', t: 'C’est le stochastique rapide retourné : il dit la même chose, sur une autre échelle.' },
    ],
    limites: 'Très corrélé au stochastique et au RSI : ne pas les compter comme des signaux séparés.',
  },
  cci: {
    titre: 'CCI — Commodity Channel Index', page: 'cci',
    simple: 'L’écart entre le prix et sa moyenne, mesuré en « écarts habituels » : il dit si le prix s’est éloigné de sa normale récente.',
    formule: P => 'Prix typique = (H + B + C) / 3 ; CCI = (prix typique − sa moyenne sur ' + P.cci.periode + ') / (0,015 × écart moyen absolu sur ' + P.cci.periode + ').',
    lectures: [
      { s: 'convention', t: 'Au-dessus de +100 : prix nettement au-dessus de sa normale ; sous −100 : nettement au-dessous (lignes tracées). Le 0,015 de la formule est choisi pour que la plupart des valeurs restent entre −100 et +100.' },
      { s: 'usuel', t: 'Un CCI qui reste longtemps au-delà de ±100 est lu comme une tendance forte plutôt que comme un excès.' },
    ],
    limites: 'Non borné : pas d’extrême universel. Corrélé aux autres oscillateurs.',
  },
  ao: {
    titre: 'Awesome Oscillator', page: 'ao',
    simple: 'Des barres qui montrent si le prix récent (court terme) est au-dessus ou au-dessous du prix moyen d’une période plus longue : la vitesse du mouvement.',
    formule: P => 'Milieu de bougie = (H + B) / 2 ; AO = moyenne simple ' + P.ao.rapide + ' du milieu − moyenne simple ' + P.ao.lente + ' du milieu.',
    lectures: [
      { s: 'usuel', t: 'Barres au-dessus de 0 : le court terme est au-dessus du long terme (élan haussier) ; au-dessous : élan baissier. Ici, la couleur des barres dit seulement de quel côté de 0 elles sont (dans l’AO classique, elle dit si la barre grandit).' },
      { s: 'usuel', t: 'Barres qui raccourcissent : l’élan faiblit, sans dire si le prix va se retourner.' },
    ],
    limites: 'En retard sur le prix, comme toute différence de moyennes. Proche du MACD : ne pas les compter deux fois.',
  },
  fib: {
    titre: 'Retracements de Fibonacci', page: 'fib',
    get simple() { return 'Des lignes posées à des fractions fixes (' + (typeof PARAM !== 'undefined' ? niveauxFib(PARAM, x => x > 0 && x < 1).join(', ') : 'les niveaux de Fibonacci') + ') entre le plus haut et le plus bas de la partie visible du graphique.'; },
    formule: P => 'Plus haut et plus bas des bougies VISIBLES ; niveaux ' + P.fib.niveaux.map(x => pcF(x) + ' %').join(', ') + '. Si la dernière clôture visible est au-dessus de la première, ils sont mesurés depuis le haut (retour d’une hausse), sinon depuis le bas.',
    lectures: [
      { s: 'débattu', t: 'Beaucoup de participants regardent ces niveaux, ce qui peut leur donner du poids ; aucune raison mathématique ne fait réagir un prix à 61,8 %.' },
      { s: 'usuel', t: 'Lecture courante : un repli qui s’arrête vers 38,2 % ou 50 % garde la tendance intacte ; au-delà de 78,6 %, le mouvement précédent est presque effacé.' },
    ],
    limites: 'Les lignes bougent quand on déplace ou zoome le graphique : elles dépendent de ce qui est visible, pas d’un sommet choisi.',
  },
  vp: {
    titre: 'Profil de volume', page: 'vp',
    simple: 'Des barres horizontales au bord droit : combien a été échangé à chaque niveau de prix sur la partie visible du graphique. Une barre et un trait plus marqués (le POC) signalent le prix le plus échangé.',
    formule: P => 'Échelle de prix de la vue découpée en tranches (environ ' + P.vp.dollarsParTranche + ' $, entre ' + P.vp.tranchesMin + ' et ' + P.vp.tranchesMax
      + ' tranches) ; le volume de chaque bougie visible est ajouté à chaque tranche entre son plus bas et son plus haut. POC = tranche la plus chargée ; zone de valeur = les tranches les plus chargées jusqu’à ' + pcF(P.vp.zoneValeur) + ' % du total (pointillés).',
    lectures: [
      { s: 'usuel', t: 'Les prix très échangés sont lus comme des zones d’accord où le prix ralentit ; les creux du profil, comme des zones que le prix traverse vite.' },
      { s: 'usuel', t: 'La zone de valeur (pointillés) encadre l’essentiel des échanges de la période visible.' },
    ],
    limites: 'Approximation : le volume d’une bougie est compté sur toute sa hauteur, faute de savoir à quel prix il s’est échangé. Change quand on déplace ou zoome la vue.',
  },
  liq: {
    titre: 'Ordres en attente (carte)', page: 'liq',
    simple: 'Une carte de chaleur posée en transparence sur le graphique : là où beaucoup d’ordres d’achat ou de vente attendaient dans le carnet de Binance, minute par minute.',
    formule: () => 'heatmap.json, publié toutes les ' + CADENCES.attendue_min + ' min par le serveur : ' + grilleLiq().colonne + ', ' + grilleLiq().tranche + ' ; la chaleur d’une case est la somme des BTC posés dans la tranche. BTC/USDT seulement. En Expert, l’âge de la dernière colonne est écrit en haut à droite.',
    lectures: [
      { s: 'mesuré', t: 'Une bande marquée et horizontale : beaucoup de BTC restés en attente longtemps dans cette tranche de prix (un ou plusieurs ordres).' },
      { s: 'usuel', t: 'Les gros ordres en attente sont surveillés : tiennent-ils, sont-ils absorbés ou retirés quand le prix approche ? La carte dit où ils étaient, pas ce que fera le prix.' },
    ],
    get limites() { return 'Un ordre peut être retiré à tout moment, avant que le prix n’arrive. La carte n’est publiée que toutes les ' + CADENCES.attendue_min + ' min : sa colonne la plus récente a de quelques minutes à ' + CADENCES.attendue_min + ' min, plus le temps d’envoi et de cache (quelques minutes) ; son âge est écrit en haut à droite en Expert. La carte détaillée, en direct, est sur la page « Carte ».'; },
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
  return 'Pendant la journée (aucune nouvelle prévision) : écart relatif d’un chemin = d(prochaine zone non touchée) / (d(prochaine zone) + d(invalidation)), distances du prix aux bords des zones ; d’un range = 1 − d(bord toléré le plus proche) / demi-largeur tolérée. Comparer un range et un chemin par cet écart est une convention, pas une probabilité. '
    + 'Le nom du plus petit écart se décide à chaque clôture de ' + quart + ' (bougies plus courtes regroupées ; en 1 h, aucun nom), au départ le rang 1 du matin, et ne change qu’avec ' + nbF(Q.ecartChangement) + ' d’avance ; la bougie en cours ne le change que si elle ferme le scénario nommé. '
    + 'À une clôture, un autre scénario peut avoir un écart un peu plus petit sans avance nette : l’encadré le dit (« Plus petit écart : 1 · nom gardé : 3 ») ; « ◂ » marque le plus petit écart de la dernière clôture (il peut différer du nom gardé). Entre deux clôtures, les distances suivent le prix ; le nom, « ◂ » et la phrase de l’encadré ne changent qu’à une clôture ou quand un scénario se ferme. '
    + '« Trop tôt pour départager » pendant ' + debut + ' tant que le prix reste à moins de ' + nbF(Q.departageMouvementPct) + ' % du prix du point, puis plus jamais de la journée. Un seul ouvert : « seul encore en cours », jamais « suit le mieux ». '
    + 'Aucun nom quand le plus petit écart est d’au moins ' + nbF(Q.colle) + ' (« aucun ne colle » : chacun plus près de sa limite que de sa zone ; seuil de convention). « Au-delà de tous les niveaux du matin » : le prix est à plus ' + marges + ' au-delà du bord extérieur de la zone la plus extrême. '
    + 'En 4 h ou 1 jour, rien n’est dit de la journée (bougies trop larges). Une cible ne prend sa coche que dans l’ordre et avant l’invalidation. Un scénario invalidé s’efface en ' + nbF(Q.fonduMinutes) + ' min après le créneau du contact (une note du journal, depuis son heure de résolution) ; sa croix, ses niveaux et sa raison restent, plus pâles. '
    + 'Stabilité mesurée de la règle, avec les réglages de cette mesure (clôtures de 15 min, 0,12 d’avance) : 1,65 changement du nom par jour en moyenne (médiane 1, 90e centile 4), sur des scénarios synthétiques construits avec les règles v1 (modèle) rejoués sur les bougies BTCUSDT 15 min du 06/09/2025 au 08/10/2026 (398 matins).';
}
const echapF = s => String(s === undefined || s === null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// ─── Comment s'en servir : les deux couches du site (Guide, scénarios) ─────────────
// Elles ne sont pas des indicateurs de marché : leur fiche dit comment lire l'écran du site.
// Chaîne simple, ou { exp, deb } quand le Débutant voit un écran différent.
const USAGES = {
  guide: { exp: 'Laissez-le affiché pour savoir où vous en êtes : la phrase dit le mouvement, les bandes les prix à surveiller, et les deux chemins à droite le niveau suivant si une bougie clôture au-delà d’un niveau (une condition, pas une prévision). Une figure en tirets se forme encore et se redessine avec le prix ; en trait plein, elle est validée (deux clôtures au-delà de sa ligne, ou une et un retour réussi) ; en pointillés, elle est finie sans sa cible : barrée ✗ si elle a été invalidée ou annulée, « – » si son délai s’est écoulé après la validation, « ○ » si elle est restée sans suite. Survolez un libellé pour son origine et son bilan mesuré.',
    deb: 'Lisez la phrase du haut, puis regardez les deux repères : tant que le prix reste entre eux, rien de neuf. Une figure en tirets est encore en train de se dessiner ; en trait plein, elle est validée ; barrée d’une croix, elle ne tient plus. Touchez une étiquette pour le détail.' },
  scenarios: { get exp() { return 'Le matin, lisez le chemin de chaque scénario et son invalidation. Pendant la journée, sans nouvelle prévision, l’encadré dit quelles zones ont été touchées (✓), quel scénario ne tient plus (✗) et lequel suit le mieux le prix (le nom, revu à chaque clôture de ' + quartMots() + ' ; « ◂ » marque le plus petit écart relatif à cette clôture, qui peut différer du nom gardé ; pas une probabilité). Un scénario invalidé se lit comme « l’hypothèse du matin ne tient plus ».'; },
    deb: 'Regardez le scénario n° 1 et sa zone. Pendant la journée, la ligne du haut dit ce qui a changé depuis le matin : une zone touchée ✓, un scénario qui ne tient plus ✗, et celui qui suit le mieux le prix. Touchez-la pour les trois scénarios.' },
};
for (const k of Object.keys(USAGES)) if (FICHES[k]) FICHES[k].usage = USAGES[k];
/** La ligne « Comment s'en servir » d'une fiche, en HTML (les deux textes, chacun dans sa classe, s'ils diffèrent). */
function usageHtml(id) {
  const u = FICHES[id] && FICHES[id].usage;
  if (!u) return '';
  return typeof u === 'string' ? echapF(u) : motModes(u.exp, u.deb);
}

// ─── Comment les traders l'utilisent · comment c'est calculé ─────────────────────
// Demande du 10/10/2026 : pour chaque indicateur, l'usage COURANT chez les traders (ce que
// décrivent les manuels d'analyse technique et les plateformes), et le calcul en mots simples
// — rien de propre à ce site ni à son propriétaire. Une pratique décrite n'est pas un conseil
// (tests/test_fiches.js) ; elle ne dit pas non plus que la pratique marche.
// TRADERS : une chaîne, ou une fonction de PARAM quand le texte cite un paramètre de la page.
// CALCUL : une fonction de PARAM pour un indicateur de la page (les nombres sont ceux du calcul) ;
// pour un champ du fichier, une fonction aussi dès qu'il cite un paramètre publié (meta.champs :
// fenêtre, tranche, échéances), lu à l'affichage, sinon une chaîne (sa formule exacte, publiée,
// reste en mode Expert). Aucun nombre avec unité écrit en dur ici (tests/test_fiches.js).
// Une pratique décrite dit ce que les traders SURVEILLENT, jamais ce que fera le prix : ni
// rebond, ni « retour vers le milieu », ni stop à placer (règle du propriétaire).
const TRADERS = {
  // ── Indicateurs du graphique ──
  rsi: 'Dit si un mouvement récent a été fort ou s’essouffle. Au-dessus de 70 (« suracheté ») ou sous 30 (« survendu »), les traders surveillent le mouvement de près ; en tendance, le RSI peut y rester longtemps, et beaucoup y lisent alors un mouvement puissant. Ils guettent aussi les divergences (nouveau plus haut du prix, pas du RSI : essoufflement) et le passage de 50. Aucune de ces zones ne dit ce que fera le prix.',
  ema: 'Repère et suit la tendance : prix au-dessus d’une moyenne qui monte, tendance haussière. Les croisements sont suivis (50 au-dessus de 200 : « golden cross » ; l’inverse : « death cross »). Les moyennes 20, 50 et 200 sont très surveillées lors d’un repli.',
  bb: 'Mesure la volatilité. Bandes resserrées : marché calme, on guette la sortie. En range, toucher une bande est lu comme un excès ; en tendance, la longer comme un mouvement fort. La moyenne du milieu sert de repère.',
  vwap: 'Le prix moyen payé dans la journée. Au-dessus, les acheteurs de la séance dominent ; au-dessous, les vendeurs. Les institutions y comparent leurs exécutions, et beaucoup surveillent les retours du prix vers lui.',
  ichimoku: 'Lecture complète de la tendance : prix au-dessus du nuage, haussier ; au-dessous, baissier ; dedans, neutre. On suit aussi le croisement des lignes rapide et lente, et la couleur du nuage projeté vers l’avant (non dessiné ici). Un nuage épais est lu comme difficile à traverser.',
  sar: 'Suit une tendance et sert de stop qui suit le prix. Points sous les bougies : hausse ; au-dessus : baisse. Quand ils changent de côté, beaucoup lisent un retournement. Nombreux faux signaux sans tendance.',
  volume: 'Juge la conviction d’un mouvement. Une cassure sur un volume fort est jugée plus fiable ; une hausse sur un volume qui baisse, essoufflée. Un pic extrême marque souvent la fin d’un mouvement (capitulation ou euphorie).',
  macd: 'Suit la dynamique de la tendance. On regarde le croisement de la ligne MACD et de son signal (au-dessus : haussier ; au-dessous : baissier), son passage de zéro, et l’histogramme, qui grandit quand le mouvement accélère. Aussi les divergences avec le prix.',
  stoch: 'Situe la clôture dans la fourchette récente. Au-dessus de 80 : zone haute ; sous 20 : zone basse ; on surveille le croisement de %K et %D dans ces zones. Surtout utilisé en range : en tendance, il peut rester collé à un bord. Une zone haute ou basse ne dit pas ce que fera le prix.',
  atr: 'L’amplitude habituelle d’une bougie, sans direction. Les traders s’en servent comme d’une échelle : juger si un mouvement est inhabituel, dire une distance au prix « en ATR ». Il ne dit ni le sens ni la suite du mouvement.',
  obv: 'Dit si le volume accompagne le prix. On lit sa pente : il monte avec le prix, la hausse est confirmée ; il stagne ou baisse pendant que le prix monte (divergence), la hausse est jugée peu soutenue.',
  mfi: 'Un RSI qui tient compte du volume. Au-dessus de 80 : zone haute ; sous 20 : zone basse. On cherche aussi les divergences avec le prix.',
  williamsR: 'Situe la clôture dans la fourchette récente, de 0 à −100 (le stochastique rapide retourné). Au-dessus de −20 : zone haute ; sous −80 : zone basse. Sert surtout à repérer des essoufflements en range.',
  cci: 'Mesure l’écart du prix à sa moyenne. Au-dessus de +100 : début d’un mouvement fort à la hausse ; sous −100 : à la baisse. En range, d’autres y lisent au contraire des excès. Aussi les divergences.',
  adx: 'La force d’une tendance, pas son sens. Au-dessus de 25 : marché en tendance (on suit la tendance) ; sous 20 : range. Le croisement de +DI et −DI dit quel camp pousse.',
  ao: 'L’élan du marché (Bill Williams, proche du MACD). On regarde le passage de zéro et des figures de barres : « soucoupe » (un creux du même côté de zéro), « deux pics ». La couleur dit classiquement si la barre grandit ; ici, seulement son côté de zéro.',
  sr: 'Les prix où le marché a déjà fait demi-tour. Les traders les surveillent quand le prix y revient : le niveau tient-il, ou cède-t-il ? Beaucoup d’ordres s’y accumulent. Un niveau cassé change souvent de rôle (l’ancien support devient résistance). Un niveau ne dit pas ce que fera le prix.',
  fib: P => 'Estime jusqu’où un repli peut aller avant que la tendance reprenne. Niveaux tracés entre un plus haut et un plus bas marquants'
    + (niveauxFib(P, x => x > 0.3 && x < 0.7).length ? ' ; ceux du milieu (' + niveauxFib(P, x => x > 0.3 && x < 0.7).join(', ') + ') sont les plus surveillés.' : '.'),
  vp: P => 'Les prix où l’on a le plus échangé. Le prix le plus échangé (POC) et la zone de valeur (' + pcF(P.vp.zoneValeur) + ' % des échanges) servent de repères : le prix ralentit souvent dans les zones chargées et traverse vite les zones creuses.',
  liq: 'Où de gros ordres attendaient dans le carnet (des « murs »). Les traders les surveillent quand le prix approche : tiennent-ils, sont-ils absorbés ou retirés ? Certains ordres ne sont posés que pour être vus. La carte dit où ils étaient, pas ce que fera le prix.',
  // ── Champs du fichier ──
  gex: 'Estime si les teneurs de marché d’options amortissent ou amplifient les mouvements. GEX positif : marché calmé, prix attiré par les gros prix d’exercice ; négatif : mouvements amplifiés. Le « zéro gamma » est la frontière entre les deux.',
  ls: 'Le sentiment de la foule. Souvent lu à contre-courant : quand presque tous sont acheteurs, des liquidations peuvent amplifier une baisse, et inversement.',
  top_ls: 'Le positionnement des plus gros comptes. On le compare à celui de la foule ; s’ils divergent, beaucoup suivent les gros comptes.',
  taker: 'L’agressivité. Au-dessus de 1 : les acheteurs pressés dominent ; sous 1 : les vendeurs. On le compare au prix pour voir si la pression est absorbée.',
  funding: 'Jauge l’excès de levier. Très positif : beaucoup d’acheteurs à levier paient cher, risque de liquidations en cascade si le prix baisse. Négatif : l’inverse, avec un possible rachat forcé des vendeurs si le prix monte.',
  oi: 'Dit si l’argent entre ou sort des positions à levier. Prix et OI en hausse : de nouvelles positions portent la hausse. Prix en hausse, OI en baisse : des vendeurs se rachètent. Chute brutale de l’OI : souvent une vague de liquidations.',
  cvd: 'Dit qui, des acheteurs ou des vendeurs pressés, mène. Comparé au prix : les deux montent, la hausse est confirmée ; le prix monte mais le CVD baisse (divergence), des vendeurs absorbent les achats ou la hausse n’est pas agressive.',
  prime: 'Jauge la demande américaine, souvent associée aux institutions. Prime positive et durable : demande soutenue aux États-Unis ; négative : demande faible ou ventes américaines.',
  dxy: 'La force du dollar. Surveillé parce qu’un dollar qui monte a souvent coïncidé avec une baisse des actifs risqués, et l’inverse.',
  vix: 'La nervosité attendue des bourses : un thermomètre de l’appétit pour le risque. Un VIX qui bondit accompagne souvent des ventes d’actifs risqués, BTC compris.',
  carnet: 'Compare les ordres d’achat et de vente posés près du prix. On y cherche un déséquilibre, avec méfiance : des ordres peuvent être posés pour être vus puis retirés.',
  murs: 'Les prix où de gros ordres attendent : supports (achat) ou résistances (vente) possibles. On regarde s’ils tiennent, sont absorbés ou disparaissent quand le prix approche.',
  rsi_tf: 'Comme le RSI du graphique : zones au-dessus de 70 et sous 30, divergences, passage de 50. Comparer les échelles de temps du fichier montre si elles vont dans le même sens.',
  ema_tf: 'Comme les moyennes du graphique : prix au-dessus ou au-dessous, courte au-dessus ou au-dessous de la longue ; elles sont surveillées quand le prix s’en approche lors d’un repli.',
  croisement: 'Les croisements de moyennes sont lus comme des changements de tendance : la courte sous la longue, affaiblissement ; au-dessus, renforcement. Le célèbre « death cross » est la moyenne simple 50 sous la 200, en journalier.',
  sr_tf: 'Le plus haut et le plus bas récents servent de bornes : les traders surveillent le prix quand il s’en approche, et leur franchissement est lu comme une cassure de la fourchette.',
  amplitude: 'Dit si le marché a été agité ou calme. Une faible amplitude (compression) précède souvent un mouvement plus large, sans en dire le sens.',
  atr_tf: 'Comme l’ATR du graphique : une échelle du mouvement habituel, pour juger si un mouvement est inhabituel ; sans direction.',
  volume_tf: 'Une référence : une bougie bien au-dessus du volume moyen est jugée significative ; une cassure sur un volume faible, fragile.',
};
const CALCUL = {
  rsi: P => 'Moyenne des hausses et moyenne des baisses de clôture, lissées « à la Wilder » sur ' + P.rsi.periode + ' bougies (chaque nouvelle variation compte pour 1/' + P.rsi.periode + '). RSI = 100 − 100 / (1 + hausses / baisses) : de 0 à 100 ; 50 = hausses et baisses égales.',
  ema: () => 'EMA : moyenne des clôtures où les plus récentes pèsent plus (poids 2 / (N + 1)). SMA : somme des N dernières clôtures divisée par N. N est le nombre écrit dans le nom de la moyenne : son nombre de bougies.',
  bb: P => 'Milieu : moyenne simple des ' + P.bb.periode + ' dernières clôtures. Bandes : ce milieu ± ' + P.bb.ecarts + ' écarts-types de ces clôtures (leur dispersion autour de la moyenne).',
  vwap: P => 'Somme de (prix typique × volume) divisée par la somme des volumes, avec prix typique = (haut + bas + clôture) / 3. Remis à zéro à minuit UTC sous l’échelle journalière, sinon toutes les ' + P.vwap.ancrageBougies + ' bougies.',
  ichimoku: P => 'Ligne rapide : milieu du plus haut et du plus bas sur ' + P.ichimoku.tenkan + ' bougies ; ligne lente : idem sur ' + P.ichimoku.kijun + '. Nuage : moyenne des deux lignes, et milieu du plus haut et du plus bas sur ' + P.ichimoku.senkouB + ' bougies, décalés de ' + P.ichimoku.kijun + ' bougies vers la droite.',
  sar: P => 'Chaque bougie, le point avance vers l’extrême du mouvement (plus haut d’une hausse, plus bas d’une baisse) d’une fraction de l’écart : ' + nbF(P.sar.pas) + ' au départ, + ' + nbF(P.sar.pas) + ' à chaque nouvel extrême, jusqu’à ' + nbF(P.sar.max) + '. Franchi par le prix, il change de côté.',
  volume: () => 'La quantité échangée pendant la bougie, dans l’actif de base de la paire (des BTC pour BTC/USDT, des SOL pour SOL/USDT ; BTC/SOL reprend le volume de BTC/USDT), publiée par Binance. Couleur des bougies haussières si la bougie finit en hausse (ou à égalité), des baissières sinon.',
  macd: P => 'Ligne MACD : moyenne exponentielle des clôtures sur ' + P.macd.rapide + ' bougies moins celle sur ' + P.macd.lente + '. Signal : moyenne exponentielle du MACD sur ' + P.macd.signal + ' bougies. Histogramme : MACD − signal.',
  stoch: P => '%K = (clôture − plus bas) / (plus haut − plus bas) des ' + P.stoch.k + ' dernières bougies × 100 : 100 au plus haut, 0 au plus bas. %D : moyenne des ' + P.stoch.d + ' derniers %K.',
  atr: P => 'Vrai range de chaque bougie : le plus grand de haut − bas, |haut − clôture précédente|, |bas − clôture précédente| (les trous entre bougies comptent). ATR : sa moyenne lissée sur ' + P.atr.periode + ' bougies.',
  obv: () => 'Part de 0. Chaque bougie ajoute son volume si elle clôture plus haut que la précédente, le retire si elle clôture plus bas, ne change rien sinon.',
  mfi: P => 'Flux = prix typique (haut + bas + clôture) / 3 × volume. Sur ' + P.mfi.periode + ' bougies : flux positifs, ceux des bougies dont le prix typique dépasse celui de la bougie précédente ; flux négatifs, ceux des bougies où il est plus bas (à égalité, aucun des deux). MFI = 100 − 100 / (1 + positifs / négatifs).',
  williamsR: P => '%R = (plus haut − clôture) / (plus haut − plus bas) des ' + P.williamsR.periode + ' dernières bougies × −100 : 0 au plus haut, −100 au plus bas.',
  cci: P => 'CCI = (prix typique − sa moyenne sur ' + P.cci.periode + ' bougies) / (0,015 × écart moyen à cette moyenne), avec prix typique = (haut + bas + clôture) / 3. Le 0,015 met la plupart des valeurs entre −100 et +100.',
  adx: P => 'Mouvement positif : hausse du plus haut ; négatif : baisse du plus bas ; seul le plus grand compte, l’autre vaut 0. Divisés par le vrai range et lissés sur ' + P.adx.periode + ' bougies : +DI et −DI. ADX : moyenne lissée sur ' + P.adx.periode + ' de |+DI − −DI| / (+DI + −DI) × 100.',
  ao: P => 'Milieu de chaque bougie = (haut + bas) / 2. AO = moyenne simple de ces milieux sur ' + P.ao.rapide + ' bougies moins celle sur ' + P.ao.lente + '.',
  sr: P => 'Sommets et creux (« pivots ») des ' + P.sr.bougies + ' dernières bougies, regroupés quand ils sont proches. Chaque groupe reçoit un score : la somme, sur ses pivots, de leur récence (un poids divisé par deux ' + demiVieMots(P) + ') multipliée par le logarithme de leur volume. Les groupes au plus fort score sont gardés ; ce sont des demi-tours, pas des contacts comptés. Les niveaux des échelles de temps supérieures s’y ajoutent.',
  fib: P => 'Plus haut et plus bas des bougies visibles ; niveaux à ' + niveauxFib(P).join(', ') + ' de l’écart, comptés depuis le haut si le prix a monté sur la vue, depuis le bas sinon.',
  vp: P => 'Prix de la vue découpés en tranches ; le volume de chaque bougie visible est ajouté à chaque tranche entre son bas et son haut. POC : la tranche la plus remplie. Zone de valeur : les plus remplies jusqu’à ' + pcF(P.vp.zoneValeur) + ' % du volume.',
  liq: () => grilleLiq().pas + ', le serveur additionne les BTC posés dans le carnet Binance par tranche de prix' + (grilleLiq().dp ? ' de ' + nbF(grilleLiq().dp) + ' $' : '') + '. Case plus marquée = plus de BTC en attente. Publié toutes les ' + CADENCES.attendue_min + ' min.',
  gex: () => 'Pour chaque option Deribit ouverte : variation de sa couverture pour ' + (prmMeta('micro.gex_usd_1pct', 'mouvement_pct') !== null ? nbF(prmMeta('micro.gex_usd_1pct', 'mouvement_pct')) + ' %' : 'un petit mouvement') + ' de prix (le « gamma ») × contrats ouverts. Calls comptés en positif, puts en négatif (hypothèse : les teneurs de marché ont acheté les calls, vendu les puts). En dollars.',
  ls: 'Comptes Binance acheteurs sur le perpétuel BTC divisés par les comptes vendeurs. Un compte = une voix, quelle que soit sa taille. Un point par heure.',
  top_ls: 'Positions acheteuses des plus gros comptes Binance divisées par leurs positions vendeuses, sur le perpétuel BTC. Un point par heure.',
  taker: 'Volume acheté au marché divisé par volume vendu au marché, sur le perpétuel BTC de Binance, dernière heure publiée.',
  funding: () => 'Fixé par Binance d’après l’écart entre le perpétuel et le spot, réglé ' + echeancesMots() + ' : positif, les acheteurs paient les vendeurs ; négatif, l’inverse. Taux de la prochaine échéance, en %.',
  oi: () => 'Nombre de contrats perpétuels BTC ouverts sur Binance (un acheteur et un vendeur chacun). Variation : écart en % entre le dernier point horaire et celui d’il y a ' + (heuresMeta('micro.oi_change_24h_pct') || 'une journée') + '.',
  cvd: () => { const m = prmMeta('micro.cvd_24h_usd', 'intervalle_min'), f = ['micro.cvd_1h_usd', 'micro.cvd_4h_usd', 'micro.cvd_24h_usd'].map(c => heuresMeta(c)).filter(Boolean);
    return 'Pour chaque bougie ' + (m !== null ? 'de ' + nbF(m) + ' min ' : '') + 'du spot Binance : achats au marché − ventes au marché, en dollars. Additionnés sur la fenêtre' + (f.length ? ' (' + f.join(', ').replace(/, ([^,]*)$/, ' ou $1') + ')' : '') + '.'; },
  prime: '(Milieu du carnet Coinbase en dollars − milieu du carnet Binance en USDT) / prix Binance, en %. La version « hors USDT » convertit d’abord l’USDT en dollars.',
  dxy: 'Valeur moyenne pondérée du dollar face à six devises (l’euro pour plus de la moitié, puis le yen, la livre, le dollar canadien, la couronne suédoise, le franc suisse). Dernière valeur journalière de Yahoo Finance.',
  vix: 'Calculé par la bourse de Chicago à partir des options sur le S&P 500 : la volatilité annuelle qu’elles supposent pour le mois à venir, en %. Dernier cours de Yahoo Finance.',
  carnet: () => { const md = typeof marketData !== 'undefined' ? marketData : null, b = md && md.liquidity ? md.liquidity.bande_ref_pct : null;
    return 'BTC posés à l’achat divisés par BTC posés à la vente, dans la bande de référence autour du milieu du carnet Binance'
      + (typeof b === 'number' && isFinite(b) ? ' (±' + nbF(b) + ' % à cette publication)' : '') + ' : la bande visée si le carnet reçu la couvre des deux côtés, sinon la plus étroite publiée. À la publication.'; },
  murs: () => { const t = prmMeta('liquidity.bid_walls', 'tranche_usd'), n = prmMeta('liquidity.bid_walls', 'n');
    return 'Carnet Binance découpé en tranches' + (t !== null ? ' de ' + nbF(t) + ' $' : '') + ', quantités additionnées dans chacune. Les murs : les ' + (n !== null ? nbF(n) + ' ' : '') + 'tranches les plus chargées de chaque côté, à la publication.'; },
  rsi_tf: () => 'Même calcul que le RSI du graphique (Wilder, ' + bougiesMeta('tf.*.rsi_14', 'periode', 'période publiée par le fichier') + '), fait par le serveur sur chaque échelle de temps, bougie en cours comprise.',
  ema_tf: () => { const a = prmMeta('tf.*.ema20', 'periode'), b = prmMeta('tf.*.ema50', 'periode');
    return 'Moyennes exponentielles des clôtures' + (a !== null && b !== null ? ' sur ' + nbF(a) + ' et ' + nbF(b) + ' bougies' : ', courte et longue,') + ' de chaque échelle de temps, bougie en cours comprise.'; },
  croisement: () => { const a = prmMeta('tf.*.ema20_sous_ema50', 'courte'), b = prmMeta('tf.*.ema20_sous_ema50', 'longue');
    return 'Vrai si la moyenne exponentielle ' + (a !== null && b !== null ? nbF(a) + ' est sous la ' + nbF(b) : 'courte est sous la longue') + ', sur l’échelle de temps de la ligne, à la publication.'; },
  sr_tf: () => 'Plus bas et plus haut des ' + dernieresMeta('tf.*.support_30', 'bougies') + ' de l’échelle de temps, bougie en cours comprise.',
  amplitude: () => '(Plus haut − plus bas) des ' + dernieresMeta('tf.*.amplitude_30_pct', 'bougies') + ', divisé par le plus bas, en %.',
  atr_tf: () => 'Même calcul que l’ATR du graphique (vrai range lissé sur ' + bougiesMeta('tf.*.atr_14', 'periode', 'la période publiée par le fichier') + '), fait par le serveur sur chaque échelle de temps.',
  volume_tf: () => 'Volume moyen (en BTC) des ' + dernieresMeta('tf.*.volume_moyen_10_btc', 'bougies') + ', bougie en cours comprise.',
};
// Un texte qui lit PARAM (une fonction) est relu à chaque ouverture : un getter, une chaîne pour le lecteur.
for (const k of Object.keys(TRADERS)) if (FICHES[k]) {
  const t = TRADERS[k];
  if (typeof t === 'function') Object.defineProperty(FICHES[k], 'traders', { get: () => t(typeof PARAM !== 'undefined' ? PARAM : null), enumerable: true, configurable: true });
  else FICHES[k].traders = t;
}
for (const k of Object.keys(CALCUL)) if (FICHES[k]) FICHES[k].calcul = CALCUL[k];
/** « Comment c'est calculé », en mots : construit avec PARAM pour un indicateur de la page. */
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
  const titre = f.titreDeb ? '<span class="expert-seul">' + echapF(f.titre) + '</span><span class="debutant-seul">' + echapF(f.titreDeb) + '</span>' : echapF(f.titre);
  let h = '<div class="fiche-tete"><h3 class="fiche-titre">' + titre + '</h3>'
    + (nature ? '<span class="fiche-nature nature-' + echapF(nature) + '">' + motModes(NATURES[nature] || nature, NATURES_DEB[nature]) + '</span>' : '')
    + '<button type="button" class="fiche-fermer" onclick="fermerFiche()" aria-label="Fermer">×</button></div>'
    + (f.simpleDeb ? '<p class="fiche-simple expert-seul">' + echapF(f.simple) + '</p><p class="fiche-simple debutant-seul">' + echapF(f.simpleDeb) + '</p>'
      : '<p class="fiche-simple">' + echapF(f.simple) + '</p>');
  // État du moment dérivé du code (ex. la forme de bougie du thème courant) : même HTML dans les deux modes.
  const etat = f.etat ? f.etat() : null;
  if (etat) h += '<p class="fiche-valeur">' + echapF(etat) + '</p>';
  if (f.traders) h += '<h4>Comment les traders l’utilisent</h4><p class="fiche-usage">' + echapF(f.traders) + '</p>';
  else if (f.usage) h += '<h4>Comment s’en servir</h4><p class="fiche-usage">' + usageHtml(id) + '</p>';
  if (f.calcul) h += '<h4>Comment c’est calculé</h4><p class="fiche-calcul">' + echapF(calculTexte(f)) + '</p>';
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
  h += '<h4>À savoir</h4><ul class="fiche-lectures">' + f.lectures.map(l =>
    // Une lecture propre à un mode (mode : 'debutant' | 'expert') : même HTML, seule sa classe change.
    '<li' + (l.mode === 'debutant' || l.mode === 'expert' ? ' class="' + l.mode + '-seul"' : '') + '><span class="statut statut-' + echapF(l.s) + '">' + motModes(STATUTS[l.s] || l.s, STATUTS_DEB[l.s]) + '</span> ' + echapF(l.t) + '</li>').join('') + '</ul>';
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
/** Le glossaire : toutes les fiches, ouvert depuis l'en-tête. En Débutant, d'abord ce que
 *  montre SON écran (titres du Débutant) ; les fiches de l'Expert, repliées dessous. Même HTML
 *  dans les deux modes : seules les classes .debutant-seul / .expert-seul changent. */
const GLOSSAIRE_DEBUTANT = ['guide', 'guide_niveaux', 'scenarios', 'bougies', 'sr_tf', 'vix', 'cvd', 'carnet'];
function ouvrirGlossaire(ancre) {
  const p = document.getElementById('fichePop');
  if (!p) return;
  const groupes = [['Positionnement et dérivés', ['gex', 'ls', 'top_ls', 'taker', 'funding', 'oi', 'cvd', 'prime']],
    ['Macro', ['dxy', 'vix']], ['Carnet', ['carnet', 'murs']],
    ['Indicateurs du fichier', ['rsi_tf', 'ema_tf', 'croisement', 'sr_tf', 'amplitude', 'atr_tf', 'volume_tf']],
    ['Le dessin du graphique', ['bougies']],
    ['Guide du graphique', ['guide', 'guide_niveaux', 'guide_regime', 'guide_formes', 'guide_suite', 'scenarios']],
    ['Indicateurs du graphique', ['rsi', 'ema', 'vwap', 'adx', 'atr', 'volume', 'sr', 'bb', 'macd', 'stoch', 'ichimoku', 'sar', 'obv', 'mfi', 'williamsR', 'cci', 'ao', 'fib', 'vp', 'liq']]];
  const bouton = (i, t) => '<button type="button" class="glossaire-item" onclick="ouvrirFiche(\'' + i + '\')">' + echapF(t) + '</button>';
  const tous = groupes.map(([g, ids]) => '<h4>' + g + '</h4><div class="glossaire">' + ids.map(i => bouton(i, FICHES[i].titre)).join('') + '</div>').join('');
  p.innerHTML = '<div class="fiche-tete"><h3 class="fiche-titre">Légendes</h3><button type="button" class="fiche-fermer" onclick="fermerFiche()" aria-label="Fermer">×</button></div>'
    + '<p class="fiche-simple">Comment chaque chiffre se lit — et ce qu’il ne dit pas. Mode <b><span class="expert-seul">Expert</span><span class="debutant-seul">Débutant</span></b> : '
    + '<button type="button" class="lien" onclick="basculerMode();ouvrirGlossaire()">changer</button>.</p>'
    + '<div class="debutant-seul"><h4>Ce que montre l’écran</h4><div class="glossaire">' + GLOSSAIRE_DEBUTANT.map(i => bouton(i, FICHES[i].titreDeb || FICHES[i].titre)).join('') + '</div>'
    + '<details class="glossaire-plus"><summary>Fiches de l’Expert ▸</summary>' + tous + '</details></div>'
    + '<div class="expert-seul">' + tous + '</div>';
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
    case 'sources': if (n(v) && n(v2)) t = v >= v2 ? 'Toutes les données publiées sont arrivées.' : (v2 - v) + (v2 - v > 1 ? ' sources manquent' : ' source manque') + ' (détail en mode Expert).'; break;
    default: t = null;
  }
  return t ? '<div class="lecture-courte debutant-seul">' + echapF(t) + '</div>' : '';
}

/** Le VIX en mots du Débutant : UNE phrase pour les mêmes repères (sous 15, au-dessus de 25), dans
 *  la carte (phraseCarte) comme dans la lecture courte. */
function phraseVix(v) {
  return v < 15 ? 'Les bourses américaines sont calmes.' : v > 25 ? 'Les bourses américaines sont nerveuses.' : 'Les bourses américaines ne sont ni calmes ni nerveuses.';
}
function lectureCourte(id, v, v2) {
  const n = x => typeof x === 'number' && isFinite(x);
  const pct = x => Fmt.pct(x, decUtiles(x, 2));
  let t = null;
  switch (id) {
    case 'funding': if (n(v)) t = v > 0 ? 'Les acheteurs à levier paient les vendeurs.' : v < 0 ? 'Les vendeurs à découvert paient les acheteurs.' : 'Aucun paiement entre acheteurs et vendeurs.'; break;
    case 'oi': if (n(v)) t = v > 0 ? 'Plus de positions à levier ouvertes qu’il y a 24 h (' + pct(v) + ').' : v < 0 ? 'Moins de positions à levier ouvertes qu’il y a 24 h (' + pct(v) + ').' : 'Autant de positions à levier ouvertes qu’il y a 24 h.'; break;
    case 'ls': if (n(v)) t = (v > 1 ? 'Plus de comptes acheteurs que vendeurs' : 'Plus de comptes vendeurs qu’acheteurs') + ' — des comptes, pas des montants.'; break;
    case 'cvd': if (n(v)) t = v > 0 ? 'Sur 24 h, les achats au marché ont dominé.' : 'Sur 24 h, les ventes au marché ont dominé.'; break;
    case 'gex': if (n(v)) t = v > 0 ? 'Régime « long gamma » selon la convention ; lecture usuelle : mouvements amortis.' : 'Régime « short gamma » selon la convention ; lecture usuelle : mouvements amplifiés.'; break;
    case 'rsi_tf': if (n(v)) t = v >= 70 ? 'Zone haute (au-dessus de 70) : la hausse récente a été forte.' : v <= 30 ? 'Zone basse (sous 30) : la baisse récente a été forte.' : 'Zone neutre (entre 30 et 70).'; break;
    case 'vix': if (n(v)) t = phraseVix(v); break;
    case 'prime': {
      const x = n(v2) ? v2 : v, seuil = prmMeta('micro.premium_state', 'seuil_pct');
      if (n(x)) t = (seuil !== null ? Math.abs(x) < seuil : x === 0) ? 'Pas d’écart notable entre Coinbase et Binance' + (n(v2) ? ' une fois l’USDT ramené en dollars.' : '.')
        : (x > 0 ? 'Le BTC est plus cher sur Coinbase que sur Binance (souvent lu comme une demande américaine plus forte).' : 'Le BTC est moins cher sur Coinbase que sur Binance (souvent lu comme une demande américaine plus faible).');
      break;
    }
    case 'carnet': if (n(v)) t = v > 1 ? 'Plus de BTC posés à l’achat qu’à la vente près du prix.' : 'Plus de BTC posés à la vente qu’à l’achat près du prix.'; break;
    default: t = null;
  }
  return t ? '<div class="lecture-courte debutant-seul">' + echapF(t) + '</div>' : '';
}
