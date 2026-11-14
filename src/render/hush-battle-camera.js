export const HUSH_BATTLE_VIEW_RISE = .56;
export const HUSH_BATTLE_VIEW_DISTANCE = 7;

// Fit the performer to the available stage, including shallow HUD apertures.
// The impact moves in on the upper body with no larger render allocation.
export function hushBattleBodyCamera(width, height, close = false) {
  const aspect = width / Math.max(1, height);
  const span = Math.max(close ? 1.42 : 2.85, 1.35 / Math.max(.01, aspect));
  return { span, halfWidth: span * aspect / 2, centre: close ? 1.52 : 1.05 };
}
