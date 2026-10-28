// Rain and these uniforms share r3d's half-metre cell coordinates. The roof
// belongs to the rendered bus, including the recording-pattern translation.
import { OUTSKIRTS_BUS_PASSAGE as BUS } from '../data/outskirts-bus-passage.js';

const ROOF = BUS.rainRoof;
const ROOT_STEPS = 16;
const EPSILON = 1e-7;
const disabled = () => ({ uBusRainRoof: new Float32Array(4), uBusRainFrame: new Float32Array([1, 0, 0, 0]) });

// Sky fill falls away as the rendered eye passes beneath the bus roof. This
// is spatial shelter, not a timed exposure cut or a switch on the whole rain.
export function outskirtsBusInteriorLightMix(eye,origin){
  if(!origin||!Array.isArray(eye)||![...eye,origin.x,origin.y,origin.z,origin.yaw].every(Number.isFinite))return 0;
  const dx=eye[0]-origin.x,dz=eye[2]-origin.z,c=Math.cos(origin.yaw),s=Math.sin(origin.yaw);
  const x=dx*c-dz*s,z=dx*s+dz*c,y=eye[1]-origin.y;
  if(y<BUS.floor||y>ROOF.eaves+ROOF.rise)return 0;
  const t=Math.max(0,Math.min(1,Math.min(ROOF.halfWidth-Math.abs(x),z-ROOF.frontZ,ROOF.backZ-z)/.35));
  return t*t*(3-2*t);
}

/** Centres/base are cells; the optional pattern translation alone is metres.
 * baseYCells is the model origin/ground, before its .5m saloon floor offset.
 * Use the rendered bus pose, never its nominal logical pass or camera pose.
 */
export function outskirtsBusRainUniforms(value = {}) {
  const { centreXCells, centreZCells, baseYCells, yaw, enabled = true,
    patternOriginOffsetMetres = { x: 0, z: 0 } } = value || {};
  if (!patternOriginOffsetMetres || typeof patternOriginOffsetMetres !== 'object'
    || Array.isArray(patternOriginOffsetMetres)) return disabled();
  const ox = patternOriginOffsetMetres?.x ?? 0, oz = patternOriginOffsetMetres?.z ?? 0;
  if (!enabled || ![centreXCells, centreZCells, baseYCells, yaw, ox, oz].every(Number.isFinite)) return disabled();
  const result = {
    uBusRainRoof: new Float32Array([centreXCells + ox * 2, centreZCells + oz * 2, baseYCells, 1]),
    uBusRainFrame: new Float32Array([Math.cos(yaw), Math.sin(yaw), 0, 0]),
  };
  return [...result.uBusRainRoof, ...result.uBusRainFrame].every(Number.isFinite) ? result : disabled();
}

const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
function clipSlab(a, delta, low, high, range) {
  if (Math.abs(delta) < EPSILON) return a >= low && a <= high;
  const p = (low - a) / delta, q = (high - a) / delta;
  range[0] = Math.max(range[0], Math.min(p, q));
  range[1] = Math.min(range[1], Math.max(p, q));
  return range[1] > range[0] + EPSILON;
}

function shelteredInterval(a, b, uniforms) {
  const u = uniforms?.uBusRainRoof, frame = uniforms?.uBusRainFrame;
  if (!u || !frame || u[3] < .5 || ![...u, ...frame].every(Number.isFinite)) return null;
  const c = frame[0], s = frame[1];
  const local = p => {
    const x = (p[0] - u[0]) * .5, z = (p[2] - u[1]) * .5;
    return [x * c - z * s, p[1] - u[2], x * s + z * c];
  };
  const p = local(a), q = local(b), d = q.map((v, i) => v - p[i]), range = [0, 1];
  if (!clipSlab(p[0], d[0], -ROOF.halfWidth, ROOF.halfWidth, range)
    || !clipSlab(p[2], d[2], ROOF.frontZ, ROOF.backZ, range)
    || !clipSlab(p[1], d[1], BUS.floor * 2, (ROOF.eaves + ROOF.rise) * 2, range)) return null;
  const [first, last] = range;
  if (Math.max(p[1] + d[1] * first, p[1] + d[1] * last) <= ROOF.eaves * 2) return range;
  const k = Math.PI / (2 * ROOF.halfWidth);
  const delta = t => p[1] + d[1] * t - 2 * (ROOF.eaves + ROOF.rise * Math.sin(k * (p[0] + d[0] * t + ROOF.halfWidth)));
  const derivative = t => d[1] - 2 * ROOF.rise * k * d[0] * Math.cos(k * (p[0] + d[0] * t + ROOF.halfWidth));
  const left = delta(first), right = delta(last);
  let witness = left <= 0 ? first : last;
  if (left > 0 && right > 0) {
    // The barrel is concave, so line-minus-roof is convex. A monotone
    // derivative finds the sole minimum, including an edge-to-edge crossing
    // whose endpoints are both above the lower eaves.
    if (derivative(first) >= 0 || derivative(last) <= 0) return null;
    let lo = first, hi = last;
    for (let i = 0; i < ROOT_STEPS; i++) {
      const t = (lo + hi) * .5;
      if (derivative(t) < 0) lo = t; else hi = t;
    }
    witness = (lo + hi) * .5;
    if (delta(witness) >= 0) return null;
  }
  const root = outside => {
    let outer = outside, inner = witness;
    for (let i = 0; i < ROOT_STEPS; i++) {
      const t = (outer + inner) * .5;
      if (delta(t) > 0) outer = t; else inner = t;
    }
    return inner;
  };
  const lo = left > 0 ? root(first) : first, hi = right > 0 ? root(last) : last;
  return hi > lo + EPSILON ? [lo, hi] : null;
}

/** Return zero, one or two visible [a,b] streaks, without mutating inputs.
 * A segment crossing both windows retains both exterior fragments.
 */
export function trimOutskirtsBusRain(a, b, uniforms) {
  if (![a, b].every(p => Array.isArray(p) && p.length === 3 && p.every(Number.isFinite))) {
    throw new TypeError('Rain streak endpoints must be finite three-component cell coordinates');
  }
  const hidden = shelteredInterval(a, b, uniforms);
  if (!hidden) return [[a.slice(), b.slice()]];
  const visible = [];
  if (hidden[0] > EPSILON) visible.push([a.slice(), mix(a, b, hidden[0])]);
  if (hidden[1] < 1 - EPSILON) visible.push([mix(a, b, hidden[1]), b.slice()]);
  return visible;
}

const f = n => Number(n).toFixed(8);
export const OUTSKIRTS_BUS_RAIN_GLSL = `
uniform vec4 uBusRainRoof;
uniform vec4 uBusRainFrame;
bool outskirtsBusRainSlab(float a,float d,float low,float high,inout float first,inout float last){
  if(abs(d)<${f(EPSILON)})return a>=low&&a<=high;
  float p=(low-a)/d,q=(high-a)/d;
  first=max(first,min(p,q));last=min(last,max(p,q));
  return last>first+${f(EPSILON)};
}
float outskirtsBusRoofDelta(vec3 p,vec3 d,float t){
  float k=3.141592653589793/${f(2 * ROOF.halfWidth)};
  return p.y+d.y*t-2.0*(${f(ROOF.eaves)}+${f(ROOF.rise)}*sin(k*(p.x+d.x*t+${f(ROOF.halfWidth)})));
}
float outskirtsBusRoofDerivative(vec3 p,vec3 d,float t){
  float k=3.141592653589793/${f(2 * ROOF.halfWidth)};
  return d.y-2.0*${f(ROOF.rise)}*k*d.x*cos(k*(p.x+d.x*t+${f(ROOF.halfWidth)}));
}
float outskirtsBusRoofRoot(vec3 p,vec3 d,float outside,float inside){
  for(int i=0;i<${ROOT_STEPS};i++){
    float t=(outside+inside)*.5;
    if(outskirtsBusRoofDelta(p,d,t)>0.0)outside=t;else inside=t;
  }
  return inside;
}
int outskirtsBusTrimRain(vec3 a,vec3 b,out vec3 a0,out vec3 b0,out vec3 a1,out vec3 b1){
  a0=a;b0=b;a1=a;b1=b;
  if(uBusRainRoof.w<.5)return 1;
  vec2 pa=(a.xz-uBusRainRoof.xy)*.5,pb=(b.xz-uBusRainRoof.xy)*.5;
  float c=uBusRainFrame.x,s=uBusRainFrame.y;
  vec3 p=vec3(pa.x*c-pa.y*s,a.y-uBusRainRoof.z,pa.x*s+pa.y*c);
  vec3 q=vec3(pb.x*c-pb.y*s,b.y-uBusRainRoof.z,pb.x*s+pb.y*c),d=q-p;
  float first=0.0,last=1.0;
  if(!outskirtsBusRainSlab(p.x,d.x,-${f(ROOF.halfWidth)},${f(ROOF.halfWidth)},first,last)
    ||!outskirtsBusRainSlab(p.z,d.z,${f(ROOF.frontZ)},${f(ROOF.backZ)},first,last)
    ||!outskirtsBusRainSlab(p.y,d.y,${f(BUS.floor * 2)},${f((ROOF.eaves + ROOF.rise) * 2)},first,last))return 1;
  if(max(p.y+d.y*first,p.y+d.y*last)>${f(ROOF.eaves * 2)}){
    float left=outskirtsBusRoofDelta(p,d,first),right=outskirtsBusRoofDelta(p,d,last);
    float witness=left<=0.0?first:last;
    if(left>0.0&&right>0.0){
      if(outskirtsBusRoofDerivative(p,d,first)>=0.0||outskirtsBusRoofDerivative(p,d,last)<=0.0)return 1;
      float lo=first,hi=last;
      for(int i=0;i<${ROOT_STEPS};i++){
        float t=(lo+hi)*.5;
        if(outskirtsBusRoofDerivative(p,d,t)<0.0)lo=t;else hi=t;
      }
      witness=(lo+hi)*.5;
      if(outskirtsBusRoofDelta(p,d,witness)>=0.0)return 1;
    }
    if(left>0.0)first=outskirtsBusRoofRoot(p,d,first,witness);
    if(right>0.0)last=outskirtsBusRoofRoot(p,d,last,witness);
  }
  if(last<=first+${f(EPSILON)})return 1;
  int pieces=0;
  if(first>${f(EPSILON)}){a0=a;b0=mix(a,b,first);pieces=1;}
  if(last<1.0-${f(EPSILON)}){
    if(pieces==0){a0=mix(a,b,last);b0=b;pieces=1;}
    else{a1=mix(a,b,last);b1=b;pieces=2;}
  }
  return pieces;
}
`;
