// Diffusion-lens streaming client (M1c).
// Captures the r3d base render, ships JPEG frames over a WebSocket to a GPU
// worker running img2img restyling, and composites returned frames on an
// overlay canvas above the base render. The base render stays live
// underneath: any stall, disconnect, or missing token degrades to it
// seamlessly — the lens is optional by construction.
//
// Protocol v1 (provider-agnostic):
//   client → server: binary JPEG (the conditioning frame)
//   client → server: text JSON {type:'prompt', prompt, strength}  (on change)
//   server → client: binary JPEG (the styled frame)
//   server → client: text JSON {type:'status', ...}
// Backpressure: at most MAX_INFLIGHT unacknowledged frames; the newest frame
// always wins (stale frames are dropped, never queued).

// PACING. Do not count "frames in flight": the server keeps only the NEWEST
// frame and silently discards the rest, so a discarded frame is never
// acknowledged and any inflight counter leaks upward until it pins the client
// to one send per response. That throttles throughput to 1/RTT (~4fps over a
// 250ms round trip) while the GPU sits idle at 80ms/frame.
//
// Instead: send on a fixed cadence and let the server drop what it cannot use.
// Its worker then always has the next frame waiting the instant it finishes
// the last, so throughput becomes GPU-bound rather than latency-bound.
// A backlog guard covers a genuinely dead server.
const SEND_FPS = 16;             // comfortably above the GPU rate (~11fps at
                                 // 512²), so the server's newest-frame slot is
                                 // never empty and the GPU never idles
const MAX_BACKLOG = 8;           // frames sent with nothing coming back
// Generous retry window: a cold-started GPU container (serverless scale-from-
// zero) takes 1–2 minutes to accept its first session.
const RETRIES = 20;
const RETRY_MS = 6000;

// Nobody appears in this world unless we put them there. The model will
// happily hallucinate a figure at the end of a corridor — it did, unasked —
// and an author-controlled game cannot have its cast introduced by a sampler.
// Scenes that *want* a presence (battle, rupture) override this explicitly.
export const NO_CHARACTERS = 'person, people, human, man, woman, child, figure, silhouette, face, portrait, eyes, creature, animal, monster, statue, mannequin, doll, crowd, neon, saturated, poster art, cartoon, bright';

// The lens is a feedback instrument, not a filter.
//
// `feedback` blends the previous *hallucinated* frame back into the
// conditioning image, so each frame denoises what the model already dreamed
// rather than the clean geometry alone. Structures then persist, drift, and
// grow across frames — the space stops being Euclidean and starts being a
// memory of itself. `drift` warps that feedback (zoom/rotate) so the
// accumulation crawls instead of merely smearing.
//
// feedback 0 = obedient restyle of the raymarcher. feedback ~0.6 = the
// walls breathe and the corridor eats itself — but the room also stops being
// somewhere you can navigate, so explore keeps it low and the dramatic
// presets spend it. Tunable live via URL params and window.__diffusion.
export function diffusionStart({
  sourceCanvas, hostEl, url, token, fps = 24,
  prompt = 'dark grimy concrete corridor, damp plaster, deserted, dread',
  // Tuned by sweep (see README): the narrow band where the corridor stays
  // legible but its material never settles. Push strength past ~0.6 and the
  // geometry dissolves; push guidance past ~2 and dread turns into neon
  // poster art.
  // Navigability is bought with `strength` and `feedback`, not by compositing
  // the base render back on top. Low strength = the model repaints the walls
  // that are actually there. Low feedback = it does not wander off into its
  // own dream between frames.
  strength = 0.42, passes = 1, feedback = 0.18, drift = 0.5, guidance = 1.2,
  // Temporal smoothing. The base render never holds perfectly still (the
  // reaction-diffusion skin crawls, the glow breathes), so every conditioning
  // frame differs slightly and the model re-dreams it. Persisting some of the
  // previous styled frame integrates that churn instead of showing it.
  // 0 = raw, every frame as returned. Persistence is per-FRAME, so the higher
  // the stream rate the more of it you need for the same settling in seconds.
  // At ~8fps, 0.72 holds the room still without smearing motion.
  smooth = 0.72,
  // `seedMode:'fixed'` pins the noise so a place stays recognisably itself
  // between frames and between visits; the crawl then comes from feedback,
  // not from the room being reinvented. 'walk' is for scenes meant to come apart.
  seedMode = 'fixed', seed = 7,
  negative = NO_CHARACTERS,
  onStatus = () => {},
}) {
  const overlay = document.createElement('canvas');
  overlay.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;opacity:0;transition:opacity 600ms ease;';
  if (getComputedStyle(hostEl).position === 'static') hostEl.style.position = 'relative';
  hostEl.appendChild(overlay);
  const octx = overlay.getContext('2d');

  const stats = { framesOut: 0, framesIn: 0, lastRttMs: 0, state: 'connecting', skips: 0, blobNull: 0, notOpen: 0, msDraw: 0, msEncode: 0, msDecode: 0 };
  let ws = null, sendTimer = null, retriesLeft = RETRIES, stopped = false;
  let lastSentAt = 0;

  // Downscale before encoding: the server diffuses at SIZE² regardless, and
  // toBlob on the full-res WebGL canvas is the fps bottleneck.
  const capture = document.createElement('canvas');
  capture.width = 512; capture.height = 512;   // match the server's SIZE (sd-turbo's native)
  const capCtx = capture.getContext('2d');
  // last styled frame, kept for the feedback loop
  let lastStyled = null;
  let driftPhase = 0;
  let firstFrame = true;
  let moving = false;      // the player took a step recently

  function setState(s) { stats.state = s; onStatus({ ...stats }); }

  function connect() {
    const u = new URL(url);
    if (token) u.searchParams.set('token', token);
    ws = new WebSocket(u.toString());
    ws.binaryType = 'arraybuffer';
    setState('connecting');

    ws.onopen = () => {
      retriesLeft = RETRIES;
      setState('streaming');
      ws.send(JSON.stringify({ type: 'prompt', prompt, negative, strength, passes, guidance, seedMode, seed }));
      sendTimer = setInterval(captureAndSend, Math.round(1000 / SEND_FPS));
      captureAndSend();
    };
    ws.onmessage = async (ev) => {
      if (typeof ev.data === 'string') { try { onStatus({ ...stats, server: JSON.parse(ev.data) }); } catch (_) {} return; }
      stats.framesIn++;
      stats.lastRttMs = performance.now() - lastSentAt;
      try {
        const tDec = performance.now();
        const bmp = await createImageBitmap(new Blob([ev.data], { type: 'image/jpeg' }));
        stats.msDecode = stats.msDecode * 0.8 + (performance.now() - tDec) * 0.2;
        if (overlay.width !== bmp.width || overlay.height !== bmp.height) {
          overlay.width = bmp.width; overlay.height = bmp.height;
        }
        // NOTE: do not composite the base render back over this frame. Once
        // the styled frame has drifted at all, re-imposing engine luminance
        // double-exposes two misaligned images (hard black wedges over walls
        // that moved). Structure is preserved *upstream* instead — by keeping
        // strength and feedback low enough that the model tracks the geometry.
        octx.globalAlpha = firstFrame ? 1 : (1 - smooth);
        octx.drawImage(bmp, 0, 0, overlay.width, overlay.height);
        octx.globalAlpha = 1;
        firstFrame = false;
        if (lastStyled) lastStyled.close();
        lastStyled = bmp;   // feeds the next conditioning frame
        if (overlay.style.opacity !== '1') overlay.style.opacity = '1';
      } catch (_) { /* corrupt frame: keep last */ }
    };
    // onerror and onclose BOTH fire on a failed handshake. Without this guard
    // each failure burns two retries and schedules two reconnects, so the
    // retry budget evaporates in seconds and the lens falls back for good.
    let closed = false;
    const onGone = (ev) => {
      if (closed || stopped) return;
      closed = true;
      clearInterval(sendTimer); sendTimer = null;
      overlay.style.opacity = '0';
      // 1013 = server busy with another session; back off longer, don't spin.
      const busy = ev && ev.code === 1013;
      if (retriesLeft-- > 0) {
        setState(busy ? 'waiting for slot' : 'reconnecting');
        setTimeout(connect, busy ? RETRY_MS * 2 : RETRY_MS);
      } else setState('fallback');
    };
    ws.onclose = onGone;
    ws.onerror = () => onGone(null);
  }

  function captureAndSend() {
    if (!ws || ws.readyState !== WebSocket.OPEN) { stats.skips++; return; }
    // Backlog, not inflight: the server drops frames on purpose, so the only
    // meaningful signal is "we are shouting and nothing is coming back".
    if (stats.framesOut - stats.framesIn > MAX_BACKLOG) { stats.skips++; return; }
    lastSentAt = performance.now();

    const W = capture.width, H = capture.height;
    const t0 = performance.now();
    capCtx.setTransform(1, 0, 0, 1, 0, 0);
    capCtx.globalAlpha = 1;
    capCtx.drawImage(sourceCanvas, 0, 0, W, H);
    stats.msDraw = stats.msDraw * 0.8 + (performance.now() - t0) * 0.2;

    // Feedback: the previous hallucination, slightly warped, laid back over
    // the geometry. The model then denoises its own dream plus a hint of
    // where the walls actually are — which is exactly where the drifting,
    // non-Euclidean, boiling texture comes from.
    if (feedback > 0 && lastStyled) {
      // A stationary player gets a stationary room: warping the feedback while
      // nothing moves manufactures motion the player did not cause.
      const d = moving ? drift : 0;
      driftPhase += moving ? 0.013 : 0;
      const zoom = 1 + 0.010 * d;
      const rot = Math.sin(driftPhase) * 0.004 * d;
      const sway = Math.cos(driftPhase * 0.7) * 3 * d;
      capCtx.globalAlpha = feedback;
      capCtx.translate(W / 2 + sway, H / 2);
      capCtx.rotate(rot);
      capCtx.scale(zoom, zoom);
      capCtx.drawImage(lastStyled, -W / 2, -H / 2, W, H);
      capCtx.setTransform(1, 0, 0, 1, 0, 0);
      capCtx.globalAlpha = 1;
    }

    const tEnc = performance.now();
    capture.toBlob((blob) => {
      stats.msEncode = stats.msEncode * 0.8 + (performance.now() - tEnc) * 0.2;
      if (!blob) { stats.blobNull++; return; }
      if (!ws || ws.readyState !== WebSocket.OPEN) { stats.notOpen++; return; }
      blob.arrayBuffer().then((ab) => {
        if (ws && ws.readyState === WebSocket.OPEN) { ws.send(ab); stats.framesOut++; }
      });
    }, 'image/jpeg', 0.7);
  }

  connect();

  const send = () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'prompt', prompt, negative, strength, passes, guidance, seedMode, seed }));
    }
  };

  return {
    stats,
    // A zone change pins a new seed so each world is a consistent place,
    // instead of a fresh hallucination every time you walk back into it.
    setZone(p, zoneSeed) {
      prompt = p;
      if (zoneSeed != null) seed = zoneSeed >>> 0;
      send();
    },
    setPrompt(p, s = strength) { prompt = p; strength = s; send(); },
    // live tuning: window.__diffusion.tune({feedback: 0.7, guidance: 3, ...})
    tune(opts = {}) {
      if (opts.feedback != null) feedback = Math.max(0, Math.min(0.92, opts.feedback));
      if (opts.drift != null) drift = opts.drift;
      if (opts.strength != null) strength = opts.strength;
      if (opts.passes != null) passes = opts.passes;
      if (opts.guidance != null) guidance = opts.guidance;
      if (opts.smooth != null) smooth = Math.max(0, Math.min(0.9, opts.smooth));
      if (opts.seedMode != null) seedMode = opts.seedMode;
      if (opts.seed != null) seed = opts.seed >>> 0;
      if (opts.prompt != null) prompt = opts.prompt;
      if (opts.negative != null) negative = opts.negative;
      send();
      return { feedback, drift, strength, passes, guidance, smooth, seedMode, prompt, negative };
    },
    resetFeedback() { if (lastStyled) { lastStyled.close(); lastStyled = null; } firstFrame = true; },
    // main.js reports movement; a still player must see a still room.
    setMoving(v) { moving = !!v; },
    stop() {
      stopped = true;
      clearInterval(sendTimer);
      try { ws && ws.close(); } catch (_) {}
      if (lastStyled) lastStyled.close();
      overlay.remove();
      setState('stopped');
    },
  };
}
