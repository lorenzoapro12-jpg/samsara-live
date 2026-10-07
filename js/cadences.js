// ═══════════════════════════════════════════════════════════════════════════════
// CADENCES — à quel rythme la page lit ses sources, et quand une publication est en retard.
// ─────────────────────────────────────────────────────────────────────────────
// UNE table, lue partout : par les minuteries (js/app.js : init, toggleDepth, forward du bot),
// par les seuils d'âge (voyant, bandeau d'âge, bande des chiffres clés) et par toute étiquette
// de cadence (cartes, réglages, décor d'une structure de thème). Une étiquette qui recopierait
// « 15 min » à la main mentirait le jour où le cron change ; tests/test_fiches.js échoue si un
// de ces nombres réapparaît en dur à leurs places d'usage.
//
// Fichier À PART, chargé avant js/structures.js : une structure de thème se construit dès son
// chargement, avant js/app.js, et son décor peut déjà dire une cadence.
// ═══════════════════════════════════════════════════════════════════════════════
const CADENCES = {
  prix: 1000,             // ms — ticker Binance : prix héros, variation 24 h
  bougies: 5000,          // ms — bougies Binance de l'intervalle affiché
  publication_lue: 60000, // ms — relecture de market-data.json (publié par le serveur)
  chaleur_lue: 60000,     // ms — relecture de heatmap.json, couche « Liquidité » allumée
  niveaux_sr: 60000,      // ms — supports / résistances des échelles de temps de référence
  horloge: 1000,          // ms — horloge de la barre des tâches
  attendue_min: 15,       // min — cadence de publication du serveur (cron)
  vieux_min: 20,          // min — au-delà : une publication manquée (« retard »)
  fige_min: 32,           // min — au-delà : deux publications manquées (« figé »)
};
