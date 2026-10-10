// ═══════════════════════════════════════════════════════════════════════════════
// HORLOGES — l'âge de chaque instant que la page affiche, et pourquoi une source s'est tue.
// ─────────────────────────────────────────────────────────────────────────────
// La LISTE ne s'écrit pas à la main : chaque champ que meta.champs décrit comme `horodatage`
// (alias exclus), plus les horloges propres à la page (ticker, bougies, ⚡, market-data.updated,
// heatmap.updated). Un horodatage ajouté côté serveur apparaît ici sans toucher ce fichier.
//
// L'HEURE DE CE POSTE n'est pas celle de Binance : un PC décalé de 40 s vieillit ou rajeunit
// tout ce qu'il affiche. Le décalage se mesure sur /api/v3/time (poids 1) : envoi s, réception
// r, heure serveur S → décalage = S − (s + r)/2, incertitude = (r − s)/2 ; on garde l'échantillon
// de plus faible aller-retour parmi les 5 derniers. Les âges d'ici se lisent sur Date.now()
// corrigé (maintenant()).
//
// ÉCHECS : `classer` est PUR (testé hors ligne, tests/test_horloges.js). Il nomme la panne au
// lieu de « erreur » : hors ligne, refus régional (451), limite (429/418), serveur (5xx), JSON
// invalide, fichier figé. Un 200 ne prouve rien sur la fraîcheur : « figé » se juge sur l'âge.
//
// Chargé AVANT js/app.js : ses lectures (prix, bougies, ⚡, fichiers publiés) y notent leurs
// succès et leurs échecs.
// ═══════════════════════════════════════════════════════════════════════════════
const Horloges = (function () {
  const ECHANTILLONS = 5;          // décalage : meilleur aller-retour parmi les N derniers
  const ECART_SIGNALE_MS = 1000;   // en deçà, l'horloge du poste n'est pas signalée

  const LIBELLES = {
    hors_ligne: 'hors ligne ou requête bloquée',
    refus_regional: 'refus régional (HTTP 451)',
    limite: 'limite de requêtes atteinte',
    serveur: 'serveur en panne',
    json: 'JSON invalide',
    http: 'réponse HTTP inattendue',
    fige: 'fichier figé',
  };

  /** Une réponse non 2xx devient une erreur qui garde son statut (classer le lit). */
  function verifier(r) {
    if (r && r.ok === false) { const e = new Error('HTTP ' + r.status); e.status = r.status; throw e; }
    return r;
  }

  /** Classe d'une panne. o = { erreur, status, enLigne, ageMs, seuilFigeMs }. PUR.
   *  → { classe, libelle } ; classe null : rien à signaler. L'ordre compte : un poste hors
   *  ligne échoue en TypeError, et une réponse 451 peut porter un JSON valide. */
  function classer(o) {
    const e = o.erreur || null, st = o.status != null ? o.status : (e && e.status);
    let classe = null;
    if (o.enLigne === false) classe = 'hors_ligne';
    else if (st === 451) classe = 'refus_regional';
    else if (st === 429 || st === 418) classe = 'limite';
    else if (st >= 500 && st < 600) classe = 'serveur';
    else if (st && (st < 200 || st >= 300)) classe = 'http';
    // fetch rejette en TypeError quand la requête n'aboutit pas (réseau, CORS d'un refus) ;
    // r.json() rejette en SyntaxError quand le corps n'est pas du JSON.
    else if (e && e.name === 'SyntaxError') classe = 'json';
    else if (e && e.name === 'TypeError') classe = 'hors_ligne';
    else if (e) classe = 'http';
    else if (o.ageMs != null && o.seuilFigeMs != null && o.ageMs > o.seuilFigeMs) classe = 'fige';
    if (!classe) return { classe: null, libelle: '' };
    return { classe, libelle: LIBELLES[classe] + (classe === 'http' && st ? ' (' + st + ')' : '') };
  }

  /** Seuil « figé » d'un fichier publié : 2 × la cadence MESURÉE (+ la marge d'envoi) quand
   *  une mesure existe ; sinon la convention de js/cadences.js (fige_min = deux publications
   *  manquées). → { ms, texte } — le texte dit d'où vient la cadence. */
  function seuilFige(cadenceMesureeMs) {
    const C = CADENCES;   // js/cadences.js, chargé avant
    if (cadenceMesureeMs > 0) {
      return { ms: 2 * cadenceMesureeMs + C.marge_publication_s * 1000,
        texte: 'cadence mesurée ' + Math.round(cadenceMesureeMs / 60000) + ' min' };
    }
    return { ms: C.fige_min * 60000, texte: 'attendue ' + C.attendue_min + ' min (convention)' };
  }

  // ── Décalage avec Binance ──
  const echantillons = [];
  /** Un aller-retour : s (envoi, horloge locale), S (heure Binance), r (réception). PUR. */
  function echantillon(s, S, r) { return { decalage: S - (s + r) / 2, incertitude: (r - s) / 2, a: r }; }
  function retenir(liste) {
    let m = null;
    for (const x of liste.slice(-ECHANTILLONS)) if (!m || x.incertitude < m.incertitude) m = x;
    return m;
  }
  function decalage() { return retenir(echantillons); }
  function maintenant() { const d = decalage(); return Date.now() + (d ? d.decalage : 0); }
  /** Mesure le décalage (une requête de poids 1). `url` : construite par l'appelant depuis sa
   *  constante d'API — aucun hôte n'est écrit ici. */
  async function mesurer(url, f) {
    const s = Date.now();
    try {
      const r = verifier(await (f || fetch)(url, { cache: 'no-store' }));
      const j = await r.json(), t = Date.now();
      if (!(j && isFinite(j.serverTime))) throw new SyntaxError('serverTime absent');
      echantillons.push(echantillon(s, +j.serverTime, t));
      if (echantillons.length > ECHANTILLONS) echantillons.shift();
      noter('binance_time');
    } catch (e) { noter('binance_time', e); }
  }
  /** « horloge de ce PC : écart ≈ +0,5 s » quand l'écart dépasse 1 s ; '' sinon. Écart = poste
   *  − Binance (positif : le poste avance). */
  function texteEcart(d) {
    d = d === undefined ? decalage() : d;
    if (!d || Math.abs(d.decalage) <= ECART_SIGNALE_MS) return '';
    const e = -d.decalage / 1000;
    return 'horloge de ce PC : écart ≈ ' + (e > 0 ? '+' : '−') + Math.abs(e).toLocaleString('fr-FR', { maximumFractionDigits: 1 })
      + ' s (± ' + (d.incertitude / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' s) — âges corrigés';
  }

  // ── Sources de la page : dernier succès, classe du dernier échec ──
  const sources = {};
  function noter(nom, erreur, status) {
    const s = sources[nom] || (sources[nom] = { ok: null, ko: null, classe: null, libelle: '' });
    if (!erreur && !status) { s.ok = Date.now(); s.classe = null; s.libelle = ''; return s; }
    const enLigne = typeof navigator !== 'undefined' && navigator.onLine === false ? false : undefined;
    const c = classer({ erreur, status, enLigne });
    s.ko = Date.now(); s.classe = c.classe; s.libelle = c.libelle;
    return s;
  }

  // ── La liste ──
  /** Valeurs d'une clé de meta.champs (« tf.*.derniere_cloture_a » → une par TF). PUR. */
  function deplier(cle, md) {
    let pas = [{ chemin: [], v: md }];
    for (const p of cle.split('.')) {
      const suite = [];
      for (const x of pas) {
        if (!x.v || typeof x.v !== 'object') continue;
        if (p === '*') for (const k of Object.keys(x.v)) suite.push({ chemin: x.chemin.concat(k), v: x.v[k] });
        else if (p in x.v) suite.push({ chemin: x.chemin.concat(p), v: x.v[p] });
      }
      pas = suite;
    }
    return pas.map(x => ({ chemin: x.chemin.join('.'), v: x.v }));
  }
  function instant(v) {
    if (typeof v !== 'string') return null;
    const t = Date.parse(/^\d{4}-\d\d-\d\d$/.test(v) ? v + 'T00:00:00Z' : v);
    return isFinite(t) ? t : null;
  }
  /** Les horloges du FICHIER : chaque champ `horodatage` de meta.champs, alias exclus. PUR.
   *  → [{ cle, chemin, libelle, source, t }] ; t null si la valeur ne se lit pas comme un instant. */
  function duFichier(md) {
    const ch = md && md.meta && md.meta.champs;
    if (!ch) return [];
    const out = [];
    for (const [cle, m] of Object.entries(ch)) {
      if (!m || m.nature !== 'horodatage' || m.alias_de) continue;
      for (const x of deplier(cle, md)) {
        const tf = cle.includes('*') ? x.chemin.split('.')[cle.split('.').indexOf('*')] : '';
        out.push({ cle, chemin: x.chemin, libelle: m.libelle + (tf ? ' ' + tf : ''), source: m.source, t: instant(x.v), valeur: x.v });
      }
    }
    return out;
  }
  /** Les horloges de la PAGE. ctx = { marche: {updated}, chaleur: {updated}|null, cadenceMesureeMs }
   *  (cadenceMesureeMs : médiane des écarts entre publications, mesurée par js/chronique.js).
   *  → [{ cle, libelle, source, t, classe, libelle_panne, seuil }] ; t = dernier succès. */
  function dePage(ctx, t) {
    t = t || maintenant();
    const out = [];
    const src = (cle, libelle, source) => {
      const s = sources[cle] || {};
      out.push({ cle, libelle, source, t: s.ok || null, classe: s.classe || null, panne: s.libelle || '', ko: s.ko || null });
    };
    src('prix', 'Prix (ticker)', 'Binance spot');
    src('bougies', 'Bougies du graphique', 'Binance spot');
    src('live', 'Panneau ⚡ (en direct)', 'Binance spot');
    // La cadence mesurée (js/chronique.js) est celle de market-data.json : la carte de chaleur,
    // publiée par un autre script à un autre rythme, garde la convention.
    // Les libellés disent la chose (le champ `updated` de market-data.json / heatmap.json, lus
    // sur raw.githubusercontent.com), pas le nom du fichier : ce sont les mots de la page.
    for (const [cle, libelle, f, cad] of [['marche', 'Infos du marché (publication)', ctx && ctx.marche, ctx && ctx.cadenceMesureeMs],
      ['chaleur', 'Ordres en attente (carte) : publication', ctx && ctx.chaleur, null]]) {
      const s = sources[cle] || {}, tu = f ? instant(f.updated) : null, seuil = seuilFige(cad);
      let c = s.classe ? { classe: s.classe, libelle: s.libelle } : classer({ ageMs: tu === null ? null : t - tu, seuilFigeMs: seuil.ms });
      out.push({ cle, libelle, source: 'publié sur GitHub', t: tu, classe: c.classe, panne: c.libelle, seuil: seuil.texte, lu: s.ok || null });
    }
    return out;
  }

  /** « il y a 3 min », « dans 12 min », « < 5 s ». Grain : 5 s sous la minute (le texte ne
   *  change pas à chaque seconde), la minute ensuite, l'heure au-delà de 90 min. PUR. */
  function texteAge(ms) {
    if (ms === null || !isFinite(ms)) return '—';
    const futur = ms < 0, a = Math.abs(ms) / 1000;
    let x;
    if (a < 5) return futur ? 'dans < 5 s' : '< 5 s';
    if (a < 60) x = Math.floor(a / 5) * 5 + ' s';
    else if (a < 90 * 60) x = Math.floor(a / 60) + ' min';
    else if (a < 48 * 3600) { const h = Math.floor(a / 3600), m = Math.floor(a % 3600 / 60); x = h + ' h ' + String(m).padStart(2, '0'); }
    else x = Math.floor(a / 86400) + ' j';
    return (futur ? 'dans ' : 'il y a ') + x;
  }

  return { LIBELLES, classer, verifier, seuilFige, echantillon, retenir, decalage, maintenant, mesurer, texteEcart,
    noter, sources, deplier, instant, duFichier, dePage, texteAge, _echantillons: echantillons };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Horloges;
