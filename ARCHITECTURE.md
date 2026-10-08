# Architecture

## Le pipeline

```
                       api.binance.com ──────────────┐   (spot, klines 5 min, carnet)
                       fapi.binance.com ─────────────┤
                       Deribit (options) ────────────┤   (GEX : options_gex.py)
                       Coinbase · Yahoo ─────────────┤   (prime, DXY, VIX : publish.py)
                                                      ▼
                                              publish.py  ──▶ market-data.json ──┐
                                                                                │
   api.binance.com (depth) ──▶ heatmap.py ──▶ heatmap.json ─────────────────────┤
   api.binance.com (aggTrades) ──▶ executions.py ──▶ executions.json (même commit) ┤
                                                                                ▼
                                                                    raw.githubusercontent
                                                                                │
   api.binance.com (ticker, klines, trades) ────────────────────────────────────┤
                                                                                ▼
                                                                          index.html
                                                                    (le dashboard, autonome)

   market-data.json ──┐
   git log master ────┤──▶ historique.py ──▶ branche orpheline `historique`
   fapi.binance.com ──┘                     (index.json + series/*.csv)
```

`index.html` ne lit **que** deux fichiers du dépôt — `market-data.json` et `heatmap.json` —
**et il les lit sur GitHub Raw, par URL absolue**, pas dans le dossier qui sert la page. Tout
le reste est agrégé côté serveur et arrive déjà digéré.

⚠️ Conséquence directe : servir le dépôt en local affiche la **page**, avec les données de la
**branche publiée**. Un clone non publié n'affiche jamais ses propres fichiers. Pour voir des
données locales, il faut rendre ces deux URL relatives.

---

## Les trois cadences — lire ce tableau avant de comparer deux chiffres

| Élément | Cadence | Producteur |
|---|---|---|
| Badge de prix, bougies, panneau ⚡ | **1 à 5 secondes** | `index.html` → Binance, directement |
| `heatmap.json` | **15 minutes** (publication) | `heatmap.py` (état accumulé toutes les minutes, publié au plus toutes les 15 min) |
| Branche `direct` : `heatmap.json` et `executions.json` des 30 dernières minutes | **1 minute** (un seul commit sans parent, remplacé) ; la page le relit chaque minute, raw.githubusercontent le garde jusqu'à 5 min | `heatmap.py`, à chaque tour |
| `profondeur.json` (carnet complet Coinbase BTC-USD, ±10 %, 5 min × 100 $, échelle propre) | **15 minutes** (publié dans le commit de `heatmap.json`) | `profondeur.py`, appelé par `heatmap.py` à chaque tour, une lecture toutes les 5 min |
| `executions.json` | **15 minutes** (écrit dans le dossier d'état, recopié et publié dans le commit de `heatmap.json` : l'arbre de travail reste propre) | `executions.py`, service permanent : aggTrades lus par identifiant, seaux 10 s × 10 $, 24 h |
| `market-data.json` | **15 minutes** | `publish.py` |
| Séries de la branche `historique` | **15 minutes**, juste après `publish.py` | `historique.py` |

**C'est la source de confusion numéro un du projet.** Deux chiffres affichés côte à côte
peuvent décrire deux instants différents. La règle qui en découle :

> **On ne soustrait jamais deux quantités de cadences différentes.**

Cas mesuré : un « basis » calculé entre le perp de `market-data.json` (daté) et le spot
live affichait **−207 pts** quand la valeur réelle était **−45 pts**. Le basis se calcule
donc entre le perp **et** le spot du **même instant du fichier** ; la dérive du spot est
publiée **séparément**. `tests/test_live.js` échoue si le mélange revient.

Chaque donnée datée affiche son âge. Depuis le 04/10/2026, aucun bloc ne lit plus une
source intermédiaire qui pourrait être figée : `cvd` et `liquidity` interrogent Binance au
moment de la publication (ils lisaient auparavant une base locale et `heatmap.json`, avec
des seuils de refus à 30 et 10 min).

---

## Les 8 blocs de `market-data.json`

| Bloc | Source | Calcul |
|---|---|---|
| `btc_spot` | Binance `api` | — |
| `indicators` | Binance klines 4h/1h/1d | `indicateurs.py` |
| `macro` | DXY, VIX (Yahoo) | `publish.py` |
| `micro_futures` | Binance `fapi` | — |
| `cvd` | Binance klines 5 min (achats taker vs total) | — |
| `gex` | Deribit, calcul dans `options_gex.py` | — |
| `premium` | Coinbase vs Binance (+ USDT-USD) | `publish.py` |
| `liquidity` | Binance carnet (5 000 niveaux), en BTC | — |

Les huit blocs tournent dans un clone nu, sans configuration (depuis le 06/10/2026).
Chaque champ est décrit dans `meta.champs`, construit avec les constantes du calcul et
vérifié par `tests/test_meta.py` : une légende ne se rédige plus à côté du code.

### Unités et fenêtres — à lire avant de comparer deux chiffres

| Chiffre | Unité | Fenêtre |
|---|---|---|
| CVD | USD | 1 h / 4 h / 24 h glissantes, spot BTCUSDT |
| Δ OI | % | 24 h glissantes / 5 j (historique horaire) |
| GEX | USD de delta par 1 % de mouvement | instantané ; **convention** calls + / puts − (le positionnement réel des dealers n'est pas observable) |
| murs de liquidité | BTC posés par tranche de 20 $ | instantané du carnet |
| ratio bid/ask | BTC / BTC | bande ±0,5 % (ou la plus large couverte) |
| S / R / amplitude | prix | 30 dernières bougies du TF : 5 j (4h), 30 h (1h), 30 j (1j) |

## Les trois écrivains, un seul dépôt

`publish.py`, `heatmap.py` et `historique.py` écrivent dans le même dépôt git, à des
cadences différentes. Sans précaution, l'un committe le fichier que l'autre vient de
préparer, ou tombe sur un `index.lock`.

```
verrou partagé (fcntl.flock sur git_lock)
  ├─ GIT_INDEX_FILE=<state_dir>/index-<écrivain>   ← index DÉDIÉ, jamais l'index partagé
  ├─ git read-tree HEAD                ← base = HEAD
  ├─ git add   -- <mes chemins>        ← pathspec
  ├─ git diff --cached --quiet         ← rien à publier ? on sort en silence
  ├─ git commit -m …                   ← ne peut contenir QUE mes chemins
  ├─ git reset -q HEAD -- <mes chemins>   (index partagé remis à niveau)
  └─ git push  ×3 essais, avec `pull --rebase` entre chaque
```

Le pathspec seul ne suffit pas : `git commit -- <chemin>` committe aussi **tout ce qui est
déjà indexé** dans l'index partagé. Un autre processus qui a laissé des fichiers indexés les
fait partir sous le message de l'écrivain — l'historique ment. D'où l'index dédié.

**`historique.py` prend le même verrou, mais travaille ailleurs.** Il publie une branche
*différente* : il lui faut donc un arbre et un index différents — un `git worktree` sur la
branche `historique`, dans `hist_dir`. L'objet-store est partagé (rien à cloner) et le
worktree a son propre index : l'index et l'arbre de `master` ne sont jamais touchés. C'est
la contrainte « ne jamais toucher l'index ni l'arbre de master » rendue structurelle plutôt
que promise.

```
worktree (branche `historique`, hist_dir)
  ├─ .git  → fichier de renvoi vers <repo>/.git/worktrees/historique
  ├─ index.json
  └─ series/*.csv
```

---

## La branche `historique`

Pourquoi une branche à part : `market-data.json` est un **instantané**. L'historique de ses
chiffres ne vivait que dans les commits de `master` — une session devait en relire une
centaine pour voir une tendance sur 24 h, et cet historique disparaissait si le dépôt était
recréé. Il ne pouvait pas aller dans `master` non plus : **GitHub Pages republie `master` à
chaque push**.

| Fichier | Contenu |
|---|---|
| `index.json` | `updated`, `status`, `errors` (mêmes conventions que `market-data.json`) ; par série : fichiers ordonnés, colonnes, période, lignes, trous détectés ; `meta` décrivant chaque colonne |
| `series/positionnement/<année-mois>.csv` | une ligne par publication de `market-data.json`, amorcée depuis l'historique des commits |
| `series/funding.csv` · `series/open-interest-1h.csv` · `series/long-short-1h.csv` | ce que Binance futures conserve encore, rapatrié une fois puis prolongé |

Une session la lit sans rapatrier le dépôt :

```bash
git fetch --depth 1 --filter=blob:none origin historique
git show FETCH_HEAD:index.json          # puis seulement les fichiers utiles
```

D'où deux contraintes de forme, tenues par le script et par `tests/test_historique.py` :
**l'index doit tout décrire** (une session ne voit que ce qu'il annonce), et **chaque fichier
reste sous 1 Mo** (un blob se rapatrie à l'unité dans un clone partiel).

Quatre règles, chacune née d'un défaut qu'on ne veut pas reproduire :

**Un mois clos ne se réécrit pas.** La clé d'une ligne est son horodatage : relancer
n'ajoute rien, et un fichier dont le contenu ne change pas n'est pas réécrit sur le disque —
donc git ne voit aucun delta et ne committe rien. Une publication apportée pour un mois
antérieur est **refusée et signalée**.

**Un trou se signale, il ne se comble pas.** L'index calcule, sur le pas nominal du
producteur (900 s pour le positionnement, 8 h pour le funding, 1 h pour les autres), les
créneaux manquants entre la première et la dernière date. On ne connaît pas la valeur
qu'aurait portée la ligne absente : l'inventer serait fabriquer une donnée.

**Une case vide n'est pas un zéro.** Les champs qui n'existaient pas dans les anciens
formats restent vides — le CVD n'est publié que depuis le 04/10/2026, la prime hors USDT
depuis le 06/10 — et `meta` porte, colonne par colonne, ce qu'une absence veut dire.

**Une unité publiée se contrôle.** `longAccount` n'est pas une mesure indépendante du ratio :
c'est la même donnée écrite autrement, `ratio / (1 + ratio)`. Les deux colonnes de part de
`series/long-short-1h.csv` sont donc **déductibles** du ratio de la même ligne, et l'index
porte le contrôle `100 × ratio / (1 + ratio)` — un désaccord sort en code 1 et s'écrit dans
`series.long_short_1h.controle`. Ce contrôle vient d'un défaut réel : la série a publié des
**fractions** (0,6328) sous une unité annoncée « % » jusqu'au 08/10/2026, et un fichier de
données seules, lu à distance, ne le montrait pas. La migration `--migrer-part-longue`
remet l'historique déjà écrit dans la bonne unité en **recalculant** la part depuis le ratio
de chaque ligne — idempotente par construction, là où un × 100 doublerait la valeur au
deuxième passage.

`index.json` est **redaté à chaque passage** : c'est ce qui rend son âge lisible par une
session distante (un index « ok » de moins de 20 minutes). Les séries, elles, ne bougent que
quand une ligne apparaît.

---

## Invariants

**Écritures atomiques.** `tmp` → `fsync` → `os.replace`. Un disque plein ou une mort du
processus pendant l'écriture ne doit pas laisser un JSON tronqué derrière lui. Vécu.

**Pas d'erreur silencieuse.** Chaque collecteur est isolé par un décorateur qui publie son
état dans `status`. Les états sont distingués :

| État | Sens | Code de sortie |
|---|---|---|
| `ok` | le bloc a produit ses champs | 0 |
| `incomplet:<champs>` | le bloc a répondu mais avec des `None` | **1** |
| `error: …` | panne réelle | **1** |
| `non configuré : …` | **dépendance absente de cet environnement** | 0 |

La distinction `error` / `non configuré` est le point : sans elle, un dépôt cloné
sortirait en erreur en permanence, et l'utilisateur apprendrait à ignorer le code de
sortie — c'est-à-dire à ne plus voir les vraies pannes.

Corollaire : un collecteur qui renvoie un dict plein de `None` **n'est pas** « ok ».
Sans le contrôle `required`, une source morte s'affiche comme vivante.

**État corrompu = arrêt bruyant.** `except: state = {}` perdait 24 h de carnet sans rien
dire. On renomme, on logge, on sort en erreur.

**Rien de personnel dans un fichier publié.** `tests/scan-public.py` scanne **tous les
fichiers suivis par git** contre une liste de motifs locaux. Il existe parce que le
`.gitignore` lui-même décrivait, en commentaire, le contexte qu'il était censé empêcher
de publier : un contrôle qui ne regarde qu'un fichier ne voit pas ce genre de chose.

---

## Le contrôle d'absence

```
tests/forbidden.local.json  (gitignoré)  →  les MOTS
tests/forbidden.js          (publié)     →  la MÉCANIQUE
tests/scan-public.py        (publié)     →  l'applique à tout ce que git suit
```

Les motifs sont des expressions régulières, **ancrées** : un motif court sans borne matche
tout mot qui le contient — 24 faux positifs mesurés au premier essai sur un motif de
trois lettres. C'est le mode d'échec le plus fréquent de ce genre de contrôle.

Le fichier local absent, le contrôle tourne sur l'exemple et **le dit à l'écran**. Un
« ✅ » sans motifs réels n'est pas une garantie, et ne doit pas ressembler à une.

---

## Le harnais de test

Le JavaScript de la page vit dans `js/` (chargé par les `<script src>` d'`index.html`).
Les tests l'assemblent dans le même ordre pour l'exécuter dans node avec un DOM stubbé —
il n'y a rien à compiler, rien à instrumenter.

Deux harnais, deux régimes :

- `test_render.js` — le `fetch` du bac à sable renvoie le `market-data.json` du dépôt.
  Déterministe, hors réseau. Vérifie que chaque valeur publiée **atteint réellement le
  rendu** (une carte vide passerait un test qui ne lit que le JSON).
- `test_live.js` — le `fetch` du bac à sable est **le fetch réseau réel de node**. Le test
  tape vraiment Binance et vérifie la chaîne complète. Non déterministe par nature : il
  vérifie des propriétés (formes, cohérence, absence de `NaN`), pas des valeurs figées.

`refresh_harness.py` régénère le JavaScript assemblé. Sans lui, les harnais testent une
version périmée et échouent sur des contrôles déjà corrigés — faux échec vécu.

Deux harnais hors ligne gardent l'apparence et la vitesse : `test_palette.py` mesure chaque
thème déclaré (dont le texte posé sur un dégradé, à chaque borne), `test_contrat.py` fait
tenir les règles de la page (thèmes, verre, réseau, et le budget d'image — voir plus bas).

---

## Les pages et leurs fichiers (06/10/2026)

```
index.html (terminal)                      bookmap.html (carte, page à côté)
  js/structures.js  structure du thème        js/bookmap-calc.js  calculs purs
  js/fiches.js      légendes, mode            js/bookmap.js       interface
  js/reglages.js    réglages d'affichage      css/bookmap.css
  js/app.js         le terminal
  css/app.css + themes/*.css (+ fonts/)
```

La carte ne charge rien du terminal ; le terminal n'y fait qu'un lien. Les deux lisent les
mêmes fichiers publiés et n'appellent que Binance et GitHub Raw (`test_contrat.py`, toutes
pages).

**Trois règles transverses, chacune tenue par un harnais :**

| Règle | Où | Harnais |
|---|---|---|
| Une légende se DÉRIVE du code qui calcule | `meta.champs` (serveur), `PARAM` (page) | `test_meta.py`, `test_fiches.js` |
| Un réglage change le détail, jamais la valeur ; les constantes du fichier sont lues | `js/reglages.js` | `test_reglages.js` |
| Fusionner, jamais affiner : une intensité de heatmap se fusionne par MAX | carte, graphique | `test_bookmap.js`, `test_reglages.js` |
| Un thème peut changer la structure, pas faire disparaître une valeur ou son âge | `js/structures.js` | `test_structures.js` |
| Un effet visuel coûteux se paie dans un budget MESURÉ | feuilles de thème | `test_budget.js`, `test_contrat.py` |

**Le budget d'image.** `test_budget.js` mesure, dans Chromium, le temps du thread principal au
repos (ms par seconde) et par image pendant un glissement du graphique, pour chaque thème,
contre le thème de référence, sur la même machine. Seuls les rapports voyagent d'une machine
à l'autre. Deux contre-épreuves (une animation qui repeint, un flou sur le graphique) doivent
sortir du budget : c'est la preuve que la mesure voit ce que l'ancienne règle interdisait.

---

## Ce qui n'est pas traité

- **Aucun build, aucune dépendance** : des fichiers statiques, un `git clone` et ça tourne.
  `js/app.js` reste un seul gros script (pas de modules) : c'est ce qui permet aux
  harnais de l'exécuter tel quel dans node.
- **La heatmap ne se recalcule pas.** Elle s'accumule. Redémarrer l'accumulateur repart
  d'une fenêtre vide qu'il faut 24 h à remplir.
- **Plus aucun calcul hors dépôt** (06/10/2026) : indicateurs, DXY / VIX et prime sont
  calculés ici. `publish.py --comparer` vérifie la parité avec les anciens modules sur la
  machine qui les a encore.

---

## Livraison du 07/10/2026

Le détail de chaque chantier (ce qui a changé, pourquoi, les mesures avant/après, ce qui n'a pas
été fait et pourquoi) est dans `docs/livraison-2026-10-07.md`. Points d'architecture à retenir :

- **heatmap.json « colonnes-1 »** : minute ABSOLUE par colonne (les deltas git fonctionnent), les
  deux pages lisent les deux formats ; retour arrière en une ligne dans `heatmap.py` (`FORMAT = ANCIEN`).
- **Carte** : `BM.Horloge` (écart à l'horloge Binance ± incertitude), boucle à pas fixe avec recul
  sur 429/418, rendu par calques gardés (la chaleur publiée n'est repeinte que si elle change).
- **Terminal** : `js/cadences.js` (CADENCES, chargé avant les structures), calque `chartCalque` pour
  le réticule et l'étiquette du prix, `js/horloges.js`, `js/contre-expertise.js`, `js/chronique.js`.
- **Thèmes** : crochets du graphique (`--bougie-forme`, `--grille-tirets`, `--police-graphique`,
  `--chaleur-*`, `--up-sur`) ; tout décor porte `data-decor` ; le banc de budget fait bouger le prix.
