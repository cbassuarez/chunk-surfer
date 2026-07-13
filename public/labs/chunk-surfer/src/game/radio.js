// The radio.
//
// The work order says: check in on the hour. That sentence is the only promise
// the client makes, and the radio is the only object in the game that keeps a
// promise — twice, and then never again.
//
//   TRANSMISSION 1 (the dock)      it works. Someone answers. Almost.
//   TRANSMISSION 2 (the first take) it works. Someone answers, and what
//                                   answers is closer to the microphone than a
//                                   person on the other end of a radio can be.
//   AFTER                          dead. And it squelches.
//
// The squelch is the design. A dead radio is a prop; a dead radio that emits
// noise on its own schedule is a HAZARD. It begins clipped to your belt, but the
// bag lets you put it down: after that its noise remains at the drop point and
// can pull the building away from you. [E] recovers it if you return.
//
// It is not random. A squelch is a stab you are carrying: it fires when the
// player has decided they are safe. On the belt it spoils a take. On the floor
// it belongs to the building: the presence still hears it, but the recorder at
// the player's body does not pretend a distant squelch happened in its room.
//
// `reduceDread` silences it. The radio still dies. It just stops hunting you.

import * as REC from './recordist.js';
import { dreadAllowed } from './terror.js';

export const RADIO = {
  squelchAfterSec: 30,      // grace after it dies. Let them believe it is over.
  cooldownSec: 55,          // hard floor between squelches
  expectThreshold: 0.72,    // fires below the stab director's bar: a squelch is
                            // smaller than a stab, so it may be cheaper
  noiseLevel: 0.34,         // above spoilNoise on the belt; a floor source is remote
  duringTakeChance: 0.55,   // and it prefers to
};

const state = {
  transmissions: 0,
  dead: false,
  diedAt: 0,
  lastSquelchAt: -1e9,
  squelches: 0,
  dropped: null,
  onSquelch: null,
  onLine: null,
};

export function radioInit({ squelch, line } = {}) {
  state.onSquelch = squelch || null;
  state.onLine = line || null;
}

export function radioState() { return { ...state, onSquelch: undefined, onLine: undefined }; }
export function isDead() { return state.dead; }
export function squelchCount() { return state.squelches; }
export function isDropped(){return !!state.dropped;}
export function radioLocation(){return state.dropped?{...state.dropped}:null;}
export function dropRadio(x,y){
  if(state.dropped)return false;
  state.dropped={x:Math.round(x),y:Math.round(y)};
  return true;
}
export function pickUpRadio(x,y,maxCells=4){
  if(!state.dropped||Math.hypot(state.dropped.x-x,state.dropped.y-y)>maxCells)return false;
  state.dropped=null;return true;
}

// The two scripted transmissions. `TRANSMISSIONS` is content and lives in
// data/conservatory-script.js; this just counts them and then kills the thing.
export function transmit(lines) {
  if (state.dead) return false;
  state.transmissions++;
  state.onLine?.(lines, state.transmissions);
  if (state.transmissions >= 2) {
    state.dead = true;
    state.diedAt = performance.now();
  }
  return true;
}

// Kill it early — the fake-crash beat in M5 does this.
export function killRadio() {
  if (state.dead) return;
  state.dead = true;
  state.diedAt = performance.now();
}

function eligible(now) {
  if (!state.dead) return false;
  if (!dreadAllowed()) return false;
  if ((now - state.diedAt) / 1000 < RADIO.squelchAfterSec) return false;
  if ((now - state.lastSquelchAt) / 1000 < RADIO.cooldownSec) return false;
  return true;
}

// `expectation` comes from the stab director: how safe the player feels, 0..1.
// `px,py` is where the noise lands — at your belt, which is to say at you. The
// presence hunts the cell where noise was MADE. This is the only sound in the
// game that is made where you are standing.
export function tickRadio(dt, { expectation = 0, px = 0, py = 0 } = {}) {
  const now = performance.now();
  if (!eligible(now)) return null;

  const recording = REC.isRecording();
  if (recording) {
    // It will not steal a take that is nearly won. Same mercy the stabs get.
    if (REC.takeProgress() > 0.85) return null;
    if (Math.random() > RADIO.duringTakeChance) return null;
  } else if (expectation < RADIO.expectThreshold) {
    return null;
  }

  state.lastSquelchAt = now;
  state.squelches++;
  const at=state.dropped||{x:px,y:py};
  REC.emitNoise(RADIO.noiseLevel, at.x, at.y, 'the radio', { spoils: !state.dropped });
  const event = { at: now, duringTake: recording, index: state.squelches, x:at.x, y:at.y, dropped:!!state.dropped };
  state.onSquelch?.(event);
  return event;
}

export function loadRadioState(saved = {}) {
  state.transmissions = saved.transmissions || 0;
  state.dead = !!saved.dead;
  state.squelches = saved.squelches || 0;
  state.dropped = saved.dropped && Number.isFinite(saved.dropped.x) && Number.isFinite(saved.dropped.y)
    ? {x:Math.round(saved.dropped.x),y:Math.round(saved.dropped.y)} : null;
  if (state.dead) state.diedAt = performance.now();
}
export function saveRadioState() {
  return { transmissions: state.transmissions, dead: state.dead, squelches: state.squelches, dropped:state.dropped?{...state.dropped}:null };
}
