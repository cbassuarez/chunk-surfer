import * as scenes from './scenes.js';
import {
  BUTTON_POSITIONS,
  controllerDiagramModel,
} from './controller-ui.js';
import {
  controllerActionLabel,
  controllerButtonLabel,
  controllerSettings,
  activeInputPromptDevice,
  promptLine,
  resetControllerSettings,
  setControllerBinding,
} from './bindings.js';

function esc(text) {
  return String(text ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

function svgButton(button) {
  const p = button.pos;
  const cls = `cs-pad-button${button.active ? ' is-active' : ''}${button.captureTarget ? ' is-capture' : ''}`;
  const label = esc(button.label);
  if ('r' in p) {
    return `<g class="${cls}" data-button="${esc(button.id)}"><circle cx="${p.x}" cy="${p.y}" r="${p.r}"/><text x="${p.x}" y="${p.y + 1.4}">${label}</text></g>`;
  }
  return `<g class="${cls}" data-button="${esc(button.id)}"><rect x="${p.x - p.w / 2}" y="${p.y - p.h / 2}" width="${p.w}" height="${p.h}" rx="2"/><text x="${p.x}" y="${p.y + 1.4}">${label}</text></g>`;
}

export function renderControllerOverlayHtml(model, { padName = 'NO CONTROLLER' } = {}) {
  const actions = model.actions.map((action) => `
    <button class="cs-controller-action${action.selected ? ' is-selected' : ''}${action.capturing ? ' is-capturing' : ''}" data-action="${esc(action.id)}" type="button">
      <span class="cs-controller-action-group">${esc(action.group)}</span>
      <span class="cs-controller-action-label">${esc(action.label)}</span>
      <span class="cs-controller-action-binding">${esc(action.capturing ? 'PRESS ANY BUTTON' : action.bindingLabel)}</span>
    </button>
  `).join('');
  const buttons = model.buttons.map(svgButton).join('');
  const capture = model.captureAction ? `CAPTURING ${controllerActionLabel(model.captureAction)}` : 'SELECT ACTION TO REMAP';
  const footer = activeInputPromptDevice() === 'controller'
    ? promptLine([{ action: 'select', label: 'ACTION' }, { action: 'confirm', label: 'REMAP' }, { action: 'back', label: 'BACK' }])
    : '[UP / DOWN] ACTION · [ENTER / SPACE] REMAP · [R] RESET · [ESC] BACK';
  return `
    <div class="cs-controller-panel ${model.mode === 'stacked' ? 'is-stacked' : 'is-split'}">
      <header class="cs-controller-header">
        <div>
          <div class="cs-controller-eyebrow">AUDIOCORP INPUT SERVICE</div>
          <h1>Controller Setup</h1>
        </div>
        <div class="cs-controller-status">
          <span>${esc(padName || 'NO CONTROLLER')}</span>
          <strong>${esc(model.family.toUpperCase())}</strong>
        </div>
      </header>
      <main class="cs-controller-main">
        <section class="cs-controller-diagram" aria-label="Controller diagram">
          <svg viewBox="0 0 100 86" role="img" aria-label="Controller map">
            <path class="cs-pad-shell" d="M18 33 C23 21 36 27 43 30 L57 30 C64 27 77 21 82 33 C88 47 91 67 82 72 C76 76 68 65 61 62 L39 62 C32 65 24 76 18 72 C9 67 12 47 18 33 Z"/>
            <rect class="cs-pad-touch" x="42" y="34" width="16" height="7" rx="3"/>
            <path class="cs-pad-dpad" d="M24 43 h5 v6 h6 v5 h-6 v6 h-5 v-6 h-6 v-5 h6 z"/>
            ${buttons}
          </svg>
          <div class="cs-controller-capture">${esc(capture)}</div>
        </section>
        <section class="cs-controller-actions" aria-label="Controller actions">
          ${actions}
        </section>
      </main>
      <footer class="cs-controller-footer">
        ${footer.split(' · ').map((part) => `<span>${esc(part)}</span>`).join('')}
      </footer>
    </div>
  `;
}

export function makeControllerSettingsScene({
  onSave,
  onClose,
  beginControllerRemap,
  cancelControllerRemap,
  controllerRemapAction,
  getPadName = () => 'NO CONTROLLER',
  getWindowSize = () => ({ width: globalThis.window?.innerWidth || 960, height: globalThis.window?.innerHeight || 540 }),
} = {}) {
  let selected = 0;
  let captureAction = null;
  let host = null;

  function currentAction() {
    return controllerDiagramModel({ settings: controllerSettings() }).actions[selected]?.id || 'interact';
  }

  function save() {
    onSave?.(controllerSettings());
  }

  function close() {
    scenes.remove(scene);
    onClose?.();
  }

  function beginCapture() {
    captureAction = currentAction();
    beginControllerRemap?.(captureAction, (token) => bindToken(token));
  }

  function move(delta) {
    const model = controllerDiagramModel({ settings: controllerSettings() });
    selected = (selected + delta + model.actions.length) % model.actions.length;
    captureAction = null;
    cancelControllerRemap?.();
    renderHtml();
  }

  function bindToken(token) {
    if (!captureAction) return false;
    const ok = setControllerBinding(captureAction, token);
    captureAction = null;
    if (ok) save();
    renderHtml();
    return ok;
  }

  function model() {
    const { width, height } = getWindowSize();
    return controllerDiagramModel({
      width,
      height,
      settings: controllerSettings(),
      selectedAction: currentAction(),
      captureAction,
      padName: getPadName(),
    });
  }

  function renderHtml() {
    if (!host) return;
    host.innerHTML = renderControllerOverlayHtml(model(), { padName: getPadName() });
  }

  const scene = {
    id: 'controller-settings',
    blocksInput: true,
    blocksWorld: true,
    lensPreset: 'calm',

    enter() {
      const doc = globalThis.document;
      if (!doc?.body) return;
      host = doc.createElement('div');
      host.className = 'cs-controller-overlay';
      host.setAttribute('role', 'dialog');
      host.setAttribute('aria-modal', 'true');
      doc.body.appendChild(host);
      renderHtml();
    },

    exit() {
      host?.remove?.();
      host = null;
      captureAction = null;
      cancelControllerRemap?.();
    },

    key(e = {}) {
      const raw = e.key || '';
      const code = e.code || '';
      const k = raw.toLowerCase();
      if (captureAction) {
        if (raw === 'Escape' || code === 'Escape' || raw === 'Backspace' || code === 'Backspace') {
          captureAction = null;
          cancelControllerRemap?.();
          renderHtml();
        }
        return true;
      }
      if (raw === 'ArrowUp' || k === 'w' || code === 'KeyW') { move(-1); return true; }
      if (raw === 'ArrowDown' || k === 's' || code === 'KeyS') { move(1); return true; }
      if (raw === 'Enter' || code === 'Enter' || raw === ' ' || code === 'Space' || k === 'z' || code === 'KeyZ') { beginCapture(); renderHtml(); return true; }
      if (raw === 'r' || raw === 'R' || code === 'KeyR') { resetControllerSettings(); save(); captureAction = null; cancelControllerRemap?.(); renderHtml(); return true; }
      if (raw === 'Escape' || code === 'Escape' || raw === 'Backspace' || code === 'Backspace') { close(); return true; }
      return true;
    },

    controllerCapture(token) {
      return bindToken(token);
    },

    pointer(e = {}) {
      if (e.type !== 'pointerdown') return true;
      const target = globalThis.document?.elementFromPoint?.(e.clientX, e.clientY);
      const action = target?.closest?.('[data-action]')?.dataset?.action;
      if (!action) return true;
      const modelActions = model().actions;
      const at = modelActions.findIndex((entry) => entry.id === action);
      if (at >= 0) selected = at;
      beginCapture();
      renderHtml();
      return true;
    },

    update() {
      if (captureAction && typeof controllerRemapAction === 'function' && controllerRemapAction() !== captureAction) captureAction = null;
      renderHtml();
    },
    render() {},
    view() {
      const m = model();
      return {
        id: 'controller-settings',
        selected: currentAction(),
        captureAction,
        activeButton: m.activeButton,
        mode: m.mode,
        family: m.family,
        selectedBindingLabel: controllerButtonLabel(m.activeButton, m.family),
        buttonCount: Object.keys(BUTTON_POSITIONS).length,
      };
    },
  };

  return scene;
}
