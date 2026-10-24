// A bounded world medium, evaluated before the normal acquisition/dither pass.
// Depth is camera-forward distance; integration needs distance along the ray.
import { horizonCamera } from './horizon3d.js';

export const SOURCE_DEMOLITION_MEDIUM_SAMPLES = 6;
const clamp = n => Math.max(0, Math.min(1, n));
const smooth = (a, b, x) => { const t=clamp((x-a)/(b-a)); return t*t*(3-2*t); };
const fract = n => n-Math.floor(n);
const dot = (a,b) => a.reduce((n,v,i)=>n+v*b[i],0);
const finite3 = v => v?.length===3 && [...v].every(Number.isFinite);

export function sourceDemolitionMediumUniforms({medium,eye=[0,0,0],yaw=0,pitch=0,aspect=1.6}={}) {
  if(!finite3(medium?.min)||!finite3(medium?.max)||!finite3(eye)||
    !Number.isFinite(medium.progress)||medium.max.some((v,i)=>v<=medium.min[i]))return null;
  const progress=clamp(medium.progress);
  if(progress<=0)return null;
  const camera=horizonCamera({camX:eye[0],camY:eye[1],camZ:eye[2],yaw,pitch,aspect});
  return {min:[...medium.min],max:[...medium.max],progress,eye:[...eye],forward:camera.forward,
    right:[camera.view[0],camera.view[4],camera.view[8]],
    up:[camera.view[1],camera.view[5],camera.view[9]],
    inverseFocal:[1/camera.projection[0],1/camera.projection[5]]};
}

export function sourceDemolitionMediumRay(camera,uv=[.5,.5]) {
  const ray=camera.forward.map((v,i)=>v+camera.right[i]*(uv[0]*2-1)*camera.inverseFocal[0]+camera.up[i]*(uv[1]*2-1)*camera.inverseFocal[1]);
  const length=Math.hypot(...ray);
  return ray.map(v=>v/length);
}

export function sourceDemolitionMediumInterval(eye,ray,min,max,surfaceDistance=Infinity) {
  let entry=0,exit=surfaceDistance;
  for(let i=0;i<3;i++){
    if(Math.abs(ray[i])<1e-7){if(eye[i]<min[i]||eye[i]>max[i])return null;continue;}
    let a=(min[i]-eye[i])/ray[i],b=(max[i]-eye[i])/ray[i];
    if(a>b)[a,b]=[b,a];
    entry=Math.max(entry,a);exit=Math.min(exit,b);
    if(exit<=entry)return null;
  }
  return [entry,exit];
}

export function sourceDemolitionMediumDensity(p) {
  const strand=Math.abs(fract(p[0]*.071+p[1]*.037+p[2]*.043)*2-1);
  const tear=Math.abs(fract(p[0]*.139-p[1]*.113+p[2]*.097)*2-1);
  return .28+.52*smooth(.15,.86,strand)+.20*smooth(.12,.79,tear);
}

// CPU reference for geometric/continuity checks, not a substitute for live QA.
export function sourceDemolitionMediumTransmittance({camera,uv=[.5,.5],linearDepth=Infinity}={}) {
  if(!camera)return 1;
  const ray=sourceDemolitionMediumRay(camera,uv);
  const surface=linearDepth/Math.max(.0001,dot(ray,camera.forward));
  const interval=sourceDemolitionMediumInterval(camera.eye,ray,camera.min,camera.max,surface);
  if(!interval)return 1;
  const step=(interval[1]-interval[0])/SOURCE_DEMOLITION_MEDIUM_SAMPLES;
  let density=0;
  for(let i=0;i<SOURCE_DEMOLITION_MEDIUM_SAMPLES;i++){
    const t=interval[0]+(i+.5)*step;
    density+=sourceDemolitionMediumDensity(camera.eye.map((v,j)=>v+ray[j]*t));
  }
  // Consumption is already cubic-eased. The earlier square delayed visible
  // occupancy until the final fraction of the beat; a linear response instead
  // extinguishes long sky rays too abruptly at onset. This gentler power opens
  // the short-floor closure earlier while retaining a bounded sky onset.
  // Real ray length still controls depth; there is no terminal switch.
  const p=camera.progress,extinction=.035*p+12*Math.pow(p,1.5);
  return Math.exp(-density*step*extinction);
}

export const SOURCE_DEMOLITION_MEDIUM_GLSL=`
uniform float uMediumEnabled,uMediumProgress;
uniform vec3 uMediumMin,uMediumMax,uMediumEye,uMediumForward,uMediumRight,uMediumUp;
uniform vec2 uMediumInverseFocal;
float mediumDensity(vec3 p){
  float strand=abs(fract(dot(p,vec3(.071,.037,.043)))*2.0-1.0);
  float tear=abs(fract(dot(p,vec3(.139,-.113,.097)))*2.0-1.0);
  return .28+.52*smoothstep(.15,.86,strand)+.20*smoothstep(.12,.79,tear);
}
float mediumTransmission(vec2 uv,float sceneDepth){
  if(uMediumEnabled<.5)return 1.0;
  vec2 screen=(uv*2.0-1.0)*uMediumInverseFocal;
  vec3 ray=normalize(uMediumForward+uMediumRight*screen.x+uMediumUp*screen.y);
  float enter=0.0,leave=sceneDepth/max(.0001,dot(ray,uMediumForward));
  for(int axis=0;axis<3;axis++){
    if(abs(ray[axis])<.0000001){
      if(uMediumEye[axis]<uMediumMin[axis]||uMediumEye[axis]>uMediumMax[axis])return 1.0;
    }else{
      float a=(uMediumMin[axis]-uMediumEye[axis])/ray[axis];
      float b=(uMediumMax[axis]-uMediumEye[axis])/ray[axis];
      enter=max(enter,min(a,b));leave=min(leave,max(a,b));
    }
  }
  if(leave<=enter)return 1.0;
  float stepM=(leave-enter)/6.0,density=0.0;
  for(int sampleIndex=0;sampleIndex<6;sampleIndex++){
    float t=enter+(float(sampleIndex)+.5)*stepM;
    density+=mediumDensity(uMediumEye+ray*t);
  }
  float p=uMediumProgress;
  float extinction=.035*p+12.0*pow(p,1.5);
  return exp(-density*stepM*extinction);
}
`;
