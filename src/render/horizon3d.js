import { parseCharacterAsset, sampleCharacterPose, CHARACTER_DEFORM_GLSL, CHARACTER_LIMITS } from './character-asset.js';
import { BUST_RELIQUARY_RIG } from '../data/bust-reliquary-rig.js';

// The telephone street unravels into the recorded tape. Its baked slices are
// transformed into physical world metres and use the street's actual camera.
// Surviving real props occlude the splats; fixed missing sectors and settling
// fragments accumulate with the runtime's saved unravelling amount. Ground
// remains continuous and the bust is an optional solid remnant.
//
// The pass bypasses MARCH_FRAG. r3d composites street and splats together, then
// progressively releases the existing pixel mesh into full recording colour.
// The baked buffer remains immutable; damage and world placement are uniforms.
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

// Shared with the physical street compositor. Damage is attached to space and
// a durable amount; turning around or pausing cannot put a missing sector back.
export const UNRAVELLING_GLSL = `
float unravelHash(vec2 p){float h=abs(sin(dot(p,vec2(127.1,311.7)))*43758.5);return h-floor(h);}
float unravelKeep(vec3 p,float amount){
  vec2 sector=floor(p.xz/vec2(7.0,11.0));
  float seed=unravelHash(sector);
  float remnant=step(.91,seed);
  float chunk=unravelHash(vec2(floor(p.x*.8)+floor(p.y*.7)*19.0,floor(p.z*.7)));
  float sectorLoss=smoothstep(.20+seed*.70,.24+seed*.70,amount);
  float chunkLoss=smoothstep(.20+chunk*.72,.24+chunk*.72,amount);
  return mix((1.0-sectorLoss)*(1.0-chunkLoss*.72),1.0,remnant);
}
`;

export function horizonWorldTransform({ worldOriginM = [0, 0, 0], cellMetres = .5 } = {}, tape = {}) {
  const cell = Math.max(.01, Number(cellMetres) || .5);
  const origin = worldOriginM.map(value => Number(value) || 0);
  return { scale: [cell * 1.5, cell, cell], offset: [origin[0], origin[1] - (Number(tape.floor) || 0) * cell, origin[2]] };
}

export function horizonWorldPoint(point, transform) {
  return point.map((value, axis) => value * transform.scale[axis] + transform.offset[axis]);
}

// Metres are signed from the physical seam. The first step into it is mostly
// absence; the image gathers through a long walk instead of presenting its
// entire forty-slice stack as a wall at the roadside. The first image stays
// local to the walker; the full recording only arrives near the bust.
export function horizonEntryDiffusion(metres) {
  const t = Math.max(0, Math.min(1, ((Number(metres) || 0) + 12) / 172));
  return t * t * (3 - 2 * t);
}

const VERT = `#version 300 es
precision highp float;
layout(location=0) in vec2 aQuad;      // unit quad, -0.5..0.5
layout(location=1) in vec3 aCenter;    // fixed point, /uPosScale
layout(location=2) in vec2 aSize;      // fixed point, /uSizeScale
layout(location=3) in vec4 aColor;     // normalised
layout(location=4) in vec2 aTrim;      // x: seed, y: kind
uniform mat4 uView, uProj;
uniform vec3 uWorldScale, uWorldOffset;
uniform vec3 uDamageOrigin;
uniform vec2 uUnravelling; // durable amount, cumulative loss
uniform float uWorldActive;
uniform float uPosScale, uSizeScale;
uniform float uSliceFade;   // per-slice opacity, distance + collapse
uniform float uEntryReveal; // threshold mist gives way to image in lived metres
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
// How hard the damage is crawling HERE. Which splats are damaged is baked into
// the tape per slice; how much they move is the recording's measured mosh,
// which used to be computed every frame and read by nobody. At the head the
// picture is clean and still, the middle seethes, and the tail is clean again
// and dying — three acts nobody had to author.
uniform float uMosh;
uniform float uDream;
// AURORA, NOT WALLPAPER. Flat fields are the substance of the recording, and
// baked at 4m wide by 2.2m tall they tile like brickwork. Drawn tall they
// overlap into vertical curtains instead — light hanging in a column rather
// than a picture stuck on a surface — which is what the crossing is supposed
// to feel like walking through.
uniform float uCurtain;
// Slow vertical drift on the curtains. Aurora hangs and breathes; a recording
// hung in a plane does not, and the difference is most of the feeling.
uniform float uShimmer;
out vec2 vQuad; out vec4 vColor; out float vKind; out float vSeed;
out float vViewDepth;
` + UNRAVELLING_GLSL + `

void main(){
  vec3 center = aCenter / uPosScale;
  vec2 size = aSize / uSizeScale;
  float kind = aTrim.y;
  vec3 anchored = center * uWorldScale + uWorldOffset;
  float pictureLoss=max(uUnravelling.y,.24+uUnravelling.x*.46);
  float keep = mix(1.0,unravelKeep(anchored-uDamageOrigin,pictureLoss),uWorldActive);
  // Gaps continue through successive frames instead of filling with the next
  // intact slice. The picture arrives already failing.
  float sector=unravelHash(floor((anchored-uDamageOrigin).xy/vec2(6.0,3.5)));
  float sectorLoss=smoothstep(.16+sector*.65,.20+sector*.65,uUnravelling.x);
  keep*=mix(1.0,1.0-sectorLoss*(1.0-step(.92,sector)),uWorldActive);
  float detached = smoothstep(.12,.66,uUnravelling.x)*uWorldActive;
  float packet = unravelHash(floor(center.xz/vec2(4.0,8.0)));
  // The entrance is a cloud volume, not the first frame of a giant flat
  // recording. Neighbouring depths drift out of register, then gradually find
  // their recorded positions as the body goes farther in.
  float fogPacket=unravelHash(vec2(floor(center.z/6.0),floor(center.y/5.0)));
  center.x+=(fogPacket-.5)*40.0*(1.0-uEntryReveal)*uWorldActive;
  center.y+=(fogPacket-.5)*3.0*(1.0-uEntryReveal)*uWorldActive;
  // Fragments separate and settle once. They do not orbit like aurora curtains.
  center.x += (packet-.5)*detached*5.0;
  center.y -= packet*detached*3.0;
  size *= 1.0-detached*(.18+packet*.35);
  // Macroblock damage gets a small, seeded wander. The recording is a single
  // still per slice and a perfectly rigid one reads as a photograph on a wall
  // rather than as a signal that is still arriving.
  // The amplitude used to be 0.06m on a splat 1.8m across — a 3% displacement,
  // which is to say invisible. The damage should visibly crawl.
  float phase = aTrim.x * 0.0246 + uBoil;
  // Recursive folds of the actual recorded splats: no invented image layer.
  // The clear navigation bore and ground remain untouched.
  vec2 fold=center.xy*.13;
  for(int octave=0;octave<3;octave++){
    fold=sin(fold.yx*1.73+vec2(.7,1.3)+uBoil*.035);
    center.xy+=fold*uDream*(.95/float(octave+1));
  }
  size *= 1.0 + uDream*.24*sin(phase*.3);
  if (kind > 1.5) {
    center.xy += vec2(sin(phase), cos(phase * 1.37)) * (0.42 * uMosh);
  } else if (kind > 0.5) {
    // A far smaller unrest on the edges too, so no part of the picture is
    // perfectly rigid. A still recording reads as a photograph on a wall.
    center.xy += vec2(sin(phase * 0.61), cos(phase * 0.83)) * (0.05 * uMosh);
  } else {
    // Only the flat fields become curtains, and only they drift. Damage stays
    // the size and the place it was measured at: grain suspended in air is the
    // one thing out here that should read as particles rather than as light.
    size.y *= uCurtain;
    center.y += sin(phase * 0.31 + center.x * 0.07) * uShimmer;
    center.x += cos(phase * 0.19 + center.y * 0.05) * uShimmer * 0.35;
  }
  // Camera-space expansion: the splat faces the body, always.
  vec3 world = center * uWorldScale + uWorldOffset;
  vec4 viewPos = uView * vec4(world, 1.0);
  viewPos.xy += aQuad * size * uWorldScale.xy;
  vViewDepth = -viewPos.z;
  vQuad = aQuad;
  float floorFray=sin(anchored.x*.19+anchored.z*.071)
    *sin(anchored.z*.11-anchored.x*.04)*2.5;
  float buried=mix(
    smoothstep(uFloorCut-1.1,uFloorCut+.3,world.y),
    smoothstep(uFloorCut-8.0+floorFray,uFloorCut+6.0+floorFray,world.y),
    uWorldActive);
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
  // Stable cohorts of splats emerge as patches, rather than all forty slices
  // fading up together into a rectangular screen. The early patches are thin
  // enough to see the black between them.
  float cloudSeed=unravelHash(floor(anchored.xy/vec2(8.0,5.5))+vec2(floor(anchored.z/13.0),0.0));
  float cloud=smoothstep(cloudSeed*.72-.03,cloudSeed*.72+.25,uEntryReveal);
  float entry=pow(uEntryReveal,1.35)*cloud;
  vColor = vec4(aColor.rgb, aColor.a * uSliceFade * buried * bore * keep * entry);
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
in float vViewDepth;
layout(location=0) out vec4 o;
layout(location=1) out vec4 oMark;
// How opaque a flat field is allowed to get. See the veil note below.
uniform float uVeil;
uniform float uEntryReveal;
uniform sampler2D uStreet, uStreetDepth;
uniform vec2 uSceneRes, uStreetNearFar;
uniform float uWorldActive, uStreetRetention;

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
    // VEILS, NOT WALLS.
    //
    // This used to push flat fields to full opacity — "they are walls, walls are
    // opaque" — which built a corridor with two painted surfaces down it. The
    // crossing is meant to feel like walking through an aurora, and an aurora is
    // something you see a dozen depths of at once. Held under opacity, the
    // nearFade stack sums into hanging light instead: the same picture, arrived
    // at by addition rather than by occlusion.
    a = (1.0 - smoothstep(0.35, 2.1, d)) * min(1.0, vColor.a * uVeil);
  }
  if(uWorldActive>.5){
    vec2 uv=gl_FragCoord.xy/uSceneRes;
    float coverage=texture(uStreet,uv).a;
    float ndc=texture(uStreetDepth,uv).r*2.0-1.0;
    float streetDepth=2.0*uStreetNearFar.x*uStreetNearFar.y/max(.0001,uStreetNearFar.y+uStreetNearFar.x-ndc*(uStreetNearFar.y-uStreetNearFar.x));
    // Real surviving shapes occlude the picture. Near fragments can cross in
    // front, gently at first, so the same telephone street remains legible.
    a*=vViewDepth>streetDepth-.035?1.0-coverage:1.0-coverage*uStreetRetention*.88;
  }
  if(uEntryReveal<.999){
    // Reveal nearby suspended fragments before the distant slices. Without
    // this distance veil the first visible material is a plane 80m away.
    // Patch emergence already belongs to world-anchored splats in VERT. A
    // second mask in screen coordinates kept the same cloud over every depth
    // while the player turned; it read as an overlay for the entire entry.
    float reach=mix(10.0,90.0,pow(uEntryReveal,2.7));
    float nearCloud=1.0-smoothstep(reach*.62,reach,vViewDepth);
    a*=nearCloud;
  }
  if (a < 0.004) discard;

  // Sub-splat break-up, keyed off the per-splat seed so it is stable frame to
  // frame and different splat to splat. Held well under the colour so it reads
  // as emulsion in the picture rather than as noise over it.
  vec2 np = vQuad * 7.0 + vSeed * 12.7;
  float grain = vnoise(np) * 0.62 + vnoise(np * 2.7) * 0.38;
  vec3 rgb = vColor.rgb * (0.90 + grain * 0.20);
  // Colour arrives after form: first the recording looks like suspended ash,
  // then its familiar impossible palette slowly stains the separate clouds.
  float chroma=smoothstep(.65,1.0,uEntryReveal);
  float luminance=dot(rgb,vec3(.30,.59,.11));
  rgb=mix(vec3(.24,.27,.29)*luminance,rgb,chroma);

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

export function horizonCamera({ camX = 0, camY = 0, camZ = 0, yaw = 0, pitch = 0, aspect = 1.6, near = NEAR, far = FAR } = {}) {
  const f = 1 / 0.95;
  // The first shore has fixed architecture hundreds of metres away. Other
  // callers retain the tape camera's original range and depth precision.
  const n = Math.max(.01, Number(near) || NEAR), fa = Math.max(n + 1, Number(far) || FAR);
  const projection = new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (fa + n) / (n - fa), -1,
    0, 0, (2 * fa * n) / (n - fa), 0,
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
uniform vec3 uWorldScale, uWorldOffset;
out vec3 vLocal;
void main(){
  // The quad is laid out in tape space directly: x across the corridor, z back
  // along it from just behind the body to the far fade. Following the camera in
  // z keeps a finite quad under an infinite walk.
  float x = aQuad.x * 2.0 * uHalfWidth;
  float z = uCamZ + mix(uNear, uFar, aQuad.y + 0.5);
  vLocal = vec3(x, uFloorY, z);
  gl_Position = uProj * uView * vec4(vLocal*uWorldScale+uWorldOffset, 1.0);
}`;

const GROUND_FRAG = `#version 300 es
precision highp float;
in vec3 vLocal;
layout(location=0) out vec4 o;
layout(location=1) out vec4 oMark;
uniform vec3 uVoid;
uniform vec2 uPath[4];
uniform float uPathOpen;
uniform float uPathOnly;
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
  float depth = clamp(abs(back) / max(1.0, uFadeDist), 0.0, 1.0);
  float reach = 1.0 - smoothstep(0.62, 1.0, depth);
  // Ground remains underfoot and behind the body when looking back. Its quad
  // extends beyond this fade, so there is no artificial near edge to conceal.

  // The lane: lit inside the walkable band, gone outside it, with the edge
  // itself the brightest part. That edge is the only thing out here that is
  // telling the truth about where the step will be refused.
  float inside = 1.0 - smoothstep(band.y * 0.86, band.y * 1.04, off);
  // One broad worn surface continues the street. There are no luminous rails
  // or periodic sleepers suggesting another obstacle course.
  vec3 col = vec3(.095,.105,.108)+vec3(.025,.025,.018)*inside;
  // Grain, so the floor belongs to the same failing recording as the picture.
  col *= 0.86 + hash21(floor(vLocal.xz * 3.0)) * 0.28;
  float pathDistance=10000.0;
  // Match the body's cell metric; only the picture compresses the X axis.
  vec2 pathPoint=vLocal.xz*vec2(1.5,1.0);
  for(int i=0;i<3;i++){
    vec2 a=uPath[i]*vec2(1.5,1.0),b=uPath[i+1]*vec2(1.5,1.0),ab=b-a;
    float t=clamp(dot(pathPoint-a,ab)/max(.001,dot(ab,ab)),0.0,1.0);
    pathDistance=min(pathDistance,length(pathPoint-a-ab*t));
  }
  float ribbon=(1.0-smoothstep(4.8,6.0,pathDistance))*uPathOpen;
  float lip=(1.0-smoothstep(.18,.63,abs(pathDistance-4.8)))*uPathOpen;
  col=mix(col,vec3(.095,.098,.082),ribbon*.9);
  col+=vec3(.10,.085,.04)*lip;

  float a = reach * uExposure * 0.96;
  // The opened road is solid ground, not another translucent video layer.
  // A second narrow pass keeps only it legible through the picture's splats.
  if(uPathOnly>.5){
    a*=max(ribbon,lip);
    col=vec3(.19,.19,.145)+vec3(.10,.085,.04)*lip;
  }
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
uniform vec3 uWorldScale, uWorldOffset;
uniform vec3 uModelToTape;
${CHARACTER_DEFORM_GLSL}
out vec3 vNormal;
out vec3 vPosition;
void main(){
  vec3 position=aPosition, normal=aNormal;
  deformCharacter(position,normal);
  vec3 world = position * uModelToTape * uScale + uOrigin;
  vPosition = world*uWorldScale+uWorldOffset;
  vNormal = normalize(normal/(uModelToTape*uWorldScale));
  gl_Position = uProj * uView * vec4(vPosition, 1.0);
}`;

const MODEL_FRAG = `#version 300 es
precision highp float;
in vec3 vNormal;
in vec3 vPosition;
layout(location=0) out vec4 o;
layout(location=1) out vec4 oMark;
uniform mat4 uView;
uniform vec4 uBaseColor;
uniform vec3 uEmissive;
uniform float uRole, uMetallic, uRoughness;
uniform float uRecognized, uReturned, uCeremony, uExposure, uAlpha;
float hash31(vec3 p){return fract(sin(dot(p,vec3(41.3,289.1,113.7)))*43758.5453);}
void main(){
  vec3 n=normalize(vNormal);
  if(!gl_FrontFacing)n=-n;
  vec3 key=normalize(vec3(-.76,.53,.42));
  vec3 camera=-transpose(mat3(uView))*uView[3].xyz;
  vec3 viewDir=normalize(camera-vPosition),halfway=normalize(key+viewDir);
  float diffuse=max(0.,dot(n,key));
  float fill=max(0.,dot(n,normalize(vec3(.65,.13,-.61))));
  float grain=hash31(floor(vPosition*85.));
  float veins=sin(vPosition.x*7.+sin(vPosition.y*3.+vPosition.z*5.)*.8);
  vec3 base=uBaseColor.rgb;
  if(uRole<.5)base*=.96+.04*smoothstep(-.94,-.7,veins);
  float spec=pow(max(0.,dot(n,halfway)),mix(100.,13.,uRoughness));
  vec3 f0=mix(vec3(.045),base,uMetallic);
  float fresnel=pow(1.-max(0.,dot(n,viewDir)),5.);
  float ambient=uRole<.5?.35:(uRole<1.5?.53:.39);
  vec3 colour=base*(ambient+diffuse*(uRole<.5?1.02:.67)+fill*(uRole<.5?.07:.14))*(1.-uMetallic*.28);
  // The projector supplies the fine screen texture. Micro-noise on every
  // marble triangle turns eyelids and the mineral irises into static once the
  // figure enters that pass, so keep only a trace of material grain here.
  colour*=uRole<.5?.985+grain*.025:.975+grain*.045;
  colour+=mix(f0,vec3(.63,.69,.61),fresnel)*spec*(.28+uMetallic*.9);
  colour+=base*fresnel*.075+uEmissive;
  // The recording is a bright, near-surrounding light source. A small diffuse
  // return from it lets the charcoal plinth and the repaired metal keep their
  // relief against the luminous tape without turning the seal into a lamp.
  float tapeBounce=.55+.45*max(0.,dot(n,viewDir));
  if(uRole<.5)colour+=vec3(.095,.100,.090)*tapeBounce;
  if(uRole>.5&&uRole<1.5)colour+=vec3(.15,.15,.12)*tapeBounce;
  if(uRole>1.5&&uRole<2.5||uRole>5.5)colour+=vec3(.035,.030,.019)*tapeBounce;
  if(uRole>4.5&&uRole<5.5)colour+=vec3(.050,.050,.046)*tapeBounce;
  if(uRole>4.5&&uRole<5.5)colour+=vec3(.045,.040,.032)*uCeremony;
  // A quietly darker stone body keeps the face and the hand cut readable
  // against the broad white fields of the recording. Its weathering varies in
  // world space, not along the screen's diagonal hatch.
  if(uRole>.5&&uRole<1.5){
    float strata=sin(vPosition.y*2.1+sin(vPosition.x*.9+vPosition.z*1.3)*.75)
                *sin(vPosition.x*2.4-vPosition.z*1.1);
    colour*=.82+strata*.025;
  }
  o=vec4(colour*uExposure,uAlpha);
  oMark=vec4(0.);
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
let bustLevels=[];
let bustLastLod=0;
let bustHeight = BUST_RELIQUARY_RIG.assetWorldHeight*2;
let bustAsset=null;
let bustMorphTexture=null;
let bustPose=null;
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

async function loadHorizonBust(url,lod=0) {
  const response=await fetch(url);
  if(!response.ok)throw new Error(`horizon bust ${response.status}`);
  const asset=parseCharacterAsset(await response.arrayBuffer());
  const required=new Set(['horizon_bust_portrait','horizon_bust_pedestal','horizon_bust_seal']);
  const roles={marble:0,stone:1,bronze:2,eye:3,shutter:4,seal:5,linkage:6};
  const primitives=[];
  for(const entry of asset.entries){
    required.delete(entry.name);
    const role=roles[entry.extras.reliquaryRole]??(entry.name.includes('portrait')?0:entry.name.includes('pedestal')?1:2);
    for(const primitive of entry.primitives){
      const vao=gl.createVertexArray(),buffers=[];
      gl.bindVertexArray(vao);
      const bind=(location,values,size,integer=false)=>{
        const buffer=gl.createBuffer();buffers.push(buffer);
        gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,values,gl.STATIC_DRAW);
        gl.enableVertexAttribArray(location);
        if(integer)gl.vertexAttribIPointer(location,size,gl.UNSIGNED_SHORT,0,0);
        else gl.vertexAttribPointer(location,size,gl.FLOAT,false,0,0);
      };
      bind(0,primitive.positions,3);bind(1,primitive.normals,3);
      bind(13,Uint16Array.from(primitive.joints),4,true);bind(14,primitive.weights,4);
      const indexBuffer=gl.createBuffer();buffers.push(indexBuffer);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,indexBuffer);gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,primitive.indices,gl.STATIC_DRAW);
      const material=asset.json.materials?.[primitive.material]||{},pbr=material.pbrMetallicRoughness||{};
      primitives.push({vao,buffers,entry,count:primitive.indices.length,indexType:primitive.indexType,
        base:pbr.baseColorFactor||[1,1,1,1],emissive:material.emissiveFactor||[0,0,0],
        metallic:pbr.metallicFactor??0,roughness:pbr.roughnessFactor??.75,role});
    }
  }
  gl.bindVertexArray(null);gl.bindBuffer(gl.ARRAY_BUFFER,null);gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,null);
  if(required.size)throw new Error(`horizon bust GLB missing ${[...required].join(', ')}`);
  // A complete sampler binding is required even for this rigid, zero-morph rig.
  if(!bustMorphTexture){
    bustMorphTexture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,bustMorphTexture);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA32F,1,1,0,gl.RGBA,gl.FLOAT,new Float32Array(4));
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);
    gl.bindTexture(gl.TEXTURE_2D,null);
  }
  bustLevels[lod]={asset,primitives};
  if(lod===0){
    bustAsset=asset;bustPrimitives=primitives;
    bustHeight=BUST_RELIQUARY_RIG.assetWorldHeight*BUST_RELIQUARY_RIG.worldToTapeScale[1];
  }
  return true;
}

export async function horizonLoad({ bin = 'assets/horizon-tape.bin', json = 'assets/horizon-tape.json', bust = 'assets/horizon-bust.glb', bustLod1 = 'assets/horizon-bust-lod1.glb', bustLod2 = 'assets/horizon-bust-lod2.glb' } = {}) {
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
  // Detail tiers are optional and arrive after the main scene is playable.
  // A missing derivative leaves the original rig active at every distance.
  void Promise.allSettled([loadHorizonBust(bustLod1,1),loadHorizonBust(bustLod2,2)]);
  return true;
}

export function horizonSetBust({ x = 0, depth = 0, height = 6.5, centreY = null, eyes = false, eyeMode = 'untouched', performance = null } = {}) {
  if (!gl || !program || !manifest || !bustPrimitives.length) return false;
  const floor = (centreY == null ? Number(manifest.floor) || 0 : centreY) - height * 0.5;
  bustPlacement = { x, z: -depth, floor, height, scale: height / bustHeight, eyes: !!eyes, eyeMode: String(eyeMode), performance };
  markerSlice = depth / (Number(manifest.sliceMetres) || 2);
  return true;
}

export function horizonBustRigDebug(){return bustAsset?{design:BUST_RELIQUARY_RIG.design,joints:bustAsset.entries[0]?.skin.joints.length,clips:[...bustAsset.clips.keys()],primitives:bustPrimitives.length,lods:bustLevels.map((level,index)=>level?{index,primitives:level.primitives.length,triangles:level.primitives.reduce((n,primitive)=>n+primitive.count/3,0)}:null).filter(Boolean),drawLod:bustLastLod,pose:bustPose?{clip:bustPose.clip,time:bustPose.time,bones:Array.from(bustPose.bones.slice(0,BUST_RELIQUARY_RIG.joints.length*16))}:null}:null;}

export function horizonBustPresent() { return !!bustPlacement && bustPrimitives.length > 0; }

// The two defeat returns stage the same physical sculpture, rather than a
// transcript over whichever cathedral frame happened to be last rendered.
export function horizonRenderBust({view,projection,exposure=1,collapse=0,worldTransform=null,alpha=1}={}) {
  if(!view||!projection)return false;
  return drawHorizonBust(view,projection,exposure,collapse,worldTransform,alpha);
}

export function horizonReady() { return ready; }
// Per-frame draw accounting, for the probe. "It went black" has too many
// candidate causes to guess at; this says whether the pass ran and how much of
// the tape it actually submitted.
export const horizonStats = { calls: 0, draws: 0, instances: 0, skipped: 0, bail: null, glErrors: [] };
export function horizonManifest() { return manifest; }

export function horizonDispose() {
  if (!gl) return;
  if (splatBuffer) gl.deleteBuffer(splatBuffer);
  for(const level of bustLevels)for(const primitive of level?.primitives||[]){
    gl.deleteVertexArray(primitive.vao);for(const buffer of primitive.buffers)gl.deleteBuffer(buffer);
  }
  if(bustMorphTexture)gl.deleteTexture(bustMorphTexture);
  splatBuffer = null; bustPrimitives = []; bustLevels=[];bustLastLod=0;bustPlacement = null;bustAsset=null;bustPose=null;bustMorphTexture=null;
  manifest = null; ready = false;
}

function drawHorizonBust(view, projection, exposure, collapse, worldTransform = null, alpha = 1) {
  if (!horizonBustPresent()) return false;
  const cameraX=-(view[0]*view[12]+view[1]*view[13]+view[2]*view[14]);
  const cameraZ=-(view[8]*view[12]+view[9]*view[13]+view[10]*view[14]);
  const range=Math.hypot(cameraX-bustPlacement.x,cameraZ-bustPlacement.z);
  const targetLod=worldTransform||range<23?0:range<52?1:2;
  const level=bustLevels[targetLod]||bustLevels[1]||bustLevels[0];
  bustLastLod=bustLevels.indexOf(level);
  gl.useProgram(modelProgram);
  gl.uniformMatrix4fv(MU('uView'), false, view); gl.uniformMatrix4fv(MU('uProj'), false, projection);
  gl.uniform3f(MU('uOrigin'),bustPlacement.x,worldTransform?(Number(manifest.floor)||0):bustPlacement.floor,bustPlacement.z);
  gl.uniform1f(MU('uScale'), bustPlacement.scale);
  gl.uniform3fv(MU('uModelToTape'),BUST_RELIQUARY_RIG.worldToTapeScale);
  const descriptor=bustPlacement.performance||{clip:bustPlacement.eyes?'settled':'blind',time:1,loop:false};
  bustPose=sampleCharacterPose(level.asset,level.asset.entries[0],descriptor);
  gl.uniform1f(MU('uCharacterEnabled'),1);gl.uniformMatrix4fv(MU('uCharacterBones[0]'),false,bustPose.bones);
  gl.activeTexture(gl.TEXTURE7);gl.bindTexture(gl.TEXTURE_2D,bustMorphTexture);gl.uniform1i(MU('uCharacterMorphTex'),7);
  gl.uniform2i(MU('uCharacterMorphSize'),1,1);gl.uniform1i(MU('uCharacterVertexCount'),0);gl.uniform1i(MU('uCharacterMorphCount'),0);
  gl.uniform4fv(MU('uCharacterMorphWeights'),new Float32Array(4));
  gl.uniform1f(MU('uCeremony'),descriptor.routeOpen?1:0);
  gl.uniform3fv(MU('uWorldScale'),worldTransform?.scale||[1,1,1]);
  gl.uniform3fv(MU('uWorldOffset'),worldTransform?.offset||[0,0,0]);
  gl.uniform1f(MU('uRecognized'), bustPlacement.eyes ? 1 : 0);
  gl.uniform1f(MU('uReturned'), bustPlacement.eyeMode === 'returned' ? 1 : 0);
  gl.uniform1f(MU('uExposure'),worldTransform?Math.max(.40,exposure):Math.max(0.08,exposure*(1-collapse*.92)));
  gl.uniform1f(MU('uAlpha'),Math.max(0,Math.min(1,alpha)));
  if(alpha<.999){gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA)}else gl.disable(gl.BLEND);
  gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true);
  for (const primitive of level.primitives) {
    if(primitive.role===3&&!(bustPlacement.eyeMode==='returned'&&bustPlacement.eyes))continue;
    gl.bindVertexArray(primitive.vao);
    gl.uniform4fv(MU('uBaseColor'), primitive.base); gl.uniform3fv(MU('uEmissive'), primitive.emissive);
    gl.uniform1f(MU('uRole'), primitive.role);
    gl.uniform1f(MU('uMetallic'),primitive.metallic);gl.uniform1f(MU('uRoughness'),primitive.roughness);
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
  band = null, bandAhead = null, aheadZ = 96, far = 300, near = 300, towerPath = [], pathOnly = false,
  worldTransform = null,
} = {}) {
  if (!gl || !groundProgram || !view || !projection) return false;
  const here = band || { centre: 0, reach: 24 };
  const ahead = bandAhead || here;
  const y = floorY == null ? (Number(manifest?.floor) || 0) - (Number(manifest?.span?.y) || 40) * 0 : floorY;
  gl.useProgram(groundProgram);
  gl.bindVertexArray(vao);
  gl.uniformMatrix4fv(GU('uView'), false, view);
  gl.uniformMatrix4fv(GU('uProj'), false, projection);
  gl.uniform3fv(GU('uWorldScale'),worldTransform?.scale||[1,1,1]);
  gl.uniform3fv(GU('uWorldOffset'),worldTransform?.offset||[0,0,0]);
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
  gl.uniform1f(GU('uPathOpen'), towerPath.length===4?1:0);
  gl.uniform1f(GU('uPathOnly'),pathOnly?1:0);
  gl.uniform2fv(GU('uPath[0]'),new Float32Array(Array.from({length:4},(_,i)=>[towerPath[i]?.x||0,-(towerPath[i]?.depth||0)]).flat()));
  if(pathOnly){gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);}
  else gl.disable(gl.DEPTH_TEST);
  gl.depthMask(false);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  // The path overlay runs after the video, so it must leave the same state as
  // that pass: writable depth for the next clear/GLB draw, no fullscreen depth
  // test, and no inherited blending in a subsequent physical scene.
  gl.depthMask(true);
  gl.disable(gl.BLEND);
  gl.disable(gl.DEPTH_TEST);
  gl.bindVertexArray(null);
  return true;
}

export function horizonRender({
  view, projection, slice = 0, reach = 44, behind = reach,
  collapse = 0, boil = 0, exposure = 1, nearFade = 9, floorCut = -1e9,
  mosh = 1, curtain = 1, shimmer = 0, veil = 1.7, bore = null, dream = 0,
  worldTransform = null, unravelling = null, street = null, entryReveal = 1,
  bustExposure = exposure, bustAlpha = 1,
} = {}) {
  bore = {
    centre: 0, centreAhead: 0, reach: 24, reachAhead: 24,
    z: 0, aheadZ: 110, axisY: floorCut, height: 22, amount: 0,
    ...(bore || {}),
  };
  horizonStats.calls += 1;
  horizonStats.draws = 0; horizonStats.instances = 0; horizonStats.skipped = 0; horizonStats.bail = null; horizonStats.glErrors=[];
  if (!ready || !gl || !program || !view || !projection) {
    horizonStats.bail = `ready=${ready} gl=${!!gl} program=${!!program} view=${!!view} proj=${!!projection}`;
    return false;
  }
  const here = Math.round(slice);
  const first = Math.max(0, here - behind);
  const last = Math.min(manifest.slices - 1, here + reach);
  if (last < first) { horizonStats.bail = `empty range ${first}..${last}`; return false; }

  gl.useProgram(program);
  gl.uniform1f(U('uDream'),Math.max(0,Math.min(1,dream)));
  gl.uniform1f(U('uEntryReveal'),Math.max(0,Math.min(1,entryReveal)));
  gl.bindVertexArray(vao);
  gl.uniformMatrix4fv(U('uView'), false, view);
  gl.uniformMatrix4fv(U('uProj'), false, projection);
  gl.uniform3fv(U('uWorldScale'),worldTransform?.scale||[1,1,1]);
  gl.uniform3fv(U('uWorldOffset'),worldTransform?.offset||[0,0,0]);
  gl.uniform3fv(U('uDamageOrigin'),worldTransform?[worldTransform.offset[0],floorCut,worldTransform.offset[2]]:[0,0,0]);
  gl.uniform1f(U('uWorldActive'),worldTransform?1:0);
  gl.uniform2f(U('uUnravelling'),unravelling?.amount||0,unravelling?.loss||0);
  gl.uniform1f(U('uStreetRetention'),Math.max(0,1-(unravelling?.amount||0)));
  gl.uniform2f(U('uSceneRes'),street?.width||1,street?.height||1);
  gl.uniform2f(U('uStreetNearFar'),street?.near||.05,street?.far||90);
  gl.activeTexture(gl.TEXTURE6);gl.bindTexture(gl.TEXTURE_2D,street?.color||null);gl.uniform1i(U('uStreet'),6);
  gl.activeTexture(gl.TEXTURE7);gl.bindTexture(gl.TEXTURE_2D,street?.depth||null);gl.uniform1i(U('uStreetDepth'),7);
  gl.uniform1f(U('uPosScale'), manifest.posScale);
  gl.uniform1f(U('uSizeScale'), manifest.sizeScale);
  gl.uniform1f(U('uBoil'), boil);
  gl.uniform1f(U('uMosh'), Math.max(0, Math.min(2, mosh)));
  gl.uniform1f(U('uCurtain'), Math.max(0.25, Math.min(6, curtain)));
  gl.uniform1f(U('uShimmer'), Math.max(0, Math.min(4, shimmer)));
  gl.uniform1f(U('uVeil'), Math.max(0.05, Math.min(3, veil)));
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
    if (bustAlpha > 0.001) drawHorizonBust(view, projection, bustExposure, collapse, worldTransform, bustAlpha);
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
  // Capture these before the pixel mesh clears the GL error queue. The probe
  // can distinguish a submitted but rejected tape pass from a dark picture.
  for(let i=0;i<4;i++){
    const error=gl.getError();
    if(!error)break;
    horizonStats.glErrors.push(error);
  }
  return true;
}
