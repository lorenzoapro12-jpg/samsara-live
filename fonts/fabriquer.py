#!/usr/bin/env python3
"""Fabrique les polices des thèmes Néon et Codex — reproductible, documenté, hors des tests.

    python3 -m venv /tmp/v && /tmp/v/bin/pip install fonttools brotli
    /tmp/v/bin/python fonts/fabriquer.py

Pour chaque police (Google Fonts, toutes sous SIL OFL 1.1) :
  1. télécharge la source et sa licence ;
  2. ajoute, si besoin, des glyphes COMPOSÉS (base + diacritique) : « Saṃsāra » s'écrit avec
     ā (U+0101) et ṃ (U+1E43), absents d'Orbitron et d'UnifrakturMaguntia — sans eux, le
     titre mélangeait deux polices ;
  3. sous-ensemble latin + ponctuation + quelques signes (pyftsubset, woff2, sans hinting) ;
  4. RENOMME la police si sa licence déclare un nom réservé (Reserved Font Name) : une version
     modifiée ne peut pas le porter (OFL, condition 3).

Ces fichiers ne sont PAS lus par la page au chargement : le navigateur ne télécharge une
police que lorsqu'un texte affiché l'utilise, c'est-à-dire quand son thème est actif.
"""
import os
import subprocess
import sys
import tempfile
import urllib.request

from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont

ICI = os.path.dirname(os.path.abspath(__file__))
SOURCE = "https://raw.githubusercontent.com/google/fonts/main/ofl/"
PLAGES = ("U+0020-007E,U+00A0-00FF,U+0100-017F,U+0131,U+0152-0153,U+02BC,U+02C6,U+02DC,U+1E42-1E43,"
          "U+2000-206F,U+20AC,U+2190-2193,U+2211,U+2212,U+221A,U+2248,U+2264-2265,U+0393,U+0394,"
          "U+03A3,U+03B3,U+03C3,U+2720,U+2766,U+2767,U+25C6,U+2756")
FONCTIONS = "kern,liga,clig,calt,ccmp,locl,mark,mkmk,lnum,tnum,pnum,onum,case,smcp,c2sc"

# (dossier Google Fonts, fichier source, fichier produit, licence, nom réservé, nouveau nom, composés)
POLICES = [
    ("orbitron", "Orbitron%5Bwght%5D.ttf", "neon-titre.woff2", "orbitron.OFL.txt",
     "Orbitron", "Samsara Neon Titre",
     ["0100=0041+00AF:haut", "0101=0061+00AF:haut", "1E42=004D+002E:bas", "1E43=006D+002E:bas"]),
    ("sharetechmono", "ShareTechMono-Regular.ttf", "neon-chiffres.woff2", "sharetechmono.OFL.txt",
     "Share Tech Mono", "Samsara Neon Chiffres", []),
    ("unifrakturmaguntia", "UnifrakturMaguntia-Book.ttf", "codex-lettrine.woff2", "unifraktur.OFL.txt",
     "UnifrakturMaguntia", "Samsara Codex Lettrine", ["0101=0061+00AF:haut", "1E43=006D+002E:bas"]),
    ("cinzel", "Cinzel%5Bwght%5D.ttf", "cinzel.woff2", "cinzel.OFL.txt", None, None, []),
    ("ebgaramond", "EBGaramond%5Bwght%5D.ttf", "eb-garamond.woff2", "ebgaramond.OFL.txt", None, None, []),
]


def composer(f, specs):
    """« 0101=0061+00AF:haut » : ā = a + macron posé au-dessus ; « :bas » : sous la ligne de base."""
    glyf, hmtx, cmap = f["glyf"], f["hmtx"], f.getBestCmap()
    if specs and "HVAR" in f:
        # Police variable : la table HVAR (variations des chasses) est indexée par glyphe ;
        # ajouter des glyphes la désynchronise. Elle est FACULTATIVE (les chasses se déduisent
        # alors de gvar) : on la retire. Les glyphes composés gardent la chasse de leur base.
        del f["HVAR"]

    def boite(g):
        gl = glyf[g]
        if not hasattr(gl, "xMin"):
            gl.recalcBounds(glyf)
        return gl.xMin, gl.yMin, gl.xMax, gl.yMax

    for spec in specs:
        cible, reste = spec.split("=")
        base, mp = reste.split("+")
        marque, pos = mp.split(":")
        u, b, m = int(cible, 16), cmap.get(int(base, 16)), cmap.get(int(marque, 16))
        if u in cmap or not b or not m:
            continue
        bx0, by0, bx1, by1 = boite(b)
        mx0, my0, mx1, my1 = boite(m)
        ecart = round((by1 - by0) * 0.08)
        dx = round((bx0 + bx1) / 2 - (mx0 + mx1) / 2)
        dy = round(by1 + ecart - my0) if pos == "haut" else round(-ecart - my1)
        pen = TTGlyphPen(f.getGlyphSet())
        pen.addComponent(b, (1, 0, 0, 1, 0, 0))
        pen.addComponent(m, (1, 0, 0, 1, dx, dy))
        nom = f"uni{u:04X}"
        glyf.glyphs[nom] = pen.glyph()
        hmtx.metrics[nom] = hmtx.metrics[b]
        f.setGlyphOrder(f.getGlyphOrder() + [nom])
        if "gvar" in f:
            f["gvar"].variations[nom] = []
        for t in f["cmap"].tables:
            if t.isUnicode():
                t.cmap[u] = nom


def renommer(f, ancien, neuf):
    for rec in f["name"].names:
        try:
            s = rec.toUnicode()
        except Exception:
            continue
        t = s.replace(ancien, neuf).replace(ancien.replace(" ", ""), neuf.replace(" ", ""))
        if t != s:
            rec.string = t


def main():
    tmp = tempfile.mkdtemp()
    for dossier, src, sortie, licence, reserve, nouveau, composes in POLICES:
        brut = os.path.join(tmp, src.replace("%5B", "[").replace("%5D", "]"))
        urllib.request.urlretrieve(SOURCE + dossier + "/" + src, brut)
        urllib.request.urlretrieve(SOURCE + dossier + "/OFL.txt", os.path.join(ICI, licence))
        f = TTFont(brut)
        composer(f, composes)
        inter = os.path.join(tmp, "inter-" + sortie + ".ttf")
        f.save(inter)
        dest = os.path.join(ICI, sortie)
        subprocess.run([sys.executable, "-m", "fontTools.subset", inter, "--unicodes=" + PLAGES,
                        "--layout-features=" + FONCTIONS, "--flavor=woff2", "--output-file=" + dest,
                        "--no-hinting", "--desubroutinize"], check=True)
        if reserve:
            f = TTFont(dest)
            renommer(f, reserve, nouveau)
            f.save(dest)
        print(f"  ✓ {sortie:<24} {os.path.getsize(dest):>7} octets" + (f" — renommée « {nouveau} »" if reserve else ""))


if __name__ == "__main__":
    main()
