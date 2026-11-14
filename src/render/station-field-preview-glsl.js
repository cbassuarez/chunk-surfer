// Cheap window into the same field coordinates used by station-field-scene.
// This is a portal preview, not the occupied renderer: inside uses the actual
// memory-field meshes. No fullscreen SDF marching for the ordinary field doors.
import {MEMORY_FIELD_ANT,MEMORY_FIELD_VISITS} from '../data/memory-field.js';
const f=n=>Number.isInteger(n)?`${n}.0`:String(n);
const suns=MEMORY_FIELD_VISITS.slice(0,4).map(v=>{const c=Math.cos(v.sunAlt);return`vec3(${[Math.sin(v.sunAz)*c,Math.sin(v.sunAlt),-Math.cos(v.sunAz)*c].map(f).join(',')})`;});
const slab=MEMORY_FIELD_ANT.slab;
export const STATION_FIELD_PREVIEW_GLSL=`
float sfBoxHit(vec3 ro,vec3 rd,vec3 lo,vec3 hi){
 vec3 inv=vec3(1.0)/mix(vec3(.00001),rd,greaterThan(abs(rd),vec3(.00001)));
 vec3 a=(lo-ro)*inv,b=(hi-ro)*inv,mn=min(a,b),mx=max(a,b);
 float near=max(mn.x,max(mn.y,mn.z)),far=min(mx.x,min(mx.y,mx.z));
 return far>=max(0.0,near)?max(.001,near):1e6;
}
vec3 sfFieldPreview(vec3 stationEye,vec3 stationRay,int variant,float time,float calm,out float hit){
 vec3 ro=vec3(stationEye.x,stationEye.y,3.0-stationEye.z),rd=vec3(stationRay.x,stationRay.y,-stationRay.z);
 int index=clamp(variant-10,0,3);
 vec3 suns[4]=vec3[4](${suns.join(',')});
 vec3 sun=suns[index];float days[4]=float[4](.1,.36,.6,.82),day=days[index],late=smoothstep(.55,1.0,day);
 vec3 zen=mix(mix(vec3(.25,.46,.78),vec3(.13,.37,.84),smoothstep(0.0,.4,day)),vec3(.20,.19,.44),late);
 vec3 hor=mix(mix(vec3(.93,.90,.80),vec3(.75,.87,.97),smoothstep(0.0,.4,day)),vec3(1.0,.56,.26),late);
 vec3 sky=mix(hor,zen,pow(smoothstep(-.02,.72,rd.y),.62));
 float angle=acos(clamp(dot(rd,sun),-1.0,1.0)),sr=.035*(index==3?1.7:1.0);
 sky+=mix(vec3(1.0,.94,.78),vec3(1.0,.55,.28),late)*exp(-angle/(sr*5.0))*.9;
 sky+=vec3(1.0,.96,.86)*exp(-angle/.55)*.22;
 sky=mix(sky,vec3(1.6,1.55,1.4),1.0-smoothstep(sr*.92,sr*1.02,angle));
 float az=atan(rd.z,rd.x);
 float hill=(max(4.0,20.0+9.0*sin(az*2.0+.8)+11.0*sin(az*4.0-1.2)+4.0*sin(az*9.0+.7))-ro.y)/310.0;
 hit=rd.y<-.0001?-ro.y/rd.y:1e6;vec3 col=sky;
 bool ridge=rd.y>(-.6-ro.y)/241.0&&rd.y<hill;
 if(ridge){hit=286.0;col=mix(vec3(.027,.042,.043),sky*.33,smoothstep(-.02,hill,rd.y)*.47);}
 if(!ridge&&hit>0.0&&hit<900.0){
  vec3 p=ro+rd*hit;vec2 flowerGrid=p.xz*4.0;float grain=ewNoise(p.xz*2.2),growth=ewNoise(p.xz*.25);
  float petal=step(.91,ewHash(floor(flowerGrid)))*smoothstep(.36,.64,growth)*(1.0-smoothstep(.035,.12,length(fract(flowerGrid)-.5)))*(1.0-smoothstep(12.0,60.0,hit));
  // The preview is acquired under Source's brighter host exposure. Feed
  // it a correspondingly lower radiance to match the occupied meadow.
  col=mix(vec3(.021,.036,.011),vec3(.061,.087,.022),grain*.40+growth*.60);
  col=mix(col,vec3(.23,.21,.16),petal*.84);
  col=mix(col,sky*.29,1.0-exp(-hit*.004));
 }
 // The fence is at exactly x=-14; its posts/wires share field dimensions.
 if(abs(rd.x)>.0001){
  float d=(-14.0-ro.x)/rd.x;vec3 p=ro+rd*d;
  float post=1.0-step(.065,abs(mod(p.z+2.0,4.0)-2.0));
  float wire=1.0-step(.012,min(abs(p.y-.42),min(abs(p.y-.78),abs(p.y-1.1))));
  if(d>0.0&&d<hit&&p.y>0.0&&p.y<1.18&&max(post,wire)>.5){hit=d;col=vec3(.092,.073,.040);}
 }
 if(index==1){
  mat2 toSlab=mat2(${f(Math.cos(slab.yaw))},${f(Math.sin(slab.yaw))},${f(-Math.sin(slab.yaw))},${f(Math.cos(slab.yaw))});
  vec2 q=toSlab*(ro.xz-vec2(${f(slab.x)},${f(slab.z)}));
  vec2 v=toSlab*rd.xz;
  vec3 localEye=vec3(q.x,ro.y,q.y),localRay=vec3(v.x,rd.y,v.y);
  float d=sfBoxHit(localEye,localRay,vec3(${f(-slab.halfX)},0.0,${f(-slab.halfZ)}),vec3(${f(slab.halfX)},${f(slab.height)},${f(slab.halfZ)}));
  if(d<hit){
   hit=d;vec3 p=localEye+localRay*d;
   float split=mix(.08,-.058,smoothstep(-.31,.26,p.x))-.04*exp(-p.x*p.x*24.0)+.005*sin(p.x*106.0);
   float crack=1.0-smoothstep(.004,.01,abs(p.z-split));
   float aggregate=ewNoise(p.xz*160.0);
   col=mix(vec3(.095,.09,.069),vec3(.20,.18,.141),aggregate);
   col=mix(col,vec3(.031,.023,.015),crack*.85);
  }
 }
 vec2 door=index==1?vec2(16.0,-210.0):index==2?vec2(3.0,-24.0):vec2(.5,-7.0);
 if(index>0){float d=sfBoxHit(ro,rd,vec3(door.x-.62,0.0,door.y-.05),vec3(door.x+.62,2.05,door.y+.05));
  if(d<hit){hit=d;vec3 p=ro+rd*d;col=p.y>1.18&&p.y<1.88?vec3(.14,.22,.24):vec3(.74,.75,.69);}}
 if(index==0){float d=sfBoxHit(ro,rd,vec3(-7.8,.75,-15.1),vec3(-7.2,1.45,-14.9));if(d<hit){hit=d;col=vec3(.88,.9,.85);}}
 return col;
}
vec3 sfCoastPreview(vec3 ro,vec3 rd,out float hit){
 vec3 sky=mix(vec3(.31,.39,.44),vec3(.12,.19,.26),smoothstep(-.1,.85,rd.y));
 hit=rd.y<-.0001?-ro.y/rd.y:1e6;if(hit<=0.0||hit>900.0)return sky;
 vec3 p=ro+rd*hit;float shore=smoothstep(18.0,32.0,p.z);
 float stones=ewNoise(p.xz*8.0),ripple=sin(p.z*2.2+p.x*.15)*.02;
 vec3 land=mix(vec3(.11,.13,.13),vec3(.30,.29,.25),stones),sea=vec3(.055,.13,.16)+ripple;
 return mix(mix(land,sea,shore),sky,1.0-exp(-hit*.009));
}
`;
