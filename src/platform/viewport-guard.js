import {
  DESIGNED_VIEWPORT,
  MINIMUM_VIEWPORT,
  applyStageLayout,
  computeStageLayout,
  isViewportTooSmall,
} from './display-policy.js';
import { IS_TAURI } from './paths.js';
import { applyVfdDomTheme } from '../render/vfd-dom.js';
import { drawElectronicText, measureElectronicText } from '../render/electronic-text.js';

let styleInstalled = false;
let lastLayout = null;

function installViewportStyle(doc) {
  if (styleInstalled || !doc?.head) return;
  styleInstalled = true;
  const style = doc.createElement('style');
  style.dataset.viewportStageStyle = 'true';
  style.textContent = `
:root{--designed-w:${DESIGNED_VIEWPORT.width}px;--designed-h:${DESIGNED_VIEWPORT.height}px;--minimum-w:${MINIMUM_VIEWPORT.width}px;--minimum-h:${MINIMUM_VIEWPORT.height}px;--ui-scale:1;--stage-scale:1;--stage-left:0px;--stage-top:0px;--stage-rendered-w:var(--designed-w);--stage-rendered-h:var(--designed-h);}
html,body{width:100%;height:100%;margin:0;overflow:hidden;background:#000807;}
body{min-width:0!important;min-height:0!important;}
#wrap{position:absolute!important;left:var(--stage-left)!important;top:var(--stage-top)!important;width:var(--designed-w)!important;height:var(--designed-h)!important;min-width:0!important;min-height:0!important;max-width:none!important;max-height:none!important;transform:scale(var(--stage-scale));transform-origin:top left!important;overflow:hidden!important;background:#000807;box-sizing:border-box;}
#map{width:100%!important;height:100%!important;overflow:hidden!important;box-sizing:border-box;}
body.stage-scaled-down #wrap{image-rendering:auto;}
body.stage-scaled-up #wrap{image-rendering:auto;}
body.desktop-game-mode{background:#000;}
body.cursor-captured,body.cursor-captured #wrap,body.cursor-captured #map{cursor:none;}
body.cursor-ui,body.cursor-ui #wrap,body.cursor-ui #map,body.pause-open,body.title-screen,body.god-menu-open{cursor:default;}
body.desktop-game-mode #wrap{box-shadow:0 0 0 1px rgba(112,255,230,.08),0 0 48px rgba(112,255,230,.08);}
body.viewport-too-small #wrap{filter:brightness(.74) saturate(.88);}
.viewport-fault{z-index:99999;}
.viewport-fault[hidden]{display:none;}
.viewport-fault__panel{width:min(680px,calc(100vw - 20px));max-height:calc(100vh - 20px);min-height:min(330px,calc(100vh - 20px));}
.viewport-fault__glass{display:grid;align-content:center;gap:clamp(10px,2vh,18px);padding:clamp(18px,4vw,36px);}
.viewport-fault__title{font-size:clamp(17px,3.1vw,28px);font-weight:700;line-height:1.1;letter-spacing:0;}
.viewport-fault__body,.viewport-fault__hint{font-size:clamp(11px,1.6vw,14px);line-height:1.5;}
.viewport-fault__body{color:var(--cs-vfd-silkscreen);}
.viewport-fault__hint{color:var(--cs-vfd-danger);font-weight:700;filter:brightness(var(--cs-vfd-brightness));}
.viewport-fault [data-fault-readout]{position:relative;overflow:visible;text-shadow:none;filter:brightness(var(--cs-vfd-brightness));}
.viewport-fault.cs-machine-overlay .cs-machine-header__source strong{color:var(--cs-vfd-silkscreen);filter:none;text-shadow:none;animation:none;}
.viewport-fault__display{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;}
.viewport-fault__glass[data-electronic-painted=true] .viewport-fault__accessible{opacity:0;}
.viewport-fault__glass:not([data-electronic-painted=true]){background:#d8d3be;color:#292b24;box-shadow:none;}
.viewport-fault__glass:not([data-electronic-painted=true]):before,.viewport-fault__glass:not([data-electronic-painted=true]):after{display:none;}
.viewport-fault__glass:not([data-electronic-painted=true]) [data-fault-readout]{color:#292b24;filter:none;text-shadow:none;}
.viewport-fault__glass:not([data-electronic-painted=true]) .viewport-fault__display{visibility:hidden;}
@media (max-height:360px){.viewport-fault__panel{min-height:calc(100vh - 16px)}.viewport-fault__glass{padding-top:12px;padding-bottom:12px;gap:8px}.viewport-fault__hint{display:none}}
`;
  doc.head.appendChild(style);
}

export function ensureViewportFaultOverlay(doc = globalThis.document) {
  if (!doc?.body) return null;
  installViewportStyle(doc);

  let el = doc.querySelector('[data-viewport-fault]');
  if (el) return el;

  el = doc.createElement('div');
  el.dataset.viewportFault = 'true';
  el.className = 'viewport-fault cs-machine-overlay';
  el.hidden = true;
  el.innerHTML = `
    <section class="viewport-fault__panel cs-machine-panel" role="status" aria-live="polite">
      <header class="cs-machine-header">
        <div class="cs-machine-header__identity"><span class="cs-machine-wordmark">AUDIOCORP</span><span>DISPLAY FAULT</span></div>
        <div class="cs-machine-header__source"><span>SOURCE</span><strong>VIEWPORT</strong></div>
      </header>
      <div class="viewport-fault__glass cs-machine-glass">
        <div class="viewport-fault__title cs-machine-phosphor" data-fault-readout="phosphor"><span class="viewport-fault__accessible">VIEWPORT BELOW SAFE SIZE</span></div>
        <div class="viewport-fault__body" data-fault-readout="counter"><span class="viewport-fault__accessible">MINIMUM SAFE SIGNAL FRAME&nbsp;&nbsp;${MINIMUM_VIEWPORT.width} × ${MINIMUM_VIEWPORT.height}</span></div>
        <div class="viewport-fault__hint cs-machine-danger" data-fault-readout="danger"><span class="viewport-fault__accessible">USE FULLSCREEN OR A LARGER DISPLAY.</span></div>
      </div>
      <footer class="cs-machine-footer"><span>SIGNAL FRAME HOLD</span><span>RESTORES AUTOMATICALLY</span></footer>
    </section>
  `;
  applyVfdDomTheme(el, 'amber');
  doc.body.appendChild(el);
  return el;
}

// Wrapping is measured by the display ROM, not by the invisible accessible
// browser text. Extremely narrow frames can split words without clipping.
export function viewportFaultTextRows(text, width, fontSize) {
  const rows = [], words = String(text).trim().split(/\s+/);
  let row = '';
  for (const word of words) {
    if (measureElectronicText(row ? `${row} ${word}` : word, { fontSize }) <= width) {
      row = row ? `${row} ${word}` : word;
      continue;
    }
    if (row) { rows.push(row); row = ''; }
    for (const character of word) {
      if (row && measureElectronicText(row + character, { fontSize }) > width) {
        rows.push(row); row = '';
      }
      row += character;
    }
  }
  if (row) rows.push(row);
  return rows;
}

export function paintViewportFaultReadout(overlay, { window: win = globalThis.window } = {}) {
  if (overlay?.hidden || !win?.getComputedStyle) return false;
  const glass = overlay?.querySelector?.('.viewport-fault__glass');
  if (!glass) return false;
  const theme = applyVfdDomTheme(overlay, 'amber'), dpr = Math.max(1, win.devicePixelRatio || 1);
  let painted = 0;
  for (const node of glass.querySelectorAll('[data-fault-readout]')) {
    const style = win.getComputedStyle(node);
    if (!node.clientWidth || style.display === 'none') continue;
    const accessible = node.querySelector('.viewport-fault__accessible');
    let canvas = node.querySelector('canvas');
    if (!canvas) {
      canvas = node.ownerDocument.createElement('canvas');
      canvas.className = 'viewport-fault__display'; canvas.setAttribute('aria-hidden', 'true');
      node.appendChild(canvas);
    }
    const ctx = canvas.getContext?.('2d');
    if (!ctx) { delete glass.dataset.electronicPainted; return false; }
    const fontSize = parseFloat(style.fontSize) || 14;
    const leading = Math.max(fontSize * 1.3, parseFloat(style.lineHeight) || 0);
    // Leave phosphor halation breathing room at both sides of the aperture.
    const inset = Math.min(4, node.clientWidth / 8), width = node.clientWidth - inset * 2;
    const rows = viewportFaultTextRows(accessible.textContent, width, fontSize);
    const height = Math.ceil(rows.length * leading);
    node.style.height = `${height}px`;
    canvas.width = Math.round(node.clientWidth * dpr); canvas.height = Math.round(height * dpr);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let index = 0; index < rows.length; index++) drawElectronicText(ctx, rows[index], inset * dpr,
      (index * leading + leading / 2) * dpr, { fontSize: fontSize * dpr, mode: 'vfd',
        color: theme.variables[`--cs-vfd-${node.dataset.faultReadout}`], dpr, maxWidth: width * dpr });
    painted++;
  }
  if (painted) glass.dataset.electronicPainted = 'true';
  return painted > 0;
}

export function applyCurrentStageLayout(options = {}) {
  const win = options.window || globalThis.window;
  const doc = options.document || globalThis.document;
  if (!win || !doc?.documentElement) return null;
  installViewportStyle(doc);

  const layout = computeStageLayout(win.innerWidth, win.innerHeight, {
    allowUpscale: options.allowUpscale !== false,
  });
  applyStageLayout(layout, doc.documentElement);
  doc.body?.classList?.toggle('stage-scaled-down', layout.scaledDown);
  doc.body?.classList?.toggle('stage-scaled-up', layout.scaledUp);
  lastLayout = layout;
  return layout;
}

export function currentStageLayout() {
  return lastLayout;
}

export function installViewportGuard(options = {}) {
  const win = options.window || globalThis.window;
  const doc = options.document || globalThis.document;
  if (!win || !doc?.body) return () => false;

  const min = options.minimum || MINIMUM_VIEWPORT;
  const overlay = ensureViewportFaultOverlay(doc);
  let frame = 0;

  const runUpdate = () => {
    frame = 0;
    applyVfdDomTheme(overlay, 'amber');
    applyCurrentStageLayout({ window: win, document: doc, allowUpscale: options.allowUpscale !== false });
    const tooSmall = isViewportTooSmall(win.innerWidth, win.innerHeight, min);
    doc.body.classList.toggle('viewport-too-small', tooSmall);
    // Desktop windows are clamped/adaptively scaled. Keep the fault overlay as
    // a web-only escape hatch for genuinely tiny browser viewports.
    if (overlay) overlay.hidden = IS_TAURI || !tooSmall;
    if (overlay && !overlay.hidden) paintViewportFaultReadout(overlay, { window: win });
    return lastLayout;
  };

  const update = () => {
    if (frame) win.cancelAnimationFrame?.(frame);
    if (typeof win.requestAnimationFrame === 'function') {
      frame = win.requestAnimationFrame(runUpdate) || 0;
      return lastLayout;
    }
    return runUpdate();
  };

  update();
  win.addEventListener?.('resize', update);
  win.addEventListener?.('orientationchange', update);
  doc.addEventListener?.('fullscreenchange', update);
  doc.addEventListener?.('visibilitychange', update);
  win.addEventListener?.('focus', update);

  return () => {
    if (frame) win.cancelAnimationFrame?.(frame);
    win.removeEventListener?.('resize', update);
    win.removeEventListener?.('orientationchange', update);
    doc.removeEventListener?.('fullscreenchange', update);
    doc.removeEventListener?.('visibilitychange', update);
    win.removeEventListener?.('focus', update);
  };
}
