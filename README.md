# Saṃsāra — dashboard marché live

Dashboard BTC en un seul fichier HTML, autonome, sans build ni dépendance : il s'ouvre
dans un navigateur et se rafraîchit tout seul depuis des sources publiques.

**Ce dépôt est complet pour lire, modifier et tester le dashboard.** Deux blocs de
données dépendent de collecteurs qui n'y sont pas — c'est documenté et le script le dit
lui-même à l'exécution (voir « Ce qui n'est pas ici »).

---

## Démarrer en 10 secondes

```bash
git clone <ce dépôt> && cd samsara-live
python3 -m http.server 8000       # ou n'importe quel serveur statique
# puis ouvrir http://localhost:8000
```

Ouvrir `index.html` en `file://` fonctionne aussi (le JavaScript est entièrement inline,
aucun asset externe). Un serveur local est préférable : certains navigateurs restreignent
les appels réseau depuis `file://`.

---

## Les fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | **Le dashboard.** HTML + CSS + JS inline. C'est 95 % du projet. |
| `market-data.json` | Les données des cartes « Marché live ». Réécrit par `publish.py`. |
| `heatmap.json` | La heatmap de liquidité sur 24 h. Réécrite par `heatmap.py`. |
| `publish.py` | Agrège 8 sources → `market-data.json`. |
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
| `extra_module_paths` | `[]` | modules hors dépôt (voir plus bas) |
| `cvd_database` | `null` | SQLite d'un collecteur CVD, lu en **lecture seule** |

⚠️ **`state_dir` doit rester stable.** Le changer repart d'un état vide : les 24 h de
carnet accumulées sont perdues, et la heatmap affichée devient un rectangle vide.

---

## Régénérer les données

```bash
python3 heatmap.py     # à lancer toutes les minutes : il accumule, il ne recalcule pas
python3 publish.py     # à lancer après heatmap.py : il lit 8 sources
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

## Les tests

```bash
bash tests/run-all.sh
```

Quatre étapes : compilation, extraction du JavaScript inline, non-régression du rendu
(DOM stubbé dans node), panneau ⚡ (**appels réseau réels** vers Binance), puis un scan de
**tous les fichiers suivis par git**.

Les harnais de rendu consomment un fichier JavaScript extrait de `index.html` — il faut
le régénérer après chaque modification du dashboard :

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

Trois blocs de `market-data.json` dépendent de collecteurs hors dépôt. Sans eux, le
script tourne, publie le reste, et l'indique dans `status` :

| Bloc | Dépendance | Source |
|---|---|---|
| `indicators`, `macro` | module `fetch_macro` | DXY, VIX, indicateurs multi-échelle |
| `gex`, `premium` | module `scenario_engine` | Deribit (GEX), prime Coinbase |
| `cvd` | une base SQLite | flux agressif accumulé par un collecteur |

Ces modules se branchent via `extra_module_paths` et `cvd_database` dans
`config.local.json`. **Ils ne sont pas publics** : `cvd` lit une base vivante, et
Deribit, Coinbase et Yahoo ne sont pas joignables depuis n'importe quel poste — leur
agrégation doit rester côté serveur.

Les blocs qui ne dépendent que de **Binance** (`btc_spot`, `micro_futures`) et de la
**heatmap locale** (`liquidity`) fonctionnent partout, sans configuration.

---

## Panneau ⚡ (lecture live)

Le bouton **⚡** ouvre une lecture directe, rafraîchie toutes les 5 secondes : prix,
bid/ask et spread, position dans le range 24 h, carnet ±1 %, tape des 500 derniers
trades, et l'âge de tout ce qui n'est pas live.

Il n'interroge que **Binance**. Les autres sources sont agrégées côté serveur dans
`market-data.json` et arrivent avec leur retard — le panneau l'affiche explicitement.

**⚠️ Deux cadences ne se soustraient jamais.** Une première version calculait un « basis »
en retranchant le perp du fichier (daté) au spot live : elle affichait **−207 pts** quand
le vrai basis valait **−45 pts**. Le basis se calcule désormais entre le perp **et** le
spot du **même instant du fichier** ; la dérive du spot est affichée séparément. Le cas
est documenté dans la page, et `tests/test_live.js` échoue si le mélange revient.

---

## Dépendances

- **Python 3.8+** — `urllib`, `sqlite3`, `fcntl` : bibliothèque standard uniquement.
- **Node** — uniquement pour les tests.
- Aucun `pip install`, aucun build, aucune étape de compilation.

Le cours de la page est en français ; les commentaires aussi, délibérément : ils portent
les cas mesurés qui justifient chaque garde-fou. `ARCHITECTURE.md` décrit le pipeline.
