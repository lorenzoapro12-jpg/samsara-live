// Mesure d'audience (js/mesure.js) — hors ligne, navigateur simulé.
//   1. compteur éteint (code vide), hors site publié, robot, ?moi : aucune requête ;
//   2. site publié : une page vue, chemin sans paramètres, origine réduite au site ;
//   3. outils : nom stable (attribut ou id), jamais un texte ; une fois par visite ; plafond ;
//   4. durée : une seule tranche, au premier départ de l'onglet.
const fs = require('fs'), vm = require('vm'), path = require('path');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'js', 'mesure.js'), 'utf8');
let ko = 0;
const check = (nom, ok, info) => { console.log(`  ${ok ? '✓' : '✗'} ${nom}${ok || info === undefined ? '' : ' — ' + JSON.stringify(info)}`); if (!ok) ko = 1; };

function el(tag, attrs, parent) {
  return { tagName: tag.toUpperCase(), id: attrs.id || '', parentNode: parent || null,
           getAttribute: k => (k in attrs ? attrs[k] : null) };
}
function monter({ code = 'essai', host = 'lorenzoapro12-jpg.github.io', proto = 'https:', search = '', webdriver = false, moi = null, referrer = '' } = {}) {
  const envois = [], ecoute = {}, store = {};
  if (moi) store['samsara-mesure-moi'] = moi;
  const doc = { title: 'Saṃsāra', referrer, visibilityState: 'visible',
                addEventListener: (t, f) => { ecoute[t] = f; } };
  const g = {
    document: doc,
    location: { protocol: proto, hostname: host, host, pathname: '/samsara-live/', search },
    navigator: { webdriver, sendBeacon: u => { envois.push(u); return true; } },
    screen: { width: 390 },
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
    addEventListener: (t, f) => { ecoute['w:' + t] = f; },
    Image: function () {},
  };
  g.window = g;
  vm.runInNewContext(SRC.replace("var MESURE_ADRESSE = 'https://samsara.goatcounter.com/count';", `var MESURE_ADRESSE = '${code ? 'https://' + code + '.goatcounter.com/count' : ''}';`), g);
  return { g, envois, ecoute, store, doc };
}
const params = u => Object.fromEntries(new URL(u).searchParams);

// 1. Pas de compteur
for (const [nom, opt, raison] of [
  ['code vide', { code: '' }, 'éteint'],
  ['fichier local', { proto: 'file:', host: '' }, 'hors site publié'],
  ['localhost', { proto: 'http:', host: 'localhost' }, 'hors site publié'],
  ['robot', { webdriver: true }, 'robot'],
  ['?moi', { search: '?moi' }, 'moi'],
  ['exclu gardé', { moi: '1' }, 'moi'],
]) {
  const { g, envois } = monter(opt);
  check(`${nom} : aucune requête (${raison})`, envois.length === 0 && g.SamsaraMesure.raison === raison, { envois, r: g.SamsaraMesure.raison });
}
{ const { store, envois } = monter({ search: '?moi=0', moi: '1' });
  check('?moi=0 : de nouveau compté', !('samsara-mesure-moi' in store) && envois.length === 1); }

// 2. Page vue
{ const { envois } = monter({ search: '?paire=ETH&x=secret', referrer: 'https://www.google.com/search?q=btc' });
  const p = params(envois[0]);
  check('une page vue envoyée à <code>.goatcounter.com/count', envois.length === 1 && envois[0].startsWith('https://essai.goatcounter.com/count?'), envois);
  check('chemin sans paramètres', p.p === '/samsara-live/', p);
  check('origine réduite au site', p.r === 'https://www.google.com', p);
  check('largeur écran, pas d’événement', p.s === '390' && !('e' in p), p); }
{ const { envois } = monter({ referrer: 'https://lorenzoapro12-jpg.github.io/samsara-live/bookmap.html' });
  check('venir du site lui-même : pas d’origine', !('r' in params(envois[0]))); }

// 3. Outils
{ const { g, envois, ecoute } = monter();
  const M = g.SamsaraMesure;
  const bouton = el('button', { id: 'themeBtn' });
  const icone = el('span', {}, bouton);
  check('id d’un bouton → outil/<id>', M.nomOutil(icone) === 'outil/themeBtn');
  const ind = el('label', { 'data-ind': 'rsi12' }); const caseInd = el('input', { id: '' }, ind);
  check('attribut data-ind → indicateur/<nom>', M.nomOutil(caseInd) === 'indicateur/rsi12');
  check('div sans nom → rien', M.nomOutil(el('div', { id: 'prix' })) === '');
  check('valeur douteuse (espace, prix) → ignorée', M.nomOutil(el('button', { id: '76 100 $' })) === '');
  ecoute.click({ target: icone }); ecoute.click({ target: icone }); ecoute.change({ target: caseInd });
  const ev = envois.slice(1).map(params);
  check('un outil compté une fois par visite', ev.length === 2 && ev[0].p === 'outil/themeBtn' && ev[0].e === 'true' && ev[1].p === 'indicateur/rsi12', ev);
  for (let i = 0; i < 60; i++) M.noterOutil('outil/b' + i);
  check('plafond de 40 outils par visite', envois.length - 1 === 40, envois.length - 1); }

// 4. Durée
{ const { g, envois, ecoute, doc } = monter();
  check('tranches', ['moins-10s', '10s-1min', '1-5min', '5-15min', '15-60min', 'plus-1h'].join() === [5, 30, 120, 600, 1200, 5000].map(g.SamsaraMesure.tranche).join());
  doc.visibilityState = 'hidden'; ecoute.visibilitychange();
  doc.visibilityState = 'visible'; ecoute.visibilitychange();
  doc.visibilityState = 'hidden'; ecoute.visibilitychange(); ecoute['w:pagehide']();
  const d = envois.slice(1).map(params);
  check('une seule durée envoyée', d.length === 1 && d[0].p === 'duree/moins-10s' && d[0].e === 'true', d); }

console.log(ko ? '\n✗ mesure : échec' : '\n✓ mesure : tout passe');
process.exit(ko);
