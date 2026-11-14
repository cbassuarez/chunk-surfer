// HUSH's body is an opaque moving aperture into one quiet, infinitely distant
// field. The sparse points belong to world directions, never the actor's skin,
// elapsed time, output viewport or camera-relative screen coordinates.
export const HUSH_COSMOS = Object.freeze({
  revision: 'world-fixed-quiet-abyss-4',
  darkInk: Object.freeze([.00025, .00025, .00025]),
  stellarInk: Object.freeze([.20, .20, .20]),
  recordedInk: Object.freeze([.14, .14, .14]),
  recordedPeak: Object.freeze([.25, .25, .25]),
  space: 'world-direction',
});
// Retained as an empty compatibility export: there are no authored explosions.
export const HUSH_COSMOS_NOVAE = Object.freeze([]);
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const mix = (a, b, t) => a + (b - a) * t;
const fract = v => v - Math.floor(v);
function unit(value) {
  if ((!Array.isArray(value) && !ArrayBuffer.isView(value)) || value.length < 3 || ![value[0], value[1], value[2]].every(Number.isFinite))
    throw TypeError('HUSH requires a finite three-dimensional world direction.');
  const length = Math.hypot(value[0], value[1], value[2]);
  if (length < 1e-12) throw TypeError('HUSH requires a nonzero world direction.');
  return [value[0] / length, value[1] / length, value[2] / length];
}
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
function hash(p) {
  let x = fract(p[0] * .1031), y = fract(p[1] * .103), z = fract(p[2] * .0973);
  const dot = x * (y + 33.33) + y * (x + 33.33) + z * (z + 33.33);
  x += dot; y += dot; z += dot;
  return fract((x + y) * z);
}
function stars(p, plane, footprint) {
  const base = p.map(Math.floor), aa = Math.max(0, footprint);
  const resolved = 1 - smooth(.35, .80, aa);
  if (resolved <= 0) return 0;
  let light = 0;
  // Neighbour cells keep a filtered point continuous across lattice edges.
  // Variance broadens with the fragment footprint while peak energy falls;
  // unresolved points fade rather than turning into flickering large discs.
  for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) {
    const cell = [base[0] + x, base[1] + y], seed = hash([...cell, plane]);
    if (seed < .965) continue;
    const cx = .24 + .52 * hash([cell[0] + 19.1, cell[1] - 7.3, plane + 2.7]);
    const cy = .24 + .52 * hash([cell[0] - 11.7, cell[1] + 8.9, plane + 6.1]);
    const sigma = .032 + .012 * hash([cell[0] + 3.1, cell[1] + 4.7, plane + 1.8]);
    const variance = sigma * sigma, filtered = variance + aa * aa / 12;
    const distance2 = (p[0] - cell[0] - cx) ** 2 + (p[1] - cell[1] - cy) ** 2;
    light += Math.exp(-distance2 / (2 * filtered)) * variance / filtered * (.50 + .28 * seed);
  }
  return clamp(light * resolved);
}

// This scalar is the material payload, separate from coverage. Every renderer
// reconstructs the same neutral light BEFORE acquisition. POST only preserves
// marks that acquisition actually chose; it cannot manufacture another sky.
export function hushCosmosSignalMaterial(signal) {
  const s = clamp(Number.isFinite(signal) ? signal : 0);
  return { color: HUSH_COSMOS.darkInk.map((v, i) => mix(v, HUSH_COSMOS.stellarInk[i], s)), heat: s };
}
export function hushCosmosWorldField(worldDirection, { footprint = 1 / 1600 } = {}) {
  const d = unit(worldDirection), scale = 42;
  const weights = d.map(v => Math.abs(v) ** 6), peakWeight = Math.max(...weights);
  const aa = Math.max(0, Number.isFinite(footprint) ? footprint : 1 / 1600) * scale;
  const signal = Math.max(
    stars([d[1] * scale + 13, d[2] * scale + 7], 1, aa) * weights[0] / peakWeight,
    stars([d[2] * scale - 9, d[0] * scale + 21], 2, aa) * weights[1] / peakWeight,
    stars([d[0] * scale + 17, d[1] * scale - 11], 3, aa) * weights[2] / peakWeight,
  );
  const material = hushCosmosSignalMaterial(signal), result = [...material.color, signal];
  Object.defineProperties(result, { color: { value: material.color }, signal: { value: signal }, heat: { value: material.heat } });
  return result;
}
export const hushCosmosField = hushCosmosWorldField;

export function hushCosmosRecordedInk(recorded, signal = 0) {
  const mark = Math.max(...recorded) > .08 ? 1 : 0, s = clamp(Number.isFinite(signal) ? signal : 0);
  const light = HUSH_COSMOS.recordedInk.map((value, i) => mix(value, HUSH_COSMOS.recordedPeak[i], s));
  return HUSH_COSMOS.darkInk.map((value, i) => mix(value, light[i], mark));
}

// The half-float secondary source carries a signed sentinel, not visible ink.
// Ordinary materials are nonnegative. Unpremultiply by real coverage before
// decoding; the G payload then survives MSAA against transparent empty pixels.
export function hushCosmosEncodeTransport(signal) {
  return [-1, clamp(Number.isFinite(signal) ? signal : 0), -1];
}
export function hushCosmosDecodeTransport(raw) {
  const mask = raw[0] <= -.0001 && raw[2] <= -.0001 ? 1 : 0;
  return [mask, mask ? clamp(raw[1]) : 0];
}
export const HUSH_COSMOS_TRANSPORT_GLSL = `
vec3 hushCosmosEncodeTransport(float signal){return vec3(-1.0,clamp(signal,0.0,1.0),-1.0);}
vec2 hushCosmosDecodeTransport(vec3 raw){
 float mask=step(.0001,-raw.r)*step(.0001,-raw.b);
 return vec2(mask,clamp(raw.g,0.0,1.0)*mask);
}
`;

export const HUSH_COSMOS_GLSL = `
${HUSH_COSMOS_TRANSPORT_GLSL}
float hushCosmosHash(vec3 p){
 p=fract(p*vec3(.1031,.103,.0973));p+=dot(p,p.yxz+33.33);
 return fract((p.x+p.y)*p.z);
}
float hushCosmosStars(vec2 p,float plane,float aa){
 float resolved=1.0-smoothstep(.35,.80,aa);
 if(resolved<=0.0)return 0.0;
 vec2 base=floor(p);float light=0.0;
 for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
  vec2 cell=base+vec2(float(x),float(y));float seed=hushCosmosHash(vec3(cell,plane));
  if(seed<.965)continue;
  vec2 centre=.24+.52*vec2(hushCosmosHash(vec3(cell+vec2(19.1,-7.3),plane+2.7)),hushCosmosHash(vec3(cell+vec2(-11.7,8.9),plane+6.1)));
  float sigma=.032+.012*hushCosmosHash(vec3(cell+vec2(3.1,4.7),plane+1.8));
  float variance=sigma*sigma,filtered=variance+aa*aa/12.0;
  vec2 delta=p-cell-centre;
  light+=exp(-dot(delta,delta)/(2.0*filtered))*variance/filtered*(.50+.28*seed);
 }
 return clamp(light*resolved,0.0,1.0);
}
vec4 hushCosmosSignalMaterial(float signal){
 float s=clamp(signal,0.0,1.0);
 return vec4(vec3(mix(.00025,.20,s)),s);
}
vec4 hushCosmosWorldField(vec3 worldDirection){
 vec3 d=normalize(worldDirection),w=pow(abs(d),vec3(6.0));w/=max(w.x,max(w.y,w.z));
 vec2 x=d.yz*42.0+vec2(13,7),y=d.zx*42.0+vec2(-9,21),z=d.xy*42.0+vec2(17,-11);
 float signal=max(hushCosmosStars(x,1.0,length(fwidth(x)))*w.x,max(hushCosmosStars(y,2.0,length(fwidth(y)))*w.y,hushCosmosStars(z,3.0,length(fwidth(z)))*w.z));
 return vec4(hushCosmosSignalMaterial(signal).rgb,signal);
}
`;
export const HUSH_COSMOS_INK_GLSL = `
${HUSH_COSMOS_GLSL}
vec3 hushCosmosRecordedInk(vec3 recorded,float signal){
 float mark=step(.08,max(recorded.r,max(recorded.g,recorded.b)));
 return vec3(mix(.00025,mix(.14,.25,clamp(signal,0.0,1.0)),mark));
}
`;

// Three's secondary view follows the ray after morphing, skinning, batching
// and instancing. Signed transport is written AFTER lighting and BEFORE alpha
// premultiplication. The shared compositor reconstructs its actual dim material
// before acquisition and carries that same identity through the final dither.
const installedMaterials = new WeakSet();
export function installHushCosmosMaterial(material) {
  if (!material || typeof material !== 'object') throw TypeError('A Hush material is required.');
  if (installedMaterials.has(material)) return material;
  const previous = material.onBeforeCompile, viewport = { value: { x: 1, y: 1 } };
  material.onBeforeCompile = function (shader, renderer) {
    previous?.call(this, shader, renderer);
    if (!shader.vertexShader.includes('#include <project_vertex>') || !shader.fragmentShader.includes('#include <opaque_fragment>'))
      throw Error('The Hush material no longer has its post-deformation world-position/output hooks.');
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
      .replace('#include <opaque_fragment>', `#include <opaque_fragment>
vec4 hushField=hushCosmosWorldField(normalize(vHushCosmosWorld-cameraPosition));
gl_FragColor.rgb=hushCosmosEncodeTransport(hushField.a);`);
  };
  material.customProgramCacheKey = () => HUSH_COSMOS.revision;
  material.userData = { ...material.userData, hushCosmos: { revision: HUSH_COSMOS.revision, space: 'world-direction', clock: false, transport: 'signed-half-float-rgb', viewport } };
  material.toneMapped = false; material.fog = false; material.needsUpdate = true;
  installedMaterials.add(material);
  return material;
}
