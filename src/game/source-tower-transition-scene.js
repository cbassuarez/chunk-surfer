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
