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

// ─── FENÊTRES (thèmes Bureau 95 et Bureau 95 contraste) : un bureau d'ordinateur personnel ───
// La page a déjà une barre des tâches et son horloge : la structure en révèle les fenêtres. Le
// graphique devient une fenêtre — barre de titre, barre d'outils (le ruban), zone client, barre
// d'état (les chiffres clés de la publication et leur âge) — et le marché live une seconde ; la
// barre des tâches reçoit « Démarrer » (le menu des thèmes), un lancement rapide (les boutons
// d'accès de l'en-tête, qui libèrent la place du prix au téléphone), la tâche active et une zone
// de notification où l'heure de publication (UTC) côtoie l'horloge du poste : deux heures, deux
// cadences, chacune nommée.
STRUCTURES.fenetres = {
  nom: 'Fenêtres',
  construire() {
    const c = chantier(), $ = id => document.getElementById(id);
    const cc = document.querySelector('.chart-container'), fp = $('feedPanel');
    const tl = document.querySelector('.taskbar-left'), tr = document.querySelector('.taskbar-right');
    // 1. Fenêtre « Graphique ». Les boutons de la barre de titre sont dessinés gravés (inactifs) :
    //    décor, comme le titre.
    c.decor('div', 'f95-titre', cc, cc.firstChild, 'Graphique');
    c.deplacer($('indicatorBar'), cc, $('chart'));
    const etat = c.conteneur('div', 'f95-etat', cc, null, "Barre d'état : dernière publication");
    c.deplacer($('cycle'), etat);
    // 2. Fenêtre « Marché live »
    c.decor('div', 'f95-titre', fp, fp.firstChild, 'Marché live');
    // 3. Barre des tâches. La tâche active regroupe les deux étiquettes de la base (nom, paire).
    const etiquettes = [...tl.children];
    c.deplacer($('themeBtn'), tl, tl.firstChild);
    const lr = c.conteneur('div', 'f95-lancement', tl, $('themeBtn').nextSibling, 'Lancement rapide');
    for (const el of [$('feedBtn'), $('liveBtn'), document.querySelector('.header-right [onclick="resetView()"]'),
                      $('carteBtn'), $('reglagesBtn'), $('legendesBtn')]) c.deplacer(el, lr);
    const tache = c.conteneur('div', 'f95-tache', tl, null, 'Tâche active');
    for (const el of etiquettes) c.deplacer(el, tache);
    const zone = c.conteneur('div', 'f95-zone', tr, tr.firstChild, 'Zone de notification');
    c.deplacer($('dot'), zone);
    c.decor('span', 'f95-pub', zone, null, 'Pub.');
    c.deplacer($('updated'), zone);
    c.decor('span', 'f95-pub', zone, null, 'UTC');
    c.deplacer($('taskbarClock'), zone);
    // La barre d'état suit la LARGEUR de la fenêtre, qui change quand le marché live s'ouvre ou se
    // replie : les chiffres clés y sont réajustés (masqués en entier depuis la fin, ajusterKpis),
    // et le canvas redimensionné sans attendre. Dans l'en-tête de la base, la bande ne dépendait
    // pas du panneau. Une image d'animation au plus par changement ; rien au repos ni pendant un
    // geste (la taille ne change pas).
    let raf = 0, vue = '';
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const taille = cc.clientWidth + 'x' + cc.clientHeight;
        if (taille === vue) return;
        vue = taille;
        try { if (typeof resizeCanvas === 'function') { resizeCanvas(); drawChart(); } } catch (e) { /* avant init */ }
        try { if (typeof ajusterKpis === 'function') ajusterKpis(); } catch (e) { /* avant init */ }
      });
    }) : null;
    if (ro) ro.observe(cc);
    return () => { if (ro) ro.disconnect(); if (raf) cancelAnimationFrame(raf); c.defaire(); };
  },
};

// ─── TABLEAU (thème Gare) : le grand tableau d'affichage d'une gare ─────────────
// Les chiffres clés quittent l'en-tête pour un tableau pleine largeur, avec l'heure de la
// publication ; chaque bloc dit sa PROVENANCE et sa cadence, lues dans CADENCES (une étiquette
// recopiée mentirait le jour où le cron change). Les palettes sont du CSS pur, sur les vrais
// nœuds (themes/gare.css). Une palette « tombe » quand sa valeur CHANGE : un demi-volet se
// rabat une fois sur le texte déjà juste — aucun faux caractère ne défile.
const CHUTE_RETRAIT_MS = 400;   // retrait de .gare-chute : après le passage du volet (0,22 s, CSS)
const CHUTE_PRIX_MS = 5000;     // prix : au plus une chute par intervalle (il change chaque seconde)
STRUCTURES.tableau = {
  nom: "Tableau d'affichage",
  construire() {
    const c = chantier(), $ = id => document.getElementById(id);
    const tete = document.querySelector('.header');
    const tab = c.conteneur('div', 'gare-tableau', tete.parentNode, tete.nextSibling, 'Tableau : dernière publication');
    c.decor('span', 'gare-titre', tab, null, 'Cotations');
    c.decor('span', 'gare-provenance', tab, null, 'Provenance serveur · ' + CADENCES.attendue_min + ' min');
    c.deplacer($('cycle'), tab);
    const h = c.conteneur('div', 'gare-heure', tab, null, 'Heure de publication');
    c.decor('span', 'gare-titre', h, null, 'Publié à');
    c.deplacer($('updated'), h);
    c.decor('span', 'gare-utc', h, null, 'UTC');
    const hp = document.querySelector('.hero-prix');
    c.decor('span', 'gare-provenance', hp, hp.firstChild, 'Binance · ' + CADENCES.prix / 1000 + ' s');
    const tl = document.querySelector('.taskbar-left');
    if (tl) c.decor('span', 'gare-info', tl, tl.firstChild, 'Information voyageurs ·');
    const clk = $('taskbarClock');
    if (clk) c.decor('span', 'gare-titre', clk.parentNode, clk, 'Heure locale');

    // Chutes : liées à un ÉVÉNEMENT, jamais en boucle (une boucle coûtait ×35 au repos, Néon).
    // Mouvement réduit : la feuille ne dessine pas le volet ; ici, on ne pose même pas la classe.
    const minuteries = new Set();
    const reduit = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    const chute = el => {
      if (reduit && reduit.matches) return;
      el.classList.remove('gare-chute'); void el.offsetWidth; el.classList.add('gare-chute');
      const t = setTimeout(() => { el.classList.remove('gare-chute'); minuteries.delete(t); }, CHUTE_RETRAIT_MS);
      minuteries.add(t);
    };
    const heure = $('updated'), cycle = $('cycle'), prix = $('price');
    const age = () => cycle && cycle.querySelector('.kpi-age');
    // Âge inconnu (« — ») : pas de remarque « À l'heure », qui serait fausse (themes/gare.css).
    const marquerInconnu = a => { if (a) a.classList.toggle('gare-inconnu', !/\d/.test(a.textContent)); };
    marquerInconnu(age());
    let vuHeure = heure ? heure.textContent : '', vuAge = age() ? age().textContent : '', vuPrix = prix ? prix.textContent : '', tPrix = -Infinity;
    const obs = [];
    if (typeof MutationObserver !== 'undefined') {
      // renderFeedTo réécrit le tableau chaque minute, publication nouvelle ou non : on compare
      // le TEXTE. Heure changée = publication nouvelle → chiffres clés, âge et heure tombent ;
      // sinon, l'âge seul, quand ses minutes changent.
      const ot = new MutationObserver(() => {
        const a = age();
        marquerInconnu(a);
        if (heure && heure.textContent !== vuHeure) { vuHeure = heure.textContent; vuAge = a ? a.textContent : ''; chute(tab); }
        else if (a && a.textContent !== vuAge) { vuAge = a.textContent; chute(a); }
      });
      ot.observe(tab, { childList: true, characterData: true, subtree: true });
      obs.push(ot);
      // Prix : fetchPrice réécrit sa classe chaque seconde — la chute se pose sur .hero-prix.
      if (prix) {
        const op = new MutationObserver(() => {
          if (prix.textContent === vuPrix) return;
          vuPrix = prix.textContent;
          const t = performance.now();
          if (t - tPrix < CHUTE_PRIX_MS) return;
          tPrix = t; chute(hp);
        });
        op.observe(prix, { childList: true, characterData: true, subtree: true });
        obs.push(op);
      }
    }
    // Les palettes ont leur police (chasse fixe condensée, lue dans --font-palette) : la bande
    // des chiffres clés se remesure quand elle est chargée. Mesurée avec la police de repli,
    // plus large, elle masquait des chiffres qui tiennent.
    let actif = true;
    const police = getComputedStyle(document.documentElement).getPropertyValue('--font-palette').trim();
    if (police && document.fonts && document.fonts.load) {
      document.fonts.load('500 17px ' + police).then(() => { if (actif && typeof ajusterKpis === 'function') ajusterKpis(); }).catch(() => {});
    }
    return () => {
      actif = false;
      obs.forEach(o => o.disconnect());
      minuteries.forEach(clearTimeout);
      for (const el of [hp, ...(cycle ? cycle.querySelectorAll('.gare-chute, .gare-inconnu') : [])]) el.classList.remove('gare-chute', 'gare-inconnu');
      c.defaire();
    };
  },
};

// Au chargement : la structure du thème posé par le script de tête. Ce fichier est chargé
// en `defer` AVANT js/app.js : le DOM est complet, le graphique pas encore dessiné.
appliquerStructure(structureDuTheme(document.documentElement.getAttribute('data-theme')));
