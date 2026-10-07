#!/usr/bin/env python3
"""Configuration locale — ce fichier ne contient AUCUN chemin en dur.

Pourquoi il existe
------------------
`publish.py` et `heatmap.py` tournent sur une machine précise, avec une arborescence
précise. Écrire ces chemins dans le code publié revient à publier le plan de la machine.
Ils vivent donc dans `config.local.json`, qui est **gitignoré**, tandis que le code ne
connaît que des noms de clés.

Conséquence voulue : **le dépôt cloné fonctionne sans rien configurer.** Tous les défauts
sont dérivés de l'emplacement de ce fichier, donc aucun chemin absolu n'est nécessaire
pour lancer les blocs qui ne dépendent que de sources publiques.

Clés (toutes optionnelles)
--------------------------
  repo_dir            racine du dépôt                       défaut : dossier de ce fichier
  state_dir           état persistant (heatmap)              défaut : <repo>/.state
  out_dir             où écrire les JSON publiés              défaut : repo_dir
  git_lock            verrou partagé entre les écrivains      défaut : <state_dir>/git.lock
  git_remote          nom du remote                           défaut : origin
  git_branch          branche publiée                         défaut : master
  extra_module_paths  chemins à ajouter à sys.path            défaut : []
  cvd_database        OBSOLÈTE depuis le 04/10/2026 — plus lue   défaut : None
                      (le CVD vient des bougies Binance) ; acceptée pour ne pas
                      casser une config existante.
  hist_dir            répertoire de travail de la branche        défaut : <state_dir>/historique
                      `historique` (historique.py) — un worktree à part,
                      pour ne jamais toucher l'index ni l'arbre de master
  hist_branche        branche orpheline des séries historiques   défaut : historique

Les chemins relatifs sont résolus depuis le dossier du dépôt. Une valeur `null` ou absente
prend le défaut : il n'y a pas de « clé manquante » qui casse le script.

Priorité : $SAMSARA_CONFIG > ./config.local.json > défauts.
"""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
CONFIG_FILE = os.environ.get("SAMSARA_CONFIG") or os.path.join(HERE, "config.local.json")

_DEFAULTS = {
    "repo_dir": HERE,
    "state_dir": None,          # None -> <repo>/.state, résolu plus bas
    "out_dir": HERE,
    "git_lock": None,           # None -> <state_dir>/git.lock
    "git_remote": "origin",
    "git_branch": "master",
    "extra_module_paths": [],
    "cvd_database": None,
    "hist_dir": None,           # None -> <state_dir>/historique
    "hist_branche": "historique",
}

_PATH_KEYS = ("repo_dir", "state_dir", "out_dir", "git_lock", "cvd_database", "hist_dir")


def _abs(base, value):
    """Résout un chemin relatif depuis `base`. Un chemin absolu est laissé tel quel."""
    if not value:
        return value
    return value if os.path.isabs(value) else os.path.normpath(os.path.join(base, value))


def load():
    cfg = dict(_DEFAULTS)
    if os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, encoding="utf-8") as f:
            for k, v in json.load(f).items():
                # Une clé « _ » est un commentaire ; une valeur `null` veut dire
                # « prends le défaut ». Recopier config.example.json tel quel est donc
                # sans effet — c'est voulu : la copie ne peut pas casser l'installation.
                if k.startswith("_") or v is None:
                    continue
                cfg[k] = v

    # Les chemins relatifs se lisent depuis le dépôt, pas depuis le cwd : le script
    # doit donner le même résultat qu'on le lance depuis /tmp ou depuis le dépôt.
    for key in _PATH_KEYS:
        cfg[key] = _abs(HERE, cfg.get(key))

    if cfg["state_dir"] is None:
        cfg["state_dir"] = os.path.join(cfg["repo_dir"], ".state")
    cfg["state_dir"] = _abs(cfg["repo_dir"], cfg["state_dir"])
    if cfg["git_lock"] is None:
        cfg["git_lock"] = os.path.join(cfg["state_dir"], "git.lock")
    cfg["git_lock"] = _abs(cfg["repo_dir"], cfg["git_lock"])
    # Répertoire de travail de la branche `historique` : un worktree À PART, sinon le
    # troisième écrivain toucherait l'index et l'arbre de master. Dérivé du state_dir
    # comme le reste : un clone nu n'a rien à configurer.
    if cfg["hist_dir"] is None:
        cfg["hist_dir"] = os.path.join(cfg["state_dir"], "historique")
    cfg["hist_dir"] = _abs(cfg["repo_dir"], cfg["hist_dir"])

    paths = cfg.get("extra_module_paths") or []
    if not isinstance(paths, list):
        raise ValueError("extra_module_paths doit être une liste de chaînes")
    cfg["extra_module_paths"] = [_abs(cfg["repo_dir"], p) for p in paths if p]

    return cfg


def out(cfg, name):
    """Chemin d'un fichier publié."""
    return os.path.join(cfg["out_dir"], name)


def state(cfg, name):
    """Chemin d'un fichier d'état (jamais publié)."""
    return os.path.join(cfg["state_dir"], name)


def add_module_paths(cfg):
    """Ajoute les chemins privés à sys.path. Silencieux s'il n'y en a pas : un dépôt
    cloné n'a aucune raison d'avoir les modules d'à côté."""
    import sys
    for p in cfg["extra_module_paths"]:
        if os.path.isdir(p) and p not in sys.path:
            sys.path.insert(0, p)


def describe(cfg):
    """Résumé imprimable — sans jamais révéler un chemin : on dit ce qui est branché,
    pas où c'est."""
    return {
        "config_file": CONFIG_FILE if os.path.exists(CONFIG_FILE) else "(défauts — aucun config.local.json)",
        "repo_dir": "défini" if cfg["repo_dir"] != HERE else "= dossier du script",
        "state_dir": "défini" if cfg["state_dir"] != os.path.join(cfg["repo_dir"], ".state") else "par défaut",
        "modules_privés": len(cfg["extra_module_paths"]),
    }
