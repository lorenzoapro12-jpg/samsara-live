# Saṃsāra Live Dashboard

> Dashboard HTML autonome : **marché live** (BTC, macro, microstructure, liquidité).
> Ouvert sur le poste RIE de Lorenzo (Ministère de l'Intérieur).
>
> ⚠️ **Refonte du 10/09/2026 — rupture avec la chaîne Renaissance/Sœurs.**
> Le dashboard n'affiche plus les renaissances ni le Démon. Voir « Historique » plus bas.

## Architecture (depuis le 10/09/2026)

```
┌──────────────────────────────────────────────────────────┐
│ Cron coder:cc1868dc7161 (3,18,33,48 * * * *)  no_agent   │
│ → /root/.hermes/scripts/samsara-publish.sh               │
│   → /root/samsara-live/publish.py  (v3.0 — live-only)    │
└────────────────────┬─────────────────────────────────────┘
                     │  agrège 9 sources live
                     ▼
    Binance spot/fapi · Deribit · Coinbase · Yahoo · daemon
                     │
                     ▼
┌──────────────────────────────────────────────────────────┐
│ GitHub public: lorenzoapro12-jpg/samsara-live             │
│   market-data.json   ← LIVE (nouveau, toutes les 15 min)  │
│   heatmap.json       ← LIVE (cron coder:ed574bed177e,3min)│
│   index.html         ← le dashboard (GitHub Pages)        │
│   samsara-data.json  ← ARCHIVE GELÉE, plus jamais écrite  │
└────────────────────┬─────────────────────────────────────┘
                     │
                     ▼
┌──────────────────────────────────────────────────────────┐
│ Dashboard — https://lorenzoapro12-jpg.github.io/samsara-live/ │
│ (et copie locale /root/samsara-dashboard.html)            │
│                                                           │
│ • Fetch market-data.json (GitHub Raw) — 60 s              │
│ • Fetch heatmap.json (GitHub Raw) — 5 s (overlay liq.)    │
│ • Fetch BTC klines/ticker (Binance API) — 1 s / 5 s       │
│ • Rendu canvas (bougies, EMA, volume, depth)              │
│ • Panneau « Marché live » : 6 cartes                      │
└──────────────────────────────────────────────────────────┘
```

## Le panneau « Marché live »

Six cartes, entièrement dérivées de `market-data.json` :

| Carte | Contenu |
|---|---|
| 📊 Marché live | Prix, variation 24h, haut/bas, volume |
| 🌍 Macro | DXY, VIX, score Iran + catégorie + momentum |
| 📈 Indicateurs | RSI + croisement EMA + S/R + range, en 4h / 1h / 1j |
| 📡 Microstructure | Funding (+annualisé), OI + Δ1j/Δ5j, L/S, top traders, taker, CVD, GEX + walls, premium Coinbase |
| 💧 Liquidité | Ratio bid/ask 15 min, murs bids/asks (heatmap) |
| 🔌 Flux | n/9 blocs OK + erreurs explicites (pas d'erreur silencieuse) |

## Contraintes RIE

- **Domaines autorisés** : github.com, raw.githubusercontent.com, api.github.com, binance.com, cloudflare.com
- **Bloqués** : IP directes, WebSocket, api.telegram.org, gitlab.com, pastebin
- **Pas de serveur accessible** → les données passent par GitHub Raw (repo public)
- **Pas d'installation** → 1 fichier HTML autonome
- ⚠️ Le dashboard ne doit fetcher **que** github/raw + Binance. Toute nouvelle
  source doit être agrégée côté serveur dans `market-data.json`, jamais appelée
  depuis le navigateur RIE.

## Fichiers

| Fichier | Rôle |
|---|---|
| `/root/samsara-live/publish.py` | Agrégateur live → `market-data.json` (v3.0) |
| `/root/.hermes/scripts/samsara-publish.sh` | Wrapper cron (`cd` + `python3 publish.py`) |
| `/root/samsara-live/market-data.json` | **Source de vérité live** du dashboard |
| `/root/samsara-live/index.html` | Dashboard servi par GitHub Pages |
| `/root/samsara-dashboard.html` | Copie de travail locale du dashboard |
| `/root/samsara-live/heatmap.json` | Heatmap de liquidité (cron 3 min) |
| `/root/samsara-live/samsara-data.json` | **Archive gelée** — cycles 207→228, ne plus lire |
| `/root/audit-fossile-20260910/` | Audit + sauvegarde pré-refonte + test de rendu |

## Sources live de `publish.py`

| Bloc | Source | Note |
|---|---|---|
| `btc_spot` | `api.binance.com/api/v3/ticker/24hr` | |
| `indicators` | `fetch_macro.py` (4h/1h/1d) | module réutilisé, testé |
| `macro` | Yahoo (DXY spot), ^VIX | |
| `micro_futures` | `fapi.binance.com` (funding, OI, L/S, taker) | **remplace la table SQLite morte** |
| `cvd` | `base_history.db` → `cvd_checkpoint` | écrit par `sol-radar-daemon` (vivant) |
| `gex` | Deribit via `scenario_engine/gex.py` | |
| `premium` | Coinbase via `scenario_engine/coinbase_premium.py` | |
| `liquidity` | `heatmap.json` local (fenêtre 15 min) | |

> **Le bloc `iran` a été SUPPRIMÉ le 10/09/2026.** Le scorer géopolitique
> mesurait des titres de presse, pas une tension (canal macro lu dans une DB
> gelée au 16/08, aucune déduplication, flux tronqué à 13-19 items sur ~300,
> modèle de cycle invalidé). Preuve : le saut 52,0 → 65,7 était composé à
> 95 % de la simple expiration de trois titres d'apaisement du 16/08.
> Ne pas le réintroduire sans reconstruire la chaîne de sources.
> Archive : `/root/audit-fossile-20260910/iran_monitor-FINAL-20260910.tar.gz`.

## Test de rendu sans navigateur

Chrome est cassé dans le conteneur (`cannot read kernel generated uuid`).
Le rendu se teste dans node avec un DOM stubbé :

```bash
# TOUJOURS les deux commandes, dans cet ordre :
python3 /root/audit-fossile-20260910/refresh_harness.py \
  && node /root/audit-fossile-20260910/test_render.js
```

⚠️ **Piège vécu le 10/09/2026.** `test_render.js` n'extrait pas le HTML
lui-même : il lit `/tmp/js_0.js`, un fichier temporaire persisté entre les
runs. Sans `refresh_harness.py`, le harnais teste une version **périmée** et
échoue sur ce qui a déjà été corrigé (cas réel : « Iran retiré » ✗ alors que
`index.html` n'avait plus une occurrence — le harnais lisait encore la copie
de travail, en retard de 4). `refresh_harness.py` synchronise
`/root/samsara-live/index.html` → `/root/samsara-dashboard.html` puis
régénère `/tmp/js_0.js`.

Le harnais exécute le `<script>` inline, appelle `fetchMarket()` puis
`renderFeedTo()`, et vérifie **16 contrôles** de non-régression : valeurs
réelles présentes, **absence du scorer Iran** (rendu *et* JSON — contrôle
négatif), zéro trace Renaissance, 6 cartes rendues.

## Historique

- **10/09/2026 — refonte live-only.** Constat d'audit : le dashboard affichait des
  données gelées (cycle 228 réémis à l'identique ~450 fois, RSI 4h 62.1 au lieu de
  40.1, L/S 2.27 datant du 16/08 au lieu de 1.50). La collecte était saine mais
  orpheline (crons coupés le 01/09). Décision de Lorenzo : réparer tout, retirer
  l'affichage des renaissances, couper le lien, garder le dashboard.
  → `publish.py` réécrit (ne lit plus `state.json`, `predictions.jsonl`,
  `demon-summary.txt`, `transcript/*.md`), `market-data.json` remplace
  `samsara-data.json`, panneaux Sœurs/Démon remplacés par des panneaux marché.
- Avant : dashboard Renaissance — feed des 10 Sœurs + Démon, badges de cibles par
  horizon, parseur de cibles cassé (`targets = 0`).
