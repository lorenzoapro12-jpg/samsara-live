#!/usr/bin/env python3
"""Heatmap liquidité BTC 24h — accumulateur + publisher (à lancer toutes les minutes).

Accumule le carnet d'ordres Binance dans une heatmap glissante (bucket 1 min × $20),
sépare bids/asks, et pousse heatmap.json selon l'intervalle minimal de publication
(voir PUSH_MIN_S). Aucun chemin de machine n'est écrit ici : tout vient de
`samsara_config.py` (voir `config.example.json`).

Le seul fichier réellement persistant est l'ÉTAT (STATE) : c'est lui qui porte les 24 h
accumulées. `state_dir` doit donc être stable — le changer repart d'un état vide.

Corrections du 24/09/2026 (audit externe, constats G1, G2, G9) :
  · VERROU d'instance unique — deux exécutions qui se chevauchent écrasaient l'état.
  · ÉCRITURES ATOMIQUES — un disque plein ou une mort du processus pendant l'écriture
    ne doit plus pouvoir effacer 24 h d'historique en silence.
  · ÉTAT CORROMPU = ARRÊT BRUYANT — `except: state = {}` perdait la fenêtre entière
    sans rien dire ; on renomme, on logge, on sort en erreur.
  · COMMIT LIMITÉ AU FICHIER + VERROU GIT PARTAGÉ — `git commit` sans chemin pouvait
    embarquer le fichier préparé par publish.py ; les deux écrivains se volaient l'index.
  · LAST_PUSH AVANCÉ MÊME EN CAS D'ÉCHEC — sinon une panne GitHub faisait committer
    2,3 Mo à CHAQUE minute au lieu d'une fois par intervalle.
"""
import fcntl
import json
import math
import os
import subprocess
import sys
import time
import urllib.request
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import samsara_config as SC

CFG = SC.load()

STATE = SC.state(CFG, "state.json")
LAST_PUSH = SC.state(CFG, "last-push.txt")
RUN_LOCK = SC.state(CFG, "run.lock")
OUT = SC.out(CFG, "heatmap.json")
REPO = CFG["repo_dir"]
GIT_LOCK = CFG["git_lock"]
GIT_REMOTE = CFG["git_remote"]
GIT_BRANCH = CFG["git_branch"]

DT = 60           # secondes par colonne (1 min)
DP = 20.0         # $ par bin de prix
WINDOW_S = 24 * 3600
REF = 100.0       # qty BTC de référence pour l'échelle d'intensité
PLAFOND = 255     # intensité maximale (atteinte dès q ≥ REF)
NIVEAUX = 5000    # niveaux de carnet demandés à Binance (le maximum de l'API)
# Intervalle minimal entre deux publications. Mesuré le 04/10/2026 : à 120 s, ce fichier
# (≈ 2,1 Mo de JSON, recompressé à ≈ 440 Ko par git) produisait **574 commits par jour**,
# soit ≈ 250 Mo d'historique quotidien — pour une fenêtre **glissante** de 24 h dont les
# versions anciennes n'ont aucune valeur. La croissance était d'un facteur ~6 au-dessus de
# ce qu'un dépôt public peut porter. 900 s = 15 min, aligné sur la cadence du publisher.
# L'accumulateur local, lui, continue d'enregistrer chaque minute : seule la PUBLICATION
# est espacée, pas la donnée.
PUSH_MIN_S = 900


def dump_atomic(obj, path):
    """Écrit puis remplace : jamais de JSON tronqué visible par un lecteur."""
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(obj, f)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)


def fetch_depth():
    url = f"https://api.binance.com/api/v3/depth?symbol=BTCUSDT&limit={NIVEAUX}"
    req = urllib.request.Request(url, headers={"User-Agent": "Heatmap/1.0"})
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read())


def load_state():
    """Charge l'état. Un fichier illisible est un INCIDENT, pas un état vide."""
    if not os.path.exists(STATE):
        return {}
    try:
        with open(STATE) as f:
            return json.load(f)
    except Exception as e:
        broken = f"{STATE}.corrupt-{int(time.time())}"
        try:
            os.rename(STATE, broken)
        except Exception:
            broken = STATE
        print(f"❌ état illisible ({type(e).__name__}: {e}) — mis de côté : {broken}")
        print("   ARRÊT : repartir d'un état vide effacerait 24 h de carnet sans le dire.")
        raise


def git_publish_heatmap(updated_iso):
    """Publie SOUS VERROU PARTAGÉ, dans un INDEX DÉDIÉ.

    ⚠️ Le pathspec ne suffit pas — mesuré le 02/10/2026 : ce commit a embarqué 14
    fichiers sans rapport, laissés INDEXÉS par un autre processus, sous le message
    « Heatmap … ». `git commit -- <chemin>` ignore les modifications non indexées des
    autres chemins, mais committe tout ce qui est déjà dans l'index. On commet donc
    depuis un index à nous, et l'index partagé est remis à niveau après.
    """
    os.makedirs(os.path.dirname(GIT_LOCK) or ".", exist_ok=True)
    P = "heatmap.json"
    with open(GIT_LOCK, "w") as lk:
        fcntl.flock(lk, fcntl.LOCK_EX)

        def shared(*a, **k):
            return subprocess.run(["git", "-C", REPO, *a], **k)

        env = dict(os.environ, GIT_INDEX_FILE=os.path.join(CFG["state_dir"], "index-heatmap"))

        def g(*a, **k):
            k["env"] = env
            return subprocess.run(["git", "-C", REPO, *a], **k)

        g("read-tree", "HEAD", check=True)       # base = HEAD, JAMAIS l'index partagé
        g("add", "--", P, check=True)
        if g("diff", "--cached", "--quiet", "--", P).returncode == 0:
            print("no change")
            return True
        g("commit", "-q", "-m", f"Heatmap {updated_iso[:16]}", check=True)

        shared("reset", "-q", "HEAD", "--", P)   # l'index partagé rejoint HEAD
        for _ in range(3):
            if shared("push", "-q", GIT_REMOTE, GIT_BRANCH, timeout=90).returncode == 0:
                return True
            shared("pull", "-q", "--rebase", GIT_REMOTE, GIT_BRANCH)
        raise RuntimeError("push impossible après 3 essais")


def intensite(q):
    """Quantité (BTC) -> intensité 0..PLAFOND. Racine : un mur de 4× pèse 2× à l'œil."""
    return min(PLAFOND, int(PLAFOND * math.sqrt(q / REF)))


def encodage():
    """Ce qu'est une cellule, PUBLIÉ avec les cellules (06/10/2026).

    Une cellule n'est PAS une quantité : la page qui la lit doit savoir la décoder, et ne
    doit pas recopier REF chez elle — une constante recopiée diverge en silence le jour où
    on la change ici. Construit depuis les constantes : il ne peut pas les contredire.
    """
    return {
        "valeur": f"min({PLAFOND}, ent({PLAFOND} × √(q / ref)))",
        "q": ("quantité du plus gros NIVEAU DE PRIX de la tranche, en BTC — un niveau peut "
              "réunir plusieurs ordres posés au même prix"),
        "ref_btc": REF,
        "plafond": PLAFOND,
        "sature_des_btc": REF,
        "seuil_btc": round(REF / PLAFOND ** 2, 6),
        "decodage": "q ∈ [ref × (v / plafond)², ref × ((v + 1) / plafond)²[ ; v = plafond : q ≥ ref (saturé)",
        "agregation_tranche": "max",
        "fusion": ("tranches ou colonnes voisines : prendre le MAX (exact : √ est croissante) ; "
                   "jamais la somme (une somme d'intensités n'a pas d'unité)"),
        "instantane": f"un carnet complet ({NIVEAUX} niveaux) lu une fois par colonne de {DT} s",
        "niveaux": NIVEAUX,
        "couverture": f"bande vue par {NIVEAUX} niveaux (≈ ±1 %) : hors de cette bande, « non observé », pas « vide »",
    }


def publish(state):
    cols = sorted(int(k) for k in state.keys())
    if not cols:
        return False
    t0 = cols[0] * DT
    bids, asks = [], []
    for c in cols:
        for pb, v in state[str(c)].get("b", {}).items():
            bids.append([c - cols[0], int(pb), v])
        for pb, v in state[str(c)].get("a", {}).items():
            asks.append([c - cols[0], int(pb), v])
    data = {
        "updated": datetime.now(timezone.utc).isoformat(),
        "sym": "BTCUSDT", "t0": t0, "dt": DT, "dp": DP,
        "encodage": encodage(),
        "bids": bids, "asks": asks,
    }
    dump_atomic(data, OUT)
    git_publish_heatmap(data["updated"])
    print(f"pushed {len(bids) + len(asks)} cells")
    return True


def main():
    # ── Instance unique : le planificateur peut relancer avant la fin du tour ──
    os.makedirs(os.path.dirname(RUN_LOCK) or ".", exist_ok=True)
    lk = open(RUN_LOCK, "w")
    try:
        fcntl.flock(lk, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        print("déjà en cours — sortie")
        return 0

    try:
        d = fetch_depth()
    except Exception as e:
        print(f"depth: {e}")
        return 1

    try:
        state = load_state()
    except Exception:
        return 1

    col = int(time.time()) // DT
    bins = {"b": {}, "a": {}}
    for side, key in (("bids", "b"), ("asks", "a")):
        for ps, qs in d[side]:
            q = float(qs)
            pb = int(float(ps) // DP)
            if q > bins[key].get(pb, 0):
                bins[key][pb] = q
    cells = {"b": {}, "a": {}}
    for key in ("b", "a"):
        for pb, q in bins[key].items():
            v = intensite(q)
            if v >= 1:
                cells[key][pb] = v
    state[str(col)] = cells
    cutoff = (int(time.time()) - WINDOW_S) // DT
    state = {k: v for k, v in state.items() if int(k) >= cutoff}
    os.makedirs(os.path.dirname(STATE), exist_ok=True)
    dump_atomic(state, STATE)

    try:
        last = float(open(LAST_PUSH).read().strip())
    except Exception:
        last = 0
    if time.time() - last >= PUSH_MIN_S:
        try:
            publish(state)
        except Exception as e:
            # LAST_PUSH avance MÊME en échec : sans ça, chaque minute produisait un
            # nouveau commit local de 2,3 Mo, et la croissance triplait pendant la panne.
            with open(LAST_PUSH, "w") as f:
                f.write(str(time.time()))
            print(f"❌ publication échouée : {type(e).__name__}: {e}")
            return 1
        with open(LAST_PUSH, "w") as f:
            f.write(str(time.time()))
    return 0


if __name__ == "__main__":
    sys.exit(main())
