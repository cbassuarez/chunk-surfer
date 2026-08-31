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
  playing: null,             // { roomId, nodes:[], startedAt, endsAt }
  ctx: null,
  bus: null,
  pickGuest: null,           // (roomId, audibleIds) -> chunk
  chunkById: null,           // (id) -> chunk
  keyOf: null,               // (chunk) -> stable string, for the save
  chunkByKey: null,          // (key) -> chunk, coming back
  onGuest: null,             // fired when the guest crosses audibility
  scheduleDiscrete: null,
};

export const PLAYBACK = {
  seconds: 22,               // you do not sit through the whole minute
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
  sourceSeconds: 45,         // mirrors ROOM_TONE.takeSeconds
  presenceFloor: 0.12,       // under this the take is an ordinary take
  presenceGain: 1.15,        // how much a close pass adds to the guest
  guestCeiling: 0.62,        // it is still a recording, not a jump scare
  guestRiseFastSec: 4.2,     // close, it stops being deniable sooner
  guestEnterMinSec: 1.4,     // never on top of the take's own fade-in
};

export function playbackInit({ ctx, bus, pickGuest, chunkById, keyOf, chunkByKey, onGuest, scheduleDiscrete } = {}) {
  state.ctx = ctx || state.ctx;
  state.bus = bus || state.bus;
  if (pickGuest) state.pickGuest = pickGuest;
  if (chunkById) state.chunkById = chunkById;
  if (keyOf) state.keyOf = keyOf;
  if (chunkByKey) state.chunkByKey = chunkByKey;
  if (onGuest) state.onGuest = onGuest;
  if(scheduleDiscrete)state.scheduleDiscrete=scheduleDiscrete;
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

export function beginTake(roomId, cell) {
  state.takes.set(roomId, {
    roomId, cell: { ...cell }, levels: new Map(), discrete: [],
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

export function abortTake(roomId) { state.takes.delete(roomId); }

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
  return t;
}

export function hasTake(roomId) { return !!state.takes.get(roomId)?.sealed; }
export function takeFor(roomId) { return state.takes.get(roomId) || null; }
export function isPlaying() { return !!state.playing; }

// ── the store, read ──────────────────────────────────────────────────────────
// Everything the recordist used to answer from three parallel arrays. Order is
// the order they were rolled, which is the ordinal the job sheet prints.
// The job sheet: every room that has been recorded, whether or not the
// transport has settled yet.
export function sealedTakes() { return [...state.takes.values()].filter((t) => t.sealed || t.counted); }
export function takeRoomIds() { return sealedTakes().map((t) => t.roomId); }
export function takeIsContaminated(roomId) { return !!state.takes.get(roomId)?.contaminated; }
export function contaminatedRooms() { return sealedTakes().filter((t) => t.contaminated).map((t) => t.roomId); }
export function takePlace(roomId) { return state.takes.get(roomId)?.place || null; }
export function takePlaces() {
  return Object.fromEntries(sealedTakes().filter((t) => t.place).map((t) => [t.roomId, t.place]));
}
export function forgetTake(roomId) { return state.takes.delete(roomId); }

// ── the store, written to disk ───────────────────────────────────────────────
//
// `levels` is deliberately dropped: it is the running peak-hold used to compute
// `audible` at seal time and is dead weight afterwards. Everything else is
// plain data, and every sample reference goes out as a NAME so it survives the
// manifest changing under it.
export function serializeTakes() {
  return sealedTakes().map((t) => ({
    roomId: t.roomId,
    at: t.at,
    counted: true,
    migrated: !!t.migrated,
    cell: t.cell ? { x: t.cell.x, y: t.cell.y } : null,
    contaminated: !!t.contaminated,
    place: t.place || null,
    presence: { peak: t.presence?.peak || 0, atSec: t.presence?.atSec || 0 },
    audible: (t.audible || []).map(([ref, level]) => [
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
  state.takes.clear();
  for (const row of Array.isArray(saved) ? saved : []) {
    if (!row?.roomId) continue;
    // Kept as names. sampleFor resolves either kind at play time.
    const audible = (row.audible || []).filter((pair) => Array.isArray(pair) && pair.length === 2);
    state.takes.set(row.roomId, {
      roomId: row.roomId,
      cell: row.cell ? { ...row.cell } : { x: 0, y: 0 },
      levels: new Map(),
      discrete: (row.discrete || []).map((e) => ({ ...e })),
      presence: { peak: row.presence?.peak || 0, atSec: row.presence?.atSec || 0 },
      contaminated: !!row.contaminated,
      place: row.place || null,
      audible,
      guest: row.guest?.key ? { id: null, key: row.guest.key } : null,
      sealed: true,
      counted: true,
      at: row.at || 0,
      migrated: !!row.migrated,
    });
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
export function guestShape(presence = null) {
  const peakLevel = Math.max(0, Math.min(1, Number(presence?.peak) || 0));
  const span = Math.max(0, PLAYBACK.seconds - 1);
  if (peakLevel <= PLAYBACK.presenceFloor) {
    return { enterSec: PLAYBACK.guestDelaySec, riseSec: PLAYBACK.guestRiseSec, peak: PLAYBACK.guestPeak, corroborated: false };
  }
  const weight = Math.max(0, Math.min(1, (peakLevel - PLAYBACK.presenceFloor) / (1 - PLAYBACK.presenceFloor)));
  const at = Math.max(0, Math.min(1, (Number(presence?.atSec) || 0) / PLAYBACK.sourceSeconds));
  const riseSec = PLAYBACK.guestRiseSec + (PLAYBACK.guestRiseFastSec - PLAYBACK.guestRiseSec) * weight;
  // Placed where it happened in the minute, then pulled back far enough that the
  // rise still finishes on the tape — a guest that arrives after the fade is a
  // guest nobody hears, which is the one outcome this must not produce.
  const latest = Math.max(PLAYBACK.guestEnterMinSec, span - riseSec * 0.55);
  const enterSec = Math.max(PLAYBACK.guestEnterMinSec, Math.min(latest, at * span));
  return {
    enterSec,
    riseSec,
    peak: Math.min(PLAYBACK.guestCeiling, PLAYBACK.guestPeak * (1 + weight * PLAYBACK.presenceGain)),
    corroborated: true,
  };
}

// ── playing it back ─────────────────────────────────────────────────────────
export function playTake(roomId, { character = 1 } = {}) {
  const t = state.takes.get(roomId);
  if (!t || !t.sealed || !state.ctx || !state.bus || state.playing) return null;

  const ctx = state.ctx;
  const t0 = ctx.currentTime + 0.05;
  const nodes = [];

  const out = ctx.createGain();
  out.gain.setValueAtTime(0, t0);
  out.gain.linearRampToValueAtTime(1, t0 + 0.8);
  out.gain.setValueAtTime(1, t0 + PLAYBACK.seconds - 1.2);
  out.gain.linearRampToValueAtTime(0, t0 + PLAYBACK.seconds);
  out.connect(state.bus);
  nodes.push(out);

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
  bed.start(t0); bed.stop(t0 + PLAYBACK.seconds);
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
    src.stop(t0 + PLAYBACK.seconds);
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
    const shape = guestShape(t.presence);
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
    src.stop(t0 + PLAYBACK.seconds);
    nodes.push(src, filt, g);
    // Tell the game when it becomes deniable-no-longer, so the HUD can not
    // mention it. Nothing in the interface ever acknowledges the guest.
    state.guestAt = enter + shape.riseSec * 0.55;
  }

  for(const event of t.discrete||[]){
    const playbackAt=t0+Math.max(0,Math.min(1,event.atSec/60))*(PLAYBACK.seconds-1);
    if(state.scheduleDiscrete){state.scheduleDiscrete(event.cueId,playbackAt,{gain:event.gain,pan:event.pan,output:out,nodes});continue;}
    if(event.cueId==='bell.tenor.clock'){
      const osc=ctx.createOscillator(),gain=ctx.createGain(),panner=ctx.createStereoPanner();osc.type='sine';osc.frequency.value=233.08;gain.gain.setValueAtTime(.0001,playbackAt);gain.gain.exponentialRampToValueAtTime(.14*Math.max(.1,event.gain),playbackAt+.012);gain.gain.exponentialRampToValueAtTime(.0001,playbackAt+5.8);panner.pan.value=event.pan;osc.connect(gain);gain.connect(panner);panner.connect(out);osc.start(playbackAt);osc.stop(playbackAt+6);nodes.push(osc,gain,panner);
    }
  }

  const endsAt = t0 + PLAYBACK.seconds;
  state.playing = { roomId, nodes, startedAt: t0, endsAt, guestFired: false };
  return state.playing;
}

// Called from the frame loop. Returns 'idle' | 'playing' | 'ended'.
export function tickPlayback() {
  if (!state.playing || !state.ctx) return 'idle';
  const now = state.ctx.currentTime;
  const p = state.playing;
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
      position: clamp01((Math.max(0, Number(event?.atSec) || 0) / 60) * ((seconds - 1) / seconds)),
    })),
  };
}

export function playbackSnapshot() {
  if (!state.playing || !state.ctx) return null;
  return buildPlaybackSnapshot({
    take: state.takes.get(state.playing.roomId),
    playing: state.playing,
    now: state.ctx.currentTime,
  });
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
