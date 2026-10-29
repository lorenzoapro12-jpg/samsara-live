// ═══════════════════════════════════════════════════════════════════════════════
// CALCULETTE DE RISQUE (plan du site du 13/10/2026, idée 7) — sans mémoire.
// ─────────────────────────────────────────────────────────────────────────────
// Lorenzo achète par paliers échelonnés et pose un stop sous le dernier ; le vrai risque de sa
// méthode : tous les paliers se remplissent, puis le stop saute. La calculette donne la taille de
// chaque palier (la même pour tous) pour que cette perte-là vaille la part choisie du capital
// (1 % par défaut, PARAM.risque.part), avec le prix moyen et la mise si tout se remplit.
//   • Sens : un stop sous TOUS les paliers = achat ; au-dessus de tous = vente ; mélangé (ou égal à
//     un palier) = un message, pas de calcul.
//   • Quantité q par palier, n paliers p₁…pₙ, stop s, perte voulue R = capital × part :
//     R = q × Σ |pᵢ − s|  ⇒  q = R / Σ |pᵢ − s| ; prix moyen = moyenne des pᵢ (quantités égales) ;
//     mise = q × Σ pᵢ. La quantité affichée est arrondie VERS LE BAS : la perte ne dépasse jamais
//     la part choisie.
//   • Sans mémoire : ni localStorage ni sessionStorage. Les valeurs vivent dans les champs et se
//     perdent à la fermeture du panneau (#fichePop, la bulle des légendes, js/fiches.js).
//   • Un calcul, pas un conseil : aucun mot qui pousse à agir ; la ligne de rappel dit ce que la
//     règle ne couvre pas (un trou de prix au-delà du stop coûte plus).
//   • Revue du 14/10 (N3, vision-4 ; « Les deux » de Lorenzo à Q3) : sous les résultats d'un achat,
//     ce que notre mesure des paliers a trouvé, avec sa condition et sa source (MESURE). Aucune
//     valeur conseillée, aucun champ prérempli.
//   • « Calculette lisible » (29/10, choix « Tout » de Lorenzo) : (A) une question en tête et un
//     bouton « Essayer un exemple » qui remplit les champs autour du prix du moment (rien n'est
//     prérempli à l'ouverture) ; (B) la perte acceptable en $ (le capital devient facultatif) ou en
//     % du capital ; (C) le résultat commence par une phrase (quantité, perte au stop), le détail
//     dessous ; (D) un second onglet « Position ouverte » : quantité, prix moyen, stop (ou prix de
//     liquidation) → ce que coûte la position si le prix touche le stop, et, au prix du moment, la
//     perte (ou le gain) déjà là et ce qui reste jusqu'au stop. Toujours sans mémoire.
// Le cœur (lecture des nombres, calcul, mots) est pur et testé dans node (tests/test_calculette.js) ;
// le panneau (ouvrirCalculette) est en bas du fichier, testé dans Chromium (test_calculette_page.js).
// ═══════════════════════════════════════════════════════════════════════════════
const Calculette = (function () {
  'use strict';
  const F = typeof Fmt !== 'undefined' ? Fmt : require('./format.js');
  const fini = v => typeof v === 'number' && isFinite(v);

  /** Un nombre tapé au clavier, à la française ou à l'anglaise : « 83 200,5 », « 83200.5 »,
   *  « 83 200 $ », « 1,5 % », « 1.000.000 ». Les espaces (y compris insécables) sont des séparateurs
   *  de milliers ; avec une virgule ET un point, le dernier des deux est la décimale ; un seul
   *  signe répété (« 1.000.000 ») sépare des milliers ; une virgule seule (ou un point seul) est la
   *  décimale. → le nombre, ou null (vide ou illisible). */
  function lireNombre(t) {
    if (typeof t === 'number') return fini(t) ? t : null;
    if (t === undefined || t === null) return null;
    let s = String(t).replace(/[\s   ]/g, '').replace(/−/g, '-');
    s = s.replace(/^[$€]+/, '').replace(/(?:\$|€|%|usdt|usd)+$/i, '');
    if (!s) return null;
    const v = s.lastIndexOf(','), p = s.lastIndexOf('.');
    if (v >= 0 && p >= 0) {
      const dec = v > p ? ',' : '.', mil = dec === ',' ? '.' : ',';
      s = s.split(mil).join('').replace(dec, '.');
    } else if (v >= 0 || p >= 0) {
      const sep = v >= 0 ? ',' : '.', n = s.split(sep).length - 1;
      // « 1.000.000 » : des milliers (des groupes de trois chiffres) ; « 83,5 » : une décimale.
      s = n > 1 && /^-?\d{1,3}(?:[.,]\d{3})+$/.test(s) ? s.split(sep).join('') : n === 1 ? s.replace(sep, '.') : s;
    }
    return /^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(s) ? Number(s) : null;
  }
  /** Le texte d'un champ réécrit à la française, à la sortie du champ (revue du 14/10, vA-9) :
   *  « 80000 » → « 80 000 », « 82152.5 » → « 82 152,5 ». Le pavé numérique du téléphone n'a pas de
   *  touche espace, et un zéro en trop sur le stop se voit mal sans elle. Les décimales tapées sont
   *  gardées (au plus 8), sans zéro inutile ; un texte vide ou illisible reste tel quel (le message
   *  dit lequel). → le texte à mettre dans le champ. */
  function ecrireNombre(t) {
    const v = lireNombre(t);
    if (v === null) return t === undefined || t === null ? '' : String(t);
    let d = 0;
    while (d < 8 && Math.abs(Math.round(v * Math.pow(10, d)) / Math.pow(10, d) - v) > 1e-9 * Math.max(1, Math.abs(v))) d++;
    // Un nombre si petit qu'il s'écrirait « 0 » : le texte tapé reste (il ne doit pas devenir zéro).
    return v !== 0 && Number(v.toFixed(d)) === 0 ? String(t) : F.nombre(v, d);
  }

  // Les messages quand il n'y a pas de calcul : une phrase courte, jamais un conseil.
  const MESSAGES = {
    vide: 'Les résultats s’affichent ici quand les champs sont remplis.',
    capital_vide: 'Il manque le capital.', capital_illisible: 'Le capital n’est pas un nombre lisible.', capital_nul: 'Le capital doit être plus grand que zéro.',
    part_vide: 'Il manque la part risquée.', part_illisible: 'La part risquée n’est pas un nombre lisible.', part_hors: 'La part risquée doit être plus grande que 0 et au plus 100 %.',
    stop_vide: 'Il manque le stop.', stop_illisible: 'Le stop n’est pas un nombre lisible.', stop_nul: 'Le stop doit être plus grand que zéro.',
    paliers_vide: 'Il manque au moins un palier.',
    palier_illisible: k => 'Le palier ' + k + ' n’est pas un nombre lisible.', palier_nul: k => 'Le palier ' + k + ' doit être plus grand que zéro.',
    melange: 'Le stop doit être sous tous les paliers (achat) ou au-dessus de tous (vente).',
    perte_vide: 'Il manque la perte acceptable.', perte_illisible: 'La perte acceptable n’est pas un nombre lisible.',
    perte_nul: 'La perte acceptable doit être plus grande que zéro.', perte_hors: 'La perte acceptable dépasse le capital.',
    quantite_vide: 'Il manque la quantité.', quantite_illisible: 'La quantité n’est pas un nombre lisible.', quantite_nul: 'La quantité doit être plus grande que zéro.',
    entree_vide: 'Il manque le prix moyen.', entree_illisible: 'Le prix moyen n’est pas un nombre lisible.', entree_nul: 'Le prix moyen doit être plus grand que zéro.',
    stop_egal: 'Le stop doit être différent du prix moyen.',
  };
  const echec = (code, champ, k) => ({ ok: false, code, champ, index: k === undefined ? null : k,
    message: typeof MESSAGES[code] === 'function' ? MESSAGES[code](k + 1) : MESSAGES[code] });
  const vide = t => t === undefined || t === null || String(t).trim() === '';

  const lu = (t, champ, positif) => {
    if (vide(t)) return { err: champ + '_vide' };
    const v = lireNombre(t);
    if (v === null) return { err: champ + '_illisible' };
    if (positif && !(v > 0)) return { err: champ + '_nul' };
    return { v };
  };
  /** Le calcul. e = { capital, part (en %), stop, paliers: [prix…] } — des nombres ou le texte des
   *  champs. Les lignes de palier vides sont ignorées ; tout le reste doit être lisible.
   *  Perte en montant (29/10, B) : e = { unitePerte: '$', perte, capital (facultatif), stop, paliers } ;
   *  sans capital, ni part ni part de la mise (null). Sinon (unitePerte '%' ou absente), la part est
   *  e.part (ou e.perte), en %.
   *  → { ok: true, sens (1 achat, −1 vente), n, paliers (les prix lus), capital (ou null), part
   *      (fraction, ou null), perte, enMontant, ecart (Σ |pᵢ − s|), quantite (exacte), prixMoyen, mise,
   *      partMise (mise / capital, ou null) }
   *  ou { ok: false, code, champ ('tout' | 'capital' | 'part' | 'perte' | 'stop' | 'palier'), index, message }. */
  function calculer(e) {
    const o = e || {}, brutes = (o.paliers || []).map((t, k) => ({ t, k })).filter(x => !vide(x.t));
    const enMontant = o.unitePerte === '$';
    if (vide(o.capital) && vide(o.stop) && !brutes.length && (!enMontant || vide(o.perte))) return echec('vide', 'tout');
    let capital = null, perte, part = null;
    if (enMontant) {
      const M = lu(o.perte, 'perte', true);
      if (M.err) return echec(M.err, 'perte');
      if (!vide(o.capital)) {
        const C = lu(o.capital, 'capital', true);
        if (C.err) return echec(C.err, 'capital');
        if (M.v > C.v * (1 + 1e-12)) return echec('perte_hors', 'perte');
        capital = C.v; part = M.v / C.v;
      }
      perte = M.v;
    } else {
      const C = lu(o.capital, 'capital', true);
      if (C.err) return echec(C.err, 'capital');
      const P = lu(o.part !== undefined ? o.part : o.perte, 'part', false);
      if (P.err) return echec(P.err, 'part');
      if (!(P.v > 0 && P.v <= 100)) return echec('part_hors', 'part');
      capital = C.v; part = P.v / 100; perte = capital * part;
    }
    const S = lu(o.stop, 'stop', true);
    if (S.err) return echec(S.err, 'stop');
    if (!brutes.length) return echec('paliers_vide', 'palier');
    const prix = [];
    for (const { t, k } of brutes) {
      const v = lireNombre(t);
      if (v === null) return echec('palier_illisible', 'palier', k);
      if (!(v > 0)) return echec('palier_nul', 'palier', k);
      prix.push(v);
    }
    const s = S.v, sens = prix.every(p => p > s) ? 1 : prix.every(p => p < s) ? -1 : 0;
    if (!sens) return echec('melange', 'stop');
    const n = prix.length;
    const ecart = prix.reduce((a, p) => a + Math.abs(p - s), 0), somme = prix.reduce((a, p) => a + p, 0);
    const quantite = perte / ecart, mise = quantite * somme;
    return { ok: true, sens, n, paliers: prix, stop: s, capital, part, perte, enMontant, ecart, quantite, prixMoyen: somme / n, mise,
      partMise: capital === null ? null : mise / capital };
  }

  /** Une position déjà ouverte (29/10, D). e = { quantite, entree (le prix moyen), stop (ou le prix
   *  de liquidation), capital (facultatif), actuel (le prix du moment : un nombre, ou rien) }.
   *  Le sens : du côté du stop par rapport au prix du moment (un stop remonté au-dessus du prix
   *  moyen d'un achat reste un achat) ; sans prix du moment, par rapport au prix moyen.
   *  → { ok: true, sens, quantite, entree, stop, capital (ou null), valeur (quantité × prix moyen),
   *      levier (valeur / capital, ou null), auStop (résultat si le prix touche le stop, compté
   *      depuis le prix moyen : < 0 une perte), actuel (ou null), latente (le résultat au prix du
   *      moment, ou null), reste (auStop − latente, ou null) }
   *  ou { ok: false, code, champ ('tout' | 'quantite' | 'entree' | 'stop' | 'capital'), index, message }. */
  function calculerPosition(e) {
    const o = e || {};
    if (vide(o.quantite) && vide(o.entree) && vide(o.stop) && vide(o.capital)) return echec('vide', 'tout');
    const Q = lu(o.quantite, 'quantite', true);
    if (Q.err) return echec(Q.err, 'quantite');
    const E = lu(o.entree, 'entree', true);
    if (E.err) return echec(E.err, 'entree');
    const S = lu(o.stop, 'stop', true);
    if (S.err) return echec(S.err, 'stop');
    if (Math.abs(S.v - E.v) <= 1e-12 * E.v) return echec('stop_egal', 'stop');
    let capital = null;
    if (!vide(o.capital)) {
      const C = lu(o.capital, 'capital', true);
      if (C.err) return echec(C.err, 'capital');
      capital = C.v;
    }
    const a = lireNombre(o.actuel), actuel = a !== null && a > 0 ? a : null;
    const q = Q.v, p = E.v, s = S.v;
    const sens = actuel !== null && actuel !== s ? (s < actuel ? 1 : -1) : (s < p ? 1 : -1);
    const valeur = q * p, auStop = q * (s - p) * sens;
    const latente = actuel === null ? null : q * (actuel - p) * sens;
    return { ok: true, sens, quantite: q, entree: p, stop: s, capital, valeur, levier: capital === null ? null : valeur / capital,
      auStop, actuel, latente, reste: latente === null ? null : auStop - latente };
  }

  // ─── Les mots du résultat ───
  /** Décimales d'une quantité : 4 chiffres significatifs (0,02134 BTC ; 1,234 SOL ; 5 000 XRP), au plus 8. */
  const decQuantite = q => Math.max(0, Math.min(8, 3 - Math.floor(Math.log10(q))));
  /** La quantité affichée, arrondie VERS LE BAS (la perte ne dépasse jamais la part choisie), sans
   *  zéro inutile à droite (« 0,01 BTC », pas « 0,01000 »). */
  function quantiteAffichee(q) {
    const d = decQuantite(q), m = Math.pow(10, d), v = Math.floor(q * m + 1e-9) / m;
    let k = 0;
    while (k < d && Math.abs(Math.round(v * Math.pow(10, k)) / Math.pow(10, k) - v) > 1e-12) k++;
    return { v, d: k };
  }
  /** Un montant (perte, mise) : sans centimes à partir de 100, ni quand il est rond. */
  const montant = (v, u) => F.nombre(v, Math.abs(v) >= 100 || Math.abs(Math.round(v) - v) < 0.005 ? 0 : 2) + ' ' + (u || '$');
  /** Une part en % telle qu'on la lit : la part choisie comme elle a été tapée (« 1 % », « 0,5 % »,
   *  « 0,25 % ») ; une part calculée, peu de chiffres (« 52 % », « 7,3 % »). Jamais « 0,00 % » pour
   *  une part non nulle (revue du 14/10, fonctionnement-7) : au moins un chiffre utile (« 0,001 % »). */
  function partMots(x, calculee) {
    const p = x * 100, juste = k => Math.abs(Math.round(p * Math.pow(10, k)) / Math.pow(10, k) - p) < 1e-9;
    let d = p >= 10 ? 0 : calculee ? (juste(0) ? 0 : 1) : juste(0) ? 0 : juste(1) ? 1 : 2;
    while (p > 0 && d < 8 && Number(p.toFixed(d)) === 0) d++;
    return F.nombre(p, d) + ' %';
  }
  /** Combien de fois le capital (« × 8,3 », « × 83 », « × 1,1 ») : une décimale sous 10, jamais
   *  « × 1 » pour une mise plus grande que le capital. */
  function fois(x) {
    let d = x >= 9.95 ? 0 : 1;
    while (d < 2 && Number(x.toFixed(d)) <= 1) d++;
    if (d && Math.abs(Math.round(x) - x) < 1e-9) d = 0;
    return '× ' + F.nombre(x, d);
  }
  /** « 3,9 fois le capital » (les mêmes chiffres que fois()). */
  const foisMots = x => fois(x).slice(2) + ' fois le capital';
  /** Un montant signé : « −1 204 $ », « +350 $ ». */
  const signe = (v, u) => (v < 0 ? '−' : v > 0 ? '+' : '') + montant(Math.abs(v), u);
  /** Les mots d'un calcul avant d'entrer : la phrase de tête, les lignes du détail ([nom, valeur,
   *  complément?]…), la ligne d'alerte et la ligne de rappel. o = { base ('BTC'), unite ('$') }.
   *  29/10 (C) : le résultat commence par une phrase, la quantité en gras puis la perte au stop ; le
   *  détail (sens, prix moyen, stop, mise) dessous, sans redire la quantité ni la perte.
   *  Revue du 14/10 (vA-9) : le stop est redit, avec son écart au prix moyen en complément (une ligne
   *  sous le prix, qui n'élargit pas la colonne des valeurs) : un zéro en trop ou en moins s'y voit.
   *  Revue du 14/10 (vision-3, fonctionnement-7) : quand la mise dépasse le capital, une ligne
   *  d'alerte le dit (« 830 % du capital » seul ne dit pas qu'il faudrait emprunter) ; le fait
   *  seulement, aucun conseil. Vide sinon (et sans capital).
   *  Revue du 14/10 (N3) : mesure = la ligne mesurée (MESURE), pour un achat seulement (la mesure
   *  ne porte que sur des achats) ; vide en vente et sans calcul. */
  function textes(r, o) {
    if (!r || !r.ok) return { message: r ? r.message : MESSAGES.vide, resume: [], lignes: [], alerte: '', rappel: '', mesure: '' };
    const c = o || {}, base = c.base || 'BTC', u = c.unite || '$', q = quantiteAffichee(r.quantite);
    const ecartStop = partMots(Math.abs(r.prixMoyen - r.stop) / r.prixMoyen, true), avecCapital = r.capital !== null && r.capital !== undefined;
    const resume = [
      F.nombre(q.v, q.d) + ' ' + base + (r.n > 1 ? ' à chaque palier' : '') + ' (≈ ' + montant(r.mise / r.n, u) + ').',
      (r.n > 1 ? 'Tout rempli, si' : 'Si') + ' le prix touche ' + F.prix(r.stop, u) + ' : perte de ' + montant(r.perte, u)
        + (avecCapital ? ' (' + partMots(r.part, !!r.enMontant) + ' du capital)' : '') + '.',
    ];
    const lignes = [
      ['Sens', r.sens > 0 ? 'achat (stop dessous)' : 'vente (stop au-dessus)'],
      [r.n > 1 ? 'Prix moyen, tout rempli' : 'Prix d’entrée', F.prix(r.prixMoyen, u)],
      ['Stop', F.prix(r.stop, u), 'à ' + ecartStop + (r.sens > 0 ? ' sous le' : ' au-dessus du') + (r.n > 1 ? ' prix moyen' : ' prix d’entrée')],
      [r.n > 1 ? 'Mise, tout rempli' : 'Mise', montant(r.mise, u) + (avecCapital ? ' (' + partMots(r.partMise, true) + ' du capital)' : '')],
    ];
    const alerte = avecCapital && r.partMise > 1 + 1e-9 ? 'La mise dépasse le capital (' + fois(r.partMise) + '). Tout remplir demande d’emprunter (effet de levier).' : '';
    const rappel = (r.enMontant ? 'Ces ' + montant(r.perte, u) + ' sont' : 'Le ' + partMots(r.part) + ' est') + ' la perte, pas la mise. Un trou de prix '
      + (r.sens > 0 ? 'sous le' : 'au-dessus du') + ' stop coûterait plus.';
    return { message: '', resume, lignes, alerte, rappel, mesure: r.sens > 0 ? MESURE : '' };
  }
  /** Les mots d'une position ouverte (29/10, D) : la phrase de tête (le résultat au stop, depuis le
   *  prix moyen), les lignes du détail, l'alerte (la perte au stop dépasse le capital : le fait
   *  seulement) et le rappel (frais et financement non comptés ; un trou de prix coûterait plus).
   *  Au prix du moment : le résultat déjà là et ce qui reste jusqu'au stop, signés. */
  function textesPosition(r, o) {
    if (!r || !r.ok) return { message: r ? r.message : MESSAGES.vide, resume: [], lignes: [], alerte: '', rappel: '', mesure: '' };
    const c = o || {}, u = c.unite || '$', avecCapital = r.capital !== null && r.capital !== undefined;
    const sousPm = r.stop < r.entree, cote = r.sens > 0 ? ' sous le' : ' au-dessus du';
    const resume = [
      'Si le prix touche ' + F.prix(r.stop, u) + ' : ' + (r.auStop < 0 ? 'perte de ' : 'gain de ') + montant(Math.abs(r.auStop), u)
        + (avecCapital ? ' (' + partMots(Math.abs(r.auStop) / r.capital, true) + ' du capital)' : '') + '.',
      'Compté depuis le prix moyen.',
    ];
    const lignes = [
      ['Sens', r.sens > 0 ? 'achat (stop dessous)' : 'vente (stop au-dessus)'],
      ['Valeur de la position', montant(r.valeur, u) + (avecCapital ? ' (' + foisMots(r.levier) + ')' : '')],
    ];
    if (r.actuel !== null) {
      lignes.push(['Au prix du moment', signe(r.latente, u), 'à ' + F.prix(r.actuel, u)]);
      lignes.push(['Du prix du moment au stop', signe(r.reste, u), 'stop à ' + partMots(Math.abs(r.actuel - r.stop) / r.actuel, true) + cote + ' prix du moment']);
    }
    lignes.push(['Stop', F.prix(r.stop, u), 'à ' + partMots(Math.abs(r.entree - r.stop) / r.entree, true) + (sousPm ? ' sous le' : ' au-dessus du') + ' prix moyen']);
    const alerte = avecCapital && r.auStop < 0 && -r.auStop > r.capital * (1 + 1e-9) ? 'La perte au stop dépasse le capital.' : '';
    const rappel = 'Frais et financement non comptés. Un trou de prix' + cote + ' stop coûterait plus.';
    return { message: '', resume, lignes, alerte, rappel, mesure: '' };
  }
  /** Un prix rond près de v : trois chiffres utiles (84 300 ; 187 ; 0,523). */
  const rond = v => { const pas = Math.pow(10, Math.floor(Math.log10(v)) - 2); return Number((Math.round(v / pas) * pas).toPrecision(12)); };
  /** Les valeurs de « Essayer un exemple » (29/10, A), autour du prix du moment p (80 000 sans prix) :
   *  des nombres qui montrent le calcul, pas des niveaux conseillés (le panneau dit « Exemple »).
   *  avant : 3 paliers à −2, −3 et −4 %, stop à −6 %, perte 100 $ pour un capital de 10 000 $ ;
   *  ouverte : environ 2 000 $ de position, prix moyen 5 % au-dessus du prix du moment, stop 15 %
   *  dessous, capital 1 000 $. → le texte de chaque champ. */
  function exemple(p) {
    const x = fini(p) && p > 0 ? p : 80000, t = v => ecrireNombre(String(v)), qte = Number((2000 / x).toPrecision(2));
    return {
      avant: { unitePerte: '$', perte: t(100), capital: t(10000), stop: t(rond(x * 0.94)), paliers: [0.98, 0.97, 0.96].map(k => t(rond(x * k))) },
      ouverte: { quantite: t(qte), entree: t(rond(x * 1.05)), stop: t(rond(x * 0.85)), capital: t(1000) },
    };
  }
  // Ce que notre mesure a trouvé (revue du 14/10, N3 [vision-4] ; oui de Lorenzo à Q3, 14/10) :
  // marche/paliers/rapport.md, BTC 1 h 2019 → 12/10/2026, « tout rempli puis stop » 59 % puis 62 %
  // des trades. Ce chiffre ne vaut que dans ce cas (avec un stop sous le plus bas de 14 jours, c'est
  // 4 fois sur 10) : la condition est dite, la calculette ne connaît pas la fourchette de l'utilisateur.
  // Au passé (un fait mesuré, pas une prévision) ; aucune valeur conseillée (ni nombre de paliers, ni
  // écart, ni stop) ; deux phrases de 15 mots au plus (charte).
  const MESURE = 'Mesuré sur BTC (2019-2026) : paliers au bas d’une fourchette de 7 jours, stop juste dessous. Tout s’est rempli puis le prix a touché le stop, 6 fois sur 10.';
  // Les phrases fixes du panneau (relues par les tests : mots du Lisible, pas de conseil).
  // 29/10 (A) : chaque onglet dit en tête la question à laquelle il répond (15 mots au plus).
  const QUESTIONS = {
    avant: 'Combien prendre à chaque palier pour ne pas perdre plus qu’une somme choisie au stop ?',
    ouverte: 'Que coûte une position déjà ouverte si le prix touche le stop ?',
  };
  const ONGLETS = { avant: 'Avant d’entrer', ouverte: 'Position ouverte' };
  const EXEMPLE = 'Essayer un exemple';
  const PIED = 'Un calcul, pas un conseil.';
  // Les noms des champs, chacun dit en mots simples (revue du 14/10, textes-14) : [nom, ce qu'il
  // veut dire], dans l'étiquette même, pas une ligne d'aide sous le champ (le clavier du téléphone
  // couvre déjà le bas du panneau). « Un ordre », pas « un achat » : la calculette fait aussi la
  // vente (stop au-dessus des paliers). 29/10 (B, D) : la perte acceptable (en $ ou en %), et les
  // champs d'une position ouverte ; le capital facultatif quand la perte est en $.
  const NOMS = {
    perte: ['Perte acceptable', '(si le prix touche le stop)'], part: ['Part risquée', '(% du capital perdu au stop)'],
    stop: ['Stop', '(prix où la perte est coupée)'], paliers: ['Paliers', '(prix où un ordre attend)'],
    quantite: ['Quantité', '(taille de la position)'], entree: ['Prix moyen', '(prix d’entrée de la position)'],
    stopPosition: ['Stop', '(ou prix de liquidation)'], facultatif: '(facultatif)',
  };

  return { lireNombre, ecrireNombre, calculer, calculerPosition, textes, textesPosition, exemple, MESSAGES, QUESTIONS, ONGLETS, EXEMPLE, PIED, NOMS, MESURE,
    decQuantite, quantiteAffichee, partMots, fois };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Calculette;

// ─── Le panneau, dans #fichePop ──────────────────────────────────────────────
// Ouvert depuis « Choisir l'affichage » (bloc « Outils », juste avant les « Réglages fins ») :
// rien sur l'écran de départ. Deux onglets (29/10, D) : « Avant d'entrer » (les paliers) et
// « Position ouverte » ; chacun dit sa question en tête (A). Les champs en HAUT (au téléphone, le
// panneau est une feuille du bas et le clavier en couvre le bas), les résultats dessous, recalculés
// à chaque saisie. Les deux onglets restent dans la page (l'autre caché) : passer de l'un à l'autre
// garde ce qui est tapé, tant que le panneau est ouvert. Les boutons qui changent le contenu du
// panneau arrêtent leur clic (event.stopPropagation()) : sans cela, le bouton cliqué, détaché par
// le changement, ferait refermer la bulle (js/fiches.js).
let calcOnglet = 'avant', calcUnitePerte = '$';   // remis à « avant » et « $ » à chaque ouverture (sans mémoire)
/** Le nom d'un champ, et ce qu'il veut dire en plus petit (nom : un texte, ou [nom, définition]). */
const calcNomHtml = nom => Array.isArray(nom) ? echapF(nom[0]) + ' <span class="calc-def">' + echapF(nom[1]) + '</span>' : echapF(nom);
/** La ligne d'un champ : son nom, le champ (texte, clavier décimal, sans saisie automatique). */
function calcChamp(id, nom, valeur, extra) {
  return '<div class="ligne-reglage calc-ligne"><label class="calc-nom" for="' + id + '" id="' + id + 'Nom">' + calcNomHtml(nom) + '</label>'
    + '<input id="' + id + '" type="text" inputmode="decimal" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="next" value="' + echapF(valeur || '') + '">'
    + (extra || '') + '</div>';
}
/** Les lignes des paliers (valeurs : le texte de chaque champ). */
function calcPaliersHtml(valeurs) {
  const n = valeurs.length;
  return valeurs.map((v, k) => calcChamp('calcPalier' + k, 'Palier ' + (k + 1), v,
    n > 1 ? '<button type="button" class="glossaire-item calc-retirer" aria-label="Retirer le palier ' + (k + 1) + '" onclick="event.stopPropagation();calculetteRetirer(' + k + ')">Retirer</button>' : '')).join('')
    + (n < PARAM.risque.paliersMax ? '<button type="button" class="glossaire-item calc-ajouter" onclick="event.stopPropagation();calculetteAjouter()">Ajouter un palier</button>' : '');
}
/** L'unité des prix et du capital ($, ou SOL sur BTC/SOL) et celle des quantités (BTC, SOL…). */
const calcUnites = () => ({ unite: typeof guideUnite === 'function' ? guideUnite() : '$', base: typeof uniteVolume === 'function' ? uniteVolume() : 'BTC' });
/** Le prix du moment (le prix de l'en-tête), ou null. */
const calcPrixMoment = () => typeof livePrice !== 'undefined' && typeof livePrice === 'number' && isFinite(livePrice) && livePrice > 0 ? livePrice : null;
/** Le nom du capital : facultatif quand la perte est un montant (29/10, B). */
const calcNomCapital = (unite, facultatif) => facultatif ? ['Capital (' + unite + ')', Calculette.NOMS.facultatif] : 'Capital (' + unite + ')';
/** Le choix de l'unité de la perte : un montant (l'unité des prix) ou un % du capital. */
function calcUnitesHtml(unite) {
  return '<span class="calc-unites" role="group" aria-label="Perte en">'
    + [['$', unite], ['%', '%']].map(([u, t]) => '<button type="button" class="glossaire-item calc-choix calc-unite" data-unite="' + u + '" aria-pressed="' + (calcUnitePerte === u)
      + '" aria-label="' + (u === '$' ? 'Perte en ' + echapF(unite) : 'Perte en % du capital') + '" onclick="event.stopPropagation();calculetteUnite(\'' + u + '\')">' + echapF(t) + '</button>').join('')
    + '</span>';
}
/** Ouvre la calculette dans #fichePop (ancre : l'élément qui rendra le focus à la fermeture). */
function ouvrirCalculette(ancre) {
  const p = document.getElementById('fichePop');
  if (!p) return false;
  const { unite, base } = calcUnites(), N = Calculette.NOMS;
  calcOnglet = 'avant'; calcUnitePerte = '$';
  const onglet = k => '<button type="button" class="glossaire-item calc-choix calc-onglet" data-onglet="' + k + '" aria-pressed="' + (k === 'avant')
    + '" onclick="event.stopPropagation();calculetteOnglet(\'' + k + '\')">' + echapF(Calculette.ONGLETS[k]) + '</button>';
  const question = k => '<div class="calc-tete"><p class="fiche-simple calc-question">' + echapF(Calculette.QUESTIONS[k]) + '</p>'
    + '<button type="button" class="glossaire-item calc-exemple" onclick="event.stopPropagation();calculetteExemple()">' + echapF(Calculette.EXEMPLE) + '</button></div>';
  p.innerHTML = '<div class="fiche-tete"><h3 class="fiche-titre">Calculette de risque</h3><button type="button" class="fiche-fermer" onclick="fermerFiche()" aria-label="Fermer">×</button></div>'
    + '<div class="calc" oninput="calculetteMaj()" onkeydown="calculetteTouche(event)" onchange="calculetteSortie(event)">'
    + '<div class="calc-onglets" role="group" aria-label="Ce qu’on calcule">' + onglet('avant') + onglet('ouverte') + '</div>'
    + '<div class="calc-volet" id="calcAvant">' + question('avant')
    + '<div class="calc-champs">'
    + calcChamp('calcPerte', N.perte, '', calcUnitesHtml(unite))
    + calcChamp('calcCapital', calcNomCapital(unite, true), '')
    + calcChamp('calcStop', N.stop, '')
    + '<fieldset class="calc-paliers"><legend class="calc-legende">' + calcNomHtml(N.paliers) + '</legend><div id="calcPaliers">' + calcPaliersHtml(['']) + '</div></fieldset>'
    + '</div></div>'
    + '<div class="calc-volet" id="calcOuverte" hidden>' + question('ouverte')
    + '<div class="calc-champs">'
    + calcChamp('calcQuantite', [N.quantite[0] + ' (' + base + ')', N.quantite[1]], '')
    + calcChamp('calcEntree', N.entree, '')
    + calcChamp('calcStopPosition', N.stopPosition, '')
    + calcChamp('calcCapitalPosition', calcNomCapital(unite, true), '')
    + '</div></div>'
    + '<div class="calc-resultats" id="calcResultats" aria-live="polite"></div>'
    + '</div>'
    + '<p class="fiche-pied">' + echapF(Calculette.PIED) + '</p>';
  p.hidden = false;
  p.style.left = ''; p.style.top = '';
  p.scrollTop = 0;
  p.setAttribute('aria-label', 'Calculette de risque');
  ficheOuverte = 'calculette'; ficheRetour = ancre || null;
  calculetteMaj();
  // Le focus sur la croix, pas sur un champ : le clavier du téléphone ne surgit pas à l'ouverture.
  const b = p.querySelector('.fiche-fermer');
  if (b && b.focus) b.focus({ preventScroll: true });
  return true;
}
/** Depuis « Choisir l'affichage » : le panneau se ferme, la calculette s'ouvre ; à sa fermeture,
 *  le focus revient au bouton « Choisir l'affichage ». */
function ouvrirCalculetteMenu() {
  const m = document.getElementById('indMenu'), b = document.getElementById('indDropdownBtn');
  if (m) m.classList.remove('open');
  if (b) b.setAttribute('aria-expanded', 'false');
  ouvrirCalculette(b);
}
/** Passe d'un onglet à l'autre (« avant » ou « ouverte ») ; ce qui est tapé reste. */
function calculetteOnglet(k) {
  calcOnglet = k === 'ouverte' ? 'ouverte' : 'avant';
  for (const b of document.querySelectorAll('#fichePop .calc-onglet')) b.setAttribute('aria-pressed', String(b.dataset.onglet === calcOnglet));
  const av = document.getElementById('calcAvant'), ou = document.getElementById('calcOuverte');
  if (av) av.hidden = calcOnglet !== 'avant';
  if (ou) ou.hidden = calcOnglet !== 'ouverte';
  calculetteMaj();
}
/** La perte en montant (« $ ») ou en % du capital. Le champ repart de sa valeur de départ (vide en
 *  montant, PARAM.risque.part en %) : « 1 500 » ne devient pas « 1 500 % ». */
function calculetteUnite(u) {
  const nouvelle = u === '%' ? '%' : '$';
  if (nouvelle === calcUnitePerte) return;
  calcUnitePerte = nouvelle;
  const { unite } = calcUnites();
  for (const b of document.querySelectorAll('#fichePop .calc-unite')) b.setAttribute('aria-pressed', String(b.dataset.unite === calcUnitePerte));
  const i = document.getElementById('calcPerte');
  if (i) i.value = calcUnitePerte === '%' ? Fmt.nombre(PARAM.risque.part, Number.isInteger(PARAM.risque.part) ? 0 : 1) : '';
  const nom = document.getElementById('calcPerteNom');
  if (nom) nom.innerHTML = calcNomHtml(calcUnitePerte === '%' ? Calculette.NOMS.part : Calculette.NOMS.perte);
  const cap = document.getElementById('calcCapitalNom');
  if (cap) cap.innerHTML = calcNomHtml(calcNomCapital(unite, calcUnitePerte === '$'));
  calculetteMaj();
}
/** « Essayer un exemple » : remplit les champs de l'onglet ouvert autour du prix du moment. */
function calculetteExemple() {
  const ex = Calculette.exemple(calcPrixMoment()), met = (id, v) => { const i = document.getElementById(id); if (i) i.value = v; };
  if (calcOnglet === 'ouverte') {
    const o = ex.ouverte;
    met('calcQuantite', o.quantite); met('calcEntree', o.entree); met('calcStopPosition', o.stop); met('calcCapitalPosition', o.capital);
  } else {
    const a = ex.avant;
    if (calcUnitePerte !== '$') calculetteUnite('$');
    met('calcPerte', a.perte); met('calcCapital', a.capital); met('calcStop', a.stop);
    const z = document.getElementById('calcPaliers');
    if (z) z.innerHTML = calcPaliersHtml(a.paliers);
  }
  calculetteMaj();
}
/** Le texte des champs de paliers, dans l'ordre. */
const calcValeursPaliers = () => [...document.querySelectorAll('#calcPaliers input')].map(i => i.value);
function calculetteAjouter() {
  const v = calcValeursPaliers();
  if (v.length >= PARAM.risque.paliersMax) return;
  v.push('');
  const z = document.getElementById('calcPaliers');
  z.innerHTML = calcPaliersHtml(v);
  const i = document.getElementById('calcPalier' + (v.length - 1));
  if (i) i.focus();
  calculetteMaj();
}
function calculetteRetirer(k) {
  const v = calcValeursPaliers();
  if (v.length <= 1) return;
  v.splice(k, 1);
  document.getElementById('calcPaliers').innerHTML = calcPaliersHtml(v);
  const b = document.querySelector('#calcPaliers .calc-ajouter') || document.getElementById('calcPalier0');
  if (b) b.focus();
  calculetteMaj();
}
/** Recalcule à chaque saisie : les résultats sous les champs, ceux de l'onglet ouvert. */
function calculetteMaj() {
  const z = document.getElementById('calcResultats');
  if (!z) return;
  const val = id => { const i = document.getElementById(id); return i ? i.value : ''; }, U = calcUnites();
  let r, T;
  if (calcOnglet === 'ouverte') {
    r = Calculette.calculerPosition({ quantite: val('calcQuantite'), entree: val('calcEntree'), stop: val('calcStopPosition'), capital: val('calcCapitalPosition'), actuel: calcPrixMoment() });
    T = Calculette.textesPosition(r, U);
  } else {
    r = Calculette.calculer({ unitePerte: calcUnitePerte, perte: val('calcPerte'), capital: val('calcCapital'), stop: val('calcStop'), paliers: calcValeursPaliers() });
    T = Calculette.textes(r, U);
  }
  window.__calculette = r;   // relu par les tests
  z.innerHTML = r.ok
    ? '<p class="calc-resume"><strong>' + echapF(T.resume[0]) + '</strong> ' + echapF(T.resume[1]) + '</p>'
      + '<dl class="stats-table calc-table">' + T.lignes.map(([k, v, c]) => '<dt>' + echapF(k) + '</dt><dd>' + echapF(v) + (c ? ' <span class="calc-sous">' + echapF(c) + '</span>' : '') + '</dd>').join('') + '</dl>'
      + (T.alerte ? '<p class="calc-alerte">' + echapF(T.alerte) + '</p>' : '')
      + '<p class="calc-rappel">' + echapF(T.rappel) + '</p>'
      + (T.mesure ? '<p class="calc-mesure">' + echapF(T.mesure) + '</p>' : '')
    : '<p class="calc-message' + (r.code === 'vide' ? ' calc-attente' : '') + '">' + echapF(T.message) + '</p>';
  // La phrase de tête et la ligne mesurée (revue du 14/10, N3) : « 7 jours », « 67 000 $ » et le
  // « : » restent avec leur mot (C8).
  for (const el of z.querySelectorAll('.calc-mesure, .calc-resume')) Fmt.insecables(el);
}
/** En quittant un champ modifié (« change », qui remonte jusqu'à .calc), son nombre réécrit à la
 *  française : « 80000 » → « 80 000 » (revue du 14/10, vA-9). Le nombre lu ne change pas (sauf
 *  au-delà de 8 décimales) ; le calcul est refait quand même, pour rester juste. */
function calculetteSortie(e) {
  const i = e && e.target;
  if (!i || i.tagName !== 'INPUT') return;
  const t = Calculette.ecrireNombre(i.value);
  if (t === i.value) return;
  i.value = t;
  calculetteMaj();
}
/** Entrée dans un champ : le champ suivant (de l'onglet ouvert) ; après le dernier, le clavier se range. */
function calculetteTouche(e) {
  if (e.key !== 'Enter' || !e.target || e.target.tagName !== 'INPUT') return;
  e.preventDefault();
  const champs = [...document.querySelectorAll('.calc input')].filter(i => !i.closest('[hidden]')), k = champs.indexOf(e.target);
  if (k >= 0 && k < champs.length - 1) champs[k + 1].focus(); else e.target.blur();
}
