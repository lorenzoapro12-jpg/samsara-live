#!/usr/bin/env python3
"""Fabrique les polices des thèmes — reproductible, documenté, hors des tests.

    python3 -m venv /tmp/v && /tmp/v/bin/pip install fonttools brotli
    /tmp/v/bin/python fonts/fabriquer.py                       # toutes les polices de POLICES
    /tmp/v/bin/python fonts/fabriquer.py gare-palettes.woff2   # celles-ci seulement (et LISEZMOI.txt)
    /tmp/v/bin/python fonts/fabriquer.py --comparer            # refait tout À CÔTÉ, compare au dépôt
    python3 fonts/fabriquer.py --lisezmoi                      # réécrit LISEZMOI.txt (ni fontTools ni réseau)

Pour chaque police de POLICES (Google Fonts, toutes sous SIL OFL 1.1) :
  1. télécharge la source et sa licence ;
  2. INSTANCIE une police variable si `instance` le demande (fontTools.varLib.instancer) : un axe
     FIGÉ donne une instance statique ({"wght": 700}), une PLAGE garde l'axe sur cet intervalle
     ({"wght": (500, 700)}) — on ne sert que les graisses et chasses que le thème emploie ;
  3. ajoute des glyphes COMPOSÉS (base + diacritique) : « Saṃsāra » s'écrit avec ā / Ā (U+0101 /
     U+0100) et ṃ / Ṃ (U+1E43 / U+1E42), absents de bien des polices — sans eux, le titre
     mélange deux polices. COMPOSES_SAMSARA les ajoute tous ; un glyphe déjà présent n'est jamais
     remplacé ;
  4. sous-ensemble (pyftsubset, woff2, sans hinting) : les `plages` de la police (par défaut
     PLAGES_LATIN), ou, pour une police de TITRE, les seules lettres de `texte` (--text) ;
  5. RENOMME la police si sa licence déclare un nom réservé (Reserved Font Name) : une version
     modifiée ne peut pas le porter (OFL, condition 3) ;
  6. date de fabrication FIXE (head.modified) : `horodatage` s'il est consigné, sinon celle de la
     source. Avant, chaque fabrication y inscrivait l'heure : deux fabrications identiques
     différaient de quelques octets (l'en-tête et sa somme de contrôle). Les cinq polices de Néon
     et de Codex consignent l'heure de leur fabrication du 06/10/2026 : refaites, elles sont
     identiques À L'OCTET aux fichiers du dépôt (--comparer le vérifie).

LISEZMOI.txt est ÉCRIT par ce script, depuis POLICES et les licences : il ne peut pas les
contredire. tests/test_polices.py le vérifie, avec les noms réservés et les @font-face servis.

Ces fichiers ne sont PAS lus par la page au chargement : le navigateur ne télécharge une police
que lorsqu'un texte affiché l'utilise, c'est-à-dire quand son thème est actif.
"""
import os
import re
import subprocess
import sys
import tempfile
import urllib.parse
import urllib.request

ICI = os.path.dirname(os.path.abspath(__file__))
SOURCE = "https://raw.githubusercontent.com/google/fonts/main/ofl/"

# Latin de base, Latin-1, Latin étendu A, ṃ / Ṃ, ponctuation générale, €, flèches, quelques signes
# mathématiques et grecs (γ du GEX), ❦ ❧ ◆ ❖ du Codex. Une police en ajoute avec « , U+…».
PLAGES_LATIN = ("U+0020-007E,U+00A0-00FF,U+0100-017F,U+0131,U+0152-0153,U+02BC,U+02C6,U+02DC,U+1E42-1E43,"
                "U+2000-206F,U+20AC,U+2190-2193,U+2211,U+2212,U+221A,U+2248,U+2264-2265,U+0393,U+0394,"
                "U+03A3,U+03B3,U+03C3,U+2720,U+2766,U+2767,U+25C6,U+2756")
FONCTIONS = "kern,liga,clig,calt,ccmp,locl,mark,mkmk,lnum,tnum,pnum,onum,case,smcp,c2sc"

# « cible=base+marque:position » : Ā ā (macron au-dessus), Ṃ ṃ (point souscrit). Une marque peut
# avoir des REPLIS, « 0323|002E » : la diacritique combinante si la police l'a, sinon le point.
COMPOSES_SAMSARA = ["0100=0041+00AF:haut", "0101=0061+00AF:haut", "1E42=004D+002E:bas", "1E43=006D+002E:bas"]

# Une entrée par fichier servi. Clés : sortie (fonts/…), famille (nom servi, celui des
# @font-face), origine (nom de la police source), theme, dossier et source (Google Fonts, ofl/),
# licence (copie de son OFL.txt) ; facultatives : renommer (chaîne remplacée par `famille` dans la
# table des noms — obligatoire si la licence déclare un nom réservé), instance, composes, plages,
# texte, fonctions, horodatage (head.modified, secondes depuis 1904).
POLICES = [
    dict(sortie="neon-titre.woff2", famille="Samsara Neon Titre", origine="Orbitron", theme="Néon",
         dossier="orbitron", source="Orbitron[wght].ttf", licence="orbitron.OFL.txt",
         renommer="Orbitron", composes=COMPOSES_SAMSARA, horodatage=3874129691),
    dict(sortie="neon-chiffres.woff2", famille="Samsara Neon Chiffres", origine="Share Tech Mono", theme="Néon",
         dossier="sharetechmono", source="ShareTechMono-Regular.ttf", licence="sharetechmono.OFL.txt",
         renommer="Share Tech Mono", horodatage=3874129691),
    dict(sortie="codex-lettrine.woff2", famille="Samsara Codex Lettrine", origine="UnifrakturMaguntia", theme="Codex",
         dossier="unifrakturmaguntia", source="UnifrakturMaguntia-Book.ttf", licence="unifraktur.OFL.txt",
         renommer="UnifrakturMaguntia", composes=["0101=0061+00AF:haut", "1E43=006D+002E:bas"], horodatage=3874129692),
    dict(sortie="cinzel.woff2", famille="Cinzel", origine="Cinzel", theme="Codex",
         dossier="cinzel", source="Cinzel[wght].ttf", licence="cinzel.OFL.txt", horodatage=3874129693),
    dict(sortie="eb-garamond.woff2", famille="EB Garamond", origine="EB Garamond", theme="Codex",
         dossier="ebgaramond", source="EBGaramond[wght].ttf", licence="ebgaramond.OFL.txt", horodatage=3874129694),
    # Cyanotype et Diazo : le lettrage de la planche (chasse fixe : chaque glyphe fait 1232 unités,
    # les chiffres s'alignent en colonne dans le cartouche) ; △ ▲ ▼ pour l'indice de révision.
    # γ (GEX) n'y est pas : repli sur la chasse fixe du système.
    dict(sortie="overpass-mono.woff2", famille="Overpass Mono", origine="Overpass Mono", theme="Cyanotype, Diazo",
         dossier="overpassmono", source="OverpassMono[wght].ttf", licence="overpassmono.OFL.txt",
         instance={"wght": (400, 700)}, composes=COMPOSES_SAMSARA, plages=PLAGES_LATIN + ",U+25B2-25B3,U+25BC"),
    # L'écriture du dessinateur : titres SEULEMENT (h1, cartes, « Détail A », « Vue A », cartouche),
    # jamais un nombre — ses chiffres sont proportionnels.
    dict(sortie="architects-daughter.woff2", famille="Architects Daughter", origine="Architects Daughter",
         theme="Cyanotype, Diazo", dossier="architectsdaughter", source="ArchitectsDaughter-Regular.ttf",
         licence="architectsdaughter.OFL.txt", composes=COMPOSES_SAMSARA),
]


# ─────────────────────────── licences et LISEZMOI (sans fontTools) ───────────────────────────
def noms_reserves(texte_licence):
    """Les noms réservés (Reserved Font Name) que déclare l'en-tête de copyright d'une OFL."""
    tete = texte_licence.split("This Font Software is licensed")[0]
    noms = []
    for m in re.finditer(r"Reserved Font Names?\s*:?\s*([^\n]+)", tete):
        reste = m.group(1)
        cites = re.findall(r"[\"'“‘]([^\"'”’]+)[\"'”’]", reste)
        noms += cites or [re.split(r"[.,;]", reste)[0].strip()]
    return [n for n in noms if n]


def lire_licence(p):
    chemin = os.path.join(ICI, p["licence"])
    return open(chemin, encoding="utf-8").read() if os.path.exists(chemin) else None


def _composes_lisibles(specs):
    return " ".join(chr(int(s.split("=")[0], 16)) for s in specs)


def _instance_lisible(inst):
    return ", ".join(f"{a} {v[0]}–{v[1]}" if isinstance(v, (list, tuple)) else f"{a}={v}" for a, v in inst.items())


def lisezmoi():
    """Le texte de LISEZMOI.txt, dérivé de POLICES et des licences présentes."""
    L = ["Polices des thèmes — toutes sous SIL Open Font License 1.1 (licences jointes).",
         "Ce fichier est ÉCRIT par fonts/fabriquer.py depuis sa table POLICES : ne pas le modifier à la main.",
         "",
         "Ce sont des VERSIONS MODIFIÉES au sens de l'OFL : sous-ensembles (pyftsubset, woff2, sans",
         "hinting), parfois instances d'une police variable, servis depuis ce dépôt et chargés par le",
         "navigateur uniquement quand le thème qui les utilise est actif. Conformément à la clause des",
         "noms réservés (Reserved Font Name), les polices qui en déclarent un ont été RENOMMÉES.",
         ""]
    for p in POLICES:
        lic = lire_licence(p)
        rfn = noms_reserves(lic) if lic is not None else None
        origine = p["origine"] + (" (licence absente)" if rfn is None else
                                  " (nom réservé " + ", ".join("« " + n + " »" for n in rfn) + ")" if rfn else " (aucun nom réservé)")
        L.append(f"  {p['sortie']:<24} « {p['famille']} » ← {origine} — {p['licence']} — thème {p['theme']}")
        details = []
        if p.get("instance"):
            details.append("instance " + _instance_lisible(p["instance"]))
        if p.get("composes"):
            details.append("glyphes composés (là où ils manquent) : " + _composes_lisibles(p["composes"]))
        if p.get("texte"):
            details.append("lettres du titre seulement : « " + p["texte"] + " »")
        elif p.get("plages", PLAGES_LATIN) != PLAGES_LATIN:
            details.append("plages : PLAGES_LATIN" + (" + " + p["plages"][len(PLAGES_LATIN) + 1:] if p["plages"].startswith(PLAGES_LATIN) else " remplacées"))
        if details:
            L.append(" " * 28 + " ; ".join(details))
    L += ["",
          "Glyphes AJOUTÉS par composition (base + diacritique) pour écrire « Saṃsāra » d'une seule",
          "police : ā / Ā (a + macron) et ṃ / Ṃ (m + point souscrit), seulement là où la police ne les a pas.",
          "",
          "Plages conservées par défaut : latin de base, Latin-1, Latin étendu A, ponctuation générale,",
          "flèches, quelques signes mathématiques et grecs ; une police de titre ne garde que ses lettres.",
          "Un glyphe absent retombe sur la police système.",
          "",
          "Tout se refait avec : python3 fonts/fabriquer.py (fonttools, brotli).",
          ""]
    return "\n".join(L)


def ecrire_lisezmoi():
    with open(os.path.join(ICI, "LISEZMOI.txt"), "w", encoding="utf-8") as f:
        f.write(lisezmoi())


# ─────────────────────────── fabrication (fontTools) ───────────────────────────
def instancier(f, axes):
    """Instance d'une police variable : un axe figé (nombre) ou gardé sur une plage (min, max)."""
    from fontTools.varLib import instancer
    limites = {a: (tuple(v) if isinstance(v, (list, tuple)) else v) for a, v in axes.items()}
    return instancer.instantiateVariableFont(f, limites)


def composer(f, specs):
    """« 0101=0061+00AF:haut » : ā = a + macron posé au-dessus ; « :bas » : sous la ligne de base."""
    from fontTools.pens.ttGlyphPen import TTGlyphPen
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
        marques, pos = mp.split(":")
        u, b = int(cible, 16), cmap.get(int(base, 16))
        m = next((cmap[int(x, 16)] for x in marques.split("|") if int(x, 16) in cmap), None)
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


def fabriquer(p, tmp, dest_dir):
    """Télécharge, instancie, compose, découpe, renomme : rend le chemin du woff2 produit."""
    from fontTools.ttLib import TTFont
    brut = os.path.join(tmp, p["source"])
    urllib.request.urlretrieve(SOURCE + p["dossier"] + "/" + urllib.parse.quote(p["source"]), brut)
    urllib.request.urlretrieve(SOURCE + p["dossier"] + "/OFL.txt", os.path.join(dest_dir, p["licence"]))
    # recalcTimestamp=False partout : la date de fabrication est celle de `horodatage` (ou de la
    # source), jamais l'heure de la machine.
    f = TTFont(brut, recalcTimestamp=False)
    if p.get("instance"):
        f = instancier(f, p["instance"])
    composer(f, p.get("composes", []))
    if p.get("horodatage"):
        f["head"].modified = p["horodatage"]
    inter = os.path.join(tmp, "inter-" + p["sortie"] + ".ttf")
    f.save(inter)
    dest = os.path.join(dest_dir, p["sortie"])
    choix = ["--text=" + p["texte"]] if p.get("texte") else ["--unicodes=" + p.get("plages", PLAGES_LATIN)]
    subprocess.run([sys.executable, "-m", "fontTools.subset", inter] + choix
                   + ["--layout-features=" + p.get("fonctions", FONCTIONS), "--flavor=woff2", "--output-file=" + dest,
                      "--no-hinting", "--desubroutinize"], check=True)
    if p.get("renommer"):
        f = TTFont(dest, recalcTimestamp=False)
        renommer(f, p["renommer"], p["famille"])
        f.save(dest)
    return dest


def main(args):
    if "--lisezmoi" in args:
        ecrire_lisezmoi()
        print("  ✓ LISEZMOI.txt réécrit depuis POLICES")
        return 0
    comparer = "--comparer" in args
    demandes = [a for a in args if not a.startswith("--")]
    inconnues = [d for d in demandes if d not in {p["sortie"] for p in POLICES}]
    if inconnues:
        print("  ✗ absentes de POLICES : " + ", ".join(inconnues))
        return 2
    tmp = tempfile.mkdtemp()
    dest_dir = tempfile.mkdtemp() if comparer else ICI
    ko = 0
    for p in POLICES:
        if demandes and p["sortie"] not in demandes:
            continue
        dest = fabriquer(p, tmp, dest_dir)
        taille = os.path.getsize(dest)
        if comparer:
            depot = os.path.join(ICI, p["sortie"])
            meme = os.path.exists(depot) and open(depot, "rb").read() == open(dest, "rb").read()
            lic = open(os.path.join(ICI, p["licence"]), "rb").read() == open(os.path.join(dest_dir, p["licence"]), "rb").read() \
                if os.path.exists(os.path.join(ICI, p["licence"])) else False
            ko += (not meme) + (not lic)
            print(f"  {'✓' if meme else '✗'} {p['sortie']:<24} {taille:>7} octets — "
                  + ("identique à l'octet au dépôt" if meme else "DIFFÉRENT du dépôt") + ("" if lic else " ; licence DIFFÉRENTE"))
        else:
            print(f"  ✓ {p['sortie']:<24} {taille:>7} octets" + (f" — renommée « {p['famille']} »" if p.get("renommer") else ""))
    if not comparer:
        ecrire_lisezmoi()
        print("  ✓ LISEZMOI.txt réécrit depuis POLICES")
    return 1 if ko else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
