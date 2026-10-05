#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""test_palette.py — la palette du dashboard, MESURÉE et non affirmée.

POURQUOI CE HARNAIS
-------------------
Le bloc CSS « AERO SUBLIMÉ (04/10/2026) » d'`index.html` affirme, en commentaire :

    « Couleurs hausse / baisse et palette des overlays VALIDÉES au script
      (luminosité, chroma, séparation daltonisme, contraste) sur les fonds réels
      du graphique, dans les deux thèmes. »

    « Overlays : palette VALIDÉE au script (...). En clair le jaune est sous 3:1 :
      chaque ligne porte donc son étiquette en bout de tracé. »

Ces phrases sont VERSIONNÉES ; le script qui les produit n'a pas été conservé (mesure
one-shot de la session du 04/10/2026). Une affirmation sans reproduction ne protège de
rien : la prochaine retouche d'une couleur peut casser le contraste, et personne ne le
saura avant de l'avoir sous les yeux.
Ce harnais remplace l'affirmation par une mesure. Il relit les couleurs DANS `index.html`
(la source publiée, pas une copie), recalcule les ratios, et sort en code ≠ 0 si une
couleur publiée cesse de tenir.

CE QU'IL MESURE — ET CE QU'IL NE MESURE PAS
-------------------------------------------
1. Contraste WCAG 2.1 des encres de texte sur `--card-solid` de chaque thème
   (AA texte normal ≥ 4,5:1). ⚠️ Les cartes réelles sont semi-transparentes
   (`--card: rgba(...)`) posées sur un dégradé : le contraste vrai dépend de la position
   dans la page. On teste la borne opaque `--card-solid`, qui est la surface documentée
   du texte. Ce n'est pas une approximation du rendu, c'est un PLANCHER.
2. Contraste non-textuel (WCAG 1.4.11, ≥ 3:1) des marques `--up` / `--down` sur CHAQUE
   borne des dégradés réels du canvas (clair : `#eceffb→#f7f9ff`, sombre :
   `#0b1120→#141c34`). Tester toutes les bornes = tester le pire cas.
3. Séparation daltonisme : distance CIEDE2000 entre `--up` et `--down`, et entre
   `--up-ink` et `--down-ink`, sous protanopie, deutéranopie et tritanopie.
   Modèle : Machado, Oliveira & Fernandes (2009), sévérité 1,0, appliqué au RVB LINÉAIRE.
   Seuil : 8 (le seuil annoncé par la livraison du 04/10).
   ⚠️ Le script d'origine n'a pas été conservé : ce harnais reproduit l'INTENTION, pas
   l'algorithme d'origine. Les chiffres ne sont donc pas comparables terme à terme avec
   ceux de la note de livraison — ils sont REPRODUCTIBLES, ce qui est la propriété
   recherchée.
4. Palette des overlays du graphique : séparation minimale deux à deux (CIEDE2000 ≥ 8
   en vision normale) dans chaque thème.
5. Traçabilité de l'exception : un overlay sous 3:1 sur le fond du canvas doit porter une
   étiquette en bout de tracé (`ETIQ_OVERLAYS`). Une exception documentée est une
   décision ; une exception silencieuse est un bug. Échec si l'exception n'est pas couverte.

USAGE
    python3 tests/test_palette.py     # code de sortie 0 = tout tient
"""
import re
import sys
from pathlib import Path

HTML = Path(__file__).resolve().parent.parent / "index.html"
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


# ─────────────────────────── lecture de la source ───────────────────────────
_page = HTML.read_text(encoding="utf-8", errors="replace")
# La page référence ses feuilles et ses scripts : on lit ce qui est SERVI, pas un seul fichier.
src = "\n".join([_page] + [(HTML.parent / r).read_text(encoding="utf-8", errors="replace")
                            for r in re.findall(r'\b(?:href|src)="((?:css|js|themes)/[^"]+)"', _page)])


def bloc_apres(ancre, motif, depuis=0):
    i = src.index(ancre, depuis)
    j = src.index(motif, i)
    k = src.index("}", j)
    return src[j:k], i


def variables(bloc):
    return {m.group(1): m.group(2).strip()
            for m in re.finditer(r"--([a-z0-9-]+)\s*:\s*([^;]+);", bloc)}


def resout(vars_, nom):
    v = vars_[nom]
    m = re.fullmatch(r"var\((--[a-z0-9-]+)\)", v)
    return vars_[m.group(1)[2:]] if m else v


def coul(vars_, nom):
    return parse_hex(resout(vars_, nom))


ANCRE = "AERO SUBLIMÉ (04/10/2026)"
bloc_clair, pos = bloc_apres(ANCRE, ":root {")
bloc_sombre, _ = bloc_apres(ANCRE, ".dark {", pos)
THEMES = {"clair": variables(bloc_clair), "sombre": variables(bloc_sombre)}

# Fonds réels du canvas : toutes les bornes de tous les dégradés déclarés.
i4 = src.index("4bis. FOND DU CANVAS")
CANVAS = {"clair": [], "sombre": []}
for m in re.finditer(r"\.dark[^{]*\.chart-container canvas\s*\{([^}]*)\}", src[i4:], re.S):
    CANVAS["sombre"] += re.findall(r"#[0-9a-fA-F]{6}", m.group(1))
m = re.search(r"\.chart-container canvas\s*\{([^}]*)\}", src[i4:], re.S)
CANVAS["clair"] = re.findall(r"#[0-9a-fA-F]{6}", m.group(1))
CANVAS = {k: sorted({parse_hex(h) for h in v}) for k, v in CANVAS.items()}

# Palette des overlays + les étiquettes qui couvrent l'exception.
_i = src.index("const PALETTE_OVERLAYS")
bloc_pal = src[_i:src.index("};", _i)]


def _seg(texte, apres, avant=None):
    s = texte.split(apres, 1)[1]
    return s.split(avant, 1)[0] if avant else s


NOMS_OVERLAYS = {}
OVERLAYS = {}
for th, seg in (("clair", _seg(bloc_pal, "clair", "sombre")),
                ("sombre", _seg(bloc_pal, "sombre:"))):
    trouve = re.findall(r"(\w+)\s*:\s*'(#[0-9a-fA-F]{6})'", seg)
    NOMS_OVERLAYS[th] = [k for k, _ in trouve]
    OVERLAYS[th] = [parse_hex(h) for _, h in trouve]
ETIQ = set(re.findall(r"(\w+)\s*:\s*'", _seg(src, "const ETIQ_OVERLAYS", "};")))

for k, v in CANVAS.items():
    if not v:
        print(f"⛔ fond de canvas introuvable pour le thème {k} — harnais inexploitable")
        sys.exit(2)

# ─────────────────────────── 1. contraste du texte ───────────────────────────
TEXTES = ("ink-1", "ink-2", "ink-3")
titre(f"1. Texte sur la carte opaque (WCAG AA ≥ {SEUIL_AA_TEXTE}:1)")
for th, v in THEMES.items():
    fond = coul(v, "card-solid")
    for nom in TEXTES:
        r = contraste(coul(v, nom), fond)
        (ok if r >= SEUIL_AA_TEXTE else echec)(f"{th} · {nom} sur {resout(v, 'card-solid')}",
                                               f"{r:.2f}:1")

# ─────────────────────────── 2. texte signé ───────────────────────────
titre(f"2. Texte signé (hausse/baisse) sur la carte (AA ≥ {SEUIL_AA_TEXTE}:1)")
for th, v in THEMES.items():
    fond = coul(v, "card-solid")
    for nom in ("up-ink", "down-ink"):
        r = contraste(coul(v, nom), fond)
        (ok if r >= SEUIL_AA_TEXTE else echec)(f"{th} · {nom} sur {resout(v, 'card-solid')}",
                                               f"{r:.2f}:1")

# ─────────────────────────── 3. marques sur le canvas ───────────────────────────
titre(f"3. Marques hausse/baisse sur le FOND RÉEL du canvas (≥ {SEUIL_NON_TEXTE}:1, pire borne)")
for th, v in THEMES.items():
    for nom in ("up", "down"):
        c = coul(v, nom)
        pire = min(((contraste(c, f), f) for f in CANVAS[th]), key=lambda t: t[0])
        detail = f"{pire[0]:.2f}:1 (borne #{''.join(f'{int(x*255):02x}' for x in pire[1])})"
        (ok if pire[0] >= SEUIL_NON_TEXTE else echec)(f"{th} · {nom} {resout(v, nom)}", detail)

# ─────────────────────────── 4. séparation daltonisme ───────────────────────────
titre(f"4. Séparation hausse/baisse sous daltonisme (CIEDE2000 ≥ {SEUIL_DALTONISME})")
for th, v in THEMES.items():
    for paire in (("up", "down"), ("up-ink", "down-ink")):
        a, b = coul(v, paire[0]), coul(v, paire[1])
        for nom, mat in DALTONISME.items():
            d = ciede2000(simule(a, mat), simule(b, mat))
            (ok if d >= SEUIL_DALTONISME else echec)(
                f"{th} · {paire[0]}/{paire[1]} — {nom}", f"ΔE {d:5.1f}")

# ─────────────────────────── 5. overlays ───────────────────────────
titre(f"5. Overlays du graphique : séparation deux à deux (ΔE ≥ {SEUIL_OVERLAYS})")
for th, cols in OVERLAYS.items():
    mini, qui = 1e9, None
    for i in range(len(cols)):
        for j in range(i + 1, len(cols)):
            d = ciede2000(cols[i], cols[j])
            if d < mini:
                mini, qui = d, (NOMS_OVERLAYS[th][i], NOMS_OVERLAYS[th][j])
    (ok if mini >= SEUIL_OVERLAYS else echec)(
        f"{th} · {len(cols)} overlays", f"ΔE min {mini:5.1f} ({qui[0]}/{qui[1]})")

# ─────────────────────────── 6. exceptions traçables ───────────────────────────
titre(f"6. Overlays sous {SEUIL_NON_TEXTE}:1 sur le fond du canvas : étiquetés, pas silencieux")
for th, cols in OVERLAYS.items():
    sous = [(NOMS_OVERLAYS[th][i], c, min(contraste(c, f) for f in CANVAS[th]))
            for i, c in enumerate(cols)
            if min(contraste(c, f) for f in CANVAS[th]) < SEUIL_NON_TEXTE]
    manquants = [n for n in NOMS_OVERLAYS[th] if n not in ETIQ]
    if not sous:
        ok(f"{th} · aucun overlay sous {SEUIL_NON_TEXTE}:1", "rien à rattraper")
    elif manquants:
        echec(f"{th} · exception SANS étiquette",
              f"{len(sous)} sous {SEUIL_NON_TEXTE}:1, sans libellé : {', '.join(manquants)}")
    else:
        detail = ", ".join(f"{n} {r:.2f}:1" for n, _, r in sous)
        ok(f"{th} · {len(sous)}/{len(cols)} sous {SEUIL_NON_TEXTE}:1, tous étiquetés", detail)

lignes.append("")
lignes.append("═" * 52)
lignes.append("✅ TOUS LES CONTRÔLES DE PALETTE PASSENT" if not ko
              else "❌ AU MOINS UN CONTRÔLE DE PALETTE A ÉCHOUÉ")
print("\n".join(lignes))
sys.exit(ko)
