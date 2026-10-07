// Conversion de TEST : heatmap.json de l'ancien format (bids / asks = [[c, pb, v], …]) vers
// « colonnes-1 » ([[minute, bid_bas, [v…], ask_bas, [v…]], …], minute ABSOLUE).
//
// Ce n'est pas le producteur (heatmap.py) : c'est la même information réécrite, pour vérifier que
// les pages lisent les deux formats à l'identique — AVANT que le serveur change de format.
function versColonnes(h) {
  const m0 = Math.round(h.t0 / h.dt), par = new Map();
  const cote = (cells, k) => {
    for (const [c, pb, v] of cells || []) {
      const m = m0 + c;
      if (!par.has(m)) par.set(m, { b: new Map(), a: new Map() });
      par.get(m)[k].set(pb, v);
    }
  };
  cote(h.bids, 'b'); cote(h.asks, 'a');
  const serie = m => {
    if (!m.size) return [null, []];
    const ks = [...m.keys()], lo = Math.min(...ks), hi = Math.max(...ks), v = [];
    for (let p = lo; p <= hi; p++) v.push(m.get(p) || 0);
    return [lo, v];
  };
  const colonnes = [...par.keys()].sort((a, b) => a - b).map(m => [m, ...serie(par.get(m).b), ...serie(par.get(m).a)]);
  const out = { updated: h.updated, sym: h.sym, t0: h.t0, dt: h.dt, dp: h.dp, format: 'colonnes-1',
    disposition: 'colonnes : [minute, bid_bas, [v…], ask_bas, [v…]] ; minute = ⌊t/dt⌋ absolue UTC ; v[i] = tranche (bas+i), prix = tranche×dp ; 0 = rien au-dessus du seuil ; côté vide : null,[] ; minute absente = non observée' };
  if (h.encodage) out.encodage = h.encodage;
  out.colonnes = colonnes;
  return out;
}
module.exports = { versColonnes };
