#!/usr/bin/env python3
"""Indicateurs multi-échelle du bloc `tf` de market-data.json — calcul PUR, sans réseau.

POURQUOI CE MODULE EXISTE (06/10/2026)
--------------------------------------
Le bloc `tf` était calculé par un module hors dépôt. Conséquence : aucun harnais de ce dépôt
ne pouvait vérifier que le nom d'un champ décrit sa formule — et plusieurs mentaient :

  · `ema20_4h` / `ema50_4h` portent le TF DU BLOC (1h, 4h ou 1d), pas « 4h » ;
  · `death_cross_4h` est un ÉTAT (EMA20 sous EMA50), pas un croisement — et pas le
    « death cross » de la littérature (SMA50 / SMA200 en daily) ;
  · `ema_gap_pct` est une valeur ABSOLUE : le sens de l'écart est perdu ;
  · `range_24h_pct` couvre les 30 dernières bougies du TF (5 j en 4h, 30 j en 1d), et se
    rapporte au PLUS BAS de la fenêtre, pas au prix.

Les anciens champs restent publiés À L'IDENTIQUE (même formule, même arrondi : la parité
est vérifiée contre l'ancien module par `publish.py --comparer`), pour ne rien casser chez
un lecteur existant. Les champs CANONIQUES ajoutés à côté disent ce qu'ils sont, et chaque
champ est décrit par une métadonnée construite à partir des constantes ci-dessous — la
même source que le calcul : un libellé ne peut plus dériver de la formule sans que
`tests/test_calculs.py` échoue.

MÉTHODES (implémentations de référence, identiques à celles de la page — js/app.js)
  · RSI de Wilder : moyennes des hausses / baisses amorcées par leur moyenne simple sur
    `RSI_PERIODE` variations, puis lissées à 1/`RSI_PERIODE`.
  · EMA amorcée par la SMA des `periode` premières valeurs, récursion vers l'avant.
  · ATR de Wilder : A0 = moyenne des `ATR_PERIODE` premiers TR, puis lissage 1/`ATR_PERIODE`.

⚠️ La DERNIÈRE bougie renvoyée par Binance est EN COURS : RSI, EMA, S/R et volume moyen
l'incluent. C'est publié (`bougie_en_cours`), parce que la valeur bouge jusqu'à la clôture.
"""
from datetime import datetime, timezone

RSI_PERIODE = 14
EMA_COURTE = 20
EMA_LONGUE = 50
SR_BOUGIES = 30          # support / résistance / amplitude : min / max des N dernières bougies
VOLUME_BOUGIES = 10      # volume moyen : N dernières bougies, en BTC (volume de base)
ATR_PERIODE = 14
DERNIERES = 5            # bougies détaillées publiées
BOUGIES_CHARGEES = 200   # profondeur demandée à Binance pour chaque TF
BOUGIES_MIN = 50         # en dessous, l'EMA longue n'existe pas : le TF n'est pas publié
# TF publiés et leur durée en heures (sert à dire la fenêtre réelle en clair).
TFS = (("4h", 4), ("1h", 1), ("1d", 24))


# ─── Méthodes ────────────────────────────────────────────────────────────────
def rsi_wilder(closes, periode=RSI_PERIODE):
    """RSI de Wilder, arrondi à 0,1. None si l'historique est trop court."""
    if len(closes) < periode + 1:
        return None
    hausses = baisses = 0.0
    for i in range(1, periode + 1):
        d = closes[i] - closes[i - 1]
        hausses += max(d, 0.0)
        baisses += max(-d, 0.0)
    mh, mb = hausses / periode, baisses / periode
    for i in range(periode + 1, len(closes)):
        d = closes[i] - closes[i - 1]
        mh = (mh * (periode - 1) + max(d, 0.0)) / periode
        mb = (mb * (periode - 1) + max(-d, 0.0)) / periode
    if mb == 0:
        return 100.0
    return round(100 - 100 / (1 + mh / mb), 1)


def ema(valeurs, periode):
    """EMA amorcée par la SMA des `periode` premières valeurs. None si trop court."""
    if len(valeurs) < periode:
        return None
    k = 2 / (periode + 1)
    e = sum(valeurs[:periode]) / periode
    for v in valeurs[periode:]:
        e = v * k + e * (1 - k)
    return e


def atr_wilder(bougies, periode=ATR_PERIODE):
    """ATR de Wilder (en dollars). None si trop court."""
    tr = []
    for i in range(1, len(bougies)):
        h, l, pc = bougies[i]["high"], bougies[i]["low"], bougies[i - 1]["close"]
        tr.append(max(h - l, abs(h - pc), abs(l - pc)))
    if len(tr) < periode:
        return None
    a = sum(tr[:periode]) / periode
    for x in tr[periode:]:
        a = (a * (periode - 1) + x) / periode
    return a


def bougies(klines):
    """Klines Binance brutes -> dicts. `close_time` en ISO, comme l'ancien module."""
    out = []
    for k in klines or []:
        out.append({
            "open": float(k[1]), "high": float(k[2]), "low": float(k[3]),
            "close": float(k[4]), "volume": float(k[5]),
            "close_time": datetime.fromtimestamp(k[6] / 1000, tz=timezone.utc).isoformat(),
            "close_ms": int(k[6]),
        })
    return out


# ─── Le bloc d'un TF ─────────────────────────────────────────────────────────
def indicateurs_tf(c, heures, maintenant_ms=None):
    """Indicateurs d'un TF. `c` : bougies (dicts), la plus ANCIENNE en tête.

    Renvoie les champs historiques (parité exacte avec l'ancien module) ET les champs
    canoniques. None si moins de BOUGIES_MIN bougies.
    """
    if not c or len(c) < BOUGIES_MIN:
        return None
    closes = [x["close"] for x in c]
    fen = c[-SR_BOUGIES:]
    highs = [x["high"] for x in fen]
    lows = [x["low"] for x in fen]
    rsi = rsi_wilder(closes)
    e_c = ema(closes, EMA_COURTE)
    e_l = ema(closes, EMA_LONGUE)
    bas, haut = min(lows), max(highs)
    vol_moy = sum(x["volume"] for x in c[-VOLUME_BOUGIES:]) / VOLUME_BOUGIES
    amplitude = round((haut - bas) / bas * 100, 2)
    detail = []
    for x in c[-DERNIERES:]:
        detail.append({
            "open": x["open"], "high": x["high"], "low": x["low"], "close": x["close"],
            "body": round(abs(x["close"] - x["open"]) / x["open"] * 100, 2),
            "direction": "🟢" if x["close"] > x["open"] else "🔴",
            "wick_top": round((x["high"] - max(x["open"], x["close"])) / x["open"] * 100, 2),
            "wick_bottom": round((min(x["open"], x["close"]) - x["low"]) / x["open"] * 100, 2),
        })
    atr = atr_wilder(c)
    dernier = closes[-1]
    if maintenant_ms is None:
        maintenant_ms = int(datetime.now(timezone.utc).timestamp() * 1000)
    en_cours = c[-1].get("close_ms", 0) > maintenant_ms

    return {
        # ── champs historiques : MÊME formule, MÊME arrondi que l'ancien module ──
        "rsi_14": rsi,
        "ema20_4h": round(e_c, 2),
        "ema50_4h": round(e_l, 2),
        "death_cross_4h": e_c < e_l,
        "ema_gap_pct": round(abs(e_c - e_l) / e_l * 100, 2),
        "support_30": round(bas, 2),
        "resistance_30": round(haut, 2),
        "last_close": dernier,
        "avg_volume_10": round(vol_moy, 2),
        "last_5_candles": detail,
        "range_24h_pct": amplitude,
        "sr_window_h": SR_BOUGIES * heures,
        # ── champs canoniques : le nom dit ce que c'est ──
        "ema20": round(e_c, 2),
        "ema50": round(e_l, 2),
        "ema_ecart_pct": round((e_c / e_l - 1) * 100, 2),
        "ema20_sous_ema50": e_c < e_l,
        "amplitude_30_pct": amplitude,
        "volume_moyen_10_btc": round(vol_moy, 2),
        "atr_14": round(atr, 2) if atr is not None else None,
        "atr_14_pct": round(atr / dernier * 100, 2) if atr is not None and dernier else None,
        "bougies_lues": len(c),
        "bougie_en_cours": en_cours,
        "derniere_cloture_a": c[-1]["close_time"],
    }


# Champs historiques comparés à l'ancien module par `publish.py --comparer`.
CHAMPS_HISTORIQUES = ("rsi_14", "ema20_4h", "ema50_4h", "death_cross_4h", "ema_gap_pct",
                      "support_30", "resistance_30", "last_close", "avg_volume_10",
                      "last_5_candles", "range_24h_pct")


# ─── Métadonnées : CONSTRUITES depuis les constantes du calcul ──────────────
def poids_amorce_pct(periode, n=BOUGIES_CHARGEES):
    """Poids que garde encore l'amorce (SMA des `periode` premières) dans l'EMA finale.

    (1 − k)^(n − periode), k = 2/(periode+1). Mesuré le 06/10/2026 sur l'EMA50 daily :
    80 bougies chargées → 78 735, 200 → 79 432 (≈ 700 $ d'écart). Ce poids dit à quel point
    la valeur dépend de la profondeur chargée — c'est la raison pour laquelle l'EMA de la
    page (1 000 bougies) et celle du fichier (200) peuvent différer sans qu'aucune soit fausse.
    """
    k = 2 / (periode + 1)
    return round((1 - k) ** max(0, n - periode) * 100, 3)


def meta():
    """Description de chaque champ du bloc `tf`, dérivée des constantes ci-dessus.

    Clés : nom du champ (le même pour les trois TF). `params` est lisible par machine : le
    harnais de nommage y confronte les nombres contenus dans le NOM du champ.
    """
    fen = f"{SR_BOUGIES} dernières bougies du TF (dernière en cours incluse)"
    base = f"{BOUGIES_CHARGEES} bougies du TF demandées à Binance, dernière en cours incluse"
    m = {
        "rsi_14": {
            "libelle": f"RSI {RSI_PERIODE}", "unite": "indice 0–100",
            "formule": (f"RSI de Wilder : moyennes des hausses et des baisses de clôture, "
                        f"amorcées par leur moyenne simple sur {RSI_PERIODE} variations puis "
                        f"lissées à 1/{RSI_PERIODE} ; RSI = 100 − 100 / (1 + hausses / baisses)"),
            "fenetre": base, "nature": "mesure",
            "params": {"periode": RSI_PERIODE, "methode": "wilder"},
        },
        "ema20": {
            "libelle": f"EMA {EMA_COURTE}", "unite": "USD",
            "formule": (f"moyenne mobile exponentielle des clôtures, k = 2/({EMA_COURTE}+1), "
                        f"amorcée par la moyenne simple des {EMA_COURTE} premières"),
            "fenetre": base, "nature": "mesure",
            "params": {"periode": EMA_COURTE, "amorce": "sma",
                       "poids_amorce_pct": poids_amorce_pct(EMA_COURTE)},
        },
        "ema50": {
            "libelle": f"EMA {EMA_LONGUE}", "unite": "USD",
            "formule": (f"moyenne mobile exponentielle des clôtures, k = 2/({EMA_LONGUE}+1), "
                        f"amorcée par la moyenne simple des {EMA_LONGUE} premières"),
            "fenetre": base, "nature": "mesure",
            "params": {"periode": EMA_LONGUE, "amorce": "sma",
                       "poids_amorce_pct": poids_amorce_pct(EMA_LONGUE)},
        },
        "ema_ecart_pct": {
            "libelle": f"Écart EMA {EMA_COURTE} / EMA {EMA_LONGUE}", "unite": "%",
            "formule": f"(EMA{EMA_COURTE} / EMA{EMA_LONGUE} − 1) × 100, SIGNÉ",
            "fenetre": base, "nature": "mesure",
            "params": {"courte": EMA_COURTE, "longue": EMA_LONGUE, "signe": True},
        },
        "ema20_sous_ema50": {
            "libelle": f"EMA {EMA_COURTE} sous EMA {EMA_LONGUE}", "unite": "booléen",
            "formule": f"EMA{EMA_COURTE} < EMA{EMA_LONGUE} — un ÉTAT, pas un croisement",
            "fenetre": base, "nature": "mesure",
            "params": {"courte": EMA_COURTE, "longue": EMA_LONGUE},
        },
        "support_30": {
            "libelle": "Support", "unite": "USD",
            "formule": f"plus bas des {SR_BOUGIES} dernières bougies — un extrême, pas un niveau testé",
            "fenetre": fen, "nature": "mesure", "params": {"bougies": SR_BOUGIES, "agregat": "min"},
        },
        "resistance_30": {
            "libelle": "Résistance", "unite": "USD",
            "formule": f"plus haut des {SR_BOUGIES} dernières bougies — un extrême, pas un niveau testé",
            "fenetre": fen, "nature": "mesure", "params": {"bougies": SR_BOUGIES, "agregat": "max"},
        },
        "amplitude_30_pct": {
            "libelle": "Amplitude", "unite": "%",
            "formule": f"(plus haut − plus bas) / plus bas × 100, sur les {SR_BOUGIES} dernières bougies",
            "fenetre": fen, "nature": "mesure", "params": {"bougies": SR_BOUGIES, "reference": "plus_bas"},
        },
        "volume_moyen_10_btc": {
            "libelle": "Volume moyen", "unite": "BTC par bougie",
            "formule": f"moyenne du volume de base des {VOLUME_BOUGIES} dernières bougies",
            "fenetre": f"{VOLUME_BOUGIES} dernières bougies du TF (dernière en cours incluse : elle tire la moyenne vers le bas)",
            "nature": "mesure", "params": {"bougies": VOLUME_BOUGIES},
        },
        "atr_14": {
            "libelle": f"ATR {ATR_PERIODE}", "unite": "USD",
            "formule": (f"ATR de Wilder : vrai range max(H−B, |H−C₋₁|, |B−C₋₁|), moyenne des "
                        f"{ATR_PERIODE} premiers puis lissage à 1/{ATR_PERIODE}"),
            "fenetre": base, "nature": "mesure", "params": {"periode": ATR_PERIODE, "methode": "wilder"},
        },
        "atr_14_pct": {
            "libelle": f"ATR {ATR_PERIODE} en %", "unite": "% du dernier prix",
            "formule": f"ATR{ATR_PERIODE} / dernière clôture × 100",
            "fenetre": base, "nature": "mesure", "params": {"periode": ATR_PERIODE},
        },
        "sr_window_h": {
            "libelle": "Fenêtre S/R", "unite": "heures",
            "formule": f"{SR_BOUGIES} × durée d'une bougie du TF",
            "fenetre": "—", "nature": "mesure", "params": {"bougies": SR_BOUGIES},
        },
        "last_close": {
            "libelle": "Dernière clôture", "unite": "USD",
            "formule": "clôture de la dernière bougie reçue — EN COURS : c'est le dernier prix, pas une clôture",
            "fenetre": "—", "nature": "mesure", "params": {},
        },
        "last_5_candles": {
            "libelle": f"{DERNIERES} dernières bougies", "unite": "OHLC + corps / mèches en % de l'ouverture",
            "formule": "corps = |C − O| / O × 100 ; mèches haute / basse en % de O ; 🔴 si C ≤ O (doji compris)",
            "fenetre": f"{DERNIERES} dernières bougies du TF", "nature": "mesure", "params": {"bougies": DERNIERES},
        },
        "bougies_lues": {
            "libelle": "Bougies lues", "unite": "nombre",
            "formule": f"bougies reçues (demandées : {BOUGIES_CHARGEES} ; minimum publié : {BOUGIES_MIN})",
            "fenetre": "—", "nature": "mesure", "params": {},
        },
        "derniere_cloture_a": {
            "libelle": "Clôture de la dernière bougie", "unite": "date",
            "formule": "heure de clôture (prévue) de la dernière bougie reçue",
            "fenetre": "—", "nature": "horodatage", "params": {},
        },
        "bougie_en_cours": {
            "libelle": "Dernière bougie en cours", "unite": "booléen",
            "formule": "la clôture de la dernière bougie reçue est dans le futur : ses valeurs bougent encore",
            "fenetre": "—", "nature": "mesure", "params": {},
        },
    }
    # Champs historiques : mêmes valeurs que leur forme canonique, nom trompeur documenté.
    alias = {
        "ema20_4h": ("ema20", "le suffixe « _4h » est historique : la valeur porte le TF du bloc"),
        "ema50_4h": ("ema50", "le suffixe « _4h » est historique : la valeur porte le TF du bloc"),
        "death_cross_4h": ("ema20_sous_ema50",
                           "ce n'est ni un croisement ni le « death cross » usuel (SMA50/SMA200 "
                           "daily) : c'est l'état EMA20 < EMA50, sur le TF du bloc"),
        "ema_gap_pct": ("ema_ecart_pct", "valeur ABSOLUE : le sens de l'écart est perdu"),
        "range_24h_pct": ("amplitude_30_pct",
                          f"ne couvre PAS 24 h : {SR_BOUGIES} bougies du TF (voir sr_window_h)"),
    }
    for nom, (cible, pourquoi) in alias.items():
        m[nom] = dict(m[cible], alias_de=cible, nom_trompeur=pourquoi)
    m["avg_volume_10"] = dict(m["volume_moyen_10_btc"], alias_de="volume_moyen_10_btc")
    m["ema_gap_pct"] = dict(m["ema_gap_pct"], formule=f"|EMA{EMA_COURTE} − EMA{EMA_LONGUE}| / EMA{EMA_LONGUE} × 100",
                            params={"courte": EMA_COURTE, "longue": EMA_LONGUE, "signe": False})
    return m
