// Shared P3 prop scene. No scene stack, input, audio graph or save ownership.
import{COASTAL_MEMORY_LAYOUT as L,COASTAL_WORLD_FROM_LOCAL,COASTAL_SETTLED_BODY_LOCAL,COASTAL_RIM_BARRIERS,COASTAL_BEACH,COASTAL_BEACH_BOULDERS,COASTAL_BEACH_DRIFTWOOD,COASTAL_WRACK_LINE,coastalWorldPoint,coastalMultiply,coastalTerrainHeight,coastalRimX,coastalBeachHeight,coastalWaterlineX}from'../../data/coastal-memory.js';
import{COASTAL_MUSIC_BOX_MECHANISM,coastalMusicBoxMechanism}from'./mechanism.js';
import{coastalHandsMechanism}from'./winding.js';
import{VAN_WRECK,vanWreckHeadlamp,vanWreckTwistMatrix,vanWreckFoldMatrix,vanWreckHingedMatrix}from'../../data/van-wreck.js';
export const COASTAL_MEMORY_ASSETS=Object.freeze({geometry:'/assets/source-drive/coastal-memory/coastal-memory.glb',metrics:'/assets/source-drive/coastal-memory/metrics.json'});
const transform=(x=0,y=0,z=0,yaw=0,scale=[1,1,1])=>{const c=Math.cos(yaw),s=Math.sin(yaw);return[c*scale[0],0,-s*scale[0],0,0,scale[1],0,0,s*scale[2],0,c*scale[2],0,x,y,z,1];};
const rotX=a=>[1,0,0,0,0,Math.cos(a),Math.sin(a),0,0,-Math.sin(a),Math.cos(a),0,0,0,0,1];
const rotZ=a=>[Math.cos(a),Math.sin(a),0,0,-Math.sin(a),Math.cos(a),0,0,0,0,1,0,0,0,0,1];
const shift=p=>[1,0,0,0,0,1,0,0,0,0,1,0,p[0],p[1],p[2],1];
// The seabed mesh beyond the beach (build-coastal-memory seabed()): where both
// exist, the higher of the two is the floor a thing comes to rest on.
const seabedY=(x,z)=>-8.9+.42*Math.sin(x*.12+z*.055)+.21*Math.cos(z*.31);
const floorY=(x,z)=>Math.max(coastalBeachHeight(x,z),seabedY(x,z));
function instance(mesh,matrix,id=mesh,cullRadius=100){return{id,mesh,matrix,x:matrix[12],y:matrix[13],z:matrix[14],structural:true,skyExposed:false,cullRadius,sourceStructure:'coastal-memory'};}
function wreckProps(frame,metrics){
 const wheels=metrics?.body,point=p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite);
 if(!wheels||!Array.isArray(wheels.headlamps)||wheels.headlamps.length!==2||!wheels.headlamps.every(point)||![wheels.frontAxleZ,wheels.rearAxleZ,wheels.track,wheels.wheelRadius].every(Number.isFinite)||wheels.track<=0||wheels.wheelRadius<=0||!point(metrics.cabinBodyMount)||!point(metrics.wheel?.center)||!Number.isFinite(metrics.wheel?.tiltX))throw Error('The coastal wreck requires the actual loaded van metrics, including its headlamps, axles and cabin mount.');
 // The same van, not whole: the bent hull (van-wreck.glb) on its nose, the
 // cab's passenger door and the near rear door torn away, one lamp smashed.
 const body=coastalMultiply(frame,COASTAL_SETTLED_BODY_LOCAL),props=[instance(VAN_WRECK.meshes.hull,body,'coastal-sunken-same-van',14)];
 const lying=(mesh,id,[x,z],lift,yaw,turn)=>props.push(instance(mesh,coastalMultiply(frame,coastalMultiply(transform(x,floorY(x,z)+lift,z,yaw),coastalMultiply(turn,shift((VAN_WRECK.pieces[id]?.pivot||[0,0,0]).map(v=>-v))))),'coastal-wreck-'+id,12));
 // The cab door went down with it and lies face up on the seabed, seaward;
 // the rear door floated in and the swash left it on the shingle.
 lying(VAN_WRECK.meshes.cabDoor,'cabDoor',[19.6,-27.8],.16,.9,rotZ(Math.PI/2));
 lying(VAN_WRECK.meshes.rearDoor,'rearDoor',[7.25,-12.6],.11,-.35,coastalMultiply(rotZ(-.33),rotX(-Math.PI/2)));
 // The doors that stayed on hang open on their hinges where the latches let go.
 for(const key of Object.keys(VAN_WRECK.hinges))props.push(instance(VAN_WRECK.meshes[key],coastalMultiply(body,vanWreckHingedMatrix(key)),'coastal-wreck-'+key,14));
 // What the sea has already given back: a wheel trim thrown up the shingle and
 // the near-side mirror, torn off at the impact, lying face down in the wrack.
 for(const[mesh,x,z,yaw,tilt]of[['cm_van_hubcap',7.6,-24.1,.7,.32],[metrics.mirrors?.[0]?.mesh,5.15,-17.4,2.2,1.35]]){if(!mesh)continue;const y=coastalBeachHeight(x,z);props.push(instance(mesh,coastalMultiply(frame,coastalMultiply(transform(x,y+.03,z,yaw),rotX(tilt))),'coastal-wreck-debris-'+mesh,10));}
 // The rest of what came off it, strewn the length of the beach: the bumper
 // rolling in the swash, the torn-out near headlamp at the waterline, the
 // wiper by where you wake, shards of its panels on the shingle and under the
 // water, and the fence panel and reflector post it took over the edge, which
 // fell to the foot of the cliff. [mesh, x, z, yaw, lift, tilt]
 for(const[mesh,x,z,yaw,lift,tilt,id]of[
  ['cm_van_bumper',7.1,-19.6,1.15,0,rotZ(.08)],['cm_van_headlamp',7.9,-27.6,2.4,0,rotX(.35)],['drive_wiper',4.8,-28.4,1.0,.015,rotX(Math.PI/2)],
  ['cm_van_panel_shard_0',5.6,-22.6,.4,.05,rotX(Math.PI)],['cm_van_panel_shard_1',8.0,-14.1,2.1,.1,rotZ(.3)],['cm_van_panel_shard_2',11.8,-24.8,-.7,.045,rotX(0)],['cm_van_panel_shard_1',6.7,1.6,-1.2,.045,rotZ(.06),'shard-point'],
  ['drive_fence',3.6,-27.4,Math.PI/2,.04,rotX(-1.45)],['drive_reflector',3.6,-20.4,.3,.06,rotZ(Math.PI/2)],
 ])props.push(instance(mesh,coastalMultiply(frame,coastalMultiply(transform(x,floorY(x,z)+lift,z,yaw),tilt)),'coastal-wreck-strewn-'+(id||mesh),10));
 {const x=7.0,z=-9.2;props.push(instance('drive_tyre',coastalMultiply(frame,coastalMultiply(transform(x,floorY(x,z)+.11,z,-.4),rotZ(Math.PI/2))),'coastal-wreck-washed-tyre',10));}
 // The rear wheels stayed on. The front ones did not: one lies flat on the
 // seabed beside the nose; the sea brought the other up the shingle.
 const rear=coastalMultiply(body,vanWreckFoldMatrix());
 for(const side of[-1,1])props.push(instance('drive_tyre',coastalMultiply(rear,transform(side*wheels.track/2,wheels.wheelRadius,wheels.rearAxleZ)),'coastal-sunken-tyre-'+side+'-'+wheels.rearAxleZ,12));
 {const x=17.4,z=-21.6;props.push(instance('drive_tyre',coastalMultiply(frame,coastalMultiply(transform(x,floorY(x,z)+.11,z,.6),rotZ(Math.PI/2))),'coastal-wreck-front-tyre',12));}
 {const mount=metrics.cabinBodyMount,cabinAt=z=>coastalMultiply(coastalMultiply(body,vanWreckTwistMatrix(z)),transform(...mount));
  // The cab shell is bent into the hull; its fittings sit behind the crush and
  // turn with the wrung cab around them (van-wreck.js twist, at their own z).
  props.push(instance('drive_radio',cabinAt(mount[2]-.47),'coastal-sunken-drive_radio',12));
  props.push(instance('drive_wheel',coastalMultiply(coastalMultiply(cabinAt(mount[2]+metrics.wheel.center[2]),transform(...metrics.wheel.center)),rotX(metrics.wheel.tiltX)),'coastal-sunken-wheel',12));
  const r=metrics.recorder;if(r){const rm=coastalMultiply(coastalMultiply(cabinAt(mount[2]+r.center[2]),transform(...r.center)),rotX(r.tiltX));for(const mesh of[r.bodyMesh,r.cradleMesh])props.push(instance(mesh,rm,'coastal-sunken-'+mesh,12));props.push(instance(r.readoutMesh,coastalMultiply(rm,transform(...r.readoutLocalCenter)),'coastal-sunken-readout',12));}
 }
 return{body,rear,props};
}
export function makeCoastalMemoryScene({timeSec=0,musicBoxTime=0,worldFromLocal=COASTAL_WORLD_FROM_LOCAL,includeWreck=false,mode='opening',vehicleMetrics=null,hands=null}={}){
 if(!Number.isFinite(timeSec)||worldFromLocal?.length!==16||!worldFromLocal.every(Number.isFinite))throw Error('Finite coastal time and rigid world frame required.');
 const props=[],lamps=[],add=(mesh,local=transform(),id=mesh,radius=150)=>props.push(instance(mesh,coastalMultiply(worldFromLocal,local),id,radius));
 for(const mesh of['cm_limestone_coast','cm_grass_bank','cm_soil_cap','cm_seabed','cm_shingle_beach'])add(mesh,transform(),mesh,450);
 // The shingle at the cliff foot: talus, swash boulders and the point's field,
 // bleached timber and the wrack line. Every boulder instance is its collision.
 for(const b of COASTAL_BEACH_BOULDERS)add('cm_beach_boulder_'+b.variant,transform(b.x,b.groundY,b.z,b.yaw,[b.radiusX,b.height,b.radiusZ]),b.id,10);
 for(const d of COASTAL_BEACH_DRIFTWOOD){const t=1.5+d.length*.12;add('cm_driftwood',transform(d.x,d.groundY+.02,d.z,d.yaw,[d.length,t,t]),d.id,10);}
 for(const[i,w]of COASTAL_WRACK_LINE.entries())add('cm_wrack_strand',transform(w.x,w.y-.004,w.z,w.yaw,[1,1,w.length]),'beach-wrack-'+i,8);
 for(const b of COASTAL_RIM_BARRIERS)add(b.kind==='rim'?'cm_limestone_outcrop_'+b.variant:'cm_limestone_block',transform(b.x,b.groundY,b.z,b.yaw??.19*Math.sin(b.z),[b.radiusX??b.radius,b.height,b.radiusZ??b.radius]),b.id,6);
 // One explicit broad cloud-filtered moon approximation. The generic outdoor
 // yard hemisphere/haze is disabled on all coast stock, including the wreck.
 const moon=coastalWorldPoint([140,150,-80],worldFromLocal);lamps.push({id:'coastal-cloud-moon',x:moon[0],y:moon[1],z:moon[2],color:[.62,.69,.77],intensity:.55,radius:550,penetration:1,castsShadow:false,fixture:'cloud-filtered moon approximation'});
 // Sparse fallen bedding blocks, detached from the face and resting on the toe.
 for(let i=0;i<42;i++){const z=-130+i*8.5,x=coastalRimX(z)+4.6+(i%4)*1.3;if(z>COASTAL_BEACH.zSouth-1&&z<COASTAL_BEACH.zNorth+1)continue;add('cm_limestone_block',transform(x,-2.7+(i%3)*.45,z,i*.83,[1.2+(i%4)*.3,1.1+(i%3)*.35,1.7+(i%5)*.18]),'coastal-toe-block-'+i,8);}
 const box=L.musicBox,held=hands?.handling===true&&hands?.heldLocal?.length===16&&hands.heldLocal.every(Number.isFinite)?hands.heldLocal:null;const boxMatrix=held??transform(box.x,box.y,box.z,box.yaw??(-Math.PI/2-.16)),mechanism=held?coastalHandsMechanism(hands.winding):coastalMusicBoxMechanism(musicBoxTime);
 if(!held)add('cm_music_box_plinth',transform(box.x,box.groundY,box.z),'coastal-music-box-plinth',3);add('cm_broken_music_box',boxMatrix,box.id,3);
 // The real box is a CLOSED cream-plastic case: the comb/cylinder live inside.
 // The mechanism is still modelled (musicBoxMechanism below) and still drives the
 // audio, but nothing of it is drawn through the shell.
 void mechanism;
 add('cm_damp_note',transform(...L.note.position,-.12),L.note.id,3);
 const pier=L.pier;add('cm_distant_pier',transform(...pier.position,pier.heading),pier.id,350);
 const pierFrame=coastalMultiply(worldFromLocal,transform(...pier.position,pier.heading));for(const fixture of pier.fixtures){const pierBulb=coastalWorldPoint(fixture.aperture,pierFrame),pierTarget=coastalWorldPoint(fixture.shadowTarget,pierFrame),beam=pierTarget.map((v,i)=>v-pierBulb[i]);lamps.push({id:fixture.id,x:pierBulb[0],y:pierBulb[1],z:pierBulb[2],color:fixture.color,intensity:fixture.intensity,radius:fixture.radius,penetration:1,castsShadow:false,shadowYaw:Math.atan2(beam[0],-beam[2]),shadowPitch:Math.atan2(beam[1],Math.hypot(beam[0],beam[2])),fixture:'caged pier marker',anchorMesh:'cm_distant_pier'});}
 // Foam is sparse physical edge detail. Actual water/depth/refraction belongs
 // to the shared world compositor; there is deliberately no opaque sea sheet.
 // Off the cliffs, foam hangs at the toe; along the beach it is the swash,
 // reaching up the shingle and drawing back, and it breaks around the van.
 for(let i=0;i<32;i++){const z=-95+i*7.1;if(z>COASTAL_BEACH.zSouth-2&&z<COASTAL_BEACH.zNorth+3)continue;const x=coastalRimX(z)+3.8,swell=.08*Math.sin(timeSec*.71+i*.8);add('cm_foam_lace',transform(x,.055+swell,z,.08*Math.sin(i),[.7+(i%3)*.24,1,1.1]),'coastal-foam-'+i,12);}
 const van=L.settledPose.position;
 for(let i=0,z=COASTAL_BEACH.zSouth+3;z<COASTAL_BEACH.zNorth-2;i++,z+=2.35){if(Math.hypot(z-van[2],coastalWaterlineX(z)-van[0])<4.6)continue;const reach=.55*Math.sin(timeSec*.52+i*1.37),x=coastalWaterlineX(z)-reach,y=Math.max(.03,coastalBeachHeight(x,z)+.02);add('cm_foam_lace',transform(x,y+.035*Math.sin(timeSec*.71+i),z,.1*Math.sin(i*2.1),[.8+(i%3)*.2,1,.9]),'coastal-swash-'+i,12);}
 let wreck=null;if(includeWreck){wreck=wreckProps(worldFromLocal,vehicleMetrics);props.push(...wreck.props);{const anchor=vanWreckHeadlamp(vehicleMetrics.body.headlamps),i=VAN_WRECK.survivingHeadlamp,p=coastalWorldPoint(anchor,wreck.body);lamps.push({id:'coastal-sunken-headlamp-'+i,x:p[0],y:p[1],z:p[2],color:[1,.89,.72],intensity:5,radius:28,penetration:1,castsShadow:true,shadowYaw:Math.atan2(-wreck.body[8],wreck.body[10]),shadowPitch:Math.atan2(-wreck.body[9],Math.hypot(wreck.body[8],wreck.body[10])),direction:[-wreck.body[8],-wreck.body[9],-wreck.body[10]],coneOuterCos:.72,coneInnerCos:.94,fixture:'same van headlamp',vehicleBody:wreck.body});}}
 const anchor=p=>coastalWorldPoint(p,worldFromLocal),worldAnchors={waterOrigin:anchor([0,0,0]),roadLip:anchor([0,28,0]),headland:anchor(L.headland.spur),musicBox:anchor([box.x,box.y,box.z]),note:anchor(L.note.position),pier:anchor(pier.position),wreck:anchor(L.settledPose.position),wreckBody:coastalMultiply(worldFromLocal,COASTAL_SETTLED_BODY_LOCAL)};
 return{props,lamps,worldAnchors,wreckRearFrame:wreck?.rear||null,musicBoxMechanism:mechanism,water:{kind:'coastal-memory-sea',seaY:worldAnchors.waterOrigin[1],localSeaY:0,worldFromLocal,extentLocal:{min:[-10,-210],max:[360,370]},tint:[.025,.055,.05],absorption:[.085,.042,.026],waves:[{amplitude:.16,wavelength:9.4,speed:1.15,direction:[-.91,.41]},{amplitude:.07,wavelength:3.8,speed:.69,direction:[-.7,-.71]}],timeSec,opaqueMesh:false,realHeadlamps:includeWreck?lamps.filter(l=>l.fixture==='same van headlamp'):[],qualification:'Water compositor must resolve real geometry depth and lamp scattering; foam meshes do not replace the sea.'},physical:{layout:L,surface:L.supportAt,canOccupy:L.canOccupy,barriers:L.barriers,mode},samePlace:true};
}
