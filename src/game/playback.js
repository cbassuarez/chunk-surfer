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

const state = {
  takes: new Map(),          // roomId -> { roomId, cell, audible:[...], guest, at }
  playing: null,             // { roomId, nodes:[], startedAt, endsAt }
  ctx: null,
  bus: null,
  pickGuest: null,           // (roomId, audibleIds) -> chunk
  chunkById: null,           // (id) -> chunk
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
};

export function playbackInit({ ctx, bus, pickGuest, chunkById, onGuest, scheduleDiscrete } = {}) {
  state.ctx = ctx || state.ctx;
  state.bus = bus || state.bus;
  if (pickGuest) state.pickGuest = pickGuest;
  if (chunkById) state.chunkById = chunkById;
  if (onGuest) state.onGuest = onGuest;
  if(scheduleDiscrete)state.scheduleDiscrete=scheduleDiscrete;
}

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
  state.takes.set(roomId, { roomId, cell: { ...cell }, levels: new Map(), discrete:[], sealed: false, at: 0 });
}

export function abortTake(roomId) { state.takes.delete(roomId); }

// A completed take is sealed: the guest is chosen once and never re-rolled, so
// playing the tape twice plays the same tape. A tape that changes is a dream.
export function sealTake(roomId) {
  const t = state.takes.get(roomId);
  if (!t || t.sealed) return null;
  const audible = [...t.levels.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  t.audible = audible;
  t.guest = state.pickGuest?.(roomId, audible.map(([id]) => id)) || null;
  t.sealed = true;
  t.at = Date.now();
  return t;
}

export function hasTake(roomId) { return !!state.takes.get(roomId)?.sealed; }
export function takeFor(roomId) { return state.takes.get(roomId) || null; }
export function isPlaying() { return !!state.playing; }

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
  for (const [id, level] of t.audible || []) {
    const chunk = state.chunkById?.(id);
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
  if (t.guest?.buffer) {
    const src = ctx.createBufferSource();
    src.buffer = t.guest.buffer;
    src.loop = true;
    src.playbackRate.setValueAtTime(PLAYBACK.guestRate, t0);
    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(PLAYBACK.guestCutoff, t0);
    filt.Q.setValueAtTime(0.6, t0);
    const g = ctx.createGain();
    const enter = t0 + PLAYBACK.guestDelaySec;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.setValueAtTime(0.0001, enter);
    // exponential: it does not fade in, it approaches
    g.gain.exponentialRampToValueAtTime(PLAYBACK.guestPeak, enter + PLAYBACK.guestRiseSec);
    src.connect(filt); filt.connect(g); g.connect(out);
    src.start(t0);
    src.stop(t0 + PLAYBACK.seconds);
    nodes.push(src, filt, g);
    // Tell the game when it becomes deniable-no-longer, so the HUD can not
    // mention it. Nothing in the interface ever acknowledges the guest.
    state.guestAt = enter + PLAYBACK.guestRiseSec * 0.55;
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
