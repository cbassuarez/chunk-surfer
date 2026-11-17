// LIGHT AUDIT INSTRUMENTATION. Injected by the capture harness before any game
// script runs; it is never imported by the game and never ships. It observes
// and overrides the WebGL calls the renderer already makes:
//
//   clay      every lit surface's albedo becomes 18% grey (shader text is
//             amended as it is compiled, in this page only)
//   solo      one light group at a time: 'ambient' (ambient + bounce), 'torch',
//             a local light index, or 'none'
//   noLocal   local light count forced to 0, for cost-by-difference
//   noTorch   torch power forced to 0, for cost-by-difference
//   timing    'frame': GPU time of everything one animation frame submits, and
//             wall time to a gl.finish() at the end of that frame
//             'passes': GPU time of the two lit programs (world march, mesh
//             props) per frame, everything else excluded
(() => {
  const A = window.__lightAudit = {
    clay: false, solo: null, noLocal: false, noTorch: false, timing: false, gain: null, noSelf: false, noSky: false,
    patched: [], lightShaders: 0, lastFloat: null, lastBytes: null, gl: null, timerExt: null, seen: {},
    frames: [],
  };
  const P = WebGL2RenderingContext.prototype;
  const names = new WeakMap(), clayLocation = new WeakMap(), selfLocation = new WeakMap(), skyLocation = new WeakMap(), shaderKind = new WeakMap(), programKind = new WeakMap();
  const DECL = 'uniform float uLightAuditClay;uniform float uLightAuditNoSelf;uniform float uLightAuditNoSky;\n';
  const CLAY = 'if(uLightAuditClay>.5)';

  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    const context = getContext.call(this, type, ...rest);
    if (type === 'webgl2' && context && this.classList?.contains('r3d')) {
      A.gl = context;
      A.timerExt = context.getExtension('EXT_disjoint_timer_query_webgl2');
    }
    return context;
  };

  const shaderSource = P.shaderSource;
  P.shaderSource = function (shader, source) {
    let out = source;
    if (this.getShaderParameter(shader, this.SHADER_TYPE) === this.FRAGMENT_SHADER && /uLocalLightColor|uAmbientIntensity/.test(source)) {
      A.lightShaders++;
      const hits = [];
      const swap = (label, find, make) => {
        if (typeof find === 'string' ? out.includes(find) : find.test(out)) { out = out.replace(find, make); hits.push(label); }
      };
      // World march: the one line where surface colour meets incident light.
      swap('march', 'col = albedo * incident', `${CLAY}albedo=vec3(.18);\n      col = albedo * incident`);
      // The two terms that brighten a surface with no light source: the
      // reaction-diffusion rim pattern and the chunk glows. noSelf removes them.
      // The fixed hemispherical sky term on any surface in a sky-flagged cell.
      swap('march-sky', 'col += albedo * vec3(0.092, 0.110, 0.150) * facingSky;', 'col += (uLightAuditNoSky>.5?0.0:1.0) * albedo * vec3(0.092, 0.110, 0.150) * facingSky;');
      swap('march-self', /\+ rim \* tint \* \(0\.22 \+ uAudio \* 0\.45\) \* emis\s*\n\s*\+ glow \* emis/, match => `+ (uLightAuditNoSelf>.5?0.0:1.0)*(${match.slice(1).replace('+ glow', '+glow')})`);
      // Mesh props.
      swap('props', /vec3 base=uBase\*texel\.rgb\*\(1\.0-driveWet\*\.12\);/, match => `${match}${CLAY}base=vec3(.18);`);
      if (hits.length) {
        out = out.replace(/precision\s+highp\s+float;\s*\n/, match => match + DECL);
        A.patched.push(...hits);
        shaderKind.set(shader, hits[0]);
      }
    }
    return shaderSource.call(this, shader, out);
  };
  const attachShader = P.attachShader;
  P.attachShader = function (program, shader) {
    if (shaderKind.has(shader)) programKind.set(program, shaderKind.get(shader));
    return attachShader.call(this, program, shader);
  };

  const getUniformLocation = P.getUniformLocation;
  P.getUniformLocation = function (program, name) {
    const location = getUniformLocation.call(this, program, name);
    if (location) names.set(location, name);
    return location;
  };

  // ── GPU timing ────────────────────────────────────────────────────────────
  // One TIME_ELAPSED query may be open at a time. Each sample carries the frame
  // it belongs to and is summed per frame once the driver reports it.
  let open = null, frame = 0, tickTime = null, tickStart = 0, waiting = [];
  const begin = label => {
    const gl = A.gl, ext = A.timerExt; if (!gl || !ext || open) return;
    const query = gl.createQuery(); gl.beginQuery(ext.TIME_ELAPSED_EXT, query); open = {query, label, frame};
  };
  const end = () => {
    if (!open) return; const gl = A.gl, ext = A.timerExt;
    gl.endQuery(ext.TIME_ELAPSED_EXT); waiting.push(open); open = null;
  };
  const collect = () => {
    const gl = A.gl, ext = A.timerExt; if (!gl || !ext) return;
    const disjoint = gl.getParameter(ext.GPU_DISJOINT_EXT);
    waiting = waiting.filter(item => {
      if (!gl.getQueryParameter(item.query, gl.QUERY_RESULT_AVAILABLE)) return true;
      const ms = gl.getQueryParameter(item.query, gl.QUERY_RESULT) / 1e6; gl.deleteQuery(item.query);
      const record = A.frames.find(f => f.frame === item.frame);
      if (record && !disjoint) record.gpu[item.label] = (record.gpu[item.label] || 0) + ms;
      if (record && disjoint) record.disjoint = true;
      return false;
    });
  };

  const useProgram = P.useProgram;
  P.useProgram = function (program) {
    if (A.timing === 'passes') {
      const kind = program ? programKind.get(program) : null;
      if (open && open.label !== kind) end();
      if (kind && !open) begin(kind);
    }
    useProgram.call(this, program);
    if (!program) return;
    if (!clayLocation.has(program)) clayLocation.set(program, getUniformLocation.call(this, program, 'uLightAuditClay'));
    const location = clayLocation.get(program);
    if (location) uniform1f.call(this, location, A.clay ? 1 : 0);
    if (!selfLocation.has(program)) selfLocation.set(program, getUniformLocation.call(this, program, 'uLightAuditNoSelf'));
    const self = selfLocation.get(program);
    if (self) uniform1f.call(this, self, A.noSelf ? 1 : 0);
    if (!skyLocation.has(program)) skyLocation.set(program, getUniformLocation.call(this, program, 'uLightAuditNoSky'));
    const sky = skyLocation.get(program);
    if (sky) uniform1f.call(this, sky, A.noSky ? 1 : 0);
  };

  const soloIs = value => A.solo === value;
  const uniform1f = P.uniform1f;
  P.uniform1f = function (location, value) {
    const name = location && names.get(location);
    if (name === 'uLight') {
      A.seen.torch = value;
      if (A.noTorch || (A.solo != null && !soloIs('torch'))) value = 0;
    } else if (name === 'uAmbientIntensity' || name === 'uBounceIntensity') {
      A.seen[name] = value;
      if (A.solo != null && !soloIs('ambient')) value = 0;
      else if (A.gain?.ambient != null) value *= A.gain.ambient;
    }
    return uniform1f.call(this, location, value);
  };

  const uniform4fv = P.uniform4fv;
  P.uniform4fv = function (location, value, ...rest) {
    const name = location && names.get(location);
    if (name === 'uLocalLightColor[0]' && (A.solo != null || A.gain?.local != null)) {
      const copy = Float32Array.from(value);
      for (let i = 0; i * 4 + 3 < copy.length; i++) {
        if (A.solo != null && !soloIs(i)) copy[i * 4 + 3] = 0;
        else if (A.gain?.local != null) copy[i * 4 + 3] *= A.gain.local;
      }
      value = copy;
    }
    return uniform4fv.call(this, location, value, ...rest);
  };

  // The torch's colour carries its strength; its power uniform is also a gate.
  const uniform3fv = P.uniform3fv;
  P.uniform3fv = function (location, value, ...rest) {
    const name = location && names.get(location);
    if (name === 'uTorchColor' && A.gain?.torch != null) value = Array.from(value, v => v * A.gain.torch);
    return uniform3fv.call(this, location, value, ...rest);
  };

  const uniform1i = P.uniform1i;
  P.uniform1i = function (location, value) {
    const name = location && names.get(location);
    if (name === 'uLocalLightCount') { A.seen.localLightCount = value; if (A.noLocal) value = 0; }
    return uniform1i.call(this, location, value);
  };

  // r3dCaptureStageCanvas reads the scene (float) or props (bytes) and then
  // converts for display. Keep the raw read it made.
  const readPixels = P.readPixels;
  P.readPixels = function (x, y, width, height, format, type, pixels, ...rest) {
    const result = readPixels.call(this, x, y, width, height, format, type, pixels, ...rest);
    if (type === this.FLOAT && pixels instanceof Float32Array) A.lastFloat = {width, height, data: pixels};
    else if (type === this.UNSIGNED_BYTE && pixels instanceof Uint8Array && width * height > 4096) A.lastBytes = {width, height, data: pixels};
    return result;
  };

  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = callback => raf(time => {
    if (!A.timing || !A.gl) return callback(time);
    if (time !== tickTime) {
      // First callback of a new animation frame.
      tickTime = time; frame++; tickStart = performance.now();
      end(); // a late timeout must never let one query span two frames
      collect();
      const record = {frame, mode: A.timing, gpu: {}, wallMs: null};
      A.frames.push(record); if (A.frames.length > 400) A.frames.shift();
      if (A.timing === 'frame') begin('frame');
      setTimeout(() => {
        // After every callback of this frame has run.
        end();
        if (A.timing === 'frame') { A.gl.finish(); record.wallMs = performance.now() - tickStart; }
      }, 0);
    }
    return callback(time);
  });
  A.timingSummary = mode => {
    collect();
    const done = A.frames.filter(f => f.mode === mode && !f.disjoint && Object.keys(f.gpu).length);
    const median = list => { const s = list.filter(Number.isFinite).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
    const p90 = list => { const s = list.filter(Number.isFinite).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length * .9)] : null; };
    const labels = [...new Set(done.flatMap(f => Object.keys(f.gpu)))];
    return {frames: done.length, gpu: Object.fromEntries(labels.map(label => [label, {median: median(done.map(f => f.gpu[label] ?? 0)), p90: p90(done.map(f => f.gpu[label] ?? 0))}])),
      wallMs: mode === 'frame' ? {median: median(done.map(f => f.wallMs)), p90: p90(done.map(f => f.wallMs))} : null};
  };

  // The capture machine cannot hold the game's decoded audio beside a second
  // browser (the drive alone passes 7 GB). Light does not depend on it, so with
  // ?lightauditmute every decode returns half a second of silence.
  if (new URLSearchParams(location.search).has('lightauditmute')) {
    const silent = context => context.createBuffer(2, Math.round(context.sampleRate / 2), context.sampleRate);
    for (const type of [window.BaseAudioContext, window.AudioContext, window.OfflineAudioContext]) {
      if (!type?.prototype?.decodeAudioData) continue;
      type.prototype.decodeAudioData = function (data, resolve) {
        const buffer = silent(this); A.mutedDecodes = (A.mutedDecodes || 0) + 1;
        if (typeof resolve === 'function') queueMicrotask(() => resolve(buffer));
        return Promise.resolve(buffer);
      };
    }
  }

  // A stage at reduced size: [r,g,b] linear per block, rows top to bottom.
  // 'scene' is the world march's float target (props composited in); 'props'
  // is the mesh pass's own linear RGBA8 target, which is what Source's void
  // composite shows.
  A.sceneGrid = async (columns = 320, stage = 'scene') => {
    const R3 = await import('/src/render/r3d.js');
    A.lastFloat = null; A.lastBytes = null;
    if (!R3.r3dCaptureStageCanvas(stage)) return null;
    const source = stage === 'scene' ? A.lastFloat : A.lastBytes;
    if (!source) return null;
    const {width, height, data} = source, scale = stage === 'scene' ? 1 : 1 / 255;
    const rows = Math.max(1, Math.round(columns * height / width));
    const out = new Float32Array(columns * rows * 3);
    for (let gy = 0; gy < rows; gy++) for (let gx = 0; gx < columns; gx++) {
      const x0 = Math.floor(gx * width / columns), x1 = Math.max(x0 + 1, Math.floor((gx + 1) * width / columns));
      const y0 = Math.floor(gy * height / rows), y1 = Math.max(y0 + 1, Math.floor((gy + 1) * height / rows));
      let r = 0, g = 0, b = 0, n = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const i = ((height - 1 - y) * width + x) * 4;
        r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
      }
      const o = (gy * columns + gx) * 3; out[o] = r / n * scale; out[o + 1] = g / n * scale; out[o + 2] = b / n * scale;
    }
    let binary = ''; const bytes = new Uint8Array(out.buffer);
    for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
    return {columns, rows, sceneWidth: width, sceneHeight: height, stage, base64: btoa(binary)};
  };
})();
