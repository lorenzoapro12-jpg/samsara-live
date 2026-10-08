// Les scénarios du matin servis aux harnais du navigateur : tests/fixtures/previsions.json (un
// matin complet) ou tests/fixtures/previsions-attente.json (le fichier d'attente publié tant
// qu'aucun point n'a été donné).
//
// Les heures du fichier complet sont DÉCALÉES pour que le point du matin tombe `ilYaMs` avant
// maintenant (3 h par défaut) : les bougies simulées des harnais, qui finissent « maintenant »,
// ont alors des bougies depuis le point, et la marge de futur montre les flèches.
//
//   const { previsionsFixture, estPrevisions } = require('./previsions-fixture');
//   if (estPrevisions(url)) return r.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: previsionsFixture() });
const fs = require('fs'), path = require('path');
const DOSSIER = path.join(__dirname, 'fixtures');
const lire = f => JSON.parse(fs.readFileSync(path.join(DOSSIER, f), 'utf8'));

const iso = ms => new Date(ms).toISOString().slice(0, 16) + 'Z';
const decaler = (s, d) => (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}Z$/.test(s) ? iso(Date.parse(s) + d) : s);
const jour = (g, d) => (typeof g === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(g) ? new Date(Date.parse(g + 'T12:00Z') + Math.round(d / 864e5) * 864e5).toISOString().slice(0, 10) : g);

/** Le fichier complet (objet), heures décalées ; opts = { ilYaMs, maintenant, modifier(d) }. */
function previsionsObjet(opts = {}) {
  const d = lire('previsions.json');
  const maintenant = opts.maintenant || Date.now();
  const cible = Math.floor((maintenant - (opts.ilYaMs === undefined ? 3 * 3600e3 : opts.ilYaMs)) / 60000) * 60000;
  const delta = cible - Date.parse(d.emis_utc);
  for (const k of ['updated', 'emis_utc']) d[k] = decaler(d[k], delta);
  d.groupe = jour(d.groupe, delta);
  for (const s of d.scenarios) {
    for (const k of ['emis_utc', 'fin_utc', 'resolu_utc']) s[k] = decaler(s[k], delta);
    s.groupe = jour(s.groupe, delta);
  }
  for (const p of d.precedents) p.groupe = jour(p.groupe, delta);
  if (opts.modifier) opts.modifier(d);
  return d;
}
const previsionsFixture = opts => JSON.stringify(previsionsObjet(opts));
const previsionsAttente = () => fs.readFileSync(path.join(DOSSIER, 'previsions-attente.json'), 'utf8');
/** L'URL lue par la page (branche `previsions` du dépôt, sur GitHub Raw). */
const estPrevisions = u => /raw\.githubusercontent\.com\/[^?#]*\/previsions\/previsions\.json/.test(u);

module.exports = { previsionsObjet, previsionsFixture, previsionsAttente, estPrevisions };
