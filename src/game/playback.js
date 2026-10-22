import { TOWER_PERSONAL_CUE, playTowerPersonalRecording } from '../audio/tower-personal-recording.js';
import { decodeSourceDriveMedia, normalizeSourceDriveMedia, SOURCE_DRIVE_CAPTURE_KIND, sourceDriveAudioKey } from '../audio/source-drive-recording.js';

// Playback. The take contains what you did not hear.
//
// This is the single strongest thing the audio engine can do, and it costs
// almost nothing: during a take, the monitor opens and a handful of the room's
// voices become audible. We write down exactly which ones. When the recordist
// plays the take back, we play those voices again — faithfully, the same
// buffers, the same gains — and we add ONE that was never in the room.
//
// The guest enters below the noise floor and rises. It is not a stab. It does
// not startle. It arrives at a level the player will spend several seconds
// deciding they are imagining, which is the level at which a thing is most
// frightening, and then it is unmistakably there.
//
// Two disciplines:
//
//   · THE TAPE DOES NOT LIE ABOUT THE ROOM. Every voice that was audible is
//     played back at the level it had. If we falsified the take the player
//     would learn that the recorder is unreliable, and an unreliable recorder
//     is just a haunted object. The recorder is the one honest thing you own.
//     It heard something. That is a different, worse claim.
//
//   · PLAYBACK IS SILENT IN THE ROOM. It is in your headphones. It emits no
//     noise, spoils nothing, attracts nothing. The horror is that you have to
//     take the headphones off afterwards, and the room is where you left it.
//
// The guest is drawn from the catalogue, pitched down and low-passed so it is
// the same material as the room and plainly not of it.

// ── THE ONE TAPE STORE ───────────────────────────────────────────────────────
//
// There used to be two, and they disagreed. The room ids went into the save
// under `rec` and came back on load; the sealed tape lived in this Map and did
// not, because a tape was assumed to be session furniture. So after a quit and
// resume, REC.hasTake('the_tub') was true and PB.hasTake('the_tub') was false,
// and pressing playback in a room you had recorded said "Nothing recorded in
// this room" about your own take. Nobody noticed because playback is one key
// pressed rarely; a machine that lists your takes would have said it constantly.
//
// A sealed take was always serialisable — `audible` is [[sampleKey, level]],
// not buffers, and the buffers are resolved through `chunkById` at play time.
// The one exception was the guest, which held a chunk. It holds a KEY now and
// resolves the same way, which is what lets the seal rule survive a reload:
// the guest is chosen once and stored, never re-rolled.
const state = {
  takes: new Map(),          // roomId -> record (see freshRecord)
  history: [],              // physical order, including failed attempts
  head: 0, end: 0, seeking: null,
  playing: null,             // { roomId, nodes:[], startedAt, endsAt }
  ctx: null,
  bus: null,
  pickGuest: null,           // (roomId, audibleIds) -> chunk
  chunkById: null,           // (id) -> chunk
  keyOf: null,               // (chunk) -> stable string, for the save
  chunkByKey: null,          // (key) -> chunk, coming back
  onGuest: null,             // fired when the guest crosses audibility
  scheduleDiscrete: null,
  onTransport: null, playSlate: null,
  loadContinuousMedia: null, onPlaybackError: null, lastError: null,
};
let continuousCaptureSerial=0;

export const PLAYBACK = {
  seconds: 22,               // default for legacy presentation-only snapshots
  bedGain: 0.014,
  guestDelaySec: 6.5,        // long enough to relax into the tape
  guestRiseSec: 9.0,         // and slow enough to disbelieve
  guestPeak: 0.30,
  guestRate: 0.72,           // pitched down: the same room, lower in the throat
  guestCutoff: 1600,

  // ── THE SECOND WITNESS ────────────────────────────────────────────────────
  // The needle and the tape were wired to the same input, so they agree with
  // each other and disagree with your ears. When the meter climbed in a silent
  // room during the take, the tape has to carry the thing that put it there —
  // at that level, and at that moment in the minute.
  //
  // This is not the tape lying about the room. It is the opposite, and it is why
  // the module's first discipline survives: something was genuinely at the
  // microphone, the meter said so at the time, and the recording agrees. An
  // unreliable recorder is a haunted object; a recorder that heard something is
  // a worse claim, and it is only worth making if the instruments corroborate.
  sourceSeconds: 45,         // old saves without a recorded duration
  presenceFloor: 0.12,       // under this the take is an ordinary take
  presenceGain: 1.15,        // how much a close pass adds to the guest
  guestCeiling: 0.62,        // it is still a recording, not a jump scare
  guestRiseFastSec: 4.2,     // close, it stops being deniable sooner
  guestEnterMinSec: 1.4,     // never on top of the take's own fade-in
};

export function playbackInit({ ctx, bus, pickGuest, chunkById, keyOf, chunkByKey, onGuest, scheduleDiscrete, onTransport, playSlate, loadContinuousMedia, onPlaybackError } = {}) {
  state.ctx = ctx || state.ctx;
  state.bus = bus || state.bus;
  if (pickGuest) state.pickGuest = pickGuest;
  if (chunkById) state.chunkById = chunkById;
  if (keyOf) state.keyOf = keyOf;
  if (chunkByKey) state.chunkByKey = chunkByKey;
  if (onGuest) state.onGuest = onGuest;
  if(scheduleDiscrete)state.scheduleDiscrete=scheduleDiscrete;
  if(onTransport)state.onTransport=onTransport;
  if(playSlate)state.playSlate=playSlate;
  if(loadContinuousMedia!==undefined)state.loadContinuousMedia=loadContinuousMedia;
  if(onPlaybackError!==undefined)state.onPlaybackError=onPlaybackError;
}

// A continuous field take is actual encoded cabin audio, on the same tape as
// room attempts. It is never a room-tone job, never receives a catalogue guest,
// and is never reconstructed if its local media is missing.
export function beginContinuousFieldTake({runId,place='Source · recorded journey',metadata={}}={}) {
  if(!runId||isPlaying()||hasOpenTake()||Math.abs(state.head-state.end)>.051)return null;
  const ordinal=state.history.length+1,id=`take:${ordinal}`,roomId=`source-drive-field:${ordinal}`;
  const captureId=globalThis.crypto?.randomUUID?.()||`${Date.now().toString(36)}-${++continuousCaptureSerial}`;
  const take={id,ordinal,roomId,startSeconds:state.end,endSeconds:state.end,durationSeconds:.01,
    status:'archived',counted:false,sealed:false,at:Date.now(),cell:null,place,contaminated:false,
    levels:new Map(),audible:[],discrete:[],guest:null,presence:{peak:0,atSec:0},
    continuous:{schema:1,kind:SOURCE_DRIVE_CAPTURE_KIND,key:sourceDriveAudioKey(runId,id,captureId),runId:String(runId),takeId:id,captureId,pending:true,durable:false},
    fieldMetadata:JSON.parse(JSON.stringify(metadata||{}))};
  state.history.push(take);state.takes.set(roomId,take);state.head=state.end=take.startSeconds;return take;
}
export function advanceContinuousFieldTake(id,elapsedSeconds,identity={}) {
  const take=state.history.find(t=>t.id===id);if(!take?.continuous||take.sealed||take!==state.history.at(-1)||identity.runId&&take.continuous.runId!==identity.runId||identity.captureId&&take.continuous.captureId!==identity.captureId)return false;
  take.endSeconds=take.startSeconds+Math.max(0,Number(elapsedSeconds)||0);state.head=state.end=take.endSeconds;return true;
}
export function cancelContinuousFieldTake(id,identity={}) {
  const take=state.history.at(-1);if(take?.id!==id||!take.continuous||take.sealed||take.endSeconds>take.startSeconds+.001||identity.runId&&take.continuous.runId!==identity.runId||identity.captureId&&take.continuous.captureId!==identity.captureId)return false;
  state.history.pop();state.takes.delete(take.roomId);state.head=state.end=take.startSeconds;return true;
}
export function sealContinuousFieldTake(id,{durationSeconds,media,reason='stop'}={}) {
  const take=state.history.find(t=>t.id===id),ref=normalizeSourceDriveMedia(media),duration=Number(durationSeconds);
  if(!take?.continuous||!ref?.durable||ref.pending||ref.takeId!==id||ref.runId!==take.continuous.runId||ref.key!==take.continuous.key||ref.captureId!==take.continuous.captureId||!Number.isFinite(duration)||duration<=0||Math.abs(duration-ref.durationSeconds)>.001)return null;
  if(take.sealed&&!take.continuous.pending)return take;
  // The final decoded sample count reconciles the estimate while this remains
  // the last/open physical interval. Nothing later can overlap that interval.
  if(take!==state.history.at(-1))return null;
  take.durationSeconds=duration;take.endSeconds=take.startSeconds+duration;take.continuous=ref;take.sealed=true;take.status='archived';take.counted=false;take.cleanSeconds=0;take.fieldEndReason=String(reason);delete take.mediaUnavailable;
  take.guest=null;take.audible=[];take.discrete=[];state.head=state.end=take.endSeconds;return take;
}
export function interruptContinuousFieldTake(id,{elapsedSeconds=0,reason='interrupted',key,runId,captureId}={}) {
  const take=state.history.find(t=>t.id===id);if(!take?.continuous||take.continuous.durable||key&&take.continuous.key!==key||runId&&take.continuous.runId!==runId||captureId&&take.continuous.captureId!==captureId)return null;
  take.durationSeconds=Math.max(.01,Number(elapsedSeconds)||take.durationSeconds||.01);take.endSeconds=take.startSeconds+take.durationSeconds;take.sealed=true;take.status='archived';take.counted=false;take.mediaUnavailable=true;take.fieldEndReason=String(reason);
  if(take===state.history.at(-1))state.head=state.end=take.endSeconds;return take;
}

// A sample's identity ON DISK. The in-memory key is the manifest index, which
// is only stable while the manifest is; a name survives a sample being added or
// reordered, which is the one thing certain to happen between a player's saves.
const sampleKey = (chunk) => (state.keyOf ? state.keyOf(chunk) : null) || chunk?.name || null;

// A REFERENCE IS RESOLVED LATE, AND MAY BE EITHER KIND.
//
// While a take is being rolled the reference is the manifest index, because
// that is what the monitor hands us every frame. Off the disk it is a name.
// Both are resolved here, at the moment the tape is played — which matters
// because samples arrive over the network long after the save is read, so
// anything that resolved at load time would find an empty catalogue and drop
// every voice off the tape.
const sampleFor = (ref) => {
  if (ref == null) return null;
  if (typeof ref === 'number') return state.chunkById?.(ref) || null;
  return (state.chunkByKey ? state.chunkByKey(ref) : null) || null;
};

// ── the tape ────────────────────────────────────────────────────────────────
// main.js calls this every frame during a take with the voices the monitor is
// actually passing. We keep the loudest level each voice ever reached, which
// is what a microphone does.
export function noteAudible(roomId, chunkId, gain) {
  if (!roomId || chunkId == null) return;
  const t = state.takes.get(roomId);
  if (!t || t.sealed) return;
  const prev = t.levels.get(chunkId) || 0;
  if (gain > prev) t.levels.set(chunkId, gain);
}

export function noteDiscrete(roomId,event={}){
  const take=state.takes.get(roomId);if(!take||take.sealed)return;
  take.discrete.push({cueId:String(event.cueId||''),atSec:Math.max(0,Number(event.atSec)||0),gain:Number.isFinite(Number(event.gain))?Number(event.gain):1,pan:Math.max(-1,Math.min(1,Number(event.pan)||0)),provenance:{...(event.provenance||{})}});
}

const sourceDuration = (value) => {
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? Math.max(.01, Math.min(3600, seconds)) : PLAYBACK.sourceSeconds;
};
const sourcePosition = (atSec, durationSeconds) => {
  const seconds = Number(atSec);
  return Math.max(0, Math.min(1, (Number.isFinite(seconds) ? seconds : 0) / sourceDuration(durationSeconds)));
};

export function beginTake(roomId, cell, { durationSeconds = PLAYBACK.sourceSeconds } = {}) {
  const previous=state.takes.get(roomId);
  state.takes.set(roomId, {
    previous:previous?.sealed?previous:previous?.previous||null,
    roomId, cell: { ...cell }, levels: new Map(), discrete: [],
    durationSeconds: sourceDuration(durationSeconds),
    presence: { peak: 0, atSec: 0 }, sealed: false, at: 0,
    // Was the room humming when this was rolled, and where in it did he stand.
    // Both used to live in their own arrays on the recordist, keyed by room, so
    // one take was three entries in three places that could each be edited
    // without the others.
    contaminated: false, place: null,
  });
}

// The two facts the recordist used to hold separately. Set when the take is
// accepted, which is after sealTake — the tape is already closed by then, so
// this is the paperwork rather than the recording.
export function markTake(roomId, { contaminated = false, place = null } = {}) {
  const take = state.takes.get(roomId);
  if (!take) return false;
  take.contaminated = !!contaminated;
  // First clean take of a room owns its place; a tape does not re-roll.
  if (place && !take.place) take.place = place;
  // COUNTED IS NOT THE SAME QUESTION AS SEALED.
  //
  // The minute completes and the job counts it about thirty lines before the
  // transport stops and the tape is closed. "Is this room done" is true from
  // the first moment; "is there a tape I can play" is only true once it is
  // sealed. They used to be the same boolean in two different modules, which is
  // why they could disagree; they are two predicates on one record now.
  take.counted = true;
  return true;
}

// WHAT STOOD NEXT TO THE MICROPHONE, AND WHEN.
//
// `level` must be the same number the meter drew — not a proximity, not a
// distance, the reading. The whole point is that the two instruments cannot be
// caught disagreeing, because they never were: one of them is just a needle and
// the other is a tape, and the man in the middle heard nothing either way.
//
// Peak-hold, like every other level on this tape: it is what a microphone does,
// and it means a single close pass is on the recording forever.
export function notePresence(roomId, level, atSec = 0) {
  const t = state.takes.get(roomId);
  if (!t || t.sealed) return;
  const value = Math.max(0, Math.min(1, Number(level) || 0));
  // A take that arrived from anywhere but beginTake has no peak yet.
  if (!t.presence) t.presence = { peak: 0, atSec: 0 };
  if (value <= t.presence.peak) return;
  t.presence = { peak: value, atSec: Math.max(0, Number(atSec) || 0) };
}

export function abortTake(roomId) {
  const take=state.takes.get(roomId);
  if(take?.sealed)return false;
  if(take?.previous)state.takes.set(roomId,take.previous);
  else state.takes.delete(roomId);
  return true;
}

export function startTapeTake(roomId, slate = null) {
  const take=state.takes.get(roomId);
  if(!take||take.sealed)return null;
  take.id=`take:${state.history.length+1}`;
  take.ordinal=state.history.length+1;
  take.startSeconds=state.end;
  take.endSeconds=state.end;
  take.slate=slate;
  state.head=state.end;
  return take;
}

export function advanceTape(roomId, elapsedSeconds) {
  const take=state.takes.get(roomId);
  if(!take?.id||take.sealed)return;
  take.endSeconds=take.startSeconds+Math.max(0,Number(elapsedSeconds)||0);
  state.head=state.end=Math.max(state.end,take.endSeconds);
}

export function finishTapeTake(roomId, result = {}) {
  const take=state.takes.get(roomId);
  if(!take||take.sealed)return null;
  if(!take.id)startTapeTake(roomId);
  advanceTape(roomId,result.tapeElapsed??result.elapsed??0);
  take.durationSeconds=Math.max(.01,take.endSeconds-take.startSeconds);
  take.cleanSeconds=Math.max(0,result.elapsed||0);
  take.status=result.completed?'accepted':result.spoiled?'spoiled':'abandoned';
  take.counted=!!result.completed;
  const sealed=sealTake(roomId);
  if(!result.completed){
    if(take.previous)state.takes.set(roomId,take.previous);
    else state.takes.delete(roomId);
  }
  delete take.previous;
  return sealed;
}

export function tapeTakes(){return state.history.slice();}
export function tapeTransport(){return {version:2,headSeconds:state.head,endSeconds:state.end,markers:(state.markers||[]).map(m=>({...m}))};}
export function loadTapeTransport(saved){
  state.head=Math.max(0,Math.min(state.end,Number.isFinite(saved?.headSeconds)?saved.headSeconds:state.end));
  state.markers=Array.isArray(saved?.markers)?saved.markers.filter(m=>m&&m.id&&Number.isFinite(Number(m.atSeconds))).map(m=>({id:String(m.id),kind:String(m.kind||'mark'),label:String(m.label||''),atSeconds:Number(m.atSeconds)})):[];
}
// THE TAPE PLAYED WITHOUT THE MACHINE: the phone box runs it through its slot
// one second per second connected (src/game/payphone-tape.js). The head moves;
// nothing on the tape changes; it never runs past the end.
export function advanceHeadTo(seconds){
  if(state.playing||state.seeking)return state.head;
  state.head=Math.max(0,Math.min(state.end,Number(seconds)||0));
  return state.head;
}
// Things that got onto the tape without being a take (his voicemail to Lyle,
// recorded while the tape was in the slot). One per id.
export function addTapeMarker({id,kind='mark',label='',atSeconds=0}={}){
  if(!id)return null;
  state.markers=(state.markers||[]).filter(m=>m.id!==id);
  const marker={id:String(id),kind:String(kind),label:String(label),atSeconds:Math.max(0,Math.min(state.end,Number(atSeconds)||0))};
  state.markers.push(marker);state.markers.sort((a,b)=>a.atSeconds-b.atSeconds);
  return {...marker};
}
export function tapeMarkers(){return (state.markers||[]).map(m=>({...m}));}
export function removeTapeMarker(id){const before=(state.markers||[]).length;state.markers=(state.markers||[]).filter(m=>m.id!==id);return state.markers.length!==before;}
export function tapeTake(id){return state.history.find(t=>t.id===id)||state.takes.get(id)||null;}

// A recording received in the world occupies the same physical tape as the
// player's takes. Its authored material never picks a guest or counts as work.
// The stable room id makes receipt idempotent, including recovery after reload.
export function archiveAuthoredTake({ roomId, durationSeconds, discrete = [], place = null } = {}) {
  if (!roomId || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return null;
  const existing = state.history.find(t => t.roomId === roomId && !t.voided);
  if (existing) return existing;
  if (hasOpenTake()) return null;
  const duration = sourceDuration(durationSeconds), ordinal = state.history.length + 1;
  const take = { id: `take:${ordinal}`, ordinal, roomId, startSeconds: state.end,
    endSeconds: state.end + duration, durationSeconds: duration, cleanSeconds: 0,
    status: 'archived', counted: false, sealed: true, authored: true,
    at: Date.now(), contaminated: false, place, cell: null, levels: new Map(),
    audible: [], guest: null, presence: { peak: 0, atSec: 0 },
    discrete: discrete.map((e) => ({ cueId: String(e.cueId || ''),
      atSec: Math.max(0, Math.min(duration, Number(e.atSec) || 0)),
      gain: Number.isFinite(Number(e.gain)) ? Number(e.gain) : 1, pan: 0,
      provenance: { system: 'authored-recording', ...(e.provenance || {}) } })),
  };
  state.history.push(take); state.takes.set(roomId, take);
  state.head = state.end = take.endSeconds;
  return take;
}

function seekTo(target, then=null){
  const distance=Math.abs(target-state.head);
  if(distance<.05)return false;
  const seconds=Math.min(3,Math.max(.35,distance/60));
  const sound=state.onTransport?.(target<state.head?'rewind':'forward',seconds);
  state.seeking={from:state.head,to:target,startedAt:state.ctx?.currentTime||0,seconds,then,sound};
  return true;
}
export function cueTapeEnd(){return seekTo(state.end);}

// A completed take is sealed: the guest is chosen once and never re-rolled, so
// playing the tape twice plays the same tape. A tape that changes is a dream.
export function sealTake(roomId) {
  const t = state.takes.get(roomId);
  if (!t || t.sealed) return null;
  const audible = [...t.levels.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  t.audible = audible;
  // THE GUEST IS A KEY, NOT A BUFFER. It used to be the chunk itself, which is
  // the one field that stopped a sealed take being writable to disk — and a
  // take that cannot be written is a take that is gone the next time the game
  // opens. Chosen once here and never again; playTake resolves it.
  const guest = state.pickGuest?.(roomId, audible.map(([id]) => id)) || null;
  t.guest = guest ? { id: guest.idx, key: sampleKey(guest) } : null;
  t.sealed = true;
  t.at = Date.now();
  if(!t.id){
    t.id=`take:${state.history.length+1}`;t.ordinal=state.history.length+1;
    t.startSeconds=state.end;t.endSeconds=state.end+sourceDuration(t.durationSeconds);
    state.head=state.end=t.endSeconds;
  }
  t.status ||= 'accepted';
  if(!state.history.includes(t))state.history.push(t);
  return t;
}

export function hasTake(roomId) { return !!tapeTake(roomId)?.sealed; }
export function takeFor(roomId) { return state.takes.get(roomId) || null; }

// WHERE IN THE MINUTE THINGS HAPPENED.
//
// The location indicator used to draw one number — how far through you are —
// across the widest element on the panel. Everything below was already being
// recorded and had nowhere to be seen: after a spoiled take you knew THAT it
// went wrong and never when.
//
// Positions are 0..1 across the take's own length, so the strip and the time
// counter cannot disagree. Works on a take still rolling as well as a sealed
// one, because both are the same record.
export function takeMarks(roomId, { seconds = null } = {}) {
  const t = state.takes.get(roomId);
  if (!t) return [];
  const span = sourceDuration(seconds ?? t.durationSeconds);
  const at = (sec) => sourcePosition(sec, span);
  const marks = [];
  for (const event of t.discrete || []) {
    marks.push({ at: at(event?.atSec), kind: 'event', id: String(event?.cueId || 'event') });
  }
  // The closest the presence came, and when. One mark, not a trail: it is a
  // peak-hold, so a single close pass is on the tape forever.
  if (t.presence?.peak > PLAYBACK.presenceFloor) {
    marks.push({ at: at(t.presence.atSec), kind: 'presence', id: 'presence' });
  }
  return marks.sort((a, b) => a.at - b.at);
}
export function hasOpenTake() { return [...state.takes.values()].some(take => !take.sealed); }
export function isPlaying() { return !!state.playing || !!state.seeking; }

// ── the store, read ──────────────────────────────────────────────────────────
// Everything the recordist used to answer from three parallel arrays. Order is
// the order they were rolled, which is the ordinal the job sheet prints.
// The job sheet: every room that has been recorded, whether or not the
// transport has settled yet.
export function sealedTakes() { return [...state.takes.values()].map(t=>t.sealed||t.counted?t:t.previous).filter(Boolean); }
export function takeRoomIds() { return sealedTakes().filter((t) => t.counted !== false).map((t) => t.roomId); }
export function takeIsContaminated(roomId) { return !!state.takes.get(roomId)?.contaminated; }
export function contaminatedRooms() { return sealedTakes().filter((t) => t.contaminated).map((t) => t.roomId); }
export function takePlace(roomId) { return state.takes.get(roomId)?.place || null; }
export function takePlaces() {
  return Object.fromEntries(sealedTakes().filter((t) => t.place).map((t) => [t.roomId, t.place]));
}
// Explicit, non-narrative fixtures. Never relax markTake() to invent a tape.
// Validate the complete batch before writing: a busy deck or malformed room
// must not leave half of the work order granted. Existing real tapes are kept
// byte-for-byte, including their guest, contamination, timestamps and location.
export function debugSetTakes(roomIds, present = true, { durationSeconds = PLAYBACK.sourceSeconds, cells = {}, places = {} } = {}) {
  if (!Array.isArray(roomIds) || roomIds.some(id => typeof id !== 'string' || !id.trim()) || typeof present !== 'boolean') {
    return { ok: false, changed: 0, reason: 'INVALID TAKE REQUEST' };
  }
  if (isPlaying() || hasOpenTake()) {
    return { ok: false, changed: 0, reason: 'STOP RECORDING / PLAYBACK FIRST' };
  }
  const ids = [...new Set(roomIds)], staged = [];
  if (present) {
    for (const roomId of ids) {
      if (state.takes.has(roomId)) continue;
      const cell = cells[roomId] ?? null;
      if (cell && (!Number.isFinite(cell.x) || !Number.isFinite(cell.y))) {
        return { ok: false, changed: 0, reason: `INVALID TAKE LOCATION: ${roomId}` };
      }
      const duration = sourceDuration(durationSeconds), ordinal = state.history.length + staged.length + 1;
      const start = staged.at(-1)?.endSeconds ?? state.end;
      staged.push({
        id: `take:${ordinal}`, ordinal, roomId, cell: cell ? { ...cell } : null,
        startSeconds: start, endSeconds: start + duration, durationSeconds: duration,
        cleanSeconds: duration, status: 'accepted', counted: true, sealed: true,
        debug: true, at: Date.now(), contaminated: false, place: places[roomId] || null,
        levels: new Map(), audible: [], discrete: [], guest: null,
        presence: { peak: 0, atSec: 0 },
      });
    }
    for (const take of staged) { state.history.push(take); state.takes.set(take.roomId, take); }
    if (staged.length) state.head = state.end = staged.at(-1).endSeconds;
    return { ok: true, changed: staged.length, reason: '' };
  }
  let changed = 0;
  for (const id of ids) if (forgetTake(id)) changed++;
  return { ok: true, changed, reason: '' };
}

export function forgetTake(roomId) {
  for(const take of state.history)if(take.roomId===roomId)take.voided=true;
  return state.takes.delete(roomId);
}

// ── the store, written to disk ───────────────────────────────────────────────
//
// `levels` is deliberately dropped: it is the running peak-hold used to compute
// `audible` at seal time and is dead weight afterwards. Everything else is
// plain data, and every sample reference goes out as a NAME so it survives the
// manifest changing under it.
export function serializeTakes() {
  return [...new Set([...state.history,...sealedTakes(),...[...state.takes.values()].filter(t=>t.id&&!t.sealed)])].map((t) => ({
    id:t.id,ordinal:t.ordinal,startSeconds:t.startSeconds,endSeconds:t.endSeconds,
    status:t.status||(t.id&&!t.sealed?'abandoned':'accepted'),cleanSeconds:Number(t.cleanSeconds)||0,slate:t.slate?{...t.slate}:null,
    voided:!!t.voided,
    ...(t.authored ? { authored: true } : {}),
    ...(t.debug ? { debug: true } : {}),
    ...(t.continuous ? { continuous: {...t.continuous}, fieldMetadata:{...(t.fieldMetadata||{})}, fieldEndReason:t.fieldEndReason||null, mediaUnavailable:!!t.mediaUnavailable } : {}),
    roomId: t.roomId,
    at: t.at,
    durationSeconds: t.continuous?Math.max(.01,t.endSeconds-t.startSeconds):t.id&&!t.sealed?Math.max(.01,t.endSeconds-t.startSeconds):sourceDuration(t.durationSeconds),
    counted: t.status? t.status==='accepted'&&!t.voided : !t.id||!!t.sealed,
    migrated: !!t.migrated,
    cell: t.cell ? { x: Number(t.cell.x)||0, y: Number(t.cell.y)||0 } : null,
    contaminated: !!t.contaminated,
    place: t.place || null,
    presence: { peak: t.presence?.peak || 0, atSec: t.presence?.atSec || 0 },
    audible: (t.audible || [...(t.levels||new Map()).entries()].sort((a,b)=>b[1]-a[1]).slice(0,6)).map(([ref, level]) => [
      typeof ref === 'number' ? (sampleKey(state.chunkById?.(ref)) || String(ref)) : String(ref),
      level,
    ]),
    guest: t.guest ? { key: t.guest.key || null } : null,
    discrete: (t.discrete || []).map((e) => ({ ...e })),
  }));
}

// Coming back. A sample whose name is no longer in the manifest is simply not
// on the tape any more — the take still plays, one voice quieter, rather than
// refusing to play at all.
export function loadTakes(saved = []) {
  stopPlayback();
  state.takes.clear();
  state.history=[];state.head=0;state.end=0;
  for (const row of Array.isArray(saved) ? saved : []) {
    if (!row?.roomId) continue;
    // Kept as names. sampleFor resolves either kind at play time.
    const audible = (row.audible || []).filter((pair) => Array.isArray(pair) && pair.length === 2);
    // Malformed/missing continuous metadata remains visibly unavailable. Never
    // let it fall through to room reconstruction and manufacture a new take.
    const continuous=row.continuous?normalizeSourceDriveMedia(row.continuous):null;
    const duration=continuous?.durable?continuous.durationSeconds:sourceDuration(row.durationSeconds);
    const take={
      id:`take:${state.history.length+1}`,ordinal:state.history.length+1,
      startSeconds:state.end,endSeconds:state.end+duration,
      status:['abandoned','spoiled','archived'].includes(row.status)?row.status:'accepted',
      cleanSeconds:Number(row.cleanSeconds)||0,slate:row.slate?{...row.slate}:null,voided:!!row.voided,
      ...(row.debug ? { debug: true } : {}),
      ...(row.authored ? { authored: true } : {}),
      ...(row.continuous ? { continuous:continuous||{schema:1,kind:SOURCE_DRIVE_CAPTURE_KIND,pending:true,durable:false,key:String(row.continuous.key||''),runId:String(row.continuous.runId||''),takeId:String(row.continuous.takeId||''),captureId:String(row.continuous.captureId||'')},fieldMetadata:{...(row.fieldMetadata||{})},fieldEndReason:row.fieldEndReason||null,mediaUnavailable:!!row.mediaUnavailable||!continuous||!!continuous.pending } : {}),
      roomId: row.roomId,
      durationSeconds: duration,
      cell: row.cell ? { ...row.cell } : row.debug || row.authored || row.continuous ? null : { x: 0, y: 0 },
      levels: new Map(),
      discrete: (row.discrete || []).map((e) => ({ ...e })),
      presence: { peak: row.presence?.peak || 0, atSec: row.presence?.atSec || 0 },
      contaminated: !!row.contaminated,
      place: row.place || null,
      audible:row.continuous?[]:audible,
      guest: !row.continuous&&row.guest?.key ? { id: null, key: row.guest.key } : null,
      sealed: true,
      counted: row.continuous?false:row.counted!==false,
      at: row.at || 0,
      migrated: !!row.migrated,
    };
    state.history.push(take);state.head=state.end=take.endSeconds;
    if(['accepted','archived'].includes(take.status)&&!take.voided)state.takes.set(row.roomId,take);
  }
  return state.takes.size;
}

// AN OLD SAVE HAD ROOM IDS AND NOTHING ELSE.
//
// Those takes were made before the tape was written down, so there is no
// recording to give back — but the job still counts them, and the machine must
// not list a take it refuses to play. They come back as real takes with an
// empty `audible`: the room's own floor, and a guest chosen on the first play
// and stored, so the second play is the same tape.
export function adoptLegacyTakes({ roomIds = [], contaminated = [], places = {} } = {}) {
  let adopted = 0;
  const dirty = new Set(contaminated);
  for (const roomId of roomIds) {
    if (!roomId || state.takes.has(roomId)) continue;
    state.takes.set(roomId, {
      roomId, cell: { x: 0, y: 0 }, levels: new Map(), discrete: [],
      durationSeconds: PLAYBACK.sourceSeconds,
      presence: { peak: 0, atSec: 0 },
      contaminated: dirty.has(roomId), place: places[roomId] || null,
      audible: [],
      // No guest yet: migration runs at boot, when the sample catalogue is
      // still arriving over the network and there is nothing to choose from.
      // playTake picks one on the first play and stores it.
      guest: null,
      sealed: true, counted: true, at: 0, migrated: true,
    });
    adopted += 1;
    const take=state.takes.get(roomId);
    Object.assign(take,{id:`take:${state.history.length+1}`,ordinal:state.history.length+1,status:'accepted',startSeconds:state.end,endSeconds:state.end+take.durationSeconds});
    state.history.push(take);state.head=state.end=take.endSeconds;
  }
  return adopted;
}

// WHERE THE GUEST ARRIVES ON THE TAPE, AND HOW LOUD.
//
// Pure, so it can be checked without an AudioContext, and a pure function of the
// SEALED take, so playing the tape twice plays the same tape.
//
// A take with nothing near it keeps the tape it always had — the guest still
// arrives late and quiet, and is still the best thing in this game. A take the
// meter climbed through has the guest arriving AT THE MOMENT IT CLIMBED, louder
// and sooner, because by then it is not a suggestion.
export function guestShape(presence = null, { durationSeconds = PLAYBACK.sourceSeconds, playbackSeconds = PLAYBACK.seconds } = {}) {
  const peakLevel = Math.max(0, Math.min(1, Number(presence?.peak) || 0));
  const span = Math.max(0, playbackSeconds - 1);
  if (peakLevel <= PLAYBACK.presenceFloor) {
    return { enterSec: PLAYBACK.guestDelaySec, riseSec: PLAYBACK.guestRiseSec, peak: PLAYBACK.guestPeak, corroborated: false };
  }
  const weight = Math.max(0, Math.min(1, (peakLevel - PLAYBACK.presenceFloor) / (1 - PLAYBACK.presenceFloor)));
  const at = sourcePosition(presence?.atSec, durationSeconds);
  const riseSec = PLAYBACK.guestRiseSec + (PLAYBACK.guestRiseFastSec - PLAYBACK.guestRiseSec) * weight;
  // Placed where it happened in the minute, then pulled back far enough that the
  // rise still finishes on the tape — a guest that arrives after the fade is a
  // guest nobody hears, which is the one outcome this must not produce.
  const latest = Math.max(PLAYBACK.guestEnterMinSec, span - riseSec * 0.55);
  const enterSec = Math.max(PLAYBACK.guestEnterMinSec, Math.min(latest, at * playbackSeconds));
  return {
    enterSec,
    riseSec,
    peak: Math.min(PLAYBACK.guestCeiling, PLAYBACK.guestPeak * (1 + weight * PLAYBACK.presenceGain)),
    corroborated: true,
  };
}

// ── playing it back ─────────────────────────────────────────────────────────
export function playTake(roomId, { character = 1, atHead = false, continuousOutput = null } = {}) {
  const t = tapeTake(roomId);
  if (!t || !t.sealed || !state.ctx || !state.bus || isPlaying()) return null;
  state.lastError=null;
  if(t.continuous&&(t.mediaUnavailable||!normalizeSourceDriveMedia(t.continuous)?.durable)){
    state.lastError={code:'FIELD_MEDIA_UNAVAILABLE',message:'This interrupted field take has no stored audio. It cannot be reconstructed.',roomId:t.roomId,takeId:t.id};state.onPlaybackError?.({...state.lastError});return null;
  }
  if(!atHead&&seekTo(t.startSeconds||0,{id:t.id||roomId,character,continuousOutput}))return state.seeking;
  if(t.continuous)return playContinuousField(t,continuousOutput||state.bus);

  const playbackSeconds=sourceDuration(t.durationSeconds);
  const ctx = state.ctx;
  const t0 = ctx.currentTime + 0.05;
  const nodes = [];

  const out = ctx.createGain();
  out.gain.setValueAtTime(0, t0);
  out.gain.linearRampToValueAtTime(1, t0 + Math.min(.8,playbackSeconds*.1));
  out.gain.setValueAtTime(1, t0 + Math.max(playbackSeconds*.5,playbackSeconds-1.2));
  out.gain.linearRampToValueAtTime(0, t0 + playbackSeconds);
  out.connect(state.bus);
  nodes.push(out);
  const slateAt=t.slate?t0+Math.max(0,t.slate.atSeconds||0):null;

  // the room's own floor, as it was
  const bed = ctx.createBufferSource();
  bed.buffer = noiseBuffer(ctx, 3);
  bed.loop = true;
  const bedFilt = ctx.createBiquadFilter();
  bedFilt.type = 'lowpass';
  bedFilt.frequency.setValueAtTime(180 * character, t0);
  const bedGain = ctx.createGain();
  bedGain.gain.setValueAtTime(PLAYBACK.bedGain, t0);
  bed.connect(bedFilt); bedFilt.connect(bedGain); bedGain.connect(out);
  bed.start(t0); bed.stop(t0 + playbackSeconds);
  nodes.push(bed, bedFilt, bedGain);

  // what you heard, at the level you heard it
  for (const [ref, level] of t.audible || []) {
    const chunk = sampleFor(ref);
    if (!chunk?.buffer) continue;
    const src = ctx.createBufferSource();
    src.buffer = chunk.buffer;
    src.loop = true;
    const g = ctx.createGain();
    g.gain.setValueAtTime(level * 0.85, t0);
    src.connect(g); g.connect(out);
    src.start(t0, Math.random() * Math.max(0.01, chunk.buffer.duration - 0.1));
    src.stop(t0 + playbackSeconds);
    nodes.push(src, g);
  }

  // and what you did not
  // A TAKE THAT CAME BACK FROM AN OLD SAVE HAS NO GUEST YET.
  //
  // It was made before the tape was written down, so there was nothing to
  // choose from at migration time — the catalogue had not finished loading. It
  // is chosen on the first play and STORED, so the second play is the same
  // tape, which is the only part of the rule that matters.
  if (t.sealed && !t.guest && t.migrated) {
    const picked = state.pickGuest?.(roomId, (t.audible || []).map(([ref]) => ref)) || null;
    if (picked) t.guest = { id: picked.idx, key: sampleKey(picked) };
  }
  const guestChunk = t.guest ? (sampleFor(t.guest.id) || sampleFor(t.guest.key)) : null;
  if (guestChunk?.buffer) {
    const shape = guestShape(t.presence, { durationSeconds: t.durationSeconds, playbackSeconds });
    const src = ctx.createBufferSource();
    src.buffer = guestChunk.buffer;
    src.loop = true;
    src.playbackRate.setValueAtTime(PLAYBACK.guestRate, t0);
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(PLAYBACK.guestCutoff, t0);
    filt.Q.setValueAtTime(0.6, t0);
    const g = ctx.createGain();
    const enter = t0 + shape.enterSec;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.setValueAtTime(0.0001, enter);
    // exponential: it does not fade in, it approaches
    g.gain.exponentialRampToValueAtTime(shape.peak, enter + shape.riseSec);
    src.connect(filt); filt.connect(g); g.connect(out);
    src.start(t0);
    src.stop(t0 + playbackSeconds);
    nodes.push(src, filt, g);
    // Tell the game when it becomes deniable-no-longer, so the HUD can not
    // mention it. Nothing in the interface ever acknowledges the guest.
    state.guestAt = enter + shape.riseSec * 0.55;
  }

  for(const event of t.discrete||[]){
    const playbackAt=t0+Math.min(playbackSeconds-.01,sourcePosition(event.atSec,t.durationSeconds)*playbackSeconds);
    if(event.cueId===TOWER_PERSONAL_CUE){
      const recording=playTowerPersonalRecording({context:ctx,destination:out,when:playbackAt,gain:event.gain});
      if(recording)nodes.push(recording);
      continue;
    }
    if(state.scheduleDiscrete){state.scheduleDiscrete(event.cueId,playbackAt,{gain:event.gain,pan:event.pan,output:out,nodes});continue;}
    if(event.cueId==='bell.tenor.clock'){
      const osc=ctx.createOscillator(),gain=ctx.createGain(),panner=ctx.createStereoPanner();osc.type='sine';osc.frequency.value=233.08;gain.gain.setValueAtTime(.0001,playbackAt);gain.gain.exponentialRampToValueAtTime(.14*Math.max(.1,event.gain),playbackAt+.012);gain.gain.exponentialRampToValueAtTime(.0001,playbackAt+5.8);panner.pan.value=event.pan;osc.connect(gain);gain.connect(panner);panner.connect(out);osc.start(playbackAt);osc.stop(playbackAt+6);nodes.push(osc,gain,panner);
    }
  }

  const endsAt = t0 + playbackSeconds;
  state.playing = { roomId:t.roomId, take:t, nodes, output:out,slateAt,slateFired:false,startedAt: t0, endsAt, durationSec:playbackSeconds, guestFired: false };
  return state.playing;
}

function playContinuousSource(p,offset=0){
  const source=state.ctx.createBufferSource();source.buffer=p.buffer;source.loop=false;source.playbackRate.value=1;source.connect(p.output);p.nodes.push(source);p.source=source;
  const when=state.ctx.currentTime+.02;p.startedAt=when-offset;p.endsAt=when+p.durationSec-offset;p.paused=false;p.elapsedOnPause=offset;p.ended=false;
  source.onended=()=>{if(state.playing===p&&p.source===source&&!p.paused)p.ended=true;};source.start(when,offset,Math.max(0,p.durationSec-offset));
}
function playContinuousField(t,output){
  const p={roomId:t.roomId,take:t,nodes:[],startedAt:state.ctx.currentTime,endsAt:Infinity,durationSec:Number(t.durationSeconds),continuous:true,loading:true,paused:false,pauseRequested:false,elapsedOnPause:0,guestFired:false};state.playing=p;
  p.readyPromise=(async()=>{
    try{
      if(t.mediaUnavailable||t.continuous.pending)throw Object.assign(new Error('This interrupted field take has no stored audio. It cannot be reconstructed.'),{code:'FIELD_MEDIA_UNAVAILABLE'});
      const loaded=state.loadContinuousMedia?await state.loadContinuousMedia({ctx:state.ctx,media:t.continuous,take:t}):await decodeSourceDriveMedia(state.ctx,t.continuous);
      if(state.playing!==p)return null;
      if(!loaded?.buffer||Math.abs(loaded.buffer.duration-Number(t.durationSeconds))>.003)throw Object.assign(new Error('The stored field audio does not match this tape interval.'),{code:'FIELD_MEDIA_DURATION'});
      p.buffer=loaded.buffer;p.durationSec=Number(t.durationSeconds);p.output=state.ctx.createGain();p.output.gain.value=1;p.output.connect(output);p.nodes.push(p.output);
      if(state.ctx.createChannelSplitter&&state.ctx.createAnalyser){
        const split=state.ctx.createChannelSplitter(2);p.output.connect(split);p.nodes.push(split);p.meters=[0,1].map(channel=>{const analyser=state.ctx.createAnalyser();analyser.fftSize=256;split.connect(analyser,channel);p.nodes.push(analyser);return{analyser,samples:new Float32Array(256)};});
      }
      p.loading=false;if(p.pauseRequested){p.paused=true;p.elapsedOnPause=0;}else playContinuousSource(p,0);return p;
    }catch(error){
      if(state.playing!==p)return null;
      stopPlayback();state.lastError={code:error.code||'FIELD_MEDIA_FAILED',message:error.message,roomId:t.roomId,takeId:t.id};
      state.onPlaybackError?.({...state.lastError});return null;
    }
  })();return p;
}
export function playbackError(){return state.lastError?{...state.lastError}:null;}
export function setContinuousPlaybackPaused(paused){
  const now=state.ctx?.currentTime||0,s=state.seeking;
  if(s){if(paused&&s.pausedAt==null)s.pausedAt=now;else if(!paused&&s.pausedAt!=null){s.startedAt+=now-s.pausedAt;delete s.pausedAt;}}
  const p=state.playing;if(!p?.continuous)return false;p.pauseRequested=!!paused;if(p.loading)return true;
  if(paused&&!p.paused){p.elapsedOnPause=Math.max(0,Math.min(p.durationSec,now-p.startedAt));p.paused=true;const source=p.source;p.source=null;try{source?.stop();source?.disconnect();}catch{} }
  else if(!paused&&p.paused)playContinuousSource(p,p.elapsedOnPause);return true;
}

// Called from the frame loop. Returns 'idle' | 'playing' | 'ended'.
export function tickPlayback() {
  if(state.seeking){
    const s=state.seeking,p=Math.max(0,Math.min(1,((s.pausedAt??state.ctx?.currentTime??0)-s.startedAt)/s.seconds));
    state.head=s.from+(s.to-s.from)*p;
    if(p<1)return 'seeking';
    s.sound?.stop?.();state.seeking=null;
    if(s.then){playTake(s.then.id,{character:s.then.character,continuousOutput:s.then.continuousOutput,atHead:true});return 'playing';}
    return 'cued';
  }
  if (!state.playing || !state.ctx) return 'idle';
  const now = state.ctx.currentTime;
  const p = state.playing;
  if(p.continuous){
    if(p.loading)return 'loading';if(p.paused)return 'paused';
    const elapsed=Math.max(0,Math.min(p.durationSec,now-p.startedAt));state.head=(p.take.startSeconds||0)+elapsed;
    if(p.ended||now>=p.endsAt){state.head=p.take.endSeconds;stopPlayback();return 'ended';}return 'playing';
  }
  if(!p.slateFired&&p.slateAt!==null&&now>=p.slateAt&&now<p.endsAt){
    p.slateFired=true;state.playSlate?.(p.take.slate,{ctx:state.ctx,output:p.output,when:p.startedAt,nodes:p.nodes});
  }
  state.head=(p.take.startSeconds||0)+Math.max(0,Math.min(1,(now-p.startedAt)/p.durationSec))*sourceDuration(p.take.durationSeconds);
  if (!p.guestFired && state.guestAt && now >= state.guestAt) {
    p.guestFired = true;
    state.onGuest?.(p.roomId);
  }
  if (now >= p.endsAt + 0.2) {
    stopPlayback();
    return 'ended';
  }
  return 'playing';
}

export function stopPlayback() {
  if(state.seeking){state.seeking.sound?.stop?.();state.seeking=null;}
  const p = state.playing;
  if (!p) return;
  for (const n of p.nodes) { try { n.stop?.(); } catch (_) {} try { n.disconnect(); } catch (_) {} }
  state.playing = null;
  state.guestAt = 0;
}

export function progress() {
  return playbackSnapshot()?.progress || 0;
}

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0));

function textSeed(value) {
  let seed = 2166136261;
  for (const ch of String(value || 'take')) {
    seed ^= ch.charCodeAt(0);
    seed = Math.imul(seed, 16777619);
  }
  return (seed >>> 0) / 4294967295;
}

// Pure transport telemetry. It describes the sealed recording and the machine,
// never the extra voice: nothing visible on the recorder is allowed to name or
// classify what the headphones reveal. A late, unlabelled trace drift is the
// only concession to the sound changing under the player.
export function buildPlaybackSnapshot({ take, playing, now = 0, duration = PLAYBACK.seconds } = {}) {
  if (!take || !playing) return null;
  if(take.continuous){
    const seconds=Math.max(.001,Number(duration)||Number(take.durationSeconds)||.001),elapsedSec=playing.loading?0:playing.paused?playing.elapsedOnPause:Math.max(0,Math.min(seconds,Number(now)-Number(playing.startedAt||0)));
    return{roomId:String(take.roomId||''),recordedAt:Math.max(0,Number(take.at)||0),durationSec:seconds,sourceDurationSec:seconds,elapsedSec,remainingSec:Math.max(0,seconds-elapsedSec),progress:elapsedSec/seconds,sourceCount:1,eventCount:0,signalLeft:playing.loading||playing.paused?0:playing.signalLeft||0,signalRight:playing.loading||playing.paused?0:playing.signalRight||0,tapeDrift:0,markers:[],continuous:true,loading:!!playing.loading,paused:!!playing.paused};
  }
  const seconds = Math.max(.01, Number(duration) || PLAYBACK.seconds);
  const elapsedSec = Math.max(0, Math.min(seconds, Number(now) - Number(playing.startedAt || 0)));
  const progress = clamp01(elapsedSec / seconds);
  const audible = Array.isArray(take.audible) ? take.audible : [];
  const discrete = Array.isArray(take.discrete) ? take.discrete : [];
  const average = audible.length
    ? audible.reduce((sum, entry) => sum + Math.max(0, Number(entry?.[1]) || 0), 0) / audible.length
    : 0;
  const seed = textSeed(take.roomId);
  const phase = elapsedSec * (2.1 + seed * .7) + seed * Math.PI * 2;
  const signalBase = clamp01(.14 + Math.min(.55, average * 2.6) + audible.length * .022);
  const lateChange = take.guest
    ? clamp01((elapsedSec - PLAYBACK.guestDelaySec) / Math.max(.01, PLAYBACK.guestRiseSec))
    : 0;
  const signalLeft = clamp01(signalBase * (.68 + .23 * Math.sin(phase)) + lateChange * .19);
  const signalRight = clamp01(signalBase * (.70 + .21 * Math.sin(phase * .83 + 1.17)) + lateChange * .22);
  return {
    roomId: String(take.roomId || ''),
    recordedAt: Math.max(0, Number(take.at) || 0),
    durationSec: seconds,
    sourceDurationSec: sourceDuration(take.durationSeconds),
    elapsedSec,
    remainingSec: Math.max(0, seconds - elapsedSec),
    progress,
    sourceCount: audible.length,
    eventCount: discrete.length,
    signalLeft,
    signalRight,
    tapeDrift: lateChange,
    markers: discrete.map((event, index) => ({
      id: `${event?.cueId || 'event'}:${index}`,
      position: clamp01(Math.min(seconds-.01,sourcePosition(event?.atSec, take.durationSeconds)*seconds)/seconds),
    })),
  };
}

export function playbackSnapshot() {
  if(state.seeking){
    const take=tapeTake(state.seeking.then?.id);
    return {roomId:take?.roomId||'',ordinal:take?.ordinal||0,seeking:state.seeking.to<state.seeking.from?'rewind':'forward',tapeSeconds:state.head,progress:0,markers:[],paused:state.seeking.pausedAt!=null};
  }
  if (!state.playing || !state.ctx) return null;
  if(state.playing.continuous&&state.playing.meters){const levels=state.playing.meters.map(({analyser,samples})=>{analyser.getFloatTimeDomainData(samples);return Math.sqrt(samples.reduce((sum,x)=>sum+x*x,0)/samples.length);});[state.playing.signalLeft,state.playing.signalRight]=levels;}
  return {...buildPlaybackSnapshot({
    take: state.playing.take,
    playing: state.playing,
    now: state.ctx.currentTime,
    duration:state.playing.durationSec,
  }),tapeSeconds:state.head,ordinal:state.playing.take.ordinal||0};
}

function noiseBuffer(ctx, seconds) {
  const sr = ctx.sampleRate;
  const buf = ctx.createBuffer(1, Math.floor(sr * seconds), sr);
  const ch = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < ch.length; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.018 * white) / 1.018;
    ch[i] = last * 3.2;
  }
  return buf;
}
