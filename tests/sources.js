// Les sources de la page, telles que index.html les charge : une seule définition pour tous
// les harnais. Un harnais qui lirait un fichier en dur testerait le jour où quelqu'un ajoute
// un <script> une page qui n'existe plus.
const fs = require('fs'), path = require('path');
const REPO = path.resolve(__dirname, '..');
const lire = rel => fs.readFileSync(path.join(REPO, rel), 'utf8');

// Scripts dans l'ordre d'exécution. Le code tiers (js/vendor/) est exclu : la page doit
// tourner sans lui, et le harnais ne le charge pas.
function scriptsApp() {
  const html = lire('index.html');
  const out = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html))) {
    const src = (m[1].match(/\bsrc="([^"]+)"/) || [])[1];
    if (src) { if (!src.startsWith('js/vendor/')) out.push({ fichier: src, texte: lire(src) }); }
    else if (m[2].trim()) out.push({ fichier: 'index.html (inline)', texte: m[2] });
  }
  return out;
}

// Tout ce que le navigateur reçoit de NOTRE code : la page, ses feuilles, ses scripts.
function texteServi() {
  const html = lire('index.html');
  const refs = [...html.matchAll(/\b(?:href|src)="((?:css|js|themes)\/[^"]+)"/g)].map(m => m[1]);
  return [html, ...refs.map(lire)].join('\n');
}

module.exports = { REPO, lire, scriptsApp, texteServi };
