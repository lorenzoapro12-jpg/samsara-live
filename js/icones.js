// ─────────────────────────────────────────────────────────────────────────────
// Une icône par famille d'information (demande du 12/10/2026)
// ─────────────────────────────────────────────────────────────────────────────
// Chaque info du graphique appartient à une famille : un repère de prix, une figure chartiste,
// un scénario du matin de Claude, la tendance, « Et ensuite ? », une heure, la phrase de lecture.
// Sa famille se reconnaît d'un coup d'œil par la même icône partout : au début de son étiquette
// sur le graphique (à la place du trait de couleur, dans la même couleur : la couleur garde l'état),
// dans la liste « Sur le graphique », dans « En résumé » et dans la légende du panneau
// « Choisir l'affichage ». Des traits simples sur une grille de 10 × 10, monochromes (la couleur
// est celle du texte ou de l'état), lisibles à 8 px.
const Icones = (() => {
  // Les tracés (syntaxe SVG, grille 10 × 10). PLEIN : rempli, sinon tracé au trait.
  const D = {
    niveau: 'M1 3.2H9M1 6.8H9',                                     // une bande de prix : deux lignes
    figure: 'M.8 8.6L3.1 2.2L5 6.2L6.9 2.2L9.2 8.6',                 // un double sommet
    scenario: 'M5 0L6.4 3.6L10 5L6.4 6.4L5 10L3.6 6.4L0 5L3.6 3.6Z',   // l'étincelle de Claude
    'tendance+': 'M1 8.4L4.2 5.2L6 7L9 3.4M6.2 3.2H9.2V6.2',          // la tendance : une flèche, selon son sens
    'tendance-': 'M1 1.6L4.2 4.8L6 3L9 6.6M6.2 6.8H9.2V3.8',
    tendance: 'M.8 5H9M6.4 2.4L9 5L6.4 7.6',
    suite: 'M.8 5H4.2L8.6 1.6M4.2 5L8.6 8.4M6.4 1.4H8.8V3.8M6.4 8.6H8.8V6.2',   // deux chemins possibles
    moment: 'M9 5A4 4 0 1 1 1 5A4 4 0 1 1 9 5ZM5 2.6V5L6.7 6.2',     // une heure
    lecture: 'M.6 5C2.2 2 7.8 2 9.4 5C7.8 8 2.2 8 .6 5ZM6.3 5A1.3 1.3 0 1 1 3.7 5A1.3 1.3 0 1 1 6.3 5Z',   // ce que dit le graphique
  };
  const PLEIN = { scenario: true };
  const TRAIT = 1.7;          // épaisseur, en unités de la grille (≈ 1,4 px à 8 px)
  // Les noms des familles (titres, légende) : en mots simples.
  const NOMS = { niveau: 'Repère de prix', figure: 'Figure chartiste', scenario: 'Scénario du matin de Claude',
    tendance: 'Tendance', suite: 'Et ensuite ?', moment: 'Heure à retenir', lecture: 'Ce que dit le graphique' };
  // L'ordre de la légende.
  const LEGENDE = ['niveau', 'figure', 'scenario', 'tendance', 'suite', 'moment'];
  // La place de plus qu'une étiquette du graphique prend avec son icône (au lieu du trait).
  const PLUS = 5;
  /** La famille d'une clé (« tendance+ » → « tendance »). */
  const famille = cle => String(cle || '').replace(/[+-]$/, '');
  /** La clé de la tendance selon son sens (+1, −1, 0). */
  const tendance = sens => (sens > 0 ? 'tendance+' : sens < 0 ? 'tendance-' : 'tendance');
  const connue = cle => Object.prototype.hasOwnProperty.call(D, cle);
  /** L'icône en SVG (texte), à la couleur du texte (currentColor). */
  function svg(cle, cls) {
    if (!connue(cle)) return '';
    const plein = PLEIN[cle];
    return '<svg class="ico ico-' + famille(cle) + (cls ? ' ' + cls : '') + '" viewBox="0 0 10 10" aria-hidden="true" focusable="false">'
      + '<path d="' + D[cle] + '" fill="' + (plein ? 'currentColor' : 'none') + '" stroke="' + (plein ? 'none' : 'currentColor')
      + '" stroke-width="' + TRAIT + '" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }
  /** La même icône en élément du DOM (listes construites à la main). */
  function element(cle, cls) {
    if (!connue(cle) || typeof document === 'undefined') return null;
    const t = document.createElement('template');
    t.innerHTML = svg(cle, cls);
    return t.content.firstChild;
  }
  // Sur le graphique (canvas) : un Path2D par icône, gardé.
  const chemins = {};
  /** Dessine l'icône `cle` dans le carré (x, y, s) sur le contexte g, de la couleur coul. → vrai si
   *  dessinée (faux : clé inconnue ou Path2D absent ; l'appelant garde son trait). */
  function dessiner(g, cle, x, y, s, coul) {
    if (!connue(cle) || typeof Path2D === 'undefined') return false;
    const p = chemins[cle] || (chemins[cle] = new Path2D(D[cle]));
    g.save();
    g.translate(x, y); g.scale(s / 10, s / 10);
    if (PLEIN[cle]) { g.fillStyle = coul; g.fill(p); }
    else { g.strokeStyle = coul; g.lineWidth = TRAIT; g.lineCap = 'round'; g.lineJoin = 'round'; g.setLineDash([]); g.stroke(p); }
    g.restore();
    return true;
  }
  return { D, NOMS, LEGENDE, PLUS, famille, tendance, connue, svg, element, dessiner };
})();
if (typeof module !== 'undefined') module.exports = Icones;
