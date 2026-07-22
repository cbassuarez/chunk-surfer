import {
  DESIGNED_VIEWPORT,
  MINIMUM_VIEWPORT,
  applyStageLayout,
  computeStageLayout,
  isViewportTooSmall,
} from './display-policy.js';
import { IS_TAURI } from './paths.js';
import { applyVfdDomTheme } from '../render/vfd-dom.js';

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
        <div class="viewport-fault__title cs-machine-phosphor">VIEWPORT BELOW SAFE SIZE</div>
        <div class="viewport-fault__body">MINIMUM SAFE SIGNAL FRAME&nbsp;&nbsp;${MINIMUM_VIEWPORT.width} × ${MINIMUM_VIEWPORT.height}</div>
        <div class="viewport-fault__hint cs-machine-danger">USE FULLSCREEN OR A LARGER DISPLAY.</div>
      </div>
      <footer class="cs-machine-footer"><span>SIGNAL FRAME HOLD</span><span>RESTORES AUTOMATICALLY</span></footer>
    </section>
  `;
  applyVfdDomTheme(el, 'amber');
  doc.body.appendChild(el);
  return el;
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
