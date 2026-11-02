import {
  appendCausalDraftSegment,
  discardCausalDraft,
  loadCausalDraft,
  promoteCausalDraft,
  saveCausalDraftCheckpoint,
  sealCausalDraft,
} from '../platform/storage/storageService.js';
import { CAUSAL_TOPOLOGY_HASH, packShadowFrames, unpackShadowFrames, sealCausalTape, tapeQualifies } from './tape.js';
import { normalizePressurePresentation } from '../game/pressure-performance.js';

const SEGMENT_MS = 30_000;
const MOVING_SAMPLE_MS = 100;
const STATIONARY_SAMPLE_MS = 500;
const CHECKPOINT_MS = 5000;
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function changedDiscontinuously(a, b) {
  if (!a || !b) return true;
  return a.roomId !== b.roomId
    || a.renderGroup !== b.renderGroup
    || a.spaceId !== b.spaceId
    || pressureBoundary(a.pressurePresentation) !== pressureBoundary(b.pressurePresentation)
    || Math.abs(finite(a.floorH) - finite(b.floorH)) > 0.5
    || Math.abs(finite(a.yaw) - finite(b.yaw)) > 0.55
    || Math.abs(finite(a.pitch) - finite(b.pitch)) > 0.35;
}

function pressureBoundary(frame) {
  return ['primary', 'secondary'].map((slot) => {
    const actor = frame?.[slot], performance = actor?.performance;
    const density=performance?.density;
    return actor ? `${actor.id}:${performance?.role}:${performance?.clip}:${performance?.cue?.name || ''}:${!!actor.referenceTrace}:${density?.seed??''}:${density?.event??''}:${!!density?.blocked}:${!!density?.listening}` : '';
  }).join('|');
}

function moving(a, b) {
  if (!a || !b) return true;
  return Math.hypot(finite(a.x) - finite(b.x), finite(a.y) - finite(b.y)) > 0.015
    || Math.abs(finite(a.yaw) - finite(b.yaw)) > 0.01
    || Math.abs(finite(a.pitch) - finite(b.pitch)) > 0.01
    || Math.abs(finite(a.outskirtsCharacters?.clock) - finite(b.outskirtsCharacters?.clock)) > .001
    || Math.abs(finite(a.pressurePresentation?.clock) - finite(b.pressurePresentation?.clock)) > .001
    || Math.abs(finite(a.busWomanYardTime) - finite(b.busWomanYardTime)) > .001;
}

class CausalCaptureSession {
  constructor({ topologyHash = CAUSAL_TOPOLOGY_HASH, queue } = {}) {
    this.topologyHash = topologyHash;
    this.queue = queue;
    this.reset();
  }

  get pendingWrites() { return this.queue.promise; }
  set pendingWrites(value) {
    this.queue.promise = value;
    // Preserve rejection for final filing while handling it immediately; a
    // quota/write error minutes before the ending must not become an unhandled
    // promise. A later night may retry after storage has been repaired.
    value.catch(error => {
      if (!this.storageError) {
        this.storageError = String(error?.message || error);
        console.warn('[causal] capture storage unavailable', this.storageError);
      }
    });
  }

  reset() {
    this.active = false;
    this.discarded = false;
    this.runId = '';
    this.difficulty = 'contract';
    this.elapsedMs = 0;
    this.frames = [];
    this.segmentBuffer = [];
    this.events = [];
    this.anchors = [];
    this.presentationIntervals = [];
    this.openPresentation = null;
    this.lastFrame = null;
    this.lastSampleAt = -Infinity;
    this.injuries = 0;
    this.order = 0;
    this.segmentCount = 0;
    this.lastCheckpointAt = -Infinity;
    this.hydrating = false;
    this.replaying = false;
    this.finishing = false;
    this.retired = false;
    this.buffered = [];
    this.hydration = null;
    this.finalizePromise = null;
    this.storageError = null;
  }

  begin({ runId, difficulty = 'contract', resume = false } = {}) {
    if (!runId) throw new Error('causal capture requires a run id');
    if (this.active && this.runId === runId) return false;
    this.reset();
    this.active = true;
    this.runId = String(runId);
    this.difficulty = String(difficulty || 'contract');
    const runIdForWrite = this.runId;
    if (!resume) {
      this.pendingWrites = this.pendingWrites.catch(() => {}).then(() => discardCausalDraft(runIdForWrite));
    } else {
      this.hydrating = true;
      const task = this.pendingWrites.catch(() => {}).then(async () => {
        const draft = await loadCausalDraft();
        if (draft?.runId === this.runId && draft.topologyHash === this.topologyHash
          && draft.difficulty === this.difficulty && draft.checkpoint?.schema === 1) {
          const saved = draft.checkpoint;
          this.segmentCount = Math.max(0, Math.min(draft.segments?.length || 0, Math.floor(finite(saved.segmentCount))));
          this.frames = unpackShadowFrames([...(draft.segments || []).slice(0, this.segmentCount), ...(saved.tail || [])]);
          this.segmentBuffer = unpackShadowFrames(saved.tail || []);
          this.elapsedMs = Math.max(0, finite(saved.elapsedMs));
          this.events = Array.isArray(saved.events) ? saved.events : [];
          this.anchors = Array.isArray(saved.anchors) ? saved.anchors : [];
          this.presentationIntervals = Array.isArray(saved.presentationIntervals) ? saved.presentationIntervals : [];
          // The application was absent after this boundary. Close the old
          // interval here; actual buffered scene input may start its new one.
          this.openPresentation = null;
          if (saved.openPresentation) this.presentationIntervals.push({ ...saved.openPresentation, end: this.elapsedMs });
          this.injuries = Math.max(0, Math.floor(finite(saved.injuries)));
          this.order = Math.max(0, Math.floor(finite(saved.order)));
          this.lastFrame = this.frames.at(-1) || null;
          this.lastSampleAt = this.lastFrame?.t ?? -Infinity;
          this.lastCheckpointAt = this.elapsedMs;
        }
        this.hydrating = false;
        this.replaying = true;
        try { for (const item of this.buffered.splice(0)) this[item.method](...item.args); }
        finally { this.replaying = false; }
        this.checkpoint({ force: true });
      }).catch(error => {
        this.hydrating = false; this.active = false; this.discarded = true; this.buffered = [];
        throw error;
      });
      this.hydration = task;
      this.pendingWrites = task;
    }
    return true;
  }

  defer(method, args) {
    if (this.finishing && !this.replaying) return true;
    if (!this.hydrating) return false;
    this.buffered.push({ method, args: structuredClone(args) });
    return true;
  }

  checkpoint({ force = false } = {}) {
    if (!this.active || this.discarded || this.hydrating || this.replaying || this.finishing || this.retired) return;
    if (!force && this.elapsedMs - this.lastCheckpointAt < CHECKPOINT_MS) return;
    this.lastCheckpointAt = this.elapsedMs;
    const runId = this.runId;
    const checkpoint = structuredClone({ schema: 1, topologyHash: this.topologyHash, difficulty: this.difficulty,
      elapsedMs: this.elapsedMs, tail: packShadowFrames(this.segmentBuffer, SEGMENT_MS),
      segmentCount: this.segmentCount,
      events: this.events, anchors: this.anchors, presentationIntervals: this.presentationIntervals,
      openPresentation: this.openPresentation, injuries: this.injuries, order: this.order });
    this.pendingWrites = this.pendingWrites.then(() => saveCausalDraftCheckpoint(runId, checkpoint));
  }

  tick(dtSeconds, frame) {
    if (this.defer('tick', [dtSeconds, frame])) return;
    if (!this.active || this.discarded) return;
    this.elapsedMs += Math.max(0, finite(dtSeconds)) * 1000;
    if (!frame) return;
    const next = { ...frame, t: Math.round(this.elapsedMs) };
    // Freeze the bounded resolved actor descriptors at observation time, not
    // at a later disk flush after the driver may have advanced or despawned.
    const pressure = normalizePressurePresentation(frame.pressurePresentation);
    if (pressure) next.pressurePresentation = pressure;
    else delete next.pressurePresentation;
    const interval = moving(this.lastFrame, next) ? MOVING_SAMPLE_MS : STATIONARY_SAMPLE_MS;
    if (changedDiscontinuously(this.lastFrame, next) || this.elapsedMs - this.lastSampleAt >= interval) {
      this.frames.push(next);
      this.segmentBuffer.push(next);
      this.lastSampleAt = this.elapsedMs;
      if (this.segmentBuffer[0] && this.elapsedMs - this.segmentBuffer[0].t >= SEGMENT_MS) this.flushSegment();
    }
    this.lastFrame = next;
    this.checkpoint();
  }

  flushSegment() {
    if (this.defer('flushSegment', [])) return;
    // Buffer replay must not enqueue old-night writes behind a newer night's
    // already-reserved work. Its complete tail is saved once hydration ends.
    if (this.replaying) return;
    if (!this.segmentBuffer.length || !this.active) return;
    const frames = this.segmentBuffer;
    this.segmentBuffer = [];
    const packed = packShadowFrames(frames, SEGMENT_MS);
    const runId = this.runId, topologyHash = this.topologyHash, difficulty = this.difficulty;
    this.segmentCount += packed.length;
    for(const segment of packed){
      this.pendingWrites = this.pendingWrites.then(() => appendCausalDraftSegment(runId, segment, {
        schema: 1,
        topologyHash,
        difficulty,
      }));
    }
  }

  recordEvent({ actor = 'system', type, payload = {}, at = this.elapsedMs } = {}) {
    if (this.defer('recordEvent', [{ actor, type, payload, ...(at === this.elapsedMs ? {} : { at }) }])) return null;
    if (!this.active || this.discarded || !type) return null;
    const event = { id: `event:${this.runId}:${this.order}`, order: this.order++, at: Math.round(at), actor, type, payload };
    this.events.push(event);
    return event;
  }

  // A bounded, read-only pose window for same-run Source reprises. This is not
  // a causal tape and cannot expose raw audio: only the already-normalized
  // player pose fields are copied out. Uniform downsampling keeps save size
  // independent of how long the player loitered before pressing record.
  poseWindow({ fromMs = 0, toMs = this.elapsedMs, maxFrames = 96, spaceId = null } = {}) {
    const start = Math.max(0, finite(fromMs));
    const end = Math.max(start, finite(toMs, this.elapsedMs));
    const limit = Math.max(2, Math.min(256, Math.floor(finite(maxFrames, 96))));
    const frames = this.frames.filter((frame) => (
      finite(frame.t, -1) >= start
      && finite(frame.t, -1) <= end
      && (!spaceId || frame.spaceId === spaceId)
    ));
    const selected = frames.length <= limit
      ? frames
      : Array.from({ length: limit }, (_, index) => frames[Math.round(index * (frames.length - 1) / (limit - 1))]);
    return selected.map((frame) => ({
      t: Math.max(0, Math.round(finite(frame.t))),
      x: finite(frame.x),
      y: finite(frame.y),
      yaw: finite(frame.yaw),
      pitch: finite(frame.pitch),
      floorH: finite(frame.floorH),
      roomId: typeof frame.roomId === 'string' ? frame.roomId : '',
      renderGroup: typeof frame.renderGroup === 'string' ? frame.renderGroup : '',
      spaceId: typeof frame.spaceId === 'string' ? frame.spaceId : '',
      ...(frame.pressurePresentation ? { pressurePresentation: normalizePressurePresentation(frame.pressurePresentation) } : {}),
      ...(Number.isFinite(frame.busWomanYardTime) ? { busWomanYardTime: frame.busWomanYardTime } : {}),
    }));
  }

  recordAnchor({ id = null, verb, locus, payload = {}, weight = null, required = false, class: anchorClass = null, at = this.elapsedMs } = {}) {
    if (this.defer('recordAnchor', [{ id, verb, locus, payload, weight, required, class: anchorClass,
      ...(at === this.elapsedMs ? {} : { at }) }])) return null;
    if (!this.active || this.discarded || !verb || !locus) return null;
    if (id && this.anchors.some((anchor) => anchor.id === id)) return this.anchors.find((anchor) => anchor.id === id);
    const anchor = {
      id: id ? String(id) : `anchor:${this.runId}:${this.order}`,
      order: this.order++,
      at: Math.round(at),
      verb,
      locus,
      armingWindowMs: 6000,
      weight: weight == null ? (verb === 'contact' ? 2 : 1) : weight,
      required: !!required,
      class: anchorClass || (required ? 'spine' : 'authored'),
      payload,
    };
    this.anchors.push(anchor);
    this.recordEvent({ actor: 'hush', type: `hush.${verb}`, payload, at });
    this.checkpoint({ force: true });
    return anchor;
  }

  beginPresentation(id) {
    if (this.defer('beginPresentation', [id])) return;
    if (!this.active || this.openPresentation) return;
    this.openPresentation = { id: String(id || 'scene'), start: Math.round(this.elapsedMs) };
  }

  endPresentation() {
    if (this.defer('endPresentation', [])) return;
    if (!this.openPresentation) return;
    this.presentationIntervals.push({ ...this.openPresentation, end: Math.round(this.elapsedMs) });
    this.openPresentation = null;
  }

  noteInjuries(injuries) {
    if (this.defer('noteInjuries', [injuries])) return;
    this.injuries = Math.max(0, Math.floor(finite(injuries)));
    if (this.active && !tapeQualifies(this.injuries)) {
      const runId = this.runId;
      this.active = false;
      this.discarded = true;
      this.frames = [];
      this.segmentBuffer = [];
      this.events = [];
      this.anchors = [];
      this.pendingWrites = this.pendingWrites.catch(() => {}).then(() => discardCausalDraft(runId));
    }
  }

  finalize({ summary, endingId, injuries = this.injuries, completedAt = Date.now() } = {}) {
    if (this.finalizePromise) return this.finalizePromise;
    const ownerId = summary?.runId || (typeof summary?.id === 'string' && summary.id.startsWith('return:') ? summary.id.slice(7) : null);
    if (ownerId && ownerId !== this.runId) return Promise.resolve({ ok: false, reason: 'RUN_MISMATCH' });
    // Reserve the complete transaction now, including hydration if a return is
    // filed immediately after reload. Later nights cannot enter its draft slot.
    // Stop accepting live observations at this synchronous ending boundary.
    this.finishing = true;
    const result = this.pendingWrites.then(async () => {
      if (!this.active || this.discarded || !summary || !tapeQualifies(injuries)) {
        if (this.runId) await discardCausalDraft(this.runId);
        return { ok: false, reason: 'NOT_QUALIFIED' };
      }
      if (this.openPresentation) {
        this.presentationIntervals.push({ ...this.openPresentation, end: Math.round(this.elapsedMs) });
        this.openPresentation = null;
      }
      this.active = false;
      const tape = sealCausalTape({
        topologyHash: this.topologyHash,
        runId: this.runId,
        returnSummaryId: summary.id,
        endingId,
        endingVariant: summary.endingVariant ?? null,
        durationMs: Math.round(this.elapsedMs),
        qualification: { injuries, difficulty: this.difficulty, completedAt },
        shadowFrames: packShadowFrames(this.frames, SEGMENT_MS),
        events: this.events,
        anchors: this.anchors,
        presentationIntervals: this.presentationIntervals,
        requireCausalSpine: true,
      });
      await sealCausalDraft(this.runId, tape);
      const promoted = await promoteCausalDraft(this.runId);
      return { ok: true, tape: promoted };
    });
    this.pendingWrites = result;
    this.finalizePromise = result;
    return result;
  }
}

// One durable queue, separate per-night sessions. A session being hydrated or
// filed remains its own authority after New Game swaps the live facade.
export class CausalRecorder {
  constructor({ topologyHash = CAUSAL_TOPOLOGY_HASH } = {}) {
    this.topologyHash = topologyHash;
    this.queue = { promise: Promise.resolve() };
    this.reset();
  }
  reset() {
    if (this.session) this.session.retired = true;
    this.session = new CausalCaptureSession({ topologyHash: this.topologyHash, queue: this.queue });
  }
  begin(options = {}) {
    if (this.active && this.runId === options.runId) return false;
    this.reset();
    return this.session.begin(options);
  }
  get pendingWrites() { return this.queue.promise; }
  get hydration() { return this.session.hydration; }
  get active() { return this.session.active && !this.session.finishing; }
  set active(value) { this.session.active = !!value; }
}
for (const field of ['discarded', 'runId', 'difficulty', 'elapsedMs', 'frames', 'segmentBuffer', 'events', 'anchors',
  'presentationIntervals', 'openPresentation', 'lastFrame', 'lastSampleAt', 'injuries', 'order']) {
  Object.defineProperty(CausalRecorder.prototype, field, {
    get() { return this.session[field]; }, set(value) { this.session[field] = value; },
  });
}
for (const method of ['tick', 'flushSegment', 'recordEvent', 'poseWindow', 'recordAnchor', 'beginPresentation',
  'endPresentation', 'noteInjuries', 'finalize', 'checkpoint']) {
  CausalRecorder.prototype[method] = function (...args) { return this.session[method](...args); };
}

export const causalRecorder = new CausalRecorder();
