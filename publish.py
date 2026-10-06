#!/usr/bin/env python3
"""market-data.json — agrégateur de marché 100 % LIVE.

Huit collecteurs isolés, un seul fichier de sortie. Aucun chemin de machine n'est écrit
ici : tout vient de `samsara_config.py` (voir `config.example.json`).

Sortie : <repo_dir>/market-data.json

Règle « pas d'erreur silencieuse » : chaque collecteur est isolé, son état est publié
dans `status`, et le script sort en code 1 si au moins un bloc ÉCHOUE. Un bloc dont la
dépendance n'est simplement pas branchée dans cet environnement sort en `non configuré`
et ne compte PAS comme un échec — un dépôt cloné doit pouvoir tourner et dire ce qui
lui manque.

Depuis le 06/10/2026, AUCUN bloc ne dépend plus d'un module hors dépôt : les indicateurs
(`indicateurs.py`), le DXY / VIX et la prime Coinbase sont calculés ici, à partir de sources
publiques. Raison : une légende doit se DÉRIVER du code qui calcule (bloc `meta`), et un
harnais de ce dépôt ne peut vérifier que le code de ce dépôt. La parité avec les anciens
modules se vérifie sur la machine qui les a encore :

    python3 publish.py --comparer      # aucun fichier écrit, aucune publication

Chaque champ publié est décrit dans `meta.champs` (unité, fenêtre, formule, nature :
mesure / convention / seuil), construit à partir des MÊMES constantes que le calcul.
"""
import fcntl
import json
import math
import os
import subprocess
import sys
import time
import urllib.request
from datetime import datetime, timezone
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import samsara_config as SC
import options_gex
import indicateurs as IND

CFG = SC.load()
SC.add_module_paths(CFG)

REPO = CFG["repo_dir"]
OUT = SC.out(CFG, "market-data.json")
GIT_LOCK = CFG["git_lock"]
GIT_REMOTE = CFG["git_remote"]
GIT_BRANCH = CFG["git_branch"]

STATUS: dict[str, str] = {}
ERRORS: list[str] = []


class NonConfigure(RuntimeError):
    """Dépendance absente de CET environnement — ce n'est pas une panne.

    Distinguer les deux est le point : sinon un dépôt cloné sortirait en erreur en
    permanence, et l'utilisateur apprendrait à ignorer le code de sortie — c'est-à-dire
    à ne plus voir les VRAIES pannes.
    """


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def http_json(url: str, timeout: int = 20, ua: str = "SamsaraLive/4.0"):
    req = urllib.request.Request(url, headers={"User-Agent": ua})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())


def dump_atomic(obj, path: str) -> None:
    """Écriture atomique. Un disque plein (vécu le 17/09) ou une mort du processus
    pendant l'écriture ne doit pas laisser un JSON tronqué derrière lui."""
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)


def git_publish(paths, msg: str, branch=None) -> bool:
    """Publie SOUS VERROU, dans un INDEX DÉDIÉ.

    ⚠️ LE PATHSPEC NE SUFFIT PAS — mesuré le 02/10/2026. Le cron de la heatmap a
    committé 14 fichiers sans rapport sous le message « Heatmap 2026-10-02T12:19 »,
    parce qu'un autre processus les avait laissés INDEXÉS auparavant. `git commit --
    <chemin>` ignore les modifications non indexées des autres chemins, mais il
    committe **tout ce qui est déjà dans l'index** : l'index est un état partagé entre
    les écrivains, et c'est lui, la fuite. Le message de commit devient faux — donc
    l'historique ment, ce qui est pire que de ne rien committer.

    On travaille donc dans un index à nous (`GIT_INDEX_FILE`), initialisé depuis HEAD.
    L'index partagé n'est jamais utilisé pour le commit ; il est remis à niveau
    APRÈS, sinon `git status` afficherait le fichier modifié indéfiniment.

    Le push et le rebase, eux, se font dans l'index normal : à ce stade notre commit
    existe, et les laisser dans l'index dédié désynchroniserait l'arbre de travail.
    """
    branch = branch or GIT_BRANCH
    os.makedirs(os.path.dirname(GIT_LOCK) or ".", exist_ok=True)
    with open(GIT_LOCK, "w") as lk:
        fcntl.flock(lk, fcntl.LOCK_EX)

        def shared(*a, **k):
            return subprocess.run(["git", "-C", REPO, *a], **k)

        env = dict(os.environ, GIT_INDEX_FILE=os.path.join(CFG["state_dir"], "index-publish"))

        def g(*a, **k):
            k["env"] = env
            return subprocess.run(["git", "-C", REPO, *a], **k)

        g("read-tree", "HEAD", check=True)       # base = HEAD, JAMAIS l'index partagé
        g("add", "--", *paths, check=True)
        if g("diff", "--cached", "--quiet", "--", *paths).returncode == 0:
            return False                          # rien à publier : silence
        g("commit", "-q", "-m", msg, check=True)

        shared("reset", "-q", "HEAD", "--", *paths)   # l'index partagé rejoint HEAD
        for _ in range(3):
            if shared("push", "-q", GIT_REMOTE, branch, timeout=90).returncode == 0:
                return True
            shared("pull", "-q", "--rebase", GIT_REMOTE, branch)
        raise RuntimeError("push impossible après 3 essais")


def block(name: str, required: tuple = ()):
    """Isole un collecteur : capture l'exception, publie son état, ne casse rien.

    `required` : champs dont l'absence (`None`) rend le bloc INCOMPLET. Sans ce
    contrôle, un collecteur renvoyant un dict plein de `None` passait pour « ok » —
    une source morte s'affichait donc comme vivante, soit exactement l'inverse de la
    règle annoncée en tête de ce fichier.
    """
    def deco(fn):
        def wrap(*a, **k):
            try:
                v = fn(*a, **k)
                if v in (None, {}, []):
                    STATUS[name] = "vide"
                    ERRORS.append(f"{name}: aucun résultat")
                    return v
                missing = [f for f in required
                           if isinstance(v, dict) and v.get(f) is None]
                if missing:
                    STATUS[name] = "incomplet:" + ",".join(missing)
                    ERRORS.append(f"{name}: champs absents {missing}")
                    return v
                STATUS[name] = "ok"
                return v
            except NonConfigure as e:
                STATUS[name] = f"non configuré : {e}"
                return None
            except Exception as e:
                STATUS[name] = f"error: {type(e).__name__}: {e}"
                ERRORS.append(f"{name}: {type(e).__name__}: {e}")
                return None
        return wrap
    return deco


# ─── 1. SPOT BTC ─────────────────────────────────────────────
@block("btc_spot")
def btc_spot():
    t = http_json("https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT")
    return {
        "price": float(t["lastPrice"]),
        "change_24h_pct": float(t["priceChangePercent"]),
        "high_24h": float(t["highPrice"]),
        "low_24h": float(t["lowPrice"]),
        "quote_volume_24h_usd": float(t["quoteVolume"]),
    }


# ─── 2. INDICATEURS MULTI-TF ─────────────────────────────────
# Calcul dans `indicateurs.py` (pur, testé hors ligne). Support / résistance / « range » =
# min / max des 30 DERNIÈRES bougies du TF : 5 jours en 4h, 30 heures en 1h, 30 jours en 1j.
# La fenêtre réelle est publiée (`sr_window_h`) pour que l'étiquette ne puisse plus mentir.
def klines_btc(tf: str, n: int = IND.BOUGIES_CHARGEES):
    return http_json(f"https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval={tf}&limit={n}")


@block("indicators", required=tuple(tf for tf, _ in IND.TFS))
def indicators():
    return {tf: IND.indicateurs_tf(IND.bougies(klines_btc(tf)), heures) for tf, heures in IND.TFS}


# ─── 3. MACRO (DXY / VIX) — Yahoo Finance, public ────────────
# DXY : dernière clôture JOURNALIÈRE d'un jour ouvré de DX-Y.NYB (la barre du jour porte le
# dernier cours tant que la séance est ouverte). VIX : `regularMarketPrice` de ^VIX, avec
# son horodatage — Yahoo le diffuse en différé, et hors séance US c'est la dernière clôture.
YAHOO = "https://query1.finance.yahoo.com/v8/finance/chart/"
YAHOO_UA = "Mozilla/5.0"           # le même agent que l'ancien module, qui passait chez Yahoo
DXY_SYMBOLE, DXY_PLAGE = "DX-Y.NYB", "14d"
VIX_SYMBOLE, VIX_PLAGE = "^VIX", "5d"


def yahoo(symbole: str, plage: str):
    s = urllib.request.quote(symbole)
    res = http_json(f"{YAHOO}{s}?interval=1d&range={plage}", timeout=10, ua=YAHOO_UA)
    return (((res or {}).get("chart") or {}).get("result") or [None])[0] or {}


def dxy_derniere_cloture(res: dict, maintenant: datetime):
    """{value, date, is_weekend} : dernier close d'un jour OUVRÉ, sinon le dernier tout court.

    `is_weekend` dit si le marché est fermé MAINTENANT (samedi / dimanche UTC), pas si la
    barre date d'un week-end : c'est la lecture que la page en fait.
    """
    ts = res.get("timestamp") or []
    cl = (((res.get("indicators") or {}).get("quote") or [{}])[0].get("close")) or []
    points = [(datetime.fromtimestamp(t, tz=timezone.utc), c) for t, c in zip(ts, cl) if c is not None]
    if not points:
        return None
    ouvres = [p for p in points if p[0].weekday() < 5]
    d, v = (ouvres or points)[-1]
    return {"value": v, "date": d.strftime("%Y-%m-%d"), "is_weekend": maintenant.weekday() >= 5}


@block("macro", required=("dxy_spot", "vix"))
def macro():
    out = {"dxy_spot": None, "dxy_date": None, "dxy_is_weekend": None, "vix": None, "vix_at": None}
    pannes = []
    try:
        d = dxy_derniere_cloture(yahoo(DXY_SYMBOLE, DXY_PLAGE), datetime.now(timezone.utc)) or {}
        out.update(dxy_spot=d.get("value"), dxy_date=d.get("date"), dxy_is_weekend=d.get("is_weekend"))
    except Exception as e:                       # une source en panne n'efface pas l'autre
        pannes.append(f"DXY {type(e).__name__}: {e}")
    try:
        m = yahoo(VIX_SYMBOLE, VIX_PLAGE).get("meta") or {}
        out["vix"] = m.get("regularMarketPrice")
        if m.get("regularMarketTime"):
            out["vix_at"] = datetime.fromtimestamp(m["regularMarketTime"], timezone.utc
                                                   ).isoformat(timespec="minutes")
    except Exception as e:
        pannes.append(f"VIX {type(e).__name__}: {e}")
    if pannes:
        out["pannes"] = pannes
    return out


# ─── 4. MICROSTRUCTURE FUTURES (Binance fapi, direct live) ───
FUNDING_PAR_JOUR = 3        # échéances de financement par jour (toutes les 8 h) — annualisation
OI_HIST_POINTS = 121        # série horaire : 120 h (5 j) + le point courant
POSITIONNEMENT_PERIODE = "1h"   # ratios L/S et taker : dernier point de la série horaire


@block("micro_futures", required=("funding_rate_pct", "mark_price", "oi_btc"))
def micro_futures():
    F = "https://fapi.binance.com"
    r = {}

    pi = http_json(f"{F}/fapi/v1/premiumIndex?symbol=BTCUSDT")
    fr = float(pi["lastFundingRate"]) * 100          # en %
    r["funding_rate_pct"] = round(fr, 5)
    r["funding_annual_pct"] = round(fr * FUNDING_PAR_JOUR * 365, 2)
    if pi.get("nextFundingTime"):
        r["funding_prochain_at"] = datetime.fromtimestamp(int(pi["nextFundingTime"]) / 1000, timezone.utc
                                                          ).isoformat(timespec="minutes")
    r["mark_price"] = float(pi["markPrice"])

    oi = http_json(f"{F}/fapi/v1/openInterest?symbol=BTCUSDT")
    r["oi_btc"] = float(oi["openInterest"])
    r["oi_usd"] = round(float(oi["openInterest"]) * float(pi["markPrice"]))

    # Variations d'OI sur la série HORAIRE, aux deux bouts de la même série (une seule
    # cadence, aucun mélange avec l'OI live ci-dessus). L'ancienne version lisait la série
    # `period=1d`, dont les points tombent à 00:00 UTC : son « Δ1j » comparait minuit à
    # minuit et ignorait tout ce qui s'était passé depuis. Mesuré le 04/10/2026 à 11 h :
    # « Δ1j » −0,26 % publié, +1,18 % réels sur 24 h glissantes — signe inversé.
    hist = http_json(f"{F}/futures/data/openInterestHist?symbol=BTCUSDT&period=1h&limit={OI_HIST_POINTS}")
    if hist and len(hist) >= 25:
        cur = float(hist[-1]["sumOpenInterest"])
        r["oi_change_24h_pct"] = round((cur / float(hist[-25]["sumOpenInterest"]) - 1) * 100, 2)
        r["oi_change_1d_pct"] = r["oi_change_24h_pct"]     # ancien nom, même sens désormais
        r["oi_hist_at"] = datetime.fromtimestamp(hist[-1]["timestamp"] / 1000, timezone.utc
                                                 ).isoformat(timespec="minutes")
        if len(hist) >= OI_HIST_POINTS:
            r["oi_change_5d_pct"] = round((cur / float(hist[0]["sumOpenInterest"]) - 1) * 100, 2)

    ls = http_json(f"{F}/futures/data/globalLongShortAccountRatio?symbol=BTCUSDT&period={POSITIONNEMENT_PERIODE}&limit=1")
    if ls:
        r["ls_ratio"] = round(float(ls[-1]["longShortRatio"]), 4)
        r["long_pct"] = round(float(ls[-1]["longAccount"]) * 100, 1)
        r["short_pct"] = round(float(ls[-1]["shortAccount"]) * 100, 1)

    top = http_json(f"{F}/futures/data/topLongShortPositionRatio?symbol=BTCUSDT&period={POSITIONNEMENT_PERIODE}&limit=1")
    if top:
        r["top_ls_ratio"] = round(float(top[-1]["longShortRatio"]), 4)

    tak = http_json(f"{F}/futures/data/takerlongshortRatio?symbol=BTCUSDT&period={POSITIONNEMENT_PERIODE}&limit=1")
    if tak:
        r["taker_ratio"] = round(float(tak[-1]["buySellRatio"]), 4)
    return r


# ─── 5. CVD SPOT PAR FENÊTRE (bougies Binance) ───────────────
# Le bloc lisait le checkpoint du daemon (`cvd_checkpoint`) et le publiait sous les noms
# `cvd_buy_vol_24h` / `cvd_sell_vol_24h`. Or ce checkpoint est CUMULÉ depuis le premier
# démarrage du daemon (restauré à chaque relance, jamais remis à zéro) : mesuré le
# 04/10/2026, 70 Md$ d'achats et 72 Md$ de ventes — des mois de flux, pas 24 h. La page
# affichait donc « CVD −1,92 B$ » comme une lecture du moment. Aucune fenêtre n'est
# récupérable dans ce checkpoint.
#
# Chaque bougie Binance porte le volume quote total (k[7]) et sa part achetée au taker
# (k[10]) : delta = achats taker − ventes taker = 2·k[10] − k[7]. C'est EXACT (Binance
# agrège elle-même ses trades), fenêtré, public, et sans dépendance.
CVD_INTERVALLE_MIN = 5
FENETRES_CVD = (("1h", 12), ("4h", 48), ("24h", 288))     # (nom, bougies de 5 min)


def cvd_fenetres(klines, fenetres=FENETRES_CVD):
    """CVD (USD) et part d'achats taker (%) sur les N dernières bougies 5 min."""
    out = {}
    for nom, n in fenetres:
        s = klines[-n:]
        q = sum(float(k[7]) for k in s)
        tb = sum(float(k[10]) for k in s)
        out[f"cvd_{nom}_usd"] = round(2 * tb - q)
        out[f"taker_buy_{nom}_pct"] = round(tb / q * 100, 1) if q else None
    return out


@block("cvd", required=("cvd_1h_usd", "cvd_24h_usd"))
def cvd():
    n = max(b for _, b in FENETRES_CVD)
    k = http_json(f"https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval={CVD_INTERVALLE_MIN}m&limit={n}")
    if not k or len(k) < n:
        raise RuntimeError(f"{len(k or [])} bougies {CVD_INTERVALLE_MIN} min reçues sur {n}")
    out = cvd_fenetres(k)
    # La dernière bougie est EN COURS : les fenêtres sont glissantes et finissent maintenant.
    out["cvd_window_end"] = now_iso()
    return out


# ─── 6. GEX / DERIBIT ────────────────────────────────────────
# Calcul refait dans `options_gex.py` : l'ancien (scenario_engine) ne pouvait produire
# que « NEUTRAL » — 427 relevés sur 427. Le pourquoi est en tête de ce module.
@block("gex", required=("gex_state", "gex_usd_1pct", "gamma_walls"))
def gex():
    D = "https://www.deribit.com/api/v2/public"
    idx = http_json(f"{D}/get_index_price?index_name=btc_usd")["result"]["index_price"]
    res = http_json(f"{D}/get_book_summary_by_currency?currency=BTC&kind=option")["result"]
    rep = options_gex.rapport(res, float(idx))
    rep["spot_deribit"] = round(float(idx), 2)
    rep["dealer_gamma"] = rep["gex_usd_1pct"]          # ancien nom, désormais en USD / 1 %
    return rep


# ─── 7. PRIME COINBASE ───────────────────────────────────────
# prime = (mid Coinbase BTC-USD − mid Binance BTC-USDT) / mid Binance × 100. Même formule et
# mêmes seuils que l'ancien module (parité : `--comparer`).
#
# ⚠️ Cette prime compare des DOLLARS à des TETHERS : elle contient l'écart USDT/USD. Un USDT
# à 0,9997 $ fabrique à lui seul +0,03 % de « prime » — exactement le seuil « POSITIVE ».
# On publie donc aussi le cours USDT-USD (Coinbase) et la prime HORS USDT, qui compare des
# dollars à des dollars. La convention du marché (CryptoQuant & co.) reste la première ;
# les deux sont publiées, chacune décrite dans `meta`.
COINBASE = "https://api.exchange.coinbase.com/products/{}/book?level=1"
PRIME_SEUILS_PCT = (0.03, 0.15)     # |prime| > 0,03 % : POSITIVE / NEGATIVE ; > 0,15 % : EXTREME_*


def carnet_haut(url: str, lecture, essais: int = 3):
    """Meilleur bid / ask d'un carnet ; 3 essais espacés, comme l'ancien module."""
    for i in range(essais):
        try:
            bid, ask = lecture(http_json(url, timeout=10))
            return {"bid": bid, "ask": ask, "mid": (bid + ask) / 2}
        except Exception:
            if i == essais - 1:
                raise
            time.sleep(0.5 * (i + 1))


def etat_prime(pct: float) -> str:
    bas, haut = PRIME_SEUILS_PCT
    if pct > haut:
        return "EXTREME_POSITIVE"
    if pct > bas:
        return "POSITIVE"
    if pct < -haut:
        return "EXTREME_NEGATIVE"
    if pct < -bas:
        return "NEGATIVE"
    return "NEUTRAL"


def calcul_prime(cb: dict, bn: dict, usdt: dict = None) -> dict:
    pct = (cb["mid"] - bn["mid"]) / bn["mid"] * 100
    out = {
        "premium_pct": round(pct, 4),
        "premium_state": etat_prime(pct),
        "us_demand": pct > PRIME_SEUILS_PCT[0],
        "coinbase_mid": round(cb["mid"], 2),
        "binance_mid": round(bn["mid"], 2),
        "usdt_usd": None,
        "premium_hors_usdt_pct": None,
    }
    if usdt and usdt.get("mid"):
        out["usdt_usd"] = round(usdt["mid"], 5)
        out["premium_hors_usdt_pct"] = round((cb["mid"] / (bn["mid"] * usdt["mid"]) - 1) * 100, 4)
    return out


@block("premium", required=("premium_pct", "coinbase_mid"))
def premium():
    def cb(d):
        return float(d["bids"][0][0]), float(d["asks"][0][0])
    c = carnet_haut(COINBASE.format("BTC-USD"), cb)
    b = carnet_haut("https://api.binance.com/api/v3/ticker/bookTicker?symbol=BTCUSDT",
                    lambda d: (float(d["bidPrice"]), float(d["askPrice"])))
    try:
        u = carnet_haut(COINBASE.format("USDT-USD"), cb)
    except Exception:
        u = None                                   # la prime historique reste publiable
    out = calcul_prime(c, b, u)
    out["premium_at"] = now_iso()
    return out


# ─── 8. MURS DE LIQUIDITÉ (carnet Binance, en BTC) ───────────
# L'ancienne version SOMMAIT les cellules de heatmap.json sur 15 min. Or une cellule n'est
# pas une quantité : c'est une INTENSITÉ d'affichage, 255·√(q/100) plafonnée à 255, où q
# est le plus gros ordre unique du bin de 20 $. Les « murs » publiés (ex. 84 500 → 1 948)
# et le ratio bid/ask étaient donc des sommes de scores compressés, sans unité — et la page
# les présentait comme une « profondeur cumulée ». On lit maintenant le carnet lui-même.
DP_MURS = 20.0          # même grille de prix que heatmap.json : un mur tombe sur une ligne de la heatmap
BANDES_PCT = (0.1, 0.5, 1.0)
MURS_N = 6              # murs publiés par côté
CARNET_NIVEAUX = 5000   # niveaux demandés à Binance (le maximum de l'API)
BANDE_REF_PCT = 0.5     # bande du ratio de référence, si le carnet la couvre


def analyse_carnet(bids, asks):
    """bids/asks : listes [prix, quantité] (chaînes ou nombres), meilleur prix en tête.

    Une bande n'est publiée que si le carnet reçu la COUVRE des deux côtés : 5 000 niveaux
    Binance vont à ≈ ±1 % (mesuré : −1,13 % / +0,96 % le 04/10/2026) ; un total sur une
    bande à moitié vue serait un chiffre tronqué présenté comme complet.
    """
    b = [(float(p), float(q)) for p, q in bids]
    a = [(float(p), float(q)) for p, q in asks]
    mid = (b[0][0] + a[0][0]) / 2
    couverture = min(1 - b[-1][0] / mid, a[-1][0] / mid - 1) * 100
    bandes = {}
    for pct in BANDES_PCT:
        if pct > couverture:
            continue
        tb = sum(q for p, q in b if p >= mid * (1 - pct / 100))
        ta = sum(q for p, q in a if p <= mid * (1 + pct / 100))
        bandes[f"{pct:g}"] = {"bid_btc": round(tb, 2), "ask_btc": round(ta, 2),
                              "ratio": round(tb / ta, 2) if ta else None}
    cle_ref = f"{BANDE_REF_PCT:g}"
    ref = cle_ref if cle_ref in bandes else (next(iter(bandes)) if bandes else None)

    def tranches(cote):
        """Somme des quantités par tranche de DP_MURS $, dans la bande couverte."""
        agg = defaultdict(float)
        for p, q in cote:
            if abs(p / mid - 1) * 100 <= couverture:
                agg[math.floor(p / DP_MURS) * DP_MURS] += q
        return agg

    tb, ta = tranches(b), tranches(a)

    def murs(agg):
        return [[int(p), round(q, 1)] for p, q in sorted(agg.items(), key=lambda x: -x[1])[:MURS_N]]

    def profil(agg):
        # Le carnet ENTIER à la tranche de DP_MURS $ : la page en tire bandes et murs à
        # n'importe quelle largeur MULTIPLE de la tranche (fusionner, jamais affiner).
        return [[int(p), round(q, 3)] for p, q in sorted(agg.items())]

    return {
        "mid": round(mid, 2),
        "couverture_pct": round(couverture, 3),
        "bandes": bandes,
        "bande_ref_pct": float(ref) if ref else None,
        "ratio_bid_ask": bandes[ref]["ratio"] if ref else None,
        "total_bid": bandes[ref]["bid_btc"] if ref else None,
        "total_ask": bandes[ref]["ask_btc"] if ref else None,
        "bid_walls": murs(tb),
        "ask_walls": murs(ta),
        "wall_bin_usd": int(DP_MURS),
        "unit": "BTC",
        # Constantes du calcul, PUBLIÉES : la page les lit au lieu de les recopier.
        "bandes_demandees_pct": list(BANDES_PCT),
        "murs_n": MURS_N,
        "niveaux_demandes": CARNET_NIVEAUX,
        "niveaux_recus": {"bids": len(b), "asks": len(a)},
        "meilleur_bid": b[0][0],
        "meilleur_ask": a[0][0],
        "profil_bids": profil(tb),
        "profil_asks": profil(ta),
    }


@block("liquidity", required=("ratio_bid_ask", "total_bid"))
def liquidity():
    d = http_json(f"https://api.binance.com/api/v3/depth?symbol=BTCUSDT&limit={CARNET_NIVEAUX}")
    out = analyse_carnet(d["bids"], d["asks"])
    out["snapshot_at"] = now_iso()
    return out


# ─── MÉTADONNÉES : chaque champ décrit À PARTIR DES CONSTANTES DU CALCUL ─────
# Une légende rédigée à la main finit par mentir (`range_24h_pct` couvrait 30 bougies,
# `ema20_4h` portait le TF demandé). Ici, chaque formule, fenêtre et seuil est écrit avec
# les constantes qui servent au calcul : changer l'une change l'autre. Les nombres que
# contient le NOM d'un champ sont confrontés à `params` par tests/test_calculs.py ; un nom
# qui ne dit pas la vérité doit le déclarer (`nom_trompeur`), sinon le harnais échoue.
#
# `nature` : « mesure » (observé, ou calculé exactement depuis l'observé) ; « modèle »
# (dépend d'un modèle, ex. Black-Scholes) ; « convention » (dépend d'une hypothèse non
# observable) ; « seuil » (classement par des seuils choisis par ce code) ;
# « horodatage » (dit QUAND, pas combien).
def meta_champs() -> dict:
    m = {}

    def ch(cle, libelle, unite, formule, fenetre, nature, source, **extra):
        m[cle] = {"libelle": libelle, "unite": unite, "formule": formule,
                  "fenetre": fenetre, "nature": nature, "source": source,
                  "params": extra.pop("params", {}), **extra}

    BN, FA = "Binance spot BTCUSDT", "Binance futures USDⓈ-M BTCUSDT"
    pub = "instantané au moment de la publication"
    # btc
    ch("btc.price", "Prix", "USDT", "dernier prix échangé (ticker 24 h)", pub, "mesure", BN)
    ch("btc.change_24h_pct", "Variation 24 h", "%", "(dernier − prix d'il y a 24 h) / prix d'il y a 24 h × 100",
       "24 h glissantes", "mesure", BN, params={"fenetre_h": 24})
    ch("btc.high_24h", "Plus haut 24 h", "USDT", "plus haut échangé", "24 h glissantes", "mesure", BN, params={"fenetre_h": 24})
    ch("btc.low_24h", "Plus bas 24 h", "USDT", "plus bas échangé", "24 h glissantes", "mesure", BN, params={"fenetre_h": 24})
    ch("btc.quote_volume_24h_usd", "Volume 24 h", "USDT", "somme des montants échangés (en devise de cotation)",
       "24 h glissantes", "mesure", BN, params={"fenetre_h": 24})
    # macro
    ch("macro.dxy_spot", "DXY", "indice", (f"dernière clôture JOURNALIÈRE d'un jour ouvré de {DXY_SYMBOLE} "
       "(la barre du jour porte le dernier cours tant que la séance est ouverte)"),
       f"barres journalières, {DXY_PLAGE}", "mesure", "Yahoo Finance (différé)")
    ch("macro.dxy_date", "Date du DXY", "date", "jour de la barre retenue", "—", "horodatage", "Yahoo Finance")
    ch("macro.dxy_is_weekend", "Marché fermé (week-end)", "booléen", "samedi ou dimanche UTC au moment de la publication",
       "—", "mesure", "horloge du serveur")
    ch("macro.vix", "VIX", "points de volatilité annualisée (%)", f"regularMarketPrice de {VIX_SYMBOLE} : volatilité implicite à 30 jours du S&P 500",
       "dernier cours diffusé (hors séance US : dernière clôture)", "mesure", "Yahoo Finance (différé)")
    ch("macro.vix_at", "Heure du VIX", "date", "regularMarketTime de Yahoo", "—", "horodatage", "Yahoo Finance")
    # tf (les trois TF partagent la même description ; la fenêtre en heures est `sr_window_h`)
    for nom, d in IND.meta().items():
        m[f"tf.*.{nom}"] = dict(d, source=f"{BN}, bougies du TF")
    # micro : futures
    ch("micro.funding_rate_pct", "Funding", "% par échéance",
       "lastFundingRate de premiumIndex : taux courant, appliqué à la prochaine échéance (funding_prochain_at)",
       pub, "mesure", FA)
    ch("micro.funding_annual_pct", "Funding annualisé", "% par an",
       f"funding × {FUNDING_PAR_JOUR} échéances/jour × 365 — suppose le taux constant", pub, "convention", FA,
       params={"echeances_par_jour": FUNDING_PAR_JOUR})
    ch("micro.funding_prochain_at", "Prochaine échéance de funding", "date", "nextFundingTime", "—", "horodatage", FA)
    ch("micro.mark_price", "Prix mark (perp)", "USDT", "prix de marque du contrat perpétuel", pub, "mesure", FA)
    ch("micro.oi_btc", "Open interest", "BTC", "contrats ouverts", pub, "mesure", FA)
    ch("micro.oi_usd", "Open interest", "USDT", "oi_btc × mark_price", pub, "mesure", FA)
    ch("micro.oi_change_24h_pct", "Δ OI 24 h", "%", "(OI horaire courant / OI d'il y a 24 points − 1) × 100",
       "24 h glissantes, série horaire", "mesure", FA, params={"fenetre_h": 24})
    ch("micro.oi_change_1d_pct", "Δ OI 24 h", "%", "identique à oi_change_24h_pct", "24 h glissantes, série horaire",
       "mesure", FA, params={"fenetre_h": 24}, alias_de="micro.oi_change_24h_pct")
    ch("micro.oi_change_5d_pct", "Δ OI 5 j", "%", f"(OI horaire courant / OI d'il y a {OI_HIST_POINTS - 1} points − 1) × 100",
       f"{OI_HIST_POINTS - 1} h glissantes, série horaire", "mesure", FA, params={"fenetre_h": OI_HIST_POINTS - 1})
    ch("micro.oi_hist_at", "Heure du dernier point d'OI", "date", "horodatage du dernier point horaire", "—", "horodatage", FA)
    ch("micro.ls_ratio", "Ratio L/S (comptes)", "ratio",
       "comptes nets acheteurs / comptes nets vendeurs — UN COMPTE = UNE VOIX, quelle que soit sa taille",
       f"dernier point de la série {POSITIONNEMENT_PERIODE}", "mesure", FA)
    ch("micro.long_pct", "Comptes acheteurs", "%", "part des comptes nets acheteurs", f"dernier point {POSITIONNEMENT_PERIODE}", "mesure", FA)
    ch("micro.short_pct", "Comptes vendeurs", "%", "part des comptes nets vendeurs", f"dernier point {POSITIONNEMENT_PERIODE}", "mesure", FA)
    ch("micro.top_ls_ratio", "Ratio L/S (gros traders, positions)", "ratio",
       "positions longues / courtes des « top traders » de Binance (pondéré par la TAILLE des positions)",
       f"dernier point {POSITIONNEMENT_PERIODE}", "mesure", FA)
    ch("micro.taker_ratio", "Ratio acheteurs/vendeurs taker (perp)", "ratio",
       "volume acheté au marché / volume vendu au marché, sur le PERPÉTUEL", f"dernier point {POSITIONNEMENT_PERIODE}", "mesure", FA)
    for nom, n in FENETRES_CVD:
        h = n * CVD_INTERVALLE_MIN / 60
        ch(f"micro.cvd_{nom}_usd", f"CVD {nom}", "USDT",
           f"Σ (achats taker − ventes taker) = Σ (2 × achats taker − volume) sur {n} bougies de {CVD_INTERVALLE_MIN} min",
           f"{nom} glissantes, finissant à cvd_window_end (bougie en cours incluse)", "mesure", BN + " (spot, pas le perp)",
           params={"fenetre_h": h, "bougies": n, "intervalle_min": CVD_INTERVALLE_MIN})
        ch(f"micro.taker_buy_{nom}_pct", f"Part d'achats taker {nom}", "%",
           f"achats taker / volume total × 100, sur {n} bougies de {CVD_INTERVALLE_MIN} min",
           f"{nom} glissantes", "mesure", BN, params={"fenetre_h": h, "bougies": n})
    nom24 = FENETRES_CVD[-1][0]
    ch("micro.cvd", "CVD", "USDT", f"identique à cvd_{nom24}_usd (ancien nom)", f"{nom24} glissantes", "mesure", BN,
       alias_de=f"micro.cvd_{nom24}_usd")
    ch("micro.cvd_window_end", "Fin des fenêtres CVD", "date", "heure du calcul", "—", "horodatage", BN)
    ch("micro.cvd_updated_at", "Fin des fenêtres CVD", "date", "identique à cvd_window_end", "—", "horodatage", BN,
       alias_de="micro.cvd_window_end")
    # GEX
    D = "Deribit, options BTC (OI, IV mark, forward)"
    conv = "dealers ACHETEURS des calls, VENDEURS des puts — hypothèse standard, non observable"
    ch("micro.gex_usd_1pct", "GEX net", "USD par 1 % de mouvement",
       f"Σ signe × Γ(Black-Scholes, IV mark) × OI × S² × 0,01 ; signe : {conv}", pub, "convention", D,
       params={"mouvement_pct": 1})
    ch("micro.gex_calls_usd_1pct", "GEX des calls", "USD par 1 % de mouvement", "Σ Γ × OI × S² × 0,01 sur les calls",
       pub, "modèle", D, params={"mouvement_pct": 1})
    ch("micro.gex_puts_usd_1pct", "GEX des puts", "USD par 1 % de mouvement", "−Σ Γ × OI × S² × 0,01 sur les puts",
       pub, "convention", D, params={"mouvement_pct": 1})
    ch("micro.gex_0_7j_usd_1pct", "GEX net des échéances ≤ 7 j", "USD par 1 % de mouvement",
       "GEX net restreint aux options expirant dans 7 jours au plus", pub, "convention", D,
       params={"mouvement_pct": 1, "jours_max": 7})
    ch("micro.dealer_gamma", "GEX net", "USD par 1 % de mouvement", "identique à gex_usd_1pct (ancien nom)", pub,
       "convention", D, alias_de="micro.gex_usd_1pct")
    ch("micro.gex_state", "Régime gamma", "état", "LONG_GAMMA si GEX net > 0, sinon SHORT_GAMMA", pub, "convention", D)
    ch("micro.zero_gamma", "Zéro gamma", "USD",
       (f"prix où le GEX total recalculé change de signe, sur une grille ±{options_gex.BALAYAGE_PCT:g} % "
        f"par pas de {options_gex.PAS_PCT:g} % (IV et échéances figées) ; le plus proche du spot"),
       pub, "convention", D, params={"balayage_pct": options_gex.BALAYAGE_PCT, "pas_pct": options_gex.PAS_PCT})
    ch("micro.spot_vs_zero_gamma_pct", "Spot vs zéro gamma", "%", "(index Deribit / zéro gamma − 1) × 100", pub, "convention", D)
    ch("micro.call_wall", "Mur de calls", "USD", "strike au plus grand GEX des calls (gamma × OI, pas l'OI seul)", pub, "modèle", D)
    ch("micro.put_wall", "Mur de puts", "USD", "strike au plus grand GEX des puts (gamma × OI, pas l'OI seul)", pub, "modèle", D)
    ch("micro.gamma_walls", "Murs de gamma", "USD", "3 strikes au plus grand |GEX net| du strike", pub, "convention", D)
    ch("micro.num_strikes", "Strikes", "nombre", "strikes distincts retenus", pub, "mesure", D)
    ch("micro.num_options", "Options", "nombre",
       f"options vivantes avec OI, IV et forward ; échéance plancher {options_gex.T_MIN_ANS * 365.25 * 24:g} h",
       pub, "mesure", D)
    ch("micro.gex_convention", "Convention du GEX", "texte", conv, "—", "convention", D)
    ch("micro.spot_deribit", "Index Deribit", "USD", "index btc_usd de Deribit", pub, "mesure", "Deribit")
    # Prime
    CB = "Coinbase Exchange (BTC-USD, USDT-USD) et Binance (BTCUSDT)"
    bas, haut = PRIME_SEUILS_PCT
    ch("micro.premium_pct", "Prime Coinbase", "%",
       "(mid Coinbase BTC-USD − mid Binance BTC-USDT) / mid Binance × 100 — compare des USD à des USDT",
       pub, "mesure", CB)
    ch("micro.premium_state", "État de la prime", "état",
       (f"EXTREME_POSITIVE > {haut:g} % ; POSITIVE > {bas:g} % ; NEUTRAL entre ±{bas:g} % ; "
        f"NEGATIVE < −{bas:g} % ; EXTREME_NEGATIVE < −{haut:g} %"), pub, "seuil", CB,
       params={"seuil_pct": bas, "seuil_extreme_pct": haut})
    ch("micro.us_demand", "Demande US", "booléen", f"premium_pct > {bas:g} %", pub, "seuil", CB, params={"seuil_pct": bas})
    ch("micro.coinbase_mid", "Mid Coinbase", "USD", "(meilleur bid + meilleur ask) / 2, BTC-USD", pub, "mesure", CB)
    ch("micro.binance_mid", "Mid Binance", "USDT", "(meilleur bid + meilleur ask) / 2, BTCUSDT", pub, "mesure", CB)
    ch("micro.usdt_usd", "USDT en USD", "USD", "mid Coinbase USDT-USD", pub, "mesure", CB)
    ch("micro.premium_hors_usdt_pct", "Prime Coinbase hors USDT", "%",
       "(mid Coinbase BTC-USD / (mid Binance BTC-USDT × USDT-USD) − 1) × 100 — des USD contre des USD",
       pub, "mesure", CB)
    ch("micro.premium_at", "Heure de la prime", "date", "heure de la mesure", "—", "horodatage", CB)
    # Carnet
    ref = f"{BANDE_REF_PCT:g}"
    ch("liquidity.mid", "Mid du carnet", "USDT", "(meilleur bid + meilleur ask) / 2", pub, "mesure", BN)
    ch("liquidity.couverture_pct", "Couverture du carnet", "%",
       f"distance au mid du dernier niveau reçu, côté le plus court ({CARNET_NIVEAUX} niveaux demandés)", pub, "mesure", BN,
       params={"niveaux": CARNET_NIVEAUX})
    ch("liquidity.bandes.*.bid_btc", "Bids dans la bande", "BTC", "Σ quantités des bids entre mid × (1 − bande) et le mid",
       pub, "mesure", BN, params={"bandes_pct": list(BANDES_PCT)})
    ch("liquidity.bandes.*.ask_btc", "Asks dans la bande", "BTC", "Σ quantités des asks entre le mid et mid × (1 + bande)",
       pub, "mesure", BN, params={"bandes_pct": list(BANDES_PCT)})
    ch("liquidity.bandes.*.ratio", "Ratio bid/ask de la bande", "ratio",
       "bids / asks de la bande ; une bande n'est publiée que si le carnet reçu la couvre des deux côtés",
       pub, "mesure", BN, params={"bandes_pct": list(BANDES_PCT)})
    ch("liquidity.bande_ref_pct", "Bande de référence", "%", f"±{ref} % si couverte, sinon la plus étroite publiée", pub,
       "mesure", BN)
    ch("liquidity.ratio_bid_ask", "Ratio bid/ask", "ratio", "ratio de la bande de référence", pub, "mesure", BN)
    ch("liquidity.total_bid", "Bids (bande de réf.)", "BTC", "bid_btc de la bande de référence", pub, "mesure", BN)
    ch("liquidity.total_ask", "Asks (bande de réf.)", "BTC", "ask_btc de la bande de référence", pub, "mesure", BN)
    for c in ("bid", "ask"):
        ch(f"liquidity.{c}_walls", f"Murs ({c}s)", "[prix, BTC]",
           f"les {MURS_N} tranches de {DP_MURS:g} $ à la plus grande SOMME de quantités, dans la bande couverte",
           pub, "mesure", BN, params={"tranche_usd": DP_MURS, "n": MURS_N})
        ch(f"liquidity.profil_{c}s", f"Profil ({c}s)", "[prix, BTC]",
           f"Σ quantités par tranche de {DP_MURS:g} $ (prix bas de la tranche), dans la bande couverte",
           pub, "mesure", BN, params={"tranche_usd": DP_MURS})
    ch("liquidity.wall_bin_usd", "Tranche des murs", "USD", "largeur de la tranche", "—", "mesure", BN)
    ch("liquidity.unit", "Unité des quantités", "texte", "unité des quantités du carnet", "—", "mesure", BN)
    ch("liquidity.bandes_demandees_pct", "Bandes calculées", "%", "bandes tentées ; seules les bandes couvertes sont publiées",
       "—", "mesure", BN, params={"bandes_pct": list(BANDES_PCT)})
    ch("liquidity.murs_n", "Murs publiés par côté", "nombre", "nombre de tranches retenues par côté", "—", "mesure", BN)
    ch("liquidity.niveaux_demandes", "Niveaux demandés", "nombre", "profondeur demandée à l'API", "—", "mesure", BN)
    ch("liquidity.niveaux_recus", "Niveaux reçus", "nombre par côté", "niveaux effectivement renvoyés", pub, "mesure", BN)
    ch("liquidity.meilleur_bid", "Meilleur bid", "USDT", "premier niveau acheteur", pub, "mesure", BN)
    ch("liquidity.meilleur_ask", "Meilleur ask", "USDT", "premier niveau vendeur", pub, "mesure", BN)
    ch("macro.pannes", "Pannes macro", "texte", "source en échec à cette publication (le champ concerné est vide)",
       "—", "mesure", "Yahoo Finance")
    ch("liquidity.snapshot_at", "Heure du carnet", "date", "heure de la lecture", "—", "horodatage", BN)
    return m


def assembler(ts: str) -> dict:
    """Interroge les huit collecteurs et assemble le fichier (sans l'écrire)."""
    data: dict = {
        "updated": ts,
        "generator": "publish.py v4.0 — calculs dans le dépôt, champs décrits par `meta` (06/10/2026)",
        "source": "binance · deribit · coinbase · yahoo",
    }

    spot = btc_spot()
    ind = indicators()
    mac = macro()
    mic = micro_futures()
    cv = cvd()
    gx = gex()
    pm = premium()
    liq = liquidity()

    data["btc"] = spot or {}
    data["macro"] = mac or {}
    data["tf"] = ind or {}

    micro = dict(mic or {})
    if cv:
        micro.update(cv)
        micro["cvd"] = cv["cvd_24h_usd"]                  # ancien nom : désormais 24 h glissantes
        micro["cvd_updated_at"] = cv["cvd_window_end"]
    if gx:
        micro.update(gx)
    if pm:
        micro.update(pm)
    data["micro"] = micro

    data["liquidity"] = liq or {}
    data["status"] = STATUS
    data["errors"] = ERRORS
    data["meta"] = {"version": 1, "champs": meta_champs()}
    return data


def main():
    ts = now_iso()
    print(f"📡 market-data — {ts}")
    print(f"  config : {SC.describe(CFG)}")
    data = assembler(ts)
    dump_atomic(data, OUT)

    # ─── résumé pour le log cron ───
    b = data["btc"]
    print(f"  BTC ${b.get('price', '?')} ({b.get('change_24h_pct', '?')}%)")
    print(f"  Status : {STATUS}")
    non_conf = [k for k, v in STATUS.items() if v.startswith("non configuré")]
    if non_conf:
        print(f"  ⓘ  {len(non_conf)} bloc(s) non branché(s) ici : {non_conf}")
    if ERRORS:
        print(f"  ⚠️  {len(ERRORS)} bloc(s) en échec : {ERRORS}")

    # ─── publication : verrou partagé, commit limité au fichier ───
    msg = (f"market-data — BTC ${b.get('price', '?'):,} live [{ts[11:16]}]"
           if b.get("price") else f"market-data live [{ts[11:16]}]")
    try:
        pushed = git_publish(["market-data.json"], msg)
        print(f"  ✓ Poussé — {msg}" if pushed else "  − Aucun changement")
    except Exception as e:
        print(f"  ❌ publication impossible : {type(e).__name__}: {e}")
        return 1

    return 1 if ERRORS else 0


# ─── PARITÉ AVEC LES ANCIENS MODULES ─────────────────────────
def comparer() -> int:
    """Rejoue les calculs internes CONTRE les anciens modules, sur les mêmes données.

    À lancer une fois sur la machine qui les a encore (extra_module_paths). N'écrit rien,
    ne publie rien. Code 0 = parité ; 1 = écart ; 2 = rien à comparer.
    """
    ecarts, compares = 0, 0
    try:
        fm = __import__("fetch_macro")
    except ImportError:
        fm = None
        print("  − fetch_macro absent : indicateurs non comparés")
    if fm:
        for tf, heures in IND.TFS:
            c = IND.bougies(klines_btc(tf))
            ancien = fm.compute_indicators([{k: v for k, v in x.items() if k != "close_ms"} for x in c])
            neuf = IND.indicateurs_tf(c, heures)
            for f in IND.CHAMPS_HISTORIQUES:
                compares += 1
                if ancien.get(f) != neuf.get(f):
                    ecarts += 1
                    print(f"  ✗ {tf}.{f} : ancien {ancien.get(f)!r} / neuf {neuf.get(f)!r}")
            print(f"  {'✓' if not ecarts else '·'} indicateurs {tf} comparés sur {len(c)} bougies identiques")
        a, n = fm.get_dxy_spot() or {}, dxy_derniere_cloture(yahoo(DXY_SYMBOLE, DXY_PLAGE), datetime.now(timezone.utc)) or {}
        for k in ("value", "date", "is_weekend"):
            compares += 1
            ok = a.get(k) == n.get(k)
            ecarts += not ok
            print(f"  {'✓' if ok else '✗'} DXY {k} : ancien {a.get(k)!r} / neuf {n.get(k)!r}")
        av, nv = fm.get_vix(), (yahoo(VIX_SYMBOLE, VIX_PLAGE).get("meta") or {}).get("regularMarketPrice")
        compares += 1
        ecarts += av != nv
        print(f"  {'✓' if av == nv else '✗'} VIX : ancien {av!r} / neuf {nv!r}")
    try:
        from scenario_engine import coinbase_premium as CP
    except ImportError:
        CP = None
        print("  − scenario_engine absent : prime non comparée")
    if CP:
        # Deux lectures successives du carnet ne sont pas le même instant : on compare la
        # CLASSIFICATION sur les mêmes mids, puis les valeurs à la tolérance du mouvement.
        ancien = CP.fetch_premium()
        neuf = calcul_prime({"bid": ancien["coinbase_bid"], "ask": ancien["coinbase_ask"], "mid": ancien["coinbase_mid"]},
                            {"bid": ancien["binance_bid"], "ask": ancien["binance_ask"], "mid": ancien["binance_mid"]})
        for k in ("premium_state", "us_demand"):
            compares += 1
            ok = ancien.get(k) == neuf.get(k)
            ecarts += not ok
            print(f"  {'✓' if ok else '✗'} prime {k} : ancien {ancien.get(k)!r} / neuf {neuf.get(k)!r}")
        compares += 1
        ok = abs(ancien["premium_pct"] - neuf["premium_pct"]) < 0.0002
        ecarts += not ok
        print(f"  {'✓' if ok else '✗'} prime premium_pct : ancien {ancien['premium_pct']} / neuf {neuf['premium_pct']}")
    if not compares:
        print("  rien à comparer : ajouter les anciens modules à extra_module_paths")
        return 2
    print(f"  {'✅ PARITÉ' if not ecarts else '❌ ÉCARTS'} : {compares - ecarts}/{compares}")
    return 1 if ecarts else 0


if __name__ == "__main__":
    if "--comparer" in sys.argv[1:]:
        sys.exit(comparer())
    sys.exit(main())
