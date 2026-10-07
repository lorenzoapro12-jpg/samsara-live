// ═══════════════════════════════════════════════════════════════════════════════
// RÉGLAGES D'AFFICHAGE — ils changent le NIVEAU DE DÉTAIL, jamais la valeur affichée.
// ─────────────────────────────────────────────────────────────────────────────
// Deux régimes, et la frontière est le point :
//   · ce que la page va chercher ELLE-MÊME (panneau ⚡, Binance) : libre — profondeur du
//     carnet, bandes, nombre de trades, seuils de lecture ;
//   · ce qui vient du FICHIER publié : ses constantes sont LUES dans le fichier, jamais
//     recopiées ici. Les bandes proposées sont celles que le serveur a publiées (et, s'il
//     publie le profil du carnet, des bandes calculées sur ce profil, « à la tranche près ») ;
//     la tranche des murs est un MULTIPLE de `wall_bin_usd` (fusionner des sommes = sommer :
//     exact) ; la heatmap se fusionne par MAX (on fusionne, on n'affine jamais).
// tests/test_reglages.js fait tenir ces règles.
// ═══════════════════════════════════════════════════════════════════════════════

const REGLAGES_CLE = 'samsara-reglages-v1';
const REGLAGES_DEFAUT = {
  live: { niveaux: 500, bandes: [0.1], trades: 500, ratioMarque: 1.4, ratioLeger: 1.1, takerDominant: 60, takerLeger: 53 },
  carnet: { bande: null, bandesPerso: [], trancheX: 1, murs: 5, murMin: 0 },
  heat: { fusionP: 1, fusionT: 1, seuil: 1 },
};
// Profondeurs que l'API Binance accepte, et ce qu'elles coûtent (poids par requête).
const LIVE_NIVEAUX = [100, 500, 1000, 5000];
const LIVE_TRADES = [100, 500, 1000];
const LIVE_BANDES = [0.02, 0.05, 0.1, 0.25, 0.5, 1];

function lireReglages() {
  let r = {};
  try { r = JSON.parse(localStorage.getItem(REGLAGES_CLE) || '{}') || {}; } catch (e) { r = {}; }
  const o = JSON.parse(JSON.stringify(REGLAGES_DEFAUT));
  for (const k of Object.keys(o)) Object.assign(o[k], r[k] || {});
  if (!LIVE_NIVEAUX.includes(o.live.niveaux)) o.live.niveaux = REGLAGES_DEFAUT.live.niveaux;
  if (!LIVE_TRADES.includes(o.live.trades)) o.live.trades = REGLAGES_DEFAUT.live.trades;
  if (!Array.isArray(o.live.bandes) || !o.live.bandes.length) o.live.bandes = REGLAGES_DEFAUT.live.bandes.slice();
  return o;
}
let REGLAGES = lireReglages();
function sauverReglages() { try { localStorage.setItem(REGLAGES_CLE, JSON.stringify(REGLAGES)); } catch (e) { /* navigation privée */ } }

// ─── Calculs (purs) ───────────────────────────────────────────────────────────
/** Bande ±pct % calculée sur le PROFIL publié (somme par tranche). Une tranche compte dès
 *  qu'elle chevauche la bande : précision = une tranche. null si le carnet ne la couvre pas. */
function bandeProfil(lq, pct) {
  if (!lq || !Array.isArray(lq.profil_bids) || !Array.isArray(lq.profil_asks) || !(lq.wall_bin_usd > 0) || !(lq.mid > 0)) return null;
  if (!(pct > 0) || pct > lq.couverture_pct) return null;
  const dp = lq.wall_bin_usd, bas = lq.mid * (1 - pct / 100), haut = lq.mid * (1 + pct / 100);
  let b = 0, a = 0;
  for (const [p, q] of lq.profil_bids) if (p + dp > bas && p <= lq.mid) b += q;
  for (const [p, q] of lq.profil_asks) if (p < haut && p + dp > lq.mid) a += q;
  return { bid_btc: b, ask_btc: a, ratio: a > 0 ? b / a : null, precision_usd: dp };
}
/** Murs à une tranche MULTIPLE de la tranche publiée : somme des tranches regroupées.
 *  ×1 = les murs publiés eux-mêmes (le serveur les tire du même profil). */
function mursFusionnes(lq, cote, k, n, min) {
  k = Math.max(1, k | 0);
  const dp = lq && lq.wall_bin_usd;
  const prof = lq && lq['profil_' + cote + 's'];
  if (!(dp > 0)) return [];
  if (!Array.isArray(prof) || !prof.length) {
    // Fichier sans profil : seuls les murs publiés existent, à la tranche publiée.
    return k === 1 ? (lq[cote + '_walls'] || []).filter(w => w[1] >= (min || 0)).slice(0, n) : [];
  }
  const agg = new Map();
  for (const [p, q] of prof) { const P = Math.floor(p / (dp * k)) * dp * k; agg.set(P, (agg.get(P) || 0) + q); }
  return [...agg.entries()].filter(([, q]) => q >= (min || 0)).sort((x, y) => y[1] - x[1]).slice(0, n).map(([p, q]) => [p, Math.round(q * 10) / 10]);
}
/** Grille de heatmap.json (grilleChaleur, js/app.js) fusionnée par MAX : kt colonnes × kp
 *  tranches → une case, intensités sous le seuil retirées. Indices : C = ⌊c / kt⌋ (colonnes
 *  comptées depuis t0), tranche fusionnée = ⌊tranche / kp⌋ (absolue). Un facteur < 1 vaut 1 :
 *  on fusionne, on n'affine jamais. À 1 × 1 sous un seuil ≤ 1, la grille elle-même (rien à
 *  fusionner ni à retirer : 0 = rien, toute valeur publiée est ≥ 1). */
function fusionnerGrille(g, kt, kp, seuil) {
  kt = Math.max(1, kt | 0); kp = Math.max(1, kp | 0); seuil = Math.max(1, seuil || 0);
  if (kt === 1 && kp === 1 && seuil <= 1) return g;
  const P0 = Math.floor(g.pbMin / kp), H = Math.floor((g.pbMin + g.H - 1) / kp) - P0 + 1, W = Math.ceil(g.W / kt);
  const bids = new Uint8Array(W * H), asks = new Uint8Array(W * H), ligne = new Array(g.H);
  for (let p = 0; p < g.H; p++) ligne[p] = Math.floor((g.pbMin + p) / kp) - P0;
  for (let c = 0; c < g.W; c++) {
    const o = c * g.H, O = Math.floor(c / kt) * H;
    for (let p = 0; p < g.H; p++) {
      const b = g.bids[o + p], a = g.asks[o + p], i = O + ligne[p];
      if (b >= seuil && b > bids[i]) bids[i] = b;
      if (a >= seuil && a > asks[i]) asks[i] = a;
    }
  }
  return { t0: g.t0, dt: g.dt * kt, dp: g.dp * kp, W, H, pbMin: P0, bids, asks };
}
/** Bande live ±pct % sur un carnet Binance reçu ; null si le carnet ne la couvre pas. */
function bandeLive(depth, px, pct) {
  const b = depth.bids || [], a = depth.asks || [];
  if (!b.length || !a.length || !(px > 0)) return null;
  const couv = Math.min(1 - parseFloat(b[b.length - 1][0]) / px, parseFloat(a[a.length - 1][0]) / px - 1) * 100;
  if (couv < pct) return { couverte: false, couverture: couv };
  let bv = 0, av = 0;
  for (const r of b) if (parseFloat(r[0]) >= px * (1 - pct / 100)) bv += parseFloat(r[1]);
  for (const r of a) if (parseFloat(r[0]) <= px * (1 + pct / 100)) av += parseFloat(r[1]);
  return { couverte: true, couverture: couv, bid: bv, ask: av, ratio: av > 0 ? bv / av : NaN };
}

// ─── Panneau ──────────────────────────────────────────────────────────────────
const echapR = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function ouvrirReglages(ancre) {
  const p = document.getElementById('reglagesPop');
  if (!p) return;
  p.innerHTML = reglagesHtml();
  p.hidden = false;
  const f = p.querySelector('.fiche-fermer');
  if (f && f.focus) f.focus();
  reglagesRetour = ancre || null;
}
let reglagesRetour = null;
function fermerReglages() {
  const p = document.getElementById('reglagesPop');
  if (p) p.hidden = true;
  if (reglagesRetour && reglagesRetour.focus) reglagesRetour.focus();
}
function choix(id, valeurs, actuel, fmt) {
  return '<select id="' + id + '" onchange="changerReglage(this)">' + valeurs.map(v =>
    '<option value="' + echapR(v) + '"' + (String(v) === String(actuel) ? ' selected' : '') + '>' + echapR(fmt ? fmt(v) : v) + '</option>').join('') + '</select>';
}
function reglagesHtml() {
  const R = REGLAGES, md = typeof marketData !== 'undefined' ? marketData : null, lq = (md && md.liquidity) || {};
  const pub = Object.keys(lq.bandes || {}).map(Number).sort((a, b) => a - b);
  const tr = lq.wall_bin_usd;
  const prof = Array.isArray(lq.profil_bids);
  const nf = (v, d) => Number(v).toLocaleString('fr-FR', { maximumFractionDigits: d === undefined ? 2 : d });
  const enc = typeof histHeatmap !== 'undefined' && histHeatmap && histHeatmap.encodage;
  const btcDe = v => enc ? ' (≈ ' + nf(enc.ref_btc * Math.pow(v / enc.plafond, 2), 3) + ' BTC)' : '';
  return '<div class="fiche-tete"><h3 class="fiche-titre">Réglages d’affichage</h3><button type="button" class="fiche-fermer" onclick="fermerReglages()" aria-label="Fermer">×</button></div>'
    + '<p class="fiche-simple">Un réglage change le niveau de DÉTAIL, jamais une valeur : un chiffre affiché garde sa valeur, il porte sa bande ou sa tranche.</p>'
    // ⚡
    + '<h4>Panneau ⚡ — lu par la page sur Binance</h4>'
    + '<label class="reglage">Profondeur du carnet ' + choix('r_live_niveaux', LIVE_NIVEAUX, R.live.niveaux, v => nf(v, 0) + ' niveaux') + '</label>'
    + '<div class="reglage">Bandes affichées <div class="puces">' + LIVE_BANDES.map(b => '<label class="puce-case"><input type="checkbox" data-bande-live="' + b + '"'
      + (R.live.bandes.includes(b) ? ' checked' : '') + ' onchange="changerReglage(this)">±' + nf(b) + ' %</label>').join('') + '</div>'
    + '<span class="fine">Une bande que le carnet reçu ne couvre pas s’affiche « non couverte », jamais tronquée.</span></div>'
    + '<label class="reglage">Exécutions lues ' + choix('r_live_trades', LIVE_TRADES, R.live.trades, v => v + ' dernières') + '</label>'
    + '<div class="reglage">Seuils de lecture du ratio bid/ask <span class="fine">(convention de lecture : le ratio, lui, ne change pas)</span>'
    + '<div class="ligne-reglage">marqué ≥ <input type="number" id="r_live_ratioMarque" min="1.01" max="5" step="0.05" value="' + R.live.ratioMarque + '" onchange="changerReglage(this)">'
    + ' léger ≥ <input type="number" id="r_live_ratioLeger" min="1.01" max="5" step="0.05" value="' + R.live.ratioLeger + '" onchange="changerReglage(this)"> (et leurs inverses)</div></div>'
    + '<div class="reglage">Seuils de lecture des achats au marché <span class="fine">(en % du volume)</span>'
    + '<div class="ligne-reglage">dominant ≥ <input type="number" id="r_live_takerDominant" min="51" max="95" step="1" value="' + R.live.takerDominant + '" onchange="changerReglage(this)">'
    + ' léger ≥ <input type="number" id="r_live_takerLeger" min="50.5" max="95" step="0.5" value="' + R.live.takerLeger + '" onchange="changerReglage(this)"></div></div>'
    // Carnet du fichier
    + '<h4>Carte « Liquidité » — fichier de ' + CADENCES.attendue_min + ' min</h4>'
    + (pub.length ? '<label class="reglage">Bande du ratio ' + choix('r_carnet_bande', ['auto'].concat(pub), R.carnet.bande === null ? 'auto' : R.carnet.bande,
        v => v === 'auto' ? 'référence publiée (±' + lq.bande_ref_pct + ' %)' : '±' + nf(v) + ' % (publiée)') + '</label>'
      : '<p class="fine">Aucune bande publiée par ce fichier.</p>')
    + (prof
      ? '<div class="reglage">Bandes calculées sur le profil publié <span class="fine">(à la tranche de ' + tr + ' $ près, jusqu’à ±' + nf(lq.couverture_pct) + ' %)</span><div class="puces">'
        + [0.05, 0.1, 0.2, 0.25, 0.3, 0.5, 0.75, 1].filter(b => !pub.includes(b)).map(b => '<label class="puce-case' + (b > lq.couverture_pct ? ' indispo' : '') + '"><input type="checkbox" data-bande-perso="' + b + '"'
          + (R.carnet.bandesPerso.includes(b) ? ' checked' : '') + (b > lq.couverture_pct ? ' disabled' : '') + ' onchange="changerReglage(this)">±' + nf(b) + ' %</label>').join('') + '</div></div>'
      : '<p class="fine">Le profil du carnet n’est pas publié par ce fichier : seules les bandes publiées sont proposées.</p>')
    + (tr > 0
      ? '<label class="reglage">Tranche des murs ' + (prof ? choix('r_carnet_trancheX', [1, 2, 5, 10, 25], R.carnet.trancheX, k => nf(k * tr, 0) + ' $' + (k === 1 ? ' (publiée)' : ' (' + k + ' tranches sommées)')) : '<b>' + tr + ' $ (publiée)</b>') + '</label>'
      : '<p class="fine">Tranche des murs non publiée par ce fichier.</p>')
    + '<label class="reglage">Murs affichés par côté ' + choix('r_carnet_murs', [3, 5, 8, 12], R.carnet.murs) + '</label>'
    + '<label class="reglage">Masquer les murs sous ' + choix('r_carnet_murMin', [0, 5, 10, 25, 50, 100], R.carnet.murMin, v => v ? v + ' BTC' : 'aucun seuil') + '</label>'
    // Heatmap
    + '<h4>Heatmap du graphique — fusionner, jamais affiner</h4>'
    + '<label class="reglage">Tranches de prix ' + choix('r_heat_fusionP', [1, 2, 5, 10], R.heat.fusionP, k => histHeatmapDp(k)) + '</label>'
    + '<label class="reglage">Colonnes ' + choix('r_heat_fusionT', [1, 5, 15, 60], R.heat.fusionT, k => k === 1 ? '1 min (publiée)' : k + ' min') + '</label>'
    + '<label class="reglage">Masquer sous l’intensité ' + choix('r_heat_seuil', [1, 16, 32, 64, 128], R.heat.seuil, v => v + btcDe(v)) + '</label>'
    + '<p class="fine">Fusion par MAXIMUM : une case fusionnée montre le plus gros niveau de son bloc. En dézoom, le graphique fusionne de lui-même au pixel (par MAX) : un mur ne disparaît plus entre deux pixels.</p>'
    + '<button type="button" class="glossaire-item" onclick="reinitReglages()">Réglages par défaut</button>';
}
function histHeatmapDp(k) {
  const dp = typeof histHeatmap !== 'undefined' && histHeatmap && histHeatmap.dp;
  return dp ? (dp * k) + ' $' + (k === 1 ? ' (publiée)' : '') : '×' + k;
}
function changerReglage(el) {
  const R = REGLAGES;
  if (el.dataset && el.dataset.bandeLive) {
    const b = +el.dataset.bandeLive;
    R.live.bandes = el.checked ? [...new Set(R.live.bandes.concat(b))].sort((x, y) => x - y) : R.live.bandes.filter(x => x !== b);
    if (!R.live.bandes.length) R.live.bandes = [b];
  } else if (el.dataset && el.dataset.bandePerso) {
    const b = +el.dataset.bandePerso;
    R.carnet.bandesPerso = el.checked ? [...new Set(R.carnet.bandesPerso.concat(b))].sort((x, y) => x - y) : R.carnet.bandesPerso.filter(x => x !== b);
  } else {
    const [, bloc, cle] = el.id.split('_');
    const v = el.value === 'auto' ? null : Number(el.value);
    if (v === null || isFinite(v)) R[bloc][cle] = v;
  }
  sauverReglages();
  appliquerReglages();
}
function reinitReglages() {
  REGLAGES = JSON.parse(JSON.stringify(REGLAGES_DEFAUT));
  sauverReglages();
  appliquerReglages();
  ouvrirReglages();
}
/** Réaffiche ce que les réglages touchent. Rien n'est recalculé côté serveur. */
function appliquerReglages() {
  if (typeof renderFeed === 'function' && typeof marketData !== 'undefined' && marketData) {
    renderFeed();
    const mm = document.getElementById('marketModal');
    if (mm && mm.style.display === 'flex') renderFeedTo(document.getElementById('marketModalBody'));
  }
  const lm = document.getElementById('liveModal');
  if (lm && lm.style.display === 'flex' && typeof renderLive === 'function') renderLive();
  if (typeof drawChart === 'function') drawChart();
}
document.addEventListener('keydown', e => { if (e.key === 'Escape') { const p = document.getElementById('reglagesPop'); if (p && !p.hidden) fermerReglages(); } });
