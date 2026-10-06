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
for f in ../publish.py ../heatmap.py ../samsara_config.py ../options_gex.py ../indicateurs.py test_meta.py refresh_harness.py scan-public.py test_calculs.py test_palette.py test_contrat.py theme_css.py; do
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

etape "3. Extraction du JavaScript inline"
python3 refresh_harness.py || ko=1

etape "4. Non-régression du dashboard (rendu réel, DOM stubbé)"
node test_render.js || ko=1

etape "5. Panneau ⚡ (fetch RÉSEAU réel vers Binance)"
node test_live.js || ko=1

etape "6. Scan de TOUS les fichiers publiés"
python3 scan-public.py || ko=1

etape "7. Palette de CHAQUE thème (contraste WCAG, séparation daltonisme) — hors ligne"
python3 test_palette.py || ko=1

etape "8. Contrat de la page (registre des thèmes, verre, performance, réseau) — hors ligne"
python3 test_contrat.py || ko=1

printf '\n\033[1m════════════════════════════════════════\033[0m\n'
if [ "$ko" -eq 0 ]; then
  echo "✅ TOUS LES CONTRÔLES PASSENT"
else
  echo "❌ AU MOINS UN CONTRÔLE A ÉCHOUÉ"
fi
exit "$ko"
