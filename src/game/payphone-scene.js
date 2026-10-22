// THE HANDSET UP, INSIDE THE BOX. 1988.
//
// The set's own behaviour. A rotary dial, turned by hand: pull a finger hole
// round to the stop and let go, and the dial comes back at its own speed,
// breaking the line once for every pulse. Let go early and it dials a smaller
// number, the way a real one did. There is no undo and there is no key that
// calls: the exchange connects once the number is complete, or gives up five
// seconds after the last digit. A wrong digit means pressing the hook.
//
// Pay on answer: dialling is free; when the far end picks up he hears them
// through rapid pips, the slot's lamp lights, and until something goes in the
// slot they hear only pips. After long enough they put it down. He has no coins.
// The tape fits.
//
// Which number does what belongs to src/game/payphone.js, what the tape costs to
// payphone-tape.js, what is said on the line to the story. This is the set.
//
// Pointer only for the dial. Escape steps out of the box — and if his own van
// is ringing up the road, he leaves the handset hanging.
import * as scenes from './scenes.js';
import { uiCellMetrics, uiCenter, uiSize } from '../render/ui.js';
import {
  dialAngleAt, dialGeometry, dialHoleAt, drawPayphone, inCentre, payphoneLayout, releasePayphoneArt, ROTARY_SPACING, rotaryTravelAngle,
} from '../render/payphone-view.js';
import {
  PAYPHONE_CARD, PAYPHONE_DIRECTORY, PAYPHONE_INSTRUCTIONS, PAYPHONE_INTERDIGIT_SECONDS, PAYPHONE_MAX_DIGITS, PAYPHONE_SCRATCHES,
  numberComplete, normaliseDialled, payphoneOutcome, rotaryReturnSeconds,
} from './payphone.js';
import { PAYPHONE_PIPS_SECONDS } from './payphone-tape.js';

// A dial tone left alone turns into the howler, but not before he has had time to read the booth.
export const PAYPHONE_IDLE_SECONDS = 60;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export function makePayphoneScene({
  line = null,
  flags = () => false,
  pass = 0,
  hasChapelKey = () => false,
  incoming = null,
  onCall = () => {},
  onRing = () => {},
  onUnpaid = () => {},
  onFeed = () => ({ ok: false, reason: 'no-tape' }),
  onTake = () => {},
  onInspect = () => {},
  onLift = () => {},
  onHook = () => {},
  onHandset = () => {},
  onFirstPips = () => {},
  onClose = () => {},
  mapPointer = (event) => event,
  onLook = () => {},
  startOnHook = false,
  exchangeSeconds = () => 1.4 + Math.random() * 1.6,
  reducedMotion = () => false,
  clock = () => (globalThis.performance?.now?.() ?? Date.now()) / 1000,
} = {}) {
  let digits = '';
  // dialtone | exchange | ringing | engaged | unobtainable | pips | connected | cleared | howler
  let phase = startOnHook ? 'onhook' : 'dialtone';
  let outcome = null;
  let at = { connect: 0, answer: 0, pipsEnd: 0, cleared: 0, idle: clock(), interdigit: 0 };
  // The dial: a finger in a hole (grab), and a dial coming back (returning).
  let grab = null;           // { digit, lastAngle, rotation }
  let returning = null;      // { from, pulses, startedAt, seconds }
  let settle = null;         // { startedAt, amp }: the dial knocking against its stop and settling
  let slot = null;           // { credit } once the tape has gone in
  let flap = null;
  let windowView = null;     // { label, turning, angle }
  let hover = null, hoverHole = null;
  let keyboardRegion = null;
  let layout = null;
  let scene = null;
  let handset = startOnHook ? 'hook' : 'up';
  let incomingWaiting = !!incoming;
  let incomingBellAt = 0;
  let looking = null;
  const waitingCall = () => typeof incoming === 'function' ? incoming() : incomingWaiting ? incoming : null;

  // THE RETURN SPRING. The governor brings the dial back at one steady speed; at
  // rest it knocks against its stop and rocks there for a moment before it is
  // still. Never with reduced motion.
  const SETTLE_SECONDS = 0.42;
  const rotationNow = () => {
    if (grab) return grab.rotation;
    if (returning) {
      const t = Math.min(1, (clock() - returning.startedAt) / returning.seconds);
      return returning.from * (1 - t);
    }
    if (settle && !reducedMotion()) {
      const t = clock() - settle.startedAt;
      if (t < SETTLE_SECONDS) return settle.amp * Math.exp(-t * 11) * Math.abs(Math.sin(t * 38));
      settle = null;
    }
    return 0;
  };
  const dialBusy = () => !!grab || !!returning;
  const toPixels = (event) => {
    const m = uiCellMetrics();
    return { px: Number(event.cellX) * (m.cellW || 8), py: Number(event.cellY) * (m.cellH || 16) };
  };
  function clearGrab() {
    const held = grab;
    grab = null;
    try { if (held?.pointerId != null && held.target?.hasPointerCapture?.(held.pointerId)) held.target.releasePointerCapture?.(held.pointerId); } catch (_) {}
    return held;
  }

  function dialTone() { phase = 'dialtone'; line?.tone?.('dial'); at.idle = clock(); }

  function lift() {
    if (handset === 'up' && phase !== 'onhook') return false;
    handset = 'up';
    onHandset('lifted');
    line?.mechanism?.('lift');
    line?.offHook?.();
    const waiting = waitingCall();
    onLift(waiting);
    // A late-pass call is waiting behind the physical receiver, not a menu.
    if (waiting) {
      incomingWaiting = false;
      outcome = waiting;
      phase = 'connected';
      line?.silence?.();
      onCall(waiting, { callEnded, incoming: true });
    } else dialTone();
    return true;
  }

  // ── the dial ────────────────────────────────────────────────────────────
  function grabHole(digit, angle, pointerId = null, target = null) {
    if (!/^\d$/.test(String(digit))) return false;
    if (phase !== 'dialtone' || dialBusy() || digits.length >= PAYPHONE_MAX_DIGITS) return false;
    grab = { digit: String(digit), lastAngle: angle, rotation: 0, pointerId, target };
    line?.mechanism?.('dial-grab');
    at.idle = clock();
    return true;
  }
  function turnTo(angle) {
    if (!grab) return;
    const step = wrap(angle - grab.lastAngle);
    grab.lastAngle = angle;
    grab.rotation = Math.max(0, Math.min(rotaryTravelAngle(grab.digit), grab.rotation + step));
  }
  // Letting go. A full pull to the stop dials the hole's number; a short one
  // dials however many pulses it wound up — lost motion takes the first.
  function release({ cancelled = false } = {}) {
    if (!grab) return null;
    const { rotation } = grab;
    const full = rotation >= rotaryTravelAngle(grab.digit) - ROTARY_SPACING * 0.25;
    const pulses = cancelled ? 0 : full ? Number(grab.digit === '0' ? 10 : grab.digit) : Math.floor(rotation / ROTARY_SPACING) - 1;
    clearGrab();
    if (rotation <= 0.02) return null;
    const dialled = pulses >= 1 ? (pulses === 10 ? '0' : String(pulses)) : null;
    const seconds = dialled ? rotaryReturnSeconds(dialled) : 0.18;
    returning = { from: rotation, pulses: Math.max(0, pulses), startedAt: clock(), seconds, digit: dialled };
    if (dialled) line?.pulses?.(Math.max(1, pulses));
    else line?.mechanism?.('dial-return');
    return dialled;
  }
  function settleDial() {
    if (!returning || clock() - returning.startedAt < returning.seconds) return;
    const { digit, from } = returning;
    returning = null;
    settle = { startedAt: clock(), amp: Math.min(ROTARY_SPACING * 0.22, from * 0.05) };
    if (!digit || phase !== 'dialtone') return;
    digits = normaliseDialled(digits + digit);
    at.interdigit = clock() + PAYPHONE_INTERDIGIT_SECONDS;
    at.idle = clock();
    if (numberComplete(digits)) connect();
  }

  // ── the exchange ────────────────────────────────────────────────────────
  function connect() {
    if (!digits) return;
    outcome = payphoneOutcome({ digits, flags, hasChapelKey: !!hasChapelKey(), pass });
    if (outcome.id === 'nothing') { outcome = null; return; }
    phase = 'exchange';
    at.connect = clock() + (line?.exchange?.(exchangeSeconds()) ?? exchangeSeconds());
  }
  function startLine() {
    if (outcome.tone === 'engaged') { line?.tone?.('engaged'); phase = 'engaged'; return; }
    if (outcome.tone === 'unobtainable') { line?.tone?.('unobtainable'); phase = 'unobtainable'; if (outcome.node) onCall(outcome, { callEnded, unanswered: true }); return; }
    if (outcome.tone === 'none') { phase = 'connected'; line?.silence?.(); onCall(outcome, { callEnded }); return; }
    const rings = Number.isFinite(outcome.rings) ? Math.max(1, outcome.rings) : 40;
    line?.tone?.('ringing', { cycles: outcome.answers ? rings : 200 });
    onRing(outcome);
    phase = 'ringing';
    at.answer = outcome.answers ? clock() + (line?.ringSeconds?.(rings) ?? rings * 3) : Infinity;
  }
  function answered() {
    line?.silence?.();
    if (outcome.pays && !slot) {
      phase = 'pips';
      line?.tone?.('paytone', { cycles: Math.ceil(PAYPHONE_PIPS_SECONDS / 0.25) });
      at.pipsEnd = clock() + PAYPHONE_PIPS_SECONDS;
      onFirstPips(outcome);
      return;
    }
    phase = 'connected';
    onCall(outcome, { callEnded, paid: !!slot });
  }

  // THE SLOT. Shut until there are pips to pay: a pay-on-answer box takes money
  // only once somebody has answered. Then the tape goes in, and he can be heard.
  function feed() {
    if (phase !== 'pips') { line?.mechanism?.('slot-shut'); return false; }
    if (slot) return false;
    const result = onFeed(outcome) || {};
    if (!result.ok) { line?.mechanism?.('slot-shut'); return false; }
    slot = { credit: result.credit, full: result.credit };
    line?.silence?.();
    line?.mechanism?.('tape-in');
    line?.startSpool?.();
    windowView = { label: result.label || '', turning: true, angle: 0 };
    phase = 'connected';
    onCall(outcome, { callEnded, paid: true });
    return true;
  }

  // Pressing the hook: whatever was happening on the line stops, and it goes
  // back to dial tone. Pressing it with nothing on the line puts the handset down.
  function pressHook() {
    if (handset === 'hook') { lift(); return; }
    if (['exchange', 'ringing', 'engaged', 'unobtainable', 'pips', 'connected', 'cleared', 'howler'].includes(phase) || digits) {
      const was = outcome;
      outcome = null; digits = ''; clearGrab(); returning = null;
      line?.mechanism?.('cradle');
      if (was && phase === 'connected') onHook(was);
      line?.stop?.();
      line?.offHook?.();
      windowView = slot ? { ...windowView, turning: false } : null;
      dialTone();
      return;
    }
    if (startOnHook) hangUp();
    else close();
  }

  function hangUp() {
    if (handset === 'hook') return false;
    const was = outcome;
    if (was && phase === 'connected') onHook(was);
    outcome = null; digits = ''; clearGrab(); returning = null; settle = null;
    handset = 'hook'; phase = 'onhook';
    onHandset('hook');
    line?.mechanism?.('cradle');
    line?.stop?.();
    if (windowView) windowView = { ...windowView, turning: false };
    return true;
  }

  function close({ hanging = false } = {}) {
    line?.mechanism?.(hanging ? 'swing' : 'cradle');
    const hadTape = !!slot;
    const leftOutcome = outcome;
    slot = null; clearGrab(); returning = null;
    line?.stop?.();
    scenes.remove(scene);
    releasePayphoneArt();
    onClose({ tape: hadTape, hanging, outcome: leftOutcome });
  }

  // Main: the conversation for a connected call is over. `cleared` when the far
  // end put it down (a click, then nothing, then the tone back).
  function callEnded({ cleared = true } = {}) {
    outcome = null; digits = '';
    line?.stopHold?.(); line?.stopSpool?.(); line?.stopBreathing?.(); line?.stopSelfDelay?.();
    if (windowView) windowView = { ...windowView, turning: false };
    if (cleared) { phase = 'cleared'; at.cleared = clock(); line?.farClear?.(); }
    else dialTone();
  }

  const regionAt = (event) => {
    if (!layout) return null;
    const x = Number(event.cellX), y = Number(event.cellY);
    const inside = (r) => r && x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
    const parts = handset === 'up'
      ? ['cradle', 'handset', 'slot', 'flap', 'window', 'instructions', 'scratches', 'directory']
      : ['handset', 'cradle', 'slot', 'flap', 'window', 'instructions', 'scratches', 'directory'];
    for (const id of parts) if (inside(layout[id])) return id;
    return null;
  };

  scene = {
    id: 'payphone',
    blocksInput: true,
    blocksWorld: false,
    allowsLook: false,
    suppressesHud: true,
    handlesEscape: true,
    pass,
    view: () => ({
      digits, phase, handset, hover, flap,
      incoming: handset === 'hook' ? waitingCall()?.id || null : null,
      focusRegion: keyboardRegion,
      slot: slot ? { ...slot } : null,
      window: windowView ? { ...windowView } : null,
      dial: { rotation: rotationNow(), grabbed: grab?.digit || null, returning: !!returning },
      outcome: outcome ? { id: outcome.id, node: outcome.node, pays: !!outcome.pays, grants: [...(outcome.grants || [])] } : null,
    }),
    enter() {
      if (!startOnHook) { handset = 'hook'; lift(); }
    },
    update() {
      const t = clock();
      if (handset === 'hook' && waitingCall()?.rings > 0 && t >= incomingBellAt) {
        incomingBellAt = t + 3;
        line?.bell?.({ rings: 1, distance01: 0, gain: .65 });
      }
      settleDial();
      if (windowView?.turning) windowView.angle = (windowView.angle || 0) + 0.06;
      if (phase === 'dialtone' && digits && !dialBusy() && t >= at.interdigit) connect();
      else if (phase === 'exchange' && t >= at.connect) startLine();
      else if (phase === 'ringing' && t >= at.answer) answered();
      else if (phase === 'pips' && t >= at.pipsEnd) {
        const was = outcome;
        phase = 'cleared'; at.cleared = t; outcome = null;
        line?.silence?.(); line?.farClear?.();
        onUnpaid(was, { callEnded });
      } else if (phase === 'cleared' && t - at.cleared >= 1.6) {
        digits = ''; dialTone();
      } else if (phase === 'dialtone' && !digits && !dialBusy() && t - at.idle >= PAYPHONE_IDLE_SECONDS) {
        phase = 'howler';
        line?.tone?.('howler');
      }
    },
    setCredit(seconds) { if (slot) slot.credit = Math.max(0, Number(seconds) || 0); },
    // Main: the name under the head, and whether the tape is moving (it runs only
    // while a paid call is connected).
    setWindow(label, turning = null) {
      if (!windowView) return;
      if (label != null) windowView.label = String(label);
      if (turning != null) { windowView.turning = !!turning; if (turning) line?.startSpool?.(); else line?.stopSpool?.(); }
    },
    tapeIn: () => !!slot,
    // The tape has run out: pips, and the slot is empty again — nothing in it to
    // pay the next call with.
    creditExpired() {
      if (!slot) return;
      slot = null;
      line?.tone?.('paytone', { cycles: 12 });
      line?.stopSpool?.();
      if (windowView) windowView = { ...windowView, turning: false, label: 'END OF TAPE' };
    },
    setFlap(item) { flap = item || null; if (item) line?.mechanism?.(item === 'tape' ? 'return-tape' : item === 'key' ? 'return-key' : 'return-page'); },
    key(event) {
      event.preventDefault?.();
      if (event.key === 'Escape' || event.controllerAction === 'back') {
        // His own phone ringing up the road: he goes to it, and the handset stays off.
        const hanging = phase === 'ringing' && outcome?.ringsAt === 'van';
        close({ hanging });
        return true;
      }
      const look = { ArrowLeft: [-.13, 0], ArrowRight: [.13, 0], ArrowUp: [0, -.10], ArrowDown: [0, .10] }[event.key];
      if (look) { onLook({ yaw: look[0], pitch: look[1] }); return true; }
      // Keyboard users can reach the same physical parts. The rotary remains
      // a wound mechanism: typing digits never substitutes for pulling it.
      if (event.key === 'Tab') {
        const regions = ['handset', 'instructions', 'card', 'directory', 'scratches', 'window', 'slot', 'flap', 'cradle'];
        const index = regions.indexOf(keyboardRegion);
        keyboardRegion = regions[(index + (event.shiftKey ? -1 : 1) + regions.length) % regions.length];
        return true;
      }
      if (keyboardRegion && !event.repeat && (event.key === 'Enter' || event.key === ' ')) {
        if (keyboardRegion === 'handset') { if (handset === 'hook') lift(); else hangUp(); }
        else if (keyboardRegion === 'cradle') pressHook();
        else if (keyboardRegion === 'slot') feed();
        else if (keyboardRegion === 'flap') { if (flap) { onTake(flap); flap = null; } }
        else onInspect(keyboardRegion);
        return true;
      }
      return true;
    },
    keyup() { return true; },
    // A call's thought presenter may pass only these physical interrupt parts
    // through while it owns dialogue input. The rest of its input stays modal.
    receiverPointer(event) {
      const mapped = mapPointer(event, layout);
      if (!mapped || !['handset', 'cradle'].includes(regionAt(mapped))) return false;
      return scene.pointer(event);
    },
    lookPointer(event) {
      if (!looking && (event.button ?? 0) !== 2) return false;
      return scene.pointer(event);
    },
    pointer(event) {
      if (!layout) return true;
      const raw = event.originalEvent || event;
      if (event.type === 'pointerdown' && (event.button ?? 0) === 2 && !grab) {
        looking = { id: event.pointerId, x: Number(raw.clientX) || 0, y: Number(raw.clientY) || 0, target: raw.target };
        try { looking.target?.setPointerCapture?.(event.pointerId); } catch (_) {}
        return true;
      }
      if (looking && (event.pointerId == null || looking.id == null || event.pointerId === looking.id)) {
        if (event.type === 'pointermove') {
          const x = Number(raw.clientX) || 0, y = Number(raw.clientY) || 0;
          onLook({ yaw: (x - looking.x) * .004, pitch: (y - looking.y) * .004 });
          looking.x = x; looking.y = y;
        } else if (event.type === 'pointerup' || event.type === 'pointercancel') {
          try { looking.target?.releasePointerCapture?.(looking.id); } catch (_) {}
          looking = null;
        }
        return true;
      }
      // Release the owned spring even when the finger has left the projected
      // cabinet, or the listener has turned away from it.
      if (event.type === 'pointerup' || event.type === 'pointercancel') {
        if (grab && (event.pointerId == null || grab.pointerId == null || event.pointerId === grab.pointerId)) release({ cancelled: event.type === 'pointercancel' });
        return true;
      }
      event = mapPointer(event, layout);
      if (!event) { hover = null; hoverHole = null; return true; }
      const { px, py } = toPixels(event);
      const geometry = dialGeometry(layout);
      if (event.type === 'pointermove') {
        keyboardRegion = null;
        if (grab) {
          if (grab.pointerId == null || event.pointerId === grab.pointerId) turnTo(dialAngleAt(geometry, px, py));
        }
        else {
          hoverHole = phase === 'dialtone' && !dialBusy() ? dialHoleAt(geometry, px, py, 0) : null;
          hover = dialHoleAt(geometry, px, py, 0) ? 'dial' : inCentre(geometry, px, py) ? 'card' : regionAt(event);
        }
        return true;
      }
      if (event.type !== 'pointerdown') return true;
      if ((event.button ?? 0) !== 0 || event.originalEvent?.isPrimary === false || grab) return true;
      keyboardRegion = null;
      const hole = dialHoleAt(geometry, px, py, 0);
      if (hole) {
        const target = event.originalEvent?.target;
        if (grabHole(hole, dialAngleAt(geometry, px, py), event.pointerId ?? null, target)) {
          try { target?.setPointerCapture?.(event.pointerId); } catch (_) {}
        }
        return true;
      }
      if (inCentre(geometry, px, py)) { onInspect('card'); return true; }
      const region = regionAt(event);
      if (region === 'handset') { if (handset === 'hook') lift(); else hangUp(); }
      else if (region === 'slot') feed();
      else if (region === 'flap') { if (flap) { onTake(flap); flap = null; } }
      else if (region === 'cradle') pressHook();
      else if (region) onInspect(region);
      return true;
    },
    render() {
      const size = uiSize();
      layout = drawPayphone({
        rotation: rotationNow(), card: PAYPHONE_CARD, instructions: PAYPHONE_INSTRUCTIONS,
        scratches: PAYPHONE_SCRATCHES, directory: PAYPHONE_DIRECTORY,
        slotLit: phase === 'pips' && Math.floor(clock() * 4) % 2 === 0,
        slot: slot ? 'tape' : null, window: windowView, flap, handset, hover: keyboardRegion || hover, hoverHole: grab ? null : hoverHole,
        credit: slot?.credit ?? null, creditFull: slot?.full ?? null,
        time: clock(), reducedMotion: !!reducedMotion(),
      }, size);
      const hint = phase === 'onhook' ? (waitingCall() ? 'THE TELEPHONE IS RINGING · LIFT THE RECEIVER · RIGHT DRAG TO LOOK' : 'LIFT THE RECEIVER · RIGHT DRAG TO LOOK · ESC STEPS OUT')
        : phase === 'pips' ? 'PIPS: SOMEBODY HAS ANSWERED · PAY TO BE HEARD'
        : 'DRAG A FINGER HOLE ROUND TO THE STOP · RIGHT DRAG TO LOOK · ESC STEPS OUT';
      uiCenter(Math.min(size.rows - 1, layout.hint.y), hint, phase === 'pips' ? 'ui-amber' : 'ui-label');
    },
    exit() {
      clearGrab(); returning = null;
      try { looking?.target?.releasePointerCapture?.(looking.id); } catch (_) {}
      looking = null; line?.stop?.(); releasePayphoneArt();
    },
    // For probes and specs: a whole pull of each digit, dial return included.
    pull(digit) {
      if (phase !== 'dialtone' || dialBusy()) return false;
      grab = { digit: String(digit), lastAngle: 0, rotation: rotaryTravelAngle(String(digit)) };
      release();
      return true;
    },
    // For the headless probe: the whole number at once, as if dialled and let go.
    probeDial(number) {
      if (phase !== 'dialtone' || dialBusy()) return false;
      digits = normaliseDialled(digits + String(number || ''));
      at.interdigit = clock() + PAYPHONE_INTERDIGIT_SECONDS;
      if (numberComplete(digits)) connect();
      return true;
    },
    grabHole, turnTo, release, feed, pressHook, hangUp, lift, close, connect,
    layout: () => layout || payphoneLayout(uiSize()),
  };
  scene.callEnded = callEnded;
  return scene;
}
