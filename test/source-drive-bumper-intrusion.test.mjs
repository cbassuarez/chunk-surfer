import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createBumperIntrusion,BUMPER_INTRUSION as C} from '../src/game/source-drive/bumper-intrusion.js';
import {createDoorDriveTeaser} from '../src/game/source-drive/door-teaser.js';
import {openingRoadAt} from '../src/game/source-drive/opening-road.js';
import {PREDICAMENT_LAMP_ANCHORS} from '../src/game/source-drive/predicaments/bounds.js';

const identity=()=>[1,0,0,0,0,1,0,0,0,0,1,0,32,0,-48,1];
const point=(m,p)=>[m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12],m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13],m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]];
const near=(a,b,e=1e-9)=>assert.ok(Math.abs(a-b)<=e,`${a} != ${b}`);
function freeze(value){if(value&&typeof value==='object'){for(const v of Object.values(value))freeze(v);Object.freeze(value);}return value;}
function frame(overrides={}){
 const body=identity(),eye=point(body,[.48,1.65,-1.4]);
 return{controlsEnabled:true,phase:'free-drive',worldOwner:'drive',timeSec:6,
   vehiclePose:{distance:85,speed:9,bodyMatrix:body},driveState:{x:0,z:-85,speed:9,heading:0,activeTake:null,takes:[],programTime:80},
   look:{yaw:0,pitch:-.035},renderFrame:{scene:{body,eye,look:{yaw:0,pitch:-.035},props:[{id:'ordinary-car',mesh:'ordinary'}],
     colliders:[{id:'solid-verge',halfX:1}],lamps:[{id:'headlamp',intensity:5}]},look:{yaw:0,pitch:-.035},weather:{rain:.6},recording:{active:false}},...overrides};
}
const prop=f=>f?.renderFrame?.scene?.props?.find(p=>p.id===C.id);
function start(c,f=frame(),p={}){c.update(1/60,f,p);assert.ok(c.snapshot().triggered);return f;}
function closest(c,f=frame(),p={}){start(c,f,p);if(c.snapshot().phase==='approach')c.update(C.approachSeconds,f,p);assert.equal(c.snapshot().phase,'closest');return f;}

test('eligibility requires the ordinary forward, unobstructed-looking early drive window',()=>{
 const cases=[{timeSec:4.99},{phase:'departure'},{controlsEnabled:false},{worldOwner:'return'},{skipped:true},{finished:true},
   {vehiclePose:{distance:74.99,speed:9}},{vehiclePose:{distance:145,speed:9}},
   {vehiclePose:{distance:85,speed:4.99}},{vehiclePose:{distance:85,speed:-9}},
   {look:{yaw:.301,pitch:0}},{look:{yaw:0,pitch:-.251}},{look:{yaw:0,pitch:.151}},
   {look:{yaw:NaN,pitch:0}},{renderFrame:null}];
 for(const changes of cases){const c=createBumperIntrusion(),f=frame(changes);c.update(.1,f,{});assert.equal(c.snapshot().phase,'waiting',JSON.stringify(changes));assert.equal(prop(c.apply(f))||null,null);}
 const busy=createBumperIntrusion(),f=frame();busy.update(.1,f,{allowTrigger:false});assert.equal(busy.snapshot().phase,'waiting');busy.update(.1,f,{});assert.equal(busy.snapshot().phase,'approach');
});

test('zero, negative and non-finite host time cannot trigger or advance an intrusion',()=>{
 const c=createBumperIntrusion(),f=frame();for(const dt of[0,-1,NaN,Infinity])c.update(dt,f,{});assert.equal(c.snapshot().phase,'waiting');
 start(c,f);c.update(C.approachSeconds/2,f,{});const before=c.snapshot();for(const dt of[0,-1,NaN,Infinity])c.update(dt,f,{});assert.deepEqual(c.snapshot(),before);
});

test('the real-scale rear accelerates from12m to2.2m while camera, physics, original lights and tape stay exact',()=>{
 const c=createBumperIntrusion(),f=freeze(frame()),before=JSON.stringify(f);start(c,f);let shown=c.apply(f);near(c.snapshot().rearDistance,12);
 assert.equal(shown.renderFrame.scene.eye,f.renderFrame.scene.eye);assert.equal(shown.renderFrame.scene.body,f.renderFrame.scene.body);assert.equal(shown.renderFrame.look,f.renderFrame.look);
 assert.equal(shown.driveState,f.driveState);assert.equal(shown.renderFrame.scene.colliders,f.renderFrame.scene.colliders);assert.equal(shown.renderFrame.scene.lamps[0],f.renderFrame.scene.lamps[0]);
 c.update(C.approachSeconds/2,f,{});shown=c.apply(f);near(c.snapshot().rearDistance,9.55);c.update(C.approachSeconds/2,f,{});shown=c.apply(f);near(c.snapshot().rearDistance,2.2);
 const p=prop(shown),rear=point(p.matrix,[0,0,C.rearZ]);near(rear[0],f.renderFrame.scene.eye[0]);near(f.renderFrame.scene.eye[2]-rear[2],2.2);
 assert.ok(rear[2]<f.renderFrame.scene.body[14]+C.vanNoseZ-.1,'rear cannot clip through the van nose');
 assert.deepEqual(p.matrix.slice(0,12),f.renderFrame.scene.body.slice(0,12),'no stretched car');assert.equal(p.mesh,'dp_wreck_saloon');
 assert.equal(p.bumperIntrusion.cameraChanged,false);assert.equal(p.bumperIntrusion.collisionAdded,false);assert.equal(JSON.stringify(f),before);
});

test('full presentation deliberately lifts only the perceived rear smoothly above the bonnet; quiet modes remain grounded',()=>{
 const c=createBumperIntrusion(),f=freeze(frame()),body=f.renderFrame.scene.body,eye=f.renderFrame.scene.eye;start(c,f);const y0=prop(c.apply(f)).y;
 near(c.snapshot().dreamLift,0);c.update(C.approachSeconds/2,f,{});const middle=c.apply(f);near(prop(middle).y-y0,.075);near(c.snapshot().dreamLift,.075);
 c.update(C.approachSeconds/2,f,{});const close=c.apply(f);near(prop(close).y-y0,.60);near(c.snapshot().dreamLift,.60);
 const bumper=point(prop(close).matrix,[0,.44,C.rearZ]);assert.ok(bumper[1]>1,'bumper clears its formerly low .44m image');
 assert.equal(close.renderFrame.scene.body,body);assert.equal(close.renderFrame.scene.eye,eye);assert.equal(c.snapshot().physicalVehiclePath,false);
 for(const presentation of[{reducedMotion:true},{reducedDread:true}]){const q=createBumperIntrusion();start(q,f,presentation);near(q.snapshot().dreamLift,0);near(prop(q.apply(f)).y,y0);}
 c.update(0,f,{reducedMotion:true});near(c.snapshot().dreamLift,0);near(prop(c.apply(f)).y,y0);
});

test('both steady red lenses and their bounded spill lights follow the actual generated rear anchors',()=>{
 const c=createBumperIntrusion(),f=freeze(frame()),before=JSON.stringify(f);start(c,f);const sample=[];
 for(const dt of[0,C.approachSeconds/2,C.approachSeconds/2]){
   c.update(dt,f,{});const a=c.apply(f),car=prop(a),lamps=a.renderFrame.scene.props.filter(p=>p.mesh==='dp_wreck_broken_lamp');
   assert.equal(lamps.length,2);assert.equal(a.renderFrame.scene.lamps.length,f.renderFrame.scene.lamps.length+2);
   for(const[name,index]of[['rearLeft',0],['rearRight',1]]){
     const lens=lamps[index],anchor=PREDICAMENT_LAMP_ANCHORS.dp_wreck_saloon[name],centre=point(car.matrix,anchor.centre),light=a.renderFrame.scene.lamps.find(l=>l.anchorPropId===lens.id);
     for(let k=0;k<3;k++)near(lens.matrix[12+k],centre[k]);
     for(const[column,axis]of[[0,anchor.x],[4,anchor.y],[8,anchor.z]])for(let k=0;k<3;k++)near(lens.matrix[column+k],car.matrix[k]*axis[0]+car.matrix[4+k]*axis[1]+car.matrix[8+k]*axis[2]);
     const emission=point(lens.matrix,[0,0,-.014]);for(let k=0;k<3;k++)near([light.x,light.y,light.z][k],emission[k]);
     assert.equal(lens.sourceMemoryFixture,true);assert.deepEqual(lens.emissive,[1,.004,.001,3]);near(lens.practicalEmissiveScale,.12);near(lens.emissive[3]*lens.practicalEmissiveScale,.36);
     assert.deepEqual(light.color,[1,.004,.001]);near(light.intensity,.10);near(light.radius,.7);assert.equal(light.steady,true);assert.equal(lens.bumperIntrusion.steady,true);
     sample.push([lens.practicalEmissiveScale,...lens.emissive,light.intensity,light.radius]);
   }
   assert.equal(a.renderFrame.scene.lamps[0],f.renderFrame.scene.lamps[0]);
 }
 for(const s of sample)assert.deepEqual(s,sample[0],'no flashing or programme-time modulation');assert.equal(JSON.stringify(f),before);
});

test('a coarse frame cannot skip the closest image, and sound needs a successful current render acknowledgement',()=>{
 const c=createBumperIntrusion(),f=frame();start(c,f);c.update(1,f,{});assert.equal(c.snapshot().phase,'closest');
 assert.equal(c.presented(true),null,'no apply means no drawn image');c.apply(f);assert.equal(c.presented(false),null);assert.equal(c.snapshot().closestPresented,false);
 c.update(2,f,{});assert.equal(c.snapshot().phase,'closest','time alone cannot remove an unseen close pose');
 c.apply(f);const impact=c.presented(true);assert.equal(impact.kind,'bumper-intrusion-impact');assert.equal(impact.strength,1);assert.equal(c.presented(true),null);
 c.update(1/60,f,{});assert.equal(c.snapshot().phase,'spent','no forced contact hold: the next frame is ordinary driving');
 const cleared=c.apply(f);assert.equal(prop(cleared)||null,null);assert.equal(cleared,f);assert.equal(c.presented(true),null);
 c.update(3,f,{});assert.equal(c.snapshot().phase,'spent');assert.equal(c.presented(true),null);
});

test('presenting an approach frame cannot acknowledge a later unrendered closest frame',()=>{
 const c=createBumperIntrusion(),f=frame();start(c,f);c.apply(f);c.update(C.approachSeconds,f,{});assert.equal(c.presented(true),null);assert.equal(c.snapshot().closestPresented,false);
 c.apply(f);assert.ok(c.presented(true));
});

test('mid-approach and closest pauses retain exact visual state and cannot repeat impact on resume',()=>{
 const c=createBumperIntrusion(),f=frame();start(c,f);c.update(.03,f,{});let before=c.snapshot(),shown=c.apply(f);
 for(let i=0;i<30;i++)c.update(0,f,{});assert.deepEqual(c.snapshot(),before);assert.deepEqual(c.apply(f),shown);
 c.update(C.approachSeconds-.03,f,{});c.apply(f);assert.ok(c.presented(true));before=c.snapshot();for(let i=0;i<30;i++)c.update(0,f,{});assert.deepEqual(c.snapshot(),before);
 c.apply(f);assert.equal(c.presented(true),null);c.update(1/60,f,{});assert.equal(c.snapshot().phase,'spent');
});

test('reduced motion is one stationary6m image, and reduced dread keeps it quiet',()=>{
 for(const p of[{reducedMotion:true},{reducedDread:true},{reducedMotion:true,reducedDread:true}]){
   const c=createBumperIntrusion(),f=frame();start(c,f,p);assert.equal(c.snapshot().phase,'closest');const a=c.apply(f);near(c.snapshot().rearDistance,6);
   c.update(.5,f,p);const b=c.apply(f);assert.deepEqual(prop(a).matrix,prop(b).matrix,'accessibility image must not rush toward the player');
   const event=c.presented(true);if(p.reducedDread){assert.equal(event,null);assert.equal(c.snapshot().impactEmitted,false);}else assert.equal(event.strength,.35);
   c.update(.099,f,p);assert.equal(c.snapshot().phase,'closest','quiet still image retains its gentler readable hold');
   c.update(.0011,f,p);assert.equal(c.snapshot().phase,'spent');assert.equal(prop(c.apply(f))||null,null);
 }
});

test('effects off consumes the same event without a prop, a sound or a second chance',()=>{
 const c=createBumperIntrusion(),f=frame();start(c,f,{effectsMode:'off'});assert.equal(c.snapshot().mode,'disabled');assert.equal(c.snapshot().phase,'spent');
 assert.equal(c.apply(f),f);assert.equal(c.presented(true),null);c.update(10,f,{effectsMode:'full'});assert.equal(c.snapshot().phase,'spent');
});

test('menu-time accessibility downgrades apply at zero dt, freeze age, and cannot upgrade the consumed event',()=>{
 const c=createBumperIntrusion(),f=frame();start(c,f);c.update(C.approachSeconds/2,f,{});const age=c.snapshot().elapsed;
 c.update(0,f,{reducedMotion:true});assert.equal(c.snapshot().mode,'still');assert.equal(c.snapshot().phase,'closest');near(c.snapshot().elapsed,age);near(c.snapshot().rearDistance,6);
 c.update(0,f,{reducedMotion:false});assert.equal(c.snapshot().mode,'still');
 const still=c.apply(f);c.update(0,f,{reducedDread:true});assert.equal(c.snapshot().mode,'quiet');assert.equal(c.presented(true),null,'a pre-downgrade apply cannot create the stale louder impact');
 assert.deepEqual(prop(c.apply(f)).matrix,prop(still).matrix);assert.equal(c.presented(true),null);assert.equal(c.snapshot().impactEmitted,false);
 c.update(0,f,{});assert.equal(c.snapshot().mode,'quiet');near(c.snapshot().elapsed,age);
 c.update(0,f,{effectsMode:'off'});assert.equal(c.snapshot().mode,'disabled');assert.equal(c.snapshot().phase,'spent');assert.equal(prop(c.apply(still))||null,null);
 c.update(.2,f,{effectsMode:'full'});assert.equal(c.snapshot().mode,'disabled');assert.equal(c.presented(true),null);
 const waiting=createBumperIntrusion();waiting.update(0,f,{reducedMotion:true});assert.equal(waiting.snapshot().phase,'waiting','opening a menu cannot trigger the event');
});

test('a held free-drive frame keeps the event, but held terminal skip or fall cleans it immediately',()=>{
 const c=createBumperIntrusion(),f=frame();closest(c,f);const before=c.snapshot();c.update(0,frame({controlsEnabled:false}),{});assert.deepEqual(c.snapshot(),before,'pause temporarily owns controls');
 const decorated=c.apply(f);c.update(0,frame({phase:'fall',controlsEnabled:false}),{});assert.equal(c.snapshot().phase,'cancelled');assert.equal(prop(c.apply(decorated))||null,null);assert.equal(c.presented(true),null);
});

test('captured body orientation ignores head look and later steering while translation follows the van',()=>{
 const c=createBumperIntrusion(),f=frame();closest(c,f);const a=prop(c.apply(f));
 const body=identity(),angle=.6;body[0]=Math.cos(angle);body[2]=-Math.sin(angle);body[8]=Math.sin(angle);body[10]=Math.cos(angle);body[12]+=2;body[13]+=.1;body[14]-=3;
 const later=frame({look:{yaw:1.2,pitch:.3}});later.renderFrame.scene.body=body;later.renderFrame.scene.look={yaw:1.8,pitch:.3};const b=prop(c.apply(later));
 assert.deepEqual(b.matrix.slice(0,12),a.matrix.slice(0,12));near(b.x-a.x,2);near(b.y-a.y,.1);near(b.z-a.z,-3);
});

test('explicit cancel, skip, forced fall and return clean up without changing the production frame',()=>{
 for(const change of[{phase:'departure',controlsEnabled:false},{skipped:true},{worldOwner:'return'},{finished:true}]){
   const c=createBumperIntrusion(),f=frame();closest(c,f);const decorated=c.apply(f);c.update(.01,frame(change),{});assert.equal(c.snapshot().phase,'cancelled');
   const cleaned=c.apply(decorated);assert.equal(prop(cleaned)||null,null);assert.equal(cleaned.renderFrame.scene.colliders,f.renderFrame.scene.colliders);assert.deepEqual(cleaned.renderFrame.scene.props,f.renderFrame.scene.props);assert.deepEqual(cleaned.renderFrame.scene.lamps,f.renderFrame.scene.lamps);assert.equal(c.presented(true),null);
 }
 const c=createBumperIntrusion(),f=frame();closest(c,f);const decorated=c.apply(f);c.cancel();c.cancel();assert.equal(prop(c.apply(decorated))||null,null);c.update(3,f,{});assert.equal(c.snapshot().phase,'cancelled');
});

test('temporary lens and light cleanup works on previously decorated frames with initially absent arrays',()=>{
 const c=createBumperIntrusion(),f=frame();delete f.renderFrame.scene.props;delete f.renderFrame.scene.lamps;closest(c,f);const a=c.apply(f),b=c.apply(a);
 assert.equal(b.renderFrame.scene.props.length,3);assert.equal(b.renderFrame.scene.lamps.length,2);assert.equal(f.renderFrame.scene.props,undefined);assert.equal(f.renderFrame.scene.lamps,undefined);
 c.cancel();const cleaned=c.apply(b);assert.deepEqual(cleaned.renderFrame.scene.props,[]);assert.deepEqual(cleaned.renderFrame.scene.lamps,[]);assert.equal(cleaned.renderFrame.scene.bumperIntrusion,undefined);
});

test('snapshot and repeated apply calls cannot alter saved event state or duplicate the temporary prop',()=>{
 const c=createBumperIntrusion(),f=frame();start(c,f);const s=c.snapshot();s.triggeredAt.distance=0;s.presentation.reducedDread=true;assert.equal(c.snapshot().triggeredAt.distance,85);assert.equal(c.snapshot().presentation.reducedDread,false);
 const a=c.apply(f),b=c.apply(a);assert.equal(b.renderFrame.scene.props.filter(p=>p.id===C.id).length,1);assert.equal(f.renderFrame.scene.props.length,1);
});

test('the actual opening-drive frame supplies a correctly aligned complete saloon without route or camera mutation',()=>{
 const metrics=JSON.parse(readFileSync(new URL('../public/assets/source-drive/geometry/metrics.json',import.meta.url))),p=openingRoadAt(75);
 const drive=createDoorDriveTeaser({initialDrive:{x:p.x,z:p.z,heading:p.heading,roadHeight:p.height,speed:9,furthest:75}});drive.start();
 for(let i=0;i<610;i++){if(drive.snapshot().controlsEnabled)drive.input('forward',true);drive.update(1/120);}
 const f=drive.frame(metrics),before=structuredClone(f.driveState),camera=structuredClone({eye:f.renderFrame.scene.eye,look:f.renderFrame.look}),c=createBumperIntrusion();
 assert.ok(f.vehiclePose.distance>=75&&f.vehiclePose.distance<145);closest(c,f);const a=c.apply(f),rear=prop(a).bumperIntrusion.rearPlane,eye=f.renderFrame.scene.eye;
 const front=[-prop(a).matrix[8],-prop(a).matrix[9],-prop(a).matrix[10]];near(rear.reduce((sum,v,i)=>sum+(v-eye[i])*front[i],0),2.2,2e-5);
 assert.deepEqual(a.driveState,before);assert.deepEqual({eye:a.renderFrame.scene.eye,look:a.renderFrame.look},camera);assert.equal(a.renderFrame.scene.colliders,f.renderFrame.scene.colliders);drive.dispose();
});
