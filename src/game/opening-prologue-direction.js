// One photographed journey. The moving cab, its road and the actual Ellery
// models share this frame; no alternate renderer or hidden world-camera cut.
import {multiply,rotation} from './source-drive/scene.js';
import {rigidInverse} from '../render/cab-light.js';
import {OPENING_OVERTURE_SHOTS} from '../data/opening-overture.js';
import {ELLERY_PUBLIC_FRONT,ELLERY_PUBLIC_FRONT_PROPS} from '../data/ellery-public-front.js';

const clamp=(n,a=0,b=1)=>Math.max(a,Math.min(b,Number(n)||0));
const smooth=n=>{const t=clamp(n);return t*t*t*(10+t*(-15+6*t));};
const lerp=(a,b,t)=>a+(b-a)*t,vec=(a,b,t)=>a.map((n,k)=>lerp(n,b[k],t));
const point=(m,p)=>[m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12],m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13],m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]];
const vector=(m,p)=>[m[0]*p[0]+m[4]*p[1]+m[8]*p[2],m[1]*p[0]+m[5]*p[1]+m[9]*p[2],m[2]*p[0]+m[6]*p[1]+m[10]*p[2]];
const aim=(eye,yaw=0,pitch=-.035)=>[eye[0]+Math.sin(yaw)*Math.cos(pitch)*20,eye[1]+Math.sin(pitch)*20,eye[2]-Math.cos(yaw)*Math.cos(pitch)*20];
const bezier=(a,b,c,d,t)=>a.map((n,k)=>n*(1-t)**3+3*b[k]*t*(1-t)**2+3*c[k]*t*t*(1-t)+d[k]*t**3);
const cabModes=new Set(['road','windshield','body','reminder','return']);
export const OPENING_JOURNEY=Object.freeze({departureSeconds:8.4,schoolSeconds:7.2,returnSeconds:7.8,bodySeconds:3.8,minimumEstablishment:.8,framingShift:0});

function instanceMatrix(p){if(p.matrix?.length===16)return p.matrix;const m=rotation(0,p.yaw||0);m[12]=p.x||0;m[13]=p.y||0;m[14]=p.z||0;return m;}
function placed(p,m){return{...p,matrix:m,x:m[12],y:m[13],z:m[14]};}
function transformLight(l,m){const p=point(m,[l.x,l.y,l.z]);return{...l,x:p[0],y:p[1],z:p[2],...(l.direction?{direction:vector(m,l.direction)}:{}),...(Number.isFinite(l.shadowYaw)?{shadowYaw:l.shadowYaw-Math.atan2(m[8],m[0])}:{})};}

// The exact public-front/forecourt/closed-door meshes, at their authored
// relative positions. The memory is turned once as a complete construction.
export function openingMemoryInstances(){
  const map=rotation(0,Math.PI);map[12]=80;map[14]=-130;
  const source=[
    ...ELLERY_PUBLIC_FRONT_PROPS.filter(p=>['ellery-actual-public-front','ellery-public-forecourt'].includes(p.id)).map(p=>({...p,z:p.y+(p.renderOffsetZ||0),y:p.floorOverride||0})),
    {id:'bay-west-elevation',mesh:ELLERY_PUBLIC_FRONT.hero.mesh,x:ELLERY_PUBLIC_FRONT.hero.anchor.x,y:0,z:ELLERY_PUBLIC_FRONT.hero.anchor.z},
    ...(OPENING_OVERTURE_SHOTS.find(s=>s.sourcePlanId==='R03')?.additionalInstances||[]).filter(p=>p.id!=='opening-study:actual-ellery-forecourt'),
  ];
  return source.map(p=>placed({...p,id:'opening-memory:'+p.id,structural:true,decorative:true,skyExposed:true},multiply(map,instanceMatrix(p))));
}

export function openingJourneyIntent({semanticPhase='road',stageId='dark',nodeId='start'}={}){
  if(nodeId==='off'||semanticPhase==='return')return'return';
  if(semanticPhase==='road'||stageId==='dark')return'road';
  if(stageId==='woken')return'windshield';
  if(['grip','held','released'].includes(stageId))return'body';
  if(stageId==='margin')return'reminder';
  if(semanticPhase==='ellery')return'school';
  if(semanticPhase==='personal')return'fates';
  if(stageId==='averted')return'avert';
  if(stageId==='near')return'near';
  return'wheels';
}

export function createOpeningPrologueDirection({reducedMotion=false,memoryInstances=openingMemoryInstances()}={}){
  let intent=null,from=null,to=null,pose=null,age=0,duration=0,clock=0,presented=0,last=null;
  function desired(kind,stage,cabEye,wheel,roadPitch=0){
    // Cinematic captions share the whole picture. Aim at the actual subject
    // instead of biasing every shot left to make room for the former column.
    const root={eye:[...cabEye],target:aim(cabEye,0,roadPitch-.035),hole:[0,14,-115],shift:OPENING_JOURNEY.framingShift,radius:1.8,departure:0};
    if(kind==='road')return{...root,radius:0};
    if(kind==='windshield')return root;
    if(kind==='body')return{...root,target:wheel||[.2,1.08,-2],hole:pose?.hole||[0,44,-115],radius:1.15,departure:0};
    if(kind==='reminder'||kind==='return')return{...root,hole:pose?.hole||[0,60,-115],radius:kind==='return'?0:1.8};
    if(kind==='school')return{eye:[16,2.65,-87],target:[0,7,-131],hole:[0,17,-115],shift:0,radius:1.1,departure:1};
    if(kind==='avert')return{eye:[-12,42,-97],target:[-32,38,-73],hole:[0,44,-115],shift:0,radius:1.15,departure:1};
    if(kind==='near')return{eye:[-4.8,45,-105],target:[0,44,-115],hole:[0,44,-115],shift:0,radius:1.8,departure:1};
    if(kind==='fates')return{eye:[-14,54,-97],target:[0,58,-115],hole:[0,58,-115],shift:0,radius:2.1,departure:1};
    // The complete wheels occupy the upper picture. Keep their material,
    // scale and eye behaviour; a modest pullback and lower aim leave the
    // five-reply exchange beneath them instead of printing through the eyes.
    return{eye:[-16.2,42,-90.7],target:[0,34,-115],hole:[0,44,-115],shift:0,radius:1.15,departure:1};
  }
  function compose(frame,{dt=0,stage={},stageId='dark',nodeId='start',semanticPhase='road',snap=false,override=null}={}){
    const scene=frame?.scene;if(!scene?.eye)return null;
    const heading=Number(frame.driveState?.heading)||0,body=scene.body||(()=>{const m=rotation(0,-heading);m[12]=scene.eye[0];m[14]=scene.eye[2];return m;})();
    const norm=rotation(0,heading),base=[body[12],Number(frame.driveState?.roadHeight)||0,body[14]],b=vector(norm,base);
    norm[12]=-b[0];norm[13]=-b[1];norm[14]=-b[2];const inverse=rigidInverse(norm);
    const cabEye=point(norm,scene.eye),props=(scene.props||[]).map(p=>placed(p,multiply(norm,instanceMatrix(p))));
    const wheelProp=props.find(p=>p.mesh==='drive_wheel'),wheel=wheelProp?[wheelProp.x,wheelProp.y+.05,wheelProp.z]:null;
    const kind=openingJourneyIntent({semanticPhase,stageId,nodeId}),next=desired(kind,stage,cabEye,wheel,scene.roadPitch||0);
    if(!pose)pose=desired('road',stage,cabEye,wheel,scene.roadPitch||0);
    if(kind!==intent){
      from={...pose,eye:[...pose.eye],target:[...pose.target],hole:[...pose.hole]};to=next;age=0;presented=0;
      duration=kind==='road'?0:kind==='body'?OPENING_JOURNEY.bodySeconds:kind==='school'?OPENING_JOURNEY.schoolSeconds
        :kind==='return'||kind==='reminder'?OPENING_JOURNEY.returnSeconds:kind==='windshield'?2.6:OPENING_JOURNEY.departureSeconds;
      if(reducedMotion&&kind!=='road'&&kind!=='windshield')duration=1.4;
      intent=kind;
    }
    const step=Math.max(0,Math.min(.1,Number(dt)||0));age=snap?duration+OPENING_JOURNEY.minimumEstablishment:age+step;clock+=step;presented++;
    // A completed cab shot follows the real bodily heave; a travelling shot
    // has fixed end points and cannot be retargeted by individual sentences.
    if(age>=duration&&cabModes.has(kind))to=next;
    const reducedCut=reducedMotion&&intent!=='road'&&intent!=='windshield'&&age<duration,
      opticalVeil=reducedCut?(age<.65?smooth(age/.65):1-smooth((age-.65)/.75)):0,
      u=reducedCut?(age<.65?0:1):smooth(duration?age/duration:1);let eye=vec(from.eye,to.eye,u);
    if(!reducedMotion&&from.departure!==to.departure){
      const leaving=to.departure>from.departure,c1=leaving?[from.eye[0],from.eye[1],from.eye[2]-9]:[from.eye[0],from.eye[1]-8,from.eye[2]+12],
        c2=leaving?[to.eye[0],to.eye[1]-8,to.eye[2]+12]:[to.eye[0],to.eye[1],to.eye[2]-9];
      eye=bezier(from.eye,c1,c2,to.eye,u);
    }
    pose={eye,target:vec(from.target,to.target,u),hole:vec(from.hole,to.hole,u),shift:lerp(from.shift,to.shift,u),radius:lerp(from.radius,to.radius,u),departure:lerp(from.departure,to.departure,u)};
    if(override)for(const key of['eye','target','hole','radius'])if(override[key]!==undefined)pose[key]=Array.isArray(override[key])?[...override[key]]:override[key];
    const delta=pose.target.map((n,k)=>n-pose.eye[k]),offsetYaw=(Number(frame.look?.yaw)||0)-heading,offsetPitch=(Number.isFinite(frame.look?.pitch)?frame.look.pitch:-.035)-(scene.roadPitch||0)+.035,
      yaw=Math.atan2(delta[0],-delta[2])+pose.shift+offsetYaw,pitch=Math.max(-1.1,Math.min(1.1,Math.atan2(delta[1],Math.hypot(delta[0],delta[2]))+offsetPitch));
    const lamps=(scene.lamps||[]).map(l=>transformLight(l,norm));
    // Restrained instrument spill makes the actual fingers readable against
    // the black wheel. It stays in the cab's coordinate frame and travels
    // through ordinary acquisition; no screen-space hand highlight.
    lamps.push({id:'opening-instrument-bounce',x:cabEye[0]-.10,y:1.46,z:-.51,
      color:[.72,.80,.68],intensity:.42,radius:1.05,penetration:0,castsShadow:false});
    const buildingAmount=smooth((pose.departure-.15)/.65);
    if(buildingAmount>.001)lamps.push(
      {id:'opening-ellery-moon',x:4,y:28,z:-106,color:[.57,.69,.86],intensity:2.3*buildingAmount,radius:90,penetration:1,castsShadow:false},
      {id:'opening-ellery-door-left',x:3.08,y:2.72,z:-132.28,color:[1,.78,.53],intensity:.65*buildingAmount,radius:4.5,penetration:0},
      {id:'opening-ellery-door-right',x:-1.10,y:2.72,z:-132.28,color:[1,.78,.53],intensity:.65*buildingAmount,radius:4.5,penetration:0});
    const transformedBody=multiply(norm,body),weather=frame.weather?{...frame.weather,worldToCabin:frame.weather.worldToCabin?multiply(frame.weather.worldToCabin,inverse):undefined,
      headlamps:(frame.weather.headlamps||[]).map(l=>transformLight(l,norm)),groundY:0}:frame.weather;
    const renderScene={...scene,eye:pose.eye,props:[...props,...memoryInstances],body:transformedBody,lamps,look:{yaw,pitch},driveLand:null,
      cut:{...scene.cut,lights:(scene.cut?.lights||[]).map(l=>transformLight(l,norm))},
      mirrors:pose.departure>.05?[]:(scene.mirrors||[]).map(m=>({...m,eye:point(norm,m.eye),yaw:m.yaw-heading})),
      cabLight:scene.cabLight?{...scene.cabLight,worldToCab:multiply(scene.cabLight.worldToCab,inverse)}:null,
      targets:(scene.targets||[]).map(p=>({...p,point:point(norm,p.point)})),cabPoint:scene.cabPoint?p=>point(norm,scene.cabPoint(p)):undefined,
      retroreflectors:(scene.retroreflectors||[]).map(p=>{const q=point(norm,[p.x,p.y,p.z]);return{...p,x:q[0],y:q[1],z:q[2]};}),rainShelter:null};
    last={intent,age,duration,established:age>=duration+OPENING_JOURNEY.minimumEstablishment&&presented>=2,eye:[...pose.eye],target:[...pose.target],hole:[...pose.hole],
      radius:pose.radius*(kind==='fates'?Math.max(1,(Number(stage.radius)||1)/1.3):1),departure:pose.departure,yaw,pitch,
      musicPhase:kind==='return'?'return':semanticPhase,opticalVeil,clock,normalization:Array.from(norm),renderOwner:'opening-drive',memoryInstanceCount:memoryInstances.length};
    const vehiclePose=frame.cinematic?.vehiclePose;
    return{...frame,scene:renderScene,weather,look:{yaw,pitch},driveState:{...frame.driveState,heading:0},cinematicLook:true,
      cinematic:frame.cinematic?{...frame.cinematic,vehiclePose:vehiclePose?{...vehiclePose,bodyMatrix:Array.from(transformedBody),heading:0,position:{x:transformedBody[12],y:transformedBody[13],z:transformedBody[14]}}:vehiclePose}:frame.cinematic,
      physicalHeadlampCones:false,prologue:{...last,lighting:{ambientColor:[.60,.67,.78],ambientIntensity:lerp(.065,.13,buildingAmount),captureExposure:lerp(5.5,2.3,buildingAmount),whitePointScale:1,screen:'stochastic'},allowLeaves:pose.departure<.05},journey:last};
  }
  return{compose,view:()=>last?{...last,eye:[...last.eye],hole:[...last.hole],target:[...last.target]}:null};
}
