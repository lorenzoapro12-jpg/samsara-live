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

Dépendances non incluses dans ce dépôt (voir README) :
  · `fetch_macro`      → blocs `indicators`, `macro`
  · `scenario_engine`  → bloc `premium`
Sans elles, le script tourne, publie les autres blocs, et l'indique dans `status`.
Depuis le 04/10/2026, `cvd`, `gex` et `liquidity` ne dépendent plus que de sources
publiques (Binance, Deribit) : ils tournent dans un clone nu.
"""
import fcntl
import json
import math
import os
import subprocess
import sys
import urllib.request
from datetime import datetime, timezone
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import samsara_config as SC
import options_gex

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


def http_json(url: str, timeout: int = 20):
    req = urllib.request.Request(url, headers={"User-Agent": "SamsaraLive/3.0"})
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


def _module(nom: str):
    """Importe un module d'à côté, ou déclare le bloc non configuré."""
    try:
        return __import__(nom, fromlist=["*"])
    except ImportError as e:
        raise NonConfigure(
            f"module « {nom} » introuvable — l'ajouter à extra_module_paths "
            f"dans config.local.json"
        ) from e


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
@block("indicators", required=("4h", "1h", "1d"))
def indicators():
    fm = _module("fetch_macro")  # réutilise du code testé
    out = {}
    for tf, heures in (("4h", 4), ("1h", 1), ("1d", 24)):
        c = fm.get_btc_klines(tf, 200)
        ind = fm.compute_indicators(c)
        if ind:
            # Support / résistance / « range » = min / max des 30 DERNIÈRES bougies du TF :
            # 5 jours en 4h, 30 heures en 1h, 30 jours en 1j. La page affichait « 16 j » pour
            # les trois. On publie la fenêtre réelle pour que l'étiquette ne puisse plus mentir.
            ind["sr_window_h"] = 30 * heures
        out[tf] = ind
    return out


# ─── 3. MACRO (DXY / VIX) ────────────────────────────────────
@block("macro", required=("dxy_spot", "vix"))
def macro():
    fm = _module("fetch_macro")
    dxy_spot = fm.get_dxy_spot() or {}
    return {
        "dxy_spot": dxy_spot.get("value"),
        "dxy_date": dxy_spot.get("date"),
        "dxy_is_weekend": dxy_spot.get("is_weekend"),
        "vix": fm.get_vix(),
    }


# ─── 4. MICROSTRUCTURE FUTURES (Binance fapi, direct live) ───
@block("micro_futures", required=("funding_rate_pct", "mark_price", "oi_btc"))
def micro_futures():
    F = "https://fapi.binance.com"
    r = {}

    pi = http_json(f"{F}/fapi/v1/premiumIndex?symbol=BTCUSDT")
    fr = float(pi["lastFundingRate"]) * 100          # en %
    r["funding_rate_pct"] = round(fr, 5)
    r["funding_annual_pct"] = round(fr * 3 * 365, 2)  # funding 8h → annualisé
    r["mark_price"] = float(pi["markPrice"])

    oi = http_json(f"{F}/fapi/v1/openInterest?symbol=BTCUSDT")
    r["oi_btc"] = float(oi["openInterest"])
    r["oi_usd"] = round(float(oi["openInterest"]) * float(pi["markPrice"]))

    # Variations d'OI sur la série HORAIRE, aux deux bouts de la même série (une seule
    # cadence, aucun mélange avec l'OI live ci-dessus). L'ancienne version lisait la série
    # `period=1d`, dont les points tombent à 00:00 UTC : son « Δ1j » comparait minuit à
    # minuit et ignorait tout ce qui s'était passé depuis. Mesuré le 04/10/2026 à 11 h :
    # « Δ1j » −0,26 % publié, +1,18 % réels sur 24 h glissantes — signe inversé.
    hist = http_json(f"{F}/futures/data/openInterestHist?symbol=BTCUSDT&period=1h&limit=121")
    if hist and len(hist) >= 25:
        cur = float(hist[-1]["sumOpenInterest"])
        r["oi_change_24h_pct"] = round((cur / float(hist[-25]["sumOpenInterest"]) - 1) * 100, 2)
        r["oi_change_1d_pct"] = r["oi_change_24h_pct"]     # ancien nom, même sens désormais
        r["oi_hist_at"] = datetime.fromtimestamp(hist[-1]["timestamp"] / 1000, timezone.utc
                                                 ).isoformat(timespec="minutes")
        if len(hist) >= 121:
            r["oi_change_5d_pct"] = round((cur / float(hist[0]["sumOpenInterest"]) - 1) * 100, 2)

    ls = http_json(f"{F}/futures/data/globalLongShortAccountRatio?symbol=BTCUSDT&period=1h&limit=1")
    if ls:
        r["ls_ratio"] = round(float(ls[-1]["longShortRatio"]), 4)
        r["long_pct"] = round(float(ls[-1]["longAccount"]) * 100, 1)
        r["short_pct"] = round(float(ls[-1]["shortAccount"]) * 100, 1)

    top = http_json(f"{F}/futures/data/topLongShortPositionRatio?symbol=BTCUSDT&period=1h&limit=1")
    if top:
        r["top_ls_ratio"] = round(float(top[-1]["longShortRatio"]), 4)

    tak = http_json(f"{F}/futures/data/takerlongshortRatio?symbol=BTCUSDT&period=1h&limit=1")
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
def cvd_fenetres(klines, fenetres=(("1h", 12), ("4h", 48), ("24h", 288))):
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
    k = http_json("https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=5m&limit=288")
    if not k or len(k) < 288:
        raise RuntimeError(f"{len(k or [])} bougies 5 min reçues sur 288")
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
@block("premium", required=("premium_pct", "coinbase_mid"))
def premium():
    try:
        from scenario_engine import coinbase_premium as CP
    except ImportError as e:
        raise NonConfigure(
            "module « scenario_engine » introuvable — l'ajouter à extra_module_paths"
        ) from e
    p = CP.fetch_premium()
    # `not p` laissait passer le cas d'erreur : fetch_premium() renvoie
    # {"timestamp":…, "error":…} — dict NON vide, donc déclaré « ok », et les cinq
    # champs partaient à None.
    if not p or p.get("error"):
        raise RuntimeError(str((p or {}).get("error") or "réponse vide"))
    return {
        "premium_pct": p.get("premium_pct"),
        "premium_state": p.get("premium_state"),
        "us_demand": p.get("us_demand"),
        "coinbase_mid": p.get("coinbase_mid"),
        "binance_mid": p.get("binance_mid"),
    }


# ─── 8. MURS DE LIQUIDITÉ (carnet Binance, en BTC) ───────────
# L'ancienne version SOMMAIT les cellules de heatmap.json sur 15 min. Or une cellule n'est
# pas une quantité : c'est une INTENSITÉ d'affichage, 255·√(q/100) plafonnée à 255, où q
# est le plus gros ordre unique du bin de 20 $. Les « murs » publiés (ex. 84 500 → 1 948)
# et le ratio bid/ask étaient donc des sommes de scores compressés, sans unité — et la page
# les présentait comme une « profondeur cumulée ». On lit maintenant le carnet lui-même.
DP_MURS = 20.0          # même grille de prix que heatmap.json : un mur tombe sur une ligne de la heatmap
BANDES_PCT = (0.1, 0.5, 1.0)


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
    ref = "0.5" if "0.5" in bandes else (next(iter(bandes)) if bandes else None)

    def murs(cote):
        agg = defaultdict(float)
        for p, q in cote:
            if abs(p / mid - 1) * 100 <= couverture:
                agg[math.floor(p / DP_MURS) * DP_MURS] += q
        return [[int(p), round(q, 1)] for p, q in sorted(agg.items(), key=lambda x: -x[1])[:6]]

    return {
        "mid": round(mid, 2),
        "couverture_pct": round(couverture, 3),
        "bandes": bandes,
        "bande_ref_pct": float(ref) if ref else None,
        "ratio_bid_ask": bandes[ref]["ratio"] if ref else None,
        "total_bid": bandes[ref]["bid_btc"] if ref else None,
        "total_ask": bandes[ref]["ask_btc"] if ref else None,
        "bid_walls": murs(b),
        "ask_walls": murs(a),
        "wall_bin_usd": int(DP_MURS),
        "unit": "BTC",
    }


@block("liquidity", required=("ratio_bid_ask", "total_bid"))
def liquidity():
    d = http_json("https://api.binance.com/api/v3/depth?symbol=BTCUSDT&limit=5000")
    out = analyse_carnet(d["bids"], d["asks"])
    out["snapshot_at"] = now_iso()
    return out


def main():
    ts = now_iso()
    print(f"📡 market-data — {ts}")
    print(f"  config : {SC.describe(CFG)}")

    data: dict = {
        "updated": ts,
        "generator": "publish.py v3.2 — CVD fenêtré, GEX en USD, carnet en BTC (04/10/2026)",
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


if __name__ == "__main__":
    sys.exit(main())
