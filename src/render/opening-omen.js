// WHAT YOU ARE TALKING TO. Nothing here is a likeness. The hole is the one over the
// far gate in Source II, out of the same function, moved; the moon is the one the
// black sun eats over Source III, the same geometry and the same paint. The sky is
// shut out so that for the first minute there is nothing else to look at.
import {SOURCE_REST_HORIZON,sourceRestHorizonFrame} from '../game/source-rest-horizon.js';
import {SOURCE_REST_SEATS,sourceRestEyePosition} from '../game/source-rest-seat.js';
import {sourceBlackSunPoses,sourceContinuationBlackSunGeometryLibrary} from './source-continuation-black-sun.js';

const TAU=Math.PI*2,clamp=value=>Math.max(0,Math.min(1,Number(value)||0)),ease=value=>{const t=clamp(value);return t*t*(3-2*t);},mix=(a,b,t)=>a+(b-a)*t;
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]],dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2],unit=a=>{const l=Math.hypot(...a)||1;return[a[0]/l,a[1]/l,a[2]/l];},
  cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function frameOf(view){const f=unit(view),r=unit(cross(f,[0,1,0])),u=cross(r,f);return{f,r,u};}

export const OPENING_OMEN=Object.freeze({
  domeRadius:290,
  // The way it was first seen. It is one rigid thing after that: the camera moves.
  view:Object.freeze([-8,8.5,-8]),
  // In hole radii. Set back behind the hole's plane, so the lens bends it. It keeps
  // to the outside of the wheels, far enough to read as a moon before it goes round.
  moonSun:5,moonBehind:1,moonPhase:90,
  // Roll is called along the outer wheel, then the middle. The first to go is the
  // one who stopped coming down. The last seven are left for you.
  shutOrder:Object.freeze([0,16,17,18,19,20,21,22,23,8,9,10,11,12,13,14,15,1,2,3,4,5,6,7]),
});
const EYES=SOURCE_REST_HORIZON.rings.length*SOURCE_REST_HORIZON.eyes;
const shutAt=new Map(OPENING_OMEN.shutOrder.map((eye,order)=>[eye,order]));

function sphereInward(around=40,across=20){
  const p=[],n=[],i=[];
  for(let v=0;v<=across;v++)for(let u=0;u<=around;u++){const phi=v/across*Math.PI,theta=u/around*TAU,x=Math.sin(phi)*Math.cos(theta),y=Math.cos(phi),z=Math.sin(phi)*Math.sin(theta);p.push(x,y,z);n.push(-x,-y,-z);}
  for(let v=0;v<across;v++)for(let u=0;u<around;u++){const a=v*(around+1)+u,b=a+around+1;i.push(a,a+1,b,a+1,b+1,b);}
  return{p,n,i};
}
let library=null;
export function openingOmenGeometry(){
  if(library)return library;
  const real=sourceContinuationBlackSunGeometryLibrary(),paint=piece=>({p:piece.p,i:piece.i,base:piece.base,emissive:piece.emissive,roughness:piece.roughness});
  library=Object.freeze([
    {name:'omen_dome',...sphereInward(),base:[0,0,0,1],emissive:[0,0,0],metallic:1,roughness:1},
    {name:'omen_moon',...paint(real['catch-blood-moon'])},
    {name:'omen_moon_stream',...paint(real['catch-blood-moon-stream'])},
  ]);
  return library;
}
export const OPENING_OMEN_MESHES=Object.freeze(['omen_dome','omen_moon','omen_moon_stream']);

const realSeat=SOURCE_REST_SEATS[0],realEye=sourceRestEyePosition(realSeat);
/** The real hole's frame for this moment, turned rigidly so that it stands to the
 * film's camera as it stands to the listening seat. `wheels`, `falls`, `open` and
 * `shut` take the place of the recording's own schedule. */
export function openingHorizonFrame({centre,radius,clock=0,view=OPENING_OMEN.view,wheels=[1,1,1],falls=[0,0,0],open=EYES,shut=0,breath=0,reducedMotion=false,eyePresentation=[2,.96]}={}){
  const base=sourceRestHorizonFrame({time:clock,unwrappedTime:clock,progress:0,breath,reducedMotion,seat:realSeat});
  if(!base.active)return null;
  const from=frameOf(sub(base.centre,realEye)),to=frameOf(view),
    turn=v=>{const a=dot(v,from.r),b=dot(v,from.u),c=dot(v,from.f);return[to.r[0]*a+to.u[0]*b+to.f[0]*c,to.r[1]*a+to.u[1]*b+to.f[1]*c,to.r[2]*a+to.u[2]*b+to.f[2]*c];};
  let alive=0;
  const rings=SOURCE_REST_HORIZON.rings.map((ring,k)=>{
    const f=ease(falls[k]),present=clamp(wheels[k])*(1-ease((f-.8)/.2));alive+=present;
    return Object.freeze({normal:turn(base.rings[k].normal),inner:mix(ring.inner,SOURCE_REST_HORIZON.collapsedInner,f),outer:mix(ring.outer,SOURCE_REST_HORIZON.collapsedOuter,f),alive:present,flash:0,collapseAt:Infinity,falling:f});
  });
  const eyeAges=new Float32Array(EYES);
  for(let eye=0;eye<EYES;eye++){
    const order=shutAt.get(eye);
    // Dark for less than the eye's own 25 seconds is how the shader spells shut;
    // the flash is the few seconds after it went.
    eyeAges[eye]=shut>order?Math.min(24,(shut-order)*1.1):eye<open?1e4:20;
  }
  return Object.freeze({...base,finish:'silicon',centre:[...centre],radius,spin:turn(base.spin),rings:Object.freeze(rings),eyeAges,
    eyePresentation:Object.freeze([...eyePresentation]),light:.32*(.35+.65*alive/rings.length)});
}

const SHARED={structural:false,decorative:true,noReflection:true,noShadow:true};
/** The shut sky and the moon. Both are drawn before the lens, so both are bent. */
export function openingOmenProps({eye,centre,radius,moon=0,time=0,view=OPENING_OMEN.view,moonSun=OPENING_OMEN.moonSun,moonBehind=OPENING_OMEN.moonBehind,stream=0,reducedMotion=false}={}){
  const props=[],place=(id,mesh,matrix,cull)=>props.push({...SHARED,id:'omen:'+id,mesh,matrix,x:matrix[12],y:matrix[13],z:matrix[14],cullRadius:cull});
  const R=OPENING_OMEN.domeRadius;
  place('dome','omen_dome',new Float32Array([R,0,0,0,0,R,0,0,0,0,R,0,eye[0],eye[1],eye[2],1]),R*1.1);
  if(moon>.01){
    const away=unit(view),scale=clamp(moon),at=[centre[0]+away[0]*radius*moonBehind,centre[1]+away[1]*radius*moonBehind,centre[2]+away[2]*radius*moonBehind],
      poses=sourceBlackSunPoses({centre:{x:at[0],y:at[1],z:at[2]},facing:{x:at[0]-away[0],y:at[1]-away[1],z:at[2]-away[2]},time:time+OPENING_OMEN.moonPhase,scale:moonSun*radius*scale/20,reducedMotion});
    place('moon','omen_moon',poses.moon,radius*8);
    // The moon is whole until the wheels start to go. Then what comes off it arrives
    // from outside the frame, winding in, and from there it keeps falling.
    if(stream>.01){const spread=1/Math.max(.3,stream),m=poses.stream.slice();for(let k=0;k<12;k++)if(k%4!==3)m[k]*=spread;place('stream','omen_moon_stream',m,radius*8*spread);}
  }
  return props;
}
