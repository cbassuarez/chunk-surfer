import * as scenes from './scenes.js';
import { uiCenter, uiFill, uiSize, uiText } from '../render/ui.js';
import { UI_COLOR } from '../render/palette.js';

export function makeLensCalibrationScene({
  start,
  retry,
  onReady = () => {},
  onQuit = () => {},
} = {}) {
  let selected = 0;
  let pending = false;
  let error = null;
  let done = false;
  let scene = null;

  async function run(which = start) {
    if (pending || done) return;
    pending = true; error = null;
    try {
      await which?.();
      if (done) return;
      done = true;
      scenes.remove(scene);
      onReady();
    } catch (cause) {
      error = cause?.message || String(cause || 'critical diffusion service unavailable');
    } finally {
      pending = false;
    }
  }

  function status() {
    return globalThis.window?.__diffusion?.stats || {};
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
    view() { return { pending, error, selected, status: { ...status() } }; },
    render() {
      const { cols, rows } = uiSize();
      const st = status();
      uiFill(0, 0, cols, rows, UI_COLOR.glass);
      const y = Math.max(3, Math.floor(rows / 2) - 7);
      uiCenter(y, 'AUDIOCORP OPTICAL INSTRUMENT', 'ui-secondary');
      uiCenter(y + 2, 'CALIBRATING GENERATIVE LENS', 'ui-amber');

      const total = Math.max(1, Number(st.total) || 60);
      const completed = Math.max(0, Math.min(total, Number(st.completed) || 0));
      const width = Math.max(12, Math.min(54, cols - 12));
      const lit = Math.round((completed / total) * width);
      const x = Math.floor((cols - width - 2) / 2);
      uiText(x, y + 5, `[${'█'.repeat(lit)}${'░'.repeat(width - lit)}]`, error ? 'ui-danger' : 'ui-primary');

      const phase = error ? 'CALIBRATION FAILED' : String(st.state || 'starting').replaceAll('-', ' ').toUpperCase();
      uiCenter(y + 7, phase, error ? 'ui-danger' : 'ui-secondary');
      if (!error) {
        const bank = st.bank ? String(st.bank).toUpperCase() : 'SERVICE';
        const slot = Number.isFinite(st.slot) && st.slot >= 0 ? ` · MATERIAL ${st.slot + 1}/10` : '';
        uiCenter(y + 9, `${bank}${slot}`, 'ui-secondary');
        uiCenter(y + 11, `${completed}/${total} SURFACES · ${Number(st.banksReady) || 0}/6 BANKS VERIFIED`, 'ui-secondary');
      } else {
        const message = String(error).slice(0, Math.max(12, cols - 8));
        uiCenter(y + 9, message, 'ui-danger');
        uiCenter(y + 12, `${selected === 0 ? '▸' : ' '} RETRY CALIBRATION`, selected === 0 ? 'ui-primary' : 'ui-secondary');
        uiCenter(y + 14, `${selected === 1 ? '▸' : ' '} QUIT`, selected === 1 ? 'ui-primary' : 'ui-secondary');
      }
    },
  };
  return scene;
}
