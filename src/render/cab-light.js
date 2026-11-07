// THE LIGHT INSIDE THE VAN. Seb, 2026-11-06: the wheel and the radio read, nothing else does.
// One warm bulb at the fascia lit a round patch and left the rest black, and anything outside
// reached straight through the steel. Now every part of it has somewhere to come from:
//
//   the binnacle   a real lamp in the scene's list (scene.js), so it lands on his hands too
//   the radio      its tube, on the fascia round it, and only while it's on
//   the recorder   the same, smaller
//   the road       headlamp light off the tarmac, up through the screen onto the lining, and
//                  a little of that back down onto everything above the waist
//   the sky        on whatever under the glass looks up: mostly the top of the dash
//   anything else  comes through the glass or not at all, so a passing lamp crosses the dash
//                  as the shape of the window it came through
//
// Cab space, metres, the same as data/cab-radio.js and the cabin builder. The glass is the
// cabin's own: windscreenOpening in geometry/metrics.json, and the door glass from the cabin
// builder. The JS and the GLSL below share these numbers.
const F=n=>Number(n).toFixed(4);

export const CAB_GLASS=Object.freeze({
  screen:Object.freeze({y0:1.27,z0:-.98,y1:1.79,z1:-.36,halfBottom:.84,halfTop:.79}),
  side:Object.freeze({x:.92,y0:1.25,y1:1.79,frontBottom:-.58,frontTop:-.28,rear:.33}),
  // A lamp inside this box is inside the van, and the glass has nothing to say about it.
  inside:Object.freeze({min:Object.freeze([-.97,.35,-1.1]),max:Object.freeze([.97,2.03,.86])}),
  edge:.035,
  transmission:.42,
});
export const CAB_SOURCES=Object.freeze({
  binnacle:Object.freeze([.48,1.215,-.57]),
  radio:Object.freeze([.025,1.10,-.34]),
  recorder:Object.freeze([-.25,1.13,-.27]),
});

// What's on tonight. `road` is how much headlamp is coming back off the road. `gain` is the
// picture's exposure, which isn't the same driving as it is parked at the yard.
export function cabLightFrame({worldToCab=null,gain=1,radio=0,road=0,sky=.6}={}){
  return worldToCab?{worldToCab,gain,radio,road,sky}:null;
}
/** A rigid matrix (rotation and translation, column-major) turned round. */
export function rigidInverse(m){
  const tx=m[12],ty=m[13],tz=m[14];
  return[m[0],m[4],m[8],0,m[1],m[5],m[9],0,m[2],m[6],m[10],0,
    -(m[0]*tx+m[1]*ty+m[2]*tz),-(m[4]*tx+m[5]*ty+m[6]*tz),-(m[8]*tx+m[9]*ty+m[10]*tz),1];
}

const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const smoothstep=(a,b,x)=>{const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};
const edge=(v,lo,hi)=>{const s=CAB_GLASS.edge;return smoothstep(lo-s,lo+s,v)*(1-smoothstep(hi-s,hi+s,v));};
/** 1 where a cab-space point can see a cab-space lamp through glass. */
export function cabGlassView(p,lamp){
  const{min,max}=CAB_GLASS.inside;
  if(lamp.every((v,i)=>v>min[i]&&v<max[i]))return 1;
  const d=lamp.map((v,i)=>v-p[i]);let seen=0;
  const{screen:S,side:D}=CAB_GLASS,n=[0,S.z1-S.z0,-(S.y1-S.y0)],dn=d[1]*n[1]+d[2]*n[2];
  if(Math.abs(dn)>1e-5){
    const t=((S.y0-p[1])*n[1]+(S.z0-p[2])*n[2])/dn;
    if(t>0&&t<=1){const y=p[1]+d[1]*t,x=p[0]+d[0]*t,u=(y-S.y0)/(S.y1-S.y0),w=S.halfBottom+(S.halfTop-S.halfBottom)*clamp(u);seen=Math.max(seen,edge(y,S.y0,S.y1)*edge(Math.abs(x),-1,w));}
  }
  for(const s of[-1,1]){
    if(Math.abs(d[0])<1e-5)continue;
    const t=(s*D.x-p[0])/d[0];
    if(t>0&&t<=1){const y=p[1]+d[1]*t,z=p[2]+d[2]*t,u=clamp((y-D.y0)/(D.y1-D.y0)),front=D.frontBottom+(D.frontTop-D.frontBottom)*u;seen=Math.max(seen,edge(y,D.y0,D.y1)*edge(z,front,D.rear));}
  }
  return seen;
}

const vec3=a=>`vec3(${a.map(F).join(',')})`,{screen:S,side:D,inside:I}=CAB_GLASS;
export const CAB_LIGHT_GLSL=`
uniform mat4 uCabWorldToLocal;uniform vec4 uCabLight;uniform float uCabInterior;
float cabEdge(float v,float lo,float hi){return smoothstep(lo-${F(CAB_GLASS.edge)},lo+${F(CAB_GLASS.edge)},v)*(1.0-smoothstep(hi-${F(CAB_GLASS.edge)},hi+${F(CAB_GLASS.edge)},v));}
float cabGlassView(vec3 p,vec3 lamp){
  if(all(greaterThan(lamp,${vec3(I.min)}))&&all(lessThan(lamp,${vec3(I.max)})))return 1.0;
  vec3 d=lamp-p;float seen=0.0;
  vec2 n=vec2(${F(S.z1-S.z0)},${F(-(S.y1-S.y0))});float dn=d.y*n.x+d.z*n.y;
  if(abs(dn)>.00001){
    float t=((${F(S.y0)}-p.y)*n.x+(${F(S.z0)}-p.z)*n.y)/dn;
    if(t>0.0&&t<=1.0){vec3 h=p+d*t;float u=clamp((h.y-${F(S.y0)})/${F(S.y1-S.y0)},0.0,1.0);seen=max(seen,cabEdge(h.y,${F(S.y0)},${F(S.y1)})*cabEdge(abs(h.x),-1.0,mix(${F(S.halfBottom)},${F(S.halfTop)},u)));}
  }
  if(abs(d.x)>.00001)for(int i=0;i<2;i++){
    float t=((i==0?-${F(D.x)}:${F(D.x)})-p.x)/d.x;
    if(t>0.0&&t<=1.0){vec3 h=p+d*t;float u=clamp((h.y-${F(D.y0)})/${F(D.y1-D.y0)},0.0,1.0);seen=max(seen,cabEdge(h.y,${F(D.y0)},${F(D.y1)})*cabEdge(h.z,mix(${F(D.frontBottom)},${F(D.frontTop)},u),${F(D.rear)}));}
  }
  return seen;
}
// Old, dirty glass, and street lamps tuned for a street: a lamp inside the van loses nothing.
float cabGlassTransmission(vec3 p,vec3 lamp){
  bool inside=all(greaterThan(lamp,${vec3(I.min)}))&&all(lessThan(lamp,${vec3(I.max)}));
  return inside?1.0:cabGlassView(p,lamp)*${F(CAB_GLASS.transmission)};
}
vec3 cabGlow(vec3 p,vec3 q,vec3 at,float reach){vec3 l=at-p;float d=length(l),a=clamp(1.0-d/reach,0.0,1.0);return vec3(a*a*(.22+.78*max(dot(q,l/max(d,.0001)),0.0)));}
vec3 cabOwnLight(vec3 world,vec3 normal){
  vec3 p=(uCabWorldToLocal*vec4(world,1.0)).xyz,q=normalize(mat3(uCabWorldToLocal)*normal),light=vec3(0.0);
  light+=vec3(.30,.92,.60)*uCabLight.y*cabGlow(p,q,${vec3(CAB_SOURCES.radio)},.42)*2.2;
  light+=vec3(.34,.86,.56)*uCabLight.y*cabGlow(p,q,${vec3(CAB_SOURCES.recorder)},.30)*1.1;
  // Up off the road onto the lining and anything facing down, strongest toward the screen.
  float underside=max(-q.y,0.0),ahead=smoothstep(.85,-.95,p.z);
  light+=vec3(.86,.78,.60)*uCabLight.z*underside*ahead*1.05;
  // And back down off the lining onto everything above the waist.
  float high=smoothstep(.62,1.32,p.y);
  light+=vec3(.78,.72,.58)*uCabLight.z*high*(.34+.66*max(q.y,0.0))*.34;
  // And on round the cab: off the seats and his coat, back onto what faces him. Without this
  // the fascia is black and the wheel's rim, which is black, has nothing to stand against.
  float facingHim=max(q.z,0.0),dashHeight=smoothstep(.84,1.02,p.y)*(1.0-smoothstep(1.32,1.42,p.y));
  light+=vec3(.76,.70,.58)*uCabLight.z*facingHim*dashHeight*smoothstep(.1,-.5,p.z)*1.15;
  // The night, on whatever under the glass is looking up at it.
  float underGlass=smoothstep(-.28,-.62,p.z);
  light+=vec3(.46,.55,.74)*uCabLight.w*max(q.y,0.0)*underGlass*.85;
  // Through the door glass, a cold edge on the near faces of the cards and the pillars.
  float nearDoor=smoothstep(.62,.95,abs(p.x))*smoothstep(1.0,1.3,p.y);
  light+=vec3(.42,.50,.68)*uCabLight.w*nearDoor*.26;
  return light*uCabLight.x;
}
`;
