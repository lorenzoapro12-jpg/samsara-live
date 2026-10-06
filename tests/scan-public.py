#!/usr/bin/env python3
"""Scanne TOUS les fichiers publiés contre les motifs interdits.

Pourquoi ce script en plus des deux harnais
-------------------------------------------
`test_render.js` et `test_live.js` connaissent `index.html` — c'est leur sujet. Mais un
dépôt publie bien d'autres fichiers, et le 02/10/2026 c'est **le `.gitignore` lui-même**
qui décrivait le contexte de travail qu'il était censé empêcher de publier. Un contrôle
qui ne regarde qu'un fichier ne voit pas ce genre de chose.

Ici on interroge git : tout ce qui est SUIVI sera publié. Ni plus, ni moins.

Les motifs viennent de `tests/forbidden.local.json` (gitignoré). Absent, on se rabat sur
l'exemple — le scan tourne alors mais n'attrape rien, et le dit.
"""
import json
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
LOCAL = os.path.join(HERE, "forbidden.local.json")
EXAMPLE = os.path.join(HERE, "forbidden.example.json")

# Un fichier binaire ou trop gros n'est pas lisible « comme du texte » : on le saute en
# le DISANT, plutôt que de laisser croire qu'il a été vérifié.
MAX_BYTES = 4 * 1024 * 1024


def read_terms():
    used = LOCAL if os.path.exists(LOCAL) else EXAMPLE
    with open(used, encoding="utf-8") as f:
        d = json.load(f)
    terms = [t for t in d.get("terms", []) if isinstance(t, str) and t]
    return terms, os.path.basename(used), used == LOCAL


def tracked():
    out = subprocess.run(["git", "-C", REPO, "ls-files"],
                         capture_output=True, text=True, check=True)
    return [l for l in out.stdout.splitlines() if l.strip()]


def main():
    terms, source, is_local = read_terms()
    files = tracked()

    print(f"  motifs  : {len(terms)} ({source}{'' if is_local else ' — EXEMPLE, aucun motif réel'})")
    print(f"  fichiers suivis : {len(files)}")

    compiled = []
    for t in terms:
        try:
            compiled.append((t, re.compile(t, re.I)))
        except re.error as e:
            print(f"  ⚠️  motif invalide « {t} » : {e}")

    # La liste de motifs se contient forcément elle-même : on ne scanne pas l'exemple quand
    # c'est lui qui fournit les motifs (sinon un clone frais échoue toujours sur ce seul
    # fichier). Avec un fichier local, l'exemple est scanné comme les autres.
    if not is_local:
        files = [f for f in files if f != "tests/forbidden.example.json"]

    hits, skipped = [], []
    for rel in files:
        p = os.path.join(REPO, rel)
        if not os.path.exists(p):
            continue
        if os.path.getsize(p) > MAX_BYTES:
            skipped.append((rel, "trop gros"))
            continue
        try:
            text = open(p, encoding="utf-8").read()
        except (UnicodeDecodeError, OSError):
            skipped.append((rel, "binaire"))
            continue
        for term, rx in compiled:
            for m in rx.finditer(text):
                extrait = text[max(0, m.start() - 45):m.end() + 45].replace("\n", " ")
                hits.append((rel, term, extrait))

    print("  ────────────────────────────────────────")
    for rel, term, extrait in hits[:20]:
        print(f"  ✗ {rel}  « {term} »  …{extrait}…")
    for rel, why in skipped:
        print(f"  ⓘ {rel} — non scanné ({why})")

    if hits:
        print(f"\n❌ {len(hits)} occurrence(s) à retirer avant de publier.")
        return 1
    print(f"\n✅ Aucun motif interdit dans les {len(files) - len(skipped)} fichier(s) scanné(s).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
