export function createPerformanceMeter({
  now = () => globalThis.performance?.now?.() ?? Date.now(),
  sampleSize = 60,
} = {}) {
  const frames = [];
  const maxSamples = Math.max(4, Math.floor(Number(sampleSize) || 60));
  let last = 0;
  let fps = null;
  let frameMs = null;
  let lastFrameMs = null;

  function snapshot(includePercentiles = true) {
    const ordered=includePercentiles&&frames.length?[...frames].sort((a,b)=>a-b):null;
    return {
      fps,
      frameMs,
      p95FrameMs: ordered?.[Math.max(0,Math.ceil(ordered.length*.95)-1)]??null,
      lastFrameMs,
      maxFrameMs: frames.length ? Math.max(...frames) : null,
      spikesAbove50: frames.filter((value) => value > 50).length,
      samples: frames.length,
    };
  }

  function frame(t = now()) {
    const current = Number(t) || 0;
    if (last > 0) {
      const dt = Math.max(0.001, current - last);
      lastFrameMs = dt;
      frames.push(dt);
      while (frames.length > maxSamples) frames.shift();

      const avg = frames.reduce((sum, value) => sum + value, 0) / frames.length;
      frameMs = avg;
      fps = 1000 / avg;
    }
    last = current;
    // The render loop does not consume this value. Keep the historical return
    // shape without sorting the sample window on every frame; capture and
    // diagnostics callers request the complete percentile snapshot explicitly.
    return snapshot(false);
  }

  function reset() {
    frames.length = 0;
    last = 0;
    fps = null;
    frameMs = null;
    lastFrameMs = null;
  }

  return { frame, snapshot, reset };
}
