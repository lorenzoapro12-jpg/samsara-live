// Fins de ligne mal placées dans le texte d'une page (Playwright), partagé par les tests de page.
//
// Revue du 14/10/2026, C8 : on lisait « 2 918 fois sur 5 » puis « 103. » à la ligne, « 83 956 »
// puis « $, une zone de retour », « sous 30, « » puis « survendu » », « accélère-t-il » puis « ? ».
// Fmt.insecables (js/format.js) lie ces morceaux au moment d'écrire la page ; ce contrôle relit
// l'écran : lettre par lettre (Range.getClientRects), chaque passage à la ligne d'un même bloc dont
// la ligne suivante commence par « : ; ? ! » $ % », dont la ligne finit par « « », ou qui sépare un
// nombre de ses milliers ou de son unité.

/** Les fins de ligne fautives sous le sélecteur (liste vide : rien à redire). */
const coupuresLignes = (page, sel) => page.evaluate(sel => {
  const R = document.querySelector(sel);
  if (!R || !R.getClientRects().length) return [];
  const bloc = el => { let e = el; while (e && e !== R && getComputedStyle(e).display === 'inline') e = e.parentElement; return e; };
  const L = [], w = document.createTreeWalker(R, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const el = n.parentElement;
    if (!el || el.closest('script, style, svg') || !el.getClientRects().length || getComputedStyle(el).visibility === 'hidden') continue;
    const b = bloc(el);
    for (let i = 0; i < n.data.length; i++) {
      if (/\s/.test(n.data[i])) { L.push({ c: ' ', sp: true }); continue; }
      const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + 1);
      const q = r.getClientRects();
      if (q.length) L.push({ c: n.data[i], top: q[0].top, h: q[0].height, b });
    }
  }
  const out = [];
  let p = -1;
  for (let k = 0; k < L.length; k++) {
    if (L[k].sp) continue;
    const a = L[p], z = L[k];
    if (a && a.b === z.b && z.top > a.top + Math.max(4, a.h * 0.6)) {
      const apres = L.slice(k, k + 20).map(x => x.c).join(''), avant = L.slice(Math.max(0, p - 30), p + 1).map(x => x.c).join('');
      const nombre = k - p > 1 && /\d/.test(a.c) && /^(?:\d{3}(?!\d)|(?:BTC|min|h|j|jours?|k|M|Md)(?![\p{L}\d]))/u.test(apres);
      if (/^[:;?!»$%]/.test(apres) || a.c === '«' || nombre) out.push(avant + ' ⏎ ' + apres);
    }
    p = k;
  }
  return out;
}, sel);

module.exports = { coupuresLignes };
