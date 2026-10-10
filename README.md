# Saṃsāra — dashboard BTC en direct

Dashboard BTC en fichiers statiques, sans build ni dépendance : servi tel quel par GitHub
Pages, il s'ouvre dans un navigateur et se rafraîchit tout seul depuis des sources publiques.
Onze thèmes, choisis à la volée (bouton palette, touche T ; D pour le jumeau clair/sombre) — dont six
structures de page différentes : HUD (Néon), manuscrit (Codex), fenêtres (Bureau 95 et son jumeau
Contraste), tableau à palettes (Gare), une de journal (Gazette), planche technique (Cyanotype et Diazo).

**Ce dépôt est complet** : la page, les deux producteurs et TOUS leurs calculs. Depuis le
06/10/2026, aucun bloc de `market-data.json` ne dépend plus d'un module hors dépôt — chaque
champ publié est décrit dans `meta` par le code qui le calcule (voir « Les légendes »).

---

## Retouches du 08/10/2026

- **La carte s'ouvre allégée** : Mémoire du carnet, Rafales et Destin des gros ordres sont éteints par
  défaut (un clic sur leur bouton les allume). Allumés ensemble, leurs libellés se chevauchaient.
- **Téléphone (< 480 px)** : l'en-tête passe sur deux rangées, le prix au-dessus des boutons
  (ils se dessinaient sur le prix en Kāla, Néon, Aero et Codex).
- **Bureau 95 et Contraste** : « + Indicateurs » reste collé au bord droit du ruban au lieu
  d'être coupé quand la fenêtre est trop étroite.

---

## Nouveautés du 07/10/2026 (détail : `docs/livraison-2026-10-07.md`)

- **La carte, corrigée et refaite** : environ 35 défauts distincts (68 constats), tous reproduits avant correction (échelle du live figée,
  fusion qui peignait dans le futur, colonnes live sautées, horloge jamais recalée, lecture au
  pointeur ≠ pixel, rien au tactile…), un rendu par calques (CPU au repos ÷ 2, plus aucune image
  perdue pendant un glisser), et trois calques nouveaux, tous mesurés et bornés :
  **Mémoire du carnet** (combien de temps un niveau ≥ X BTC a tenu dans chaque tranche),
  **Rafales au marché** (exécutions d'une même milliseconde, avec un nombre d'ordres PROUVÉ minimal),
  **Destin des gros ordres** (un niveau disparu : mangé par des échanges, ou retiré — borne basse mesurée,
  jamais une intention prêtée).
- **Le terminal, deux fois plus sobre** : CPU au repos ≈ ÷ 2 dans chaque thème (l'éclair du prix
  coûtait 70 % à lui seul), survol d'Aero 85 → 23 ms par image, market-data.json relu en 304.
- **Vérifié par ton navigateur** (Contre-expertise) : la page recalcule elle-même, depuis Binance,
  les indicateurs publiés (avec les paramètres lus dans `meta`) et le CVD à la seconde près.
- **Horloges** : chaque source dit son âge et la raison d'une panne (hors ligne, refus régional,
  limite, fichier figé) ; l'heure du poste est comparée à celle de Binance.
- **Chronique** : une trace des 6 dernières heures de chaque chiffre clé, lue dans l'historique git.
- **heatmap.json au format « colonnes-1 »** (sans perte) : 6× plus léger à télécharger, l'historique
  du dépôt grossit 190× moins vite. Les pages lisent les deux formats.
- **Quatre thèmes nouveaux** (six feuilles), chacun avec sa structure, son budget d'image mesuré.
- **Un troisième écrivain : `historique.py`** — les chiffres de `market-data.json` n'existaient
  que dans les commits de `master`. Ils sont désormais publiés en séries dans une **branche
  orpheline `historique`**, faite de données seules (une session distante lit `index.json`, puis
  seulement les fichiers utiles). Voir « L'historique » plus bas.

---

## Démarrer en 10 secondes

```bash
git clone <ce dépôt> && cd samsara-live
python3 -m http.server 8000       # ou n'importe quel serveur statique
# puis ouvrir http://localhost:8000
```

⚠️ **La page lit ses données sur GitHub, pas dans le dossier que tu viens de servir.**
`market-data.json` et `heatmap.json` sont chargés par des URL **absolues**
(`raw.githubusercontent.com/...`) : un clone local sert la **page**, et affiche les données
**de la branche publiée**. Modifier un JSON dans ton clone ne change donc rien à l'affichage,
et un clone qui n'a jamais été publié n'affichera jamais ses propres données.

Pour visualiser tes propres fichiers, remplace les deux URL par des chemins relatifs dans
`js/app.js` — la page est autonome par ailleurs (aucune police, aucun CDN, aucune image
distante : `tests/test_contrat.py` le vérifie).

Ouvrir `index.html` en `file://` fonctionne aussi pour le rendu, mais les appels réseau y
sont restreints par certains navigateurs : un serveur local est préférable.

---

## Les fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | **Le dashboard** : le balisage, et le registre des thèmes (`<link data-theme-id>`). |
| `css/app.css` | La structure et les composants. **Aucune couleur en dur** : tout passe par des jetons. |
| `themes/<id>.css` | Un fichier par thème : les valeurs des jetons, sous `[data-theme="<id>"]`. |
| `js/app.js` | L'application (graphique, indicateurs, cartes, Grid Bot). |
| `js/vendor/hyalite.js` | Réfraction « verre liquide » (MIT, verbatim), chargée seulement si le thème la demande. |
| `market-data.json` | Les données des cartes « Infos du marché ». Réécrit par `publish.py`. |
| `heatmap.json` | La heatmap de liquidité sur 24 h. Réécrite par `heatmap.py`. |
| `publish.py` | Agrège 8 sources → `market-data.json`. |
| `options_gex.py` | Calcul du GEX (exposition gamma des options Deribit), sans réseau — testable hors ligne. |
| `heatmap.py` | Accumule le carnet d'ordres en heatmap glissante → `heatmap.json`. |
| `historique.py` | Publie les séries (positionnement, funding, open interest, ratios L/S) dans la **branche `historique`**, avec leur index. Ne touche jamais `master`. |
| `samsara_config.py` | Charge la configuration locale. **Aucun chemin n'est écrit dans le code.** |
| `config.example.json` | Modèle de configuration, documenté. |
| `tests/` | Les contrôles. Une seule commande : `bash tests/run-all.sh`. |

> **Aucun fichier de ce dépôt ne contient de chemin d'installation.** Les deux scripts
> lisent `config.local.json` s'il existe et se rabattent sinon sur des défauts dérivés de
> leur propre emplacement — le dépôt fonctionne donc cloné n'importe où.

---

## La carte : `bookmap.html`

Une seconde page, **à côté** du terminal (qu'elle ne modifie pas et dont elle ne charge aucun
code) : la carte de liquidité, comme un trader garde ses OHLCV et sa bookmap ouvertes.

- **Axe vertical en dollars**, axe horizontal le temps. La chaleur est la carte publiée
  (`heatmap.json`, 1 min × 20 $, 24 h), prolongée par un carnet **live** lu par la page
  (100 à 5 000 niveaux, toutes les 1 à 10 s, tranche de 1 à 20 $).
- Le **prix est une ligne sur la chaleur** (clôtures 1 min, puis exécutions à la seconde),
  avec le meilleur bid / ask en marches ; les **exécutions** sont des bulles (achats / ventes
  au marché) ; les **murs** et le **gamma** du fichier de 15 min partent de leur instant de
  lecture ; un carnet latéral, un profil des exécutions, le volume et le CVD par minute.
- **Plusieurs horloges, une surface** : chaque calque porte son âge SUR la carte (pastilles), et
  ce qui n'a pas été observé est hachuré — ce n'est pas « vide ».
- **Réglages** (palette, contraste, fusion, profondeur live, bulles) : ils changent le
  détail, jamais la valeur. La fusion de la carte publiée prend le **MAX** (on fusionne,
  on n'affine jamais) ; la lecture au pointeur décode l'intensité en BTC avec l'`encodage`
  PUBLIÉ par `heatmap.py` — sans lui, la carte affiche des intensités et le dit.
- Gestes : glisser, molette (temps ; Maj ou sur l'axe : prix), pincer, double-clic ou R
  (vue par défaut), F (suivre), L (légende).

Le temps réel à 100 ms (flux WebSocket) n'est **pas** construit : il dépend d'une sonde
réseau à lancer depuis le poste qui affichera la carte. Harnais : `tests/test_bookmap.js`
(calculs, hors ligne) et `tests/test_bookmap_rendu.js` (rendu réel dans Chromium, Binance
simulé ; « non exécuté » sans Playwright).

## Thèmes : l'habillage ET la structure

Cinq thèmes (bouton palette, touche T) : **Aero**, **Aero nuit**, **Kāla**, et deux thèmes qui
changent aussi la **structure** de la page :

- **Néon** (cyberpunk, structure « poste de pilotage ») : chiffres clés dans une bande de
  télémétrie, panneau du marché en rail à gauche, console d'indicateurs sous le graphique,
  coins de visée, balayage, titre qui « glitche » ; typographie d'écran.
- **Codex** (médiéval, structure « manuscrit ») : frontispice à lettrine enluminée, registre des
  chiffres clés, deux folios (la chronique au verso, la carte au recto) et leur reliure,
  colophon ; parchemin, rubriques au vermillon, hausse au lapis, baisse au vermillon.

Une structure (`js/structures.js`) DÉPLACE les nœuds existants (identifiants et gestionnaires
inchangés) et ajoute du décor muet ; quitter le thème rend la page nœud pour nœud.
`tests/test_structures.js` vérifie, sur bureau et sur téléphone, qu'aucune valeur ni aucun âge
visible dans la structure de base ne disparaît, et la réversibilité.

**Le contrat de performance a été révisé en le mesurant.** Les feuilles de structure gardent
leurs interdits (flou, fusion, animation infinie). Une feuille de thème peut s'en servir si elle
tient son budget d'image : `tests/test_budget.js` mesure, dans Chromium, le temps du thread
principal au repos et par image pendant un glissement du graphique, contre le thème de référence
(Kāla), et consigne le résultat avec l'empreinte de la feuille (`tests/budget-themes.json`).
Deux contre-épreuves (une animation qui repeint, un flou sur le graphique) doivent être refusées,
sinon c'est la mesure qui est aveugle. Sans navigateur, `tests/test_contrat.py` exige une mesure
à jour, des animations infinies limitées à `transform` / `opacity`, et leur arrêt sous
`prefers-reduced-motion`.

**Polices** : sous-ensembles SIL OFL servis depuis `fonts/` (et non en `data:`) — le navigateur
ne télécharge une police que si son thème est affiché, alors qu'une police en `data:` dans la
feuille du thème serait téléchargée par TOUS les visiteurs (les feuilles de thème sont toutes
chargées). Même origine, aucune ressource externe. `fonts/fabriquer.py` les refait ;
`fonts/LISEZMOI.txt` dit ce qui a été modifié et pourquoi trois d'entre elles sont renommées.

## Réglages d'affichage

Bouton **Réglages** de l'en-tête. Ils changent le niveau de DÉTAIL, jamais une valeur : un
chiffre affiché garde sa valeur et porte sa bande ou sa tranche.

- **Panneau ⚡ « En direct (à la seconde) »** (lu par la page sur Binance, donc libre) : profondeur du carnet (100 à
  5 000 niveaux — la cadence ralentit avec le poids de la requête), bandes affichées (une
  bande non couverte par le carnet reçu est dite « non couverte »), nombre de trades, seuils
  de LECTURE du ratio et des achats au marché (ils choisissent la phrase, pas le chiffre).
- **Carte « Liquidité »** (fichier de 15 min) : les bandes proposées sont celles que le
  serveur a PUBLIÉES ; s'il publie le profil du carnet, des bandes supplémentaires s'y
  calculent « à la tranche près ». La tranche des murs est un multiple de `wall_bin_usd`
  publié (des sommes regroupées : exact) ; nombre de murs, seuil minimal.
- **Ordres en attente (carte)** (la couche du graphique) : fusion des tranches et des colonnes par MAX (on fusionne, on
  n'affine jamais), seuil d'intensité. En dézoom, la fusion par MAX se fait d'elle-même au
  pixel : le lissage, qui moyennait et effaçait les murs isolés, est coupé.

`tests/test_reglages.js` le vérifie, y compris avec un fichier aux constantes inhabituelles
(tranche de 25 $, bandes de 0,2 / 0,7 %) : la page affiche CES valeurs, aucune recopiée.

## Légendes et mode débutant / expert

Chaque indicateur a sa fiche (bouton **i** à côté du chiffre, ou **?** pour le glossaire) :
une explication simple, la valeur avec son âge, **comment ça se lit** — chaque lecture marquée
*usuel*, *convention*, *débattu* ou *mesuré* —, ce que ça ne dit pas, et, quand la
littérature se contredit (GEX, ratio L/S, DXY), la contradiction elle-même.

- La **formule** d'un champ du fichier est lue dans `meta.champs` (publiée par `publish.py`) ;
  celle d'un indicateur du graphique est construite avec `PARAM` (`js/app.js`), les paramètres
  mêmes du calcul. Aucune formule n'est rédigée à côté du code.
- Le mode **Débutant / Expert** (bouton, touche M) n'est qu'une classe : le HTML est identique
  dans les deux modes, seul le niveau de détail affiché change — jamais une valeur.
- Une fiche dit comment l'indicateur **se lit**, jamais quoi acheter ou vendre.

`tests/test_fiches.js` fait tenir ces règles : champs décrits par le producteur, libellés et
formules qui suivent `PARAM` (il le modifie pour le vérifier), aucun nombre réécrit à la main,
même HTML dans les deux modes, aucun conseil.

## Configuration

```bash
cp config.example.json config.local.json   # puis éditer
```

Toutes les clés sont optionnelles. `null` veut dire « prends le défaut », donc recopier
le modèle tel quel ne change rien. `config.local.json` est **gitignoré** : c'est le seul
endroit où des chemins de machine ont le droit d'exister.

| Clé | Défaut | À quoi ça sert |
|---|---|---|
| `repo_dir` | dossier du dépôt | racine |
| `state_dir` | `<repo>/.state` | **état persistant de la heatmap (les 24 h accumulées)** |
| `out_dir` | `repo_dir` | où écrire les JSON publiés |
| `git_lock` | `<state_dir>/git.lock` | verrou partagé entre les deux écrivains |
| `git_remote` / `git_branch` | `origin` / `master` | où pousser |
| `extra_module_paths` | `[]` | ne sert plus qu'à `publish.py --comparer` (parité avec d'anciens modules) |
| `cvd_database` | `null` | **obsolète** (plus lue depuis le 04/10/2026), acceptée pour compatibilité |
| `hist_dir` | `<state_dir>/historique` | répertoire de travail de la branche `historique` (un *worktree*, pour ne jamais toucher l'index ni l'arbre de `master`) |
| `hist_branche` | `historique` | nom de la branche orpheline qui porte les séries |

⚠️ **`state_dir` doit rester stable.** Le changer repart d'un état vide : les 24 h de
carnet accumulées sont perdues, et la heatmap affichée devient un rectangle vide.

---

## Régénérer les données

```bash
python3 heatmap.py     # à lancer toutes les minutes : il accumule, il ne recalcule pas
python3 publish.py     # indépendant de heatmap.py : il lit 8 sources
python3 historique.py  # après publish.py : ajoute la publication aux séries (--amorcer : depuis les commits)
```

`heatmap.py` **accumule**. Une seule exécution ne produit qu'une colonne d'une minute :
la fenêtre de 24 h se construit en tournant. Le lancer une fois donne une heatmap
quasi vide — ce n'est pas un bug.

Les trois scripts écrivent de façon **atomique** (`tmp` + `fsync` + `replace`) et
publient sous un **verrou partagé**, en ne committant que leur propre fichier : ils
peuvent tourner en parallèle sans se voler l'index git.

`publish.py` sort en **code 1 si un bloc échoue** — jamais d'erreur silencieuse. Un bloc
dont la dépendance n'est pas branchée sort en `non configuré` et **ne compte pas** comme
un échec : un dépôt fraîchement cloné doit pouvoir tourner et dire ce qui lui manque.

---

## L'historique : la branche `historique`

`market-data.json` est un **instantané** : l'historique de ses chiffres n'existait que dans
les commits de `master`. Une session qui voulait voir une tendance sur 24 h devait relire
une centaine de commits — et cet historique disparaissait si le dépôt était recréé.

`historique.py` publie donc ces séries dans une **branche orpheline** du même dépôt, faite
de **données seules**. Pas dans `master` : GitHub Pages republie `master` à chaque push.

```
historique
  index.json                              ce que contient la branche, et ce qui manque
  series/positionnement/<année-mois>.csv   1 ligne par publication de market-data.json
  series/funding.csv                       une ligne par échéance de financement
  series/open-interest-1h.csv              un point par heure
  series/long-short-1h.csv                 comptes, gros traders, taker — un point par heure
```

**Comment la lire sans rapatrier le dépôt** — un clone partiel ne télécharge que ce qu'on
demande :

```bash
git fetch --depth 1 --filter=blob:none origin historique
git show FETCH_HEAD:index.json                        # status, séries, colonnes, trous, meta
git show FETCH_HEAD:series/positionnement/2026-10.csv # puis seulement les fichiers utiles
```

L'index **décrit tout** pour que cela suffise : pour chaque série, la liste ordonnée des
fichiers, ses colonnes, sa période, son nombre de lignes et **les trous détectés**. Chaque
fichier reste sous 1 Mo — un blob se rapatrie à l'unité, pas une arborescence.

Quatre règles de fond :

- **Un mois clos ne se réécrit pas.** Une publication apportée pour un mois déjà passé est
  refusée et signalée ; relancer le script ne duplique aucune ligne (la clé est `updated`).
- **Un trou se signale, il ne se comble pas.** L'index dit combien de créneaux manquent
  entre deux points, et où. On ne connaît pas la valeur qu'aurait portée la ligne absente.
- **Une case vide n'est pas un zéro.** Les champs qui n'existaient pas dans les anciens
  formats restent vides, et `meta` explique pourquoi (le CVD n'est publié que depuis le
  04/10/2026). L'amorçage lit l'historique des commits de `master` ; les séries Binance
  (funding, open interest, ratios L/S) sont rapatriées une fois puis prolongées.
- **Une unité publiée se contrôle.** `longAccount` vaut `ratio / (1 + ratio)` : la part longue
  est donc déductible du ratio de la même ligne, et l'index publie le contrôle
  `100 × ratio / (1 + ratio)` (un désaccord sort en code 1). La série a publié des fractions
  sous une unité annoncée « % » jusqu'au 08/10/2026 ; `--migrer-part-longue` recalcule
  l'historique déjà écrit depuis le ratio de chaque ligne — relancer ne double rien.

Il travaille dans un **répertoire à part** (`git worktree` sur la branche) : l'index et
l'arbre de `master` ne sont jamais touchés, et l'objet-store est partagé — rien à cloner.

---

## Les thèmes

Un thème est un fichier `themes/<id>.css` qui donne des valeurs aux jetons de
`css/app.css`, sous le sélecteur `[data-theme="<id>"]`, et une ligne dans `index.html` :

```html
<link rel="stylesheet" href="themes/<id>.css" data-theme-id="<id>" data-nom="Nom"
      data-mode="clair|sombre" data-verre="aucun|givre|refraction" data-paire="<jumeau>">
```

Le plus simple est de copier un thème existant (`themes/kala.css` est le plus court) et de
changer ses valeurs. Le graphique lit ses couleurs dans les mêmes jetons. Un thème n'entre
pas sans passer les mêmes contrôles que les autres : `tests/test_palette.py` (contraste,
daltonisme, overlays) et `tests/test_contrat.py` (jetons du noyau présents, règles toutes
scopées, aucun `backdrop-filter` posé par le thème, aucune animation infinie).

Le verre (`data-verre`) coûte cher : un flou recalculé à chaque image du graphique. Un
thème `aucun` est le plus rapide ; les autres suspendent leur verre pendant les gestes.

---

## Les tests

```bash
bash tests/run-all.sh
```

Dans l'ordre : compilation ; calculs serveur **hors ligne** (`tests/test_calculs.py` :
CVD, carnet, GEX sur des données construites à la main) ; indicateurs de la page **hors
ligne** (`tests/test_indicateurs.js` : SAR, ADX, RSI, EMA comparés à des implémentations
de référence) ; assemblage du JavaScript de la page ; non-régression du rendu (DOM stubbé
dans node) ; panneau ⚡ (**appels réseau réels** vers Binance) ; scan de **tous les
fichiers suivis par git** ; palette de **chaque thème** (`tests/test_palette.py` : contraste
WCAG, séparation sous daltonisme) ; contrat de la page (`tests/test_contrat.py` : registre
des thèmes, jetons obligatoires, règles de performance, réseau).

Les harnais de rendu consomment le JavaScript de la page, assemblé dans l'ordre des
`<script src>` d'`index.html` — il faut le régénérer après chaque modification :

```bash
python3 tests/refresh_harness.py && node tests/test_render.js
```

Sinon le harnais teste une version périmée et échoue sur des contrôles déjà corrigés.
C'est un faux échec vécu, pas une hypothèse.

### Le contrôle d'absence de motifs interdits

Ce dépôt est public. `tests/forbidden.js` et `tests/scan-public.py` cherchent dans **tout
fichier publié** une liste de motifs qui ne doivent jamais y apparaître (contexte de
travail, noms de projets internes, identifiants).

**La mécanique est publique ; les mots ne le sont pas.** Ils vivent dans
`tests/forbidden.local.json`, gitignoré. Copiez `forbidden.example.json` pour le créer :

```bash
cp tests/forbidden.example.json tests/forbidden.local.json   # puis remplir `terms`
```

⚠️ **Ancrez vos motifs.** Un motif court sans borne matche tout mot qui le contient :
mesuré, un motif de trois lettres a produit **24 faux positifs** au premier essai, sur des
mots courants du code. Entourez vos motifs de `\b`.

Sans le fichier local, le contrôle tourne sur l'exemple et **n'attrape rien** — il le dit
à l'écran, pour qu'un « ✅ » sans motifs réels ne soit pas pris pour une garantie.

---

## Ce qui n'est pas ici — et pourquoi

Plus rien côté calcul. Jusqu'au 05/10/2026, trois blocs (`indicators`, `macro`,
`premium`) étaient calculés par des modules d'un autre projet : aucun harnais de ce dépôt
ne pouvait vérifier qu'un libellé décrivait sa formule, et plusieurs mentaient (voir
`indicateurs.py`). Ils sont désormais calculés ici — `indicateurs.py` pour le bloc `tf`,
`publish.py` pour le DXY / VIX (Yahoo) et la prime (Coinbase) — avec **parité exacte**
vérifiée contre les anciens modules :

```bash
python3 publish.py --comparer   # sur la machine qui a encore les anciens modules
                                # (extra_module_paths) : aucun fichier écrit, aucun push
```

Toutes les sources sont publiques (**Binance**, **Deribit**, **Coinbase**, **Yahoo**) ;
seules certaines ne sont pas joignables depuis n'importe quel poste, d'où l'agrégation
côté serveur.

### Les légendes : dérivées du code, jamais rédigées à côté

`market-data.json` porte un bloc `meta.champs` : pour chaque champ, son libellé, son unité,
sa fenêtre, sa formule, sa source et sa **nature** — `mesure`, `modèle` (ex. Black-Scholes),
`convention` (hypothèse non observable, ex. le signe du GEX), `seuil` (classement par des
seuils de ce code) ou `horodatage`. Il est **construit avec les constantes du calcul** :
changer une période change la description. `tests/test_meta.py` vérifie que :

- chaque champ publié est décrit, et rien d'autre ;
- chaque nombre ou unité contenu dans un NOM (`_1h`, `_14`, `_usd`…) est celui de la
  formule — un nom faux doit le déclarer (`nom_trompeur`), sinon le harnais échoue ;
- chaque valeur est retrouvée par une implémentation de référence paramétrée par sa
  description ;
- et qu'il attrape bien les dérives (il les simule).

`heatmap.json` publie de même son `encodage` : ce qu'est une cellule (intensité
`255·√(q/100)`, `q` = plus gros niveau de prix de la tranche), comment la décoder, et
comment fusionner deux cellules (le MAX, jamais la somme).

### Ce que mesure chaque chiffre (révision du 04/10/2026)

| Champ | Mesure |
|---|---|
| `cvd_{1h,4h,24h}_usd` | achats − ventes **au taker**, spot BTCUSDT, en USD, sur des bougies 5 min (fenêtres glissantes) |
| `oi_change_24h_pct` | variation de l'open interest sur **24 h glissantes** (historique horaire) |
| `gex_usd_1pct` | USD de delta que les dealers doivent couvrir pour 1 % de mouvement — **convention** : dealers acheteurs des calls, vendeurs des puts |
| `zero_gamma` | prix où le GEX total change de signe (recalculé sur une grille de prix, ±15 %) |
| `liquidity.bandes` | BTC posés à ±0,1 / ±0,5 / ±1 % du mid — une bande n'est publiée que si le carnet reçu la couvre |
| `bid_walls`, `ask_walls` | BTC posés par tranche de 20 $ (même grille que la heatmap) |
| `support_30`, `resistance_30`, `range_24h_pct` | min / max des **30 dernières bougies** du TF (`sr_window_h` heures) — le nom `range_24h` est historique |

---

## Panneau ⚡ (lecture live)

Le bouton **⚡** ouvre une lecture directe, rafraîchie toutes les 5 secondes : prix,
bid/ask et spread, position dans le range 24 h, carnet ±0,1 % (la bande que couvrent
les 500 niveaux reçus — environ ±0,13 %), tape des 500 derniers trades, et l'âge de tout
ce qui n'est pas live.

Il n'interroge que **Binance**. Les autres sources sont agrégées côté serveur dans
`market-data.json` et arrivent avec leur retard — le panneau l'affiche explicitement.

**⚠️ Deux cadences ne se soustraient jamais.** Une première version calculait un « basis »
en retranchant le perp du fichier (daté) au spot live : elle affichait **−207 pts** quand
le vrai basis valait **−45 pts**. Le basis se calcule désormais entre le perp **et** le
spot du **même instant du fichier** ; la dérive du spot est affichée séparément. Le cas
est documenté dans la page, et `tests/test_live.js` échoue si le mélange revient.

---

## Dépendances

- **Python 3.8+** — `urllib`, `fcntl`, `math` : bibliothèque standard uniquement.
- **Node** — uniquement pour les tests.
- Aucun `pip install`, aucun build, aucune étape de compilation.

Le cours de la page est en français ; les commentaires aussi, délibérément : ils portent
les cas mesurés qui justifient chaque garde-fou. `ARCHITECTURE.md` décrit le pipeline.
