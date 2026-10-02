#!/usr/bin/env python3
"""Prépare le harnais de rendu : extrait le JavaScript inline de index.html.

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

# On exclut les <script src=…> : seuls les blocs inline portent la logique.
blocks = re.findall(r"<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>", html, re.S)
if not blocks:
    sys.exit(f"✗ aucun <script> inline trouvé dans {SRC}")

blocks.sort(key=len, reverse=True)
open(JS, "w", encoding="utf-8").write(blocks[0])

print(f"✓ JavaScript extrait de {os.path.relpath(SRC, REPO)}")
print(f"✓ {JS} régénéré ({len(blocks[0]):,} caractères, {len(blocks)} bloc(s) inline)")
print(f"  → lancer : node {os.path.join('tests', 'test_render.js')}")
