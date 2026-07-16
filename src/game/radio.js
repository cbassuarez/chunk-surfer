// The radio.
//
// The work order says: check in on the hour. That sentence is the only promise
// the client makes, and the radio is the only object in the game that keeps a
// promise — long enough to make the third room feel like a decision, and then
// never again.
//
//   INITIAL CHECK-IN               it works. Someone answers. Almost.
//   AFTER THE SECOND CLEAN ROOM     it opens one last time, and dies.
//   APPROACHING THE THIRD ROOM      dead air. Nothing else is promised.
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
import { RADIO_CUES } from '../data/radio-cues.js';
export { RADIO_CUES } from '../data/radio-cues.js';

export const RADIO = {
  squelchAfterSec: 30,      // grace after it dies. Let them believe it is over.
  cooldownSec: 55,          // hard floor between squelches
  expectThreshold: 0.72,    // fires below the stab director's bar: a squelch is
                            // smaller than a stab, so it may be cheaper
  noiseLevel: 0.34,         // above spoilNoise on the belt; a floor source is remote
  duringTakeChance: 0.55,   // and it prefers to
  approachMeters: 8,         // close enough to the next room to force the tree
};

const milestoneDefaults = () => ({
  [RADIO_CUES.INITIAL]: false,
  [RADIO_CUES.POST_SECOND]: false,
  [RADIO_CUES.PRE_THIRD]: false,
});

const state = {
  transmissions: 0,
  dead: false,
  diedAt: 0,
  lastSquelchAt: -1e9,
  squelches: 0,
  dropped: null,
  milestones: milestoneDefaults(),
  pendingCue: null,
  activeCue: null,
  candidateRoom: null,
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
export function radioMilestones(){return {...state.milestones};}
export function pendingRadioCue(){return state.pendingCue ? {...state.pendingCue} : null;}
export function activeRadioCue(){return state.activeCue ? {...state.activeCue} : null;}

function knownCue(id){return Object.values(RADIO_CUES).includes(id);}
function milestoneDone(id){return !!state.milestones[id];}

export function queueRadioCue(id, { roomId = null, reason = '' } = {}) {
  if (!knownCue(id) || state.dead || milestoneDone(id)) return false;
  if (state.activeCue || state.pendingCue) return false;
  state.pendingCue = { id, roomId: roomId || null, reason: reason || '', queuedAt: performance.now() };
  if (roomId) state.candidateRoom = roomId;
  return true;
}

export function consumeRadioCue() {
  if (!state.pendingCue) return null;
  const cue = state.pendingCue;
  state.pendingCue = null;
  state.activeCue = { ...cue, startedAt: performance.now() };
  return { ...state.activeCue };
}

export function resolveRadioCue(id) {
  if (!knownCue(id)) return false;
  state.milestones[id] = true;
  if (state.activeCue?.id === id) state.activeCue = null;
  if (state.pendingCue?.id === id) state.pendingCue = null;
  if (id === RADIO_CUES.POST_SECOND) killRadio();
  return true;
}

export function shouldQueuePostSecondTake({ completedTakes = 0, isRecording = false } = {}) {
  return !state.dead && !isRecording && completedTakes >= 2 && !milestoneDone(RADIO_CUES.POST_SECOND);
}

export function shouldQueuePreThirdBreakdown({
  completedTakes = 0,
  isRecording = false,
  nearestRoom = null,
  distanceMeters = Infinity,
  thresholdMeters = RADIO.approachMeters,
} = {}) {
  return !state.dead
    && !isRecording
    && completedTakes >= 2
    && milestoneDone(RADIO_CUES.POST_SECOND)
    && !milestoneDone(RADIO_CUES.PRE_THIRD)
    && !!nearestRoom
    && Number.isFinite(distanceMeters)
    && distanceMeters <= thresholdMeters;
}
export function dropRadio(x,y){
  if(state.dropped)return false;
  state.dropped={x:Math.round(x),y:Math.round(y)};
  return true;
}
export function pickUpRadio(x,y,maxCells=4){
  if(!state.dropped||Math.hypot(state.dropped.x-x,state.dropped.y-y)>maxCells)return false;
  state.dropped=null;return true;
}

// Scripted transmissions are content and live in data modules. This just counts
// radio use. The story scheduler kills it explicitly after the final breakdown.
export function transmit(lines) {
  if (state.dead) return false;
  state.transmissions++;
  state.onLine?.(lines, state.transmissions);
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
  REC.emitNoise(RADIO.noiseLevel, at.x, at.y, 'the radio', {
    spoils: !state.dropped,
    kind: 'radio_squelch',
    sourceKind: 'equipment',
    sourceId: 'radio',
    playerGenerated: false,
    deliberate: false,
  });
  const event = { at: now, duringTake: recording, index: state.squelches, x:at.x, y:at.y, dropped:!!state.dropped };
  state.onSquelch?.(event);
  return event;
}

export function loadRadioState(saved = {}) {
  state.transmissions = saved.transmissions || 0;
  state.squelches = saved.squelches || 0;
  state.dropped = saved.dropped && Number.isFinite(saved.dropped.x) && Number.isFinite(saved.dropped.y)
    ? {x:Math.round(saved.dropped.x),y:Math.round(saved.dropped.y)} : null;
  state.milestones = { ...milestoneDefaults(), ...(saved.milestones || {}) };
  // Saves from the previous timing contract may have completed the second-room
  // breakdown without marking the radio dead. The resolved cue is authoritative.
  state.dead = !!saved.dead || !!state.milestones[RADIO_CUES.POST_SECOND];
  state.pendingCue = saved.pendingCue && knownCue(saved.pendingCue.id) ? {
    id: saved.pendingCue.id,
    roomId: saved.pendingCue.roomId || null,
    reason: saved.pendingCue.reason || '',
    queuedAt: Number(saved.pendingCue.queuedAt) || 0,
  } : null;
  state.activeCue = null;
  state.candidateRoom = saved.candidateRoom || state.pendingCue?.roomId || null;
  if (state.dead) state.diedAt = performance.now();
}
export function saveRadioState() {
  return {
    transmissions: state.transmissions,
    dead: state.dead,
    squelches: state.squelches,
    dropped:state.dropped?{...state.dropped}:null,
    milestones:{...state.milestones},
    pendingCue:state.pendingCue?{...state.pendingCue}:null,
    candidateRoom:state.candidateRoom || null,
  };
}

export function resetRadioState() {
  state.transmissions = 0;
  state.dead = false;
  state.diedAt = 0;
  state.lastSquelchAt = -1e9;
  state.squelches = 0;
  state.dropped = null;
  state.milestones = milestoneDefaults();
  state.pendingCue = null;
  state.activeCue = null;
  state.candidateRoom = null;
}
