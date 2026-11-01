// Physical street construction for Ellery's ring and Ellery Square.
//
// The section is a Leeds one (Transport SPD 2023 ¶291, ¶747): four metres of
// flags each side of a six-metre carriageway on the ring, three metres along
// the square's houses and two along its railings. The kerbs are not authored
// here. The builder walks the compiled floor plan and puts a kerb wherever a
// pavement glyph meets a carriageway glyph, so the drawn kerb and the step the
// player actually climbs are the same line, crossings and corners included.
import {gridDrawnHeight} from './main-stair-geometry.js';
const freeze=v=>{if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};

export const EXTERIOR_STREET_FABRIC=freeze({
  revision:'ellery-street-fabric-2',pack:'/assets/exterior-street-fabric.glb',origin:{x:64,z:46},
  meshNames:['exterior_street_kerbs','exterior_street_crossings','exterior_street_markings','exterior_street_services','exterior_street_nameplates','exterior_street_wall_services'],
  maximumTriangles:48000,maximumBytes:6000000,
  section:{carriagewayWidth:6,footwayWidth:4,roadFloor:0,footwayFloor:.12,
    // Granite kerb, 300 mm top; a two-sett channel inside it.
    kerbTop:.30,kerbProud:.012,channelWidth:.30,stoneLength:.915},
  // The floor grid draws heights in 32/255 m steps: the road at 31 mm and the
  // pavement at 157 mm. A 126 mm drawn kerb, inside Leeds' 100–125 mm upstand
  // to the millimetre that matters. Everything here is built on drawn heights.
  drawnSection:{roadFloor:gridDrawnHeight(0),footwayFloor:gridDrawnHeight(.12)},
  // Glyph rectangle the builder scans for kerbs: the ring, its courts and the square.
  scan:{x0:-16,x1:166,z0:-62,z1:126},
  // Ring streets, carriageway centre on the floor grid (glyph o covers o-.25..o+.75).
  streets:[
    {id:'north',axis:'x',centre:-7.25,from:-.25,to:128.75},
    {id:'south',axis:'x',centre:99.75,from:-.25,to:128.75},
    {id:'west',axis:'z',centre:-7.25,from:-.25,to:92.75},
    {id:'east',axis:'z',centre:135.75,from:-.25,to:92.75},
  ],
  gullies:{pitch:24,first:8,length:.64,width:.34,clearOfCrossing:3.5},
  // One coherent utility alignment per pavement, 1.4 m off the building line.
  // Covers are flush and their adjoining repaired flags follow the same line.
  covers:[
    {id:'north-electric',street:'north',side:-1,along:23.95,length:1.12,width:.62,use:'electricity'},
    {id:'north-telecom',street:'north',side:1,along:108.55,length:1.20,width:.62,use:'telecommunications'},
    {id:'south-electric',street:'south',side:1,along:64.15,length:1.12,width:.62,use:'electricity'},
    {id:'south-telecom',street:'south',side:-1,along:110.95,length:1.20,width:.62,use:'telecommunications'},
    {id:'west-electric',street:'west',side:-1,along:41.65,length:1.12,width:.62,use:'electricity'},
    {id:'east-electric',street:'east',side:1,along:65.35,length:1.12,width:.62,use:'electricity'},
  ],
  coverCross:5.6,
  // Waiting restrictions. Double yellow lines (TSRGD diagram 1018.1, 75 mm
  // primrose, 75 mm apart) run along every kerb except the bus stop clearway,
  // the parking bays and the signal crossing's zigzags.
  markings:{yellowWidth:.075,yellowOffsets:[.10,.25],baySpan:6,bayWidth:2.2,bayDash:[1,.5],paintWidth:.10},
  busStopClearway:{line:-10.25,toRoad:1,z0:10,z1:22,width:2.6},
  // The signal crossing's zigzags reach 21.6 m either side of its centre.
  zigzagZone:{line:[-10.25,-4.25],x0:56,x1:100.5},
  nameplates:[
    {id:'street-name-ellery-square',text:'ELLERY SQUARE',center:[50.18,4.12,-24.6],normal:[1,0,0],widthM:1.84,heightM:.25},
    {id:'street-name-west-mews',text:'WEST MEWS',center:[-14.82,4.12,29.2],normal:[1,0,0],widthM:1.44,heightM:.25},
    {id:'street-name-workshop',text:'WORKSHOP COURT',center:[142.82,4.12,21.2],normal:[-1,0,0],widthM:1.94,heightM:.25},
    {id:'street-name-lyric-yard',text:'LYRIC YARD',center:[80.8,4.12,106.82],normal:[0,0,-1],widthM:1.54,heightM:.25},
  ],
  wallServices:{localZ:15.1,clearOfIndustrialDoorEdge:.38,backX:0,frontX:.306,maxHeight:4.1},
  research:{
    streetSection:'Leeds Transport SPD (2023) ¶291: 2.0 m minimum, 3.0 m by shops and bus stops. Ring 4.0 | 6.0 | 4.0; square 3.0 | 5.0 one-way | 2.0.',
    kerbs:'¶747: 100 mm upstand, 125 mm at bus stops; drawn 126 mm. ¶748: dropped flush at crossings. Inclusive Mobility 2021 §4.11.',
    tactile:'Inclusive Mobility 2021 §6.1: blister red at the signal crossing only, buff at uncontrolled crossings; 800 mm deep.',
    furniture:'Counts from OpenStreetMap for Park Square, Boar Lane and Hyde Park, Leeds (29 Oct 2026); posts 600 mm off the kerb face.',
  },
});
export const STREET_PARKING_BAYS=freeze([
  // Cars stand 350 mm off the kerb face, on the half-metre grid props snap to;
  // `toRoad` points from the kerb into the road.
  {id:'district-south-car-west',page:'district',x:42,z:101.5,yaw:Math.PI/2,line:102.75,toRoad:-1},
  {id:'district-south-car-east',page:'district',x:116,z:101.5,yaw:Math.PI/2,line:102.75,toRoad:-1},
  {id:'district-west-car-north',page:'district',x:-9,z:43,yaw:0,line:-10.25,toRoad:1},
  {id:'district-west-car-south',page:'district',x:-9,z:75,yaw:0,line:-10.25,toRoad:1},
  {id:'district-east-car-north',page:'district',x:134,z:46,yaw:0,line:132.75,toRoad:1},
  {id:'district-east-car-south',page:'district',x:134,z:84,yaw:0,line:132.75,toRoad:1},
  {id:'ellery-square-car-west-north',page:'square',x:56.5,z:-46,yaw:0,line:57.75,toRoad:-1},
  {id:'ellery-square-car-west-south',page:'square',x:56.5,z:-28,yaw:0,line:57.75,toRoad:-1},
  {id:'ellery-square-car-north-west',page:'square',x:68,z:-53.5,yaw:Math.PI/2,line:-52.25,toRoad:-1},
  {id:'ellery-square-car-north-east',page:'square',x:104,z:-53.5,yaw:Math.PI/2,line:-52.25,toRoad:-1},
  {id:'ellery-square-car-east-north',page:'square',x:115,z:-44,yaw:0,line:113.75,toRoad:1},
]);
// The fabric reaches from the square's north terrace to the Lyric yard; the
// footprint is centred on the pack origin, so it spans the farther side twice.
export const EXTERIOR_STREET_FABRIC_MESHES=freeze(Object.fromEntries(EXTERIOR_STREET_FABRIC.meshNames.map(mesh=>[mesh,mesh==='exterior_street_wall_services'?{w:.32,d:.64,h:4.1,blocks:false}:{w:206,d:218,h:4.4,blocks:false}])));
export const EXTERIOR_STREET_FABRIC_PROPS=freeze(EXTERIOR_STREET_FABRIC.meshNames.filter(m=>m!=='exterior_street_wall_services').map(mesh=>({id:mesh.replaceAll('_','-'),mesh,physical:{...EXTERIOR_STREET_FABRIC.origin},yaw:0,floorOverride:0,elevation:0,interactive:false,structural:true,blocks:false,renderGroups:['ground'],skyExposed:true})));

export function streetFabricPoint(street,along,cross,height=0){
  return street.axis==='x'?[along,height,street.centre+cross]:[street.centre+cross,height,along];
}

export const EXTERIOR_STREET_LAMP=freeze({
  // Shared with the newly wall-bracketed ordinary frontage geometry.
  localX:1.10,localY:5.80,localZ:[-25,-9,9,25],
  color:[1,.82,.58],intensity:.73,radius:10.5,penetration:.02,
  meshNames:['district_terrace_frontage','district_passage_frontage','district_workshop_frontage'],
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
