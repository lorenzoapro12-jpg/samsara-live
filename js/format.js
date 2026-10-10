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

  /** v avec exactement dec décimales, à la française : 86 012,50 ; −1,6. */
  function nombre(v, dec) {
    if (!fini(v)) return '—';
    const d = dec === undefined ? 0 : dec;
    const t = Math.abs(v).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }).replace(ESP, ' ');
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

  return { MOINS, nombre, decimalesPrix, decimalesLecture, prix, cote, pct, compact, signe, heure, heureSec, jour, jourHeure, memeJour, fuseau, fuseauMots };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Fmt;
