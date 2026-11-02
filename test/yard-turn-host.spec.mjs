import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';
import {CONSERVATORY_PROPS} from '../src/data/conservatory-props.js';
import {conservatory} from '../src/data/floorplan/conservatory.js';
import {CELL,ZONE} from '../src/data/floorplan/legend.js';
import {YARD_PUBLIC_ROOMS} from '../src/data/yard-public-rooms.js';
import {YARD_TURN_FRAMES} from '../src/data/yard-turn.js';
import {EXTERIOR_PUB,pubLogicalAt,pubPhysicalAt,pubPhysicalYaw,pubWorldFromLocal} from '../src/data/exterior-pub.js';
import {PUB_ACTORS,PUB_NEW_ACTORS} from '../src/data/pub-population.js';
import {PUB_LIGHT_ANCHORS,PUB_INTERIOR_LAYOUT} from '../src/data/exterior-pub-furnishings.js';
import {OPENING_OVERTURE_PLAN} from '../src/data/opening-overture-plan.js';
import {OPENING_OVERTURE_SHOTS,openingOvertureFrame} from '../src/data/opening-overture.js';
import {openingCinematicActors,openingCinematicLighting} from '../src/render/opening-cinematic-staging.js';
import {pubCharacterInstances} from '../src/render/pub-character-performance.js';
import {PUB_ROOM_SOUND_ANCHORS,pubRoomSpatial} from '../src/audio/pub-room.js';
import {PUB_QUEST_FLAGS} from '../src/game/pub-quest.js';
import {pubServiceInstances,PUB_SERVICE_PLACEMENTS} from '../src/render/pub-service-presentation.js';

FP.compile(conservatory.levels,conservatory);
const main=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
test('a physical room seam changes the logical look frame without a transient world-camera quarter turn',()=>{
  const start=main.indexOf("if(planEdgeTurn&&RENDERER==='3d'){");assert.ok(start>=0);
  let end=main.indexOf('{',start),depth=1;for(end++;end<main.length&&depth;end++){if(main[end]==='{')depth++;else if(main[end]==='}')depth--;}
  const source=main.slice(start,end),before={current:.37,target:.62},fromBasis=-Math.PI/2,toBasis=0;
  let current=before.current,target=before.target,shifted=0,eased=0;
  vm.runInNewContext(source,{planEdgeTurn:fromBasis-toBasis,RENDERER:'3d',stairMotion:false,px:1,py:2,nx:3,ny:4,
    usingSpecialSpace:()=>false,FP:{usesPhysicalNavigationAt:()=>true},R3:{
      r3dShiftLookFrame:turn=>{current+=turn;target+=turn;shifted++;},
      r3dLookAngles:()=>({yaw:current,pitch:0}),r3dSetLookAngles:look=>{target=look.yaw;eased++;},
    }});
  assert.equal(shifted,1);assert.equal(eased,0);
  assert.ok(Math.abs(current+toBasis-(before.current+fromBasis))<1e-10);
  assert.ok(Math.abs(target+toBasis-(before.target+fromBasis))<1e-10);
});
const near=(a,b,e=2e-6)=>assert.ok(Math.abs(a-b)<=e,`${a} != ${b}`);
const near3=(a,b,e)=>a.forEach((v,k)=>near(v,b[k],e));
const frame=YARD_TURN_FRAMES['yard-rehearsal-annex'];
// Independent cardinal matrix from authored frame data, rather than calling
// the production physical-point embedding being tested.
function turned(point,f=frame){const angle=f.quarterTurns*Math.PI/2,c=Math.round(Math.cos(angle)),s=Math.round(Math.sin(angle)),x=point[0]-f.source.x,z=point[2]-f.source.z;return[f.target.x+c*x-s*z,point[1],f.target.z+s*x+c*z];}
const yawOf=(eye,target)=>Math.atan2(target[0]-eye[0],-(target[2]-eye[2]));
const sub=(a,b)=>a.map((v,k)=>v-b[k]),dot=(a,b)=>a.reduce((n,v,k)=>n+v*b[k],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]],unit=a=>{const n=Math.hypot(...a);return a.map(v=>v/n);};
function projected(eye,target,point,tan,aspect=2){const forward=unit(sub(target,eye)),right=unit(cross(forward,[0,1,0])),up=cross(right,forward),d=sub(point,eye),depth=dot(d,forward);return[dot(d,right)/(depth*tan*aspect),dot(d,up)/(depth*tan),depth];}
function productionFunction(name){const start=main.indexOf(`function ${name}(`),end=main.indexOf('\n}',start);assert.ok(start>=0&&end>start,name);return main.slice(start,end+2);}

test('actual compiled yard thresholds share physical centres, cardinal frames, hinges and audio across cached and uncached leaves',()=>{
  const start=main.indexOf('function doorMatMultiply('),end=main.indexOf("// THE YARD'S LEAVES.",start);assert.ok(start>=0&&end>start);
  const host={FP,CELL,Math,Float32Array,godDoorDebug:false};vm.createContext(host);
  vm.runInContext(main.slice(start,end)+'\nglobalThis.cache=doorLeafVisualCache;globalThis.rebuild=rebuildDoorLeafVisuals;globalThis.write=writeDoorLeafMatrix;',host);
  vm.runInContext(productionFunction('doorAudioAnchor'),host);
  const pubLogicalZero=pubLogicalAt(0,0),specs=[
    ...EXTERIOR_PUB.doors.map(d=>({id:d.id,frame,logicalOffset:{x:pubLogicalZero.x,z:pubLogicalZero.y},floor:EXTERIOR_PUB.floor})),
    ...YARD_PUBLIC_ROOMS.map(room=>({id:room.entrance.id,frame:YARD_TURN_FRAMES[room.buildingId],logicalOffset:{x:50,z:200},floor:room.floor})),
  ];
  const portals=new Map();FP.forEachDoor(portal=>portals.set(portal.id,portal));host.rebuild();
  const frames=host.doorRenderInstances();
  for(const spec of specs){
    const portal=portals.get(spec.id);assert.ok(portal);
    // Raw compiled aperture cells locate its centre before embedding. This
    // retains existing half-grid quantisation without adding a body half-cell.
    const mean=axis=>portal.cells.reduce((n,p)=>n+p[axis],0)/portal.cells.length;
    near(portal.cx,mean('x'));near(portal.cy,mean('y'));
    const authored=[mean('x')*CELL-spec.logicalOffset.x,spec.floor,mean('y')*CELL-spec.logicalOffset.z],centre=turned(authored,spec.frame);
    const base=portal.widthAxis==='x'?[1,0,0]:[0,0,1],sourceEnd=authored.map((v,k)=>v+base[k]),basis=sub(turned(sourceEnd,spec.frame),centre);
    const fixed=frames.find(p=>p.id==='door-frame:'+portal.id);assert.ok(fixed);
    near3(Array.from(fixed.matrix.slice(12,15)),centre);
    near3([fixed.matrix[0],fixed.matrix[1],fixed.matrix[2]],basis);
    const audio=host.doorAudioAnchor(portal);near3([audio.x,audio.y,audio.z],[centre[0],centre[1]+(portal.id.startsWith('pub-')?2.05:1.05),centre[2]]);
    const entries=host.cache.entries.filter(p=>p.portal.id===portal.id);assert.equal(entries.length,portal.definition.leafCount);
    for(const fraction of[0,.5,1]){
      portal.runtime.openFraction=fraction;for(const entry of entries)host.write(entry);
      const uncached=host.doorRenderInstances({leaves:true});
      for(const entry of entries){
        const instance=uncached.find(p=>p.id===entry.instance.id);assert.ok(instance);
        Array.from(instance.matrix).forEach((v,k)=>near(v,entry.matrix[k]));
        const definition=portal.definition,left=definition.leafCount===2?entry.leafIndex===0:definition.hinge!=='right',sign=left?-1:1;
        const hinge=authored.map((v,k)=>v+base[k]*sign*definition.aperture.width/2);
        near3(Array.from(entry.matrix.slice(12,15)),turned(hinge,spec.frame));
        const closed=basis.map(v=>v*(left?1:-1)),direction=[entry.matrix[0],entry.matrix[1],entry.matrix[2]],accepted=definition.activeLeaves.includes(entry.leafIndex)?fraction:0;
        near(Math.acos(Math.max(-1,Math.min(1,dot(unit(direction),unit(closed))))),accepted*Math.PI*.49,2e-6);
      }
    }
    portal.runtime.openFraction=0;
  }
  assert.equal(specs.length,5,'both pub doors plus caretaker, laundry and paired stores are exercised');
});

test('R01 retains approved relative projection, focus marks and screen-axis side through its joint physical embedding',()=>{
  const approved=OPENING_OVERTURE_PLAN.shots.find(s=>s.id==='R01'),shot=OPENING_OVERTURE_SHOTS.find(s=>s.sourcePlanId==='R01');
  const curve=(points,t)=>points[0].map((v,k)=>v+(points[1][k]-v)*t);
  const axisSide=(line,p)=>(line[1][0]-line[0][0])*(p[2]-line[0][1])-(line[1][1]-line[0][1])*(p[0]-line[0][0]);
  for(const time of[0,.6,2.5,4.4]){
    const sourceEye=curve(approved.camera.eye,time/shot.duration),sourceTarget=curve(approved.camera.target,time/shot.duration),native=openingOvertureFrame(time);
    near3(native.eye,turned(sourceEye));near3(native.target,turned(sourceTarget));
    near3([native.observer.x,native.observer.feet,native.observer.z],turned([41,.12,31]));
    assert.equal(native.lens.focalLengthMm,approved.camera.focalLengthMm);assert.equal(native.lens.apertureFNumber,approved.camera.fNumber);
    near(Math.sign(axisSide(approved.axisGeometry.lineXZ,sourceEye)),Math.sign(axisSide(shot.axisGeometry.lineXZ,native.eye)));
    const mark=approved.camera.focus.find(mark=>mark.at===time);
    if(mark){const opticalDepth=dot(sub(mark.target,sourceEye),unit(sub(sourceTarget,sourceEye)));near(native.lens.focusDistanceM,opticalDepth);near3(native.focusSubjectTarget,turned(mark.target));}
    for(const actor of PUB_ACTORS.filter(a=>['pub-bartender-iona','pub-patron-arthur','pub-patron-ed'].includes(a.id))){
      const point=[actor.x,actor.floor+1.2,actor.z];near3(projected(sourceEye,sourceTarget,point,native.tanHalfFov),projected(native.eye,native.target,turned(point),native.tanHalfFov),1e-10);
    }
  }
  const native=openingOvertureFrame(2.5),sourceEye=curve(approved.camera.eye,2.5/shot.duration),sourceTarget=curve(approved.camera.target,2.5/shot.duration);
  const counter=pubWorldFromLocal(PUB_INTERIOR_LAYOUT.furniture.find(f=>f.id==='pub-counter'));
  const before=pubRoomSpatial({x:sourceEye[0],z:sourceEye[2],yaw:yawOf(sourceEye,sourceTarget)},counter),after=pubRoomSpatial({x:native.eye[0],z:native.eye[2],yaw:native.yaw},PUB_ROOM_SOUND_ANCHORS.glass);
  near(before.pan,after.pan,1e-12);near(before.distance,after.distance,1e-12);near(before.gain,after.gain,1e-12);
});

test('opening cast, physical service vessels, practicals and the main dynamic cast agree on the same turned room',()=>{
  const frameNow=openingOvertureFrame(2.5),cast=openingCinematicActors(frameNow),ids=new Set(cast.map(p=>p.id));
  const sourceCast=PUB_ACTORS.filter(a=>ids.has(a.id)),baseline=pubCharacterInstances(sourceCast,{timeSec:frameNow.performanceSeconds,zone:ZONE.pub});
  for(const source of baseline){const actual=cast.find(p=>p.id===source.id);assert.ok(actual);const position=source.matrix?Array.from(source.matrix.slice(12,15)):[source.x,source.y,source.z],expected=turned(position);near3(actual.matrix?Array.from(actual.matrix.slice(12,15)):[actual.x,actual.y,actual.z],expected);}
  const lights=openingCinematicLighting(frameNow,{eye:frameNow.eye}).lights;
  for(const[id,point]of[['Study warm bar work key',[40,3.1,32]],['Study reflected street fill',[40,2,26]]]){
    const light=lights.find(l=>l.id===id);assert.ok(light);near3([light.x,light.y,light.z],turned(point));
  }
  const nativeLamp=PUB_LIGHT_ANCHORS.find(l=>l.id==='pub-bar-light'),sourceLamp=pubWorldFromLocal(nativeLamp),light=lights.find(l=>l.id===nativeLamp.id);assert.ok(light);
  // The approved photographic fixture retains its captured 2.69m height;
  // this embedding changes its ground-plane placement, not the lighting edit.
  near3([light.x,light.y,light.z],turned([sourceLamp.x,2.69,sourceLamp.z]));
  const vessels=pubServiceInstances({[PUB_QUEST_FLAGS.accepted]:true,[PUB_QUEST_FLAGS.trayTaken]:true,[PUB_QUEST_FLAGS.watersServed]:true});
  for(const id of['pub-water-mavis','pub-water-ed']){const specification=PUB_SERVICE_PLACEMENTS.find(p=>p.id===id),at=pubWorldFromLocal(specification),actual=vessels.find(p=>p.id===id);assert.ok(actual);const expected=turned([at.x,actual.y,at.z]);near(actual.x,expected[0]);near(actual.z,expected[2]);}
  // Execute the actual bounded main-call argument, rather than an independently
  // reimplemented actor placement path or the whole unrelated world updater.
  const block=main.slice(main.indexOf('function syncDoorDynamicProps('),main.indexOf('\nfunction ',main.indexOf('function syncDoorDynamicProps(')+1));
  const expression=block.match(/pubCharacterInstances\((PUB_NEW_ACTORS\.map\([\s\S]*?\)\)),\{timeSec:yardBusWomanClock/)?.[1];assert.ok(expression,'the production dynamic-cast consumer is extracted');
  const host={PUB_NEW_ACTORS,pubPhysicalAt,pubPhysicalYaw};vm.createContext(host);const mapped=vm.runInContext(expression,host);
  for(const source of PUB_NEW_ACTORS){const actual=mapped.find(a=>a.id===source.id),expected=turned([source.x,source.floor,source.z]);near3([actual.x,actual.floor,actual.z],expected);near(Math.sin(actual.yaw),Math.sin(source.yaw-Math.PI/2));near(Math.cos(actual.yaw),Math.cos(source.yaw-Math.PI/2));}
});

test('the approved plan, other shots and exact return camera remain independent of the pub embedding',()=>{
  const before=JSON.stringify(OPENING_OVERTURE_PLAN);
  assert.deepEqual(OPENING_OVERTURE_PLAN.shots[0].camera.eye[0],[43.6,1.72,29.85]);
  assert.equal(Object.isFrozen(OPENING_OVERTURE_PLAN.shots[0].camera.eye[0]),true);
  for(const approved of OPENING_OVERTURE_PLAN.shots.filter(s=>s.set!=='pub')){
    const shot=OPENING_OVERTURE_SHOTS.find(s=>s.sourcePlanId===approved.id);assert.deepEqual(shot.camera,approved.camera);assert.deepEqual(shot.axisGeometry,approved.axisGeometry);assert.equal(shot.physicalEmbedding,undefined);
  }
  const saved={eye:[17.13,1.74,9.31],yaw:-1.21,pitch:.27,renderGroup:'ground',floorH:.12},returned=openingOvertureFrame(35.5,{returnView:saved});
  assert.deepEqual(returned.eye,saved.eye);assert.equal(returned.yaw,saved.yaw);assert.equal(returned.pitch,saved.pitch);assert.equal(returned.floorH,saved.floorH);assert.equal(returned.nativeReturn,true);assert.equal(returned.lens,null);assert.equal(returned.transition.requiresFreshPlayerAction,true);
  assert.equal(JSON.stringify(OPENING_OVERTURE_PLAN),before,'runtime embeddings never rewrite approved photography');
});

test('the actual conversation head turn follows the rendered quarter-turned actor and the off-axis player body centre',()=>{
  const id='pub-patron-ed',authored=CONSERVATORY_PROPS.find(p=>p.id===id);assert.ok(authored);
  PROPS.propsInit(FP,[authored]);
  // Exercise real pose generation, including a non-cardinal drift and a
  // translated root. Looking up the raw authored placement would lose both.
  PROPS.setPropDrift(id,{dx:.17,dz:-.23,dyaw:.07});
  try{
    const pose=PROPS.renderInstances({group:'ground',inscriptions:false}).find(p=>p.id===id);assert.ok(pose);
    const actor=PUB_NEW_ACTORS.find(a=>a.id===id);near(Math.sin(pose.yaw),Math.sin(actor.yaw-Math.PI/2+.07));
    const context={PROPS,FP,CELL,px:0,py:0};vm.createContext(context);
    vm.runInContext(productionFunction('exteriorActorHeadYaw'),context);
    // Two physical sightlines have known signed angles from the actor's
    // rendered forward vector. Both use an actual supported pub cell, with
    // fractional coordinates so a missing body half-cell cannot cancel out.
    for(const[angle,distance]of[[.23,1.15],[-.19,1.5]]){
      const body={x:pose.x+Math.sin(pose.yaw+angle)*distance,z:pose.z-Math.cos(pose.yaw+angle)*distance};
      const observer=FP.logicalAtPhysical(body.x/CELL-.5,body.z/CELL-.5,{group:'ground',floor:EXTERIOR_PUB.floor});assert.ok(observer,'the off-axis observer occupies actual compiled ground');
      const physical=FP.logicalToPhysical(observer.x,observer.y);near((physical.x+.5)*CELL,body.x);near((physical.z+.5)*CELL,body.z);
      context.px=observer.x;context.py=observer.y;
      near(context.exteriorActorHeadYaw(id),-angle,1e-10);
    }
    assert.equal(context.exteriorActorHeadYaw('missing-actor'),0,'an absent physical actor remains neutral');
  }finally{PROPS.setPropDrift(id);}
});
