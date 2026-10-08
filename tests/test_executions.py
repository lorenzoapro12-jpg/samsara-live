#!/usr/bin/env python3
"""Contrôles HORS LIGNE d'executions.py (08/10/2026) : seaux, sens achat / vente, volumes
conservés, fenêtre de 24 h, reprise après arrêt, trou publié quand le retard dépasse la fenêtre.

Le décodeur est écrit ICI d'après la disposition publiée, pas repris du code qui écrit."""
import os
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
os.environ["SAMSARA_CONFIG"] = os.path.join(tempfile.mkdtemp(), "absent.json")
import executions as X   # noqa: E402  (l'import ne lance rien : main() est gardé)

CHECKS = []


def check(nom, ok, detail=""):
    CHECKS.append(bool(ok))
    print(f"  {'✓' if ok else '✗'} {nom}" + (f" — {detail}" if detail and not ok else ""))


def decoder(d):
    """seaux-1 -> {(n, tranche, 'achat' | 'vente'): BTC}."""
    out, prec = {}, None
    for n, bas, ach, ven in d["seaux"]:
        assert prec is None or n > prec
        prec = n
        assert len(ach) == len(ven)
        for i, (a, v) in enumerate(zip(ach, ven)):
            if a:
                out[(n, bas + i, "achat")] = a * d["unite_btc"]
            if v:
                out[(n, bas + i, "vente")] = v * d["unite_btc"]
    return out


T0 = 1_791_400_000          # secondes, multiple de 10
trades = [
    {"a": 1, "p": "83005.10", "q": "0.250", "T": (T0 + 1) * 1000, "m": False},
    {"a": 2, "p": "83009.99", "q": "0.125", "T": (T0 + 9) * 1000 + 999, "m": False},   # même seau, même tranche
    {"a": 3, "p": "83010.00", "q": "1.000", "T": (T0 + 9) * 1000, "m": True},          # tranche suivante, vente
    {"a": 4, "p": "82990.00", "q": "0.500", "T": (T0 + 10) * 1000, "m": True},         # seau suivant
]

print("1. Seaux et sens")
s = X.etat_vide()
X.verser(s, trades)
d = X.donnees(s, "x")
c = decoder(d)
n0 = T0 // X.DT
check("deux achats d'un même seau et d'une même tranche : additionnés",
      abs(c.get((n0, 8300, "achat"), 0) - 0.375) < 1e-9, c)
check("m = true : vente au marché", abs(c.get((n0, 8301, "vente"), 0) - 1.0) < 1e-9, c)
check("un trade à la frontière du seau va dans le seau suivant", abs(c.get((n0 + 1, 8299, "vente"), 0) - 0.5) < 1e-9, c)
check("volume total conservé (à l'unité près)", abs(sum(c.values()) - 1.875) < 1e-9, sum(c.values()))
check("dernier identifiant noté", s["dernier_id"] == 4, s["dernier_id"])
check("format et disposition publiés", d["format"] == "seaux-1" and "achats" in d["disposition"] and d["dt"] == X.DT)

print("2. Fenêtre et reprise")
X.purger(s, T0 + X.WINDOW_S + 10)
check("purge : un seau entièrement sorti de la fenêtre s'en va, le suivant reste",
      list(s["seaux"]) == [str(n0 + 1)], list(s["seaux"]))
s2 = {"seaux": {}, "dernier_id": 41, "lu_depuis": T0, "lu_jusqua": T0 + 100, "trous": []}
check("reprise dans la fenêtre : au dernier identifiant + 1, sans trou",
      X.demarrer(s2, T0 + 3600) == 42 and s2["trous"] == [], s2)
X.lire = lambda url: [{"a": 900, "T": 0}]
s3 = {"seaux": {}, "dernier_id": 41, "lu_depuis": T0, "lu_jusqua": T0 + 100, "trous": []}
p = X.demarrer(s3, T0 + 100 + X.WINDOW_S + 600)
check("retard plus vieux que la fenêtre : repart du début de la fenêtre, et l'intervalle sauté est un TROU publié",
      p == 900 and s3["trous"] == [[T0 + 100, T0 + 700]], (p, s3["trous"]))

print("3. Lecture d'une page")
X.lire = lambda url: trades[:2]
s4 = X.etat_vide()
nxt, plein = X.tour(s4, 1)
check("page incomplète : tout est lu jusqu'à l'envoi, prochain = dernier + 1", nxt == 3 and not plein and s4["lu_jusqua"] is not None)

ok = all(CHECKS)
print(f"\n{'✅ EXÉCUTIONS : TOUS LES CONTRÔLES PASSENT' if ok else '❌ EXÉCUTIONS : ' + str(CHECKS.count(False)) + ' contrôle(s) en échec'}")
sys.exit(0 if ok else 1)
