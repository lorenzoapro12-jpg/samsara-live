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

// ─── UNE (thème Gazette) : la une d'un quotidien financier ─────────────────────
// Plaque de titre en trois colonnes (oreille gauche : le cours à la seconde ; le titre ; oreille
// droite : l'heure de l'édition), folio (date du poste, outils), manchette composée par le code,
// « la cote » (les chiffres clés de la publication), légende du cliché sous le graphique,
// téléscripteur dans la barre des tâches.
//
// LA MANCHETTE NE CALCULE RIEN. Elle RECOPIE le texte affiché des chiffres clés de la cote (les
// <b> de #cycle, repérés par le libellé de leur <i>) : même signe, même format, même instant que
// la cote — « +0.2% », jamais « +0,2 % ». Elle ne titre que sur des champs SANS équivalent live
// (financement, intérêt ouvert, CVD, GEX) : la variation 24 h publiée, titrée à côté de l'oreille
// qui bat à la seconde, la contredisait (constaté sur le prototype). Son seul mot choisi est le
// verbe d'une VARIATION, tiré du premier caractère du texte affiché : « + » progresse, « − »
// recule, sinon stable. Aucun seuil (rien de nouveau à déclarer), aucun adjectif : un compte
// rendu, pas un avis. Un niveau (le financement) ou un état (le GEX) se cite sans verbe ; une
// clause dont la valeur est « — » est omise.
const GAZETTE_CLES = { financement: 'Funding', interet: 'OI 24h', cvd: 'CVD 24h', gex: 'GEX' };
const verbeGazette = t => t[0] === '+' ? 'progresse' : t[0] === '−' ? 'recule' : 'stable';
/** La manchette, en segments [texte, est-une-valeur]. `lire(libellé)` rend le texte affiché du
 *  chiffre clé (ou null) ; `heure`, le texte affiché de #updated. Fonction pure. */
function manchetteGazette(lire, heure) {
  const cite = cle => { const t = lire(GAZETTE_CLES[cle]); return t && t !== '—' ? t : null; };
  const f = cite('financement'), oi = cite('interet'), cvd = cite('cvd'), gex = cite('gex');
  const titre = [];
  if (f) titre.push(['Le financement des perpétuels à ', 0], [f, 1]);
  if (oi) titre.push([(titre.length ? '\u00a0; l’' : 'L’') + 'intérêt ouvert ' + verbeGazette(oi) + '\u00a0: ', 0], [oi, 1], [' en 24\u00a0h', 0]);
  const chapeau = [];
  for (const [cle, v] of [['cvd', cvd], ['gex', gex]]) if (v) chapeau.push([(chapeau.length ? ' · ' : '') + GAZETTE_CLES[cle] + '\u00a0', 0], [v, 1]);
  if (heure && /\d/.test(heure)) chapeau.push([(chapeau.length ? ' · ' : '') + 'édition de ', 0], [heure, 1], ['\u00a0UTC', 0]);
  if (!titre.length) titre.push([lire(GAZETTE_CLES.interet) === null && lire(GAZETTE_CLES.financement) === null ? 'Édition en attente' : 'La cote de l’édition', 0]);
  return { titre, chapeau };
}
// Une cadence de la table CADENCES, dite en mots : « à la seconde », « toutes les 5 s ».
const enSecondes = ms => ms === 1000 ? 'à la seconde' : 'toutes les ' + ms / 1000 + ' s';

STRUCTURES.une = {
  nom: 'Une',
  construire() {
    const c = chantier(), $ = id => document.getElementById(id);
    const tete = document.querySelector('.header'), gauche = document.querySelector('.header-left');
    // 1. Plaque de titre (grille 1fr auto 1fr) : oreille gauche | titre (.header-left) | oreille droite.
    const og = c.conteneur('div', 'gazette-oreille-g', tete, gauche, 'Cours ' + enSecondes(CADENCES.prix));
    c.decor('span', 'gazette-tag', og, null, 'Cours ' + enSecondes(CADENCES.prix));
    c.deplacer(document.querySelector('.hero-prix'), og);
    const od = c.conteneur('div', 'gazette-oreille-d', tete, gauche.nextSibling, 'Heure de l’édition');
    const ed = c.conteneur('div', 'gazette-edition', od);
    c.decor('span', 'gazette-tag', ed, null, 'Édition de');
    c.deplacer($('updated'), ed);                  // AVANT de déplacer .header-right, qui le contient
    c.decor('span', 'gazette-tag', ed, null, 'UTC');
    // Seconde ligne, de hauteur fixe (rien ne bouge quand elle change) : la cadence attendue, ou
    // « Édition périmée » (en plus de l'âge, quand la cote est vieille : #cycle.vieux, CSS :has),
    // ou le tampon « Dernière heure » (une édition NOUVELLE).
    const alertes = c.decor('div', 'gazette-alertes', od);
    c.decor('span', 'gazette-cadence', alertes, null, 'Paraît toutes les ' + CADENCES.attendue_min + ' min');
    c.decor('span', 'gazette-perimee', alertes, null, 'Édition périmée');
    c.decor('span', 'gazette-tampon', alertes, null, 'Dernière heure');
    // 2. Folio : la date du poste, puis les outils.
    const folio = c.conteneur('div', 'gazette-folio', tete.parentNode, tete.nextSibling, 'Folio');
    const date = c.decor('span', 'gazette-date', folio);
    c.deplacer(document.querySelector('.header-right'), folio);
    // 3. Manchette : décor (muette, inerte) — la cote, juste dessous, porte les vraies valeurs.
    const man = c.decor('div', 'gazette-manchette', tete.parentNode, folio.nextSibling);
    const titre = c.decor('div', 'gazette-titre', man), chapeau = c.decor('div', 'gazette-chapeau', man);
    // 4. La cote.
    const cote = c.conteneur('div', 'gazette-cote', tete.parentNode, man.nextSibling, 'La cote : dernière publication');
    c.decor('span', 'gazette-tag', cote, null, 'La cote');
    c.deplacer($('cycle'), cote);
    // 5. Légende du cliché, dans la marge basse du graphique (jamais sur le canvas).
    c.decor('span', 'gazette-legende', document.querySelector('.chart-container'), null,
            'Cliché : bougies Binance de l’intervalle choisi, rafraîchies ' + enSecondes(CADENCES.bougies));
    // 6. Téléscripteur.
    const tl = document.querySelector('.taskbar-left');
    if (tl) c.decor('span', 'gazette-tag', tl, tl.firstChild, 'Téléscripteur ·');

    const heure = $('updated'), cy = $('cycle');
    const lire = lib => {
      for (const k of cy.querySelectorAll('.kpi')) {
        const i = k.querySelector('i'), b = k.querySelector('b');
        if (i && b && i.textContent.trim() === lib) return b.textContent.trim();
      }
      return null;
    };
    const ecrire = (el, segs) => el.replaceChildren(...segs.map(([t, v]) => {
      if (!v) return document.createTextNode(t);
      const s = document.createElement('span');
      s.className = 'gazette-valeur' + (t[0] === '−' ? ' neg' : '');
      s.textContent = t;
      return s;
    }));
    let signature = null;
    const rediger = () => {
      const m = manchetteGazette(lire, heure.textContent.trim());
      const sig = JSON.stringify(m);
      if (sig === signature) return;
      signature = sig;
      const h0 = man.offsetHeight;
      ecrire(titre, m.titre); ecrire(chapeau, m.chapeau);
      // La manchette passe d'une ligne à deux : le graphique se remesure (il ne suit que la fenêtre).
      if (man.offsetHeight !== h0 && typeof resizeCanvas === 'function') { try { resizeCanvas(); drawChart(); } catch (e) { /* avant init */ } }
    };
    // La date du folio : l'horloge du poste, relue au changement de jour.
    let tJour = 0;
    const dater = () => {
      const d = new Date();
      date.textContent = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      clearTimeout(tJour);
      tJour = setTimeout(dater, new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 0, 0, 1) - d);
    };
    dater();
    rediger();
    // Une édition NOUVELLE (l'heure de #updated change, d'une heure à une autre — pas au premier
    // rendu, ni à la réécriture de chaque minute, qui remet le même texte) : le tampon s'allume
    // jusqu'à la relecture suivante de la publication (CADENCES.publication_lue).
    let vue = heure.textContent.trim(), tTampon = 0;
    const obs = new MutationObserver(() => {
      rediger();
      const h = heure.textContent.trim();
      if (h === vue) return;
      if (/\d/.test(vue) && /\d/.test(h)) {
        alertes.classList.add('tampon');
        clearTimeout(tTampon);
        tTampon = setTimeout(() => alertes.classList.remove('tampon'), CADENCES.publication_lue);
      }
      vue = h;
    });
    obs.observe(heure, { childList: true, characterData: true, subtree: true });
    obs.observe(cy, { childList: true, characterData: true, subtree: true });
    // Polices du thème chargées après la pose : la cote et le graphique se remesurent une fois.
    let vivante = true;
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => {
      if (!vivante) return;
      try { if (typeof ajusterKpis === 'function') { ajusterKpis(); resizeCanvas(); drawChart(); } } catch (e) { /* avant init */ }
    }).catch(() => {});
    return () => { vivante = false; obs.disconnect(); clearTimeout(tTampon); clearTimeout(tJour); c.defaire(); };
  },
};

// Au chargement : la structure du thème posé par le script de tête. Ce fichier est chargé
// en `defer` AVANT js/app.js : le DOM est complet, le graphique pas encore dessiné.
appliquerStructure(structureDuTheme(document.documentElement.getAttribute('data-theme')));
