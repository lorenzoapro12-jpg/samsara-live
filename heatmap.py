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
PUSH_MIN_S = 120  # intervalle minimal entre deux publications


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
    url = "https://api.binance.com/api/v3/depth?symbol=BTCUSDT&limit=5000"
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
    """Publie SOUS VERROU PARTAGÉ, en ne committant QUE heatmap.json.

    publish.py utilise le même verrou : sans lui, l'un committait le fichier préparé
    par l'autre, ou levait une fausse erreur sur `git commit` vide d'index.
    """
    os.makedirs(os.path.dirname(GIT_LOCK) or ".", exist_ok=True)
    with open(GIT_LOCK, "w") as lk:
        fcntl.flock(lk, fcntl.LOCK_EX)

        def g(*a, **k):
            return subprocess.run(["git", "-C", REPO, *a], **k)

        g("add", "--", "heatmap.json", check=True)
        if g("diff", "--cached", "--quiet", "--", "heatmap.json").returncode == 0:
            print("no change")
            return True
        g("commit", "-q", "-m", f"Heatmap {updated_iso[:16]}", "--", "heatmap.json",
          check=True)
        for _ in range(3):
            if g("push", "-q", GIT_REMOTE, GIT_BRANCH, timeout=90).returncode == 0:
                return True
            g("pull", "-q", "--rebase", GIT_REMOTE, GIT_BRANCH)
        raise RuntimeError("push impossible après 3 essais")


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
            v = min(255, int(255 * math.sqrt(q / REF)))
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
