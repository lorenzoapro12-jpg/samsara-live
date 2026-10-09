// Mots qu'un débutant ne doit pas lire sur son écran (mode Débutant), partagés par les tests.
//
// La règle du propriétaire : en mode Débutant, l'écran se lit sans connaître le vocabulaire
// des marchés ; tout le détail technique reste derrière le bouton « Expert ». Ces trois motifs
// cherchent ce vocabulaire dans le texte VISIBLE en Débutant (pas dans le code, pas dans le
// détail demandé par un appui quand un test le dit).
//
// Frontières : `\b` de JavaScript ne voit pas de frontière après une lettre accentuée
// (« liquidité. ») ni entre une lettre et un chiffre (« EMA20 »). On borne donc par des
// lettres Unicode (\p{L}) et, pour les mots, aussi par des chiffres.
//
// Lancé seul (`node tests/mots_debutant.js`), le module se contrôle sur 15 exemples.

const SIGLES = /(?<![\p{L}])(ADX|DI|EMA|SMA|ATR|RSI|MACD|VWAP|GEX|CVD|OI|S\/R|L\/S)(?![\p{L}])/u;
const MOTS = /(?<![\p{L}\p{N}])(bollinger|stoch\p{L}*|gamma|bids?|asks?|deltas?|funding|open interest|takers?|ratios?|pivots?|z[ée]ro gamma|calls?|puts?|strikes?|liquidit[ée]s?|carnets?|conventions?|mod[eè]les?|percentiles?)(?![\p{L}])/iu;
const SOMME = /Σ/;

/** Les mots interdits trouvés dans un texte (liste vide : rien à redire). */
function motsInterdits(t) {
  const s = String(t == null ? '' : t), l = [];
  for (const re of [SIGLES, MOTS, SOMME]) {
    const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
    for (const m of s.matchAll(g)) l.push(m[0]);
  }
  return l;
}

module.exports = { SIGLES, MOTS, SOMME, motsInterdits };

if (require.main === module) {
  let ko = 0;
  const check = (nom, ok, det) => { if (!ok) ko++; console.log(`  ${ok ? '✓' : '✗'} ${nom}${!ok && det !== undefined ? ' — ' + JSON.stringify(det) : ''}`); };
  console.log('\n── Mots interdits à l\'écran débutant : le motif se contrôle lui-même ──');
  const detectes = ['liquidité.', 'les carnets', 'deux modèles', 'des calls', 'les strikes', 'EMA20', 'RSI 4H', '+DI', 'L/S 1,2'];
  const admis = ['modeler', 'bide', 'pivoter', 'conventionnel', 'DIX', 'ROI'];
  for (const t of detectes) check(`détecté : « ${t} »`, motsInterdits(t).length > 0, motsInterdits(t));
  for (const t of admis) check(`admis : « ${t} »`, motsInterdits(t).length === 0, motsInterdits(t));
  check('somme : « Σ 12 BTC » détecté', motsInterdits('Σ 12 BTC').length === 1);
  console.log(ko ? `\n❌ MOTS DÉBUTANT : ${ko} contrôle(s) en échec` : '\n✅ MOTS DÉBUTANT : TOUS LES CONTRÔLES PASSENT');
  process.exit(ko ? 1 : 0);
}
