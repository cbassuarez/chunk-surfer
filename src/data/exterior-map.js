// Public street survey, not a second interior plan. Existing street contracts
// own the parcels; no closed frontage gains an invented room or entrance.
import {DISTRICT_STREETS,DISTRICT_COURTS,YARD_SERVICE_RANGES,districtLogicalAt} from './exterior-district.js';
import {EXTERIOR_PUB,pubExteriorAt,pubExteriorLogicalAt} from './exterior-pub.js';
import {CHURCH} from './st-brendans.js';
import {CONSERVATORY_PROPS} from './conservatory-props.js';
import {EXTERIOR_MAP_SHELL} from './generated/exterior-map-shell.js';
import {ZONE} from './floorplan/legend.js';
import {EXTERIOR_STATIONERS,STATIONERS_DOORS} from './exterior-stationers.js';
import {SOUTH_ROW_SHOPS,PLAZA_SHOPFRONTS} from './plaza-shopfronts.js';
export const EXTERIOR_MAP_FLOOR='district';
export const EXTERIOR_MAP_ZONES=Object.freeze([ZONE.dock,ZONE.street,ZONE.civicCourt,ZONE.serviceYard,ZONE.pub,ZONE.stationers]);
export const EXTERIOR_MAP_DEFINITION=Object.freeze({version:1,id:'ellery-district',topologyStride:2,
  floors:Object.freeze([{id:EXTERIOR_MAP_FLOOR,order:0,label:'ELLERY / OUTSIDE',shortLabel:'EXT',minHeight:-Infinity,maxHeight:Infinity,visibility:'always'}]),
  targets:[],spaces:[],landmarks:[]});
const rectangle=(x0,y0,x1,y1)=>[{x:x0,y:y0},{x:x1,y:y0},{x:x1,y:y1},{x:x0,y:y1}];
const yardLogical=(x,y)=>({x:50+x,y:200+y});
// A closed shop is marked at its public pavement, not given a false entrance.
// Use the same row/deed ownership and physical transform as the placed fascia.
function binderyPlacement(){
  const deed=SOUTH_ROW_SHOPS.find(shop=>shop.useId==='bindery');
  const row=CONSERVATORY_PROPS.find(prop=>prop.id===deed?.rowId);
  if(!row||!deed)return null;
  const c=Math.cos(row.yaw||0),s=Math.sin(row.yaw||0),z=-32+(deed.deed+.5)*8;
  const origin={x:row.x-48+(Number(row.renderOffsetX)||0),y:row.y-338+(Number(row.renderOffsetZ)||0)};
  return {rowId:row.id,deed:deed.deed,name:PLAZA_SHOPFRONTS[deed.useIndex].name,
    position:{x:origin.x+c*1.25-s*z,y:origin.y+s*1.25+c*z}};
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
export function exteriorMapFootprints(){
  const result=[]; // Ellery's occupied envelope is captured from the real plan.
  for(const range of YARD_SERVICE_RANGES)result.push({id:range.id,role:'outbuilding',label:range.use.toUpperCase(),
    points:rectangle(range.physical.x-range.w/2,range.physical.y-range.d/2,range.physical.x+range.w/2,range.physical.y+range.d/2)});
  // These deeds use the same placed frontage origin, yaw, 8m rhythm, depth and
  // court mouth as buildDistrictFrontage(). The mouth remains empty at grade.
  for(const prop of CONSERVATORY_PROPS.filter(p=>/^district-(?:west|east|north|south)-row-/.test(p.id))){
    const origin={x:prop.x-48+(Number(prop.renderOffsetX)||0),y:prop.y-338+(Number(prop.renderOffsetZ)||0)};
    const c=Math.cos(prop.yaw||0),s=Math.sin(prop.yaw||0),workshop=prop.mesh.includes('workshop'),depth=workshop?6.8:5.4;
    const project=({x,y})=>({x:origin.x+c*x-s*y,y:origin.y+s*x+c*y});
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
  const b=EXTERIOR_PUB.bounds;
  result.push({id:'lyric',role:'pub',label:'THE LYRIC',points:rectangle(b.x0,b.z0,b.x1,b.z1)});
  return result;
}
export function exteriorMapTargets(){
  const pubDoor=EXTERIOR_PUB.doors[0],pub=pubExteriorAt(pubDoor.id),bindery=binderyPlacement();
  return [
    {id:'outside:van',label:'VAN / EQUIPMENT',shortLabel:'VAN',logical:{x:61,y:208},currentRadius:4},
    {id:'outside:shelter',label:'ARRIVAL SHELTER',shortLabel:'BUS',logical:{x:54.5,y:205},currentRadius:3},
    {id:'outside:loading-bay',label:'ELLERY / LOADING BAY',shortLabel:'BAY',logical:{x:56,y:10},doorIds:['dock-grey-exterior'],currentRadius:5},
    {id:'outside:lyric',label:'THE LYRIC / ENTRANCE',shortLabel:'THE LYRIC',logical:pubExteriorLogicalAt(pubDoor.id),physical:{x:pub.x,y:pub.z},doorIds:[pubDoor.id],currentRadius:4},
    ...(bindery?[{id:'outside:bindery',label:bindery.name+' / SHOPFRONT',shortLabel:'BINDERY',logical:districtLogicalAt(bindery.position.x,bindery.position.y),physical:bindery.position,currentRadius:3,access:'shopfront'}]:[]),
    {id:'outside:stationers',label:'STATIONERS / ENTRANCE',shortLabel:'SHOP',
      logical:{x:STATIONERS_DOORS[0].at.x+.25,y:STATIONERS_DOORS[0].at.y+1.5},
      physical:{x:EXTERIOR_STATIONERS.door.x,y:EXTERIOR_STATIONERS.door.z+1.25},doorIds:[EXTERIOR_STATIONERS.door.id],currentRadius:3},
    {id:'outside:st-brendan',label:"ST BRENDAN'S / EXIT ONLY",shortLabel:'CHURCH',logical:yardLogical(CHURCH.doors[0].threshold.outside.x,CHURCH.doors[0].threshold.outside.y),doorIds:[CHURCH.doors[0].id],currentRadius:4,access:'exit-only',waypointable:false},
  ].map(target=>({floorId:EXTERIOR_MAP_FLOOR,visibility:'issued',selectable:true,waypointable:true,...target}));
}
export const EXTERIOR_MAP_STREETS=Object.freeze([...DISTRICT_STREETS,...DISTRICT_COURTS].map(street=>({id:street.id,
  points:rectangle(street.x0,street.y0,street.x1+1,street.y1+1),kind:street.kind||'street'})));
export const EXTERIOR_MAP_STREET_LABELS=Object.freeze(DISTRICT_STREETS.map(street=>({id:street.id,label:street.id.replace('-street','').toUpperCase()+' STREET',
  position:{x:(street.x0+street.x1)/2,y:(street.y0+street.y1)/2}})));
