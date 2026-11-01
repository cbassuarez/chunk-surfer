import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {freshDriveFirstStrike,normalizeDriveFirstStrike,driveFirstStrikeCourses,driveFirstStrikeColliders,driveFirstStrikeSafety,stepDriveFirstStrike,applyDriveFirstStrikeFrame} from '../src/game/source-drive/deadline.js';
import {createDrive,stepDrive} from '../src/game/source-drive/drive-state.js';
import {roadAt,worldAt,roadSurfaceAt} from '../src/game/source-drive/road.js';
import {roadBoundaryRecords,roadBoundaryColliders} from '../src/game/source-drive/route-boundaries.js';
import {driveBodyCorners,vehiclePoseIntersects} from '../src/game/source-drive/vehicle-contacts.js';
import {driveDoorCrossingFrame} from '../src/game/source-drive/door-crossing.js';
import {createSourceDriveSession,freshSourceDriveCheckpoint,normalizeSourceDriveCheckpoint} from '../src/game/source-drive-session.js';

const metrics=JSON.parse(await readFile(new URL('../public/assets/source-drive/geometry/metrics.json',import.meta.url)));
const returnPose={x:203,y:-1080,yaw:.3,pitch:0,facing:2,floorH:15.2};
const copy=value=>JSON.parse(JSON.stringify(value));
function car(distance=680,lateral=-1.35,extra={}){const p=worldAt(distance,lateral),s=createDrive();return Object.assign(s,{x:p.x,z:p.z,heading:p.heading,roadHeight:p.height,roadOffset:lateral,furthest:distance,paused:false},extra);}
function state(s){return freshDriveFirstStrike(s,{eventId:'night-deadline:drive-test'});}
async function flush(){for(let i=0;i<8;i++)await Promise.resolve();}
function fixture({distance=680,lateral=-1.35,checkpoint=null,pending=false}={}){
  const claims=[],complete=[],returns=[],frames=[],events=[],checkpoints=[];let isPending=pending,recording=false,playing=false,recordCalls=0,sealCalls=0,renderOkay=true;
  const cp=checkpoint||freshSourceDriveCheckpoint({runId:'drive-test',returnPose});
  if(!checkpoint){cp.status='active';cp.started=true;Object.assign(cp.drive,car(distance,lateral));}
  const tape={status:()=>({recording,playing}),checkpoint:()=>({pending:recording?{takeId:'prior-take',state:'recording'}:null}),
    setPaused(){},tick(){},record(){recordCalls++;recording=true;},seal(){sealCalls++;recording=false;return{id:'prior-take',durable:true};},stopPlayback(){playing=false;},dispose(){}};
  const acoustics={initialize(){},cabin:{},setPaused(){},sync(){},level:()=>0,click(){},joint(){},dispose(){}};
  const renderer={initialize:async()=>true,ready:()=>true,render(frame){frames.push(frame);return renderOkay;},dispose(){}};
  const session=createSourceDriveSession({entry:'review',metrics,checkpoint:cp,returnPose,runId:'drive-test',recording:tape,acoustics,renderer,
    getDeadlinePending:()=>isPending?{phase:'pending',eventId:'night-deadline:drive-test'}:null,
    onDeadlineClaim:value=>{claims.push(copy(value));return true;},onDeadlineComplete:value=>{complete.push(value);return true;},
    onDeadlineFrame:(frame,p)=>events.push(...p.events),onReturned:value=>returns.push(value),onCheckpoint:(value,why)=>checkpoints.push({value,why})});
  return{session,claims,complete,returns,frames,events,checkpoints,tape,renderer,
    pending:value=>{isPending=value;},recording:value=>{recording=value;},playing:value=>{playing=value;},renderOkay:value=>{renderOkay=value;},
    calls:()=>({recordCalls,sealCalls}),async start(){await session.initialize();session.render();await session.start();},
    async claim(){isPending=true;session.update(.01);await flush();assert.ok(session.firstStrikeStatus());}};
}

test('the drive failure retains its existing road/car pose, finite location, known courses and meaningful safe edge',()=>{
  const s=car(),f=state(s);assert.equal(f.origin.x,s.x);assert.equal(f.origin.z,s.z);assert.equal(f.origin.speed,s.speed);assert.equal(f.safeSide,-1);
  assert.ok(f.courses.length>20&&f.courses.length<=44);assert.ok(f.courses.every(id=>id.startsWith('route-edge-right-')));
  assert.equal('newRoad'in f,false);assert.equal(f.elapsed,0);assert.equal(driveFirstStrikeSafety(f,s).safe,false,'stationary centre-lane cab is not a safety condition');
});

test('each moved native roadside course has exactly the same transformed bounds as its vehicle collider',()=>{
  const f={...state(car()),elapsed:32},original=new Map(roadBoundaryRecords(f.start,f.end).map(row=>[row.id,row]));
  for(const course of driveFirstStrikeCourses(f)){
    assert.ok(['cut_guardrail','drive_retaining_wall'].includes(course.mesh));assert.ok(course.settle>.8);
    const b=original.get(course.id).localBounds,m=course.matrix,c=course.collider,co=Math.cos(c.yaw),si=Math.sin(c.yaw);
    for(const x of[b.min[0],b.max[0]])for(const y of[b.min[1],b.max[1]])for(const z of[b.min[2],b.max[2]]){
      const px=m[0]*x+m[4]*y+m[8]*z+m[12]-32,pz=m[2]*x+m[6]*y+m[10]*z+m[14]-32,
        lx=(px-c.x)*co+(pz-c.z)*si,lz=-(px-c.x)*si+(pz-c.z)*co;
      assert.ok(Math.abs(lx)<=c.halfX+1e-7);assert.ok(Math.abs(lz)<=c.halfZ+1e-7);
    }
  }
  const ordinary=roadBoundaryColliders(680),solids=driveFirstStrikeColliders(f,ordinary);
  assert.equal(new Set(solids.map(s=>s.id)).size,solids.length,'old unshifted collider is replaced, not kept beside its moving mesh');
  assert.ok(ordinary.filter(s=>s.id.startsWith('route-edge-left')).every(s=>solids.includes(s)),'the real clear side remains in place');
});

test('a car touching the moving bank keeps continuous physical contact and never clips a newly rendered course or teleports',()=>{
  const s=car(680,2.7);let f=state(car());
  for(let i=0;i<42*40;i++){
    const dt=.025,before={x:s.x,z:s.z},next={...f,elapsed:Math.min(42,f.elapsed+dt)},solids=driveFirstStrikeColliders(next,roadBoundaryColliders(680));
    stepDrive(s,dt,{},solids);f=stepDriveFirstStrike(f,s,{dt}).state;
    assert.ok(Math.hypot(s.x-before.x,s.z-before.z)<.2,'mass contact remains continuous rather than a pose reset');
    assert.equal(driveFirstStrikeCourses(f).some(course=>vehiclePoseIntersects(s,course.collider)),false,'the accepted body clears this same visible geometry');
  }
});

test('visible course transformations replace the same native instances without adding a generic road, prop flood or moved cabin',()=>{
  const f={...state(car()),elapsed:20},courses=driveFirstStrikeCourses(f),cabin={id:'drive_cabin',matrix:Array(16).fill(0)},
    props=[cabin,...roadBoundaryRecords(f.start,f.end).map(row=>({id:row.id,mesh:row.mesh,matrix:row.matrix}))],frame={scene:{props,colliders:roadBoundaryColliders(680)},weather:{fog:.1,extinction:0},props};
  applyDriveFirstStrikeFrame(frame,f);assert.equal(frame.props.length,props.length);assert.equal(frame.props[0],cabin);
  for(const course of courses)assert.deepEqual(frame.props.find(p=>p.id===course.id).matrix,course.matrix);
  assert.ok(frame.weather.fog>.1);assert.equal(frame.firstStrike.courseCount,courses.length);
});

test('survival requires the complete supported van on the real shoulder with a deliberate stopped dwell, not a centre-lane brake or timer',()=>{
  for(const safe of [false,true]){
    const road=roadAt(680),s=car(680,safe?-(road.leftWidth+.02):-1.35),f=state(car());let v=f;
    assert.equal(driveFirstStrikeSafety(f,s).safe,safe);assert.equal(driveBodyCorners(s).length,4);
    for(let i=0;i<168;i++)v=stepDriveFirstStrike(v,s,{dt:.25}).state;
    assert.equal(v.outcome,safe?'survived':'enclosed');assert.equal(v.elapsed,42);assert.equal('injuries'in v,false);
  }
  const moving=car(680,-(roadAt(680).leftWidth+.02),{speed:3});assert.equal(driveFirstStrikeSafety(state(car()),moving).safe,false);
});

test('driving clear of the actual failed span is another body-safe choice, and genuine whole-door crossing can finish a failed drive',()=>{
  const f=state(car()),escaped=car(f.end+12,-1.35);assert.deepEqual(driveFirstStrikeSafety(f,escaped),{safe:true,kind:'clear-span'});
  const door=car(1231.5,-1.35),crossing=driveDoorCrossingFrame(door);assert.equal(crossing.complete,true);
  const result=stepDriveFirstStrike(state(car(1190)),door,{dt:.1,doorCrossing:crossing});assert.equal(result.state.outcome,'survived');assert.equal(result.state.safeReached,'goods-door');
});

test('pause/protected capture freezes destruction/effects; reload preserves course receipts and no prior strike repeats',()=>{
  const s=car();let f=state(s);for(let i=0;i<12;i++)f=stepDriveFirstStrike(f,s,{dt:.25}).state;
  assert.deepEqual(stepDriveFirstStrike(f,s,{dt:100,protected:true}),{state:f,events:[]});
  const restored=normalizeDriveFirstStrike(copy(f));assert.deepEqual(restored,f);assert.equal(stepDriveFirstStrike(restored,s,{dt:.1}).events.length,0);
});

test('a pending deadline does not interrupt an actual open field take or playback, and starts only after its existing owner seals',async()=>{
  const f=fixture();await f.start();f.pending(true);f.recording(true);
  for(let i=0;i<12;i++)f.session.update(.1);await flush();assert.equal(f.claims.length,0);assert.equal(f.calls().sealCalls,0);
  await f.session.stop();await f.claim();assert.equal(f.claims.length,1);assert.equal(f.calls().sealCalls,1);assert.equal(f.calls().recordCalls,0);
  assert.ok(f.claims[0].checkpoint.firstStrike);assert.equal(f.claims[0].sceneCheckpoint.kind,'drive');await f.session.dispose();
});

test('the saved claim precedes physical changes while the existing already-moving car keeps steering/pedals and momentum',async()=>{
  const f=fixture();await f.start();f.session.input('forward');for(let i=0;i<20;i++)f.session.update(.1);
  const before=f.session.status().state;assert.ok(before.speed>1);await f.claim();const claimed=f.session.status().state;
  assert.ok(claimed.speed>before.speed-.5);assert.ok(Math.hypot(claimed.x-before.x,claimed.z-before.z)<2);
  assert.equal(f.session.firstStrikeStatus().elapsed,0);f.session.input('left');f.session.update(.1);
  assert.notEqual(f.session.status().state.wheelAngle,claimed.wheelAngle);assert.ok(f.session.status().state.speed>0);
  assert.ok(f.claims[0].checkpoint.drive.speed>0);await f.session.dispose();
});

test('the live drive failure is finite and host finalization requires a successful actual final frame, exactly once',async()=>{
  const f=fixture();await f.start();await f.claim();
  for(let i=0;i<168;i++)f.session.update(.25);assert.equal(f.session.firstStrikeStatus().outcome,'enclosed');assert.equal(f.complete.length,0);
  f.renderOkay(false);assert.equal(f.session.render(),false);await flush();assert.equal(f.complete.length,0);
  f.renderOkay(true);f.session.render();await flush();assert.equal(f.complete.length,0,'a paused recovered picture is not an active terminal receipt');
  await f.session.resumeWhenPresented(0);f.session.render();await flush();assert.equal(f.complete.length,1);assert.equal(f.complete[0].rendered,true);
  assert.equal(f.complete[0].outcome,'enclosed');assert.equal(f.complete[0].checkpoint.firstStrike.elapsed,42);
  f.session.render();await flush();assert.equal(f.complete.length,1);assert.equal(f.returns.length,0);await f.session.dispose();
});

test('a drive-failure checkpoint preserves real moving continuity, controls and clocks across focus/reload',async()=>{
  const f=fixture();await f.start();f.session.input('forward');for(let i=0;i<15;i++)f.session.update(.1);await f.claim();f.session.update(.2);
  const original=f.session.serialize();assert.ok(original.drive.speed>0);const saved=normalizeSourceDriveCheckpoint(copy(original));
  assert.equal(saved.drive.speed,original.drive.speed);assert.equal(saved.firstStrike.elapsed,original.firstStrike.elapsed);
  await f.session.pause();const before=f.session.serialize();for(let i=0;i<10;i++)f.session.update(.25);assert.deepEqual(f.session.serialize().firstStrike,before.firstStrike);
  await f.session.dispose();const g=fixture({checkpoint:saved,pending:true});await g.start();assert.equal(g.session.firstStrikeStatus().elapsed,saved.firstStrike.elapsed);
  const throttle=g.session.status().state.throttle;g.session.update(.1);assert.ok(g.session.status().state.throttle<=throttle,'no inherited held pedal');await g.session.dispose();
});

test('new drive transport starts are denied after pending, and the current physical driven-door commitment retains its handoff',async()=>{
  const f=fixture({distance:1222,pending:true});await f.start();
  await assert.rejects(f.session.record(),e=>e.code==='NIGHT_EXPIRED');await assert.rejects(f.session.play(),e=>e.code==='NIGHT_EXPIRED');
  assert.equal(f.calls().recordCalls,0);f.session.input('forward');
  for(let i=0;i<120&&!f.returns.length;i++){f.session.update(.1);await flush();}
  assert.equal(f.claims.length,0);assert.equal(f.returns.length,1);assert.equal(f.returns[0].crossing.kind,'driven-door');assert.equal(f.complete.length,0);await f.session.dispose();
});

test('an already-claimed failure can physically drive the entire goods doorway and finalize once as survived failure without an ordinary onward return',async()=>{
  // Staged on the real straight approach before its opening trigger. This
  // verifies the whole-body threshold adapter, not an earned full-route drive.
  const f=fixture({distance:1208});await f.start();assert.equal(driveDoorCrossingFrame(f.session.status().state).phase,'approach');
  await f.claim();f.session.input('forward');
  for(let i=0;i<180&&!f.session.firstStrikeStatus().outcome;i++){f.session.update(.1);await flush();}
  assert.equal(f.session.firstStrikeStatus().safeReached,'goods-door');assert.equal(f.session.firstStrikeStatus().outcome,'survived');assert.equal(f.returns.length,0);
  f.session.render();await flush();assert.equal(f.complete.length,1);assert.equal(f.complete[0].outcome,'survived');await f.session.dispose();
});
