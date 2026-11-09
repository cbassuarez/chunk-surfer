// The keepsake in the player's hands: the interaction controller for the 3D
// handle-the-box UI. It owns the pickup/handling/put-down modes, routes look,
// shake, and pin-crank input into the winding mechanism, and exposes a frame
// the renderer draws and the audio owner voices. Pure and deterministic — no
// DOM, no AudioContext, no renderer — so it is testable and reusable.
import { freshHands, stepHands, handsSummary } from './hands.js';
import { windingCylinderAngle, windingKeyAngle, WINDING_PHASE } from './winding.js';
import {musicBoxInspectionMatrix,rotateMusicBoxInspection,freshMusicBoxInspectionRotation} from '../music-box-inspection.js';

export const HANDS_INTERACTION_MODE = Object.freeze({ AWAY: 'away', HANDLING: 'handling' });

const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(value) ? value : lo));
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;

export function freshHandsInteraction() {
  return {
    mode: HANDS_INTERACTION_MODE.AWAY,
    hands: freshHands(),
    boxRotation: freshMusicBoxInspectionRotation(), boxYaw: 0, boxPitch: 0, boxRoll: 0,   // orbit pose of the box in hand
    shakeLevel: 0,
    handlingElapsed: 0,
  };
}

// One deterministic step. input = {
//   pickUp, putDown,                 // mode transitions
//   pinHeld, crankDelta, shake,      // winding inputs (see hands.js)
//   lookDelta: { yaw, pitch },       // pointer orbit of the box
// }
export function stepHandsInteraction(value, input = {}, dt = 0) {
  const seconds = clamp(dt, 0, 0.25);
  const state = { ...value, hands: { ...value.hands, winding: { ...value.hands.winding } },
    boxYaw: finite(value.boxYaw), boxPitch: finite(value.boxPitch), boxRoll: finite(value.boxRoll), shakeLevel: finite(value.shakeLevel),
    handlingElapsed: finite(value.handlingElapsed) };

  if (state.mode === HANDS_INTERACTION_MODE.AWAY && input.pickUp === true) {
    state.mode = HANDS_INTERACTION_MODE.HANDLING; state.handlingElapsed = 0;
    return { state, events: [{ type: 'pickup', at: 0 }] };
  }
  if (state.mode === HANDS_INTERACTION_MODE.HANDLING && input.putDown === true) {
    // Put the box down; any held pin lets go and the winding slams.
    const release = stepHands(state.hands, { pinHeld: false, crankDelta: 0, shake: 0 }, seconds);
    state.mode = HANDS_INTERACTION_MODE.AWAY; state.hands = release.hands;
    state.shakeLevel = 0;
    return { state, events: [...release.events, { type: 'putdown', at: 0 }] };
  }
  if (state.mode !== HANDS_INTERACTION_MODE.HANDLING) return { state, events: [] };

  state.handlingElapsed += seconds;
  // Look orbits the box; crank and shake drive the winding.
  const look = input.lookDelta || {};
  if(input.resetView){state.boxYaw=state.boxPitch=state.boxRoll=0;state.boxRotation=freshMusicBoxInspectionRotation();}
  state.boxYaw = state.boxYaw + finite(look.yaw, 0);
  state.boxPitch = state.boxPitch + finite(look.pitch, 0);
  state.boxRoll = state.boxRoll + finite(look.roll, 0);
  state.boxRotation=rotateMusicBoxInspection(input.resetView?freshMusicBoxInspectionRotation():(value.boxRotation||freshMusicBoxInspectionRotation()),{yaw:finite(look.yaw),pitch:finite(look.pitch),roll:finite(look.roll)});

  const hands = stepHands(state.hands, {
    pinHeld: input.pinHeld === true, crankDelta: finite(input.crankDelta, 0), shake: finite(input.shake, 0),
  }, seconds);
  state.hands = hands.hands;
  state.shakeLevel = Math.max(0, state.shakeLevel * Math.exp(-seconds / 0.25) + clamp(input.shake, 0, 1) * 1.2);

  const events=[...hands.events],angle=Math.hypot(finite(look.yaw),finite(look.pitch),finite(look.roll));
  if(angle>.0005)events.push({type:'handling-rattle',at:0,amount:clamp(angle*4,0,1)});
  return { state, events };
}

export function handsInteractionFrame(value = freshHandsInteraction()) {
  const handling = value.mode === HANDS_INTERACTION_MODE.HANDLING;
  const summary = handsSummary(value.hands);
  const winding = value.hands.winding;
  return {
    mode: value.mode, handling,
    boxPose: { yaw: value.boxYaw, pitch: value.boxPitch, roll: value.boxRoll, rotation: value.boxRotation||freshMusicBoxInspectionRotation() },
    shakeLevel: clamp(value.shakeLevel, 0, 1),
    pinHeld: summary.pinHeld, crankRate: summary.crankRate,
    winding, summary,   // full winding state (renderer/mechanism) + summary (UI)
    cylinderAngle: windingCylinderAngle(winding), keyAngle: windingKeyAngle(winding),
    ui: {
      // The winding is broken; the pin must be held while turned. The hint only
      // shows until the player has cranked once, then the box speaks for itself.
      instruction: handling && winding.phase === WINDING_PHASE.REST && summary.crankRate === 0
        ? 'HOLD THE KEY AND TURN' : null,
      crank: handling ? 'F + W · TURN   E · LOWER' : null,
      putDown: handling ? 'E · PUT DOWN' : null,
    },
  };
}

// --- Held-box placement -----------------------------------------------------
// The box in hand floats in front of the camera eye, lowered to hand height,
// facing the player, then orbited by the player's look. worldFromLocal is rigid
// (rotation + translation), so its inverse is the transpose/negate shown here.
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function mat4Mul(a, b) {
  const out = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let sum = 0;
    for (let k = 0; k < 4; k++) sum += a[k * 4 + r] * b[c * 4 + k];
    out[c * 4 + r] = sum;
  }
  return out;
}

function invertRigid(m) {
  const r00 = m[0], r10 = m[1], r20 = m[2], r01 = m[4], r11 = m[5], r21 = m[6], r02 = m[8], r12 = m[9], r22 = m[10];
  const tx = m[12], ty = m[13], tz = m[14];
  return [
    r00, r01, r02, 0,
    r10, r11, r12, 0,
    r20, r21, r22, 0,
    -(r00 * tx + r10 * ty + r20 * tz), -(r01 * tx + r11 * ty + r21 * tz), -(r02 * tx + r12 * ty + r22 * tz), 1,
  ];
}

export function coastalHandsHeldLocal({eye,yaw=0,pitch=0,boxPose={},shake=0,worldFromLocal=IDENTITY,distance=.14,lower=0,boxHeight=.046}={}){
  const rotation=boxPose.rotation||rotateMusicBoxInspection(freshMusicBoxInspectionRotation(),{yaw:finite(boxPose.yaw),pitch:finite(boxPose.pitch),roll:finite(boxPose.roll)});
  const world=musicBoxInspectionMatrix({eye,yaw,pitch,rotation,distance,center:[0,boxHeight*.5,0]});
  // Only an explicit shake can displace the centre. Ordinary three-axis
  // inspection remains exactly centred through every turn and camera pose.
  const impulse=clamp(shake,0,1)*.003;
  world[12]+=Math.sin(yaw*13)*impulse;
  world[13]-=finite(lower);world[13]+=Math.cos(yaw*17)*impulse*.5;
  world[14]+=Math.sin(yaw*11)*impulse;
  return mat4Mul(invertRigid(worldFromLocal),world);
}
