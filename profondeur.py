#!/usr/bin/env python3
"""Profondeur lointaine BTC 24 h — carnet COMPLET de Coinbase, ±10 % (08/10/2026).

Pourquoi il existe
------------------
Binance ne rend que 5 000 niveaux : la carte s'arrête à ≈ ±1 % du prix (mesuré le 08/10 :
−0,97 % / +1,27 %). Coinbase rend son carnet ENTIER en un appel public (21 446 niveaux côté bid
le 08/10). Ce module en garde une colonne toutes les PAS_S secondes, sur ±BANDE_PCT, en SOMME
par tranche de DP $, et l'écrit dans `profondeur.json` au même format « colonnes-1 » que
heatmap.json — la page le peint SOUS la carte de Binance, là où celle-ci ne voit rien.

Ce n'est pas le même carnet : BTC-USD chez Coinbase, BTCUSDT chez Binance (écart USDT/USD
≈ 0,03 %, négligeable à 100 $ la tranche). L'échelle est PROPRE à ce fichier (`encodage`) :
une couleur ici ne se compare pas à une couleur de la carte Binance.

Appelé par heatmap.py à chaque tour (une fois par minute) : `tour()` ne lit Coinbase que si la
dernière colonne a plus de PAS_S secondes. Il n'écrit que dans le dossier d'état ; heatmap.py
recopie `profondeur.json` dans le dépôt et le publie dans son commit de 15 min.
"""
import json
import math
import os
import sys
import time
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import samsara_config as SC

CFG = SC.load()
STATE = SC.state(CFG, "profondeur-state.json")
OUT = SC.state(CFG, "profondeur.json")   # hors de l'arbre de travail, comme executions.json

URL = "https://api.exchange.coinbase.com/products/BTC-USD/book?level=2"
PAS_S = 300        # une colonne toutes les 5 min : la profondeur lointaine bouge lentement
DP = 100.0         # $ par tranche
BANDE_PCT = 10.0   # ± autour du milieu du carnet
WINDOW_S = 24 * 3600
REF = 100.0        # BTC (somme d'une tranche de 100 $) qui sature ; mesuré le 08/10 : p50 ≈ 5, p90 ≈ 20, max ≈ 120
PLAFOND = 255
FORMAT = "colonnes-1"
DISPOSITION = (
    "colonnes : [colonne, bid_bas, [v…], ask_bas, [v…]], triées, sans doublon ; colonne = ⌊t / dt⌋, "
    "ABSOLUE (t en secondes UTC depuis 1970) : elle couvre [colonne × dt, (colonne + 1) × dt[ ; v[i] = "
    "intensité de la tranche (bas + i), prix [tranche × dp, (tranche + 1) × dp[ ; 0 = rien au-dessus du "
    "seuil ; colonne absente = non lue"
)


def write_atomic(text, path):
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        f.write(text)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)


def intensite(q):
    return min(PLAFOND, int(PLAFOND * math.sqrt(q / REF)))


def encodage():
    return {
        "valeur": f"min({PLAFOND}, ent({PLAFOND} × √(q / ref)))",
        "q": f"SOMME des niveaux de la tranche de {DP:g} $, en BTC, carnet Coinbase BTC-USD",
        "ref_btc": REF, "plafond": PLAFOND, "sature_des_btc": REF,
        "seuil_btc": round(REF / PLAFOND ** 2, 6),
        "decodage": "q ∈ [ref × (v / plafond)², ref × ((v + 1) / plafond)²[ ; v = plafond : q ≥ ref (saturé)",
        "agregation_tranche": "somme",
        "fusion": "tranches ou colonnes voisines : prendre le MAX ; jamais la somme d'intensités",
        "instantane": f"carnet Coinbase complet lu une fois par colonne de {PAS_S} s",
        "couverture": f"± {BANDE_PCT:g} % autour du milieu du carnet",
        "source": "Coinbase Exchange, BTC-USD (prix en USD, pas en USDT)",
        "echelle": "propre à ce fichier : non comparable à heatmap.json",
    }


def colonne(livre):
    """Carnet Coinbase -> {'b': {tranche: v}, 'a': {…}} sur ±BANDE_PCT, en somme par tranche."""
    b0, a0 = float(livre["bids"][0][0]), float(livre["asks"][0][0])
    mid = (b0 + a0) / 2
    lo, hi = mid * (1 - BANDE_PCT / 100), mid * (1 + BANDE_PCT / 100)
    out = {}
    for side, key in (("bids", "b"), ("asks", "a")):
        s = {}
        for niveau in livre[side]:
            p, q = float(niveau[0]), float(niveau[1])
            if lo <= p <= hi:
                pb = int(p // DP)
                s[pb] = s.get(pb, 0.0) + q
        out[key] = {str(pb): v for pb, q in s.items() if (v := intensite(q)) >= 1}
    return out


def plage(cote):
    n = {int(p): v for p, v in cote.items()}
    if not n:
        return None, []
    bas = min(n)
    return bas, [n.get(p, 0) for p in range(bas, max(n) + 1)]


def donnees(state, updated):
    cols = []
    for c in sorted(state, key=int):
        bb, bv = plage(state[c].get("b", {}))
        ab, av = plage(state[c].get("a", {}))
        if bv or av:
            cols.append([int(c), bb, bv, ab, av])
    if not cols:
        return None
    return {"updated": updated, "sym": "BTC-USD", "source": "coinbase",
            "t0": cols[0][0] * PAS_S, "dt": PAS_S, "dp": DP,
            "format": FORMAT, "disposition": DISPOSITION, "encodage": encodage(), "colonnes": cols}


def charger():
    try:
        with open(STATE) as f:
            return json.load(f)
    except FileNotFoundError:
        return {}
    except Exception as e:
        os.rename(STATE, f"{STATE}.corrupt-{int(time.time())}")
        print(f"❌ profondeur : état illisible ({type(e).__name__}) — mis de côté")
        return {}


def lire():
    req = urllib.request.Request(URL, headers={"User-Agent": "Samsara-profondeur/1.0"})
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read())


def tour(maintenant=None, lecteur=None):
    """Une colonne si la dernière a au moins PAS_S s. Rend True si une colonne a été ajoutée."""
    maintenant = time.time() if maintenant is None else maintenant
    c = int(maintenant) // PAS_S
    state = charger()
    if str(c) in state:
        return False
    state[str(c)] = colonne((lecteur or lire)())
    cutoff = (int(maintenant) - WINDOW_S) // PAS_S
    state = {k: v for k, v in state.items() if int(k) >= cutoff}
    write_atomic(json.dumps(state, separators=(",", ":")), STATE)
    from datetime import datetime, timezone
    d = donnees(state, datetime.now(timezone.utc).isoformat())
    if d:
        write_atomic(json.dumps(d, separators=(",", ":")), OUT)
    return True


if __name__ == "__main__":
    print("colonne ajoutée" if tour() else "colonne déjà lue")
