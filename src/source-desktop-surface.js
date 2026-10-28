import { createSourceDesktopEnvelopeGate, createSourceDesktopView, SOURCE_DESKTOP_PROTOCOL } from './render/source-desktop-view.js';
import './source-desktop-surface.css';
import {createSourceDesktopPaintWitness} from './game/source-desktop-focus.js';

const canvas = document.getElementById('source-desktop');
const gate = createSourceDesktopEnvelopeGate();
const view = createSourceDesktopView({ canvas, onError: reportError });
let pending = null, ready = false, unlisten = null, disposed = false;
const native = !!globalThis.window?.__TAURI_INTERNALS__;
let emit = async () => {};
const paintWitness=createSourceDesktopPaintWitness({emit:payload=>emit('source-desktop:presented',payload)});

function reportError(error) {
  document.documentElement.dataset.renderError = String(error?.message || error);
  void emit('source-desktop:error', { label:'source-desktop', protocol:SOURCE_DESKTOP_PROTOCOL,
    message:String(error?.message || error) });
}

function size() {
  view.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1);
}
async function accept(envelope) {
  const snapshot = gate.accept(envelope);
  if (!snapshot || disposed) return false;
  paintWitness.stage(snapshot);
  pending = snapshot;
  if (!ready) return false;
  size();
  const rendered = view.update(snapshot);
  if (rendered) await paintWitness.present(snapshot);
  return rendered;
}
const observer = new ResizeObserver(size); observer.observe(document.documentElement);
window.addEventListener('resize', size, { passive: true });
window.addEventListener('source-desktop:state', event => { void accept(event.detail); });
window.__sourceDesktopSurface = { accept, debug: () => ({ ...view.debug(), protocol: SOURCE_DESKTOP_PROTOCOL, gate: gate.debug() }) };

async function start() {
  if (native) {
    const events = await import('@tauri-apps/api/event'); emit = events.emit;
    unlisten = await events.listen('source-desktop:state', event => { void accept(event.payload); });
  }
  await view.ready; if (disposed) return;
  ready = true; size();
  await emit('source-desktop:ready', { label: 'source-desktop', protocol: SOURCE_DESKTOP_PROTOCOL });
  if (pending) {
    const rendered = view.update(pending);
    if (rendered) await paintWitness.present(pending);
  }
}
void start().catch(reportError);
window.addEventListener('pagehide', () => { disposed = true;paintWitness.close();observer.disconnect(); unlisten?.(); view.dispose(); }, { once: true });
