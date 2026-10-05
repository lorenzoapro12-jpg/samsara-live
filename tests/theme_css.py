# -*- coding: utf-8 -*-
"""Lecture des thèmes, partagée par test_palette.py et test_contrat.py.

Le registre des thèmes, ce sont les <link data-theme-id> d'index.html (la même source que
js/app.js). Un thème = un fichier themes/<id>.css dont les jetons vivent sous le sélecteur
[data-theme="<id>"] ; les valeurs par défaut sont dans le bloc :root de css/app.css.
"""
import re
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
PAGE = REPO / "index.html"


def sans_commentaires(css):
    return re.sub(r"/\*.*?\*/", "", css, flags=re.S)


def attributs(balise):
    return dict(re.findall(r'([\w-]+)="([^"]*)"', balise))


def themes_declares():
    """[{id, nom, mode, verre, paire, href}] dans l'ordre d'index.html."""
    html = PAGE.read_text(encoding="utf-8")
    out = []
    for balise in re.findall(r"<link\b[^>]*\bdata-theme-id=[^>]*>", html):
        a = attributs(balise)
        out.append({"id": a.get("data-theme-id"), "nom": a.get("data-nom"), "mode": a.get("data-mode"),
                    "verre": a.get("data-verre"), "paire": a.get("data-paire"), "href": a.get("href")})
    return out


def regles(css):
    """[(sélecteur, corps)] des règles de premier niveau ET de celles imbriquées dans un @media."""
    css = sans_commentaires(css)
    out, i, n = [], 0, len(css)
    pile = []
    debut_sel = 0
    while i < n:
        c = css[i]
        if c == "{":
            sel = css[debut_sel:i].strip()
            if sel.startswith("@"):
                pile.append(("@", sel))
                debut_sel = i + 1
            else:
                j = css.index("}", i)
                out.append((sel, css[i + 1:j]))
                i = j
                debut_sel = j + 1
        elif c == "}":
            if pile:
                pile.pop()
            debut_sel = i + 1
        elif c == ";" and not pile:
            debut_sel = i + 1
        i += 1
    return out


def declarations(corps):
    return {m.group(1): " ".join(m.group(2).split())
            for m in re.finditer(r"(--[\w-]+|color-scheme)\s*:\s*([^;]+);", corps)}


def jetons_defaut():
    css = (REPO / "css" / "app.css").read_text(encoding="utf-8")
    d = {}
    for sel, corps in regles(css):
        if sel == ":root":
            d.update(declarations(corps))
    return d


def jetons_du_theme(t):
    """Jetons PROPRES au thème (bloc [data-theme="id"] exact)."""
    css = (REPO / t["href"]).read_text(encoding="utf-8")
    d = {}
    for sel, corps in regles(css):
        if sel == f'[data-theme="{t["id"]}"]':
            d.update(declarations(corps))
    return d


def resout(jetons, valeur, profondeur=0):
    """Substitue les var(--x[, repli]) — comme le navigateur le fait pour un jeton calculé."""
    if profondeur > 20:
        raise ValueError("var() circulaire : " + valeur)

    def remplace(m):
        nom, repli = m.group(1), m.group(2)
        if nom in jetons:
            return resout(jetons, jetons[nom], profondeur + 1)
        if repli is not None:
            return resout(jetons, repli.strip(), profondeur + 1)
        raise KeyError(nom)

    prec = None
    while prec != valeur:
        prec = valeur
        valeur = re.sub(r"var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*(?:\([^()]*\))?[^()]*))?\)", remplace, valeur)
    return valeur.strip()


def tous_jetons(t):
    j = dict(jetons_defaut())
    j.update(jetons_du_theme(t))
    return j


def couleur(s):
    """'#rgb', '#rrggbb', '#rrggbbaa', 'rgb(a)(…)' → (r, g, b, a) en 0..1."""
    s = s.strip()
    m = re.fullmatch(r"#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})", s)
    if m:
        h = m.group(1)
        if len(h) == 3:
            h = "".join(c * 2 for c in h)
        a = int(h[6:8], 16) / 255 if len(h) == 8 else 1.0
        return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)) + (a,)
    m = re.fullmatch(r"rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)", s)
    if m:
        a = m.group(4)
        a = 1.0 if a is None else (float(a[:-1]) / 100 if a.endswith("%") else float(a))
        return (float(m.group(1)) / 255, float(m.group(2)) / 255, float(m.group(3)) / 255, a)
    raise ValueError(f"couleur illisible : {s!r}")


def compose(fg, bg):
    """Couleur (r,g,b,a) posée sur un fond opaque (r,g,b) → (r,g,b)."""
    a = fg[3]
    return tuple(fg[i] * a + bg[i] * (1 - a) for i in range(3))
