#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""test_contrat.py — le contrat de la page, vérifié par du code et non par des commentaires.

POURQUOI
--------
Les règles qui gardent la page rapide et servable par GitHub Pages ont toutes été APPRISES
(mesurées le 05/10/2026) ; écrites seulement en commentaire, la prochaine retouche les défait
sans bruit. Ce harnais les fait tenir :

1. REGISTRE DES THÈMES — chaque <link data-theme-id> d'index.html pointe vers un fichier qui
   existe, déclare data-nom / data-mode (clair|sombre) / data-verre (aucun|givre|refraction),
   et son data-paire désigne un thème déclaré. Identifiants uniques.
2. JETONS — chaque thème définit le NOYAU (liste ci-dessous) sous [data-theme="<id>"], et
   toutes ses règles sont scopées sur ce sélecteur : un thème ne fuit pas sur les autres.
3. VERRE — un thème ne pose jamais `backdrop-filter` lui-même : il choisit --verre, que
   css/app.css applique aux seules surfaces prévues. data-verre="aucun" ⇒ --verre: none.
   (Mesuré : cinq surfaces floutées recalculées à chaque image = 167 ms/image, 33 sans.)
4. PERFORMANCE — dans toute feuille servie : aucun `mix-blend-mode` autre que normal, aucun
   `filter: blur(…)` (posés sur le graphique : 33 → 17 ms/image sans), aucune animation
   `infinite` (la page se redessinait en continu, même au repos), aucun @import.
5. RÉSEAU — la page n'interroge que Binance et GitHub Raw. Aucune ressource externe :
   pas de police, de CDN ni d'image distante ; les url() CSS sont relatives ou data:.

USAGE
    python3 tests/test_contrat.py     # code de sortie 0 = le contrat tient
"""
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from theme_css import (REPO, PAGE, themes_declares, regles, jetons_du_theme, jetons_defaut,
                       sans_commentaires)

NOYAU = ["color-scheme", "--fond", "--surface", "--ink-1", "--ink-2", "--ink-3",
         "--up", "--down", "--up-ink", "--down-ink", "--up-soft", "--down-soft",
         "--accent", "--accent-2", "--brand", "--accent-glow", "--hairline", "--rail",
         "--card", "--card-solid", "--card-edge", "--card-shadow",
         "--chart-1", "--chart-2", "--chart-3",
         "--ov-ema20", "--ov-ema50", "--ov-ema100", "--ov-ema200", "--ov-sma20", "--ov-sma50"]
HOTES_APPELES = {"api.binance.com", "raw.githubusercontent.com"}
# Espaces de noms XML (SVG) : écrits dans le code, jamais téléchargés.
ESPACES_DE_NOMS = {"www.w3.org"}

ko = 0
lignes = []


def ok(lib, det=""):
    lignes.append(f"  ✓ {lib:<52} {det}")


def echec(lib, det=""):
    global ko
    ko = 1
    lignes.append(f"  ✗ {lib:<52} {det}")


def titre(t):
    lignes.append("")
    lignes.append(f"── {t} ──")


def servis_de(page):
    """Les feuilles et scripts qu'une page charge (balises, plus le code tiers chargé à la demande)."""
    html = (REPO / page).read_text(encoding="utf-8")
    sv = re.findall(r'\b(?:href|src)="((?:css|js|themes)/[^"]+)"', html)
    # hyalite est chargé à la demande par js/app.js, pas par une balise : il est servi aussi.
    sv += [m for m in re.findall(r"'(js/vendor/[^']+)'", "\n".join(
        (REPO / f).read_text(encoding="utf-8") for f in sv if f.endswith(".js") and (REPO / f).exists())) if m not in sv]
    return sv


# Toutes les pages servies : le terminal, et les pages À CÔTÉ (la carte). Une page ajoutée
# à la racine est contrôlée sans qu'il faille penser à l'inscrire ici.
PAGES = ["index.html"] + sorted(p.name for p in REPO.glob("*.html") if p.name != "index.html")
html = PAGE.read_text(encoding="utf-8")
servis = servis_de("index.html")
TOUS_SERVIS = sorted({f for pg in PAGES for f in servis_de(pg)})

# ── 1. registre ──
titre("1. Registre des thèmes (index.html)")
THEMES = themes_declares()
ids = [t["id"] for t in THEMES]
(ok if THEMES else echec)("au moins un thème déclaré", f"{len(THEMES)} : {', '.join(ids)}")
(ok if len(ids) == len(set(ids)) else echec)("identifiants uniques")
for t in THEMES:
    pb = []
    if not t["href"] or not (REPO / t["href"]).exists():
        pb.append(f"fichier absent ({t['href']})")
    if not t["nom"]:
        pb.append("data-nom manquant")
    if t["mode"] not in ("clair", "sombre"):
        pb.append(f"data-mode={t['mode']!r}")
    if t["verre"] not in ("aucun", "givre", "refraction"):
        pb.append(f"data-verre={t['verre']!r}")
    if t["paire"] and t["paire"] not in ids:
        pb.append(f"data-paire={t['paire']!r} inconnu")
    (echec if pb else ok)(f"{t['id']}", "; ".join(pb) or f"{t['mode']}, verre {t['verre']}"
                          + (f", jumeau {t['paire']}" if t["paire"] else ""))

# ── 2. jetons et scope ──
titre("2. Jetons du noyau, règles scopées")
for t in THEMES:
    if not t["href"] or not (REPO / t["href"]).exists():
        continue
    css = (REPO / t["href"]).read_text(encoding="utf-8")
    propres = jetons_du_theme(t)
    manque = [n for n in NOYAU if n not in propres]
    (echec if manque else ok)(f"{t['id']} · {len(NOYAU)} jetons du noyau", "manquent : " + ", ".join(manque) if manque else "")
    scope = f'[data-theme="{t["id"]}"]'
    fuites = [sel for sel, _ in regles(css)
              if any(not s.strip().startswith(scope) for s in sel.split(","))]
    (echec if fuites else ok)(f"{t['id']} · toutes les règles sous {scope}",
                              "hors scope : " + " | ".join(fuites[:3]) if fuites else "")

# ── 3. verre ──
titre("3. Verre : choisi par le thème, appliqué par la structure")
for t in THEMES:
    if not t["href"] or not (REPO / t["href"]).exists():
        continue
    css = sans_commentaires((REPO / t["href"]).read_text(encoding="utf-8"))
    pose = re.findall(r"(?<![\w-])(?:-webkit-)?backdrop-filter\s*:", css)
    (echec if pose else ok)(f"{t['id']} · aucun backdrop-filter posé par le thème",
                            f"{len(pose)} déclaration(s)" if pose else "")
    verre = " ".join(jetons_du_theme(t).get("--verre", jetons_defaut().get("--verre", "none")).split())
    if t["verre"] == "aucun":
        (ok if verre == "none" else echec)(f"{t['id']} · data-verre=aucun ⇒ --verre: none", verre)
    else:
        (ok if verre != "none" else echec)(f"{t['id']} · data-verre={t['verre']} ⇒ --verre posé", verre)

# ── 4. performance ──
titre("4. Performance des feuilles servies (" + ", ".join(PAGES) + ")")
for f in [x for x in TOUS_SERVIS if x.endswith(".css") and (REPO / x).exists()]:
    css = sans_commentaires((REPO / f).read_text(encoding="utf-8"))
    blend = [m for m in re.findall(r"mix-blend-mode\s*:\s*([\w-]+)", css) if m != "normal"]
    flou = re.findall(r"(?<![\w-])filter\s*:[^;]*blur\(", css)
    infini = [m for m in re.findall(r"animation(?:-iteration-count)?\s*:[^;]*", css) if "infinite" in m]
    imp = re.findall(r"@import", css)
    bf = re.findall(r"(?<![\w-])(?:-webkit-)?backdrop-filter\s*:(?!\s*(?:none|var\(--verre\)|var\(--hyalite, var\(--verre\)\))\s*(?:!important)?\s*;)[^;]+", css)
    pb = []
    if blend:
        pb.append(f"mix-blend-mode {blend[:2]}")
    if flou:
        pb.append(f"{len(flou)} filter: blur")
    if infini:
        pb.append(f"animation infinie : {infini[0].strip()[:50]}")
    if imp:
        pb.append("@import")
    if bf:
        pb.append(f"backdrop-filter hors --verre : {bf[0][:50]}")
    (echec if pb else ok)(f, "; ".join(pb))

# ── 5. réseau ──
titre("5. Réseau : Binance et GitHub Raw, rien d'autre (" + ", ".join(PAGES) + ")")
for f in PAGES + TOUS_SERVIS:
    if not (REPO / f).exists():
        echec(f"{f} · référencé par la page", "fichier absent")
        continue
    txt = (REPO / f).read_text(encoding="utf-8")
    if f.endswith(".css"):
        sans_data = re.sub(r"url\(\s*(['\"])data:.*?\1\s*\)", "url(data:)", sans_commentaires(txt), flags=re.S)
        urls = [u for u in re.findall(r"url\(\s*['\"]?([^'\")]+)", sans_data)
                if not u.startswith("data:") and not u.startswith("#")]
        (echec if any(re.match(r"(https?:)?//", u) for u in urls) else ok)(f"{f} · url() relatives ou data:", ", ".join(urls[:3]))
        continue
    if f.endswith(".html"):
        ext = re.findall(r'<(?:script|link|img|iframe)\b[^>]*\b(?:src|href)="((?:https?:)?//[^"]+)"', txt)
        (echec if ext else ok)(f"{f} · aucune ressource externe", ", ".join(ext[:3]))
        continue
    if f.startswith("js/vendor/"):
        continue    # code tiers verbatim : il n'émet aucune requête (filtre SVG local)
    code = re.sub(r"(?m)^\s*//.*$", "", re.sub(r"/\*.*?\*/", "", txt, flags=re.S))
    hotes = set(re.findall(r"https?://([a-zA-Z0-9.-]+)", code)) - ESPACES_DE_NOMS
    hors = hotes - HOTES_APPELES
    (echec if hors else ok)(f"{f} · hôtes appelés", ", ".join(sorted(hotes)) + (f" — INTERDITS : {', '.join(sorted(hors))}" if hors else ""))
    for bad in ("new WebSocket", "EventSource(", "import("):
        if bad in code:
            echec(f"{f} · {bad.strip('(')}", "la page reste en requêtes REST, sans connexion persistante")

lignes.append("")
lignes.append("═" * 52)
lignes.append("✅ CONTRAT : TOUS LES CONTRÔLES PASSENT" if not ko else "❌ LE CONTRAT N'EST PAS TENU")
print("\n".join(lignes))
sys.exit(ko)
