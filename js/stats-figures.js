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
  // Le tableau de toutes les figures (demande de Lorenzo du 19/11/2026), à un toucher.
  h += '<button type="button" class="tab-retour" onclick="ouvrirTableauFigures()">Toutes les figures ▸</button>';
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

// ─────────────────────────────────────────────────────────────────────────────
// Le tableau de toutes les figures (demande de Lorenzo du 19/11/2026)
// ─────────────────────────────────────────────────────────────────────────────
// Toutes les figures de ce graphique d'un coup d'œil, une rangée par type (Guide.tableauFigures) :
// validées / annulées, l'objectif atteint ou non, et quand il ne l'est pas, le chemin fait vers lui
// et ce que le prix a fait ensuite. « Au maximum visuel et pas trop verbeux » : des barres, des
// nombres, un mot par case ; le trait | du hasard posé sur chaque barre d'objectif dit l'honnêteté
// sans phrase. Toucher le nom d'une figure ouvre ses statistiques détaillées.
/** Un pourcentage du chemin : « 68 % », « touché » au-delà. */
const pcChemin = x => (x >= 1 ? 'touché' : Math.round(Math.max(0, x) * 100) + ' %');
/** « 1,7× » */
const foisF = x => (typeof Fmt !== 'undefined' && Fmt.nombre ? Fmt.nombre(Math.round(x * 10) / 10, 1) : (Math.round(x * 10) / 10).toFixed(1)).replace(/,0$/, '') + '×';
/** La barre de l'objectif : atteint ✓, raté ✗, délai –, et le trait du hasard (h : 0..1). */
function barreObjectif(a, r, d, h) {
  const b = barreStats([[a, 'ok', 'Objectif atteint : ' + a], [r, 'ko', 'Ratées : ' + r], [d, 'neutre', 'Délai écoulé : ' + d]]);
  if (!b) return '<div class="tab-barre-vide">–</div>';
  return '<div class="tab-barre-obj">' + b + (h !== null && h !== undefined ? '<b class="tab-hasard" style="left:' + (h * 100).toFixed(1) + '%" title="Au hasard : ' + Math.round(h * 10) + ' sur 10"></b>' : '') + '</div>';
}
/** La jauge « si raté » : de la validation (le trait du milieu) vers l'objectif ◆ à droite, l'autre
 *  sens à gauche ; les traits pâles : le hasard. Échelle : l'objectif à mi-chemin du bord droit. */
function jaugeRate(x, h) {
  const m = Math.min(3, Math.max(1.2, x.pres, x.contre)), w = v => Math.max(0, Math.min(50, v / m * 50));
  const tic = (v, droite) => (h ? '<b class="tab-hasard" style="left:' + (droite ? 50 + w(v) : 50 - w(v)).toFixed(1) + '%"></b>' : '');
  return '<span class="tab-jauge" aria-hidden="true"><i class="parcours-contre" style="right:50%;width:' + w(x.contre).toFixed(1) + '%"></i><i class="parcours-mieux" style="left:50%;width:' + w(Math.min(x.pres, 1)).toFixed(1) + '%"></i>'
    + '<b class="parcours-objectif" style="left:' + (50 + w(1)).toFixed(1) + '%"></b>' + (h ? tic(h.pres, true) + tic(h.contre, false) : '') + '</span>';
}
/** Le HTML du tableau : T = Guide.tableauFigures(…). */
function tableauFiguresHtml(T) {
  const nb = x => (typeof Fmt !== 'undefined' && Fmt.nombre ? Fmt.nombre(x, 0) : String(x));
  let h = '<div class="fiche-tete"><h3 class="fiche-titre">Toutes les figures</h3><button type="button" class="fiche-fermer" onclick="fermerFiche()" aria-label="Fermer">×</button></div>';
  if (!T || !T.rangs.length) return h + '<p class="stats-phrase">Pas encore de figure repérée sur ce graphique.</p>';
  const S = T.total;
  // 1. Le total, en quatre cases.
  h += '<div class="tab-total">'
    + '<span class="tab-case"><b>' + nb(S.reperees) + '</b>repérées</span>'
    + '<span class="tab-case"><b class="tab-val">' + nb(S.validees) + '</b>validées</span>'
    + '<span class="tab-case"><b class="tab-ann">' + nb(S.annulees + S.sansSuite) + '</b>annulées</span>'
    + '<span class="tab-case"><b class="tab-ok">' + nb(S.atteints) + '<small>/' + nb(S.finis) + '</small></b>objectif atteint</span></div>'
    + barreObjectif(S.atteints, S.rates, S.delai, S.hasard);
  // 2. L'honnêteté, en une ligne : le hasard ici, et sur des années quand c'est mesuré.
  const ici = S.hasard !== null ? 'Au hasard <b class="tab-hasard-ico" aria-hidden="true"></b> ' + Math.round(S.hasard * 10) + ' sur 10' : '';
  const ans = T.annees && T.annees.types ? 'sur des années : ' + T.annees.commeHasard + ' figures sur ' + T.annees.types + ' comme au hasard' : '';
  if (ici || ans) h += '<p class="tab-honnete">' + [ici, ans].filter(Boolean).join(' · ') + '</p>';
  // 3. La légende, une fois.
  h += '<p class="tab-legende"><span><i class="tab-val"></i>validée</span><span><i class="tab-ann"></i>annulée</span><span><i class="ok"></i>atteint</span><span><i class="ko"></i>raté</span><span><i class="neutre"></i>délai</span></p>';
  // 4. Une rangée par type.
  h += '<div class="tab-rangs">' + T.rangs.map(r => {
    const vr = '<span class="tab-verdict v-' + r.verdict + '">' + echapF(r.texteVerdict) + '</span>';
    const nom = r.derniere ? '<button type="button" class="tab-nom" onclick="ouvrirStatsType(\'' + r.type + '\')">' + echapF(r.nom) + ' ▸</button>' : '<span class="tab-nom">' + echapF(r.nom) + '</span>';
    const val = barreStats([[r.validees, 'tab-val', 'Validées : ' + r.validees], [r.annulees + r.sansSuite, 'tab-ann', 'Annulées : ' + (r.annulees + r.sansSuite)], [r.enFormation, 'tab-form', 'En formation : ' + r.enFormation]]);
    let q = '<div class="tab-rang' + (r.faible ? ' faible' : '') + '"><div class="tab-tete">' + nom + vr + '</div>'
      + '<div class="tab-ligne"><span class="tab-lib">' + nb(r.reperees) + ' rep.</span>' + val + '<span class="tab-num"><b class="tab-val">' + r.validees + '</b> / <b class="tab-ann">' + (r.annulees + r.sansSuite) + '</b></span></div>';
    q += '<div class="tab-ligne"><span class="tab-lib">Objectif</span>' + barreObjectif(r.atteints, r.rates, r.delai, r.hasard)
      + '<span class="tab-num">' + (r.finis ? '<b class="tab-ok">' + r.atteints + '</b>/' + r.finis : '–') + '</span></div>';
    if (r.rate) {
      q += '<div class="tab-ligne"><span class="tab-lib">Si raté</span>' + jaugeRate(r.rate, r.rateHasard) + '<span class="tab-num">' + r.rate.n + ' cas</span></div>'
        + '<p class="tab-rate"><span title="Vers l’objectif, au plus près (cas typique)">→◆ <b>' + pcChemin(r.rate.pres) + '</b></span><span title="Ensuite, dans l’autre sens (fois la distance à l’objectif)">← <b>' + foisF(r.rate.contre) + '</b></span><span title="Au bout de ' + echapF(T.fenetre) + ', du bon côté de la validation">au bout, bon côté <b>' + r.rate.prevu + '/' + r.rate.n + '</b></span></p>';
    }
    return q + '</div>';
  }).join('') + '</div>';
  h += '<p class="fiche-pied">' + echapF(T.portee) + '. « Si raté » : objectif pas atteint ; →◆ le chemin fait vers lui, ← ce qu’il repart à l’envers (fois la distance à l’objectif), sur les ' + echapF(T.fenetre) + ' après la validation, cas typique (la moitié plus, la moitié moins). '
    + echapF(Guide.AVERTISSEMENT) + '</p>';
  return h;
}
/** Le tableau de ce graphique ; null sans rejeu. */
function tableauFiguresCourant() {
  const R = typeof GUIDE_FORMES !== 'undefined' ? GUIDE_FORMES.val : null, E = typeof guideEtat !== 'undefined' ? guideEtat : null;
  return R && R.bilan && E && E.ctxF ? Guide.tableauFigures(R, E.ctxF, PARAM.guide) : null;
}
/** Ouvre le tableau de toutes les figures (dans #fichePop). */
function ouvrirTableauFigures() {
  const p = document.getElementById('fichePop');
  if (!p) return false;
  const T = tableauFiguresCourant();
  p.innerHTML = tableauFiguresHtml(T);
  Fmt.insecables(p);
  p.hidden = false;
  p.style.left = ''; p.style.top = '';
  p.scrollTop = 0;
  ficheOuverte = 'tableau'; ficheRetour = null;
  window.__tableauFigures = T;   // relu par les tests
  const b = p.querySelector('.fiche-fermer');
  if (b && b.focus) b.focus({ preventScroll: true });
  return true;
}
/** Depuis le menu (Outils) : le ferme, puis ouvre le tableau. */
function ouvrirTableauFiguresMenu() {
  const m = document.getElementById('indMenu'), b = document.getElementById('indDropdownBtn');
  if (m) m.classList.remove('open');
  if (b) b.setAttribute('aria-expanded', 'false');
  ouvrirTableauFigures();
}
/** Une rangée touchée : les statistiques détaillées de la dernière figure de ce type. */
function ouvrirStatsType(t) {
  const T = window.__tableauFigures, r = T && T.rangs.find(x => x.type === t);
  return !!(r && r.derniere && ouvrirStatsFigure(r.derniere));
}
