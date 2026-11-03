// The Catch fills the way Source II floods, but with the floor of the sea:
// sand rises up the well from below its deepest stage, sea grass takes hold,
// crabs cross it, and the same van settles into it again and again, its lamps
// still burning in two of them. Nothing here is said; the listener simply
// finishes out the Couperin on the bottom. Decorative only: no support,
// collision, audio or save state changes, and every value is a pure function
// of narrative progress and the supplied clock.
import {SOURCE_REST_SEATS} from './source-rest-seat.js';
import {sourceRestVehicleImage} from './source-rest-memories.js';
import {coastalBodyMatrix,coastalMultiply} from '../data/coastal-memory.js';
import {sourceRestHeadlampPower} from './source-rest-headlamps.js';

// Everything is placed in the settle's own frame (its position and seated
// view), so the bed follows the bench wherever the Catch puts it.
const seat=SOURCE_REST_SEATS[1],forward=[Math.sin(seat.view.yaw),-Math.cos(seat.view.yaw)],right=[Math.cos(seat.view.yaw),Math.sin(seat.view.yaw)];
const AHEAD=6,centre={x:seat.x+forward[0]*AHEAD,z:seat.z+forward[1]*AHEAD};
// Bench-frame (metres ahead, metres right) to world x/z.
const frame=(ahead,across)=>({x:seat.x+forward[0]*ahead+right[0]*across,z:seat.z+forward[1]*ahead+right[1]*across});
const clamp=n=>Math.max(0,Math.min(1,Number(n)||0));
const smooth=(a,b,n)=>{const t=clamp((n-a)/(b-a));return t*t*(3-2*t);};
const hash=n=>{const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v);};
export const SOURCE_REST_SEABED_MESHES=Object.freeze({sand:'source-continuation-rest-seabed-sand',grass:'source-continuation-rest-seabed-grass',
  crab:'source-continuation-rest-seabed-crab',lamp:'source-continuation-rest-seabed-lamp'});
export const SOURCE_REST_SEABED=Object.freeze({
  // Dune crests break through the floor around the settle from the start and
  // spread until it lies about a metre under sand at the authored blackout,
  // over whatever veneer or soundboard the bench stands on. A bowl around the
  // settle keeps the drifts off the bench and the seated body.
  floorFrom:seat.feet-.25,floorTo:seat.feet+1.1,fillUntil:.96,
  halfX:15,halfZ:15,seatClear:[1.4,3.2],seatBowl:1.25,
  grass:46,grassAbove:-.1,crabs:9,crabsAbove:-.3,
  // Bench-frame resting places (ahead, across) and attitudes. Each settles at
  // its progress and stays where it landed while the sand climbs over it.
  cars:Object.freeze([
    Object.freeze({ahead:7.5,across:1.8,heading:2.4,pitch:-.52,roll:.1,at:.04,lamps:true}),
    Object.freeze({ahead:10.5,across:-6.2,heading:.3,pitch:0,roll:1.57,at:.17}),
    Object.freeze({ahead:15.2,across:4.6,heading:-1.2,pitch:.2,roll:3.1,at:.29}),
    Object.freeze({ahead:13.4,across:-1.3,heading:1.1,pitch:-.3,roll:.2,at:.41,lamps:true}),
    Object.freeze({ahead:5.4,across:8.4,heading:2.9,pitch:-.9,roll:0,at:.54}),
    Object.freeze({ahead:4.6,across:-8.1,heading:-2.2,pitch:.1,roll:-.4,at:.66}),
    Object.freeze({ahead:18.6,across:.9,heading:.6,pitch:-.2,roll:2.7,at:.78}),
    Object.freeze({ahead:9.2,across:9.6,heading:-.4,pitch:-.35,roll:.3,at:.84,lamps:true}),
    Object.freeze({ahead:16.5,across:-9.8,heading:1.9,pitch:.1,roll:1.4,at:.88}),
    Object.freeze({ahead:21.4,across:-4.4,heading:-2.6,pitch:-.6,roll:.1,at:.92}),
  ]),
});
const S=SOURCE_REST_SEABED,seatLocal=[seat.x-centre.x,seat.z-centre.z];
const local=({ahead,across})=>{const p=frame(ahead,across);return[p.x-centre.x,p.z-centre.z];};

/** Dune relief in bed-local metres (from the bed centre ahead of the settle),
 * shared by the mesh, crabs, grass and cars. */
export function sourceRestSeabedRelief(x,z){
  const edge=smooth(S.halfX-5,S.halfX,Math.max(Math.abs(x),Math.abs(z))),
    dunes=.32*Math.sin(x*.31+z*.17)+.20*Math.sin(x*.73-z*.41+1.3)+.12*Math.sin(x*1.7+z*1.1+.4)+.9*edge,
    clear=smooth(S.seatClear[0],S.seatClear[1],Math.hypot(x-seatLocal[0],z-seatLocal[1]));
  return dunes*clear-S.seatBowl*(1-clear);
}
export function sourceRestSeabedLevel(progress=0){
  return S.floorFrom+(S.floorTo-S.floorFrom)*Math.pow(smooth(0,S.fillUntil,progress),.85);
}
const ground=(level,x,z)=>level+sourceRestSeabedRelief(x,z);
const decoration=(id,mesh,matrix,kind,extra={})=>({id,mesh,matrix,x:matrix[12],y:matrix[13],z:matrix[14],kind,chartId:seat.chartId,level:seat.level,
  region:seat.phase,structural:false,decorative:true,collidable:false,noShadow:true,restSeabed:true,cullRadius:kind==='seabed-sand'?24:kind==='seabed-car'?4:1.4,...extra});
function place(x,y,z,yaw=0,scale=1,tilt=0){
  const c=Math.cos(yaw),s=Math.sin(yaw),ct=Math.cos(tilt),st=Math.sin(tilt);
  return[c*scale,0,s*scale,0,-s*st*scale,ct*scale,c*st*scale,0,-s*ct*scale,-st*scale,c*ct*scale,0,x,y,z,1];
}

function cars(level,progress){
  const rows=[],lamps=[];
  S.cars.forEach((car,index)=>{
    if(progress<car.at)return;
    // The sand carries each van up with it while it slowly settles deeper,
    // so they gather rather than disappear.
    const [x,z]=local(car),restY=ground(level,x,z)-(.35+1.25*smooth(0,.35,progress-car.at));
    const pose={position:[centre.x+x,restY,centre.z+z],heading:car.heading+seat.view.yaw,pitch:car.pitch,roll:car.roll},body=coastalBodyMatrix(pose);
    for(const part of sourceRestVehicleImage('seabed-'+index,{x:0,y:0,z:0,yaw:0},{kind:'seabed-car'})){
      const matrix=coastalMultiply(body,part.matrix);rows.push({...part,...decoration(part.id,part.mesh,matrix,'seabed-car'),seabedCar:index});
    }
    if(car.lamps)lamps.push({car:index,body});
  });
  return{rows,lamps};
}
function grass(level,progress,time,reducedMotion){
  const rows=[],taken=smooth(seat.feet+S.grassAbove,S.floorTo,level);
  for(let i=0;i<S.grass;i++){
    if(hash(i*3.7)>taken)continue;
    // A few roots are composed just ahead of the seat, the rest disperse
    // naturally across the dune. These are physical blades in the same sand.
    const fixed=[[4,-1.5],[4.4,1.6],[6,-2.2],[6.6,2.3]][i],
      [x,z]=fixed?local({ahead:fixed[0],across:fixed[1]}):[(hash(i)-.5)*2*(S.halfX-1.5),(hash(i+71)-.5)*2*(S.halfZ-1.5)];
    if(Math.hypot(x-seatLocal[0],z-seatLocal[1])<1.6)continue;
    const sway=reducedMotion?0:.09*Math.sin(time*.62+i*1.9)+.04*Math.sin(time*1.7+i),scale=.7+.6*hash(i+9);
    rows.push(decoration('rest-seabed-grass-'+i,SOURCE_REST_SEABED_MESHES.grass,
      place(centre.x+x,ground(level,x,z)-.04,centre.z+z,hash(i+5)*6.283,scale,sway),'seabed-grass'));
  }
  return rows;
}
function crabs(level,time,reducedMotion){
  const rows=[];if(level<seat.feet+S.crabsAbove)return rows;
  for(let i=0;i<S.crabs;i++){
    const ax=(hash(i+300)-.5)*2*(S.halfX-3),az=(hash(i+400)-.5)*2*(S.halfZ-3),walk=hash(i+500)*6.283,
      // Sideways scuttles with stops: a crab never turns to face its path.
      rate=.35+.2*hash(i+600),phase=reducedMotion?0:time*rate+i*1.7,stroke=Math.sin(phase)+.35*Math.sin(phase*3.1),
      fixed=[[5,-.8],[6.3,1.2]][i],root=fixed?local({ahead:fixed[0],across:fixed[1]}):[ax,az],
      x=root[0]+Math.cos(walk)*(fixed?.45:1.5)*stroke,z=root[1]+Math.sin(walk)*(fixed?.45:1.5)*stroke;
    if(Math.hypot(x-seatLocal[0],z-seatLocal[1])<1.2)continue;
    const bob=reducedMotion?0:.012*Math.abs(Math.sin(phase*9));
    rows.push(decoration('rest-seabed-crab-'+i,SOURCE_REST_SEABED_MESHES.crab,
      place(centre.x+x,ground(level,x,z)+bob,centre.z+z,walk+Math.PI/2,.9+.5*hash(i+700)),'seabed-crab',{crabWalk:walk}));
  }
  return rows;
}

/** Local decorative props and two headlamp lights for the Catch's settle. */
export function sourceRestSeabed(state,{reducedMotion=false}={}){
  const view=state?.sourceRestView,active=state?.phase===seat.phase&&(state?.chartId??0)===seat.chartId&&view?.seatId===seat.id;
  if(!active)return{active:false,props:[],lights:[],level:S.floorFrom,diagnostics:{active:false}};
  const progress=clamp(view.degradation),time=Math.max(0,Number(view.audibleSeconds??view.musicTime)||0),level=sourceRestSeabedLevel(progress),
    power=sourceRestHeadlampPower({time,progress,marked:false,reducedMotion}),parked=cars(level,progress),props=[
      decoration('rest-seabed-sand',SOURCE_REST_SEABED_MESHES.sand,place(centre.x,level,centre.z),'seabed-sand'),
      ...parked.rows,...grass(level,progress,time,reducedMotion),...crabs(level,time,reducedMotion)],lights=[];
  // A soft, local reflected glow makes the dune relief and small fauna legible
  // beneath the case without adding an independent light to every blade.
  for(const side of [-1,1]){const p=frame(5,side*3);lights.push({id:`rest-seabed-diffuse-${side}`,x:p.x,y:level+2.3,z:p.z,
    radius:10,intensity:1.35,color:[.72,.65,.49],penetration:0,chartId:seat.chartId,level:seat.level,region:seat.phase,restSeabed:true});}
  for(const {car,body} of power>0?parked.lamps:[])for(const side of[-1,1]){
    const local=[side*.6,.65,-2.2],position=[0,1,2].map(k=>body[k]*local[0]+body[k+4]*local[1]+body[k+8]*local[2]+body[k+12]);
    // The lens keeps the van's own attitude, so it faces along the beam.
    const lens=[...body.slice(0,3).map(v=>v*.16),0,...body.slice(4,7).map(v=>v*.16),0,...body.slice(8,11).map(v=>v*.16),0,...position,1];
    props.push(decoration(`rest-seabed-lamp-${car}-${side}`,SOURCE_REST_SEABED_MESHES.lamp,lens,'seabed-lamp',
      {emissive:[1,.92,.74,3.2*power],headlampPower:power}));
    if(side>0)lights.push({id:`rest-seabed-headlamps-${car}`,x:position[0],y:position[1]+.4,z:position[2],radius:13,intensity:1.7*power,
      color:[1,.9,.72],penetration:0,chartId:seat.chartId,level:seat.level,region:seat.phase,restSeabed:true});
  }
  return{active:true,props,lights,level,progress,headlampPower:power,
    diagnostics:{active:true,level,cars:new Set(parked.rows.map(p=>p.seabedCar)).size,litCars:parked.lamps.length,
      grass:props.filter(p=>p.kind==='seabed-grass').length,crabs:props.filter(p=>p.kind==='seabed-crab').length,headlampPower:power,
      collisionChanged:false,supportChanged:false}};
}
