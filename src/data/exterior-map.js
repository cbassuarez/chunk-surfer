// Public street survey, not a second interior plan. Existing street contracts
// own the parcels; no closed frontage gains an invented room or entrance.
import {DISTRICT_STREETS,DISTRICT_COURTS,YARD_SERVICE_RANGES,districtLogicalAt} from './exterior-district.js';
import {EXTERIOR_PUB,pubPhysicalExteriorAt,pubExteriorLogicalAt} from './exterior-pub.js';
import {yardTurnPoint,YARD_TURN_YAW} from './yard-turn.js';
import {CHURCH} from './st-brendans.js';
import {CONSERVATORY_PROPS} from './conservatory-props.js';
import {EXTERIOR_MAP_SHELL} from './generated/exterior-map-shell.js';
import {ZONE} from './floorplan/legend.js';
import {EXTERIOR_STATIONERS,STATIONERS_DOORS,STATIONERS_DOOR_PLACED} from './exterior-stationers.js';
import {SOUTH_ROW_SHOPS,PLAZA_SHOPFRONTS} from './plaza-shopfronts.js';
import {GLASS_COURT} from './glass-court.js';
export const EXTERIOR_MAP_FLOOR='district';
export const EXTERIOR_MAP_ZONES=Object.freeze([ZONE.dock,ZONE.street,ZONE.civicCourt,ZONE.serviceYard,ZONE.pub,ZONE.stationers]);
export const EXTERIOR_MAP_DEFINITION=Object.freeze({version:1,id:'ellery-district',topologyStride:2,
  floors:Object.freeze([{id:EXTERIOR_MAP_FLOOR,order:0,label:'ELLERY / OUTSIDE',shortLabel:'EXT',minHeight:-Infinity,maxHeight:Infinity,visibility:'always'}]),
  targets:[],spaces:[],landmarks:[]});
const rectangle=(x0,y0,x1,y1)=>[{x:x0,y:y0},{x:x1,y:y0},{x:x1,y:y1},{x:x0,y:y1}];
const yardLogical=(x,y)=>({x:50+x,y:200+y});
// A closed shop is marked at its public pavement, not given a false entrance.
// Use the same row/deed ownership and physical transform as the placed fascia.
function frontagePose(prop,renderedInstances=[]){
  return renderedInstances.find(p=>p.id===prop.id)||{x:prop.x-48+(Number(prop.renderOffsetX)||0),
    z:prop.y-338+(Number(prop.renderOffsetZ)||0),yaw:prop.yaw,scale:prop.scale,scaleX:prop.scaleX,scaleZ:prop.scaleZ};
}
function projectFromPose(pose,x,z){
  const c=Math.cos(pose.yaw||0),s=Math.sin(pose.yaw||0),sx=(pose.scale||1)*(pose.scaleX||1),sz=(pose.scale||1)*(pose.scaleZ||1);
  return{x:pose.x+c*x*sx-s*z*sz,y:pose.z+s*x*sx+c*z*sz};
}
function binderyPlacement({renderedInstances=[]}={}){
  const deed=SOUTH_ROW_SHOPS.find(shop=>shop.useId==='bindery');
  const row=CONSERVATORY_PROPS.find(prop=>prop.id===deed?.rowId);
  if(!row||!deed)return null;
  const z=-32+(deed.deed+.5)*8,pose=frontagePose(row,renderedInstances);
  return {rowId:row.id,deed:deed.deed,name:PLAZA_SHOPFRONTS[deed.useIndex].name,
    position:projectFromPose(pose,1.25,z)};
}
export function exteriorInstitutionCells({renderedInstances=[]}={}){
  const authored=CONSERVATORY_PROPS.find(p=>p.id===EXTERIOR_MAP_SHELL.propId);
  // Runtime capture supplies the exact rendered matrix. The fallback is the
  // same unrotated ground component's authored physical origin, for CPU tools.
  const pose=renderedInstances.find(p=>p.id===EXTERIOR_MAP_SHELL.propId)||{x:authored.x,z:authored.y,yaw:authored.yaw,scale:authored.scale};
  const cells=new Set(),c=Math.cos(pose.yaw||0),s=Math.sin(pose.yaw||0),sx=(pose.scale||1)*(pose.scaleX||1),sz=(pose.scale||1)*(pose.scaleZ||1);
  const origin=EXTERIOR_MAP_SHELL.origin,oc=Math.cos(origin.yaw),os=Math.sin(origin.yaw);
  for(const[z,x0,x1]of EXTERIOR_MAP_SHELL.runs)for(let x=x0;x<=x1;x++){
    const dx=x+.5-origin.x,dz=z+.5-origin.z,xx=(dx*oc+dz*os)/origin.scale*sx,zz=(-dx*os+dz*oc)/origin.scale*sz;
    cells.add(`${Math.floor(pose.x+xx*c-zz*s)},${Math.floor(pose.z+xx*s+zz*c)}`);
  }
  return cells;
}
export function exteriorMapFootprints({renderedInstances=[]}={}){
  const result=[]; // Ellery's occupied envelope is captured from the real plan.
  for(const range of YARD_SERVICE_RANGES){
    const pose=renderedInstances.find(p=>p.id===range.id)||{...yardTurnPoint(range.id,{x:range.physical.x,z:range.physical.y}),yaw:YARD_TURN_YAW};
    const pub=range.id===EXTERIOR_PUB.building?.id;
    result.push({id:pub?'lyric':range.id,sourcePropId:range.id,role:pub?'pub':'outbuilding',label:pub?'THE LYRIC':range.use.toUpperCase(),
      points:rectangle(-range.w/2,-range.d/2,range.w/2,range.d/2).map(p=>projectFromPose(pose,p.x,p.y))});
  }
  // These deeds use the same placed frontage origin, yaw, 8m rhythm, depth and
  // court mouth as buildDistrictFrontage(). The mouth remains empty at grade.
  // Anchored: each row's trade layer and per-shop inspectables share the row's
  // id prefix, and stamping eight deeds from every one of them filled the
  // sheet with offset duplicate rectangles.
  for(const prop of CONSERVATORY_PROPS.filter(p=>/^district-(?:west|east|north|south)-row-[a-z]$/.test(p.id))){
    const pose=frontagePose(prop,renderedInstances),workshop=prop.mesh.includes('workshop'),depth=workshop?6.8:5.4;
    const project=({x,y})=>projectFromPose(pose,x,y);
    for(let deed=0;deed<8;deed++){
      if(prop.mesh.includes('passage')&&deed===4)continue;
      if(prop.id===EXTERIOR_PUB.row.id&&EXTERIOR_PUB.row.deeds.includes(deed))continue;
      const stationers=prop.id===EXTERIOR_STATIONERS.row.id&&deed===EXTERIOR_STATIONERS.row.deed;
      const shop=SOUTH_ROW_SHOPS.find(shop=>shop.rowId===prop.id&&shop.deed===deed),bindery=shop?.useId==='bindery';
      result.push({id:`${prop.id}:${deed}`,role:stationers?'stationers':bindery?'bindery':'frontage',label:stationers?'STATIONERS':bindery?PLAZA_SHOPFRONTS[shop.useIndex].name:null,
        points:rectangle(-depth,-32+deed*8,0,-24+deed*8).map(project)});
    }
  }
  // Church rooms form one recognizable cruciform footprint, not a revealed
  // internal room list. Keep the original rectangle union without interior ink.
  for(const room of CHURCH.rooms)result.push({id:`church:${room.id}`,role:'church',label:null,
    points:rectangle(room.x0,room.y0,room.x1+1,room.y1+1)});
  // The glazed roof is an independent link after the old atrium roof is cut
  // away. Its current physical contract, not the retired scenic shell, owns
  // this narrow footprint between the two outdoor courts.
  const glassPose=renderedInstances.find(p=>p.id==='glass-court-frame')||{x:GLASS_COURT.origin.x,z:GLASS_COURT.origin.z};
  const roof=GLASS_COURT.roofBounds;
  result.push({id:'baths-greenhouse-link',sourcePropId:'glass-court-frame',role:'greenhouse',label:'GREENHOUSE',
    points:rectangle(roof.x0,roof.z0,roof.x1,roof.z1).map(p=>projectFromPose(glassPose,p.x,p.y))});
  if(!result.some(shape=>shape.id==='lyric')){
    const b=EXTERIOR_PUB.bounds;
    result.push({id:'lyric',role:'pub',label:'THE LYRIC',points:rectangle(b.x0,b.z0,b.x1,b.z1)});
  }
  return result;
}
export function exteriorMapTargets({renderedInstances=[]}={}){
  const pubDoor=EXTERIOR_PUB.doors[0],pub=pubPhysicalExteriorAt(pubDoor.id),bindery=binderyPlacement({renderedInstances});
  return [
    {id:'outside:van',label:'VAN / EQUIPMENT',shortLabel:'VAN',logical:{x:61,y:208},currentRadius:4},
    {id:'outside:shelter',label:'ARRIVAL SHELTER',shortLabel:'BUS',logical:{x:54.5,y:205},currentRadius:3},
    {id:'outside:loading-bay',label:'ELLERY / LOADING BAY',shortLabel:'BAY',logical:{x:56,y:10},doorIds:['dock-grey-exterior'],currentRadius:5},
    {id:'outside:lyric',label:'THE LYRIC / ENTRANCE',shortLabel:'THE LYRIC',logical:pubExteriorLogicalAt(pubDoor.id),physical:{x:pub.x,y:pub.z},doorIds:[pubDoor.id],currentRadius:4},
    ...(bindery?[{id:'outside:bindery',label:bindery.name+' / SHOPFRONT',shortLabel:'BINDERY',logical:districtLogicalAt(bindery.position.x,bindery.position.y),physical:bindery.position,currentRadius:3,access:'shopfront'}]:[]),
    {id:'outside:stationers',label:'STATIONERS / ENTRANCE',shortLabel:'SHOP',
      // A step out from the door, whichever way the shopfront faces.
      logical:{x:STATIONERS_DOORS[0].at.x+.25+EXTERIOR_STATIONERS.outward.x*1.5,y:STATIONERS_DOORS[0].at.y+.25+EXTERIOR_STATIONERS.outward.z*1.5},
      physical:{x:STATIONERS_DOOR_PLACED.x+EXTERIOR_STATIONERS.outward.x*1.25,y:STATIONERS_DOOR_PLACED.z+EXTERIOR_STATIONERS.outward.z*1.25},doorIds:[EXTERIOR_STATIONERS.door.id],currentRadius:3},
    {id:'outside:st-brendan',label:"ST BRENDAN'S / EXIT ONLY",shortLabel:'CHURCH',logical:yardLogical(CHURCH.doors[0].threshold.outside.x,CHURCH.doors[0].threshold.outside.y),doorIds:[CHURCH.doors[0].id],currentRadius:4,access:'exit-only',waypointable:false},
  ].map(target=>({floorId:EXTERIOR_MAP_FLOOR,visibility:'issued',selectable:true,waypointable:true,...target}));
}
export const EXTERIOR_MAP_STREETS=Object.freeze([...DISTRICT_STREETS,...DISTRICT_COURTS].map(street=>({id:street.id,
  points:rectangle(street.x0,street.y0,street.x1+1,street.y1+1),kind:street.kind||'street'})));
export const EXTERIOR_MAP_STREET_LABELS=Object.freeze(DISTRICT_STREETS.map(street=>({id:street.id,label:street.id.replace('-street','').toUpperCase()+' STREET',
  position:{x:(street.x0+street.x1)/2,y:(street.y0+street.y1)/2}})));
