import { DOOR_DRIVE_TEASER, DOOR_DRIVE_WATER_ENTRY, doorDriveTeaserPoseAt } from '../game/source-drive/door-teaser.js';

const freeze = Object.freeze;

// The bluff's descent is displaced onto the motorway. Metres are relative
// to the pass, and yaw zero points the van's rear back toward the player.
export const OUTSKIRTS_VAN_CRASH = freeze({
  pass: 15,
  firstTrigger: .6,
  lastTrigger: 1.8,
  recoverPast: 12,
  impactAt: 1.62,
  wreckAt: 1.78,
  doorAt: 2.05,
  spillAt: 2.41,
  duration: 7.41,
  bodySettleAt: 2.34,
  // Lowest original drive_vehicle_body corner at the chosen pitch and roll.
  bumper: freeze([-.955, .34, -2.261]),
  impact: freeze({ across: -3.58, along: 28.70, y: 1.908, yaw: -.27, pitch: -1.06, roll: .16 }),
  rest: freeze({ across: -4.38, along: 29.50, yaw: -.16, y: .27, pitch: -.025, roll: .095 }),
  collision: freeze([freeze({ minX: -1.2, maxX: 1.12, minZ: -2.1, maxZ: 3.28 })]),
});

const mix = (a, b, t) => a + (b - a) * t;
const clamp01 = t => Math.max(0, Math.min(1, t));
const ease = t => t * t * (3 - 2 * t);
const bluffStart = doorDriveTeaserPoseAt(DOOR_DRIVE_TEASER.fallStart);
const bluffImpact = doorDriveTeaserPoseAt(DOOR_DRIVE_WATER_ENTRY);
const bluffFlight = DOOR_DRIVE_WATER_ENTRY - DOOR_DRIVE_TEASER.fallStart;

export function outskirtsVanCrashPose(seconds, reducedMotion = false) {
  const { impactAt, wreckAt, doorAt, bodySettleAt, impact, rest } = OUTSKIRTS_VAN_CRASH;
  const time = Math.max(0, seconds);
  const door = ease(clamp01((time - doorAt) / .56));
  if (time < impactAt) {
    const flight = time / impactAt;
    // Remap the bluff's rear-axle hold and plunge to the asphalt contact pose.
    const bluff = doorDriveTeaserPoseAt(DOOR_DRIVE_TEASER.fallStart + flight * bluffFlight);
    const drop = (bluffStart.position.y - bluff.position.y) / (bluffStart.position.y - bluffImpact.position.y);
    const pitchProgress = (bluff.pitch - bluffStart.pitch) / (bluffImpact.pitch - bluffStart.pitch);
    const rollProgress = (bluff.roll - bluffStart.roll) / (bluffImpact.roll - bluffStart.roll);
    return { phase: 'fall', across: mix(-4.64, impact.across, flight), along: mix(21.80, impact.along, flight),
      y: impact.y + 16 * (1 - drop), yaw: impact.yaw + bluffImpact.heading - bluff.heading,
      pitch: mix(-.14, impact.pitch, pitchProgress), roll: impact.roll * rollProgress,
      scaleY: 1, scaleZ: 1, door, wreck: false };
  }
  if (time < wreckAt) {
    const crush = (time - impactAt) / (wreckAt - impactAt);
    return { ...impact, phase: 'impact', across: impact.across - .27 * crush, along: impact.along + .19 * crush,
      y: impact.y - .52 * crush, pitch: impact.pitch + .16 * crush,
      scaleY: 1 - .10 * crush, scaleZ: 1 - .20 * crush, door, wreck: false };
  }
  if (time >= bodySettleAt) return { ...rest, phase: 'wreck', scaleY: 1, scaleZ: 1, door, wreck: true };
  const settle = clamp01((time - wreckAt) / (bodySettleAt - wreckAt));
  const weight = 1 - (1 - settle) ** 2.7;
  const bounce = Math.sin(settle * Math.PI * 2) * (1 - settle) ** 2 * (reducedMotion ? .09 : .22);
  return { phase: 'settle', across: mix(impact.across - .27, rest.across, weight),
    along: mix(impact.along + .19, rest.along, weight), y: mix(impact.y - .52, rest.y, weight) + Math.max(0, bounce),
    yaw: mix(impact.yaw, rest.yaw, weight), pitch: mix(impact.pitch + .16, rest.pitch, weight),
    roll: mix(impact.roll, rest.roll, weight) + bounce, scaleY: 1, scaleZ: 1, door, wreck: true };
}
