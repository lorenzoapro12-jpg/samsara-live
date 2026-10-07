#!/usr/bin/env bash
# Tous les contrôles, dans l'ordre. C'est la seule commande à retenir.
#
#   bash tests/run-all.sh
#
# Sort en code ≠ 0 dès le premier échec : à utiliser avant chaque publication.
set -uo pipefail
cd "$(dirname "$0")"

ko=0
etape() { printf '\n\033[1m── %s ──\033[0m\n' "$1"; }

etape "0. Compilation des scripts Python"
for f in ../publish.py ../heatmap.py ../samsara_config.py ../options_gex.py ../indicateurs.py test_meta.py refresh_harness.py scan-public.py test_calculs.py test_palette.py test_contrat.py theme_css.py test_polices.py test_fenetres.py ../fonts/fabriquer.py; do
  if python3 -m py_compile "$f" 2>/dev/null; then
    echo "  ✓ $f"
  else
    echo "  ✗ $f"; python3 -m py_compile "$f"; ko=1
  fi
done

etape "1. Calculs serveur (CVD, carnet, GEX, indicateurs, prime, heatmap) — hors ligne"
python3 test_calculs.py || ko=1

etape "1b. Libellés : chaque champ publié décrit, aucun nom ne ment sur sa formule — hors ligne"
python3 test_meta.py || ko=1

etape "2. Indicateurs de la page (SAR, ADX, RSI, EMA) — hors ligne"
node test_indicateurs.js || ko=1

etape "2b. Légendes : dérivées du code qui calcule, mode sans effet sur les valeurs, aucun conseil — hors ligne"
node test_fiches.js || ko=1

etape "2c. Réglages : le détail change, jamais la valeur ; constantes du fichier lues, jamais recopiées — hors ligne"
node test_reglages.js || ko=1

etape "3. Extraction du JavaScript inline"
python3 refresh_harness.py || ko=1

etape "4. Non-régression du dashboard (rendu réel, DOM stubbé)"
node test_render.js || ko=1

etape "5. Panneau ⚡ (fetch RÉSEAU réel vers Binance)"
node test_live.js || ko=1

etape "5b. Carte (bookmap) : fusion, décodage, exécutions, isolement — hors ligne"
node test_bookmap.js || ko=1

etape "5c. Carte (bookmap) rendue dans Chromium — Binance simulé (non exécuté sans Playwright)"
node test_bookmap_rendu.js || ko=1

etape "6. Scan de TOUS les fichiers publiés"
python3 scan-public.py || ko=1

etape "7. Palette de CHAQUE thème (contraste WCAG, séparation daltonisme) — hors ligne"
python3 test_palette.py || ko=1

etape "8. Contrat de la page (registre des thèmes, verre, budget mesuré, réseau) — hors ligne"
python3 test_contrat.py || ko=1

etape "8a. Protocole du banc de budget (prix vivant, mesures entrelacées) — hors ligne, sans navigateur"
node test_budget.js --controle || ko=1

etape "8b. Polices : registre, licences et noms réservés, LISEZMOI dérivé, @font-face servis — hors ligne"
python3 test_polices.py || ko=1

etape "8c. Structure « fenêtres » : jumeaux identiques hors jetons, contrastes de ses fonds — hors ligne"
python3 test_fenetres.py || ko=1

etape "9. Structures de thème dans Chromium : aucune valeur ni aucun âge perdu, réversibles (non exécuté sans Playwright)"
node test_structures.js || ko=1

etape "9a. Structure « fenêtres » dans Chromium : barre des tâches, fenêtre du graphique, barre d'état réajustée, téléphone (non exécuté sans Playwright)"
node test_fenetres.js || ko=1

etape "9b. Interface dans Chromium : menus dans l'écran, crochets du graphique, sous-graphes sans débordement (non exécuté sans Playwright)"
node test_interface.js || ko=1

# Le budget d'image (≈ 30 min : mesures entrelacées, prix en mouvement) ne tourne pas ici : il
# se relance quand une feuille de thème change — node tests/test_budget.js --enregistrer — et le
# contrat (étape 8) refuse une feuille dont la mesure n'est plus à jour.

printf '\n\033[1m════════════════════════════════════════\033[0m\n'
if [ "$ko" -eq 0 ]; then
  echo "✅ TOUS LES CONTRÔLES PASSENT"
else
  echo "❌ AU MOINS UN CONTRÔLE A ÉCHOUÉ"
fi
exit "$ko"
