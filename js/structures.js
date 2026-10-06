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
//   3. le décor ajouté est muet pour les lecteurs d'écran (aria-hidden) et n'intercepte rien ;
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
    /** Élément de DÉCOR : aria-hidden, sans interaction. */
    decor(tag, classe, parent, avant, texte) {
      const e = document.createElement(tag);
      e.className = classe;
      e.setAttribute('aria-hidden', 'true');
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
    c.decor('span', 'hud-bande-tag', bande, null, 'TÉLÉMÉTRIE // 15 MIN');
    c.deplacer($('cycle'), bande);
    c.deplacer($('feedPanel'), main, main.firstChild);
    c.deplacer($('indicatorBar'), main.parentNode, main.nextSibling);
    const cc = document.querySelector('.chart-container');
    for (const k of ['hg', 'hd', 'bg', 'bd']) c.decor('i', 'hud-coin hud-coin-' + k, cc);
    c.decor('i', 'hud-balayage', cc);
    const h1 = document.querySelector('.header-left h1');
    c.attribut(h1, 'data-glitch', h1 ? h1.textContent : '');
    const tl = document.querySelector('.taskbar-left');
    if (tl) c.decor('span', 'hud-invite', tl, tl.firstChild, '>_');
    return () => c.defaire();
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

// Au chargement : la structure du thème posé par le script de tête. Ce fichier est chargé
// en `defer` AVANT js/app.js : le DOM est complet, le graphique pas encore dessiné.
appliquerStructure(structureDuTheme(document.documentElement.getAttribute('data-theme')));
