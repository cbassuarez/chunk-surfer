// Physical recollections share the listener's chart. They borrow real objects
// from the game and never replace the player's support, collision or camera.
import {SOURCE_REST_SEATS} from './source-rest-seat.js';
import {OPENING_VEHICLE,openingVehicleInstances} from '../data/opening-vehicle.js';

const seat=SOURCE_REST_SEATS[0],PREFIX='source-continuation-';
const clamp=n=>Math.max(0,Math.min(1,Number(n)||0));
const smooth=(a,b,p)=>{const t=clamp((p-a)/(b-a));return t*t*(3-2*t);};
const prop=(id,mesh,x,y,z,sx=1,sy=sx,sz=sx,yaw=0,kind='listening')=>({id,mesh,x,y,z,sx,sy,sz,yaw,chartId:seat.chartId,kind});
const part=(id,mesh,dx,y,dz,sx,sy,sz,yaw=0,kind)=>prop(id,PREFIX+'memory-'+mesh,seat.x+dx,seat.feet+y,seat.z+dz,sx,sy,sz,yaw,kind);
// Keep the real shell, glazed opening, seats and closed door together. The
// radio, needles, loose steering wheel and wipers are interior inserts; drawing
// those around the listener made a passing memory into an enclosing cockpit.
const vehicleMeshes=new Set(['opening_drive_vehicle_body','opening_drive_tyre','opening_drive_cabin','opening_drive_cabin_door_r']);
function vehicleImage(id,anchor,{scale=1,travel=0,speed=0,kind='drive-vehicle',motion=null}={}){
  const wheelRotation=travel/(OPENING_VEHICLE.wheels.radius*scale);
  return openingVehicleInstances(anchor,{drive:{wipers:false,speed,wheelRotation}})
    .filter(p=>vehicleMeshes.has(p.mesh)).map(p=>{
      const matrix=Array.from(p.matrix);for(let n=0;n<12;n++)matrix[n]*=scale;
      for(const [n,key]of [[12,'x'],[13,'y'],[14,'z']])matrix[n]=anchor[key]+(matrix[n]-anchor[key])*scale;
      const {cabinVolume,...visual}=p;
      return{...visual,id:`rest-memory-${id}-`+p.id.replace('opening:',''),matrix,x:matrix[12],y:matrix[13],z:matrix[14],kind,chartId:seat.chartId,
        structural:false,decorative:true,collidable:false,memoryRoute:id,memoryScale:scale,memoryTravel:travel,memoryWheelRotation:wheelRotation,memoryMotion:motion};
    });
}
// Flood recollections reuse the same complete assembly and metre-scale axles.
// They apply a coastal body pose to this local assembly, not another cockpit.
export {vehicleImage as sourceRestVehicleImage};

// Each whole vehicle enters from outside the close field, passes once, and
// leaves before the next route begins. A silent interval restores the view of
// the music architecture; there is no wrapping vehicle or replacement floor.
const trafficCycle=31;
const trafficRoutes=Object.freeze([
  Object.freeze({id:'pass-left',start:0,duration:7.2,from:[14,-2.12],to:[-34,-2.12],scale:1,minIntensity:0}),
  Object.freeze({id:'pass-right',start:9.2,duration:7.2,from:[-34,2.20],to:[14,2.20],scale:.96,minIntensity:0}),
  Object.freeze({id:'pass-front',start:18.6,duration:6.3,from:[-4.15,21],to:[-4.15,-21],scale:1.02,minIntensity:.42}),
]);
function routeImage(route,time,{kind='delirium-vehicle',cycleSeconds=trafficCycle}={}){
  const t=Math.max(0,Number.isFinite(time)?time:0),cycle=Math.floor(t/cycleSeconds),local=t-cycle*cycleSeconds,age=local-route.start;
  if(age<0||age>=route.duration)return[];
  const phase=age/route.duration,dx=route.to[0]-route.from[0],dz=route.to[1]-route.from[1],distance=Math.hypot(dx,dz),
    travel=distance*phase,speed=distance/route.duration,yaw=Math.atan2(dx,-dz),
    anchor={x:seat.x+route.from[0]+dx*phase,y:seat.feet-.63,z:seat.z+route.from[1]+dz*phase,yaw},
    motion={cycle,phase,age,duration:route.duration,travel,speed,forward:{x:dx/distance,z:dz/distance},from:route.from,to:route.to};
  return vehicleImage(route.id,anchor,{scale:route.scale,travel,speed,kind,motion});
}
function stillTraffic(kind='delirium-vehicle'){
  // Accessibility keeps one complete, distant, stationary recollection. No
  // parked shell has spinning tyres, and nothing overlaps the seated body.
  return vehicleImage('still-traffic',{x:seat.x-7.6,y:seat.feet-.63,z:seat.z+1.5,yaw:Math.PI/2},{scale:.96,kind});
}
function driving(time=0,{reducedMotion=false}={}){
  const route={id:'recollection-crossing',start:0,duration:6.8,from:[-4.15,21],to:[-4.15,-21],scale:1};
  return{drive:reducedMotion?stillTraffic('drive-vehicle'):routeImage(route,time,{kind:'drive-vehicle',cycleSeconds:10.8}),road:[]};
}

// The end-of-life rally brings traffic through the listener's immediate
// personal space. These are full vehicles on bounded visual trajectories,
// not gameplay enemies; none receives a collider or a camera command.
export function sourceRestPassingCars(time=0,{reducedMotion=false,intensity=1}={}){
  if(clamp(intensity)<=0)return[];
  if(reducedMotion)return stillTraffic();
  return trafficRoutes.filter(route=>intensity>route.minIntensity).flatMap(route=>routeImage(route,time));
}

function elleryFront(){
  // These are the same hybrid school frontage and forecourt the player can
  // encounter outside, with the ELLERY relief and entrance kept together.
  // The frontage's -Z normal is turned east toward the seated viewer.
  const yaw=Math.PI/2,x=seat.x-24,y=seat.feet-1.55,z=seat.z;
  return [prop('rest-memory-ellery-front','ellery_public_front',x,y,z,.72,.72,.72,yaw,'ellery'),
    prop('rest-memory-ellery-forecourt','ellery_public_forecourt',x,y,z,.72,.72,.72,yaw,'ellery')];
}

function practiceRoom(){
  const rows=[],add=(id,mesh,x,y,z,sx,sy,sz,yaw=0)=>rows.push(part('rest-practice-'+id,mesh,x,y,z,sx,sy,sz,yaw,'practice'));
  // A whole room-sized arrangement, open toward the listener. It is a staged
  // recollection of the user-established early practice room, not a claim
  // about either friend's appearance, response or which visit they made.
  add('floor','oak',-6.9,-.30,0,5.5,.12,4.5);
  add('rear-wall','plaster',-9.55,-.18,0,.13,3.20,4.50);
  for(const side of[-1,1]){
    add('jamb-'+side,'oak',-8.9,-.18,side*2.12,1.35,3.22,.13);
    add('panel-'+side,'felt',-9.45,.55,side*1.32,.12,1.30,1.0);
    add('window-post-'+side,'oak',-9.32,.95,side*.62,.18,1.60,.065);
  }
  add('window-glow','window',-9.44,1.03,0,.05,1.42,1.14);
  add('window-sill','oak',-9.27,.89,0,.30,.10,1.38);
  add('window-mid','oak',-9.29,1.66,0,.18,.055,1.23);
  add('ceiling-lamp','brass',-6.6,3.42,0,.68,.08,.35);
  rows.push(prop('rest-practice-marimba','marimba',seat.x-6.8,seat.feet-.18,seat.z,.95,.95,.95,Math.PI/2,'practice'));
  rows.push(prop('rest-practice-bench','piano_bench',seat.x-7.85,seat.feet-.18,seat.z,1,1,1,Math.PI/2,'practice'));
  for(const side of[-1,1])rows.push(prop('rest-practice-listening-chair-'+side,'chair',seat.x-4.75,seat.feet-.18,seat.z+side*1.2,1,1,1,side*.16-Math.PI/2,'practice'));
  add('score-rest','oak',-7.7,.92,-1.22,.15,.035,.68);
  add('score-post','metal',-7.7,-.18,-1.22,.035,1.10,.035);
  add('score-foot','metal',-7.7,-.18,-1.22,.42,.035,.48);
  for(let n=0;n<3;n++)add('working-page-'+n,'paper',-7.7+n*.022,.965+n*.006,-1.42+n*.20,.22,.008,.31,Math.sin(n)*.13);
  rows.push(prop('rest-practice-recorder','ending_recorder_open',seat.x-4.80,seat.feet+.28,seat.z-1.20,.45,.45,.45,Math.PI/2,'practice'));
  rows.push(prop('rest-practice-microphone','vigil_part_kit_microphone',seat.x-5.9,seat.feet-.18,seat.z-1.52,.83,.83,.83,.4,'practice'));
  return rows;
}

function recital(){
  const rows=[],add=(id,mesh,x,y,z,sx,sy,sz,yaw=0)=>rows.push(part('rest-recital-'+id,mesh,x,y,z,sx,sy,sz,yaw,'recital'));
  add('stage','oak',-9.5,-.25,0,7.5,.18,7.2);
  add('auditorium-floor','felt',-3.9,-.37,0,3.8,.12,6.6);
  add('backcloth','curtain',-13.20,-.05,0,.10,4.8,7.4);
  for(const side of[-1,1]){
    add('proscenium-'+side,'oak',-7.10,-.05,side*3.6,.36,4.8,.38);
    for(let n=0;n<5;n++)add('curtain-fold-'+side+'-'+n,'curtain',-7.35-n*.065,-.05,side*(2.9+n*.16),.40,4.6,.25);
  }
  add('proscenium-head','oak',-7.10,4.65,0,.42,.28,7.6);
  add('stage-lip','brass',-5.70,-.08,0,.08,.13,7.3);
  add('stage-lamp','brass',-6.6,3.42,0,.44,.20,.36);
  rows.push(prop('rest-recital-marimba','marimba',seat.x-9,seat.feet-.05,seat.z,1,1,1,Math.PI/2,'recital'));
  rows.push(prop('rest-recital-bench','piano_bench',seat.x-10.05,seat.feet-.05,seat.z,1,1,1,Math.PI/2,'recital'));
  rows.push(prop('rest-recital-microphone','vigil_part_kit_microphone',seat.x-8.4,seat.feet-.05,seat.z-1.52,.95,.95,.95,.4,'recital'));
  // Empty, individually readable listening seats leave both remembered
  // listeners present as places, without substituting invented NPC faces.
  for(let row=0;row<2;row++)for(const z of[-2.25,-1.48,1.48,2.25])
    rows.push(prop(`rest-recital-audience-${row}-${z}`,'chair',seat.x-3.2-row*1.15,seat.feet-.25,seat.z+z,1,1,1,-Math.PI/2,'recital'));
  add('recording-table','oak',-6.3,-.05,2.45,.48,.55,.64);
  rows.push(prop('rest-recital-recorder','ending_recorder_open',seat.x-6.3,seat.feet+.51,seat.z+2.45,.65,.65,.65,-Math.PI/2,'recital'));
  return rows;
}

export function sourceRestMemories(state,{reducedMotion=false,submersion=0,floodActive=false}={}){
  const p=clamp(state?.sourceRestView?.degradation),seated=state?.sourceRestView?.seatId===seat.id;
  const empty={drivePresence:0,elleryPresence:0,drive:[],road:[],ellery:[],tableaux:[],lights:[],listener:null,delirium:0};
  if(!seated||state?.phase!==seat.phase||(state?.chartId??0)!==seat.chartId||p>=.90)return empty;
  // Runtime supplies this from the same cumulative audible media clock as
  // the conversation. No frame counter can speed up a pass or catch it up.
  const time=Number.isFinite(state.sourceRestView.audibleSeconds)?state.sourceRestView.audibleSeconds:0;
  const explicit=state.sourceRestView.memory;
  const drivePresence=clamp(explicit?.drive??state.sourceRestView.memoryDrive??smooth(.16,.23,p)*(1-smooth(.40,.49,p)));
  const elleryPresence=clamp(explicit?.ellery??smooth(.32,.39,p)*(1-smooth(.62,.72,p)));
  const listener=explicit&&Object.hasOwn(explicit,'listener')?explicit.listener:(p>=.48&&p<.59?'practice':p>=.59&&p<.72?'recital':null);
  const {drive,road}=drivePresence>.05?driving(time,{reducedMotion}):{drive:[],road:[]},ellery=elleryPresence>.05?elleryFront():[],tableaux=[];
  const delirium=smooth(.70,.76,p)*(1-smooth(.86,.90,p));
  if(delirium>.04){
    drive.push(...sourceRestPassingCars(time,{reducedMotion,intensity:delirium}));
  }
  // When the brief flood begins, the vehicle returns as the coastal wreck.
  // Dry-road traffic never drives through the submerged scene.
  if(floodActive||submersion>.70){drive.length=0;road.length=0;}
  if(listener==='practice'||listener==='both')tableaux.push(...practiceRoom());
  if(listener==='recital'||listener==='both')tableaux.push(...recital());
  const lights=[];
  const nearCar=drive.find(p=>p.mesh==='opening_drive_vehicle_body'&&Math.hypot(p.x-seat.x,p.z-seat.z)<8);
  if(nearCar)lights.push({id:'rest-traffic-reflected-light',x:nearCar.x,y:nearCar.y+.9,z:nearCar.z,
    radius:4.5,intensity:.48,color:[.80,.82,.75],penetration:1});
  if(tableaux.length)lights.push({id:'rest-listening-stage',x:seat.x-6.6,y:seat.feet+3.6,z:seat.z,
    radius:11,intensity:1.6,color:listener==='practice'?[.80,.84,.73]:[.98,.80,.53],penetration:1});
  if(ellery.length)lights.push({id:'rest-ellery-front-pool',x:seat.x-16.8,y:seat.feet+7,z:seat.z-3,
    radius:20,intensity:1.3,color:[.87,.81,.66],penetration:1});
  return{drivePresence,elleryPresence,drive,road,ellery,tableaux,lights,listener,delirium};
}

const box={p:[-.5,0,-.5,.5,0,-.5,.5,0,.5,-.5,0,.5,-.5,1,-.5,.5,1,-.5,.5,1,.5,-.5,1,.5],i:[0,2,3,0,1,2,4,7,6,4,6,5,0,4,5,0,5,1,1,5,6,1,6,2,2,6,7,2,7,3,3,7,4,3,4,0]};
const model=(material,base,extra={})=>({...box,material,base:[...base,1],...extra});
export function sourceRestMemoryGeometryLibrary(){return{
  'memory-asphalt':model('asphalt',[.24,.27,.28]),
  'memory-mark':model('linen',[.81,.79,.68]),
  'memory-oak':model('wood',[.68,.49,.29]),
  'memory-plaster':model('linen',[.74,.73,.65]),
  'memory-felt':model('case-lining',[.33,.43,.37]),
  'memory-window':model('linen',[.66,.73,.69]),
  'memory-metal':model('dark-metal',[.30,.33,.31]),
  'memory-paper':model('linen',[.84,.81,.69]),
  'memory-curtain':model('linen',[.40,.23,.22]),
  'memory-brass':model('worn-metal',[.71,.50,.28]),
};}
