#!/usr/bin/env python3
"""Contrôles HORS LIGNE des calculs de publish.py et options_gex.py.

Aucun appel réseau : chaque calcul est joué sur des données construites à la main, dont
le résultat se vérifie de tête. Les harnais de rendu prouvent que la page AFFICHE les
valeurs ; celui-ci prouve que les valeurs sont JUSTES.

Chaque contrôle porte un défaut constaté le 04/10/2026 :
  · CVD : le checkpoint du daemon était un cumul de plusieurs mois publié comme « 24 h » ;
  · carnet : des scores d'intensité de heatmap publiés comme une profondeur ;
  · GEX : des BTC comparés à des seuils en dollars, et un signe constant par construction.
"""
import math
import os
import sys
from datetime import datetime, timedelta, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
import options_gex as G   # noqa: E402
import publish as P       # noqa: E402  (l'import ne lance rien : main() est gardé)

CHECKS = []


def check(nom, ok, detail=""):
    CHECKS.append(ok)
    print(f"  {'✓' if ok else '✗'} {nom}" + (f" — {detail}" if detail and not ok else ""))


# ── CVD par fenêtre ───────────────────────────────────────────────────────────
# Bougie : k[7] = volume quote total, k[10] = part achetée au taker.
def kline(quote, taker_buy):
    return [0, "0", "0", "0", "0", "0", 0, str(quote), 0, "0", str(taker_buy), "0"]


# 288 bougies : les 276 premières neutres (50/50), les 12 dernières à 70 % d'achats.
ks = [kline(1000, 500) for _ in range(276)] + [kline(1000, 700) for _ in range(12)]
c = P.cvd_fenetres(ks)
check("CVD 1h = Σ(2·achats − total) des 12 dernières bougies", c["cvd_1h_usd"] == 12 * 400, c)
check("CVD 24h ne compte que la fenêtre (288 bougies)", c["cvd_24h_usd"] == 12 * 400, c)
check("part d'achats taker 1h = 70 %", c["taker_buy_1h_pct"] == 70.0, c)
check("part d'achats taker 24h pondérée par le volume", c["taker_buy_24h_pct"] == round(
    (276 * 500 + 12 * 700) / (288 * 1000) * 100, 1), c)

# ── Carnet : bandes couvertes, murs en BTC ────────────────────────────────────
# Mid à 100 000. Bids tous les 10 $ jusqu'à −0,6 %, asks jusqu'à +0,3 % : la bande ±0,5 %
# n'est PAS couverte côté asks, elle ne doit pas être publiée.
bids = [[100000 - 5 - 10 * i, 1.0] for i in range(60)]          # 99 995 → 99 405
asks = [[100000 + 5 + 10 * i, 2.0] for i in range(30)]          # 100 005 → 100 295
bids[3][1] = 50.0                                               # mur à 99 965
a = P.analyse_carnet(bids, asks)
check("couverture = côté le plus court (asks, ≈ 0,295 %)", abs(a["couverture_pct"] - 0.295) < 0.001, a["couverture_pct"])
check("bande ±0,5 % NON publiée (asks pas couverts)", "0.5" not in a["bandes"], list(a["bandes"]))
check("bande ±0,1 % publiée, en BTC", a["bandes"]["0.1"]["bid_btc"] == 10 + 49 and a["bandes"]["0.1"]["ask_btc"] == 20.0, a["bandes"])
check("ratio de référence sur la bande couverte", a["bande_ref_pct"] == 0.1 and a["ratio_bid_ask"] == round(59 / 20, 2), a)
check("mur bid = bin de 20 $ contenant l'ordre (99 960)", a["bid_walls"][0] == [99960, 51.0], a["bid_walls"][:2])
check("unité déclarée", a["unit"] == "BTC")

# ── GEX ───────────────────────────────────────────────────────────────────────
now = datetime(2026, 10, 4, 12, tzinfo=timezone.utc)
exp = (now + timedelta(days=30)).strftime("%d%b%y").upper()


def opt(k, cp, oi, iv=50, f=100000):
    return {"instrument_name": f"BTC-{exp}-{k}-{cp}", "open_interest": oi, "mark_iv": iv, "underlying_price": f}


t = ((now + timedelta(days=30)).replace(hour=8) - now).total_seconds() / (365.25 * 86400)
g1 = G.gamma_bs(100000, 100000, t, 0.5)
attendu = g1 * 10 * 100000 ** 2 * 0.01
r = G.rapport([opt(100000, "C", 10)], 100000, now)
check("unité : Γ·OI·S²·0,01, en dollars", abs(r["gex_usd_1pct"] - attendu) <= 1, (r["gex_usd_1pct"], attendu))
# De tête : Γ·S²·0,01 = n(d1)/(σ√T)·S·0,01 ≈ 0,398/0,143 × 1 000 ≈ 2 780 $ par BTC, × 10 BTC.
check("ordre de grandeur : 10 BTC ATM 30 j ≈ 28 k$ / 1 %", 25_000 < r["gex_usd_1pct"] < 31_000, r["gex_usd_1pct"])
r = G.rapport([opt(100000, "P", 10)], 100000, now)
check("un put seul : GEX négatif (convention calls + / puts −)", r["gex_usd_1pct"] < 0 and r["gex_state"] == "SHORT_GAMMA", r)
r = G.rapport([opt(100000, "C", 10), opt(100000, "P", 10)], 100000, now)
check("call + put même strike même OI : GEX nul", abs(r["gex_usd_1pct"]) <= 1, r["gex_usd_1pct"])
# Puts lourds à 90 000, calls lourds à 110 000 : sous ~100 000 les puts dominent, au-dessus
# les calls. Le zéro gamma doit tomber entre les deux, et le signe dépend du côté du spot.
mix = [opt(90000, "P", 100, f=100000), opt(110000, "C", 100, f=100000)]
r = G.rapport(mix, 100000, now)
check("zéro gamma entre le mur de puts et le mur de calls",
      r["zero_gamma"] is not None and 90000 < r["zero_gamma"] < 110000, r["zero_gamma"])
check("call wall / put wall", r["call_wall"] == 110000 and r["put_wall"] == 90000, (r["call_wall"], r["put_wall"]))
check("échéance passée ignorée", len(G.options_utiles(
    [{"instrument_name": "BTC-1JAN20-100000-C", "open_interest": 5, "mark_iv": 50, "underlying_price": 1e5}], now)) == 0)
check("nom illisible ignoré", G.parse_instrument("ETH-1JAN27-100-C") is None)

ko = CHECKS.count(False)
print(f"\n{'✅ CALCULS SERVEUR : TOUS LES CONTRÔLES PASSENT' if not ko else f'❌ {ko} contrôle(s) en échec'}")
sys.exit(1 if ko else 0)
