// Mots qu'un débutant ne doit pas lire sur son écran (mode Débutant), partagés par les tests.
//
// La règle du propriétaire : en mode Débutant, l'écran se lit sans connaître le vocabulaire
// des marchés ; tout le détail technique reste derrière le bouton « Expert ». La liste est
// UNIQUE pour tout le site : Guide.MOTS_BANNIS_DEBUTANT (js/guide.js), relue ici pour la carte,
// comme le terminal et js/scenarios.js la lisent. Elle cherche ce vocabulaire dans le texte
// VISIBLE en Débutant (pas dans le code, pas dans le détail demandé par un appui quand un test
// le dit).
//
// Lancé seul (`node tests/mots_debutant.js`), le module se contrôle sur des exemples.

const Guide = require('../js/guide.js');

/** Les mots interdits trouvés dans un texte (liste vide : rien à redire). */
const motsInterdits = t => Guide.motsBannis(t);

module.exports = { LISTE: Guide.MOTS_BANNIS_DEBUTANT, motsInterdits };

if (require.main === module) {
  let ko = 0;
  const check = (nom, ok, det) => { if (!ok) ko++; console.log(`  ${ok ? '✓' : '✗'} ${nom}${!ok && det !== undefined ? ' — ' + JSON.stringify(det) : ''}`); };
  console.log('\n── Mots interdits à l\'écran débutant : une seule liste, qui se contrôle elle-même ──');
  const detectes = ['liquidité.', 'les carnets', 'deux modèles', 'des calls', 'les strikes', 'EMA20', 'RSI 4H', '+DI', 'L/S 1,2', 'heure UTC', 'en 15m', 'la bougie', 'clôturé', 'volatilité', 'conventionnel', 'R2', 'bids', 'Fibonacci'];
  const admis = ['modeler', 'bide', 'pivoter', 'DIX', 'ROI', 'MARDI', 'orange', 'Sur 3 h 30', 'le prix monte', 'un mur d’achats'];
  for (const t of detectes) check(`détecté : « ${t} »`, motsInterdits(t).length > 0, motsInterdits(t));
  for (const t of admis) check(`admis : « ${t} »`, motsInterdits(t).length === 0, motsInterdits(t));
  check('somme : « Σ 12 BTC » détecté', motsInterdits('Σ 12 BTC').length === 1);
  check('le mot trouvé est rendu sans ce qui le précède : « (RSI) » → RSI', motsInterdits('(RSI)').join() === 'RSI', motsInterdits('(RSI)'));
  check('le terminal et la carte lisent la même liste', module.exports.LISTE === require('../js/guide.js').MOTS_BANNIS_DEBUTANT);
  console.log(ko ? `\n❌ MOTS DÉBUTANT : ${ko} contrôle(s) en échec` : '\n✅ MOTS DÉBUTANT : TOUS LES CONTRÔLES PASSENT');
  process.exit(ko ? 1 : 0);
}
