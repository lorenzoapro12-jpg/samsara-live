# Architecture

## Le pipeline

```
                       api.binance.com ──────────────┐
                       fapi.binance.com ─────────────┤
                       Deribit · Coinbase · Yahoo ───┤   (via modules hors dépôt)
                       SQLite (collecteur CVD) ──────┤
                       heatmap.json ─────────────────┤
                                                      ▼
                                              publish.py  ──▶ market-data.json ──┐
                                                                                │
   api.binance.com (depth) ──▶ heatmap.py ──▶ heatmap.json ─────────────────────┤
                                                                                ▼
                                                                    raw.githubusercontent
                                                                                │
   api.binance.com (ticker, klines, trades) ────────────────────────────────────┤
                                                                                ▼
                                                                          index.html
                                                                    (le dashboard, autonome)
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
| `heatmap.json` | **~3 minutes** | `heatmap.py` (état accumulé toutes les minutes) |
| `market-data.json` | **15 minutes** | `publish.py` |

**C'est la source de confusion numéro un du projet.** Deux chiffres affichés côte à côte
peuvent décrire deux instants différents. La règle qui en découle :

> **On ne soustrait jamais deux quantités de cadences différentes.**

Cas mesuré : un « basis » calculé entre le perp de `market-data.json` (daté) et le spot
live affichait **−207 pts** quand la valeur réelle était **−45 pts**. Le basis se calcule
donc entre le perp **et** le spot du **même instant du fichier** ; la dérive du spot est
publiée **séparément**. `tests/test_live.js` échoue si le mélange revient.

Chaque donnée datée affiche son âge. Une donnée périmée au-delà de son seuil **n'est pas
publiée du tout** plutôt que publiée comme si elle était fraîche :
heatmap > 10 min → le bloc `liquidity` refuse ; CVD > 30 min → le bloc `cvd` refuse.

---

## Les 8 blocs de `market-data.json`

| Bloc | Source | Dépendance hors dépôt |
|---|---|---|
| `btc_spot` | Binance `api` | — |
| `indicators` | Binance klines 4h/1h/1d | `fetch_macro` |
| `macro` | DXY, VIX | `fetch_macro` |
| `micro_futures` | Binance `fapi` | — |
| `cvd` | SQLite, lecture seule | une base vivante |
| `gex` | Deribit | `scenario_engine` |
| `premium` | Coinbase vs Binance | `scenario_engine` |
| `liquidity` | `heatmap.json` | — |

Trois blocs sur huit tournent partout sans configuration. Les cinq autres se branchent
par `extra_module_paths` et `cvd_database` dans `config.local.json`.

## Les deux écrivains, un seul dépôt

`publish.py` et `heatmap.py` écrivent dans le même dépôt git, à des cadences différentes.
Sans précaution, l'un committe le fichier que l'autre vient de préparer, ou tombe sur un
`index.lock`.

```
verrou partagé (fcntl.flock sur git_lock)
  ├─ git add   -- <mes chemins>       ← pathspec OBLIGATOIRE : un `git add -A`
  ├─ git diff --cached --quiet        ← rien à publier ? on sort en silence
  ├─ git commit -m … -- <mes chemins>
  └─ git push  ×3 essais, avec `pull --rebase` entre chaque
```

Le **pathspec** n'est pas une optimisation : sans lui, un écrivain embarque le travail de
l'autre dans son commit et le message devient faux.

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

`index.html` porte son JavaScript **inline**. Les tests l'extraient pour l'exécuter dans
node avec un DOM stubbé — il n'y a rien à compiler, rien à instrumenter.

Deux harnais, deux régimes :

- `test_render.js` — le `fetch` du bac à sable renvoie le `market-data.json` du dépôt.
  Déterministe, hors réseau. Vérifie que chaque valeur publiée **atteint réellement le
  rendu** (une carte vide passerait un test qui ne lit que le JSON).
- `test_live.js` — le `fetch` du bac à sable est **le fetch réseau réel de node**. Le test
  tape vraiment Binance et vérifie la chaîne complète. Non déterministe par nature : il
  vérifie des propriétés (formes, cohérence, absence de `NaN`), pas des valeurs figées.

`refresh_harness.py` régénère le JavaScript extrait. Sans lui, les harnais testent une
version périmée et échouent sur des contrôles déjà corrigés — faux échec vécu.

---

## Ce qui n'est pas traité

- **`index.html` fait 280 Ko dans un seul fichier.** C'est un choix assumé : aucun build,
  aucune dépendance, un `git clone` et ça tourne. Le coût est la lisibilité.
- **La heatmap ne se recalcule pas.** Elle s'accumule. Redémarrer l'accumulateur repart
  d'une fenêtre vide qu'il faut 24 h à remplir.
- **Deux secrets de conception restent hors dépôt** : la base CVD et les modules d'accès
  aux sources non-Binance. Le dépôt le dit à l'exécution plutôt que d'échouer en silence.
