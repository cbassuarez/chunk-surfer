// THE HORIZON PASS — the tape, standing up.
//
// A splat cloud where depth is time. Every slice is one frame of the recording
// hung in a plane, two metres apart, and walking forward is the playhead. The
// frames behind you do not go anywhere, which is the entire point: datamosh
// survives by keeping the last picture it had, and out here that is architecture
// you can turn around and look at.
//
// SEPARATE FROM EVERYTHING. This does not go through MARCH_FRAG — that pass has
// all sixteen fragment samplers spoken for (see r3d.js) and nothing can be added
// to it. It does not go through the pixel-mesh either: the horizon is the one
// place in the game that is in colour, and it follows the precedent
// TEXT_SPACE_FRAG set, which renders and returns before the VFD stack ever runs.
//
// THE BUFFER IS UPLOADED ONCE AND NEVER TOUCHED AGAIN. The bake sorts every
// splat by slice, so a slice is a contiguous run of records: drawing one is an
// attribute byte-offset and an instance count. No per-frame upload, no per-frame
// allocation, nothing to garbage collect while somebody is walking.
//
// ORDERING. Splats are translucent, so they have to be drawn back to front, and
// "back" is simply furthest from the body — in every direction at once, which
// matters because looking ACROSS the corridor puts both ends of the tape on
// screen together. Rather than sort 115,000 records every frame, the pass walks
// the visible slices outermost-first and issues one small instanced draw per
// slice. Forty draws of a few hundred instances is nothing, and it buys exact
// ordering plus a per-slice fade uniform that the single-draw version could
// not have.

const VERT = `#version 300 es
precision highp float;
layout(location=0) in vec2 aQuad;      // unit quad, -0.5..0.5
layout(location=1) in vec3 aCenter;    // fixed point, /uPosScale
layout(location=2) in vec2 aSize;      // fixed point, /uSizeScale
layout(location=3) in vec4 aColor;     // normalised
layout(location=4) in vec2 aTrim;      // x: seed, y: kind
uniform mat4 uView, uProj;
uniform float uPosScale, uSizeScale;
uniform float uSliceFade;   // per-slice opacity, distance + collapse
uniform float uBoil;        // sub-pixel unrest, so a still frame is not dead
out vec2 vQuad; out vec4 vColor; out float vKind; out float vSeed;

void main(){
  vec3 center = aCenter / uPosScale;
  vec2 size = aSize / uSizeScale;
  float kind = aTrim.y;
  // Macroblock damage gets a small, seeded wander. The recording is a single
  // still per slice and a perfectly rigid one reads as a photograph on a wall
  // rather than as a signal that is still arriving.
  // The amplitude used to be 0.06m on a splat 1.8m across — a 3% displacement,
  // which is to say invisible. The damage should visibly crawl.
  float phase = aTrim.x * 0.0246 + uBoil;
  if (kind > 1.5) {
    center.xy += vec2(sin(phase), cos(phase * 1.37)) * 0.42;
  } else if (kind > 0.5) {
    // A far smaller unrest on the edges too, so no part of the picture is
    // perfectly rigid. A still recording reads as a photograph on a wall.
    center.xy += vec2(sin(phase * 0.61), cos(phase * 0.83)) * 0.05;
  }
  // Camera-space expansion: the splat faces the body, always.
  vec4 viewPos = uView * vec4(center, 1.0);
  viewPos.xy += aQuad * size;
  vQuad = aQuad;
  vColor = vec4(aColor.rgb, aColor.a * uSliceFade);
  vKind = kind;
  vSeed = aTrim.x;
  gl_Position = uProj * viewPos;
}`;

// TWO OUTPUTS, NOT ONE.
//
// The horizon draws into the renderer's scene framebuffer, and that framebuffer
// is MRT: colour on attachment 0 and the engraving/mark target on attachment 1
// (see makeFbo(sceneTex, [markTex]) in r3d.js). WebGL2 rejects a draw whose
// fragment shader has no output for an active draw buffer — so with a single
// output every one of the splat draws failed with
//
//   GL_INVALID_OPERATION: glDrawArraysInstanced:
//     Active draw buffers with missing fragment shader outputs
//
// and the tape never appeared at all. What the horizon looked like was the void
// clear underneath it, which is close enough to "black" to be mistaken for one.
//
// There is no engraving out here — nothing past the perimeter is made of the
// building, so nothing downstream should recover a surface from it — so the
// mark target is written zero rather than left undeclared.
const FRAG = `#version 300 es
precision highp float;
in vec2 vQuad; in vec4 vColor; in float vKind; in float vSeed;
layout(location=0) out vec4 o;
layout(location=1) out vec4 oMark;

// Cheap value noise. The tape is a 32x18 image per slice, so there is no detail
// in the source below four metres; this invents structure at the scale the eye
// expects from a recording rather than leaving a smooth four-metre ellipse.
float hash21(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
float vnoise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1,0)), f.x),
             mix(hash21(i + vec2(0,1)), hash21(i + vec2(1,1)), f.x), f.y);
}

void main(){
  // THE FALLOFF IS WHAT SEPARATES A SPLAT FROM A QUAD — AND WHAT WAS DISSOLVING
  // THE WALLS.
  //
  // The comment here used to claim flat fields "stay nearly square". They did
  // not. With soft = 0.55 a flat splat kept 58% of its alpha at the centre and
  // 34% at the edge midpoint, and its baked alpha is only 150/255 to begin with
  // — so the colour fields, which ARE the architecture of this corridor, never
  // reached opacity at any pixel of any splat. The picture could only be built
  // by stacking translucent blobs, which is exactly the muddy average everyone
  // saw. The damage still falls off hard, because grain suspended in air is
  // what it is meant to be.
  float d = dot(vQuad, vQuad) * 4.0;
  float a;
  if (vKind > 1.5) {
    a = exp(-d * 3.4) * vColor.a;                    // mosh: hard, round, grain
  } else if (vKind > 0.5) {
    a = exp(-d * 1.15) * vColor.a;                   // edges: soft but present
  } else {
    // Flat fields: a plateau with a rolled edge, and pushed to full opacity.
    // They are walls. Walls are opaque.
    a = (1.0 - smoothstep(0.55, 1.9, d)) * min(1.0, vColor.a * 1.7);
  }
  if (a < 0.004) discard;

  // Sub-splat break-up, keyed off the per-splat seed so it is stable frame to
  // frame and different splat to splat. Held well under the colour so it reads
  // as emulsion in the picture rather than as noise over it.
  vec2 np = vQuad * 7.0 + vSeed * 12.7;
  float grain = vnoise(np) * 0.62 + vnoise(np * 2.7) * 0.38;
  vec3 rgb = vColor.rgb * (0.90 + grain * 0.20);

  o = vec4(rgb * a, a);   // premultiplied
  oMark = vec4(0.0);
}`;

const QUAD = new Float32Array([-0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5]);

// The horizon's own camera. Deliberately not borrowed from props3d: that near
// and far plane are cut for a building, and out here the far plane has to clear
// the whole visible run of tape or the corridor ends in nothing a few slices
// short of where the picture actually stops.
const NEAR = 0.05;
const FAR = 120;

export function horizonCamera({ camX = 0, camY = 0, camZ = 0, yaw = 0, pitch = 0, aspect = 1.6 } = {}) {
  const f = 1 / 0.95;
  const projection = new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (FAR + NEAR) / (NEAR - FAR), -1,
    0, 0, (2 * FAR * NEAR) / (NEAR - FAR), 0,
  ]);
  const cp = Math.cos(pitch);
  const fwd = [Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp];
  const z = [-fwd[0], -fwd[1], -fwd[2]];
  const xl = Math.max(0.0001, Math.hypot(z[0], z[2]));
  const x = [z[2] / xl, 0, -z[0] / xl];
  const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
  const eye = [camX, camY, camZ];
  const view = new Float32Array([
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -x[0] * eye[0] - x[1] * eye[1] - x[2] * eye[2],
    -y[0] * eye[0] - y[1] * eye[1] - y[2] * eye[2],
    -z[0] * eye[0] - z[1] * eye[1] - z[2] * eye[2], 1,
  ]);
  return { view, projection, forward: fwd };
}

let gl = null;
let program = null;
let vao = null;
let quadBuffer = null;
let splatBuffer = null;
let manifest = null;
let ready = false;
let uniforms = new Map();
// A FIGURE MADE OF THE SAME STUFF AS THE TAPE.
//
// The only authored beat in five hundred metres is a talking bust a third of
// the way in, and he had no body: drawHorizon returns before the prop pass and
// nothing out here ever calls r3dSetProps, so he was an [F] prompt hanging in a
// void, thirteen metres off the walking line, and trivially missed by anyone
// not sweeping the dark with the focus reticle.
//
// He is not imported from the building. Nothing out here is made of the
// building — so he is generated as splats in the tape's own space, drawn by the
// same program, blended into the same slices. Out on the tape he is part of the
// recording, which is exactly what the writing says he is.
let markerBuffer = null;
let markerRecords = 0;
let markerSlice = 0;

const U = (name) => {
  if (!uniforms.has(name)) uniforms.set(name, gl.getUniformLocation(program, name));
  return uniforms.get(name);
};

function compile(type, src) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, src);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(`horizon shader: ${gl.getShaderInfoLog(shader)}`);
  }
  return shader;
}

export function horizonInit(context) {
  gl = context;
  program = gl.createProgram();
  gl.attachShader(program, compile(gl.VERTEX_SHADER, VERT));
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`horizon program: ${gl.getProgramInfoLog(program)}`);
  }
  uniforms = new Map();
  vao = gl.createVertexArray();
  quadBuffer = gl.createBuffer();
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, QUAD, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.vertexAttribDivisor(0, 0);
  gl.bindVertexArray(null);
  return true;
}

export async function horizonLoad({ bin = 'assets/horizon-tape.bin', json = 'assets/horizon-tape.json' } = {}) {
  if (!gl || !program) return false;
  const [meta, bytes] = await Promise.all([
    fetch(json).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`horizon manifest ${r.status}`)))),
    fetch(bin).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`horizon tape ${r.status}`)))),
  ]);
  const expected = meta.splats * meta.recordBytes;
  if (bytes.byteLength !== expected) {
    throw new Error(`horizon tape is ${bytes.byteLength} bytes, manifest says ${expected}`);
  }
  manifest = meta;
  splatBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, splatBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, bytes, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
  ready = true;
  return true;
}

// Build the bust: a plinth, a shoulder mass and a head, scattered as splats and
// quantised into the same 16-byte record the bake uses so the existing vertex
// attributes read it unchanged. Deterministic — the same figure every run.
export function horizonSetBust({ x = 0, depth = 0, height = 12, centreY = null } = {}) {
  if (!gl || !program || !manifest) return false;
  const posScale = manifest.posScale, sizeScale = manifest.sizeScale;
  // HE IS THE SIZE OF THE PICTURE, NOT THE SIZE OF A MAN.
  //
  // A garden bust would be right if the eye were where a body's eye is. It is
  // not: the frame is forty units tall and the view is centred on it, so the
  // eye rides seventeen units above the floor and anything standing on that
  // floor is a speck at the bottom of the screen, under the HUD.
  //
  // He is a monument inside a recording. Building him around the eye line at
  // the scale of the thing he is standing in is both the only way he is visible
  // and the more truthful reading of what he is.
  const floor = (centreY == null ? Number(manifest.floor) || 0 : centreY) - height * 0.5;
  const z = -depth;
  let seed = 0x8f1b;
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

  const parts = [];
  const push = (cx, cy, cz, sx, sy, rgb, kind, alpha) =>
    parts.push({ cx, cy, cz, sx, sy, rgb, kind, alpha });

  // HE HAS TO SEPARATE FROM THE PICTURE HE IS STANDING IN.
  //
  // The tape is large saturated colour fields, so a mid-grey bust sits at the
  // same luminance as everything around him and dissolves. Marble that is
  // brighter than anything the recording does, on a plinth darker than anything
  // it does, is what makes a solid object read inside a flat one.
  //
  // Plinth: a squat column, near-black so the figure silhouettes off it.
  for (let i = 0; i < 70; i += 1) {
    const t = i / 70;
    push(x + (rnd() - 0.5) * 1.5, floor + t * height * 0.52, z + (rnd() - 0.5) * 1.2,
      0.85 + rnd() * 0.5, 0.6 + rnd() * 0.4, [0.10, 0.09, 0.13], 0, 240);
  }
  // Shoulders, then the head — brighter, so he reads against a dark tape.
  for (let i = 0; i < 46; i += 1) {
    push(x + (rnd() - 0.5) * 2.0, floor + height * (0.52 + rnd() * 0.16), z + (rnd() - 0.5) * 1.3,
      0.9 + rnd() * 0.5, 0.55 + rnd() * 0.3, [0.86, 0.84, 0.79], 1, 244);
  }
  for (let i = 0; i < 54; i += 1) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd());
    push(x + Math.cos(a) * r * 0.72, floor + height * (0.74 + rnd() * 0.22), z + Math.sin(a) * r * 0.62,
      0.5 + rnd() * 0.3, 0.45 + rnd() * 0.25, [0.98, 0.97, 0.93], 1, 252);
  }
  // Two sockets, because a head without them is a boulder.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 6; i += 1) {
      push(x + side * 0.26 + (rnd() - 0.5) * 0.18, floor + height * 0.855 + (rnd() - 0.5) * 0.1,
        z + 0.44, 0.24, 0.2, [0.06, 0.05, 0.07], 2, 255);
    }
  }

  const stride = manifest.recordBytes;
  const bytes = new ArrayBuffer(parts.length * stride);
  const view = new DataView(bytes);
  parts.forEach((part, i) => {
    const o = i * stride;
    view.setInt16(o + 0, Math.round(part.cx * posScale), true);
    view.setInt16(o + 2, Math.round(part.cy * posScale), true);
    view.setInt16(o + 4, Math.round(part.cz * posScale), true);
    view.setUint8(o + 6, Math.max(1, Math.min(255, Math.round(part.sx * sizeScale))));
    view.setUint8(o + 7, Math.max(1, Math.min(255, Math.round(part.sy * sizeScale))));
    view.setUint8(o + 8, Math.round(part.rgb[0] * 255));
    view.setUint8(o + 9, Math.round(part.rgb[1] * 255));
    view.setUint8(o + 10, Math.round(part.rgb[2] * 255));
    view.setUint8(o + 11, part.alpha);
    view.setUint8(o + 12, Math.round(rnd() * 255));
    view.setUint8(o + 13, part.kind);
  });

  if (!markerBuffer) markerBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, markerBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, bytes, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
  markerRecords = parts.length;
  markerSlice = depth / (Number(manifest.sliceMetres) || 2);
  return true;
}

export function horizonBustPresent() { return markerRecords > 0; }

export function horizonReady() { return ready; }
// Per-frame draw accounting, for the probe. "It went black" has too many
// candidate causes to guess at; this says whether the pass ran and how much of
// the tape it actually submitted.
export const horizonStats = { calls: 0, draws: 0, instances: 0, skipped: 0, bail: null };
export function horizonManifest() { return manifest; }

export function horizonDispose() {
  if (!gl) return;
  if (splatBuffer) gl.deleteBuffer(splatBuffer);
  if (markerBuffer) gl.deleteBuffer(markerBuffer);
  splatBuffer = null; markerBuffer = null; markerRecords = 0;
  manifest = null; ready = false;
}

// Re-point the instance attributes at one slice's run of records. This is the
// whole draw setup — six pointer calls against a buffer that never changes.
function pointAt(first, buffer = splatBuffer) {
  const stride = manifest.recordBytes;
  const base = first * stride;
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 3, gl.SHORT, false, stride, base + 0);
  gl.vertexAttribDivisor(1, 1);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 2, gl.UNSIGNED_BYTE, false, stride, base + 6);
  gl.vertexAttribDivisor(2, 1);
  gl.enableVertexAttribArray(3);
  gl.vertexAttribPointer(3, 4, gl.UNSIGNED_BYTE, true, stride, base + 8);
  gl.vertexAttribDivisor(3, 1);
  gl.enableVertexAttribArray(4);
  gl.vertexAttribPointer(4, 2, gl.UNSIGNED_BYTE, false, stride, base + 12);
  gl.vertexAttribDivisor(4, 1);
}

/**
 * @param slice     the slice the body is standing on (fractional is fine)
 * @param reach     how many slices ahead stay visible
 * @param behind    how many slices behind stay standing
 * @param collapse  0..1, how far into the tail's blackout the body is
 */
// A reusable scratch array for the draw order. The pass runs every frame and
// the window is a fixed shape; allocating and sorting a fresh array each time
// contradicted this module's own promise to allocate nothing per frame.
const drawOrder = [];

export function horizonRender({
  view, projection, slice = 0, reach = 44, behind = reach,
  collapse = 0, boil = 0, exposure = 1, nearFade = 9,
} = {}) {
  horizonStats.calls += 1;
  horizonStats.draws = 0; horizonStats.instances = 0; horizonStats.skipped = 0; horizonStats.bail = null;
  if (!ready || !gl || !program || !view || !projection) {
    horizonStats.bail = `ready=${ready} gl=${!!gl} program=${!!program} view=${!!view} proj=${!!projection}`;
    return false;
  }
  const here = Math.round(slice);
  const first = Math.max(0, here - behind);
  const last = Math.min(manifest.slices - 1, here + reach);
  if (last < first) { horizonStats.bail = `empty range ${first}..${last}`; return false; }

  gl.useProgram(program);
  gl.bindVertexArray(vao);
  gl.uniformMatrix4fv(U('uView'), false, view);
  gl.uniformMatrix4fv(U('uProj'), false, projection);
  gl.uniform1f(U('uPosScale'), manifest.posScale);
  gl.uniform1f(U('uSizeScale'), manifest.sizeScale);
  gl.uniform1f(U('uBoil'), boil);

  // No depth buffer to fight over out here — there is no architecture, only
  // tape — so ordering is the pass's own responsibility and depth testing would
  // only punch holes in it.
  gl.disable(gl.DEPTH_TEST);
  gl.depthMask(false);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  // FURTHEST FIRST, IN EVERY DIRECTION.
  //
  // This used to sort by a cardinal `facing`, which is only correct when the
  // head is aligned with the tape. Looking ACROSS the corridor puts both
  // directions of tape on screen at once, and one half was then composited
  // back to front. Distance from the body is the actual painter's-algorithm
  // key and it needs no facing at all.
  drawOrder.length = 0;
  for (let i = first; i <= last; i += 1) drawOrder.push(i);
  drawOrder.sort((a, b) => Math.abs(b - slice) - Math.abs(a - slice));

  // The bust stands at a depth like everything else, so he sorts into the same
  // back-to-front walk rather than being pasted over the top of it. Drawn when
  // the loop passes his slice, which is what puts tape in front of him when he
  // is behind you.
  let bustDrawn = markerRecords === 0;
  const drawBust = () => {
    if (bustDrawn) return;
    bustDrawn = true;
    gl.uniform1f(U('uSliceFade'), Math.max(0, Math.min(1, exposure * (1 - collapse * 0.92))));
    pointAt(0, markerBuffer);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, markerRecords);
    horizonStats.draws += 1; horizonStats.instances += markerRecords;
  };

  for (const index of drawOrder) {
    // Anything nearer than the bust is drawn after him.
    if (Math.abs(index - slice) < Math.abs(markerSlice - slice)) drawBust();
    const range = manifest.ranges[index];
    if (!range || !range.count) continue;
    const distance = Math.abs(index - slice);
    // Near slices would otherwise fill the screen with one frame at point-blank
    // range. Fading the last couple of metres in is what turns a wall of picture
    // into something a body passes through.
    // THE NEAR HAZE IS WHAT MAKES DEPTH READ, AND WHAT HIDES THE BAKE.
    //
    // This ramped over 1.6 slices — 3.2 metres — so the nearest slice was at
    // full opacity, forty metres tall, and directly in front of the face. Once
    // the frame was re-centred on the eye that became a wall of colour with the
    // recording behind it, and the individual four-metre splats were visible as
    // separate blobs.
    //
    // Holding the near tape transparent for much longer does two things at
    // once: you look DOWN the corridor instead of at the poster in front of it,
    // and every pixel becomes the sum of a dozen slices rather than one splat,
    // which dissolves a 34x19 source into something with texture. Measured at
    // the bust, frame contrast rises and the blobbing disappears.
    const near = Math.min(1, distance / nearFade);
    // The far curve has to be keyed off the window the slice is actually in.
    // Keyed off `reach` alone, with `behind` shorter than `reach`, the tape
    // behind the body was cut at 74% alpha — a wall that vanished when you
    // turned round while walking. Both windows now fade to nothing at their
    // own edge.
    const window = index >= slice ? reach : behind;
    const fadeFrom = window * 0.45;
    const far = 1 - Math.min(1, Math.max(0, (distance - fadeFrom) / Math.max(0.001, window - fadeFrom)));
    const fade = near * far * exposure * (1 - collapse * 0.92);
    if (fade <= 0.002) { horizonStats.skipped += 1; continue; }
    gl.uniform1f(U('uSliceFade'), fade);
    pointAt(range.first);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, range.count);
    horizonStats.draws += 1; horizonStats.instances += range.count;
  }

  drawBust();

  gl.disable(gl.BLEND);
  gl.depthMask(true);
  // Leave depth TESTING off, which is this renderer's standing invariant: r3d
  // disables it once per frame and every pass after this one — the datamosh and
  // the present blit — is a fullscreen triangle that expects it off.
  //
  // "Restoring" it here froze the screen. The default framebuffer's depth is
  // never cleared, so the first present wrote depth and every present after it
  // failed the LESS test: the pass kept running, kept drawing all 46 slices,
  // and the canvas kept showing frame one. Only depthMask is restored, because
  // that one this function genuinely changed from the renderer's default.
  gl.disable(gl.DEPTH_TEST);
  gl.bindVertexArray(null);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);
  return true;
}
