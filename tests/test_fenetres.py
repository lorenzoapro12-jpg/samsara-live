#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""test_fenetres.py — la structure « fenetres » (Bureau 95 et son jumeau), vérifiée hors ligne.

POURQUOI
--------
Bureau 95 a un JUMEAU, bureau95-contraste : la même page, au contraste près. Le contrat veut que
chaque feuille de thème ne règle que sous son propre sélecteur ; les mêmes règles sont donc
écrites deux fois, et deux copies divergent à la première retouche d'une seule. Ce harnais exige
qu'elles ne diffèrent QUE par la valeur de leurs jetons. Et ce thème pose du texte sur des fonds
que tests/test_palette.py ne connaît pas : barres de titre, article de menu survolé, champs
blancs, tramé de la tâche active, volet d'âge en retard, bulle d'explication.

1. JUMEAUX — toutes les feuilles des thèmes déclarés data-structure="fenetres" sont identiques,
   commentaires et bloc de jetons ôtés, sélecteur de thème normalisé (règles, @media, @font-face,
   ordre compris) ; leurs blocs de jetons déclarent les MÊMES noms. Une différence entre jumeaux
   ne peut passer que par la valeur d'un jeton.
2. CONTRASTES PROPRES — chaque couple texte / fond de la structure, sur CHAQUE borne du fond
   (dégradé, tramé), en WCAG 2.1 (AA texte ≥ 4,5:1).

USAGE
    python3 tests/test_fenetres.py     # code de sortie 0 = tout tient
"""
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from theme_css import REPO, themes_declares, sans_commentaires, declarations, tous_jetons, resout, couleur, compose

STRUCTURE = "fenetres"
SEUIL_AA_TEXTE = 4.5
# (encre, fond, où ce texte se lit)
COUPLES = [
    ("--titre-ink", "--titre-actif", "barre de titre active"),
    ("--titre-ink", "--titre-inactif", "barre de titre inactive"),
    ("--surbrillance-ink", "--surbrillance", "article de menu survolé"),
    ("--ink-1", "--champ", "valeur dans un champ (prix, tuiles)"),
    ("--up-ink", "--champ", "hausse dans un champ (variation)"),
    ("--down-ink", "--champ", "baisse dans un champ (variation)"),
    ("--ink-3", "--champ", "libellé dans une tuile"),
    ("--ink-1", "--surface", "texte des fenêtres"),
    ("--ink-3", "--surface", "libellé de la barre d'état"),
    ("--accent", "--surface", "icônes des cartes, liens"),
    ("--warn-ink", "--warn-soft", "âge d'une publication en retard"),
    ("--ink-1", "--trame-95", "tâche active (tramé)"),
    ("--ink-1", "--bulle", "explication (bulle)"),
]

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


def luminance(rgb):
    lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb]
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2]


def contraste(a, b):
    la, lb = sorted((luminance(a), luminance(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


def bloc_jetons(css, scope):
    """(texte du bloc de jetons `scope { … }`, feuille sans ce bloc)."""
    m = re.search(re.escape(scope) + r"\s*\{", css)
    if not m:
        return "", css
    fin = css.index("}", m.end())
    return css[m.end():fin], css[:m.start()] + css[fin + 1:]


THEMES = [t for t in themes_declares() if t.get("structure") == STRUCTURE]
titre(f"1. Jumeaux de la structure « {STRUCTURE} » : mêmes règles, seuls les jetons diffèrent")
if len(THEMES) < 2:
    echec(f"au moins deux thèmes « {STRUCTURE} »", ", ".join(t["id"] for t in THEMES) or "aucun")
feuilles = {}
for t in THEMES:
    scope = f'[data-theme="{t["id"]}"]'
    jetons, reste = bloc_jetons(sans_commentaires((REPO / t["href"]).read_text(encoding="utf-8")), scope)
    feuilles[t["id"]] = (set(declarations(jetons)), " ".join(reste.replace(scope, "[THEME]").split()))
if THEMES:
    ref = THEMES[0]["id"]
    noms_ref, regles_ref = feuilles[ref]
    for t in THEMES[1:]:
        noms, regles = feuilles[t["id"]]
        if regles == regles_ref:
            ok(f"{t['id']} = {ref} hors jetons", f"{len(regles)} caractères de règles identiques")
        else:
            k = next(i for i in range(min(len(regles), len(regles_ref)) + 1) if regles[i:i + 1] != regles_ref[i:i + 1])
            echec(f"{t['id']} = {ref} hors jetons", f"diverge au caractère {k} : « …{regles_ref[max(0, k - 50):k + 30]}… » ≠ « …{regles[max(0, k - 50):k + 30]}… »")
        manque, en_trop = sorted(noms_ref - noms), sorted(noms - noms_ref)
        (echec if manque or en_trop else ok)(f"{t['id']} · mêmes noms de jetons que {ref}",
                                            (f"manquent : {', '.join(manque)} " if manque else "") + (f"en trop : {', '.join(en_trop)}" if en_trop else "")
                                            or f"{len(noms)} jetons")

titre("2. Contrastes propres à la structure : texte sur chaque borne de son fond (AA ≥ 4,5:1)")
for t in THEMES:
    J = tous_jetons(t)
    fond_carte = couleur(resout(J, J["--card-solid"]))[:3]
    for encre, fond, ou in COUPLES:
        try:
            e = couleur(resout(J, J[encre]))
            e = compose(e, fond_carte) if e[3] < 1 else e[:3]
            valeur = resout(J, J[fond])
        except (KeyError, ValueError) as err:
            echec(f"{t['id']} · {encre} sur {fond}", f"illisible : {err}")
            continue
        bornes = re.findall(r"#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)", valeur)
        if not bornes:
            echec(f"{t['id']} · {encre} sur {fond}", f"aucune couleur dans {valeur[:40]}")
            continue
        cs = [couleur(b) for b in bornes]
        pire = min(contraste(e, compose(c, fond_carte) if c[3] < 1 else c[:3]) for c in cs)
        (ok if pire >= SEUIL_AA_TEXTE else echec)(f"{t['id']} · {ou}", f"{encre} sur {fond} : {pire:.2f}:1 ({len(bornes)} borne(s))")

lignes.append("")
lignes.append("═" * 52)
lignes.append(f"✅ FENÊTRES : TOUS LES CONTRÔLES PASSENT ({len(THEMES)} thème(s))" if not ko
              else "❌ AU MOINS UN CONTRÔLE DES FENÊTRES A ÉCHOUÉ")
print("\n".join(lignes))
sys.exit(ko)
