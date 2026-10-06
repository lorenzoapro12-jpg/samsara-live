# Saṃsāra — dashboard marché live

Dashboard BTC en fichiers statiques, sans build ni dépendance : servi tel quel par GitHub
Pages, il s'ouvre dans un navigateur et se rafraîchit tout seul depuis des sources publiques.
Plusieurs thèmes, choisis à la volée (bouton palette, touche T).

**Ce dépôt est complet** : la page, les deux producteurs et TOUS leurs calculs. Depuis le
06/10/2026, aucun bloc de `market-data.json` ne dépend plus d'un module hors dépôt — chaque
champ publié est décrit dans `meta` par le code qui le calcule (voir « Les légendes »).

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
| `market-data.json` | Les données des cartes « Marché live ». Réécrit par `publish.py`. |
| `heatmap.json` | La heatmap de liquidité sur 24 h. Réécrite par `heatmap.py`. |
| `publish.py` | Agrège 8 sources → `market-data.json`. |
| `options_gex.py` | Calcul du GEX (exposition gamma des options Deribit), sans réseau — testable hors ligne. |
| `heatmap.py` | Accumule le carnet d'ordres en heatmap glissante → `heatmap.json`. |
| `samsara_config.py` | Charge la configuration locale. **Aucun chemin n'est écrit dans le code.** |
| `config.example.json` | Modèle de configuration, documenté. |
| `tests/` | Les contrôles. Une seule commande : `bash tests/run-all.sh`. |

> **Aucun fichier de ce dépôt ne contient de chemin d'installation.** Les deux scripts
> lisent `config.local.json` s'il existe et se rabattent sinon sur des défauts dérivés de
> leur propre emplacement — le dépôt fonctionne donc cloné n'importe où.

---

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

⚠️ **`state_dir` doit rester stable.** Le changer repart d'un état vide : les 24 h de
carnet accumulées sont perdues, et la heatmap affichée devient un rectangle vide.

---

## Régénérer les données

```bash
python3 heatmap.py     # à lancer toutes les minutes : il accumule, il ne recalcule pas
python3 publish.py     # indépendant de heatmap.py : il lit 8 sources
```

`heatmap.py` **accumule**. Une seule exécution ne produit qu'une colonne d'une minute :
la fenêtre de 24 h se construit en tournant. Le lancer une fois donne une heatmap
quasi vide — ce n'est pas un bug.

Les deux scripts écrivent de façon **atomique** (`tmp` + `fsync` + `replace`) et
publient sous un **verrou partagé**, en ne committant que leur propre fichier : ils
peuvent tourner en parallèle sans se voler l'index git.

`publish.py` sort en **code 1 si un bloc échoue** — jamais d'erreur silencieuse. Un bloc
dont la dépendance n'est pas branchée sort en `non configuré` et **ne compte pas** comme
un échec : un dépôt fraîchement cloné doit pouvoir tourner et dire ce qui lui manque.

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
