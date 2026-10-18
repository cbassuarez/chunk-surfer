// Developer evidence only. Imported into the already running real game.
// No game modules, geometry, renderer, clocks, random seeds or inputs are replaced.
export async function installSourceExperienceCapture(options = {}) {
  if (window.__sourceExperienceCapture?.active) throw new Error('Source capture already active');
  const probe = window.__probe;
  if (!probe?.apparitionApplauseCaptureStart || !probe?.apparitionApplauseCaptureStop) throw new Error('Live post-limiter capture probe unavailable');
  const map = document.querySelector('#map'), world = map?.querySelector('canvas.r3d');
  if (!world || !world.captureStream || typeof MediaRecorder === 'undefined') throw new Error('Production canvas capture unavailable');
  // The existing developer capture owns the authoritative main.js audio closure.
  // Observe only its synchronous new tap, then immediately restore connect and
  // dispose that temporary capture. Never import a second, cold audio singleton.
  let audioOutput = null, audioContext = null;
  const nativeConnect = AudioNode.prototype.connect;
  AudioNode.prototype.connect = function(destination, ...args) {
    if (destination?.stream instanceof MediaStream && destination.context === this.context) {
      audioOutput = this; audioContext = this.context;
    }
    return nativeConnect.call(this, destination, ...args);
  };
  let discoveryStarted = false;
  try { probe.apparitionApplauseCaptureStart(); discoveryStarted = true; }
  finally { AudioNode.prototype.connect = nativeConnect; }
  if (discoveryStarted) await probe.apparitionApplauseCaptureStop();
  if (!audioOutput || !audioContext) throw new Error('Could not obtain the actual post-limiter output');
  if (audioContext.state !== 'running') throw new Error(`Program audio context is ${audioContext.state}; unlock with ordinary interaction before recording`);
  const fps = options.fps || 30, sampleHz = options.sampleHz || 10;
  const capture = document.createElement('canvas');
  capture.width = world.width; capture.height = world.height;
  const context = capture.getContext('2d', { alpha: false });
  const tap = audioContext.createMediaStreamDestination();
  audioOutput.connect(tap);
  const analyser = audioContext.createAnalyser(); analyser.fftSize = 1024;
  audioOutput.connect(analyser);
  const audioSamples = new Float32Array(analyser.fftSize);
  const video = capture.captureStream(fps);
  const stream = new MediaStream([...video.getVideoTracks(), ...tap.stream.getAudioTracks()]);
  const mimeType = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find(value => MediaRecorder.isTypeSupported(value));
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: options.videoBitsPerSecond || 2_000_000, audioBitsPerSecond: 128_000 });
  const startedAtMs = performance.now(), startedAudioTime = audioContext.currentTime;
  const events = [], samples = [], transitions = [], layers = [], limitations = new Set();
  const streamChunks = options.streamChunks !== false && typeof window.__sourceExperienceWriteChunk === 'function';
  const chunks = [], cleanup = [], originalDebug = new Map();
  let chunkWrites = Promise.resolve(), recordedBytes = 0, chunkCount = 0, chunkError = null;
  let running = true, frameId = null, sampleId = null, lastSignature = '', framesDrawn = 0, drawingErrors = [];
  const stamp = () => ({ tMs: performance.now() - startedAtMs, audioTime: audioContext.currentTime });
  function persistedCheckpoint() {
    try {
      const save = JSON.parse(localStorage.getItem('chunk-surfer:save:v4') || 'null');
      return save ? { area: save.area, px: save.px, py: save.py, view: save.view,
        checkpointRevision: save.checkpointRevision, cameraRevision: save.cameraRevision,
        checkpointId: save.chunkSurf?.checkpointId, checkpoint: save.chunkSurf?.checkpoint,
        phase: save.chunkSurf?.phase, firstLiftCompleted: save.chunkSurf?.firstLiftCompleted } : null;
    } catch (error) { return { error: String(error) }; }
  }
  function event(type, details = {}) { const entry = { ...stamp(), type, ...details }; events.push(entry); return entry; }
  const forbidden = ['sourcePreset','sourceWarp','sourceStep','preTapePreset','horizonPreset','bellsPreset','sourceChapelReady','sourceResolve','sourceComplete','lookAtWorld','read','hush','clearScenes','testRun','tutSkip','flag'];
  for (const name of forbidden) if (typeof probe[name] === 'function') {
    const original = probe[name]; originalDebug.set(name, original);
    probe[name] = function(...args) { event('debug-call', { name, args }); return original.apply(this, args); };
  }
  for (const type of ['keydown','keyup','pointerdown','pointerup','pointermove','wheel']) {
    const listener = input => {
      if (type === 'pointermove' && !input.movementX && !input.movementY) return;
      event('input', { event: type, key: input.key, code: input.code, repeat: input.repeat,
        button: input.button, clientX: input.clientX, clientY: input.clientY,
        movementX: input.movementX, movementY: input.movementY, deltaY: input.deltaY, trusted: input.isTrusted });
    };
    window.addEventListener(type, listener, { capture: true, passive: true });
    cleanup.push(() => window.removeEventListener(type, listener, { capture: true }));
  }
  for (const type of ['focus','blur','visibilitychange','pointerlockchange']) {
    const target = type === 'focus' || type === 'blur' ? window : document;
    const listener = () => event(type, { focused: document.hasFocus(), hidden: document.hidden, pointerLocked: !!document.pointerLockElement });
    target.addEventListener(type, listener); cleanup.push(() => target.removeEventListener(type, listener));
  }
  function visible(element) {
    for (let node = element; node && node instanceof Element; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    }
    const rect = element.getBoundingClientRect(); return rect.width > 0 && rect.height > 0;
  }
  function draw() {
    if (!running) return;
    try {
      const rect = map.getBoundingClientRect();
      context.globalAlpha = 1; context.fillStyle = '#000'; context.fillRect(0, 0, capture.width, capture.height);
      const canvases = [...map.querySelectorAll('canvas')].map((canvas, order) => ({ canvas, order, style: getComputedStyle(canvas) }))
        .filter(entry => visible(entry.canvas)).sort((a, b) => (parseInt(a.style.zIndex) || 0) - (parseInt(b.style.zIndex) || 0) || a.order - b.order);
      for (const { canvas, style } of canvases) {
        const bounds = canvas.getBoundingClientRect();
        context.globalAlpha = Math.max(0, Math.min(1, Number(style.opacity)));
        context.imageSmoothingEnabled = false;
        context.drawImage(canvas, (bounds.left - rect.left) / rect.width * capture.width, (bounds.top - rect.top) / rect.height * capture.height,
          bounds.width / rect.width * capture.width, bounds.height / rect.height * capture.height);
        if (style.filter !== 'none') limitations.add('Visible canvas has a CSS filter not reproduced by canvas composition');
        if (style.mixBlendMode !== 'normal') limitations.add('Visible canvas has a CSS blend mode not reproduced by canvas composition');
      }
      framesDrawn++;
      if (!layers.length) for (const { canvas, style } of canvases) layers.push({ className: canvas.className, id: canvas.id, width: canvas.width, height: canvas.height, zIndex: style.zIndex, opacity: style.opacity });
    } catch (error) { drawingErrors.push(String(error)); }
    frameId = requestAnimationFrame(draw);
  }
  function sample() {
    if (!running) return;
    const source = probe.chunkSurf?.(), scene = window.__scenes?.top?.(), view = scene?.view?.();
    analyser.getFloatTimeDomainData(audioSamples);
    const rms = Math.sqrt(audioSamples.reduce((sum, value) => sum + value * value, 0) / audioSamples.length);
    const summary = { ...stamp(), position: probe.pos?.(), look: probe.lookAngles?.(), keys: probe.why?.().keysDown || [], inventoryKeys: probe.keys?.(),
      phase: source?.phase, objective: source?.objective, focus: source?.focus,
      checkpoint: source?.checkpoint, checkpointId: source?.checkpointId, savedCheckpoint: persistedCheckpoint(), finale: source?.finale,
      firstLiftCompleted: source?.firstLiftCompleted, landscapeOrigin: source?.landscapeOrigin,
      scene: scene?.id || null, conversation: probe.convo?.(), speech: probe.speech?.(),
      torch: !!probe.rec?.().light, audioState: audioContext.state, outputRms: rms,
      settings: probe.settings?.(), pixelMesh: window.__chunkSurferPixelMesh?.status?.(),
      focused: document.hasFocus(), hidden: document.hidden, pointerLocked: !!document.pointerLockElement };
    samples.push(summary);
    const signature = JSON.stringify([summary.phase, summary.objective?.id, summary.focus?.id, summary.checkpointId, summary.finale, summary.scene, view?.nodeId]);
    if (signature !== lastSignature) { transitions.push({ ...stamp(), source, scene: scene?.id || null, view }); lastSignature = signature; }
    for (const node of map.querySelectorAll('*:not(canvas)')) {
      if (visible(node) && [...node.childNodes].some(child => child.nodeType === Node.TEXT_NODE && child.textContent.trim())) {
        limitations.add('Visible HTML text exists inside #map; it is excluded from the canvas-stack movie');
        break;
      }
    }
    if ([...document.querySelectorAll('.window-choreography-sim,.window-choreography-sim-pane,iframe')].some(visible)) {
      limitations.add('A visible window simulation or iframe exists outside the captured canvas stack; consult matched viewport PNG witnesses');
    }
  }
  recorder.ondataavailable = entry => {
    if (!entry.data.size) return;
    recordedBytes += entry.data.size; chunkCount++;
    if (!streamChunks) { chunks.push(entry.data); return; }
    const blob = entry.data;
    chunkWrites = chunkWrites.then(async () => {
      const buffer = new Uint8Array(await blob.arrayBuffer());
      let binary = ''; for (let i = 0; i < buffer.length; i += 0x8000) binary += String.fromCharCode(...buffer.subarray(i, i + 0x8000));
      await window.__sourceExperienceWriteChunk(btoa(binary));
    }).catch(error => { chunkError = String(error); event('chunk-write-error', { error: chunkError }); });
  };
  recorder.start(1000); draw(); sample(); sampleId = setInterval(sample, 1000 / sampleHz);
  event('record-start', { initialFixture: options.initialFixture || null });
  const api = {
    active: true, mark: label => event('mark', { label }),
    status: () => ({ active: running, ...stamp(), framesDrawn, samples: samples.length, events: events.length,
      debugCalls: events.filter(entry => entry.type === 'debug-call'), audioState: audioContext.state,
      dimensions: [capture.width, capture.height], layers, limitations: [...limitations], drawingErrors,
      streamingChunks: streamChunks, recordedBytes, chunkCount, chunkError }),
    witness: () => capture.toDataURL('image/png'),
    async stop() {
      if (!running) return null;
      sample(); event('record-stop'); running = false; api.active = false;
      cancelAnimationFrame(frameId); clearInterval(sampleId); cleanup.forEach(fn => fn());
      for (const [name, original] of originalDebug) probe[name] = original;
      const ended = new Promise(resolve => recorder.addEventListener('stop', resolve, { once: true }));
      recorder.stop(); await ended;
      await chunkWrites;
      audioOutput.disconnect(tap); audioOutput.disconnect(analyser);
      stream.getTracks().forEach(track => track.stop());
      let videoBase64 = null;
      if (!streamChunks) {
        const blob = new Blob(chunks, { type: recorder.mimeType.split(';')[0] });
        const buffer = new Uint8Array(await blob.arrayBuffer());
        let binary = ''; for (let i = 0; i < buffer.length; i += 0x8000) binary += String.fromCharCode(...buffer.subarray(i, i + 0x8000));
        videoBase64 = btoa(binary);
      }
      return { videoBase64, streamed: streamChunks, report: { kind: 'source-experience-continuous-canvas-capture',
        startedAtMs, startedAudioTime, endedAtMs: performance.now(), endedAudioTime: audioContext.currentTime,
        mime: recorder.mimeType, bytes: recordedBytes, streamingChunks: streamChunks, chunkCount, chunkError, fps, videoBitsPerSecond: recorder.videoBitsPerSecond,
        width: capture.width, height: capture.height, devicePixelRatio, framesDrawn, layers,
        initialFixture: options.initialFixture || null, events, samples, transitions,
        continuousAfterInitialFixture: !events.some(entry => entry.type === 'debug-call'),
        limitations: [...limitations, 'Browser canvas-stack recording excludes native OS windows, browser chrome, non-canvas DOM overlays and physical speaker/headphone response'],
        drawingErrors, audio: { tap: 'actual main.js outGain, after glue compressor, limiter and global volume',
          sampleRate: audioContext.sampleRate, channels: tap.channelCount, microphoneRequested: false } } };
    },
  };
  window.__sourceExperienceCapture = api;
  return api.status();
}
