// ============ THÈMES ============
// Le registre, ce sont les <link data-theme-id> d'index.html : une seule source de vérité,
// relue telle quelle par tests/test_contrat.py. Le thème courant est l'attribut data-theme
// de <html>, posé AVANT le premier rendu par le petit script en tête de page.
const THEME_CLE = 'samsara-theme';
const THEMES = Array.from(document.querySelectorAll('link[data-theme-id]')).map(l => ({
  id: l.getAttribute('data-theme-id'),
  nom: l.getAttribute('data-nom') || l.getAttribute('data-theme-id'),
  mode: l.getAttribute('data-mode') || 'clair',
  verre: l.getAttribute('data-verre') || 'aucun',
  paire: l.getAttribute('data-paire') || null,
  structure: l.getAttribute('data-structure') || null     // js/structures.js
}));
function themeCourant() {
  const id = document.documentElement.getAttribute('data-theme');
  return THEMES.find(t => t.id === id) || THEMES[0] || { id: 'aero', nom: 'Aero', mode: 'clair', verre: 'aucun', paire: null };
}
let dark = themeCourant().mode === 'sombre';
function appliquerTheme(id) {
  if (!THEMES.some(t => t.id === id)) return;
  document.documentElement.setAttribute('data-theme', id);
  try { localStorage.setItem(THEME_CLE, id); } catch (e) {}
  dark = themeCourant().mode === 'sombre';
  // La STRUCTURE d'abord (elle déplace le graphique et redimensionne le canvas), puis tout ce
  // qui porte une couleur par thème hors du CSS : relu une fois, ici, pas à chaque image.
  appliquerStructure(themeCourant().structure);
  lireJetons(); peindrePastilles(); verreDuTheme(); remplirMenuThemes();
  drawChart();
  redessinerApresPolices();
}
// Le canvas dessine son texte avec la police du thème (--font) : si elle n'est pas encore
// chargée, il a pris la police de repli. On redessine une fois les polices prêtes.
function redessinerApresPolices() {
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { lireJetons(); drawChart(); }).catch(() => {});
}
function themeSuivant() {
  const i = THEMES.findIndex(t => t.id === themeCourant().id);
  appliquerTheme(THEMES[(i + 1) % THEMES.length].id);
}
// D : le jumeau de l'autre mode (Aero ↔ Aero nuit) ; un thème sans jumeau passe au suivant.
function themeJumeau() { const p = themeCourant().paire; if (p) appliquerTheme(p); else themeSuivant(); }
function remplirMenuThemes() {
  const m = document.getElementById('themeMenu');
  if (!m) return;
  const cur = themeCourant().id;
  // L'aperçu porte data-theme=<id> : il reçoit les VRAIS jetons du thème, pas une copie.
  m.innerHTML = '<div class="cat-title">Thème · T suivant · D clair / sombre</div>' + THEMES.map(t =>
    '<button class="theme-item" role="menuitemradio" aria-checked="' + (t.id === cur) + '" onclick="appliquerTheme(\'' + t.id + '\')">'
    + '<span class="theme-apercu" data-theme="' + t.id + '"><i></i><i></i><i></i><i></i></span>'
    + '<span class="theme-nom">' + escHtml(t.nom) + (t.structure && STRUCTURES[t.structure] ? ' <small class="theme-structure">· ' + escHtml(STRUCTURES[t.structure].nom.toLowerCase()) + '</small>' : '') + '</span>'
    + '<span class="theme-mode">' + (t.mode === 'sombre' ? 'sombre' : 'clair') + '</span></button>').join('');
}
function ouvrirThemes(e) {
  if (e) e.stopPropagation();
  const m = document.getElementById('themeMenu'), b = document.getElementById('themeBtn');
  document.getElementById('indMenu').classList.remove('open');
  document.getElementById('paireMenu').classList.remove('open');
  if (m.classList.contains('open')) { m.classList.remove('open'); return; }
  remplirMenuThemes();
  m.classList.add('open');
  placerMenu(m, b, false);
}
// Un menu s'ouvre SOUS son bouton, ou AU-DESSUS quand la place manque en dessous (bouton dans
// une barre basse : Néon met le ruban sous le graphique, et son menu « Indicateurs » sortait de
// l'écran — 87 px visibles sur 540). S'il ne tient d'aucun côté, il prend le plus grand et y
// défile, sans recouvrir son bouton ; tout est borné à 8 px des bords. `gauche` : aligné sur le
// bord gauche du bouton, sinon sur son bord droit. `ecart` : distance au bouton (8 px).
function placerMenu(menu, ancre, gauche, ecart) {
  const M = 8, e = ecart === undefined ? 8 : ecart, H = window.innerHeight, L = window.innerWidth;
  const r = ancre.getBoundingClientRect();
  menu.style.maxHeight = ''; menu.style.overflowY = '';
  let h = menu.offsetHeight, top;
  const dessous = H - M - (r.bottom + e), dessus = r.top - e - M;
  const borner = max => { menu.style.maxHeight = Math.max(0, max) + 'px'; menu.style.overflowY = 'auto'; h = menu.offsetHeight; };
  if (h <= dessous) top = r.bottom + e;
  else if (h <= dessus) top = r.top - e - h;
  else if (Math.max(dessous, dessus) >= 120) {
    if (dessous >= dessus) { borner(dessous); top = r.bottom + e; } else { borner(dessus); top = r.top - e - h; }
  } else { if (h > H - 2 * M) borner(H - 2 * M); top = r.bottom + e; }   // écran minuscule : il recouvre le bouton
  menu.style.top = Math.max(M, Math.min(H - M - h, top)) + 'px';
  const w = menu.offsetWidth;
  menu.style.left = Math.max(M, Math.min(L - w - M, gauche ? r.left : r.right - w)) + 'px';
  menu.style.right = 'auto';
}

// ============ VERRE (selon le thème) ============
// data-verre du thème : aucun · givre (flou CSS, jeton --verre) · refraction (hyalite).
// hyalite (51 Ko, code tiers) n'est chargé QUE si le thème courant le demande, et après le
// premier dessin du graphique : il ne pèse plus sur le chargement des autres thèmes.
// La réfraction coûte ~98 % du budget d'image en rendu logiciel (1695 ms avec, 23 sans) ;
// le nombre de surfaces n'y change presque rien (3 → 1 : −7 %).
const VERRE = { veilles: null, cibles: null, chargement: null, degrade: false };
function chargerHyalite() {
  if (typeof Hyalite !== 'undefined') return Promise.resolve(true);
  if (!VERRE.chargement) VERRE.chargement = new Promise(res => {
    const s = document.createElement('script');
    s.src = 'js/vendor/hyalite.js'; s.async = true;
    s.onload = () => res(typeof Hyalite !== 'undefined');
    s.onerror = () => res(false);
    document.head.appendChild(s);
  });
  return VERRE.chargement;
}
// On retire la RÉFRACTION, pas le verre : detach() rend la main au repli CSS (--verre).
function couperRefraction(motif) {
  if (!VERRE.veilles) return;
  VERRE.veilles.forEach(w => { try { w.stop(); } catch (e) {} });
  VERRE.veilles = null;
  VERRE.cibles.forEach(c => document.querySelectorAll(c[0]).forEach(el => {
    try { Hyalite.detach(el); } catch (e) {}
    el.style.removeProperty('--hyalite'); el.style.removeProperty('--hyalite-edge');
  }));
  if (motif) console.info('Réfraction désactivée : ' + motif);
}
function verreDuTheme() {
  const force = (typeof URLSearchParams !== 'undefined' && location.search)
    ? new URLSearchParams(location.search).get('glass') : null;
  if (themeCourant().verre !== 'refraction' || force === 'off' || VERRE.degrade) {
    couperRefraction(force === 'off' && VERRE.veilles ? 'forcé par ?glass=off' : null);
    return;
  }
  if (VERRE.veilles) return;
  if (force !== 'force') {
    const v = verdictVerre();
    if (v.coupee) { VERRE.degrade = true; console.info('Réfraction non chargée : ' + v.motif + ' (?glass=force pour la forcer).'); return; }
  }
  chargerHyalite().then(ok => {
    if (!ok || !Hyalite.supported() || themeCourant().verre !== 'refraction' || VERRE.veilles) return;
    const LG = { slope: 1.9, dispersion: 1.6, shade: 0.5, rim: 1.8, edge: 0.4 };
    const b = (bevel, thickness, blur) => Object.assign({ bevel, thickness, blur }, LG);
    // ⚠️ `.chart-container .lg-ring` est VOLONTAIREMENT absent : hyalite rastérise la carte de
    // déplacement sur toute la boîte de l'élément, le masque d'anneau ne réduit rien (mesuré :
    // 1820 ms/image avec hyalite sur l'anneau, 281 ms avec le flou CSS sur le même anneau).
    VERRE.cibles = [['.feed-panel', b(34, 60, 16)], ['.strat-section', b(28, 50, 16)]];
    VERRE.veilles = VERRE.cibles.map(c => Hyalite.watch(document.body, c[0], c[1]));
    if (force !== 'force') sonderRefraction();
  });
}
// Rendu LOGICIEL (pas de GPU : SwiftShader, llvmpipe…) : la réfraction y coûte 33 à 197 ms par
// image et la sonde ci-dessous finit par la couper — après le chargement de hyalite (51 Ko), la
// construction de ses cartes (une tâche de 52 ms) et 12 images sondées (~1,5 s de CPU au
// chargement d'Aero, mesuré). On ne la tente donc plus là : le moteur se lit dans le nom du
// rendu WebGL (WEBGL_debug_renderer_info), une seule fois ; ce verdict et celui de la sonde sont
// gardés VERRE_JOURS jours (localStorage) — un poste où la réfraction a été coupée ne recharge
// plus hyalite à chaque visite. ?glass=force passe outre. Le verre CSS (--verre) reste.
const VERRE_CLE = 'samsara-verre-v1', VERRE_JOURS = 30;
const RENDU_LOGICIEL = /swiftshader|llvmpipe|softpipe|software|basic render/i;
function lireVerdictVerre() {
  try { const v = JSON.parse(localStorage.getItem(VERRE_CLE) || 'null'); return v && Date.now() - v.t < VERRE_JOURS * 864e5 ? v : null; }
  catch (e) { return null; }
}
function noterVerdictVerre(v) { try { localStorage.setItem(VERRE_CLE, JSON.stringify(Object.assign({}, v, { t: Date.now() }))); } catch (e) { /* navigation privée */ } }
function moteurGraphique() {
  try {
    const gl = document.createElement('canvas').getContext('webgl');
    if (!gl) return null;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const nom = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    const perte = gl.getExtension('WEBGL_lose_context');
    if (perte) perte.loseContext();               // le contexte ne servait qu'à lire ce nom
    return nom;
  } catch (e) { return null; }
}
function verdictVerre() {
  let v = lireVerdictVerre();
  if (!v || v.moteur === undefined) {
    const m = moteurGraphique();
    v = Object.assign({}, v, { moteur: m, logiciel: m !== null && RENDU_LOGICIEL.test(m) });
    noterVerdictVerre(v);
  }
  if (v.logiciel) return { coupee: true, motif: 'rendu logiciel (' + v.moteur + ')' };
  if (v.sonde === 'coupee') return { coupee: true, motif: 'coupée par la sonde le ' + new Date(v.t).toLocaleDateString('fr-FR') + ' (médiane ' + v.ms + ' ms/image)' };
  return { coupee: false };
}
// Garde-fou : médiane de plusieurs images APRÈS stabilisation (un échantillon unique pris au
// chargement décide au hasard). Au-delà de 22 ms (~45 i/s), la réfraction n'est pas tenable :
// on la coupe — et le poste s'en souvient (verdictVerre) —, le verre CSS reste.
function sonderRefraction() {
  const SEUIL = 22;
  setTimeout(() => {
    const d = []; let last = performance.now(), n = 0;
    (function step(t) {
      const dt = t - last; last = t;
      if (n++) d.push(dt);                          // la 1re image est polluée
      if (dt > SEUIL * 2.5 || d.length >= 12) {
        d.sort((a, c) => a - c);
        const ms = d[Math.floor(d.length / 2)] || dt;
        const v = lireVerdictVerre() || {};
        if (ms > SEUIL) { VERRE.degrade = true; couperRefraction('médiane ' + Math.round(ms) + ' ms/image'); noterVerdictVerre(Object.assign(v, { sonde: 'coupee', ms: Math.round(ms) })); }
        else { console.info('Réfraction conservée : médiane ' + Math.round(ms) + ' ms/image.'); noterVerdictVerre(Object.assign(v, { sonde: 'tenue', ms: Math.round(ms) })); }
      } else requestAnimationFrame(step);
    })(last);
  }, 2500);
}

// ============ SHORTCUTS UX ============
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (e.key === 'f' || e.key === 'F') { toggleFeed(); e.preventDefault(); }
  if (e.key === 'd' || e.key === 'D') { themeJumeau(); e.preventDefault(); }
  if (e.key === 't' || e.key === 'T') { themeSuivant(); e.preventDefault(); }
  if (e.key === 'r' || e.key === 'R') { resetView(); e.preventDefault(); }
  if (e.key === 'm' || e.key === 'M') { basculerMode(); e.preventDefault(); }
  if (e.key === '?') { ouvrirGlossaire(); e.preventDefault(); }
  if (e.key === 'Escape') { document.getElementById('indMenu').classList.remove('open'); document.getElementById('themeMenu').classList.remove('open'); document.getElementById('paireMenu').classList.remove('open'); }
  // Flèches : scroller horizontalement
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    e.preventDefault();
    const visible = viewEnd - viewStart;
    const step = e.shiftKey ? 10 : 1;
    const delta = e.key === 'ArrowRight' ? step : -step;
    const newStart = Math.max(0, Math.min(candles.length - visible, viewStart + delta));
    viewStart = newStart;
    viewEnd = newStart + visible;
    drawChart();
  }
});

// ============ FEED TOGGLE ============
let feedVisible = false;
function toggleFeed() {
  if (window.innerWidth <= 768) {
    openMarketModal(); return;
  }
  feedVisible = !feedVisible;
  const panel = document.getElementById('feedPanel');
  const btn = document.getElementById('feedBtn');
  panel.classList.toggle('collapsed', !feedVisible);
  if (btn) btn.classList.toggle('on', feedVisible);
  // Attendre la fin de la transition CSS (0.3s) avant de redimensionner
  setTimeout(() => { resizeCanvas(); drawChart(); }, 350);
}

function openMarketModal() {
  const modal = document.getElementById('marketModal');
  modal.style.display = 'flex';
  renderFeedTo(document.getElementById('marketModalBody'));
}
function closeMarketModal() {
  document.getElementById('marketModal').style.display = 'none';
}

// ============ RESET VIEW ============
function resetView() {
  viewStart = Math.max(0, candles.length - 50);
  viewEnd = candles.length;
  priceScale = 1.0;
  pricePan = 0;
  drawChart();
}

// ============ POLYFILL ============
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function(x,y,w,h,r) {
    if (typeof r === 'number') r = {tl:r, tr:r, br:r, bl:r};
    this.beginPath(); this.moveTo(x+r.tl, y); this.lineTo(x+w-r.tr, y);
    this.quadraticCurveTo(x+w, y, x+w, y+r.tr); this.lineTo(x+w, y+h-r.br);
    this.quadraticCurveTo(x+w, y+h, x+w-r.br, y+h); this.lineTo(x+r.bl, y+h);
    this.quadraticCurveTo(x, y+h, x, y+h-r.bl); this.lineTo(x, y+r.tl);
    this.quadraticCurveTo(x, y, x+r.tl, y); this.closePath();
  };
}

// ============ DATA ============
const DATA_URL = 'https://raw.githubusercontent.com/lorenzoapro12-jpg/samsara-live/master/market-data.json';
// L'API Binance de la page : les lectures ajoutées (heure du serveur, contre-expertise) en
// construisent leurs URL — aucun hôte réécrit ailleurs.
const API_BINANCE = 'https://api.binance.com/api/v3/';
let marketData = null, livePrice = null, candles = [], chartInterval = '15m';
let activeSymbol = 'BTCUSDT';  // BTCUSDT, ETHUSDT, SOLUSDT, XRPUSDT, TAOUSDT, ou BTCSOL (ratio)

// ─── Réseau : ce que le script de tête a déjà demandé, et quand relire un fichier publié ───
// Le script en tête d'index.html lance les lectures du premier écran (première page de bougies,
// prix, market-data.json) PENDANT le chargement des feuilles et des scripts : lancées d'ici
// (différé), elles attendaient la fin de son exécution — la première page de bougies partait à
// ~112 ms (mesuré). Une réponse préchargée est reprise UNE fois, par l'URL exacte que cette page
// aurait demandée ; une URL qui ne correspond plus est ignorée (tests/test_reseau.js).
function prechargee(url, options) {
  const P = window.__precharge, p = P && P[url];
  if (!p) return null;
  delete P[url];
  return p.catch(() => fetch(url, options));  // préchargement échoué : une requête normale
}
/** Un fichier publié (market-data.json, heatmap.json) est-il à relire ? Pas avant que la
 *  publication suivante soit ATTENDUE — sa date (`updated`) + la cadence du serveur + une marge
 *  (l'envoi, puis le cache du CDN, max-age 300 s) —, ensuite à chaque tour jusqu'à ce qu'elle
 *  arrive ; et au plus tard toutes les relecture_max_min (publication hors cadence, horloge du
 *  poste décalée). Avant : relu chaque minute, quinze fois par publication. */
function lectureDue(majA, derniere, maintenant) {
  const t = maintenant || Date.now();
  if (!majA || !derniere) return true;
  return t >= majA + CADENCES.attendue_min * 60000 + CADENCES.marge_publication_s * 1000
    || t - derniere >= CADENCES.relecture_max_min * 60000;
}
// `updated` est la première clé des deux fichiers publiés : il se lit dans les premiers octets.
const majDuTexte = t => { const m = /^\s*\{\s*"updated"\s*:\s*"([^"]+)"/.exec(t); return m ? m[1] : null; };
/** Le corps d'une réponse, analysé SEULEMENT s'il porte une autre publication que `connu`
 *  (son `updated`). Une revalidation (304) rend quand même le corps entier à la page : on en
 *  lit le début, et s'il n'a pas changé le reste n'est ni décodé ni analysé. → objet, ou null
 *  si c'est la même publication. */
async function lireSiNouveau(r, connu) {
  if (!r.body || !r.body.getReader || typeof TextDecoder === 'undefined') {
    if (typeof r.text !== 'function') { const o = await r.json(); return connu && o && o.updated === connu ? null : o; }
    const t = await r.text();
    return connu && majDuTexte(t) === connu ? null : JSON.parse(t);
  }
  const lecteur = r.body.getReader(), dec = new TextDecoder(), morceaux = [];
  let tete = '', verifie = !connu;
  for (;;) {
    const { value, done } = await lecteur.read();
    if (done) break;
    const t = dec.decode(value, { stream: true });
    morceaux.push(t);
    if (!verifie) {
      tete += t;
      const u = majDuTexte(tete);
      if (u !== null || tete.length > 512) {
        verifie = true;
        if (u === connu) { lecteur.cancel().catch(() => {}); return null; }
      }
    }
  }
  morceaux.push(dec.decode());
  const texte = morceaux.join('');
  if (connu && majDuTexte(texte) === connu) return null;
  return JSON.parse(texte);
}

// ============ VIEWPORT (zoom/pan) ============
let viewStart = 0, viewEnd = 100;  // indices dans candles
let isPanning = false, panStartX = 0, panStartView = 0;

// Échelle verticale (1.0 = auto, drag molette sur colonne prix)
let priceScale = 1.0, pricePan = 0;  // pricePan en % du range
let isPriceDrag = false, priceDragStart = 0, priceScaleStart = 1, pricePanStart = 0;

// ============ RANGE SELECTOR ============
const RS_HEIGHT = 38;
let rsDragging = null;    // 'body', 'left', 'right', ou null
let rsDragStartX = 0;
let rsDragStartView = 0;
let rsDragStartEnd = 0;

// ============ CROSSHAIR ============
let crossX = null, crossY = null;  // coordonnées canvas du curseur
// Mode Débutant : le registre des textes posés sur le tracé ({ items: [{ role, texte, rect }] },
// relu par les tests), refait à chaque dessin ; null en Expert.
let debEtat = null;
/** Le mode Débutant est-il affiché ? (le défaut : seul « expert » le quitte) */
function debutant() { return (typeof modeCourant === 'function' ? modeCourant() : 'debutant') !== 'expert'; }

// ============ INDICATOR STATE ============
const overlays = { ema20: false, ema50: false, ema100: false, ema200: false, sma20: false, sma50: false, bb: false, vwap: false, ichimoku: false, sar: false, sr: false, fib: false, vp: false, liq: false, guide: guideMemorise(), scenarios: scenariosMemorise() };
// Le Guide (niveaux nommés, régime, formes, suite, lecture) est affiché par défaut ; le choix de
// le masquer est gardé d'une visite à l'autre (navigation privée : affiché).
function guideMemorise() { try { return localStorage.getItem('samsara-guide-v1') !== '0'; } catch (e) { return true; } }
function guideNoter(on) { try { localStorage.setItem('samsara-guide-v1', on ? '1' : '0'); } catch (e) { /* navigation privée */ } }
// Les scénarios du matin (previsions.json) : affichés par défaut, indépendants du Guide ; le choix
// de les masquer est gardé de la même façon (clé samsara-scenarios-v1).
function scenariosMemorise() { try { return localStorage.getItem('samsara-scenarios-v1') !== '0'; } catch (e) { return true; } }
function scenariosNoter(on) { try { localStorage.setItem('samsara-scenarios-v1', on ? '1' : '0'); } catch (e) { /* navigation privée */ } }
const activeSubs = { vol: true, rsi: false, macd: false, stoch: false, atr: false, obv: false, mfi: false, williamsR: false, cci: false, adx: false, ao: false, equity: false };
const subHeights = { vol: 110, rsi: 120, macd: 120, stoch: 120, atr: 110, obv: 110, mfi: 120, williamsR: 120, cci: 120, adx: 120, ao: 110, equity: 140 };

// ============ PARAMÈTRES DES INDICATEURS : une seule source ============
// Le calcul, le libellé (menu, titre de sous-graphe) et la légende (js/fiches.js) lisent CES
// valeurs. Écrits en dur à trois endroits, ils avaient divergé : le menu annonçait
// « Stochastique (14,3,3) » — la version LENTE, %K lissé — quand le calcul est la version
// rapide (%K brut sur 14, %D = moyenne de 3). tests/test_fiches.js échoue si un libellé ou un
// appel de calcul réécrit un de ces nombres à la main.
const PARAM = {
  rsi: { periode: 14 },
  macd: { rapide: 12, lente: 26, signal: 9 },
  stoch: { k: 14, d: 3 },
  atr: { periode: 14 },
  mfi: { periode: 14 },
  williamsR: { periode: 14 },
  cci: { periode: 20 },
  adx: { periode: 14 },
  ao: { rapide: 5, lente: 34 },
  bb: { periode: 20, ecarts: 2 },
  ichimoku: { tenkan: 9, kijun: 26, senkouB: 52 },   // le nuage est reporté de `kijun` bougies
  sar: { pas: 0.02, max: 0.2 },
  fib: { niveaux: [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1] },
  // Profil de volume : tranches d'environ `dollarsParTranche` $ de l'échelle de la vue, bornées ; zone de valeur.
  vp: { dollarsParTranche: 100, tranchesMin: 24, tranchesMax: 72, zoneValeur: 0.7 },
  // VWAP : remis à zéro chaque jour à 00:00 UTC en intraday ; au-delà, toutes les N bougies.
  vwap: { ancrageIntradayS: 86400, ancrageBougies: 20 },
  // Supports / résistances de la page : pivots, regroupés, pondérés par récence × log-volume.
  sr: { bougies: 500, atrPeriode: 14, tolMin: 0.002, tolMax: 0.01, tolAtr: 0.6, niveauxTf: 5, niveauxRef: 4, fusionTf: 0.005,
        pivot: { '1m': 5, '5m': 5, '15m': 4, '30m': 4, '1h': 4, '4h': 3, '1d': 2, '1w': 2 },
        demiVie: { '1m': 240, '5m': 120, '15m': 60, '30m': 40, '1h': 40, '4h': 20, '1d': 10, '1w': 5 } },
  // Guide (js/guide.js) : chaque nombre de ses libellés, de ses règles et de ses fiches est ICI.
  guide: {
    // Niveaux nommés : au plus `niveauxParCote` au-dessus et au-dessous du prix, à moins de
    // `distanceMax` (fraction du prix) ; deux niveaux à moins de `fusion` = une seule bande.
    niveauxParCote: 2, distanceMax: 0.06, fusion: 0.003, touchesMin: 2,
    atrPeriode: 14, bandeAtr: 0.15,          // demi-hauteur de la bande : 0,15 × ATR
    proche: 0.005,                            // « proche » : à moins de 0,5 % du prix live
    // Règle de cassure (règle de travail, pas une mesure) : 2 clôtures successives au-delà de
    // la bande, relues sur les `regardCassure` dernières bougies closes ; une mèche au-delà sur
    // les `mecheBougies` dernières = « percé en mèche ».
    regardCassure: 10, mecheBougies: 3,
    // Régime (convention) : ADX ≥ 25 tendance, ≤ 20 sans tendance ; compression = largeur de
    // Bollinger au plus à son 20e centile des 100 dernières bougies.
    adxTendance: 25, adxSans: 20, bbPercentile: 20, bbFenetre: 100, emaCourte: 20, emaLongue: 50,
    // « au plus bas depuis N bougies » n'est dit qu'à partir de N = compressionDepuisMin.
    compressionDepuisMin: 20,
    // Figures : pivots fractals de `pivot` bougies de chaque côté ; tolérance = tolAtr × ATR ;
    // hauteur d'au moins hauteurMinAtr × ATR ; sortie hors de la bande ± bandeAtr × ATR (figée à
    // la naissance de la figure), 2 clôtures ou 1 + retour (au plus retourMax clôtures dans la bande).
    pivot: 3, tolAtr: 0.5, hauteurMinAtr: 1.5,
    ecartMin: 5, ecartMax: 60,                 // doubles et triples : 5 à 60 bougies entre deux sommets
    tripleMax: 100, tripleRegulier: 0.3, tripleCreux: 0.35,   // triples : 100 b. au plus, écarts réguliers, creux marqués
    rangeMin: 20, rangeFenetre: 80, rangeHauteurAtr: 6,
    triConvergence: 0.3,                       // triangles et fanions : largeur réduite d'au moins 30 %
    // Épaule-tête-épaule : durée, proéminence de la tête, épaules semblables, ligne de cou, contexte.
    ete: { min: 12, max: 100, teteAtr: 0.6, teteH: 0.2, epaulesAtr: 1.2, epaulesH: 0.35, couPente: 0.6, symetrie: 2.5, epauleCouMin: 0.4,
           tendanceH: 0.25, jambeMin: 2 },
    // Figures à deux droites (triangles, biseaux, canaux) : fenêtre, ajustement, plat, étalement.
    lignes: { fenetre: 100, min: 20, tolAtr: 0.6, platAtr: 0.8, platW0: 0.12, etalement: 0.5, avancementMax: 0.85,
              biseauConvergence: 0.25, paralleleMax: 0.25, penteCanalAtr: 2, canalLargeurMaxAtr: 8, canalMin: 20 },
    // Drapeau et fanion : mât (≥ matAtr ATR en matMin à matMax bougies), pause courte et étroite.
    drapeau: { matAtr: 5, matMin: 2, matMax: 12, pauseMin: 5, pauseMax: 30, retrait: 0.5, largeur: 0.5, pente: 0.2, paralleleMax: 0.4 },
    retourMax: 3, ebaucheDroiteMin: 1,
    expiration: 60, horizon: 60, garderFini: 20, garderInvalide: 6, garderEbauche: 3, formesMax: 2, echantillonFaible: 20,
    // Repère « sans forme » du bilan : au plus `temoinDeparts` départs rejoués en tout.
    temoinDeparts: 30000,
    // Marge de « futur » à droite de la dernière bougie (chemins conditionnels) : une fraction
    // de la largeur du tracé, bornée en pixels, jamais plus de `futurMaxFraction` du tracé.
    // Seulement quand le Guide est affiché ; elle se referme d'un pas de bougie par bougie
    // quittée à droite (un glissement ne fait pas sauter la largeur des bougies).
    futur: 0.18, futurMinPx: 56, futurMaxPx: 250, futurMaxFraction: 0.4,
    // Mode Débutant : au plus `items` textes sur le tracé (phrase, repère du haut, repère du bas,
    // scénario 1, forme, ligne des scénarios), chacun sur une ligne d'au plus N caractères ;
    // « étroit » : un tracé de moins de `etroit` px (téléphone).
    debutant: { items: 5, etroit: 520, phrase: 90, phraseEtroit: 48, niveau: 26, niveauEtroit: 18,
                scenario: 32, forme: 26, boite: 48, boiteEtroit: 40,
                ecartAtr: 0.5,          // deux repères à l'écran : au moins 0,5 × ATR l'un de l'autre
                marge: 0.07 },          // échelle : 7 % de l'amplitude au-dessus et au-dessous (place des libellés)
  },
  // Scénarios du matin (js/scenarios.js) : les nombres de leur dessin et de leurs mots.
  scenarios: {
    point: '07h00',               // le nom du point du matin (heure de Paris de la routine)
    echantillonFaible: 20,        // « échantillon faible » sous 20 matins notés (bilan de l'ordre)
    // L'encadré : en haut à droite du tracé, au plus `boiteMax` px de large et `boiteFraction` du
    // tracé (téléphone : `boiteFractionEtroit`) ; jamais au-delà de la moitié haute du tracé.
    boiteMax: 440, boiteFraction: 0.46, boiteFractionEtroit: 0.94,
    // Échelle de prix : la vue s'élargit pour montrer la 1re zone et l'invalidation du rang 1
    // (et les bornes d'un range de rang 1), d'au plus `echelleMax` fois l'amplitude des bougies
    // visibles de chaque côté ; seulement quand la vue montre des bougies depuis le point, et sur
    // un tracé d'au moins `echelleLargeurMin` px (téléphone : l'échelle reste celle des bougies,
    // un niveau hors de la vue est nommé au bord avec sa flèche).
    echelleMax: 0.6, echelleLargeurMin: 520,
    // Tracé « étroit » (téléphone) sous `etroit` px : libellés plus larges, encadré plus large.
    etroit: 520,
    // Suivi en direct : seulement sur des bougies d'au plus `suiviPasMax` s (1 h). Une bougie de
    // 4 h ou d'un jour couvre une trop grande part de la fenêtre (≈ 24 h) pour dire un ordre.
    suiviPasMax: 3600,
    // Couleurs des rangs : prises parmi les jetons du thème, à au moins `ecartCouleur` (distance
    // RVB) de la hausse, de la baisse, de la couleur du Guide et du fond — une couleur de rang ne
    // doit jamais se lire comme une direction.
    ecartCouleur: 90,
    // La journée (js/scenarios.js, section 5) : aucune nouvelle prévision ; les scénarios du matin
    // recalculés en continu. Le nom du scénario au plus petit écart ne change qu'à la clôture d'un
    // quart d'heure (`quartMs`), avec `ecartChangement` d'avance au moins (1,65 changement par jour en
    // moyenne, médiane 1, 9e décile 4 : 398 matins synthétiques, règles v1, rejoués sur les bougies
    // BTCUSDT 15 min du 06/09/2025 au 08/10/2026 — modèle) ; « trop tôt pour départager » pendant
    // `departageMinutes` tant que le prix reste à moins de `departageMouvementPct` % du prix du
    // point ; aucun nom quand le plus petit écart est ≥ `colle` (chacun plus près de sa limite que de
    // sa zone) ; « au-delà de tous les niveaux » à `horsMarges` marge(s) au-delà de la zone la plus
    // extrême ; un scénario fermé s'efface en `fonduMinutes` après le créneau du contact.
    jour: { ecartChangement: 0.12, departageMinutes: 60, departageMouvementPct: 0.5, horsMarges: 1, fonduMinutes: 60, colle: 0.5, quartMs: 900000 },
  },
};
const periodeDe = cle => +String(cle).replace(/\D/g, '');     // 'ema20' -> 20
const ETIQ = {
  rsi: () => 'RSI (' + PARAM.rsi.periode + ')',
  macd: () => 'MACD (' + PARAM.macd.rapide + ',' + PARAM.macd.lente + ',' + PARAM.macd.signal + ')',
  stoch: () => 'Stochastique rapide (' + PARAM.stoch.k + ',' + PARAM.stoch.d + ')',
  atr: () => 'ATR (' + PARAM.atr.periode + ')',
  mfi: () => 'MFI — Money Flow Index (' + PARAM.mfi.periode + ')',
  williamsR: () => 'Williams %R (' + PARAM.williamsR.periode + ')',
  cci: () => 'CCI (' + PARAM.cci.periode + ')',
  adx: () => 'ADX/DMI (' + PARAM.adx.periode + ')',
  bb: () => 'Bollinger (' + PARAM.bb.periode + ', ' + PARAM.bb.ecarts + ' σ)',
  ao: () => 'Awesome Oscillator (' + PARAM.ao.rapide + ',' + PARAM.ao.lente + ')',
};

// Registre de tous les indicateurs pour la dropdown
const INDICATORS = [
  // Le Guide d'abord : la seule couche affichée par défaut, son interrupteur reste visible
  // sans faire défiler le menu.
  { cat: 'Guide', items: [
    { key: 'guide', label: 'Guide : niveaux nommés, régime, formes, suite', tag: 'gd' },
    { key: 'scenarios', label: 'Scénarios du matin de Claude, une IA (' + PARAM.scenarios.point + ' Paris, BTC)', tag: 'gd' },
  ]},
  { cat: 'Overlays', items: [
    ...['ema20', 'ema50', 'ema100', 'ema200', 'sma20', 'sma50'].map(k => ({ key: k, label: k.slice(0, 3).toUpperCase() + ' ' + periodeDe(k), tag: 'ov' })),
    { key: 'bb', label: ETIQ.bb(), tag: 'ov' },
    { key: 'vwap', label: 'VWAP', tag: 'ov' },
    { key: 'ichimoku', label: 'Ichimoku Cloud', tag: 'ov' },
    { key: 'sar', label: 'Parabolic SAR', tag: 'ov' },
  ]},
  { cat: 'Sous-graphes', items: [
    { key: 'vol', label: 'Volume', tag: 'sg' },
    { key: 'rsi', label: ETIQ.rsi(), tag: 'sg' },
    { key: 'macd', label: ETIQ.macd(), tag: 'sg' },
    { key: 'stoch', label: ETIQ.stoch(), tag: 'sg' },
    { key: 'atr', label: ETIQ.atr(), tag: 'sg' },
    { key: 'obv', label: 'OBV — On-Balance Volume', tag: 'sg' },
    { key: 'mfi', label: ETIQ.mfi(), tag: 'sg' },
    { key: 'williamsR', label: ETIQ.williamsR(), tag: 'sg' },
    { key: 'cci', label: ETIQ.cci(), tag: 'sg' },
    { key: 'adx', label: ETIQ.adx(), tag: 'sg' },
    { key: 'ao', label: ETIQ.ao(), tag: 'sg' },
  ]},
  { cat: 'Chartiste', items: [
    { key: 'sr', label: 'Supports/Résistances', tag: 'ch' },
    { key: 'fib', label: 'Fibonacci Retracement', tag: 'ch' },
    { key: 'vp', label: 'Volume Profile', tag: 'ch' },
    { key: 'liq', label: 'Liquidité (Depth)', tag: 'ch' }
  ]},
];

function isOverlay(key) { return key in overlays; }
function isActive(key) { return (overlays[key] || activeSubs[key]) || false; }
function toggleAny(key) {
  if (isOverlay(key)) {
    overlays[key] = !overlays[key];
    if (key === 'liq') toggleDepth(overlays.liq);
    if (key === 'guide') guideNoter(overlays.guide);
    if (key === 'scenarios') { scenariosNoter(overlays.scenarios); if (overlays.scenarios) fetchPrevisions(); }
    // S/R : dessiner tout de suite, puis redessiner quand les TF de reference sont arrives.
    if (key === 'sr' && overlays.sr) { drawChart(); refreshRefSR().then(drawChart); }
    else drawChart();
  }
  else { activeSubs[key] = !activeSubs[key]; resizeCanvas(); drawChart(); }
  buildDropdown();
  compterIndicateurs();
  const lbl = document.getElementById('lbl_' + key);
  if (lbl) lbl.classList.toggle('active', isActive(key));
}

// Indicateur du menu -> sa fiche de lecture (js/fiches.js) : TOUS en ont une (tests/test_fiches.js).
const FICHE_IND = { ema20: 'ema', ema50: 'ema', ema100: 'ema', ema200: 'ema', sma20: 'ema', sma50: 'ema', bb: 'bb', vwap: 'vwap',
  ichimoku: 'ichimoku', sar: 'sar', vol: 'volume', rsi: 'rsi', macd: 'macd', stoch: 'stoch', atr: 'atr', obv: 'obv', mfi: 'mfi',
  williamsR: 'williamsR', cci: 'cci', adx: 'adx', ao: 'ao', sr: 'sr', fib: 'fib', vp: 'vp', liq: 'liq', guide: 'guide', scenarios: 'scenarios' };
// Débutant : le menu « Affichage » n'a que les deux couches du Guide, en mots simples ; les outils
// d'analyse sont en Expert (une ligne y mène).
const LIBELLES_DEBUTANT = { guide: 'Repères et phrase de lecture', scenarios: 'Scénarios du matin de Claude, une IA (' + PARAM.scenarios.point + ' Paris, BTC)' };
// Les catégories en mots : où l'indicateur se dessine. La clé `cat` reste le nom court (tests).
const TITRES_CAT = { Guide: 'Guide', Overlays: 'Sur les bougies', 'Sous-graphes': 'Sous le graphique', Chartiste: 'Niveaux et zones' };
// L'aperçu du menu : l'indicateur survolé, touché ou au clavier, et le filtre de l'Expert. Gardés
// d'une reconstruction à l'autre (cocher une case reconstruit le menu).
let menuApercu = null, menuFiltre = '';
const sansAccents = t => String(t).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
/** Le contenu de l'aperçu : ce que c'est, comment s'en servir, la fiche complète. */
function apercuHtml(key) {
  const id = key && FICHE_IND[key], f = id && typeof FICHES !== 'undefined' ? FICHES[id] : null;
  if (!f) return '<p class="ind-apercu-vide">' + (debutant() ? 'Survolez ou touchez une ligne : ce qu’elle montre et comment s’en servir.'
    : 'Survolez ou touchez un indicateur : ce que c’est et comment s’en servir. Le « i » ouvre sa fiche complète.') + '</p>';
  const deb = debutant();
  const titre = deb && f.titreDeb ? f.titreDeb : f.titre;
  const quoi = deb && f.simpleDeb ? f.simpleDeb : f.simple;
  const u = f.usage, usage = !u ? '' : typeof u === 'string' ? u : (deb ? u.deb : u.exp);
  return '<p class="ind-apercu-titre">' + echapF(titre) + '</p>'
    + '<p><b>C’est quoi ?</b> ' + echapF(quoi) + '</p>'
    + (usage ? '<p><b>Comment s’en servir ?</b> ' + echapF(usage) + '</p>' : '')
    + '<button type="button" class="lien" onclick="event.stopPropagation();ouvrirFiche(\'' + id + '\',this)">Fiche complète ▸</button>';
}
function montrerApercu(key) {
  if (key === menuApercu) return;
  menuApercu = key;
  const a = document.getElementById('indApercu');
  if (a) a.innerHTML = apercuHtml(key);
}
/** Le filtre de l'Expert : sur le libellé, le titre de la fiche et sa catégorie, sans accents. */
function filtrerMenu(t) {
  menuFiltre = t;
  const q = sansAccents(t.trim());
  const menu = document.getElementById('indMenu');
  for (const l of menu.querySelectorAll('label[data-ind]')) l.hidden = !!q && !sansAccents(l.dataset.cherche).includes(q);
  for (const c of menu.querySelectorAll('.cat-title[data-cat]')) c.hidden = !menu.querySelector('label[data-cat="' + c.dataset.cat + '"]:not([hidden])');
  const vide = menu.querySelector('.ind-aucun');
  if (vide) vide.hidden = !!menu.querySelector('label[data-ind]:not([hidden])');
}
function ligneMenu(item, libelle, cat, tag) {
  const checked = isActive(item.key) ? ' checked' : '';
  const fiche = FICHE_IND[item.key], f = fiche && typeof FICHES !== 'undefined' ? FICHES[fiche] : null;
  const cherche = libelle + ' ' + (f ? f.titre : '') + ' ' + (TITRES_CAT[cat] || cat);
  return `<label data-ind="${item.key}" data-cat="${cat}" data-cherche="${echapF(cherche)}"><input type="checkbox"${checked} onchange="toggleAny('${item.key}')">${libelle}${fiche ? infoBtn(fiche) : ''}${tag ? `<span class="tag tag-${item.tag}" title="${echapF(TITRES_CAT[cat] || cat)}">${item.tag.toUpperCase()}</span>` : ''}</label>`;
}
function buildDropdown() {
  const menu = document.getElementById('indMenu');
  const defile = menu.scrollTop;
  let html = '<div class="ind-liste">';
  if (debutant()) {
    for (const item of INDICATORS[0].items) html += ligneMenu(item, LIBELLES_DEBUTANT[item.key] || item.label, INDICATORS[0].cat, false);
    html += '<button type="button" class="lien menu-expert" onclick="event.stopPropagation();basculerMode()">Autres outils d’analyse : passer en Expert ▸</button>';
  } else {
    html += '<div class="ind-filtre"><input type="search" id="indFiltre" placeholder="Chercher un indicateur…" aria-label="Chercher un indicateur" autocomplete="off" oninput="filtrerMenu(this.value)"></div>';
    for (const cat of INDICATORS) {
      html += `<div class="cat-title" data-cat="${cat.cat}">${TITRES_CAT[cat.cat] || cat.cat}</div>`;
      for (const item of cat.items) html += ligneMenu(item, item.label, cat.cat, true);
    }
    html += '<p class="ind-aucun" hidden>Aucun indicateur ne correspond.</p>';
  }
  html += '</div><div class="ind-apercu" id="indApercu" aria-live="polite">' + apercuHtml(menuApercu) + '</div>';
  menu.innerHTML = html;
  // Survol, toucher et clavier montrent l'explication dans l'aperçu (sans rien cocher de plus).
  for (const l of menu.querySelectorAll('label[data-ind]')) {
    const k = l.dataset.ind;
    l.addEventListener('mouseenter', () => montrerApercu(k));
    l.addEventListener('pointerdown', () => montrerApercu(k));
    l.addEventListener('focusin', () => montrerApercu(k));
  }
  const filtre = document.getElementById('indFiltre');
  if (filtre && menuFiltre) { filtre.value = menuFiltre; filtrerMenu(menuFiltre); }
  menu.scrollTop = defile;
}
/** Les raccourcis de la barre (Expert) : au survol, ce que c'est et comment s'en servir. */
function titresBarre() {
  if (typeof FICHES === 'undefined') return;
  for (const l of document.querySelectorAll('#indicatorBar label[id^="lbl_"]')) {
    const f = FICHES[FICHE_IND[l.id.slice(4)]];
    if (!f) continue;
    const u = typeof f.usage === 'string' ? f.usage : f.usage ? f.usage.exp : '';
    l.title = f.titre + ' : ' + f.simple + (u ? '\nComment s’en servir : ' + u : '') + '\n(Le menu « + Indicateurs » en a la fiche complète.)';
  }
}
/** Le bouton du menu dit combien d'indicateurs l'Expert a allumés (le Guide compris). */
function compterIndicateurs() {
  const c = document.getElementById('indCompte');
  if (!c) return;
  const n = INDICATORS.reduce((s, cat) => s + cat.items.filter(i => isActive(i.key)).length, 0);
  c.textContent = n ? String(n) : '';
  c.hidden = !n;
}

/** Après un changement de mode (appliquerMode, js/fiches.js) : ce qui ne vaut plus est fermé, la
 *  page est remise en page (l'en-tête, la barre d'outils et le Grid Bot changent de hauteur) et
 *  redessinée. Mêmes valeurs : aucun calcul n'est refait, seuls les mots et ce qui est montré
 *  changent. */
function apresChangementMode(m) {
  crossX = crossY = null;
  const menu = document.getElementById('indMenu');
  if (menu && menu.classList.contains('open')) buildDropdown();
  if (m !== 'expert' && typeof closeLiveModal === 'function') closeLiveModal();
  guideHautMemo = null; scenFlechesMemo = null; debHautMemo = null;
  // Le nom accessible du graphique est la phrase du Débutant : l'Expert ne l'a pas.
  if (m === 'expert') { try { canvas.removeAttribute('aria-label'); } catch (e) { /* hors navigateur */ } }
  if (isNum(livePrice)) ecrirePrixEntete(livePrice, isNum(var24Courant) ? var24Courant : NaN);
  astuceMontrer();
  requestAnimationFrame(() => {
    resizeCanvas();
    if (candles.length) drawChart();
    if (typeof ajusterKpis === 'function') ajusterKpis();
    if (typeof ajusterRuban === 'function') ajusterRuban();
  });
}
// L'astuce du Débutant, une seule fois (clé samsara-astuce-tap-v1) : « Touchez une étiquette pour le
// détail » (écran tactile) ou « Survolez… » (souris). Cachée au premier toucher du graphique ou au
// bout de 8 s. Un élément HTML, pas un texte du graphique ; posée là où elle ne couvre aucune
// étiquette.
const ASTUCE_CLE = 'samsara-astuce-tap-v1';
let astuceFin = null, astuceVueIci = false;   // vue dans cette page (le stockage peut être bloqué)
function astuceVue() { if (astuceVueIci) return true; try { return localStorage.getItem(ASTUCE_CLE) === '1'; } catch (e) { return false; } }
function astuceMontrer() {
  const a = document.getElementById('astuceTap');
  if (!a) return;
  if (!debutant() || astuceVue()) { a.hidden = true; return; }
  if (!a.hidden) return;
  const tactile = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  a.textContent = (tactile ? 'Touchez' : 'Survolez') + ' une étiquette pour le détail';
  a.hidden = false;
  astucePlacer();
  clearTimeout(astuceFin);
  astuceFin = setTimeout(astuceCacher, 8000);
}
/** En bas du tracé, à gauche ; plus haut si une étiquette du Débutant y est déjà. */
function astucePlacer() {
  const a = document.getElementById('astuceTap');
  if (!a || a.hidden || !geoPrix) return;
  const h = a.offsetHeight || 24, w = a.offsetWidth || 240, x = 20;
  const items = debEtat ? debEtat.items.concat(debEtat.evite || []).filter(i => i.rect) : [];
  let y = geoPrix.top + geoPrix.ph - h - 8;
  for (let k = 0; k < 12 && items.some(i => x < i.rect.x + i.rect.w && x + w > i.rect.x && y < i.rect.y + i.rect.h && y + h > i.rect.y); k++) y -= h + 6;
  // Coordonnées du tracé → celles du conteneur (le canvas est dans sa marge).
  a.style.left = (canvas.offsetLeft + x) + 'px'; a.style.top = (canvas.offsetTop + Math.max(geoPrix.top, y)) + 'px'; a.style.bottom = 'auto';
}
function astuceCacher() {
  const a = document.getElementById('astuceTap');
  clearTimeout(astuceFin); astuceFin = null;
  if (!a || a.hidden) return;
  a.hidden = true;
  astuceVueIci = true;
  try { localStorage.setItem(ASTUCE_CLE, '1'); } catch (e) { /* navigation privée */ }
}

function toggleDropdown(e) {
  e.stopPropagation();
  document.getElementById('themeMenu').classList.remove('open');
  document.getElementById('paireMenu').classList.remove('open');
  const menu = document.getElementById('indMenu');
  const btn = document.getElementById('indDropdownBtn');
  
  if (menu.classList.contains('open')) {
    menu.classList.remove('open');
    return;
  }
  
  // Rempli PUIS ouvert PUIS placé : sa hauteur décide s'il s'ouvre au-dessus du bouton.
  buildDropdown();
  menu.classList.add('open');
  placerMenu(menu, btn, true, 4);
}
document.addEventListener('click', (e) => {
  for (const id of ['indMenu', 'themeMenu', 'paireMenu']) {
    const menu = document.getElementById(id);
    if (menu && !menu.contains(e.target)) menu.classList.remove('open');
  }
});
// Fermer les menus si la fenêtre est redimensionnée
// (sauf le menu des indicateurs pendant qu'on tape dans son filtre : le clavier d'un téléphone
// redimensionne la fenêtre).
window.addEventListener('resize', () => {
  for (const id of ['indMenu', 'themeMenu', 'paireMenu']) {
    const m = document.getElementById(id);
    if (id === 'indMenu' && m.contains(document.activeElement) && document.activeElement.id === 'indFiltre') continue;
    m.classList.remove('open');
  }
});

function toggleInd(key, label) {
  overlays[key] = !overlays[key];
  if (key === 'liq') toggleDepth(overlays.liq);
  label.classList.toggle('active', overlays[key]);
  compterIndicateurs();
  if (key === 'sr' && overlays.sr) { drawChart(); refreshRefSR().then(drawChart); }
  else drawChart();
}
function toggleSub(key, label) {
  activeSubs[key] = !activeSubs[key];
  label.classList.toggle('active', activeSubs[key]);
  compterIndicateurs();
  resizeCanvas(); drawChart();
}

async function changeInterval(interval, label) {
  document.querySelectorAll('#indicatorBar label[id^="int_"]').forEach(l => l.classList.remove('active'));
  label.classList.add('active');
  chartInterval = interval;
  priceScale = 1.0; pricePan = 0;
  await afficherSerie();
  // Les scénarios du matin, s'ils n'ont pas été relus depuis une cadence (BTCUSDT seulement).
  if (activeSymbol === 'BTCUSDT' && (!previsions || Horloges.maintenant() - previsions.luA > CADENCES.previsions_lue)) fetchPrevisions();
}

const NOMS_PAIRES = { BTCUSDT: 'BTC/USDT', SOLUSDT: 'SOL/USDT', XRPUSDT: 'XRP/USDT', TAOUSDT: 'TAO/USDT', BTCSOL: 'BTC/SOL' };
function ouvrirPaires(e) {
  if (e) e.stopPropagation();
  const m = document.getElementById('paireMenu'), b = document.getElementById('paireBtn');
  for (const id of ['indMenu', 'themeMenu']) document.getElementById(id).classList.remove('open');
  if (m.classList.contains('open')) { m.classList.remove('open'); return; }
  m.classList.add('open');
  placerMenu(m, b, true);
}
async function changeSymbol(symbol, label) {
  document.querySelectorAll('label[id^="sym_"]').forEach(l => l.classList.remove('active'));
  label.classList.add('active');
  activeSymbol = symbol;
  const tp = document.getElementById('taskbarPair');
  if (tp) tp.textContent = symbol;
  const pn = document.getElementById('paireNom');
  if (pn) pn.textContent = NOMS_PAIRES[symbol] || symbol;
  document.getElementById('paireMenu').classList.remove('open');
  // Le dernier prix d'une AUTRE paire ne doit ni colorer la flèche ni allumer l'éclair.
  livePrice = null; fetchPrice();
  priceScale = 1.0; pricePan = 0;
  // Les cartes du Débutant nomment le bitcoin sur une autre paire : elles suivent la paire.
  if (marketData) {
    renderFeed();
    const mm = document.getElementById('marketModal');
    if (mm && mm.style.display === 'flex') renderFeedTo(document.getElementById('marketModalBody'));
  }
  await afficherSerie();
  // Retour sur BTCUSDT : les scénarios du matin, s'ils n'ont pas été relus depuis une cadence.
  if (symbol === 'BTCUSDT' && (!previsions || Horloges.maintenant() - previsions.luA > CADENCES.previsions_lue)) fetchPrevisions();
}

// Changer d'intervalle ou de paire. Avant : le cache était EFFACÉ puis trois pages de 1000
// bougies rechargées l'une après l'autre, le graphique attendant aussi les niveaux S/R des autres TF
// (≈ 850 ms à chaque clic, mesuré). Maintenant : un historique déjà vu s'affiche aussitôt depuis
// le cache, puis sa queue se met à jour ; un historique neuf s'affiche dès sa première page.
async function afficherSerie() {
  const cle = getKlineCacheKey(activeSymbol, chartInterval);
  const c = klineCache[cle];
  if (c && c.data.length) {
    candles = c.data; c.ts = Date.now();
    viewStart = Math.max(0, candles.length - 50); viewEnd = candles.length;
  } else {
    candles = []; viewStart = 0; viewEnd = 50;   // jamais les bougies d'un autre intervalle sous ce titre
  }
  memoCache.clear();
  drawChart();
  await fetchKlines();
  if (cle !== getKlineCacheKey(activeSymbol, chartInterval)) return;   // un autre clic est passé
  if (!c || !c.data.length) { viewStart = Math.max(0, candles.length - 50); viewEnd = candles.length; }
  drawChart();
  refreshRefSR().then(() => { if (cle === getKlineCacheKey(activeSymbol, chartInterval)) drawChart(); });
}

// ============ CANVAS ============
const canvas = document.getElementById('chart');
const ctx = canvas.getContext('2d');
// Le calque posé sur le graphique (voir dessinerCalque) : même taille, transparent au pointeur.
const calque = document.getElementById('chartCalque');
const cx = calque && calque.getContext ? calque.getContext('2d') : null;
let hasSubChart = true; // volume or indicator

// --- Une frame = un dessin ---
// Toute mutation de vue (pan, molette, drags, doigt) change l'état puis demande le dessin
// par ici : sans ce filtre un trackpad émet 100+ événements/s et drawChart partait 2× par
// déplacement (handler `window` du pan + handler `canvas` du crosshair). Le coût n'est pas
// le tracé (2-6 ms) mais le repaint du verre derrière le canvas — d'où un dessin par frame.
// Pendant un geste (glisser, molette, doigt), le verre de la page est suspendu (html.geste,
// css/app.css) : sans cela chaque image du graphique recalculait le flou des surfaces —
// 167 ms par image mesurées avec le verre, 33 sans, en rendu logiciel. Un thème sans verre
// n'a rien à suspendre.
let gesteFin = null;
function geste(actif) {
  if (themeCourant().verre === 'aucun') return;
  const h = document.documentElement;
  clearTimeout(gesteFin);
  if (actif) { if (!h.classList.contains('geste')) h.classList.add('geste'); }
  else gesteFin = setTimeout(() => h.classList.remove('geste'), 200);
}
// Survol sur un thème à verre : l'anneau de verre du graphique (.lg-ring) suspend son flou le
// temps du survol (html.survol, retirée SURVOL_MS après le dernier mouvement), comme geste() le
// fait pendant un glissement. Chaque image du réticule faisait recomposer le flou de l'anneau :
// 82 à 86 ms de CPU par image de survol sur Aero, 30 sans (mesuré, rendu logiciel). Une seule
// minuterie, réarmée tant que la souris bouge (pas un setTimeout par mouvement).
const SURVOL_MS = 250;
let survolDernier = 0, survolMinuterie = null;
function survol() {
  if (themeCourant().verre === 'aucun') return;
  survolDernier = performance.now();
  if (survolMinuterie) return;
  const h = document.documentElement;
  h.classList.add('survol');
  const verifier = () => {
    const reste = survolDernier + SURVOL_MS - performance.now();
    if (reste > 0) survolMinuterie = setTimeout(verifier, reste);
    else { survolMinuterie = null; h.classList.remove('survol'); }
  };
  survolMinuterie = setTimeout(verifier, SURVOL_MS);
}
let rafPending = false;
function scheduleDraw() {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => { rafPending = false; drawChart(); });
}
canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  crossX = e.clientX - rect.left;
  crossY = e.clientY - rect.top;
  
  // Curseur Range Selector
  if (crossY > rect.height - RS_HEIGHT && !isPanning && !isPriceDrag && !rsDragging) {
    const padL = 16, padR = 75;
    const rsw = rect.width - padL - padR;
    const vs = Math.max(0, viewStart), ve = Math.min(candles.length, viewEnd);
    const toRSX = (i) => padL + (i / Math.max(1, candles.length - 1)) * rsw;
    const vrX = toRSX(vs), vrX2 = toRSX(Math.min(ve - 1, candles.length - 1));
    const vrW = Math.max(12, vrX2 - vrX);
    if (crossX >= vrX - 4 && crossX <= vrX + 6) {
      canvas.style.cursor = 'ew-resize';
    } else if (crossX >= vrX + vrW - 6 && crossX <= vrX + vrW + 4) {
      canvas.style.cursor = 'ew-resize';
    } else if (crossX >= vrX && crossX <= vrX + vrW) {
      canvas.style.cursor = 'grab';
    } else {
      canvas.style.cursor = 'default';
    }
  } else if (crossX > rect.width - 75 && !isPanning && !isPriceDrag) {
    canvas.style.cursor = 'ns-resize';
  } else if (!isPanning && !isPriceDrag) {
    // Débutant : une étiquette se désigne (main) ; un test de cible, sans redessiner le graphique.
    canvas.style.cursor = debutant() && geo && guideCibleSous(crossX, crossY, geo.mainH, true) ? 'pointer' : 'crosshair';
  }
  // Le réticule est sur le calque : le graphique lui-même n'est pas redessiné au survol.
  survol();
  scheduleCalque();
});
canvas.addEventListener('mouseleave', () => { crossX = null; crossY = null; dessinerCalque(); });

// --- Zoom molette ---
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  geste(true); geste(false);       // une rafale de molette = un geste
  const rect = canvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;
  const W = rect.width;
  
  // Si souris sur colonne de prix (droite) → zoom vertical
  if (mouseX > W - 75) {
    const factor = e.deltaY > 0 ? 1.15 : 0.85;
    priceScale = Math.max(0.3, Math.min(5, priceScale * factor));
    pricePan *= factor; // garder le point central
    scheduleDraw();
    return;
  }
  
  const visible = viewEnd - viewStart;
  const factor = e.deltaY > 0 ? 1.3 : 0.7;
  const center = viewStart + visible / 2;
  const newVisible = Math.max(8, Math.min(candles.length, Math.round(visible * factor)));
  viewStart = Math.max(0, Math.round(center - newVisible / 2));
  viewEnd = Math.min(candles.length, viewStart + newVisible);
  if (viewEnd - viewStart < 10) { viewEnd = Math.min(candles.length, viewStart + 10); }
  scheduleDraw();
}, { passive: false });

// --- Pan cliquer-glisser ---
canvas.addEventListener('mousedown', (e) => {
  geste(true);
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  const padL = 16, padR = 75;
  const rsw = rect.width - padL - padR;
  
  // Range Selector ?
  if (my > rect.height - RS_HEIGHT && candles.length > 5 && rsw > 20) {
    const toRSX = (i) => padL + (i / Math.max(1, candles.length - 1)) * rsw;
    const vs = Math.max(0, viewStart), ve = Math.min(candles.length, viewEnd);
    const vrX = toRSX(vs), vrX2 = toRSX(Math.min(ve - 1, candles.length - 1));
    const vrW = Math.max(12, vrX2 - vrX);
    
    if (mx >= vrX - 4 && mx <= vrX + 6) {
      rsDragging = 'left';
    } else if (mx >= vrX + vrW - 6 && mx <= vrX + vrW + 4) {
      rsDragging = 'right';
    } else if (mx >= vrX && mx <= vrX + vrW) {
      rsDragging = 'body';
      rsDragStartX = mx;
      rsDragStartView = viewStart;
      rsDragStartEnd = viewEnd;
    } else if (mx >= padL && mx <= rect.width - padR) {
      // Click en dehors → centrer le viewport sur le clic
      const frac = (mx - padL) / rsw;
      const target = Math.round(frac * candles.length);
      const visible = viewEnd - viewStart;
      viewStart = Math.max(0, Math.min(candles.length - visible, target - Math.round(visible / 2)));
      viewEnd = viewStart + visible;
      drawChart();
    }
    if (rsDragging) {
      rsDragStartX = mx;
      rsDragStartView = viewStart;
      rsDragStartEnd = viewEnd;
      e.preventDefault();
    }
    return;
  }
  
  if (mx > rect.width - 75) {
    // Drag colonne prix → pan vertical
    isPriceDrag = true;
    priceDragStart = e.clientY;
    priceScaleStart = priceScale;
    pricePanStart = pricePan;
    canvas.style.cursor = 'ns-resize';
  } else {
    isPanning = true;
    panStartX = e.clientX;
    panStartView = viewStart;
    canvas.style.cursor = 'grabbing';
  }
});
window.addEventListener('mousemove', (e) => {
  // Range Selector dragging
  if (rsDragging) {
    const rect = canvas.getBoundingClientRect();
    const padL = 16, padR = 75;
    const rsw = rect.width - padL - padR;
    const mx = e.clientX - rect.left;
    const frac = Math.max(0, Math.min(1, (mx - padL) / rsw));
    const visible = rsDragStartEnd - rsDragStartView;
    
    if (rsDragging === 'body') {
      const dxPx = mx - rsDragStartX;
      const dxCandles = Math.round((dxPx / rsw) * candles.length);
      viewStart = Math.max(0, Math.min(candles.length - visible, rsDragStartView + dxCandles));
      viewEnd = viewStart + visible;
    } else if (rsDragging === 'left') {
      const targetStart = Math.round(frac * candles.length);
      viewStart = Math.max(0, Math.min(rsDragStartEnd - 3, targetStart));
      viewEnd = rsDragStartEnd;
    } else if (rsDragging === 'right') {
      const targetEnd = Math.round(frac * candles.length);
      viewEnd = Math.min(candles.length, Math.max(rsDragStartView + 3, targetEnd));
      viewStart = rsDragStartView;
    }
    scheduleDraw();
    return;
  }
  
  if (isPriceDrag) {
    const dy = e.clientY - priceDragStart;
    const rect = canvas.getBoundingClientRect();
    pricePan = pricePanStart - (dy / rect.height) * 2 * priceScaleStart;
    scheduleDraw();
    return;
  }
  if (!isPanning) return;
  const rect = canvas.getBoundingClientRect();
  const dx = (e.clientX - panStartX) / rect.width;
  const visible = viewEnd - viewStart;
  const shift = Math.round(-dx * visible);
  viewStart = Math.max(0, Math.min(candles.length - visible, panStartView + shift));
  viewEnd = viewStart + visible;
  scheduleDraw();
});
window.addEventListener('mouseup', () => { 
  geste(false);
  rsDragging = null;
  isPanning = false; isPriceDrag = false; 
  canvas.style.cursor = ''; 
});

// --- Double-click reset zoom ---
canvas.addEventListener('dblclick', () => {
  viewStart = Math.max(0, candles.length - 50);
  viewEnd = candles.length;
  priceScale = 1.0;
  pricePan = 0;
  drawChart();
});

// Tap = réticule, infobulle OHLCV et explication du Guide ; un 2e tap au même endroit les retire.
function tapGraphique(clientX, clientY) {
  astuceCacher();
  const rect = canvas.getBoundingClientRect();
  const tx = clientX - rect.left;
  const ty = clientY - rect.top;
  // Colonne de prix → ignorer
  if (tx > rect.width - 55) return;
  // Si déjà un crosshair affiché au même endroit → le retirer
  if (crossX !== null && Math.abs(crossX - tx) < 8 && Math.abs(crossY - ty) < 8) {
    crossX = null; crossY = null;
  } else {
    crossX = tx; crossY = ty;
  }
  dessinerCalque();
}
canvas.addEventListener('click', (e) => tapGraphique(e.clientX, e.clientY));

// ============ TOUCH (Mobile) ============
let touchMode = null; // 'pan', 'price', 'pinch'
let touchStartX = 0, touchStartY = 0;
// Un tap (doigt posé puis levé sans bouger, vite) : touchstart empêche le clic de compatibilité,
// le tap est donc reconnu ici (distance et durée bornées) et passé à tapGraphique.
const TAP_MAX_PX = 8, TAP_MAX_MS = 300;
let tapDebut = null;
let touchStartView = 0, touchStartPriceScale = 1, touchStartPricePan = 0;
let pinchStartDist = 0, pinchStartVisible = 0;

function getTouchDist(t1, t2) {
  const dx = t1.clientX - t2.clientX;
  const dy = t1.clientY - t2.clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

canvas.addEventListener('touchstart', (e) => {
  geste(true);
  tapDebut = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY, t: performance.now(), bouge: false } : null;
  if (e.touches.length === 1) {
    const rect = canvas.getBoundingClientRect();
    const tx = e.touches[0].clientX - rect.left;
    if (tx > rect.width - 55) {
      touchMode = 'price';
      touchStartY = e.touches[0].clientY;
      touchStartPriceScale = priceScale;
      touchStartPricePan = pricePan;
    } else {
      touchMode = 'pan';
      touchStartX = e.touches[0].clientX;
      touchStartView = viewStart;
    }
    e.preventDefault();
  } else if (e.touches.length === 2) {
    touchMode = 'pinch';
    pinchStartDist = getTouchDist(e.touches[0], e.touches[1]);
    pinchStartVisible = viewEnd - viewStart;
    e.preventDefault();
  }
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
  if (tapDebut && e.touches[0] && Math.hypot(e.touches[0].clientX - tapDebut.x, e.touches[0].clientY - tapDebut.y) > TAP_MAX_PX) tapDebut.bouge = true;
  if (touchMode === 'pan') {
    const rect = canvas.getBoundingClientRect();
    const dx = (e.touches[0].clientX - touchStartX) / rect.width;
    const visible = viewEnd - viewStart;
    const shift = Math.round(-dx * visible);
    viewStart = Math.max(0, Math.min(candles.length - visible, touchStartView + shift));
    viewEnd = viewStart + visible;
    scheduleDraw();
    e.preventDefault();
  } else if (touchMode === 'price') {
    const dy = e.touches[0].clientY - touchStartY;
    const rect = canvas.getBoundingClientRect();
    pricePan = touchStartPricePan - (dy / rect.height) * 2 * touchStartPriceScale;
    scheduleDraw();
    e.preventDefault();
  } else if (touchMode === 'pinch') {
    const dist = getTouchDist(e.touches[0], e.touches[1]);
    if (pinchStartDist > 0 && dist > 8) {
      // Ratio absolu : écarter 2× les doigts = zoom 2×
      const ratio = pinchStartDist / dist;
      const newVisible = Math.max(5, Math.min(candles.length, pinchStartVisible * ratio));
      // Centre dynamique au milieu des deux doigts — ancré à la position des doigts
      const rect = canvas.getBoundingClientRect();
      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
      const chartW = rect.width - 40;
      const centerFrac = Math.max(0, Math.min(1, (midX - 12) / Math.max(1, chartW)));
      const centerIdx = viewStart + (viewEnd - viewStart) * centerFrac;
      // Ancrer au point de pincement (pas au milieu)
      viewStart = Math.max(0, Math.round(centerIdx - newVisible * centerFrac));
      viewEnd = Math.min(candles.length, viewStart + Math.round(newVisible));
      if (viewEnd - viewStart < 5) { viewEnd = Math.min(candles.length, viewStart + 5); }
      scheduleDraw();
    }
    e.preventDefault();
  }
}, { passive: false });

canvas.addEventListener('touchend', (e) => {
  geste(false);
  const t = e.changedTouches && e.changedTouches[0];
  if (tapDebut && t && !tapDebut.bouge && e.touches.length === 0 && performance.now() - tapDebut.t <= TAP_MAX_MS
    && Math.hypot(t.clientX - tapDebut.x, t.clientY - tapDebut.y) <= TAP_MAX_PX) tapGraphique(t.clientX, t.clientY);
  tapDebut = null;
  touchMode = null; pinchStartDist = 0; pinchStartVisible = 0;
  canvas.style.cursor = '';
});

function isMobile() { return window.innerWidth <= 768; }
function resizeCanvas() {
  const container = canvas.parentElement;
  // ⚠️ clientWidth/clientHeight INCLUENT le padding du conteneur (8 px de
  // chaque côté) : le canvas était donc dimensionné 16 px trop grand, sa
  // boîte débordait celle du conteneur et `overflow:hidden` rognait le bord
  // droit et le bas — libellés de prix tronqués et pastille de prix coupée
  // (« $77036.96( »), à toutes les largeurs.
  const cs = getComputedStyle(container);
  const innerW = container.clientWidth
    - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const innerH = container.clientHeight
    - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  if (innerH < 100) return;
  canvas.width = innerW * window.devicePixelRatio;
  canvas.height = innerH * window.devicePixelRatio;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  canvas.style.width = innerW + 'px';
  canvas.style.height = innerH + 'px';
  // Le calque épouse le graphique : même taille, posé à l'origine de la boîte de contenu.
  if (cx) {
    calque.width = canvas.width; calque.height = canvas.height;
    cx.setTransform(1, 0, 0, 1, 0, 0);
    cx.scale(window.devicePixelRatio, window.devicePixelRatio);
    calque.style.width = innerW + 'px'; calque.style.height = innerH + 'px';
    calque.style.left = cs.paddingLeft; calque.style.top = cs.paddingTop;
  }
}
let resizeRaf = 0;
window.addEventListener('resize', () => {
  if (resizeRaf) return;
  resizeRaf = requestAnimationFrame(() => { resizeRaf = 0; resizeCanvas(); drawChart(); ajusterKpis(); ajusterRuban(); });
});

// ============ API ============
// Cache klines pour éviter les 429 Binance
const klineCache = {};
function getKlineCacheKey(symbol, interval) { return `${symbol}_${interval}`; }

const toCandle = k => ({
  time: k[0] / 1000, open: parseFloat(k[1]), high: parseFloat(k[2]),
  low: parseFloat(k[3]), close: parseFloat(k[4]), volume: parseFloat(k[5])
});
// Ratio BTC/SOL aligné sur les timestamps communs.
function ratioCandles(btcData, solData) {
  const solMap = new Map(solData.map(k => [k[0], k]));
  const merged = [];
  for (const bk of btcData) {
    const sk = solMap.get(bk[0]);
    if (sk) {
      // OHLC du ratio : high/low = enveloppe du CORPS (open->close). On n'invente pas de meches :
      // la vraie extremite intra-bougie du ratio depend de la correlation des deux jambes, non
      // observable depuis deux OHLC (ne PAS « ameliorer » en btcHigh/solLow -> meches fictives).
      // Les 4 champs valaient le meme ratio -> bougies sans corps ni meche, ATR/Stoch/SAR faux.
      const op = parseFloat(bk[1]) / parseFloat(sk[1]);
      const cl = parseFloat(bk[4]) / parseFloat(sk[4]);
      merged.push({
        time: bk[0] / 1000, open: op, high: Math.max(op, cl), low: Math.min(op, cl),
        close: cl, volume: parseFloat(bk[5])
      });
    }
  }
  return merged;
}
// Fusionne les dernières bougies dans l'historique : remplace celles qui existent (la bougie
// en cours, et la précédente qui vient de clore), ajoute les nouvelles. Renvoie false s'il
// manque des bougies entre l'historique et la queue reçue (onglet longtemps en veille) :
// l'appelant recharge alors tout, plutôt que de dessiner un trou.
function mergeTail(arr, tail) {
  if (!arr.length || !tail.length) return false;
  if (tail[0].time > arr[arr.length - 1].time) return false;
  for (const c of tail) {
    let j = arr.length - 1;
    while (j >= 0 && arr[j].time > c.time) j--;
    if (j >= 0 && arr[j].time === c.time) arr[j] = c;
    else if (j === arr.length - 1) arr.push(c);
  }
  return true;
}
// La queue reçue est-elle déjà dans l'historique, à l'identique (mêmes heures, mêmes prix, même
// volume) ? Alors ni le mémo des indicateurs ni le graphique n'ont à changer : rien n'a bougé.
function queueConnue(arr, tail) {
  for (const c of tail) {
    let j = arr.length - 1;
    while (j >= 0 && arr[j].time > c.time) j--;
    const a = arr[j];
    if (!a || a.time !== c.time || a.open !== c.open || a.high !== c.high || a.low !== c.low || a.close !== c.close || a.volume !== c.volume) return false;
  }
  return tail.length > 0;
}
// RAFRAÎCHISSEMENT INCRÉMENTAL. L'historique n'est chargé qu'une fois par symbole/intervalle ;
// ensuite, toutes les 5 s, on ne demande que les 2 dernières bougies (≈ 300 octets).
//
// CHARGEMENT EN DEUX TEMPS. La page la plus récente (1000 bougies) est dessinée dès qu'elle
// arrive ; les deux pages plus anciennes partent ensuite EN PARALLÈLE et se raccrochent à
// gauche sans bouger la vue. Avant : trois requêtes l'une après l'autre avant le moindre dessin.
// Renvoie true si les bougies affichées ont changé (l'appelant redessine), false sinon.
async function fetchKlines() {
  const cacheKey = getKlineCacheKey(activeSymbol, chartInterval);
  const sym = activeSymbol, itv = chartInterval;
  const encore = () => cacheKey === getKlineCacheKey(activeSymbol, chartInterval);
  try {
    const cached = klineCache[cacheKey];
    // Sauvegarder l'état du viewport pour l'auto-scroll intelligent
    const prevLen = candles.length;
    const wasAtRightEdge = prevLen > 0 && viewEnd >= prevLen - 1;
    const visibleRange = viewEnd - viewStart;
    const suivre = () => {
      // Auto-scroll : si l'utilisateur était calé à droite, suivre les nouvelles bougies
      if (wasAtRightEdge && candles.length > prevLen) {
        viewEnd = candles.length;
        viewStart = Math.max(0, viewEnd - visibleRange);
      }
    };

    if (cached && cached.data.length) {
      const tail = sym === 'BTCSOL'
        ? ratioCandles(...await Promise.all([fetchKlinesRaw('BTCUSDT', 2), fetchKlinesRaw('SOLUSDT', 2)]))
        : (await fetchKlinesRaw(sym, 2)).map(toCandle);
      if (!encore()) return false;      // symbole/intervalle changé pendant l'attente
      cached.ts = Date.now();
      // Rien n'a bougé depuis la dernière lecture : le mémo des indicateurs reste juste (sa clé
      // porte la dernière clôture et le dernier volume), et il n'y a rien à redessiner.
      if (queueConnue(cached.data, tail)) return false;
      if (mergeTail(cached.data, tail)) {
        candles = cached.data;
        memoCache.clear();              // la bougie en cours a changé : indicateurs à refaire
        suivre();
        if (cached.partiel) historiquePlusTard(cacheKey, sym, itv);
        return true;
      }
    }

    const fresh = await premierePage(sym, itv);
    if (!encore()) return false;
    // Rechargement (première visite, ou queue qui ne se raccorde plus : onglet longtemps en
    // veille). Si l'historique en cache chevauche la page fraîche, on le GARDE jusqu'à elle :
    // les indices de la vue restent valables. Sinon on repart de la page fraîche, vue à droite.
    // ⚠️ Remplacer 3000 bougies par 1000 sans recaler la vue laissait viewStart/viewEnd au-delà
    // de la fin (graphique vide, « −1950/3000 » ; trouvé au rejeu le 06/10/2026).
    const ancien = klineCache[cacheKey];
    let data = fresh, partiel = fresh.length >= 990;
    if (ancien && ancien.data.length && fresh.length && ancien.data[ancien.data.length - 1].time >= fresh[0].time) {
      let k = ancien.data.length;
      while (k > 0 && ancien.data[k - 1].time >= fresh[0].time) k--;
      data = ancien.data.slice(0, k).concat(fresh);
      partiel = ancien.partiel;
    }
    candles = data;
    if (wasAtRightEdge || data === fresh) {
      viewEnd = candles.length;
      viewStart = Math.max(0, viewEnd - Math.max(10, visibleRange || 50));
    } else {
      viewEnd = Math.min(viewEnd, candles.length);
      viewStart = Math.max(0, Math.min(viewStart, viewEnd - 10));
    }
    memoCache.clear();
    // `partiel` : il reste de l'historique à aller chercher (une page pleine en appelle d'autres).
    klineCache[cacheKey] = { data: candles, ts: Date.now(), symbol: sym, interval: itv, partiel };
    limiterCacheBougies(cacheKey);
    historiquePlusTard(cacheKey, sym, itv);
    // NE PAS réinitialiser viewStart/viewEnd — respecter le zoom/pan utilisateur
    return true;
  } catch(e) { Horloges.noter('bougies', e); console.error('Klines:', e); return false; }
}

const KLINE_MS = { '1m': 6e4, '5m': 3e5, '15m': 9e5, '30m': 18e5, '1h': 36e5, '4h': 144e5, '1d': 864e5, '1w': 6048e5 };
const PAGES_HISTORIQUE = 3;   // 3 × 1000 bougies, comme avant
// La page la plus RÉCENTE se demande sans endTime (les 1000 dernières bougies, comme avec
// endTime = maintenant) : son URL est fixe, c'est celle que le script de tête d'index.html a
// déjà lancée pour la paire et l'intervalle par défaut (prechargee).
const urlPremierePage = (symbol, interval) => `https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=1000`;
// Une page Binance : jusqu'à 1000 bougies dont l'ouverture est ≤ endTime (la dernière sans endTime).
async function pageKlines(symbol, interval, endTime) {
  const url = endTime ? urlPremierePage(symbol, interval) + `&endTime=${endTime}` : urlPremierePage(symbol, interval);
  const resp = Horloges.verifier(await (prechargee(url) || fetch(url)));
  const d = await resp.json();
  Horloges.noter('bougies');
  return Array.isArray(d) ? d : [];
}
// La page la plus récente d'un historique. Une même page demandée deux fois (survol puis clic)
// ne part qu'une fois : la promesse en vol est partagée.
const pagesEnVol = new Map();
function premierePage(sym, itv) {
  const cle = sym + '_' + itv;
  if (pagesEnVol.has(cle)) return pagesEnVol.get(cle);
  const p = (sym === 'BTCSOL'
    ? Promise.all([pageKlines('BTCUSDT', itv), pageKlines('SOLUSDT', itv)]).then(([b, s]) => ratioCandles(b, s))
    : pageKlines(sym, itv).then(d => d.map(toCandle)))
    .finally(() => pagesEnVol.delete(cle));
  pagesEnVol.set(cle, p);
  return p;
}
// Les deux pages plus anciennes ne servent pas au premier écran (50 bougies affichées sur les
// 1000 de la première) : elles partent quand la page est au calme (requestIdleCallback, 3 s au
// plus), ou dès que la vue approche du début de l'historique (dézoom, glissement, sélecteur de
// plage — drawChart). Avant : en même temps que tout le reste du chargement (110 Ko).
const HISTORIQUE_BORD = 100;  // bougies : la vue commence à moins de ça du début -> on complète
const historiqueAttendu = new Set();
function historiquePlusTard(cacheKey, sym, itv) {
  const c = klineCache[cacheKey];
  if (!c || !c.partiel || historiqueAttendu.has(cacheKey)) return;
  historiqueAttendu.add(cacheKey);
  const go = () => { historiqueAttendu.delete(cacheKey); completerHistorique(cacheKey, sym, itv); };
  if (typeof requestIdleCallback === 'function') requestIdleCallback(go, { timeout: 3000 }); else setTimeout(go, 1500);
}
// Bougies gardées en mémoire : au plus BOUGIES_GARDEES historiques (≈ 0,3 Mo chacun pour 3000
// bougies) ; au-delà, le moins récemment lu part — jamais celui qu'on affiche. Sans borne, tous
// les couples paire × intervalle visités restaient (jusqu'à ~9 Mo).
const BOUGIES_GARDEES = 6;
function limiterCacheBougies(garder) {
  const cles = Object.keys(klineCache).filter(k => k !== garder && k !== getKlineCacheKey(activeSymbol, chartInterval));
  cles.sort((a, b) => klineCache[a].ts - klineCache[b].ts);
  while (cles.length && Object.keys(klineCache).length > BOUGIES_GARDEES) delete klineCache[cles.shift()];
}
// Les pages plus anciennes, en parallèle (leurs bornes se calculent : 1000 × la durée d'une
// bougie). Elles se raccrochent à gauche de l'historique ; la vue est décalée d'autant, l'œil ne
// voit rien bouger.
const historiqueEnCours = new Set();
async function completerHistorique(cacheKey, sym, itv) {
  const c = klineCache[cacheKey];
  if (!c || !c.partiel || !c.data.length || !KLINE_MS[itv] || historiqueEnCours.has(cacheKey)) return;
  historiqueEnCours.add(cacheKey);
  try {
    const t0 = c.data[0].time * 1000;
    const fins = [];
    for (let k = 0; k < PAGES_HISTORIQUE - 1; k++) fins.push(t0 - 1 - k * 1000 * KLINE_MS[itv]);
    const jambes = sym === 'BTCSOL' ? ['BTCUSDT', 'SOLUSDT'] : [sym];
    const pages = await Promise.all(jambes.map(j => Promise.all(fins.map(f => pageKlines(j, itv, f)))));
    const brut = pages.map(pj => pj.slice().reverse().flat());          // ordre chronologique
    let anciennes = sym === 'BTCSOL' ? ratioCandles(brut[0], brut[1]) : brut[0].map(toCandle);
    const cur = klineCache[cacheKey];                                    // relu : la queue a pu avancer
    if (!cur || !cur.data.length) return;
    const premier = cur.data[0].time, vu = new Set();
    anciennes = anciennes.filter(x => x.time < premier && !vu.has(x.time) && vu.add(x.time)).sort((a, b) => a.time - b.time);
    cur.partiel = false;
    if (!anciennes.length) return;
    cur.data = anciennes.concat(cur.data);
    if (cacheKey === getKlineCacheKey(activeSymbol, chartInterval)) {
      candles = cur.data;
      viewStart += anciennes.length; viewEnd += anciennes.length;
      memoCache.clear();
      scheduleDraw();
    }
  } catch (e) { console.error('Historique:', e); }
  finally { historiqueEnCours.delete(cacheKey); }
}
// Préchargement au survol d'un intervalle ou d'une paire : la première page part pendant que
// le pointeur s'approche ; au clic, l'historique est déjà là (ou en vol, et la requête est partagée).
function precharger(sym, itv) {
  const cle = getKlineCacheKey(sym, itv);
  if (klineCache[cle]) return;
  premierePage(sym, itv).then(d => {
    if (!klineCache[cle] && d.length) { klineCache[cle] = { data: d, ts: Date.now(), symbol: sym, interval: itv, partiel: d.length >= 990 }; limiterCacheBougies(cle); }
  }).catch(() => {});
}

// ============ MEMOIZATION INDICATEURS ============
const memoCache = new Map();
function memoKey(fnName, h) { return `${fnName}_${h}`; }
function candlesHash() {
  // Hash incluant close/volume de la dernière bougie pour détecter les mises à jour live
  if (!candles.length) return 0;
  const last = candles[candles.length - 1];
  return `${candles.length}_${candles[0].time}_${last.time}_${last.close}_${last.volume}`;
}
function memoized(fnName, fn, ...args) {
  const key = memoKey(fnName, candlesHash());
  if (memoCache.has(key)) return memoCache.get(key);
  const result = fn(...args);
  memoCache.set(key, result);
  return result;
}
// Colonnes de l'historique, construites UNE fois par état des données (le mémo est vidé à chaque
// mise à jour). Elles étaient refaites plusieurs fois PAR IMAGE — 3000 éléments à chaque
// fois, par overlay et par sous-graphe : autant d'allocations à ramasser pendant un glissement.
function cols() {
  return memoized('cols', () => ({
    close: candles.map(c => c.close), high: candles.map(c => c.high), low: candles.map(c => c.low),
    vol: candles.map(c => c.volume), time: candles.map(c => c.time)
  }));
}

// La queue d'un historique (les `last` dernières bougies) : le rafraîchissement des 5 s.
async function fetchKlinesRaw(symbol, last) {
  const resp = Horloges.verifier(await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${chartInterval}&limit=${last}`));
  const d = await resp.json();
  Horloges.noter('bougies');
  return d;
}

// ============ MULTI-TF S/R ENGINE ============
const SR_CACHE = {}; // key: 'SYMBOL_INTERVAL' → { levels, candles, ts }
const SR_REFETCH_MS = CADENCES.niveaux_sr;   // js/cadences.js

function getRefIntervals(interval) {
  if (['1m','5m','15m','30m'].includes(interval)) return ['1h','4h'];
  if (interval === '1h') return ['4h','1d'];
  if (interval === '4h') return ['1d','1w'];
  if (interval === '1d') return ['1w'];
  return [];
}

function getSRLookback(interval) { return PARAM.sr.pivot[interval] || 2; }

function findPivots(candles, lookback) {
  const highs = [], lows = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    let isPh = true, isPl = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) continue;
      if (candles[j].high >= candles[i].high) isPh = false;
      if (candles[j].low <= candles[i].low) isPl = false;
    }
    // Stocke volume + timestamp pour pondération ultérieure
    if (isPh) highs.push({ price: candles[i].high, idx: i, volume: candles[i].volume, time: candles[i].time });
    if (isPl) lows.push({ price: candles[i].low,   idx: i, volume: candles[i].volume, time: candles[i].time });
  }
  return { highs, lows };
}

function clusterSR(pivots, tolerance) {
  // Prix = moyenne pondérée par log-volume. Score = somme des poids individuels.
  const levels = [], used = new Set();
  const sorted = [...pivots].sort((a, b) => b.price - a.price);
  for (const p of sorted) {
    if (used.has(p.idx)) continue;
    const pw = p.weight || 1;
    let sumPriceW = pw * p.price, sumW = pw, count = 1;
    for (const p2 of sorted) {
      if (p2.idx === p.idx || used.has(p2.idx)) continue;
      if (Math.abs(p2.price - p.price) / p.price < tolerance) {
        const w2 = p2.weight || 1;
        sumPriceW += w2 * p2.price; sumW += w2; count++;
        used.add(p2.idx);
      }
    }
    // count >= 1 : ne PAS jeter les pivots isoles (un niveau touche une fois est reel, c'est le tri par score qui ecarte le bruit).
    if (count >= 1) levels.push({ price: sumPriceW / sumW, touches: count, score: sumW });
    used.add(p.idx);
  }
  return levels.sort((a, b) => b.score - a.score);
}

function computeSR(candles, interval, maxCandles) {
  const subset = candles.slice(-maxCandles);
  if (subset.length < 20) return [];
  const lookback = getSRLookback(interval);
  const lastIdx = subset.length - 1;
  
  // Tolérance dynamique basée sur ATR / prix
  const closes = subset.map(c => c.close), highs = subset.map(c => c.high), lows = subset.map(c => c.low);
  const atrArr = calcATR(highs, lows, closes, PARAM.sr.atrPeriode);
  const lastATR = atrArr[atrArr.length - 1] || 0;
  const lastPrice = closes[lastIdx] || 1;
  const tolerance = Math.max(PARAM.sr.tolMin, Math.min(PARAM.sr.tolMax, (lastATR / lastPrice) * PARAM.sr.tolAtr));
  
  // Demi-vie par TF (en nombre de bougies)
  const halfLife = PARAM.sr.demiVie[interval] || 30;
  
  // Pondération par pivot : recency × log-volume
  function weightPivot(p) {
    const ageCandles = lastIdx - p.idx;
    const recency = Math.exp(-ageCandles * Math.LN2 / halfLife);
    const volW = Math.log(1 + p.volume);
    return recency * volW;
  }
  
  const { highs: ph, lows: pl } = findPivots(subset, lookback);
  const scoredHighs = ph.map(p => ({ ...p, weight: weightPivot(p) }));
  const scoredLows  = pl.map(p => ({ ...p, weight: weightPivot(p) }));
  
  // Cluster séparément highs et lows
  const all = [...clusterSR(scoredHighs, tolerance), ...clusterSR(scoredLows, tolerance)];
  all.sort((a, b) => b.score - a.score);
  
  // Dédup highs/lows qui coïncident
  const deduped = [];
  for (const lvl of all) {
    let merged = false;
    for (const d of deduped) {
      if (Math.abs(d.price - lvl.price) / Math.max(d.price, lvl.price) < tolerance * 0.8) {
        d.score += lvl.score; d.touches += lvl.touches; merged = true; break;
      }
    }
    if (!merged) deduped.push({...lvl});
  }
  return deduped.sort((a, b) => b.score - a.score);
}

async function fetchSRKlines(symbol, interval) {
  const cacheKey = `SR_${symbol}_${interval}`;
  const cached = SR_CACHE[cacheKey];
  const now = Date.now();
  if (cached && (now - cached.ts < SR_REFETCH_MS)) return cached;
  try {
    const resp = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${PARAM.sr.bougies}`);
    if (!resp.ok) throw new Error(`Binance ${resp.status}`);
    const raw = await resp.json();
    const data = raw.map(k => ({
      time: k[0]/1000, open: parseFloat(k[1]), high: parseFloat(k[2]),
      low: parseFloat(k[3]), close: parseFloat(k[4]), volume: parseFloat(k[5])
    }));
    const levels = computeSR(data, interval, PARAM.sr.bougies);
    const entry = { candles: data, levels, ts: now };
    SR_CACHE[cacheKey] = entry;
    return entry;
  } catch(e) {
    console.error('SR fetch:', symbol, interval, e.message);
    return cached || { candles: [], levels: [], ts: 0 };
  }
}

function getMultiTFLevels() {
  const all = [];
  // Memoise : getMultiTFLevels tourne a chaque drawChart (crosshair = 60 fps), computeSR est en O(pivots²).
  const currLevels = memoized('sr_' + activeSymbol + '_' + chartInterval, computeSR, candles, chartInterval, PARAM.sr.bougies);
  for (const l of currLevels.slice(0, PARAM.sr.niveauxTf)) {
    all.push({ ...l, tf: chartInterval, tier: 0 });
  }
  // Ref TFs from cache
  const refs = getRefIntervals(chartInterval);
  refs.forEach((refInt, idx) => {
    const cacheKey = `SR_${activeSymbol}_${refInt}`;
    const cached = SR_CACHE[cacheKey];
    if (cached && cached.levels) {
      for (const l of cached.levels.slice(0, PARAM.sr.niveauxRef)) {
        all.push({ ...l, tf: refInt, tier: idx + 1 });
      }
    }
  });
  // Cross-TF dedup 0.5%
  const deduped = [];
  for (const lvl of all) {
    let merged = false;
    for (const d of deduped) {
      if (Math.abs(d.price - lvl.price) / Math.max(d.price, lvl.price) < PARAM.sr.fusionTf) {
        d.score += lvl.score;
        d.touches += lvl.touches;
        // MAX, pas MIN : un niveau present sur le TF courant ET le daily heritait tier 0 -> « Mineur » pointille.
        d.tier = Math.max(d.tier, lvl.tier);
        merged = true; break;
      }
    }
    if (!merged) deduped.push({...lvl});
  }
  return deduped.sort((a, b) => b.score - a.score);
}

async function refreshRefSR() {
  if (!overlays.sr) return;
  // Awaits : en fire-and-forget le 1er rendu n'avait que le TF courant, les majeurs poussaient jusqu'a 60 s apres.
  await Promise.all(getRefIntervals(chartInterval).map(i => fetchSRKlines(activeSymbol, i)));
}

// Décimales selon l'ordre de grandeur du prix. 3 décimales fixes (badge, axe, infobulle)
// affichaient un 0 inventé sur BTC (cotation au centime) et tronquaient XRP (0,0001 $).
function pxDec(v) { const a = Math.abs(v); return a >= 10 ? 2 : a >= 1 ? 4 : 6; }
function fmtPrix(v) { return v.toFixed(pxDec(v)); }

// Prix ET variation 24 h dans la MÊME requête (ticker/24hr) : les deux chiffres du bloc héros
// ont donc toujours le même horodatage — rien à soustraire entre deux cadences. Format MINI :
// 305 octets au lieu de 559 (mesuré le 07/10/2026), même poids d'API, et tous les champs lus ici
// (lastPrice, openPrice) ; la variation se calcule sur l'ouverture de la MÊME réponse — la
// définition de Binance, (dernier − ouverture) / ouverture sur 24 h glissantes —, au lieu de son
// priceChangePercent arrondi à 3 décimales (absent du format MINI).
const urlTicker = s => 'https://api.binance.com/api/v3/ticker/24hr?symbol=' + s + '&type=MINI';
function var24De(d) {
  const o = parseFloat(d.openPrice), l = parseFloat(d.lastPrice);
  return o > 0 ? (l - o) / o * 100 : parseFloat(d.priceChangePercent);   // repli : réponse complète
}
// Éclair bref de la COULEUR du chiffre à chaque changement : une classe posée, retirée
// ECLAIR_MS plus tard — DEUX images par changement. L'éclair précédent animait la couleur
// (el.animate, 450 ms) : ~27 images par changement, soit 70 % du CPU de la page au repos, dans
// tous les thèmes (mesuré : Aero 209 → 58 ms/s sans lui, Kāla 128 → 34).
const ECLAIR_MS = 450;
const MQ_MOUVEMENT = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
let eclairFin = null;
// Le prix et la variation de l'en-tête, écrits selon le mode (mêmes valeurs) : Expert « $83,512.51 »
// et « −0.40 % » ; Débutant « 83 513 $ » et « −0,40 % en 24 h » (le format français, la durée dite).
let var24Courant = null;
/** « −0,40 % » (avecDuree : « −0,40 % en 24 h ») ; '' sans valeur. */
function texteVar24(v, avecDuree) {
  if (!isNum(v)) return '';
  const t = (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(2).replace('.', ',') + ' %';
  return avecDuree ? t + ' en 24 h' : t;
}
function ecrirePrixEntete(price, var24) {
  const el = document.getElementById('price');
  if (el && isNum(price)) {
    const dec = pxDec(price);
    const t = debutant() ? Guide.prix(price, guideUnite()) : '$' + price.toLocaleString('en-US', {minimumFractionDigits: dec, maximumFractionDigits: dec});
    el.textContent = t;   // écrit à chaque lecture, comme avant : l'horloge part dans la même tâche
  }
  const v = document.getElementById('var24');
  if (v) {
    v.textContent = !isFinite(var24) ? '' : debutant() ? texteVar24(var24, true) : (var24 > 0 ? '+' : var24 < 0 ? '−' : '') + Math.abs(var24).toFixed(2) + ' %';
    v.className = 'var24' + (var24 > 0 ? ' pos' : var24 < 0 ? ' neg' : '');
  }
}
async function fetchPrice() {
  const sym = activeSymbol;
  try {
    const t24 = s => (prechargee(urlTicker(s)) || fetch(urlTicker(s))).then(r => Horloges.verifier(r).json());
    let price, var24;
    if (sym === 'BTCSOL') {
      const [b, so] = await Promise.all([t24('BTCUSDT'), t24('SOLUSDT')]);
      price = parseFloat(b.lastPrice) / parseFloat(so.lastPrice);
      // Variation du RATIO : ratio courant sur ratio des ouvertures — pas la différence des
      // deux variations, qui n'en est qu'une approximation.
      const ouv = parseFloat(b.openPrice) / parseFloat(so.openPrice);
      var24 = ouv > 0 ? (price / ouv - 1) * 100 : NaN;
    } else {
      const d = await t24(sym);
      price = parseFloat(d.lastPrice); var24 = var24De(d);
    }
    if (sym !== activeSymbol) return;   // la paire a changé pendant l'attente
    if (!isFinite(price)) throw new SyntaxError('prix illisible');
    Horloges.noter('prix');
    const el = document.getElementById('price');
    const sens = livePrice ? Math.sign(price - livePrice) : 0;
    let cls = 'price-badge' + (sens > 0 ? ' price-up' : sens < 0 ? ' price-down' : '');
    if (sens && !(MQ_MOUVEMENT && MQ_MOUVEMENT.matches)) {
      cls += sens > 0 ? ' eclair-hausse' : ' eclair-baisse';
      clearTimeout(eclairFin);
      eclairFin = setTimeout(() => el.classList.remove('eclair-hausse', 'eclair-baisse'), ECLAIR_MS);
    }
    if (el.className !== cls) el.className = cls;
    var24Courant = isFinite(var24) ? var24 : null;
    ecrirePrixEntete(price, var24);
    const avant = livePrice;
    livePrice = price;
    // L'étiquette de prix du graphique suit le prix à la seconde (calque), dans la même image.
    if (price !== avant) prixSurGraphique();
  } catch(e) { if (sym === activeSymbol) Horloges.noter('prix', e); }
  finally { horloge(); }
}
// L'horloge de la barre des tâches avance dans la MÊME tâche que le prix, donc la même image :
// un rendu par seconde au lieu de deux (5 à 11 ms/s mesurés), et rien quand l'onglet est caché
// (la lecture du prix n'y part pas). Avant : sa propre minuterie, jamais suspendue.
const FMT_HMS = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
let minuteCalque = 0;
function horloge() {
  const c = document.getElementById('taskbarClock'), t = FMT_HMS.format(new Date());
  if (c && c.textContent !== t) c.textContent = t;
  majHorloges();
  // Le calque porte un âge en minutes (couche « Liquidité ») : redessiné à chaque minute
  // même quand le prix, lui, ne bouge pas.
  const m = Math.floor(Date.now() / 60000);
  if (m !== minuteCalque) { minuteCalque = m; if (geo) scheduleCalque(); }
}

// ============ LIQUIDITÉ (HEATMAP HISTORIQUE) ============
let histHeatmap = null, depthTimer = null;
// Rampes de couleur de la chaleur (intensité v de 0 à 255) :
//  · HISTORIQUE (thème sans --chaleur-*) : teinte ET opacité croissent, base + pente × v/255.
//    Monotone en contraste sur fond SOMBRE ; pas sur fond CLAIR, où la teinte s'éclaircit vers le
//    fond : les plus gros murs y étaient les MOINS visibles (mesuré sur Aero et Codex, qui posent
//    donc leurs jetons --chaleur-*) ;
//  · ENCRE du thème (--chaleur-bid / --chaleur-ask, hex ou rgb()) : teinte fixe, seule l'opacité
//    croît, CHALEUR_ALPHA.base + pente × v/255 — monotone sur tout fond.
// Gardées littérales : tests/test_palette.py les lit ici et vérifie la monotonie, thème par thème.
const HEAT_RAMPE = { bid: { base: [10, 60, 55, 0.2], pente: [80, 180, 165, 0.65] },
                     ask: { base: [60, 15, 15, 0.2], pente: [195, 105, 75, 0.65] } };
const CHALEUR_ALPHA = { base: 0.10, pente: 0.80 };
// Heatmap : la grille NATIVE (1 px = 1 (colonne minute, bin de prix)) est rastérisée une
// fois par payload puis composée en UN drawImage, au lieu d'un fillRect par cellule
// (jusqu'à 128 k appels/frame, ~175 ms mesuré, pour un rendu quasi identique : en 15m les
// colonnes se tuilent déjà à ~0,93 px). Le coût était le NOMBRE d'appels, pas la surface peinte.
let heatLayer = null;   // { cv, w, h, P1, dt, dp, cle }
// Rampe -> Uint32 ABGR (ordre mémoire d'ImageData, little-endian) : un pixel écrit sans reparser
// une chaîne CSS par cellule. Mêmes opérations que l'ancienne table de chaînes rgba() : la rampe
// historique est identique à l'octet près.
function rampeU32(base, pente) {
  const a = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    const t = i / 255, c = k => base[k] + pente[k] * t | 0;
    a[i] = (((base[3] + pente[3] * t) * 255 | 0) << 24 | (c(2) << 16) | (c(1) << 8) | c(0)) >>> 0;
  }
  return a;
}
// Reconstruites par lireJetons() à chaque changement de thème ; l'id du thème est dans la clé
// de la couche (buildHeatLayer) : une couche peinte avec la rampe d'un autre thème est refaite.
let HEAT_U32 = { bid: rampeU32(HEAT_RAMPE.bid.base, HEAT_RAMPE.bid.pente), ask: rampeU32(HEAT_RAMPE.ask.base, HEAT_RAMPE.ask.pente) };
/** heatmap.json → GRILLE, quel que soit son format (les deux se lisent, au bit près la même
 *  grille pour la même information : tests/test_chaleur.js) :
 *  · « colonnes-1 » (heatmap.py, depuis le 07/10/2026) : `colonnes` = [minute, bid_bas, [v…],
 *    ask_bas, [v…]], minute = ⌊t / dt⌋ ABSOLUE, v[i] = intensité de la tranche bas + i
 *    (prix = tranche × dp), 0 = rien au-dessus du seuil, côté vide = null, [] ; minute absente =
 *    non observée ;
 *  · l'ancien format (bids / asks = [c, pb, v], c compté depuis t0), que le serveur publie tant
 *    qu'il n'est pas passé au nouveau — et qu'une page restée en cache lit encore après.
 *  Grille : colonne c (depuis t0, en s) de largeur dt, tranches absolues de pbMin à pbMin + H − 1,
 *  cellule (c, tranche) en c·H + (tranche − pbMin) ; bids / asks : Uint8Array, 0 = rien. Elle
 *  s'arrête à la dernière colonne et aux tranches extrêmes qui portent une valeur non nulle. */
function grilleChaleur(h) {
  if (!h || !(h.dt > 0) || !(h.dp > 0)) return null;
  const cols = Array.isArray(h.colonnes) ? h.colonnes : null;
  // Origine des colonnes : t0 publié (début de la première colonne), sinon la première minute.
  const m0 = isFinite(h.t0) ? Math.round(h.t0 / h.dt) : (cols && cols.length ? cols[0][0] : 0);
  let cMax = -1, pMin = Infinity, pMax = -Infinity;
  const borne = (c, pb) => { if (c > cMax) cMax = c; if (pb < pMin) pMin = pb; if (pb > pMax) pMax = pb; };
  if (cols) {
    for (const col of cols) {
      const c = col[0] - m0;
      if (!(c >= 0)) continue;
      for (let k = 1; k <= 3; k += 2) {
        const bas = col[k], v = col[k + 1];
        if (bas === null || !v) continue;
        for (let i = 0; i < v.length; i++) if (v[i] > 0) borne(c, bas + i);
      }
    }
  } else {
    for (const cells of [h.bids, h.asks]) for (const x of cells || []) if (x[2] > 0 && x[0] >= 0) borne(x[0], x[1]);
  }
  if (cMax < 0) return null;
  const W = cMax + 1, H = pMax - pMin + 1;
  const g = { t0: m0 * h.dt, dt: h.dt, dp: h.dp, W, H, pbMin: pMin, bids: new Uint8Array(W * H), asks: new Uint8Array(W * H) };
  if (cols) {
    for (const col of cols) {
      const c = col[0] - m0;
      if (!(c >= 0)) continue;
      for (let k = 1; k <= 3; k += 2) {
        const bas = col[k], v = col[k + 1], dest = k === 1 ? g.bids : g.asks, o = c * H + bas - pMin;
        if (bas === null || !v) continue;
        for (let i = 0; i < v.length; i++) if (v[i] > dest[o + i]) dest[o + i] = v[i];
      }
    }
  } else {
    for (const [cells, dest] of [[h.bids, g.bids], [h.asks, g.asks]])
      for (const x of cells || []) { if (!(x[2] > 0) || x[0] < 0) continue; const i = x[0] * H + x[1] - pMin; if (x[2] > dest[i]) dest[i] = x[2]; }
  }
  return g;
}
/** Pixels de la couche : grille DÉJÀ fusionnée et seuillée (fusionnerGrille, js/reglages.js),
 *  cadrée sur ses cases non vides — de la colonne 0 à la dernière, de la tranche la plus basse
 *  à la plus haute ; ligne 0 = la tranche la PLUS HAUTE (drawImage descend, le prix monte).
 *  Quand bid et ask tombent dans la même case, la plus forte intensité l'emporte (l'ask à
 *  égalité) — exactement l'ancienne règle, case par case. → { W, H, P1, px } ou null. */
function pixelsChaleur(g, palB, palA) {
  let W = 0, lo = Infinity, hi = -Infinity;
  for (let c = 0; c < g.W; c++) {
    const o = c * g.H;
    for (let p = 0; p < g.H; p++) if (g.bids[o + p] || g.asks[o + p]) { W = c + 1; if (p < lo) lo = p; if (p > hi) hi = p; }
  }
  if (!W) return null;
  const H = hi - lo + 1, px = new Uint32Array(W * H);
  for (let c = 0; c < W; c++) {
    const o = c * g.H;
    for (let p = lo; p <= hi; p++) {
      const b = g.bids[o + p], a = g.asks[o + p];
      if (a && a >= b) px[(hi - p) * W + c] = palA[a] || palA[255];
      else if (b) px[(hi - p) * W + c] = palB[b] || palB[255];
    }
  }
  return { W, H, P1: g.pbMin + hi, px };
}
/** Couche heatmap, FUSIONNÉE par MAX (kt colonnes × kp tranches, js/reglages.js), cellules
 *  sous `seuil` retirées. L'image ne couvre que les tranches présentes : elle partait du prix
 *  0 $ — 1 441 × 4 333 px pour ~150 lignes utiles.
 *  Les TROIS dernières couches sont gardées (zoom qui passe et repasse un palier de fusion :
 *  37 ms par reconstruction mesurés quand une seule l'était). Avant, la fusion construisait une
 *  Map de 131 000 cellules même à 1 × 1 (22,5 ms pour ne rien changer) ; elle se fait maintenant
 *  sur la grille, en tableaux typés, et pas du tout à 1 × 1. */
const COUCHES_GARDEES = 3;
const heatLayers = [];   // la plus récente en tête
function buildHeatLayer(hm, kt, kp, seuil) {
  const cle = hm.updated + '|' + kt + '|' + kp + '|' + seuil + '|' + themeCourant().id;
  const k = heatLayers.findIndex(l => l.cle === cle);
  if (k >= 0) { const l = heatLayers[k]; if (k) { heatLayers.splice(k, 1); heatLayers.unshift(l); } return (heatLayer = l); }
  const g = hm.grille && fusionnerGrille(hm.grille, kt, kp, seuil), p = g && pixelsChaleur(g, HEAT_U32.bid, HEAT_U32.ask);
  if (!p) return null;
  const sortie = heatLayers.length >= COUCHES_GARDEES ? heatLayers.pop() : null;
  const cv = sortie ? sortie.cv : document.createElement('canvas');
  cv.width = p.W; cv.height = p.H;
  cv.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(p.px.buffer), p.W, p.H), 0, 0);
  const l = { cv, w: p.W, h: p.H, P1: p.P1, dt: g.dt, dp: g.dp, cle };
  heatLayers.unshift(l);
  return (heatLayer = l);
}
/** Facteur de fusion AUTOMATIQUE : quand une colonne (ou une tranche) fait moins d'un pixel,
 *  on regroupe par MAX jusqu'à l'atteindre, au lieu de laisser le lissage MOYENNER — une
 *  moyenne efface un mur isolé. Puissances de 2 : la couche n'est refaite qu'à chaque palier. */
const palier = x => x <= 1 ? 1 : Math.pow(2, Math.ceil(Math.log2(x)));
// heatmap.json n'est republié que toutes les 15 min. Sans paramètre d'URL et en `no-cache`, le
// navigateur REVALIDE par ETag : 304 de quelques centaines d'octets tant que le fichier n'a pas
// changé (vérifié le 04/10/2026). Mais un 304 rend quand même le CORPS ENTIER à la page : elle
// re-analysait 2,2 Mo chaque minute (31 ms, 5,6 Mo de tas) pour rien, puis redessinait. Désormais :
// relu seulement quand une publication est attendue (lectureDue), le début du corps lu
// (`updated`, première clé) et le reste abandonné s'il n'a pas changé ; dessin seulement si nouveau.
const HEATMAP_URL = 'https://raw.githubusercontent.com/lorenzoapro12-jpg/samsara-live/master/heatmap.json';
let chaleurLue = 0;      // dernière relecture réussie (ms)
async function fetchHeatmap(force) {
  if (document.hidden) return;
  if (!force && !lectureDue(histHeatmap && histHeatmap.majA, chaleurLue)) return;
  try {
    const r = Horloges.verifier(await fetch(HEATMAP_URL, { cache: 'no-cache' }));
    const h = await lireSiNouveau(r, histHeatmap && histHeatmap.updated);
    chaleurLue = Date.now();
    Horloges.noter('chaleur');
    if (!h) return;                                   // même publication : rien à refaire
    const grille = grilleChaleur(h);
    // On garde l'en-tête et la grille, pas les 130 000 cellules du fichier.
    histHeatmap = { updated: h.updated, majA: Date.parse(h.updated) || null, sym: h.sym, dt: h.dt, dp: h.dp,
      t0: grille ? grille.t0 : h.t0, encodage: h.encodage || null, format: h.format || 'cellules', grille };
    heatLayers.length = 0; heatLayer = null;
    if (overlays.liq) drawChart();
  } catch(e) { chaleurLue = 0; Horloges.noter('chaleur', e); }   // à retenter au prochain tour
}
function toggleDepth(on) {
  if (on) { fetchHeatmap(); if (!depthTimer) depthTimer = setInterval(fetchHeatmap, CADENCES.chaleur_lue); }
  else { clearInterval(depthTimer); depthTimer = null; }
}

// ============ SCÉNARIOS DU MATIN : previsions.json (branche `previsions`) ============
// Publié par la routine du matin (format « previsions-1 », js/scenarios.js le lit). Lu sur GitHub
// Raw comme les autres fichiers publiés : sans paramètre d'URL, en revalidation (`no-cache`, 304
// tant qu'il n'a pas changé) — le CDN ignore un `?t=` (mesuré : voir fetchMarket). Au démarrage
// APRÈS le premier dessin (hors du chemin critique : le script de tête ne le précharge pas), puis
// toutes les CADENCES.previsions_lue, onglet visible, BTCUSDT seulement, couche affichée.
// Le même contenu relu ne redessine rien. Panne, 404, JSON ou format illisibles : la couche le dit
// en une ligne discrète ; le dernier fichier lisible, s'il y en a un, reste affiché.
const PREVISIONS_URL = 'https://raw.githubusercontent.com/lorenzoapro12-jpg/samsara-live/previsions/previsions.json';
let previsions = null;        // Scenarios.lire(…) + { texte, luA } : le dernier fichier LISIBLE
let previsionsEchec = null;   // { a (ms), raison } : la dernière lecture ratée (null après un succès)
let previsionsN = 0;          // numéro du fichier lisible (clé des suivis mémorisés)
let previsionsEnVol = null;
function fetchPrevisions() {
  if (activeSymbol !== 'BTCUSDT' || !overlays.scenarios || typeof Scenarios === 'undefined') return Promise.resolve(false);
  if (previsionsEnVol) return previsionsEnVol;
  previsionsEnVol = (async () => {
    const a = Horloges.maintenant();
    let F = null, texte = null, raison = null;
    try {
      const r = Horloges.verifier(await fetch(PREVISIONS_URL, { cache: 'no-cache' }));
      texte = await r.text();
      // Même contenu, dernière lecture réussie : rien à refaire, rien à redessiner.
      if (previsions && texte === previsions.texte && !previsionsEchec) { previsions.luA = a; return false; }
      let d = null;
      try { d = JSON.parse(texte); } catch (e) { raison = 'JSON illisible'; }
      if (!raison) { F = Scenarios.lire(d, a); if (F.etat === 'illisible') { raison = F.raison; F = null; } }
    } catch (e) { raison = e && e.status ? 'HTTP ' + e.status : 'réseau'; }
    if (F) {
      const meme = previsions && previsions.texte === texte;
      F.texte = texte; F.luA = a;
      if (!meme) previsionsN++;
      previsions = F; previsionsEchec = null;
    } else previsionsEchec = { a, raison };
    if (activeSymbol === 'BTCUSDT' && overlays.scenarios) scheduleDraw();
    return true;
  })().finally(() => { previsionsEnVol = null; });
  return previsionsEnVol;
}

// ============ INDICATEURS ============
function calcEMA(data, period) {
  const k = 2 / (period + 1);
  const out = new Array(data.length).fill(null);
  let sum = 0;
  for (let i = 0; i < period; i++) sum += data[i];
  out[period - 1] = sum / period;
  for (let i = period; i < data.length; i++) out[i] = data[i] * k + out[i - 1] * (1 - k);
  return out;
}

function calcSMA(data, period) {
  const out = new Array(data.length).fill(null);
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += data[j];
    out[i] = sum / period;
  }
  return out;
}

function calcBollinger(data, period, stdDev) {
  const sma = calcSMA(data, period);
  const upper = new Array(data.length).fill(null);
  const lower = new Array(data.length).fill(null);
  for (let i = period - 1; i < data.length; i++) {
    let sumSq = 0;
    for (let j = i - period + 1; j <= i; j++) sumSq += (data[j] - sma[i]) ** 2;
    const std = Math.sqrt(sumSq / period);
    upper[i] = sma[i] + stdDev * std;
    lower[i] = sma[i] - stdDev * std;
  }
  return { sma, upper, lower };
}

function calcRSI(data, period) {
  const out = new Array(data.length).fill(null);
  if (data.length < period + 1) return out;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const d = data[i] - data[i - 1];
    if (d > 0) gains += d; else losses -= d;
  }
  let avgGain = gains / period, avgLoss = losses / period;
  out[period] = 100 - 100 / (1 + avgGain / (avgLoss || 1e-10));
  for (let i = period + 1; i < data.length; i++) {
    const d = data[i] - data[i - 1];
    avgGain = (avgGain * (period - 1) + (d > 0 ? d : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (d < 0 ? -d : 0)) / period;
    out[i] = 100 - 100 / (1 + avgGain / (avgLoss || 1e-10));
  }
  return out;
}

function calcMACD(data, rapide, lente, sig) {
  const ema12 = calcEMA(data, rapide);
  const ema26 = calcEMA(data, lente);
  const macdLine = new Array(data.length).fill(null);
  for (let i = 0; i < data.length; i++) {
    if (ema12[i] !== null && ema26[i] !== null) macdLine[i] = ema12[i] - ema26[i];
  }
  const signal = calcEMA(macdLine.filter(v => v !== null), sig);
  // Re-align signal
  const signalAligned = new Array(data.length).fill(null);
  let si = 0;
  for (let i = 0; i < data.length; i++) {
    if (macdLine[i] !== null && si < signal.length) signalAligned[i] = signal[si++];
  }
  const histogram = new Array(data.length).fill(null);
  for (let i = 0; i < data.length; i++) {
    if (macdLine[i] !== null && signalAligned[i] !== null) histogram[i] = macdLine[i] - signalAligned[i];
  }
  return { macdLine, signal: signalAligned, histogram };
}

// Plus haut (sens = 1) ou plus bas (sens = −1) des `p` valeurs qui finissent en i, pour chaque
// i ≥ p − 1 (null avant) : une file monotone, O(n). Les calculs faisaient
// Math.max(...v.slice(i − p + 1, i + 1)) — deux tableaux alloués par bougie et par fenêtre
// (six pour Ichimoku) : 5,5 ms par appel et l'essentiel du ramasse-miettes. Le maximum d'une
// fenêtre est le même nombre quel que soit le chemin : valeurs identiques au bit près
// (tests/test_indicateurs_boucles.js, sur 3 000 bougies réelles). Données finies attendues.
function extremeGlissant(v, p, sens) {
  const n = v.length, out = new Array(n).fill(null), file = new Array(n);
  let tete = 0, queue = 0;
  for (let i = 0; i < n; i++) {
    const x = v[i];
    if (sens > 0) { while (queue > tete && v[file[queue - 1]] <= x) queue--; }
    else { while (queue > tete && v[file[queue - 1]] >= x) queue--; }
    file[queue++] = i;
    if (file[tete] <= i - p) tete++;
    if (i >= p - 1) out[i] = v[file[tete]];
  }
  return out;
}

function calcStoch(highs, lows, closes, kPeriod, dPeriod) {
  const kOut = new Array(closes.length).fill(null);
  const dOut = new Array(closes.length).fill(null);
  const hh = extremeGlissant(highs, kPeriod, 1), ll = extremeGlissant(lows, kPeriod, -1);
  for (let i = kPeriod - 1; i < closes.length; i++) {
    const h = hh[i], l = ll[i];
    kOut[i] = ((closes[i] - l) / (h - l || 1)) * 100;
  }
  // SMA of %K for %D
  for (let i = kPeriod + dPeriod - 2; i < closes.length; i++) {
    let sum = 0, count = 0;
    for (let j = i - dPeriod + 1; j <= i; j++) {
      if (kOut[j] !== null) { sum += kOut[j]; count++; }
    }
    if (count > 0) dOut[i] = sum / count;
  }
  return { k: kOut, d: dOut };
}

function calcATR(highs, lows, closes, period) {
  const tr = [null];
  for (let i = 1; i < closes.length; i++) {
    tr.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i-1]), Math.abs(lows[i] - closes[i-1])));
  }
  const atr = new Array(closes.length).fill(null);
  let sum = 0;
  for (let i = 1; i <= period; i++) sum += tr[i];
  atr[period] = sum / period;
  for (let i = period + 1; i < closes.length; i++) {
    atr[i] = (atr[i-1] * (period - 1) + tr[i]) / period;
  }
  return atr;
}

function calcVWAP(highs, lows, closes, volumes, times, interval, ancrageS, ancrageBougies) {
  const out = new Array(closes.length).fill(null);
  // Ancrage : un cumul depuis la PREMIERE bougie chargee (3000 = 125 jours en 1h) donne une
  // moyenne longue, pas un VWAP. Intraday -> reset a chaque jour UTC (vrai VWAP de session) ;
  // en 4h/1d/1w, pas de session intraday ou s'ancrer -> l'ancrage est recale toutes les 20 bougies.
  const sec = { '1m':60,'3m':180,'5m':300,'15m':900,'30m':1800,'1h':3600,'4h':14400,'1d':86400,'1w':604800 }[interval];
  const bucket = !sec ? 0 : (sec < ancrageS ? ancrageS : sec * ancrageBougies);
  let cumPV = 0, cumV = 0, b = null;
  for (let i = 0; i < closes.length; i++) {
    const key = (times && bucket) ? Math.floor(times[i] / bucket) : 0;
    if (key !== b) { b = key; cumPV = 0; cumV = 0; }
    cumPV += ((highs[i] + lows[i] + closes[i]) / 3) * volumes[i];
    cumV += volumes[i];
    out[i] = cumPV / (cumV || 1);
  }
  return out;
}

function calcIchimoku(highs, lows, closes, t = 9, k = 26, b = 52) {
  const n = closes.length;
  const tenkan = new Array(n), kijun = new Array(n), senkouA = new Array(n), senkouB = new Array(n), chikou = [];
  // Fenêtres tenkan / kijun / senkou B (9 / 26 / 52 par défaut, PARAM.ichimoku) : extrêmes glissants, une passe chacun.
  const hT = extremeGlissant(highs, t, 1), lT = extremeGlissant(lows, t, -1);
  const hK = extremeGlissant(highs, k, 1), lK = extremeGlissant(lows, k, -1);
  const hB = extremeGlissant(highs, b, 1), lB = extremeGlissant(lows, b, -1);
  for (let i = 0; i < n; i++) {
    tenkan[i] = i >= t - 1 ? (hT[i] + lT[i]) / 2 : null;
    kijun[i] = i >= k - 1 ? (hK[i] + lK[i]) / 2 : null;
    senkouA[i] = i >= k - 1 ? ((tenkan[i] || 0) + (kijun[i] || 0)) / 2 : null;
    senkouB[i] = i >= b - 1 ? (hB[i] + lB[i]) / 2 : null;
  }
  // Chikou = cloture COURANTE reportee `k` periodes EN ARRIERE : a l'indice i, la cloture
  // de i+k-1 (convention TradingView, decalage 26 => offset 25). L'ancienne formule lisait
  // closes[i-25] : un prix d'il y a 25 bougies avance dans le futur, l'inverse du Chikou.
  for (let i = 0; i < closes.length; i++) chikou.push(i + k - 1 < closes.length ? closes[i + k - 1] : null);
  // Senkou reportes de `k` periodes vers la droite
  const shiftedA = new Array(closes.length + k).fill(null);
  const shiftedB = new Array(closes.length + k).fill(null);
  for (let i = 0; i < senkouA.length; i++) {
    if (senkouA[i] !== null && i + k < shiftedA.length) shiftedA[i + k] = senkouA[i];
    if (senkouB[i] !== null && i + k < shiftedB.length) shiftedB[i + k] = senkouB[i];
  }
  return { tenkan, kijun, senkouA: shiftedA, senkouB: shiftedB, chikou };
}

function calcSAR(highs, lows, closes, afStep = 0.02, afMax = 0.2) {
  const out = new Array(closes.length).fill(null);
  if (closes.length < 2) return out;
  // Algorithme de TradingView (ta.sar), tendance initiale deduite des deux premieres clotures.
  // Le bornage par les deux bougies precedentes se fait dans la direction COURANTE, donc
  // APRES un eventuel retournement — et le SAR d'un retournement est pose au-dela de la
  // bougie (max(haut, EP) / min(bas, EP)). L'ancienne version bornait dans l'ANCIENNE
  // direction : le SAR baissier etait ramene sous le prix et se retournait a la bougie
  // suivante. Mesure le 04/10/2026 sur 1 000 bougies 1h BTC : 221 points DANS la bougie et
  // 398 retournements ; la version actuelle donne 0 et 76, identique a ta.sar.
  let isUp = closes[1] > closes[0];
  let af = afStep;
  let ep = isUp ? highs[1] : lows[1];
  let sar = isUp ? lows[0] : highs[0];
  for (let i = 1; i < closes.length; i++) {
    let premiere = (i === 1);
    sar = sar + af * (ep - sar);
    if (isUp && sar > lows[i]) {
      premiere = true; isUp = false; sar = Math.max(highs[i], ep); ep = lows[i]; af = afStep;
    } else if (!isUp && sar < highs[i]) {
      premiere = true; isUp = true; sar = Math.min(lows[i], ep); ep = highs[i]; af = afStep;
    }
    if (!premiere) {
      if (isUp && highs[i] > ep) { ep = highs[i]; af = Math.min(afMax, af + afStep); }
      if (!isUp && lows[i] < ep) { ep = lows[i]; af = Math.min(afMax, af + afStep); }
    }
    if (isUp) { sar = Math.min(sar, lows[i - 1]); if (i > 1) sar = Math.min(sar, lows[i - 2]); }
    else      { sar = Math.max(sar, highs[i - 1]); if (i > 1) sar = Math.max(sar, highs[i - 2]); }
    out[i] = sar;
  }
  return out;
}

function calcOBV(closes, volumes) {
  const out = new Array(closes.length).fill(0);
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] > closes[i - 1]) out[i] = out[i - 1] + volumes[i];
    else if (closes[i] < closes[i - 1]) out[i] = out[i - 1] - volumes[i];
    else out[i] = out[i - 1];
  }
  return out;
}

function calcMFI(highs, lows, closes, volumes, period) {
  const n = closes.length, tp = new Array(n), mf = new Array(n);
  for (let i = 0; i < n; i++) { tp[i] = (highs[i] + lows[i] + closes[i]) / 3; mf[i] = tp[i] * volumes[i]; }
  const out = new Array(closes.length).fill(null);
  for (let i = period; i < closes.length; i++) {
    let posFlow = 0, negFlow = 0;
    for (let j = i - period + 1; j <= i; j++) {
      if (tp[j] > tp[j - 1]) posFlow += mf[j];
      else if (tp[j] < tp[j - 1]) negFlow += mf[j];
    }
    out[i] = 100 - 100 / (1 + posFlow / (negFlow || 1));
  }
  return out;
}

function calcWilliamsR(highs, lows, closes, period) {
  const out = new Array(closes.length).fill(null);
  const hh = extremeGlissant(highs, period, 1), ll = extremeGlissant(lows, period, -1);
  for (let i = period - 1; i < closes.length; i++) {
    const h = hh[i], l = ll[i];
    out[i] = ((h - closes[i]) / (h - l || 1)) * -100;
  }
  return out;
}

// Les sommes de la fenêtre sont refaites à chaque bougie, de gauche à droite, comme le faisait
// reduce : une somme GLISSANTE (ajouter l'entrant, retirer le sortant) irait plus vite mais
// changerait les derniers bits — et une valeur affichée ne change pas pour gagner du temps.
function calcCCI(highs, lows, closes, period) {
  const n = closes.length, tp = new Array(n);
  for (let i = 0; i < n; i++) tp[i] = (highs[i] + lows[i] + closes[i]) / 3;
  const out = new Array(closes.length).fill(null);
  for (let i = period - 1; i < closes.length; i++) {
    let s = 0;
    for (let j = i - period + 1; j <= i; j++) s += tp[j];
    const sma = s / period;
    let e = 0;
    for (let j = i - period + 1; j <= i; j++) e += Math.abs(tp[j] - sma);
    const mad = e / period;
    out[i] = (tp[i] - sma) / (0.015 * (mad || 1));
  }
  return out;
}

function calcADX(highs, lows, closes, period) {
  const plusDM = [], minusDM = [], tr = [], atrArr = [];
  const adx = new Array(closes.length).fill(null);
  const plusDI = new Array(closes.length).fill(null);
  const minusDI = new Array(closes.length).fill(null);
  for (let i = 0; i < closes.length; i++) {
    if (i === 0) { plusDM.push(0); minusDM.push(0); tr.push(highs[i] - lows[i]); }
    else {
      const up = highs[i] - highs[i - 1];
      const dn = lows[i - 1] - lows[i];
      plusDM.push(up > dn && up > 0 ? up : 0);
      minusDM.push(dn > up && dn > 0 ? dn : 0);
      tr.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1])));
    }
  }
  // Lissage de Wilder sur TR/+DM/-DM, amorce sur les `period` premieres VRAIES variations
  // (indices 1..period : la bougie 0 n'a pas de veille, son TR n'est pas un vrai range).
  if (closes.length <= period * 2) return { adx, plusDI, minusDI };
  let atrSum = tr.slice(1, period + 1).reduce((a, b) => a + b, 0);
  let pdmSum = plusDM.slice(1, period + 1).reduce((a, b) => a + b, 0);
  let ndmSum = minusDM.slice(1, period + 1).reduce((a, b) => a + b, 0);
  // ADX = DX LISSE PAR WILDER (moyenne des `period` premiers DX, puis recursion 1/period).
  // L'ancienne version prenait une moyenne SIMPLE glissante des DX : ecart mesure jusqu'a
  // 12,8 pts avec la definition de Wilder (TradingView) sur 200 bougies 1h BTC.
  let dxSeed = 0, adxPrev = null;
  for (let i = period; i < closes.length; i++) {
    if (i > period) {
      atrSum = atrSum - atrSum / period + tr[i];
      pdmSum = pdmSum - pdmSum / period + plusDM[i];
      ndmSum = ndmSum - ndmSum / period + minusDM[i];
    }
    atrArr[i] = atrSum;
    plusDI[i] = (pdmSum / atrSum) * 100;
    minusDI[i] = (ndmSum / atrSum) * 100;
    const dx = Math.abs((plusDI[i] - minusDI[i]) / ((plusDI[i] + minusDI[i]) || 1)) * 100;
    if (adxPrev === null) {
      dxSeed += dx;
      if (i === period * 2 - 1) { adxPrev = dxSeed / period; adx[i] = adxPrev; }
    } else {
      adxPrev = (adxPrev * (period - 1) + dx) / period;
      adx[i] = adxPrev;
    }
  }
  return { adx, plusDI, minusDI };
}

function calcAO(highs, lows, rapide, lente) {
  const mid = new Array(highs.length);
  for (let i = 0; i < highs.length; i++) mid[i] = (highs[i] + lows[i]) / 2;
  const sma5 = calcSMA(mid, rapide);
  const sma34 = calcSMA(mid, lente);
  const out = new Array(mid.length).fill(null);
  for (let i = 0; i < mid.length; i++) {
    if (sma5[i] !== null && sma34[i] !== null) out[i] = sma5[i] - sma34[i];
  }
  return out;
}

// ============ STRATEGY ENGINE ============
// Grid bot FSM — Pure functional evaluator: (MarketState, BotState, Config) => {nextBotState, orders}
// Constraint: ALL functions MUST only access candles[0..idx], never the full array beyond idx
const ST_FEE_MAKER = 0.001;   // 0.1%
const ST_FEE_TAKER = 0.001;   // 0.1%
const ST_DEFAULT_CAPITAL = 1000; // USDT

const ST_STATES = { IDLE: 'idle', ACTIVE: 'active', RANGE_EXIT: 'range_exit' };

// Registry of all strategies
const STRATEGIES = {};

// « Comment ça marche » en une phrase, affiché sous le nom. Sans ça, un débutant ne peut pas
// savoir que Bollinger n'achète QUE sur la bande basse (d'où un backtest qui ne fait rien).
const STRAT_DESC = {
  bb_grid:   'achète à chaque niveau dès que le prix touche la bande de Bollinger basse. Plage auto : bande basse → bande médiane, donc aucune entrée tant que le prix ne descend pas jusque-là.',
  rsi_grid:  'n\'arme la grille que si le RSI passe sous le seuil de survente (prix qui chute). Plage auto : prix courant ±5 %.',
  ema_grid:  'achète les replis sur l\'EMA tant que la tendance reste haussière. Plage auto : EMA → prix courant.',
  sr_grid:   'grille PERMANENTE bornée par le support et la résistance les plus proches. Repli sur ±5 % si aucun niveau n\'atteint le score minimum.',
  dumb_grid: 'témoin sans aucun signal : grille fixe ±5 % toujours active. C\'est la référence que les autres doivent battre.',
};

function registerStrategy(key, def) { STRATEGIES[key] = def; }

// Helper: distribute N levels evenly between low and high price
function distributeGridLevels(low, high, n) {
  const levels = [];
  for (let i = 0; i < n; i++) {
    const price = n > 1 ? low + ((high - low) * i) / (n - 1) : low;
    levels.push({ price, side: 'buy' });
  }
  return levels;
}

// ─── Helpers communs aux strategies de grille ───
// Ces params etaient copies dans les 5 grilles : toute nouvelle grille DOIT passer par ici.
// ORDRE = ordre d'affichage, lu par paires sur 2 colonnes : (Capital|Niveaux) (Prix inf|Prix sup)
// (TP|SL). Ne pas remettre gridLevels au milieu de la plage : les paires n'ont plus de sens.
function gridParams(levels, tp, sl, loHint, hiHint) {
  return {
    gridLevels: { value: levels, min: 2, max: 500, step: 1, label: 'Niveaux' },
    priceLow: { value: 0, min: 0, max: 999999, step: 1, label: 'Prix inférieur', hint: loHint },
    priceHigh: { value: 0, min: 0, max: 999999, step: 1, label: 'Prix supérieur', hint: hiHint },
    tpPct: { value: tp, min: 0.1, max: 5, step: 0.1, label: 'Take Profit %' },
    slPct: { value: sl, min: 0.5, max: 10, step: 0.5, label: 'Stop Loss %' },
  };
}
// Borne manuelle si > 0, sinon la borne auto calculee par la strategie
function gridRange(params, autoLow, autoHigh) {
  return { low: (params.priceLow > 0) ? params.priceLow : autoLow,
           high: (params.priceHigh > 0) ? params.priceHigh : autoHigh };
}
function gridExec(level, entryCandle, params) {
  return { tp: level.price * (1 + params.tpPct / 100), sl: level.price * (1 - params.slPct / 100) };
}

// ─── Bollinger Grid Strategy ───
registerStrategy('bb_grid', {
  label: 'Grille Bollinger',
  params: {
    ...gridParams(10, 0.5, 3, '0 = auto (bande inf BB)', '0 = auto (bande mid BB)'),
    period: { value: 20, min: 10, max: 50, step: 1, label: 'Période BB', advanced: true },
    stddev: { value: 2, min: 1, max: 4, step: 0.5, label: 'Écart-type', advanced: true },
    reentryThreshold: { value: 0.3, min: 0.1, max: 2, step: 0.1, label: 'Seuil réalignement %', advanced: true },
  },
  trigger(candles, idx, params, indicators) {
    if (idx < params.period) return 'idle';
    const bbLower = indicators.bb_lower, bbUpper = indicators.bb_upper;
    const close = candles[idx].close;
    if (bbLower && close <= bbLower[idx] * 1.002) return 'enter';
    if (bbUpper && close >= bbUpper[idx] * 0.998) return 'exit';
    return null;
  },
  generateLevels(candles, idx, params, indicators) {
    const r = gridRange(params, indicators.bb_lower[idx], indicators.bb_mid[idx]);
    return distributeGridLevels(r.low, r.high, params.gridLevels);
  },
  execution: gridExec
});

// ─── RSI Grid Strategy ───
registerStrategy('rsi_grid', {
  label: 'Grille RSI',
  params: {
    ...gridParams(10, 0.8, 4, '0 = auto (-5% prix)', '0 = auto (+5% prix)'),
    oversold: { value: 30, min: 15, max: 45, step: 1, label: 'Seuil survente', advanced: true },
    rsiPeriod: { value: 14, min: 5, max: 30, step: 1, label: 'Période RSI', advanced: true },
    exitRsi: { value: 50, min: 40, max: 70, step: 1, label: 'Seuil sortie RSI', advanced: true },
  },
  trigger(candles, idx, params, indicators) {
    if (idx < params.rsiPeriod) return 'idle';
    const rsi = indicators.rsi;
    if (rsi[idx] !== null && rsi[idx] <= params.oversold) return 'enter';
    if (rsi[idx] !== null && rsi[idx] >= params.exitRsi) return 'exit';
    return null;
  },
  generateLevels(candles, idx, params) {
    const price = candles[idx].close;
    const r = gridRange(params, price * 0.95, price * 1.05);
    return distributeGridLevels(r.low, r.high, params.gridLevels);
  },
  execution: gridExec
});

// ─── EMA Pullback Grid Strategy ───
registerStrategy('ema_grid', {
  label: 'Grille EMA Pullback',
  params: {
    ...gridParams(10, 0.5, 3, '0 = auto (EMA)', '0 = auto (prix courant)'),
    emaPeriod: { value: 50, min: 10, max: 200, step: 10, label: 'Période EMA', advanced: true },
    pullbackPct: { value: 2, min: 0.5, max: 10, step: 0.5, label: 'Pullback min %', advanced: true },
    trendMinBars: { value: 5, min: 3, max: 20, step: 1, label: 'Bars tendance min', advanced: true },
  },
  trigger(candles, idx, params, indicators) {
    if (idx < params.emaPeriod + params.trendMinBars) return 'idle';
    const ema = indicators.ema;
    const close = candles[idx].close;
    let trendUp = true;
    for (let i = idx - params.trendMinBars + 1; i <= idx; i++) {
      if (candles[i].close <= ema[i]) { trendUp = false; break; }
    }
    if (!trendUp) return 'idle';
    const distPct = ((close - ema[idx]) / ema[idx]) * 100;
    if (distPct <= params.pullbackPct && distPct > 0) return 'enter';
    if (distPct > params.pullbackPct * 2) return 'exit';
    return null;
  },
  generateLevels(candles, idx, params, indicators) {
    const r = gridRange(params, indicators.ema[idx], candles[idx].close);
    return distributeGridLevels(r.low, r.high, params.gridLevels);
  },
  execution: gridExec
});

// ─── S/R Grid Strategy ───
// Grille bornee par les S/R les plus proches (computeSR du TF courant, filtre srMinScore). PERMANENTE comme dumb_grid : l'alpha est dans le PLACEMENT. Pas de look-ahead.
registerStrategy('sr_grid', {
  label: 'Grille S/R',
  params: {
    ...gridParams(6, 0.5, 2, '0 = auto (support le plus proche)', '0 = auto (résistance la plus proche)'),
    srMinScore: { value: 2, min: 1, max: 10, step: 1, label: 'Score S/R min', advanced: true },
  },
  trigger(candles, idx) {
    if (idx < 60) return 'idle';   // laisser de l'historique pour que les pivots existent
    return 'enter';
  },
  generateLevels(candles, idx, params) {
    const price = candles[idx].close;
    const levels = computeSR(candles.slice(Math.max(0, idx - 299), idx + 1), chartInterval, 500)
      .filter(l => l.score >= params.srMinScore);
    const sup = levels.filter(l => l.price < price).sort((a, b) => b.price - a.price)[0];
    const res = levels.filter(l => l.price > price).sort((a, b) => a.price - b.price)[0];
    // Aucun niveau ne passe le filtre -> repli sur ±5% (comportement de dumb_grid)
    const r = gridRange(params, sup ? sup.price : price * 0.95, res ? res.price : price * 1.05);
    return distributeGridLevels(r.low, r.high, params.gridLevels);
  },
  execution: gridExec
});

// ─── Dumb Grid (fixed intervals, no TA) ───
registerStrategy('dumb_grid', {
  label: 'Grille Fixe (benchmark)',
  params: gridParams(10, 0.5, 3, '0 = auto (-5%)', '0 = auto (+5%)'),
  trigger(candles, idx) {
    if (idx < 2) return 'idle';
    return 'enter';
  },
  generateLevels(candles, idx, params) {
    const price = candles[idx].close;
    const r = gridRange(params, price * 0.95, price * 1.05);
    return distributeGridLevels(r.low, r.high, params.gridLevels);
  },
  execution: gridExec
});

// ─── GridBot class — runs a strategy over candles ───
class GridBot {
  constructor(strategyKey, capital) {
    this.strategyKey = strategyKey;            // chaine — pour les tests de type dans computeIndicators
    this.strategy = STRATEGIES[strategyKey];
    this.capital = capital || ST_DEFAULT_CAPITAL;
    this.reset();
  }

  reset() {
    this.state = ST_STATES.IDLE;
    this.gridLevels = [];     // {price, side, status:'pending'|'filled'|'closed', entryIdx, exitIdx, pnl, tp, sl}
    this.trades = [];         // completed round-trips
    this.cash = this.capital;
    this.asset = 0;
    this.lastRealignIdx = -1;
    this._skipFillIdx = -1;   // bougie de mise en place : non remplissable (anti look-ahead)
  }

  // Build params object from strategy defaults (overridden by user config)
  buildParams(userParams) {
    const p = {};
    for (const [k, def] of Object.entries(this.strategy.params)) {
      p[k] = (userParams && userParams[k] !== undefined) ? userParams[k] : def.value;
    }
    return p;
  }

  // Only uses candles[0..limit] — safe against look-ahead.
  // `params` = params FUSIONNES (buildParams) : sans ca « Periode BB » / « Ecart-type » / « Periode RSI » sont INERTES.
  computeIndicators(candles, limit, params) {
    const p = params || this.buildParams({});
    const closes = candles.slice(0, limit + 1).map(c => c.close);
    const ind = {};
    const key = this.strategyKey;

    if (key === 'bb_grid') {
      const period = p.period || 20, stddev = (p.stddev === undefined ? 2 : p.stddev);
      if (closes.length >= period) {
        const bb = calcBollinger(closes, period, stddev);
        ind.bb_upper = bb.upper; ind.bb_lower = bb.lower; ind.bb_mid = bb.sma;
      }
    }
    if (key === 'ema_grid') {
      if (closes.length >= 50) ind.ema = calcEMA(closes, 50);
    }
    if (key === 'rsi_grid') {
      const rsiP = p.rsiPeriod || 14;
      if (closes.length >= rsiP) ind.rsi = calcRSI(closes, rsiP);
    }

    // Filet : un trigger qui lit bb_*/rsi doit trouver un tableau, jamais undefined
    if (!ind.bb_upper && closes.length >= 20) {
      const bb20 = calcBollinger(closes, 20, 2);
      ind.bb_upper = bb20.upper; ind.bb_lower = bb20.lower; ind.bb_mid = bb20.sma;
    }
    if (!ind.rsi && closes.length >= 14) ind.rsi = calcRSI(closes, 14);

    return ind;
  }

  // Step one candle — pure functional evaluation
  step(candles, idx, params, indicators) {
    const s = this.strategy;
    const trigger = s.trigger(candles, idx, params, indicators);

    // State transitions
    if (trigger === 'exit') {
      this.state = ST_STATES.IDLE;
      this._closeAllLevels(candles[idx]);
      this.gridLevels = [];
    }
    if (trigger === 'enter' && this.state !== ST_STATES.ACTIVE) {
      this.state = ST_STATES.ACTIVE;
      this._setupGrid(candles, idx, params, indicators);
      // Les ordres viennent d'etre places SUR la cloture de cette bougie : leur remplissage
      // ne peut pas etre constate avec le high/low de la bougie qui les a vus naitre.
      this._skipFillIdx = idx;
    }

    // If active, check fills on existing levels
    if (this.state === ST_STATES.ACTIVE && idx !== this._skipFillIdx) {
      this._checkFills(candles, idx, params);
    }

    return { state: this.state, gridLevels: [...this.gridLevels], trades: [...this.trades] };
  }

  _setupGrid(candles, idx, params, indicators) {
    const levels = this.strategy.generateLevels(candles, idx, params, indicators);
    const sizePerLevel = this.cash / levels.length;
    this.gridLevels = levels.map(l => ({
      price: l.price,
      side: l.side || 'buy',
      size: sizePerLevel / l.price, // quantity in base asset
      cost: sizePerLevel,
      status: 'pending',
      entryIdx: null,
      exitIdx: null,
      pnl: 0,
      tp: null,
      sl: null,
      reactivationCount: 0
    }));
    this.lastRealignIdx = idx;
  }

  _checkFills(candles, idx, params) {
    const c = candles[idx];
    // Pessimistic execution: if both tp and sl hit in same candle, sl wins
    for (const level of this.gridLevels) {
      if (level.status === 'pending') {
        // Fill: price crosses below level price (buy limit)
        if (c.low <= level.price && c.high >= level.price) {
          level.status = 'filled';
          level.entryIdx = idx;
          // Frais maker d'entree debites du cash MAINTENANT (le P&L les comptait, pas le grand livre).
          level.entryFee = level.cost * ST_FEE_MAKER;
          this.cash -= level.cost + level.entryFee;
          this.asset += level.size;
          const exec = this.strategy.execution(level, c, params);
          level.tp = exec.tp;
          level.sl = exec.sl;
          // Un achat limite sous le prix est rempli EN DESCENDANT : si la même bougie descend
          // ensuite jusqu'au stop, la perte a eu lieu. L'ancienne version ne testait le stop
          // qu'à la bougie suivante — un rebond entre-temps effaçait une perte réelle (biais
          // optimiste). Le take-profit, lui, n'est pas pris : l'ordre haut/bas est inconnu.
          if (c.low <= level.sl) this._closeLevel(level, idx, level.sl, true);
        }
      } else if (level.status === 'filled') {
        // Check SL first (pessimistic)
        if (c.low <= level.sl && c.high >= level.sl) {
          this._closeLevel(level, idx, level.sl, true);
        } else if (c.high >= level.tp && c.low <= level.tp) {
          this._closeLevel(level, idx, level.tp, false);
        }
      }
    }

    // Realignment check — only if price moved significantly
    if (idx - this.lastRealignIdx > 5) {
      const realignPct = params.reentryThreshold || 0.3;
      const avgLevel = this.gridLevels.reduce((s, l) => s + l.price, 0) / this.gridLevels.length || 1;
      if (Math.abs((c.close - avgLevel) / avgLevel) > realignPct / 100) {
        // Close pending levels, regenerate
        this.gridLevels = this.gridLevels.filter(l => l.status !== 'pending');
        const indicators = this.computeIndicators(candles, idx, params);
        const newLevels = this.strategy.generateLevels(candles, idx, params, indicators);
        const remainingCash = this.cash;
        const sizePerLevel = remainingCash / Math.max(1, newLevels.length);
        for (const l of newLevels) {
          // Don't add if we already have a level at this price (within 0.2%)
          const exists = this.gridLevels.some(ex => Math.abs((ex.price - l.price) / l.price) < 0.002);
          if (!exists) {
            this.gridLevels.push({
              price: l.price, side: l.side || 'buy',
              size: sizePerLevel / l.price, cost: sizePerLevel,
              status: 'pending', entryIdx: null, exitIdx: null,
              pnl: 0, tp: null, sl: null, reactivationCount: 0
            });
          }
        }
        this.lastRealignIdx = idx;
      }
    }
  }

  _closeLevel(level, idx, exitPrice, isStopLoss) {
    const proceeds = level.size * exitPrice;
    // entryFee a ete debite du cash au fill ; fallback pour un niveau construit hors _checkFills
    const entryFee = (level.entryFee === undefined ? level.cost * ST_FEE_MAKER : level.entryFee);
    const exitFee = proceeds * (isStopLoss ? ST_FEE_TAKER : ST_FEE_MAKER);
    const pnl = proceeds - level.cost - entryFee - exitFee;
    this.cash += proceeds - exitFee;   // entryFee deja sorti du cash : ne pas le reprendre ici
    this.asset -= level.size;
    level.status = 'closed';
    level.exitIdx = idx;
    level.pnl = pnl;
    this.trades.push({
      entryPrice: level.price,
      exitPrice: exitPrice,
      entryIdx: level.entryIdx,
      exitIdx: idx,
      pnl: pnl,
      pnlPct: (pnl / level.cost) * 100,
      entryTime: null, // filled in by backtest runner
      exitTime: null
    });
  }

  _closeAllLevels(candle) {
    for (const level of this.gridLevels) {
      if (level.status === 'filled') {
        this._closeLevel(level, -1, candle.close, true); // force close = taker
      } else if (level.status === 'pending') {
        // Un niveau pending n'a JAMAIS debite le cash : le rembourser inventait du capital (1000 -> 2000 sans trade).
        level.status = 'closed';
        level.pnl = 0;
      }
    }
  }

  // ATTENTION : l.cost a DEJA ete debite au fill — le resoustraire compte le cout deux fois (MaxDD > 100%).
  equity(markPrice) {
    const mv = this.gridLevels
      .filter(l => l.status === 'filled')
      .reduce((sum, l) => sum + l.size * markPrice, 0);
    return this.cash + mv;
  }

  // Realized P&L only
  realizedPnl() {
    return this.trades.reduce((sum, t) => sum + t.pnl, 0);
  }
}

// ============ BACKTEST ENGINE ============
let btResult = null;      // Last backtest result
let btBot = null;         // Active bot instance (for forward test)
let btActiveStrategy = 'bb_grid';
let btUserParams = {};
let btCapital = ST_DEFAULT_CAPITAL;

function runBacktest(strategyKey, candles, startIdx, endIdx, userParams, capital) {
  const bot = new GridBot(strategyKey, capital || ST_DEFAULT_CAPITAL);
  const params = bot.buildParams(userParams || {});
  const equityCurve = [];  // {idx, total, realized, unrealized}
  // La DERNIÈRE bougie Binance est EN COURS : son haut/bas n'est pas définitif. La jouer,
  // c'est constater des remplissages qui peuvent ne jamais avoir lieu, ou en rater. Toutes
  // les entrées (visible, complet, dates, comparaison, walk-forward) passent par ici.
  endIdx = Math.min(endIdx, candles.length - 2);
  const n = endIdx - startIdx;
  if (n < 20) return { error: 'Pas assez de bougies closes (min 20)' };

  // Pre-compute ALL indicators once for the full range
  // This is safe because the strategy only accesses candles[0..idx] at each step
  const fullIndicators = bot.computeIndicators(candles, endIdx, params);

  // Vues anti look-ahead : un indice > bougie courante lit `null`. L'ancienne version
  // COPIAIT chaque tableau à chaque bougie (arr.map) : O(n²) — 3 000 bougies × 3 000 × 4
  // indicateurs ≈ 36 M d'écritures par backtest, et le walk-forward en lance des dizaines.
  // Une vue Proxy donne la même garantie en O(1) par bougie.
  let cur = startIdx;
  const sliceInd = {};
  for (const [k, arr] of Object.entries(fullIndicators)) {
    if (!arr) continue;
    sliceInd[k] = new Proxy(arr, {
      get(t, p) {
        if (typeof p === 'string' && p.length && p.charCodeAt(0) <= 57 && +p > cur) return null;
        return t[p];
      }
    });
  }

  // Mark initial equity
  equityCurve.push({ idx: startIdx, total: capital, realized: 0, unrealized: 0 });

  for (let i = startIdx; i <= endIdx; i++) {
    cur = i;
    bot.step(candles, i, params, sliceInd);

    const markPrice = candles[i].close;
    equityCurve.push({
      idx: i,
      total: bot.equity(markPrice),
      realized: bot.realizedPnl(),
      unrealized: bot.equity(markPrice) - capital - bot.realizedPnl()
    });
  }

  // Force close remaining positions at last price
  const lastPrice = candles[endIdx].close;
  bot._closeAllLevels({ close: lastPrice });

  // Compute stats
  const trades = bot.trades;
  const winningTrades = trades.filter(t => t.pnl > 0);
  const losingTrades = trades.filter(t => t.pnl < 0);
  const totalPnl = bot.realizedPnl();
  const totalReturn = (totalPnl / capital) * 100;
  const winRate = trades.length > 0 ? (winningTrades.length / trades.length) * 100 : 0;

  // Average win/loss
  const avgWin = winningTrades.length > 0 ? winningTrades.reduce((s, t) => s + t.pnl, 0) / winningTrades.length : 0;
  const avgLoss = losingTrades.length > 0 ? Math.abs(losingTrades.reduce((s, t) => s + t.pnl, 0) / losingTrades.length) : 0;
  const profitFactor = avgLoss > 0 ? (avgWin * winningTrades.length) / (avgLoss * losingTrades.length) : (totalPnl > 0 ? Infinity : 0);

  // Max drawdown from equity curve
  let peak = capital, maxDD = 0, maxDDPct = 0;
  for (const pt of equityCurve) {
    if (pt.total > peak) peak = pt.total;
    const dd = peak - pt.total;
    const ddPct = (dd / peak) * 100;
    if (ddPct > maxDDPct) { maxDDPct = ddPct; maxDD = dd; }
  }

  // Sharpe ratio (simplified: using per-candle returns, annualized)
  let sharpe = 0;
  if (equityCurve.length > 2) {
    const returns = [];
    for (let i = 1; i < equityCurve.length; i++) {
      returns.push((equityCurve[i].total / equityCurve[i - 1].total) - 1);
    }
    const meanRet = returns.reduce((s, r) => s + r, 0) / returns.length;
    const variance = returns.reduce((s, r) => s + (r - meanRet) ** 2, 0) / returns.length;
    const stdDev = Math.sqrt(variance);
    if (stdDev > 0) {
      // Annualize based on candle interval
      const periodsPerYear = chartInterval === '1m' ? 525600 : chartInterval === '5m' ? 105120 :
        chartInterval === '15m' ? 35040 : chartInterval === '1h' ? 8760 :
        chartInterval === '4h' ? 2190 : chartInterval === '1d' ? 365 : 35040;
      sharpe = (meanRet / stdDev) * Math.sqrt(periodsPerYear);
    }
  }

  const result = {
    strategy: strategyKey,
    params: params,
    capital: capital,
    startIdx, endIdx,
    totalPnl, totalReturn,
    tradeCount: trades.length,
    winRate, avgWin, avgLoss,
    profitFactor: profitFactor === Infinity ? '∞' : profitFactor.toFixed(2),
    maxDrawdown: maxDD,
    maxDrawdownPct: maxDDPct,
    sharpe: sharpe.toFixed(3),
    equityCurve: equityCurve,
    trades: trades,
    bot: bot,
    timestamp: Date.now()
  };

  btResult = result;
  btBot = bot;
  return result;
}

// Quick backtest on currently visible candles
function runVisibleBacktest() {
  if (!candles || candles.length < 20) return;
  const vs = Math.max(0, viewStart);
  const ve = Math.min(candles.length - 1, viewEnd);
  const result = runBacktest(btActiveStrategy, candles, vs, ve, btUserParams, btCapital);
  if (!result.error) {
    console.log('Backtest:', result.strategy,
      '| Trades:', result.tradeCount,
      '| P&L:', result.totalPnl.toFixed(2), 'USDT',
      '| Return:', result.totalReturn.toFixed(2) + '%',
      '| Win:', result.winRate.toFixed(1) + '%',
      '| Sharpe:', result.sharpe,
      '| MaxDD:', result.maxDrawdownPct.toFixed(1) + '%',
      '| PF:', result.profitFactor);
    drawChart(); // trigger redraw with markers
  }
  return result;
}

// Run backtest on full candle history
function runFullBacktest() {
  if (!candles || candles.length < 20) return;
  const result = runBacktest(btActiveStrategy, candles, 0, candles.length - 1, btUserParams, btCapital);
  console.log('Full Backtest:', result.strategy,
    '| Range:', candles.length, 'candles',
    '| Trades:', result.tradeCount,
    '| Return:', result.totalReturn.toFixed(2) + '%',
    '| Sharpe:', result.sharpe,
    '| MaxDD:', result.maxDrawdownPct.toFixed(1) + '%');
  return result;
}

// ============ DRAWING ============
// Valeurs de repli seulement : la palette réelle vient des jetons du thème (lireJetons).
const COLORS = {
  ema20: '#eda100', ema50: '#2a78d6', ema100: '#eb6834', ema200: '#4a3aa7', sma20: '#e87ba4', sma50: '#008300',
  bb_upper: '#607d8b', bb_mid: '#607d8b', bb_lower: '#607d8b',
  vwap: '#ff9800', ichi_tenkan: '#2196f3', ichi_kijun: '#e91e63', sar: '#00a5bd',
  rsi: '#8e5bd8', macd: '#d79a00', macd_signal: '#ff6b35',
  stoch_k: '#d79a00', stoch_d: '#ff6b35', atr: '#00a693',
  obv: '#ff9800', mfi: '#9c27b0', williamsR: '#00a5bd', cci: '#ff5722', adx: '#d79a00',
  equity_total: '#e0a800',
  candleUp: '#0d9672', candleDown: '#e5484d', surUp: '#ffffff', surDown: '#ffffff',
  grid: 'rgba(127,127,127,0.12)', text: '#45597a',
  bougieForme: 'pleine', bougieRayon: 2, grilleTirets: []
};
// ─── Crochets du graphique pour les thèmes (lus par lireJetons) ───
// --bougie-forme : la FORME des bougies — jamais leur valeur : ouverture, plus haut, plus bas et
// clôture sont tracés aux mêmes ordonnées quelle que soit la forme. Sous BOUGIE_DENSE_PX de
// largeur de corps, toutes les formes reviennent au corps plein (les barres, au trait seul) : un
// contour ou un tiret de 2 px ne se lit plus. js/fiches.js (fiche « bougies ») lit ces constantes.
// --bougie-rayon : rayon des coins des corps et des barres de volume (0 = angles vifs).
// --grille-tirets : motif de la grille (ex. « 8 3 2 3 », trait mixte) ; « none » = trait plein.
// --police-graphique : famille du texte du canvas (repli : --font).
// --chaleur-bid / --chaleur-ask : encre de la couche « Liquidité » (voir HEAT_RAMPE).
// --up-sur / --down-sur : encre du texte posé SUR une marque de hausse / de baisse (l'étiquette du
// dernier prix) ; blanc par défaut. Un thème dont la hausse est claire (Cyanotype : traits blancs)
// y écrivait du blanc sur du blanc — tests/test_palette.py mesure ce couple.
// Sans ces jetons, le graphique est celui d'avant, au pixel près.
const BOUGIE_DENSE_PX = 4;
const FORMES_BOUGIE = {
  pleine: 'corps pleins, à la couleur de la hausse ou de la baisse',
  'creuse-hausse': 'hausse en corps creux (contour, la mèche s’arrête au corps), baisse en corps plein',
  barre: 'barres OHLC : un trait du plus haut au plus bas, l’ouverture en tiret à gauche, la clôture à droite',
};
// Identité des overlays : chaque ligne porte son étiquette en bout de tracé (et un point dans
// le ruban) — elle ne repose jamais sur la couleur seule. tests/test_palette.py échoue si un
// overlay sous 3:1 sur le fond du graphique n'a pas d'étiquette ici.
// L'étiquette EST la clé (ema20 -> EMA20), dont la période est aussi tirée pour le calcul.
// Gardée littérale : tests/test_palette.py la lit dans la source.
const ETIQ_OVERLAYS = { ema20: 'EMA20', ema50: 'EMA50', ema100: 'EMA100', ema200: 'EMA200', sma20: 'SMA20', sma50: 'SMA50' };
// Une seule famille de caractères pour tout le graphique : celle du thème pour le graphique
// (jeton --police-graphique), à défaut celle de l'interface (--font).
let POLICE_GRAPHIQUE = "'Segoe UI Variable Text','Segoe UI Variable',-apple-system,BlinkMacSystemFont,'SF Pro Text',system-ui,'Segoe UI',Roboto,sans-serif";
function chartFont(px, poids) { return (poids || 500) + ' ' + px + 'px ' + POLICE_GRAPHIQUE; }
// « #rgb », « #rrggbb » ou « rgb(a)(r, g, b…) » → [r, g, b] ; sinon null.
function rvb(c) {
  const h = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((c || '').trim());
  if (h) { const x = h[1].length === 3 ? h[1].replace(/./g, d => d + d) : h[1], n = parseInt(x, 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
  const m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec((c || '').trim());
  return m ? [+m[1] | 0, +m[2] | 0, +m[3] | 0] : null;
}
// Même teinte, autre opacité : « #rrggbb » ou « rgb(a)(…) » → rgba. Sinon, inchangée.
function avecAlpha(c, a) {
  const h = /^#([0-9a-f]{6})$/i.exec(c || '');
  if (h) { const n = parseInt(h[1], 16); return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')'; }
  const m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(c || '');
  return m ? 'rgba(' + m[1] + ',' + m[2] + ',' + m[3] + ',' + a + ')' : c;
}
// Jetons du thème → COLORS. Lu au chargement et à chaque changement de thème — JAMAIS par image :
// un getComputedStyle par image de glissement forçait un recalcul de style 60 fois par seconde.
function lireJetons() {
  const cs = getComputedStyle(document.documentElement);
  const v = (n, d) => ((cs.getPropertyValue(n) || '') + '').trim() || d;
  const num = (n, d) => { const x = parseFloat(v(n, '')); return isFinite(x) ? x : d; };
  for (const k of ['ema20', 'ema50', 'ema100', 'ema200', 'sma20', 'sma50']) COLORS[k] = v('--ov-' + k, COLORS[k]);
  COLORS.bb_upper = COLORS.bb_mid = COLORS.bb_lower = v('--ov-bb', COLORS.bb_mid);
  COLORS.vwap = v('--ov-vwap', COLORS.vwap); COLORS.sar = v('--ov-sar', COLORS.sar);
  COLORS.ichi_tenkan = v('--ov-ichi-t', COLORS.ichi_tenkan); COLORS.ichi_kijun = v('--ov-ichi-k', COLORS.ichi_kijun);
  const S = { rsi: 'rsi', macd: 'macd', macd_signal: 'signal', stoch_k: 'stoch-k', stoch_d: 'stoch-d', atr: 'atr',
              obv: 'obv', mfi: 'mfi', williamsR: 'wr', cci: 'cci', adx: 'adx', equity_total: 'equity' };
  for (const [k, j] of Object.entries(S)) COLORS[k] = v('--s-' + j, COLORS[k]);
  const up = v('--up', COLORS.candleUp), down = v('--down', COLORS.candleDown);
  COLORS.candleUp = up; COLORS.candleDown = down;
  COLORS.adx_plusDI = COLORS.trade_buy = COLORS.grid_buy_filled = COLORS.equity_realized = up;
  COLORS.adx_minusDI = COLORS.trade_sell = down;
  COLORS.grid_buy_pending = avecAlpha(up, 0.5); COLORS.grid_sl = avecAlpha(down, 0.5);
  COLORS.ink1 = v('--ink-1', '#10233d'); COLORS.text = v('--ink-2', '#45597a'); COLORS.ink3 = v('--ink-3', '#5f6e8c');
  COLORS.axis = COLORS.text;
  COLORS.upInk = v('--up-ink', up); COLORS.downInk = v('--down-ink', down);
  COLORS.surUp = v('--up-sur', '#ffffff'); COLORS.surDown = v('--down-sur', '#ffffff');
  COLORS.accent2 = v('--accent-2', '#4f5fe0');
  COLORS.accent = v('--accent', '#0b84b0');   // scénarios du matin : le rang 1
  COLORS.surface = v('--chart-surface', '#f4f6fe');
  COLORS.grid = v('--grille', COLORS.grid);
  COLORS.hairline = v('--hairline', 'rgba(127,127,127,0.18)');
  COLORS.reticule = v('--reticule', 'rgba(127,127,127,0.4)');
  COLORS.bulle = v('--bulle', 'rgba(255,255,255,0.94)');
  COLORS.warn = v('--warn', '#f0a50b');
  COLORS.sess = [v('--sess-asie', 'rgba(255,152,0,0.75)'), v('--sess-europe', 'rgba(33,150,243,0.75)'), v('--sess-us', 'rgba(156,39,176,0.75)')];
  COLORS.sr = [v('--sr-1', '#ce93d8'), v('--sr-2', '#26c6da'), v('--sr-3', '#ffc107')];
  COLORS.scen = scenPalette();
  COLORS.fib = v('--fib', '#f0a50b'); COLORS.vp = v('--vp', '#64b4ff'); COLORS.vpPoc = v('--vp-poc', '#ffc828');
  COLORS.grid_tp = avecAlpha(COLORS.sr[2], 0.6);
  COLORS.filigrane = num('--filigrane', 0.05);
  COLORS.volAlpha = num('--vol-alpha', 0.55);
  COLORS.bandeAlpha = num('--bande-alpha', 0.08);
  COLORS.aura = num('--aura', 0);
  POLICE_GRAPHIQUE = v('--police-graphique', v('--font', POLICE_GRAPHIQUE));
  // Crochets du graphique : défauts = le graphique d'avant.
  const forme = v('--bougie-forme', 'pleine');
  COLORS.bougieForme = Object.prototype.hasOwnProperty.call(FORMES_BOUGIE, forme) ? forme : 'pleine';
  COLORS.bougieRayon = Math.max(0, num('--bougie-rayon', 2));
  const tirets = v('--grille-tirets', 'none');
  COLORS.grilleTirets = tirets === 'none' ? [] : tirets.split(/[\s,]+/).map(Number).filter(x => isFinite(x) && x >= 0);
  const encre = (nom, r) => { const c = rvb(v(nom, '')); return c ? rampeU32(c.concat(CHALEUR_ALPHA.base), [0, 0, 0, CHALEUR_ALPHA.pente]) : rampeU32(r.base, r.pente); };
  HEAT_U32 = { bid: encre('--chaleur-bid', HEAT_RAMPE.bid), ask: encre('--chaleur-ask', HEAT_RAMPE.ask) };
}
// Légende dans le ruban : chaque pastille d'overlay porte le point de la couleur de sa ligne.
const PASTILLES = { ema20: 'ema20', ema50: 'ema50', ema100: 'ema100', ema200: 'ema200', sma20: 'sma20', sma50: 'sma50',
                    bb: 'bb_mid', rsi: 'rsi', macd: 'macd', stoch: 'stoch_k', atr: 'atr' };
function peindrePastilles() {
  for (const [id, k] of Object.entries(PASTILLES)) {
    const el = document.getElementById('lbl_' + id);
    if (el && el.style && el.style.setProperty && COLORS[k]) el.style.setProperty('--dot', COLORS[k]);
  }
}
let jetonsLus = false;

// Disposition verticale du canvas : tracé principal, puis sous-graphes empilés, puis le
// sélecteur de plage (RS_HEIGHT) en bas. Le tracé principal garde MAIN_H_MIN px ; quand le canvas
// est trop bas pour loger les sous-graphes à leur hauteur (subHeights), ils sont réduits
// PROPORTIONNELLEMENT. Avant : mainH bridé à 200 px, les sous-graphes s'empilaient dessous et
// débordaient sur le sélecteur de plage, puis hors du canvas (fenêtre basse). Un sous-graphe
// réduit sous la hauteur utile de resolveSub n'est pas tracé.
const MAIN_H_MIN = 200;
const SUB_ORDRE = ['vol', 'rsi', 'macd', 'stoch', 'atr', 'obv', 'mfi', 'williamsR', 'cci', 'adx', 'ao', 'equity'];
function dispositionGraphique(H) {
  // Débutant : aucun sous-graphe (le choix est gardé pour l'Expert).
  const actifs = debutant() ? [] : SUB_ORDRE.filter(k => activeSubs[k]);
  let total = 0;
  for (const k of actifs) total += subHeights[k] || 80;
  const dispo = H - 4 - RS_HEIGHT;
  const mainH = Math.max(Math.min(MAIN_H_MIN, dispo), dispo - total);
  const k = total > 0 ? Math.min(1, Math.max(0, dispo - mainH) / total) : 1;
  let y = mainH + 4;
  const sous = actifs.map(cle => { const h = (subHeights[cle] || 80) * k, s = { cle, y, h }; y += h; return s; });
  return { mainH, sous };
}

// ─── Deux canvas : le GRAPHIQUE et son CALQUE ───────────────────────────────
// Le graphique (#chart) ne se redessine que quand la donnée ou la vue change ; le calque
// (#chartCalque, transparent au pointeur, posé dessus) porte ce qui bouge sans elles : réticule,
// infobulle, badges des sous-graphes, et l'étiquette + la ligne du DERNIER PRIX. Avant, chaque
// mouvement de souris redessinait tout le graphique (9,8 ms de thread principal par image,
// 4,1 avec un calque, mesuré), et l'étiquette de prix ne suivait le prix qu'au redessin des
// bougies : jusqu'à 5 s de retard sur l'en-tête. Elle suit maintenant le prix à la seconde.
const GRILLE_N = 6;          // lignes de grille du tracé principal (et libellés d'axe)
let geo = null, geoPrix = null;   // géométrie du dernier dessin du graphique, relue par le calque
/** Libellés d'axe recouverts par l'étiquette du prix `prix` (masque de bits, 0 = aucun). */
function masqueEtiquettes(prix, top, ph, minP, maxP, range) {
  if (!prix || prix < minP || prix > maxP) return 0;
  const yTag = top + ph * (1 - (prix - minP) / range);
  let m = 0;
  for (let i = 0; i <= GRILLE_N; i++) if (Math.abs(top + (ph / GRILLE_N) * i - yTag) < 15) m |= 1 << i;
  return m;
}
function drawChart() {
  scaleSeq++;   // une frame = un calcul d'échelle : invalide le cache de priceWindow()
  const W = canvas.width / window.devicePixelRatio;
  const H = canvas.height / window.devicePixelRatio;
  // Palette : jetons du thème, lus UNE fois (lireJetons) — pas un getComputedStyle par image.
  if (!jetonsLus) { lireJetons(); jetonsLus = true; }
  geo = null; geoPrix = null; guideEtat = null; scenEtat = null;
  
  ctx.clearRect(0, 0, W, H);
  if (candles.length < 2) {
    ctx.save(); ctx.fillStyle = COLORS.ink3 || '#5f6e8c'; ctx.font = chartFont(12, 600); ctx.textAlign = 'center';
    ctx.fillText(debutant() ? 'Chargement ' + (NOMS_PAIRES[activeSymbol] || activeSymbol) + ' · ' + Guide.nomIntervalle(chartInterval) + '…' : 'Chargement ' + activeSymbol + ' · ' + chartInterval + '…', (W - 50) / 2, H / 2); ctx.restore();
    dessinerCalque();
    return;
  }
  // La vue approche du début de l'historique chargé : les pages plus anciennes, maintenant.
  if (viewStart < HISTORIQUE_BORD) {
    const k = getKlineCacheKey(activeSymbol, chartInterval);
    if (klineCache[k] && klineCache[k].partiel) completerHistorique(k, activeSymbol, chartInterval);
  }
  
  // Tracé principal et sous-graphes : hauteurs calculées en un seul endroit (dispositionGraphique).
  const dispo = dispositionGraphique(H), mainH = dispo.mainH;
  
  // Filigrane : paire + intervalle, graisse fine, espacé — une signature, pas un tampon.
  ctx.save();
  ctx.globalAlpha = COLORS.filigrane;
  ctx.fillStyle = COLORS.ink1;
  // Taille bridée au tracé disponible : à 64 px fixes le filigrane débordait du graphe
  // sur téléphone et se faisait rogner par le bord gauche.
  // Débutant : la paire et l'intervalle en mots (« BTC/USDT · 15 min »).
  const deb = debutant();
  const filigrane = deb ? (NOMS_PAIRES[activeSymbol] || activeSymbol) + '  ·  ' + Guide.nomIntervalle(chartInterval) : activeSymbol + '  ·  ' + chartInterval;
  ctx.font = chartFont(Math.min(40, Math.round((W - 16 - 75) / (filigrane.length * 0.9))), 300);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '4px';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(filigrane, (W - 50) / 2, mainH / 2);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  ctx.restore();

  etiquettesPosees = []; etiquettesAFaire = [];
  debEtat = deb ? { items: [] } : null;
  resolveChart(candles, 16, 75, mainH, W);
  ctx.save(); etiquettesAFaire.forEach(f => f()); ctx.restore();
  etiquettesAFaire = [];
  // Débutant : l'astuce (une seule fois), posée hors des étiquettes.
  if (deb) { astuceMontrer(); astucePlacer(); }

  // Compteur bougies visibles + plage dates + % variation (Expert : en Débutant, la variation de
  // la vue contredirait celle de l'en-tête, et le régime est le verbe de la phrase).
  const vsC = Math.max(0, viewStart), veC = Math.min(candles.length, viewEnd);
  if (!deb) {
  ctx.fillStyle = COLORS.text; ctx.font = chartFont(10);
  const firstC = candles[vsC], lastC = candles[Math.max(0, veC - 1)];
  const pctChange = firstC && lastC ? ((lastC.close - firstC.close) / firstC.close * 100) : 0;
  const pctStr = pctChange >= 0 ? '+' + pctChange.toFixed(2) + '%' : pctChange.toFixed(2) + '%';
  const pctColor = pctChange >= 0 ? COLORS.upInk : COLORS.downInk;
  const fmtDate = ts => {
    const d = new Date(ts * 1000);
    return FMT_D2.format(d) + ' ' + FMT_HM.format(d);
  };
  const rangeStr = firstC ? fmtDate(firstC.time) + ' → ' + fmtDate(lastC.time) : '';
  ctx.fillStyle = COLORS.ink3;
  ctx.fillText(`${veC - vsC}/${candles.length} · ${rangeStr}`, 18, 13);
  // Variation de la vue : une pastille teintée, texte à l'encre signée (lisible), pas la marque.
  ctx.font = chartFont(10, 650);
  const pw0 = ctx.measureText(pctStr).width + 12;
  ctx.save(); ctx.globalAlpha = 0.14; ctx.fillStyle = pctChange >= 0 ? COLORS.candleUp : COLORS.candleDown;
  ctx.beginPath(); ctx.roundRect(16, 19, pw0, 15, 7.5); ctx.fill(); ctx.restore();
  ctx.fillStyle = pctColor;
  ctx.fillText(pctStr, 22, 30);
  // Guide : le régime du marché, à droite de la pastille (rangée du haut).
  if (guideEtat) guideRegimeBadge(guideEtat, 16 + pw0 + 8, W);
  }
  
  // Empiler les sous-graphes
  for (const s of dispo.sous) s.trace = resolveSub(candles, s.y, s.h, W, s.cle) !== false;

  // Range Selector — mini timeline en bas
  if (candles.length > 5) {
    drawRangeSelector(candles, W, H);
  }
  geo = { W, H, mainH, sous: dispo.sous, vs: vsC, ve: veC };
  dessinerCalque();
}

/** Le calque : étiquette et ligne du dernier prix, réticule et infobulles. Relit la géométrie
 *  du dernier dessin du graphique (geo, geoPrix) : il ne recalcule ni échelle ni indicateur. */
function dessinerCalque() {
  calqueDemande = false;
  if (!cx) return;
  const dpr = window.devicePixelRatio;
  cx.clearRect(0, 0, calque.width / dpr, calque.height / dpr);
  if (!geo) return;
  const { W, H, mainH } = geo;
  const P = geoPrix, deb = debutant();
  // Débutant : un seul format de prix sur l'écran (« 82 442 $ ») ; Expert : « $82442.00 ».
  const prixAxe = v => (deb ? Guide.prix(v, guideUnite()) : '$' + fmtPrix(v));
  if (P) {
    const { top, ph, left, right, minP, maxP, range } = P;
    // Libellés de l'axe des prix ; celui que l'étiquette du dernier prix recouvrirait est omis.
    const masque = masqueEtiquettes(livePrice, top, ph, minP, maxP, range);
    cx.fillStyle = COLORS.axis || COLORS.text;
    cx.font = chartFont(11);
    for (let i = 0; i <= GRILLE_N; i++) {
      if (masque & (1 << i)) continue;
      cx.fillText(prixAxe(maxP - (range / GRILLE_N) * i), W - right + 3, top + (ph / GRILLE_N) * i + 3);
    }
    // Dernier prix : la ligne (un trait large et pâle sous un pointillé : elle se trouve d'un
    // coup d'œil) et l'étiquette sur l'axe, à la couleur de la bougie EN COURS — l'étiquette dit
    // aussi le sens du moment.
    if (livePrice && livePrice >= minP && livePrice <= maxP) {
      const y = top + ph * (1 - (livePrice - minP) / range);
      const enCours = candles[candles.length - 1];
      const baisse = !!enCours && livePrice < enCours.open;
      const tagC = baisse ? COLORS.candleDown : COLORS.candleUp;
      cx.save();
      cx.strokeStyle = tagC;
      cx.globalAlpha = 0.14; cx.lineWidth = 4;
      cx.beginPath(); cx.moveTo(left, y); cx.lineTo(W - right, y); cx.stroke();
      cx.globalAlpha = 0.75; cx.lineWidth = 1; cx.setLineDash([2, 4]);
      cx.beginPath(); cx.moveTo(left, y); cx.lineTo(W - right, y); cx.stroke();
      cx.restore();
      // pad.right = 75 px pour un libellé de 76 px : le badge sortait du canvas (« $77085.0(| ») ;
      // on le recale vers la gauche au lieu d'élargir la colonne (13 sites couplés au sélecteur
      // de plage et au repérage de la souris). Opaque, et le libellé d'axe qu'il recouvrirait est
      // omis (masqueEtiquettes, ci-dessus).
      const triX = W - right + 2, lpStr = prixAxe(livePrice);
      cx.font = chartFont(11, 700);
      const lw = cx.measureText(lpStr).width + 12, bx = Math.min(triX + 10, W - 3 - lw);
      cx.fillStyle = tagC;
      cx.beginPath(); cx.roundRect(bx, y - 11, lw, 22, 11); cx.fill();
      // Pointe vers le tracé : elle reste visible si le badge a reculé
      cx.beginPath(); cx.moveTo(triX, y - 4); cx.lineTo(triX + 8, y); cx.lineTo(triX, y + 4); cx.closePath(); cx.fill();
      cx.fillStyle = baisse ? COLORS.surDown : COLORS.surUp;   // --up-sur / --down-sur
      cx.fillText(lpStr, bx + 6, y + 4);
    }
  }
  // Âge de la couche « Liquidité » (heatmap.json, publiée au quart d'heure) : aucun calque n'est
  // lu sans son instant — DEUX ici : la dernière colonne (son début : l'instantané a été lu dans
  // la minute qui suit, l'âge dit n'est jamais plus jeune que le vrai) et la publication.
  // Sur le calque, il avance avec l'horloge du prix (minuteCalque), sans redessin.
  if (P && overlays.liq && !deb && histHeatmap && histHeatmap.grille && histHeatmap.sym === activeSymbol && histHeatmap.majA) {
    cx.save();
    cx.font = chartFont(9, 650); cx.textAlign = 'right';
    cx.fillStyle = texteAgeCouche().vieux ? COLORS.warn : COLORS.ink3;
    cx.fillText(texteAgeCouche().texte, W - P.right - 8, 13);
    cx.restore();
  }
  // Repère de la publication (market-data.json) : un trait vertical pointillé à `updated`, un
  // point au prix publié. JAMAIS relié à la ligne de prix : c'est un relevé daté, pas un tracé —
  // l'écart entre ce point et la bougie dit ce que la publication ne sait pas encore.
  const rep = P && !deb && reperePublication(P);
  if (rep) {
    cx.save();
    cx.strokeStyle = COLORS.ink3; cx.lineWidth = 1; cx.setLineDash([3, 3]);
    cx.beginPath(); cx.moveTo(rep.x, P.top); cx.lineTo(rep.x, P.top + P.ph); cx.stroke();
    cx.setLineDash([]);
    if (rep.y !== null) {
      cx.fillStyle = COLORS.ink1; cx.strokeStyle = COLORS.surface; cx.lineWidth = 1.5;
      cx.beginPath(); cx.arc(rep.x, rep.y, 3.5, 0, Math.PI * 2); cx.fill(); cx.stroke();
    }
    cx.font = chartFont(9, 650); cx.fillStyle = COLORS.ink3;
    const lw = cx.measureText(rep.texte).width;
    cx.fillText(rep.texte, texteRepere(rep, P, lw), P.top + P.ph - 12);
    cx.restore();
  }
  // Guide : état de chaque niveau au prix LIVE, lecture du moment (relus, pas recalculés).
  if (guideEtat) guideCalque();
  // Scénarios du matin : l'encadré (relu, pas recalculé).
  if (scenEtat) scenCalque();
  if (crossX === null || crossY === null) return;
  // x → indice : le pas des bougies (pasBougie), et la bougie dont le CRÉNEAU contient le
  // curseur [x, x + pas[ — l'arrondi d'avant désignait la voisine sur la moitié droite du créneau.
  const n = geo.ve - geo.vs, pasC = pasBougie(W - 16 - 75, n);
  const idx = n > 0 && crossX >= 16 ? Math.floor((crossX - 16) / pasC) : -1;
  // --- Réticule du tracé principal ---
  let bulleOHLCV = null;
  // Débutant : une ÉTIQUETTE sous le curseur → sa bulle seule, sans réticule ni infobulle des prix
  // (la bulle prend leur place). Sur une bande, une zone ou un tracé, le réticule et les quatre
  // valeurs de la bougie restent (les bougies récentes sont souvent dans une bande) ; la bulle se
  // pose à côté, comme en Expert.
  const cibleDeb = deb && crossY < mainH && P && (guideEtat || scenEtat) ? guideCibleSous(crossX, crossY, mainH, true) : null;
  if (cibleDeb) {
    if (guideEtat) guideEtat.survol = null;
    if (scenEtat) { scenEtat.survol = null; scenEtat.bulle = null; }
    scenSurvolDebutant(cibleDeb);
    guideBulle(cibleDeb, W, mainH, null);
  } else if (crossY < mainH && P) {
    cx.strokeStyle = COLORS.reticule;
    cx.lineWidth = 1; cx.setLineDash([3, 3]);
    cx.beginPath(); cx.moveTo(crossX, 0); cx.lineTo(crossX, mainH); cx.stroke();
    // Horizontale : s'arrête avant la colonne des prix
    cx.beginPath(); cx.moveTo(16, crossY); cx.lineTo(W - 75, crossY); cx.stroke();
    cx.setLineDash([]);
    // Prix sous le curseur : l'échelle du dernier dessin (geoPrix), pas une formule recopiée.
    const priceAtCursor = P.maxP - ((crossY - P.top) / P.ph) * P.range;
    const priceStr = prixAxe(priceAtCursor);
    cx.font = chartFont(11, 650);
    const bw = cx.measureText(priceStr).width + 14;
    const bX = W - 75 + (75 - bw) / 2;
    const bY = Math.max(2, Math.min(mainH - 20, crossY - 9));
    cx.fillStyle = COLORS.ink1;
    cx.beginPath(); cx.roundRect(bX, bY, bw, 18, 9); cx.fill();
    cx.fillStyle = COLORS.surface;
    cx.fillText(priceStr, bX + 7, bY + 13);
    // Débutant : quatre lignes en mots (« Début 82 430 $ », « Haut », « Bas », « Fin »).
    if (deb && idx >= 0 && idx < n) {
      const candle = candles[geo.vs + idx];
      const onRight = crossX > W / 2;
      const tX = onRight ? Math.max(16, crossX - 145) : Math.min(W - 160, crossX + 12);
      const tY = Math.max(30, Math.min(mainH - 103, crossY - 65));
      cx.save();
      cx.fillStyle = COLORS.bulle;
      cx.shadowColor = 'rgba(16,35,61,0.18)'; cx.shadowBlur = 14; cx.shadowOffsetY = 4;
      cx.beginPath(); cx.roundRect(tX, tY, 135, 90, 10); cx.fill();
      cx.shadowColor = 'transparent'; cx.shadowBlur = 0; cx.shadowOffsetY = 0;
      cx.fillStyle = candle.close >= candle.open ? COLORS.candleUp : COLORS.candleDown; cx.beginPath(); cx.roundRect(tX + 6, tY + 10, 3, 70, 1.5); cx.fill();
      cx.font = chartFont(10, 600);
      [['Début', candle.open], ['Haut', candle.high], ['Bas', candle.low], ['Fin', candle.close]].forEach(([m, v], k) => {
        cx.fillStyle = COLORS.ink3; cx.fillText(m, tX + 16, tY + 22 + k * 18);
        cx.fillStyle = COLORS.ink1; cx.fillText(prixAxe(v), tX + 58, tY + 22 + k * 18);
      });
      cx.restore();
      bulleOHLCV = { x: tX, y: tY, w: 135, h: 90 };
    } else if (idx >= 0 && idx < n) {
    // Infobulle OHLCV — 2 colonnes
      const candle = candles[geo.vs + idx];
      const cColor = candle.close >= candle.open ? COLORS.candleUp : COLORS.candleDown;
      const onRight = crossX > W / 2;
      const tX = onRight ? Math.max(16, crossX - 145) : Math.min(W - 160, crossX + 12);
      const tY = Math.max(30, Math.min(mainH - 85, crossY - 65));
      cx.save();
      cx.fillStyle = COLORS.bulle;
      cx.shadowColor = 'rgba(16,35,61,0.18)'; cx.shadowBlur = 14; cx.shadowOffsetY = 4;
      cx.beginPath(); cx.roundRect(tX, tY, 135, 72, 10); cx.fill();
      cx.shadowColor = 'transparent'; cx.shadowBlur = 0; cx.shadowOffsetY = 0;
      // Filet de la couleur de la bougie à gauche : la direction se lit sans encadrer la donnée.
      cx.fillStyle = cColor; cx.beginPath(); cx.roundRect(tX + 6, tY + 10, 3, 52, 1.5); cx.fill();
      cx.fillStyle = COLORS.ink1; cx.font = chartFont(10, 600);
      cx.fillText('O ' + fmtPrix(candle.open), tX + 16, tY + 20);
      cx.fillText('H ' + fmtPrix(candle.high), tX + 76, tY + 20);
      cx.fillText('L ' + fmtPrix(candle.low), tX + 16, tY + 38);
      cx.fillText('C ' + fmtPrix(candle.close), tX + 76, tY + 38);
      const volStr = candle.volume >= 1000 ? (candle.volume / 1000).toFixed(1) + 'K' : candle.volume.toFixed(0);
      cx.fillStyle = COLORS.ink3;
      cx.fillText('Volume ' + volStr, tX + 16, tY + 57);
      cx.restore();
      bulleOHLCV = { x: tX, y: tY, w: 135, h: 72 };
    }
    // Guide et scénarios : ce que désigne le curseur (bande, forme, chemin, régime, zone,
    // encadré), expliqué sur le calque.
    if (guideEtat || scenEtat) guideSurvol(W, mainH, bulleOHLCV);
  }
  // --- Réticule des sous-graphes : une verticale à travers eux, la valeur de chacun ---
  if (crossY > mainH && idx >= 0 && idx < n) {
    const realIdx = geo.vs + idx;
    cx.strokeStyle = COLORS.reticule;
    cx.lineWidth = 0.5;
    cx.beginPath(); cx.moveTo(crossX, mainH + 2); cx.lineTo(crossX, H - RS_HEIGHT); cx.stroke();
    for (const { cle: key, y: sY, trace } of geo.sous) {
      if (!trace) continue;   // trop réduit pour être tracé : pas de badge orphelin
      const val = getSubIndicatorValue(key, realIdx);
      if (val !== null) {
        const txt = subLabel(key) + ' ' + val;
        cx.font = chartFont(9);
        const tw = cx.measureText(txt).width + 12;
        const tx = W - 75 + (75 - tw) / 2;
        const ty = sY + 4;
        cx.fillStyle = COLORS.bulle;
        cx.strokeStyle = subColor(key); cx.lineWidth = 0.8;
        cx.beginPath(); cx.roundRect(tx, ty, tw, 15, 3); cx.fill(); cx.stroke();
        cx.fillStyle = COLORS.text;
        cx.fillText(txt, tx + 6, ty + 11);
      }
    }
  }
}
/** Âge de la couche « Liquidité » : « Carte publiée · dernière colonne il y a X · publiée il y a Y ». */
function texteAgeCouche() {
  const h = histHeatmap, g = h && h.grille, t = Horloges.maintenant();
  if (!g || !h.majA) return { texte: '', vieux: false };
  const derniere = (g.t0 + (g.W - 1) * g.dt) * 1000;
  return { texte: 'Carte publiée · dernière colonne ' + Horloges.texteAge(t - derniere) + ' · publiée ' + Horloges.texteAge(t - h.majA),
    vieux: (t - h.majA) / 60000 > CADENCES.vieux_min };
}
/** Le repère de la publication dans la géométrie P du dernier dessin : { x, y, texte } ou null
 *  (autre paire que celle du fichier, ou instant hors de la vue). Le prix publié est celui de
 *  BTCUSDT : sur une autre paire, il n'a pas de place. */
function reperePublication(P) {
  const d = marketData, sym = 'BTCUSDT';
  if (!d || activeSymbol !== sym || !d.btc || !isNum(d.btc.price) || !(P.pas > 0)) return null;
  const tu = Date.parse(d.updated);
  if (!isFinite(tu)) return null;
  const x = P.left + (tu / 1000 - P.t0) / P.pas * P.gap;
  if (x < P.left || x > P.W - P.right) return null;
  const px = d.btc.price, y = px >= P.minP && px <= P.maxP ? P.top + P.ph * (1 - (px - P.minP) / P.range) : null;
  const hm = new Date(tu).toISOString().slice(11, 16);
  return { x, y, texte: 'fichier ' + hm + ' UTC · prix publié ' + Math.round(px).toLocaleString('fr-FR') + ' (' + Horloges.texteAge(Horloges.maintenant() - tu) + ')' };
}
// Le calque, à la prochaine image (une seule par image, quel que soit le nombre d'événements).
let calqueDemande = false;
function scheduleCalque() {
  if (calqueDemande) return;
  calqueDemande = true;
  requestAnimationFrame(() => { if (calqueDemande) dessinerCalque(); });
}
/** Le prix a changé : l'étiquette du calque le suit — le calque seul est redessiné. */
function prixSurGraphique() { if (geoPrix) dessinerCalque(); }

// ============ RANGE SELECTOR ============
function drawRangeSelector(candles, W, H) {
  const rsY = H - RS_HEIGHT;
  const padL = 16, padR = 75;
  const rsw = W - padL - padR;
  const rsh = RS_HEIGHT - 8;
  if (rsw < 20 || candles.length < 2) return;
  
  // Fond
  ctx.fillStyle = avecAlpha(COLORS.surface, 0.7);
  ctx.strokeStyle = COLORS.hairline;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(padL, rsY + 2, rsw, RS_HEIGHT - 6, 5); ctx.fill(); ctx.stroke();
  
  // Mini courbe des 3000 clôtures : tracée UNE fois par état des données et par taille
  // (Path2D mémorisé), puis rejouée — elle était recalculée point par point à chaque image.
  const toX = (i) => padL + (i / Math.max(1, candles.length - 1)) * rsw;
  const mini = memoized('rs_' + Math.round(W) + 'x' + Math.round(H), () => {
    const closes = cols().close;
    let lo = Infinity, hi = -Infinity;
    for (const v of closes) { if (v < lo) lo = v; if (v > hi) hi = v; }
    const rng = hi - lo || 1;
    const toY = (v) => rsY + rsh + 2 - ((v - lo) / rng) * (rsh - 4);
    const ligne = new Path2D(), aire = new Path2D();
    aire.moveTo(padL, rsY + rsh + 2);
    for (let i = 0; i < closes.length; i++) {
      const x = toX(i), y = toY(closes[i]);
      aire.lineTo(x, y);
      i === 0 ? ligne.moveTo(x, y) : ligne.lineTo(x, y);
    }
    aire.lineTo(W - padR, rsY + rsh + 2); aire.closePath();
    return { ligne, aire };
  });
  ctx.save(); ctx.globalAlpha = 0.16; ctx.fillStyle = COLORS.accent2; ctx.fill(mini.aire); ctx.restore();
  ctx.strokeStyle = COLORS.accent2; ctx.lineWidth = 1.2; ctx.stroke(mini.ligne);
  
  // Viewport rectangle
  const vs = Math.max(0, viewStart), ve = Math.min(candles.length, viewEnd);
  const vx1 = toX(vs), vx2 = toX(Math.min(ve - 1, candles.length - 1));
  const vrX = Math.max(padL, vx1), vrW = Math.max(12, Math.min(rsw - (vrX - padL), vx2 - vrX));
  
  // Ombre du viewport
  ctx.fillStyle = avecAlpha(COLORS.ink1, 0.1);
  ctx.fillRect(vrX, rsY + 2, vrW, RS_HEIGHT - 6);
  
  // Bordure viewport
  ctx.strokeStyle = avecAlpha(COLORS.ink1, 0.45);
  ctx.lineWidth = 1.5;
  ctx.strokeRect(vrX, rsY + 2, vrW, RS_HEIGHT - 6);
  
  // Poignées gauche/droite
  const handleW = 4;
  ctx.fillStyle = COLORS.ink1;
  ctx.fillRect(vrX - 1, rsY + 4, handleW, RS_HEIGHT - 14);
  ctx.fillRect(vrX + vrW - 3, rsY + 4, handleW, RS_HEIGHT - 14);
  
  // Débutant : la navigation seule (ni compteurs ni légende des sessions).
  if (debutant()) return;
  // Compteur bougies sur le RS
  ctx.fillStyle = COLORS.text; ctx.font = chartFont(8);
  ctx.fillText(candles.length + ' bougies', padL + 4, rsY + 12);
  
  // Label viewport
  const vpLabel = (ve - vs) + '/' + candles.length;
  ctx.fillText(vpLabel, vrX + Math.max(0, vrW / 2 - 15), rsY + 12);
  
  // Légende sessions — fond opaque, droite du RS
  const sesColors = [
    { label: 'Asie', color: COLORS.sess[0], hours: '00-09' },
    { label: 'Europe', color: COLORS.sess[1], hours: '07-16' },
    { label: 'US', color: COLORS.sess[2], hours: '13-21' }
  ];
  const legW = 130, legH = 14;
  const legX = W - padR - legW - 2, legY = rsY + 4;
  ctx.fillStyle = COLORS.bulle;
  ctx.strokeStyle = COLORS.hairline;
  ctx.lineWidth = 0.5;
  ctx.beginPath(); ctx.roundRect(legX, legY, legW, legH, 3); ctx.fill(); ctx.stroke();
  ctx.font = chartFont(7, 650);
  sesColors.forEach((s, i) => {
    const sx = legX + 4 + i * 42;
    ctx.fillStyle = s.color;
    ctx.fillRect(sx, legY + 2, 9, 10);
    ctx.fillStyle = COLORS.ink1;
    ctx.fillText(s.label, sx + 11, legY + 11);
  });
}

// Formateurs Intl créés UNE fois : `toLocaleXString(locale, options)` reconstruit un
// formatter à chaque appel — 7 à 10 % des échantillons du profileur selon l'état
// (libellés d'axe + plage datée, plusieurs fois par frame).
const FMT_D2 = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit' });
const FMT_HM = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

// Échelle de prix d'une fenêtre [vs,ve) — SOURCE UNIQUE. resolveChart l'applique, le
// crosshair la relit dans la MÊME frame (avant : formule recopiée ⇒ un slice, deux spreads
// de 2×N éléments et un calcBollinger de plus par frame de survol). Le cache porte le
// numéro de frame : priceScale / pricePan / Bollinger ne peuvent pas le périmer.
let scaleSeq = 0, lastScale = null;
// ─── Marge de « futur » (Guide) : la SEULE conversion indice → x quand le Guide est affiché ───
// Les bougies n'occupent plus toute la largeur du tracé : à droite de la dernière, une marge
// (PARAM.guide.futur, bornée en px) reçoit les chemins conditionnels du Guide. Le tracé
// principal, les sous-graphes, la couche de chaleur, le réticule et l'infobulle lisent TOUS
// leur pas ici — une seule formule, donc des bougies, un réticule et une chaleur alignés.
// Guide masqué : marge nulle, le pas d'avant (pw / n) au pixel près.
// Vue qui a quitté la dernière bougie de k bougies : la marge se referme de k pas (le pas de la
// vue collée à la fin) — un glissement d'une bougie change le pas de 1/n au plus, jamais d'un
// coup ; au-delà, marge nulle (une marge vide après le passé se lirait comme un trou).
function margeFutur(pw, n) {
  // Les scénarios du matin dessinent aussi leurs flèches dans cette marge (Guide masqué compris).
  // Débutant : seulement si la flèche du scénario 1 s'y dessine (le Guide n'y pose rien).
  if (!((overlays.guide && !debutant()) || scenFleches()) || candles.length < 2 * PARAM.guide.atrPeriode + 2) return 0;
  const g = PARAM.guide;
  const M = Math.min(pw * g.futurMaxFraction, Math.max(g.futurMinPx, Math.min(g.futurMaxPx, pw * g.futur)));
  const k = Math.max(0, candles.length - viewEnd);
  if (!k) return M;
  return Math.max(0, M - k * (pw - M) / Math.max(1, n || (viewEnd - viewStart)));
}
function pasBougie(pw, n) { return (pw - margeFutur(pw, n)) / Math.max(1, n); }
function priceWindow(vs, ve) {
  const s = lastScale;
  const deb = debutant();
  if (s && s.seq === scaleSeq && s.vs === vs && s.ve === ve && s.deb === deb) return s;
  let minP = Infinity, maxP = -Infinity;
  for (let i = vs; i < ve; i++) { const c = candles[i]; if (c.high > maxP) maxP = c.high; if (c.low < minP) minP = c.low; }
  // Débutant : la ligne qui valide la figure montrée entre dans l'échelle (Guide, amendement C5).
  if (deb) { const fx = guideEchelleDebutant(vs, ve), r0 = maxP - minP; if (fx) { maxP = Math.max(maxP, Math.min(fx[1], maxP + r0 / 2)); minP = Math.min(minP, Math.max(fx[0], minP - r0 / 2)); } }
  const naturalRange = maxP - minP || 1, rawMin = minP, rawMax = maxP;
  // Débutant : un peu de place au-dessus et au-dessous des bougies, pour que le libellé du repère
  // du haut tienne AU-DESSUS du prix (et celui du bas au-dessous) même quand le prix est au bord.
  if (deb) { maxP += naturalRange * PARAM.guide.debutant.marge; minP -= naturalRange * PARAM.guide.debutant.marge; }
  // Étendre si Bollinger actif, mais cap à ±15% du range naturel
  if (overlays.bb && !debutant() && candles.length >= 20) {
    const bb = memoized('bb', calcBollinger, cols().close, PARAM.bb.periode, PARAM.bb.ecarts);
    for (let i = vs; i < ve; i++) {
      if (bb.upper[i] === null) continue;
      if (bb.upper[i] > maxP) maxP = bb.upper[i];
      if (bb.lower[i] < minP) minP = bb.lower[i];
    }
    const maxExt = naturalRange * 0.15;
    maxP = Math.min(maxP, rawMax + maxExt);
    minP = Math.max(minP, rawMin - maxExt);
  }
  // Scénarios du matin : la 1re zone et l'invalidation du rang 1 entrent dans l'échelle, bornées
  // à PARAM.scenarios.echelleMax fois l'amplitude des bougies visibles de chaque côté.
  const ext = scenEchelle(vs, ve);
  if (ext) {
    const maxExt = naturalRange * PARAM.scenarios.echelleMax;
    maxP = Math.max(maxP, Math.min(ext[1], rawMax + maxExt));
    minP = Math.min(minP, Math.max(ext[0], rawMin - maxExt));
  }
  // Échelle verticale manuelle (molette / glisser sur l'axe)
  const midP = (maxP + minP) / 2, halfRange = ((maxP - minP) / 2) * priceScale;
  minP = midP - halfRange + pricePan * naturalRange;
  maxP = midP + halfRange + pricePan * naturalRange;
  return (lastScale = { seq: scaleSeq, vs, ve, deb, minP, maxP, range: maxP - minP || 1 });
}

function resolveChart(candles, padL, padR, chartH, W) {
  // Guide affiché : le haut du tracé est réservé à ses rangées (badge du régime, lecture du
  // moment) — les bougies ne passent plus dessous. Toutes les conversions lisent pad.top (geoPrix).
  const deb = debutant();
  // Débutant : les rangées de la phrase et de la ligne des scénarios (debHaut).
  const pad = { left: padL, right: padR, top: 10 + (deb ? debHaut(W, padL, padR) : overlays.guide ? guideHaut(W, padL, padR) : 0), bottom: 20 };
  // Les couches d'analyse : Expert seulement (le choix reste gardé pour lui).
  const ov = k => overlays[k] && !deb;
  const pw = W - pad.left - pad.right;
  const ph = chartH - pad.top - pad.bottom;
  if (ph < 30) return;
  scenLargeur = pw;

  // Viewport
  const vs = Math.max(0, viewStart);
  const ve = Math.min(candles.length, viewEnd);
  const visible = candles.slice(vs, ve);
  if (visible.length < 2) return;
  
  // Échelle de prix : calculée (et mémorisée pour le crosshair) par priceWindow().
  const { minP, maxP, range } = priceWindow(vs, ve);
  // closes n'est construit QUE si un overlay le demande (3000 éléments par frame sinon) :
  // les seuls lecteurs sont bb, ema/sma, vwap, ichimoku et sar, tous sous ces drapeaux.
  const closes = cols().close;   // mémorisé : gratuit d'une image à l'autre
  
  const gap = pasBougie(pw, visible.length);
  const candleW = Math.max(1, Math.min(40, gap * 0.8));
  
  // Sessions (UTC) : voile imperceptible + BANDEAU FIN de 6 px (règle temporelle).
  const sessionDefs = [
    { start: 0, end: 9, veil: avecAlpha(COLORS.sess[0], 0.013), bar: COLORS.sess[0], label: 'Asie' },
    { start: 7, end: 16, veil: avecAlpha(COLORS.sess[1], 0.013), bar: COLORS.sess[1], label: 'Europe' },
    { start: 13, end: 21, veil: avecAlpha(COLORS.sess[2], 0.013), bar: COLORS.sess[2], label: 'US' }
  ];
  const SESS_H = 6;  // hauteur du bandeau, en px
  for (const s of deb ? [] : sessionDefs) {
    // Trouver le début/fin de chaque bloc de session dans les bougies visibles
    let blockStart = -1;
    for (let i = vs; i < ve; i++) {
      // Heure UTC sans allouer un Date par bougie et par session (3×N objets par frame)
      const h = Math.floor(candles[Math.min(i, candles.length - 1)].time / 3600) % 24;
      const inSession = h >= s.start && h < s.end;
      if (inSession && blockStart === -1) blockStart = i;
      if (!inSession && blockStart !== -1) {
        const x1 = pad.left + gap * (blockStart - vs);
        const x2 = pad.left + gap * (i - vs) + gap / 2;
        ctx.fillStyle = s.veil;
        ctx.fillRect(x1, pad.top, x2 - x1, ph);
        ctx.fillStyle = s.bar;
        ctx.fillRect(x1, pad.top + ph - SESS_H, x2 - x1 - 1, SESS_H);
        blockStart = -1;
      }
    }
    if (blockStart !== -1) {
      // Jusqu'à la fin de la dernière bougie : la marge du Guide (futur) n'a pas de session.
      const x1 = pad.left + gap * (blockStart - vs), x2 = Math.min(W - pad.right, pad.left + gap * visible.length);
      ctx.fillStyle = s.veil;
      ctx.fillRect(x1, pad.top, x2 - x1, ph);
      ctx.fillStyle = s.bar;
      ctx.fillRect(x1, pad.top + ph - SESS_H, x2 - x1, SESS_H);
    }
  }
  
  // Grid — motif du thème (--grille-tirets), plein par défaut ; rendu au plein après la boucle.
  ctx.strokeStyle = COLORS.grid; ctx.lineWidth = 0.5;
  ctx.setLineDash(COLORS.grilleTirets);
  const gridN = GRILLE_N;
  // Les LIBELLÉS de l'axe sont sur le calque (dessinerCalque) : celui que l'étiquette du dernier
  // prix recouvrirait y est omis, et le prix bouge chaque seconde — le graphique n'a pas à suivre.
  // t0 / pas / gap : le temps → x des bougies (une bougie couvre [t, t + pas[ sur gap px), relu
  // par le calque pour y poser le repère de la publication.
  const pas = candles.length > 1 && candles[1].time > candles[0].time ? candles[1].time - candles[0].time : 900;
  geoPrix = { top: pad.top, ph, left: pad.left, right: pad.right, W, minP, maxP, range, vs, ve, t0: candles[vs].time, pas, gap };
  for (let i = 0; i <= gridN; i++) {
    const y = pad.top + (ph / gridN) * i;
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
  }
  ctx.setLineDash([]);
  
  // Halo sous la courbe des clôtures (jeton --aura, 0 = aucun) : le sens de la vue se lit
  // avant le détail. Teinte = sens de la vue, opacité qui s'éteint vers le bas du tracé.
  if (COLORS.aura > 0 && visible.length > 1) {
    const coul = visible[visible.length - 1].close >= visible[0].close ? COLORS.candleUp : COLORS.candleDown;
    const g = ctx.createLinearGradient(0, pad.top, 0, pad.top + ph);
    g.addColorStop(0, avecAlpha(coul, COLORS.aura)); g.addColorStop(1, avecAlpha(coul, 0));
    const xc = i => pad.left + gap * i + candleW / 2;
    ctx.save();
    ctx.beginPath(); ctx.rect(pad.left, pad.top, pw, ph); ctx.clip();
    ctx.beginPath();
    for (let i = 0; i < visible.length; i++) {
      const y = pad.top + ph * (1 - (visible[i].close - minP) / range);
      i ? ctx.lineTo(xc(i), y) : ctx.moveTo(xc(i), y);
    }
    ctx.lineTo(xc(visible.length - 1), pad.top + ph); ctx.lineTo(xc(0), pad.top + ph); ctx.closePath();
    ctx.fillStyle = g; ctx.fill();
    ctx.restore();
  }

  // Bollinger
  if (ov('bb') && candles.length >= 20) {
    const bb = memoized('bb', calcBollinger, closes, PARAM.bb.periode, PARAM.bb.ecarts);
    drawLine(bb.upper, minP, range, pad, gap, ph, COLORS.bb_upper, [3, 3], 1, vs);
    drawLine(bb.sma, minP, range, pad, gap, ph, COLORS.bb_mid, [], 1, vs);
    drawLine(bb.lower, minP, range, pad, gap, ph, COLORS.bb_lower, [3, 3], 1, vs);
    // Fill between
    ctx.save(); ctx.globalAlpha = 0.08;
    ctx.fillStyle = COLORS.bb_mid; ctx.beginPath();
    let started = false;
    for (let i = vs; i < ve; i++) {
      if (i >= bb.upper.length || bb.upper[i] === null) continue;
      const x = pad.left + gap * (i - vs) + gap / 2;
      const y = pad.top + ph * (1 - (bb.upper[i] - minP) / range);
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    }
    for (let i = ve - 1; i >= vs; i--) {
      if (i >= bb.lower.length || bb.lower[i] === null) continue;
      const x = pad.left + gap * (i - vs) + gap / 2;
      const y = pad.top + ph * (1 - (bb.lower[i] - minP) / range);
      ctx.lineTo(x, y);
    }
    ctx.closePath(); ctx.fill(); ctx.restore();
  }
  
  // EMAs & SMAs
  // La période se lit dans la CLÉ (ema20 -> 20) : la même source pour le calcul et l'étiquette.
  const TRAITS_OV = { ema20: [[], 1.5], ema50: [[], 1.5], ema100: [[4, 4], 1], ema200: [[2, 6], 1], sma20: [[6, 3], 1], sma50: [[8, 4], 1] };
  for (const [k, [tir, ep]] of Object.entries(TRAITS_OV)) {
    if (ov(k)) drawLine(memoized(k, k.startsWith('ema') ? calcEMA : calcSMA, closes, periodeDe(k)), minP, range, pad, gap, ph, COLORS[k], tir, ep, vs, ETIQ_OVERLAYS[k]);
  }

  // VWAP
  if (ov('vwap')) {
    const vwap = memoized('vwap', calcVWAP, cols().high, cols().low, closes, cols().vol, cols().time, chartInterval, PARAM.vwap.ancrageIntradayS, PARAM.vwap.ancrageBougies);
    drawLine(vwap, minP, range, pad, gap, ph, COLORS.vwap, [], 1.5, vs);
  }

  // Ichimoku
  if (ov('ichimoku') && candles.length >= PARAM.ichimoku.senkouB) {
    const highs = cols().high, lows = cols().low;
    const ichi = memoized('ichimoku', calcIchimoku, highs, lows, closes, PARAM.ichimoku.tenkan, PARAM.ichimoku.kijun, PARAM.ichimoku.senkouB);
    drawLine(ichi.tenkan, minP, range, pad, gap, ph, COLORS.ichi_tenkan, [], 1, vs);
    drawLine(ichi.kijun, minP, range, pad, gap, ph, COLORS.ichi_kijun, [], 1, vs);
    // Kumo : un remplissage PAR SEGMENT de signe constant (A >= B vert haussier, sinon rouge baissier).
    const kx = i => pad.left + gap * (i - vs) + gap/2;
    const ky = v => Math.max(pad.top, Math.min(pad.top + ph, pad.top + ph * (1 - (v - minP) / range)));
    const flushKumo = (s, e, up) => {
      if (s === null || e <= s) return;
      ctx.beginPath();
      for (let i = s; i <= e; i++) ctx.lineTo(kx(i), ky(ichi.senkouA[i]));
      for (let i = e; i >= s; i--) ctx.lineTo(kx(i), ky(ichi.senkouB[i]));
      ctx.closePath();
      ctx.fillStyle = up ? COLORS.candleUp : COLORS.candleDown;
      ctx.fill();
    };
    ctx.save(); ctx.globalAlpha = 0.18;
    let kStart = null, kUp = false;
    for (let i = vs; i <= ve; i++) {
      const sa = ichi.senkouA[i], sb = ichi.senkouB[i];
      if (sa === null || sa === undefined || sb === null || sb === undefined) {
        flushKumo(kStart, i - 1, kUp); kStart = null; continue;
      }
      const up = sa >= sb;
      if (kStart !== null && up !== kUp) { flushKumo(kStart, i - 1, kUp); kStart = null; }
      if (kStart === null) { kStart = Math.max(vs, i - 1); kUp = up; }
    }
    flushKumo(kStart, ve, kUp);
    ctx.restore();
  }

  // Parabolic SAR
  if (ov('sar')) {
    const highs2 = cols().high, lows2 = cols().low;
    const sarData = memoized('sar', calcSAR, highs2, lows2, closes, PARAM.sar.pas, PARAM.sar.max);
    for (let i = vs; i < ve; i++) {
      if (sarData[i] === null) continue;
      const x = pad.left + gap * (i - vs) + gap/2;
      const y = pad.top + ph * (1 - (sarData[i] - minP) / range);
      if (y < pad.top || y > pad.top + ph) continue;
      ctx.fillStyle = COLORS.sar; ctx.font = chartFont(7);
      ctx.fillText('●', x - 3, y + 3);
    }
  }
  
  // ═══ CHARTISTE ═══
  
  // --- Supports / Résistances (Multi-TF) ---
  srBadges = [];
  if (ov('sr')) {
    const levels = getMultiTFLevels();
    // Tier → style visuel
    const styles = [
      { name: 'Mineur', color: COLORS.sr[0], bg: avecAlpha(COLORS.sr[0], 0.10), dash: [4, 5], width: 1 },
      { name: 'Interm.', color: COLORS.sr[1], bg: avecAlpha(COLORS.sr[1], 0.12), dash: [10, 5], width: 1.8 },
      { name: 'Majeur',  color: COLORS.sr[2], bg: avecAlpha(COLORS.sr[2], 0.16), dash: [],       width: 2.5 }
    ];
    
    for (const lvl of levels.slice(0, 6)) {
      if (lvl.price < minP - range*0.05 || lvl.price > maxP + range*0.05) continue;
      const s = styles[Math.min(lvl.tier, 2)];
      const y = pad.top + ph * (1 - (lvl.price - minP) / range);
      
      // Zone colorée pour niveaux majeurs
      if (lvl.tier >= 2) {
        const zoneH = Math.max(3, ph * 0.0016);
        ctx.fillStyle = s.bg;
        ctx.fillRect(pad.left, y - zoneH, W - pad.left - pad.right, zoneH * 2);
      }
      
      // Ligne
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width;
      if (s.dash.length) ctx.setLineDash(s.dash);
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
      ctx.setLineDash([]);
      
      // Badge droite — fond opaque coloré
      const priceStr = '$' + lvl.price.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
      const badgeText = priceStr + ' ·' + lvl.tf;
      ctx.font = chartFont(9, lvl.tier >= 2 ? 700 : 500);
      const tw = ctx.measureText(badgeText).width + 14;
      const bx = W - pad.right - tw - 4, by = y - 10;
      srBadges.push({ x: bx, y: by, w: tw, h: 20 });
      
      // Fond badge
      // Fond opaque (la bulle du thème) puis la teinte du niveau : lisible sur les bougies.
      ctx.fillStyle = COLORS.bulle;
      ctx.beginPath(); ctx.roundRect(bx, by, tw, 20, 5); ctx.fill();
      ctx.fillStyle = avecAlpha(s.color, lvl.tier >= 2 ? 0.24 : 0.18);
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(bx, by, tw, 20, 5); ctx.fill(); ctx.stroke();
      
      // Texte badge
      ctx.fillStyle = COLORS.ink1;
      ctx.fillText(badgeText, bx + 7, by + 14);
      
      // Prix à gauche aussi pour les majeurs
      if (lvl.tier >= 2) {
        ctx.fillStyle = s.color;
        ctx.font = chartFont(9, 650);
        const leftStr = '$' + lvl.price.toFixed(2);
        ctx.fillText(leftStr, pad.left + 3, y - 5);
      }
    }
    
    // Mini-légende en haut à gauche (sous le compteur)
    const legY = 38;
    ctx.font = chartFont(8);
    styles.forEach((s, i) => {
      const lx = 18 + i * 75;
      ctx.fillStyle = s.color;
      ctx.fillRect(lx, legY, 18, 3);
      ctx.fillStyle = COLORS.text;
      ctx.fillText(s.name, lx + 22, legY + 4);
    });
  }
  
  // --- Fibonacci Retracement ---
  if (ov('fib') && visible.length >= 10) {
    let fibHigh = -Infinity, fibLow = Infinity;
    for (const c of visible) { if (c.high > fibHigh) fibHigh = c.high; if (c.low < fibLow) fibLow = c.low; }
    const fibRange = fibHigh - fibLow;
    const isUpTrend = visible[visible.length - 1].close > visible[0].close;
    const fibLevels = PARAM.fib.niveaux;
    for (const lvl of fibLevels) {
      const price = isUpTrend ? fibHigh - fibRange * lvl : fibLow + fibRange * lvl;
      if (price < minP - range * 0.1 || price > maxP + range * 0.1) continue;
      const y = pad.top + ph * (1 - (price - minP) / range);
      ctx.strokeStyle = avecAlpha(COLORS.fib, 0.5);
      ctx.lineWidth = 1; ctx.setLineDash([4, 6]);
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = avecAlpha(COLORS.fib, 0.9); ctx.font = chartFont(8);
      const label = (lvl * 100).toFixed(1) + '% $' + price.toFixed(2);
      const lw = ctx.measureText(label).width;
      ctx.fillText(label, W - pad.right - lw - 4, y - 3);
    }
  }
  
  // --- Volume Profile (Market Profile : POC + Value Area 70%) ---
  if (ov('vp') && visible.length >= 5) {
    const bins = Math.max(PARAM.vp.tranchesMin, Math.min(PARAM.vp.tranchesMax, Math.round(range / PARAM.vp.dollarsParTranche)));
    const binH = range / bins;
    const profile = new Array(bins).fill(0);
    for (const c of visible) {
      const loBin = Math.max(0, Math.floor((c.low - minP) / binH));
      const hiBin = Math.min(bins - 1, Math.floor((c.high - minP) / binH));
      for (let b = loBin; b <= hiBin; b++) profile[b] += c.volume;
    }
    const maxVol = Math.max(...profile) || 1;
    const pocBin = profile.indexOf(maxVol);
    const totalVol = profile.reduce((s, v) => s + v, 0);
    const order = profile.map((v, i) => i).sort((a, b) => profile[b] - profile[a]);
    let acc = 0, vaLo = bins, vaHi = -1;
    for (const b of order) {
      acc += profile[b];
      if (b < vaLo) vaLo = b;
      if (b > vaHi) vaHi = b;
      if (acc >= totalVol * PARAM.vp.zoneValeur) break;
    }
    const vpMaxW = 48;
    const yOf = b => pad.top + ph - (b + 0.5) * (ph / bins);
    for (let b = 0; b < bins; b++) {
      if (profile[b] === 0) continue;
      const t = profile[b] / maxVol;
      const w = t * vpMaxW;
      ctx.fillStyle = (b === pocBin) ? avecAlpha(COLORS.vpPoc, 0.9)
        : (b >= vaLo && b <= vaHi) ? avecAlpha(COLORS.vp, 0.25 + 0.5 * t)
        : avecAlpha(COLORS.vp, 0.12 + 0.2 * t);
      ctx.fillRect(W - pad.right + 2, pad.top + ph - (b + 1) * (ph / bins), w, Math.max(1, ph / bins - 1));
    }
    ctx.strokeStyle = avecAlpha(COLORS.vpPoc, 0.8); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(W - pad.right - 2, yOf(pocBin)); ctx.lineTo(W - pad.right + 2 + vpMaxW + 6, yOf(pocBin)); ctx.stroke();
    ctx.strokeStyle = avecAlpha(COLORS.vp, 0.45); ctx.setLineDash([2, 2]);
    for (const b of [vaLo, vaHi]) {
      ctx.beginPath(); ctx.moveTo(W - pad.right - 2, yOf(b)); ctx.lineTo(W - pad.right + 2 + vpMaxW + 6, yOf(b)); ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.fillStyle = COLORS.ink1; ctx.font = chartFont(8);
    ctx.fillText('POC $' + (minP + (pocBin + 0.5) * binH).toFixed(0), W - pad.right + 4, pad.top + 9);
  }

  // Guide : bandes des niveaux nommés, SOUS les bougies (le reste du Guide est tracé après elles).
  const guide = overlays.guide ? guidePreparer({ pad, pw, ph, W, minP, maxP, range, vs, ve, gap, candleW, n: visible.length }) : null;
  guideEtat = guide;
  // Scénarios du matin : leurs zones aussi sous les bougies ; leurs étiquettes partagent la liste
  // des places du Guide (posées APRÈS les libellés du Guide).
  const scen = scenPreparer({ pad, pw, ph, W, minP, maxP, range, vs, ve, gap, candleW, n: visible.length }, guide);
  scenEtat = scen;
  if (scen) scenBandes(scen);
  if (guide) guideBandes(guide);

  // Candles
  // Bougies. NE PAS batcher les tracés par style (« 2 strokes par bougie » semble coûteux) :
  // mesuré sur 3000 bougies, grouper les halos + les corps → ~0 ms gagnée, et deux défauts :
  // grouper les corps par couleur inverse l'ordre de recouvrement (le rouge, dessiné en
  // dernier, masque systématiquement le vert — la courbe vire au rouge), grouper les halos
  // supprime le blanc cumulé qui rend les vues denses lisibles. L'ordre porte l'information.
  for (let i = 0; i < visible.length; i++) {
    const c = visible[i];
    const yO = pad.top + ph * (1 - (c.open - minP) / range);
    const yC = pad.top + ph * (1 - (c.close - minP) / range);
    const yH = pad.top + ph * (1 - (c.high - minP) / range);
    const yL = pad.top + ph * (1 - (c.low - minP) / range);
    tracerBougie(ctx, pad.left + gap * i, candleW, yO, yC, yH, yL, c.close >= c.open);
  }
  
  // --- Heatmap Liquidité (Bookmap : grille native -> un seul drawImage) ---
  // `histHeatmap.sym` n'était JAMAIS comparé au symbole affiché : le carnet BTC se
  // dessinait tel quel sur les graphes ETH, SOL, XRP, TAO et sur le ratio BTC/SOL.
  if (ov('liq') && histHeatmap && histHeatmap.grille && histHeatmap.sym === activeSymbol) {
    const hm = histHeatmap;
    const intervalS = (candles.length > 1 && candles[1].time > candles[0].time) ? (candles[1].time - candles[0].time) : 900;
    const winT0 = candles[vs].time;
    const winT1 = candles[Math.min(candles.length - 1, ve - 1)].time + intervalS;
    const gap = pasBougie(pw, ve - vs);
    const RH = REGLAGES.heat;
    const kt = Math.max(RH.fusionT, palier(1 / (hm.dt / intervalS * gap)));
    const kp = Math.max(RH.fusionP, palier(1 / (ph * hm.dp / range)));
    const layer = buildHeatLayer(hm, kt, kp, RH.seuil);
    // Seules les colonnes qui couvrent la fenêtre sont blittées (sinon, en intraday serré, le
    // rect de destination fait des dizaines de milliers de px de large).
    const c0 = Math.max(0, Math.floor((winT0 - hm.t0) / (layer ? layer.dt : hm.dt)));
    const c1 = Math.min(layer ? layer.w : 0, Math.ceil((winT1 - hm.t0) / (layer ? layer.dt : hm.dt)));
    if (layer && c1 > c0) {
      const gp = layer.dt / intervalS * gap;           // largeur écran d'une colonne (fusionnée)
      ctx.save();
      // Clip sur la zone de prix : la heatmap ne déborde plus dans les gouttières.
      ctx.beginPath(); ctx.rect(pad.left, pad.top, pw, ph); ctx.clip();
      // Interpolation COUPÉE : le lissage MOYENNE les colonnes et gomme les murs. Le dézoom
      // est traité par la fusion automatique (MAX) ci-dessus : chaque case fait ≥ 1 px.
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(layer.cv, c0, 0, c1 - c0, layer.h,
        pad.left + (hm.t0 + c0 * layer.dt - winT0) / intervalS * gap,
        // Ligne 0 de l'image = la tranche la PLUS HAUTE (P1, cf. buildHeatLayer) : son sommet
        // est à (P1 + 1) × dp — et non P1 × dp, le cran d'une tranche décalait toute la heatmap.
        pad.top + ph * (1 - ((layer.P1 + 1) * layer.dp - minP) / range),
        (c1 - c0) * gp, layer.h * ph * layer.dp / range);
      ctx.restore();
    }
  }
  
  // Guide : formes, chemins conditionnels, libellés (au-dessus des bougies et de la chaleur).
  // Les scénarios du matin ensuite : ils prennent la place que le Guide laisse.
  // Le libellé du rang 1 d'abord (il passe devant les libellés des niveaux du Guide).
  if (deb) {
    // Débutant, par ordre de priorité : les deux repères, le scénario 1 et sa ligne, la forme ;
    // puis l'arbitrage du budget (la ligne des scénarios cède la dernière).
    if (guide) guideDebutant(guide);
    if (scen) scenTracer(scen);
    if (guide) guideFormesDebutant(guide);
    debArbitrer();
  } else {
    if (scen) scenAvantGuide(scen);
    if (guide) guideTracer(guide);
    if (scen) scenTracer(scen);
  }

  // Time labels (X axis) — densité ET format déduits de la largeur réellement
  // disponible. Avec 6 libellés fixes, sur téléphone (299 px de tracé) ils se
  // chevauchaient (« 15/09 01:0015/09 03:30 ») ; et le décalage fixe `tx - 25`
  // rognait le premier libellé au bord gauche, même sur desktop.
  ctx.fillStyle = COLORS.text; ctx.font = chartFont(9);
  const tickAvailW = W - pad.left - pad.right;
  const intraday = ['1m','5m','15m','1h','4h'].includes(chartInterval);
  const fmtTick = t => {
    if (chartInterval === '1d' || chartInterval === '1w') return FMT_D2.format(t);
    // Intraday étroit : garder l'heure seule (la plage datée est en haut à gauche)
    if (intraday && tickAvailW < 420) return FMT_HM.format(t);
    return FMT_D2.format(t) + ' ' + FMT_HM.format(t);
  };
  const tickW = ctx.measureText(fmtTick(new Date(visible[0].time * 1000))).width;
  const numLabels = Math.min(6, Math.max(2, Math.floor(tickAvailW / (tickW + 18))));
  for (let j = 0; j < numLabels; j++) {
    const idx = Math.round((visible.length - 1) * j / (numLabels - 1));
    if (idx >= visible.length) continue;
    const label = fmtTick(new Date(visible[idx].time * 1000));
    const lw = ctx.measureText(label).width;
    // Centré sur la bougie, puis contraint à l'intérieur du tracé
    const tx = Math.max(pad.left, Math.min(W - pad.right - lw, pad.left + gap * idx - lw / 2));
    ctx.fillText(label, tx, chartH - 3);
  }
  
  // ─── Trade markers (backtest) ───
  if (!deb && btResult && btResult.trades && btResult.trades.length > 0) {
    for (const trade of btResult.trades) {
      // Entry marker
      if (trade.entryIdx >= vs && trade.entryIdx < ve) {
        const ex = pad.left + gap * (trade.entryIdx - vs) + gap/2;
        const ey = pad.top + ph * (1 - (trade.entryPrice - minP) / range);
        if (ey > pad.top && ey < pad.top + ph) {
          // Green triangle up for buy entry
          ctx.fillStyle = COLORS.trade_buy;
          ctx.beginPath(); ctx.moveTo(ex, ey - 7); ctx.lineTo(ex - 5, ey + 2); ctx.lineTo(ex + 5, ey + 2); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = COLORS.trade_buy; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(ex, ey - 10); ctx.lineTo(ex, ey + 6); ctx.stroke();
        }
      }
      // Exit marker
      if (trade.exitIdx >= vs && trade.exitIdx < ve && trade.exitIdx >= 0) {
        const xx = pad.left + gap * (trade.exitIdx - vs) + gap/2;
        const xy = pad.top + ph * (1 - (trade.exitPrice - minP) / range);
        if (xy > pad.top && xy < pad.top + ph) {
          const isWin = trade.pnl > 0;
          ctx.fillStyle = isWin ? COLORS.trade_buy : COLORS.trade_sell;
          // Triangle down for sell exit
          ctx.beginPath(); ctx.moveTo(xx, xy + 7); ctx.lineTo(xx - 5, xy - 2); ctx.lineTo(xx + 5, xy - 2); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = isWin ? COLORS.trade_buy : COLORS.trade_sell; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(xx, xy + 10); ctx.lineTo(xx, xy - 6); ctx.stroke();
          // PnL label
          const pnlStr = (trade.pnlPct >= 0 ? '+' : '') + trade.pnlPct.toFixed(2) + '%';
          ctx.fillStyle = isWin ? COLORS.candleUp : COLORS.candleDown;
          ctx.font = chartFont(8);
          ctx.fillText(pnlStr, xx + 6, xy - 4);
        }
      }
    }
  }

  // ─── Grid level lines (active bot) ───
  const activeBot = btBot || (btResult && btResult.bot);
  if (!deb && activeBot && activeBot.gridLevels && activeBot.gridLevels.length > 0) {
    for (const level of activeBot.gridLevels) {
      if (level.price < minP - range * 0.1 || level.price > maxP + range * 0.1) continue;
      const ly = pad.top + ph * (1 - (level.price - minP) / range);
      if (ly < pad.top || ly > pad.top + ph) continue;

      if (level.status === 'pending') {
        // Dashed green — buy limit waiting
        ctx.strokeStyle = COLORS.grid_buy_pending; ctx.lineWidth = 1;
        ctx.setLineDash([5, 3]);
        ctx.beginPath(); ctx.moveTo(pad.left, ly); ctx.lineTo(W - pad.right, ly); ctx.stroke();
        ctx.setLineDash([]);
        // Label
        const label = 'BUY $' + level.price.toFixed(2);
        ctx.fillStyle = COLORS.grid_buy_pending; ctx.font = chartFont(8);
        ctx.fillText(label, pad.left + 4, ly - 3);
      } else if (level.status === 'filled') {
        // Solid green — active position
        ctx.strokeStyle = COLORS.grid_buy_filled; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(pad.left, ly); ctx.lineTo(W - pad.right, ly); ctx.stroke();
        // TP line (gold dashed)
        if (level.tp && level.tp < maxP + range * 0.2 && level.tp > minP - range * 0.2) {
          const tpy = pad.top + ph * (1 - (level.tp - minP) / range);
          ctx.strokeStyle = COLORS.grid_tp; ctx.lineWidth = 0.8;
          ctx.setLineDash([3, 4]);
          ctx.beginPath(); ctx.moveTo(pad.left, tpy); ctx.lineTo(W - pad.right, tpy); ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = COLORS.grid_tp; ctx.font = chartFont(7);
          ctx.fillText('TP ' + ((level.tp/level.price - 1)*100).toFixed(2) + '%', pad.left + 4, tpy - 2);
        }
        // SL line (red dashed)
        if (level.sl && level.sl < maxP + range * 0.2 && level.sl > minP - range * 0.2) {
          const sly = pad.top + ph * (1 - (level.sl - minP) / range);
          ctx.strokeStyle = COLORS.grid_sl; ctx.lineWidth = 0.8;
          ctx.setLineDash([3, 4]);
          ctx.beginPath(); ctx.moveTo(pad.left, sly); ctx.lineTo(W - pad.right, sly); ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = COLORS.grid_sl; ctx.font = chartFont(7);
          ctx.fillText('SL', pad.left + 4, sly - 2);
        }
      }
    }
  }
}

/** Une bougie, dans la forme du thème (COLORS.bougieForme). Les ordonnées yO, yC, yH, yL sont
 *  celles des quatre prix : seule la FORME dépend du thème, jamais la position. */
function tracerBougie(g, x, candleW, yO, yC, yH, yL, hausse) {
  const color = hausse ? COLORS.candleUp : COLORS.candleDown, forme = COLORS.bougieForme, rayon = COLORS.bougieRayon;
  const xm = x + candleW / 2;
  const bodyH = Math.max(1, Math.abs(yC - yO));
  const bodyW = candleW * 0.7, bodyX = x + candleW*0.15, bodyY = Math.min(yO, yC);
  const dense = bodyW < BOUGIE_DENSE_PX;
  // Anneau de SURFACE autour de la mèche (pas de blanc) : il sépare les bougies voisines
  // dans les vues denses sans dessiner de contour sur la donnée.
  g.strokeStyle = COLORS.surface; g.lineWidth = 2.6;
  g.beginPath(); g.moveTo(xm, yH); g.lineTo(xm, yL); g.stroke();
  if (forme === 'barre') {
    // Barre OHLC : le trait du plus haut au plus bas, l'ouverture en tiret à gauche, la clôture
    // à droite. En vue dense, le trait seul (un tiret de moins d'un pixel ne se lit plus).
    g.strokeStyle = color; g.lineWidth = dense ? 1 : Math.min(2, Math.max(1, bodyW / 8));
    g.beginPath(); g.moveTo(xm, yH); g.lineTo(xm, yL);
    if (!dense) { g.moveTo(bodyX, yO); g.lineTo(xm, yO); g.moveTo(xm, yC); g.lineTo(bodyX + bodyW, yC); }
    g.stroke();
    return;
  }
  // Corps creux : hausse seulement, et seulement s'il a la place d'un contour et d'un intérieur.
  const creux = forme === 'creuse-hausse' && hausse && !dense && bodyH >= 3;
  g.strokeStyle = color; g.lineWidth = 1;
  g.beginPath();
  if (creux) { g.moveTo(xm, yH); g.lineTo(xm, bodyY); g.moveTo(xm, bodyY + bodyH); g.lineTo(xm, yL); }   // la mèche s'arrête au corps
  else { g.moveTo(xm, yH); g.lineTo(xm, yL); }
  g.stroke();
  // Coins adoucis dès qu'il y a la place (--bougie-rayon, 0 = angles vifs) ; le liseré blanc
  // d'avant (un contour sur la donnée) n'a plus lieu d'être : les teintes validées tiennent 3:1.
  const arrondi = rayon > 0 && !dense && bodyH >= 3;
  if (creux) {
    g.fillStyle = COLORS.surface;
    g.beginPath(); if (arrondi) g.roundRect(bodyX, bodyY, bodyW, bodyH, Math.min(rayon, bodyW / 5)); else g.rect(bodyX, bodyY, bodyW, bodyH); g.fill();
    g.strokeStyle = color; g.lineWidth = 1.2;
    g.beginPath(); if (arrondi) g.roundRect(bodyX + 0.6, bodyY + 0.6, bodyW - 1.2, bodyH - 1.2, Math.min(rayon, bodyW / 5)); else g.rect(bodyX + 0.6, bodyY + 0.6, bodyW - 1.2, bodyH - 1.2); g.stroke();
    return;
  }
  g.fillStyle = color;
  if (arrondi) { g.beginPath(); g.roundRect(bodyX, bodyY, bodyW, bodyH, Math.min(rayon, bodyW / 5)); g.fill(); }
  else g.fillRect(bodyX, bodyY, bodyW, bodyH);
}

// ═══════════════════════════════════════════════════════════════════════════════
// GUIDE — le dessin (le cœur pur est js/guide.js ; ses nombres sont PARAM.guide)
// ─────────────────────────────────────────────────────────────────────────────
// Sur le GRAPHIQUE (redessiné quand la donnée ou la vue change) : les bandes des niveaux nommés
// et leurs libellés, les formes et leur objectif théorique, les deux chemins conditionnels dans
// la marge de futur, le badge du régime. Sur le CALQUE (chaque seconde, au prix live) : l'état de
// chaque niveau (distance au prix LIVE, « en test », « cassé (1/2 clôtures) »…), la lecture du
// moment et l'explication au survol. Le calque ne recalcule rien : il relit guideEtat.
// Rien ici ne tourne sur une minuterie ; le survol ne redessine pas le graphique.
let guideEtat = null;
const GUIDE_FORMES = { cle: null, val: null, base: null, tF: null };   // formes et bilan : sur les bougies CLOSES, rejeu repris
let srBadges = [];                                // badges S/R posés dans la frame : le Guide les évite
const guideUnite = () => (activeSymbol === 'BTCSOL' ? 'SOL' : '$');
const frN = v => v.toLocaleString('fr-FR');                     // 0.5 → « 0,5 »
const guideMode = () => (typeof modeCourant === 'function' ? modeCourant() : 'debutant');

/** Les données du Guide pour l'état courant des bougies. Indicateurs, niveaux et régime sont
 *  mémorisés avec les autres (memoized : vidé quand les bougies changent) ; les formes, rejouées
 *  sur tout l'historique, ne sont refaites que quand une bougie SE FERME (GUIDE_FORMES).
 *  Zones S/R : celles de l'intervalle AFFICHÉ seulement (méthode S/R de la page) — le Guide ne
 *  dépend pas de la couche S/R et ne charge rien de plus. */
function guideDonnees() {
  const n = candles.length, G = PARAM.guide;
  if (n < 2 * G.atrPeriode + 2) return null;
  const K = cols(), iF = n - 2;
  const atr = memoized('guide_atr_' + G.atrPeriode, calcATR, K.high, K.low, K.close, G.atrPeriode);
  if (!isNum(atr[iF]) || !(atr[iF] > 0)) return null;
  const cleF = activeSymbol + '|' + chartInterval + '|' + (n - 1) + '|' + candles[0].time + '|' + candles[iF].time + '|' + candles[iF].close;
  if (GUIDE_FORMES.cle !== cleF) {
    // Une bougie de plus sur le même historique (même symbole, intervalle, 1re bougie, et la
    // dernière bougie déjà lue à la même heure) : le rejeu reprend là où il s'était arrêté.
    const base = activeSymbol + '|' + chartInterval + '|' + candles[0].time, V = GUIDE_FORMES.val;
    const prec = V && GUIDE_FORMES.base === base && V.n <= n - 1 && candles[V.n - 1] && candles[V.n - 1].time === GUIDE_FORMES.tF ? V : null;
    GUIDE_FORMES.cle = cleF;
    GUIDE_FORMES.val = Guide.detecter({ h: K.high, l: K.low, c: K.close, atr, n: n - 1 }, G, prec);
    GUIDE_FORMES.base = base; GUIDE_FORMES.tF = candles[iF].time;
  }
  // Les niveaux du fichier publié (BTCUSDT seulement) entrent dans la clé : une publication
  // nouvelle refait les niveaux, rien d'autre.
  const md = activeSymbol === 'BTCUSDT' ? marketData : null;
  return memoized('guide_' + activeSymbol + '_' + chartInterval + '_' + (md ? md.updated : '-'), () => {
    const pas = candles[1].time > candles[0].time ? candles[1].time - candles[0].time : 0;
    const sr = memoized('sr_' + activeSymbol + '_' + chartInterval, computeSR, candles, chartInterval, PARAM.sr.bougies)
      .slice(0, PARAM.sr.niveauxTf).map(l => ({ price: l.price, touches: l.touches, tf: chartInterval }));
    const srMeta = { bougies: PARAM.sr.bougies, pivot: getSRLookback(chartInterval), tolMin: PARAM.sr.tolMin, tolMax: PARAM.sr.tolMax };
    const raisons = Guide.niveauxDuJour(K.time, K.high, K.low, n, pas).concat(Guide.niveauxSR(sr, G, srMeta), Guide.niveauxPublies(md));
    const ref = K.close[n - 1], demi = atr[iF] * G.bandeAtr;
    const choix = Guide.choisirNiveaux(raisons, ref, G);
    for (const niv of choix.dessus.concat(choix.dessous)) {
      niv.demi = demi; niv.lo = niv.pMin - demi; niv.hi = niv.pMax + demi;
      // Un niveau publié ne compte que les bougies OUVERTES après sa lecture (clôture et mèche
      // postérieures à la photo du carnet ou des options).
      let lu = -Infinity;
      for (const r of niv.raisons) if (isNum(r.lu) && r.lu > lu) lu = r.lu;
      let iMin = 0;
      if (lu > -Infinity) { iMin = n - 1; for (let k = n - 2; k >= 0 && K.time[k] * 1000 >= lu; k--) iMin = k; }
      niv.iMin = iMin;
      if (lu > -Infinity) niv.lu = lu;     // etatLive : pas de mèche lue sur une bougie ouverte avant la lecture
      niv.ferme = Guide.etatFerme(K.close, K.high, K.low, n - 1, niv.lo, niv.hi, G, iMin);
    }
    const adx = memoized('sub_adx', calcADX, K.high, K.low, K.close, PARAM.adx.periode);
    const emaC = memoized('guide_ema_' + G.emaCourte, calcEMA, K.close, G.emaCourte);
    const emaL = memoized('guide_ema_' + G.emaLongue, calcEMA, K.close, G.emaLongue);
    const bb = memoized('bb', calcBollinger, K.close, PARAM.bb.periode, PARAM.bb.ecarts);
    const largeur = bb.sma.map((m, i) => (m && bb.upper[i] !== null ? (bb.upper[i] - bb.lower[i]) / m : null));
    const regime = Guide.regime({ adx: adx.adx, plusDI: adx.plusDI, minusDI: adx.minusDI, emaC, emaL, largeur }, iF, G);
    // Débutant : un repère par prix nommé, sa petite bande (± demi) et son état sur les bougies
    // closes (même règle que les bandes : un chiffre publié ne compte qu'après sa lecture).
    const reperes = Guide.reperesDe(choix, demi);
    for (const x of reperes) {
      let iMin = 0;
      if (isNum(x.lu)) { iMin = n - 1; for (let k = n - 2; k >= 0 && K.time[k] * 1000 >= x.lu; k--) iMin = k; }
      x.iMin = iMin;
      x.ferme = Guide.etatFerme(K.close, K.high, K.low, n - 1, x.lo, x.hi, G, iMin);
    }
    return { choix, demi, regime, suite: Guide.suite(choix, ref), atr: atr[iF], ref, reperes };
  });
}

/** Une étiquette du Guide : pastille à la bulle du thème, encre 1, un trait de couleur à gauche. */
function guidePastille(g, x, y, w, h, texte, coul) {
  g.fillStyle = COLORS.bulle;
  g.beginPath(); g.roundRect(x, y, w, h, 4); g.fill();
  if (coul) { g.fillStyle = coul; g.fillRect(x + 2, y + 3, 2.5, h - 6); }
  g.fillStyle = COLORS.ink1;
  g.fillText(texte, x + (coul ? 8 : 5), y + h - 4.5);
}
/** Coupe `texte` pour tenir dans `w` px (police déjà posée sur g) : « … » en fin. */
function guideCouper(g, texte, w) {
  if (g.measureText(texte).width <= w) return texte;
  let lo = 0, hi = texte.length;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (g.measureText(texte.slice(0, m) + '…').width <= w) lo = m; else hi = m - 1; }
  return lo ? texte.slice(0, lo).trimEnd() + '…' : '';
}
/** Découpe en lignes de largeur ≤ w (mots entiers ; un mot trop long est coupé). Un nombre et
 *  son unité ne sont jamais séparés : « 80 685 $ », « 15 min » restent sur une ligne. */
function guideLignes(g, texte, w, max) {
  const mots = [];
  for (const m of String(texte).split(' ')) {
    const k = mots.length - 1;
    if (k >= 0 && /\d$/.test(mots[k]) && /^(\d{3}(?:\D|$)|\$|%|SOL\b|UTC\b|min\b|h\b|j\b|jours?\b|semaines?\b)/.test(m)) mots[k] += ' ' + m;
    else mots.push(m);
  }
  const out = [];
  let l = '';
  for (const m of mots) {
    const t = l ? l + ' ' + m : m;
    if (g.measureText(t).width <= w || !l) l = t;
    else { out.push(l); l = m; }
  }
  if (l) out.push(l);
  if (max && out.length > max) { const reste = out.slice(max - 1).join(' '); out.length = max - 1; out.push(guideCouper(g, reste, w)); }
  return out.map(x => guideCouper(g, x, w));
}
const guideLibre = (rects, r) => !rects.some(q => r.x < q.x + q.w && r.x + r.w > q.x && r.y < q.y + q.h && r.y + r.h > q.y);
/** La première place libre parmi `essais` (ordonnées du haut), puis en glissant depuis la
 *  première, par demi-hauteur, vers `vers` (−1 vers le haut, +1 vers le bas), au plus `glisse`
 *  crans ; dans [top, bas]. `evite(r)` : une gêne de plus (les bougies) — facultative.
 *  Réservée et rendue, ou null : une étiquette sans place n'en recouvre pas une autre. */
function guidePlacer(rects, x, w, h, essais, top, bas, vers, wReserve, glisse, evite) {
  const libre = y => { const r = { x, y, w: wReserve || w, h }; return y >= top && y + h <= bas && guideLibre(rects, r) && !(evite && evite(r)) ? r : null; };
  let r = null;
  for (const y of essais) if ((r = libre(y))) break;
  const kMax = glisse === undefined ? 8 : glisse;
  for (let k = 1; !r && k <= kMax; k++) r = libre(essais[0] + vers * k * h / 2);
  if (!r) return null;
  rects.push(r);
  return { x, y: r.y, w, h, wR: r.w };
}
/** Distance d'un point à un segment [a, b] (survol des tracés du Guide). */
function guideDistSeg(px, py, s) {
  const dx = s[2] - s[0], dy = s[3] - s[1], l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((px - s[0]) * dx + (py - s[1]) * dy) / l2)) : 0;
  return Math.hypot(px - s[0] - t * dx, py - s[1] - t * dy);
}
/** Le texte du repère de publication (calque) : dans la marge de futur s'il y tient, sinon à
 *  côté du trait, jamais hors du tracé. Une seule règle, lue par le calque et par le Guide. */
function texteRepere(rep, P, lw) {
  const xMax = P.W - P.right, xFin = P.left + P.gap * (P.ve - P.vs);
  if (xMax - xFin >= lw + 10 && rep.x <= xFin + 2) return xFin + 4;
  return rep.x + 6 + lw > xMax ? Math.max(P.left + 2, rep.x - 6 - lw) : rep.x + 6;
}

/** L'âge de l'issue d'une forme finie, pour la phrase : « il y a 17 bougies 1 jour (21/09) ». */
function guideFormeQuand(f) {
  if (!f || !f.fin || !candles[f.jFin]) return null;
  const k = (candles.length - 2) - f.jFin, iso = new Date(candles[f.jFin].time * 1000).toISOString();
  const pas = candles.length > 1 ? candles[1].time - candles[0].time : 0;
  const jour = iso.slice(8, 10) + '/' + iso.slice(5, 7), heure = iso.slice(11, 16);
  const date = pas >= 86400 ? jour : k * pas >= 20 * 3600 ? jour + ' ' + heure + ' UTC' : heure + ' UTC';
  return { bougies: k, itv: chartInterval, date };
}
/** Ce que la lecture du moment dit, hors prix « en test » et hors variante. */
function guideLectureBase(D, vs, ve, prix) {
  const forme = Guide.formesAffichees(GUIDE_FORMES.val, PARAM.guide, vs, ve)[0] || null;
  return { prix, unite: guideUnite(), choix: D.choix, regime: D.regime, maintenant: ve < candles.length, forme, formeQuand: guideFormeQuand(forme) };
}
/** La hauteur réservée en haut du tracé : la rangée du compteur et du régime, puis la lecture
 *  du moment (débutant : au plus 3 lignes, 2 sur téléphone). La variante de la lecture (pleine,
 *  sans le sens du régime, compacte, sans la forme : Guide.VARIANTES_LECTURE) est la plus riche
 *  qui tient dans ces lignes POUR CHAQUE prix « en test » possible (aucune bande, ou l'une
 *  d'elles) : la phrase du calque ne sera jamais coupée au milieu d'une heure de lecture.
 *  Mémorisée par texte et largeur. */
let guideHautMemo = null;
function guideHaut(W, padL, padR) {
  const D = guideDonnees();
  if (!D) return 0;
  const mode = guideMode(), lectureY = overlays.sr ? 46 : 38;
  if (mode === 'expert') return lectureY - 10;
  const vs = Math.max(0, viewStart), ve = Math.min(candles.length, viewEnd);
  const base = guideLectureBase(D, vs, ve, D.ref);
  const tests = [null].concat(D.choix.dessus, D.choix.dessous);
  const textes = Guide.VARIANTES_LECTURE.map(V => tests.map(enTest => Guide.lecture(Object.assign({}, base, V, { enTest }))));
  const etroit = W - padL - padR < 520, maxL = etroit ? 2 : 3;
  const cle = textes.map(x => x.join('|')).join('||') + '|' + W + '|' + lectureY;
  if (!guideHautMemo || guideHautMemo.cle !== cle) {
    ctx.font = chartFont(10, 600);
    const larg = W - padL - padR - 16 - 14, n = t => guideLignes(ctx, t + ' 00', larg).length;
    let variante = Guide.VARIANTES_LECTURE.length - 1, lignes = maxL;
    for (let k = 0; k < textes.length; k++) {
      const l = Math.max(...textes[k].map(n));
      if (l <= maxL) { variante = k; lignes = l; break; }
    }
    guideHautMemo = { cle, lignes, variante, lectureY, h: lectureY + lignes * 14 + 4 + 6 - 10 };
  }
  return guideHautMemo.h;
}
/** Prépare ce que le Guide pose sur le graphique (géométrie de resolveChart) → guideEtat. */
function guidePreparer(g) {
  const D = guideDonnees();
  if (!D) return null;
  const G = PARAM.guide, mode = guideMode(), unite = guideUnite(), exp = mode === 'expert';
  const yDe = p => g.pad.top + g.ph * (1 - (p - g.minP) / g.range);
  // Le CENTRE d'une bougie, au pixel près de tracerBougie (x + candleW / 2).
  const xDe = i => g.pad.left + g.gap * (i - g.vs) + g.candleW / 2;
  const xFin = g.pad.left + g.gap * g.n, xMax = g.W - g.pad.right;
  const itv = Guide.nomIntervalle(chartInterval), finVue = g.ve === candles.length;
  const E = { g, D, mode, unite, exp, yDe, xDe, xFin, xMax, itv, niveaux: [], cibles: [], rects: [], formes: [], hors: [],
    demiPx: Math.max(2, D.demi / g.range * g.ph), finVue, marge: finVue ? xMax - xFin : 0 };
  // Le haut du tracé (compteur, régime, lecture du moment) est hors de pad.top (guideHaut) :
  // aucune étiquette n'y monte. La lecture se pose sur le calque, à la rangée prévue.
  E.lectureY = overlays.sr ? 46 : 38;
  // Les badges S/R (s'ils sont affichés) et le texte du repère de publication : leur place est gardée.
  for (const r of srBadges) E.rects.push(r);
  const rep = geoPrix && !debutant() && reperePublication(geoPrix);
  if (rep) {
    ctx.font = chartFont(9, 650);
    const lw = ctx.measureText(rep.texte).width;
    E.rects.push({ x: texteRepere(rep, geoPrix, lw) - 2, y: g.pad.top + g.ph - 22, w: lw + 4, h: 14 });
  }
  E.lectureLignes = exp || !guideHautMemo ? 0 : guideHautMemo.lignes;
  // Niveaux : la bande couvre TOUS ses prix (± la demi-hauteur), un trait à chacun.
  for (const niv of D.choix.dessus.concat(D.choix.dessous)) {
    const yH = yDe(niv.pMax) - E.demiPx, yB = yDe(niv.pMin) + E.demiPx;
    const visible = niv.pMax >= g.minP && niv.pMin <= g.maxP;
    E.niveaux.push({ niv, y: (yH + yB) / 2, yH, yB, visible, libelle: Guide.libelleNiveau(niv, mode, unite), court: Guide.libelleNiveau(niv, mode, unite, true),
      mini: Guide.libelleNiveau(niv, mode, unite, 'mini'), micro: Guide.libelleNiveau(niv, mode, unite, 'micro') });
  }
  E.formes = Guide.formesAffichees(GUIDE_FORMES.val, G, g.vs, g.ve, exp ? 'expert' : 'debutant');
  E.formeQuand = guideFormeQuand(E.formes[0]);
  E.figures = []; E.ctxF = guideCtxFigures(); E.debForme = null;
  if (debutant()) {
    // Débutant : deux repères à l'écran, choisis au prix LIVE (debReperes) : le plus proche
    // au-dessus et au-dessous ; chacun avec sa petite bande et le repère suivant (la bulle).
    const sel = debReperes(D);
    E.deb = true; E.debutant = debEtat; E.debSel = sel;
    E.niveaux = [[sel.dessus, sel.suivantHaut], [sel.dessous, sel.suivantBas]].filter(([x]) => x).map(([niv, suivant]) => {
      const y = yDe(niv.p), yH = y - E.demiPx, yB = y + E.demiPx;
      return { niv, suivant, y, yH, yB, visible: niv.p >= g.minP && niv.p <= g.maxP };
    });
    E.niveauxTous = E.niveaux;
  }
  return E;
}

/** Bandes des niveaux : sous les bougies, translucides, jusqu'au bout de la marge de futur. */
function guideBandes(E) {
  const { g, xMax, yDe } = E;
  ctx.save();
  // Le tracé, moins les badges S/R déjà posés (pair-impair) : une bande ne les barre pas.
  ctx.beginPath(); ctx.rect(g.pad.left, g.pad.top, xMax - g.pad.left, g.ph);
  for (const r of srBadges) ctx.rect(r.x, r.y, r.w, r.h);
  ctx.clip('evenodd');
  for (const L of E.niveaux) {
    if (!L.visible) continue;
    ctx.fillStyle = avecAlpha(COLORS.accent2, E.deb ? 0.08 : 0.11);
    ctx.fillRect(g.pad.left, L.yH, xMax - g.pad.left, L.yB - L.yH);
    ctx.strokeStyle = avecAlpha(COLORS.accent2, 0.6); ctx.lineWidth = 1; ctx.setLineDash([5, 4]);
    // Débutant : un seul tiret, au prix que dit le libellé.
    for (const r of E.deb ? [Guide.raisonPrincipale(L.niv)] : L.niv.raisons) { const y = yDe(r.p); ctx.beginPath(); ctx.moveTo(g.pad.left, y); ctx.lineTo(xMax, y); ctx.stroke(); }
  }
  ctx.setLineDash([]);
  ctx.restore();
}

/** L'explication d'un niveau (survol), dans les mots du mode. */
function guideTexteNiveau(L, exp) {
  const R = L.niv.raisons, G = PARAM.guide, unite = guideUnite(), itv = Guide.nomIntervalle(chartInterval);
  const une = r => {
    if (exp) return r.court + ' ' + Guide.prixR(r, unite) + ' — ' + r.nature + (r.lu ? ' · ' + Guide.heureUTC(r.lu) + ' UTC' : '');
    let t = r.nom + ' (' + Guide.prixR(r, unite) + ') : ' + r.origine + ' — ' + r.nature + '.';
    // Un mur d'options est un prix d'exercice ; le zéro gamma, un prix calculé par le modèle. Le
    // taux est écrit à 4 décimales : la conversion affichée refait le prix placé.
    if (isNum(r.strike) && r.conversion) t += ' ' + (r.exercice ? 'Prix d’exercice ' : 'Prix calculé par le modèle ') + Guide.prix(r.strike, '$') + ' (dollars, Deribit), placé à ' + Guide.prix(r.p, unite)
      + ' sur cet axe en USDT (1 USDT = ' + r.conversion.toLocaleString('fr-FR', { minimumFractionDigits: 4, maximumFractionDigits: 4 }) + ' $ à la publication).';
    return t;
  };
  return R.map(une).concat([
    exp ? 'Bande ± ' + frN(G.bandeAtr) + ' × ATR ' + G.atrPeriode + ' (± ' + Guide.prix(L.niv.demi, unite) + ') autour de ses prix. Cassure : 2 clôtures ' + itv + ' hors bande, ou 1 + retour réussi.'
      : 'La bande fait ± ' + Guide.prix(L.niv.demi, unite) + ' autour de ' + (R.length > 1 ? 'ses prix' : 'ce prix') + ' : ' + frN(G.bandeAtr) + ' fois l’ATR ' + G.atrPeriode + ', l’amplitude moyenne d’une bougie sur les ' + G.atrPeriode + ' dernières.',
    exp ? '' : 'État lu sur les bougies ' + itv + ' closes (règle de travail) : « cassé » demande 2 clôtures successives hors de la bande, ou 1 clôture puis un retour réussi sur la bande ; une mèche seule = « percé en mèche ».'
      + (L.niv.raisons.some(r => r.lu) ? ' Pour un chiffre publié, seules les clôtures après sa lecture comptent.' : ''),
  ].filter(Boolean));
}

/** Une étiquette de plusieurs lignes : pastille à la bulle du thème, encre 1, trait de couleur. */
function guidePastilleL(g, x, y, w, lignes, coul, hL) {
  const h = lignes.length * hL;
  g.fillStyle = COLORS.bulle;
  g.beginPath(); g.roundRect(x, y, w, h, 4); g.fill();
  if (coul) { g.fillStyle = coul; g.fillRect(x + 2, y + 3, 2.5, h - 6); }
  g.fillStyle = COLORS.ink1;
  lignes.forEach((t, k) => g.fillText(t, x + (coul ? 8 : 5), y + (k + 1) * hL - 4.5));
}
/** Un rectangle de survol {x0, y0, x1, y1} depuis une place {x, y, w, h} (wR : largeur gardée). */
const guideZone = r => ({ x0: r.x, y0: r.y, x1: r.x + (r.wR || r.w), y1: r.y + r.h });

/** Formes, chemins et libellés : au-dessus des bougies et de la chaleur. Ordre de PRIORITÉ (la
 *  place va d'abord aux niveaux) : libellés des niveaux, niveaux hors vue ou sans place, chemins
 *  « Et ensuite ? », formes. */
function guideTracer(E) {
  const { g, yDe } = E;
  const top = g.pad.top, bas = g.pad.top + g.ph;
  // Les bougies visibles, gêne « douce » pour les étiquettes : essayées d'abord sans les couvrir.
  const surBougies = r => {
    const i0 = Math.max(g.vs, g.vs + Math.floor((r.x - g.pad.left) / g.gap)), i1 = Math.min(g.ve - 1, g.vs + Math.floor((r.x + r.w - g.pad.left) / g.gap));
    for (let i = i0; i <= i1; i++) { const c = candles[i]; if (yDe(c.high) <= r.y + r.h && yDe(c.low) >= r.y) return true; }
    return false;
  };
  ctx.font = chartFont(9, 600);
  guideLibellesNiveaux(E, top, bas, surBougies);
  guideBords(E, top, bas);
  guideChemins(E, top, bas, surBougies);
  // Les figures (au plus formesMax) : une figure tombée reste lisible un moment avec sa marque ✗,
  // de plus en plus pâle (guideStyleFigure).
  for (const f of E.formes) guideForme(E, f, surBougies);
  ctx.font = chartFont(9, 600);
}

/** Libellés des bandes (différés : posés après les bougies et les étiquettes d'overlays).
 *  Le LIBELLÉ a la priorité sur l'état : la forme la plus riche qui tient ENTIÈRE (pleine,
 *  courte, mini, micro) ; jamais coupé s'il porte un chiffre publié : sur autant de lignes qu'il
 *  faut (une bande de cinq raisons dont deux publiées ne tient pas en trois lignes à 390 px ; la
 *  couper perdait l'heure de la dernière). Trop haut pour sa place, il est nommé au bord.
 *  L'état au prix live (calque) se pose à sa droite s'il y a la place, sinon sur la ligne du
 *  dessous. Le libellé reste près de SA bande : aucune autre bande entre eux, et les libellés
 *  gardent l'ordre des bandes de haut en bas. Une bande sans place est nommée au bord (guideBords). */
function guideLibellesNiveaux(E, top, bas, surBougies) {
  const { g, xFin, xMax } = E, H = 15;
  ctx.font = chartFont(9, 600);
  const etroit = g.pw < 520;
  const largMax = Math.max(120, (etroit ? 1 : 0.55) * (xMax - g.pad.left) - 12);
  // Le libellé et son état restent à gauche de la marge de futur (les chemins y sont).
  const x = g.pad.left + 6, dispo = (E.marge ? xFin : xMax) - x - 2;
  const larg = t => ctx.measureText(t).width + 14;
  for (const L of E.niveaux) if (!L.visible) E.hors.push(L);
  const vis = E.niveaux.filter(L => L.visible).sort((a, b) => a.y - b.y);
  E.sansPlace = [];
  let yPrec = -Infinity;
  for (const L of vis) {
    const publie = L.niv.raisons.some(r => isNum(r.lu));
    let lignes = null;
    for (const [t, lim] of [[L.libelle, Math.min(largMax, dispo)], [L.court, dispo], [L.mini, dispo], [L.micro, dispo]]) if (larg(t) <= lim) { lignes = [t]; break; }
    if (!lignes) lignes = publie ? guideLignes(ctx, L.micro, dispo - 14) : [guideCouper(ctx, L.micro, dispo - 14)];
    const wL = Math.min(dispo, Math.max(...lignes.map(larg)));
    const etatPlein = ctx.measureText(Guide.texteEtatMax(E.mode, 'plein', L.niv.ferme)).width + 16;
    const etatMini = ctx.measureText(Guide.texteEtatMax(E.mode, 'mini', L.niv.ferme)).width + 16;
    const enLigne = lignes.length === 1 && wL + 3 + etatMini <= dispo;
    const wR = enLigne ? Math.min(wL + 3 + etatPlein, dispo) : Math.max(wL, Math.min(etatPlein, dispo));
    const h = (lignes.length + (enLigne ? 0 : 1)) * H;
    const autres = vis.filter(M => M !== L);
    // Gêne stricte : l'ordre des libellés, une autre bande sous le libellé ou entre lui et sa bande.
    const ordre = r => r.y < yPrec;
    const entre = r => {
      const a = r.y + r.h <= L.yH ? r.y + r.h : r.y >= L.yB ? L.yB : null, b = r.y + r.h <= L.yH ? L.yH : r.y >= L.yB ? r.y : null;
      return autres.some(M => (r.y < M.yB && r.y + r.h > M.yH) || (a !== null && M.yB > a && M.yH < b));
    };
    const essais = [L.yH - h - 1, L.yB + 1, L.y - h / 2], vers = L.y > (top + bas) / 2 ? -1 : 1;
    // Jamais sur une autre bande ni au-delà d'elle : sans place près de la sienne, la bande est
    // nommée au bord (guideBords) plutôt qu'à côté d'une voisine.
    const pose = guidePlacer(E.rects, x, wL, h, essais, top, bas, vers, wR, 2, r => ordre(r) || entre(r) || surBougies(r))
      || guidePlacer(E.rects, x, wL, h, essais, top, bas, vers, wR, 4, r => ordre(r) || entre(r));
    const zones = [{ x0: g.pad.left, y0: L.yH - 3, x1: xMax, y1: L.yB + 3 }];
    if (!pose) { E.sansPlace.push(L); E.cibles.push({ rects: [], zones, prio: 1, niveau: L, titre: Guide.libelleNiveau(L.niv, 'debutant', E.unite), texte: guideTexteNiveau(L, E.exp) }); continue; }
    yPrec = pose.y;
    L.etiq = { x, y: pose.y, w: wL, h: H, wR, lignes, enLigne };
    etiquettesAFaire.push(() => { ctx.font = chartFont(9, 600); guidePastilleL(ctx, x, pose.y, wL, lignes, COLORS.accent2, H); });
    E.cibles.push({ rects: [{ x0: x, y0: pose.y, x1: x + wR, y1: pose.y + h }], zones, prio: 1, niveau: L, titre: Guide.libelleNiveau(L.niv, 'debutant', E.unite), texte: guideTexteNiveau(L, E.exp) });
  }
}

/** Au bord, une étiquette par côté nomme les bandes hors de la vue et celles qui n'ont pas trouvé
 *  de place près d'elles (prix réels, origine, heure d'un chiffre publié). Entre deux niveaux :
 *  « | » ; dans un niveau : « · ». */
function guideBords(E, top, bas) {
  const { g, xFin, xMax, exp, unite } = E, H = 15;
  ctx.font = chartFont(9, 600);
  const x = g.pad.left + 6, place = (E.marge ? xFin : xMax) - x - 2, mid = (top + bas) / 2;
  for (const sens of [1, -1]) {
    const hors = E.hors.filter(L => (sens > 0 ? L.niv.pMin > g.maxP : L.niv.pMax < g.minP));
    const sans = (E.sansPlace || []).filter(L => (sens > 0 ? L.y < mid : L.y >= mid));
    if (!hors.length && !sans.length) continue;
    const texte = v => {
      const morceaux = [];
      if (hors.length) morceaux.push((sens > 0 ? '↑ ' : '↓ ') + (exp ? 'hors vue : ' : 'hors de la vue : ') + hors.map(L => Guide.libelleNiveau(L.niv, E.mode, unite, v)).join(' | '));
      if (sans.length) morceaux.push((exp ? 'aussi : ' : sans.length > 1 ? 'autres bandes : ' : 'autre bande : ') + sans.map(L => Guide.libelleNiveau(L.niv, E.mode, unite, v)).join(' | '));
      return morceaux.join(' | ');
    };
    let lignes = null;
    for (const v of [true, 'mini', 'micro']) { const t = texte(v); if (ctx.measureText(t).width + 14 <= place) { lignes = [t]; break; } }
    // Trois lignes au plus, sauf si l'étiquette nomme un chiffre publié : son heure n'est jamais
    // coupée (« … ») — elle prend les lignes qu'il lui faut.
    const publie = hors.concat(sans).some(L => L.niv.raisons.some(r => isNum(r.lu)));
    if (!lignes) lignes = guideLignes(ctx, texte('micro'), place - 14, publie ? 0 : 3);
    const w = Math.min(place, Math.max(...lignes.map(t => ctx.measureText(t).width)) + 14), h = lignes.length * H;
    // Au bord de son côté, sinon au bord opposé (la flèche et les prix disent le côté) ; jamais
    // glissée au milieu des bandes, où elle se lirait comme le nom d'une voisine.
    const pose = guidePlacer(E.rects, x, w, h, [sens > 0 ? top + 2 : bas - h - 2], top, bas, sens > 0 ? 1 : -1, 0, 4)
      || guidePlacer(E.rects, x, w, h, [sens > 0 ? bas - h - 2 : top + 2], top, bas, sens > 0 ? -1 : 1, 0, 4);
    if (!pose) continue;
    etiquettesAFaire.push(() => { ctx.font = chartFont(9, 600); guidePastilleL(ctx, x, pose.y, w, lignes, COLORS.accent2, H); });
    const Ls = hors.concat(sans);
    E.cibles.push({ rects: [guideZone(pose)], prio: 1, niveaux: Ls, lignes,
      titre: (hors.length ? (sens > 0 ? 'Au-dessus' : 'Au-dessous') + ' de la vue' : 'Bandes du graphique') + ' : ' + Ls.map(L => Guide.libelleNiveau(L.niv, 'debutant', unite, true)).join(' | '),
      texte: [].concat(...Ls.map(L => guideTexteNiveau(L, exp).slice(0, L.niv.raisons.length))) });
  }
}

/** « Et ensuite ? » : deux chemins conditionnels dans la marge de futur (la dernière bougie doit
 *  être à l'écran). Les deux sont rendus ENSEMBLE, dans la même variante de texte (la plus riche
 *  qui tient pour les deux, chacune gardant « si … ») et du même poids ; un côté sans niveau
 *  nommé est dit dans une boîte de la même variante. S'ils n'ont pas de place côte à côte : une
 *  seule boîte pour les deux ; sinon, aucun des deux (jamais un seul). */
function guideChemins(E, top, bas, surBougies) {
  if (!(E.finVue && E.marge > 20)) return;
  const { g, D, exp, unite, yDe, xDe, xFin, xMax, itv } = E, G = PARAM.guide, mode = exp ? 'expert' : 'debutant';
  const borne = y => Math.max(top + 2, Math.min(bas - 2, y));
  const der = candles[candles.length - 1], x0 = xDe(candles.length - 1), y0 = borne(yDe(der.close));
  const marge = E.marge, x1 = xFin + marge * 0.3, x2 = xFin + marge * 0.85, encreC = avecAlpha(COLORS.ink1, 0.6);
  const cotes = [[D.suite.haut, 1], [D.suite.bas, -1]].map(([ch, sens]) => {
    const c = { ch, sens };
    if (ch) {
      const ysR = yDe(ch.rx.p), ycR = ch.ry ? yDe(ch.ry.p) : null;
      c.horsS = ysR < top || ysR > bas; c.horsC = ycR !== null && (ycR < top || ycR > bas);
      c.ys = borne(ysR); c.yc = ycR === null ? null : borne(ycR);
      c.pts = [[x0, y0], [x1, c.ys]].concat(c.yc !== null ? [[x2, c.yc]] : []);
    }
    return c;
  });
  const essaisDe = (c, bh) => {
    if (!c.ch) return [c.sens > 0 ? top + 4 : bas - bh - 4];
    const yb = c.yc === null ? c.ys : c.yc;
    return c.sens > 0 ? [yb - bh - 4, yb + 4] : [yb + 4, yb - bh - 4];
  };
  // 1. Deux boîtes, même variante : dans la marge, ou débordant à gauche sans couvrir de bougie.
  let boites = null, variante = null, taille = 9;
  for (const v of Guide.VARIANTES_SUITE[mode]) {
    const tp = v === 'mini' ? 8.5 : 9;
    ctx.font = chartFont(tp, 600);
    const bs = cotes.map(c => {
      let l = Guide.texteSuite(c.ch, mode, unite, chartInterval, G, v, c.sens);
      if (c.ch && v !== 'mini' && (c.horsS || c.horsC)) l = l.concat([exp ? '(hors vue)' : '(niveau hors de la vue)']);
      return { c, l, bw: Math.max(...l.map(t => ctx.measureText(t).width)) + 12, bh: l.length * 12 + 5 };
    });
    // La boîte du chemin vers le haut reste AU-DESSUS de celle du chemin vers le bas (un ordre
    // inversé se lirait à l'envers) : l'une est posée, l'autre doit être de son côté ; puis
    // l'ordre de pose inverse si la première place empêche la seconde.
    const sauve = E.rects.length;
    const poser = (b, autre) => {
      const dansMarge = b.bw <= marge - 4, bx = dansMarge ? Math.max(xFin + 2, xMax - b.bw - 2) : xMax - b.bw - 2;
      const cote = r => (autre && autre.r ? (b.c.sens > 0 ? r.y + r.h > autre.r.y - 2 : r.y < autre.r.y + autre.r.h + 2) : false);
      return bx >= g.pad.left + 2 ? guidePlacer(E.rects, bx, b.bw, b.bh, essaisDe(b.c, b.bh), top, bas, b.c.sens > 0 ? 1 : -1, 0, 8, r => cote(r) || (!dansMarge && surBougies(r))) : null;
    };
    let ok = false;
    for (const [p, q] of [[bs[0], bs[1]], [bs[1], bs[0]]]) {
      p.r = q.r = null;
      if ((p.r = poser(p, null)) && (q.r = poser(q, p))) { ok = true; break; }
      E.rects.length = sauve;
    }
    if (ok) { boites = bs; variante = v; taille = tp; break; }
  }
  // 2. Repli : une boîte pour les deux chemins (variante la plus courte), où elle tient.
  let commune = null;
  if (!boites) {
    ctx.font = chartFont(8.5, 600);
    const l = cotes.map(c => Guide.texteSuite(c.ch, mode, unite, chartInterval, G, 'mini', c.sens).join(' '));
    const bw = Math.max(...l.map(t => ctx.measureText(t).width)) + 12, bh = l.length * 12 + 5, bx = Math.max(g.pad.left + 2, Math.min(xFin + 2, xMax - bw - 2));
    const r = guidePlacer(E.rects, bx, bw, bh, [y0 - bh - 8, y0 + 8, top + 4, bas - bh - 4], top, bas, 1, 0, 12, surBougies)
      || guidePlacer(E.rects, bx, bw, bh, [top + 4], top, bas, 1, 0, 30);
    if (!r) { E.chemins = { variante: null, boites: [] }; return; }    // 3. Ni l'un ni l'autre.
    commune = { r, l, bw, bh };
    variante = 'commune'; taille = 8.5;
  }
  E.chemins = { variante, boites: boites ? boites.map(b => ({ sens: b.c.sens, lignes: b.l, rect: guideZone(b.r) })) : [{ sens: 0, lignes: commune.l, rect: guideZone(commune.r) }] };
  // Les tracés : pointillés, une pointe au bout, un point sur le seuil ; une flèche vers un niveau hors vue.
  for (const c of cotes) {
    if (!c.ch) continue;
    const pts = c.pts;
    ctx.save();
    ctx.beginPath(); ctx.rect(g.pad.left, top, xMax - g.pad.left, g.ph); ctx.clip();
    ctx.strokeStyle = encreC; ctx.lineWidth = 1.3; ctx.setLineDash([5, 4]);
    ctx.beginPath(); pts.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); ctx.setLineDash([]);
    const [xa, ya] = pts[pts.length - 2], [xe, ye] = pts[pts.length - 1], ang = Math.atan2(ye - ya, xe - xa);
    ctx.fillStyle = encreC;
    ctx.beginPath(); ctx.moveTo(xe, ye); ctx.lineTo(xe - 6 * Math.cos(ang - 0.45), ye - 6 * Math.sin(ang - 0.45)); ctx.lineTo(xe - 6 * Math.cos(ang + 0.45), ye - 6 * Math.sin(ang + 0.45)); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(x1, c.ys, 2.5, 0, Math.PI * 2); ctx.fill();
    if (c.horsC || (c.yc === null && c.horsS)) { ctx.font = chartFont(10, 700); ctx.fillText(ye <= top + 2 ? '↑' : '↓', xe + 3, ye <= top + 2 ? top + 11 : bas - 3); }
    ctx.restore();
  }
  ctx.font = chartFont(9, 600);
  // Les textes du survol.
  const pc = Guide.pctParam(G.distanceMax);
  const noms = (niv, rr) => rr.nom + ' ' + Guide.prixR(rr, unite) + Guide.tagLu(rr) + (niv.raisons.length > 1 ? ' — dans une bande de ' + niv.raisons.length + ' raisons' : '');
  const dans = D.suite.dans ? ' Le prix est dans cette bande : les deux chemins partent de ses deux bords.' : '';
  const explication = c => {
    const ch = c.ch, sens = c.sens;
    if (!ch) return 'Aucun niveau nommé (plus haut / plus bas d’hier ou des 24 h, zone de demi-tours, mur, option) à moins de ' + pc + ' % du prix ' + (sens > 0 ? 'au-dessus' : 'au-dessous') + ' : pas de chemin à dessiner de ce côté.';
    if (exp) return 'Si clôture ' + itv + (sens > 0 ? ' > ' : ' < ') + 'seuil : ' + noms(ch.seuil, ch.rx) + '. ' + (ch.cible ? 'Niveau suivant : ' + noms(ch.cible, ch.ry) + '.' : 'Aucun autre niveau nommé à moins de ' + pc + ' %.');
    return 'Si une bougie ' + itv + ' clôture ' + (sens > 0 ? 'au-dessus de ' : 'sous ') + Guide.prixR(ch.rx, unite) + ' (' + noms(ch.seuil, ch.rx) + '), '
      + (ch.cible ? 'le niveau nommé suivant est ' + Guide.prixR(ch.ry, unite) + ' (' + noms(ch.cible, ch.ry) + ').' : 'aucun autre niveau nommé n’est proche.')
      + (c.horsS || c.horsC ? ' Une partie de ce chemin sort de la vue : le prix du niveau est dans le texte.' : '');
  };
  const commun = (exp ? 'Conditionnel, pas une prévision ; aucune probabilité calculée.' : 'Deux chemins CONDITIONNELS, pas une prévision : montrés ensemble, avec le même poids ; aucun n’est privilégié, aucune probabilité n’est calculée.') + dans;
  const segsDe = c => { const s = []; if (c.pts) for (let k = 1; k < c.pts.length; k++) s.push([c.pts[k - 1][0], c.pts[k - 1][1], c.pts[k][0], c.pts[k][1]]); return s; };
  const titreDe = c => 'Et ensuite ? ' + Guide.texteSuite(c.ch, 'debutant', unite, chartInterval, G, 'plein', c.sens).join(' ');
  if (boites) {
    for (const b of boites) {
      const { r, l, bw, bh, c } = b, coul = c.sens > 0 ? COLORS.candleUp : COLORS.candleDown;
      etiquettesAFaire.push(() => {
        ctx.font = chartFont(taille, 600);
        ctx.globalAlpha = c.ch ? 1 : 0.9;
        ctx.fillStyle = COLORS.bulle; ctx.beginPath(); ctx.roundRect(r.x, r.y, bw, bh, 4); ctx.fill(); ctx.globalAlpha = 1;
        ctx.fillStyle = c.ch ? coul : COLORS.ink3; ctx.fillRect(r.x + 2, r.y + 3, 2.5, bh - 6);
        ctx.fillStyle = c.ch ? COLORS.ink1 : COLORS.text;
        l.forEach((t, k) => ctx.fillText(t, r.x + 7, r.y + 12 + k * 12));
      });
      E.cibles.push({ rects: [guideZone(r)], segs: segsDe(c), prio: 3, titre: titreDe(c), texte: [explication(c), commun] });
    }
  } else {
    const { r, l, bw, bh } = commune;
    etiquettesAFaire.push(() => {
      ctx.font = chartFont(8.5, 600);
      ctx.fillStyle = COLORS.bulle; ctx.beginPath(); ctx.roundRect(r.x, r.y, bw, bh, 4); ctx.fill();
      ctx.fillStyle = COLORS.ink3; ctx.fillRect(r.x + 2, r.y + 3, 2.5, bh - 6);
      ctx.fillStyle = COLORS.ink1; l.forEach((t, k) => ctx.fillText(t, r.x + 7, r.y + 12 + k * 12));
    });
    E.cibles.push({ rects: [guideZone(r)], segs: [].concat(...cotes.map(segsDe)), prio: 3, titre: 'Et ensuite ? ' + cotes.map(c => Guide.texteSuite(c.ch, 'debutant', unite, chartInterval, G, 'court', c.sens).join(' ')).join(' ; '),
      texte: cotes.map(explication).concat([commun]) });
  }
}

/** Le contexte des textes de figures : heures (fin de bougie), durée mesurée, bougie en cours. */
function guideCtxFigures() {
  const R = GUIDE_FORMES.val, n = candles.length;
  return { n: R ? R.n : n - 1, intervalle: chartInterval, duree: candles[n - 2].time - candles[0].time, temps: cols().time,
    pas: n > 1 ? candles[1].time - candles[0].time : 0, maintenant: Horloges.maintenant(), j: n - 1, horizon: PARAM.guide.horizon };
}
/** Le style d'une figure (plan §5.1) : tirets, épaisseur, alpha des traits et de l'aplat. Une
 *  figure finie s'efface au fil des bougies closes (base × (1 − âge / (garder + 1)), plancher
 *  0,15) ; l'âge ne change qu'à une clôture : rien à redessiner entre deux. */
function guideStyleFigure(f, jClos, mode) {
  const G = PARAM.guide;
  if (f.fin) {
    const age = Math.max(0, jClos - f.jFin);
    const garder = f.fin === 'atteint' ? (mode === 'debutant' ? G.garderInvalide : G.garderFini) : f.fin === 'abandon' ? G.garderEbauche : G.garderInvalide;
    const k = 1 - age / (garder + 1), base = f.fin === 'atteint' ? 0.35 : 0.75;
    const a = Math.max(0.15, base * k);
    return f.fin === 'atteint' ? { dash: [], lw: 1.6, a, aplat: 0.03 * a / base, age }
      : { dash: [2, 3], lw: 1.4, a, aplat: 0.03 * a / base, croix: true, age };
  }
  if (f.ebauche) return { dash: [3, 3], lw: 1.4, a: 0.55, aplat: 0.04, age: 0 };
  if (f.phase === 'confirme') return { dash: [], lw: 1.8, a: 0.75, aplat: 0.09, age: 0 };
  return { dash: [5, 3], lw: 1.8, a: 0.75, aplat: 0.09, age: 0 };
}
/** La géométrie d'une figure, en (indice de bougie, prix) : le zigzag de ses points, les droites
 *  qui la VALIDENT (ligne de cou, bornes, côté du mât), les autres droites, l'aplat, ses points
 *  et le point en attente d'une ébauche. iFin : la bougie en cours pour une figure vivante (ses
 *  lignes suivent le prix jusqu'à elle), celle de son issue pour une figure finie. */
function guideFigureGeo(f, iFin, suit) {
  const fam = Guide.famille(f), Lg = Guide.ligne, o = { zig: [], valide: [], autres: [], aplat: [], points: [], petits: [], creux: null, pointe: null };
  const pt = q => [q.i, q.p];
  const dte = (L, i0, i1) => [[i0, Lg(L, i0)], [i1, Lg(L, i1)]];
  const pend = f.ebauche && f.pend ? f.pend : null;
  // Le point en attente suit la bougie en cours quand elle va plus loin (graphique : toutes les 5 s).
  const creux = pend ? (suit ? [suit.i, suit.p] : [pend.i, pend.p]) : null;
  const finConf = f.phase === 'confirme' && isNum(f.jConf) ? Math.min(iFin, f.jConf) : iFin;
  if (fam === 'extremes' || fam === 'ete') {
    const triple = /^triple/.test(f.type), ete = fam === 'ete';
    const Q = ete ? [f.G, f.N1, f.T, f.N2, f.D] : triple ? [f.a, f.c1, f.b, f.c2, f.c] : [f.a, f.cou, f.b];
    const zig = Q.map(pt);
    if (creux) zig[zig.length - 1] = creux;
    o.zig.push(zig);
    o.points = (ete ? [f.G, f.T, f.D] : triple ? [f.a, f.b, f.c] : [f.a, f.b]).map(pt);
    if (creux) { o.points.pop(); o.creux = creux; }
    const niv = i => (ete ? Lg(f.couL, i) : f.niveau), i0 = Q[0].i, iD = zig[zig.length - 1][0];
    o.valide.push([[i0, niv(i0)], [iFin, niv(iFin)]]);
    o.aplat = zig.concat([[iD, niv(iD)], [i0, niv(i0)]]);
  } else {
    const drap = fam === 'drapeau', i0 = drap ? f.debutPause : f.debut;
    const iB = Math.max(i0 + 1, Math.min(finConf, isFinite(f.apex) ? Math.floor(f.apex) : Infinity));
    const H = dte(f.hautL, i0, iB), B = dte(f.basL, i0, iB);
    if (drap) {
      o.zig.push([[f.mat.i0, f.mat.p0], [f.mat.i1, f.mat.p1]]);
      o.valide.push(f.sens > 0 ? H : B); o.autres.push(f.sens > 0 ? B : H);
    } else o.valide.push(H, B);
    o.aplat = [H[0], H[1], B[1], B[0]];
    o.petits = (f.pivotsH || []).concat(f.pivotsB || []).filter(q => !pend || q.i !== pend.i).map(pt);
    if (creux) o.creux = creux;
    if (isFinite(f.apex)) o.pointe = f.apex;
  }
  return o;
}
/** Trace une figure (graphique) dans le style de son état, le même pour les deux modes ; seuls
 *  l'épaisseur des traits (Débutant : la ligne qui valide est la plus marquée, le zigzag discret)
 *  et les étiquettes diffèrent. → { segs (survol), ys, xd, yd (dernier point), st, encre, geo } */
function guideFigureTracer(E, f) {
  const { g, xDe: X, yDe: Y, deb } = E, R = GUIDE_FORMES.val, jClos = R.n - 1, G = PARAM.guide;
  const vivante = !f.fin, iFin = vivante ? candles.length - 1 : f.jFin;
  const st = guideStyleFigure(f, jClos, deb ? 'debutant' : 'expert');
  // Le point en attente d'une ébauche suit la bougie en cours quand elle va plus loin que lui.
  let suit = null;
  if (vivante && f.ebauche && f.pend) {
    const cur = candles[candles.length - 1], ext = f.s > 0 ? cur.high : cur.low;
    if (f.s > 0 ? ext > f.pend.p : ext < f.pend.p) suit = { i: candles.length - 1, p: ext };
  }
  const geo = guideFigureGeo(f, iFin, suit);
  const encre = avecAlpha(COLORS.ink1, st.a), segs = [], ys = [];
  const px = q => [X(q[0]), Y(q[1])];
  const trait = (pts, lw, dash, coul) => {
    ctx.strokeStyle = coul; ctx.lineWidth = lw; ctx.setLineDash(dash);
    ctx.beginPath();
    pts.forEach((q, k) => { const [x, y] = px(q); ys.push(y); if (k) { const [x0, y0] = px(pts[k - 1]); segs.push([x0, y0, x, y]); ctx.lineTo(x, y); } else ctx.moveTo(x, y); });
    ctx.stroke();
  };
  ctx.save();
  ctx.beginPath(); ctx.rect(g.pad.left, g.pad.top, E.xMax - g.pad.left, g.ph); ctx.clip();
  if (geo.aplat.length > 2) {
    ctx.beginPath(); geo.aplat.forEach((q, k) => { const [x, y] = px(q); if (k) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
    ctx.closePath(); ctx.fillStyle = avecAlpha(COLORS.ink1, st.aplat); ctx.fill();
  }
  // Débutant (amendement C5) : la ligne qui valide est le trait le plus marqué, en tirets [6,3],
  // jusqu'à la bougie en cours ; le zigzag et les autres droites passent à 1 px, alpha 0,5.
  const mince = deb ? avecAlpha(COLORS.ink1, Math.min(0.5, st.a)) : encre;
  const fam = Guide.famille(f), mat = fam === 'drapeau';
  for (const z of geo.zig) trait(z, deb ? 1 : mat ? 1.2 : st.lw, mat ? [2, 3] : deb ? (f.fin ? [2, 3] : []) : st.dash, mince);
  for (const v of geo.valide) trait(v, st.lw, deb && !f.fin ? (f.phase === 'confirme' ? [] : [6, 3]) : st.dash, encre);
  for (const v of geo.autres) trait(v, deb ? 1 : st.lw, deb && !f.fin ? [6, 3] : st.dash, mince);
  ctx.setLineDash([]);
  // Expert (amendement D3) : les droites d'une figure vivante prolongées de 8 bougies au plus dans
  // la marge de futur, dans le style de la figure, plus pâles ; un petit repère à la pointe.
  if (!deb && vivante && f.phase !== 'confirme' && E.finVue) {
    const iMax = Math.min(iFin + 8, isFinite(geo.pointe) ? geo.pointe : Infinity);
    if (iMax > iFin) {
      const pale = avecAlpha(COLORS.ink1, st.a * 0.5);
      for (const v of geo.valide.concat(geo.autres)) {
        const [a, b] = v, pente = (b[1] - a[1]) / Math.max(1e-9, b[0] - a[0]);
        trait([b, [iMax, b[1] + pente * (iMax - b[0])]], 1, st.dash.length ? st.dash : [4, 3], pale);
      }
      ctx.setLineDash([]);
      if (isFinite(geo.pointe) && geo.pointe <= iFin + 8) {
        const v = geo.valide[0], pente = (v[1][1] - v[0][1]) / Math.max(1e-9, v[1][0] - v[0][0]);
        ctx.beginPath(); ctx.arc(X(geo.pointe), Y(v[1][1] + pente * (geo.pointe - v[1][0])), 2.5, 0, Math.PI * 2);
        ctx.strokeStyle = pale; ctx.lineWidth = 1; ctx.stroke();
      }
    }
  }
  for (const q of geo.points) { const [x, y] = px(q); ys.push(y); ctx.beginPath(); ctx.arc(x, y, deb ? 3.5 : 3, 0, Math.PI * 2); ctx.fillStyle = encre; ctx.fill(); }
  for (const q of geo.petits) { const [x, y] = px(q); ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fillStyle = mince; ctx.fill(); }
  // Le point en attente : un cercle creux de 7 px.
  if (geo.creux && !f.fin) {
    const [x, y] = px(geo.creux); ys.push(y);
    ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2); ctx.fillStyle = COLORS.surface; ctx.fill();
    ctx.strokeStyle = avecAlpha(COLORS.ink1, 0.85); ctx.lineWidth = 1.4; ctx.stroke();
  }
  // La marque ✗ d'une figure tombée : sur la bougie de fin, au niveau qui l'a fait tomber.
  let croix = null;
  if (st.croix) {
    const ev = (f.journal || []).filter(x => x.j === f.jFin).pop() || {};
    const p = f.fin === 'abandon' ? (isNum(f.pAbandon) ? f.pAbandon : f.pend && f.pend.p) : isNum(ev.p) ? ev.p
      : f.fin === 'expire_avant' && f.hautL ? (Guide.ligne(f.hautL, f.jFin) + Guide.ligne(f.basL, f.jFin)) / 2 : isNum(ev.c) ? ev.c : f.invalidation;
    if (isNum(p)) {
      const x = X(f.jFin), y = Y(p), r = 5;
      ctx.strokeStyle = avecAlpha(COLORS.ink1, Math.max(0.5, st.a)); ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(x - r, y - r); ctx.lineTo(x + r, y + r); ctx.moveTo(x + r, y - r); ctx.lineTo(x - r, y + r); ctx.stroke();
      croix = { x, y }; ys.push(y);
    }
  }
  ctx.restore();
  const d = Guide.dernierPoint(f, G), qd = geo.creux || (geo.points.length ? geo.points[geo.points.length - 1] : geo.valide[0][1]);
  return { segs, ys, xd: X(d), yd: Y(qd[1]), st, encre, geo, croix, iFin };
}
/** L'objectif théorique (Expert) : en tirets à partir de la 1re clôture au-delà, pâli s'il est
 *  atteint, jamais pour une figure tombée ; hors de l'échelle, une flèche au bord avec son prix. */
function guideFigureObjectif(E, f, tr) {
  const { g, exp, unite, yDe, xDe: X, xFin, xMax } = E, top = g.pad.top, bas = top + g.ph, G = PARAM.guide;
  if (!exp || ['invalide', 'invalide_avant', 'abandon', 'expire_avant', 'devenu_triple'].includes(f.fin) || f.ebauche) return null;
  let obj = null, sensO = f.sens;
  if (f.phase === 'confirme') obj = f.objectif;
  else if (f.demi) { const N = Guide.niveauxFigure(f, candles.length - 1, G), o = N.objectifs[0]; if (o) { obj = o.p; sensO = o.s; } }
  if (!isNum(obj)) return null;
  const iObj = isNum(f.jConf) && f.phase === 'confirme' ? f.jConf : f.jDemi;
  const xa = X(iObj), xb = f.fin ? Math.max(xa + 12, X(f.jFin)) : Math.max(xa + 30, Math.min(xMax, xFin + (xMax - xFin) * 0.5));
  const xDroite = E.marge ? xFin - 2 : xMax - 2, yObj = yDe(obj);
  const t = (f.fin === 'atteint' ? 'obj. théorique atteint · ' : 'obj. théorique (convention, non garanti) · ') + Guide.prix(obj, unite);
  ctx.font = chartFont(8.5, 600);
  const w = ctx.measureText(t).width + 10;
  if (yObj > top && yObj < bas) {
    ctx.save();
    ctx.beginPath(); ctx.rect(g.pad.left, top, xMax - g.pad.left, g.ph); ctx.clip();
    ctx.strokeStyle = avecAlpha(COLORS.ink1, f.fin === 'atteint' ? 0.3 : 0.55); ctx.lineWidth = 1; ctx.setLineDash([2, 4]);
    ctx.beginPath(); ctx.moveTo(xa, yObj); ctx.lineTo(xb, yObj); ctx.stroke(); ctx.setLineDash([]);
    ctx.restore();
    tr.segs.push([xa, yObj, xb, yObj]);
    const rx = Math.max(g.pad.left + 2, Math.min(xb, xDroite) - w);
    const r = guidePlacer(E.rects, rx, w, 13, sensO < 0 ? [yObj + 3, yObj - 16] : [yObj - 16, yObj + 3], top, bas, sensO < 0 ? 1 : -1, 0, 1);
    if (r) etiquettesAFaire.push(() => { ctx.font = chartFont(8.5, 600); ctx.globalAlpha = 0.92; guidePastille(ctx, r.x, r.y, r.w, r.h, t, null); ctx.globalAlpha = 1; });
    return { p: obj, y: yObj, dansVue: true };
  }
  // Hors de l'échelle : une flèche au bord (haut ou bas), avec le prix.
  const haut = yObj <= top, tf = (haut ? '↑ ' : '↓ ') + t;
  const wf = ctx.measureText(tf).width + 10, rx = Math.max(g.pad.left + 2, Math.min(X(iObj), xDroite - wf));
  const r = guidePlacer(E.rects, rx, wf, 13, [haut ? top + 2 : bas - 15], top, bas, haut ? 1 : -1, 0, 3);
  if (r) {
    etiquettesAFaire.push(() => { ctx.font = chartFont(8.5, 600); ctx.globalAlpha = 0.92; guidePastille(ctx, r.x, r.y, r.w, r.h, tf, null); ctx.globalAlpha = 1; });
    tr.fleche = { x: r.x, y: r.y, w: r.w, h: r.h, texte: tf };
  }
  return { p: obj, y: yObj, dansVue: false, fleche: !!r };
}
/** Une figure en Expert : tracé commun, objectif, libellé (≤ 80 caractères, à 120 px au plus de
 *  son dernier point ; sinon la forme courte ; sinon pas de libellé, la bulle s'ouvre au survol du
 *  tracé), bulle (règle, niveaux du moment, bilan, journal, figures invalidées récemment). */
function guideForme(E, f, surBougies) {
  const { g, unite } = E, G = PARAM.guide, R = GUIDE_FORMES.val, top = g.pad.top, bas = top + g.ph;
  const tr = guideFigureTracer(E, f);
  tr.objectif = guideFigureObjectif(E, f, tr);
  const b = R.bilan[f.type], ctxF = E.ctxF;
  ctx.font = chartFont(9, 650);
  const xDroite = E.marge ? E.xFin - 2 : E.xMax - 2, hL = 15;
  const yH = Math.min(...tr.ys), yB = Math.max(...tr.ys);
  const loin = r => { const dx = Math.max(r.x - tr.xd, 0, tr.xd - r.x - r.w), dy = Math.max(r.y - tr.yd, 0, tr.yd - r.y - r.h); return Math.hypot(dx, dy) > 120; };
  let pose = null, lignes = null;
  for (const texte of Guide.libellesFormeExpert(f, b, ctxF, G)) {
    const wT = ctx.measureText(texte).width + 14, place = xDroite - g.pad.left - 4;
    const w = Math.min(wT, place);
    lignes = w < wT ? guideLignes(ctx, texte, w - 12, 2) : [texte];
    if (lignes.length > 2) continue;
    const h = lignes.length * hL;
    const x0 = Math.max(g.pad.left + 2, Math.min(tr.xd - w / 2, xDroite - w));
    const bas1 = f.sens > 0 && Guide.famille(f) !== 'lignes';
    const essais = (bas1 ? [yB + 6, yH - h - 6] : [yH - h - 6, yB + 6]).concat([tr.yd - h - 8, tr.yd + 8]);
    const vers = essais[0] < (top + bas) / 2 ? 1 : -1;
    const ev1 = r => loin(r) || surBougies(r), ev2 = loin;
    pose = guidePlacer(E.rects, x0, w, h, essais, top, bas, vers, 0, 6, ev1) || guidePlacer(E.rects, x0, w, h, essais, top, bas, vers, 0, 6, ev2);
    if (pose) break;
  }
  const entree = { f, tr, pose, lignes: pose ? lignes : null, v: null };
  if (pose) etiquettesAFaire.push(() => { ctx.font = chartFont(9, 650); guidePastilleL(ctx, pose.x, pose.y, pose.w, lignes, tr.encre, hL); });
  E.figures.push(entree);
  E.cibles.push({ rects: pose ? [guideZone(pose)] : [], segs: tr.segs, prio: 2, figure: entree, titre: Guide.titreForme(f, 'expert', ctxF),
    texte: Guide.texteFormeExpert(f, b, ctxF, G, unite, { concurrentes: Guide.concurrentes(R, f, G), tombees: Guide.tombees(R, 3) }) });
}
/** La ligne qui valide une figure, en pixels (segments), et une gêne « dure » pour les textes
 *  (amendement C5) : un rectangle qui la couvre. */
function guideSegsValide(E, tr) {
  return tr.geo.valide.map(([a, b]) => [E.xDe(a[0]), E.yDe(a[1]), E.xDe(b[0]), E.yDe(b[1])]);
}
function guideSurSegs(S) {
  return r => S.some(s => {
    const n = Math.max(2, Math.ceil(Math.hypot(s[2] - s[0], s[3] - s[1]) / 4));
    for (let k = 0; k <= n; k++) { const x = s[0] + (s[2] - s[0]) * k / n, y = s[1] + (s[3] - s[1]) * k / n; if (x >= r.x - 2 && x <= r.x + r.w + 2 && y >= r.y - 2 && y <= r.y + r.h + 2) return true; }
    return false;
  });
}

/** Badge du régime (graphique) : à droite de la pastille de variation, rangée du haut. */
function guideRegimeBadge(E, x, W) {
  ctx.font = chartFont(9.5, 650);
  const max = W - 75 - 8 - x;
  if (max < 40) return;
  // La forme pleine si elle tient, sinon la courte (régime, ADX, compression), coupée en dernier recours.
  let t = Guide.texteRegime(E.D.regime, E.mode, PARAM.guide);
  if (ctx.measureText(t).width + 14 > max) t = Guide.texteRegime(E.D.regime, E.mode, PARAM.guide, true);
  const tt = guideCouper(ctx, t, max - 14), w = Math.min(max, ctx.measureText(tt).width + 14);
  const r = E.D.regime, coul = r.cle === 'hausse' ? COLORS.candleUp : r.cle === 'baisse' ? COLORS.candleDown : COLORS.ink3;
  guidePastille(ctx, x, 19, w, 15, tt, coul);
  const G = PARAM.guide, itv = Guide.nomIntervalle(chartInterval);
  const valeurs = r.cle === 'inconnu' ? 'Pas assez de bougies pour l’ADX.' : 'Valeurs sur la dernière bougie ' + itv + ' close : ADX ' + Math.round(r.adx) + ', +DI ' + Math.round(r.pdi) + ', −DI ' + Math.round(r.mdi)
    + (r.emaHaut === null ? '.' : ', EMA ' + G.emaCourte + (r.emaHaut ? ' au-dessus de' : ' sous') + ' l’EMA ' + G.emaLongue + '.');
  E.cibles.push({ rects: [{ x0: x, y0: 17, x1: x + w, y1: 36 }], prio: 0, titre: Guide.texteRegime(r, 'debutant', G),
    texte: (E.exp ? [] : ['L’ADX mesure la FORCE d’un mouvement, pas son sens : au-dessus de ' + G.adxTendance + ' le prix avance nettement dans une direction, sous ' + G.adxSans + ' il hésite. +DI et −DI disent quel côté domine ; l’EMA ' + G.emaCourte + ' et l’EMA ' + G.emaLongue + ' sont les moyennes du prix sur ' + G.emaCourte + ' et ' + G.emaLongue + ' bougies.'])
      .concat([valeurs,
        'Règle (convention) : ADX ≥ ' + G.adxTendance + ' = tendance, dont le sens se lit sur +DI/−DI et l’EMA ' + G.emaCourte + '/' + G.emaLongue + ' (s’ils divergent : « sens incertain ») ; ADX ≤ ' + G.adxSans + ' = sans tendance nette ; entre les deux = tendance faible.',
        'Compression : bandes de Bollinger parmi les ' + G.bbPercentile + ' % les plus étroites des ' + G.bbFenetre + ' dernières bougies' + (E.exp ? '' : ' (les bandes s’écartent quand le prix bouge beaucoup, se resserrent quand il bouge peu)') + '. Un régime décrit le passé récent, il ne prédit pas la suite.']) });
}

/** Calque : état de chaque niveau au prix LIVE, lecture du moment. Ne recalcule rien. */
function guideCalque() {
  const E = guideEtat;
  if (!E || !overlays.guide) return;
  E.survol = null; E.bulle = null;   // posés par guideSurvol, s'il y a un curseur
  if (E.deb) { guideCalqueDebutant(E); return; }
  const G = PARAM.guide, cur = candles[candles.length - 1], { g } = E;
  const yLive = isNum(livePrice) ? E.yDe(livePrice) : null;
  cx.save();
  cx.font = chartFont(9, 600);
  let enTest = null;
  for (const L of E.niveaux) {
    const e = Guide.etatLive(L.niv, livePrice, cur, G);
    L.live = e;
    if (e.mot === 'test' && !enTest) enTest = L.niv;
    if (!L.etiq) continue;
    const et = L.etiq, hLib = et.lignes.length * et.h;
    // La ligne du prix live passe sur le libellé : il est reposé au-dessus d'elle.
    if (yLive !== null && yLive > et.y - 3 && yLive < et.y + hLib + 3) guidePastilleL(cx, et.x, et.y, et.w, et.lignes, COLORS.accent2, et.h);
    // L'état : à droite du libellé, ou sur la ligne du dessous (écran étroit).
    const x = et.enLigne ? et.x + et.w + 3 : et.x, yE = et.enLigne ? et.y : et.y + hLib, place = et.enLigne ? et.x + et.wR - x : et.wR;
    // Le texte du mode s'il tient, puis la forme courte, puis l'abrégé expert ; le mot d'abord.
    let t = null;
    for (const [m, v] of [[E.mode, 'plein'], [E.mode, 'court'], ['expert', 'court'], [E.mode, 'mini']]) { const s = Guide.texteEtatLive(e, m, v); if (cx.measureText(s).width + 14 <= place) { t = s; break; } }
    if (!t) t = guideCouper(cx, Guide.texteEtatLive(e, E.mode, 'court'), place - 12);
    const w = Math.min(cx.measureText(t).width + 14, place);
    if (w < 30) continue;
    const casse = /^(demi|valide)/.test(e.mot || '');
    const coul = casse ? (L.niv.ferme.sens > 0 ? COLORS.candleUp : COLORS.candleDown)
      : e.mot === 'test' || e.mot === 'proche' || e.mot === 'meche' || e.mot === 'mecheCours' || e.mot === 'franchi' ? COLORS.warn : COLORS.ink3;
    guidePastille(cx, x, yE, w, et.h, t, coul);
  }
  E.enTest = enTest;
  guideCalqueFigures(E);
  if (!E.exp && E.lectureLignes) {
    // La lecture ne nomme que ce qui est dessiné (E.formes : formes de la vue).
    const forme = E.formes[0] || null;
    const V = Guide.VARIANTES_LECTURE[guideHautMemo ? guideHautMemo.variante : 0] || {};
    const txt = Guide.lecture(Object.assign({ prix: isNum(livePrice) ? livePrice : null, unite: E.unite, choix: E.D.choix, enTest, regime: E.D.regime, forme,
      formeQuand: E.formeQuand, maintenant: !E.finVue }, V));
    cx.font = chartFont(10, 600);
    const wMax = E.xMax - g.pad.left - 16 - 14;
    if (!E.lectureCache || E.lectureCache.t !== txt) E.lectureCache = { t: txt, l: guideLignes(cx, txt, wMax, E.lectureLignes) };
    const lignes = E.lectureCache.l, h = lignes.length * 14 + 4;
    const w = Math.max(...lignes.map(l => cx.measureText(l).width)) + 14;
    cx.globalAlpha = 0.94; cx.fillStyle = COLORS.bulle;
    cx.beginPath(); cx.roundRect(g.pad.left + 2, E.lectureY, w, h, 5); cx.fill(); cx.globalAlpha = 1;
    cx.fillStyle = COLORS.accent2; cx.fillRect(g.pad.left + 4, E.lectureY + 3, 2.5, h - 6);
    cx.fillStyle = COLORS.ink1;
    lignes.forEach((l, k) => cx.fillText(l, g.pad.left + 11, E.lectureY + 13 + k * 14));
  }
  cx.restore();
}

// ─── Mode Débutant : l'écran calme ─────────────────────────────────────────
// Sur le tracé, au plus PARAM.guide.debutant.items textes d'une ligne : la phrase (calque, elle
// suit le prix live), le repère du haut, le repère du bas (calque : leur couleur dit leur état),
// le libellé du scénario 1, la forme, la ligne des scénarios. Le détail est dans la bulle.
const DEB_POLICE_PHRASE = 11.5, DEB_POLICE_LIGNE = 10.5;
/** Les deux repères du Débutant au prix live (au dernier prix clos sans prix live) ; deux repères
 *  à moins de PARAM.guide.debutant.ecartAtr × ATR l'un de l'autre n'en font pas deux. */
function debReperes(D) {
  const px = isNum(livePrice) ? livePrice : D.ref;
  return Object.assign(Guide.choisirReperes(D.reperes, px, D.atr * PARAM.guide.debutant.ecartAtr), { prix: px });
}
/** Enregistre un texte posé (registre relu par les tests). */
function debItem(role, texte, rect) {
  if (!debEtat) return null;
  const it = { role, texte, rect };
  debEtat.items.push(it);
  return it;
}
/** L'échelle de prix affichée ({ lo, hi }), ou null avant le premier dessin : la phrase ne dit
 *  « entre B et A » que si les deux repères y sont. */
function debVue() { return geoPrix && isNum(geoPrix.minP) && isNum(geoPrix.maxP) ? { lo: geoPrix.minP, hi: geoPrix.maxP } : null; }
/** Les phrases possibles à ce dessin (le prix live ne change que la bande « touchée ») : pour
 *  décider si la ligne des scénarios partage la rangée de la phrase sans la raccourcir. */
function debPhrases(D, maintenant) {
  const ch = debReperes(D), base = { prix: ch.prix, unite: guideUnite(), choix: D.choix, reperes: ch, regime: D.regime, maintenant, itv: chartInterval, vue: debVue() };
  return [null, ch.dessus, ch.dessous].filter((x, k) => !k || x).map(enTest => Guide.phrasesDebutant(Object.assign({}, base, { enTest })));
}
/** La hauteur des rangées du haut du tracé en Débutant : la phrase (si le Guide est affiché), la
 *  ligne des scénarios à sa droite si les deux tiennent avec 12 px d'écart sans que la phrase
 *  perde un mot, sinon sur une 2e rangée. Mémorisée (debHautMemo, relue par la ligne). */
let debHautMemo = null;
function debHaut(W, padL, padR) {
  const pw = W - padL - padR, P = PARAM.guide.debutant, etroit = pw < P.etroit;
  const D = overlays.guide ? guideDonnees() : null;
  const ligne = scenLigneDebutant(pw);
  const maintenant = Math.min(candles.length, viewEnd) < candles.length;
  const phrases = D ? debPhrases(D, maintenant) : [];
  const cle = [pw, ligne, maintenant, phrases.map(V => V.join('|')).join('||')].join('#');
  if (!debHautMemo || debHautMemo.cle !== cle) {
    let rangs = D ? 1 : 0, partage = false, wLigne = 0;
    if (ligne) {
      ctx.font = chartFont(DEB_POLICE_LIGNE, 650);
      wLigne = ctx.measureText(ligne).width + 16;
      if (D) {
        const max = etroit ? P.phraseEtroit : P.phrase;
        const mesure = taille => { ctx.font = chartFont(taille, 650); return t => ctx.measureText(t).width + 16; };
        const rang = (V, px, m) => { const k = V.findIndex(t => t.length <= max && m(t) <= px); return k < 0 ? V.length : k; };
        // Partager la rangée seulement si la phrase y tient ENTIÈRE, à 11,5 px (la variante que
        // debPhraseChoisir prendrait sur toute la largeur, à 11,5 ou 10,5 px, sans coupure).
        partage = phrases.every(V => { const k = rang(V, pw - 8 - wLigne - 12, mesure(DEB_POLICE_PHRASE)); return k < V.length && k === rang(V, pw - 8, mesure(10.5)); });
        if (!partage) rangs = 2;
      } else rangs = 1;
    }
    debHautMemo = { cle, rangs, partage, ligne, wLigne, phrase: !!D };
  }
  return debHautMemo.rangs ? debHautMemo.rangs * 22 + 2 : 0;
}
/** Le chemin d'un repère du Débutant : son seuil (ce repère), sa cible (le repère suivant au-delà). */
const debChemin = (niv, suivant, sens) => (niv ? { sens, seuil: niv, cible: suivant || null, rx: niv.principale, ry: suivant ? suivant.principale : null } : null);
/** Les raisons « tout près » d'un repère du Débutant (bulle) : celles de sa bande Expert à moins de
 *  max(demi-bande, 0,25 × ATR) de son prix, du même côté du prix live, hors des deux repères de
 *  l'écran et du repère suivant. */
function guidePresDebutant(L, E) {
  const n = L.niv, b = n.bande;
  if (!b) return [];
  const atr = E.D && isNum(E.D.atr) ? E.D.atr : 0, lim = Math.max(isNum(n.demi) ? n.demi : 0, 0.25 * atr);
  const live = isNum(livePrice) ? livePrice : null, S = E.debSel || {};
  const exclus = [S.dessus, S.dessous, L.suivant].filter(Boolean).map(x => x.p);
  return b.raisons.filter(r => isNum(r.p) && r.p !== n.p && Math.abs(r.p - n.p) <= lim && !exclus.includes(r.p)
    && (live === null || (r.p > live) === (n.p > live)));
}
/** Le texte d'un repère pour la bulle Débutant : chaque raison en mots, ce qui est tout près (les
 *  autres prix de sa bande Expert), son chemin (de CE repère au suivant), sa bande. */
function guideTexteNiveauDebutant(L, E) {
  const out = [], R = L.niv.raisons, now = Horloges.maintenant(), pas = geoPrix && geoPrix.pas > 0 ? geoPrix.pas : 900;
  if (Guide.optionsSeules(L.niv)) {
    const lu = Math.max(...R.map(r => (isNum(r.lu) ? r.lu : -Infinity)));
    out.push('Une estimation, tirée des contrats d’options de la plateforme Deribit' + (isFinite(lu) ? ', relevée ' + Guide.ageDebutant(lu, now) : '') + '.');
  }
  for (const r of R) out.push(Guide.origineDebutant(r, E.unite, now, pas));
  // Le « Haut des 24 h » du graphique (bougies, en direct) et celui de la carte des infos du marché
  // (publié, 24 h glissantes de Binance) peuvent différer : la bulle dit pourquoi.
  if (activeSymbol === 'BTCUSDT' && R.some(r => /^h24_/.test(r.cle)))
    out.push('La carte « Fourchette des 24 h » des infos du marché peut dire un autre chiffre : elle est publiée à heure fixe, et ses 24 h ne commencent pas à la même minute que celles de ce graphique.');
  // « Tout près » : les autres prix de sa bande Expert À CÔTÉ de ce repère seulement — à moins
  // d'une demi-bande (au moins 0,25 × ATR), du même côté du prix, jamais l'autre repère de l'écran
  // ni le repère suivant (une bande fusionnée de 200 $ qui enjambe le prix appelait « tout près »
  // le repère de l'autre côté).
  const pres = guidePresDebutant(L, E);
  if (pres.length) out.push('Tout près : ' + pres.map(r => Guide.nomPhrase(r) + ' (' + Guide.prixR(r, E.unite) + ')').join(', ') + '.');
  out.push(Guide.texteSuiteDebutant(debChemin(L.niv, L.suivant, L.niv.dessus ? 1 : -1), E.unite, chartInterval, L.niv.dessus ? 1 : -1, now));
  out.push('La bande couvre ' + Guide.prixRond(L.niv.demi, E.unite) + ' de part et d’autre de ce prix : le prix réagit rarement au dollar près.');
  out.push('Une description, pas une recommandation.');
  return out;
}
/** La bulle de la phrase : le sens du verbe sur sa durée, ce que dit la variation 24 h si elle va
 *  dans l'autre sens, le calme du moment, les deux chemins. */
function guideTextePhraseDebutant(E, phrase) {
  const D = E.D, r = D.regime || { cle: 'inconnu' }, G = PARAM.guide, itv = chartInterval, now = Horloges.maintenant();
  const per = Guide.PERIODE_DEBUTANT[itv] || ['une période', '2 périodes', 'cette période', 'périodes'];
  const pas = geoPrix && geoPrix.pas > 0 ? geoPrix.pas : 900, n = PARAM.adx.periode;
  const sur = 'sur les ' + n + (/^une /.test(per[0]) ? ' dernières ' : ' derniers ') + per[3] + (Guide.environ(n * pas) ? ' (' + Guide.environ(n * pas) + ')' : '');
  const out = [];
  if (/touche/.test(phrase)) out.push('« Touche » : le prix est en ce moment dans la bande de ce repère.');
  if (/est passé/.test(phrase)) out.push('« Est passé » : ' + per[1] + ' de suite ont fini au-delà de ce repère (la règle de la page pour dire « franchi »).');
  // Le sens du verbe, seulement s'il est dans la phrase affichée (sinon : ce que dit le mouvement).
  const verbe = Guide.VERBE_DEBUTANT[r.cle], dit = verbe && new RegExp('\\b' + verbe + '\\b').test(phrase);
  out.push((dit ? {
    hausse: '« Monte » : ' + sur + ', le prix a pris une direction nette vers le haut.',
    baisse: '« Baisse » : ' + sur + ', le prix a pris une direction nette vers le bas.',
    faible: '« Hésite » : ' + sur + ', le mouvement n’a pas de direction nette.',
    sans: '« Hésite » : ' + sur + ', le mouvement n’a pas de direction nette.',
    incertaine: '« S’agite » : ' + sur + ', le prix bouge nettement, mais sans sens clair.',
  } : {
    hausse: 'Le mouvement : ' + sur + ', le prix a pris une direction nette vers le haut.',
    baisse: 'Le mouvement : ' + sur + ', le prix a pris une direction nette vers le bas.',
    faible: 'Le mouvement : ' + sur + ', le prix n’a pas de direction nette.',
    sans: 'Le mouvement : ' + sur + ', le prix n’a pas de direction nette.',
    incertaine: 'Le mouvement : ' + sur + ', le prix bouge nettement, mais sans sens clair.',
  })[r.cle] || 'Pas encore assez d’historique sur ce graphique pour dire si le prix monte ou baisse.');
  if (isNum(var24Courant) && ((r.cle === 'hausse' && var24Courant < 0) || (r.cle === 'baisse' && var24Courant > 0)))
    out.push('La variation en haut de l’écran (' + texteVar24(var24Courant, true) + ') porte sur 24 h : sur une durée plus courte, le prix peut aller dans l’autre sens.');
  if (r.compression) out.push('Le prix bouge peu en ce moment, moins que d’habitude sur les ' + Guide.dernieres(G.bbFenetre * pas) + '.');
  // Les deux chemins partent des deux repères de l'écran (aucun autre seuil).
  const S = E.debSel || {};
  out.push(Guide.texteSuiteDebutant(debChemin(S.dessus, S.suivantHaut, 1), E.unite, itv, 1, now), Guide.texteSuiteDebutant(debChemin(S.dessous, S.suivantBas, -1), E.unite, itv, -1, now));
  out.push('Une description, pas une recommandation.');
  return out;
}
/** Les bougies visibles, gêne « douce » des étiquettes du Guide (essayées d'abord sans les couvrir). */
function guideSurBougies(E) {
  const { g, yDe } = E;
  return r => {
    const i0 = Math.max(g.vs, g.vs + Math.floor((r.x - g.pad.left) / g.gap)), i1 = Math.min(g.ve - 1, g.vs + Math.floor((r.x + r.w - g.pad.left) / g.gap));
    for (let i = i0; i <= i1; i++) { const c = candles[i]; if (yDe(c.high) <= r.y + r.h && yDe(c.low) >= r.y) return true; }
    return false;
  };
}
/** Débutant : la cible de la phrase (son rectangle suit le texte, posé par le calque) et les deux
 *  repères — chacun posé CONTRE son trait, du côté du prix qui est le sien : celui du haut
 *  au-dessus de son trait (jamais sous la ligne du prix live), celui du bas au-dessous ; un repère
 *  hors de la vue, au bord, son libellé préfixé de ↑ ou ↓. Les deux libellés ont le même style
 *  (avec ou sans « · ») ; les pastilles sont peintes par le calque (leur couleur dit l'état). */
function guideDebutant(E) {
  const { g, xFin, xMax, yDe } = E, P = PARAM.guide.debutant, top = g.pad.top, bas = g.pad.top + g.ph, H = 17;
  E.ciblePhrase = { rects: [], prio: 0, titre: '', texte: [] };
  E.cibles.push(E.ciblePhrase);
  E.itemPhrase = debItem('phrase', '', null);
  const etroit = g.pw < P.etroit, max = etroit ? P.niveauEtroit : P.niveau, surBougies = guideSurBougies(E);
  ctx.font = chartFont(10, 600);
  const m = t => ctx.measureText(t).width + 14;
  const x0 = g.pad.left + 6, droite = (E.marge ? xFin : xMax) - 2;
  const yLive = isNum(livePrice) ? yDe(livePrice) : null;
  // Le style commun : chaque libellé prend le premier format qui tient ; si l'un perd le « · »,
  // l'autre aussi (jamais « Mur vente 82 710 $ » à côté de « Options · 82 510 $ »).
  const formats = E.niveaux.map(L => {
    const fl = L.niv.pMin > g.maxP ? '↑' : L.niv.pMax < g.minP ? '↓' : null, o = { max, unite: E.unite, fleche: fl, mesure: m, maxPx: droite - x0 };
    const V = Guide.libellesDebutant(L.niv, o);
    return { L, fl, V, k: Guide.formatDebutant(V, o), o };
  });
  if (formats.some(f => !Guide.AVEC_POINT(f.k))) for (const f of formats) if (Guide.AVEC_POINT(f.k)) f.k = Math.max(2, Guide.formatDebutant(f.V.slice(2), f.o) + 2);
  for (const { L, fl, V, k } of formats.sort((a, b) => b.L.niv.dessus - a.L.niv.dessus)) {
    const t = V[k], w = Math.min(m(t), droite - x0), haut = L.niv.dessus, yD = yDe(L.niv.p);
    // Du bon côté du prix live : le bas du libellé du haut au-dessus de la ligne du prix, le haut
    // de celui du bas au-dessous (gêne dure, sauf hors de la vue).
    const cote = yLive === null || fl ? null : haut ? r => r.y + r.h > yLive - 1 : r => r.y < yLive + 1;
    // Contre le trait ; le bord du tracé seulement quand le trait y est (le glissement fait le reste).
    const essais = fl === '↑' ? [top + 2] : fl === '↓' ? [bas - H - 2] : haut ? [yD - H - 2, yD - H / 2].concat(yD - H - 2 < top + 1 ? [top + 1] : [])
      : [yD + 2, yD - H / 2].concat(yD + 2 + H > bas - 1 ? [bas - H - 1] : []);
    const vers = fl === '↑' ? 1 : fl === '↓' ? -1 : haut ? -1 : 1;
    const xs = [x0, Math.max(x0, (x0 + droite) / 2 - w / 2), Math.max(x0, droite - w)];
    let pose = null, xp = x0;
    const et = (a, b) => (a && b ? r => a(r) || b(r) : a || b || undefined);
    for (const [ev, gl] of [[et(surBougies, cote), 3], [cote, 3], [cote, 8], [null, 8]]) {
      for (const x of xs) if ((pose = guidePlacer(E.rects, x, w, H, essais, top, bas, vers, 0, gl, ev || undefined))) { xp = x; break; }
      if (pose) break;
    }
    const zones = L.visible ? [{ x0: g.pad.left, y0: L.yH - 3, x1: xMax, y1: L.yB + 3 }] : [];
    E.cibles.push({ rects: pose ? [guideZone(pose)] : [], zones, prio: 1, niveau: L, titre: Guide.titreDebutant(L.niv, E.unite), texte: guideTexteNiveauDebutant(L, E), optionsSeules: Guide.optionsSeules(L.niv) });
    if (!pose) continue;
    L.etiq = { x: xp, y: pose.y, w, h: H, t };
    debItem('niveau', t, { x: xp, y: pose.y, w, h: H });
  }
}
/** Débutant : UNE figure (Guide.formesAffichees(…, 'debutant') : rang, puis le dernier point le
 *  plus récent), entière dans la vue ; on prend la première dont le libellé trouve sa place. Son
 *  tracé est celui de l'Expert (la ligne qui valide la plus marquée) ; son libellé est posé sur le
 *  CALQUE (guideCalqueFormeDebutant) : il dit l'état vivant au prix live sans redessiner le
 *  graphique, dans une place gardée pour le plus long de ses textes possibles. */
function guideFormesDebutant(E) {
  const P = PARAM.guide.debutant;
  for (const f of E.formes) {
    const t = Guide.libelleFormeDebutant(f);
    if (t && t.length <= P.forme && guideFormeDebutant(E, f, t)) return;
  }
}
function guideFormeDebutant(E, f, t) {
  const { g, yDe, xDe, xFin, xMax, unite } = E, G = PARAM.guide, P = PARAM.guide.debutant, top = g.pad.top, bas = top + g.ph, H = 17;
  const R = GUIDE_FORMES.val;
  // La place d'abord, dimensionnée sur le plus long des libellés possibles jusqu'à la prochaine
  // clôture : une figure dont le nom ne trouve pas de place n'est pas dessinée.
  const possibles = Guide.libellesPossiblesDebutant(f).filter(x => x.length <= P.forme);
  ctx.font = chartFont(10, 600);
  const w = Math.max(...possibles.map(x => ctx.measureText(x).width)) + 14;
  // Géométrie sans dessin : un tracé « à blanc » pour connaître ses extrémités et sa ligne.
  const st0 = guideStyleFigure(f, R.n - 1, 'debutant');
  const geo = guideFigureGeo(f, f.fin ? f.jFin : candles.length - 1, null);
  const pts = geo.zig.flat().concat(geo.valide.flat(), geo.autres.flat(), geo.points);
  const ys = pts.map(q => yDe(q[1])), yH = Math.min(...ys), yB = Math.max(...ys);
  const segsV = guideSegsValide(E, { geo });
  const xDernier = xDe(Guide.dernierPoint(f, G)), xDroite = E.marge ? xFin - 2 : xMax - 2;
  const x0 = Math.max(g.pad.left + 2, Math.min(xDernier - w / 2, xDroite - w));
  const essais = f.sens > 0 && Guide.famille(f) !== 'lignes' ? [yB + 4, yH - H - 4] : [yH - H - 4, yB + 4];
  const surBougies = guideSurBougies(E), bandes = debSurBandes(E), recentes = scenRecentes(E), surLigne = guideSurSegs(segsV);
  // Près de la figure (au plus 2 demi-hauteurs de glissement), jamais dans la bande d'un repère
  // (posé là, le nom de la forme se lirait comme celui du repère), ni sur les bougies récentes, ni
  // sur la ligne qui valide (amendement C5).
  const dur = r => bandes(r) || recentes(r) || surLigne(r);
  let pose = null;
  for (const [ev, gl] of [[r => dur(r) || surBougies(r), 2], [dur, 2]]) if ((pose = guidePlacer(E.rects, x0, w, H, essais, top, bas, essais[0] < (top + bas) / 2 ? 1 : -1, 0, gl, ev))) break;
  if (!pose) return false;
  const tr = guideFigureTracer(E, f);
  const b = R.bilan[f.type], ctxF = E.ctxF;
  const entree = { f, tr, pose, w, h: H, t, v: null, st: st0, segsV };
  E.figures.push(entree);
  // L'invite « Touchez une étiquette… » évite la ligne qui valide (astucePlacer lit debEtat.evite).
  if (debEtat) debEtat.evite = segsV.map(s => ({ rect: { x: Math.min(s[0], s[2]) - 2, y: Math.min(s[1], s[3]) - 3, w: Math.abs(s[2] - s[0]) + 4, h: Math.abs(s[3] - s[1]) + 6 } }));
  E.cibles.push({ rects: [guideZone(pose)], segs: tr.segs, prio: 2, figure: entree, titre: Guide.titreForme(f, 'debutant', ctxF), texte: Guide.texteFormeDebutant(f, b, ctxF, G, unite) });
  entree.item = debItem('forme', t, { x: pose.x, y: pose.y, w: Math.min(w, ctx.measureText(t).width + 14), h: H });
  E.debForme = entree;
  return true;
}
/** L'échelle Débutant inclut la ligne qui valide la 1re figure candidate (amendement C5), bornée
 *  à la moitié de l'amplitude des bougies de chaque côté. → [lo, hi] ou null. */
function guideEchelleDebutant(vs, ve) {
  if (!overlays.guide || !debutant() || !guideDonnees() || !GUIDE_FORMES.val) return null;
  const f = Guide.formesAffichees(GUIDE_FORMES.val, PARAM.guide, vs, ve, 'debutant').find(x => !x.fin);
  if (!f) return null;
  const geo = guideFigureGeo(f, candles.length - 1, null), ps = geo.valide.flat().map(q => q[1]).filter(isNum);
  return ps.length ? [Math.min(...ps), Math.max(...ps)] : null;
}
/** Calque : l'état VIVANT de chaque figure montrée (Guide.figureVivante, au prix live et sur la
 *  bougie en cours) : le segment de la ligne qui valide passe en couleur d'avertissement sur la
 *  bougie en cours (franchi, percé en mèche) ; Expert : une pastille courte à droite du libellé ;
 *  Débutant : le libellé lui-même dit l'état (« Ligne passée, à confirmer »…). O(figures). */
function guideCalqueFigures(E) {
  if (!E.figures || !E.figures.length) return;
  const K = cols(), j = candles.length - 1, cur = candles[j], S = { h: K.high, l: K.low, c: K.close }, G = PARAM.guide, g = E.g;
  cx.save();
  for (const x of E.figures) {
    const f = x.f;
    x.v = f.fin ? null : Guide.figureVivante(f, S, j, cur, isNum(livePrice) ? livePrice : null, G);
    const v = x.v;
    if (v && (v.cle === 'franchi' || v.cle === 'meche') && isNum(v.p) && E.finVue) {
      const xc = E.xDe(j), y = E.yDe(v.p), dx = Math.max(4, g.candleW / 2 + 3);
      if (y > g.pad.top && y < g.pad.top + g.ph) {
        cx.strokeStyle = COLORS.warn; cx.lineWidth = 2.4; cx.setLineDash([]);
        cx.beginPath(); cx.moveTo(xc - dx, y); cx.lineTo(xc + dx, y); cx.stroke();
      }
    }
    if (!E.deb && x.pose && v && v.cle && v.cle !== 'suit') {
      const t = { franchi: 'au-delà · à confirmer fin de bougie', meche: 'percé en mèche · en cours', meche_close: 'percé en mèche · pas validé', menace: 'invalidation touchée · à confirmer',
        cible: 'objectif touché · à confirmer', remise: 'ébauche remise en cause · à confirmer' }[v.cle];
      if (t) {
        cx.font = chartFont(9, 600);
        const w = cx.measureText(t).width + 14, hL = 15, r = x.pose;
        const aDroite = r.x + r.w + 3 + w <= E.xMax - 2;
        const px = aDroite ? r.x + r.w + 3 : r.x, py = aDroite ? r.y : r.y + r.h + 1;
        guidePastille(cx, px, py, w, hL, t, v.cle === 'meche_close' ? COLORS.ink3 : COLORS.warn);
        x.pastille = t;
      }
    } else x.pastille = null;
  }
  cx.restore();
}
/** Calque, Débutant : le libellé de la figure, au prix live (amendement C1). */
function guideCalqueFormeDebutant(E) {
  const x = E.debForme;
  if (!x) return;
  const P = PARAM.guide.debutant, f = x.f, v = x.v;
  let t = Guide.libelleVivantDebutant(f, v);
  if (!t || t.length > P.forme) t = x.t;
  cx.save();
  cx.font = chartFont(10, 600);
  const w = Math.min(x.w, cx.measureText(t).width + 14);
  const vif = v && v.cle && v.cle !== 'suit';
  const coul = vif ? (v.cle === 'meche_close' ? COLORS.ink3 : COLORS.warn) : x.tr.encre;
  guidePastilleDebutant(cx, x.pose.x, x.pose.y, w, x.h, t, coul, COLORS.ink1);
  cx.restore();
  if (x.item) { x.item.texte = t; x.item.rect = { x: x.pose.x, y: x.pose.y, w, h: x.h }; }
  x.texteVivant = t;
}
/** Les bandes des deux repères à l'écran (± 3 px) : gêne dure des libellés de la forme et du
 *  scénario 1 en Débutant. */
function debSurBandes(E) {
  const Z = E && E.niveaux ? E.niveaux.filter(L => L.visible).map(L => [L.yH - 3, L.yB + 3]) : [];
  return r => Z.some(([a, b]) => r.y < b && r.y + r.h > a);
}
/** Une pastille d'une ligne du Débutant : fond de bulle, trait de couleur à gauche, texte. */
function guidePastilleDebutant(g, x, y, w, h, texte, coul, encre) {
  g.fillStyle = COLORS.bulle;
  g.beginPath(); g.roundRect(x, y, w, h, 4); g.fill();
  g.fillStyle = coul; g.fillRect(x + 2, y + 3, 2.5, h - 6);
  g.fillStyle = encre || COLORS.ink1;
  g.fillText(texte, x + 8, y + h - 5);
}
/** La phrase à poser : la plus riche qui tient (caractères et pixels) à 11,5 px, puis à 10,5 px ;
 *  la forme compacte en dernier recours. → { t, taille } */
function debPhraseChoisir(g, o, maxPx, etroit) {
  const P = PARAM.guide.debutant, max = etroit ? P.phraseEtroit : P.phrase, V = Guide.phrasesDebutant(o);
  const pleines = V.slice(0, -1), compacte = V[V.length - 1];
  // Chaque variante à 11,5 px puis à 10,5 px avant la suivante : au téléphone, « Depuis 3 h, le
  // prix monte et touche 86 133 $. » en 10,5 px plutôt que de perdre « touche » (ou la durée).
  for (const t of pleines) {
    if (t.length > max) continue;
    for (const taille of [DEB_POLICE_PHRASE, 10.5]) { g.font = chartFont(taille, 650); if (g.measureText(t).width + 16 <= maxPx) return { t, taille }; }
  }
  for (const taille of [DEB_POLICE_PHRASE, 10.5]) { g.font = chartFont(taille, 650); if (g.measureText(compacte).width + 16 <= maxPx) return { t: compacte, taille }; }
  // Une police large sur un écran étroit : le verbe seul (« Le prix monte. », « Le prix s’agite. »),
  // entier, plutôt qu'une phrase coupée au milieu d'un prix ; les repères ont leurs libellés.
  const verbe = compacte.replace(/(?:\.|\s*:)\s.*$/, '.');
  for (const taille of [DEB_POLICE_PHRASE, 10.5]) { g.font = chartFont(taille, 650); if (verbe !== compacte && g.measureText(verbe).width + 16 <= maxPx) return { t: verbe, taille }; }
  g.font = chartFont(10.5, 650);
  return { t: guideCouper(g, compacte, maxPx - 16), taille: 10.5 };
}
/** Calque, Débutant : l'état de chaque bande au prix live (couleur du trait, lueur de la bande
 *  quand le prix est dedans), les deux libellés, la phrase. Ne recalcule rien d'autre. */
function guideCalqueDebutant(E) {
  const G = PARAM.guide, cur = candles[candles.length - 1], g = E.g, P = PARAM.guide.debutant;
  let enTest = null;
  // Le prix live a passé un repère depuis le dessin : les deux repères changent, le graphique est
  // redessiné une fois (rien d'autre ne le redessine au rythme du prix).
  if (E.debSel) {
    const sel = debReperes(E.D), p = x => (x ? x.p : null);
    if (p(sel.dessus) !== p(E.debSel.dessus) || p(sel.dessous) !== p(E.debSel.dessous)) scheduleDraw();
  }
  for (const L of E.niveauxTous) L.live = Guide.etatLive(L.niv, livePrice, cur, G);
  // La figure : son état vivant (segment de la ligne qui valide) et son libellé, au prix live.
  guideCalqueFigures(E);
  guideCalqueFormeDebutant(E);
  // Le prix dans les deux petites bandes à la fois : la phrase nomme la plus proche.
  for (const L of E.niveaux) if (L.live.mot === 'test' && (!enTest || Math.abs(L.niv.p - livePrice) < Math.abs(enTest.p - livePrice))) enTest = L.niv;
  E.enTest = enTest;
  cx.save();
  // La bande où est le prix « s'allume » (lueur posée sur le calque).
  for (const L of E.niveaux) if (L.visible && L.live.mot === 'test') { cx.fillStyle = avecAlpha(COLORS.warn, 0.18); cx.fillRect(g.pad.left, L.yH, E.xMax - g.pad.left, L.yB - L.yH); }
  // Les libellés : le trait dit l'état (loin : pâle ; proche, au-delà : avertissement ; franchi
  // et confirmé : encre, la phrase dit le sens) ; un chiffre publié trop vieux est estompé.
  const md = activeSymbol === 'BTCUSDT' ? marketData : null, tPub = md ? Date.parse(md.updated) : NaN;
  const vieuxPub = isFinite(tPub) && (Horloges.maintenant() - tPub) / 60000 > CADENCES.vieux_min;
  cx.font = chartFont(10, 600);
  for (const L of E.niveaux) {
    if (!L.etiq) continue;
    const mot = L.live.mot || '', r = Guide.raisonPrincipale(L.niv), vieux = vieuxPub && r && isNum(r.lu);
    const coul = vieux ? COLORS.ink3 : /^(demi|valide)/.test(mot) ? COLORS.ink1 : ['test', 'proche', 'meche', 'mecheCours', 'franchi'].includes(mot) ? COLORS.warn : COLORS.ink3;
    guidePastilleDebutant(cx, L.etiq.x, L.etiq.y, L.etiq.w, L.etiq.h, L.etiq.t, coul, vieux ? COLORS.ink3 : COLORS.ink1);
  }
  // La phrase : une ligne, en haut à gauche du tracé ; la ligne des scénarios à sa droite si elles
  // partagent la rangée.
  const memo = debHautMemo, etroit = g.pw < P.etroit;
  const maxPx = E.xMax - g.pad.left - 8 - (memo && memo.partage ? memo.wLigne + 12 : 0);
  const o = { prix: isNum(livePrice) ? livePrice : null, unite: E.unite, choix: E.D.choix, reperes: E.debSel, enTest, regime: E.D.regime, maintenant: !E.finVue, itv: chartInterval, vue: debVue() };
  const cle = [o.prix === null, enTest ? enTest.p : '-', maxPx, o.maintenant].join('|');
  if (!E.phraseCache || E.phraseCache.cle !== cle) {
    const ph = debPhraseChoisir(cx, o, maxPx, etroit);
    E.phraseCache = { cle, ph, texte: guideTextePhraseDebutant(E, ph.t) };
    // Accessibilité : la phrase du graphique est aussi son nom.
    try { canvas.setAttribute('aria-label', ph.t); } catch (e) { /* hors navigateur */ }
  }
  const { ph } = E.phraseCache;
  cx.font = chartFont(ph.taille, 650);
  const w = Math.min(maxPx, cx.measureText(ph.t).width + 16), x = g.pad.left + 2, y = 8, h = 20;
  cx.globalAlpha = 0.94; cx.fillStyle = COLORS.bulle;
  cx.beginPath(); cx.roundRect(x, y, w, h, 5); cx.fill(); cx.globalAlpha = 1;
  cx.fillStyle = COLORS.accent2; cx.fillRect(x + 2, y + 3, 2.5, h - 6);
  cx.fillStyle = COLORS.ink1;
  cx.fillText(ph.t, x + 9, y + 14);
  cx.restore();
  if (E.ciblePhrase) { E.ciblePhrase.rects = [{ x0: x, y0: y, x1: x + w, y1: y + h }]; E.ciblePhrase.titre = ph.t; E.ciblePhrase.texte = E.phraseCache.texte; }
  if (E.itemPhrase) { E.itemPhrase.texte = ph.t; E.itemPhrase.rect = { x, y, w, h }; }
}
/** Débutant : le budget. La ligne des scénarios est la seule qui cède, et seulement quand la forme
 *  ET le libellé du scénario 1 sont posés : sa bulle passe alors dans celle du libellé. */
function debArbitrer() {
  if (!debEtat) return;
  const roles = debEtat.items.map(i => i.role), S = scenEtat, B = S && S.boite;
  if (!(B && B.deb && roles.includes('forme') && roles.includes('scenario') && roles.length > PARAM.guide.debutant.items)) return;
  if (scenCederLibelle()) return;   // la ligne porte une fermeture : le libellé du scénario cède (M8)
  B.cede = true;
  debEtat.items = debEtat.items.filter(i => i.role !== 'boite');
  if (B.cible) S.cibles = S.cibles.filter(c => c !== B.cible);
  if (B.cible && S.cibleUn) {
    S.cibleUn.texte = S.cibleUn.texte.concat(['La ligne des scénarios (place prise) :'], B.cible.texte);
    // Écran court : la ligne elle-même, en une phrase, avant l'avertissement final.
    if (S.cibleUn.texteCourt && B.texte) { const tc = S.cibleUn.texteCourt; S.cibleUn.texteCourt = tc.slice(0, -1).concat(['La ligne des scénarios (place prise) : « ' + B.texte.replace(/\s*▸$/, '') + ' ».'], tc.slice(-1)); }
  }
}

/** La cible du Guide ou des scénarios sous (x, y) — son étiquette, sa bande, ou à quelques pixels
 *  de son tracé ; jamais la zone des bougies entière (l'infobulle OHLCV y reste seule). Un test
 *  pur : rien n'est dessiné ni posé (le gestionnaire de souris le lit pour le curseur). */
function guideCibleSous(x, y, mainH, etiquettesSeules) {
  const E = guideEtat && overlays.guide ? guideEtat : null, Sc = scenEtat;
  if (!(E || Sc) || x === null || y === null || y > mainH) return null;
  const dansR = q => (q.rects || []).some(r => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1);
  const surS = q => (q.segs || []).some(s => guideDistSeg(x, y, s) <= 6);
  const surZ = q => (q.zones || []).some(r => x >= r.x0 && x <= r.x1 && y >= r.y0 && y <= r.y1);
  // Une étiquette d'abord, puis un tracé (forme, chemin, flèche), puis une bande ou une zone.
  // Les cibles du Guide et des scénarios du matin : une seule liste, une seule bulle.
  let c = null, rang = Infinity;
  for (const q of (E ? E.cibles : []).concat(Sc ? Sc.cibles : [])) {
    const r = dansR(q) ? q.prio : etiquettesSeules ? Infinity : surS(q) ? 10 + q.prio : surZ(q) ? 20 + q.prio : Infinity;
    if (r < rang) { rang = r; c = q; }
  }
  return c;
}
/** Survol : la cible sous le curseur (guideCibleSous), expliquée dans sa bulle (guideBulle). */
function guideSurvol(W, mainH, evite) {
  if (guideEtat) guideEtat.survol = null;
  if (scenEtat) { scenEtat.survol = null; scenEtat.bulle = null; }
  const c = guideCibleSous(crossX, crossY, mainH);
  if (c && debutant()) scenSurvolDebutant(c);   // la zone d'invalidation du scénario 1, sous la bulle
  if (c) guideBulle(c, W, mainH, evite);
}
/** La bulle d'une cible, près du curseur, toujours dans le tracé. */
function guideBulle(c, W, mainH, evite) {
  const E = guideEtat, Sc = scenEtat;
  if (Sc && Sc.cibles.includes(c)) Sc.survol = c; else E.survol = c;   // ce que la bulle explique (relu par les tests)
  const texte = c.texte.slice();
  // Une figure : son état vivant en tête, en mots du mode (« En ce moment le prix est sous … »).
  if (c.figure && c.figure.v && E && E.ctxF) { const t = Guide.texteVivantFigure(c.figure.f, c.figure.v, E.ctxF, debutant() ? 'debutant' : 'expert', guideUnite()); if (t) texte.unshift(t); }
  if (debutant()) {
    // L'état au prix live, en mots ; une bande faite d'options dit d'abord que c'est une estimation.
    if (c.niveau && c.niveau.live) texte.splice(c.optionsSeules ? 1 : 0, 0, Guide.texteEtatDebutant(c.niveau.live, c.niveau.niv, livePrice, guideUnite(), chartInterval));
  } else {
    if (c.niveau && c.niveau.live) texte.unshift('Maintenant : ' + Guide.texteEtatLive(c.niveau.live, 'debutant') + '.');
    if (c.niveaux) for (const L of c.niveaux.slice().reverse()) if (L.live) texte.unshift(Guide.libelleNiveau(L.niv, 'debutant', guideUnite(), true) + ' — maintenant : ' + Guide.texteEtatLive(L.live, 'debutant') + '.');
  }
  const bw = Math.min(330, W - 32);
  // Débutant sur téléphone : la bulle est le seul endroit du détail — un corps de 12 px (titre
  // 13 px), lisible au doigt ; ailleurs, la taille de toujours.
  const gros = debutant() && W - 16 - 75 < PARAM.guide.debutant.etroit;
  const fT = gros ? 13 : 10, fC = gros ? 12 : 9.5, hT = gros ? 17 : 14, hC = gros ? 15.5 : 12.5;
  cx.save();
  cx.font = chartFont(fT, 700);
  const tl = guideLignes(cx, c.titre, bw - 20, 2);
  cx.font = chartFont(fC, 500);
  // La bulle tient TOUJOURS dans le tracé (téléphone : un tracé de 380 px) : sinon la version courte
  // de l'explication (texteCourt), puis les paragraphes du début, un renvoi à la fiche et le
  // dernier paragraphe (« pas une recommandation ») — jamais une phrase coupée au bord de l'écran.
  // Entre deux paragraphes, une ligne vide ; serrée (5 px) quand la place manque.
  let sep = hC;
  const hMax = mainH - 8, hL = l => (l === '' ? sep : hC);
  const hDe = ls => tl.length * hT + ls.reduce((a, l) => a + hL(l), 0) + 16;
  const decouper = ts => { const out = []; for (const t of ts) out.push(guideLignes(cx, t, bw - 20)); return out; };
  const aplatir = ps => { const out = []; ps.forEach((p, k) => { if (k) out.push(''); out.push(...p); }); return out; };
  // Ordre : l'explication entière, puis serrée ; puis la version courte, puis serrée ; enfin coupée.
  let paras = decouper(texte);
  if (hDe(aplatir(paras)) > hMax) sep = 5;
  if (hDe(aplatir(paras)) > hMax && c.texteCourt) { paras = decouper(c.texteCourt); sep = hC; if (hDe(aplatir(paras)) > hMax) sep = 5; }
  if (hDe(aplatir(paras)) > hMax) {
    const dernier = (debutant() ? /recommandation|conseil/ : /recommandation/).test(paras[paras.length - 1].join(' ')) ? paras[paras.length - 1] : null;
    const suite = guideLignes(cx, '… (suite : fiche dans les Légendes, bouton ?)', bw - 20);
    const garde = [];
    for (const p of dernier ? paras.slice(0, -1) : paras) {
      if (hDe(aplatir(garde.concat([p], [suite], dernier ? [dernier] : []))) > hMax) break;
      garde.push(p);
    }
    paras = garde.concat([suite], dernier ? [dernier] : []);
    // Encore trop haut (titre long, écran minuscule) : le renvoi part, « pas une recommandation » reste.
    while (paras.length > 1 && hDe(aplatir(paras)) > hMax) paras.shift();
  }
  const corps = aplatir(paras);
  const bh = Math.min(hDe(corps), Math.max(hMax, 40));
  // Sous le curseur, et sous l'infobulle OHLCV si elle est là ; au-dessus quand la place manque.
  let bx = crossX + 16, by = Math.max(crossY + 18, evite ? evite.y + evite.h + 6 : 0);
  if (bx + bw > W - 75) bx = Math.max(16, crossX - bw - 16);
  if (by + bh > mainH - 4) by = Math.max(4, Math.min(crossY, evite ? evite.y : crossY) - bh - 8);
  by = Math.max(4, Math.min(by, mainH - 4 - bh));
  if (Sc && Sc.survol === c) Sc.bulle = { x: bx, y: by, w: bw, h: bh, corps: corps.slice(), police: fC };
  else if (E && E.survol === c) E.bulle = { x: bx, y: by, w: bw, h: bh, corps: corps.slice(), police: fC };   // relue par les tests
  // Fond du tracé d'abord : une bulle translucide laisserait lire la lecture et les étiquettes à travers.
  cx.fillStyle = COLORS.surface;
  cx.shadowColor = 'rgba(16,35,61,0.18)'; cx.shadowBlur = 14; cx.shadowOffsetY = 4;
  cx.beginPath(); cx.roundRect(bx, by, bw, bh, 8); cx.fill();
  cx.shadowColor = 'transparent'; cx.shadowBlur = 0; cx.shadowOffsetY = 0;
  cx.fillStyle = COLORS.bulle; cx.fill();
  cx.fillStyle = c.coul || COLORS.accent2; cx.fillRect(bx + 5, by + 8, 3, bh - 16);
  cx.fillStyle = COLORS.ink1; cx.font = chartFont(fT, 700);
  tl.forEach((l, k) => cx.fillText(l, bx + 14, by + 16 + (hT - 14) + k * hT));
  cx.font = chartFont(fC, 500); cx.fillStyle = COLORS.text;
  let yl = by + 16 + (hT - 14) + tl.length * hT + 2;
  for (const l of corps) { if (l) cx.fillText(l, bx + 14, yl); yl += hL(l); }
  cx.restore();
}

// ─────────────────────────────────────────────────────────────────────────────
// SCÉNARIOS DU MATIN — le dessin (le cœur pur est js/scenarios.js ; ses nombres, PARAM.scenarios)
// ─────────────────────────────────────────────────────────────────────────────
// Sur le GRAPHIQUE (redessiné quand la donnée, la vue ou le fichier change) : les zones de chaque
// scénario (bandes translucides du point jusqu'au bord droit, invalidation hachurée, range en
// boîte), le trait du point et celui de la fin, les flèches et les repères numérotés dans la marge
// de futur, les libellés. Sur le CALQUE : l'encadré (mis en page ici, relu chaque seconde) et
// l'explication au survol (guideSurvol). Le suivi en direct est un AFFICHAGE : mémorisé sur les
// bougies CLOSES (SCEN_SUIVI), la bougie en cours s'y ajoute ; la note officielle est celle du
// journal. Rien ici ne tourne sur une minuterie ; le survol ne redessine pas le graphique.
let scenEtat = null;
let scenLargeur = Infinity;            // largeur du tracé de la dernière image (échelle des scénarios)
const SCEN_SUIVI = new Map();          // (fichier, scénario, intervalle, bougies closes) → pli du suivi
/** Les scénarios à dessiner MAINTENANT (couche affichée, BTCUSDT, fichier lisible ; la semaine d'un
 *  matin passé disparaît une fois finie, même si le fichier n'a pas changé), ou null. */
function scenDessinables() {
  if (!overlays.scenarios || activeSymbol !== 'BTCUSDT' || !previsions || previsions.etat !== 'ok') return null;
  const L = Scenarios.vivants(previsions, Horloges.maintenant());
  return L.length ? L : null;
}
/** Au moins un scénario dessinera-t-il une flèche dans la marge de futur (chemin ouvert, rangs 1 à
 *  3, suivi possible sur ces bougies) ? Sinon, sans le Guide, pas de marge : vide, elle se lirait
 *  comme un trou. Mémorisé sur (fichier, intervalle, dernière bougie, minute). */
let scenFlechesMemo = null;
function scenFleches() {
  const L = scenDessinables();
  if (!L || candles.length < 2) return false;
  const now = Horloges.maintenant(), d = candles[candles.length - 1], deb = debutant();
  const cle = (deb ? 'D|' : 'E|') + previsionsN + '|' + chartInterval + '|' + candles.length + '|' + candles[0].time + '|' + d.time + '|' + d.high + '|' + d.low + '|' + Math.floor(now / 60000);
  if (scenFlechesMemo && scenFlechesMemo.cle === cle) return scenFlechesMemo.val;
  // Débutant : seule la flèche du scénario MONTRÉ se dessine (le rang 1, ou le suivant s'il est tombé).
  const jr = deb ? scenJour() : null, montre = jr && jr.montre ? jr.montre.sc : null;
  const val = L.some(s => {
    if (s.forme !== 'chemin' || s.rang === 'S' || (deb && s !== montre)) return false;
    const sv = scenSuivi(s);
    return Scenarios.ouvert(s, sv, now) && !(sv && (sv.cle === 'large' || sv.cle === 'incomplet'));
  });
  scenFlechesMemo = { cle, val };
  return val;
}
/** Les couleurs des rangs 1 et 2 (lireJetons, jamais par image) : parmi les jetons du thème, la
 *  première assez loin de la hausse, de la baisse, de la couleur du Guide (accent-2) et du fond —
 *  une couleur de rang ne se lit pas comme une direction. Rangs 3 et semaine : l'encre pâle. */
function scenPalette() {
  const d = (a, b) => { const x = rvb(a), y = rvb(b); return x && y ? Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]) : 999; };
  const E = PARAM.scenarios.ecartCouleur, eviter = [COLORS.candleUp, COLORS.candleDown, COLORS.accent2, COLORS.surface];
  const cands = [COLORS.accent, COLORS.sr[0], COLORS.sr[1], COLORS.warn, COLORS.sr[2], COLORS.fib, COLORS.vp];
  const ok = (c, autres, e) => eviter.concat(autres).every(x => d(c, x) >= (e || E));
  const un = cands.find(c => ok(c, [])) || COLORS.accent;
  // Le rang 2 : loin de tout, sinon (thèmes à peu de couleurs) à mi-distance au moins.
  const deux = cands.find(c => c !== un && ok(c, [un])) || cands.find(c => c !== un && ok(c, [un], E / 2)) || COLORS.ink1;
  return [un, deux];
}
const scenCouleur = rang => (rang === '1' ? (COLORS.scen || [COLORS.accent])[0] : rang === '2' ? (COLORS.scen || [0, COLORS.ink1])[1] : COLORS.ink3);
/** L'échelle de prix : [bas, haut] de la prochaine zone non touchée et de l'invalidation du scénario
 *  MONTRÉ (le rang 1, ou le suivant encore ouvert s'il est tombé ; bornes d'un range), quand la vue
 *  montre des bougies depuis le point et avant sa fin, et seulement tant qu'il est OUVERT (un
 *  scénario invalidé, réalisé ou noté n'écrase plus les bougies) ; sinon null. */
function scenEchelle(vs, ve) {
  const L = scenDessinables();
  if (!L || !(PARAM.scenarios.echelleMax > 0) || scenLargeur < PARAM.scenarios.echelleLargeurMin || !candles[ve - 1] || !candles[vs]) return null;
  const jr = scenJour(), m = jr && jr.montre, s = m ? m.sc : null;
  // Ouvert : suivi et ouvert, ou en cours sur des bougies qui ne le suivent pas (4 h, 1 jour : 'nonSuivi').
  if (!s || !(m.ouvert || (jr.cas === 'nonSuivi' && Scenarios.ouvert(s, m.sv, jr.maintenant))) || candles[ve - 1].time * 1000 < s.emis || candles[vs].time * 1000 >= s.fin) return null;
  const k = m.pos && m.pos.forme === 'chemin' ? m.pos.k : 0;
  const z = s.forme === 'range' ? [s.zones.bas, s.zones.haut] : [s.zones.cibles[k][0], s.zones.cibles[k][1]].concat(s.zones.inv || []);
  return [Math.min(...z), Math.max(...z)];
}
/** Le suivi en direct d'un scénario sur les bougies de l'intervalle affiché : le pli des bougies
 *  CLOSES est mémorisé, la bougie en cours s'y ajoute (une copie). → Scenarios.etat(…).
 *  Seules comptent les bougies ENTIÈRES dans la fenêtre ; au-delà d'une heure, pas d'état. */
function scenSuivi(S) {
  const n = candles.length;
  if (n < 2) return null;
  const pasMs = (candles[1].time - candles[0].time) * 1000, maintenant = Horloges.maintenant();
  if (pasMs > PARAM.scenarios.suiviPasMax * 1000) return Scenarios.etatLarge(S, pasMs, maintenant);
  const K = cols(), nF = n - 1;
  // L'historique chargé ne remonte pas jusqu'au point (1 min : 3000 bougies = 50 h ; ou la seule
  // première page pendant le chargement) : rien n'est affirmé, l'état dit « incomplet ».
  if (Scenarios.manque(S, K.time[0] * 1000, pasMs)) return Scenarios.etatIncomplet(S, pasMs, maintenant, K.time[0] * 1000);
  const cle = previsionsN + '|' + S.id + '|' + activeSymbol + '|' + chartInterval + '|' + K.time[0] + '|' + K.time[nF - 1] + '|' + nF;
  let e = SCEN_SUIVI.get(cle);
  if (!e) {
    if (SCEN_SUIVI.size > 32) SCEN_SUIVI.clear();
    e = Scenarios.plier(S, K.time, K.high, K.low, 0, nF, null, pasMs, K.close);
    SCEN_SUIVI.set(cle, e);
  }
  const c = candles[n - 1], tc = c.time * 1000;
  const e2 = Scenarios.compte(S, tc, pasMs) ? Scenarios.pas(S, Scenarios.copie(e), n - 1, tc, c.high, c.low, c.close) : e;
  return Scenarios.etat(S, e2, maintenant);
}
/** Le rejeu de la journée (Scenarios.rejouerJour) sur les bougies CLOSES du graphique, regroupées
 *  par quart d'heure : la décision de la dernière clôture (le nom du plus petit écart, « trop tôt »).
 *  Refait seulement quand une bougie se ferme (clé : fichier, intervalle, 1re et dernière bougies
 *  closes, nombre) : 3000 bougies de 1 min en environ 1 ms. */
let scenRejeuMemo = null;
function scenRejeu(L) {
  const n = candles.length;
  if (n < 2) return null;
  const K = cols(), nF = n - 1, pasMs = (candles[1].time - candles[0].time) * 1000;
  const cle = previsionsN + '|' + activeSymbol + '|' + chartInterval + '|' + K.time[0] + '|' + K.time[nF - 1] + '|' + nF + '|' + K.close[nF - 1];
  if (scenRejeuMemo && scenRejeuMemo.cle === cle) return scenRejeuMemo.val;
  const val = Scenarios.rejouerJour(previsions, L.filter(s => s.rang !== 'S'), K.time, K.high, K.low, K.close, nF, pasMs, PARAM.scenarios.jour);
  scenRejeuMemo = { cle, val };
  return val;
}
/** L'état de la journée (Scenarios.classerJour) à ce dessin : le rejeu des bougies closes, puis la
 *  bougie en cours (distances, contacts, fermetures ; jamais le nom du plus petit écart, sauf si elle
 *  ferme le scénario nommé). Les deux modes lisent le même : mêmes valeurs. Mémorisé sur (fichier,
 *  intervalle, dernière bougie, minute) : un tick de prix sans nouvelle bougie ne refait rien. */
let scenJourMemo = null;
function scenJour() {
  const L = scenDessinables();
  if (!L || candles.length < 2) return null;
  const now = Horloges.maintenant(), d = candles[candles.length - 1];
  const cle = previsionsN + '|' + activeSymbol + '|' + chartInterval + '|' + candles.length + '|' + candles[0].time + '|' + d.time + '|' + d.high + '|' + d.low + '|' + d.close + '|' + Math.floor(now / 60000);
  if (scenJourMemo && scenJourMemo.cle === cle) return scenJourMemo.val;
  const items = L.map(sc => ({ sc, sv: scenSuivi(sc) }));
  const val = Scenarios.classerJour(items, d.close, previsions, now, scenRejeu(L), PARAM.scenarios.jour);
  val.tous = items;
  val.maintenant = now;
  scenJourMemo = { cle, val };
  return val;
}
/** L'item de la journée (classerJour) d'un scénario, ou null (semaine). */
const scenJourItem = (J, sc) => (J ? J.items.find(i => i.sc === sc) || null : null);
/** Prépare ce que les scénarios posent sur le graphique (géométrie de resolveChart) → scenEtat.
 *  guide : l'état du Guide (ses places réservées sont partagées), ou null. */
function scenPreparer(g, guide) {
  if (!overlays.scenarios || activeSymbol !== 'BTCUSDT' || typeof Scenarios === 'undefined' || !(previsions || previsionsEchec)) return null;
  const mode = guideMode(), exp = mode === 'expert', L = scenDessinables(), F = L ? previsions : null, deb = debutant();
  const pasS = geoPrix && geoPrix.pas > 0 ? geoPrix.pas : 900, t0 = candles[g.vs].time;
  const yDe = p => g.pad.top + g.ph * (1 - (p - g.minP) / g.range);
  const xDeT = ms => g.pad.left + (ms / 1000 - t0) / pasS * g.gap;
  const xFin = g.pad.left + g.gap * g.n, xMax = g.W - g.pad.right, finVue = g.ve === candles.length;
  let rects = guide ? guide.rects : null;
  if (!rects && deb) rects = [];   // Débutant : ni badges S/R, ni repère de publication, ni ligne de la vue
  if (!rects) {
    // Sans le Guide : les badges S/R et le texte du repère de publication gardent leur place.
    rects = srBadges.slice();
    const rep = geoPrix && reperePublication(geoPrix);
    if (rep) { ctx.font = chartFont(9, 650); const lw = ctx.measureText(rep.texte).width; rects.push({ x: texteRepere(rep, geoPrix, lw) - 2, y: g.pad.top + g.ph - 22, w: lw + 4, h: 14 }); }
    // La ligne de la vue et sa pastille de variation (en haut à gauche, drawChart) : sous le
    // Guide, ses rangées les écartent ; sans lui, le tracé commence juste dessous.
    rects.push({ x: 0, y: 0, w: 240, h: 36 });
  }
  const maintenant = Horloges.maintenant();
  const S = { g, F, mode, exp, deb, yDe, xDeT, xFin, xMax, finVue, marge: finVue ? xMax - xFin : 0, itv: Guide.nomIntervalle(chartInterval), rects,
    items: [], cibles: [], boite: null, survol: null, maintenant, unPose: null, propres: [], libelles: [], obstSegs: [], segsPris: [] };
  const J = F ? scenJour() : null;
  S.jour = J;
  if (F) for (const sc of L) {
    const sv = scenSuivi(sc), j = scenJourItem(J, sc);
    S.items.push({ sc, sv, et: Scenarios.texteEtat(sc, sv, F.statuts, mode, { itv: S.itv, maintenant }), coul: scenCouleur(sc.rang), ouvert: Scenarios.ouvert(sc, sv, maintenant),
      j, pos: j ? j.pos : null, fondu: j ? j.fondu : null, ferme: j ? j.ferme : null, meneur: !!(J && j && J.meneur === j) });
  }
  // Débutant : le scénario MONTRÉ (le rang 1 tant qu'il est ouvert ou réalisé, sinon le suivant).
  S.montre = J && J.montre ? S.items.find(i => i.j === J.montre) || null : null;
  return S;
}
/** Une zone d'invalidation : hachures fines dans [x0, x1] × [y0, y1]. */
function scenHachures(x0, y0, x1, y1, coul) {
  if (!(x1 > x0 && y1 > y0)) return;
  ctx.save();
  ctx.beginPath(); ctx.rect(x0, y0, x1 - x0, y1 - y0); ctx.clip();
  ctx.strokeStyle = coul; ctx.lineWidth = 1; ctx.setLineDash([]);
  const h = y1 - y0;
  ctx.beginPath();
  for (let x = x0 - h; x < x1; x += 6) { ctx.moveTo(x, y1); ctx.lineTo(x + h, y0); }
  ctx.stroke();
  ctx.restore();
}
/** Zones, range, traits du point et de la fin : SOUS les bougies, du point (ou du bord gauche)
 *  jusqu'à la FIN du scénario (ou le bout de la marge de futur). Une zone (niveau ± marge) est une
 *  bande très pâle bordée de pointillés fins, son niveau un tiret plus marqué ; l'invalidation, un
 *  ruban hachuré sur son niveau et des bords en tirets courts ; un range, une boîte en tirets. Le
 *  rang 1 est tracé en dernier (au-dessus) et plus marqué ; les autres rangs, plus pâles ; un
 *  scénario fermé (noté, fini, invalidé, réalisé), à moitié. */
function scenBandes(S) {
  const { g, xMax, yDe, xDeT, F } = S;
  if (!F) return;
  const top = g.pad.top, bas = top + g.ph;
  ctx.save();
  ctx.beginPath(); ctx.rect(g.pad.left, top, xMax - g.pad.left, g.ph); ctx.clip();
  // Débutant : le scénario MONTRÉ seul (le rang 1, ou le suivant s'il est tombé), à mi-opacité ;
  // sans hachures (la zone d'invalidation n'apparaît qu'au survol, scenSurvolDebutant) ni traits du
  // point et de la fin. Un scénario invalidé (ou sorti) s'efface en PARAM.scenarios.jour.fonduMinutes
  // après le créneau du contact ; une cible touchée garde un aplat plus marqué.
  const deb = S.deb;
  for (const it of S.items.slice().reverse()) {
    // Débutant : le montré, et le rang 1 pendant son fondu même quand un autre est montré (sa boîte
    // ne disparaît pas d'une minute à l'autre ; sans texte : le budget ne change pas).
    if (deb && it !== S.montre && !scenUnEnFondu(S, it)) continue;
    let fon = it.fondu === null || it.fondu === undefined ? 1 : it.fondu;
    // Expert : un scénario fermé garde une bande pâle après son fondu (le détail reste).
    if (!deb) fon = Math.max(fon, 0.3);
    if (fon <= 0) continue;
    const sc = it.sc, c = it.coul, x0 = Math.max(g.pad.left, xDeT(sc.emis)), x1 = Math.min(xMax, xDeT(sc.fin)), w = x1 - x0;
    if (w <= 1) continue;
    const a = (deb ? (it.ouvert ? 0.5 : 0.4) : (sc.rang === '1' ? 1 : sc.rang === 'S' ? 0.45 : 0.65) * (it.ouvert ? 1 : 0.5)) * fon;
    const ligne = (p, dash, alpha, lw) => { const y = yDe(p); ctx.strokeStyle = avecAlpha(c, alpha * a); ctx.lineWidth = lw || 1; ctx.setLineDash(dash); ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke(); };
    // Les cibles touchées QUI COMPTENT (chaîne stricte, avant l'invalidation) : un aplat plus marqué.
    const touchees = [];
    for (const x of Scenarios.touchesValides(sc, it.sv)) touchees[x.j] = x.t;
    if (sc.forme === 'chemin') {
      sc.zones.cibles.forEach((z, k) => {
        const y1 = yDe(z[1]), y0 = yDe(z[0]);
        ctx.fillStyle = avecAlpha(c, 0.06 * a * (isNum(touchees[k]) ? 1.6 : 1)); ctx.fillRect(x0, y1, w, y0 - y1);
        ligne(z[0], [1, 3], 0.45); ligne(z[1], [1, 3], 0.45);
        ligne(sc.cibles[k], [7, 4], 0.85, sc.rang === '1' ? 1.4 : 1.1);
      });
      if (sc.zones.inv && !deb) {
        const y = yDe(sc.invalidation);
        scenHachures(x0, y - 3, x1, y + 3, avecAlpha(c, 0.55 * a));
        ligne(sc.zones.inv[0], [3, 3], 0.4); ligne(sc.zones.inv[1], [3, 3], 0.4);
      }
    } else {
      const y1 = yDe(sc.range[1]), y0 = yDe(sc.range[0]);
      // Débutant : l'aplat léger des figures (guideFormeAplat), sans texte : le range se voit.
      ctx.fillStyle = avecAlpha(c, deb ? 0.09 * fon : 0.04 * a); ctx.fillRect(x0, y1, w, y0 - y1);
      // Débutant : un range plus haut que toute la vue n'a que ses deux bords verticaux à l'écran,
      // deux tirets sans explication : il n'est pas tracé (son libellé, en haut, le nomme).
      if (!(deb && y1 <= top && y0 >= bas)) {
        ctx.strokeStyle = avecAlpha(c, 0.8 * a); ctx.lineWidth = 1.1; ctx.setLineDash([7, 4]);
        ctx.strokeRect(x0 + 0.5, y1, w - 1, y0 - y1);
      }
      // Ce que la marge tolère au-delà des bornes : pointillé fin.
      ligne(sc.zones.haut, [1, 3], 0.45); ligne(sc.zones.bas, [1, 3], 0.45);
    }
  }
  if (deb) { ctx.setLineDash([]); ctx.restore(); return; }
  // Le point du matin et la fin des scénarios du jour : deux verticales pointillées.
  ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
  const xE = xDeT(F.emis);
  if (xE >= g.pad.left && xE <= xMax) {
    ctx.strokeStyle = avecAlpha(COLORS.ink1, 0.55);
    ctx.beginPath(); ctx.moveTo(xE, top); ctx.lineTo(xE, bas); ctx.stroke();
  }
  const xF = xDeT(F.fin);
  if (xF >= g.pad.left && xF <= xMax) {
    ctx.strokeStyle = avecAlpha(COLORS.ink3, 0.6);
    ctx.beginPath(); ctx.moveTo(xF, top); ctx.lineTo(xF, bas); ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.restore();
}
/** Le rang 1 fermé, pendant son fondu, quand un autre scénario est le montré (Débutant). */
const scenUnEnFondu = (S, it) => !!(S.deb && it !== S.montre && it.sc.rang === '1' && !it.ouvert && it.fondu > 0);
/** Les bougies visibles, gêne « douce » des étiquettes : essayées d'abord sans les couvrir. */
function scenSurBougies(S) {
  const g = S.g;
  return r => {
    const i0 = Math.max(g.vs, g.vs + Math.floor((r.x - g.pad.left) / g.gap)), i1 = Math.min(g.ve - 1, g.vs + Math.floor((r.x + r.w - g.pad.left) / g.gap));
    for (let i = i0; i <= i1; i++) { const c = candles[i]; if (S.yDe(c.high) <= r.y + r.h && S.yDe(c.low) >= r.y) return true; }
    return false;
  };
}
/** Un segment [x0, y0, x1, y1] passe-t-il dans le rectangle r ({x, y, w, h}) agrandi de m px ? */
function scenSegDans(sg, r, m) {
  const n = Math.max(1, Math.ceil(Math.hypot(sg[2] - sg[0], sg[3] - sg[1]) / 3));
  for (let j = 0; j <= n; j++) {
    const x = sg[0] + (sg[2] - sg[0]) * j / n, y = sg[1] + (sg[3] - sg[1]) * j / n;
    if (x > r.x - m && x < r.x + r.w + m && y > r.y - m && y < r.y + r.h + m) return true;
  }
  return false;
}
/** Les bougies les plus récentes (le quart de la vue, au moins 3) : gêne « dure » de l'encadré et des
 *  libellés posés en repli — rien ne les couvre. */
function scenRecentes(S) {
  const g = S.g, n = Math.max(3, Math.ceil(g.n * 0.25)), i0 = Math.max(0, g.n - n);
  return r => {
    const a = Math.max(g.vs + i0, g.vs + Math.floor((r.x - g.pad.left) / g.gap)), b = Math.min(g.ve - 1, g.vs + Math.floor((r.x + r.w - g.pad.left) / g.gap));
    for (let i = a; i <= b; i++) { const c = candles[i]; if (S.yDe(c.high) <= r.y + r.h && S.yDe(c.low) >= r.y) return true; }
    return false;
  };
}
/** AVANT les libellés du Guide : le libellé du rang 1, la seule étiquette des scénarios qui passe
 *  devant ceux des niveaux du Guide quand la place manque (un niveau du Guide sans place est nommé
 *  au bord, guideBords). */
function scenAvantGuide(S) {
  if (!S || !S.F) return;
  const g = S.g, top = g.pad.top, bas = top + g.ph;
  const un = S.items.find(it => it.sc.rang === '1');
  // 'hors' (fenêtre du rang 1 finie avant la vue) ne retient pas les autres rangs.
  S.unPose = un ? scenLibelle(S, un, top, bas, scenSurBougies(S)) : null;
}
/** Les étiquettes et tracés AU-DESSUS des bougies, APRÈS les libellés du Guide : l'encadré, les
 *  flèches et repères, les libellés des rangs 2, 3 et semaine, les noms des traits du point et de
 *  la fin. Si le rang 1 n'a pas de libellé, les autres rangs n'en ont pas non plus (la hiérarchie
 *  ne s'inverse pas : le plus probable n'est jamais le seul sans nom). */
function scenTracer(S) {
  const g = S.g, top = g.pad.top, bas = top + g.ph;
  // Les tracés du Guide (chemins conditionnels, formes) : posés avant, ils gênent l'encadré et les flèches.
  S.obstSegs = guideEtat && overlays.guide ? [].concat(...guideEtat.cibles.map(c => c.segs || [])) : [];
  if (S.deb) {
    // Débutant : le libellé du scénario MONTRÉ (le rang 1 ouvert ou réalisé ; sinon le suivant encore
    // ouvert ; sinon un réalisé ; sinon le rang 1 pendant son fondu) et sa flèche s'il est ouvert, ses
    // coches et sa croix (dessinées, sans texte), puis la ligne des scénarios.
    const M = S.F ? S.montre : null;
    if (M) {
      scenLibelleDebutant(S, M, top, bas);
      if (M.ouvert) scenChemin(S, M, top, bas);
      scenMarques(S, M, top, bas);
    }
    // Le rang 1 en fondu quand un autre est montré : sa croix, dessinée (sans texte).
    const un1 = S.F ? S.items.find(i => scenUnEnFondu(S, i)) : null;
    if (un1) scenMarques(S, un1, top, bas);
    scenBoiteDebutant(S);
    return;
  }
  scenBoite(S, top, bas);
  if (!S.F) return;
  // Le chemin du scénario NOMMÉ (plus petit écart) d'abord : les autres le contournent. S'il n'a
  // pas de place pour sa flèche, aucun autre n'en a (une seule flèche partant du prix, celle d'un
  // scénario moins proche, se lirait comme la plus probable) : leurs repères restent.
  const nomme = S.items.find(i => i.meneur && i.ouvert && i.sc.forme === 'chemin');
  S.flechesBloquees = false;
  for (const it of nomme ? [nomme].concat(S.items.filter(i => i !== nomme)) : S.items) {
    scenChemin(S, it, top, bas);
    if (it === nomme && !it.fleche) S.flechesBloquees = true;
  }
  for (const it of S.items) scenMarques(S, it, top, bas);
  const un = S.items.find(it => it.sc.rang === '1');
  if (!un || S.unPose) { const sb = scenSurBougies(S); for (const it of S.items) if (it.sc.rang !== '1') scenLibelle(S, it, top, bas, sb); }
  scenReperes(S, top, bas);
}
/** Le bord de la zone z que le prix a franchi en venant de ref (le prix du point, ou la cible
 *  précédente) : le bas d'une zone au-dessus, le haut d'une zone au-dessous. La marque d'un contact
 *  se pose là, jamais au niveau même (le prix n'y est peut-être jamais allé). */
const scenBordFranchi = (z, ref) => (isNum(ref) && (z[0] + z[1]) / 2 < ref ? z[1] : z[0]);
/** Les marques des contacts d'un scénario, au point du contact (x : le milieu de la bougie du
 *  contact ; y : le bord de la zone franchi) : une COCHE par cible touchée, une CROIX pour
 *  l'invalidation ou la sortie d'un range (ou un ordre inconnu). Dessinées (7 px), jamais un texte en
 *  Débutant ; en Expert, une pastille dit le créneau : « ✓ 15:15–15:30 UTC », « ✗ S2 15:15–15:30 UTC »
 *  (posée seulement s'il y a la place). La croix reste en Expert jusqu'à la fin de la fenêtre ; en
 *  Débutant, seulement pendant le fondu du scénario montré. */
function scenMarques(S, it, top, bas) {
  const { g, xDeT, yDe, xMax } = S, sc = it.sc, sv = it.sv;
  if (!sv || !sv.pas || !(sv.n > 0) || ['large', 'incomplet'].includes(sv.cle)) return;
  const pas = sv.pas, marques = [], nomR = Scenarios.COURTS_RANG[sc.rang];
  const ref0 = isNum(sc.prixEmission) ? sc.prixEmission : null;
  // Une coche par cible qui COMPTE (chaîne stricte, avant l'invalidation ; aucune si le journal a
  // noté ❌ ou ⚠) : un contact brut, hors de l'ordre ou après l'invalidation, n'en a pas. La
  // pastille nomme son scénario (deux marques au même point se lisaient l'une pour l'autre).
  for (const x of Scenarios.touchesValides(sc, sv)) {
    const z = sc.zones.cibles[x.j];
    marques.push({ t: x.t, y: scenBordFranchi(z, x.j ? sc.cibles[x.j - 1] : ref0), ok: true, texte: '✓ ' + nomR + ' ' + Scenarios.creneau(x.t, pas, S.maintenant, true) });
  }
  const f = it.ferme;
  // La croix : un contact calculé ici, ou la note du journal à son heure de résolution (resolu_utc).
  const croixVue = f && ['invalide', 'sortie', 'ambigu'].includes(f.type) && (S.deb ? it.fondu > 0 : true);
  if (croixVue && isNum(f.t)) {
    let y = null;
    if (f.type === 'invalide' && sc.zones.inv) y = scenBordFranchi(sc.zones.inv, ref0);
    else if (f.type === 'invalide' && sc.forme === 'range') y = sc.premierOk === 'haut' ? sc.zones.haut : sc.premierOk === 'bas' ? sc.zones.bas : null;
    else if (f.type === 'sortie') y = f.niveau;
    else if (f.type === 'ambigu') y = sc.forme === 'range' ? sc.zones.haut : sc.zones.inv ? scenBordFranchi(sc.zones.inv, ref0) : null;
    const quand = f.journal ? Scenarios.creneau(f.t, 0, S.maintenant, true) + ' (journal)' : Scenarios.creneau(f.t, pas, S.maintenant, true);
    if (isNum(y)) marques.push({ t: f.t, y, ok: false, texte: '✗ ' + nomR + ' ' + quand, journal: !!f.journal });
  }
  if (!marques.length) return;
  const c = it.coul, R = 3.5;
  for (const m of marques) {
    const x = xDeT(m.t + (m.journal ? 0 : pas / 2));
    let y = yDe(m.y);
    // Deux marques au même point (la coche d'un scénario, la croix d'un autre : la zone de l'un est
    // l'invalidation de l'autre) : décalées de quelques pixels (coche au-dessus, croix au-dessous).
    const pris = S.marquesPos || (S.marquesPos = []);
    for (let k = 0; k < 3 && pris.some(q => Math.abs(q.x - x) < 2 * R + 1 && Math.abs(q.y - y) < 2 * R + 1); k++) y += m.ok ? -(2 * R + 2) : 2 * R + 2;
    if (!(x >= g.pad.left + R && x <= xMax - R && y >= top + R && y <= bas - R)) continue;
    pris.push({ x, y });
    let pose = null, w = 0;
    if (!S.deb) {
      ctx.font = chartFont(8.5, 650);
      w = ctx.measureText(m.texte).width + 10;
      const xs = [x + 7, x - 7 - w].filter(xx => xx >= g.pad.left + 2 && xx + w <= xMax - 2);
      for (const xx of xs) if ((pose = guidePlacer(S.rects, xx, w, 13, [y - 6.5, y - 20, y + 7], top, bas, 1, 0, 0))) { pose.x = xx; break; }
    }
    etiquettesAFaire.push(() => {
      ctx.save();
      ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.setLineDash([]);
      const trait = () => {
        ctx.beginPath();
        if (m.ok) { ctx.moveTo(x - R, y); ctx.lineTo(x - R / 3, y + R * 0.8); ctx.lineTo(x + R, y - R); }
        else { ctx.moveTo(x - R, y - R); ctx.lineTo(x + R, y + R); ctx.moveTo(x + R, y - R); ctx.lineTo(x - R, y + R); }
        ctx.stroke();
      };
      // Un liseré du fond d'abord : la marque se lit sur une bougie comme sur le fond.
      ctx.strokeStyle = COLORS.bulle; ctx.lineWidth = 4.5; trait();
      ctx.strokeStyle = m.ok ? c : avecAlpha(c, 0.95); ctx.lineWidth = 2; trait();
      if (pose) {
        ctx.font = chartFont(8.5, 650);
        ctx.globalAlpha = 0.92; ctx.fillStyle = COLORS.bulle; ctx.beginPath(); ctx.roundRect(pose.x, pose.y, w, 13, 3); ctx.fill(); ctx.globalAlpha = 1;
        ctx.fillStyle = c; ctx.fillRect(pose.x + 1.5, pose.y + 2.5, 2, 8);
        ctx.fillStyle = COLORS.ink1; ctx.fillText(m.texte, pose.x + 6, pose.y + 10);
      }
      ctx.restore();
    });
    if (pose) scenCible(S, it, [guideZone(pose)], [], [], 1);
    else scenCible(S, it, [{ x0: x - 6, y0: y - 6, x1: x + 6, y1: y + 6 }], [], [], 1);
    (it.marques || (it.marques = [])).push({ x, y, ok: m.ok, texte: pose ? m.texte : null });
  }
}
/** Le titre de la bulle d'un scénario : « Scénario 1 (rang 1) · 86 500 $ (plus haut du 08/10) puis
 *  87 200 $ » ; expert : « S1 (rang 1) 86 500 > 87 200 · inv 85 500 ». « (rang 1) » insécable. */
function scenTitre(sc, mode) {
  const r = sc.rang === 'S' ? '' : ' (rang ' + sc.rang + ')';
  if (mode === 'expert') return Scenarios.libelle(sc, 'expert').replace(/^(\S+)/, '$1' + r);
  return Scenarios.libelle(sc, 'debutant').replace(/^([^·]+?) ·/, '$1' + r + ' ·');
}
/** L'explication d'un scénario pour la bulle de survol. */
function scenCible(S, it, rects, segs, zones, prio) {
  if (S.deb) {
    const c = { rects, segs, zones, prio, coul: it.coul, scenario: it.sc.id, titre: scenTitreDebutant(it.sc), texte: scenTexteDebutant(S, it), texteCourt: scenTexteDebutant(S, it, true) };
    S.cibles.push(c);
    return c;
  }
  const ctxE = { itv: S.itv, statuts: S.F.statuts, maintenant: S.maintenant, PJ: PARAM.scenarios.jour };
  const texte = Scenarios.explication(it.sc, it.sv, S.mode, PARAM.scenarios, ctxE);
  // La journée : distances, écart relatif (avec sa formule), contacts, temps restant — après le suivi.
  const lj = it.j ? Scenarios.ligneJourExpert(it.j, S.jour, ctxE) : null;
  if (lj) { const k = texte.findIndex(l => /^Suivi en direct/.test(l)); texte.splice(k < 0 ? texte.length : k + 1, 0, lj); }
  S.cibles.push({ rects, segs, zones, prio, coul: it.coul, scenario: it.sc.id, titre: scenTitre(it.sc, S.mode), texte });
}
/** Flèche et repères numérotés d'un chemin ENCORE OUVERT, dans la marge de futur : de la dernière
 *  bougie vers la cible 1, puis 2 ; le prix du point est marqué d'un point. Un scénario fermé
 *  (noté, fini, invalidé, réalisé) n'a plus de flèche : il ne se lit pas comme une projection.
 *  Un repère reste à la hauteur de SON niveau (au bord du tracé si le niveau est hors de la vue,
 *  avec un petit triangle vers lui) ; il ne glisse qu'à l'horizontale, et toujours de gauche à
 *  droite dans l'ordre des cibles, jamais sur un tracé du Guide. Sans place pour ①, rien ; sans
 *  place pour ②, ① seul (jamais ② sans ①). Une flèche qui croiserait ou longerait un chemin du
 *  Guide (ou d'un rang mieux classé), ou passerait sous une étiquette, n'est pas tracée : les
 *  repères restent seuls sur leurs niveaux. */
function scenChemin(S, it, top, bas) {
  const { g, yDe, xDeT, xFin, xMax } = S, sc = it.sc;
  // La zone (le trait du niveau ± 4 px, et la zone entière dans la marge de futur) : survolable.
  const x0 = Math.max(g.pad.left, xDeT(sc.emis)), x1 = Math.min(xMax, xDeT(sc.fin));
  const zones = [];
  if (x1 > x0) {
    const niveaux = sc.forme === 'range' ? sc.range : sc.cibles.concat(sc.invalidation !== null ? [sc.invalidation] : []);
    for (const p of niveaux) { const y = yDe(p); if (y >= top && y <= bas) zones.push({ x0, y0: y - 4, x1, y1: y + 4 }); }
    // Débutant : les bords verticaux tracés d'un range se survolent (ou se touchent) aussi.
    if (S.deb && sc.forme === 'range') {
      const yt = Math.max(top, yDe(sc.range[1])), yb = Math.min(bas, yDe(sc.range[0]));
      if (yb > yt && !(yDe(sc.range[1]) <= top && yDe(sc.range[0]) >= bas)) for (const xe of [x0, x1]) zones.push({ x0: xe - 5, y0: yt, x1: xe + 5, y1: yb });
    }
    if (S.marge > 20 && x1 > xFin) {
      const zs = sc.forme === 'range' ? [[sc.zones.bas, sc.zones.haut]] : sc.zones.cibles;
      for (const z of zs) { const y1 = Math.max(top, yDe(z[1])), y0 = Math.min(bas, yDe(z[0])); if (y0 > y1) zones.push({ x0: xFin, y0: y1, x1, y1: y0 }); }
    }
  }
  const segs = [], rects = [];
  // La semaine (rang S) n'a ni flèche ni repères : ses zones et son libellé suffisent.
  // Sur des bougies trop larges (4 h, 1 jour), le suivi ne sait pas si le chemin est encore ouvert :
  // pas de flèche non plus.
  if (it.ouvert && !(it.sv && (it.sv.cle === 'large' || it.sv.cle === 'incomplet')) && sc.forme === 'chemin' && sc.rang !== 'S' && S.finVue && S.marge > 24) {
    const R = 7, lo = top + R + 1, hi = bas - R - 1;
    const der = candles[candles.length - 1];
    // La flèche part un peu à droite de la dernière bougie (les chemins du Guide partent d'elle).
    const p0 = [g.pad.left + g.gap * (candles.length - 1 - g.vs) + g.candleW + 5, Math.max(lo, Math.min(hi, yDe(der.close)))];
    const xE = xDeT(sc.emis), dansVue = xE >= g.pad.left && xE <= xFin && isNum(sc.prixEmission);
    const pE = dansVue ? [xE, yDe(sc.prixEmission)] : null;
    // Le chemin RESTANT : seulement les cibles pas encore touchées (une cible touchée a sa coche, son
    // repère disparaît) ; les repères gardent le numéro de leur cible (② seul après ①).
    const N = sc.cibles.length, deja = [], kDeb = it.sv && it.sv.cle === 'cible' ? Math.min(it.sv.k, N - 1) : 0;
    // Les tracés déjà là : chemins conditionnels (et formes) du Guide, flèches des rangs mieux classés.
    const obst = S.obstSegs.concat(S.segsPris);
    // Les places prises (encadré, libellés, badges, repères déjà posés), avec 3 px d'air ; un repère
    // ne se pose pas non plus sur un tracé du Guide.
    const pris = (x, y) => S.rects.concat(deja).some(r => x + R + 3 > r.x && x - R - 3 < r.x + r.w && y + R + 3 > r.y && y - R - 3 < r.y + r.h)
      || obst.some(sg => guideDistSeg(x, y, sg) < R + 6 || Math.hypot(x - sg[2], y - sg[3]) < R + 18);
    let xPrec = -Infinity;
    const pts = sc.cibles.slice(kDeb).map((v, kk) => {
      const k = kk + kDeb, y = yDe(v), yb = Math.max(lo, Math.min(hi, y)), hors = y < lo - 0.5 ? -1 : y > hi + 0.5 ? 1 : 0;
      const xMin = Math.max(xFin + R + 2, xPrec + 2 * R + 4), xLim = xMax - R - 3;
      const x = Math.max(xMin, xFin + S.marge * (N > 1 ? 0.4 + 0.42 * k / (N - 1) : 0.55));
      let xb = null;
      for (let d = 0; xb === null && d <= S.marge; d += 4) for (const c of [x + d, x - d]) if (c >= xMin && c <= xLim && !pris(c, yb)) { xb = c; break; }
      const cache = xb === null;
      if (!cache) { deja.push({ x: xb - R - 1, y: yb - R - 1, w: 2 * R + 2, h: 2 * R + 2 }); xPrec = xb; }
      return { x: cache ? Math.min(x, xLim) : xb, y: yb, hors, k, cache };
    });
    // Jamais ② sans ① : seuls les repères posés AVANT le premier sans place sont gardés (la flèche
    // ne plie pas à l'endroit d'un repère absent) ; sans ①, ni flèche ni repère.
    const k0 = pts.findIndex(p => p.cache), vis = k0 < 0 ? pts : pts.slice(0, k0);
    // La flèche ne croise ni ne longe un tracé du Guide (ou d'un rang mieux classé), ni ne passe
    // sous une étiquette ; le départ commun (la dernière bougie) est exclu. Sinon, la flèche de ①
    // à ② seule ; sinon les repères seuls, sur leurs niveaux.
    const segsDe = ch => { const out = []; for (let k = 1; k < ch.length; k++) out.push([ch[k - 1][0], ch[k - 1][1], ch[k][0], ch[k][1]]); return out; };
    const gene = (x, y) => Math.hypot(x - p0[0], y - p0[1]) > 16
      && (obst.some(sg => guideDistSeg(x, y, sg) < 5) || S.rects.some(r => x > r.x - 2 && x < r.x + r.w + 2 && y > r.y - 2 && y < r.y + r.h + 2));
    const croise = ch => segsDe(ch).some(([xa, ya, xb, yb]) => {
      const L = Math.hypot(xb - xa, yb - ya), n = Math.max(1, Math.ceil(L / 3));
      for (let j = 0; j <= n; j++) {
        const x = xa + (xb - xa) * j / n, y = ya + (yb - ya) * j / n;
        // Les bords des repères de ce chemin ne gênent pas leur propre flèche.
        if (vis.some(p => Math.hypot(x - p.x, y - p.y) <= R + 4)) continue;
        if (gene(x, y)) return true;
      }
      return false;
    });
    const pv = vis.map(p => [p.x, p.y]);
    let chemin = vis.length ? [p0].concat(pv) : [];
    if (chemin.length && croise(chemin)) chemin = pv.length >= 2 && !croise(pv) ? pv : [];
    if (S.flechesBloquees) chemin = [];
    const tous = segsDe(chemin), fleche = chemin.length >= 2;
    if (fleche) { for (const sg of tous) { segs.push(sg); S.segsPris.push(sg); } }
    for (const p of vis) rects.push({ x0: p.x - R - 2, y0: p.y - R - 2, x1: p.x + R + 2, y1: p.y + R + 2 });
    for (const p of vis) S.rects.push({ x: p.x - R - 3, y: p.y - R - 3, w: 2 * R + 6, h: 2 * R + 6 });
    it.fleche = fleche; it.reperes = vis.length;
    const c = it.coul, fort = sc.rang === '1', touchees = [];
    for (const x of Scenarios.touchesValides(sc, it.sv)) touchees[x.j] = x.t;
    // Le tracé : POINTILLÉ rond (les chemins du Guide sont en tirets), une pointe avant le dernier
    // repère ; les repères par-dessus.
    if (fleche) {
      ctx.save();
      ctx.beginPath(); ctx.rect(g.pad.left, top, xMax - g.pad.left, g.ph); ctx.clip();
      ctx.strokeStyle = avecAlpha(c, fort ? 0.9 : 0.7); ctx.lineWidth = fort ? 2 : 1.6; ctx.lineCap = 'round'; ctx.setLineDash([0.5, 4.5]);
      ctx.beginPath(); chemin.forEach(([x, y], k) => (k ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); ctx.setLineDash([]); ctx.lineCap = 'butt';
      const [xa, ya] = chemin[chemin.length - 2], [xe, ye] = chemin[chemin.length - 1], ang = Math.atan2(ye - ya, xe - xa);
      const xp = xe - (R + 1) * Math.cos(ang), yp = ye - (R + 1) * Math.sin(ang);
      ctx.fillStyle = avecAlpha(c, fort ? 0.9 : 0.7);
      ctx.beginPath(); ctx.moveTo(xp, yp); ctx.lineTo(xp - 7 * Math.cos(ang - 0.45), yp - 7 * Math.sin(ang - 0.45)); ctx.lineTo(xp - 7 * Math.cos(ang + 0.45), yp - 7 * Math.sin(ang + 0.45)); ctx.closePath(); ctx.fill();
      if (pE && pE[1] >= top && pE[1] <= bas && !S.deb) { ctx.fillStyle = COLORS.ink1; ctx.beginPath(); ctx.arc(pE[0], pE[1], 3, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }
    // Débutant : un point sur chaque niveau, sans chiffre (un chiffre dessiné est un texte).
    if (vis.length && S.deb) etiquettesAFaire.push(() => {
      for (const p of vis) { ctx.fillStyle = avecAlpha(c, touchees[p.k] ? 0.5 : 0.9); ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill(); }
    });
    else if (vis.length) etiquettesAFaire.push(() => {
      for (const p of vis) {
        const touche = !!touchees[p.k];
        ctx.fillStyle = COLORS.bulle; ctx.beginPath(); ctx.arc(p.x, p.y, R, 0, Math.PI * 2); ctx.fill();
        if (touche) { ctx.fillStyle = avecAlpha(c, 0.35); ctx.fill(); }
        ctx.strokeStyle = c; ctx.lineWidth = fort ? 1.8 : 1.3; ctx.stroke();
        ctx.fillStyle = COLORS.ink1; ctx.font = chartFont(9, 750); ctx.textAlign = 'center';
        ctx.fillText(String(p.k + 1), p.x, p.y + 3.2);
        ctx.textAlign = 'left';
        // Niveau hors de la vue : un petit triangle (dessiné, pas une glyphe) vers lui, dans le tracé.
        if (p.hors) {
          const xt = p.x + R + 6 <= xMax - 2 ? p.x + R + 5 : p.x - R - 5, h = 4.5 * p.hors;
          ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(xt - 4, p.y - h / 2); ctx.lineTo(xt + 4, p.y - h / 2); ctx.lineTo(xt, p.y + h / 2 + (p.hors > 0 ? 2 : -2)); ctx.closePath(); ctx.fill();
        }
      }
    });
  }
  scenCible(S, it, rects, segs, zones, 2);
}
/** Le libellé d'un scénario, près du trait de son premier niveau (le haut d'un range), à gauche
 *  de la marge de futur ; un niveau hors de la vue est nommé au bord, avec sa flèche. Fermé, il dit
 *  aussi son état court (« · invalidation d'abord 13:30–13:45 UTC (en direct) »). */
function scenLibelle(S, it, top, bas, surBougies) {
  const { g, yDe, xFin, xMax, exp } = S, sc = it.sc, H = 15;
  if (S.xDeT(sc.fin) < g.pad.left) return 'hors';      // fenêtre finie avant la vue : rien à nommer
  ctx.font = chartFont(9, 600);
  const p = sc.forme === 'range' ? sc.range[1] : sc.cibles[0], y = yDe(p);
  const hors = y < top + 2 ? -1 : y > bas - 2 ? 1 : 0;
  const droite = (S.marge > 24 ? xFin : xMax) - 4, place = droite - g.pad.left - 6;
  // Un scénario FERMÉ garde toujours son état (marqué « en direct » s'il n'est pas la note du
  // journal) : sans place, ses niveaux partent d'abord (« Scénario 1 · invalidé (en direct) »,
  // « Scénario 1 · terminé (en direct) »), sinon pas de libellé — jamais ses niveaux seuls, qui se
  // liraient comme une cible encore vivante.
  const et = it.et, nom = exp ? Scenarios.COURTS_RANG[sc.rang] : Scenarios.NOMS_RANG[sc.rang];
  const exper = Scenarios.libelle(sc, 'expert');
  // Le plus petit écart de la journée (la mesure, jamais sa valeur sur le tracé) ; un scénario fermé
  // dit pourquoi ; une fois effacé (fondu fini), son état court seulement.
  // Décidé à la clôture de 15 min (Scenarios.nomNet) : « plus petit écart », « nom gardé » (l'avance
  // d'un autre n'était pas nette) ou « nom repris » (le nommé s'est fermé) ne change pas d'un tick à l'autre.
  const net = it.meneur && Scenarios.nomNet(S.jour), repris = it.meneur && S.jour && S.jour.remplace;
  const base = exp ? (it.meneur ? (net ? [exper + ' · plus petit écart', exper + ' · écart min.'] : [exper + (repris ? ' · nom repris' : ' · nom gardé')]) : [exper]) : [...new Set([Scenarios.libelle(sc, 'debutant', 'complet'), Scenarios.libelle(sc, 'debutant'), Scenarios.libelle(sc, 'debutant', true)])];
  const rai = exp && !it.ouvert && sc.statut === '⏳' ? Scenarios.raison(sc, it.sv, 'expert') : null, efface = it.fondu === 0;
  // Après le fondu, l'Expert garde ses niveaux et sa raison (le détail reste) ; seul le Débutant
  // n'a plus que l'état court.
  const variantes = it.ouvert ? base.concat(exp ? (it.meneur ? [exper] : []) : [exper])
    : efface && !exp ? [nom + ' · ' + et.miniD, nom + ' · ' + et.microD]
    : [...new Set((rai ? [exper + ' · ' + et.court + ' : ' + rai + ' · direct'] : []).concat(base.map(v => v + ' · ' + et.courtD), [nom + ' · ' + et.courtD, nom + ' · ' + et.miniD, nom + ' · ' + et.microD]))];
  const large = Math.min(place, g.pw * (g.pw < PARAM.scenarios.etroit ? 0.9 : 0.62));
  const texte = fleche => {
    for (const v of variantes) if (ctx.measureText(fleche + v).width + 14 <= large) return fleche + v;
    if (!it.ouvert) { const v = fleche + variantes[variantes.length - 1]; return ctx.measureText(v).width + 14 <= place ? v : null; }
    return guideCouper(ctx, fleche + variantes[variantes.length - 1], place - 14);
  };
  // Collé à droite (avant la marge de futur), sinon à gauche de l'encadré, sinon au milieu du
  // tracé : toujours sur le trait de SON niveau ; sans les bougies d'abord, puis par-dessus.
  const B = S.boite;
  const poser = (t, essais, vers, evs) => {
    const w = ctx.measureText(t).width + 14, xs = [droite - w];
    if (B && B.x - 4 - w >= g.pad.left + 2) xs.push(B.x - 4 - w);
    xs.push(Math.max(g.pad.left + 2, (g.pad.left + droite) / 2 - w / 2));
    for (const ev of evs || [surBougies, null]) for (const x of xs) {
      const pose = guidePlacer(S.rects, x, w, H, essais, top, bas, vers, 0, 3, ev || undefined);
      if (pose) return { x, w, pose, t };
    }
    return null;
  };
  let t = texte(hors < 0 ? '↑ ' : hors > 0 ? '↓ ' : '');
  // Hors de la vue : au bord, sinon une ou deux rangées plus loin (sous la ligne de la vue, en haut à gauche).
  const essais = hors < 0 ? [top + 2, top + H + 4, Math.max(top + 2, 38), top + 2 * H + 6] : hors > 0 ? [bas - H - 2, bas - 2 * H - 4, bas - 3 * H - 6] : [y - H - 2, y + 2];
  let r = t ? poser(t, essais, hors > 0 || (!hors && y > (top + bas) / 2) ? -1 : 1) : null;
  // Niveau caché sous l'encadré (téléphone) : le libellé juste sous l'encadré, flèche vers le haut.
  // Niveau au-dessus de la vue, encadré en haut : de même.
  // Comme l'encadré : jamais par-dessus les bougies les plus récentes (sans place, pas de libellé :
  // la ligne de l'encadré nomme déjà le scénario).
  if (!r && B && (hors < 0 ? B.y <= top + 40 : !hors && y >= B.y - H && y <= B.y + B.h + H) && (t = texte('↑ '))) r = poser(t, [B.y + B.h + 2], 1, [surBougies, scenRecentes(S)]);
  if (!r) return false;
  const c = it.coul;
  etiquettesAFaire.push(() => { ctx.font = chartFont(9, 600); guidePastille(ctx, r.x, r.pose.y, r.w, H, r.t, c); });
  S.propres.push({ x: r.x, y: r.pose.y, w: r.w, h: H });
  S.libelles.push({ rang: sc.rang, t: r.t });
  scenCible(S, it, [guideZone(r.pose)], [], [], 1);
  return true;
}
/** Les traits du point et de la fin des scénarios du jour, nommés en haut (sinon plus bas, sinon
 *  au bas du tracé), sous la forme la plus complète qui trouve une place. */
function scenReperes(S, top, bas) {
  const { g, F, xDeT, xMax, exp } = S, P = PARAM.scenarios;
  const H = 14, hU = t => Scenarios.heureUTC(t) + ' UTC', hP = t => Scenarios.heureParis(t), jour = t => Scenarios.jourGroupe(new Date(t).toISOString().slice(0, 10));
  const pE = hP(F.emis) ? ' (' + hP(F.emis) + ' Paris)' : '', pF = hP(F.fin) ? ' (' + hP(F.fin) + ' Paris)' : '';
  // Le temps restant, relu à chaque dessin (aucune minuterie : sans nouvelle donnée, il avance au dessin suivant).
  const resteF = Scenarios.reste(F.fin - S.maintenant);
  const sem = isNum(F.finSemaine) && F.finSemaine !== F.fin && S.items.some(i => i.sc.rang === 'S') ? ' Le scénario de la semaine court jusqu’au ' + jour(F.finSemaine) + ' à ' + hU(F.finSemaine) + '.' : '';
  for (const [t, noms, expl] of [
    [F.emis, exp ? ['Point · ' + hU(F.emis), hU(F.emis)] : ['Point de ' + P.point + ' Paris · écrit à ' + hU(F.emis) + pE, 'Écrit à ' + hU(F.emis) + pE, 'Point · ' + hU(F.emis), hU(F.emis)],
      'Le moment où les scénarios du point de ' + P.point + ' (Paris) ont été écrits : le ' + jour(F.emis) + ' à ' + hU(F.emis) + pE + (isNum(F.prixEmission) ? ', prix ' + Scenarios.prix(F.prixEmission) : '') + '. Les zones partent de là.'],
    [F.fin, (resteF ? ['fin · ' + jour(F.fin) + ' ' + hU(F.fin) + ' · reste ' + resteF, 'fin · ' + hU(F.fin) + ' · reste ' + resteF] : []).concat(exp ? ['fin · ' + jour(F.fin) + ' ' + hU(F.fin), 'fin · ' + hU(F.fin)] : ['fin des scénarios du jour · ' + jour(F.fin) + ' ' + hU(F.fin) + pF, 'fin du jour · ' + jour(F.fin) + ' ' + hU(F.fin), 'fin · ' + hU(F.fin)]),
      'Fin de la fenêtre des scénarios 1 à 3 : ' + jour(F.fin) + ' à ' + hU(F.fin) + (hP(F.fin) ? ' (' + hP(F.fin) + ' Paris)' : '') + '. Le journal les note ensuite, le matin même.' + sem]]) {
    const x = xDeT(t);
    if (!(x >= g.pad.left && x <= xMax)) continue;
    ctx.font = chartFont(8.5, 650);
    const rangs = [0, 1, 2, 3, 4].map(k => top + 2 + k * (H + 2)).concat([bas - H - 26, bas - H - 42]);
    let pose = null, nom = null, xl = 0, w = 0;
    for (const n of noms) {
      w = ctx.measureText(n).width + 10;
      for (const xc of [x + 3, x - 3 - w]) {
        if (xc < g.pad.left || xc + w > xMax) continue;
        if ((pose = guidePlacer(S.rects, xc, w, H, rangs, top, bas, 1, 0, 0))) { xl = xc; nom = n; break; }
      }
      if (pose) break;
    }
    S.cibles.push({ rects: pose ? [guideZone(pose)] : [], segs: [[x, top, x, bas]], prio: 3, coul: COLORS.ink3, titre: noms[0], texte: [expl, 'Une description, pas une recommandation.'] });
    if (!pose) continue;
    etiquettesAFaire.push(() => {
      ctx.font = chartFont(8.5, 650);
      ctx.globalAlpha = 0.92; ctx.fillStyle = COLORS.bulle; ctx.beginPath(); ctx.roundRect(xl, pose.y, w, H, 3); ctx.fill(); ctx.globalAlpha = 1;
      ctx.fillStyle = COLORS.text; ctx.fillText(nom, xl + 5, pose.y + H - 4);
    });
  }
}
/** Une raison de lecture ratée, dite simplement. */
function scenRaison(r) {
  if (r === 'réseau') return 'réseau injoignable';
  if (r === 'HTTP 404') return 'fichier introuvable (HTTP 404)';
  if (/^HTTP \d+$/.test(r || '')) return 'serveur en erreur (' + r + ')';
  if (r === 'JSON illisible') return 'fichier illisible (JSON)';
  return 'fichier illisible (' + r + ')';
}
/** L'encadré, en haut à droite du tracé, dans sa moitié haute : le titre, une ligne par scénario
 *  classé avec son état, le sens du classement (débutant), la mesure de l'ordre, et ce qui est un
 *  suivi en direct. Posé APRÈS les libellés du Guide, dans une place libre (jamais sur un chemin du
 *  Guide), sous sa forme la plus complète qui tient (pleine, courte, compacte, serrée : les états de
 *  tous les rangs sur une ligne) — en haut à droite d'abord, ailleurs ensuite ; jamais sur les
 *  bougies les plus récentes. Sans
 *  place, une seule ligne qui nomme le rang 1 et renvoie à l'explication (survol ou doigt). Dessiné
 *  sur le calque (scenCalque). Fichier d'attente : sa note (2 lignes au plus) ; illisible : une ligne. */
function scenBoite(S, top, bas) {
  const P = PARAM.scenarios, g = S.g, exp = S.exp, F = S.F;
  const etroit = g.pw < P.etroit, tactile = etroit || (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches);
  const wMax = Math.floor(Math.min(P.boiteMax, (S.xMax - g.pad.left) * (etroit ? P.boiteFractionEtroit : P.boiteFraction)));
  const L = [];   // { t, f: 'titre' | 'ligne' | 'note' | 'seule', it, garde, compact, toujours }
  let PJx = [], RE = [];   // Expert : les variantes de la phrase de la journée et du temps restant
  const heure = ms => Scenarios.heureUTC(ms) + ' UTC';
  let titreBoite, large = false;
  if (!F) {
    let t;
    if (previsions && previsions.etat === 'attente') t = 'Scénarios du matin : ' + (previsions.note ? previsions.note.charAt(0).toLowerCase() + previsions.note.slice(1) : 'en attente du prochain point.');
    else t = 'Scénarios du matin : pas de fichier lisible (' + heure(previsionsEchec ? previsionsEchec.a : S.maintenant) + ')';
    L.push({ t, f: 'seule' });
    titreBoite = 'Scénarios du matin';
  } else {
    const semI = S.items.find(i => i.sc.rang === 'S');
    titreBoite = Scenarios.titre(F, P, S.maintenant, semI ? semI.ouvert : false);
    L.push({ t: titreBoite, f: 'titre' });
    // Bougies trop larges (4 h, 1 jour) : les lignes sans état, et une seule note qui le dit.
    large = S.items.some(i => i.et.cle === 'large');
    // La journée : le plus petit écart (ou « trop tôt », « aucun ne colle », « seul encore en cours »…),
    // une mesure et jamais une probabilité ; les distances en dollars sur chaque ligne (jamais l'indice).
    PJx = exp && S.jour ? [...new Set(Scenarios.phraseJourExpert(S.jour, PARAM.scenarios.jour))] : [];
    if (PJx.length) L.push({ t: PJx[0], tc: PJx[Math.min(1, PJx.length - 1)], f: 'jour', variantes: PJx });
    for (const it of S.items) {
      const et = large && it.et.cle === 'large' ? null : it.et, suf = exp && it.j ? Scenarios.suffixeExpert(it.j, S.jour) : '';
      const lc = Scenarios.ligne(it.sc, et, S.mode, true), mq = exp && it.j && Scenarios.pointe(it.j, S.jour) ? ' ◂' : '';
      // Forme courte : avec ses distances en dollars si elles tiennent sur la ligne, sinon sans.
      L.push({ t: Scenarios.ligne(it.sc, et, S.mode) + suf, tc: lc + mq, tcs: suf ? [lc + suf, lc + mq] : null, f: 'ligne', it });
    }
    if (large) L.push({ t: Scenarios.noteLarge(S.itv, S.mode), f: 'note', toujours: true });
    RE = exp && S.jour ? Scenarios.ligneResteExpert(S.jour) : [];
    // Le temps restant : dans les formes compactes, au bout de leur note (même hauteur).
    if (RE.length) L.push({ t: RE[0], tc: RE[1], f: 'note', garde: 2, variantes: RE });
    const sem = !!semI;
    if (!exp) L.push({ t: 'Classement de Claude (une IA) : 1 = jugé le plus probable, 3 = le moins' + (sem ? ' ; la ligne Semaine est à part' : '') + '. Sans pourcentage.', f: 'note', garde: 2 });
    const b = Scenarios.texteBilan(F.bilan, P, S.mode);
    if (b) L.push({ t: b, f: 'note', garde: 3 });
    L.push({ t: exp ? 'Claude (IA) · suivi en direct · note officielle : le journal' : 'États : suivi en direct, la note officielle est celle du journal.', f: 'note', garde: 1 });
    if (previsionsEchec) L.push({ t: 'Relecture impossible (' + heure(previsionsEchec.a) + ') · fichier lu à ' + heure(F.luA), f: 'note', garde: 0 });
    // La forme compacte : une note qui dit les deux (classement, suivi en direct), le bilan en bref.
    L.push({ t: exp ? 'Claude (IA) · suivi en direct · officiel : le journal' : 'Classé par Claude (une IA), sans pourcentage · suivi en direct, la note officielle est celle du journal', f: 'note', compact: 2 });
    L.push({ t: exp ? 'Claude (IA) · suivi en direct' : 'Classé par Claude (IA), sans pourcentage · suivi en direct', f: 'note', compact: 1 });
    const bc = Scenarios.texteBilan(F.bilan, P, 'expert');
    if (bc) L.push({ t: bc, f: 'note', compact: 'bilan' });
  }
  const police = f => (f === 'titre' ? chartFont(9.5, 700) : f === 'jour' ? chartFont(9, 650) : f === 'ligne' || f === 'etats' ? chartFont(9, 600) : chartFont(8.5, 550));
  const hL = f => (f === 'titre' ? 14 : f === 'ligne' || f === 'etats' || f === 'jour' ? 12.5 : 11.5);
  // Mise en page : chaque ligne d'un scénario sur 2 lignes au plus, puis sa forme courte sur 1 ;
  // les notes restent (le sens du classement, la mesure de l'ordre, « suivi en direct ») ; la
  // note de relecture ratée part la première (elle reste dans l'explication du titre) ; enfin la
  // forme compacte (une note qui dit tout, sur 2 lignes puis 1).
  const mettre = (maxL, gardeMin, court, compact) => {
    const out = [];
    for (const l of L) {
      // Forme compacte (compact = 2 ou 1) : sa note sur `compact` lignes, et le bilan en bref.
      if (l.f === 'note' && !l.toujours && (compact ? !(l.compact === compact || l.compact === 'bilan') : l.compact || l.garde < gardeMin)) continue;
      ctx.font = police(l.f);
      if (compact && l.compact === compact && RE.length) {
        const ls = guideLignes(ctx, l.t + ' · ' + RE[RE.length - 1], wMax - 16, compact);
        if (!/…$/.test(ls[ls.length - 1])) { out.push(...ls.map(t => ({ t, f: l.f, h: hL(l.f) }))); continue; }
      }
      if (court && l.tcs) { const v = l.tcs.find(x => ctx.measureText(x).width <= wMax - 16); if (v) { out.push({ t: v, f: l.f, it: l.it, h: hL(l.f) }); continue; } }
      // La ligne de la journée et celle du temps restant : sur UNE ligne, la plus riche qui tient.
      if (l.variantes) { const v = l.variantes.find(x => ctx.measureText(x).width <= wMax - 16) || l.variantes[l.variantes.length - 1]; out.push({ t: guideCouper(ctx, v, wMax - 16) || v, f: l.f, h: hL(l.f) }); continue; }
      const nMax = l.f === 'ligne' ? maxL : l.compact ? 1 : 2;
      const ls = guideLignes(ctx, court && l.tc ? l.tc : l.t, wMax - 16, nMax);
      for (const t of ls) out.push({ t, f: l.f, it: l.it, h: hL(l.f) });
    }
    return out;
  };
  const mesurer = lignes => {
    let w = 0;
    for (const l of lignes) { ctx.font = police(l.f); w = Math.max(w, ctx.measureText(l.t).width); }
    return { lignes, w: Math.min(wMax, Math.ceil(w) + (F ? 18 : 12)), h: lignes.reduce((a, l) => a + l.h, 0) + 8 };
  };
  // La forme SERRÉE (écrans de portable) : le titre, les états de tous les rangs sur une ligne
  // (« Suivi en direct : 1 · invalidé | 2 · rien de touché | … », deux lignes au plus), puis
  // (niveau 2) le classement sans pourcentage et le bilan en bref. Chaque scénario s'explique au
  // survol de l'encadré (sa ligne complète en tête). Niveau 1 : une seule note ; niveau 0 : aucune
  // (débutant : « classés sans pourcentage » au bout du titre) ; niveau −1 : le titre seul.
  const serrer = niveau => {
    const out = [];
    const pousser = (t, f, max) => { ctx.font = police(f); for (const x of guideLignes(ctx, t, wMax - 16, max)) out.push({ t: x, f, h: hL(f) }); };
    // Niveau 0, débutant : le classement sans pourcentage tient dans le titre (sur une ligne), s'il y tient.
    ctx.font = police('titre');
    const tSans = titreBoite + ' · classés sans pourcentage';
    pousser(niveau === 0 && !exp && ctx.measureText(tSans).width <= wMax - 16 ? tSans : titreBoite, 'titre', 2);
    const etats = Scenarios.ligneEtats(S.items, S.mode, large);
    const J = S.jour, nomJ = exp && J && J.cas === 'meneur' ? (Scenarios.nomNet(J) ? ' · écart min. : ' : J.remplace ? ' · nom repris : ' : ' · nom gardé : ') + J.meneur.sc.rang : exp && J && J.cas === 'tot' ? ' · trop tôt pour départager' : '';
    if (etats) pousser(etats + nomJ, 'etats', 2);
    // Expert : la phrase courte de la journée (sauf un nom, déjà dit) et le temps restant, sur une ligne.
    if (exp && niveau >= 0 && J) {
      const pj = J.cas === 'meneur' || J.cas === 'tot' ? null : PJx[PJx.length - 1], re = RE.length ? RE[RE.length - 1] : null;
      const tj = [pj, re].filter(Boolean).join(' · ');
      if (tj) pousser(tj, 'jour', 1);
    }
    const bc = Scenarios.texteBilan(F.bilan, P, 'expert');
    if (niveau === 2) {
      if (!exp) pousser('Classé par Claude (IA), sans pourcentage', 'note', 1);
      if (bc) pousser(bc, 'note', 1);
    } else if (niveau === 1) {
      // Une note : le classement sans pourcentage (débutant), le bilan (expert).
      if (!exp) pousser('Classé par Claude (IA), sans pourcentage', 'note', 1);
      else if (bc) pousser(bc, 'note', 1);
    }
    for (const l of L) if (l.toujours) pousser(l.t, 'note', 2);
    return out;
  };
  const hMax = (bas - top) / 2 - 8;
  const formes = [];
  const essais = F ? [[2, 0, false, 0], [1, 0, true, 0], [1, 1, true, 0], [1, 0, true, 2], [1, 0, true, 1], ['serre', 2], ['serre', 1], ['serre', 0], ['serre', -1]] : [[0, 0, false, 0]];
  for (const [maxL, gardeMin, court, compact] of essais) {
    const m = maxL === 'serre' ? Object.assign(mesurer(serrer(gardeMin)), { serre: true }) : mesurer(mettre(maxL, gardeMin, court, compact));
    if (m.h <= hMax && !formes.some(f => f.h === m.h && f.w === m.w)) formes.push(m);
  }
  // La place : en haut à droite, puis en descendant (jamais sous la moitié du tracé ; une seule
  // ligne, jamais sous son tiers), puis plus à gauche ; d'abord sans couvrir de bougie, puis sans
  // couvrir les plus récentes — jamais par-dessus elles.
  const nRec = Math.max(3, Math.ceil(g.n * 0.25));
  const couvre = (r, i0) => {
    const a = Math.max(g.vs + i0, g.vs + Math.floor((r.x - g.pad.left) / g.gap)), b = Math.min(g.ve - 1, g.vs + Math.floor((r.x + r.w - g.pad.left) / g.gap));
    for (let i = a; i <= b; i++) { const c = candles[i]; if (S.yDe(c.high) <= r.y + r.h && S.yDe(c.low) >= r.y) return true; }
    return false;
  };
  const gene = [r => couvre(r, 0), r => couvre(r, Math.max(0, g.n - nRec))];
  // « En haut à droite » : le bord droit de l'encadré contre la marge de futur (ou le bord du
  // tracé), à 12 % de la largeur près ; jamais au milieu du tracé tant qu'une forme y tient.
  const bordD = (S.marge > 24 ? S.xFin : S.xMax) - (S.xMax - g.pad.left) * 0.12;
  const chercher = (w, h, yMax, ev, aDroite) => {
    const xs = [S.xMax - w - 4];
    if (S.marge > 24 && S.xFin - w - 4 < xs[0]) xs.push(S.xFin - w - 4);
    for (let x = Math.min(...xs) - 32; x > g.pad.left + 4; x -= 32) xs.push(x);
    xs.push(g.pad.left + 4);
    for (const x of xs) {
      if (x < g.pad.left + 2 || (aDroite && x + w < bordD)) continue;
      // Sous la ligne de la vue et sa pastille de variation (en haut à gauche du graphique).
      for (let y = x < 320 ? Math.max(top + 4, 38) : top + 4; y + h <= yMax; y += 4) {
        const r = { x, y, w, h };
        if (guideLibre(S.rects, r) && !(ev && ev(r)) && !S.obstSegs.some(sg => scenSegDans(sg, r, 2))) return r;
      }
    }
    return null;
  };
  // Sans couvrir aucune bougie : dans la moitié haute ; par-dessus des bougies anciennes : dans le
  // tiers haut seulement (jamais au milieu du tracé).
  const yMoitie = top + Math.max(0, (bas - top) / 2), yTiers = top + (bas - top) / 3;
  let pose = null, forme = null;
  for (const aDroite of [true, false]) {
    for (const ev of gene) {
      for (const f of formes) if ((pose = chercher(f.w, f.h, ev === gene[0] ? yMoitie : yTiers + 8, ev, aDroite))) { forme = f; break; }
      if (pose) break;
    }
    if (pose) break;
  }
  let replie = false;
  if (!pose) {
    // Sans place : une ligne qui nomme le rang 1 (ses niveaux tant qu'il est ouvert, son état
    // sinon) et renvoie à l'explication ; au doigt, « toucher » est écrit (jamais un ▸ seul).
    replie = !!F;
    ctx.font = police(F ? 'titre' : 'seule');
    const suite = tactile ? ' · toucher ▸' : ' · détail au survol';
    const un = S.items.find(i => i.sc.rang === '1');
    // Fermé : son état, marqué « (en direct) » s'il n'est pas la note du journal, de la forme la
    // plus complète à la plus courte (« Scénario 1 : invalidé (en direct) · toucher ▸ »).
    const r1s = !un ? [] : un.ouvert ? [Scenarios.niveaux(un.sc, exp)] : [un.et.courtD, un.et.miniD, un.et.microD];
    const tient = x => ctx.measureText(x).width <= wMax - 14;
    const attente = previsions && previsions.etat === 'attente';
    const variantes = !F ? [L[0].t].concat(attente ? ['Scénarios du matin : en attente' + suite] : [])
      : (Scenarios.estAncien(F, S.maintenant) ? [titreBoite + suite] : []).concat(...r1s.map(r1 => [titreBoite + ' · 1. ' + r1 + suite, 'Scénario 1 : ' + r1 + suite, titreBoite + ' · 1. ' + r1 + (tactile ? suite : ' ▸')]))
        .concat([titreBoite + suite, 'Scénarios' + (tactile ? suite : ' ▸')]);
    const f1 = F ? 'titre' : 'seule';
    const essaisL = [];
    for (const v of variantes) {
      if (!F && v === L[0].t) { const ls = guideLignes(ctx, v, wMax - 14, 2); essaisL.push(ls.map(t => ({ t, f: f1, h: hL(f1) }))); continue; }
      if (tient(v)) essaisL.push([{ t: v, f: f1, h: hL(f1) }]);
    }
    if (!essaisL.length) essaisL.push([{ t: guideCouper(ctx, variantes[variantes.length - 1], wMax - 14) || 'Scénarios', f: f1, h: hL(f1) }]);
    // Sans couvrir de bougie, puis sans couvrir les récentes, puis (une ligne) par-dessus des
    // bougies plus anciennes — jamais sur une étiquette.
    // La forme la plus riche d'abord (celle qui nomme le rang 1 et son état) : à droite puis
    // ailleurs, sans couvrir de bougie puis sans couvrir les récentes ; enfin par-dessus des
    // bougies plus anciennes.
    for (const evs of [gene, [null]]) {
      for (const ls of essaisL) {
        const f = mesurer(ls);
        for (const aDroite of [true, false]) {
          for (const ev of evs) if ((pose = chercher(f.w, f.h, top + (bas - top) / 3 + f.h, ev, aDroite))) break;
          if (pose) break;
        }
        if (pose) { forme = f; break; }
      }
      if (pose) break;
    }
    if (!pose) {
      // Toujours dit : épinglée en haut à droite (dans le tiers haut), par-dessus une étiquette du
      // Guide s'il le faut — jamais sur le libellé du rang 1.
      // La plus courte d'abord (elle couvre le moins) — sauf si le rang 1 n'a pas de libellé sur le
      // graphique : alors la forme qui le nomme avec son état passe d'abord.
      for (const ls of F && S.unPose ? essaisL.slice().reverse() : essaisL) {
        const f = mesurer(ls), x = S.xMax - f.w - 4;
        for (let y = x < 320 ? Math.max(top + 4, 38) : top + 4; !pose && y + f.h <= top + (bas - top) / 3 + f.h; y += 4) if (guideLibre(S.propres, { x, y, w: f.w, h: f.h })) { pose = { x, y, w: f.w, h: f.h }; forme = f; }
        if (pose) break;
      }
      if (!pose) { forme = mesurer(essaisL[essaisL.length - 1]); pose = { x: S.xMax - forme.w - 4, y: S.xMax - forme.w - 4 < 320 ? Math.max(top + 4, 38) : top + 4, w: forme.w, h: forme.h }; }
    }
  }
  const { lignes, w, h } = forme, x = pose.x, y = pose.y;
  S.rects.push({ x, y, w, h });
  const serre = !!forme.serre;
  S.boite = { x, y, w, h, lignes, seule: !F, replie, serre, police, coul: S.items.map(i => i.coul) };
  // Le survol : chaque ligne d'un scénario l'explique ; le titre explique l'encadré.
  let yy = y + 4;
  const parIt = new Map();
  for (const l of lignes) {
    const r = { x0: x, y0: yy, x1: x + w, y1: yy + l.h };
    if (l.it) { if (!parIt.has(l.it)) parIt.set(l.it, []); parIt.get(l.it).push(r); }
    yy += l.h;
  }
  for (const [it, rs] of parIt) scenCible(S, it, rs, [], [], 0);
  const resteRect = { x0: x, y0: y, x1: x + w, y1: y + h };
  // Replié : l'explication commence par ce que l'encadré aurait montré (le bilan y est déjà dit,
  // suivi de ce qu'il compte).
  const plein = L.filter(l => l.f === 'ligne' || l.f === 'jour' || l.toujours || (!l.compact && l.garde >= 1)).map(l => l.t);
  const texte = replie || serre ? plein.concat(scenTexteBoite(S, true)) : scenTexteBoite(S);
  // Écran court (téléphone) : la bulle garde les lignes, le bilan et ce qui est en direct ou
  // officiel, et renvoie à la fiche pour le reste (guideSurvol la prend si l'autre ne tient pas).
  const texteCourt = F ? scenTexteBoite(S, true, true) : null;
  S.cibles.push({ rects: [resteRect], prio: replie || serre ? 0 : 1, coul: COLORS.accent, titre: titreBoite, texte, texteCourt });
}
/** L'explication de l'encadré (survol du titre ou des notes). sansBilan : la ligne du bilan est
 *  déjà dite (encadré replié) ; seule sa règle suit. court : la version des écrans courts — ce qui
 *  est en direct ou officiel, un renvoi à la fiche, et « pas une recommandation ». */
function scenTexteBoite(S, sansBilan, court) {
  const F = S.F, P = PARAM.scenarios, exp = S.exp, out = [];
  if (court && F) {
    // Les lignes courtes des scénarios (niveaux, invalidation, état), le bilan, ce qui est en direct.
    const large = S.items.some(i => i.et.cle === 'large');
    const b = Scenarios.texteBilan(F.bilan, P, S.mode);
    // Expert : la journée aussi (plus petit écart, « seul », « hors », distances, temps restant).
    const J = exp ? S.jour : null, PJ = J ? Scenarios.phraseJourExpert(J, PARAM.scenarios.jour) : [], RE = J ? Scenarios.ligneResteExpert(J) : [];
    return [exp ? 'États : suivi en direct sur les bougies ' + S.itv + ' (un affichage) ; note officielle : le journal, le lendemain.' : 'Les états sont un suivi EN DIRECT sur les bougies ' + S.itv + ' (un affichage) ; la note officielle est celle du journal, le lendemain.']
      .concat(PJ.length ? [PJ[Math.min(1, PJ.length - 1)] + '.'] : [])
      .concat(S.items.map(it => Scenarios.ligne(it.sc, large && it.et.cle === 'large' ? null : it.et, S.mode, true) + (J && it.j ? Scenarios.suffixeExpert(it.j, J) : '')))
      .concat(RE.length ? [RE[Math.min(1, RE.length - 1)] + '.'] : [])
      .concat(large ? [Scenarios.noteLarge(S.itv, 'debutant')] : [])
      .concat(b ? [b + '.'] : [])
      .concat(exp ? [] : ['Classé par Claude (une IA), du plus au moins probable, sans pourcentage.'])
      .concat(['Plus : fiche « Scénarios du matin » dans les Légendes (bouton ?).', exp ? 'Description, pas une recommandation.' : 'Une description, pas une recommandation : rien ici ne dit quoi faire.']);
  }
  const attente = !F && previsions && previsions.etat === 'attente';
  if (attente && previsions.note) out.push(previsions.note);
  out.push('Chaque matin vers ' + P.point + ' (Paris), Claude (une IA) écrit trois scénarios pour les prochaines 24 h environ, à partir de son analyse du marché, et les classe du plus au moins probable selon son jugement, sans pourcentage. Chaque niveau a une origine nommée et se lit comme une zone : le niveau plus ou moins la marge.');
  if (F) out.push('Les états de cet encadré sont un suivi EN DIRECT sur les bougies ' + S.itv + ' du graphique (un affichage). La note officielle est celle du journal, faite mécaniquement le lendemain sur des bougies d’une minute.');
  // Pendant la journée : aucune nouvelle prévision ; la règle de l'écart, en entier (Expert).
  if (F && exp && S.jour) out.push(...Scenarios.regleJourExpert(PARAM.scenarios.jour));
  if (F && F.bilan && F.bilan.matins > 0) {
    // La règle du fichier, si elle est écrite, nomme déjà le chemin compté : la suite seule, sans redite.
    if (!sansBilan) out.push(Scenarios.texteBilan(F.bilan, P, 'debutant') + (F.bilan.regle ? ' (règle du journal : ' + F.bilan.regle + ').' : '.'));
    out.push(F.bilan.regle && !sansBilan ? Scenarios.REGLE_BILAN_SUITE : Scenarios.REGLE_BILAN);
  } else if (F && F.bilan) out.push('Pas encore de matin compté dans la mesure de l’ordre du premier mouvement.');
  else if (F) out.push('Ce fichier ne donne pas la mesure de l’ordre du premier mouvement : aucun chiffre de réussite n’est montré.');
  if (F && F.precedents.length) {
    const st = F.statuts || Scenarios.STATUTS;
    const p = F.precedents.slice(0, 3).map(m => Scenarios.jourGroupe(m.groupe) + ' — ' + m.scenarios.slice(0, 3).map(x => {
      const mo = Scenarios.motsStatut(x.statut, x.premier_ok, null, st, exp);
      return (x.rang === 'S' ? 'sem.' : x.rang + '.') + ' ' + (x.enonce || '') + ' : ' + (x.premier_ok === 'bas' || x.premier_ok === 'haut' ? mo.long : mo.court);
    }).join(' ; '));
    out.push('Matins précédents (note du journal) : ' + p.join(' | ') + '.');
  }
  const src = F || (attente ? previsions : null);
  const jourH = t => Scenarios.jourGroupe(new Date(t).toISOString().slice(0, 10)) + ' à ' + Scenarios.heureUTC(t) + ' UTC';
  if (src) out.push((isNum(src.updated) ? 'Fichier publié le ' + jourH(src.updated) + ', relu' : 'Fichier relu') + ' à ' + Scenarios.heureUTC(src.luA) + ' UTC'
    + (previsionsEchec ? ' ; dernière relecture impossible (' + scenRaison(previsionsEchec.raison) + ', ' + Scenarios.heureUTC(previsionsEchec.a) + ' UTC)' : '') + '.');
  else if (previsionsEchec) out.push('Dernière lecture : ' + scenRaison(previsionsEchec.raison) + ' à ' + Scenarios.heureUTC(previsionsEchec.a) + ' UTC. Rien n’est dessiné tant qu’aucun fichier lisible n’est arrivé.');
  out.push(exp ? 'Description, pas une recommandation.' : 'Une description, pas une recommandation : rien ici ne dit quoi faire.');
  return out;
}
/** Calque : l'encadré (déjà mis en page). Ne recalcule rien. */
function scenCalque() {
  const S = scenEtat, B = S && S.boite;
  if (S) S.survol = null;            // posé par guideSurvol, s'il y a un curseur
  if (!B || !overlays.scenarios) return;
  if (B.deb) { if (!B.cede) scenLigneDessiner(B); return; }
  cx.save();
  cx.globalAlpha = B.seule ? 0.85 : 0.95; cx.fillStyle = COLORS.bulle;
  cx.beginPath(); cx.roundRect(B.x, B.y, B.w, B.h, 5); cx.fill(); cx.globalAlpha = 1;
  if (!B.seule) { cx.strokeStyle = avecAlpha(COLORS.accent, 0.5); cx.lineWidth = 1; cx.stroke(); }
  let y = B.y + 4, prec = null;
  for (const l of B.lignes) {
    cx.font = B.police(l.f);
    if (l.it && l.it !== prec) { cx.fillStyle = l.it.coul; cx.fillRect(B.x + 5, y + 2.5, 3, l.h - 4); }
    if (l.it) prec = l.it;
    cx.fillStyle = l.f === 'note' || l.f === 'seule' ? COLORS.text : COLORS.ink1;
    cx.fillText(l.t, B.x + (B.seule || B.replie ? 6 : 12), y + l.h - 3.5);
    y += l.h;
  }
  cx.restore();
}

// ─── Scénarios du matin, mode Débutant ─────────────────────────────────────
// Sur le tracé : le libellé du scénario 1 (ouvert) près de sa zone, et UNE ligne d'état en haut à
// droite (« Scénario 1 de Claude : en cours (en direct) ▸ ») ; tout le reste est dans la bulle,
// en mots simples, heures de Paris.
/** Le texte de la ligne des scénarios pour un tracé de largeur pw, ou null (couche masquée, autre
 *  paire). Lu par debHaut AVANT la mise en page (la rangée du haut en dépend). */
function scenLigneDebutant(pw) {
  if (!overlays.scenarios || activeSymbol !== 'BTCUSDT' || typeof Scenarios === 'undefined' || !(previsions || previsionsEchec)) return null;
  const P = PARAM.guide.debutant, max = pw < P.etroit ? P.boiteEtroit : P.boite;
  const L = scenDessinables(), now = Horloges.maintenant();
  const F = L ? previsions : previsions && previsions.etat === 'attente' ? previsions : null;
  const J = L ? scenJour() : null;
  const items = J ? J.tous : L ? L.map(sc => ({ sc, sv: scenSuivi(sc) })) : [];
  ctx.font = chartFont(DEB_POLICE_LIGNE, 650);
  const mesure = t => ctx.measureText(t).width + 16, maxPx = pw - 8;
  // Pendant la journée : la ligne suit ce que la page recalcule (un fait d'abord, puis le scénario
  // au plus petit écart) ; les autres cas restent ceux de ligneBoiteDebutant.
  let t = Scenarios.ligneJourDebutant(F, J, items, now, max, PARAM.scenarios, mesure, maxPx);
  // Une note d'attente trop longue : coupée (caractères, puis pixels), jamais sur deux lignes.
  if (t.length > max) t = t.slice(0, max - 1).trimEnd() + '…';
  if (mesure(t) > maxPx) t = guideCouper(ctx, t, maxPx - 16);
  return t;
}
/** Le titre de la bulle d'un scénario : « Scénario 1 de Claude ». */
function scenTitreDebutant(sc) {
  return sc.rang === 'S' ? 'Scénario de la semaine de Claude' : 'Scénario ' + sc.rang + ' de Claude';
}
/** La bulle d'un scénario (son libellé, sa zone, sa flèche) : qui l'a écrit et quand, ce qu'il dit
 *  en mots, son suivi en direct, puis les autres scénarios du matin ; court : la version des
 *  écrans courts. */
function scenTexteDebutant(S, it, court) {
  const P = PARAM.scenarios, F = S.F;
  const ex = Scenarios.explicationDebutant(it.sc, it.sv, P, { itv: S.itv, statuts: F.statuts, maintenant: S.maintenant });
  // La journée : après « Suivi en direct sur ce graphique : … », où en est le prix (distances) et,
  // s'il a le plus petit écart, une règle de calcul (jamais une prévision).
  if (it.j && S.jour) {
    const d = Scenarios.distancesDebutant(it.j), k = ex.findIndex(t => /^Suivi en direct/.test(t)), add = d ? ['Maintenant : ' + d + '.'] : [];
    // Le nom (la ligne qui le dit peut avoir cédé sa place à une figure du Guide) : « il suit le
    // mieux le prix », « le prix est le plus près du scénario N », ou le nom gardé dit tel quel.
    // Écran court : la phrase courte du nom (elle reste : la ligne qui le dit peut avoir cédé sa
    // place à une figure du Guide).
    const nomP = Scenarios.phraseNomDebutant(S.jour, it.j, !!court);
    if (nomP) add.push(nomP);
    ex.splice(k < 0 ? ex.length : k + 1, 0, ...add);
  }
  const out = [Scenarios.enteteDebutant(F, P, S.maintenant)].concat(court ? ex.slice(0, 1).concat(ex.filter(t => /^Suivi en direct|^Maintenant :|^Pour l’instant|^Nommé |^Rang /.test(t))) : ex);
  const autres = S.items.filter(i => i !== it);
  // Écran court : les autres en peu de mots (« 2. vers 80 806 $ — en cours (en direct) »).
  // Un scénario fermé (ou réalisé) ici dit sa raison (la zone touchée, « par un passage bref du
  // prix » pour un contact en mèche) : jamais « réalisé ✓ » seul.
  // Écran court : sans la raison (la place manque), mais « par un passage bref du prix » reste.
  if (autres.length) out.push('Les autres scénarios de Claude : ' + autres.map(i => (court ? Scenarios.ligneCourteDebutant(i.sc, i.sv, S.maintenant, true)
    : i.j && S.jour && !i.j.ouvert ? Scenarios.ligneDebutantJour(i.j, S.jour).replace(/\.$/, '') : Scenarios.ligneDebutant(i.sc, i.sv, S.maintenant))).join(' · '));
  // Le classement « sans pourcentage » est dit une fois (le sens du rang, dans l'explication).
  out.push('Une hypothèse de Claude (une IA), pas une promesse ni un conseil.');
  return out;
}
/** Le libellé du scénario 1, près du trait de son premier niveau (le haut d'un range), à gauche
 *  de la marge de futur ; un niveau hors de la vue est nommé au bord, avec sa flèche. */
function scenLibelleDebutant(S, it, top, bas) {
  const { g, yDe, xFin, xMax } = S, sc = it.sc, H = 17, P = PARAM.guide.debutant;
  if (S.xDeT(sc.fin) < g.pad.left) return false;
  ctx.font = chartFont(10, 600);
  const m = t => ctx.measureText(t).width + 14;
  // Un range se nomme dans sa boîte (son bord haut, ou le haut du tracé si ce bord est au-dessus
  // de la vue) ; une flèche seulement quand la boîte entière est hors de la vue.
  const range = sc.forme === 'range';
  // Le niveau nommé : la prochaine cible non touchée (la dernière, une fois réalisé) ; un scénario
  // fermé (en fondu), son invalidation.
  const kN = it.j && it.j.pos && it.j.pos.forme === 'chemin' ? it.j.pos.k : it.j && Scenarios.estRealise(it.j) && !range ? sc.cibles.length - 1 : 0;
  const nivN = range ? null : it.j && it.j.ferme && !it.ouvert && sc.invalidation !== null && it.j.ferme.type !== 'realise' ? sc.invalidation : sc.cibles[kN];
  const yH = yDe(range ? sc.range[1] : nivN), yB = range ? yDe(sc.range[0]) : yH;
  const hors = yB < top + 2 ? -1 : yH > bas - 2 ? 1 : 0, y = range ? Math.max(top, yH) : yH;
  const droite = (S.marge > 24 ? xFin : xMax) - 4, x0 = g.pad.left + 6;
  // Un range dont le haut est au-dessus de la vue : sa place est en haut du tracé, et nulle part
  // ailleurs (glissé vers le bas, il tombait entre la ligne du prix et un repère, et se lisait
  // comme un 3e repère).
  // Plus haute ET plus basse que la vue : ses deux bords sont hors de la vue, le libellé va dans
  // les deux rangées du haut, ou à défaut dans les deux du bas (toujours dans la boîte).
  const hautSeul = range && yH < top + 2, couvre = hautSeul && yB > bas - 2;
  const essais = hors < 0 || hautSeul ? [top + 2, top + H + 4] : hors > 0 ? [bas - H - 2, bas - 2 * H - 4] : range ? [y + 2, y - H - 2] : [y - H - 2, y + 2];
  const vers = hors > 0 ? -1 : hors < 0 || hautSeul ? 1 : range ? 1 : -1;
  const placements = [[essais, vers]].concat(couvre ? [[[bas - H - 2, bas - 2 * H - 4], -1]] : []);
  const surBougies = scenSurBougies(S), recentes = scenRecentes(S), bandes = debSurBandes(guideEtat && overlays.guide ? guideEtat : null);
  // Gênes dures : les bougies les plus récentes (le prix d'à présent ne se cache jamais) et les
  // bandes des repères ; gêne douce : les autres bougies. En haut seulement : pas de glissement
  // au-delà des deux rangées du haut.
  const dur = r => recentes(r) || bandes(r);
  // La ligne du prix live (dessinée sur le calque, par-dessus) : le libellé l'évite d'abord, sinon
  // elle le barrerait ; seulement en dernier recours il se pose sur elle.
  const der = candles[candles.length - 1], yP = S.finVue && der ? yDe(isNum(livePrice) ? livePrice : der.close) : null;
  const prixL = r => yP !== null && yP >= top && yP <= bas && r.y < yP + 3 && r.y + r.h > yP - 3;
  const gl = hautSeul ? 0 : null;
  // Les libellés du plus riche au plus court (« Scén. 1 » en dernier) : un libellé qui ne trouve
  // pas sa place laisse essayer le suivant, plus court (360 px, police à chasse fixe).
  const fl = hors < 0 ? '↑' : hors > 0 ? '↓' : null;
  const VJ = it.j ? Scenarios.libellesJourDebutant(it.j, P.scenario, fl, S.maintenant) : Scenarios.libellesDebutant(sc, it.sv, P.scenario, fl);
  const V = VJ.filter(t => m(t) <= droite - x0);
  let pose = null, xp = x0, t = null, w = 0;
  for (const tv of V.length ? V : [VJ[VJ.length - 1]]) {
    const wv = Math.min(m(tv), droite - x0);
    const xBox = Math.max(x0, S.xDeT(sc.emis) + 4);
    // Un range se nomme sur sa boîte : dedans d'abord, sinon collé à son bord droit et au moins à
    // moitié dedans (écran étroit) — jamais au milieu du tracé, au-dessus des bougies d'avant le
    // point (il s'y lisait comme un autre niveau). Sans place, pas de libellé (la ligne le nomme).
    const xs = range ? [droite - wv, xBox, (xBox + droite) / 2 - wv / 2].sort((a, b) => (a >= xBox - 0.5 ? 0 : 1) - (b >= xBox - 0.5 ? 0 : 1)).filter(x => x + wv / 2 >= xBox && x >= x0 - 0.5 && x + wv <= droite + 0.5)
      : [droite - wv, Math.max(x0, (x0 + droite) / 2 - wv / 2), x0];
    for (const [es, ve] of placements) {
      for (const [ev, g0] of [[r => dur(r) || prixL(r) || surBougies(r), 3], [r => dur(r) || prixL(r), 3], [r => dur(r) || prixL(r), 8], [dur, 8]]) {
        for (const x of xs) if ((pose = guidePlacer(S.rects, x, wv, H, es, top, bas, ve, 0, gl === null ? g0 : gl, ev))) { xp = x; break; }
        if (pose) break;
      }
      if (pose) break;
    }
    if (pose) { t = tv; w = wv; break; }
  }
  if (!pose) return false;
  const c = it.coul;
  const dessin = () => { ctx.font = chartFont(10, 600); guidePastilleDebutant(ctx, xp, pose.y, w, H, t, c); };
  etiquettesAFaire.push(dessin);
  S.propres.push({ x: xp, y: pose.y, w, h: H });
  S.libelles.push({ rang: sc.rang, t });
  S.unPose = true;
  S.cibleUn = scenCible(S, it, [guideZone(pose)], [], [], 1);
  S.libelleDeb = { dessin, rect: pose, t };
  debItem('scenario', t, { x: xp, y: pose.y, w, h: H });
  return true;
}
/** La bulle de la ligne des scénarios : chaque scénario en mots, le classement, la mesure de
 *  l'ordre, ce que veut dire « (en direct) ». */
function scenTexteLigneDebutant(S) {
  const F = S.F, P = PARAM.scenarios, out = [];
  const fin = 'Une hypothèse de Claude (une IA), pas une promesse ni un conseil.';
  const chaque = 'Chaque matin vers ' + P.point + ' (heure de Paris), Claude (une IA) écrit trois scénarios pour les prochaines 24 h environ et les classe du plus au moins probable, sans pourcentage.';
  if (!F) {
    const attente = previsions && previsions.etat === 'attente';
    if (attente) out.push(previsions.note || 'En attente du prochain point.');
    else {
      const e = previsionsEchec, h = e ? Guide.heureParis(e.a) : null;
      out.push('Le fichier des scénarios n’a pas pu être lu' + (e ? ' (' + scenRaison(e.raison) + (h ? ', ' + h + ', heure de Paris' : '') + ')' : '') + '. Rien n’est dessiné tant qu’aucun fichier lisible n’est arrivé.');
    }
    out.push(chaque, fin);
    return out;
  }
  out.push(Scenarios.enteteDebutant(F, P, S.maintenant));
  // Pendant la journée (aucune nouvelle prévision) : chaque scénario avec son état et ses distances ;
  // le classement du matin, qui ne change pas ; le temps restant ; puis seulement le scénario au plus
  // petit écart, une règle de calcul.
  const J = S.jour;
  for (const it of S.items) out.push(it.j && J ? Scenarios.ligneDebutantJour(it.j, J) : Scenarios.ligneDebutant(it.sc, it.sv, S.maintenant));
  if (J && J.hors) out.push('Le prix est allé au-delà de tous les niveaux du matin.');
  out.push('Classé par Claude (une IA), du plus au moins probable, sans pourcentage.' + (J ? ' Ce classement ne change pas pendant la journée.' : ''));
  if (J) {
    const r = Scenarios.texteResteDebutant(J, S.maintenant), m = Scenarios.phraseMeneurDebutant(J);
    if (r) out.push(r);
    if (m) out.push(m);
    if (J.cas === 'meneur' || J.cas === 'aucunNeColle') out.push(Scenarios.COMMENT_DEBUTANT);
  }
  const b = F.bilan;
  if (b && b.matins > 0) out.push((b.matins > 1 ? 'Sur les ' + b.matins + ' derniers matins comptés' : 'Sur le dernier matin compté') + ', le premier mouvement annoncé par Claude est arrivé en premier ' + b.reussis + ' fois.' + (b.matins < P.echantillonFaible ? ' Trop peu de matins pour en tirer une règle.' : ''));
  out.push('« (en direct) » : l’état est suivi par cette page sur le graphique affiché, un simple affichage. La note officielle est celle du journal, faite le lendemain ; elle est marquée « (journal) ».');
  out.push('Plus : fiche « Scénarios du matin » dans les Légendes (bouton ?).');
  out.push(fin);
  return out;
}
/** La ligne des scénarios, en haut à droite du tracé : sur la rangée de la phrase si elles y
 *  tiennent toutes deux (debHaut), sinon sur la 2e rangée. Dessinée sur le calque. */
function scenBoiteDebutant(S) {
  const memo = debHautMemo, g = S.g;
  if (!memo || !memo.ligne) return;
  const t = memo.ligne, h = 20, w = Math.min(memo.wLigne, S.xMax - g.pad.left - 4);
  const x = Math.max(g.pad.left + 2, S.xMax - w - 2), y = memo.partage || !memo.phrase ? 8 : 30;
  const texte = scenTexteLigneDebutant(S);
  const titre = S.F ? Scenarios.titre(S.F, PARAM.scenarios, S.maintenant) : 'Scénarios du matin';
  const cible = { rects: [{ x0: x, y0: y, x1: x + w, y1: y + h }], prio: 0, coul: COLORS.accent, titre, texte,
    // Écran court : le bilan et le renvoi partent ; « (en direct) » et le journal restent, en une phrase.
    texteCourt: scenTexteCourtLigne(S, texte, true) };
  S.cibles.push(cible);
  // M8 : pendant le fondu d'une fermeture, « aucun ne tient plus » et une note du journal sur le
  // rang 1, c'est la LIGNE qui porte l'indication : à l'arbitrage du budget, le libellé cède. De
  // même quand la ligne dit un fait FRAIS (réalisation ou fermeture d'un rang 1 à 3, depuis moins de
  // PARAM.scenarios.jour.fonduMinutes après son créneau) : elle est le seul endroit qui le dit.
  const J = S.jour, un = S.items.find(i => i.sc.rang === '1');
  const fait = !!(J && J.frais && J.frais.length && /✓|✗|indécis/.test(t));
  const prioritaire = !!(J && un && (J.cas === 'aucun' || (un.sc.statut !== '⏳' && un.sc.statut !== '✅') || (un.fondu > 0 && !un.ouvert) || fait));
  S.boite = { deb: true, x, y, w, h, texte: t, cible, lignes: [], seule: !S.F, cede: false, prioritaire, coulMontre: S.montre ? S.montre.coul : null };
  debItem('boite', t, { x, y, w, h });
}
/** La bulle courte (écran court) de la ligne : le bilan et le renvoi partent, « (en direct) » et le
 *  journal restent en une phrase ; la règle du « suit le mieux » part (la phrase qui le nomme reste). */
function scenTexteCourtLigne(S, texte) {
  const J = S.jour, F = S.F;
  if (!J || !F) return texte.filter(l => !/^Plus :|^Sur (?:les \d+ derniers|le dernier) matin/.test(l))
    .map(l => (/^« \(en direct\) »/.test(l) ? '« (en direct) » : suivi par cette page ; la note officielle est celle du journal, le lendemain.' : l));
  // Pendant la journée, l'écran court : les lignes courtes (état, distances), le classement, ce qui
  // est en direct ou officiel, le scénario au plus petit écart, le temps restant, l'avertissement.
  const m = Scenarios.phraseNomDebutant(J, null);
  const r = Scenarios.reste(J.reste);
  return [Scenarios.enteteDebutant(F, PARAM.scenarios, S.maintenant)]
    .concat(S.items.map(it => (it.j ? Scenarios.ligneDebutantJour(it.j, J, true) : Scenarios.ligneDebutant(it.sc, it.sv, S.maintenant))))
    .concat(['Classé par Claude (une IA), du plus au moins probable, sans pourcentage ; ce classement ne change pas.'])
    .concat(m ? [m, 'Pour un chemin, plus le prix est près de sa zone et loin de ce qui l’invaliderait, mieux il suit ; pour « reste entre », plus il est loin des limites.'] : []).concat(r ? ['Encore ' + r + ', sans nouvelle prévision.'] : [])
    // Le suivi « (en direct) » et le journal vont avec l'avertissement, dans le dernier paragraphe :
    // une bulle coupée faute de place (375×667, des fermetures avec leur raison) les garde toujours.
    .concat(['« (en direct) » : suivi par cette page ; la note officielle est celle du journal, le lendemain. ' + texte[texte.length - 1]]);
}
/** M8 (arbitrage du budget Débutant) : quand la ligne porte l'indication d'une fermeture, c'est le
 *  libellé du scénario qui cède (sa zone reste dessinée, sans texte) ; la bulle de la ligne reprend
 *  celle du libellé. → true si le libellé a cédé. */
function scenCederLibelle() {
  const S = scenEtat, B = S && S.boite;
  if (!(B && B.deb && B.prioritaire && S.libelleDeb)) return false;
  const k = etiquettesAFaire.indexOf(S.libelleDeb.dessin);
  if (k >= 0) etiquettesAFaire.splice(k, 1);
  debEtat.items = debEtat.items.filter(i => i.role !== 'scenario');
  // La bulle de la ligne reprend le libellé en bref (sa version courte, sans l'en-tête, les autres
  // scénarios ni l'avertissement, déjà dans la ligne) : la bulle longue tient encore à l'écran.
  if (S.cibleUn) {
    S.cibles = S.cibles.filter(c => c !== S.cibleUn);
    const lc = (S.cibleUn.texteCourt || []).slice(1, -1).filter(l => !/^Les autres scénarios/.test(l));
    if (B.cible && lc.length) B.cible.texte = B.cible.texte.slice(0, -1).concat(['Le libellé du scénario (place prise) :'], lc, B.cible.texte.slice(-1));
  }
  S.libelles = S.libelles.filter(l => l.t !== S.libelleDeb.t);
  S.libelleDeb = null; S.libelleCede = true;
  return true;
}
/** Calque : la ligne des scénarios (une pastille, le trait de la couleur du scénario montré). */
function scenLigneDessiner(B) {
  cx.save();
  cx.font = chartFont(DEB_POLICE_LIGNE, 650);
  cx.globalAlpha = 0.94; cx.fillStyle = COLORS.bulle;
  cx.beginPath(); cx.roundRect(B.x, B.y, B.w, B.h, 5); cx.fill(); cx.globalAlpha = 1;
  cx.fillStyle = B.seule ? COLORS.ink3 : B.coulMontre || scenCouleur('1'); cx.fillRect(B.x + 2, B.y + 3, 2.5, B.h - 6);
  cx.fillStyle = B.seule ? COLORS.text : COLORS.ink1;
  cx.fillText(B.texte, B.x + 9, B.y + 14);
  cx.restore();
}
/** Survol ou toucher du scénario 1 (Débutant) : sa zone d'invalidation, hachurée sur le calque —
 *  le seul moment où elle se voit (la bulle dit ce qu'elle est). */
function scenSurvolDebutant(c) {
  const S = scenEtat;
  if (!S || !S.deb || !S.F || !c || !c.scenario) return;
  const it = S.items.find(i => i.sc.id === c.scenario);
  if (!it || it !== S.montre || it.sc.forme !== 'chemin' || !it.sc.zones.inv) return;
  const { g, yDe, xDeT, xMax } = S, sc = it.sc;
  const x0 = Math.max(g.pad.left, xDeT(sc.emis)), x1 = Math.min(xMax, xDeT(sc.fin));
  const y0 = Math.max(g.pad.top, yDe(sc.zones.inv[1])), y1 = Math.min(g.pad.top + g.ph, yDe(sc.zones.inv[0]));
  if (!(x1 > x0 && y1 > y0)) return;
  cx.save();
  cx.beginPath(); cx.rect(x0, y0, x1 - x0, y1 - y0); cx.clip();
  cx.strokeStyle = avecAlpha(it.coul, 0.45); cx.lineWidth = 1;
  const h = y1 - y0;
  cx.beginPath();
  for (let x = x0 - h; x < x1; x += 6) { cx.moveTo(x, y1); cx.lineTo(x + h, y0); }
  cx.stroke();
  cx.restore();
}

// Étiquettes d'overlays posées dans la frame courante (remise à zéro par drawChart) :
// une étiquette qui en chevaucherait une autre est omise — le point du ruban porte la légende.
let etiquettesPosees = [], etiquettesAFaire = [];
function drawLine(data, minP, range, pad, gap, ph, color, dash, width, dataOffset, etiquette) {
  ctx.strokeStyle = color; ctx.lineWidth = width;
  if (dash.length > 0) ctx.setLineDash(dash);
  ctx.beginPath();
  let started = false, lastX = null, lastY = null;
  const xMax = canvas.width / window.devicePixelRatio - pad.right;
  for (let i = 0; i < data.length; i++) {
    if (data[i] === null) continue;
    const idx = i - (dataOffset || 0);
    if (idx < 0) continue;
    const x = pad.left + gap * idx + gap / 2;
    if (x < pad.left || x > pad.left + gap * 500) continue; // safety
    const y = pad.top + ph * (1 - (data[i] - minP) / range);
    if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    if (x <= xMax) { lastX = x; lastY = y; }
  }
  ctx.stroke();
  ctx.setLineDash([]);
  // Étiquette en bout de tracé : l'identité de la ligne ne repose jamais sur la couleur seule.
  if (etiquette && lastX !== null && lastY > pad.top + 8 && lastY < pad.top + ph - 8) {
    ctx.font = chartFont(9, 650);
    const w = ctx.measureText(etiquette).width + 16;
    const ex = Math.min(lastX - w - 6, xMax - w - 4), ey = lastY - 8;
    if (!etiquettesPosees.some(y => Math.abs(y - ey) < 17)) {
      etiquettesPosees.push(ey);
      // Différée : posée APRÈS les bougies (les overlays sont tracés avant elles, et la
      // dernière bougie recouvrait l'étiquette).
      etiquettesAFaire.push(() => {
        ctx.font = chartFont(9, 650);
        ctx.fillStyle = COLORS.bulle;
        ctx.beginPath(); ctx.roundRect(ex, ey, w, 16, 8); ctx.fill();
        ctx.fillStyle = color; ctx.beginPath(); ctx.arc(ex + 7, ey + 8, 3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = COLORS.ink1; ctx.fillText(etiquette, ex + 12, ey + 11.5);
      });
    }
  }
}

// Titre + badge sous-graphe
function subTitle(key) {
  const map = { vol:'VOLUME', rsi: ETIQ.rsi().toUpperCase(), macd: ETIQ.macd(), stoch: 'STOCH (' + PARAM.stoch.k + ',' + PARAM.stoch.d + ')',
                atr: ETIQ.atr(), obv:'OBV', mfi: 'MFI (' + PARAM.mfi.periode + ')', williamsR: '%R (' + PARAM.williamsR.periode + ')',
                cci: ETIQ.cci(), adx: 'ADX (' + PARAM.adx.periode + ')', ao: 'AO (' + PARAM.ao.rapide + ',' + PARAM.ao.lente + ')', equity:'GRID EQUITY' };
  return map[key] || key.toUpperCase();
}

// Grille + labels d'échelle pour sous-graphes (o: {levels, min, max | span, f})
function subGrid(y0, pad, ph, W, o) {
  ctx.strokeStyle = COLORS.grid; ctx.lineWidth = 0.5;
  ctx.setLineDash(COLORS.grilleTirets);
  o.levels.forEach(l => {
    const y = o.span ? y0 + pad.top + ph/2 - (l / o.span) * ph : y0 + pad.top + ph * (1 - (l - (o.min || 0)) / ((o.max || 100) - (o.min || 0)));
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
    ctx.fillStyle = COLORS.axis || COLORS.text; ctx.font = chartFont(10, 650);
    ctx.textAlign = 'right'; ctx.fillText(o.f ? o.f(l) : l, W - 8, y + 3); ctx.textAlign = 'left';
  });
  ctx.setLineDash([]);
}

function resolveSub(candles, y0, subH, W, key) {
  const pad = { left: 16, right: 75, top: 18, bottom: 12 };
  const pw = W - pad.left - pad.right;
  const ph = subH - pad.top - pad.bottom;
  if (ph < 20) return false;   // non tracé (canvas trop bas : voir dispositionGraphique)
  
  // Séparateur supérieur : un filet, pas un trait
  ctx.strokeStyle = COLORS.hairline; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(pad.left, y0 + 0.5); ctx.lineTo(W - pad.right, y0 + 0.5); ctx.stroke();
  
  // Titre du sous-graphe : point de sa couleur + intitulé à l'encre (le texte ne porte pas la couleur de la donnée)
  ctx.fillStyle = key === 'vol' ? COLORS.candleUp : subColor(key);
  ctx.beginPath(); ctx.arc(pad.left + 9, y0 + 10, 3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = COLORS.ink3; ctx.font = chartFont(9.5, 700);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0.6px';
  ctx.fillText(subTitle(key), pad.left + 17, y0 + 13.5);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  
  // Utiliser le range visible pour les subs aussi (des indices : aucune copie par image)
  const vs = Math.max(0, viewStart);
  const ve = Math.min(candles.length, viewEnd);
  const gap = pasBougie(pw, ve - vs);
  
  if (key === 'vol') {
    let maxV = 0;
    for (let i = vs; i < ve; i++) if (candles[i].volume > maxV) maxV = candles[i].volume;
    maxV = maxV || 1;
    // Grid + échelle
    const fmtV = v => v >= 1e6 ? (v/1e6).toFixed(1)+'M' : v >= 1e3 ? (v/1e3).toFixed(1)+'K' : v.toFixed(0);
    subGrid(y0, pad, ph, W, { levels: [0, maxV/2, maxV], min: 0, max: maxV, f: fmtV });
    // Volume bars
    const barW = Math.max(1, gap * 0.7);
    for (let i = vs; i < ve; i++) {
      const c = candles[i];
      const x = pad.left + gap * (i - vs);
      const h = (c.volume / maxV) * ph;
      const y = y0 + pad.top + ph - h;
      // L'alpha 0x44 (27 %) rendait le volume quasi invisible sur le fond clair :
      // le volume est une DONNÉE, il se lit au même titre que les bougies.
      ctx.fillStyle = c.close >= c.open ? COLORS.candleUp : COLORS.candleDown;
      ctx.globalAlpha = COLORS.volAlpha;
      const rv = Math.min(COLORS.bougieRayon, barW / 4);   // --bougie-rayon : 0 = angles vifs
      if (rv > 0 && barW >= BOUGIE_DENSE_PX && h >= 3) { ctx.beginPath(); ctx.roundRect(x + gap*0.15, y, barW, h, [rv, rv, 0, 0]); ctx.fill(); }
      else ctx.fillRect(x + gap*0.15, y, barW, h);
      ctx.globalAlpha = 1;
    }
  } else if (key === 'rsi') {
    const closes = cols().close;
    const rsi = memoized('sub_rsi', calcRSI, closes, PARAM.rsi.periode);
    // Bande 30-70 teintée : la zone « normale » se lit d'un coup d'œil, les sorties ressortent.
    ctx.save(); ctx.globalAlpha = COLORS.bandeAlpha; ctx.fillStyle = COLORS.rsi;
    ctx.fillRect(pad.left, y0 + pad.top + ph * 0.3, pw, ph * 0.4); ctx.restore();
    subGrid(y0, pad, ph, W, { levels: [30, 50, 70] });
    // RSI line
    ctx.strokeStyle = COLORS.rsi; ctx.lineWidth = 1.5;
    ctx.beginPath(); let started = false;
    for (let i = vs; i < ve; i++) {
      if (i >= rsi.length || rsi[i] === null) continue;
      const x = pad.left + gap * (i - vs) + gap/2;
      const y = y0 + pad.top + ph * (1 - rsi[i] / 100);
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    }
    ctx.stroke();
  } else if (key === 'macd') {
    const closes = cols().close;
    const macd = memoized('sub_macd', calcMACD, closes, PARAM.macd.rapide, PARAM.macd.lente, PARAM.macd.signal);
    // Échelle sur la FENÊTRE VISIBLE : calculée sur les 3 000 bougies, un extrême d'il y a
    // des semaines écrasait la vue courante en une ligne plate (±900 d'échelle pour ±40 de signal).
    const absMax = absMaxFenetre([macd.macdLine, macd.signal, macd.histogram], vs, ve) || 1;
    const scale = (ph / 2) / absMax;
    const midY = y0 + pad.top + ph / 2;
    subGrid(y0, pad, ph, W, { levels: [-absMax, 0, absMax], min: -absMax, max: absMax, f: v => v.toFixed(2) });
    // Histogram
    const barW = Math.max(1, gap * 0.6);
    for (let i = vs; i < ve; i++) {
      if (i >= macd.histogram.length || macd.histogram[i] === null) continue;
      const x = pad.left + gap * (i - vs);
      const h = macd.histogram[i] * scale;
      ctx.fillStyle = avecAlpha(macd.histogram[i] >= 0 ? COLORS.candleUp : COLORS.candleDown, 0.55);
      ctx.fillRect(x + gap*0.2, Math.min(midY, midY - h), barW, Math.abs(h));
    }
    // MACD line
    drawLineAt(macd.macdLine, midY, scale, pad, gap, COLORS.macd, [], 1.5, vs);
    drawLineAt(macd.signal, midY, scale, pad, gap, COLORS.macd_signal, [], 1, vs);
  } else if (key === 'stoch') {
    const highs = cols().high, lows = cols().low, closes = cols().close;
    const stoch = memoized('sub_stoch', calcStoch, highs, lows, closes, PARAM.stoch.k, PARAM.stoch.d);
    subGrid(y0, pad, ph, W, { levels: [20, 50, 80] });
    drawLineAt(stoch.k, y0 + pad.top + ph, ph/100, pad, gap, COLORS.stoch_k, [], 1.5, vs);
    drawLineAt(stoch.d, y0 + pad.top + ph, ph/100, pad, gap, COLORS.stoch_d, [3, 3], 1, vs);
  } else if (key === 'atr') {
    const highs = cols().high, lows = cols().low, closes = cols().close;
    const atr = memoized('sub_atr', calcATR, highs, lows, closes, PARAM.atr.periode);
    // Échelle sur TOUT l'historique (comme avant) : calculée une fois par état des données.
    const maxA = memoized('sub_atr_max', a => { let m = -Infinity; for (const v of a) if (v !== null && v > m) m = v; return m; }, atr) || 1;
    const scale = ph / maxA;
    subGrid(y0, pad, ph, W, { levels: [0, maxA/2, maxA], min: 0, max: maxA, f: v => '$' + v.toFixed(1) });
    drawLineAt(atr, y0 + pad.top + ph, scale, pad, gap, COLORS.atr, [], 1.5, vs);
  } else if (key === 'obv') {
    const closes = cols().close, volumes = cols().vol;
    const obv = memoized('sub_obv', calcOBV, closes, volumes);
    const absMax = absMaxFenetre([obv], vs, ve) || 1;
    const scale = (ph / 2) / absMax;
    const midY = y0 + pad.top + ph / 2;
    const fmtOBV = v => v >= 1e6 ? (v/1e6).toFixed(1)+'M' : v >= 1e3 ? (v/1e3).toFixed(1)+'K' : v.toFixed(0);
    subGrid(y0, pad, ph, W, { levels: [-absMax, 0, absMax], min: -absMax, max: absMax, f: fmtOBV });
    drawLineAt(obv, midY, scale, pad, gap, COLORS.obv, [], 1.5, vs);
  } else if (key === 'mfi') {
    const closes = cols().close, highs = cols().high, lows = cols().low, vols = cols().vol;
    const mfi = memoized('sub_mfi', calcMFI, highs, lows, closes, vols, PARAM.mfi.periode);
    drawBandSub(y0, pad, ph, W, gap, mfi, COLORS.mfi, vs, ve, [20, 50, 80]);
  } else if (key === 'williamsR') {
    const closes = cols().close, highs = cols().high, lows = cols().low;
    const wr = memoized('sub_wr', calcWilliamsR, highs, lows, closes, PARAM.williamsR.periode);
    drawBandSub(y0, pad, ph, W, gap, wr, COLORS.williamsR, vs, ve, [-80, -50, -20], -100, 0);
  } else if (key === 'cci') {
    const closes = cols().close, highs = cols().high, lows = cols().low;
    const cci = memoized('sub_cci', calcCCI, highs, lows, closes, PARAM.cci.periode);
    subGrid(y0, pad, ph, W, { levels: [100, 0, -100], span: 200 });
    drawLineAt(cci, y0 + pad.top + ph/2, ph/400, pad, gap, COLORS.cci, [], 1.5, vs);
  } else if (key === 'adx') {
    const closes = cols().close, highs = cols().high, lows = cols().low;
    const adxData = memoized('sub_adx', calcADX, highs, lows, closes, PARAM.adx.periode);
    subGrid(y0, pad, ph, W, { levels: [25, 50] });
    drawLineAt(adxData.adx, y0 + pad.top + ph, ph/100, pad, gap, COLORS.adx, [], 1.5, vs);
    drawLineAt(adxData.plusDI, y0 + pad.top + ph, ph/100, pad, gap, COLORS.adx_plusDI, [3, 3], 1, vs);
    drawLineAt(adxData.minusDI, y0 + pad.top + ph, ph/100, pad, gap, COLORS.adx_minusDI, [3, 3], 1, vs);
  } else if (key === 'ao') {
    const highs = cols().high, lows = cols().low;
    const ao = memoized('sub_ao', calcAO, highs, lows, PARAM.ao.rapide, PARAM.ao.lente);
    // Échelle sur TOUT l'historique (comme avant) : calculée une fois par état des données.
    const absMax = memoized('sub_ao_max', a => absMaxFenetre([a], 0, a.length), ao) || 1;
    const scale = (ph / 2) / absMax;
    const midY = y0 + pad.top + ph / 2;
    subGrid(y0, pad, ph, W, { levels: [-absMax, 0, absMax], min: -absMax, max: absMax, f: v => v.toFixed(2) });
    const barW = Math.max(1, gap * 0.6);
    for (let i = vs; i < ve; i++) {
      if (ao[i] === null) continue;
      const x = pad.left + gap * (i - vs);
      const h = ao[i] * scale;
      ctx.fillStyle = avecAlpha(ao[i] >= 0 ? COLORS.candleUp : COLORS.candleDown, 0.55);
      ctx.fillRect(x + gap*0.2, Math.min(midY, midY - h), barW, Math.abs(h));
    }
  } else if (key === 'equity') {
    // Equity curve sub-chart — shows total equity (gold) + realized PnL (green)
    if (!btResult || !btResult.equityCurve || btResult.equityCurve.length < 2) {
      ctx.fillStyle = COLORS.text; ctx.font = chartFont(10);
      ctx.fillText('Pas de backtest — lancez un backtest', pad.left + 10, y0 + pad.top + ph/2);
      return;
    }
    const eq = btResult.equityCurve;
    const startCap = btResult.capital;
    const allTotals = eq.map(e => e.total);
    const minEq = Math.min(...allTotals);
    const maxEq = Math.max(...allTotals);
    const rangeEq = maxEq - minEq || 1;

    // Grid + échelle $
    const eqFmt = v => '$' + v.toLocaleString('en-US', {maximumFractionDigits: 0});
    subGrid(y0, pad, ph, W, { levels: [minEq, minEq + rangeEq / 2, maxEq], min: minEq, max: maxEq, f: eqFmt });
    // Capital baseline
    const capY = y0 + pad.top + ph * (1 - (startCap - minEq) / rangeEq);
    ctx.strokeStyle = avecAlpha(COLORS.ink3, 0.5); ctx.lineWidth = 0.5;
    ctx.setLineDash([3, 6]);
    ctx.beginPath(); ctx.moveTo(pad.left, capY); ctx.lineTo(W - pad.right, capY); ctx.stroke();
    ctx.setLineDash([]);

    // Draw equity curve — total (gold)
    ctx.strokeStyle = COLORS.equity_total; ctx.lineWidth = 1.8;
    ctx.beginPath(); let started = false;
    let firstEqIdx = eq[0].idx, lastEqIdx = eq[eq.length - 1].idx;
    for (let j = 0; j < eq.length; j++) {
      const e = eq[j];
      if (e.idx < vs || e.idx > ve) continue;
      const x = pad.left + gap * (e.idx - vs) + gap/2;
      const y = y0 + pad.top + ph * (1 - (e.total - minEq) / rangeEq);
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Draw realized PnL (green)
    ctx.strokeStyle = COLORS.equity_realized; ctx.lineWidth = 1.2;
    ctx.beginPath(); started = false;
    for (let j = 0; j < eq.length; j++) {
      const e = eq[j];
      if (e.idx < vs || e.idx > ve) continue;
      const x = pad.left + gap * (e.idx - vs) + gap/2;
      const realizedTotal = startCap + e.realized;
      const y = y0 + pad.top + ph * (1 - (realizedTotal - minEq) / rangeEq);
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Labels
    const retPct = ((allTotals[allTotals.length-1] - startCap) / startCap * 100);
    const retStr = (retPct >= 0 ? '+' : '') + retPct.toFixed(2) + '%';
    ctx.fillStyle = retPct >= 0 ? COLORS.upInk : COLORS.downInk;
    ctx.font = chartFont(10, 650);
    ctx.fillText(retStr, pad.left + 4, y0 + pad.top + 12);

    // Legend
    ctx.fillStyle = COLORS.equity_total; ctx.font = chartFont(9);
    ctx.fillText('─ Equity', pad.left + 65, y0 + pad.top + 12);
    ctx.fillStyle = COLORS.equity_realized;
    ctx.fillText('─ Realized', pad.left + 125, y0 + pad.top + 12);
  }
}

// Plus grande valeur absolue des séries sur [vs, ve), null ignorés — en une boucle : l'échelle
// des sous-graphes se prenait par slice + filter + spread, à chaque image.
function absMaxFenetre(series, vs, ve) {
  let m = 0;
  for (const a of series) for (let i = vs; i < ve && i < a.length; i++) { const v = a[i]; if (v !== null && Math.abs(v) > m) m = Math.abs(v); }
  return m;
}
function drawLineAt(data, baseY, scale, pad, gap, color, dash, width, dataOffset) {
  ctx.strokeStyle = color; ctx.lineWidth = width;
  if (dash.length > 0) ctx.setLineDash(dash);
  ctx.beginPath(); let started = false;
  for (let i = 0; i < data.length; i++) {
    if (data[i] === null) continue;
    const idx = i - (dataOffset || 0);
    if (idx < 0) continue;
    const x = pad.left + gap * idx + gap / 2;
    const y = baseY - data[i] * scale;
    if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
  }
  ctx.stroke(); ctx.setLineDash([]);
}

// Helper pour sous-graphes bandés (MFI, Williams %R, etc.)
function drawBandSub(y0, pad, ph, W, gap, data, color, vs, ve, levels, dataMin, dataMax) {
  const dMin = dataMin !== undefined ? dataMin : 0;
  const dMax = dataMax !== undefined ? dataMax : 100;
  subGrid(y0, pad, ph, W, { levels, min: dMin, max: dMax });
  ctx.strokeStyle = color; ctx.lineWidth = 1.5;
  ctx.beginPath(); let started = false;
  for (let i = vs; i < ve; i++) {
    if (i >= data.length || data[i] === null) continue;
    const x = pad.left + gap * (i - vs) + gap / 2;
    const y = y0 + pad.top + ph * (1 - (data[i] - dMin) / (dMax - dMin));
    if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

// ============ SAMSARA ============

// Helpers pour le crosshair des sous-graphes
function subLabel(key) {
  const map = { vol:'Vol', rsi:'RSI', macd:'MACD', stoch:'%K', atr:'ATR', obv:'OBV', mfi:'MFI', williamsR:'%R', cci:'CCI', adx:'ADX', ao:'AO', equity:'Equity' };
  return map[key] || key;
}
function subColor(key) {
  const map = { vol:COLORS.ink3, rsi:COLORS.rsi, macd:COLORS.macd, stoch:COLORS.stoch_k, atr:COLORS.atr, obv:COLORS.obv, mfi:COLORS.mfi, williamsR:COLORS.williamsR, cci:COLORS.cci, adx:COLORS.adx, ao:COLORS.candleUp, equity:COLORS.equity_total };
  return map[key] || COLORS.ink3;
}
function getSubIndicatorValue(key, idx) {
  const c = candles;
  if (idx < 0 || idx >= c.length) return null;
  const { close: closes, high: highs, low: lows, vol: vols } = cols();
  try {
    switch(key) {
      case 'vol': return c[idx].volume >= 1000 ? (c[idx].volume/1000).toFixed(1)+'K' : c[idx].volume.toFixed(0);
      case 'rsi': { const v = memoized('gsi_rsi', calcRSI, closes, PARAM.rsi.periode); return v[idx] !== null ? v[idx].toFixed(1) : null; }
      case 'macd': { const v = memoized('gsi_macd', calcMACD, closes, PARAM.macd.rapide, PARAM.macd.lente, PARAM.macd.signal); return v.macdLine[idx] !== null ? v.macdLine[idx].toFixed(2) : null; }
      case 'stoch': { const v = memoized('gsi_stoch', calcStoch, highs, lows, closes, PARAM.stoch.k, PARAM.stoch.d); return v.k[idx] !== null ? v.k[idx].toFixed(1) : null; }
      case 'atr': { const v = memoized('gsi_atr', calcATR, highs, lows, closes, PARAM.atr.periode); return v[idx] !== null ? v[idx].toFixed(1) : null; }
      case 'obv': { const v = memoized('gsi_obv', calcOBV, closes, vols); return v[idx] !== null ? (v[idx]/1e6).toFixed(2)+'M' : null; }
      case 'mfi': { const v = memoized('gsi_mfi', calcMFI, highs, lows, closes, vols, PARAM.mfi.periode); return v[idx] !== null ? v[idx].toFixed(1) : null; }
      case 'williamsR': { const v = memoized('gsi_wr', calcWilliamsR, highs, lows, closes, PARAM.williamsR.periode); return v[idx] !== null ? v[idx].toFixed(1) : null; }
      case 'cci': { const v = memoized('gsi_cci', calcCCI, highs, lows, closes, PARAM.cci.periode); return v[idx] !== null ? v[idx].toFixed(1) : null; }
      case 'adx': { const v = memoized('gsi_adx', calcADX, highs, lows, closes, PARAM.adx.periode); return v.adx[idx] !== null ? v.adx[idx].toFixed(1) : null; }
      case 'ao': { const v = memoized('gsi_ao', calcAO, highs, lows, PARAM.ao.rapide, PARAM.ao.lente); return v[idx] !== null ? v[idx].toFixed(2) : null; }
      default: return null;
    }
  } catch(e) { return null; }
}

// ═══════════════ MARCHÉ LIVE (market-data.json) ═══════════════
// Un tour par CADENCES.publication_lue : le fichier n'est relu que s'il est dû (lectureDue), en
// revalidation (`no-cache` : 304 tant qu'il n'a pas changé). Le `?t=` d'avant n'apportait rien
// — le CDN ignore la requête (même copie, même âge, vérifié) — et forçait 8,6 Ko par minute.
// Entre deux publications, seuls les âges affichés avancent (majAges) : ni analyse, ni cartes
// refaites, ni onde du voyant.
let marcheLu = 0;          // dernière relecture réussie (ms)
let marcheEnErreur = false;   // les cartes affichent l'erreur d'une relecture manquée
async function fetchMarket(force) {
  if (!force && !lectureDue(marketData && Date.parse(marketData.updated), marcheLu)) { majAges(false); return; }
  try {
    const resp = Horloges.verifier(await (prechargee(DATA_URL, { cache: 'no-cache' }) || fetch(DATA_URL, { cache: 'no-cache' })));
    const d = await lireSiNouveau(resp, marketData && marketData.updated);
    marcheLu = Date.now();
    Horloges.noter('marche');
    if (d) { marketData = d; chronique.ajouter(d); }
    // Une relecture manquée avait remplacé les cartes par l'erreur : elles reviennent dès la
    // suivante, même si la publication n'a pas changé.
    if (d || marcheEnErreur) { renderFeed(); marcheEnErreur = false; }
    if (d && geo) scheduleCalque();                 // le repère de la publication se déplace
    // Publication NOUVELLE et Guide affiché : ses niveaux du fichier (murs, options) ont changé.
    if (d && geo && overlays.guide && activeSymbol === 'BTCUSDT') scheduleDraw();
    majAges(!!d);
  } catch(e) {
    marcheLu = 0; marcheEnErreur = true;            // à retenter au prochain tour
    Horloges.noter('marche', e);
    document.getElementById('dot').style.background = 'var(--down)';
    const td = document.getElementById('taskbarDot');
    if (td) td.style.background = 'var(--down)';
    const feed = document.getElementById('feed');
    const c = Horloges.classer({ erreur: e });
    feed.innerHTML = '<div class="error">⚠️ market-data.json : ' + escHtml(c.libelle || e.message) + '</div>';
  }
}
// ─── ÂGE DE LA DONNÉE ────────────────────────────────────────────────
// Un HTTP 200 ne prouve RIEN sur la fraîcheur : une source morte reste servie indéfiniment et
// le point restait vert. C'est la panne du 16/08 — un consommateur a lu 13 cycles de données
// gelées sans qu'aucun voyant ne bronche. Seuils de js/cadences.js : au-delà de vieux_min, une
// publication manquée ; de fige_min, deux.
function etatPublication(updated) {
  const ageMin = updated ? (Date.now() - Date.parse(updated)) / 60000 : null;
  const etat = ageMin === null || !isFinite(ageMin) ? 'inconnu'
             : ageMin > CADENCES.fige_min ? 'fige'
             : ageMin > CADENCES.vieux_min ? 'retard' : 'ok';
  return { ageMin: etat === 'inconnu' ? null : ageMin, etat };
}
let etatAffiche = null;
/** Âge de la publication affichée, à chaque tour : voyant (teinte, titre), barre des tâches,
 *  âges écrits dans la page ([data-age-de], posés par renderFeedTo), teinte « vieux » des
 *  chiffres clés. Un seuil franchi change le bandeau d'âge des cartes : elles sont refaites.
 *  `nouvelle` : une publication vient d'arriver — une onde du voyant, une seule. */
function majAges(nouvelle) {
  if (!marketData) return;
  const { ageMin, etat } = etatPublication(marketData.updated);
  if (!nouvelle && etatAffiche !== null && etat !== etatAffiche) renderFeed();
  etatAffiche = etat;
  const teinte = { ok: 'var(--up)', retard: 'var(--warn)', fige: 'var(--down)', inconnu: 'var(--ink-3)' }[etat];
  const dot = document.getElementById('dot');
  if (dot) {
    dot.style.background = teinte;
    dot.classList.toggle('calme', etat !== 'ok');        // ne pas onduler sur du figé
    if (nouvelle && etat === 'ok') onde(dot);
    dot.title = ageMin === null
      ? 'Âge de la donnée inconnu (champ updated absent)'
      : `Dernière publication il y a ${Math.round(ageMin)} min`;
  }
  const td = document.getElementById('taskbarDot');
  if (td) td.style.background = teinte;
  if (ageMin !== null && document.querySelectorAll) {
    const n = String(Math.max(0, Math.round(ageMin)));
    for (const el of document.querySelectorAll('[data-age-de]')) if (el.textContent !== n) el.textContent = n;
    const cy = document.getElementById('cycle');
    if (cy) cy.classList.toggle('vieux', Math.round(ageMin) > CADENCES.vieux_min);
    const kd = cy && cy.querySelector ? cy.querySelector('.kpi-deb') : null;
    if (kd && kd.title !== titreKpiDeb(n)) { kd.title = titreKpiDeb(n); kd.setAttribute('aria-label', ariaKpiDeb(n)); }
  }
}
// L'onde du voyant : UNE par publication NOUVELLE, deux passages puis le calme. Avant : à chaque
// relecture (chaque minute, 14 fois sur 15 pour une donnée qui n'avait pas changé, ≥ 8 ms/s de
// CPU sur Kāla, ≥ 27 sur Aero), relancée par `void dot.offsetWidth` — une mise en page forcée.
// Maintenant : la classe est retirée à la fin de l'animation (le thème peut animer le point ou
// son ::after), une onde encore en cours est rembobinée par l'API Web Animations.
function onde(dot) {
  if (!dot.classList.contains('ping')) { dot.classList.add('ping'); return; }
  const en = dot.getAnimations ? dot.getAnimations({ subtree: true }) : [];
  if (en.length) { for (const a of en) { a.currentTime = 0; a.play(); } return; }
  // Classe restée sans animation en cours (mouvement réduit, onglet caché à la fin) : retirée,
  // puis reposée deux images plus tard — le style aura vu l'état sans elle.
  dot.classList.remove('ping');
  requestAnimationFrame(() => requestAnimationFrame(() => dot.classList.add('ping')));
}
(function () {
  const dot = document.getElementById('dot');
  const fin = e => { if (e.target === dot) dot.classList.remove('ping'); };
  if (dot) { dot.addEventListener('animationend', fin); dot.addEventListener('animationcancel', fin); }
})();

function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
const isNum = v => (v !== null && v !== undefined && !isNaN(v));
const fmtNum = (v,d=2) => isNum(v) ? Number(v).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d}) : '—';
const fmtUsd = v => isNum(v) ? '$' + Math.round(v).toLocaleString('en-US') : '—';
const fmtBig = v => { if(!isNum(v)) return '—'; const a=Math.abs(v);
  if(a>=1e9) return '$'+(v/1e9).toFixed(2)+'B'; if(a>=1e6) return '$'+(v/1e6).toFixed(2)+'M';
  if(a>=1e3) return '$'+(v/1e3).toFixed(1)+'K'; return '$'+v.toFixed(2); };
const pctSpan = v => { if(!isNum(v)) return '—'; const c = v>0?'stat-pos':(v<0?'stat-neg':''); return '<span class="'+c+'">'+(v>0?'+':'')+fmtNum(v)+'%</span>'; };

// ═══════════════════════════════════════════════════════════════════════════════
// LECTURE LIVE — bouton ⚡ (ajouté le 02/10/2026)
// ─────────────────────────────────────────────────────────────────────────────
// POURQUOI CETTE VUE EXISTE. Le dashboard a DEUX cadences, et ça a été pris pour une panne :
//   · le badge de prix en haut -> api.binance.com ticker/price, rafraîchi à la SECONDE ;
//   · les cartes « Marché live » -> market-data.json, fichier réécrit toutes les 15 MINUTES.
// L'utilisateur a signalé deux fois un « écart entre le prix réel OKX et ce qu'affiche le dashboard ».
// Mesuré le 02/10 à 11:07 UTC : badge 86 422,0 contre OKX spot 86 423,0 — soit 1,0 pt, pas
// d'écart. Mais la CARTE affichait 86 330,1 (publiée 4,7 min plus tôt) — soit −92,9 pts. Écart
// réel, dû au seul retard de publication. Sur un cycle complet il atteint 300 à 400 pts.
// Ici, tout ce qui PEUT être live l'est vraiment, et le reste s'affiche avec son âge.
//
// ⚠️ NE JAMAIS appeler ici une source autre que Binance. Les autres (OKX, Deribit, Yahoo) sont
// agrégées côté serveur dans market-data.json ; appelées depuis la page, elles échoueraient en
// silence et donneraient l'illusion d'une panne de marché. Un prix OKX ne peut donc PAS être
// affiché en direct dans cette vue — il arrive avec les 15 minutes du fichier.
let liveTimer = null;

function openLiveModal() {
  const m = document.getElementById('liveModal');
  if (!m) return;
  m.style.display = 'flex';
  renderLive();
  if (!liveTimer) liveTimer = setInterval(() => { if (!document.hidden) renderLive(); }, cadenceLive());
}
// 5 000 niveaux pèsent 250 chez Binance (contre 25 pour 500) : la cadence ralentit avec la
// profondeur pour rester loin du plafond de 6 000 par minute.
function cadenceLive() { return REGLAGES.live.niveaux >= 5000 ? 15000 : REGLAGES.live.niveaux >= 1000 ? 8000 : 5000; }
function closeLiveModal() {
  const m = document.getElementById('liveModal');
  if (m) m.style.display = 'none';
  if (liveTimer) { clearInterval(liveTimer); liveTimer = null; }
}

// Rang (%) d'un prix dans son intervalle — situe le spot dans son range 24 h.
function liveRank(p, lo, hi) {
  return hi > lo ? Math.max(0, Math.min(100, (p - lo) / (hi - lo) * 100)) : 0;
}
// Même composant que les cartes « Marché live » : rail, remplissage, point.
function liveBar(pct) {
  return '<div class="track"><div class="track-rail"><span class="track-fill" style="width:' + pct.toFixed(1)
    + '%"></span><span class="track-dot" style="left:' + pct.toFixed(1) + '%"></span></div></div>';
}
const fmtPx = v => isNum(v) ? Number(v).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '—';
// 2 décimales : un spread Binance BTCUSDT vaut souvent 0,01 $ — arrondi à 1 décimale il
// s'affiche « 0.0 pts », c'est-à-dire « pas de spread », ce qui est faux.
const fmtPx2 = v => isNum(v) ? Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';

async function renderLive() {
  const box = document.getElementById('liveModalBody');
  if (!box) return;
  const clk = document.getElementById('liveClock');
  let t24, depth, trades;
  const t0 = Date.now(), RL = REGLAGES.live;
  try {
    const o = { cache: 'no-store' };
    const B = API_BINANCE, lire = u => fetch(B + u, o).then(r => Horloges.verifier(r).json());
    [t24, depth, trades] = await Promise.all([
      lire('ticker/24hr?symbol=BTCUSDT'),
      lire('depth?symbol=BTCUSDT&limit=' + RL.niveaux),
      lire('trades?symbol=BTCUSDT&limit=' + RL.trades),
    ]);
    Horloges.noter('live');
  } catch (e) {
    const c = Horloges.noter('live', e);
    box.innerHTML = '<div class="loading">⚡ Binance injoignable depuis ce poste — ' + escHtml(c.libelle || (e && e.message ? e.message : e)) + '</div>';
    return;
  }
  const lat = Date.now() - t0;
  const px = parseFloat(t24.lastPrice);
  const bid = parseFloat(t24.bidPrice), ask = parseFloat(t24.askPrice);
  const sprd = ask - bid;
  const hi = parseFloat(t24.highPrice), lo = parseFloat(t24.lowPrice);
  const chg = parseFloat(t24.priceChangePercent);
  const rank = liveRank(px, lo, hi);
  // ── carnet : profondeur réellement posée autour du prix ──
  // 500 niveaux Binance ne couvrent que ≈ ±0,13 % du prix (mesuré le 04/10/2026). La carte
  // annonçait « ±1 % » et sommait en réalité tout le carnet reçu, soit ±0,13 %. On mesure
  // donc une bande que ce carnet COUVRE, et on affiche la couverture réelle.
  // Profondeur et bandes sont des RÉGLAGES : cette page va chercher ce carnet elle-même.
  const mesures = RL.bandes.map(b => [b, bandeLive(depth, px, b)]);
  const BANDE = RL.bandes[0], m0 = mesures[0][1] || {};
  const couv = isNum(m0.couverture) ? m0.couverture : NaN;
  const bv = m0.couverte ? m0.bid : 0, av = m0.couverte ? m0.ask : 0;
  const ratio = m0.couverte ? m0.ratio : NaN;
  // ── tape : 500 derniers trades. isBuyerMaker=true -> l'acheteur était PASSIF -> vente agressive ──
  let buy = 0, sell = 0;
  for (const t of (trades || [])) { const q = parseFloat(t.qty); if (t.isBuyerMaker) sell += q; else buy += q; }
  const tot = buy + sell;
  const taker = tot > 0 ? buy / tot : NaN;
  const delta = buy - sell;
  // Fenêtre réelle des 500 derniers trades : en heures creuses elle ne couvre que quelques
  // SECONDES. Sans ce chiffre, « taker buy 38 % » se lit comme une mesure de tendance alors
  // que c'est un instantané microscopique.
  const spanS = (trades && trades.length > 1)
    ? Math.round((trades[trades.length - 1].time - trades[0].time) / 1000) : null;
  // ── tout le reste : lu dans le fichier de 15 min, avec son âge affiché ──
  const md = marketData || {}, mi = md.micro || {}, bf = md.btc || {};
  const ageMin = md.updated ? Math.round((Date.now() - Date.parse(md.updated)) / 60000) : null;
  if (clk) clk.textContent = '· ' + new Date().toISOString().slice(11, 19) + ' UTC · aller-retour ' + lat + ' ms';

  const pos = 'stat-pos', neg = 'stat-neg';
  let html = '';
  carteEntree = !(box.dataset && box.dataset.vu);

  // 1 — PRIX LIVE
  html += mCard('⚡', 'Prix live', 'Binance spot · à la seconde · aller-retour ' + lat + ' ms', '',
    '<div style="font-size:22px;font-weight:800;letter-spacing:-0.5px">' + fmtUsd(px)
    + ' <span style="font-size:14px" class="' + (chg > 0 ? pos : neg) + '">' + (chg > 0 ? '+' : '') + fmtNum(chg) + '% 24h</span></div>'
    + '<div style="margin-top:6px;font-size:12px;font-variant-numeric:tabular-nums">Bid <b>' + fmtPx2(bid) + '</b> · Ask <b>' + fmtPx2(ask)
    + '</b> · spread <b>' + sprd.toFixed(2) + ' pts</b> (' + (sprd / px * 10000).toFixed(2) + ' bp)</div>');

  // 2 — RANGE 24 H
  html += mCard('📊', 'Range 24 h', 'haut / bas des 24 h · position du spot', '',
    '<div style="font-size:12px;font-variant-numeric:tabular-nums">Haut <b>' + fmtPx(hi) + '</b> · Bas <b>' + fmtPx(lo)
    + '</b></div>' + liveBar(rank)
    + '<div style="margin-top:5px;font-size:12px">Position dans le range : <b>' + rank.toFixed(1) + ' %</b>'
    + ' · amplitude <b>' + fmtNum((hi / lo - 1) * 100) + ' %</b></div>'
    + '<div style="margin-top:5px;font-size:11px;color:var(--ink-2)">Volume 24 h <b>' + fmtBig(parseFloat(t24.quoteVolume))
    + '</b> · ' + parseInt(t24.count, 10).toLocaleString('fr-FR') + ' trades</div>');

  // 3 — CARNET LIVE ±1 %
  // Seuils de LECTURE (réglables) : ils choisissent la phrase, jamais le ratio affiché.
  const carnetTxt = !isFinite(ratio) ? (m0.couverte === false ? 'bande non couverte par le carnet reçu' : '—')
    : ratio >= RL.ratioMarque ? 'déséquilibre ACHETEUR marqué' : ratio >= RL.ratioLeger ? 'léger penchant acheteur'
    : ratio <= 1 / RL.ratioMarque ? 'déséquilibre VENDEUR marqué' : ratio <= 1 / RL.ratioLeger ? 'léger penchant vendeur' : 'équilibré';
  const autresBandes = mesures.slice(1).map(([b, m]) => '±' + b + ' % : ' + (!m ? '—' : m.couverte ? '<b>' + m.ratio.toFixed(2) + '</b>' : 'non couverte')).join(' · ');
  html += mCard('💧', 'Carnet live ±' + BANDE + ' %', 'Binance spot · ' + RL.niveaux.toLocaleString('fr-FR') + ' niveaux, vus jusqu\'à ±'
    + (isFinite(couv) ? couv.toFixed(2) : '—') + ' % · instantané', '',
    '<div style="font-size:12px;font-variant-numeric:tabular-nums">Bids <b>' + fmtNum(bv, 1) + ' BTC</b> · Asks <b>' + fmtNum(av, 1) + ' BTC</b></div>'
    + '<div style="margin-top:6px;font-size:15px;font-weight:800" class="' + (ratio >= 1 ? pos : neg) + '">Ratio bid/ask '
    + (isFinite(ratio) ? ratio.toFixed(2) : '—') + '</div>'
    + (autresBandes ? '<div style="margin-top:4px;font-size:11.5px;font-variant-numeric:tabular-nums">' + autresBandes + '</div>' : '')
    + '<div style="margin-top:4px;font-size:11px;color:var(--ink-2)">' + carnetTxt
    + ' — un carnet est PÉRISSABLE : valable quelques minutes, et un mur peut être retiré</div>');

  // 4 — TAPE LIVE
  const tD = RL.takerDominant / 100, tL = RL.takerLeger / 100;
  const tapeTxt = !isFinite(taker) ? '—'
    : taker >= tD ? 'acheteurs agressifs dominants' : taker >= tL ? 'léger penchant acheteur'
    : taker <= 1 - tD ? 'vendeurs agressifs dominants' : taker <= 1 - tL ? 'léger penchant vendeur' : 'partagé';
  html += mCard('🌊', 'Tape live', RL.trades + ' derniers trades · fenêtre ' + (spanS === null ? '—' : spanS + ' s') + ' · agression, pas intention', '',
    '<div style="font-size:12px;font-variant-numeric:tabular-nums">Achats au taker <b>' + fmtNum(buy, 1) + ' BTC</b> · Ventes <b>' + fmtNum(sell, 1) + ' BTC</b></div>'
    + '<div style="margin-top:6px;font-size:15px;font-weight:800" class="' + (taker >= 0.5 ? pos : neg) + '">Taker buy '
    + (isFinite(taker) ? (taker * 100).toFixed(1) + ' %' : '—') + '</div>'
    + '<div style="margin-top:4px;font-size:12px">Delta net <b class="' + (delta >= 0 ? pos : neg) + '">'
    + (delta >= 0 ? '+' : '') + fmtNum(delta, 1) + ' BTC</b> — ' + tapeTxt + '</div>');

  // 5 — CE QUI N'EST PAS LIVE ICI, ET POURQUOI
  const ageTxt = ageMin === null ? 'inconnu' : ageMin + ' min';
  html += mCard('🕐', "ce qui n'est PAS live ici", 'lu dans le fichier publié — âge ' + ageTxt, '',
    '<div style="font-size:12px;font-variant-numeric:tabular-nums">'
    + 'Perp (mark) <b>' + (isNum(mi.mark_price) ? fmtPx(mi.mark_price) : '—') + '</b>'
    // ⚠️ Le basis se calcule entre le perp ET le spot DU MÊME INSTANT du fichier. Soustraire
    // ce perp (daté) au spot LIVE fabriquait un basis de −207 pts au lieu de −45. C'est
    // exactement le péché que ce panneau est censé rendre impossible.
    + ' · basis <b>' + (isNum(mi.mark_price) && isNum(bf.price) ? (mi.mark_price - bf.price).toFixed(1) + ' pts' : '—') + '</b>'
    + ' <span style="color:var(--ink-2)">(perp et spot du même instant du fichier)</span><br>'
    + 'Dérive du spot depuis la publication <b>' + (isNum(bf.price) ? (px - bf.price).toFixed(1) + ' pts' : '—') + '</b>'
    + ' · funding <b>' + (isNum(mi.funding_rate_pct) ? fmtNum(mi.funding_rate_pct, 5) + ' %/8h' : '—') + '</b>'
    + ' · annualisé <b>' + (isNum(mi.funding_annual_pct) ? fmtNum(mi.funding_annual_pct, 1) + ' %' : '—') + '</b><br>'
    + 'OI <b>' + (isNum(mi.oi_btc) ? fmtNum(mi.oi_btc, 0) + ' BTC' : '—') + '</b>'
    + ' · L/S retail <b>' + (isNum(mi.ls_ratio) ? fmtNum(mi.ls_ratio, 3) : '—') + '</b>'
    + ' · variation 24 h (fichier) <b>' + (isNum(bf.change_24h_pct) ? fmtNum(bf.change_24h_pct) + ' %' : '—') + '</b></div>'
    + '<div style="margin-top:8px;font-size:11px;color:var(--ink-2);line-height:1.45">'
    + '<b>Piège mesuré le 02/10 :</b> soustraire le perp du fichier au spot live affichait un basis de '
    + '<b>−207 pts</b> quand le vrai basis valait <b>−45 pts</b>. Deux cadences différentes ne se soustraient '
    + 'jamais — c&#39;est l&#39;erreur exacte que ce panneau existe pour éviter.<br><br>'
    + 'Ces blocs viennent de market-data.json (cron, ' + CADENCES.attendue_min + ' min) : cette page n\'interroge que Binance '
    + 'en direct, les autres sources (OKX, Deribit, Yahoo) sont agrégées côté serveur et arrivent avec '
    + 'leurs ' + CADENCES.attendue_min + ' minutes. Pour comparer honnêtement, ce prix-ci est du <b>spot Binance</b> : compare-le '
    + 'à ton <b>spot</b> OKX, jamais à un swap — le basis perp/spot fait 20 à 50 pts et ce n&#39;est pas '
    + 'une panne.</div>');

  carteEntree = false;
  if (box.dataset) box.dataset.vu = '1';
  box.innerHTML = html;
}

// Icônes des cartes : SVG au trait, même dessin sur tous les systèmes (un émoji change de
// style d'un OS à l'autre). La clé reste l'émoji passé par l'appelant ; la teinte de l'orbe
// et le filet de la carte viennent de la classe `carte-<nom>`.
const ICONES = {
  '📊': ['marche', '<path d="M7 4v4M7 16v4M17 3v3M17 14v7"/><rect x="5" y="8" width="4" height="8" rx="1"/><rect x="15" y="6" width="4" height="8" rx="1"/>'],
  '🌍': ['macro', '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/>'],
  '📈': ['ind', '<path d="M3 12h4l3-7 4 14 3-7h4"/>'],
  '📡': ['micro', '<circle cx="12" cy="12" r="2"/><path d="M8.5 15.5a5 5 0 0 1 0-7M15.5 8.5a5 5 0 0 1 0 7M5.6 18.4a9 9 0 0 1 0-12.8M18.4 5.6a9 9 0 0 1 0 12.8"/>'],
  '💧': ['liq', '<path d="M12 3s6 6.4 6 11a6 6 0 0 1-12 0c0-4.6 6-11 6-11z"/>'],
  '🔌': ['flux', '<path d="M9 7V3M15 7V3M7 7h10v4a5 5 0 0 1-10 0V7zM12 16v5"/>'],
  '⚡': ['live', '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z"/>'],
  '🌊': ['tape', '<path d="M2 9c2.5-2 4.5-2 7 0s4.5 2 7 0 4.5-2 6 0M2 15c2.5-2 4.5-2 7 0s4.5 2 7 0 4.5-2 6 0"/>'],
  '🕐': ['temps', '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'],
  '⏱': ['horloges', '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 1.5M10 2h4M12 2v3"/>'],
  '🔎': ['contre', '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5M7.8 10.6l1.9 1.9 3.6-3.8"/>'],
};
const svgIco = d => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
// Apparition en fondu au PREMIER rendu d'un conteneur seulement : les cartes sont réécrites
// toutes les 60 s (et le panneau ⚡ toutes les 5 s) — l'animation ne doit pas se rejouer.
let carteEntree = false;
function mCard(icon, title, sub, right, body) {
  const ic = ICONES[icon];
  return '<div class="demon-card carte-' + (ic ? ic[0] : 'autre') + (carteEntree ? ' entree' : '') + '"><div class="demon-header">'
    + '<div class="demon-avatar"><div class="avatar-orb">' + (ic ? svgIco(ic[1]) : icon) + '</div></div>'
    + '<div class="demon-titres"><div class="demon-name">' + title + '</div><div class="demon-role">' + sub + '</div></div>'
    + (right ? '<span class="demon-right">' + right + '</span>' : '')
    + '</div><div class="demon-body">' + body + '</div></div>';
}
// TROIS états, pas deux. `undefined` (champ absent de market-data.json) tombait dans
// la branche « else » et affichait « GOLDEN CROSS » : un signal haussier fabriqué à
// partir d'une absence. Une donnée manquante doit se voir comme manquante.
// Et le badge dit ce que le champ EST : l'état EMA20 < EMA50 sur le TF de la ligne. Il
// affichait « DEATH CROSS », nom d'un CROISEMENT de SMA50 / SMA200 en daily — un autre objet.
function crossTag(sous) {
  if (sous === true)  return '<span class="badge badge-baissier" title="État sur ce TF, pas un croisement daté">EMA20 &lt; EMA50</span>';
  if (sous === false) return '<span class="badge badge-hausser" title="État sur ce TF, pas un croisement daté">EMA20 &gt; EMA50</span>';
  return '<span class="badge" style="background:var(--rail);color:var(--ink-3)">n/d</span>';
}
// Montant signé lisible : « −$6.83M » plutôt que « $-6.83M ».
const fmtSigned = v => !isNum(v) ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + fmtBig(Math.abs(v));
const signCls = v => v > 0 ? 'stat-pos' : (v < 0 ? 'stat-neg' : '');
const chipCls = v => 'chip' + (v > 0 ? ' pos' : v < 0 ? ' neg' : '');
const pctSigne = (v, d) => !isNum(v) ? '—' : (v > 0 ? '+' : '') + fmtNum(v, d === undefined ? 2 : d) + '%';
const pct1 = v => isNum(v) ? Math.max(0, Math.min(100, v)).toFixed(1) : null;

// ═══ Composants visuels des cartes ═══
// Position d'une valeur dans [lo, hi] : rail + remplissage + point (bas/haut 24 h, canal S/R).
function trackHtml(val, lo, hi, gauche, droite) {
  const p = (isNum(val) && isNum(lo) && isNum(hi) && hi > lo) ? pct1((val - lo) / (hi - lo) * 100) : null;
  return '<div class="track"><div class="track-rail">'
    + (p === null ? '' : '<span class="track-fill" style="width:' + p + '%"></span><span class="track-dot" style="left:' + p + '%"></span>')
    + '</div><div class="track-legende"><span>' + gauche + '</span><span>' + droite + '</span></div></div>';
}
// Jauge RSI : zones de survente (≤ 30) et de surachat (≥ 70) teintées, un point à la valeur.
function rsiMeter(v) {
  const p = pct1(v);
  const etat = !isNum(v) ? '' : v >= 70 ? ' chaud' : v <= 30 ? ' froid' : '';
  return '<div class="rsi-meter' + etat + '" title="RSI : zones 30 / 70"><span class="rsi-zone bas"></span><span class="rsi-zone haut"></span>'
    + (p === null ? '' : '<span class="rsi-dot" style="left:' + p + '%"></span>') + '</div>';
}
// Barre à deux segments (long/short, bids/asks), séparés par 2 px de surface.
function splitHtml(a, b, gauche, droite) {
  const t = (+a || 0) + (+b || 0), pa = t > 0 ? (+a || 0) / t * 100 : 50;
  return '<div class="split"><span class="split-a" style="width:' + pa.toFixed(1) + '%"></span><span class="split-b"></span></div>'
    + '<div class="split-legende"><span>' + gauche + '</span><span>' + droite + '</span></div>';
}
// Barres divergentes centrées sur zéro, à l'échelle de la plus grande valeur absolue.
function divergeRows(rows) {
  const m = Math.max(...rows.map(r => Math.abs(+r.v) || 0)) || 1;
  return rows.map(r => {
    const w = isNum(r.v) ? (Math.abs(r.v) / m * 50).toFixed(1) : 0;
    return '<div class="dv-row"><span class="dv-lbl">' + r.lbl + '</span><div class="dv-bar"><span class="dv-axe"></span>'
      + (isNum(r.v) ? '<span class="dv-fill ' + (r.v >= 0 ? 'pos' : 'neg') + '" style="' + (r.v >= 0 ? 'left' : 'right') + ':50%;width:' + w + '%"></span>' : '')
      + '</div><span class="dv-val">' + r.txt + '</span></div>';
  }).join('');
}
// Mini-axe de prix : repères placés à l'échelle, étiquettes alternées dessus / dessous.
function axePrix(points) {
  const ps = points.filter(x => isNum(x.p)).sort((a, b) => a.p - b.p);
  if (ps.length < 2) return '';
  const lo = ps[0].p, hi = ps[ps.length - 1].p, marge = (hi - lo) * 0.14 || 1;
  const pos = v => ((v - lo + marge) / (hi - lo + 2 * marge) * 100).toFixed(1);
  const k = v => '$' + (v / 1000).toFixed(1) + 'k';
  return '<div class="axe"><div class="axe-rail"></div>' + ps.map((x, i) =>
    '<span class="axe-pt ' + x.cls + (i % 2 ? ' bas' : ' haut') + '" style="left:' + pos(x.p) + '%"><i></i><b><em>' + x.lbl + '</em>' + k(x.p) + '</b></span>'
  ).join('') + '</div>';
}
// Échelle des murs : asks au-dessus, mid, bids au-dessous — rangés par prix, barre ∝ BTC.
function ladderHtml(asks, bids, mid) {
  const a = asks || [], b = bids || [];
  const max = Math.max(1, ...a.map(w => w[1]), ...b.map(w => w[1]));
  const ligne = (w, cote) => '<div class="lad-row ' + cote + '"><span class="lad-px">' + fmtUsd(w[0]) + '</span>'
    + '<div class="lad-bar"><span style="width:' + (w[1] / max * 100).toFixed(1) + '%"></span></div>'
    + '<span class="lad-q">' + fmtNum(w[1], 1) + '&nbsp;BTC</span></div>';
  const parPrix = l => [...l].sort((x, y) => y[0] - x[0]);
  return '<div class="ladder">' + parPrix(a).map(w => ligne(w, 'ask')).join('')
    + '<div class="lad-mid">mid ' + fmtUsd(mid) + '</div>'
    + parPrix(b).map(w => ligne(w, 'bid')).join('') + '</div>';
}
const tuile = (lbl, val, sub, fiche, lecture) => '<div class="tuile"><div class="lbl">' + lbl + (fiche ? infoBtn(fiche) : '') + '</div><div class="val">' + val + '</div>'
  + (sub ? '<div class="sub">' + sub + '</div>' : '') + (lecture || '') + '</div>';

// Bande de chiffres clés de l'en-tête : la publication en un coup d'œil, par ordre d'utilité
// (ce qui ne tient pas en largeur est coupé à droite). TOUTES ces valeurs viennent du même
// fichier, au même instant ; son âge ferme la bande. Rien n'y est mêlé au prix live.
// Refaite à chaque publication, et quand la chronique a fini de relire l'historique.
function renderCycle(d) {
  const cy = document.getElementById('cycle');
  if (!cy) return;
  const x = d.micro || {}, m = d.macro || {}, tf = d.tf || {};
  const upd = d.updated ? new Date(d.updated) : null;
  // Signe moins typographique partout (« −2.0% » comme « −$76M »), pas un tiret.
  // Chaque chiffre porte sa trace des dernières heures (js/chronique.js), sur la ligne de son
  // libellé : la hauteur de la bande ne change pas. Elle cède la place avant toute valeur
  // (ajusterKpis). Sans historique, pas de trace (rien d'inventé).
  const kpi = (lbl, val, cls, chemin) => '<span class="kpi"' + titreKpi(chemin) + '><span class="kpi-t"><i>' + lbl + '</i>' + traceKpi(chemin) + '</span><b' + (cls ? ' class="' + cls + '"' : '') + '>'
    + String(val).replace(/^-/, '−') + '</b></span>';
  const t4 = tf['4h'] || {};
  const oiK = isNum(x.oi_change_24h_pct) ? x.oi_change_24h_pct : x.oi_change_1d_pct;
  const ageK = upd ? Math.max(0, Math.round((Date.now() - upd.getTime()) / 60000)) : null;
  cy.innerHTML = kpi('RSI 4h', fmtNum(t4.rsi_14, 1), '', 'tf.4h.rsi_14')
    + kpi('Funding', pctSigne(x.funding_annual_pct, 1), signCls(x.funding_annual_pct), 'micro.funding_annual_pct')
    + kpi('OI 24h', pctSigne(oiK, 1), signCls(oiK), 'micro.oi_change_24h_pct')
    + kpi('CVD 24h', fmtSigned(x.cvd_24h_usd), signCls(x.cvd_24h_usd), 'micro.cvd_24h_usd')
    + kpi('GEX', isNum(x.gex_usd_1pct) ? (x.gex_usd_1pct > 0 ? 'long γ' : 'short γ') : '—', signCls(x.gex_usd_1pct), 'micro.gex_usd_1pct')
    + kpi('L/S', fmtNum(x.ls_ratio, 2), '', 'micro.ls_ratio')
    + kpi('DXY', fmtNum(m.dxy_spot, 2), '', 'macro.dxy_spot')
    + kpi('VIX', fmtNum(m.vix, 1), '', 'macro.vix')
    // L'âge avance chaque minute sans refaire la bande : majAges() réécrit les [data-age-de].
    + '<span class="kpi-age" title="Âge de la publication">' + (ageK === null ? '—' : ageDe(d.updated, ageK) + ' min') + '</span>'
    // Débutant : une seule pastille, qui ouvre les cartes ; son âge dans l'infobulle (collé au prix
    // en direct, « il y a 18 min » se lisait comme l'âge du prix). « en retard » au-delà du seuil.
    + '<span class="kpi-deb debutant-seul" role="button" tabindex="0" title="' + titreKpiDeb(ageK) + '" aria-label="' + ariaKpiDeb(ageK) + '">'
    + '<span class="deb-frais">Infos du marché ▸</span><span class="deb-retard">Infos du marché · en retard ▸</span></span>';
  cy.classList.toggle('vieux', ageK !== null && ageK > CADENCES.vieux_min);
  const cad = chronique.cadence();
  cy.title = 'Dernière publication (cadence ' + (cad ? 'mesurée ' + Math.round(cad / 60000) : 'attendue ' + CADENCES.attendue_min) + ' min) — cliquer pour le détail';
  ajusterKpis();
}
// Le nom accessible commence par le texte visible (« Infos du marché »), l'âge ensuite.
const ariaKpiDeb = min => 'Infos du marché — ' + titreKpiDeb(min);
// Au clavier : Entrée ou Espace sur la pastille ouvre les cartes (comme le clic sur #cycle).
(function () {
  const cy = typeof document !== 'undefined' && document.getElementById ? document.getElementById('cycle') : null;
  if (cy && cy.addEventListener) cy.addEventListener('keydown', e => {
    if (!(e.target && e.target.classList && e.target.classList.contains('kpi-deb'))) return;
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') { e.preventDefault(); e.stopPropagation(); toggleFeed(); }
  });
})();
const titreKpiDeb = min => (min === null ? 'Infos publiées : âge inconnu' : 'Infos publiées il y a ' + min + ' min') + ' (toutes les ' + CADENCES.attendue_min + ' min). Le prix du haut est en direct.';
function renderFeed() { renderFeedTo(document.getElementById('feed')); }
// Un âge en minutes, réécrit sur place à chaque tour par majAges().
const ageDe = (updated, min) => '<span data-age-de="' + escHtml(updated) + '">' + min + '</span>';
// Ce qui ne tient pas dans la bande est masqué EN ENTIER, en partant de la fin (ordre d'utilité).
// Les traces (js/chronique.js) passent APRÈS les valeurs : on place d'abord les valeurs seules,
// puis on rend leur trace aux premières tant qu'elles tiennent. Une valeur n'est jamais masquée
// pour faire place à une trace (toutes tracées, 3 chiffres clés sur 5 tenaient à 1440 px en
// Aero — mesuré).
function ajusterKpis() {
  const cy = document.getElementById('cycle');
  if (!cy || !cy.querySelectorAll) return;
  const items = Array.from(cy.querySelectorAll('.kpi'));
  items.forEach(k => { k.hidden = false; k.classList.add('sans-trace'); });
  const deborde = () => cy.scrollWidth > cy.clientWidth + 1;
  for (let i = items.length - 1; i > 0 && deborde(); i--) items[i].hidden = true;
  for (const k of items) {
    if (k.hidden || !k.querySelector('.chron-spark')) continue;
    k.classList.remove('sans-trace');
    if (deborde()) { k.classList.add('sans-trace'); break; }
  }
}
// Le ruban défile quand il ne tient pas : le fondu de droite ne s'affiche qu'à ce moment-là.
function ajusterRuban() {
  const r = document.getElementById('indicatorBar');
  if (r && r.classList) r.classList.toggle('deborde', r.scrollWidth > r.clientWidth + 1
    && r.scrollLeft + r.clientWidth < r.scrollWidth - 2);
}

// Bandeau d'âge. Il est injecté DANS le même innerHTML que les cartes, donc il
// s'affiche dans le conteneur réellement visible (#marketModalBody) — un bandeau
// inséré avant #feed partait dans le panneau latéral replié et restait invisible
// (constaté au rendu : présent dans le DOM, absent de l'écran).
// Les cartes ont le MÊME HTML dans les deux modes : un texte qui diffère est écrit deux fois,
// chacun dans son span (modes) ; un bloc réservé à l'Expert est enveloppé (envExpert : sans
// boîte en Expert, display: contents — la mise en page Expert ne change pas) ; un bloc du
// Débutant seul, dans un div .debutant-seul (envDebutant).
const modes = (exp, deb) => '<span class="expert-seul">' + exp + '</span><span class="debutant-seul">' + deb + '</span>';
const envExpert = h => '<div class="env-exp expert-seul">' + h + '</div>';
const envDebutant = h => '<div class="env-deb debutant-seul">' + h + '</div>';
// Débutant : un prix au format français (« 80 394 $ »), un nombre de BTC à l'unité.
const prixDeb = v => (isNum(v) ? escHtml(Guide.prix(v, '$')) : '—');
const btcDeb = v => (isNum(v) ? escHtml(Guide.nombre(v, v >= 10 ? 0 : 1)) + ' BTC' : '—');
// « il y a 18 min » (l'âge est réécrit sur place chaque minute, majAges).
const ilYaDeb = (updated, min) => (min === null ? 'âge inconnu' : 'il y a ' + ageDe(updated, min) + ' min');
// Où est une valeur dans [lo, hi], de 0 à 1 (ou null).
const positionDans = (v, lo, hi) => (isNum(v) && isNum(lo) && isNum(hi) && hi > lo ? Math.max(0, Math.min(1, (v - lo) / (hi - lo))) : null);
function ageBannerHtml(d) {
  const upd = d && d.updated ? Date.parse(d.updated) : NaN;
  if (isNaN(upd)) {
    return '<div class="age-banner" style="display:block">' + modes('Âge de la donnée inconnu — champ <b>updated</b> absent', 'Âge des infos du marché inconnu.') + '</div>';
  }
  const age = (Date.now() - upd) / 60000;
  if (age <= CADENCES.vieux_min) return '';
  const fige = age > CADENCES.fige_min;
  return '<div class="age-banner' + (fige ? '' : ' retard') + '" style="display:block">'
    + (fige
        ? modes('Données figées depuis ' + Math.round(age) + ' min — le cron de publication ne tourne plus',
          'Données figées depuis ' + Math.round(age) + ' min : la publication s’est arrêtée.')
        : modes('Dernière publication il y a ' + Math.round(age) + ' min (cadence attendue : ' + CADENCES.attendue_min + ' min)',
          'Dernière publication il y a ' + Math.round(age) + ' min (attendue toutes les ' + CADENCES.attendue_min + ' min).'))
    + '</div>';
}

function renderFeedTo(container) {
  if (!marketData) { container.innerHTML = '<div class="loading">📊 En attente des données…</div>'; return; }
  const d = marketData, b = d.btc||{}, m = d.macro||{}, tf = d.tf||{},
        x = d.micro||{}, lq = d.liquidity||{}, st = d.status||{};
  const upd = d.updated ? new Date(d.updated) : null;
  // Le libellé annonce « UTC » : il faut donc formater EN UTC. Sans `timeZone`,
  // c'était l'heure locale du poste (Paris, +2 h en été) affichée sous l'étiquette UTC.
  const hhmm = upd ? upd.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit',timeZone:'UTC'}) : '—';

  // L'heure d'abord : elle élargit la droite de l'en-tête, et la bande se mesure ensuite —
  // dans l'autre ordre, des chiffres clés restaient « affichés » mais coupés (mesuré à 1440 px).
  const up = document.getElementById('updated');
  if (up) up.textContent = hhmm;
  renderCycle(d);

  let html = '';
  carteEntree = !(container.dataset && container.dataset.vu);

  // ── 1. MARCHÉ ──
  // ⚠️ AJOUTÉ 02/10/2026. l'utilisateur a signalé DEUX FOIS un « écart entre le prix réel OKX et
  // ce qu'affiche le dashboard ». Mesuré : le badge de prix en haut (Binance ticker/price,
  // rafraîchi à la SECONDE) est à −1,0 pt de l'OKX spot — pas d'écart. Mais CETTE carte vient
  // de market-data.json, réécrit toutes les 15 min : elle affichait 86 330,1 quand le spot
  // était à 86 423,0, soit −92,9 pts en 4,7 min. Le décalage était réel mais daté — encore
  // fallait-il le calculer. On affiche l'âge en minutes à côté de l'heure de maj pour que le
  // retard se LISE. Le bandeau d'âge (ageBannerHtml) ne se déclenche qu'au-delà de CADENCES.vieux_min,
  // c'est-à-dire jamais dans le cas normal : d'où deux prix contradictoires à l'écran.
  const ageMin = upd ? Math.max(0, Math.round((Date.now() - upd.getTime()) / 60000)) : null;
  // Débutant, sur une autre paire que BTCUSDT : ces cartes parlent du BITCOIN (le fichier publié ne
  // suit que lui). Elles le disent dans leurs titres et leurs phrases (« le bitcoin », pas « le
  // prix ») — sinon on lisait « le prix est dans le haut de sa fourchette » à côté de SOL à −4 %.
  const autrePaire = activeSymbol !== 'BTCUSDT', sujet = autrePaire ? 'le bitcoin' : 'le prix';
  const btcTitre = t => (autrePaire ? 'Bitcoin : ' + t.charAt(0).toLowerCase() + t.slice(1) : t);
  // Débutant : « Fourchette des 24 h » — un seul prix en grand à l'écran (celui du haut, en
  // direct) ; le prix publié, en petit, avec son âge.
  html += mCard('📊', modes('Marché live', btcTitre('Fourchette des 24 h')), modes('Binance spot · maj ' + hhmm + ' UTC'
      + (ageMin !== null ? ' (+' + ageDe(d.updated, ageMin) + ' min — le badge du haut est live)' : ''), 'Binance · le prix du haut est en direct'), '',
    envExpert('<div class="hero"><span class="hero-val">' + fmtUsd(b.price) + '</span>'
    + '<span class="' + chipCls(b.change_24h_pct) + '">' + pctSigne(b.change_24h_pct) + ' 24h</span></div>')
    + envDebutant('<div class="fine">' + (autrePaire ? 'Prix du bitcoin publié ' : 'Prix publié ') + ilYaDeb(d.updated, ageMin) + ' : <b style="color:var(--ink-1)">' + prixDeb(b.price) + '</b></div>')
    + trackHtml(b.price, b.low_24h, b.high_24h, modes('Bas&nbsp;<b>' + fmtUsd(b.low_24h) + '</b>', 'Bas publié&nbsp;<b>' + prixDeb(b.low_24h) + '</b>'),
      modes('Haut&nbsp;<b>' + fmtUsd(b.high_24h) + '</b>', 'Haut publié&nbsp;<b>' + prixDeb(b.high_24h) + '</b>'))
    + phraseCarte('fourchette', positionDans(b.price, b.low_24h, b.high_24h), '24 h', sujet)
    + envExpert('<div class="fine" style="margin-top:8px">Volume 24h&nbsp;<b style="color:var(--ink-1)">' + fmtBig(b.quote_volume_24h_usd) + '</b></div>'));

  // ── 2. MACRO ──
  // Week-end : DXY et VIX sont TOUS DEUX des dernières clôtures (marchés fermés), pas des
  // valeurs du moment — l'ancienne carte ne le disait que pour le DXY.
  const ferme = !!m.dxy_is_weekend;
  // Débutant : « Bourses américaines », la seule tuile du VIX (le dollar est en Expert).
  html += mCard('🌍', modes('Macro', 'Bourses américaines'), modes('Dollar et volatilité · Yahoo', 'Yahoo · ' + ilYaDeb(d.updated, ageMin)), '',
    '<div class="tuiles deb-une">'
    + envExpert(tuile('DXY', fmtNum(m.dxy_spot,2), ferme ? 'clôture' + (m.dxy_date ? ' du ' + escHtml(m.dxy_date) : '') : 'indice dollar', 'dxy'))
    + tuile(modes('VIX', 'Nervosité des bourses'), modes(fmtNum(m.vix,1), isNum(m.vix) ? escHtml(Guide.nombre(m.vix, 1)) : '—'),
      modes(ferme ? 'clôture' : 'volatilité implicite S&amp;P', ferme ? 'dernière séance' : ''), 'vix', phraseCarte('vix', m.vix))
    + '</div>');

  // ── 3. INDICATEURS ──
  let indBody = '';
  const tfLabel = { '4h':'4 h', '1h':'1 h', '1d':'1 j' };
  // S / R / amplitude = min / max des 30 DERNIÈRES bougies du TF (fetch_macro) : 5 j en 4h,
  // 30 h en 1h, 30 j en 1j. L'étiquette disait « 16 j, 100 b. 4h » pour les trois, et le
  // champ s'appelle `range_24h_pct` alors qu'il ne couvre jamais 24 h. Les champs `*_4h`
  // (ema20_4h, death_cross_4h) portent en réalité les valeurs DU TF de la ligne.
  const srH = { '4h': 120, '1h': 30, '1d': 720 };
  const dureeTxt = h => h % 24 === 0 ? (h / 24) + ' j' : h + ' h';
  for (const k of ['4h','1h','1d']) {
    const t = tf[k]; if (!t) continue;
    const fen = dureeTxt(t.sr_window_h || srH[k]);
    // Champs canoniques (publish.py ≥ 4.0) d'abord ; les anciens noms en repli. L'écart signé
    // n'existe pas dans l'ancien format : on y affiche alors l'écart ABSOLU, et on le dit.
    const e20 = isNum(t.ema20) ? t.ema20 : t.ema20_4h, e50 = isNum(t.ema50) ? t.ema50 : t.ema50_4h;
    const sous = typeof t.ema20_sous_ema50 === 'boolean' ? t.ema20_sous_ema50 : t.death_cross_4h;
    const ecart = isNum(t.ema_ecart_pct) ? 'écart ' + pctSigne(t.ema_ecart_pct) : 'écart absolu ' + fmtNum(t.ema_gap_pct,2) + '%';
    const ampl = isNum(t.amplitude_30_pct) ? t.amplitude_30_pct : t.range_24h_pct;
    indBody += '<div class="tf-row"><div class="tf-tete"><span class="tf-nom">' + (tfLabel[k]||k) + '</span>'
      + '<span class="tf-rsi">RSI&nbsp;<b>' + fmtNum(t.rsi_14,1) + '</b></span>' + rsiMeter(t.rsi_14) + crossTag(sous) + '</div>'
      // Canal S/R : où le dernier cours se situe entre le support et la résistance de la fenêtre.
      + trackHtml(t.last_close, t.support_30, t.resistance_30, 'S&nbsp;<b>' + fmtUsd(t.support_30) + '</b>', 'R&nbsp;<b>' + fmtUsd(t.resistance_30) + '</b>')
      + '<div class="tf-pied">EMA20 ' + fmtUsd(e20) + ' · EMA50 ' + fmtUsd(e50)
      + ' (' + ecart + ') · amplitude ' + fmtNum(ampl,2) + '% (min/max ' + fen + ')'
      + (isNum(t.atr_14) ? '<span class="expert-seul"> · ATR ' + fmtUsd(t.atr_14) + ' (' + fmtNum(t.atr_14_pct,2) + '%)</span>' : '') + '</div>'
      + (k === '4h' ? lectureCourte('rsi_tf', t.rsi_14) : '') + '</div>';
  }
  indBody += '<div class="fiches-ligne">' + ['rsi_tf', 'croisement', 'ema_tf', 'sr_tf', 'amplitude', 'atr_tf'].map(f =>
    '<span class="fiche-lien">' + FICHES[f].titre.replace(/ \((fichier|graphique)[^)]*\)/, '') + infoBtn(f) + '</span>').join('') + '</div>';
  // Débutant : « Fourchette des 5 jours » — la jauge des bougies 4 h (bas et haut de leur
  // fenêtre, lue dans sr_window_h) et une phrase ; le reste est en Expert.
  const t4 = tf['4h'];
  const fen4 = t4 ? (t4.sr_window_h || srH['4h']) : null;
  const fenMots = h => (h % 24 === 0 ? (h / 24) + (h / 24 > 1 ? ' jours' : ' jour') : h + ' heures');
  const fenCourt = h => (h % 24 === 0 ? (h / 24) + ' j' : h + ' h');
  const indDeb = t4 ? trackHtml(t4.last_close, t4.support_30, t4.resistance_30, 'Bas ' + fenCourt(fen4) + '&nbsp;<b>' + prixDeb(t4.support_30) + '</b>', 'Haut ' + fenCourt(fen4) + '&nbsp;<b>' + prixDeb(t4.resistance_30) + '</b>')
    + phraseCarte('fourchette', positionDans(t4.last_close, t4.support_30, t4.resistance_30), fenMots(fen4), sujet) : '<div class="fine">En attente de la prochaine publication.</div>';
  html += mCard('📈', modes('Indicateurs', btcTitre('Fourchette des ' + (fen4 ? fenMots(fen4) : '5 jours'))), modes('Binance 4h/1h/1d · RSI Wilder · bougie en cours incluse', 'Publié ' + ilYaDeb(d.updated, ageMin)), '',
    envExpert(indBody) + envDebutant(indDeb));

  // ── 4. MICROSTRUCTURE ──
  // OI : variation sur 24 h GLISSANTES (historique horaire Binance). L'ancien « Δ1j » comparait minuit
  // à minuit : −0,26 % affichés le 04/10 à 11 h pour +1,18 % réels.
  const oi24 = isNum(x.oi_change_24h_pct) ? x.oi_change_24h_pct : x.oi_change_1d_pct;
  // CVD : fenêtré (bougies 5 min Binance). Un fichier de l'ancien format porte le CUMUL du
  // daemon depuis son premier démarrage (des mois de flux) : il n'a pas de sens ici, on ne
  // l'affiche pas comme une lecture du moment.
  const cvdTxt = (v, tb) => '<span class="' + signCls(v) + '">' + fmtSigned(v) + '</span>'
    + (isNum(tb) ? ' <span class="mute">' + fmtNum(tb,1) + '% achat</span>' : '');
  const cvdHtml = isNum(x.cvd_1h_usd)
    ? divergeRows([{ lbl: '1h', v: x.cvd_1h_usd, txt: cvdTxt(x.cvd_1h_usd, x.taker_buy_1h_pct) },
                   { lbl: '4h', v: x.cvd_4h_usd, txt: cvdTxt(x.cvd_4h_usd, x.taker_buy_4h_pct) },
                   { lbl: '24h', v: x.cvd_24h_usd, txt: cvdTxt(x.cvd_24h_usd, x.taker_buy_24h_pct) }])
    : '<div class="fine">— en attente du nouveau format</div>';
  // GEX : USD de delta par mouvement de 1 %, convention calls + / puts −. L'ancien calcul
  // sortait « NEUTRAL » 427 fois sur 427 : il est remplacé, voir options_gex.py.
  let gexHtml;
  if (isNum(x.gex_usd_1pct)) {
    const zg = isNum(x.zero_gamma)
      ? 'zéro γ <b style="color:var(--ink-1)">' + fmtUsd(x.zero_gamma) + '</b> (spot '
        + (x.spot_vs_zero_gamma_pct > 0 ? '+' : '') + fmtNum(x.spot_vs_zero_gamma_pct,1) + '%)'
      : 'zéro γ hors ±15 %';
    gexHtml = '<div class="bloc"><div class="bloc-titre"><span class="ligne"><b>GEX</b>' + infoBtn('gex') + ' <span class="badge '
      + (x.gex_usd_1pct > 0 ? 'badge-hausser' : 'badge-baissier') + '">' + escHtml(x.gex_state||'—') + '</span></span>'
      + '<span><b class="' + signCls(x.gex_usd_1pct) + '">' + fmtSigned(x.gex_usd_1pct) + '</b> / 1 %</span></div>'
      + axePrix([{ p: x.put_wall, cls: 'put', lbl: 'put' }, { p: x.zero_gamma, cls: 'zg', lbl: '0γ' },
                 { p: x.spot_deribit, cls: 'spot', lbl: 'spot' }, { p: x.call_wall, cls: 'call', lbl: 'call' }])
      + '<div class="fine">' + zg + ' · call wall ' + fmtUsd(x.call_wall) + ' · put wall ' + fmtUsd(x.put_wall)
      + ' · échéances ≤ 7 j ' + fmtSigned(x.gex_0_7j_usd_1pct) + '</div>'
      + '<div class="fine" style="opacity:.85">' + (x.num_options || '—') + ' options Deribit · ' + escHtml(x.gex_convention || '') + '</div>'
      + lectureCourte('gex', x.gex_usd_1pct) + '</div>';
  } else {
    gexHtml = '<div class="bloc"><b>GEX</b> <span class="fine">— en attente du nouveau format</span></div>';
  }
  const premCls = /NEGATIVE/.test(x.premium_state || '') ? 'badge badge-baissier'
                : /POSITIVE/.test(x.premium_state || '') ? 'badge badge-hausser' : 'badge';
  const oiTxt = isNum(x.oi_btc) ? x.oi_btc.toLocaleString('en-US',{maximumFractionDigits:0}) : '—';
  let microBody = '<div class="tuiles">'
    + tuile('Funding / 8 h', fmtNum(x.funding_rate_pct,4) + '%', fmtNum(x.funding_annual_pct,2) + '% annualisé', 'funding', lectureCourte('funding', x.funding_rate_pct))
    + tuile('Open interest', oiTxt + ' <span style="font-size:11px;font-weight:600;color:var(--ink-3)">BTC</span>',
            fmtBig(x.oi_usd) + '<div class="ligne" style="margin-top:4px"><span class="' + chipCls(oi24) + '">Δ24h ' + pctSigne(oi24) + '</span>'
            + '<span class="' + chipCls(x.oi_change_5d_pct) + '">Δ5j ' + pctSigne(x.oi_change_5d_pct) + '</span></div>', 'oi', lectureCourte('oi', oi24))
    + '</div>'
    + '<div class="bloc"><div class="bloc-titre"><span class="lbl">Comptes long / short' + infoBtn('ls') + '</span>'
    + '<span class="fine">L/S&nbsp;<b style="color:var(--ink-1)">' + fmtNum(x.ls_ratio,4) + '</b></span></div>'
    + splitHtml(x.long_pct, x.short_pct, 'Long&nbsp;<b>' + fmtNum(x.long_pct,1) + '%</b>', 'Short&nbsp;<b>' + fmtNum(x.short_pct,1) + '%</b>')
    + '<div class="ligne" style="margin-top:7px"><span class="chip">Top traders ' + fmtNum(x.top_ls_ratio,4) + infoBtn('top_ls') + '</span>'
    + '<span class="chip">Taker B/S ' + fmtNum(x.taker_ratio,4) + infoBtn('taker') + '</span></div>' + lectureCourte('ls', x.ls_ratio) + '</div>'
    + '<div class="bloc"><div class="bloc-titre"><span class="lbl">CVD spot' + infoBtn('cvd') + '</span><span class="fine">achats − ventes au taker</span></div>'
    + cvdHtml + lectureCourte('cvd', x.cvd_24h_usd) + '</div>'
    + gexHtml
    + '<div class="bloc"><div class="ligne"><span class="lbl">Prime Coinbase' + infoBtn('prime') + '</span><b>' + fmtNum(x.premium_pct,4) + '%</b>'
    + '<span class="' + premCls + '"' + (premCls === 'badge' ? ' style="background:var(--rail);color:var(--ink-2)"' : '') + '>' + escHtml(x.premium_state||'—') + '</span>'
    + '<span class="fine">' + (x.us_demand ? 'demande US ✓' : 'pas de demande US') + '</span></div>'
    // Hors USDT (publish.py ≥ 4.0) : des dollars contre des dollars. La prime usuelle contient
    // l'écart USDT/USD — mesuré le 06/10/2026, il en expliquait la totalité.
    + (isNum(x.premium_hors_usdt_pct) ? '<div class="fine" style="margin-top:4px">hors USDT <b style="color:var(--ink-1)">' + pctSigne(x.premium_hors_usdt_pct, 4)
      + '</b> · USDT = ' + fmtNum(x.usdt_usd, 5) + ' $</div>' : '')
    + lectureCourte('prime', x.premium_pct, x.premium_hors_usdt_pct) + '</div>';
  // Débutant : « Achats et ventes » — une phrase qui porte la valeur (l'écart des achats et des
  // ventes immédiats sur 24 h) ; le reste est en Expert.
  html += mCard('📡', modes('Microstructure', btcTitre('Achats et ventes')), modes('Binance Futures · Deribit · Coinbase', 'Binance, 24 h · ' + ilYaDeb(d.updated, ageMin)), '',
    envExpert(microBody) + (isNum(x.cvd_24h_usd) ? phraseCarte('cvd', x.cvd_24h_usd) : envDebutant('<div class="fine">En attente de la prochaine publication.</div>')));

  // ── 5. LIQUIDITÉ ──
  // En BTC réels, lus dans le carnet à la publication. L'ancien format sommait des scores
  // d'intensité de heatmap (sans unité) et les présentait comme une « profondeur cumulée ».
  let liqBody;
  if (lq.unit === 'BTC') {
    // Bandes : celles que le SERVEUR a publiées (clés de `bandes`) ; la bande affichée en tête
    // est la référence publiée, ou celle choisie dans les réglages PARMI les publiées. Les
    // bandes « perso » se calculent sur le profil publié, à la tranche près, et le disent.
    const bandes = lq.bandes || {}, RC = REGLAGES.carnet;
    const cle = (RC.bande !== null && bandes[String(RC.bande)]) ? String(RC.bande) : String(lq.bande_ref_pct);
    const bt = bandes[cle] || { ratio: lq.ratio_bid_ask, bid_btc: lq.total_bid, ask_btc: lq.total_ask };
    const autres = Object.keys(bandes).sort((a, b) => a - b)
      .map(k => '±' + k + ' % : ' + fmtNum(bandes[k].ratio,2)).join(' · ');
    const perso = RC.bandesPerso.map(b => [b, bandeProfil(lq, b)]).filter(([, r]) => r)
      .map(([b, r]) => '±' + b + ' % ≈ ' + fmtNum(r.ratio,2)).join(' · ');
    liqBody = '<div class="bloc-titre"><span class="lbl">Carnet ±' + cle + ' %' + infoBtn('carnet') + '</span>'
      + '<span class="fine">Ratio <b>bid/ask</b> ±' + cle + ' % : <b class="' + (bt.ratio>1?'stat-pos':'stat-neg') + '">'
      + fmtNum(bt.ratio,2) + '</b></span></div>'
      + splitHtml(bt.bid_btc, bt.ask_btc, 'Bids&nbsp;<b>' + fmtNum(bt.bid_btc,1) + ' BTC</b>', 'Asks&nbsp;<b>' + fmtNum(bt.ask_btc,1) + ' BTC</b>')
      + '<div class="fine" style="margin-top:4px">' + autres + ' · carnet vu jusqu\'à ±' + fmtNum(lq.couverture_pct,2) + ' %</div>'
      + (perso ? '<div class="fine">Sur le profil publié (à ' + lq.wall_bin_usd + ' $ près) : ' + perso + '</div>' : '')
      + lectureCourte('carnet', bt.ratio)
      // La tranche est LUE dans le fichier (`wall_bin_usd`) ; absente, on ne l'invente pas.
      + '<div class="bloc"><div class="bloc-titre"><span class="lbl">Murs' + infoBtn('murs') + '</span><span class="fine">BTC posés par tranche de '
      + (isNum(lq.wall_bin_usd) ? (lq.wall_bin_usd * (Array.isArray(lq.profil_bids) ? RC.trancheX : 1)) + ' $' : '(tranche non publiée)') + '</span></div>'
      + ladderHtml(mursFusionnes(lq, 'ask', Array.isArray(lq.profil_asks) ? RC.trancheX : 1, RC.murs, RC.murMin),
                   mursFusionnes(lq, 'bid', Array.isArray(lq.profil_bids) ? RC.trancheX : 1, RC.murs, RC.murMin), lq.mid) + '</div>'
      + '<div class="fine" style="margin-top:8px">Instantané du carnet à la publication — un mur peut être retiré à tout moment.</div>';
  } else {
    liqBody = '<div class="fine">Format ancien (scores d\'intensité sans unité) — en attente de la prochaine publication.</div>';
  }
  // Débutant : « Ordres en attente » — la barre achat / vente près du prix, une phrase, et ce que
  // vaut une photo du carnet.
  let liqDeb = '<div class="fine">En attente de la prochaine publication.</div>';
  if (lq.unit === 'BTC') {
    const bandes = lq.bandes || {}, RC = REGLAGES.carnet;
    const cle = (RC.bande !== null && bandes[String(RC.bande)]) ? String(RC.bande) : String(lq.bande_ref_pct);
    const bt = bandes[cle] || { ratio: lq.ratio_bid_ask, bid_btc: lq.total_bid, ask_btc: lq.total_ask };
    liqDeb = splitHtml(bt.bid_btc, bt.ask_btc, 'À l’achat&nbsp;<b>' + btcDeb(bt.bid_btc) + '</b>', 'À la vente&nbsp;<b>' + btcDeb(bt.ask_btc) + '</b>')
      + lectureCourte('carnet', bt.ratio)
      + '<div class="fine" style="margin-top:6px">Une photo : ces ordres peuvent être retirés à tout moment.</div>';
  }
  html += mCard('💧', modes('Liquidité', btcTitre('Ordres en attente')), modes('Carnet Binance spot · BTC posés', 'Binance, près du prix · relevés ' + ilYaDeb(d.updated, ageMin)), '',
    envExpert(liqBody) + envDebutant(liqDeb));

  // ── 6. ÉTAT DU FLUX ──
  const nOk = Object.values(st).filter(v => v === 'ok').length, nTot = Object.keys(st).length || 8;
  const errs = d.errors || [];
  const NOMS_BLOCS = { btc_spot: 'Spot', indicators: 'Indicateurs', macro: 'Macro', micro_futures: 'Futures',
                       cvd: 'CVD', gex: 'GEX', premium: 'Prime', liquidity: 'Carnet' };
  let stBody = '<div class="hero"><span class="hero-val ' + (errs.length ? 'stat-neg' : '') + '" style="font-size:19px">'
    + nOk + '/' + nTot + ' blocs live</span></div>'
    + '<div class="etats">' + Object.entries(st).map(([k, v]) => '<span class="etat' + (v === 'ok' ? '' : ' ko') + '" title="'
      + escHtml(k + ' : ' + v) + '">' + (v === 'ok' ? '✓ ' : '✗ ') + escHtml(NOMS_BLOCS[k] || k) + '</span>').join('') + '</div>'
    + (errs.length ? '<div class="stat-neg" style="margin-top:8px;font-size:11px">' + errs.map(escHtml).join('<br>') + '</div>' : '')
    + '<div class="fine" style="margin-top:8px">' + escHtml(d.generator||'') + '<br>Sources : ' + escHtml(d.source||'—') + '</div>';
  html += mCard('🔌', modes('Flux', 'Sources'), modes('Pas d\'erreur silencieuse', 'État de la publication'), '',
    envExpert(stBody) + envDebutant('<div class="hero"><span class="hero-val' + (nOk < nTot ? ' stat-neg' : '') + '" style="font-size:19px">' + nOk + '/' + nTot + ' sources à jour</span></div>')
    + phraseCarte('sources', nOk, nTot));

  // ── 7. HORLOGES ── chaque instant que la page affiche, son âge (js/horloges.js)
  html += mCard('⏱', modes('Horloges', 'Heures des données'), modes('Chaque instant affiché, son âge · UTC', 'Publication ' + ilYaDeb(d.updated, ageMin) + ' · prix en direct.'), '',
    envExpert(horlogesHtml(d)) + envDebutant('<div class="fine">Les infos du marché sont publiées toutes les ' + CADENCES.attendue_min + ' min ; le prix en haut de l’écran est relu chaque seconde.</div>'));
  // ── 8. CONTRE-EXPERTISE ── la publication recalculée ici (js/contre-expertise.js)
  html += mCard('🔎', modes('Contre-expertise', 'Vérification'), modes('Vérifié par ton navigateur · Binance spot', 'Recalculé par le navigateur'), contreDroite(d), contreCorps(d));
  carteEntree = false;
  if (container.dataset) container.dataset.vu = '1';

  // Le bandeau d'âge voyage AVEC les cartes : il apparaît donc dans le conteneur
  // réellement affiché, quel qu'il soit.
  container.innerHTML = ageBannerHtml(d)
    + (autrePaire ? envDebutant('<div class="deb-btc">Ces infos parlent du bitcoin (en dollars), pas de ' + escHtml(NOMS_PAIRES[activeSymbol] || activeSymbol) + '.</div>') : '') + html;
  brancherContre(container);
}

// ═══ CHRONIQUE (traces des chiffres clés, courbe des fiches) ══════════════════════
// L'historique vient de js/chronique.js : publications relues à /master~N/ (même hôte que
// DATA_URL), puis chaque lecture vivante. Suivis : les chiffres clés de l'en-tête et le champ
// de chaque fiche (un champ par TF se lit sur le 4h). Rendu à l'arrivée d'une donnée seulement.
const CHRONIQUE_KPIS = ['tf.4h.rsi_14', 'micro.funding_annual_pct', 'micro.oi_change_24h_pct', 'micro.cvd_24h_usd',
  'micro.gex_usd_1pct', 'micro.ls_ratio', 'macro.dxy_spot', 'macro.vix'];
const cheminFiche = champ => champ.replace('.*.', '.4h.');
const chronique = (function () {
  let st = null;
  try { st = localStorage; } catch (e) { /* stockage refusé : la chronique vit en mémoire */ }
  const fiches = typeof FICHES !== 'undefined' ? Object.values(FICHES).filter(f => f.champ).map(f => cheminFiche(f.champ)) : [];
  return Chronique.creer({ url: DATA_URL, stockage: st, fetch: u => fetch(u), chemins: [...new Set(CHRONIQUE_KPIS.concat(fiches))] });
})();
/** L'entrée de meta.champs d'un chemin suivi (« tf.4h.x » se décrit sous « tf.*.x »). */
function metaChronique(chemin) {
  const c = marketData && marketData.meta && marketData.meta.champs;
  return c ? c[chemin] || c[chemin.replace(/^tf\.[^.]+\./, 'tf.*.')] || null : null;
}
const fmtChronique = v => typeof fmtValF === 'function' ? fmtValF(v) : String(v);
function traceKpi(chemin) {
  return chemin ? chronique.trace(chemin, { l: 36, h: 10, classe: 'chron-spark', meta: metaChronique(chemin), fmt: fmtChronique }) : '';
}
/** Le résumé de la trace en infobulle du chiffre clé : lisible même quand la trace a cédé sa
 *  place (ajusterKpis). */
function titreKpi(chemin) {
  const r = chemin ? chronique.resume(chemin, { meta: metaChronique(chemin), fmt: fmtChronique }) : '';
  return r ? ' title="' + escHtml(r).replace(/"/g, '&quot;') + '"' : '';
}
/** La courbe d'une fiche (js/fiches.js) : trous hachurés, résumé lisible sous la courbe. */
function chroniqueFiche(champ, id) {
  const chemin = cheminFiche(champ), o = { l: 300, h: 56, classe: 'chron-fiche', hachures: true, etire: true, id, meta: metaChronique(chemin), fmt: fmtChronique };
  const svg = chronique.trace(chemin, o);
  if (!svg) return '';
  return '<div class="fiche-chronique"><div class="fiche-chronique-tete">Dernières heures de publications'
    + (chemin !== champ ? ' · 4h' : '') + '</div>' + svg + '<div class="fiche-chronique-pied">' + escHtml(chronique.resume(chemin, o)) + '</div></div>';
}
let chroniqueLancee = false;
/** Une fois par session, après le premier écran, onglet visible : la marche dans git. */
function lancerChronique() {
  if (chroniqueLancee || document.hidden) return;
  chroniqueLancee = true;
  chronique.parcourir().then(() => { if (marketData) renderCycle(marketData); majHorloges(); });
}

// ═══ HORLOGES (carte) ═══════════════════════════════════════════════════════════
// La liste vient de js/horloges.js (meta.champs `horodatage` + horloges de la page). Les âges
// avancent sans refaire la carte : majHorloges() réécrit les [data-horloge-t] / [data-horloge-src]
// au rythme du prix (même image que l'horloge de la barre), et ne refait le bloc « page » que
// si l'état d'une source change (panne, retour, écart d'horloge).
const FMT_UTC = t => new Date(t).toISOString().slice(11, 19);
function horlogesPageHtml() {
  const lignes = Horloges.dePage({ marche: marketData, chaleur: histHeatmap, cadenceMesureeMs: chronique.cadence() }), t = Horloges.maintenant();
  const ecart = Horloges.texteEcart();
  return (ecart ? '<div class="horloge-ecart">' + escHtml(ecart) + '</div>' : '')
    + lignes.map(l => '<div class="horloge-ligne' + (l.classe ? ' ko' : '') + '"><span class="h-nom">' + escHtml(l.libelle) + '</span>'
      + '<span class="h-quand">' + (l.t ? FMT_UTC(l.t) : '—') + '</span>'
      + '<span class="h-age" data-horloge-t="' + (l.t || '') + '">' + Horloges.texteAge(l.t ? t - l.t : null) + '</span>'
      + (l.classe ? '<span class="h-panne">' + escHtml(l.panne) + '</span>' : '')
      + (l.seuil ? '<span class="h-seuil">' + escHtml(l.seuil) + '</span>' : '') + '</div>').join('');
}
function horlogesHtml(d) {
  const t = Horloges.maintenant();
  const fichier = Horloges.duFichier(d).map(l => '<div class="horloge-ligne"><span class="h-nom">' + escHtml(l.libelle)
    // Une date seule (dxy_date) se montre telle quelle : « 00:00:00 » inventerait une heure.
    + '</span><span class="h-quand">' + (l.t && !/^\d{4}-\d\d-\d\d$/.test(l.valeur) ? FMT_UTC(l.t) : escHtml(String(l.valeur))) + '</span>'
    + '<span class="h-age" data-horloge-t="' + (l.t || '') + '">' + Horloges.texteAge(l.t ? t - l.t : null) + '</span>'
    + '<span class="h-src">' + escHtml(l.source || '') + '</span></div>').join('');
  return '<div class="bloc-titre"><span class="lbl">Cette page</span><span class="fine">dernier succès · panne nommée</span></div>'
    + '<div class="horloges-page">' + horlogesPageHtml() + '</div>'
    + '<div class="bloc-titre" style="margin-top:10px"><span class="lbl">Le fichier publié</span><span class="fine">champs « horodatage » de meta.champs</span></div>'
    + (fichier || '<div class="fine">format antérieur : aucun horodatage décrit</div>');
}
let sigHorloges = '';
function majHorloges() {
  if (!document.querySelectorAll) return;
  const sig = Object.entries(Horloges.sources).map(([k, s]) => k + (s.ok ? 1 : 0) + (s.classe || '')).join() + Horloges.texteEcart()
    + (marketData && marketData.updated) + (histHeatmap && histHeatmap.updated) + chronique.cadence();
  if (sig !== sigHorloges) {
    sigHorloges = sig;
    for (const el of document.querySelectorAll('.horloges-page')) el.innerHTML = horlogesPageHtml();
    return;
  }
  const t = Horloges.maintenant();
  for (const el of document.querySelectorAll('[data-horloge-t]')) {
    const v = el.getAttribute('data-horloge-t'), x = Horloges.texteAge(v ? t - +v : null);
    if (el.textContent !== x) el.textContent = x;
  }
}

// ═══ CONTRE-EXPERTISE (carte) ═══════════════════════════════════════════════════
// Lancée quand la carte est À L'ÉCRAN (IntersectionObserver) et l'onglet visible, UNE fois par
// publication (clé : updated) ; jamais au tour de 60 s. Le résultat survit aux rendus des cartes.
const contre = { res: null, pour: null, a: 0, enCours: null, attente: false };
const ETATS_CONTRE = { ok: ['✓', 'retrouvé'], approx: ['≈', 'cohérent'], diff: ['✗', 'différent'], source: ['✗', 'source différente'],
  ancien: ['–', 'format antérieur'], injoignable: ['!', 'injoignable'] };
function contreDroite(d) {
  if (!d || contre.pour !== d.updated || !contre.res) return '';
  const c = contre.res.comptes || {};
  return '<span class="contre-compte' + (c.diff ? ' ko' : '') + '">' + modes((c.ok || 0) + ' ✓ · ' + (c.approx || 0) + ' ≈ · ' + (c.diff || 0) + ' ✗',
    (c.ok || 0) + ' identiques · ' + (c.approx || 0) + ' proches · ' + (c.diff || 0) + ' différents') + '</span>';
}
function valeurContre(v) {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'number') return v.toLocaleString('fr-FR', { maximumFractionDigits: Math.abs(v) >= 1000 ? 2 : 4 });
  return escHtml(String(v));
}
function contreCorps(d) {
  if (!d) return '';
  return envDebutant('<div class="fine">Le navigateur recalcule les chiffres publiés : détail en mode Expert.</div>') + envExpert(contreCorpsExpert(d));
}
function contreCorpsExpert(d) {
  const pub = Date.parse(d.updated), hm = isFinite(pub) ? new Date(pub).toISOString().slice(11, 16) + ' UTC' : '—';
  if (contre.pour !== d.updated || !contre.res) {
    return '<div class="age-banner verif" style="display:block">publication ' + hm + ' · ' + (contre.enCours === d.updated ? 'vérification en cours…' : 'pas encore vérifiée') + '</div>'
      + '<div class="fine">Recalculée ici depuis Binance quand cette carte est à l’écran, une fois par publication.</div>';
  }
  const r = contre.res;
  let html = '<div class="age-banner verif" style="display:block">publication ' + hm + ' · vérifiée à ' + FMT_UTC(contre.a)
    + ' UTC (<span data-horloge-t="' + contre.a + '">' + Horloges.texteAge(Horloges.maintenant() - contre.a) + '</span>)</div>';
  if (r.note) html += '<div class="fine">' + escHtml(r.note) + '</div>';
  const groupes = new Map();
  for (const l of r.lignes) { if (!groupes.has(l.groupe)) groupes.set(l.groupe, []); groupes.get(l.groupe).push(l); }
  for (const [g, ls] of groupes) {
    const n = e => ls.filter(l => l.etat === e).length, ko = n('diff') + n('source') + n('injoignable');
    html += '<details class="contre-groupe"' + (ko ? ' open' : '') + '><summary><b>' + escHtml(g) + '</b> <span class="fine">'
      + [['ok', '✓'], ['approx', '≈'], ['diff', '✗'], ['source', '✗'], ['ancien', '–'], ['injoignable', '!']].filter(([e]) => n(e)).map(([e, s]) => n(e) + ' ' + s).join(' · ')
      + '</span></summary>'
      + ls.map(l => {
        const [sym, mot] = ETATS_CONTRE[l.etat] || ['?', l.etat];
        const valeurs = l.etat === 'diff' || l.etat === 'source'
          ? ' publié ' + valeurContre(l.publie) + ' · recalculé ' + valeurContre(l.recalcule) + (l.recalculeHaut !== undefined ? ' – ' + valeurContre(l.recalculeHaut) : '')
          : l.etat === 'approx' && l.recalculeHaut !== undefined ? ' ' + valeurContre(l.publie) + ' dans [' + valeurContre(l.recalcule) + ' ; ' + valeurContre(l.recalculeHaut) + ']'
          : l.etat === 'ok' ? ' ' + valeurContre(l.publie) : '';
        return '<div class="contre-ligne e-' + l.etat + '" title="' + escHtml(l.borne || '') + '"><span class="c-etat">' + sym + '</span>'
          + '<span class="c-nom">' + escHtml(l.libelle) + (l.nature ? ' <i class="c-nature">' + escHtml(l.nature) + '</i>' : '') + '</span>'
          + '<span class="c-val">' + mot + valeurs + '</span>'
          + (l.borne && l.etat === 'approx' ? '<span class="c-note">' + escHtml(l.borne) + '</span>' : '')
          + (l.note ? '<span class="c-note">' + escHtml(l.note) + '</span>' : '') + '</div>';
      }).join('') + '</details>';
  }
  if (r.non && r.non.length) {
    const par = new Map();
    for (const x of r.non) { if (!par.has(x.raison)) par.set(x.raison, []); par.get(x.raison).push(x); }
    html += '<details class="contre-groupe"><summary><b>Non vérifiable ici</b> <span class="fine">' + r.non.length + ' champs</span></summary>'
      + [...par].map(([raison, xs]) => '<div class="contre-raison"><span class="c-note">' + escHtml(raison) + '</span> '
        + xs.map(x => escHtml(x.libelle) + ' <i class="c-nature">' + escHtml(x.nature) + '</i>').join(' · ') + '</div>').join('') + '</details>';
  }
  return html;
}
function majCartesContre() {
  if (!document.querySelectorAll) return;
  for (const el of document.querySelectorAll('.carte-contre .demon-body')) el.innerHTML = contreCorps(marketData);
  for (const el of document.querySelectorAll('.carte-contre .demon-header')) {
    const droite = contreDroite(marketData);
    let s = el.querySelector('.demon-right');
    if (!s && droite) { s = document.createElement('span'); s.className = 'demon-right'; el.appendChild(s); }
    if (s) s.innerHTML = droite;
  }
}
async function lancerContre() {
  const d = marketData;
  if (!d || contre.enCours === d.updated || contre.pour === d.updated) return;
  if (document.hidden) { contre.attente = true; return; }    // relancée au retour de l'onglet
  contre.attente = false; contre.enCours = d.updated;
  majCartesContre();
  const res = await ContreExpertise.lancer(d, API_BINANCE, { calcRSI, calcEMA, calcATR }, (u, o) => fetch(u, o), Horloges.classer);
  contre.enCours = null;
  if (marketData !== d) return;          // une autre publication est arrivée entre-temps
  contre.res = res; contre.pour = d.updated; contre.a = Date.now();
  majCartesContre();
}
let contreObs = null;
function brancherContre(container) {
  if (!marketData || contre.pour === marketData.updated || typeof IntersectionObserver === 'undefined' || !container.querySelector) return;
  if (!container.querySelector('.carte-contre')) return;
  if (!contreObs) contreObs = new IntersectionObserver(es => { if (es.some(e => e.isIntersecting)) { contreObs.disconnect(); lancerContre(); } });
  else contreObs.disconnect();          // les cartes des rendus précédents sont détachées
  for (const el of document.querySelectorAll('.carte-contre')) contreObs.observe(el);
}

// ============ STRATEGY PANEL ============
let forwardRunning = false;
let forwardInterval = null;

function toggleStratPanel() {
  const section = document.getElementById('stratSection');
  section.classList.toggle('collapsed');
  // After transition, resize canvas
  setTimeout(() => { resizeCanvas(); drawChart(); renderStratHelp(); }, 350);
}

function onStratChange() {
  btActiveStrategy = document.getElementById('stratSelect').value;
  btUserParams = {};
  buildStratParamUI();
  onStratParamChange();
}

function onStratParamChange() {
  const stratKey = document.getElementById('stratSelect').value;
  const strat = STRATEGIES[stratKey];
  if (!strat) return;
  btUserParams = {};
  for (const [k, def] of Object.entries(strat.params)) {
    const el = document.getElementById('sp_' + k);
    if (el) {
      const raw = el.value;
      btUserParams[k] = (raw === '' || raw === null) ? 0 : (parseFloat(raw) || def.value);
    }
  }
  btCapital = parseFloat(document.getElementById('stratCapital').value) || ST_DEFAULT_CAPITAL;
  // Clear old results when params change
  btResult = null;
}

// Le select des stratégies vient du REGISTRE : une stratégie enregistrée est sélectionnable,
// sans risque d'oubli (sr_grid était implémentée et auditée depuis le 11/09, mais absente du
// select codé en dur — elle était donc inatteignable).
function fillStrategySelect() {
  const sel = document.getElementById('stratSelect');
  if (!sel) return;
  sel.innerHTML = Object.entries(STRATEGIES)
    .map(([k, s]) => '<option value="' + k + '">' + s.label + '</option>').join('');
  sel.value = btActiveStrategy;
}

// Ce que la grille FERAIT si le signal tombait sur la dernière bougie : bornes, pas, état du
// signal. C'est la réponse à « pourquoi le backtest ne fait rien ? » — la plupart des grilles
// n'entrent QUE sur un signal, donc rien ne se passe tant qu'il n'est pas armé.
function previewGrid() {
  if (!candles || candles.length < 60) return null;
  const strat = STRATEGIES[btActiveStrategy];
  if (!strat || !strat.generateLevels) return null;
  const idx = candles.length - 1;
  const bot = new GridBot(btActiveStrategy, btCapital);
  const params = bot.buildParams(btUserParams);
  const ind = bot.computeIndicators(candles, idx, params);
  let levels;
  try { levels = strat.generateLevels(candles, idx, params, ind) || []; }
  catch (e) { return null; }
  if (levels.length < 2) return null;
  return {
    lo: levels[0].price, hi: levels[levels.length - 1].price, n: levels.length,
    step: levels[1].price - levels[0].price,
    manual: params.priceLow > 0 || params.priceHigh > 0,
    signal: strat.trigger(candles, idx, params, ind),
  };
}

function renderStratHelp() {
  const el = document.getElementById('stratHelp');
  const strat = STRATEGIES[btActiveStrategy];
  if (!el || !strat) return;
  let html = '<b>' + strat.label + '</b> — ' + (STRAT_DESC[btActiveStrategy] || '');
  const p = previewGrid();
  if (!p) {
    html += '<div class="strat-auto">Aperçu de la grille : en attente des bougies…</div>';
  } else {
    const f = v => '$' + v.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
    const sig = p.signal === 'enter' ? '<span class="stat-pos">signal armé</span>'
      : p.signal === 'exit' ? '<span class="stat-neg">signal de sortie</span>'
      : p.signal === 'idle' ? 'signal pas encore armé' : 'pas de signal sur cette bougie';
    const tp = (btUserParams.tpPct !== undefined) ? btUserParams.tpPct : strat.params.tpPct.value;
    const sl = (btUserParams.slPct !== undefined) ? btUserParams.slPct : strat.params.slPct.value;
    html += '<div class="strat-auto">' + (p.manual ? 'Bornes saisies à la main' : 'Auto') + ' : '
      + f(p.lo) + ' → ' + f(p.hi) + ' · ' + p.n + ' niveaux · pas de ' + f(p.step)
      + ' · TP +' + tp + ' % / SL −' + sl + ' % · ' + sig + '</div>';
  }
  el.innerHTML = html;
}

function buildStratParamUI() {
  const stratKey = document.getElementById('stratSelect').value;
  const strat = STRATEGIES[stratKey];
  if (!strat) return;
  const container = document.getElementById('stratParams');
  const isAdvanced = container.classList.contains('advanced');
  let html = '';
  for (const [k, def] of Object.entries(strat.params)) {
    // In simple mode, skip advanced params
    if (!isAdvanced && def.advanced) continue;
    const val = btUserParams[k] !== undefined ? btUserParams[k] : def.value;
    const isAutoField = (k === 'priceLow' || k === 'priceHigh') && (!val || val <= 0);
    const autoClass = isAutoField ? ' auto-mode' : '';
    const placeholder = isAutoField ? ' placeholder="Auto"' : '';
    html += '<div class="strat-row">';
    // `hint` explique le « 0 = auto » (défini par gridParams) : sans lui, un champ grisé
    // « Auto » ne dit pas QUELLE borne la stratégie va choisir.
    html += '<label title="' + (def.hint || def.label || k) + '">' + (def.label || k) + (def.advanced ? ' *' : '') + '</label>';
    html += '<input type="number" id="sp_' + k + '" value="' + (isAutoField ? '' : val) + '" min="' + def.min + '" max="' + def.max + '" step="' + (def.step || 1) + '" onchange="onStratParamChange()" style="width:60px" class="' + autoClass + '"' + placeholder + '>';
    html += '</div>';
  }
  container.innerHTML = html;
  renderStratHelp();
}

function getDateRangeIndices() {
  const fromEl = document.getElementById('stratDateFrom');
  const toEl = document.getElementById('stratDateTo');
  let startIdx = -1, endIdx = -1;
  if (fromEl && fromEl.value) {
    const fromTs = new Date(fromEl.value).getTime() / 1000;
    for (let i = 0; i < candles.length; i++) {
      if (candles[i].time >= fromTs) { startIdx = i; break; }
    }
  }
  if (toEl && toEl.value) {
    const toTs = new Date(toEl.value).getTime() / 1000;
    for (let i = candles.length - 1; i >= 0; i--) {
      if (candles[i].time <= toTs) { endIdx = i; break; }
    }
  }
  return { startIdx, endIdx };
}

function onBacktestClick() {
  const range = getDateRangeIndices();
  let vs, ve;
  if (range.startIdx >= 0 && range.endIdx >= 0) {
    vs = range.startIdx;
    ve = range.endIdx;
  } else {
    vs = Math.max(0, viewStart);
    ve = Math.min(candles.length - 1, viewEnd);
  }
  const result = runBacktest(btActiveStrategy, candles, vs, ve, btUserParams, btCapital);
  if (result && !result.error) {
    showStratStats(result);
    drawChart();
  }
}

function onFullBacktestClick() {
  const result = runFullBacktest();
  if (result && !result.error) {
    showStratStats(result);
  }
}

function onForwardClick() {
  if (forwardRunning) {
    stopForward();
    return;
  }
  startForward();
}

function startForward() {
  if (!btResult) {
    // Run a backtest first to initialize
    const result = runFullBacktest();
    if (result.error) return;
  }
  forwardRunning = true;
  const btn = document.getElementById('stratFwdBtn');
  btn.textContent = '🟢 Forward (arrêter)';
  btn.classList.add('forward');

  // Track the last candle index processed
  let lastProcessedIdx = btResult ? btResult.endIdx : candles.length - 1;

  // L'ancienne boucle exigeait à la fois `candles.length <= dernier + 1` et `> dernier + 1` :
  // son corps ne s'exécutait JAMAIS (et sans bot il aurait planté). Le forward ne jouait rien.
  forwardInterval = setInterval(() => {
    if (!btBot) return;
    // Seules les bougies CLOSES sont jouées : la dernière est en cours.
    const lastClosed = candles.length - 2;
    if (lastClosed <= lastProcessedIdx) return;
    const params = btBot.buildParams(btUserParams);
    for (let i = lastProcessedIdx + 1; i <= lastClosed; i++) {
      btBot.step(candles, i, params, btBot.computeIndicators(candles, i, params));
    }
    lastProcessedIdx = lastClosed;
    if (btResult) {
      const markPrice = candles[lastClosed].close;
      btResult.equityCurve.push({
        idx: lastClosed,
        total: btBot.equity(markPrice),
        realized: btBot.realizedPnl(),
        unrealized: btBot.equity(markPrice) - btCapital - btBot.realizedPnl()
      });
      btResult.trades = [...btBot.trades];
      btResult.totalPnl = btBot.realizedPnl();
      btResult.totalReturn = (btResult.totalPnl / btCapital) * 100;
      btResult.tradeCount = btBot.trades.length;
    }
    drawChart();
    updateForwardStats();
  }, CADENCES.bougies);   // au rythme où les bougies arrivent : rien de neuf entre deux lectures
}

function stopForward() {
  forwardRunning = false;
  if (forwardInterval) { clearInterval(forwardInterval); forwardInterval = null; }
  const btn = document.getElementById('stratFwdBtn');
  btn.textContent = '🔴 Forward Test';
  btn.classList.remove('forward');
}

function updateForwardStats() {
  if (!btResult) return;
  const div = document.getElementById('stratStats');
  div.style.display = 'block';
  const pnlStr = btResult.totalPnl >= 0 ? '+' + btResult.totalPnl.toFixed(2) : btResult.totalPnl.toFixed(2);
  div.innerHTML =
    '<div>🔄 <b>Forward</b> | Trades: <span class="stat-val">' + btResult.tradeCount + '</span></div>' +
    '<div>P&L live: <span class="' + (btResult.totalPnl >= 0 ? 'stat-pos' : 'stat-neg') + '">' + pnlStr + ' USDT</span></div>' +
    '<div>Return: <span class="' + (btResult.totalReturn >= 0 ? 'stat-pos' : 'stat-neg') + '">' + btResult.totalReturn.toFixed(2) + '%</span></div>';
}

// Durée d'une bougie en minutes : traduit la fenêtre testée en « 8 h » / « 3,2 j ».
const INTERVAL_MIN = { '1m': 1, '5m': 5, '15m': 15, '1h': 60, '4h': 240, '1d': 1440 };

function showStratStats(result) {
  const div = document.getElementById('stratStats');
  div.style.display = 'block';
  const pnlStr = (result.totalPnl >= 0 ? '+' : '') + result.totalPnl.toFixed(2);
  // Verdict : le seul juge qui compte est « garder le BTC » sur la MÊME période. Une grille qui
  // gagne 0,40 % quand le BTC fait 3 % a perdu du terrain, malgré un P&L positif.
  const c0 = candles[result.startIdx], c1 = candles[result.endIdx];
  const hold = (c0 && c1 && c0.close) ? (c1.close - c0.close) / c0.close * 100 : null;
  const ret = result.totalReturn;
  const mins = (result.endIdx - result.startIdx + 1) * (INTERVAL_MIN[chartInterval] || 15);
  const durStr = mins >= 1440 ? (mins / 1440).toFixed(1) + ' j' : mins >= 60 ? (mins / 60).toFixed(1) + ' h' : mins + ' min';
  let html = '';
  if (hold !== null) {
    const v = (ret > 0 && ret > hold) ? ['stat-pos', '✅ gagne et bat le marché']
      : (ret > 0) ? ['stat-val', '⚠️ gagne, mais garder le BTC rapportait plus']
      : (ret > hold) ? ['stat-val', '⚠️ perd, mais moins que le marché']
      : ['stat-neg', '❌ perd alors que garder le BTC montait'];
    html += '<div class="verdict"><span class="' + v[0] + '">' + v[1] + '</span> — '
      + (ret >= 0 ? '+' : '') + ret.toFixed(2) + ' % en ' + durStr + ', BTC '
      + (hold >= 0 ? '+' : '') + hold.toFixed(2) + ' % sur la même période</div>';
  }
  html +=
    '<div>Trades: <span class="stat-val">' + result.tradeCount + '</span> | Win: <span title="Part des trades clôturés en profit" class="' + (result.winRate >= 50 ? 'stat-pos' : 'stat-neg') + '">' + result.winRate.toFixed(1) + '%</span></div>' +
    '<div>P&L: <span title="Profit ou perte en USDT, frais 0,1 % déjà déduits" class="' + (result.totalPnl >= 0 ? 'stat-pos' : 'stat-neg') + '">' + pnlStr + ' USDT</span> (' + (ret >= 0 ? '+' : '') + ret.toFixed(2) + ' %)</div>' +
    '<div>Perte max: <span title="Plus forte baisse depuis un sommet du capital (drawdown)" class="stat-neg">' + result.maxDrawdownPct.toFixed(1) + '%</span> | Sharpe: <span title="Rendement par unité de risque, annualisé. Au-delà de 1 c\'est bon ; sur une fenêtre courte il ne veut rien dire." class="stat-val">' + result.sharpe + '</span></div>' +
    '<div>Gains/pertes: <span title="Total des gains divisé par le total des pertes. Au-dessus de 1, la grille gagne." class="stat-val">' + result.profitFactor + '</span> | Gain moyen: <span title="Gain moyen par trade gagnant" class="stat-pos">' + result.avgWin.toFixed(2) + '</span> | Perte moyenne: <span title="Perte moyenne par trade perdant" class="stat-neg">' + result.avgLoss.toFixed(2) + '</span></div>';
  if (result.tradeCount < 10) html += '<div class="strat-note">' + result.tradeCount + ' trade(s) : trop peu pour conclure — visez 30, ou élargissez la période avec les champs « Du » / « Au ».</div>';
  div.innerHTML = html;
}

function onCompareDumbGrid() {
  if (!candles || candles.length < 20) return;
  const vs = Math.max(0, viewStart);
  const ve = Math.min(candles.length - 1, viewEnd);
  const taResult = runBacktest(btActiveStrategy, candles, vs, ve, btUserParams, btCapital);
  const dumbParams = { priceLow: 0, priceHigh: 0, gridLevels: btUserParams.gridLevels || 10, tpPct: btUserParams.tpPct || 0.5, slPct: btUserParams.slPct || 3 };
  const dumbResult = runBacktest('dumb_grid', candles, vs, ve, dumbParams, btCapital);

  const div = document.getElementById('stratStats');
  div.style.display = 'block';
  div.innerHTML =
    '<div style="margin-bottom:6px;color:var(--accent);font-weight:700">📊 Comparaison TA vs Grille Fixe</div>' +
    '<div><b>' + STRATEGIES[btActiveStrategy].label + '</b>: <span class="' + (taResult.totalPnl >= 0 ? 'stat-pos' : 'stat-neg') + '">' + (taResult.totalPnl >= 0 ? '+' : '') + taResult.totalPnl.toFixed(2) + ' USDT</span> (' + taResult.tradeCount + ' trades, Sharpe ' + taResult.sharpe + ')</div>' +
    '<div><b>Grille Fixe</b>: <span class="' + (dumbResult.totalPnl >= 0 ? 'stat-pos' : 'stat-neg') + '">' + (dumbResult.totalPnl >= 0 ? '+' : '') + dumbResult.totalPnl.toFixed(2) + ' USDT</span> (' + dumbResult.tradeCount + ' trades, Sharpe ' + dumbResult.sharpe + ')</div>' +
    '<div>Delta: <span class="' + ((taResult.totalPnl - dumbResult.totalPnl) >= 0 ? 'stat-pos' : 'stat-neg') + '">' + ((taResult.totalPnl - dumbResult.totalPnl) >= 0 ? '+' : '') + (taResult.totalPnl - dumbResult.totalPnl).toFixed(2) + ' USDT</span></div>';
  btResult = taResult;
  btBot = taResult.bot;
  drawChart();
}

function toggleAdvanced() {
  const container = document.getElementById('stratParams');
  const toggle = document.getElementById('advToggle');
  if (container.classList.contains('advanced')) {
    container.classList.remove('advanced');
    toggle.textContent = '⚙ Mode avancé ▸';
  } else {
    container.classList.add('advanced');
    toggle.textContent = '⚙ Mode simple ▸';
  }
  buildStratParamUI();
}

// Build initial param UI on load
setTimeout(() => { fillStrategySelect(); buildStratParamUI(); }, 100);

// ============ WALK-FORWARD ANALYSIS ============
function runWalkForward(strategyKey, candles, userParams, capital, segments) {
  segments = segments || 3;
  if (candles.length < 60) return { error: 'Pas assez de bougies (min 60)' };
  const segSize = Math.floor(candles.length / segments);
  const results = [];

  for (let s = 0; s < segments; s++) {
    const inStart = s * segSize;
    const inEnd = (s + 1) * segSize - 1;
    const outStart = inEnd + 1;
    const outEnd = Math.min(candles.length - 1, outStart + segSize - 1);

    if (outStart >= candles.length) break;

    // In-sample: optimize params (simple grid search on one param for now)
    const inSample = runBacktest(strategyKey, candles, inStart, inEnd, userParams, capital);
    // Out-sample: test with same params
    const outSample = runBacktest(strategyKey, candles, outStart, outEnd, userParams, capital);

    results.push({
      segment: s + 1,
      inSample: { startIdx: inStart, endIdx: inEnd, trades: inSample.tradeCount, return: inSample.totalReturn, sharpe: parseFloat(inSample.sharpe), maxDD: inSample.maxDrawdownPct },
      outSample: { startIdx: outStart, endIdx: outEnd, trades: outSample.tradeCount, return: outSample.totalReturn, sharpe: parseFloat(outSample.sharpe), maxDD: outSample.maxDrawdownPct }
    });
  }

  // Compute degradation ratio
  let avgInSharpe = 0, avgOutSharpe = 0;
  let count = 0;
  for (const r of results) {
    if (!isNaN(r.inSample.sharpe) && !isNaN(r.outSample.sharpe)) {
      avgInSharpe += r.inSample.sharpe;
      avgOutSharpe += r.outSample.sharpe;
      count++;
    }
  }
  avgInSharpe = count > 0 ? avgInSharpe / count : 0;
  avgOutSharpe = count > 0 ? avgOutSharpe / count : 0;
  const degradationRatio = avgInSharpe > 0 ? avgOutSharpe / avgInSharpe : 0;

  // Sensitivity: vary gridLevels ±20%
  const sensResults = [];
  if (userParams.gridLevels) {
    const base = userParams.gridLevels;
    for (const mult of [0.8, 0.9, 1.0, 1.1, 1.2]) {
      const modParams = { ...userParams, gridLevels: Math.round(base * mult) };
      const r = runBacktest(strategyKey, candles, 0, candles.length - 1, modParams, capital);
      sensResults.push({ param: 'gridLevels', value: Math.round(base * mult), return: r.totalReturn, sharpe: parseFloat(r.sharpe) });
    }
  }

  return {
    strategy: strategyKey,
    segments: results,
    degradationRatio: degradationRatio,
    sensitivity: sensResults,
    interpretation: degradationRatio < 0.5 ? '⚠️ Overfit probable (ratio < 0.5)' :
                    degradationRatio < 0.7 ? '⚠️ Faible robustesse' :
                    degradationRatio < 0.9 ? '✅ Correct' : '✅ Robuste'
  };
}

function showWalkForward() {
  if (!candles || candles.length < 60) return;
  const wf = runWalkForward(btActiveStrategy, candles, btUserParams, btCapital, 3);

  const div = document.getElementById('stratStats');
  div.style.display = 'block';
  let html = '<div style="color:var(--accent);font-weight:700;margin-bottom:6px">🔬 Walk-Forward (' + wf.segments.length + ' segments)</div>';

  for (const seg of wf.segments) {
    html += '<div style="margin-bottom:4px;font-size:10px">';
    html += '<b>S' + seg.segment + '</b> In: <span class="stat-val">' + seg.inSample.return.toFixed(2) + '%</span> (Sharpe ' + seg.inSample.sharpe.toFixed(2) + ') ';
    html += '→ Out: <span class="' + (seg.outSample.return >= 0 ? 'stat-pos' : 'stat-neg') + '">' + seg.outSample.return.toFixed(2) + '%</span> (Sharpe ' + seg.outSample.sharpe.toFixed(2) + ')';
    html += '</div>';
  }

  html += '<div style="margin-top:6px"><b>Degradation Ratio:</b> <span class="' + (wf.degradationRatio >= 0.7 ? 'stat-pos' : 'stat-neg') + '">' + wf.degradationRatio.toFixed(3) + '</span></div>';
  html += '<div style="font-size:10px;color:var(--ink-2)">' + wf.interpretation + '</div>';

  // Sensitivity
  if (wf.sensitivity && wf.sensitivity.length > 0) {
    html += '<div style="margin-top:6px;font-size:10px"><b>Sensibilité gridLevels ±20%:</b></div>';
    for (const s of wf.sensitivity) {
      html += '<span style="margin-right:8px">' + s.value + ': <span class="' + (s.return >= 0 ? 'stat-pos' : 'stat-neg') + '">' + s.return.toFixed(2) + '%</span></span>';
    }
  }

  div.innerHTML = html;
}
async function init() {
  appliquerMode(modeCourant());   // libellé du bouton ; la classe est déjà posée par index.html
  lireJetons(); jetonsLus = true;
  redessinerApresPolices();
  peindrePastilles();
  resizeCanvas();
  drawChart();             // « Chargement… » plutôt qu'un cadre vide
  // Tout part EN MÊME TEMPS : prix, bougies, publication — et les trois sont déjà en vol depuis
  // le script de tête d'index.html (prechargee). Avant, le prix était attendu avant les bougies,
  // et les bougies avant les cartes (premier dessin à 1,55 s, mesuré en local).
  const prix = fetchPrice();
  const marche = fetchMarket(true);
  await fetchKlines();
  viewStart = Math.max(0, candles.length - 50);
  viewEnd = candles.length;
  drawChart();
  // Les scénarios du matin : APRÈS le premier dessin (ils ne retardent pas le premier écran).
  fetchPrevisions();
  verreDuTheme();          // hyalite n'arrive qu'APRÈS le premier dessin, et seulement si le thème le veut
  await Promise.all([prix, marche]);
  ajusterRuban();
  document.getElementById('indicatorBar').addEventListener('scroll', ajusterRuban, { passive: true });
  // Préchargement au survol : la première page d'un historique part avant le clic.
  document.querySelectorAll('label[id^="int_"]').forEach(l =>
    l.addEventListener('pointerenter', () => precharger(activeSymbol, l.id.slice(4))));
  document.querySelectorAll('label[id^="sym_"]').forEach(l =>
    l.addEventListener('pointerenter', () => precharger(l.id.slice(4), chartInterval)));
  // Pre-fetch des TF de reference S/R : no-op si l'overlay est eteint, c'est le toggle qui declenche.
  await refreshRefSR();
  toggleDepth(overlays.liq);
  compterIndicateurs();
  titresBarre();
  // Onglet caché = aucune requête. La page restait ouverte en arrière-plan toute la journée
  // en interrogeant Binance chaque seconde ; au retour, tout est rafraîchi d'un coup.
  const visible = fn => () => { if (!document.hidden) return fn(); };
  // Cadences : js/cadences.js (une table, lue aussi par les étiquettes et les seuils d'âge).
  setInterval(visible(fetchPrice), CADENCES.prix);
  // Les bougies : redessinées seulement si la queue reçue a changé (fetchKlines).
  setInterval(visible(async () => { if (await fetchKlines()) drawChart(); }), CADENCES.bougies);
  setInterval(visible(fetchMarket), CADENCES.publication_lue);
  setInterval(visible(refreshRefSR), CADENCES.niveaux_sr);
  setInterval(visible(fetchPrevisions), CADENCES.previsions_lue);
  // Heure de Binance (poids 1) : l'écart de l'horloge de ce poste, pour des âges justes.
  const heureBinance = visible(() => Horloges.mesurer(API_BINANCE + 'time'));
  heureBinance();
  setInterval(heureBinance, CADENCES.horloge_binance);
  // L'historique des publications : une rafale unique, après que le premier écran est peint.
  setTimeout(lancerChronique, 1500);
  document.addEventListener('visibilitychange', async () => {
    if (document.hidden) return;
    if (contre.attente) lancerContre();
    lancerChronique();
    fetchPrice(); fetchMarket();
    if (overlays.liq) fetchHeatmap();
    if (!previsions || Horloges.maintenant() - previsions.luA > CADENCES.previsions_lue) fetchPrevisions();
    if (await fetchKlines()) drawChart();
  });
}
init();
