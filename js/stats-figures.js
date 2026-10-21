// ─────────────────────────────────────────────────────────────────────────────
// Les statistiques détaillées d'une figure chartiste (demande du 11/10/2026)
// ─────────────────────────────────────────────────────────────────────────────
// La bulle d'une figure se termine par une ligne courte : son objectif et ce que ces figures ont
// fait face au hasard (« Objectif 84 116 $ · ces figures : sens prévu 5 sur 10, objectif atteint 5
// sur 10, comme au hasard ▸ », Guide.resumeStatsFigure). La toucher (ou cliquer sur la figure dont
// la bulle est déjà ouverte en entier) ouvre ce détail, dans la bulle des légendes (#fichePop,
// js/fiches.js) : l'objectif de la figure et comment il se calcule, ce que ces figures ont fait sur
// des années, puis ce qui a été mesuré sur l'historique chargé (Guide.statsFigure), les derniers
// cas de ce type en petit, à faire défiler (idée 4 du plan du 13/10/2026), et enfin le tableau des
// comptes (cet ordre : revue du 14/10/2026, M8, accord de Lorenzo du 15/10). Les mots sont ceux de
// tout le monde ; les barres disent les proportions sans pourcentage, et seulement quand il y a
// assez de cas.
/** Une barre de proportions : [[nombre, classe, titre]…], la largeur de chaque part ∝ son nombre. */
function barreStats(parts) {
  const tot = parts.reduce((a, p) => a + p[0], 0);
  if (!(tot > 0)) return '';
  return '<div class="stats-barre" aria-hidden="true">' + parts.filter(p => p[0] > 0).map(p =>
    '<i class="' + p[1] + '" style="flex-grow:' + p[0] + '" title="' + echapF(p[2]) + '"></i>').join('') + '</div>';
}
/** La jauge du parcours (demande de Lorenzo du 18/10/2026) : pour chaque rangée, une barre de la
 *  clôture de validation (le trait du milieu) vers l'objectif (à droite, son repère ◆ à 100 % du
 *  chemin) et vers l'autre sens (à gauche) ; les longueurs sont les médianes du parcours. */
function jaugeParcours(J) {
  if (!J || !J.length) return '';
  // L'échelle : de quoi voir l'objectif et la plus longue barre, sans écraser les autres (au-delà de
  // 3 fois le chemin, la barre touche le bord).
  const m = Math.min(3, Math.max(1.2, ...J.map(r => Math.max(r.mieux || 0, r.contre || 0)))), x = v => Math.max(0, Math.min(50, v / m * 50));
  const pc = v => Guide.partChemin(v);
  return '<div class="parcours-jauge" aria-hidden="true">' + J.map(r =>
    '<div class="parcours-rangee"><span class="parcours-nom">' + echapF(r.nom) + '</span><span class="parcours-piste">'
    + '<i class="parcours-contre ' + r.cl + '" style="right:50%;width:' + x(r.contre).toFixed(1) + '%" title="Dans l’autre sens : ' + pc(r.contre) + '"></i>'
    + '<i class="parcours-mieux ' + r.cl + '" style="left:50%;width:' + x(r.mieux).toFixed(1) + '%" title="Vers l’objectif : ' + pc(r.mieux) + '"></i>'
    + '<b class="parcours-objectif" style="left:' + (50 + x(1)).toFixed(1) + '%" title="Objectif"></b></span></div>').join('')
    + '<div class="parcours-axe"><span>autre sens</span><span>validation</span><span>objectif ◆</span></div></div>';
}
/** Le parcours des cas de ce type (Guide.parcoursType) : la jauge, les phrases, le hasard, la note. */
function parcoursHtml(Pc) {
  if (!Pc) return '';
  return '<h4>Ce que fait le prix</h4>' + jaugeParcours(Pc.jauge) + Pc.phrases.map(t => '<p class="stats-phrase">' + echapF(t) + '</p>').join('')
    + (Pc.temoin ? '<p class="stats-phrase">' + echapF(Pc.temoin) + '</p>' : '') + '<p class="stats-note">' + echapF(Pc.note) + '</p>';
}
/** Les exemples passés (plan du 13/10/2026, idée 4) : les derniers cas de ce type sur ce graphique,
 *  du plus récent au plus ancien, SANS tri par réussite — une bande qu'on fait défiler de côté, une
 *  petite carte par cas (le prix avant, pendant et après la figure, Guide.exempleSvg) et sa légende
 *  (la date de validation, l'issue). K = { close, n } : les clôtures de l'historique rejoué ; sans
 *  elles, la légende seule. Aucun cas fini : une phrase. */
function exemplesHtml(S, K) {
  if (!S.dernieres.length) return '<h4>Exemples passés</h4><p class="stats-phrase">Aucun cas fini sur ce graphique.</p>';
  const nom = S.titre.replace(/ : statistiques$/, '');
  const cartes = S.dernieres.map(d => {
    const cl = d.marque === '✓' ? 'ok' : d.marque === '✗' ? 'ko' : 'neutre';
    const svg = K ? Guide.exempleSvg(d, K.close, K.n, PARAM.guide, nom + ', validée le ' + d.quand + ' : ' + d.issue + '. Le prix avant, pendant et après la figure.') : '';
    // Le parcours du prix après la validation : au plus loin dans le sens prévu (et la distance à
    // l'objectif), au plus loin dans l'autre sens, le prix au bout de la fenêtre.
    const pc = d.parcours ? '<span class="stats-parcours">' + [d.parcours.mieux, d.parcours.contre, d.parcours.fin].map(echapF).join('<br>') + '</span>' : '';
    return '<figure class="stats-exemple">' + svg + '<figcaption><span class="stats-marque ' + cl + '">' + echapF(d.marque || '') + '</span> <span class="stats-quand">'
      + echapF(d.quand) + '</span><br>' + echapF(d.issue) + (pc ? '<br>' + pc : '') + '</figcaption></figure>';
  }).join('');
  return '<h4>Exemples passés</h4><p class="stats-phrase">Les derniers cas sur ce graphique, sans tri :</p>'
    + '<div class="stats-exemples" tabindex="0" role="group" aria-label="Les derniers cas, à faire défiler de côté">' + cartes + '</div>';
}
/** Le HTML du détail : S = Guide.statsFigure(…) ; K = { close, n } (les clôtures rejouées), facultatif. */
function statsFigureHtml(S, K) {
  const nb = x => (typeof Fmt !== 'undefined' && Fmt.nombre ? Fmt.nombre(x, 0) : String(x));
  let h = '<div class="fiche-tete"><h3 class="fiche-titre">' + echapF(S.titre) + '</h3><button type="button" class="fiche-fermer" onclick="fermerFiche()" aria-label="Fermer">×</button></div>';
  // 1. L'objectif de la figure : le prix d'abord, en gros ; son état ; comment il se calcule.
  h += '<div class="stats-cible"><span class="stats-etiquette">Objectif de la figure</span>' + S.cibles.map(c => '<b class="stats-prix">' + echapF(c.texte) + '</b>').join('<span class="stats-ou">ou</span>')
    + '<p class="stats-note">' + echapF(S.cibleEtat) + '</p></div>';
  h += '<p class="stats-comment">' + echapF(S.comment) + '</p>';
  // 2. Ce que ces figures ont fait sur des années, face au hasard (quand c'est mesuré).
  if (S.annees) {
    // Quand l'objectif n'est pas atteint, ce que fait le prix (demande de Lorenzo du 18/10/2026) ; un
    // même verdict n'est dit qu'une fois, après les deux phrases.
    const A = S.annees, Pa = A.parcours, verdict = v => v ? '<p class="stats-phrase"><b>' + echapF(v) + '</b></p>' : '', meme = !!Pa && Pa.verdict === A.verdict;
    h += '<h4>Sur des années</h4><p class="stats-phrase">' + echapF(A.phrase) + '</p>' + (meme ? '' : verdict(A.verdict))
      + (Pa ? '<p class="stats-phrase">' + echapF(Pa.phrase) + '</p>' + verdict(Pa.verdict) : '') + '<p class="stats-note">' + echapF(A.source) + '</p>';
  }
  // 3. La réussite mesurée ici : la phrase, la barre des issues, la comparaison au hasard.
  // Échantillon faible : ni barre ni légende, l'alerte juste sous la phrase. Une barre pleine
  // largeur pour 4 cas était la chose la plus voyante du panneau, plus que la mesure sur des années,
  // et « Trop peu de cas » n'arrivait que trois paragraphes plus bas (revue du 14/10/2026, M8 ;
  // vision-14). Les comptes restent dans la phrase et dans « Les chiffres ».
  if (S.taux) {
    const T = S.taux;
    h += '<h4>Sur ce graphique</h4><p class="stats-phrase">' + echapF(S.phrase) + '</p>';
    if (S.faible) h += '<p class="fiche-alerte">Trop peu de cas pour en tirer une règle : ces comptes peuvent beaucoup changer.</p>';
    else if (T.finis) {
      // « ratées » après la validation, « annulées » avant : un mot par issue (revue du 14/10/2026, M5).
      h += barreStats([[T.atteints, 'ok', 'Objectif atteint : ' + T.atteints], [T.invalides, 'ko', 'Ratées avant l’objectif : ' + T.invalides], [T.expires, 'neutre', 'Délai écoulé : ' + T.expires]])
        + '<p class="stats-legende"><span class="ok">✓ objectif atteint ' + T.atteints + '</span> <span class="ko">✗ ratée avant ' + T.invalides + '</span>' + (T.expires ? ' <span class="neutre">– délai écoulé ' + T.expires + '</span>' : '') + '</p>';
    }
    if (S.temoin) {
      h += '<p class="stats-phrase">' + echapF(S.temoin.phrase) + '</p>'
        + (S.faible ? '' : barreStats([[S.temoin.atteints, 'ok pale', 'Atteint : ' + nb(S.temoin.atteints)], [S.temoin.departs - S.temoin.atteints, 'ko pale', 'Pas atteint : ' + nb(S.temoin.departs - S.temoin.atteints)]]));
    }
    if (S.delai) h += '<p class="stats-phrase">' + echapF(S.delai) + '</p>';
    // Pas seulement « atteint ou pas » : jusqu'où le prix est allé, dans un sens et dans l'autre
    // (demande de Lorenzo du 18/10/2026).
    h += parcoursHtml(S.parcours);
    // Les exemples passés avant le tableau : la partie qui se comprend le plus vite venait après
    // 7 lignes de comptes (revue du 14/10/2026, M8 ; vA-5).
    h += exemplesHtml(S, K);
    // « Les chiffres » : « Le détail » est le nom de la case (revue du 14/10/2026, M9).
    h += '<h4>Les chiffres</h4><dl class="stats-table">' + S.lignes.map(([k, v]) => '<dt>' + echapF(k) + '</dt><dd>' + echapF(v) + '</dd>').join('') + '</dl>';
  } else h += '<p class="stats-phrase">Pas encore de mesure pour ce graphique.</p>';
  h += '<p class="fiche-pied">' + echapF(S.source) + ' ' + echapF(S.risque) + '</p>';
  return h;
}
/** Ouvre le détail des statistiques de la figure f (dans #fichePop). */
function ouvrirStatsFigure(f) {
  const p = document.getElementById('fichePop'), R = typeof GUIDE_FORMES !== 'undefined' ? GUIDE_FORMES.val : null, E = typeof guideEtat !== 'undefined' ? guideEtat : null;
  if (!p || !f || !R || !E || !E.ctxF) return false;
  const S = Guide.statsFigure(f, R, E.ctxF, PARAM.guide, guideUnite());
  // Les clôtures de l'historique rejoué : celles des bougies chargées tant que le rejeu porte sur le
  // même début d'historique (ses indices sont alors ceux de candles).
  const memeBase = typeof GUIDE_FORMES.base === 'string' && candles.length && GUIDE_FORMES.base.endsWith('|' + candles[0].time);
  p.innerHTML = statsFigureHtml(S, memeBase ? { close: cols().close, n: R.n } : null);
  // « 2 918 fois sur 5 » puis « 103. » à la ligne : plus jamais (revue du 14/10/2026, C8).
  Fmt.insecables(p);
  p.hidden = false;
  p.style.left = ''; p.style.top = '';
  p.scrollTop = 0;
  ficheOuverte = 'stats'; ficheRetour = null;
  window.__statsFigure = S;   // relu par les tests
  const b = p.querySelector('.fiche-fermer');
  if (b && b.focus) b.focus({ preventScroll: true });
  return true;
}
