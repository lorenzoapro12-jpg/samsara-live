#!/usr/bin/env python3
"""historique.py — troisième écrivain : l'HISTORIQUE des chiffres publiés.

Pourquoi il existe
------------------
`publish.py` publie `market-data.json` toutes les 15 minutes, et l'historique de ces
chiffres n'existait que dans les commits de `master`. Une session distante devait donc
relire une centaine de commits pour voir une tendance sur 24 h — et cet historique
disparaissait si le dépôt était recréé.

Ce script publie ces séries dans une branche **orpheline** `historique`, faite de
**données seules**. Pas dans `master` : GitHub Pages republie `master` à chaque push.

Comment une session la lit — sans rapatrier le dépôt :

    git fetch --depth 1 --filter=blob:none origin historique
    git show FETCH_HEAD:index.json          # ce que contient la branche
    git show FETCH_HEAD:series/positionnement/2026-10.csv

D'où deux contraintes de forme : **l'index doit tout décrire** (fichiers, colonnes,
période, lignes, trous), et **chaque fichier reste sous 1 Mo** — un blob se rapatrie à
l'unité dans un clone partiel, pas une arborescence entière.

Contenu de la branche
---------------------
    index.json                              updated, status, errors, series, meta
    series/positionnement/<année-mois>.csv   1 ligne par publication de market-data.json
    series/funding.csv                       ce que Binance futures conserve encore
    series/open-interest-1h.csv              idem
    series/long-short-1h.csv                 idem

Trois invariants repris d'ARCHITECTURE.md
-----------------------------------------
  · ÉCRITURES ATOMIQUES — `tmp` → `fsync` → `os.replace`.
  · AUCUNE ERREUR SILENCIEUSE — chaque étape publie son état dans `status`, et un échec
    sort en code 1. Un trou se SIGNALE dans l'index : il ne se comble pas par invention.
  · AUCUN CHEMIN DE MACHINE, RIEN DE PERSONNEL — les fichiers publiés décrivent les
    fichiers, pas l'installation. `nettoie()` retire les chemins connus de tout message
    qui part dans l'index : une trace d'exception git en contient toujours un.

Unité de la part longue — et le contrôle qui la tient
-----------------------------------------------------
`longAccount` n'est pas une mesure indépendante : c'est `ratio / (1 + ratio)`. Les deux
colonnes de part (`comptes_longs_pct`, `gros_longs_pct`) sont donc DÉDUCTIBLES du ratio de
la même ligne, et l'index porte le contrôle `100 × ratio / (1 + ratio)` — un désaccord sort
en code 1. Ce contrôle existe parce que la série a publié des FRACTIONS (0,6328) alors que
`meta` annonçait « % » : un fichier de données seules, lu à distance, ne le montrait pas.
La migration `--migrer-part-longue` remet l'historique déjà écrit dans la bonne unité en
RECALCULANT la part depuis le ratio (idempotent — relancer ne double rien).

Répertoire de travail
---------------------
Un **worktree** à part (branche `historique`), pour ne jamais toucher l'index ni l'arbre
de master. `git worktree` partage l'objet-store : rien à cloner, rien à resynchroniser.

Relancer le script ne duplique aucune ligne (clé = `updated`) et ne réécrit pas le fichier
d'un mois clos — un fichier qui n'a pas changé n'est même pas réécrit sur disque, donc git
ne voit aucun delta.
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import fcntl
import glob
import io
import json
import os
import shutil
import subprocess
import sys
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import samsara_config as SC  # noqa: E402

CFG = SC.load()

BRANCHE = CFG["hist_branche"]
HIST = CFG["hist_dir"]

# Un blob se rapatrie à l'unité dans un clone partiel : au-delà, la lecture coûte plus cher
# que ce qu'elle apporte. Le garde-fou est BRUYANT — il refuse d'écrire, il ne tronque pas.
MAX_OCTETS = 1_000_000

# Cadences nominales, pour la détection de trous. Elles décrivent ce que le PRODUCTEUR
# publie ; un écart ne dit pas « panne » tout seul, il dit « rien publié ».
CADENCE_POSITIONNEMENT_S = 900
CADENCE_FUNDING_S = 8 * 3600
CADENCE_HORAIRE_S = 3600

# ─── SOURCE UNIQUE DES COLONNES ──────────────────────────────────────────────
# L'en-tête CSV, l'extraction ET le bloc `meta` de l'index sont bâtis sur cette même
# liste. C'est la règle de la maison (« une légende se DÉRIVE du code qui calcule ») :
# une colonne ne peut pas être décrite autrement qu'elle n'est écrite, et une colonne
# renommée ici se renomme partout. Aucun alias : chaque nom dit ce qu'il porte.
#
#   chemin  : où la valeur se lit dans market-data.json (None = colonne calculée)
#   dec     : décimales écrites (fixe la largeur et rend les lignes comparables)
#   vide    : ce qu'un lecteur doit comprendre d'une cellule vide
_VIDE_ABSENT = ("absent de la publication de l'époque : le champ n'existait pas encore "
                "dans market-data.json (voir `meta`), ce n'est pas un zéro")

COLS_POSITIONNEMENT = [
    {"nom": "updated", "libelle": "Horodatage de la publication", "chemin": "updated",
     "unite": "date ISO 8601 (UTC)", "dec": None, "nature": "horodatage",
     "formule": "champ `updated` de market-data.json, recopié tel quel",
     "fenetre": "instantané", "source": "publish.py"},
    {"nom": "prix_usdt", "libelle": "Prix", "chemin": "btc.price", "unite": "USDT",
     "dec": 2, "nature": "mesure", "source": "Binance spot BTCUSDT",
     "formule": "dernier prix échangé (ticker 24 h)", "fenetre": "instantané"},
    {"nom": "funding_pct", "libelle": "Funding", "chemin": "micro.funding_rate_pct",
     "unite": "% par échéance", "dec": 6, "nature": "mesure",
     "source": "Binance futures USDⓈ-M BTCUSDT",
     "formule": "lastFundingRate de premiumIndex : taux appliqué à la prochaine échéance",
     "fenetre": "instantané"},
    {"nom": "oi_btc", "libelle": "Open interest", "chemin": "micro.oi_btc", "unite": "BTC",
     "dec": 3, "nature": "mesure", "source": "Binance futures USDⓈ-M BTCUSDT",
     "formule": "contrats ouverts", "fenetre": "instantané"},
    {"nom": "ls_comptes", "libelle": "Ratio L/S (comptes)", "chemin": "micro.ls_ratio",
     "unite": "ratio", "dec": 4, "nature": "mesure", "source": "Binance futures USDⓈ-M BTCUSDT",
     "formule": "comptes nets acheteurs / comptes nets vendeurs — un compte = une voix",
     "fenetre": "dernier point de la série horaire"},
    {"nom": "ls_gros_traders", "libelle": "Ratio L/S (gros traders, positions)",
     "chemin": "micro.top_ls_ratio", "unite": "ratio", "dec": 4, "nature": "mesure",
     "source": "Binance futures USDⓈ-M BTCUSDT",
     "formule": "positions longues / courtes des « top traders », pondérées par la taille",
     "fenetre": "dernier point de la série horaire"},
    {"nom": "taker_ratio", "libelle": "Ratio acheteurs/vendeurs taker (perp)",
     "chemin": "micro.taker_ratio", "unite": "ratio", "dec": 4, "nature": "mesure",
     "source": "Binance futures USDⓈ-M BTCUSDT",
     "formule": "volume acheté au marché / volume vendu au marché, sur le perpétuel",
     "fenetre": "dernier point de la série horaire"},
    {"nom": "cvd_1h_usd", "libelle": "CVD 1 h", "chemin": "micro.cvd_1h_usd", "unite": "USD",
     "dec": 0, "nature": "mesure", "source": "Binance spot BTCUSDT, bougies 5 min",
     "formule": "Σ (achats taker − ventes taker) sur 1 h glissante", "fenetre": "1 h glissante",
     "vide": "absent de la publication de l'époque (le CVD n'est publié que depuis le "
             "04/10/2026) : colonne vide, jamais zéro"},
    {"nom": "cvd_4h_usd", "libelle": "CVD 4 h", "chemin": "micro.cvd_4h_usd", "unite": "USD",
     "dec": 0, "nature": "mesure", "source": "Binance spot BTCUSDT, bougies 5 min",
     "formule": "Σ (achats taker − ventes taker) sur 4 h glissantes", "fenetre": "4 h glissantes",
     "vide": _VIDE_ABSENT},
    {"nom": "cvd_24h_usd", "libelle": "CVD 24 h", "chemin": "micro.cvd_24h_usd", "unite": "USD",
     "dec": 0, "nature": "mesure", "source": "Binance spot BTCUSDT, bougies 5 min",
     "formule": "Σ (achats taker − ventes taker) sur 24 h glissantes", "fenetre": "24 h glissantes",
     "vide": _VIDE_ABSENT},
    {"nom": "gex_usd_1pct", "libelle": "GEX net", "chemin": "micro.gex_usd_1pct",
     "unite": "USD de delta par 1 % de mouvement", "dec": 0, "nature": "convention",
     "source": "Deribit (chaîne d'options), calcul dans options_gex.py",
     "formule": "Σ gamma × OI × prix du sous-jacent, calls + / puts −", "fenetre": "instantané",
     "vide": _VIDE_ABSENT},
    {"nom": "gex_7j_usd_1pct", "libelle": "GEX à 7 jours",
     "chemin": "micro.gex_0_7j_usd_1pct", "unite": "USD de delta par 1 % de mouvement",
     "dec": 0, "nature": "convention", "source": "Deribit (chaîne d'options)",
     "formule": "GEX des seules échéances à 7 jours ou moins", "fenetre": "instantané",
     "vide": _VIDE_ABSENT},
    {"nom": "zero_gamma_usdt", "libelle": "Zéro gamma", "chemin": "micro.zero_gamma",
     "unite": "USDT", "dec": 0, "nature": "modèle", "source": "Deribit, options_gex.py",
     "formule": "strike où le gamma agrégé des dealers s'annule", "fenetre": "instantané",
     "vide": _VIDE_ABSENT},
    {"nom": "mur_appel_usdt", "libelle": "Mur d'appel (call wall)", "chemin": "micro.call_wall",
     "unite": "USDT", "dec": 0, "nature": "convention", "source": "Deribit, options_gex.py",
     "formule": "strike de plus forte concentration d'Open Interest en calls",
     "fenetre": "instantané", "vide": _VIDE_ABSENT},
    {"nom": "mur_put_usdt", "libelle": "Mur de put (put wall)", "chemin": "micro.put_wall",
     "unite": "USDT", "dec": 0, "nature": "convention", "source": "Deribit, options_gex.py",
     "formule": "strike de plus forte concentration d'Open Interest en puts",
     "fenetre": "instantané", "vide": _VIDE_ABSENT},
    {"nom": "prime_hors_usdt_pct", "libelle": "Prime Coinbase hors USDT",
     "chemin": "micro.premium_hors_usdt_pct", "unite": "%", "dec": 4, "nature": "mesure",
     "source": "Coinbase vs Binance, corrigée du taux USDT/USD",
     "formule": "(mid Coinbase / mid Binance − 1) × 100, USDT-USD neutralisé",
     "fenetre": "instantané",
     "vide": "absent de la publication de l'époque (publiée depuis le 06/10/2026)"},
    {"nom": "ratio_bid_ask", "libelle": "Ratio bid/ask du carnet",
     "chemin": "liquidity.ratio_bid_ask", "unite": "BTC / BTC", "dec": 4, "nature": "mesure",
     "source": "Binance spot, carnet 5 000 niveaux",
     "formule": "somme des bids / somme des asks dans la bande de référence",
     "fenetre": "bande ±0,5 % (ou la plus large couverte), instantané"},
    {"nom": "dxy", "libelle": "DXY", "chemin": "macro.dxy_spot", "unite": "indice", "dec": 3,
     "nature": "mesure", "source": "Yahoo Finance (différé)",
     "formule": "dernière clôture journalière d'un jour ouvré de l'indice dollar",
     "fenetre": "barres journalières"},
    {"nom": "vix", "libelle": "VIX", "chemin": "macro.vix",
     "unite": "points de volatilité annualisée (%)", "dec": 2, "nature": "mesure",
     "source": "Yahoo Finance (différé)",
     "formule": "volatilité implicite à 30 jours du S&P 500", "fenetre": "dernier cours diffusé"},
]

# Colonnes des trois séries rapatriées de Binance futures. Même contrat : nom explicite,
# décrites par la même liste que celle qui les écrit.
COLS_FUNDING = [
    {"nom": "echeance_utc", "libelle": "Échéance de financement", "chemin": "fundingTime",
     "unite": "date ISO 8601 (UTC)", "dec": None, "nature": "horodatage",
     "formule": "fundingTime de /fapi/v1/fundingRate", "fenetre": "échéance ponctuelle",
     "source": "Binance futures USDⓈ-M BTCUSDT"},
    {"nom": "funding_pct", "libelle": "Funding", "chemin": "fundingRate",
     "unite": "% par échéance", "dec": 6, "nature": "mesure",
     "formule": "fundingRate × 100", "fenetre": "échéance ponctuelle",
     "source": "Binance futures USDⓈ-M BTCUSDT"},
    {"nom": "prix_marque_usdt", "libelle": "Prix de marque", "chemin": "markPrice",
     "unite": "USDT", "dec": 2, "nature": "mesure", "formule": "markPrice à l'échéance",
     "fenetre": "échéance ponctuelle", "source": "Binance futures USDⓈ-M BTCUSDT"},
]

COLS_OI = [
    {"nom": "heure_utc", "libelle": "Heure du point", "chemin": "timestamp",
     "unite": "date ISO 8601 (UTC)", "dec": None, "nature": "horodatage",
     "formule": "timestamp de /futures/data/openInterestHist", "fenetre": "pas horaire",
     "source": "Binance futures USDⓈ-M BTCUSDT"},
    {"nom": "oi_btc", "libelle": "Open interest", "chemin": "sumOpenInterest", "unite": "BTC",
     "dec": 3, "nature": "mesure", "formule": "somme des contrats ouverts", "fenetre": "pas horaire",
     "source": "Binance futures USDⓈ-M BTCUSDT"},
    {"nom": "oi_usd", "libelle": "Open interest en dollars", "chemin": "sumOpenInterestValue",
     "unite": "USDT", "dec": 0, "nature": "mesure", "formule": "somme des contrats ouverts × prix",
     "fenetre": "pas horaire", "source": "Binance futures USDⓈ-M BTCUSDT"},
]

COLS_LS = [
    {"nom": "heure_utc", "libelle": "Heure du point", "chemin": "timestamp",
     "unite": "date ISO 8601 (UTC)", "dec": None, "nature": "horodatage",
     "formule": "timestamp commun aux trois endpoints de positionnement", "fenetre": "pas horaire",
     "source": "Binance futures USDⓈ-M BTCUSDT"},
    {"nom": "ls_comptes", "libelle": "Ratio L/S (comptes)", "chemin": "longShortRatio",
     "unite": "ratio", "dec": 4, "nature": "mesure",
     "formule": "comptes nets acheteurs / comptes nets vendeurs (globalLongShortAccountRatio)",
     "fenetre": "pas horaire", "source": "Binance futures USDⓈ-M BTCUSDT"},
    {"nom": "comptes_longs_pct", "libelle": "Comptes acheteurs", "chemin": "longAccount",
     "unite": "%", "dec": 2, "nature": "mesure",
     "formule": "longAccount × 100 — la source donne cette part en FRACTION (4 décimales) ; "
                "publiée en pourcentage, donc égale à 100 × ratio / (1 + ratio)",
     "fenetre": "pas horaire", "source": "Binance futures USDⓈ-M BTCUSDT"},
    {"nom": "ls_gros_traders", "libelle": "Ratio L/S (gros traders, positions)",
     "chemin": "top_longShortRatio", "unite": "ratio", "dec": 4, "nature": "mesure",
     "formule": "positions longues / courtes des « top traders » (topLongShortPositionRatio)",
     "fenetre": "pas horaire", "source": "Binance futures USDⓈ-M BTCUSDT"},
    {"nom": "gros_longs_pct", "libelle": "Gros traders acheteurs", "chemin": "top_longAccount",
     "unite": "%", "dec": 2, "nature": "mesure",
     "formule": "top_longAccount × 100 — la source donne cette part en FRACTION (4 décimales) ; "
                "publiée en pourcentage, donc égale à 100 × ratio / (1 + ratio)",
     "fenetre": "pas horaire", "source": "Binance futures USDⓈ-M BTCUSDT"},
    {"nom": "taker_ratio_volume", "libelle": "Ratio acheteurs/vendeurs taker",
     "chemin": "taker_buySellRatio", "unite": "ratio", "dec": 4, "nature": "mesure",
     "formule": "volume acheté au marché / vendu au marché (takerlongshortRatio)",
     "fenetre": "pas horaire", "source": "Binance futures USDⓈ-M BTCUSDT"},
]

SERIES = {
    "positionnement": {
        "motif": "series/positionnement/*.csv",
        "cols": COLS_POSITIONNEMENT,
        "cle": "updated",
        "cadence_s": CADENCE_POSITIONNEMENT_S,
        "libelle": "Positionnement — une ligne par publication de market-data.json",
    },
    "funding": {
        "motif": "series/funding.csv",
        "cols": COLS_FUNDING,
        "cle": "echeance_utc",
        "cadence_s": CADENCE_FUNDING_S,
        "libelle": "Funding — une ligne par échéance de financement",
    },
    "open_interest_1h": {
        "motif": "series/open-interest-1h.csv",
        "cols": COLS_OI,
        "cle": "heure_utc",
        "cadence_s": CADENCE_HORAIRE_S,
        "libelle": "Open interest — un point par heure",
    },
    "long_short_1h": {
        "motif": "series/long-short-1h.csv",
        "cols": COLS_LS,
        "cle": "heure_utc",
        "cadence_s": CADENCE_HORAIRE_S,
        "libelle": "Positionnement des comptes, des gros traders et du taker — un point par heure",
    },
}

STATUS: dict = {}
ERRORS: list = []
# Ce que Binance futures conserve encore : 1 000 échéances de funding (~333 jours) et
# 500 points horaires (~21 jours) pour les trois endpoints de positionnement. La borne
# ci-dessous est très au-dessus — elle protège d'une source qui se mettrait à rendre
# beaucoup plus, pas d'un usage normal. Une coupe est une PERTE : elle se dit.
TAILLE_SERIE_MAX = 60_000
# Journal lisible des volumes lus/écrits par série, pour la sortie du cron.
rapport: dict = {}
# Nombre maximum de trous décrits dans l'index. Au-delà, on compte et on le DIT : une
# liste tronquée en silence se lirait comme un historique complet.
TROUS_MAX = 50


class NonConfigure(RuntimeError):
    """Dépendance absente de CET environnement — pas une panne."""


# ─── CONTRÔLE D'UNITÉ DE LA PART LONGUE ──────────────────────────────────────
# `longAccount` n'est pas une mesure indépendante du ratio : c'est la MÊME donnée écrite
# autrement — Binance le calcule comme ratio / (1 + ratio). Ne pas confronter la part
# publiée à cette identité laisse passer une erreur d'UNITÉ, et c'est arrivé : la série a
# publié des FRACTIONS (0,6328) jusqu'au 08/10/2026 alors que `meta` annonçait « % ». Un
# fichier de données seules, lu à distance, ne permettait pas de le voir.
#
# Tolérance. `longShortRatio` est publié à 4 décimales : la part qu'on en reconstruit est
# donc exacte à 1,4e-5 près, soit 0,0014 point de pourcentage, et la colonne en ajoute
# 0,005 (son propre arrondi d'écriture). 0,01 point couvre les deux — et attrape une
# valeur restée en FRACTION, dont l'écart se compte en dizaines de points.
TOLERANCE_PCT = 0.01

# (colonne publiée en pourcentage, ratio dont elle est déductible) — le seul couple du
# schéma où une valeur est ENTIÈREMENT déductible d'une autre colonne de la même ligne ;
# c'est précisément ce qui rend le contrôle possible sans source extérieure.
COUPLES_PART_RATIO = (("comptes_longs_pct", "ls_comptes"),
                      ("gros_longs_pct", "ls_gros_traders"))


def part_attendue_pct(ratio):
    """Part longue, en pourcentage, déduite du ratio L/S publié sur la MÊME ligne."""
    try:
        r = float(ratio)
    except (TypeError, ValueError):
        return None
    if r <= 0:
        return None
    return 100.0 * r / (1.0 + r)


def dec_de(cols, nom):
    """Décimales d'une colonne, LUES dans la spécification au lieu d'être recopiées."""
    return next(c["dec"] for c in cols if c["nom"] == nom)


def controler_part_longue(chemin, limite=TROUS_MAX):
    """Confronte la part publiée à son identité `100 × ratio / (1 + ratio)`.

    Lit le FICHIER publié, jamais les points qui viennent d'arriver : c'est ce qui attrape
    une ligne ancienne que Binance ne rendra plus et qu'aucun passage ne réécrira — donc
    exactement le cas qui a produit le fichier mixte.

    Renvoie les désaccords, ne corrige rien : une valeur qui ne vaut pas ce que `meta`
    annonce se SIGNALE. La corriger en silence remplacerait une donnée fausse par une
    donnée qu'on n'a pas vérifiée.
    """
    if not os.path.exists(chemin):
        return []
    ecarts = []
    for l in lire_csv(chemin, COLS_LS):
        for col_pct, col_ratio in COUPLES_PART_RATIO:
            attendu = part_attendue_pct(l.get(col_ratio))
            publie = l.get(col_pct)
            if attendu is None or publie in (None, ""):
                continue
            try:
                ecart = abs(float(publie) - attendu)
            except (TypeError, ValueError):
                ecarts.append(f"{l.get('heure_utc')} {col_pct} illisible « {publie} »")
                continue
            if ecart > TOLERANCE_PCT:
                ecarts.append(f"{l.get('heure_utc')} {col_pct}={publie} contre "
                              f"{attendu:.2f} attendu (écart {ecart:.2f} pt)")
    if len(ecarts) > limite:
        ecarts = ecarts[:limite] + [f"… et {len(ecarts) - limite} autre(s)"]
    return ecarts


# ─── OUTILS ──────────────────────────────────────────────────────────────────
def nettoie(msg, cfg=CFG) -> str:
    """Retire tout chemin de machine d'un message publié.

    Un `git` qui échoue imprime le chemin absolu de l'arbre dans lequel il tourne, et une
    trace d'exception porte celui du fichier. Ces messages partent dans `index.json`, donc
    dans un dépôt PUBLIC. On substitue au lieu d'espérer.
    """
    s = str(msg)
    remplacements = [
        (cfg.get("hist_dir"), "<historique>"),
        (cfg.get("state_dir"), "<état>"),
        (cfg.get("out_dir"), "<sortie>"),
        (cfg.get("repo_dir"), "<dépôt>"),
        (os.path.expanduser("~"), "<foyer>"),
    ]
    for chemin, jeton in remplacements:
        if chemin:
            s = s.replace(str(chemin), jeton)
    return s


def horodate(valeur) -> str:
    """Normalise une date en ISO 8601 UTC à la seconde, la même écriture partout."""
    if valeur is None:
        return ""
    s = str(valeur).strip()
    try:
        d = dt.datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return s
    if d.tzinfo is None:
        d = d.replace(tzinfo=dt.timezone.utc)
    return d.astimezone(dt.timezone.utc).isoformat(timespec="seconds")


def depuis_ms(ms) -> str:
    return dt.datetime.fromtimestamp(int(ms) / 1000, dt.timezone.utc).isoformat(timespec="seconds")


def nombre(valeur, dec) -> str:
    """Écriture d'une cellule numérique. `None` -> case VIDE, jamais 0.

    La distinction est le cœur de l'amorçage : un champ absent d'un ancien format ne valait
    pas zéro, et l'écrire « 0 » fabriquerait une donnée que personne n'a mesurée.
    """
    if valeur is None or valeur == "":
        return ""
    try:
        f = float(valeur)
    except (TypeError, ValueError):
        return str(valeur)
    return f"{f:.{dec}f}" if dec else f"{f:.0f}"


def centieme(valeur):
    """Fraction -> pourcentage. `None`/illisible -> `None`, donc une case VIDE, jamais 0."""
    try:
        return float(valeur) * 100.0
    except (TypeError, ValueError):
        return None


def lire_chemin(doc, chemin):
    """Lit « micro.cvd_1h_usd » dans un document imbriqué. Absent -> None."""
    cur = doc
    for cle in chemin.split("."):
        if not isinstance(cur, dict) or cle not in cur:
            return None
        cur = cur[cle]
    return cur


def ecrire_atomique(texte, chemin):
    os.makedirs(os.path.dirname(chemin) or ".", exist_ok=True)
    tmp = chemin + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        f.write(texte)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, chemin)


def ecrire_si_change(texte, chemin) -> bool:
    """N'ÉCRIT PAS si le contenu est identique.

    C'est ce qui rend l'idempotence gratuite : sans écriture, `git` ne voit aucun delta,
    donc aucun commit, donc aucun push. Relancer le script dix fois ne produit rien.
    """
    if os.path.exists(chemin):
        try:
            with open(chemin, encoding="utf-8") as f:
                if f.read() == texte:
                    return False
        except OSError:
            pass
    ecrire_atomique(texte, chemin)
    return True


def lire_csv(chemin, cols):
    """[(clé, ligne_dict), …] dans l'ordre du fichier. Fichier absent -> []."""
    if not os.path.exists(chemin):
        return []
    out = []
    with open(chemin, encoding="utf-8", newline="") as f:
        lecteur = csv.DictReader(f)
        if not lecteur.fieldnames or lecteur.fieldnames != [c["nom"] for c in cols]:
            raise RuntimeError(f"en-tête inattendu dans {os.path.basename(chemin)}")
        for ligne in lecteur:
            out.append(ligne)
    return out


def texte_csv(cols, lignes) -> str:
    """En-tête + lignes, séparateur virgule, fin de ligne « \\n » (stable entre machines)."""
    tampon = io.StringIO()
    w = csv.DictWriter(tampon, fieldnames=[c["nom"] for c in cols], lineterminator="\n")
    w.writeheader()
    for ligne in lignes:
        w.writerow(ligne)
    return tampon.getvalue()


# ─── GIT : VERROU PARTAGÉ, WORKTREE À PART ───────────────────────────────────
def git(args, cwd, check=True):
    p = subprocess.run(["git", "-C", cwd, *args], capture_output=True, text=True)
    if check and p.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)} → {nettoie((p.stderr or p.stdout).strip())}")
    return p


def verrou(cfg):
    """Verrou PARTAGÉ entre les trois écrivains (`git_lock`), comme publish.py et heatmap.py."""
    chemin = cfg["git_lock"]
    os.makedirs(os.path.dirname(chemin) or ".", exist_ok=True)
    f = open(chemin, "w")
    fcntl.flock(f, fcntl.LOCK_EX)
    return f


def assurer_worktree(cfg) -> str:
    """Garantit un répertoire de travail sur la branche, et RIEN dans celui de master.

    Le worktree partage l'objet-store : aucun clone à entretenir, et l'index comme l'arbre
    de master restent intacts — c'est la raison d'être de ce répertoire séparé.
    """
    repo, hist, branche = cfg["repo_dir"], cfg["hist_dir"], cfg["hist_branche"]
    if os.path.exists(os.path.join(hist, ".git")):
        p = git(["rev-parse", "--abbrev-ref", "HEAD"], cwd=hist, check=False)
        courante = (p.stdout or "").strip()
        if courante != branche:
            raise RuntimeError(f"le répertoire de travail n'est pas sur « {branche} » "
                               f"mais sur « {courante} »")
        return hist

    os.makedirs(hist, exist_ok=True)
    if os.listdir(hist):
        raise RuntimeError("répertoire de l'historique non vide et non initialisé — refus")
    git(["worktree", "add", "--detach", hist], cwd=repo)
    git(["checkout", "--orphan", branche], cwd=hist)
    git(["rm", "-rq", "--cached", "."], cwd=hist, check=False)
    for entree in os.listdir(hist):
        if entree == ".git":
            continue
        p = os.path.join(hist, entree)
        shutil.rmtree(p) if os.path.isdir(p) else os.remove(p)
    return hist


def synchroniser(cfg, hist):
    """Se met à niveau sur la branche distante si elle existe. Idempotent, jamais destructeur
    d'un commit local non poussé sans le dire."""
    branche, remote = cfg["hist_branche"], cfg["git_remote"]
    if git(["fetch", "-q", remote, branche], cwd=hist, check=False).returncode != 0:
        return "absente"                      # branche pas encore publiée : normal au 1er envoi
    tete = git(["rev-parse", "HEAD"], cwd=hist, check=False).stdout.strip()
    dist = git(["rev-parse", "FETCH_HEAD"], cwd=hist, check=False).stdout.strip()
    if not tete or tete == dist:
        return "à jour"
    if git(["merge-base", "--is-ancestor", tete, dist], cwd=hist, check=False).returncode == 0:
        git(["reset", "-q", "--hard", dist], cwd=hist)
        return "avancé"
    git(["rebase", "-q", dist], cwd=hist)     # nos commits locaux par-dessus
    return "rebasé"


def publier(cfg, message) -> bool:
    """Commit + push sous verrou partagé. Renvoie False s'il n'y a rien à publier."""
    hist, branche, remote = cfg["hist_dir"], cfg["hist_branche"], cfg["git_remote"]
    with verrou(cfg):
        synchroniser(cfg, hist)
        if git(["status", "--porcelain"], cwd=hist).stdout.strip() == "":
            return False
        git(["add", "-A"], cwd=hist)
        git(["commit", "-q", "-m", message], cwd=hist)
        for _ in range(3):
            if git(["push", "-q", remote, f"HEAD:refs/heads/{branche}"],
                   cwd=hist, check=False).returncode == 0:
                return True
            synchroniser(cfg, hist)
        raise RuntimeError("push impossible après 3 essais")


# ─── LECTURE DE L'HISTORIQUE DES COMMITS ─────────────────────────────────────
def publications_des_commits(cfg):
    """Toutes les versions de market-data.json de la branche publiée, de la plus ancienne
    à la plus récente, en UN passage (`cat-file --batch`).

    Lire les commits est la seule source de l'historique d'avant ce script : ces chiffres
    n'existaient que là.
    """
    repo = cfg["repo_dir"]
    shas = git(["log", "--format=%H", "--", "market-data.json"], cwd=repo,
               check=False).stdout.split()
    if not shas:
        return []
    shas.reverse()
    demande = "".join(f"{s}:market-data.json\n" for s in shas).encode()
    p = subprocess.run(["git", "-C", repo, "cat-file", "--batch"],
                       input=demande, capture_output=True)
    docs, pos = [], 0
    brut = p.stdout
    while pos < len(brut):
        fin = brut.find(b"\n", pos)
        if fin < 0:
            break
        entete = brut[pos:fin].decode("utf-8", "replace").split()
        pos = fin + 1
        if len(entete) != 3:                  # « … missing » ou ligne vide
            continue
        taille = int(entete[2])
        corps = brut[pos:pos + taille]
        pos += taille + 1
        try:
            docs.append(json.loads(corps))
        except (UnicodeDecodeError, json.JSONDecodeError):
            continue
    return docs


# ─── SÉRIES ──────────────────────────────────────────────────────────────────
def ligne_depuis_doc(doc, cols):
    """Une ligne de CSV depuis un document source. Champ absent -> cellule VIDE.

    Une colonne à `dec = None` est une date : elle est normalisée pour que deux lignes
    publiées par deux versions différentes du fichier source restent comparables.
    """
    ligne = {}
    for c in cols:
        v = lire_chemin(doc, c["chemin"])
        ligne[c["nom"]] = horodate(v) if c["dec"] is None else nombre(v, c["dec"])
    return ligne


def chemin_serie(cfg, nom, cle_fichier):
    spec = SERIES[nom]
    if nom == "positionnement":
        return os.path.join(cfg["hist_dir"], "series", "positionnement", f"{cle_fichier}.csv")
    return os.path.join(cfg["hist_dir"], spec["motif"])


def mois(iso) -> str:
    return iso[:7]


def ajouter_positionnement(cfg, doc, mois_courant: str):
    """Ajoute la publication à la série. Idempotent ; ne réécrit jamais un mois clos.

    Un mois clos est un fichier dont le mois est antérieur au mois de la publication qu'on
    apporte : il est FIGÉ. Un rattrapage tardif se signale, il ne se réécrit pas.
    """
    ligne = ligne_depuis_doc(doc, COLS_POSITIONNEMENT)
    if not ligne["updated"]:
        STATUS["positionnement"] = "incomplet:updated"
        ERRORS.append("positionnement: publication sans champ `updated`")
        return False
    m = mois(ligne["updated"])
    chemin = chemin_serie(cfg, "positionnement", m)
    existantes = lire_csv(chemin, COLS_POSITIONNEMENT) if os.path.exists(chemin) else []

    if existantes and m != mois_courant:
        STATUS["positionnement"] = "ok"
        ERRORS.append(f"positionnement: sortie ignorée, {m} est clos (mise à jour refusée)")
        return False

    connues = {l["updated"] for l in existantes}
    if ligne["updated"] in connues:
        STATUS["positionnement"] = "ok"
        return False                            # déjà là : rien à faire, rien à écrire

    # Ordre chronologique strict : une publication arrivée en retard se replace à sa place,
    # elle ne se colle pas en fin de fichier.
    lignes = sorted(existantes + [ligne], key=lambda l: l["updated"])
    texte = texte_csv(COLS_POSITIONNEMENT, lignes)
    if len(texte.encode("utf-8")) > MAX_OCTETS:
        STATUS["positionnement"] = f"error: fichier au-delà de {MAX_OCTETS} octets"
        ERRORS.append(f"positionnement: {m}.csv dépasserait {MAX_OCTETS} octets — "
                      "écriture refusée (aucune troncature silencieuse)")
        return False
    ecrire_si_change(texte, chemin)
    STATUS["positionnement"] = "ok"
    return True


def fusionner_serie(cfg, nom, points):
    """Fusionne des points (dicts déjà au format colonnes) dans une série plate.

    « Rapatrié une fois puis prolongé » : la clé est la colonne de temps, un point déjà
    présent est REMPLACÉ (la source fait foi), jamais dupliqué, et rien n'est inséré
    au milieu d'un passé qui n'existe plus côté Binance.
    """
    spec = SERIES[nom]
    chemin = chemin_serie(cfg, nom, None)
    cols, cle = spec["cols"], spec["cle"]
    anciennes = {l[cle]: l for l in lire_csv(chemin, cols)} if os.path.exists(chemin) else {}
    avant = dict(anciennes)
    for p in points:
        if p.get(cle):
            anciennes[p[cle]] = p
    if len(anciennes) > TAILLE_SERIE_MAX:
        lignes = sorted(anciennes.values(), key=lambda l: l[cle])[-TAILLE_SERIE_MAX:]
        # Une coupe est une PERTE : elle se dit, elle ne se fait pas en silence.
        ERRORS.append(f"{nom}: série bornée à {TAILLE_SERIE_MAX} points, "
                      f"{len(anciennes) - TAILLE_SERIE_MAX} point(s) ancien(s) écarté(s)")
    else:
        lignes = sorted(anciennes.values(), key=lambda l: l[cle])
    texte = texte_csv(cols, lignes)
    if len(texte.encode("utf-8")) > MAX_OCTETS:
        STATUS[nom] = f"error: fichier au-delà de {MAX_OCTETS} octets"
        ERRORS.append(f"{nom}: fichier au-delà de {MAX_OCTETS} octets — écriture refusée")
        return False
    change = ecrire_si_change(texte, chemin)
    STATUS[nom] = "ok"
    rapport[nom] = f"{len(points)} points lus, {len(anciennes) - len(avant)} nouveaux"
    return change


# ─── MIGRATION D'UNITÉ ───────────────────────────────────────────────────────
def migrer_part_longue(cfg) -> int:
    """Ramène une série publiée en FRACTION à l'unité que `meta` annonce (le pourcentage).

    Pourquoi une migration, et pas seulement un correctif du producteur : `fusionner_serie`
    ne réécrit que les points que Binance rend encore (500 points horaires, ≈ 21 jours).
    Les lignes plus anciennes sont CONSERVÉES telles quelles — c'est voulu, elles ne se
    refabriquent pas. Corriger le seul producteur aurait donc laissé le HAUT du fichier en
    fraction et le bas en pourcentage : un fichier MIXTE, où la même colonne veut dire deux
    choses selon la ligne, soit pire que l'erreur d'origine.

    Elle RECALCULE la part depuis le ratio de la même ligne, `100 × ratio / (1 + ratio)`.
    C'est idempotent par construction — recalculer rend le même résultat — donc la relancer
    ne peut pas doubler la valeur, ce qui est le piège d'une migration qui multiplierait
    par 100. Une ligne sans ratio reste VIDE : on ne l'invente pas.
    """
    nom = "long_short_1h"
    chemin = chemin_serie(cfg, nom, None)
    cols = SERIES[nom]["cols"]
    if not os.path.exists(chemin):
        STATUS["migration"] = "non exécutée : la série est absente"
        return 0
    lignes = lire_csv(chemin, cols)
    corrigees = 0
    for l in lignes:
        for col_pct, col_ratio in COUPLES_PART_RATIO:
            attendu = part_attendue_pct(l.get(col_ratio))
            if attendu is None:
                continue
            valeur = nombre(attendu, dec_de(cols, col_pct))
            if l.get(col_pct) != valeur:
                l[col_pct] = valeur
                corrigees += 1
    texte = texte_csv(cols, lignes)
    if len(texte.encode("utf-8")) > MAX_OCTETS:
        STATUS["migration"] = f"error: fichier au-delà de {MAX_OCTETS} octets"
        ERRORS.append(f"migration: {nom} dépasserait {MAX_OCTETS} octets — écriture refusée")
        return 0
    change = ecrire_si_change(texte, chemin)
    STATUS["migration"] = "ok"
    rapport["migration"] = (f"{corrigees} cellule(s) remise(s) en pourcentage sur "
                            f"{len(lignes)} ligne(s)"
                            + ("" if change else " — déjà conformes, rien réécrit"))
    return corrigees


# Ce que Binance futures conserve encore. Au-delà, la source ne rend rien — et un trou
# de la SOURCE n'est pas un trou de notre collecte : l'index les distingue.
API_FAPI = "https://fapi.binance.com"


def api_json(url, timeout=25):
    req = urllib.request.Request(url, headers={"User-Agent": "SamsaraHistorique/1.0"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())


def points_funding():
    d = api_json(f"{API_FAPI}/fapi/v1/fundingRate?symbol=BTCUSDT&limit=1000")
    out = []
    for x in d:
        out.append({
            "echeance_utc": depuis_ms(x["fundingTime"]),
            "funding_pct": nombre(float(x["fundingRate"]) * 100, 6),
            "prix_marque_usdt": nombre(x.get("markPrice"), 2),
        })
    return out


def points_oi():
    d = api_json(f"{API_FAPI}/futures/data/openInterestHist?symbol=BTCUSDT&period=1h&limit=500")
    return [{"heure_utc": depuis_ms(x["timestamp"]),
             "oi_btc": nombre(x["sumOpenInterest"], 3),
             "oi_usd": nombre(x["sumOpenInterestValue"], 0)} for x in d]


def points_long_short():
    base = f"{API_FAPI}/futures/data"
    comptes = api_json(f"{base}/globalLongShortAccountRatio?symbol=BTCUSDT&period=1h&limit=500")
    gros = api_json(f"{base}/topLongShortPositionRatio?symbol=BTCUSDT&period=1h&limit=500")
    taker = api_json(f"{base}/takerlongshortRatio?symbol=BTCUSDT&period=1h&limit=500")
    # `longAccount` arrive en FRACTION (0,6328) et `meta` annonce « % » : la colonne est
    # publiée × 100 (63,28). Les décimales viennent de la spécification, pas d'un littéral
    # recopié ici — sinon les deux peuvent diverger.
    dec_pct = dec_de(COLS_LS, "comptes_longs_pct")
    par_heure = {}
    for x in comptes:
        h = depuis_ms(x["timestamp"])
        par_heure.setdefault(h, {})["heure_utc"] = h
        par_heure[h].update({"ls_comptes": nombre(x.get("longShortRatio"), 4),
                             "comptes_longs_pct": nombre(centieme(x.get("longAccount")),
                                                         dec_pct)})
    for x in gros:
        h = depuis_ms(x["timestamp"])
        par_heure.setdefault(h, {})["heure_utc"] = h
        par_heure[h].update({"ls_gros_traders": nombre(x.get("longShortRatio"), 4),
                             "gros_longs_pct": nombre(centieme(x.get("longAccount")),
                                                      dec_pct)})
    for x in taker:
        h = depuis_ms(x["timestamp"])
        par_heure.setdefault(h, {})["heure_utc"] = h
        par_heure[h]["taker_ratio_volume"] = nombre(x.get("buySellRatio"), 4)
    return [par_heure[h] for h in sorted(par_heure)]


# ─── INDEX ───────────────────────────────────────────────────────────────────
def trous(dates, pas_s):
    """Intervalles manquants entre la première et la dernière date observée.

    Un trou est SIGNALÉ, jamais comblé : on ne connaît pas la valeur qu'aurait portée la
    ligne absente. Le pas nominal vient du producteur, pas d'une moyenne des écarts — une
    cadence déduite des données ne peut pas détecter sa propre dérive.
    """
    out = []
    for a, b in zip(dates, dates[1:]):
        manquants = round((b - a).total_seconds() / pas_s) - 1
        if manquants > 0:
            out.append({"debut": a.isoformat(timespec="seconds"),
                        "fin": b.isoformat(timespec="seconds"),
                        "manquants": manquants})
    return out


def construire_index(cfg, ts):
    """Décrit CE QUI EST SUR LE DISQUE, pas ce qu'on croit avoir écrit."""
    hist = cfg["hist_dir"]
    index = {
        "updated": ts,
        "generator": "historique.py v1.0 — séries publiées dans la branche orpheline "
                     "`historique`, décrites par `meta` (07/10/2026)",
        "source": "binance (futures et spot) · deribit et coinbase via market-data.json · "
                  "git (master, publications passées)",
        "branche": cfg["hist_branche"],
        "status": STATUS,
        "errors": ERRORS,
        "series": {},
        "meta": {"version": 1, "champs": meta_champs()},
    }
    for nom, spec in SERIES.items():
        entree = {"libelle": spec["libelle"], "colonnes": [c["nom"] for c in spec["cols"]],
                  "cadence_s": spec["cadence_s"]}
        fichiers = sorted(glob.glob(os.path.join(hist, spec["motif"])))
        entree["fichiers"] = [os.path.relpath(f, hist).replace(os.sep, "/") for f in fichiers]
        cle, pas = spec["cle"], spec["cadence_s"]
        lignes_total, dates, octets, trop_gros = 0, [], 0, []
        for f in fichiers:
            taille = os.path.getsize(f)
            octets += taille
            if taille > MAX_OCTETS:
                trop_gros.append(f"{os.path.relpath(f, hist)} ({taille} o)")
            for l in lire_csv(f, spec["cols"]):
                lignes_total += 1
                try:
                    dates.append(dt.datetime.fromisoformat(l[cle].replace("Z", "+00:00")))
                except (ValueError, AttributeError):
                    ERRORS.append(f"{nom}: horodatage illisible « {l.get(cle)} » dans "
                                  f"{os.path.relpath(f, hist)}")
        dates.sort()
        entree["lignes"] = lignes_total
        entree["octets"] = octets
        entree["periode"] = {"debut": dates[0].isoformat(timespec="seconds"),
                             "fin": dates[-1].isoformat(timespec="seconds")} if dates else None
        t = trous(dates, pas)
        entree["trous"] = t[:TROUS_MAX]
        entree["trous_nombre"] = len(t)
        entree["trous_tronques"] = len(t) > TROUS_MAX
        if trop_gros:
            ERRORS.append(f"{nom}: fichier(s) au-delà de {MAX_OCTETS} octets : "
                          + ", ".join(os.path.basename(x) for x in trop_gros))
        index["series"][nom] = entree

    # ── contrôle d'unité, sur le fichier PUBLIÉ ─────────────────────────────
    # Il vient après la boucle parce qu'il porte sur ce qui est sur le disque, pas sur ce
    # qu'on vient d'écrire. Une anomalie ici sort en code 1 : le passage est déclaré en
    # échec, et l'index publié porte le détail — une session distante voit la même chose
    # que la machine qui produit.
    ecarts = controler_part_longue(chemin_serie(cfg, "long_short_1h", None))
    index["series"]["long_short_1h"]["controle"] = {
        "identite": "100 × ratio / (1 + ratio)",
        "tolerance_pct": TOLERANCE_PCT,
        "desaccords": ecarts,
    }
    if ecarts:
        STATUS["long_short_1h_controle"] = f"error: {len(ecarts)} désaccord(s) d'unité"
        ERRORS.append("long_short_1h: la part longue publiée ne vaut pas "
                      "100 × ratio / (1 + ratio) — " + " · ".join(ecarts))
    else:
        STATUS["long_short_1h_controle"] = "ok"

    if not index["series"]["positionnement"]["lignes"]:
        ERRORS.append("positionnement: aucune ligne — la série n'a pas été amorcée")
    return index


def meta_champs():
    """Description de CHAQUE colonne, construite depuis la liste qui l'écrit."""
    m = {}
    for nom_serie, spec in SERIES.items():
        for c in spec["cols"]:
            m[f"{nom_serie}.{c['nom']}"] = {
                "libelle": c["libelle"], "unite": c["unite"], "formule": c["formule"],
                "fenetre": c.get("fenetre", "—"), "nature": c["nature"],
                "source": c["source"], "params": {},
                "vide": c.get("vide", "aucune valeur publiée à cet instant"),
            }
    return m


# ─── AMORÇAGE ────────────────────────────────────────────────────────────────
def amorcer(cfg, ts):
    """Écrit les séries depuis l'historique des commits de master.

    Le mois en cours est amalgamé avec les mois clos dans le même passage : chaque ligne
    rejoint le fichier de SON mois, donc un dépôt neuf reconstitue la même arborescence
    qu'un dépôt ancien. Un champ absent d'un ancien format reste VIDE.
    """
    docs = publications_des_commits(cfg)
    vues, retenues = {}, []
    for doc in docs:                      # du plus ancien au plus récent : le récent gagne
        u = horodate(lire_chemin(doc, "updated"))
        if u:
            vues[u] = doc
    for u in sorted(vues):
        retenues.append(vues[u])
    if not retenues:
        STATUS["amorcage"] = "non configuré : aucun commit de market-data.json"
        ERRORS.append("amorçage: aucun market-data.json dans l'historique de master")
        return 0
    courant = max(u[:7] for u in vues)

    par_mois = {}
    for doc in retenues:
        ligne = ligne_depuis_doc(doc, COLS_POSITIONNEMENT)
        par_mois.setdefault(mois(ligne["updated"]), []).append(ligne)
    ecrits = 0
    for m, lignes in sorted(par_mois.items()):
        chemin = chemin_serie(cfg, "positionnement", m)
        existantes = lire_csv(chemin, COLS_POSITIONNEMENT) if os.path.exists(chemin) else []
        if existantes and m != courant:
            continue                      # mois clos et déjà écrit : on n'y touche plus
        connues = {l["updated"] for l in existantes}
        fusion = sorted(existantes + [l for l in lignes if l["updated"] not in connues],
                        key=lambda l: l["updated"])
        texte = texte_csv(COLS_POSITIONNEMENT, fusion)
        if len(texte.encode("utf-8")) > MAX_OCTETS:
            ERRORS.append(f"amorçage: {m}.csv dépasserait {MAX_OCTETS} octets — refusé")
            continue
        if ecrire_si_change(texte, chemin):
            ecrits += 1
    rapport["amorcage"] = f"{len(retenues)} publications sur {len(par_mois)} mois, " \
                          f"{ecrits} fichier(s) écrit(s)"
    STATUS["amorcage"] = "ok"
    return len(retenues)


# ─── PROGRAMME ───────────────────────────────────────────────────────────────
def collecter_binance(cfg, sans_reseau):
    for nom, fn in (("funding", points_funding),
                    ("open_interest_1h", points_oi),
                    ("long_short_1h", points_long_short)):
        if sans_reseau:
            STATUS[nom] = "non configuré : --sans-reseau (aucun appel Binance)"
            continue
        try:
            points = fn()
            if not points:
                STATUS[nom] = "vide"
                ERRORS.append(f"{nom}: Binance n'a rendu aucun point")
                continue
            fusionner_serie(cfg, nom, points)
        except Exception as e:                       # noqa: BLE001 — l'échec se publie
            STATUS[nom] = f"error: {type(e).__name__}: {nettoie(e, cfg)}"
            ERRORS.append(f"{nom}: {type(e).__name__}: {nettoie(e, cfg)}")


def reinitialiser():
    """Remet l'état de compte à zéro. Nécessaire parce que les tests appellent `principale`
    plusieurs fois dans le même processus : sans ça, les anomalies de la fois d'avant
    seraient republiées comme si elles venaient d'arriver."""
    STATUS.clear()
    ERRORS.clear()
    rapport.clear()


def principale(cfg=None, argv=None) -> int:
    cfg = cfg or CFG
    reinitialiser()
    p = argparse.ArgumentParser(description="Historique des chiffres publiés — branche orpheline.")
    p.add_argument("--amorcer", action="store_true",
                   help="réécrit les séries depuis l'historique des commits de master")
    p.add_argument("--sans-reseau", action="store_true",
                   help="n'interroge pas Binance (les séries existantes sont conservées)")
    p.add_argument("--sans-pousser", action="store_true", help="commit local seulement")
    p.add_argument("--migrer-part-longue", action="store_true",
                   help="réécrit la part longue de la série publiée de fraction vers "
                        "pourcentage (recalcul depuis le ratio de chaque ligne ; idempotent)")
    args = p.parse_args(argv)

    ts = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
    print(f"🕰️  historique — {ts}")
    print(f"  config : {SC.describe(cfg)}")

    try:
        hist = assurer_worktree(cfg)
    except Exception as e:                          # noqa: BLE001
        STATUS["worktree"] = f"error: {type(e).__name__}: {nettoie(e, cfg)}"
        ERRORS.append(f"worktree: {type(e).__name__}: {nettoie(e, cfg)}")
        print(f"  ❌ worktree : {nettoie(e, cfg)}")
        return 1
    STATUS["worktree"] = "ok"

    deja = os.path.exists(os.path.join(hist, "index.json"))
    if args.amorcer or not deja:
        amorcer(cfg, ts)
    else:
        STATUS["amorcage"] = "non exécuté : les séries existent déjà"

    collecter_binance(cfg, args.sans_reseau)

    if args.migrer_part_longue:
        migrer_part_longue(cfg)

    # ── la publication du jour ──
    try:
        with open(SC.out(cfg, "market-data.json"), encoding="utf-8") as f:
            doc = json.load(f)
    except FileNotFoundError:
        STATUS["positionnement"] = "non configuré : market-data.json absent"
        doc = None
    except Exception as e:                          # noqa: BLE001
        STATUS["positionnement"] = f"error: {type(e).__name__}: {nettoie(e, cfg)}"
        ERRORS.append(f"positionnement: {type(e).__name__}: {nettoie(e, cfg)}")
        doc = None
    if doc is not None:
        try:
            ajouter_positionnement(cfg, doc, mois(horodate(lire_chemin(doc, "updated"))))
        except Exception as e:                      # noqa: BLE001
            STATUS["positionnement"] = f"error: {type(e).__name__}: {nettoie(e, cfg)}"
            ERRORS.append(f"positionnement: {type(e).__name__}: {nettoie(e, cfg)}")

    # ── l'index décrit ce qui est sur le disque APRÈS écriture ──
    try:
        index = construire_index(cfg, ts)
    except Exception as e:                          # noqa: BLE001
        STATUS["index"] = f"error: {type(e).__name__}: {nettoie(e, cfg)}"
        ERRORS.append(f"index: {type(e).__name__}: {nettoie(e, cfg)}")
        print(f"  ❌ index : {nettoie(e, cfg)}")
        return 1
    STATUS["index"] = "ok"
    ecrire_atomique(json.dumps(index, ensure_ascii=False, indent=1), os.path.join(hist, "index.json"))

    pos = index["series"]["positionnement"]
    print(f"  positionnement : {pos['lignes']} lignes · {pos['octets']} o · "
          f"{len(pos['fichiers'])} fichier(s) · {pos['trous_nombre']} trou(s)")
    for nom in ("funding", "open_interest_1h", "long_short_1h"):
        e = index["series"][nom]
        print(f"  {nom:<16}: {e['lignes']} lignes · {e['octets']} o · {e['trous_nombre']} trou(s)")
    if "migration" in rapport:
        print(f"  migration : {rapport['migration']}")
    print(f"  état : {STATUS}")
    if ERRORS:
        print(f"  ⚠️  {len(ERRORS)} anomalie(s) : {ERRORS}")

    if not args.sans_pousser:
        try:
            if publier(cfg, f"Historique {ts[:16]}"):
                print("  ✓ Poussé")
            else:
                print("  − Aucun changement")
        except Exception as e:                      # noqa: BLE001
            print(f"  ❌ publication impossible : {nettoie(e, cfg)}")
            return 1
    return 1 if ERRORS else 0


if __name__ == "__main__":
    sys.exit(principale())
