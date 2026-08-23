import * as scenes from './scenes.js';
import { uiCenter, uiFill, uiSize } from '../render/ui.js';
import { UI_COLOR } from '../render/palette.js';
import { drawCombatBar, drawCombatGauge } from '../render/combat-view.js';

const SETUP_PHASES = Object.freeze({
  checking: 'VERIFYING BUNDLED CONTENT',
  'starting-runtime': 'UNPACKING PYTORCH + COMPEL',
  recovering: 'RECOVERING LOCAL RUNTIME',
  downloading: 'DOWNLOADING EXTRA CONTENT',
  ready: 'LOCAL RUNTIME READY',
  attention: 'LOCAL RUNTIME NEEDS ATTENTION',
});

const MATERIAL_PHASES = Object.freeze({
  connecting: 'CONNECTING TO LOCAL RUNTIME',
  reconnecting: 'RECONNECTING TO LOCAL RUNTIME',
  'loading-model': 'LOADING GENERATOR',
  generating: 'PREPARING TEXTURES',
  ready: 'MATERIALS READY',
});

export function makeLensCalibrationScene({
  start,
  retry,
  onReady = () => {},
  onQuit = () => {},
  firstInstall = false,
  minimize = null,
  restore = null,
  maxAutomaticRetries = 2,
} = {}) {
  let selected = 0;
  let pending = false;
  let error = null;
  let done = false;
  let scene = null;
  let attempt = 0;
  let minimizedByScreen = false;
  let restoreError = '';

  async function run(which = start) {
    if (pending || done) return;
    pending = true;
    error = null;
    restoreError = '';
    const passes = Math.max(1, Math.floor(Number(maxAutomaticRetries) || 0) + 1);
    try {
      for (let index = 0; index < passes; index += 1) {
        attempt = index + 1;
        try {
          await (index === 0 ? which : (retry || start))?.();
          if (done) return;
          if (minimizedByScreen && restore) {
            try { await restore(); }
            catch (cause) { restoreError = cause?.message || String(cause || 'window could not be restored'); }
          }
          done = true;
          scenes.remove(scene);
          await onReady();
          return;
        } catch (cause) {
          error = cause?.message || String(cause || 'critical local runtime unavailable');
          if (index + 1 < passes) continue;
          throw cause;
        }
      }
    } catch (_) {
      // The screen remains in place with explicit recovery actions. A run
      // cannot begin without its authored material bank.
    } finally {
      pending = false;
    }
  }

  function textureStatus() {
    return globalThis.window?.__diffusion?.stats || {};
  }

  function setupStatus() {
    return globalThis.window?.__lensBootstrap || {};
  }

  async function minimizeWithConsent() {
    if (!firstInstall || !pending || minimizedByScreen || !minimize) return;
    try {
      const result = await minimize();
      minimizedByScreen = result?.ok !== false;
    } catch (cause) {
      restoreError = cause?.message || String(cause || 'window could not be minimized');
    }
  }

  scene = {
    id: 'lens-calibration',
    blocksInput: true,
    blocksWorld: true,
    lookProfile: 'calm',
    enter() { document.body.classList.add('lens-calibration-screen'); run(); },
    exit() { document.body.classList.remove('lens-calibration-screen'); },
    key(event) {
      event.preventDefault?.();
      if ((event.key === 'm' || event.key === 'M') && !error) {
        minimizeWithConsent();
        return true;
      }
      if (!error) return true;
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown' || event.key === 'Tab') {
        selected = selected ? 0 : 1;
        return true;
      }
      if (event.key === 'Enter' || event.key === ' ') {
        if (selected === 0) run(retry || start);
        else onQuit();
      }
      return true;
    },
    view() {
      return {
        pending,
        error,
        selected,
        attempt,
        firstInstall,
        minimizedByScreen,
        setup: { ...setupStatus() },
        status: { ...textureStatus() },
      };
    },
    render() {
      const { cols, rows } = uiSize();
      const st = textureStatus();
      const setup = setupStatus();
      const y = Math.max(2, Math.floor(rows / 2) - (firstInstall ? 10 : 8));
      const width = Math.max(24, Math.min(54, cols - 12));
      const x = Math.floor((cols - width) / 2);
      const total = Math.max(1, Number(st.criticalTotal) || 10);
      const completed = Math.max(0, Math.min(total, Number(st.criticalCompleted) || 0));
      const setupTotal = Math.max(1, Number(setup.total) || 4);
      const setupCompleted = Math.max(0, Math.min(setupTotal, Number(setup.completed) || 0));
      const now = (globalThis.performance?.now?.() || Date.now()) / 1000;

      uiFill(0, 0, cols, rows, UI_COLOR.glass);
      uiCenter(y, 'CHUNK SURFER', 'ui-secondary');
      uiCenter(y + 2, firstInstall ? 'FIRST LAUNCH · EXTRA CONTENT' : 'LOADING MATERIALS', 'ui-primary');

      let cursor = y + 5;
      if (firstInstall) {
        drawCombatBar({
          x, y: cursor, w: width,
          value: setupCompleted,
          max: setupTotal,
          label: 'LOCAL DIFFUSION RUNTIME',
          tone: error ? 'enemy' : 'theme',
          lowDanger: !!error,
        });
        const setupPhase = SETUP_PHASES[setup.state] || setup.detail || 'PREPARING LOCAL RUNTIME';
        uiCenter(cursor + 3, setupPhase, error ? 'ui-danger' : 'ui-secondary');
        cursor += 6;
      }

      drawCombatGauge({
        x, y: cursor, w: width,
        value: completed,
        max: total,
        label: 'MATERIAL BANK',
        tone: error ? 'enemy' : 'theme',
        lowDanger: !!error,
        now,
      });
      cursor += 3;

      const materialPhase = completed >= total
        ? 'MATERIALS READY'
        : MATERIAL_PHASES[st.state] || (firstInstall ? 'WAITING FOR LOCAL RUNTIME' : 'STARTING');
      uiCenter(cursor, error ? 'SETUP NEEDS ATTENTION' : materialPhase, error ? 'ui-danger' : 'ui-secondary');

      if (!error) {
        const current = Math.min(total, completed + (completed < total ? 1 : 0));
        uiCenter(cursor + 2, completed < total ? `TEXTURE ${current} OF ${total}` : 'ALL CRITICAL TEXTURES READY', 'ui-secondary');
        if (attempt > 1) uiCenter(cursor + 4, `AUTOMATIC RECOVERY ${attempt} OF ${maxAutomaticRetries + 1}`, 'ui-amber');
        if (firstInstall) {
          uiCenter(cursor + 6, 'SAFE TO MINIMIZE · KEEP CHUNK SURFER OPEN', 'ui-primary');
          uiCenter(cursor + 8, minimizedByScreen
            ? 'WINDOW WILL RETURN WHEN SETUP IS COMPLETE'
            : 'PRESS M TO MINIMIZE · WINDOW RETURNS WHEN READY', 'ui-secondary');
        }
        if (restoreError) uiCenter(cursor + 10, String(restoreError).slice(0, Math.max(12, cols - 8)), 'ui-danger');
      } else {
        const message = String(error).slice(0, Math.max(12, cols - 8));
        uiCenter(cursor + 2, message, 'ui-danger');
        uiCenter(cursor + 4, 'THE RUNTIME IS REQUIRED; THE GAME WILL NOT START WITHOUT IT.', 'ui-secondary');
        uiCenter(cursor + 7, `${selected === 0 ? '▸' : ' '} RETRY SETUP`, selected === 0 ? 'ui-primary' : 'ui-secondary');
        uiCenter(cursor + 9, `${selected === 1 ? '▸' : ' '} QUIT`, selected === 1 ? 'ui-primary' : 'ui-secondary');
      }
    },
  };
  return scene;
}
