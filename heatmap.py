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

Livraison du 07/10/2026 (à valider par un passage réel du cron) :
  · FORMAT « colonnes-1 » — mêmes cellules, sans perte, en colonnes à minute absolue
    (voir FORMAT, DISPOSITION) ; les pages lisent les deux formats.
  · CADENCE — 15 min au lieu de 16 (voir main()).

Livraison du 08/10/2026 :
  · SOMME PAR TRANCHE — une case porte la somme des BTC de sa tranche de 20 $, comme les murs
    de market-data.json et comme Bookmap. Le MAX d'un seul niveau rendait presque invisible un
    mur fait de nombreux ordres (mesuré le 08/10 à 08:33 : Σ 26,9 BTC à 82 820 $, case ≈ 3 BTC).
    Les colonnes plus anciennes que le changement restent en MAX : `agregation_depuis` le dit.
  · EXÉCUTIONS — executions.py (service permanent) écrit executions.json ; il part dans le
    MÊME commit que heatmap.json, s'il existe : pas un commit ni un déploiement de plus.
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
REF = 50.0        # qty BTC de référence pour l'échelle d'intensité (somme d'une tranche de 20 $ :
                  # mesuré le 08/10, p50 ≈ 4 BTC, p90 ≈ 15, plus gros mur ≈ 46 — 100 laissait la carte terne)
# Agrégation d'une tranche (08/10/2026) : la SOMME des niveaux. Retour arrière : AGREGATION = "max"
# (et REF = 100.0). Les colonnes sont gardées dans state.json en intensités : celles d'avant le
# changement ne se recalculent pas ; leur première minute en somme est notée dans AGREG_DEPUIS.
AGREGATION = "somme"
AGREG_DEPUIS = SC.state(CFG, "agregation-depuis.txt")
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
# Avance tolérée sur cet intervalle : une demi-période du planificateur (un tour par colonne,
# toutes les DT s). Sans elle, la gigue de démarrage suffit à refuser le 15ᵉ tour (un tour
# lancé à :00,4 puis un autre à :00,3 quinze minutes plus tard : 899,9 s) ; le 14ᵉ (840 s)
# reste refusé. Voir main() pour l'autre moitié du correctif (horodater le DÉBUT du tour).
MARGE_PUSH_S = DT // 2

# Format publié (07/10/2026). « colonnes-1 » : une colonne par minute ABSOLUE, chaque côté en
# une seule plage contiguë de tranches (mesuré sur la publication du 06/10 12:58 : bids et
# asks sont des plages sans trou). L'ancien format répétait [c, pb, …] pour chacune des
# ~130 000 cellules, avec c RELATIF à la première colonne : tout le texte changeait à chaque
# publication et git ne trouvait aucun delta — 291 Kio poussés par commit, ≈ 27 Mo/jour.
# Mesuré sur les 36 publications réelles du 06/10, rejouées dans les deux formats : mêmes
# cellules ; 2,16 Mo → 0,40 Mo brut, 384 → 61 Kio en gzip, 291 → 1,5 Kio poussés par commit.
# Retour arrière en une ligne : FORMAT = ANCIEN (octet pour octet l'écriture d'avant).
ANCIEN = "cellules"
FORMAT = "colonnes-1"
DISPOSITION = (
    "colonnes : [minute, bid_bas, [v…], ask_bas, [v…]], triées par minute, sans doublon ; "
    "minute = ⌊t / dt⌋, ABSOLUE (t en secondes UTC depuis 1970) : la colonne couvre "
    "[minute × dt, (minute + 1) × dt[ ; v[i] = intensité de la tranche (bas + i), qui couvre "
    "les prix [tranche × dp, (tranche + 1) × dp[ (voir encodage) ; 0 = rien au-dessus du "
    "seuil ; côté vide : null, [] ; bids et asks sont deux séries, une tranche peut porter "
    "les deux ; minute absente = aucun carnet lu : non observée ; t0 = début de la première "
    "colonne, en secondes"
)


def write_atomic(text, path):
    """Écrit puis remplace : jamais de JSON tronqué visible par un lecteur."""
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        f.write(text)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)


def dump_atomic(obj, path):
    write_atomic(json.dumps(obj), path)


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
    # executions.json (executions.py) part dans le même commit quand il existe.
    autres = [f for f in ("executions.json",) if os.path.exists(os.path.join(REPO, f))]
    with open(GIT_LOCK, "w") as lk:
        fcntl.flock(lk, fcntl.LOCK_EX)

        def shared(*a, **k):
            return subprocess.run(["git", "-C", REPO, *a], **k)

        env = dict(os.environ, GIT_INDEX_FILE=os.path.join(CFG["state_dir"], "index-heatmap"))

        def g(*a, **k):
            k["env"] = env
            return subprocess.run(["git", "-C", REPO, *a], **k)

        g("read-tree", "HEAD", check=True)       # base = HEAD, JAMAIS l'index partagé
        g("add", "--", P, *autres, check=True)
        if g("diff", "--cached", "--quiet", "--", P, *autres).returncode == 0:
            print("no change")
            return True
        g("commit", "-q", "-m", f"Heatmap {updated_iso[:16]}", check=True)

        shared("reset", "-q", "HEAD", "--", P, *autres)   # l'index partagé rejoint HEAD
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
        "q": (("SOMME des niveaux de prix de la tranche, en BTC" if AGREGATION == "somme" else
               "quantité du plus gros NIVEAU DE PRIX de la tranche, en BTC — un niveau peut "
               "réunir plusieurs ordres posés au même prix")
              + " ; colonnes avant `agregation_depuis` (minute absolue) : plus gros niveau"),
        "ref_btc": REF,
        "plafond": PLAFOND,
        "sature_des_btc": REF,
        "seuil_btc": round(REF / PLAFOND ** 2, 6),
        "decodage": "q ∈ [ref × (v / plafond)², ref × ((v + 1) / plafond)²[ ; v = plafond : q ≥ ref (saturé)",
        "agregation_tranche": AGREGATION,
        "agregation_depuis": agregation_depuis(),
        "fusion": ("tranches ou colonnes voisines : prendre le MAX (la plus forte case du bloc) ; "
                   "jamais la somme (une somme d'intensités n'a pas d'unité)"),
        "instantane": f"un carnet complet ({NIVEAUX} niveaux) lu une fois par colonne de {DT} s",
        "niveaux": NIVEAUX,
        "couverture": f"bande vue par {NIVEAUX} niveaux (≈ ±1 %) : hors de cette bande, « non observé », pas « vide »",
    }


def agregation_depuis():
    """Première minute agrégée en somme (notée au premier tour qui l'applique), ou None."""
    try:
        return int(open(AGREG_DEPUIS).read().strip())
    except Exception:
        return None


REF_AVANT = 100.0   # REF des colonnes écrites avant le passage à la somme


def reencoder_avant(state):
    """Au passage à la somme, les colonnes gardées (intensités sur REF_AVANT) passent sur REF :
    v' = min(PLAFOND, ent(v × √(REF_AVANT / REF))). Sans cela, l'encodage publié (REF) décoderait
    24 h de colonnes à la moitié de leur quantité. Arrondi : ± 1 cran, saturation au plafond."""
    k = math.sqrt(REF_AVANT / REF)
    for cells in state.values():
        for key in ("b", "a"):
            cells[key] = {p: min(PLAFOND, int(v * k)) for p, v in cells.get(key, {}).items()}


def noter_agregation(state, col):
    """Premier tour en somme : ré-encode les colonnes d'avant, puis note la minute du changement."""
    if AGREGATION == "somme" and agregation_depuis() is None:
        if REF != REF_AVANT:
            reencoder_avant(state)
        write_atomic(str(col), AGREG_DEPUIS)


def plage(cote):
    """{tranche: v} -> (tranche_basse, [v…]) contigu, ascendant ; 0 = rien au-dessus du seuil.

    Les clés arrivent MÊLÉES : texte pour les colonnes relues de state.json (JSON n'a que
    des clés texte), entier pour la colonne calculée à ce tour. Sans int() ici, min/max
    compareraient des textes ("999" > "1000") et get(p) chercherait un entier parmi des
    textes : des cellules disparaîtraient sans erreur. Côté vide : (None, []).
    """
    n = {}
    for p, v in cote.items():
        p = int(p)
        if v > n.get(p, 0):                   # une tranche lue deux fois : le MAX, comme toute fusion
            n[p] = v
    if not n:
        return None, []
    bas = min(n)
    return bas, [n.get(p, 0) for p in range(bas, max(n) + 1)]


def colonnes(state):
    """[[minute, bid_bas, [v…], ask_bas, [v…]], …], triées par minute ABSOLUE.

    Le texte d'une colonne ne dépend que d'elle : d'une publication à l'autre, seules la tête
    (qui sort de la fenêtre) et la queue (la nouvelle minute) changent, et git pousse un delta
    au lieu du fichier. Une minute sans aucune cellule n'est pas écrite : les deux lecteurs
    la traitaient déjà en « non observée » dans l'ancien format.
    """
    out = []
    for m in sorted(state, key=int):
        bb, bv = plage(state[m].get("b", {}))
        ab, av = plage(state[m].get("a", {}))
        if bv or av:
            out.append([int(m), bb, bv, ab, av])
    return out


def donnees(state, updated, fmt=None):
    """Le contenu publié, sans l'écrire (les tests le comparent d'un format à l'autre)."""
    fmt = fmt or FORMAT
    cols = sorted(int(k) for k in state.keys())
    if not cols:
        return None
    if fmt == ANCIEN:
        bids, asks = [], []
        for c in cols:
            for pb, v in state[str(c)].get("b", {}).items():
                bids.append([c - cols[0], int(pb), v])
            for pb, v in state[str(c)].get("a", {}).items():
                asks.append([c - cols[0], int(pb), v])
        return {
            "updated": updated,
            "sym": "BTCUSDT", "t0": cols[0] * DT, "dt": DT, "dp": DP,
            "encodage": encodage(),
            "bids": bids, "asks": asks,
        }
    cs = colonnes(state)
    return {
        "updated": updated,
        "sym": "BTCUSDT", "t0": (cs[0][0] if cs else cols[0]) * DT, "dt": DT, "dp": DP,
        "format": fmt, "disposition": DISPOSITION,
        "encodage": encodage(),
        "colonnes": cs,
    }


def texte(data):
    """Compact pour colonnes-1 : les espaces de « , » et « : » pesaient 25 % du fichier brut.
    L'ancien format garde l'écriture d'avant (json.dump par défaut) : le retour arrière
    republie exactement ce que les pages lisaient. ASCII dans les deux cas, comme avant."""
    if "colonnes" in data:
        return json.dumps(data, separators=(",", ":"))
    return json.dumps(data)


def publish(state):
    data = donnees(state, datetime.now(timezone.utc).isoformat())
    if data is None:
        return False
    write_atomic(texte(data), OUT)
    git_publish_heatmap(data["updated"])
    if "colonnes" in data:
        n = sum(1 for c in data["colonnes"] for v in c[2] + c[4] if v)
    else:
        n = len(data["bids"]) + len(data["asks"])
    print(f"pushed {n} cells ({data.get('format', ANCIEN)})")
    return True


def main():
    # Cadence (07/10/2026) : LAST_PUSH recevait l'heure de FIN du push, quelques secondes
    # à plus d'une minute après le début du tour. Quinze tours plus tard, l'écart tombait
    # sous PUSH_MIN_S et la publication glissait d'un tour : une toutes les 16 min (commits
    # 12:26, 12:42, 12:58). On horodate donc le DÉBUT du tour qui publie.
    debut = time.time()
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
            if AGREGATION == "somme":
                bins[key][pb] = bins[key].get(pb, 0) + q
            elif q > bins[key].get(pb, 0):
                bins[key][pb] = q
    cells = {"b": {}, "a": {}}
    for key in ("b", "a"):
        for pb, q in bins[key].items():
            v = intensite(q)
            if v >= 1:
                cells[key][pb] = v
    noter_agregation(state, col)    # AVANT d'ajouter la colonne du tour, déjà sur REF
    state[str(col)] = cells
    cutoff = (int(time.time()) - WINDOW_S) // DT
    state = {k: v for k, v in state.items() if int(k) >= cutoff}
    os.makedirs(os.path.dirname(STATE), exist_ok=True)
    dump_atomic(state, STATE)

    try:
        last = float(open(LAST_PUSH).read().strip())
    except Exception:
        last = 0
    if debut - last >= PUSH_MIN_S - MARGE_PUSH_S:
        try:
            publish(state)
        except Exception as e:
            # LAST_PUSH avance MÊME en échec : sans ça, chaque minute produisait un
            # nouveau commit local de 2,3 Mo, et la croissance triplait pendant la panne.
            with open(LAST_PUSH, "w") as f:
                f.write(str(debut))
            print(f"❌ publication échouée : {type(e).__name__}: {e}")
            return 1
        with open(LAST_PUSH, "w") as f:
            f.write(str(debut))
    return 0


if __name__ == "__main__":
    sys.exit(main())
