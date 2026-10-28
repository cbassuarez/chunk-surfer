import { normalizePressurePresentation } from '../game/pressure-performance.js';

// Last Exposure borrows an existing performer's physical root and sampled pose.
// It never creates a camera-facing substitute, moves a root toward the eye, or
// advances a renderer-owned clock. Contact/gameplay retains all authority.
const KINDS = new Set(['hard', 'taken']);
const finite = value => Number.isFinite(value);
const clamp = (value, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, value));
const smooth = value => { const u = clamp(value); return u * u * (3 - 2 * u); };
const copy = value => value == null ? null : JSON.parse(JSON.stringify(value));
function freeze(value) {
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) freeze(item);
    Object.freeze(value);
  }
  return value;
}
function capturedAnchor(raw, bearing) {
  if (!raw || !finite(raw.x) || !finite(raw.y)) return null;
  const p = raw.performance;
  const actor = normalizePressurePresentation({ primary: { ...raw,
    // The existing physical volume, never an image. A legacy caller gets the
    // same authored hold used elsewhere, sampled once rather than animated.
    id: raw.id || 'last-exposure-contact',
    strength: finite(raw.strength) ? raw.strength : .98,
    heightM: finite(raw.heightM) ? raw.heightM : 2.18,
    widthM: finite(raw.widthM) ? raw.widthM : .68,
    floorH: finite(raw.floorH) ? raw.floorH : 0,
    performance: p ? { ...p } : { version: 1, role: 'legacy-pressure',
      heading: finite(raw.heading) ? raw.heading : 0, clip: 'pressure_hold', time: 0,
      loop: false, seed: 0, manifestation: 1, motion: 'idle', cue: null, reducedMotion: true },
  } })?.primary;
  return actor ? freeze(actor) : null;
}

export function normalizeOutcomeExposure(value) {
  if (!value || typeof value !== 'object' || !KINDS.has(value.kind)
    || typeof value.eventId !== 'string' || !value.eventId.trim()
    || !finite(value.elapsed) || value.elapsed < 0) return null;
  const duration = finite(value.duration) && value.duration > 0
    ? Math.min(.72, value.duration) : value.kind === 'taken' ? .72 : .62;
  return freeze({ eventId: value.eventId.slice(0, 160), kind: value.kind,
    elapsed: value.elapsed, duration, reduced: value.reduced === true,
    bearing: finite(value.bearing) ? value.bearing : null,
    anchor: capturedAnchor(value.anchor, value.bearing) });
}

// One broad rise and fall, with no random strobe or secondary attack. The
// white boundary is still produced by the ordinary depth-aware pressure pass.
export function sampleOutcomeExposure(value, { reduceFlash = false } = {}) {
  if (!value || !finite(value.elapsed) || value.elapsed < 0 || value.elapsed >= value.duration) {
    return freeze({ active: false, phase: 'complete', amount: 0, glow: 0 });
  }
  const t = value.elapsed / value.duration;
  const soft = value.reduced || reduceFlash;
  const rise = smooth(t / (soft ? .18 : 1 / 6));
  const fall = 1 - smooth((t - (soft ? .60 : .53)) / (soft ? .40 : .47));
  const amount = (.08 + rise * (soft ? .72 : .92)) * fall;
  return freeze({ active: true, phase: t < 1 / 6 ? 'arrival' : t < .53 ? 'contact' : 'loss',
    amount, glow: soft ? .76 : .96 + .30 * rise * fall });
}

export function outcomeExposureActor(value, source, settings = {}) {
  const sample = sampleOutcomeExposure(value, settings);
  const anchor = value?.anchor || capturedAnchor(source, value?.bearing);
  if (!sample.active || !anchor) return null;
  // Keep the captured physical pose and floor contacts. Accessibility may
  // soften it downstream, but cannot replace its bearing with camera yaw.
  return freeze({ ...copy(anchor), strength: anchor.strength * sample.amount,
    glow: sample.glow, mode: anchor.mode,
    performance: { ...copy(anchor.performance),
      manifestation: Math.max(anchor.performance.manifestation, .9),
      // No cue overprint/size shift: one real body and its original skinned pose.
      cue: null, reducedMotion: true },
  });
}

export function createOutcomeExposureController() {
  let current = null;
  const retired = new Set();
  function retire(id) {
    if (!id) return;
    retired.add(id);
    if (retired.size > 32) retired.delete(retired.values().next().value);
  }
  return {
    set(value) {
      if (value == null) { retire(current?.eventId); current = null; return true; }
      const next = normalizeOutcomeExposure(value);
      if (!next || retired.has(next.eventId)) return false;
      if (current?.eventId === next.eventId) {
        if (next.kind !== current.kind) return false;
        if (next.elapsed < current.elapsed) return false;
        current = freeze({ ...next, anchor: current.anchor || next.anchor,
          duration: current.duration, kind: current.kind });
      } else {
        retire(current?.eventId);
        current = next;
      }
      if (current.elapsed >= current.duration) { retire(current.eventId); current = null; }
      return true;
    },
    // Anchor acquisition occurs once, before a caught actor is despawned. An
    // absent anchor never becomes a fabricated point in front of the camera.
    resolve(source, settings) {
      if (!current) return null;
      if (!current.anchor) {
        const anchor = capturedAnchor(source, current.bearing);
        if (!anchor) return null;
        current = freeze({ ...current, anchor });
      }
      return outcomeExposureActor(current, null, settings);
    },
    snapshot: () => current ? copy(current) : null,
    clear() { retire(current?.eventId); current = null; },
  };
}
