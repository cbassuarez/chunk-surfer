import test from 'node:test';
import assert from 'node:assert/strict';
import {SOURCE_CONNECTOR_CORRIDOR as C,SOURCE_CONNECTOR_REVIEW_STATES as FIX,
  corridorParts,corridorCabinetBox,corridorDecorProgress} from '../src/data/source-connector-corridor.js';
import {freshSourceConnectorCorridor,normalizeSourceConnectorCorridor,advanceSourceConnectorCorridor} from '../src/game/source-connector-corridor.js';
import {freshSourceContinuation,normalizeSourceContinuation,stepSourceContinuation,sourceContinuationCanOccupy,sourceContinuationRecoveryPlan} from '../src/game/source-continuation.js';
import {SOURCE_CONTINUATION as WORLD,continuationChartSolids,continuationSupportAt} from '../src/data/source-continuation.js';
import {freshContinuationHush,advanceContinuationHush,continuationWalkSegment,continuationSupportedPath} from '../src/game/source-continuation-hush.js';
import {continuationFreeBody} from '../src/game/source-continuation-physics.js';
import {sourceConnectorGeometryLibrary,sourceConnectorRenderParts} from '../src/render/source-connector-corridor.js';
import {sourceContinuationRenderFrame} from '../src/render/source-continuation-renderer.js';
import {JOURNEY_PORTALS,JOURNEY_SURFACES} from '../src/data/source-continuation-journey.js';

const point=(x,z)=>({x,z,feet:8.4,chartId:4,phase:'wrong-return',level:0});
function state(at=point(-146,-65)){
  const s=freshSourceContinuation();Object.assign(s,at,{status:'active',yaw:0,pitch:0,lastSafe:{...at},recoveryAnchor:{...point(-165,-58),kind:'landing',supportId:'journey-receiving-3-1',earnedAt:0}});
  s.hush.active=false;s.hush.arrival=null;return s;
}
function run(s,seconds,input={}){for(let i=0;i<Math.round(seconds*120);i++)s=stepSourceContinuation(s,{dt:1/120,...input}).state;return s;}
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);

test('the later echo retains the actual31m support, gate and reciprocal Catch destination',()=>{
  const floor=JOURNEY_SURFACES.find(s=>s.id==='journey-final-reach-2');
  assert.equal(floor.minX,C.floorMinX);assert.equal(floor.maxX,C.floorMaxX);assert.equal(C.length,31);
  assert.equal(floor.y,C.feet);assert.equal(JOURNEY_PORTALS.find(p=>p.id==='catch-closure').toChart,0);
  for(const fixture of Object.values(FIX)){
    near(corridorDecorProgress(0,fixture),0);near(corridorDecorProgress(31,fixture),31);
    let previous=-Infinity;for(let s=0;s<=31;s+=.1){const p=corridorDecorProgress(s,fixture);assert.ok(p>previous);previous=p;}
  }
});

test('chart4 arrival and side routes cannot trigger an offscreen hallway event',()=>{
  for(const at of[point(-165,-64),point(-160,-61),point(-150,-75),point(-146,-55),point(-146,-98)]){
    let v=freshSourceConnectorCorridor();const events=[];
    for(let n=0;n<600;n++)v=advanceSourceConnectorCorridor(v,{dt:1/120,player:at,events});
    assert.equal(v.phase,'dormant');assert.equal(v.strainStarted,false);assert.deepEqual(events,[]);
  }
});

test('the finite strain completes once without altering body distance, floor or control state',()=>{
  let s=state(point(-146,-65));const start={x:s.x,z:s.z,feet:s.feet};s=run(s,4.5);
  assert.equal(s.corridor.strainElapsed,3.6);assert.equal(s.corridor.phase,'dormant');
  assert.deepEqual({x:s.x,z:s.z,feet:s.feet},start);assert.equal(s.recovery,null);assert.equal(s.fall,null);
  const before=structuredClone(s.corridor);s=run(s,4);assert.deepEqual(s.corridor,before);
  const paused=stepSourceContinuation(s,{dt:.25,forward:1,paused:true}).state;
  assert.deepEqual(paused.corridor,s.corridor);near(paused.elapsed,s.elapsed);
  const delayed=stepSourceContinuation(s,{dt:.25,forward:1,renderReady:false}).state;assert.deepEqual(delayed.corridor,s.corridor);
});

test('the real obstruction leaves a continuous1.1m supported bypass and stops the central walking line',()=>{
  let s=state(point(-146,-68.1));s=run(s,2.5);
  assert.equal(s.corridor.phase,'settled');assert.equal(C.bypass.width,1.1);
  const box=corridorCabinetBox(s.corridor);near(box.minY,8.4);
  assert.equal(sourceContinuationCanOccupy(-146,-77,s),false);
  for(let z=-75.8;z>=-78.2;z-=.025){
    assert.ok(continuationSupportAt(C.bypass.centerX,z,s));
    assert.equal(continuationFreeBody({...point(C.bypass.centerX,z)},s,{radius:WORLD.hush.radius}),true);
  }
  Object.assign(s,point(-146,-75));s=run(s,1,{forward:1});assert.ok(s.z>-76.5,'a held W crossed the cabinet');
  s=run(s,.18,{side:1});s=run(s,1.2,{forward:1});assert.ok(s.z<-78.2,'ordinary sidestep and walk did not use the visible bypass');
});

test('a downward physical sweep holds above BOTH live bodies and resumes when they clear',()=>{
  for(const who of['player','hush']){
    let v={...FIX.lowering,elapsed:.35,strainElapsed:3.6},body={...point(-146.55,-77),active:true},other=point(-146,-72);
    const options=who==='player'?{player:body,hush:null}:{player:other,hush:body};
    let held=false;
    for(let i=0;i<100;i++){v=advanceSourceConnectorCorridor(v,{dt:1/120,...options});if(v.blockedBy===who){held=true;break;}}
    assert.equal(held,true,who);assert.ok(corridorCabinetBox(v).minY>body.feet+WORLD.bodyHeight);
    const frozen=advanceSourceConnectorCorridor(v,{dt:.25,...options,frozen:true});assert.deepEqual(frozen,v);
    for(let i=0;i<160;i++)v=advanceSourceConnectorCorridor(v,{dt:1/120,player:other,hush:null});
    assert.equal(v.phase,'settled');
  }
});

test('old already-past checkpoints keep progress and leave the new cabinet raised to one side',()=>{
  for(const at of[point(-146,-81),{...point(-160,-92),chartId:0,phase:'catch'}]){
    const s=state(at);delete s.corridor;const n=normalizeSourceContinuation(s);
    assert.equal(n.corridor.legacyPassed,true);assert.equal(n.corridor.phase,'settled');
    const b=corridorCabinetBox(n.corridor);assert.ok(b.maxX<C.floorMinX);assert.equal(b.minY,C.raisedBottom);
    near(n.x,s.x);near(n.z,s.z);near(n.feet,s.feet);
  }
});

test('a fresh actual jump landing beyond the obstruction spends it without trapping the following recorded jump',()=>{
  let s=state(point(-146,-76));
  s.hush={...freshContinuationHush(point(-146,-72)),active:true,armed:true,mode:'follow',warningAnnounced:true,elapsed:100,
    trail:[{kind:'walk',...point(-146,-76)}],lastRecorded:point(-146,-76)};
  const events=[];let jumped=false,landed=false,hushLanded=false;
  for(let i=0;i<700&&!hushLanded;i++){
    const result=stepSourceContinuation(s,{dt:1/120,jump:i===0,forward:!landed?1:0});s=result.state;events.push(...result.events);
    jumped ||= !!s.fall;
    if(result.events.some(e=>e.type==='land'))landed=true;
    hushLanded=result.events.some(e=>e.type==='hush-land'&&e.trigger==='jump'&&e.position.z<-78);
  }
  assert.equal(jumped,true);assert.equal(landed,true);assert.equal(s.corridor.legacyPassed,true);
  assert.ok(events.some(e=>e.type==='corridor-passed'));assert.equal(hushLanded,true,'Hush did not replay the accepted airborne crossing');
  assert.ok(corridorCabinetBox(s.corridor).maxX<C.floorMinX);
});

test('the old straight trail and cached graph are revalidated; Hush walks the same actual bypass',()=>{
  const world={...point(-146,-80),elapsed:100,doorOpen:{},doorMotion:{},corridor:{...FIX.settled}};
  continuationSupportedPath(point(-165,-58),point(-148,-92),{...world,corridor:{...FIX.approach}});
  const actor={...freshContinuationHush(point(-146,-74.5)),active:true,armed:true,warningAnnounced:true,mode:'follow',elapsed:100,
    trail:[{kind:'walk',...point(-146,-80)}],lastRecorded:point(-146,-80)},events=[];
  let bypass=false;
  for(let i=0;i<400&&actor.trail.length;i++){
    const before={x:actor.x,z:actor.z};advanceContinuationHush(actor,{dt:1/120,player:world,events});
    assert.ok(Math.hypot(actor.x-before.x,actor.z-before.z)<=WORLD.hush.speed/120+1e-7,'Hush was relocated');
    assert.equal(continuationFreeBody(actor,world,{radius:WORLD.hush.radius}),true,'Hush phased through the actual solid');
    bypass ||= actor.x> -145.74&&actor.z<-76.7&&actor.z>-77.3;
  }
  assert.equal(bypass,true);near(actor.z,-80);assert.equal(actor.trail.length,0);
  assert.equal(events.filter(e=>e.type==='hush-route-repair').length,1);
});

test('the earned pre-obstruction anchor restores a safe centre and recovery routes around the same settled cabinet',()=>{
  let s=state(point(-145.8,-70.8));s.corridor={...FIX.settled};s=run(s,.02);
  near(s.recoveryAnchor.x,-146);near(s.recoveryAnchor.z,-71);
  Object.assign(s,point(-146,-80));const recovery=sourceContinuationRecoveryPlan(s,'hush-pressure');
  assert.equal(recovery.kind,'guided-return');assert.ok(recovery.path.length>=3);
  for(let i=1;i<recovery.path.length;i++)assert.equal(continuationWalkSegment(recovery.path[i-1],recovery.path[i],null,s),true);
  s.recovery=recovery;let recovered=false;
  for(let i=0;i<1440&&!recovered;i++){const r=stepSourceContinuation(s,{dt:1/120});s=r.state;recovered=r.events.some(e=>e.type==='recovered');}
  assert.equal(recovered,true);near(s.x,-146);near(s.z,-71);near(s.grace,3);
  assert.equal(s.corridor.phase,'settled');assert.equal(sourceContinuationCanOccupy(C.bypass.centerX,-77,s),true);
});

test('open side step-offs remain ordinary ballistic releases from an arbitrary corridor position',()=>{
  let s=state(point(-145.02,-74.3));s.corridor={...FIX.settled};s=run(s,.12,{side:1});
  assert.ok(s.fall);assert.equal(s.fall.trigger,'step-off');assert.ok(s.hush.trail.some(p=>p.kind==='drop'));
});

test('the actual render submission and every physical corridor part have matching box transforms',()=>{
  const meshes=sourceConnectorGeometryLibrary();assert.equal(Object.keys(meshes).length,3);
  for(const fixture of Object.values(FIX)){
    const s=state();s.corridor={...fixture};const rows=corridorParts(s),parts=sourceConnectorRenderParts(s),frame=sourceContinuationRenderFrame(s);
    const actual=frame.canonicalProps.filter(p=>p.connector&&p.chartId===4);
    assert.equal(parts.length,rows.length);assert.equal(actual.length,rows.length);
    assert.ok(frame.props.some(p=>p.connector),'the real visible submission must retain corridor geometry');
    for(const row of rows){
      const a=parts.find(p=>p.id===row.id),rendered=actual.find(p=>p.descriptorId===row.id);assert.ok(rendered,row.id);
      assert.deepEqual(a.physicalBounds,{min:[row.minX,row.minY,row.minZ],max:[row.maxX,row.maxY,row.maxZ]});
      const gpuNear=(x,y)=>assert.ok(Math.abs(x-y)<.00003,'GPU float32 transform drift');
      gpuNear(rendered.matrix[12],a.x);gpuNear(rendered.matrix[13],a.y);gpuNear(rendered.matrix[14],a.z);
      gpuNear(rendered.matrix[0],row.maxX-row.minX);gpuNear(rendered.matrix[5],row.maxY-row.minY);gpuNear(rendered.matrix[10],row.maxZ-row.minZ);
      assert.ok(continuationChartSolids(s).some(p=>p.id===row.id));
    }
  }
});

test('the original chart4 approach enters the open west bay with both actual bodies before turning down the corridor',()=>{
  let s=state(point(-160,-61));s.grace=30;
  s.hush={...freshContinuationHush(point(-163,-61)),active:true,armed:true,warningAnnounced:true,mode:'follow',elapsed:100,
    trail:[{kind:'walk',...point(-160,-61)}],lastRecorded:point(-160,-61)};
  const before=corridorParts(s);for(const id of ['west-post-0','west-rail-0','west-capital-0','west-wainscot-0','west-shelf-0','west-cornice-0'])assert.equal(before.some(p=>p.id==='journey-corridor-'+id),false);
  assert.ok(before.some(p=>p.id==='journey-corridor-east-post-0'));assert.ok(before.some(p=>p.id==='journey-corridor-roof-rib-0'));
  let crossedWest=false,hushCrossedWest=false;
  for(const target of [point(-146,-61),point(-146,-66)]){
    let ticks=0;
    while(Math.hypot(s.x-target.x,s.z-target.z)>.03&&ticks++<900){
      const dx=target.x-s.x,dz=target.z-s.z,result=stepSourceContinuation(s,{dt:1/120,side:Math.abs(dx)>.025?Math.sign(dx):0,forward:Math.abs(dz)>.025?-Math.sign(dz):0});s=result.state;
      assert.equal(s.fall,null,'retained approach lost its support');assert.equal(s.recovery,null,'retained approach caused a capture');
      assert.equal(continuationFreeBody(s,s),true,'player collided with new side-entry stock');
      assert.equal(continuationFreeBody(s.hush,s,{radius:WORLD.hush.radius}),true,'Hush phased through new side-entry stock');
      crossedWest ||= s.x>-148&&Math.abs(s.z+61)<.2;
      hushCrossedWest ||= s.hush.x>-148&&Math.abs(s.hush.z+61)<.2;
    }
    assert.ok(ticks<900,'an existing straight approach segment became blocked');
  }
  assert.equal(crossedWest,true);assert.equal(hushCrossedWest,true);assert.ok(s.hush.x>-146.3);assert.ok(s.hush.z<-61);
  assert.equal(s.corridor.strainStarted,true);assert.equal(s.corridor.phase,'dormant','mechanism has not yet reached its warning trigger');
});
