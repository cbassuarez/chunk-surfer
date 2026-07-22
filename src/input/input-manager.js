// Authoritative input state for gameplay motion.
//
// Keyboard events are edge/state events only: gameplay samples a snapshot from
// this object during the frame loop. That prevents OS key-repeat, focus loss,
// and scene overlays from becoming hidden movement clocks.

export const MOVEMENT_CODES = Object.freeze({
  forward: ['ArrowUp', 'KeyW'],
  back: ['ArrowDown', 'KeyS'],
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
});

export const ACTION_CODES = Object.freeze({
  interact: ['KeyE', 'Enter'],
  listen: ['KeyR'],
  bag: ['KeyB'],
  playback: ['KeyP'],
  pause: ['Escape'],
  quiet: ['ShiftLeft', 'ShiftRight'],
});

const LETTER_CODE = /^[a-z]$/i;

export class InputManager {
  constructor({
    target = globalThis.window || null,
    documentRef = globalThis.document || null,
    navigatorRef = globalThis.navigator || null,
    attachEvents = false,
  } = {}) {
    this.target = target;
    this.documentRef = documentRef;
    this.navigatorRef = navigatorRef;

    this.held = new Set();
    this.justPressed = new Set();
    this.justReleased = new Set();
    this.pointerDx = 0;
    this.pointerDy = 0;
    this.pointerLocked = false;
    this.focused = true;
    this.generation = 0;
    this.eventsSeen = 0;
    this.lastResetReason = '';
    this.lastResetAt = 0;
    this.lastKeyCode = '';
    this.lastKeyAt = 0;
    this.controllerStateProvider = null;
    this._listeners = [];

    if (attachEvents) this.attach();
  }

  attach() {
    if (!this.target) return this;
    this._on(this.target, 'keydown', (e) => this.keyDown(e), { capture: true });
    this._on(this.target, 'keyup', (e) => this.keyUp(e), { capture: true });
    this._on(this.target, 'blur', () => this.reset('window-blur'));
    this._on(this.target, 'focus', () => this.reset('window-focus'));
    this._on(this.target, 'pagehide', () => this.reset('pagehide'));
    this._on(this.target, 'mousemove', (e) => this.mouseMove(e));
    this._on(this.target, 'gamepadconnected', () => { this.generation += 1; });
    this._on(this.target, 'gamepaddisconnected', () => this.reset('gamepad-disconnected'));
    if (this.documentRef) {
      this._on(this.documentRef, 'visibilitychange', () => {
        if (this.documentRef.visibilityState !== 'visible') this.reset('visibility-hidden');
        else this.reset('visibility-visible');
      });
      this._on(this.documentRef, 'pointerlockchange', () => this.pointerLockChanged());
    }
    return this;
  }

  detach() {
    for (const [target, type, fn, opts] of this._listeners) {
      target.removeEventListener?.(type, fn, opts);
    }
    this._listeners = [];
    this.reset('detach');
  }

  _on(target, type, fn, opts) {
    target?.addEventListener?.(type, fn, opts);
    this._listeners.push([target, type, fn, opts]);
  }

  keyDown(e = {}) {
    if (this.shouldIgnoreKeyEvent(e)) return false;
    const code = normalizeCode(e);
    if (!code) return false;

    this.eventsSeen += 1;
    this.lastKeyCode = code;
    this.lastKeyAt = nowMs();

    if (!this.held.has(code)) this.justPressed.add(code);
    this.held.add(code);
    return true;
  }

  keyUp(e = {}) {
    const code = normalizeCode(e);
    if (!code) return false;
    // A release is removal-only. If gameplay recorded the press, always clear
    // it even when a scene or focused control consumed/prevented the keyup
    // before this manager saw it. Otherwise W/S can remain held until pause
    // performs a full reset.
    if (this.shouldIgnoreKeyEvent(e) && !this.held.has(code)) return false;

    this.eventsSeen += 1;
    this.lastKeyCode = code;
    this.lastKeyAt = nowMs();

    if (this.held.has(code)) this.justReleased.add(code);
    this.held.delete(code);
    return true;
  }

  mouseMove(e = {}) {
    if (!this.pointerLocked) return false;
    const events = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [e];
    for (const ev of events) {
      this.pointerDx += Number(ev.movementX || 0);
      this.pointerDy += Number(ev.movementY || 0);
    }
    return true;
  }

  pointerLockChanged() {
    this.pointerLocked = !!this.documentRef?.pointerLockElement;
    if (!this.pointerLocked) {
      this.pointerDx = 0;
      this.pointerDy = 0;
      this.generation += 1;
      this.lastResetReason = 'pointerlock-lost';
      this.lastResetAt = nowMs();
    }
  }

  reset(reason = 'reset') {
    this.held.clear();
    this.justPressed.clear();
    this.justReleased.clear();
    this.pointerDx = 0;
    this.pointerDy = 0;
    this.generation += 1;
    this.lastResetReason = reason;
    this.lastResetAt = nowMs();
    this.focused = !(reason.includes('blur') || reason.includes('hidden') || reason === 'pagehide');
  }

  endFrame() {
    this.justPressed.clear();
    this.justReleased.clear();
    this.pointerDx = 0;
    this.pointerDy = 0;
  }

  isHeld(code) { return this.held.has(code); }
  wasPressed(code) { return this.justPressed.has(code); }
  wasReleased(code) { return this.justReleased.has(code); }
  setControllerStateProvider(fn) {
    this.controllerStateProvider = typeof fn === 'function' ? fn : null;
    return this;
  }

  snapshot() {
    const keyboard = keyboardAxes(this.held);
    const gamepad = this.pollGamepadAxes();
    return {
      generation: this.generation,
      moveX: clampAxis(keyboard.moveX + gamepad.moveX),
      moveY: clampAxis(keyboard.moveY + gamepad.moveY),
      turnX: clampAxis(keyboard.turnX + gamepad.turnX),
      lookY: clampAxis(gamepad.lookY),
      pointerDx: this.pointerDx,
      pointerDy: this.pointerDy,
      actions: {
        interact: anyPressed(this, ACTION_CODES.interact),
        listen: anyPressed(this, ACTION_CODES.listen),
        bag: anyPressed(this, ACTION_CODES.bag),
        playback: anyPressed(this, ACTION_CODES.playback),
        pause: anyPressed(this, ACTION_CODES.pause),
        quiet: ACTION_CODES.quiet.some((c) => this.held.has(c)),
      },
      held: new Set(this.held),
    };
  }

  pollGamepadAxes() {
    const controllerAxes = this.controllerStateProvider?.();
    if (controllerAxes) {
      return {
        moveX: clampAxis(controllerAxes.moveX),
        moveY: clampAxis(controllerAxes.moveY),
        turnX: clampAxis(controllerAxes.turnX),
        lookY: clampAxis(controllerAxes.lookY),
      };
    }
    const getGamepads = this.navigatorRef?.getGamepads;
    const pads = typeof getGamepads === 'function' ? [...(getGamepads.call(this.navigatorRef) || [])].filter(Boolean) : [];
    let moveX = 0;
    let moveY = 0;
    let turnX = 0;
    let lookY = 0;
    for (const pad of pads) {
      moveX += deadzone(Number(pad.axes?.[0]) || 0);
      moveY += deadzone(-(Number(pad.axes?.[1]) || 0));
      turnX += deadzone(Number(pad.axes?.[2]) || 0);
      lookY += deadzone(-(Number(pad.axes?.[3]) || 0));
    }
    return { moveX: clampAxis(moveX), moveY: clampAxis(moveY), turnX: clampAxis(turnX), lookY: clampAxis(lookY) };
  }

  shouldIgnoreKeyEvent(e = {}) {
    if (e.defaultPrevented) return true;
    const tag = String(e.target?.tagName || '').toUpperCase();
    return tag === 'INPUT' || tag === 'TEXTAREA' || !!e.target?.isContentEditable;
  }

  debugState() {
    return {
      held: [...this.held].sort(),
      justPressed: [...this.justPressed].sort(),
      justReleased: [...this.justReleased].sort(),
      pointerDx: this.pointerDx,
      pointerDy: this.pointerDy,
      pointerLocked: this.pointerLocked,
      focused: this.focused,
      generation: this.generation,
      eventsSeen: this.eventsSeen,
      lastResetReason: this.lastResetReason,
      lastResetAt: this.lastResetAt,
      lastKeyCode: this.lastKeyCode,
      lastKeyAt: this.lastKeyAt,
      axes: keyboardAxes(this.held),
    };
  }
}

function anyPressed(input, codes) {
  return codes.some((code) => input.wasPressed(code));
}

export function normalizeCode(e = {}) {
  if (e.code) return String(e.code);
  return keyToCode(e.key);
}

export function keyToCode(key) {
  const k = String(key || '');
  if (!k) return '';
  if (k === ' ') return 'Space';
  if (k === 'Esc') return 'Escape';
  if (k === 'Shift') return 'ShiftLeft';
  if (k.startsWith('Arrow')) return k;
  if (LETTER_CODE.test(k)) return `Key${k.toUpperCase()}`;
  return k;
}

export function movementCodeForEvent(e = {}) {
  const code = normalizeCode(e);
  return isMovementCode(code) ? code : null;
}

export function isMovementCode(code) {
  return code === 'ArrowUp' || code === 'ArrowDown' || code === 'ArrowLeft' || code === 'ArrowRight'
    || code === 'KeyW' || code === 'KeyA' || code === 'KeyS' || code === 'KeyD';
}

export function keyboardAxes(held = new Set()) {
  const moveY = (held.has('ArrowUp') || held.has('KeyW') ? 1 : 0)
    - (held.has('ArrowDown') || held.has('KeyS') ? 1 : 0);
  const strafe = (held.has('KeyD') ? 1 : 0) - (held.has('KeyA') ? 1 : 0);
  const turnX = (held.has('ArrowRight') || held.has('KeyD') ? 1 : 0)
    - (held.has('ArrowLeft') || held.has('KeyA') ? 1 : 0);
  return { moveX: clampAxis(strafe), moveY: clampAxis(moveY), turnX: clampAxis(turnX) };
}

export function deadzone(v, dz = 0.12) {
  const n = Number(v) || 0;
  const a = Math.abs(n);
  if (a <= dz) return 0;
  return Math.sign(n) * ((a - dz) / (1 - dz));
}

export function clampAxis(v) {
  return Math.max(-1, Math.min(1, Number(v) || 0));
}

function nowMs() {
  return Number(globalThis.performance?.now?.() || Date.now());
}
