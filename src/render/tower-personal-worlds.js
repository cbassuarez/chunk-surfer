// Authored pieces use the same metre-space as the circuit's saved supports and
// thresholds. No layout or performance function advances story state.
import { towerPersonalWorld } from '../data/tower-personal-journey.js';
import { towerPersonalGeometry } from './tower-personal-meshes.js';
import { PROP_BOUNDS } from '../data/generated/prop-geometry.js';
import { recordistTransferFrame, recordistCharacterPose, recordistCharacterDescriptor, recordistHeadphoneCollar,
  RECORDIST_BOY_ORIGIN, RECORDIST_WORK_ORIGIN, RECORDIST_WORK_MACHINE } from './recordist-character-performance.js';

const freeze = (value) => {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
  return value;
};
const meshBounds = new Map(towerPersonalGeometry().map(piece => [piece.name, piece.bounds]));
const piece = (id, mesh, localX, localZ, extra = {}) => ({ id, mesh, localX, localZ,
  yaw: 0, pitch: 0, height: 0, scaleX: 1, scaleY: 1, scaleZ: 1,
  solid: false, permanent: false, figure: false, ...extra,
  ...(extra.solid && !extra.bounds ? { bounds: meshBounds.get(mesh) || PROP_BOUNDS[mesh] } : {}),
});
const scaled = scale => ({ scaleX: scale, scaleY: scale, scaleZ: scale });
const put = (out, ...args) => out.push(piece(...args));

function portal(out, door, stage) {
  const { x, z } = door.center, id = door.id === 'entrance' || door.id === 'road-exit' ? 'land-return-door' : 'land-door';
  const look = id === 'land-return-door' ? stage === 'school-hall' ? 'land.school-hall.entrance' : 'land.return-hall.door' : stage === 'school-hall' || stage === 'return-hall'
    ? 'land.school-hall.door' : stage === 'tape-field' ? 'land.tape-field.door'
    : stage === 'dead-broadcast' ? 'land.dead-broadcast.door' : 'land.ash-room.door';
  // The two jambs own physical blocking; the aperture remains a full 2.7m.
  for (const side of [-1, 1]) put(out, `${id}-${door.id}-jamb-${side}`, 'tower_personal_portal_jamb', x + side * 1.425, z,
    { solid: true, permanent: true, collapseGroup: `portal-${door.id}` });
  put(out, `${id}-${door.id}-head`, 'tower_personal_portal_head', x, z, { height: 2.6, permanent: true });
  put(out, `${id}-${door.id}-leaf`, 'tower_personal_portal_leaf', x + 1.35, z,
    { yaw: Math.PI / 2, solid: true, permanent: true });
  put(out, id + (door.id === 'back' ? '-back' : ''), 'tower_personal_threshold', x, z,
    { look, door: true, doorId: door.id, permanent: true });
  put(out, `${id}-${door.id}-lamp`, 'station_work_lamp', x - 1.65, z,
    { height: 2.1, permanent: true, emissive: [1, .76, .44, 1.35] });
}

function lead(out, id, from, to, look = null) {
  put(out, id, 'tower_personal_tape_lead', from[0], from[1], {
    yaw: -Math.atan2(to[0] - from[0], from[1] - to[1]),
    scaleZ: Math.hypot(to[0] - from[0], to[1] - from[1]) / 12,
    ...(look ? { look } : {}),
  });
}

function hall(out) {
  put(out,'land-boy-chair','tower_personal_child_chair',RECORDIST_BOY_ORIGIN[0],RECORDIST_BOY_ORIGIN[2],
    {solid:true,collapseGroup:'land-handover'});
  put(out, 'land-stage', 'school_stage', -3, -8.5, { scaleX: .65, solid: true, look: 'land.school-hall.stage' });
  put(out, 'land-bar', 'school_light_bar', -3, -7.2, { height: 3.45, scaleX: .65 });
  for (let k = 0; k < 3; k++) put(out, `land-lamp-${k}`, 'school_stage_lamp', -6 + k * 3, -7.2,
    { height: 3.35, emissive: [1, .86, .62, 1.7] });
  put(out, 'land-bell-pair', 'tower_personal_bell_pair', -3, -6.2, { height: 3.0 });
  put(out, 'land-chair-light', 'station_work_lamp', -1.8, 3.2, { height: 3.3, emissive: [.82,.80,.71,1.1] });
  put(out, 'land-chair-light-feed', 'tower_personal_tape_lead', -1.8, 3.2,
    { height: 6.0, pitch: -Math.PI/2, scaleZ: .225 });
  for (let row = 0; row < 6; row++) for (const side of [-1, 1]) put(out, `land-chairs-${row}-${side}`,
    'school_chair_row', side * 5.5, 3.8 + row * 2.2, { solid: true, look: 'land.school-hall.chairs' });
  put(out, 'land-piano', 'school_piano', -8.4, -3.5, { yaw: Math.PI / 2, solid: true, look: 'land.school-hall.piano' });
  for (const side of [-1, 1]) for (const z of [-5, 7, 17]) put(out, `land-wall-${side}-${z}`,
    'school_hall_wall', side * 10.85, z, { yaw: Math.PI / 2, solid: true });
  put(out, 'land-wall-north', 'school_hall_wall', -4, -10.7, { solid: true });
  for (const side of [-1, 1]) put(out, `land-wall-south-${side}`, 'school_hall_wall', side * 6.5, 20.6,
    { scaleX: .55, solid: true });
  put(out, 'land-roof-remnants', 'tower_personal_hall_roof', 0, 0, { look: 'land.school-hall.roof' });
  for (const side of [-1, 1]) for (const z of [-2, 10]) put(out, `land-radiator-${side}-${z}`,
    'tower_personal_hall_radiator', side * 10.55, z, { yaw: Math.PI / 2, solid: true });
  for (const [i, x, z, scale] of [[0,-9,14,1.4],[1,9,11,1.3],[2,-8,-5,1.8],[3,9,-8,1.8],[4,-7,19,1.3]])
    put(out, `land-settled-snow-${i}`, 'tower_personal_settled_snow', x, z, scaled(scale));
  for (const [i, x, z] of [[0,-9,3],[1,8,-7],[2,10,18]]) put(out, `land-broken-timber-${i}`,
    'ending_collapse_debris', x, z, { yaw: i * .53, look: 'land.school-hall.roof' });
  lead(out, 'land-loose-end', [-.7, 1.5], [5, -9.5], 'land.connector.tape');
}

function tapeField(out) {
  const reels = [
    [-7,-5,4.8,-.12], [8,-18,6.0,.28], [-11,-34,7.6,-.06], [-29,-54,4.6,.32],
    [-34,-75,5.4,-.3], [-11,-57,6.7,.18], [13,-75,7.3,-.22], [30,-99,6.5,.35],
    [10,-119,5.1,-.35], [-27,-129,7.1,.18], [-10,-157,5.7,-.32], [27,-175,7.8,.15],
    [-47,-89,9.0,.45], [46,-156,12,.12], [-51,-177,15,-.25],
  ];
  for (const [i, [x,z,scale,yaw]] of reels.entries()) put(out, `land-tape-reel-${i}`, 'tower_personal_tape_reel', x, z,
    { ...scaled(scale), yaw, solid: i < 12, look: 'land.tape-field.reel' });
  for (const [i,x,z,yaw] of [[0,-24,-47,0],[1,17,-104,0],[2,-18,-137,0],[3,18,-177,0],[4,-34,-83,Math.PI/2]])
    put(out, `land-tape-suspended-${i}`, 'tower_personal_tape_hanging', x, z,
      { yaw, animation: 'tape', look: 'land.tape-field.strands' });
  for (const [i,x,z,yaw] of [[0,-4,-20,.3],[1,-20,-29,-.2],[2,-22,-65,Math.PI/2],[3,19,-91,.2],
    [4,-13,-111,Math.PI/2],[5,-15,-150,Math.PI/2],[6,18,-165,.3],[7,-38,-85,.2]])
    put(out, `land-tape-slack-${i}`, 'tower_personal_tape_slack', x, z,
      { yaw, look: 'land.tape-field.strands' });
  const route = towerPersonalWorld('tape-field').route;
  for (let i=1;i<route.length;i++) lead(out, `land-tape-continuity-${i}`, route[i-1], route[i]);
  put(out, 'land-tape-source-case', 'tower_personal_work_case', -26.7, -64, { solid: true, look: 'land.tape-field.case' });
  put(out, 'land-tape-source-lamp', 'tower_personal_practical_lamp', -26.6, -64.1,
    { height: .46, emissive: [1,.79,.48,.7] });
}

function shelter(out) {
  const x=-8,z=-146;
  for (const side of [-1,1]) put(out, `land-shelter-side-${side}`, 'tower_personal_wall_panel', x + side*3.4, z,
    { yaw:Math.PI/2, scaleX:6.4, solid:true, look:'land.dead-broadcast.shelter' });
  put(out,'land-shelter-back','tower_personal_wall_panel',x,z-3.2,{scaleX:6.8,solid:true});
  for(const side of [-1,1])put(out,`land-shelter-front-${side}`,'tower_personal_wall_panel',x+side*2.2,z+3.2,
    {scaleX:2.4,solid:true});
  put(out,'land-shelter-roof','tower_personal_roof_panel',x,z,{height:3.22,scaleX:7.2,scaleZ:6.8});
  put(out,'land-shelter-console','tower_personal_broadcast_console',x,z-1.8,
    {yaw:Math.PI,solid:true,look:'land.dead-broadcast.relay'});
  put(out,'land-shelter-case','tower_personal_work_case',x-2.3,z-1.8,{solid:true});
  put(out,'land-shelter-lamp','tower_personal_practical_lamp',x-1.4,z-1.6,{height:1.03});
}

function broadcast(out) {
  const { mast, relay } = towerPersonalWorld('dead-broadcast').landmarks;
  put(out,'land-mast','tower_personal_mast',mast.x,mast.z,{...scaled(1.7),solid:true,
    bounds:{min:[-1,0,-1],max:[1,1.5,1.3]},look:'land.dead-broadcast.mast'});
  put(out,'land-mast-lamp','tower_personal_mast_beacon',mast.x,mast.z,{height:17.1,emissive:[.65,.82,.75,1.1]});
  shelter(out);
  put(out,'land-relay-overlook','tower_personal_broadcast_console',relay.x,relay.z,
    {yaw:Math.PI/2,solid:true,look:'land.dead-broadcast.relay'});
  put(out,'land-relay-lamp','tower_personal_practical_lamp',relay.x+.9,relay.z,{height:.56});
  for(const [i,x,z]of [[0,-23,-154],[1,-5,-136],[2,43,-88],[3,27,-75]])
    put(out,`land-broadcast-case-${i}`,'tower_personal_work_case',x,z,{solid:true,yaw:i*.37});
  // Interference remains on this physical panel and its small receiver face.
  put(out,'land-reception-panel','tower_personal_service_window',26.6,-79,
    {yaw:Math.PI/2,look:'land.dead-broadcast.surface'});
  const route=towerPersonalWorld('dead-broadcast').route;
  for(let i=1;i<route.length;i++)lead(out,`land-broadcast-lead-${i}`,route[i-1],route[i]);
}

function ashRoom(out) {
  for(const [i,x,z,yaw]of [[0,-18.8,12,Math.PI/2],[1,-18.8,3,Math.PI/2],[2,-18.8,-9,Math.PI/2],
    [3,11.8,9,Math.PI/2],[4,11.8,-3,Math.PI/2],[5,11.8,-17,Math.PI/2],
    [6,-10,-23.6,0],[7,-3.8,-23.6,0],[8,10.4,-23.6,0]])
    put(out,`land-ellery-wall-${i}`,'tower_personal_ash_window',x,z,{yaw,solid:true,look:'land.ash-room.ellery'});
  for(const [i,x,z]of [[0,-9,2],[1,-17,-18],[2,9,14],[3,10,-18]])
    put(out,`land-ellery-ash-${i}`,'tower_personal_ash_pile',x,z,{...scaled(2),look:'land.ash-room.ash'});
  put(out,'land-ellery-bar','tower_personal_broadcast_console',5,1,{scaleX:3.5,solid:true,look:'land.ash-room.ellery'});
  for(const [i,x,z]of [[0,7,6],[1,-2,-17],[2,9,-9]])put(out,`land-ellery-case-${i}`,'tower_personal_work_case',x,z,{solid:true});
  put(out,'land-ellery-shelf','tower_personal_shelf',9.5,-16,{solid:true});
  put(out,'land-ellery-light-stand','tower_personal_lamp_stand',3,1);
  put(out,'land-ellery-room-light','station_work_lamp',3,1,{height:1.88,emissive:[.69,.73,.74,.75]});
  // Passage walls remain separate so the route never crosses a whole-building
  // collision box. Its lead makes the workroom opening locatable in reverse.
  for(const side of[-1,1])for(const z of[-28,-37])put(out,`land-passage-wall-${side}-${z}`,
    'tower_personal_wall_panel',side<0?1.15:8.85,z,{yaw:Math.PI/2,scaleX:8,solid:true});
  put(out,'land-passage-light','station_work_lamp',8.6,-32,{height:2.4,emissive:[1,.75,.44,1]});
  for(const side of[-1,1])for(const z of[-44,-55])put(out,`land-workroom-wall-${side}-${z}`,
    'tower_personal_ash_window',side<0?-3.8:11.8,z,{yaw:Math.PI/2,solid:true,look:'land.ash-room.ellery'});
  for(const [id,x,scale]of[['left',-2.7,2.2],['right',7.1,9.4]])put(out,`land-workroom-back-${id}`,
    'tower_personal_wall_panel',x,-58.8,{scaleX:scale,solid:true});
  put(out,'land-workroom-roof','tower_personal_hall_roof',4,-51.5,{scaleX:.65,scaleZ:.62});
  put(out,'land-ash-contractor','recordist_contractor',RECORDIST_WORK_ORIGIN[0],RECORDIST_WORK_ORIGIN[2],
    {figure:true,solid:true,bounds:{min:[-.27,0,-.60],max:[.27,1.4,.25]},look:'land.ash-room.recordist',character:recordistCharacterDescriptor('contractor','work')});
  put(out,'land-workstation','tower_personal_workstation',5,-52,{solid:true});
  put(out,'land-working-machine','tower_personal_recorder',RECORDIST_WORK_MACHINE[0],RECORDIST_WORK_MACHINE[2],{height:RECORDIST_WORK_MACHINE[1]});
  recorderStrap(out,'land-working-strap',RECORDIST_WORK_MACHINE,0,true);
  headphoneLead(out,'land-working-headphones',recordistHeadphoneCollar('work'),true);
  put(out,'land-work-lamp','tower_personal_practical_lamp',4.35,-52.5,{height:.825});
  put(out,'land-recorder-level','radio_carrier_led',4.945,-52.851,
    {height:.96,pitch:Math.PI/2,scaleX:2,scaleY:.8,scaleZ:.2,emissive:[.35,.85,.55,1]});
  for(const[i,x,z]of[[0,-1.5,-54],[1,9.8,-48],[2,7.8,-57]])put(out,`land-work-case-${i}`,
    'tower_personal_work_case',x,z,{solid:true,yaw:i*.17});
  put(out,'land-work-shelf','tower_personal_shelf',10.8,-55,{solid:true});
  for(const[i,x,z]of[[0,-2,-43],[1,10,-57],[2,-2,-57]])put(out,`land-work-ash-${i}`,
    'tower_personal_ash_pile',x,z,{...scaled(1.4),look:'land.ash-room.ash'});
  lead(out,'land-ellery-lead-1',[0,17],[-14,17],'land.connector.tape');
  lead(out,'land-ellery-lead-2',[-14,17],[-14,-20]);
  lead(out,'land-ellery-lead-3',[-14,-20],[5,-20]);
  lead(out,'land-ellery-lead-4',[5,-20],[5,-48]);
  lead(out,'land-workroom-lead',[5,-48],[5.82,-51.37]);
}

// Split rectangle edges at every other support endpoint, then retain only
// intervals whose outward side is outside the union. Joins and optional loops
// therefore stay open; each surviving boundary has a visible physical bank.
export function towerPersonalBoundarySegments(stage){
  if(!['tape-field','dead-broadcast'].includes(stage))return[];
  const supports=towerPersonalWorld(stage).supports,segments=new Map();
  const inside=(x,z)=>supports.some(s=>x>s.minX-1e-7&&x<s.maxX+1e-7&&z>s.minZ-1e-7&&z<s.maxZ+1e-7);
  for(const s of supports)for(const [axis,coordinate,start,end,normal]of[
    ['x',s.minX,s.minZ,s.maxZ,-1],['x',s.maxX,s.minZ,s.maxZ,1],
    ['z',s.minZ,s.minX,s.maxX,-1],['z',s.maxZ,s.minX,s.maxX,1]]){
    const values=[start,end];
    for(const other of supports)for(const value of axis==='x'?[other.minZ,other.maxZ]:[other.minX,other.maxX])if(value>start&&value<end)values.push(value);
    const cuts=[...new Set(values)].sort((a,b)=>a-b);
    for(let i=1;i<cuts.length;i++){
      const a=cuts[i-1],b=cuts[i],mid=(a+b)/2;
      const x=axis==='x'?coordinate+normal*.001:mid,z=axis==='z'?coordinate+normal*.001:mid;
      if(inside(x,z))continue;
      const key=[axis,coordinate,a,b,normal].join(':');segments.set(key,{axis,coordinate,start:a,end:b,normal});
    }
  }
  return[...segments.values()];
}

function groundBoundaries(out,stage){
  const segments=towerPersonalBoundarySegments(stage);
  for(const [index,s]of segments.entries()){
    const count=Math.ceil((s.end-s.start)/10);
    for(let k=0;k<count;k++){
      const start=s.start+(s.end-s.start)*k/count,end=s.start+(s.end-s.start)*(k+1)/count;
      const mid=(start+end)/2,offset=s.coordinate+s.normal*.45;
      put(out,`land-ground-bank-${index}-${k}`,stage==='tape-field'?'tower_personal_earth_ridge':'tower_personal_ash_ridge',
        s.axis==='x'?offset:mid,s.axis==='z'?offset:mid,{solid:true,yaw:s.axis==='x'?0:Math.PI/2,
          scaleZ:end-start,scaleY:1+Math.sin(index*2.17+k)*.08,boundary:{...s,start,end}});
    }
  }
}

const layouts=new Map();
export function towerPersonalWorldPieces(stage='school-hall') {
  stage=towerPersonalWorld(stage).id;
  if(layouts.has(stage))return layouts.get(stage);
  const out=[];
  if(stage==='school-hall'||stage==='return-hall')hall(out);
  else if(stage==='tape-field')tapeField(out);
  else if(stage==='dead-broadcast')broadcast(out);
  else ashRoom(out);
  groundBoundaries(out,stage);
  if(stage==='school-hall')put(out,'land-boy','recordist_boy',RECORDIST_BOY_ORIGIN[0],RECORDIST_BOY_ORIGIN[2],
    {figure:true,solid:true,bounds:{min:[-.23,0,-.52],max:[.23,1.3,.23]},look:'land.school-hall.boy',character:recordistCharacterDescriptor('boy','wait')});
  for(const door of towerPersonalWorld(stage).doors)portal(out,door,stage);
  const result=freeze(out);layouts.set(stage,result);return result;
}

export const TOWER_PERSONAL_WORLD_SOURCES=freeze({
  'school-hall':{x:-3,z:-6.2,height:3.18},'tape-field':{x:-26.7,z:-64,height:.8},
  'dead-broadcast':{x:-20,z:-145,height:17.1},'ash-room':{x:5.04,z:-52.49,height:.96},
  'return-hall':{x:-.9,z:1.8,height:.75},
});

export function towerPersonalWorldLights(stage='school-hall') {
  const out=[],light=(id,x,z,height,color,intensity,radius,extra={})=>out.push({id,x,z,height,color,intensity,radius,...extra});
  if(stage==='school-hall'||stage==='return-hall'){
    for(let k=0;k<3;k++)light(`land-lamp-${k}`,-6+k*3,-7.2,3.2,[1,.78,.48],.85,10,{sourceKey:'stage'});
    light('land-chair-light',-1.8,3.2,3.6,[.82,.80,.71],1.55,9.5);
  }else if(stage==='tape-field')light('land-tape-source-lamp',-26.6,-64.1,1.08,[1,.74,.42],1.2,9,{sourceKey:'tape'});
  else if(stage==='dead-broadcast'){
    light('land-mast-lamp',-20,-145,17.2,[.65,.82,.75],1.5,28,{sourceKey:'mast',castsShadow:false});
    light('land-shelter-lamp',-9.4,-147.6,1.65,[1,.75,.44],1.5,10);
    light('land-relay-lamp',39.9,-82,1.18,[1,.75,.44],1.2,10,{sourceKey:'relay'});
  }else{
    light('land-work-lamp',4.21,-52.65,1.45,[1,.75,.44],2,12,{sourceKey:'recorder'});
    light('land-ellery-room-light',3,1,2.18,[.69,.73,.74],.75,24);
    light('land-passage-light',8.6,-32,2.7,[1,.75,.44],1,12);
  }
  for(const door of towerPersonalWorld(stage).doors)light(`portal-${door.id}`,door.center.x-1.65,door.center.z,2.35,[1,.76,.44],1.1,9,{permanent:true});
  return out;
}

// Recorder, hands and strap share the same saved transfer sample as the GLB clips.
export function towerPersonalPerformance(progress=0){
  return {...recordistTransferFrame(progress),arms:[...recordistCharacterPose('boy','transfer',progress).contacts,
    ...recordistCharacterPose('contractor','transfer',progress).contacts]};
}
function recorderStrap(out,id,machine,lift=0,onDesk=false,shared={}){
  const low=onDesk?.006:-.09;
  const points=[[-.23,.075,.025],[-.27,.018+lift,.04],[-.25,low+lift,.21],[-.02,low,.26],
    [.25,low,.21],[.27,.025,.06],[.23,.075,.025]].map(p=>p.map((v,i)=>v+machine[i]));
  for(let i=1;i<points.length;i++){
    const a=points[i-1],d=points[i].map((v,k)=>v-a[k]);
    put(out,`${id}-${i}`,'tower_personal_strap_segment',a[0],a[2],{...shared,height:a[1],
      yaw:Math.atan2(d[0],d[2]),pitch:-Math.atan2(d[1],Math.hypot(d[0],d[2])),scaleZ:Math.hypot(...d)});
  }
}
function headphoneLead(out,id,collar,working=false,shared={}){
  const points=working?[collar,[4.82,1.04,-52.10],[4.72,.85,-52.31],[4.76,.829,-52.43],[4.805,.90,-52.465]]
    :[collar,...[[.10,-.12,.04],[.18,-.25,.09],[.17,-.31,.12],[.11,-.33,.11],[.09,-.28,.08],[.14,-.25,.08]].map(p=>p.map((v,i)=>v+collar[i]))];
  for(let i=1;i<points.length;i++){
    const a=points[i-1],d=points[i].map((v,k)=>v-a[k]);
    put(out,`${id}-${i}`,'tower_personal_headphone_cable',a[0],a[2],{...shared,height:a[1],
      yaw:Math.atan2(d[0],d[2]),pitch:-Math.atan2(d[1],Math.hypot(d[0],d[2])),scaleZ:Math.hypot(...d)});
  }
}
export function towerPersonalHandoverPieces(progress=0,{reducedMotion=false}={}){
  const frame=recordistTransferFrame(progress),out=[],shared={figure:true,collapseGroup:'land-handover'};
  put(out,'land-boy','recordist_boy',frame.boy[0],frame.boy[2],
    {...shared,solid:true,bounds:{min:[-.23,0,-.52],max:[.23,1.3,.23]},look:'land.return-hall.handover',
      character:recordistCharacterDescriptor('boy','transfer',progress)});
  put(out,'land-handover-contractor','recordist_contractor',frame.contractor[0],frame.contractor[2],
    {...shared,yaw:frame.contractorYaw,character:recordistCharacterDescriptor('contractor','transfer',progress)});
  put(out,'land-handover-machine','tower_personal_recorder',frame.machine[0],frame.machine[2],
    {...shared,height:frame.machine[1]});
  recorderStrap(out,'land-handover-strap',frame.machine,frame.strapLift,false,shared);
  headphoneLead(out,'land-handover-headphones',recordistHeadphoneCollar('transfer',progress),false,shared);
  return out;
}
