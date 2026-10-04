#!/usr/bin/env python3
"""GEX — exposition gamma des options BTC Deribit, en DOLLARS par mouvement de 1 %.

Module de CALCUL pur : aucun accès réseau ici (c'est `publish.py` qui interroge Deribit),
donc tout se vérifie hors ligne — voir `tests/test_calculs.py`.

POURQUOI CE MODULE EXISTE (04/10/2026)
--------------------------------------
Le bloc `gex` lisait un calcul qui ne pouvait produire qu'UNE valeur. Mesuré sur les
427 relevés de la base : **427 fois « NEUTRAL »**, et le niveau de bascule valait toujours
le plus petit strike (20 000). Deux défauts cumulés :

  1. UNITÉ — la somme Γ·S·0,01·OI est en **BTC** de delta par 1 %, pas en dollars ; elle
     était comparée à des seuils en dollars (500 k / 2 M / 5 M). Ordre de grandeur mesuré :
     −6 565 « $ » affichés pour ≈ −560 M$ réels. Toujours sous le seuil → toujours NEUTRAL.
  2. SIGNE — tous les dealers étaient supposés VENDEURS de toutes les options : le gamma
     total était donc négatif par construction, et le cumul par strike changeait de signe
     dès le premier strike. L'indicateur ne pouvait rien dire du marché.

LA CONVENTION ICI (et c'est une hypothèse, pas une mesure)
----------------------------------------------------------
Convention « naïve » standard du GEX : les dealers sont **acheteurs des calls** et
**vendeurs des puts** — calls +, puts −. Le positionnement réel des dealers n'est pas
observable ; la page doit le dire, et elle le dit.

    GEX$(option) = signe × Γ × OI × S² × 0,01        (USD de delta par mouvement de 1 %)

Γ est le gamma de Black-Scholes par BTC de sous-jacent, OI en BTC (1 contrat = 1 BTC),
S le prix du sous-jacent (le forward Deribit de l'échéance). Le **zéro gamma** est le prix
où le GEX total change de signe : on le trouve en recalculant le GEX total sur une grille
de prix hypothétiques (vol et échéances inchangées), pas en cumulant par strike.
"""
import math
import re
from datetime import datetime, timezone

# Plancher d'échéance : à quelques minutes de l'expiration (08:00 UTC chez Deribit), le
# gamma Black-Scholes d'une option à la monnaie diverge (∝ 1/√T). Une heure de plancher
# garde la contribution des quotidiennes sans laisser une seule option dominer le total.
T_MIN_ANS = 1.0 / (365.25 * 24)
# Grille du zéro gamma : ±15 % autour du spot, pas de 0,5 %.
BALAYAGE_PCT = 15.0
PAS_PCT = 0.5

_NOM = re.compile(r"^BTC-(\d{1,2}[A-Z]{3}\d{2})-(\d+)-([CP])$")


def parse_instrument(nom):
    """'BTC-27DEC26-100000-C' -> (échéance UTC 08:00, strike, est_call) ; None si illisible."""
    m = _NOM.match(nom or "")
    if not m:
        return None
    try:
        exp = datetime.strptime(m.group(1), "%d%b%y").replace(hour=8, tzinfo=timezone.utc)
    except ValueError:
        return None
    return exp, float(m.group(2)), m.group(3) == "C"


def gamma_bs(s, k, t, iv):
    """Gamma Black-Scholes (sans taux ni dividende) par unité de sous-jacent."""
    if s <= 0 or k <= 0 or t <= 0 or iv <= 0:
        return 0.0
    v = iv * math.sqrt(t)
    d1 = (math.log(s / k) + 0.5 * iv * iv * t) / v
    return math.exp(-0.5 * d1 * d1) / (math.sqrt(2 * math.pi) * s * v)


def options_utiles(resumes, now):
    """Filtre et normalise `get_book_summary_by_currency` : une ligne par option vivante."""
    out = []
    for r in resumes or []:
        p = parse_instrument(r.get("instrument_name"))
        if not p:
            continue
        exp, k, call = p
        oi = float(r.get("open_interest") or 0)
        iv = float(r.get("mark_iv") or 0) / 100.0
        f = float(r.get("underlying_price") or 0)
        t = (exp - now).total_seconds() / (365.25 * 86400)
        if oi <= 0 or iv <= 0 or f <= 0 or t <= 0:
            continue
        out.append({"k": k, "call": call, "oi": oi, "iv": iv, "f": f,
                    "t": max(t, T_MIN_ANS), "jours": t * 365.25})
    return out


def gex_total(opts, facteur=1.0):
    """GEX net (USD / 1 %) si tous les sous-jacents étaient multipliés par `facteur`."""
    tot = 0.0
    for o in opts:
        s = o["f"] * facteur
        g = gamma_bs(s, o["k"], o["t"], o["iv"])
        tot += (1 if o["call"] else -1) * g * o["oi"] * s * s * 0.01
    return tot


def zero_gamma(opts, spot):
    """Prix où le GEX total change de signe, le plus proche du spot ; None s'il n'y en a pas
    dans ±BALAYAGE_PCT (le régime est alors le même sur toute la plage)."""
    pas = int(BALAYAGE_PCT / PAS_PCT)
    pts = []
    for i in range(-pas, pas + 1):
        fac = 1 + i * PAS_PCT / 100.0
        pts.append((spot * fac, gex_total(opts, fac)))
    zeros = []
    for (p0, g0), (p1, g1) in zip(pts, pts[1:]):
        if g0 == 0:
            zeros.append(p0)
        elif g0 * g1 < 0:
            zeros.append(p0 + (p1 - p0) * g0 / (g0 - g1))     # interpolation linéaire
    return min(zeros, key=lambda z: abs(z - spot)) if zeros else None


def rapport(resumes, spot, now=None):
    """Rapport GEX complet à partir des résumés Deribit et du prix index."""
    now = now or datetime.now(timezone.utc)
    opts = options_utiles(resumes, now)
    if not opts:
        raise ValueError("aucune option exploitable (OI, IV ou échéance manquants)")
    par_strike = {}
    calls, puts, court = 0.0, 0.0, 0.0
    for o in opts:
        g = gamma_bs(o["f"], o["k"], o["t"], o["iv"]) * o["oi"] * o["f"] ** 2 * 0.01
        e = par_strike.setdefault(o["k"], {"call": 0.0, "put": 0.0})
        if o["call"]:
            e["call"] += g
            calls += g
        else:
            e["put"] += g
            puts += g
        if o["jours"] <= 7:
            court += g if o["call"] else -g
    net = calls - puts
    zg = zero_gamma(opts, spot)
    nets = sorted(par_strike.items(), key=lambda kv: -abs(kv[1]["call"] - kv[1]["put"]))
    return {
        "gex_usd_1pct": round(net),
        "gex_calls_usd_1pct": round(calls),
        "gex_puts_usd_1pct": round(-puts),
        "gex_0_7j_usd_1pct": round(court),
        "gex_state": "LONG_GAMMA" if net > 0 else "SHORT_GAMMA",
        "zero_gamma": round(zg) if zg else None,
        "spot_vs_zero_gamma_pct": round((spot / zg - 1) * 100, 2) if zg else None,
        "call_wall": max(par_strike, key=lambda k: par_strike[k]["call"]),
        "put_wall": max(par_strike, key=lambda k: par_strike[k]["put"]),
        "gamma_walls": [k for k, _ in nets[:3]],
        "num_strikes": len(par_strike),
        "num_options": len(opts),
        "gex_convention": "dealers acheteurs des calls, vendeurs des puts (hypothèse standard, non observable)",
    }
