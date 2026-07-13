import {
  DESIGNED_VIEWPORT,
  MINIMUM_VIEWPORT,
  applyStageLayout,
  computeStageLayout,
  isViewportTooSmall,
} from './display-policy.js';
import { IS_TAURI } from './paths.js';

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
body.pause-open{cursor:default;}
body.desktop-game-mode{cursor:none;background:#000;}
body.desktop-game-mode #wrap{box-shadow:0 0 0 1px rgba(112,255,230,.08),0 0 48px rgba(112,255,230,.08);}
body.viewport-too-small #wrap{filter:brightness(.74) saturate(.88);}
.viewport-fault{position:fixed;inset:0;z-index:99999;display:grid;place-items:center;background:rgba(0,8,7,.86);color:var(--vfd-cyan,#70ffe6);font-family:var(--vfd-font,"Courier New",monospace);pointer-events:auto;letter-spacing:.08em;text-transform:uppercase;}
.viewport-fault[hidden]{display:none;}
.viewport-fault__panel{width:min(720px,calc(100vw - 48px));border:1px solid rgba(112,255,230,.35);background:rgba(3,14,12,.92);padding:28px;box-shadow:0 0 28px rgba(112,255,230,.12),inset 0 0 32px rgba(112,255,230,.06);}
.viewport-fault__kicker{opacity:.62;margin-bottom:12px;font-size:13px;}
.viewport-fault__title{font-size:24px;margin-bottom:18px;text-shadow:0 0 10px currentColor;}
.viewport-fault__body,.viewport-fault__hint{opacity:.82;line-height:1.5;}
.viewport-fault__hint{margin-top:14px;color:#ffb74a;}
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
  el.className = 'viewport-fault';
  el.hidden = true;
  el.innerHTML = `
    <div class="viewport-fault__panel" role="status" aria-live="polite">
      <div class="viewport-fault__kicker">AUDIOCORP DISPLAY FAULT</div>
      <div class="viewport-fault__title">VIEWPORT BELOW SAFE SIZE</div>
      <div class="viewport-fault__body">Minimum safe signal frame: ${MINIMUM_VIEWPORT.width}×${MINIMUM_VIEWPORT.height}</div>
      <div class="viewport-fault__hint">Use fullscreen or a larger display.</div>
    </div>
  `;
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
