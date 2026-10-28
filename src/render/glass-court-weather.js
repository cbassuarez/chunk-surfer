// The roof is glass, not an open sky cell. Keep the exterior mesh underlay and
// its real street view; stop individual rain streaks at the actual roof plane.
import {GLASS_COURT as C} from '../data/glass-court.js';

export function glassCourtRoofHeightAt(x,z){
  const lx=Number(x)-C.origin.x,lz=Number(z)-C.origin.z,r=C.roofBounds;
  if(!Number.isFinite(lx)||!Number.isFinite(lz)||lx<r.x0||lx>r.x1||lz<r.z0||lz>r.z1)return null;
  const half=(r.z1-r.z0)/2;
  return C.drawnFloor+C.eaves+(C.ridge-C.eaves)*(1-Math.abs(lz-(r.z0+r.z1)/2)/half);
}
export function glassCourtCoveredAt(x,z,feet=0){
  const roof=glassCourtRoofHeightAt(x,z);
  return roof!==null&&Number.isFinite(feet)&&feet<roof-.05;
}

const f=n=>Number(n).toFixed(8);
export const GLASS_COURT_RAIN_GLSL=`
uniform float uGlassCourtRainShelter;
float glassCourtRoofCells(vec2 p){
  vec2 q=p*.5-vec2(${f(C.origin.x)},${f(C.origin.z)});
  if(q.x<${f(C.roofBounds.x0)}||q.x>${f(C.roofBounds.x1)}||q.y<${f(C.roofBounds.z0)}||q.y>${f(C.roofBounds.z1)})return -10000.0;
  float g=1.0-abs(q.y-${f((C.roofBounds.z0+C.roofBounds.z1)/2)})/${f((C.roofBounds.z1-C.roofBounds.z0)/2)};
  return 2.0*(${f(C.drawnFloor+C.eaves)}+g*${f(C.ridge-C.eaves)});
}
bool glassCourtTrimRain(inout vec3 a,inout vec3 b){
  if(uGlassCourtRainShelter<.5)return true;
  float da=a.y-glassCourtRoofCells(a.xz),db=b.y-glassCourtRoofCells(b.xz);
  if(da<=0.0&&db<=0.0)return false;
  if(da>0.0&&db<0.0)b=mix(a,b,clamp(da/(da-db),0.0,1.0));
  return true;
}
`;

// Prop-material hook, before the ordinary alpha test, lighting and dither.
// x adds sparse wet coverage; y darkens only that water. Bind the material
// flag only for `court sparse glazed reflection`, never a screen overlay.
export const GLASS_COURT_PANE_RAIN_GLSL=`
uniform float uGlassCourtRainMaterial;
uniform float uGlassCourtRainActive;
uniform vec4 uGlassCourtRainFaces[2];
uniform vec4 uGlassCourtRainMotion;
float gcRainHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float gcRainOval(vec2 p,vec2 radius){return 1.0-smoothstep(.65,1.0,length(p/radius));}
vec2 glassCourtRainFaceEvidence(vec3 world,vec3 normal){
  if(uGlassCourtRainMaterial<.5||uGlassCourtRainActive<.5||abs(normal.z)<.94)return vec2(0.0);
  vec2 result=vec2(0.0);
  for(int i=0;i<2;i++){
    vec4 face=uGlassCourtRainFaces[i];
    if(face.w<.001||abs(world.z-face.z)>.018)continue;
    vec2 q=(world.xy-face.xy)/vec2(.42,.55);
    if(abs(q.x)>1.1||abs(q.y)>1.15)continue;
    float gaze=(i==0?uGlassCourtRainMotion.y:uGlassCourtRainMotion.z)*uGlassCourtRainMotion.w;
    float stream=.018*sin(q.y*7.0+uGlassCourtRainMotion.x*.29)*uGlassCourtRainMotion.w;
    vec2 p=vec2(q.x+stream-gaze,q.y);
    float eyes=max(gcRainOval(p-vec2(-.32,.20),vec2(.19,.075)),gcRainOval(p-vec2(.32,.20),vec2(.19,.075)));
    float brow=max(gcRainOval(p-vec2(-.33,.34),vec2(.28,.055)),gcRainOval(p-vec2(.33,.34),vec2(.28,.055)));
    float nose=gcRainOval(p-vec2(.035,-.10),vec2(.055,.28));
    float cheek=max(gcRainOval(p-vec2(-.51,-.21),vec2(.035,.30)),gcRainOval(p-vec2(.51,-.21),vec2(.035,.30)));
    float mouth=gcRainOval(p-vec2(0.0,-.48+.09*p.x*p.x),vec2(.29,.037));
    // Fixed world grains arrive together; no temporal flashing or bright eyes.
    float grain=gcRainHash(floor(world.xy*180.0));
    float form=max(eyes,max(brow*.55,max(nose*.48,max(cheek*.35,mouth*.42))));
    float coverage=step(grain,face.w*form*.78)*step(.10,form);
    result=max(result,vec2(coverage,coverage*(eyes*.68+form*.12)));
  }
  return result;
}
`;
