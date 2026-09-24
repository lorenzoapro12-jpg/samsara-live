#!/usr/bin/env python3
"""market-data.json — agrégateur de marché 100 % LIVE.

Refonte du 10/09/2026 (rupture avec la chaîne Renaissance/Sœurs).

Ce script NE LIT PLUS :
  state.json · predictions.jsonl · demon-summary.txt · transcript/*.md
et N'ÉCRIT PLUS samsara-data.json (gelé comme archive).

Sortie : /root/samsara-live/market-data.json

Règle « pas d'erreur silencieuse » : chaque collecteur est isolé, son état est
publié dans `status`, et le script sort en code 1 si au moins un bloc échoue.
"""
import fcntl
import json
import os
import subprocess
import sys
import urllib.request
from datetime import datetime, timezone
from collections import defaultdict

sys.path.insert(0, "/root/.hermes/roue-predictions")
sys.path.insert(0, "/root/projects/sol-radar")

REPO = "/root/samsara-live"
OUT = f"{REPO}/market-data.json"
HEATMAP_JSON = f"{REPO}/heatmap.json"
DB = "/root/projects/sol-radar/pipeline_marche_crypto/stockage/base_history.db"

STATUS: dict[str, str] = {}
ERRORS: list[str] = []


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def http_json(url: str, timeout: int = 20):
    req = urllib.request.Request(url, headers={"User-Agent": "SamsaraLive/3.0"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())


def dump_atomic(obj, path: str) -> None:
    """Écriture atomique. Un disque plein (vécu le 17/09) ou une mort du processus
    pendant l'écriture ne doit pas laisser un JSON tronqué derrière lui."""
    tmp = path + ".tmp"
    with open(tmp, "w") as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)


GIT_LOCK = "/root/.hermes/samsara-git.lock"


def git_publish(paths, msg: str, branch: str = "master") -> bool:
    """Publie SOUS VERROU, en ne committant QUE les chemins demandés.

    Deux écrivains (publish.py et heatmap.py) partagent ce dépôt. Sans verrou ni
    pathspec, l'un peut committer le fichier que l'autre vient de préparer, ou tomber
    sur un index.lock. Le push est réessayé après rebase : une divergence distante ne
    doit pas bloquer la publication indéfiniment.
    """
    with open(GIT_LOCK, "w") as lk:
        fcntl.flock(lk, fcntl.LOCK_EX)

        def g(*a, **k):
            return subprocess.run(["git", "-C", REPO, *a], **k)

        g("add", "--", *paths, check=True)
        if g("diff", "--cached", "--quiet", "--", *paths).returncode == 0:
            return False
        g("commit", "-q", "-m", msg, "--", *paths, check=True)
        for _ in range(3):
            if g("push", "-q", "origin", branch, timeout=90).returncode == 0:
                return True
            g("pull", "-q", "--rebase", "origin", branch)
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
@block("indicators", required=("4h", "1h", "1d"))
def indicators():
    import fetch_macro as fm  # réutilise du code testé, pas de dépendance Renaissance
    out = {}
    for tf in ("4h", "1h", "1d"):
        c = fm.get_btc_klines(tf, 200)
        out[tf] = fm.compute_indicators(c)
    return out


# ─── 3. MACRO (DXY / VIX) ────────────────────────────────────
@block("macro", required=("dxy_spot", "vix"))
def macro():
    import fetch_macro as fm
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


# ─── 5. CVD (checkpoint daemon — seule table réellement vivante) ──
@block("cvd", required=("cvd", "updated_at"))
def cvd():
    import sqlite3
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
    # Le daemon écrit `datetime('now')` (binance_ws.py:120) → UTC, mais SANS fuseau
    # (M12 de l'audit). On le parse donc explicitement comme de l'UTC.
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
    from scenario_engine import gex as G
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


# ─── 7. PREMIUM COINBASE ─────────────────────────────────────
@block("premium", required=("premium_pct", "coinbase_mid"))
def premium():
    from scenario_engine import coinbase_premium as CP
    p = CP.fetch_premium()
    # `not p` laissait passer le cas d'erreur : fetch_premium() renvoie
    # {"timestamp":…, "error":…} (coinbase_premium.py:138-141) — dict NON vide, donc
    # déclaré « ok », et les cinq champs partaient à None.
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

    data: dict = {
        "updated": ts,
        "generator": "publish.py v3.0 — live-only (10/09/2026)",
        "source": "binance · deribit · coinbase · yahoo · sol-radar-daemon",
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
