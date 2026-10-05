// ============ THÈMES ============
// Le registre, ce sont les <link data-theme-id> d'index.html : une seule source de vérité,
// relue telle quelle par tests/test_contrat.py. Le thème courant est l'attribut data-theme
// de <html>, posé AVANT le premier rendu par le petit script en tête de page.
const THEME_CLE = 'samsara-theme';
const THEMES = Array.from(document.querySelectorAll('link[data-theme-id]')).map(l => ({
  id: l.getAttribute('data-theme-id'),
  nom: l.getAttribute('data-nom') || l.getAttribute('data-theme-id'),
  mode: l.getAttribute('data-mode') || 'clair',
  verre: l.getAttribute('data-verre') || 'aucun',
  paire: l.getAttribute('data-paire') || null
}));
function themeCourant() {
  const id = document.documentElement.getAttribute('data-theme');
  return THEMES.find(t => t.id === id) || THEMES[0] || { id: 'aero', nom: 'Aero', mode: 'clair', verre: 'aucun', paire: null };
}
let dark = themeCourant().mode === 'sombre';
function appliquerTheme(id) {
  if (!THEMES.some(t => t.id === id)) return;
  document.documentElement.setAttribute('data-theme', id);
  try { localStorage.setItem(THEME_CLE, id); } catch (e) {}
  dark = themeCourant().mode === 'sombre';
  // Tout ce qui porte une couleur PAR THÈME hors du CSS : relu une fois, ici, pas à chaque image.
  lireJetons(); peindrePastilles(); verreDuTheme(); remplirMenuThemes();
  drawChart();
}
function themeSuivant() {
  const i = THEMES.findIndex(t => t.id === themeCourant().id);
  appliquerTheme(THEMES[(i + 1) % THEMES.length].id);
}
// D : le jumeau de l'autre mode (Aero ↔ Aero nuit) ; un thème sans jumeau passe au suivant.
function themeJumeau() { const p = themeCourant().paire; if (p) appliquerTheme(p); else themeSuivant(); }
function remplirMenuThemes() {
  const m = document.getElementById('themeMenu');
  if (!m) return;
  const cur = themeCourant().id;
  // L'aperçu porte data-theme=<id> : il reçoit les VRAIS jetons du thème, pas une copie.
  m.innerHTML = '<div class="cat-title">Thème · T suivant · D clair / sombre</div>' + THEMES.map(t =>
    '<button class="theme-item" role="menuitemradio" aria-checked="' + (t.id === cur) + '" onclick="appliquerTheme(\'' + t.id + '\')">'
    + '<span class="theme-apercu" data-theme="' + t.id + '"><i></i><i></i><i></i><i></i></span>'
    + '<span class="theme-nom">' + escHtml(t.nom) + '</span>'
    + '<span class="theme-mode">' + (t.mode === 'sombre' ? 'sombre' : 'clair') + '</span></button>').join('');
}
function ouvrirThemes(e) {
  if (e) e.stopPropagation();
  const m = document.getElementById('themeMenu'), b = document.getElementById('themeBtn');
  document.getElementById('indMenu').classList.remove('open');
  if (m.classList.contains('open')) { m.classList.remove('open'); return; }
  remplirMenuThemes();
  m.classList.add('open');
  const r = b.getBoundingClientRect();
  m.style.top = (r.bottom + 8) + 'px';
  m.style.left = Math.max(8, Math.min(window.innerWidth - m.offsetWidth - 8, r.right - m.offsetWidth)) + 'px';
}

// ============ VERRE (selon le thème) ============
// data-verre du thème : aucun · givre (flou CSS, jeton --verre) · refraction (hyalite).
// hyalite (51 Ko, code tiers) n'est chargé QUE si le thème courant le demande, et après le
// premier dessin du graphique : il ne pèse plus sur le chargement des autres thèmes.
// La réfraction coûte ~98 % du budget d'image en rendu logiciel (1695 ms avec, 23 sans) ;
// le nombre de surfaces n'y change presque rien (3 → 1 : −7 %).
const VERRE = { veilles: null, cibles: null, chargement: null, degrade: false };
function chargerHyalite() {
  if (typeof Hyalite !== 'undefined') return Promise.resolve(true);
  if (!VERRE.chargement) VERRE.chargement = new Promise(res => {
    const s = document.createElement('script');
    s.src = 'js/vendor/hyalite.js'; s.async = true;
    s.onload = () => res(typeof Hyalite !== 'undefined');
    s.onerror = () => res(false);
    document.head.appendChild(s);
  });
  return VERRE.chargement;
}
// On retire la RÉFRACTION, pas le verre : detach() rend la main au repli CSS (--verre).
function couperRefraction(motif) {
  if (!VERRE.veilles) return;
  VERRE.veilles.forEach(w => { try { w.stop(); } catch (e) {} });
  VERRE.veilles = null;
  VERRE.cibles.forEach(c => document.querySelectorAll(c[0]).forEach(el => {
    try { Hyalite.detach(el); } catch (e) {}
    el.style.removeProperty('--hyalite'); el.style.removeProperty('--hyalite-edge');
  }));
  if (motif) console.info('Réfraction désactivée : ' + motif);
}
function verreDuTheme() {
  const force = (typeof URLSearchParams !== 'undefined' && location.search)
    ? new URLSearchParams(location.search).get('glass') : null;
  if (themeCourant().verre !== 'refraction' || force === 'off' || VERRE.degrade) {
    couperRefraction(force === 'off' && VERRE.veilles ? 'forcé par ?glass=off' : null);
    return;
  }
  if (VERRE.veilles) return;
  chargerHyalite().then(ok => {
    if (!ok || !Hyalite.supported() || themeCourant().verre !== 'refraction' || VERRE.veilles) return;
    const LG = { slope: 1.9, dispersion: 1.6, shade: 0.5, rim: 1.8, edge: 0.4 };
    const b = (bevel, thickness, blur) => Object.assign({ bevel, thickness, blur }, LG);
    // ⚠️ `.chart-container .lg-ring` est VOLONTAIREMENT absent : hyalite rastérise la carte de
    // déplacement sur toute la boîte de l'élément, le masque d'anneau ne réduit rien (mesuré :
    // 1820 ms/image avec hyalite sur l'anneau, 281 ms avec le flou CSS sur le même anneau).
    VERRE.cibles = [['.feed-panel', b(34, 60, 16)], ['.strat-section', b(28, 50, 16)]];
    VERRE.veilles = VERRE.cibles.map(c => Hyalite.watch(document.body, c[0], c[1]));
    if (force !== 'force') sonderRefraction();
  });
}
// Garde-fou : médiane de plusieurs images APRÈS stabilisation (un échantillon unique pris au
// chargement décide au hasard). Au-delà de 22 ms (~45 i/s), la réfraction n'est pas tenable :
// on la coupe pour la session, le verre CSS reste.
function sonderRefraction() {
  const SEUIL = 22;
  setTimeout(() => {
    const d = []; let last = performance.now(), n = 0;
    (function step(t) {
      const dt = t - last; last = t;
      if (n++) d.push(dt);                          // la 1re image est polluée
      if (dt > SEUIL * 2.5 || d.length >= 12) {
        d.sort((a, c) => a - c);
        const ms = d[Math.floor(d.length / 2)] || dt;
        if (ms > SEUIL) { VERRE.degrade = true; couperRefraction('médiane ' + Math.round(ms) + ' ms/image'); }
        else console.info('Réfraction conservée : médiane ' + Math.round(ms) + ' ms/image.');
      } else requestAnimationFrame(step);
    })(last);
  }, 2500);
}

// ============ SHORTCUTS UX ============
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (e.key === 'f' || e.key === 'F') { toggleFeed(); e.preventDefault(); }
  if (e.key === 'd' || e.key === 'D') { themeJumeau(); e.preventDefault(); }
  if (e.key === 't' || e.key === 'T') { themeSuivant(); e.preventDefault(); }
  if (e.key === 'r' || e.key === 'R') { resetView(); e.preventDefault(); }
  if (e.key === 'Escape') { document.getElementById('indMenu').classList.remove('open'); document.getElementById('themeMenu').classList.remove('open'); }
  // Flèches : scroller horizontalement
  if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    e.preventDefault();
    const visible = viewEnd - viewStart;
    const step = e.shiftKey ? 10 : 1;
    const delta = e.key === 'ArrowRight' ? step : -step;
    const newStart = Math.max(0, Math.min(candles.length - visible, viewStart + delta));
    viewStart = newStart;
    viewEnd = newStart + visible;
    drawChart();
  }
});

// ============ FEED TOGGLE ============
let feedVisible = false;
function toggleFeed() {
  if (window.innerWidth <= 768) {
    openMarketModal(); return;
  }
  feedVisible = !feedVisible;
  const panel = document.getElementById('feedPanel');
  const btn = document.getElementById('feedBtn');
  panel.classList.toggle('collapsed', !feedVisible);
  if (btn) btn.classList.toggle('on', feedVisible);
  // Attendre la fin de la transition CSS (0.3s) avant de redimensionner
  setTimeout(() => { resizeCanvas(); drawChart(); }, 350);
}

function openMarketModal() {
  const modal = document.getElementById('marketModal');
  modal.style.display = 'flex';
  renderFeedTo(document.getElementById('marketModalBody'));
}
function closeMarketModal() {
  document.getElementById('marketModal').style.display = 'none';
}

// ============ RESET VIEW ============
function resetView() {
  viewStart = Math.max(0, candles.length - 50);
  viewEnd = candles.length;
  priceScale = 1.0;
  pricePan = 0;
  drawChart();
}

// ============ POLYFILL ============
if (!CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function(x,y,w,h,r) {
    if (typeof r === 'number') r = {tl:r, tr:r, br:r, bl:r};
    this.beginPath(); this.moveTo(x+r.tl, y); this.lineTo(x+w-r.tr, y);
    this.quadraticCurveTo(x+w, y, x+w, y+r.tr); this.lineTo(x+w, y+h-r.br);
    this.quadraticCurveTo(x+w, y+h, x+w-r.br, y+h); this.lineTo(x+r.bl, y+h);
    this.quadraticCurveTo(x, y+h, x, y+h-r.bl); this.lineTo(x, y+r.tl);
    this.quadraticCurveTo(x, y, x+r.tl, y); this.closePath();
  };
}

// ============ DATA ============
const DATA_URL = 'https://raw.githubusercontent.com/lorenzoapro12-jpg/samsara-live/master/market-data.json';
let marketData = null, livePrice = null, candles = [], chartInterval = '15m';
let activeSymbol = 'BTCUSDT';  // BTCUSDT, ETHUSDT, SOLUSDT, XRPUSDT, TAOUSDT, ou BTCSOL (ratio)

// ============ VIEWPORT (zoom/pan) ============
let viewStart = 0, viewEnd = 100;  // indices dans candles
let isPanning = false, panStartX = 0, panStartView = 0;

// Échelle verticale (1.0 = auto, drag molette sur colonne prix)
let priceScale = 1.0, pricePan = 0;  // pricePan en % du range
let isPriceDrag = false, priceDragStart = 0, priceScaleStart = 1, pricePanStart = 0;

// ============ RANGE SELECTOR ============
const RS_HEIGHT = 38;
let rsDragging = null;    // 'body', 'left', 'right', ou null
let rsDragStartX = 0;
let rsDragStartView = 0;
let rsDragStartEnd = 0;

// ============ CROSSHAIR ============
let crossX = null, crossY = null;  // coordonnées canvas du curseur

// ============ INDICATOR STATE ============
const overlays = { ema20: false, ema50: false, ema100: false, ema200: false, sma20: false, sma50: false, bb: false, vwap: false, ichimoku: false, sar: false, sr: false, fib: false, vp: false, liq: false };
const activeSubs = { vol: true, rsi: false, macd: false, stoch: false, atr: false, obv: false, mfi: false, williamsR: false, cci: false, adx: false, ao: false, equity: false };
const subHeights = { vol: 110, rsi: 120, macd: 120, stoch: 120, atr: 110, obv: 110, mfi: 120, williamsR: 120, cci: 120, adx: 120, ao: 110, equity: 140 };

// Registre de tous les indicateurs pour la dropdown
const INDICATORS = [
  { cat: 'Overlays', items: [
    { key: 'ema20', label: 'EMA 20', tag: 'ov' }, { key: 'ema50', label: 'EMA 50', tag: 'ov' },
    { key: 'ema100', label: 'EMA 100', tag: 'ov' }, { key: 'ema200', label: 'EMA 200', tag: 'ov' },
    { key: 'sma20', label: 'SMA 20', tag: 'ov' }, { key: 'sma50', label: 'SMA 50', tag: 'ov' },
    { key: 'bb', label: 'Bollinger Bands (20,2)', tag: 'ov' },
    { key: 'vwap', label: 'VWAP', tag: 'ov' },
    { key: 'ichimoku', label: 'Ichimoku Cloud', tag: 'ov' },
    { key: 'sar', label: 'Parabolic SAR', tag: 'ov' },
  ]},
  { cat: 'Sous-graphes', items: [
    { key: 'vol', label: 'Volume', tag: 'sg' },
    { key: 'rsi', label: 'RSI (14)', tag: 'sg' },
    { key: 'macd', label: 'MACD (12,26,9)', tag: 'sg' },
    { key: 'stoch', label: 'Stochastique (14,3,3)', tag: 'sg' },
    { key: 'atr', label: 'ATR (14)', tag: 'sg' },
    { key: 'obv', label: 'OBV — On-Balance Volume', tag: 'sg' },
    { key: 'mfi', label: 'MFI — Money Flow Index (14)', tag: 'sg' },
    { key: 'williamsR', label: 'Williams %R (14)', tag: 'sg' },
    { key: 'cci', label: 'CCI (20)', tag: 'sg' },
    { key: 'adx', label: 'ADX/DMI (14)', tag: 'sg' },
    { key: 'ao', label: 'Awesome Oscillator', tag: 'sg' },
  ]},
  { cat: 'Chartiste', items: [
    { key: 'sr', label: 'Supports/Résistances', tag: 'ch' },
    { key: 'fib', label: 'Fibonacci Retracement', tag: 'ch' },
    { key: 'vp', label: 'Volume Profile', tag: 'ch' },
    { key: 'liq', label: 'Liquidité (Depth)', tag: 'ch' }
  ]}
];

function isOverlay(key) { return key in overlays; }
function isActive(key) { return (overlays[key] || activeSubs[key]) || false; }
function toggleAny(key) {
  if (isOverlay(key)) {
    overlays[key] = !overlays[key];
    if (key === 'liq') toggleDepth(overlays.liq);
    // S/R : dessiner tout de suite, puis redessiner quand les TF de reference sont arrives.
    if (key === 'sr' && overlays.sr) { drawChart(); refreshRefSR().then(drawChart); }
    else drawChart();
  }
  else { activeSubs[key] = !activeSubs[key]; resizeCanvas(); drawChart(); }
  buildDropdown();
  const lbl = document.getElementById('lbl_' + key);
  if (lbl) lbl.classList.toggle('active', isActive(key));
}

function buildDropdown() {
  const menu = document.getElementById('indMenu');
  let html = '';
  for (const cat of INDICATORS) {
    html += `<div class="cat-title">${cat.cat}</div>`;
    for (const item of cat.items) {
      const checked = isActive(item.key) ? ' checked' : '';
      html += `<label><input type="checkbox"${checked} onchange="toggleAny('${item.key}')">${item.label}<span class="tag tag-${item.tag}">${item.tag.toUpperCase()}</span></label>`;
    }
  }
  menu.innerHTML = html;
}

function toggleDropdown(e) {
  e.stopPropagation();
  document.getElementById('themeMenu').classList.remove('open');
  const menu = document.getElementById('indMenu');
  const btn = document.getElementById('indDropdownBtn');
  
  if (menu.classList.contains('open')) {
    menu.classList.remove('open');
    return;
  }
  
  const rect = btn.getBoundingClientRect();
  menu.style.top = (rect.bottom + 4) + 'px';
  // Éviter le débordement à droite
  const menuWidth = 260;
  if (rect.left + menuWidth > window.innerWidth) {
    menu.style.left = 'auto';
    menu.style.right = '10px';
  } else {
    menu.style.left = rect.left + 'px';
    menu.style.right = 'auto';
  }
  
  menu.classList.add('open');
  buildDropdown();
}
document.addEventListener('click', (e) => {
  for (const id of ['indMenu', 'themeMenu']) {
    const menu = document.getElementById(id);
    if (menu && !menu.contains(e.target)) menu.classList.remove('open');
  }
});
// Fermer les menus si la fenêtre est redimensionnée
window.addEventListener('resize', () => {
  document.getElementById('indMenu').classList.remove('open');
  document.getElementById('themeMenu').classList.remove('open');
});

function toggleInd(key, label) {
  overlays[key] = !overlays[key];
  if (key === 'liq') toggleDepth(overlays.liq);
  label.classList.toggle('active', overlays[key]);
  if (key === 'sr' && overlays.sr) { drawChart(); refreshRefSR().then(drawChart); }
  else drawChart();
}
function toggleSub(key, label) {
  activeSubs[key] = !activeSubs[key];
  label.classList.toggle('active', activeSubs[key]);
  resizeCanvas(); drawChart();
}

async function changeInterval(interval, label) {
  document.querySelectorAll('#indicatorBar label[id^="int_"]').forEach(l => l.classList.remove('active'));
  label.classList.add('active');
  chartInterval = interval;
  priceScale = 1.0; pricePan = 0;
  viewStart = 0; viewEnd = 50;
  delete klineCache[getKlineCacheKey(activeSymbol, chartInterval)];
  await fetchKlines();
  viewStart = Math.max(0, candles.length - 50);
  viewEnd = candles.length;
  await refreshRefSR();
  drawChart();
}

async function changeSymbol(symbol, label) {
  document.querySelectorAll('#indicatorBar label[id^="sym_"]').forEach(l => l.classList.remove('active'));
  label.classList.add('active');
  activeSymbol = symbol;
  const tp = document.getElementById('taskbarPair');
  if (tp) tp.textContent = symbol;
  priceScale = 1.0; pricePan = 0;
  viewStart = 0; viewEnd = 50;
  delete klineCache[getKlineCacheKey(activeSymbol, chartInterval)];
  await fetchKlines();
  viewStart = Math.max(0, candles.length - 50);
  viewEnd = candles.length;
  await refreshRefSR();
  drawChart();
}

// ============ CANVAS ============
const canvas = document.getElementById('chart');
const ctx = canvas.getContext('2d');
let hasSubChart = true; // volume or indicator

// --- Une frame = un dessin ---
// Toute mutation de vue (pan, molette, drags, doigt) change l'état puis demande le dessin
// par ici : sans ce filtre un trackpad émet 100+ événements/s et drawChart partait 2× par
// déplacement (handler `window` du pan + handler `canvas` du crosshair). Le coût n'est pas
// le tracé (2-6 ms) mais le repaint du verre derrière le canvas — d'où un dessin par frame.
let rafPending = false;
function scheduleDraw() {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => { rafPending = false; drawChart(); });
}
canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  crossX = e.clientX - rect.left;
  crossY = e.clientY - rect.top;
  
  // Curseur Range Selector
  if (crossY > rect.height - RS_HEIGHT && !isPanning && !isPriceDrag && !rsDragging) {
    const padL = 16, padR = 75;
    const rsw = rect.width - padL - padR;
    const vs = Math.max(0, viewStart), ve = Math.min(candles.length, viewEnd);
    const toRSX = (i) => padL + (i / Math.max(1, candles.length - 1)) * rsw;
    const vrX = toRSX(vs), vrX2 = toRSX(Math.min(ve - 1, candles.length - 1));
    const vrW = Math.max(12, vrX2 - vrX);
    if (crossX >= vrX - 4 && crossX <= vrX + 6) {
      canvas.style.cursor = 'ew-resize';
    } else if (crossX >= vrX + vrW - 6 && crossX <= vrX + vrW + 4) {
      canvas.style.cursor = 'ew-resize';
    } else if (crossX >= vrX && crossX <= vrX + vrW) {
      canvas.style.cursor = 'grab';
    } else {
      canvas.style.cursor = 'default';
    }
  } else if (crossX > rect.width - 75 && !isPanning && !isPriceDrag) {
    canvas.style.cursor = 'ns-resize';
  } else if (!isPanning && !isPriceDrag) {
    canvas.style.cursor = 'crosshair';
  }
  if (!rafPending) scheduleDraw();
});
canvas.addEventListener('mouseleave', () => { crossX = null; crossY = null; rafPending = false; drawChart(); });

// --- Zoom molette ---
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;
  const W = rect.width;
  
  // Si souris sur colonne de prix (droite) → zoom vertical
  if (mouseX > W - 75) {
    const factor = e.deltaY > 0 ? 1.15 : 0.85;
    priceScale = Math.max(0.3, Math.min(5, priceScale * factor));
    pricePan *= factor; // garder le point central
    scheduleDraw();
    return;
  }
  
  const visible = viewEnd - viewStart;
  const factor = e.deltaY > 0 ? 1.3 : 0.7;
  const center = viewStart + visible / 2;
  const newVisible = Math.max(8, Math.min(candles.length, Math.round(visible * factor)));
  viewStart = Math.max(0, Math.round(center - newVisible / 2));
  viewEnd = Math.min(candles.length, viewStart + newVisible);
  if (viewEnd - viewStart < 10) { viewEnd = Math.min(candles.length, viewStart + 10); }
  scheduleDraw();
}, { passive: false });

// --- Pan cliquer-glisser ---
canvas.addEventListener('mousedown', (e) => {
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  const padL = 16, padR = 75;
  const rsw = rect.width - padL - padR;
  
  // Range Selector ?
  if (my > rect.height - RS_HEIGHT && candles.length > 5 && rsw > 20) {
    const toRSX = (i) => padL + (i / Math.max(1, candles.length - 1)) * rsw;
    const vs = Math.max(0, viewStart), ve = Math.min(candles.length, viewEnd);
    const vrX = toRSX(vs), vrX2 = toRSX(Math.min(ve - 1, candles.length - 1));
    const vrW = Math.max(12, vrX2 - vrX);
    
    if (mx >= vrX - 4 && mx <= vrX + 6) {
      rsDragging = 'left';
    } else if (mx >= vrX + vrW - 6 && mx <= vrX + vrW + 4) {
      rsDragging = 'right';
    } else if (mx >= vrX && mx <= vrX + vrW) {
      rsDragging = 'body';
      rsDragStartX = mx;
      rsDragStartView = viewStart;
      rsDragStartEnd = viewEnd;
    } else if (mx >= padL && mx <= rect.width - padR) {
      // Click en dehors → centrer le viewport sur le clic
      const frac = (mx - padL) / rsw;
      const target = Math.round(frac * candles.length);
      const visible = viewEnd - viewStart;
      viewStart = Math.max(0, Math.min(candles.length - visible, target - Math.round(visible / 2)));
      viewEnd = viewStart + visible;
      drawChart();
    }
    if (rsDragging) {
      rsDragStartX = mx;
      rsDragStartView = viewStart;
      rsDragStartEnd = viewEnd;
      e.preventDefault();
    }
    return;
  }
  
  if (mx > rect.width - 75) {
    // Drag colonne prix → pan vertical
    isPriceDrag = true;
    priceDragStart = e.clientY;
    priceScaleStart = priceScale;
    pricePanStart = pricePan;
    canvas.style.cursor = 'ns-resize';
  } else {
    isPanning = true;
    panStartX = e.clientX;
    panStartView = viewStart;
    canvas.style.cursor = 'grabbing';
  }
});
window.addEventListener('mousemove', (e) => {
  // Range Selector dragging
  if (rsDragging) {
    const rect = canvas.getBoundingClientRect();
    const padL = 16, padR = 75;
    const rsw = rect.width - padL - padR;
    const mx = e.clientX - rect.left;
    const frac = Math.max(0, Math.min(1, (mx - padL) / rsw));
    const visible = rsDragStartEnd - rsDragStartView;
    
    if (rsDragging === 'body') {
      const dxPx = mx - rsDragStartX;
      const dxCandles = Math.round((dxPx / rsw) * candles.length);
      viewStart = Math.max(0, Math.min(candles.length - visible, rsDragStartView + dxCandles));
      viewEnd = viewStart + visible;
    } else if (rsDragging === 'left') {
      const targetStart = Math.round(frac * candles.length);
      viewStart = Math.max(0, Math.min(rsDragStartEnd - 3, targetStart));
      viewEnd = rsDragStartEnd;
    } else if (rsDragging === 'right') {
      const targetEnd = Math.round(frac * candles.length);
      viewEnd = Math.min(candles.length, Math.max(rsDragStartView + 3, targetEnd));
      viewStart = rsDragStartView;
    }
    scheduleDraw();
    return;
  }
  
  if (isPriceDrag) {
    const dy = e.clientY - priceDragStart;
    const rect = canvas.getBoundingClientRect();
    pricePan = pricePanStart - (dy / rect.height) * 2 * priceScaleStart;
    scheduleDraw();
    return;
  }
  if (!isPanning) return;
  const rect = canvas.getBoundingClientRect();
  const dx = (e.clientX - panStartX) / rect.width;
  const visible = viewEnd - viewStart;
  const shift = Math.round(-dx * visible);
  viewStart = Math.max(0, Math.min(candles.length - visible, panStartView + shift));
  viewEnd = viewStart + visible;
  scheduleDraw();
});
window.addEventListener('mouseup', () => { 
  rsDragging = null;
  isPanning = false; isPriceDrag = false; 
  canvas.style.cursor = ''; 
});

// --- Double-click reset zoom ---
canvas.addEventListener('dblclick', () => {
  viewStart = Math.max(0, candles.length - 50);
  viewEnd = candles.length;
  priceScale = 1.0;
  pricePan = 0;
  drawChart();
});

// Tap sur mobile = tooltip OHLCV
canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect();
  const tx = e.clientX - rect.left;
  const ty = e.clientY - rect.top;
  // Colonne de prix → ignorer
  if (tx > rect.width - 55) return;
  // Si déjà un crosshair affiché au même endroit → le retirer
  if (crossX !== null && Math.abs(crossX - tx) < 8 && Math.abs(crossY - ty) < 8) {
    crossX = null; crossY = null;
  } else {
    crossX = tx; crossY = ty;
  }
  drawChart();
});

// ============ TOUCH (Mobile) ============
let touchMode = null; // 'pan', 'price', 'pinch'
let touchStartX = 0, touchStartY = 0;
let touchStartView = 0, touchStartPriceScale = 1, touchStartPricePan = 0;
let pinchStartDist = 0, pinchStartVisible = 0;

function getTouchDist(t1, t2) {
  const dx = t1.clientX - t2.clientX;
  const dy = t1.clientY - t2.clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

canvas.addEventListener('touchstart', (e) => {
  if (e.touches.length === 1) {
    const rect = canvas.getBoundingClientRect();
    const tx = e.touches[0].clientX - rect.left;
    if (tx > rect.width - 55) {
      touchMode = 'price';
      touchStartY = e.touches[0].clientY;
      touchStartPriceScale = priceScale;
      touchStartPricePan = pricePan;
    } else {
      touchMode = 'pan';
      touchStartX = e.touches[0].clientX;
      touchStartView = viewStart;
    }
    e.preventDefault();
  } else if (e.touches.length === 2) {
    touchMode = 'pinch';
    pinchStartDist = getTouchDist(e.touches[0], e.touches[1]);
    pinchStartVisible = viewEnd - viewStart;
    e.preventDefault();
  }
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
  if (touchMode === 'pan') {
    const rect = canvas.getBoundingClientRect();
    const dx = (e.touches[0].clientX - touchStartX) / rect.width;
    const visible = viewEnd - viewStart;
    const shift = Math.round(-dx * visible);
    viewStart = Math.max(0, Math.min(candles.length - visible, touchStartView + shift));
    viewEnd = viewStart + visible;
    scheduleDraw();
    e.preventDefault();
  } else if (touchMode === 'price') {
    const dy = e.touches[0].clientY - touchStartY;
    const rect = canvas.getBoundingClientRect();
    pricePan = touchStartPricePan - (dy / rect.height) * 2 * touchStartPriceScale;
    scheduleDraw();
    e.preventDefault();
  } else if (touchMode === 'pinch') {
    const dist = getTouchDist(e.touches[0], e.touches[1]);
    if (pinchStartDist > 0 && dist > 8) {
      // Ratio absolu : écarter 2× les doigts = zoom 2×
      const ratio = pinchStartDist / dist;
      const newVisible = Math.max(5, Math.min(candles.length, pinchStartVisible * ratio));
      // Centre dynamique au milieu des deux doigts — ancré à la position des doigts
      const rect = canvas.getBoundingClientRect();
      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
      const chartW = rect.width - 40;
      const centerFrac = Math.max(0, Math.min(1, (midX - 12) / Math.max(1, chartW)));
      const centerIdx = viewStart + (viewEnd - viewStart) * centerFrac;
      // Ancrer au point de pincement (pas au milieu)
      viewStart = Math.max(0, Math.round(centerIdx - newVisible * centerFrac));
      viewEnd = Math.min(candles.length, viewStart + Math.round(newVisible));
      if (viewEnd - viewStart < 5) { viewEnd = Math.min(candles.length, viewStart + 5); }
      scheduleDraw();
    }
    e.preventDefault();
  }
}, { passive: false });

canvas.addEventListener('touchend', () => {
  touchMode = null; pinchStartDist = 0; pinchStartVisible = 0;
  canvas.style.cursor = '';
});

function isMobile() { return window.innerWidth <= 768; }
function resizeCanvas() {
  const container = canvas.parentElement;
  // ⚠️ clientWidth/clientHeight INCLUENT le padding du conteneur (8 px de
  // chaque côté) : le canvas était donc dimensionné 16 px trop grand, sa
  // boîte débordait celle du conteneur et `overflow:hidden` rognait le bord
  // droit et le bas — libellés de prix tronqués et pastille de prix coupée
  // (« $77036.96( »), à toutes les largeurs.
  const cs = getComputedStyle(container);
  const innerW = container.clientWidth
    - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const innerH = container.clientHeight
    - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  if (innerH < 100) return;
  canvas.width = innerW * window.devicePixelRatio;
  canvas.height = innerH * window.devicePixelRatio;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  canvas.style.width = innerW + 'px';
  canvas.style.height = innerH + 'px';
}
window.addEventListener('resize', () => { resizeCanvas(); drawChart(); });

// ============ API ============
// Cache klines pour éviter les 429 Binance
const klineCache = {};
function getKlineCacheKey(symbol, interval) { return `${symbol}_${interval}`; }

const toCandle = k => ({
  time: k[0] / 1000, open: parseFloat(k[1]), high: parseFloat(k[2]),
  low: parseFloat(k[3]), close: parseFloat(k[4]), volume: parseFloat(k[5])
});
// Ratio BTC/SOL aligné sur les timestamps communs.
function ratioCandles(btcData, solData) {
  const solMap = new Map(solData.map(k => [k[0], k]));
  const merged = [];
  for (const bk of btcData) {
    const sk = solMap.get(bk[0]);
    if (sk) {
      // OHLC du ratio : high/low = enveloppe du CORPS (open->close). On n'invente pas de meches :
      // la vraie extremite intra-bougie du ratio depend de la correlation des deux jambes, non
      // observable depuis deux OHLC (ne PAS « ameliorer » en btcHigh/solLow -> meches fictives).
      // Les 4 champs valaient le meme ratio -> bougies sans corps ni meche, ATR/Stoch/SAR faux.
      const op = parseFloat(bk[1]) / parseFloat(sk[1]);
      const cl = parseFloat(bk[4]) / parseFloat(sk[4]);
      merged.push({
        time: bk[0] / 1000, open: op, high: Math.max(op, cl), low: Math.min(op, cl),
        close: cl, volume: parseFloat(bk[5])
      });
    }
  }
  return merged;
}
// Fusionne les dernières bougies dans l'historique : remplace celles qui existent (la bougie
// en cours, et la précédente qui vient de clore), ajoute les nouvelles. Renvoie false s'il
// manque des bougies entre l'historique et la queue reçue (onglet longtemps en veille) :
// l'appelant recharge alors tout, plutôt que de dessiner un trou.
function mergeTail(arr, tail) {
  if (!arr.length || !tail.length) return false;
  if (tail[0].time > arr[arr.length - 1].time) return false;
  for (const c of tail) {
    let j = arr.length - 1;
    while (j >= 0 && arr[j].time > c.time) j--;
    if (j >= 0 && arr[j].time === c.time) arr[j] = c;
    else if (j === arr.length - 1) arr.push(c);
  }
  return true;
}

// RAFRAÎCHISSEMENT INCRÉMENTAL. L'ancienne version rechargeait les 3 000 bougies (3 requêtes,
// ≈ 450 Ko de JSON) toutes les 30 s pour mettre à jour UNE bougie — et cette bougie restait
// figée 30 s pendant que le badge de prix bougeait chaque seconde. L'historique n'est chargé
// qu'une fois par symbole/intervalle ; ensuite, toutes les 5 s, on ne demande que les 2
// dernières bougies (≈ 300 octets).
async function fetchKlines() {
  const cacheKey = getKlineCacheKey(activeSymbol, chartInterval);
  const sym = activeSymbol;
  const encore = () => cacheKey === getKlineCacheKey(activeSymbol, chartInterval);
  try {
    const cached = klineCache[cacheKey];
    // Sauvegarder l'état du viewport pour l'auto-scroll intelligent
    const prevLen = candles.length;
    const wasAtRightEdge = prevLen > 0 && viewEnd >= prevLen - 1;
    const visibleRange = viewEnd - viewStart;
    const suivre = () => {
      // Auto-scroll : si l'utilisateur était calé à droite, suivre les nouvelles bougies
      if (wasAtRightEdge && candles.length > prevLen) {
        viewEnd = candles.length;
        viewStart = Math.max(0, viewEnd - visibleRange);
      }
    };

    if (cached && cached.data.length) {
      const tail = sym === 'BTCSOL'
        ? ratioCandles(...await Promise.all([fetchKlinesRaw('BTCUSDT', 2), fetchKlinesRaw('SOLUSDT', 2)]))
        : (await fetchKlinesRaw(sym, 2)).map(toCandle);
      if (!encore()) return;            // symbole/intervalle changé pendant l'attente
      if (mergeTail(cached.data, tail)) {
        candles = cached.data;
        cached.ts = Date.now();
        memoCache.clear();              // la bougie en cours a changé : indicateurs à refaire
        suivre();
        return;
      }
    }

    let fresh;
    if (sym === 'BTCSOL') {
      fresh = ratioCandles(...await Promise.all([fetchKlinesRaw('BTCUSDT'), fetchKlinesRaw('SOLUSDT')]));
    } else {
      fresh = (await fetchKlinesRaw(sym)).map(toCandle);
    }
    if (!encore()) return;
    candles = fresh;
    if (sym === 'BTCSOL') {
      // BTCSOL : le merge peut perdre des bougies → cap viewEnd
      viewEnd = Math.min(viewEnd, candles.length);
      viewStart = Math.min(viewStart, candles.length - 1);
    }
    suivre();
    // Invalider le cache de mémoization (nouvelles données)
    memoCache.clear();
    klineCache[cacheKey] = { data: candles, ts: Date.now(), symbol: sym, interval: chartInterval };
    // NE PAS réinitialiser viewStart/viewEnd — respecter le zoom/pan utilisateur
  } catch(e) { console.error('Klines:', e); }
}

// ============ MEMOIZATION INDICATEURS ============
const memoCache = new Map();
function memoKey(fnName, h) { return `${fnName}_${h}`; }
function candlesHash() {
  // Hash incluant close/volume de la dernière bougie pour détecter les mises à jour live
  if (!candles.length) return 0;
  const last = candles[candles.length - 1];
  return `${candles.length}_${candles[0].time}_${last.time}_${last.close}_${last.volume}`;
}
function memoized(fnName, fn, ...args) {
  const key = memoKey(fnName, candlesHash());
  if (memoCache.has(key)) return memoCache.get(key);
  const result = fn(...args);
  memoCache.set(key, result);
  return result;
}

async function fetchKlinesRaw(symbol, last) {
  if (last) {
    const resp = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${chartInterval}&limit=${last}`);
    if (!resp.ok) throw new Error(`Binance HTTP ${resp.status}`);
    return resp.json();
  }
  let allData = [];
  let endTime = Date.now();
  for (let page = 0; page < 3; page++) {
    const resp = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${chartInterval}&limit=1000&endTime=${endTime}`);
    if (!resp.ok) throw new Error(`Binance HTTP ${resp.status}`);
    const data = await resp.json();
    if (!Array.isArray(data) || !data.length) break;
    allData = [...data, ...allData];
    endTime = data[0][0] - 1;
    if (data.length < 1000) break;
  }
  return allData;
}

// ============ MULTI-TF S/R ENGINE ============
const SR_CACHE = {}; // key: 'SYMBOL_INTERVAL' → { levels, candles, ts }
const SR_REFETCH_MS = 60000;

function getRefIntervals(interval) {
  if (['1m','5m','15m','30m'].includes(interval)) return ['1h','4h'];
  if (interval === '1h') return ['4h','1d'];
  if (interval === '4h') return ['1d','1w'];
  if (interval === '1d') return ['1w'];
  return [];
}

function getSRLookback(interval) {
  if (['1m','5m'].includes(interval)) return 5;
  if (['15m','30m'].includes(interval)) return 4;
  if (interval === '1h') return 4;
  if (interval === '4h') return 3;
  if (interval === '1d') return 2;
  if (interval === '1w') return 2;
  return 2;
}

function findPivots(candles, lookback) {
  const highs = [], lows = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    let isPh = true, isPl = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) continue;
      if (candles[j].high >= candles[i].high) isPh = false;
      if (candles[j].low <= candles[i].low) isPl = false;
    }
    // Stocke volume + timestamp pour pondération ultérieure
    if (isPh) highs.push({ price: candles[i].high, idx: i, volume: candles[i].volume, time: candles[i].time });
    if (isPl) lows.push({ price: candles[i].low,   idx: i, volume: candles[i].volume, time: candles[i].time });
  }
  return { highs, lows };
}

function clusterSR(pivots, tolerance) {
  // Prix = moyenne pondérée par log-volume. Score = somme des poids individuels.
  const levels = [], used = new Set();
  const sorted = [...pivots].sort((a, b) => b.price - a.price);
  for (const p of sorted) {
    if (used.has(p.idx)) continue;
    const pw = p.weight || 1;
    let sumPriceW = pw * p.price, sumW = pw, count = 1;
    for (const p2 of sorted) {
      if (p2.idx === p.idx || used.has(p2.idx)) continue;
      if (Math.abs(p2.price - p.price) / p.price < tolerance) {
        const w2 = p2.weight || 1;
        sumPriceW += w2 * p2.price; sumW += w2; count++;
        used.add(p2.idx);
      }
    }
    // count >= 1 : ne PAS jeter les pivots isoles (un niveau touche une fois est reel, c'est le tri par score qui ecarte le bruit).
    if (count >= 1) levels.push({ price: sumPriceW / sumW, touches: count, score: sumW });
    used.add(p.idx);
  }
  return levels.sort((a, b) => b.score - a.score);
}

function computeSR(candles, interval, maxCandles = 500) {
  const subset = candles.slice(-maxCandles);
  if (subset.length < 20) return [];
  const lookback = getSRLookback(interval);
  const lastIdx = subset.length - 1;
  
  // Tolérance dynamique basée sur ATR / prix
  const closes = subset.map(c => c.close), highs = subset.map(c => c.high), lows = subset.map(c => c.low);
  const atrArr = calcATR(highs, lows, closes, 14);
  const lastATR = atrArr[atrArr.length - 1] || 0;
  const lastPrice = closes[lastIdx] || 1;
  const tolerance = Math.max(0.002, Math.min(0.01, (lastATR / lastPrice) * 0.6));
  
  // Demi-vie par TF (en nombre de bougies)
  const halfLives = { '1m': 240, '5m': 120, '15m': 60, '30m': 40, '1h': 40, '4h': 20, '1d': 10, '1w': 5 };
  const halfLife = halfLives[interval] || 30;
  
  // Pondération par pivot : recency × log-volume
  function weightPivot(p) {
    const ageCandles = lastIdx - p.idx;
    const recency = Math.exp(-ageCandles * Math.LN2 / halfLife);
    const volW = Math.log(1 + p.volume);
    return recency * volW;
  }
  
  const { highs: ph, lows: pl } = findPivots(subset, lookback);
  const scoredHighs = ph.map(p => ({ ...p, weight: weightPivot(p) }));
  const scoredLows  = pl.map(p => ({ ...p, weight: weightPivot(p) }));
  
  // Cluster séparément highs et lows
  const all = [...clusterSR(scoredHighs, tolerance), ...clusterSR(scoredLows, tolerance)];
  all.sort((a, b) => b.score - a.score);
  
  // Dédup highs/lows qui coïncident
  const deduped = [];
  for (const lvl of all) {
    let merged = false;
    for (const d of deduped) {
      if (Math.abs(d.price - lvl.price) / Math.max(d.price, lvl.price) < tolerance * 0.8) {
        d.score += lvl.score; d.touches += lvl.touches; merged = true; break;
      }
    }
    if (!merged) deduped.push({...lvl});
  }
  return deduped.sort((a, b) => b.score - a.score);
}

async function fetchSRKlines(symbol, interval) {
  const cacheKey = `SR_${symbol}_${interval}`;
  const cached = SR_CACHE[cacheKey];
  const now = Date.now();
  if (cached && (now - cached.ts < SR_REFETCH_MS)) return cached;
  try {
    const resp = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=500`);
    if (!resp.ok) throw new Error(`Binance ${resp.status}`);
    const raw = await resp.json();
    const data = raw.map(k => ({
      time: k[0]/1000, open: parseFloat(k[1]), high: parseFloat(k[2]),
      low: parseFloat(k[3]), close: parseFloat(k[4]), volume: parseFloat(k[5])
    }));
    const levels = computeSR(data, interval, 500);
    const entry = { candles: data, levels, ts: now };
    SR_CACHE[cacheKey] = entry;
    return entry;
  } catch(e) {
    console.error('SR fetch:', symbol, interval, e.message);
    return cached || { candles: [], levels: [], ts: 0 };
  }
}

function getMultiTFLevels() {
  const all = [];
  // Memoise : getMultiTFLevels tourne a chaque drawChart (crosshair = 60 fps), computeSR est en O(pivots²).
  const currLevels = memoized('sr_' + activeSymbol + '_' + chartInterval, computeSR, candles, chartInterval, 500);
  for (const l of currLevels.slice(0, 5)) {
    all.push({ ...l, tf: chartInterval, tier: 0 });
  }
  // Ref TFs from cache
  const refs = getRefIntervals(chartInterval);
  refs.forEach((refInt, idx) => {
    const cacheKey = `SR_${activeSymbol}_${refInt}`;
    const cached = SR_CACHE[cacheKey];
    if (cached && cached.levels) {
      for (const l of cached.levels.slice(0, 4)) {
        all.push({ ...l, tf: refInt, tier: idx + 1 });
      }
    }
  });
  // Cross-TF dedup 0.5%
  const deduped = [];
  for (const lvl of all) {
    let merged = false;
    for (const d of deduped) {
      if (Math.abs(d.price - lvl.price) / Math.max(d.price, lvl.price) < 0.005) {
        d.score += lvl.score;
        d.touches += lvl.touches;
        // MAX, pas MIN : un niveau present sur le TF courant ET le daily heritait tier 0 -> « Mineur » pointille.
        d.tier = Math.max(d.tier, lvl.tier);
        merged = true; break;
      }
    }
    if (!merged) deduped.push({...lvl});
  }
  return deduped.sort((a, b) => b.score - a.score);
}

async function refreshRefSR() {
  if (!overlays.sr) return;
  // Awaits : en fire-and-forget le 1er rendu n'avait que le TF courant, les majeurs poussaient jusqu'a 60 s apres.
  await Promise.all(getRefIntervals(chartInterval).map(i => fetchSRKlines(activeSymbol, i)));
}

// Décimales selon l'ordre de grandeur du prix. 3 décimales fixes (badge, axe, infobulle)
// affichaient un 0 inventé sur BTC (cotation au centime) et tronquaient XRP (0,0001 $).
function pxDec(v) { const a = Math.abs(v); return a >= 10 ? 2 : a >= 1 ? 4 : 6; }
function fmtPrix(v) { return v.toFixed(pxDec(v)); }

async function fetchPrice() {
  try {
    let price;
    if (activeSymbol === 'BTCSOL') {
      const [btc, sol] = await Promise.all([
        fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT').then(r => r.json()),
        fetch('https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT').then(r => r.json())
      ]);
      price = parseFloat(btc.price) / parseFloat(sol.price);
    } else {
      const resp = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${activeSymbol}`);
      const data = await resp.json();
      price = parseFloat(data.price);
    }
    const el = document.getElementById('price');
    if (livePrice && price > livePrice) el.className = 'price-badge price-up';
    else if (livePrice && price < livePrice) el.className = 'price-badge price-down';
    else el.className = 'price-badge';
    // Éclair doux à chaque changement : le mouvement se VOIT sans que le chiffre reste coloré.
    if (livePrice && price !== livePrice && el.animate
        && !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches)) {
      const c = getComputedStyle(document.body).getPropertyValue(price > livePrice ? '--up' : '--down').trim();
      el.animate([{ filter: 'drop-shadow(0 0 7px ' + c + ')' }, { filter: 'drop-shadow(0 0 0 transparent)' }],
                 { duration: 900, easing: 'ease-out' });
    }
    const dec = pxDec(price);
    el.textContent = '$' + price.toLocaleString('en-US', {minimumFractionDigits: dec, maximumFractionDigits: dec});
    livePrice = price;
  } catch(e) {}
}

// ============ LIQUIDITÉ (HEATMAP HISTORIQUE) ============
let histHeatmap = null, depthTimer = null;
const HEAT_BID = (() => { const a = []; for (let i = 0; i < 256; i++) { const t = i / 255; a.push(`rgba(${10 + 80 * t | 0},${60 + 180 * t | 0},${55 + 165 * t | 0},${0.2 + 0.65 * t})`); } return a; })();
const HEAT_ASK = (() => { const a = []; for (let i = 0; i < 256; i++) { const t = i / 255; a.push(`rgba(${60 + 195 * t | 0},${15 + 105 * t | 0},${15 + 75 * t | 0},${0.2 + 0.65 * t})`); } return a; })();
// Heatmap : la grille NATIVE (1 px = 1 (colonne minute, bin de prix)) est rastérisée une
// fois par payload puis composée en UN drawImage, au lieu d'un fillRect par cellule
// (jusqu'à 128 k appels/frame, ~175 ms mesuré, pour un rendu quasi identique : en 15m les
// colonnes se tuilent déjà à ~0,93 px). Le coût était le NOMBRE d'appels, pas la surface peinte.
let heatLayer = null;   // { cv, w, h, img, key }
function heatGrid(hm) {
  if (hm._g) return hm._g;
  let w = 0, h = 0;
  for (const side of [hm.bids, hm.asks]) for (const [c, pb] of side) { if (c >= w) w = c + 1; if (pb >= h) h = pb + 1; }
  // Palettes -> Uint32 ABGR (ordre mémoire d'ImageData, little-endian) : un pixel écrit
  // sans reparser une chaîne CSS par cellule.
  const u32 = pal => { const a = new Uint32Array(256);
    for (let i = 0; i < 256; i++) { const m = pal[i].match(/[\d.]+/g);
      a[i] = ((+m[3] * 255 | 0) << 24 | (+m[2] << 16) | (+m[1] << 8) | +m[0]) >>> 0; }
    return a; };
  return (hm._g = { w, h, bid: u32(HEAT_BID), ask: u32(HEAT_ASK) });
}
function buildHeatLayer(hm) {
  const g = heatGrid(hm);
  if (!g.w || !g.h) return null;
  if (!heatLayer || heatLayer.w !== g.w || heatLayer.h !== g.h) {
    const cv = document.createElement('canvas');
    cv.width = g.w; cv.height = g.h;
    heatLayer = { cv, w: g.w, h: g.h, img: new ImageData(g.w, g.h), key: null };
  }
  if (heatLayer.key === hm.updated) return heatLayer;   // payload inchangé -> rien à refaire
  const px = new Uint32Array(heatLayer.img.data.buffer);
  px.fill(0);
  // Ligne 0 en HAUT = prix le plus haut (drawImage descend, le prix monte).
  for (const [cells, pal] of [[hm.bids, g.bid], [hm.asks, g.ask]])
    for (const [c, pb, v] of cells) px[(g.h - 1 - pb) * g.w + c] = pal[v] || pal[255];
  heatLayer.cv.getContext('2d').putImageData(heatLayer.img, 0, 0);
  heatLayer.key = hm.updated;
  return heatLayer;
}
// heatmap.json pèse ≈ 2 Mo et n'est republié que toutes les 15 min. Avec un `?t=` unique et
// `no-store`, chaque minute retéléchargeait les 2 Mo (≈ 120 Mo/h, overlay allumé). Sans le
// paramètre et en `no-cache`, le navigateur REVALIDE par ETag : réponse 304 de quelques
// centaines d'octets tant que le fichier n'a pas changé (vérifié le 04/10/2026). Contrepartie :
// le CDN de GitHub garde sa copie jusqu'à 5 min (max-age=300) — sans effet sur une couche
// de 24 h publiée au quart d'heure.
const HEATMAP_URL = 'https://raw.githubusercontent.com/lorenzoapro12-jpg/samsara-live/master/heatmap.json';
async function fetchHeatmap() {
  if (document.hidden) return;
  try {
    const r = await fetch(HEATMAP_URL, { cache: 'no-cache' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    histHeatmap = await r.json();
    if (overlays.liq) drawChart();
  } catch(e) {}
}
function toggleDepth(on) {
  if (on) { fetchHeatmap(); if (!depthTimer) depthTimer = setInterval(fetchHeatmap, 60000); }
  else { clearInterval(depthTimer); depthTimer = null; }
}

// ============ INDICATEURS ============
function calcEMA(data, period) {
  const k = 2 / (period + 1);
  const out = new Array(data.length).fill(null);
  let sum = 0;
  for (let i = 0; i < period; i++) sum += data[i];
  out[period - 1] = sum / period;
  for (let i = period; i < data.length; i++) out[i] = data[i] * k + out[i - 1] * (1 - k);
  return out;
}

function calcSMA(data, period) {
  const out = new Array(data.length).fill(null);
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += data[j];
    out[i] = sum / period;
  }
  return out;
}

function calcBollinger(data, period, stdDev) {
  const sma = calcSMA(data, period);
  const upper = new Array(data.length).fill(null);
  const lower = new Array(data.length).fill(null);
  for (let i = period - 1; i < data.length; i++) {
    let sumSq = 0;
    for (let j = i - period + 1; j <= i; j++) sumSq += (data[j] - sma[i]) ** 2;
    const std = Math.sqrt(sumSq / period);
    upper[i] = sma[i] + stdDev * std;
    lower[i] = sma[i] - stdDev * std;
  }
  return { sma, upper, lower };
}

function calcRSI(data, period) {
  const out = new Array(data.length).fill(null);
  if (data.length < period + 1) return out;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const d = data[i] - data[i - 1];
    if (d > 0) gains += d; else losses -= d;
  }
  let avgGain = gains / period, avgLoss = losses / period;
  out[period] = 100 - 100 / (1 + avgGain / (avgLoss || 1e-10));
  for (let i = period + 1; i < data.length; i++) {
    const d = data[i] - data[i - 1];
    avgGain = (avgGain * (period - 1) + (d > 0 ? d : 0)) / period;
    avgLoss = (avgLoss * (period - 1) + (d < 0 ? -d : 0)) / period;
    out[i] = 100 - 100 / (1 + avgGain / (avgLoss || 1e-10));
  }
  return out;
}

function calcMACD(data) {
  const ema12 = calcEMA(data, 12);
  const ema26 = calcEMA(data, 26);
  const macdLine = new Array(data.length).fill(null);
  for (let i = 0; i < data.length; i++) {
    if (ema12[i] !== null && ema26[i] !== null) macdLine[i] = ema12[i] - ema26[i];
  }
  const signal = calcEMA(macdLine.filter(v => v !== null), 9);
  // Re-align signal
  const signalAligned = new Array(data.length).fill(null);
  let si = 0;
  for (let i = 0; i < data.length; i++) {
    if (macdLine[i] !== null && si < signal.length) signalAligned[i] = signal[si++];
  }
  const histogram = new Array(data.length).fill(null);
  for (let i = 0; i < data.length; i++) {
    if (macdLine[i] !== null && signalAligned[i] !== null) histogram[i] = macdLine[i] - signalAligned[i];
  }
  return { macdLine, signal: signalAligned, histogram };
}

function calcStoch(highs, lows, closes, kPeriod, dPeriod) {
  const kOut = new Array(closes.length).fill(null);
  const dOut = new Array(closes.length).fill(null);
  for (let i = kPeriod - 1; i < closes.length; i++) {
    const h = Math.max(...highs.slice(i - kPeriod + 1, i + 1));
    const l = Math.min(...lows.slice(i - kPeriod + 1, i + 1));
    kOut[i] = ((closes[i] - l) / (h - l || 1)) * 100;
  }
  // SMA of %K for %D
  for (let i = kPeriod + dPeriod - 2; i < closes.length; i++) {
    let sum = 0, count = 0;
    for (let j = i - dPeriod + 1; j <= i; j++) {
      if (kOut[j] !== null) { sum += kOut[j]; count++; }
    }
    if (count > 0) dOut[i] = sum / count;
  }
  return { k: kOut, d: dOut };
}

function calcATR(highs, lows, closes, period) {
  const tr = [null];
  for (let i = 1; i < closes.length; i++) {
    tr.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i-1]), Math.abs(lows[i] - closes[i-1])));
  }
  const atr = new Array(closes.length).fill(null);
  let sum = 0;
  for (let i = 1; i <= period; i++) sum += tr[i];
  atr[period] = sum / period;
  for (let i = period + 1; i < closes.length; i++) {
    atr[i] = (atr[i-1] * (period - 1) + tr[i]) / period;
  }
  return atr;
}

function calcVWAP(highs, lows, closes, volumes, times, interval) {
  const out = new Array(closes.length).fill(null);
  // Ancrage : un cumul depuis la PREMIERE bougie chargee (3000 = 125 jours en 1h) donne une
  // moyenne longue, pas un VWAP. Intraday -> reset a chaque jour UTC (vrai VWAP de session) ;
  // en 4h/1d/1w, pas de session intraday ou s'ancrer -> l'ancrage est recale toutes les 20 bougies.
  const sec = { '1m':60,'3m':180,'5m':300,'15m':900,'30m':1800,'1h':3600,'4h':14400,'1d':86400,'1w':604800 }[interval];
  const bucket = !sec ? 0 : (sec < 86400 ? 86400 : sec * 20);
  let cumPV = 0, cumV = 0, b = null;
  for (let i = 0; i < closes.length; i++) {
    const key = (times && bucket) ? Math.floor(times[i] / bucket) : 0;
    if (key !== b) { b = key; cumPV = 0; cumV = 0; }
    cumPV += ((highs[i] + lows[i] + closes[i]) / 3) * volumes[i];
    cumV += volumes[i];
    out[i] = cumPV / (cumV || 1);
  }
  return out;
}

function calcIchimoku(highs, lows, closes) {
  const tenkan = [], kijun = [], senkouA = [], senkouB = [], chikou = [];
  for (let i = 0; i < closes.length; i++) {
    if (i >= 8) {
      const h9 = Math.max(...highs.slice(i - 8, i + 1));
      const l9 = Math.min(...lows.slice(i - 8, i + 1));
      tenkan.push((h9 + l9) / 2);
    } else tenkan.push(null);
    if (i >= 25) {
      const h26 = Math.max(...highs.slice(i - 25, i + 1));
      const l26 = Math.min(...lows.slice(i - 25, i + 1));
      kijun.push((h26 + l26) / 2);
    } else kijun.push(null);
    senkouA.push(null); senkouB.push(null);
    if (i >= 25) {
      senkouA[i] = ((tenkan[i] || 0) + (kijun[i] || 0)) / 2;
    }
    if (i >= 51) {
      const h52 = Math.max(...highs.slice(i - 51, i + 1));
      const l52 = Math.min(...lows.slice(i - 51, i + 1));
      senkouB[i] = (h52 + l52) / 2;
    }
  }
  // Chikou = cloture COURANTE reportee 26 periodes EN ARRIERE : a l'indice i, la cloture
  // de i+25 (convention TradingView, decalage 26 => offset 25). L'ancienne formule lisait
  // closes[i-25] : un prix d'il y a 25 bougies avance dans le futur, l'inverse du Chikou.
  for (let i = 0; i < closes.length; i++) chikou.push(i + 25 < closes.length ? closes[i + 25] : null);
  // Shift senkou forward 26 periods
  const shiftedA = new Array(closes.length + 26).fill(null);
  const shiftedB = new Array(closes.length + 26).fill(null);
  for (let i = 0; i < senkouA.length; i++) {
    if (senkouA[i] !== null && i + 26 < shiftedA.length) shiftedA[i + 26] = senkouA[i];
    if (senkouB[i] !== null && i + 26 < shiftedB.length) shiftedB[i + 26] = senkouB[i];
  }
  return { tenkan, kijun, senkouA: shiftedA, senkouB: shiftedB, chikou };
}

function calcSAR(highs, lows, closes, afStep = 0.02, afMax = 0.2) {
  const out = new Array(closes.length).fill(null);
  if (closes.length < 2) return out;
  // Algorithme de TradingView (ta.sar), tendance initiale deduite des deux premieres clotures.
  // Le bornage par les deux bougies precedentes se fait dans la direction COURANTE, donc
  // APRES un eventuel retournement — et le SAR d'un retournement est pose au-dela de la
  // bougie (max(haut, EP) / min(bas, EP)). L'ancienne version bornait dans l'ANCIENNE
  // direction : le SAR baissier etait ramene sous le prix et se retournait a la bougie
  // suivante. Mesure le 04/10/2026 sur 1 000 bougies 1h BTC : 221 points DANS la bougie et
  // 398 retournements ; la version actuelle donne 0 et 76, identique a ta.sar.
  let isUp = closes[1] > closes[0];
  let af = afStep;
  let ep = isUp ? highs[1] : lows[1];
  let sar = isUp ? lows[0] : highs[0];
  for (let i = 1; i < closes.length; i++) {
    let premiere = (i === 1);
    sar = sar + af * (ep - sar);
    if (isUp && sar > lows[i]) {
      premiere = true; isUp = false; sar = Math.max(highs[i], ep); ep = lows[i]; af = afStep;
    } else if (!isUp && sar < highs[i]) {
      premiere = true; isUp = true; sar = Math.min(lows[i], ep); ep = highs[i]; af = afStep;
    }
    if (!premiere) {
      if (isUp && highs[i] > ep) { ep = highs[i]; af = Math.min(afMax, af + afStep); }
      if (!isUp && lows[i] < ep) { ep = lows[i]; af = Math.min(afMax, af + afStep); }
    }
    if (isUp) { sar = Math.min(sar, lows[i - 1]); if (i > 1) sar = Math.min(sar, lows[i - 2]); }
    else      { sar = Math.max(sar, highs[i - 1]); if (i > 1) sar = Math.max(sar, highs[i - 2]); }
    out[i] = sar;
  }
  return out;
}

function calcOBV(closes, volumes) {
  const out = new Array(closes.length).fill(0);
  for (let i = 1; i < closes.length; i++) {
    if (closes[i] > closes[i - 1]) out[i] = out[i - 1] + volumes[i];
    else if (closes[i] < closes[i - 1]) out[i] = out[i - 1] - volumes[i];
    else out[i] = out[i - 1];
  }
  return out;
}

function calcMFI(highs, lows, closes, volumes, period) {
  const tp = closes.map((c, i) => (highs[i] + lows[i] + c) / 3);
  const mf = tp.map((p, i) => p * volumes[i]);
  const out = new Array(closes.length).fill(null);
  for (let i = period; i < closes.length; i++) {
    let posFlow = 0, negFlow = 0;
    for (let j = i - period + 1; j <= i; j++) {
      if (tp[j] > tp[j - 1]) posFlow += mf[j];
      else if (tp[j] < tp[j - 1]) negFlow += mf[j];
    }
    out[i] = 100 - 100 / (1 + posFlow / (negFlow || 1));
  }
  return out;
}

function calcWilliamsR(highs, lows, closes, period) {
  const out = new Array(closes.length).fill(null);
  for (let i = period - 1; i < closes.length; i++) {
    const h = Math.max(...highs.slice(i - period + 1, i + 1));
    const l = Math.min(...lows.slice(i - period + 1, i + 1));
    out[i] = ((h - closes[i]) / (h - l || 1)) * -100;
  }
  return out;
}

function calcCCI(highs, lows, closes, period) {
  const tp = closes.map((c, i) => (highs[i] + lows[i] + c) / 3);
  const out = new Array(closes.length).fill(null);
  for (let i = period - 1; i < closes.length; i++) {
    const slice = tp.slice(i - period + 1, i + 1);
    const sma = slice.reduce((a, b) => a + b, 0) / period;
    const mad = slice.reduce((a, b) => a + Math.abs(b - sma), 0) / period;
    out[i] = (tp[i] - sma) / (0.015 * (mad || 1));
  }
  return out;
}

function calcADX(highs, lows, closes, period) {
  const plusDM = [], minusDM = [], tr = [], atrArr = [];
  const adx = new Array(closes.length).fill(null);
  const plusDI = new Array(closes.length).fill(null);
  const minusDI = new Array(closes.length).fill(null);
  for (let i = 0; i < closes.length; i++) {
    if (i === 0) { plusDM.push(0); minusDM.push(0); tr.push(highs[i] - lows[i]); }
    else {
      const up = highs[i] - highs[i - 1];
      const dn = lows[i - 1] - lows[i];
      plusDM.push(up > dn && up > 0 ? up : 0);
      minusDM.push(dn > up && dn > 0 ? dn : 0);
      tr.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1])));
    }
  }
  // Lissage de Wilder sur TR/+DM/-DM, amorce sur les `period` premieres VRAIES variations
  // (indices 1..period : la bougie 0 n'a pas de veille, son TR n'est pas un vrai range).
  if (closes.length <= period * 2) return { adx, plusDI, minusDI };
  let atrSum = tr.slice(1, period + 1).reduce((a, b) => a + b, 0);
  let pdmSum = plusDM.slice(1, period + 1).reduce((a, b) => a + b, 0);
  let ndmSum = minusDM.slice(1, period + 1).reduce((a, b) => a + b, 0);
  // ADX = DX LISSE PAR WILDER (moyenne des `period` premiers DX, puis recursion 1/period).
  // L'ancienne version prenait une moyenne SIMPLE glissante des DX : ecart mesure jusqu'a
  // 12,8 pts avec la definition de Wilder (TradingView) sur 200 bougies 1h BTC.
  let dxSeed = 0, adxPrev = null;
  for (let i = period; i < closes.length; i++) {
    if (i > period) {
      atrSum = atrSum - atrSum / period + tr[i];
      pdmSum = pdmSum - pdmSum / period + plusDM[i];
      ndmSum = ndmSum - ndmSum / period + minusDM[i];
    }
    atrArr[i] = atrSum;
    plusDI[i] = (pdmSum / atrSum) * 100;
    minusDI[i] = (ndmSum / atrSum) * 100;
    const dx = Math.abs((plusDI[i] - minusDI[i]) / ((plusDI[i] + minusDI[i]) || 1)) * 100;
    if (adxPrev === null) {
      dxSeed += dx;
      if (i === period * 2 - 1) { adxPrev = dxSeed / period; adx[i] = adxPrev; }
    } else {
      adxPrev = (adxPrev * (period - 1) + dx) / period;
      adx[i] = adxPrev;
    }
  }
  return { adx, plusDI, minusDI };
}

function calcAO(highs, lows) {
  const mid = highs.map((h, i) => (h + lows[i]) / 2);
  const sma5 = calcSMA(mid, 5);
  const sma34 = calcSMA(mid, 34);
  const out = new Array(mid.length).fill(null);
  for (let i = 0; i < mid.length; i++) {
    if (sma5[i] !== null && sma34[i] !== null) out[i] = sma5[i] - sma34[i];
  }
  return out;
}

// ============ STRATEGY ENGINE ============
// Grid bot FSM — Pure functional evaluator: (MarketState, BotState, Config) => {nextBotState, orders}
// Constraint: ALL functions MUST only access candles[0..idx], never the full array beyond idx
const ST_FEE_MAKER = 0.001;   // 0.1%
const ST_FEE_TAKER = 0.001;   // 0.1%
const ST_DEFAULT_CAPITAL = 1000; // USDT

const ST_STATES = { IDLE: 'idle', ACTIVE: 'active', RANGE_EXIT: 'range_exit' };

// Registry of all strategies
const STRATEGIES = {};

// « Comment ça marche » en une phrase, affiché sous le nom. Sans ça, un débutant ne peut pas
// savoir que Bollinger n'achète QUE sur la bande basse (d'où un backtest qui ne fait rien).
const STRAT_DESC = {
  bb_grid:   'achète à chaque niveau dès que le prix touche la bande de Bollinger basse. Plage auto : bande basse → bande médiane, donc aucune entrée tant que le prix ne descend pas jusque-là.',
  rsi_grid:  'n\'arme la grille que si le RSI passe sous le seuil de survente (prix qui chute). Plage auto : prix courant ±5 %.',
  ema_grid:  'achète les replis sur l\'EMA tant que la tendance reste haussière. Plage auto : EMA → prix courant.',
  sr_grid:   'grille PERMANENTE bornée par le support et la résistance les plus proches. Repli sur ±5 % si aucun niveau n\'atteint le score minimum.',
  dumb_grid: 'témoin sans aucun signal : grille fixe ±5 % toujours active. C\'est la référence que les autres doivent battre.',
};

function registerStrategy(key, def) { STRATEGIES[key] = def; }

// Helper: distribute N levels evenly between low and high price
function distributeGridLevels(low, high, n) {
  const levels = [];
  for (let i = 0; i < n; i++) {
    const price = n > 1 ? low + ((high - low) * i) / (n - 1) : low;
    levels.push({ price, side: 'buy' });
  }
  return levels;
}

// ─── Helpers communs aux strategies de grille ───
// Ces params etaient copies dans les 5 grilles : toute nouvelle grille DOIT passer par ici.
// ORDRE = ordre d'affichage, lu par paires sur 2 colonnes : (Capital|Niveaux) (Prix inf|Prix sup)
// (TP|SL). Ne pas remettre gridLevels au milieu de la plage : les paires n'ont plus de sens.
function gridParams(levels, tp, sl, loHint, hiHint) {
  return {
    gridLevels: { value: levels, min: 2, max: 500, step: 1, label: 'Niveaux' },
    priceLow: { value: 0, min: 0, max: 999999, step: 1, label: 'Prix inférieur', hint: loHint },
    priceHigh: { value: 0, min: 0, max: 999999, step: 1, label: 'Prix supérieur', hint: hiHint },
    tpPct: { value: tp, min: 0.1, max: 5, step: 0.1, label: 'Take Profit %' },
    slPct: { value: sl, min: 0.5, max: 10, step: 0.5, label: 'Stop Loss %' },
  };
}
// Borne manuelle si > 0, sinon la borne auto calculee par la strategie
function gridRange(params, autoLow, autoHigh) {
  return { low: (params.priceLow > 0) ? params.priceLow : autoLow,
           high: (params.priceHigh > 0) ? params.priceHigh : autoHigh };
}
function gridExec(level, entryCandle, params) {
  return { tp: level.price * (1 + params.tpPct / 100), sl: level.price * (1 - params.slPct / 100) };
}

// ─── Bollinger Grid Strategy ───
registerStrategy('bb_grid', {
  label: 'Grille Bollinger',
  params: {
    ...gridParams(10, 0.5, 3, '0 = auto (bande inf BB)', '0 = auto (bande mid BB)'),
    period: { value: 20, min: 10, max: 50, step: 1, label: 'Période BB', advanced: true },
    stddev: { value: 2, min: 1, max: 4, step: 0.5, label: 'Écart-type', advanced: true },
    reentryThreshold: { value: 0.3, min: 0.1, max: 2, step: 0.1, label: 'Seuil réalignement %', advanced: true },
  },
  trigger(candles, idx, params, indicators) {
    if (idx < params.period) return 'idle';
    const bbLower = indicators.bb_lower, bbUpper = indicators.bb_upper;
    const close = candles[idx].close;
    if (bbLower && close <= bbLower[idx] * 1.002) return 'enter';
    if (bbUpper && close >= bbUpper[idx] * 0.998) return 'exit';
    return null;
  },
  generateLevels(candles, idx, params, indicators) {
    const r = gridRange(params, indicators.bb_lower[idx], indicators.bb_mid[idx]);
    return distributeGridLevels(r.low, r.high, params.gridLevels);
  },
  execution: gridExec
});

// ─── RSI Grid Strategy ───
registerStrategy('rsi_grid', {
  label: 'Grille RSI',
  params: {
    ...gridParams(10, 0.8, 4, '0 = auto (-5% prix)', '0 = auto (+5% prix)'),
    oversold: { value: 30, min: 15, max: 45, step: 1, label: 'Seuil survente', advanced: true },
    rsiPeriod: { value: 14, min: 5, max: 30, step: 1, label: 'Période RSI', advanced: true },
    exitRsi: { value: 50, min: 40, max: 70, step: 1, label: 'Seuil sortie RSI', advanced: true },
  },
  trigger(candles, idx, params, indicators) {
    if (idx < params.rsiPeriod) return 'idle';
    const rsi = indicators.rsi;
    if (rsi[idx] !== null && rsi[idx] <= params.oversold) return 'enter';
    if (rsi[idx] !== null && rsi[idx] >= params.exitRsi) return 'exit';
    return null;
  },
  generateLevels(candles, idx, params) {
    const price = candles[idx].close;
    const r = gridRange(params, price * 0.95, price * 1.05);
    return distributeGridLevels(r.low, r.high, params.gridLevels);
  },
  execution: gridExec
});

// ─── EMA Pullback Grid Strategy ───
registerStrategy('ema_grid', {
  label: 'Grille EMA Pullback',
  params: {
    ...gridParams(10, 0.5, 3, '0 = auto (EMA)', '0 = auto (prix courant)'),
    emaPeriod: { value: 50, min: 10, max: 200, step: 10, label: 'Période EMA', advanced: true },
    pullbackPct: { value: 2, min: 0.5, max: 10, step: 0.5, label: 'Pullback min %', advanced: true },
    trendMinBars: { value: 5, min: 3, max: 20, step: 1, label: 'Bars tendance min', advanced: true },
  },
  trigger(candles, idx, params, indicators) {
    if (idx < params.emaPeriod + params.trendMinBars) return 'idle';
    const ema = indicators.ema;
    const close = candles[idx].close;
    let trendUp = true;
    for (let i = idx - params.trendMinBars + 1; i <= idx; i++) {
      if (candles[i].close <= ema[i]) { trendUp = false; break; }
    }
    if (!trendUp) return 'idle';
    const distPct = ((close - ema[idx]) / ema[idx]) * 100;
    if (distPct <= params.pullbackPct && distPct > 0) return 'enter';
    if (distPct > params.pullbackPct * 2) return 'exit';
    return null;
  },
  generateLevels(candles, idx, params, indicators) {
    const r = gridRange(params, indicators.ema[idx], candles[idx].close);
    return distributeGridLevels(r.low, r.high, params.gridLevels);
  },
  execution: gridExec
});

// ─── S/R Grid Strategy ───
// Grille bornee par les S/R les plus proches (computeSR du TF courant, filtre srMinScore). PERMANENTE comme dumb_grid : l'alpha est dans le PLACEMENT. Pas de look-ahead.
registerStrategy('sr_grid', {
  label: 'Grille S/R',
  params: {
    ...gridParams(6, 0.5, 2, '0 = auto (support le plus proche)', '0 = auto (résistance la plus proche)'),
    srMinScore: { value: 2, min: 1, max: 10, step: 1, label: 'Score S/R min', advanced: true },
  },
  trigger(candles, idx) {
    if (idx < 60) return 'idle';   // laisser de l'historique pour que les pivots existent
    return 'enter';
  },
  generateLevels(candles, idx, params) {
    const price = candles[idx].close;
    const levels = computeSR(candles.slice(Math.max(0, idx - 299), idx + 1), chartInterval, 500)
      .filter(l => l.score >= params.srMinScore);
    const sup = levels.filter(l => l.price < price).sort((a, b) => b.price - a.price)[0];
    const res = levels.filter(l => l.price > price).sort((a, b) => a.price - b.price)[0];
    // Aucun niveau ne passe le filtre -> repli sur ±5% (comportement de dumb_grid)
    const r = gridRange(params, sup ? sup.price : price * 0.95, res ? res.price : price * 1.05);
    return distributeGridLevels(r.low, r.high, params.gridLevels);
  },
  execution: gridExec
});

// ─── Dumb Grid (fixed intervals, no TA) ───
registerStrategy('dumb_grid', {
  label: 'Grille Fixe (benchmark)',
  params: gridParams(10, 0.5, 3, '0 = auto (-5%)', '0 = auto (+5%)'),
  trigger(candles, idx) {
    if (idx < 2) return 'idle';
    return 'enter';
  },
  generateLevels(candles, idx, params) {
    const price = candles[idx].close;
    const r = gridRange(params, price * 0.95, price * 1.05);
    return distributeGridLevels(r.low, r.high, params.gridLevels);
  },
  execution: gridExec
});

// ─── GridBot class — runs a strategy over candles ───
class GridBot {
  constructor(strategyKey, capital) {
    this.strategyKey = strategyKey;            // chaine — pour les tests de type dans computeIndicators
    this.strategy = STRATEGIES[strategyKey];
    this.capital = capital || ST_DEFAULT_CAPITAL;
    this.reset();
  }

  reset() {
    this.state = ST_STATES.IDLE;
    this.gridLevels = [];     // {price, side, status:'pending'|'filled'|'closed', entryIdx, exitIdx, pnl, tp, sl}
    this.trades = [];         // completed round-trips
    this.cash = this.capital;
    this.asset = 0;
    this.lastRealignIdx = -1;
    this._skipFillIdx = -1;   // bougie de mise en place : non remplissable (anti look-ahead)
  }

  // Build params object from strategy defaults (overridden by user config)
  buildParams(userParams) {
    const p = {};
    for (const [k, def] of Object.entries(this.strategy.params)) {
      p[k] = (userParams && userParams[k] !== undefined) ? userParams[k] : def.value;
    }
    return p;
  }

  // Only uses candles[0..limit] — safe against look-ahead.
  // `params` = params FUSIONNES (buildParams) : sans ca « Periode BB » / « Ecart-type » / « Periode RSI » sont INERTES.
  computeIndicators(candles, limit, params) {
    const p = params || this.buildParams({});
    const closes = candles.slice(0, limit + 1).map(c => c.close);
    const ind = {};
    const key = this.strategyKey;

    if (key === 'bb_grid') {
      const period = p.period || 20, stddev = (p.stddev === undefined ? 2 : p.stddev);
      if (closes.length >= period) {
        const bb = calcBollinger(closes, period, stddev);
        ind.bb_upper = bb.upper; ind.bb_lower = bb.lower; ind.bb_mid = bb.sma;
      }
    }
    if (key === 'ema_grid') {
      if (closes.length >= 50) ind.ema = calcEMA(closes, 50);
    }
    if (key === 'rsi_grid') {
      const rsiP = p.rsiPeriod || 14;
      if (closes.length >= rsiP) ind.rsi = calcRSI(closes, rsiP);
    }

    // Filet : un trigger qui lit bb_*/rsi doit trouver un tableau, jamais undefined
    if (!ind.bb_upper && closes.length >= 20) {
      const bb20 = calcBollinger(closes, 20, 2);
      ind.bb_upper = bb20.upper; ind.bb_lower = bb20.lower; ind.bb_mid = bb20.sma;
    }
    if (!ind.rsi && closes.length >= 14) ind.rsi = calcRSI(closes, 14);

    return ind;
  }

  // Step one candle — pure functional evaluation
  step(candles, idx, params, indicators) {
    const s = this.strategy;
    const trigger = s.trigger(candles, idx, params, indicators);

    // State transitions
    if (trigger === 'exit') {
      this.state = ST_STATES.IDLE;
      this._closeAllLevels(candles[idx]);
      this.gridLevels = [];
    }
    if (trigger === 'enter' && this.state !== ST_STATES.ACTIVE) {
      this.state = ST_STATES.ACTIVE;
      this._setupGrid(candles, idx, params, indicators);
      // Les ordres viennent d'etre places SUR la cloture de cette bougie : leur remplissage
      // ne peut pas etre constate avec le high/low de la bougie qui les a vus naitre.
      this._skipFillIdx = idx;
    }

    // If active, check fills on existing levels
    if (this.state === ST_STATES.ACTIVE && idx !== this._skipFillIdx) {
      this._checkFills(candles, idx, params);
    }

    return { state: this.state, gridLevels: [...this.gridLevels], trades: [...this.trades] };
  }

  _setupGrid(candles, idx, params, indicators) {
    const levels = this.strategy.generateLevels(candles, idx, params, indicators);
    const sizePerLevel = this.cash / levels.length;
    this.gridLevels = levels.map(l => ({
      price: l.price,
      side: l.side || 'buy',
      size: sizePerLevel / l.price, // quantity in base asset
      cost: sizePerLevel,
      status: 'pending',
      entryIdx: null,
      exitIdx: null,
      pnl: 0,
      tp: null,
      sl: null,
      reactivationCount: 0
    }));
    this.lastRealignIdx = idx;
  }

  _checkFills(candles, idx, params) {
    const c = candles[idx];
    // Pessimistic execution: if both tp and sl hit in same candle, sl wins
    for (const level of this.gridLevels) {
      if (level.status === 'pending') {
        // Fill: price crosses below level price (buy limit)
        if (c.low <= level.price && c.high >= level.price) {
          level.status = 'filled';
          level.entryIdx = idx;
          // Frais maker d'entree debites du cash MAINTENANT (le P&L les comptait, pas le grand livre).
          level.entryFee = level.cost * ST_FEE_MAKER;
          this.cash -= level.cost + level.entryFee;
          this.asset += level.size;
          const exec = this.strategy.execution(level, c, params);
          level.tp = exec.tp;
          level.sl = exec.sl;
          // Un achat limite sous le prix est rempli EN DESCENDANT : si la même bougie descend
          // ensuite jusqu'au stop, la perte a eu lieu. L'ancienne version ne testait le stop
          // qu'à la bougie suivante — un rebond entre-temps effaçait une perte réelle (biais
          // optimiste). Le take-profit, lui, n'est pas pris : l'ordre haut/bas est inconnu.
          if (c.low <= level.sl) this._closeLevel(level, idx, level.sl, true);
        }
      } else if (level.status === 'filled') {
        // Check SL first (pessimistic)
        if (c.low <= level.sl && c.high >= level.sl) {
          this._closeLevel(level, idx, level.sl, true);
        } else if (c.high >= level.tp && c.low <= level.tp) {
          this._closeLevel(level, idx, level.tp, false);
        }
      }
    }

    // Realignment check — only if price moved significantly
    if (idx - this.lastRealignIdx > 5) {
      const realignPct = params.reentryThreshold || 0.3;
      const avgLevel = this.gridLevels.reduce((s, l) => s + l.price, 0) / this.gridLevels.length || 1;
      if (Math.abs((c.close - avgLevel) / avgLevel) > realignPct / 100) {
        // Close pending levels, regenerate
        this.gridLevels = this.gridLevels.filter(l => l.status !== 'pending');
        const indicators = this.computeIndicators(candles, idx, params);
        const newLevels = this.strategy.generateLevels(candles, idx, params, indicators);
        const remainingCash = this.cash;
        const sizePerLevel = remainingCash / Math.max(1, newLevels.length);
        for (const l of newLevels) {
          // Don't add if we already have a level at this price (within 0.2%)
          const exists = this.gridLevels.some(ex => Math.abs((ex.price - l.price) / l.price) < 0.002);
          if (!exists) {
            this.gridLevels.push({
              price: l.price, side: l.side || 'buy',
              size: sizePerLevel / l.price, cost: sizePerLevel,
              status: 'pending', entryIdx: null, exitIdx: null,
              pnl: 0, tp: null, sl: null, reactivationCount: 0
            });
          }
        }
        this.lastRealignIdx = idx;
      }
    }
  }

  _closeLevel(level, idx, exitPrice, isStopLoss) {
    const proceeds = level.size * exitPrice;
    // entryFee a ete debite du cash au fill ; fallback pour un niveau construit hors _checkFills
    const entryFee = (level.entryFee === undefined ? level.cost * ST_FEE_MAKER : level.entryFee);
    const exitFee = proceeds * (isStopLoss ? ST_FEE_TAKER : ST_FEE_MAKER);
    const pnl = proceeds - level.cost - entryFee - exitFee;
    this.cash += proceeds - exitFee;   // entryFee deja sorti du cash : ne pas le reprendre ici
    this.asset -= level.size;
    level.status = 'closed';
    level.exitIdx = idx;
    level.pnl = pnl;
    this.trades.push({
      entryPrice: level.price,
      exitPrice: exitPrice,
      entryIdx: level.entryIdx,
      exitIdx: idx,
      pnl: pnl,
      pnlPct: (pnl / level.cost) * 100,
      entryTime: null, // filled in by backtest runner
      exitTime: null
    });
  }

  _closeAllLevels(candle) {
    for (const level of this.gridLevels) {
      if (level.status === 'filled') {
        this._closeLevel(level, -1, candle.close, true); // force close = taker
      } else if (level.status === 'pending') {
        // Un niveau pending n'a JAMAIS debite le cash : le rembourser inventait du capital (1000 -> 2000 sans trade).
        level.status = 'closed';
        level.pnl = 0;
      }
    }
  }

  // ATTENTION : l.cost a DEJA ete debite au fill — le resoustraire compte le cout deux fois (MaxDD > 100%).
  equity(markPrice) {
    const mv = this.gridLevels
      .filter(l => l.status === 'filled')
      .reduce((sum, l) => sum + l.size * markPrice, 0);
    return this.cash + mv;
  }

  // Realized P&L only
  realizedPnl() {
    return this.trades.reduce((sum, t) => sum + t.pnl, 0);
  }
}

// ============ BACKTEST ENGINE ============
let btResult = null;      // Last backtest result
let btBot = null;         // Active bot instance (for forward test)
let btActiveStrategy = 'bb_grid';
let btUserParams = {};
let btCapital = ST_DEFAULT_CAPITAL;

function runBacktest(strategyKey, candles, startIdx, endIdx, userParams, capital) {
  const bot = new GridBot(strategyKey, capital || ST_DEFAULT_CAPITAL);
  const params = bot.buildParams(userParams || {});
  const equityCurve = [];  // {idx, total, realized, unrealized}
  // La DERNIÈRE bougie Binance est EN COURS : son haut/bas n'est pas définitif. La jouer,
  // c'est constater des remplissages qui peuvent ne jamais avoir lieu, ou en rater. Toutes
  // les entrées (visible, complet, dates, comparaison, walk-forward) passent par ici.
  endIdx = Math.min(endIdx, candles.length - 2);
  const n = endIdx - startIdx;
  if (n < 20) return { error: 'Pas assez de bougies closes (min 20)' };

  // Pre-compute ALL indicators once for the full range
  // This is safe because the strategy only accesses candles[0..idx] at each step
  const fullIndicators = bot.computeIndicators(candles, endIdx, params);

  // Vues anti look-ahead : un indice > bougie courante lit `null`. L'ancienne version
  // COPIAIT chaque tableau à chaque bougie (arr.map) : O(n²) — 3 000 bougies × 3 000 × 4
  // indicateurs ≈ 36 M d'écritures par backtest, et le walk-forward en lance des dizaines.
  // Une vue Proxy donne la même garantie en O(1) par bougie.
  let cur = startIdx;
  const sliceInd = {};
  for (const [k, arr] of Object.entries(fullIndicators)) {
    if (!arr) continue;
    sliceInd[k] = new Proxy(arr, {
      get(t, p) {
        if (typeof p === 'string' && p.length && p.charCodeAt(0) <= 57 && +p > cur) return null;
        return t[p];
      }
    });
  }

  // Mark initial equity
  equityCurve.push({ idx: startIdx, total: capital, realized: 0, unrealized: 0 });

  for (let i = startIdx; i <= endIdx; i++) {
    cur = i;
    bot.step(candles, i, params, sliceInd);

    const markPrice = candles[i].close;
    equityCurve.push({
      idx: i,
      total: bot.equity(markPrice),
      realized: bot.realizedPnl(),
      unrealized: bot.equity(markPrice) - capital - bot.realizedPnl()
    });
  }

  // Force close remaining positions at last price
  const lastPrice = candles[endIdx].close;
  bot._closeAllLevels({ close: lastPrice });

  // Compute stats
  const trades = bot.trades;
  const winningTrades = trades.filter(t => t.pnl > 0);
  const losingTrades = trades.filter(t => t.pnl < 0);
  const totalPnl = bot.realizedPnl();
  const totalReturn = (totalPnl / capital) * 100;
  const winRate = trades.length > 0 ? (winningTrades.length / trades.length) * 100 : 0;

  // Average win/loss
  const avgWin = winningTrades.length > 0 ? winningTrades.reduce((s, t) => s + t.pnl, 0) / winningTrades.length : 0;
  const avgLoss = losingTrades.length > 0 ? Math.abs(losingTrades.reduce((s, t) => s + t.pnl, 0) / losingTrades.length) : 0;
  const profitFactor = avgLoss > 0 ? (avgWin * winningTrades.length) / (avgLoss * losingTrades.length) : (totalPnl > 0 ? Infinity : 0);

  // Max drawdown from equity curve
  let peak = capital, maxDD = 0, maxDDPct = 0;
  for (const pt of equityCurve) {
    if (pt.total > peak) peak = pt.total;
    const dd = peak - pt.total;
    const ddPct = (dd / peak) * 100;
    if (ddPct > maxDDPct) { maxDDPct = ddPct; maxDD = dd; }
  }

  // Sharpe ratio (simplified: using per-candle returns, annualized)
  let sharpe = 0;
  if (equityCurve.length > 2) {
    const returns = [];
    for (let i = 1; i < equityCurve.length; i++) {
      returns.push((equityCurve[i].total / equityCurve[i - 1].total) - 1);
    }
    const meanRet = returns.reduce((s, r) => s + r, 0) / returns.length;
    const variance = returns.reduce((s, r) => s + (r - meanRet) ** 2, 0) / returns.length;
    const stdDev = Math.sqrt(variance);
    if (stdDev > 0) {
      // Annualize based on candle interval
      const periodsPerYear = chartInterval === '1m' ? 525600 : chartInterval === '5m' ? 105120 :
        chartInterval === '15m' ? 35040 : chartInterval === '1h' ? 8760 :
        chartInterval === '4h' ? 2190 : chartInterval === '1d' ? 365 : 35040;
      sharpe = (meanRet / stdDev) * Math.sqrt(periodsPerYear);
    }
  }

  const result = {
    strategy: strategyKey,
    params: params,
    capital: capital,
    startIdx, endIdx,
    totalPnl, totalReturn,
    tradeCount: trades.length,
    winRate, avgWin, avgLoss,
    profitFactor: profitFactor === Infinity ? '∞' : profitFactor.toFixed(2),
    maxDrawdown: maxDD,
    maxDrawdownPct: maxDDPct,
    sharpe: sharpe.toFixed(3),
    equityCurve: equityCurve,
    trades: trades,
    bot: bot,
    timestamp: Date.now()
  };

  btResult = result;
  btBot = bot;
  return result;
}

// Quick backtest on currently visible candles
function runVisibleBacktest() {
  if (!candles || candles.length < 20) return;
  const vs = Math.max(0, viewStart);
  const ve = Math.min(candles.length - 1, viewEnd);
  const result = runBacktest(btActiveStrategy, candles, vs, ve, btUserParams, btCapital);
  if (!result.error) {
    console.log('Backtest:', result.strategy,
      '| Trades:', result.tradeCount,
      '| P&L:', result.totalPnl.toFixed(2), 'USDT',
      '| Return:', result.totalReturn.toFixed(2) + '%',
      '| Win:', result.winRate.toFixed(1) + '%',
      '| Sharpe:', result.sharpe,
      '| MaxDD:', result.maxDrawdownPct.toFixed(1) + '%',
      '| PF:', result.profitFactor);
    drawChart(); // trigger redraw with markers
  }
  return result;
}

// Run backtest on full candle history
function runFullBacktest() {
  if (!candles || candles.length < 20) return;
  const result = runBacktest(btActiveStrategy, candles, 0, candles.length - 1, btUserParams, btCapital);
  console.log('Full Backtest:', result.strategy,
    '| Range:', candles.length, 'candles',
    '| Trades:', result.tradeCount,
    '| Return:', result.totalReturn.toFixed(2) + '%',
    '| Sharpe:', result.sharpe,
    '| MaxDD:', result.maxDrawdownPct.toFixed(1) + '%');
  return result;
}

// ============ DRAWING ============
// Valeurs de repli seulement : la palette réelle vient des jetons du thème (lireJetons).
const COLORS = {
  ema20: '#eda100', ema50: '#2a78d6', ema100: '#eb6834', ema200: '#4a3aa7', sma20: '#e87ba4', sma50: '#008300',
  bb_upper: '#607d8b', bb_mid: '#607d8b', bb_lower: '#607d8b',
  vwap: '#ff9800', ichi_tenkan: '#2196f3', ichi_kijun: '#e91e63', sar: '#00a5bd',
  rsi: '#8e5bd8', macd: '#d79a00', macd_signal: '#ff6b35',
  stoch_k: '#d79a00', stoch_d: '#ff6b35', atr: '#00a693',
  obv: '#ff9800', mfi: '#9c27b0', williamsR: '#00a5bd', cci: '#ff5722', adx: '#d79a00',
  equity_total: '#e0a800',
  candleUp: '#0d9672', candleDown: '#e5484d',
  grid: 'rgba(127,127,127,0.12)', text: '#45597a'
};
// Identité des overlays : chaque ligne porte son étiquette en bout de tracé (et un point dans
// le ruban) — elle ne repose jamais sur la couleur seule. tests/test_palette.py échoue si un
// overlay sous 3:1 sur le fond du graphique n'a pas d'étiquette ici.
const ETIQ_OVERLAYS = { ema20: 'EMA20', ema50: 'EMA50', ema100: 'EMA100', ema200: 'EMA200', sma20: 'SMA20', sma50: 'SMA50' };
// Une seule famille de caractères pour tout le graphique : celle de l'interface (jeton --font).
let POLICE_UI = "'Segoe UI Variable Text','Segoe UI Variable',-apple-system,BlinkMacSystemFont,'SF Pro Text',system-ui,'Segoe UI',Roboto,sans-serif";
function chartFont(px, poids) { return (poids || 500) + ' ' + px + 'px ' + POLICE_UI; }
// Même teinte, autre opacité : « #rrggbb » ou « rgb(a)(…) » → rgba. Sinon, inchangée.
function avecAlpha(c, a) {
  const h = /^#([0-9a-f]{6})$/i.exec(c || '');
  if (h) { const n = parseInt(h[1], 16); return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')'; }
  const m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i.exec(c || '');
  return m ? 'rgba(' + m[1] + ',' + m[2] + ',' + m[3] + ',' + a + ')' : c;
}
// Jetons du thème → COLORS. Lu au chargement et à chaque changement de thème — JAMAIS par image :
// un getComputedStyle par image de glissement forçait un recalcul de style 60 fois par seconde.
function lireJetons() {
  const cs = getComputedStyle(document.documentElement);
  const v = (n, d) => ((cs.getPropertyValue(n) || '') + '').trim() || d;
  const num = (n, d) => { const x = parseFloat(v(n, '')); return isFinite(x) ? x : d; };
  for (const k of ['ema20', 'ema50', 'ema100', 'ema200', 'sma20', 'sma50']) COLORS[k] = v('--ov-' + k, COLORS[k]);
  COLORS.bb_upper = COLORS.bb_mid = COLORS.bb_lower = v('--ov-bb', COLORS.bb_mid);
  COLORS.vwap = v('--ov-vwap', COLORS.vwap); COLORS.sar = v('--ov-sar', COLORS.sar);
  COLORS.ichi_tenkan = v('--ov-ichi-t', COLORS.ichi_tenkan); COLORS.ichi_kijun = v('--ov-ichi-k', COLORS.ichi_kijun);
  const S = { rsi: 'rsi', macd: 'macd', macd_signal: 'signal', stoch_k: 'stoch-k', stoch_d: 'stoch-d', atr: 'atr',
              obv: 'obv', mfi: 'mfi', williamsR: 'wr', cci: 'cci', adx: 'adx', equity_total: 'equity' };
  for (const [k, j] of Object.entries(S)) COLORS[k] = v('--s-' + j, COLORS[k]);
  const up = v('--up', COLORS.candleUp), down = v('--down', COLORS.candleDown);
  COLORS.candleUp = up; COLORS.candleDown = down;
  COLORS.adx_plusDI = COLORS.trade_buy = COLORS.grid_buy_filled = COLORS.equity_realized = up;
  COLORS.adx_minusDI = COLORS.trade_sell = down;
  COLORS.grid_buy_pending = avecAlpha(up, 0.5); COLORS.grid_sl = avecAlpha(down, 0.5);
  COLORS.ink1 = v('--ink-1', '#10233d'); COLORS.text = v('--ink-2', '#45597a'); COLORS.ink3 = v('--ink-3', '#5f6e8c');
  COLORS.axis = COLORS.text;
  COLORS.upInk = v('--up-ink', up); COLORS.downInk = v('--down-ink', down);
  COLORS.accent2 = v('--accent-2', '#4f5fe0');
  COLORS.surface = v('--chart-surface', '#f4f6fe');
  COLORS.grid = v('--grille', COLORS.grid);
  COLORS.hairline = v('--hairline', 'rgba(127,127,127,0.18)');
  COLORS.reticule = v('--reticule', 'rgba(127,127,127,0.4)');
  COLORS.bulle = v('--bulle', 'rgba(255,255,255,0.94)');
  COLORS.warn = v('--warn', '#f0a50b');
  COLORS.sess = [v('--sess-asie', 'rgba(255,152,0,0.75)'), v('--sess-europe', 'rgba(33,150,243,0.75)'), v('--sess-us', 'rgba(156,39,176,0.75)')];
  COLORS.sr = [v('--sr-1', '#ce93d8'), v('--sr-2', '#26c6da'), v('--sr-3', '#ffc107')];
  COLORS.fib = v('--fib', '#f0a50b'); COLORS.vp = v('--vp', '#64b4ff'); COLORS.vpPoc = v('--vp-poc', '#ffc828');
  COLORS.grid_tp = avecAlpha(COLORS.sr[2], 0.6);
  COLORS.filigrane = num('--filigrane', 0.05);
  COLORS.volAlpha = num('--vol-alpha', 0.55);
  COLORS.bandeAlpha = num('--bande-alpha', 0.08);
  COLORS.aura = num('--aura', 0);
  POLICE_UI = v('--font', POLICE_UI);
}
// Légende dans le ruban : chaque pastille d'overlay porte le point de la couleur de sa ligne.
const PASTILLES = { ema20: 'ema20', ema50: 'ema50', ema100: 'ema100', ema200: 'ema200', sma20: 'sma20', sma50: 'sma50',
                    bb: 'bb_mid', rsi: 'rsi', macd: 'macd', stoch: 'stoch_k', atr: 'atr' };
function peindrePastilles() {
  for (const [id, k] of Object.entries(PASTILLES)) {
    const el = document.getElementById('lbl_' + id);
    if (el && el.style && el.style.setProperty && COLORS[k]) el.style.setProperty('--dot', COLORS[k]);
  }
}
let jetonsLus = false;

function drawChart() {
  scaleSeq++;   // une frame = un calcul d'échelle : invalide le cache de priceWindow()
  const W = canvas.width / window.devicePixelRatio;
  const H = canvas.height / window.devicePixelRatio;
  // Palette : jetons du thème, lus UNE fois (lireJetons) — pas un getComputedStyle par image.
  if (!jetonsLus) { lireJetons(); jetonsLus = true; }
  
  ctx.clearRect(0, 0, W, H);
  if (candles.length < 2) return;
  
  let subTotal = 0;
  for (const [k, active] of Object.entries(activeSubs)) {
    if (active) subTotal += subHeights[k] || 80;
  }
  // Main chart gets remaining height, minus range selector
  const mainH = Math.max(200, H - subTotal - 4 - RS_HEIGHT);
  
  // Filigrane : paire + intervalle, graisse fine, espacé — une signature, pas un tampon.
  ctx.save();
  ctx.globalAlpha = COLORS.filigrane;
  ctx.fillStyle = COLORS.ink1;
  // Taille bridée au tracé disponible : à 64 px fixes le filigrane débordait du graphe
  // sur téléphone et se faisait rogner par le bord gauche.
  const filigrane = activeSymbol + '  ·  ' + chartInterval;
  ctx.font = chartFont(Math.min(40, Math.round((W - 16 - 75) / (filigrane.length * 0.9))), 300);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '4px';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(filigrane, (W - 50) / 2, mainH / 2);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  ctx.restore();

  etiquettesPosees = []; etiquettesAFaire = [];
  resolveChart(candles, 16, 75, mainH, W);
  ctx.save(); etiquettesAFaire.forEach(f => f()); ctx.restore();
  etiquettesAFaire = [];

  // Compteur bougies visibles + plage dates + % variation
  ctx.fillStyle = COLORS.text; ctx.font = chartFont(10);
  const vsC = Math.max(0, viewStart), veC = Math.min(candles.length, viewEnd);
  const firstC = candles[vsC], lastC = candles[Math.max(0, veC - 1)];
  const pctChange = firstC && lastC ? ((lastC.close - firstC.close) / firstC.close * 100) : 0;
  const pctStr = pctChange >= 0 ? '+' + pctChange.toFixed(2) + '%' : pctChange.toFixed(2) + '%';
  const pctColor = pctChange >= 0 ? COLORS.upInk : COLORS.downInk;
  const fmtDate = ts => {
    const d = new Date(ts * 1000);
    return FMT_D2.format(d) + ' ' + FMT_HM.format(d);
  };
  const rangeStr = firstC ? fmtDate(firstC.time) + ' → ' + fmtDate(lastC.time) : '';
  ctx.fillStyle = COLORS.ink3;
  ctx.fillText(`${veC - vsC}/${candles.length} · ${rangeStr}`, 18, 13);
  // Variation de la vue : une pastille teintée, texte à l'encre signée (lisible), pas la marque.
  ctx.font = chartFont(10, 650);
  const pw0 = ctx.measureText(pctStr).width + 12;
  ctx.save(); ctx.globalAlpha = 0.14; ctx.fillStyle = pctChange >= 0 ? COLORS.candleUp : COLORS.candleDown;
  ctx.beginPath(); ctx.roundRect(16, 19, pw0, 15, 7.5); ctx.fill(); ctx.restore();
  ctx.fillStyle = pctColor;
  ctx.fillText(pctStr, 22, 30);
  
  // Empiler les sous-graphes
  let yOff = mainH + 4;
  const subOrder = ['vol', 'rsi', 'macd', 'stoch', 'atr', 'obv', 'mfi', 'williamsR', 'cci', 'adx', 'ao', 'equity'];
  for (const key of subOrder) {
    if (activeSubs[key]) {
      resolveSub(candles, yOff, subHeights[key] || 80, W, key);
      yOff += subHeights[key] || 80;
    }
  }

  // --- Crosshair ---
  if (crossX !== null && crossY !== null && crossY < mainH) {
    // Vertical line
    ctx.strokeStyle = COLORS.reticule;
    ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(crossX, 0); ctx.lineTo(crossX, mainH); ctx.stroke();
    
    // Horizontal line (stops before price column)
    ctx.beginPath(); ctx.moveTo(16, crossY); ctx.lineTo(W - 75, crossY); ctx.stroke();
    ctx.setLineDash([]);
    
    // Price at crosshair Y — échelle RELUE de priceWindow() (même frame que resolveChart),
    // au lieu de recopier la formule : slice + 2 spreads de 2×N éléments + un calcBollinger
    // par frame de survol, pour un résultat identique.
    const pad = { left: 16, right: 75, top: 10, bottom: 20 };
    const ph = mainH - pad.top - pad.bottom;
    const vs2 = Math.max(0, viewStart);
    const ve2 = Math.min(candles.length, viewEnd);
    const vis = candles.slice(vs2, ve2);
    const sc = priceWindow(vs2, ve2);
    const priceAtCursor = sc.maxP - ((crossY - pad.top) / ph) * sc.range;
    
    // Badge prix crosshair — dans colonne droite, collé au prix
    const priceStr = '$' + fmtPrix(priceAtCursor);
    ctx.font = chartFont(11, 650);
    const bw = ctx.measureText(priceStr).width + 14;
    const bX = W - 75 + (75 - bw)/2;
    const bY = Math.max(2, Math.min(mainH - 20, crossY - 9));
    ctx.fillStyle = COLORS.ink1;
    ctx.beginPath(); ctx.roundRect(bX, bY, bw, 18, 9); ctx.fill();
    ctx.fillStyle = COLORS.surface;
    ctx.fillText(priceStr, bX + 7, bY + 13);

    // OHLCV tooltip — 2 colonnes, semi-transparent
    const chartPw = W - 16 - 75;
    const candleIdx = Math.round((crossX - 16) / (chartPw / vis.length));
    if (candleIdx >= 0 && candleIdx < vis.length) {
      const candle = vis[candleIdx];
      const isUp = candle.close >= candle.open;
      const cColor = isUp ? COLORS.candleUp : COLORS.candleDown;
      const onRight = crossX > W / 2;
      const tX = onRight ? Math.max(16, crossX - 145) : Math.min(W - 160, crossX + 12);
      const tY = Math.max(30, Math.min(mainH - 85, crossY - 65));
      
      ctx.save();
      ctx.fillStyle = COLORS.bulle;
      ctx.shadowColor = 'rgba(16,35,61,0.18)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 4;
      ctx.beginPath(); ctx.roundRect(tX, tY, 135, 72, 10); ctx.fill();
      ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
      // Filet de la couleur de la bougie à gauche : la direction se lit sans encadrer la donnée.
      ctx.fillStyle = cColor; ctx.beginPath(); ctx.roundRect(tX + 6, tY + 10, 3, 52, 1.5); ctx.fill();
      
      ctx.fillStyle = COLORS.ink1; ctx.font = chartFont(10, 600);
      ctx.fillText('O ' + fmtPrix(candle.open), tX + 16, tY + 20);
      ctx.fillText('H ' + fmtPrix(candle.high), tX + 76, tY + 20);
      ctx.fillText('L ' + fmtPrix(candle.low), tX + 16, tY + 38);
      ctx.fillText('C ' + fmtPrix(candle.close), tX + 76, tY + 38);
      
      const volStr = candle.volume >= 1000 ? (candle.volume / 1000).toFixed(1) + 'K' : candle.volume.toFixed(0);
      ctx.fillStyle = COLORS.ink3;
      ctx.fillText('Volume ' + volStr, tX + 16, tY + 57);
      ctx.restore();
    }
  }

  // --- Crosshair sous-graphes ---
  if (crossX !== null && crossY !== null && crossY > mainH) {
    const vs3 = Math.max(0, viewStart);
    const ve3 = Math.min(candles.length, viewEnd);
    const vis3 = candles.slice(vs3, ve3);
    const cIdx = Math.round((crossX - 16) / ((W - 16 - 75) / vis3.length));
    if (cIdx >= 0 && cIdx < vis3.length) {
      const realIdx = vs3 + cIdx;
      // Ligne verticale à travers tous les sous-graphes
      ctx.strokeStyle = COLORS.reticule;
      ctx.lineWidth = 0.5;
      ctx.beginPath(); ctx.moveTo(crossX, mainH + 2); ctx.lineTo(crossX, H); ctx.stroke();

      let sY = mainH + 4;
      for (const key of subOrder) {
        if (!activeSubs[key]) continue;
        const sh = subHeights[key] || 80;
        // Badge valeur dans colonne droite
        const val = getSubIndicatorValue(key, realIdx);
        if (val !== null) {
          const txt = subLabel(key) + ' ' + val;
          const tw = ctx.measureText(txt).width + 12;
          const tx = W - 75 + (75 - tw)/2;
          const ty = sY + 4;
          ctx.fillStyle = COLORS.bulle;
          ctx.strokeStyle = subColor(key); ctx.lineWidth = 0.8;
          ctx.beginPath(); ctx.roundRect(tx, ty, tw, 15, 3); ctx.fill(); ctx.stroke();
          ctx.fillStyle = COLORS.text; ctx.font = chartFont(9);
          ctx.fillText(txt, tx + 6, ty + 11);
        }
        sY += sh;
      }
    }
  }
  
  // Range Selector — mini timeline en bas
  if (candles.length > 5) {
    drawRangeSelector(candles, W, H);
  }
}

// ============ RANGE SELECTOR ============
function drawRangeSelector(candles, W, H) {
  const rsY = H - RS_HEIGHT;
  const padL = 16, padR = 75;
  const rsw = W - padL - padR;
  const rsh = RS_HEIGHT - 8;
  if (rsw < 20 || candles.length < 2) return;
  
  // Fond
  ctx.fillStyle = avecAlpha(COLORS.surface, 0.7);
  ctx.strokeStyle = COLORS.hairline;
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.roundRect(padL, rsY + 2, rsw, RS_HEIGHT - 6, 5); ctx.fill(); ctx.stroke();
  
  // Mini courbe des closes
  const closes = candles.map(c => c.close);
  const allMin = Math.min(...closes), allMax = Math.max(...closes);
  const rng = allMax - allMin || 1;
  const toY = (v) => rsY + rsh + 2 - ((v - allMin) / rng) * (rsh - 4);
  const toX = (i) => padL + (i / Math.max(1, candles.length - 1)) * rsw;
  
  // Fill area
  ctx.save();
  ctx.globalAlpha = 0.16;
  ctx.fillStyle = COLORS.accent2;
  ctx.beginPath();
  ctx.moveTo(padL, rsY + rsh + 2);
  for (let i = 0; i < candles.length; i++) {
    ctx.lineTo(toX(i), toY(closes[i]));
  }
  ctx.lineTo(W - padR, rsY + rsh + 2);
  ctx.closePath(); ctx.fill();
  ctx.restore();
  
  // Line
  ctx.strokeStyle = COLORS.accent2; ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (let i = 0; i < candles.length; i++) {
    const x = toX(i), y = toY(closes[i]);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  }
  ctx.stroke();
  
  // Viewport rectangle
  const vs = Math.max(0, viewStart), ve = Math.min(candles.length, viewEnd);
  const vx1 = toX(vs), vx2 = toX(Math.min(ve - 1, candles.length - 1));
  const vrX = Math.max(padL, vx1), vrW = Math.max(12, Math.min(rsw - (vrX - padL), vx2 - vrX));
  
  // Ombre du viewport
  ctx.fillStyle = avecAlpha(COLORS.ink1, 0.1);
  ctx.fillRect(vrX, rsY + 2, vrW, RS_HEIGHT - 6);
  
  // Bordure viewport
  ctx.strokeStyle = avecAlpha(COLORS.ink1, 0.45);
  ctx.lineWidth = 1.5;
  ctx.strokeRect(vrX, rsY + 2, vrW, RS_HEIGHT - 6);
  
  // Poignées gauche/droite
  const handleW = 4;
  ctx.fillStyle = COLORS.ink1;
  ctx.fillRect(vrX - 1, rsY + 4, handleW, RS_HEIGHT - 14);
  ctx.fillRect(vrX + vrW - 3, rsY + 4, handleW, RS_HEIGHT - 14);
  
  // Compteur bougies sur le RS
  ctx.fillStyle = COLORS.text; ctx.font = chartFont(8);
  ctx.fillText(candles.length + ' bougies', padL + 4, rsY + 12);
  
  // Label viewport
  const vpLabel = (ve - vs) + '/' + candles.length;
  ctx.fillText(vpLabel, vrX + Math.max(0, vrW / 2 - 15), rsY + 12);
  
  // Légende sessions — fond opaque, droite du RS
  const sesColors = [
    { label: 'Asie', color: COLORS.sess[0], hours: '00-09' },
    { label: 'Europe', color: COLORS.sess[1], hours: '07-16' },
    { label: 'US', color: COLORS.sess[2], hours: '13-21' }
  ];
  const legW = 130, legH = 14;
  const legX = W - padR - legW - 2, legY = rsY + 4;
  ctx.fillStyle = COLORS.bulle;
  ctx.strokeStyle = COLORS.hairline;
  ctx.lineWidth = 0.5;
  ctx.beginPath(); ctx.roundRect(legX, legY, legW, legH, 3); ctx.fill(); ctx.stroke();
  ctx.font = chartFont(7, 650);
  sesColors.forEach((s, i) => {
    const sx = legX + 4 + i * 42;
    ctx.fillStyle = s.color;
    ctx.fillRect(sx, legY + 2, 9, 10);
    ctx.fillStyle = COLORS.ink1;
    ctx.fillText(s.label, sx + 11, legY + 11);
  });
}

// Formateurs Intl créés UNE fois : `toLocaleXString(locale, options)` reconstruit un
// formatter à chaque appel — 7 à 10 % des échantillons du profileur selon l'état
// (libellés d'axe + plage datée, plusieurs fois par frame).
const FMT_D2 = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit' });
const FMT_HM = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

// Échelle de prix d'une fenêtre [vs,ve) — SOURCE UNIQUE. resolveChart l'applique, le
// crosshair la relit dans la MÊME frame (avant : formule recopiée ⇒ un slice, deux spreads
// de 2×N éléments et un calcBollinger de plus par frame de survol). Le cache porte le
// numéro de frame : priceScale / pricePan / Bollinger ne peuvent pas le périmer.
let scaleSeq = 0, lastScale = null;
function priceWindow(vs, ve) {
  const s = lastScale;
  if (s && s.seq === scaleSeq && s.vs === vs && s.ve === ve) return s;
  let minP = Infinity, maxP = -Infinity;
  for (let i = vs; i < ve; i++) { const c = candles[i]; if (c.high > maxP) maxP = c.high; if (c.low < minP) minP = c.low; }
  const naturalRange = maxP - minP || 1, rawMin = minP, rawMax = maxP;
  // Étendre si Bollinger actif, mais cap à ±15% du range naturel
  if (overlays.bb && candles.length >= 20) {
    const bb = memoized('bb', calcBollinger, candles.map(c => c.close), 20, 2);
    for (let i = vs; i < ve; i++) {
      if (bb.upper[i] === null) continue;
      if (bb.upper[i] > maxP) maxP = bb.upper[i];
      if (bb.lower[i] < minP) minP = bb.lower[i];
    }
    const maxExt = naturalRange * 0.15;
    maxP = Math.min(maxP, rawMax + maxExt);
    minP = Math.max(minP, rawMin - maxExt);
  }
  // Échelle verticale manuelle (molette / glisser sur l'axe)
  const midP = (maxP + minP) / 2, halfRange = ((maxP - minP) / 2) * priceScale;
  minP = midP - halfRange + pricePan * naturalRange;
  maxP = midP + halfRange + pricePan * naturalRange;
  return (lastScale = { seq: scaleSeq, vs, ve, minP, maxP, range: maxP - minP || 1 });
}

function resolveChart(candles, padL, padR, chartH, W) {
  const pad = { left: padL, right: padR, top: 10, bottom: 20 };
  const pw = W - pad.left - pad.right;
  const ph = chartH - pad.top - pad.bottom;
  if (ph < 30) return;

  // Viewport
  const vs = Math.max(0, viewStart);
  const ve = Math.min(candles.length, viewEnd);
  const visible = candles.slice(vs, ve);
  if (visible.length < 2) return;
  
  // Échelle de prix : calculée (et mémorisée pour le crosshair) par priceWindow().
  const { minP, maxP, range } = priceWindow(vs, ve);
  // closes n'est construit QUE si un overlay le demande (3000 éléments par frame sinon) :
  // les seuls lecteurs sont bb, ema/sma, vwap, ichimoku et sar, tous sous ces drapeaux.
  const closes = (overlays.bb || overlays.ema20 || overlays.ema50 || overlays.ema100 || overlays.ema200 ||
                  overlays.sma20 || overlays.sma50 || overlays.vwap || overlays.ichimoku || overlays.sar)
    ? candles.map(c => c.close) : [];
  
  const gap = pw / visible.length;
  const candleW = Math.max(1, Math.min(40, gap * 0.8));
  
  // Sessions (UTC) : voile imperceptible + BANDEAU FIN de 6 px (règle temporelle).
  const sessionDefs = [
    { start: 0, end: 9, veil: avecAlpha(COLORS.sess[0], 0.013), bar: COLORS.sess[0], label: 'Asie' },
    { start: 7, end: 16, veil: avecAlpha(COLORS.sess[1], 0.013), bar: COLORS.sess[1], label: 'Europe' },
    { start: 13, end: 21, veil: avecAlpha(COLORS.sess[2], 0.013), bar: COLORS.sess[2], label: 'US' }
  ];
  const SESS_H = 6;  // hauteur du bandeau, en px
  for (const s of sessionDefs) {
    // Trouver le début/fin de chaque bloc de session dans les bougies visibles
    let blockStart = -1;
    for (let i = vs; i < ve; i++) {
      // Heure UTC sans allouer un Date par bougie et par session (3×N objets par frame)
      const h = Math.floor(candles[Math.min(i, candles.length - 1)].time / 3600) % 24;
      const inSession = h >= s.start && h < s.end;
      if (inSession && blockStart === -1) blockStart = i;
      if (!inSession && blockStart !== -1) {
        const x1 = pad.left + gap * (blockStart - vs);
        const x2 = pad.left + gap * (i - vs) + gap / 2;
        ctx.fillStyle = s.veil;
        ctx.fillRect(x1, pad.top, x2 - x1, ph);
        ctx.fillStyle = s.bar;
        ctx.fillRect(x1, pad.top + ph - SESS_H, x2 - x1 - 1, SESS_H);
        blockStart = -1;
      }
    }
    if (blockStart !== -1) {
      const x1 = pad.left + gap * (blockStart - vs);
      ctx.fillStyle = s.veil;
      ctx.fillRect(x1, pad.top, W - pad.right - x1, ph);
      ctx.fillStyle = s.bar;
      ctx.fillRect(x1, pad.top + ph - SESS_H, W - pad.right - x1, SESS_H);
    }
  }
  
  // Grid
  ctx.strokeStyle = COLORS.grid; ctx.lineWidth = 0.5;
  const gridN = 6;
  // Ordonnée de l'étiquette de dernier prix : le libellé d'axe qu'elle recouvrirait est omis.
  const yTag = (livePrice && livePrice >= minP && livePrice <= maxP) ? pad.top + ph * (1 - (livePrice - minP) / range) : null;
  for (let i = 0; i <= gridN; i++) {
    const y = pad.top + (ph / gridN) * i;
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
    if (yTag !== null && Math.abs(y - yTag) < 15) continue;
    const price = maxP - (range / gridN) * i;
    ctx.fillStyle = COLORS.axis || COLORS.text;
    ctx.font = chartFont(11);
    const label = '$' + fmtPrix(price);
    ctx.fillText(label, W - pad.right + 3, y + 3);
  }
  
  // Marqueur prix live sur axe Y — triangle + badge couleur
  if (livePrice && livePrice >= minP && livePrice <= maxP) {
    const yLP = pad.top + ph * (1 - (livePrice - minP) / range);
    // Triangle pointant vers la gauche
    const triX = W - pad.right + 2, triY = yLP;
    // Couleur de la bougie EN COURS : l'étiquette dit aussi le sens du moment.
    const enCours = candles[candles.length - 1];
    const tagC = (enCours && livePrice < enCours.open) ? COLORS.candleDown : COLORS.candleUp;
    // Badge prix — désormais l'unique pastille de prix (l'axe Y).
    // pad.right = 75 px pour un libellé 3 décimales de 76 px : le badge sortait
    // du canvas de ~13 px (« $77085.0(| ») à toutes les largeurs. On le recale
    // vers la gauche au lieu d'élargir pad.right (13 sites couplés au
    // Range Selector et au hit-test souris).
    const lpStr = '$' + fmtPrix(livePrice);
    ctx.font = chartFont(10, 650);
    const lw = ctx.measureText(lpStr).width + 10;
    const bx = Math.min(triX + 10, W - 3 - lw);
    // Opaque : le badge recule sur le libellé de grille de même ordonnée quand
    // la colonne est étroite, et le laissait transparaître en transparence.
    ctx.fillStyle = tagC;
    ctx.beginPath(); ctx.roundRect(bx, triY - 10, lw, 20, 10); ctx.fill();
    // Pointe vers le tracé : elle reste visible si le badge a reculé
    ctx.beginPath(); ctx.moveTo(triX, triY - 4); ctx.lineTo(triX + 8, triY); ctx.lineTo(triX, triY + 4);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.fillText(lpStr, bx + 5, triY + 4);
  }
  
  // Bollinger
  if (overlays.bb && candles.length >= 20) {
    const bb = memoized('bb', calcBollinger, closes, 20, 2);
    drawLine(bb.upper, minP, range, pad, gap, ph, COLORS.bb_upper, [3, 3], 1, vs);
    drawLine(bb.sma, minP, range, pad, gap, ph, COLORS.bb_mid, [], 1, vs);
    drawLine(bb.lower, minP, range, pad, gap, ph, COLORS.bb_lower, [3, 3], 1, vs);
    // Fill between
    ctx.save(); ctx.globalAlpha = 0.08;
    ctx.fillStyle = COLORS.bb_mid; ctx.beginPath();
    let started = false;
    for (let i = vs; i < ve; i++) {
      if (i >= bb.upper.length || bb.upper[i] === null) continue;
      const x = pad.left + gap * (i - vs) + gap / 2;
      const y = pad.top + ph * (1 - (bb.upper[i] - minP) / range);
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    }
    for (let i = ve - 1; i >= vs; i--) {
      if (i >= bb.lower.length || bb.lower[i] === null) continue;
      const x = pad.left + gap * (i - vs) + gap / 2;
      const y = pad.top + ph * (1 - (bb.lower[i] - minP) / range);
      ctx.lineTo(x, y);
    }
    ctx.closePath(); ctx.fill(); ctx.restore();
  }
  
  // EMAs & SMAs
  if (overlays.ema20) drawLine(memoized('ema20', calcEMA, closes, 20), minP, range, pad, gap, ph, COLORS.ema20, [], 1.5, vs, ETIQ_OVERLAYS.ema20);
  if (overlays.ema50) drawLine(memoized('ema50', calcEMA, closes, 50), minP, range, pad, gap, ph, COLORS.ema50, [], 1.5, vs, ETIQ_OVERLAYS.ema50);
  if (overlays.ema100) drawLine(memoized('ema100', calcEMA, closes, 100), minP, range, pad, gap, ph, COLORS.ema100, [4, 4], 1, vs, ETIQ_OVERLAYS.ema100);
  if (overlays.ema200) drawLine(memoized('ema200', calcEMA, closes, 200), minP, range, pad, gap, ph, COLORS.ema200, [2, 6], 1, vs, ETIQ_OVERLAYS.ema200);
  if (overlays.sma20) drawLine(memoized('sma20', calcSMA, closes, 20), minP, range, pad, gap, ph, COLORS.sma20, [6, 3], 1, vs, ETIQ_OVERLAYS.sma20);
  if (overlays.sma50) drawLine(memoized('sma50', calcSMA, closes, 50), minP, range, pad, gap, ph, COLORS.sma50, [8, 4], 1, vs, ETIQ_OVERLAYS.sma50);

  // VWAP
  if (overlays.vwap) {
    const vwap = memoized('vwap', calcVWAP, candles.map(c=>c.high), candles.map(c=>c.low), closes, candles.map(c=>c.volume), candles.map(c=>c.time), chartInterval);
    drawLine(vwap, minP, range, pad, gap, ph, COLORS.vwap, [], 1.5, vs);
  }

  // Ichimoku
  if (overlays.ichimoku && candles.length >= 52) {
    const highs = candles.map(c=>c.high), lows = candles.map(c=>c.low);
    const ichi = memoized('ichimoku', calcIchimoku, highs, lows, closes);
    drawLine(ichi.tenkan, minP, range, pad, gap, ph, COLORS.ichi_tenkan, [], 1, vs);
    drawLine(ichi.kijun, minP, range, pad, gap, ph, COLORS.ichi_kijun, [], 1, vs);
    // Kumo : un remplissage PAR SEGMENT de signe constant (A >= B vert haussier, sinon rouge baissier).
    const kx = i => pad.left + gap * (i - vs) + gap/2;
    const ky = v => Math.max(pad.top, Math.min(pad.top + ph, pad.top + ph * (1 - (v - minP) / range)));
    const flushKumo = (s, e, up) => {
      if (s === null || e <= s) return;
      ctx.beginPath();
      for (let i = s; i <= e; i++) ctx.lineTo(kx(i), ky(ichi.senkouA[i]));
      for (let i = e; i >= s; i--) ctx.lineTo(kx(i), ky(ichi.senkouB[i]));
      ctx.closePath();
      ctx.fillStyle = up ? COLORS.candleUp : COLORS.candleDown;
      ctx.fill();
    };
    ctx.save(); ctx.globalAlpha = 0.18;
    let kStart = null, kUp = false;
    for (let i = vs; i <= ve; i++) {
      const sa = ichi.senkouA[i], sb = ichi.senkouB[i];
      if (sa === null || sa === undefined || sb === null || sb === undefined) {
        flushKumo(kStart, i - 1, kUp); kStart = null; continue;
      }
      const up = sa >= sb;
      if (kStart !== null && up !== kUp) { flushKumo(kStart, i - 1, kUp); kStart = null; }
      if (kStart === null) { kStart = Math.max(vs, i - 1); kUp = up; }
    }
    flushKumo(kStart, ve, kUp);
    ctx.restore();
  }

  // Parabolic SAR
  if (overlays.sar) {
    const highs2 = candles.map(c=>c.high), lows2 = candles.map(c=>c.low);
    const sarData = calcSAR(highs2, lows2, closes);
    for (let i = vs; i < ve; i++) {
      if (sarData[i] === null) continue;
      const x = pad.left + gap * (i - vs) + gap/2;
      const y = pad.top + ph * (1 - (sarData[i] - minP) / range);
      if (y < pad.top || y > pad.top + ph) continue;
      ctx.fillStyle = COLORS.sar; ctx.font = chartFont(7);
      ctx.fillText('●', x - 3, y + 3);
    }
  }
  
  // ═══ CHARTISTE ═══
  
  // --- Supports / Résistances (Multi-TF) ---
  if (overlays.sr) {
    const levels = getMultiTFLevels();
    // Tier → style visuel
    const styles = [
      { name: 'Mineur', color: COLORS.sr[0], bg: avecAlpha(COLORS.sr[0], 0.10), dash: [4, 5], width: 1 },
      { name: 'Interm.', color: COLORS.sr[1], bg: avecAlpha(COLORS.sr[1], 0.12), dash: [10, 5], width: 1.8 },
      { name: 'Majeur',  color: COLORS.sr[2], bg: avecAlpha(COLORS.sr[2], 0.16), dash: [],       width: 2.5 }
    ];
    
    for (const lvl of levels.slice(0, 6)) {
      if (lvl.price < minP - range*0.05 || lvl.price > maxP + range*0.05) continue;
      const s = styles[Math.min(lvl.tier, 2)];
      const y = pad.top + ph * (1 - (lvl.price - minP) / range);
      
      // Zone colorée pour niveaux majeurs
      if (lvl.tier >= 2) {
        const zoneH = Math.max(3, ph * 0.0016);
        ctx.fillStyle = s.bg;
        ctx.fillRect(pad.left, y - zoneH, W - pad.left - pad.right, zoneH * 2);
      }
      
      // Ligne
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width;
      if (s.dash.length) ctx.setLineDash(s.dash);
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
      ctx.setLineDash([]);
      
      // Badge droite — fond opaque coloré
      const priceStr = '$' + lvl.price.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
      const badgeText = priceStr + ' ·' + lvl.tf;
      ctx.font = chartFont(9, lvl.tier >= 2 ? 700 : 500);
      const tw = ctx.measureText(badgeText).width + 14;
      const bx = W - pad.right - tw - 4, by = y - 10;
      
      // Fond badge
      // Fond opaque (la bulle du thème) puis la teinte du niveau : lisible sur les bougies.
      ctx.fillStyle = COLORS.bulle;
      ctx.beginPath(); ctx.roundRect(bx, by, tw, 20, 5); ctx.fill();
      ctx.fillStyle = avecAlpha(s.color, lvl.tier >= 2 ? 0.24 : 0.18);
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.roundRect(bx, by, tw, 20, 5); ctx.fill(); ctx.stroke();
      
      // Texte badge
      ctx.fillStyle = COLORS.ink1;
      ctx.fillText(badgeText, bx + 7, by + 14);
      
      // Prix à gauche aussi pour les majeurs
      if (lvl.tier >= 2) {
        ctx.fillStyle = s.color;
        ctx.font = chartFont(9, 650);
        const leftStr = '$' + lvl.price.toFixed(2);
        ctx.fillText(leftStr, pad.left + 3, y - 5);
      }
    }
    
    // Mini-légende en haut à gauche (sous le compteur)
    const legY = 38;
    ctx.font = chartFont(8);
    styles.forEach((s, i) => {
      const lx = 18 + i * 75;
      ctx.fillStyle = s.color;
      ctx.fillRect(lx, legY, 18, 3);
      ctx.fillStyle = COLORS.text;
      ctx.fillText(s.name, lx + 22, legY + 4);
    });
  }
  
  // --- Fibonacci Retracement ---
  if (overlays.fib && visible.length >= 10) {
    const fibHigh = Math.max(...visible.map(c => c.high));
    const fibLow = Math.min(...visible.map(c => c.low));
    const fibRange = fibHigh - fibLow;
    const isUpTrend = visible[visible.length - 1].close > visible[0].close;
    const fibLevels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];
    for (const lvl of fibLevels) {
      const price = isUpTrend ? fibHigh - fibRange * lvl : fibLow + fibRange * lvl;
      if (price < minP - range * 0.1 || price > maxP + range * 0.1) continue;
      const y = pad.top + ph * (1 - (price - minP) / range);
      ctx.strokeStyle = avecAlpha(COLORS.fib, 0.5);
      ctx.lineWidth = 1; ctx.setLineDash([4, 6]);
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = avecAlpha(COLORS.fib, 0.9); ctx.font = chartFont(8);
      const label = (lvl * 100).toFixed(1) + '% $' + price.toFixed(2);
      const lw = ctx.measureText(label).width;
      ctx.fillText(label, W - pad.right - lw - 4, y - 3);
    }
  }
  
  // --- Volume Profile (Market Profile : POC + Value Area 70%) ---
  if (overlays.vp && visible.length >= 5) {
    const bins = Math.max(24, Math.min(72, Math.round(range / 100)));
    const binH = range / bins;
    const profile = new Array(bins).fill(0);
    for (const c of visible) {
      const loBin = Math.max(0, Math.floor((c.low - minP) / binH));
      const hiBin = Math.min(bins - 1, Math.floor((c.high - minP) / binH));
      for (let b = loBin; b <= hiBin; b++) profile[b] += c.volume;
    }
    const maxVol = Math.max(...profile) || 1;
    const pocBin = profile.indexOf(maxVol);
    const totalVol = profile.reduce((s, v) => s + v, 0);
    const order = profile.map((v, i) => i).sort((a, b) => profile[b] - profile[a]);
    let acc = 0, vaLo = bins, vaHi = -1;
    for (const b of order) {
      acc += profile[b];
      if (b < vaLo) vaLo = b;
      if (b > vaHi) vaHi = b;
      if (acc >= totalVol * 0.7) break;
    }
    const vpMaxW = 48;
    const yOf = b => pad.top + ph - (b + 0.5) * (ph / bins);
    for (let b = 0; b < bins; b++) {
      if (profile[b] === 0) continue;
      const t = profile[b] / maxVol;
      const w = t * vpMaxW;
      ctx.fillStyle = (b === pocBin) ? avecAlpha(COLORS.vpPoc, 0.9)
        : (b >= vaLo && b <= vaHi) ? avecAlpha(COLORS.vp, 0.25 + 0.5 * t)
        : avecAlpha(COLORS.vp, 0.12 + 0.2 * t);
      ctx.fillRect(W - pad.right + 2, pad.top + ph - (b + 1) * (ph / bins), w, Math.max(1, ph / bins - 1));
    }
    ctx.strokeStyle = avecAlpha(COLORS.vpPoc, 0.8); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(W - pad.right - 2, yOf(pocBin)); ctx.lineTo(W - pad.right + 2 + vpMaxW + 6, yOf(pocBin)); ctx.stroke();
    ctx.strokeStyle = avecAlpha(COLORS.vp, 0.45); ctx.setLineDash([2, 2]);
    for (const b of [vaLo, vaHi]) {
      ctx.beginPath(); ctx.moveTo(W - pad.right - 2, yOf(b)); ctx.lineTo(W - pad.right + 2 + vpMaxW + 6, yOf(b)); ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.fillStyle = COLORS.ink1; ctx.font = chartFont(8);
    ctx.fillText('POC $' + (minP + (pocBin + 0.5) * binH).toFixed(0), W - pad.right + 4, pad.top + 9);
  }

  // Candles
  // Bougies. NE PAS batcher les tracés par style (« 2 strokes par bougie » semble coûteux) :
  // mesuré sur 3000 bougies, grouper les halos + les corps → ~0 ms gagnée, et deux défauts :
  // grouper les corps par couleur inverse l'ordre de recouvrement (le rouge, dessiné en
  // dernier, masque systématiquement le vert — la courbe vire au rouge), grouper les halos
  // supprime le blanc cumulé qui rend les vues denses lisibles. L'ordre porte l'information.
  for (let i = 0; i < visible.length; i++) {
    const c = visible[i];
    const x = pad.left + gap * i;
    const isGreen = c.close >= c.open;
    const color = isGreen ? COLORS.candleUp : COLORS.candleDown;
    const yO = pad.top + ph * (1 - (c.open - minP) / range);
    const yC = pad.top + ph * (1 - (c.close - minP) / range);
    const yH = pad.top + ph * (1 - (c.high - minP) / range);
    const yL = pad.top + ph * (1 - (c.low - minP) / range);
    const xm = x + candleW / 2;
    // Anneau de SURFACE autour de la mèche (pas de blanc) : il sépare les bougies voisines
    // dans les vues denses sans dessiner de contour sur la donnée.
    ctx.strokeStyle = COLORS.surface; ctx.lineWidth = 2.6;
    ctx.beginPath(); ctx.moveTo(xm, yH); ctx.lineTo(xm, yL); ctx.stroke();
    ctx.strokeStyle = color; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(xm, yH); ctx.lineTo(xm, yL); ctx.stroke();
    const bodyH = Math.max(1, Math.abs(yC - yO));
    const bodyW = candleW * 0.7, bodyX = x + candleW*0.15, bodyY = Math.min(yO, yC);
    ctx.fillStyle = color;
    // Coins adoucis dès qu'il y a la place ; le liseré blanc d'avant (un contour sur la
    // donnée) n'a plus lieu d'être : les teintes validées tiennent 3:1 sur ce fond.
    if (bodyW >= 4 && bodyH >= 3) { ctx.beginPath(); ctx.roundRect(bodyX, bodyY, bodyW, bodyH, Math.min(2, bodyW / 5)); ctx.fill(); }
    else ctx.fillRect(bodyX, bodyY, bodyW, bodyH);
  }
  
  // --- Heatmap Liquidité (Bookmap : grille native -> un seul drawImage) ---
  // `histHeatmap.sym` n'était JAMAIS comparé au symbole affiché : le carnet BTC se
  // dessinait tel quel sur les graphes ETH, SOL, XRP, TAO et sur le ratio BTC/SOL.
  if (overlays.liq && histHeatmap && histHeatmap.bids && histHeatmap.sym === activeSymbol) {
    const hm = histHeatmap;
    const intervalS = (candles.length > 1 && candles[1].time > candles[0].time) ? (candles[1].time - candles[0].time) : 900;
    const winT0 = candles[vs].time;
    const winT1 = candles[Math.min(candles.length - 1, ve - 1)].time + intervalS;
    const gap = pw / Math.max(1, ve - vs);
    const layer = buildHeatLayer(hm);
    // Seules les colonnes natives qui couvrent la fenêtre sont blittées (sinon, en
    // intraday serré, le rect de destination fait des dizaines de milliers de px de large).
    const c0 = Math.max(0, Math.floor((winT0 - hm.t0) / hm.dt));
    const c1 = Math.min(layer ? layer.w : 0, Math.ceil((winT1 - hm.t0) / hm.dt));
    if (layer && c1 > c0) {
      const gp = hm.dt / intervalS * gap;              // largeur écran d'une colonne native
      ctx.save();
      // Clip sur la zone de prix : la heatmap ne déborde plus dans les gouttières.
      ctx.beginPath(); ctx.rect(pad.left, pad.top, pw, ph); ctx.clip();
      // Interpolation COUPÉE à l'échelle ~1 px/colonne (le lissage vertical, bin ≈ 6 px,
      // gommait les bandes de prix qu'on vient lire) ; GARDÉE en dézoom, où plusieurs
      // colonnes natives tombent dans un pixel — là, le plus proche voisin jette des
      // colonnes (3000 bougies : 1440 colonnes écrasées dans 41 px).
      ctx.imageSmoothingEnabled = gp < 0.9;
      ctx.drawImage(layer.cv, c0, 0, c1 - c0, layer.h,
        pad.left + (hm.t0 + c0 * hm.dt - winT0) / intervalS * gap,
        // Ligne 0 de l'image = la tranche de prix la PLUS HAUTE (cf. buildHeatLayer).
        // Le sommet se pose donc à layer.h * dp et non (layer.h - 1) * dp : le cran
        // de 20 $ d'écart décalait verticalement toute la heatmap.
        pad.top + ph * (1 - (layer.h * hm.dp - minP) / range),
        (c1 - c0) * gp, layer.h * ph * hm.dp / range);
      ctx.restore();
    }
  }
  
  // Time labels (X axis) — densité ET format déduits de la largeur réellement
  // disponible. Avec 6 libellés fixes, sur téléphone (299 px de tracé) ils se
  // chevauchaient (« 15/09 01:0015/09 03:30 ») ; et le décalage fixe `tx - 25`
  // rognait le premier libellé au bord gauche, même sur desktop.
  ctx.fillStyle = COLORS.text; ctx.font = chartFont(9);
  const tickAvailW = W - pad.left - pad.right;
  const intraday = ['1m','5m','15m','1h','4h'].includes(chartInterval);
  const fmtTick = t => {
    if (chartInterval === '1d' || chartInterval === '1w') return FMT_D2.format(t);
    // Intraday étroit : garder l'heure seule (la plage datée est en haut à gauche)
    if (intraday && tickAvailW < 420) return FMT_HM.format(t);
    return FMT_D2.format(t) + ' ' + FMT_HM.format(t);
  };
  const tickW = ctx.measureText(fmtTick(new Date(visible[0].time * 1000))).width;
  const numLabels = Math.min(6, Math.max(2, Math.floor(tickAvailW / (tickW + 18))));
  for (let j = 0; j < numLabels; j++) {
    const idx = Math.round((visible.length - 1) * j / (numLabels - 1));
    if (idx >= visible.length) continue;
    const label = fmtTick(new Date(visible[idx].time * 1000));
    const lw = ctx.measureText(label).width;
    // Centré sur la bougie, puis contraint à l'intérieur du tracé
    const tx = Math.max(pad.left, Math.min(W - pad.right - lw, pad.left + gap * idx - lw / 2));
    ctx.fillText(label, tx, chartH - 3);
  }
  
  // Price line (live) — la pastille de prix est sur l'axe Y (voir plus bas) :
  // elle y était dupliquée ici, créant deux badges identiques côte à côte.
  if (livePrice) {
    const yP = pad.top + ph * (1 - (livePrice - minP) / range);
    const enCours2 = candles[candles.length - 1];
    ctx.save(); ctx.globalAlpha = 0.6;
    ctx.strokeStyle = (enCours2 && livePrice < enCours2.open) ? COLORS.candleDown : COLORS.candleUp;
    ctx.lineWidth = 1; ctx.setLineDash([2, 4]);
    ctx.beginPath(); ctx.moveTo(pad.left, yP); ctx.lineTo(W - pad.right, yP); ctx.stroke();
    ctx.setLineDash([]); ctx.restore();
  }

  // ─── Trade markers (backtest) ───
  if (btResult && btResult.trades && btResult.trades.length > 0) {
    for (const trade of btResult.trades) {
      // Entry marker
      if (trade.entryIdx >= vs && trade.entryIdx < ve) {
        const ex = pad.left + gap * (trade.entryIdx - vs) + gap/2;
        const ey = pad.top + ph * (1 - (trade.entryPrice - minP) / range);
        if (ey > pad.top && ey < pad.top + ph) {
          // Green triangle up for buy entry
          ctx.fillStyle = COLORS.trade_buy;
          ctx.beginPath(); ctx.moveTo(ex, ey - 7); ctx.lineTo(ex - 5, ey + 2); ctx.lineTo(ex + 5, ey + 2); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = COLORS.trade_buy; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(ex, ey - 10); ctx.lineTo(ex, ey + 6); ctx.stroke();
        }
      }
      // Exit marker
      if (trade.exitIdx >= vs && trade.exitIdx < ve && trade.exitIdx >= 0) {
        const xx = pad.left + gap * (trade.exitIdx - vs) + gap/2;
        const xy = pad.top + ph * (1 - (trade.exitPrice - minP) / range);
        if (xy > pad.top && xy < pad.top + ph) {
          const isWin = trade.pnl > 0;
          ctx.fillStyle = isWin ? COLORS.trade_buy : COLORS.trade_sell;
          // Triangle down for sell exit
          ctx.beginPath(); ctx.moveTo(xx, xy + 7); ctx.lineTo(xx - 5, xy - 2); ctx.lineTo(xx + 5, xy - 2); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = isWin ? COLORS.trade_buy : COLORS.trade_sell; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(xx, xy + 10); ctx.lineTo(xx, xy - 6); ctx.stroke();
          // PnL label
          const pnlStr = (trade.pnlPct >= 0 ? '+' : '') + trade.pnlPct.toFixed(2) + '%';
          ctx.fillStyle = isWin ? COLORS.candleUp : COLORS.candleDown;
          ctx.font = chartFont(8);
          ctx.fillText(pnlStr, xx + 6, xy - 4);
        }
      }
    }
  }

  // ─── Grid level lines (active bot) ───
  const activeBot = btBot || (btResult && btResult.bot);
  if (activeBot && activeBot.gridLevels && activeBot.gridLevels.length > 0) {
    for (const level of activeBot.gridLevels) {
      if (level.price < minP - range * 0.1 || level.price > maxP + range * 0.1) continue;
      const ly = pad.top + ph * (1 - (level.price - minP) / range);
      if (ly < pad.top || ly > pad.top + ph) continue;

      if (level.status === 'pending') {
        // Dashed green — buy limit waiting
        ctx.strokeStyle = COLORS.grid_buy_pending; ctx.lineWidth = 1;
        ctx.setLineDash([5, 3]);
        ctx.beginPath(); ctx.moveTo(pad.left, ly); ctx.lineTo(W - pad.right, ly); ctx.stroke();
        ctx.setLineDash([]);
        // Label
        const label = 'BUY $' + level.price.toFixed(2);
        ctx.fillStyle = COLORS.grid_buy_pending; ctx.font = chartFont(8);
        ctx.fillText(label, pad.left + 4, ly - 3);
      } else if (level.status === 'filled') {
        // Solid green — active position
        ctx.strokeStyle = COLORS.grid_buy_filled; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(pad.left, ly); ctx.lineTo(W - pad.right, ly); ctx.stroke();
        // TP line (gold dashed)
        if (level.tp && level.tp < maxP + range * 0.2 && level.tp > minP - range * 0.2) {
          const tpy = pad.top + ph * (1 - (level.tp - minP) / range);
          ctx.strokeStyle = COLORS.grid_tp; ctx.lineWidth = 0.8;
          ctx.setLineDash([3, 4]);
          ctx.beginPath(); ctx.moveTo(pad.left, tpy); ctx.lineTo(W - pad.right, tpy); ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = COLORS.grid_tp; ctx.font = chartFont(7);
          ctx.fillText('TP ' + ((level.tp/level.price - 1)*100).toFixed(2) + '%', pad.left + 4, tpy - 2);
        }
        // SL line (red dashed)
        if (level.sl && level.sl < maxP + range * 0.2 && level.sl > minP - range * 0.2) {
          const sly = pad.top + ph * (1 - (level.sl - minP) / range);
          ctx.strokeStyle = COLORS.grid_sl; ctx.lineWidth = 0.8;
          ctx.setLineDash([3, 4]);
          ctx.beginPath(); ctx.moveTo(pad.left, sly); ctx.lineTo(W - pad.right, sly); ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = COLORS.grid_sl; ctx.font = chartFont(7);
          ctx.fillText('SL', pad.left + 4, sly - 2);
        }
      }
    }
  }
}

// Étiquettes d'overlays posées dans la frame courante (remise à zéro par drawChart) :
// une étiquette qui en chevaucherait une autre est omise — le point du ruban porte la légende.
let etiquettesPosees = [], etiquettesAFaire = [];
function drawLine(data, minP, range, pad, gap, ph, color, dash, width, dataOffset, etiquette) {
  ctx.strokeStyle = color; ctx.lineWidth = width;
  if (dash.length > 0) ctx.setLineDash(dash);
  ctx.beginPath();
  let started = false, lastX = null, lastY = null;
  const xMax = canvas.width / window.devicePixelRatio - pad.right;
  for (let i = 0; i < data.length; i++) {
    if (data[i] === null) continue;
    const idx = i - (dataOffset || 0);
    if (idx < 0) continue;
    const x = pad.left + gap * idx + gap / 2;
    if (x < pad.left || x > pad.left + gap * 500) continue; // safety
    const y = pad.top + ph * (1 - (data[i] - minP) / range);
    if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    if (x <= xMax) { lastX = x; lastY = y; }
  }
  ctx.stroke();
  ctx.setLineDash([]);
  // Étiquette en bout de tracé : l'identité de la ligne ne repose jamais sur la couleur seule.
  if (etiquette && lastX !== null && lastY > pad.top + 8 && lastY < pad.top + ph - 8) {
    ctx.font = chartFont(9, 650);
    const w = ctx.measureText(etiquette).width + 16;
    const ex = Math.min(lastX - w - 6, xMax - w - 4), ey = lastY - 8;
    if (!etiquettesPosees.some(y => Math.abs(y - ey) < 17)) {
      etiquettesPosees.push(ey);
      // Différée : posée APRÈS les bougies (les overlays sont tracés avant elles, et la
      // dernière bougie recouvrait l'étiquette).
      etiquettesAFaire.push(() => {
        ctx.font = chartFont(9, 650);
        ctx.fillStyle = COLORS.bulle;
        ctx.beginPath(); ctx.roundRect(ex, ey, w, 16, 8); ctx.fill();
        ctx.fillStyle = color; ctx.beginPath(); ctx.arc(ex + 7, ey + 8, 3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = COLORS.ink1; ctx.fillText(etiquette, ex + 12, ey + 11.5);
      });
    }
  }
}

// Titre + badge sous-graphe
function subTitle(key) {
  const map = { vol:'VOLUME', rsi:'RSI (14)', macd:'MACD (12,26,9)', stoch:'STOCH (14,3)', atr:'ATR (14)', obv:'OBV', mfi:'MFI (14)', williamsR:'%R (14)', cci:'CCI (20)', adx:'ADX (14)', ao:'AO', equity:'GRID EQUITY' };
  return map[key] || key.toUpperCase();
}

// Grille + labels d'échelle pour sous-graphes (o: {levels, min, max | span, f})
function subGrid(y0, pad, ph, W, o) {
  ctx.strokeStyle = COLORS.grid; ctx.lineWidth = 0.5;
  o.levels.forEach(l => {
    const y = o.span ? y0 + pad.top + ph/2 - (l / o.span) * ph : y0 + pad.top + ph * (1 - (l - (o.min || 0)) / ((o.max || 100) - (o.min || 0)));
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(W - pad.right, y); ctx.stroke();
    ctx.fillStyle = COLORS.axis || COLORS.text; ctx.font = chartFont(10, 650);
    ctx.textAlign = 'right'; ctx.fillText(o.f ? o.f(l) : l, W - 8, y + 3); ctx.textAlign = 'left';
  });
}

function resolveSub(candles, y0, subH, W, key) {
  const pad = { left: 16, right: 75, top: 18, bottom: 12 };
  const pw = W - pad.left - pad.right;
  const ph = subH - pad.top - pad.bottom;
  if (ph < 20) return;
  
  // Séparateur supérieur : un filet, pas un trait
  ctx.strokeStyle = COLORS.hairline; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(pad.left, y0 + 0.5); ctx.lineTo(W - pad.right, y0 + 0.5); ctx.stroke();
  
  // Titre du sous-graphe : point de sa couleur + intitulé à l'encre (le texte ne porte pas la couleur de la donnée)
  ctx.fillStyle = key === 'vol' ? COLORS.candleUp : subColor(key);
  ctx.beginPath(); ctx.arc(pad.left + 9, y0 + 10, 3, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = COLORS.ink3; ctx.font = chartFont(9.5, 700);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0.6px';
  ctx.fillText(subTitle(key), pad.left + 17, y0 + 13.5);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  
  // Utiliser le range visible pour les subs aussi
  const vs = Math.max(0, viewStart);
  const ve = Math.min(candles.length, viewEnd);
  const visible = candles.slice(vs, ve);
  const gap = pw / visible.length;
  
  if (key === 'vol') {
    const volumes = candles.map(c => c.volume);
    const maxV = Math.max(...volumes.slice(vs, ve));
    // Grid + échelle
    const fmtV = v => v >= 1e6 ? (v/1e6).toFixed(1)+'M' : v >= 1e3 ? (v/1e3).toFixed(1)+'K' : v.toFixed(0);
    subGrid(y0, pad, ph, W, { levels: [0, maxV/2, maxV], min: 0, max: maxV, f: fmtV });
    // Volume bars
    const barW = Math.max(1, gap * 0.7);
    for (let i = vs; i < ve; i++) {
      const c = candles[i];
      const x = pad.left + gap * (i - vs);
      const h = (c.volume / maxV) * ph;
      const y = y0 + pad.top + ph - h;
      // L'alpha 0x44 (27 %) rendait le volume quasi invisible sur le fond clair :
      // le volume est une DONNÉE, il se lit au même titre que les bougies.
      ctx.fillStyle = c.close >= c.open ? COLORS.candleUp : COLORS.candleDown;
      ctx.globalAlpha = COLORS.volAlpha;
      if (barW >= 4 && h >= 3) { ctx.beginPath(); ctx.roundRect(x + gap*0.15, y, barW, h, [Math.min(2, barW / 4), Math.min(2, barW / 4), 0, 0]); ctx.fill(); }
      else ctx.fillRect(x + gap*0.15, y, barW, h);
      ctx.globalAlpha = 1;
    }
  } else if (key === 'rsi') {
    const closes = candles.map(c => c.close);
    const rsi = memoized('sub_rsi', calcRSI, closes, 14);
    // Bande 30-70 teintée : la zone « normale » se lit d'un coup d'œil, les sorties ressortent.
    ctx.save(); ctx.globalAlpha = COLORS.bandeAlpha; ctx.fillStyle = COLORS.rsi;
    ctx.fillRect(pad.left, y0 + pad.top + ph * 0.3, pw, ph * 0.4); ctx.restore();
    subGrid(y0, pad, ph, W, { levels: [30, 50, 70] });
    // RSI line
    ctx.strokeStyle = COLORS.rsi; ctx.lineWidth = 1.5;
    ctx.beginPath(); let started = false;
    for (let i = vs; i < ve; i++) {
      if (i >= rsi.length || rsi[i] === null) continue;
      const x = pad.left + gap * (i - vs) + gap/2;
      const y = y0 + pad.top + ph * (1 - rsi[i] / 100);
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    }
    ctx.stroke();
  } else if (key === 'macd') {
    const closes = candles.map(c => c.close);
    const macd = memoized('sub_macd', calcMACD, closes);
    // Échelle sur la FENÊTRE VISIBLE : calculée sur les 3 000 bougies, un extrême d'il y a
    // des semaines écrasait la vue courante en une ligne plate (±900 d'échelle pour ±40 de signal).
    const fen = a => a.slice(vs, ve).filter(v => v !== null);
    const allVals = [...fen(macd.macdLine), ...fen(macd.signal), ...fen(macd.histogram)];
    const absMax = Math.max(Math.abs(Math.min(...allVals)), Math.abs(Math.max(...allVals))) || 1;
    const scale = (ph / 2) / absMax;
    const midY = y0 + pad.top + ph / 2;
    subGrid(y0, pad, ph, W, { levels: [-absMax, 0, absMax], min: -absMax, max: absMax, f: v => v.toFixed(2) });
    // Histogram
    const barW = Math.max(1, gap * 0.6);
    for (let i = vs; i < ve; i++) {
      if (i >= macd.histogram.length || macd.histogram[i] === null) continue;
      const x = pad.left + gap * (i - vs);
      const h = macd.histogram[i] * scale;
      ctx.fillStyle = avecAlpha(macd.histogram[i] >= 0 ? COLORS.candleUp : COLORS.candleDown, 0.55);
      ctx.fillRect(x + gap*0.2, Math.min(midY, midY - h), barW, Math.abs(h));
    }
    // MACD line
    drawLineAt(macd.macdLine, midY, scale, pad, gap, COLORS.macd, [], 1.5, vs);
    drawLineAt(macd.signal, midY, scale, pad, gap, COLORS.macd_signal, [], 1, vs);
  } else if (key === 'stoch') {
    const highs = candles.map(c => c.high), lows = candles.map(c => c.low), closes = candles.map(c => c.close);
    const stoch = memoized('sub_stoch', calcStoch, highs, lows, closes, 14, 3);
    subGrid(y0, pad, ph, W, { levels: [20, 50, 80] });
    drawLineAt(stoch.k, y0 + pad.top + ph, ph/100, pad, gap, COLORS.stoch_k, [], 1.5, vs);
    drawLineAt(stoch.d, y0 + pad.top + ph, ph/100, pad, gap, COLORS.stoch_d, [3, 3], 1, vs);
  } else if (key === 'atr') {
    const highs = candles.map(c => c.high), lows = candles.map(c => c.low), closes = candles.map(c => c.close);
    const atr = memoized('sub_atr', calcATR, highs, lows, closes, 14);
    const maxA = Math.max(...atr.filter(v => v !== null)) || 1;
    const scale = ph / maxA;
    subGrid(y0, pad, ph, W, { levels: [0, maxA/2, maxA], min: 0, max: maxA, f: v => '$' + v.toFixed(1) });
    drawLineAt(atr, y0 + pad.top + ph, scale, pad, gap, COLORS.atr, [], 1.5, vs);
  } else if (key === 'obv') {
    const closes = candles.map(c => c.close), volumes = candles.map(c => c.volume);
    const obv = memoized('sub_obv', calcOBV, closes, volumes);
    const visObv = obv.slice(vs, ve);
    const absMax = Math.max(Math.abs(Math.min(...visObv)), Math.abs(Math.max(...visObv))) || 1;
    const scale = (ph / 2) / absMax;
    const midY = y0 + pad.top + ph / 2;
    const fmtOBV = v => v >= 1e6 ? (v/1e6).toFixed(1)+'M' : v >= 1e3 ? (v/1e3).toFixed(1)+'K' : v.toFixed(0);
    subGrid(y0, pad, ph, W, { levels: [-absMax, 0, absMax], min: -absMax, max: absMax, f: fmtOBV });
    drawLineAt(obv, midY, scale, pad, gap, COLORS.obv, [], 1.5, vs);
  } else if (key === 'mfi') {
    const closes = candles.map(c => c.close), highs = candles.map(c => c.high), lows = candles.map(c => c.low), vols = candles.map(c => c.volume);
    const mfi = memoized('sub_mfi', calcMFI, highs, lows, closes, vols, 14);
    drawBandSub(y0, pad, ph, W, gap, mfi, COLORS.mfi, vs, ve, [20, 50, 80]);
  } else if (key === 'williamsR') {
    const closes = candles.map(c => c.close), highs = candles.map(c => c.high), lows = candles.map(c => c.low);
    const wr = memoized('sub_wr', calcWilliamsR, highs, lows, closes, 14);
    drawBandSub(y0, pad, ph, W, gap, wr, COLORS.williamsR, vs, ve, [-80, -50, -20], -100, 0);
  } else if (key === 'cci') {
    const closes = candles.map(c => c.close), highs = candles.map(c => c.high), lows = candles.map(c => c.low);
    const cci = memoized('sub_cci', calcCCI, highs, lows, closes, 20);
    subGrid(y0, pad, ph, W, { levels: [100, 0, -100], span: 200 });
    drawLineAt(cci, y0 + pad.top + ph/2, ph/400, pad, gap, COLORS.cci, [], 1.5, vs);
  } else if (key === 'adx') {
    const closes = candles.map(c => c.close), highs = candles.map(c => c.high), lows = candles.map(c => c.low);
    const adxData = memoized('sub_adx', calcADX, highs, lows, closes, 14);
    subGrid(y0, pad, ph, W, { levels: [25, 50] });
    drawLineAt(adxData.adx, y0 + pad.top + ph, ph/100, pad, gap, COLORS.adx, [], 1.5, vs);
    drawLineAt(adxData.plusDI, y0 + pad.top + ph, ph/100, pad, gap, COLORS.adx_plusDI, [3, 3], 1, vs);
    drawLineAt(adxData.minusDI, y0 + pad.top + ph, ph/100, pad, gap, COLORS.adx_minusDI, [3, 3], 1, vs);
  } else if (key === 'ao') {
    const highs = candles.map(c => c.high), lows = candles.map(c => c.low);
    const ao = memoized('sub_ao', calcAO, highs, lows);
    const allV = ao.filter(v => v !== null);
    const absMax = Math.max(Math.abs(Math.min(...allV)), Math.abs(Math.max(...allV))) || 1;
    const scale = (ph / 2) / absMax;
    const midY = y0 + pad.top + ph / 2;
    subGrid(y0, pad, ph, W, { levels: [-absMax, 0, absMax], min: -absMax, max: absMax, f: v => v.toFixed(2) });
    const barW = Math.max(1, gap * 0.6);
    for (let i = vs; i < ve; i++) {
      if (ao[i] === null) continue;
      const x = pad.left + gap * (i - vs);
      const h = ao[i] * scale;
      ctx.fillStyle = avecAlpha(ao[i] >= 0 ? COLORS.candleUp : COLORS.candleDown, 0.55);
      ctx.fillRect(x + gap*0.2, Math.min(midY, midY - h), barW, Math.abs(h));
    }
  } else if (key === 'equity') {
    // Equity curve sub-chart — shows total equity (gold) + realized PnL (green)
    if (!btResult || !btResult.equityCurve || btResult.equityCurve.length < 2) {
      ctx.fillStyle = COLORS.text; ctx.font = chartFont(10);
      ctx.fillText('Pas de backtest — lancez un backtest', pad.left + 10, y0 + pad.top + ph/2);
      return;
    }
    const eq = btResult.equityCurve;
    const startCap = btResult.capital;
    const allTotals = eq.map(e => e.total);
    const minEq = Math.min(...allTotals);
    const maxEq = Math.max(...allTotals);
    const rangeEq = maxEq - minEq || 1;

    // Grid + échelle $
    const eqFmt = v => '$' + v.toLocaleString('en-US', {maximumFractionDigits: 0});
    subGrid(y0, pad, ph, W, { levels: [minEq, minEq + rangeEq / 2, maxEq], min: minEq, max: maxEq, f: eqFmt });
    // Capital baseline
    const capY = y0 + pad.top + ph * (1 - (startCap - minEq) / rangeEq);
    ctx.strokeStyle = avecAlpha(COLORS.ink3, 0.5); ctx.lineWidth = 0.5;
    ctx.setLineDash([3, 6]);
    ctx.beginPath(); ctx.moveTo(pad.left, capY); ctx.lineTo(W - pad.right, capY); ctx.stroke();
    ctx.setLineDash([]);

    // Draw equity curve — total (gold)
    ctx.strokeStyle = COLORS.equity_total; ctx.lineWidth = 1.8;
    ctx.beginPath(); let started = false;
    let firstEqIdx = eq[0].idx, lastEqIdx = eq[eq.length - 1].idx;
    for (let j = 0; j < eq.length; j++) {
      const e = eq[j];
      if (e.idx < vs || e.idx > ve) continue;
      const x = pad.left + gap * (e.idx - vs) + gap/2;
      const y = y0 + pad.top + ph * (1 - (e.total - minEq) / rangeEq);
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Draw realized PnL (green)
    ctx.strokeStyle = COLORS.equity_realized; ctx.lineWidth = 1.2;
    ctx.beginPath(); started = false;
    for (let j = 0; j < eq.length; j++) {
      const e = eq[j];
      if (e.idx < vs || e.idx > ve) continue;
      const x = pad.left + gap * (e.idx - vs) + gap/2;
      const realizedTotal = startCap + e.realized;
      const y = y0 + pad.top + ph * (1 - (realizedTotal - minEq) / rangeEq);
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Labels
    const retPct = ((allTotals[allTotals.length-1] - startCap) / startCap * 100);
    const retStr = (retPct >= 0 ? '+' : '') + retPct.toFixed(2) + '%';
    ctx.fillStyle = retPct >= 0 ? COLORS.upInk : COLORS.downInk;
    ctx.font = chartFont(10, 650);
    ctx.fillText(retStr, pad.left + 4, y0 + pad.top + 12);

    // Legend
    ctx.fillStyle = COLORS.equity_total; ctx.font = chartFont(9);
    ctx.fillText('─ Equity', pad.left + 65, y0 + pad.top + 12);
    ctx.fillStyle = COLORS.equity_realized;
    ctx.fillText('─ Realized', pad.left + 125, y0 + pad.top + 12);
  }
}

function drawLineAt(data, baseY, scale, pad, gap, color, dash, width, dataOffset) {
  ctx.strokeStyle = color; ctx.lineWidth = width;
  if (dash.length > 0) ctx.setLineDash(dash);
  ctx.beginPath(); let started = false;
  for (let i = 0; i < data.length; i++) {
    if (data[i] === null) continue;
    const idx = i - (dataOffset || 0);
    if (idx < 0) continue;
    const x = pad.left + gap * idx + gap / 2;
    const y = baseY - data[i] * scale;
    if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
  }
  ctx.stroke(); ctx.setLineDash([]);
}

// Helper pour sous-graphes bandés (MFI, Williams %R, etc.)
function drawBandSub(y0, pad, ph, W, gap, data, color, vs, ve, levels, dataMin, dataMax) {
  const dMin = dataMin !== undefined ? dataMin : 0;
  const dMax = dataMax !== undefined ? dataMax : 100;
  subGrid(y0, pad, ph, W, { levels, min: dMin, max: dMax });
  ctx.strokeStyle = color; ctx.lineWidth = 1.5;
  ctx.beginPath(); let started = false;
  for (let i = vs; i < ve; i++) {
    if (i >= data.length || data[i] === null) continue;
    const x = pad.left + gap * (i - vs) + gap / 2;
    const y = y0 + pad.top + ph * (1 - (data[i] - dMin) / (dMax - dMin));
    if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
  }
  ctx.stroke();
}

// ============ SAMSARA ============

// Helpers pour le crosshair des sous-graphes
function subLabel(key) {
  const map = { vol:'Vol', rsi:'RSI', macd:'MACD', stoch:'%K', atr:'ATR', obv:'OBV', mfi:'MFI', williamsR:'%R', cci:'CCI', adx:'ADX', ao:'AO', equity:'Equity' };
  return map[key] || key;
}
function subColor(key) {
  const map = { vol:COLORS.ink3, rsi:COLORS.rsi, macd:COLORS.macd, stoch:COLORS.stoch_k, atr:COLORS.atr, obv:COLORS.obv, mfi:COLORS.mfi, williamsR:COLORS.williamsR, cci:COLORS.cci, adx:COLORS.adx, ao:COLORS.candleUp, equity:COLORS.equity_total };
  return map[key] || COLORS.ink3;
}
function getSubIndicatorValue(key, idx) {
  const c = candles;
  if (idx < 0 || idx >= c.length) return null;
  const closes = c.map(x => x.close), highs = c.map(x => x.high), lows = c.map(x => x.low), vols = c.map(x => x.volume);
  try {
    switch(key) {
      case 'vol': return c[idx].volume >= 1000 ? (c[idx].volume/1000).toFixed(1)+'K' : c[idx].volume.toFixed(0);
      case 'rsi': { const v = memoized('gsi_rsi', calcRSI, closes, 14); return v[idx] !== null ? v[idx].toFixed(1) : null; }
      case 'macd': { const v = memoized('gsi_macd', calcMACD, closes); return v.macdLine[idx] !== null ? v.macdLine[idx].toFixed(2) : null; }
      case 'stoch': { const v = memoized('gsi_stoch', calcStoch, highs, lows, closes, 14, 3); return v.k[idx] !== null ? v.k[idx].toFixed(1) : null; }
      case 'atr': { const v = memoized('gsi_atr', calcATR, highs, lows, closes, 14); return v[idx] !== null ? v[idx].toFixed(1) : null; }
      case 'obv': { const v = memoized('gsi_obv', calcOBV, closes, vols); return v[idx] !== null ? (v[idx]/1e6).toFixed(2)+'M' : null; }
      case 'mfi': { const v = memoized('gsi_mfi', calcMFI, highs, lows, closes, vols, 14); return v[idx] !== null ? v[idx].toFixed(1) : null; }
      case 'williamsR': { const v = memoized('gsi_wr', calcWilliamsR, highs, lows, closes, 14); return v[idx] !== null ? v[idx].toFixed(1) : null; }
      case 'cci': { const v = memoized('gsi_cci', calcCCI, highs, lows, closes, 20); return v[idx] !== null ? v[idx].toFixed(1) : null; }
      case 'adx': { const v = memoized('gsi_adx', calcADX, highs, lows, closes, 14); return v.adx[idx] !== null ? v.adx[idx].toFixed(1) : null; }
      case 'ao': { const v = memoized('gsi_ao', calcAO, highs, lows); return v[idx] !== null ? v[idx].toFixed(2) : null; }
      default: return null;
    }
  } catch(e) { return null; }
}

// ═══════════════ MARCHÉ LIVE (market-data.json) ═══════════════
async function fetchMarket() {
  try {
    const resp = await fetch(DATA_URL + '?t=' + Date.now(), { cache: 'no-store' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    marketData = await resp.json();
    renderFeed();
    // ─── ÂGE DE LA DONNÉE ────────────────────────────────────────────────
    // Un HTTP 200 ne prouve RIEN sur la fraîcheur : une source morte reste servie
    // indéfiniment et le point restait vert. C'est la panne du 16/08 — la Roue a lu
    // 13 cycles de données gelées sans qu'aucun voyant ne bronche.
    // Cadence attendue : 15 min. 20 min = un tick manqué, 32 min = deux.
    const ageMin = marketData.updated
      ? (Date.now() - Date.parse(marketData.updated)) / 60000 : null;
    const etat = ageMin === null ? 'inconnu'
               : ageMin > 32 ? 'fige'
               : ageMin > 20 ? 'retard' : 'ok';
    const teinte = { ok: 'var(--up)', retard: 'var(--warn)', fige: 'var(--down)',
                     inconnu: 'var(--ink-3)' }[etat];
    const dot = document.getElementById('dot');
    if (dot) {
      dot.style.background = teinte;
      dot.classList.toggle('calme', etat !== 'ok');        // ne pas onduler sur du figé
      // Une onde par publication reçue (deux passages), puis le calme : pas d'animation infinie.
      if (etat === 'ok') { dot.classList.remove('ping'); void dot.offsetWidth; dot.classList.add('ping'); }
      dot.title = ageMin === null
        ? 'Âge de la donnée inconnu (champ updated absent)'
        : `Dernière publication il y a ${Math.round(ageMin)} min`;
    }
    const td = document.getElementById('taskbarDot');
    if (td) td.style.background = teinte;
  } catch(e) {
    document.getElementById('dot').style.background = 'var(--down)';
    const td = document.getElementById('taskbarDot');
    if (td) td.style.background = 'var(--down)';
    const feed = document.getElementById('feed');
    feed.innerHTML = '<div class="error">⚠️ ' + e.message + '</div>';
  }
}

function escHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
const isNum = v => (v !== null && v !== undefined && !isNaN(v));
const fmtNum = (v,d=2) => isNum(v) ? Number(v).toLocaleString('en-US',{minimumFractionDigits:d,maximumFractionDigits:d}) : '—';
const fmtUsd = v => isNum(v) ? '$' + Math.round(v).toLocaleString('en-US') : '—';
const fmtBig = v => { if(!isNum(v)) return '—'; const a=Math.abs(v);
  if(a>=1e9) return '$'+(v/1e9).toFixed(2)+'B'; if(a>=1e6) return '$'+(v/1e6).toFixed(2)+'M';
  if(a>=1e3) return '$'+(v/1e3).toFixed(1)+'K'; return '$'+v.toFixed(2); };
const pctSpan = v => { if(!isNum(v)) return '—'; const c = v>0?'stat-pos':(v<0?'stat-neg':''); return '<span class="'+c+'">'+(v>0?'+':'')+fmtNum(v)+'%</span>'; };

// ═══════════════════════════════════════════════════════════════════════════════
// LECTURE LIVE — bouton ⚡ (ajouté le 02/10/2026)
// ─────────────────────────────────────────────────────────────────────────────
// POURQUOI CETTE VUE EXISTE. Le dashboard a DEUX cadences, et ça a été pris pour une panne :
//   · le badge de prix en haut -> api.binance.com ticker/price, rafraîchi à la SECONDE ;
//   · les cartes « Marché live » -> market-data.json, fichier réécrit toutes les 15 MINUTES.
// Lorenzo a signalé deux fois un « écart entre le prix réel OKX et ce qu'affiche le dashboard ».
// Mesuré le 02/10 à 11:07 UTC : badge 86 422,0 contre OKX spot 86 423,0 — soit 1,0 pt, pas
// d'écart. Mais la CARTE affichait 86 330,1 (publiée 4,7 min plus tôt) — soit −92,9 pts. Écart
// réel, dû au seul retard de publication. Sur un cycle complet il atteint 300 à 400 pts.
// Ici, tout ce qui PEUT être live l'est vraiment, et le reste s'affiche avec son âge.
//
// ⚠️ NE JAMAIS appeler ici une source autre que Binance. Les autres (OKX, Deribit, Yahoo) sont
// agrégées côté serveur dans market-data.json ; appelées depuis la page, elles échoueraient en
// silence et donneraient l'illusion d'une panne de marché. Un prix OKX ne peut donc PAS être
// affiché en direct dans cette vue — il arrive avec les 15 minutes du fichier.
let liveTimer = null;

function openLiveModal() {
  const m = document.getElementById('liveModal');
  if (!m) return;
  m.style.display = 'flex';
  renderLive();
  if (!liveTimer) liveTimer = setInterval(() => { if (!document.hidden) renderLive(); }, 5000);
}
function closeLiveModal() {
  const m = document.getElementById('liveModal');
  if (m) m.style.display = 'none';
  if (liveTimer) { clearInterval(liveTimer); liveTimer = null; }
}

// Rang (%) d'un prix dans son intervalle — situe le spot dans son range 24 h.
function liveRank(p, lo, hi) {
  return hi > lo ? Math.max(0, Math.min(100, (p - lo) / (hi - lo) * 100)) : 0;
}
// Même composant que les cartes « Marché live » : rail, remplissage, point.
function liveBar(pct) {
  return '<div class="track"><div class="track-rail"><span class="track-fill" style="width:' + pct.toFixed(1)
    + '%"></span><span class="track-dot" style="left:' + pct.toFixed(1) + '%"></span></div></div>';
}
const fmtPx = v => isNum(v) ? Number(v).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : '—';
// 2 décimales : un spread Binance BTCUSDT vaut souvent 0,01 $ — arrondi à 1 décimale il
// s'affiche « 0.0 pts », c'est-à-dire « pas de spread », ce qui est faux.
const fmtPx2 = v => isNum(v) ? Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';

async function renderLive() {
  const box = document.getElementById('liveModalBody');
  if (!box) return;
  const clk = document.getElementById('liveClock');
  let t24, depth, trades;
  const t0 = Date.now();
  try {
    const o = { cache: 'no-store' };
    const B = 'https://api.binance.com/api/v3/';
    [t24, depth, trades] = await Promise.all([
      fetch(B + 'ticker/24hr?symbol=BTCUSDT', o).then(r => r.json()),
      fetch(B + 'depth?symbol=BTCUSDT&limit=500', o).then(r => r.json()),
      fetch(B + 'trades?symbol=BTCUSDT&limit=500', o).then(r => r.json()),
    ]);
  } catch (e) {
    box.innerHTML = '<div class="loading">⚡ Binance injoignable depuis ce poste — ' + escHtml(e && e.message ? e.message : e) + '</div>';
    return;
  }
  const lat = Date.now() - t0;
  const px = parseFloat(t24.lastPrice);
  const bid = parseFloat(t24.bidPrice), ask = parseFloat(t24.askPrice);
  const sprd = ask - bid;
  const hi = parseFloat(t24.highPrice), lo = parseFloat(t24.lowPrice);
  const chg = parseFloat(t24.priceChangePercent);
  const rank = liveRank(px, lo, hi);
  // ── carnet : profondeur réellement posée autour du prix ──
  // 500 niveaux Binance ne couvrent que ≈ ±0,13 % du prix (mesuré le 04/10/2026). La carte
  // annonçait « ±1 % » et sommait en réalité tout le carnet reçu, soit ±0,13 %. On mesure
  // donc une bande que ce carnet COUVRE, et on affiche la couverture réelle.
  const BANDE = 0.1;
  const bidsD = depth.bids || [], asksD = depth.asks || [];
  const couv = (bidsD.length && asksD.length)
    ? Math.min(1 - parseFloat(bidsD[bidsD.length - 1][0]) / px, parseFloat(asksD[asksD.length - 1][0]) / px - 1) * 100 : NaN;
  let bv = 0, av = 0;
  for (const r of bidsD) if (parseFloat(r[0]) >= px * (1 - BANDE / 100)) bv += parseFloat(r[1]);
  for (const r of asksD) if (parseFloat(r[0]) <= px * (1 + BANDE / 100)) av += parseFloat(r[1]);
  const ratio = (av > 0 && couv >= BANDE) ? bv / av : NaN;
  // ── tape : 500 derniers trades. isBuyerMaker=true -> l'acheteur était PASSIF -> vente agressive ──
  let buy = 0, sell = 0;
  for (const t of (trades || [])) { const q = parseFloat(t.qty); if (t.isBuyerMaker) sell += q; else buy += q; }
  const tot = buy + sell;
  const taker = tot > 0 ? buy / tot : NaN;
  const delta = buy - sell;
  // Fenêtre réelle des 500 derniers trades : en heures creuses elle ne couvre que quelques
  // SECONDES. Sans ce chiffre, « taker buy 38 % » se lit comme une mesure de tendance alors
  // que c'est un instantané microscopique.
  const spanS = (trades && trades.length > 1)
    ? Math.round((trades[trades.length - 1].time - trades[0].time) / 1000) : null;
  // ── tout le reste : lu dans le fichier de 15 min, avec son âge affiché ──
  const md = marketData || {}, mi = md.micro || {}, bf = md.btc || {};
  const ageMin = md.updated ? Math.round((Date.now() - Date.parse(md.updated)) / 60000) : null;
  if (clk) clk.textContent = '· ' + new Date().toISOString().slice(11, 19) + ' UTC · aller-retour ' + lat + ' ms';

  const pos = 'stat-pos', neg = 'stat-neg';
  let html = '';
  carteEntree = !(box.dataset && box.dataset.vu);

  // 1 — PRIX LIVE
  html += mCard('⚡', 'Prix live', 'Binance spot · à la seconde · aller-retour ' + lat + ' ms', '',
    '<div style="font-size:22px;font-weight:800;letter-spacing:-0.5px">' + fmtUsd(px)
    + ' <span style="font-size:14px" class="' + (chg > 0 ? pos : neg) + '">' + (chg > 0 ? '+' : '') + fmtNum(chg) + '% 24h</span></div>'
    + '<div style="margin-top:6px;font-size:12px;font-variant-numeric:tabular-nums">Bid <b>' + fmtPx2(bid) + '</b> · Ask <b>' + fmtPx2(ask)
    + '</b> · spread <b>' + sprd.toFixed(2) + ' pts</b> (' + (sprd / px * 10000).toFixed(2) + ' bp)</div>');

  // 2 — RANGE 24 H
  html += mCard('📊', 'Range 24 h', 'haut / bas des 24 h · position du spot', '',
    '<div style="font-size:12px;font-variant-numeric:tabular-nums">Haut <b>' + fmtPx(hi) + '</b> · Bas <b>' + fmtPx(lo)
    + '</b></div>' + liveBar(rank)
    + '<div style="margin-top:5px;font-size:12px">Position dans le range : <b>' + rank.toFixed(1) + ' %</b>'
    + ' · amplitude <b>' + fmtNum((hi / lo - 1) * 100) + ' %</b></div>'
    + '<div style="margin-top:5px;font-size:11px;color:var(--ink-2)">Volume 24 h <b>' + fmtBig(parseFloat(t24.quoteVolume))
    + '</b> · ' + parseInt(t24.count, 10).toLocaleString('fr-FR') + ' trades</div>');

  // 3 — CARNET LIVE ±1 %
  const carnetTxt = !isFinite(ratio) ? '—'
    : ratio >= 1.4 ? 'déséquilibre ACHETEUR marqué' : ratio >= 1.1 ? 'léger penchant acheteur'
    : ratio <= 0.7 ? 'déséquilibre VENDEUR marqué' : ratio <= 0.9 ? 'léger penchant vendeur' : 'équilibré';
  html += mCard('💧', 'Carnet live ±' + BANDE + ' %', 'Binance spot · 500 niveaux, vus jusqu\'à ±'
    + (isFinite(couv) ? couv.toFixed(2) : '—') + ' % · instantané', '',
    '<div style="font-size:12px;font-variant-numeric:tabular-nums">Bids <b>' + fmtNum(bv, 1) + ' BTC</b> · Asks <b>' + fmtNum(av, 1) + ' BTC</b></div>'
    + '<div style="margin-top:6px;font-size:15px;font-weight:800" class="' + (ratio >= 1 ? pos : neg) + '">Ratio bid/ask '
    + (isFinite(ratio) ? ratio.toFixed(2) : '—') + '</div>'
    + '<div style="margin-top:4px;font-size:11px;color:var(--ink-2)">' + carnetTxt
    + ' — un carnet est PÉRISSABLE : valable quelques minutes, et un mur peut être retiré</div>');

  // 4 — TAPE LIVE
  const tapeTxt = !isFinite(taker) ? '—'
    : taker >= 0.60 ? 'acheteurs agressifs dominants' : taker >= 0.53 ? 'léger penchant acheteur'
    : taker <= 0.40 ? 'vendeurs agressifs dominants' : taker <= 0.47 ? 'léger penchant vendeur' : 'partagé';
  html += mCard('🌊', 'Tape live', '500 derniers trades · fenêtre ' + (spanS === null ? '—' : spanS + ' s') + ' · agression, pas intention', '',
    '<div style="font-size:12px;font-variant-numeric:tabular-nums">Achats au taker <b>' + fmtNum(buy, 1) + ' BTC</b> · Ventes <b>' + fmtNum(sell, 1) + ' BTC</b></div>'
    + '<div style="margin-top:6px;font-size:15px;font-weight:800" class="' + (taker >= 0.5 ? pos : neg) + '">Taker buy '
    + (isFinite(taker) ? (taker * 100).toFixed(1) + ' %' : '—') + '</div>'
    + '<div style="margin-top:4px;font-size:12px">Delta net <b class="' + (delta >= 0 ? pos : neg) + '">'
    + (delta >= 0 ? '+' : '') + fmtNum(delta, 1) + ' BTC</b> — ' + tapeTxt + '</div>');

  // 5 — CE QUI N'EST PAS LIVE ICI, ET POURQUOI
  const ageTxt = ageMin === null ? 'inconnu' : ageMin + ' min';
  html += mCard('🕐', "ce qui n'est PAS live ici", 'lu dans le fichier publié — âge ' + ageTxt, '',
    '<div style="font-size:12px;font-variant-numeric:tabular-nums">'
    + 'Perp (mark) <b>' + (isNum(mi.mark_price) ? fmtPx(mi.mark_price) : '—') + '</b>'
    // ⚠️ Le basis se calcule entre le perp ET le spot DU MÊME INSTANT du fichier. Soustraire
    // ce perp (daté) au spot LIVE fabriquait un basis de −207 pts au lieu de −45. C'est
    // exactement le péché que ce panneau est censé rendre impossible.
    + ' · basis <b>' + (isNum(mi.mark_price) && isNum(bf.price) ? (mi.mark_price - bf.price).toFixed(1) + ' pts' : '—') + '</b>'
    + ' <span style="color:var(--ink-2)">(perp et spot du même instant du fichier)</span><br>'
    + 'Dérive du spot depuis la publication <b>' + (isNum(bf.price) ? (px - bf.price).toFixed(1) + ' pts' : '—') + '</b>'
    + ' · funding <b>' + (isNum(mi.funding_rate_pct) ? fmtNum(mi.funding_rate_pct, 5) + ' %/8h' : '—') + '</b>'
    + ' · annualisé <b>' + (isNum(mi.funding_annual_pct) ? fmtNum(mi.funding_annual_pct, 1) + ' %' : '—') + '</b><br>'
    + 'OI <b>' + (isNum(mi.oi_btc) ? fmtNum(mi.oi_btc, 0) + ' BTC' : '—') + '</b>'
    + ' · L/S retail <b>' + (isNum(mi.ls_ratio) ? fmtNum(mi.ls_ratio, 3) : '—') + '</b>'
    + ' · variation 24 h (fichier) <b>' + (isNum(bf.change_24h_pct) ? fmtNum(bf.change_24h_pct) + ' %' : '—') + '</b></div>'
    + '<div style="margin-top:8px;font-size:11px;color:var(--ink-2);line-height:1.45">'
    + '<b>Piège mesuré le 02/10 :</b> soustraire le perp du fichier au spot live affichait un basis de '
    + '<b>−207 pts</b> quand le vrai basis valait <b>−45 pts</b>. Deux cadences différentes ne se soustraient '
    + 'jamais — c&#39;est l&#39;erreur exacte que ce panneau existe pour éviter.<br><br>'
    + 'Ces blocs viennent de market-data.json (cron, 15 min) : cette page n\'interroge que Binance '
    + 'en direct, les autres sources (OKX, Deribit, Yahoo) sont agrégées côté serveur et arrivent avec '
    + 'leurs 15 minutes. Pour comparer honnêtement, ce prix-ci est du <b>spot Binance</b> : compare-le '
    + 'à ton <b>spot</b> OKX, jamais à un swap — le basis perp/spot fait 20 à 50 pts et ce n&#39;est pas '
    + 'une panne.</div>');

  carteEntree = false;
  if (box.dataset) box.dataset.vu = '1';
  box.innerHTML = html;
}

// Icônes des cartes : SVG au trait, même dessin sur tous les systèmes (un émoji change de
// style d'un OS à l'autre). La clé reste l'émoji passé par l'appelant ; la teinte de l'orbe
// et le filet de la carte viennent de la classe `carte-<nom>`.
const ICONES = {
  '📊': ['marche', '<path d="M7 4v4M7 16v4M17 3v3M17 14v7"/><rect x="5" y="8" width="4" height="8" rx="1"/><rect x="15" y="6" width="4" height="8" rx="1"/>'],
  '🌍': ['macro', '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/>'],
  '📈': ['ind', '<path d="M3 12h4l3-7 4 14 3-7h4"/>'],
  '📡': ['micro', '<circle cx="12" cy="12" r="2"/><path d="M8.5 15.5a5 5 0 0 1 0-7M15.5 8.5a5 5 0 0 1 0 7M5.6 18.4a9 9 0 0 1 0-12.8M18.4 5.6a9 9 0 0 1 0 12.8"/>'],
  '💧': ['liq', '<path d="M12 3s6 6.4 6 11a6 6 0 0 1-12 0c0-4.6 6-11 6-11z"/>'],
  '🔌': ['flux', '<path d="M9 7V3M15 7V3M7 7h10v4a5 5 0 0 1-10 0V7zM12 16v5"/>'],
  '⚡': ['live', '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8z"/>'],
  '🌊': ['tape', '<path d="M2 9c2.5-2 4.5-2 7 0s4.5 2 7 0 4.5-2 6 0M2 15c2.5-2 4.5-2 7 0s4.5 2 7 0 4.5-2 6 0"/>'],
  '🕐': ['temps', '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'],
};
const svgIco = d => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
// Apparition en fondu au PREMIER rendu d'un conteneur seulement : les cartes sont réécrites
// toutes les 60 s (et le panneau ⚡ toutes les 5 s) — l'animation ne doit pas se rejouer.
let carteEntree = false;
function mCard(icon, title, sub, right, body) {
  const ic = ICONES[icon];
  return '<div class="demon-card carte-' + (ic ? ic[0] : 'autre') + (carteEntree ? ' entree' : '') + '"><div class="demon-header">'
    + '<div class="demon-avatar"><div class="avatar-orb">' + (ic ? svgIco(ic[1]) : icon) + '</div></div>'
    + '<div class="demon-titres"><div class="demon-name">' + title + '</div><div class="demon-role">' + sub + '</div></div>'
    + (right ? '<span class="demon-right">' + right + '</span>' : '')
    + '</div><div class="demon-body">' + body + '</div></div>';
}
// TROIS états, pas deux. `undefined` (champ absent de market-data.json) tombait dans
// la branche « else » et affichait « GOLDEN CROSS » : un signal haussier fabriqué à
// partir d'une absence. Une donnée manquante doit se voir comme manquante.
function crossTag(isDeath) {
  if (isDeath === true)  return '<span class="badge badge-baissier">DEATH CROSS</span>';
  if (isDeath === false) return '<span class="badge badge-hausser">GOLDEN CROSS</span>';
  return '<span class="badge" style="background:var(--rail);color:var(--ink-3)">n/d</span>';
}
// Montant signé lisible : « −$6.83M » plutôt que « $-6.83M ».
const fmtSigned = v => !isNum(v) ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + fmtBig(Math.abs(v));
const signCls = v => v > 0 ? 'stat-pos' : (v < 0 ? 'stat-neg' : '');
const chipCls = v => 'chip' + (v > 0 ? ' pos' : v < 0 ? ' neg' : '');
const pctSigne = (v, d) => !isNum(v) ? '—' : (v > 0 ? '+' : '') + fmtNum(v, d === undefined ? 2 : d) + '%';
const pct1 = v => isNum(v) ? Math.max(0, Math.min(100, v)).toFixed(1) : null;

// ═══ Composants visuels des cartes ═══
// Position d'une valeur dans [lo, hi] : rail + remplissage + point (bas/haut 24 h, canal S/R).
function trackHtml(val, lo, hi, gauche, droite) {
  const p = (isNum(val) && isNum(lo) && isNum(hi) && hi > lo) ? pct1((val - lo) / (hi - lo) * 100) : null;
  return '<div class="track"><div class="track-rail">'
    + (p === null ? '' : '<span class="track-fill" style="width:' + p + '%"></span><span class="track-dot" style="left:' + p + '%"></span>')
    + '</div><div class="track-legende"><span>' + gauche + '</span><span>' + droite + '</span></div></div>';
}
// Jauge RSI : zones de survente (≤ 30) et de surachat (≥ 70) teintées, un point à la valeur.
function rsiMeter(v) {
  const p = pct1(v);
  const etat = !isNum(v) ? '' : v >= 70 ? ' chaud' : v <= 30 ? ' froid' : '';
  return '<div class="rsi-meter' + etat + '" title="RSI : zones 30 / 70"><span class="rsi-zone bas"></span><span class="rsi-zone haut"></span>'
    + (p === null ? '' : '<span class="rsi-dot" style="left:' + p + '%"></span>') + '</div>';
}
// Barre à deux segments (long/short, bids/asks), séparés par 2 px de surface.
function splitHtml(a, b, gauche, droite) {
  const t = (+a || 0) + (+b || 0), pa = t > 0 ? (+a || 0) / t * 100 : 50;
  return '<div class="split"><span class="split-a" style="width:' + pa.toFixed(1) + '%"></span><span class="split-b"></span></div>'
    + '<div class="split-legende"><span>' + gauche + '</span><span>' + droite + '</span></div>';
}
// Barres divergentes centrées sur zéro, à l'échelle de la plus grande valeur absolue.
function divergeRows(rows) {
  const m = Math.max(...rows.map(r => Math.abs(+r.v) || 0)) || 1;
  return rows.map(r => {
    const w = isNum(r.v) ? (Math.abs(r.v) / m * 50).toFixed(1) : 0;
    return '<div class="dv-row"><span class="dv-lbl">' + r.lbl + '</span><div class="dv-bar"><span class="dv-axe"></span>'
      + (isNum(r.v) ? '<span class="dv-fill ' + (r.v >= 0 ? 'pos' : 'neg') + '" style="' + (r.v >= 0 ? 'left' : 'right') + ':50%;width:' + w + '%"></span>' : '')
      + '</div><span class="dv-val">' + r.txt + '</span></div>';
  }).join('');
}
// Mini-axe de prix : repères placés à l'échelle, étiquettes alternées dessus / dessous.
function axePrix(points) {
  const ps = points.filter(x => isNum(x.p)).sort((a, b) => a.p - b.p);
  if (ps.length < 2) return '';
  const lo = ps[0].p, hi = ps[ps.length - 1].p, marge = (hi - lo) * 0.14 || 1;
  const pos = v => ((v - lo + marge) / (hi - lo + 2 * marge) * 100).toFixed(1);
  const k = v => '$' + (v / 1000).toFixed(1) + 'k';
  return '<div class="axe"><div class="axe-rail"></div>' + ps.map((x, i) =>
    '<span class="axe-pt ' + x.cls + (i % 2 ? ' bas' : ' haut') + '" style="left:' + pos(x.p) + '%"><i></i><b><em>' + x.lbl + '</em>' + k(x.p) + '</b></span>'
  ).join('') + '</div>';
}
// Échelle des murs : asks au-dessus, mid, bids au-dessous — rangés par prix, barre ∝ BTC.
function ladderHtml(asks, bids, mid) {
  const a = (asks || []).slice(0, 5), b = (bids || []).slice(0, 5);
  const max = Math.max(1, ...a.map(w => w[1]), ...b.map(w => w[1]));
  const ligne = (w, cote) => '<div class="lad-row ' + cote + '"><span class="lad-px">' + fmtUsd(w[0]) + '</span>'
    + '<div class="lad-bar"><span style="width:' + (w[1] / max * 100).toFixed(1) + '%"></span></div>'
    + '<span class="lad-q">' + fmtNum(w[1], 1) + '&nbsp;BTC</span></div>';
  const parPrix = l => [...l].sort((x, y) => y[0] - x[0]);
  return '<div class="ladder">' + parPrix(a).map(w => ligne(w, 'ask')).join('')
    + '<div class="lad-mid">mid ' + fmtUsd(mid) + '</div>'
    + parPrix(b).map(w => ligne(w, 'bid')).join('') + '</div>';
}
const tuile = (lbl, val, sub) => '<div class="tuile"><div class="lbl">' + lbl + '</div><div class="val">' + val + '</div>'
  + (sub ? '<div class="sub">' + sub + '</div>' : '') + '</div>';

function renderFeed() { renderFeedTo(document.getElementById('feed')); }

// Bandeau d'âge. Il est injecté DANS le même innerHTML que les cartes, donc il
// s'affiche dans le conteneur réellement visible (#marketModalBody) — un bandeau
// inséré avant #feed partait dans le panneau latéral replié et restait invisible
// (constaté au rendu : présent dans le DOM, absent de l'écran).
function ageBannerHtml(d) {
  const upd = d && d.updated ? Date.parse(d.updated) : NaN;
  if (isNaN(upd)) {
    return '<div class="age-banner" style="display:block">Âge de la donnée inconnu — champ <b>updated</b> absent</div>';
  }
  const age = (Date.now() - upd) / 60000;
  if (age <= 20) return '';
  const fige = age > 32;
  return '<div class="age-banner' + (fige ? '' : ' retard') + '" style="display:block">'
    + (fige
        ? 'Données figées depuis ' + Math.round(age) + ' min — le cron de publication ne tourne plus'
        : 'Dernière publication il y a ' + Math.round(age) + ' min (cadence attendue : 15 min)')
    + '</div>';
}

function renderFeedTo(container) {
  if (!marketData) { container.innerHTML = '<div class="loading">📊 En attente des données…</div>'; return; }
  const d = marketData, b = d.btc||{}, m = d.macro||{}, tf = d.tf||{},
        x = d.micro||{}, lq = d.liquidity||{}, st = d.status||{};
  const upd = d.updated ? new Date(d.updated) : null;
  // Le libellé annonce « UTC » : il faut donc formater EN UTC. Sans `timeZone`,
  // c'était l'heure locale du poste (Paris, +2 h en été) affichée sous l'étiquette UTC.
  const hhmm = upd ? upd.toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit',timeZone:'UTC'}) : '—';

  const cy = document.getElementById('cycle');
  if (cy) cy.innerHTML = '<span class="mchip"><i>DXY</i>' + fmtNum(m.dxy_spot,2) + '</span><span class="mchip"><i>VIX</i>' + fmtNum(m.vix,1) + '</span>';
  const up = document.getElementById('updated');
  if (up) up.textContent = hhmm;

  let html = '';
  carteEntree = !(container.dataset && container.dataset.vu);

  // ── 1. MARCHÉ ──
  // ⚠️ AJOUTÉ 02/10/2026. Lorenzo a signalé DEUX FOIS un « écart entre le prix réel OKX et
  // ce qu'affiche le dashboard ». Mesuré : le badge de prix en haut (Binance ticker/price,
  // rafraîchi à la SECONDE) est à −1,0 pt de l'OKX spot — pas d'écart. Mais CETTE carte vient
  // de market-data.json, réécrit toutes les 15 min : elle affichait 86 330,1 quand le spot
  // était à 86 423,0, soit −92,9 pts en 4,7 min. Le décalage était réel mais daté — encore
  // fallait-il le calculer. On affiche l'âge en minutes à côté de l'heure de maj pour que le
  // retard se LISE. Le bandeau d'âge (ageBannerHtml) ne se déclenche qu'au-delà de 20 min,
  // c'est-à-dire jamais dans le cas normal : d'où deux prix contradictoires à l'écran.
  const ageMin = upd ? Math.max(0, Math.round((Date.now() - upd.getTime()) / 60000)) : null;
  html += mCard('📊','Marché live','Binance spot · maj ' + hhmm + ' UTC'
      + (ageMin !== null ? ' (+' + ageMin + ' min — le badge du haut est live)' : ''), '',
    '<div class="hero"><span class="hero-val">' + fmtUsd(b.price) + '</span>'
    + '<span class="' + chipCls(b.change_24h_pct) + '">' + pctSigne(b.change_24h_pct) + ' 24h</span></div>'
    + trackHtml(b.price, b.low_24h, b.high_24h, 'Bas&nbsp;<b>' + fmtUsd(b.low_24h) + '</b>', 'Haut&nbsp;<b>' + fmtUsd(b.high_24h) + '</b>')
    + '<div class="fine" style="margin-top:8px">Volume 24h&nbsp;<b style="color:var(--ink-1)">' + fmtBig(b.quote_volume_24h_usd) + '</b></div>');

  // ── 2. MACRO ──
  // Week-end : DXY et VIX sont TOUS DEUX des dernières clôtures (marchés fermés), pas des
  // valeurs du moment — l'ancienne carte ne le disait que pour le DXY.
  const ferme = !!m.dxy_is_weekend;
  html += mCard('🌍','Macro','Dollar et volatilité · Yahoo', '',
    '<div class="tuiles">'
    + tuile('DXY', fmtNum(m.dxy_spot,2), ferme ? 'clôture' + (m.dxy_date ? ' du ' + escHtml(m.dxy_date) : '') : 'indice dollar')
    + tuile('VIX', fmtNum(m.vix,1), ferme ? 'clôture' : 'volatilité implicite S&amp;P')
    + '</div>');

  // ── 3. INDICATEURS ──
  let indBody = '';
  const tfLabel = { '4h':'4 h', '1h':'1 h', '1d':'1 j' };
  // S / R / amplitude = min / max des 30 DERNIÈRES bougies du TF (fetch_macro) : 5 j en 4h,
  // 30 h en 1h, 30 j en 1j. L'étiquette disait « 16 j, 100 b. 4h » pour les trois, et le
  // champ s'appelle `range_24h_pct` alors qu'il ne couvre jamais 24 h. Les champs `*_4h`
  // (ema20_4h, death_cross_4h) portent en réalité les valeurs DU TF de la ligne.
  const srH = { '4h': 120, '1h': 30, '1d': 720 };
  const dureeTxt = h => h % 24 === 0 ? (h / 24) + ' j' : h + ' h';
  for (const k of ['4h','1h','1d']) {
    const t = tf[k]; if (!t) continue;
    const fen = dureeTxt(t.sr_window_h || srH[k]);
    indBody += '<div class="tf-row"><div class="tf-tete"><span class="tf-nom">' + (tfLabel[k]||k) + '</span>'
      + '<span class="tf-rsi">RSI&nbsp;<b>' + fmtNum(t.rsi_14,1) + '</b></span>' + rsiMeter(t.rsi_14) + crossTag(t.death_cross_4h) + '</div>'
      // Canal S/R : où le dernier cours se situe entre le support et la résistance de la fenêtre.
      + trackHtml(t.last_close, t.support_30, t.resistance_30, 'S&nbsp;<b>' + fmtUsd(t.support_30) + '</b>', 'R&nbsp;<b>' + fmtUsd(t.resistance_30) + '</b>')
      + '<div class="tf-pied">EMA20 ' + fmtUsd(t.ema20_4h) + ' · EMA50 ' + fmtUsd(t.ema50_4h)
      + ' (écart ' + fmtNum(t.ema_gap_pct,2) + '%) · amplitude ' + fmtNum(t.range_24h_pct,2) + '% (min/max ' + fen + ')</div></div>';
  }
  html += mCard('📈','Indicateurs','Binance 4h/1h/1d · RSI Wilder · bougie en cours incluse', '', indBody);

  // ── 4. MICROSTRUCTURE ──
  // OI : variation sur 24 h GLISSANTES (historique horaire Binance). L'ancien « Δ1j » comparait minuit
  // à minuit : −0,26 % affichés le 04/10 à 11 h pour +1,18 % réels.
  const oi24 = isNum(x.oi_change_24h_pct) ? x.oi_change_24h_pct : x.oi_change_1d_pct;
  // CVD : fenêtré (bougies 5 min Binance). Un fichier de l'ancien format porte le CUMUL du
  // daemon depuis son premier démarrage (des mois de flux) : il n'a pas de sens ici, on ne
  // l'affiche pas comme une lecture du moment.
  const cvdTxt = (v, tb) => '<span class="' + signCls(v) + '">' + fmtSigned(v) + '</span>'
    + (isNum(tb) ? ' <span class="mute">' + fmtNum(tb,1) + '% achat</span>' : '');
  const cvdHtml = isNum(x.cvd_1h_usd)
    ? divergeRows([{ lbl: '1h', v: x.cvd_1h_usd, txt: cvdTxt(x.cvd_1h_usd, x.taker_buy_1h_pct) },
                   { lbl: '4h', v: x.cvd_4h_usd, txt: cvdTxt(x.cvd_4h_usd, x.taker_buy_4h_pct) },
                   { lbl: '24h', v: x.cvd_24h_usd, txt: cvdTxt(x.cvd_24h_usd, x.taker_buy_24h_pct) }])
    : '<div class="fine">— en attente du nouveau format</div>';
  // GEX : USD de delta par mouvement de 1 %, convention calls + / puts −. L'ancien calcul
  // sortait « NEUTRAL » 427 fois sur 427 : il est remplacé, voir options_gex.py.
  let gexHtml;
  if (isNum(x.gex_usd_1pct)) {
    const zg = isNum(x.zero_gamma)
      ? 'zéro γ <b style="color:var(--ink-1)">' + fmtUsd(x.zero_gamma) + '</b> (spot '
        + (x.spot_vs_zero_gamma_pct > 0 ? '+' : '') + fmtNum(x.spot_vs_zero_gamma_pct,1) + '%)'
      : 'zéro γ hors ±15 %';
    gexHtml = '<div class="bloc"><div class="bloc-titre"><span class="ligne"><b>GEX</b> <span class="badge '
      + (x.gex_usd_1pct > 0 ? 'badge-hausser' : 'badge-baissier') + '">' + escHtml(x.gex_state||'—') + '</span></span>'
      + '<span><b class="' + signCls(x.gex_usd_1pct) + '">' + fmtSigned(x.gex_usd_1pct) + '</b> / 1 %</span></div>'
      + axePrix([{ p: x.put_wall, cls: 'put', lbl: 'put' }, { p: x.zero_gamma, cls: 'zg', lbl: '0γ' },
                 { p: x.spot_deribit, cls: 'spot', lbl: 'spot' }, { p: x.call_wall, cls: 'call', lbl: 'call' }])
      + '<div class="fine">' + zg + ' · call wall ' + fmtUsd(x.call_wall) + ' · put wall ' + fmtUsd(x.put_wall)
      + ' · échéances ≤ 7 j ' + fmtSigned(x.gex_0_7j_usd_1pct) + '</div>'
      + '<div class="fine" style="opacity:.85">' + (x.num_options || '—') + ' options Deribit · ' + escHtml(x.gex_convention || '') + '</div></div>';
  } else {
    gexHtml = '<div class="bloc"><b>GEX</b> <span class="fine">— en attente du nouveau format</span></div>';
  }
  const premCls = /NEGATIVE/.test(x.premium_state || '') ? 'badge badge-baissier'
                : /POSITIVE/.test(x.premium_state || '') ? 'badge badge-hausser' : 'badge';
  const oiTxt = isNum(x.oi_btc) ? x.oi_btc.toLocaleString('en-US',{maximumFractionDigits:0}) : '—';
  let microBody = '<div class="tuiles">'
    + tuile('Funding / 8 h', fmtNum(x.funding_rate_pct,4) + '%', fmtNum(x.funding_annual_pct,2) + '% annualisé')
    + tuile('Open interest', oiTxt + ' <span style="font-size:11px;font-weight:600;color:var(--ink-3)">BTC</span>',
            fmtBig(x.oi_usd) + '<div class="ligne" style="margin-top:4px"><span class="' + chipCls(oi24) + '">Δ24h ' + pctSigne(oi24) + '</span>'
            + '<span class="' + chipCls(x.oi_change_5d_pct) + '">Δ5j ' + pctSigne(x.oi_change_5d_pct) + '</span></div>')
    + '</div>'
    + '<div class="bloc"><div class="bloc-titre"><span class="lbl">Comptes long / short</span>'
    + '<span class="fine">L/S&nbsp;<b style="color:var(--ink-1)">' + fmtNum(x.ls_ratio,4) + '</b></span></div>'
    + splitHtml(x.long_pct, x.short_pct, 'Long&nbsp;<b>' + fmtNum(x.long_pct,1) + '%</b>', 'Short&nbsp;<b>' + fmtNum(x.short_pct,1) + '%</b>')
    + '<div class="ligne" style="margin-top:7px"><span class="chip">Top traders ' + fmtNum(x.top_ls_ratio,4) + '</span>'
    + '<span class="chip">Taker B/S ' + fmtNum(x.taker_ratio,4) + '</span></div></div>'
    + '<div class="bloc"><div class="bloc-titre"><span class="lbl">CVD spot</span><span class="fine">achats − ventes au taker</span></div>'
    + cvdHtml + '</div>'
    + gexHtml
    + '<div class="bloc ligne"><span class="lbl">Prime Coinbase</span><b>' + fmtNum(x.premium_pct,4) + '%</b>'
    + '<span class="' + premCls + '"' + (premCls === 'badge' ? ' style="background:var(--rail);color:var(--ink-2)"' : '') + '>' + escHtml(x.premium_state||'—') + '</span>'
    + '<span class="fine">' + (x.us_demand ? 'demande US ✓' : 'pas de demande US') + '</span></div>';
  html += mCard('📡','Microstructure','Binance Futures · Deribit · Coinbase', '', microBody);

  // ── 5. LIQUIDITÉ ──
  // En BTC réels, lus dans le carnet à la publication. L'ancien format sommait des scores
  // d'intensité de heatmap (sans unité) et les présentait comme une « profondeur cumulée ».
  let liqBody;
  if (lq.unit === 'BTC') {
    const bandes = lq.bandes || {};
    const autres = Object.keys(bandes).sort((a, b) => a - b)
      .map(k => '±' + k + ' % : ' + fmtNum(bandes[k].ratio,2)).join(' · ');
    liqBody = '<div class="bloc-titre"><span class="lbl">Carnet ±' + lq.bande_ref_pct + ' %</span>'
      + '<span class="fine">Ratio <b>bid/ask</b> ±' + lq.bande_ref_pct + ' % : <b class="' + (lq.ratio_bid_ask>1?'stat-pos':'stat-neg') + '">'
      + fmtNum(lq.ratio_bid_ask,2) + '</b></span></div>'
      + splitHtml(lq.total_bid, lq.total_ask, 'Bids&nbsp;<b>' + fmtNum(lq.total_bid,1) + ' BTC</b>', 'Asks&nbsp;<b>' + fmtNum(lq.total_ask,1) + ' BTC</b>')
      + '<div class="fine" style="margin-top:4px">' + autres + ' · carnet vu jusqu\'à ±' + fmtNum(lq.couverture_pct,2) + ' %</div>'
      + '<div class="bloc"><div class="bloc-titre"><span class="lbl">Murs</span><span class="fine">BTC posés par tranche de ' + (lq.wall_bin_usd || 20) + ' $</span></div>'
      + ladderHtml(lq.ask_walls, lq.bid_walls, lq.mid) + '</div>'
      + '<div class="fine" style="margin-top:8px">Instantané du carnet à la publication — un mur peut être retiré à tout moment.</div>';
  } else {
    liqBody = '<div class="fine">Format ancien (scores d\'intensité sans unité) — en attente de la prochaine publication.</div>';
  }
  html += mCard('💧','Liquidité','Carnet Binance spot · BTC posés', '', liqBody);

  // ── 6. ÉTAT DU FLUX ──
  const nOk = Object.values(st).filter(v => v === 'ok').length, nTot = Object.keys(st).length || 8;
  const errs = d.errors || [];
  const NOMS_BLOCS = { btc_spot: 'Spot', indicators: 'Indicateurs', macro: 'Macro', micro_futures: 'Futures',
                       cvd: 'CVD', gex: 'GEX', premium: 'Prime', liquidity: 'Carnet' };
  let stBody = '<div class="hero"><span class="hero-val ' + (errs.length ? 'stat-neg' : '') + '" style="font-size:19px">'
    + nOk + '/' + nTot + ' blocs live</span></div>'
    + '<div class="etats">' + Object.entries(st).map(([k, v]) => '<span class="etat' + (v === 'ok' ? '' : ' ko') + '" title="'
      + escHtml(k + ' : ' + v) + '">' + (v === 'ok' ? '✓ ' : '✗ ') + escHtml(NOMS_BLOCS[k] || k) + '</span>').join('') + '</div>'
    + (errs.length ? '<div class="stat-neg" style="margin-top:8px;font-size:11px">' + errs.map(escHtml).join('<br>') + '</div>' : '')
    + '<div class="fine" style="margin-top:8px">' + escHtml(d.generator||'') + '<br>Sources : ' + escHtml(d.source||'—') + '</div>';
  html += mCard('🔌','Flux','Pas d\'erreur silencieuse', '', stBody);
  carteEntree = false;
  if (container.dataset) container.dataset.vu = '1';

  // Le bandeau d'âge voyage AVEC les cartes : il apparaît donc dans le conteneur
  // réellement affiché, quel qu'il soit.
  container.innerHTML = ageBannerHtml(d) + html;
}

// ============ STRATEGY PANEL ============
let forwardRunning = false;
let forwardInterval = null;

function toggleStratPanel() {
  const section = document.getElementById('stratSection');
  section.classList.toggle('collapsed');
  // After transition, resize canvas
  setTimeout(() => { resizeCanvas(); drawChart(); renderStratHelp(); }, 350);
}

function onStratChange() {
  btActiveStrategy = document.getElementById('stratSelect').value;
  btUserParams = {};
  buildStratParamUI();
  onStratParamChange();
}

function onStratParamChange() {
  const stratKey = document.getElementById('stratSelect').value;
  const strat = STRATEGIES[stratKey];
  if (!strat) return;
  btUserParams = {};
  for (const [k, def] of Object.entries(strat.params)) {
    const el = document.getElementById('sp_' + k);
    if (el) {
      const raw = el.value;
      btUserParams[k] = (raw === '' || raw === null) ? 0 : (parseFloat(raw) || def.value);
    }
  }
  btCapital = parseFloat(document.getElementById('stratCapital').value) || ST_DEFAULT_CAPITAL;
  // Clear old results when params change
  btResult = null;
}

// Le select des stratégies vient du REGISTRE : une stratégie enregistrée est sélectionnable,
// sans risque d'oubli (sr_grid était implémentée et auditée depuis le 11/09, mais absente du
// select codé en dur — elle était donc inatteignable).
function fillStrategySelect() {
  const sel = document.getElementById('stratSelect');
  if (!sel) return;
  sel.innerHTML = Object.entries(STRATEGIES)
    .map(([k, s]) => '<option value="' + k + '">' + s.label + '</option>').join('');
  sel.value = btActiveStrategy;
}

// Ce que la grille FERAIT si le signal tombait sur la dernière bougie : bornes, pas, état du
// signal. C'est la réponse à « pourquoi le backtest ne fait rien ? » — la plupart des grilles
// n'entrent QUE sur un signal, donc rien ne se passe tant qu'il n'est pas armé.
function previewGrid() {
  if (!candles || candles.length < 60) return null;
  const strat = STRATEGIES[btActiveStrategy];
  if (!strat || !strat.generateLevels) return null;
  const idx = candles.length - 1;
  const bot = new GridBot(btActiveStrategy, btCapital);
  const params = bot.buildParams(btUserParams);
  const ind = bot.computeIndicators(candles, idx, params);
  let levels;
  try { levels = strat.generateLevels(candles, idx, params, ind) || []; }
  catch (e) { return null; }
  if (levels.length < 2) return null;
  return {
    lo: levels[0].price, hi: levels[levels.length - 1].price, n: levels.length,
    step: levels[1].price - levels[0].price,
    manual: params.priceLow > 0 || params.priceHigh > 0,
    signal: strat.trigger(candles, idx, params, ind),
  };
}

function renderStratHelp() {
  const el = document.getElementById('stratHelp');
  const strat = STRATEGIES[btActiveStrategy];
  if (!el || !strat) return;
  let html = '<b>' + strat.label + '</b> — ' + (STRAT_DESC[btActiveStrategy] || '');
  const p = previewGrid();
  if (!p) {
    html += '<div class="strat-auto">Aperçu de la grille : en attente des bougies…</div>';
  } else {
    const f = v => '$' + v.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
    const sig = p.signal === 'enter' ? '<span class="stat-pos">signal armé</span>'
      : p.signal === 'exit' ? '<span class="stat-neg">signal de sortie</span>'
      : p.signal === 'idle' ? 'signal pas encore armé' : 'pas de signal sur cette bougie';
    const tp = (btUserParams.tpPct !== undefined) ? btUserParams.tpPct : strat.params.tpPct.value;
    const sl = (btUserParams.slPct !== undefined) ? btUserParams.slPct : strat.params.slPct.value;
    html += '<div class="strat-auto">' + (p.manual ? 'Bornes saisies à la main' : 'Auto') + ' : '
      + f(p.lo) + ' → ' + f(p.hi) + ' · ' + p.n + ' niveaux · pas de ' + f(p.step)
      + ' · TP +' + tp + ' % / SL −' + sl + ' % · ' + sig + '</div>';
  }
  el.innerHTML = html;
}

function buildStratParamUI() {
  const stratKey = document.getElementById('stratSelect').value;
  const strat = STRATEGIES[stratKey];
  if (!strat) return;
  const container = document.getElementById('stratParams');
  const isAdvanced = container.classList.contains('advanced');
  let html = '';
  for (const [k, def] of Object.entries(strat.params)) {
    // In simple mode, skip advanced params
    if (!isAdvanced && def.advanced) continue;
    const val = btUserParams[k] !== undefined ? btUserParams[k] : def.value;
    const isAutoField = (k === 'priceLow' || k === 'priceHigh') && (!val || val <= 0);
    const autoClass = isAutoField ? ' auto-mode' : '';
    const placeholder = isAutoField ? ' placeholder="Auto"' : '';
    html += '<div class="strat-row">';
    // `hint` explique le « 0 = auto » (défini par gridParams) : sans lui, un champ grisé
    // « Auto » ne dit pas QUELLE borne la stratégie va choisir.
    html += '<label title="' + (def.hint || def.label || k) + '">' + (def.label || k) + (def.advanced ? ' *' : '') + '</label>';
    html += '<input type="number" id="sp_' + k + '" value="' + (isAutoField ? '' : val) + '" min="' + def.min + '" max="' + def.max + '" step="' + (def.step || 1) + '" onchange="onStratParamChange()" style="width:60px" class="' + autoClass + '"' + placeholder + '>';
    html += '</div>';
  }
  container.innerHTML = html;
  renderStratHelp();
}

function getDateRangeIndices() {
  const fromEl = document.getElementById('stratDateFrom');
  const toEl = document.getElementById('stratDateTo');
  let startIdx = -1, endIdx = -1;
  if (fromEl && fromEl.value) {
    const fromTs = new Date(fromEl.value).getTime() / 1000;
    for (let i = 0; i < candles.length; i++) {
      if (candles[i].time >= fromTs) { startIdx = i; break; }
    }
  }
  if (toEl && toEl.value) {
    const toTs = new Date(toEl.value).getTime() / 1000;
    for (let i = candles.length - 1; i >= 0; i--) {
      if (candles[i].time <= toTs) { endIdx = i; break; }
    }
  }
  return { startIdx, endIdx };
}

function onBacktestClick() {
  const range = getDateRangeIndices();
  let vs, ve;
  if (range.startIdx >= 0 && range.endIdx >= 0) {
    vs = range.startIdx;
    ve = range.endIdx;
  } else {
    vs = Math.max(0, viewStart);
    ve = Math.min(candles.length - 1, viewEnd);
  }
  const result = runBacktest(btActiveStrategy, candles, vs, ve, btUserParams, btCapital);
  if (result && !result.error) {
    showStratStats(result);
    drawChart();
  }
}

function onFullBacktestClick() {
  const result = runFullBacktest();
  if (result && !result.error) {
    showStratStats(result);
  }
}

function onForwardClick() {
  if (forwardRunning) {
    stopForward();
    return;
  }
  startForward();
}

function startForward() {
  if (!btResult) {
    // Run a backtest first to initialize
    const result = runFullBacktest();
    if (result.error) return;
  }
  forwardRunning = true;
  const btn = document.getElementById('stratFwdBtn');
  btn.textContent = '🟢 Forward (arrêter)';
  btn.classList.add('forward');

  // Track the last candle index processed
  let lastProcessedIdx = btResult ? btResult.endIdx : candles.length - 1;

  // L'ancienne boucle exigeait à la fois `candles.length <= dernier + 1` et `> dernier + 1` :
  // son corps ne s'exécutait JAMAIS (et sans bot il aurait planté). Le forward ne jouait rien.
  forwardInterval = setInterval(() => {
    if (!btBot) return;
    // Seules les bougies CLOSES sont jouées : la dernière est en cours.
    const lastClosed = candles.length - 2;
    if (lastClosed <= lastProcessedIdx) return;
    const params = btBot.buildParams(btUserParams);
    for (let i = lastProcessedIdx + 1; i <= lastClosed; i++) {
      btBot.step(candles, i, params, btBot.computeIndicators(candles, i, params));
    }
    lastProcessedIdx = lastClosed;
    if (btResult) {
      const markPrice = candles[lastClosed].close;
      btResult.equityCurve.push({
        idx: lastClosed,
        total: btBot.equity(markPrice),
        realized: btBot.realizedPnl(),
        unrealized: btBot.equity(markPrice) - btCapital - btBot.realizedPnl()
      });
      btResult.trades = [...btBot.trades];
      btResult.totalPnl = btBot.realizedPnl();
      btResult.totalReturn = (btResult.totalPnl / btCapital) * 100;
      btResult.tradeCount = btBot.trades.length;
    }
    drawChart();
    updateForwardStats();
  }, 5000);
}

function stopForward() {
  forwardRunning = false;
  if (forwardInterval) { clearInterval(forwardInterval); forwardInterval = null; }
  const btn = document.getElementById('stratFwdBtn');
  btn.textContent = '🔴 Forward Test';
  btn.classList.remove('forward');
}

function updateForwardStats() {
  if (!btResult) return;
  const div = document.getElementById('stratStats');
  div.style.display = 'block';
  const pnlStr = btResult.totalPnl >= 0 ? '+' + btResult.totalPnl.toFixed(2) : btResult.totalPnl.toFixed(2);
  div.innerHTML =
    '<div>🔄 <b>Forward</b> | Trades: <span class="stat-val">' + btResult.tradeCount + '</span></div>' +
    '<div>P&L live: <span class="' + (btResult.totalPnl >= 0 ? 'stat-pos' : 'stat-neg') + '">' + pnlStr + ' USDT</span></div>' +
    '<div>Return: <span class="' + (btResult.totalReturn >= 0 ? 'stat-pos' : 'stat-neg') + '">' + btResult.totalReturn.toFixed(2) + '%</span></div>';
}

// Durée d'une bougie en minutes : traduit la fenêtre testée en « 8 h » / « 3,2 j ».
const INTERVAL_MIN = { '1m': 1, '5m': 5, '15m': 15, '1h': 60, '4h': 240, '1d': 1440 };

function showStratStats(result) {
  const div = document.getElementById('stratStats');
  div.style.display = 'block';
  const pnlStr = (result.totalPnl >= 0 ? '+' : '') + result.totalPnl.toFixed(2);
  // Verdict : le seul juge qui compte est « garder le BTC » sur la MÊME période. Une grille qui
  // gagne 0,40 % quand le BTC fait 3 % a perdu du terrain, malgré un P&L positif.
  const c0 = candles[result.startIdx], c1 = candles[result.endIdx];
  const hold = (c0 && c1 && c0.close) ? (c1.close - c0.close) / c0.close * 100 : null;
  const ret = result.totalReturn;
  const mins = (result.endIdx - result.startIdx + 1) * (INTERVAL_MIN[chartInterval] || 15);
  const durStr = mins >= 1440 ? (mins / 1440).toFixed(1) + ' j' : mins >= 60 ? (mins / 60).toFixed(1) + ' h' : mins + ' min';
  let html = '';
  if (hold !== null) {
    const v = (ret > 0 && ret > hold) ? ['stat-pos', '✅ gagne et bat le marché']
      : (ret > 0) ? ['stat-val', '⚠️ gagne, mais garder le BTC rapportait plus']
      : (ret > hold) ? ['stat-val', '⚠️ perd, mais moins que le marché']
      : ['stat-neg', '❌ perd alors que garder le BTC montait'];
    html += '<div class="verdict"><span class="' + v[0] + '">' + v[1] + '</span> — '
      + (ret >= 0 ? '+' : '') + ret.toFixed(2) + ' % en ' + durStr + ', BTC '
      + (hold >= 0 ? '+' : '') + hold.toFixed(2) + ' % sur la même période</div>';
  }
  html +=
    '<div>Trades: <span class="stat-val">' + result.tradeCount + '</span> | Win: <span title="Part des trades clôturés en profit" class="' + (result.winRate >= 50 ? 'stat-pos' : 'stat-neg') + '">' + result.winRate.toFixed(1) + '%</span></div>' +
    '<div>P&L: <span title="Profit ou perte en USDT, frais 0,1 % déjà déduits" class="' + (result.totalPnl >= 0 ? 'stat-pos' : 'stat-neg') + '">' + pnlStr + ' USDT</span> (' + (ret >= 0 ? '+' : '') + ret.toFixed(2) + ' %)</div>' +
    '<div>Perte max: <span title="Plus forte baisse depuis un sommet du capital (drawdown)" class="stat-neg">' + result.maxDrawdownPct.toFixed(1) + '%</span> | Sharpe: <span title="Rendement par unité de risque, annualisé. Au-delà de 1 c\'est bon ; sur une fenêtre courte il ne veut rien dire." class="stat-val">' + result.sharpe + '</span></div>' +
    '<div>Gains/pertes: <span title="Total des gains divisé par le total des pertes. Au-dessus de 1, la grille gagne." class="stat-val">' + result.profitFactor + '</span> | Gain moyen: <span title="Gain moyen par trade gagnant" class="stat-pos">' + result.avgWin.toFixed(2) + '</span> | Perte moyenne: <span title="Perte moyenne par trade perdant" class="stat-neg">' + result.avgLoss.toFixed(2) + '</span></div>';
  if (result.tradeCount < 10) html += '<div class="strat-note">' + result.tradeCount + ' trade(s) : trop peu pour conclure — visez 30, ou élargissez la période avec les champs « Du » / « Au ».</div>';
  div.innerHTML = html;
}

function onCompareDumbGrid() {
  if (!candles || candles.length < 20) return;
  const vs = Math.max(0, viewStart);
  const ve = Math.min(candles.length - 1, viewEnd);
  const taResult = runBacktest(btActiveStrategy, candles, vs, ve, btUserParams, btCapital);
  const dumbParams = { priceLow: 0, priceHigh: 0, gridLevels: btUserParams.gridLevels || 10, tpPct: btUserParams.tpPct || 0.5, slPct: btUserParams.slPct || 3 };
  const dumbResult = runBacktest('dumb_grid', candles, vs, ve, dumbParams, btCapital);

  const div = document.getElementById('stratStats');
  div.style.display = 'block';
  div.innerHTML =
    '<div style="margin-bottom:6px;color:var(--accent);font-weight:700">📊 Comparaison TA vs Grille Fixe</div>' +
    '<div><b>' + STRATEGIES[btActiveStrategy].label + '</b>: <span class="' + (taResult.totalPnl >= 0 ? 'stat-pos' : 'stat-neg') + '">' + (taResult.totalPnl >= 0 ? '+' : '') + taResult.totalPnl.toFixed(2) + ' USDT</span> (' + taResult.tradeCount + ' trades, Sharpe ' + taResult.sharpe + ')</div>' +
    '<div><b>Grille Fixe</b>: <span class="' + (dumbResult.totalPnl >= 0 ? 'stat-pos' : 'stat-neg') + '">' + (dumbResult.totalPnl >= 0 ? '+' : '') + dumbResult.totalPnl.toFixed(2) + ' USDT</span> (' + dumbResult.tradeCount + ' trades, Sharpe ' + dumbResult.sharpe + ')</div>' +
    '<div>Delta: <span class="' + ((taResult.totalPnl - dumbResult.totalPnl) >= 0 ? 'stat-pos' : 'stat-neg') + '">' + ((taResult.totalPnl - dumbResult.totalPnl) >= 0 ? '+' : '') + (taResult.totalPnl - dumbResult.totalPnl).toFixed(2) + ' USDT</span></div>';
  btResult = taResult;
  btBot = taResult.bot;
  drawChart();
}

function toggleAdvanced() {
  const container = document.getElementById('stratParams');
  const toggle = document.getElementById('advToggle');
  if (container.classList.contains('advanced')) {
    container.classList.remove('advanced');
    toggle.textContent = '⚙ Mode avancé ▸';
  } else {
    container.classList.add('advanced');
    toggle.textContent = '⚙ Mode simple ▸';
  }
  buildStratParamUI();
}

// Build initial param UI on load
setTimeout(() => { fillStrategySelect(); buildStratParamUI(); }, 100);

// ============ WALK-FORWARD ANALYSIS ============
function runWalkForward(strategyKey, candles, userParams, capital, segments) {
  segments = segments || 3;
  if (candles.length < 60) return { error: 'Pas assez de bougies (min 60)' };
  const segSize = Math.floor(candles.length / segments);
  const results = [];

  for (let s = 0; s < segments; s++) {
    const inStart = s * segSize;
    const inEnd = (s + 1) * segSize - 1;
    const outStart = inEnd + 1;
    const outEnd = Math.min(candles.length - 1, outStart + segSize - 1);

    if (outStart >= candles.length) break;

    // In-sample: optimize params (simple grid search on one param for now)
    const inSample = runBacktest(strategyKey, candles, inStart, inEnd, userParams, capital);
    // Out-sample: test with same params
    const outSample = runBacktest(strategyKey, candles, outStart, outEnd, userParams, capital);

    results.push({
      segment: s + 1,
      inSample: { startIdx: inStart, endIdx: inEnd, trades: inSample.tradeCount, return: inSample.totalReturn, sharpe: parseFloat(inSample.sharpe), maxDD: inSample.maxDrawdownPct },
      outSample: { startIdx: outStart, endIdx: outEnd, trades: outSample.tradeCount, return: outSample.totalReturn, sharpe: parseFloat(outSample.sharpe), maxDD: outSample.maxDrawdownPct }
    });
  }

  // Compute degradation ratio
  let avgInSharpe = 0, avgOutSharpe = 0;
  let count = 0;
  for (const r of results) {
    if (!isNaN(r.inSample.sharpe) && !isNaN(r.outSample.sharpe)) {
      avgInSharpe += r.inSample.sharpe;
      avgOutSharpe += r.outSample.sharpe;
      count++;
    }
  }
  avgInSharpe = count > 0 ? avgInSharpe / count : 0;
  avgOutSharpe = count > 0 ? avgOutSharpe / count : 0;
  const degradationRatio = avgInSharpe > 0 ? avgOutSharpe / avgInSharpe : 0;

  // Sensitivity: vary gridLevels ±20%
  const sensResults = [];
  if (userParams.gridLevels) {
    const base = userParams.gridLevels;
    for (const mult of [0.8, 0.9, 1.0, 1.1, 1.2]) {
      const modParams = { ...userParams, gridLevels: Math.round(base * mult) };
      const r = runBacktest(strategyKey, candles, 0, candles.length - 1, modParams, capital);
      sensResults.push({ param: 'gridLevels', value: Math.round(base * mult), return: r.totalReturn, sharpe: parseFloat(r.sharpe) });
    }
  }

  return {
    strategy: strategyKey,
    segments: results,
    degradationRatio: degradationRatio,
    sensitivity: sensResults,
    interpretation: degradationRatio < 0.5 ? '⚠️ Overfit probable (ratio < 0.5)' :
                    degradationRatio < 0.7 ? '⚠️ Faible robustesse' :
                    degradationRatio < 0.9 ? '✅ Correct' : '✅ Robuste'
  };
}

function showWalkForward() {
  if (!candles || candles.length < 60) return;
  const wf = runWalkForward(btActiveStrategy, candles, btUserParams, btCapital, 3);

  const div = document.getElementById('stratStats');
  div.style.display = 'block';
  let html = '<div style="color:var(--accent);font-weight:700;margin-bottom:6px">🔬 Walk-Forward (' + wf.segments.length + ' segments)</div>';

  for (const seg of wf.segments) {
    html += '<div style="margin-bottom:4px;font-size:10px">';
    html += '<b>S' + seg.segment + '</b> In: <span class="stat-val">' + seg.inSample.return.toFixed(2) + '%</span> (Sharpe ' + seg.inSample.sharpe.toFixed(2) + ') ';
    html += '→ Out: <span class="' + (seg.outSample.return >= 0 ? 'stat-pos' : 'stat-neg') + '">' + seg.outSample.return.toFixed(2) + '%</span> (Sharpe ' + seg.outSample.sharpe.toFixed(2) + ')';
    html += '</div>';
  }

  html += '<div style="margin-top:6px"><b>Degradation Ratio:</b> <span class="' + (wf.degradationRatio >= 0.7 ? 'stat-pos' : 'stat-neg') + '">' + wf.degradationRatio.toFixed(3) + '</span></div>';
  html += '<div style="font-size:10px;color:var(--ink-2)">' + wf.interpretation + '</div>';

  // Sensitivity
  if (wf.sensitivity && wf.sensitivity.length > 0) {
    html += '<div style="margin-top:6px;font-size:10px"><b>Sensibilité gridLevels ±20%:</b></div>';
    for (const s of wf.sensitivity) {
      html += '<span style="margin-right:8px">' + s.value + ': <span class="' + (s.return >= 0 ? 'stat-pos' : 'stat-neg') + '">' + s.return.toFixed(2) + '%</span></span>';
    }
  }

  div.innerHTML = html;
}
async function init() {
  lireJetons(); jetonsLus = true;
  peindrePastilles();
  resizeCanvas();
  await fetchPrice();
  await fetchKlines();
  viewStart = Math.max(0, candles.length - 50);
  viewEnd = candles.length;
  drawChart();
  verreDuTheme();          // hyalite n'arrive qu'APRÈS le premier dessin, et seulement si le thème le veut
  await fetchMarket();
  // Pre-fetch des TF de reference S/R : no-op si l'overlay est eteint, c'est le toggle qui declenche.
  await refreshRefSR();
  toggleDepth(overlays.liq);
  // Onglet caché = aucune requête. La page restait ouverte en arrière-plan toute la journée
  // en interrogeant Binance chaque seconde ; au retour, tout est rafraîchi d'un coup.
  const visible = fn => () => { if (!document.hidden) return fn(); };
  setInterval(visible(fetchPrice), 1000);
  setInterval(visible(async () => { await fetchKlines(); drawChart(); }), 5000);
  setInterval(visible(fetchMarket), 60000);
  // Refresh S/R ref TFs every 60s
  setInterval(visible(refreshRefSR), 60000);
  document.addEventListener('visibilitychange', async () => {
    if (document.hidden) return;
    fetchPrice(); fetchMarket();
    if (overlays.liq) fetchHeatmap();
    await fetchKlines(); drawChart();
  });
  // Taskbar clock
  setInterval(() => {
    const c = document.getElementById('taskbarClock');
    if (c) c.textContent = new Date().toLocaleTimeString('fr-FR');
  }, 1000);
}
init();
