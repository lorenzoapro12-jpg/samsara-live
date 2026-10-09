// Le 09/10/2026 pour les tests de la journée des scénarios : le RÉEL (tests/fixtures/rejeu-jour-0910.json :
// le vrai previsions.json du point de 07h00, bougies 15 min et 1 min BTCUSDT jusqu'à 18:52 UTC), et
// une suite SYNTHÉTIQUE marquée (modèle, pas une mesure) qui le prolonge : montée vers 83 720 $
// (19:08, contact en mèche de la zone du 3 et de l'invalidation du 2 dans la bougie de 19:00),
// retour 83 350 $ (19:20), plateau, montée vers 84 420 $ (20:08 : le 1 sort par le haut), plateau
// jusqu'au 10/10 05:00 (après minuit, heure de Paris).
//   const { reel, synth } = require('./scenarios-jour-0910');
const path = require('path');
const reel = require(path.join(__dirname, 'fixtures', 'rejeu-jour-0910.json'));
function prolonger(X) {
  const k1 = X.k1.map(k => k.slice());
  const pts = [['2026-10-09T19:08Z', 83720], ['2026-10-09T19:20Z', 83350], ['2026-10-09T19:40Z', 83450], ['2026-10-09T20:08Z', 84420], ['2026-10-09T22:00Z', 84380], ['2026-10-10T05:00Z', 84150]];
  let p0 = { t: k1[k1.length - 1][0], c: k1[k1.length - 1][4] };
  for (const [ts, v] of pts) {
    const t1 = Date.parse(ts), n = (t1 - p0.t) / 60000;
    for (let j = 1; j <= n; j++) {
      const tt = p0.t + j * 60000, cc = p0.c + (v - p0.c) * j / n, o = k1[k1.length - 1][4], w = 12 + 8 * Math.sin(j);
      k1.push([tt, o, Math.max(o, cc) + w, Math.min(o, cc) - w, cc]);
    }
    p0 = { t: t1, c: v };
  }
  const coupe = Date.parse('2026-10-09T18:45Z'), k15 = X.k15.filter(k => k[0] < coupe).map(k => k.slice());
  for (const k of k1) {
    if (k[0] < coupe) continue;
    const tq = Math.floor(k[0] / 9e5) * 9e5, d = k15[k15.length - 1];
    if (d[0] === tq) { d[2] = Math.max(d[2], k[2]); d[3] = Math.min(d[3], k[3]); d[4] = k[4]; } else k15.push([tq, k[1], k[2], k[3], k[4]]);
  }
  return { fichier: X.fichier, k15, k1, note: 'réel jusqu’à 18:52 UTC, synthétique (modèle) ensuite' };
}
const synth = prolonger(reel);
module.exports = { reel, synth };
