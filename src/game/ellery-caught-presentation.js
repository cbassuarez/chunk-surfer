// This scene observes one committed catch. Save and world state belong to the
// host. In particular, a missing image, muted output, or interrupted shot
// cannot revoke the checkpoint handoff.
export const ELLERY_CAUGHT_TIMING = Object.freeze({
  impactAt: .095,
  cutAt: .27,
  blackAt: .38,
  restoreHold: .075,
  revealSeconds: .24,
  retrySeconds: .25,
});

const kinds = new Set(['room', 'hands', 'apparition']);
const clamp01 = value => Math.max(0, Math.min(1, value));
const smooth = value => { const p = clamp01(value); return p * p * (3 - 2 * p); };
const lerp = (from, to, amount) => from + (to - from) * amount;
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;

export function elleryCaughtFrame(age, {
  kind = 'room', bearing = 0, reducedMotion = false, reducedFlash = false,
  softened = false, sourceVisible = false, restoredAge = null,
} = {}) {
  const { impactAt, cutAt, blackAt, restoreHold, revealSeconds } = ELLERY_CAUGHT_TIMING;
  const elapsed = Math.max(0, finite(age));
  const restored = restoredAge !== null;
  const reveal = restored ? smooth((restoredAge - restoreHold) / revealSeconds) : 0;
  const impact = elapsed >= impactAt;
  const closing = smooth((elapsed - cutAt) / (blackAt - cutAt));
  const approach = smooth((elapsed - .025) / (impactAt - .025));
  const roomLoss = smooth(elapsed / (softened ? .16 : .095));
  const reduced = reducedMotion || reducedFlash || softened;
  const exposureRise = smooth((elapsed - .028) / (reducedFlash ? .17 : impactAt - .028));
  const exposureFall = 1 - smooth((elapsed - cutAt) / (blackAt - cutAt));
  const printLight = restored ? 0 : exposureRise * exposureFall * (reduced ? .48 : .92);
  const printClose = restored || sourceVisible ? 0 : (reduced ? .34 : 1) * approach * exposureFall;
  // The surrounding room loses its return as the nearby contact stays dry.
  const ambientGain = restored ? lerp(.20, 1, reveal) : lerp(1, softened ? .46 : .16, roomLoss);
  const darkness = restored ? 1 - reveal : elapsed >= blackAt ? 1 : lerp(.09 * roomLoss, 1, closing);
  const side = Math.sin(finite(bearing));
  return {
    kind: kinds.has(kind) ? kind : 'room',
    phase: restored ? 'reveal' : elapsed >= blackAt ? 'black' : impact ? 'impact' : 'close',
    elapsed, darkness, ambientGain, printLight, printClose,
    bearing: finite(bearing), side, reach: restored ? 0 : approach,
    reducedMotion: !!reducedMotion, reducedFlash: !!reducedFlash, sourceVisible: !!sourceVisible,
  };
}

// The hands at the temples keep their original mesh, eye attachment and
// identity. Read the held recording frame, then take the brace into contact.
export function caughtHandFrame(held, frame) {
  if (!held?.active || !held.hands?.length || !frame || frame.phase === 'black' || frame.phase === 'reveal') return null;
  const reach = clamp01(frame.reach);
  return {
    ...held,
    phase: 'caught',
    release: 0,
    reducedMotion: frame.reducedMotion || held.reducedMotion,
    performanceProgress: lerp(finite(held.performanceProgress, finite(held.progress)), 1, reach),
    proximity: lerp(finite(held.proximity), 1, reach),
    presence: lerp(finite(held.presence), 1, reach),
    grip: lerp(finite(held.grip), 1, reach),
    hands: held.hands.map(hand => ({
      ...hand,
      seat: lerp(finite(hand.seat), 1, reach),
      presence: lerp(finite(hand.presence), 1, reach),
      traction: lerp(finite(hand.traction), .88, reach),
      brace: lerp(finite(hand.brace), hand.side === 'left' ? .51 : .46, reach),
      recoil: 0,
      contact: hand.contact || reach >= .7,
    })),
    // The rig owns the grab. The old hand-held warp would stretch the impact.
    viewPull: { active: false, strength: 0 },
  };
}

// Allow an advance only along a short, geometry-checked path supplied by the
// host. The apparition otherwise holds its real anchor and tightens there.
// The returned actor is a render pose, never a navigation target.
export function caughtActorFrame(held, frame, { target = null, allowReach = false } = {}) {
  if (!held || !frame || frame.phase === 'black' || frame.phase === 'reveal') return null;
  const progress = clamp01(frame.reach);
  const advance = allowReach && !frame.reducedMotion && Number.isFinite(target?.x) && Number.isFinite(target?.y);
  return {
    ...held,
    x: advance ? lerp(held.x, target.x, progress) : held.x,
    y: advance ? lerp(held.y, target.y, progress) : held.y,
    strength: lerp(finite(held.strength, 1), 1, progress),
    widthM: lerp(finite(held.widthM, .68), Math.min(.95, finite(held.widthM, .68) * 1.15), progress),
    ...(held.performance ? { performance: { ...held.performance,
      manifestation: lerp(finite(held.performance.manifestation, 1), 1, progress),
    } } : {}),
  };
}

export function drawElleryCaughtExposure(ctx, frame) {
  if (!ctx || !frame) return;
  const { width, height } = ctx.canvas;
  ctx.save();
  ctx.fillStyle = `rgba(0,0,0,${frame.darkness})`;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

// onBlack returns true once the restored world and its persistence are ready.
// False or rejection holds a fully black view and retries the same transaction.
// The first restore attempt waits for an opaque frame to have been presented.
export function createElleryCaughtPresentation({
  id = 'ellery-caught', kind = 'room', bearing = 0,
  reducedMotion = false, reducedFlash = false, softened = false, sourceVisible = false,
  externalClock = false,
  active = () => true, onEnter, onFrame, onImpact, onBlack = () => true,
  onRestored, onSuspend, onExit, draw,
} = {}) {
  const { impactAt, blackAt, restoreHold, revealSeconds, retrySeconds } = ELLERY_CAUGHT_TIMING;
  let elapsed = 0, restoredAge = null, retryIn = 0, waiting = false;
  let closed = false, impact = false, blackPresented = false, finished = false, suspended = false;
  const frame = () => elleryCaughtFrame(elapsed, {
    kind, bearing, reducedMotion, reducedFlash, softened, sourceVisible, restoredAge,
  });
  function resolve(result) {
    if (closed) return;
    waiting = false;
    if (result === true) restoredAge = 0;
    else retryIn = retrySeconds;
  }
  function restore() {
    waiting = true;
    try {
      const result = onBlack();
      if (result?.then) Promise.resolve(result).then(resolve, () => resolve(false));
      else resolve(result);
    } catch (_) { resolve(false); }
  }
  function suspend() {
    if (closed || suspended) return;
    suspended = true;
    onSuspend?.(frame());
  }
  function advance(dt) {
    if (closed || finished) return;
    if (!active()) { suspend(); return; }
    suspended = false;
    const seconds = Math.max(0, finite(dt));
    if (restoredAge !== null) {
      restoredAge += seconds;
      onFrame?.(frame());
      if (restoredAge >= restoreHold + revealSeconds) {
        finished = true;
        onRestored?.(frame());
      }
      return;
    }
    // Slow frames must see the impact before the blackout, even when a
    // single update could cross both beats.
    elapsed = Math.min(impact ? blackAt : impactAt, elapsed + seconds);
    onFrame?.(frame());
    if (!impact && elapsed >= impactAt) {
      impact = true;
      onImpact?.(frame());
      return;
    }
    if (elapsed < blackAt || !blackPresented || waiting) return;
    retryIn = Math.max(0, retryIn - seconds);
    if (retryIn === 0) restore();
  }
  return {
    id, blocksInput: true, blocksWorld: true, allowsLook: false,
    suppressesHud: true,
    get worldPresentation() { return frame().darkness >= 1 ? 'hidden' : 'visible'; },
    enter() { onEnter?.(frame()); onFrame?.(frame()); },
    advance,
    update(dt) { if (!externalClock) advance(dt); },
    render() {
      if (closed) return;
      const current = frame();
      draw?.(current);
      if (current.phase === 'black' && !blackPresented) {
        blackPresented = true;
        if (externalClock) {
          // Let this frame submit its opaque layer, then begin the restore
          // without paying for a second turn of the foreground frame loop.
          setTimeout(() => {
            if (!closed && !waiting && active()) restore();
          }, 0);
        }
      }
    },
    exit() { if (!closed) { closed = true; onExit?.(frame()); } },
    suspend, frame,
    key: () => true, keyup: () => true, pointer: () => true,
  };
}
