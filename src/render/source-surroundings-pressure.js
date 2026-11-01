import {DEFAULT_SOURCE_SURROUNDINGS_GATE,normalizeSourceSurroundingsGate} from './source-surroundings-visibility.js';
import {portalInverse,portalTransformPoint,portalTransformVector,portalMultiply} from './source-mesh-portals.js';

export const SOURCE_SURROUNDINGS_PRESSURE_LIMITS=Object.freeze({waves:8,displacement:3.5,startAngle:.08});
const finite=Number.isFinite,clamp=(n,a,b)=>Math.max(a,Math.min(b,n)),TAU=Math.PI*2;
const vector=value=>Array.isArray(value)||ArrayBuffer.isView(value)?Array.from(value).slice(0,3):[value?.x,value?.y,value?.z];
const zero=()=>({stress:0,coordinate:0,displacement:[0,0,0]});
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};

// The gate is the rigid authored-to-presented frame. Origins remain authored
// metres at the API boundary; a borrowed anchor and study rotation apply once.
export function encodeSourceSurroundingsPressure(value=null){
  const gate=normalizeSourceSurroundingsGate(value?.gate),base=DEFAULT_SOURCE_SURROUNDINGS_GATE,
    origins=new Float32Array(SOURCE_SURROUNDINGS_PRESSURE_LIMITS.waves*4),fronts=new Float32Array(origins.length);
  let count=0;
  if(!value?.reducedMotion&&Array.isArray(value?.waves))for(let index=0;index<Math.min(64,value.waves.length)&&count<SOURCE_SURROUNDINGS_PRESSURE_LIMITS.waves;index++){
    const wave=value.waves[index],side=wave?.world==='fall'?1:wave?.world==='centre'?2:0;
    if(!side||![wave.age,wave.speed,wave.width,wave.strength].every(finite)||wave.age<0||wave.speed<=0||wave.width<=0||wave.strength<=0)continue;
    const origin=vector(wave.origin);if(origin.length!==3||!origin.every(finite))continue;
    const travel=side===1?wave.radius:wave.age*wave.speed;
    if(!finite(travel)||travel<0||travel>10000)continue;
    const dx=origin[0]-base.x,dz=origin[2]-base.z,at=count*4;
    origins.set([gate.x+gate.normalX*dx-gate.normalZ*dz,gate.y+origin[1]-base.y,gate.z+gate.normalZ*dx+gate.normalX*dz,side],at);
    fronts.set([travel,clamp(wave.width,1,40),clamp(wave.strength,0,1),0],at);count++;
  }
  return{count,origins,fronts,gate,reducedMotion:!!value?.reducedMotion,maximumDisplacement:SOURCE_SURROUNDINGS_PRESSURE_LIMITS.displacement};
}

// CPU twin of the shader: exercise finite fronts against actual material
// points without creating a renderer, simulation clock or free-space geometry.
export function sampleSourceSurroundingsPressure(frame,{side=0,arcRadius=0,local=[0,0,0],world=[0,0,0],matrix=null,presentationMatrix=null}={}){
  const result=zero(),p=vector(local),inverse=presentationMatrix?portalInverse(presentationMatrix):null,w=inverse?portalTransformPoint(inverse,vector(world)):vector(world);
  if(!frame||frame.reducedMotion||![1,2].includes(side)||p.length!==3||w.length!==3||![...p,...w].every(finite)||(side===2&&(!finite(arcRadius)||arcRadius<50||Math.hypot(p[0],p[1])<40)))return result;
  let direction=[0,0,0];
  for(let index=0;index<Math.min(SOURCE_SURROUNDINGS_PRESSURE_LIMITS.waves,frame.count||0);index++){
    const at=index*4;if(frame.origins[at+3]!==side)continue;
    const delta=w.map((v,k)=>v-frame.origins[at+k]),length=Math.hypot(...delta);
    const along=side===1?length:(((Math.atan2(p[1],p[0])-SOURCE_SURROUNDINGS_PRESSURE_LIMITS.startAngle)%TAU+TAU)%TAU)*arcRadius;
    const q=(along-frame.fronts[at])/frame.fronts[at+1],stress=(1-smooth(0,1,Math.abs(q)))*frame.fronts[at+2];
    if(stress<=result.stress)continue;
    result.stress=stress;result.coordinate=q;
    direction=side===1?delta.map(v=>v/Math.max(.0001,length)):[p[0]/Math.hypot(p[0],p[1]),p[1]/Math.hypot(p[0],p[1]),0];
  }
  if(!result.stress)return result;
  const s=result.stress,ripple=Math.sin(result.coordinate*Math.PI)*s;
  let displacement=side===1?direction.map((v,k)=>-2.75*v*s+(k===1?-.45*s+.45*ripple:0)):[-2.85*direction[0]*s,-2.85*direction[1]*s,.58*ripple];
  if(side===2&&matrix){
    if(inverse)matrix=portalMultiply(inverse,matrix);
    const axes=[0,4,8].map(at=>{const length=Math.hypot(matrix[at],matrix[at+1],matrix[at+2]);return[0,1,2].map(k=>matrix[at+k]/Math.max(.0001,length));});
    displacement=[0,1,2].map(k=>axes.reduce((sum,axis,j)=>sum+axis[k]*displacement[j],0));
  }
  const length=Math.hypot(...displacement),scale=Math.min(1,SOURCE_SURROUNDINGS_PRESSURE_LIMITS.displacement/Math.max(.0001,length));
  result.displacement=displacement.map(v=>v*scale);if(presentationMatrix)result.displacement=portalTransformVector(presentationMatrix,result.displacement);return result;
}

// Shared by main, reflection and shadow vertex programs. The fragment program
// samples the same finite field at the rest surface, so even a broad slab's
// interior receives the travelling material stress between its native vertices.
export const SOURCE_SURROUNDINGS_PRESSURE_GLSL=`
uniform highp int uSourceSurroundingsPressureCount;
uniform vec4 uSourceSurroundingsPressureOrigins[8],uSourceSurroundingsPressureFronts[8];
// x side, or zero for every ordinary prop and the canonical emitter aliases;
// y the nominal local XY arcade radius, never a world-horizontal ring.
uniform vec2 uSourceSurroundingsPressureShape;
uniform highp int uSourceSurroundingsPresentationActive;
uniform mat4 uSourceSurroundingsWorldToPresented,uSourceSurroundingsPresentedToWorld;
vec3 sourceSurroundingsWorldPoint(vec3 world){
  return uSourceSurroundingsPresentationActive>0?(uSourceSurroundingsPresentedToWorld*vec4(world,1.0)).xyz:world;
}
struct SourceSurroundingsPressureSample{float stress;float coordinate;vec3 direction;};
SourceSurroundingsPressureSample sourceSurroundingsPressureSample(vec3 local,vec3 world){
  SourceSurroundingsPressureSample result=SourceSurroundingsPressureSample(0.0,0.0,vec3(0.0));
  float side=uSourceSurroundingsPressureShape.x,radius=uSourceSurroundingsPressureShape.y;
  if(side<.5||uReducedMotion>.5||(side>1.5&&(radius<50.0||length(local.xy)<40.0)))return result;
  world=sourceSurroundingsWorldPoint(world);
  for(int i=0;i<8;i++){
    if(i>=uSourceSurroundingsPressureCount)break;
    vec4 origin=uSourceSurroundingsPressureOrigins[i],front=uSourceSurroundingsPressureFronts[i];
    if(abs(origin.w-side)>.1)continue;
    vec3 delta=world-origin.xyz;float distanceM=length(delta);
    float along=side<1.5?distanceM:mod(atan(local.y,local.x)-.08+6.28318530718,6.28318530718)*radius;
    float q=(along-front.x)/max(1.0,front.y),stress=(1.0-smoothstep(0.0,1.0,abs(q)))*front.z;
    if(stress<=result.stress)continue;
    result.stress=stress;result.coordinate=q;
    result.direction=side<1.5?delta/max(.0001,distanceM):vec3(normalize(local.xy),0.0);
  }
  return result;
}
vec3 sourceSurroundingsPressureDisplacement(vec3 local,vec3 world,mat3 model){
  SourceSurroundingsPressureSample response=sourceSurroundingsPressureSample(local,world);
  float s=response.stress,ripple=sin(response.coordinate*3.14159265359)*s;vec3 displacement;
  if(uSourceSurroundingsPressureShape.x<1.5)displacement=-2.75*response.direction*s+vec3(0.0,-.45*s+.45*ripple,0.0);
  else{
    if(uSourceSurroundingsPresentationActive>0)model=mat3(uSourceSurroundingsPresentedToWorld)*model;
    mat3 axes=mat3(normalize(model[0]),normalize(model[1]),normalize(model[2]));
    displacement=axes*vec3(-2.85*response.direction.xy*s,.58*ripple);
  }
  displacement*=min(1.0,3.5/max(.0001,length(displacement)));
  return uSourceSurroundingsPresentationActive>0?mat3(uSourceSurroundingsWorldToPresented)*displacement:displacement;
}
`;
