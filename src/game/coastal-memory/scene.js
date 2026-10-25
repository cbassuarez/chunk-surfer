// Shared P3 prop scene. No scene stack, input, audio graph or save ownership.
import{COASTAL_MEMORY_LAYOUT as L,COASTAL_WORLD_FROM_LOCAL,COASTAL_SETTLED_BODY_LOCAL,COASTAL_RIM_BARRIERS,coastalWorldPoint,coastalMultiply,coastalTerrainHeight,coastalRimX}from'../../data/coastal-memory.js';
import{COASTAL_MUSIC_BOX_MECHANISM,coastalMusicBoxMechanism}from'./mechanism.js';
export const COASTAL_MEMORY_ASSETS=Object.freeze({geometry:'/assets/source-drive/coastal-memory/coastal-memory.glb',metrics:'/assets/source-drive/coastal-memory/metrics.json'});
const transform=(x=0,y=0,z=0,yaw=0,scale=[1,1,1])=>{const c=Math.cos(yaw),s=Math.sin(yaw);return[c*scale[0],0,-s*scale[0],0,0,scale[1],0,0,s*scale[2],0,c*scale[2],0,x,y,z,1];};
const rotX=a=>[1,0,0,0,0,Math.cos(a),Math.sin(a),0,0,-Math.sin(a),Math.cos(a),0,0,0,0,1];
function instance(mesh,matrix,id=mesh,cullRadius=100){return{id,mesh,matrix,x:matrix[12],y:matrix[13],z:matrix[14],structural:true,skyExposed:false,cullRadius,sourceStructure:'coastal-memory'};}
function wreckProps(frame,metrics){
 const wheels=metrics?.body,point=p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite);
 if(!wheels||!Array.isArray(wheels.headlamps)||wheels.headlamps.length!==2||!wheels.headlamps.every(point)||![wheels.frontAxleZ,wheels.rearAxleZ,wheels.track,wheels.wheelRadius].every(Number.isFinite)||wheels.track<=0||wheels.wheelRadius<=0||!point(metrics.cabinBodyMount)||!point(metrics.wheel?.center)||!Number.isFinite(metrics.wheel?.tiltX))throw Error('The coastal wreck requires the actual loaded van metrics, including its headlamps, axles and cabin mount.');
 const body=coastalMultiply(frame,COASTAL_SETTLED_BODY_LOCAL),props=[instance('drive_vehicle_body',body,'coastal-sunken-same-van',12)];
 for(const side of[-1,1])for(const axle of[wheels.frontAxleZ,wheels.rearAxleZ])props.push(instance('drive_tyre',coastalMultiply(body,transform(side*wheels.track/2,wheels.wheelRadius,axle)),'coastal-sunken-tyre-'+side+'-'+axle,12));
 {const mount=metrics.cabinBodyMount,cabin=coastalMultiply(body,transform(...mount));
  for(const mesh of['drive_cabin','drive_radio'])props.push(instance(mesh,cabin,'coastal-sunken-'+mesh,12));
  props.push(instance('drive_wheel',coastalMultiply(coastalMultiply(cabin,transform(...metrics.wheel.center)),rotX(metrics.wheel.tiltX)),'coastal-sunken-wheel',12));
  for(const m of metrics.mirrors||[])props.push(instance(m.mesh,coastalMultiply(cabin,transform(...m.center)),'coastal-sunken-'+m.mesh,12));
  const r=metrics.recorder;if(r){const rm=coastalMultiply(coastalMultiply(cabin,transform(...r.center)),rotX(r.tiltX));for(const mesh of[r.bodyMesh,r.cradleMesh])props.push(instance(mesh,rm,'coastal-sunken-'+mesh,12));props.push(instance(r.readoutMesh,coastalMultiply(rm,transform(...r.readoutLocalCenter)),'coastal-sunken-readout',12));}
 }
 return{body,props};
}
export function makeCoastalMemoryScene({timeSec=0,musicBoxTime=0,worldFromLocal=COASTAL_WORLD_FROM_LOCAL,includeWreck=false,mode='opening',vehicleMetrics=null}={}){
 if(!Number.isFinite(timeSec)||worldFromLocal?.length!==16||!worldFromLocal.every(Number.isFinite))throw Error('Finite coastal time and rigid world frame required.');
 const props=[],lamps=[],add=(mesh,local=transform(),id=mesh,radius=150)=>props.push(instance(mesh,coastalMultiply(worldFromLocal,local),id,radius));
 for(const mesh of['cm_limestone_coast','cm_grass_bank','cm_soil_cap','cm_seabed','cm_wreck_seat'])add(mesh,transform(),mesh,450);
 for(const b of COASTAL_RIM_BARRIERS)add(b.kind==='rim'?'cm_limestone_outcrop_'+b.variant:'cm_limestone_block',transform(b.x,b.groundY,b.z,b.yaw??.19*Math.sin(b.z),[b.radiusX??b.radius,b.height,b.radiusZ??b.radius]),b.id,6);
 // One explicit broad cloud-filtered moon approximation. The generic outdoor
 // yard hemisphere/haze is disabled on all coast stock, including the wreck.
 const moon=coastalWorldPoint([140,150,-80],worldFromLocal);lamps.push({id:'coastal-cloud-moon',x:moon[0],y:moon[1],z:moon[2],color:[.62,.69,.77],intensity:.55,radius:550,penetration:1,castsShadow:false,fixture:'cloud-filtered moon approximation'});
 // Sparse fallen bedding blocks, detached from the face and resting on the toe.
 for(let i=0;i<42;i++){const z=-130+i*8.5,x=coastalRimX(z)+4.6+(i%4)*1.3;add('cm_limestone_block',transform(x,-2.7+(i%3)*.45,z,i*.83,[1.2+(i%4)*.3,1.1+(i%3)*.35,1.7+(i%5)*.18]),'coastal-toe-block-'+i,8);}
 const box=L.musicBox,boxMatrix=transform(box.x,box.y,box.z,-Math.PI/2-.16),mechanism=coastalMusicBoxMechanism(musicBoxTime);
 add('cm_music_box_plinth',transform(box.x,box.groundY,box.z),'coastal-music-box-plinth',3);add('cm_broken_music_box',boxMatrix,box.id,3);
 for(const[mesh,center,angle,id]of[['cm_music_box_cylinder',COASTAL_MUSIC_BOX_MECHANISM.cylinderCenter,mechanism.cylinderAngle,'cylinder'],['cm_music_box_gear',COASTAL_MUSIC_BOX_MECHANISM.gearCenter,mechanism.gearAngle,'gear']])add(mesh,coastalMultiply(coastalMultiply(boxMatrix,transform(...center)),rotX(angle)),'coastal-music-box-'+id,3);
 for(const[t,tine]of mechanism.liveTines.entries())add('cm_music_box_live_tine',coastalMultiply(coastalMultiply(boxMatrix,transform(tine.x,tine.tipY,tine.rootZ)),coastalMultiply(rotX(tine.deflection),transform(0,0,0,0,[1,1,tine.length]))),'coastal-music-box-live-tine-'+t,3);
 add('cm_damp_note',transform(...L.note.position,-.12),L.note.id,3);
 const pier=L.pier;add('cm_distant_pier',transform(...pier.position,pier.heading),pier.id,350);
 const pierFrame=coastalMultiply(worldFromLocal,transform(...pier.position,pier.heading));for(const fixture of pier.fixtures){const pierBulb=coastalWorldPoint(fixture.aperture,pierFrame),pierTarget=coastalWorldPoint(fixture.shadowTarget,pierFrame),beam=pierTarget.map((v,i)=>v-pierBulb[i]);lamps.push({id:fixture.id,x:pierBulb[0],y:pierBulb[1],z:pierBulb[2],color:fixture.color,intensity:fixture.intensity,radius:fixture.radius,penetration:1,castsShadow:false,shadowYaw:Math.atan2(beam[0],-beam[2]),shadowPitch:Math.atan2(beam[1],Math.hypot(beam[0],beam[2])),fixture:'caged pier marker',anchorMesh:'cm_distant_pier'});}
 // Foam is sparse physical edge detail. Actual water/depth/refraction belongs
 // to the shared world compositor; there is deliberately no opaque sea sheet.
 for(let i=0;i<32;i++){const z=-95+i*7.1,x=coastalRimX(z)+3.8,nearVan=Math.hypot(x-L.settledPose.position[0],z-L.settledPose.position[2]);if(nearVan<10)continue;const swell=.08*Math.sin(timeSec*.71+i*.8);add('cm_foam_lace',transform(x,.055+swell,z,.08*Math.sin(i),[.7+(i%3)*.24,1,1.1]),'coastal-foam-'+i,12);}
 let wreck=null;if(includeWreck){wreck=wreckProps(worldFromLocal,vehicleMetrics);props.push(...wreck.props);for(const[i,anchor]of vehicleMetrics.body.headlamps.entries()){const p=coastalWorldPoint(anchor,wreck.body);lamps.push({id:'coastal-sunken-headlamp-'+i,x:p[0],y:p[1],z:p[2],color:[1,.89,.72],intensity:5,radius:28,penetration:1,castsShadow:i===0,shadowYaw:Math.atan2(-wreck.body[8],wreck.body[10]),shadowPitch:Math.atan2(-wreck.body[9],Math.hypot(wreck.body[8],wreck.body[10])),direction:[-wreck.body[8],-wreck.body[9],-wreck.body[10]],coneOuterCos:.72,coneInnerCos:.94,fixture:'same van headlamp',vehicleBody:wreck.body});}}
 const anchor=p=>coastalWorldPoint(p,worldFromLocal),worldAnchors={waterOrigin:anchor([0,0,0]),roadLip:anchor([0,28,0]),headland:anchor(L.headland.spur),musicBox:anchor([box.x,box.y,box.z]),note:anchor(L.note.position),pier:anchor(pier.position),wreck:anchor(L.settledPose.position),wreckBody:coastalMultiply(worldFromLocal,COASTAL_SETTLED_BODY_LOCAL)};
 return{props,lamps,worldAnchors,musicBoxMechanism:mechanism,water:{kind:'coastal-memory-sea',seaY:worldAnchors.waterOrigin[1],localSeaY:0,worldFromLocal,extentLocal:{min:[-10,-210],max:[360,370]},tint:[.025,.055,.05],absorption:[.085,.042,.026],waves:[{amplitude:.16,wavelength:9.4,speed:1.15,direction:[-.91,.41]},{amplitude:.07,wavelength:3.8,speed:.69,direction:[-.7,-.71]}],timeSec,opaqueMesh:false,realHeadlamps:includeWreck?lamps.filter(l=>l.fixture==='same van headlamp'):[],qualification:'Water compositor must resolve real geometry depth and lamp scattering; foam meshes do not replace the sea.'},physical:{layout:L,surface:L.supportAt,canOccupy:L.canOccupy,barriers:L.barriers,mode},samePlace:true};
}
