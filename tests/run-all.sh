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
for f in ../publish.py ../heatmap.py ../executions.py ../profondeur.py ../historique.py ../samsara_config.py ../options_gex.py ../indicateurs.py ../fonts/fabriquer.py *.py; do   # tout script Python des tests : aucune liste à tenir
  if python3 -m py_compile "$f" 2>/dev/null; then
    echo "  ✓ $f"
  else
    echo "  ✗ $f"; python3 -m py_compile "$f"; ko=1
  fi
done

etape "1. Calculs serveur (CVD, carnet, GEX, indicateurs, prime, heatmap) — hors ligne"
python3 test_calculs.py || ko=1

etape "1a. Heatmap publiée : format colonnes-1 sans perte, octets stables d'une publication à l'autre, cadence 15 min — hors ligne"
python3 test_heatmap_format.py || ko=1

etape "1d. Exécutions (executions.py) : seaux, sens achat / vente, fenêtre 24 h, reprise, trou publié — hors ligne"
python3 test_executions.py || ko=1

etape "1e. Profondeur Coinbase (profondeur.py) : somme par tranche, bande ±10 %, pas de 5 min, 24 h — hors ligne"
python3 test_profondeur.py || ko=1

etape "1c. Historique : amorçage depuis les commits, ajout, idempotence, mois clos, index, lecture par fetch partiel, unité de la part longue (100 × ratio/(1+ratio)) — hors ligne"
python3 test_historique.py || ko=1

etape "1b. Libellés : chaque champ publié décrit, aucun nom ne ment sur sa formule — hors ligne"
python3 test_meta.py || ko=1

etape "2. Indicateurs de la page (SAR, ADX, RSI, EMA) — hors ligne"
node test_indicateurs.js || ko=1

etape "2b. Légendes : dérivées du code qui calcule, mode sans effet sur les valeurs, aucun conseil — hors ligne"
node test_fiches.js || ko=1

etape "2c. Réglages : le détail change, jamais la valeur ; constantes du fichier lues, jamais recopiées — hors ligne"
node test_reglages.js || ko=1

etape "2d. Indicateurs réécrits en boucles : les mêmes valeurs qu'avant, au bit près, sur 3 000 bougies réelles — hors ligne"
node test_indicateurs_boucles.js || ko=1

etape "2e. Chaleur : les deux formats publiés donnent la même couche ; même publication = aucune analyse — hors ligne"
node test_chaleur.js || ko=1

etape "2f. Réseau : ce que la page demande et quand (revalidation, prix MINI, préchargement, bougies) — hors ligne"
node test_reseau.js || ko=1

etape "2f'. Repli Binance : api.binance.com d'abord, miroir data-api.binance.vision si refusé ou injoignable — hors ligne"
node test_binance_repli.js || ko=1

etape "2g. Horloges : liste dérivée de meta.champs, pannes nommées, décalage avec Binance — hors ligne"
node test_horloges.js || ko=1

etape "2h. Contre-expertise : la publication recalculée sur des réponses Binance enregistrées — hors ligne"
node test_contre.js || ko=1

etape "2i. Chronique : historique des publications relu dans git (arrêts, trous, cache, tracés) — hors ligne"
node test_chronique.js || ko=1

etape "2j. Guide du graphique : niveaux nommés, règle de cassure, régime, formes rejouées sans regarder l'avenir, mots sans conseil — hors ligne"
node test_guide.js || ko=1

etape "2k. Scénarios du matin : lecture du fichier, suivi des zones dans l'ordre, range, note du journal d'abord, aucun pourcentage en débutant, mots sans conseil — hors ligne"
node test_scenarios.js || ko=1

etape "3. Extraction du JavaScript inline"
python3 refresh_harness.py || ko=1

etape "4. Non-régression du dashboard (rendu réel, DOM stubbé)"
node test_render.js || ko=1

etape "5. Panneau ⚡ (fetch RÉSEAU réel vers Binance)"
node test_live.js || ko=1

etape "5b. Carte (bookmap) : fusion, décodage, exécutions, isolement — hors ligne"
node test_bookmap.js || ko=1

etape "5b1. Carte (bookmap) : liste des mots interdits à l'écran débutant — se contrôle elle-même"
node mots_debutant.js || ko=1

etape "5b2. Carte (bookmap) : le Guide — murs en mots, résumé, journal, zones, mots interdits — hors ligne"
node test_guide_carte.js || ko=1

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

etape "9b'. Guide du graphique dans Chromium : chaque bande nommée, heures gardées à 390 px, deux chemins ensemble, survol et tap (non exécuté sans Playwright)"
node test_guide_page.js || ko=1

etape "9b''. Scénarios du matin dans Chromium : encadré, libellé du rang 1, survol et tap, fichier d'attente, fichier absent, masquage (non exécuté sans Playwright)"
node test_scenarios_page.js || ko=1

etape "9b''a. Scénarios du matin, la journée (hors ligne) : écart, nom décidé aux clôtures de 15 min, fondu, lignes et textes sans probabilité"
node test_scenarios_jour.js || ko=1

etape "9b''b. Scénarios du matin, la journée dans Chromium (08/10 rejoué) : page = calcul pur, Débutant ≤ 5 textes, pastilles, fondu, sobriété (non exécuté sans Playwright)"
node test_scenarios_jour_page.js || ko=1

etape "9b''c. Scénarios du matin, rejeu animé (bougie en cours qui bouge) : le nom ne change qu'aux clôtures, la ligne suit, journée « aucun » (non exécuté sans Playwright)"
node test_scenarios_rejeu.js || ko=1

etape "9b''d. Scénarios du matin, la journée après revue (hors ligne) : 4 h / 1 j / incomplet jamais « aucun », remplaçant figé, nom dit seulement au plus petit écart, coches dans l'ordre, marques des libellés"
node test_scenarios_jour_suivi.js || ko=1

etape "9b''e. Scénarios du matin, la journée après revue dans Chromium : 4 h / 1 j / 1 min incomplet, bulle dessinée qui nomme, croix du rang 1 en fondu, niveaux gardés en Expert (non exécuté sans Playwright)"
node test_scenarios_jour_revue_page.js || ko=1

etape "9b‴. Débutant à l'écran dans Chromium : au plus 5 textes, phrase et repères aux mêmes prix, bulles au survol et au toucher, cartes et menu sans jargon, 11 thèmes (non exécuté sans Playwright)"
node test_debutant_page.js || ko=1

etape "9c. Sobriété dans Chromium : éclair, horloge, onde, calque, verre, chargement, chaleur (non exécuté sans Playwright)"
node test_sobriete.js || ko=1
etape "9d. Thème Gare dans Chromium : palettes à 1ch, provenance lue dans CADENCES, remarque d'âge, chutes à l'événement, démontage (non exécuté sans Playwright)"
node test_gare.js || ko=1
etape "9e. Structure « une » (Gazette) dans Chromium : manchette recopiée de la cote, tampon à l'édition nouvelle, cadences lues, démontage, mise en page (non exécuté sans Playwright)"
node test_gazette.js || ko=1
etape "9f. Structure « planche » (Cyanotype, Diazo) : jumeaux identiques hors jetons, pied de planche, cartouche, nuage de révision, canvas suivi, démontage (Chromium ; jumeaux hors ligne)"
node test_planche.js || ko=1

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
