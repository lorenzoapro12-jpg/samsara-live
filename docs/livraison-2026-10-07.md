# Livraison du 07/10/2026

Ce document rassemble, chantier par chantier, ce qui a changé, pourquoi, et comment le vérifier.
Les mesures ont été prises dans un conteneur sans carte graphique (rendu logiciel, 4 cœurs partagés) :
les rapports valent ; les millisecondes absolues dépendent de la machine.

## Serveur : heatmap.json au format « colonnes-1 »

#### README — section « heatmap.json » (à côté du paragraphe sur `encodage`) :

`heatmap.json` est publié au format **« colonnes-1 »** depuis le 07/10/2026. Les cellules sont les mêmes qu'avant, sans perte ; seule la manière de les écrire change. Chaque élément de `colonnes` vaut `[minute, bid_bas, [v…], ask_bas, [v…]]` :
- `minute = ⌊t / dt⌋` en temps ABSOLU (secondes UTC depuis 1970 / 60) ;
- `v[i]` est l'intensité de la tranche `bas + i`, qui couvre les prix `[tranche × dp, (tranche + 1) × dp[` ;
- `0` signifie « rien au-dessus du seuil » ;
- un côté vide s'écrit `null, []` ;
- une minute absente n'a pas été observée.

Le fichier se décrit lui-même : `format`, `disposition` (une phrase qui nomme chaque champ) et `encodage` (inchangé : ce qu'est une cellule, comment la décoder, comment fusionner). Les pages lisent les deux formats : si `colonnes` est une liste, c'est le nouveau ; sinon c'est l'ancien, avec `bids`/`asks` en `[c, pb, v]`.

Pourquoi ce format : l'ancien répétait `[c, pb, …]` pour chacune des ~130 000 cellules, et `c` était relatif à la première colonne de la fenêtre. Tout le texte changeait donc à chaque publication, et git ne trouvait aucun delta. Mesuré sur les 36 publications réelles du 06/10, rejouées dans les deux formats :
- mêmes cellules ;
- 2,16 Mo → 0,40 Mo brut ;
- 384 → 61 Kio en gzip (ce que sert le CDN) ;
- 291 → 1,5 Kio poussés par commit, soit ≈ 28,6 → 0,15 Mo/jour d'historique à 96 publications par jour.

Retour arrière : une ligne dans `heatmap.py` (`FORMAT = ANCIEN`), qui republie l'ancien fichier octet pour octet.

#### ARCHITECTURE — tableau « Les trois cadences » : la ligne heatmap.json dit déjà 15 minutes, et c'est maintenant vrai. Ajouter sous le tableau :

« Jusqu'au 07/10/2026, la publication réelle avait lieu toutes les **16** minutes, parce que `last-push.txt` recevait l'heure de FIN du push. Au 15ᵉ tour, l'écart mesuré tombait donc sous 900 s. `heatmap.py` horodate maintenant le DÉBUT du tour qui publie, et tolère une demi-période de cron (`MARGE_PUSH_S = DT // 2`) contre la gigue de démarrage. »

#### ARCHITECTURE — tableau des garde-fous : ajouter la ligne
| La heatmap publiée : mêmes cellules dans les deux formats, texte d'une colonne stable d'une publication à l'autre (deltas git), 15 min de cadence | heatmap.py | `test_heatmap_format.py` |

Pour vérifier : `python3 tests/test_heatmap_format.py` (hors ligne, sans configuration, étape 1a de `run-all.sh`).

### Mesures

Taille du fichier, mesurée sur le heatmap.json du dépôt (version 06/10 12:58), rejoué par heatmap.py :
- ancien format : 2 210 896 octets bruts, 393 147 octets en gzip-6 ;
- colonnes-1 : 407 530 octets bruts, 62 602 octets en gzip-6, soit 5,4× plus petit brut et 6,3× en gzip ;
- même contenu écrit avec les séparateurs par défaut : 540 893 octets. L'écriture compacte économise 24,7 %.

Sur les 36 publications réelles (wf1/perf-charge/versions), médianes :
- ancien format : 2 155,9 Kio bruts, 383,9 Kio en gzip-6 ;
- colonnes-1 : 396,8 Kio bruts, 61,2 Kio en gzip-6.

Croissance git, avec croissance_git.py rejoué sur les 36 versions et des encodeurs qui appellent heatmap.py lui-même (scratch wf2/serveur/encodages.py), à 96 commits par jour :

| Format | Objet libre | Pack mince (médiane / moyenne) | Après repack -adf | Par jour |
|---|---|---|---|---|
| Ancien | 385,3 Kio | 288,1 / 290,8 Kio | 314,3 Kio par commit | 28,59 Mo |
| colonnes-1 | 61,6 Kio | 1,5 / 1,5 Kio | 3,7 Kio par commit | 0,15 Mo |

Soit environ 190× moins par jour.

Bout en bout réel (carnet réel via le miroir, dépôt et remote jetables) :
- main() publie 128 988 cellules en 3,2 s ;
- deux publications réelles à une minute d'écart donnent un pack mince de 729 octets.

Équivalence des grilles : grilleColonnes(colonnes-1) donne la même grille que BM.grillePubliee(ancien) sur 36/36 versions.

Cadence (simulation du vrai main()) :
- avant, avec un push de 45 s ou une gigue de démarrage de 0,3 s : intervalles de 16 min ;
- après : 15 min dans tous les cas.

### Non fait (et pourquoi)

- publish.py n'est pas modifié : il ne lit pas heatmap.json, donc rien ne l'exigeait.
- Les pages ne sont pas modifiées (décodeurs, test_bookmap_rendu.js, test_bookmap.js) : c'est le périmètre des autres agents.
- README.md et ARCHITECTURE.md ne sont pas modifiés (consigne) : le texte est dans 'doc'.
- market-data.json et heatmap.json ne sont pas modifiés (consigne). Les mesures sont faites sur des copies en scratch.
- Aucun numéro de version ni marqueur de format pour l'ancien fichier : le retour arrière reproduit l'ancien octet pour octet, sans champ « format », pour rester exactement ce que lisaient les anciennes pages.

## Carte : calculs, horloge Binance, lectures

## Carte : lectures live et calculs justes (livraison « carte-1 »)

**Format de heatmap.json « colonnes-1 ».** `BM.grillePubliee` (js/bookmap-calc.js) lit les deux formats : l'ancien (`bids`/`asks` = `[c, pb, v]`) et `colonnes-1` (`colonnes` = `[minute absolue, bid_bas, [v…], ask_bas, [v…]]`). Les deux donnent la même grille ; c'est vérifié case par case sur le fichier du dépôt, converti par `tests/heatmap_colonnes.js`. Un format annoncé mais inconnu est refusé (« format non reconnu par cette page »), jamais deviné. Le harnais de rendu lit le fichier du dépôt à travers le décodeur, jamais par ses champs. Transition : d'abord des pages qui lisent les deux formats (la carte, ici), puis le serveur.

**Heure de Binance.** `BM.Horloge` mesure l'écart avec le serveur sur `/api/v3/time` (poids 1), toutes les 5 min et au retour sur l'onglet. Écart = S − (s + r)/2, incertitude (r − s)/2, en gardant l'échantillon au plus court aller-retour parmi les 5 derniers. L'axe du temps, « maintenant », le suivi, les âges et les purges sont à l'heure Binance. Les exécutions et les bougies y sont déjà ; les instants notés par la page y sont recalés. Un écart de plus d'1 s est écrit dans une pastille.

**Lectures.** Les boucles sont à pas fixe (`BM.prochainCreneau`) : la durée d'une requête ne s'ajoute plus à la période. Chaque requête a un délai maximal (AbortController). Un échec recule la source (période × 2ⁿ, plafond 60 s), et le statut dit quand elle repart. Sur 429 / 418, une porte par hôte (`BM.Recul`) arrête toutes les lectures Binance : Retry-After est honoré, sinon 30 s, 60 s, 120 s… (2 min pour un 418, plafond 30 min), avec un décompte dans le statut. Onglet caché : aucune lecture. Au retour, chaque source repart tout de suite. Au démarrage, chaque fichier publié n'est lu qu'une fois. Les relectures utilisent `cache: 'no-cache'`, sans `?t=`, et le texte n'est analysé que si `updated`, lu en tête, a changé.

**Carnet live (`BM.CarnetLive`).**
- Une colonne par lecture, placée au milieu de [envoi, réception] et recalée sur l'heure Binance.
- Chaque lecture vaut jusqu'à la suivante, au plus 3 cadences + 1 s (`BM.VALIDITE`). Elle n'est jamais peinte après « maintenant ».
- Les quantités sont gardées : l'échelle suit l'encodage publié dans les deux sens et tout est ré-encodé sans rien perdre. La lecture au pointeur donne la quantité mesurée.
- Un carnet dont `lastUpdateId` ne croît pas est écarté. La mémoire est bornée.

**Carte publiée.** La fusion (5 min, 15 min, 1 h) est ancrée sur l'horloge et chaque bloc porte son étendue réelle : rien n'est peint au-delà des données. La peinture (`BM.peindreGrille`) et la lecture au pointeur (`BM.lirePixel`) utilisent les mêmes colonnes et les mêmes tranches, donc la valeur lue est le MAX que montre le pixel. « Dernière colonne il y a … » se mesure depuis min(fin de la minute, publication).

**Bougies et exécutions.** Les bougies sont relues depuis la dernière minute gardée, et l'historique 24 h est retenté tant qu'il manque. Une minute absente reste un trou visible : ligne de prix coupée, volume et CVD hachurés, CVD qui repart de 0 et l'écrit. Les exécutions sont rattrapées par identifiant. Au-delà de 30 min de retard, la carte saute au présent et l'intervalle sauté est hachuré, puis compté dans la pastille et dans le profil (« incomplet »). Le panneau volume écrit l'âge des bougies.

**Regroupements.**
- Bulles : seaux ancrés sur l'horloge (`BM.pasTemps`, échelle fixe). La lecture décrit la bulle survolée.
- Profil, bulles et carnet latéral : pas de prix multiple entier de la tranche (`BM.pasMultiple`).
- Volume : minutes par barre prises dans `BM.PAS_MINUTES`, et le titre dit la vraie durée.
- Ligne de prix (`BM.lignePrix`) : VWAP exact de chaque seconde dès qu'une minute fait au moins 6 px.

**Autres corrections.** Les niveaux gamma (strikes en USD) sont placés en USDT au cours `micro.usdt_usd` quand le fichier le publie ; sinon la carte écrit « NON convertis ». Les réglages stockés sont validés contre les `<option>` et les bornes des curseurs. Les libellés sont tirés des constantes du code : décimales des graduations, secondes et jour sur l'axe du temps, saturation appliquée, bornes de surface des bulles, validité d'une lecture.

**Vérifier.**
- `node tests/test_bookmap.js` : 119 contrôles hors ligne. Ils couvrent l'équivalence des formats, la fusion, l'égalité peinture/lecture pixel par pixel, le carnet live, les seaux, la ligne de prix, l'horloge, la cadence et les libellés.
- `node tests/test_bookmap_rendu.js` : 93 contrôles dans Chromium, avec un Binance simulé à l'heure de son serveur (décalable). Scénarios : horloge à ±30 s, 429 avec Retry-After, requête pendue, heatmap.json en retard de 6 s, encodage disparu, carnet à 1 s avec 250 ms de latence, `lastUpdateId` en recul, absences de 20 et 50 min (`page.clock`), bougies en 503, minutes manquantes, bulle survolée, prix à la seconde, réglages invalides, gamma, libellés.
- `window.__carte` expose en lecture seule `etat()` (horloge, recul, statut, bougies, execNonLues, textes, pastillesCompletes), `lectures()` et `bulles()`.

### Mesures

Méthode : Playwright et Chromium, page servie depuis l'arbre de travail. Passage sur données réelles : api.binance.com routé vers le miroir data-api, vrai raw.githubusercontent.com. Le reste : le harnais de test, Binance simulé.
- Démarrage : heatmap.json 2 → 1 requête, market-data.json 2 → 1 (compteur du harnais, §8). Plus aucun ?t= : une relecture peut recevoir un 304 du CDN au lieu d'un téléchargement complet.
- Données réelles, démarrage + 15 s : requêtes Binance time 1, klines 3, aggTrades 24, depth 9. Aucune erreur JS, statut vide, écart d'horloge mesuré +284 ms ± 342 ms, 1 441 bougies sans trou, live sur l'échelle publiée.
- Boucle à pas fixe : carnet à 1 s avec 250 ms de latence ajoutée → intervalle médian 1 000 ms (l'ancienne boucle donnait 1 250 ms). 9 lectures sur 9 jointes, 0 colonne « non observé » entre deux lectures (audit : 9 à 23 % des colonnes sautées avant).
- Horloge : poste décalé de ±30 s → écart mesuré 29,99 s ± 15 ms. Âge des exécutions 0,7 s (avant : « — » ou +30 s).
- Live à 10 s / vue fine : peint au plus 0,7 s derrière « maintenant » (avant : jusqu'à une bande hachurée de 10 s).
- Budget de rendu (harnais, 1440×860) : chaleur 9,7 ms, calques 2,6 ms (12,0 / 14,4 ms au début du chantier, même harnais : bruité, mais aucune régression).
- Mémoire du live : tampon creux, ~150 quantités par lecture aux réglages par défaut (≈ 2,4 Mo pour 1 800 lectures), plafonné à 2^21 quantités (16 Mo Float64 + 2 Mo Uint8) au pire (5 000 niveaux à 1 $). L'ancienne grille dense Uint8 pesait 9,3 Mo à 1 $.

### Non fait (et pourquoi)

- entete-replie-canevas-ecrase + entete-641-1050px + canvas-minimum-etire — mise en page CSS de l'en-tête et minimums 320×260 de mettreEnPage (le pointeur se décale parce que le canevas est étiré) : laissé à carte-2 (architecture de mise en page)
- legende-palette-cote (deux lentilles) — rendu de la barre de légende pour la palette bid/ask : carte-2
- legende-graduations-decalees (deux lentilles) — position CSS des libellés de la barre : carte-2
- panneaux-volume-cvd-debordent — clip des panneaux : carte-2
- mobile-libelles-tronques, chevauchements-textes, pastilles-hors-carte, dpr3-flou — placement du texte et des pastilles, densité de pixels : carte-2 (pastilles-hors-carte touche la règle « aucun âge ne disparaît » : à traiter en priorité)
- tactile-sans-lecture, raccourcis-avec-modificateurs, croix-figee-pendant-glisser, echap-dans-panneau, curseurs-sans-nom-accessible, panneaux-coupes-mobile — interaction, accessibilité et CSS : carte-2
- bulles-plancher-rayon, côté dessin — j'ai gardé le rayon plancher de 2 px (la légende dit maintenant où la proportionnalité s'arrête) ; si on veut l'abaisser, c'est carte-2 qui le fait
- Points de performance du rapport carte (cadence de rendu ≤ 1/s, peindreGrille optimisé, cache des calques, bid/ask long, cache de regroupement) : carte-2. Je n'ai ajouté qu'un index trié des secondes dans SeauxExecutions

## Carte : rendu par calques, affichage

CARTE — ARCHITECTURE DU RENDU (pour ARCHITECTURE.md)

Au repos, la carte fait un rendu par seconde : c'est le battement qui fait vieillir les âges. Une donnée qui arrive change sa version et attend ce battement, donc elle apparaît avec au plus 1 s de retard. Un geste rend à l'image suivante.

La chaleur est faite de calques gardés, des canevas à la résolution CSS :
- le fond « non observé » est un motif ;
- la carte publiée n'est repeinte que si sa clé change (taille, publication, fusion, palette, ms/px, $/px) ;
- un glissement d'un nombre entier de pixels décale le calque publié et ne repeint que les bandes découvertes (BM.peindreGrille, option rect) ;
- le carnet live est repeint sur sa seule bande de temps.

L'ensemble est composé une fois, puis agrandi d'un seul drawImage, sans lissage. __carte.verifierChaleur() compare la chaleur affichée à un repeint complet.

Les exécutions sont regroupées en « plis » (BM.SeauxExecutions.pli) : des seaux gardés et complétés seconde close par seconde close, identiques au bit près à un regroupement refait.

Pour un développeur qui ajoute un calque : il n'y a plus de sale(). Un geste appelle dessiner() ; une donnée change une version et appelle bientot().

Densité de pixels : celle de l'écran, plafonnée par un budget d'un écran 4K. Le canevas n'est jamais étiré : quand la place manque, les panneaux (volume, CVD, carnet latéral) s'effacent, et la carte le dit.

Pour vérifier :
- node tests/test_bookmap.js (sections 2d et 5d) ;
- node tests/test_bookmap_rendu.js (sections 25 à 36) ;
- mesures : scratch wf2/carte-2/mesure.js --depot=<arbre> [--rev=<rev>].

#### README (section carte) :
- Gestes au doigt : un appui bref épingle la lecture ; le même appui l'enlève ; un appui long la fait suivre le doigt ; glisser déplace la carte.
- Échap ferme un panneau. Ctrl / Cmd / Alt + touche restent au navigateur.
- Les heures de l'axe sont locales, avec le fuseau écrit dans l'angle.
- Les puces des calques tiennent sur une ligne qui défile.

Performance mesurée (1440×860, données simulées) :
- repos : CPU de 55 à 28 ms/s ;
- glisser : de 37 à 22 ms par image, 0 image perdue ;
- session de 6 h : de 135 à 42 ms/s.

### Mesures

Méthode : sondes du banc d'audit (CPU de tous les processus, fil principal). Binance simulé avec le heatmap.json du dépôt ; fenêtre 1440×860, densité 1 ; « avant » = c0bbe6a.

| Mesure | Avant | Après |
|---|---|---|
| Repos, CPU tous processus (ms/s) | 55 | 28 |
| Repos, fil principal (ms/s) | 38,9 | 17,5 |
| Rendus par seconde au repos | 2 | 1 |
| Glisser, CPU par image (ms) | 37,4 | 22 |
| Glisser, fil principal par image (ms) | 27,9 | 14,6 |
| Images perdues, flux d'entrée à 60 Hz | 18 (51 au 2ᵉ passage) | 0 |
| Survol, CPU par image (ms) | 21 | 19,6 |
| Session de 6 h, repos (ms/s) | 134,6 | 42 |
| Session de 6 h, survol (ms/image) | 60,6 | 24,3 |
| Chargement (ms) | 334–338 | 385 |
| Téléphone 390×844 densité 3, repos (ms/s) | 47 | 31,3 |
| Téléphone densité 3, glisser (ms/image) | 20,8 | 21,4 |

Au téléphone, « après » dessine dans un tampon 3× au lieu de 2× (correction du flou en densité 3) : plus net, pour le même coût.

### Non fait (et pourquoi)

- Séries avant/après entrelacées à 1440×860, 390×844@3, 1440×900@2 et 2560×1440 : commencées, inachevées. Les chiffres « après » viennent de passages séparés du même script ; les paires Retina et 2560×1440 ne sont pas mesurées.
- Analyse de heatmap.json dans un Web Worker et partage entre onglets (BroadcastChannel) : non faits, hors périmètre, et ils touchent le contrat réseau.

## Carte : Mémoire du carnet et Rafales au marché

Carte — Mémoire du carnet. Barres au bord droit de la chaleur. Pour chaque tranche de 20 $ de la carte publiée, la barre donne la part des minutes OBSERVÉES de la fenêtre visible pendant lesquelles un niveau ≥ qS BTC s'y trouvait, côté bid ou ask. Le seuil demandé (1, 2, 5, 10, 25 ou 50 BTC ; 10 par défaut) est converti au cran publié : vS = ⌈255·√(X/ref)⌉, qS = ref·(vS/255)². Comme v = min(P, ⌊P·√(q/ref)⌋) ne décroît jamais quand q croît, v ≥ vS ⇔ q ≥ qS, à l'exactitude du flottant près. Exemple : 10 BTC devient « ≥ 10,09 BTC (intensité ≥ 81) ». Lecture : échelle fixe 0–100 %, couleur du côté majoritaire, tranche hachurée si elle a été observée moins de 30 min (convention). Un pixel qui couvre plusieurs tranches montre la plus grande part. La présence est calculée sur la grille BRUTE publiée : la fusion ne change aucune valeur. Le survol donne les comptes et la plus longue présence ininterrompue ; une minute non observée coupe la série. Sans encodage publié, le calque est éteint et le dit. Libellés : « un niveau » (pas « le même ordre »), « présence passée, ni support ni résistance ». Calculs (BM.seuilPresence, BM.presence, BM.presenceFenetre, BM.plusLonguePresence, BM.barrePresence) : sommes préfixes par rangée, une fenêtre coûte O(H). Pastille d'âge : carte publiée, fenêtre et seuil.

Carte — Rafales au marché. Une rafale est la plus longue suite d'exécutions agrégées (aggTrades) d'identifiants consécutifs, de même milliseconde et de même côté (mesuré). Chaque rafale garde la quantité (entier en 1e-8 BTC), le montant en USDT, le prix moyen pondéré, les prix extrêmes, le nombre de prix, le nombre d'exécutions et la plus longue séquence. Elle garde aussi « ≥ k ordres » : 1 + le nombre de pas où le prix n'avance pas strictement dans le sens du preneur. C'est une borne basse PROUVÉE, car un ordre ne parcourt les prix que dans un sens ; le nombre exact n'est pas publié. On n'écrit jamais « un ordre de X BTC ». Les pages du remplissage arrière sont recousues à leur limite. Affichage : un trait du prix bas au prix haut et un libellé « ▲ q BTC · n prix · ≥ k ordres » quand il y a la place. Le seuil d'affichage est réglable (1, 2, 5, 10 ou 25 BTC, 2 par défaut) ; les rafales ≥ 0,5 BTC sont gardées 6 h. Le panneau « Rafales » liste les 20 dernières. Rien n'est dessiné avant le début des exécutions lues. Pastille : « Rafales ≥ X BTC · depuis HH:MM · dernière il y a … ».

Vérifier : node tests/test_bookmap.js (sections 7d et 7e, fixture tests/fixtures/aggtrades-300.json de 300 exécutions réelles) et node tests/test_bookmap_rendu.js (sections 37 à 39).

### Mesures

Méthode : script de repos (CDP Performance.getMetrics et SystemInfo), Chromium en mode simulé, 1440×860, densité 1, 25 s de mise en route puis 30 s de repos en suivant le présent ; métriques du fil principal (TaskDuration), du script (ScriptDuration) et du CPU de tous les processus. « Avant » = git archive de f5fc537. Avant : fil principal 16,8 / 15,1 / 15,5 ms/s, script 4,7 / 4,3 / 4,4 ms/s, tous processus 29 / 26,7 / 28,3 ms/s. Après 1fc0130 (une seule mesure fiable) : fil principal 21,3 ms/s, script 8,2 ms/s, tous processus 34,7 ms/s, soit environ +4,5 ms/s sur le fil principal. Ce simulateur met une exécution par milliseconde avec des tailles jusqu'à 3 BTC, donc beaucoup de rafales ≥ 2 BTC : un majorant. e070ae3 met les barres de la mémoire en calque gardé (un drawImage par rendu) et mesure chaque libellé de rafale une fois par recalcul ; son effet sur le CPU au repos n'a pas été mesuré.

### Non fait (et pourquoi)

- Pas de nouvelle mesure du CPU au repos après le dernier commit (e070ae3) : le passage avant/après a été lancé, mais le côté « après » n'a pas fini avant l'arrêt.
- tests/test_bookmap_rendu.js en entier n'a pas été relancé après les commits 1fc0130 et e070ae3. Son dernier passage complet date d'avant le déplacement de la mémoire sous les murs. Les sections 37–39 ont passé avant e070ae3 seulement. Après e070ae3, seul test_bookmap.js a été relancé (vert).
- bash tests/run-all.sh en entier n'a pas été lancé ; seuls test_bookmap.js, scan-public.py et test_reglages.js l'ont été.
- La sélection temporelle « de la ms » n'est pas rendue par un calque gardé : les traits sont des Path2D recalculés quand la version des rafales ou la vue change, soit au plus une fois par battement.

## Carte : Destin des murs

Destin des murs (carte). Nouveau calque : chaque niveau de prix EXACT du carnet live brut (au cent près, avant toute tranche) qui atteint le seuil choisi (2, 5, 10 ou 25 BTC, défaut 5) est suivi de lecture en lecture. Il est tracé à son prix, de la première lecture où il atteint le seuil jusqu'à sa fin, puis marqué : ✕ retiré (aucune exécution à ce prix, même dans la fenêtre large), ● échangé (exécutions certaines ≥ la taille), ◐ en partie, ? incertain (exécutions seulement dans la fenêtre large), ↕ sortie de la bande, ⋯ interrompu, → toujours là. Entre deux lectures i et j, la page connaît les instants locaux d'envoi et de réception de chaque lecture, ainsi que l'écart à l'horloge Binance ± u (BM.Horloge). On en tire deux fenêtres. La fenêtre étroite N = ]rᵢ+off+u, sⱼ+off−u[ contient les exécutions certainement survenues entre les deux lectures. La fenêtre large W = [sᵢ+off−u, rⱼ+off+u] contient toutes celles qui ont pu y survenir. On ne compte que les exécutions au prix exact et du côté qui touche le niveau (un bid n'est touché que par une vente au marché, m = true). Comme q₁ = q₀ + ajouté − annulé − échangé et que échangé ≤ X_W, retireMin = max(0, q₀ − q₁ − X_W) est une borne BASSE MESURÉE de ce qui a été annulé ou réduit. X_N est échangé à coup sûr ; X_W − X_N est « incertain » et n'est compté qu'une fois quand deux fenêtres larges se recouvrent. Une transition n'est classée qu'après une requête d'exécutions envoyée à rⱼ + 2u ou plus tard et qui a rendu moins de 1000 lignes ; au-delà de 30 s d'attente, elle devient « interrompu ». Sont aussi « interrompu » : une lecture périmée (lastUpdateId qui ne croît pas, ignorée), deux lectures séparées de plus de 2 cadences, et des exécutions sautées. Tous les seuils sont suivis en même temps : changer le réglage choisit ce qui est montré, sans rien remettre à zéro ni changer une valeur. Une pastille sur la carte donne l'âge de la dernière lecture, l'incertitude de l'horloge (avec une alerte au-delà de 500 ms), le nombre de niveaux et la cadence, et les totaux depuis le début du suivi. Limites dites dans la légende (BM.TEXTE_MURS) : ce sont des variations NETTES entre deux lectures, et un ordre posé puis annulé entre deux lectures est invisible ; la carte ne dit ni qui a posé l'ordre ni pourquoi il a été retiré. Aucun mot d'intention ni d'accusation (« spoof »…) n'est permis ; tests/test_bookmap.js le vérifie sur les fichiers publiés de la carte. Aucune requête nouvelle : le calque utilise les lectures du carnet et les exécutions déjà faites. Coût mesuré : environ 0,5 ms par lecture de 1000 niveaux. Pour vérifier : node tests/test_bookmap.js (§7f, dont la propriété de solidité sur un flux simulé : retireMin ≤ annulé réel et X_N ≤ échangé réel ≤ X_W à chaque transition) et node tests/test_bookmap_rendu.js (§40). ARCHITECTURE : le calcul est dans js/bookmap-calc.js (BM.MURS, BM.FINS_MURS, BM.niveauxSuivis, BM.fenetresMurs, BM.bilanNiveaux, BM.finMur, BM.SuiviMurs) ; l'affichage est dans js/bookmap.js (E.murs alimenté par lireCarnet avec le carnet brut et par lireExecutions/lireExecutionsInitiales ; les fonctions destin, destinEn, texteDestin et pastilleDestin dessinent le calque).

### Mesures

Rejeu dans Node de 5 min de données réelles (data-api.binance.vision : 151 carnets de 1000 niveaux toutes les 2 s, 3 728 exécutions dans l'anneau, horloge ± 76 ms) : SuiviMurs.lecture médiane 0,54 ms (max 11 ms, premier appel avant optimisation JIT), avancer médiane 0,03 ms (max 2,3 ms), soit environ 0,03 % d'un cœur au repos. Dessin : Path2D gardé, recalculé seulement quand le suivi ou la vue change. Navigateur, calque allumé : chaleur 25,8 ms (budget 50), calques et axes 3,1 ms (budget 30), 0,94 rendu/s au repos (§5 et §26). Résultat du rejeu : 474 niveaux ≥ 2 BTC (127 ≥ 5, 41 ≥ 10) ; fins ✕316 ●33 ◐41 ?14 ↕26 →44 ; au seuil 5 BTC, au moins 1 013 BTC retirés, 33,8 BTC échangés, 3,4 BTC incertains. Scripts : scratchpad/wf2/carte-4/collecte.js, rejouer.js.

### Non fait (et pourquoi)

- Aucune nouvelle requête ni nouveau poids Binance ; pas de ré-lecture des exécutions déjà gardées par E.exec (un suivi neuf ne reprend que l'anneau du précédent)
- Pas de mesure Playwright dédiée au CPU au repos avec/sans calque : mesuré en Node sur données réelles (voir mesures) ; les contrôles existants de budget de rendu et de cadence passent avec le calque allumé par défaut
- README/ARCHITECTURE non modifiés (consigne)

## Terminal : socle des thèmes (menus, crochets du graphique, CADENCES, polices, budget)

#### README — Thèmes à structure (paragraphe à compléter). Le décor d'une structure est posé par chantier().decor(), qui le marque data-decor. css/app.css le rend inerte au pointeur, et tests/test_structures.js contrôle chaque [data-decor] quel que soit le préfixe de classe du thème : il doit être muet (aria-hidden), inerte (pointer-events: none) et ne contenir aucun vrai nœud. Les menus Indicateurs, Thème et Paire passent par placerMenu() : sous leur bouton, ou au-dessus quand la place manque (un ruban ou une barre des tâches en bas de l'écran), toujours entiers dans l'écran. tests/test_interface.js le vérifie pour chaque thème.

#### README — Crochets du graphique (nouveau paragraphe dans « Thèmes »). Un thème peut changer la FORME du graphique, jamais une valeur, par des jetons lus une fois par lireJetons() :
- --bougie-forme : pleine, creuse-hausse ou barre. En vue dense (corps de moins de BOUGIE_DENSE_PX = 4 px), les corps redeviennent pleins, et les barres un trait seul.
- --bougie-rayon : 0 donne des angles vifs, sur les bougies comme sur les barres de volume.
- --grille-tirets : par exemple « 8 3 2 3 » pour un trait mixte.
- --police-graphique : la police du texte du canvas ; à défaut, --font.
- --chaleur-bid et --chaleur-ask : une encre fixe pour la couche Liquidité, dont seule l'opacité croît, de 0,10 à 0,90.
Sans ces jetons, le graphique est celui d'avant au pixel près (vérifié sur les 5 thèmes). Aero et Codex posent désormais --chaleur-* : sur leur fond clair, la rampe historique n'était pas monotone, et les plus gros murs y étaient les moins visibles. La fiche « Bougies » (glossaire, nature convention) dit la forme du thème courant ; elle est dérivée de FORMES_BOUGIE et BOUGIE_DENSE_PX. Quand le canvas est bas, les sous-graphes sont réduits proportionnellement (dispositionGraphique) au lieu de déborder sur le sélecteur de plage.

#### README — Cadences. Les rythmes de la page sont dans une seule table, js/cadences.js : prix 1 s, bougies 5 s, relecture de la publication et de la chaleur 60 s, publication attendue toutes les 15 min, « retard » au-delà de 20 min, « figé » au-delà de 32 min. Minuteries, seuils d'âge, bandeau, title des chiffres clés et toute étiquette de décor la lisent. tests/test_fiches.js échoue si un de ces nombres réapparaît en dur.

#### README — Polices (remplace le paragraphe actuel). fonts/fabriquer.py tient la table POLICES : plages par police ; instance d'une police variable (axe figé ou plage) ; sous-ensemble --text pour un titre ; glyphes composés Ā ā Ṃ ṃ là où ils manquent ; renommage imposé par un nom réservé ; date de fabrication fixe. `python3 fonts/fabriquer.py <sortie.woff2>` fabrique une police, `--comparer` refait tout à côté et compare au dépôt (les 5 polices actuelles sont identiques à l'octet), `--lisezmoi` réécrit fonts/LISEZMOI.txt, désormais généré. tests/test_polices.py vérifie registre, licences, noms réservés, LISEZMOI et @font-face.

#### README / ARCHITECTURE — Le budget d'image (remplacer la description du protocole). Le prix simulé bouge à chaque seconde (--ticks, implicite avec --enregistrer). Sans ce mouvement, l'éclair de couleur du prix était invisible au banc. Les mesures sont entrelacées : référence, thème, référence. Chaque mesure du thème est rapportée aux deux références qui l'encadrent, et le banc garde la médiane de 5 essais ; le repos se mesure sur 10 s. Un témoin, la référence contre elle-même, doit tenir le budget, sinon le banc est trop bruité ; les deux contre-épreuves doivent toujours en sortir. Le banc complet dure environ 30 min. `node tests/test_budget.js --controle` vérifie le protocole sans navigateur (étape 8a).

#### ARCHITECTURE — table « règles transverses », lignes à ajouter :
- « Une cadence ou un seuil d'âge s'écrit une fois » : js/cadences.js, harnais test_fiches.js.
- « Un crochet de thème change la forme, jamais la valeur ; la chaleur est monotone en contraste » : js/app.js (lireJetons, tracerBougie), harnais test_interface.js et test_palette.py.
- « Une police servie est déclarée, licenciée, renommée si son nom est réservé » : fonts/fabriquer.py, harnais test_polices.py.

#### ARCHITECTURE — schéma des fichiers : ajouter js/cadences.js, chargé avant js/structures.js.

#### ARCHITECTURE — harnais : run-all.sh compte trois étapes de plus, 8a (protocole du budget), 8b (polices) et 9b (interface dans Chromium) ; test_palette.py mesure aussi le texte du canvas et la rampe de chaleur.

Comment vérifier : `bash tests/run-all.sh`, puis `node tests/test_budget.js --enregistrer` pour remesurer les feuilles changées, puis `python3 tests/test_contrat.py`.

### Mesures

Canvas du graphique, avant (469ebb9) / après, via un script Playwright hors dépôt (wf2/terminal-0/pixels.js), données déterministes, 1440×900. Vue par défaut, vue dense (600 bougies) et vue complète sans chaleur (EMA20/50, Bollinger, VWAP, RSI, MACD) : IDENTIQUE octet pour octet sur les 5 thèmes. Vue complète avec la couche Liquidité : identique pour aero-nuit, kala et neon ; Aero (185 682 pixels) et Codex (139 084 pixels) changent, comme voulu, par la nouvelle encre de chaleur.

Rampe de chaleur, contraste sur --chart-2 (algorithme de test_palette) :
- avant : Aero bid 1,44 → max 1,79 (v=117) → 1,23, ask 1,52 → max 2,38 → 2,07 ; Codex bid 1,43 → max 1,74 → 1,13, ask 1,50 → max 2,24 → 1,89. Rampe non monotone : les plus gros murs étaient les moins visibles.
- après : Aero 1,14 → 3,86 et 1,15 → 4,14 ; Codex 1,16 → 5,29 et 1,15 → 4,22. Rampes monotones.
- thèmes sombres inchangés (rampe historique monotone) : kala 9,95 / 5,56, neon 10,34 / 5,78, aero-nuit 9,36 / 5,23.

Polices : avec l'ancien fabriquer.py, chaque refabrication différait du dépôt, uniquement par head.modified et checkSumAdjustment (vérifié table par table). Avec le nouveau et l'horodatage consigné, --comparer donne les 5 woff2 identiques à l'octet. Essais hors dépôt : Pixelify Sans wght=700 fait 8 644 o ; Noto Sans Mono wdth=75, wght 500–700 (▲▼ ajoutés) fait 27 684 o ; Playfair wght=800 en --text, renommée, fait 3 412 o.

Budget, node tests/test_budget.js neon --ticks (5 essais entrelacés, machine partagée) :
- référence kala : 138,0 ms CPU/s au repos et 25,56 ms/image en geste ; sans ticks, au même moment, ≈ 19 ms/s.
- témoin : ×0,96 au repos, ×1,02 en geste, essais ×0,96 à ×1,05. Le jury mesurait ×1,45 pour un témoin vide avec l'ancien banc.
- neon : ×0,91 au repos (essais de ×0,89 à ×0,97), ×1,10 en geste.
- contre-épreuves toujours refusées : animation ×18,74 au repos et ×4,90 en geste ; flou ×1,44 au repos (sous la limite de 1,6) mais ×1,62 en geste, au-dessus de 1,3.

### Non fait (et pourquoi)

- tests/budget-themes.json non réenregistré (consigne : mesure en série à l'intégration). themes/codex.css a changé (P3) : test_contrat signale sa mesure périmée — seul échec attendu. aero.css a aussi changé mais Aero (verre, sans structure ni effet coûteux) n'exige pas de mesure.
- README.md / ARCHITECTURE.md non modifiés (consigne) : voir 'doc'.
- Aucune nouvelle police ajoutée dans fonts/ (rôle des agents de thème) ; les essais Pixelify / Noto Sans Mono / Playfair ont été fabriqués HORS dépôt pour valider instancer, --text, renommage et composés.
- --ink-3 sur le fond du graphique n'est que relevé (Aero : 4,47:1 < 4,5) : l'exiger aurait obligé à changer l'aspect d'Aero, hors du périmètre de P8 qui demande --ink-2.
- Le budget complet de tous les thèmes n'a pas été relancé (≈ 30 min, machine partagée) : seulement neon --ticks avec témoin et contre-épreuves.

## Terminal : performances

### Performances du terminal (07/10/2026) — ce qui a changé, pourquoi, comment le vérifier

**Au repos, la page coûtait 2 à 2,5 fois ce qu'elle coûte maintenant**, dans tous les thèmes (CPU de tous les processus du navigateur, Chromium sans GPU, mesures entrelacées avant / après, médianes de 3 fenêtres de 20 s, données réelles) : Kāla 105 → 48 ms/s, Aero 186 → 90, Aero nuit 170 → 87, Néon 89 → 47, Codex 90 → 44. Le thread principal passe de ~31 à ~9 ms/s, les recalculs de style de ~19 à ~1,6 par seconde. Survol du graphique : Aero 85 → 23 ms de CPU par image, Kāla 25 → 20 (thread principal 9,6 → 3,7). Chargement d'Aero : 4,98 → 2,63 s de CPU, premier graphique 508 → 401 ms (Kāla 785 → 512).

**Ce qui coûtait, et ce qui le remplace :**
- **Éclair du prix** : une animation de couleur de 450 ms à chaque seconde (~27 images par changement, 70 % du CPU au repos) → une classe `eclair-hausse` / `eclair-baisse` posée puis retirée 450 ms plus tard (deux images). Toujours coupé sous `prefers-reduced-motion`.
- **Horloge de la barre des tâches** : écrite dans la même tâche que le prix (une image par seconde au lieu de deux) ; elle s'arrête donc onglet caché, comme le prix. `CADENCES.horloge` n'existe plus.
- **Voyant de publication** : une onde par publication NOUVELLE (avant : à chaque relecture, chaque minute), relancée sans mise en page forcée (classe retirée à `animationend`, onde en cours rembobinée par l'API Web Animations).
- **Calque du graphique** (`#chartCalque`, posé sur `#chart`, même taille, `pointer-events: none`, `aria-hidden`) : réticule, infobulle OHLCV, badges des sous-graphes, libellés de l'axe des prix, ligne et étiquette du dernier prix, âge de la couche « Liquidité ». Le graphique ne se redessine plus que si la donnée ou la vue change : ni au survol, ni quand le prix bouge, ni quand la queue de bougies (5 s) revient inchangée. L'étiquette du prix suit le prix à la seconde (avant : jusqu'à 5 s de retard sur l'en-tête) ; le libellé d'axe qu'elle recouvrirait est omis (`masqueEtiquettes`).
- **Anneau de verre du graphique** (Aero, Aero nuit) : en quatre bandes (`.lg-ring::before / ::after`, `.lg-ring-cotes::before / ::after`, marge `--graphe-marge`) au lieu d'un élément de la taille du conteneur masqué au bord. Avant, chaque image du canvas faisait recalculer le flou de toute sa boîte. Les bandes se prolongent de 48 px sous le canvas, masquées, pour lire le même fond. Aero au repos : 129 → 92 ms/s. Seuls les quatre coins diffèrent de l'ancien anneau (~150 px sur Aero, ~900 sur Aero nuit, écart maximal 16 / 31 niveaux sur 255). Pendant le survol, les bandes suspendent leur flou (`html.survol`, retirée 250 ms après le dernier mouvement), comme `html.geste` pendant un glissement.
- **hyalite (réfraction)** : plus chargé en rendu LOGICIEL (nom du moteur WebGL : SwiftShader, llvmpipe…). La sonde l'y coupait toujours, après 51 Ko, une tâche de 52 ms et ~1,5 s de CPU. Ce verdict et celui de la sonde sont gardés 30 jours dans `localStorage` (`samsara-verre-v1`) ; `?glass=force` passe outre. Le verre CSS reste.
- **Indicateurs** : Ichimoku, stochastique, Williams %R, CCI, MFI et AO en boucles, extrêmes par file monotone (`extremeGlissant`). Valeurs identiques AU BIT PRÈS : les sommes restent refaites dans le même ordre, car une somme glissante changeait les derniers bits de 2 632 SMA sur 2 981. Configuration lourde après vidage du mémo : 10,7 → 3,0 ms de JS.
- **Relecture des fichiers publiés** : `market-data.json` est lu sans `?t=` (le CDN l'ignore : même copie, même âge), en revalidation (`cache: 'no-cache'`, 304). Il n'est relu que quand une publication est ATTENDUE (`lectureDue` : `updated` + `attendue_min` + `marge_publication_s`, puis à chaque tour, au plus tard toutes les `relecture_max_min`). Même règle pour `heatmap.json`.
- **Même publication** : une revalidation qui rend la même publication n'est ni analysée ni dessinée. Le corps est abandonné après ses premiers octets (`updated`, première clé ; `lireSiNouveau`). Entre deux publications, les âges avancent sur place (`[data-age-de]`, `majAges`) sans refaire les cartes ; un seuil d'âge franchi les refait (bandeau).
- **Prix** : `ticker/24hr?type=MINI` (305 o au lieu de 559) ; la variation est calculée sur l'ouverture de la même réponse.
- **Chargement** : un petit script en tête d'`index.html`, AVANT les feuilles, lance la première page de bougies (sans `endTime` : URL fixe), le prix et `market-data.json`. `app.js` reprend ces réponses (`prechargee`, par l'URL exacte ; une URL qui ne correspond plus est ignorée). Les deux pages anciennes de l'historique partent au calme (`requestIdleCallback`), ou dès que la vue approche du début de l'historique. Le cache de bougies est borné à 6 historiques.
- **Heatmap** : les deux formats se lisent — « colonnes-1 » (livraison serveur à valider par un passage réel du cron) et l'ancien (`bids` / `asks` en cellules) — en une même GRILLE (`grilleChaleur`). La couche se construit sur cette grille (`fusionnerGrille` dans `js/reglages.js`, qui remplace `fusionnerCellules`, puis `pixelsChaleur`) : 1 × 1 de 44 à 5 ms, tas de 7,6 à 3,0 Mo couche chargée. Les trois dernières couches sont gardées (zoom). La couche porte son âge sur le graphique.

**Tables** : `js/cadences.js` gagne `marge_publication_s` (60 s) et `relecture_max_min` (5 min). `publication_lue` et `chaleur_lue` (60 s) sont désormais la période d'un TOUR : âges rafraîchis, fichier relu s'il est dû.

**Vérifier** (`bash tests/run-all.sh`) :
- `tests/test_indicateurs_boucles.js` : anciennes versions figées contre nouvelles, sur `tests/fixtures/bougies-btcusdt-15m.json` (3 000 bougies réelles).
- `tests/test_chaleur.js` : le `heatmap.json` du dépôt, converti dans l'autre format, donne la même grille octet par octet ; couche identique pixel par pixel à l'ancien chemin pour 9 fusions × seuils ; corps abandonné ; règle de relecture.
- `tests/test_reseau.js` (horloge simulée) : URL, revalidation, relecture quand attendue, onde par publication, cartes rendues après un échec, MINI, préchargement aux URL exactes du démarrage, queue inchangée, cache borné.
- `tests/test_sobriete.js` (Chromium) : éclair en classe sans animation ; horloge dans la tâche du prix, arrêtée onglet caché ; une onde par publication ; calque aligné et traversé par le pointeur ; aucun dessin du graphique au survol ni au repos sans donnée nouvelle ; étiquette qui suit le prix, libellé recouvert omis ; préchargement repris ; historique après le premier dessin ; couche de chaleur gardée et datée ; anneau suspendu au survol ; hyalite absent en rendu logiciel et présent avec `?glass=force`.

Chacun de ces quatre tests échoue si l'ancien comportement revient (vérifié contre la version d'avant).

Dans ARCHITECTURE.md, ligne « Fusionner, jamais affiner » : `fusionnerCellules` est remplacé par `fusionnerGrille`, et le harnais `test_chaleur.js` s'ajoute.

### Mesures

Méthode : Chromium sans GPU (SwiftShader), 4 cœurs partagés, 1440×900, densité 1. Données réelles (api.binance.com réécrit vers data-api.binance.vision par CDP, cache HTTP conservé ; raw.githubusercontent.com direct). « Avant » = c093058, « après » = HEAD, passages entrelacés A/B. CPU de tous les processus ; fil principal = TaskDuration.

**CPU au repos** (ms/s, médiane de 3 × 20 s)

| Thème | Avant | Après |
|---|---|---|
| Kāla | 105,5 | 48 (fil principal 30,9 → 9,2 ; recalculs de style 18,8 → 1,6/s) |
| Aero | 186 | 90,5 (processus GPU 109 → 62) |
| Aero nuit | 170 | 87 |
| Néon | 89,5 | 47 |
| Codex | 90 | 44,5 |

Anneau d'Aero seul, au repos : anneau masqué unique 129 ms/s ; 4 bandes étendues (livré) 92 ; bandes simples de 16 px (refusées) 80.

**Survol et gestes** (CPU par image tous processus / fil principal / appels à drawChart)

| Cas | Avant | Après |
|---|---|---|
| Kāla, survol | 24,6 / 9,6 / 1,01 | 19,8 / 3,7 / 0,01 |
| Aero, survol | 85,2 / 11,5 / 1,02 | 23,0 / 4,0 / 0,01 |
| Glisser et molette | ≈ 27–30 | inchangés (un redessin complet par image) |

**Coût de chaque rafraîchissement** (un événement, CPU sur 4 s moins le calme ; tous processus · fil principal, Kāla puis Aero)

| Événement | Avant | Après |
|---|---|---|
| Changement de prix | 150 · 40 / 240 · 39 | 60 · 9 / 90 · 10,5 |
| Tic d'horloge séparé | 10 / 10 | 0 (même image que le prix) |
| Cycle des bougies (5 s) | 60 / 110 | 40 / 60 |
| Relecture de market-data.json (60 s) | 370 / 1 230 | 10 / 20 |
| Relecture de heatmap.json (60 s, couche allumée) | 130 / 170 | 10 / 10 |

**Micro-mesures** : configuration lourde (13 surcouches + 11 sous-graphes) après vidage du mémo 10,7 → 3,0 ms ; couche de chaleur, défaut de cache à 1×1 43,8 → 5,1 ms ; tas JS autour d'une relecture de heatmap 7,6 Mo (pic 13,6) → 3,0 Mo plat ; les 6 calculs réécrits sur 3 000 bougies 11,0 → 2,65 ms (node).

**Octets par heure** (Kāla, couche Liquidité allumée, vrai CDN) : total 4,81 → 3,96 Mo/h ; ticker 3 722 → 3 362 Ko/h (type=MINI) ; market-data.json 519 Ko/h (60 req/h) → 39 Ko/h (15 req/h) ; heatmap.json : corps abandonnés quand rien n'a changé. Tas JS au départ 6,9 → 2,2 Mo ; CPU moyen sur 16 min 109 → 47 ms/s ; renderFeedTo 1 → 0,06 appel par minute.

**Chargement** (cache froid, médiane de 3, ms depuis la navigation ; Kāla puis Aero) : premier affichage 200 → 196 / 384 → 384 ; chiffres clés 289 → 226 / 382 → 359 ; prix 418 → 324 / 463 → 438 ; premier graphique 785 → 512 / 508 → 401 ; CPU des 7 premières secondes 1 460 → 1 240 / 4 980 → 2 630 (hyalite sauté sous rendu logiciel). Les pages d'historique plus anciennes sont différées exprès.

### Non fait (et pourquoi)

- Mémo incrémental des indicateurs (ne recalculer que la dernière bougie toutes les 5 s) : non fait. EMA, RSI, ADX et SAR sont récursifs et chaque clé du mémo inclut la dernière bougie : une mise à jour sûre demanderait du code incrémental par indicateur. Fait à la place : une queue inchangée garde le mémo et saute le redessin, et la réécriture en boucles fait passer une configuration lourde de 10,7 à 3,0 ms.
- Suspension de l'anneau d'Aero pendant les redessins isolés : non faite (drag, molette et tactile sont déjà couverts par geste() ; suspendre autour d'un redessin isolé coûterait un re-flou complet au retour). L'anneau en 4 bandes l'a remplacée.
- Sommes glissantes pour SMA et Bollinger : rejetées, les valeurs doivent rester identiques au bit près (mesuré : 2 632 valeurs de SMA20 sur 2 981 diffèrent, écart max 1,2e-10).
- Le thème par défaut (Aero) n'est pas changé : décision du propriétaire.
- js/structures.js (balayage du HUD) garde un `void offsetWidth` par nouvelle publication : coût négligeable, code de structure de thème.

## Terminal : Horloges et Contre-expertise

Horloges (js/horloges.js). Le terminal donne l'âge de chaque instant qu'il affiche. La liste n'est pas écrite à la main : elle reprend chaque champ de meta.champs dont la nature est « horodatage » (alias exclus, un par TF pour tf.*), plus les horloges propres à la page : ticker, bougies, lecture ⚡, market-data.json (updated), heatmap.json (updated). Pour chaque source de la page, on voit son dernier succès et, en cas d'échec, la panne nommée : hors ligne, refus régional (HTTP 451), limite de requêtes (429/418), serveur en panne (5xx), JSON invalide, fichier figé. C'est la fonction pure Horloges.classer. « Figé » veut dire plus vieux que 2 × la cadence mesurée ; tant qu'aucune mesure n'existe, le seuil est CADENCES.fige_min, affiché « attendue 15 min (convention) ». L'horloge du poste est comparée à celle de Binance via /api/v3/time (poids 1, toutes les CADENCES.horloge_binance, meilleur aller-retour des 5 derniers) ; « horloge de ce PC : écart ≈ … s » s'affiche au-delà d'une seconde.

Sur le graphique, la couche « Liquidité » porte maintenant ses deux âges : « Carte publiée · dernière colonne il y a X · publiée il y a Y ». Cela corrige une entorse à la règle « chaque calque porte son âge ». Un repère pointillé marque l'instant de la publication, avec un point au prix publié : « fichier HH:MM UTC · prix publié … (il y a X) ». Il n'est jamais relié à la ligne de prix.

Contre-expertise (js/contre-expertise.js), « Vérifié par ton navigateur ». La page recalcule depuis Binance ce que le serveur a publié. Pour chaque TF présent dans le fichier : RSI, EMA 20/50, ATR, support/résistance et leurs dérivés. Les paramètres viennent de meta.champs, et la tolérance vaut 0,5 × 10^−d, d étant le nombre de décimales que le fichier affiche. Les bougies sont demandées jusqu'à derniere_cloture_a, au nombre bougies_lues, et la bougie en cours est reprise de last_5_candles. Le CVD est retrouvé « à la seconde » : le résidu des fenêtres est comparé aux bougies d'une seconde. Le prix doit tomber dans la fourchette de ses secondes (fenêtre −30 s / +5 s, une convention).

États : ✓ retrouvé, ≈ cohérent (avec sa borne), ✗ différent (« source modifiée ou calcul différent », avec les deux valeurs ; jamais « serveur faux »), format antérieur, Binance injoignable. Les champs futures, Deribit, Coinbase, Yahoo et carnet sont listés avec la raison pour laquelle la page ne peut pas les vérifier. Coût : 6 lectures (≈ 12 de poids), une fois par publication, seulement quand la carte est à l'écran et l'onglet visible.

Les deux scripts sont chargés avant js/app.js, qui reste le dernier : les harnais node retirent son init() final.

Vérifier :
- node tests/test_horloges.js
- node tests/test_contre.js (rejoue une publication réelle et les réponses enregistrées dans tests/fixtures/contre/ ; tout ✓/≈ ; une décimale changée, une bougie modifiée, bougies_lues retiré, un 451 donnent chacun le bon état)
- node tests/test_structures.js (cartes et âges visibles dans les 5 thèmes)
- dans la page, ouvrir le panneau marché et faire défiler jusqu'aux cartes « Horloges » et « Contre-expertise ».

### Non fait (et pourquoi)

- Comportement en HTTP 451 inchangé : un visiteur qui reçoit 451 perd toute la donnée live ; un repli sur data-api.binance.vision changerait HOTES_APPELES dans le contrat réseau. Décision du propriétaire.
- Seuls les nouveaux affichages utilisent l'horloge recalée sur Binance (panneau Horloges, âge du calque, repère, bandeau de la contre-expertise). Les âges existants (voyant, bandeau d'âge, bande des chiffres clés) gardent Date.now().
- Le seuil « figé » retombe sur CADENCES.fige_min, déclaré convention, tant que la Chronique n'a pas mesuré la cadence (Horloges.seuilFige(cadenceMesureeMs) est prêt).

## Terminal : Chronique des publications

### Chronique des publications (terminal)

**Ce qui change.** La bande des chiffres clés (#cycle) et chaque fiche montrent maintenant les dernières heures de publications de market-data.json. js/chronique.js relit les publications passées dans l'historique git du dépôt, à `/master~N/`, sur le même hôte que le fichier courant (URL dérivée de DATA_URL, aucun hôte nouveau). Le dépôt alterne publications et cartes de chaleur, d'où la marche de deux en deux, par lots de 4. Elle s'arrête à la première des conditions suivantes :
- publication déjà en cache ;
- horizon de 6 h, compté depuis la publication la plus récente ;
- 30 lectures dans la session ;
- 429 ou 403, avec le message « GitHub limite les lectures : historique partiel » ;
- 404 (début de l'historique) ;
- un lot entier sans publication nouvelle.

Les doublons (même `updated`) sont retirés. Quand deux publications sont écartées de plus de 1,5 × la médiane MESURÉE des intervalles, les ancêtres impairs entre elles sont relus une fois. La lecture de chaque minute ajoute sa publication sans requête de plus. Le relevé est gardé 48 h en localStorage (`samsara-chronique-v1`), sous try/catch : c'est une commodité, il se reconstruit depuis git.

**Lecture.** Un champ absent d'une publication (format antérieur) vaut null, « champ absent », jamais 0. La ligne se coupe sur un trou de plus de 2 × la médiane, sans interpolation. Le titre et l'infobulle disent « 6 h · N publications · min … max … · nature : … » (nature lue dans meta.champs). Une série à fenêtre glissante (fenetre de meta.champs contenant « glissant ») est étiquetée « fenêtre glissante, un point par publication ». Chaque fiche porte une courbe « Dernières heures de publications » avec les trous hachurés.

**Priorité aux valeurs.** Les traces de la bande passent après les valeurs : ajusterKpis place d'abord les valeurs seules, puis rend leur trace aux premières tant qu'elles tiennent. On les voit donc partout en Néon (HUD) et en Codex, et en Aero ou Kāla sur un écran large (1920 px). À 1440 px en Aero, la bande n'a même pas la place des 8 valeurs : il n'y a pas de trace, mais le résumé reste en infobulle et la courbe dans la fiche.

**Horloges.** « Figé » se juge désormais sur la cadence mesurée de market-data.json (« cadence mesurée 15 min »). heatmap.json garde la convention.

**Coût.** Une rafale unique d'environ 25 lectures d'environ 46 Ko (mesuré sur le vrai dépôt : 24 publications sur 6 h, cadence 15 min, un comblement impair). Elle part 1,5 s après le premier écran, onglet visible. Ensuite, rien : pas de minuterie, pas d'animation, rendu à l'arrivée d'une donnée seulement. CPU au repos mesuré avec perf-terminal/m2-repos.js (30 s × 2 essais), avant/après : Kāla 49,7 → 45,7 ms/s, Aero 89,0 → 88,3 ms/s, script du thread principal 0,75 → 0,63 et 0,70 → 0,70 ms/s. Pas de différence au-delà du bruit.

**Vérifier.**
- `node tests/test_chronique.js` : arrêts, comblement, plafond, cache, null, tracé.
- `node tests/test_structures.js` : traces sans valeur masquée, traces visibles en HUD et Codex, courbe de fiche visible dans les 5 thèmes.
- `node tests/test_sobriete.js` : l'historique part après le premier dessin.

**Correctif lié.** L'heure de publication (#updated) est posée avant la mesure de la bande. Dans l'ordre inverse, des chiffres clés restaient « affichés » mais coupés au bord (mesuré à 1440 px).

### Mesures

CPU au repos avec perf-terminal/m2-repos.js, 30 s × 2 essais, données réelles. AVANT : copie de HEAD ae705aa. APRÈS : copie de l'arbre de travail.
- Kāla : 49,67 → 45,67 ms/s tous processus ; script du thread principal 0,75 → 0,63 ms/s ; styles 1,73 → 1,43 /s.
- Aero : 89,0 → 88,33 ms/s ; script 0,70 → 0,70 ms/s ; drawChart 12/min dans les deux cas.
- Aucun surcoût au repos au-delà du bruit (d'autres agents tournaient en parallèle).

Réseau, vrai dépôt : 25 lectures /master~N/ (24 paires, plus ~21 en comblement) pour 24 publications sur 6 h (10:33 → 16:18, sans trou). Cadence mesurée : 15 min. Arrêt : horizon.

Bande #cycle (script kpis.js, chiffres clés non masqués / traces visibles) :
- Néon et Codex : 8/8 à 1280–1920 px ; 8/5 à 1024 px.
- Aero et Kāla : 8/8 à 1920 px ; 5/0 à 1440 px (la base déclarait 8, mais 3 étaient coupés : scrollWidth 628 > clientWidth 451) ; 3/0 à 1280 px.

### Non fait (et pourquoi)

- Bande « régimes » et carte de chaleur sur 48 h : hors périmètre du brief réduit.
- Aucune modification des scripts serveur ni des fichiers publiés.
- tests/budget-themes.json non touché. La mesure périmée de themes/codex.css existait déjà au HEAD précédent (vérifié sur une copie de ae705aa) : seul échec de test_contrat, du type admis.
- « Depuis ta dernière visite » : non fait, livraison suivante selon le jury. Le cache de 48 h le prépare.
- Pas de rafraîchissement d'une fiche déjà ouverte quand la marche se termine : on évite de lui voler le focus. La courbe apparaît à la prochaine ouverture.

## Thème Bureau 95 (et Bureau 95 contraste)

#### README — Thèmes. « Bureau 95 » (clair) et son jumeau « Bureau 95 contraste » (sombre, schéma « contraste élevé ») reprennent le bureau d'un ordinateur personnel du milieu des années 1990. La page avait déjà une barre des tâches et son horloge : la structure « Fenêtres » en fait apparaître les fenêtres. Le graphique devient une fenêtre : barre de titre, barre d'outils (le ruban), zone client blanche, barre d'état. La barre d'état porte les chiffres clés de la dernière publication et leur âge ; ce qui ne tient pas est masqué en entier, en partant de la fin. Le marché live devient une seconde fenêtre, active au survol. La barre des tâches reçoit « Démarrer » (le menu des thèmes), un lancement rapide (les six boutons d'accès de l'en-tête, ce qui libère la place du prix au téléphone) et une zone de notification. On y lit le point live, l'heure de publication (« Pub. hh:mm UTC ») et l'horloge du poste : deux heures, chacune nommée. Le prix et sa variation sont dans des champs blancs enfoncés. Les cartes deviennent des zones de groupe. Le bandeau d'âge devient une boîte de message, avec son texte inchangé. Une publication en retard garde ses minutes et prend une icône d'avertissement. Rien n'est animé, à part l'onde du point live, qui reste celle de la base mais passe par paliers. Touche D : on passe d'un jumeau à l'autre.

#### ARCHITECTURE — Structures. STRUCTURES.fenetres (js/structures.js) déplace les vrais nœuds avec chantier() : #indicatorBar et #cycle entrent dans .chart-container ; #themeBtn et les six boutons d'accès entrent dans .taskbar-left ; #dot, #updated et #taskbarClock entrent dans .f95-zone. Le décor est marqué data-decor : barres de titre, « Pub. » et « UTC ». La structure observe la fenêtre du graphique avec un ResizeObserver, débranché au démontage. Quand cette fenêtre change de largeur (ouverture du marché live), elle relance ajusterKpis et redimensionne le canvas sans attendre. Dans l'en-tête de la base, la bande ne dépendait pas du panneau ; dans la barre d'état, elle en dépend. tests/test_structures.js vérifie désormais, pour toute structure, que chaque MutationObserver ou ResizeObserver qu'elle crée est débranché quand on la quitte.

#### ARCHITECTURE — Jumeaux. Les deux feuilles portent les mêmes règles, chacune sous son propre sélecteur, comme l'exige le contrat. Seuls les jetons diffèrent : relief à quatre filets (--relief-1..4, --releve, --appuye, --enfonce…), --champ, --titre-actif / --titre-inactif / --titre-ink, --surbrillance, --trame-95, images SVG du décor. tests/test_fenetres.py (étape 8c) échoue si les deux feuilles divergent hors de leur bloc de jetons. Il mesure aussi les 13 couples texte / fond propres à la structure, sur chaque borne du fond (AA ≥ 4,5:1). Pour modifier une règle, il faut donc la modifier dans les deux feuilles.

#### ARCHITECTURE — Polices. fonts/bureau95-titres.woff2 : Pixelify Sans, OFL, sans nom réservé, instance 700, ā ṃ composés, 8,4 Ko. Elle sert aux barres de titre, à « Démarrer », au bandeau du menu et au h1, en 16 et 23 px. Ses chiffres sont proportionnels et son 5 ressemble à son S. fonts/fabriquer.py les retire donc du sous-ensemble (PLAGES_LATIN_SANS_CHIFFRES), et tout chiffre de titre vient de la police système. tests/test_polices.py le vérifie dans le fichier. Le texte et toutes les valeurs restent en police système. Le canvas utilise une police étroite (--police-graphique : Tahoma, Arial, Liberation Sans) : il place les colonnes de son info-bulle à des abscisses fixes, et elles se chevauchaient avec DejaVu Sans.

Vérifier : python3 tests/test_fenetres.py ; node tests/test_fenetres.js ; node tests/test_structures.js ; python3 tests/test_palette.py ; puis node tests/test_budget.js bureau95 bureau95-contraste --enregistrer (mesure à consigner en série). Mesure indicative : repos ×0,67 et ×0,69, geste ×0,66 et ×0,68 par rapport à Kāla. C'est le thème le moins coûteux de la collection : tout est opaque, sans lueur ni flou.

### Mesures

Budget (node tests/test_budget.js bureau95 bureau95-contraste --ticks : 5 essais entrelacés, 10 s de repos, geste de 90 images, prix qui bouge chaque seconde, CPU de tous les processus). Référence Kāla : repos 138,0 ms CPU/s, geste 24,67 ms/image. bureau95 : repos ×0,67, geste ×0,66. bureau95-contraste : repos ×0,69, geste ×0,68. Témoin (Kāla contre Kāla) ×1,01 / ×1,00. Contre-épreuves refusées : animation infinie qui repeint ×18,43, flou sur le graphique ×1,54 / ×1,57. Police : bureau95-titres.woff2 = 8 408 octets, identique au bit près à la reconstruction. Géométrie mesurée : barre d'état 8/8 chiffres clés à 1440 et 1280 px panneau ouvert ; 1100 px panneau ouvert 8 → 5, aucun coupé ; téléphone 390 et 360 px : barre des tâches sans chevauchement.

### Non fait (et pourquoi)

- Phase 2 « Exécuter… » du menu Démarrer : hors périmètre.
- Aucune modification de js/app.js : le chevauchement de l'infobulle est corrigé par le crochet --police-graphique du thème.
- Triangle d'avertissement : image SVG en ::before plutôt qu'un clip-path (toujours pas un glyphe ; le SVG porte le contour noir nécessaire sur fond blanc ou jaune).
- Onde du voyant : steps(4) au lieu de steps(1) (invisible sinon) ; deux passages par publication, coupée sous prefers-reduced-motion.

## Thème Gare

### Thème « Gare » (structure « tableau »)

**Ce qui change.** Un sixième thème, sombre, sans verre : le grand tableau à palettes d'une gare des années 1960 à 1980. Noir mat, palettes blanches, jaune signalétique, plaques de voie bleues pour les intervalles. La hausse est bleue, la baisse vermillon ; les deux restent séparées sous les trois daltonismes (tests/test_palette.py).

Sa structure, `STRUCTURES.tableau` (js/structures.js, réversible par `chantier()`) :
- les chiffres clés quittent l'en-tête pour un tableau pleine largeur, « Cotations », suivi de l'heure de publication (« Publié à HH:MM UTC ») ;
- chaque bloc dit sa **provenance** et sa cadence (« Provenance serveur · 15 min », « Binance · 1 s »). Ces étiquettes sont du décor dont la cadence est **lue dans CADENCES**, jamais recopiée ;
- la barre des tâches devient l'« Information voyageurs », avec l'« Heure locale ».

Sur un écran d'au moins 1000 px de haut et 1200 de large, le marché live devient le tableau des départs **sous** le graphique, avec les cartes en rangée. En dessous, il reste le panneau latéral habillé en tableau.

**Les palettes.** Prix, variation 24 h, chiffres clés, âge et heures s'écrivent sur des palettes, en CSS pur, sur les vrais nœuds :
- une police à chasse fixe, Noto Sans Mono en instance condensée : chaque glyphe gardé fait 530 unités ;
- un fond qui pose une tuile tous les 1ch, plus un joint à mi-hauteur ;
- la tuile tombe donc sous chaque caractère. Tout `letter-spacing` est remis à 0.

**L'âge devient la remarque du tableau.**
- « À l'heure · 4 min » jusqu'au seuil de la page (`CADENCES.vieux_min`, la classe `.vieux` de la base) ;
- « Retard · N min » au-delà, en jaune encadré ;
- aucune remarque quand l'âge est inconnu : « à l'heure » serait faux.

C'est une lecture de la fraîcheur de la donnée, pas un conseil.

**L'effet : la chute.** Une palette « tombe » quand sa valeur change : un demi-volet se rabat une fois (transform, 0,22 s). Le volet ne passe que sur le texte déjà juste : aucun faux caractère ne défile jamais. Les déclencheurs :
- une publication nouvelle (on compare le texte de `#updated`, réécrit chaque minute) : les chiffres clés, l'âge et l'heure ;
- la minute de l'âge : l'âge seul ;
- le prix : au plus une chute par `CHUTE_PRIX_MS` (5 s).

Rien au repos, rien sous `prefers-reduced-motion`. Les deux MutationObserver sont débranchés au démontage.

**Coût mesuré.** `node tests/test_budget.js gare --ticks` : repos ×0,79, geste ×0,83 du thème de référence. Le seuil du dossier pour garder la chute du prix était ×1,5.

**Au téléphone.**
- Le tableau garde les chiffres clés et leur âge.
- Sous 480 px, l'en-tête passe sur deux lignes, prix et variation 24 h d'abord. La base faisait passer les boutons par-dessus le prix.

**Polices** (fonts/fabriquer.py, OFL, aucun nom réservé) :
- `gare-palettes.woff2` : Noto Sans Mono, wdth 75, graisses 500 à 700 (27,6 Ko). Elle a γ et ā ṃ Ṃ ;
- `barlow-condensed-500.woff2` et `barlow-condensed-600.woff2` : Barlow Condensed (17,4 + 17,6 Ko), avec ṃ / Ṃ composés.

Le navigateur ne les télécharge que si le thème est actif.

**Comment vérifier.**
- `node tests/test_gare.js` (étape 9c de run-all.sh) :
  - chaque palette mesure n × 1ch, « long γ » compris ;
  - CADENCES modifiée dans la page → l'étiquette de provenance suit ;
  - les remarques « À l'heure », « Retard » et « âge inconnu » ;
  - les chutes à l'événement seulement (même publication réécrite → rien) ;
  - la borne de 5 s sur le prix ;
  - le mouvement réduit ;
  - les observateurs débranchés au démontage ;
  - la disposition à 1920 × 1080, 1440 × 900 et 390 × 800.
- `node tests/test_structures.js`, `python3 tests/test_palette.py`, `python3 tests/test_polices.py`.
- Enregistrement du budget : `node tests/test_budget.js gare --enregistrer`.

### Mesures

Méthode : node tests/test_budget.js gare --ticks (Chromium sans GPU, CPU de tous les processus, prix qui bouge chaque seconde, 5 passages entrelacés, 10 s de repos, geste de 90 images ; machine partagée). Feuille finale : repos ×0,79 (passages ×0,78 ×0,79 ×0,81 ×0,80 ×0,79), geste ×0,83 ; témoin ×1,00 / ×1,03 ; contre-épreuves refusées (animation infinie ×19,15, flou ×1,58 au geste). Le repos étant sous ×1,5, la chute du prix est gardée (au plus une toutes les 5 s). Polices (mesurées avec fontTools) : gare-palettes.woff2 27 592 octets (chasse de 530 unités pour tout caractère de valeur), barlow-condensed-500 17 440, barlow-condensed-600 17 636.

### Non fait (et pourquoi)

- Aucune nouvelle fiche : Gare garde les bougies par défaut, et le seuil de la remarque est celui de la page (CADENCES.vieux_min) : aucune convention nouvelle à déclarer.
- En-tête de la base à 390 px (boutons dessinés sur le prix, visible en Kāla et Néon) : hors périmètre ; Gare le contourne dans sa feuille (en-tête sur deux lignes sous 480 px).
- ajusterKpis après le chargement des polices pour Néon et Codex : non touché (Gare le traite dans sa structure).
- Pas de ▲▼ dans le sous-ensemble : les triangles du prix sont des bordures CSS.

## Thème Gazette

**Thème « Gazette » (structure « une »).** La une d'un quotidien financier : papier journal (un grain fixe dans `--fond`, aucun calque posé sur la page), deux encres. La hausse est NOIRE en bougie CREUSE, la baisse ROUGE en bougie pleine (`--bougie-forme: creuse-hausse`, angles vifs) : un double codage forme + couleur, qui tient sous les trois daltonismes. Registre : `<link … data-theme-id="gazette" data-nom="Gazette" data-mode="clair" data-verre="aucun" data-structure="une">`. Aucune animation : la manchette et le tampon changent par une classe.

La structure (`STRUCTURES.une`, js/structures.js) déplace les vrais nœuds :
- une plaque de titre en trois colonnes. L'oreille gauche porte le cours à la seconde (paire, prix, variation 24 h). Au centre, le titre en « Samsara Gazette Titre ». L'oreille droite dit « Édition de 13:03 UTC », puis, sur une ligne de hauteur fixe : la cadence attendue, ou « Édition périmée » quand la cote est vieille, ou le tampon « Dernière heure » ;
- un folio (date du poste, outils), la manchette, « la cote » (#cycle), la légende du cliché sous le graphique et le téléscripteur.

Sous 1000 px, le titre passe au-dessus des oreilles. Au téléphone, l'oreille du cours prend toute la largeur et la cote reste affichée.

**La manchette ne calcule rien.** Elle recopie, au caractère près, le texte affiché des chiffres clés de la cote, repérés par leur libellé (`GAZETTE_CLES` : Funding, OI 24h, CVD 24h, GEX). Ce sont des champs sans équivalent live : titrer la variation 24 h publiée contredirait l'oreille, qui bat à la seconde. Son seul mot choisi est le verbe de la variation de l'intérêt ouvert, tiré du premier caractère du texte affiché : « + » progresse, « − » recule, sinon stable. Elle n'a ni seuil ni adjectif : c'est un compte rendu, pas un avis. Une valeur « — » est omise.

Le tampon s'allume à une édition NOUVELLE seulement, jusqu'à la relecture suivante (`CADENCES.publication_lue`). Toutes les cadences dites (« à la seconde », « toutes les 5 s », « paraît toutes les 15 min ») sont lues dans `CADENCES`. Quand la manchette change de hauteur, le graphique se remesure. Au démontage, l'observateur est débranché et les minuteries sont annulées.

**Polices (fonts/fabriquer.py).**
- Old Standard TT 400 et 700 : le texte et toutes les valeurs (dix chiffres de même chasse).
- League Gothic (instance wdth=100) : les rubriques et la manchette.
- Playfair Display (instance 800, ṃ composé, lettres de « Saṃsāra » seulement), RENOMMÉE « Samsara Gazette Titre » à cause de son nom réservé.

**Correctif polices.** Le renommage ne réécrit plus la mention de copyright, la marque ni la licence d'une police (`NOMS_D_ORIGINE`). Avant, Orbitron et UnifrakturMaguntia y étaient attribuées à « The Samsara … Project Authors », avec un nom réservé « Samsara … » que personne n'a déclaré. neon-titre.woff2 et codex-lettrine.woff2 ont été refaits : seules les tables `name` et `head` changent.

**Vérifier.**
- `node tests/test_gazette.js` (étape 9c) : recopie de la cote, règle du verbe, tampon, édition périmée, cadences lues, démontage, mise en page à cinq tailles, encres propres au thème ≥ 4,5:1, plaque dans la police renommée.
- `node tests/test_structures.js`, `python3 tests/test_palette.py`, `python3 tests/test_polices.py` (avec fontTools).
- `node tests/test_budget.js gazette --enregistrer` pour consigner le budget.

### Mesures

Hauteur du graphique (canvas, données réelles) : 1440×900 : 523 px (Aero 656) ; 1280×720 : 398 px après resserrement (Aero 476, Codex 421) ; 390×800 : 469 px. Planchers vérifiés par test_gazette.js : ≥ 480 px à 1440×900, ≥ 380 px à 1280×720. Budget (5 essais entrelacés, machine partagée) : repos ×0,71, geste ×0,62. Polices (woff2) : old-standard-400 14 948 o, old-standard-700 14 824 o, league-gothic 10 476 o, gazette-titre 1 956 o. Contrastes propres au thème (sur les vraies bornes du papier) : tampon 5,94:1, édition périmée 6,05, cadence 5,77, légende 9,94, « La cote » 15,03, âge en retard 5,79.

### Non fait (et pourquoi)

- Sommaire (barre des indicateurs) pas en petites capitales : Old Standard n'a pas de smcp ; le navigateur les simulerait, et « 1m / 1h / 1D » se lirait « 1M / 1H », ambigu (1M = un mois ?).
- Chapeau et légende en romain : le dossier ne fournit que Regular et Bold, pas de faux italique.
- Pas de jumeau (absent du dossier).

## Thème Cyanotype (et Diazo)

### Thèmes Cyanotype et Diazo, structure « Planche »

**Ce que c'est.** Une planche de dessin technique. Cyanotype (sombre) est le tirage au bleu de Prusse : traits blancs, corrections au crayon rouge, surligneur jaune. C'est le seul thème sombre qui ne soit pas noir. Diazo, son jumeau clair (touche D), est le tirage diazo : traits bleu-violet sur papier crème. Le lettrage est en Overpass Mono (chasse fixe : les chiffres s'alignent en colonne). Les titres sont écrits à la main (Architects Daughter), jamais pour un nombre. Les deux polices sont sous OFL, sans nom réservé, et fabriquées par fonts/fabriquer.py.

**La structure (js/structures.js, STRUCTURES.planche).** Elle est réversible par chantier(). Elle pose :
- **Le cadre.** Il est fixe, sous le contenu (z-index −1 ; il faut donc que <html> n'ait pas de fond). Il porte 24 repères de zone (1–8, A–D) et 4 repères de centrage, dans la gouttière : 20 px, 13 px sous 1100 px, rien au téléphone.
- **Le pied de planche**, entre le graphique et le Grid Bot. À gauche, la nomenclature des calques : c'est le ruban d'outils, sur deux rangées au bureau, et son menu « Indicateurs » s'ouvre vers le haut. À droite, le cartouche, registre de la dernière publication :
  - les chiffres clés en cases ;
  - l'âge devient l'« indice de révision », marqué d'un △ au crayon rouge quand la publication est en retard (seuil de la page) ;
  - l'heure devient la « date de révision », en UTC ;
  - les sources sont lues dans la publication (champ source).
- **Les étiquettes.** Le graphique est la « Vue A » ; les cartes du marché deviennent « Détail A, B… » ; le bandeau d'âge devient une « NOTE » au crayon rouge, avec son texte inchangé.
- **Le nuage de révision.** Il entoure le cartouche pendant 90 s quand l'heure de publication CHANGE. C'est un dessin statique : aucune animation dans ces thèmes.
- **Le suivi du canvas.** Le pied n'a pas de hauteur fixe : un ResizeObserver fait suivre au canvas la hauteur de son cadre. Il est débranché au démontage, avec le MutationObserver.

**Mise en page.**
- ≥ 1280 px : nomenclature et cartouche côte à côte ; le pied fait 90 px.
- 769 à 1279 px : le ruban défile sur une rangée et le cartouche passe dessous.
- Téléphone : l'en-tête passe sur deux rangées (en chasse fixe, le prix et les 8 boutons ne tiennent pas sur 390 px), puis le cartouche (nom, date de révision, heure) et ses 5 + 4 cases.

Hauteur du canvas mesurée, panneau du marché fermé :

| Fenêtre | Planche | Kāla | Néon | Codex |
|---|---|---|---|---|
| 1280 × 720 | 410 px | 476 px | 425 px | 421 px |
| 390 × 800 | 484 px | 591 px | 547 px | 543 px |

C'est le prix du cartouche, qui montre en permanence les 8 chiffres clés, leur âge et l'heure de publication.

**Nouveau crochet du graphique : --up-sur / --down-sur.** C'est l'encre du texte de l'étiquette du dernier prix, posée sur la couleur de la bougie en cours. Il est blanc par défaut, et rien ne change pour les thèmes existants. Cyanotype en avait besoin : sa hausse est blanche, et l'étiquette écrivait blanc sur blanc (1,07:1). tests/test_palette.py, contrôle 10, mesure ce couple : il est EXIGÉ (≥ 4,5:1) pour un thème qui déclare ces jetons, et seulement relevé pour les autres.

**Les jumeaux.** themes/diazo.css a les mêmes règles que themes/cyanotype.css, au sélecteur de thème près ; seuls les jetons diffèrent (dont les jetons propres --plan-*). Pour modifier la planche, on modifie cyanotype.css puis on reporte la même modification dans diazo.css. tests/test_planche.js échoue au moindre écart.

**Vérifier.**
- `python3 tests/test_palette.py`
- `node tests/test_structures.js`
- `node tests/test_planche.js` (étape 9d de run-all.sh) : jumeaux, chantier, mise en page à 1440/1280/1024/800/390 px, suivi du canvas, nuage, indice, encre de l'étiquette, démontage.
- `node tests/test_interface.js`
- `node tests/test_budget.js cyanotype diazo --enregistrer`, puis `python3 tests/test_contrat.py`.

### Mesures

Toutes les mesures sont faites dans Chromium (Playwright) sur ce conteneur sans GPU.

**Budget.** `node tests/test_budget.js cyanotype diazo --ticks --sans-contre-epreuves` : 5 essais entrelacés (référence, thème, référence), repos de 10 s, geste de 90 images, prix qui bouge chaque seconde. Rapports à kala (repos 144 ms CPU/s, geste 26,0 ms par image) :

| Thème | Repos | Geste |
|---|---|---|
| cyanotype | ×0,72 | ×0,68 |
| diazo | ×0,74 | ×0,69 |

Budget : ≤ ×1,6 au repos, ≤ ×1,3 en geste.

**Lisibilité de l'étiquette du dernier prix** (tests/test_palette.py) :

| | Avant | Après |
|---|---|---|
| Cyanotype, hausse | 1,07:1 (blanc sur #f4f8ff) | 12,52:1 (#0b2f5c) |
| Cyanotype, baisse | 2,56:1 | 5,20:1 |
| Diazo, hausse | 8,24:1 | 8,24:1 |
| Diazo, baisse | 4,29:1 (blanc) | 4,63:1 (#0a0718) |

**Hauteur du canvas** (panneau du marché fermé, chargement réel) :

| Fenêtre | planche | kala | neon | codex |
|---|---|---|---|---|
| 1280 × 720 | 410 px | 476 px | 425 px | 421 px |
| 390 × 800 | 484 px | 591 px | 547 px | 543 px |

**Hauteur du pied de planche** :

| Largeur | Pied |
|---|---|
| 1440 px | 90 px |
| 1280 px | 90 px |
| 1024 px | 118 px |
| 800 px | 145 px |
| 390 px | 131 px |

**Suivi du canvas.** Avant le ResizeObserver, au téléphone, avec la publication arrivée après le premier dessin, le canvas faisait 547 px pour un cadre de 484 px : bas du canvas à 642 contre un cadre fini à 579, sélecteur de plage rogné. Après : écart de 0 px.

### Non fait (et pourquoi)

- tests/budget-themes.json n'est pas commité (consigne) : les deux thèmes seront mesurés en série à l'intégration avec node tests/test_budget.js cyanotype diazo --enregistrer.
- Le brief disait « cartouche en 4 × 2 » au téléphone. J'ai fait 5 + 4 : 8 chiffres clés plus la case d'indice en 4 colonnes demandaient 3 rangées, alors que 5 + 4 (indice sur 2 cases) tient en 2 rangées à 390 px sans rien masquer.
- Le brief parlait d'un border-image radial-gradient pour le nuage. J'ai utilisé 4 radial-gradient statiques en fond d'un ::after : un border-image en dégradé n'est pas répété en festons, il est découpé dans un seul grand dégradé. L'effet est le même : statique et inerte.
- Je n'ai pas corrigé le nom interne de la police instanciée : la table name dit « Overpass Mono Light », héritée de l'instance par défaut. C'est cosmétique (@font-face sert « Overpass Mono ») et ça relève de fabriquer.py, partagé.
- Je n'ai pas touché aux étiquettes de prix des thèmes existants (contrôle 10 relevé, non exigé) : la décision appartient au propriétaire, thème par thème.
- Je n'ai pas corrigé l'en-tête de la base à 390 px (le prix passe sous les boutons dans tous les thèmes sans structure) : c'est hors de mon thème. La planche le corrige pour elle-même avec un en-tête sur 2 rangées.

---

## Troisième écrivain : `historique.py` et la branche `historique`

### Le problème

`market-data.json` est un **instantané**. L'historique de ses chiffres n'existait que dans les
commits de `master` : pour voir une tendance sur 24 h, une session devait relire une centaine
de commits — et cet historique disparaissait si le dépôt était recréé. Les sessions distantes
lisent les bougies directement sur le miroir public de Binance, mais n'ont **aucun accès aux
futures ni à cette machine** : le positionnement devait donc leur être poussé dans git.

### Ce qui a été construit

Une **branche orpheline** `historique`, faite de **données seules** (pas dans `master`, que
GitHub Pages republie à chaque push) :

```
index.json                              updated, status, errors, series, meta
series/positionnement/<année-mois>.csv   1 ligne par publication de market-data.json
series/funding.csv                       1 ligne par échéance de financement (8 h)
series/open-interest-1h.csv              1 point par heure
series/long-short-1h.csv                 comptes, gros traders, taker — 1 point par heure
```

**Lecture, sans rapatrier le dépôt** — mesurée sur le distant réel, `.git` = 152 Ko :

```bash
git fetch --depth 1 --filter=blob:none origin historique
git show FETCH_HEAD:index.json           # 14 263 o, status « ok », âge 16 s
git show FETCH_HEAD:series/positionnement/2026-10.csv
```

Le clone partiel est bien partiel (`remote.origin.promisor = true`,
`partialclonefilter = blob:none`) : les blobs se rapatrient à l'unité, ce qui justifie la
limite de **1 Mo par fichier**.

### Mesures de l'amorçage (07/10/2026 21:13 UTC)

| série | lignes | octets | trous |
|---|---|---|---|
| positionnement | **523** | 74 272 | 0 |
| funding | 500 | 22 115 | 0 |
| open-interest-1h | 500 | 23 684 | 0 |
| long-short-1h | 501 | 30 620 | 0 |
| `index.json` | — | 14 263 | 31 champs décrits |

Le positionnement couvre le 02/10 11:18 → 07/10 21:03, **523 publications distinctes sur 523
commits** — aucune perte, aucun doublon. Les trois séries Binance sont bornées par ce que la
source rend encore (1 000 échéances de funding, 500 points horaires).

Projection de taille : 3 100 lignes d'un mois plein pèsent **moins de 250 Ko** — la limite de
1 Mo garde un facteur ~4 de marge. Le dépassement, s'il arrivait, **refuse l'écriture et sort
en code 1** : aucune troncature silencieuse.

### Trois règles, et le défaut qu'elles empêchent

1. **Un mois clos ne se réécrit pas.** Clé = `updated` ; relancer n'ajoute rien. Un fichier
   dont le contenu ne change pas n'est même pas réécrit sur le disque (`ecrire_si_change`),
   donc git ne voit aucun delta. Une publication apportée pour un mois antérieur est
   **refusée et signalée**.
2. **Un trou se signale, il ne se comble pas.** Le pas nominal vient du producteur (900 s /
   8 h / 1 h), jamais d'une moyenne des écarts — une cadence déduite des données ne peut pas
   détecter sa propre dérive. Constat sur les 523 publications : les 12 écarts non-15-min
   valent 2, 13 ou 14 min, et **aucun ne franchit le seuil d'un créneau manquant** (un écart
   de 13 min donne `round(13/15) − 1 = 0`). C'est du bruit de planificateur, pas un trou — et
   le distinguer était le point.
3. **Une case vide n'est pas un zéro.** Les champs absents des anciens formats restent vides :
   le CVD et le GEX n'apparaissent que le **04/10 13:50**, la prime hors USDT que le
   **06/10 12:33**. `meta` porte, colonne par colonne, ce qu'une absence veut dire.

### Isolation de `master`

`historique.py` prend le **même verrou partagé** que les deux autres écrivains, mais travaille
dans un **`git worktree`** sur sa branche (`hist_dir`, défaut `<state_dir>/historique`) : arbre
et index séparés, objet-store partagé. Vérifié après l'amorçage : `master` inchangé, aucun
fichier modifié hors des trois ajouts voulus, `git worktree list` montre les deux arbres.

### Ce qui n'a pas été vérifié

- **Les tests de rendu dans Chromium** (étapes 9 à 9f du harnais) : Playwright n'est pas
  installé sur cette machine. Le harnais le dit et ne les compte pas comme verts.
- **Le refus au-delà de 1 Mo en production** : le chemin est exercé par le harnais (limite
  abaissée à 100 o : écriture refusée, anomalie consignée, fichier intact), mais jamais avec
  un vrai fichier de 1 Mo — la limite refuse l'écriture, elle ne découpe pas, et le cas ne se
  produit pas à la cadence actuelle. S'il devait arriver, le choix du découpage appartient au
  propriétaire du dépôt.

### Le premier passage réel (21:20:21 UTC)

La cadence `5,20,35,50` est posée juste après `publish.py` (`3,18,33,48`). Constaté sur les
journaux du planificateur : `publish` à **21:18:24** (`ok`), `historique` à **21:20:21** (`ok`).

Le même contrôle rejoué depuis un **clone neuf**, sur le distant réel :

```
git fetch --depth 1 --filter=blob:none origin historique   → ok, .git = 152 Ko
git show FETCH_HEAD:index.json                             → status ok, errors [], âge 54 s
  positionnement 524 lignes (523 à l'amorçage + la publication de 21:18)
  funding 500 · open-interest-1h 500 · long-short-1h 501 · aucun trou
```

La ligne ajoutée est bien celle du passage de `publish.py` de 21:18:17, en fin de série.
