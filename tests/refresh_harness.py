#!/usr/bin/env python3
"""Prépare le harnais de rendu : assemble le JavaScript de la page (js/, dans l'ordre d'index.html).

POURQUOI CE SCRIPT EXISTE (10/09/2026, réécrit le 02/10/2026)
------------------------------------------------------------
`test_render.js` n'extrait pas le HTML lui-même : il consomme un fichier JavaScript
isolé. Si on ne le régénère pas, le harnais teste une version PÉRIMÉE du dashboard et
échoue sur des contrôles déjà corrigés — c'est exactement le faux échec observé le
10/09/2026 (« contenu retiré du dashboard » ✗ alors qu'`index.html` n'en avait plus une
seule occurrence : le harnais lisait une copie de travail en retard).

La version du 10/09 lisait une « copie de travail » (`~/samsara-dashboard.html`) et la
resynchronisait depuis la version déployée. Ce détour n'a plus lieu d'être : on extrait
directement du fichier déployé, donc la classe entière de faux échecs disparaît.

USAGE
    python3 tests/refresh_harness.py && node tests/test_render.js
ou, plus simple :
    bash tests/run-all.sh
"""
import os
import re
import sys
import tempfile

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(REPO, "index.html")
JS = os.path.join(tempfile.gettempdir(), "samsara-inline.js")

if not os.path.exists(SRC):
    sys.exit(f"✗ introuvable : {SRC}")

html = open(SRC, encoding="utf-8").read()

# Les scripts de l'application, dans l'ordre où la page les exécute. Depuis que la page est
# découpée en fichiers, le code vit dans js/ : on suit les <script src> d'index.html (même
# règle que tests/sources.js), le code tiers de js/vendor/ excepté — l'app tourne sans lui.
morceaux = []
for attrs, corps in re.findall(r"<script\b([^>]*)>(.*?)</script>", html, re.S):
    m = re.search(r'\bsrc="([^"]+)"', attrs)
    if m:
        if m.group(1).startswith("js/vendor/"):
            continue
        chemin = os.path.join(REPO, m.group(1))
        if not os.path.exists(chemin):
            sys.exit(f"✗ index.html charge {m.group(1)}, introuvable")
        morceaux.append((m.group(1), open(chemin, encoding="utf-8").read()))
    elif corps.strip():
        morceaux.append(("index.html (inline)", corps))
if not morceaux:
    sys.exit(f"✗ aucun script d'application trouvé via {SRC}")

open(JS, "w", encoding="utf-8").write("\n;\n".join(t for _, t in morceaux))
total = sum(len(t) for _, t in morceaux)
print(f"✓ JavaScript assemblé depuis {os.path.relpath(SRC, REPO)} : " + ", ".join(f for f, _ in morceaux))
print(f"✓ {JS} régénéré ({total:,} caractères, {len(morceaux)} fichier(s))")
print(f"  → lancer : node {os.path.join('tests', 'test_render.js')}")
