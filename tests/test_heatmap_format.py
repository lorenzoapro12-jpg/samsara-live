#!/usr/bin/env python3
"""Contrôles HORS LIGNE de la heatmap PUBLIÉE par heatmap.py : format, octets, cadence.

Chaque propriété porte un défaut mesuré le 06/10/2026 :
  · SANS PERTE — « colonnes-1 » porte exactement les cellules de l'ancien format pour le même
    état, y compris quand les clés de tranche arrivent mêlées (texte pour les colonnes relues
    de state.json, entier pour la colonne du tour) : sans normalisation, des cellules
    disparaissaient sans erreur.
  · OCTETS STABLES — une colonne publiée garde le même texte à la publication suivante. C'est
    ce qui permet à git de pousser un delta (≈ 1,5 Kio) au lieu du fichier (≈ 290 Kio).
  · CADENCE — une publication toutes les 15 min, pas 16, quelle que soit la durée du push.

Le décodeur de ce fichier est écrit ICI, d'après la disposition publiée : il ne réutilise
pas le code qui écrit, sinon l'aller-retour se vérifierait lui-même.
"""
import contextlib
import io
import json
import os
import random
import sys
import tempfile
import types

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
sys.path.insert(0, REPO)
import heatmap as H   # noqa: E402  (l'import ne lance rien : main() est gardé)

CHECKS = []


def check(nom, ok, detail=""):
    CHECKS.append(bool(ok))
    print(f"  {'✓' if ok else '✗'} {nom}" + (f" — {detail}" if detail and not ok else ""))


def essai(nom, fn):
    """Un contrôle qui lève est un contrôle en échec, pas un harnais qui s'arrête."""
    try:
        return fn()
    except Exception as e:
        check(nom, False, f"{type(e).__name__}: {e}")
        return None


# ── Décodeurs indépendants ────────────────────────────────────────────────────
def cellules_ancien(d):
    """Ancien format -> {(côté, minute ABSOLUE, tranche): v}."""
    m0 = d["t0"] // d["dt"]
    return {(s, m0 + c, pb): v for s in ("bids", "asks") for c, pb, v in d[s]}


def cellules_colonnes(d):
    """colonnes-1 -> même ensemble, en VÉRIFIANT la disposition déclarée (lève sinon)."""
    out, prec = {}, None
    for col in d["colonnes"]:
        m, bb, bv, ab, av = col                                  # exactement 5 champs
        assert isinstance(m, int) and (prec is None or m > prec), f"minutes non triées ou en double : {prec} puis {m}"
        prec = m
        assert bv or av, f"minute {m} écrite sans aucune cellule"
        for s, bas, vs in (("bids", bb, bv), ("asks", ab, av)):
            if bas is None:
                assert vs == [], f"minute {m} {s} : côté vide écrit autrement que null, []"
                continue
            assert isinstance(bas, int) and vs and vs[0] and vs[-1], f"minute {m} {s} : plage non rognée"
            for i, v in enumerate(vs):
                assert isinstance(v, int) and 0 <= v <= 255, f"minute {m} {s} : valeur {v!r}"
                if v:
                    out[(s, m, bas + i)] = v
    return out


def cellules(d):
    """Les deux formats, comme les pages : `colonnes` est une liste -> nouveau, sinon ancien."""
    return cellules_colonnes(d) if isinstance(d.get("colonnes"), list) else cellules_ancien(d)


def etat_depuis(cells):
    """Cellules -> état tel que relu de state.json (clés texte partout)."""
    st = {}
    for (s, m, pb), v in cells.items():
        st.setdefault(str(m), {"b": {}, "a": {}})["b" if s == "bids" else "a"][str(pb)] = v
    return st


@contextlib.contextmanager
def bac_a_sable(**remplacer):
    """heatmap.py dans un dossier jetable : état, verrou, sortie ; git et réseau remplacés."""
    with tempfile.TemporaryDirectory() as tmp:
        noms = dict(STATE=os.path.join(tmp, "state.json"), LAST_PUSH=os.path.join(tmp, "last-push.txt"),
                    RUN_LOCK=os.path.join(tmp, "run.lock"), OUT=os.path.join(tmp, "heatmap.json"), AGREG_DEPUIS=os.path.join(tmp, "agregation-depuis.txt"),
                    git_publish_heatmap=lambda updated: True)
        noms.update(remplacer)
        avant = {k: getattr(H, k) for k in noms}
        for k, v in noms.items():
            setattr(H, k, v)
        try:
            with contextlib.redirect_stdout(io.StringIO()):
                yield tmp
        finally:
            for k, v in avant.items():
                setattr(H, k, v)


def publier(state):
    """Le texte que publish() écrit RÉELLEMENT sur disque (git remplacé)."""
    with bac_a_sable():
        assert H.publish(state)
        with open(H.OUT) as f:
            return f.read()


# ── 1. Sans perte : la publication du dépôt, convertie ────────────────────────
print("1. Sans perte — heatmap.json du dépôt, rejoué dans les deux formats")
with open(os.path.join(REPO, "heatmap.json")) as f:
    pub = json.load(f)
ref = cellules(pub)                       # lisible quel que soit le format déjà publié
etat = etat_depuis(ref)
anc = H.donnees(etat, pub["updated"], H.ANCIEN)
neu = essai("colonnes-1 construit", lambda: json.loads(publier(etat)))
check("état reconstruit : l'ancien format redonne les cellules publiées", cellules_ancien(anc) == ref)
if neu is not None:
    dec = essai("colonnes-1 décodable selon sa disposition", lambda: cellules_colonnes(neu))
    if dec is not None:
        check(f"mêmes cellules dans les deux formats ({len(ref)} cellules)", dec == ref,
              f"{len(set(dec.items()) ^ set(ref.items()))} différence(s)")
    check("même t0 (début de la première colonne)", neu["t0"] == anc["t0"], (neu["t0"], anc["t0"]))

# ── 2. Sans perte : un état construit à la main ──────────────────────────────
print("2. Sans perte — clés mêlées, côté vide, minute absente, tranche à deux côtés")
SYN = {
    # relue de state.json : clés TEXTE ; "999" > "1000" en texte, pas en nombre ; 1001 sans
    # cellule (trou dans la plage) ; 1002 porte un bid ET un ask (la tranche de l'écart)
    "1000": {"b": {"999": 12, "1000": 40, "1002": 7}, "a": {"1002": 30, "1003": 255}},
    # calculée à ce tour : clés ENTIÈRES ; aucun ask
    "1001": {"b": {998: 5, 1000: 9}, "a": {}},
    # 1002 absente : minute non observée
    "1003": {"b": {}, "a": {"1004": 1}},
    # lue, rien au-dessus du seuil : rien à écrire
    "1004": {"b": {}, "a": {}},
}
ATTENDU = [[1000, 999, [12, 40, 0, 7], 1002, [30, 255]],
           [1001, 998, [5, 0, 9], None, []],
           [1003, None, [], 1004, [1]]]
CELLS = {("bids", 1000, 999): 12, ("bids", 1000, 1000): 40, ("bids", 1000, 1002): 7,
         ("asks", 1000, 1002): 30, ("asks", 1000, 1003): 255,
         ("bids", 1001, 998): 5, ("bids", 1001, 1000): 9, ("asks", 1003, 1004): 1}
cols_syn = essai("colonnes() sur clés mêlées", lambda: H.colonnes(SYN))
check("disposition exacte (plages, 0 dans les trous, null, [] pour un côté vide)", cols_syn == ATTENDU, cols_syn)
syn = essai("colonnes-1 publié sur clés mêlées", lambda: json.loads(publier(SYN)))
if syn is not None:
    check("décodé = cellules attendues, aucune perdue", essai("décodage", lambda: cellules_colonnes(syn)) == CELLS)
    check("ancien format, même état : mêmes cellules", cellules_ancien(H.donnees(SYN, "x", H.ANCIEN)) == CELLS)
    check("t0 = 1000 × dt dans les deux formats", syn["t0"] == H.donnees(SYN, "x", H.ANCIEN)["t0"] == 1000 * H.DT, syn["t0"])

# ── 3. Sans perte : le vrai main(), état relu de state.json + colonne du tour ─
print("3. Sans perte — main() réel : colonnes relues (clés texte) + colonne du tour (clés entières)")


def livre(k):
    """Un carnet simulé, différent à chaque tour : 40 niveaux de chaque côté, autour de 86 000."""
    r = random.Random(k)
    mid = 86000 + 7 * k
    return {"bids": [[f"{mid - 0.5 - 13 * i:.2f}", f"{r.uniform(0.001, 150):.4f}"] for i in range(40)],
            "asks": [[f"{mid + 0.5 + 13 * i:.2f}", f"{r.uniform(0.001, 150):.4f}"] for i in range(40)]}


def tour_main(t, k):
    """Un tour de cron à l'instant t (horloge simulée), carnet k ; état et sortie en place."""
    H.time = types.SimpleNamespace(time=lambda: t)
    H.fetch_depth = lambda: livre(k)
    return H.main()


T0 = 1791205080 + 7                                  # une minute réelle, quelques secondes après :00
temps_reel, fetch_reel = H.time, H.fetch_depth
try:
    with bac_a_sable():
        for k in range(3):                          # le 1er tour publie (pas de LAST_PUSH), les 2 suivants accumulent
            tour_main(T0 + 60 * k, k)
        os.remove(H.LAST_PUSH)                      # force la publication au tour suivant
        tour_main(T0 + 180, 3)
        with open(H.OUT) as f:
            sortie = json.load(f)
        with open(H.STATE) as f:
            relu = json.load(f)                     # le même état, toutes clés en texte
    attendu = cellules_ancien(H.donnees(relu, "x", H.ANCIEN))
    dec = essai("décodage de la sortie de main()", lambda: cellules_colonnes(sortie))
    derniere = (T0 + 180) // H.DT
    check("4 minutes publiées, la colonne du tour comprise",
          [c[0] for c in sortie.get("colonnes", [])] == [derniere - 3, derniere - 2, derniere - 1, derniere])
    check("mêmes cellules que l'ancien format sur l'état relu", dec == attendu and len(attendu) > 100,
          f"{len(dec or {})} contre {len(attendu)}")
finally:
    H.time, H.fetch_depth = temps_reel, fetch_reel

# ── 4. Octets stables d'une publication à l'autre ────────────────────────────
print("4. Octets stables — une minute de plus ne réécrit pas les colonnes déjà publiées")
r = random.Random(7)
A = {}
for m in range(29853000, 29853120):
    lo = 4290 + r.randint(-3, 3)
    A[str(m)] = {"b": {str(lo - i): r.randint(1, 255) for i in range(40)},
                 "a": {str(lo + i): r.randint(1, 255) for i in range(38)}}
B = dict(A, **{"29853120": {"b": {4291: 9, 4289: 17}, "a": {4292: 200}}})   # + la minute du tour : clés ENTIÈRES
C = json.loads(json.dumps(B))                   # relu de state.json au tour suivant : clés TEXTE partout
del C["29853000"]                               # la fenêtre glisse : − la plus ancienne minute
C["29853121"] = {"b": {4290: 3}, "a": {4291: 4}}


def unites(t):
    """(texte de toutes les unités, texte sans la première minute), tels qu'écrits dans t."""
    d = json.loads(t)
    if "colonnes" in d:                                    # colonnes-1 : unité = une colonne
        u, ecrit = d["colonnes"], (lambda x: json.dumps(x, separators=(",", ":"))[1:-1])
        tout, sans_tete = ecrit(u), ecrit(u[1:])
    else:                                                  # ancien : unité = une cellule bid
        u, ecrit = d["bids"], (lambda x: json.dumps(x)[1:-1])
        tout, sans_tete = ecrit(u), ecrit([x for x in u if x[0] >= 1])
    assert tout in t and sans_tete in t, "extraction ≠ texte écrit : contrôle vide"
    return tout, sans_tete


def stable(ta, tb, tc):
    """La propriété qui fait marcher les deltas git : le texte publié pour A se retrouve TEL
    QUEL dans B (+1 min) ; celui de B, moins sa première minute, TEL QUEL dans C (fenêtre
    glissée, et la minute du tour de B relue de state.json)."""
    return unites(ta)[0] in tb and unites(tb)[1] in tc


tA = essai("publication A", lambda: publier(A))
tB = essai("publication B", lambda: publier(B))
tC = essai("publication C", lambda: publier(C))
if tA and tB and tC:
    nom = "colonnes déjà publiées identiques, octet pour octet : +1 min, puis fenêtre glissée et état relu"
    ok = essai(nom, lambda: stable(tA, tB, tC))
    if ok is not None:
        check(nom, ok)
    with bac_a_sable(FORMAT=H.ANCIEN):
        oA, oB, oC = H.texte(H.donnees(A, "x")), H.texte(H.donnees(B, "x")), H.texte(H.donnees(C, "x"))
    nom = "témoin : l'ancien format (index relatif) n'a PAS cette propriété"
    ok = essai(nom, lambda: stable(oA, oB, oC))
    if ok is not None:
        check(nom, not ok)

# ── 5. Le fichier se déclare ─────────────────────────────────────────────────
print("5. Le fichier déclare son format, sa disposition et son encodage")
if tA:
    d = json.loads(tA)
    check("format = colonnes-1 (constante FORMAT)", d.get("format") == H.FORMAT == "colonnes-1", d.get("format"))
    disp = d.get("disposition", "")
    check("disposition : phrase qui nomme chaque champ et chaque convention",
          isinstance(disp, str) and all(m in disp for m in ("minute", "bid_bas", "ask_bas", "dt", "dp", "null, []",
                                                          "ABSOLUE", "0 = rien", "non observée", "t0")), disp)
    check("encodage publié = encodage() (inchangé, la disposition est À CÔTÉ)",
          d.get("encodage") == H.encodage() and "disposition" not in d["encodage"])
    check("en-tête : sym, dt, dp, t0 = première colonne × dt",
          d["sym"] == "BTCUSDT" and d["dt"] == H.DT and d["dp"] == H.DP and d["t0"] == d["colonnes"][0][0] * H.DT)
    check("écrit compact (séparateurs « , » et « : » sans espace)", tA == json.dumps(d, separators=(",", ":")))
    check("ASCII seulement, comme avant (aucun lecteur ne dépend de son encodage de texte)", tA.isascii())
    with bac_a_sable(FORMAT=H.ANCIEN):
        H.publish(A)
        with open(H.OUT) as f:
            ret = f.read()
    check("retour arrière en une ligne (FORMAT = ANCIEN) : l'ancien fichier, mêmes cellules",
          "colonnes" not in json.loads(ret) and ret == json.dumps(H.donnees(A, json.loads(ret)["updated"], H.ANCIEN))
          and cellules_ancien(json.loads(ret)) == cellules_colonnes(d))

# ── 6. Cadence : 15 min, pas 16 ──────────────────────────────────────────────
print("6. Cadence — une publication toutes les 15 min, quelle que soit la durée du push")


def simuler(duree_push, gigue, echec=False, tours=200):
    """main() lancé à chaque minute (horloge simulée). Le push AVANCE l'horloge de duree_push."""
    horloge = [0.0]
    pubs = []

    def git(updated):
        pubs.append(horloge[0])
        horloge[0] += duree_push
        if echec:
            raise RuntimeError("push refusé")
        return True
    with bac_a_sable(git_publish_heatmap=git):
        H.time = types.SimpleNamespace(time=lambda: horloge[0])
        H.fetch_depth = lambda: livre(0)
        try:
            for i in range(tours):
                horloge[0] = T0 + 60 * i + gigue(i)
                H.main()
        finally:
            H.time, H.fetch_depth = temps_reel, fetch_reel
    return [round((b - a) / 60) for a, b in zip(pubs, pubs[1:])]


for nom, duree, gig, ech in (
        ("push de 2 s, démarrage régulier", 2, lambda i: 0.3, False),
        ("push de 45 s (horodaté à la fin, l'écart tombait à 855 s)", 45, lambda i: 0.3, False),
        ("gigue de démarrage (un tour à :00,5, le suivant à :00,2)", 2, lambda i: 0.5 if i % 2 == 0 else 0.2, False),
        ("push en échec : une tentative par intervalle, pas une par minute", 5, lambda i: 0.3, True)):
    iv = simuler(duree, gig, ech)
    check(f"{nom} : intervalles de 15 min", len(iv) >= 12 and set(iv) == {15}, iv)

ko = CHECKS.count(False)
print(f"\n{'✅ HEATMAP PUBLIÉE : TOUS LES CONTRÔLES PASSENT' if not ko else f'❌ {ko} contrôle(s) en échec'}")
sys.exit(1 if ko else 0)
