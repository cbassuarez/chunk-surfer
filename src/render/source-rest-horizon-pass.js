// Source II's Ophanim horizon on the GPU: the per-vertex infall shared by the
// prop vertex program, and the full-screen lens pass that runs between the
// rest acquisition and the recording. Both read one frame from
// game/source-rest-horizon.js; neither owns time, save or collision state.
import {CAMERA_FORWARD_GLSL} from './camera-basis.js';
import {SOURCE_REST_HORIZON} from '../game/source-rest-horizon.js';

const EYES=SOURCE_REST_HORIZON.rings.length*SOURCE_REST_HORIZON.eyes;
const f=n=>Number(n).toFixed(5);
// Opening-only optical identities. Separate from ordinary printed pigment
// (156..171), so restoring silicon here never recolours the cab or a document.
export const OPENING_OPHANIM_RING_BYTE=172;
export const OPENING_OPHANIM_EYE_BYTE=173;
export function openingOphanimMarkByte({eyePresentation=[0,0],eyeInk=0}={}){
  return eyePresentation[0]>1.5?eyeInk>.5?OPENING_OPHANIM_EYE_BYTE:OPENING_OPHANIM_RING_BYTE:156;
}

// Instances carry their tide in the paper-handling slot, which only paper
// reads (paper index >= 0). x is -2 minus the break-off kick, so ordinary
// non-paper props (-1) never match; y release clock; z anchor; w seed,
// negative while the piece stays hidden until its release.
export function writePropHorizonTide(data,at,tide){
  if(!tide)return false;
  data[at+24]=-1;data[at+25]=-2-Math.max(0,Math.min(.99,Number(tide.kick)||0));
  data[at+26]=Number(tide.release)||0;data[at+27]=Math.max(.1,Number(tide.anchor)||1);
  const seed=.01+Math.max(0,Math.min(.98,Number(tide.seed)||0));data[at+28]=tide.hidden?-seed:seed;return true;
}

export function sourceRestHorizonTideUniforms(frame){
  const active=!!frame?.active;
  return{centre:active?[...frame.centre,frame.radius]:[0,0,0,1],spin:active?[...frame.spin,frame.swirl||0]:[0,1,0,0],
    clock:[active?frame.clock:0,active?1:0,frame?.reducedMotion?1:0,0]};
}

// Each vertex falls on its own path: free-fall radius r0(1-s)^(2/3), angular
// momentum conserved, height along the spin axis flattening into the disc.
// Nearer ends fall and orbit faster, so stretching and wrapping come from the
// paths themselves. The linear approach hands off to the exact asymptotic
// solution of the free-fall proper time dτ/dt = 1 - rs/r, so the clock never
// sees the crossing; only the growing rs (r0 under HORIZON_HANG) consumes.
// Returns 1 once the vertex has crossed the horizon.
export const SOURCE_REST_HORIZON_TIDE_GLSL=`
uniform vec4 uRestHorizonCentre,uRestHorizonSpin,uRestHorizonClock;
const float HORIZON_HANG=${f(SOURCE_REST_HORIZON.hangApproach)};
mat3 restHorizonTurn(vec3 a,float t){a=normalize(a);float c=cos(t),s=sin(t),k=1.0-c;
  return mat3(c+a.x*a.x*k,a.y*a.x*k+a.z*s,a.z*a.x*k-a.y*s,a.x*a.y*k-a.z*s,c+a.y*a.y*k,a.z*a.y*k+a.x*s,a.x*a.z*k+a.y*s,a.y*a.z*k-a.x*s,c+a.z*a.z*k);}
float restHorizonTide(inout vec3 world,inout vec3 normal,vec3 pivot,vec4 tide){
  if(uRestHorizonClock.y<.5)return 0.0;
  float age=uRestHorizonClock.x-tide.y,seed=abs(tide.w),kick=-2.0-tide.x;
  if(age<0.0)return tide.w<0.0?1.0:0.0;
  vec3 centre=uRestHorizonCentre.xyz,axis=uRestHorizonSpin.xyz;float rs=uRestHorizonCentre.w;
  if(kick>0.0&&uRestHorizonClock.z<.5){
    mat3 turn=restHorizonTurn(vec3(sin(seed*91.7),cos(seed*37.3),sin(seed*13.1+1.0)),age*(.8+seed*2.2));
    world=pivot+turn*(world-pivot);normal=turn*normal;
    world+=(normalize(centre-pivot)*.55+vec3(0.0,-.18,0.0))*kick*(1.0-exp(-age*1.2));
  }
  vec3 rel=world-centre,e1=normalize(cross(axis,abs(axis.y)<.95?vec3(0,1,0):vec3(1,0,0))),e2=cross(axis,e1);
  float r0=max(length(rel)/rs,1.001),z0=dot(rel,axis)/rs,period=(6.0+.25*pow(r0,1.5))*tide.z;
  float last=1.0-pow(1.0/r0,1.5),linear=age/period,hang=1.0-pow(HORIZON_HANG/r0,1.5),s=linear;
  if(hang>0.0&&linear>=hang){
    s=last-(last-hang)*exp(-(linear-hang)*pow(r0,1.5)/(1.5*period));
    if(s>=last)s=last*(1.0-1e-6); // exp underflow must never fake a crossing
  }
  if(s>=last){world=centre;return 1.0;}
  float k=pow(1.0-s,2.0/3.0),r=r0*k,z=z0*pow(k,1.5),rho=sqrt(max(r*r-z*z,0.0)),
    phase=atan(dot(rel,e2),dot(rel,e1))+uRestHorizonSpin.w*3.0*(pow(1.0-s,-1.0/3.0)-1.0);
  world=centre+rs*(axis*z+e1*rho*cos(phase)+e2*rho*sin(phase));
  return 0.0;
}
`;

export function sourceRestHorizonLensUniforms(frame){
  const normals=new Float32Array(9),rings=new Float32Array(12),ages=new Float32Array(EYES).fill(1e4);
  (frame?.rings||[]).forEach((ring,k)=>{normals.set(ring.normal,k*3);rings.set([ring.inner,ring.outer,ring.alive,ring.flash],k*4);});
  if(frame?.eyeAges)ages.set(Array.from(frame.eyeAges).slice(0,EYES));
  return{centre:[...(frame?.centre||[0,0,0]),frame?.radius||1],spin:[...(frame?.spin||[0,1,0]),frame?.dragging||0],
    params:[frame?.capture||1,frame?.lensRadius||12,frame?.breath||0,frame?.clock||0],
    eyes:frame?.eyePresentation?[...frame.eyePresentation]:[0,0],normals,rings,ages};
}

// A Binet-force photon integrator (Schwarzschild null geodesics in Cartesian
// form, a = -1.5 h^2 x / r^5 in units of rs) with an added frame-dragging
// term. The rings are emitting planes crossed by the bent ray; beyond the
// lens radius a weak-field 2/b deflection is applied instead. Geometry behind
// the lens plane is found by an SSR-style march along the bent direction,
// so the far bell and walls wrap into Einstein arcs. Foreground stays put.
export const SOURCE_REST_HORIZON_LENS_GLSL=`
precision highp float;precision highp int;precision highp sampler2D;
uniform sampler2D uHorizonScene,uHorizonMarks;
uniform vec2 uHorizonRes,uHorizonView;
uniform vec3 uHorizonEye;
uniform float uHorizonTan;
uniform vec2 uHorizonEyes;
uniform vec4 uHorizonCentre,uHorizonSpin,uHorizonParams;
uniform vec3 uHorizonRingNormal[3];
uniform vec4 uHorizonRing[3];
uniform float uHorizonEyeAge[${EYES}];
layout(location=0) out vec4 o;
layout(location=1) out vec4 oMark;
${CAMERA_FORWARD_GLSL}
const float HORIZON_STOCK_TAG=156.0/255.0;
const float HORIZON_OPENING_STOCK_TAG=${OPENING_OPHANIM_RING_BYTE}.0/255.0;
const float HORIZON_EYE_TAG=${OPENING_OPHANIM_EYE_BYTE}.0/255.0;
const float HORIZON_EYE_DARK=${f(SOURCE_REST_HORIZON.eyeDarkSeconds)};
const float HORIZON_EYE_FLASH=${f(SOURCE_REST_HORIZON.eyeFlashSeconds)};
float horizonHash(vec3 p){p=fract(p*.1031);p+=dot(p,p.zyx+31.32);return fract((p.x+p.y)*p.z);}
float horizonNoise(vec3 p){vec3 i=floor(p),q=fract(p);q=q*q*(3.0-2.0*q);
  return mix(mix(mix(horizonHash(i),horizonHash(i+vec3(1,0,0)),q.x),mix(horizonHash(i+vec3(0,1,0)),horizonHash(i+vec3(1,1,0)),q.x),q.y),
    mix(mix(horizonHash(i+vec3(0,0,1)),horizonHash(i+vec3(1,0,1)),q.x),mix(horizonHash(i+vec3(0,1,1)),horizonHash(i+vec3(1,1,1)),q.x),q.y),q.z);}
float horizonFbm(vec3 p){float s=0.0,a=.5;for(int i=0;i<4;i++){s+=a*horizonNoise(p);p=p*2.03+vec3(1.7,9.2,3.1);a*=.5;}return s;}
float horizonWrap(float a){return a-6.2831853*floor((a+3.1415927)/6.2831853);}
vec3 horizonForward(){return cameraForward(uHorizonView.x,uHorizonView.y);}
vec3 horizonRight(){return normalize(vec3(cos(uHorizonView.x),0.0,sin(uHorizonView.x)));}
vec3 horizonRay(vec2 frag){
  vec2 uv=frag/uHorizonRes*2.0-1.0;uv.x*=uHorizonRes.x/uHorizonRes.y;
  vec3 fwd=horizonForward(),rgt=horizonRight(),up=normalize(cross(rgt,fwd));
  return normalize(fwd+uv.x*rgt*uHorizonTan+uv.y*up*uHorizonTan);
}
bool horizonProject(vec3 d,out vec2 frag){
  vec3 fwd=horizonForward(),rgt=horizonRight(),up=normalize(cross(rgt,fwd));float z=dot(d,fwd);frag=vec2(-1.0);
  if(z<=.001)return false;
  vec2 uv=vec2(dot(d,rgt)/(z*uHorizonTan)/(uHorizonRes.x/uHorizonRes.y),dot(d,up)/(z*uHorizonTan));
  frag=(uv*.5+.5)*uHorizonRes;
  return all(greaterThanEqual(frag,vec2(0.0)))&&all(lessThan(frag,uHorizonRes));
}
float horizonViewDepth(float packed){return max(0.0,(1.0/max(packed,1e-6)-1.0)/.14);}
float horizonPacked(float viewDepth){return 1.0/(1.0+max(0.0,viewDepth)*.14);}
vec4 horizonEmit(vec3 p,vec3 v,int ring){
  vec4 q=uHorizonRing[ring];vec3 N=uHorizonRingNormal[ring];float r=length(p);
  if(q.z<=0.0||r<q.x||r>q.y)return vec4(0.0);
  vec3 e1=normalize(cross(N,abs(N.y)<.95?vec3(0,1,0):vec3(1,0,0))),e2=cross(N,e1);
  float phi=atan(dot(p,e2),dot(p,e1)),turn=phi-5.45*pow(r,-1.5)*uHorizonParams.w,
    edge=smoothstep(q.x,q.x+.3,r)*smoothstep(q.y,q.y-.3,r),
    lanes=.35+horizonFbm(vec3(r*4.2,cos(turn)*1.4,sin(turn)*1.4)+float(ring)*7.0),
    I=(1.25-.25*float(ring))*edge*lanes*(.75+.6*uHorizonParams.z)*q.z+q.w*edge*2.5,mid=(q.x+q.y)*.5,eyeInk=0.0,eyeCoverage=0.0,eyeAbsorption=0.0;
  for(int j=0;j<${SOURCE_REST_HORIZON.eyes};j++){
    float age=uHorizonEyeAge[ring*${SOURCE_REST_HORIZON.eyes}+j],open=age<HORIZON_EYE_DARK?0.0:1.0,
      flash=age<HORIZON_EYE_FLASH?exp(-age*3.0)*4.0:0.0,dp=horizonWrap(turn-float(j)*.7853982);
    float knot=exp(-dp*dp*mid*mid/.16-(r-mid)*(r-mid)/.1);
    if(uHorizonEyes.x>.5){
      // In the first, near encounter these are watching apertures rather than
      // distant luminous knots. The pupil removes the ring's own emission too.
      // Source II sends zero and retains its existing recording-scale ink.
      float u=dp*mid/.66,v=(r-mid)/.30;
      float lid=1.0-smoothstep(.78,1.0,abs(v)/max(.04,1.0-u*u));
      float almond=(1.0-smoothstep(.88,1.02,abs(u)))*lid;
      float pupil=(1.0-smoothstep(.14,.24,length(vec2(u*1.55,v))))*uHorizonEyes.y;
      I*=1.0-almond*(open*pupil+(1.0-open)*.90);
      float closedLid=(1.0-smoothstep(.80,1.0,abs(u)))*exp(-v*v*180.0);
      I+=q.z*(open*3.0*almond*(1.0-pupil)+(1.0-open)*.38*closedLid)+flash*q.z*knot;
      // Retain the physical eye identity at the winning ray intersection.
      // Its separate optical tag retains the existing pigment acquisition;
      // the unused tangent byte makes actual visibility inspectable.
      if(uHorizonEyes.x>1.5&&almond*q.z>max(.25,eyeCoverage)){
        eyeCoverage=almond*q.z;eyeInk=float(ring*${SOURCE_REST_HORIZON.eyes}+j+1);
      }
      eyeAbsorption=max(eyeAbsorption,almond*(open*pupil+(1.0-open)*.80)*q.z);
    }else I+=(open*2.4+flash)*q.z*knot;
  }
  // Doppler beaming and gravitational redshift dim the receding side.
  float beta=min(sqrt(.5/max(r-1.0,.8)),.62),gamma=inversesqrt(1.0-beta*beta);
  float g=1.0/(gamma*(1.0+beta*dot(normalize(cross(N,p)),normalize(v))))*sqrt(max(1.0-1.0/r,0.0));
  I*=pow(g,2.6);
  return vec4(I,max(clamp(I*.7,0.0,.9)*edge,eyeAbsorption),g,eyeInk);
}
void horizonTrace(vec3 origin,vec3 dir,out float emission,out float transmit,out float captured,out vec3 outgoing,out vec3 crossing,out float eyeInk){
  emission=0.0;transmit=1.0;captured=0.0;outgoing=dir;crossing=vec3(0.0);eyeInk=0.0;
  float rs=uHorizonCentre.w,lens=uHorizonParams.y;vec3 x=(origin-uHorizonCentre.xyz)/rs,v=dir;
  float xv=dot(x,v),b2=dot(x,x)-xv*xv;
  if(dot(x,x)>lens*lens){
    if(xv>0.0||b2>lens*lens){
      if(xv<0.0){float b=sqrt(b2),a=2.0/b;vec3 n=(x-v*xv)/b;outgoing=normalize(v*cos(a)-n*sin(a));}
      return;
    }
    x+=v*(-xv-sqrt(lens*lens-b2));
  }
  vec3 hv=cross(x,v);float h2=dot(hv,hv),best=0.0;
  for(int i=0;i<160;i++){
    float r=length(x);if(r<uHorizonParams.x){captured=1.0;break;}
    // Steps shrink as r^2 near the horizon; a coarse step there slingshots
    // a captured ray back out. Dragging is bounded inside 1.2 rs for the same reason.
    float dt=clamp(.05*r*r,.01,1.1),drag=max(r,1.2);
    vec3 a=-1.5*h2*x/pow(r,5.0)+uHorizonSpin.w*cross(uHorizonSpin.xyz,v)/(drag*drag*drag);
    v+=a*dt;vec3 next=x+v*dt;
    for(int k=0;k<3;k++){
      vec3 N=uHorizonRingNormal[k];float s0=dot(x,N),s1=dot(next,N);
      if(s0*s1<0.0){vec3 p=mix(x,next,s0/(s0-s1));vec4 e=horizonEmit(p,v,k);
        if(e.x>0.0){float w=transmit*e.x;emission+=w;if(w>best){best=w;crossing=uHorizonCentre.xyz+p*rs;eyeInk=e.w;}transmit*=1.0-e.y;}}
    }
    x=next;if(r>lens+1.0&&dot(x,v)>0.0)break;if(transmit<.03)break;
  }
  outgoing=normalize(v);
}
void main(){
  vec2 frag=gl_FragCoord.xy;ivec2 pixel=ivec2(frag);
  vec4 scene=texelFetch(uHorizonScene,pixel,0),mark=texelFetch(uHorizonMarks,pixel,0);
  vec3 d=horizonRay(frag),toHole=uHorizonCentre.xyz-uHorizonEye,fwd=horizonForward();
  float lensPlane=dot(toHole,d),seen=horizonViewDepth(scene.a)/max(.001,dot(d,fwd)),holeDepth=dot(toHole,fwd);
  // Anything between the seat and the lens plane is drawn as acquired.
  if(lensPlane<=0.0||seen<lensPlane){o=scene;oMark=mark;return;}
  float emission,transmit,captured,eyeInk;vec3 outgoing,crossing;
  horizonTrace(uHorizonEye,d,emission,transmit,captured,outgoing,crossing,eyeInk);
  vec4 back=vec4(0.0,0.0,0.0,horizonPacked(holeDepth)),backMark=vec4(0.0);
  if(captured<.5){
    // March the virtual image from the seen pixel toward the fully bent
    // direction; a surface at view distance D needs the fraction 1-Dl/D.
    float holeDistance=length(toHole);bool found=false;
    for(int i=1;i<=12;i++){
      float t=float(i)/12.0;vec2 at;if(!horizonProject(normalize(d+(outgoing-d)*t),at))continue;
      ivec2 cell=ivec2(at);vec4 s=texelFetch(uHorizonScene,cell,0);vec3 rd=horizonRay(at);
      float sd=horizonViewDepth(s.a)/max(.001,dot(rd,fwd));
      if(sd<=dot(toHole,rd))continue;
      if(clamp((sd-holeDistance)/sd,0.0,1.0)<=t+.04){back=s;backMark=texelFetch(uHorizonMarks,cell,0);found=true;break;}
    }
    if(!found){vec2 at;horizonProject(outgoing,at);ivec2 cell=ivec2(clamp(at,vec2(0.0),uHorizonRes-1.0));back=texelFetch(uHorizonScene,cell,0);backMark=texelFetch(uHorizonMarks,cell,0);}
  }
  vec3 colour=back.rgb*transmit+vec3(emission);
  if(emission>.004&&emission>dot(back.rgb*transmit,vec3(.3,.5,.2))*.8){
    float stock=uHorizonEyes.x>1.5?(eyeInk>.5?HORIZON_EYE_TAG:HORIZON_OPENING_STOCK_TAG):HORIZON_STOCK_TAG;
    o=vec4(colour,horizonPacked(dot(crossing-uHorizonEye,fwd)));oMark=vec4(eyeInk/32.0,.5,.5,stock);
  }else{o=vec4(colour,back.a);oMark=captured>.5?vec4(0.0):backMark;}
}
`;
