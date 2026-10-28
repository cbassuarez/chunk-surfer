import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import { STREET_PILOT, STREET_PILOT_MESHES,streetPilotFloorAt } from '../src/data/street-pilot.js';
import * as FP from '../src/world/floorplan.js';
import * as PROPS from '../src/game/props.js';
import {conservatory} from '../src/data/floorplan/conservatory.js';
import {CELL,ZONE} from '../src/data/floorplan/legend.js';
import {districtLogicalAt} from '../src/data/exterior-district.js';
import {CONSERVATORY_PROPS,PROP_MESH} from '../src/data/conservatory-props.js';
import {exteriorAmbientInstances,exteriorAmbientSnapshot,exteriorHeadlightLights} from '../src/game/exterior-ambient.js';
import {busGraffitiInstance} from '../src/render/bus-graffiti.js';
import {
  createStreetPilotClock,streetPilotSignalFrame,streetPilotVehicleSchedule,
  streetPilotVehicleFrame,streetPilotSafetyFrame,streetPilotVehicleInstances,
  streetPilotStaticInstances,streetPilotSignalInstances,streetPilotHeadlightLights,
} from '../src/game/street-pilot.js';

const near=(actual,expected,epsilon=1e-7)=>assert.ok(Math.abs(actual-expected)<=epsilon,
  `${actual} differs from ${expected}`);

test('one isolated existing north-street pilot has conservative left-hand lane envelopes',()=>{
  assert.equal(STREET_PILOT.status,'isolated-prototype');
  assert.deepEqual(STREET_PILOT.vehicles.map(node=>node.id),['late-bus','north-night-car']);
  for(const node of STREET_PILOT.vehicles){
    const spec=STREET_PILOT[node.kind],bounds=streetPilotVehicleFrame(node,0).bounds;
    assert.ok(bounds.z0>=STREET_PILOT.road.z0&&bounds.z1<=STREET_PILOT.road.z1);
    assert.ok(node.direction>0?node.laneZ<-7.5:node.laneZ>-7.5,'British left-hand lanes');
    assert.ok(spec.envelopeLengthM>=spec.bodyLengthM&&spec.envelopeWidthM>=spec.bodyWidthM);
  }
});

test('pedestrian walk, blackout, red+amber, green, amber and all-red form one exact cycle',()=>{
  for(const [time,phase,vehicle,pedestrian]of[
    [0,'pedestrian-walk','red','green'],[5.999,'pedestrian-walk','red','green'],
    [6,'pedestrian-clearance','red','blackout'],[15.999,'pedestrian-clearance','red','blackout'],
    [16,'pedestrian-clearance-all-red','red','red'],[16.999,'pedestrian-clearance-all-red','red','red'],
    [17,'red-amber','red-amber','red'],[18.999,'red-amber','red-amber','red'],
    [19,'vehicle-green','green','red'],[47.999,'vehicle-green','green','red'],
    [48,'vehicle-amber','amber','red'],[50.999,'vehicle-amber','amber','red'],
    [51,'all-red','red','red'],[53.999,'all-red','red','red'],
    [54,'pedestrian-walk','red','green'],
  ]){
    const actual=streetPilotSignalFrame(time);
    assert.deepEqual([actual.phase,actual.vehicle,actual.pedestrian],[phase,vehicle,pedestrian]);
  }
});

test('complete conservative vehicle envelopes stay outside crossing through walk and clearance',()=>{
  // Boundary samples and dense periodic sweep supplement the analytic stop
  // proof below. Vehicle start permission is not inferred from lens colour.
  for(const time of[0,5.999999,6,15.999999,16,18.999999,54,60,70]){
    const frame=streetPilotSafetyFrame(time);
    assert.equal(frame.pedestrianConflict,false);assert.equal(frame.clearanceConflict,false);
  }
  for(let time=0;time<=STREET_PILOT.cycle.seconds*3;time+=.025){
    const frame=streetPilotSafetyFrame(time);
    assert.equal(frame.pedestrianConflict,false,`walk conflict at${time}`);
    assert.equal(frame.clearanceConflict,false,`clearance conflict at${time}`);
    if(frame.signal.pedestrianMayStart)for(const vehicle of frame.vehicles)near(vehicle.velocityMps,0);
  }
  for(const node of STREET_PILOT.vehicles){
    const q=streetPilotVehicleSchedule(node),atStop=streetPilotVehicleFrame(node,0);
    assert.equal(q.stopSec,51);assert.equal(q.releaseSec,19);
    assert.ok(q.hiddenSeconds>0,'one complete trip fits without wrapping a visible body');
    near(Math.abs(atStop.noseX-node.stopLineX),STREET_PILOT.noseClearanceM);
    assert.ok(node.direction>0?atStop.bounds.x1<STREET_PILOT.crossing.x0:
      atStop.bounds.x0>STREET_PILOT.crossing.x1);
  }
});

test('positions and speeds join continuously at brake, stop, release and wrap',()=>{
  for(const node of STREET_PILOT.vehicles){
    const q=streetPilotVehicleSchedule(node);
    for(const time of[0,19,q.approachStartSec+q.cruiseApproachSeconds,51,54,108]){
      const before=streetPilotVehicleFrame(node,time-1e-5),after=streetPilotVehicleFrame(node,time+1e-5);
      assert.ok(Math.abs(after.x-before.x)<.001,`position at${time}`);
      assert.ok(Math.abs(after.velocityMps-before.velocityMps)<.001,`speed at${time}`);
      assert.ok(Math.abs(after.odometerM-before.odometerM)<.001,`wheel travel at${time}`);
    }
    for(let time=q.approachStartSec+q.cruiseApproachSeconds+.1;time<50.9;time+=.2){
      const a=streetPilotVehicleFrame(node,time),b=streetPilotVehicleFrame(node,time+.01);
      near((b.velocityMps-a.velocityMps)/.01,-1,1e-6);
    }
  }
});

test('off-street recycle occurs with the whole envelope outside the playable road',()=>{
  for(const node of STREET_PILOT.vehicles){
    const q=streetPilotVehicleSchedule(node),before=streetPilotVehicleFrame(node,q.exitEndSec-1e-6);
    const after=streetPilotVehicleFrame(node,q.approachStartSec+1e-6);
    assert.equal(before.visible,false);assert.equal(after.visible,false);
    const out=frame=>frame.bounds.x1<STREET_PILOT.districtRoad.x0
      ||frame.bounds.x0>STREET_PILOT.districtRoad.x1;
    assert.ok(out(before)&&out(after));
    const hidden=streetPilotVehicleFrame(node,(q.exitEndSec+q.approachStartSec)/2);
    assert.equal(hidden.stage,'off-street');assert.equal(hidden.visible,false);
  }
});

test('matrix wheel centres are fixed to the body and rotation follows travelled distance',()=>{
  const frames=[streetPilotVehicleFrame('north-night-car',20),streetPilotVehicleFrame('north-night-car',21)];
  near(frames[1].wheelAngle-frames[0].wheelAngle,
    -(frames[1].odometerM-frames[0].odometerM)/STREET_PILOT.car.wheelRadiusM);
  const instances=streetPilotVehicleInstances({timeSec:21});
  const wheels=instances.filter(instance=>instance.mesh===STREET_PILOT_MESHES.carWheel);
  assert.equal(wheels.length,4);
  for(const wheel of wheels){
    near(wheel.matrix[12],wheel.x);near(wheel.matrix[13],wheel.y);near(wheel.matrix[14],wheel.z);
    assert.equal(wheel.matrix.length,16);assert.ok(wheel.matrix.every(Number.isFinite));
    for(const base of[0,4,8])near(Math.hypot(...wheel.matrix.slice(base,base+3)),1);
  }
  assert.ok(!instances.some(instance=>instance.wheelOf==='late-bus'),'retained bus has no duplicate baked wheels');
});

test('blackout submits no pedestrian lamp; red+amber submits both vehicle lamps',()=>{
  assert.equal(streetPilotStaticInstances().length,9);
  assert.equal(streetPilotSignalInstances({timeSec:8}).filter(i=>i.signalKind==='pedestrian').length,0);
  const redAmber=streetPilotSignalInstances({timeSec:18}).filter(i=>i.signalKind==='vehicle');
  assert.equal(redAmber.length,8);
  assert.deepEqual([...new Set(redAmber.map(i=>i.signalAspect))].sort(),['amber','red']);
  const green=streetPilotSignalInstances({timeSec:1});
  assert.equal(green.filter(i=>i.signalKind==='pedestrian'&&i.signalAspect==='green').length,2);
  assert.equal(new Set([...streetPilotStaticInstances(),...green].map(i=>i.id)).size,15);
  for(const time of[1,18,20,49])for(const lamp of streetPilotSignalInstances({timeSec:time})){
    assert.equal(lamp.emissive.length,4);assert.ok(lamp.emissive.every(Number.isFinite));
    near(lamp.emissive[3],{red:.65,green:.48,amber:.58}[lamp.signalAspect]);
    const post=[...STREET_PILOT.vehicleSignals,...STREET_PILOT.pedestrianSignals]
      .find(node=>lamp.id.startsWith(`street-pilot:${node.id}:`));
    near(lamp.y,streetPilotFloorAt(post.x,post.z)-.003);
  }
});

test('headlight pools attach to each actual vehicle nose and preserve the four-light ceiling',()=>{
  const lights=streetPilotHeadlightLights({timeSec:0,origin:{x:78,z:-7.5}});
  assert.equal(lights.length,4);
  for(const light of lights){
    const node=STREET_PILOT.vehicles.find(node=>light.headlightOf===`exterior-ambient:${node.id}`);
    const vehicle=streetPilotVehicleFrame(node,0),spec=STREET_PILOT[node.kind];
    const projected=(light.x-vehicle.x)*node.direction;
    assert.ok(projected>spec.bodyLengthM/2,'pool lies ahead of the model nose, including bus');
    near(Math.hypot(light.x-light.sourcePosition.x,light.z-light.sourcePosition.z),
      STREET_PILOT.headlight.projectionAheadM);
  }
  assert.equal(streetPilotHeadlightLights({timeSec:0,origin:{x:500,z:500}}).length,0);
  assert.equal(streetPilotHeadlightLights({timeSec:0,maxVehicles:1,origin:{x:78,z:-7.5}}).length,2);
});

test('clock freezes inactive time, bounds stalls and changes motion rate without phase jumps',()=>{
  const clock=createStreetPilotClock({timeSec:20});
  clock.advance(.1);near(clock.time(),20.1);
  clock.advance(50,{paused:true});clock.advance(50,{hidden:true});clock.advance(50,{enabled:false});
  near(clock.time(),20.1);
  clock.advance(.1,{reducedMotion:true});near(clock.time(),20.155);
  clock.advance(.1,{reducedMotion:false});near(clock.time(),20.255);
  clock.advance(60);near(clock.time(),20.505);near(clock.inspect().discardedSeconds,59.75);
  clock.reset(0);near(clock.time(),0);near(clock.inspect().discardedSeconds,0);
});

test('floor retains road/setts/footway section and drops only the crossing approach',()=>{
  near(streetPilotFloorAt(78,-7.5),0);
  near(streetPilotFloorAt(78,-3.5),.025);
  near(streetPilotFloorAt(90,-1),.12);
  near(streetPilotFloorAt(78,-2.499999),.025,1e-6);
  near(streetPilotFloorAt(78,-1),.12);
  assert.equal(streetPilotFloorAt(62,-7.5),null);
  assert.equal(streetPilotFloorAt(78,0),null);
  const ramp=[-2.49,-2.25,-2,-1.75,-1.5,-1.25,-1].map(z=>streetPilotFloorAt(78,z));
  assert.ok(ramp.every((value,index)=>index===0||value>=ramp[index-1]));
  assert.ok(ramp.every(value=>value>=.025&&value<=.12));
});

let planCompiled=false;
function compileActualPilotPlan(){
  if(planCompiled)return;
  FP.compile(conservatory.levels,{
    width:conservatory.width,height:conservatory.height,widenCorridors:conservatory.widenCorridors,
    connectors:conservatory.connectors,edgePortals:conservatory.edgePortals,doors:conservatory.doors,
  });
  const northParked=CONSERVATORY_PROPS.filter(prop=>prop.id.startsWith('district-north-car-'));
  PROPS.propsInit(FP,northParked);
  planCompiled=true;
}
const actualPoint=(x,z)=>FP.toRuntimePoint(districtLogicalAt(x,z),{center:false});

test('the production compiled crossing is open and walkable both ways with matching floor heights',()=>{
  compileActualPilotPlan();PROPS.setColliderGroupEnabled('street-pilot',true);
  try{
    for(const x of[77,78,79]){
      const path=[];
      for(let z=-16;z<=-1;z+=.5){
        const p=actualPoint(x,z);path.push(p);
        assert.equal(FP.isSolid(p.x,p.y),false,`solid crossing/passage at${x},${z}`);
        assert.equal(PROPS.propCanOccupy(p.x,p.y),true,`prop blocks crossing at${x},${z}`);
        const expected=streetPilotFloorAt(Math.floor(x),Math.floor(z));
        if(expected!==null)near(FP.floorAt(p.x,p.y),expected,1e-6);
      }
      for(let i=1;i<path.length;i++){
        const from=path[i-1],to=path[i];
        assert.equal(FP.canStep(from.x,from.y,to.x,to.y).ok,true,'normal approach across road');
        assert.equal(FP.canStep(to.x,to.y,from.x,from.y).ok,true,'ordinary retreat remains available');
      }
    }
  }finally{PROPS.setColliderGroupEnabled('street-pilot',false);}
});

test('actual north parked car bodies and padded collision envelopes clear the westbound lane',()=>{
  compileActualPilotPlan();
  const parked=PROPS.renderInstances({group:'ground',inscriptions:false})
    .filter(prop=>prop.id.startsWith('district-north-car-'));
  assert.equal(parked.length,3);
  const lane=STREET_PILOT.vehicles.find(node=>node.id==='north-night-car');
  for(const car of parked){
    near(car.z,-3.5);near(Math.abs(car.yaw),Math.PI/2);
    const halfStaticWidth=PROP_MESH[car.mesh].w/2+.2;
    const clearance=Math.abs(car.z-lane.laneZ)-halfStaticWidth-STREET_PILOT.car.envelopeWidthM/2;
    assert.ok(clearance>=.25,`${car.id} leaves only${clearance}m after padded envelopes`);
    assert.equal(PROPS.propCanOccupy(...Object.values(actualPoint(car.x,lane.laneZ))),true);
    assert.equal(PROPS.propCanOccupy(...Object.values(actualPoint(car.x,car.z))),false);
  }
});

test('optional pole colliders block only when their asset group is enabled',()=>{
  compileActualPilotPlan();
  const poles=PROPS.structuralColliders().filter(c=>c.colliderGroup==='street-pilot');
  assert.equal(poles.length,4);assert.equal(new Set(poles.map(c=>`${c.x},${c.y}`)).size,4);
  try{
    for(const pole of poles){
      const p=FP.toRuntimePoint({x:pole.x,y:pole.y},{center:false}),nearby=[];
      for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)nearby.push({x:p.x+dx,y:p.y+dy});
      PROPS.setColliderGroupEnabled('street-pilot',false);
      const wasFree=nearby.filter(p=>!FP.isSolid(p.x,p.y)&&PROPS.propCanOccupy(p.x,p.y));
      PROPS.setColliderGroupEnabled('street-pilot',true);
      const blocked=wasFree.filter(p=>!PROPS.propCanOccupy(p.x,p.y));
      assert.ok(blocked.length>0,`${pole.id} never blocks its physical grid cells`);
      assert.ok(blocked.every(p=>PROPS.tallBlockingPropAt(p.x,p.y)),`${pole.id} collision and cover disagree`);
      PROPS.setColliderGroupEnabled('street-pilot',false);
      assert.ok(blocked.every(p=>PROPS.propCanOccupy(p.x,p.y)&&!PROPS.tallBlockingPropAt(p.x,p.y)),
        'missing pack/baseline must not leave invisible pole collision or cover');
    }
  }finally{PROPS.setColliderGroupEnabled('street-pilot',false);}
});

test('supplying pilot time changes only the two north vehicles, preserving other route snapshots',()=>{
  const untouched=['south-night-car','west-night-car','cyclist','dog-walker'].map(id=>`exterior-ambient:${id}`);
  for(const timeSec of[0,12,38,59,97])for(const reducedMotion of[false,true]){
    const ordinary=exteriorAmbientSnapshot(timeSec,{reducedMotion});
    const pilot=exteriorAmbientSnapshot(timeSec,{reducedMotion,pilotTimeSec:21});
    for(const id of untouched)assert.deepEqual(pilot[id],ordinary[id],`${id} changed at${timeSec}`);
    const bodies=exteriorAmbientInstances({timeSec,reducedMotion,pilotTimeSec:21});
    assert.equal(bodies.filter(i=>i.mesh===STREET_PILOT_MESHES.carWheel).length,4);
    assert.equal(bodies.filter(i=>i.id==='exterior-ambient:north-night-car').length,1);
  }
});

function balancedEnd(source,start,open='{',close='}'){
  assert.equal(source[start],open);let depth=0,quote='',line=false,block=false;
  for(let i=start;i<source.length;i++){
    const ch=source[i],next=source[i+1];
    if(line){if(ch==='\n')line=false;continue;}
    if(block){if(ch==='*'&&next==='/'){block=false;i++;}continue;}
    if(quote){if(ch==='\\'){i++;continue;}if(ch===quote)quote='';continue;}
    if(ch==='/'&&next==='/'){line=true;i++;continue;}
    if(ch==='/'&&next==='*'){block=true;i++;continue;}
    if(ch==='\''||ch==='"'||ch==='`'){quote=ch;continue;}
    if(ch===open)depth++;else if(ch===close&&--depth===0)return i;
  }
  throw new Error('Production source block has no closing delimiter');
}

const mainSource=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const r3dSource=readFileSync(new URL('../src/render/r3d.js',import.meta.url),'utf8');
function timeHelperSource(){
  const start=mainSource.indexOf('function streetPilotTime('),body=mainSource.indexOf('{',start);
  assert.ok(start>=0);return mainSource.slice(start,balancedEnd(mainSource,body)+1);
}
function submissionSource(){
  const fn=mainSource.indexOf('function syncDoorDynamicProps(');
  const start=mainSource.indexOf('const exteriorVisible=',fn),endDeclaration=mainSource.indexOf(';',start)+1;
  const condition=mainSource.indexOf('if(exteriorVisible)',endDeclaration),body=mainSource.indexOf('{',condition);
  return mainSource.slice(start,endDeclaration)+mainSource.slice(condition,balancedEnd(mainSource,body)+1);
}
function lightingSource(){
  const fn=mainSource.indexOf('function syncArchitecturalLocalLights(');
  const start=mainSource.indexOf('const exteriorVisible=',fn),end=mainSource.indexOf('}):[];',start)+7;
  assert.ok(start>=0&&end>start);return mainSource.slice(start,end);
}

test('production main advances the protected clock and submits bodies, aspects and lights at one pilot time',()=>{
  const clock=createStreetPilotClock({timeSec:21}),calls={props:[],lights:[],colliders:[]};
  const advance=mainSource.match(/streetPilotClock\.advance\(dt,\{paused,[\s\S]*?\}\);/)?.[0];
  assert.ok(advance,'production simulation stopped advancing the dedicated clock');
  const collider=mainSource.match(/PROPS\.setColliderGroupEnabled\('street-pilot',streetPilotTime\(\)!==null\);/)?.[0];
  assert.ok(collider,'production collision lost optional-pack protection');
  const context={streetPilotClock:clock,streetPilotComparison:{condition:'final',timeSec:null},
    R3:{r3dStreetPilotReady:()=>true},document:{hidden:false,hasFocus:()=>true},
    dt:.1,paused:false,usingSpecialSpace:()=>false,shakeMode:()=> 'full',
    exteriorPeopleClock:71,crowdReady:false,exteriorAmbientPeopleInstances:v=>[v],
    getSave:()=>({settings:{shake:'full'}}),ZONE,CELL,zone:ZONE.street,logicalY:0,
    timeSec:71,context:{zone:ZONE.street},effectsMode:'full',physical:{x:78/CELL,z:-7.5/CELL},
    PROPS:{setColliderGroupEnabled:(group,on)=>calls.colliders.push([group,on])},
    exteriorAmbientInstances:args=>{calls.props.push(args);return exteriorAmbientInstances(args);},
    exteriorHeadlightLights:args=>{calls.lights.push(args);return exteriorHeadlightLights(args);},
    streetPilotStaticInstances,streetPilotSignalInstances,busGraffitiInstance};
  runInNewContext(advance,context);near(clock.time(),21.1);
  runInNewContext(`${timeHelperSource()};${collider};let count=0;const doorDynamicCombined=[];let submittedLights=[];
    {${submissionSource()}}{${lightingSource()};submittedLights=trafficLights;}
    globalThis.result={instances:doorDynamicCombined,lights:submittedLights};`,context);
  near(calls.props[0].pilotTimeSec,clock.time());near(calls.lights[0].pilotTimeSec,clock.time());
  assert.deepEqual(calls.colliders,[['street-pilot',true]]);
  assert.equal(context.result.instances.filter(i=>i.mesh===STREET_PILOT_MESHES.carWheel).length,4);
  assert.equal(context.result.lights.length,4);
  const body=context.result.instances.find(i=>i.id==='exterior-ambient:north-night-car');
  near(body.x,streetPilotVehicleFrame('north-night-car',clock.time()).x);
  const bus=context.result.instances.find(i=>i.mesh==='ambient_late_bus');
  const paint=context.result.instances.find(i=>i.paintOf===bus.id);
  assert.ok(paint);near(paint.x,bus.x);near(paint.z,bus.z);near(paint.yaw,bus.yaw);
  for(const lamp of streetPilotSignalInstances({timeSec:clock.time()}))
    assert.ok(context.result.instances.some(i=>i.id===lamp.id),'aspects use the body clock');
});

test('actual optional-pack loader rejection and main readiness gate retain legacy traffic without phantom poles',async()=>{
  const begin=r3dSource.indexOf("P3.addPropPack(assetUrl('assets/street-pilot.glb'))");
  const catchAt=r3dSource.indexOf('.catch(',begin),open=r3dSource.indexOf('(',catchAt);
  assert.ok(begin>=0&&catchAt>begin);
  const expression=r3dSource.slice(begin,balancedEnd(r3dSource,open,'(',')')+1);
  for(const accepted of[false,true]){
    const ready=await runInNewContext(`let streetPilotReady=false;(${expression}).then(()=>streetPilotReady);`,{
      P3:{addPropPack:()=>accepted?Promise.resolve():Promise.reject(new Error('missing optional asset'))},
      assetUrl:value=>value,console:{warn:()=>{}},
    });
    assert.equal(ready,accepted);
  }
  const clock=createStreetPilotClock({timeSec:21}),enabled=[];
  const context={streetPilotComparison:{condition:'final',timeSec:null},streetPilotClock:clock,
    exteriorPeopleClock:71,crowdReady:false,exteriorAmbientPeopleInstances:v=>[v],
    R3:{r3dStreetPilotReady:()=>false},ZONE,zone:ZONE.street,logicalY:0,timeSec:71,
    getSave:()=>({settings:{shake:'full'}}),exteriorAmbientInstances,
    streetPilotStaticInstances,streetPilotSignalInstances,busGraffitiInstance,
    PROPS:{setColliderGroupEnabled:(_group,on)=>enabled.push(on)}};
  const collider=mainSource.match(/PROPS\.setColliderGroupEnabled\('street-pilot',streetPilotTime\(\)!==null\);/)?.[0];
  runInNewContext(`${timeHelperSource()};${collider};let count=0;const doorDynamicCombined=[];
    ${submissionSource()};globalThis.result=doorDynamicCombined;`,context);
  assert.deepEqual(enabled,[false]);
  assert.ok(context.result.some(i=>i.mesh==='city_moving_car'&&i.id==='exterior-ambient:north-night-car'));
  assert.ok(context.result.some(i=>i.mesh==='ambient_bus_graffiti'));
  assert.ok(!context.result.some(i=>i.mesh.startsWith('street_pilot_')));
});
