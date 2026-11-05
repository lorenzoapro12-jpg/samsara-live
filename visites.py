#!/usr/bin/env python3
"""Sauvegarde des visites du site (GoatCounter) sur le VPS — à lancer une fois par jour.

Le compteur du site (js/mesure.js) envoie les visites, anonymes, à GoatCounter. Ce script
en garde une copie chez soi, pour ne pas dépendre du service et pour pouvoir les étudier :
il demande à GoatCounter un export CSV des visites arrivées depuis la dernière sauvegarde,
attend qu'il soit prêt, le range dans DOSSIER/exports/ et note où reprendre.

Les visites ne vont JAMAIS dans ce dépôt (public) : seulement dans DOSSIER, sur le VPS.

Réglages (variables d'environnement) :
  GOATCOUNTER_CODE   le code du compte (samsara → https://samsara.goatcounter.com)
  VISITES_DOSSIER    où ranger (défaut /root/.hermes/visites)
  La clé d'API est lue dans DOSSIER/cle (une ligne, chmod 600), jamais en argument.

GoatCounter n'accepte qu'un export par heure : un second lancement dans l'heure sort
proprement (code 0) sans rien perdre, le curseur n'ayant pas bougé.
"""
import gzip
import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

DOSSIER = os.environ.get("VISITES_DOSSIER", "/root/.hermes/visites")
CODE = os.environ.get("GOATCOUNTER_CODE", "").strip()
ATTENTE_MAX_S = 600


def journal(msg):
    print(f"[visites {datetime.now(timezone.utc):%Y-%m-%dT%H:%M:%SZ}] {msg}", flush=True)


def appel(methode, chemin, cle, corps=None):
    url = f"https://{CODE}.goatcounter.com/api/v0{chemin}"
    data = json.dumps(corps).encode() if corps is not None else None
    req = urllib.request.Request(url, data=data, method=methode, headers={
        "Authorization": f"Bearer {cle}", "Content-Type": "application/json",
        "User-Agent": "samsara-visites/1"})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def lire_etat(chemin):
    try:
        with open(chemin) as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def ecrire_atomique(chemin, octets):
    tmp = chemin + ".tmp"
    with open(tmp, "wb") as f:
        f.write(octets)
    os.replace(tmp, chemin)


def compter_lignes(octets):
    brut = gzip.decompress(octets) if octets[:2] == b"\x1f\x8b" else octets
    lignes = [l for l in brut.decode("utf-8", "replace").splitlines() if l.strip()]
    return max(0, len(lignes) - 1)   # sans l'en-tête


def main():
    if not CODE:
        journal("GOATCOUNTER_CODE manquant"); return 2
    try:
        with open(os.path.join(DOSSIER, "cle")) as f:
            cle = f.read().strip()
    except OSError:
        journal(f"clé absente : {DOSSIER}/cle"); return 2
    os.makedirs(os.path.join(DOSSIER, "exports"), exist_ok=True)
    chemin_etat = os.path.join(DOSSIER, "etat.json")
    etat = lire_etat(chemin_etat)
    depuis = int(etat.get("last_hit_id") or 0)

    st, rep = appel("POST", "/export", cle, {"format": "csv", "start_from_hit_id": depuis})
    if st == 429 or (st == 400 and b"hour" in rep.lower()):
        journal("export déjà demandé dans l'heure : on réessaiera au prochain passage"); return 0
    if st != 202:
        journal(f"demande refusée ({st}) : {rep[:300]!r}"); return 1
    exp = json.loads(rep)
    ident = exp["id"]

    debut = time.time()
    while True:
        st, rep = appel("GET", f"/export/{ident}", cle)
        info = json.loads(rep) if st == 200 else {}
        if info.get("error"):
            journal(f"export {ident} en erreur : {info['error']}"); return 1
        if info.get("finished_at"):
            break
        if time.time() - debut > ATTENTE_MAX_S:
            journal(f"export {ident} pas prêt après {ATTENTE_MAX_S} s"); return 1
        time.sleep(5)

    st, octets = appel("GET", f"/export/{ident}/download", cle)
    if st != 200:
        journal(f"téléchargement refusé ({st}) : {octets[:300]!r}"); return 1
    lignes = compter_lignes(octets)
    if lignes:
        nom = f"visites-{datetime.now(timezone.utc):%Y-%m-%dT%H%M}-{depuis}.csv" + (".gz" if octets[:2] == b"\x1f\x8b" else "")
        ecrire_atomique(os.path.join(DOSSIER, "exports", nom), octets)
    fin = int(info.get("last_hit_id") or depuis)
    etat.update(last_hit_id=max(depuis, fin), derniere=datetime.now(timezone.utc).isoformat(timespec="seconds"),
                lignes_derniere=lignes, total=int(etat.get("total") or 0) + lignes)
    ecrire_atomique(chemin_etat, json.dumps(etat, indent=1).encode())
    journal(f"{lignes} visites ou événements sauvegardés (curseur {depuis} → {etat['last_hit_id']}, total {etat['total']})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
