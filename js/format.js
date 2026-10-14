// ═══════════════════════════════════════════════════════════════════════════════
// FORMATS COMMUNS — un seul format de nombre, de prix, de pourcentage et d'heure sur tout le
// site (terminal et carte, tous les modes). Choix de Lorenzo (10/10/2026) :
//   • le format français partout : « 86 013 $ », « 86 012,50 $ », « +0,36 % », « 1,6 Md » ;
//     l'unité APRÈS le nombre, jamais un libellé qui commence par « $ » ;
//   • le moins typographique « − » (U+2212) partout, jamais le tiret « - » ;
//   • l'heure de l'APPAREIL partout, le fuseau dit une fois (Fmt.fuseau) — plus d'UTC caché ni
//     d'heure de Paris imposée.
// Le mode change la PRÉCISION affichée (prix arrondi en Lisible), jamais la valeur.
// Les espaces insécables d'Intl (U+00A0, U+202F) deviennent des espaces simples : un seul
// caractère à chercher dans les tests et dans les mesures de largeur.
// ═══════════════════════════════════════════════════════════════════════════════
const Fmt = (function () {
  'use strict';
  const fini = x => typeof x === 'number' && isFinite(x);
  const ESP = /[  ]/g;
  const MOINS = '−';

  // Formateurs gardés, un par nombre de décimales (revue du 14/10/2026, M16) : toLocaleString(…,
  // options) en construisait un à CHAQUE nombre (≈ 20 à 90 µs), et un dessin du graphique en écrit
  // 120 à 350. Sur un téléphone lent, le glisser saccadait. Même moteur, donc le même texte.
  const FORMATS = new Map();
  function formateur(d) {
    let f = FORMATS.get(d);
    if (!f) FORMATS.set(d, f = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }));
    return f;
  }

  /** v avec exactement dec décimales, à la française : 86 012,50 ; −1,6. */
  function nombre(v, dec) {
    if (!fini(v)) return '—';
    const d = dec === undefined ? 0 : dec;
    const t = formateur(d).format(Math.abs(v)).replace(ESP, ' ');
    return (v < 0 && Number(t.replace(/\s/g, '').replace(',', '.')) !== 0 ? MOINS : '') + t;
  }
  /** Décimales d'un PRIX selon son ordre de grandeur (cotation au centime pour BTC, 0,0001 pour XRP). */
  function decimalesPrix(v) { const a = Math.abs(v); return a >= 10 ? 2 : a >= 1 ? 4 : 6; }
  /** Décimales d'un prix ARRONDI pour la lecture rapide : pas de centimes au-delà de 1 000. */
  function decimalesLecture(v) { const a = Math.abs(v); return a >= 1000 ? 0 : a >= 10 ? 2 : a >= 1 ? 4 : 6; }
  /** « 86 013 $ » (dec absent : arrondi de lecture) ; « 86 012,50 $ » (dec = 'fin' : précision de cotation). */
  function prix(v, unite, dec) {
    if (!fini(v)) return '—';
    const d = dec === 'fin' ? decimalesPrix(v) : dec === undefined ? decimalesLecture(v) : dec;
    return nombre(v, d) + ' ' + (unite || '$');
  }
  /** Le nombre seul, à la précision de cotation (axes, réticule) : « 86 012,50 ». */
  const cote = v => nombre(v, fini(v) ? decimalesPrix(v) : 0);
  /** « +0,36 % », « −1,6 % », « 0,0 % » ; signe : false pour ne pas écrire le « + ». */
  function pct(x, dec, signe) {
    if (!fini(x)) return '—';
    const d = dec === undefined ? 1 : dec;
    const t = nombre(Math.abs(x), d), nul = Number(Math.abs(x).toFixed(d)) === 0;
    return (nul ? '' : x < 0 ? MOINS : signe === false ? '' : '+') + t + ' %';
  }
  /** Les grands nombres en abrégé, à la française : « 54,8 k », « 2,3 M », « 1,6 Md ». */
  function compact(v, dec) {
    if (!fini(v)) return '—';
    const d = dec === undefined ? 1 : dec, a = Math.abs(v);
    const [div, suf] = a >= 1e9 ? [1e9, ' Md'] : a >= 1e6 ? [1e6, ' M'] : a >= 1e3 ? [1e3, ' k'] : [1, ''];
    return nombre(v / div, div === 1 ? 0 : d) + suf;
  }
  /** Un nombre signé (« +12 », « −3,4 k ») : fn met en forme la valeur absolue. */
  function signe(v, fn) {
    if (!fini(v)) return '—';
    const t = (fn || (x => nombre(x)))(Math.abs(v));
    return (v > 0 ? '+' : v < 0 ? MOINS : '') + t;
  }

  // ─── Heures : celles de l'appareil ───
  const FMT_HM = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', hour12: false });
  const FMT_HMS = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  const FMT_JOUR = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit' });
  /** « 14:05 », à l'heure de l'appareil. */
  const heure = ms => (fini(ms) ? FMT_HM.format(new Date(ms)) : '—');
  /** « 14:05:12 », à l'heure de l'appareil. */
  const heureSec = ms => (fini(ms) ? FMT_HMS.format(new Date(ms)) : '—');
  /** « 09/10 », le jour de l'appareil. */
  const jour = ms => (fini(ms) ? FMT_JOUR.format(new Date(ms)) : '—');
  const memeJour = (a, b) => { const x = new Date(a), y = new Date(b); return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate(); };
  /** « 14:05 » le même jour que ref (maintenant par défaut), « 09/10 14:05 » sinon : jamais une heure d'hier lue comme d'aujourd'hui. */
  function jourHeure(ms, ref) {
    if (!fini(ms)) return '—';
    return memeJour(ms, fini(ref) ? ref : Date.now()) ? heure(ms) : jour(ms) + ' ' + heure(ms);
  }
  /** Le fuseau de l'appareil à l'instant ms, en écart à UTC : « UTC+2 », « UTC », « UTC−3:30 ». */
  function fuseau(ms) {
    const off = -new Date(fini(ms) ? ms : Date.now()).getTimezoneOffset();
    if (!off) return 'UTC';
    const a = Math.abs(off), h = Math.floor(a / 60), m = a % 60;
    return 'UTC' + (off > 0 ? '+' : MOINS) + h + (m ? ':' + String(m).padStart(2, '0') : '');
  }
  /** « heure de l'appareil (UTC+2) » : la mention unique du fuseau, en mots. */
  const fuseauMots = ms => 'heure de l’appareil (' + fuseau(ms) + ')';
  /** Un âge en minutes, en mots : « 47 min » jusqu'à DUREE_HEURES min, puis « 1 h 31 », « 5 h ».
   *  UNE règle pour tous les âges du site (revue du 14/10/2026, M7 : au même moment, une bulle
   *  disait « il y a 2 h », le voyant « 91 min », la pastille « 300 min » au lieu de 5 h). Le seuil
   *  vit ici et non dans PARAM (js/app.js) : horloges.js et guide.js, chargés avant, s'en servent
   *  aussi hors de la page. */
  const DUREE_HEURES = 90;
  function duree(min) {
    if (!fini(min)) return '—';
    const m = Math.max(0, Math.floor(min));
    if (m < DUREE_HEURES) return m + ' min';
    const h = Math.floor(m / 60), r = m % 60;
    return h + ' h' + (r ? ' ' + String(r).padStart(2, '0') : '');
  }

  // ─── Fins de ligne (revue du 14/10/2026, C8) ───
  // « 2 918 fois sur 5 » puis « 103. » à la ligne se lisait comme une autre statistique ; « $ »,
  // « : » ou « » » commençaient une ligne, « « » en finissait une. Les chaînes gardent leurs espaces
  // simples (voir plus haut) : on dit seulement, au moment d'écrire, où la ligne ne se coupe pas.
  const APRES_NOMBRE = /^(?:\d{3}(?!\d)|(?:BTC|ETH|SOL|XRP|USDT?|UTC|min|h|j|jours?|semaines?|k|M|Md|millions?|milliards?|pts|bp)(?![\p{L}\d]))/u;
  /** Vrai si l'espace entre les morceaux a et b (sans espace) ne doit pas couper la ligne : un nombre
   *  et ses milliers ou son unité (« 1 h 31 » aussi), « : ; ? ! » $ % » et le mot d'avant, « « » et
   *  le mot d'après. Une seule règle : les bulles du graphique (guideLignes) et le texte de la page. */
  const colle = (a, b) => /^[:;?!»$%]/.test(b) || /«$/.test(a)
    || (/\d$/.test(a) && APRES_NOMBRE.test(b)) || (a === 'h' && /^\d{2}(?!\d)/.test(b));
  const HORS_TEXTE = '.insec, svg, option, select, textarea, script, style, title';
  /** Dans le texte déjà écrit sous racine, chaque suite de morceaux que colle() lie va dans un
   *  <span class="insec"> (css/app.css : white-space: nowrap). Le texte ne change pas, caractère pour
   *  caractère (textContent identique : les tests et la recherche le lisent tel quel). Une espace en
   *  tête de nœud se lie au dernier mot du nœud d'avant (« <b>83 956</b> $ »). */
  function insecables(racine) {
    if (!racine || !racine.ownerDocument || typeof NodeFilter === 'undefined') return racine;
    const doc = racine.ownerDocument, w = doc.createTreeWalker(racine, NodeFilter.SHOW_TEXT), noeuds = [];
    for (let n = w.nextNode(); n; n = w.nextNode()) noeuds.push(n);
    let fin = '';
    for (const n of noeuds) {
      const m = n.data.match(/\S+|\s+/g) || [], avant = fin;
      fin = /\S$/.test(n.data) ? m[m.length - 1] : '';
      if (n.data.indexOf(' ') < 0 || !n.parentElement || n.parentElement.closest(HORS_TEXTE)) continue;
      // lie[k] : l'espace m[k] ne coupe pas (en tête de nœud, elle se lie au nœud d'avant).
      const lie = m.map((x, k) => x === ' ' && k + 1 < m.length && (k ? colle(m[k - 1], m[k + 1]) : !!avant && colle(avant, m[1])));
      // Un texte posé seul dans une boîte flex ou grille : un span de plus y serait une case de plus.
      if (!lie.includes(true) || /flex|grid/.test(doc.defaultView.getComputedStyle(n.parentElement).display)) continue;
      const frag = doc.createDocumentFragment();
      let k = 0, libre = '';
      while (k < m.length) {
        if (!lie[k] && !(lie[k + 1] && m[k].trim())) { libre += m[k++]; continue; }
        let j = lie[k] ? k + 1 : k;
        while (lie[j + 1]) j += 2;
        if (libre) { frag.append(libre); libre = ''; }
        const s = doc.createElement('span');
        s.className = 'insec';
        s.textContent = m.slice(k, j + 1).join('');
        frag.append(s);
        k = j + 1;
      }
      if (libre) frag.append(libre);
      n.replaceWith(frag);
    }
    return racine;
  }

  return { MOINS, nombre, decimalesPrix, decimalesLecture, prix, cote, pct, compact, signe, heure, heureSec, jour, jourHeure, memeJour, fuseau, fuseauMots, DUREE_HEURES, duree, colle, insecables };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Fmt;
