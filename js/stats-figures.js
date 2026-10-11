// ─────────────────────────────────────────────────────────────────────────────
// Les statistiques détaillées d'une figure chartiste (demande du 11/10/2026)
// ─────────────────────────────────────────────────────────────────────────────
// La bulle d'une figure se termine par une ligne courte : sa cible et le taux mesuré de son type
// (« Cible 84 116 $ · atteinte 3 fois sur 8 ▸ », Guide.resumeStatsFigure). La toucher (ou cliquer
// sur la figure dont la bulle est déjà ouverte en entier) ouvre ce détail, dans la bulle des
// légendes (#fichePop, js/fiches.js) : la cible et comment elle se calcule, puis ce qui a été
// mesuré sur l'historique chargé (Guide.statsFigure). Les mots sont ceux de tout le monde ; les
// barres disent les proportions sans pourcentage.
/** Une barre de proportions : [[nombre, classe, titre]…], la largeur de chaque part ∝ son nombre. */
function barreStats(parts) {
  const tot = parts.reduce((a, p) => a + p[0], 0);
  if (!(tot > 0)) return '';
  return '<div class="stats-barre" aria-hidden="true">' + parts.filter(p => p[0] > 0).map(p =>
    '<i class="' + p[1] + '" style="flex-grow:' + p[0] + '" title="' + echapF(p[2]) + '"></i>').join('') + '</div>';
}
/** Le HTML du détail : S = Guide.statsFigure(…). */
function statsFigureHtml(S) {
  const nb = x => (typeof Fmt !== 'undefined' && Fmt.nombre ? Fmt.nombre(x, 0) : String(x));
  let h = '<div class="fiche-tete"><h3 class="fiche-titre">' + echapF(S.titre) + '</h3><button type="button" class="fiche-fermer" onclick="fermerFiche()" aria-label="Fermer">×</button></div>';
  // 1. La cible : le prix d'abord, en gros ; son état ; comment elle se calcule.
  h += '<div class="stats-cible">' + (S.cibles.length
    ? '<span class="stats-etiquette">Cible prévue</span>' + S.cibles.map(c => '<b class="stats-prix">' + echapF(c.texte) + '</b>').join('<span class="stats-ou">ou</span>')
    : '<span class="stats-etiquette">Cible</span>') + '<p class="stats-note">' + echapF(S.cibleEtat) + '</p></div>';
  h += '<p class="stats-comment">' + echapF(S.comment) + '</p>';
  // 2. La réussite mesurée : la phrase, la barre des issues, la comparaison au hasard.
  if (S.taux) {
    const T = S.taux;
    h += '<h4>Sur ce graphique</h4><p class="stats-phrase">' + echapF(S.phrase) + '</p>';
    if (T.finis) {
      h += barreStats([[T.atteints, 'ok', 'Cible atteinte : ' + T.atteints], [T.invalides, 'ko', 'Annulées avant la cible : ' + T.invalides], [T.expires, 'neutre', 'Délai écoulé : ' + T.expires]])
        + '<p class="stats-legende"><span class="ok">✓ cible atteinte ' + T.atteints + '</span> <span class="ko">✗ annulée avant ' + T.invalides + '</span>' + (T.expires ? ' <span class="neutre">– délai écoulé ' + T.expires + '</span>' : '') + '</p>';
    }
    if (S.temoin) {
      h += '<p class="stats-phrase">' + echapF(S.temoin.phrase) + '</p>'
        + barreStats([[S.temoin.atteints, 'ok pale', 'Atteint : ' + nb(S.temoin.atteints)], [S.temoin.departs - S.temoin.atteints, 'ko pale', 'Pas atteint : ' + nb(S.temoin.departs - S.temoin.atteints)]]);
    }
    if (S.delai) h += '<p class="stats-phrase">' + echapF(S.delai) + '</p>';
    if (S.faible) h += '<p class="fiche-alerte">Trop peu de cas pour en tirer une règle : ces comptes peuvent beaucoup changer.</p>';
    h += '<h4>Le détail</h4><dl class="stats-table">' + S.lignes.map(([k, v]) => '<dt>' + echapF(k) + '</dt><dd>' + echapF(v) + '</dd>').join('') + '</dl>';
    if (S.dernieres.length) {
      h += '<h4>Les dernières, validées</h4><ul class="stats-dernieres">' + S.dernieres.map(d =>
        '<li><span class="stats-marque ' + (d.marque === '✓' ? 'ok' : d.marque === '✗' ? 'ko' : 'neutre') + '">' + echapF(d.marque || '') + '</span> <span class="stats-quand">' + echapF(d.quand) + '</span> ' + echapF(d.issue) + '</li>').join('') + '</ul>';
    }
  } else h += '<p class="stats-phrase">Pas encore de mesure pour ce graphique.</p>';
  h += '<p class="fiche-pied">' + echapF(S.source) + ' ' + echapF(S.risque) + '</p>';
  return h;
}
/** Ouvre le détail des statistiques de la figure f (dans #fichePop). */
function ouvrirStatsFigure(f) {
  const p = document.getElementById('fichePop'), R = typeof GUIDE_FORMES !== 'undefined' ? GUIDE_FORMES.val : null, E = typeof guideEtat !== 'undefined' ? guideEtat : null;
  if (!p || !f || !R || !E || !E.ctxF) return false;
  const S = Guide.statsFigure(f, R, E.ctxF, PARAM.guide, guideUnite());
  p.innerHTML = statsFigureHtml(S);
  p.hidden = false;
  p.style.left = ''; p.style.top = '';
  p.scrollTop = 0;
  ficheOuverte = 'stats'; ficheRetour = null;
  window.__statsFigure = S;   // relu par les tests
  const b = p.querySelector('.fiche-fermer');
  if (b && b.focus) b.focus({ preventScroll: true });
  return true;
}
