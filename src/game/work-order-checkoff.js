// The result is already filed. This scene performs the decisive gesture on the
// same page while the player can still turn, walk away, or be interrupted.
import { layoutRecordistHand } from '../data/recordist-hand.js';
import { WORK_ORDER_SHEET } from '../data/work-order-sheet.js';
import { workOrderInkLayout } from './work-order-ink.js';

export const CHECKOFF_TIMING = Object.freeze({ wait: .20, raise: .47, settle: .15, lower: .34,
  penApproach: .35, penRelease: .31, cleanHold: 1.06, retryHold: 1.31 });
const ID = 'work-order-checkoff';
const clamp = value => Math.max(0, Math.min(1, value));
const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
const visibleBiro = stroke => ({ ...stroke, width: Math.max(stroke.width, .53) });

function strokeLength({ points }) {
  return points.slice(1).reduce((sum, point, index) => sum + Math.hypot(point[0] - points[index][0], point[1] - points[index][1]), 0);
}

export function checkoffPlan(marks = [], seenOrder = 0, { roomId, outcome = 'clean' } = {}) {
  const layout = workOrderInkLayout(marks);
  const rows = new Map(marks.map(mark => [mark.order, mark]));
  const note = layout.findLast(mark => mark.order > seenOrder && mark.kind === 'note' && (!roomId || rows.get(mark.order)?.roomId === roomId));
  if (!note) return null;
  const entry = rows.get(note.order);
  const room = WORK_ORDER_SHEET.rooms.find(row => row.roomId === entry.roomId);
  if (!room) return null;
  const noteText = String(entry.text || '');
  const cleanMarks = layout.filter(mark => mark.order > note.order && rows.get(mark.order)?.roomId === room.roomId && ['tick', 'strike'].includes(mark.kind));
  let feature = cleanMarks.flatMap(mark => mark.strokes);
  if (outcome !== 'clean' || !feature.length) {
    const word = outcome === 'rejected' ? 'REDO' : outcome === 'clean' ? 'CLEAN' : noteText.match(/\S+$/)?.[0];
    const count = layoutRecordistHand(word).strokes.length;
    feature = count > 0 ? note.strokes.slice(-count) : [];
  }
  if (!feature.length) return null;
  const animated = new Set(feature);
  // The existing log and all other marks are already on the sheet. Delay the
  // clean note until the tick and strike land so they carry the first read.
  const before = layout.filter(mark => mark !== note || !cleanMarks.length).flatMap(mark => mark.strokes).filter(stroke => !animated.has(stroke));
  const lengths = feature.map(strokeLength);
  const length = lengths.reduce((sum, next) => sum + next, 0);
  const tickAndStrike = outcome === 'clean' && cleanMarks.length && feature.length === 2;
  const writing = tickAndStrike ? .65 : outcome === 'spoilt' ? .92 : .78;
  const gap = tickAndStrike ? .08 : Math.min(.03, writing * .35 / Math.max(1, feature.length - 1));
  const down = writing - (feature.length - 1) * gap;
  const minimumContact = Math.min(.043, down / (feature.length * 2));
  const variableContact = down - minimumContact * feature.length;
  const initial = feature[0].points[0];
  const final = feature.at(-1).points.at(-1);
  let start = 0;
  const steps = feature.map((stroke, index) => {
    // The tick needs time to read as a separate decision from the long strike.
    const seconds = tickAndStrike ? index === 0 ? .19 : down - .19 : minimumContact + variableContact * lengths[index] / length;
    const step = { stroke, length: lengths[index], start, end: start + seconds };
    start += seconds + gap;
    return step;
  });
  return { before, after: layout.flatMap(mark => mark.strokes), steps, initial, final, writing, outcome,
    focus: { x: 105, y: room.top + 13 }, lastOrder: layout.at(-1).order };
}

function strokeAt({ stroke, length: total }, fraction) {
  let remaining = total * fraction;
  const points = [stroke.points[0]];
  for (let i = 1; i < stroke.points.length; i++) {
    const a = stroke.points[i - 1], b = stroke.points[i];
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (remaining < length) {
      points.push([mix(a[0], b[0], remaining / length), mix(a[1], b[1], remaining / length)]);
      break;
    }
    points.push(b);
    remaining -= length;
  }
  return { ...stroke, points };
}

const nibAt = ([x, y], height = 0) => ({ x, y, height });
function approachNib(point, amount) {
  const travel = 1 - smooth(amount);
  const clearance = 1 - smooth((amount - .20) / .80);
  return nibAt([point[0] + 34 * travel, point[1] + 108 * travel], 24 * clearance);
}
function withdrawNib(nib, amount) {
  if (!nib || amount >= 1) return null;
  // Break paper contact first, then let the hand fall below the finished row.
  const away = smooth((amount - .06) / .94);
  const lift = smooth(amount / .30);
  return nibAt([nib.x + 47 * away, nib.y + 114 * away], nib.height + 22 * lift);
}

export function checkoffPenAt(plan, time) {
  const { penApproach, penRelease } = CHECKOFF_TIMING;
  if (time < 0) return { strokes: [], nib: time < -penApproach ? null : approachNib(plan.initial, 1 + time / penApproach), step: -1 };
  const strokes = [];
  for (const [index, step] of plan.steps.entries()) {
    if (time < step.start) {
      const previous = plan.steps[index - 1];
      const a = previous.stroke.points.at(-1), b = step.stroke.points[0];
      const t = clamp((time - previous.end) / (step.start - previous.end));
      return { strokes, step: -1, nib: nibAt([mix(a[0], b[0], smooth(t)), mix(a[1], b[1], smooth(t))], 4 * Math.sin(Math.PI * t)) };
    }
    if (time < step.end) {
      const t = clamp((time - step.start) / (step.end - step.start));
      const part = strokeAt(step, t * .55 + smooth(t) * .45);
      strokes.push(part);
      return { strokes, nib: nibAt(part.points.at(-1)), step: index };
    }
    strokes.push(step.stroke);
  }
  return { strokes, nib: withdrawNib(nibAt(plan.final), (time - plan.writing) / penRelease), step: -1 };
}

export function makeWorkOrderCheckoffScene({ plan, reducedMotion = false, drawSheet, foley, onSeen = () => {},
  onClose = () => {}, ready = () => true, active = () => true, interrupted = () => false, moving = () => false } = {}) {
  if (!plan) return null;
  const { wait, raise, settle, lower, cleanHold, retryHold } = CHECKOFF_TIMING;
  const writeAt = wait + (reducedMotion ? 0 : raise + settle);
  const resultAt = writeAt + (reducedMotion ? 0 : plan.writing);
  const readHold = plan.outcome === 'clean' ? cleanHold : retryHold;
  // The verdict gets a little more weight in this brief view. Earlier marks
  // and the saved paper keep their original stroke widths.
  const featured = new Set(plan.steps.map(step => step.stroke));
  const completedInk = plan.after.map(stroke => featured.has(stroke) ? visibleBiro(stroke) : stroke);
  let elapsed = 0, phase = 'waiting', closed = false, seen = false, lifted = false, playingStep = -1;
  let loweredAt = null, loweredFrame = null;

  function reportSeen() {
    if (!seen) { seen = true; onSeen(plan.lastOrder); }
  }
  function stopAudio() {
    if (playingStep >= 0) playingStep = -1;
    foley?.stop();
  }
  function finish({ report = true } = {}) {
    if (closed) return;
    closed = true;
    phase = 'closed';
    if (report) reportSeen();
    onClose();
  }
  function frame() {
    if (loweredFrame) {
      const amount = clamp((elapsed - loweredAt) / lower);
      return { ...loweredFrame, lower: amount, nib: withdrawNib(loweredFrame.nib, amount), clock: elapsed };
    }
    const written = elapsed >= resultAt;
    const pen = reducedMotion ? null : checkoffPenAt(plan, elapsed - writeAt);
    const lift = reducedMotion ? 1 : clamp((elapsed - wait) / raise);
    return { phase, lift, lower: 0, settled: reducedMotion ? 1 : clamp((elapsed - wait - raise) / settle),
      focus: plan.focus, reducedMotion, clock: elapsed, outcome: plan.outcome, nib: pen?.nib ?? null,
      strokes: written ? completedInk : [...plan.before, ...pen.strokes.map(visibleBiro)],
      inkKey: written ? 'complete' : pen.step < 0 && elapsed < writeAt ? 'before' : elapsed };
  }
  const visible = () => phase !== 'waiting' && !closed && ready() && !interrupted();
  function dismiss({ immediate = false } = {}) {
    if (closed) return false;
    if (immediate || reducedMotion || phase === 'waiting') { stopAudio(); finish(); return true; }
    if (loweredAt !== null) return false;
    loweredFrame = frame();
    loweredAt = elapsed;
    phase = 'lowering';
    reportSeen();
    playingStep = -1;
    foley?.lower();
    return true;
  }
  return {
    id: ID, overlay: true, blocksWorld: false, blocksInput: false, allowsLook: true,
    get handlesEscape() { return !closed && phase !== 'lowering' && ready(); },
    advance(dt) {
      if (closed) return;
      if (!active()) { stopAudio(); return; }
      if (interrupted()) { finish({ report: false }); return; }
      if (!ready()) {
        if (phase !== 'waiting') finish();
        return;
      }
      if (moving() && loweredAt === null) { dismiss(); return; }
      elapsed += Math.max(0, Math.min(.25, Number(dt) || 0));
      if (loweredAt !== null) { if (elapsed - loweredAt >= lower) finish(); return; }
      if (elapsed < wait) return;
      if (!lifted) {
        lifted = true;
        foley?.lift();
      }
      phase = elapsed >= resultAt ? 'written' : elapsed >= writeAt ? 'writing' : 'raising';
      if (phase === 'written') reportSeen();
      if (elapsed >= resultAt + readHold) { dismiss(); return; }
      if (reducedMotion || phase !== 'writing') {
        if (playingStep >= 0) { foley?.stopStroke(); playingStep = -1; }
        return;
      }
      const time = elapsed - writeAt;
      const step = plan.steps.findIndex(event => time >= event.start && time < event.end);
      if (step === playingStep) return;
      if (step < 0) foley?.stopStroke();
      else {
        const event = plan.steps[step];
        foley?.stroke({ duration: event.end - time, strength: clamp(event.stroke.width / .49) });
      }
      playingStep = step;
    },
    view() {
      const drawn = visible() ? frame() : null;
      return { id: ID, phase, elapsed, outcome: plan.outcome, focus: plan.focus,
        nib: drawn?.nib ?? null, closed };
    },
    get presentationLift() {
      if (!visible()) return 0;
      if (loweredFrame) return smooth(loweredFrame.lift) * (1 - smooth((elapsed - loweredAt) / lower));
      return reducedMotion ? 1 : smooth((elapsed - wait) / raise);
    },
    render() { if (!closed && phase !== 'waiting' && !interrupted()) drawSheet?.(frame()); },
    exit() { closed = true; stopAudio(); },
    suspend: stopAudio,
    dismiss,
    key(e) {
      if (!this.handlesEscape) return false;
      const key = String(e?.key || '').toLowerCase();
      const code = e?.code || '';
      if (key === 'escape' || code === 'Escape' || e?.controllerAction === 'back') { dismiss(); return true; }
      if (['interact', 'confirm'].includes(e?.controllerAction) || ['e', 'enter', ' ', 'r', 'b', 'c', 'm', 'q'].includes(key)
        || /^Key[ERBCMQWASD]$/.test(code) || /^[wasd]$|^arrow/.test(key)) dismiss();
      return false;
    },
  };
}
