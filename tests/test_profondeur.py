#!/usr/bin/env python3
"""Contrôles HORS LIGNE de profondeur.py (08/10/2026) : somme par tranche, bande ±10 %, une
colonne par pas de 5 min, fenêtre de 24 h, format « colonnes-1 » décodé ici, pas par le code."""
import json
import os
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
tmp = tempfile.mkdtemp()
with open(os.path.join(tmp, "c.json"), "w") as f:
    json.dump({"state_dir": tmp, "out_dir": tmp}, f)
os.environ["SAMSARA_CONFIG"] = os.path.join(tmp, "c.json")
import profondeur as P   # noqa: E402

CHECKS = []


def check(nom, ok, detail=""):
    CHECKS.append(bool(ok))
    print(f"  {'✓' if ok else '✗'} {nom}" + (f" — {detail}" if detail and not ok else ""))


livre = {"bids": [["100000.00", "1.0"], ["99950.00", "3.0"], ["99901.00", "4.0"], ["80000.00", "999"]],
         "asks": [["100001.00", "2.0"], ["100099.99", "6.0"], ["125000.00", "999"]]}
c = P.colonne(livre)
check("somme par tranche de 100 $ : 3 + 4 BTC à 99 900–100 000 $", c["b"]["999"] == P.intensite(7.0), c)
check("bande ±10 % : un niveau à −20 % est ignoré", "800" not in c["b"] and "1250" not in c["a"], c)
check("ask : 2 + 6 BTC dans la tranche 100 000–100 100 $", c["a"]["1000"] == P.intensite(8.0), c)

T = 1_791_400_200
n = []
for k, t in enumerate((T, T + 60, T + 300, T + 600)):
    n.append(P.tour(t, lambda: livre))
check("une colonne par pas de 5 min : la lecture d'une minute plus tard est sautée", n == [True, False, True, True], n)
d = json.load(open(P.OUT))
check("format colonnes-1, encodage propre déclaré", d["format"] == "colonnes-1" and d["encodage"]["echelle"].startswith("propre") and d["dt"] == 300)
check("colonnes triées, minutes absolues", [x[0] for x in d["colonnes"]] == [T // 300, T // 300 + 1, T // 300 + 2])
P.tour(T + 24 * 3600 + 600, lambda: livre)
d = json.load(open(P.OUT))
check("fenêtre de 24 h : les colonnes plus anciennes sortent", d["colonnes"][0][0] >= (T + 600) // 300, d["colonnes"][0][0])

ok = all(CHECKS)
print(f"\n{'✅ PROFONDEUR : TOUS LES CONTRÔLES PASSENT' if ok else '❌ PROFONDEUR : ' + str(CHECKS.count(False)) + ' contrôle(s) en échec'}")
sys.exit(0 if ok else 1)
