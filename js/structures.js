// ═══════════════════════════════════════════════════════════════════════════════
// STRUCTURES — un thème peut changer la STRUCTURE de la page, pas seulement l'habillage.
// ─────────────────────────────────────────────────────────────────────────────
// Décision du 06/10/2026 : « vraie structure par thème ». Un thème déclare sa structure dans
// le registre (<link data-theme-id … data-structure="hud">) ; elle est construite ici en
// DÉPLAÇANT les nœuds existants de la page (leurs identifiants et leurs gestionnaires restent
// les mêmes : js/app.js ne sait pas qu'ils ont bougé) et en ajoutant du décor.
//
// LE CONTRAT D'UNE STRUCTURE (tests/test_structures.js le vérifie dans un vrai navigateur) :
//   1. aucune VALEUR ni aucun ÂGE affiché par la structure de base ne disparaît : prix,
//      variation, chiffres clés et leur âge, heure de publication, cartes du marché, graphique ;
//   2. tout est RÉVERSIBLE : quitter le thème rend la page nœud pour nœud ;
//   3. le décor ajouté (chantier().decor, marqué data-decor) est muet pour les lecteurs d'écran
//      (aria-hidden) et n'intercepte rien (pointer-events: none) ;
//   4. le coût d'image tient le budget mesuré du thème (tests/test_budget.js).
// ═══════════════════════════════════════════════════════════════════════════════

const STRUCTURES = {};
let structureCourante = null, defaireStructure = null;

/** Un chantier réversible : chaque opération est notée, `defaire()` les annule à rebours. */
function chantier() {
  const journal = [];
  return {
    deplacer(noeud, parent, avant) {
      if (!noeud || !parent) return;
      journal.push({ type: 'deplace', noeud, parent: noeud.parentNode, suivant: noeud.nextSibling });
      parent.insertBefore(noeud, avant || null);
    },
    /** Élément de DÉCOR : aria-hidden, sans interaction. Marqué `data-decor` : css/app.css le
     *  rend inerte au pointeur, tests/test_structures.js contrôle TOUT décor par ce marqueur,
     *  quel que soit le préfixe de classe du thème. */
    decor(tag, classe, parent, avant, texte) {
      const e = document.createElement(tag);
      e.className = classe;
      e.setAttribute('aria-hidden', 'true');
      e.setAttribute('data-decor', '');
      if (texte) e.textContent = texte;
      parent.insertBefore(e, avant || null);
      journal.push({ type: 'cree', noeud: e });
      return e;
    },
    /** Conteneur de STRUCTURE : il recevra de vrais nœuds, il n'est pas masqué. */
    conteneur(tag, classe, parent, avant, etiquette) {
      const e = document.createElement(tag);
      e.className = classe;
      if (etiquette) e.setAttribute('aria-label', etiquette);
      parent.insertBefore(e, avant || null);
      journal.push({ type: 'cree', noeud: e });
      return e;
    },
    attribut(el, nom, valeur) {
      if (!el) return;
      journal.push({ type: 'attr', el, nom, avant: el.getAttribute(nom) });
      el.setAttribute(nom, valeur);
    },
    defaire() {
      for (let i = journal.length - 1; i >= 0; i--) {
        const j = journal[i];
        if (j.type === 'deplace') j.parent.insertBefore(j.noeud, j.suivant);
        else if (j.type === 'cree') j.noeud.remove();
        else if (j.type === 'attr') { if (j.avant === null) j.el.removeAttribute(j.nom); else j.el.setAttribute(j.nom, j.avant); }
      }
      journal.length = 0;
    },
  };
}

function appliquerStructure(id) {
  id = (id && STRUCTURES[id]) ? id : null;
  const racine = document.documentElement;
  if (structureCourante !== id) {
    if (defaireStructure) { defaireStructure(); defaireStructure = null; }
    structureCourante = null;
    racine.removeAttribute('data-structure');
    if (id) {
      defaireStructure = STRUCTURES[id].construire();
      structureCourante = id;
      racine.setAttribute('data-structure', id);
    }
  }
  racine.setAttribute('data-structure-posee', '');
  // Le graphique et la bande de chiffres clés se mesurent sur leur nouveau conteneur. Avant
  // l'exécution de js/app.js, ces fonctions n'existent pas encore : rien à faire.
  try { if (typeof resizeCanvas === 'function') { resizeCanvas(); drawChart(); } } catch (e) { /* avant init */ }
  try { if (typeof ajusterKpis === 'function') ajusterKpis(); } catch (e) { /* avant init */ }
  // Le ruban a pu changer de conteneur et de largeur : son fondu « déborde » se recalcule.
  try { if (typeof ajusterRuban === 'function') ajusterRuban(); } catch (e) { /* avant init */ }
}
function structureDuTheme(id) {
  const l = document.querySelector('link[data-theme-id="' + id + '"]');
  return l ? l.getAttribute('data-structure') : null;
}

// ─── HUD (thème Néon) : un poste de pilotage ───────────────────────────────────
// Les chiffres clés quittent l'en-tête pour une bande de télémétrie pleine largeur ; le
// panneau du marché passe à gauche, comme un rail de systèmes ; la barre des indicateurs
// devient une console sous le graphique ; le graphique reçoit des coins de visée et un
// balayage ; le titre « glitche ».
STRUCTURES.hud = {
  nom: 'Poste de pilotage',
  construire() {
    const c = chantier(), $ = id => document.getElementById(id);
    const tete = document.querySelector('.header'), main = document.querySelector('.main-area');
    const bande = c.conteneur('div', 'hud-bande', tete.parentNode, tete.nextSibling, 'Télémétrie : dernière publication');
    c.decor('span', 'hud-bande-tag', bande, null, 'TÉLÉMÉTRIE // ' + CADENCES.attendue_min + ' MIN');   // js/cadences.js
    c.deplacer($('cycle'), bande);
    c.deplacer($('feedPanel'), main, main.firstChild);
    c.deplacer($('indicatorBar'), main.parentNode, main.nextSibling);
    const cc = document.querySelector('.chart-container');
    for (const k of ['hg', 'hd', 'bg', 'bd']) c.decor('i', 'hud-coin hud-coin-' + k, cc);
    const balayage = c.decor('i', 'hud-balayage', cc);
    // Le balayage passe UNE fois par publication NOUVELLE (l'heure de #updated change) : un
    // effet lié à un événement, jamais en boucle (mesuré : une boucle coûtait ×35 au repos).
    const heure = $('updated');
    let vue = heure ? heure.textContent : '';
    const obs = heure && typeof MutationObserver !== 'undefined' ? new MutationObserver(() => {
      if (heure.textContent === vue) return;
      vue = heure.textContent;
      balayage.classList.remove('actif'); void balayage.offsetWidth; balayage.classList.add('actif');
    }) : null;
    if (obs) obs.observe(heure, { childList: true, characterData: true, subtree: true });
    balayage.addEventListener('animationend', () => balayage.classList.remove('actif'));
    const h1 = document.querySelector('.header-left h1');
    c.attribut(h1, 'data-glitch', h1 ? h1.textContent : '');
    const tl = document.querySelector('.taskbar-left');
    if (tl) c.decor('span', 'hud-invite', tl, tl.firstChild, '>_');
    return () => { if (obs) obs.disconnect(); c.defaire(); };
  },
};

// ─── CODEX (thème Codex) : un manuscrit ouvert ─────────────────────────────────
// Frontispice (titre enluminé, cours du jour), registre des chiffres clés sous le titre, deux
// folios : la chronique du marché au verso (gauche), la carte au recto (droite), une reliure
// entre les deux ; la barre des tâches devient le colophon.
STRUCTURES.codex = {
  nom: 'Manuscrit',
  construire() {
    const c = chantier(), $ = id => document.getElementById(id);
    const tete = document.querySelector('.header'), main = document.querySelector('.main-area');
    const reg = c.conteneur('div', 'codex-registre', tete.parentNode, tete.nextSibling, 'Registre : dernière publication');
    c.decor('span', 'codex-registre-titre', reg, null, 'Registre du marché');
    c.deplacer($('cycle'), reg);
    c.decor('span', 'codex-fleuron', reg, null, '❦');
    c.deplacer($('feedPanel'), main, main.firstChild);
    c.decor('div', 'codex-reliure', main, document.querySelector('.chart-container'));
    const cc = document.querySelector('.chart-container');
    for (const k of ['hg', 'hd', 'bg', 'bd']) c.decor('i', 'codex-ornement codex-ornement-' + k, cc);
    const tl = document.querySelector('.taskbar-left');
    if (tl) c.decor('span', 'codex-colophon', tl, tl.firstChild, 'Colophon ·');
    return () => c.defaire();
  },
};

// ─── PLANCHE (thèmes Cyanotype et Diazo) : une planche de dessin technique ─────
// Un cadre à repères de zone (1–8, A–D) et de centrage, posé SOUS le contenu (fixe, z-index −1 :
// <html> n'a pas de fond) ; un PIED DE PLANCHE entre le graphique et le Grid Bot : la nomenclature
// des calques (le ruban d'outils) et le cartouche, registre de la dernière publication — chiffres
// clés en cases, l'âge devient l'« indice de révision », l'heure la « date de révision » ; le
// graphique est la « Vue A », les cartes du marché des « Détail A, B… » (en CSS). Le nuage de
// révision entoure le cartouche 90 s quand une NOUVELLE publication arrive.
// ⚠️ Rien n'est inséré DANS #indicatorBar : la règle téléphone de css/app.css compte ses <span>
// (span:nth-of-type(5|6)) pour remonter l'intervalle ; le titre de la nomenclature est son frère.
STRUCTURES.planche = {
  nom: 'Planche',
  revisionMs: 90000,   // durée du nuage de révision après une nouvelle publication
  construire() {
    const c = chantier(), $ = id => document.getElementById(id), duree = this.revisionMs;
    const main = document.querySelector('.main-area'), body = document.body;
    // 1. Cadre, repères de zone (8 en largeur, 4 en hauteur) et de centrage.
    const cadre = c.decor('div', 'plan-cadre', body, body.firstChild);
    for (const n of '12345678') for (const b of ['haut', 'bas']) c.decor('i', 'plan-repere plan-' + b + ' plan-z' + n, cadre, null, n);
    for (const l of 'ABCD') for (const b of ['gauche', 'droite']) c.decor('i', 'plan-repere plan-' + b + ' plan-z' + l, cadre, null, l);
    for (const k of ['h', 'b', 'g', 'd']) c.decor('i', 'plan-centrage plan-centrage-' + k, cadre);
    // 2. Pied de planche : nomenclature (titre HORS du ruban), puis cartouche.
    const pied = c.conteneur('div', 'plan-pied', main.parentNode, $('stratSection'), 'Pied de planche');
    c.decor('span', 'plan-titre', pied, null, 'Nomenclature · calques');
    c.deplacer($('indicatorBar'), pied);
    const cart = c.conteneur('div', 'plan-cartouche', pied, null, 'Cartouche : dernière publication');
    c.decor('span', 'plan-titre plan-nom', cart, null, 'Saṃsāra · planche 1/1');
    c.decor('span', 'plan-titre plan-unite', cart, null, 'Unité : USD');
    // Provenance : les sources que la publication déclare (market-data.json, champ `source`).
    const src = c.decor('span', 'plan-titre plan-sources', cart, null, 'Sources : —');
    c.deplacer($('cycle'), cart);
    c.decor('span', 'plan-titre plan-date', cart, null, 'Date de rév.');
    c.deplacer($('updated'), cart);
    // 3. La vue du graphique, lettrée dans la marge basse de son cadre (jamais sur le canvas).
    c.decor('span', 'plan-vue', document.querySelector('.chart-container'), null, 'Vue A · cours');
    // 4. Marge : le format de la planche, dans la barre des tâches.
    const tl = document.querySelector('.taskbar-left');
    if (tl) c.decor('span', 'plan-titre plan-format', tl, tl.firstChild, 'Format A0 · éch. 1:1');
    // La publication est lue par js/app.js (marketData) : au chargement, ce fichier passe avant
    // lui, la variable n'existe pas encore — d'où le typeof.
    const lireSources = () => {
      try { if (typeof marketData !== 'undefined' && marketData && marketData.source) src.textContent = 'Sources : ' + marketData.source; } catch (e) { /* avant app.js */ }
    };
    lireSources();
    // Nuage de révision : l'heure de #updated CHANGE (une nouvelle publication), pas son premier
    // remplissage. Un dessin statique posé 90 s : aucune animation, aucune minuterie au repos.
    const heure = $('updated');
    let vue = heure ? heure.textContent : '', minuterie = 0;
    const obs = heure && typeof MutationObserver !== 'undefined' ? new MutationObserver(() => {
      lireSources();
      if (heure.textContent === vue) return;
      const avant = vue;
      vue = heure.textContent;
      if (!avant) return;
      cart.classList.add('revise');
      clearTimeout(minuterie);
      minuterie = setTimeout(() => cart.classList.remove('revise'), duree);
    }) : null;
    if (obs) obs.observe(heure, { childList: true, characterData: true, subtree: true });
    // Le pied n'a pas une hauteur fixe (la nomenclature passe sur deux ou trois rangées selon la
    // largeur et la police chargée) : le canvas suit la HAUTEUR de son cadre. La largeur, elle,
    // est suivie par la page (panneau du marché, fenêtre) : on ne redessine pas deux fois.
    const cc = document.querySelector('.chart-container');
    let hauteur = -1, image = 0;
    const ro = cc && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(e => {
      const h = Math.round(e[0].contentRect.height);
      if (h === hauteur) return;
      hauteur = h;
      cancelAnimationFrame(image);
      image = requestAnimationFrame(() => {
        try { if (typeof resizeCanvas === 'function') { resizeCanvas(); drawChart(); } } catch (err) { /* avant init */ }
      });
    }) : null;
    if (ro) ro.observe(cc);
    return () => { if (obs) obs.disconnect(); if (ro) ro.disconnect(); cancelAnimationFrame(image); clearTimeout(minuterie); c.defaire(); };
  },
};

// Au chargement : la structure du thème posé par le script de tête. Ce fichier est chargé
// en `defer` AVANT js/app.js : le DOM est complet, le graphique pas encore dessiné.
appliquerStructure(structureDuTheme(document.documentElement.getAttribute('data-theme')));
