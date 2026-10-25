// Explicit developer review controls. Capture only this game's production
// raster and existing output bus; never request desktop, microphone or camera.
export function installTowerWarningReview({ stage, start, getState, getAudio, getTrace } = {}) {
  const panel = document.createElement('aside'); panel.id = 'tower-warning-review-tools';
  panel.style.cssText = 'position:fixed;right:8px;top:8px;z-index:100000;background:#111e;color:#eee;padding:7px;font:12px monospace;border:1px solid #888;max-width:295px';
  const status = document.createElement('div'), telemetry = document.createElement('pre');
  telemetry.style.cssText = 'white-space:pre-wrap;color:#b8cdb7;margin:5px 0 0;max-height:190px;overflow:auto';
  let session = null, closed = false;
  const make = (label, action) => {
    const button = document.createElement('button'); button.textContent = label; button.style.cssText = 'padding:6px;margin:2px';
    button.onclick = async event => {
      event.stopPropagation();
      try { await action(); } catch (error) { status.textContent = String(error?.message || error); }
      document.getElementById('map')?.focus();
    };
    panel.append(button);
  };
  const save = async (name, body, type) => {
    const response = await fetch('/__tower-warning-review/' + name, { method: 'POST', headers: { 'Content-Type': type }, body });
    if (!response.ok) throw Error('Review save failed: ' + response.status);
    return response.json();
  };
  const canvasNow = () => {
    const canvas = document.querySelector('canvas.r3d');
    if (!canvas?.width || !canvas?.height) throw Error('The production game raster is not ready.');
    return canvas;
  };
  function paint(canvas, target, width, height) {
    const scale = Math.min(width / canvas.width, height / canvas.height), w = canvas.width * scale, h = canvas.height * scale;
    const x = (width - w) / 2, y = (height - h) / 2;
    target.fillStyle = '#000'; target.fillRect(0, 0, width, height); target.imageSmoothingEnabled = false;
    target.drawImage(canvas, x, y, w, h);
    // The game's real transparent UI layer includes fades and scene overlays.
    // The developer panel is DOM, outside the captured production raster.
    for (const overlay of canvas.parentElement.querySelectorAll('canvas')) {
      const style = getComputedStyle(overlay);
      if (overlay !== canvas && style.zIndex === '8' && style.display !== 'none' && style.visibility !== 'hidden') {
        target.drawImage(overlay, x, y, w, h);
      }
    }
  }
  function cleanup(record) {
    cancelAnimationFrame(record.raf);
    try { record.output.disconnect(record.sink); } catch {}
    try { record.output.disconnect(record.meter); } catch {}
    try { record.meter?.disconnect(); } catch {}
    for (const track of record.stream?.getTracks() || []) track.stop();
  }
  const input = event => {
    if (session?.recorder?.state === 'recording') session.inputs.push({ atMs: performance.now() - session.started, type: event.type, key: event.key, code: event.code, repeat: !!event.repeat });
  };
  addEventListener('keydown', input, true); addEventListener('keyup', input, true);

  for (const [id, label] of [['lyric', 'Stage old Lyric'], ['guard', 'Stage overworld guard'], ['source', 'Stage Source guard']]) {
    make(label, async () => {
      if (session) throw Error('Stop and save the current recording before staging.');
      await stage?.(id); telemetry.textContent = JSON.stringify(getState?.(), null, 1);
      status.textContent = 'Staged ' + id + '. Ordinary movement and look remain available.';
    });
  }
  make('Begin warning', async () => { const result = await start?.(); status.textContent = result === false ? 'Warning interaction unavailable at this position.' : 'Warning requested through the ordinary interaction.'; });
  make('Record + audio', async () => {
    if (session || closed) return;
    const canvas = canvasNow(), audio = getAudio?.();
    if (!canvas.captureStream || !audio?.ctx || !audio?.output || typeof MediaRecorder === 'undefined') throw Error('Start game audio before recording.');
    // This explicit review button is the only user gesture allowed to resume
    // the shared context here. Staging and asynchronous rendering never do so.
    await audio.ctx.resume();
    if (closed || session) return;
    const capture = document.createElement('canvas'); capture.width = 640; capture.height = 360;
    const context = capture.getContext('2d'); paint(canvas, context, capture.width, capture.height);
    const record = session = { stream: null, sink: null, output: audio.output, meter: null, raf: 0, chunks: [], inputs: [], started: performance.now(), traceStart: getTrace?.()?.length || 0, peak: 0, squares: 0, count: 0, lastTelemetry: 0 };
    try {
      record.stream = capture.captureStream(12); record.sink = audio.ctx.createMediaStreamDestination(); record.output.connect(record.sink);
      for (const track of record.sink.stream.getAudioTracks()) record.stream.addTrack(track);
      record.meter = audio.ctx.createAnalyser(); record.meter.fftSize = 2048; record.output.connect(record.meter);
      const samples = new Float32Array(record.meter.fftSize);
      const mimeType = ['video/webm;codecs=vp8,opus', 'video/webm'].find(type => MediaRecorder.isTypeSupported(type));
      if (!mimeType) throw Error('This browser cannot record the local WebM review.');
      record.recorder = new MediaRecorder(record.stream, { mimeType, videoBitsPerSecond: 600000, audioBitsPerSecond: 128000 });
      record.recorder.ondataavailable = event => { if (event.data.size) record.chunks.push(event.data); };
      record.recorder.onstop = async () => {
        const durationSeconds = (performance.now() - record.started) / 1000;
        cleanup(record);
        const id = 'warning-route-' + new Date().toISOString().replace(/[:.]/g, '-');
        try {
          await save(id + '.json', JSON.stringify({ durationSeconds, videoSource: 'Production canvas.r3d plus real UI canvas overlay, nearest-neighbour fit with letterboxing', videoWidth: 640, videoHeight: 360, videoFrameRate: 12,
            audioSource: 'Actual game output bus supplied by host; no replacement soundtrack', audioTracks: record.stream.getAudioTracks().length,
            peak: record.peak, rms: Math.sqrt(record.squares / Math.max(1, record.count)), finalState: getState?.(), inputs: record.inputs, trace: (getTrace?.() || []).slice(record.traceStart) }, null, 2), 'application/json');
          await save(id + '.webm', new Blob(record.chunks, { type: mimeType }), mimeType);
          if (!closed) status.textContent = 'Saved ' + id + ' (' + durationSeconds.toFixed(1) + 's).';
        } catch (error) { if (!closed) status.textContent = String(error?.message || error); }
        finally { record.chunks.length = 0; if (session === record) session = null; }
      };
      const sample = () => {
        if (session !== record || record.recorder.state !== 'recording') return;
        paint(canvas, context, capture.width, capture.height); record.meter.getFloatTimeDomainData(samples);
        for (const value of samples) { record.peak = Math.max(record.peak, Math.abs(value)); record.squares += value * value; record.count++; }
        if (performance.now() - record.lastTelemetry > 500) { record.lastTelemetry = performance.now(); telemetry.textContent = JSON.stringify(getState?.(), null, 1); }
        record.raf = requestAnimationFrame(sample);
      };
      record.recorder.start(1000); sample(); status.textContent = 'Recording production raster + actual mixed audio. Stop to save locally.';
    } catch (error) { cleanup(record); if (session === record) session = null; throw error; }
  });
  make('Stop + save', () => { if (session?.recorder?.state === 'recording') { status.textContent = 'Saving…'; session.recorder.stop(); } });
  make('Save frame + state', async () => {
    const canvas = canvasNow(), state = getState?.(), copy = document.createElement('canvas'); copy.width = canvas.width; copy.height = canvas.height;
    paint(canvas, copy.getContext('2d'), copy.width, copy.height);
    const id = 'warning-frame-' + Date.now();
    await save(id + '.png', await new Promise(resolve => copy.toBlob(resolve, 'image/png')), 'image/png');
    await save(id + '.json', JSON.stringify(state, null, 2), 'application/json'); status.textContent = 'Saved ' + id;
  });
  panel.append(status, telemetry); document.body.append(panel); status.textContent = 'Developer review only. Absent from ordinary play.';
  const dispose = () => {
    if (closed) return; closed = true;
    if (session?.recorder?.state === 'recording') session.recorder.stop();
    if (session) cleanup(session);
    panel.remove(); removeEventListener('keydown', input, true); removeEventListener('keyup', input, true); removeEventListener('pagehide', dispose);
  };
  addEventListener('pagehide', dispose, { once: true });
  return dispose;
}
