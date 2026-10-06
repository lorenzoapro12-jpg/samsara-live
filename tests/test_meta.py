#!/usr/bin/env python3
"""Le harnais des LIBELLÉS : un nom de champ ou une légende ne peut plus mentir sur sa formule.

POURQUOI (06/10/2026)
---------------------
Des champs de ce dépôt ont déjà menti par leur nom : `range_24h_pct` couvrait 30 bougies
(5 jours en 4h), `ema20_4h` portait le TF demandé, `death_cross_4h` était un état et pas un
croisement. Une légende rédigée à la main à côté du code dérive de la même façon. Les
légendes de la page sont donc lues dans `meta`, publié par le producteur et CONSTRUIT avec
les constantes du calcul ; ce harnais vérifie que cette description tient :

  1. COUVERTURE — chaque champ du fichier assemblé a sa description ; aucune description
     ne décrit un champ qui n'existe plus.
  2. NOMS — chaque nombre et chaque unité que contient le NOM d'un champ (`_1h`, `_14`,
     `_usd`, `_pct`…) est confronté à `params` et `unite`. Un nom faux doit le DÉCLARER
     (`nom_trompeur`), sinon échec ; une déclaration devenue inutile échoue aussi.
  3. FORMULES — chaque valeur est recalculée par une implémentation de RÉFÉRENCE écrite
     ici, paramétrée par `meta` (période, fenêtre, méthode). Si le calcul change sans que
     la description suive, la référence ne retrouve plus la valeur.
  4. LE HARNAIS A DES DENTS — on simule les deux dérives (constante changée, méthode
     changée) et on vérifie qu'elles sont attrapées.

Aucun réseau : les réponses des API sont fabriquées ici.

USAGE
    python3 tests/test_meta.py
"""
import json
import math
import os
import re
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
import indicateurs as IND   # noqa: E402
import publish as P         # noqa: E402

CHECKS = []


def check(nom, ok, detail=""):
    CHECKS.append(bool(ok))
    print(f"  {'✓' if ok else '✗'} {nom}" + (f" — {detail}" if detail and not ok else ""))


def titre(t):
    print(f"\n── {t} ──")


# ─── Données fabriquées, reproductibles ──────────────────────────────────────
seed = 7


def rnd():
    global seed
    seed = (seed * 1103515245 + 12345) % 2147483648
    return seed / 2147483648


MAINTENANT = int(time.time() * 1000)


def klines(n, pas_ms, depart=86000.0, derive=0.0):
    """n klines Binance (12 colonnes). La dernière est EN COURS (clôture dans le futur)."""
    out, p = [], depart
    t0 = MAINTENANT - (n - 1) * pas_ms - pas_ms // 2
    for i in range(n):
        o = p
        c = o + derive + (rnd() - 0.5) * 400
        h, l = max(o, c) + rnd() * 150, min(o, c) - rnd() * 150
        v = 50 + rnd() * 100
        q = v * c
        tb = q * (0.3 + 0.4 * rnd())
        ot = t0 + i * pas_ms
        out.append([ot, f"{o:.2f}", f"{h:.2f}", f"{l:.2f}", f"{c:.2f}", f"{v:.5f}", ot + pas_ms - 1,
                    f"{q:.2f}", 100, f"{v / 2:.5f}", f"{tb:.2f}", "0"])
        p = c
    return out


PAS = {"5m": 300000, "1h": 3600000, "4h": 14400000, "1d": 86400000}


def carnet(mid=86000.0, n=5000):
    bids = [[f"{mid - 0.5 - 0.17 * i:.2f}", f"{0.001 + rnd() * 2:.5f}"] for i in range(n)]
    asks = [[f"{mid + 0.5 + 0.17 * i:.2f}", f"{0.001 + rnd() * 2:.5f}"] for i in range(n)]
    bids[40][1], asks[90][1] = "180.0", "95.5"
    return {"bids": bids, "asks": asks}


def options_deribit():
    from datetime import datetime, timedelta, timezone
    out = []
    for jours in (2, 9, 30, 90):
        e = datetime.now(timezone.utc) + timedelta(days=jours)
        tag = e.strftime("%d%b%y").upper().lstrip("0")
        for k in range(70000, 104000, 2000):
            for cp in ("C", "P"):
                out.append({"instrument_name": f"BTC-{tag}-{k}-{cp}", "open_interest": 50 + rnd() * 900,
                            "mark_iv": 45 + rnd() * 10, "underlying_price": 86000 + jours})
    return out


_KLINES = {}


def faux_http(url, timeout=20, ua=None):
    if "api/v3/klines" in url:
        tf = re.search(r"interval=(\w+)", url).group(1)
        n = int(re.search(r"limit=(\d+)", url).group(1))
        if (tf, n) not in _KLINES:          # mêmes bougies à chaque appel : la référence
            _KLINES[tf, n] = klines(n, PAS[tf], derive=-3 if tf == "1h" else 5)   # recalcule sur les mêmes
        return _KLINES[tf, n]
    if "ticker/24hr" in url:
        return {"lastPrice": "86000.5", "priceChangePercent": "-0.4", "highPrice": "87000",
                "lowPrice": "85000", "quoteVolume": "1150000000.5"}
    if "api/v3/depth" in url:
        return carnet()
    if "bookTicker" in url:
        return {"bidPrice": "85999.9", "askPrice": "86000.1"}
    if "coinbase.com" in url:
        if "USDT-USD" in url:
            return {"bids": [["0.99970", "1"]], "asks": [["0.99974", "1"]]}
        return {"bids": [["85975.00", "1"]], "asks": [["85976.00", "1"]]}
    if "premiumIndex" in url:
        return {"lastFundingRate": "0.00004", "markPrice": "86001", "nextFundingTime": MAINTENANT + 3600000}
    if "openInterestHist" in url:
        return [{"sumOpenInterest": str(94000 + i * 7), "timestamp": MAINTENANT - (121 - i) * 3600000} for i in range(121)]
    if "openInterest" in url:
        return {"openInterest": "94484.0"}
    if "LongShortAccountRatio" in url:
        return [{"longShortRatio": "1.08", "longAccount": "0.52", "shortAccount": "0.48"}]
    if "topLongShort" in url:
        return [{"longShortRatio": "1.69"}]
    if "takerlongshort" in url:
        return [{"buySellRatio": "1.29"}]
    if "get_index_price" in url:
        return {"result": {"index_price": 86000.0}}
    if "get_book_summary" in url:
        return {"result": options_deribit()}
    if "finance.yahoo.com" in url:
        s = int(time.time())
        jours = [s - 86400 * i for i in range(13, -1, -1)]
        return {"chart": {"result": [{"meta": {"regularMarketPrice": 15.4, "regularMarketTime": s - 600},
                                      "timestamp": jours,
                                      "indicators": {"quote": [{"close": [101 + i / 10 for i in range(14)]}]}}]}}
    raise RuntimeError("URL non simulée : " + url)


P.http_json = faux_http
DATA = P.assembler(P.now_iso())
META = DATA["meta"]["champs"]

# ─── 1. Couverture ───────────────────────────────────────────────────────────
titre("1. Chaque champ publié est décrit, chaque description décrit un champ publié")
check("les huit blocs sont « ok » sur les données fabriquées", all(v == "ok" for v in DATA["status"].values()),
      DATA["status"])
HORS_META = {"updated", "generator", "source", "status", "errors", "meta"}


def cle_meta(chemin):
    if chemin[0] == "tf" and len(chemin) == 3:
        return f"tf.*.{chemin[2]}"
    if chemin[:2] == ["liquidity", "bandes"] and len(chemin) == 4:
        return f"liquidity.bandes.*.{chemin[3]}"
    return ".".join(chemin)


publies = set()
for bloc, contenu in DATA.items():
    if bloc in HORS_META:
        continue
    if bloc == "tf":
        for tf, d in contenu.items():
            for k in d:
                publies.add(cle_meta(["tf", tf, k]))
    elif bloc == "liquidity":
        for k, v in contenu.items():
            if k == "bandes":
                for b, d in v.items():
                    for kk in d:
                        publies.add(cle_meta(["liquidity", "bandes", b, kk]))
            else:
                publies.add(cle_meta([bloc, k]))
    else:
        for k in contenu:
            publies.add(cle_meta([bloc, k]))
sans = sorted(publies - set(META))
check("aucun champ publié sans description", not sans, sans)
OPTIONNELS = {"macro.pannes"}           # n'existe que si une source tombe
fantomes = sorted(set(META) - publies - OPTIONNELS)
check("aucune description d'un champ qui n'est plus publié", not fantomes, fantomes)
NATURES = {"mesure", "modèle", "convention", "seuil", "horodatage"}
mal = [k for k, d in META.items() if d.get("nature") not in NATURES]
check("chaque description a une nature reconnue (mesure / modèle / convention / seuil / horodatage)", not mal, mal)
vides = [k for k, d in META.items() if not all(d.get(x) for x in ("libelle", "unite", "formule", "source"))]
check("libellé, unité, formule et source toujours renseignés", not vides, vides)
alias_casses = [k for k, d in META.items() if d.get("alias_de") and d["alias_de"] not in META
                and f"{k.rsplit('.', 1)[0]}.{d['alias_de']}" not in META]
check("chaque alias pointe vers un champ décrit", not alias_casses, alias_casses)


# ─── 2. Noms ─────────────────────────────────────────────────────────────────
titre("2. Les nombres et unités d'un NOM sont ceux de sa formule")


def promesses_du_nom(nom):
    """Ce que le nom affirme : [(texte, prédicat sur (params, unite))]."""
    out = []
    reste = nom
    m = re.search(r"(?:^|_)(\d+)_(\d+)j(?=_|$)", reste)
    if m:
        out.append((m.group(0).strip("_"), lambda p, u, n=int(m.group(2)): p.get("jours_max") == n))
        reste = reste.replace(m.group(0), "_")
    for part in [x for x in reste.split("_") if x]:
        if re.fullmatch(r"\d+h", part):
            out.append((part, lambda p, u, n=int(part[:-1]): p.get("fenetre_h") == n))
        elif re.fullmatch(r"\d+d", part):
            out.append((part, lambda p, u, n=int(part[:-1]): p.get("fenetre_h") == 24 * n))
        elif re.fullmatch(r"\d+j", part):
            out.append((part, lambda p, u, n=int(part[:-1]): p.get("jours_max") == n))
        elif re.fullmatch(r"\d+pct", part):
            out.append((part, lambda p, u, n=int(part[:-3]): p.get("mouvement_pct") == n))
        elif re.fullmatch(r"[a-z]*\d+", part):
            n = int(re.search(r"\d+", part).group())
            out.append((part, lambda p, u, n=n: n in {p.get(k) for k in ("periode", "bougies", "courte", "longue")}))
        elif part == "usd":
            out.append((part, lambda p, u: u.split()[0] in ("USD", "USDT")))
        elif part == "pct":
            out.append((part, lambda p, u: "%" in u))
        elif part == "btc":
            out.append((part, lambda p, u: "BTC" in u))
    return out


def mensonges(cle, d):
    nom = cle.rsplit(".", 1)[-1]
    return [t for t, ok in promesses_du_nom(nom) if not ok(d.get("params") or {}, d.get("unite", ""))]


# Noms dont le mensonge n'est pas un nombre mais un SENS : chacun a son contrôle dédié plus bas.
SEMANTIQUES = {"tf.*.ema_gap_pct"}
for cle, d in sorted(META.items()):
    faux = mensonges(cle, d)
    if faux and not d.get("nom_trompeur"):
        check(f"{cle} : le nom ment ({', '.join(faux)}) sans le déclarer", False)
    elif d.get("nom_trompeur") and not faux and cle not in SEMANTIQUES:
        check(f"{cle} : « nom_trompeur » déclaré mais le nom est exact — note périmée", False)
nb_noms = sum(1 for c, d in META.items() if promesses_du_nom(c.rsplit(".", 1)[-1]))
check(f"{nb_noms} noms porteurs d'un nombre ou d'une unité, tous exacts ou déclarés trompeurs",
      all(CHECKS))
trompeurs = sorted(c for c, d in META.items() if d.get("nom_trompeur"))
check("les noms trompeurs connus sont déclarés", {"tf.*.range_24h_pct", "tf.*.ema20_4h", "tf.*.death_cross_4h",
                                                  "tf.*.ema_gap_pct"} <= set(trompeurs), trompeurs)


# ─── 3. Formules : recalcul par référence, paramétrée par meta ──────────────
titre("3. Chaque valeur est retrouvée par une référence paramétrée par sa description")


def ref_rsi(closes, n):
    """Wilder, écrit autrement : séries complètes puis lissage."""
    d = [b - a for a, b in zip(closes, closes[1:])]
    g = [max(x, 0) for x in d]
    p = [max(-x, 0) for x in d]
    ag, ap = sum(g[:n]) / n, sum(p[:n]) / n
    for x, y in zip(g[n:], p[n:]):
        ag, ap = ag + (x - ag) / n, ap + (y - ap) / n
    return 100.0 if ap == 0 else 100 - 100 / (1 + ag / ap)


def ref_ema(v, n):
    a = 2 / (n + 1)
    e = sum(v[:n]) / n
    for x in v[n:]:
        e += a * (x - e)
    return e


def ref_atr(c, n):
    tr = [max(b["high"] - b["low"], abs(b["high"] - a["close"]), abs(b["low"] - a["close"])) for a, b in zip(c, c[1:])]
    x = sum(tr[:n]) / n
    for t in tr[n:]:
        x += (t - x) / n
    return x


def tf_meta(nom):
    return META[f"tf.*.{nom}"]


for tf, heures in IND.TFS:
    k = faux_http(f"api/v3/klines?interval={tf}&limit={IND.BOUGIES_CHARGEES}")
    c = IND.bougies(k)
    out = IND.indicateurs_tf(c, heures)
    pub = DATA["tf"][tf]
    cl = [x["close"] for x in c]
    pr = lambda n: tf_meta(n)["params"]
    ok = []
    ok.append(abs(round(ref_rsi(cl, pr("rsi_14")["periode"]), 1) - pub["rsi_14"]) < 1e-9)
    ok.append(abs(round(ref_ema(cl, pr("ema20")["periode"]), 2) - pub["ema20"]) < 1e-6)
    ok.append(abs(round(ref_ema(cl, pr("ema50")["periode"]), 2) - pub["ema50"]) < 1e-6)
    e20, e50 = ref_ema(cl, pr("ema_ecart_pct")["courte"]), ref_ema(cl, pr("ema_ecart_pct")["longue"])
    ok.append(abs(round((e20 / e50 - 1) * 100, 2) - pub["ema_ecart_pct"]) < 1e-9)
    ok.append(pub["ema20_sous_ema50"] == (e20 < e50) == pub["death_cross_4h"])
    nb = pr("support_30")["bougies"]
    ok.append(pub["support_30"] == round(min(x["low"] for x in c[-nb:]), 2))
    ok.append(pub["resistance_30"] == round(max(x["high"] for x in c[-pr("resistance_30")["bougies"]:]), 2))
    lo, hi = min(x["low"] for x in c[-nb:]), max(x["high"] for x in c[-nb:])
    ok.append(pub["amplitude_30_pct"] == round((hi - lo) / lo * 100, 2) == pub["range_24h_pct"])
    nv = pr("volume_moyen_10_btc")["bougies"]
    ok.append(abs(pub["volume_moyen_10_btc"] - round(sum(x["volume"] for x in c[-nv:]) / nv, 2)) < 1e-9)
    ok.append(abs(pub["atr_14"] - round(ref_atr(c, pr("atr_14")["periode"]), 2)) < 1e-6)
    ok.append(pub["sr_window_h"] == pr("sr_window_h")["bougies"] * heures)
    ok.append(pub["bougie_en_cours"] is True)
    check(f"tf {tf} : RSI, EMA, écart, S/R, amplitude, volume, ATR, fenêtre retrouvés ({sum(ok)}/{len(ok)})", all(ok))

# Le sens perdu de ema_gap_pct (SEMANTIQUES) : une tendance baissière donne un écart canonique
# négatif et un écart historique positif.
c = IND.bougies(klines(200, PAS["1h"], derive=-40))
o = IND.indicateurs_tf(c, 1)
check("ema_gap_pct perd le sens (déclaré) : baisse → ema_ecart_pct < 0, ema_gap_pct > 0",
      o["ema_ecart_pct"] < 0 < o["ema_gap_pct"] and o["ema_gap_pct"] == abs(o["ema_ecart_pct"]), o)

# CVD
k5 = faux_http(f"api/v3/klines?interval=5m&limit={max(b for _, b in P.FENETRES_CVD)}")
cv = P.cvd_fenetres(k5)
ok = []
for nom, _ in P.FENETRES_CVD:
    pm = META[f"micro.cvd_{nom}_usd"]["params"]
    s = k5[-pm["bougies"]:]
    ok.append(cv[f"cvd_{nom}_usd"] == round(sum(2 * float(x[10]) - float(x[7]) for x in s)))
    ok.append(pm["bougies"] * pm["intervalle_min"] / 60 == pm["fenetre_h"])
check("CVD : chaque fenêtre retrouvée depuis ses bougies et son intervalle décrits", all(ok))

# Carnet
liq = DATA["liquidity"]
mb = META["liquidity.bid_walls"]["params"]
pb = sorted(liq["profil_bids"], key=lambda x: -x[1])[:mb["n"]]
check("murs = les N plus grosses tranches du profil (N et tranche décrits)",
      [[p, round(q, 1)] for p, q in pb] == liq["bid_walls"] and all(p % mb["tranche_usd"] == 0 for p, _ in pb),
      (pb[:2], liq["bid_walls"][:2]))
check("bandes tentées = bandes décrites", META["liquidity.bandes.*.ratio"]["params"]["bandes_pct"]
      == liq["bandes_demandees_pct"] == list(P.BANDES_PCT))
b = carnet()
a = P.analyse_carnet(b["bids"], b["asks"])
tot = sum(float(q) for p, q in b["bids"] if abs(float(p) / a["mid"] - 1) * 100 <= a["couverture_pct"] + 1e-9)
check("le profil contient TOUT le carnet couvert (somme conservée)",
      abs(sum(q for _, q in a["profil_bids"]) - tot) < 0.01 * len(a["profil_bids"]), (sum(q for _, q in a["profil_bids"]), tot))

# Prime
m = META["micro.premium_state"]["params"]
check("seuils de la prime décrits = seuils appliqués",
      P.etat_prime(m["seuil_pct"] + 1e-6) == "POSITIVE" and P.etat_prime(m["seuil_pct"] - 1e-6) == "NEUTRAL"
      and P.etat_prime(m["seuil_extreme_pct"] + 1e-6) == "EXTREME_POSITIVE"
      and P.etat_prime(-m["seuil_extreme_pct"] - 1e-6) == "EXTREME_NEGATIVE")

# Funding annualisé
mi = DATA["micro"]
check("funding annualisé = funding × échéances décrites × 365",
      mi["funding_annual_pct"] == round(mi["funding_rate_pct"] * META["micro.funding_annual_pct"]["params"]["echeances_par_jour"] * 365, 2))


# ─── 4. Le harnais a des dents ───────────────────────────────────────────────
titre("4. Les dérives sont attrapées")
sauve = IND.RSI_PERIODE
IND.RSI_PERIODE = 21
derive = IND.meta()
IND.RSI_PERIODE = sauve
check("période du RSI passée à 21 → le nom « rsi_14 » est signalé comme mensonger",
      mensonges("tf.*.rsi_14", derive["rsi_14"]) == ["14"] and "21" in derive["rsi_14"]["formule"])
cl = [x["close"] for x in IND.bougies(klines(200, PAS["4h"]))]


def cutler(closes, n):
    d = [b - a for a, b in zip(closes[-n - 1:], closes[-n:])]
    g, p = sum(max(x, 0) for x in d) / n, sum(max(-x, 0) for x in d) / n
    return round(100 - 100 / (1 + g / p), 1)


check("méthode du RSI changée (Cutler) → la référence de Wilder ne la retrouve plus",
      cutler(cl, 14) != round(ref_rsi(cl, 14), 1) == IND.rsi_wilder(cl), (cutler(cl, 14), IND.rsi_wilder(cl)))
faux = dict(META["micro.cvd_1h_usd"], params=dict(META["micro.cvd_1h_usd"]["params"], fenetre_h=4))
check("fenêtre du CVD décrite à 4 h → « cvd_1h_usd » signalé", mensonges("micro.cvd_1h_usd", faux) == ["1h"])
sans_decl = {k: v for k, v in META["tf.*.range_24h_pct"].items() if k != "nom_trompeur"}
check("« range_24h_pct » sans sa déclaration → signalé", mensonges("tf.*.range_24h_pct", sans_decl) == ["24h"])

print()
if all(CHECKS):
    print(f"✅ LIBELLÉS : {len(CHECKS)} CONTRÔLES PASSENT ({len(META)} champs décrits)")
else:
    print(f"❌ LIBELLÉS : {CHECKS.count(False)} ÉCHEC(S)")
sys.exit(0 if all(CHECKS) else 1)
