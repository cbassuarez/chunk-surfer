// Shared crash-site water. Inputs are physical metres and real lamp transforms;
// the existing world depth and final acquisition still own the picture.
const IDENTITY = Object.freeze([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
const finite = (value, fallback=0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, a, b) => Math.max(a, Math.min(b, finite(value)));
const transform = (matrix, point, vector=false) => [0,1,2].map(i => matrix[i]*point[0]+matrix[i+4]*point[1]+matrix[i+8]*point[2]+(vector?0:matrix[i+12]));
// The foot scene spans dark timber/grass and pale limestone under a close
// torch. A linear gain clips the stone before the wood enters the screen.
// Meter radiance with one continuous luminance shoulder, before the unchanged
// acquisition. This preserves material hue and true black, without per-object
// exposure or camera-dependent adaptation. Values remain linear light.
export function coastalCameraResponse(rgb) {
  const input=rgb.map(value=>Math.max(0,finite(value)));
  const luminance=input[0]*.2126+input[1]*.7152+input[2]*.0722;
  return input.map(value=>value*6/(1+luminance*20));
}
function inverseSite(matrix) {
  if(!matrix || matrix.length!==16 || !Array.from(matrix).every(Number.isFinite)) return null;
  const m=Array.from(matrix), axes=[[m[0],m[1],m[2]],[m[4],m[5],m[6]],[m[8],m[9],m[10]]];
  const dot=(a,b)=>a.reduce((n,v,i)=>n+v*b[i],0);
  if(axes.some(a=>Math.abs(dot(a,a)-1)>.002)||Math.abs(dot(axes[0],axes[2]))>.002||Math.abs(m[4])+Math.abs(m[5]-1)+Math.abs(m[6])>.002) return null;
  const inverse=[m[0],m[4],m[8],0,m[1],m[5],m[9],0,m[2],m[6],m[10],0,0,0,0,1];
  const p=transform(inverse,m.slice(12,15),true);inverse.splice(12,3,...p.map(v=>-v));return inverse;
}
export function coastalWaterUniforms(frame) {
  const inverse=frame?.active ? inverseSite(frame.siteMatrix||IDENTITY) : null;
  if(!inverse) return {active:false,inverse:IDENTITY,params:[0,0,0,0],optics:[1,1],positions:new Float32Array(8),directions:new Float32Array(8)};
  const positions=new Float32Array(8),directions=new Float32Array(8);
  for(let i=0;i<2;i++) {
    const light=frame.lights?.[i];
    if(!light || !light.position?.every(Number.isFinite) || light.position.length!==3) continue;
    const p=transform(inverse,light.position), d=transform(inverse,light.direction||[0,-.1,-1],true), length=Math.hypot(...d)||1;
    positions.set([...p,clamp(light.intensity,0,12)],i*4);directions.set([...d.map(v=>v/length),clamp(light.spread??.38,.12,.8)],i*4);
  }
  const optics=[clamp(frame.waterOptics?.absorptionScale??1,.05,1),clamp(frame.waterOptics?.scatterScale??1,.02,1)];
  return {active:true,inverse,params:[1,finite(frame.waterY),finite(frame.time),clamp(frame.flood,0,1)],optics,positions,directions};
}

// CPU diagnostic of the same plane/depth ownership; it never advances a scene.
export function coastalRayWater({frame,eye,ray,surfaceDistance=400}={}) {
  const uniforms=coastalWaterUniforms(frame);if(!uniforms.active||!eye||!ray)return null;
  const origin=transform(uniforms.inverse,eye), direction=transform(uniforms.inverse,ray,true);
  if(Math.abs(direction[1])<1e-8)return null;
  const t=(uniforms.params[1]-origin[1])/direction[1], below=origin[1]<uniforms.params[1];
  if(!below&&(t<=0||t>=surfaceDistance))return null;
  const begin=below?0:t,end=below&&t>0?Math.min(t,surfaceDistance):surfaceDistance;
  return {surface:t,begin,end,length:Math.max(0,end-begin),below,point:origin.map((v,i)=>v+direction[i]*t)};
}

export const COASTAL_MEMORY_WATER_GLSL = `
uniform mat4 uCoastInverse;
uniform vec4 uCoastSea; // active, local sea level, held scene time, cabin flooding
uniform vec2 uCoastOptics; // absorption and volumetric backscatter; ordinary coast 1/1
uniform vec4 uCoastLampPosition[2],uCoastLampDirection[2];
vec3 coastCameraResponse(vec3 linear){
  linear=max(linear,vec3(0.0));
  float luminance=dot(linear,vec3(.2126,.7152,.0722));
  return linear*6.0/(1.0+luminance*20.0);
}
vec3 coastSky(vec3 rd){
  // A continuous cloud ceiling and pale sea horizon belong to the shared
  // remembered coast. Noise is angular/world-bearing, never camera pinned.
  float clock=uCoastSea.z*(1.0-uReduceMotionOptical);
  vec2 p=rd.xz/max(.20,rd.y+.38)*3.2+vec2(clock*.0016,-clock*.0009);
  float cloud=.63*vnoise(p)+.27*vnoise(p*2.13+13.7)+.10*vnoise(p*4.7-9.1);
  float openings=smoothstep(.36,.74,cloud),horizon=exp(-pow((rd.y+.018)*5.8,2.0));
  return mix(vec3(.0048,.0065,.0090),vec3(.016,.021,.026),openings)+vec3(.006,.007,.008)*horizon;
}
float coastWave(vec2 p){
  float t=uCoastSea.z*(1.0-uReduceMotionOptical);
  return .15*sin(dot(p,vec2(.19,.08))-t*.78)+.075*sin(dot(p,vec2(-.12,.31))-t*1.06)+.024*sin(dot(p,vec2(.91,.67))-t*1.9);
}
vec3 coastNormal(vec2 p){float e=.08;return normalize(vec3(coastWave(p-vec2(e,0.0))-coastWave(p+vec2(e,0.0)),2.0*e,coastWave(p-vec2(0.0,e))-coastWave(p+vec2(0.0,e))));}
float coastLamp(vec3 p,int i){
  vec3 delta=p-uCoastLampPosition[i].xyz;float r=length(delta);
  float cone=smoothstep(.72,.94,dot(delta/max(.001,r),uCoastLampDirection[i].xyz));
  return uCoastLampPosition[i].w*cone*exp(-r*.085)/(1.0+r*r*.035);
}
float coastSurfaceEscape(vec2 p,int i){
  vec3 lamp=uCoastLampPosition[i].xyz,dir=uCoastLampDirection[i].xyz;
  vec2 along=normalize(dir.xz+vec2(.00001));vec2 delta=p-lamp.xz;
  float distanceAlong=dot(delta,along),across=length(delta-along*distanceAlong);
  float radius=1.2+max(0.0,distanceAlong)*.23;
  float depth=max(.1,uCoastSea.y-lamp.y-dir.y*max(0.0,distanceAlong));
  return uCoastLampPosition[i].w*exp(-depth*.38)*exp(-across*across/(radius*radius))*smoothstep(-1.0,1.0,distanceAlong)*exp(-max(0.0,distanceAlong)*.065);
}
vec3 coastalWaterComposite(vec3 worldEye,vec3 worldRay,float opaqueRayDistance,float coverage,vec3 displayed,float cabinExit){
  if(uCoastSea.x<.5)return displayed;
  vec3 eye=(uCoastInverse*vec4(worldEye,1.0)).xyz,rd=mat3(uCoastInverse)*worldRay;
  float level=uCoastSea.y,surface=abs(rd.y)>.00001?(level-eye.y)/rd.y:-1.0;
  for(int i=0;i<3;i++)if(surface>0.0&&abs(rd.y)>.002)surface=(level+coastWave((eye+rd*surface).xz)-eye.y)/rd.y;
  float end=coverage>.001?opaqueRayDistance:400.0;bool below=eye.y<level;
  bool surfaceVisible=surface>.0&&surface<end;
  if(!below&&!surfaceVisible)return displayed;
  vec3 colour=acquisitionColour(displayed),deep=vec3(.0035,.012,.015);
  if(surfaceVisible&&!below&&coverage>.001){
    vec3 surfacePoint=eye+rd*surface,n=coastNormal(surfacePoint.xz);
    vec2 refractedUv=clamp(gl_FragCoord.xy/uRes+n.xz*.006*(1.0-clamp(-rd.y,0.0,1.0)*.65),vec2(.001),vec2(.999));
    vec4 refractedBody=texture(uProps,refractedUv);float rawDepth=texture(uDepth,refractedUv).r;
    float ndc=rawDepth*2.0-1.0;
    float refractedView=2.0*uNearFar.x*uNearFar.y/max(.0001,uNearFar.y+uNearFar.x-ndc*(uNearFar.y-uNearFar.x));
    vec3 forward=vec3(sin(uYaw)*cos(uPitch),sin(uPitch),-cos(uYaw)*cos(uPitch));
    // A displaced sample may only supply geometry genuinely below this water;
    // a nearer piece of grass or cliff never smears into the submerged car.
    if(refractedBody.a>.001&&rawDepth<.999999&&refractedView>surface*max(.001,dot(worldRay,forward))+.025)colour=refractedBody.rgb;
  }
  float begin=below?0.0:surface,waterEnd=below&&surface>0.0?min(surface,end):end;
  // A submerged van initially retains air. Its opaque interior precedes the
  // actual cabin exit, while the external water begins beyond that boundary.
  float waterBegin=max(begin,mix(max(0.0,cabinExit),0.0,uCoastSea.w));
  float travel=max(0.0,min(90.0,waterEnd-waterBegin));
  vec3 transmission=exp(-travel*vec3(.24,.075,.105)*uCoastOptics.x);
  vec3 transmitted=colour*transmission+deep*(1.0-transmission)*.75;
  vec3 scatter=vec3(0.0);float volumeBegin=max(0.0,begin-5.0),volumeEnd=min(end,max(begin+14.0,waterEnd));
  volumeEnd=min(volumeEnd,volumeBegin+65.0);
  for(int j=0;j<12;j++){
    float a=float(j)/12.0,b=float(j+1)/12.0,ds=(b*b-a*a)*(volumeEnd-volumeBegin);
    vec3 p=eye+rd*(volumeBegin+(a*a+b*b)*.5*(volumeEnd-volumeBegin));
    float depth=level+coastWave(p.xz)-p.y;
    float lamps=coastLamp(p,0)+coastLamp(p,1);
    if(depth>0.0&&length(p-eye)>=waterBegin){
      scatter+=vec3(.30,.34,.28)*lamps*ds*.028*exp(-max(0.0,depth)*.045);
    }else if(depth> -5.0&&depth<=0.0){
      float escape=coastSurfaceEscape(p.xz,0)+coastSurfaceEscape(p.xz,1);
      scatter+=vec3(.32,.29,.20)*escape*exp(depth*1.15)*ds*.009;
    }
  }
  if(surfaceVisible&&!below){
    vec3 hit=eye+rd*surface,n=coastNormal(hit.xz);
    float fres=.025+.975*pow(1.0-clamp(dot(n,-rd),0.0,1.0),5.0);
    vec3 reflected=reflect(rd,n),sky=coastSky(reflected)*(1.0+.12*n.z);
    float fold=abs(coastWave(hit.xz+vec2(.12,0.0))-2.0*coastWave(hit.xz)+coastWave(hit.xz-vec2(.12,0.0)));
    float foam=smoothstep(.003,.014,fold)*(1.0-smoothstep(65.0,210.0,surface));
    float escape=coastSurfaceEscape(hit.xz,0)+coastSurfaceEscape(hit.xz,1);
    transmitted=mix(transmitted,sky,fres*.86)+vec3(.025,.034,.033)*foam+vec3(.12,.10,.060)*escape*.065;
  }
  if(below&&cabinExit>end&&uCoastSea.w<.999){
    // Flooding intersects the real cabin in world height, instead of painting
    // a full-screen fog card over dry controls and the sea indiscriminately.
    vec3 hit=eye+rd*end;float internalLevel=level-(1.0-uCoastSea.w)*3.2;
    float wet=1.0-smoothstep(internalLevel-.04,internalLevel+.04,hit.y);
    transmitted=mix(colour,transmitted,wet);scatter*=wet;
  }
  return displayColour(transmitted+scatter*uCoastOptics.y);
}
`;
