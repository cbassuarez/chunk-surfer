// Sparse, fixed fragments of the same flat faults that crowd Earthfall and
// the later Sources. They have no support, collision, action, or clock.
// All addresses below are metres in the relevant Source coordinate system.
import {CELL,ZONE} from '../data/floorplan/legend.js';
import {SOURCE_TIER_BY_ID,SOURCE_PRE_TAPE,SOURCE_HORIZON,SOURCE_BELLS,SOURCE_CHAPEL_OUTSKIRTS} from '../data/source-level.js';
import {sourceAmbientFaultGeometry} from '../render/source-ambient-fault-geometry.js';

const F=Object.freeze;
const kit=(id,count,size,seed,spreadX,spreadY,spreadZ)=>F({id,count,size,seed,spreadX,spreadY,spreadZ,x:0,y:0,z:0});
const KITS=F([
  kit('whisper',3,1.6,11,.25,1.1,4),
  kit('thin',5,3.8,29,3,3,6),
  kit('scatter',8,6,47,7,5,10),
]);
export const SOURCE_EARLY_FAULT_KITS=KITS;
export const SOURCE_EARLY_FAULT_GEOMETRY=F(KITS.flatMap(k=>sourceAmbientFaultGeometry({sites:[k],palettePrefix:`source-early-fault-${k.id}`})));
const piecesByKit=new Map(KITS.map(k=>[k.id,SOURCE_EARLY_FAULT_GEOMETRY.filter(p=>p.name.startsWith(`source-early-fault-${k.id}-`))]));
const site=(id,profile,kitId,x,y,z)=>F({id,profile,kitId,x,y,z});
const tier=(id)=>SOURCE_TIER_BY_ID[id];
const mid=(a,b)=>(a+b)*CELL/2;
const road=SOURCE_PRE_TAPE,hor=SOURCE_HORIZON,bells=SOURCE_BELLS,chapel=SOURCE_CHAPEL_OUTSKIRTS;
const sites=[
  // The corridor starts with a few seams at the walls, not another obstacle.
  site('hall-first','hall','whisper',-3.1,2.6,-23),site('hall-rain','hall','whisper',3.1,2.7,-61),
  site('hall-end','hall','thin',-3.3,3.1,-102),
  // A handful of isolated airborne cuts over the first open walk.
  site('shore-near','shore','thin',-18,7,-238),site('shore-middle','shore','whisper',17,5,-289),
  site('shore-far','shore','thin',-20,8,-349),
  ...['arrival','fork','trace','return'].map((id,i)=>{const t=tier(id),z=id==='arrival'?t.to*CELL+4:mid(t.from,t.to);return site(`field-${id}`,'field',i===2?'scatter':'thin',i%2?18:-19,t.height+6,z);}),
  // Deliberate gaps between small clusters along the long road.
  ...[.08,.21,.37,.58,.78,.94].map((p,i)=>site(`road-${i}`,'road',i===3?'scatter':i%2?'whisper':'thin',i%2?17:-20,21,(road.roadFrom+(road.to-road.roadFrom)*p)*CELL)),
  ...[.16,.48,.83].map((p,i)=>site(`tape-${i}`,'road',i===1?'scatter':'thin',i%2?20:-17,22,(hor.from+(hor.to-hor.from)*p)*CELL)),
  ...[.15,.44,.75].map((p,i)=>site(`bells-${i}`,'bells',i===1?'scatter':'thin',i%2?19:-20,22,(bells.from+(bells.to-bells.from)*p)*CELL)),
  ...[.22,.66].map((p,i)=>site(`chapel-${i}`,'chapel',i?'thin':'whisper',i?18:-17,21,(chapel.from+(chapel.to-chapel.from)*p)*CELL)),
];
export const SOURCE_EARLY_FAULT_SITES=F(sites);
export const SOURCE_EARLY_FAULT_COUNTS=F(Object.fromEntries(['hall','shore','field','road','bells','chapel'].map(profile=>[profile,
  sites.filter(s=>s.profile===profile).reduce((sum,s)=>sum+KITS.find(k=>k.id===s.kitId).count,0)])));
export const SOURCE_EARLY_FAULT_RADIUS=90;
const phaseProfile=(phase,shore)=>['hall','haystack'].includes(phase)?'hall':shore?'shore':
  ['transforming','landscape','final','completed'].includes(phase)?'field':phase==='horizon'?'road':phase==='bells'?'bells':phase==='chapel-outskirts'?'chapel':null;
const translate=(x,y,z)=>new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,x,y,z,1]);

/** Only nearby physical clusters are submitted. Their centres and meshes are
 * fixed against Source's origin, never the player or an animation clock. */
export function sourceEarlyFaultFrame({phase,shore=false,origin={x:0,y:0},player={x:0,y:0},suspended=false}={}){
  const profile=suspended?null:phaseProfile(phase,shore);if(!profile)return{profile:null,props:[],sheets:0};
  const ox=profile==='hall'?0:(Number(origin.x)||0)*CELL,oz=profile==='hall'?0:(Number(origin.y)||0)*CELL;
  const px=(Number(player.x)||0)*CELL,pz=(Number(player.y)||0)*CELL,props=[];let sheets=0;
  for(const s of sites){
    if(s.profile!==profile||Math.hypot(ox+s.x-px,oz+s.z-pz)>SOURCE_EARLY_FAULT_RADIUS)continue;
    const x=ox+s.x,z=oz+s.z;for(const piece of piecesByKit.get(s.kitId)){
      props.push({id:`${s.id}:${piece.palette}`,mesh:piece.name,matrix:translate(x,s.y,z),x,y:s.y,z,
        zone:ZONE.sourceSpace,structural:false,decorative:true,collidable:false,noShadow:true,noReflection:true,
        sourceAmbientFault:true,sourceFaultExempt:true,faultProfile:profile,faultSite:s.id,faultSheets:piece.sheetRanges.length,cullRadius:12});
      sheets+=piece.sheetRanges.length;
    }
  }
  return{profile,props,sheets};
}
