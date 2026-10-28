// Physical street construction for Ellery's existing ring. No new walkable
// space, road, crossing, interaction or procedural street is introduced.
import {STREET_PILOT} from './street-pilot.js';
import {EXTERIOR_FOREGROUND} from './exterior-foreground.js';
import {gridDrawnHeight} from './main-stair-geometry.js';
const freeze=v=>{if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};

export const EXTERIOR_STREET_FABRIC=freeze({
  revision:'ellery-street-fabric-1',pack:'/assets/exterior-street-fabric.glb',origin:{x:64,z:46},
  meshNames:['exterior_street_kerbs','exterior_street_paving_joints','exterior_street_services','exterior_street_nameplates','exterior_street_wall_services'],
  maximumTriangles:33000,maximumBytes:5000000,
  section:{carriagewayWidth:6,settMarginWidth:2,footwayWidth:2,roadFloor:0,settFloor:.025,footwayFloor:.12,kerbWidth:.15},
  drawnSection:{roadFloor:gridDrawnHeight(0),settFloor:gridDrawnHeight(.025),footwayFloor:gridDrawnHeight(.12)},
  protectedPilot:{...STREET_PILOT.patch},
  busStopFootway:{...EXTERIOR_FOREGROUND.busStop.footway},
  // Normal straights terminate at the genuine junction mouths. Inner kerb
  // returns alone continue to the block's four square grid-owned corners.
  streets:[
    {id:'north',axis:'x',centre:-7.5,from:-.5,to:128.5},
    {id:'south',axis:'x',centre:99.5,from:-.5,to:128.5},
    {id:'west',axis:'z',centre:-7.5,from:-.5,to:92.5},
    {id:'east',axis:'z',centre:135.5,from:-.5,to:92.5},
  ],
  kerbJointPitch:1.2,kerbJointGap:.014,flagAlong:.90,flagAcross:.60,flagJoint:.014,
  gullies:{pitch:24,length:.64,width:.34,slotWidth:.055,slotPitch:.095},
  // One coherent utility alignment per pavement. Covers are flush and their
  // adjoining repaired flags follow the same alignment, never random scatter.
  covers:[
    {id:'north-electric',street:'north',side:-1,along:23.7,length:1.12,width:.62,use:'electricity'},
    {id:'north-telecom',street:'north',side:1,along:108.3,length:1.20,width:.62,use:'telecommunications'},
    {id:'south-electric',street:'south',side:1,along:63.9,length:1.12,width:.62,use:'electricity'},
    {id:'south-telecom',street:'south',side:-1,along:110.7,length:1.20,width:.62,use:'telecommunications'},
    {id:'west-electric',street:'west',side:-1,along:41.4,length:1.12,width:.62,use:'electricity'},
    {id:'east-electric',street:'east',side:1,along:65.1,length:1.12,width:.62,use:'electricity'},
  ],
  nameplates:[
    {id:'street-name-borough',text:'BOROUGH PASSAGE',center:[83.2,4.12,-14.82],normal:[0,0,1],widthM:1.94,heightM:.25},
    {id:'street-name-west-mews',text:'WEST MEWS',center:[-14.82,4.12,29.2],normal:[1,0,0],widthM:1.44,heightM:.25},
    {id:'street-name-workshop',text:'WORKSHOP COURT',center:[142.82,4.12,21.2],normal:[-1,0,0],widthM:1.94,heightM:.25},
    {id:'street-name-lyric-yard',text:'LYRIC YARD',center:[80.8,4.12,106.82],normal:[0,0,-1],widthM:1.54,heightM:.25},
  ],
  wallServices:{localZ:15.1,clearOfIndustrialDoorEdge:.38,backX:0,frontX:.306,maxHeight:4.1},
  research:{
    streetSection:'Existing authored 14m section, retained rather than represented as a new municipal standard.',
    accessibility:'Keep the existing two-metre footways unobstructed. Furniture and wall services remain outside their walking surfaces.',
    utilities:'Buried power and telecoms evidenced by aligned covers, repaired flags and wall terminations; no speculative overhead poles.',
    materials:'Weathered stone kerbs/flags, road-side drainage and later sealed service repairs. No new traffic restriction signs.',
  },
});
export const EXTERIOR_STREET_FABRIC_MESHES=freeze(Object.fromEntries(EXTERIOR_STREET_FABRIC.meshNames.map(mesh=>[mesh,mesh==='exterior_street_wall_services'?{w:.32,d:.64,h:4.1,blocks:false}:{w:158,d:122,h:4.4,blocks:false}])));
export const EXTERIOR_STREET_FABRIC_PROPS=freeze(EXTERIOR_STREET_FABRIC.meshNames.filter(m=>m!=='exterior_street_wall_services').map(mesh=>({id:mesh.replaceAll('_','-'),mesh,physical:{...EXTERIOR_STREET_FABRIC.origin},yaw:0,floorOverride:0,elevation:0,interactive:false,structural:true,blocks:false,renderGroups:['ground'],skyExposed:true})));

export function streetFabricPoint(street,along,cross,height=0){
  return street.axis==='x'?[along,height,street.centre+cross]:[street.centre+cross,height,along];
}
export function streetFabricInPilot(x,z,padding=0){const p=EXTERIOR_STREET_FABRIC.protectedPilot;return x>=p.x0-padding&&x<=p.x1+padding&&z>=p.z0-padding&&z<=p.z1+padding;}

export const EXTERIOR_STREET_LAMP=freeze({
  // Shared with the newly wall-bracketed ordinary frontage geometry.
  localX:1.10,localY:5.80,localZ:[-25,-9,9,25],
  color:[1,.82,.58],intensity:.73,radius:10.5,penetration:.02,
  meshNames:['district_terrace_frontage','district_terrace_frontage_stationer','district_passage_frontage','district_workshop_frontage'],
});
const finite=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f;
function localPoint(row,x,y,z){const yaw=finite(row.yaw),c=Math.cos(yaw),s=Math.sin(yaw),scale=finite(row.scale,1),sx=scale*finite(row.scaleX,1),sz=scale*finite(row.scaleZ,1);return{x:row.x+c*x*sx-s*z*sz,y:finite(row.y)+y*scale,z:row.z+s*x*sx+c*z*sz};}

// Supply physical runtime row instances, not logical prop addresses. Root's
// ordinary light selector retains responsibility for the global source budget.
export function exteriorStreetLampLights({rows=[],origin={x:0,z:0},maxDistance=36,maxLights=4}={}){
  const lamps=[];
  for(const row of rows){
    if(!Number.isFinite(row.x)||!Number.isFinite(row.z)||!EXTERIOR_STREET_LAMP.meshNames.includes(row.mesh))continue;
    for(const z of EXTERIOR_STREET_LAMP.localZ){
      const point=localPoint(row,EXTERIOR_STREET_LAMP.localX,EXTERIOR_STREET_LAMP.localY,z),distance=Math.hypot(point.x-finite(origin.x),point.z-finite(origin.z));
      if(distance>Math.max(0,finite(maxDistance)))continue;
      lamps.push({id:`${row.id}:road-supply-lamp:${z}`,...point,sourcePosition:{...point},distance,color:[...EXTERIOR_STREET_LAMP.color],intensity:EXTERIOR_STREET_LAMP.intensity,radius:EXTERIOR_STREET_LAMP.radius,penetration:EXTERIOR_STREET_LAMP.penetration,kind:'fitting',spilling:false,circuit:null,maintained:true,nominalIntensity:EXTERIOR_STREET_LAMP.intensity,emissiveScale:1,castsShadow:false,zone:17,powerMode:'external'});
    }
  }
  return lamps.sort((a,b)=>a.distance-b.distance||a.id.localeCompare(b.id)).slice(0,Math.max(0,Math.floor(finite(maxLights))));
}

export function exteriorStreetWallServiceInstances(rows=[]){
  return rows.filter(r=>r.mesh==='district_workshop_frontage'&&Number.isFinite(r.x)&&Number.isFinite(r.z)).map(row=>({
    id:`${row.id}:wall-services`,mesh:'exterior_street_wall_services',...localPoint(row,0,0,EXTERIOR_STREET_FABRIC.wallServices.localZ),yaw:finite(row.yaw),scale:finite(row.scale,1),structural:true,interactive:false,blocks:false,zone:17,renderGroups:['ground'],skyExposed:true,
  }));
}
