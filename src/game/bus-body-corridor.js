// A local, finite organ passage. Progression/entry/expulsion belong to the
// calling runtime; this module owns only walkable space and its actual kit.
import {ZONE} from '../data/floorplan/legend.js';
import {ribPose} from './source-drive/cut/landscape-motion.js';
import {cageSecretionAt} from './source-drive/cut/physiology.js';
import {COSTAL_GLAND_ANCHORS,costalPointPose} from './source-drive/cut/costal-geometry.js';

export const BUS_BODY_CORRIDOR=Object.freeze({
  length:72,entryAlong:0,exitAlong:72,halfWidth:.55,bodyRadius:.25,
  portalExtension:.50,floor:.006,surfaceTolerance:.025,moduleStep:2.4,viewDistance:8.4,
  cageScale:Object.freeze([.07,.125,.15]),cageBase:-.10,
  floorCrossScale:.14,floorDepthScale:.003,floorUpperY:.014,floorLowerY:-.004,
  packURLs:Object.freeze({static:'/assets/source-drive/cut/cut-static.glb',
    additionalStatic:Object.freeze(['/assets/source-drive/cut/cut-roadside.glb']),
    character:Object.freeze(['/assets/source-drive/cut/cut-living.glb','/assets/source-drive/cut/cut-landscape.glb'])}),
  cageMeshes:Object.freeze(['cut_thoracic_bone','cut_sternum','cut_intercostal_depth','cut_intercostal_sheet','cut_intercostal_vessels']),
  materialContract:'existing opaque Cut albedo/normal/ORM; final world lighting and dither',
});
const C=BUS_BODY_CORRIDOR,finite=n=>Number.isFinite(n),clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const smooth=t=>{t=clamp(t,0,1);return t*t*t*(10+t*(-15+6*t));};
const derivative=t=>t>0&&t<1?30*t*t*(t-1)*(t-1):0;

export function busBodyCorridorCentre(along=0){
  const z=clamp(finite(along)?along:0,0,C.length),a=(z-7)/21,b=(z-34)/30;
  // The maximum lateral change over a .5m move is below .08m. A .10m overlap
  // of adjacent body-centre lanes therefore always contains a grid landing.
  const x=1.25*smooth(a)-2.50*smooth(b),slope=1.25/21*derivative(a)-2.50/30*derivative(b);
  return{x,y:C.floor,z:finite(along)?along:0,slope,yaw:Math.atan2(slope,1)};
}
export function busBodyCorridorContains(p,radius=0){
  if(!finite(p?.x)||!finite(p?.z)||!finite(radius)||radius<0||radius>C.halfWidth)return false;
  return p.z>=-C.portalExtension&&p.z<=C.length+C.portalExtension
    &&Math.abs(p.x-busBodyCorridorCentre(p.z).x)<=C.halfWidth-radius+1e-8;
}
export function busBodyCorridorFloorAt(p){return busBodyCorridorContains(p)?C.floor:0;}
export function busBodyCorridorCanStep(from,to,{radius=C.bodyRadius}={}){
  if(!busBodyCorridorContains(from,radius)||!busBodyCorridorContains(to,radius))return false;
  const steps=Math.max(1,Math.ceil(Math.hypot(to.x-from.x,to.z-from.z)/.035));
  for(let i=1;i<steps;i++){const t=i/steps;if(!busBodyCorridorContains({x:from.x+(to.x-from.x)*t,z:from.z+(to.z-from.z)*t},radius))return false;}
  return true;
}
export function busBodyCorridorFooting(p){return{height:busBodyCorridorFloorAt(p),surface:'wet living fascia',traction:.72,softLayerDepth:C.surfaceTolerance};}

function originOf(origin={}){return{x:finite(origin.x)?origin.x:0,y:finite(origin.y)?origin.y:0,z:finite(origin.z)?origin.z:0,yaw:finite(origin.yaw)?origin.yaw:0};}
function worldPoint(origin,p){const c=Math.cos(origin.yaw),s=Math.sin(origin.yaw);return[origin.x+p[0]*c+p[2]*s,origin.y+p[1],origin.z-p[0]*s+p[2]*c];}
function worldVector(yaw,p){const c=Math.cos(yaw),s=Math.sin(yaw);return[p[0]*c+p[2]*s,p[1],-p[0]*s+p[2]*c];}
function frameMatrix(origin,along,{offset=[0,0,0],scale=[1,1,1],floor=false,yawOffset=0}={}){
  const centre=busBodyCorridorCentre(along),yaw=origin.yaw+centre.yaw+yawOffset;
  const off=worldVector(centre.yaw,offset),p=worldPoint(origin,[centre.x+off[0],off[1],along+off[2]]);
  const x=floor?worldVector(yaw,[0,-C.floorDepthScale,0]):worldVector(yaw,[scale[0],0,0]);
  const y=floor?worldVector(yaw,[C.floorCrossScale,0,0]):[0,scale[1],0];
  const z=worldVector(yaw,[0,0,scale[2]]);
  return new Float32Array([...x,0,...y,0,...z,0,...p,1]);
}
function placed(mesh,matrix,id,character,part){return{id,mesh,matrix,x:matrix[12],y:matrix[13],z:matrix[14],zone:ZONE.sourceSpace,
  structural:true,skyExposed:false,sourceStructure:'bus-body-corridor',corridorPart:part,...(character?{character}: {})};}
function characterAt(along,clock,reducedMotion){
  const pose=ribPose({timeSec:clock,furthest:1100,distance:850+along*.25,id:`bus-organ-${along}`,evolution:{reveal:1,ribcage:1,wave:0}});
  if(reducedMotion)pose.morphs={tension:.12,shear:0,breath:1,recoil:.04};
  return pose;
}
function modules(progress){const list=[];for(let i=-1;i<=30;i++){const z=1.2+i*C.moduleStep;if(Math.abs(z-progress)<=C.viewDistance+1.8)list.push({i,z});}return list;}

export function busBodyCorridorProps({origin={},clock=0,reducedMotion=false,progress=0}={}){
  origin=originOf(origin);clock=finite(clock)?Math.max(0,clock):0;progress=clamp(finite(progress)?progress:0,0,C.length);
  const props=[];
  for(const{i,z}of modules(progress)){
    const pose=characterAt(z,clock,reducedMotion),cage=frameMatrix(origin,z,{offset:[0,C.cageBase,0],scale:C.cageScale});
    for(const mesh of C.cageMeshes)props.push(placed(mesh,cage,`bus-organ-${i}:${mesh}`,pose,'cage'));
    // Two real opaque wet sheets, staggered by four authored metres, cover
    // one another's cut apertures. Their shallow, separate thickness remains
    // below/within the supported soft layer rather than becoming a paving card.
    for(const[layer,shift,y]of[[0,0,C.floorUpperY],[1,.60,C.floorLowerY]]){
      const at=z+shift,m=frameMatrix(origin,at,{offset:[-7.57*C.floorCrossScale,y,0],scale:[1,1,.15],floor:true});
      props.push(placed('cut_fascia',m,`bus-organ-${i}:floor-${layer}`,{joints:{},morphs:{tension:0,shear:0,breath:0,recoil:0}},'floor'));
    }
    if(i>=0&&i%3===1)for(const[index,site]of COSTAL_GLAND_ANCHORS.entries()){
      const q=costalPointPose(site.point,pose.morphs,site.side),local=[q[0]*C.cageScale[0],C.cageBase+q[1]*C.cageScale[1],q[2]*C.cageScale[2]];
      const seq=cageSecretionAt({timeSec:clock,furthest:1100,distance:850+z*.25,index}),w=reducedMotion?{tension:.15,shear:0,breath:0,recoil:0}:{tension:seq.bead,shear:seq.extension,breath:0,recoil:seq.drip};
      const m=frameMatrix(origin,z,{offset:local,scale:[.12,.12,.12],yawOffset:site.side<0?Math.PI:0});
      props.push(placed('cut_costal_glands',m,`bus-organ-${i}:gland-${index}`,{joints:{},morphs:w},'gland'));
      props.push(placed('cut_costal_secretions',m,`bus-organ-${i}:secretion-${index}`,{joints:{},morphs:w},'secretion'));
    }
  }
  for(const gate of gateStations())if(Math.abs(gate.z-progress)<C.viewDistance+3){
    const m=frameMatrix(origin,gate.z,{offset:[gate.side*1.10,-.20,0],scale:[.60,.60,.60],yawOffset:gate.side>0?Math.PI:0});
    props.push(placed('cut_inspection_lamp',m,`bus-organ:practical-${gate.index}`,undefined,'practical'));
  }
  return props;
}
function gateStations(){return[1.2,15.6,30,44.4,58.8,70.8].map((z,index)=>({z,index,side:index%2?1:-1}));}
export function busBodyCorridorLights({origin={},progress=0}={}){
  origin=originOf(origin);progress=clamp(finite(progress)?progress:0,0,C.length);const lights=[];
  for(const gate of gateStations()){
    if(Math.abs(gate.z-progress)>=C.viewDistance+3)continue;
    const centre=busBodyCorridorCentre(gate.z),yaw=origin.yaw+centre.yaw,offset=worldVector(centre.yaw,[gate.side*(1.10-.335*.60),2.296,0]);
    const p=worldPoint(origin,[centre.x+offset[0],offset[1],gate.z+offset[2]]),d=worldVector(yaw,[-gate.side*.94,-.20,.25]),length=Math.hypot(...d);
    lights.push({id:`bus-organ:practical-${gate.index}`,x:p[0],y:p[1],z:p[2],color:[.83,.77,.61],intensity:.72,radius:5.8,penetration:1,direction:d.map(v=>v/length),along:gate.z,
      distanceM:Math.abs(gate.z-progress),fixtureMesh:'cut_inspection_lamp'});
  }
  return lights.sort((a,b)=>a.distanceM-b.distanceM).slice(0,3);
}
