// ═══════════════════════════════════════════════════════════════════════════════
// CHRONIQUE — les dernières heures de publications, relues dans l'historique git du dépôt.
// ─────────────────────────────────────────────────────────────────────────────
// Chaque publication de market-data.json est un commit : la publication d'il y a N commits se
// lit à /master~N/ sur le MÊME hôte que le fichier courant (raw.githubusercontent.com, URL
// dérivée de DATA_URL — aucun hôte nouveau, tests/test_contrat.py). Le dépôt alterne
// publications et cartes de chaleur : on marche donc de deux en deux (N = 2, 4, 6…, par lots de
// 4), et un trou laissé par ce pas (deux cartes de suite, cron en retard) se comble ensuite en
// lisant une fois les ancêtres IMPAIRS entre les deux publications qui l'encadrent.
//
// ARRÊTS — au premier de : publication déjà en cache · plus vieille que l'horizon (6 h, compté
// depuis la plus récente, pas depuis l'horloge du poste) · 30 requêtes dans la session · 429 ou
// 403 (« GitHub limite les lectures : historique partiel ») · 404 (début de l'historique) · un
// lot entier sans publication nouvelle (le dépôt n'avance plus : inutile de lire plus loin).
//
// La CADENCE affichée est MESURÉE : médiane des écarts entre publications. Elle seule fixe le
// seuil des trous (> 1,5 × médiane : à combler ; > 2 × : la ligne se coupe) et le « figé » des
// Horloges. Rien n'est interpolé : un champ absent d'une publication (format antérieur) est
// null — « champ absent », jamais 0 — et la ligne s'interrompt.
//
// Le relevé en localStorage (48 h au plus) n'est qu'une commodité : il se reconstruit depuis git.
// Le cœur est PUR (tests/test_chronique.js, sous node) ; le rendu ne se fait qu'à l'arrivée
// d'une donnée — aucune minuterie, aucune animation.
// ═══════════════════════════════════════════════════════════════════════════════
const Chronique = (function () {
  const C = {
    HORIZON_MS: 6 * 3600e3,     // fenêtre lue dans git et montrée
    CACHE_MS: 48 * 3600e3,      // ce que garde localStorage
    MAX_REQUETES: 30,           // lectures de l'historique par session
    LOT: 4,                     // lectures parallèles d'un lot
    PAS: 2,                     // une publication sur deux commits
    COMBLER: 1.5,               // écart > COMBLER × médiane : trou à combler
    COUPER: 2,                  // écart > COUPER × médiane : la ligne se coupe
    MIN_ECARTS: 3,              // en deçà, pas de cadence mesurée
    CLE: 'samsara-chronique-v1',
  };
  const MOTIFS = {
    connu: 'rejoint le relevé déjà en cache',
    horizon: 'horizon de 6 h atteint',
    plafond: C.MAX_REQUETES + ' lectures par session atteintes',
    limite: 'GitHub limite les lectures : historique partiel',
    absent: 'début de l’historique',
    immobile: 'plus aucune publication dans les commits lus',
    reseau: 'lecture impossible : historique partiel',
  };
  // Replis de format : la page lit déjà ces anciens noms quand le nouveau manque (js/app.js).
  const REPLIS = {
    'micro.oi_change_24h_pct': ['micro.oi_change_1d_pct'],
    'tf.4h.ema20': ['tf.4h.ema20_4h'], 'tf.4h.ema50': ['tf.4h.ema50_4h'],
  };

  // ── Cœur pur ──
  const urlAncetre = (url, n) => url.replace('/master/', '/master~' + n + '/');
  function lire(md, chemin) {
    let v = md;
    for (const k of chemin.split('.')) { if (!v || typeof v !== 'object') return null; v = v[k]; }
    return typeof v === 'number' && isFinite(v) ? v : null;
  }
  /** Le chemin et ses replis, dans l'ordre. */
  const avecReplis = c => [c].concat(REPLIS[c] || []);
  /** Une publication réduite aux champs suivis. → { t, u, v: {chemin: nombre|null} } | null. */
  function extraire(md, chemins) {
    const t = md && typeof md.updated === 'string' ? Date.parse(md.updated) : NaN;
    if (!isFinite(t)) return null;
    const v = {};
    for (const c of chemins) for (const x of avecReplis(c)) v[x] = lire(md, x);
    return { t, u: md.updated, v };
  }
  /** Sans doublon (même `updated`), du plus ancien au plus récent. */
  function dedoublonner(pts) {
    const m = new Map();
    for (const p of pts) if (p && !m.has(p.u)) m.set(p.u, p);
    return [...m.values()].sort((a, b) => a.t - b.t);
  }
  /** Médiane des écarts entre publications successives ; null sous MIN_ECARTS écarts. */
  function mediane(pts) {
    const e = [];
    for (let i = 1; i < pts.length; i++) if (pts[i].t > pts[i - 1].t) e.push(pts[i].t - pts[i - 1].t);
    if (e.length < C.MIN_ECARTS) return null;
    e.sort((a, b) => a - b);
    const k = e.length >> 1;
    return e.length % 2 ? e[k] : (e[k - 1] + e[k]) / 2;
  }
  /** Le prochain lot de rangs à lire, sous le plafond. */
  function planLot(n0, faites) {
    const out = [];
    for (let n = n0; out.length < C.LOT && faites + out.length < C.MAX_REQUETES; n += C.PAS) out.push(n);
    return out;
  }
  /** Lit les réponses d'un lot, dans l'ordre des rangs. reps = [{ n, status, md, erreur }].
   *  ctx = { connus: Set(updated), plusRecent: ms, vus: Set(updated), comblement }.
   *  → { gardes: [{ n, md }], arret: motif|null }. Ce qui suit un arrêt est ignoré. PUR. */
  function decider(reps, ctx) {
    const gardes = [];
    let neuf = false;
    for (const r of reps.slice().sort((a, b) => a.n - b.n)) {
      if (r.status === 429 || r.status === 403) return { gardes, arret: 'limite' };
      if (r.status === 404) return { gardes, arret: 'absent' };
      if (r.erreur && !r.md) return { gardes, arret: r.status ? 'limite' : 'reseau' };
      const t = r.md && Date.parse(r.md.updated);
      if (!isFinite(t)) continue;                       // JSON sans updated : rang sauté
      if (ctx.connus.has(r.md.updated)) return { gardes, arret: 'connu' };
      if (ctx.plusRecent - t > C.HORIZON_MS) return { gardes, arret: 'horizon' };
      if (!ctx.vus.has(r.md.updated)) neuf = true;
      gardes.push({ n: r.n, md: r.md });
    }
    return { gardes, arret: neuf || ctx.comblement ? null : 'immobile' };
  }
  /** Rangs impairs à lire une fois : entre deux publications de cette session (rang connu)
   *  écartées de plus de COMBLER × médiane. rangs = [{ n, t }]. PUR. */
  function comblements(rangs, med, demandes) {
    if (!med) return [];
    const r = rangs.slice().sort((a, b) => a.n - b.n), out = [];
    for (let i = 1; i < r.length; i++) {
      if (r[i - 1].t - r[i].t <= C.COMBLER * med) continue;
      for (let n = r[i - 1].n + 1; n < r[i].n; n++) if (n % 2 && !demandes.has(n) && !out.includes(n)) out.push(n);
    }
    return out;
  }
  const signature = chemins => chemins.slice().sort().join('|');
  /** Le relevé gardé : jamais une exception (navigation privée, quota, JSON abîmé). */
  function charger(st, maintenant, chemins) {
    try {
      const j = JSON.parse(st.getItem(C.CLE) || 'null');
      if (!j || j.sig !== signature(chemins) || !Array.isArray(j.points)) return [];
      return dedoublonner(j.points.filter(p => p && isFinite(p.t) && maintenant - p.t <= C.CACHE_MS));
    } catch (e) { return []; }
  }
  function sauver(st, pts, maintenant, chemins) {
    try {
      st.setItem(C.CLE, JSON.stringify({ sig: signature(chemins), points: pts.filter(p => maintenant - p.t <= C.CACHE_MS) }));
      return true;
    } catch (e) { return false; }
  }
  /** La série d'un chemin (replis compris) depuis `debut` : [{ t, v|null }]. */
  function serie(pts, chemin, debut) {
    return pts.filter(p => p.t >= (debut || 0)).map(p => {
      let v = null;
      for (const x of avecReplis(chemin)) { const y = p.v[x]; if (typeof y === 'number') { v = y; break; } }
      return { t: p.t, v };
    });
  }
  /** Morceaux continus : coupés sur null et sur un écart > COUPER × médiane. PUR. */
  function segments(s, med) {
    const out = [];
    let cur = null, prec = null;
    for (const p of s) {
      const coupe = !prec || p.v === null || prec.v === null || (med && p.t - prec.t > C.COUPER * med);
      if (p.v !== null) { if (coupe || !cur) out.push(cur = []); cur.push(p); } else cur = null;
      prec = p;
    }
    return out;
  }
  /** Intervalles sans donnée lisible (trous de temps, champ absent), pour les hachures. PUR. */
  function trous(s, med) {
    const out = [];
    for (let i = 1; i < s.length; i++) {
      const a = s[i - 1], b = s[i];
      if (a.v === null || b.v === null || (med && b.t - a.t > C.COUPER * med)) {
        const d = out[out.length - 1];
        if (d && d[1] === a.t) d[1] = b.t; else out.push([a.t, b.t]);
      }
    }
    return out;
  }
  const r1 = x => Math.round(x * 10) / 10;
  /** Le tracé SVG. o = { l, h, debut, fin, med, hachures, id }. Une ligne par morceau ; un
   *  point isolé se voit (rond). PUR → chaîne. */
  function svg(s, o) {
    const L = o.l, H = o.h, d0 = o.debut, d1 = Math.max(o.fin, d0 + 1);
    const vs = s.map(p => p.v).filter(v => v !== null);
    const lo = Math.min(...vs), hi = Math.max(...vs), plat = !(hi > lo);
    const X = t => r1((t - d0) / (d1 - d0) * (L - 2) + 1), Y = v => r1(plat ? H / 2 : H - 1.5 - (v - lo) / (hi - lo) * (H - 3));
    let corps = '';
    if (o.hachures) {
      const motif = 'chron-h-' + o.id;
      corps += '<defs><pattern id="' + motif + '" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">'
        + '<line x1="0" y1="0" x2="0" y2="4" class="chron-hachure"/></pattern></defs>';
      for (const [a, b] of trous(s, o.med)) corps += '<rect class="chron-trou" x="' + X(a) + '" y="0" width="' + r1(Math.max(1, X(b) - X(a))) + '" height="' + H + '" fill="url(#' + motif + ')"/>';
    }
    for (const m of segments(s, o.med)) {
      corps += m.length === 1 ? '<circle class="chron-point" cx="' + X(m[0].t) + '" cy="' + Y(m[0].v) + '" r="1.2"/>'
        : '<path class="chron-ligne" d="' + m.map((p, i) => (i ? 'L' : 'M') + X(p.t) + ' ' + Y(p.v)).join('') + '"/>';
    }
    return '<svg class="' + o.classe + '" width="' + L + '" height="' + H + '" viewBox="0 0 ' + L + ' ' + H + '"'
      + (o.etire ? ' preserveAspectRatio="none"' : '') + ' role="img" aria-label="'
      + echap(o.titre) + '"><title>' + echap(o.titre) + '</title>' + corps + '</svg>';
  }
  const echap = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  /** « 6 h · 24 publications · min … max … · nature : mesure » (+ fenêtre glissante, absences,
   *  historique partiel). meta = l'entrée de meta.champs. PUR. */
  function titre(s, o) {
    const vs = s.map(p => p.v).filter(v => v !== null), f = o.fmt || String, m = o.meta || {};
    const absents = s.length - vs.length;
    return Math.round(C.HORIZON_MS / 3600e3) + ' h · ' + s.length + ' publication' + (s.length > 1 ? 's' : '')
      + (vs.length ? ' · min ' + f(Math.min(...vs)) + ' max ' + f(Math.max(...vs)) : '')
      + (absents ? ' · champ absent dans ' + absents : '')
      + (m.nature ? ' · nature : ' + m.nature : '')
      + (/glissant/.test(m.fenetre || '') ? ' · fenêtre glissante, un point par publication' : '')
      + (o.partiel ? ' · ' + o.partiel : '');
  }

  // ── L'état de la session ──
  function creer(o) {
    const chemins = o.chemins, st = o.stockage, lireUrl = o.fetch;
    let points = charger(st, o.maintenant ? o.maintenant() : Date.now(), chemins);
    const connus = new Set(points.map(p => p.u));
    let requetes = 0, arret = null, partiel = '', enCours = null;
    const rangs = new Map(), demandes = new Set();     // updated → rang lu dans cette session
    const maintenant = () => (o.maintenant ? o.maintenant() : Date.now());
    function garder(md, n) {
      const p = extraire(md, chemins);
      if (!p) return false;
      if (n !== undefined && !rangs.has(p.u)) rangs.set(p.u, { n, t: p.t });
      if (points.some(x => x.u === p.u)) return false;
      points = dedoublonner(points.concat(p));
      return true;
    }
    async function lireRang(n) {
      demandes.add(n);
      try {
        const r = await lireUrl(urlAncetre(o.url, n));
        if (!r.ok) return { n, status: r.status };
        try { return { n, status: r.status, md: await r.json() }; } catch (e) { return { n, status: r.status }; }
      } catch (e) { return { n, status: 0, erreur: e }; }
    }
    async function lots(rangsALire, ctx) {
      for (let i = 0; i < rangsALire.length; i += C.LOT) {
        const lot = rangsALire.slice(i, i + C.LOT).slice(0, C.MAX_REQUETES - requetes);
        if (!lot.length) return 'plafond';
        requetes += lot.length;
        const d = decider(await Promise.all(lot.map(lireRang)), ctx);
        for (const g of d.gardes) garder(g.md, g.n);
        if (d.arret) return d.arret;
      }
      return null;
    }
    /** La marche dans l'historique : une fois par session. */
    function parcourir() {
      if (enCours) return enCours;
      enCours = (async () => {
        const plusRecent = points.length ? points[points.length - 1].t : maintenant();
        let n = C.PAS;
        for (;;) {
          const lot = planLot(n, requetes);
          if (!lot.length) { arret = 'plafond'; break; }
          const vus = new Set(points.map(p => p.u));
          const a = await lots(lot, { connus, plusRecent, vus });
          if (a) { arret = a; break; }
          n = lot[lot.length - 1] + C.PAS;
        }
        if (arret !== 'limite' && arret !== 'reseau') {
          const med = mediane(points.filter(p => plusRecent - p.t <= C.HORIZON_MS));
          const a = await lots(comblements([...rangs.values()], med, demandes), { connus: new Set(), plusRecent, vus: new Set(), comblement: true });
          if (a === 'limite' || a === 'reseau' || a === 'plafond') arret = a;
        }
        partiel = arret === 'limite' || arret === 'reseau' ? MOTIFS[arret] : '';
        sauver(st, points, maintenant(), chemins);
        return arret;
      })();
      return enCours;
    }
    /** La lecture vivante (chaque minute) ajoute sa publication, sans requête de plus. */
    function ajouter(md) {
      // Rang 0 : la toute première lecture seulement (master au chargement) ; les suivantes
      // arrivent après la marche, leur rang ne servira plus.
      const neuf = garder(md, rangs.size ? undefined : 0);
      if (neuf) sauver(st, points, maintenant(), chemins);
      return neuf;
    }
    const recents = () => { const f = points.length ? points[points.length - 1].t : 0; return points.filter(p => f - p.t <= C.HORIZON_MS); };
    return {
      ajouter, parcourir,
      points: () => points.slice(), recents,
      cadence: () => mediane(recents()),
      etat: () => ({ requetes, arret, motif: arret ? MOTIFS[arret] : '', partiel }),
      /** Le résumé d'un chemin (le titre de son tracé), '' sans valeur. */
      resume(chemin, o2) {
        const s = serie(recents(), chemin, 0);
        return s.some(p => p.v !== null) ? titre(s, { fmt: o2.fmt, meta: o2.meta, partiel }) : '';
      },
      /** Le tracé d'un chemin sur l'horizon. o2 = { l, h, classe, hachures, id, meta, fmt }. */
      trace(chemin, o2) {
        const r = recents();
        if (!r.length) return '';
        const s = serie(r, chemin, 0), med = mediane(r);
        if (!s.some(p => p.v !== null)) return '';
        const fin = r[r.length - 1].t;
        return svg(s, Object.assign({ debut: fin - C.HORIZON_MS, fin, med, titre: titre(s, { fmt: o2.fmt, meta: o2.meta, partiel }) }, o2));
      },
    };
  }

  return { C, MOTIFS, REPLIS, urlAncetre, lire, extraire, dedoublonner, mediane, planLot, decider, comblements,
    charger, sauver, serie, segments, trous, svg, titre, creer };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Chronique;
