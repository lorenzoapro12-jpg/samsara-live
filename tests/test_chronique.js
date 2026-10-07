// CHRONIQUE (js/chronique.js) — hors ligne. Un dépôt simulé (publications et cartes de chaleur
// alternées, comme le cron les pousse) répond aux lectures /master~N/ ; on vérifie la marche,
// ses arrêts, le comblement des trous, le cache et le tracé — sans réseau.
//   node tests/test_chronique.js
const fs = require('fs'), path = require('path');
const REPO = path.join(__dirname, '..');
const K = require(path.join(REPO, 'js/chronique.js'));
let ko = 0;
const check = (nom, ok, det) => { if (!ok) ko++; console.log(`  ${ok ? '✓' : '✗'} ${nom}${!ok && det !== undefined ? ' — ' + JSON.stringify(det).slice(0, 400) : ''}`); };
const titre = t => console.log(`\n── ${t} ──`);

const URL0 = 'https://raw.githubusercontent.com/o/r/master/market-data.json';
const T0 = Date.parse('2026-10-07T15:48:00Z'), MIN = 60000;
const pub = (t, extra) => Object.assign({ updated: new Date(t).toISOString(), micro: { cvd_24h_usd: 1e6 + t / 1e9, oi_change_24h_pct: 1.5 }, tf: { '4h': { rsi_14: 50 } } }, extra || {});
/** Dépôt simulé : commits du plus récent au plus ancien ; 'm' = publication (t), 'h' = carte. */
function depot(commits) {
  // Contenu de market-data.json à master~N : la dernière publication à ce commit ou avant.
  return n => { for (let i = n; i < commits.length; i++) if (commits[i].m) return commits[i].m; return null; };
}
function alterne(nPubs, pas, opts) {
  const c = [];
  for (let i = 0; i < nPubs; i++) {
    c.push({ m: pub(T0 - i * pas * MIN) });
    // Sans carte entre deux publications (les deux crons à la même minute, 13:33 le 07/10) :
    // la parité bascule, et le pas de 2 saute une publication.
    if (!(opts && opts.sansCarte && opts.sansCarte.includes(i))) c.push({ h: 1 });
  }
  return c;
}
function faux(lecture, statut) {
  const lus = [];
  const f = async u => {
    const n = +((u.match(/master~(\d+)\//) || [])[1]);
    lus.push(n);
    const st = statut && statut(n);
    if (st) return { ok: false, status: st };
    const md = lecture(n);
    if (!md) return { ok: false, status: 404 };
    return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(md)) };
  };
  f.lus = lus;
  return f;
}
const memoire = () => { const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, _m: m }; };
const CH = ['micro.cvd_24h_usd', 'micro.oi_change_24h_pct', 'tf.4h.rsi_14'];

(async () => {
  titre('1. Cœur pur');
  check('URL d’un ancêtre : même hôte, /master~N/', K.urlAncetre(URL0, 6) === 'https://raw.githubusercontent.com/o/r/master~6/market-data.json');
  const a = K.extraire(pub(T0), CH), b = K.extraire(pub(T0 - 15 * MIN), CH);
  const d = K.dedoublonner([a, b, K.extraire(pub(T0), CH), b]);
  check('doublons retirés (même updated), du plus ancien au plus récent', d.length === 2 && d[0].t < d[1].t, d.map(x => x.u));
  const med = K.mediane([0, 15, 30, 46, 60].map(m => ({ t: m * MIN })));
  check('cadence = médiane des écarts mesurés (15, 15, 16, 14 → 15 min)', med === 15 * MIN, med);
  check('pas de cadence sous 3 écarts', K.mediane([{ t: 0 }, { t: 15 * MIN }, { t: 30 * MIN }]) === null);
  check('lot : N = 2, 4, 6, 8', JSON.stringify(K.planLot(2, 0)) === '[2,4,6,8]');
  check('lot : borné par les 30 lectures', JSON.stringify(K.planLot(60, 28)) === '[60,62]' && K.planLot(62, 30).length === 0);
  const plan = K.comblements([{ n: 0, t: T0 }, { n: 2, t: T0 - 15 * MIN }, { n: 4, t: T0 - 45 * MIN }, { n: 8, t: T0 - 75 * MIN }], 15 * MIN, new Set([0, 2, 4, 8]));
  check('comblement : ancêtres IMPAIRS entre deux publications écartées de > 1,5 × la médiane', JSON.stringify(plan) === '[3,5,7]', plan);
  check('comblement : rien sans cadence mesurée', K.comblements([{ n: 0, t: T0 }, { n: 2, t: T0 - 90 * MIN }], null, new Set()).length === 0);
  check('comblement : un rang déjà demandé ne se relit pas', JSON.stringify(K.comblements([{ n: 2, t: T0 }, { n: 6, t: T0 - 60 * MIN }], 15 * MIN, new Set([3]))) === '[5]');

  titre('2. Format antérieur : champ absent = null, jamais 0');
  const ancien = K.extraire({ updated: new Date(T0).toISOString(), micro: { oi_change_1d_pct: 2 } }, CH);
  check('champ absent → null', ancien.v['micro.cvd_24h_usd'] === null && ancien.v['tf.4h.rsi_14'] === null, ancien.v);
  check('repli de format lu (oi_change_1d_pct pour oi_change_24h_pct)', K.serie([ancien], 'micro.oi_change_24h_pct')[0].v === 2);
  check('chaîne ou booléen → null (pas un nombre)', K.extraire({ updated: 'x' }, CH) === null
    && K.extraire({ updated: new Date(T0).toISOString(), micro: { cvd_24h_usd: '12' } }, CH).v['micro.cvd_24h_usd'] === null);
  const s = [{ t: 0, v: 1 }, { t: 15 * MIN, v: 2 }, { t: 30 * MIN, v: null }, { t: 45 * MIN, v: 3 }, { t: 60 * MIN, v: 4 }, { t: 150 * MIN, v: 5 }, { t: 165 * MIN, v: 6 }];
  const seg = K.segments(s, 15 * MIN);
  check('ligne coupée sur null et sur un écart > 2 × médiane : 3 morceaux', seg.length === 3 && seg.map(m => m.length).join() === '2,2,2', seg);
  const svg = K.svg(s, { l: 48, h: 14, debut: 0, fin: 165 * MIN, med: 15 * MIN, classe: 'chron-spark', titre: 't' });
  check('tracé : un chemin par morceau, aucun segment ne franchit un trou', (svg.match(/<path /g) || []).length === 3, svg);
  const hach = K.svg(s, { l: 300, h: 56, debut: 0, fin: 165 * MIN, med: 15 * MIN, classe: 'chron-fiche', hachures: true, id: 'x', titre: 't' });
  check('courbe de fiche : trous hachurés (champ absent + publications manquantes)', (hach.match(/class="chron-trou"/g) || []).length === 2 && /<pattern id="chron-h-x"/.test(hach), hach);
  const t = K.titre(s, { meta: { nature: 'mesure', fenetre: '24h glissantes' }, fmt: String });
  check('titre : « 6 h · 7 publications · min … max … · nature : … », absence comptée', /^6 h · 7 publications · min 1 max 6 · champ absent dans 1 · nature : mesure/.test(t), t);
  check('titre : série glissante étiquetée', /fenêtre glissante, un point par publication/.test(t));
  check('titre : série instantanée non étiquetée glissante', !/glissante/.test(K.titre(s, { meta: { fenetre: 'instantané au moment de la publication' } })));

  titre('3. La marche dans l’historique');
  {
    const f = faux(depot(alterne(40, 15)));
    const c = K.creer({ url: URL0, chemins: CH, stockage: memoire(), fetch: f });
    c.ajouter(pub(T0));
    const arret = await c.parcourir();
    const r = c.recents();
    check('horizon de 6 h : arrêt, 25 publications (6 h à 15 min, bornes comprises)', arret === 'horizon' && r.length === 25, { arret, n: r.length, lus: f.lus });
    check('lectures de rang PAIR seulement quand rien ne manque', f.lus.every(n => n % 2 === 0), f.lus);
    check('cadence mesurée : 15 min', c.cadence() === 15 * MIN, c.cadence());
    check('aucun historique partiel', c.etat().partiel === '');
  }
  {
    // Publications 3 et 8 sans carte après elles : le pas de 2 en saute ; les impairs les rendent.
    const f = faux(depot(alterne(40, 15, { sansCarte: [3, 8] })));
    const c = K.creer({ url: URL0, chemins: CH, stockage: memoire(), fetch: f });
    c.ajouter(pub(T0));
    await c.parcourir();
    const manque = [];
    for (let i = 0; i <= 24; i++) if (!c.points().some(p => p.t === T0 - i * 15 * MIN)) manque.push(i);
    const impairs = f.lus.filter(n => n % 2);
    check(`trous comblés par les ancêtres impairs (${impairs.join(', ')}), une fois : rien ne manque sur 6 h`, !manque.length && impairs.length > 0 && impairs.length === new Set(impairs).size, { manque, lus: f.lus });
    check(`plafond de ${K.C.MAX_REQUETES} lectures respecté (${f.lus.length})`, f.lus.length <= K.C.MAX_REQUETES);
  }
  {
    // Cadence de 5 min : 6 h = 72 publications, au-delà du plafond.
    const f = faux(depot(alterne(200, 5)));
    const c = K.creer({ url: URL0, chemins: CH, stockage: memoire(), fetch: f });
    c.ajouter(pub(T0));
    const arret = await c.parcourir();
    check(`plafond : ${K.C.MAX_REQUETES} lectures par session, pas une de plus`, f.lus.length === K.C.MAX_REQUETES && arret === 'plafond', { n: f.lus.length, arret });
    const avant = f.lus.length;
    await c.parcourir();
    check('une seule marche par session', f.lus.length === avant);
  }
  {
    const f = faux(depot(alterne(40, 15)), n => (n >= 6 ? 429 : 0));
    const c = K.creer({ url: URL0, chemins: CH, stockage: memoire(), fetch: f });
    c.ajouter(pub(T0));
    const arret = await c.parcourir();
    check('429 : arrêt, « GitHub limite les lectures : historique partiel »', arret === 'limite' && c.etat().partiel === 'GitHub limite les lectures : historique partiel', c.etat());
    check('429 : ce qui précède est gardé (rangs 2, 4)', c.points().length === 3);
    check('429 : le titre du tracé dit « historique partiel »', /historique partiel/.test(c.trace('micro.cvd_24h_usd', { l: 48, h: 14, classe: 'x' })));
    const f2 = faux(depot(alterne(40, 15)), n => (n === 4 ? 403 : 0));
    const c2 = K.creer({ url: URL0, chemins: CH, stockage: memoire(), fetch: f2 });
    check('403 : même arrêt', (await c2.parcourir()) === 'limite');
  }
  {
    const f = faux(depot(alterne(5, 15)));
    const c = K.creer({ url: URL0, chemins: CH, stockage: memoire(), fetch: f });
    c.ajouter(pub(T0));
    check('404 : début de l’historique, arrêt', (await c.parcourir()) === 'absent' && c.points().length === 5);
  }
  {
    const f = async () => { throw new TypeError('Failed to fetch'); };
    const c = K.creer({ url: URL0, chemins: CH, stockage: memoire(), fetch: f });
    check('réseau coupé : arrêt, historique partiel nommé', (await c.parcourir()) === 'reseau' && /partiel/.test(c.etat().partiel));
  }
  {
    // Le dépôt ne bouge plus : tous les rangs rendent la même publication.
    const f = faux(() => pub(T0));
    const c = K.creer({ url: URL0, chemins: CH, stockage: memoire(), fetch: f });
    c.ajouter(pub(T0));
    check('dépôt immobile : arrêt au premier lot sans publication nouvelle', (await c.parcourir()) === 'immobile' && f.lus.length === K.C.LOT, f.lus);
  }

  titre('4. Cache localStorage (commodité, 48 h au plus)');
  {
    const st = memoire();
    const c = K.creer({ url: URL0, chemins: CH, stockage: st, fetch: faux(depot(alterne(40, 15))) });
    c.ajouter(pub(T0));
    await c.parcourir();
    const gardes = JSON.parse(st.getItem(K.C.CLE)).points.length;
    // Session suivante, 30 min plus tard, deux publications de plus.
    const commits = [{ m: pub(T0 + 30 * MIN) }, { h: 1 }, { m: pub(T0 + 15 * MIN) }, { h: 1 }].concat(alterne(40, 15));
    const f = faux(depot(commits));
    const c2 = K.creer({ url: URL0, chemins: CH, stockage: st, fetch: f, maintenant: () => T0 + 31 * MIN });
    check('relu depuis le cache', c2.points().length === gardes, { gardes, lus: c2.points().length });
    c2.ajouter(pub(T0 + 30 * MIN));
    const arret = await c2.parcourir();
    check('arrêt à la première publication déjà en cache (1 lot)', arret === 'connu' && f.lus.length === K.C.LOT && c2.points().length === gardes + 2, { arret, lus: f.lus });
    // 48 h : plus vieux, oublié.
    const st2 = memoire();
    K.sauver(st2, [K.extraire(pub(T0 - 49 * 3600e3), CH), K.extraire(pub(T0 - 47 * 3600e3), CH)], T0, CH);
    check('cache plafonné à 48 h (écriture)', JSON.parse(st2.getItem(K.C.CLE)).points.length === 1);
    check('cache plafonné à 48 h (lecture, 2 h plus tard)', K.charger(st2, T0 + 2 * 3600e3, CH).length === 0);
    check('cache d’une autre liste de champs : ignoré', K.charger(st2, T0, ['macro.vix']).length === 0);
    st2.setItem(K.C.CLE, '{abîmé');
    check('cache abîmé : ignoré', K.charger(st2, T0, CH).length === 0);
  }
  {
    const jette = { getItem() { throw new Error('SecurityError'); }, setItem() { throw new Error('QuotaExceededError'); } };
    let ok = true;
    try {
      const c = K.creer({ url: URL0, chemins: CH, stockage: jette, fetch: faux(depot(alterne(40, 15))) });
      c.ajouter(pub(T0));
      await c.parcourir();
      ok = c.points().length === 25;
    } catch (e) { ok = false; }
    check('localStorage qui lève : aucune exception, la chronique vit en mémoire', ok);
    let ok2 = true;
    try { const c = K.creer({ url: URL0, chemins: CH, stockage: null, fetch: faux(() => null) }); c.ajouter(pub(T0)); } catch (e) { ok2 = false; }
    check('pas de stockage du tout : aucune exception', ok2);
  }

  titre('5. La lecture vivante');
  {
    const f = faux(depot(alterne(40, 15)));
    const c = K.creer({ url: URL0, chemins: CH, stockage: memoire(), fetch: f });
    c.ajouter(pub(T0)); await c.parcourir();
    const n = f.lus.length, p = c.points().length;
    check('une publication nouvelle s’ajoute sans requête', c.ajouter(pub(T0 + 15 * MIN)) && c.points().length === p + 1 && f.lus.length === n);
    check('la même, relue : rien', !c.ajouter(pub(T0 + 15 * MIN)) && c.points().length === p + 1);
    check('trace : SVG statique (aucune animation)', !/animate|<style/.test(c.trace('micro.cvd_24h_usd', { l: 48, h: 14, classe: 'chron-spark' })));
    check('trace : rien pour un champ jamais publié (pas de ligne à 0)', c.trace('micro.inexistant', { l: 48, h: 14, classe: 'x' }) === '');
  }

  titre('6. Branchements de la page');
  {
    const app = fs.readFileSync(path.join(REPO, 'js/app.js'), 'utf8'), html = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8');
    const liste = (app.match(/const CHRONIQUE_KPIS = \[([\s\S]*?)\]/) || [])[1] || '';
    const suivis = [...liste.matchAll(/'([^']+)'/g)].map(m => m[1]);
    const bande = (app.match(/function renderCycle[\s\S]*?\n}\n/) || [''])[0];
    const kpis = [...bande.matchAll(/\+?\s*kpi\('([^']+)',[\s\S]*?'([a-z0-9_.]+)'\)\n/g)].map(m => [m[1], m[2]]);
    check(`chaque chiffre clé de #cycle a sa trace (${kpis.length} : ${kpis.map(k => k[0]).join(', ')})`,
      kpis.length === 8 && kpis.every(([, c]) => suivis.includes(c)), { kpis, suivis });
    check('la trace est rendue dans le chiffre clé (traceKpi)', /traceKpi\(chemin\)/.test(bande));
    const src = x => html.indexOf('<script defer src="js/' + x + '"');
    check('chronique.js chargé avant app.js', src('chronique.js') > 0 && src('chronique.js') < src('app.js'));
    check('l’URL de l’historique dérive de DATA_URL (aucun hôte écrit)', /Chronique\.creer\(\{ url: DATA_URL/.test(app) && !/https?:\/\//.test(fs.readFileSync(path.join(REPO, 'js/chronique.js'), 'utf8')));
    check('la lecture vivante nourrit la chronique', /marketData = d; chronique\.ajouter\(d\)/.test(app));
    check('les Horloges reçoivent la cadence MESURÉE', /cadenceMesureeMs: chronique\.cadence\(\)/.test(app));
    const fiches = fs.readFileSync(path.join(REPO, 'js/fiches.js'), 'utf8');
    check('chaque fiche à champ porte sa courbe (chroniqueFiche)', /chroniqueFiche\(f\.champ, id\)/.test(fiches));
    global.CADENCES = new Function(fs.readFileSync(path.join(REPO, 'js/cadences.js'), 'utf8') + '\nreturn CADENCES;')();
    const H = require(path.join(REPO, 'js/horloges.js'));
    const conv = H.dePage({ marche: { updated: new Date().toISOString() } }).find(l => l.cle === 'marche');
    const mes = H.dePage({ marche: { updated: new Date().toISOString() }, chaleur: { updated: new Date().toISOString() }, cadenceMesureeMs: 15 * MIN });
    check('Horloges : « attendue … (convention) » sans mesure, « cadence mesurée 15 min » avec',
      /convention/.test(conv.seuil) && mes.find(l => l.cle === 'marche').seuil === 'cadence mesurée 15 min', { conv: conv.seuil, mes: mes.map(l => l.seuil) });
    check('Horloges : la carte de chaleur garde sa convention (autre script, autre rythme)', /convention/.test(mes.find(l => l.cle === 'chaleur').seuil));
  }

  console.log(ko ? `\n✗ ${ko} échec(s)` : '\n✓ tout passe');
  process.exit(ko ? 1 : 0);
})();
