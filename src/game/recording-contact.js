// A first room-tone take should teach the discipline of holding a room, not
// roll a die on whether the HUSH crosses a small studio before the player has
// learned what the rising pressure means. The body still spawns, searches,
// sounds and appears normally; only physical contact waits through the first
// half of the first B3 minute. The back half remains fully live.

export const FIRST_B3_CONTACT_GRACE_PROGRESS = 0.55;

export function suppressFirstB3RecordingContact({
  recording = false,
  roomId = null,
  hasCleanB3Take = false,
  progress = 0,
} = {}) {
  return !!recording
    && roomId === 'main_b3'
    && !hasCleanB3Take
    && Math.max(0, Math.min(1, Number(progress) || 0)) < FIRST_B3_CONTACT_GRACE_PROGRESS;
}
