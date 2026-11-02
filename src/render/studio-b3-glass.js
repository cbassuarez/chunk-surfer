// B3's glass is a bounded, deliberately art-directed optical treatment. The
// building and its props remain the transmitted image; there is no second full
// scene render and the figure never becomes an actor in the control booth.
import {torchAngularSample,torchFalloffSample} from './torch-optics.js';
import {localLightConeWeight} from './local-light-cone.js';
import {B3_WINDOW,b3WindowCrossing} from '../data/studio-b3-window.js';
export const B3_GLASS = Object.freeze({x:18.5,z0:8,z1:13,bottom:-2.95,top:-0.95,chairX:21.6,chairZ:10.5,panes:B3_WINDOW.panes});

// Samples the same resolved physical slice that drives the world march. Solid
// cells, door leaves and intersected floor/ceiling are real occluders. This is
// deliberately conservative; it does not claim pixel-perfect prop visibility.
export function b3ClearRay(plan,from,to,{propBlocks=null}={}){
  if(!plan?.solid||!plan?.floor||!plan?.ceil||!plan?.flags)return false;
  const distance=Math.hypot(to[0]-from[0],to[1]-from[1],to[2]-from[2]);
  const steps=Math.max(1,Math.ceil(distance/.20));
  const checkedProps=new Set();
  for(let i=1;i<steps;i++){
    const t=i/steps,x=from[0]+(to[0]-from[0])*t,y=from[1]+(to[1]-from[1])*t,z=from[2]+(to[2]-from[2])*t;
    const cx=Math.floor(x/.5)-(plan.originX||0),cz=Math.floor(z/.5)-(plan.originY||0);
    if(cx<0||cz<0||cx>=plan.w||cz>=plan.h)return false;
    const index=cz*plan.w+cx;
    if(plan.solid[index]||(plan.flags[index]&64)||y<=plan.floor[index]+.015||y>=plan.ceil[index]-.015)return false;
    // Tall-prop checks traverse the authored instance list. A ray can sample
    // one half-metre cell several times, so check each height band only once.
    if(propBlocks){
      const key=`${cx},${cz},${Math.floor(y*10)}`;
      if(!checkedProps.has(key)){checkedProps.add(key);if(propBlocks(x,Math.floor(y*10)/10,z))return false;}
    }
  }
  return true;
}

export function b3FigurePanePoint(eye){
  // The head is a virtual image behind the plane; project it onto that plane.
  if(eye[0]>=B3_WINDOW.planeX)return null;
  const crossing=b3WindowCrossing(eye,[B3_GLASS.chairX,-2.58,B3_GLASS.chairZ]);
  if(!crossing)return null;
  const pane=B3_WINDOW.panes.find(p=>p.id===crossing.paneId),q=crossing.point;
  return q[2]>=pane.z0+.08&&q[2]<=pane.z1-.08&&q[1]>=B3_WINDOW.bottom+.08&&q[1]<=B3_WINDOW.top-.08?q:null;
}

export function b3PaneIllumination({point,eye,torch,ambient=0,lights=[],plan}={}){
  if(!point||!plan)return 0;
  // Material receives the actual torch cone and falloff. Ambient alone is
  // retained but does not invent a strong light in the unpowered room.
  let energy=Math.max(0,Number(ambient)||0);
  if(torch?.power>0){
    const origin=torch.origin||eye,ray=point.map((v,i)=>v-origin[i]);
    const d=Math.hypot(...ray)||1,axis=ray.reduce((v,n,i)=>v+n*torch.forward[i],0)/d;
    const incidence=Math.abs(ray[0]/d);
    energy+=torch.power*torchAngularSample({axis,coneInner:torch.coneInner,coneOuter:torch.coneOuter,spill:torch.spill})*torchFalloffSample(d,torch.reach)*incidence*3;
  }
  for(const light of lights){
    const source=[light.x,light.y,light.z],ray=point.map((v,i)=>v-source[i]);
    const d=Math.hypot(...ray)||1,radius=Math.max(.01,light.radius||1);
    const attenuation=Math.max(0,1-d/radius)**2;
    if(attenuation<=0||!b3ClearRay(plan,source,point))continue;
    energy+=(Number(light.intensity)||0)*attenuation*Math.abs(ray[0]/d)*localLightConeWeight(light,ray);
  }
  return energy;
}

export function createB3GlassMoment(){
  let seen=0,away=0,armed=false,elapsed=-1,cooldown=0,outside=0;
  return {
    step({active=false,eye=[0,0,0],yaw=0,pitch=0,dt=0,visible=false,lit=false,suspended=false}={}){
      dt=Math.max(0,Math.min(.1,Number(dt)||0));
      if(suspended)return 0;
      const here=active && eye[0]>5 && eye[0]<18.5 && eye[2]>5 && eye[2]<20 && eye[1]>-3.9 && eye[1]<-.8;
      if(!here){outside+=dt;if(outside>5){seen=away=0;armed=false;elapsed=-1;cooldown=0;}return 0;}
      outside=0;
      const point=b3FigurePanePoint(eye)||[18.5,-1.95,10.5];
      const dx=point[0]-eye[0],dz=point[2]-eye[2],dy=point[1]-eye[1];
      const len=Math.hypot(dx,dy,dz)||1;
      const looking=(Math.sin(yaw)*Math.cos(pitch)*dx+Math.sin(pitch)*dy-Math.cos(yaw)*Math.cos(pitch)*dz)/len>.76;
      cooldown=Math.max(0,cooldown-dt);
      const readable=looking&&visible&&lit;
      if(elapsed>=0){
        // Do not spend the glimpse while the pane is obscured, unlit or out of
        // view. It resumes smoothly if the player can see it again.
        if(readable)elapsed+=dt;
        // Slow entrance and exit rather than a flash; one brief glimpse only.
        const gain=Math.min(1,elapsed/.65,Math.max(0,(3.8-elapsed)/.85));
        if(elapsed>=3.8){elapsed=-1;cooldown=25;armed=false;seen=away=0;}
        return readable?Math.max(0,gain):0;
      }
      if(cooldown>0)return 0;
      if(readable){
        if(armed && away>=.35){elapsed=0;return 0;}
        seen+=dt;if(seen>=1)armed=true;
      }else if(!looking&&armed){away+=dt;}
      return 0;
    },
    snapshot(){return {seen,away,armed,elapsed,cooldown,outside};},
    reset(){seen=away=0;armed=false;elapsed=-1;cooldown=outside=0;},
  };
}

// Trace the near pane against the composed world depth, then shade the already
// visible booth through it. The engineer is a virtual ellipsoid portrait in
// optical space: it has parallax, but is deliberately not a true scene mirror.
// It is restricted to the B3-facing pane and cannot appear inside the booth.
export const B3_GLASS_GLSL = `
uniform float uB3GlassActive;
uniform float uB3GlassFigure;
uniform float uB3GlassReturned;
float b3Ellipsoid(vec3 ro,vec3 rd,vec3 centre,vec3 radius){
  vec3 p=(ro-centre)/radius,d=rd/radius;
  float a=dot(d,d),b=dot(p,d),c=dot(p,p)-1.0;
  float disc=b*b-a*c;
  if(disc<0.0)return -1.0;
  float t=(-b-sqrt(disc))/a;
  return t>0.0?t:-1.0;
}
void b3Glass(inout vec3 col,vec3 eye,vec3 ray,vec3 fwd,inout float sceneDepth){
  if(uB3GlassActive<.5||abs(ray.x)<.0001)return;
  float t=(18.5-eye.x)/ray.x;
  if(t<=0.0||t*max(.001,dot(ray,fwd))>=sceneDepth-.012)return;
  vec3 q=eye+ray*t;
  bool north=q.z>=8.0&&q.z<=13.0;
  bool south=q.z>=14.0&&q.z<=17.0;
  if((!north&&!south)||q.y< -2.95||q.y> -.95)return;
  float z0=north?8.0:14.0,z1=north?13.0:17.0;
  // Clear unequal studio glazing. Contrast belongs mostly to the deep frame,
  // seals and grazing edges; the view is transmitted, never a room mirror.
  float grazing=pow(1.0-clamp(abs(ray.x),0.0,1.0),3.0);
  float rim=max(1.0-smoothstep(.0,.045,min(q.z-z0,z1-q.z)),
                1.0-smoothstep(.0,.045,min(q.y+2.95,-.95-q.y)));
  float receive=clamp(max(max(col.r,col.g),col.b),0.0,1.0);
  col=mix(col,vec3(.17,.20,.19),.014+.048*grazing+.032*rim);
  // Two weak glancing streaks suggest separated panes. Their brightness is
  // bounded by the real transmitted room; a dark window cannot light itself.
  float lineA=abs(q.y+1.24+.075*(q.z-10.5));
  float lineB=abs(q.y+1.275+.075*(q.z-10.5));
  float streak=(1.0-smoothstep(.006,.019,lineA))+.45*(1.0-smoothstep(.006,.016,lineB));
  col+=vec3(.10,.12,.10)*streak*(.012+.035*grazing)*receive;
  // Dust lies at the seals, not as a bright sheet over the live-room view.
  float dust=pow(.5+.5*sin(q.z*119.0+q.y*43.0)*sin(q.y*167.0-q.z*31.0),7.0);
  col=mix(col,col*.82, dust*rim*.16);
  // Sparse chinagraph sightlines belong to the glass, not the reflected room.
  // They are readable from either side, and their colour follows the ambient
  // image enough to avoid looking like a self-lit pane or a mirror.
  vec2 ink=q.zy;
  float crossA=max(1.0-smoothstep(.022,.040,abs(ink.x-9.30)),
                   1.0-smoothstep(.022,.040,abs(ink.y+1.72)));
  crossA*=step(abs(ink.x-9.30),.11)*step(abs(ink.y+1.72),.11);
  float refZ=mix(11.73,10.84,uB3GlassReturned);
  float refY=mix(-2.12,-2.33,uB3GlassReturned);
  vec2 d=abs(ink-vec2(refZ,refY));
  float bracket=max((1.0-smoothstep(.022,.040,abs(d.x-.17)))*step(d.y,.23)*step(.10,d.y),
                    (1.0-smoothstep(.022,.040,abs(d.y-.23)))*step(d.x,.17)*step(.07,d.x));
  float inkMask=max(crossA,bracket);
  float inkLight=mix(.45,.60,smoothstep(.02,.22,max(max(col.r,col.g),col.b)));
  col=mix(col,vec3(.70,.66,.56),inkMask*inkLight);
  // Ink is a physical mark on the pane. Clear glass continues to expose the
  // receiver's view depth; only an actually drawn mark owns the nearer plane.
  if(inkMask>.08)sceneDepth=min(sceneDepth,t*max(.001,dot(ray,fwd)));
  if(eye.x>=18.5||ray.x<=0.0||uB3GlassFigure<=.001)return;
  // A seated head, shoulders and arms at the actual chair. The actual booth
  // remains empty; all fragments below are clipped to the pane and to its
  // nearest visible depth. The figure does not own collision or threat logic.
  float head=b3Ellipsoid(eye,ray,vec3(21.52,-2.58,10.5),vec3(.13,.20,.13));
  float torso=b3Ellipsoid(eye,ray,vec3(21.57,-2.98,10.5),vec3(.19,.32,.28));
  float arm1=b3Ellipsoid(eye,ray,vec3(21.18,-3.02,10.19),vec3(.32,.085,.09));
  float arm2=b3Ellipsoid(eye,ray,vec3(21.18,-3.02,10.81),vec3(.32,.085,.09));
  float figure=max(max(step(0.0,head),step(0.0,torso)),max(step(0.0,arm1),step(0.0,arm2)));
  // A narrow glancing edge survives the actual one-bit print where a dark
  // negative against a dark control room disappears. It is confined to the
  // figure, not the rest of the transparent pane; the booth remains readable.
  float headOuter=b3Ellipsoid(eye,ray,vec3(21.52,-2.58,10.5),vec3(.15,.22,.15));
  float torsoOuter=b3Ellipsoid(eye,ray,vec3(21.57,-2.98,10.5),vec3(.21,.34,.30));
  float arm1Outer=b3Ellipsoid(eye,ray,vec3(21.18,-3.02,10.19),vec3(.34,.105,.11));
  float arm2Outer=b3Ellipsoid(eye,ray,vec3(21.18,-3.02,10.81),vec3(.34,.105,.11));
  float shell=max(max(step(0.0,headOuter),step(0.0,torsoOuter)),max(step(0.0,arm1Outer),step(0.0,arm2Outer)));
  float outline=max(0.0,shell-figure);
  vec3 bodyTone=col*.72+vec3(.13,.14,.13);
  // The impression belongs to the actual engineer's chair: seated head,
  // sloping shoulders and forearms reaching the unpowered desk. Eye sockets
  // remove light rather than becoming a pair of emissive horror dots.
  if(head>0.0){
    vec3 hp=eye+ray*head;
    float sockets=exp(-pow((hp.y+2.56)/.026,2.0)-pow((abs(hp.z-10.5)-.055)/.028,2.0));
    float face=1.0-smoothstep(21.45,21.55,hp.x);
    bodyTone*=1.0-.65*sockets*face;
  }
  if(torso>0.0&&head<0.0){
    vec3 cp=eye+ray*torso;
    float lapel=1.0-smoothstep(.008,.025,abs(abs(cp.z-10.5)-(.06+.23*clamp(cp.y+3.3,0.0,.7))));
    bodyTone*=1.0-.28*lapel;
  }
  col=mix(col,bodyTone,figure*uB3GlassFigure*.55);
  col=mix(col,vec3(.43,.47,.44),outline*uB3GlassFigure*.60);
}
`;
