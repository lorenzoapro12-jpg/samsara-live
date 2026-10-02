// Contrôle d'absence : charge la liste des motifs qui ne doivent JAMAIS apparaître
// dans un fichier publié, et cherche lesquels sont présents.
//
// Pourquoi les motifs sont dans un fichier séparé
// -----------------------------------------------
// Ce dépôt est public. La MÉCANIQUE du contrôle (ce fichier) est publique et
// documentée ; les MOTS, eux, nomment des projets internes et un environnement de
// travail — les écrire ici reviendrait à publier ce qu'on cherche à empêcher.
// Ils vivent donc dans `forbidden.local.json`, qui est gitignoré. Absent, on
// retombe sur `forbidden.example.json` : la mécanique reste testable, mais elle
// n'attrape évidemment rien.
//
// Chaque motif est une EXPRESSION RÉGULIÈRE. ANCREZ-LES : un motif court sans borne
// matche tout mot qui le contient — 24 faux positifs constatés au premier essai sur un
// motif de trois lettres.
const fs = require('fs');
const path = require('path');

const HERE = __dirname;

function load() {
  const local = path.join(HERE, 'forbidden.local.json');
  const example = path.join(HERE, 'forbidden.example.json');
  const used = fs.existsSync(local) ? local : example;
  try {
    const d = JSON.parse(fs.readFileSync(used, 'utf8'));
    const terms = (d.terms || []).filter(t => typeof t === 'string' && t.length);
    return { file: path.basename(used), local: used === local, terms };
  } catch (e) {
    return { file: path.basename(used), local: used === local, terms: [], error: e.message };
  }
}

// Retourne la liste des motifs trouvés dans `text`.
function find(text, terms) {
  const hits = [];
  for (const t of terms) {
    let re;
    try {
      re = new RegExp(t, 'i');
    } catch {
      re = new RegExp(t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    }
    const m = text.match(re);
    if (m) hits.push({ term: t, at: m.index, extrait: text.slice(Math.max(0, m.index - 45), m.index + 45).replace(/\s+/g, ' ') });
  }
  return hits;
}

module.exports = { load, find };
