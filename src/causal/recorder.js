import {
  appendCausalDraftSegment,
  discardCausalDraft,
  promoteCausalDraft,
  sealCausalDraft,
} from '../platform/storage/storageService.js';
import { CAUSAL_TOPOLOGY_HASH, packShadowFrames, sealCausalTape, tapeQualifies } from './tape.js';

const SEGMENT_MS = 30_000;
const MOVING_SAMPLE_MS = 100;
const STATIONARY_SAMPLE_MS = 500;
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function changedDiscontinuously(a, b) {
  if (!a || !b) return true;
  return a.roomId !== b.roomId
    || a.renderGroup !== b.renderGroup
    || a.spaceId !== b.spaceId
    || Math.abs(finite(a.floorH) - finite(b.floorH)) > 0.5
    || Math.abs(finite(a.yaw) - finite(b.yaw)) > 0.55
    || Math.abs(finite(a.pitch) - finite(b.pitch)) > 0.35;
}

function moving(a, b) {
  if (!a || !b) return true;
  return Math.hypot(finite(a.x) - finite(b.x), finite(a.y) - finite(b.y)) > 0.015
    || Math.abs(finite(a.yaw) - finite(b.yaw)) > 0.01
    || Math.abs(finite(a.pitch) - finite(b.pitch)) > 0.01;
}

export class CausalRecorder {
  constructor({ topologyHash = CAUSAL_TOPOLOGY_HASH } = {}) {
    this.topologyHash = topologyHash;
    this.reset();
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
    this.pendingWrites = Promise.resolve();
  }

  begin({ runId, difficulty = 'contract' } = {}) {
    if (!runId) throw new Error('causal capture requires a run id');
    if (this.active && this.runId === runId) return false;
    this.reset();
    this.active = true;
    this.runId = String(runId);
    this.difficulty = String(difficulty || 'contract');
    this.pendingWrites=discardCausalDraft();
    return true;
  }

  tick(dtSeconds, frame) {
    if (!this.active || this.discarded) return;
    this.elapsedMs += Math.max(0, finite(dtSeconds)) * 1000;
    if (!frame) return;
    const next = { ...frame, t: Math.round(this.elapsedMs) };
    const interval = moving(this.lastFrame, next) ? MOVING_SAMPLE_MS : STATIONARY_SAMPLE_MS;
    if (changedDiscontinuously(this.lastFrame, next) || this.elapsedMs - this.lastSampleAt >= interval) {
      this.frames.push(next);
      this.segmentBuffer.push(next);
      this.lastSampleAt = this.elapsedMs;
      if (this.segmentBuffer[0] && this.elapsedMs - this.segmentBuffer[0].t >= SEGMENT_MS) this.flushSegment();
    }
    this.lastFrame = next;
  }

  flushSegment() {
    if (!this.segmentBuffer.length || !this.active) return;
    const frames = this.segmentBuffer;
    this.segmentBuffer = [];
    const packed = packShadowFrames(frames, SEGMENT_MS);
    for(const segment of packed){
      this.pendingWrites = this.pendingWrites.then(() => appendCausalDraftSegment(this.runId, segment, {
        schema: 1,
        topologyHash: this.topologyHash,
        difficulty: this.difficulty,
      }));
    }
  }

  recordEvent({ actor = 'system', type, payload = {}, at = this.elapsedMs } = {}) {
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
    }));
  }

  recordAnchor({ id = null, verb, locus, payload = {}, weight = null, required = false, class: anchorClass = null, at = this.elapsedMs } = {}) {
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
    return anchor;
  }

  beginPresentation(id) {
    if (!this.active || this.openPresentation) return;
    this.openPresentation = { id: String(id || 'scene'), start: Math.round(this.elapsedMs) };
  }

  endPresentation() {
    if (!this.openPresentation) return;
    this.presentationIntervals.push({ ...this.openPresentation, end: Math.round(this.elapsedMs) });
    this.openPresentation = null;
  }

  noteInjuries(injuries) {
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

  async finalize({ summary, endingId, injuries = this.injuries, completedAt = Date.now() } = {}) {
    if (!this.active || this.discarded || !summary || !tapeQualifies(injuries)) {
      if (this.runId) await this.pendingWrites.then(() => discardCausalDraft(this.runId));
      return { ok: false, reason: 'NOT_QUALIFIED' };
    }
    this.noteInjuries(injuries);
    if (!this.active) return { ok: false, reason: 'NOT_QUALIFIED' };
    this.endPresentation();
    this.flushSegment();
    const snapshot = {
      runId: this.runId,
      difficulty: this.difficulty,
      durationMs: Math.round(this.elapsedMs),
      frames: [...this.frames],
      events: [...this.events],
      anchors: [...this.anchors],
      presentationIntervals: [...this.presentationIntervals],
    };
    // finishEnding() is the boundary. Freeze synchronously before any storage
    // await so the gate epilogue and credits can never leak into this night.
    this.active = false;
    await this.pendingWrites;
    const tape = sealCausalTape({
      topologyHash: this.topologyHash,
      runId: snapshot.runId,
      returnSummaryId: summary.id,
      endingId,
      durationMs: snapshot.durationMs,
      qualification: { injuries, difficulty: snapshot.difficulty, completedAt },
      shadowFrames: packShadowFrames(snapshot.frames, SEGMENT_MS),
      events: snapshot.events,
      anchors: snapshot.anchors,
      presentationIntervals: snapshot.presentationIntervals,
      requireCausalSpine: true,
    });
    await sealCausalDraft(snapshot.runId, tape);
    const promoted = await promoteCausalDraft(snapshot.runId);
    return { ok: true, tape: promoted };
  }
}

export const causalRecorder = new CausalRecorder();
