// ═══════════════════════════════════════════════════════════════════════════════
// LIAISON — ce que le terminal (index.html) et la carte (bookmap.html) se passent : un prix à
// marquer, et le thème. Un cœur PUR, chargé par les deux pages (et tel quel par les harnais
// node) : il ne lit ni n'écrit rien de lui-même, chaque page l'appelle.
//
// UN PRIX DANS L'ADRESSE — « Voir sur la carte ▸ » (bulle d'un repère du graphique) ouvre
//   bookmap.html#prix=83450 ; « Voir sur le graphique ▸ » (explication d'un repère de la carte)
//   ouvre index.html#prix=83450. Un fragment (#), pas une requête (?) : il ne part jamais au
//   serveur, et la page reste la même ressource (même cache). La carte ne montre que BTC/USDT :
//   le terminal n'offre le lien que sur BTC/USDT, et il s'ouvre toujours sur BTC/USDT.
//   Le prix lu est VALIDÉ, jamais injecté tel quel : lirePrix n'accepte que « prix= » suivi de
//   chiffres et d'au plus un point (rien d'autre dans le morceau), puis plausible exige un nombre
//   fini à moins de ECART_MAX du prix du moment, lu par la page. La page n'en garde qu'un nombre.
//
// LE THÈME DE LA CARTE — le terminal décrit son thème sous CLE_THEME : son identifiant, clair ou
//   sombre (lu dans SON registre, les <link data-theme-id data-mode> d'index.html : pas de
//   deuxième liste à tenir) et sa couleur d'accent (lue dans ses jetons, sans toucher aux feuilles
//   de thème). La carte pose cette description sur <html> avant son premier rendu, et la suit
//   quand elle change dans un autre onglet (évènement storage). Sans description : sombre.
// ═══════════════════════════════════════════════════════════════════════════════
const Liaison = (function () {
  'use strict';
  /** Écart relatif maximal entre un prix passé par l'adresse et le prix du moment. */
  const ECART_MAX = 0.1;
  const CLE_THEME = 'samsara-theme-carte';
  const MOTIF_PRIX = /^prix=(\d{1,7}(?:\.\d{1,8})?)$/;

  /** Le prix d'un fragment d'adresse (« #prix=83450 », « #prix=83450.5&… ») : un nombre > 0, ou
   *  null (absent, mal formé, trop long, signe, exposant, espace, balise… : ignoré). */
  function lirePrix(fragment) {
    if (typeof fragment !== 'string' || fragment.length > 120) return null;
    for (const morceau of fragment.replace(/^#/, '').split('&')) {
      const m = MOTIF_PRIX.exec(morceau);
      if (!m) continue;
      const p = Number(m[1]);
      return isFinite(p) && p > 0 ? p : null;
    }
    return null;
  }
  /** p est-il un prix plausible, à moins de ECART_MAX du prix du moment ref ? */
  function plausible(p, ref) {
    return typeof p === 'number' && typeof ref === 'number' && isFinite(p) && isFinite(ref) && p > 0 && ref > 0
      && Math.abs(p - ref) <= ref * ECART_MAX;
  }
  /** L'adresse de la page `page` qui marque le prix p (au centime), ou null si p n'est pas un prix. */
  function adresse(page, p) {
    if (typeof p !== 'number' || !isFinite(p) || p <= 0 || p >= 1e7) return null;
    return page + '#prix=' + String(Math.round(p * 100) / 100);
  }

  // ─── Thème ───
  const MOTIF_ID = /^[a-z0-9-]{1,40}$/, MOTIF_ACCENT = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
  /** « #0b84b0 » (ou « #0bf ») → « #0b84b0 » ; sinon null. */
  function hex6(c) {
    const s = String(c == null ? '' : c).trim(), m = MOTIF_ACCENT.exec(s);
    if (!m) return null;
    return '#' + (m[1].length === 3 ? m[1].split('').map(x => x + x).join('') : m[1]).toLowerCase();
  }
  /** La description d'un thème, à ranger sous CLE_THEME (chaîne JSON). */
  function decrireTheme(id, mode, accent) {
    return JSON.stringify({ id: String(id), mode: mode === 'sombre' ? 'sombre' : 'clair', accent: hex6(accent) });
  }
  /** La description lue (chaîne JSON) → { id, mode, accent } VALIDÉ, ou null (absente, illisible,
   *  valeur inconnue). Une couleur d'accent illisible est oubliée (null), le reste gardé. */
  function lireTheme(texte) {
    if (typeof texte !== 'string' || texte.length > 300) return null;
    let o;
    try { o = JSON.parse(texte); } catch (e) { return null; }
    if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
    if (!MOTIF_ID.test(String(o.id)) || (o.mode !== 'clair' && o.mode !== 'sombre')) return null;
    return { id: o.id, mode: o.mode, accent: hex6(o.accent) };
  }
  /** Une couleur « #rrggbb » à l'opacité a : « rgba(r, g, b, a) ». */
  function teinte(accent, a) {
    const h = hex6(accent);
    if (!h) return null;
    const n = parseInt(h.slice(1), 16);
    return 'rgba(' + (n >> 16) + ', ' + ((n >> 8) & 255) + ', ' + (n & 255) + ', ' + a + ')';
  }
  /** Pose le thème t (lireTheme) sur l'élément racine : data-theme-mode (clair | sombre), et la
   *  couleur d'accent du cadre (--accent, --accent-fond, --accent-bord). t null : tout est retiré,
   *  la feuille garde ses couleurs par défaut (sombre). */
  function poserTheme(racine, t) {
    const st = racine.style;
    if (!t) {
      racine.removeAttribute('data-theme-mode'); racine.removeAttribute('data-theme-terminal');
      for (const v of ['--accent', '--accent-fond', '--accent-bord']) st.removeProperty(v);
      return;
    }
    racine.setAttribute('data-theme-mode', t.mode);
    racine.setAttribute('data-theme-terminal', t.id);
    if (t.accent) {
      st.setProperty('--accent', t.accent);
      st.setProperty('--accent-fond', teinte(t.accent, 0.16));
      st.setProperty('--accent-bord', teinte(t.accent, 0.55));
    } else for (const v of ['--accent', '--accent-fond', '--accent-bord']) st.removeProperty(v);
  }

  return { ECART_MAX, CLE_THEME, lirePrix, plausible, adresse, decrireTheme, lireTheme, teinte, poserTheme };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Liaison;
