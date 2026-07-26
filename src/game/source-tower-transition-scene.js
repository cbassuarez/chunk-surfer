import { uiSize, uiText } from '../render/ui.js';

export const SOURCE_TOWER_CROSSING_SECONDS = 8.5;

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));

export function advanceSourceTowerProgress(progress, moveY, dt, seconds = SOURCE_TOWER_CROSSING_SECONDS) {
  return clamp01(Number(progress) + (Number(moveY) || 0) * Math.max(0, Number(dt) || 0) / seconds);
}

export function createSourceTowerTransitionScene({
  motionInput,
  renderer,
  audio = null,
  worldView,
  onCommit,
  onExit,
  reducedMotion = false,
} = {}) {
  let progress = 0;
  let committed = false;

  const scene = {
    id: 'source-tower-transition',
    blocksInput: true,
    blocksWorld: true,
    tracksMotion: true,
    lookProfile: 'rupture',
    worldView: () => worldView?.() || null,
    enter() {
      progress = 0;
      committed = false;
      renderer?.r3dBeginDatamosh?.({ reducedMotion });
      renderer?.r3dSetDatamoshProgress?.(0);
      audio?.start?.();
    },
    update(dt) {
      if (committed) return;
      const moveY = motionInput?.snapshot?.().moveY || 0;
      progress = advanceSourceTowerProgress(progress, moveY, dt);
      renderer?.r3dSetDatamoshProgress?.(progress);
      audio?.setProgress?.(progress);
      if (progress >= 1) {
        committed = true;
        onCommit?.();
      }
    },
    render() {
      const { cols, rows } = uiSize();
      const label = 'FOLLOW THE SIGNAL INTO THE TOWER';
      const instruction = 'HOLD FORWARD — THE BELL ROPES CARRY IT UP';
      const width = Math.max(12, Math.min(34, cols - 8));
      const filled = Math.round(width * progress);
      const meter = `${'█'.repeat(filled)}${'·'.repeat(Math.max(0, width - filled))}`;
      uiText(Math.max(2, Math.floor((cols - label.length) / 2)), 2, label, 'ui-amber');
      uiText(Math.max(2, Math.floor((cols - instruction.length) / 2)), rows - 4, instruction.slice(0, cols - 4), 'ui-secondary');
      uiText(Math.max(2, Math.floor((cols - meter.length) / 2)), rows - 2, meter, progress >= 1 ? 'ui-green' : 'ui-blue');
    },
    exit() {
      renderer?.r3dEndDatamosh?.();
      audio?.destroy?.();
      motionInput?.reset?.('source-tower-transition');
      onExit?.({ committed, progress });
    },
    progress: () => progress,
  };

  return scene;
}
