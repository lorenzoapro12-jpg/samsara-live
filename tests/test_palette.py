#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""test_palette.py — la palette du dashboard, MESURÉE et non affirmée, pour CHAQUE thème.

POURQUOI CE HARNAIS
-------------------
Le 04/10/2026, un bloc CSS affirmait en commentaire une validation WCAG / daltonisme dont le
script n'avait pas été conservé. Une affirmation sans reproduction ne protège de rien : la
retouche suivante d'une couleur peut casser le contraste sans que personne le sache. Premier
écart trouvé par ce harnais (05/10/2026) : --up clair à 2,99:1, sous le seuil de 0,01.

Depuis que les thèmes sont des fichiers (themes/<id>.css, déclarés par les <link
data-theme-id> d'index.html), le harnais lit le REGISTRE de la page et mesure chaque thème
déclaré : un nouveau thème n'entre pas sans tenir les mêmes seuils que les autres.

CE QU'IL MESURE (par thème)
---------------------------
1. Contraste WCAG 2.1 des encres --ink-1/2/3 sur --card-solid (AA texte ≥ 4,5:1). Les
   cartes réelles sont semi-transparentes : --card-solid est la borne opaque documentée, un
   PLANCHER, pas une approximation du rendu.
2. Texte signé --up-ink / --down-ink sur --card-solid (AA ≥ 4,5:1).
3. Marques --up / --down (bougies, barres) sur CHAQUE borne du fond du graphique
   (--chart-1/2/3) : WCAG 1.4.11 ≥ 3:1. Toutes les bornes = le pire cas.
4. Séparation daltonisme : CIEDE2000 entre --up/--down et --up-ink/--down-ink sous
   protanopie, deutéranopie, tritanopie (Machado, Oliveira & Fernandes 2009, sévérité 1,0,
   RVB linéaire). Seuil 8.
5. Overlays (--ov-ema20 … --ov-sma50) : séparation deux à deux ≥ 8 en vision normale.
6. Traçabilité des exceptions : un overlay sous 3:1 sur le fond du graphique doit porter son
   étiquette en bout de tracé (ETIQ_OVERLAYS, js/). Exception silencieuse = échec.
7. Texte posé sur un DÉGRADÉ (06/10/2026) : --brand-ink sur --brand-fond (bouton actif, boutons du
   Grid Bot), --pill-actif-ink sur --pill-actif (intervalle, indicateur actif) — mesuré sur
   CHAQUE borne du dégradé (AA texte ≥ 4,5:1). Une borne translucide est composée sur la
   carte opaque (plancher). C'est le cas exact d'un thème noir / néon : texte sombre sur un
   néon clair passe, texte sombre sur un fond sombre ne passe pas.

USAGE
    python3 tests/test_palette.py     # code de sortie 0 = tout tient
"""
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

SEUIL_AA_TEXTE = 4.5
SEUIL_NON_TEXTE = 3.0
SEUIL_DALTONISME = 8.0
SEUIL_OVERLAYS = 8.0

ko = 0
lignes = []


def titre(t):
    lignes.append("")
    lignes.append(f"── {t} ──")


def ok(libelle, detail, seuil=None, valeur=None):
    lignes.append(f"  ✓ {libelle:<44} {detail}")


def echec(libelle, detail):
    global ko
    ko = 1
    lignes.append(f"  ✗ {libelle:<44} {detail}")


# ─────────────────────────── couleur : WCAG + CIELAB ───────────────────────────
def parse_hex(s):
    s = s.strip().lstrip("#")
    if len(s) == 3:
        s = "".join(c * 2 for c in s)
    if len(s) == 8:  # #rrggbbaa — on ignore l'alpha (couches composées à part)
        s = s[:6]
    if len(s) != 6:
        raise ValueError(f"couleur illisible : {s!r}")
    return tuple(int(s[i:i + 2], 16) / 255 for i in (0, 2, 4))


def lin(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def srgb(c):
    return 12.92 * c if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055


def luminance(rgb):
    r, g, b = (lin(c) for c in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contraste(a, b):
    la, lb = luminance(a), luminance(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


def lab(rgb):
    """sRGB -> CIELAB (illuminant D65)."""
    r, g, b = (lin(c) for c in rgb)
    x = 0.4124564 * r + 0.3575761 * g + 0.1804375 * b
    y = 0.2126729 * r + 0.7151522 * g + 0.0721750 * b
    z = 0.0193339 * r + 0.1191920 * g + 0.9503041 * b
    xn, yn, zn = 0.95047, 1.0, 1.08883

    def f(t):
        return t ** (1 / 3) if t > (6 / 29) ** 3 else t / (3 * (6 / 29) ** 2) + 4 / 29

    fx, fy, fz = f(x / xn), f(y / yn), f(z / zn)
    return 116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)


def ciede2000(c1, c2):
    """CIEDE2000, formule standard (Sharma et al. 2005)."""
    import math
    L1, a1, b1 = lab(c1)
    L2, a2, b2 = lab(c2)
    C1, C2 = math.hypot(a1, b1), math.hypot(a2, b2)
    Cb = (C1 + C2) / 2
    G = 0.5 * (1 - math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7))) if Cb else 0.5
    a1p, a2p = (1 + G) * a1, (1 + G) * a2
    C1p, C2p = math.hypot(a1p, b1), math.hypot(a2p, b2)
    h1p = math.degrees(math.atan2(b1, a1p)) % 360 if (a1p or b1) else 0.0
    h2p = math.degrees(math.atan2(b2, a2p)) % 360 if (a2p or b2) else 0.0
    dLp = L2 - L1
    dCp = C2p - C1p
    if C1p * C2p == 0:
        dhp = 0.0
    elif abs(h2p - h1p) <= 180:
        dhp = h2p - h1p
    elif h2p - h1p > 180:
        dhp = h2p - h1p - 360
    else:
        dhp = h2p - h1p + 360
    dHp = 2 * math.sqrt(C1p * C2p) * math.sin(math.radians(dhp) / 2)
    Lbp = (L1 + L2) / 2
    Cbp = (C1p + C2p) / 2
    if C1p * C2p == 0:
        hbp = h1p + h2p
    elif abs(h1p - h2p) <= 180:
        hbp = (h1p + h2p) / 2
    elif h1p + h2p < 360:
        hbp = (h1p + h2p + 360) / 2
    else:
        hbp = (h1p + h2p - 360) / 2
    T = (1 - 0.17 * math.cos(math.radians(hbp - 30)) + 0.24 * math.cos(math.radians(2 * hbp))
         + 0.32 * math.cos(math.radians(3 * hbp + 6)) - 0.20 * math.cos(math.radians(4 * hbp - 63)))
    dtheta = 30 * math.exp(-(((hbp - 275) / 25) ** 2))
    Rc = 2 * math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7)) if Cbp else 0.0
    Sl = 1 + (0.015 * (Lbp - 50) ** 2) / math.sqrt(20 + (Lbp - 50) ** 2)
    Sc = 1 + 0.045 * Cbp
    Sh = 1 + 0.015 * Cbp * T
    Rt = -math.sin(math.radians(2 * dtheta)) * Rc
    return math.sqrt((dLp / Sl) ** 2 + (dCp / Sc) ** 2 + (dHp / Sh) ** 2
                     + Rt * (dCp / Sc) * (dHp / Sh))


# Machado, Oliveira & Fernandes (2009), sévérité 1,0 — s'applique au RVB LINÉAIRE.
DALTONISME = {
    "protanopie": ((0.152286, 1.052583, -0.204868),
                   (0.114503, 0.786281, 0.099216),
                   (-0.003882, -0.048116, 1.051998)),
    "deutéranopie": ((0.367322, 0.860646, -0.227968),
                     (0.280085, 0.672501, 0.047413),
                     (-0.011820, 0.042940, 0.968881)),
    "tritanopie": ((1.255528, -0.076749, -0.178779),
                   (-0.078411, 0.930809, 0.147602),
                   (0.004733, 0.691367, -0.303900)),
}


def simule(rgb, matrice):
    v = [lin(c) for c in rgb]
    out = [sum(m * x for m, x in zip(ligne, v)) for ligne in matrice]
    return tuple(min(1.0, max(0.0, srgb(x))) for x in out)


# ─────────────────────────── lecture des thèmes ───────────────────────────
from theme_css import themes_declares, tous_jetons, resout, couleur, compose, REPO


def rgb(jetons, nom, fond=None):
    c = couleur(resout(jetons, jetons[nom]))
    if c[3] < 1:
        if fond is None:
            raise ValueError(f"{nom} est translucide ({c[3]:.2f}) : il faut une couleur opaque")
        return compose(c, fond)
    return c[:3]


def hexa(c):
    return "#" + "".join(f"{round(x * 255):02x}" for x in c[:3])


THEMES = themes_declares()
if not THEMES:
    print("⛔ aucun thème déclaré dans index.html (<link data-theme-id>) — harnais inexploitable")
    sys.exit(2)
SRC_JS = "\n".join((REPO / src).read_text(encoding="utf-8")
                   for src in re.findall(r'<script\b[^>]*\bsrc="(js/(?!vendor/)[^"]+)"',
                                         (REPO / "index.html").read_text(encoding="utf-8")))
_m = re.search(r"const ETIQ_OVERLAYS\s*=\s*\{([^}]*)\}", SRC_JS)
ETIQ = set(re.findall(r"(\w+)\s*:\s*'", _m.group(1))) if _m else set()
NOMS_OV = ["ema20", "ema50", "ema100", "ema200", "sma20", "sma50"]

for t in THEMES:
    th = t["id"]
    J = tous_jetons(t)
    titre(f"THÈME « {t['nom']} » ({th}, {t['mode']}) — {t['href']}")
    try:
        fond_carte = rgb(J, "--card-solid")
        fonds_canvas = [rgb(J, n) for n in ("--chart-1", "--chart-2", "--chart-3")]
    except (KeyError, ValueError) as e:
        echec(f"{th} · jeton de fond", str(e))
        continue

    # 1-2. texte sur la carte opaque
    for nom in ("--ink-1", "--ink-2", "--ink-3", "--up-ink", "--down-ink"):
        r = contraste(rgb(J, nom, fond_carte), fond_carte)
        (ok if r >= SEUIL_AA_TEXTE else echec)(f"{th} · {nom} sur carte {hexa(fond_carte)}",
                                               f"{r:.2f}:1 (AA ≥ {SEUIL_AA_TEXTE})")

    # 3. marques sur chaque borne du fond du graphique
    for nom in ("--up", "--down"):
        pire = min(((contraste(rgb(J, nom, f), f), f) for f in fonds_canvas), key=lambda x: x[0])
        (ok if pire[0] >= SEUIL_NON_TEXTE else echec)(
            f"{th} · {nom} {resout(J, J[nom])}", f"{pire[0]:.2f}:1 (pire borne {hexa(pire[1])}, ≥ {SEUIL_NON_TEXTE})")

    # 4. séparation daltonisme
    for a_, b_, fond in (("--up", "--down", fonds_canvas[1]), ("--up-ink", "--down-ink", fond_carte)):
        a, b = rgb(J, a_, fond), rgb(J, b_, fond)
        mini = min((ciede2000(simule(a, m), simule(b, m)), n) for n, m in DALTONISME.items())
        (ok if mini[0] >= SEUIL_DALTONISME else echec)(
            f"{th} · {a_}/{b_} daltonisme", f"ΔE min {mini[0]:5.1f} ({mini[1]}, ≥ {SEUIL_DALTONISME})")

    # 5. overlays deux à deux
    try:
        ovs = [rgb(J, "--ov-" + n, fonds_canvas[1]) for n in NOMS_OV]
    except KeyError as e:
        echec(f"{th} · overlays", f"jeton manquant {e}")
        continue
    mini, qui = 1e9, None
    for i in range(len(ovs)):
        for j in range(i + 1, len(ovs)):
            d = ciede2000(ovs[i], ovs[j])
            if d < mini:
                mini, qui = d, (NOMS_OV[i], NOMS_OV[j])
    (ok if mini >= SEUIL_OVERLAYS else echec)(f"{th} · {len(ovs)} overlays deux à deux",
                                              f"ΔE min {mini:5.1f} ({qui[0]}/{qui[1]}, ≥ {SEUIL_OVERLAYS})")

    # 7. texte sur dégradé : chaque borne
    for encre, fond_tok in (("--brand-ink", "--brand-fond"), ("--pill-actif-ink", "--pill-actif")):
        try:
            texte = rgb(J, encre, fond_carte)
            valeur = resout(J, J[fond_tok])
        except (KeyError, ValueError) as e:
            echec(f"{th} · {encre} sur {fond_tok}", f"illisible : {e}")
            continue
        bornes = re.findall(r"#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)", valeur)
        if not bornes:
            echec(f"{th} · {encre} sur {fond_tok}", f"aucune couleur trouvée dans {valeur[:40]}")
            continue
        pire = min(((contraste(texte, b), b) for b in
                    (compose(couleur(x), fond_carte) if couleur(x)[3] < 1 else couleur(x)[:3] for x in bornes)),
                   key=lambda x: x[0])
        (ok if pire[0] >= SEUIL_AA_TEXTE else echec)(
            f"{th} · {encre} sur {fond_tok} ({len(bornes)} borne(s))", f"{pire[0]:.2f}:1 (pire borne {hexa(pire[1])}, AA ≥ {SEUIL_AA_TEXTE})")

    # 6. exceptions sous 3:1 : étiquetées, pas silencieuses
    sous = [(n, min(contraste(c, f) for f in fonds_canvas)) for n, c in zip(NOMS_OV, ovs)]
    sous = [(n, r) for n, r in sous if r < SEUIL_NON_TEXTE]
    manquants = [n for n, _ in sous if n not in ETIQ]
    if not sous:
        ok(f"{th} · aucun overlay sous {SEUIL_NON_TEXTE}:1", "rien à rattraper")
    elif manquants:
        echec(f"{th} · exception SANS étiquette", ", ".join(manquants))
    else:
        ok(f"{th} · {len(sous)}/{len(ovs)} sous {SEUIL_NON_TEXTE}:1, tous étiquetés",
           ", ".join(f"{n} {r:.2f}:1" for n, r in sous))

lignes.append("")
lignes.append("═" * 52)
lignes.append(f"✅ PALETTE : TOUS LES CONTRÔLES PASSENT ({len(THEMES)} thème(s))" if not ko
              else "❌ AU MOINS UN CONTRÔLE DE PALETTE A ÉCHOUÉ")
print("\n".join(lignes))
sys.exit(ko)
