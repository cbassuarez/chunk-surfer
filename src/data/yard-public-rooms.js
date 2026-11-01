// The accessible service row has two inhabited ground floors: the Lyric in
// the former rehearsal annex and a small caretaker room in the old stables.
// These are conversions of the existing ranges, not additional yard islands.
import {F,MATERIAL,ZONE} from './floorplan/legend.js';
import {EXTERIOR_PUB} from './exterior-pub.js';
const freeze=v=>{if(v&&typeof v==='object'&&!Object.isFrozen(v)){Object.values(v).forEach(freeze);Object.freeze(v);}return v;};
const logical=(x,z)=>({x:50+x,y:200+z});

export const YARD_CARETAKER=freeze({
  id:'yard-caretaker',buildingId:'yard-former-stables',name:'Caretaker room',
  mesh:'yard_caretaker_room',zone:ZONE.store,material:MATERIAL.serviceConcrete,
  bounds:{x0:30,x1:36,z0:14,z1:22},floor:.12,ceiling:3.52,
  entrance:{id:'yard-caretaker-entry',x:30.25,z:19.5,width:1.25,bottom:0,top:2.40},
  window:{x:30.10,z:16.1,width:1.72,bottom:1.02,top:2.57},
  furniture:[
    {id:'yard-caretaker-desk',x:34.65,z:16.25,width:1.55,depth:.72,height:.78},
    {id:'yard-caretaker-chair',x:33.55,z:16.25,width:.52,depth:.55,height:.97},
    {id:'yard-caretaker-bench',x:32.9,z:21.18,width:2.45,depth:.52,height:.94},
    {id:'yard-caretaker-cabinet',x:35.45,z:20.42,width:.62,depth:1.40,height:1.98},
    {id:'yard-caretaker-shelves',x:33.1,z:14.28,width:4.9,depth:.40,height:2.20},
  ],
});
export const YARD_LAUNDRY=freeze({
  id:'yard-laundry',buildingId:'yard-baths-plant',name:'Baths plant and laundry',mesh:'yard_laundry_room',
  zone:ZONE.plant,material:MATERIAL.wetTile,bounds:{x0:32.5,x1:38.5,z0:49,z1:61},floor:.12,ceiling:3.52,
  entrance:{id:'yard-laundry-entry',x:32.75,z:57.5,width:1.40,bottom:0,top:2.40},
  window:{x:32.60,z:52.6,width:1.90,bottom:1.18,top:2.68},
  furniture:[
    {id:'yard-laundry-sink',kind:'sink',x:37.92,z:51,width:.72,depth:2.0,height:1.05},
    {id:'yard-laundry-linen-shelves',kind:'linen-shelves',x:35.50,z:49.45,width:4.4,depth:.62,height:2.18},
    {id:'yard-laundry-folding-table',kind:'table',x:36.95,z:54.55,width:1.8,depth:1.0,height:.84},
    {id:'yard-laundry-plant-bank',kind:'plant-bank',x:37.95,z:58.9,width:.70,depth:2.40,height:2.58},
    {id:'yard-laundry-linen-bin',kind:'linen-bin',x:33.90,z:60.25,width:1.25,depth:.90,height:1.00},
  ],
});
export const YARD_STORES=freeze({
  id:'yard-stores',buildingId:'yard-covered-stores',name:'Covered stores',mesh:'yard_stores_room',
  zone:ZONE.store,material:MATERIAL.serviceConcrete,bounds:{x0:34,x1:40,z0:70.5,z1:83.5},floor:.12,ceiling:3.52,
  entrance:{id:'yard-stores-entry',x:34.25,z:76,width:3.52,bottom:0,top:3.40,archetype:'bay-goods-pair'},
  furniture:[
    {id:'yard-stores-south-rack',kind:'rack',x:37.0,z:71.15,width:4.8,depth:.85,height:2.8},
    {id:'yard-stores-north-rack',kind:'rack',x:37.0,z:82.85,width:4.8,depth:.85,height:2.8},
    {id:'yard-stores-flightcases',kind:'flightcases',x:38.9,z:73.65,width:1.50,depth:2.15,height:1.38},
    {id:'yard-stores-flightcases-north',kind:'flightcases',x:38.9,z:80.25,width:1.50,depth:2.15,height:1.15},
    {id:'yard-stores-handtruck',kind:'handtruck',x:35.1,z:80.7,width:.65,depth:.55,height:1.40},
    {id:'yard-stores-packing-bench',kind:'table',x:38.95,z:77,width:1.50,depth:1.10,height:.84},
  ],
});
export const YARD_PUBLIC_ROOMS=freeze([YARD_CARETAKER,YARD_LAUNDRY,YARD_STORES]);
export const YARD_PUBLIC_RANGE_IDS=freeze([EXTERIOR_PUB.building.id,...YARD_PUBLIC_ROOMS.map(r=>r.buildingId)]);
export const yardPublicRoomForRange=id=>YARD_PUBLIC_ROOMS.find(r=>r.buildingId===id)||null;
export const yardRangePublicUse=id=>id===EXTERIOR_PUB.building.id?'lyric':yardPublicRoomForRange(id)?.id.replace('yard-','')||null;

// Same logical drawing as the yard: no hidden second room or jump is needed.
// Install after loading_bay_yard so the indoor profile owns this lower span.
const roomLevel=(room,id,x,z,rows)=>({id,replace:true,physicalReplace:true,layer:'ground',space:room.id.replaceAll('-','_'),renderGroup:'ground',
  origin:logical(x,z),physicalOrigin:{x,y:z},base:0,rows,profile:(_x,_z,cell)=>({floor:room.floor,ceil:room.ceiling,
    zone:room.zone,material:room.material,flags:cell.flags&F.DOOR})});
export const YARD_PUBLIC_ROOM_LEVELS=freeze(YARD_PUBLIC_ROOMS.flatMap(room=>{
  const b=room.bounds,d=room.entrance,span=d.width>2?3:1;
  return[roomLevel(room,room.id+'-floor',b.x0,b.z0,Array(Math.round(b.z1-b.z0)).fill('Y'.repeat(Math.round(b.x1-b.x0)))),
    roomLevel(room,room.id+'-entry-throat',b.x0,d.z-span/2,Array(span).fill('+'))];
}));
export const YARD_PUBLIC_ROOM_DOORS=freeze(YARD_PUBLIC_ROOMS.map(room=>{
  const d=room.entrance,at=logical(d.x,d.z),paired=d.width>2;
  return{id:d.id,archetype:d.archetype||'practice-acoustic-single',legacyIds:[],at,x:at.x,y:at.y,
    hinge:'right',widthAxis:'y',swing:'room-in',key:null,initialState:'closed',open:false,wedged:false,
    closerArmed:false,closer:'none',access:'both',insideSide:1,activeLeaves:paired?[0,1]:[0],renderGroups:['ground']};
}));

const wall=(id,x,z,width,depth,minElevation=.12,maxElevation=3.52)=>({id,kind:'obb',...logical(x,z),width,depth,yaw:0,
  minElevation,maxElevation,spaceId:'yard_caretaker'});
export const YARD_PUBLIC_ROOM_COLLIDERS=freeze([
  wall('yard-caretaker-back-wall',35.94,18,.12,8),
  wall('yard-caretaker-south-wall',33,14.06,6,.12),
  wall('yard-caretaker-north-wall',33,21.94,6,.12),
  // The window remains physically solid only beneath its sill. The door is a
  // real opening, with its one leaf supplied by the shared door runtime.
  wall('yard-caretaker-west-pier-south',30.10,14.67,.20,1.34),
  wall('yard-caretaker-window-sill',30.10,16.10,.20,1.72,.12,1.14),
  wall('yard-caretaker-window-head',30.10,16.10,.20,1.72,2.69,3.52),
  wall('yard-caretaker-west-middle',30.10,17.92,.20,1.92),
  wall('yard-caretaker-west-pier-north',30.10,21.0625,.20,1.875),
  ...YARD_CARETAKER.furniture.map(f=>wall(f.id+'-body',f.x,f.z,f.width,f.depth,.12,.12+f.height)),
  ...[YARD_LAUNDRY,YARD_STORES].flatMap(room=>{
    const b=room.bounds,d=room.entrance,id=room.id,parts=[
      wall(id+'-back-wall',b.x1-.06,(b.z0+b.z1)/2,.12,b.z1-b.z0),
      wall(id+'-south-wall',(b.x0+b.x1)/2,b.z0+.06,b.x1-b.x0,.12),
      wall(id+'-north-wall',(b.x0+b.x1)/2,b.z1-.06,b.x1-b.x0,.12),
      ...room.furniture.map(f=>wall(f.id+'-body',f.x,f.z,f.width,f.depth,room.floor,room.floor+f.height)),
    ];
    const holes=[d,...(room.window?[room.window]:[])].sort((a,b)=>a.z-b.z);let from=b.z0;
    for(const h of holes){
      const lo=h.z-h.width/2,hi=h.z+h.width/2;
      if(lo>from)parts.push(wall(id+'-west-pier-'+from,b.x0+.10,(from+lo)/2,.20,lo-from));
      if(h.bottom>0)parts.push(wall(id+'-sill-'+h.z,b.x0+.10,h.z,.20,h.width,room.floor,room.floor+h.bottom));
      if(room.floor+h.top<room.ceiling)parts.push(wall(id+'-head-'+h.z,b.x0+.10,h.z,.20,h.width,room.floor+h.top,room.ceiling));
      from=hi;
    }
    if(from<b.z1)parts.push(wall(id+'-west-pier-north',b.x0+.10,(from+b.z1)/2,.20,b.z1-from));
    return parts;
  }),
]);
export const YARD_PUBLIC_ROOM_MESHES=freeze(Object.fromEntries(YARD_PUBLIC_ROOMS.map(r=>[r.mesh,{w:r.bounds.x1-r.bounds.x0,d:r.bounds.z1-r.bounds.z0,h:r.ceiling-r.floor,blocks:false}])));
export const YARD_PUBLIC_ROOM_PROPS=freeze([
  {id:'yard-caretaker-room',mesh:'yard_caretaker_room',...logical(33,18),yaw:0,scale:1,
    structural:true,blocks:false,interactive:false,floorOverride:.12,renderGroups:['ground']},
  {id:'yard-caretaker-log',mesh:'loose_note',...logical(34.65,16.25),yaw:.12,scale:.75,
    blocks:false,elevation:.80,floorOverride:.12,renderOffsetX:.15,renderOffsetZ:-.25,renderGroups:['ground'],
    label:'the maintenance book',inspect:{first:'A maintenance book, pencil and cold mug occupy the caretaker’s desk. The last entry records a leaking gutter over the rehearsal range.',again:'The book is still open at the gutter repair.'}},
  ...[YARD_LAUNDRY,YARD_STORES].map(r=>({id:r.id+'-room',mesh:r.mesh,...logical((r.bounds.x0+r.bounds.x1)/2,(r.bounds.z0+r.bounds.z1)/2),
    yaw:0,scale:1,structural:true,blocks:false,interactive:false,floorOverride:r.floor,renderGroups:['ground']})),
  {id:'yard-laundry-service-label',mesh:'loose_note',...logical(36.95,54.55),yaw:.08,scale:.75,
    blocks:false,elevation:.86,floorOverride:.12,renderOffsetX:-.05,renderOffsetZ:.05,renderGroups:['ground'],
    label:'the laundry service sheet',inspect:{first:'A folding table, clean linen and the old baths service pipes share the room. The valves have their positions written on the service sheet.',again:'The service sheet identifies the old baths circuit.'}},
  {id:'yard-stores-packing-note',mesh:'loose_note',...logical(38.95,77),yaw:-.16,scale:.7,
    blocks:false,elevation:.86,floorOverride:.12,renderOffsetX:-.05,renderGroups:['ground'],
    label:'the packing list',inspect:{first:'Flight cases, dismantled stands and paper wrapping have been sorted onto racks. A hand truck stands beside the open packing bench.',again:'The packing list is held down by a length of cloth tape.'}},
]);
