// A transient presentation policy. It never writes display settings: null means
// the renderer should use its ordinary native pixel ratio for explicit quality.
// The policy observes only uninterrupted, foreground world frames.
// The floor sits below half resolution: the recorded pixel look stays coherent
// because the dither grid tracks the applied ratio, and a machine that needs
// this step needs every pixel gone before it can clear the 30 fps bar.
const MIN_RATIO = .375;
const STEP = .125;
const SETTLE_MS = 2000;
const WINDOW_MS = 2000;
const MIN_SAMPLES = 12;
const MAX_GAP_MS = 1000;
const COOLDOWN_MS = 5000;
const RECOVER_MS = 20000;
const SLOW_WINDOWS = 2;
const FRAME_BUDGET_MS = 1000 / 30;

const percentile = (sorted, p) => sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)];
const finiteDpr = value => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : 1;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const quantize = value => Math.round(value * 1000) / 1000;

export function createAutoWorldPixelRatio() {
  let auto = false, ratio = null, nativeDpr = 1, ceiling = 1, floor = MIN_RATIO;
  let activeLast = false, lastMs = null, settleUntil = 0, cooldownUntil = 0;
  let windowStart = 0, samples = [], slowWindows = 0, goodMs = 0;
  let reason = 'explicit';

  function clearWindow() { samples = []; windowStart = 0; }
  function hold(now) {
    activeLast = false;
    lastMs = null;
    settleUntil = now + SETTLE_MS;
    clearWindow();
    slowWindows = 0;
    goodMs = 0;
  }
  function snapshot(changed = false) {
    return { ratio, changed, auto, nativeDpr, floor, ceiling, reason, samples: samples.length };
  }
  // nowMs must be a monotonic foreground frame timestamp. Pass active=false
  // during pause, loading, focus/visibility loss, scripted holds or resizing.
  function frame(nowMs, { auto: requestedAuto = false, nativeDpr: reportedDpr = 1, active = false } = {}) {
    const now = Number(nowMs);
    if (!Number.isFinite(now)) return snapshot();
    const actualDpr = finiteDpr(reportedDpr);
    if (!requestedAuto) {
      const changed = ratio !== null;
      auto = false; ratio = null; nativeDpr = actualDpr;
      ceiling = Math.min(nativeDpr, 1); floor = Math.min(MIN_RATIO, ceiling);
      hold(now); cooldownUntil = 0; reason = 'explicit';
      return snapshot(changed);
    }
    if (!auto || actualDpr !== nativeDpr) {
      auto = true; nativeDpr = actualDpr;
      ceiling = Math.min(nativeDpr, 1); floor = Math.min(MIN_RATIO, ceiling);
      ratio = ceiling; cooldownUntil = 0; hold(now); reason = 'auto-start';
      return snapshot(true);
    }
    if (!active) { hold(now); reason = 'held'; return snapshot(); }
    if (!activeLast) {
      activeLast = true; lastMs = now; settleUntil = now + SETTLE_MS;
      clearWindow(); reason = 'settling'; return snapshot();
    }
    const dt = now - lastMs;
    lastMs = now;
    // A background/sleep gap or a single debugger/asset stall is not a
    // sustained rendering problem. Re-warm instead of reacting or catching up.
    if (dt <= 0 || dt > MAX_GAP_MS) {
      settleUntil = now + SETTLE_MS; clearWindow(); slowWindows = 0; goodMs = 0;
      reason = 'interrupted'; return snapshot();
    }
    if (now < settleUntil || now < cooldownUntil) { clearWindow(); reason = 'settling'; return snapshot(); }
    if (!windowStart) windowStart = now - dt;
    samples.push(dt);
    if (samples.length > 512) samples.shift();
    const duration = now - windowStart;
    if (duration < WINDOW_MS || samples.length < MIN_SAMPLES) return snapshot();
    const sorted = [...samples].sort((a,b) => a-b);
    const mean = samples.reduce((a,b) => a+b, 0) / samples.length;
    const median = percentile(sorted, .5), p90 = percentile(sorted, .9);
    // A small tolerance avoids treating timer quantization around exactly
    // 30 fps as a persistent deficit.
    const slow = mean > FRAME_BUDGET_MS + .25 || (median > 31 && p90 > 34.5);
    const good = mean <= 25 && p90 <= 29;
    clearWindow();
    if (slow) {
      slowWindows += 1; goodMs = 0; reason = 'slow-window';
      if (slowWindows >= SLOW_WINDOWS && ratio > floor) {
        ratio = quantize(clamp(ratio - STEP, floor, ceiling));
        slowWindows = 0; settleUntil = now + SETTLE_MS; cooldownUntil = now + COOLDOWN_MS;
        reason = 'lower'; return snapshot(true);
      }
    } else {
      slowWindows = 0;
      goodMs = good ? goodMs + duration : 0;
      reason = good ? 'headroom' : 'stable';
      if (goodMs >= RECOVER_MS && ratio < ceiling) {
        ratio = quantize(clamp(ratio + STEP, floor, ceiling));
        goodMs = 0; settleUntil = now + SETTLE_MS; cooldownUntil = now + COOLDOWN_MS;
        reason = 'recover'; return snapshot(true);
      }
    }
    return snapshot();
  }
  return { frame, snapshot: () => snapshot() };
}
