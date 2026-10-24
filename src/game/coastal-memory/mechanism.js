// A single saved-audio phase drives the two surviving pins and their comb teeth.
// Ordinary cylinder/comb construction: https://www.reuge.com/en/factory/nos-savoirs-faire/mouvements-a-musique-mecanique
const TAU = Math.PI * 2;
export const COASTAL_MUSIC_BOX_CYCLE = 14;
export const COASTAL_MUSIC_BOX_CLICKS = Object.freeze([.31, .72, 1.13, 1.54, 1.95, 2.27, 2.69, 3.1, 3.51, 3.92, 4.33, 4.75, 5.16, 5.58, 6.01, 6.44, 6.91, 7.38, 7.91, 8.5, 9.21]);
export const COASTAL_MUSIC_BOX_PLUCKS = Object.freeze([2.28, 7.41]);
export const COASTAL_MUSIC_BOX_STALL = 10.1;
export const COASTAL_MUSIC_BOX_MECHANISM = Object.freeze({
  cylinderCenter: Object.freeze([0, .086, -.032]), cylinderRadius: .026, pinRadius: .0295,
  cylinderHalfLength: .104, gearCenter: Object.freeze([.1265, .086, -.032]),
  contactAngle: 1.9, tineThickness: .0017, tineWidth: .008,
  liveTines: Object.freeze([3, 12].map((index, n) => Object.freeze({index, x: -.106 + index * .0132,
    rootZ: .062 + n * .004, pluckAt: COASTAL_MUSIC_BOX_PLUCKS[n]}))),
});
export function coastalMusicBoxPhase(seconds = 0) {
  const t = Number.isFinite(seconds) ? seconds : 0;
  return ((t % COASTAL_MUSIC_BOX_CYCLE) + COASTAL_MUSIC_BOX_CYCLE) % COASTAL_MUSIC_BOX_CYCLE;
}
export function coastalMusicBoxAngle(seconds = 0) {
  const t = coastalMusicBoxPhase(seconds), u = Math.min(1, t / COASTAL_MUSIC_BOX_STALL);
  // The damaged spring slows into the jam; one complete turn makes the loop
  // physically continuous. The last sound is a tiny torsional spring shudder.
  const d = t - COASTAL_MUSIC_BOX_STALL;
  return TAU * (1 - (1 - u) ** 1.35) + (d > 0 && d < .5 ? .002 * Math.sin(d * TAU * 81) * Math.exp(-d * 15) : 0);
}
export function coastalMusicBoxMechanism(seconds = 0) {
  const t = coastalMusicBoxPhase(seconds), m = COASTAL_MUSIC_BOX_MECHANISM;
  const tipY = m.cylinderCenter[1] + Math.cos(m.contactAngle) * m.pinRadius;
  const tipZ = m.cylinderCenter[2] + Math.sin(m.contactAngle) * m.pinRadius;
  return {phase: t, cylinderAngle: coastalMusicBoxAngle(t), gearAngle: coastalMusicBoxAngle(t),
    liveTines: m.liveTines.map(tine => {
      const d = t - tine.pluckAt;
      return {...tine, tipY, tipZ, length: tine.rootZ - tipZ,
        // A sub-millimetre settling envelope, rather than frame-aliased 196 Hz.
        deflection: d >= 0 && d < 1 ? .012 * Math.sin(d * TAU * 32) * Math.exp(-d / .17) : 0};
    })};
}
