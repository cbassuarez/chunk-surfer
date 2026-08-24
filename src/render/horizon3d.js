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
// Where the ground is. Everything below it belongs to the floor, not to the
// picture, and fades out over the last two metres so the tape rises out of the
// ground rather than being sliced off by a razor.
uniform float uFloorCut;
// ── THE BORE ────────────────────────────────────────────────────────────────
//
// The tape is 128 units wide and 40 tall and the body walks INSIDE it, two
// metres from the nearest slice. Summed over forty slices that is not a
// recording you walk through, it is a wall of colour with your face against it —
// which is what it looked like: full-height video, no floor, no walls except
// the edges of the picture, and no way to tell where the corridor had drifted.
//
// So a tube is carved out of the recording along the walkable band. Inside it
// the tape is nearly gone; outside it the tape is untouched. What that leaves is
// a corridor with the recording as its walls and its ceiling, a floor under it,
// and a clear run down the middle to whatever is at the far end — which is the
// whole point of the crossing and was the one thing you could not see.
//
// The axis follows the same band the floor draws, sampled at the body and a
// hundred-odd metres on, so the tunnel bends exactly where the walking does.
uniform vec2 uBoreCentre;   // x: at the body, y: ahead
uniform vec2 uBoreReach;    // half-width at each
uniform float uBoreZ, uBoreAheadZ, uBoreAxisY, uBoreHeight, uBoreAmount;
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
  float buried = smoothstep(uFloorCut - 2.2, uFloorCut + 0.6, center.y);
  // Where the tube is at this splat's depth.
  float along = clamp((uBoreZ - center.z) / max(1.0, uBoreAheadZ), 0.0, 1.0);
  float axisX = mix(uBoreCentre.x, uBoreCentre.y, along);
  float halfW = max(2.0, mix(uBoreReach.x, uBoreReach.y, along));
  // An elliptical section: as wide as the walkable band, and tall enough to
  // stand a vault over. Normalised so one unit is the tube's surface.
  float ex = (center.x - axisX) / halfW;
  // ON THE EYE, NOT ON THE FLOOR. Centring the section on floor + height/2 put
  // the axis eighteen metres over the head with the body walking underneath its
  // own corridor, which is why the first cut changed nothing on screen.
  float ey = (center.y - uBoreAxisY) / max(2.0, uBoreHeight * 0.5);
  float r = sqrt(ex * ex + ey * ey);
  // Soft-walled, not a hole punched in a poster: the tape thins toward the axis
  // over the last third of the radius, so the corridor has haze in it.
  float bore = mix(1.0 - uBoreAmount, 1.0, smoothstep(0.58, 1.20, r));
  vColor = vec4(aColor.rgb, aColor.a * uSliceFade * buried * bore);
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

// ── THE GROUND THE TAPE STANDS ON ───────────────────────────────────────────
//
// The tape is a cloud of splats hanging in a cleared void, and for a long time
// that was the whole of the horizon: no floor, no walls, no edges except the
// edges of the picture. What that reads as, from inside it, is a video played at
// full height inside a very large box — you cannot tell how tall you are, how
// fast you are going, or which way the corridor has drifted, because there is
// nothing under you and nothing beside you.
//
// So: one quad, lying at the tape's own floor, drawn BEFORE the splats.
//
// It does two jobs and they are both about knowing where you are.
//
//   THE HORIZON LINE. Ground meeting void at a fixed height in the frame is the
//   single strongest depth cue available, and it costs one gradient.
//
//   THE CORRIDOR, VISIBLE. The walkable band is already authored and already
//   drifts — horizonBand() in source-space-runtime.js returns a centre and a
//   reach per slice. Nothing ever drew it, so the drift was something you found
//   out about by being refused. The band is passed in here at two depths and
//   lerped between, which is enough to make a curving path read as a path.
//
// It is not lit and it is not a surface. It is the same plum the void is,
// slightly lifted, with a lit lane down it — a floor in a recording of a place,
// not a floor in a place.
const GROUND_VERT = `#version 300 es
precision highp float;
layout(location=0) in vec2 aQuad;
uniform mat4 uView, uProj;
uniform float uFloorY, uHalfWidth, uNear, uFar, uCamZ;
out vec3 vLocal;
void main(){
  // The quad is laid out in tape space directly: x across the corridor, z back
  // along it from just behind the body to the far fade. Following the camera in
  // z keeps a finite quad under an infinite walk.
  float x = aQuad.x * 2.0 * uHalfWidth;
  float z = uCamZ + mix(uNear, uFar, aQuad.y + 0.5);
  vLocal = vec3(x, uFloorY, z);
  gl_Position = uProj * uView * vec4(vLocal, 1.0);
}`;

const GROUND_FRAG = `#version 300 es
precision highp float;
in vec3 vLocal;
layout(location=0) out vec4 o;
layout(location=1) out vec4 oMark;
uniform vec3 uVoid;
// uFadeDist is the POSITIVE run of the floor. uFar in the vertex shader is the
// signed z offset of the far edge, and reusing it here as a scale divided by a
// negative number — which clamped the fade to 1 everywhere and made the whole
// floor transparent. Two names, because they are two quantities.
uniform float uCamZ, uFadeDist, uCollapse, uExposure;
// The band, at the body and at a slice well ahead of it. Everything between is
// linear, which is what a recording's drift looks like anyway.
uniform vec2 uBandHere;    // x: centre, y: half-width, in tape units
uniform vec2 uBandAhead;
uniform float uAheadZ;

float hash21(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }

void main(){
  float back = uCamZ - vLocal.z;                 // metres ahead of the body
  float t = clamp(back / max(1.0, uAheadZ), 0.0, 1.0);
  vec2 band = mix(uBandHere, uBandAhead, t);
  float off = abs(vLocal.x - band.x);

  // Distance fade. The ground has to run out before the tape does, or the
  // recording appears to be standing on a floor that continues past it.
  float depth = clamp(back / max(1.0, uFadeDist), 0.0, 1.0);
  float reach = 1.0 - smoothstep(0.62, 1.0, depth);
  // And it has to run out UNDER the body too, or the near edge of the quad is a
  // hard line across the bottom of the frame.
  reach *= smoothstep(0.0, 0.035, depth);

  // The lane: lit inside the walkable band, gone outside it, with the edge
  // itself the brightest part. That edge is the only thing out here that is
  // telling the truth about where the step will be refused.
  float inside = 1.0 - smoothstep(band.y * 0.86, band.y * 1.04, off);
  float edge = smoothstep(band.y * 0.72, band.y * 0.99, off) * (1.0 - smoothstep(band.y * 1.0, band.y * 1.22, off));

  // Sleepers every eight metres, thin, and gone before the far fade: they are
  // here to give the walk a rate, not to be a pattern.
  float rungs = smoothstep(0.93, 0.995, abs(fract(vLocal.z * 0.125) * 2.0 - 1.0)) * inside
    * (1.0 - smoothstep(0.30, 0.75, depth));

  // Sleepers across the lane, every four metres, so speed is legible. Without
  // them a flat lane gives the walk no rate at all and the whole crossing feels
  // slower than it is.
  // Bright enough to be a floor. The first pass at this was the void colour
  // times a small number, which on screen is black — the ground was there and
  // nobody could see it, which is the same as not having one.
  // A floor in a recording of a place, not a lit floor in a place. It reads at
  // the same value as the void it stands in and everything on it is a shade of
  // that plum — the first tuning had glowing rails and a checkerboard on it,
  // which is a different game.
  vec3 col = vec3(0.036, 0.014, 0.046);
  col += vec3(0.052, 0.020, 0.068) * inside;
  col += vec3(0.155, 0.062, 0.180) * edge;
  col += vec3(0.048, 0.020, 0.058) * rungs;
  // Grain, so the floor belongs to the same failing recording as the picture.
  col *= 0.86 + hash21(floor(vLocal.xz * 3.0)) * 0.28;

  float a = reach * uExposure * (1.0 - uCollapse * 0.9) * 0.96;
  o = vec4(col * a, a);
  oMark = vec4(0.0);
}`;

// THE ONE SOLID THING IN THE RECORDING.
//
// The bust used to be another cloud of camera-facing quads assembled into a
// head-like silhouette. That made its pedestal no more solid than the tape and
// erased the sculpture whenever the viewing angle changed. The authored GLB
// gets a deliberately small opaque triangle pass instead: real normals, real
// self-occlusion, and a separately modelled stone pedestal.
const MODEL_VERT = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPosition;
layout(location=1) in vec3 aNormal;
uniform mat4 uView, uProj;
uniform vec3 uOrigin;
uniform float uScale;
out vec3 vNormal;
out vec3 vPosition;
void main(){
  vec3 world = aPosition * uScale + uOrigin;
  vPosition = world;
  vNormal = normalize(aNormal);
  gl_Position = uProj * uView * vec4(world, 1.0);
}`;

const MODEL_FRAG = `#version 300 es
precision highp float;
in vec3 vNormal;
in vec3 vPosition;
layout(location=0) out vec4 o;
layout(location=1) out vec4 oMark;
uniform vec4 uBaseColor;
uniform vec3 uEmissive;
uniform float uRole;
uniform float uRecognized;
uniform float uReturned;
uniform float uExposure;

float hash31(vec3 p){ return fract(sin(dot(p, vec3(41.3, 289.1, 113.7))) * 43758.5453); }
void main(){
  vec3 n = normalize(vNormal);
  vec3 key = normalize(vec3(-0.42, 0.76, 0.49));
  float diffuse = max(0.0, dot(n, key));
  float underside = max(0.0, dot(n, normalize(vec3(0.36, -0.18, -0.91))));
  float grain = hash31(floor(vPosition * 9.0));
  vec3 base = uBaseColor.rgb;
  // The seal is bronze until recognition. Once the returned or carried eyes
  // answer it, the metal holds a restrained cold/warm votive light.
  vec3 recognition = mix(vec3(0.76, 0.50, 0.20), vec3(0.28, 0.84, 0.78), uReturned);
  if (uRole > 1.5) base = mix(base, recognition, uRecognized * 0.38);
  vec3 colour = base * (0.23 + diffuse * 0.72 + underside * 0.12);
  colour *= 0.93 + grain * 0.12;
  colour += uEmissive;
  if (uRole > 1.5) colour += recognition * uRecognized * 0.28;
  o = vec4(colour * uExposure, 1.0);
  oMark = vec4(0.0);
}`;

let gl = null;
let program = null;
let groundProgram = null;
let modelProgram = null;
let groundUniforms = new Map();
let modelUniforms = new Map();
let vao = null;
let quadBuffer = null;
let splatBuffer = null;
let manifest = null;
let ready = false;
let uniforms = new Map();
let bustPrimitives = [];
let bustHeight = 1;
let bustPlacement = null;
let markerSlice = 0;

const U = (name) => {
  if (!uniforms.has(name)) uniforms.set(name, gl.getUniformLocation(program, name));
  return uniforms.get(name);
};

const GU = (name) => {
  if (!groundUniforms.has(name)) groundUniforms.set(name, gl.getUniformLocation(groundProgram, name));
  return groundUniforms.get(name);
};

const MU = (name) => {
  if (!modelUniforms.has(name)) modelUniforms.set(name, gl.getUniformLocation(modelProgram, name));
  return modelUniforms.get(name);
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
  groundProgram = gl.createProgram();
  gl.attachShader(groundProgram, compile(gl.VERTEX_SHADER, GROUND_VERT));
  gl.attachShader(groundProgram, compile(gl.FRAGMENT_SHADER, GROUND_FRAG));
  gl.linkProgram(groundProgram);
  if (!gl.getProgramParameter(groundProgram, gl.LINK_STATUS)) {
    throw new Error(`horizon ground program: ${gl.getProgramInfoLog(groundProgram)}`);
  }
  modelProgram = gl.createProgram();
  gl.attachShader(modelProgram, compile(gl.VERTEX_SHADER, MODEL_VERT));
  gl.attachShader(modelProgram, compile(gl.FRAGMENT_SHADER, MODEL_FRAG));
  gl.linkProgram(modelProgram);
  if (!gl.getProgramParameter(modelProgram, gl.LINK_STATUS)) {
    throw new Error(`horizon model program: ${gl.getProgramInfoLog(modelProgram)}`);
  }
  uniforms = new Map();
  groundUniforms = new Map();
  modelUniforms = new Map();
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

const COMPONENT = Object.freeze({ 5120: Int8Array, 5121: Uint8Array, 5122: Int16Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array });
const COMPONENT_BYTES = Object.freeze({ 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 });
const COMPONENT_GET = Object.freeze({ 5120: 'getInt8', 5121: 'getUint8', 5122: 'getInt16', 5123: 'getUint16', 5125: 'getUint32', 5126: 'getFloat32' });
const ELEMENTS = Object.freeze({ SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 });

function parseGlb(arrayBuffer) {
  const data = new DataView(arrayBuffer);
  if (data.getUint32(0, true) !== 0x46546c67 || data.getUint32(4, true) !== 2) throw new Error('horizon bust is not GLB 2');
  let cursor = 12, json = null, bin = null;
  while (cursor + 8 <= arrayBuffer.byteLength) {
    const length = data.getUint32(cursor, true), type = data.getUint32(cursor + 4, true);
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(new Uint8Array(arrayBuffer, cursor + 8, length)));
    if (type === 0x004e4942) bin = new Uint8Array(arrayBuffer, cursor + 8, length);
    cursor += 8 + length;
  }
  if (!json || !bin) throw new Error('horizon bust GLB is missing JSON or BIN');
  if (json.animations || json.skins || json.extensionsUsed?.length || json.extensionsRequired?.length) {
    throw new Error('horizon bust GLB contains unsupported animation, skin, or extension data');
  }
  return { json, bin };
}

function glbAccessor(json, bin, index) {
  const accessor = json.accessors?.[index], view = json.bufferViews?.[accessor?.bufferView];
  const Ctor = COMPONENT[accessor?.componentType], components = ELEMENTS[accessor?.type];
  if (!accessor || !view || !Ctor || !components || accessor.sparse) throw new Error(`unsupported horizon bust accessor ${index}`);
  const componentBytes = COMPONENT_BYTES[accessor.componentType];
  const stride = view.byteStride || componentBytes * components;
  const offset = (view.byteOffset || 0) + (accessor.byteOffset || 0);
  const source = new DataView(bin.buffer, bin.byteOffset, bin.byteLength);
  const output = new Ctor(accessor.count * components), getter = COMPONENT_GET[accessor.componentType];
  for (let row = 0; row < accessor.count; row += 1) for (let column = 0; column < components; column += 1) {
    output[row * components + column] = source[getter](offset + row * stride + column * componentBytes, true);
  }
  return output;
}

async function loadHorizonBust(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`horizon bust ${response.status}`);
  const { json, bin } = parseGlb(await response.arrayBuffer());
  const required = new Set(['horizon_bust_portrait', 'horizon_bust_pedestal', 'horizon_bust_seal']);
  const primitives = [];
  let minY = Infinity, maxY = -Infinity;
  for (const mesh of json.meshes || []) {
    required.delete(mesh.name);
    const role = mesh.name === 'horizon_bust_portrait' ? 0 : mesh.name === 'horizon_bust_pedestal' ? 1 : 2;
    for (const primitive of mesh.primitives || []) {
      if (primitive.mode != null && primitive.mode !== 4) throw new Error(`${mesh.name}: triangles required`);
      const positions = glbAccessor(json, bin, primitive.attributes?.POSITION);
      const normals = glbAccessor(json, bin, primitive.attributes?.NORMAL);
      const indices = glbAccessor(json, bin, primitive.indices);
      if (!(positions instanceof Float32Array) || !(normals instanceof Float32Array)) throw new Error(`${mesh.name}: float position/normal required`);
      for (let index = 1; index < positions.length; index += 3) { minY = Math.min(minY, positions[index]); maxY = Math.max(maxY, positions[index]); }
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      const bind = (location, values) => {
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, values, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(location); gl.vertexAttribPointer(location, 3, gl.FLOAT, false, 0, 0);
        return buffer;
      };
      const positionBuffer = bind(0, positions), normalBuffer = bind(1, normals);
      const indexBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
      const material = json.materials?.[primitive.material || 0] || {};
      const pbr = material.pbrMetallicRoughness || {};
      primitives.push({
        vao, positionBuffer, normalBuffer, indexBuffer, count: indices.length,
        indexType: indices instanceof Uint32Array ? gl.UNSIGNED_INT : indices instanceof Uint16Array ? gl.UNSIGNED_SHORT : gl.UNSIGNED_BYTE,
        base: pbr.baseColorFactor || [1, 1, 1, 1], emissive: material.emissiveFactor || [0, 0, 0], role,
      });
    }
  }
  gl.bindVertexArray(null); gl.bindBuffer(gl.ARRAY_BUFFER, null); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
  if (required.size) throw new Error(`horizon bust GLB missing ${[...required].join(', ')}`);
  bustPrimitives = primitives;
  bustHeight = Math.max(0.001, maxY - minY);
  return true;
}

export async function horizonLoad({ bin = 'assets/horizon-tape.bin', json = 'assets/horizon-tape.json', bust = 'assets/horizon-bust.glb' } = {}) {
  if (!gl || !program) return false;
  const [meta, bytes] = await Promise.all([
    fetch(json).then((r) => (r.ok ? r.json() : Promise.reject(new Error(`horizon manifest ${r.status}`)))),
    fetch(bin).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`horizon tape ${r.status}`)))),
    loadHorizonBust(bust),
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

export function horizonSetBust({ x = 0, depth = 0, height = 12, centreY = null, eyes = false, eyeMode = 'untouched' } = {}) {
  if (!gl || !program || !manifest || !bustPrimitives.length) return false;
  const floor = (centreY == null ? Number(manifest.floor) || 0 : centreY) - height * 0.5;
  bustPlacement = { x, z: -depth, floor, height, scale: height / bustHeight, eyes: !!eyes, eyeMode: String(eyeMode) };
  markerSlice = depth / (Number(manifest.sliceMetres) || 2);
  return true;
}

export function horizonBustPresent() { return !!bustPlacement && bustPrimitives.length > 0; }

export function horizonReady() { return ready; }
// Per-frame draw accounting, for the probe. "It went black" has too many
// candidate causes to guess at; this says whether the pass ran and how much of
// the tape it actually submitted.
export const horizonStats = { calls: 0, draws: 0, instances: 0, skipped: 0, bail: null };
export function horizonManifest() { return manifest; }

export function horizonDispose() {
  if (!gl) return;
  if (splatBuffer) gl.deleteBuffer(splatBuffer);
  for (const primitive of bustPrimitives) {
    gl.deleteVertexArray(primitive.vao); gl.deleteBuffer(primitive.positionBuffer);
    gl.deleteBuffer(primitive.normalBuffer); gl.deleteBuffer(primitive.indexBuffer);
  }
  splatBuffer = null; bustPrimitives = []; bustPlacement = null;
  manifest = null; ready = false;
}

function drawHorizonBust(view, projection, exposure, collapse) {
  if (!horizonBustPresent()) return false;
  gl.useProgram(modelProgram);
  gl.uniformMatrix4fv(MU('uView'), false, view); gl.uniformMatrix4fv(MU('uProj'), false, projection);
  gl.uniform3f(MU('uOrigin'), bustPlacement.x, bustPlacement.floor, bustPlacement.z);
  gl.uniform1f(MU('uScale'), bustPlacement.scale);
  gl.uniform1f(MU('uRecognized'), bustPlacement.eyes ? 1 : 0);
  gl.uniform1f(MU('uReturned'), bustPlacement.eyeMode === 'returned' ? 1 : 0);
  gl.uniform1f(MU('uExposure'), Math.max(0.08, exposure * (1 - collapse * 0.92)));
  gl.disable(gl.BLEND); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true);
  for (const primitive of bustPrimitives) {
    gl.bindVertexArray(primitive.vao);
    gl.uniform4fv(MU('uBaseColor'), primitive.base); gl.uniform3fv(MU('uEmissive'), primitive.emissive);
    gl.uniform1f(MU('uRole'), primitive.role);
    gl.drawElements(gl.TRIANGLES, primitive.count, primitive.indexType, 0);
    horizonStats.draws += 1; horizonStats.instances += primitive.count / 3;
  }
  gl.disable(gl.DEPTH_TEST); gl.depthMask(false); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.useProgram(program); gl.bindVertexArray(vao);
  return true;
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

// The floor, drawn before the tape so every splat composites over it. Called by
// r3d ahead of horizonRender; separate because it wants the corridor band and
// the tape does not.
export function horizonGround({
  view, projection, camZ = 0, floorY = null, collapse = 0, exposure = 1,
  band = null, bandAhead = null, aheadZ = 96, far = 300, near = 6,
} = {}) {
  if (!gl || !groundProgram || !view || !projection) return false;
  const here = band || { centre: 0, reach: 24 };
  const ahead = bandAhead || here;
  const y = floorY == null ? (Number(manifest?.floor) || 0) - (Number(manifest?.span?.y) || 40) * 0 : floorY;
  gl.useProgram(groundProgram);
  gl.bindVertexArray(vao);
  gl.uniformMatrix4fv(GU('uView'), false, view);
  gl.uniformMatrix4fv(GU('uProj'), false, projection);
  gl.uniform1f(GU('uFloorY'), y);
  // Wide enough that the quad's own side edges never enter the frame; the fade
  // is what ends the floor, not the geometry.
  gl.uniform1f(GU('uHalfWidth'), 320);
  gl.uniform1f(GU('uNear'), near);
  gl.uniform1f(GU('uFar'), -far);
  gl.uniform1f(GU('uFadeDist'), far);
  gl.uniform1f(GU('uCamZ'), camZ);
  gl.uniform3f(GU('uVoid'), 0.035, 0.008, 0.042);
  gl.uniform1f(GU('uCollapse'), collapse);
  gl.uniform1f(GU('uExposure'), exposure);
  gl.uniform2f(GU('uBandHere'), here.centre, Math.max(2, here.reach));
  gl.uniform2f(GU('uBandAhead'), ahead.centre, Math.max(2, ahead.reach));
  gl.uniform1f(GU('uAheadZ'), Math.max(1, aheadZ));
  gl.disable(gl.DEPTH_TEST);
  gl.depthMask(false);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  gl.bindVertexArray(null);
  return true;
}

export function horizonRender({
  view, projection, slice = 0, reach = 44, behind = reach,
  collapse = 0, boil = 0, exposure = 1, nearFade = 9, floorCut = -1e9,
  bore = null,
} = {}) {
  bore = {
    centre: 0, centreAhead: 0, reach: 24, reachAhead: 24,
    z: 0, aheadZ: 110, axisY: floorCut, height: 22, amount: 0,
    ...(bore || {}),
  };
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
  gl.uniform1f(U('uFloorCut'), floorCut);
  gl.uniform2f(U('uBoreCentre'), bore.centre, bore.centreAhead);
  gl.uniform2f(U('uBoreReach'), bore.reach, bore.reachAhead);
  gl.uniform1f(U('uBoreZ'), bore.z);
  gl.uniform1f(U('uBoreAheadZ'), Math.max(1, bore.aheadZ));
  gl.uniform1f(U('uBoreAxisY'), bore.axisY);
  gl.uniform1f(U('uBoreHeight'), Math.max(2, bore.height));
  gl.uniform1f(U('uBoreAmount'), Math.max(0, Math.min(1, bore.amount)));

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
  let bustDrawn = !horizonBustPresent();
  const drawBust = () => {
    if (bustDrawn) return;
    bustDrawn = true;
    drawHorizonBust(view, projection, exposure, collapse);
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
