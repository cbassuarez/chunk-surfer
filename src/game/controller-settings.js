import * as scenes from './scenes.js';
import { uiFill, uiScrim, uiSize, uiText } from '../render/ui.js';
import { drawMachinePanel } from '../render/presentation.js';
import { drawPadDiagram } from '../render/pad-diagram.js';
import { drawVfdRow, vfdBlinkOn, vfdRowStyle } from '../render/vfd-select.js';
import { activeTheme } from '../render/palette.js';
import { createHitRegions } from '../render/hit-regions.js';
import {
  BUTTON_POSITIONS,
  controllerDiagramModel,
} from './controller-ui.js';
import {
  controllerActionLabel,
  controllerButtonLabel,
  controllerSettings,
  cycleControllerFamily,
  activeInputPromptDevice,
  promptLine,
  resetControllerSettings,
  setControllerBinding,
} from './bindings.js';

export function makeControllerSettingsScene({
  getControllerSnapshot = null,
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
  const hits = createHitRegions();

  // The cursor runs over the pad options and the bindings as one list, so the
  // option rows are reachable with the same up/down the rest of the screen uses.
  // The row SET does not depend on which row is selected, so this must not go
  // through model() — that reads currentAction(), which reads this, and the
  // screen would recurse until the stack gave out. It does need the pad name:
  // without it every binding label falls back to the generic family while the
  // header shows the real pad.
  function rowsModel() {
    return controllerDiagramModel({
      settings: controllerSettings(),
      padName: getPadName(),
    });
  }

  function list(base = rowsModel()) {
    return [...base.options, ...base.actions];
  }

  function currentRow() {
    const all = list();
    return all[Math.min(selected, all.length - 1)] || all[0];
  }

  function currentAction() {
    const row = currentRow();
    return row?.kind === 'option' ? row.id : (row?.id || 'interact');
  }

  function save() {
    onSave?.(controllerSettings());
  }

  function close() {
    scenes.remove(scene);
    onClose?.();
  }

  function beginCapture() {
    // Option rows have nothing to capture — activating one adjusts it instead.
    if (currentRow()?.kind === 'option') { adjust(1); return; }
    captureAction = currentAction();
    beginControllerRemap?.(captureAction, (token) => bindToken(token));
  }

  function adjust(delta) {
    if (currentRow()?.kind !== 'option') return false;
    cycleControllerFamily(delta);
    save();
    return true;
  }

  function move(delta) {
    const total = list().length;
    selected = (selected + delta + total) % total;
    captureAction = null;
    cancelControllerRemap?.();
  }

  function bindToken(token) {
    if (!captureAction) return false;
    const ok = setControllerBinding(captureAction, token);
    captureAction = null;
    if (ok) save();
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
      // Live hardware, read fresh every render: pressed buttons light and the
      // sticks deflect, so this screen is also the pad diagnostic.
      heldButtons: getControllerSnapshot?.().buttons || null,
      axes: getControllerSnapshot?.().axes || null,
    });
  }

  function padRect(body) {
    // The pad takes the left column and the rows the right. Leader labels run
    // out into the pad column's margins, which is why it gets the larger share.
    const w = Math.max(30, Math.round(body.w * 0.60));
    return { x: body.x, y: body.y, w, h: body.h - 2 };
  }

  const scene = {
    id: 'controller-settings',
    blocksInput: true,
    blocksWorld: true,
    lensPreset: 'calm',

    enter() { selected = 0; captureAction = null; },

    exit() {
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
        }
        return true;
      }
      if (raw === 'ArrowUp' || k === 'w' || code === 'KeyW') { move(-1); return true; }
      if (raw === 'ArrowDown' || k === 's' || code === 'KeyS') { move(1); return true; }
      if (raw === 'ArrowLeft' || k === 'a' || code === 'KeyA') { adjust(-1); return true; }
      if (raw === 'ArrowRight' || k === 'd' || code === 'KeyD') { adjust(1); return true; }
      if (raw === 'Enter' || code === 'Enter' || raw === ' ' || code === 'Space' || k === 'z' || code === 'KeyZ') { beginCapture(); return true; }
      if (raw === 'r' || raw === 'R' || code === 'KeyR') { resetControllerSettings(); save(); captureAction = null; cancelControllerRemap?.(); return true; }
      if (raw === 'Escape' || code === 'Escape' || raw === 'Backspace' || code === 'Backspace') { close(); return true; }
      return true;
    },

    controllerCapture(token) {
      return bindToken(token);
    },

    pointer(e = {}) {
      hits.handle(e);
      return true;
    },

    update() {
      if (captureAction && typeof controllerRemapAction === 'function' && controllerRemapAction() !== captureAction) captureAction = null;
    },

    render() {
      hits.reset();
      const { cols, rows: R } = uiSize();
      uiScrim(1);

      const w = Math.min(104, cols - 4);
      const h = Math.min(Math.max(26, R - 6), R - 2);
      const x = Math.floor((cols - w) / 2);
      const y = Math.floor((R - h) / 2);
      const m = model();

      const body = drawMachinePanel(x, y, w, h, {
        theme: 'amber',
        wordmark: 'AUDIOCORP',
        label: 'CONTROLLER SETUP',
        source: getPadName() || 'NO CONTROLLER',
        meter: false,
        footerParts: [
          { action: 'select', label: 'ROW / SET' },
          { action: 'confirm', label: 'REMAP' },
          { action: 'back', label: 'DONE' },
        ],
      });

      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      const blink = vfdBlinkOn(now);
      const pad = padRect(body);
      drawPadDiagram(pad, m, { cols, blinkOn: blink });

      const listX = body.x + pad.w + 2;
      const listW = Math.max(18, body.x + body.w - listX);
      const valueW = 20;
      const labelW = Math.max(8, listW - valueW - 2);

      list(m).forEach((row, i) => {
        const on = i === selected;
        const ry = body.y + i * 2;
        if (ry > body.y + body.h - 3) return;
        const id = `row:${row.id}`;
        hits.add({
          id,
          kind: 'controller-row',
          x: listX - 1,
          y: ry - 0.25,
          w: listW + 1,
          h: 1.5,
          selected: on,
          label: row.label,
          data: { index: i },
          onHover: () => { selected = i; },
          onClick: () => { selected = i; beginCapture(); },
        });

        drawVfdRow({ uiFill, uiText, theme: activeTheme }, {
          x: listX, y: ry, w: labelW, label: row.label,
          style: vfdRowStyle({
            hovered: hits.isHovered(id),
            selected: on,
            editing: row.id === captureAction,
            nowMs: now,
          }),
          role: on ? 'ui-primary' : 'ui-secondary',
        });

        const value = row.kind === 'option'
          ? `\u25c0 ${row.value} \u25b6`
          : (row.id === captureAction ? 'PRESS ANY BUTTON' : row.bindingLabel);
        const vx = listX + labelW + 2;
        const clipped = value.length > listW - labelW - 2 ? value.slice(0, Math.max(1, listW - labelW - 2)) : value;
        // Marker is the panel's alert annunciator and is reserved for capture;
        // counter marks the live binding; everything else stays silkscreen.
        const role = row.id === captureAction
          ? (blink ? 'ui-marker' : 'ui-secondary')
          : on ? 'ui-counter' : 'ui-secondary';
        uiText(vx, ry, clipped, role, on || row.id === captureAction ? 1 : 0.8);

        // A printed rule under the pad options: they change how the hardware is
        // read, the rows below them only change what a button does.
        if (row.kind === 'option') {
          uiText(listX, ry + 1, '─'.repeat(Math.max(1, listW)), 'ui-secondary', 0.35);
        }
      });

    },

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
        callouts: (m.callouts || []).length,
        hitRegions: hits.view(),
      };
    },
  };

  return scene;
}
