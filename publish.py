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

Dépendances non incluse dans ce dépôt (voir README) :
  · `fetch_macro`      → blocs `indicators`, `macro`
  · `scenario_engine`  → blocs `gex`, `premium`
  · une base SQLite    → bloc `cvd`
Sans elles, le script tourne, publie les autres blocs, et l'indique dans `status`.
"""
import fcntl
import json
import os
import subprocess
import sys
import urllib.request
from datetime import datetime, timezone
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import samsara_config as SC

CFG = SC.load()
SC.add_module_paths(CFG)

REPO = CFG["repo_dir"]
OUT = SC.out(CFG, "market-data.json")
HEATMAP_JSON = SC.out(CFG, "heatmap.json")
DB = CFG["cvd_database"]
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
    for tf in ("4h", "1h", "1d"):
        c = fm.get_btc_klines(tf, 200)
        out[tf] = fm.compute_indicators(c)
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

    hist = http_json(f"{F}/futures/data/openInterestHist?symbol=BTCUSDT&period=1d&limit=6")
    if hist and len(hist) >= 2:
        cur = float(hist[-1]["sumOpenInterest"])
        r["oi_change_1d_pct"] = round((cur / float(hist[-2]["sumOpenInterest"]) - 1) * 100, 2)
        if len(hist) >= 6:
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


# ─── 5. CVD (checkpoint du collecteur — seule table réellement vivante) ──
@block("cvd", required=("cvd", "updated_at"))
def cvd():
    import sqlite3
    if not DB:
        raise NonConfigure("cvd_database absent de config.local.json")
    if not os.path.exists(DB):
        raise NonConfigure(f"base introuvable : {DB}")
    con = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    con.row_factory = sqlite3.Row
    row = con.execute("""
        SELECT cvd, buy_vol, sell_vol, last_price, updated_at
        FROM cvd_checkpoint WHERE symbol='btcusdt'
        ORDER BY updated_at DESC LIMIT 1
    """).fetchone()
    con.close()
    if not row:
        return None
    # Le collecteur écrit `datetime('now')` → UTC, mais SANS fuseau (M12 de l'audit).
    # On le parse donc explicitement comme de l'UTC.
    try:
        age = (datetime.now(timezone.utc).replace(tzinfo=None)
               - datetime.strptime(row["updated_at"][:19], "%Y-%m-%d %H:%M:%S")
               ).total_seconds()
        if age > 1800:
            raise RuntimeError(f"CVD figé depuis {int(age / 60)} min")
    except ValueError:
        pass
    return {
        "cvd": row["cvd"],
        "buy_vol_24h": row["buy_vol"],
        "sell_vol_24h": row["sell_vol"],
        "updated_at": row["updated_at"],
    }


# ─── 6. GEX / DERIBIT ────────────────────────────────────────
@block("gex", required=("gex_state", "gamma_walls"))
def gex():
    try:
        from scenario_engine import gex as G
    except ImportError as e:
        raise NonConfigure(
            "module « scenario_engine » introuvable — l'ajouter à extra_module_paths"
        ) from e
    rep = G.compute_gex()
    if not rep or "error" in rep:
        raise RuntimeError((rep or {}).get("error", "réponse vide"))
    sq = G.assess_gex_for_squeeze(rep)
    return {
        "spot_deribit": rep.get("spot_price"),
        "gex_state": rep.get("gex_state"),
        "dealer_gamma": rep.get("total_dealer_gamma"),
        "gamma_walls": rep.get("gamma_walls"),
        "flip_levels": rep.get("flip_levels"),
        "num_strikes": rep.get("num_strikes"),
        "squeeze_viable": sq.get("squeeze_viable"),
        "squeeze_strength": sq.get("squeeze_strength"),
        "squeeze_reason": sq.get("reason"),
    }


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


# ─── 8. MURS DE LIQUIDITÉ (heatmap locale, vivante) ──────────
@block("liquidity", required=("ratio_bid_ask", "total_bid"))
def liquidity():
    if not os.path.exists(HEATMAP_JSON):
        raise NonConfigure(f"heatmap.json absent ({HEATMAP_JSON}) — lancer heatmap.py")
    with open(HEATMAP_JSON) as f:
        h = json.load(f)
    # La heatmap est produite toutes les 3 min : au-delà de 10 min elle est morte, et
    # les « murs » affichés seraient des vestiges. On refuse de les publier.
    _upd = h.get("updated")
    if _upd:
        try:
            _age = (datetime.now(timezone.utc)
                    - datetime.fromisoformat(_upd)).total_seconds()
            if _age > 600:
                raise RuntimeError(f"heatmap figée depuis {int(_age / 60)} min")
        except ValueError:
            pass
    dp = h["dp"]
    tmax = max(e[0] for e in h["bids"])
    t_from = tmax - 15

    def agg(entries):
        d = defaultdict(float)
        for t, lvl, s in entries:
            if t >= t_from:
                d[lvl * dp] += s
        return d

    B = agg(h["bids"])
    A = agg(h["asks"])
    tb, ta = sum(B.values()), sum(A.values())
    return {
        "tick_max": tmax,
        "dt_seconds": h.get("dt"),
        "ratio_bid_ask": round(tb / ta, 2) if ta else None,
        "bid_walls": [[int(p), round(s)] for p, s in sorted(B.items(), key=lambda x: -x[1])[:6]],
        "ask_walls": [[int(p), round(s)] for p, s in sorted(A.items(), key=lambda x: -x[1])[:6]],
        "total_bid": round(tb),
        "total_ask": round(ta),
    }


def main():
    ts = now_iso()
    print(f"📡 market-data — {ts}")
    print(f"  config : {SC.describe(CFG)}")

    data: dict = {
        "updated": ts,
        "generator": "publish.py v3.1 — live-only, sans chemin de machine (02/10/2026)",
        "source": "binance · deribit · coinbase · yahoo · collecteur cvd local",
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
        micro["cvd"] = cv["cvd"]
        micro["cvd_updated_at"] = cv["updated_at"]
        micro["cvd_buy_vol_24h"] = cv["buy_vol_24h"]
        micro["cvd_sell_vol_24h"] = cv["sell_vol_24h"]
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
