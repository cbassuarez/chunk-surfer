// Title screen. Also the audio gate: nothing may call ensureCtx() until a key
// has been pressed here, which satisfies browser autoplay policy and gives the
// first sound of the piece a deliberate moment of silence to arrive out of.
//
// The title keeps a stable case-file layout in every profile state. Empty
// archives/endings are still available; their panels explain that nothing is
// filed yet instead of changing the top-level menu shape.

import * as scenes from './scenes.js';
import { uiSize, uiCenter, uiFill, uiText } from '../render/ui.js';
import { drawLocationIndicator, drawMachinePanel, drawVfdText } from '../render/presentation.js';
import { createHitRegions } from '../render/hit-regions.js';
import { drawVfdRow, vfdRowStyle } from '../render/vfd-select.js';
import { UI_COLOR, activeTheme } from '../render/palette.js';
import { getMeta, hasActiveRun } from './save.js';
import * as AUDIO from '../audio/story-audio.js';
import { promptLine } from './bindings.js';
import { bootWeather, bootWeatherAudio, bootWeatherSettled, endBootWeather, renderBootWeather, stepBootWeather } from './boot-weather.js';
import { transferRoomCopy } from './post-run-copy.js';

const TITLE_CONFIRM_PROMPT = 'START NEW RUN? PRESS ENTER AGAIN';
const TITLE_MENU_TWO_COLUMN_MIN_W = 64;

function titleMenuColumnCount(bodyW, itemCount) {
  return bodyW >= TITLE_MENU_TWO_COLUMN_MIN_W && itemCount > 4 ? 2 : 1;
}

function nowMs() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function drawRightText(xRight, y, text, role = 'ui-label', alpha = 1) {
  const s = String(text || '').toUpperCase();
  if (!s) return;
  uiText(Math.round(xRight - s.length + 1), y, s, role, alpha);
}

function titleMenuLayout(body, itemCount) {
  const colCount = titleMenuColumnCount(body.w, itemCount);
  const twoColumns = colCount > 1;

  if (!twoColumns) {
    const x = body.x + 7;
    const w = Math.max(1, body.w - 14);
    return {
      colCount: 1,
      rowCount: itemCount,
      colX: [x],
      colW: [w],
      confirmW: w,
    };
  }

  const leftX = body.x + 4;
  const rightX = Math.min(
    body.x + body.w - 22,
    Math.max(body.x + 40, Math.floor(body.x + body.w * 0.58)),
  );
  const gap = 4;
  const leftW = Math.max(
    TITLE_CONFIRM_PROMPT.length + 2,
    rightX - leftX - gap,
  );
  const rightW = Math.max(18, body.x + body.w - rightX - 3);

  return {
    colCount,
    rowCount: Math.ceil(itemCount / colCount),
    colX: [leftX, rightX],
    colW: [leftW, rightW],
    confirmW: leftW,
  };
}

export function makeTitleScene({
  buildLabel = '',
  onNewGame,
  onContinue,
  onTransferRoom = () => {},
  onSettings,
  onArchive = () => {},
  onReturnIndex = () => {},
  onBetaNotice = () => {},
  onAudioGate = () => {},
  onSelectionChange = () => {},
} = {}) {
  const meta = getMeta();
  const replay = (meta.endingsSeen?.length || 0) > 0;
  const filed = Object.keys(meta.knowledge?.documents || {}).length;
  const transferRoomOpen = replay || filed > 0;
  const activeRun = hasActiveRun();

  const items = [
    { id: 'continue', label: 'continue', run: onContinue, disabled: !activeRun },
    { id: 'new-run', label: 'new run', run: onNewGame, confirms: true, stay: true },
    { id: 'archive', label: 'achievements', stay: true, run: onArchive },
    { id: 'return-index', label: 'endings', stay: true, run: onReturnIndex },
    // THE OFFICE YOU COME BACK TO. It appears the moment there is any reason to
    // go there — the first sheet you read, or the first night you finish — and
    // never before, because an empty file is a worse introduction than no row.
    ...(transferRoomOpen ? [{ id: 'transfer-room', label: 'the transfer room', stay: true, run: onTransferRoom }] : []),
    { id: 'beta-notice', label: 'beta notice', stay: true, run: onBetaNotice },
    { id: 'settings', label: 'settings', stay: true, run: onSettings },
  ];

  let sel = activeRun ? 0 : 1;
  let previousSel = sel;
  let previousSelUntil = 0;
  let audioPrimed = false;
  let confirmNewRun = false;
  let t = 0;
  let menuColumns = 1;
  const hits = createHitRegions();

  const columns = () => menuColumns;
  const rowsPerColumn = () => Math.ceil(items.length / columns());

  function primeAudio() {
    if (audioPrimed) return;
    audioPrimed = true;
    onAudioGate();
    AUDIO.startMenuHiss();
  }

  function disarm() {
    confirmNewRun = false;
  }

  function select(index, { sound = true } = {}) {
    if (index < 0 || index >= items.length) return false;
    if (items[index]?.disabled) return false;
    if (sel === index) return true;
    previousSel = sel;
    previousSelUntil = nowMs() + 90;
    sel = index;
    disarm();
    if (sound) AUDIO.menuMove();
    onSelectionChange(items[sel]?.id||'',sel);
    return true;
  }

  function moveSelection(index) {
    const next = (index + items.length) % items.length;
    if (next !== sel) {
      previousSel = sel;
      previousSelUntil = nowMs() + 90;
      sel = next;
      onSelectionChange(items[sel]?.id||'',sel);
    }
    disarm();
    AUDIO.menuMove();
  }

  function activateCurrent() {
    const item = items[sel];
    if (!item) return true;

    if (item.disabled || item.locked) {
      AUDIO.menuMove();
      item.run?.();
      disarm();
      return true;
    }

    if (item.confirms && !confirmNewRun) {
      confirmNewRun = true;
      AUDIO.menuConfirm();
      return true;
    }

    AUDIO.menuConfirm();
    if (item.stay) {
      item.run?.();
      disarm();
      return true;
    }

    scenes.pop();
    item.run?.();
    return true;
  }

  function pointer(e) {
    primeAudio();
    if (e.type === 'pointermove') {
      hits.handle(e, { click: false });
      return true;
    }
    if (e.type === 'pointerdown') {
      hits.handle(e);
      return true;
    }
    return true;
  }

  return {
    id: 'title',
    blocksInput: true,
    blocksWorld: true,
    lensPreset: 'calm',

    enter() {
      document.body.classList.add('title-screen');
      primeAudio();
      const map = document.querySelector('.map') || document.querySelector('#map');
      try { map?.setAttribute('tabindex', '0'); map?.focus({ preventScroll: true }); } catch (_) {}
      onSelectionChange(items[sel]?.id||'',sel);
    },

    exit() {
      document.body.classList.remove('title-screen');
      AUDIO.stopMenuHiss();
    },

    // Overlay menus stop their own transport bed on exit. Re-acquire the title
    // bed when the title becomes the top scene again without replaying enter().
    resume() {
      primeAudio();
      AUDIO.startMenuHiss();
    },

    pointer,

    key(e) {
      primeAudio();
      const k = String(e.key || '').toLowerCase();
      const code = e.code || '';

      if (e.key === 'ArrowUp' || k === 'w' || code === 'KeyW') {
        moveSelection(sel - 1);
        return true;
      }

      if (e.key === 'ArrowDown' || k === 's' || code === 'KeyS') {
        moveSelection(sel + 1);
        return true;
      }

      if (e.key === 'ArrowLeft' || k === 'a' || code === 'KeyA') {
        if (columns() > 1) {
          moveSelection(sel - rowsPerColumn());
        }
        return true;
      }

      if (e.key === 'ArrowRight' || k === 'd' || code === 'KeyD') {
        if (columns() > 1) {
          moveSelection(sel + rowsPerColumn());
        }
        return true;
      }

      if (
        e.key === 'Enter' || code === 'Enter' ||
        e.key === ' ' || code === 'Space' ||
        k === 'z' || code === 'KeyZ'
      ) {
        return activateCurrent();
      }

      return true;
    },

    update(dt) {
      t += dt;
      // THE LAST OF THE WEATHER LANDS HERE. The credits scene is removed and
      // this one pushed inside a single scenes.update, so whatever was still in
      // frame at 23.5s crosses the cut mid-flight. Calm brings it to rest
      // rather than switching it off in mid-air, and then it is done for the
      // session — backing out of a run to this menu must not start it again.
      const weather = bootWeather();
      if (!weather) return;
      stepBootWeather(weather, dt, { presence: 0, settling: true, calm: true });
      // The bed rides the same fade the last particles do, so the weather stops
      // being audible at the moment it stops being visible — under the menu
      // hiss, which primeAudio has already brought up. endBootWeather stops it.
      bootWeatherAudio()?.update?.({ presence: weather.fade * 0.55, wind: weather.wind });
      if (bootWeatherSettled(weather)) endBootWeather();
    },

    render() {
      hits.reset();

      const { cols, rows } = uiSize();
      uiFill(0, 0, cols, rows, UI_COLOR.glass);
      // On the ground, under the panel: the menu comes up over the end of the
      // weather, not the other way round.
      renderBootWeather(bootWeather());

      const w = Math.min(78, cols - 4);
      const estimatedBodyW = Math.max(1, w - 6);
      const estimatedColumns = titleMenuColumnCount(estimatedBodyW, items.length);
      const estimatedRows = Math.ceil(items.length / estimatedColumns);
      const bodyRowsNeeded = 15 + Math.max(0, estimatedRows - 1) * 2;
      const h = Math.min(Math.max(28, bodyRowsNeeded + 7), rows - 4);
      const x = Math.floor((cols - w) / 2);
      const y = Math.floor((rows - h) / 2);
      const body = drawMachinePanel(x, y, w, h, {
        label: 'CASE SELECT',
        source: '4417-C',
        footerParts: [{ action: 'select', label: 'SELECT' }, { action: 'confirm', label: 'CONFIRM' }],
        meter: true,
      });

      const display = 'CHUNK SURFER';
      const titleScale = cols < 82 ? 1.42 : 1.58;
      const titleX = Math.max(body.x, Math.floor((cols - display.length * titleScale) / 2));
      const warmStep = Math.min(16, Math.floor(t * 38));
      const pwm = Math.pow(warmStep / 16, 0.78);
      const scanPhase = (Math.floor(t * 120) % 9) === 0 ? 0.92 : 1;
      const blank = (t % 4.25) < 0.035 ? 0.68 : 1;
      if (t < 1.0) {
        drawVfdText(titleX + 0.32, body.y + 1, display, {
          scale: titleScale,
          alpha: Math.max(0.08, pwm * 0.18),
        });
      }
      drawVfdText(titleX, body.y + 1, display, {
        scale: titleScale,
        alpha: Math.max(0.18, pwm) * scanPhase * blank,
      });
      const sweep = (Math.floor(t * 8) % (display.length + 8)) - 4;
      for (let i = 0; i < display.length; i++) {
        const d = Math.abs(i - sweep);
        const ch = d === 0 ? '▓' : d === 1 ? '▒' : '░';
        uiText(Math.round(titleX + i * titleScale), body.y + 4, ch, 'ui-amber', d < 2 ? 0.82 : 0.20);
      }
      const phase = (t * 0.32) % 1;
      const tri = phase < 0.5 ? phase * 2 : (1 - phase) * 2;
      const stepped = Math.floor(tri * 16) / 16;
      drawLocationIndicator(
        Math.max(body.x + 8, Math.floor((cols - 28) / 2)),
        body.y + 5,
        28,
        stepped,
        { theme: 'amber' },
      );
      uiCenter(body.y + 7, 'FIVE ROOM TONES. ONE BUILDING LISTENING.', 'ui-primary');

      if (t < 0.85) {
        uiCenter(body.y + 8, 'STANDBY / CASE FILE / SOURCE 4417-C', 'ui-label', 0.34);
        uiCenter(body.y + 10, 'AUDIOCORP LOCAL MONITOR READY', 'ui-secondary', 0.28);
      }

      if (items[sel]?.id === 'transfer-room') {
        const help = transferRoomCopy({ filed });
        uiCenter(body.y + 9, help.short, help.enabled ? 'ui-amber' : 'ui-secondary');
      }
      else if (meta.hushMet) uiCenter(body.y + 9, 'THE HUSH HAS YOUR SIGNAL.', 'ui-danger');
      else if (meta.leftMidRun) uiCenter(body.y + 9, 'UNFINISHED RUN SAVED.', 'ui-danger');
      else if (replay) uiCenter(body.y + 9, 'ENDINGS AND ACHIEVEMENTS ARE AVAILABLE.', 'ui-amber');
      else uiCenter(body.y + 9, 'THE CASE FILE IS EMPTY.', 'ui-secondary');

      const menuY = body.y + 12;
      const layout = titleMenuLayout(body, items.length);
      menuColumns = layout.colCount;
      const rowCount = rowsPerColumn();
      const renderNow = nowMs();

      items.forEach((item, i) => {
        const on = i === sel;
        const armed = item.confirms && confirmNewRun;
        const labelText = armed ? TITLE_CONFIRM_PROMPT : item.label.toUpperCase();
        const col = Math.floor(i / rowCount);
        const row = i % rowCount;
        const itemX = layout.colX[col] ?? layout.colX[0];
        const itemY = menuY + row * 2;
        const rowW = armed
          ? layout.confirmW
          : (layout.colW[col] ?? layout.colW[0]);
        const safeLabel = labelText.slice(0, Math.max(1, rowW - 2));
        const drawnLabel = `${on ? '▸ ' : '  '}${safeLabel}`;
        const hitW = Math.min(rowW, drawnLabel.length + 2);

        hits.add({
          id: `title:${item.id}`,
          kind: 'title-item',
          x: itemX,
          y: itemY - 0.35,
          w: hitW,
          h: 1.4,
          disabled: item.disabled,
          selected: on,
          danger: armed,
          label: item.label,
          data: { index: i, item },
          onHover: () => select(i),
          onClick: () => {
            if (!select(i, { sound: false }) && !item.disabled) return;
            activateCurrent();
          },
        });

        if (i === previousSel && i !== sel && renderNow < previousSelUntil) {
          uiText(itemX - 1, itemY, `▸ ${safeLabel}`.slice(0, rowW), 'ui-amber', 0.12);
        }

        // One indicator, driven by pointer and keyboard alike: inverse video
        // for the committed cursor, a duty-factor step for the pointer alone.
        const style = vfdRowStyle({
          hovered: hits.isHovered(`title:${item.id}`),
          selected: on,
          disabled: item.disabled,
          editing: armed,
          nowMs: renderNow,
        });
        drawVfdRow({ uiFill, uiText, theme: activeTheme, inverseColor: armed ? activeTheme().danger : null }, {
          x: itemX,
          y: itemY,
          w: hitW,
          label: safeLabel,
          style,
          role: item.disabled ? 'ui-secondary' : armed ? 'ui-danger' : on ? 'ui-amber' : 'ui-secondary',
        });
      });

      if (buildLabel) {
        const maxBuildW = Math.max(1, body.w - 2);
        const buildText = String(buildLabel).toUpperCase().slice(0, maxBuildW);
        const buildXRight = body.x + body.w - 1;
        const buildY = Math.max(body.y + 1, y + h - 5);
        drawRightText(buildXRight, buildY, buildText, 'ui-label', 0.62);
      }
    },
  };
}
