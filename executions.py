#!/usr/bin/env python3
"""Exécutions BTC 24 h — enregistreur PERMANENT des achats et ventes au marché (08/10/2026).

Pourquoi il existe
------------------
Les points d'exécutions de la carte n'étaient lus que par la page, dans l'onglet ouvert :
fermé, tout était perdu, et la réouverture ne remontait que ≈ 30 000 trades. Comme le carnet
pour heatmap.py, les exécutions doivent être notées par le VPS, en continu, et publiées.

Ce que fait ce service
----------------------
  · Il lit les aggTrades spot BTCUSDT **par identifiant** (`fromId`) : chaque exécution est lue
    une fois, dans l'ordre, sans trou. Un arrêt (redémarrage, panne réseau) est RATTRAPÉ au
    retour depuis le dernier identifiant noté, tant qu'il reste dans la fenêtre de 24 h.
  · Il range les volumes en seaux de DT s × DP $ : achats au marché, ventes au marché (BTC).
  · Toutes les minutes, il écrit l'état (STATE) et le fichier publié `executions.json`, de
    façon atomique. Il ne fait AUCUN commit : heatmap.py publie ce fichier dans son propre
    commit, toutes les 15 min — pas un déploiement de plus.

Lancement : un service systemd (Restart=always), voir docs/executions.service. `--une-fois`
lit ce qui est disponible, écrit, et sort (contrôle à la main).
"""
import fcntl
import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import samsara_config as SC

CFG = SC.load()
STATE = SC.state(CFG, "executions-state.json")
RUN_LOCK = SC.state(CFG, "executions.lock")
OUT = SC.out(CFG, "executions.json")

# L'hôte se change par l'environnement (contrôle depuis une machine que api.binance.com refuse :
# SAMSARA_BINANCE=https://data-api.binance.vision, le miroir public, mêmes réponses).
API = os.environ.get("SAMSARA_BINANCE", "https://api.binance.com") + "/api/v3/aggTrades?symbol=BTCUSDT"
DT = 10            # secondes par seau
DP = 10.0          # $ par tranche de prix
UNITE = 0.001      # BTC : les volumes sont publiés en ENTIERS de cette unité (arrondi au plus proche)
WINDOW_S = 24 * 3600
PAGE = 1000        # aggTrades par requête (le maximum de l'API)
POLL_S = 2         # lecture au présent : une requête toutes les 2 s (poids 4 → ≈ 120 / min)
RATTRAPAGE_S = 0.25  # pendant un rattrapage : une page toutes les 0,25 s (≈ 960 de poids / min)
ECRIT_S = 60       # état et fichier publié : une fois par minute
FORMAT = "seaux-1"
DISPOSITION = (
    "seaux : [n, bas, [achats…], [ventes…]], triés par n, sans doublon ; n = ⌊T / dt⌋ (T en "
    "secondes UTC depuis 1970, heure des exécutions Binance) : le seau couvre [n × dt, (n + 1) × dt[ ; "
    "achats[i] et ventes[i] = volume au marché de la tranche (bas + i), qui couvre les prix "
    "[tranche × dp, (tranche + 1) × dp[, en entiers de `unite_btc` ; achat = le preneur achète "
    "(m = false), vente = le preneur vend (m = true) ; seau absent dans [lu_depuis, lu_jusqua[ "
    "hors `trous` = aucune exécution ; `trous` = intervalles [a, b[ en secondes NON lus"
)


def write_atomic(text, path):
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        f.write(text)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)


def lire(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Samsara-executions/1.0"})
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read())


def etat_vide():
    return {"seaux": {}, "dernier_id": None, "lu_depuis": None, "lu_jusqua": None, "trous": []}


def charger():
    """Un état illisible est un INCIDENT : mis de côté et signalé, jamais remplacé en silence."""
    if not os.path.exists(STATE):
        return etat_vide()
    try:
        with open(STATE) as f:
            s = json.load(f)
        return s
    except Exception as e:
        broken = f"{STATE}.corrupt-{int(time.time())}"
        os.rename(STATE, broken)
        print(f"❌ état illisible ({type(e).__name__}: {e}) — mis de côté : {broken} ; on repart d'un état vide")
        return etat_vide()


def verser(s, trades):
    """Range des aggTrades dans les seaux. Rend le T (ms) de la dernière exécution versée."""
    dernier = None
    seaux = s["seaux"]
    for t in trades:
        n = str(int(t["T"]) // 1000 // DT)
        pb = str(int(float(t["p"]) // DP))
        cote = 1 if t["m"] else 0           # m : l'acheteur était passif → vente au marché
        m = seaux.setdefault(n, {})
        v = m.setdefault(pb, [0.0, 0.0])
        v[cote] += float(t["q"])
        s["dernier_id"] = int(t["a"])
        dernier = int(t["T"])
    return dernier


def purger(s, maintenant_s):
    lim = int(maintenant_s - WINDOW_S)
    s["seaux"] = {k: v for k, v in s["seaux"].items() if int(k) * DT + DT > lim}
    s["trous"] = [[a, b] for a, b in s["trous"] if b > lim]
    if s["lu_depuis"] is not None and s["lu_depuis"] < lim:
        s["lu_depuis"] = lim


def donnees(s, updated):
    seaux = []
    for n in sorted(s["seaux"], key=int):
        m = {int(p): v for p, v in s["seaux"][n].items()}
        bas, haut = min(m), max(m)
        ach = [int(round(m.get(p, (0, 0))[0] / UNITE)) for p in range(bas, haut + 1)]
        ven = [int(round(m.get(p, (0, 0))[1] / UNITE)) for p in range(bas, haut + 1)]
        if any(ach) or any(ven):
            seaux.append([int(n), bas, ach, ven])
    return {
        "updated": updated,
        "sym": "BTCUSDT", "source": "Binance spot, aggTrades lus par identifiant (fromId)",
        "dt": DT, "dp": DP, "unite_btc": UNITE,
        "format": FORMAT, "disposition": DISPOSITION,
        "lu_depuis": s["lu_depuis"], "lu_jusqua": s["lu_jusqua"], "trous": s["trous"],
        "seaux": seaux,
    }


def ecrire(s):
    write_atomic(json.dumps(s, separators=(",", ":")), STATE)
    d = donnees(s, datetime.now(timezone.utc).isoformat())
    write_atomic(json.dumps(d, separators=(",", ":")), OUT)
    return d


def demarrer(s, maintenant):
    """Premier identifiant à lire : la suite de l'état, ou le début de la fenêtre.

    Un retard plus vieux que la fenêtre n'est pas rattrapé : on repart du début de la fenêtre,
    et l'intervalle sauté devient un TROU publié (jamais lu comme « aucune exécution »).
    """
    debut = int(maintenant - WINDOW_S)
    if s["dernier_id"] is not None and s["lu_jusqua"] is not None and s["lu_jusqua"] >= debut:
        return s["dernier_id"] + 1
    if s["lu_jusqua"] is not None:
        s["trous"].append([s["lu_jusqua"], debut])
    t = lire(f"{API}&startTime={debut * 1000}&limit=1")
    if not t:
        t = lire(f"{API}&limit=1")
    if s["lu_depuis"] is None:
        s["lu_depuis"] = debut
    return int(t[0]["a"])


def tour(s, prochain):
    """Une page. Rend (prochain identifiant, page pleine ?)."""
    envoi = time.time()
    t = lire(f"{API}&fromId={prochain}&limit={PAGE}")
    if t:
        verser(s, t)
        prochain = s["dernier_id"] + 1
    plein = len(t) >= PAGE
    if plein:
        s["lu_jusqua"] = int(t[-1]["T"]) // 1000      # lu sans trou jusqu'à la dernière reçue
    else:
        s["lu_jusqua"] = int(envoi)                   # tout est lu jusqu'à l'envoi de la requête
    return prochain, plein


def main():
    une_fois = "--une-fois" in sys.argv
    os.makedirs(os.path.dirname(RUN_LOCK) or ".", exist_ok=True)
    lk = open(RUN_LOCK, "w")
    try:
        fcntl.flock(lk, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        print("déjà en cours — sortie")
        return 0

    s = charger()
    prochain = None
    ecrit = 0.0
    echecs = 0
    while True:
        try:
            if prochain is None:
                prochain = demarrer(s, time.time())
            prochain, plein = tour(s, prochain)
            echecs = 0
        except urllib.error.HTTPError as e:
            echecs += 1
            attente = int(e.headers.get("Retry-After") or 0) if e.code in (418, 429) else 0
            print(f"aggTrades : HTTP {e.code}" + (f" — pause {attente} s" if attente else ""))
            plein = False
            time.sleep(max(attente, min(60, 2 ** echecs)))
        except Exception as e:
            echecs += 1
            print(f"aggTrades : {type(e).__name__}: {e}")
            plein = False
            time.sleep(min(60, 2 ** echecs))
        now = time.time()
        if now - ecrit >= ECRIT_S or une_fois and not plein:
            purger(s, now)
            d = ecrire(s)
            ecrit = now
            print(f"{d['updated'][:19]} · {len(d['seaux'])} seaux · lu jusqu'à "
                  f"{datetime.fromtimestamp(s['lu_jusqua'] or 0, timezone.utc):%H:%M:%S}")
        if une_fois and not plein:
            return 0
        time.sleep(RATTRAPAGE_S if plein else POLL_S)


if __name__ == "__main__":
    sys.exit(main())
