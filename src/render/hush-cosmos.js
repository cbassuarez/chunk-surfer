// HUSH reveals a stationary, infinitely distant field. Its body is the moving
// mask; stars belong to world directions and never follow the actor, camera
// rotation, surface UVs, elapsed time, or the output viewport.
export const HUSH_COSMOS = Object.freeze({
  revision: 'world-fixed-violet-stellar-3',
  darkInk: Object.freeze([.004, .0007, .016]),
  violetInk: Object.freeze([.26, .035, .56]),
  stellarInk: Object.freeze([.98, .79, 1]),
  space: 'world-direction',
});
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const mix = (a, b, t) => a + (b - a) * t;
const fract = v => v - Math.floor(v);
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
function unit(value) {
  if ((!Array.isArray(value) && !ArrayBuffer.isView(value)) || value.length < 3 || ![value[0], value[1], value[2]].every(Number.isFinite))
    throw TypeError('HUSH requires a finite three-dimensional world direction.');
  const length = Math.hypot(value[0], value[1], value[2]);
  if (length < 1e-12) throw TypeError('HUSH requires a nonzero world direction.');
  return [value[0] / length, value[1] / length, value[2] / length];
}
function hash(p) {
  let x = fract(p[0] * .1031), y = fract(p[1] * .103), z = fract(p[2] * .0973);
  const dot = x * (y + 33.33) + y * (x + 33.33) + z * (z + 33.33);
  x += dot; y += dot; z += dot;
  return fract((x + y) * z);
}
function noise(p) {
  const cell = p.map(Math.floor), u = p.map(v => { const f = fract(v); return f * f * (3 - 2 * f); });
  const h = (x, y, z) => hash([cell[0] + x, cell[1] + y, cell[2] + z]);
  return mix(mix(mix(h(0, 0, 0), h(1, 0, 0), u[0]), mix(h(0, 1, 0), h(1, 1, 0), u[0]), u[1]),
    mix(mix(h(0, 0, 1), h(1, 0, 1), u[0]), mix(h(0, 1, 1), h(1, 1, 1), u[0]), u[1]), u[2]);
}
function star(p, plane, footprint) {
  const cell = p.map(Math.floor), seed = hash([cell[0], cell[1], plane]);
  if (seed < .70) return 0;
  const cx = .26 + .48 * hash([cell[0] + 19.1, cell[1] - 7.3, plane + 2.7]);
  const cy = .26 + .48 * hash([cell[0] - 11.7, cell[1] + 8.9, plane + 6.1]);
  const radius = .09 + .07 * hash([cell[0] + 3.1, cell[1] + 4.7, plane + 1.8]);
  const distance = Math.hypot(fract(p[0]) - cx, fract(p[1]) - cy), aa = clamp(footprint, .004, .16);
  const coverage = 1 - smooth(Math.max(0, radius - aa * .5), radius + aa * .5, distance);
  return coverage * (.72 + .28 * seed);
}
// The observed 3.2 m front camera looks along +Z. Put its broad fractured
// landmark in that world direction once; it never turns to follow HUSH.
const rawNova = [[.015, -.12, 1], [.72, -.19, .67], [-.75, .34, -.56]];
export const HUSH_COSMOS_NOVAE = Object.freeze(rawNova.map(value => Object.freeze(unit(value))));
const novaScales = [.075, .065, .047];
function nova(d, centre, scale) {
  const delta = d.map((v, i) => v - centre[i]);
  if (Math.hypot(...delta) > scale * 5) return 0;
  const right = unit([centre[2], 0, -centre[0]]), up = [
    centre[1] * right[2] - centre[2] * right[1],
    centre[2] * right[0] - centre[0] * right[2],
    centre[0] * right[1] - centre[1] * right[0],
  ];
  const x = d.reduce((sum, value, i) => sum + value * right[i], 0) / scale;
  const y = d.reduce((sum, value, i) => sum + value * up[i], 0) / scale;
  const r = Math.hypot(x, y), angle = Math.atan2(y, x + 1e-8);
  const shellRadius = 1 + .13 * Math.sin(angle * 7 + .7) + .065 * Math.sin(angle * 13);
  const broken = .16 + .84 * smooth(-.35, .55, Math.sin(angle * 5 + 1.2) + .3 * Math.sin(angle * 11));
  const gap = (r - shellRadius) / .24, shell = Math.exp(-gap * gap) * broken * .72;
  const rays = Math.abs(Math.sin(angle * 4 + .6)) ** 12 * Math.exp(-r * 1.4) * .55;
  return clamp(Math.exp(-r * r * 34) + shell + rays + .1 * Math.exp(-r * r * .5));
}

// One scalar survives the existing five-bit material transport. All renderers
// reconstruct this palette from that same scalar; POST cannot paint new stars.
export function hushCosmosSignalMaterial(signal) {
  const s = clamp(Number.isFinite(signal) ? signal : 0), cloud = smooth(.015, .42, s), heat = smooth(.52, .98, s);
  const color = HUSH_COSMOS.darkInk.map((v, i) => mix(mix(v, HUSH_COSMOS.violetInk[i], cloud), HUSH_COSMOS.stellarInk[i], heat));
  return { color, heat };
}

export function hushCosmosWorldField(worldDirection, { footprint = 1 / 1600 } = {}) {
  const d = unit(worldDirection), scale = 74;
  const weights = d.map(v => Math.abs(v) ** 6), peakWeight = Math.max(...weights);
  const aa = Math.max(0, Number.isFinite(footprint) ? footprint : 1 / 1600) * scale;
  const stars = Math.max(
    star([d[1] * scale + 13, d[2] * scale + 7], 1, aa) * weights[0] / peakWeight,
    star([d[2] * scale - 9, d[0] * scale + 21], 2, aa) * weights[1] / peakWeight,
    star([d[0] * scale + 17, d[1] * scale - 11], 3, aa) * weights[2] / peakWeight,
  );
  const cloud = noise(d.map((v, i) => v * 4.3 + [3.7, 1.2, 7.9][i]));
  const nebula = .018 + .32 * smooth(.25, .82, cloud);
  let explosion = 0;
  for (let i = 0; i < HUSH_COSMOS_NOVAE.length; i++) explosion = Math.max(explosion, nova(d, HUSH_COSMOS_NOVAE[i], novaScales[i]));
  const signal = clamp(nebula + Math.max(stars, explosion));
  const material = hushCosmosSignalMaterial(signal), result = [...material.color, signal];
  // Named aliases retain the useful CPU-study interface without changing the
  // actual vec4 ordering used by the production shader.
  Object.defineProperties(result, { color: { value: material.color }, signal: { value: signal }, heat: { value: material.heat } });
  return result;
}
export const hushCosmosField = hushCosmosWorldField;

export function hushCosmosRecordedInk(recorded, signal = 0) {
  const mark = Math.max(...recorded) > .08 ? 1 : 0, t = smooth(.02, .98, clamp(signal));
  const light = [.22, .04, .42].map((value, i) => mix(value, HUSH_COSMOS.stellarInk[i], t));
  return HUSH_COSMOS.darkInk.map((value, i) => mix(value, light[i], mark));
}

export const HUSH_COSMOS_GLSL = `
float hushCosmosHash(vec3 p){
 p=fract(p*vec3(.1031,.103,.0973));p+=dot(p,p.yxz+33.33);
 return fract((p.x+p.y)*p.z);
}
float hushCosmosNoise(vec3 p){
 vec3 i=floor(p),f=fract(p),u=f*f*(3.0-2.0*f);
 return mix(mix(mix(hushCosmosHash(i),hushCosmosHash(i+vec3(1,0,0)),u.x),
  mix(hushCosmosHash(i+vec3(0,1,0)),hushCosmosHash(i+vec3(1,1,0)),u.x),u.y),
  mix(mix(hushCosmosHash(i+vec3(0,0,1)),hushCosmosHash(i+vec3(1,0,1)),u.x),
  mix(hushCosmosHash(i+vec3(0,1,1)),hushCosmosHash(i+vec3(1,1,1)),u.x),u.y),u.z);
}
float hushCosmosStar(vec2 p,float plane,float aa){
 vec2 i=floor(p);float seed=hushCosmosHash(vec3(i,plane));
 if(seed<.70)return 0.0;
 vec2 centre=.26+.48*vec2(hushCosmosHash(vec3(i+vec2(19.1,-7.3),plane+2.7)),hushCosmosHash(vec3(i+vec2(-11.7,8.9),plane+6.1)));
 float radius=.09+.07*hushCosmosHash(vec3(i+vec2(3.1,4.7),plane+1.8));
 aa=clamp(aa,.004,.16);
 return (1.0-smoothstep(max(0.0,radius-aa*.5),radius+aa*.5,length(fract(p)-centre)))*(.72+.28*seed);
}
float hushCosmosNova(vec3 d,vec3 centre,float scale){
 if(length(d-centre)>scale*5.0)return 0.0;
 vec3 right=normalize(vec3(centre.z,0.0,-centre.x)),up=cross(centre,right);
 vec2 q=vec2(dot(d,right),dot(d,up))/scale;
 float r=length(q),a=atan(q.y,q.x+1e-8);
 float shellRadius=1.0+.13*sin(a*7.0+.7)+.065*sin(a*13.0);
 float broken=.16+.84*smoothstep(-.35,.55,sin(a*5.0+1.2)+.3*sin(a*11.0));
 float gap=(r-shellRadius)/.24,shell=exp(-gap*gap)*broken*.72;
 float rays=pow(abs(sin(a*4.0+.6)),12.0)*exp(-r*1.4)*.55;
 return clamp(exp(-r*r*34.0)+shell+rays+.1*exp(-r*r*.5),0.0,1.0);
}
vec4 hushCosmosSignalMaterial(float signal){
 float s=clamp(signal,0.0,1.0),cloud=smoothstep(.015,.42,s),heat=smoothstep(.52,.98,s);
 vec3 color=mix(mix(vec3(.004,.0007,.016),vec3(.26,.035,.56),cloud),vec3(.98,.79,1.0),heat);
 return vec4(color,heat);
}
vec4 hushCosmosWorldField(vec3 worldDirection){
 vec3 d=normalize(worldDirection),w=pow(abs(d),vec3(6.0));w/=max(w.x,max(w.y,w.z));
 vec2 x=d.yz*74.0+vec2(13,7),y=d.zx*74.0+vec2(-9,21),z=d.xy*74.0+vec2(17,-11);
 float stars=max(hushCosmosStar(x,1.0,length(fwidth(x)))*w.x,max(hushCosmosStar(y,2.0,length(fwidth(y)))*w.y,hushCosmosStar(z,3.0,length(fwidth(z)))*w.z));
 float cloud=hushCosmosNoise(d*4.3+vec3(3.7,1.2,7.9)),nebula=.018+.32*smoothstep(.25,.82,cloud);
 float explosion=max(hushCosmosNova(d,normalize(vec3(.015,-.12,1.0)),.075),max(hushCosmosNova(d,normalize(vec3(.72,-.19,.67)),.065),hushCosmosNova(d,normalize(vec3(-.75,.34,-.56)),.047)));
 float signal=clamp(nebula+max(stars,explosion),0.0,1.0);
 return vec4(hushCosmosSignalMaterial(signal).rgb,signal);
}
`;
export const HUSH_COSMOS_INK_GLSL = `
${HUSH_COSMOS_GLSL}
vec3 hushCosmosRecordedInk(vec3 recorded,float signal){
 float mark=step(.08,max(recorded.r,max(recorded.g,recorded.b)));
 vec3 ink=mix(vec3(.22,.04,.42),vec3(.98,.79,1.0),smoothstep(.02,.98,clamp(signal,0.0,1.0)));
 return mix(vec3(.004,.0007,.016),ink,mark);
}
`;

// Three's secondary view follows the same direction after morphing, skinning,
// batching and instancing. Viewport metadata remains solely for older setters;
// neither the vertex nor fragment treatment reads it.
const installedMaterials = new WeakSet();
export function installHushCosmosMaterial(material) {
  if (!material || typeof material !== 'object') throw TypeError('A Hush material is required.');
  if (installedMaterials.has(material)) return material;
  const previous = material.onBeforeCompile, viewport = { value: { x: 1, y: 1 } };
  material.onBeforeCompile = function (shader, renderer) {
    previous?.call(this, shader, renderer);
    if (!shader.vertexShader.includes('#include <project_vertex>') || !shader.fragmentShader.includes('#include <color_fragment>'))
      throw Error('The Hush material no longer has its post-deformation world-position hooks.');
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vHushCosmosWorld;')
      .replace('#include <project_vertex>', `#include <project_vertex>
vec4 hushWorld=vec4(transformed,1.0);
#ifdef USE_BATCHING
 hushWorld=batchingMatrix*hushWorld;
#endif
#ifdef USE_INSTANCING
 hushWorld=instanceMatrix*hushWorld;
#endif
vHushCosmosWorld=(modelMatrix*hushWorld).xyz;`);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', `#include <common>\nvarying vec3 vHushCosmosWorld;\n${HUSH_COSMOS_GLSL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>
vec4 hushField=hushCosmosWorldField(normalize(vHushCosmosWorld-cameraPosition));
// Retain the secondary acquisition's violet identity with the transported signal.
diffuseColor.rgb=vec3(.85,.08,1.0)*hushField.a;`);
  };
  material.customProgramCacheKey = () => HUSH_COSMOS.revision;
  material.userData = { ...material.userData, hushCosmos: { revision: HUSH_COSMOS.revision, space: 'world-direction', clock: false, viewport } };
  material.toneMapped = false; material.fog = false; material.needsUpdate = true;
  installedMaterials.add(material);
  return material;
}
