// Les finitions par thème de la revue du 14/10/2026 (C26, C28 à C33, et l'en-tête des longs
// panneaux de M8), vérifiées dans un vrai navigateur (Chromium, Playwright), sur le marché réel du
// 08/10/2026 15:40 UTC rejoué par tests/scenarios-jour-harnais.js. Chaque contrôle échouait avant.
//
//   1. PLANCHE (Cyanotype, Diazo), 390 et 360, « Le détail » : aucune case de la cartouche ne
//      déborde, même avec « −140,90 M $ » ; la grille reste dans la cartouche (C26).
//   2. PLANCHE, 390 : la liste « Sur le graphique » et le panneau « Choisir l'affichage », ouverts
//      vers le haut, s'arrêtent sous l'en-tête (C28).
//   3. Le bas des panneaux : en Planche, le panneau des statistiques couvre la cartouche (il ne
//      s'arrête plus au milieu de « Infos du marché ») ; la calculette, qui défile, garde « Un
//      calcul, pas un conseil. » visible, dans cinq thèmes (C28).
//   4. La barre du bas à 360 px (Gare, Cyanotype, Diazo) : rien n'y passe sur deux lignes ni n'en
//      sort ; à 390, le décor est là, sur une ligne (C29).
//   5. Bulles du graphique : aucune ombre floue dans un thème plat (Bureau 95, Gazette), un filet
//      à la place ; Aero garde son ombre. Le « i » est carré dans les thèmes carrés, rond ailleurs ;
//      la croix de la Gazette à angles vifs (C30).
//   6. Bureau 95 : l'alerte encadrée en contraste (pas dans le jumeau clair) ; le pied du panneau
//      d'affichage s'arrête au bas du panneau et porte son relief (C31).
//   7. Aero : « −2,26 % en 24 h » et « +2,26 % » à 4,5:1 au moins, fond rendu mesuré (C32).
//   8. « Le détail » : le compteur « … bougies » a un fond ; à 1440, le trait de la publication ne
//      traverse aucune étiquette posée par le Guide ou les scénarios (C33).
//   9. Le panneau des statistiques défilé de 500 px : son titre et sa croix restent en haut, la
//      croix se touche (M8).
// USAGE   node tests/test_finitions_page.js
const H = require('./scenarios-jour-harnais');
const X = require('./fixtures/rejeu-jour-0810.json');

if (!H.playwright) {
  console.log('  − NON EXÉCUTÉ : Playwright introuvable — les finitions par thème ne sont pas vérifiées à l\'écran sur ce poste.');
  process.exit(0);
}
let ko = 0;
const check = (nom, ok, det) => { if (!ok) ko++; console.log(`  ${ok ? '✓' : '✗'} ${nom}${!ok && det !== undefined ? ' — ' + JSON.stringify(det).slice(0, 600) : ''}`); };
const titre = t => console.log(`\n── ${t} ──`);

async function ouvrir(nav, theme, W, mode = 'debutant') {
  const h = H.harnais(X, '2026-10-08T15:40:00Z');
  const o = await H.ouvrir(nav, h, { vue: { width: W, height: W < 500 ? 844 : 900 }, tactile: W < 500, theme, mode });
  await o.page.waitForFunction(() => !document.documentElement.hasAttribute('data-structure-attendue') || document.documentElement.hasAttribute('data-structure-posee'), null, { timeout: 10000 }).catch(() => {});
  await o.page.evaluate(() => { crossX = crossY = null; bulleDetail = null; });
  await o.page.waitForTimeout(300);
  return o;
}
/** Ouvre les statistiques de la figure la plus fréquente (la plus longue à lire). */
const ouvrirStats = page => page.evaluate(() => {
  const G = GUIDE_FORMES.val, fin = g => !g.doublon && g.jConf != null && ['atteint', 'invalide', 'expire'].includes(g.fin);
  const nb = t => G.formes.filter(g => g.type === t && fin(g)).length, f = G.formes.filter(g => !g.doublon).sort((a, b) => nb(b.type) - nb(a.type))[0];
  return !!f && ouvrirStatsFigure(f);
});

(async () => {
  const nav = await H.playwright.chromium.launch();
  try {
    titre('1. Planche : la cartouche ne coupe aucun chiffre (C26)');
    for (const theme of ['cyanotype', 'diazo']) for (const W of [390, 360]) {
      const o = await ouvrir(nav, theme, W, 'expert'), p = o.page;
      const mesure = () => p.evaluate(() => {
        const k = document.querySelector('.plan-cartouche > .kpis'), kb = k.getBoundingClientRect(), c = document.querySelector('.plan-cartouche').getBoundingClientRect();
        const cases = [...k.querySelectorAll('.kpi')].filter(e => e.getClientRects().length).map(e => {
          const rg = document.createRange(); rg.selectNodeContents(e); const t = rg.getBoundingClientRect(), b = e.getBoundingClientRect();
          return { t: e.innerText.replace(/\s+/g, ' ').trim(), deborde: +(t.right - b.right).toFixed(1), h: Math.round(b.height) };
        });
        return { n: cases.length, deborde: cases.filter(x => x.deborde > 0.5), dedans: kb.left >= c.left - 0.5 && kb.right <= c.right + 0.5, hauteurs: [...new Set(cases.map(x => x.h))], cvd: (cases.find(x => /CVD/i.test(x.t)) || {}).t, horsLargeur: document.documentElement.scrollWidth - innerWidth };
      });
      const m = await mesure();
      check(`${theme} ${W} : ${m.n} cases, aucune ne déborde (« ${m.cvd} »), grille dans la cartouche, rangées de ${m.hauteurs.join('/')} px`, m.n >= 8 && !m.deborde.length && m.dedans && m.hauteurs.length === 1 && m.horsLargeur <= 0, m);
      await p.evaluate(() => { const k = [...document.querySelectorAll('.plan-cartouche .kpi')].find(e => /CVD/i.test(e.innerText)); k.querySelector('b').textContent = '−140,90 M $'; });
      await p.waitForTimeout(100);
      const l = await mesure();
      check(`${theme} ${W} : une valeur plus longue (« ${l.cvd} ») tient aussi`, !l.deborde.length && l.dedans && l.horsLargeur <= 0, l);
      await o.ctx.close();
    }

    titre('2. Planche : les panneaux ouverts vers le haut s\'arrêtent sous l\'en-tête (C28)');
    for (const theme of ['cyanotype', 'diazo']) {
      const o = await ouvrir(nav, theme, 390, 'expert'), p = o.page;
      const bas = await p.evaluate(() => document.querySelector('.header').getBoundingClientRect().bottom);
      await p.evaluate(() => toggleReperes()); await p.waitForTimeout(300);
      const l = await p.evaluate(() => { const b = document.getElementById('reperesListe').getBoundingClientRect(); return { haut: b.top, h: b.height }; });
      await p.evaluate(() => toggleReperes()); await p.waitForTimeout(200);
      await p.click('#indDropdownBtn'); await p.waitForTimeout(300);
      const m = await p.evaluate(() => { const b = document.getElementById('indMenu').getBoundingClientRect(); return { haut: b.top, h: b.height }; });
      check(`${theme} : liste « Sur le graphique » à y ${Math.round(l.haut)} et panneau « Choisir l'affichage » à y ${Math.round(m.haut)}, sous l'en-tête (${Math.round(bas)}), ouverts sur ${Math.round(l.h)} et ${Math.round(m.h)} px`,
        l.haut >= bas && m.haut >= bas && l.h >= 300 && m.h >= 300, { bas, l, m });
      await o.ctx.close();
    }

    titre('3. Le bas des panneaux : la cartouche couverte, l\'avertissement de la calculette visible (C28)');
    for (const theme of ['cyanotype', 'diazo', 'gazette', 'bureau95', 'aero']) {
      const o = await ouvrir(nav, theme, 390), p = o.page;
      if (['cyanotype', 'diazo'].includes(theme)) {
        await ouvrirStats(p); await p.waitForTimeout(200);
        const b = await p.evaluate(() => { const P = document.getElementById('fichePop').getBoundingClientRect(), c = document.getElementById('cycle').getBoundingClientRect(), t = document.querySelector('.aero-taskbar').getBoundingClientRect(); return { pop: P.bottom, cycle: [c.top, c.bottom], barre: t.top }; });
        check(`${theme} : le panneau (bas à ${Math.round(b.pop)}) couvre « Infos du marché » (${b.cycle.map(Math.round).join('–')}), au-dessus de la barre des tâches (${Math.round(b.barre)})`, b.pop >= b.cycle[1] && b.pop <= b.barre, b);
        await p.evaluate(() => fermerFiche());
      }
      await p.evaluate(() => ouvrirCalculette()); await p.waitForTimeout(150);
      await p.fill('#calcCapital', '10000'); await p.fill('#calcStop', '80000'); await p.fill('#calcPalier0', '83000');
      await p.evaluate(() => { document.getElementById('calcPaliers').querySelector('.calc-ajouter').click(); });
      await p.waitForTimeout(250);
      const c = await p.evaluate(() => { const P = document.getElementById('fichePop'); P.scrollTop = 0; const pr = P.getBoundingClientRect(), q = P.querySelector('.fiche-pied').getBoundingClientRect(); return { defile: P.scrollHeight - P.clientHeight, pied: [q.top, q.bottom], pop: [pr.top, pr.bottom], texte: P.querySelector('.fiche-pied').textContent }; });
      check(`${theme} : la calculette défile (${c.defile} px) et « ${c.texte} » reste visible en bas du panneau`, c.defile > 0 && c.pied[0] >= c.pop[0] && c.pied[1] <= c.pop[1] + 0.5, c);
      await o.ctx.close();
    }

    titre('4. La barre du bas : rien sur deux lignes ni dehors à 360 px, le décor gardé à 390 (C29)');
    for (const theme of ['gare', 'cyanotype', 'diazo']) for (const W of [360, 390]) {
      const o = await ouvrir(nav, theme, W), p = o.page;
      const r = await p.evaluate(() => {
        const tb = document.querySelector('.aero-taskbar'), b = tb.getBoundingClientRect();
        const feuilles = [...tb.querySelectorAll('*')].filter(e => e.getClientRects().length && !e.children.length && e.textContent.trim());
        const hors = feuilles.filter(e => { const q = e.getBoundingClientRect(); return q.top < b.top - 0.5 || q.bottom > b.bottom + 0.5; }).map(e => e.textContent.trim());
        const d = tb.querySelector('.gare-info, .plan-format'), vu = !!(d && d.getClientRects().length);
        const lignes = vu ? Math.round(d.getBoundingClientRect().height / (parseFloat(getComputedStyle(d).lineHeight) || 12)) : 0;
        return { hors, decor: vu, lignes, horsLargeur: document.documentElement.scrollWidth - innerWidth };
      });
      if (W === 360) check(`${theme} 360 : aucun texte hors de la barre, décor masqué ou sur une ligne`, !r.hors.length && r.lignes <= 1 && r.horsLargeur <= 0, r);
      else check(`${theme} 390 : le décor reste, sur une ligne`, r.decor && r.lignes === 1 && !r.hors.length, r);
      await o.ctx.close();
    }

    titre('5. Bulles du graphique sans ombre floue dans un thème plat ; « i » et croix au rayon du thème (C30)');
    for (const theme of ['bureau95', 'gazette', 'aero']) {
      const o = await ouvrir(nav, theme, 390), p = o.page;
      const r = await p.evaluate(() => {
        const P = CanvasRenderingContext2D.prototype, f = P.fill, s = P.stroke, R = { ombres: 0, filets: [] };
        P.fill = function (...a) { if (this.shadowBlur > 0) R.ombres++; return f.apply(this, a); };
        P.stroke = function (...a) { R.filets.push(this.strokeStyle); return s.apply(this, a); };
        const c = document.getElementById('chart'), b = c.getBoundingClientRect();
        crossX = b.width * 0.45; crossY = 160; bulleDetail = null;
        dessinerCalque();
        P.fill = f; P.stroke = s; crossX = crossY = null; dessinerCalque();
        const t = document.createElement('canvas').getContext('2d'); t.strokeStyle = COLORS.hairline;
        return { ombres: R.ombres, filet: R.filets.includes(t.strokeStyle), plat: getComputedStyle(document.documentElement).getPropertyValue('--ombre-douce').trim() === 'none' };
      });
      if (theme === 'aero') check('aero : l\'infobulle des bougies garde son ombre douce', !r.plat && r.ombres >= 1, r);
      else check(`${theme} (aucune ombre floue) : l'infobulle des bougies sans ombre, cernée d'un filet`, r.plat && r.ombres === 0 && r.filet, r);
      await o.ctx.close();
    }
    {
      const o = await ouvrir(nav, 'aero', 390), p = o.page;
      await p.click('#indDropdownBtn'); await p.waitForTimeout(300);
      const rayons = {};
      for (const theme of ['gazette', 'cyanotype', 'diazo', 'aero', 'codex', 'gare', 'neon']) {
        await p.evaluate(t => appliquerTheme(t), theme); await p.waitForTimeout(250);
        rayons[theme] = await p.evaluate(() => {
          const i = document.querySelector('#indMenu .info-btn'), x = document.createElement('button');
          x.className = 'fiche-fermer'; document.getElementById('fichePop').appendChild(x);
          // « min(50%, N px) » reste écrit tel quel : rond quand N vaut au moins la moitié du bouton.
          const v = i ? getComputedStyle(i).borderTopLeftRadius : null, mm = v && /^min\(50%, ([\d.]+)px\)$/.exec(v);
          const r = { i: v, rond: v === '50%' || (!!mm && +mm[1] >= i.offsetWidth / 2), croix: getComputedStyle(x).borderTopLeftRadius }; x.remove(); return r;
        });
      }
      const carres = ['gazette', 'cyanotype', 'diazo'], ronds = ['aero', 'codex', 'gare', 'neon'];
      check('« i » carré en Gazette, Cyanotype et Diazo (thèmes carrés), rond en Aero, Codex, Gare et Néon',
        carres.every(t => rayons[t].i === '0px') && ronds.every(t => rayons[t].rond), rayons);
      check('croix des panneaux à angles vifs dans les thèmes carrés (Gazette : 6 px avant)', carres.every(t => rayons[t].croix === '0px') && rayons.aero.croix === '6px', rayons);
      await o.ctx.close();
    }

    titre('6. Bureau 95 : l\'alerte encadrée en contraste, le bas du panneau d\'affichage (C31)');
    for (const theme of ['bureau95', 'bureau95-contraste']) {
      const o = await ouvrir(nav, theme, 390, 'expert'), p = o.page;
      await ouvrirStats(p); await p.waitForTimeout(200);
      const a = await p.evaluate(() => {
        const P = document.getElementById('fichePop');
        let e = P.querySelector('.fiche-alerte');
        if (!e) { e = document.createElement('p'); e.className = 'fiche-alerte'; e.textContent = 'Trop peu de cas pour en tirer une règle : ces comptes peuvent beaucoup changer.'; P.querySelector('h4').before(e); }
        const s = getComputedStyle(e), t = document.createElement('i'); t.style.color = 'var(--warn)'; P.appendChild(t);
        const warn = getComputedStyle(t).color; t.remove();
        return { fond: s.backgroundColor, fondPop: getComputedStyle(P).backgroundColor, ombre: s.boxShadow, warn };
      });
      if (theme === 'bureau95-contraste') check(`contraste : l'alerte (fond ${a.fond}, celui du panneau) est cernée d'un filet ${a.warn}`, a.fond === a.fondPop && a.ombre.includes(a.warn) && /1px inset/.test(a.ombre), a);
      else check('Bureau 95 clair : l\'alerte garde sa case jaune, sans filet', a.fond !== a.fondPop && !a.ombre.includes(a.warn), a);
      await p.evaluate(() => fermerFiche());
      await p.click('#indDropdownBtn'); await p.waitForTimeout(300);
      const m = await p.evaluate(() => { const M = document.getElementById('indMenu').getBoundingClientRect(), A = document.querySelector('#indMenu .ind-apercu'); const b = A.getBoundingClientRect(); return { menu: M.bottom, apercu: b.bottom, ombre: getComputedStyle(A).boxShadow }; });
      check(`${theme} : le pied du panneau s'arrête à son bas (${Math.round(m.apercu)} ≤ ${Math.round(m.menu)}) et porte le relief`, m.apercu <= m.menu + 0.5 && m.ombre !== 'none' && /inset/.test(m.ombre), m);
      await o.ctx.close();
    }

    titre('7. Aero : la variation 24 h lisible, 4,5:1 au moins (C32)');
    {
      const o = await ouvrir(nav, 'aero', 390), p = o.page;
      for (const sens of ['neg', 'pos']) {
        // Le rejeu réécrit l'en-tête à chaque prix : on le fige le temps de la mesure.
        await p.evaluate(s => { ecrirePrixEntete = function () {}; const v = document.getElementById('var24'); v.textContent = (s === 'pos' ? '+' : '−') + '2,26 % en 24 h'; v.className = 'var24 ' + s; }, sens);
        await p.waitForTimeout(100);
        const r = await p.evaluate(() => { const e = document.getElementById('var24'), q = e.getBoundingClientRect(); return { x: q.left, y: q.top, w: q.width, h: q.height, classe: e.className, encre: getComputedStyle(e).color, taille: getComputedStyle(e).fontSize }; });
        const buf = await p.screenshot({ clip: { x: r.x, y: r.y, width: r.w, height: r.h } });
        const fond = await p.evaluate(async b64 => {
          const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
          const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0);
          const d = x.getImageData(0, 0, c.width, c.height).data, n = {};
          for (let i = 0; i < d.length; i += 4) { const k = d[i] + ',' + d[i + 1] + ',' + d[i + 2]; n[k] = (n[k] || 0) + 1; }
          return Object.entries(n).sort((a, b) => b[1] - a[1])[0][0].split(',').map(Number);
        }, buf.toString('base64'));
        const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
        const L1 = lum(r.encre.match(/[\d.]+/g).slice(0, 3).map(Number)), L2 = lum(fond), ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
        check(`aero, ${sens === 'pos' ? 'hausse' : 'baisse'} : ${r.encre} sur le fond rendu ${fond.join(',')} = ${ratio.toFixed(2)}:1 (texte de ${r.taille}, ≥ 4,5)`, ratio >= 4.5 && r.classe === 'var24 ' + sens, { r, fond, ratio });
      }
      await o.ctx.close();
    }

    titre('8. « Le détail » : le compteur sur un fond, le trait de la publication hors des étiquettes (C33)');
    {
      const o = await ouvrir(nav, 'kala', 390, 'expert'), p = o.page;
      const r = await p.evaluate(() => {
        const P = CanvasRenderingContext2D.prototype, f = P.fill, rr = P.roundRect, ft = P.fillText; let dernier = null, chemin = null, vu = null;
        P.roundRect = function (x, y, w, h, ...a) { chemin = { x, y, w, h }; return rr.call(this, x, y, w, h, ...a); };
        P.fill = function (...a) { dernier = { style: this.fillStyle, rect: chemin }; return f.apply(this, a); };
        P.fillText = function (t, x, y, ...a) { if (/ bougies$/.test(t)) vu = { t, x, y, fond: dernier }; return ft.call(this, t, x, y, ...a); };
        drawChart();
        P.fill = f; P.roundRect = rr; P.fillText = ft;
        const t = document.createElement('canvas').getContext('2d'); t.fillStyle = COLORS.bulle;
        return { vu, bulle: t.fillStyle };
      });
      const v = r.vu, q = v && v.fond && v.fond.rect;
      check(`compteur « ${v && v.t} » écrit sur un fond --bulle qui l'entoure`, !!q && v.fond.style === r.bulle && v.x >= q.x && v.x < q.x + q.w && v.y > q.y && v.y <= q.y + q.h, r);
      await o.ctx.close();
    }
    for (const theme of ['bureau95', 'gare']) {
      const o = await ouvrir(nav, theme, 1440, 'expert'), p = o.page;
      const r = await p.evaluate(() => {
        drawChart();
        const rep = geoPrix && reperePublication(geoPrix);
        if (!rep) return { rep: null };
        const P = CanvasRenderingContext2D.prototype, mt = P.moveTo, lt = P.lineTo, segs = []; let de = null;
        P.moveTo = function (x, y) { if (Math.abs(x - rep.x) < 0.01 && this.getLineDash().join() === '3,3') de = y; return mt.call(this, x, y); };
        P.lineTo = function (x, y) { if (de !== null && Math.abs(x - rep.x) < 0.01 && this.getLineDash().join() === '3,3') { segs.push([de, y]); de = null; } return lt.call(this, x, y); };
        dessinerCalque();
        P.moveTo = mt; P.lineTo = lt;
        const rects = [].concat(guideEtat ? guideEtat.rects : [], scenEtat && !(guideEtat && scenEtat.rects === guideEtat.rects) ? scenEtat.rects : []);
        const sur = rects.filter(q => rep.x > q.x + 0.5 && rep.x < q.x + q.w - 0.5);
        const coupe = sur.filter(q => segs.some(([a, b]) => Math.min(a, b) < q.y + q.h - 0.5 && Math.max(a, b) > q.y + 0.5));
        return { rep: Math.round(rep.x), traversees: sur.length, coupe, long: segs.reduce((s, [a, b]) => s + Math.abs(b - a), 0), ph: geoPrix.ph };
      });
      check(`${theme} 1440 : le trait de la publication (x ${r.rep}) passe ${r.traversees} étiquette(s) sans les barrer, et reste tracé (${Math.round(r.long)} px sur ${Math.round(r.ph)})`,
        r.rep !== null && r.traversees >= 1 && !r.coupe.length && r.long >= r.ph / 2, r);
      await o.ctx.close();
    }

    titre('9. Panneau des statistiques défilé : le titre et la croix restent en haut (M8)');
    for (const theme of ['bureau95', 'gazette', 'aero', 'diazo']) {
      const o = await ouvrir(nav, theme, 390), p = o.page;
      await ouvrirStats(p); await p.waitForTimeout(200);
      const r = await p.evaluate(() => {
        const P = document.getElementById('fichePop'); P.scrollTop = 500;
        const pb = P.getBoundingClientRect(), t = P.querySelector('.fiche-tete').getBoundingClientRect(), x = P.querySelector('.fiche-fermer'), xb = x.getBoundingClientRect();
        const el = document.elementFromPoint(xb.left + xb.width / 2, xb.top + xb.height / 2);
        return { defile: P.scrollTop, tete: [Math.round(t.top - pb.top), Math.round(t.bottom - pb.top)], croix: el === x || x.contains(el), titre: P.querySelector('.fiche-titre').textContent };
      });
      check(`${theme} : défilé de ${r.defile} px, « ${r.titre} » en haut du panneau (y ${r.tete.join('–')}), la croix se touche`, r.defile >= 300 && r.tete[0] >= 0 && r.tete[0] <= 4 && r.croix, r);
      await o.ctx.close();
    }
  } finally { await nav.close(); H.arreter(); }
  console.log(ko ? `\n❌ FINITIONS : ${ko} contrôle(s) en échec` : '\n✅ FINITIONS : TOUS LES CONTRÔLES PASSENT');
  process.exit(ko ? 1 : 0);
})().catch(e => { console.error(e); H.arreter(); process.exit(1); });
