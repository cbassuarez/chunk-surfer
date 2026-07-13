// rAF fixed-step loop utility. The first integration keeps the existing main
// loop, but this tested primitive is the contract for future motion extraction.

export class FixedStepLoop {
  constructor({
    step = 1 / 60,
    maxFrameDt = 0.10,
    maxSteps = 5,
    update = () => {},
    render = () => {},
    now = () => globalThis.performance?.now?.() || Date.now(),
    raf = (fn) => globalThis.requestAnimationFrame?.(fn),
    caf = (id) => globalThis.cancelAnimationFrame?.(id),
  } = {}) {
    this.step = step;
    this.maxFrameDt = maxFrameDt;
    this.maxSteps = maxSteps;
    this.update = update;
    this.render = render;
    this.now = now;
    this.raf = raf;
    this.caf = caf;
    this.last = 0;
    this.accumulator = 0;
    this.running = false;
    this.frameId = null;
    this.stats = {
      frames: 0,
      updates: 0,
      droppedTime: 0,
      lastRawDt: 0,
      lastClampedDt: 0,
      lastSteps: 0,
      maxRawDt: 0,
      maxStepsSeen: 0,
      resets: 0,
      lastResetReason: '',
    };
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.last = this.now();
    this.frameId = this.raf((ts) => this.frame(ts));
  }

  stop(reason = 'stop') {
    if (!this.running) return;
    this.running = false;
    if (this.frameId != null) this.caf(this.frameId);
    this.resetClock(reason);
  }

  resetClock(reason = 'reset-clock') {
    this.last = this.now();
    this.accumulator = 0;
    this.stats.resets += 1;
    this.stats.lastResetReason = reason;
  }

  frame(timestampMs = this.now()) {
    if (!this.running) return;
    const rawDt = Math.max(0, (Number(timestampMs) - this.last) / 1000);
    const dt = Math.min(rawDt, this.maxFrameDt);
    this.last = Number(timestampMs);
    this.accumulator += dt;
    this.stats.frames += 1;
    this.stats.lastRawDt = rawDt;
    this.stats.lastClampedDt = dt;
    this.stats.maxRawDt = Math.max(this.stats.maxRawDt, rawDt);

    let steps = 0;
    while (this.accumulator >= this.step && steps < this.maxSteps) {
      this.update(this.step);
      this.accumulator -= this.step;
      steps += 1;
    }
    if (steps === this.maxSteps && this.accumulator >= this.step) {
      this.stats.droppedTime += this.accumulator;
      this.accumulator = 0;
    }
    this.stats.updates += steps;
    this.stats.lastSteps = steps;
    this.stats.maxStepsSeen = Math.max(this.stats.maxStepsSeen, steps);

    const alpha = this.step > 0 ? this.accumulator / this.step : 0;
    this.render(alpha, dt);
    this.frameId = this.raf((ts) => this.frame(ts));
  }

  debugState() {
    return { ...this.stats, accumulator: this.accumulator, running: this.running, step: this.step, maxFrameDt: this.maxFrameDt, maxSteps: this.maxSteps };
  }
}
