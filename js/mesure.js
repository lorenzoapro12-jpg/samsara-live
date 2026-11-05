// ═══════════════════════════════════════════════════════════════════════════════
// MESURE D'AUDIENCE — anonyme, sans cookie, envoyée à GoatCounter.
// ─────────────────────────────────────────────────────────────────────────────
// Ce qui part : la page vue (chemin, sans paramètres), le site d'où vient le visiteur,
// la largeur de l'écran, et des « événements » sans valeur personnelle :
//   · outil/<nom>  : un bouton ou un réglage touché pendant la visite (une fois par visite) ;
//   · duree/<tranche> : le temps passé page visible, envoyé une fois, quand on quitte l'onglet.
// Rien d'autre : ni prix, ni texte saisi, ni identifiant, ni cookie. GoatCounter ne garde
// pas l'adresse IP (il en tire le pays, puis la jette).
//
// Pas de compteur quand :
//   · MESURE_ADRESSE est vide (compteur éteint) ;
//   · la page n'est pas servie par le site publié (fichier local, localhost, tests) ;
//   · le navigateur est piloté par un robot (navigator.webdriver : Playwright, Selenium) ;
//   · le visiteur a ouvert une fois le site avec ?moi : ses visites ne comptent plus
//     sur ce navigateur (?moi=0 pour annuler). Pour que Lorenzo ne se compte pas lui-même.
//
// Aucun script tiers n'est chargé : on appelle directement l'adresse /count de GoatCounter,
// avec les mêmes paramètres que son script officiel (p, t, r, e, s, b, rnd).
// tests/test_mesure.js fait tenir ces règles.
// ═══════════════════════════════════════════════════════════════════════════════
(function (g) {
  'use strict';
  // Adresse du compteur (compte GoatCounter de Lorenzo). Vide = compteur éteint.
  var MESURE_ADRESSE = '';
  var HOTES_PUBLIES = /(^|\.)github\.io$/;       // le site publié (GitHub Pages)
  var CLE_MOI = 'samsara-mesure-moi';
  var MAX_OUTILS = 40;                           // plafond d'événements « outil » par visite

  var doc = g.document, loc = g.location, nav = g.navigator || {};

  function stockage(lire, val) {
    try {
      if (lire) return g.localStorage.getItem(CLE_MOI);
      if (val === null) g.localStorage.removeItem(CLE_MOI); else g.localStorage.setItem(CLE_MOI, val);
    } catch (e) { /* navigation privée */ }
    return null;
  }

  // ?moi / ?moi=1 → exclu ; ?moi=0 → de nouveau compté.
  var m = /[?&]moi(=([^&#]*))?/.exec(loc.search || '');
  if (m) stockage(false, m[2] === '0' ? null : '1');

  function raisonDeNePasCompter() {
    if (!MESURE_ADRESSE) return 'éteint';
    if (loc.protocol !== 'https:' || !HOTES_PUBLIES.test(loc.hostname)) return 'hors site publié';
    if (nav.webdriver) return 'robot';
    if (stockage(true) === '1') return 'moi';
    return '';
  }
  var raison = raisonDeNePasCompter();
  var actif = !raison;

  // Chemin sans paramètres ni ancre : un paramètre peut porter n'importe quoi.
  function chemin() { return loc.pathname || '/'; }
  // Le site d'origine seulement, jamais l'adresse complète de la page d'où l'on vient.
  function origine() {
    var r = doc.referrer || '';
    var mm = /^https?:\/\/([^/?#]+)/.exec(r);
    if (!mm || mm[1] === loc.host) return '';
    return 'https://' + mm[1];
  }

  function url(vars) {
    var d = { p: vars.p, t: vars.t || '', r: vars.r || '', e: vars.e ? 'true' : '',
              s: (g.screen && g.screen.width) || '', rnd: Math.random().toString(36).slice(2, 7) };
    var q = [];
    for (var k in d) if (d[k] !== '' && d[k] != null) q.push(encodeURIComponent(k) + '=' + encodeURIComponent(d[k]));
    return MESURE_ADRESSE + '?' + q.join('&');
  }
  function envoyer(vars) {
    if (!actif) return false;
    var u = url(vars);
    try { if (nav.sendBeacon && nav.sendBeacon(u)) return true; } catch (e) { /* repli image */ }
    try { var img = new g.Image(); img.src = u; return true; } catch (e) { return false; }
  }

  // ─── Outils touchés : un nom stable, jamais un texte affiché (qui peut porter un prix) ───
  var ATTRS = [['data-ind', 'indicateur'], ['data-theme-id', 'theme'], ['data-paire', 'paire'],
               ['data-structure', 'structure'], ['data-preset', 'prereglage'], ['data-mode', 'mode'],
               ['data-cat', 'categorie'], ['data-calque', 'calque']];
  var NOM_SUR = /^[A-Za-z0-9_.:-]{1,40}$/;
  function nomOutil(el) {
    for (var n = el; n && n.getAttribute; n = n.parentNode) {
      for (var i = 0; i < ATTRS.length; i++) {
        var v = n.getAttribute(ATTRS[i][0]);
        if (v != null && NOM_SUR.test(v)) return ATTRS[i][1] + '/' + v;
      }
      var tag = (n.tagName || '').toLowerCase();
      if ((tag === 'button' || tag === 'a' || tag === 'select' || tag === 'input' || n.getAttribute('role') === 'button') && n.id && NOM_SUR.test(n.id))
        return 'outil/' + n.id;
    }
    return '';
  }
  var dejaVus = {}, nbOutils = 0;
  function noterOutil(nom) {
    if (!nom || dejaVus[nom] || nbOutils >= MAX_OUTILS) return false;
    dejaVus[nom] = 1; nbOutils++;
    return envoyer({ p: nom, t: nom, e: true });
  }

  // ─── Durée : temps page visible, envoyé une seule fois, au premier départ de l'onglet ───
  var TRANCHES = [[10, 'moins-10s'], [60, '10s-1min'], [300, '1-5min'], [900, '5-15min'], [3600, '15-60min'], [Infinity, 'plus-1h']];
  function tranche(sec) { for (var i = 0; i < TRANCHES.length; i++) if (sec < TRANCHES[i][0]) return TRANCHES[i][1]; return 'plus-1h'; }
  var visibleDepuis = Date.now(), cumul = 0, cache = false, dureeEnvoyee = false;
  function depart() {
    if (!cache) { cumul += Date.now() - visibleDepuis; cache = true; }
    if (dureeEnvoyee) return;
    dureeEnvoyee = true;
    var nom = 'duree/' + tranche(cumul / 1000);
    envoyer({ p: nom, t: nom, e: true });
  }
  function surVisibilite() {
    if (doc.visibilityState === 'hidden') depart();
    else { visibleDepuis = Date.now(); cache = false; }
  }

  g.SamsaraMesure = { actif: actif, raison: raison, nomOutil: nomOutil, tranche: tranche, url: url, noterOutil: noterOutil };
  if (!actif) return;

  envoyer({ p: chemin(), t: doc.title, r: origine() });
  doc.addEventListener('click', function (ev) { noterOutil(nomOutil(ev.target)); }, true);
  doc.addEventListener('change', function (ev) { noterOutil(nomOutil(ev.target)); }, true);
  doc.addEventListener('visibilitychange', surVisibilite);
  g.addEventListener('pagehide', depart);
})(typeof window !== 'undefined' ? window : this);
