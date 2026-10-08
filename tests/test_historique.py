#!/usr/bin/env python3
"""Contrôles HORS LIGNE de `historique.py` — amorçage, ajout, idempotence, index, lecture.

Ce que ces contrôles tiennent
----------------------------
1. **Amorçage depuis les commits.** L'historique d'avant ce script n'existe que dans les
   commits de `master` : on fabrique un dépôt qui en porte plusieurs versions, dont deux
   d'anciens formats, et on vérifie que chaque publication donne une ligne — et qu'un champ
   absent de l'époque reste VIDE, jamais zéro.
2. **Ajout.** Un passage de plus ajoute une ligne, et une seule.
3. **Idempotence.** Relancer ne duplique rien, n'écrit rien sur le disque, ne committe rien.
4. **Mois clos.** Une publication apportée pour un mois déjà clos est REFUSÉE et signalée.
5. **Index.** `status` ok, colonnes, période, lignes, trous détectés, `meta` complet, chaque
   fichier sous 1 Mo, et AUCUN chemin de machine dans un fichier publié.
6. **Lecture par une session distante.** Un clone neuf fait
   `git fetch --depth 1 --filter=blob:none origin historique` puis `git show FETCH_HEAD:…`
   et obtient l'index et un fichier de série — c'est la façon dont le dépôt est consommé.

Tout est local : le « dépôt distant » est un dépôt nu créé dans le répertoire temporaire.
"""
import csv
import datetime as dt
import json
import os
import shutil
import subprocess
import sys
import tempfile

ICI = os.path.dirname(os.path.abspath(__file__))
DEPOT = os.path.dirname(ICI)
sys.path.insert(0, DEPOT)

ko = 0
controles = 0


def check(titre, condition, detail=""):
    global ko, controles
    controles += 1
    if condition:
        print(f"  ✓ {titre}")
    else:
        ko = 1
        print(f"  ✗ {titre}" + (f"  — {detail}" if detail else ""))


def git(args, cwd, check_=True):
    p = subprocess.run(["git", "-C", cwd, *args], capture_output=True, text=True)
    if check_ and p.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)} : {p.stderr.strip()}")
    return p


# ─── FABRICATION D'UN DÉPÔT QUI PORTE UNE HISTOIRE ───────────────────────────
def doc(updated, prix=None, micro=None, btc_extra=None, liquidity=None, macro=None):
    """Une version plausible de market-data.json. Les blocs absents le restent : c'est ce
    qui distingue un ancien format d'un format complet."""
    d = {"updated": updated, "generator": "test", "source": "test"}
    if btc_extra is not None or prix is not None:
        d["btc"] = dict(btc_extra or {}, **({"price": prix} if prix is not None else {}))
    if micro is not None:
        d["micro"] = micro
    if liquidity is not None:
        d["liquidity"] = liquidity
    if macro is not None:
        d["macro"] = macro
    d["status"] = {} if micro is None else {"micro_futures": "ok"}
    d["errors"] = []
    return d


MICRO_ANCIEN = {"funding_rate_pct": -0.0041, "oi_btc": 94120.5, "ls_ratio": 1.21,
                "top_ls_ratio": 1.44, "taker_ratio": 0.93}
MICRO_COMPLET = dict(MICRO_ANCIEN, **{"cvd_1h_usd": -1250000.0, "cvd_4h_usd": 3400000.0,
                                      "cvd_24h_usd": -18700000.0, "gex_usd_1pct": 120500000.0,
                                      "gex_0_7j_usd_1pct": -9000000.0, "zero_gamma": 81000.0,
                                      "call_wall": 86000.0, "put_wall": 80000.0})
LIQ = {"ratio_bid_ask": 1.07}
MACRO = {"dxy_spot": 102.31, "vix": 15.4}

# Deux mois distincts : le mois clos (août) et le mois « courant » de la fabrique (septembre).
HISTORIQUE = [
    ("2026-08-31T23:45:00+00:00", doc("2026-08-31T23:45:00+00:00", 85210.0, MICRO_ANCIEN, liquidity=LIQ, macro=MACRO)),
    ("2026-08-31T23:55:00+00:00", doc("2026-08-31T23:55:00+00:00", 85244.0, MICRO_ANCIEN, liquidity=LIQ, macro=MACRO)),
    ("2026-09-01T00:05:00+00:00", doc("2026-09-01T00:05:00+00:00", 85190.0, MICRO_ANCIEN, liquidity=LIQ, macro=MACRO)),
    # 45 min après : DEUX créneaux manquants. Le trou doit être signalé, pas comblé.
    ("2026-09-01T00:50:00+00:00", doc("2026-09-01T00:50:00+00:00", 84980.0, MICRO_COMPLET, liquidity=LIQ, macro=MACRO)),
    ("2026-09-01T01:05:00+00:00", doc("2026-09-01T01:05:00+00:00", 85010.0, MICRO_COMPLET, liquidity=LIQ, macro=MACRO)),
]
DERNIER = HISTORIQUE[-1][1]


def fabriquer_depot(base):
    """Un dépôt `master` avec une publication par commit, un `out_dir` et un dépôt nu."""
    depot = os.path.join(base, "depot")
    os.makedirs(depot)
    git(["init", "-q", "-b", "master"], depot)
    git(["config", "user.email", "test@exemple.invalid"], depot)
    git(["config", "user.name", "test"], depot)
    for _updated, document in HISTORIQUE:
        with open(os.path.join(depot, "market-data.json"), "w", encoding="utf-8") as f:
            json.dump(document, f)
        git(["add", "--", "market-data.json"], depot)
        git(["commit", "-q", "-m", f"market-data {document['updated']}"], depot)

    nu = os.path.join(base, "origine.git")
    git(["init", "-q", "--bare", nu], base)
    # Le dépôt nu doit accepter un clone partiel, sinon le contrôle 6 ne teste rien.
    git(["config", "uploadpack.allowFilter", "true"], nu)
    git(["remote", "add", "origin", nu], depot)
    git(["push", "-q", "origin", "master"], depot)

    cfg = {
        "repo_dir": depot,
        "state_dir": os.path.join(base, "etat"),
        "out_dir": depot,
        "git_lock": os.path.join(base, "etat", "git.lock"),
        "git_remote": "origin",
        "git_branch": "master",
        "extra_module_paths": [],
        "cvd_database": None,
        "hist_dir": os.path.join(base, "etat", "historique"),
        "hist_branche": "historique",
    }
    os.makedirs(cfg["state_dir"], exist_ok=True)
    return cfg, nu


def ecrire_publication(cfg, document):
    with open(os.path.join(cfg["out_dir"], "market-data.json"), "w", encoding="utf-8") as f:
        json.dump(document, f)


def lire_csv_dicts(chemin):
    with open(chemin, encoding="utf-8", newline="") as f:
        return list(csv.DictReader(f))


def octets(chemin):
    return os.path.getsize(chemin)


def main():
    base = tempfile.mkdtemp(prefix="hist-test-")
    try:
        cfg, nu = fabriquer_depot(base)
        import historique as H

        hist = cfg["hist_dir"]
        f_aout = os.path.join(hist, "series", "positionnement", "2026-08.csv")
        f_sept = os.path.join(hist, "series", "positionnement", "2026-09.csv")

        # ─── 1. AMORÇAGE ────────────────────────────────────────────────────
        print("\n1. Amorçage depuis l'historique des commits")
        ecrire_publication(cfg, DERNIER)
        rc = H.principale(cfg, ["--sans-reseau"])
        check("le passage se termine sans anomalie", rc == 0, f"code {rc}, erreurs {H.ERRORS}")
        check("le mois clos (août) a son fichier", os.path.exists(f_aout))
        check("le mois « courant » (septembre) a le sien", os.path.exists(f_sept))

        aout, sept = lire_csv_dicts(f_aout), lire_csv_dicts(f_sept)
        check("août = 2 publications", len(aout) == 2, f"{len(aout)} lignes")
        check("septembre = 3 publications", len(sept) == 3, f"{len(sept)} lignes")
        check("l'ordre est chronologique",
              [l["updated"] for l in aout + sept] == [u for u, _ in HISTORIQUE],
              str([l["updated"] for l in aout + sept]))
        check("aucune ligne dupliquée à l'amorçage",
              len({l["updated"] for l in aout + sept}) == 5)

        with open(f_aout, encoding="utf-8") as f:
            entete = f.readline().strip()
        attendu = ",".join(c["nom"] for c in H.COLS_POSITIONNEMENT)
        check("l'en-tête porte les colonnes de la spécification", entete == attendu, entete)

        ancienne = aout[0]
        check("prix lu", ancienne["prix_usdt"] == "85210.00", ancienne["prix_usdt"])
        check("funding lu", ancienne["funding_pct"] == "-0.004100", ancienne["funding_pct"])
        check("ratio L/S lu", ancienne["ls_comptes"] == "1.2100", ancienne["ls_comptes"])
        check("ratio bid/ask lu", ancienne["ratio_bid_ask"] == "1.0700", ancienne["ratio_bid_ask"])
        check("DXY lu et formaté", ancienne["dxy"] == "102.310", ancienne["dxy"])
        check("champ ABSENT de l'ancien format = case VIDE, jamais zéro",
              ancienne["cvd_1h_usd"] == "" and ancienne["gex_usd_1pct"] == ""
              and ancienne["zero_gamma_usdt"] == "",
              f"cvd={ancienne['cvd_1h_usd']!r} gex={ancienne['gex_usd_1pct']!r}")
        check("le même champ est rempli quand la publication le porte",
              sept[1]["cvd_1h_usd"] == "-1250000" and sept[1]["gex_usd_1pct"] == "120500000",
              f"cvd={sept[1]['cvd_1h_usd']!r} gex={sept[1]['gex_usd_1pct']!r}")
        check("les colonnes non pourvues restent vides (prime hors USDT)",
              ancienne["prime_hors_usdt_pct"] == "")

        index = json.load(open(os.path.join(hist, "index.json"), encoding="utf-8"))
        # États admis, repris d'ARCHITECTURE.md : « non configuré » est un état NORMAL
        # (ici : pas de réseau demandé), il ne compte pas comme une panne.
        admis = lambda v: v == "ok" or v.startswith("non configuré")   # noqa: E731
        check("index : chaque étape déclare un état exploitable",
              all(admis(v) for v in index["status"].values()), str(index["status"]))
        check("les trois séries Binance sont déclarées, même sans réseau",
              all(k in index["status"] for k in
                  ("funding", "open_interest_1h", "long_short_1h")), str(list(index["status"])))
        check("index : aucune anomalie", index["errors"] == [], str(index["errors"]))

        # ─── 2. LE TROU SE SIGNALE, IL NE SE COMBLE PAS ─────────────────────
        print("\n2. Un trou se signale")
        t = H.trous([dt.datetime(2026, 9, 1, 0, 5, tzinfo=dt.timezone.utc),
                     dt.datetime(2026, 9, 1, 0, 50, tzinfo=dt.timezone.utc),
                     dt.datetime(2026, 9, 1, 1, 5, tzinfo=dt.timezone.utc)], 900)
        check("45 min d'écart = 2 créneaux manquants", len(t) == 1 and t[0]["manquants"] == 2, str(t))
        check("aucun trou inventé quand la cadence est tenue",
              H.trous([dt.datetime(2026, 9, 1, 0, 5, tzinfo=dt.timezone.utc),
                       dt.datetime(2026, 9, 1, 0, 20, tzinfo=dt.timezone.utc)], 900) == [])
        pos = index["series"]["positionnement"]
        check("le trou de 45 min est dans l'index", pos["trous_nombre"] == 1
              and pos["trous"][0]["manquants"] == 2, str(pos["trous"]))
        check("l'index donne période, lignes et fichiers",
              pos["periode"]["debut"].startswith("2026-08-31") and pos["lignes"] == 5
              and pos["fichiers"] == ["series/positionnement/2026-08.csv",
                                      "series/positionnement/2026-09.csv"],
              json.dumps({k: pos[k] for k in ("periode", "lignes", "fichiers")}, ensure_ascii=False))
        check("l'index décrit la cadence attendue",
              pos["cadence_s"] == 900 and index["series"]["funding"]["cadence_s"] == 28800)

        # ─── 3. AJOUT ───────────────────────────────────────────────────────
        print("\n3. Ajout d'une publication")
        nouvelle = doc("2026-09-01T01:20:00+00:00", 85150.0, MICRO_COMPLET, liquidity=LIQ, macro=MACRO)
        ecrire_publication(cfg, nouvelle)
        rc = H.principale(cfg, ["--sans-reseau"])
        check("le passage se termine sans anomalie", rc == 0, f"code {rc}, erreurs {H.ERRORS}")
        sept = lire_csv_dicts(f_sept)
        check("la série compte une ligne de plus", len(sept) == 4, f"{len(sept)} lignes")
        check("la ligne ajoutée est la bonne et arrive en fin",
              sept[-1]["updated"] == "2026-09-01T01:20:00+00:00"
              and sept[-1]["prix_usdt"] == "85150.00", str(sept[-1]))

        # ─── 4. IDEMPOTENCE ─────────────────────────────────────────────────
        print("\n4. Relancer ne duplique rien")
        avant = open(f_sept, encoding="utf-8").read()
        blob_avant = git(["rev-parse", "HEAD:series/positionnement/2026-09.csv"],
                         cfg["hist_dir"]).stdout.strip()
        rc = H.principale(cfg, ["--sans-reseau"])
        apres = open(f_sept, encoding="utf-8").read()
        check("le fichier est identique octet pour octet", avant == apres)
        check("aucune ligne de plus", len(lire_csv_dicts(f_sept)) == 4)
        blob_apres = git(["rev-parse", "HEAD:series/positionnement/2026-09.csv"],
                         cfg["hist_dir"]).stdout.strip()
        check("la série publiée ne bouge pas d'un octet", blob_avant == blob_apres,
              f"{blob_avant[:8]} → {blob_apres[:8]}")
        # Le fond du mécanisme : une écriture identique ne touche même pas le disque, donc
        # git ne voit aucun delta. (L'index, lui, est REDATÉ à chaque passage : c'est ce
        # qui rend son âge lisible par une session distante.)
        meme = os.path.join(base, "meme.csv")
        with open(meme, "w", encoding="utf-8") as f:
            f.write("a,b\n1,2\n")
        check("réécrire un contenu identique ne touche pas le fichier",
              H.ecrire_si_change("a,b\n1,2\n", meme) is False)
        check("un contenu différent, si",
              H.ecrire_si_change("a,b\n1,3\n", meme) is True)

        # ─── 5. UN MOIS CLOS NE SE RÉÉCRIT PAS ──────────────────────────────
        print("\n5. Un mois clos ne se réécrit pas")
        avant = open(f_aout, encoding="utf-8").read()
        tardive = doc("2026-08-31T23:40:00+00:00", 85000.0, MICRO_ANCIEN, liquidity=LIQ, macro=MACRO)
        ecrit = H.ajouter_positionnement(cfg, tardive, "2026-10")
        check("l'écriture dans un mois clos est refusée", ecrit is False)
        check("le fichier du mois clos est intact", open(f_aout, encoding="utf-8").read() == avant)
        check("le refus est SIGNALÉ", any("clos" in e for e in H.ERRORS), str(H.ERRORS))

        # ─── 6. INDEX : META, TAILLE, AUCUN CHEMIN DE MACHINE ───────────────
        print("\n6. Index : description complète et rien de local")
        index = json.load(open(os.path.join(hist, "index.json"), encoding="utf-8"))
        colonnes = index["series"]["positionnement"]["colonnes"]
        check("les colonnes de l'index sont celles de l'en-tête",
              colonnes == [c["nom"] for c in H.COLS_POSITIONNEMENT])
        manquants = [f"{s}.{c}" for s, spec in H.SERIES.items() for c in [x["nom"] for x in spec["cols"]]
                     if f"{s}.{c}" not in index["meta"]["champs"]]
        check("meta décrit CHAQUE colonne de chaque série", manquants == [], str(manquants))
        champs = index["meta"]["champs"]
        check("metadata complète (unité, source, formule, nature)",
              all(all(k in v and v[k] not in ("", None) for k in
                      ("libelle", "unite", "formule", "fenetre", "nature", "source"))
                  for v in champs.values()))
        check("une colonne vide est EXPLIQUÉE",
              "n'existait pas" in champs["positionnement.cvd_1h_usd"]["vide"]
              or "absent" in champs["positionnement.cvd_1h_usd"]["vide"].lower(),
              champs["positionnement.cvd_1h_usd"]["vide"])
        check("l'index décrit aussi les séries rapatriées",
              set(index["series"]) == {"positionnement", "funding", "open_interest_1h", "long_short_1h"},
              str(list(index["series"])))

        fichiers = [os.path.join(hist, f) for f in
                    [index["series"]["positionnement"]["fichiers"][0], "index.json"]]
        check("chaque fichier publié reste sous 1 Mo",
              all(octets(f) < 1_000_000 for f in fichiers),
              str([(os.path.basename(f), octets(f)) for f in fichiers]))

        # Projection : un mois plein (~96 publications/jour) doit tenir sous la limite.
        plein = H.texte_csv(H.COLS_POSITIONNEMENT,
                            [H.ligne_depuis_doc(DERNIER, H.COLS_POSITIONNEMENT)] * 3100)
        check("un mois complet projeté tient largement sous 1 Mo",
              len(plein.encode()) < 1_000_000, f"{len(plein.encode())} o pour 3 100 lignes")

        contenu = open(os.path.join(hist, "index.json"), encoding="utf-8").read()
        contenu += open(f_sept, encoding="utf-8").read() + open(f_aout, encoding="utf-8").read()
        fuites = [m for m in (base, cfg["repo_dir"], cfg["state_dir"], cfg["hist_dir"], "/root")
                  if m in contenu]
        check("aucun chemin de machine dans les fichiers publiés", fuites == [], str(fuites))
        local = os.path.join(ICI, "forbidden.local.json")
        if os.path.exists(local):
            import re
            motifs = [t for t in json.load(open(local, encoding="utf-8")).get("terms", []) if t]
            trouves = [t for t in motifs if re.search(t, contenu, re.I)]
            check(f"aucun motif interdit ({len(motifs)} motifs scannés)", trouves == [], str(trouves))

        # ─── 7. SÉRIES BINANCE : FUSION SANS DOUBLON ────────────────────────
        print("\n7. Séries rapatriées : une fois puis prolongées")
        points = [{"echeance_utc": "2026-09-01T00:00:00+00:00", "funding_pct": "0.010000",
                   "prix_marque_usdt": "85000.00"},
                  {"echeance_utc": "2026-09-01T08:00:00+00:00", "funding_pct": "0.012000",
                   "prix_marque_usdt": "85100.00"}]
        H.fusionner_serie(cfg, "funding", points)
        H.fusionner_serie(cfg, "funding", points)          # rejoué à l'identique
        chemin_funding = os.path.join(hist, "series", "funding.csv")
        lignes = lire_csv_dicts(chemin_funding)
        check("aucun doublon après rejeu", len(lignes) == 2, f"{len(lignes)} lignes")
        corrige = [dict(points[1], funding_pct="0.015000")]
        H.fusionner_serie(cfg, "funding", corrige)
        lignes = lire_csv_dicts(chemin_funding)
        check("un point reçu à nouveau REMPLACE l'ancien",
              len(lignes) == 2 and lignes[1]["funding_pct"] == "0.015000", str(lignes[1]))
        check("la série reste triée",
              [l["echeance_utc"] for l in lignes] == sorted(l["echeance_utc"] for l in lignes))

        # ── La garde de 1 Mo : elle REFUSE, elle ne tronque pas ────────────
        # On abaisse la limite au lieu de fabriquer un million d'octets : le chemin de
        # refus est le même, et il est ainsi réellement exercé. 100 o est en dessous de
        # toute ligne réelle (≈ 150 o pour le positionnement, ≈ 44 o pour le funding).
        limite = H.MAX_OCTETS
        H.MAX_OCTETS = 100
        try:
            H.ERRORS.clear()
            refuse = H.ajouter_positionnement(
                cfg, doc("2026-09-01T01:35:00+00:00", 85200.0, MICRO_COMPLET,
                         liquidity=LIQ, macro=MACRO), "2026-09")
            check("au-delà de la limite : l'écriture est REFUSÉE", refuse is False)
            check("le refus est bruyant (anomalie consignée)",
                  any("octets" in e for e in H.ERRORS), str(H.ERRORS))
            check("le refus ne tronque pas le fichier déjà écrit",
                  len(lire_csv_dicts(f_sept)) == 4, f"{len(lire_csv_dicts(f_sept))} lignes")
            H.fusionner_serie(cfg, "funding", [{"echeance_utc": "2026-09-01T16:00:00+00:00",
                                                "funding_pct": "0.011000",
                                                "prix_marque_usdt": "85200.00"}])
            check("la même garde protège les séries rapatriées",
                  len(lire_csv_dicts(chemin_funding)) == 2
                  and H.STATUS["funding"].startswith("error"),
                  f"{len(lire_csv_dicts(chemin_funding))} lignes, statut {H.STATUS['funding']}")
        finally:
            H.MAX_OCTETS = limite

        # ─── 8. UNITÉ DE LA PART LONGUE ─────────────────────────────────────
        # Le contrôle tient une IDENTITÉ : la part publiée vaut 100 × ratio / (1 + ratio).
        # Le défaut qui l'a fait naître est fourni tel quel — une série écrite en FRACTION —
        # et le harnais exige qu'il soit ATTRAPÉ avant migration, puis plus après. Un
        # contrôle qu'on n'a jamais vu échouer ne prouve rien.
        print("\n8. Unité de la part longue : le contrôle attrape une fraction")
        ratio_c, ratio_g = 1.7233, 1.5798
        part_source_c = 0.6328                    # ce que Binance rend : une FRACTION
        attendu_c = H.part_attendue_pct(ratio_c)
        check("l'identité reconstruit la part de la source (ratio 1,7233 → 63,28 %)",
              abs(attendu_c - 63.28) <= H.TOLERANCE_PCT, f"{attendu_c}")
        check("l'arrondi de la source est dans la tolérance du contrôle",
              abs(part_source_c * 100 - attendu_c) <= H.TOLERANCE_PCT,
              f"source {part_source_c * 100} contre {attendu_c}")

        # (a) LE PRODUCTEUR. Binance rend longAccount en fraction ; la colonne publiée est
        #     en pourcentage, et ses décimales viennent de la spécification.
        def faux_api(url, timeout=25):
            if "globalLongShortAccountRatio" in url:
                return [{"timestamp": 1791435600000, "longShortRatio": "1.7233",
                         "longAccount": "0.6328"}]
            if "topLongShortPositionRatio" in url:
                return [{"timestamp": 1791435600000, "longShortRatio": "1.5798",
                         "longAccount": "0.6124"}]
            if "takerlongshortRatio" in url:
                return [{"timestamp": 1791435600000, "buySellRatio": "0.9477"}]
            raise RuntimeError("URL non simulée : " + url)

        vraie_api = H.api_json
        H.api_json = faux_api
        try:
            point = H.points_long_short()[0]
        finally:
            H.api_json = vraie_api
        check("la part est publiée × 100, pas en fraction",
              point["comptes_longs_pct"] == "63.28" and point["gros_longs_pct"] == "61.24",
              str(point))
        check("les décimales publiées sont celles de la spécification (dec de COLS_LS)",
              len(point["comptes_longs_pct"].split(".")[1])
              == H.dec_de(H.COLS_LS, "comptes_longs_pct"), point["comptes_longs_pct"])

        # (b) LE CONTRÔLE, sur un fichier fabriqué.
        chemin_ls = os.path.join(hist, "series", "long-short-1h.csv")

        def ligne_ls(heure, rc, rg):
            """Ligne CONFORME : la part vaut l'identité appliquée au ratio de la même ligne."""
            return {"heure_utc": heure, "ls_comptes": f"{rc:.4f}",
                    "comptes_longs_pct": H.nombre(H.part_attendue_pct(rc), 2),
                    "ls_gros_traders": f"{rg:.4f}",
                    "gros_longs_pct": H.nombre(H.part_attendue_pct(rg), 2),
                    "taker_ratio_volume": "0.9477"}

        def ecrire_ls(lignes):
            with open(chemin_ls, "w", encoding="utf-8") as f:
                f.write(H.texte_csv(H.COLS_LS, lignes))

        conformes = [ligne_ls("2026-10-08T03:00:00+00:00", 1.7442, 1.5608),
                     ligne_ls("2026-10-08T04:00:00+00:00", 1.7427, 1.5273)]
        ecrire_ls(conformes)
        check("un fichier conforme ne déclenche rien",
              H.controler_part_longue(chemin_ls) == [], str(H.controler_part_longue(chemin_ls)))

        # Le défaut historique, à l'identique : les deux cellules en FRACTION.
        fautives = [dict(l, comptes_longs_pct="0.6356", gros_longs_pct="0.6095")
                    for l in conformes]
        ecrire_ls(fautives)
        ecarts = H.controler_part_longue(chemin_ls)
        check("une série en FRACTION est REFUSÉE (2 lignes × 2 colonnes)",
              len(ecarts) == 4, str(ecarts))
        check("le désaccord est chiffré et nomme la colonne",
              any("comptes_longs_pct=0.6356" in e and "63.56" in e for e in ecarts), str(ecarts))

        # Sensibilité : la tolérance laisse passer l'arrondi, pas une erreur d'un point.
        un_point = [dict(l, comptes_longs_pct=H.nombre(H.part_attendue_pct(1.7442) + 1, 2))
                    for l in conformes]
        ecrire_ls(un_point)
        check("un écart d'un point de pourcentage est attrapé",
              len(H.controler_part_longue(chemin_ls)) == 2,
              str(H.controler_part_longue(chemin_ls)))

        # Une ligne sans valeur n'est pas un désaccord : la case vide est un état légitime.
        vides = [{"heure_utc": "2026-10-08T05:00:00+00:00", "ls_comptes": "",
                  "comptes_longs_pct": "", "ls_gros_traders": "", "gros_longs_pct": "",
                  "taker_ratio_volume": "0.9477"}]
        ecrire_ls(vides)
        check("les lignes vides ne produisent pas de faux positif",
              H.controler_part_longue(chemin_ls) == [], str(H.controler_part_longue(chemin_ls)))

        # (c) LA MIGRATION : elle recalcule depuis le ratio, donc relancer ne double rien.
        ecrire_ls(fautives)
        corrigees = H.migrer_part_longue(cfg)
        apres = lire_csv_dicts(chemin_ls)
        check("la migration remet les 4 cellules en pourcentage", corrigees == 4, str(corrigees))
        check("la valeur relue est celle que `meta` annonce",
              apres[0]["comptes_longs_pct"] == "63.56" and apres[0]["gros_longs_pct"] == "60.95",
              str(apres[0]))
        check("la migration rend le fichier conforme au contrôle",
              H.controler_part_longue(chemin_ls) == [], str(H.controler_part_longue(chemin_ls)))
        octets_avant = open(chemin_ls, encoding="utf-8").read()
        H.migrer_part_longue(cfg)                      # rejouée
        check("rejouer la migration ne change pas un octet (elle RECALCULE, elle ne × 100 pas)",
              open(chemin_ls, encoding="utf-8").read() == octets_avant
              and lire_csv_dicts(chemin_ls)[0]["comptes_longs_pct"] == "63.56",
              lire_csv_dicts(chemin_ls)[0]["comptes_longs_pct"])
        # Une ligne sans ratio reste vide : la migration n'invente pas de valeur.
        ecrire_ls(vides)
        H.migrer_part_longue(cfg)
        check("une ligne sans ratio reste VIDE après migration",
              lire_csv_dicts(chemin_ls)[0]["comptes_longs_pct"] == "",
              str(lire_csv_dicts(chemin_ls)[0]))

        # (d) L'INDEX PUBLIE LE VERDICT : un désaccord doit se voir à distance, et faire
        #     échouer le passage.
        ecrire_ls(fautives)
        H.reinitialiser()
        index = H.construire_index(cfg, "2026-10-08T05:40:00+00:00")
        controle = index["series"]["long_short_1h"]["controle"]
        check("l'index porte l'identité et sa tolérance",
              controle["identite"] == "100 × ratio / (1 + ratio)"
              and controle["tolerance_pct"] == H.TOLERANCE_PCT, str(controle))
        check("l'index porte les désaccords (4)", len(controle["desaccords"]) == 4,
              str(controle["desaccords"]))
        check("l'état du passage est en erreur",
              H.STATUS["long_short_1h_controle"].startswith("error"),
              H.STATUS["long_short_1h_controle"])
        check("l'anomalie est bruyante (code 1 à la sortie du script)",
              any("ratio / (1 + ratio)" in e for e in H.ERRORS), str(H.ERRORS))
        H.migrer_part_longue(cfg)                      # on rend le fichier conforme
        H.reinitialiser()
        index = H.construire_index(cfg, "2026-10-08T05:40:00+00:00")
        check("fichier conforme : contrôle ok, aucune anomalie",
              index["series"]["long_short_1h"]["controle"]["desaccords"] == []
              and H.STATUS["long_short_1h_controle"] == "ok" and H.ERRORS == [], str(H.ERRORS))

        # ─── 9. LECTURE PAR UNE SESSION DISTANTE ────────────────────────────
        print("\n9. Lecture depuis un clone neuf (fetch --depth 1 --filter=blob:none)")
        H.publier(cfg, "Historique test")
        pousse = git(["rev-parse", cfg["hist_branche"]], nu, check_=False)
        check("la branche `historique` est bien sur le dépôt distant",
              pousse.stdout.strip() != "", pousse.stderr.strip())
        frais = os.path.join(base, "frais")
        os.makedirs(frais)
        git(["init", "-q"], frais)
        git(["remote", "add", "origin", nu], frais)
        f = git(["fetch", "--depth", "1", "--filter=blob:none", "origin", cfg["hist_branche"]],
                frais, check_=False)
        check("le fetch partiel passe", f.returncode == 0, f.stderr.strip())
        idx = git(["show", "FETCH_HEAD:index.json"], frais, check_=False)
        check("git show FETCH_HEAD:index.json rend l'index", idx.returncode == 0, idx.stderr.strip())
        if idx.returncode == 0:
            lointain = json.loads(idx.stdout)
            check("l'index lu porte un status exploitable",
                  lointain["status"].get("positionnement") == "ok"
                  and lointain["updated"], str(lointain["status"]))
            check("l'index lu décrit les fichiers de série",
                  lointain["series"]["positionnement"]["fichiers"][-1].endswith("2026-09.csv"))
        ser = git(["show", "FETCH_HEAD:series/positionnement/2026-09.csv"], frais, check_=False)
        check("git show FETCH_HEAD:series/… rend la série", ser.returncode == 0, ser.stderr.strip())
        if ser.returncode == 0:
            check("la série lue porte ses 4 lignes",
                  len(ser.stdout.strip().splitlines()) == 5,   # en-tête + 4
                  f"{len(ser.stdout.strip().splitlines())} lignes")

        # ─── 10. LIGNE DE COMMANDE ──────────────────────────────────────────
        print("\n10. Ligne de commande (code de sortie)")
        base2 = tempfile.mkdtemp(prefix="hist-cli-")
        try:
            cfg2, _ = fabriquer_depot(base2)
            conf = os.path.join(base2, "config.local.json")
            with open(conf, "w", encoding="utf-8") as f2:
                json.dump({"repo_dir": cfg2["repo_dir"], "state_dir": cfg2["state_dir"],
                           "out_dir": cfg2["out_dir"], "hist_dir": cfg2["hist_dir"],
                           "git_remote": "origin"}, f2)
            env = dict(os.environ, SAMSARA_CONFIG=conf)
            r = subprocess.run([sys.executable, os.path.join(DEPOT, "historique.py"),
                                "--sans-reseau", "--sans-pousser"],
                               capture_output=True, text=True, env=env, cwd=base2)
            check("sortie 0 quand tout va bien", r.returncode == 0, r.stdout[-600:] + r.stderr[-400:])
            chemin_index = os.path.join(cfg2["hist_dir"], "index.json")
            check("l'index est écrit", os.path.exists(chemin_index))
            # Ce qui est publié ne décrit que les fichiers — jamais l'installation. Le
            # journal du cron, lui, cite le fichier de configuration : c'est voulu, il
            # sert à savoir ce qui est branché, et il n'est pas publié.
            if os.path.exists(chemin_index):
                publie = open(chemin_index, encoding="utf-8").read()
                check("l'index publié ne porte aucun chemin de machine",
                      not any(m in publie for m in (base2, cfg2["repo_dir"], cfg2["hist_dir"],
                                                    cfg2["state_dir"], "/root")),
                      publie[:200])
        finally:
            shutil.rmtree(base2, ignore_errors=True)
    finally:
        shutil.rmtree(base, ignore_errors=True)

    print(f"\n{controles - ko}/{controles} contrôles passent")
    return ko


if __name__ == "__main__":
    sys.exit(main())
