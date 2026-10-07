#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""test_polices.py — les polices servies, leur licence et leur registre, vérifiés par du code.

POURQUOI
--------
Une police servie depuis fonts/ est une VERSION MODIFIÉE au sens de l'OFL (sous-ensemble,
instance, glyphes composés) : la licence l'accompagne, et un nom réservé (Reserved Font Name)
interdit de garder ce nom (condition 3). Ces règles vivaient dans un LISEZMOI écrit à la main :
la prochaine police ajoutée l'aurait laissé mentir. Ici, la table POLICES de fonts/fabriquer.py
est la seule source, et ce harnais la confronte à ce qui est réellement servi :

1. chaque fonts/*.woff2 est déclaré dans POLICES, et chaque police déclarée existe ;
2. chaque licence est jointe ; un nom réservé déclaré par la licence ⇒ la police est renommée,
   et son nom servi ne le contient pas ;
3. LISEZMOI.txt est exactement celui que fabriquer.py écrit (python3 fonts/fabriquer.py --lisezmoi) ;
4. chaque @font-face servi pointe vers une police déclarée, sous le nom que POLICES lui donne ;
5. (avec fontTools) dans le fichier lui-même : aucun nom réservé dans les noms de famille,
   glyphes composés présents, instance statique sans table fvar, plage d'axe respectée, aucun
   chiffre dans une police déclarée sans chiffres (PLAGES_LATIN_SANS_CHIFFRES).

Sans réseau ; les contrôles 1 à 4 sans fontTools.
USAGE
    python3 tests/test_polices.py     # code de sortie 0 = tout tient
"""
import importlib.util
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
FONTS = REPO / "fonts"
ko = 0
lignes = []


def ok(lib, det=""):
    lignes.append(f"  ✓ {lib:<58} {det}")


def echec(lib, det=""):
    global ko
    ko = 1
    lignes.append(f"  ✗ {lib:<58} {det}")


def titre(t):
    lignes.append("")
    lignes.append(f"── {t} ──")


_spec = importlib.util.spec_from_file_location("fabriquer", FONTS / "fabriquer.py")
fab = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(fab)          # sans fontTools : il n'est importé qu'à la fabrication
POLICES = fab.POLICES
PAR_SORTIE = {p["sortie"]: p for p in POLICES}

titre("1. Registre : fonts/*.woff2 ⇔ POLICES (fonts/fabriquer.py)")
servies = sorted(f.name for f in FONTS.glob("*.woff2"))
orphelines = [f for f in servies if f not in PAR_SORTIE]
absentes = [p["sortie"] for p in POLICES if not (FONTS / p["sortie"]).exists()]
(echec if orphelines else ok)(f"{len(servies)} fichiers woff2, tous déclarés", ", ".join(orphelines))
(echec if absentes else ok)(f"{len(POLICES)} polices déclarées, toutes présentes", ", ".join(absentes))
doublons = sorted({p["sortie"] for p in POLICES if sum(q["sortie"] == p["sortie"] for q in POLICES) > 1})
(echec if doublons else ok)("aucune sortie déclarée deux fois", ", ".join(doublons))
CLES = ("sortie", "famille", "origine", "theme", "dossier", "source", "licence")
incompletes = [p.get("sortie", "?") + " : " + ", ".join(k for k in CLES if not p.get(k)) for p in POLICES if not all(p.get(k) for k in CLES)]
(echec if incompletes else ok)("chaque entrée : sortie, famille, origine, thème, source, licence", " | ".join(incompletes))

titre("2. Licences jointes, noms réservés respectés (OFL, condition 3)")
for p in POLICES:
    lic = fab.lire_licence(p)
    if lic is None:
        echec(f"{p['sortie']} · licence {p['licence']}", "ABSENTE de fonts/")
        continue
    if "SIL Open Font License" not in lic:
        echec(f"{p['sortie']} · licence {p['licence']}", "ce n'est pas une OFL")
        continue
    rfn = fab.noms_reserves(lic)
    if not rfn:
        ok(f"{p['sortie']} · {p['licence']}", "OFL, aucun nom réservé")
        continue
    pb = []
    if not p.get("renommer"):
        pb.append("nom réservé mais police NON renommée (clé renommer)")
    pb += [f"le nom servi « {p['famille']} » contient « {n} »" for n in rfn if n.lower() in p["famille"].lower()]
    (echec if pb else ok)(f"{p['sortie']} · {p['licence']}", "; ".join(pb) or "nom réservé " + ", ".join("« " + n + " »" for n in rfn)
                          + f" → servie sous « {p['famille']} »")

titre("3. LISEZMOI.txt écrit par fabriquer.py, jamais à la main")
actuel = (FONTS / "LISEZMOI.txt").read_text(encoding="utf-8") if (FONTS / "LISEZMOI.txt").exists() else ""
attendu = fab.lisezmoi()
if actuel == attendu:
    ok("LISEZMOI.txt = fabriquer.lisezmoi()", f"{len(POLICES)} polices")
else:
    a, b = actuel.splitlines(), attendu.splitlines()
    i = next((k for k in range(max(len(a), len(b))) if (a[k:k + 1] or [""])[0] != (b[k:k + 1] or [""])[0]), 0)
    echec("LISEZMOI.txt = fabriquer.lisezmoi()", f"diffère ligne {i + 1} — python3 fonts/fabriquer.py --lisezmoi")

titre("4. @font-face servis : une police déclarée, sous son nom")
html = (REPO / "index.html").read_text(encoding="utf-8")
feuilles = sorted(set(re.findall(r'href="((?:css|themes)/[^"]+\.css)"', html)) | {f"css/{f.name}" for f in (REPO / "css").glob("*.css")})
n = 0
for f in feuilles:
    css = re.sub(r"/\*.*?\*/", "", (REPO / f).read_text(encoding="utf-8"), flags=re.S)
    for bloc in re.findall(r"@font-face\s*\{([^}]*)\}", css):
        n += 1
        fam = re.search(r"font-family\s*:\s*['\"]?([^;'\"]+)", bloc)
        urls = re.findall(r"url\(\s*['\"]?([^'\")]+)", bloc)
        fichiers = [u.split("/")[-1] for u in urls]
        pb = [u for u in urls if not re.match(r"(\.\./)?fonts/[^/]+\.woff2$", u)]
        pb += [x + " non déclaré" for x in fichiers if x not in PAR_SORTIE]
        pb += [f"famille « {fam.group(1).strip() if fam else '?'} » ≠ « {PAR_SORTIE[x]['famille']} »" for x in fichiers
               if x in PAR_SORTIE and (not fam or fam.group(1).strip() != PAR_SORTIE[x]["famille"])]
        (echec if pb or not urls else ok)(f"{f} · « {fam.group(1).strip() if fam else '?'} »", "; ".join(pb) or ", ".join(fichiers))
if not n:
    ok("aucun @font-face servi", "")

titre("5. Dans les fichiers (fontTools)")
try:
    from fontTools.ttLib import TTFont
except ImportError:
    TTFont = None
    lignes.append("  ⓘ NON EXÉCUTÉ : fontTools absent (python3 -m venv v && v/bin/pip install fonttools brotli)")
if TTFont:
    for p in POLICES:
        chemin = FONTS / p["sortie"]
        if not chemin.exists():
            continue
        f = TTFont(str(chemin))
        cmap = f.getBestCmap()
        noms = {r.nameID: r.toUnicode() for r in f["name"].names if r.nameID in (1, 4, 6, 16, 21)}
        lic = fab.lire_licence(p) or ""
        pb = [f"nom {i} « {v} » contient « {r} »" for r in fab.noms_reserves(lic) for i, v in noms.items()
              if r.lower().replace(" ", "") in v.lower().replace(" ", "")]
        pb += [f"glyphe composé U+{s.split('=')[0]} absent" for s in p.get("composes", []) if int(s.split("=")[0], 16) not in cmap]
        # Police de titre déclarée SANS chiffres : aucun ne doit y rester (ils viennent de la police système).
        if p.get("plages") == fab.PLAGES_LATIN_SANS_CHIFFRES:
            pb += [f"chiffre « {chr(u)} » présent (police déclarée sans chiffres)" for u in range(0x30, 0x3A) if u in cmap]
        inst = p.get("instance") or {}
        if inst:
            axes = {a.axisTag: (a.minValue, a.maxValue) for a in f["fvar"].axes} if "fvar" in f else {}
            for a, v in inst.items():
                if isinstance(v, (list, tuple)):
                    if axes.get(a) != (float(v[0]), float(v[1])):
                        pb.append(f"axe {a} : {axes.get(a)} au lieu de {tuple(v)}")
                elif a in axes:
                    pb.append(f"axe {a} non figé à {v}")
        (echec if pb else ok)(f"{p['sortie']}", "; ".join(pb) or f"{len(cmap)} caractères, nom servi « {noms.get(16, noms.get(1))} »")

lignes.append("")
lignes.append("═" * 52)
lignes.append("✅ POLICES : TOUS LES CONTRÔLES PASSENT" if not ko else "❌ AU MOINS UN CONTRÔLE DES POLICES A ÉCHOUÉ")
print("\n".join(lignes))
sys.exit(ko)
