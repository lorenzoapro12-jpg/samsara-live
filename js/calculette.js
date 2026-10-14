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
  };
  const echec = (code, champ, k) => ({ ok: false, code, champ, index: k === undefined ? null : k,
    message: typeof MESSAGES[code] === 'function' ? MESSAGES[code](k + 1) : MESSAGES[code] });
  const vide = t => t === undefined || t === null || String(t).trim() === '';

  /** Le calcul. e = { capital, part (en %), stop, paliers: [prix…] } — des nombres ou le texte des
   *  champs. Les lignes de palier vides sont ignorées ; tout le reste doit être lisible.
   *  → { ok: true, sens (1 achat, −1 vente), n, paliers (les prix lus), capital, part (fraction),
   *      perte (= capital × part), ecart (Σ |pᵢ − s|), quantite (exacte), prixMoyen, mise,
   *      partMise (mise / capital) }
   *  ou { ok: false, code, champ ('tout' | 'capital' | 'part' | 'stop' | 'palier'), index, message }. */
  function calculer(e) {
    const o = e || {}, brutes = (o.paliers || []).map((t, k) => ({ t, k })).filter(x => !vide(x.t));
    if (vide(o.capital) && vide(o.stop) && !brutes.length) return echec('vide', 'tout');
    const lu = (t, champ, positif) => {
      if (vide(t)) return { err: champ + '_vide' };
      const v = lireNombre(t);
      if (v === null) return { err: champ + '_illisible' };
      if (positif && !(v > 0)) return { err: champ + '_nul' };
      return { v };
    };
    const C = lu(o.capital, 'capital', true);
    if (C.err) return echec(C.err, 'capital');
    const P = lu(o.part, 'part', false);
    if (P.err) return echec(P.err, 'part');
    if (!(P.v > 0 && P.v <= 100)) return echec('part_hors', 'part');
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
    const n = prix.length, part = P.v / 100, perte = C.v * part;
    const ecart = prix.reduce((a, p) => a + Math.abs(p - s), 0), somme = prix.reduce((a, p) => a + p, 0);
    const quantite = perte / ecart, mise = quantite * somme;
    return { ok: true, sens, n, paliers: prix, stop: s, capital: C.v, part, perte, ecart, quantite, prixMoyen: somme / n, mise, partMise: mise / C.v };
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
  /** Les lignes du résultat ([nom, valeur, complément?]…), la ligne d'alerte et la ligne de rappel.
   *  o = { base ('BTC'), unite ('$') }.
   *  Revue du 14/10 (vA-9) : le stop est redit, avec son écart au prix moyen en complément (une ligne
   *  sous le prix, qui n'élargit pas la colonne des valeurs) : un zéro en trop ou en moins s'y voit. Revue du 14/10 (vision-3, fonctionnement-7) : quand la mise dépasse le capital,
   *  une ligne d'alerte le dit (« 830 % du capital » seul ne dit pas qu'il faudrait emprunter) ; le
   *  fait seulement, aucun conseil. Vide sinon. */
  function textes(r, o) {
    if (!r || !r.ok) return { message: r ? r.message : MESSAGES.vide, lignes: [], alerte: '', rappel: '' };
    const c = o || {}, base = c.base || 'BTC', u = c.unite || '$', q = quantiteAffichee(r.quantite);
    const ecartStop = partMots(Math.abs(r.prixMoyen - r.stop) / r.prixMoyen, true);
    const lignes = [
      ['Sens', r.sens > 0 ? 'achat (stop dessous)' : 'vente (stop au-dessus)'],
      ['Quantité par palier', F.nombre(q.v, q.d) + ' ' + base + ' (≈ ' + montant(r.mise / r.n, u) + ')'],
      ['Prix moyen, tout rempli', F.prix(r.prixMoyen, u)],
      ['Stop', F.prix(r.stop, u), 'à ' + ecartStop + (r.sens > 0 ? ' sous le' : ' au-dessus du') + ' prix moyen'],
      ['Perte au stop, tout rempli', montant(r.perte, u) + ' (' + partMots(r.part) + ' du capital)'],
      ['Mise, tout rempli', montant(r.mise, u) + ' (' + partMots(r.partMise, true) + ' du capital)'],
    ];
    const alerte = r.partMise > 1 + 1e-9 ? 'La mise dépasse le capital (' + fois(r.partMise) + '). Tout remplir demande d’emprunter (effet de levier).' : '';
    const rappel = 'Le ' + partMots(r.part) + ' est la perte, pas la mise. Un trou de prix ' + (r.sens > 0 ? 'sous le' : 'au-dessus du') + ' stop coûterait plus.';
    return { message: '', lignes, alerte, rappel };
  }
  // Les phrases fixes du panneau (relues par les tests : mots du Lisible, pas de conseil).
  // Revue du 14/10 (textes-14) : « le prix touche le stop » au lieu de « le stop saute », jamais
  // expliqué ; la phrase est tournée autrement pour rester sous 15 mots (charte).
  const PHRASE = 'Elle donne la taille de chaque palier, la même pour tous. Une fois tout rempli, si le prix touche le stop, on perd la part risquée.';
  const PIED = 'Un calcul, pas un conseil.';
  // Les noms des champs, chacun dit en mots simples (revue du 14/10, textes-14) : [nom, ce qu'il
  // veut dire], dans l'étiquette même, pas une ligne d'aide sous le champ (le clavier du téléphone
  // couvre déjà le bas du panneau). « Un ordre », pas « un achat » : la calculette fait aussi la
  // vente (stop au-dessus des paliers).
  const NOMS = { part: ['Part risquée', '(% du capital perdu au stop)'], stop: ['Stop', '(prix où la perte est coupée)'], paliers: ['Paliers', '(prix où un ordre attend)'] };

  return { lireNombre, ecrireNombre, calculer, textes, MESSAGES, PHRASE, PIED, NOMS, decQuantite, quantiteAffichee, partMots, fois };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = Calculette;

// ─── Le panneau, dans #fichePop ──────────────────────────────────────────────
// Ouvert depuis « Choisir l'affichage » (bloc « Outils », juste avant les « Réglages fins ») :
// rien sur l'écran de départ. Les champs en HAUT (au téléphone, le panneau est une feuille du bas
// et le clavier en couvre le bas), les résultats dessous, recalculés à chaque saisie. Les boutons
// qui changent le contenu du panneau arrêtent leur clic (event.stopPropagation()) : sans cela, le
// bouton cliqué, détaché par le changement, ferait refermer la bulle (js/fiches.js).
/** Le nom d'un champ, et ce qu'il veut dire en plus petit (nom : un texte, ou [nom, définition]). */
const calcNomHtml = nom => Array.isArray(nom) ? echapF(nom[0]) + ' <span class="calc-def">' + echapF(nom[1]) + '</span>' : echapF(nom);
/** La ligne d'un champ : son nom, le champ (texte, clavier décimal, sans saisie automatique). */
function calcChamp(id, nom, valeur, extra) {
  return '<div class="ligne-reglage calc-ligne"><label class="calc-nom" for="' + id + '">' + calcNomHtml(nom) + '</label>'
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
/** Ouvre la calculette dans #fichePop (ancre : l'élément qui rendra le focus à la fermeture). */
function ouvrirCalculette(ancre) {
  const p = document.getElementById('fichePop');
  if (!p) return false;
  const { unite } = calcUnites();
  p.innerHTML = '<div class="fiche-tete"><h3 class="fiche-titre">Calculette de risque</h3><button type="button" class="fiche-fermer" onclick="fermerFiche()" aria-label="Fermer">×</button></div>'
    + '<div class="calc" oninput="calculetteMaj()" onkeydown="calculetteTouche(event)" onchange="calculetteSortie(event)">'
    + '<p class="fiche-simple">' + echapF(Calculette.PHRASE) + '</p>'
    + '<div class="calc-champs">'
    + calcChamp('calcCapital', 'Capital (' + unite + ')', '')
    + calcChamp('calcPart', Calculette.NOMS.part, Fmt.nombre(PARAM.risque.part, Number.isInteger(PARAM.risque.part) ? 0 : 1))
    + calcChamp('calcStop', Calculette.NOMS.stop, '')
    + '<fieldset class="calc-paliers"><legend class="calc-legende">' + calcNomHtml(Calculette.NOMS.paliers) + '</legend><div id="calcPaliers">' + calcPaliersHtml(['']) + '</div></fieldset>'
    + '</div>'
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
/** Recalcule à chaque saisie : les résultats sous les champs. */
function calculetteMaj() {
  const z = document.getElementById('calcResultats');
  if (!z) return;
  const val = id => { const i = document.getElementById(id); return i ? i.value : ''; };
  const r = Calculette.calculer({ capital: val('calcCapital'), part: val('calcPart'), stop: val('calcStop'), paliers: calcValeursPaliers() });
  const T = Calculette.textes(r, calcUnites());
  window.__calculette = r;   // relu par les tests
  z.innerHTML = r.ok
    ? '<dl class="stats-table calc-table">' + T.lignes.map(([k, v, c]) => '<dt>' + echapF(k) + '</dt><dd>' + echapF(v) + (c ? ' <span class="calc-sous">' + echapF(c) + '</span>' : '') + '</dd>').join('') + '</dl>'
      + (T.alerte ? '<p class="calc-alerte">' + echapF(T.alerte) + '</p>' : '')
      + '<p class="calc-rappel">' + echapF(T.rappel) + '</p>'
    : '<p class="calc-message' + (r.code === 'vide' ? ' calc-attente' : '') + '">' + echapF(T.message) + '</p>';
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
/** Entrée dans un champ : le champ suivant ; après le dernier, le clavier se range. */
function calculetteTouche(e) {
  if (e.key !== 'Enter' || !e.target || e.target.tagName !== 'INPUT') return;
  e.preventDefault();
  const champs = [...document.querySelectorAll('.calc input')], k = champs.indexOf(e.target);
  if (k >= 0 && k < champs.length - 1) champs[k + 1].focus(); else e.target.blur();
}
