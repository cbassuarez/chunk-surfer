// Finite authored catastrophes. Placements and contact boxes share one matrix;
// the route, tyres and boundary owner remain authoritative for drivable ground.
import{worldAt,roadAt}from'../road.js';
import{PREDICAMENT_MESH_BOUNDS,PREDICAMENT_LAMP_ANCHORS}from'./bounds.js';
export const PREDICAMENT_SECTIONS=Object.freeze([
 Object.freeze({id:'car-nage',start:170,end:425,title:'The queue has nowhere to go',construction:'A single cliff lane beside a recognisable wrecked queue. Cars accumulate, climb the outside and continue upside down above the lane.'}),
 Object.freeze({id:'whiteout-road-ocean',start:970,end:1115,title:'The road has lost its edges',construction:'An unmarked paved expanse through whiteout. Its remote continuations peel upward, while broken portal legs provide unreliable scale.'}),
]);
const row=(id,mesh,d,lateral,extra={})=>Object.freeze({id,mesh,d,lateral,lift:0,yaw:0,pitch:0,roll:0,pitchWithRoad:true,scale:[1,1,1],solid:false,...extra});
const car=(id,variant,d,lateral,extra={})=>row(id,'dp_wreck_'+variant,d,lateral,{solid:true,horn:true,...extra});
// Clear space is authored as deliberately as the congestion: ground wrecks
// never occupy the remaining lane; the inverted queue clears the van entirely.
const carnage=[
 car('queue-first-saloon','saloon',181,-4.25,{yaw:.10}),
 car('queue-first-estate','estate',188,-4.32,{yaw:-.035}),
 car('queue-long-wait','shell',198,-4.30,{yaw:.045}),
 car('queue-outside-wheel','estate',211,4.48,{yaw:-.12,roll:.035}),
 car('queue-short-stop','saloon',219,-4.22,{yaw:.025}),
 car('queue-sideways','shell',231,5.10,{yaw:.48,roll:.10}),
 car('queue-rear-on-bonnet','estate',240,-4.28,{yaw:.03,pitch:.12,lift:.21}),
 car('queue-under-stack','saloon',256,4.05,{yaw:-.025}),
 car('queue-second-storey','shell',257,4.15,{yaw:-.09,pitch:-.13,roll:-.06,lift:1.34}),
 car('queue-beginning-to-climb','estate',274,-4.35,{yaw:.025,pitch:-.48,lift:.9}),
 car('queue-standing','saloon',282,-4.45,{yaw:-.02,pitch:-1.18,lift:3.0}),
 car('queue-climbing-one','estate',285,-4.42,{yaw:.04,pitch:-1.47,roll:.03,lift:6.6,solid:false,motion:'suspended'}),
 car('queue-climbing-two','shell',287,-4.35,{yaw:.035,pitch:-1.56,roll:-.02,lift:10.85,solid:false,motion:'suspended'}),
 car('queue-no-road-below','saloon',297,4.17,{yaw:-.025,pitch:.11,roll:.08,lift:.05}),
 car('queue-overhead-first','estate',308,-.35,{yaw:.03,pitch:.04,roll:Math.PI,lift:8.05,solid:false,motion:'suspended'}),
 car('queue-overhead-second','saloon',313.6,-.20,{yaw:-.035,pitch:-.05,roll:Math.PI+.04,lift:8.35,solid:false,motion:'suspended'}),
 car('queue-overhead-third','shell',319.2,-.06,{yaw:.02,pitch:.035,roll:Math.PI-.02,lift:8.72,solid:false,motion:'suspended'}),
 car('queue-overhead-fourth','estate',324.8,.08,{yaw:-.02,pitch:.10,roll:Math.PI+.06,lift:9.24,solid:false,motion:'suspended'}),
 car('queue-under-hanging','shell',327,4.04,{yaw:.025}),
 car('queue-cliff-return','saloon',345,-4.31,{yaw:-.08,roll:-.09,lift:.16}),
 car('queue-rear-up','estate',357,4.42,{yaw:.09,pitch:.47,lift:.85}),
 car('queue-last-window','shell',374,-4.26,{yaw:.05}),
 car('queue-after-last','saloon',396,4.18,{yaw:-.04}),
 row('queue-dropped-wheel','dp_detached_wheel',224,3.36,{roll:1.36,yaw:.36,lift:.19,solid:true}),
 row('queue-torn-wing','dp_torn_panel',236,-3.48,{yaw:.65,lift:.05}),
 row('queue-torn-roof','dp_torn_panel',355,3.5,{yaw:-.46,lift:.07,scale:[1.6,1,1.4]}),
];
const cliffs=[];
for(let d=176;d<=416;d+=24)for(const side of[-1,1]){
 cliffs.push(row('cliff-fall-'+side+'-'+d,'dp_cliff_mass',d,side*2.12,{yaw:side<0?Math.PI:0,pitchWithRoad:false,scale:[1,.62+(d-176)/240*.38,1]}));
 // Broad wreck shoulders visibly shear away from the driven lane. The local
 // asphalt remains dark and unmarked, separated by the actual finite rail.
 cliffs.push(row('queue-ledge-'+side+'-'+d,'dp_cliff_shelf',d,side*4.72,{pitchWithRoad:true,lift:-.055,scale:[1,.9,.85]}));
}
const whiteout=[
 row('whiteout-fold-left-first','dp_road_fold',988,-44,{yaw:-.08,pitchWithRoad:false,lift:-.30,scale:[1.1,1.15,1.12]}),
 row('whiteout-fold-right-return','dp_road_fold',1024,49,{yaw:Math.PI+.16,pitchWithRoad:false,lift:-.25,scale:[1.25,1.38,1.15]}),
 row('whiteout-fold-left-far','dp_road_fold',1065,-61,{yaw:-1.04,pitchWithRoad:false,lift:6.5,roll:.14,scale:[1.20,1.55,1.28]}),
 row('whiteout-fold-high-return','dp_road_fold',1090,62,{yaw:1.42,pitchWithRoad:false,lift:16.0,roll:-.24,scale:[1.0,1.75,1.25]}),
 row('whiteout-portal-before','dp_whiteout_pylon',983,-35,{yaw:.06,pitchWithRoad:false,solid:true}),
 row('whiteout-portal-middle','dp_whiteout_pylon',1024,35,{yaw:-.12,pitchWithRoad:false,solid:true,scale:[1.08,1.12,1.08]}),
 row('whiteout-portal-after','dp_whiteout_pylon',1079,-38,{yaw:.18,pitchWithRoad:false,solid:true,scale:[1.3,1.3,1.3]}),
 // One familiar vehicle survives in the white. Its small ordinary scale is
 // the clue that the concrete forms beyond it have become impossibly large.
 car('whiteout-abandoned-reference','estate',1055,32.75,{yaw:.18,pitchWithRoad:false,horn:false}),
];
export const PREDICAMENT_LAYOUT=Object.freeze([...carnage,...cliffs,...whiteout]);
// Short fields keep the damaged lamps local to the queue. Preserve the lens
// mounts and saved-clock voltage phases; spend more light on nearby panels,
// rather than carrying a weak unshadowed fill across the complete cabin.
export const PREDICAMENT_PRACTICALS=Object.freeze([
 Object.freeze({car:'queue-first-estate',anchor:'rearRight',intensity:.32,radius:7}),
 Object.freeze({car:'queue-under-stack',anchor:'headLeft',intensity:.46,radius:7}),
 Object.freeze({car:'queue-beginning-to-climb',anchor:'rearRight',intensity:.50,radius:8}),
 Object.freeze({car:'queue-standing',anchor:'rearRight',intensity:.65,radius:8.5}),
 Object.freeze({car:'queue-overhead-first',anchor:'rearRight',intensity:.74,radius:6.5}),
 Object.freeze({car:'queue-overhead-fourth',anchor:'rearLeft',intensity:.68,radius:6.25}),
 Object.freeze({car:'queue-rear-up',anchor:'rearLeft',intensity:.40,radius:7}),
 Object.freeze({car:'queue-after-last',anchor:'rearLeft',intensity:.32,radius:7}),
 // Append rather than insert: existing low-voltage phases are saved-clock
 // indexed. These short elevated fields reach the upper cars, not the cabin.
 Object.freeze({car:'queue-climbing-one',anchor:'rearRight',intensity:1.60,radius:6.25,high:true}),
 Object.freeze({car:'queue-overhead-second',anchor:'rearRight',intensity:1.70,radius:4.5,high:true}),
]);
const rotation=(x=0,y=0,z=0)=>{const cx=Math.cos(x),sx=Math.sin(x),cy=Math.cos(y),sy=Math.sin(y),cz=Math.cos(z),sz=Math.sin(z);return[cy*cz+sy*sx*sz,cx*sz,-sy*cz+cy*sx*sz,0,-cy*sz+sy*sx*cz,cx*cz,sy*sz+cy*sx*cz,0,sy*cx,-sx,cy*cx,0,0,0,0,1];};
export const transformPredicamentPoint=(m,p)=>[m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12],m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13],m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]];
export function predicamentPlacementMatrix(p,timeSec=0){const a=worldAt(p.d,p.lateral,p.lift),index=carnage.indexOf(p),t=Number.isFinite(timeSec)?timeSec:0,stress=p.motion==='suspended'?Math.pow(Math.max(0,Math.sin(t*.41+index*1.73)),9):0,roll=p.roll+(p.motion==='suspended'?.026*Math.sin(t*.24+index)+stress*.045:0),pitch=p.pitch+(p.pitchWithRoad?a.pitch:0),m=rotation(pitch,-a.heading+p.yaw,roll);
 for(let k=0;k<3;k++){m[k]*=p.scale[0];m[4+k]*=p.scale[1];m[8+k]*=p.scale[2];}m[12]=32+a.x;m[13]=a.y+(p.motion==='suspended'?stress*.075:0);m[14]=32+a.z;return m;
}
function transformedBounds(m,b){const points=[];for(const x of[b.min[0],b.max[0]])for(const y of[b.min[1],b.max[1]])for(const z of[b.min[2],b.max[2]])points.push(transformPredicamentPoint(m,[x,y,z]));return points;}
const PYLON_HULLS=Object.freeze([-1,1].map(side=>Object.freeze({min:[side*4.7-.61,0,-.69],max:[side*4.7+.61,8.923212260834603,.69]})));
// Collision boxes include the exact POSITION envelope projected onto the
// car's ground axes, including body roll and pitch. Source drive contacts are
// horizontal OBBs, so overhead-only sculptures deliberately have no road box.
export function predicamentColliderRecords(p,timeSec=0){if(!p.solid)return[];const m=predicamentPlacementMatrix(p,timeSec),road=roadAt(p.d),yaw=road.heading-p.yaw,c=Math.cos(yaw),n=Math.sin(yaw),hulls=p.mesh==='dp_whiteout_pylon'?PYLON_HULLS:[PREDICAMENT_MESH_BOUNDS[p.mesh]];
 return hulls.map((b,index)=>{const points=transformedBounds(m,b),local=points.map(q=>({x:(q[0]-m[12])*c+(q[2]-m[14])*n,z:-(q[0]-m[12])*n+(q[2]-m[14])*c})),minX=Math.min(...local.map(q=>q.x)),maxX=Math.max(...local.map(q=>q.x)),minZ=Math.min(...local.map(q=>q.z)),maxZ=Math.max(...local.map(q=>q.z)),cx=(minX+maxX)/2,cz=(minZ+maxZ)/2;return{id:p.id+(hulls.length>1?'-leg-'+index:''),contactGroup:'drive-predicament',x:m[12]-32+c*cx-n*cz,z:m[14]-32+n*cx+c*cz,halfX:(maxX-minX)/2,halfZ:(maxZ-minZ)/2,yaw,minY:Math.min(...points.map(q=>q[1])),maxY:Math.max(...points.map(q=>q[1])),mesh:p.mesh,matrix:m,localBounds:b};});
}
export function predicamentColliders(s,reach=40){const distance=typeof s==='number'?s:-s.z,time=typeof s==='number'?0:s.programTime||0;return PREDICAMENT_LAYOUT.filter(p=>p.solid&&Math.abs(p.d-distance)<=reach+5).flatMap(p=>predicamentColliderRecords(p,time));}
function lampMatrix(car,anchor){const centre=transformPredicamentPoint(car,anchor.centre),m=[0,0,0,0,0,0,0,0,0,0,0,0,...centre,1];for(const[column,axis]of[[0,anchor.x],[4,anchor.y],[8,anchor.z]])for(let k=0;k<3;k++)m[column+k]=car[k]*axis[0]+car[4+k]*axis[1]+car[8+k]*axis[2];return m;}
export function predicamentPracticalFrame(s){const d=-s.z,t=s.programTime||0,props=[],lights=[];const nearest=PREDICAMENT_PRACTICALS.map((q,index)=>({...q,index,placement:PREDICAMENT_LAYOUT.find(p=>p.id===q.car)})).filter(q=>Math.abs(q.placement.d-d)<95).sort((a,b)=>Math.abs(a.placement.d-d)-Math.abs(b.placement.d-d)).slice(0,4);
 for(const q of nearest){const p=q.placement,car=predicamentPlacementMatrix(p,t),anchor=PREDICAMENT_LAMP_ANCHORS[p.mesh][q.anchor],m=lampMatrix(car,anchor),position=transformPredicamentPoint(m,[0,0,-.014]),id=p.id+'-powered-'+q.anchor,voltage=.94+.06*Math.sin(t*.37+q.index*1.9);props.push({id,mesh:'dp_wreck_broken_lamp',matrix:m,x:m[12],y:m[13],z:m[14],structural:true,skyExposed:true,sourceStructure:'drive-predicament-practical',sourceMemoryFixture:true});lights.push({id:id+'-light',anchorPropId:id,x:position[0],y:position[1],z:position[2],color:[1,.76,.46],intensity:q.intensity*voltage,radius:q.radius,penetration:1,emissiveScale:voltage,fixture:'damaged-car-lamp',car:p.id,anchor:q.anchor,high:!!q.high});}
 return{props,lights};
}
export function makePredicamentScene(s,{reach=235}={}){const d=-s.z,t=s.programTime||0,props=[],sources=[],rendered=[];for(const p of PREDICAMENT_LAYOUT){const radius=p.mesh==='dp_road_fold'?90:p.mesh==='dp_cliff_mass'?36:8;if(Math.abs(p.d-d)>reach+radius)continue;const m=predicamentPlacementMatrix(p,t);props.push({id:p.id,mesh:p.mesh,matrix:m,x:m[12],y:m[13],z:m[14],structural:true,skyExposed:true,cullRadius:radius,sourceStructure:'drive-predicament'});rendered.push(p.id);
  if(p.horn&&Math.abs(p.d-d)<95){const q=transformPredicamentPoint(m,[0,.64,-1.45]);sources.push({id:p.id+'-horn',kind:'wreck-horn',world:q,distance:p.d,seed:PREDICAMENT_LAYOUT.indexOf(p),overhead:p.motion==='suspended',load:Math.max(0,1-Math.abs(p.d-d)/95)});}
 }
 const practical=predicamentPracticalFrame(s);props.push(...practical.props);sources.sort((a,b)=>Math.abs(a.distance-d)-Math.abs(b.distance-d));return{props,lights:practical.lights,sources:sources.slice(0,4),diagnostics:{sections:PREDICAMENT_SECTIONS,active:PREDICAMENT_SECTIONS.find(p=>d>=p.start&&d<=p.end)?.id||null,rendered,meshCount:props.length,geometryPack:'assets/source-drive/predicaments/drive-predicaments.glb',groundSolidsStatic:true,overheadMotionUsesSavedProgrammeClock:true,roadSurfaceOwnedByRoute:true,practicals:practical.lights.map(l=>({id:l.id,car:l.car,anchor:l.anchor,world:[l.x,l.y,l.z],intensity:l.intensity,radius:l.radius})),maximumActiveCarPracticals:4}};
}
